# Offene Fragen (Phase 1 – Analyse)

Alles, was im Rahmen der drei parallelen Code-Audits (`web/`, `core/`,
`worker/` + Tooling, 2026-10-01) nicht abschließend geklärt werden konnte.
Zwei ursprünglich offene Fragen wurden während der Synthese direkt verifiziert
und sind unten als **beantwortet** markiert, nicht gelöscht, damit die
Beleg-Kette nachvollziehbar bleibt.

---

## Bereits beantwortet (während der Synthese verifiziert)

**War der Stored-XSS-Pfad in `groupView.js:72` nur theoretisch, falls der
Worker die Einladungs-E-Mail strikter validiert als der Client?**
→ **Nein, bestätigt real.** `worker/src/index.js:304`
(`if (!email || !email.includes('@')) throw new HttpError(400, 'invalid_email');`)
validiert serverseitig genauso schwach wie der Client
(`web/src/groupView.js:145`). Ein eingeladener String wie
`<img src=x onerror=...>@x` passiert beide Prüfungen und würde beim
nächsten `listMembers()`-Aufruf per `innerHTML` ausgeführt
(`groupView.js:72`). Betroffen ist nur der Admin-Einladungs-Workflow (max.
10 Allowlist-Plätze, nur ein vertrauter Admin kann einladen) – Severity
mittel, nicht hoch, aber kein rein theoretisches Risiko mehr. Siehe
`docs/MODULE.md`, P-12.

**Ist `web/vendor/core` tatsächlich im Git getrackt, oder nur ein lokales
Build-Artefakt?**
→ **Getrackt.** `git ls-files web/vendor/core` liefert 24 Dateien. Es gibt
**keinen** `.gitignore`-Eintrag dafür, obwohl `web/README.md` es
("`npm run sync-core` synchronisierte Kopie... kein Live-Import") als reines
Kopier-Artefakt beschreibt. Siehe "Noch zu entscheiden" unten – das ist kein
Bug, aber eine bewusste Entscheidung wert.

**Ist die deklarierte Wrangler-Version (`worker/package.json:13`,
`^4.0.0`) noch aktuell?**
→ **Ja, aktuell kompatibel.** Beim Deploy in dieser Session wurde
tatsächlich `wrangler@4.143.1` installiert und ausgeführt (`npm run deploy`
in `web/`, 2026-10-01) – liegt innerhalb der deklarierten `^4.0.0`-Spanne,
kein Major-Versionssprung nötig.

---

## Noch offen, braucht eine Entscheidung des Auftraggebers

1. **Pro-Konto-Schlüsselung des IndexedDB-Caches** (`web/src/storage.js:28-54`):
   Der Cache ist ein einziger, nicht pro Google-Konto geschlüsselter Store;
   Kontowechsel-Sicherheit läuft über eine globale
   `ensureCacheMatchesUser`-Invalidierung (Versions-Marker-Vergleich), nicht
   über echte Schlüsselung (`name` → `${email}:${name}`). Funktioniert nach
   dem Bugfix vom 2026-09-20 korrekt, ist aber strukturell fragiler als eine
   echte Schlüsselung. Lohnt sich der Umbau, falls künftig häufiger zwischen
   mehreren Konten im selben Browser gewechselt wird, oder bleibt die
   aktuelle Lösung die dauerhafte Antwort?
