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
  // Grenze. Seit der relativen Korrekturgrenze (`maxMpaCorrectionPct`,
  // eingefuehrt nach einem zweiten realen Ueberschaetzungs-Fall, siehe
  // core/README.md "Relative Korrekturgrenze") greift hier bereits die
  // ENGERE relative Grenze (250*1.2=300W) statt der absoluten
  // maxPlausibleCp=600W - das Endergebnis bleibt trotzdem klar erkennbar
  // unplausibel/`constraintUnsatisfied`, nur naeher an den echten Daten
  // (Pmax lief im echten Datensatz vor dem urspruenglichen Fix auf 65147 W hoch).
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

  const expectedCpCeiling = Math.min(settings.maxPlausibleCp, activeSignature.cp * (1 + settings.maxMpaCorrectionPct));
  const expectedPMaxCeiling = Math.min(settings.maxPlausiblePMax, activeSignature.pMax * (1 + settings.maxMpaCorrectionPct));
  assert.equal(result.constraintUnsatisfied, true);
  // Die exakte Konvergenzstelle haengt vom genauen Iterationspfad ab (z. B. ob der
  // pMax-Hebel zwischendurch kurz mitwirkt, siehe Kommentar oben) - deshalb Toleranz statt
  // exakter Gleichheit, wie schon beim analogen Fall unten ("keine runde, unabhaengig
  // herleitbare Zahl").
  assert.ok(Math.abs(result.signature.cp - expectedCpCeiling) < 5, `cp=${result.signature.cp} sollte nahe der (engeren) relativen Grenze ${expectedCpCeiling} stehen bleiben`);
  // pMax muss die relative Grenze nicht zwingend AUSSCHOEPFEN (die Schleife kann vorher mit
  // konstantem cp an der Grenze abbrechen, sobald der cp-Hebel selbst ausgereizt ist und der
  // pMax-Hebel bei voller Entladung ohnehin kaum noch wirkt) - entscheidend ist, dass sie NICHT
  // die alte absolute Grenze (3000W) erreicht.
  assert.ok(result.signature.pMax <= expectedPMaxCeiling + 1, `pMax=${result.signature.pMax} sollte die relative Grenze ${expectedPMaxCeiling} nicht ueberschreiten`);
  assert.ok(result.signature.pMax < settings.maxPlausiblePMax, `pMax=${result.signature.pMax} sollte klar unter der alten absoluten Grenze bleiben`);

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

test('maxMpaCorrectionPct: eine Pmax-Korrektur weit ueber 20% wird gekappt und als constraintUnsatisfied markiert, statt bis zur absoluten Grenze durchzulaufen (echter PP-Ueberschaetzungs-Fall, siehe core/README.md)', () => {
  // Frisches W'bal (keine volle Entladung) mit einem kurzen, isolierten
  // Spitzenwert weit ueber der aktiven Pmax=1000W - der Pmax-Hebel muesste
  // weit ueber 20 % Anstieg gehen, um die Bedingung zu erfuellen. Vor
  // maxMpaCorrectionPct waere das (absolute Grenze 3000W) klaglos
  // durchgelaufen und constraintUnsatisfied waere false geblieben - genau
  // der Mechanismus, der am echten Datensatz des Auftraggebers Pmax
  // wiederholt auf 150-570% ueber den rohen Fit trieb (core/README.md,
  // "Relative Korrekturgrenze"). Die Stuetzpunkte hier liegen alle >= 60s
  // (keine Sprint-Evidenz, siehe "Pmax-Stabilitaet") - der rohe Fit haelt
  // Pmax deshalb exakt bei 1000W (unveraendert, keine Absenkbremse noetig),
  // die Korrekturgrenze gilt relativ zu DIESEM gehaltenen Wert (1000*1,2=1200W).
  const settings = mergeSettings();
  const n = 600;
  const watts = new Float64Array(n).fill(150); // meiste Zeit weit unter CP, W'bal bleibt fast voll
  for (let i = 0; i < 5; i++) watts[i] = 2500; // kurzer, aber sehr hoher Spitzenwert direkt zu Beginn (W'bal ~voll)
  const mask = new Uint8Array(n).fill(1);

  const activeSignature = { cp: 250, wPrimeJ: 20000, pMax: 1000 };
  const nearMpaPts = [
    { t: 60, watts: 300 },
    { t: 300, watts: 270 },
    { t: 600, watts: 255 },
    { t: 1200, watts: 250 },
  ];

  const result = refitSignature({
    activeSignature,
    nearMpaPts,
    envelopePts: [],
    breakthroughWatts: watts,
    breakthroughMask: mask,
    breakthroughWindows: [{ start: 0, end: 5 }],
    settings,
  });

  const pMaxCeiling = activeSignature.pMax * (1 + settings.maxMpaCorrectionPct); // Pmax wurde gehalten, keine Absenkbremse noetig
  assert.equal(result.constraintUnsatisfied, true, 'die Korrektur sollte an der relativen Grenze aufgeben, nicht beliebig weit durchlaufen');
  assert.ok(Math.abs(result.signature.pMax - pMaxCeiling) < 1, `pMax=${result.signature.pMax} sollte an der 20%-Grenze ueber dem gebremsten Wert (${pMaxCeiling}) stehen bleiben`);
  assert.ok(result.signature.pMax < settings.maxPlausiblePMax, 'pMax sollte weit unter der alten absoluten Grenze (3000W) bleiben');
});

