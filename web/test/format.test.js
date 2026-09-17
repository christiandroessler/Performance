import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatDistance } from '../src/format.js';

test('formatDuration: leer/0/null ergibt "-"', () => {
  assert.equal(formatDuration(0), '-');
  assert.equal(formatDuration(null), '-');
  assert.equal(formatDuration(undefined), '-');
});

test('formatDuration: unter einer Stunde nur Minuten', () => {
  assert.equal(formatDuration(45 * 60), '45min');
});

test('formatDuration: rundet auf ganze Minuten, VOR der Stunden/Minuten-Aufteilung - kein "Xh 60min"', () => {
  assert.equal(formatDuration(3599), '1h 0min'); // 59.98min gerundet -> 60min -> traegt in die Stunde ueber
  assert.equal(formatDuration(3600), '1h 0min');
  assert.equal(formatDuration(3601), '1h 0min');
});

test('formatDuration: normale Stunden+Minuten-Kombination', () => {
  assert.equal(formatDuration(5921), '1h 39min'); // 98.68min -> 99min -> 1h 39min
});

test('formatDistance: leer/0/null ergibt "-", sonst km mit einer Nachkommastelle', () => {
  assert.equal(formatDistance(0), '-');
  assert.equal(formatDistance(null), '-');
  assert.equal(formatDistance(50300), '50.3 km');
});
