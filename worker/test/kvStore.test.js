import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeKv } from './fakeKv.js';
import {
  getAllowlistEntry,
  putAllowlistEntry,
  deleteAllowlistEntry,
  listAllowlist,
  countAllowlist,
  getTokenRecord,
  putTokenRecord,
  deleteTokenRecord,
  putOAuthState,
  consumeOAuthState,
  getImportProgress,
  putImportProgress,
  getRateLimitState,
  putRateLimitState,
} from '../src/kvStore.js';

test('Allowlist: put/get/delete, E-Mail case-insensitiv', async () => {
  const kv = new FakeKv();
  await putAllowlistEntry(kv, { email: 'Nutzer@Example.com', role: 'member', status: 'invited', invitedAt: 'x', connectedAt: null });

  const entry = await getAllowlistEntry(kv, 'nutzer@example.com');
  assert.equal(entry.email, 'Nutzer@Example.com');
  assert.equal(entry.role, 'member');

  await deleteAllowlistEntry(kv, 'NUTZER@EXAMPLE.COM');
  assert.equal(await getAllowlistEntry(kv, 'nutzer@example.com'), null);
});

test('listAllowlist/countAllowlist paginieren korrekt ueber mehrere Seiten (FakeKv-Seitengroesse=2)', async () => {
  const kv = new FakeKv();
  const emails = ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com'];
  for (const email of emails) {
    await putAllowlistEntry(kv, { email, role: 'member', status: 'invited', invitedAt: 'x', connectedAt: null });
  }
  assert.equal(await countAllowlist(kv), 5);
  const all = await listAllowlist(kv);
  assert.equal(all.length, 5);
  assert.deepEqual(
    all.map((e) => e.email).sort(),
    emails.sort()
  );
});

test('TokenRecord: put/get/delete', async () => {
  const kv = new FakeKv();
  await putTokenRecord(kv, 'user@example.com', { accessToken: 'a', expiresAt: 123, refreshTokenEncrypted: 'iv.ct' });
  const rec = await getTokenRecord(kv, 'user@example.com');
  assert.equal(rec.accessToken, 'a');
  await deleteTokenRecord(kv, 'user@example.com');
  assert.equal(await getTokenRecord(kv, 'user@example.com'), null);
});

test('OAuth-State: kann genau einmal konsumiert werden (CSRF-Schutz)', async () => {
  const kv = new FakeKv();
  await putOAuthState(kv, 'state-123', 'User@Example.com');

  const email = await consumeOAuthState(kv, 'state-123');
  assert.equal(email, 'user@example.com');

  const secondTry = await consumeOAuthState(kv, 'state-123');
  assert.equal(secondTry, null, 'state darf kein zweites Mal funktionieren');
});

test('OAuth-State: unbekannter state liefert null', async () => {
  const kv = new FakeKv();
  assert.equal(await consumeOAuthState(kv, 'nie-gesetzt'), null);
});

test('Import-Progress: put/get', async () => {
  const kv = new FakeKv();
  assert.equal(await getImportProgress(kv, 'user@example.com'), null);
  await putImportProgress(kv, 'user@example.com', { doneUntil: '2020-01-01', totalActivities: 42 });
  const progress = await getImportProgress(kv, 'user@example.com');
  assert.equal(progress.totalActivities, 42);
});

test('Ratelimit-State: put/get', async () => {
  const kv = new FakeKv();
  assert.equal(await getRateLimitState(kv), null);
  await putRateLimitState(kv, { limit15min: 200, limitDaily: 2000, usage15min: 1, usageDaily: 1, updatedAt: 1 });
  const state = await getRateLimitState(kv);
  assert.equal(state.limitDaily, 2000);
});
