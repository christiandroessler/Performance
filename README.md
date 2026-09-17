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
`storage.js`, `streamCodec.js`, `sync.js`, `syncView.js` - siehe
`web/README.md` fuer Ablageformat und Ablauf). Bewusst **nicht** Teil dieser
M2-Runde: die eigentliche Modellberechnung (Signaturverlauf, Breakthroughs,
`model/*.json`) haengt noch nicht am Sync - das ist M3-Scope, dort auch
gegen die M1-Ergebnisse verifiziert; keines der M2-Abnahmekriterien
verlangt berechnete Kennzahlen.

**Noch offen, bevor M2 als abgenommen gelten kann** (siehe
`worker/README.md` fuer die Einrichtungsschritte):
- Cloudflare Pages + Worker mit Auto-Deploy an dieses GitHub-Repo anbinden
  (aktuell manuelles `wrangler deploy` / `wrangler pages deploy`).
- Der neue Sync-Code ist bisher nur durch `web/test/streamCodec.test.js`
  (reine Logik) automatisiert getestet, `sync.js`/`storage.js`/`idb.js`
  noch nicht im echten Browser gegen ein Konto mit Trainingshistorie
  durchgespielt.
- Verbleibende M2-Abnahmekriterien noch zu pruefen: "Kein Strava-Token im
  Browser" (Entwicklerwerkzeuge), Erstimport-Fortsetzung ohne Doppelimport
  nach Browser-Neustart, Pause/Fortsetzung bei erschoepftem Tageskontingent,
  vollstaendige Drive-Wiederherstellbarkeit nach Cache-Loeschung.

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
