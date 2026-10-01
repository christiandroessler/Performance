// Breakthrough-Erkennung (Kap. 7.4) und Refit mit Umverteilung (Kap. 7.5).
// Siehe core/README.md fuer die M1-Festlegungen zu den im Lastenheft offen
// gelassenen Punkten (Naehe-Schwelle fuer Refit-Punkte, "gestuetzt"-Kriterium
// der Absenkbremse, Verfahren zur Nebenbedingungs-Korrektur).

import { fitMortonRobust, mortonPower } from './cpFit.js';
import { mpaTrace, mpaAtBalance } from './mpa.js';
import { detectMaximalEfforts } from './mmp.js';

/**
 * Zusammenhaengende Ueberschreitungs-Fenster P(t) > MPA(t)*(1+eps) fuer
 * mindestens `breakthroughMinSeconds` Sekunden, nur an gueltigen Punkten (FA-DQ-01/03).
 * @param {ArrayLike<number>} watts
 * @param {ArrayLike<number>} mpa
 * @param {Uint8Array} mask
 * @param {import('./types.js').ModelSettings} settings
 */
export function detectBreakthroughWindows(watts, mpa, mask, settings) {
  const { breakthroughEpsilon, breakthroughMinSeconds } = settings;
  const n = watts.length;
  const windows = [];
  let runStart = -1;

  for (let i = 0; i <= n; i++) {
    const exceeds = i < n && mask[i] && watts[i] > mpa[i] * (1 + breakthroughEpsilon);
    if (exceeds && runStart === -1) runStart = i;
    if (!exceeds && runStart !== -1) {
      if (i - runStart >= breakthroughMinSeconds) windows.push({ start: runStart, end: i });
      runStart = -1;
    }
  }
  return windows;
}

/**
 * Punkte "nahe der MPA" innerhalb einer Aktivitaet: zusammenhaengende Laeufe,
 * in denen |MPA(t) - P(t)| / MPA(t) <= refitNearMpaThreshold gilt, umgewandelt
 * in {t: Laufdauer, watts: Durchschnittsleistung des Laufs} - analog zur
 * MMP-Extraktion, aber auf Rohsekunden statt auf dem festen Dauerraster.
 */
export function nearMpaPoints(watts, mpa, mask, settings) {
  const { refitNearMpaThreshold } = settings;
  const n = watts.length;
  const points = [];
  let runStart = -1;
  let sum = 0;

  const flush = (end) => {
    if (runStart === -1) return;
    const len = end - runStart;
    points.push({ t: len, watts: sum / len });
    runStart = -1;
    sum = 0;
  };

  for (let i = 0; i <= n; i++) {
    const near =
      i < n && mask[i] && mpa[i] > 0 && Math.abs(mpa[i] - watts[i]) / mpa[i] <= refitNearMpaThreshold;
    if (near) {
      if (runStart === -1) runStart = i;
      sum += watts[i];
    } else {
      flush(i);
    }
  }
  return points;
}

/**
 * Robuster Refit mit Umverteilung (Kap. 7.5). TP/HIE/PP werden wie
 * vorgeschrieben GEMEINSAM neu geschaetzt (`fitMortonRobust`) - aber Pmax
 * bleibt dabei explizit auf dem bisherigen Wert FIXIERT, solange die
 * Stuetzpunkte dieses Refits keine echte Sprint-Dauer enthalten
 * (`settings.pmaxEvidenceMaxSeconds`/`minPmaxEvidenceCount`, siehe
 * core/README.md "Pmax-Stabilitaet"). Grund: Pmax ist aus Aktivitaeten ohne
 * kurze Anstrengungen strukturell schlecht bestimmt (bestaetigt an echten
 * Nutzerdaten UND in der Literatur, siehe core/README.md) und sollte -
 * anders als TP/HIE, die aus jeder laengeren Anstrengung Evidenz ziehen -
 * nur bei tatsaechlicher Sprint-Evidenz neu bewertet werden.
 * @param {Object} args
 * @param {{cp:number, wPrimeJ:number, pMax:number}} args.activeSignature - Signatur VOR diesem Breakthrough
 * @param {{t:number, watts:number}[]} args.nearMpaPts - siehe nearMpaPoints (aus der Breakthrough-Aktivitaet)
 * @param {{t:number, watts:number, support:number, supportingActivityIds:Set}[]} args.envelopePts - siehe detectMaximalEfforts (letzte refitWindowDays)
 * @param {ArrayLike<number>} args.breakthroughWatts - voller Watt-Verlauf der Breakthrough-Aktivitaet
 * @param {ArrayLike<number>} args.breakthroughMask
 * @param {{start:number, end:number}[]} args.breakthroughWindows - erkannte Ueberschreitungs-Fenster (siehe detectBreakthroughWindows); die Nebenbedingung wird NUR darauf geprueft, siehe core/README.md
 * @param {import('./types.js').ModelSettings} args.settings
 * @returns {{ signature: {cp:number, wPrimeJ:number, pMax:number}, dropped: string[], fit: object|null, constraintUnsatisfied?: boolean }}
 */
