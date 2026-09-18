// Stoffwechselmodell (Mader), Kap. 7.9/6.8 (FA-MET-01 bis 07), M5-Scope.
//
// Nur die STEADY-STATE-Variante (V1, Kap. 7.9: "Lookup je Leistungswert",
// M-Prioritaet) - die volle dynamische Simulation (5 gekoppelte
// Differentialgleichungen, PCr-Kinetik, RK4) ist im Lastenheft explizit
// optional (S-Prioritaet, "fuer eine spaetere Version") und NICHT Teil
// dieses Moduls. Siehe core/README.md "Stoffwechselmodell (M5)" fuer die
// vollstaendige Herleitung, das Vertrauensniveau der einzelnen Konstanten
// und die Begruendung aller M5-Festlegungen.
//
// Quelle der Gleichungen/Konstanten: Mader 2003, Heck et al. 2022, sowie
// Gleichungen/Standardwerte aus Dunst, Scharf, Hesse, Asteroth 2026
// ("MetaboliSim: a Python implementation of the Mader model", arXiv
// 2606.08366) - im Lastenheft als "Dunst et al. 2026" zitiert. Drei
// Vertrauensstufen, im Code an der jeweiligen Konstante/Funktion vermerkt:
//   Tier A - Standard-Sportphysiologie, unabhaengig von der Quelle verifizierbar.
//   Tier B - aus der MetaboliSim-Recherche, modellspezifisch, mittlere
//            Sicherheit (nicht am Originalcode gegengeprueft).
//   Tier C - eigene V1-Festlegungen dieser App, nicht aus der Quelle selbst.

import { mortonPower } from './cpFit.js';

// --- Tier B: Hill-Kinetik-Konstanten und Leistungs-VO2-Beziehung -----------

const C0_ML_MIN = 250; // ml/min, Ruhe-/Grundumsatz-Offset (Tier B)
const C1_ML_MIN_W = 11.7; // ml O2/(min*W), Wirkungsgrad Radfahren (Tier B)
const KS1 = 1.225e-3; // (mmol/kgm)^2, Hill-Konstante oxidative ATP-Bereitstellung n=2 (Tier B)
const KS2 = 3.375e-3; // (mmol/kgm)^3, Hill-Konstante Glykolyse n=3 (Tier B)
const K_LA_O2 = 0.01475; // mmol Laktat je ml O2, Laktat-Oxidationskoeffizient (Tier B)
const KEL_OX = 2.0; // (mmol/l)^2, Saettigungskonstante Laktat-Oxidation nach [La] (Tier B)

// --- Tier A: Standard-Sportphysiologie (unabhaengig von der Quelle) --------

export const KCAL_PER_L_O2_CHO = 5.05; // Peronnet & Massicotte 1991, nicht-Protein-RER=1.0
export const KCAL_PER_L_O2_FAT = 4.69; // Peronnet & Massicotte 1991, nicht-Protein-RER=0.7
export const KCAL_PER_G_CHO = 4.1; // Standard-Brennwert Kohlenhydrate
export const KCAL_PER_G_FAT = 9.75; // Standard-Brennwert Fett
const O2_PER_PYRUVATE_MOL = 2.5; // C3H4O3 + 2.5 O2 -> 3 CO2 + 2 H2O, von Hand bilanziert
const MOLAR_VOLUME_ML = 22400; // ml/mol bei Standardbedingungen

/**
 * VO2-Bedarf bei Leistung P, ml/min je kg Koerpermasse (Tier B).
 * @param {number} pWatts
 * @param {number} bodyMassKg
 */
export function vo2Load(pWatts, bodyMassKg) {
  return (C0_ML_MIN + C1_ML_MIN_W * pWatts) / bodyMassKg;
}

/**
 * Geschlossene Inversion der oxidativen Haelfte-Saettigung (Hill n=2):
 * das [ADP] (mmol/kg Muskelmasse), das noetig ist, um `vo2DemandMlMinKg`
 * (ml/min je kg KOERPERmasse) oxidativ zu decken, gegeben VO2max (dieselbe
 * Einheit). Unendlich, wenn die Nachfrage VO2max erreicht/uebersteigt -
 * dort existiert kein Steady State mehr.
 * @param {number} vo2DemandMlMinKg
 * @param {number} vo2maxMlMinKg
 */
