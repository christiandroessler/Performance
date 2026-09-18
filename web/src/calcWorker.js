// Web Worker fuer die Modellberechnung (NFA-04: "Berechnungen in einem Web
// Worker, die UI blockiert nicht"). Nimmt Rohpunkte aller Aktivitaeten
// entgegen, ruft den Rechenkern (M1, unveraendert) auf und liefert nur die
// aggregierten Ergebnisse zurueck (keine Sekunden-Streams) - klein genug fuer
// eine schnelle structured-clone-Uebertragung zurueck ins Hauptfenster.

import {
  prepareActivity,
  computeSignatureHistory,
  mergeSettings,
  estimateThresholds,
  applySportSpecificTss,
  dailyStrainSums,
  loadResponseSeries,
  calibrateK1,
} from '../vendor/core/src/index.js';

self.onmessage = (e) => {
  const { requestId, rawActivities, settingsOverrides, discardedBreakthroughIds } = e.data;
  try {
    const settings = mergeSettings(settingsOverrides || {});
    const prepared = rawActivities.map((raw) => prepareActivity(raw, settings));
    const result = computeSignatureHistory(prepared, {
      settings,
      discardedBreakthroughIds: new Set(discardedBreakthroughIds || []),
    });
    // FA-TP-03/04: sportartspezifische Schwellen (Lauf-/Schwimm-Pace, Rad-HF aus
    // Leistung nahe TP) + FA-TP-02/05: hrTSS/Pace-TSS-Fallback fuer Aktivitaeten,
    // die computeSignatureHistory oben nur mit einem (mangels Leistung) fabrizierten
    // tss:0 verlassen haben. Bewusst als zweiter, von computeSignatureHistory
    // unabhaengiger Durchlauf (siehe core/README.md), statt das bereits getestete
    // Leistungs-/Breakthrough-Modell selbst anzufassen.
    const thresholds = estimateThresholds(prepared, result.history, settings);
    applySportSpecificTss(result.activityResults, prepared, thresholds);
    // FA-ACT-03: Grundlage der persoenlichen Bestwerte. Kommt direkt aus
    // prepareActivity() (core, unveraendert), nicht aus computeSignatureHistory -
    // die MMP-Kurve gilt unabhaengig von einer erkannten Signatur/Schwelle.
    const mmpCurves = prepared.map((p) => ({ date: p.date, activityId: p.id, mmp: p.mmp }));
    // FA-SIG-10 (M4 Phase 1, siehe core/README.md): belastungsgekoppelter Signaturverlauf aus
    // den bereits berechneten Strain-Sub-Scores - dritter, ebenfalls unabhaengiger Durchlauf.
    const sums = dailyStrainSums(result.activityResults);
    const series = loadResponseSeries(sums, result.breakthroughs, settings);
    const calibration = calibrateK1(series, result.breakthroughs, settings);
    const loadResponse = { series, calibration };
    self.postMessage({ requestId, ok: true, result, mmpCurves, thresholds, loadResponse });
  } catch (err) {
    self.postMessage({ requestId, ok: false, error: String((err && err.message) || err) });
  }
};
