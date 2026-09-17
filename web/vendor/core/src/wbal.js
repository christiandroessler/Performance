// W'bal nach Skiba et al. 2015 (Differentialmodell), Kap. 7.3. Exaktes
// Differentialmodell, KEINE Naeherung ueber eine exponentielle Erholungs-
// Zeitkonstante (das waere Skiba 2012 / das "klassische" W'bal, hier nur
// noch als Teil der 2-Parameter-Konsistenzpruefung verwendet, siehe twoParamCheck.js).
//
// Einheitenkonvention im gesamten Rechenkern: W' (HIE) intern immer in JOULE.
// Nur die Anzeigeschicht rechnet auf kJ um (Kap. 5.2 / UI).
//
//   P > CP:  dW'bal/dt = -(P - CP)
//   P <= CP: dW'bal/dt = (W' - W'bal) * (CP - P) / W'
//
// Bei 1-Hz-Abtastung ist dt = 1 s, die Differentialgleichung wird daher per
// Euler-Schritt direkt integriert (kein Naeherungsfehler durch groessere
// Schrittweite). Pausen/Luecken gehen mit P = 0 ein (FA-DQ-04): Erholung
// laeuft weiter.

/**
 * @param {ArrayLike<number>} watts - 1-Hz-Leistung, Luecken/Ausreisser bereits als 0 kodiert (siehe quality.js wattsForRecovery)
 * @param {number} cp - Threshold Power (W)
 * @param {number} wPrimeJ - HIE (Joule)
 * @param {Object} [opts]
 * @param {number} [opts.startBalanceJ] - Startwert (Joule), Standard = voll erholt (wPrimeJ)
 * @returns {Float64Array} W'bal je Sekunde (Joule), geklemmt auf [0, wPrimeJ]
 */
export function wPrimeBalanceSkiba2015(watts, cp, wPrimeJ, { startBalanceJ } = {}) {
  const n = watts ? watts.length : 0;
  const out = new Float64Array(n);
  if (!n || !cp || !wPrimeJ) return out;

  let bal = startBalanceJ != null ? startBalanceJ : wPrimeJ;
  for (let i = 0; i < n; i++) {
    const p = watts[i] || 0;
    const dW = p > cp ? -(p - cp) : ((wPrimeJ - bal) * (cp - p)) / wPrimeJ;
    bal += dW; // dt = 1s
    if (bal < 0) bal = 0;
    else if (bal > wPrimeJ) bal = wPrimeJ;
    out[i] = bal;
  }
  return out;
}

/** Endzustand der letzten Sekunde, oder wPrimeJ falls kein Datenpunkt vorliegt. */
export function finalBalance(watts, cp, wPrimeJ, opts) {
  if (!watts || watts.length === 0) return wPrimeJ;
  const bal = wPrimeBalanceSkiba2015(watts, cp, wPrimeJ, opts);
  return bal[bal.length - 1];
}
