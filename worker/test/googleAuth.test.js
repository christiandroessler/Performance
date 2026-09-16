import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { verifyGoogleIdToken, AuthError, _resetCertsCacheForTests } from '../src/googleAuth.js';

const AUDIENCE = 'test-client-id.apps.googleusercontent.com';
const KID = 'test-key-1';

let keyPair;
let publicJwk;

before(async () => {
  keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk.kid = KID;
});

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(payloadOverrides = {}, headerOverrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KID, ...headerOverrides };
  const payload = {
    iss: 'https://accounts.google.com',
    aud: AUDIENCE,
    email: 'nutzer@example.com',
    email_verified: true,
    sub: '1234567890',
    name: 'Test Nutzer',
    iat: now,
    exp: now + 3600,
    ...payloadOverrides,
  };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, signingInput);
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

function mockFetch() {
  return async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
}

test('gueltiges Token wird akzeptiert und liefert die erwarteten Claims', async () => {
  _resetCertsCacheForTests();
  const token = await signJwt();
  const result = await verifyGoogleIdToken(token, AUDIENCE, mockFetch());
  assert.equal(result.email, 'nutzer@example.com');
  assert.equal(result.emailVerified, true);
  assert.equal(result.sub, '1234567890');
});

test('abgelaufenes Token wird abgelehnt', async () => {
  _resetCertsCacheForTests();
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ iat: now - 7200, exp: now - 3600 });
  await assert.rejects(() => verifyGoogleIdToken(token, AUDIENCE, mockFetch()), AuthError);
});

test('falsche Audience (fremde Client-ID) wird abgelehnt', async () => {
  _resetCertsCacheForTests();
  const token = await signJwt({ aud: 'irgendeine-andere-client-id' });
  await assert.rejects(() => verifyGoogleIdToken(token, AUDIENCE, mockFetch()), AuthError);
});

test('falscher Issuer wird abgelehnt', async () => {
  _resetCertsCacheForTests();
  const token = await signJwt({ iss: 'https://boeser-issuer.example.com' });
  await assert.rejects(() => verifyGoogleIdToken(token, AUDIENCE, mockFetch()), AuthError);
});

test('manipulierte Payload (Signatur passt nicht mehr) wird abgelehnt', async () => {
  _resetCertsCacheForTests();
  const token = await signJwt();
  const [h, p, s] = token.split('.');
  const tamperedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ email: 'angreifer@example.com' })));
  const tampered = `${h}.${tamperedPayload}.${s}`;
  await assert.rejects(() => verifyGoogleIdToken(tampered, AUDIENCE, mockFetch()), AuthError);
});

test('unbekannter Algorithmus (nicht RS256) wird abgelehnt', async () => {
  _resetCertsCacheForTests();
  const token = await signJwt({}, { alg: 'none' });
  await assert.rejects(() => verifyGoogleIdToken(token, AUDIENCE, mockFetch()), AuthError);
});

test('Token ohne E-Mail-Feld wird abgelehnt', async () => {
  _resetCertsCacheForTests();
  const token = await signJwt({ email: undefined });
  await assert.rejects(() => verifyGoogleIdToken(token, AUDIENCE, mockFetch()), AuthError);
});
