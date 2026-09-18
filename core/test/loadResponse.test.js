import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyStrainSums, loadResponseSeries, calibrateK1, displaySignatureAtDate } from '../src/loadResponse.js';
import { mergeSettings } from '../src/settings.js';

test('dailyStrainSums: summiert Strain-Sub-Scores mehrerer Aktivitaeten desselben Tages, ueberspringt Aktivitaeten ohne strain', () => {
  const activityResults = [
    { date: '2026-01-01', strain: { low: 10, high: 5, peak: 1 } },
    { date: '2026-01-01', strain: { low: 3, high: 2, peak: 0.5 } },
    { date: '2026-01-02', hasSignature: false }, // kein strain-Feld
  ];
  const sums = dailyStrainSums(activityResults);
  assert.deepEqual(sums, { '2026-01-01': { cp: 13, wPrime: 7, pMax: 1.5 } });
});

test('loadResponseSeries: erster Tag aus dem Nullzustand entspricht der exakten Exponentialformel (Kap. 7.7)', () => {
  const settings = mergeSettings();
  const sums = { '2026-01-01': { cp: 100, wPrime: 100, pMax: 100 } };
  const series = loadResponseSeries(sums, [], settings);

  assert.equal(series.length, 1);
  const decay1 = Math.exp(-1 / settings.loadResponseTau1Days);
  const decay2 = Math.exp(-1 / settings.loadResponseTau2Days);
  const expectedG = 100 * (1 - decay1);
  const expectedH = 100 * (1 - decay2);
  assert.ok(Math.abs(series[0].cp.g - expectedG) < 1e-9);
  assert.ok(Math.abs(series[0].cp.h - expectedH) < 1e-9);
  assert.ok(Math.abs(series[0].cp.p - (expectedG - expectedH)) < 1e-9);
});

test('loadResponseSeries: konstante taegliche Belastung konvergiert gegen p=0 (g und h laufen beide gegen die Eingabe, unabhaengig von tau)', () => {
  const settings = mergeSettings();
  const sums = {};
  const start = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 400; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    sums[d] = { cp: 50, wPrime: 0, pMax: 0 };
  }
  const series = loadResponseSeries(sums, [], settings);
  const last = series[series.length - 1];
  assert.ok(Math.abs(last.cp.g - 50) < 0.01, `g=${last.cp.g} sollte gegen 50 konvergieren`);
  assert.ok(Math.abs(last.cp.h - 50) < 0.01, `h=${last.cp.h} sollte gegen 50 konvergieren`);
  assert.ok(Math.abs(last.cp.p) < 0.01, `p=${last.cp.p} sollte gegen 0 konvergieren`);
});

test('loadResponseSeries: ein nicht verworfener Breakthrough setzt g/h an diesem Tag zurueck, danach laeuft die eigene Belastung des Tages normal weiter', () => {
  const settings = mergeSettings();
  const sums = {
    '2026-01-01': { cp: 100, wPrime: 0, pMax: 0 },
    '2026-01-02': { cp: 100, wPrime: 0, pMax: 0 },
    '2026-01-03': { cp: 40, wPrime: 0, pMax: 0 }, // Breakthrough-Tag
    '2026-01-04': { cp: 0, wPrime: 0, pMax: 0 },
  };
  const breakthroughs = [{ date: '2026-01-03', discarded: false }];
  const series = loadResponseSeries(sums, breakthroughs, settings);
  const byDate = Object.fromEntries(series.map((e) => [e.date, e]));

  // Am Breakthrough-Tag entspricht der Stand exakt einem Neustart aus 0 mit nur diesem Tages-Wert.
  const decay1 = Math.exp(-1 / settings.loadResponseTau1Days);
  const expectedG = 40 * (1 - decay1);
  assert.ok(Math.abs(byDate['2026-01-03'].cp.g - expectedG) < 1e-9);

  // Ohne Reset waere g am 03. deutlich hoeher (zwei Vortage mit Belastung 100) - Regressionsschutz.
  assert.ok(byDate['2026-01-03'].cp.g < byDate['2026-01-02'].cp.g);
});

test('loadResponseSeries: ein verworfener Breakthrough loest KEINEN Reset aus', () => {
  const settings = mergeSettings();
  const sums = {
    '2026-01-01': { cp: 100, wPrime: 0, pMax: 0 },
    '2026-01-02': { cp: 0, wPrime: 0, pMax: 0 },
  };
  const breakthroughs = [{ date: '2026-01-02', discarded: true }];
  const series = loadResponseSeries(sums, breakthroughs, settings);
  const decay1 = Math.exp(-1 / settings.loadResponseTau1Days);
  const gDay1 = 100 * (1 - decay1);
  const expectedGDay2 = gDay1 * decay1; // kein Reset, reine Abklingung ohne neue Belastung
  assert.ok(Math.abs(series[1].cp.g - expectedGDay2) < 1e-9);
});

