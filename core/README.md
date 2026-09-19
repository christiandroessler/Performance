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
- **Vorgezogen aus M5**: Stoffwechselmodell (FA-MET-01 bis 07, Kap. 7.9) -
  nur die Steady-State-Variante (V1, Kap. 7.9 "Lookup je Leistungswert",
  M-Prioritaet); die volle dynamische Simulation (S-Prioritaet, "fuer eine
  spaetere Version") ist NICHT Teil dieser Runde, siehe M5-Festlegung
  "Stoffwechselmodell" unten.

## Stand der Verifikation

Alle 98 automatisierten Tests laufen gruen (`npm test` im `core`-Ordner).
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

**Relative Korrekturgrenze (2026-09-18, M1-Festlegung, `maxMpaCorrectionPct`):**
Die `rawFit`-Transparenz-Ergaenzung (unten) hat den tatsaechlichen
Mechanismus hinter der gemeldeten PP/HIE-Ueberschaetzung des Auftraggebers
bestaetigt: `enforceMpaConstraint` durfte cp/pMax bis zur ABSOLUTEN
Plausibilitaetsgrenze (Standard 3000 W/600 W) anheben, ohne rueckzukoppeln,
WIE WEIT das vom eigentlichen Regressionsergebnis entfernt ist. Gegen den
echten Datensatz (7 Jahre, `run-legacy-db.js`-Muster, lokal, nie committet -
NFA-06) zeigten 12 von 14 Breakthroughs eine Korrektur >= 2 %, mehrere davon
+150 % bis +567 % gegenueber dem rohen Fit, zweimal bis zur vollen
3000-W-Grenze (`constraintUnsatisfied` blieb dabei `false`, weil die
Korrektur GENAU an der Grenze noch reichte - ein Erkennungsluecke fuer sich).
Auf das letzte (tatsaechlich synchronisierte) Jahr eingegrenzt: derselbe
Effekt, aktuelle Signatur landete bei pMax=1500 W/wPrimeJ=45 kJ (beides exakt
an einer Kappungsgrenze), obwohl der rohe Fit staerker gestuetzte Werte um
450-900 W lieferte - und **961 W bei 1 s Dauer, mit 4 unabhaengigen
Aktivitaeten reproduziert**, deckt sich fast exakt mit der vom Auftraggeber
selbst geschaetzten Bestleistung (~900 W bei 5 s).

Neue Einstellung `maxMpaCorrectionPct` (Standard 0,2 = 20 %): die Korrektur
darf cp/pMax jetzt nur noch bis zum ENGEREN der zwei Daecher anheben - der
bisherigen absoluten Grenze ODER `(1 + maxMpaCorrectionPct)` mal dem Wert,
mit dem die Funktion aufgerufen wurde (dem rohen, bereits
Absenkbremse-korrigierten Fit). Der Wert 20 % ist so gewaehlt, dass er den
einzigen bekannten LEGITIMEN Korrekturfall (der Kap.-7.5-Testfall "W'bal
entlaedt sich mitten im Fenster", ca. +7,6 % cp) klar durchlaesst, aber jede
der am echten Datensatz beobachteten Ueberschaetzungen (>= 28 %) zuverlaessig
gestoppt und als `constraintUnsatisfied: true` markiert. Damit tauscht die
Korrektur "unbemerkt beliebig hoch" gegen "sichtbar und begrenzt" - konsistent
mit Kap. 7.5s eigener Begruendung fuer die absolute Grenze ("statt eine
unplausible Signatur unbemerkt zu uebernehmen"), nur konsequenter angewendet.

Verifiziert erneut gegen den echten Datensatz (Standard-Grenzen, nicht die
vom Nutzer manuell abgesenkten): die aktuelle Signatur (letztes Jahr) landete
damit bei cp=278 W, pMax=922 W - beides ohne jede manuelle Anpassung der
absoluten Grenzen, direkt aus der neuen relativen Korrekturgrenze, und sehr
nah an der eigenen Einschaetzung des Auftraggebers (~900 W gemessen,
~1200 W als plausibler Sprintwert). Nebenwirkung DIESER Runde (bewusst in
Kauf genommen, aber siehe "Pmax-Stabilitaet" unten fuer die Fortsetzung): die
Zahl der erkannten Breakthroughs stieg spuerbar (7 statt vorher 2-3 im
letzten Jahr, 140 statt 14 ueber 7 Jahre) - die MPA wurde nicht mehr
kuenstlich so weit aufgeblaeht, dass folgende Anstrengungen lange keine
Ueberschreitung mehr ausloesten. Der Nutzer meldete danach zurueck, dass PP
jetzt zu NIEDRIG sei (450 W) und generell zu haeufig schwanke - Ursache und
Fix dafuer siehe "Pmax-Stabilitaet" unten, das reduziert auch diese
Breakthrough-Inflation wieder (siehe dort: 4 statt 16 Breakthroughs im
letzten Jahr, nach beiden Fixes zusammen).

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

### Pmax-Stabilitaet (2026-09-18, M1-Festlegung, `pmaxEvidenceMaxSeconds`/`minPmaxEvidenceCount`/`pmaxEvidenceMinCpMultiple`/`maxPmaxChangePerBreakthrough`)

Nach der relativen Korrekturgrenze (oben) blieb PP am echten Datensatz immer
noch instabil - der Nutzer meldete zurueck: "PP steht bei 450 W, deutlich zu
wenig" und "PP sollte sich nicht sehr oft veraendern, da sehr, sehr selten
ein voller Sprint gefahren wird", ausdruecklich OHNE manuelles Ausfiltern
einzelner Aktivitaeten als Loesung. Recherche (siehe unten) bestaetigt genau
diese Intuition, sowohl in der Literatur als auch im Vorbild-Produkt (XERT):

- **Literatur:** der 3-Parameter-Fit (Morton 1996) ist fuer Pmax (den
  t->0-Extremwert) strukturell schlecht bestimmt, wenn keine echten kurzen
  (Sprint-)Anstrengungen vorliegen - eine Validierungsstudie fand den
  modellierten Wert (ẇ0) sogar SYSTEMATISCH niedriger als die tatsaechlich
  gemessene maximale Momentanleistung (1184±265 W vs. 1554±235 W gemessen).
  Das erklaert direkt, warum PP nach der reinen Fit-Korrektur (relative
  Korrekturgrenze oben) auf 450 W statt der vom Nutzer erwarteten ~1200 W
  fiel: ohne echte Sprint-Stuetzpunkte im jeweiligen 90-Tage-Fenster ist der
  rohe Fit selbst der Fehlerquelle, nicht (mehr) die Korrektur.
- **XERT** (das dem Lastenheft als Vorbild dient, Kap. 2 "Ausgangslage")
  behandelt Peak Power in seinem eigenen Testprotokoll ausdruecklich getrennt
  von Threshold/HIE: "Perform 4-5 peak power sprints for 10-15 seconds ...
  On your last sprint, go all-out for around 20 seconds" - eine eigene,
  kurze (<=20 s) Anstrengungskategorie, waehrend TP/HIE aus jeder laengeren
  Anstrengung Evidenz ziehen koennen.

**Vier Bausteine** in `breakthrough.js#refitSignature`, alle automatisch -
kein manuelles Ausfiltern von Aktivitaeten, wie vom Nutzer gefordert:

1. **Sprint-Evidenz-Schwelle**: ein Stuetzpunkt (aus den Nahe-MPA-Punkten der
   Breakthrough-Aktivitaet ODER der 90-Tage-Envelope) zaehlt nur als
   "Pmax-Sprintevidenz", wenn er (a) hoechstens `pmaxEvidenceMaxSeconds`
   (Standard 20 s, direkt aus dem XERT-Protokoll uebernommen) dauert UND (b)
   mindestens `pmaxEvidenceMinCpMultiple` (Standard 1,8) mal die aktuelle TP
   erreicht. Reiner Dauer-Filter allein reicht NICHT: die 90-Tage-Envelope
   liefert praktisch IMMER einen 1-20-s-Bestwert, auch ohne jede
   Sprintabsicht (natuerliches Leistungsrauschen genuegt) - erst der
   Vielfache-Filter unterscheidet einen echten sprintartigen Ausschlag von
   einer zufaellig etwas hoeheren Sekunde einer normalen Ausfahrt.
2. **Pmax-Halte-Modus** (`cpFit.js#fitMortonCP`s neue `fixedPMax`-Option,
   `fitMortonRobust`s `holdPMax`): unterhalb `minPmaxEvidenceCount` (Standard
   2) qualifizierender Stuetzpunkte wird Pmax waehrend der GESAMTEN
   Levenberg-Marquardt-Optimierung auf dem bisherigen Wert FIXIERT (effektiv
   ein 2-Parameter-Fit fuer cp/wPrime) statt frei mitgefittet. Kap. 7.5
   verlangt weiterhin "TP, HIE und PP gemeinsam neu geschaetzt" - das bleibt
   woertlich erfuellt (der gemeinsame Fit-Aufruf findet immer statt), nur
   dass PPs Beitrag dazu bei fehlender Evidenz eben "unveraendert" lautet,
   statt einer unbelegten Neuschaetzung. `fit.pMaxFixed`/das
   Breakthrough-Feld `pMaxHeld` machen das transparent (UI:
   "PP nicht neu geschaetzt (keine kurze Sprint-Anstrengung)").
3. **Pmax-Traegheitsbremse** (`applyPmaxInertia`, NEU, zusaetzlich zur
   bestehenden Absenkbremse): selbst mit ausreichender Sprint-Evidenz schwankte
   der rohe Fit am echten Datensatz noch stark von Fenster zu Fenster (898 W
   -> 1092 W -> 559 W -> 780 W -> ... -> 922 W innerhalb eines Jahres, ohne
   erkennbaren Trend) - jede 90-Tage-Envelope enthaelt eben einen etwas
   anderen Ausschnitt der Sprint-Historie. Anders als bei cp/wPrime (Kap.
   7.5: "Anstiege sind nie gebremst" - ein Breakthrough ist eine belegte
   PERSOENLICHE Bestleistung, soll also sofort sichtbar werden) gibt es fuer
   Pmax speziell keinen Grund zur Eile: ein einzelner guter Sprint beweist
   nicht zuverlaessig einen dauerhaft hoeheren Wert, siehe Literatur oben.
   Deshalb wird die Pmax-AENDERUNG (Anstieg UND Abstieg, anders als die nur
   fuer Abstiege geltende Absenkbremse) auf `maxPmaxChangePerBreakthrough`
   (Standard 0,15 = 15 %) je Breakthrough begrenzt - unabhaengig von
   "gestuetzt" (das bleibt der Absenkbremse fuer cp/wPrime vorbehalten). Das
   rohe `fit.pMax` (Transparenz, `rawFit`) bleibt davon unberuehrt.
4. **Reihenfolge**: Sprint-Evidenz-Pruefung -> Fit (ggf. mit fixiertem Pmax)
   -> Pmax-Traegheitsbremse -> Absenkbremse (cp/wPrime/pMax) ->
   Nebenbedingungs-Korrektur (Kap. 7.5, mit der relativen Grenze oben). Jede
   Stufe wirkt auf das Ergebnis der vorherigen, keine Stufe wird uebersprungen.

**Verifiziert gegen den echten Datensatz** (letztes synchronisiertes Jahr,
Standard-Einstellungen): vor diesem Fix 16 Breakthroughs mit PP-Werten
zwischen 450 W und 1500 W ohne erkennbaren Trend; danach nur noch **4
Breakthroughs**, PP steigt glatt und plausibel von 898 W (Startsignatur) auf
1114 W - nahe an der vom Nutzer selbst geschaetzten Sprintleistung
(~1200 W) und an der gemessenen besten 1-s-Leistung (961 W, ueber 4
Aktivitaeten reproduziert). Die Breakthrough-Inflation aus der relativen
Korrekturgrenze (oben, 7 statt 2-3 im letzten Jahr) ist damit ebenfalls
behoben, weil die MPA nicht mehr durch einen ploetzlich eingebrochenen
Pmax-Wert kuenstlich zu niedrig wird.

**Live vom Auftraggeber bestaetigt (2026-09-18):** nach Neuberechnung zeigt
PP 1060 W - "sieht jetzt besser aus ... passt erstmal". Das PP-Problem gilt
damit als abgeschlossen. HIE (wPrimeJ) bleibt auf Wunsch des Auftraggebers
bewusst zurueckgestellt ("machen wir spaeter") - siehe der Absatz unten.

### HIE-Stabilitaet (2026-09-19, M1-Festlegung, `wprimeEvidenceMinSeconds`/`wprimeEvidenceMaxSeconds`/`minWprimeEvidenceCount`/`wprimeEvidenceMinCpMultiple`/`maxWprimeChangePerBreakthrough`)

Nach dem Pmax-Fix (oben) blieb `wPrimeJ` (HIE) im rohen Fit mehrfach exakt
auf 45000 J stehen - dem internen LM-Optimierungs-Clamp in `cpFit.js`
(`CLAMP[1]`), einer numerischen Stabilitaetsgrenze, keiner physiologischen.
Konkret sichtbar geworden ueber das Stoffwechselmodell (M5): mit einem
eingefrorenen `wPrimeJ=45000` modellierte `mortonPower(360s, ...)` eine zu
hohe Kurzzeitleistung, was VO2max und VLamax spuerbar ueberschaetzte -
VLamax lag beim Vergleich gegen *Sentiero* (siehe "Stoffwechselmodell"
unten) bei 0,80 statt der erwarteten ~0,6-0,8. Der Auftraggeber hatte HIE
ausserdem unabhaengig davon schon als zu hoch gemeldet und explizit auf
"machen wir spaeter" zurueckgestellt (siehe Pmax-Stabilitaet oben) - dieser
Fund war der Ausloeser, es doch jetzt anzugehen.

Anders als bei Pmax gibt es fuer W' keine ebenso direkte Produktvorlage
(XERT trennt Peak-Power-Sprints explizit von Threshold/HIE-Tests), aber die
Literatur bestaetigt ein analoges Identifizierbarkeits-Problem mit einem
ANDEREN informativen Dauerbereich:

- Klassische CP/W'-Testprotokolle nutzen mehrere nahe-erschoepfende
  Anstrengungen im Bereich von etwa 3-12 min (z. B. 12/7/3-min-Zeitfahren
  mit Pause dazwischen), nicht Sprints - Sprints sind Pmax-informativ, nicht
  W'-informativ (siehe `mortonPower`: bei kleinem t dominiert der
  Pmax-Term, W' wird erst im Bereich weniger Minuten bis ~20 min
  bestimmend).
- W' gilt in der Literatur als das instabilste/rauschendste Critical-
  Power-Parameter ueberhaupt (Test-Retest-Variabilitaet auch unter
  Laborbedingungen); eine Intervals.icu-Forum-Diskussion zu genau diesem
  Praxisproblem (W'-Schaetzung aus Felddaten) bestaetigt: eine belastbare
  Neuschaetzung braucht echte maximale Anstrengungen, nicht beliebige
  submaximale Ausfahrten.

**Fuenf Bausteine**, symmetrisch zur Pmax-Stabilitaet aufgebaut, aber mit
eigenem Dauerbereich/eigener Schwelle statt einer Kopie der Pmax-Werte:

1. **W'-Evidenz-Schwelle**: ein Stuetzpunkt zaehlt nur als "W'-Evidenz", wenn
   er (a) zwischen `wprimeEvidenceMinSeconds` (Standard 120 s) und
   `wprimeEvidenceMaxSeconds` (Standard 1200 s = 20 min) dauert UND (b)
   mindestens `wprimeEvidenceMinCpMultiple` (Standard 1,05) mal die
   aktuelle TP erreicht - deutlich naeher an TP als bei Pmax (1,8), weil ein
   nahe-erschoepfender Mehrminuten-Effort bei einer moderaten TP-Ueberschreitung
   liegt, nicht beim Vielfachen.
2. **W'-Halte-Modus** (`cpFit.js#fitMortonCP`s neue `fixedWPrime`-Option,
   `fitMortonRobust`s `holdWPrime`, analog zu `fixedPMax`/`holdPMax`):
   unterhalb `minWprimeEvidenceCount` (Standard 2) qualifizierender
   Stuetzpunkte bleibt W' waehrend der GESAMTEN Optimierung auf dem
   bisherigen Wert fixiert (effektiv ein 2-Parameter-Fit fuer cp/pMax) -
   gilt auch fuer den <4-Punkte-2-Parameter-Fallback, der W' sonst
   ungebremst aus der linearen Regression uebernehmen wuerde.
   `fit.wPrimeFixed`/das Breakthrough-Feld `wPrimeHeld` machen das
   transparent (UI: "HIE nicht neu geschaetzt").
3. **W'-Traegheitsbremse** (`applyInertiaBrake`, dieselbe Funktion wie fuer
   Pmax, nur mit `maxWprimeChangePerBreakthrough`, Standard 0,2 = 20 % -
   etwas grosszuegiger als Pmaxs 15 %, da W' laut Literatur noch rauschender
   ist): begrenzt die W'-AENDERUNG (Anstieg UND Abstieg) je Breakthrough,
   dieselbe bewusste Ausnahme von Kap. 7.5s "Anstiege sind nie gebremst" wie
   bei Pmax, aus demselben Grund (ein einzelner Effort beweist keinen
   dauerhaft hoeheren Wert).
4. **Reihenfolge**: wie bei Pmax - Evidenz-Pruefung (Pmax UND W' getrennt,
   beide vor dem gemeinsamen Fit) -> gemeinsamer Fit (ggf. mit fixiertem
   Pmax und/oder fixiertem W') -> beide Traegheitsbremsen -> Absenkbremse ->
   Nebenbedingungs-Korrektur.
5. Settings-UI-Gruppe "HIE-Stabilitaet" (analog "PP-Stabilitaet").

**Verifiziert gegen den echten Datensatz** (letztes synchronisiertes Jahr,
Standard-Einstellungen): vor diesem Fix landete die aktuelle Signatur bei
`wPrimeJ=45000` (Clamp-Wert, kein echter Fit). Danach steigt `wPrimeJ` ueber
6 Signatur-Eintraege glatt von 17428 J auf 31368 J (keiner der 5
Breakthroughs im Zeitraum musste W' halten - genug Evidenz vorhanden, die
Traegheitsbremse allein reicht bereits, um das fruehere Clamp-Pinning zu
verhindern). Die aktuelle Signatur lautet cp=303,7 W / wPrimeJ=31368 J /
pMax=1136 W. Auswirkung auf das Stoffwechselmodell (siehe unten,
"Validierung gegen Sentiero"): VLamax faellt von 0,80 auf **0,52** -
deutlich naeher an Sentieros 0,6 (13 % statt 33 % Abweichung), VO2max
bleibt bei 76,2 (1,4 % Abweichung).

### Stoffwechselmodell (FA-MET-01 bis 07, Kap. 7.9, M5-Festlegung)

`src/metabolic.js` implementiert **nur die Steady-State-Variante** (V1, Kap.
7.9: "Lookup je Leistungswert", M-Prioritaet) des Mader-Modells - die volle
dynamische Simulation (5 gekoppelte Differentialgleichungen, PCr-Kinetik,
RK4-Integration) ist im Lastenheft explizit **optional (S-Prioritaet, "fuer
eine spaetere Version")** und bewusst nicht Teil dieser Runde. Quelle der
Gleichungen/Konstanten: Mader 2003, Heck et al. 2022, sowie "Dunst et al.
2026" - identifiziert als *MetaboliSim* (Dunst, Scharf, Hesse, Asteroth,
arXiv 2606.08366, "MetaboliSim: a Python implementation of the Mader model
for dynamic and steady-state simulation of muscular energy metabolism"),
dessen zitierter Testfall (50 W/600 s/75 kg/30 % aktive Muskelmasse/VO2max
50/VLamax 0,5 → PCr≈16,46 mmol/kg, Laktat≈1,09 mmol/l) fast exakt dem
Lastenheft-Testvektor entspricht.

**Vertrauensniveau der Konstanten** (im Code an der jeweiligen
Funktion/Konstante vermerkt):

| Tier | Bedeutung | Beispiele |
|---|---|---|
| A | Standard-Sportphysiologie, unabhaengig von der Quelle verifizierbar | Energieaequivalente (Peronnet & Massicotte 1991: 5,05/4,69 kcal je Liter O2 fuer KH/Fett), Pyruvat-Oxidations-Stoechiometrie, Glykogenolyse-ATP-Ausbeute (1,5 mol ATP/mol Laktat) |
| B | Aus der MetaboliSim-Recherche, modellspezifisch, mittlere Sicherheit (nicht am Originalcode gegengeprueft, PDF-Extraktion bei dieser Papierdichte nicht robust genug fuer 100%ige Sicherheit) | Hill-Kinetik-Konstanten (Ks1/Ks2/KLaO2/Kel,ox), Leistungs-VO2-Beziehung (c0/c1), bVO2 (P/O-Quotient 2,6) |
| C | Eigene V1-Festlegungen dieser App, nicht aus der Quelle | pH-/Glykogen-Hemmterm auf 1 gesetzt, Kurzzeit-Leistungsformel, CHO/Fett-Aufteilung aus νLa,ox, Zonenschema |

**Wichtige Scope-Entscheidung:** Der 7.9-Testvektor (PCr/Laktat-Kinetik) ist
ein Ergebnis des DYNAMISCHEN Modells - ohne Zeitintegration gibt es keinen
PCr-Zustand, eine reine Steady-State-Variante kann ihn nicht woertlich
reproduzieren. `test/metabolic.test.js` prueft stattdessen nur, dass das
modellierte Steady-State-Laktat bei 50 W in einer plausiblen
Groessenordnung liegt (nicht als literale Reproduktion). Der Testvektor
bleibt als Zielwert fuer eine spaetere S-Prioritaet-Erweiterung (volles
dynamisches Modell) vermerkt.

**Ableitung von VO2max/VLamax** (F11, FA-MET-01/02, ueberarbeitet
2026-09-19 nach einem Realdaten-Abgleich - siehe "Validierung gegen
Sentiero" unten): zwei Bedingungen aus Kap. 7.9, beide EXAKT geloest statt
per Optimierung angenaehert.

1. **Kurzzeitbedingung → VO2max direkt.** Die etablierte
   sportwissenschaftliche Konvention "Leistung bei VO2max ≈ 6-Minuten-
   Bestleistung" (Billat et al.) liefert VO2max ueber `vo2Load` als
   geschlossenen Ausdruck - keine Schaetzung/Suche. **M5-Festlegung:**
   `metShortDurationSeconds = 360` (6 Minuten),
   `mortonPower(360, cp, wPrimeJ, pMax)` als Zielleistung. Diese Wahl
   ersetzt eine fruehere Version (15 Sekunden + eine selbst erfundene
   ATP-Kapazitaets-Summenformel), die im Sentiero-Vergleich VLamax um
   Faktor ~2 unterschaetzte - siehe unten.
2. **MLSS = TP → VLamax exakt.** Mit dem (ggf. laborwertgewichteten)
   VO2max aus Schritt 1 wird VLamax per Bisektion so bestimmt, dass die
   modellierte MLSS GENAU die TP trifft (`solveVlamaxForMlss`) - dieselbe
   "Produktionsdefizit"-Bisektion wie `solveMlssPower`, nur nach VLamax
   statt nach der Leistung aufgeloest (PD(P) faellt monoton mit VLamax bei
   fixem VO2max: mehr Glykolyse bei gleichem [ADP], waehrend die - von
   VLamax unabhaengige - Oxidationskapazitaet gleich bleibt). Bedingung 1
   (Kap. 7.9: "bleibt immer erfuellt") gilt dadurch STRUKTURELL immer, ohne
   Naeherung.

Kein loesbarer Wert gefunden → `{vo2max: null, reason}` statt erfundener
Werte (Muster wie `computeInitialSignature`).

**Laborwerte (FA-MET-02):** fliessen als gewichtetes Mittel INS VO2max
ein, bevor Schritt 2 (VLamax exakt) laeuft - so bleibt Bedingung 1 immer
exakt erfuellt, egal wie stark die Laborwerte gewichtet sind. Ein
Laborwert-VO2max geht direkt ein; ein Laborwert-VLamax oder ein
Laktat-Leistungs-Paar wird zuerst in ein "implizites VO2max" uebersetzt
(ueber dieselbe MLSS=TP-Bisektion bzw. `modelSteadyStateLactate`,
verankert am kurzzeit-abgeleiteten VO2max als Naeherung - eine vollstaendig
self-konsistente Mitschaetzung wuerde eine weitere aeussere Iteration
verlangen, fuer V1 nicht noetig) und dann mit demselben Gewichtsschema
(`metShortDurationWeight` vs. `metLabVo2maxWeight`/`metLabVlamaxWeight`/
`metLabLactateWeight`) gemittelt.

**Validierung gegen Sentiero (2026-09-19, echte Nutzerdaten):** der
Auftraggeber verglich sein Profil mit *Sentiero* (Kap. 6.8
"Sentiero-Block" - das Lastenheft-Vorbild fuer den MET-Block) anhand
seiner echten Werte (62 kg, TP/6min-Leistung 309 W/383 W aus Sentieros
eigener 10'/3'-Testableitung). Sentiero zeigt VO2max ≈ 77,3 ml/min/kg,
VLamax ≈ 0,6 mmol/l/s. Die urspruengliche Kurzzeitbedingung (15 s +
ATP-Summenformel) ergab VO2max ≈ 71,9 (7 % Abweichung, akzeptabel) aber
VLamax ≈ 0,29 (52 % zu niedrig) - ein Test mit derselben Dauer, aber der
DIREKT gemessenen (nicht extrapolierten) Leistung bei 180 s verschlechterte
die VLamax-Abweichung sogar weiter, was zeigte: das Problem lag an der
Formel, nicht an der gewaehlten Dauer. Mit der jetzigen Loesung (6-min-
Leistung → VO2max direkt via `vo2Load`, VLamax exakt aus MLSS=TP): VO2max
≈ 76,3 (1,3 % Abweichung), VLamax ≈ 0,48 (20-25 % Abweichung) - deutlich
naeher, aber nicht exakt. Moegliche Restursachen fuer die verbleibende
VLamax-Luecke (nicht weiter verfolgt, Aufwand/Nutzen): abweichende
Annahme der aktiven Muskelmasse (Sentiero fragt sie nicht ab, koennte
intern einen anderen Wert als die hier verwendeten 30 % nutzen), oder
Restunsicherheit in den Tier-B-Hill-Kinetik-Konstanten (siehe
"Vertrauensniveau" oben - nicht am MetaboliSim-Originalcode gegengeprueft).
`test/metabolic.test.js` haelt diesen Vergleich als Regressionstest fest
(Toleranzband, keine exakte Uebereinstimmung erwartet).

**Nachtrag (2026-09-19):** der obige Vergleich nutzte einen SYNTHETISCH
konstruierten Testfall (cp/wPrimeJ/pMax passend zu Sentieros eigener
Testableitung gewaehlt), nicht die tatsaechlich vom Rechenkern gefittete
Signatur. Mit der ECHTEN Signatur aus der App (damals cp=293 W,
wPrimeJ=45000 J, pMax=1060 W) ergab sich VLamax=0,80 - deutlich schlechter
als der 0,48-Validierungswert. Ursache war NICHT die VLamax-Formel selbst,
sondern `wPrimeJ=45000`: exakt der interne LM-Clamp aus `cpFit.js`, also
kein echter Fit-Wert (siehe "HIE-Stabilitaet" oben - derselbe Fund loeste
diesen Fix aus). Nach dem HIE-Stabilitaets-Fix liefert dieselbe reale
Signatur (jetzt cp=303,7 W, wPrimeJ=31368 J, pMax=1136 W) VLamax=0,52 -
13 % statt 33 % Abweichung von Sentieros 0,6. Die verbleibende Luecke
duerfte damit tatsaechlich ueberwiegend an den oben genannten Restursachen
liegen (aktive Muskelmasse, Tier-B-Konstanten), nicht mehr an einem
verzerrten Eingabewert.

**Zonenschema (FA-MET-03, M5-Festlegung):** 5 Zonen, %TP-verankert (55 %/
75 %/95 %), MLSS=TP exakt als obere Z4-Grenze. Begruendung: das Modell
selbst liefert nur EINE vom Lastenheft geforderte, belastbare Grenze
(MLSS=TP) - darunter gibt es keine vom Modell vorgegebene weitere
Unterteilung, deshalb Rueckgriff auf die etablierte, athletenverstaendliche
%-Schwellen-Konvention (wie Coggan/Seiler-Zonen) statt einer unbelegten
eigenen Kennzahl. Z5 (> TP) ist per Definition nicht ueber eine Stunde
haltbar (PD(P) < 0, Nettoakkumulation) - in der UI ausdruecklich als
"hochgerechnet, nicht ueber eine Stunde haltbar" gekennzeichnet (FA-MET-06).

**Substrat-/Energieaufteilung (FA-MET-04/05):** Kap. 7.9 verlangt
"Fettoxidation = Differenz zwischen glykolytischer Pyruvatbildung und
tatsaechlicher Pyruvatoxidation". `substrateSplitAtPower` setzt das um: der
CHO-Anteil des gesamten VO2 ist der Teil, der ueber tatsaechlich oxidiertes
(nicht als Laktat exportiertes) Pyruvat gedeckt wird
(`lactateOxidationMmolLS` → Pyruvat-O2-Stoechiometrie, 2,5 mol O2/mol
Pyruvat, von Hand bilanziert); der VERBLEIBENDE aerobe O2-Umsatz wird per
Definition Fett zugeschrieben (kein Proteinanteil, Standardvereinfachung).
Entscheidend fuer einen plausiblen Fett/KH-Verlauf: `[La]` wird NICHT auf
einen fixen (z. B. saettigten) Wert gesetzt, sondern ist das
MODELLIERTE Steady-State-[La] bei genau dieser Leistung
(`modelSteadyStateLactate`) - eine fruehe Version dieses Moduls nutzte
faelschlich einen fixen hohen [La]-Wert fuer die Zonen-Lookup-Tabelle, was
bei niedriger Leistung unplausibel KH-lastige Werte ergab (bei 100 W ~83 %
KH statt ueberwiegend Fett); mit dem power-abhaengigen Steady-State-[La]
zeigt sich stattdessen das erwartete "Crossover-Konzept" (Brooks & Mercier):
Fett dominiert bei niedriger Leistung, KH nahe/ueber der MLSS. Oberhalb der
modellierten MLSS existiert kein endliches Steady-State-[La] mehr (dort wird
die saettigte Oxidationsrate verwendet, siehe `substrateSplitForZoneLookup`).

**Vereinfachungen fuer V1** (jede gegenueber dem vollen dynamischen Modell):
- pH-Hemmterm und Glykogenverfuegbarkeit (fgly) sind auf ihren Neutralwert 1
  gesetzt - beide sind Teil der Zeitintegration (pH-Drift, Glykogendepletion
  ueber eine Aktivitaet), die V1 nicht fuehrt.
- Kein PCr-Zustand, keine W'bal-artige Dynamik im Stoffwechselmodell selbst
  - jede Leistung wird unabhaengig als eigener Steady-State-Punkt behandelt
  ("Lookup je Leistungswert", exakt wie Kap. 7.9 es fuer V1 vorschreibt).
- Muskeldichte ≈ 1,0 kg/l (statt der realen ~1,06 kg/l) fuer die
  Muskelmasse-in-Liter-Umrechnung - dokumentierte ~6%-Vereinfachung.
- **Kein persistiertes historisches Stoffwechselprofil**: anders als
  TP/HIE/PP (eigene `history[]`-Zeitreihe) wird VO2max/VLamax live aus der
  JEWEILS aktuellen Signatur berechnet (`web/src/metabolicView.js`), nicht
  als eigene Zeitreihe abgelegt - "je Zeitpunkt" (FA-MET-01) wird so
  interpretiert, dass die Herleitung an jedem Zeitpunkt (Signatur zum
  Aktivitaetsdatum, FA-MET-05) moeglich ist, nicht dass eine eigene
  persistierte Historie gefuehrt wird. Rein pragmatische V1-Entscheidung,
  da die Berechnung selbst schnell genug ist, um sie bei Bedarf neu
  auszufuehren (kein Web-Worker noetig, siehe `metabolicView.js`).

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

**UI-Anbindung nachgetragen (2026-09-19):** `displaySignatureAtDate` war seit
M4 fertig implementiert/getestet, aber in `web/` bis dahin NIRGENDS
tatsaechlich aufgerufen - die Dashboard-Kachel "Leistungssignatur" zeigte
nur den rohen Stand vom letzten Breakthrough, der "Belastung"-Tab nur den
abstrakten g/h/p-Verlauf in Strain-Score-Einheiten (FA-SIG-11). Der Nutzer
fragte folgerichtig, warum TP zwischen Breakthroughs nie sinkt, obwohl
seither Monate ohne neuen Breakthrough vergangen waren - die Antwort war
eine echte Anbindungsluecke, kein Rechenfehler. Jetzt zeigt
`dashboardView.js#renderSignatureTiles` zusaetzlich eine Zeile "Aktuell
geschaetzt (belastungsgekoppelt)" mit dem Ergebnis von
`displaySignatureAtDate` fuer das juengste Datum der geladenen
`series` (NICHT den heutigen Kalendertag - `loadResponseSeriesForSystem`
erstreckt sich nur bis zum Datum der letzten Aktivitaet mit Strain-Werten,
siehe core-Kommentar oben; eine Ausweitung bis zum echten "heute" ohne neue
Aktivitaet ist bewusst nicht Teil dieser Aenderung). Klar als "Trend,
ersetzt nicht den Breakthrough-Stand" gekennzeichnet, da p=g-h eine
langsam-minus-schnell-Differenz wie TSB ist (kann je nach juengster
Belastung ueber ODER unter dem rohen Wert liegen), kein reiner
Verfall-nach-Zeit.

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
- **Gemeldete PP/HIE-Ueberschaetzung (2026-09-18, behoben, siehe
  "Relative Korrekturgrenze" oben; live-Bestaetigung durch den Auftraggeber
  steht noch aus):** der Auftraggeber berichtete, das modellierte PP liege
  dauerhaft ueber der gemessenen besten 5-s-Leistung UND ueber dem eigenen,
  per `outlierMaxWatts` personalisierten Plausibilitaetsdach - auch HIE
  wirkte zu hoch. Ursache am echten Datensatz bestaetigt: die
  Nebenbedingungs-Korrektur (Kap. 7.5) durfte cp/pMax bis zur absoluten
  Plausibilitaetsgrenze anheben, unabhaengig davon, wie weit das vom rohen
  Fit entfernt war - jetzt zusaetzlich durch `maxMpaCorrectionPct` (relativ
  zum rohen Fit) begrenzt. `wPrimeJ` (HIE) landete danach im rohen Fit
  weiterhin mehrfach exakt auf 45000 J, dem internen LM-Optimierungs-Clamp
  in `cpFit.js` - behoben (2026-09-19, siehe "HIE-Stabilitaet" oben) durch
  dieselbe Evidenz-/Traegheits-Behandlung wie bei Pmax, nur mit eigenem
  Dauerbereich (2-20 min statt <=20 s). Ein Nebenbefund bleibt offen: die
  Haeufung stark korrekturbeduerftiger Breakthroughs in dicht aufeinanderfolgenden
  Trainingsbloecken deutet auf Wiederholungssprint-/Intervall-Einheiten hin,
  bei denen ein einzelnes statisches 3-Parameter-Modell strukturell an seine
  Grenzen kommt (W'bal-Erholungsdynamik zwischen Efforts, Kap. 9 "Individuelle
  Kalibrierung der W′-Erholung" ist explizit Nicht-Ziel V1) - dafuer gibt es
  keinen weiteren Fix in dieser Runde, nur die jetzt sichtbare
  `constraintUnsatisfied`-Markierung statt einer stillschweigenden
  Ueberschaetzung.
- **Stoffwechselmodell (M5, Kap. 7.9)**: gegen den 7.9-Referenztestfall NICHT
  verifiziert (Ergebnis des dynamischen Modells, siehe "Stoffwechselmodell"
  oben - Produktentscheidung, diesen Testfall bewusst nicht als
  Abnahmekriterium fuer die V1-Steady-State-Variante zu verwenden). Die volle
  dynamische Simulation (PCr-/pH-Kinetik, S-Prioritaet) ist nicht gebaut.
  Gegen ECHTE Nutzerdaten verglichen mit Sentiero (siehe "Validierung gegen
  Sentiero" oben): VO2max trifft nah (~1,4 % Abweichung), VLamax bleibt nach
  dem HIE-Stabilitaets-Fix noch ~13 % zu niedrig (war 33 %, solange
  `wPrimeJ` am LM-Clamp haengengeblieben ist) - Ursache nicht abschliessend
  geklaert (moeglich: abweichende Annahme der aktiven Muskelmasse, oder
  Restunsicherheit in den Tier-B-Hill-Kinetik-Konstanten, die aus einer
  PDF-Extraktion stammen und nicht am MetaboliSim-Originalcode gegengeprueft
  sind).

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
