import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyStrainSums,
  loadResponseSeriesForSystem,
  loadResponseSeries,
  fitK1ThroughOrigin,
  calibrateTau1K1,
  holdOutBacktest,
  displaySignatureAtDate,
} from '../src/loadResponse.js';
import { mergeSettings } from '../src/settings.js';

function addDaysLocal(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function subtractMonthsLocal(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function tau1BySystemUniform(settings) {
  return { cp: settings.loadResponseTau1Days, wPrime: settings.loadResponseTau1Days, pMax: settings.loadResponseTau1Days };
}

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
  const series = loadResponseSeries(sums, [], tau1BySystemUniform(settings), settings);

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
  for (let i = 0; i < 400; i++) sums[addDaysLocal('2026-01-01', i)] = { cp: 50, wPrime: 0, pMax: 0 };
  const series = loadResponseSeries(sums, [], tau1BySystemUniform(settings), settings);
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
  const series = loadResponseSeries(sums, breakthroughs, tau1BySystemUniform(settings), settings);
  const byDate = Object.fromEntries(series.map((e) => [e.date, e]));

  const decay1 = Math.exp(-1 / settings.loadResponseTau1Days);
  const expectedG = 40 * (1 - decay1);
  assert.ok(Math.abs(byDate['2026-01-03'].cp.g - expectedG) < 1e-9);
  assert.ok(byDate['2026-01-03'].cp.g < byDate['2026-01-02'].cp.g);
});

test('loadResponseSeries: ein verworfener Breakthrough loest KEINEN Reset aus', () => {
  const settings = mergeSettings();
  const sums = { '2026-01-01': { cp: 100, wPrime: 0, pMax: 0 }, '2026-01-02': { cp: 0, wPrime: 0, pMax: 0 } };
  const breakthroughs = [{ date: '2026-01-02', discarded: true }];
  const series = loadResponseSeries(sums, breakthroughs, tau1BySystemUniform(settings), settings);
  const decay1 = Math.exp(-1 / settings.loadResponseTau1Days);
  const gDay1 = 100 * (1 - decay1);
  const expectedGDay2 = gDay1 * decay1;
  assert.ok(Math.abs(series[1].cp.g - expectedGDay2) < 1e-9);
});

test('fitK1ThroughOrigin: fittet k1 per Least-Squares gegen bestaetigte Breakthrough-Deltas, wenn genug Stuetzpunkte vorhanden sind', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3 });
  // Einzelsystem-Serie mit bekanntem p am Vortag jedes Breakthroughs, echtes k1=2.5.
  const series = [
    { date: '2025-12-31', g: 10, h: 0, p: 10 },
    { date: '2026-02-14', g: 20, h: 0, p: 20 },
    { date: '2026-03-31', g: 8, h: 0, p: 8 },
  ];
  const breakthroughs = [
    { date: '2026-01-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 275 } }, // delta 25 = 2.5*10
    { date: '2026-02-15', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 300 } }, // delta 50 = 2.5*20
    { date: '2026-04-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 270 } }, // delta 20 = 2.5*8
  ];

  const fit = fitK1ThroughOrigin(series, breakthroughs, 'cp', settings.loadResponseMinBreakthroughsForFit);
  assert.equal(fit.fitted, true);
  assert.equal(fit.supportCount, 3);
  assert.ok(Math.abs(fit.k1 - 2.5) < 1e-9, `k1=${fit.k1} sollte 2.5 sein`);
  assert.ok(fit.sse < 1e-9, `sse=${fit.sse} sollte ~0 sein (Daten exakt aus k1=2.5 konstruiert)`);
});

