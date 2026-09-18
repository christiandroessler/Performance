import test from 'node:test';
import assert from 'node:assert/strict';
import { measuredFiveSecPowerAtDate, ppPlausibility } from '../src/ppCheck.js';

function curve(date, activityId, watts5s) {
  return { date, activityId, mmp: [{ t: 5, watts: watts5s }] };
}

test('measuredFiveSecPowerAtDate: bestes 5s ueber alle Aktivitaeten bis einschliesslich dem Datum', () => {
  const curves = [curve('2026-01-01', 'a', 800), curve('2026-02-01', 'b', 950), curve('2026-03-01', 'c', 700)];
  assert.equal(measuredFiveSecPowerAtDate(curves, '2026-02-01').watts, 950);
  assert.equal(measuredFiveSecPowerAtDate(curves, '2026-01-15').watts, 800); // 'b' liegt noch in der Zukunft
});

test('measuredFiveSecPowerAtDate: keine Kurven vor dem Datum ergibt null', () => {
  const curves = [curve('2026-05-01', 'a', 800)];
  assert.equal(measuredFiveSecPowerAtDate(curves, '2026-01-01'), null);
  assert.equal(measuredFiveSecPowerAtDate([], '2026-01-01'), null);
});

test('ppPlausibility: Abweichung in Watt und Prozent, gerundet', () => {
  const curves = [curve('2026-01-01', 'a', 950)];
  const result = ppPlausibility({ date: '2026-06-01', pMax: 1000 }, curves);
  assert.equal(result.measuredWatts, 950);
  assert.equal(result.deviationWatts, -50);
  assert.equal(result.deviationPct, -0.05);
});

test('ppPlausibility: ohne Messung bleiben alle Felder null', () => {
  const result = ppPlausibility({ date: '2026-01-01', pMax: 1000 }, []);
  assert.deepEqual(result, { measuredWatts: null, measuredDate: null, deviationWatts: null, deviationPct: null });
});
