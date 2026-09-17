# Performance App (Trainingsgruppe)

Performance Dashboard combining Trainingpeaks, XERT and Sentiero.

Umsetzung gemäß [`docs/LASTENHEFT.md`](docs/LASTENHEFT.md). Reihenfolge laut F15:
Rechenkern zuerst, getestet mit dem Strava-Datenexport.

## Meilensteine

| Meilenstein | Inhalt | Status |
|---|---|---|
| **M1** | Rechenkern (Bibliothek) | abgeschlossen, siehe [`core/`](core/) |
| **M2** | Fundament (Cloudflare, Google-Login, Strava-OAuth, Drive-Ablage) | in Arbeit, siehe [`worker/`](worker/) und [`web/`](web/) |
| M3 | Oberfläche TrainingPeaks/Strava/XERT | offen |
| M4 | 3D-Modell und Kalibrierung | offen |
| M5 | Stoffwechselmodell | offen |
| M6 | Gruppe, Datenschutz, PWA | offen |

## M1-Status im Detail

Siehe [`core/README.md`](core/README.md) fuer den vollstaendigen Funktionsumfang
und alle in M1 getroffenen Festlegungen (Stream-Format, Ausreisserregel,
Lueckenbehandlung, Regressionsverfahren, JS/TS-Entscheidung).

Alle 33 automatisierten Tests laufen gruen (`cd core && npm test`). Zusaetzlich
gegen den vollstaendigen 7-Jahres-Aktivitaetsbestand eines echten Nutzers
(1977 Aktivitaeten) sowie gegen eine echte Geraete-`.fit`-Datei verifiziert,
inkl. formaler NFA-04-Performance-Messung. Details und verbleibende, nicht
blockierende Punkte siehe [`core/README.md`](core/README.md), Abschnitt
"Stand der Verifikation".

## M2-Status im Detail

Cloudflare Worker (`worker/`) und statisches Frontend (`web/`) sind
implementiert: Google-ID-Token-Pruefung mit Allowlist/Admin-Bootstrap,
Strava-OAuth vollstaendig im Worker (Client Secret verlaesst ihn nie),
verschluesselte Refresh-Tokens, app-weite Drosselung anhand der
Strava-Rate-Limit-Header, Drive-App-Ordner-Zugriff und der 5-stufige
Onboarding-Ablauf (FA-AUTH-02) im Frontend. 41 automatisierte Tests fuer die
pure Worker-Logik laufen gruen (`cd worker && npm test`), beide Dienste
starten lokal fehlerfrei (`wrangler dev` / `wrangler pages dev`). Onboarding
Ende-zu-Ende erfolgreich gegen echte Google-/Cloudflare-/Strava-Dienste
getestet (Admin-Self-Bootstrap, Statusuebergaenge, verschluesseltes Token in
KV - server- und clientseitig verifiziert).

IndexedDB-Cache und der inkrementelle/mehrtaegige Sync-Ablauf (Kap. 5.3,
FA-SYNC-01 bis 05) sind jetzt ebenfalls implementiert (`web/src/idb.js`,
`storage.js`, `streamCodec.js`, `syncEngine.js`, `sync.js`, `syncView.js` -
siehe `web/README.md` fuer Ablageformat und Ablauf) und live erfolgreich
getestet: Erstimport von 33 Aktivitaeten (30-Tage-Fenster), inkl. einer
zwischendurch unterbrochenen und danach korrekt fortgesetzten Session ohne
Doppelimporte (server- und clientseitig in Cloudflare KV verifiziert). Die
Zustandsmaschine (`syncEngine.js`) ist zusaetzlich mit `node:test` gegen
In-Memory-Fakes abgesichert, u. a. genau dieses Abbruch-/Fortsetzen-Szenario
(`web/test/syncEngine.test.js`). Bewusst **nicht** Teil dieser M2-Runde: die
eigentliche Modellberechnung (Signaturverlauf, Breakthroughs,
`model/*.json`) haengt noch nicht am Sync - das ist M3-Scope, dort auch
gegen die M1-Ergebnisse verifiziert; keines der M2-Abnahmekriterien
verlangt berechnete Kennzahlen.

