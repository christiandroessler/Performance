import test from 'node:test';
import assert from 'node:assert/strict';
import { rampRate, sliceSeriesForRange } from '../src/pmcMath.js';

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

test('sliceSeriesForRange: "42"/"90"/"365" schneiden die letzten N Tage vom Ende ab', () => {
  const series = mkSeries(Array.from({ length: 500 }, (_, i) => i));
  assert.equal(sliceSeriesForRange(series, '42').length, 42);
  assert.equal(sliceSeriesForRange(series, '90').length, 90);
  assert.equal(sliceSeriesForRange(series, '365').length, 365);
  assert.equal(sliceSeriesForRange(series, '42')[41].ctl, 499); // letzter Eintrag bleibt der aktuellste
});

test('sliceSeriesForRange: "thisYear" behaelt nur Eintraege aus dem Jahr des letzten Datenpunkts', () => {
  const series = [
    { date: '2025-11-01', ctl: 1, atl: 0, tsb: 0 },
    { date: '2025-12-31', ctl: 2, atl: 0, tsb: 0 },
    { date: '2026-01-01', ctl: 3, atl: 0, tsb: 0 },
    { date: '2026-06-15', ctl: 4, atl: 0, tsb: 0 },
  ];
  const sliced = sliceSeriesForRange(series, 'thisYear');
  assert.deepEqual(sliced.map((s) => s.date), ['2026-01-01', '2026-06-15']);
});

test('sliceSeriesForRange: unbekannter/leerer range gibt die Serie unveraendert zurueck', () => {
  const series = mkSeries([1, 2, 3]);
  assert.equal(sliceSeriesForRange(series, ''), series);
  assert.equal(sliceSeriesForRange([], '90').length, 0);
});
