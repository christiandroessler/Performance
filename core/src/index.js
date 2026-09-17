// Oeffentliche API des Rechenkerns. Siehe core/README.md fuer die Uebersicht
// und die in M1 getroffenen Festlegungen.

export { DEFAULT_SETTINGS, mergeSettings } from './settings.js';
export { resampleTo1Hz, emptyStream } from './streams.js';
export { detectOutliers, validPowerMask, wattsForRecovery } from './quality.js';
export { prepareActivity } from './activity.js';
export {
  DEFAULT_GRID,
  meanMaximalPower,
  meanMaximalPowerForActivity,
  validSegments,
  aggregateMMP,
  detectMaximalEfforts,
  bestMeanOverWindows,
} from './mmp.js';
export { fit2ParamCP, fitMortonCP, fitMortonRobust, mortonPower, powerDurationCurve } from './cpFit.js';
export { wPrimeBalanceSkiba2015, finalBalance } from './wbal.js';
export { mpaAtBalance, mpaTrace } from './mpa.js';
export { computeStrainScore, splitPower, kStrain } from './strain.js';
export {
  detectBreakthroughWindows,
  nearMpaPoints,
  refitSignature,
  refitWindowEnvelope,
  medalFor,
} from './breakthrough.js';
export { checkTwoParamConsistency, wPrimeBalance2ParamUnclamped } from './twoParamCheck.js';
export { computeInitialSignature, computeSignatureHistory, signatureAtDate } from './signature.js';
export {
  validVelocitySegments,
  validHeartRateSegments,
  bestSustainedSpeed,
  bestSustainedHeartRate,
  averageHeartRate,
  averageSpeed,
  recordedSeconds,
  meanHeartRateNearPower,
} from './pace.js';
export { sportGroup, thresholdAtDate, estimateThresholds, applySportSpecificTss } from './thresholds.js';
export {
  normalizedPower,
  normalizedPowerForActivity,
  intensityFactor,
  variabilityIndex,
  trainingStressScore,
  hrTSS,
  paceTSS,
  efficiencyFactor,
  computeEwmaSeries,
  computeCTLATL,
  rampRate,
  classifyFormZone,
} from './npTss.js';
export * as importers from './importers/index.js';
