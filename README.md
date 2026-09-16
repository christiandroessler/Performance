# Performance App (Trainingsgruppe)

Performance Dashboard combining Trainingpeaks, XERT and Sentiero.

Umsetzung gemäß [`docs/LASTENHEFT.md`](docs/LASTENHEFT.md). Reihenfolge laut F15:
Rechenkern zuerst, getestet mit dem Strava-Datenexport.

## Meilensteine

| Meilenstein | Inhalt | Status |
|---|---|---|
| **M1** | Rechenkern (Bibliothek) | abgeschlossen, siehe [`core/`](core/) |
| M2 | Fundament (Cloudflare, Google-Login, Strava-OAuth, Drive-Ablage) | offen |
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
