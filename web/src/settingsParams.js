// Modellparameter-Katalog der Einstellungen (FA-SET-01 bis 04, Lastenheft Kap. 12) und die reine
// Diff-/Protokoll-Logik dazu - ohne DOM, damit sie testbar ist (docs/MODULE.md P-10). Die
// Darstellung (Karten, Eingabefelder) bleibt in settingsView.js.

import { DEFAULT_SETTINGS } from '../vendor/core/src/index.js';

/**
 * @typedef {object} ParamDef
 * @property {string} key - Schluessel in ModelSettings (core/src/settings.js#DEFAULT_SETTINGS)
 * @property {string} label
 * @property {string} unit
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {number[]} [options] - statt min/max/step: Auswahlliste
 * @property {(v: number) => number} toDisplay - interner Wert -> Anzeigewert
 * @property {(v: number) => number} fromDisplay - Anzeigewert -> interner Wert
 * @property {string} hint - Quelle/Herkunft des Parameters
 */
const pct = { toDisplay: (v) => Math.round(v * 1000) / 10, fromDisplay: (v) => v / 100 };
const identity = { toDisplay: (v) => v, fromDisplay: (v) => v };
const kJ = { toDisplay: (v) => v / 1000, fromDisplay: (v) => v * 1000 };

// Gruppierung/Beschriftung/Quelle nach Lastenheft Kap. 12 ("Einstellbare Parameter (Startwerte)");
// die vier thresholdX-Parameter sind eine M1-Festlegung fuer FA-TP-03/04 (core/README.md), im
// Lastenheft selbst noch als "in M1 festzulegen" offen gelassen.
/** @type {{ title: string, params: ParamDef[] }[]} */
export const PARAM_GROUPS = [
  {
    title: 'Breakthrough-Erkennung',
    params: [
      { key: 'breakthroughEpsilon', label: 'Breakthrough-Toleranz ε', unit: '%', min: 0, max: 20, step: 0.1, ...pct, hint: 'F8, Kap. 7.4' },
      { key: 'breakthroughMinSeconds', label: 'Breakthrough-Mindestdauer d', unit: 's', min: 1, max: 60, step: 1, ...identity, hint: 'F8, Kap. 7.4' },
      { key: 'medalThreshold', label: 'Medaillenschwelle', unit: '%', min: 0, max: 20, step: 0.1, ...pct, hint: 'F9, Kap. 7.5' },
    ],
  },
  {
    title: 'Signatur-Refit',
    params: [
      { key: 'initialSignatureWindowDays', label: 'Fenster Startsignatur', unit: 'Tage', min: 7, max: 365, step: 1, ...identity, hint: 'F9, FA-SIG-03' },
      { key: 'refitWindowDays', label: 'Refit-Fenster', unit: 'Tage', min: 7, max: 365, step: 1, ...identity, hint: 'F9, Kap. 7.5' },
      { key: 'maxDropPerBreakthrough', label: 'Absenkbremse je Breakthrough', unit: '%', min: 0, max: 50, step: 0.5, ...pct, hint: 'F9, Kap. 7.5' },
      { key: 'minSupportingActivitiesForDrop', label: 'Mindestanzahl stützender Aktivitäten für Absenkung', unit: '', min: 1, max: 20, step: 1, ...identity, hint: 'F9, Kap. 7.5' },
      { key: 'refitNearMpaThreshold', label: 'Nähe zur MPA für Refit-Punkte', unit: '%', min: 0, max: 50, step: 0.5, ...pct, hint: 'M1-Festlegung' },
      { key: 'mpaExponent', label: 'MPA-Exponent n', unit: '', options: [1, 2], ...identity, hint: 'Kontro et al. 2024/2025' },
    ],
  },
  {
    title: 'Nebenbedingungs-Korrektur (Plausibilitätsgrenzen)',
    params: [
      { key: 'maxPlausiblePMax', label: 'Absolute Plausibilitätsgrenze PP', unit: 'W', min: 400, max: 3000, step: 10, ...identity, hint: 'Kap. 7.5, individuell anpassen!' },
      { key: 'maxPlausibleCp', label: 'Absolute Plausibilitätsgrenze TP', unit: 'W', min: 100, max: 600, step: 5, ...identity, hint: 'Kap. 7.5, individuell anpassen!' },
      { key: 'maxMpaCorrectionPct', label: 'Max. Korrektur je Breakthrough (relativ)', unit: '%', min: 5, max: 100, step: 1, ...pct, hint: 'M1-Festlegung, core/README.md' },
    ],
  },
  {
    title: 'PP-Stabilität (Pmax nur bei Sprint-Evidenz aktualisieren)',
    params: [
      { key: 'pmaxEvidenceMaxSeconds', label: 'Max. Dauer für Sprint-Stützpunkte', unit: 's', min: 5, max: 60, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'minPmaxEvidenceCount', label: 'Mindestanzahl Sprint-Stützpunkte', unit: '', min: 1, max: 10, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'pmaxEvidenceMinCpMultiple', label: 'Min. Vielfaches von TP für Sprint-Stützpunkte', unit: '×', min: 1.2, max: 3, step: 0.1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'maxPmaxChangePerBreakthrough', label: 'Max. PP-Änderung je Breakthrough (Trägheitsbremse)', unit: '%', min: 5, max: 100, step: 1, ...pct, hint: 'M1-Festlegung, core/README.md' },
    ],
  },
  {
    title: 'HIE-Stabilität (W\' nur bei nahe-erschöpfender Evidenz aktualisieren)',
    params: [
      { key: 'wprimeEvidenceMinSeconds', label: 'Min. Dauer für W\'-Stützpunkte', unit: 's', min: 30, max: 600, step: 10, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'wprimeEvidenceMaxSeconds', label: 'Max. Dauer für W\'-Stützpunkte', unit: 's', min: 300, max: 3600, step: 60, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'minWprimeEvidenceCount', label: 'Mindestanzahl W\'-Stützpunkte', unit: '', min: 1, max: 10, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'wprimeEvidenceMinCpMultiple', label: 'Min. Vielfaches von TP für W\'-Stützpunkte', unit: '×', min: 1, max: 2, step: 0.01, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'maxWprimeChangePerBreakthrough', label: 'Max. HIE-Änderung je Breakthrough (Trägheitsbremse)', unit: '%', min: 5, max: 100, step: 1, ...pct, hint: 'M1-Festlegung, core/README.md' },
      { key: 'maxPlausibleWPrimeJ', label: 'Absolute Plausibilitätsgrenze HIE', unit: 'kJ', min: 15, max: 60, step: 0.5, ...kJ, hint: 'M1-Festlegung, core/README.md, individuell anpassen!' },
    ],
  },
  {
    title: 'Ausreißerfilter (Leistung)',
    params: [
      { key: 'outlierMaxWatts', label: 'Max. plausible Leistung', unit: 'W', min: 200, max: 5000, step: 10, ...identity, hint: 'M1-Festlegung, Ausreißerregel' },
      { key: 'outlierMaxJumpWatts', label: 'Max. plausibler Leistungssprung', unit: 'W', min: 100, max: 5000, step: 10, ...identity, hint: 'M1-Festlegung, Ausreißerregel' },
    ],
  },
  {
    title: 'Trainingsbelastung (PMC)',
    params: [
      { key: 'ctlTau', label: 'CTL-Zeitkonstante (Fitness)', unit: 'Tage', min: 7, max: 90, step: 1, ...identity, hint: 'gängige Praxis' },
      { key: 'atlTau', label: 'ATL-Zeitkonstante (Ermüdung)', unit: 'Tage', min: 3, max: 30, step: 1, ...identity, hint: 'gängige Praxis' },
    ],
  },
  {
    title: 'Sportart-Schwellen (FA-TP-03/04)',
    params: [
      { key: 'thresholdEstimationWindowDays', label: 'Rollierendes Schätzfenster', unit: 'Tage', min: 30, max: 365, step: 5, ...identity, hint: 'M1-Festlegung' },
      { key: 'thresholdEffortSeconds', label: 'Bewertungsdauer', unit: 's', min: 300, max: 3600, step: 60, ...identity, hint: 'M1-Festlegung' },
      { key: 'thresholdCyclingPowerTolerance', label: 'Toleranz Rad-Leistung nahe TP', unit: '%', min: 1, max: 20, step: 0.5, ...pct, hint: 'M1-Festlegung, FA-TP-04' },
      { key: 'thresholdChangeEpsilon', label: 'Änderungsschwelle (neuer Verlaufseintrag)', unit: '%', min: 0.5, max: 10, step: 0.5, ...pct, hint: 'M1-Festlegung' },
    ],
  },
  {
    title: 'Signatur-Verfall (belastungsgekoppelte Anzeige)',
    params: [
      { key: 'signatureDecayGraceDays', label: 'Karenzzeit ohne Verfall', unit: 'Tage', min: 0, max: 60, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'signatureDecayTauCpDays', label: 'Verfall-Zeitkonstante TP', unit: 'Tage', min: 10, max: 180, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'signatureDecayTauWPrimeDays', label: 'Verfall-Zeitkonstante HIE', unit: 'Tage', min: 10, max: 180, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'signatureDecayTauPMaxDays', label: 'Verfall-Zeitkonstante PP', unit: 'Tage', min: 10, max: 180, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'signatureDecayMaxPct', label: 'Maximaler Verfall', unit: '%', min: 0, max: 80, step: 1, ...pct, hint: 'M1-Festlegung, core/README.md' },
    ],
  },
  {
    title: 'Stoffwechselmodell (Kap. 7.9)',
    params: [
      { key: 'activeMusclePctDefault', label: 'Aktive Muskelmasse', unit: '%', min: 15, max: 50, step: 1, ...pct, hint: 'Kap. 7.9, Standard 30% für Radfahren' },
      { key: 'metShortDurationSeconds', label: 'Kurzzeitbedingung (Dauer)', unit: 's', min: 120, max: 600, step: 10, ...identity, hint: 'M5-Festlegung, core/README.md' },
      { key: 'metZoneBoundary1Pct', label: 'Zonengrenze Z1/Z2', unit: '%', min: 30, max: 70, step: 1, ...pct, hint: 'M5-Festlegung, core/README.md' },
      { key: 'metZoneBoundary2Pct', label: 'Zonengrenze Z2/Z3', unit: '%', min: 50, max: 85, step: 1, ...pct, hint: 'M5-Festlegung, core/README.md' },
      { key: 'metZoneBoundary3Pct', label: 'Zonengrenze Z3/Z4', unit: '%', min: 80, max: 99, step: 1, ...pct, hint: 'M5-Festlegung, core/README.md' },
    ],
  },
];

