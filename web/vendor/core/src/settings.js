// Einstellbare Parameter mit Startwerten gemaess Lastenheft Kap. 12.
// @type {import('./types.js').ModelSettings}
export const DEFAULT_SETTINGS = {
  breakthroughEpsilon: 0.02, // F8, Kap. 7.4
  breakthroughMinSeconds: 3, // F8, Kap. 7.4
  mpaExponent: 2, // Kap. 7.2, Kontro et al. 2024/2025
  refitWindowDays: 90, // F9, Kap. 7.5
  maxDropPerBreakthrough: 0.05, // F9, Kap. 7.5 (Absenkbremse)
  minSupportingActivitiesForDrop: 2, // F9, Kap. 7.5
  medalThreshold: 0.01, // F9, Kap. 7.5
  refitNearMpaThreshold: 0.05, // M1-Festlegung, siehe core/README.md
  initialSignatureWindowDays: 90, // F9, FA-SIG-03
  outlierMaxWatts: 2500, // M1-Festlegung, siehe core/README.md
  outlierMaxJumpWatts: 1800, // M1-Festlegung, siehe core/README.md
  maxPlausiblePMax: 3000, // M1-Festlegung, siehe core/README.md (Nebenbedingungs-Korrektur)
  maxPlausibleCp: 600, // M1-Festlegung, siehe core/README.md (Nebenbedingungs-Korrektur)
  maxMpaCorrectionPct: 0.2, // M1-Festlegung, siehe core/README.md (Nebenbedingungs-Korrektur, relative Grenze)
  pmaxEvidenceMaxSeconds: 20, // M1-Festlegung, siehe core/README.md (Pmax-Stabilitaet, XERT-Sprinttest-Dauer)
  minPmaxEvidenceCount: 2, // M1-Festlegung, siehe core/README.md (Pmax-Stabilitaet)
  pmaxEvidenceMinCpMultiple: 1.8, // M1-Festlegung, siehe core/README.md (Pmax-Stabilitaet)
  maxPmaxChangePerBreakthrough: 0.15, // M1-Festlegung, siehe core/README.md (Pmax-Stabilitaet, Traegheitsbremse)
  wprimeEvidenceMinSeconds: 120, // M1-Festlegung, siehe core/README.md (HIE-Stabilitaet, klassischer CP-Testprotokoll-Bereich)
  wprimeEvidenceMaxSeconds: 1200, // M1-Festlegung, siehe core/README.md (HIE-Stabilitaet)
  minWprimeEvidenceCount: 2, // M1-Festlegung, siehe core/README.md (HIE-Stabilitaet)
  wprimeEvidenceMinCpMultiple: 1.05, // M1-Festlegung, siehe core/README.md (HIE-Stabilitaet)
  maxWprimeChangePerBreakthrough: 0.2, // M1-Festlegung, siehe core/README.md (HIE-Stabilitaet, Traegheitsbremse)
  maxGapSecondsForWbalContinuity: 1800, // M1-Festlegung, siehe core/README.md
  ctlTau: 42,
  atlTau: 7,
  thresholdEstimationWindowDays: 180, // M1-Festlegung, siehe core/README.md (FA-TP-03/04)
  thresholdEffortSeconds: 1200, // M1-Festlegung, siehe core/README.md (FA-TP-03/04)
  thresholdCyclingPowerTolerance: 0.05, // M1-Festlegung, siehe core/README.md (FA-TP-04)
  thresholdChangeEpsilon: 0.02, // M1-Festlegung, siehe core/README.md (FA-TP-03/04)
  loadResponseTau1Days: 42, // M4-Festlegung, siehe core/README.md (FA-SIG-10, Kap. 12 Start/Fallback)
  loadResponseTau2Days: 7, // M4-Festlegung, siehe core/README.md (FA-SIG-10, Kap. 12 fest)
  loadResponseMinBreakthroughsForFit: 3, // M4-Festlegung, siehe core/README.md (FA-SIG-12 Fallback-Schwelle, Phase 1)
  loadResponseDisplayDiscountPct: 0, // M4-Festlegung, siehe core/README.md (Anzeige-Abschlag, Startwert erst mit FA-SIG-12/Backtesting)
  loadResponseHoldOutMonths: 6, // Kap. 12 (FA-SIG-12): Hold-out-Zeitraum fuer den Backtesting-Bericht
  activeMusclePctDefault: 0.3, // Kap. 7.9, Standard fuer Radfahren
  metShortDurationSeconds: 360, // M5-Festlegung, siehe core/README.md (Kurzzeitbedingung, Kap. 7.9: "Leistung bei VO2max ~ 6-min-Bestleistung")
  metShortDurationWeight: 1.0, // M5-Festlegung, siehe core/README.md (Gewicht im VO2max-Mittel gegenueber Laborwerten)
  metLabVo2maxWeight: 2.0, // M5-Festlegung, siehe core/README.md (FA-MET-02)
  metLabVlamaxWeight: 2.0, // M5-Festlegung, siehe core/README.md (FA-MET-02)
  metLabLactateWeight: 2.0, // M5-Festlegung, siehe core/README.md (FA-MET-02)
  metVlamaxMinMmolLs: 0.1, // M5-Festlegung, siehe core/README.md (Literaturbereich)
  metVlamaxMaxMmolLs: 1.5, // M5-Festlegung, siehe core/README.md
  metVo2maxMinMlKg: 20, // M5-Festlegung, siehe core/README.md
  metVo2maxMaxMlKg: 90, // M5-Festlegung, siehe core/README.md
  metMlssToleranceWatts: 0.1, // M5-Festlegung, siehe core/README.md (Bisektionspraezision)
  metZoneBoundary1Pct: 0.55, // M5-Festlegung, siehe core/README.md (Zonenschema)
  metZoneBoundary2Pct: 0.75, // M5-Festlegung, siehe core/README.md
  metZoneBoundary3Pct: 0.95, // M5-Festlegung, siehe core/README.md
  metSmoothingWindowSeconds: 30, // M5-Festlegung, siehe core/README.md (analog NP-Fenster)
};

/** @returns {import('./types.js').ModelSettings} */
export function mergeSettings(overrides = {}) {
  return { ...DEFAULT_SETTINGS, ...overrides };
}
