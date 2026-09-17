// Strain Score (SS) nach Kontro et al. 2025, Kap. 7.6. Energiesystemanteile
// (CP/W'/Pmax) einer Aktivitaet, aufgeteilt in Low/High/Peak.
//
// Testvektoren siehe test/strain.test.js (aus dem Lastenheft Kap. 7.6 uebernommen).

/**
 * @param {ArrayLike<number>} watts - 1-Hz-Leistung (Luecken/Ausreisser als 0, siehe quality.js wattsForRecovery)
 * @param {ArrayLike<number>} mpa - MPA je Sekunde, siehe mpa.js mpaTrace
 * @param {number} cp
 * @param {number} pMax
 * @returns {{ low:number, high:number, peak:number, total:number }}
 */
export function computeStrainScore(watts, mpa, cp, pMax) {
  const zero = { low: 0, high: 0, peak: 0, total: 0 };
  const n = watts ? watts.length : 0;
  if (!n || !cp || !pMax || pMax <= cp) return zero;

  let lowSR = 0;
  let highSR = 0;
  let peakSR = 0;

  for (let i = 0; i < n; i++) {
    const p = watts[i] || 0;
    const { pCp, pW, pPmax } = splitPower(p, cp, pMax);

    const mpaI = mpa ? mpa[i] : pMax;
    const denom = pMax - p + cp;
    const kStrain = denom !== 0 ? (pMax - mpaI + cp) / denom : 0;

    lowSR += kStrain * pCp;
    highSR += kStrain * pW;
    peakSR += kStrain * pPmax;
  }

  const norm = pMax / (cp * cp) * (100 / 3600);
  const r1 = (x) => Math.round(x * 10) / 10;
  const low = r1(lowSR * norm);
  const high = r1(highSR * norm);
  const peak = r1(peakSR * norm);
  return { low, high, peak, total: r1(low + high + peak) };
}

/**
 * Energiesystemanteile der Leistung P (Kap. 7.6):
 *   P_CP = min(P, CP)
 *   P>CP:  P_Pmax = (P-CP)^2 / (Pmax-CP),  P_W' = P - CP - P_Pmax
 *   P<=CP: P_Pmax = P_W' = 0
 */
export function splitPower(p, cp, pMax) {
  const pCp = Math.min(p, cp);
  if (p <= cp) return { pCp, pW: 0, pPmax: 0 };
  const above = p - cp;
  const pPmax = (above * above) / (pMax - cp);
  const pW = above - pPmax;
  return { pCp, pW, pPmax };
}

/** Momentaner k_strain-Wert, siehe Kap. 7.6. */
export function kStrain(p, mpa, cp, pMax) {
  const denom = pMax - p + cp;
  return denom !== 0 ? (pMax - mpa + cp) / denom : 0;
}
