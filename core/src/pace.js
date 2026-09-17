// Pace-/Herzfrequenz-Hilfsfunktionen fuer die Sportart-Schwellen-Schaetzung
// (FA-TP-03/04, thresholds.js). Rein pro-Aktivitaet, keine Chronologie/Historie
// hier (die macht thresholds.js) - analog zur Aufteilung mmp.js (pro Aktivitaet)
// vs. signature.js (Chronologie).

import { bestMeanOverWindows } from './mmp.js';

/**
 * Zerlegt den Geschwindigkeits-Stream in lueckenlose valide Segmente, analog zu
 * mmp.js#validSegments fuer Leistung. "Valide" = kein Aufzeichnungsausfall (gap)
 * UND Geschwindigkeit > 0 - Stillstand (z. B. an Ampeln) soll die Schwellen-Pace
 * nicht verfaelschen, genau wie ein Segmentbruch bei Watt-Luecken.
 * @param {import('./types.js').Stream1Hz} stream
 * @returns {Float64Array[]}
 */
export function validVelocitySegments(stream) {
  const segments = [];
  let start = -1;
  for (let i = 0; i <= stream.n; i++) {
    const valid = i < stream.n && !stream.gap[i] && stream.velocity[i] > 0;
    if (valid && start === -1) start = i;
    if (!valid && start !== -1) {
      segments.push(stream.velocity.slice(start, i));
      start = -1;
    }
  }
  return segments;
}

/**
 * Zerlegt den Herzfrequenz-Stream in lueckenlose valide Segmente (Sekunden mit
 * Herzfrequenzmessung), analog zu validVelocitySegments.
 * @param {import('./types.js').Stream1Hz} stream
 * @returns {Float64Array[]}
 */
export function validHeartRateSegments(stream) {
  const segments = [];
  let start = -1;
  for (let i = 0; i <= stream.n; i++) {
    const valid = i < stream.n && stream.hasHeartrate[i] && !stream.gap[i];
    if (valid && start === -1) start = i;
    if (!valid && start !== -1) {
      segments.push(stream.heartrate.slice(start, i));
      start = -1;
    }
  }
  return segments;
}

/**
 * Bester gleitender Mittelwert ueber `durationSec` innerhalb eines Arrays von
 * Segmenten (Geschwindigkeit ODER Herzfrequenz - meanMaximalPower ist rein
 * arithmetisch und kennt keine Einheit). null, wenn kein Segment lang genug ist.
 * @param {Float64Array[]} segments
 * @param {number} durationSec
 */
function bestSustainedMean(segments, durationSec) {
  let best = null;
  for (const seg of segments) {
    if (seg.length < durationSec) continue;
    const [point] = bestMeanOverWindows(seg, [durationSec]);
    if (point && (best == null || point.value > best)) best = point.value;
  }
  return best;
}

/** Beste sustained Geschwindigkeit (m/s) ueber `durationSec` innerhalb einer Aktivitaet, oder null. */
export function bestSustainedSpeed(stream, durationSec) {
  return bestSustainedMean(validVelocitySegments(stream), durationSec);
}

/** Beste sustained Herzfrequenz (bpm) ueber `durationSec` innerhalb einer Aktivitaet, oder null. */
export function bestSustainedHeartRate(stream, durationSec) {
  return bestSustainedMean(validHeartRateSegments(stream), durationSec);
}

/** Mittlere Herzfrequenz ueber die ganze Aktivitaet (nur Sekunden mit Messung), oder null. */
export function averageHeartRate(stream) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < stream.n; i++) {
    if (stream.hasHeartrate[i]) {
      sum += stream.heartrate[i];
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Mittlere Geschwindigkeit (m/s) ueber die ganze Aktivitaet (nur bewegte, aufgezeichnete Sekunden), oder null. */
export function averageSpeed(stream) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < stream.n; i++) {
    if (!stream.gap[i] && stream.velocity[i] > 0) {
      sum += stream.velocity[i];
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Anzahl aufgezeichneter (nicht luecken-)Sekunden - Grundlage fuer hrTSS/paceTSS-Dauer ausserhalb der Leistungsmodelle. */
export function recordedSeconds(stream) {
  let count = 0;
  for (let i = 0; i < stream.n; i++) if (!stream.gap[i]) count++;
  return count;
}

/**
 * FA-TP-04: mittlere Herzfrequenz waehrend aller Sekunden, an denen die Leistung
 * nahe an `targetWatts` (der TP der Signatur zum Aktivitaetsdatum) lag - Grundlage
 * fuer die Rad-Schwellen-HF-Schaetzung aus Radeinheiten MIT Leistung.
 * @param {import('./types.js').Stream1Hz} stream
 * @param {Uint8Array} mask - valide Leistungssekunden (quality.js#validPowerMask)
 * @param {number} targetWatts
 * @param {number} toleranceFrac - z. B. 0.05 fuer +/-5%
 * @returns {{ avgHr: number, seconds: number } | null}
 */
export function meanHeartRateNearPower(stream, mask, targetWatts, toleranceFrac) {
  if (!targetWatts) return null;
  const band = targetWatts * toleranceFrac;
  let sum = 0;
  let seconds = 0;
  for (let i = 0; i < stream.n; i++) {
    if (!mask[i] || !stream.hasHeartrate[i]) continue;
    if (Math.abs(stream.watts[i] - targetWatts) > band) continue;
    sum += stream.heartrate[i];
    seconds++;
  }
  return seconds > 0 ? { avgHr: sum / seconds, seconds } : null;
}
