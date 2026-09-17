import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareActivity } from '../src/activity.js';
import { mergeSettings } from '../src/settings.js';
import { sportGroup, thresholdAtDate, estimateThresholds, applySportSpecificTss } from '../src/thresholds.js';

function runPoints(durationSec, speedMs) {
  return Array.from({ length: durationSec }, (_, t) => ({ t, velocity: speedMs, heartrate: 150 }));
}

function ridePointsNearTp(durationSec, watts, hr) {
  return Array.from({ length: durationSec }, (_, t) => ({ t, watts, deviceWatts: true, heartrate: hr }));
}

test('sportGroup: bekannte Strava-Typen -> run/swim/cycling, sonst der Typ selbst', () => {
  assert.equal(sportGroup('Run'), 'run');
  assert.equal(sportGroup('TrailRun'), 'run');
  assert.equal(sportGroup('Swim'), 'swim');
  assert.equal(sportGroup('VirtualRide'), 'cycling');
  assert.equal(sportGroup('Hike'), 'Hike');
  assert.equal(sportGroup(undefined), 'other');
});

test('thresholdAtDate: letzter Eintrag mit date <= gesuchtem Datum, wie signatureAtDate', () => {
  const history = [
    { date: '2026-01-01', value: 3, source: 'estimated' },
    { date: '2026-03-01', value: 3.5, source: 'estimated' },
  ];
  assert.equal(thresholdAtDate(history, '2026-02-01').value, 3);
  assert.equal(thresholdAtDate(history, '2026-06-01').value, 3.5);
  assert.equal(thresholdAtDate(history, '2025-12-01'), null);
  assert.equal(thresholdAtDate([], '2026-01-01'), null);
});

test('estimateThresholds: Lauf-Schwellenpace aus der besten 60s-Anstrengung, versioniert bei Aenderung >= Epsilon', () => {
  const settings = mergeSettings({ thresholdEffortSeconds: 60, thresholdChangeEpsilon: 0.02 });
  const raw = [
    { id: 'r1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', type: 'Run', points: runPoints(120, 3.0) },
    { id: 'r2', date: '2026-01-10', startTime: '2026-01-10T08:00:00Z', type: 'Run', points: runPoints(120, 3.05) }, // <2% Aenderung -> kein neuer Eintrag
    { id: 'r3', date: '2026-02-01', startTime: '2026-02-01T08:00:00Z', type: 'Run', points: runPoints(120, 3.5) }, // deutliche Verbesserung
  ];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const { pace } = estimateThresholds(prepared, [], settings);

  assert.equal(pace.run.length, 2); // r2 erzeugt keinen neuen Eintrag, r3 schon
  assert.equal(pace.run[0].date, '2026-01-01');
  assert.equal(pace.run[0].value, 3.0);
  assert.equal(pace.run[1].date, '2026-02-01');
  assert.equal(pace.run[1].value, 3.5);
  assert.equal(pace.swim.length, 0);
});

test('estimateThresholds: Rad-Schwellen-HF (FA-TP-04) aus Herzfrequenz waehrend Leistung nahe TP', () => {
  const settings = mergeSettings({ thresholdCyclingPowerTolerance: 0.05 });
  const raw = [{ id: 'c1', date: '2026-03-01', startTime: '2026-03-01T08:00:00Z', type: 'Ride', points: ridePointsNearTp(120, 280, 155) }];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const signatureHistory = [{ date: '2026-01-01', cp: 282, wPrimeJ: 20000, pMax: 900, source: 'initial' }];

  const { hr } = estimateThresholds(prepared, signatureHistory, settings);
  assert.equal(hr.cycling.length, 1);
  assert.equal(hr.cycling[0].value, 155);
});

test('estimateThresholds: rollierendes Fenster laesst zu alte Bestleistungen "verjaehren"', () => {
  const settings = mergeSettings({ thresholdEffortSeconds: 30, thresholdEstimationWindowDays: 60, thresholdChangeEpsilon: 0.02 });
  const raw = [
    { id: 'r1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', type: 'Run', points: runPoints(60, 4.0) }, // starke alte Bestleistung
    { id: 'r2', date: '2026-04-01', startTime: '2026-04-01T08:00:00Z', type: 'Run', points: runPoints(60, 3.0) }, // > 60 Tage spaeter, r1 faellt aus dem Fenster
  ];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const { pace } = estimateThresholds(prepared, [], settings);
  assert.equal(pace.run[pace.run.length - 1].value, 3.0); // nicht mehr 4.0, da r1 verjaehrt ist
});

test('applySportSpecificTss: Lauf ohne Leistung bekommt Pace-TSS aus der geschaetzten Schwelle', () => {
  const settings = mergeSettings({ thresholdEffortSeconds: 60 });
  const raw = [
    { id: 'r1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', type: 'Run', points: runPoints(3600, 3.0) }, // setzt die Schwelle
    { id: 'r2', date: '2026-01-10', startTime: '2026-01-10T08:00:00Z', type: 'Run', points: runPoints(3600, 3.0) }, // 1h bei genau Schwellenpace
  ];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const { pace, hr } = estimateThresholds(prepared, [], settings);

  const activityResults = [
    { id: 'r1', date: '2026-01-01', hasSignature: false },
    { id: 'r2', date: '2026-01-10', hasSignature: false },
  ];
  applySportSpecificTss(activityResults, prepared, { pace, hr });

  const r2 = activityResults.find((r) => r.id === 'r2');
  assert.equal(r2.tssSource, 'pace');
  assert.ok(Math.abs(r2.tss - 100) < 1); // 1h bei IF=1 (genau an der Schwelle) ~= 100 TSS
});

test('applySportSpecificTss: echter leistungsbasierter TSS bleibt unangetastet, auch wenn er 0 ist', () => {
  const activityResults = [{ id: 'c1', date: '2026-01-01', hasSignature: true, tss: 0, np: 0 }];
  const prepared = [{ id: 'c1', type: 'Ride', mask: new Uint8Array([1, 1, 1]), stream: { n: 3, hasHeartrate: new Uint8Array(3), heartrate: new Float64Array(3), gap: new Uint8Array(3), velocity: new Float64Array(3) } }];
  applySportSpecificTss(activityResults, prepared, { pace: {}, hr: {} });
  assert.equal(activityResults[0].tss, 0);
  assert.equal(activityResults[0].tssSource, undefined); // Funktion hat diese Aktivitaet gar nicht angefasst
});

test('applySportSpecificTss: FA-TP-05 - ohne schaetzbare Schwelle und ohne Herzfrequenz kein TSS', () => {
  const settings = mergeSettings({ thresholdEffortSeconds: 1200 }); // Standard-Zieldauer, unsere Testaktivitaet ist kuerzer
  const raw = [{ id: 'w1', date: '2026-01-01', startTime: '2026-01-01T08:00:00Z', type: 'WeightTraining', points: Array.from({ length: 300 }, (_, t) => ({ t, heartrate: 130 })) }];
  const prepared = raw.map((r) => prepareActivity(r, settings));
  const { pace, hr } = estimateThresholds(prepared, [], settings);

  const activityResults = [{ id: 'w1', date: '2026-01-01', hasSignature: false }];
  applySportSpecificTss(activityResults, prepared, { pace, hr });

  assert.equal(activityResults[0].tss, null);
  assert.equal(activityResults[0].tssSource, null);
});
