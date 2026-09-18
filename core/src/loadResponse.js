// FA-SIG-10/12 (siehe core/README.md "Belastungsgekoppelter Signaturverlauf"): belastungs-
// gekoppelter Signaturverlauf zwischen Breakthroughs, Kap. 7.7/7.8. Je Energiesystem s in
// {cp, wPrime, pMax} laeuft ein eigenes Impulse-Response-Modell auf der taeglichen Belastung
// (Strain Score, Kap. 7.6 - bereits in activityResults[].strain vorhanden, siehe strain.js:
// low=CP-Anteil, high=W'-Anteil, peak=Pmax-Anteil).
//
// Phase 2 (M4-Festlegung, siehe core/README.md): tau1,s UND k1,s werden je System geschaetzt -
// tau1,s per Grid-Search ueber den Lastenheft-Literaturbereich (35-51 Tage), k1,s je Kandidat
// per Least-Squares gegen die eigenen bestaetigten Breakthroughs. k2,s bleibt fest auf 1 (kein
// Literaturwert vorhanden). Zusaetzlich ein Hold-out-Backtest (Kap. 7.8 Abnahme): Kalibrierung
// nur auf der Historie bis zu einem Stichtag, Bericht der mittleren absoluten Abweichung an den
// Breakthroughs danach - liefert eine begruendete Empfehlung fuer den Anzeige-Abschlag statt
// eines willkuerlichen Werts.

import { signatureAtDate } from './signature.js';

const SYSTEMS = ['cp', 'wPrime', 'pMax'];
const STRAIN_FIELD = { cp: 'low', wPrime: 'high', pMax: 'peak' };

// Kap. 7.8: "Literaturbereiche tau1 ~= 35-51 Tage". Fuer tau2 nennt Kap. 7.8 ebenfalls einen
// Bereich (8-13 Tage), der widerspricht aber Kap. 12s explizitem Fixwert (7 Tage, "fest") - tau2
// wird ohnehin nicht gefittet, deshalb bleibt es bei Kap. 12s Wert (settings.loadResponseTau2Days).
const TAU1_MIN_DAYS = 35;
const TAU1_MAX_DAYS = 51;
const TAU1_STEP_DAYS = 1;

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function subtractMonthsISO(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - months);
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
 * Taeglicher g/h/p-Verlauf EINES Systems (Kap. 7.7, EXAKTE Exponentialform - bewusst nicht die
 * lineare `value += (v-value)/tau`-Naeherung aus npTss.js#computeEwmaSeries, siehe
 * core/README.md). g/h werden am Tag eines NICHT verworfenen Breakthroughs auf 0
 * zurueckgesetzt (M4-Festlegung: die im Refit bereits eingepreiste Verbesserung soll nicht
 * nochmal on top addiert werden), danach laeuft dieser Tag ganz normal weiter.
 * @param {Object<string, {cp:number, wPrime:number, pMax:number}>} sums - dailyStrainSums()
 * @param {Array<{date:string, discarded:boolean}>} breakthroughs
 * @param {'cp'|'wPrime'|'pMax'} system
 * @param {number} tau1Days
 * @param {number} tau2Days
 * @returns {Array<{date:string, g:number, h:number, p:number}>}
 */
export function loadResponseSeriesForSystem(sums, breakthroughs, system, tau1Days, tau2Days) {
  const dates = Object.keys(sums).sort();
  if (dates.length === 0) return [];
  const allDates = allDatesBetween(dates[0], dates[dates.length - 1]);
  const resetDates = new Set((breakthroughs || []).filter((b) => !b.discarded).map((b) => b.date));

  const decay1 = Math.exp(-1 / tau1Days);
  const decay2 = Math.exp(-1 / tau2Days);
  const k2 = 1; // M4-Festlegung: kein Literaturwert vorhanden, siehe core/README.md

  let g = 0;
  let h = 0;
  const series = [];
  for (const date of allDates) {
    if (resetDates.has(date)) {
      g = 0;
      h = 0;
    }
    const w = (sums[date] && sums[date][system]) || 0;
    g = g * decay1 + w * (1 - decay1);
    h = h * decay2 + w * (1 - decay2);
    series.push({ date, g, h, p: g - k2 * h });
  }
  return series;
}

/**
 * Kombiniert die 3 Einzelsystem-Serien zur gemeinsamen Form, die UI/displaySignatureAtDate
 * erwarten. `tau1BySystem` kommt aus calibrateTau1K1 (je System ggf. unterschiedlich, Phase 2).
 * @param {Object<string, {cp:number, wPrime:number, pMax:number}>} sums
 * @param {Array} breakthroughs
 * @param {Object<string, number>} tau1BySystem - {cp, wPrime, pMax}
 * @param {import('./types.js').ModelSettings} settings
 * @returns {Array<{date:string, cp:{g:number,h:number,p:number}, wPrime:{...}, pMax:{...}}>}
 */
