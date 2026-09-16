# Worker (M2 – Fundament)

Cloudflare Worker: Google-ID-Token-Pruefung + Allowlist, Strava-OAuth (Client
Secret bleibt hier), Proxy aller Strava-Aufrufe mit app-weiter Drosselung,
Nutzerverwaltung (Kap. 5.1). **Keine** Modellberechnung (10-ms-CPU-Limit),
**keine** Trainingsdaten - beides bleibt Aufgabe des Browsers/Rechenkerns
bzw. von Google Drive.

## Code-Struktur

| Datei | Zweck |
|---|---|
| `src/index.js` | Router, verdrahtet alle Endpunkte |
| `src/session.js` | Google-ID-Token pruefen + Allowlist-Check (inkl. Admin-Bootstrap) |
| `src/googleAuth.js` | Google-ID-Token-Verifikation (RS256, ohne google-auth-library) |
| `src/strava.js` | Strava-OAuth (Autorisierung, Token-Tausch, Refresh, Widerruf) + Proxy |
| `src/tokenManager.js` | Verschluesselte Token-Ablage + KV-sparsames Refresh-Caching |
| `src/cryptoTokens.js` | AES-256-GCM fuer Refresh-Tokens im Ruhezustand (NFA-03) |
| `src/rateLimiter.js` | App-weite Drosselungslogik anhand der Strava-Rate-Limit-Header |
| `src/kvStore.js` | KV-Wrapper: Allowlist, Token-Records, OAuth-State, Ratelimit, Import-Fortschritt |
| `src/http.js` | JSON-Antworten, CORS |

Alle Module ausser `strava.js`/`index.js` (die echte Netzwerkaufrufe machen)
sind mit `node --test` lokal getestet, siehe `test/` (41 Tests, ohne
Cloudflare-Account lauffaehig).

## Einmalige Einrichtung

### 1. Cloudflare KV-Namespace anlegen

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create ALLOWLIST_KV
```

Die ausgegebene `id` in `wrangler.toml` unter `[[kv_namespaces]]` eintragen
(ersetzt `REPLACE_ME_WRANGLER_KV_NAMESPACE_CREATE`).

### 2. Google-OAuth-Client anlegen (Sign-in + Drive-Zugriff)

Im [Google Cloud Console](https://console.cloud.google.com/):

1. Neues Projekt anlegen (z. B. "performance-app").
2. **APIs & Dienste → OAuth-Zustimmungsbildschirm**: Nutzertyp "Extern" (oder
   "Intern", falls ein Workspace vorhanden ist), App-Name/Support-E-Mail
   ausfuellen. Scopes: `openid`, `email`, `profile` (nicht sensibel) und
   `.../auth/drive.appdata` (nicht sensibel, siehe Kap. 3.3 - keine
   Testnutzerliste, kein 7-Tage-Ablauf noetig). **Veroeffentlichungsstatus
   auf "In Produktion" stellen** (sonst laufen Autorisierungen nach 7 Tagen ab).
3. **APIs & Dienste → Bibliothek**: "Google Drive API" aktivieren.
4. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**,
   Typ "Webanwendung". Autorisierte JavaScript-Quellen: die Pages-URL (z. B.
   `https://performance-app.pages.dev`) und fuer lokale Tests
   `http://127.0.0.1:8788`. Keine Redirect-URI noetig (Sign-In + Drive-Token
   laufen beide client-seitig ueber Google Identity Services).
5. Die erzeugte **Client-ID** (kein Secret!) in `wrangler.toml` unter
   `GOOGLE_CLIENT_ID` eintragen und im Frontend an derselben Stelle verwenden
   (der Worker gibt sie oeffentlich ueber `GET /api/config` aus).

### 3. Strava-App

Die bestehende App aus `strava-dashboard/.env` (`STRAVA_CLIENT_ID`,
`STRAVA_CLIENT_SECRET`) wird weiterverwendet. Unter
[strava.com/settings/api](https://www.strava.com/settings/api) die
"Autorisierungs-Rueckruf-Domain" auf die Worker-Domain setzen (z. B.
`performance-app-worker.<konto>.workers.dev`), da der Worker (nicht das
Frontend) den OAuth-Callback empfaengt (`/auth/strava/callback`).

`STRAVA_CLIENT_ID` (kein Secret) in `wrangler.toml` eintragen.

### 4. Secrets setzen (NIE in wrangler.toml)

```bash
npx wrangler secret put STRAVA_CLIENT_SECRET
# Wert aus strava-dashboard/.env oder strava.com/settings/api

npx wrangler secret put TOKEN_ENCRYPTION_KEY
# 32 zufaellige Bytes, base64 - erzeugen z.B. mit:
# node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

### 5. Weitere `wrangler.toml`-Werte

- `FRONTEND_ORIGIN`: die Cloudflare-Pages-URL des Frontends (fuer CORS und
  den Redirect nach dem Strava-Callback).
- `ADMIN_EMAIL` (als weiterer `[vars]`-Eintrag ergaenzen): die Google-Konto-
  E-Mail des Auftraggebers - bootstrapt sich beim ersten Login selbst als
  Admin in die Allowlist (Kap. 4 M2: "Allowlist mit Admin als erstem Eintrag").

### 6. Lokal testen

```bash
npx wrangler dev --local --var FRONTEND_ORIGIN:http://127.0.0.1:8788
```

(In der lokalen KV-Simulation gibt es noch keine echten Secrets - fuer einen
echten End-zu-Ende-Test mit Google/Strava muss vorher Schritt 4 auf dem
echten Account durchgefuehrt und `npx wrangler dev` **ohne** `--local`
gestartet werden, damit die echten Secrets/KV verwendet werden.)

### 7. Deployment

```bash
npx wrangler deploy
```

Fuer Auto-Deploy aus GitHub (Kap. 4 M2) den Worker stattdessen ueber
[Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
mit dem GitHub-Repo verbinden (Root-Verzeichnis `performance-app/worker`).

## Sicherheitsmodell (NFA-03)

- Das Strava-Client-Secret existiert nur als Worker-Secret, verlaesst den
  Worker nie.
- Refresh-Tokens liegen AES-256-GCM-verschluesselt in KV, der Schluessel ist
  ein separates Worker-Secret.
- Jede geschuetzte Route verifiziert bei jeder Anfrage ein frisches
  Google-ID-Token (`Authorization: Bearer …`) gegen Googles oeffentliche
  Zertifikate - keine eigenen Sessions/Cookies, kein zusaetzliches
  Session-Secret noetig.
- Strava-Tokens werden nur im `Authorization`-Header gesendet, nie in der URL
  (Kap. 3.2).
- OAuth-`state` ist einmalig verwendbar (in KV mit 10-Minuten-TTL, wird beim
  Callback geloescht) - CSRF-Schutz fuer den Strava-Callback.
