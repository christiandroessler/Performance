// Verbindet Verschluesselung (cryptoTokens.js), KV-Ablage (kvStore.js) und
// Strava-Token-Refresh (strava.js): liefert fuer einen Nutzer einen gueltigen
// Strava-Access-Token, mit moeglichst wenigen KV-Schreibzugriffen (Kap. 3.4:
// 1.000 Schreibzugriffe/Tag-Limit) und ohne dass ein Access- oder Refresh-
// Token je den Browser erreicht (FA-AUTH-04).

import { getTokenRecord, putTokenRecord, deleteTokenRecord } from './kvStore.js';
import { encryptToken, decryptToken } from './cryptoTokens.js';
import { refreshAccessToken } from './strava.js';

const EXPIRY_SAFETY_BUFFER_S = 120;

export async function storeInitialTokens(kv, encryptionKey, email, tokens) {
  const record = {
    accessToken: tokens.access_token,
    expiresAt: tokens.expires_at,
    refreshTokenEncrypted: await encryptToken(encryptionKey, tokens.refresh_token),
  };
  await putTokenRecord(kv, email, record);
  return record;
}

/**
 * Liefert einen gueltigen Access Token fuer `email`. Erneuert ihn nur bei
 * Bedarf (Ablauf oder Sicherheitspuffer unterschritten) und schreibt dann
 * genau einmal den aktualisierten Datensatz zurueck (moeglicherweise
 * rotiertes Refresh Token, wie von Strava zurueckgegeben).
 * @returns {Promise<string|null>} null, wenn kein Datensatz existiert (Nutzer hat Strava nicht verbunden).
 */
export async function getValidAccessToken(env, kv, encryptionKey, email, fetchImpl = fetch) {
  const record = await getTokenRecord(kv, email);
  if (!record) return null;

  const now = Math.floor(Date.now() / 1000);
  if (record.expiresAt > now + EXPIRY_SAFETY_BUFFER_S) {
    return record.accessToken;
  }

  const oldRefreshToken = await decryptToken(encryptionKey, record.refreshTokenEncrypted);
  const refreshed = await refreshAccessToken(env, oldRefreshToken, fetchImpl);

  const updated = {
    accessToken: refreshed.access_token,
    expiresAt: refreshed.expires_at,
    refreshTokenEncrypted: await encryptToken(encryptionKey, refreshed.refresh_token),
  };
  await putTokenRecord(kv, email, updated);
  return updated.accessToken;
}

/** Fuer Widerruf (FA-USER-05/07): entschluesselt einmalig den Refresh Token, um darueber einen frischen Access Token fuer den Revoke-Aufruf zu erhalten. */
export async function getAccessTokenForRevocation(env, kv, encryptionKey, email, fetchImpl = fetch) {
  const token = await getValidAccessToken(env, kv, encryptionKey, email, fetchImpl);
  return token;
}

export async function forgetTokens(kv, email) {
  await deleteTokenRecord(kv, email);
}
