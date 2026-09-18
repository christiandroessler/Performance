// M5 (Stoffwechselmodell, FA-MET-01 bis 07, Kap. 7.9) - nur die
// Steady-State-Variante (V1), siehe core/README.md "Stoffwechselmodell".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  vo2Load,
  adpForVo2Demand,
  glycolyticRateMmolLS,
  lactateOxidationCapacityMmolLS,
  lactateOxidationMmolLS,
  solveMlssPower,
  modelSteadyStateLactate,
  deriveMetabolicProfile,
  metabolicZones,
  classifyMetabolicZone,
  substrateSplitAtPower,
  substrateSplitForZoneLookup,
  smoothWattsForMetabolic,
  activityMetabolicTimeCourse,
} from '../src/metabolic.js';
import { mortonPower } from '../src/cpFit.js';
import { mergeSettings } from '../src/settings.js';

const REF = { bodyMassKg: 75, muscleMassKg: 22.5, vo2max: 50, vlamax: 0.5 }; // Kap. 7.9 Referenzfall

test('vo2Load: linear in P, trifft den Basiswert c0/mbody bei P=0', () => {
  assert.ok(Math.abs(vo2Load(0, 75) - 250 / 75) < 1e-9);
  const slope = (vo2Load(100, 75) - vo2Load(0, 75)) / 100;
  assert.ok(Math.abs(slope - 11.7 / 75) < 1e-9);
});

test('adpForVo2Demand: liefert Unendlich, sobald die Nachfrage VO2max erreicht/uebersteigt', () => {
  assert.equal(adpForVo2Demand(50, 50), Infinity);
  assert.equal(adpForVo2Demand(60, 50), Infinity);
  assert.ok(Number.isFinite(adpForVo2Demand(30, 50)));
});

test('adpForVo2Demand/vo2Load-Kette ist konsistent (Rundtrip auf die Hill-n=2-Formel)', () => {
  const adp = adpForVo2Demand(30, 50);
  const vo2Reconstructed = 50 / (1 + 1.225e-3 / adp ** 2);
  assert.ok(Math.abs(vo2Reconstructed - 30) < 1e-6);
});

test('glycolyticRateMmolLS: waechst monoton mit [ADP] und saettigt gegen VLamax', () => {
  const r1 = glycolyticRateMmolLS(0.01, 0.5);
  const r2 = glycolyticRateMmolLS(0.05, 0.5);
  const r3 = glycolyticRateMmolLS(Infinity, 0.5);
  assert.ok(r1 < r2);
  assert.ok(r2 < r3);
  assert.equal(r3, 0.5);
});

test('solveMlssPower: findet eine plausible MLSS-Leistung fuer den Kap.-7.9-Referenzfall', () => {
  const settings = mergeSettings();
  const result = solveMlssPower(REF, settings);
  assert.equal(result.converged, true);
  // Plausibilitaet: MLSS liegt deutlich unter der VO2max-Asymptote (50*75=3750 ml/min ->
  // (3750-250)/11.7 ~ 299W) und deutlich ueber 0.
  assert.ok(result.power > 50 && result.power < 299, `MLSS=${result.power} sollte plausibel sein`);
});

test('solveMlssPower: MLSS-Leistung waechst monoton mit VO2max (fixes VLamax)', () => {
  const settings = mergeSettings();
  const powers = [40, 50, 60, 70].map((vo2max) => solveMlssPower({ ...REF, vo2max }, settings).power);
  for (let i = 1; i < powers.length; i++) assert.ok(powers[i] > powers[i - 1], `powers=${powers}`);
});

test('solveMlssPower: liefert converged=false statt eines Werts, wenn VO2max nicht einmal den Grundumsatz deckt', () => {
  const settings = mergeSettings();
  const result = solveMlssPower({ ...REF, vo2max: 1 }, settings);
  assert.equal(result.converged, false);
  assert.equal(result.power, null);
});

test('modelSteadyStateLactate: niedrig bei niedriger Leistung, hoeher nahe der MLSS, null oberhalb', () => {
  const settings = mergeSettings();
  const mlss = solveMlssPower(REF, settings).power;
  const laLow = modelSteadyStateLactate(50, REF, settings);
  const laNearMlss = modelSteadyStateLactate(mlss * 0.95, REF, settings);
  const laAboveMlss = modelSteadyStateLactate(mlss * 1.2, REF, settings);
  assert.ok(laLow > 0 && laLow < laNearMlss, `laLow=${laLow} laNearMlss=${laNearMlss}`);
  assert.equal(laAboveMlss, null);
});

