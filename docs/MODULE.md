# Modul-Inventur (Phase 1 – Analyse)

Diese Datei ist das Ergebnis einer vollständigen Code-Durchsicht (3 parallele
Audits über `web/src`, `core/src`, `worker/src` + ein repo-weiter
Tooling-Check) am 2026-10-01. Ziel: jede fachliche Einheit identifizieren,
benennen und so bewerten, dass sie später **einzeln** verbessert werden kann,
ohne den Rest anzufassen (siehe `docs/ARCHITEKTUR.md` für die Zielarchitektur
und den Datenfluss).

**ID-Schema:**
- **P-xx** – Seiten/Views (`web/src`, UI-Ebene)
- **K-xx** – Rechenkern-Funktionen (`core/src`)
- **A-xx** – Datenquellen/Adapter (Strava, Google Drive)
- **Q-xx** – Querschnitt (Auth, Speicher/Cache, Routing, UI-Bausteine, PWA)

Jede Aussage unten trägt einen Datei:Zeile-Beleg. Severity: **hoch** (echter
Bug/Risiko mit konkretem Schadensbild) / **mittel** (strukturelles Problem,
sollte bei nächster Berührung behoben werden) / **niedrig** (kosmetisch oder
nur unter seltenen Bedingungen relevant). Unklare Punkte sind als solche
markiert, nicht vermutet – siehe `docs/OFFENE-FRAGEN.md` für die
Gesamtliste.

**Hinweis zu "Datenquellen/Adapter":** Das Lastenheft nennt intervals.icu und
TrainingPeaks nur als **Vorbilder für Funktionsumfang** (Kap. 1), nicht als
echte Datenquellen – die App hat dafür keine Adapter und braucht keine. Die
einzige echte Datenquelle ist Strava (API), die einzige Speicher-Datenquelle
Google Drive. `A-xx` enthält deshalb nur diese zwei.

---

## Übersichtstabelle