**Noch offen, bevor M2 als abgenommen gelten kann** (siehe
`worker/README.md` fuer die Einrichtungsschritte):
- **Cloudflare Auto-Deploy an dieses GitHub-Repo anbinden** (aktuell
  manuelles `wrangler deploy` je Verzeichnis). Das laeuft ausschliesslich
  ueber das Cloudflare-Dashboard (OAuth-Zustimmung fuer die Cloudflare-
  GitHub-App) - es gibt keinen `wrangler`-Befehl dafuer, das muss der
  Auftraggeber selbst tun:
  1. dash.cloudflare.com -> **Workers & Pages** -> Projekt
     `performance-app-worker` oeffnen -> **Settings** -> **Builds** ->
     **Connect to Git** -> Repo `christiandroessler/Performance`
     auswaehlen, GitHub-App-Zugriff erlauben.
  2. Build-Konfiguration: **Root directory** = `performance-app/worker`,
     Build-Befehl leer lassen (kein Bundling noetig), Deploy-Befehl
     `npx wrangler deploy` (Standard).
  3. Gleiches Vorgehen fuer Projekt `performance-app-web`, **Root
     directory** = `performance-app/web`.
  4. Nach dem Verbinden: Secrets (`STRAVA_CLIENT_SECRET`,
     `TOKEN_ENCRYPTION_KEY`) sind bereits per `wrangler secret put` auf dem
     Worker gesetzt und bleiben bei Git-Deploys erhalten (Secrets sind nicht
     Teil des Repos/Builds).
  5. Test: einen Commit auf `main` pushen, in **Builds** pruefen, dass ein
     Deploy automatisch angestossen wird.
- Der Sync-Code ist inzwischen gut automatisiert getestet
  (`streamCodec.test.js`, `syncEngine.test.js`), aber `storage.js`/`idb.js`
  selbst (die duennen Adapter auf IndexedDB/Drive) noch nicht gegen ein
  Konto mit mehrjaehriger Trainingshistorie
  durchgespielt.
- Verbleibende M2-Abnahmekriterien noch zu pruefen: Pause/Fortsetzung bei
  tatsaechlich erschoepftem Tageskontingent (bisher nur die
  15-Minuten-Drosselung simuliert/getestet, nicht das echte Tageslimit),
  vollstaendige Drive-Wiederherstellbarkeit nach Cache-Loeschung.
  "Kein Strava-Token im Browser" ist am 2026-09-17 live per Entwicklerwerkzeuge
  bestaetigt: alle Strava-bezogenen Netzwerk-Anfragen laufen ausschliesslich
  ueber `performance-app-worker...workers.dev` (nie direkt zu `strava.com`),
  Antworten enthalten kein Token-Feld, Local Storage ist leer - zusammen mit
  der Code-Pruefung (kein `strava.com`-Aufruf im Frontend-Code) erfuellt.
  Erstimport-Fortsetzung
  ohne Doppelimport nach Unterbrechung ist bereits live verifiziert (s. o.).

## Ausgangslage

Die bestehende `strava-dashboard`-Anwendung (siehe `../strava-dashboard/`) wird
**nicht** weiterbetrieben. Nur die Berechnungslogik aus `training-load.js` und
`power-model.js` diente als Ausgangspunkt fuer `core/` (Kap. 2 des
Lastenhefts) und wurde dabei auf das 3-Parameter-Modell, die exakte
Skiba-2015-Differentialgleichung und die im Lastenheft spezifizierten Formeln
umgestellt.

## Repository-Struktur

```
performance-app/
  docs/
    LASTENHEFT.md       -- verbindliche Anforderungen (F16)
  core/                 -- M1: Rechenkern (reines JS, keine Abhaengigkeiten)
    src/
    test/
    www/                -- lokale Sichtkontrollseite
```
