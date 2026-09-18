// FA-SIG-10 (Phase 1, siehe core/README.md "Belastungsgekoppelter Signaturverlauf"):
// belastungsgekoppelter Signaturverlauf zwischen Breakthroughs, Kap. 7.7. Je Energiesystem
// s in {cp, wPrime, pMax} laeuft ein eigenes Impulse-Response-Modell auf der taeglichen
// Belastung (Strain Score, Kap. 7.6 - bereits in activityResults[].strain vorhanden, siehe
// strain.js: low=CP-Anteil, high=W'-Anteil, peak=Pmax-Anteil).
//
// Phase 1 (M4-Festlegung, siehe core/README.md): nur k1,s wird per Least-Squares gegen die
// eigenen bestaetigten Breakthroughs geschaetzt, tau1,s bleibt auf dem Literatur-Startwert
// (42 Tage), k2,s fest auf 1. Die volle tau1,s-Suche + Hold-out-Backtesting (FA-SIG-12) ist
// eine spaetere Ausbaustufe (core/README.md).

import { signatureAtDate } from './signature.js';

const SYSTEMS = ['cp', 'wPrime', 'pMax'];
const STRAIN_FIELD = { cp: 'low', wPrime: 'high', pMax: 'peak' };

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function allDatesBetween(startDate, endDate) {
  const dates = [];
  let cur = startDate;
  while (cur <= endDate) {
    dates.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return dates;
}

/**
 * Taegliche Belastung w_s(t) je System = Summe der Strain-Sub-Scores aller Aktivitaeten
 * dieses Kalendertags (Kap. 7.7: w_s(t) = Sum SS_s des Tages).
 * @param {Array<{date:string, strain?:{low:number,high:number,peak:number}}>} activityResults
 * @returns {Object<string, {cp:number, wPrime:number, pMax:number}>}
 */
export function dailyStrainSums(activityResults) {
  const sums = {};
  for (const r of activityResults || []) {
    if (!r.strain || !r.date) continue;
    if (!sums[r.date]) sums[r.date] = { cp: 0, wPrime: 0, pMax: 0 };
    sums[r.date].cp += r.strain[STRAIN_FIELD.cp] || 0;
    sums[r.date].wPrime += r.strain[STRAIN_FIELD.wPrime] || 0;
    sums[r.date].pMax += r.strain[STRAIN_FIELD.pMax] || 0;
  }
  return sums;
}

/**
 * Taeglicher g/h/p-Verlauf je System (Kap. 7.7, EXAKTE Exponentialform - bewusst nicht die
 * lineare `value += (v-value)/tau`-Naeherung aus npTss.js#computeEwmaSeries, siehe
 * core/README.md fuer die Begruendung). g/h werden am Tag eines NICHT verworfenen
 * Breakthroughs auf 0 zurueckgesetzt (M4-Festlegung: die im Refit bereits eingepreiste
 * Verbesserung soll nicht nochmal on top addiert werden), danach laeuft dieser Tag ganz
 * normal (inkl. seiner eigenen Belastung) weiter.
 * @param {Object<string, {cp:number, wPrime:number, pMax:number}>} sums - dailyStrainSums()
 * @param {Array<{date:string, discarded:boolean}>} breakthroughs
 * @param {import('./types.js').ModelSettings} settings
 * @returns {Array<{date:string, cp:{g:number,h:number,p:number}, wPrime:{...}, pMax:{...}}>}
 */
export function loadResponseSeries(sums, breakthroughs, settings) {
  const dates = Object.keys(sums).sort();
  if (dates.length === 0) return [];
  const allDates = allDatesBetween(dates[0], dates[dates.length - 1]);
  const resetDates = new Set((breakthroughs || []).filter((b) => !b.discarded).map((b) => b.date));

  const decay1 = Math.exp(-1 / settings.loadResponseTau1Days);
  const decay2 = Math.exp(-1 / settings.loadResponseTau2Days);
  const k2 = 1; // M4-Festlegung: kein Literaturwert vorhanden, siehe core/README.md

  const state = {};
  for (const s of SYSTEMS) state[s] = { g: 0, h: 0 };

  const series = [];
  for (const date of allDates) {
    if (resetDates.has(date)) {
      for (const s of SYSTEMS) state[s] = { g: 0, h: 0 };
    }
    const daily = sums[date] || { cp: 0, wPrime: 0, pMax: 0 };
    const entry = { date };
    for (const s of SYSTEMS) {
      const w = daily[s] || 0;
      const st = state[s];
      st.g = st.g * decay1 + w * (1 - decay1);
      st.h = st.h * decay2 + w * (1 - decay2);
      entry[s] = { g: st.g, h: st.h, p: st.g - k2 * st.h };
    }
    series.push(entry);
  }
  return series;
}

function breakthroughDelta(bt, system) {
  const key = system === 'wPrime' ? 'wPrimeJ' : system;
  if (!bt.previousSignature || !bt.proposedSignature) return null;
  return bt.proposedSignature[key] - bt.previousSignature[key];
}

/**
 * Phase-1-Kalibrierung (M4-Festlegung, siehe core/README.md): k1,s je System per
 * Least-Squares-durch-den-Ursprung gegen die tatsaechlich bestaetigten Breakthrough-Deltas,
 * ausgewertet mit dem akkumulierten p_s am Tag VOR dem Breakthrough (dem Stand unmittelbar
 * vor dem Reset). Unterhalb `loadResponseMinBreakthroughsForFit` bleibt k1,s beim
 * literaturfreien Neutralwert 1 (Kap. 7.8: "unterhalb einer Mindestanzahl an Breakthroughs
 * werden Literaturwerte genutzt" - hier gibt es dafuer keine, siehe core/README.md).
 * @param {ReturnType<typeof loadResponseSeries>} series
 * @param {Array} breakthroughs
 * @param {import('./types.js').ModelSettings} settings
 * @returns {Object<string, {k1:number, fitted:boolean, supportCount:number}>}
 */
export function calibrateK1(series, breakthroughs, settings) {
  const byDate = new Map(series.map((e) => [e.date, e]));
  const result = {};

  for (const s of SYSTEMS) {
    const xs = [];
    const ys = [];
    for (const bt of breakthroughs || []) {
      if (bt.discarded) continue;
      const prevEntry = byDate.get(addDaysISO(bt.date, -1));
      if (!prevEntry) continue;
      const delta = breakthroughDelta(bt, s);
      if (delta == null) continue;
      xs.push(prevEntry[s].p);
      ys.push(delta);
    }

    if (xs.length < settings.loadResponseMinBreakthroughsForFit) {
      result[s] = { k1: 1, fitted: false, supportCount: xs.length };
      continue;
    }

    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += xs[i] * ys[i];
      sxx += xs[i] * xs[i];
    }
    result[s] = { k1: sxx > 0 ? sxy / sxx : 1, fitted: sxx > 0, supportCount: xs.length };
  }

  return result;
}

