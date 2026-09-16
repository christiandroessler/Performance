import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeKv } from './fakeKv.js';
import { importEncryptionKey, generateEncryptionKeyBase64 } from '../src/cryptoTokens.js';
import { storeInitialTokens, getValidAccessToken } from '../src/tokenManager.js';
import { getTokenRecord } from '../src/kvStore.js';

const env = { STRAVA_CLIENT_ID: 'id', STRAVA_CLIENT_SECRET: 'secret' };

test('getValidAccessToken liefert den gecachten Access Token OHNE KV-Schreibzugriff, solange er noch gueltig ist', async () => {
  const kv = new FakeKv();
  const key = await importEncryptionKey(generateEncryptionKeyBase64());
  const now = Math.floor(Date.now() / 1000);
  await storeInitialTokens(kv, key, 'user@example.com', { access_token: 'access-1', refresh_token: 'refresh-1', expires_at: now + 3600 });

  let refreshCalled = false;
  const fetchImpl = async () => {
    refreshCalled = true;
    throw new Error('sollte nicht aufgerufen werden');
  };

  const token = await getValidAccessToken(env, kv, key, 'user@example.com', fetchImpl);
  assert.equal(token, 'access-1');
  assert.equal(refreshCalled, false);
});

test('getValidAccessToken erneuert den Token, wenn er abgelaufen ist, und speichert das (moeglicherweise rotierte) Refresh Token', async () => {
  const kv = new FakeKv();
  const key = await importEncryptionKey(generateEncryptionKeyBase64());
  const now = Math.floor(Date.now() / 1000);
  await storeInitialTokens(kv, key, 'user@example.com', { access_token: 'alt-access', refresh_token: 'alt-refresh', expires_at: now - 10 });

  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.grant_type, 'refresh_token');
    assert.equal(body.refresh_token, 'alt-refresh');
    return new Response(JSON.stringify({ access_token: 'neu-access', refresh_token: 'neu-refresh', expires_at: now + 21600 }), { status: 200 });
  };

  const token = await getValidAccessToken(env, kv, key, 'user@example.com', fetchImpl);
  assert.equal(token, 'neu-access');

  const record = await getTokenRecord(kv, 'user@example.com');
  assert.equal(record.accessToken, 'neu-access');
  assert.notEqual(record.refreshTokenEncrypted, undefined);
});

test('getValidAccessToken erneuert auch kurz vor Ablauf (Sicherheitspuffer)', async () => {
  const kv = new FakeKv();
  const key = await importEncryptionKey(generateEncryptionKeyBase64());
  const now = Math.floor(Date.now() / 1000);
  // laeuft in 30s ab -> unter dem 120s-Sicherheitspuffer -> muss erneuert werden
  await storeInitialTokens(kv, key, 'user@example.com', { access_token: 'bald-abgelaufen', refresh_token: 'r', expires_at: now + 30 });

  let refreshCalled = false;
  const fetchImpl = async () => {
    refreshCalled = true;
    return new Response(JSON.stringify({ access_token: 'frisch', refresh_token: 'r2', expires_at: now + 21600 }), { status: 200 });
  };

  const token = await getValidAccessToken(env, kv, key, 'user@example.com', fetchImpl);
  assert.equal(refreshCalled, true);
  assert.equal(token, 'frisch');
});

test('getValidAccessToken liefert null, wenn der Nutzer Strava nicht verbunden hat', async () => {
  const kv = new FakeKv();
  const key = await importEncryptionKey(generateEncryptionKeyBase64());
  const token = await getValidAccessToken(env, kv, key, 'nie-verbunden@example.com', async () => {
    throw new Error('sollte nicht aufgerufen werden');
  });
  assert.equal(token, null);
});
