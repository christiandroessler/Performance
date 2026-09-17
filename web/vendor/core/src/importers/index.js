// Entwicklungs-/Testpfad FA-SYNC-06: Import aus dem Strava-Datenexport
// (Originaldateien), nicht Teil der Produktiv-UI. Reine Parser, kein Datei-IO -
// der Aufrufer (Node-Script, Browser-Drag&Drop) liest die Rohbytes/-texte.

export { parseActivitiesCsv } from './activitiesCsv.js';
export { parseGpx } from './gpx.js';
export { parseTcx } from './tcx.js';
export { parseFit } from './fit.js';

import { parseGpx } from './gpx.js';
import { parseTcx } from './tcx.js';
import { parseFit } from './fit.js';

/**
 * Waehlt den passenden Parser anhand des Dateinamens (inkl. `.gz`-Suffix, das
 * der Aufrufer vorher entpacken muss - siehe core/README.md).
 * @param {string} filename
 * @param {string|ArrayBuffer} content - Text fuer GPX/TCX, ArrayBuffer fuer FIT
 */
export function parseActivityFile(filename, content) {
  const lower = filename.toLowerCase().replace(/\.gz$/, '');
  if (lower.endsWith('.fit')) {
    if (typeof content === 'string') throw new Error('FIT-Dateien muessen als ArrayBuffer uebergeben werden');
    return parseFit(content);
  }
  if (lower.endsWith('.tcx')) return parseTcx(String(content));
  if (lower.endsWith('.gpx')) return parseGpx(String(content));
  throw new Error(`Unbekanntes Dateiformat: ${filename}`);
}
