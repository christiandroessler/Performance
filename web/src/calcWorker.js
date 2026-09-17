// Web Worker fuer die Modellberechnung (NFA-04: "Berechnungen in einem Web
// Worker, die UI blockiert nicht"). Nimmt Rohpunkte aller Aktivitaeten
// entgegen, ruft den Rechenkern (M1, unveraendert) auf und liefert nur die
// aggregierten Ergebnisse zurueck (keine Sekunden-Streams) - klein genug fuer
// eine schnelle structured-clone-Uebertragung zurueck ins Hauptfenster.

import { prepareActivity, computeSignatureHistory, mergeSettings } from '../vendor/core/src/index.js';

self.onmessage = (e) => {
  const { requestId, rawActivities, settingsOverrides, discardedBreakthroughIds } = e.data;
  try {
    const settings = mergeSettings(settingsOverrides || {});
    const prepared = rawActivities.map((raw) => prepareActivity(raw, settings));
    const result = computeSignatureHistory(prepared, {
      settings,
      discardedBreakthroughIds: new Set(discardedBreakthroughIds || []),
    });
    // FA-ACT-03: Grundlage der persoenlichen Bestwerte. Kommt direkt aus
    // prepareActivity() (core, unveraendert), nicht aus computeSignatureHistory -
    // die MMP-Kurve gilt unabhaengig von einer erkannten Signatur/Schwelle.
    const mmpCurves = prepared.map((p) => ({ date: p.date, activityId: p.id, mmp: p.mmp }));
    self.postMessage({ requestId, ok: true, result, mmpCurves });
  } catch (err) {
    self.postMessage({ requestId, ok: false, error: String((err && err.message) || err) });
  }
};