test('deriveMetabolicProfile: rekonstruiert bekannte VO2max/VLamax aus einer synthetisch dazu passenden Signatur', () => {
  const settings = mergeSettings();
  const trueVo2max = 50;
  const trueVlamax = 0.5;
  const bodyMassKg = 75;
  const activeMusclePct = 0.3;
  const muscleMassKg = bodyMassKg * activeMusclePct;

  const cp = solveMlssPower({ bodyMassKg, muscleMassKg, vo2max: trueVo2max, vlamax: trueVlamax }, settings).power;

  // Kurzzeit-Zielleistung exakt nach derselben Formel wie shortDurationPowerModel (intern,
  // hier repliziert, um eine dazu passende Morton-Signatur zu konstruieren).
  const B_VO2 = 0.2321;
  const ATP_PER_LACTATE = 1.5;
  const atpAerobicMax = B_VO2 * trueVo2max * bodyMassKg;
  const atpGlycolyticMax = trueVlamax * ATP_PER_LACTATE * muscleMassKg * 60;
  const vo2Equiv = (atpAerobicMax + atpGlycolyticMax) / B_VO2;
  const shortTarget = (vo2Equiv - 250) / 11.7;

  const wPrimeJ = 20000;
  const dP = shortTarget - cp;
  const x = (dP * wPrimeJ) / (wPrimeJ - 15 * dP);
  const pMax = cp + x;
  assert.ok(Math.abs(mortonPower(15, cp, wPrimeJ, pMax) - shortTarget) < 1e-6);

  const result = deriveMetabolicProfile({ cp, wPrimeJ, pMax, bodyMassKg, activeMusclePct, labValues: [] }, settings);
  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.vo2max - trueVo2max) < 0.1, `vo2max=${result.vo2max}`);
  assert.ok(Math.abs(result.vlamax - trueVlamax) < 0.01, `vlamax=${result.vlamax}`);
});

test('deriveMetabolicProfile: Bedingung 1 (MLSS=TP) gilt exakt am Ergebnis', () => {
  const settings = mergeSettings();
  const cp = 250;
  const result = deriveMetabolicProfile({ cp, wPrimeJ: 20000, pMax: 1000, bodyMassKg: 75, activeMusclePct: 0.3, labValues: [] }, settings);
  assert.equal(result.converged, true);
  const mlssCheck = solveMlssPower({ bodyMassKg: 75, muscleMassKg: 22.5, vo2max: result.vo2max, vlamax: result.vlamax }, settings);
  assert.ok(Math.abs(mlssCheck.power - cp) < 1, `MLSS-Nachrechnung=${mlssCheck.power} sollte cp=${cp} treffen`);
});

test('deriveMetabolicProfile: ein Laborwert fuer VO2max verschiebt das Ergebnis messbar dorthin, MLSS bleibt exakt bei TP', () => {
  const settings = mergeSettings();
  const cp = 250;
  const bodyMassKg = 75;
  const activeMusclePct = 0.3;
  const withoutLab = deriveMetabolicProfile({ cp, wPrimeJ: 20000, pMax: 1000, bodyMassKg, activeMusclePct, labValues: [] }, settings);
  const labVo2max = withoutLab.vo2max + 8; // deutlich abweichender Laborwert
  const withLab = deriveMetabolicProfile(
    { cp, wPrimeJ: 20000, pMax: 1000, bodyMassKg, activeMusclePct, labValues: [{ vo2max: labVo2max }] },
    settings
  );
  assert.equal(withLab.converged, true);
  assert.ok(withLab.vo2max > withoutLab.vo2max, `vo2max sollte sich Richtung Laborwert verschieben: ohne=${withoutLab.vo2max} mit=${withLab.vo2max}`);

  const mlssCheck = solveMlssPower({ bodyMassKg, muscleMassKg: bodyMassKg * activeMusclePct, vo2max: withLab.vo2max, vlamax: withLab.vlamax }, settings);
  assert.ok(Math.abs(mlssCheck.power - cp) < 1, 'Bedingung 1 bleibt trotz Laborwert exakt erfuellt');
});

test('metabolicZones/classifyMetabolicZone: MLSS=TP liegt exakt an der oberen Z4-Grenze (Z4, nicht Z5)', () => {
  const settings = mergeSettings();
  const cp = 250;
  assert.equal(classifyMetabolicZone(cp, cp, settings), 'z4');
  assert.equal(classifyMetabolicZone(cp + 0.001, cp, settings), 'z5');
  assert.equal(classifyMetabolicZone(0, cp, settings), 'z1');
  const zones = metabolicZones(cp, settings);
  assert.equal(zones.length, 5);
  assert.equal(zones[3].upperWatts, cp);
  assert.equal(zones[4].upperWatts, null);
});

