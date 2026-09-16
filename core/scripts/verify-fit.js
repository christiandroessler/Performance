// Prueft den FIT-Parser (src/importers/fit.js) gegen eine echte Geraetedatei
// (Garmin/Wahoo-Original-FIT, nicht Strava-Export-CSV/GPX), da der Parser
// bisher nur an einer synthetischen Testdatei verifiziert ist (siehe
// core/README.md, "Offene Punkte").
//
// Liest nur, schreibt nichts. Verarbeitet KEINE echten Trainingsdaten ins
// Repository (NFA-06) - dieses Skript gibt nur eine Zusammenfassung auf der
// Konsole aus, keine Rohdaten.
//
// Aufruf:
//   node scripts/verify-fit.js <pfad-zur-datei.fit>
//   node scripts/verify-fit.js <pfad-zur-datei.fit.gz>   (wird automatisch entpackt)

import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

import { parseFit } from '../src/importers/fit.js';
import { resampleTo1Hz } from '../src/streams.js';
import { detectOutliers, validPowerMask } from '../src/quality.js';
import { meanMaximalPowerForActivity } from '../src/mmp.js';
import { mergeSettings } from '../src/settings.js';

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Bitte Pfad zu einer .fit- oder .fit.gz-Datei angeben.');
    process.exit(1);
  }

  let buf = readFileSync(filePath);
  if (filePath.endsWith('.gz')) buf = zlib.gunzipSync(buf);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  console.log(`Datei: ${filePath} (${buf.byteLength} Bytes)`);

  const { startTime, points } = parseFit(arrayBuffer);
  console.log(`Start: ${startTime}`);
  console.log(`Rohpunkte (record-Meldungen): ${points.length}`);

  if (points.length === 0) {
    console.error('FEHLER: keine record-Punkte gefunden - Parser liefert leeres Ergebnis fuer diese Datei.');
    process.exit(1);
  }

  const withPower = points.filter((p) => p.watts != null);
  const withHr = points.filter((p) => p.heartrate != null);
  const withCadence = points.filter((p) => p.cadence != null);
  console.log(`  davon mit Leistung: ${withPower.length}`);
  console.log(`  davon mit Herzfrequenz: ${withHr.length}`);
  console.log(`  davon mit Kadenz: ${withCadence.length}`);

  if (withPower.length > 0) {
    const watts = withPower.map((p) => p.watts);
    const min = Math.min(...watts);
    const max = Math.max(...watts);
    const avg = watts.reduce((s, w) => s + w, 0) / watts.length;
    console.log(`  Leistung: min ${min} W, max ${max} W, mittel ${avg.toFixed(0)} W`);
    if (max > 3000 || min < 0) {
      console.warn('  WARNUNG: unplausible Leistungswerte - Feldnummern/Skalierung pruefen.');
    }
  }

  const tSorted = [...points].sort((a, b) => a.t - b.t);
  const durationS = tSorted[tSorted.length - 1].t - tSorted[0].t;
  console.log(`Dauer (aus Zeitstempeln): ${(durationS / 60).toFixed(1)} min`);

  // Durch den restlichen M1-Pfad schicken, um Folgefehler (Resampling, MMP) auszuschliessen.
  const settings = mergeSettings();
  const stream = resampleTo1Hz(points);
  detectOutliers(stream, settings);
  const mask = validPowerMask(stream);
  const validCount = Array.from(mask).reduce((s, v) => s + v, 0);
  console.log(`Nach 1-Hz-Resampling: ${stream.n} Sekunden, davon ${validCount} mit gueltiger Leistung`);

  if (withPower.length > 0) {
    const mmp = meanMaximalPowerForActivity(stream, mask);
    const mmp5 = mmp.find((m) => m.t === 5);
    const mmp60 = mmp.find((m) => m.t === 60);
    const mmp300 = mmp.find((m) => m.t === 300);
    console.log(
      'MMP-Stichproben:',
      mmp5 ? `5s=${mmp5.watts}W` : '5s=n/a',
      mmp60 ? `60s=${mmp60.watts}W` : '60s=n/a',
      mmp300 ? `300s=${mmp300.watts}W` : '300s=n/a'
    );
  }

  console.log('\nFertig, kein Absturz. Bitte pruefen, ob die obigen Werte (Dauer, Leistung, HF, Kadenz) mit der echten Aktivitaet uebereinstimmen.');
}

main();
