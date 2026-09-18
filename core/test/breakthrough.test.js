import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBreakthroughWindows, nearMpaPoints, refitSignature } from '../src/breakthrough.js';
import { mergeSettings } from '../src/settings.js';

test('erkennt eine Ueberschreitung der MPA ab der Mindestdauer', () => {
  const settings = mergeSettings();
  const n = 20;
  const watts = new Float64Array(n).fill(200);
  const mpa = new Float64Array(n).fill(250);
  const mask = new Uint8Array(n).fill(1);
  for (let i = 10; i < 15; i++) watts[i] = 400; // 5s, > 3s Mindestdauer, deutlich > 250*1.02

  const windows = detectBreakthroughWindows(watts, mpa, mask, settings);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].start, 10);
  assert.equal(windows[0].end, 15);
});

test('keine Erkennung unterhalb der Mindestdauer', () => {
  const settings = mergeSettings();
  const n = 20;
  const watts = new Float64Array(n).fill(200);
  const mpa = new Float64Array(n).fill(250);
  const mask = new Uint8Array(n).fill(1);
  watts[10] = 400;
  watts[11] = 400; // nur 2s bei Mindestdauer 3s

  assert.equal(detectBreakthroughWindows(watts, mpa, mask, settings).length, 0);
});

test('keine Erkennung innerhalb der Toleranz epsilon', () => {
  const settings = mergeSettings();
  const n = 10;
  const mpa = new Float64Array(n).fill(250);
  const watts = new Float64Array(n).fill(250 * 1.01); // 1% ueber MPA, Toleranz ist 2%
  const mask = new Uint8Array(n).fill(1);

  assert.equal(detectBreakthroughWindows(watts, mpa, mask, settings).length, 0);
});

test('ungueltige Sekunden (Luecke/Ausreisser) zaehlen nicht fuer die Erkennung', () => {
  const settings = mergeSettings();
  const n = 10;
  const watts = new Float64Array(n).fill(400);
  const mpa = new Float64Array(n).fill(250);
  const mask = new Uint8Array(n).fill(0); // alles ungueltig

  assert.equal(detectBreakthroughWindows(watts, mpa, mask, settings).length, 0);
});

test('nearMpaPoints gruppiert zusammenhaengende Sekunden nahe der MPA', () => {
  const settings = mergeSettings({ refitNearMpaThreshold: 0.05 });
  const n = 10;
  const mpa = new Float64Array(n).fill(300);
  const watts = new Float64Array(n).fill(100); // weit unter MPA
  for (let i = 3; i < 6; i++) watts[i] = 295; // < 5% Abstand
  const mask = new Uint8Array(n).fill(1);

  const points = nearMpaPoints(watts, mpa, mask, settings);
  assert.equal(points.length, 1);
  assert.equal(points[0].t, 3);
  assert.ok(Math.abs(points[0].watts - 295) < 1e-9);
});

test('Nebenbedingungs-Korrektur laeuft bei unerfuellbaren Daten nicht unbegrenzt hoch (Regressionstest fuer den 65-kW-Bug)', () => {
  // Nach vollstaendiger Entladung von W'bal ist MPA IMMER genau CP, egal wie
  // hoch Pmax gewaehlt wird (siehe mpa.js: bei balance=0 ist wExpFrac=1, also
  // MPA = Pmax - (Pmax-CP)*1 = CP). Die Korrektur hebt in diesem Fall CP an
  // (nicht Pmax) - bei einem echten Datenfehler mit 2600 W dauerhaft nach
  // Entladung muesste CP auf > 2500 W steigen, weit ueber jede plausible
  // Grenze, also greift die CP-Obergrenze genauso wie zuvor die Pmax-Grenze
  // (Pmax lief im echten Datensatz vor diesem Fix auf 65147 W hoch).
  const settings = mergeSettings();
  const n = 3600; // 1h konstant weit ueber CP -> W'bal vollstaendig entladen, bleibt dort
  const watts = new Float64Array(n).fill(2600);
  const mask = new Uint8Array(n).fill(1);

  const activeSignature = { cp: 250, wPrimeJ: 20000, pMax: 1000 };
  // Ein paar plausible Stuetzpunkte, damit die robuste Regression ueberhaupt
  // ein Ergebnis liefert (sonst bricht refitSignature vor der
  // Nebenbedingungs-Pruefung ab) - der eigentliche Testfall ist die defekte
  // Aktivitaet selbst (breakthroughWatts), nicht diese Stuetzpunkte.
  const nearMpaPts = [
    { t: 60, watts: 300 },
    { t: 300, watts: 270 },
    { t: 1200, watts: 255 },
    { t: 3600, watts: 245 },
  ];
  const result = refitSignature({
    activeSignature,
    nearMpaPts,
    envelopePts: [],
    breakthroughWatts: watts,
    breakthroughMask: mask,
    breakthroughWindows: [{ start: 0, end: n }], // die Pruefung ist auf die erkannten Fenster beschraenkt
    settings,
  });

  assert.equal(result.constraintUnsatisfied, true);
  assert.equal(result.signature.cp, settings.maxPlausibleCp);
  assert.equal(result.signature.pMax, settings.maxPlausiblePMax);
  assert.ok(result.signature.pMax <= settings.maxPlausiblePMax);
  assert.ok(result.signature.cp <= settings.maxPlausibleCp);

  // Transparenz-Ergaenzung (siehe signature.js#rawFit, breakthroughView.js#correctionNote):
  // das rohe Regressionsergebnis (result.fit, unveraendert von fitMortonRobust) bleibt deutlich
  // unter den durch die Korrektur erzwungenen Plausibilitaetsgrenzen - genau dieser Abstand
  // soll fuer den Nutzer sichtbar werden, statt in der finalen Signatur zu verschwinden.
  assert.ok(result.fit.cp < result.signature.cp, `rohes cp=${result.fit.cp} sollte unter der erzwungenen Grenze ${result.signature.cp} liegen`);
  assert.ok(result.fit.pMax < result.signature.pMax, `rohes pMax=${result.fit.pMax} sollte unter der erzwungenen Grenze ${result.signature.pMax} liegen`);
});

