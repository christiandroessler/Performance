// Reine Hilfsfunktion fuer die "Fitness Ramp Rates" (TrainingPeaks-Vorbild,
// Uebersicht-Redesign 2026-09): CTL-Veraenderung ueber die letzten N Tage.
// series: chronologisch aufsteigende Liste von {date, ctl, atl, tsb}
// (Ausgabe von core/src/index.js#computeCTLATL, siehe pmcView.js).

/** CTL heute minus CTL vor `days` Tagen, oder null, wenn die Serie dafuer nicht weit genug zurueckreicht. */
export function rampRate(series, days) {
  if (!series || series.length <= days) return null;
  const latest = series[series.length - 1];
  const prev = series[series.length - 1 - days];
  return Math.round((latest.ctl - prev.ctl) * 10) / 10;
}
