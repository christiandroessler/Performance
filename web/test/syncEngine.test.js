import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine, windowStartEpoch, lastKnownEpoch, firstKnownEpoch } from '../src/syncEngine.js';

function makeActivity(id, isoDate) {
  return {
    id,
    name: `Aktivitaet ${id}`,
    type: 'Ride',
    start_date: isoDate,
    moving_time: 3600,
    distance: 30000,
    device_watts: true,
  };
}

/** Baut ein In-Memory-Fake-Backend: Worker-KV-Fortschritt, Drive-index.json, Monatsbuendel. */
function makeFakeBackend({ activities = [], streamsByActivityId = {}, isDesktop = true } = {}) {
  const state = {
    progress: null,
    index: { schemaVersion: 1, lastSyncAt: null, activities: [] },
    bundles: new Map(),
    activitiesCalls: [],
    streamsCalls: [],
  };

  const engine = createSyncEngine({
    fetchActivities: async (afterEpoch, page, beforeEpoch) => {
      state.activitiesCalls.push({ afterEpoch, page, beforeEpoch });
      const filtered = activities.filter((a) => {
        const epoch = Math.floor(new Date(a.start_date).getTime() / 1000);
        if (afterEpoch && epoch <= afterEpoch) return false;
        if (beforeEpoch && epoch >= beforeEpoch) return false;
        return true;
      });
      const perPage = 100;
      const start = (page - 1) * perPage;
      const slice = filtered.slice(start, start + perPage);
      return { activities: slice };
    },
    fetchStreams: async (activityId) => {
      state.streamsCalls.push(activityId);
      const streams = streamsByActivityId[activityId] || { time: { data: [0, 1, 2] }, watts: { data: [100, 110, 120] } };
      return { streams };
    },
    getSyncProgress: async () => state.progress,
    putSyncProgress: async (p) => {
      state.progress = p;
    },
    readIndex: async () => state.index,
    saveIndex: async (idx) => {
      state.index = idx;
    },
    readBundle: async (monthKey) => state.bundles.get(monthKey) || null,
    writeBundle: async (monthKey, bundle) => {
      state.bundles.set(monthKey, bundle);
    },
    buildActivityBundle: (streams, meta) => ({ startTime: meta.startTime, deviceWatts: meta.deviceWatts, t: streams.time.data }),
    isDesktopViewport: () => isDesktop,
  });

  return { engine, state };
}

test('Erstimport: alle Aktivitaeten einer Seite werden importiert, Fortschritt wird danach geleert', async () => {
  const activities = [makeActivity('1', '2026-01-05T10:00:00Z'), makeActivity('2', '2026-01-06T10:00:00Z')];
  const { engine, state } = makeFakeBackend({ activities });

  // 'all' statt eines Tage-Fensters, damit der Test unabhaengig vom Ausfuehrungsdatum
  // ist (das Fenster-Verhalten selbst deckt windowStartEpoch separat ab).
  const result = await engine.runSync({ firstImportWindowDays: 'all' });

  assert.equal(result.status, 'done');
  assert.equal(state.index.activities.length, 2);
  assert.equal(state.progress, null);
  assert.equal(state.streamsCalls.length, 2);
  assert.ok(state.index.lastSyncAt);
});

test('FA-SYNC-05: Erstimport wird auf schmalem Viewport blockiert', async () => {
  const { engine } = makeFakeBackend({ activities: [makeActivity('1', '2026-01-05T10:00:00Z')], isDesktop: false });
  const result = await engine.runSync({ firstImportWindowDays: 30 });
  assert.deepEqual(result, { status: 'blocked', reason: 'desktop_only' });
});

test('FA-SYNC-04: Drosselung waehrend der Listing-Phase pausiert und setzt ohne Doppelabruf fort', async () => {
  const activities = [makeActivity('1', '2026-01-05T10:00:00Z'), makeActivity('2', '2026-01-06T10:00:00Z')];

  // Eigenes Backend mit einem einmaligen 429 fuer fetchActivities.
  const rateLimitedState = { progress: null, index: { schemaVersion: 1, lastSyncAt: null, activities: [] }, bundles: new Map() };
  let calls = 0;
  const rateLimitedEngine = createSyncEngine({
    fetchActivities: async (afterEpoch, page) => {
      calls += 1;
      if (calls === 1) return { rateLimited: true, error: 'rate_limited', retryAfterSeconds: 5 };
      return { activities };
    },
    fetchStreams: async (id) => ({ streams: { time: { data: [0, 1] }, watts: { data: [100, 100] } } }),
    getSyncProgress: async () => rateLimitedState.progress,
    putSyncProgress: async (p) => {
      rateLimitedState.progress = p;
    },
    readIndex: async () => rateLimitedState.index,
    saveIndex: async (idx) => {
      rateLimitedState.index = idx;
    },
    readBundle: async (monthKey) => rateLimitedState.bundles.get(monthKey) || null,
    writeBundle: async (monthKey, bundle) => {
      rateLimitedState.bundles.set(monthKey, bundle);
    },
    buildActivityBundle: (streams, meta) => ({ startTime: meta.startTime, t: streams.time.data }),
    isDesktopViewport: () => true,
  });

  const paused = await rateLimitedEngine.runSync({ firstImportWindowDays: 30 });
  assert.equal(paused.status, 'paused');
  assert.equal(paused.reason, 'rate_limited');
  assert.equal(rateLimitedState.progress.listingDone, false);

  const resumed = await rateLimitedEngine.runSync({ firstImportWindowDays: 30 });
  assert.equal(resumed.status, 'done');
  assert.equal(rateLimitedState.index.activities.length, 2); // keine Doppelimporte
  assert.equal(calls, 2); // erster Aufruf (429) + genau ein erneuter Listing-Aufruf
});

