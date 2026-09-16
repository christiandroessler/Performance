// Testvektoren aus Lastenheft Kap. 7.6 (CP = 300 W, Pmax = 1200 W).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPower, kStrain, computeStrainScore } from '../src/strain.js';

const CP = 300;
const PMAX = 1200;

test('Energiesystemanteile bei P=1000W: P_Pmax~544, P_W~156, P_CP=300', () => {
  const { pCp, pW, pPmax } = splitPower(1000, CP, PMAX);
  assert.equal(pCp, 300);
  assert.ok(Math.abs(pPmax - 544.44) < 0.5, `pPmax=${pPmax}`);
  assert.ok(Math.abs(pW - 155.56) < 0.5, `pW=${pW}`);
});

test('Energiesystemanteile bei P=400W: P_Pmax~11, P_W~89, P_CP=300', () => {
  const { pCp, pW, pPmax } = splitPower(400, CP, PMAX);
  assert.equal(pCp, 300);
  assert.ok(Math.abs(pPmax - 11.11) < 0.5, `pPmax=${pPmax}`);
  assert.ok(Math.abs(pW - 88.89) < 0.5, `pW=${pW}`);
});

test('k_strain bei P=400W, MPA=1200W ~ 0.27', () => {
  assert.ok(Math.abs(kStrain(400, 1200, CP, PMAX) - 0.2727) < 0.01);
});

test('k_strain bei P=300W, MPA=400W ~ 0.92', () => {
  assert.ok(Math.abs(kStrain(300, 400, CP, PMAX) - 0.9167) < 0.01);
});

test('k_strain bei P=800W, MPA=800W = 1.00', () => {
  assert.ok(Math.abs(kStrain(800, 800, CP, PMAX) - 1.0) < 1e-9);
});

test('SS ~ 100 pro Stunde bei konstant P=CP=300W, MPA=Pmax=1200W', () => {
  const n = 3600;
  const watts = new Float64Array(n).fill(300);
  const mpa = new Float64Array(n).fill(1200);
  const { total, low, high, peak } = computeStrainScore(watts, mpa, CP, PMAX);
  assert.ok(Math.abs(total - 100) < 0.5, `total=${total}`);
  assert.equal(high, 0);
  assert.equal(peak, 0);
  assert.ok(Math.abs(low - 100) < 0.5);
});
