import test from 'node:test';
import assert from 'node:assert/strict';
import { downsample } from '../src/chartUtils.js';

test('downsample: kurze Arrays bleiben unveraendert', () => {
  const arr = [1, 2, 3];
  assert.deepEqual(downsample(arr, 500), [1, 2, 3]);
});

test('downsample: lange Arrays werden auf maxPoints Buckets mit Mittelwert reduziert', () => {
  const arr = Array.from({ length: 1000 }, (_, i) => i); // 0..999
  const out = downsample(arr, 100);
  assert.ok(out.length <= 100);
  assert.equal(out[0], 4.5); // Mittelwert der ersten 10 Werte (0..9)
  assert.ok(out[out.length - 1] > out[0]); // monoton steigend erhalten
});
