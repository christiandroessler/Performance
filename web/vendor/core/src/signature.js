// Orchestrierung: Startsignatur (FA-SIG-03) + chronologischer Durchlauf mit
// Breakthrough-Erkennung/Refit (FA-SIG-04/05), Medaillen (FA-SIG-06), Strain
// Score (FA-SIG-09) und 2-Parameter-Konsistenzpruefung (FA-SIG-14).
//
// Reine Funktion: gleiche Eingabe -> gleiche Ausgabe, kein I/O (NFA-06).
// Aktivitaeten muessen VORHER mit activity.js#prepareActivity aufbereitet sein.

import { fitMortonRobust } from './cpFit.js';
import { detectMaximalEfforts } from './mmp.js';
import { mpaTrace } from './mpa.js';
import { mergeSettings } from './settings.js';
import {
  detectBreakthroughWindows,
  nearMpaPoints,
  refitSignature,
  refitWindowEnvelope,
  medalFor,
} from './breakthrough.js';
import { checkTwoParamConsistency } from './twoParamCheck.js';
import { computeStrainScore } from './strain.js';
import { normalizedPowerForActivity, trainingStressScore, intensityFactor } from './npTss.js';

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Startsignatur per robuster Regression ueber die Maximalbelastungen der
 * ersten `initialSignatureWindowDays` Tage (FA-SIG-03). Liefert `signature: null`
 * mit einem Grund, wenn die Datenbasis nicht ausreicht - es wird KEINE
 * erfundene Literatur-Startsignatur fuer TP/HIE/PP eingesetzt (siehe core/README.md,
 * Abschnitt "Startsignatur ohne ausreichende Daten").
 */
export function computeInitialSignature(preparedActivities, settings) {
  if (preparedActivities.length === 0) {
    return { signature: null, reason: 'keine Aktivitaeten vorhanden', windowActivityIds: [] };
  }
  const sorted = [...preparedActivities].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = sorted[0].date;
  const cutoff = addDaysISO(startDate, settings.initialSignatureWindowDays);
  const windowActivities = sorted.filter((a) => a.date < cutoff);
  const windowActivityIds = windowActivities.map((a) => a.id);

  const curves = windowActivities.map((a) => ({ date: a.date, activityId: a.id, mmp: a.mmp }));
  const envelope = detectMaximalEfforts(curves, { nearPct: 0.9 });
  if (envelope.length < 4) {
    return {
      signature: null,
      reason: `zu wenige Maximalbelastungen in den ersten ${settings.initialSignatureWindowDays} Tagen (${envelope.length} Stuetzpunkte, mind. 4 noetig)`,
      windowActivityIds,
    };
  }

  const points = envelope.map((e) => ({ t: e.t, watts: e.watts }));
  const fit = fitMortonRobust(points);
  if (!fit || fit.model !== '3p') {
    return {
      signature: null,
      reason: 'Regression konvergierte nicht zu einem 3-Parameter-Modell (zu wenig Streuung ueber die Dauern)',
      windowActivityIds,
      fit,
    };
  }

  return {
    signature: { cp: fit.cp, wPrimeJ: fit.wPrime, pMax: fit.pMax },
    effectiveDate: cutoff,
    fit,
    windowActivityIds,
  };
}

/**
 * @param {ReturnType<typeof import('./activity.js').prepareActivity>[]} preparedActivities
 * @param {Object} [options]
 * @param {Partial<import('./types.js').ModelSettings>} [options.settings]
 * @param {Set<string>} [options.discardedBreakthroughIds] - FA-SIG-07
 */
