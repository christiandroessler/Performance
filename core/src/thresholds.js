// FA-TP-03/04: sportartspezifische Schwellen-Schaetzung (Schwellen-HF je Sportart,
// Lauf-/Schwimm-Schwellenpace, Rad-Schwellen-HF aus Leistung nahe TP) und darauf
// aufbauend FA-TP-02/05: hrTSS/Pace-TSS-Fallback fuer Aktivitaeten ohne (nutzbare)
// Leistung, bzw. explizit kein TSS, wenn auch das nicht moeglich ist.
//
// M1-Festlegungen (Lastenheft laesst die Methodik bewusst offen, siehe
// core/README.md Abschnitt "Sportart-Schwellen-Schaetzung (FA-TP-03/04)"):
// - "Beste Anstrengung" je Aktivitaet = bester gleitender Mittelwert (Pace bzw.
//   HF) ueber `thresholdEffortSeconds` (Standard 20 Min) - dieselbe Mean-Maximal-
//   Technik wie fuer die CP-Regression (mmp.js), nur auf Geschwindigkeit/HF
//   statt Watt angewandt.
// - Rollierendes Fenster (`thresholdEstimationWindowDays`, Standard 180 Tage):
//   die Schwelle ist das Maximum der besten Anstrengungen aller Aktivitaeten der
//   Sportart in diesem Fenster, zum jeweiligen Aktivitaetsdatum neu ausgewertet
//   (FA-TP-08: chronologisch gueltige Schwelle je Datum). Anders als bei CP gibt
//   es keinen Breakthrough-/Refit-Mechanismus, der alte Bestleistungen ersetzt -
//   das rollierende Fenster uebernimmt diese Rolle stattdessen (eine Bestleistung
//   "verjaehrt" nach thresholdEstimationWindowDays).
// - Ein neuer Historien-Eintrag entsteht nur bei einer Aenderung >= thresholdChangeEpsilon
//   gegenueber dem vorherigen Wert, sonst waechst die Historie mit jeder Aktivitaet.
// - Rad-Schwellen-HF (FA-TP-04) ist die einzige Ausnahme von der "beste
//   Anstrengung"-Methode: hier wird die mittlere HF aller Sekunden verwendet, an
//   denen die Leistung innerhalb von +/-thresholdCyclingPowerTolerance um die TP
//   der Signatur zum Aktivitaetsdatum lag (Lastenheft-Vorgabe: "aus Radeinheiten
//   mit Leistung nahe der TP").

import { averageHeartRate, averageSpeed, recordedSeconds, bestSustainedSpeed, bestSustainedHeartRate, meanHeartRateNearPower } from './pace.js';
import { hrTSS, paceTSS } from './npTss.js';
import { signatureAtDate } from './signature.js';

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const SWIM_TYPES = new Set(['Swim']);
const CYCLING_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'MountainBikeRide', 'GravelRide']);

/** 'run'/'swim'/'cycling' fuer die bekannten Gruppen, sonst der Strava-Typ selbst (FA-TP-03: "je Sportart"). */
export function sportGroup(type) {
  if (RUN_TYPES.has(type)) return 'run';
  if (SWIM_TYPES.has(type)) return 'swim';
  if (CYCLING_TYPES.has(type)) return 'cycling';
  return type || 'other';
}

/** Analog zu signature.js#signatureAtDate: letzter Eintrag mit date <= dem gesuchten Datum. */
export function thresholdAtDate(history, date) {
  let current = null;
  for (const entry of history || []) {
    if (entry.date <= date) current = entry;
    else break;
  }
  return current;
}

/**
 * Rollierende Schwellen-Historie fuer EINE Sportart-Gruppe. activities muss chronologisch
 * (nach startTime) aufsteigend sortiert sein. valueFn(act) liefert den Wert der "besten
 * Anstrengung" dieser einen Aktivitaet (oder null).
 */
function buildRollingThresholdHistory(activities, settings, valueFn) {
  const windowMs = settings.thresholdEstimationWindowDays * 86400e3;
  const values = activities.map(valueFn);
  const history = [];
  let lastValue = null;

  for (let i = 0; i < activities.length; i++) {
    const cutoff = new Date(activities[i].startTime).getTime() - windowMs;
    let best = null;
    for (let j = i; j >= 0; j--) {
      if (new Date(activities[j].startTime).getTime() < cutoff) break; // chronologisch sortiert -> Rest ist auch zu alt
      const v = values[j];
      if (v != null && (best == null || v > best)) best = v;
    }
    if (best == null) continue;
    if (lastValue == null || Math.abs(best - lastValue) / lastValue >= settings.thresholdChangeEpsilon) {
      history.push({ date: activities[i].date, value: best, source: 'estimated' });
      lastValue = best;
    }
  }
  return history;
}

