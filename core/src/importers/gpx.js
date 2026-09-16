// GPX-Parser (Strava-Datenexport, Original-Trackdatei). Liest Track-Punkte
// inkl. optionaler Erweiterungen fuer Herzfrequenz, Kadenz und Leistung
// (Garmin TrackPointExtension bzw. ANT+/Wahoo Power-Erweiterung).
//
// Bewusst reines Text-/Regex-Parsing statt eines XML-DOM, um den Rechenkern
// ohne Abhaengigkeiten zu halten (siehe core/README.md). Jede in der GPX-Datei
// vorhandene Leistungsangabe gilt als `device_watts = true`, da eine geschaetzte
// Leistung nicht Teil der Originaldatei ist (nur die Strava-API liefert ein
// eigenes device_watts-Flag, siehe FA-DQ-01).

function tagValue(block, tag) {
  const m = block.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)<\\/(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

export function parseGpx(xmlText) {
  const points = [];
  const trkptRegex = /<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let match;
  let t0 = null;

  while ((match = trkptRegex.exec(xmlText))) {
    const block = match[3];
    const timeStr = tagValue(block, 'time');
    if (!timeStr) continue;
    const time = new Date(timeStr).getTime();
    if (!Number.isFinite(time)) continue;
    if (t0 == null) t0 = time;

    const ele = tagValue(block, 'ele');
    const hr = tagValue(block, 'hr');
    const cad = tagValue(block, 'cad');
    const power = tagValue(block, 'power');
    const speed = tagValue(block, 'speed');

    points.push({
      t: (time - t0) / 1000,
      altitude: ele != null ? Number(ele) : null,
      heartrate: hr != null ? Number(hr) : null,
      cadence: cad != null ? Number(cad) : null,
      velocity: speed != null ? Number(speed) : null,
      watts: power != null ? Number(power) : null,
      deviceWatts: power != null,
    });
  }

  return { startTime: t0 != null ? new Date(t0).toISOString() : null, points };
}
