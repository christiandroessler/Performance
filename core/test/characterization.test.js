// Charakterisierungstest (Phase 2, docs/ARCHITEKTUR.md): fixiert das AKTUELLE
// Verhalten von computeSignatureHistory/refitSignature ueber ein groesseres,
// vielfaeltiges synthetisches Aktivitaets-Set, BEVOR die in docs/MODULE.md
// (K-04/K-05) empfohlenen Extract-Function-Umbauten an breakthrough.js/
// signature.js stattfinden. Kein Korrektheitstest (die Korrektheit der
// einzelnen Formeln deckt der Rest von core/test/ bereits ab) - nur ein
// Netz, das jede unbeabsichtigte Verhaltensaenderung waehrend des Umbaus
// sofort sichtbar macht ("golden master", Werte unten sind der tatsaechliche
// Code-Output zum Zeitpunkt des Commits, nicht hergeleitet).
//
// NFA-06 ("echte Trainingsdaten werden nicht ins Repository committet"):
// bewusst volls synthetische, deterministische Daten (kein Math.random, kein
// realer Export) statt der im urspruenglichen Phase-2-Auftrag genannten
// "echten Strava-Exporte" - letztere duerfen laut Lastenheft nicht committet
// werden. Die reale Gegenprobe bleibt weiterhin `core/scripts/run-export.js`
// (lokal, gitignored, siehe FA-SYNC-06) - siehe docs/OFFENE-FRAGEN.md.
//
// Zeitfenster bewusst auf ~100 Tage begrenzt (innerhalb der
// Signatur-Verfall-Karenzzeit, core/src/settings.js#signatureDecayGraceDays),
// damit dieser Test unabhaengig vom parallel in Entwicklung befindlichen
// Signatur-Verfall-Feature bleibt (siehe docs/OFFENE-FRAGEN.md Punkt 13) -
// er prueft den stabilen Breakthrough-/Refit-/Medaillen-/NP-TSS-Pfad, nicht
// den Verfall.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareActivity } from '../src/activity.js';
import { computeSignatureHistory } from '../src/signature.js';
import { mergeSettings } from '../src/settings.js';

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Eine "Ausfahrt" mit deterministischem, aber variierendem Profil je nach
// `kind`: endurance (flach, leicht unter CP), threshold (nahe-erschoepfender
// Mehrminuten-Effort, W'-Evidenz), sprint (kurzer Hochleistungs-Sprint,
// Pmax-Evidenz), mixed (beides in einer Fahrt), gappy (mit Aufzeichnungs-
// luecke + einem Ausreisser, FA-DQ-02/03).
function buildActivityPoints(kind, seed) {
  const points = [];
  const wobble = (base, amp, t, period) => base + amp * Math.sin(t / period + seed);
  if (kind === 'endurance') {
    for (let t = 0; t < 3600; t++) points.push({ t, watts: wobble(190, 25, t, 23), deviceWatts: true });
  } else if (kind === 'threshold') {
    for (let t = 0; t < 300; t++) points.push({ t, watts: wobble(180, 15, t, 19), deviceWatts: true });
    for (let t = 300; t < 900; t++) points.push({ t, watts: wobble(295 + seed * 2, 8, t, 29), deviceWatts: true });
    for (let t = 900; t < 1500; t++) points.push({ t, watts: wobble(170, 15, t, 19), deviceWatts: true });
  } else if (kind === 'sprint') {
    for (let t = 0; t < 600; t++) points.push({ t, watts: wobble(180, 15, t, 19), deviceWatts: true });
    const sprintSec = 6 + (seed % 10);
    for (let t = 600; t < 600 + sprintSec; t++) points.push({ t, watts: 1150 + seed * 5, deviceWatts: true });
    for (let t = 600 + sprintSec; t < 1800; t++) points.push({ t, watts: wobble(175, 15, t, 19), deviceWatts: true });
  } else if (kind === 'mixed') {
    for (let t = 0; t < 400; t++) points.push({ t, watts: wobble(190, 20, t, 23), deviceWatts: true });
    for (let t = 400; t < 1000; t++) points.push({ t, watts: wobble(300 + seed, 10, t, 29), deviceWatts: true });
    for (let t = 1000; t < 1012; t++) points.push({ t, watts: 1100 + seed * 4, deviceWatts: true });
    for (let t = 1012; t < 2200; t++) points.push({ t, watts: wobble(185, 20, t, 23), deviceWatts: true });
  } else if (kind === 'gappy') {
    for (let t = 0; t < 500; t++) points.push({ t, watts: wobble(195, 20, t, 23), deviceWatts: true });
    points.push({ t: 500, watts: 2490, deviceWatts: true }); // einzelner Spike, Ausreisserfilter (FA-DQ-03)
    for (let t = 501; t < 900; t++) points.push({ t, watts: wobble(195, 20, t, 23), deviceWatts: true });
    // Luecke 900-1200 (keine Punkte - FA-DQ-02, nicht interpoliert)
    for (let t = 1200; t < 1800; t++) points.push({ t, watts: wobble(190, 20, t, 23), deviceWatts: true });
  }
  return points;
}