test('Pmax-Stabilitaet: ein Breakthrough ohne kurze Stuetzpunkte (keine Sprint-Evidenz) haelt Pmax exakt fest, aendert TP/HIE aber normal', () => {
  // Ein staerkerer 20-min-Schwelleneffort loest den Breakthrough aus - alle Stuetzpunkte
  // (nahe MPA + 90-Tage-Envelope) liegen bei >= 60s, keine echte Sprint-Dauer. Genau der
  // vom Auftraggeber gemeldete Fall: "PP sollte sich nicht sehr oft veraendern, da sehr
  // selten ein voller Sprint gefahren wird" - siehe core/README.md "Pmax-Stabilitaet".
  const settings = mergeSettings();
  const n = 1200; // 20 min
  const watts = new Float64Array(n).fill(275); // spuerbar ueber der alten CP=250, kein Sprint
  const mask = new Uint8Array(n).fill(1);

  const activeSignature = { cp: 250, wPrimeJ: 20000, pMax: 1000 };
  const nearMpaPts = [
    { t: 60, watts: 290 },
    { t: 300, watts: 278 },
    { t: 1200, watts: 275 },
    { t: 1800, watts: 265 },
  ];
  const envelopePts = [
    { t: 3600, watts: 240, support: 5, supportingActivityIds: new Set(['a', 'b']) },
  ];

  const result = refitSignature({
    activeSignature,
    nearMpaPts,
    envelopePts,
    breakthroughWatts: watts,
    breakthroughMask: mask,
    breakthroughWindows: [{ start: 0, end: n }],
    settings,
  });

  assert.equal(result.fit.pMaxFixed, true, 'der rohe Fit sollte Pmax mangels Sprint-Stuetzpunkten gehalten haben');
  assert.equal(result.fit.pMax, 1000, 'Pmax sollte exakt beim bisherigen Wert bleiben');
  assert.equal(result.signature.pMax, 1000, 'auch nach Absenkbremse/Nebenbedingung sollte Pmax unveraendert sein (keine Verletzung durch einen 275W-Effort bei Pmax=1000)');
  assert.notEqual(result.signature.cp, activeSignature.cp, 'TP sollte trotzdem normal aus dem staerkeren Schwelleneffort aktualisiert werden');
});

test('Pmax-Stabilitaet: ein Breakthrough MIT kurzen Stuetzpunkten (echte Sprint-Evidenz) darf Pmax normal aktualisieren', () => {
  const settings = mergeSettings();
  const n = 20;
  const watts = new Float64Array(n).fill(1300); // kurzer, echter Sprint
  const mask = new Uint8Array(n).fill(1);

  const activeSignature = { cp: 250, wPrimeJ: 20000, pMax: 1000 };
  const nearMpaPts = [
    { t: 5, watts: 1250 },
    { t: 10, watts: 1150 },
    { t: 60, watts: 300 },
    { t: 300, watts: 270 },
    { t: 1200, watts: 250 },
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

  assert.equal(result.fit.pMaxFixed, false, 'mit echten Sprint-Stuetzpunkten sollte Pmax frei gefittet werden');
  assert.notEqual(result.fit.pMax, 1000, 'Pmax sollte sich an die neuen Sprint-Daten anpassen, nicht beim alten Wert verharren');
});
