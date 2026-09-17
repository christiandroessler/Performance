// Ablageformat fuer `streams/YYYY-MM.bin` (Kap. 5.2) - in M1 bewusst offen
// gelassen ("wird erst in M2 festgelegt", core/README.md), hier die M2-
// Festlegung: JSON mit parallelen Zahlen-Arrays (kompakter als Array-of-
// Objects), gzip-komprimiert ueber die native CompressionStream-API (kein
// zusaetzliches Paket noetig, passt zur Zero-Build-Architektur). `t` ist
// Sekunden seit Aktivitaetsbeginn (wie Strava liefert), NICHT das interne
// lueckenlose 1-Hz-Raster - das Resampling (core/src/streams.js) passiert
// erst bei der Berechnung, nie bei der Ablage (Reproduzierbarkeit: dieselbe
// Rohquelle fuehrt immer zur selben Neuberechnung).
//
// schemaVersion 1: { schemaVersion, month, activities: { [id]: ActivityBundle } }
// ActivityBundle: { startTime, deviceWatts, t, watts, heartrate, cadence, velocity }
// Ein Feld ist `null`, wenn Strava diesen Stream-Typ fuer die Aktivitaet gar nicht liefert.

const SCHEMA_VERSION = 1;

export function monthKeyFor(isoStartTime) {
  return isoStartTime.slice(0, 7); // "YYYY-MM"
}

export function streamFileName(monthKey) {
  return `streams/${monthKey}.bin`;
}

export async function encodeBundle(bundle) {
  const json = JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...bundle });
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Response(stream).arrayBuffer();
}

export async function decodeBundle(arrayBuffer) {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(ds);
  const json = await new Response(stream).text();
  const bundle = JSON.parse(json);
  if (bundle.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unbekannte schemaVersion im Streams-Bundle: ${bundle.schemaVersion}`);
  }
  return bundle;
}

export function emptyBundle(month) {
  return { month, activities: {} };
}

/** Wandelt eine Strava-Streams-Antwort (key_by_type=true) in unser Ablageformat fuer eine Aktivitaet um. */
export function activityBundleFromStravaStreams(streams, { startTime, deviceWatts }) {
  const time = (streams.time && streams.time.data) || [];
  const pick = (key) => (streams[key] && streams[key].data ? streams[key].data : null);
  return {
    startTime,
    deviceWatts: !!deviceWatts,
    t: time,
    watts: pick('watts'),
    heartrate: pick('heartrate'),
    cadence: pick('cadence'),
    velocity: pick('velocity_smooth'),
  };
}

/** Wandelt eine abgelegte ActivityBundle zurueck in `RawStreamPoint[]` (core/src/streams.js#resampleTo1Hz). */
export function pointsFromActivityBundle(activityBundle) {
  const { t, watts, heartrate, cadence, velocity, deviceWatts } = activityBundle;
  return t.map((tv, i) => ({
    t: tv,
    watts: watts ? watts[i] : null,
    deviceWatts,
    heartrate: heartrate ? heartrate[i] : null,
    cadence: cadence ? cadence[i] : null,
    velocity: velocity ? velocity[i] : null,
  }));
}