| ID | Pfad(e) | Zweck | Abhängigkeiten | Priorität | Aufwand |
|---|---|---|---|---|---|
| P-01 | `web/src/dashboardView.js`, `dashboardExtras.js` | Übersicht: verdrahtet alle M3-Kacheln, fehlerisolierte Sektions-Renderer | Q-06, P-02…P-09, A-02 | niedrig | – |
| P-02 | `web/src/activityListView.js`, `activityFilter.js` | Aktivitätsliste, Filter/Suche, öffnet Detail | P-03, Q-07 | niedrig | S |
| P-03 | `web/src/activityDetailView.js`, `chartUtils.js` | Aktivitätsdetail (Modal): Verläufe, MPA/W'bal, Stoffwechsel, synchroner Hover | K-*, Q-04, Q-06, A-02, Q-07 | **hoch** | L |
| P-04 | `web/src/powerCurveView.js` | Leistungskurve, Vorhersage-Regler, Sportart-Schwellen | K-*, Q-06, A-02 | mittel | M |
| P-05 | `web/src/pmcView.js`, `pmcMath.js` | Performance Management Chart (CTL/ATL/TSB) | K-07 | mittel | M |
| P-06 | `web/src/loadResponseView.js` | Belastung-Tab (Low/High/Peak-Charts + Kalibrierungsbericht) | Q-06, K-10 | niedrig | M |
| P-07 | `web/src/breakthroughView.js` | Breakthrough-Übersicht, Verwerfen/Reaktivieren | Q-06 | niedrig | S |
| P-08 | `web/src/weekView.js`, `calendarUtils.js` | Wochen-/Kalenderübersicht | P-03, Q-07 | niedrig | – |
| P-09 | `web/src/metabolicView.js` | Stoffwechselprofil + Zonen | K-11, Q-06, P-14 | niedrig | S |
| P-10 | `web/src/settingsView.js` | Einstellungen: Modellparameter, Laborwerte, Konto | A-01, A-02, Q-02, Q-05, Q-06, Q-07 | **hoch** | L |
| P-11 | `web/src/profileView.js` | Profilfoto, Stammdaten, Gewichtsverlauf | P-14, A-02, Q-02 | niedrig | M |
| P-12 | `web/src/groupView.js` | Admin-Gruppenverwaltung (Einladen/Entfernen) | Q-05 | **mittel (XSS, bestätigt)** | S |
| P-13 | `web/src/glossaryView.js` | Statisches Glossar | – | niedrig | – |
| P-14 | `web/src/syncView.js`, `onboarding.js` | Sync-UI + 5-Schritte-Onboarding | Q-04, Q-05, A-02 | mittel | M |
| P-15 | `web/src/main.js` | Entry Point, App-Shell, Navigation, Nutzermenü | P-*, Q-02, Q-05, A-02 | niedrig | S |
| K-01 | `core/src/cpFit.js` | 3-/2-Parameter-CP-Fit (Morton 1996), IRLS-Robustfit | – | **hoch** | S |
| K-02 | `core/src/mpa.js` | MPA(t) aus W'bal (Kontro et al.) | K-03 | **hoch (Testlücke)** | S |
| K-03 | `core/src/wbal.js` | W'bal-ODE (Skiba 2015) | – | niedrig | – |
| K-04 | `core/src/breakthrough.js` | Breakthrough-Erkennung + Refit mit Umverteilung | K-01, K-02, K-13 | mittel | M |
| K-05 | `core/src/signature.js` | Orchestrierung Startsignatur + chronologischer Durchlauf | K-01,K-02,K-04,K-06,K-07,K-09,K-15,K-16 | **hoch (Struktur)** | L |
| K-06 | `core/src/strain.js` | Strain Score (Kontro 2025) | – | **hoch (Numerik-Bug)** | S |
| K-07 | `core/src/npTss.js` | NP/IF/TSS/hrTSS/paceTSS + CTL/ATL/TSB (PMC) | K-13 | **hoch (Testlücke)** | M |
| K-08 | `core/src/thresholds.js` | Sportart-Schwellen, hrTSS/paceTSS-Routing | K-09, K-07, K-05 | niedrig | S |
| K-09 | `core/src/pace.js` | Pace/HF-Hilfsfunktionen | K-13 | niedrig | – |
| K-10 | `core/src/loadResponse.js` | Belastungsgekoppelter Signaturverlauf (3D-Impulse-Response, M4) | K-05 | niedrig | S |
| K-11 | `core/src/metabolic.js` | Mader-Stoffwechselmodell (Steady-State, M5) | K-01 | niedrig | – |
| K-12 | `core/src/streams.js`, `quality.js` | 1-Hz-Resampling, Ausreißerfilter, Lückenbehandlung | – | niedrig | S |
| K-13 | `core/src/mmp.js` | Mean-Maximal-Power/Envelope/Stützpunkte | – | mittel (Testlücke + Perf.) | M |
| K-14 | `core/src/activity.js` | Bündelt Resampling/Quality/MMP zu `prepareActivity` | K-12, K-13 | niedrig | – |
| K-15 | `core/src/twoParamCheck.js` | 2-Parameter-Konsistenzprüfung (FA-SIG-14, S-Prio) | K-01 | mittel (Testlücke) | S |
| K-16 | `core/src/settings.js`, `types.js` | Default-Settings + JSDoc-Typen | – | mittel | S |
| K-17 | `core/src/importers/*` | Parser: GPX/TCX/FIT/CSV + Dispatch | – | mittel | S |
| A-01 | `worker/src/strava.js`, `tokenManager.js`, `cryptoTokens.js` | Strava-OAuth, Proxy, verschlüsselte Token-Ablage | Q-01 | **hoch (Datenintegrität)** | M |
| A-02 | `web/src/drive.js` | Google-Drive-App-Ordner-Zugriff | Q-02 | niedrig | – |
| Q-01 | `worker/src/session.js`, `googleAuth.js`, `kvStore.js`, `http.js`, `index.js` | Google-ID-Token-Prüfung, Allowlist, Router | A-01 | mittel | M |
| Q-02 | `web/src/auth.js` | Google Sign-In + Drive-OAuth-Token, Konto-Verifikation | Q-05 | niedrig | – |
| Q-03 | `web/src/storage.js`, `idb.js`, `streamCodec.js` | Speicherschicht: Drive-first-write, Cache-first-read | A-02 | mittel | M |
| Q-04 | `web/src/syncEngine.js`, `sync.js` | Sync-Zustandsmaschine (Listing/Streams/Drosselung) | Q-05, Q-03 | niedrig | S |
| Q-05 | `web/src/api.js`, `config.js` | Worker-API-Client | Q-02 | niedrig | – |
| Q-06 | `web/src/calcWorker.js`, `compute.js` | Rechenkern-Anbindung (Web Worker) + Orchestrierung | K-*, Q-03, Q-04 | mittel | M |
| Q-07 | `web/src/theme.js`, `format.js` | Geteilte UI-Utilities (Dark Mode, Formatierung) | – | niedrig | – |
| Q-08 | `web/sw.js`, `web/index.html` | PWA-Installierbarkeit (reiner Passthrough-SW) | – | niedrig | – |
| Q-09 | `worker/src/rateLimiter.js` | App-weite Strava-Drosselungslogik | – | niedrig | – |

---

## Detailbefunde

### P-03 Aktivitätsdetail — `activityDetailView.js`, `chartUtils.js`
**Priorität hoch, Aufwand L** – größte Datei im Projekt (21.213 B), stärkste
Verantwortungsvermischung.
- **[Struktur, hoch]** `render()` (`activityDetailView.js:184-453`) ist eine
  **270 Zeilen lange Funktion**, die Datenladen, Geschäftslogik, SVG-Rendering
  und Event-Handling mischt. Für das Ziel "isoliert verbessern" die Datei mit
  dem größten Aufteilungsbedarf.
