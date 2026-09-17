// FA-TP-07: reine Datums-/Aggregations-Helfer fuer die Wochen- und
// Kalenderuebersicht, ohne Browser-Abhaengigkeit (testbar mit node:test, wie
// chartUtils.js/syncEngine.js). Rechnet ausschliesslich mit UTC-Daten, damit
// "YYYY-MM-DD"-Datumsstrings unabhaengig von der lokalen Zeitzone konsistent
// bleiben (keine Verschiebung um einen Tag).

/** Montag der ISO-Woche, die dateStr ("YYYY-MM-DD") enthaelt. */
export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=So..6=Sa
  const diff = (day + 6) % 7; // Tage seit Montag
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** dateStr, n Kalendermonate zurueck (fuer "bis 12 Monate zurueck"-Grenzen). */
export function monthsAgo(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

/** Aktivitaeten nach ISO-Woche gruppiert, neueste zuerst. TSS/Dauer summiert, Anzahl je Sportart. */
export function groupByWeek(activities) {
  const weeks = new Map();
  for (const a of activities) {
    const weekStart = mondayOf(a.date);
    if (!weeks.has(weekStart)) {
      weeks.set(weekStart, { weekStart, weekEnd: addDays(weekStart, 6), totalTss: 0, totalDurationSec: 0, countsByType: {}, activities: [] });
    }
    const w = weeks.get(weekStart);
    w.totalTss += a.tss || 0;
    w.totalDurationSec += a.movingTimeSec || 0;
    w.countsByType[a.type] = (w.countsByType[a.type] || 0) + 1;
    w.activities.push(a);
  }
  return [...weeks.values()].sort((x, y) => y.weekStart.localeCompare(x.weekStart));
}

/** Aktivitaeten nach Kalendermonat gruppiert ("YYYY-MM"), neueste zuerst - fuer die Monatsansicht jenseits der letzten 4 Wochen. */
export function groupByMonth(activities) {
  const months = new Map();
  for (const a of activities) {
    const monthKey = a.date.slice(0, 7);
    if (!months.has(monthKey)) {
      months.set(monthKey, { month: monthKey, totalTss: 0, totalDurationSec: 0, countsByType: {}, activities: [] });
    }
    const m = months.get(monthKey);
    m.totalTss += a.tss || 0;
    m.totalDurationSec += a.movingTimeSec || 0;
    m.countsByType[a.type] = (m.countsByType[a.type] || 0) + 1;
    m.activities.push(a);
  }
  return [...months.values()].sort((x, y) => y.month.localeCompare(x.month));
}

/** Aktivitaeten nach Kalendertag gruppiert (Map "YYYY-MM-DD" -> {date, totalTss, activities}). */
export function groupByDay(activities) {
  const days = new Map();
  for (const a of activities) {
    if (!days.has(a.date)) days.set(a.date, { date: a.date, totalTss: 0, activities: [] });
    const d = days.get(a.date);
    d.totalTss += a.tss || 0;
    d.activities.push(a);
  }
  return days;
}
