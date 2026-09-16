// Verifiziert ein von Google Identity Services ausgestelltes ID-Token (JWT,
// RS256) gegen Googles oeffentliche Zertifikate - ohne die (grosse)
// google-auth-library, damit der Worker leichtgewichtig bleibt. Jede
// geschuetzte Worker-Route ruft dies auf (Allowlist-Pruefung, FA-AUTH-01).
//
// Bewusst zustandslos: keine eigenen Sessions/Cookies. Das Frontend schickt
// bei jeder Anfrage das aktuelle Google-ID-Token im Authorization-Header
// (Bearer), das ueber Google Identity Services im Browser automatisch
// erneuert wird. Das haelt den Worker einfach (kein Session-Secret noetig)
// und passt zu NFA-03 ("minimale Scopes", keine zusaetzlichen Tokens).

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CERTS_CACHE_MS = 5 * 60 * 1000;

let certsCache = null;
let certsCacheExpiry = 0;

/**
 * @param {string} idToken
 * @param {string} expectedAudience - die eigene Google-OAuth-Client-ID
 * @returns {Promise<{ email: string, emailVerified: boolean, sub: string, name: string|null }>}
 */
export async function verifyGoogleIdToken(idToken, expectedAudience, fetchImpl = fetch) {
  if (!idToken || typeof idToken !== 'string') throw new AuthError('Kein Token uebergeben');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new AuthError('Ungueltiges Token-Format');
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    throw new AuthError('Token konnte nicht dekodiert werden');
  }

  if (header.alg !== 'RS256') throw new AuthError(`Unerwarteter Algorithmus: ${header.alg}`);

  const certs = await fetchGoogleCerts(fetchImpl);
  const jwk = certs.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new AuthError('Kein passender Google-Schluessel gefunden (kid unbekannt)');

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecodeToBytes(sigB64);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
  if (!valid) throw new AuthError('Signatur ungueltig');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new AuthError('Token abgelaufen');
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) throw new AuthError('Token noch nicht gueltig (iat in der Zukunft)');
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new AuthError(`Unerwarteter Issuer: ${payload.iss}`);
  }
  if (payload.aud !== expectedAudience) throw new AuthError('Unerwartete Audience (falsche Client-ID)');
  if (!payload.email) throw new AuthError('Token enthaelt keine E-Mail-Adresse');

  return {
    email: payload.email,
    emailVerified: payload.email_verified === true,
    sub: payload.sub,
    name: payload.name || null,
  };
}

export class AuthError extends Error {}

async function fetchGoogleCerts(fetchImpl) {
  const now = Date.now();
  if (certsCache && now < certsCacheExpiry) return certsCache;
  const res = await fetchImpl(GOOGLE_CERTS_URL);
  if (!res.ok) throw new AuthError(`Google-Zertifikate konnten nicht geladen werden: ${res.status}`);
  certsCache = await res.json();
  certsCacheExpiry = now + CERTS_CACHE_MS;
  return certsCache;
}

/** Nur fuer Tests: Cache zuruecksetzen, damit fetchImpl-Mocks greifen. */
export function _resetCertsCacheForTests() {
  certsCache = null;
  certsCacheExpiry = 0;
}

function base64UrlDecodeToString(str) {
  return new TextDecoder().decode(base64UrlDecodeToBytes(str));
}

function base64UrlDecodeToBytes(str) {
  const padLen = (4 - (str.length % 4)) % 4;
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