- **[Duplikation, mittel]** `weightAtDate` ist **drei Mal** fast identisch
  implementiert: `activityDetailView.js:142-150`, `powerCurveView.js:40-49`,
  `metabolicView.js:12-20` — ein Bugfix müsste an 3 Stellen synchron erfolgen.
- `createTimeChart` (`activityDetailView.js:32`) hat 8 optionale Parameter
  ohne JSDoc-Typ — Tippfehler in einem Parameternamen würde stillschweigend
  den Default verwenden.
- **[Testlücke]** 0 Testabdeckung; `weightAtDate` (reine Logik) wäre
  extrahierbar und testbar gewesen, analog zu `chartUtils.js`, das genau aus
  diesem Grund abgetrennt wurde (`chartUtils.js:1-3`).
- Gute Fehlerbehandlung: `openActivityDetail` (`activityDetailView.js:152-183`)
  hat einen äußeren `try/catch`.

### P-04 Leistungskurve — `powerCurveView.js`
- Mischt Rendering mit Datenladen (`renderPowerCurve`, `powerCurveView.js:51-183`).
- Enthält die zweite Kopie von `weightAtDate` (`powerCurveView.js:40-49`), siehe P-03.
- 0 Testabdeckung (SVG-lastig, inhärente Einschränkung).
- Gutes defensives Muster: zwei lokale `try/catch`-Blöcke um Karten
  (`powerCurveView.js:58-63,177-181`), dupliziert aber das `safeRender`-Muster
  aus `dashboardView.js` statt es zu teilen.

### P-05 PMC — `pmcView.js`, `pmcMath.js`
- `computePmcSeries` (`pmcView.js:38-66`, reine Logik) blieb in der View-Datei
  statt wie `pmcMath.js` ausgelagert zu werden — inkonsistente Anwendung des
  sonst guten "reine Logik raus"-Musters.
- Zweitgrößte Datei (14.786 B); eine Aufteilung Berechnung/Chart/Sidebar wäre sinnvoll.
- `pmcMath.js` selbst: vorbildlich klein, rein, getestet (`pmcMath.test.js`, 6 Tests).

### P-06 Belastung — `loadResponseView.js`
- Eigener SVG-Chart-Baustein (`buildSystemChart`, `loadResponseView.js:164-298`,
  134 Zeilen), bewusst nicht aus `pmcView.js#buildChart` wiederverwendet
  (begründet, `loadResponseView.js:9-13`) — führt aber zu struktureller
  Duplikation zwischen zwei sehr ähnlichen SVG-Hover-Chart-Implementierungen.
- Gutes Transparenz-Muster bei fehlenden Kalibrierungsdaten
  (`loadResponseView.js:66-158`, Fallback-Badges statt falscher Zahlen).

### P-10 Einstellungen — `settingsView.js`
**Priorität hoch, Aufwand L** – größte Datei im Projekt (27.009 B).
- **[Struktur, hoch]** `openSettings()` (`settingsView.js:129-609`) ist eine
  **480 Zeilen lange Funktion** mit 6 verschachtelten Unterkarten
  (`renderAppearanceCard`, `renderLabValuesCard`, `renderParamsCard`,
  `renderChangelogCard`, `renderStravaConnectionCard`, `renderAccountCard`),
  die alle als innere Closures gefangen sind, nicht einzeln
  exportierbar/testbar.
- **[Typmismatch-Risiko, niedrig]** `PARAM_GROUPS` (`settingsView.js:25-116`)
  ist nur ein Objektliteral ohne `@typedef`; ein Tippfehler im `key`-Feld
  würde den Parameter beim Speichern stillschweigend als "keine Abweichung"
  behandeln und NIE persistieren (`settingsView.js:429`) — konkretester Beleg
  im ganzen Projekt für das Duck-Typing-Risiko.
- **Belegter Testlücken-Schaden**: der im `web/README.md` dokumentierte,
  bereits gefixte Bug ("alle Parameter wurden beim Speichern eingefroren")
  wäre mit einem einzigen Unit-Test über die reine Diff-Logik nie aufgetreten.
- Laborwerte-Eingabe (`settingsView.js:268-276`) hat keine Plausibilitätsgrenzen.
- `window.location.reload()` nach jedem Speichern (`settingsView.js:467`) ist
  ein grober UX-Bruch (funktional korrekt, nicht elegant).

### P-11 Profil — `profileView.js`
- Bildverarbeitung (`resizeImageToJpeg`, `profileView.js:16-43`) ist eine reine,
  isolierbare Funktion, aber nicht ausgelagert.
- `fileInput.accept='image/*'` ist nur client-seitige Empfehlung, keine echte
  Validierung — Fehlerfall ist aber korrekt über `img.onerror` abgefangen.