export function loadResponseSeries(sums, breakthroughs, tau1BySystem, settings) {
  const perSystem = {};
  for (const s of SYSTEMS) {
    perSystem[s] = loadResponseSeriesForSystem(sums, breakthroughs, s, tau1BySystem[s], settings.loadResponseTau2Days);
  }
  const n = perSystem.cp.length;
  const series = [];
  for (let i = 0; i < n; i++) {
    const entry = { date: perSystem.cp[i].date };
    for (const s of SYSTEMS) {
      const e = perSystem[s][i];
      entry[s] = { g: e.g, h: e.h, p: e.p };
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
 * Least-Squares-Fit von k1 durch den Ursprung gegen die tatsaechlich bestaetigten
 * Breakthrough-Deltas EINES Systems, ausgewertet mit dem akkumulierten p am Tag VOR dem
 * Breakthrough (dem Stand unmittelbar vor dem Reset). Unterhalb `minSupport` (Kap. 7.8:
 * "unterhalb einer Mindestanzahl an Breakthroughs werden Literaturwerte genutzt" - hier gibt
 * es dafuer keine, siehe core/README.md) bleibt k1 beim literaturfreien Neutralwert 1.
 * @param {Array<{date:string,g:number,h:number,p:number}>} systemSeries - loadResponseSeriesForSystem()
 * @param {Array} breakthroughs
 * @param {'cp'|'wPrime'|'pMax'} system
 * @param {number} minSupport
 * @returns {{k1:number, fitted:boolean, supportCount:number, sse:number|null}}
 */
export function fitK1ThroughOrigin(systemSeries, breakthroughs, system, minSupport) {
  const byDate = new Map(systemSeries.map((e) => [e.date, e]));
  const xs = [];
  const ys = [];
  for (const bt of breakthroughs || []) {
    if (bt.discarded) continue;
    const prevEntry = byDate.get(addDaysISO(bt.date, -1));
    if (!prevEntry) continue;
    const delta = breakthroughDelta(bt, system);
    if (delta == null) continue;
    xs.push(prevEntry.p);
    ys.push(delta);
  }

  if (xs.length < minSupport) {
    return { k1: 1, fitted: false, supportCount: xs.length, sse: null };
  }

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  const k1 = sxx > 0 ? sxy / sxx : 1;
  let sse = 0;
  for (let i = 0; i < xs.length; i++) {
    const err = ys[i] - k1 * xs[i];
    sse += err * err;
  }
  return { k1, fitted: sxx > 0, supportCount: xs.length, sse };
}

/**
 * Phase 2 (FA-SIG-12): tau1,s per Grid-Search ueber den Literaturbereich (35-51 Tage), je
 * Kandidat k1,s per Least-Squares - der Kandidat mit der kleinsten Fehlerquadratsumme (SSE)
 * gewinnt. Die Stuetzpunkt-Anzahl haengt nicht von tau1 ab (dieselben Tage/Breakthroughs sind
 * fuer jeden Kandidaten vorhanden) - wird deshalb nur einmal (mit dem Literatur-Startwert)
 * geprueft, um die Suche bei zu wenig Daten gar nicht erst laufen zu lassen.
 * @param {Object<string, {cp:number, wPrime:number, pMax:number}>} sums
 * @param {Array} breakthroughs
 * @param {import('./types.js').ModelSettings} settings
 * @returns {Object<string, {tau1:number, k1:number, fitted:boolean, supportCount:number, sse:number|null}>}
 */
export function calibrateTau1K1(sums, breakthroughs, settings) {
  const result = {};

  for (const s of SYSTEMS) {
    const referenceSeries = loadResponseSeriesForSystem(sums, breakthroughs, s, settings.loadResponseTau1Days, settings.loadResponseTau2Days);
    const referenceFit = fitK1ThroughOrigin(referenceSeries, breakthroughs, s, settings.loadResponseMinBreakthroughsForFit);
    if (!referenceFit.fitted) {
      result[s] = { tau1: settings.loadResponseTau1Days, k1: 1, fitted: false, supportCount: referenceFit.supportCount, sse: null };
      continue;
    }

    let best = null;
    for (let tau1 = TAU1_MIN_DAYS; tau1 <= TAU1_MAX_DAYS; tau1 += TAU1_STEP_DAYS) {
      const candidateSeries = loadResponseSeriesForSystem(sums, breakthroughs, s, tau1, settings.loadResponseTau2Days);
      const fit = fitK1ThroughOrigin(candidateSeries, breakthroughs, s, settings.loadResponseMinBreakthroughsForFit);
      if (!best || fit.sse < best.fit.sse) best = { tau1, fit };
    }
    result[s] = { tau1: best.tau1, k1: best.fit.k1, fitted: true, supportCount: best.fit.supportCount, sse: best.fit.sse };
  }

  return result;
}

/**
 * Hold-out-Backtest (Kap. 7.8 Abnahme): Kalibrierung NUR auf der Historie bis zu einem
 * Stichtag (spaetestes Datum minus `loadResponseHoldOutMonths`), die Vorhersage laeuft dann
 * mit diesem trainierten tau1/k1 ueber die VOLLE (auch nachfolgende) Historie weiter - nur die
 * Parameterschaetzung ist beschraenkt. Bericht je System: mittlere absolute Abweichung (MAE)
 * zwischen vorhergesagtem und tatsaechlichem Breakthrough-Delta fuer alle Breakthroughs NACH
 * dem Stichtag (W fuer cp/pMax, kJ fuer wPrime/HIE - Kap. 7.8 verlangt kJ fuers Reporting,
 * intern bleibt sonst ueberall Joule), plus eine daraus abgeleitete Abschlag-Empfehlung
 * (Kap. 12: "Startwert wird im Backtesting bestimmt") = Verhaeltnis MAE/mittlere
 * |tatsaechliche Aenderung|, gedeckelt bei 50%. Reine Anzeige-Empfehlung, wird NICHT
 * automatisch in settings.json geschrieben (FA-SET-03: explizite Nutzeraktion).
 * @param {Object<string, {cp:number, wPrime:number, pMax:number}>} sums
 * @param {Array} breakthroughs
 * @param {import('./types.js').ModelSettings} settings
 * @returns {Object<string, {testCount:number, mae:number|null, suggestedDiscountPct:number|null, trainedTau1:number, trainedFitted:boolean}>|null}
 */
export function holdOutBacktest(sums, breakthroughs, settings) {
  const allDates = Object.keys(sums).sort();
  if (allDates.length === 0) return null;
  const cutoff = subtractMonthsISO(allDates[allDates.length - 1], settings.loadResponseHoldOutMonths);

  const nonDiscarded = (breakthroughs || []).filter((b) => !b.discarded);
  const trainBreakthroughs = nonDiscarded.filter((b) => b.date <= cutoff);
  const testBreakthroughs = nonDiscarded.filter((b) => b.date > cutoff);

  const trainSums = {};
  for (const date of allDates) {
    if (date <= cutoff) trainSums[date] = sums[date];
  }

  const calibration = calibrateTau1K1(trainSums, trainBreakthroughs, settings);
  const tau1BySystem = {};
  for (const s of SYSTEMS) tau1BySystem[s] = calibration[s].tau1;
  const fullSeries = loadResponseSeries(sums, breakthroughs, tau1BySystem, settings);
  const byDate = new Map(fullSeries.map((e) => [e.date, e]));

  const result = {};
  for (const s of SYSTEMS) {
    const absErrors = [];
    const absActuals = [];
    for (const bt of testBreakthroughs) {
      const prevEntry = byDate.get(addDaysISO(bt.date, -1));
      if (!prevEntry) continue;
      const delta = breakthroughDelta(bt, s);
      if (delta == null) continue;
      const predicted = calibration[s].k1 * prevEntry[s].p;
      absErrors.push(Math.abs(predicted - delta));
      absActuals.push(Math.abs(delta));
    }

    if (absErrors.length === 0) {
      result[s] = { testCount: 0, mae: null, suggestedDiscountPct: null, trainedTau1: calibration[s].tau1, trainedFitted: calibration[s].fitted };
      continue;
    }

    const maeRaw = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
    const meanAbsActual = absActuals.reduce((a, b) => a + b, 0) / absActuals.length;
    const suggestedDiscountPct = meanAbsActual > 0 ? Math.min(0.5, maeRaw / meanAbsActual) * 100 : 0;
    const mae = s === 'wPrime' ? maeRaw / 1000 : maeRaw; // kJ fuer HIE (Kap. 7.8), sonst W
    result[s] = { testCount: absErrors.length, mae, suggestedDiscountPct, trainedTau1: calibration[s].tau1, trainedFitted: calibration[s].fitted };
  }

  return result;
}

/**
 * Geglaettete "Anzeige-Signatur" an einem Datum: die zu diesem Datum gueltige
 * Breakthrough-Signatur (signatureAtDate, unveraendert) plus der belastungsgekoppelte
 * Trend seitdem, abzueglich des Anzeige-Abschlags (Startwert 0, siehe core/README.md und
 * holdOutBacktest fuer eine begruendete Empfehlung).
 * @param {string} date
 * @param {Array} history - result.history aus computeSignatureHistory
 * @param {ReturnType<typeof loadResponseSeries>} series
 * @param {ReturnType<typeof calibrateTau1K1>} calibration
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
