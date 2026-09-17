import test from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, addDays, monthsAgo, groupByWeek, groupByMonth, groupByDay } from '../src/calendarUtils.js';

test('mondayOf: liefert den Montag der ISO-Woche, unabhaengig vom Wochentag', () => {
  assert.equal(mondayOf('2026-09-17'), '2026-09-14'); // Donnerstag -> Montag derselben Woche
  assert.equal(mondayOf('2026-09-14'), '2026-09-14'); // Montag selbst
  assert.equal(mondayOf('2026-09-20'), '2026-09-14'); // Sonntag -> Montag derselben Woche
});

test('addDays: addiert/subtrahiert Kalendertage ueber Monatsgrenzen hinweg', () => {
  assert.equal(addDays('2026-09-14', 6), '2026-09-20');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
});

test('groupByWeek: summiert TSS/Dauer/Distanz und zaehlt Einheiten je Sportart pro ISO-Woche, neueste zuerst', () => {
  const activities = [
    { date: '2026-09-14', type: 'Ride', tss: 50, movingTimeSec: 3600, distanceM: 30000 },
    { date: '2026-09-16', type: 'Ride', tss: 30, movingTimeSec: 1800, distanceM: 15000 },
    { date: '2026-09-20', type: 'Run', tss: 40, movingTimeSec: 2400, distanceM: 8000 },
    { date: '2026-09-21', type: 'Ride', tss: 60, movingTimeSec: 5400, distanceM: 40000 }, // naechste Woche (Montag 21.)
  ];
  const weeks = groupByWeek(activities);

  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].weekStart, '2026-09-21'); // neueste zuerst
  assert.equal(weeks[1].weekStart, '2026-09-14');

  const w1 = weeks[1];
  assert.equal(w1.totalTss, 120);
  assert.equal(w1.totalDurationSec, 7800);
  assert.equal(w1.totalDistanceM, 53000);
  assert.deepEqual(w1.countsByType, { Ride: 2, Run: 1 });
});

test('groupByWeek: Aktivitaeten ohne TSS (null) tragen 0 zur Summe bei, blockieren sie aber nicht', () => {
  const activities = [
    { date: '2026-09-14', type: 'Ride', tss: 50, movingTimeSec: 3600 },
    { date: '2026-09-15', type: 'Ride', tss: null, movingTimeSec: 1200 },
  ];
  const weeks = groupByWeek(activities);
  assert.equal(weeks[0].totalTss, 50);
  assert.equal(weeks[0].countsByType.Ride, 2);
});

test('monthsAgo: rechnet Kalendermonate zurueck, auch ueber Jahresgrenzen', () => {
  assert.equal(monthsAgo('2026-09-17', 12), '2025-09-17');
  assert.equal(monthsAgo('2026-01-15', 1), '2025-12-15');
});

test('groupByMonth: summiert TSS/Dauer/Distanz und zaehlt Einheiten je Sportart pro Kalendermonat, neueste zuerst', () => {
  const activities = [
    { date: '2026-07-05', type: 'Ride', tss: 50, movingTimeSec: 3600, distanceM: 30000 },
    { date: '2026-07-20', type: 'Run', tss: 30, movingTimeSec: 1800, distanceM: 8000 },
    { date: '2026-08-01', type: 'Ride', tss: 40, movingTimeSec: 2400, distanceM: 20000 },
  ];
  const months = groupByMonth(activities);
  assert.equal(months.length, 2);
  assert.equal(months[0].month, '2026-08'); // neueste zuerst
  assert.equal(months[1].month, '2026-07');
  assert.equal(months[1].totalTss, 80);
  assert.equal(months[1].totalDistanceM, 38000);
  assert.deepEqual(months[1].countsByType, { Ride: 1, Run: 1 });
});

test('groupByDay: gruppiert nach Kalendertag und summiert TSS', () => {
  const activities = [
    { date: '2026-09-14', type: 'Ride', tss: 50 },
    { date: '2026-09-14', type: 'Run', tss: 20 },
    { date: '2026-09-15', type: 'Ride', tss: 30 },
  ];
  const days = groupByDay(activities);
  assert.equal(days.size, 2);
  assert.equal(days.get('2026-09-14').totalTss, 70);
  assert.equal(days.get('2026-09-14').activities.length, 2);
  assert.equal(days.get('2026-09-15').totalTss, 30);
});
