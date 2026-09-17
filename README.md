# Performance App (Trainingsgruppe)

Performance Dashboard combining Trainingpeaks, XERT and Sentiero.

Umsetzung gemäß [`docs/LASTENHEFT.md`](docs/LASTENHEFT.md). Reihenfolge laut F15:
Rechenkern zuerst, getestet mit dem Strava-Datenexport.

## Meilensteine

| Meilenstein | Inhalt | Status |
|---|---|---|
| **M1** | Rechenkern (Bibliothek) | abgeschlossen, siehe [`core/`](core/) |
| **M2** | Fundament (Cloudflare, Google-Login, Strava-OAuth, Drive-Ablage) | in Arbeit (nur GitHub-Auto-Deploy offen), siehe [`worker/`](worker/) und [`web/`](web/) |
| **M3** | Oberfläche TrainingPeaks/Strava/XERT | in Arbeit, siehe [`web/README.md`](web/README.md) |
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
siehe `web/README.md` fuer Ablageformat und Ablauf). Die Zustandsmaschine
(`syncEngine.js`) ist mit `node:test` gegen In-Memory-Fakes abgesichert
(`web/test/syncEngine.test.js`). Bewusst **nicht** Teil dieser M2-Runde: die
eigentliche Modellberechnung (Signaturverlauf, Breakthroughs,
`model/*.json`) haengt noch nicht am Sync - das ist M3-Scope, dort auch
gegen die M1-Ergebnisse verifiziert; keines der M2-Abnahmekriterien
verlangt berechnete Kennzahlen.

**M2-Abnahmekriterien (Lastenheft Kap. 10) - Stand 2026-09-17:**
- [x] Onboarding eines frischen Kontos Ende-zu-Ende gemaess FA-AUTH-02 -
      live gegen echte Google-/Cloudflare-/Strava-Dienste verifiziert
      (Admin-Self-Bootstrap, Statusuebergaenge, verschluesseltes Token in KV).
- [x] Im Browser ist kein Strava-Token vorhanden - live per
      Entwicklerwerkzeuge bestaetigt: alle Strava-Netzwerk-Anfragen laufen
      ausschliesslich ueber `performance-app-worker...workers.dev`, nie
      direkt zu `strava.com`, Antworten ohne Token-Feld, Local Storage leer;
      zusaetzlich per Code-Pruefung abgesichert (kein `strava.com`-Aufruf im
      Frontend-Code).
- [x] Der Erstimport setzt nach Schliessen des Browsers korrekt fort, ohne
      Doppelimporte - live erlebt (33 Aktivitaeten, 30-Tage-Fenster,
      zwischendurch unterbrochen und korrekt fortgesetzt) und als
      Regressionstest abgesichert (`syncEngine.test.js`, deckt genau den
      Absturz-Fall "saveIndex lief durch, Fortschritt noch nicht" ab).
- [ ] Ist das Tageskontingent erreicht, pausiert der Import und laeuft am
      Folgetag weiter - Code/Logik vorhanden und fuer die
      15-Minuten-Drosselung getestet, das echte Tageslimit (4000/Tag) aber
      noch nicht live ausgereizt (praktisch aufwendig zu erzwingen).
- [x] Drive-Inhalte sind nach Loeschen des Browser-Caches vollstaendig
      wiederherstellbar - live bestaetigt: nach "Clear site data" (Local
      Storage, IndexedDB, Cookies) kamen alle 33 Aktivitaeten korrekt aus dem
      Google-Drive-App-Ordner zurueck, ohne erneuten Erstimport-Dialog.
- [x] Die Basis-URL ist konfigurierbar, Tokens werden nur im Header gesendet
      (`STRAVA_AUTH_BASE_URL`/`STRAVA_API_BASE_URL` in `worker/wrangler.toml`,
      `worker/src/strava.js`).