export function adpForVo2Demand(vo2DemandMlMinKg, vo2maxMlMinKg) {
  if (vo2DemandMlMinKg >= vo2maxMlMinKg) return Infinity;
  return Math.sqrt((KS1 * vo2DemandMlMinKg) / (vo2maxMlMinKg - vo2DemandMlMinKg));
}

/**
 * Glykolytische Laktatproduktionsrate (mmol/l/s), Hill n=3 auf [ADP].
 * V1-Vereinfachung (Tier C, siehe core/README.md "Vereinfachungen fuer V1"):
 * der pH-Hemmterm und die Glykogenverfuegbarkeit (fgly) sind auf ihren
 * Neutralwert 1 gesetzt, da V1 keinen Zeitverlauf/keine pH-/Glykogen-
 * Zustandsvariable fuehrt (das ist Teil der optionalen dynamischen
 * Simulation, nicht dieses Moduls).
 * @param {number} adpMmolKgMuscle
 * @param {number} vlamax - mmol/l/s
 */
export function glycolyticRateMmolLS(adpMmolKgMuscle, vlamax) {
  if (!Number.isFinite(adpMmolKgMuscle)) return vlamax; // adp -> unendlich: volle Saettigung
  if (adpMmolKgMuscle <= 0) return 0;
  return vlamax / (1 + KS2 / adpMmolKgMuscle ** 3);
}

/**
 * Maximale Laktat-Oxidationskapazitaet (mmol/l/s) bei Leistung P - die
 * Saettigungsgrenze bei [La] -> unendlich, siehe `lactateOxidationMmolLS`.
 * @param {number} pWatts
 * @param {number} bodyMassKg
 * @param {number} muscleMassKg
 */
export function lactateOxidationCapacityMmolLS(pWatts, bodyMassKg, muscleMassKg) {
  const vo2WholeBodyMlMin = vo2Load(pWatts, bodyMassKg) * bodyMassKg;
  const muscleMassLiters = muscleMassKg; // Dichte ~= 1,0 kg/l, Tier C Vereinfachung
  return (K_LA_O2 * vo2WholeBodyMlMin) / muscleMassLiters / 60;
}

/**
 * Tatsaechliche Laktat-Oxidationsrate (mmol/l/s) bei gegebenem [La] -
 * fuer den Abgleich mit Laborwerten (FA-MET-02, Laktat-Leistungs-Paare).
 * @param {number} pWatts
 * @param {number} laMmolL
 * @param {number} bodyMassKg
 * @param {number} muscleMassKg
 */
export function lactateOxidationMmolLS(pWatts, laMmolL, bodyMassKg, muscleMassKg) {
  const capacity = lactateOxidationCapacityMmolLS(pWatts, bodyMassKg, muscleMassKg);
  if (!(laMmolL > 0)) return 0;
  return capacity / (1 + KEL_OX / laMmolL ** 2);
}

/**
 * "Produktionsdefizit" PD(P) = Oxidationskapazitaet - Produktion. PD > 0:
 * Laktat kann im Steady State vollstaendig geklaert werden. PD < 0:
 * Nettoakkumulation, kein Steady State moeglich.
 * @param {number} pWatts
 * @param {{bodyMassKg:number, muscleMassKg:number, vo2max:number, vlamax:number}} params
 */
function productionDeficit(pWatts, params) {
  const { bodyMassKg, muscleMassKg, vo2max, vlamax } = params;
  const adp = adpForVo2Demand(vo2Load(pWatts, bodyMassKg), vo2max);
  const production = glycolyticRateMmolLS(adp, vlamax);
  const oxCapacity = lactateOxidationCapacityMmolLS(pWatts, bodyMassKg, muscleMassKg);
  return oxCapacity - production;
}

/**
 * Leistung, bei der die VO2-Nachfrage VO2max erreicht (Asymptote - jenseits
 * ist ueberhaupt kein Steady State mehr moeglich, `adpForVo2Demand` liefert
 * dort Unendlich).
 */
function vo2maxAsymptotePower(bodyMassKg, vo2max) {
  return (vo2max * bodyMassKg - C0_ML_MIN) / C1_ML_MIN_W;
}

