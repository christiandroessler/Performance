// M3-Abnahmekriterien (Lastenheft Kap. 10):
// - "Die Schwelle zum Aktivitaetsdatum wird nachweillich verwendet (Testfall
//   mit Breakthrough mitten im Zeitraum)."
// - "Das Verwerfen eines Breakthroughs loest die korrekte chronologische
//   Neuberechnung aus, das Reaktivieren stellt den vorherigen Zustand wieder
//   her." (FA-SIG-07)
//
// computeSignatureHistory() selbst ist bereits ueber breakthrough.test.js
// (Refit-Mechanik) und determinism.test.js (Determinismus) abgedeckt, aber
// bisher fehlte ein End-zu-Ende-Testfall genau fuer diese beiden
// Abnahmekriterien - siehe core/README.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareActivity } from '../src/activity.js';
import { computeSignatureHistory } from '../src/signature.js';
import { mergeSettings } from '../src/settings.js';

// Baseline-Aktivitaeten innerhalb der ersten 90 Tage (FA-SIG-03-Startfenster) -
// identisch zu determinism.test.js#buildActivityPoints, ergibt eine Startsignatur
// mit CP=257 W, Pmax=1212 W (leicht ueber dem 1000-W-5s-Spitzenwert je Aktivitaet).
function buildBaselinePoints() {
  const points = [];
  for (let t = 0; t < 5; t++) points.push({ t, watts: 1000, deviceWatts: true });
  for (let t = 5; t < 300; t++) points.push({ t, watts: 210 + 20 * Math.sin(t / 17), deviceWatts: true });
  for (let t = 300; t < 420; t++) points.push({ t, watts: 400, deviceWatts: true });
  for (let t = 420; t < 1800; t++) points.push({ t, watts: 200 + 15 * Math.sin(t / 23), deviceWatts: true });
  return points;
}

// Deutlich ausserhalb des Startfensters (2026-06-01, > 90 Tage nach 2026-01-01):
// ein 6-s-Spitzenwert weit ueber der bis dahin gueltigen MPA (deutlich > Pmax=1212W,
// aber < outlierMaxWatts=2500W, damit er nicht als Ausreisser gefiltert wird).
function buildBreakthroughPoints() {
  const points = [];
  for (let t = 0; t < 6; t++) points.push({ t, watts: 2200, deviceWatts: true });
  for (let t = 6; t < 600; t++) points.push({ t, watts: 150, deviceWatts: true });
  return points;
}

function buildAfterPoints() {
  const points = [];
  for (let t = 0; t < 600; t++) points.push({ t, watts: 180 + 10 * Math.sin(t / 19), deviceWatts: true });
  return points;
}

function buildHistory(settings) {
  const raw = [
    { id: 'base1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base2', date: '2026-01-15', startTime: '2026-01-15T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base3', date: '2026-02-01', startTime: '2026-02-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'bt', date: '2026-06-01', startTime: '2026-06-01T08:00:00Z', points: buildBreakthroughPoints() },
    { id: 'after1', date: '2026-06-10', startTime: '2026-06-10T08:00:00Z', points: buildAfterPoints() },
  ];
  return raw.map((r) => prepareActivity(r, settings));
}

test('Schwelle zum Aktivitaetsdatum: ein Breakthrough mitten im Zeitraum aendert die Schwelle nur fuer NACHFOLGENDE Aktivitaeten', () => {
  const settings = mergeSettings();
  const prepared = buildHistory(settings);
  const result = computeSignatureHistory(prepared, { settings });

  assert.equal(result.breakthroughs.length, 1, 'genau ein Breakthrough erwartet ("bt")');
  assert.equal(result.breakthroughs[0].id, 'bt');
  assert.equal(result.breakthroughs[0].discarded, false);

  const byId = new Map(result.activityResults.map((r) => [r.id, r]));

  // Die Breakthrough-Aktivitaet SELBST wird noch mit der ALTEN Signatur bewertet (Kap. 7.5:
  // der Refit gilt erst AB diesem Datum fuer die naechsten Aktivitaeten, siehe signature.js).
  const btResult = byId.get('bt');
  assert.equal(btResult.signature.cp, result.initial.signature.cp);
  assert.equal(btResult.signature.pMax, result.initial.signature.pMax);

  // Eine Aktivitaet NACH dem Breakthrough nutzt die NEUE (refittete) Schwelle.
  const afterResult = byId.get('after1');
  assert.notEqual(afterResult.signature.cp, result.initial.signature.cp);
  assert.notEqual(afterResult.signature.pMax, result.initial.signature.pMax);
  assert.equal(afterResult.signature.cp, result.breakthroughs[0].proposedSignature.cp);
  assert.equal(afterResult.signature.pMax, result.breakthroughs[0].proposedSignature.pMax);

  // Unmittelbare Konsequenz: derselbe NP wuerde vor/nach dem Breakthrough einen
  // unterschiedlichen TSS ergeben, weil die TSS-Schwelle (CP) sich geaendert hat.
  assert.notEqual(btResult.tss, afterResult.tss);

  // Transparenz-Ergaenzung (rawFit): das rohe Regressionsergebnis wird mitgefuehrt, unabhaengig
  // davon, ob die Nebenbedingungs-Korrektur hier tatsaechlich eingegriffen hat.
  const rawFit = result.breakthroughs[0].rawFit;
  assert.ok(rawFit, 'rawFit sollte gesetzt sein, sobald die Regression konvergiert');
  assert.ok(Number.isFinite(rawFit.cp) && Number.isFinite(rawFit.wPrimeJ) && Number.isFinite(rawFit.pMax));
});

test('FA-SIG-07: Verwerfen eines Breakthroughs haelt die Signatur fuer alle nachfolgenden Aktivitaeten unveraendert', () => {
  const settings = mergeSettings();
  const prepared = buildHistory(settings);
  const discardedResult = computeSignatureHistory(prepared, { settings, discardedBreakthroughIds: new Set(['bt']) });

  assert.equal(discardedResult.breakthroughs[0].discarded, true);
  // Kein 'refit'-Eintrag in der Historie - nur die Startsignatur bleibt gueltig.
  assert.equal(discardedResult.history.length, 1);
  assert.equal(discardedResult.history[0].source, 'initial');

  const byId = new Map(discardedResult.activityResults.map((r) => [r.id, r]));
  const afterResult = byId.get('after1');
  assert.equal(afterResult.signature.cp, discardedResult.initial.signature.cp);
  assert.equal(afterResult.signature.pMax, discardedResult.initial.signature.pMax);
});

test('FA-SIG-07: Reaktivieren (leere discardedBreakthroughIds) stellt exakt den Zustand vor dem Verwerfen wieder her', () => {
  const settings = mergeSettings();
  const prepared = buildHistory(settings);

  const original = computeSignatureHistory(prepared, { settings });
  computeSignatureHistory(prepared, { settings, discardedBreakthroughIds: new Set(['bt']) }); // verwerfen (Zwischenschritt)
  const reactivated = computeSignatureHistory(prepared, { settings, discardedBreakthroughIds: new Set() });

  assert.deepEqual(serializable(reactivated), serializable(original));
});

function serializable(x) {
  return JSON.parse(
    JSON.stringify(x, (key, value) => {
      if (value instanceof Set) return [...value].sort();
      if (ArrayBuffer.isView(value)) return Array.from(value);
      return value;
    })
  );
}
