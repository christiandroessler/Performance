// Critical-Power-Regression: 2-Parameter (Monod-Scherrer, nur fuer die
// 2-Parameter-Konsistenzpruefung FA-SIG-14) und 3-Parameter (Morton 1996,
// Kap. 7.1) per Levenberg-Marquardt mit robuster IRLS-Gewichtung fuer den
// Refit (Kap. 7.5: "robuste Regression, bei der Ausreisser heruntergewichtet
// werden").
//
// Eingabe ueberall: Punkte { t (s), watts }. Keine I/O, keine Zufallszahlen -
// deterministisch bei gleicher Eingabe (NFA-06, Abnahme M1).

function mean(a, w) {
  if (!a || !a.length) return 0;
  if (!w) {
    let s = 0;
    for (const x of a) s += x;
    return s / a.length;
  }
  let sw = 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * w[i];
    sw += w[i];
  }
  return sw > 0 ? s / sw : 0;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** 2-Parameter: Arbeit W(t) = cp*t + wPrime -> gewichtete lineare Regression von P*t gegen t. */
export function fit2ParamCP(points, weights) {
  const pts = (points || []).filter((p) => p.watts > 0 && p.t > 0);
  if (pts.length < 2) return null;
  const w = weights || pts.map(() => 1);

  const xs = pts.map((p) => p.t);
  const ys = pts.map((p) => p.watts * p.t);
  const mx = mean(xs, w);
  const my = mean(ys, w);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += w[i] * (xs[i] - mx) * (ys[i] - my);
    den += w[i] * (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const cp = num / den;
  const wPrime = my - cp * mx;
  if (cp <= 0 || wPrime <= 0) return null;

  const rmse = rmseOf(pts, (t) => cp + wPrime / t);
  return { cp: Math.round(cp), wPrime: Math.round(wPrime), model: '2p', rmse };
}

/** P(t) = cp + wPrime / ( t + wPrime/(pMax - cp) ) -- Morton 1996, Kap. 7.1 */
export function mortonPower(t, cp, wPrime, pMax) {
  return cp + wPrime / (t + wPrime / (pMax - cp));
}

/**
 * 3-Parameter-Fit per Levenberg-Marquardt mit optionalen Punktgewichten
 * (fuer robuste IRLS-Regression, siehe fitMortonRobust). Faellt auf das
 * 2-Parameter-Modell zurueck, wenn zu wenige Punkte vorliegen oder das
 * 3-Parameter-Ergebnis unplausibel/schlechter ist.
 *
 * `fixedPMax` (siehe core/README.md "Pmax-Stabilitaet"): wenn gesetzt, bleibt
 * Pmax waehrend der gesamten Optimierung auf diesem Wert fixiert - effektiv
 * ein 2-Parameter-Fit (nur cp/wPrime), der weiterhin dieselbe LM-Maschinerie
 * nutzt (die dritte Dimension wird nach jedem Schritt einfach zurueckgeklemmt).
 * Grund: Pmax ist aus Aktivitaeten ohne echte Sprint-Dauern (siehe
 * `refitSignature`) strukturell schlecht bestimmt - ein Ergebnis wird nicht
 * "unbelegt frisch geschaetzt" zurueckgegeben, sondern haelt den bisherigen
 * Wert, bis echte kurze Anstrengungen vorliegen.
 */
export function fitMortonCP(points, { pMaxHint, weights, fixedPMax } = {}) {
  const pts = (points || []).filter((p) => p.watts > 0 && p.t > 0).sort((a, b) => a.t - b.t);
  const w = weights || pts.map(() => 1);
  const two = fit2ParamCP(pts, w);
  if (pts.length < 4) return two;

  const maxP = Math.max(...pts.map((p) => p.watts));
  let cp = two ? two.cp : 250;
  let wPrime0 = two ? two.wPrime : 15000;
  let pmax = fixedPMax != null ? fixedPMax : clamp(Math.max(pMaxHint || 0, maxP * 1.05, cp * 2), cp + 80, 2500);

  const CLAMP = [
    [120, 500],
    [4000, 45000],
    [Math.max(cp + 60, 450), 2600],
  ];
  const applyClamp = (v) => [
    clamp(v[0], CLAMP[0][0], CLAMP[0][1]),
    clamp(v[1], CLAMP[1][0], CLAMP[1][1]),
    fixedPMax != null ? fixedPMax : clamp(v[2], Math.max(v[0] + 60, 450), 2600),
  ];

  let theta = applyClamp([cp, wPrime0, pmax]);
  let lambda = 1e-3;
  const wrmse = (fn) => rmseOf(pts, fn, w);
  let prevRmse = wrmse((t) => mortonPower(t, theta[0], theta[1], theta[2]));

  for (let iter = 0; iter < 120; iter++) {
    const [c, ww, pm] = theta;
    const res = pts.map((p) => mortonPower(p.t, c, ww, pm) - p.watts);

    const h = [c * 1e-4 || 1e-4, ww * 1e-4 || 1e-2, pm * 1e-4 || 1e-2];
    const J = pts.map((p, i) => {
      const d = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const tp = theta.slice();
        tp[k] += h[k];
        d[k] = (mortonPower(p.t, tp[0], tp[1], tp[2]) - (res[i] + p.watts)) / h[k];
      }
      return d;
    });

    const JtJ = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const Jtr = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const wi = w[i];
      for (let a = 0; a < 3; a++) {
        Jtr[a] += wi * J[i][a] * res[i];
        for (let b = 0; b < 3; b++) JtJ[a][b] += wi * J[i][a] * J[i][b];
      }
    }
    for (let a = 0; a < 3; a++) JtJ[a][a] *= 1 + lambda;

    const step = solve3(JtJ, [-Jtr[0], -Jtr[1], -Jtr[2]]);
    if (!step) break;

    const cand = applyClamp([theta[0] + step[0], theta[1] + step[1], theta[2] + step[2]]);
    const candRmse = wrmse((t) => mortonPower(t, cand[0], cand[1], cand[2]));

    if (candRmse < prevRmse) {
      theta = cand;
      lambda = Math.max(lambda * 0.5, 1e-9);
      if (prevRmse - candRmse < 1e-4) {
        prevRmse = candRmse;
        break;
      }
      prevRmse = candRmse;
    } else {
      lambda *= 4;
      if (lambda > 1e8) break;
    }
  }

  const [cpF, wF, pmF] = theta;
  const rmse = prevRmse;

  const obs = pts.map((p) => p.watts);
  const mo = mean(obs, w);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < pts.length; i++) {
    ssTot += w[i] * (pts[i].watts - mo) ** 2;
    ssRes += w[i] * (pts[i].watts - mortonPower(pts[i].t, cpF, wF, pmF)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const bad =
    !Number.isFinite(cpF) ||
    !Number.isFinite(wF) ||
    !Number.isFinite(pmF) ||
    pmF <= cpF + 50 ||
    (two && rmse > two.rmse * 1.05);
  if (bad) return two;

  const tMin = pts[0].t;
  const tMax = pts[pts.length - 1].t;
  const spread = Math.log(tMax / Math.max(1, tMin)) / Math.log(60);
  const confidence = clamp(clamp(r2, 0, 1) * Math.min(1, pts.length / 6) * clamp(spread, 0, 1), 0, 1);

  return {
    cp: Math.round(cpF),
    wPrime: Math.round(wF),
    pMax: Math.round(pmF),
    model: '3p',
    rmse: Math.round(rmse * 10) / 10,
    r2: Math.round(r2 * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
    pMaxFixed: fixedPMax != null,
  };
}

/**
 * Robuste 3-Parameter-Regression: IRLS (Iteratively Reweighted Least Squares)
 * mit Tukey-Biweight-Gewichten um `fitMortonCP`. Standard-Tuning-Konstante
 * c = 4.685 (bei normalverteilten Residuen ~95% Effizienz), 3 aeussere
 * Iterationen. Siehe core/README.md, Abschnitt "Robuste Regression".
 *
 * `holdPMax`: haelt Pmax fest auf `pMaxHint` (siehe `fitMortonCP`s
 * `fixedPMax`) - siehe core/README.md "Pmax-Stabilitaet" fuer die
 * Entscheidung, WANN das gilt (keine Stuetzpunkte im Sprint-Dauernbereich).
 */
export function fitMortonRobust(points, { pMaxHint, iterations = 3, tukeyC = 4.685, holdPMax = false } = {}) {
  const pts = (points || []).filter((p) => p.watts > 0 && p.t > 0);
  if (pts.length === 0) return null;
  const fixedPMax = holdPMax ? pMaxHint : undefined;

  let weights = pts.map(() => 1);
  let result = fitMortonCP(pts, { pMaxHint, weights, fixedPMax });
  if (!result) return null;

  for (let iter = 0; iter < iterations; iter++) {
    const predict =
      result.model === '3p'
        ? (t) => mortonPower(t, result.cp, result.wPrime, result.pMax)
        : (t) => result.cp + result.wPrime / t;
    const residuals = pts.map((p) => p.watts - predict(p.t));
    const absRes = residuals.map(Math.abs);
    const mad = median(absRes) || 1;
    const scale = 1.4826 * mad; // robuste Sigma-Schaetzung
    weights = residuals.map((r) => {
      const u = scale > 0 ? r / (tukeyC * scale) : 0;
      return Math.abs(u) >= 1 ? 0 : (1 - u * u) ** 2;
    });
    if (weights.every((w) => w === 0)) break; // Degeneriert, letztes Ergebnis behalten

    const next = fitMortonCP(pts, { pMaxHint, weights, fixedPMax });
    if (!next) break;
    result = next;
  }

  return result;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function solve3(A, b) {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

function rmseOf(pts, predFn, weights) {
  let s = 0;
  let sw = 0;
  for (let i = 0; i < pts.length; i++) {
    const w = weights ? weights[i] : 1;
    s += w * (predFn(pts[i].t) - pts[i].watts) ** 2;
    sw += w;
  }
  return sw > 0 ? Math.sqrt(s / sw) : 0;
}

/** Modellierte Leistungs-Dauer-Kurve aus einer Signatur (fuer Plot ueber die MMP). */
export function powerDurationCurve(sig, grid) {
  if (!sig || !sig.cp) return [];
  const { cp, wPrime, pMax } = sig;
  return grid.map((t) => ({
    t,
    watts: Math.round(pMax && pMax > cp ? mortonPower(t, cp, wPrime, pMax) : cp + wPrime / t),
  }));
}