test('fitK1ThroughOrigin: bleibt beim Neutralwert 1, solange weniger Breakthroughs als minSupport vorliegen', () => {
  const series = [{ date: '2025-12-31', g: 10, h: 0, p: 10 }];
  const breakthroughs = [{ date: '2026-01-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 275 } }];

  const fit = fitK1ThroughOrigin(series, breakthroughs, 'cp', 3);
  assert.deepEqual(fit, { k1: 1, fitted: false, supportCount: 1, sse: null, clamped: false });
});

test('fitK1ThroughOrigin: kappt k1 an der oberen festen Grenze (Kap. 7.8), statt einen unplausiblen Ausreisser zu liefern', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3 });
  // Sehr kleines p bei grossen Deltas -> unbeschraenkter Fit waere weit ueber K1_MAX=5.
  const series = [
    { date: '2025-12-31', g: 1, h: 0, p: 1 },
    { date: '2026-02-14', g: 2, h: 0, p: 2 },
    { date: '2026-03-31', g: 1.5, h: 0, p: 1.5 },
  ];
  const breakthroughs = [
    { date: '2026-01-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 300 } },
    { date: '2026-02-15', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 350 } },
    { date: '2026-04-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 325 } },
  ];

  const fit = fitK1ThroughOrigin(series, breakthroughs, 'cp', settings.loadResponseMinBreakthroughsForFit);
  assert.equal(fit.fitted, true);
  assert.equal(fit.k1, 5, `k1=${fit.k1} sollte an K1_MAX=5 gekappt sein`);
  assert.equal(fit.clamped, true);
});

test('fitK1ThroughOrigin: kappt k1 an der unteren festen Grenze, auch bei einem negativen unbeschraenkten Fit', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3 });
  // p und Delta laufen gegenlaeufig -> unbeschraenkter Fit waere negativ, unterhalb K1_MIN=0,2.
  const series = [
    { date: '2025-12-31', g: 10, h: 0, p: 10 },
    { date: '2026-02-14', g: 20, h: 0, p: 20 },
    { date: '2026-03-31', g: 30, h: 0, p: 30 },
  ];
  const breakthroughs = [
    { date: '2026-01-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 260 } },
    { date: '2026-02-15', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 245 } },
    { date: '2026-04-01', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 220 } },
  ];

  const fit = fitK1ThroughOrigin(series, breakthroughs, 'cp', settings.loadResponseMinBreakthroughsForFit);
  assert.equal(fit.fitted, true);
  assert.equal(fit.k1, 0.2, `k1=${fit.k1} sollte an K1_MIN=0,2 gekappt sein`);
  assert.equal(fit.clamped, true);
});

test('calibrateTau1K1: findet ein bekanntes synthetisches tau1 per Grid-Search wieder', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3 });
  const trueTau1 = 40;
  const trueK1 = 3;

  const sums = {};
  for (let i = 0; i < 200; i++) {
    sums[addDaysLocal('2025-01-01', i)] = { cp: 30 + 25 * Math.sin(i / 11) + (i % 5 === 0 ? 15 : 0), wPrime: 0, pMax: 0 };
  }

  const breakthroughDates = ['2025-02-20', '2025-04-15', '2025-06-10'];
  const skeleton = breakthroughDates.map((date) => ({ date, discarded: false }));
  const referenceSeries = loadResponseSeriesForSystem(sums, skeleton, 'cp', trueTau1, settings.loadResponseTau2Days);
  const byDate = Object.fromEntries(referenceSeries.map((e) => [e.date, e]));

  const breakthroughs = breakthroughDates.map((date) => {
    const p = byDate[addDaysLocal(date, -1)].p;
    return { date, discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 250 + trueK1 * p } };
  });

  const calibration = calibrateTau1K1(sums, breakthroughs, settings);
  assert.equal(calibration.cp.fitted, true);
  assert.equal(calibration.cp.tau1, trueTau1);
  assert.ok(Math.abs(calibration.cp.k1 - trueK1) < 1e-6, `k1=${calibration.cp.k1} sollte ${trueK1} sein`);
});

