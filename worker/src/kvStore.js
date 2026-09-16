// Duenner Wrapper um Cloudflare KV fuer Allowlist, Rollen, Verbindungsstatus,
// verschluesselte Strava-Refresh-Tokens und die Ratelimit-Buchfuehrung
// (Kap. 5.1: "KV/D1 | Allowlist, Rollen, Verbindungsstatus, verschluesselte
// Strava-Refresh-Tokens, Import-Warteschlange | Nicht zustaendig fuer:
// Streams, Kennzahlen"). Es werden bewusst NIE Trainingsdaten hier abgelegt.

const ALLOWLIST_PREFIX = 'allowlist:';
const TOKENS_PREFIX = 'tokens:';
const OAUTH_STATE_PREFIX = 'oauthstate:';
const IMPORT_PROGRESS_PREFIX = 'importprogress:';
const RATELIMIT_KEY = 'ratelimit:strava';

const OAUTH_STATE_TTL_SECONDS = 10 * 60; // State ist nur fuer den laufenden OAuth-Redirect gueltig

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/** @typedef {{ email: string, role: 'admin'|'member', status: 'invited'|'google_connected'|'strava_connected', invitedAt: string, connectedAt: string|null }} AllowlistEntry */

export async function getAllowlistEntry(kv, email) {
  const raw = await kv.get(ALLOWLIST_PREFIX + normalizeEmail(email));
  return raw ? JSON.parse(raw) : null;
}

export async function putAllowlistEntry(kv, entry) {
  await kv.put(ALLOWLIST_PREFIX + normalizeEmail(entry.email), JSON.stringify(entry));
}

export async function deleteAllowlistEntry(kv, email) {
  await kv.delete(ALLOWLIST_PREFIX + normalizeEmail(email));
}

/** FA-USER-04: Mitgliederliste fuer die Admin-Ansicht - enthaelt bewusst keine Trainingsdaten/Kennzahlen. */
export async function listAllowlist(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: ALLOWLIST_PREFIX, cursor });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (raw) out.push(JSON.parse(raw));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

/** FA-USER-03: Obergrenze 10 Personen inklusive Admin. */
export async function countAllowlist(kv) {
  let count = 0;
  let cursor;
  do {
    const page = await kv.list({ prefix: ALLOWLIST_PREFIX, cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

/**
 * Token-Datensatz je Nutzer, EIN KV-Eintrag statt getrennter Schluessel, damit
 * ein Strava-Aufruf im Normalfall (Access Token noch gueltig) OHNE KV-Schreib-
 * zugriff auskommt - wichtig wegen des Tageslimits von 1.000 Schreibzugriffen
 * (Kap. 3.4). Nur bei einem tatsaechlichen Token-Refresh wird neu geschrieben.
 * @typedef {{ accessToken: string, expiresAt: number, refreshTokenEncrypted: string }} TokenRecord
 */

export async function getTokenRecord(kv, email) {
  const raw = await kv.get(TOKENS_PREFIX + normalizeEmail(email));
  return raw ? JSON.parse(raw) : null;
}

export async function putTokenRecord(kv, email, record) {
  await kv.put(TOKENS_PREFIX + normalizeEmail(email), JSON.stringify(record));
}

export async function deleteTokenRecord(kv, email) {
  await kv.delete(TOKENS_PREFIX + normalizeEmail(email));
}

/** Bindet einen OAuth-`state`-Wert kurzlebig an die Nutzer-E-Mail (CSRF-Schutz, NFA-03). */
export async function putOAuthState(kv, state, email) {
  await kv.put(OAUTH_STATE_PREFIX + state, normalizeEmail(email), { expirationTtl: OAUTH_STATE_TTL_SECONDS });
}

/** Liest den state EINMALIG aus (loescht ihn danach), damit er nicht wiederverwendet werden kann. */
export async function consumeOAuthState(kv, state) {
  const key = OAUTH_STATE_PREFIX + state;
  const email = await kv.get(key);
  if (email) await kv.delete(key);
  return email;
}

export async function getImportProgress(kv, email) {
  const raw = await kv.get(IMPORT_PROGRESS_PREFIX + normalizeEmail(email));
  return raw ? JSON.parse(raw) : null;
}

export async function putImportProgress(kv, email, progress) {
  await kv.put(IMPORT_PROGRESS_PREFIX + normalizeEmail(email), JSON.stringify(progress));
}

export async function deleteImportProgress(kv, email) {
  await kv.delete(IMPORT_PROGRESS_PREFIX + normalizeEmail(email));
}

export async function getRateLimitState(kv) {
  const raw = await kv.get(RATELIMIT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function putRateLimitState(kv, state) {
  await kv.put(RATELIMIT_KEY, JSON.stringify(state));
}
