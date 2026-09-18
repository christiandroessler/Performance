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

test('fitMortonCP mit fixedPMax haelt Pmax exakt fest, auch wenn die Daten selbst einen anderen Wert nahelegen wuerden (Pmax-Stabilitaet)', () => {
  const trueCp = 260;
  const trueWPrime = 18000;
  const truePMax = 1100; // die Daten selbst "wollen" 1100
  const grid = [60, 120, 180, 300, 600, 1200]; // keine kurzen Dauern - genau der Fall ohne Sprint-Evidenz
  const points = grid.map((t) => ({ t, watts: mortonPower(t, trueCp, trueWPrime, truePMax) }));

  const held = fitMortonCP(points, { fixedPMax: 1000 });
  assert.equal(held.pMax, 1000, 'Pmax sollte exakt beim uebergebenen Fixwert bleiben, nicht bei 1100 landen');
  assert.equal(held.pMaxFixed, true);
  assert.ok(Math.abs(held.cp - trueCp) < 15, `cp=${held.cp} sollte trotzdem sinnvoll an die Daten angepasst werden`);
});

test('fitMortonRobust mit holdPMax haelt Pmax ueber alle IRLS-Iterationen exakt fest', () => {
  const grid = [60, 120, 180, 300, 600, 1200];
  const points = grid.map((t) => ({ t, watts: mortonPower(t, 260, 18000, 1100) }));

  const held = fitMortonRobust(points, { pMaxHint: 950, holdPMax: true });
  assert.equal(held.pMax, 950);

  const free = fitMortonRobust(points, { pMaxHint: 950, holdPMax: false });
  assert.notEqual(free.pMax, 950, 'ohne holdPMax sollte der Fit frei zu einem anderen Wert konvergieren');
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
