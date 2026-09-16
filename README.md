# Performance App (Trainingsgruppe)

Umsetzung gemäß [`docs/LASTENHEFT.md`](docs/LASTENHEFT.md). Reihenfolge laut F15:
Rechenkern zuerst, getestet mit dem Strava-Datenexport.

## Meilensteine

| Meilenstein | Inhalt | Status |
|---|---|---|
| **M1** | Rechenkern (Bibliothek) | in Arbeit, siehe [`core/`](core/) |
| M2 | Fundament (Cloudflare, Google-Login, Strava-OAuth, Drive-Ablage) | offen |
| M3 | Oberfläche TrainingPeaks/Strava/XERT | offen |
| M4 | 3D-Modell und Kalibrierung | offen |
| M5 | Stoffwechselmodell | offen |
| M6 | Gruppe, Datenschutz, PWA | offen |

## M1-Status im Detail

Siehe [`core/README.md`](core/README.md) fuer den vollstaendigen Funktionsumfang
und alle in M1 getroffenen Festlegungen (Stream-Format, Ausreisserregel,
Lueckenbehandlung, Regressionsverfahren, JS/TS-Entscheidung).

**Wichtig:** Der Code in `core/` wurde in dieser Entwicklungssitzung ohne
funktionierenden Shell-Zugriff erstellt und daher noch **nicht** per
`node --test` ausgefuehrt. Bitte vor dem Weiterbauen einmal lokal laufen
lassen:

```bash
cd core
node --test test/
```

Offene M1-Abnahmepunkte, die echte Daten bzw. eine Laufzeitumgebung
voraussetzen und daher noch ausstehen:

- [ ] Testlauf `node --test test/` lokal bestaetigen (s. o.).
- [ ] Vollstaendiger Strava-Export des Auftraggebers laeuft ohne Absturz durch
      (`core/www/index.html` als Sichtkontrolle, oder ein kleines Node-Script
      gegen `core/src/importers`).
- [ ] FIT-Parser gegen eine echte `.fit`-Datei verifizieren (siehe
      `core/README.md`, Abschnitt "Bekannte offene Punkte").
- [ ] Performance-Messung NFA-04 (6h-Aktivitaet, Neuberechnung ≤ 2s) auf einem
      echten Desktop-Rechner dokumentieren.

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