export const ALL_PARAMS = PARAM_GROUPS.flatMap((g) => g.params);

export function roundedDisplay(param, rawValue) {
  return Math.round(param.toDisplay(rawValue) * 100) / 100;
}

export function formatParamValue(param, rawValue) {
  const rounded = roundedDisplay(param, rawValue);
  return param.unit ? `${rounded} ${param.unit}` : `${rounded}`;
}

const EPSILON = 1e-9;

/**
 * Liefert den wirksamen Wert eines Parameters: gespeicherte Abweichung oder Startwert.
 * @param {Record<string, number>|undefined} modelSettings
 * @param {string} key
 */
export function effectiveValue(modelSettings, key) {
  return modelSettings && modelSettings[key] !== undefined ? modelSettings[key] : DEFAULT_SETTINGS[key];
}

/**
 * Nur echte Abweichungen vom aktuellen Startwert persistieren (FA-SET-02/03), sonst friert
 * jedes Speichern ALLE Parameter beim damaligen Startwert ein und spaetere Aenderungen an
 * DEFAULT_SETTINGS (core/src/settings.js) wirken sich fuer diesen Nutzer nie wieder aus -
 * siehe core/README.md "Bekannte offene Punkte".
 * @param {(key: string) => number} readDisplayValue - liefert den Anzeigewert aus dem Formular (NaN = leer/ungueltig)
 * @returns {Record<string, number>}
 */
export function collectModelSettingsOverrides(readDisplayValue) {
  const next = {};
  for (const param of ALL_PARAMS) {
    const raw = readDisplayValue(param.key);
    if (!Number.isFinite(raw)) continue;
    const value = param.fromDisplay(raw);
    if (Math.abs(value - DEFAULT_SETTINGS[param.key]) > EPSILON) next[param.key] = value;
  }
  return next;
}

/**
 * Protokolleintraege (FA-SET-03) fuer den Wechsel von `previous` auf `next`.
 * @param {Record<string, number>|undefined} previous
 * @param {Record<string, number>} next
 * @returns {{ key: string, label: string, from: string, to: string }[]}
 */
export function describeSettingsChanges(previous, next) {
  const changes = [];
  for (const param of ALL_PARAMS) {
    const before = effectiveValue(previous, param.key);
    const after = effectiveValue(next, param.key);
    if (Math.abs(before - after) > EPSILON) {
      changes.push({ key: param.key, label: param.label, from: formatParamValue(param, before), to: formatParamValue(param, after) });
    }
  }
  return changes;
}
