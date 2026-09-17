// Prueft NUR die Verbindungsstelle zwischen Ablage (streamCodec.js) und
// Rechenkern (core/, M1): dass eine Strava-Streams-Antwort -> abgelegtes
// ActivityBundle -> RawStreamPoint[] -> prepareActivity()/
// computeSignatureHistory() ohne Bruch durchlaeuft und plausible Werte
// liefert. Die Algorithmus-Korrektheit selbst (CP-Fit, Breakthroughs, W'bal
// usw.) ist bereits durch core/test/ (33 Tests) abgedeckt - hier geht es nur
// um die Datenform an der Naht.

import test from 'node:test';
import assert from 'node:assert/strict';
import { activityBundleFromStravaStreams, pointsFromActivityBundle } from '../src/streamCodec.js';
import { prepareActivity, computeSignatureHistory, DEFAULT_SETTINGS } from '../../core/src/index.js';

function makeStravaStreams(durationSec, wattsFn) {
  const time = Array.from({ length: durationSec }, (_, i) => i);
  const watts = time.map(wattsFn);
  return { time: { data: time }, watts: { data: watts } };
}

test('Strava-Streams -> Ablageformat -> RawStreamPoint[] -> prepareActivity laeuft ohne Bruch durch', () => {
  const streams = makeStravaStreams(3600, (t) => 200 + 50 * Math.sin(t / 300));
  const bundle = activityBundleFromStravaStreams(streams, { startTime: '2026-01-05T10:00:00Z', deviceWatts: true });
  const points = pointsFromActivityBundle(bundle);

  const prepared = prepareActivity({ id: 'a1', date: '2026-01-05', startTime: '2026-01-05T10:00:00Z', points }, DEFAULT_SETTINGS);

  assert.equal(prepared.stream.n, 3600);
  assert.equal(prepared.id, 'a1');
  assert.ok(prepared.mmp.length > 0);
  // deviceWatts=true muss bis in die Maske durchgereicht werden (FA-DQ-01).
  assert.ok(prepared.mask.some((v) => v === 1));
});

test('deviceWatts=false (kein Leistungsmesser) fliesst NICHT in die Leistungsmaske ein (FA-DQ-01)', () => {
  const streams = makeStravaStreams(600, () => 200);
  const bundle = activityBundleFromStravaStreams(streams, { startTime: '2026-01-05T10:00:00Z', deviceWatts: false });
  const points = pointsFromActivityBundle(bundle);
  const prepared = prepareActivity({ id: 'a1', date: '2026-01-05', startTime: '2026-01-05T10:00:00Z', points }, DEFAULT_SETTINGS);

  assert.ok(prepared.mask.every((v) => v === 0));
});

test('computeSignatureHistory ueber mehrere per Ablageformat gereichte Aktivitaeten liefert ein activityResults-Element je Aktivitaet', () => {
  const acts = [];
  for (let day = 0; day < 5; day++) {
    const streams = makeStravaStreams(1800, (t) => 180 + 100 * Math.sin(t / 120) + day * 5);
    const bundle = activityBundleFromStravaStreams(streams, {
      startTime: `2026-01-0${day + 1}T10:00:00Z`,
      deviceWatts: true,
    });
    const points = pointsFromActivityBundle(bundle);
    acts.push(
      prepareActivity({ id: `a${day}`, date: `2026-01-0${day + 1}`, startTime: `2026-01-0${day + 1}T10:00:00Z`, points }, DEFAULT_SETTINGS)
    );
  }

  const result = computeSignatureHistory(acts, { settings: DEFAULT_SETTINGS });
  assert.equal(result.activityResults.length, 5);
  for (const r of result.activityResults) {
    assert.equal(typeof r.hasSignature, 'boolean');
  }
});