2. **`web/vendor/core` committen oder gitignoren?** Es ist aktuell committet,
   aber als reines Build-Artefakt beschrieben (`web/README.md`). Zwei
   konsistente Optionen: (a) explizit als bewusst committetes Artefakt
   dokumentieren (schützt gegen "vergessener Sync zeigt alte
   Rechenkern-Version", ein bereits im README genannter Risikofall), oder
   (b) gitignoren und per Pre-Deploy-Hook zwingend regenerieren (wie es der
   `sync-core`-Schritt im Prinzip schon tut, nur ohne Erzwingung). Keine
   technische Dringlichkeit, reine Policy-Frage.
3. **`core/src/settings.js`s `ctlTau`/`atlTau`**: toter Code (nirgends in
   `core/src` gelesen, `computeCTLATL` hat eigene Defaults) oder unfertig
   verdrahtete Einstellbarkeit? Falls letzteres: Soll CTL/ATL-Zeitkonstante
   tatsächlich über die Einstellungen-UI änderbar werden (das Lastenheft
   nennt sie in Kap. 12 als "einstellbar")?

## Noch offen, braucht Messung/Live-Test (nicht durch Code-Lesen klärbar)

4. **Tatsächliche Netzwerk-Ladezeit/Requestanzahl beim App-Start.** `web/src`
   ist zusammen ~265 KB über 34 einzelne ES-Module-Requests (kein Bundler).
   Nicht gemessen, nur die Dateigröße. Relevant für FA-PWA/NFA-04-adjacente
   Performance-Einschätzung auf echten Mobilgeräten.
5. **SVG-Charts bei sehr schmalen Viewports (< 375px).** Feste `font-size`
   in mehreren Chart-Dateien (`activityDetailView.js`, `pmcView.js`,
   `powerCurveView.js`) könnte auf sehr kleinen Screens unleserlich werden –
   nicht live/emuliert geprüft.
6. **Verhalten bei dauerhaft fehlschlagendem `idbPut`** (z. B. IndexedDB-Quota
   erreicht, `web/src/storage.js:64-68`) – nie beobachtet/getestet, keine
   UI-Diagnose dafür vorhanden.
7. **Effekt der fehlenden allgemeinen Flood-Protection** auf dem
   10-ms-CPU-Budget des Workers (`POST /api/session` kann beliebig oft mit
   ungültigem Token angefragt werden) – ohne Load-Test nicht bezifferbar,
   vermutlich durch Cloudflares Edge-Schutz abgefangen, aber nicht im
   Code selbst abgesichert.
8. **Ob `console.error`-Aufrufe in der echten Workers-Runtime jemals
   Token-Fragmente über Fehlerobjekt-Eigenschaften transportieren könnten**
   (`worker/src/index.js:209,325` loggt `err` aus `revokeAccessToken`) –
   statisch nicht abschließend verifizierbar, abhängig von der genauen
   Fehlerobjekt-Form der Workers-Runtime.

## Technische Restfragen, vor einer konkreten Umsetzung zu klären

9. **`cpFit.js`s `cp`-Boden von 120 W** (siehe `docs/MODULE.md`, K-01): ist
   120 W eine bewusste, irgendwo besprochene Untergrenze (z. B. "niemand in
   der Zielgruppe hat einen echten CP darunter"), oder ein unreflektierter
   numerischer Zufallswert aus der ursprünglichen Portierung aus
   `strava-dashboard`? Betrifft, ob ein Fix "Grenze anheben/konfigurierbar
   machen" oder "nur eine Transparenz-Flag ergänzen" sein sollte.
10. **`strain.js`s `p > pMax`-Fall** (K-06): Soll die Sättigung
    (`pW = min(above - pPmax, above)` oder analog) exakt an der Kontro-et-al.-
    Publikation ausgerichtet werden (dort vermutlich nicht explizit für
    diesen Grenzfall spezifiziert), oder reicht eine pragmatische,
    dokumentierte Sättigung ähnlich den bereits vorhandenen
    `maxPlausible*`-Mustern?
11. **`tokenManager.js`s 400-vs-`invalid_grant`-Unterscheidung** (A-01): Hat
    Strava einen stabilen, im Response-Body dokumentierten Fehlercode, den
    man statt des reinen HTTP-Status prüfen könnte? (Strava-API-Dokumentation
    wurde in diesem Audit nicht erneut konsultiert – reine Code-Analyse.)
12. **Admin-Routen-Drosselung** (Q-01): reicht ein einfacher, fester
    Minimalabstand pro Admin-Aufruf (analog zum bestehenden
    `rateLimiter.js`-Muster, nur ohne Strava-Header-Abhängigkeit), oder ist
    das Risiko bei max. 10 Allowlist-Mitgliedern bewusst vernachlässigbar
    und soll unangetastet bleiben?

## Zeitstempel-/Scope-Hinweis

13. **Paralleles "Signatur-Verfall im Rechenkern"-Feature.** Während dieses
    Audits liefen (außerhalb dieser Session) bereits Änderungen an
    `core/src/signature.js`, `loadResponse.js`, `thresholds.js`, `index.js`
    sowie mehreren Web-Views (neue Exporte `decaySignature`/
    `currentSignatureAtDate`, neue Tests in `core/test/signature.test.js`).
    Diese Änderungen sind **nicht** Teil dieses Audits und nicht committet
    zum Zeitpunkt der Analyse. Einzelne Datei:Zeile-Zitate in
    `docs/MODULE.md` zu K-05 (`signature.js`), K-08 (`thresholds.js`) und
    K-10 (`loadResponse.js`) können sich dadurch bereits leicht verschoben
    haben – die strukturellen Befunde (Funktionsgröße, Testlücken-Muster)
    bleiben voraussichtlich gültig, sollten aber bei der nächsten Berührung
    dieser Dateien kurz gegen den dann aktuellen Stand abgeglichen werden.
