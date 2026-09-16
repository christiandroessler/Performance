// Entwicklungs-/Testpfad, ABWEICHEND von FA-SYNC-06: statt eines frischen
// Strava-Datenexports liest dieses Skript direkt die SQLite-Datenbank der
// bestehenden `strava-dashboard`-Anwendung (Kap. 2 "Ausgangslage") und lässt
// den kompletten Aktivitätsbestand durch den neuen Rechenkern laufen. Nur zum
// schnellen Gegenpruefen waehrend der Entwicklung - der Datenexport-Pfad
// (scripts/run-export.js) bleibt der eigentliche M1-Testpfad, weil er auch
// ohne die alte App funktioniert und naeher am Produktivpfad (Strava-API) ist.
//
// Liest read-only, schreibt nichts in strava-dashboard/data.db.
//
// Aufruf:
//   node scripts/run-legacy-db.js [Pfad-zu-data.db] [--user <id>]
//
// Ohne Pfad wird ../../../strava-dashboard/data.db relativ zu diesem Skript
// angenommen (Standard-Repo-Layout).

import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import path from 'node:path';
import os from 'node:os';

import { detectOutliers, validPowerMask, wattsForRecovery } from '../src/quality.js';
import { meanMaximalPowerForActivity } from '../src/mmp.js';
import { computeSignatureHistory } from '../src/signature.js';
import { mergeSettings } from '../src/settings.js';
import { mpaTrace } from '../src/mpa.js';
import { computeStrainScore } from '../src/strain.js';

function parseArgs(argv) {
  const args = { dbPath: null, userId: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--user') args.userId = Number(argv[++i]);
    else if (!args.dbPath) args.dbPath = argv[i];
  }
  return args;
}

function loadStream(row) {
  const json = zlib.gunzipSync(row.data).toString('utf-8');
  const parsed = JSON.parse(json);
  if (Array.isArray(parsed)) {
    return { n: parsed.length, watts: parsed, heartrate: null, cadence: null, moving: null };
  }
  return parsed;
}

/** Baut einen Stream1Hz direkt aus dem bereits lueckenlosen v1/v2-Kanal-Objekt
 * der Altanwendung (siehe strava-dashboard/lib/streams.js): kleine Luecken
 * (<=5s) sind dort schon interpoliert, echte Pausen (>5s) sind als watts=0,
 * moving=0 markiert - das entspricht genau unserem `gap`-Konzept (FA-DQ-02). */
function toStream1Hz(channels) {
  const n = channels.n;
  const stream = {
    n,
    watts: new Float64Array(n),
    hasWatts: new Uint8Array(n).fill(1),
    deviceWatts: new Uint8Array(n).fill(1), // has_power=1 wurde bereits beim Sync gegen device_watts geprueft
    heartrate: new Float64Array(n),
    hasHeartrate: new Uint8Array(n),
    cadence: new Float64Array(n),
    velocity: new Float64Array(n),
    gap: new Uint8Array(n),
    outlier: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    stream.watts[i] = channels.watts[i] || 0;
    if (channels.moving && channels.moving[i] === 0) stream.gap[i] = 1;
    if (channels.heartrate && channels.heartrate[i] != null) {
      stream.heartrate[i] = channels.heartrate[i];
      stream.hasHeartrate[i] = 1;
    }
    if (channels.cadence && channels.cadence[i] != null) stream.cadence[i] = channels.cadence[i];
  }
  return stream;
}

function prepareLegacyActivity(a, channels, settings) {
  const stream = toStream1Hz(channels);
  detectOutliers(stream, settings);
  const mask = validPowerMask(stream);
  const recoveryWatts = wattsForRecovery(stream);
  const mmp = meanMaximalPowerForActivity(stream, mask);
  const startTime = a.start_date;
  const date = (a.start_date_local || a.start_date || '').slice(0, 10);
  const endTime = new Date(new Date(startTime).getTime() + stream.n * 1000).toISOString();
  return { id: String(a.strava_id), date, startTime, endTime, stream, mask, recoveryWatts, mmp };
}

