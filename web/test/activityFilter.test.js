import test from 'node:test';
import assert from 'node:assert/strict';
import { filterActivities } from '../src/activityFilter.js';

function mk(id, date, type, name) {
  return { id, date, type, name };
}

const activities = [
  mk('1', '2026-06-01', 'Ride', 'Morgenausfahrt'),
  mk('2', '2026-06-05', 'Run', 'Intervalle'),
  mk('3', '2026-07-01', 'Ride', 'Bergetappe'),
  mk('4', '2026-07-10', 'Swim', 'Techniktraining'),
];

test('filterActivities: ohne Kriterien kommt alles zurueck', () => {
  assert.equal(filterActivities(activities).length, 4);
});

test('filterActivities: Sportart filtert exakt', () => {
  const res = filterActivities(activities, { type: 'Ride' });
  assert.deepEqual(res.map((a) => a.id), ['1', '3']);
});

test('filterActivities: Suche findet Teiltreffer im Namen, unabhaengig von Gross-/Kleinschreibung', () => {
  assert.deepEqual(filterActivities(activities, { query: 'berg' }).map((a) => a.id), ['3']);
  assert.deepEqual(filterActivities(activities, { query: 'BERG' }).map((a) => a.id), ['3']);
  assert.deepEqual(filterActivities(activities, { query: 'nichts vorhanden' }).map((a) => a.id), []);
});

test('filterActivities: Zeitraum (von/bis) grenzt auf das Datum ein, Grenzen inklusive', () => {
  const res = filterActivities(activities, { fromDate: '2026-06-05', toDate: '2026-07-01' });
  assert.deepEqual(res.map((a) => a.id), ['2', '3']);
});

test('filterActivities: alle Kriterien kombiniert', () => {
  const res = filterActivities(activities, { type: 'Ride', query: 'morgen', fromDate: '2026-01-01', toDate: '2026-12-31' });
  assert.deepEqual(res.map((a) => a.id), ['1']);
});