/**
 * Geglaettete "Anzeige-Signatur" an einem Datum: die zu diesem Datum gueltige
 * Breakthrough-Signatur (signatureAtDate, unveraendert) plus der belastungsgekoppelte
 * Trend seitdem, abzueglich des Anzeige-Abschlags (Phase 1: 0, siehe core/README.md).
 * @param {string} date
 * @param {Array} history - result.history aus computeSignatureHistory
 * @param {ReturnType<typeof loadResponseSeries>} series
 * @param {ReturnType<typeof calibrateK1>} calibration
 * @param {import('./types.js').ModelSettings} settings
 */
export function displaySignatureAtDate(date, history, series, calibration, settings) {
  const base = signatureAtDate(history, date);
  if (!base) return null;

  const entry = series.find((e) => e.date === date);
  if (!entry) return { cp: base.cp, wPrimeJ: base.wPrimeJ, pMax: base.pMax, hasLoadAdjustment: false, calibration };

  const discount = (settings.loadResponseDisplayDiscountPct || 0) / 100;
  const adjust = (system, baseValue) => baseValue + calibration[system].k1 * entry[system].p * (1 - discount);

  return {
    cp: adjust('cp', base.cp),
    wPrimeJ: adjust('wPrime', base.wPrimeJ),
    pMax: adjust('pMax', base.pMax),
    hasLoadAdjustment: true,
    calibration,
  };
}
