import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAthleteName } from '../src/index.js';

test('formatAthleteName: Vor- und Nachname zusammengesetzt', () => {
  assert.equal(formatAthleteName({ id: 1, firstname: 'Max', lastname: 'Mustermann' }), 'Max Mustermann');
});

test('formatAthleteName: fehlender Nachname wird einfach weggelassen, kein "undefined"', () => {
  assert.equal(formatAthleteName({ id: 1, firstname: 'Max', lastname: '' }), 'Max');
});

test('formatAthleteName: ganz ohne Namen faellt auf die Athleten-ID zurueck', () => {
  assert.equal(formatAthleteName({ id: 42, firstname: '', lastname: '' }), 'Strava-Athlet #42');
});

test('formatAthleteName: kein Athlet-Objekt (z. B. bei einem Token-Refresh) ergibt null', () => {
  assert.equal(formatAthleteName(null), null);
  assert.equal(formatAthleteName(undefined), null);
});
