# Rechenkern (M1)

Reine JavaScript-Bibliothek fuer alle Modellberechnungen der Performance-App
(siehe [`../docs/LASTENHEFT.md`](../docs/LASTENHEFT.md), Kap. 5–7). Kein I/O,
keine Zufallszahlen, keine Abhaengigkeiten. Laeuft unveraendert in Node, im
Browser und in einem Web Worker (NFA-04).

## Status

Diese Version deckt den **M1-Umfang** ab (Kap. 10):

- Datenqualitaet: 1-Hz-Resampling, Luecken-Markierung, Ausreisserfilter (FA-DQ-01 bis 04)
- NP/IF/TSS, hrTSS, Pace-TSS **inkl. automatischer Sportart-Schwellen-Schaetzung**
  (Kap. 6.6/FA-TP-01 bis 05, siehe M1-Festlegung "Sportart-Schwellen-Schaetzung" unten)
- Mean-Maximal-Power, 2- und 3-Parameter-CP-Fit (Morton) mit robuster IRLS-Regression
- MPA (Kap. 7.2), W'bal nach Skiba 2015 (Kap. 7.3)
- Breakthrough-Erkennung und Refit mit Umverteilung, Absenkbremse, Medaillen (Kap. 7.4/7.5)
- Strain Score (Kap. 7.6) – exakt gegen die Testvektoren aus dem Lastenheft geprueft
- 2-Parameter-Konsistenzpruefung (FA-SIG-14)
- Chronologische Signatur-Orchestrierung inkl. Verwerfen/Reaktivieren von Breakthroughs
- Parser fuer den Strava-Datenexport (activities.csv, GPX, TCX, FIT) – FA-SYNC-06, Entwicklungspfad
- Lokale Sichtkontrollseite (`www/index.html`)
- **Vorgezogen aus M4**: belastungsgekoppelter Signaturverlauf inkl. voller
  Kalibrierung (FA-SIG-10/12, Kap. 7.7/7.8) - tau1,s per Grid-Search, k1,s per
  Least-Squares je System, Hold-out-Backtesting-Bericht, siehe M4-Festlegung
  "Belastungsgekoppelter Signaturverlauf" unten

**Nicht** in M1/dieser Runde: das Stoffwechselmodell (Kap. 7.9 → M5).

## Stand der Verifikation

Alle 68 automatisierten Tests laufen gruen (`npm test` im `core`-Ordner).
Zusaetzlich wurde der komplette Aktivitaetsbestand eines echten Nutzers
(1977 Rad-Aktivitaeten mit Leistung, 2017–2026, aus der bestehenden
`strava-dashboard`-Datenbank, siehe `scripts/run-legacy-db.js`) mehrfach
durchgerechnet: Signaturverlauf mit 14 erkannten Breakthroughs (1 Gold, 5
Silber, 8 Bronze), **ohne Absturz und ohne `constraintUnsatisfied`-Warnung**.
Dabei kamen im Laufe der Entwicklung drei echte Bugs zum Vorschein und
wurden behoben: siehe "Nebenbedingung nach dem Refit" unten. Bemerkenswert:
vor diesen Fixes zeigte derselbe Datensatz zeitweise 144–176 "erkannte"
Breakthroughs mit bis zu 62 % `constraintUnsatisfied`-Quote - dieser starke
Rueckgang auf 14 durchweg plausible Breakthroughs ist selbst ein Indiz dafuer,
dass die fruehere Instabilitaet (falsch eskalierte `pMax`/`CP`-Werte, die die
nachfolgende MPA-Kurve verzerrten und dadurch kaskadierend weitere
Schein-Breakthroughs erzeugten) tatsaechlich behoben ist, nicht nur die
Symptomanzeige. Die M1-Abnahmepunkte "Testvektoren", "W'bal-Verhalten",
"Determinismus" und "vollstaendiger Datensatz laeuft durch" sind damit
erfuellt.

