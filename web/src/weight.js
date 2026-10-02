// Gewicht zu einem Datum (FA-MET-01). Vorher dreifach kopiert in activityDetailView.js,
// powerCurveView.js und metabolicView.js (docs/MODULE.md P-03); rein, ohne DOM, testbar.

/**
 * Letzter Gewichtsverlaufseintrag <= date; gibt es keinen, das aktuelle Gewicht (`weightKg`).
 * Ohne Einstellungen: null.
 * @param {{ weightKg?: number|null, weightHistory?: { date: string, kg: number }[] }|null|undefined} settings
 * @param {string} date - YYYY-MM-DD
 * @returns {number|null|undefined}
 */
export function weightAtDate(settings, date) {
  const history = (settings && settings.weightHistory) || [];
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let w = settings ? settings.weightKg : null;
  for (const entry of sorted) {
    if (entry.date <= date) w = entry.kg;
    else break;
  }
  return w;
}