### P-12 Gruppe/Admin — `groupView.js`
**Priorität mittel, bestätigter Befund (nicht nur theoretisch)**
- `row.innerHTML = ...${m.email}${adminBadge}...` (`groupView.js:72`) bettet
  die E-Mail-Adresse ungefiltert per `innerHTML` statt `textContent` ein.
  **Bestätigt per Code-Prüfung des Worker-seitigen Invite-Handlers**
  (`worker/src/index.js:304`: `if (!email || !email.includes('@')) throw ...`)
  — der Server validiert **genauso schwach** wie der Client
  (`groupView.js:145`, ebenfalls nur `.includes('@')`). Ein eingeladener
  String wie `<img src=x onerror=...>@x` würde beide Validierungen passieren
  und beim nächsten `listMembers()`-Aufruf per `innerHTML` ausgeführt. Das ist
  der einzige im gesamten Audit gefundene, nicht mehr nur theoretische
  Stored-XSS-Pfad — betrifft nur den Admin-Workflow (max. 10 Allowlist-Plätze,
  nur ein vertrauter Admin kann einladen), daher Severity mittel statt hoch.
- Sonst sauberste Kopplung unter den großen View-Dateien (nur `api.js`-Import).
- Gute Zwei-Schritt-Bestätigung vor irreversiblen Aktionen (`groupView.js:85-101`).

### P-14 Sync-UI/Onboarding — `syncView.js`, `onboarding.js`
- `renderRecomputeCard` (`syncView.js:188-227`) rendert UI **und** löst
  `recomputeAll()` direkt im Klick-Handler aus — stärkste
  Rendering/Aktion-Vermischung neben `settingsView.js`.
- Beste Fehler-UX im Projekt: `REASON_TEXT`-Mapping (`syncView.js:16-19`)
  übersetzt technische Pause-Gründe in verständliche deutsche Texte,
  automatischer Retry bei `rate_limited`.
- **[Struktur]** `onboarding.js` exportiert `loadOrInitSettings()`
  (`onboarding.js:25-42`), eine reine Datenzugriffsfunktion, die **4 andere
  View-Dateien** (`settingsView.js`, `metabolicView.js`, `profileView.js`,
  `main.js`) direkt re-importieren — macht `onboarding.js` faktisch zum
  informellen "Settings-Repository", versteckt hinter einem Onboarding-Namen.
- **[Schema-Drift, niedrig]** das von `loadOrInitSettings()` definierte
  Default-Objekt (`onboarding.js:28-41`) hat **kein** `profile`-Feld, obwohl
  `profileView.js:161` later `settings.profile` schreibt — funktioniert nur
  über die defensive Konvention `settings.profile || {}`, nirgends zentral
  deklariert.

### P-15 App-Shell — `main.js`
- Beste Fehlerbehandlung an der obersten Ebene (`main().catch(showFatalError)`,
  `main.js:22`).
- `buildUserMenu` (`main.js:243-339`) ist die **einzige** Stelle mit voller
  ARIA-Unterstützung (siehe Q-07/Barrierefreiheit unten) — nicht auf
  Tab-Navigation oder andere Modals übertragen.
- `withTimeout` (`main.js` via `dashboardView.js:96-98`) ist dupliziert zu
  `auth.js:195-197` — gemeinsame Utility fehlt.

---

### K-01 Critical-Power-Fit — `cpFit.js`
**Priorität hoch, Aufwand S**
- **[Numerik, mittel-hoch, NEU]** Der interne `CLAMP`
  (`cpFit.js:94-98`: `cp∈[120,500]`, `wPrime∈[4000,45000]`,
  `pMax∈[max(cp+60,450),2600]`) ist fest im Optimierer verdrahtet, **nicht**
  über Settings konfigurierbar — anders als die Post-Fit-Grenzen
  `maxPlausibleCp`/`maxPlausiblePMax`/`maxPlausibleWPrimeJ`. Das
  `core/README.md` dokumentiert nur den `wPrime`-Fall (45000-Clamp, bereits
  gefixt); die **`cp`-Untergrenze von 120 W** hat **keine** Transparenz-Flag
  analog zu `wPrimeClampedAtInitial` — ein Athlet/Sportart mit echtem CP unter
  120 W (z. B. Laufleistung, leichte/ältere Athleten) würde stillschweigend
  nach oben geklemmt, ohne jeden Hinweis in der UI.
- **[Dokumentation, mittel]** Keine der drei CLAMP-Grenzen trägt einen
  Begründungs-Kommentar — ein auffälliger Bruch mit der sonst sehr hohen
  Dokumentationsdisziplin dieses Projekts.
- `fit2ParamCP`/`powerDurationCurve` ohne direkten Test.

### K-02 MPA — `mpa.js`
**Priorität hoch (Testlücke), Aufwand S**
- **[Testlücke, hoch]** **Keine direkte Testabdeckung für das gesamte Modul.**
  `mpaAtBalance`/`mpaTrace` werden von keiner Testdatei importiert, nur
  indirekt über `breakthrough.test.js`-Szenarien erreicht. Kein Test fixiert
  das Verhalten von `mpaExponent` (n=1 Morton vs. n=2 Kontro) isoliert, obwohl
  das ein einstellbarer, wissenschaftlich bedeutsamer Schalter ist.