export function refitSignature({
  activeSignature,
  nearMpaPts,
  envelopePts,
  breakthroughWatts,
  breakthroughMask,
  breakthroughWindows,
  settings,
}) {
  const points = [...nearMpaPts, ...envelopePts.map((e) => ({ t: e.t, watts: e.watts }))];
  const { holdPMax, holdWPrime } = determineHoldFlags(points, activeSignature.cp, settings);
  const fit = fitMortonRobust(points, {
    pMaxHint: activeSignature.pMax,
    wPrimeHint: activeSignature.wPrimeJ,
    holdPMax,
    holdWPrime,
  });
  if (!fit) {
    return { signature: activeSignature, dropped: [], fit: null };
  }

  const enoughSupport = hasEnoughSupportingActivities(envelopePts, settings.minSupportingActivitiesForDrop);
  const proposed = buildProposedSignature(fit, activeSignature, settings);

  const dropped = [];
  const braked = applyDropBrake(activeSignature, proposed, settings.maxDropPerBreakthrough, enoughSupport, dropped);
  // Absolute Plausibilitaetsgrenze `maxPlausibleWPrimeJ` (Defense-in-Depth, siehe
  // core/README.md "HIE-Stabilitaet"): NACH der Absenkbremse angewendet, nicht davor - sonst
  // wuerde die Absenkbremse selbst (die eine grosse Korrektur ohne "enoughSupport" auf
  // `maxDropPerBreakthrough` je Breakthrough begrenzt) einen bereits "vergifteten", zu hohen
  // Wert nur langsam statt sofort auf die Grenze zurueckfuehren. Wie bei
  // `maxPlausibleCp`/`maxPlausiblePMax` (siehe `enforceMpaConstraint` unten) ist eine absolute
  // Plausibilitaetsgrenze kein normaler "Abstieg", der Stuetzung braucht, sondern eine
  // Korrektur eines bereits unplausiblen Zustands. Am real-daten-verifizierten Verlauf
  // (Maximalwert 31368 J, weit unter der Grenze) ist das ein No-op.
  braked.wPrimeJ = Math.min(braked.wPrimeJ, settings.maxPlausibleWPrimeJ);
  const { signature: corrected, constraintUnsatisfied } = enforceMpaConstraint(
    braked,
    breakthroughWatts,
    breakthroughMask,
    breakthroughWindows,
    settings
  );

  return { signature: corrected, dropped, fit, constraintUnsatisfied };
}

/**
 * Zaehlt Stuetzpunkte, die als "Evidenz" fuer einen Parameter zaehlen: Dauer
 * im Bereich [minSeconds, maxSeconds] UND Leistung >= minCpMultiple * cp.
 * Gemeinsame Pruefung fuer Pmax-Sprint-Evidenz UND W'-Evidenz (core/README.md
 * "Pmax-Stabilitaet"/"HIE-Stabilitaet") - nur die konkreten Schwellen
 * unterscheiden sich je Parameter, nicht die Pruefung selbst.
 * @param {{t:number, watts:number}[]} points
 * @param {number} cp - aktuelle TP (Referenz fuer "Vielfaches von TP")
 * @param {{minSeconds:number, maxSeconds:number, minCpMultiple:number}} thresholds
 */
