import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpx } from '../../src/importers/gpx.js';
import { parseTcx } from '../../src/importers/tcx.js';
import { parseActivitiesCsv } from '../../src/importers/activitiesCsv.js';

test('parseGpx liest Zeit, Leistung, Herzfrequenz und Kadenz aus Extensions', () => {
  const xml = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="52.5" lon="13.4">
  <ele>34.2</ele>
  <time>2026-01-01T08:00:00Z</time>
  <extensions>
    <gpxtpx:TrackPointExtension>
      <gpxtpx:hr>140</gpxtpx:hr>
      <gpxtpx:cad>85</gpxtpx:cad>
    </gpxtpx:TrackPointExtension>
    <power>230</power>
  </extensions>
</trkpt>
<trkpt lat="52.5" lon="13.4">
  <time>2026-01-01T08:00:01Z</time>
  <extensions><power>240</power></extensions>
</trkpt>
</trkseg></trk></gpx>`;

  const { points, startTime } = parseGpx(xml);
  assert.equal(points.length, 2);
  assert.equal(points[0].t, 0);
  assert.equal(points[1].t, 1);
  assert.equal(points[0].watts, 230);
  assert.equal(points[0].heartrate, 140);
  assert.equal(points[0].cadence, 85);
  assert.equal(points[0].deviceWatts, true);
  assert.ok(startTime);
});

test('parseTcx liest Zeit, Herzfrequenz und Watts aus der TPX-Erweiterung', () => {
  const xml = `<?xml version="1.0"?>
<TrainingCenterDatabase><Activities><Activity><Lap><Track>
<Trackpoint>
  <Time>2026-01-01T08:00:00Z</Time>
  <HeartRateBpm><Value>150</Value></HeartRateBpm>
  <Cadence>90</Cadence>
  <Extensions><TPX xmlns="x"><Watts>260</Watts></TPX></Extensions>
</Trackpoint>
<Trackpoint>
  <Time>2026-01-01T08:00:01Z</Time>
  <HeartRateBpm><Value>151</Value></HeartRateBpm>
  <Extensions><TPX xmlns="x"><Watts>270</Watts></TPX></Extensions>
</Trackpoint>
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

  const { points } = parseTcx(xml);
  assert.equal(points.length, 2);
  assert.equal(points[0].heartrate, 150);
  assert.equal(points[0].cadence, 90);
  assert.equal(points[0].watts, 260);
  assert.equal(points[0].deviceWatts, true);
  assert.equal(points[1].t, 1);
});

test('parseActivitiesCsv liest Id, Datum, Typ und Dateiname', () => {
  const csv =
    'Activity ID,Activity Date,Activity Name,Activity Type,Filename\n' +
    '12345,"Jan 1, 2026, 8:00:00 AM","Morgenrunde",Ride,activities/12345.fit.gz\n' +
    '12346,"Jan 2, 2026, 8:00:00 AM","Lauf",Run,activities/12346.gpx\n';

  const rows = parseActivitiesCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, '12345');
  assert.equal(rows[0].type, 'Ride');
  assert.equal(rows[0].filename, 'activities/12345.fit.gz');
  assert.equal(rows[1].filename, 'activities/12346.gpx');
});
