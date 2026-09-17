// TCX-Parser (Strava-Datenexport, Original-Trackdatei). Siehe gpx.js fuer die
// Begruendung des reinen Text-/Regex-Parsings statt eines XML-DOM.

function tagValue(block, tag) {
  const m = block.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)<\\/(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function extractHeartRate(block) {
  const m = block.match(/<HeartRateBpm\b[^>]*>([\s\S]*?)<\/HeartRateBpm>/i);
  if (!m) return null;
  const v = tagValue(m[1], 'Value');
  return v != null ? Number(v) : null;
}

export function parseTcx(xmlText) {
  const points = [];
  const tpRegex = /<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/g;
  let match;
  let t0 = null;

  while ((match = tpRegex.exec(xmlText))) {
    const block = match[1];
    const timeStr = tagValue(block, 'Time');
    if (!timeStr) continue;
    const time = new Date(timeStr).getTime();
    if (!Number.isFinite(time)) continue;
    if (t0 == null) t0 = time;

    const hr = extractHeartRate(block);
    const cad = tagValue(block, 'Cadence');
    const watts = tagValue(block, 'Watts');
    const dist = tagValue(block, 'DistanceMeters');
    const alt = tagValue(block, 'AltitudeMeters');

    points.push({
      t: (time - t0) / 1000,
      heartrate: hr,
      cadence: cad != null ? Number(cad) : null,
      watts: watts != null ? Number(watts) : null,
      deviceWatts: watts != null,
      distance: dist != null ? Number(dist) : null,
      altitude: alt != null ? Number(alt) : null,
    });
  }

  return { startTime: t0 != null ? new Date(t0).toISOString() : null, points };
}
