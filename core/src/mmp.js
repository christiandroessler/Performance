// Mean-Maximal-Power (MMP): bester gleitender Leistungsmittelwert je Dauer.
// Grundlage fuer die persoenlichen Bestwerte (FA-ACT-03) und die Stuetzpunkte
// fuer die Signatur-Regression (FA-SIG-03, FA-SIG-05).

export const DEFAULT_GRID = [
  1, 2, 3, 4, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900,
  1200, 1800, 2700, 3600, 5400, 7200, 10800,
];

/**
 * Bester gleitender Mittelwert je Dauer aus einem lueckenlosen Zahlen-Array
 * (z. B. ein einzelnes valides Segment), UNGERUNDET. O(n) via Praefixsumme.
 * Von meanMaximalPower() (rundet fuer die Watt-Anzeige) UND pace.js (Pace/HF,
 * wo eine Rundung auf ganze Einheiten viel zu grob waere) gemeinsam genutzt.
 * @param {ArrayLike<number>} values
 * @param {number[]} grid
 * @returns {{t: number, value: number}[]}
 */
export function bestMeanOverWindows(values, grid = DEFAULT_GRID) {
  if (!values || values.length === 0) return [];
  const n = values.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + (values[i] || 0);

  const out = [];
  for (const t of grid) {
    if (t > n) break;
    let best = -Infinity;
    for (let i = 0; i + t <= n; i++) {
      const avg = (prefix[i + t] - prefix[i]) / t;
      if (avg > best) best = avg;
    }
    out.push({ t, value: best });
  }
  return out;
}

/**
 * Bester gleitender Mittelwert je Dauer aus einem lueckenlosen Watt-Array
 * (z. B. ein einzelnes valides Segment), auf ganze Watt gerundet (Anzeige).
 * @param {ArrayLike<number>} watts
 * @param {number[]} grid
 */
export function meanMaximalPower(watts, grid = DEFAULT_GRID) {
  return bestMeanOverWindows(watts, grid).map((p) => ({ t: p.t, watts: Math.round(p.value) }));
}

/**
 * Zerlegt einen 1-Hz-Stream anhand einer Gueltigkeitsmaske (siehe quality.js
 * validPowerMask) in lueckenlose valide Segmente und liefert je Segment das
 * Watt-Array. Ausreisser/Luecken/geschaetzte Leistung unterbrechen ein Segment,
 * damit sie nicht faelschlich in ein MMP-Fenster einfliessen.
 * @param {import('./types.js').Stream1Hz} stream
 * @param {Uint8Array} mask
 * @returns {Float64Array[]}
 */
export function validSegments(stream, mask) {
  const segments = [];
  let start = -1;
  for (let i = 0; i <= stream.n; i++) {
    const valid = i < stream.n && mask[i];
    if (valid && start === -1) start = i;
    if (!valid && start !== -1) {
      segments.push(stream.watts.slice(start, i));
      start = -1;
    }
  }
  return segments;
}

/**
 * MMP-Kurve fuer eine ganze Aktivitaet: Maximum ueber alle validen Segmente je Dauer.
 * @param {import('./types.js').Stream1Hz} stream
 * @param {Uint8Array} mask
 * @param {number[]} grid
 */
export function meanMaximalPowerForActivity(stream, mask, grid = DEFAULT_GRID) {
  const segments = validSegments(stream, mask);
  const byT = new Map(grid.map((t) => [t, -Infinity]));
  for (const seg of segments) {
    if (seg.length === 0) continue;
    for (const p of meanMaximalPower(seg, grid)) {
      if (p.watts > byT.get(p.t)) byT.set(p.t, p.watts);
    }
  }
  return grid.filter((t) => byT.get(t) > -Infinity).map((t) => ({ t, watts: byT.get(t) }));
}

/** Envelope ueber mehrere Aktivitaets-MMP-Kurven. curves = [{ date, activityId, mmp:[{t,watts}] }] */
export function aggregateMMP(curves, grid = DEFAULT_GRID) {
  const byT = new Map();
  for (const c of curves || []) {
    for (const p of c.mmp || []) {
      const cur = byT.get(p.t);
      if (!cur || p.watts > cur.watts) {
        byT.set(p.t, { t: p.t, watts: p.watts, date: c.date, activityId: c.activityId });
      }
    }
  }
  return grid.filter((t) => byT.has(t)).map((t) => byT.get(t));
}

/**
 * Envelope-Punkte mit Stuetzungs-Zaehler (in wie vielen Aktivitaeten wird der
 * Envelope-Wert zu >= nearPct erreicht). Grundlage fuer die Start- und Refit-Regression.
 */
export function detectMaximalEfforts(perActivityMMP, { grid = DEFAULT_GRID, nearPct = 0.9, sinceDays, untilDate } = {}) {
  let curves = perActivityMMP || [];
  if (sinceDays != null) {
    const until = untilDate ? new Date(untilDate).getTime() : Date.now();
    const cut = until - sinceDays * 86400e3;
    curves = curves.filter((c) => {
      const d = new Date(c.date).getTime();
      return d >= cut && d <= until;
    });
  }
  if (curves.length === 0) return [];

  const env = aggregateMMP(curves, grid);
  return env.map((e) => {
    let support = 0;
    const supportingActivityIds = new Set();
    for (const c of curves) {
      const p = (c.mmp || []).find((x) => x.t === e.t);
      if (p && p.watts >= nearPct * e.watts) {
        support++;
        supportingActivityIds.add(c.activityId);
      }
    }
    return { t: e.t, watts: e.watts, activityId: e.activityId, date: e.date, support, supportingActivityIds };
  });
}
