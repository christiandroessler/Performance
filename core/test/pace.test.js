import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resampleTo1Hz } from '../src/streams.js';
import {
  validVelocitySegments,
  bestSustainedSpeed,
  bestSustainedHeartRate,
  averageHeartRate,
  averageSpeed,
  recordedSeconds,
  meanHeartRateNearPower,
} from '../src/pace.js';
import { validPowerMask } from '../src/quality.js';

function buildStream(points) {
  return resampleTo1Hz(points);
}

test('validVelocitySegments: Stillstand (v=0) und Luecken trennen Segmente', () => {
  const points = [
    ...Array.from({ length: 5 }, (_, t) => ({ t, velocity: 3 })),
    { t: 5, velocity: 0 }, // Ampel-Stopp
    ...Array.from({ length: 4 }, (_, i) => ({ t: 6 + i, velocity: 3 })),
  ];
  const stream = buildStream(points);
  const segments = validVelocitySegments(stream);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].length, 5);
  assert.equal(segments[1].length, 4);
});

test('bestSustainedSpeed: findet den besten gleitenden Mittelwert ueber die Zieldauer', () => {
  const points = [];
  for (let t = 0; t < 100; t++) points.push({ t, velocity: 3 }); // 3 m/s Grundtempo
  for (let t = 100; t < 130; t++) points.push({ t, velocity: 5 }); // 30s schneller
  const stream = buildStream(points);
  assert.equal(bestSustainedSpeed(stream, 30), 5);
  assert.equal(bestSustainedSpeed(stream, 200), null); // kein Segment lang genug
});

test('bestSustainedHeartRate: analog zu bestSustainedSpeed, aber fuer Herzfrequenz', () => {
  const points = [];
  for (let t = 0; t < 60; t++) points.push({ t, heartrate: 140 });
  for (let t = 60; t < 90; t++) points.push({ t, heartrate: 160 });
  const stream = buildStream(points);
  assert.equal(bestSustainedHeartRate(stream, 30), 160);
});

test('averageSpeed/averageHeartRate: Mittelwert nur ueber gueltige Sekunden, null ohne Daten', () => {
  const points = [
    { t: 0, velocity: 2, heartrate: 120 },
    { t: 1, velocity: 4, heartrate: 130 },
    { t: 2, velocity: 0 }, // Stillstand zaehlt nicht fuer averageSpeed
  ];
  const stream = buildStream(points);
  assert.equal(averageSpeed(stream), 3);
  assert.ok(Math.abs(averageHeartRate(stream) - 125) < 0.01);

  const emptyStream = buildStream([{ t: 0, watts: 100, deviceWatts: true }]);
  assert.equal(averageSpeed(emptyStream), null);
  assert.equal(averageHeartRate(emptyStream), null);
});

test('recordedSeconds: zaehlt Sekunden ohne Luecke', () => {
  const points = [{ t: 0, velocity: 1 }, { t: 1, velocity: 1 }, { t: 5, velocity: 1 }]; // Luecke bei 2-4
  const stream = buildStream(points);
  assert.equal(stream.n, 6);
  assert.equal(recordedSeconds(stream), 3);
});

test('meanHeartRateNearPower: mittelt HF nur ueber Sekunden mit Leistung nahe targetWatts', () => {
  const points = [];
  for (let t = 0; t < 60; t++) points.push({ t, watts: 280, deviceWatts: true, heartrate: 150 }); // nahe TP=282
  for (let t = 60; t < 120; t++) points.push({ t, watts: 150, deviceWatts: true, heartrate: 120 }); // weit unter TP
  const stream = buildStream(points);
  const mask = validPowerMask(stream);
  const result = meanHeartRateNearPower(stream, mask, 282, 0.05); // +/-14W
  assert.ok(result);
  assert.equal(result.seconds, 60);
  assert.equal(result.avgHr, 150);
});

test('meanHeartRateNearPower: null ohne targetWatts oder ohne passende Sekunden', () => {
  const stream = buildStream([{ t: 0, watts: 100, deviceWatts: true, heartrate: 120 }]);
  const mask = validPowerMask(stream);
  assert.equal(meanHeartRateNearPower(stream, mask, 0, 0.05), null);
  assert.equal(meanHeartRateNearPower(stream, mask, 282, 0.05), null); // 100W ist nicht nahe 282W
});
