// FA-SET-01 bis 04 (Lastenheft Kap. 6.9, Kap. 12): Gewichtsverlauf mit Datum, alle
// einstellbaren Modellparameter aus Kap. 12 einsehbar/aenderbar, jede Aenderung loest die
// chronologische Neuberechnung (compute.js#recomputeAll) aus und wird protokolliert, Reset auf
// die Startwerte. "Auf Kalibrierungswerte zuruecksetzen" (FA-SET-04, Prioritaet S) faellt bis zur
// individuellen Kalibrierung (M4, FA-SIG-10/12) mit "Auf Literaturwerte zuruecksetzen" zusammen -
// beide fuehren bis dahin auf dieselben Startwerte (core/src/settings.js#DEFAULT_SETTINGS).

import { DEFAULT_SETTINGS } from '../vendor/core/src/index.js';
import { isLightTheme, setTheme } from './theme.js';
import { loadOrInitSettings, SETTINGS_FILE } from './onboarding.js';
import { writeJson } from './storage.js';
import { recomputeAll } from './compute.js';

const pct = { toDisplay: (v) => Math.round(v * 1000) / 10, fromDisplay: (v) => v / 100 };
const identity = { toDisplay: (v) => v, fromDisplay: (v) => v };

// Gruppierung/Beschriftung/Quelle nach Lastenheft Kap. 12 ("Einstellbare Parameter (Startwerte)");
// die vier thresholdX-Parameter sind eine M1-Festlegung fuer FA-TP-03/04 (core/README.md), im
// Lastenheft selbst noch als "in M1 festzulegen" offen gelassen.
const PARAM_GROUPS = [
  {
    title: 'Breakthrough-Erkennung',
    params: [
      { key: 'breakthroughEpsilon', label: 'Breakthrough-Toleranz ε', unit: '%', min: 0, max: 20, step: 0.1, ...pct, hint: 'F8, Kap. 7.4' },
      { key: 'breakthroughMinSeconds', label: 'Breakthrough-Mindestdauer d', unit: 's', min: 1, max: 60, step: 1, ...identity, hint: 'F8, Kap. 7.4' },
      { key: 'medalThreshold', label: 'Medaillenschwelle', unit: '%', min: 0, max: 20, step: 0.1, ...pct, hint: 'F9, Kap. 7.5' },
    ],
  },
  {
    title: 'Signatur-Refit',
    params: [
      { key: 'initialSignatureWindowDays', label: 'Fenster Startsignatur', unit: 'Tage', min: 7, max: 365, step: 1, ...identity, hint: 'F9, FA-SIG-03' },
      { key: 'refitWindowDays', label: 'Refit-Fenster', unit: 'Tage', min: 7, max: 365, step: 1, ...identity, hint: 'F9, Kap. 7.5' },
      { key: 'maxDropPerBreakthrough', label: 'Absenkbremse je Breakthrough', unit: '%', min: 0, max: 50, step: 0.5, ...pct, hint: 'F9, Kap. 7.5' },
      { key: 'minSupportingActivitiesForDrop', label: 'Mindestanzahl stützender Aktivitäten für Absenkung', unit: '', min: 1, max: 20, step: 1, ...identity, hint: 'F9, Kap. 7.5' },
      { key: 'refitNearMpaThreshold', label: 'Nähe zur MPA für Refit-Punkte', unit: '%', min: 0, max: 50, step: 0.5, ...pct, hint: 'M1-Festlegung' },
      { key: 'mpaExponent', label: 'MPA-Exponent n', unit: '', options: [1, 2], ...identity, hint: 'Kontro et al. 2024/2025' },
    ],
  },
  {
    title: 'Nebenbedingungs-Korrektur (Plausibilitätsgrenzen)',
    params: [
      { key: 'maxPlausiblePMax', label: 'Absolute Plausibilitätsgrenze PP', unit: 'W', min: 400, max: 3000, step: 10, ...identity, hint: 'Kap. 7.5, individuell anpassen!' },
      { key: 'maxPlausibleCp', label: 'Absolute Plausibilitätsgrenze TP', unit: 'W', min: 100, max: 600, step: 5, ...identity, hint: 'Kap. 7.5, individuell anpassen!' },
      { key: 'maxMpaCorrectionPct', label: 'Max. Korrektur je Breakthrough (relativ)', unit: '%', min: 5, max: 100, step: 1, ...pct, hint: 'M1-Festlegung, core/README.md' },
    ],
  },
  {
    title: 'PP-Stabilität (Pmax nur bei Sprint-Evidenz aktualisieren)',
    params: [
      { key: 'pmaxEvidenceMaxSeconds', label: 'Max. Dauer für Sprint-Stützpunkte', unit: 's', min: 5, max: 60, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'minPmaxEvidenceCount', label: 'Mindestanzahl Sprint-Stützpunkte', unit: '', min: 1, max: 10, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'pmaxEvidenceMinCpMultiple', label: 'Min. Vielfaches von TP für Sprint-Stützpunkte', unit: '×', min: 1.2, max: 3, step: 0.1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'maxPmaxChangePerBreakthrough', label: 'Max. PP-Änderung je Breakthrough (Trägheitsbremse)', unit: '%', min: 5, max: 100, step: 1, ...pct, hint: 'M1-Festlegung, core/README.md' },
    ],
  },
  {
    title: 'HIE-Stabilität (W\' nur bei nahe-erschöpfender Evidenz aktualisieren)',
    params: [
      { key: 'wprimeEvidenceMinSeconds', label: 'Min. Dauer für W\'-Stützpunkte', unit: 's', min: 30, max: 600, step: 10, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'wprimeEvidenceMaxSeconds', label: 'Max. Dauer für W\'-Stützpunkte', unit: 's', min: 300, max: 3600, step: 60, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'minWprimeEvidenceCount', label: 'Mindestanzahl W\'-Stützpunkte', unit: '', min: 1, max: 10, step: 1, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'wprimeEvidenceMinCpMultiple', label: 'Min. Vielfaches von TP für W\'-Stützpunkte', unit: '×', min: 1, max: 2, step: 0.01, ...identity, hint: 'M1-Festlegung, core/README.md' },
      { key: 'maxWprimeChangePerBreakthrough', label: 'Max. HIE-Änderung je Breakthrough (Trägheitsbremse)', unit: '%', min: 5, max: 100, step: 1, ...pct, hint: 'M1-Festlegung, core/README.md' },
    ],
  },
  {
    title: 'Ausreißerfilter (Leistung)',
    params: [
      { key: 'outlierMaxWatts', label: 'Max. plausible Leistung', unit: 'W', min: 200, max: 5000, step: 10, ...identity, hint: 'M1-Festlegung, Ausreißerregel' },
      { key: 'outlierMaxJumpWatts', label: 'Max. plausibler Leistungssprung', unit: 'W', min: 100, max: 5000, step: 10, ...identity, hint: 'M1-Festlegung, Ausreißerregel' },
    ],
  },
  {
    title: 'Trainingsbelastung (PMC)',
    params: [
      { key: 'ctlTau', label: 'CTL-Zeitkonstante (Fitness)', unit: 'Tage', min: 7, max: 90, step: 1, ...identity, hint: 'gängige Praxis' },
      { key: 'atlTau', label: 'ATL-Zeitkonstante (Ermüdung)', unit: 'Tage', min: 3, max: 30, step: 1, ...identity, hint: 'gängige Praxis' },
    ],
  },
  {
    title: 'Sportart-Schwellen (FA-TP-03/04)',
    params: [
      { key: 'thresholdEstimationWindowDays', label: 'Rollierendes Schätzfenster', unit: 'Tage', min: 30, max: 365, step: 5, ...identity, hint: 'M1-Festlegung' },
      { key: 'thresholdEffortSeconds', label: 'Bewertungsdauer', unit: 's', min: 300, max: 3600, step: 60, ...identity, hint: 'M1-Festlegung' },
      { key: 'thresholdCyclingPowerTolerance', label: 'Toleranz Rad-Leistung nahe TP', unit: '%', min: 1, max: 20, step: 0.5, ...pct, hint: 'M1-Festlegung, FA-TP-04' },
      { key: 'thresholdChangeEpsilon', label: 'Änderungsschwelle (neuer Verlaufseintrag)', unit: '%', min: 0.5, max: 10, step: 0.5, ...pct, hint: 'M1-Festlegung' },
    ],
  },
  {
    title: 'Stoffwechselmodell (Kap. 7.9)',
    params: [
      { key: 'activeMusclePctDefault', label: 'Aktive Muskelmasse', unit: '%', min: 15, max: 50, step: 1, ...pct, hint: 'Kap. 7.9, Standard 30% für Radfahren' },
      { key: 'metShortDurationSeconds', label: 'Kurzzeitbedingung (Dauer)', unit: 's', min: 120, max: 600, step: 10, ...identity, hint: 'M5-Festlegung, core/README.md' },
      { key: 'metZoneBoundary1Pct', label: 'Zonengrenze Z1/Z2', unit: '%', min: 30, max: 70, step: 1, ...pct, hint: 'M5-Festlegung, core/README.md' },
      { key: 'metZoneBoundary2Pct', label: 'Zonengrenze Z2/Z3', unit: '%', min: 50, max: 85, step: 1, ...pct, hint: 'M5-Festlegung, core/README.md' },
      { key: 'metZoneBoundary3Pct', label: 'Zonengrenze Z3/Z4', unit: '%', min: 80, max: 99, step: 1, ...pct, hint: 'M5-Festlegung, core/README.md' },
    ],
  },
];

