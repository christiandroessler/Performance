// Orchestriert die Modellberechnung (M3): laedt alle Rohdaten (Kap. 5.2:
// index.json + streams/YYYY-MM.bin), schickt sie an den Rechenkern-Worker
// (calcWorker.js, NFA-04), schreibt das Ergebnis nach
// model/signature-history.json und schreibt die berechneten Kennzahlen je
// Aktivitaet in index.json zurueck (FA-ACT-01: TSS/Strain/Breakthrough-Status
// dort direkt anzeigbar, ohne bei jedem Listing neu zu rechnen).
//
// FA-SIG-07: Verwerfen/Reaktivieren eines Breakthroughs aendert nur die
// Menge `discardedBreakthroughIds` und stoesst denselben vollstaendigen
// chronologischen Durchlauf erneut an (computeSignatureHistory ist eine
// reine Funktion des gesamten Verlaufs, kein inkrementelles Patchen -
// M1-Entscheidung, siehe core/README.md).

import { loadIndex } from './sync.js';
import { readFile, readJson, writeJson } from './storage.js';
import { decodeBundle, streamFileName, pointsFromActivityBundle } from './streamCodec.js';

const MODEL_FILE = 'model/signature-history.json';
const INDEX_FILE = 'index.json';

let worker = null;
let nextRequestId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./calcWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { requestId, ok, result, error } = e.data;
      const cb = pending.get(requestId);
      if (!cb) return;
      pending.delete(requestId);
      if (ok) cb.resolve(result);
      else cb.reject(new Error(error));
    };
  }
  return worker;
}

function runInWorker(payload) {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId++;
    pending.set(requestId, { resolve, reject });
    getWorker().postMessage({ requestId, ...payload });
  });
}

async function loadRawActivities(index) {
  const byMonth = new Map();
  for (const a of index.activities) {
    const monthKey = a.startTime.slice(0, 7);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey).push(a);
  }

  const rawActivities = [];
  for (const [monthKey, metas] of byMonth) {
    const buf = await readFile(streamFileName(monthKey));
    if (!buf) continue;
    const bundle = await decodeBundle(buf);
    for (const meta of metas) {
      const activityBundle = bundle.activities[meta.id];
      if (!activityBundle) continue;
      rawActivities.push({
        id: meta.id,
        date: meta.date,
        startTime: meta.startTime,
        points: pointsFromActivityBundle(activityBundle),
      });
    }
  }
  return rawActivities;
}

export async function loadModelState() {
  return (await readJson(MODEL_FILE)) || { schemaVersion: 1, computedAt: null, discardedBreakthroughIds: [], history: [], breakthroughs: [] };
}

/** FA-SIG-07/M1: reine Funktion ueber den GESAMTEN Verlauf - kein inkrementelles Patchen. */
export async function recomputeAll({ settingsOverrides, discardedBreakthroughIds } = {}) {
  const index = await loadIndex();
  const rawActivities = await loadRawActivities(index);
  const modelState = await loadModelState();
  const discardedIds = discardedBreakthroughIds ?? modelState.discardedBreakthroughIds;

  const result = await runInWorker({
    rawActivities,
    settingsOverrides,
    discardedBreakthroughIds: discardedIds,
  });

  await writeJson(MODEL_FILE, {
    schemaVersion: 1,
    computedAt: new Date().toISOString(),
    discardedBreakthroughIds: discardedIds,
    settings: result.settings,
    initial: result.initial,
    needsMoreData: !!result.needsMoreData,
    history: result.history,
    breakthroughs: result.breakthroughs,
  });

  const byId = new Map(result.activityResults.map((r) => [r.id, r]));
  for (const a of index.activities) {
    const r = byId.get(a.id);
    if (!r) continue;
    a.hasSignature = r.hasSignature;
    a.np = r.np ?? null;
    a.if = r.if ?? null;
    a.tss = r.tss ?? null;
    a.strain = r.strain ?? null;
    a.breakthrough = r.breakthrough ? { medal: r.breakthrough.medal, discarded: r.breakthrough.discarded } : null;
  }
  await writeJson(INDEX_FILE, index);

  return result;
}

/** FA-SIG-07: Verwerfen - Signatur/Kennzahlen werden chronologisch ab diesem Datum neu berechnet. */
export async function discardBreakthrough(activityId) {
  const modelState = await loadModelState();
  const ids = new Set(modelState.discardedBreakthroughIds);
  ids.add(activityId);
  return recomputeAll({ discardedBreakthroughIds: [...ids] });
}

/** FA-SIG-07: Reaktivieren - stellt den vorherigen Zustand wieder her (erneute chronologische Neuberechnung ohne diese Ausnahme). */
export async function reactivateBreakthrough(activityId) {
  const modelState = await loadModelState();
  const ids = new Set(modelState.discardedBreakthroughIds);
  ids.delete(activityId);
  return recomputeAll({ discardedBreakthroughIds: [...ids] });
}