function countEvidencePoints(points, cp, { minSeconds, maxSeconds, minCpMultiple }) {
  return points.filter((p) => p.t >= minSeconds && p.t <= maxSeconds && p.watts >= minCpMultiple * cp).length;
}

/**
 * Ob Pmax bzw. W' beim anstehenden Fit gehalten werden muessen, weil zu
 * wenig Evidenz im jeweils informativen Dauerbereich vorliegt (siehe
 * `countEvidencePoints`). Pmax-Schwelle startet bei 0s (Sprint-Evidenz
 * braucht mehr als "irgendein Punkt bei kurzer Dauer" - die 90-Tage-Envelope
 * liefert IMMER einen 1-20s-Bestwert, auch ohne jede Sprintabsicht; erst
 * deutlich ueber der aktuellen TP, siehe `pmaxEvidenceMinCpMultiple`, ist ein
 * kurzer Punkt tatsaechlich sprint-artig).
 */
function determineHoldFlags(points, cp, settings) {
  const sprintEvidenceCount = countEvidencePoints(points, cp, {
    minSeconds: 0,
    maxSeconds: settings.pmaxEvidenceMaxSeconds,
    minCpMultiple: settings.pmaxEvidenceMinCpMultiple,
  });
  const holdPMax = sprintEvidenceCount < settings.minPmaxEvidenceCount;

  const wPrimeEvidenceCount = countEvidencePoints(points, cp, {
    minSeconds: settings.wprimeEvidenceMinSeconds,
    maxSeconds: settings.wprimeEvidenceMaxSeconds,
    minCpMultiple: settings.wprimeEvidenceMinCpMultiple,
  });
  const holdWPrime = wPrimeEvidenceCount < settings.minWprimeEvidenceCount;

  return { holdPMax, holdWPrime, sprintEvidenceCount, wPrimeEvidenceCount };
}

/** Mindestanzahl GETRENNTER Aktivitaeten, die die Envelope-Stuetzpunkte stuetzen (Absenkbremse). */
function hasEnoughSupportingActivities(envelopePts, minSupportingActivitiesForDrop) {
  const distinctActivities = new Set();
  for (const e of envelopePts) {
    if (e.supportingActivityIds) for (const id of e.supportingActivityIds) distinctActivities.add(id);
  }
  return distinctActivities.size >= minSupportingActivitiesForDrop;
}

/**
 * Wendet beide Traegheitsbremsen (Pmax/W', siehe `applyInertiaBrake` unten)
 * auf den rohen Fit an, um die "vorgeschlagene" Signatur VOR Absenkbremse/
 * Nebenbedingungs-Korrektur zu bilden. cp durchlaeuft bewusst KEINE Bremse
 * hier (Kap. 7.5: "Anstiege sind nie gebremst" - nur die separate
 * Absenkbremse unten begrenzt cp, und nur bei Abstieg).
 */
function buildProposedSignature(fit, activeSignature, settings) {
  return {
    cp: fit.cp,
    // HIE-Traegheitsbremse (siehe core/README.md "HIE-Stabilitaet"): derselbe Grund wie bei
    // Pmax unten - W' ist strukturell schlecht bestimmt ohne echte nahe-erschoepfende
    // Anstrengungen im informativen Dauerbereich und in der Literatur als das instabilste
    // CP-Modell-Parameter beschrieben (Test-Retest-Variabilitaet). Deshalb - als dieselbe
    // bewusste Ausnahme von Kap. 7.5s "Anstiege sind nie gebremst" wie bei Pmax - symmetrisch
    // auf `maxWprimeChangePerBreakthrough` begrenzt, unabhaengig von "enoughSupport".
    wPrimeJ: applyInertiaBrake(activeSignature.wPrimeJ, fit.wPrime, settings.maxWprimeChangePerBreakthrough),
    // Pmax-Traegheitsbremse (siehe core/README.md "Pmax-Stabilitaet"): anders als cp, wo
    // ein Anstieg IMMER voll durchgereicht wird (Kap. 7.5: "Anstiege sind nie gebremst" - ein
    // Breakthrough ist eine belegte neue Bestleistung), schwankt der rohe Pmax-Fit selbst BEI
    // vorhandener Sprint-Evidenz noch stark von Fenster zu Fenster (am echten Datensatz
    // bestaetigt: 450-1092W innerhalb eines Jahres, ohne erkennbaren Trend). Ein Anstieg UND ein
    // Abstieg werden deshalb symmetrisch auf `maxPmaxChangePerBreakthrough` je Breakthrough
    // begrenzt, unabhaengig von "enoughSupport" (das gilt nur fuer die separate Absenkbremse
    // unten). `fit.pMax` selbst bleibt unveraendert (Transparenz, `rawFit` in der UI).
    pMax: fit.pMax != null ? applyInertiaBrake(activeSignature.pMax, fit.pMax, settings.maxPmaxChangePerBreakthrough) : activeSignature.pMax,
  };
}