- `mpaAtBalance(balanceJ, cp, wPrimeJ, pMax, n)` (`mpa.js:15-19`) hat keinen
  Guard, dass `pMax > cp` — ein vertauschter Aufruf-Parameter liefert eine
  endliche, aber stillschweigend falsche Zahl statt eines Fehlers.

### K-04 Breakthrough/Refit — `breakthrough.js`
**Priorität mittel, Aufwand M**
- **[Struktur, mittel]** `refitSignature` (`breakthrough.js:90-177`, 87
  Zeilen) mischt ≥5 Konzerne (Evidenz-Zählung, Fit, zwei Trägheitsbremsen,
  Absenkbremse+Plausibilitätsklammer, MPA-Konvergenz). Jeder Schritt ist gut
  begründet dokumentiert, aber keiner ist eine separat testbare Einheit — die
  schärfste Spannung zum NFA-07-Ziel "ein Konzern isoliert ändern".
- `applyDropBrake` (`breakthrough.js:196-217`): zwei Zweige mit identischem
  Code, könnten zusammengefasst werden (kosmetisch).
- `enforceMpaConstraint` (`breakthrough.js:249-291`) rechnet bei jedem
  1%-Schritt die volle Aktivitäts-MPA/W'bal-Spur neu — aktuell unproblematisch
  (≲20-30 Schritte), würde bei stark abweichendem `maxMpaCorrectionPct` aber
  spürbar.

### K-05 Signatur-Orchestrierung — `signature.js`
**Priorität hoch (Struktur), Aufwand L**
- **[Struktur, mittel-hoch]** `computeSignatureHistory`
  (`signature.js:96-226`, 130 Zeilen) ist die größte, am wenigsten zerlegte
  Funktion im Rechenkern und die Stelle, durch die der gesamte Datenfluss
  läuft — verantwortlich für ≥6 Konzerne (W'bal-Kontinuität,
  Breakthrough-Erkennung, Refit-Aufruf, Medaillen, 2-Param-Check,
  NP/TSS/IF/Strain, Ergebnis-Zusammenbau). Eine Extraktion der
  Pro-Aktivität-Schleife (`signature.js:128-223`) in eine benannte
  `processActivity(...)`-Hilfsfunktion wäre eine reine,
  verhaltensneutrale Refactoring-Maßnahme (von der bestehenden Testsuite
  sofort abgesichert) mit dem höchsten Nutzen für das erklärte Isolationsziel.
- **[Fehlerpfad, niedrig]** Ein Breakthrough-Fenster, dessen Refit nicht
  konvergiert, fällt stillschweigend auf die unveränderte Signatur zurück
  (`breakthrough.js:126-128`), aber `signature.js:149/165-191` legt trotzdem
  einen `breakthroughRecord` mit `fit:null` an — kein explizites Flag
  unterscheidet "Fenster erkannt, Refit nicht konvergiert" von "Refit
  erfolgreich, kein Medaillen-Anstieg".

### K-06 Strain Score — `strain.js`
**Priorität hoch (Numerik-Bug), Aufwand S**
- **[Numerik, mittel-hoch, NEU – nicht in core/README.md dokumentiert]**
  `splitPower` (`strain.js:49-56`) ist für `p > pMax` **ungeschützt**:
  `pPmax = above²/(pMax-cp)` kann `above` übersteigen, wodurch
  `pW = above - pPmax` **negativ** wird. Das fließt ungebremst in `highSR`
  (`strain.js:31`) ein. Da `loadResponse.js:76-78` genau `strain.high` in die
  FA-SIG-12-Kalibrierung (k1/tau1) einspeist, kann eine Leistungsspitze
  oberhalb des aktuell aktiven `pMax` — die strukturell genau kurz vor/während
  eines Breakthroughs auftritt — die M4-Kalibrierung unsichtbar verzerren.
  Gleiche Ursache in `kStrain` (`strain.js:27-28,59-61`): nur `denom !== 0`
  wird geprüft, nicht `denom > 0`.
  **Fix wäre klein** (sättigende Begrenzung statt freier Subtraktion), aber
  bisher nicht umgesetzt und nirgends dokumentiert.

### K-07 NP/TSS/PMC — `npTss.js`
**Priorität hoch (Testlücke), Aufwand M**
- **[Testlücke, hoch]** Der komplette PMC-Block —
  `computeEwmaSeries`/`computeCTLATL`/`rampRate`/`classifyFormZone` — sowie
  `variabilityIndex`/`efficiencyFactor`/`normalizedPowerForActivity` haben
  **keinen einzigen Test** (`npTss.test.js` importiert nur `normalizedPower,
  trainingStressScore, intensityFactor, hrTSS, paceTSS`).
  `classifyFormZone`s 5 Joe-Friel-TSB-Bänder (`npTss.js:149-155`) — eine
  nutzersichtbare Headline-Kennzahl (Form/TSB) — sind komplett unverifiziert.