test('calibrateTau1K1: bleibt beim Literatur-Fallback, solange weniger Breakthroughs als loadResponseMinBreakthroughsForFit vorliegen', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3 });
  const sums = { '2025-01-01': { cp: 30, wPrime: 0, pMax: 0 } };
  const breakthroughs = [{ date: '2025-01-02', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 260 } }];

  const calibration = calibrateTau1K1(sums, breakthroughs, settings);
  assert.deepEqual(calibration.cp, { tau1: settings.loadResponseTau1Days, k1: 1, fitted: false, supportCount: 1, sse: null, clamped: false });
});

test('holdOutBacktest: trennt Training/Test am Stichtag, sagt die Zukunft korrekt voraus, wenn das Modell exakt generiert wurde', () => {
  const settings = mergeSettings({ loadResponseMinBreakthroughsForFit: 3, loadResponseHoldOutMonths: 6 });
  const trueTau1 = 42;
  const trueK1 = 2;

  const sums = {};
  for (let i = 0; i < 700; i++) {
    sums[addDaysLocal('2024-01-01', i)] = { cp: 20 + 15 * Math.sin(i / 9) + (i % 6 === 0 ? 10 : 0), wPrime: 0, pMax: 0 };
  }
  const lastDate = addDaysLocal('2024-01-01', 699);
  const cutoff = subtractMonthsLocal(lastDate, 6);

  // 3 Trainings-Breakthroughs deutlich vor dem Stichtag, 1 Test-Breakthrough danach.
  const breakthroughDates = ['2024-02-01', '2024-04-01', '2024-06-01', addDaysLocal(cutoff, 20)];
  const skeleton = breakthroughDates.map((date) => ({ date, discarded: false }));
  const referenceSeries = loadResponseSeriesForSystem(sums, skeleton, 'cp', trueTau1, settings.loadResponseTau2Days);
  const byDate = Object.fromEntries(referenceSeries.map((e) => [e.date, e]));

  const breakthroughs = breakthroughDates.map((date) => {
    const p = byDate[addDaysLocal(date, -1)].p;
    return { date, discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 250 + trueK1 * p } };
  });

  const report = holdOutBacktest(sums, breakthroughs, settings);
  assert.equal(report.cp.testCount, 1);
  assert.ok(report.cp.mae < 1, `mae=${report.cp.mae} sollte nahe 0 sein, da das Modell exakt generiert wurde`);
  assert.ok(report.cp.suggestedDiscountPct < 5, `suggestedDiscountPct=${report.cp.suggestedDiscountPct} sollte klein sein`);
});

test('holdOutBacktest: ohne Breakthroughs nach dem Stichtag klar als "kein Bericht moeglich" gekennzeichnet', () => {
  const settings = mergeSettings({ loadResponseHoldOutMonths: 6 });
  // 300 Tage Historie, Breakthrough gleich zu Beginn (weit vor dem 6-Monate-Stichtag) -
  // danach passiert nichts mehr, es gibt also keine Test-Breakthroughs.
  const sums = {};
  for (let i = 0; i < 300; i++) sums[addDaysLocal('2024-01-01', i)] = { cp: 30, wPrime: 0, pMax: 0 };
  const breakthroughs = [{ date: '2024-01-11', discarded: false, previousSignature: { cp: 250 }, proposedSignature: { cp: 260 } }];

  const report = holdOutBacktest(sums, breakthroughs, settings);
  assert.equal(report.cp.testCount, 0);
  assert.equal(report.cp.mae, null);
  assert.equal(report.cp.suggestedDiscountPct, null);
});

test('holdOutBacktest: leere Belastungsdaten liefern null statt zu werfen', () => {
  const settings = mergeSettings();
  assert.equal(holdOutBacktest({}, [], settings), null);
});

