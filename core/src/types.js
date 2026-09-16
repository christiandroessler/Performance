// Zentrale Typdefinitionen (JSDoc) fuer den Rechenkern. Keine Laufzeit-Wirkung,
// nur fuer Editor-Unterstuetzung und Dokumentation. Siehe docs/LASTENHEFT.md Kap. 7.

/**
 * @typedef {Object} RawStreamPoint
 * @property {number} t - Sekunden seit Aktivitaetsbeginn (muss nicht lueckenlos sein)
 * @property {number|null} [watts]
 * @property {boolean} [deviceWatts] - true, wenn watts gemessen (nicht geschaetzt) ist
 * @property {number|null} [heartrate]
 * @property {number|null} [cadence]
 * @property {number|null} [velocity] - m/s
 * @property {number|null} [distance] - m, kumulativ
 * @property {number|null} [altitude] - m
 */

/**
 * Auf 1-Hz normalisierter Stream. Alle Arrays haben dieselbe Laenge n = Dauer in Sekunden.
 * Luecken (siehe FA-DQ-02) sind nicht interpoliert, sondern ueber `gap[i] = true` markiert;
 * an Luecken-Indizes sind die Rohwerte `null`.
 *
 * @typedef {Object} Stream1Hz
 * @property {number} n
 * @property {Float64Array} watts - 0 an Luecken/fehlenden Punkten (siehe FA-DQ-04 fuer W'bal)
 * @property {Uint8Array} hasWatts - 1 wenn an dieser Sekunde eine echte Leistungsmessung vorliegt
 * @property {Uint8Array} deviceWatts - 1 wenn `device_watts = true` (FA-DQ-01)
 * @property {Float64Array} heartrate
 * @property {Uint8Array} hasHeartrate
 * @property {Float64Array} cadence
 * @property {Float64Array} velocity
 * @property {Uint8Array} gap - 1 an Sekunden ohne Originalaufzeichnung (Pause/Aussetzer)
 * @property {Uint8Array} outlier - 1 an Sekunden, die vom Ausreisserfilter markiert wurden (FA-DQ-03)
 */

/**
 * @typedef {Object} Signature
 * @property {number} tp - Threshold Power (W) = CP
 * @property {number} hie - High Intensity Energy (kJ) = W' (in kJ! intern meist J)
 * @property {number} pp - Peak Power (W) = Pmax
 * @property {string} date - g\xFCltig ab (YYYY-MM-DD)
 * @property {'initial'|'refit'} source
 * @property {string} [breakthroughId]
 */

/**
 * @typedef {Object} ModelSettings
 * @property {number} breakthroughEpsilon - Standard 0.02 (2%)
 * @property {number} breakthroughMinSeconds - Standard 3
 * @property {number} mpaExponent - Standard 2 (Kontro 2024/2025), 1 = Original-Morton
 * @property {number} refitWindowDays - Standard 90
 * @property {number} maxDropPerBreakthrough - Standard 0.05 (5%)
 * @property {number} minSupportingActivitiesForDrop - Standard 2
 * @property {number} medalThreshold - Standard 0.01 (1%)
 * @property {number} refitNearMpaThreshold - Standard 0.05 (5% Abstand zur MPA)
 * @property {number} initialSignatureWindowDays - Standard 90
 * @property {number} outlierMaxWatts - Standard 2500 (absolute Plausibilitaetsgrenze)
 * @property {number} outlierMaxJumpWatts - Standard 1800 (Sprung ggue. beiden Nachbarn)
 * @property {number} maxGapSecondsForWbalContinuity - Standard 1800 (30 Min); danach W'bal-Reset auf voll
 */

export {};
