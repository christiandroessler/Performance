// Buendelt Resampling, Datenqualitaet und MMP-Extraktion zu einer aufbereiteten
// Aktivitaet, wie sie signature.js und die npTss/strain-Module erwarten.

import { resampleTo1Hz } from './streams.js';
import { detectOutliers, validPowerMask, wattsForRecovery } from './quality.js';
import { meanMaximalPowerForActivity } from './mmp.js';

/**
 * @param {Object} raw
 * @param {string} raw.id
 * @param {string} raw.date - YYYY-MM-DD (Kalendertag, fuer die chronologische Signatur-Zuordnung)
 * @param {string} raw.startTime - ISO-8601-Zeitstempel (fuer W'bal-Kontinuitaet zwischen Aktivitaeten)
 * @param {import('./types.js').RawStreamPoint[]} raw.points
 * @param {import('./types.js').ModelSettings} settings
 */
export function prepareActivity(raw, settings) {
  const stream = resampleTo1Hz(raw.points);
  detectOutliers(stream, settings);
  const mask = validPowerMask(stream);
  const recoveryWatts = wattsForRecovery(stream);
  const mmp = meanMaximalPowerForActivity(stream, mask);
  const endTime = new Date(new Date(raw.startTime).getTime() + stream.n * 1000).toISOString();

  return {
    id: raw.id,
    date: raw.date,
    startTime: raw.startTime,
    endTime,
    stream,
    mask,
    recoveryWatts,
    mmp,
  };
}
