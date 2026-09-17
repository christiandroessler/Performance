// Sync-Orchestrierung (Kap. 5.3, FA-SYNC-01 bis 05).
//
// Zwei Phasen pro Lauf: (1) Aktivitaetsliste vom Worker abfragen (paginiert),
// (2) je neuer Aktivitaet die Streams laden und ins Monatsbuendel schreiben.
// Der Fortschritt liegt serverseitig beim Worker (FA-SYNC-03: ueberlebt das
// Schliessen des Browsers), `index.json` in Drive ist die dauerhafte Quelle
// dafuer, was bereits vollstaendig importiert ist (FA-SYNC-02: keine
// Doppelimporte, auch bei mehrfachem Fortsetzen). Bei 429 (Drosselung,
// FA-SYNC-04) wird der Lauf angehalten und der Fortschritt gespeichert - ein
// spaeterer Aufruf (gleicher Tag oder naechster Tag) setzt exakt dort fort.
//
// Modellberechnung (Signaturverlauf, Kennzahlen) ist hier bewusst NICHT
// enthalten - das ist M3-Scope (dort auch UI-seitig gegen M1 verifiziert),
// siehe README. M2 legt nur Rohdaten ab (5.2: index.json Metadaten,
// streams/YYYY-MM.bin).

import { fetchActivities, fetchStreams, getSyncProgress, putSyncProgress } from './api.js';
import { readJson, writeJson, readFile, writeFile } from './storage.js';
import { encodeBundle, decodeBundle, monthKeyFor, streamFileName, activityBundleFromStravaStreams } from './streamCodec.js';

const INDEX_FILE = 'index.json';
const PER_PAGE = 100;
const DESKTOP_MIN_WIDTH = 900;

/** FA-SYNC-05: Erstimport nur in der Desktop-Ansicht startbar. */
export function isDesktopViewport() {
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

export async function loadIndex() {
  const idx = await readJson(INDEX_FILE);
  return idx || { schemaVersion: 1, lastSyncAt: null, activities: [] };
}

async function saveIndex(index) {
  await writeJson(INDEX_FILE, index);
}

function windowStartEpoch(days) {
  if (!days || days === 'all') return null;
  return Math.floor(Date.now() / 1000) - days * 86400;
}

function lastKnownEpoch(index) {
  if (index.activities.length === 0) return null;
  const last = index.activities[index.activities.length - 1];
  return Math.floor(new Date(last.startTime).getTime() / 1000);
}

function statusOf(progress, index) {
  return {
    mode: progress.mode,
    listingDone: progress.listingDone,
    discovered: progress.discoveredCount,
    remaining: progress.queue.length,
    storedTotal: index.activities.length,
  };
}

async function appendActivityToBundle(meta, stravaStreams) {
  const monthKey = monthKeyFor(meta.startTime);
  const fileName = streamFileName(monthKey);
  const existing = await readFile(fileName);
  const bundle = existing ? await decodeBundle(existing) : { month: monthKey, activities: {} };
  bundle.activities[meta.id] = activityBundleFromStravaStreams(stravaStreams, {
    startTime: meta.startTime,
    deviceWatts: meta.deviceWatts,
  });
  const encoded = await encodeBundle(bundle);
  await writeFile(fileName, 'application/gzip', encoded);
}

/**
 * Fuehrt einen Sync-Lauf aus (Erstimport, falls noch nichts importiert ist,
 * sonst inkrementell). Ruft `onProgress(status)` nach jedem Arbeitsschritt
 * auf. `firstImportWindowDays`: 30 | 90 | 365 | 'all' - nur fuer den
 * allerersten Lauf relevant, danach wird der Fortschritt/die Grenze aus dem
 * gespeicherten Zustand uebernommen.
 */
export async function runSync({ firstImportWindowDays } = {}, onProgress = () => {}) {
  const index = await loadIndex();
  const doneIds = new Set(index.activities.map((a) => a.id));

  let progress = await getSyncProgress();
  if (!progress) {
    const isFirstImport = index.activities.length === 0;
    if (isFirstImport && !isDesktopViewport()) {
      return { status: 'blocked', reason: 'desktop_only' };
    }
    progress = {
      mode: isFirstImport ? 'first_import' : 'incremental',
      afterEpoch: isFirstImport ? windowStartEpoch(firstImportWindowDays) : lastKnownEpoch(index),
      listingDone: false,
      nextPage: 1,
      queue: [],
      discoveredCount: 0,
    };
  }

  while (!progress.listingDone) {
    const res = await fetchActivities(progress.afterEpoch, progress.nextPage);
    if (res.rateLimited) {
      await putSyncProgress(progress);
      onProgress({ ...statusOf(progress, index), paused: true, reason: res.error });
      return { status: 'paused', reason: res.error, retryAfterSeconds: res.retryAfterSeconds };
    }
    const fresh = res.activities.filter((a) => !doneIds.has(String(a.id)));
    for (const a of fresh) {
      progress.queue.push({
        id: String(a.id),
        name: a.name,
        type: a.type,
        startTime: a.start_date,
        movingTimeSec: a.moving_time,
        distanceM: a.distance,
        deviceWatts: !!a.device_watts,
      });
    }
    progress.discoveredCount += fresh.length;
    if (res.activities.length < PER_PAGE) {
      progress.listingDone = true;
    } else {
      progress.nextPage += 1;
    }
    await putSyncProgress(progress);
    onProgress(statusOf(progress, index));
  }

  while (progress.queue.length > 0) {
    const next = progress.queue[0];
    if (doneIds.has(next.id)) {
      // Bereits in index.json gelandet (z. B. Abbruch nach saveIndex, aber vor
      // dem Speichern des Fortschritts) - kein erneuter Strava-Aufruf noetig,
      // sonst drohte ein doppelter index.json-Eintrag (FA-SYNC-02).
      progress.queue.shift();
      await putSyncProgress(progress);
      continue;
    }
    const res = await fetchStreams(next.id);
    if (res.rateLimited) {
      await putSyncProgress(progress);
      onProgress({ ...statusOf(progress, index), paused: true, reason: res.error });
      return { status: 'paused', reason: res.error, retryAfterSeconds: res.retryAfterSeconds };
    }

    await appendActivityToBundle(next, res.streams);
    index.activities.push({
      id: next.id,
      date: next.startTime.slice(0, 10),
      startTime: next.startTime,
      name: next.name,
      type: next.type,
      movingTimeSec: next.movingTimeSec,
      distanceM: next.distanceM,
      hasWatts: !!(res.streams.watts && res.streams.watts.data && res.streams.watts.data.length),
      hasHeartrate: !!(res.streams.heartrate && res.streams.heartrate.data && res.streams.heartrate.data.length),
    });
    index.activities.sort((a, b) => a.startTime.localeCompare(b.startTime));
    await saveIndex(index);
    doneIds.add(next.id);

    progress.queue.shift();
    await putSyncProgress(progress);
    onProgress(statusOf(progress, index));
  }

  index.lastSyncAt = new Date().toISOString();
  await saveIndex(index);
  await putSyncProgress(null);
  onProgress({ done: true, storedTotal: index.activities.length });
  return { status: 'done', total: index.activities.length };
}