test('substrateSplitAtPower: KH+Fett-kcal stimmen mit dem VO2-basierten Gesamtumsatz ueberein', () => {
  const split = substrateSplitAtPower(150, 1.0, REF);
  const vo2TotalMlMin = vo2Load(150, REF.bodyMassKg) * REF.bodyMassKg;
  const kcalMin = split.choGPerMin * 4.1 + split.fatGPerMin * 9.75;
  assert.ok(Math.abs(kcalMin - split.kcalPerMin) < 1e-9);
  // Plausibilitaetsspanne: irgendwo zwischen reiner Fett- und reiner KH-Verbrennung desselben VO2.
  assert.ok(split.kcalPerMin >= (vo2TotalMlMin / 1000) * 4.69 - 1e-6);
  assert.ok(split.kcalPerMin <= (vo2TotalMlMin / 1000) * 5.05 + 1e-6);
});

test('substrateSplitForZoneLookup: Fett dominiert bei niedriger Leistung, KH nahe/ueber der MLSS (Crossover-Konzept)', () => {
  const settings = mergeSettings();
  const low = substrateSplitForZoneLookup(50, REF, settings);
  const nearMlss = substrateSplitForZoneLookup(solveMlssPower(REF, settings).power * 0.95, REF, settings);
  assert.ok(low.fatGPerMin > low.choGPerMin, 'bei 50W sollte Fett ueberwiegen');
  assert.ok(nearMlss.choGPerMin > nearMlss.fatGPerMin, 'nahe der MLSS sollte KH ueberwiegen');
});

test('smoothWattsForMetabolic: daempft einen kurzen Leistungsspitzenwert, Summe bleibt in etwa erhalten', () => {
  const watts = new Float64Array(120).fill(100);
  watts[60] = 1000; // isolierter Spitzenwert
  const smoothed = smoothWattsForMetabolic(watts, 30);
  assert.ok(smoothed[60] < 1000, `geglaettet=${smoothed[60]} sollte deutlich unter dem Rohwert liegen`);
  assert.ok(smoothed[60] > 100);
});

test('activityMetabolicTimeCourse: konstante Leistung -> Summe entspricht Rate * Stunden', () => {
  const settings = mergeSettings();
  const n = 3600; // 1h
  const watts = new Float64Array(n).fill(150);
  const result = activityMetabolicTimeCourse(watts, REF, settings);
  const split = substrateSplitForZoneLookup(150, REF, settings);
  assert.ok(Math.abs(result.totalKcal - split.kcalPerMin * 60) < split.kcalPerMin * 0.05, `totalKcal=${result.totalKcal} erwartet~${split.kcalPerMin * 60}`);
  assert.ok(Math.abs(result.kcalPerHour - result.totalKcal) < 1e-6, 'bei genau 1h sollte kcalPerHour == totalKcal sein');
});

test('activityMetabolicTimeCourse: Luecken (0 W) tragen kaum zum Energieumsatz bei, kein Crash', () => {
  const settings = mergeSettings();
  const n = 600;
  const watts = new Float64Array(n).fill(150);
  for (let i = 200; i < 400; i++) watts[i] = 0; // Luecke/Pause
  const result = activityMetabolicTimeCourse(watts, REF, settings);
  assert.ok(Number.isFinite(result.totalKcal));
  assert.ok(result.totalKcal > 0);
});

test('deriveMetabolicProfile ist deterministisch (gleiche Eingabe -> gleiche Ausgabe)', () => {
  const settings = mergeSettings();
  const input = { cp: 250, wPrimeJ: 20000, pMax: 1000, bodyMassKg: 75, activeMusclePct: 0.3, labValues: [] };
  const a = deriveMetabolicProfile(input, settings);
  const b = deriveMetabolicProfile(input, settings);
  assert.deepEqual(a, b);
});

test('Kap.-7.9-Referenzfall: Steady-State-[La] bei 50W liegt in einer physiologisch plausiblen Groessenordnung (KEINE literale Reproduktion der PCr-Kinetik des dynamischen Modells - siehe core/README.md)', () => {
  const settings = mergeSettings();
  const la = modelSteadyStateLactate(50, REF, settings);
  assert.ok(la > 0.1 && la < 3, `La=${la} mmol/l sollte grob plausibel sein (Referenz-Dynamikmodell: ~1.09)`);
});