- Uneinheitliche JSDoc innerhalb derselben Datei (einige Funktionen
  dokumentiert, andere nicht).

### K-08 Sportart-Schwellen — `thresholds.js`
- Solide direkte Testabdeckung (alle 4 Exports).
- `applySportSpecificTss` (`thresholds.js:128-174`): fehlt eine Aktivität in
  `preparedActivities`, bleibt ihr vorheriger `tss`-Wert unverändert statt
  konsequent auf die explizite `null`-Konvention zu normalisieren.

### K-11 Stoffwechselmodell — `metabolic.js`
- Am besten dokumentiertes Modul im Projekt (Tier A/B/C, Sentiero-Validierung).
- Der Watt-gerundete Cache in `activityMetabolicTimeCourse`
  (`metabolic.js:459-477`) hat keinen dedizierten Regressionstest gegen den
  ungecachten Pfad.

### K-13 Mean-Maximal-Power — `mmp.js`
**Priorität mittel, Aufwand M**
- **[Testlücke, mittel]** Keine der Kernfunktionen (`meanMaximalPower`,
  `meanMaximalPowerForActivity`, `aggregateMMP`, `detectMaximalEfforts`,
  `bestMeanOverWindows`) ist direkt getestet — liefert aber jeden Stützpunkt
  für CP-Fit/Breakthrough-Envelope/Schwellen-Schätzung.
- **[Performance, niedrig, schärfer als README]** `detectMaximalEfforts`
  (`mmp.js:107-132`) ist O(grid×curves×gridPerCurve) per linearem `.find()`.
  `core/README.md` nennt das nur für den Sportart-Schwellen-Pfad — es sitzt
  aber **auch** auf dem CP-Signatur-Pfad via
  `breakthrough.js#refitWindowEnvelope` (`signature.js:152`), bei jedem
  erkannten Breakthrough.

### K-15 2-Parameter-Konsistenzprüfung — `twoParamCheck.js`
- **Kein dediziertes Test-File.** Weder `checkTwoParamConsistency` noch
  `wPrimeBalance2ParamUnclamped` wird von einer Testdatei importiert — nur als
  unverifizierter Nebenkanal in `computeSignatureHistory`
  (`signature.js:146`) erreicht, dessen eigene Tests `twoParamContradictions`
  nie inspizieren.

### K-16 Settings/Typen — `settings.js`, `types.js`
- **[Schema-Drift, niedrig]** `ModelSettings`-Typedef (`types.js:44-100`)
  fehlen `ctlTau`/`atlTau`, die in `DEFAULT_SETTINGS` existieren
  (`settings.js:29-30`).
- **[Toter Code, niedrig]** `ctlTau`/`atlTau` werden **nirgends** in
  `core/src` gelesen — `computeCTLATL` nimmt stattdessen eigene
  `{ctlTau=42, atlTau=7}`-Defaults (`npTss.js:127`). Entweder toter Default
  oder unfertig verdrahtet.
- `Signature`-Typedef wird für zwei verschiedene Formen verwendet (Anzeige
  `{tp,hie,pp}` in kJ/W vs. intern `{cp,wPrimeJ,pMax}` in W/J) — nirgends
  unterschieden.

### K-17 Importer — `importers/*`
- `parseActivityFile` (`importers/index.js:20-29`, der `.gz`-Dispatcher) hat
  **keine** Testabdeckung, direkt oder indirekt.
- `tagValue` ist byte-identisch zwischen `gpx.js`/`tcx.js` dupliziert, baut
  zudem bei jedem Aufruf eine neue `RegExp` aus einem Template-String.
- `fit.js`: `RECORD_FIELDS`-Lookup-Tabelle ist **toter Code** (nie
  konsultiert, Feldnummern sind hartcodiert). Kein Bounds-Checking beim
  Byte-Offset-Walk — eine korrumpierte `.fit`-Datei wirft einen rohen,
  unbehandelten `RangeError` statt eines beschreibbaren Fehlers (im
  Gegensatz zu GPX/TCX, die degradieren statt zu werfen).

---

### A-01 Strava-Adapter — `strava.js`, `tokenManager.js`, `cryptoTokens.js`
**Priorität hoch (Datenintegrität), Aufwand M**
- **[Fehlerbehandlung, mittel, bestätigt]** Die Widerrufs-Erkennung
  (FA-USER-06) in `tokenManager.js:51` prüft **ausschließlich den
  HTTP-Statuscode 400**, nicht den tatsächlichen Strava-Fehlercode
  (`invalid_grant`). **Jeder** 400er beim Refresh-Call — nicht nur ein
  widerrufener Token — löst dieselbe destruktive Kaskade aus: `forgetTokens`
  + `deleteImportProgress` + **`deleteAllowlistEntry`**
  (`tokenManager.js:52-54`) — der Nutzer verliert seinen gesamten
  Allowlist-Eintrag, nicht nur die Strava-Verbindung. Tests decken nur den
  Gegenfall "5xx ≠ Widerruf" ab (`tokenManager.test.js:96-107`), keinen Test
  für "400 aus anderem Grund als invalid_grant".
