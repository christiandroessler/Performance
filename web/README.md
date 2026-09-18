# Frontend (M2 Fundament + M3 Oberflaeche)

Statisches Frontend fuer Cloudflare (Workers mit Static Assets). Bewusst ohne
Build-Schritt (reine ES-Module, wie `core/`) - eine Ausnahme: `core/src`
selbst wird vor jedem Deploy nach `web/vendor/core/src` kopiert (siehe
"Rechenkern-Anbindung" unten), weil Cloudflare nur Dateien innerhalb von
`web/` ausliefert.

## Code-Struktur

**M2 (Fundament: Auth, Onboarding, Sync):**

| Datei | Zweck |
|---|---|
| `src/config.js` | Laedt die oeffentliche Konfiguration vom Worker (`GET /api/config`) |
| `src/auth.js` | Google Sign-In (ID-Token) + Drive-Zugriffs-Token (Scope `drive.appdata`) |
| `src/drive.js` | Rohzugriff auf den Drive-App-Ordner (Kap. 5.2) - Dateien nach `name` |
| `src/idb.js` | Generischer IndexedDB-Key-Value-Store (lokaler Cache) |
| `src/storage.js` | Speicherschicht ueber `drive.js` + `idb.js`: schreibt zuerst nach Drive (fuehrend), spiegelt in den Cache; liest zuerst aus dem Cache, faellt sonst auf Drive zurueck und fuellt den Cache nach - macht "Drive-Inhalte nach Cache-Loeschung wiederherstellbar" automatisch wahr |
| `src/streamCodec.js` | Ablageformat fuer `streams/YYYY-MM.bin` (M2-Festlegung, siehe unten) |
| `src/syncEngine.js` | Reine Sync-Zustandsmaschine (kein `window`/IndexedDB/Fetch) - Listing-Phase, Streams-Phase, Drosselungs-Pause/Resume, Dedup. Mit `node:test`+In-Memory-Fakes getestet (`test/syncEngine.test.js`) |
| `src/sync.js` | Duenner Adapter: verdrahtet `syncEngine.js` mit `api.js`/`storage.js`/`streamCodec.js`/`window` |
| `src/syncView.js` | UI: Erstimport-Zeitfenster waehlen, Fortschritt anzeigen, Drosselung/Fortsetzen |
| `src/api.js` | Client fuer die Worker-API (sendet das ID-Token im Header) |
| `src/onboarding.js` | Die 5 festen Onboarding-Schritte (FA-AUTH-02) |

**M3 (Oberflaeche: Rechenkern-Anbindung, Ansichten):**

