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

/** "4:30 min/km" aus einer Geschwindigkeit in m/s (FA-TP-03: Lauf-Schwellenpace). */
export function formatPacePerKm(speedMs) {
  if (!speedMs) return '-';
  return `${formatMinSec(1000 / speedMs)} min/km`;
}

/** "1:45 min/100m" aus einer Geschwindigkeit in m/s (FA-TP-03: Schwimm-Schwellenpace). */
export function formatPacePer100m(speedMs) {
  if (!speedMs) return '-';
  return `${formatMinSec(100 / speedMs)} min/100m`;
}

function formatMinSec(totalSeconds) {
  const totalSecRounded = Math.round(totalSeconds);
  const m = Math.floor(totalSecRounded / 60);
  const s = totalSecRounded % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
