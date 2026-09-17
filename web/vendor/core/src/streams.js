// Normalisierung auf ein lueckenloses 1-Hz-Raster (FA-DQ-02).
// Luecken (Pausen, Aufzeichnungsaussetzer) werden NICHT interpoliert, sondern
// als Luecke markiert (gap[i] = 1). Das ist eine bewusste Lastenheft-Vorgabe,
// keine Implementierungsfreiheit.

/**
 * @param {import('./types.js').RawStreamPoint[]} points - Rohpunkte, `t` muss nicht lueckenlos sein.
 * @returns {import('./types.js').Stream1Hz}
 */
export function resampleTo1Hz(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return emptyStream(0);
  }

  const sorted = [...points].sort((a, b) => a.t - b.t);
  const t0 = Math.floor(sorted[0].t);
  const tMax = Math.floor(sorted[sorted.length - 1].t);
  const n = Math.max(1, tMax - t0 + 1);

  const stream = emptyStream(n);
  stream.gap.fill(1); // alles zunaechst Luecke, dann mit echten Punkten ueberschreiben

  for (const p of sorted) {
    const i = Math.floor(p.t) - t0;
    if (i < 0 || i >= n) continue;
    stream.gap[i] = 0;
    if (p.watts != null && Number.isFinite(p.watts)) {
      stream.watts[i] = p.watts;
      stream.hasWatts[i] = 1;
      stream.deviceWatts[i] = p.deviceWatts ? 1 : 0;
    }
    if (p.heartrate != null && Number.isFinite(p.heartrate)) {
      stream.heartrate[i] = p.heartrate;
      stream.hasHeartrate[i] = 1;
    }
    if (p.cadence != null && Number.isFinite(p.cadence)) {
      stream.cadence[i] = p.cadence;
    }
    if (p.velocity != null && Number.isFinite(p.velocity)) {
      stream.velocity[i] = p.velocity;
    }
  }

  return stream;
}

/** @param {number} n @returns {import('./types.js').Stream1Hz} */
function emptyStream(n) {
  return {
    n,
    watts: new Float64Array(n),
    hasWatts: new Uint8Array(n),
    deviceWatts: new Uint8Array(n),
    heartrate: new Float64Array(n),
    hasHeartrate: new Uint8Array(n),
    cadence: new Float64Array(n),
    velocity: new Float64Array(n),
    gap: new Uint8Array(n),
    outlier: new Uint8Array(n),
  };
}

export { emptyStream };
