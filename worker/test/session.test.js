import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { FakeKv } from './fakeKv.js';
import { requireSession, requireAdmin } from '../src/session.js';
import { _resetCertsCacheForTests } from '../src/googleAuth.js';
import { HttpError } from '../src/http.js';
import { getAllowlistEntry, putAllowlistEntry } from '../src/kvStore.js';

const AUDIENCE = 'test-client-id.apps.googleusercontent.com';
const KID = 'test-key-1';
let keyPair, publicJwk;
let originalFetch;

before(async () => {
  keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk.kid = KID;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
});

after(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  _resetCertsCacheForTests();
});

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(email) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const payload = { iss: 'https://accounts.google.com', aud: AUDIENCE, email, email_verified: true, sub: 'sub-' + email, iat: now, exp: now + 3600 };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, signingInput);
  return `${headerB64}.${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function makeRequest(idToken) {
  return new Request('https://worker.example.com/api/session', {
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
  });
}

test('Admin-Bootstrap: ADMIN_EMAIL erstellt sich selbst beim ersten Login als Admin', async () => {
  const kv = new FakeKv();
  const env = { GOOGLE_CLIENT_ID: AUDIENCE, ADMIN_EMAIL: 'admin@example.com', ALLOWLIST_KV: kv };
  const token = await signJwt('admin@example.com');

  const session = await requireSession(makeRequest(token), env);
  assert.equal(session.role, 'admin');
  assert.equal(session.email, 'admin@example.com');

  const stored = await getAllowlistEntry(kv, 'admin@example.com');
  assert.equal(stored.role, 'admin');
});

test('Admin-Bootstrap ist idempotent (zweiter Login ueberschreibt nicht ueberraschend)', async () => {
  const kv = new FakeKv();
  const env = { GOOGLE_CLIENT_ID: AUDIENCE, ADMIN_EMAIL: 'admin@example.com', ALLOWLIST_KV: kv };
  const token = await signJwt('admin@example.com');

  await requireSession(makeRequest(token), env);
  const session2 = await requireSession(makeRequest(token), env);
  assert.equal(session2.role, 'admin');

  const entries = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: 'allowlist:', cursor });
    entries.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  assert.equal(entries.length, 1, 'nur ein Allowlist-Eintrag fuer den Admin');
});

test('Nicht auf der Allowlist stehende E-Mail wird mit 403 abgelehnt (neutrale Ablehnung, FA-AUTH-01)', async () => {
  const kv = new FakeKv();
  const env = { GOOGLE_CLIENT_ID: AUDIENCE, ADMIN_EMAIL: 'admin@example.com', ALLOWLIST_KV: kv };
  const token = await signJwt('unbekannt@example.com');

  await assert.rejects(
    () => requireSession(makeRequest(token), env),
    (err) => err instanceof HttpError && err.status === 403
  );
});

test('Eingeladenes Mitglied (bereits in Allowlist) wird akzeptiert', async () => {
  const kv = new FakeKv();
  await putAllowlistEntry(kv, { email: 'mitglied@example.com', role: 'member', status: 'invited', invitedAt: 'x', connectedAt: null });
  const env = { GOOGLE_CLIENT_ID: AUDIENCE, ADMIN_EMAIL: 'admin@example.com', ALLOWLIST_KV: kv };
  const token = await signJwt('mitglied@example.com');

  const session = await requireSession(makeRequest(token), env);
  assert.equal(session.role, 'member');
});

test('Fehlender Authorization-Header liefert 401', async () => {
  const kv = new FakeKv();
  const env = { GOOGLE_CLIENT_ID: AUDIENCE, ADMIN_EMAIL: 'admin@example.com', ALLOWLIST_KV: kv };
  await assert.rejects(
    () => requireSession(makeRequest(null), env),
    (err) => err instanceof HttpError && err.status === 401
  );
});

test('requireAdmin wirft 403 fuer ein normales Mitglied', () => {
  assert.throws(
    () => requireAdmin({ role: 'member' }),
    (err) => err instanceof HttpError && err.status === 403
  );
});

test('requireAdmin laesst einen Admin durch', () => {
  requireAdmin({ role: 'admin' }); // wirft nicht
});
