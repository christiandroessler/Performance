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
 * @property {number} maxPlausiblePMax - Standard 3000 (W, absolute Plausibilitaetsgrenze fuer die Nebenbedingungs-Korrektur)
 * @property {number} maxPlausibleCp - Standard 600 (W, absolute Plausibilitaetsgrenze fuer die Nebenbedingungs-Korrektur)
 * @property {number} maxMpaCorrectionPct - Standard 0.2 (20%): relative Obergrenze fuer die Nebenbedingungs-Korrektur gegenueber dem rohen Fit, siehe core/README.md
 * @property {number} pmaxEvidenceMaxSeconds - Standard 20 (s): nur Stuetzpunkte bis zu dieser Dauer zaehlen als Pmax-Sprintevidenz, siehe core/README.md
 * @property {number} minPmaxEvidenceCount - Standard 2: Mindestanzahl an Sprintevidenz-Stuetzpunkten, sonst bleibt Pmax beim Refit fixiert
 * @property {number} pmaxEvidenceMinCpMultiple - Standard 1.8: ein Stuetzpunkt zaehlt nur als Sprintevidenz, wenn er mindestens das X-fache der aktuellen TP erreicht
 * @property {number} maxPmaxChangePerBreakthrough - Standard 0.15 (15%): symmetrische Traegheitsbremse fuer Pmax-Aenderungen je Breakthrough (Anstieg und Abstieg), unabhaengig von der Absenkbremse
 * @property {number} wprimeEvidenceMinSeconds - Standard 120 (s): Stuetzpunkte muessen mindestens diese Dauer haben, um als W'-Evidenz zu zaehlen (kurze Sprints sind Pmax-, nicht W'-informativ), siehe core/README.md
 * @property {number} wprimeEvidenceMaxSeconds - Standard 1200 (s): Stuetzpunkte bis zu dieser Dauer zaehlen als W'-Evidenz (klassischer CP-Testprotokoll-Bereich ~2-20 min), siehe core/README.md
 * @property {number} minWprimeEvidenceCount - Standard 2: Mindestanzahl an W'-Evidenz-Stuetzpunkten, sonst bleibt W' beim Refit fixiert
 * @property {number} wprimeEvidenceMinCpMultiple - Standard 1.05: ein Stuetzpunkt zaehlt nur als W'-Evidenz, wenn er mindestens das X-fache der aktuellen TP erreicht
 * @property {number} maxWprimeChangePerBreakthrough - Standard 0.2 (20%): symmetrische Traegheitsbremse fuer W'-Aenderungen je Breakthrough (Anstieg und Abstieg), unabhaengig von der Absenkbremse
 * @property {number} thresholdEstimationWindowDays - Standard 180 (FA-TP-03/04): rollierendes Fenster fuer Sportart-Schwellen-Schaetzung
 * @property {number} thresholdEffortSeconds - Standard 1200 (20 Min, FA-TP-03): Zieldauer der "besten Anstrengung" fuer Pace-/HF-Schwellen
 * @property {number} thresholdCyclingPowerTolerance - Standard 0.05 (FA-TP-04): Toleranzband um TP fuer die Rad-Schwellen-HF-Schaetzung
 * @property {number} thresholdChangeEpsilon - Standard 0.02 (FA-TP-03/04): neuer Historien-Eintrag erst ab dieser relativen Aenderung
 * @property {number} loadResponseTau1Days - Standard 42 (FA-SIG-10, Kap. 7.7/12): Zeitkonstante tau1 (langsame EWMA g, wie CTL)
 * @property {number} loadResponseTau2Days - Standard 7 (FA-SIG-10, Kap. 7.7/12): Zeitkonstante tau2 (schnelle EWMA h, wie ATL)
 * @property {number} loadResponseMinBreakthroughsForFit - Standard 3 (FA-SIG-12 Phase 1): Mindestanzahl Breakthroughs fuer den k1-Least-Squares-Fit, sonst Neutralwert 1
 * @property {number} loadResponseDisplayDiscountPct - Standard 0 (FA-SIG-10 Anzeige-Abschlag, %): Startwert erst mit FA-SIG-12/Backtesting sinnvoll belegbar
 * @property {number} loadResponseHoldOutMonths - Standard 6 (FA-SIG-12, Kap. 12): Hold-out-Zeitraum fuer den Backtesting-Bericht
 * @property {number} activeMusclePctDefault - Standard 0.3 (30%, Kap. 7.9): Anteil aktiver Muskelmasse am Koerpergewicht fuer Radfahren
 * @property {number} metShortDurationSeconds - Standard 360 (s = 6 min, M5-Festlegung): Kurzzeitbedingung fuer VO2max ("Leistung bei VO2max ~ 6-min-Bestleistung"), siehe core/README.md
 * @property {number} metShortDurationWeight - Standard 1.0 (M5-Festlegung): Gewicht des kurzzeit-abgeleiteten VO2max im gewichteten Mittel mit Laborwerten
 * @property {number} metLabVo2maxWeight - Standard 2.0 (FA-MET-02): Gewicht eines Laborwert-VO2max in der Zielfunktion
 * @property {number} metLabVlamaxWeight - Standard 2.0 (FA-MET-02): Gewicht eines Laborwert-VLamax in der Zielfunktion
 * @property {number} metLabLactateWeight - Standard 2.0 (FA-MET-02): Gewicht eines Laktat-Leistungs-Laborwerts in der Zielfunktion
 * @property {number} metVlamaxMinMmolLs - Standard 0.1 (M5-Festlegung): untere Suchgrenze fuer VLamax
 * @property {number} metVlamaxMaxMmolLs - Standard 1.5 (M5-Festlegung): obere Suchgrenze fuer VLamax
 * @property {number} metVo2maxMinMlKg - Standard 20 (M5-Festlegung): untere Suchgrenze fuer VO2max
 * @property {number} metVo2maxMaxMlKg - Standard 90 (M5-Festlegung): obere Suchgrenze fuer VO2max
 * @property {number} metMlssToleranceWatts - Standard 0.1 (W, M5-Festlegung): Bisektionspraezision fuer die MLSS-Leistung
 * @property {number} metZoneBoundary1Pct - Standard 0.55 (M5-Festlegung, FA-MET-03): Grenze Z1/Z2 relativ zu TP
 * @property {number} metZoneBoundary2Pct - Standard 0.75 (M5-Festlegung, FA-MET-03): Grenze Z2/Z3 relativ zu TP
 * @property {number} metZoneBoundary3Pct - Standard 0.95 (M5-Festlegung, FA-MET-03): Grenze Z3/Z4 relativ zu TP
 * @property {number} metSmoothingWindowSeconds - Standard 30 (s, M5-Festlegung, FA-MET-05): Glaettungsfenster fuer den Aktivitaets-Zeitverlauf, analog NP
 */

/**
 * Ein Eintrag in einer Sportart-Schwellen-Historie (FA-TP-03/04), analog zu Signature
 * (date/source), siehe thresholds.js.
 * @typedef {Object} ThresholdEntry
 * @property {string} date - gueltig ab (YYYY-MM-DD)
 * @property {number} value - Geschwindigkeit in m/s (pace) bzw. Herzfrequenz in bpm (hr)
 * @property {'estimated'} source
 */

export {};
