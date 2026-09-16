// Abnahmekriterium M1: "Ergebnisse sind deterministisch (zweimal gleiche
// Eingabe ergibt identische Ausgabe)."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareActivity } from '../src/activity.js';
import { computeSignatureHistory } from '../src/signature.js';
import { mergeSettings } from '../src/settings.js';

function buildActivityPoints() {
  const points = [];
  for (let t = 0; t < 5; t++) points.push({ t, watts: 1000, deviceWatts: true });
  for (let t = 5; t < 300; t++) points.push({ t, watts: 210 + 20 * Math.sin(t / 17), deviceWatts: true });
  for (let t = 300; t < 420; t++) points.push({ t, watts: 400, deviceWatts: true });
  for (let t = 420; t < 1800; t++) points.push({ t, watts: 200 + 15 * Math.sin(t / 23), deviceWatts: true });
  return points;
}

function serializable(x) {
  return JSON.parse(
    JSON.stringify(x, (key, value) => {
      if (value instanceof Set) return [...value].sort();
      if (ArrayBuffer.isView(value)) return Array.from(value);
      return value;
    })
  );
}

test('computeSignatureHistory ist deterministisch bei gleicher Eingabe', () => {
  const settings = mergeSettings();
  const raw = [
    { id: 'a1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildActivityPoints() },
    { id: 'a2', date: '2026-01-15', startTime: '2026-01-15T08:00:00Z', points: buildActivityPoints() },
    { id: 'a3', date: '2026-02-01', startTime: '2026-02-01T08:00:00Z', points: buildActivityPoints() },
    { id: 'a4', date: '2026-04-10', startTime: '2026-04-10T08:00:00Z', points: buildActivityPoints() },
  ];
  const prepared = raw.map((r) => prepareActivity(r, settings));

  const run1 = computeSignatureHistory(prepared, { settings });
  const run2 = computeSignatureHistory(prepared, { settings });

  assert.deepEqual(serializable(run1), serializable(run2));
});

test('computeSignatureHistory wirft nicht und liefert eine Startsignatur bei ausreichenden Daten', () => {
  const settings = mergeSettings();
  const raw = [{ id: 'a1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildActivityPoints() }];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const result = computeSignatureHistory(prepared, { settings });
  assert.ok(result.initial.signature, JSON.stringify(result.initial));
  assert.ok(result.history.length >= 1);
});
