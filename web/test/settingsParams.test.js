import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../vendor/core/src/index.js';
import { ALL_PARAMS, PARAM_GROUPS, collectModelSettingsOverrides, describeSettingsChanges, effectiveValue, formatParamValue } from '../src/settingsParams.js';

// Gegen den in docs/MODULE.md (P-10) beschriebenen Tippfehler-Schaden: ein falscher `key` wuerde
// beim Speichern stillschweigend nie persistiert.
test('jeder Parameter-Schluessel existiert in DEFAULT_SETTINGS und ist eindeutig', () => {
  const seen = new Set();
  for (const p of ALL_PARAMS) {
    assert.ok(p.key in DEFAULT_SETTINGS, `unbekannter Schluessel: ${p.key}`);
    assert.equal(typeof DEFAULT_SETTINGS[p.key], 'number', `${p.key} ist nicht numerisch`);
    assert.ok(!seen.has(p.key), `doppelter Schluessel: ${p.key}`);
    seen.add(p.key);
  }
  assert.equal(ALL_PARAMS.length, PARAM_GROUPS.reduce((n, g) => n + g.params.length, 0));
});

test('Anzeige-Konverter sind zueinander invers', () => {
  for (const p of ALL_PARAMS) {
    const internal = DEFAULT_SETTINGS[p.key];
    assert.ok(Math.abs(p.fromDisplay(p.toDisplay(internal)) - internal) < 1e-6 * Math.max(1, Math.abs(internal)), `${p.key}: Round-Trip`);
  }
});

test('Startwerte liegen innerhalb der Eingabegrenzen', () => {
  for (const p of ALL_PARAMS) {
    const shown = p.toDisplay(DEFAULT_SETTINGS[p.key]);
    if (p.options) assert.ok(p.options.includes(shown), `${p.key}: ${shown} nicht in options`);
    else assert.ok(shown >= p.min && shown <= p.max, `${p.key}: ${shown} ausserhalb ${p.min}..${p.max}`);
  }
});

test('collectModelSettingsOverrides: unveraenderte Formularwerte erzeugen keine Overrides', () => {
  const next = collectModelSettingsOverrides((key) => ALL_PARAMS.find((p) => p.key === key).toDisplay(DEFAULT_SETTINGS[key]));
  assert.deepEqual(next, {});
});

test('collectModelSettingsOverrides: nur echte Abweichungen, mit Rueckrechnung in interne Einheit', () => {
  const next = collectModelSettingsOverrides((key) => {
    const p = ALL_PARAMS.find((x) => x.key === key);
    if (key === 'maxPlausibleWPrimeJ') return 35; // kJ
    if (key === 'breakthroughEpsilon') return 3; // % (Startwert ist 2 %)
    if (key === 'outlierMaxWatts') return NaN; // leeres Feld -> ignoriert
    return p.toDisplay(DEFAULT_SETTINGS[key]);
  });
  assert.deepEqual(Object.keys(next).sort(), ['breakthroughEpsilon', 'maxPlausibleWPrimeJ']);
  assert.equal(next.maxPlausibleWPrimeJ, 35000);
  assert.ok(Math.abs(next.breakthroughEpsilon - 0.03) < 1e-12);
});

test('effectiveValue: gespeicherte Abweichung sticht Startwert, 0 zaehlt als Wert', () => {
  assert.equal(effectiveValue(undefined, 'refitWindowDays'), DEFAULT_SETTINGS.refitWindowDays);
  assert.equal(effectiveValue({ refitWindowDays: 60 }, 'refitWindowDays'), 60);
  assert.equal(effectiveValue({ signatureDecayGraceDays: 0 }, 'signatureDecayGraceDays'), 0);
});

test('describeSettingsChanges: Protokoll mit formatierten Werten, leer ohne Aenderung', () => {
  assert.deepEqual(describeSettingsChanges({}, {}), []);
  const changes = describeSettingsChanges({}, { maxPlausibleWPrimeJ: 35000 });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, 'maxPlausibleWPrimeJ');
  assert.equal(changes[0].to, '35 kJ');
  assert.equal(changes[0].from, `${DEFAULT_SETTINGS.maxPlausibleWPrimeJ / 1000} kJ`);
  // Ruecksetzen auf Startwerte wird ebenfalls als Aenderung erkannt
  assert.equal(describeSettingsChanges({ maxPlausibleWPrimeJ: 35000 }, {}).length, 1);
});

test('formatParamValue: Einheit nur wenn vorhanden', () => {
  const noUnit = ALL_PARAMS.find((p) => p.key === 'mpaExponent');
  assert.equal(formatParamValue(noUnit, 2), '2');
  const pctParam = ALL_PARAMS.find((p) => p.key === 'breakthroughEpsilon');
  assert.equal(formatParamValue(pctParam, 0.025), '2.5 %');
});