/**
 * @param {ReturnType<typeof import('./activity.js').prepareActivity>[]} preparedActivities - chronologisch sortiert, mit `type`
 * @param {import('./types.js').Signature[]} signatureHistory - result.history aus computeSignatureHistory (fuer FA-TP-04)
 * @param {import('./types.js').ModelSettings} settings
 * @returns {{ pace: Object<string, import('./types.js').ThresholdEntry[]>, hr: Object<string, import('./types.js').ThresholdEntry[]> }}
 */
export function estimateThresholds(preparedActivities, signatureHistory, settings) {
  const byGroup = new Map();
  for (const act of preparedActivities) {
    const group = sportGroup(act.type);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(act);
  }

  const pace = {};
  const hr = {};

  for (const group of ['run', 'swim']) {
    const activities = byGroup.get(group) || [];
    pace[group] = buildRollingThresholdHistory(activities, settings, (act) => bestSustainedSpeed(act.stream, settings.thresholdEffortSeconds));
    hr[group] = buildRollingThresholdHistory(activities, settings, (act) => bestSustainedHeartRate(act.stream, settings.thresholdEffortSeconds));
  }

  const cyclingActivities = byGroup.get('cycling') || [];
  hr.cycling = buildRollingThresholdHistory(cyclingActivities, settings, (act) => {
    const sig = signatureAtDate(signatureHistory, act.date);
    if (!sig || !sig.cp) return null;
    const r = meanHeartRateNearPower(act.stream, act.mask, sig.cp, settings.thresholdCyclingPowerTolerance);
    return r ? r.avgHr : null;
  });

  for (const [group, activities] of byGroup) {
    if (group === 'run' || group === 'swim' || group === 'cycling') continue;
    hr[group] = buildRollingThresholdHistory(activities, settings, (act) => bestSustainedHeartRate(act.stream, settings.thresholdEffortSeconds));
  }

  return { pace, hr };
}

/**
 * FA-TP-02/05: fuellt TSS fuer Aktivitaeten OHNE nutzbaren leistungsbasierten TSS
 * (r.tss ist 0/null/undefined) per hrTSS/Pace-TSS-Fallback, sonst explizit null
 * (kein TSS, FA-TP-05). Veraendert activityResults in place und gibt es zurueck.
 * @param {Array} activityResults - result.activityResults aus computeSignatureHistory
 * @param {ReturnType<typeof import('./activity.js').prepareActivity>[]} preparedActivities
 * @param {{ pace: Object, hr: Object }} thresholds
 */
export function applySportSpecificTss(activityResults, preparedActivities, thresholds) {
  const byId = new Map(preparedActivities.map((a) => [a.id, a]));

  for (const r of activityResults) {
    const act = byId.get(r.id);
    if (!act) continue;

    // Echte Leistungsdaten vorhanden (FA-TP-01 greift bereits, auch wenn der resultierende TSS
    // zufaellig 0 waere, z. B. bei einer sehr kurzen Aktivitaet) - dann nichts zu tun.
    const hasRealPower = act.mask && act.mask.some((v) => v);
    if (hasRealPower) continue;

    const group = sportGroup(act.type);
    const movingSec = recordedSeconds(act.stream);
    let tss = null;
    let tssSource = null;

    if (group === 'run' || group === 'swim') {
      const paceTh = thresholdAtDate(thresholds.pace[group], r.date);
      const avgSpeed = averageSpeed(act.stream);
      if (paceTh && avgSpeed) {
        const v = paceTSS(movingSec, avgSpeed, paceTh.value);
        if (v != null) {
          tss = v;
          tssSource = 'pace';
        }
      }
    }

    if (tss == null) {
      const hrTh = thresholdAtDate(thresholds.hr[group], r.date);
      const avgHr = averageHeartRate(act.stream);
      if (hrTh && avgHr) {
        const v = hrTSS(movingSec, avgHr, { thresholdHr: hrTh.value });
        if (v != null) {
          tss = v;
          tssSource = 'hr';
        }
      }
    }

    r.tss = tss != null ? Math.round(tss * 10) / 10 : null;
    r.tssSource = tssSource; // FA-TP-05: null = kein TSS ermittelbar, in der UI kennzeichnen
  }

  return activityResults;
}
