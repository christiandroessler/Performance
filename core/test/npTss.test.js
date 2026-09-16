import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizedPower, trainingStressScore, intensityFactor, hrTSS, paceTSS } from '../src/npTss.js';

test('NP entspricht der konstanten Leistung bei gleichbleibender Belastung', () => {
  const watts = new Array(600).fill(250);
  assert.ok(Math.abs(normalizedPower(watts) - 250) < 0.01);
});

test('NP gewichtet Spitzen staerker als der einfache Durchschnitt', () => {
  const watts = new Array(300).fill(150);
  for (let i = 0; i < 30; i++) watts[i] = 400; // erster 30s-Block hart
  const np = normalizedPower(watts);
  const avg = watts.reduce((a, b) => a + b, 0) / watts.length;
  assert.ok(np > avg);
});

test('TSS = 100 bei einer Stunde konstant an der Schwelle (IF=1)', () => {
  assert.ok(Math.abs(trainingStressScore(3600, 250, 250) - 100) < 0.01);
});

test('TSS skaliert quadratisch mit der Intensitaet', () => {
  const tssAt1 = trainingStressScore(3600, 250, 250); // IF=1
  const tssAt0_5 = trainingStressScore(3600, 125, 250); // IF=0.5
  assert.ok(Math.abs(tssAt0_5 - tssAt1 * 0.25) < 0.01);
});

test('IF = NP / Schwelle', () => {
  assert.equal(intensityFactor(200, 250), 0.8);
});

test('hrTSS mit Ruhepuls (HRR-basiert)', () => {
  const tss = hrTSS(3600, 150, { restingHr: 50, thresholdHr: 170 });
  // ratio = (150-50)/(170-50) = 0.8333, tss = 1h * 0.8333^2 * 100
  assert.ok(Math.abs(tss - 69.44) < 0.1);
});

test('paceTSS bei Schwellengeschwindigkeit ergibt TSS=100 pro Stunde', () => {
  assert.ok(Math.abs(paceTSS(3600, 4.0, 4.0) - 100) < 0.01);
});
