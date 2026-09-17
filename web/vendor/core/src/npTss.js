// NP/IF/TSS (Coggan-Modell) und hrTSS/Pace-TSS-Fallback, Kap. 6.6 (FA-TP-*).
// Die Schwelle (FTP/TP) wird IMMER von aussen uebergeben (F10: TP der Signatur
// zum Aktivitaetsdatum) - dieses Modul kennt keine Signatur.

import { validSegments } from './mmp.js';

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

/** NP ueber ein lueckenloses Segment (30-Sekunden-Rollmittel, hoch 4, gemittelt, 4. Wurzel). */
export function normalizedPower(wattsArray) {
  if (!wattsArray || wattsArray.length < 30) return average(wattsArray);
  const rolling = [];
  let windowSum = 0;
  for (let i = 0; i < 30; i++) windowSum += wattsArray[i];
  rolling.push(windowSum / 30);
  for (let i = 30; i < wattsArray.length; i++) {
    windowSum += wattsArray[i] - wattsArray[i - 30];
    rolling.push(windowSum / 30);
  }
  let sum4 = 0;
  for (const v of rolling) sum4 += v ** 4;
  return Math.pow(sum4 / rolling.length, 0.25);
}

/**
 * NP fuer eine ganze Aktivitaet: 30-Sekunden-Fenster werden nur innerhalb
 * lueckenloser valider Segmente gebildet (Luecken/Ausreisser unterbrechen das
 * Fenster, statt es zu verfaelschen), die vierte Potenz wird ueber alle
 * Fenster aller Segmente gemeinsam gemittelt.
 * @param {import('./types.js').Stream1Hz} stream
 * @param {Uint8Array} mask
 */
export function normalizedPowerForActivity(stream, mask) {
  const segments = validSegments(stream, mask);
  const rolling = [];
  for (const seg of segments) {
    if (seg.length < 30) {
      if (seg.length > 0) rolling.push(average(seg));
      continue;
    }
    let windowSum = 0;
    for (let i = 0; i < 30; i++) windowSum += seg[i];
    rolling.push(windowSum / 30);
    for (let i = 30; i < seg.length; i++) {
      windowSum += seg[i] - seg[i - 30];
      rolling.push(windowSum / 30);
    }
  }
  if (rolling.length === 0) return 0;
  let sum4 = 0;
  for (const v of rolling) sum4 += v ** 4;
  return Math.pow(sum4 / rolling.length, 0.25);
}

export function intensityFactor(np, threshold) {
  return np && threshold ? np / threshold : null;
}

export function variabilityIndex(np, avgWatts) {
  return np && avgWatts ? np / avgWatts : null;
}

/** TSS = (Dauer_s * NP * IF) / (TP * 3600) * 100, IF = NP/TP (FA-TP-01). */
export function trainingStressScore(movingTimeSec, normPower, threshold) {
  if (!threshold || !normPower || !movingTimeSec) return 0;
  const intFactor = normPower / threshold;
  return ((movingTimeSec * normPower * intFactor) / (threshold * 3600)) * 100;
}

/**
 * hrTSS: TSS-Naeherung aus der Herzfrequenz fuer Aktivitaeten ohne Power (FA-TP-02).
 * IF_hr ueber Herzfrequenzreserve (HRR), falls Ruhepuls bekannt, sonst avgHF/Schwellen-HF.
 */
export function hrTSS(durationSec, avgHr, { restingHr, thresholdHr } = {}) {
  if (!durationSec || !avgHr || !thresholdHr) return null;
  let ratio;
  if (restingHr && thresholdHr > restingHr) {
    ratio = (avgHr - restingHr) / (thresholdHr - restingHr);
  } else {
    ratio = avgHr / thresholdHr;
  }
  ratio = Math.max(0, ratio);
  const hours = durationSec / 3600;
  return hours * ratio * ratio * 100;
}

/**
 * Pace-TSS (Laufen) bzw. Schwimm-TSS, wenn eine Schwellenpace/-geschwindigkeit
 * geschaetzt werden kann (FA-TP-02). ueber Geschwindigkeit statt Pace gerechnet
 * (mathematisch aequivalent, aber ohne Sonderfall Pace=0 bei Stillstand).
 */
export function paceTSS(durationSec, avgSpeedMs, thresholdSpeedMs) {
  if (!durationSec || !avgSpeedMs || !thresholdSpeedMs) return null;
  const ifPace = avgSpeedMs / thresholdSpeedMs;
  const hours = durationSec / 3600;
  return hours * ifPace * ifPace * 100;
}

export function efficiencyFactor(np, avgHr) {
  if (!np || !avgHr) return null;
  return np / avgHr;
}

// ---------- Performance Management Chart: CTL/ATL/TSB (FA-TP-06) ----------

/** Generalisierte EWMA (Exponentially Weighted Moving Average), tau in Tagen. */
export function computeEwmaSeries(sortedDates, dailyValueMap, tau) {
  let value = 0;
  const series = [];
  for (const date of sortedDates) {
    const v = dailyValueMap[date] || 0;
    value = value + (v - value) / tau;
    series.push({ date, input: v, value });
  }
  return series;
}

/**
 * CTL (Fitness, Standard 42-Tage-EWMA der TSS), ATL (Fatigue, Standard 7 Tage),
 * TSB (Form) = CTL(gestern) - ATL(gestern). dailyTSSMap: { 'YYYY-MM-DD': tssSumme }.
 */
export function computeCTLATL(sortedDates, dailyTSSMap, { ctlTau = 42, atlTau = 7 } = {}) {
  let ctl = 0;
  let atl = 0;
  const series = [];
  for (const date of sortedDates) {
    const tss = dailyTSSMap[date] || 0;
    const tsb = ctl - atl;
    ctl = ctl + (tss - ctl) / ctlTau;
    atl = atl + (tss - atl) / atlTau;
    series.push({ date, tss, ctl, atl, tsb });
  }
  return series;
}

export function rampRate(series) {
  if (!series || series.length < 8) return null;
  const today = series[series.length - 1];
  const weekAgo = series[series.length - 8];
  return today.ctl - weekAgo.ctl;
}

/** Form-Zone nach TSB (Joe Friel-Baender). */
export function classifyFormZone(tsb) {
  if (tsb == null) return null;
  if (tsb > 25) return 'transition';
  if (tsb >= 5) return 'fresh';
  if (tsb >= -10) return 'neutral';
  if (tsb >= -30) return 'optimal';
  return 'high_risk';
}
