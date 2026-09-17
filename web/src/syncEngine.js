// Reine Sync-Zustandsmaschine (Kap. 5.3, FA-SYNC-01 bis 05), OHNE Abhaengigkeit
// von Browser-APIs (kein `window`, kein IndexedDB, kein Drive/Worker-Fetch
// direkt) - alle Effekte kommen als Funktionen von aussen rein. Macht die
// Resume-/Dedup-Logik mit `node:test` und einfachen In-Memory-Fakes testbar
// (siehe `test/syncEngine.test.js`), ohne einen echten Browser zu brauchen.
// `sync.js` ist der duenne Adapter, der das hier mit den echten Modulen
// (api.js, storage.js, streamCodec.js, `window`) verdrahtet.

const PER_PAGE = 100;

export function windowStartEpoch(days, nowMs = Date.now()) {
  if (!days || days === 'all') return null;
  return Math.floor(nowMs / 1000) - days * 86400;
}

export function lastKnownEpoch(index) {
  if (index.activities.length === 0) return null;
  const last = index.activities[index.activities.length - 1];
  return Math.floor(new Date(last.startTime).getTime() / 1000);
}

/** Aelteste bekannte Aktivitaet - Grenze fuer "mehr Historie laden" (Backfill). */
export function firstKnownEpoch(index) {
  if (index.activities.length === 0) return null;
  const first = index.activities[0];
  return Math.floor(new Date(first.startTime).getTime() / 1000);
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

/**
 * @param {Object} deps
 * @param {(afterEpoch: number|null, page: number, beforeEpoch: number|null) => Promise<Object>} deps.fetchActivities
 * @param {(activityId: string) => Promise<Object>} deps.fetchStreams
 * @param {() => Promise<Object|null>} deps.getSyncProgress
 * @param {(progress: Object|null) => Promise<void>} deps.putSyncProgress
 * @param {() => Promise<Object>} deps.readIndex
 * @param {(index: Object) => Promise<void>} deps.saveIndex
 * @param {(monthKey: string) => Promise<Object|null>} deps.readBundle
 * @param {(monthKey: string, bundle: Object) => Promise<void>} deps.writeBundle
 * @param {(streams: Object, meta: Object) => Object} deps.buildActivityBundle
 * @param {() => boolean} [deps.isDesktopViewport]
 */
export function createSyncEngine(deps) {
  const { fetchActivities, fetchStreams, getSyncProgress, putSyncProgress, readIndex, saveIndex, readBundle, writeBundle, buildActivityBundle } = deps;
  const isDesktopViewport = deps.isDesktopViewport || (() => true);

  async function appendActivityToBundle(meta, stravaStreams) {
    const monthKey = meta.startTime.slice(0, 7);
    const existing = await readBundle(monthKey);
    const bundle = existing || { month: monthKey, activities: {} };
    bundle.activities[meta.id] = buildActivityBundle(stravaStreams, { startTime: meta.startTime, deviceWatts: meta.deviceWatts });
    await writeBundle(monthKey, bundle);
  }

  async function runSync({ firstImportWindowDays, backfillWindowDays } = {}, onProgress = () => {}) {
    const index = await readIndex();
    const doneIds = new Set(index.activities.map((a) => a.id));

    let progress = await getSyncProgress();
    if (!progress) {
      const isFirstImport = index.activities.length === 0;
      if (isFirstImport && !isDesktopViewport()) {
        return { status: 'blocked', reason: 'desktop_only' };
      }
      if (isFirstImport) {
        progress = { mode: 'first_import', afterEpoch: windowStartEpoch(firstImportWindowDays), beforeEpoch: null, listingDone: false, nextPage: 1, queue: [], discoveredCount: 0 };
      } else if (backfillWindowDays !== undefined) {
        // FA-SYNC: bereits importierte Historie um aeltere Aktivitaeten erweitern,
        // ohne die bereits gespeicherten erneut abzufragen (before = bisher aelteste bekannte).
        progress = { mode: 'backfill', afterEpoch: windowStartEpoch(backfillWindowDays), beforeEpoch: firstKnownEpoch(index), listingDone: false, nextPage: 1, queue: [], discoveredCount: 0 };
      } else {
        progress = { mode: 'incremental', afterEpoch: lastKnownEpoch(index), beforeEpoch: null, listingDone: false, nextPage: 1, queue: [], discoveredCount: 0 };
      }
    }

    while (!progress.listingDone) {
      const res = await fetchActivities(progress.afterEpoch, progress.nextPage, progress.beforeEpoch);
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

  return { runSync };
}
