// Verschluesselung der Strava-Refresh-Tokens im Ruhezustand (NFA-03: "Refresh-
// Tokens werden verschluesselt gespeichert"). AES-256-GCM ueber die Web-Crypto-
// API, die sowohl im Workers-Runtime als auch in Node (fuer Tests) verfuegbar
// ist. Der Schluessel ist ein Worker-Secret (TOKEN_ENCRYPTION_KEY, 32 Byte,
// base64), NIE im Code oder in wrangler.toml.

/** @param {string} base64Key - 32 zufaellige Bytes, base64-kodiert. */
export async function importEncryptionKey(base64Key) {
  const raw = base64ToBytes(base64Key);
  if (raw.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY muss 32 Byte lang sein, ist ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** @returns {Promise<string>} "ivBase64.ciphertextBase64" */
export async function encryptToken(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

/** @param {string} encoded - Ausgabe von encryptToken */
export async function decryptToken(key, encoded) {
  const [ivB64, ctB64] = encoded.split('.');
  if (!ivB64 || !ctB64) throw new Error('Ungueltiges verschluesseltes Token-Format');
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ctB64);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plaintext);
}

/** Erzeugt einen neuen zufaelligen 32-Byte-Schluessel, base64-kodiert (fuer die einmalige Einrichtung). */
export function generateEncryptionKeyBase64() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
