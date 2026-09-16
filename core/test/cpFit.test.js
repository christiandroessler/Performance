import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mortonPower, fitMortonCP, fitMortonRobust } from '../src/cpFit.js';

test('3-Parameter-Fit rekonstruiert bekannte Morton-Parameter aus rauschfreien Punkten', () => {
  const cp = 280;
  const wPrime = 21000;
  const pMax = 1100;
  const grid = [5, 10, 20, 30, 60, 120, 180, 300, 600, 1200, 1800, 3600];
  const points = grid.map((t) => ({ t, watts: mortonPower(t, cp, wPrime, pMax) }));

  const fit = fitMortonCP(points);
  assert.equal(fit.model, '3p');
  assert.ok(Math.abs(fit.cp - cp) < 5, `cp=${fit.cp}`);
  assert.ok(Math.abs(fit.wPrime - wPrime) < 1000, `wPrime=${fit.wPrime}`);
  assert.ok(Math.abs(fit.pMax - pMax) < 30, `pMax=${fit.pMax}`);
});

test('Robuster Fit ignoriert einen einzelnen groben Ausreisser', () => {
  const cp = 260;
  const wPrime = 18000;
  const pMax = 1000;
  const grid = [5, 10, 20, 30, 60, 120, 180, 300, 600, 1200, 1800, 3600];
  const points = grid.map((t) => ({ t, watts: mortonPower(t, cp, wPrime, pMax) }));
  points[2] = { ...points[2], watts: points[2].watts * 3 }; // grober Ausreisser

  const fit = fitMortonRobust(points);
  assert.equal(fit.model, '3p');
  assert.ok(Math.abs(fit.cp - cp) < 15, `cp=${fit.cp}`);
  assert.ok(Math.abs(fit.pMax - pMax) < 100, `pMax=${fit.pMax}`);
});

test('fitMortonCP ist deterministisch (gleiche Eingabe -> gleiche Ausgabe)', () => {
  const points = [
    { t: 5, watts: 900 },
    { t: 60, watts: 400 },
    { t: 300, watts: 320 },
    { t: 1200, watts: 280 },
  ];
  const a = fitMortonCP(points);
  const b = fitMortonCP(points);
  assert.deepEqual(a, b);
});