/**
 * MLSS-Leistung (W) per Bisektion ueber PD(P)=0 (Kap. 7.9: "Modell-MLSS").
 * PD(P) ist im gueltigen Bereich [0, VO2max-Asymptote) ueberwiegend fallend
 * (die Oxidationskapazitaet waechst dort nur schwach/naeherungsweise linear
 * mit P, waehrend die Produktion Richtung VLamax saettigt und den
 * ueberwiegenden Anteil der Formaenderung traegt - siehe core/README.md
 * fuer die Herleitung/Groessenordnungsabschaetzung), daher liefert eine
 * einfache Bisektion einen robusten, deterministischen Treffer.
 * @param {{bodyMassKg:number, muscleMassKg:number, vo2max:number, vlamax:number}} params
 * @param {import('./types.js').ModelSettings} settings
 * @returns {{power:number, converged:true}|{power:null, converged:false, reason:string}}
 */
export function solveMlssPower(params, settings) {
  const { bodyMassKg, vo2max } = params;
  let lo = 0;
  let hi = vo2maxAsymptotePower(bodyMassKg, vo2max) * 0.999;
  if (hi <= 0) return { power: null, converged: false, reason: 'VO2max reicht nicht einmal fuer den Grundumsatz' };

  const pdLo = productionDeficit(lo, params);
  const pdHi = productionDeficit(hi, params);
  if (pdLo <= 0) {
    return { power: null, converged: false, reason: 'Produktion uebersteigt die Oxidationskapazitaet bereits bei sehr niedriger Leistung' };
  }
  if (pdHi > 0) {
    return { power: null, converged: false, reason: 'kein MLSS-Uebergang innerhalb des VO2max-Leistungsbereichs gefunden' };
  }

  for (let i = 0; i < 80 && hi - lo > settings.metMlssToleranceWatts; i++) {
    const mid = (lo + hi) / 2;
    if (productionDeficit(mid, params) > 0) lo = mid;
    else hi = mid;
  }
  return { power: (lo + hi) / 2, converged: true };
}

/**
 * Self-konsistentes Steady-State-[La] (mmol/l) bei einer Leistung UNTERHALB
 * der MLSS (fuer Laborwerte-Laktat-Paare, FA-MET-02): Bisektion ueber [La],
 * sodass Produktion = tatsaechliche Oxidationsrate bei diesem [La] gilt
 * (monoton in [La], siehe `lactateOxidationMmolLS`). `null`, wenn P >= der
 * modellierten MLSS liegt (dort existiert kein endliches Steady-State-[La]).
 * @param {number} pWatts
 * @param {{bodyMassKg:number, muscleMassKg:number, vo2max:number, vlamax:number}} params
 * @param {import('./types.js').ModelSettings} settings
 */
