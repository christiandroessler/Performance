import test from 'node:test';
import assert from 'node:assert/strict';
import { weightAtDate } from '../src/weight.js';

const settings = {
  weightKg: 74,
  // absichtlich unsortiert
  weightHistory: [
    { date: '2026-06-01', kg: 72 },
    { date: '2026-01-01', kg: 78 },
    { date: '2026-09-01', kg: 74 },
  ],
};

test('letzter Eintrag <= Datum gewinnt, unabhaengig von der Reihenfolge', () => {
  assert.equal(weightAtDate(settings, '2026-03-15'), 78);
  assert.equal(weightAtDate(settings, '2026-06-01'), 72); // Stichtag zaehlt mit
  assert.equal(weightAtDate(settings, '2026-12-31'), 74);
});

test('vor dem ersten Eintrag: aktuelles Gewicht als Startwert', () => {
  assert.equal(weightAtDate(settings, '2025-01-01'), 74);
});

test('ohne Verlauf bzw. ohne Einstellungen', () => {
  assert.equal(weightAtDate({ weightKg: 70 }, '2026-01-01'), 70);
  assert.equal(weightAtDate({ weightKg: null, weightHistory: [] }, '2026-01-01'), null);
  assert.equal(weightAtDate(null, '2026-01-01'), null);
  assert.equal(weightAtDate(undefined, '2026-01-01'), null);
});

test('mutiert den Verlauf nicht', () => {
  const copy = JSON.parse(JSON.stringify(settings));
  weightAtDate(settings, '2026-03-15');
  assert.deepEqual(settings, copy);
});
