import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monthKeyFor,
  streamFileName,
  activityBundleFromStravaStreams,
  pointsFromActivityBundle,
  encodeBundle,
  decodeBundle,
  emptyBundle,
} from '../src/streamCodec.js';

test('monthKeyFor extrahiert YYYY-MM aus einem ISO-Zeitstempel', () => {
  assert.equal(monthKeyFor('2026-01-05T10:00:00Z'), '2026-01');
});

test('streamFileName folgt Kap. 5.2', () => {
  assert.equal(streamFileName('2026-01'), 'streams/2026-01.bin');
});

test('activityBundleFromStravaStreams uebernimmt nur vorhandene Stream-Typen', () => {
  const streams = {
    time: { data: [0, 1, 2] },
    watts: { data: [100, 110, 120] },
    // heartrate absichtlich nicht geliefert (z. B. kein Brustgurt)
  };
  const bundle = activityBundleFromStravaStreams(streams, { startTime: '2026-01-05T10:00:00Z', deviceWatts: true });
  assert.deepEqual(bundle.t, [0, 1, 2]);
  assert.deepEqual(bundle.watts, [100, 110, 120]);
  assert.equal(bundle.heartrate, null);
  assert.equal(bundle.deviceWatts, true);
});

test('pointsFromActivityBundle wandelt parallele Arrays zurueck in RawStreamPoint[]', () => {
  const bundle = {
    startTime: '2026-01-05T10:00:00Z',
    deviceWatts: true,
    t: [0, 1],
    watts: [100, 105],
    heartrate: null,
    cadence: [80, 82],
    velocity: null,
  };
  const points = pointsFromActivityBundle(bundle);
  assert.deepEqual(points, [
    { t: 0, watts: 100, deviceWatts: true, heartrate: null, cadence: 80, velocity: null },
    { t: 1, watts: 105, deviceWatts: true, heartrate: null, cadence: 82, velocity: null },
  ]);
});

test('encodeBundle/decodeBundle: Rundreise erhaelt den Inhalt (gzip-Kompression, Kap. 5.2)', async () => {
  const bundle = emptyBundle('2026-01');
  bundle.activities['123'] = activityBundleFromStravaStreams(
    { time: { data: [0, 1, 2, 3] }, watts: { data: [100, 150, 200, 180] } },
    { startTime: '2026-01-05T10:00:00Z', deviceWatts: false }
  );

  const encoded = await encodeBundle(bundle);
  assert.ok(encoded instanceof ArrayBuffer);
  assert.ok(encoded.byteLength > 0);

  const decoded = await decodeBundle(encoded);
  assert.equal(decoded.month, '2026-01');
  assert.equal(decoded.schemaVersion, 1);
  assert.deepEqual(decoded.activities['123'].watts, [100, 150, 200, 180]);
});

test('decodeBundle lehnt unbekannte schemaVersion ab', async () => {
  const json = JSON.stringify({ schemaVersion: 99, month: '2026-01', activities: {} });
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  const encoded = await new Response(stream).arrayBuffer();

  await assert.rejects(() => decodeBundle(encoded), /schemaVersion/);
});
