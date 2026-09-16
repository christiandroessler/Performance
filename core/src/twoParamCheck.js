// 2-Parameter-Konsistenzpruefung (FA-SIG-14, S-Prioritaet). Das einfachere
// 2-Parameter-Modell (Monod-Scherrer: CP, W') wird parallel mitgefuehrt, mit
// einer klassischen exponentiellen Erholungs-Naeherung (Skiba 2012) und OHNE
// Klemmung auf 0 - W'bal darf negativ werden. Ein negativer Wert bedeutet:
// nach dem einfachen Modell waere diese Belastung nicht mehr moeglich gewesen.
// Widersprueche (negatives W'bal ausserhalb eines vom 3-Parameter-Modell
// erkannten Breakthroughs) werden nur protokolliert, es gibt keine eigene
// Ansicht dafuer (Lastenheft Kap. 6.7 FA-SIG-14).

import { fit2ParamCP } from './cpFit.js';

/** Klassische Skiba-2012-Erholungszeitkonstante (Sekunden) aus der mittleren Leistung unter CP. */
function recoveryTau(watts, cp) {
  let sum = 0;
  let count = 0;
  for (const p of watts) {
    if (p < cp) {
      sum += p;
      count++;
    }
  }
  const belowAvg = count ? sum / count : cp * 0.6;
  const dCP = Math.max(1, cp - belowAvg);
  return 546 * Math.exp(-0.01 * dCP) + 316;
}

/** W'bal (Joule) nach der klassischen exponentiellen Naeherung, NICHT auf 0 geklemmt. */
export function wPrimeBalance2ParamUnclamped(watts, cp, wPrimeJ) {
  const n = watts.length;
  const out = new Float64Array(n);
  if (!n || !cp || !wPrimeJ) return out;
  const tau = recoveryTau(watts, cp);
  const recFactor = 1 - Math.exp(-1 / tau);
  let bal = wPrimeJ;
  for (let i = 0; i < n; i++) {
    const p = watts[i] || 0;
    if (p > cp) bal -= p - cp;
    else bal += (wPrimeJ - bal) * recFactor;
    out[i] = bal;
  }
  return out;
}

/**
 * Fittet das 2-Parameter-Modell aus denselben Refit-Stuetzpunkten wie der
 * 3-Parameter-Fit und prueft, ob dessen W'bal ausserhalb bekannter
 * Breakthrough-Fenster negativ wird.
 * @param {{t:number, watts:number}[]} points
 * @param {ArrayLike<number>} watts - voller Aktivitaets-Verlauf
 * @param {{start:number, end:number}[]} breakthroughWindows
 * @returns {{ signature: {cp:number, wPrimeJ:number}|null, contradictions: {start:number, end:number, minBalanceJ:number}[] }}
 */
export function checkTwoParamConsistency(points, watts, breakthroughWindows) {
  const fit = fit2ParamCP(points);
  if (!fit) return { signature: null, contradictions: [] };

  const sig = { cp: fit.cp, wPrimeJ: fit.wPrime };
  const bal = wPrimeBalance2ParamUnclamped(watts, sig.cp, sig.wPrimeJ);

  const contradictions = [];
  let runStart = -1;
  let minBal = Infinity;
  const insideBreakthrough = (i) => breakthroughWindows.some((w) => i >= w.start && i < w.end);

  for (let i = 0; i <= bal.length; i++) {
    const negative = i < bal.length && bal[i] < 0 && !insideBreakthrough(i);
    if (negative) {
      if (runStart === -1) runStart = i;
      minBal = Math.min(minBal, bal[i]);
    } else if (runStart !== -1) {
      contradictions.push({ start: runStart, end: i, minBalanceJ: minBal });
      runStart = -1;
      minBal = Infinity;
    }
  }

  return { signature: sig, contradictions };
}