test('FA-SYNC-02/03: bereits in index.json gelandete Warteschlangen-Eintraege werden beim Fortsetzen uebersprungen, kein erneuter Streams-Abruf', async () => {
  const { engine, state } = makeFakeBackend({ activities: [] });
  // Simuliert genau den Absturz-Fall: saveIndex lief bereits durch, aber der
  // Fortschritt (Warteschlange) wurde noch nicht aktualisiert.
  state.index = {
    schemaVersion: 1,
    lastSyncAt: null,
    activities: [{ id: '1', date: '2026-01-05', startTime: '2026-01-05T10:00:00Z', name: 'x', type: 'Ride', movingTimeSec: 60, distanceM: 100, hasWatts: true, hasHeartrate: false }],
  };
  state.progress = {
    mode: 'first_import',
    afterEpoch: null,
    listingDone: true,
    nextPage: 1,
    queue: [{ id: '1', name: 'x', type: 'Ride', startTime: '2026-01-05T10:00:00Z', movingTimeSec: 60, distanceM: 100, deviceWatts: true }],
    discoveredCount: 1,
  };

  const result = await engine.runSync();

  assert.equal(result.status, 'done');
  assert.equal(state.index.activities.length, 1); // kein zweiter Eintrag
  assert.equal(state.streamsCalls.length, 0); // kein erneuter Strava-Aufruf fuer bereits gespeicherte Aktivitaet
});

test('Backfill: laedt nur Aktivitaeten vor der bisher aeltesten bekannten nach, keine Doppelabfrage der vorhandenen', async () => {
  const older = makeActivity('0', '2025-12-01T10:00:00Z');
  const existing = makeActivity('1', '2026-01-05T10:00:00Z');
  const { engine, state } = makeFakeBackend({ activities: [older, existing] });

  // Erstimport haette "existing" (und nur diese) importiert, wenn das Fenster
  // eng genug war - hier simulieren wir direkt den Zustand "1 Aktivitaet bereits da".
  state.index = {
    schemaVersion: 1,
    lastSyncAt: new Date().toISOString(),
    activities: [
      { id: '1', date: '2026-01-05', startTime: '2026-01-05T10:00:00Z', name: 'x', type: 'Ride', movingTimeSec: 60, distanceM: 100, hasWatts: true, hasHeartrate: false },
    ],
  };

  const result = await engine.runSync({ backfillWindowDays: 'all' });

  assert.equal(result.status, 'done');
  assert.equal(state.index.activities.length, 2); // die aeltere kam dazu
  assert.ok(state.index.activities.some((a) => a.id === '0'));
  assert.equal(state.streamsCalls.length, 1); // nur fuer die neu gefundene, nicht fuer "1"
  assert.equal(state.activitiesCalls[0].beforeEpoch, Math.floor(Date.parse('2026-01-05T10:00:00Z') / 1000));
});

test('firstKnownEpoch: leerer Index liefert null, sonst Startzeit der ersten (sortiert-ersten) Aktivitaet', () => {
  assert.equal(firstKnownEpoch({ activities: [] }), null);
  const idx = { activities: [{ startTime: '2026-01-01T00:00:00Z' }, { startTime: '2026-01-05T12:00:00Z' }] };
  assert.equal(firstKnownEpoch(idx), Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000));
});

test('windowStartEpoch: "all" bzw. falsy ergibt kein Zeitfenster (gesamte Historie)', () => {
  assert.equal(windowStartEpoch('all'), null);
  assert.equal(windowStartEpoch(null), null);
  assert.equal(windowStartEpoch(0), null);
});

test('windowStartEpoch: 30 Tage liegt 30*86400s vor "jetzt"', () => {
  const now = Date.parse('2026-09-17T00:00:00Z');
  assert.equal(windowStartEpoch(30, now), Math.floor(now / 1000) - 30 * 86400);
});

test('lastKnownEpoch: leerer Index liefert null, sonst Startzeit der letzten (sortiert-letzten) Aktivitaet', () => {
  assert.equal(lastKnownEpoch({ activities: [] }), null);
  const idx = { activities: [{ startTime: '2026-01-01T00:00:00Z' }, { startTime: '2026-01-05T12:00:00Z' }] };
  assert.equal(lastKnownEpoch(idx), Math.floor(Date.parse('2026-01-05T12:00:00Z') / 1000));
});
