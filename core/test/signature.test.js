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
import { computeSignatureHistory, computeInitialSignature, decaySignature, currentSignatureAtDate } from '../src/signature.js';
import { mergeSettings } from '../src/settings.js';

function daysBetween(from, to) {
  return Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000);
}

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
  // der Refit gilt erst AB diesem Datum fuer die naechsten Aktivitaeten, siehe signature.js) -
  // inklusive des Signatur-Verfalls seit der Startsignatur (2026-04-01 -> 2026-06-01).
  const btResult = byId.get('bt');
  const decayedInitial = decaySignature(result.initial.signature, daysBetween(result.initial.effectiveDate, '2026-06-01'), settings);
  assert.equal(btResult.signature.cp, decayedInitial.cp);
  assert.equal(btResult.signature.pMax, decayedInitial.pMax);
  assert.equal(result.breakthroughs[0].previousSignature.cp, decayedInitial.cp);

  // Eine Aktivitaet NACH dem Breakthrough nutzt die NEUE (refittete) Schwelle - 9 Tage spaeter,
  // also noch innerhalb der Karenzzeit, unverfallen.
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

  // Ohne den verworfenen Breakthrough gilt weiter die Startsignatur - verfallen bis zum Datum.
  const byId = new Map(discardedResult.activityResults.map((r) => [r.id, r]));
  const afterResult = byId.get('after1');
  const decayedInitial = decaySignature(discardedResult.initial.signature, daysBetween(discardedResult.initial.effectiveDate, '2026-06-10'), settings);
  assert.equal(afterResult.signature.cp, decayedInitial.cp);
  assert.equal(afterResult.signature.pMax, decayedInitial.pMax);
});