| Datei | Zweck |
|---|---|
| `scripts/sync-core.mjs` | Kopiert `core/src` nach `web/vendor/core/src` (`npm run sync-core`, laeuft automatisch vor `npm test`/`npm run dev`/`npm run deploy`) |
| `src/calcWorker.js` | Web Worker (NFA-04): ruft `core/prepareActivity` + `computeSignatureHistory` unveraendert auf, danach FA-TP-03/04 `estimateThresholds` + `applySportSpecificTss` (Sportart-Schwellen, hrTSS/Pace-TSS-Fallback) und FA-SIG-10/12 `dailyStrainSums`/`calibrateTau1K1`/`loadResponseSeries`/`holdOutBacktest` (belastungsgekoppelter Signaturverlauf inkl. voller Kalibrierung + Hold-out-Backtest) als zwei weitere, unabhaengige Durchlaeufe, liefert nur aggregierte Ergebnisse zurueck (keine Sekunden-Streams) |
| `src/compute.js` | Laedt alle Rohdaten (index.json + streams/\*.bin) inkl. Sportart (`type`), schickt sie an den Worker, schreibt `model/signature-history.json` + `model/mmp-curves.json` + `model/thresholds.json` (FA-TP-03/04, `loadThresholds()`) + `model/load-response.json` (FA-SIG-10/12, `loadLoadResponse()`), schreibt Kennzahlen (inkl. `tssSource`: `power`/`hr`/`pace`/`null`) in `index.json` zurueck. `discardBreakthrough`/`reactivateBreakthrough` (FA-SIG-07). `recomputeAll` laedt ohne explizit uebergebene `settingsOverrides` automatisch die in `settings.json#modelSettings` hinterlegten Nutzer-Parameter (FA-SET-03) - wirkt so unabhaengig vom Aufrufer (Knopfdruck, Breakthrough-Aktion, Einstellungen-Speichern). Aktivitaeten ganz ohne Stream-Bundle (z. B. Strava-404) bekommen explizit `hasSignature: false`/`tss: null` statt `undefined` zu bleiben - sonst zaehlte der "noch nicht berechnet"-Status in dashboardView.js sie fuer immer mit, egal wie oft neu berechnet wird |
| `src/activityListView.js` | FA-ACT-01: Aktivitaetsliste, sortierbar, Suche (Name) + Filter (Sportart, Zeitraum von/bis), Klick auf Zeile oeffnet die Detailansicht. TSS aus HF/Pace (statt Leistung) ist mit "≈" + Tooltip gekennzeichnet (FA-TP-05) |
| `src/activityFilter.js` | Reine Filterlogik fuer die Aktivitaetsliste (Suche/Sportart/Zeitraum) - ohne Browser-Abhaengigkeit, testbar mit `node:test` |
| `src/format.js` | Gemeinsame Dauer-/Distanz-Formatierung (`formatDuration`, `formatDistance`), bisher in mehreren Views dupliziert - u. a. behebt das hier zusammengefuehrte `formatDuration` einen Rundungsfehler ("Xh 60min" statt "(X+1)h 0min" bei z. B. 3599s) |
| `src/activityDetailView.js` | FA-ACT-02: Detailansicht (Modal) - Leistungs-/Puls-/Kadenz-Verlauf, MPA und W'bal (per `signatureAtDate`), Belastungsanteile (Strain Low/High/Peak), Kennzahlen. Alle Verlaufsgrafiken teilen sich EINEN Hover: synchroner Crosshair ueber alle Charts + ein Tooltip mit Zeit im Training und allen an diesem Zeitpunkt verfuegbaren Werten (Leistung/MPA/W'bal/Herzfrequenz/Kadenz), plus Achsbeschriftung je Grafik (gemeinsame Y-Skala fuer Leistung+MPA statt unabhaengig normiert). Rechnet direkt im Hauptfenster, kein Worker (eine Aktivitaet ist klein genug) |
| `src/chartUtils.js` | Reine Chart-Hilfsfunktionen (Downsampling fuer lange Sekunden-Arrays, `downsampledBucketSize` fuer die Rueckrechnung Index -> Sekunde im Training) - bewusst von `activityDetailView.js` getrennt, damit ohne Browser-Abhaengigkeit mit `node:test` testbar |
| `src/powerCurveView.js` | FA-ACT-03: Leistungskurve/persoenliche Bestwerte, waehlbarer Zeitraum, optional W/kg. `buildPowerCurveChart` zeichnet zusaetzlich zur Tabelle eine Grafik mit log-Dauer-Achse (1s bis mehrere Stunden auf einer Skala) |
| `src/pmcView.js` | FA-TP-06: Performance Management Chart. `computePmcSeries` einmal berechnen, `renderPmcChart` (Verlaufschart mit Achsbeschriftung + Sekundaerachse fuer TSB, Hover-Tooltip mit Datum + CTL/ATL/TSB, Zeitraum-Buttons 42/90/365 Tage/dieses Jahr fuer den ANZEIGE-Ausschnitt - CTL/ATL werden immer ueber die volle Historie berechnet, nur die Darstellung wird eingeschraenkt) und `renderMetricsSidebar` (Fatigue/Fitness/Form-Kacheln + Ramp Rates, rechte Spalte) teilen sich das Ergebnis |
| `src/pmcMath.js` | Reine Ramp-Rate-Berechnung (CTL-Veraenderung ueber 7/28/90/365 Tage) und `sliceSeriesForRange` (Anzeige-Ausschnitt des PMC-Charts) - ohne Browser-Abhaengigkeit, testbar mit `node:test` |
| `src/dashboardExtras.js` | Uebersicht-Redesign (TrainingPeaks-Vorbild): "Letzte Aktivitaet" (inkl. Distanz), "Sportart-Schwellen" (FA-TP-03/04, `renderSportThresholds` - Lauf-/Schwimm-Pace, Rad-HF, HF je sonstiger Sportart, mit Datum als Schaetzung gekennzeichnet), "Diese Woche", "Neueste Breakthroughs" - reine Zusammenfassungen bereits vorhandener Daten |
| `src/ppCheck.js` | FA-SIG-13: vergleicht das Modell-Pmax der aktuellen Signatur mit der bis dahin gemessenen besten 5-s-Leistung (`aggregateMMP` aus `core/`, ueber `model/mmp-curves.json`) - reine Anzeige der Abweichung unter den Leistungssignatur-Kacheln, korrigiert das Modell nicht |
| `src/loadResponseView.js` | FA-SIG-11/12: eigener Tab "Belastung" mit 3 Charts (Low/CP, High/W', Peak/Pmax) aus `model/load-response.json` (`compute.js#loadLoadResponse`) - g/h/p-Verlauf je System, Breakthrough-Reset als senkrechte Markierung, klare Kennzeichnung ob tau1/k1 fuer dieses System echt gefittet oder Fallback sind, plus eine "Kalibrierungsbericht"-Karte mit dem Hold-out-Backtest (MAE je System + Abschlag-Empfehlung, "pro Nutzer einsehbar"). Eigener, einfacherer SVG-Chart-Baustein als `pmcView.js#buildChart` (nur eine Skala statt zwei), teilt sich aber dieselben CSS-Klassen |
| `src/theme.js` | Hell-/Dunkelmodus zentral (localStorage je Geraet) - von main.js (Anwenden beim Start) und settingsView.js (Umschalten) geteilt |
| `src/settingsView.js` | FA-SET-01 bis 04: Einstellungen-Modal - Erscheinungsbild, Gewichtsverlauf mit Datum (FA-SET-01), alle in `core/src/settings.js` implementierten Kap.-12-Parameter gruppiert einsehbar/aenderbar (FA-SET-02), Speichern loest `recomputeAll` mit protokollierter Aenderung aus (FA-SET-03), Reset auf Startwerte (FA-SET-04 - "Kalibrierungswerte" faellt bis M4 mit "Literaturwerte" zusammen) |
| `src/glossaryView.js` | Glossar aller Berechnungsgrundlagen (CP/W'/Pmax, MPA/W'bal, NP/IF/TSS, CTL/ATL/TSB, Strain, Sportart-Schwellen, belastungsgekoppelter Signaturverlauf) in einfacher Sprache, fuer alle Nutzer zum Nachlesen |
| `src/breakthroughView.js` | FA-SIG-07/08: Breakthrough-Uebersicht, Mehrfachauswahl zum Verwerfen, Reaktivieren |
| `src/calendarUtils.js` | Reine Datums-/Aggregationsfunktionen fuer FA-TP-07 (Wochen-/Monats-/Tagesgruppierung) - ohne Browser-Abhaengigkeit, testbar mit `node:test` |
| `src/weekView.js` | FA-TP-07: Monatskalender oben (Tages-TSS, Klick auf Aktivitaet oeffnet die Detailansicht), darunter Wochenuebersicht fuer die letzten 4 Wochen und eine Monatsuebersicht fuer die 12 Monate davor (TrainingPeaks-Vorbild - eine Wochenzeile je Woche ueber ein ganzes Jahr waere unuebersichtlich) mit TSS/Dauer/Distanz/Einheiten je Sportart, Zahlenspalten rechtsbuendig (`.stats-table`-CSS) - reine Aggregation der in `index.json` bereits abgelegten Kennzahlen, keine erneute Berechnung |
| `src/dashboardView.js` | Verdrahtet die M3-Ansichten, stoesst die Erstberechnung nach dem ersten Sync automatisch an |
| `src/main.js` | Einstiegspunkt, verdrahtet alles (M2 + M3). Klick auf den Nutzerbereich oeffnet ein Menue (Einstellungen/Begriffe/Abmelden) statt einzelner Buttons |

## Rechenkern-Anbindung (M3)

`core/` (M1) laeuft **unveraendert** im Browser, in einem Web Worker
(NFA-04: Berechnung blockiert die UI nicht). `computeSignatureHistory` ist
eine reine Funktion ueber den GESAMTEN chronologischen Verlauf (M1-Design,
kein inkrementelles Patchen) - jede Neuberechnung (nach einem Sync, nach
Verwerfen/Reaktivieren eines Breakthroughs) laedt daher alle Rohpunkte aller
Aktivitaeten neu und rechnet komplett neu. Das ist bei sehr langer Historie
(mehrere Jahre) potenziell spuerbar langsam - bewusst nicht optimiert in
dieser Runde (kein M3-Abnahmekriterium verlangt eine bestimmte
Neuberechnungsdauer fuer den Gesamtverlauf, nur NFA-04 fuer eine einzelne
6h-Aktivitaet).

`web/test/computePipeline.test.js` prueft die Naht Ablageformat -> core
(RawStreamPoint[]-Form, FA-DQ-01 `deviceWatts`-Maskierung, sowie FA-TP-02/03
end-to-end: ein Lauf ohne Leistungsmesser bekommt ueber die volle Kette
Pace-TSS statt eines fabrizierten `tss: 0`) - die Algorithmus-Korrektheit
selbst deckt bereits `core/test/` ab (66 Tests, M1).

Automatische Schwellen-Schaetzung fuer HF/Pace/Schwimmen (FA-TP-02/03/04/05:
hrTSS/Pace-TSS fuer Aktivitaeten ohne Leistung, inkl. "≈"-Kennzeichnung in
der Aktivitaetsliste und einer "Sportart-Schwellen"-Karte in der Uebersicht)
ist seit 2026-09-18 gebaut, siehe `core/README.md` Abschnitt
"Sportart-Schwellen-Schaetzung" fuer die Methodik.

Einstellungen-UI (2026-09-18, FA-SET-01 bis 04): Gewichtsverlauf mit Datum
pflegbar (bisher nur einmalig im Onboarding gesetzt), alle in
`core/src/settings.js` vorhandenen Kap.-12-Parameter gruppiert einsehbar und
aenderbar, Speichern loest eine vollstaendige, protokollierte Neuberechnung
aus (Aenderungsprotokoll im selben Modal einsehbar), Reset auf Startwerte.
Nicht Teil dieser Runde erweiterte Parameter ohne echten Effekt in M1-M3
(z. B. k1/k2, Anzeige-Abschlag, Hold-out-Zeitraum, aktive Muskelmasse) - die
haengen an noch nicht gebauten Modellen (M4/M5) und waeren ohne Wirkung nur
verwirrend.

PP-Plausibilisierung (2026-09-18, FA-SIG-13): vergleicht die bis zum
Signatur-Datum gemessene beste 5-s-Leistung mit dem Modell-Pmax und zeigt
die Abweichung unter der Leistungssignatur-Karte an (ab 10 % Abweichung rot
markiert - kein Lastenheft-Parameter, reine UI-Schwelle). Das Modell selbst
wird nicht korrigiert, nur die Diskrepanz angezeigt (Lastenheft-Wortlaut).

Damit ist der komplette fuer M3 vorgesehene Funktionsumfang (6.5, 6.6, 6.7
ohne FA-SIG-10 bis 12, 6.9) gebaut - FA-SIG-10/11/12 (belastungsgekoppelter
3D-Signaturverlauf, Backtesting/Kalibrierung) sind gemaess Lastenheft
Abschnitt "Inhalt" ohnehin M4-Scope ("3D-Modell und Kalibrierung").

### M3-Abnahme (Kap. 10) - Stand 2026-09-18

Die vier M3-Abnahmekriterien im Einzelnen:

- [x] **"Kennzahlen in der UI identisch mit den M1-Ergebnissen"**: strukturell
      per Code-Pruefung sichergestellt - `compute.js` schreibt `np`/`if`/`tss`/
      `strain` unveraendert aus `activityResults` (Rechenkern-Ausgabe) in
      `index.json`, keine erneute Rundung/Berechnung in der UI-Schicht. Einzige
      Restunsicherheit: `web/vendor/core` ist eine manuell per
      `npm run sync-core` synchronisierte Kopie von `core/src`, kein Live-Import
      - bei einem vergessenen Sync vor dem Deploy koennte die UI eine aeltere
      Rechenkern-Version zeigen. Nicht automatisiert geprueft (kein CI-Gate).
- [x] **"Verwerfen/Reaktivieren eines Breakthroughs"**: jetzt mit einem
      dedizierten End-zu-Ende-Test abgesichert (`core/test/signature.test.js`,
      neu 2026-09-18) - vorher gab es dafuer ueberhaupt keinen automatisierten
      Test, weder auf Core- noch auf Web-Ebene. Die UI-Verdrahtung selbst
      (`breakthroughView.js` -> `compute.js#discardBreakthrough`/
      `reactivateBreakthrough`) ist nur per Code-Lesen geprueft, nicht live
      durchgeklickt.
- [x] **"hrTSS/Pace-TSS fuer Nicht-Rad, fehlende Schwellen gekennzeichnet"**:
      der Happy-Path war bereits getestet (`core/test/thresholds.test.js`);
      neu ist die durchgaengige Kennzeichnung des "kein TSS ermittelbar"-Falls
      in der Aktivitaetsliste - vorher zeigte diese Zelle einen nicht von
      anderen leeren Zellen unterscheidbaren Strich ohne Erklaerung, jetzt
      immer mit erklaerendem Tooltip (`activityListView.js`).
- [x] **"Schwelle zum Aktivitaetsdatum, Testfall Breakthrough mitten im
      Zeitraum"**: jetzt mit einem expliziten Testfall abgesichert
      (`core/test/signature.test.js`) - eine synthetische Historie mit einem
      Breakthrough mitten drin zeigt, dass die Breakthrough-Aktivitaet selbst
      noch die alte Schwelle nutzt und nur nachfolgende Aktivitaeten die neue.
      Vorher gab es nur einen generischen `thresholdAtDate`-Test ohne
      Breakthrough-Bezug.

**Was damit automatisiert abgesichert ist** (obige vier Punkte inhaltlich).
**Was nur der Nutzer mit echten Daten/echtem Konto pruefen kann** (kein
Browser-Zugriff auf das echte Google-Drive-/Strava-Konto vorhanden):
klicken Sie in der laufenden App einen echten Breakthrough in der
Breakthroughs-Uebersicht verwerfen -> pruefen, dass sich TSS/PMC ab diesem
Datum sichtbar aendern -> reaktivieren -> pruefen, dass exakt die vorherigen
Werte wiederkehren; und ob eine echte Nicht-Rad-Aktivitaet ohne schaetzbare
Schwelle (z. B. ganz am Anfang der Historie) den neuen Tooltip zeigt.

## M4-Status im Detail

FA-SIG-10/11/12 (2026-09-18, siehe `core/README.md` Abschnitt
"Belastungsgekoppelter Signaturverlauf" fuer die volle Methodik/
M4-Festlegungen): belastungsgekoppelter Signaturverlauf zwischen
Breakthroughs, im Rechenkern als weiterer unabhaengiger Durchlauf nach
`computeSignatureHistory` gebaut (`core/src/loadResponse.js`), im Frontend als
eigener Tab "Belastung" mit 3 Charts (`src/loadResponseView.js`). tau1,s UND
k1,s sind je System per Grid-Search + Least-Squares gegen die eigenen
bestaetigten Breakthroughs kalibriert; die Charts zeigen bei zu wenigen
Breakthroughs deutlich den "Fallback"-Hinweis statt unbelegte Zahlen als
fertig kalibriert zu tarnen. Zusaetzlich ein Hold-out-Backtesting-Bericht
(Kalibrierung nur bis zu einem Stichtag 6 Monate vor dem aktuellen Datum,
Vorhersagefehler an den Breakthroughs danach, "pro Nutzer einsehbar") mit
einer daraus abgeleiteten Abschlag-Empfehlung - wird nur angezeigt, nicht
automatisch in die Einstellungen uebernommen (FA-SET-03: explizite
Nutzeraktion).

**Bewusst noch offen**: der Nutzer hat unabhaengig davon gemeldet, dass sein
Pmax seit laengerem zu hoch wirkt (nicht auf einen einzelnen Breakthrough
zurueckzufuehren) - das ist eine Frage der CP-Fit-/Refit-Korrektheit
(`core/src/cpFit.js`/`breakthrough.js`), keine Kalibrierungsfrage, und auf
Nutzerwunsch zurueckgestellt.

## Ablageformat der Streams (`streams/YYYY-MM.bin`)

In M1 bewusst offengelassen ("wird erst in M2 festgelegt", `core/README.md`).
M2-Festlegung (`src/streamCodec.js`): JSON mit parallelen Zahlen-Arrays
(kompakter als Array-of-Objects) pro Aktivitaet, gzip-komprimiert ueber die
native `CompressionStream`-API (kein zusaetzliches Paket, passt zur
Zero-Build-Architektur). `schemaVersion` steht im JSON. Gespeichert werden
die Rohwerte, wie Strava sie liefert (`t` = Sekunden seit Aktivitaetsbeginn,
Luecken moeglich) - das Resampling auf ein luekenloses 1-Hz-Raster
(`core/src/streams.js`) passiert erst bei der Berechnung, nie bei der
Ablage, fuer Reproduzierbarkeit.

## Sync-Ablauf (5.3, FA-SYNC-01 bis 05)

- **Erstimport**: Der Nutzer waehlt ein Zeitfenster (30/90/365 Tage oder
  gesamte Historie). Nur in der Desktop-Ansicht startbar (FA-SYNC-05,
  `isDesktopViewport()`: Breite ≥ 900px).
- **Zwei Phasen**: (1) Aktivitaetsliste paginiert vom Worker abfragen, (2) je
  neuer Aktivitaet die Streams laden, ins Monatsbuendel schreiben,
  `index.json` fortschreiben.
- **Drosselung (FA-SYNC-04)**: Bei 429 vom Worker wird der Lauf angehalten,
  der Fortschritt serverseitig gespeichert (`PUT /api/sync/progress`,
  `worker/src/kvStore.js#putImportProgress`). Kurzes 15-Minuten-Fenster ->
  automatischer Retry im Frontend; Tageskontingent erschoepft ->
  Hinweistext, Fortsetzung beim naechsten App-Start (FA-SYNC-02: mehrtaegiger
  Erstimport).
- **Keine Doppelimporte**: `index.json` ist die dauerhafte Quelle dafuer, was
  bereits vollstaendig importiert ist; die Worker-Fortschrittsangabe ist nur
  der transiente Zustand eines laufenden Imports.
- **Inkrementeller Sync (FA-SYNC-01)**: Laeuft automatisch beim Oeffnen der
  App, sobald bereits Aktivitaeten gespeichert sind (`after` = letzte
  bekannte Aktivitaet in `index.json`).
- **Mehr (aeltere) Historie nachladen**: Ueber "Mehr Historie laden..." im
  Daten-Tab (`syncView.js`), z. B. wenn ein Erstimport mit kurzem Fenster
  (30 Tage) die 90-Tage-Startsignatur-Schwelle (FA-SIG-03) nicht erreicht.
  Neuer Sync-Modus `backfill` (`syncEngine.js`): `after` = gewaehltes
  erweitertes Fenster, `before` = bisher aelteste bekannte Aktivitaet
  (`firstKnownEpoch`) - laedt ausschliesslich Aktivitaeten VOR der bisher
  aeltesten, keine Doppelabfrage bereits gespeicherter. Der Worker-Proxy
  (`/api/strava/activities`) reicht `before` optional an die Strava-API
  durch.

## Einrichtung

`index.html` enthaelt zwei Stellen, die je Umgebung angepasst werden muessen:

1. `window.__WORKER_ORIGIN__` (inline `<script>` im `<head>`): die
   Worker-URL. Lokal `http://127.0.0.1:8787`, produktiv z. B.
   `https://performance-app-worker.<konto>.workers.dev`.
2. Die `GOOGLE_CLIENT_ID` kommt automatisch vom Worker (`GET /api/config`),
   dort einmalig eintragen (siehe `../worker/README.md`) - im Frontend ist
   nichts weiter zu tun.

## Tests

Reine Logik ohne Browser-APIs ist mit `node:test` abgedeckt (Node 18+ hat
`CompressionStream`/`DecompressionStream` bereits als globale Klassen, keine
Extra-Pakete noetig): `streamCodec.js` (Ablageformat) und `syncEngine.js`
(Listing/Streams-Phasen, Drosselungs-Pause/Resume, Dedup-Schutz gegen
Doppelimporte - inkl. eines Tests fuer genau den Absturz-Fall "saveIndex lief
durch, Fortschritt noch nicht", der beim ersten echten Erstimport live
aufgetreten ist):

```bash
cd web && npm test
```

`storage.js`/`sync.js`/`idb.js` selbst sind nur duenne Adapter auf echte
Browser-APIs (IndexedDB, `fetch`, Drive-/Worker-Zugriff, `window`) und bisher
nur manuell im Browser verifiziert (erster Erstimport am 2026-09-17 erfolgreich:
33 Aktivitaeten der letzten 30 Tage importiert, inkl. einer unterbrochenen und
danach fortgesetzten Session ohne Duplikate).

## Lokal testen

Worker und Frontend muessen beide laufen (zwei Terminals):

```bash
cd worker && npx wrangler dev --local --var FRONTEND_ORIGIN:http://127.0.0.1:8788
cd web && npx wrangler pages dev . --port 8788 --compatibility-date=2026-09-16
```

Ohne echte Google-/Strava-Credentials laedt die Seite (Sign-in-Button
erscheint), aber die eigentliche Anmeldung schlaegt fehl - dafuer muss
`worker/wrangler.toml` erst mit einer echten `GOOGLE_CLIENT_ID` befuellt sein
(siehe `../worker/README.md`).

## Deployment

Seit 2026-09-17 per Cloudflare Workers Builds an dieses GitHub-Repo
angebunden (Auto-Deploy bei jedem Push auf `main`) - Root-Verzeichnis
`web` (nicht `performance-app/web`, das Repo hat `performance-app` selbst
als Wurzel), Deploy-Befehl `npm run deploy` (nicht `npx wrangler deploy`
direkt, sonst fehlt der `vendor/`-Sync). Manuell geht weiterhin
`cd web && npm run deploy`. Siehe Anleitung im Root-`README.md`.

## Sicherheitsmodell

- Der Browser erhaelt nie ein Strava-Token (FA-AUTH-04) - alle
  Strava-Aufrufe laufen ueber den Worker-Proxy (`src/api.js`). Live per
  Entwicklerwerkzeuge bestaetigt (2026-09-17): alle Strava-Netzwerk-Anfragen
  gehen an den Worker, nie direkt an `strava.com`.
- Das Google-ID-Token wird nicht in `localStorage` abgelegt, sondern nur im
  Modul-Speicher gehalten (verschwindet beim Neuladen, dann erneute
  Anmeldung / stiller Google-Sign-In).
- Trainingsdaten liegen ausschliesslich in IndexedDB (lokaler Cache) und im
  Google-Drive-App-Ordner des Nutzers, nirgends sonst.
