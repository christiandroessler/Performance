// Gemeinsame Formatierungsfunktionen fuer Dauer/Distanz, bisher in mehreren Views dupliziert
// (activityListView.js, activityDetailView.js, weekView.js, dashboardExtras.js) - an einer Stelle,
// damit ein Fix (s. u.) nicht mehrfach nachgezogen werden muss. Rein, ohne Browser-Abhaengigkeit,
// testbar mit node:test.

/** "1h 32min" bzw. "45min". Rundet zuerst auf ganze Minuten, DANACH in Stunden/Minuten - eine direkte
 *  Rundung von "Minutenanteil an der Stunde" haette bei z. B. 3599s "1h 60min" statt "1h 0min" ergeben. */
export function formatDuration(sec) {
  if (!sec) return '-';
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** "50.3 km" - eine Nachkommastelle, wie in Strava/TrainingPeaks ueblich. */
export function formatDistance(m) {
  if (!m) return '-';
  return `${(m / 1000).toFixed(1)} km`;
}
