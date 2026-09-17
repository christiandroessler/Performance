// Duenner Adapter: verdrahtet die reine Zustandsmaschine (syncEngine.js) mit
// den echten Modulen (Worker-API, Drive/IndexedDB-Speicherschicht,
// Streams-Ablageformat) und dem Browser (`window` fuer FA-SYNC-05). Die
// eigentliche Sync-Logik samt allen Tests lebt in syncEngine.js.

import { fetchActivities, fetchStreams, getSyncProgress, putSyncProgress } from './api.js';
import { readJson, writeJson, readFile, writeFile } from './storage.js';
import { encodeBundle, decodeBundle, streamFileName, activityBundleFromStravaStreams } from './streamCodec.js';
import { createSyncEngine } from './syncEngine.js';

const INDEX_FILE = 'index.json';
const DESKTOP_MIN_WIDTH = 900;

/** FA-SYNC-05: Erstimport nur in der Desktop-Ansicht startbar. */
export function isDesktopViewport() {
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

export async function loadIndex() {
  const idx = await readJson(INDEX_FILE);
  return idx || { schemaVersion: 1, lastSyncAt: null, activities: [] };
}

const engine = createSyncEngine({
  fetchActivities,
  fetchStreams,
  getSyncProgress,
  putSyncProgress,
  readIndex: loadIndex,
  saveIndex: (index) => writeJson(INDEX_FILE, index),
  readBundle: async (monthKey) => {
    const buf = await readFile(streamFileName(monthKey));
    return buf ? decodeBundle(buf) : null;
  },
  writeBundle: async (monthKey, bundle) => {
    const encoded = await encodeBundle(bundle);
    await writeFile(streamFileName(monthKey), 'application/gzip', encoded);
  },
  buildActivityBundle: activityBundleFromStravaStreams,
  isDesktopViewport,
});

export const runSync = engine.runSync;
