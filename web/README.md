# Frontend (M2 – Fundament)

Statisches Frontend fuer Cloudflare Pages. Bewusst ohne Build-Schritt (reine
ES-Module, wie `core/`) - Pages kann den Ordner direkt ausliefern. Die
eigentliche Oberflaeche (Aktivitaetsliste, Kennzahlen, Diagramme) folgt in
M3; M2 deckt nur Anmeldung, Onboarding und die Infrastruktur ab (Kap. 10).

## Code-Struktur

| Datei | Zweck |
|---|---|
| `src/config.js` | Laedt die oeffentliche Konfiguration vom Worker (`GET /api/config`) |
| `src/auth.js` | Google Sign-In (ID-Token) + Drive-Zugriffs-Token (Scope `drive.appdata`) |
| `src/drive.js` | Lesen/Schreiben im Drive-App-Ordner (Kap. 5.2) |
| `src/api.js` | Client fuer die Worker-API (sendet das ID-Token im Header) |
| `src/onboarding.js` | Die 5 festen Onboarding-Schritte (FA-AUTH-02) |
| `src/main.js` | Einstiegspunkt, verdrahtet alles |

`core/` (M1) wird spaeter in M3 eingebunden, wenn die eigentliche Berechnung
im Browser (Web Worker) live an echten Sync-Daten haengt.

## Einrichtung

`index.html` enthaelt zwei Stellen, die je Umgebung angepasst werden muessen:

1. `window.__WORKER_ORIGIN__` (inline `<script>` im `<head>`): die
   Worker-URL. Lokal `http://127.0.0.1:8787`, produktiv z. B.
   `https://performance-app-worker.<konto>.workers.dev`.
2. Die `GOOGLE_CLIENT_ID` kommt automatisch vom Worker (`GET /api/config`),
   dort einmalig eintragen (siehe `../worker/README.md`) - im Frontend ist
   nichts weiter zu tun.

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