/**
 * Traegheitsbremse fuer Pmax und W' (M1-Festlegung, siehe core/README.md
 * "Pmax-Stabilitaet"/"HIE-Stabilitaet"): symmetrische Begrenzung der
 * AENDERUNG (Anstieg UND Abstieg) je Breakthrough, unabhaengig von der (nur
 * fuer Abstiege geltenden) Absenkbremse unten.
 */
function applyInertiaBrake(activeValue, proposedValue, maxChangePct) {
  if (!activeValue || proposedValue == null) return proposedValue ?? activeValue;
  const maxDelta = activeValue * maxChangePct;
  return Math.max(activeValue - maxDelta, Math.min(activeValue + maxDelta, proposedValue));
}

/**
 * Absenkbremse: ein Parameter sinkt pro Breakthrough um hoechstens maxDrop,
 * und nur, wenn genug getrennte Aktivitaeten das stuetzen (sonst wird die
 * volle Absenkung auf maxDrop geklemmt). Anstiege sind nie gebremst.
 */
function applyDropBrake(active, proposed, maxDrop, enoughSupport, droppedOut) {
  const result = {};
  for (const key of ['cp', 'wPrimeJ', 'pMax']) {
    const oldV = active[key];
    const newV = proposed[key];
    if (newV >= oldV || !oldV) {
      result[key] = newV;
      continue;
    }
    const dropFrac = (oldV - newV) / oldV;
    if (dropFrac > maxDrop && !enoughSupport) {
      droppedOut.push(key);
      result[key] = oldV * (1 - maxDrop);
    } else if (dropFrac > maxDrop) {
      // gestuetzte Absenkung darf ueber maxDrop hinausgehen, siehe core/README.md
      result[key] = newV;
    } else {
      result[key] = newV;
    }
  }
  return result;
}

/**
 * Nebenbedingung (Kap. 7.5): nach dem Refit muss die MPA ueberall mindestens
 * auf Hoehe der gemessenen Leistung liegen (innerhalb der Toleranz) - geprueft
 * NUR innerhalb der erkannten Breakthrough-Fenster, nicht ueber die gesamte
 * Aktivitaet (Begruendung: siehe core/README.md, "Nebenbedingung nach dem Refit").
 *
 * Korrektur: Je nachdem, WO innerhalb der Fenster die Verletzung auftritt,
 * wirkt ein anderer Hebel:
 * - Nahe vollstaendiger W'bal-Entladung (Erschoepfungsanteil > 98 %) gilt
 *   MPA = Pmax - (Pmax-CP)*frac^n mit frac -> 1, also MPA -> CP. Dort wirkt
 *   NUR eine CP-Erhoehung - Pmax hat praktisch keinen Einfluss mehr.
 * - Bei noch vorhandenem W'bal (frisch bis maessig ermuedet) wirkt Pmax wie
 *   gewohnt als direkter Hebel auf die MPA-Kurve.
 * Beide Hebel sind nach oben begrenzt - und zwar durch das ENGERE der zwei
 * folgenden Daecher, nicht nur durch die absolute Plausibilitaetsgrenze:
 * - `settings.maxPlausiblePMax`/`maxPlausibleCp` (absolute physiologische
 *   Grenzen, wie bisher).
 * - `settings.maxMpaCorrectionPct` relativ zum Wert, mit dem diese Funktion
 *   aufgerufen wurde (dem rohen, bereits Absenkbremse-korrigierten Fit) -
 *   siehe "Relative Korrekturgrenze" in core/README.md fuer die Herleitung.
 * Wird eine der beiden Grenzen erreicht, ohne dass die Bedingung erfuellt
 * ist, markiert `constraintUnsatisfied: true` den Breakthrough als
 * pruefungsbeduerftig, statt eine unplausible Signatur unbemerkt zu
 * uebernehmen.
 *
 * Nur-Pmax-Korrekturen liefen in ~70% der Faelle im echten 7-Jahres-Datensatz
 * (`scripts/run-legacy-db.js`) ins Leere, weil lange/harte Breakthrough-
 * Fenster W'bal haeufig selbst vollstaendig entladen - genau der Fall, den
 * nur eine CP-Erhoehung loesen kann.
 */
