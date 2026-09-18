// FA-SIG-13: Plausibilisierung von PP (Modell-Pmax) gegen die gemessene beste
// 5-s-Leistung (XERT definiert PP so, Lastenheft Kap. 7 Uebersetzungshinweis).
// Reine Anzeige - das Modell selbst wird NICHT korrigiert (das waere ein
// eigener, deutlich groesserer Eingriff in FA-SIG-05, hier nicht verlangt).
//
// Nur mit bereits vorhandenen Daten (model/mmp-curves.json) - keine eigene
// Berechnung im Rechenkern noetig, aggregateMMP() (M1) reicht dafuer aus.

import { aggregateMMP } from '../vendor/core/src/index.js';

const FIVE_SEC = 5;

/** Beste je gemessene 5-s-Leistung ueber alle Aktivitaeten BIS EINSCHLIESSLICH `date`. */
export function measuredFiveSecPowerAtDate(mmpCurves, date) {
  const upToDate = (mmpCurves || []).filter((c) => c.date <= date);
  const env = aggregateMMP(upToDate, [FIVE_SEC]);
  return env.length ? env[0] : null; // { t, watts, date, activityId }
}

/**
 * Abweichung des Modell-PP (`pMax`) einer Signatur von der bis dahin
 * gemessenen besten 5-s-Leistung. `null`-Felder, wenn noch keine 5-s-Messung
 * vorliegt (z. B. ganz am Anfang der Historie).
 */
export function ppPlausibility(signatureEntry, mmpCurves) {
  const measured = measuredFiveSecPowerAtDate(mmpCurves, signatureEntry.date);
  if (!measured) return { measuredWatts: null, measuredDate: null, deviationWatts: null, deviationPct: null };
  const deviationWatts = Math.round(measured.watts - signatureEntry.pMax);
  const deviationPct = signatureEntry.pMax ? deviationWatts / signatureEntry.pMax : null;
  return { measuredWatts: measured.watts, measuredDate: measured.date, deviationWatts, deviationPct };
}