export function computeSignatureHistory(preparedActivities, options = {}) {
  const settings = mergeSettings(options.settings);
  const discarded = options.discardedBreakthroughIds || new Set();

  const sorted = [...preparedActivities].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const initial = computeInitialSignature(sorted, settings);

  const result = {
    settings,
    initial,
    history: [],
    breakthroughs: [],
    activityResults: [],
  };

  if (!initial.signature) {
    result.needsMoreData = true;
    // Aktivitaeten vor Erreichen der Datenbasis bekommen keine Modellkennzahlen.
    for (const act of sorted) {
      result.activityResults.push({ id: act.id, date: act.date, hasSignature: false });
    }
    return result;
  }

  result.history.push({ date: initial.effectiveDate, ...initial.signature, source: 'initial' });

  const allCurves = sorted.map((a) => ({ date: a.date, activityId: a.id, mmp: a.mmp }));

  let active = initial.signature;
  let lastEndTime = null;
  let lastEndBalanceJ = null;

  for (const act of sorted) {
    if (act.date < initial.effectiveDate) {
      // Teil der Startfenster-Regression, keine eigene Breakthrough-Auswertung (siehe core/README.md).
      result.activityResults.push({ id: act.id, date: act.date, hasSignature: false, usedForInitialFit: true });
      continue;
    }

    const gapSec = lastEndTime ? (new Date(act.startTime) - new Date(lastEndTime)) / 1000 : Infinity;
    const startBalanceJ =
      gapSec <= settings.maxGapSecondsForWbalContinuity && lastEndBalanceJ != null ? lastEndBalanceJ : active.wPrimeJ;

    const sigForTrace = { cp: active.cp, wPrimeJ: active.wPrimeJ, pMax: active.pMax, n: settings.mpaExponent };
    const { mpa, balance } = mpaTrace(act.recoveryWatts, sigForTrace, { startBalanceJ });

    const windows = detectBreakthroughWindows(act.recoveryWatts, mpa, act.mask, settings);
    const nearPts = nearMpaPoints(act.recoveryWatts, mpa, act.mask, settings);

    // 2-Parameter-Konsistenzpruefung (FA-SIG-14) - protokollnah, keine eigene Ansicht.
    const twoParam = checkTwoParamConsistency(nearPts, act.recoveryWatts, windows);

    let breakthroughRecord = null;
    let signatureAfter = active;

    if (windows.length > 0) {
      const envelope = refitWindowEnvelope(allCurves, act.date, settings);
      const refit = refitSignature({
        activeSignature: active,
        nearMpaPts: nearPts,
        envelopePts: envelope,
        breakthroughWatts: act.recoveryWatts,
        breakthroughMask: act.mask,
        breakthroughWindows: windows,
        settings,
      });
      const { medal, risen, fallen } = medalFor(active, refit.signature, settings.medalThreshold);
      const isDiscarded = discarded.has(act.id);

      breakthroughRecord = {
        id: act.id,
        activityId: act.id,
        date: act.date,
        windows,
        previousSignature: active,
        proposedSignature: refit.signature,
        droppedByBrake: refit.dropped,
        medal,
        risen,
        fallen,
        discarded: isDiscarded,
        constraintUnsatisfied: refit.constraintUnsatisfied, // Datenqualitaet pruefen, siehe core/README.md
      };
      result.breakthroughs.push(breakthroughRecord);

      if (!isDiscarded) {
        signatureAfter = refit.signature;
        result.history.push({ date: act.date, ...refit.signature, source: 'refit', breakthroughId: act.id });
      }
    }

    const np = normalizedPowerForActivity(act.stream, act.mask);
    const movingSeconds = sumUint8(act.mask);
    const tss = trainingStressScore(movingSeconds, np, active.cp);
    const ifValue = intensityFactor(np, active.cp);
    const strain = computeStrainScore(act.recoveryWatts, mpa, active.cp, active.pMax);

    result.activityResults.push({
      id: act.id,
      date: act.date,
      hasSignature: true,
      signature: active, // zum Aktivitaetsdatum gueltige Schwelle, siehe core/README.md
      np: Math.round(np),
      if: ifValue != null ? Math.round(ifValue * 1000) / 1000 : null,
      tss: Math.round(tss * 10) / 10,
      strain,
      breakthrough: breakthroughRecord,
      twoParamContradictions: twoParam.contradictions,
    });

    lastEndTime = act.endTime;
    lastEndBalanceJ = Math.min(balance[balance.length - 1] ?? signatureAfter.wPrimeJ, signatureAfter.wPrimeJ);
    active = signatureAfter;
  }

  return result;
}

function sumUint8(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

/**
 * Signatur, die an einem bestimmten Datum gueltig war (letzter history-Eintrag <= date).
 * @param {ReturnType<typeof computeSignatureHistory>['history']} history
 * @param {string} date
 */
export function signatureAtDate(history, date) {
  let current = null;
  for (const entry of history) {
    if (entry.date <= date) current = entry;
    else break;
  }
  return current;
}