function enforceMpaConstraint(sig, watts, mask, windows, settings) {
  const { breakthroughEpsilon, mpaExponent, maxPlausiblePMax, maxPlausibleCp, maxMpaCorrectionPct } = settings;
  let cp = sig.cp;
  let pMax = sig.pMax;
  const cpCeiling = Math.min(maxPlausibleCp, sig.cp * (1 + maxMpaCorrectionPct));
  const pMaxCeiling = Math.min(maxPlausiblePMax, sig.pMax * (1 + maxMpaCorrectionPct));
  const maxIterations = 500;

  const check = () => {
    const { mpa, balance } = mpaTrace(watts, { cp, wPrimeJ: sig.wPrimeJ, pMax, n: mpaExponent });
    let violated = false;
    let worstExhaustionFrac = 0; // Erschoepfungsanteil (1 - W'bal/W') am staerksten verletzten Punkt
    for (const w of windows) {
      for (let i = w.start; i < w.end; i++) {
        if (mask[i] && watts[i] > mpa[i] * (1 + breakthroughEpsilon)) {
          violated = true;
          const frac = 1 - clamp01(balance[i] / sig.wPrimeJ);
          if (frac > worstExhaustionFrac) worstExhaustionFrac = frac;
        }
      }
    }
    return { violated, worstExhaustionFrac };
  };

  let state = check();
  let iter = 0;
  while (state.violated && iter < maxIterations) {
    const nearFullDepletion = state.worstExhaustionFrac > 0.98;
    if (nearFullDepletion && cp < cpCeiling) {
      cp = Math.min(cp * 1.01, cpCeiling);
    } else if (pMax < pMaxCeiling) {
      pMax = Math.min(pMax * 1.01, pMaxCeiling);
    } else if (cp < cpCeiling) {
      cp = Math.min(cp * 1.01, cpCeiling);
    } else {
      break; // beide Korrekturgrenzen erreicht
    }
    state = check();
    iter++;
  }

  return { signature: { ...sig, cp, pMax }, constraintUnsatisfied: state.violated };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/** Envelope-Punkte der letzten `refitWindowDays` Tage bis einschliesslich `untilDate`. */
export function refitWindowEnvelope(perActivityMMP, untilDate, settings) {
  return detectMaximalEfforts(perActivityMMP, {
    sinceDays: settings.refitWindowDays,
    untilDate,
    nearPct: 0.9,
  });
}

/**
 * Medaillenlogik (Kap. 7.5, F9): zaehlt Parameter, die um >= medalThreshold
 * gestiegen sind. Bronze=1, Silber=2, Gold=3.
 */
export function medalFor(oldSig, newSig, medalThreshold) {
  const risen = [];
  const fallen = [];
  for (const key of ['cp', 'wPrimeJ', 'pMax']) {
    const oldV = oldSig[key];
    const newV = newSig[key];
    if (!oldV) continue;
    const change = (newV - oldV) / oldV;
    if (change >= medalThreshold) risen.push(key);
    else if (newV < oldV) fallen.push(key);
  }
  const medal = risen.length >= 3 ? 'gold' : risen.length === 2 ? 'silver' : risen.length === 1 ? 'bronze' : null;
  return { medal, risen, fallen };
}