const ALL_PARAMS = PARAM_GROUPS.flatMap((g) => g.params);

function roundedDisplay(param, rawValue) {
  return Math.round(param.toDisplay(rawValue) * 100) / 100;
}

function formatParamValue(param, rawValue) {
  const rounded = roundedDisplay(param, rawValue);
  return param.unit ? `${rounded} ${param.unit}` : `${rounded}`;
}

export async function openSettings() {
  let settings = await loadOrInitSettings();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  document.addEventListener('keydown', onKeydown);

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-ghost modal-close-btn';
  closeBtn.textContent = 'Schließen ✕';
  closeBtn.onclick = close;
  panel.appendChild(closeBtn);

  const heading = document.createElement('h2');
  heading.textContent = 'Einstellungen';
  panel.appendChild(heading);

  renderAppearanceCard();
  renderWeightCard();
  renderLabValuesCard();
  renderParamsCard();
  renderChangelogCard();

  // ---------- Erscheinungsbild ----------
  function renderAppearanceCard() {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Erscheinungsbild';
    card.appendChild(h);

    const row = document.createElement('div');
    row.className = 'btn-row';
    card.appendChild(row);

    const darkBtn = document.createElement('button');
    const lightBtn = document.createElement('button');
    darkBtn.textContent = '🌙 Dunkel';
    lightBtn.textContent = '☀️ Hell';
    row.appendChild(darkBtn);
    row.appendChild(lightBtn);

    function refresh() {
      const light = isLightTheme();
      darkBtn.className = light ? '' : 'btn-primary';
      lightBtn.className = light ? 'btn-primary' : '';
    }
    darkBtn.onclick = () => {
      setTheme(false);
      refresh();
    };
    lightBtn.onclick = () => {
      setTheme(true);
      refresh();
    };
    refresh();
  }

  // ---------- FA-SET-01: Gewichtsverlauf ----------
  function renderWeightCard() {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Gewichtsverlauf';
    card.appendChild(h);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Wird für W/kg-Kennzahlen verwendet (jeweils das zum Aktivitätsdatum gültige Gewicht) - siehe Leistungskurve.';
    card.appendChild(hint);

    const list = document.createElement('div');
    list.className = 'threshold-list';
    card.appendChild(list);

    const addRow = document.createElement('div');
    addRow.className = 'btn-row';
    addRow.style.marginTop = '0.75rem';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = new Date().toISOString().slice(0, 10);
    const kgInput = document.createElement('input');
    kgInput.type = 'number';
    kgInput.min = '30';
    kgInput.max = '250';
    kgInput.step = '0.1';
    kgInput.placeholder = 'kg';
    kgInput.style.width = '90px';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-primary';
    addBtn.textContent = 'Hinzufügen';
    addRow.appendChild(dateInput);
    addRow.appendChild(kgInput);
    addRow.appendChild(addBtn);
    card.appendChild(addRow);

    addBtn.onclick = async () => {
      const kg = Number(kgInput.value);
      const date = dateInput.value;
      if (!date || !kg || kg < 30 || kg > 250) return;
      settings.weightHistory = [...(settings.weightHistory || []).filter((w) => w.date !== date), { date, kg }];
      await persistWeight();
      kgInput.value = '';
      renderList();
    };

    async function persistWeight() {
      const sorted = [...(settings.weightHistory || [])].sort((a, b) => a.date.localeCompare(b.date));
      settings.weightKg = sorted.length ? sorted[sorted.length - 1].kg : null;
      await writeJson(SETTINGS_FILE, settings);
    }

    function renderList() {
      list.innerHTML = '';
      const sorted = [...(settings.weightHistory || [])].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted.length === 0) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'Noch kein Gewicht hinterlegt.';
        list.appendChild(p);
        return;
      }
      for (const entry of sorted) {
        const row = document.createElement('div');
        row.className = 'threshold-row';
        row.innerHTML = `<span>${entry.date}</span><span class="threshold-value">${entry.kg} kg</span>`;
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-ghost';
        delBtn.textContent = 'Entfernen';
        delBtn.onclick = async () => {
          settings.weightHistory = (settings.weightHistory || []).filter((w) => w.date !== entry.date);
          await persistWeight();
          renderList();
        };
        row.appendChild(delBtn);
        list.appendChild(row);
      }
    }
    renderList();
  }

  // ---------- FA-MET-02: Laborwerte (Stoffwechselmodell, Kap. 7.9) ----------
  function renderLabValuesCard() {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Laborwerte (Stoffwechselmodell)';
    card.appendChild(h);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Optionale zusätzliche Bedingung für VO2max/VLamax (Kap. 7.9) - überschreibt nie die TP. Mindestens ein Feld ausfüllen.';
    card.appendChild(hint);

    const list = document.createElement('div');
    list.className = 'threshold-list';
    card.appendChild(list);

    const addRow = document.createElement('div');
    addRow.className = 'btn-row';
    addRow.style.marginTop = '0.75rem';
    addRow.style.flexWrap = 'wrap';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = new Date().toISOString().slice(0, 10);
    const vo2Input = document.createElement('input');
    vo2Input.type = 'number';
    vo2Input.step = '0.1';
    vo2Input.placeholder = 'VO2max ml/min/kg';
    vo2Input.style.width = '150px';
    const vlaInput = document.createElement('input');
    vlaInput.type = 'number';
    vlaInput.step = '0.01';
    vlaInput.placeholder = 'VLamax mmol/l/s';
    vlaInput.style.width = '130px';
    const powerInput = document.createElement('input');
    powerInput.type = 'number';
    powerInput.step = '1';
    powerInput.placeholder = 'Leistung W';
    powerInput.style.width = '100px';
    const lactateInput = document.createElement('input');
    lactateInput.type = 'number';
    lactateInput.step = '0.1';
    lactateInput.placeholder = 'Laktat mmol/l';
    lactateInput.style.width = '110px';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-primary';
    addBtn.textContent = 'Hinzufügen';
    addRow.appendChild(dateInput);
    addRow.appendChild(vo2Input);
    addRow.appendChild(vlaInput);
    addRow.appendChild(powerInput);
    addRow.appendChild(lactateInput);
    addRow.appendChild(addBtn);
    card.appendChild(addRow);

    addBtn.onclick = async () => {
      const entry = { date: dateInput.value };
      if (vo2Input.value) entry.vo2max = Number(vo2Input.value);
      if (vlaInput.value) entry.vlamax = Number(vlaInput.value);
      if (powerInput.value && lactateInput.value) {
        entry.powerWatts = Number(powerInput.value);
        entry.lactateMmolL = Number(lactateInput.value);
      }
      if (!entry.date || (entry.vo2max == null && entry.vlamax == null && entry.powerWatts == null)) return;
      settings.labValues = [...(settings.labValues || []), entry];
      await writeJson(SETTINGS_FILE, settings);
      vo2Input.value = '';
      vlaInput.value = '';
      powerInput.value = '';
      lactateInput.value = '';
      renderList();
    };

    function describeEntry(entry) {
      const parts = [];
      if (entry.vo2max != null) parts.push(`VO2max ${entry.vo2max} ml/min/kg`);
      if (entry.vlamax != null) parts.push(`VLamax ${entry.vlamax} mmol/l/s`);
      if (entry.powerWatts != null) parts.push(`${entry.powerWatts} W → ${entry.lactateMmolL} mmol/l`);
      return parts.join(' · ');
    }

    function renderList() {
      list.innerHTML = '';
      const sorted = [...(settings.labValues || [])].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted.length === 0) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'Noch keine Laborwerte hinterlegt.';
        list.appendChild(p);
        return;
      }
      for (const entry of sorted) {
        const row = document.createElement('div');
        row.className = 'threshold-row';
        row.innerHTML = `<span>${entry.date}</span><span class="threshold-value">${describeEntry(entry)}</span>`;
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-ghost';
        delBtn.textContent = 'Entfernen';
        delBtn.onclick = async () => {
          settings.labValues = (settings.labValues || []).filter((e) => e !== entry);
          await writeJson(SETTINGS_FILE, settings);
          renderList();
        };
        row.appendChild(delBtn);
        list.appendChild(row);
      }
    }
    renderList();
  }

  // ---------- FA-SET-02/03/04: Modellparameter ----------
  function renderParamsCard() {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Modellparameter';
    card.appendChild(h);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Aenderungen loesen nach dem Speichern eine vollstaendige chronologische Neuberechnung aus (kann bei langer Historie etwas dauern).';
    card.appendChild(hint);

    const inputs = new Map();
    for (const group of PARAM_GROUPS) {
      const groupHeading = document.createElement('h4');
      groupHeading.className = 'settings-group-heading';
      groupHeading.textContent = group.title;
      card.appendChild(groupHeading);

      const grid = document.createElement('div');
      grid.className = 'settings-param-grid';
      card.appendChild(grid);

      for (const param of group.params) {
        const effective = settings.modelSettings && settings.modelSettings[param.key] !== undefined ? settings.modelSettings[param.key] : DEFAULT_SETTINGS[param.key];

        const wrap = document.createElement('label');
        wrap.className = 'settings-param';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'settings-param-label';
        labelSpan.textContent = param.label;
        wrap.appendChild(labelSpan);

        let input;
        if (param.options) {
          input = document.createElement('select');
          for (const opt of param.options) {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            input.appendChild(o);
          }
          input.value = roundedDisplay(param, effective);
        } else {
          input = document.createElement('input');
          input.type = 'number';
          input.min = param.min;
          input.max = param.max;
          input.step = param.step;
          input.value = roundedDisplay(param, effective);
        }
        wrap.appendChild(input);

        if (param.unit) {
          const unitSpan = document.createElement('span');
          unitSpan.className = 'settings-param-unit';
          unitSpan.textContent = param.unit;
          wrap.appendChild(unitSpan);
        }
        const src = document.createElement('span');
        src.className = 'settings-param-hint';
        src.textContent = param.hint;
        wrap.appendChild(src);

        grid.appendChild(wrap);
        inputs.set(param.key, input);
      }
    }

    const actionRow = document.createElement('div');
    actionRow.className = 'btn-row';
    actionRow.style.marginTop = '1rem';
    card.appendChild(actionRow);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Speichern & neu berechnen';
    actionRow.appendChild(saveBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-ghost';
    resetBtn.textContent = 'Auf Startwerte zurücksetzen';
    actionRow.appendChild(resetBtn);

    const resetHint = document.createElement('p');
    resetHint.className = 'hint';
    resetHint.textContent = 'Individuelle Kalibrierungswerte gibt es erst ab M4 - bis dahin identisch mit den Literatur-Startwerten.';
    card.appendChild(resetHint);

    const statusP = document.createElement('p');
    card.appendChild(statusP);

    saveBtn.onclick = async () => {
      // Nur echte Abweichungen vom aktuellen Startwert persistieren (FA-SET-02/03),
      // sonst friert jedes Speichern ALLE Parameter beim damaligen Startwert ein und
      // spaetere Aenderungen an DEFAULT_SETTINGS (core/src/settings.js) wirken sich
      // fuer diesen Nutzer nie wieder aus - siehe core/README.md "Bekannte offene Punkte".
      const next = {};
      for (const param of ALL_PARAMS) {
        const input = inputs.get(param.key);
        const raw = Number(input.value);
        if (!Number.isFinite(raw)) continue;
        const value = param.fromDisplay(raw);
        if (Math.abs(value - DEFAULT_SETTINGS[param.key]) > 1e-9) next[param.key] = value;
      }
      await applyModelSettings(next, statusP, saveBtn, resetBtn);
    };

    resetBtn.onclick = async () => {
      await applyModelSettings({}, statusP, saveBtn, resetBtn);
    };
  }

  async function applyModelSettings(next, statusP, saveBtn, resetBtn) {
    const previous = settings.modelSettings || {};
    const changes = [];
    for (const param of ALL_PARAMS) {
      const before = previous[param.key] !== undefined ? previous[param.key] : DEFAULT_SETTINGS[param.key];
      const after = next[param.key] !== undefined ? next[param.key] : DEFAULT_SETTINGS[param.key];
      if (Math.abs(before - after) > 1e-9) {
        changes.push({ key: param.key, label: param.label, from: formatParamValue(param, before), to: formatParamValue(param, after) });
      }
    }
    if (changes.length === 0) {
      statusP.className = 'hint';
      statusP.textContent = 'Keine Änderungen.';
      return;
    }

    saveBtn.disabled = true;
    resetBtn.disabled = true;
    statusP.className = 'hint';
    statusP.textContent = 'Berechne Kennzahlen neu (Web Worker)...';

    try {
      settings.modelSettings = next;
      settings.settingsChangeLog = [{ at: new Date().toISOString(), changes }, ...(settings.settingsChangeLog || [])].slice(0, 30);
      await writeJson(SETTINGS_FILE, settings);
      await recomputeAll({ settingsOverrides: next });
      statusP.className = '';
      statusP.textContent = 'Neu berechnet. Seite wird aktualisiert...';
      window.location.reload();
    } catch (err) {
      statusP.className = 'error';
      statusP.textContent = err.message;
      saveBtn.disabled = false;
      resetBtn.disabled = false;
    }
  }

  // ---------- FA-SET-03: Änderungsprotokoll ----------
  function renderChangelogCard() {
    const log = settings.settingsChangeLog || [];
    if (log.length === 0) return;

    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Änderungsprotokoll';
    card.appendChild(h);

    const list = document.createElement('div');
    list.className = 'threshold-list';
    card.appendChild(list);

    for (const entry of log.slice(0, 10)) {
      const row = document.createElement('div');
      row.className = 'threshold-row';
      const when = new Date(entry.at).toLocaleString('de-DE');
      const summary = entry.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; ');
      row.innerHTML = `<span>${when}</span><span class="hint">${summary}</span>`;
      list.appendChild(row);
    }
  }
}