**Noch offen, bevor M2 vollstaendig abgenommen ist:**
- [x] **Cloudflare Auto-Deploy an dieses GitHub-Repo anbinden** - beide
  Projekte (`performance-app-worker`, `performance-app-web`) sind seit
  2026-09-17 im Cloudflare-Dashboard mit dem GitHub-Repo verbunden
  (Settings -> Builds -> Connect to Git), inkl. korrekter Root-directory/
  Deploy-command je Projekt (siehe unten). Zwei Stolpersteine beim
  Einrichten: (1) Cloudflare setzt **Root directory** standardmaessig auf
  `/` (Repo-Root) vor - dort liegt aber kein `package.json`, der erste
  Build schlug deshalb fehl. (2) Das GitHub-Repo hat `performance-app`
  selbst als Wurzel (nicht als Unterordner darin) - `worker`/`web` liegen
  direkt im Repo-Root, **ohne** `performance-app/`-Praefix. Ausserdem baut
  Cloudflare nur bei einem **neuen** Push nach dem Verbinden - ein bereits
  vor dem Verbinden vorhandener Commit auf `main` loest keinen Build aus.
  1. dash.cloudflare.com -> **Workers & Pages** -> Projekt
     `performance-app-worker` oeffnen -> **Settings** -> **Builds** ->
     **Connect to Git** -> Repo `christiandroessler/Performance`
     auswaehlen, GitHub-App-Zugriff erlauben.
  2. Build-Konfiguration: **Root directory** = `worker` (nicht `/`, nicht
     `performance-app/worker`!), Build-Befehl leer lassen (kein Bundling
     noetig), Deploy-Befehl `npx wrangler deploy` (Standard).
  3. Gleiches Vorgehen fuer Projekt `performance-app-web`, **Root
     directory** = `web` (nicht `/`, nicht `performance-app/web`),
     Deploy-Befehl **`npm run deploy`** (nicht `npx wrangler deploy`
     direkt) - das synct vorher `core/src` (M1) nach `web/vendor/core/src`,
     siehe `web/README.md`.
  4. Nach dem Verbinden: Secrets (`STRAVA_CLIENT_SECRET`,
     `TOKEN_ENCRYPTION_KEY`) sind bereits per `wrangler secret put` auf dem
     Worker gesetzt und bleiben bei Git-Deploys erhalten (Secrets sind nicht
     Teil des Repos/Builds).
  5. Test: einen Commit auf `main` pushen, in **Deployments** pruefen, dass
     ein Deploy automatisch angestossen wird (erscheint dort als
     Git-Build, nicht als "Manually deployed / Wrangler").
- Echtes Tageskontingent-Pause/Resume (s. o., eher ein theoretischer Punkt).
- `storage.js`/`idb.js` noch nicht gegen ein Konto mit mehrjaehriger
  Trainingshistorie durchgespielt (nur 30-Tage-Fenster bisher getestet).

## M3-Status im Detail

Erste Runde begonnen (Lastenheft Kap. 6.5-6.7 minus FA-SIG-10/11/12, Kap. 6.9
teilweise), siehe `web/README.md` fuer die volle Aufschluesselung. `core/`
(M1, unveraendert) ist jetzt ins Frontend eingebunden und laeuft dort in
einem Web Worker (NFA-04), gefuettert mit den in M2 abgelegten Rohdaten:

- **Aktivitaetsliste** (FA-ACT-01), **Leistungskurve/persoenliche Bestwerte**
  (FA-ACT-03, inkl. W/kg mit Gewicht zum Aktivitaetsdatum), **Performance
  Management Chart** (FA-TP-06, CTL/ATL/TSB), **Breakthrough-Verwaltung**
  (FA-SIG-07/08: Mehrfachauswahl zum Verwerfen, Reaktivieren) sind gebaut und
  deployt, aber noch **nicht** live gegen die echten 33 importierten
  Aktivitaeten des Auftraggebers durchgeklickt.
- Absichtlich noch offen: Detailansicht mit Stream-Charts (FA-ACT-02),
  Wochen-/Kalenderuebersicht (FA-TP-07), automatische Schwellen-Schaetzung
  fuer HF/Pace/Schwimmen (FA-TP-03/04 - ohne die gibt es aktuell kein
  hrTSS/Pace-TSS, nur NP/IF/TSS aus Leistung), PP-Plausibilisierung
  (FA-SIG-13), Einstellungen-UI (FA-SET-01-04).
- `web/test/computePipeline.test.js` prueft die Naht Ablageformat -> core
  (RawStreamPoint[]-Form, FA-DQ-01 deviceWatts-Maskierung); die
  Algorithmus-Korrektheit selbst deckt bereits `core/test/` ab (M1).

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
