import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importEncryptionKey, encryptToken, decryptToken, generateEncryptionKeyBase64 } from '../src/cryptoTokens.js';

test('Roundtrip: verschluesseln und wieder entschluesseln liefert den Originaltext', async () => {
  const keyB64 = generateEncryptionKeyBase64();
  const key = await importEncryptionKey(keyB64);
  const plaintext = 'ein-strava-refresh-token-12345';

  const encrypted = await encryptToken(key, plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.ok(encrypted.includes('.'), 'Format ist "iv.ciphertext"');

  const decrypted = await decryptToken(key, encrypted);
  assert.equal(decrypted, plaintext);
});

test('Zwei Verschluesselungen desselben Textes liefern unterschiedliche Ciphertexte (zufaelliger IV)', async () => {
  const key = await importEncryptionKey(generateEncryptionKeyBase64());
  const a = await encryptToken(key, 'gleicher-text');
  const b = await encryptToken(key, 'gleicher-text');
  assert.notEqual(a, b);
});

test('Entschluesseln mit falschem Schluessel schlaegt fehl', async () => {
  const key1 = await importEncryptionKey(generateEncryptionKeyBase64());
  const key2 = await importEncryptionKey(generateEncryptionKeyBase64());
  const encrypted = await encryptToken(key1, 'geheim');
  await assert.rejects(() => decryptToken(key2, encrypted));
});

test('generateEncryptionKeyBase64 erzeugt einen gueltigen 32-Byte-Schluessel', async () => {
  const keyB64 = generateEncryptionKeyBase64();
  const key = await importEncryptionKey(keyB64); // wirft, wenn nicht 32 Byte
  assert.ok(key);
});

test('importEncryptionKey lehnt einen zu kurzen Schluessel ab', async () => {
  const shortKeyB64 = btoa('zu-kurz');
  await assert.rejects(() => importEncryptionKey(shortKeyB64), /32 Byte/);
});
