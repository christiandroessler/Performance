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

/**
 * Nur den ANZEIGE-Ausschnitt des PMC-Charts einschraenken (letzte 42/90/365 Tage oder aktuelles
 * Kalenderjahr) - NICHT die Eingabedaten fuer computeCTLATL selbst filtern: CTL/ATL sind gleitende
 * Mittelwerte, die die GESAMTE Vorgeschichte brauchen, um am aktuellen Tag korrekt zu sein. Ein
 * verkuerzter Eingabezeitraum wuerde falsche (zu niedrige) CTL/ATL-Werte am Fensterrand erzeugen.
 */
export function sliceSeriesForRange(series, range) {
  if (!series || series.length === 0) return series;
  if (range === 'thisYear') {
    const year = series[series.length - 1].date.slice(0, 4);
    return series.filter((s) => s.date.slice(0, 4) === year);
  }
  const days = Number(range);
  if (!days) return series;
  return series.slice(-days);
}