- `revokeAccessToken` (`strava.js:45-51`) prüft `res.ok` nicht — ein
  fehlgeschlagener Strava-Widerruf bleibt unbemerkt, der Worker löscht lokal
  trotzdem alles und meldet Erfolg (stilles Privacy-Hygiene-Gap, keine
  Security-Lücke).
- **[Testlücke, niedrig]** `buildAuthorizeUrl` (`strava.js:11-20`) ist eine
  vollständig reine Funktion ohne jeden Test, obwohl die
  Dependency-Injection-Infrastruktur (`fetchImpl`) dafür bereits existiert und
  in `tokenManager.test.js` genutzt wird — die README-Pauschalbegründung
  "ungetestet wegen Netzwerkaufrufen" trifft auf diese eine Funktion nicht zu.
- AES-256-GCM-Verschlüsselung selbst: korrekt, auf beiden Schreibpfaden,
  getestet (`cryptoTokens.test.js:5-30`).

### A-02 Google-Drive-Adapter — `drive.js`
- Saubere einzelne Verantwortung, keine UI-Kopplung.
- `findFileId` (`drive.js:25`) escaped Anführungszeichen manuell per Regex
  statt einer Query-Bibliothek — unkritisch, da `name` nie aus Nutzereingabe
  stammt, aber fragiles Muster.
- 0 Testabdeckung (inhärent, reiner Netzwerk-Wrapper gegen echte Google-API).

---

### Q-01 Session/Allowlist-Auth (Worker) — `session.js`, `googleAuth.js`, `kvStore.js`, `http.js`, `index.js`
**Priorität mittel, Aufwand M**
- **Alle vier README-Sicherheitsbehauptungen bestätigt** (Client Secret nie
  geloggt/hartcodiert; AES-256-GCM auf jedem KV-Write; jede geschützte Route
  prüft ein frisches Google-ID-Token — nur Googles *Zertifikate* werden 5 Min
  gecacht, nicht die Verifikation selbst; OAuth-`state` einmalig mit
  10-Min-TTL, getestet).
- **[Rate-Limiting-Lücke, mittel, bestätigt]** Die Strava-Drosselung schützt
  nur die beiden Strava-Proxy-Routen. Die Admin-Routen `GET
  /api/admin/members`, `POST /api/admin/invite`, `DELETE
  /api/admin/members/:email` (`index.js:105,122,126`) haben **keine eigene
  Drosselung** — ein bereits zugelassener, aber böswilliger Admin könnte das
  KV-Lesebudget (100k/Tag) schneller verbrauchen als normal. Geringes Risiko
  bei max. 10 Allowlist-Mitgliedern (FA-USER-03), aber explizit ungeschützt.
  Zusätzlich: keine generelle IP-Flood-Protection im Worker-Code selbst
  (`POST /api/session` kann beliebig oft mit ungültigem Token angefragt
  werden) — Effekt auf das 10-ms-CPU-Budget ohne Load-Test nicht bezifferbar.
- **[Struktur, niedrig]** `index.js` ist kein reiner Dispatch-Table: Allowlist-
  Zustandsübergänge (`handleStravaCallback:179-187`,
  `handleDisconnectStrava:215-220`, `handleInvite:299-315`,
  `handleRemoveMember:318-332`) und `formatAthleteName`
  (`index.js:190-195`) liegen im Router statt in einem `membership.js`-nahen
  Modul.
- **[Fehlerbehandlung, niedrig]** Zwei inkonsistente Statuscodes (401 vs. 500)
  für dasselbe Symptom "Google-Zertifikate nicht erreichbar"
  (`googleAuth.js:69-77`, `session.js:13-24`). `tokenRequest`s Fehlerantwort
  (`strava.js:38`) reicht Stravas rohen Fehlertext ungefiltert an den Client
  durch.

### Q-02 Google Sign-In/Drive-OAuth — `auth.js`
- **README-Behauptungen bestätigt**: Google-ID-Token und Drive-Access-Token
  liegen ausschließlich im Modul-Scope (`auth.js:9-13`), nie in `localStorage`.
  Kein direkter `strava.com`-Aufruf vom Client (0 Treffer).
- Modul-globaler State statt gekapselter Instanz — für diese Single-User-SPA
  unkritisch, erschwert aber Testbarkeit (kein Reset zwischen Tests).
- `verifyDriveTokenAccount` (`auth.js:131-138`) sendet den Access-Token als
  Query-Parameter an Googles `tokeninfo`-Endpoint — von Google selbst so
  vorgesehen (keine Header-Variante verfügbar), daher niedrige Severity.
- 0 Testabdeckung (browserabhängig, inhärente Einschränkung).