// Erste ~80 Tage: duenn besetzte Baseline fuer die Startsignatur (FA-SIG-03,
// initialSignatureWindowDays=90 per Default) - danach dicht besetzt (alle 4
// Tage), damit eine substantielle Breakthrough-/Refit-Chronologie entsteht.
const BASELINE_OFFSETS = [0, 16, 32, 48, 64, 79];
const BASELINE_KINDS = ['endurance', 'threshold', 'sprint', 'endurance', 'gappy', 'threshold'];
const POST_WINDOW_KINDS = ['mixed', 'endurance', 'threshold', 'sprint', 'gappy'];

const PLAN = BASELINE_OFFSETS.map((offset, i) => ({ offset, kind: BASELINE_KINDS[i] }));
for (let i = 0; i < 24; i++) {
  PLAN.push({ offset: 95 + i * 4, kind: POST_WINDOW_KINDS[i % POST_WINDOW_KINDS.length] });
}

function buildHistory() {
  const settings = mergeSettings();
  const raw = PLAN.map((p, i) => {
    const date = addDays('2026-01-01', p.offset);
    return {
      id: `char-${i}-${p.kind}`,
      date,
      startTime: `${date}T08:00:00Z`,
      points: buildActivityPoints(p.kind, i),
    };
  });
  const prepared = raw.map((r) => prepareActivity(r, settings));
  return { settings, result: computeSignatureHistory(prepared, { settings }) };
}

test('Charakterisierung: Startsignatur bleibt bei diesem synthetischen Set unveraendert', () => {
  const { result } = buildHistory();
  assert.ok(result.initial.signature, 'eine Startsignatur sollte zustande kommen');
  assert.equal(result.initial.effectiveDate, '2026-04-01');
  assert.deepEqual(result.initial.signature, { cp: 212, wPrimeJ: 14206, pMax: 1377 });
});

test('Charakterisierung: Anzahl erkannter Breakthroughs und Medaillen bleibt unveraendert', () => {
  const { result } = buildHistory();
  assert.equal(result.breakthroughs.length, 10);
  const medals = { gold: 0, silver: 0, bronze: 0, keine: 0 };
  for (const b of result.breakthroughs) {
    if (b.medal) medals[b.medal]++;
    else medals.keine++;
  }
  assert.deepEqual(medals, { gold: 3, silver: 7, bronze: 0, keine: 0 });
});

test('Charakterisierung: finale Signatur (letzter Verlaufseintrag) bleibt unveraendert', () => {
  const { result } = buildHistory();
  const last = result.history[result.history.length - 1];
  assert.equal(last.source, 'refit');
  assert.deepEqual(
    { cp: Math.round(last.cp * 100) / 100, wPrimeJ: Math.round(last.wPrimeJ * 100) / 100, pMax: Math.round(last.pMax * 100) / 100 },
    { cp: 271.2, wPrimeJ: 34366, pMax: 1795.24 }
  );
});

test('Charakterisierung: aggregierte NP/TSS/Strain-Summen ueber alle Aktivitaeten bleiben unveraendert', () => {
  const { result } = buildHistory();
  const withSig = result.activityResults.filter((r) => r.hasSignature);
  const totalTss = withSig.reduce((s, r) => s + r.tss, 0);
  const totalStrain = withSig.reduce((s, r) => s + (r.strain ? r.strain.total : 0), 0);
  const totalContradictions = result.activityResults.reduce((s, r) => s + (r.twoParamContradictions ? r.twoParamContradictions.length : 0), 0);
  assert.equal(withSig.length, 24, '30 Aktivitaeten insgesamt, 6 davon im 90-Tage-Startfenster ohne eigenes Ergebnis');
  assert.equal(Math.round(totalTss * 10) / 10, 1060.3);
  assert.equal(Math.round(totalStrain * 10) / 10, 1831.4);
  assert.equal(totalContradictions, 0);
});

test('Charakterisierung: computeSignatureHistory ist deterministisch (gleiche Eingabe -> gleiche Ausgabe) auch fuer dieses groessere Set', () => {
  const a = buildHistory().result;
  const b = buildHistory().result;
  assert.equal(a.breakthroughs.length, b.breakthroughs.length);
  assert.deepEqual(
    a.history.map((h) => ({ cp: h.cp, wPrimeJ: h.wPrimeJ, pMax: h.pMax })),
    b.history.map((h) => ({ cp: h.cp, wPrimeJ: h.wPrimeJ, pMax: h.pMax }))
  );
});
