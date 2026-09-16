// Entwicklungs-/Testskript fuer FA-SYNC-06 (M1-Abnahme: "Der vollstaendige
// Strava-Export des Auftraggebers laeuft durch"). Liest einen entpackten
// Strava-Datenexport, verarbeitet alle Rad-Aktivitaeten mit Leistung durch
// den Rechenkern und gibt eine Zusammenfassung aus.
//
// Aufruf:
//   node scripts/run-export.js <Pfad-zum-entpackten-Export>
//
// Der Export-Ordner enthaelt nach dem Entpacken u. a. `activities.csv` und
// einen `activities/`-Unterordner mit den Originaldateien (.fit, .fit.gz,
// .gpx, .gpx.gz, .tcx, .tcx.gz).
//
// WICHTIG (NFA-06): Echte Trainingsdaten duerfen nicht ins Repository
// committet werden. Diesen Export daher NICHT unter core/ ablegen, oder
// zumindest sicherstellen, dass der Ordner in .gitignore steht (siehe
// ../../.gitignore, Eintrag `**/local-data/`).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

import { prepareActivity } from '../src/activity.js';
import { computeSignatureHistory } from '../src/signature.js';
import { mergeSettings } from '../src/settings.js';
import { parseActivitiesCsv, parseActivityFile } from '../src/importers/index.js';

const gunzip = promisify(zlib.gunzip);

async function main() {
  const exportRoot = process.argv[2];
  if (!exportRoot) {
    console.error('Aufruf: node scripts/run-export.js <Pfad-zum-entpackten-Strava-Export>');
    process.exit(1);
  }

  const csvPath = path.join(exportRoot, 'activities.csv');
  const csvText = await readFile(csvPath, 'utf8');
  const rows = parseActivitiesCsv(csvText);
  console.log(`activities.csv: ${rows.length} Eintraege`);

  const rideRows = rows.filter((r) => r.filename && /ride/i.test(r.type || ''));
  console.log(`davon Rad-Aktivitaeten mit Originaldatei: ${rideRows.length}`);

  const settings = mergeSettings();
  const raw = [];
  let skippedMissingFile = 0;
  let skippedParseError = 0;
  let skippedNoPower = 0;

  for (const row of rideRows) {
    const filePath = path.join(exportRoot, row.filename);
    let buf;
    try {
      buf = await readFile(filePath);
    } catch {
      skippedMissingFile++;
      continue;
    }

    let name = row.filename;
    if (name.toLowerCase().endsWith('.gz')) {
      try {
        buf = await gunzip(buf);
      } catch (err) {
        console.warn(`gzip-Fehler bei ${row.filename}: ${err.message}`);
        skippedParseError++;
        continue;
      }
      name = name.slice(0, -3);
    }

    try {
      const isFit = name.toLowerCase().endsWith('.fit');
      const content = isFit
        ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        : buf.toString('utf8');
      const parsed = parseActivityFile(name, content);

      const hasPower = parsed.points.some((p) => p.deviceWatts);
      if (!hasPower || !parsed.startTime) {
        skippedNoPower++;
        continue;
      }

      raw.push({
        id: row.id,
        date: parsed.startTime.slice(0, 10),
        startTime: parsed.startTime,
        points: parsed.points,
      });
    } catch (err) {
      console.warn(`Parse-Fehler bei ${row.filename}: ${err.message}`);
      skippedParseError++;
    }
  }

  console.log(
    `geladen: ${raw.length}, uebersprungen: ${skippedMissingFile} fehlende Datei, ` +
      `${skippedParseError} Parse-Fehler, ${skippedNoPower} ohne Leistungsdaten`
  );

  if (raw.length === 0) {
    console.error('Keine verwertbaren Aktivitaeten gefunden - Abbruch.');
    process.exit(1);
  }

  console.log('Bereite Aktivitaeten auf (1-Hz-Resampling, Ausreisserfilter, MMP) ...');
  const prepareStart = Date.now();
  const prepared = raw.map((r) => prepareActivity(r, settings));
  console.log(`Aufbereitung: ${Date.now() - prepareStart} ms`);

  console.log('Berechne Signaturverlauf ...');
  const computeStart = Date.now();
  const history = computeSignatureHistory(prepared, { settings });
  const computeMs = Date.now() - computeStart;
  console.log(`Signaturberechnung: ${computeMs} ms fuer ${prepared.length} Aktivitaeten`);

  console.log('\n--- Zusammenfassung ---');
  if (history.needsMoreData) {
    console.log(`Keine Startsignatur moeglich: ${history.initial.reason}`);
  } else {
    console.log(`Startsignatur gueltig ab ${history.initial.effectiveDate}:`, history.initial.signature);
    console.log(`Signatur-Verlaufseintraege: ${history.history.length}`);
    console.log(`Erkannte Breakthroughs: ${history.breakthroughs.length}`);
    const medals = { gold: 0, silver: 0, bronze: 0 };
    for (const b of history.breakthroughs) if (b.medal) medals[b.medal]++;
    console.log('Medaillen:', medals);
    const last = history.history[history.history.length - 1];
    console.log('Aktuelle Signatur:', last);

    const totalContradictions = history.activityResults.reduce(
      (sum, a) => sum + (a.twoParamContradictions ? a.twoParamContradictions.length : 0),
      0
    );
    console.log(`2-Parameter-Widersprueche (FA-SIG-14, nur Protokoll): ${totalContradictions}`);
  }

  console.log('\nFertig, kein Absturz.');
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