### Q-03 Speicherschicht/Cache — `storage.js`, `idb.js`, `streamCodec.js`
**Priorität mittel, Aufwand M**
- `ensureCacheMatchesUser` (`storage.js:37-54`, Versions-Marker-Vergleich bei
  Kontowechsel) ist reine Logik, aber **ungetestet** — wäre mit einem
  einfachen `localStorage`-Mock testbar gewesen (ähnlich `syncEngine.js`).
- `writeFile` (`storage.js:64-68`) schreibt Drive-first, dann Cache; schlägt
  `idbPut` dauerhaft fehl (z. B. Quota voll), bleibt der Cache stumm veraltet
  — kein UI-Hinweis, nie beobachtet/getestet.
- `streamCodec.js`: gut getestet (6 Tests), `decodeBundle` wirft korrekt bei
  unbekannter `schemaVersion`.

### Q-06 Rechenkern-Anbindung — `calcWorker.js`, `compute.js`
- **Web-Worker-Isolation korrekt umgesetzt**: komplette Rechenlast läuft im
  Worker-Thread, nur aggregierte Objekte kommen zurück, keine rohen
  Sekunden-Streams (`calcWorker.js:51`).
- **[Testlücke, mittel, echt]** `compute.js`s eigene Orchestrierungslogik
  (`loadRawActivities`, `recomputeAll`, Worker-Promise-Handling) hat **keine**
  direkte Testabdeckung — `computePipeline.test.js` prüft nur die Kette
  `streamCodec.js → core/`, nicht `compute.js` selbst.
  `loadRawActivities` (`compute.js:52-78`) ist reine Transformationslogik
  ohne DOM-Abhängigkeit und wäre mit Storage-Mocks testbar gewesen.
- **[Fehlerbehandlung, niedrig-mittel]** `runInWorker` (`compute.js:44-50`)
  hat **keinen Timeout** für hängende Worker-Antworten — im Gegensatz zu
  `auth.js`/`dashboardView.js`, die genau dieses Muster explizit absichern.
  Ein nie antwortender Worker lässt die UI für immer in "Berechne..." stehen.
- `recomputeAll` lädt bei jedem Aufruf alle Rohaktivitäten neu — bewusste,
  dokumentierte M1-Entscheidung, bei mehrjähriger Historie spürbar (jeder
  Klick auf "Reaktivieren" löst einen vollen Reload+Neuberechnung aus).

---

## Globale, mehrere Module betreffende Befunde

- **Keine CSP** (`web/index.html`, 0 Treffer für `Content-Security-Policy`
  im ganzen Repo). Severity mittel — relevant in Kombination mit dem
  bestätigten XSS-Pfad in P-12.
- **innerHTML-Disziplin ist vorhanden, aber nicht erzwungen**: 110 Vorkommen
  in 16 Dateien, überwiegend statische Templates oder bereits korrekt per
  `textContent` behandelte Nutzerdaten — mit der einen bestätigten Ausnahme
  P-12. Kein Lint, der `innerHTML` mit Variablen verhindern würde.
- **Keine Barrierefreiheit über Einzelfälle hinaus**: nur 5 ARIA-Treffer in 2
  von 34 Dateien (`main.js`, `profileView.js`). Keine Dialog-Rollen in
  Modals, keine Tab-Rollen, keine Textalternativen für SVG-Charts außer
  Maus-Hover-Tooltips. WCAG 2.1 AA würde an mehreren Stellen scheitern.
- **Kein Tooling**: kein ESLint, kein Prettier, kein TypeScript, kein
  Bundler, kein CI (`.github/workflows/` existiert nicht) — konsistent über
  alle drei Teilprojekte, erkennbar bewusste "Zero-Build"-Philosophie, nicht
  versehentlich.
- **`web/vendor/core` ist tatsächlich committet** (24 Dateien, per
  `git ls-files` verifiziert) — kein `.gitignore`-Eintrag dafür, obwohl
  `web/README.md` es als reines Kopier-Build-Artefakt beschreibt. Siehe
  `docs/OFFENE-FRAGEN.md`.
- **`weightAtDate` dreifach dupliziert** (P-03, P-04, P-09) — die naheliegende
  Extraktion in eine gemeinsame Utility (analog zu `format.js`s bereits
  erfolgreicher Dedup-Geschichte) wurde bisher nicht gemacht.
- **`withTimeout` zweifach dupliziert** (`auth.js:195-197`,
  `dashboardView.js:96-98`) — und genau das fehlende Gegenstück in
  `compute.js#runInWorker` (Q-06) zeigt, dass diese Absicherung nicht
  konsequent überall angewendet wird, wo sie bräuchte.
- **Stillschweigende Clamps ohne Transparenz-Flag** sind ein wiederkehrendes
  Muster: `wPrimeJ`-Clamp bei 45000 wurde bereits mit einem sichtbaren Flag
  (`wPrimeClampedAtInitial`) gefixt — derselbe Fix fehlt für `cp` (K-01, Boden
  120 W) und für `strain.js`s `p > pMax`-Fall (K-06).
