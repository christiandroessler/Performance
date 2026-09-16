// MPA (Maximum Power Available), Kap. 7.2.
//   MPA(t) = Pmax - (Pmax - CP) * (W'exp(t) / W')^n,   W'exp = W' - W'bal
// Standard n = 2 (Kontro et al. 2024, wie in Kontro et al. 2025 verwendet),
// n = 1 = urspruengliches Morton-Modell (einstellbar, Kap. 12).

import { wPrimeBalanceSkiba2015 } from './wbal.js';

/**
 * @param {number} balanceJ - aktuelles W'bal (Joule)
 * @param {number} cp
 * @param {number} wPrimeJ
 * @param {number} pMax
 * @param {number} [n] - MPA-Exponent, Standard 2
 */
export function mpaAtBalance(balanceJ, cp, wPrimeJ, pMax, n = 2) {
  if (!wPrimeJ) return cp;
  const wExpFrac = 1 - clamp01(balanceJ / wPrimeJ); // (W' - W'bal) / W'
  return pMax - (pMax - cp) * Math.pow(wExpFrac, n);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * MPA-Verlauf ueber einen Watt-Stream. Berechnet bei Bedarf zuerst W'bal.
 * @param {ArrayLike<number>} watts
 * @param {{cp:number, wPrimeJ:number, pMax:number, n?:number}} sig
 * @param {{balance?: Float64Array, startBalanceJ?: number}} [opts]
 * @returns {{ mpa: Float64Array, balance: Float64Array }}
 */
export function mpaTrace(watts, sig, opts = {}) {
  const { cp, wPrimeJ, pMax, n = 2 } = sig;
  const balance =
    opts.balance || wPrimeBalanceSkiba2015(watts, cp, wPrimeJ, { startBalanceJ: opts.startBalanceJ });
  const len = balance.length;
  const mpa = new Float64Array(len);
  if (!cp || !wPrimeJ || !pMax) {
    mpa.fill(cp || 0);
    return { mpa, balance };
  }
  for (let i = 0; i < len; i++) {
    mpa[i] = mpaAtBalance(balance[i], cp, wPrimeJ, pMax, n);
  }
  return { mpa, balance };
}