function main() {
  const { dbPath: argPath, userId: argUserId } = parseArgs(process.argv.slice(2));
  const dbPath = argPath || path.resolve(import.meta.dirname, '../../../strava-dashboard/data.db');

  console.log(`Oeffne (read-only) ${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const users = db.prepare('SELECT id, name, strava_athlete_id FROM users').all();
  if (users.length === 0) {
    console.error('Keine Benutzer in der Datenbank gefunden.');
    process.exit(1);
  }
  let userId = argUserId;
  if (!userId) {
    if (users.length > 1) {
      console.log('Mehrere Benutzer gefunden, bitte mit --user <id> waehlen:');
      for (const u of users) console.log(`  ${u.id}: ${u.name} (Strava-Athlet ${u.strava_athlete_id})`);
      process.exit(1);
    }
    userId = users[0].id;
  }
  console.log(`Benutzer: ${userId} (${users.find((u) => u.id === userId)?.name || '?'})`);

  const activities = db
    .prepare('SELECT strava_id, start_date, start_date_local, sport_type, has_power FROM activities WHERE user_id = ? AND has_power = 1 ORDER BY start_date ASC')
    .all(userId);
  console.log(`Rad-Aktivitaeten mit Leistung (has_power=1): ${activities.length}`);

  const streamStmt = db.prepare('SELECT data FROM streams WHERE strava_id = ?');
  const settings = mergeSettings();

  const prepared = [];
  let skippedNoStream = 0;
  for (const a of activities) {
    const row = streamStmt.get(a.strava_id);
    if (!row) {
      skippedNoStream++;
      continue;
    }
    let channels;
    try {
      channels = loadStream(row);
    } catch (err) {
      console.warn(`Stream-Fehler bei ${a.strava_id}: ${err.message}`);
      skippedNoStream++;
      continue;
    }
    if (!channels.n || !channels.watts || channels.watts.length === 0) {
      skippedNoStream++;
      continue;
    }
    prepared.push(prepareLegacyActivity(a, channels, settings));
  }
  console.log(`geladen: ${prepared.length}, uebersprungen ohne Stream: ${skippedNoStream}`);

  if (prepared.length === 0) {
    console.error('Keine verwertbaren Aktivitaeten - Abbruch.');
    process.exit(1);
  }

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
    console.log('Aktuelle Signatur:', history.history[history.history.length - 1]);

    const flagged = history.breakthroughs.filter((b) => b.constraintUnsatisfied);
    if (flagged.length) {
      console.log(
        `\nWARNUNG: ${flagged.length} Breakthrough(s) mit constraintUnsatisfied=true ` +
          `(Pmax-Nebenbedingung nicht erfuellbar, moeglicher Datenqualitaetsfehler in der Aktivitaet). ` +
          `Betroffene Aktivitaets-IDs:`
      );
      for (const b of flagged) console.log(`  ${b.activityId} (${b.date})`);
    }

    const totalContradictions = history.activityResults.reduce(
      (sum, r) => sum + (r.twoParamContradictions ? r.twoParamContradictions.length : 0),
      0
    );
    console.log(`2-Parameter-Widersprueche (FA-SIG-14, nur Protokoll): ${totalContradictions}`);

    // NFA-04: Neuberechnung einer einzelnen Aktivitaet (>= 6h gefordert) isoliert
    // timen, mehrfach wiederholt und mit hochaufloesender Uhr (process.hrtime),
    // da Date.now() bei Einzelmessungen im 1-2 ms Bereich stark rauscht.
    const sixHourCandidates = prepared.filter((a) => a.stream.n >= 6 * 3600);
    const longest = prepared.reduce((max, a) => (a.stream.n > max.stream.n ? a : max), prepared[0]);
    const target = sixHourCandidates.length > 0 ? sixHourCandidates[0] : longest;
    const sig = history.history[history.history.length - 1];
    const sigForTrace = { cp: sig.cp, wPrimeJ: sig.wPrimeJ, pMax: sig.pMax, n: settings.mpaExponent };

    const REPEATS = 30;
    const timingsMs = [];
    for (let i = 0; i < REPEATS; i++) {
      const t0 = process.hrtime.bigint();
      const { mpa } = mpaTrace(target.recoveryWatts, sigForTrace);
      computeStrainScore(target.recoveryWatts, mpa, sig.cp, sig.pMax);
      const t1 = process.hrtime.bigint();
      timingsMs.push(Number(t1 - t0) / 1e6);
    }
    timingsMs.sort((a, b) => a - b);
    const min = timingsMs[0];
    const median = timingsMs[Math.floor(timingsMs.length / 2)];
    const max = timingsMs[timingsMs.length - 1];

    console.log(
      `\nNFA-04-Messung (Ziel <= 2000 ms fuer eine einzelne Aktivitaet >= 6h):\n` +
        `  Aktivitaet: ${target.id} (${target.date}), Dauer ${(target.stream.n / 3600).toFixed(1)} h` +
        `${sixHourCandidates.length === 0 ? ' (kein >=6h-Kandidat im Bestand, laengste verfuegbare Aktivitaet verwendet)' : ''}\n` +
        `  MPA+W'bal+Strain-Neuberechnung, ${REPEATS} Wiederholungen: ` +
        `min ${min.toFixed(2)} ms / median ${median.toFixed(2)} ms / max ${max.toFixed(2)} ms\n` +
        `  Hardware: ${os.cpus()[0]?.model || '?'} (${os.cpus().length} Kerne), ` +
        `Node ${process.version}, ${os.platform()}/${os.arch()}`
    );
  }

  console.log('\nFertig, kein Absturz.');
}

main();
