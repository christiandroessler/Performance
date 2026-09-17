# Frontend (M2 – Fundament)

Statisches Frontend fuer Cloudflare Pages. Bewusst ohne Build-Schritt (reine
ES-Module, wie `core/`) - Pages kann den Ordner direkt ausliefern. Die
eigentliche Oberflaeche (Aktivitaetsliste, Kennzahlen, Diagramme) folgt in
M3; M2 deckt Anmeldung, Onboarding, Infrastruktur (Kap. 10) UND den
Rohdaten-Sync (5.3, FA-SYNC-01 bis 05) ab.

## Code-Struktur

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
| `src/main.js` | Einstiegspunkt, verdrahtet alles |

`core/` (M1) wird erst in M3 eingebunden: M2 legt nur Rohdaten ab
(`index.json`-Metadaten, komprimierte Streams), die eigentliche
Modellberechnung (Signaturverlauf, Breakthroughs, `model/*.json`) und ihre
Anzeige sind M3-Scope - dort auch gegen die M1-Ergebnisse verifiziert
(Lastenheft M3-Abnahme). Das ist eine bewusste Scope-Entscheidung dieser
Sitzung: keine der M2-Abnahmekriterien prueft berechnete Kennzahlen.

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

Cloudflare Pages Projekt mit dem GitHub-Repo verbinden (Auto-Deploy, Kap. 4
M2), Root-Verzeichnis `performance-app/web`, kein Build-Befehl noetig
(Framework-Preset "None").

## Sicherheitsmodell

- Der Browser erhaelt nie ein Strava-Token (FA-AUTH-04) - alle
  Strava-Aufrufe laufen ueber den Worker-Proxy (`src/api.js`).
- Das Google-ID-Token wird nicht in `localStorage` abgelegt, sondern nur im
  Modul-Speicher gehalten (verschwindet beim Neuladen, dann erneute
  Anmeldung / stiller Google-Sign-In).
- Trainingsdaten (spaeter, M3) liegen ausschliesslich in IndexedDB (lokaler
  Cache) und im Google-Drive-App-Ordner des Nutzers, nirgends sonst.