test('displaySignatureAtDate: addiert den kalibrierten Belastungstrend auf die zum Datum gueltige Signatur', () => {
  const settings = mergeSettings({ loadResponseDisplayDiscountPct: 0, signatureDecayMaxPct: 0 }); // Signatur-Verfall hier ausgeschaltet, eigene Tests unten
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
  const settings = mergeSettings({ loadResponseDisplayDiscountPct: 20, signatureDecayMaxPct: 0 }); // Signatur-Verfall hier ausgeschaltet, eigene Tests unten
  const history = [{ date: '2026-01-01', cp: 250, wPrimeJ: 20000, pMax: 1000, source: 'initial' }];
  const series = [{ date: '2026-02-01', cp: { g: 10, h: 0, p: 10 }, wPrime: { g: 0, h: 0, p: 0 }, pMax: { g: 0, h: 0, p: 0 } }];
  const calibration = { cp: { k1: 1, fitted: true, supportCount: 5 }, wPrime: { k1: 1, fitted: false, supportCount: 0 }, pMax: { k1: 1, fitted: false, supportCount: 0 } };

  const result = displaySignatureAtDate('2026-02-01', history, series, calibration, settings);
  assert.equal(result.cp, 250 + 10 * 0.8);
});

test('displaySignatureAtDate: ohne passenden Serieneintrag (z. B. vor der ersten Aktivitaet) nur die Basis-Signatur, klar gekennzeichnet', () => {
  const settings = mergeSettings();
  const history = [{ date: '2026-01-01', cp: 250, wPrimeJ: 20000, pMax: 1000, source: 'initial' }];
  const result = displaySignatureAtDate('2026-01-01', history, [], {}, settings);
  assert.equal(result.hasLoadAdjustment, false);
  assert.equal(result.cp, 250);
  assert.equal(result.decayApplied, false);
});

test('displaySignatureAtDate: innerhalb der Karenzzeit (Signatur-Verfall) keine Aenderung', () => {
  const settings = mergeSettings();
  const history = [{ date: '2026-01-01', cp: 250, wPrimeJ: 20000, pMax: 1000, source: 'initial' }];
  const result = displaySignatureAtDate(addDaysLocal('2026-01-01', settings.signatureDecayGraceDays), history, [], {}, settings);
  assert.equal(result.decayApplied, false);
  assert.equal(result.cp, 250);
});

test('displaySignatureAtDate: nach der Karenzzeit faellt der Basiswert je System mit eigener Zeitkonstante, nie unter den Boden', () => {
  const settings = mergeSettings();
  const history = [{ date: '2026-01-01', cp: 300, wPrimeJ: 30000, pMax: 1200, source: 'initial' }];

  // Kurz nach der Karenzzeit: messbarer, aber kleiner Verfall
  const soon = displaySignatureAtDate(addDaysLocal('2026-01-01', settings.signatureDecayGraceDays + 10), history, [], {}, settings);
  assert.equal(soon.decayApplied, true);
  assert.ok(soon.cp < 300 && soon.cp > 270, `cp=${soon.cp} sollte leicht unter 300 liegen`);

  // TP (schnellste Zeitkonstante) sollte prozentual staerker verfallen sein als HIE, HIE staerker als PP
  const cpLossPct = (300 - soon.cp) / 300;
  const wPrimeLossPct = (30000 - soon.wPrimeJ) / 30000;
  const pMaxLossPct = (1200 - soon.pMax) / 1200;
  assert.ok(cpLossPct > wPrimeLossPct, 'TP sollte staerker verfallen sein als HIE (kuerzere Zeitkonstante)');
  assert.ok(wPrimeLossPct > pMaxLossPct, 'HIE sollte staerker verfallen sein als PP (kuerzere Zeitkonstante)');

  // Sehr lange danach: naehert sich dem Boden (1 - signatureDecayMaxPct), unterschreitet ihn nie
  const farFuture = displaySignatureAtDate(addDaysLocal('2026-01-01', 3650), history, [], {}, settings);
  const floor = 1 - settings.signatureDecayMaxPct;
  assert.ok(farFuture.cp >= 300 * floor - 1e-6, `cp=${farFuture.cp} sollte den Boden (${300 * floor}) nie unterschreiten`);
  assert.ok(Math.abs(farFuture.cp - 300 * floor) < 1, 'cp sollte sich nach sehr langer Zeit dem Boden annaehern');
});