test('calibrateK1: fittet k1 per Least-Squares gegen bestaetigte Breakthrough-Deltas, wenn genug Stuetzpunkte vorhanden sind', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3 });
  // Synthetische Serie mit bekanntem cp.p am Vortag jedes Breakthroughs, echtes k1=2.5.
  const series = [
    { date: '2025-12-31', cp: { g: 10, h: 0, p: 10 }, wPrime: { g: 0, h: 0, p: 0 }, pMax: { g: 0, h: 0, p: 0 } },
    { date: '2026-02-14', cp: { g: 20, h: 0, p: 20 }, wPrime: { g: 0, h: 0, p: 0 }, pMax: { g: 0, h: 0, p: 0 } },
    { date: '2026-03-31', cp: { g: 8, h: 0, p: 8 }, wPrime: { g: 0, h: 0, p: 0 }, pMax: { g: 0, h: 0, p: 0 } },
  ];
  const breakthroughs = [
    { date: '2026-01-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 275 } }, // delta 25 = 2.5*10
    { date: '2026-02-15', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 300 } }, // delta 50 = 2.5*20
    { date: '2026-04-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 270 } }, // delta 20 = 2.5*8
  ];

  const calibration = calibrateK1(series, breakthroughs, settings);
  assert.equal(calibration.cp.fitted, true);
  assert.equal(calibration.cp.supportCount, 3);
  assert.ok(Math.abs(calibration.cp.k1 - 2.5) < 1e-9, `k1=${calibration.cp.k1} sollte 2.5 sein`);
});

test('calibrateK1: bleibt beim Neutralwert 1, solange weniger Breakthroughs als loadResponseMinBreakthroughsForFit vorliegen', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3 });
  const series = [{ date: '2025-12-31', cp: { g: 10, h: 0, p: 10 }, wPrime: { g: 0, h: 0, p: 0 }, pMax: { g: 0, h: 0, p: 0 } }];
  const breakthroughs = [{ date: '2026-01-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 275 } }];

  const calibration = calibrateK1(series, breakthroughs, settings);
  assert.deepEqual(calibration.cp, { k1: 1, fitted: false, supportCount: 1 });
});

test('displaySignatureAtDate: addiert den kalibrierten Belastungstrend auf die zum Datum gueltige Signatur', () => {
  const settings = mergeSettings({ loadResponseDisplayDiscountPct: 0 });
  const history = [{ date: '2026-01-01', cp: 250, wPrimeJ: 20000, pMax: 1000, source: 'initial' }];
  const series = [{ date: '2026-02-01', cp: { g: 10, h: 0, p: 10 }, wPrime: { g: 5, h: 0, p: 5 }, pMax: { g: 2, h: 0, p: 2 } }];
  const calibration = { cp: { k1: 2, fitted: true, supportCount: 5 }, wPrime: { k1: 1, fitted: false, supportCount: 0 }, pMax: { k1: 3, fitted: true, supportCount: 5 } };

  const result = displaySignatureAtDate('2026-02-01', history, series, calibration, settings);
  assert.equal(result.hasLoadAdjustment, true);
  assert.equal(result.cp, 250 + 2 * 10);
  assert.equal(result.wPrimeJ, 20000 + 1 * 5);
  assert.equal(result.pMax, 1000 + 3 * 2);
});

test('displaySignatureAtDate: Anzeige-Abschlag reduziert den Trendanteil proportional', () => {
  const settings = mergeSettings({ loadResponseDisplayDiscountPct: 20 });
  const history = [{ date: '2026-01-01', cp: 250, wPrimeJ: 20000, pMax: 1000, source: 'initial' }];
  const series = [{ date: '2026-02-01', cp: { g: 10, h: 0, p: 10 }, wPrime: { g: 0, h: 0, p: 0 }, pMax: { g: 0, h: 0, p: 0 } }];
  const calibration = { cp: { k1: 1, fitted: true, supportCount: 5 }, wPrime: { k1: 1, fitted: false, supportCount: 0 }, pMax: { k1: 1, fitted: false, supportCount: 0 } };

  const result = displaySignatureAtDate('2026-02-01', history, series, calibration, settings);
  assert.equal(result.cp, 250 + 10 * 0.8); // 20% Abschlag auf den Trendanteil
});

test('displaySignatureAtDate: ohne passenden Serieneintrag (z. B. vor der ersten Aktivitaet) nur die Basis-Signatur, klar gekennzeichnet', () => {
  const settings = mergeSettings();
  const history = [{ date: '2026-01-01', cp: 250, wPrimeJ: 20000, pMax: 1000, source: 'initial' }];
  const result = displaySignatureAtDate('2026-01-01', history, [], {}, settings);
  assert.equal(result.hasLoadAdjustment, false);
  assert.equal(result.cp, 250);
});