export function modelSteadyStateLactate(pWatts, params, settings) {
  const { bodyMassKg, muscleMassKg, vo2max, vlamax } = params;
  const adp = adpForVo2Demand(vo2Load(pWatts, bodyMassKg), vo2max);
  const production = glycolyticRateMmolLS(adp, vlamax);
  const capacity = lactateOxidationCapacityMmolLS(pWatts, bodyMassKg, muscleMassKg);
  if (production >= capacity) return null; // >= MLSS, kein endliches Steady-State-[La]

  let lo = 0;
  let hi = 30; // mmol/l, grosszuegige obere Plausibilitaetsgrenze fuer Blutlaktat
  for (let i = 0; i < 60 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    const ox = lactateOxidationMmolLS(pWatts, mid, bodyMassKg, muscleMassKg);
    if (ox < production) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Inneres Loesen: VO2max, sodass die modellierte MLSS exakt `targetMlssPower`
 * (=TP der Signatur) trifft - Bisektion, monoton (mehr VO2max -> mehr
 * oxidative Kapazitaet bei gleichem P -> kleineres [ADP] -> geringere
 * Produktion bei gleicher Oxidationskapazitaet -> hoehere MLSS). Bedingung 1
 * (Kap. 7.9: "Modell-MLSS = TP ... bleibt immer erfuellt") gilt dadurch bei
 * JEDEM Kandidaten waehrend der aeusseren Suche, nicht nur im Optimum.
 * @returns {number|null}
 */
function solveVo2maxForMlss(targetMlssPower, vlamax, massParams, settings) {
  let lo = settings.metVo2maxMinMlKg;
  let hi = settings.metVo2maxMaxMlKg;
  const mlssAt = (vo2max) => solveMlssPower({ ...massParams, vo2max, vlamax }, settings);

  const resLo = mlssAt(lo);
  const resHi = mlssAt(hi);
  if (!resLo.converged || resLo.power > targetMlssPower) return null; // schon bei minimalem VO2max zu hoch (oder unloesbar)
  if (!resHi.converged || resHi.power < targetMlssPower) return null; // reicht selbst bei maximalem VO2max nicht

  for (let i = 0; i < 40 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2;
    const res = mlssAt(mid);
    if (!res.converged) return null;
    if (res.power < targetMlssPower) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Loest VLamax (Bisektion), sodass die modellierte MLSS bei gegebenem,
 * FESTEM VO2max exakt `targetMlssPower` trifft - die Umkehrung von
 * `solveVo2maxForMlss`. MLSS faellt monoton mit VLamax (mehr Glykolyse bei
 * gleichem [ADP] -> Produktion uebersteigt die (von VLamax unabhaengige)
 * Oxidationskapazitaet frueher). `null`, wenn kein VLamax im Suchbereich
 * `[metVlamaxMinMmolLs, metVlamaxMaxMmolLs]` das leistet.
 */
function solveVlamaxForMlss(targetMlssPower, vo2max, massParams, settings) {
  let lo = settings.metVlamaxMinMmolLs;
  let hi = settings.metVlamaxMaxMmolLs;
  const mlssAt = (vlamax) => solveMlssPower({ ...massParams, vo2max, vlamax }, settings);

  const resLo = mlssAt(lo); // niedrigstes vlamax -> hoechste MLSS
  const resHi = mlssAt(hi); // hoechstes vlamax -> niedrigste MLSS
  if (!resLo.converged || resLo.power < targetMlssPower) return null; // Ziel liegt ueber jeder erreichbaren MLSS
  if (!resHi.converged || resHi.power > targetMlssPower) return null; // Ziel liegt unter jeder erreichbaren MLSS

  for (let i = 0; i < 50 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    const res = mlssAt(mid);
    if (!res.converged) return null;
    if (res.power > targetMlssPower) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Loest VLamax (Bisektion) bei FESTEM VO2max, sodass das modellierte
 * Steady-State-[La] bei `pWatts` exakt `targetLactate` trifft - fuer die
 * Umrechnung eines Laborwert-Laktat-Leistungs-Paars (FA-MET-02) in ein
 * implizites VLamax. Monoton steigend (mehr VLamax -> mehr Produktion ->
 * hoeheres noetiges Steady-State-[La]). `null` bei P >= modellierter MLSS
 * durchgehend im Suchbereich (kein endliches [La] erreichbar).
 */
function solveVlamaxForLactate(pWatts, targetLactate, vo2max, massParams, settings) {
  let lo = settings.metVlamaxMinMmolLs;
  let hi = settings.metVlamaxMaxMmolLs;
  for (let i = 0; i < 50 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    const la = modelSteadyStateLactate(pWatts, { ...massParams, vo2max, vlamax: mid }, settings);
    if (la == null || la < targetLactate) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Ableitung VO2max/VLamax (F11, FA-MET-01/02, Kap. 7.9): zwei Bedingungen,
 * beide exakt loesbar statt per Optimierung angenaehert (M5-Festlegung,
 * siehe core/README.md "Stoffwechselmodell" fuer die Herleitung/Validierung
 * gegen ein reales Vergleichstool):
 *
 * 1. **Kurzzeitbedingung → VO2max**: die etablierte Konvention
 *    "Leistung bei VO2max ≈ 6-Minuten-Bestleistung" (Billat et al.) liefert
 *    VO2max direkt ueber `vo2Load` - keine Schaetzung, ein geschlossener
 *    Ausdruck. Laborwerte (VO2max direkt, oder ueber ein implizites VO2max
 *    aus VLamax bzw. einem Laktat-Leistungs-Paar) werden als gewichtetes
 *    Mittel in DIESEM VO2max-Wert zusammengefuehrt (`metShortDurationWeight`
 *    vs. `metLabVo2maxWeight`/`metLabVlamaxWeight`/`metLabLactateWeight`).
 * 2. **MLSS=TP → VLamax**: mit dem (ggf. laborwert-angepassten) VO2max wird
 *    VLamax per Bisektion so bestimmt, dass die modellierte MLSS EXAKT die
 *    TP der Signatur trifft (`solveVlamaxForMlss`) - Bedingung 1 (Kap. 7.9:
 *    "bleibt immer erfuellt") gilt dadurch strukturell immer, ohne
 *    Kompromiss durch die Laborwerte-Gewichtung.
 *
 * Ohne loesbare Kombination: `{vo2max: null, reason}` statt erfundener
 * Werte (Muster wie `computeInitialSignature`).
 * @param {{cp:number, wPrimeJ:number, pMax:number, bodyMassKg:number, activeMusclePct:number,
 *   labValues?: Array<{vo2max?:number, vlamax?:number, powerWatts?:number, lactateMmolL?:number}>}} input
 * @param {import('./types.js').ModelSettings} settings
 */
export function deriveMetabolicProfile(input, settings) {
  const { cp, wPrimeJ, pMax, bodyMassKg, activeMusclePct, labValues } = input;
  const muscleMassKg = bodyMassKg * activeMusclePct;
  const massParams = { bodyMassKg, muscleMassKg };
  const shortPowerTarget = mortonPower(settings.metShortDurationSeconds, cp, wPrimeJ, pMax);
  const vo2maxFromShort = vo2Load(shortPowerTarget, bodyMassKg);

  const weighted = [{ vo2max: vo2maxFromShort, weight: settings.metShortDurationWeight }];
  for (const lab of labValues || []) {
    if (lab.vo2max != null) {
      weighted.push({ vo2max: lab.vo2max, weight: settings.metLabVo2maxWeight });
    }
    if (lab.vlamax != null) {
      const impliedVo2max = solveVo2maxForMlss(cp, lab.vlamax, massParams, settings);
      if (impliedVo2max != null) weighted.push({ vo2max: impliedVo2max, weight: settings.metLabVlamaxWeight });
    }
    if (lab.powerWatts != null && lab.lactateMmolL != null) {
      // Anker: das kurzzeit-abgeleitete VO2max (noch ohne die anderen Laborwerte) - eine
      // vollstaendig self-konsistente Mitschaetzung wuerde eine weitere aeussere Iteration
      // verlangen, fuer V1 ist die Anker-Naeherung ausreichend (siehe core/README.md).
      const impliedVlamax = solveVlamaxForLactate(lab.powerWatts, lab.lactateMmolL, vo2maxFromShort, massParams, settings);
      const impliedVo2max = solveVo2maxForMlss(cp, impliedVlamax, massParams, settings);
      if (impliedVo2max != null) weighted.push({ vo2max: impliedVo2max, weight: settings.metLabLactateWeight });
    }
  }
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const vo2max = weighted.reduce((sum, w) => sum + w.vo2max * w.weight, 0) / totalWeight;

  const vlamax = solveVlamaxForMlss(cp, vo2max, massParams, settings);
  if (vlamax == null) {
    return { vo2max: null, vlamax: null, converged: false, reason: 'kein VLamax im zulaessigen Bereich erreicht MLSS=TP bei diesem VO2max' };
  }
  return { vo2max, vlamax, mlssPower: cp, shortPowerTarget, converged: true };
}

// --- Zonen (FA-MET-03, M5-Festlegung) ---------------------------------------

/**
 * 5 metabolische Zonen, %TP-verankert, MLSS=TP exakt als obere Z4-Grenze
 * (M5-Festlegung, siehe core/README.md "Zonenschema"). Z5 (> TP) ist per
 * Definition nicht ueber eine Stunde haltbar (PD(P) < 0, Nettoakkumulation).
 * @param {number} cp
 * @param {import('./types.js').ModelSettings} settings
 * @returns {{key:string, label:string, lowerWatts:number, upperWatts:number|null}[]}
 */
export function metabolicZones(cp, settings) {
  const b1 = cp * settings.metZoneBoundary1Pct;
  const b2 = cp * settings.metZoneBoundary2Pct;
  const b3 = cp * settings.metZoneBoundary3Pct;
  return [
    { key: 'z1', label: 'Z1 Fettstoffwechsel/Erholung', lowerWatts: 0, upperWatts: b1 },
    { key: 'z2', label: 'Z2 Grundlagenausdauer', lowerWatts: b1, upperWatts: b2 },
    { key: 'z3', label: 'Z3 Tempo', lowerWatts: b2, upperWatts: b3 },
    { key: 'z4', label: 'Z4 Schwelle (MLSS)', lowerWatts: b3, upperWatts: cp },
    { key: 'z5', label: 'Z5 Hochintensiv/anaerob', lowerWatts: cp, upperWatts: null },
  ];
}

/** Ordnet eine Leistung P einer der `metabolicZones` zu (obere Grenze je Zone inklusive). */
export function classifyMetabolicZone(pWatts, cp, settings) {
  const zones = metabolicZones(cp, settings);
  for (const z of zones) {
    if (z.upperWatts == null || pWatts <= z.upperWatts) return z.key;
  }
  return zones[zones.length - 1].key;
}

// --- Substrat-/Energieaufteilung (FA-MET-04/05) -----------------------------

/**
 * CHO-/Fett-Aufteilung des Energieumsatzes bei Leistung P (Kap. 7.9:
 * "Fettoxidation ergibt sich aus der Differenz zwischen glykolytischer
 * Pyruvatbildung und tatsaechlicher Pyruvatoxidation"). CHO-Anteil = der
 * Teil des gesamten VO2, der ueber tatsaechlich oxidiertes (nicht als
 * Laktat exportiertes) Pyruvat gedeckt wird (`lactateOxidationMmolLS` ->
 * Pyruvat-O2-Stoechiometrie); der VERBLEIBENDE aerobe O2-Umsatz wird per
 * Definition Fett zugeschrieben (kein Proteinanteil, Standardvereinfachung,
 * Tier A/C-Mischung, siehe core/README.md).
 * @param {number} pWatts
 * @param {number} laMmolL - das [La], bei dem die Oxidationsrate ausgewertet
 *   wird - unterhalb MLSS das SELBST-KONSISTENTE Steady-State-[La] bei dieser
 *   Leistung (siehe `substrateSplitForZoneLookup`), nicht ein fixer Wert:
 *   ein niedriges [La] bei niedriger Leistung ist genau das, was hier eine
 *   niedrige CHO-Oxidationsrate (und damit ueberwiegend Fett) ergibt.
 * @param {{bodyMassKg:number, muscleMassKg:number, vo2max:number, vlamax:number}} params
 */
export function substrateSplitAtPower(pWatts, laMmolL, params) {
  const { bodyMassKg, muscleMassKg } = params;
  const vo2TotalMlMin = vo2Load(pWatts, bodyMassKg) * bodyMassKg;
  const pyruvateOxMmolLS = lactateOxidationMmolLS(pWatts, laMmolL, bodyMassKg, muscleMassKg);
  const vo2ChoMlMin = pyruvateOxMmolLS * muscleMassKg * 60 * O2_PER_PYRUVATE_MOL * (MOLAR_VOLUME_ML / 1000);
  const vo2ChoClamped = Math.min(vo2ChoMlMin, vo2TotalMlMin);
  const vo2FatMlMin = vo2TotalMlMin - vo2ChoClamped;
  const kcalPerMinCho = (vo2ChoClamped / 1000) * KCAL_PER_L_O2_CHO;
  const kcalPerMinFat = (vo2FatMlMin / 1000) * KCAL_PER_L_O2_FAT;
  return {
    kcalPerMin: kcalPerMinCho + kcalPerMinFat,
    choGPerMin: kcalPerMinCho / KCAL_PER_G_CHO,
    fatGPerMin: kcalPerMinFat / KCAL_PER_G_FAT,
    choOverflowClamped: vo2ChoMlMin > vo2TotalMlMin,
  };
}

/**
 * Substrat-Aufteilung fuer die Zonen-/Lookup-Tabelle (FA-MET-04/05): ohne
 * gemessenes [La] wird das MODELLIERTE Steady-State-[La] bei dieser Leistung
 * verwendet (`modelSteadyStateLactate`) - das ist entscheidend fuer einen
 * plausiblen Fett/KH-Verlauf ueber die Leistung (niedrige Leistung -> wenig
 * Laktat -> ueberwiegend Fett; nahe MLSS -> viel Laktat -> ueberwiegend KH).
 * BEI/UEBER der modellierten MLSS existiert kein endliches Steady-State-[La]
 * mehr (Nettoakkumulation) - dort wird die SAETTIGTE Oxidationsrate
 * verwendet (hohes [La], nahe der Kapazitaetsgrenze), da die Glykolyse dort
 * bereits an ihrer Kapazitaetsgrenze arbeitet. Dokumentierte Naeherung fuer
 * den Lookup-Fall (kein gemessenes [La]), siehe core/README.md.
 * @param {number} pWatts
 * @param {{bodyMassKg:number, muscleMassKg:number, vo2max:number, vlamax:number}} params
 * @param {import('./types.js').ModelSettings} settings
 */
export function substrateSplitForZoneLookup(pWatts, params, settings) {
  const steadyStateLa = modelSteadyStateLactate(pWatts, params, settings);
  const laMmolL = steadyStateLa != null ? steadyStateLa : 30; // >= MLSS: Saettigung, siehe oben
  return substrateSplitAtPower(pWatts, laMmolL, params);
}

// --- Aktivitaets-Zeitverlauf (FA-MET-05) ------------------------------------

/**
 * Gleitendes Mittel ueber `windowSec` Sekunden (rechtsbuendig, Technik wie
 * `npTss.js#normalizedPowerForActivity`s 30-s-Fenster), aber OHNE
 * Luecken/Ausreisser aus dem Signal zu entfernen (FA-DQ-04-Konvention wie
 * `quality.js#wattsForRecovery`: der Stoffwechsel laeuft in Pausen bei 0 W
 * weiter, anders als bei NP).
 * @param {ArrayLike<number>} watts
 * @param {number} windowSec
 */
export function smoothWattsForMetabolic(watts, windowSec) {
  const n = watts.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const w = Math.max(1, Math.min(windowSec, n));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += watts[i];
    if (i >= w) sum -= watts[i - w];
    const count = Math.min(i + 1, w);
    out[i] = sum / count;
  }
  return out;
}

/**
 * Stoffwechsel-Zeitverlauf einer Aktivitaet (FA-MET-05): je Sekunde
 * kcal/g-KH/g-Fett aus der Steady-State-"Lookup" (Kap. 7.9 V1, als
 * Naeherung gekennzeichnet, FA-MET-06), ausgewertet ueber die geglaettete
 * Leistung. Ein Cache auf ganze Watt vermeidet wiederholte Berechnung bei
 * langen Aktivitaeten mit vielen wiederkehrenden Leistungswerten.
 * @param {ArrayLike<number>} recoveryWatts - Luecken/Ausreisser bereits als 0 W (wattsForRecovery)
 * @param {{bodyMassKg:number, muscleMassKg:number, vo2max:number, vlamax:number}} profileParams
 * @param {import('./types.js').ModelSettings} settings
 */
export function activityMetabolicTimeCourse(recoveryWatts, profileParams, settings) {
  const smoothed = smoothWattsForMetabolic(recoveryWatts, settings.metSmoothingWindowSeconds);
  const n = smoothed.length;
  const cache = new Map();
  let totalKcal = 0;
  let totalChoG = 0;
  let totalFatG = 0;
  const kcalPerSec = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const wattRounded = Math.max(0, Math.round(smoothed[i]));
    let split = cache.get(wattRounded);
    if (!split) {
      split = substrateSplitForZoneLookup(wattRounded, profileParams, settings);
      cache.set(wattRounded, split);
    }
    const kcalPerSecValue = split.kcalPerMin / 60;
    kcalPerSec[i] = kcalPerSecValue;
    totalKcal += kcalPerSecValue;
    totalChoG += split.choGPerMin / 60;
    totalFatG += split.fatGPerMin / 60;
  }

  const hours = n / 3600;
  return {
    kcalPerSec,
    totalKcal,
    totalChoG,
    totalFatG,
    kcalPerHour: hours > 0 ? totalKcal / hours : 0,
    choGPerHour: hours > 0 ? totalChoG / hours : 0,
    fatGPerHour: hours > 0 ? totalFatG / hours : 0,
  };
}
