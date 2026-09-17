import test from 'node:test';
import assert from 'node:assert/strict';
import { rampRate } from '../src/pmcMath.js';

function mkSeries(ctlValues) {
  return ctlValues.map((ctl, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, ctl, atl: 0, tsb: 0 }));
}

test('rampRate: liefert null, wenn die Serie nicht weit genug zurueckreicht', () => {
  const series = mkSeries([10, 20, 30]);
  assert.equal(rampRate(series, 7), null);
  assert.equal(rampRate(series, 3), null); // laenge 3, series.length <= days
});

test('rampRate: CTL heute minus CTL vor N Tagen, gerundet auf eine Nachkommastelle', () => {
  const series = mkSeries([10, 11, 12.34, 14, 16.789]);
  assert.equal(rampRate(series, 1), 2.8); // 16.789 - 14 = 2.789 -> 2.8
  assert.equal(rampRate(series, 4), 6.8); // 16.789 - 10 = 6.789 -> 6.8
});

test('rampRate: leere oder fehlende Serie liefert null', () => {
  assert.equal(rampRate([], 7), null);
  assert.equal(rampRate(null, 7), null);
});
