// Reine Filterlogik fuer die Aktivitaetsliste (Suche + Sportart/Zeitraum) -
// ohne Browser-Abhaengigkeit, testbar mit node:test.

export function filterActivities(activities, { query, type, fromDate, toDate } = {}) {
  const q = (query || '').trim().toLowerCase();
  return activities.filter((a) => {
    if (type && a.type !== type) return false;
    if (fromDate && a.date < fromDate) return false;
    if (toDate && a.date > toDate) return false;
    if (q && !(a.name || '').toLowerCase().includes(q)) return false;
    return true;
  });
}