test('Signatur-Verfall im Rechenkern: ohne neue Bestaetigung sinkt die Signatur von Aktivitaet zu Aktivitaet', () => {
  const settings = mergeSettings();
  const raw = [
    { id: 'base1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base2', date: '2026-01-15', startTime: '2026-01-15T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base3', date: '2026-02-01', startTime: '2026-02-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'a1', date: '2026-04-10', startTime: '2026-04-10T08:00:00Z', points: buildAfterPoints() }, // 9 Tage nach Startsignatur
    { id: 'a2', date: '2026-05-15', startTime: '2026-05-15T08:00:00Z', points: buildAfterPoints() },
    { id: 'a3', date: '2026-08-01', startTime: '2026-08-01T08:00:00Z', points: buildAfterPoints() },
  ];
  const result = computeSignatureHistory(raw.map((r) => prepareActivity(r, settings)), { settings });
  assert.equal(result.breakthroughs.length, 0);
  const byId = new Map(result.activityResults.map((r) => [r.id, r]));
  const init = result.initial.signature;

  assert.equal(byId.get('a1').signature.cp, init.cp, 'innerhalb der Karenzzeit kein Verfall');
  assert.ok(byId.get('a2').signature.cp < init.cp);
  assert.ok(byId.get('a3').signature.cp < byId.get('a2').signature.cp);
  assert.ok(byId.get('a3').signature.cp >= init.cp * (1 - settings.signatureDecayMaxPct), 'nie unter den Boden');
  // TP verfaellt schneller als PP (eigene Zeitkonstanten je System).
  assert.ok(byId.get('a3').signature.cp / init.cp < byId.get('a3').signature.pMax / init.pMax);
});

test('Signatur-Verfall im Rechenkern: eine Anstrengung unter der alten, aber ueber der verfallenen Signatur loest einen Breakthrough aus', () => {
  // 30 min konstant 240 W (unter der Start-TP von 257 W): gegen die frische Startsignatur kein
  // Breakthrough, nach monatelangem Verfall (TP ~ -22 %, ~199 W) aber schon.
  const settings = mergeSettings();
  const steady = () => {
    const points = [];
    for (let t = 0; t < 600; t++) points.push({ t, watts: 150, deviceWatts: true });
    for (let t = 600; t < 2400; t++) points.push({ t, watts: 240, deviceWatts: true });
    for (let t = 2400; t < 3000; t++) points.push({ t, watts: 150, deviceWatts: true });
    return points;
  };
  const raw = [
    { id: 'base1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base2', date: '2026-01-15', startTime: '2026-01-15T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base3', date: '2026-02-01', startTime: '2026-02-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'fresh', date: '2026-04-05', startTime: '2026-04-05T08:00:00Z', points: steady() },
    { id: 'late', date: '2026-08-01', startTime: '2026-08-01T08:00:00Z', points: steady() },
  ];
  const result = computeSignatureHistory(raw.map((r) => prepareActivity(r, settings)), { settings });
  const ids = result.breakthroughs.map((b) => b.id);
  assert.ok(!ids.includes('fresh'), 'gegen die unverfallene Signatur kein Breakthrough');
  assert.ok(ids.includes('late'), 'gegen die verfallene Signatur ein Breakthrough');
  const bt = result.breakthroughs.find((b) => b.id === 'late');
  assert.ok(bt.previousSignature.cp < result.initial.signature.cp);
  // Die Signatur wird wieder bestaetigt und liegt danach ueber dem verfallenen Stand.
  assert.ok(bt.proposedSignature.cp > bt.previousSignature.cp);
});

test('currentSignatureAtDate: letzte Bestaetigung plus Verfall bis zum Datum', () => {
  const settings = mergeSettings();
  const history = [{ date: '2026-01-01', cp: 300, wPrimeJ: 20000, pMax: 1000, source: 'initial' }];
  assert.equal(currentSignatureAtDate(history, '2025-12-31', settings), null);
  const fresh = currentSignatureAtDate(history, '2026-01-10', settings);
  assert.equal(fresh.cp, 300);
  assert.equal(fresh.decayApplied, false);
  const later = currentSignatureAtDate(history, '2026-04-01', settings);
  assert.equal(later.decayApplied, true);
  assert.equal(later.daysSinceConfirmation, 90);
  assert.equal(later.cp, decaySignature(history[0], 90, settings).cp);
  assert.equal(later.confirmed, history[0]);
});

test('FA-SIG-07: Reaktivieren (leere discardedBreakthroughIds) stellt exakt den Zustand vor dem Verwerfen wieder her', () => {
  const settings = mergeSettings();
  const prepared = buildHistory(settings);

  const original = computeSignatureHistory(prepared, { settings });
  computeSignatureHistory(prepared, { settings, discardedBreakthroughIds: new Set(['bt']) }); // verwerfen (Zwischenschritt)
  const reactivated = computeSignatureHistory(prepared, { settings, discardedBreakthroughIds: new Set() });

  assert.deepEqual(serializable(reactivated), serializable(original));
});

test('avgHr: mittlere Herzfrequenz einer Aktivitaet landet im activityResult (Grundlage fuer "Letzte Aktivitaet" in der UI)', () => {
  const settings = mergeSettings();
  const raw = [
    { id: 'base1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base2', date: '2026-01-15', startTime: '2026-01-15T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base3', date: '2026-02-01', startTime: '2026-02-01T08:00:00Z', points: buildBaselinePoints() },
    {
      id: 'withHr',
      date: '2026-06-01',
      startTime: '2026-06-01T08:00:00Z',
      points: buildAfterPoints().map((p) => ({ ...p, heartrate: 140 })),
    },
    { id: 'noHr', date: '2026-06-10', startTime: '2026-06-10T08:00:00Z', points: buildAfterPoints() },
  ];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const result = computeSignatureHistory(prepared, { settings });

  const withHrResult = result.activityResults.find((r) => r.id === 'withHr');
  assert.ok(withHrResult && withHrResult.hasSignature, 'Aktivitaet nach dem Startfenster sollte ein vollstaendiges Ergebnis haben');
  assert.equal(withHrResult.avgHr, 140);

  // Aktivitaeten ganz ohne Herzfrequenz-Messung liefern null statt 0/NaN.
  const noHrResult = result.activityResults.find((r) => r.id === 'noHr');
  assert.ok(noHrResult && noHrResult.hasSignature);
  assert.equal(noHrResult.avgHr, null);
});

// Sprintlastiges Startfenster ohne jede nahe-erschoepfende Mehrminuten-Anstrengung (nur kurze
// Sprints + lange, deutlich unterhalb CP liegende Ausfahrten) - genau das Datenmuster, das laut
// core/README.md ("HIE-Stabilitaet") den rohen Fit auf cpFit.js' numerischen LM-Clamp (45000 J)
// pinnen kann. computeInitialSignature durchlaeuft (anders als refitSignature) keine der
// Evidenz-/Traegheitsbremsen-Mechanismen des Refit-Pfads - die einzige Absicherung ist die neue
// absolute Plausibilitaetsgrenze `maxPlausibleWPrimeJ`.
function buildSprintHeavyPoints(sprintWatts, sprintSec, tailWatts, tailSec) {
  const points = [];
  for (let t = 0; t < sprintSec; t++) points.push({ t, watts: sprintWatts, deviceWatts: true });
  for (let t = sprintSec; t < sprintSec + tailSec; t++) points.push({ t, watts: tailWatts + 10 * Math.sin(t / 13), deviceWatts: true });
  return points;
}

test('HIE-Stabilitaet (Startsignatur): ein rohes wPrime am/ueber dem 45000-Clamp wird auf maxPlausibleWPrimeJ geklemmt', () => {
  const settings = mergeSettings();
  const raw = [
    { id: 's1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildSprintHeavyPoints(1500, 8, 150, 900) },
    { id: 's2', date: '2026-01-05', startTime: '2026-01-05T08:00:00Z', points: buildSprintHeavyPoints(1450, 12, 155, 1200) },
    { id: 's3', date: '2026-01-10', startTime: '2026-01-10T08:00:00Z', points: buildSprintHeavyPoints(1600, 5, 145, 800) },
    { id: 's4', date: '2026-01-15', startTime: '2026-01-15T08:00:00Z', points: buildSprintHeavyPoints(1400, 20, 160, 1500) },
    { id: 's5', date: '2026-01-20', startTime: '2026-01-20T08:00:00Z', points: buildSprintHeavyPoints(1550, 15, 150, 1000) },
  ];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const result = computeInitialSignature(prepared, settings);

  assert.equal(result.fit.model, '3p');
  assert.ok(result.fit.wPrime >= 44000, `Testdaten sollten den rohen Fit an/ueber den Clamp treiben, wPrime=${result.fit.wPrime}`);
  assert.equal(result.signature.wPrimeJ, settings.maxPlausibleWPrimeJ, 'wPrimeJ sollte auf die Plausibilitaetsgrenze geklemmt sein, nicht den rohen ~45000-Wert zeigen');
  assert.equal(result.wPrimeClampedAtInitial, true);
  // Nur wPrimeJ wird geklemmt - cp/pMax bleiben die rohen Fit-Werte.
  assert.equal(result.signature.cp, result.fit.cp);
  assert.equal(result.signature.pMax, result.fit.pMax);
});

test('HIE-Stabilitaet (Startsignatur): ein plausibles rohes wPrime bleibt vom Clamp unberuehrt', () => {
  const settings = mergeSettings();
  const raw = [
    { id: 'base1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base2', date: '2026-01-15', startTime: '2026-01-15T08:00:00Z', points: buildBaselinePoints() },
    { id: 'base3', date: '2026-02-01', startTime: '2026-02-01T08:00:00Z', points: buildBaselinePoints() },
  ];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const result = computeInitialSignature(prepared, settings);

  assert.ok(result.fit.wPrime < settings.maxPlausibleWPrimeJ, `Testdaten sollten deutlich unter der Grenze liegen, wPrime=${result.fit.wPrime}`);
  assert.equal(result.signature.wPrimeJ, result.fit.wPrime, 'ohne Clamp-Notwendigkeit sollte wPrimeJ exakt dem rohen Fit entsprechen');
  assert.equal(result.wPrimeClampedAtInitial, false);
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