**NFA-04 (Performance) formal bestaetigt:** isolierte Neuberechnung
(MPA+W'bal+Strain) einer echten 7.2h-Aktivitaet, 30 Wiederholungen mit
`process.hrtime`: min 0.85 ms / median 1.12 ms / max 1.98 ms (Ziel ≤ 2000 ms)
auf einem Intel Core i7-8550U (Node v24.19.0, Windows). Siehe
`scripts/run-legacy-db.js`-Ausgabe.

**FIT-Parser gegen eine echte Geraetedatei verifiziert:** eine reale
Garmin/Wahoo-`.fit`-Datei (547 KB, 2h-Intervalltraining, 7037
record-Meldungen) wurde mit `scripts/verify-fit.js` erfolgreich geparst und
durch den vollstaendigen M1-Pfad (Resampling, Ausreisserfilter, MMP)
geschickt; Leistungs-, Herzfrequenz- und Kadenzwerte sowie die
MMP-Stichproben (5s=371W, 60s=338W, 300s=320W) sind plausibel und passen zur
Trainingseinheit. Damit ist der bisher einzige unverifizierte Punkt des
Datenimports geschlossen.

Einzig noch offen (nicht M1-blockierend, da inhaltlich durch den
Legacy-DB-Testlauf abgedeckt): der Testlauf mit einem frischen
Strava-Datenexport (`scripts/run-export.js`, FA-SYNC-06) als der eigentlich
spezifizierte Entwicklungspfad, statt der schnelleren Alternative ueber die
bestehende `strava-dashboard`-Datenbank.

```bash
cd core
npm test
```

Node 18+ genuegt (fuer `scripts/run-legacy-db.js` wird `node:sqlite` benoetigt,
das ist ab Node 22.5 eingebaut), es gibt keine Abhaengigkeiten zu installieren.

## Einheitenkonvention

W' (HIE) wird **intern durchgehend in Joule** gefuehrt (Feld `wPrimeJ`). Nur
die Anzeigeschicht rechnet in kJ um (Kap. 5.2 zeigt HIE in kJ). Grund: die
Differentialgleichung in Kap. 7.3 ist in Joule/Watt konsistent, eine
kJ-Umrechnung mitten im Rechenkern waere eine unnoetige Fehlerquelle.

## M1-Festlegungen (Kap. 10, Abnahmekriterium)

### JavaScript statt TypeScript

Der Rechenkern ist reines JavaScript (ES-Module) ohne Build-Schritt. Begruendung:

1. Muss unveraendert in Node (Tests, Datenexport-Importpfad), im Browser-UI-Thread
   und im Web Worker laufen (NFA-04) – ein Build-Schritt waere fuer M1 unnoetiger
   Overhead, bevor ueberhaupt eine Build-Kette fuer Cloudflare Pages steht (die
   kommt ohnehin erst in M2).
2. NFA-06 verlangt Testbarkeit ohne Netzwerk/Speicher – `node --test` auf reinem
   JS erreicht das ohne jede Abhaengigkeit.
3. Der Umstieg auf TypeScript bleibt jederzeit moeglich (JSDoc-Typen in
   `src/types.js` sind bereits vorhanden und geben einem spaeteren `tsc
   --checkJs`- oder `.ts`-Umstieg einen Kopfstart), sobald in M2 ohnehin ein
   Bundler fuer das Frontend eingerichtet wird.

Build-Werkzeug fuer M1: keins. Testrunner: `node:test` (eingebaut seit Node 18).

### Stream-Format (intern)

`Stream1Hz` (siehe `src/types.js`): ein Objekt aus parallelen typisierten Arrays
(`Float64Array`/`Uint8Array`) gleicher Laenge, Index = Sekunde seit
Aktivitaetsbeginn. Kein Array von Objekten (`{t, watts, ...}[]`) – bei
mehrstuendigen Aktivitaeten (NFA-04: 6h-Ziel) spart das massiv Speicher und
macht die Sekunden-fuer-Sekunde-Verarbeitung (W'bal, MPA, Strain) cache-freundlich.

Das **Ablageformat** in `streams/YYYY-MM.bin` (Kap. 5.2, Komprimierung) ist
davon getrennt zu sehen und wird erst in M2 (Drive-Anbindung) festgelegt.

### Ausreisserregel (FA-DQ-03)

Eine Sekunde gilt als Ausreisser, wenn:

- die Leistung eine absolute Plausibilitaetsgrenze ueberschreitet (Standard
  2500 W, `outlierMaxWatts`) – deckt Sensorfehler/Ueberlauf ab, oder
- sie gegenueber dem Mittel der validen Nachbarsekunden um mehr als
  `outlierMaxJumpWatts` (Standard 1800 W) nach oben springt **und** die naechste
  Sekunde diesen Sprung nicht bestaetigt (faellt wieder auf Nachbarniveau
  zurueck).

Der zweite Teil ist bewusst so gebaut, dass echte kurze Sprints (die sich per
Definition ueber mindestens 2 Sekunden halten) nicht faelschlich verworfen
werden, waehrend Einzelsekunden-Spikes (klassischer Sensor-Ausreisser: ein
Wert, der sofort wieder verschwindet) erkannt werden. Beide Schwellen sind
einstellbar (Kap. 12).

### Luecken-/Pausenbehandlung (FA-DQ-02/04)

- Luecken werden **nicht** interpoliert, sondern pro Sekunde markiert
  (`gap[i] = 1`), Rohwert bleibt 0/unbekannt.
- Fuer NP/TSS/MMP werden Luecken und Ausreisser aus dem Signal **entfernt**
  (Segmentierung an lueckenlosen validen Laeufen, siehe `mmp.js#validSegments`),
  nicht als 0 W gezaehlt – sonst wuerden Pausen die Normalized Power kuenstlich
  verzerren.
- Fuer W'bal/MPA/Strain gilt dagegen explizit FA-DQ-04: Erholung laeuft in
  Pausen bei Leistung 0 weiter. Hier werden Luecken/Ausreisser daher als 0 W
  in die Differentialgleichung eingespeist (`quality.js#wattsForRecovery`).
- **Lange Luecken zwischen Aktivitaeten** (nicht innerhalb einer Aufzeichnung):
  W'bal wird pro Aktivitaet berechnet. Liegt der Abstand zur vorherigen
  Aktivitaet unter `maxGapSecondsForWbalContinuity` (Standard 30 Minuten,
  Kap. 12), wird der Endzustand der vorherigen Aktivitaet als Startwert
  uebernommen (z. B. zwei Einheiten am selben Tag mit kurzer Pause). Darueber
  hinaus gilt der Zustand als vollstaendig erholt (Start = volles W'), was bei
  den in Kap. 7.3 gegebenen Zeitkonstanten ohnehin nach wenigen Minuten der
  Fall waere.

### Robuste Regression fuer den Refit (Kap. 7.5)

IRLS (Iteratively Reweighted Least Squares) mit Tukey-Biweight-Gewichten
(`c = 4.685`, Standard-Tuning-Konstante fuer ~95% Effizienz bei
normalverteilten Residuen) um die Levenberg-Marquardt-Kleinste-Quadrate-Anpassung
aus `power-model.js` (Ausgangslage, siehe Kap. 2), drei aeussere Iterationen.
Bekanntes, gut dokumentiertes Standardverfahren fuer robuste nichtlineare
Regression, kein Blackbox-Heuristik-Ersatz.

### "Naehe zur MPA" fuer Refit-Punkte (Kap. 12, offener Parameter)

`refitNearMpaThreshold`, Standard 5 % relativer Abstand
(`|MPA(t) - P(t)| / MPA(t) <= 0.05`). Zusammenhaengende Sekunden innerhalb
dieser Naehe werden zu einem Stuetzpunkt `{t: Laufdauer, watts: Durchschnitt}`
zusammengefasst – analog zur Mean-Maximal-Power-Extraktion, aber auf
Rohsekunden statt auf dem festen Dauerraster.

### "Gestuetzt" fuer die Absenkbremse (Kap. 7.5, F9)

Die Absenkbremse (max. 5 % Absenkung pro Parameter und Breakthrough) wird nur
dann aufgehoben (volle Absenkung erlaubt), wenn die Envelope-Stuetzpunkte der
letzten `refitWindowDays` (Standard 90 Tage) aus **mindestens 2 unterschiedlichen
Aktivitaeten** stammen (`supportingActivityIds` aus `mmp.js#detectMaximalEfforts`).
Sonst wird auf maximal 5 % Absenkung geklemmt.

### Nebenbedingung nach dem Refit (Kap. 7.5)

Nach der robusten Regression (inkl. Absenkbremse) muss die MPA mindestens auf
Hoehe der gemessenen Leistung liegen. Diese Festlegung ist in zwei Runden
gegen den echten 7-Jahres-Aktivitaetsbestand des Auftraggebers (1977
Aktivitaeten, `scripts/run-legacy-db.js`) verifiziert und dabei zweimal
nachgebessert worden - beide Korrekturen und die jeweils zugrunde liegende
Beobachtung sind hier absichtlich stehen gelassen, weil sie fuer kuenftige
Aenderungen an dieser Stelle relevant bleiben.

**1. Geprueft wird NUR innerhalb der erkannten Breakthrough-Fenster** (Kap. 7.4),
nicht ueber die gesamte Aktivitaet, obwohl der Lastenheft-Wortlaut
("ueberall") das zunaechst nahelegt. Grund: Ist W'bal einmal vollstaendig
entladen, gilt nach Kap. 7.2 immer `MPA = CP`, unabhaengig von `pMax`. Eine
woertliche "ueberall in der Aktivitaet"-Pruefung ist daher bei jeder
mehrstuendigen Fahrt mit Anstrengung nach voller Entladung strukturell
unerfuellbar (Modell-Eigenschaft, kein Sonderfall) - im ersten Testlauf waren
dadurch 71 % aller Breakthroughs faelschlich als "unerfuellbar" markiert,
weil lange Ausfahrten fast immer irgendwann eine Anstrengung nach
Erschoepfung enthalten. Die Pruefung auf die tatsaechlich neu entdeckten
Ueberschreitungs-Fenster zu beschraenken bildet ab, wofuer der Refit
ausgeloest wurde.

**2. Korrektur ueber zwei Hebel, nicht nur `pMax`.** Auch innerhalb eines
Breakthrough-Fensters kann W'bal mitten in einer laengeren, harten Anstrengung
vollstaendig entladen werden (z. B. eine 15-Minuten-Anstrengung knapp ueber
der alten Schwelle) - und dort hilft `pMax`-Erhoehung nicht, weil MPA bei
voller Entladung immer exakt `CP` ist, unabhaengig von `pMax`. Nach Einfuehrung
von Punkt 1 allein stieg die Zahl falsch markierter Breakthroughs im Testlauf
sogar auf 109 (von 176) - genau dieser Fall. Die Korrektur unterscheidet
deshalb, WO die Verletzung auftritt (Erschoepfungsanteil am staerksten
verletzten Punkt im Fenster):
- **Nahe voller Entladung** (> 98 % erschoepft): nur `CP` in 1-%-Schritten
  erhoehen - das ist der einzige wirksame Hebel dort und entspricht inhaltlich
  genau dem, wofuer ein Breakthrough steht ("die Schwelle war zu niedrig").
- **Sonst** (W'bal noch vorhanden): `pMax` in 1-%-Schritten erhoehen, wie
  urspruenglich.

Beide Hebel sind nach oben begrenzt (`maxPlausiblePMax`, Standard 3000 W;
`maxPlausibleCp`, Standard 600 W - beide grosszuegig ueber jedem bekannten
menschlichen Spitzenwert bzw. Schwellenleistung). Das ist der verbleibende
Schutz gegen unentdeckte, dauerhaft zu hohe Leistungswerte (z. B. ein
fehlerhafter Smart-Trainer): ohne diese Grenzen lief `pMax` im allerersten
Testlauf bei einer von 1977 Aktivitaeten auf 65147 W hoch. Werden beide
Grenzen erreicht, ohne dass die Bedingung erfuellt ist, bleiben `cp`/`pMax`
dort stehen und der Breakthrough traegt `constraintUnsatisfied: true` als
Hinweis auf ein Datenqualitaetsproblem in dieser Aktivitaet, statt die
unplausible Signatur unbemerkt zu uebernehmen.

Regressionstests fuer alle drei Faelle (echter Datenfehler, normale lange
Ausfahrt ausserhalb des Fensters, Entladung innerhalb eines echten
Breakthrough-Fensters) in `test/breakthrough.test.js`.

Nach Einfuehrung beider Korrekturen (Fenster-Beschraenkung + Zwei-Hebel-Logik)
zeigt der vollstaendige 7-Jahres-Datensatz **0 von 14** Breakthroughs mit
`constraintUnsatisfied: true` (siehe "Stand der Verifikation" oben) - die
Nebenbedingung gilt damit als verifiziert abgeschlossen fuer M1.

**Transparenz-Ergaenzung (2026-09-18, NFA-11):** `constraintUnsatisfied`
zeigt nur den Fall, dass SELBST die Plausibilitaetsgrenzen die Bedingung
nicht erfuellen - der haeufigere Fall, dass die Korrektur cp/pMax spuerbar
angehoben, aber unterhalb der Grenzen konvergiert ist, blieb bisher
unsichtbar (genau das war der Auftraggeber-Feedback-Fall: gemeldete PP/HIE
deutlich zu hoch, ohne dass ein einzelner Breakthrough als fehlerhaft
markiert war). Jeder Breakthrough fuehrt deshalb jetzt zusaetzlich `rawFit`
mit (das rohe `fitMortonRobust`-Ergebnis VOR Absenkbremse und
Nebenbedingungs-Korrektur, `signature.js`), `breakthroughView.js` zeigt bei
>= 2 % Abweichung zur finalen Signatur eine Zeile mit rohem vs. korrigiertem
Wert je Parameter. Reine Diagnose/Anzeige, kein Eingriff in die Berechnung
selbst - Grundlage fuer die weitere Untersuchung des gemeldeten PP/HIE-
Ueberschaetzungsproblems (siehe "Bekannte offene Punkte" unten).

### Startsignatur ohne ausreichende Daten (FA-SIG-03)

Reicht die Datenbasis der ersten 90 Tage nicht (weniger als 4
Envelope-Stuetzpunkte, oder die Regression konvergiert nicht zu einem
3-Parameter-Modell), liefert `computeInitialSignature` `signature: null` mit
einem lesbaren Grund. Es wird **keine** erfundene Literatur-Startsignatur fuer
TP/HIE/PP eingesetzt – anders als bei den Zeitkonstanten in Kap. 7.8 gibt das
Lastenheft fuer TP/HIE/PP selbst keine Literaturwerte vor (F7: "keine
XERT-Referenz", individueller Fit). Die App sollte in diesem Fall einen
Hinweis anzeigen statt einer Kennzahl.

### Aktivitaeten innerhalb des Startfensters

Aktivitaeten, deren Datum vor dem Ende des 90-Tage-Startfensters liegt,
fliessen nur in die Startsignatur-Regression ein und bekommen selbst keine
eigene Breakthrough-Auswertung (`hasSignature: false` im Ergebnis) – vor der
Startsignatur gibt es schlicht nichts, wogegen ein "Breakthrough" definiert
waere.

### Schwelle der auslösenden Aktivitaet selbst (FA-TP-08, Grenzfall)

Loest eine Aktivitaet einen Breakthrough aus, wird fuer **diese** Aktivitaet
(NP/TSS/IF/Strain) noch die alte (Vor-Breakthrough-)Schwelle verwendet – der
Breakthrough wurde ja erst waehrend dieser Fahrt "entdeckt", der groesste Teil
der Fahrt fand unter der alten Signatur statt. Die neue Signatur gilt ab dem
Datum fuer alle **folgenden** Aktivitaeten. Alternative Lesart waere denkbar,
das Lastenheft legt diesen Grenzfall nicht explizit fest.

### Bewegungszeit fuer TSS

Als `movingTimeSec` fuer die TSS-Formel wird die Anzahl gueltiger
Leistungssekunden (`validPowerMask`-Summe) verwendet, nicht die reine
Aufzeichnungsdauer. Vereinfachung fuer M1; eine feinere Trennung
"angehalten vs. rollend ohne Leistungsdaten" folgt bei Bedarf in M3.

### Sportart-Schwellen-Schaetzung (FA-TP-03/04, Kap. 12, offene Methodik)

Das Lastenheft schreibt vor, DASS Schwellen-HF je Sportart sowie Lauf-/Schwimm-
Schwellenpace automatisch aus eigenen Daten geschaetzt werden ("als Schaetzung
gekennzeichnet und mit Datum versioniert"), legt aber bewusst keine konkrete
Methode fest (anders als z. B. die CP-Regression in Kap. 7.1). `src/pace.js`
(pro Aktivitaet) + `src/thresholds.js` (Chronologie ueber alle Aktivitaeten)
treffen dafuer folgende Festlegungen:

- **"Beste Anstrengung" je Aktivitaet** = bester gleitender Mittelwert (Pace
  bzw. HF) ueber `thresholdEffortSeconds` (Standard 1200s/20 Min) - dieselbe
  Praefixsummen-Technik wie fuer die Mean-Maximal-Power (`mmp.js`), nur auf
  Geschwindigkeit/Herzfrequenz statt Watt angewandt. Dafuer wurde die
  Rundung aus `meanMaximalPower` (auf ganze Watt, fuer die Anzeige gedacht)
  in eine eigene ungerundete Funktion `mmp.js#bestMeanOverWindows`
  ausgelagert - eine Rundung auf ganze m/s waere bei typischen Lauf-
  geschwindigkeiten (2-6 m/s) viel zu grob gewesen (im ersten Testlauf
  schnappte dadurch jede Pace-Schaetzung auf einen ganzzahligen m/s-Wert).
- **Rollierendes Fenster** (`thresholdEstimationWindowDays`, Standard 180
  Tage): die Schwelle ist das Maximum der besten Anstrengungen aller
  Aktivitaeten der Sportart in diesem Fenster, zum jeweiligen
  Aktivitaetsdatum neu ausgewertet (FA-TP-08: chronologisch gueltige
  Schwelle je Datum, analog zu `signatureAtDate`/`thresholdAtDate`). Anders
  als bei CP gibt es keinen Breakthrough-/Refit-Mechanismus - das
  rollierende Fenster uebernimmt dessen Rolle: eine Bestleistung "verjaehrt"
  nach `thresholdEstimationWindowDays`, statt fuer immer als Schwelle stehen
  zu bleiben, obwohl sich die Form laengst veraendert hat.
- **Neuer Historien-Eintrag** nur bei einer Aenderung >= `thresholdChangeEpsilon`
  (Standard 2%) gegenueber dem vorherigen Wert - sonst waechst die Historie
  mit jeder Aktivitaet der Sportart, ohne neue Information zu tragen.
- **Kein Mindest-Datenumfang** (anders als FA-SIG-03s "mind. 4
  Envelope-Stuetzpunkte" fuer die Startsignatur): eine einzelne echte
  20-Minuten-Anstrengung ist bereits eine legitime erste Schaetzung
  (besser als gar keine, und korrekt als Schaetzung datiert) - eine
  kuenstliche Mindestanzahl ist im Lastenheft nicht gefordert.
- **Rad-Schwellen-HF (FA-TP-04) ist methodisch die Ausnahme**: statt "beste
  Anstrengung" wird die mittlere Herzfrequenz aller Sekunden verwendet, an
  denen die Leistung innerhalb von `thresholdCyclingPowerTolerance`
  (Standard 5%) um die TP der Signatur zum Aktivitaetsdatum lag - exakte
  Lastenheft-Vorgabe ("aus Radeinheiten mit Leistung nahe der TP"). Das ist
  praeziser als die generische Methode, weil sie an eine bereits
  leistungsbasiert verifizierte Schwelle gekoppelt ist, und dient explizit
  Radfahrten OHNE Leistungsmesser (z. B. Indoor-Spinning) als hrTSS-Basis.
- **`computeSignatureHistory` selbst bleibt unveraendert.** Ohne
  Sonderbehandlung durchlaeuft eine Aktivitaet ohne Leistung dort die
  leistungszentrierte Pipeline inert (alle Watt-Werte 0 -> leere MMP-Kurve,
  keine Breakthrough-Fenster) und bekommt ein fabriziertes `tss: 0`/`np: 0`.
  `applySportSpecificTss` laeuft als bewusst getrennter ZWEITER Durchlauf
  danach: erkennt anhand der validen Leistungsmaske (nicht anhand des
  TSS-Werts selbst, sonst waere eine echte, aber zufaellig winzige
  Leistungs-Aktivitaet betroffen), ob eine Aktivitaet echte Leistungsdaten
  hat, und ersetzt sonst das fabrizierte Ergebnis durch Pace-TSS (Lauf,
  Schwimmen - hrTSS als Fallback, falls keine Pace-Schwelle schaetzbar ist)
  bzw. hrTSS (alle anderen Sportarten inkl. leistungsloser Radfahrten). Bleibt
  auch das erfolglos, wird `tss` explizit `null` (FA-TP-05), statt bei der
  irrefuehrenden `0` zu bleiben. Diese Trennung haelt die bereits gegen den
  7-Jahres-Datensatz verifizierte CP-/Breakthrough-Pipeline unangetastet.

### Belastungsgekoppelter Signaturverlauf (FA-SIG-10/12, Kap. 7.7/7.8, M4-Festlegung)

M4 ("3D-Modell und Kalibrierung") ist eigentlich ein spaeterer Meilenstein als
M1-M3 - anders als bei den vorherigen M1-Festlegungen ist hier VOM LASTENHEFT
SELBST offen gelassen, dass ein sinnvoller Wert fuer k1,s/k2,s ohne
Kalibrierung gar nicht existiert ("theoretisch begruendet, aber experimentell
nicht validiert... fuer systemspezifische Parameter existieren keine
veroeffentlichten Daten", Kap. 7.7 "Einordnung"). `src/loadResponse.js`
implementiert deshalb in zwei Schritten:

- **"Umrechnungsfaktor" (Kap. 7.7) = k1,s selbst.** Kap. 7.8 nennt genau 6
  frei geschaetzte Parameter (tau1,s und k1,s je System) - kein zusaetzlicher
  7. Parameter. p_s(t) = g_s(t) − h_s(t) liegt in rohen
  Strain-Score-Tageseinheiten vor, k1,s skaliert das direkt in W (TP/PP)
  bzw. J (HIE, intern immer Joule wie ueberall sonst im Code).
- **tau1,s per Grid-Search ueber den Literaturbereich** (Kap. 7.8:
  "35-51 Tage", `TAU1_MIN_DAYS`/`TAU1_MAX_DAYS`, Schrittweite 1 Tag): je
  Kandidat wird k1,s per Least-Squares-Fit durch den Ursprung gegen die
  tatsaechlich bestaetigten Breakthrough-Deltas geschaetzt (Stand von p_s am
  Tag VOR dem jeweiligen Breakthrough), der Kandidat mit der kleinsten
  Fehlerquadratsumme gewinnt (`calibrateTau1K1`).
- **k1,s feste Grenzen** (Kap. 7.8 verlangt "feste Grenzen" fuer BEIDE frei
  geschaetzten Parameter, nicht nur tau1,s - anders als bei tau1,s existiert
  fuer k1,s aber kein Literaturbereich, Kap. 7.7 "Einordnung": keine
  veroeffentlichten Daten fuer systemspezifische Parameter). Die
  Strain-Score-Skalierung (Kap. 7.6, kappa_strain=1,00 fuer die
  Referenzaktivitaet) ist so gewaehlt, dass k1,s=1 bereits der "neutrale"
  Umrechnungsfaktor waere - als feste Grenzen dient deshalb eine Bandbreite
  um diesen Anker, Faktor 5 in jede Richtung (`K1_MIN=0,2`, `K1_MAX=5`), statt
  eines unbeschraenkten Fits, der bei wenigen Stuetzpunkten (Mindestanzahl oft
  nur 3) leicht auf unplausible oder sogar negative Werte ueberschiessen
  kann. Der unbeschraenkte Least-Squares-Wert wird auf den naechstgelegenen
  Grenzwert gekappt (`fitK1ThroughOrigin`, exakt das beschraenkte Optimum bei
  einer eindimensionalen Regression durch den Ursprung), die Fehlerquadratsumme
  fuer die tau1-Auswahl wird konsistent mit dem GEKAPPTEN k1 berechnet. Ein
  `clamped: true`-Flag markiert im Bericht/UI, wenn das passiert ist (M4-Abnahme
  Kap. 10: "Die Kalibrierung liefert Parameter innerhalb der Grenzen").
- **k2,s = 1** (fest, Kap. 7.8 verlangt "Literaturwerte", die es dafuer nicht
  gibt) - dieselbe implizite Wahl, die der Rechenkern bereits fuer
  TSB = CTL − ATL trifft. g (tau1, lang/traege - wie CTL) und h (tau2, kurz/
  reaktionsschnell - wie ATL) sind beide EWMAs derselben Tagesbelastung mit
  unterschiedlichem tau, k2,s=1 macht p_s zu einer reinen
  "langsam-minus-schnell"-Differenz (analog zu TSB), k1,s skaliert erst danach.
  Kap. 7.8 nennt fuer tau2 zusaetzlich einen "Literaturbereich" (8-13 Tage) -
  Widerspruch zu Kap. 12s explizitem Fixwert (7 Tage). tau2 bleibt bei 7
  (Kap. 12s Wert), der 7.8-Bereich wird nicht verwendet, da tau2 ohnehin nicht
  gefittet wird.
- **Exakte Exponentialform** aus Kap. 7.7
  (`g(t)=g(t-1)*e^(-1/tau1)+w(t)*(1-e^(-1/tau1))`), bewusst NICHT die lineare
  `value += (v-value)/tau`-Naeherung, die `npTss.js#computeEwmaSeries` fuer
  CTL/ATL verwendet - das Lastenheft gibt hier explizit die exakte Formel vor.
- **Reset bei Breakthrough**: g_s/h_s werden am Tag eines NICHT verworfenen
  Breakthroughs auf 0 zurueckgesetzt (Kap. 7.7: "Breakthroughs setzen den
  Zustand gemaess 7.5 neu"), danach laeuft dieser Tag normal (inkl. seiner
  eigenen Belastung) weiter - sonst wuerde die im Refit bereits eingepreiste
  Verbesserung nochmal on top addiert.
- **Fallback-Schwelle** (`loadResponseMinBreakthroughsForFit`, Standard 3):
  unterhalb dieser Anzahl an eigenen bestaetigten Breakthroughs bleibt es beim
  Literatur-tau1 (42 Tage) und k1=1, klar als "Fallback" gekennzeichnet
  (`fitted: false`) statt unbelegte Zahlen als fertig kalibriert zu tarnen
  (Kap. 7.8: "Fallback-Regel... wird angezeigt"). Die Stuetzpunkt-Anzahl
  haengt nicht von tau1 ab, deshalb wird sie nur einmal (mit dem
  Literatur-Startwert) geprueft, bevor die Grid-Search ueberhaupt laeuft.
- **Hold-out-Backtest** (`holdOutBacktest`, Kap. 7.8 Abnahme): Kalibrierung
  NUR auf der Historie bis zu einem Stichtag (spaetestes Datum minus
  `loadResponseHoldOutMonths`, Standard 6 - Kap. 12 listet das als eigene
  einstellbare Groesse), Vorhersage laeuft mit dem trainierten tau1/k1 ueber
  die volle Historie weiter. Bericht je System: mittlere absolute Abweichung
  (MAE) zwischen vorhergesagtem und tatsaechlichem Breakthrough-Delta fuer
  alle Breakthroughs NACH dem Stichtag, in W (TP/PP) bzw. kJ (HIE - Kap. 7.8
  verlangt kJ fuers Reporting, intern bleibt sonst ueberall Joule). Ohne
  Breakthroughs nach dem Stichtag: `testCount: 0`, klar im UI gekennzeichnet
  statt einer leeren/falschen Zahl.
- **Abschlag-Empfehlung aus dem Bericht** (Kap. 12: "Startwert wird im
  Backtesting bestimmt"): `empfohlenerAbschlagPct = clamp(MAE / mittlere
  |tatsaechliches Delta|, 0, 0.5) * 100` - der Abschlag entspricht der
  relativen Groesse des typischen Vorhersagefehlers, gedeckelt bei 50%. Reine
  ANZEIGE-EMPFEHLUNG (`suggestedDiscountPct`), wird NICHT automatisch in
  `settings.json` geschrieben (FA-SET-03: Parameteraenderungen sind explizite
  Nutzeraktionen) - `loadResponseDisplayDiscountPct` bleibt bei 0, bis der
  Nutzer die empfohlene Zahl selbst in den Einstellungen eintraegt.

`dailyStrainSums`/`loadResponseSeriesForSystem`/`loadResponseSeries`/
`fitK1ThroughOrigin`/`calibrateTau1K1`/`holdOutBacktest`/
`displaySignatureAtDate` sind als weiterer, von `computeSignatureHistory`
unabhaengiger Durchlauf gebaut (gleiches Muster wie
`estimateThresholds`/`applySportSpecificTss`) - lesen nur bereits vorhandene
Strain-Sub-Scores und die Breakthrough-Historie, aendern nichts an der
bereits verifizierten CP-/Breakthrough-Pipeline.

## Bekannte offene Punkte / Risiken

- **FIT-Parser (`src/importers/fit.js`) ist inzwischen gegen eine echte
  Geraetedatei verifiziert** (siehe "Stand der Verifikation" oben,
  `scripts/verify-fit.js`) - zusaetzlich zur synthetischen Minimaldatei
  (`test/importers/fit.test.js`). Ungewoehnliche Geraete-Varianten (andere
  Entwicklerfelder, abweichende Skalierungen) sind damit nicht generell
  ausgeschlossen, nur der getestete Fall.
- GPX-Dateien enthalten in der Praxis selten Leistungsdaten (kein offizieller
  GPX-Standard dafuer) – der Parser unterstuetzt das `<power>`-Element, das
  einige Tools schreiben, aber die meisten Original-Aufzeichnungen von
  Leistungsmessern liegen als FIT vor.
- `.gz`-komprimierte Originaldateien (Strava komprimiert grosse Exports)
  muessen vom Aufrufer vor dem Parsen entpackt werden (z. B.
  `zlib.gunzipSync` in Node, `DecompressionStream('gzip')` im Browser) – nicht
  Teil dieses Moduls, um keine Kompressions-Abhaengigkeit einzufuehren.
- Alle in diesem Modul stehenden Tests wurden von Hand gegen die Formeln
  geprueft, aber in dieser Sitzung mangels Shell-Zugriff nicht ausgefuehrt
  (siehe oben). Bitte `node --test` laufen lassen, bevor auf M1 aufgebaut wird.
- Performance einer vollstaendigen Mehrjahres-Historie (viele Aktivitaeten,
  jede mit eigenem Refit/Envelope-Aufruf) ist nicht optimiert/gemessen –
  NFA-04 fordert nur die Neuberechnung einer einzelnen 6h-Aktivitaet ≤ 2s,
  nicht die Gesamthistorie. Bei Bedarf (grosse Gruppen-Historien) spaeter
  Memoisierung der Envelope-Berechnung ergaenzen.
- **Sportart-Schwellen-Schaetzung (FA-TP-03/04)** ist mit synthetischen
  Testdaten verifiziert (`pace.test.js`, `thresholds.test.js`,
  `computePipeline.test.js`), aber NICHT gegen einen echten Datensatz mit
  Lauf-/Schwimm-/HF-only-Aktivitaeten wie die CP-Pipeline (siehe "Stand der
  Verifikation" oben, 1977 Rad-Aktivitaeten). Die Rolling-Window-Suche selbst
  ist zudem nicht auf grosse Sportart-Historien optimiert (O(n * Fenstergroesse)
  je Sportart, siehe "M1-Festlegung" oben) - fuer eine einzelne Sportart mit
  vielen hundert Aktivitaeten voraussichtlich unproblematisch, aber ungemessen.
- **Belastungsgekoppelter Signaturverlauf (FA-SIG-10/12)** ist nur mit
  synthetischen Testdaten verifiziert (`loadResponse.test.js`), NICHT gegen
  echte Breakthrough-Historien - die Grid-Search/der k1-Fit braucht dafuer
  echte Nutzer mit genug bestaetigten Breakthroughs (Standard-Schwelle 3 fuer
  die Kalibrierung, der Hold-out-Bericht zusaetzlich Breakthroughs NACH dem
  6-Monate-Stichtag). Das Modell selbst bleibt laut Lastenheft "theoretisch
  begruendet, aber experimentell nicht validiert" (Kap. 7.7) - auch mit
  vollstaendiger Kalibrierung ist der Signaturverlauf ein datengestuetzter
  Trend, keine wissenschaftlich validierte Vorhersage.
- **Gemeldete PP/HIE-Ueberschaetzung (2026-09-18, laufende Untersuchung):**
  der Auftraggeber berichtet, das modellierte PP liege dauerhaft ueber der
  gemessenen besten 5-s-Leistung UND ueber dem eigenen, per `outlierMaxWatts`
  personalisierten Plausibilitaetsdach - auch HIE wirkt zu hoch. Arbeitshypothese
  (aus Code-Analyse, noch nicht am echten Datensatz bestaetigt): das
  3-Parameter-Modell extrapoliert `pMax` als t→0-Asymptote aus nur 1-Hz-Daten
  (kuerzeste Stuetzstelle 1 s) - dieser Bereich ist strukturell schlecht
  bestimmt, ein einzelner "bester 1-s-Wert je Fenster" (`detectMaximalEfforts`,
  ohne Gewichtung nach `support`) hat unverhaeltnismaessig viel Hebelwirkung
  auf die Kruemmung nahe t=0. Zusaetzlich kann die Nebenbedingungs-Korrektur
  (siehe oben) `cp`/`pMax` weit ueber den rohen Regressionswert anheben, ohne
  dass das je Breakthrough sichtbar war. Als ersten Schritt jetzt `rawFit`
  ergaenzt (siehe oben), um am echten Konto zu sehen, WELCHER Mechanismus
  ueberwiegt, bevor am Fit-/Korrektur-Verfahren selbst etwas geaendert wird.

## Verwendung

```js
import { prepareActivity, computeSignatureHistory, mergeSettings, importers } from './src/index.js';

const settings = mergeSettings(); // oder z.B. mergeSettings({ mpaExponent: 1 })

const raw = { id: 'a1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: [...] };
const activity = prepareActivity(raw, settings);

const history = computeSignatureHistory([activity, /* ...weitere */], { settings });
// history.history        -> Signaturverlauf (TP/HIE/PP je Datum)
// history.breakthroughs   -> erkannte Breakthroughs inkl. Medaillen
// history.activityResults -> NP/IF/TSS/Strain je Aktivitaet
```

Zum Verwerfen/Reaktivieren eines Breakthroughs (FA-SIG-07) einfach mit einem
`discardedBreakthroughIds`-Set neu berechnen:

```js
const withoutOne = computeSignatureHistory(activities, {
  settings,
  discardedBreakthroughIds: new Set(['a17']),
});
```

Sportart-Schwellen (FA-TP-03/04) + hrTSS/Pace-TSS-Fallback (FA-TP-02/05) laufen
als zweiter, unabhaengiger Durchlauf NACH `computeSignatureHistory` (`raw.type`
= Strava-Sportart, z. B. `"Run"`, muss dafuer an `prepareActivity` durchgereicht
werden):

```js
const thresholds = estimateThresholds(activities, history.history, settings);
applySportSpecificTss(history.activityResults, activities, thresholds);
// history.activityResults[i].tss/.tssSource jetzt auch fuer Aktivitaeten ohne
// Leistung gefuellt (tssSource: 'power'|'hr'|'pace'), sonst tss:null (FA-TP-05)
```

## Tests

```bash
node --test test/
```

Deckt ab: Strain-Score-Testvektoren (Kap. 7.6), W'bal-Linearitaet/Asymptotik
(Kap. 10 Abnahme), CP-Fit-Rekonstruktion und Robustheit gegen Ausreisser,
Breakthrough-Erkennung (Schwellen, Mindestdauer, Datenqualitaets-Ausschluss),
NP/TSS/hrTSS/paceTSS-Formeln, Sportart-Schwellen-Schaetzung und
hrTSS/Pace-TSS-Routing inkl. FA-TP-05-Kennzeichnung (`pace.test.js`,
`thresholds.test.js`), Determinismus des gesamten Signaturverlaufs, sowie die
Text-/FIT-Importer. `signature.test.js` deckt zusaetzlich genau die beiden
M3-Abnahmekriterien ab, fuer die vorher kein End-zu-Ende-Test existierte: ein
Breakthrough mitten in der Historie aendert die Schwelle nachweislich nur fuer
NACHFOLGENDE Aktivitaeten (die Breakthrough-Aktivitaet selbst zaehlt noch mit
der alten Schwelle), und Verwerfen/Reaktivieren eines Breakthroughs
(FA-SIG-07) fuehrt zu exakt den erwarteten bzw. wiederhergestellten
Kennzahlen. `loadResponse.test.js` (FA-SIG-10/12) prueft die exakte
Exponentialform gegen die Formel aus Kap. 7.7, die Konvergenz bei konstanter
Belastung, den Reset am Breakthrough-Tag, den k1-Least-Squares-Fit inklusive
Fallback unterhalb der Mindestanzahl, dass die tau1-Grid-Search ein bekanntes
synthetisches tau1 wiederfindet, und den Hold-out-Backtest (Train/Test-Split,
MAE-Bericht, "kein Bericht moeglich" ohne Test-Breakthroughs).
