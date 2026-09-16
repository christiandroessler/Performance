// Abnahmekriterien M1: "Konstante Leistung ueber CP senkt W'bal linear. Die
// Erholung unter CP naehert sich W' asymptotisch." (Kap. 10, M1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wPrimeBalanceSkiba2015 } from '../src/wbal.js';

test("W'bal sinkt linear bei konstanter Leistung ueber CP", () => {
  const cp = 250;
  const wPrime = 20000;
  const n = 100;
  const watts = new Float64Array(n).fill(300); // 50 W ueber CP
  const bal = wPrimeBalanceSkiba2015(watts, cp, wPrime);

  for (let i = 0; i < n; i++) {
    const expected = wPrime - 50 * (i + 1);
    assert.ok(Math.abs(bal[i] - expected) < 1e-6, `i=${i}: erwartet ${expected}, erhalten ${bal[i]}`);
  }
});

test("W'bal klemmt bei 0 und ueberschreitet W' bei Erholung nie", () => {
  const cp = 250;
  const wPrime = 20000;
  const depleteN = 1000; // weit mehr als noetig, um vollstaendig zu entladen
  const watts = new Float64Array(depleteN).fill(1000);
  const bal = wPrimeBalanceSkiba2015(watts, cp, wPrime);
  assert.equal(bal[depleteN - 1], 0);
});

test("Erholung unter CP naehert sich W' asymptotisch an, erreicht es aber nicht", () => {
  const cp = 250;
  const wPrime = 20000;
  const depleteN = 1000;
  const recoverN = 500;
  const watts = new Float64Array(depleteN + recoverN);
  for (let i = 0; i < depleteN; i++) watts[i] = 1000;
  // Rest bleibt 0 (Erholung)

  const bal = wPrimeBalanceSkiba2015(watts, cp, wPrime);

  let prevDiff = Infinity;
  for (let i = depleteN; i < bal.length; i++) {
    if (i > depleteN) {
      assert.ok(bal[i] >= bal[i - 1] - 1e-9, `W'bal muss waehrend der Erholung monoton steigen (i=${i})`);
    }
    const diff = wPrime - bal[i];
    assert.ok(diff >= 0, "W'bal darf W' nie ueberschreiten");
    if (i > depleteN) {
      assert.ok(diff <= prevDiff + 1e-9, `Abstand zu W' muss monoton kleiner werden (i=${i})`);
    }
    prevDiff = diff;
  }
  assert.ok(bal[bal.length - 1] < wPrime, "W'bal erreicht W' nach endlicher Erholungszeit nicht exakt");
});
