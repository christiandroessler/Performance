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
};

/** @returns {import('./types.js').ModelSettings} */
export function mergeSettings(overrides = {}) {
  return { ...DEFAULT_SETTINGS, ...overrides };
}
