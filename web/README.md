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
| `src/calcWorker.js` | Web Worker (NFA-04): ruft `core/prepareActivity` + `computeSignatureHistory` unveraendert auf, liefert nur aggregierte Ergebnisse zurueck (keine Sekunden-Streams) |
| `src/compute.js` | Laedt alle Rohdaten (index.json + streams/\*.bin), schickt sie an den Worker, schreibt `model/signature-history.json` + `model/mmp-curves.json`, schreibt Kennzahlen in `index.json` zurueck. `discardBreakthrough`/`reactivateBreakthrough` (FA-SIG-07) |
| `src/activityListView.js` | FA-ACT-01: Aktivitaetsliste, sortierbar, Suche (Name) + Filter (Sportart, Zeitraum von/bis), Klick auf Zeile oeffnet die Detailansicht |
| `src/activityFilter.js` | Reine Filterlogik fuer die Aktivitaetsliste (Suche/Sportart/Zeitraum) - ohne Browser-Abhaengigkeit, testbar mit `node:test` |
| `src/activityDetailView.js` | FA-ACT-02: Detailansicht (Modal) - Leistungs-/Puls-/Kadenz-Verlauf, MPA und W'bal (per `signatureAtDate`), Belastungsanteile (Strain Low/High/Peak), Kennzahlen. Rechnet direkt im Hauptfenster, kein Worker (eine Aktivitaet ist klein genug) |
| `src/chartUtils.js` | Reine Chart-Hilfsfunktionen (Downsampling fuer lange Sekunden-Arrays) - bewusst von `activityDetailView.js` getrennt, damit ohne Browser-Abhaengigkeit mit `node:test` testbar |
| `src/powerCurveView.js` | FA-ACT-03: Leistungskurve/persoenliche Bestwerte, waehlbarer Zeitraum, optional W/kg |
| `src/pmcView.js` | FA-TP-06: Performance Management Chart (CTL/ATL/TSB), reines SVG |
| `src/breakthroughView.js` | FA-SIG-07/08: Breakthrough-Uebersicht, Mehrfachauswahl zum Verwerfen, Reaktivieren |
| `src/calendarUtils.js` | Reine Datums-/Aggregationsfunktionen fuer FA-TP-07 (Wochengruppierung, Kalendertag-Gruppierung) - ohne Browser-Abhaengigkeit, testbar mit `node:test` |
| `src/weekView.js` | FA-TP-07: Wochenuebersicht (TSS/Dauer/Einheiten je Sportart pro ISO-Woche) und Monatskalender (Tages-TSS, Klick auf Aktivitaet oeffnet die Detailansicht) - reine Aggregation der in `index.json` bereits abgelegten Kennzahlen, keine erneute Berechnung |
| `src/dashboardView.js` | Verdrahtet die M3-Ansichten, stoesst die Erstberechnung nach dem ersten Sync automatisch an |
| `src/main.js` | Einstiegspunkt, verdrahtet alles (M2 + M3) |

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
(RawStreamPoint[]-Form, FA-DQ-01 `deviceWatts`-Maskierung) - die
Algorithmus-Korrektheit selbst deckt bereits `core/test/` ab (33 Tests, M1).

**Bewusst noch nicht gebaut** (M3, spaetere Runde): automatische
Schwellen-Schaetzung fuer HF/Pace/Schwimmen (FA-TP-03/04 - ohne die gibt es
aktuell nur NP/IF/TSS aus Leistung, kein hrTSS/Pace-TSS),
PP-Plausibilisierung (FA-SIG-13), Einstellungen-UI (FA-SET-01-04).

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