test('Nebenbedingung ignoriert Anstrengung ausserhalb der Breakthrough-Fenster (Regressionstest fuer die 71%-Falsch-Erkennung)', () => {
  // Realistische lange Aktivitaet: ein kurzer, echter Breakthrough (Sekunden
  // 100-110, nahe der alten Pmax) plus eine lange spaetere Anstrengung knapp
  // ueber CP (Sekunden 5000-9000), nachdem W'bal laengst vollstaendig entladen
  // ist. Nach Kap. 7.2 ist MPA bei voller Entladung immer = CP, d. h. dieser
  // spaetere Abschnitt verletzt die woertliche "ueberall"-Bedingung IMMER,
  // unabhaengig von Pmax - genau das fuehrte im echten Datensatz zu 71%
  // faelschlich als "unerfuellbar" markierten Breakthroughs. Da dieser
  // Abschnitt kein erkanntes Breakthrough-Fenster ist, darf er die Korrektur
  // nicht mehr beeinflussen.
  const settings = mergeSettings();
  const n = 9000;
  const watts = new Float64Array(n).fill(200); // meiste Zeit deutlich unter CP
  for (let i = 100; i < 110; i++) watts[i] = 950; // der eigentliche, kurze Breakthrough
  for (let i = 5000; i < 9000; i++) watts[i] = 260; // lange Anstrengung knapp ueber CP nach Entladung, aber KEIN erkanntes Fenster
  const mask = new Uint8Array(n).fill(1);

  const activeSignature = { cp: 250, wPrimeJ: 20000, pMax: 1000 };
  const nearMpaPts = [
    { t: 60, watts: 300 },
    { t: 300, watts: 270 },
    { t: 1200, watts: 255 },
    { t: 3600, watts: 245 },
  ];

  const result = refitSignature({
    activeSignature,
    nearMpaPts,
    envelopePts: [],
    breakthroughWatts: watts,
    breakthroughMask: mask,
    breakthroughWindows: [{ start: 100, end: 110 }], // NUR der kurze Breakthrough, nicht die lange Anstrengung
    settings,
  });

  assert.equal(result.constraintUnsatisfied, false);
  assert.ok(result.signature.pMax < 1500, `pMax=${result.signature.pMax} sollte moderat bleiben`);
});

test('Nebenbedingung hebt CP (nicht nur Pmax) an, wenn ein Breakthrough-Fenster selbst W\'bal vollstaendig entlaedt', () => {
  // Realistischer Fall (haeufigste Ursache der 109 Falsch-Markierungen vor
  // diesem Fix): eine ca. 15-min-Anstrengung knapp ueber der alten CP, die
  // W'bal streckenweise stark entlaedt. Dort muss die Korrektur CP spuerbar
  // anheben (nicht nur pMax) und dabei konvergieren, statt an einer
  // Obergrenze haengen zu bleiben. Die genaue Zielhoehe (269W bei diesen
  // Testdaten) folgt aus dem Zusammenspiel von robustem Fit + Ausloesepunkt
  // des CP- vs. Pmax-Hebels (Schwelle worstExhaustionFrac > 0.98, siehe
  // enforceMpaConstraint) und ist keine runde, unabhaengig herleitbare Zahl
  // - die Assertion prueft daher eine plausible Spanne statt eines exakten
  // Werts.
  const settings = mergeSettings();
  const n = 900; // 15 min
  const watts = new Float64Array(n).fill(280); // knapp ueber der alten CP=250
  const mask = new Uint8Array(n).fill(1);

  const activeSignature = { cp: 250, wPrimeJ: 20000, pMax: 1000 };
  const nearMpaPts = [
    { t: 60, watts: 300 },
    { t: 300, watts: 280 },
    { t: 900, watts: 278 },
    { t: 1800, watts: 272 },
  ];

  const result = refitSignature({
    activeSignature,
    nearMpaPts,
    envelopePts: [],
    breakthroughWatts: watts,
    breakthroughMask: mask,
    breakthroughWindows: [{ start: 0, end: n }],
    settings,
  });

  assert.equal(result.constraintUnsatisfied, false);
  assert.ok(result.signature.cp > 255, `cp=${result.signature.cp} sollte spuerbar ueber der alten CP=250 liegen`);
  assert.ok(result.signature.cp < 400, `cp=${result.signature.cp} sollte plausibel bleiben`);
});
