// FA-SET-01 bis 04 (Lastenheft Kap. 6.9, Kap. 12): alle einstellbaren Modellparameter aus
// Kap. 12 einsehbar/aenderbar, jede Aenderung loest die chronologische Neuberechnung
// (compute.js#recomputeAll) aus und wird protokolliert, Reset auf die Startwerte. "Auf
// Kalibrierungswerte zuruecksetzen" (FA-SET-04, Prioritaet S) faellt bis zur individuellen
// Kalibrierung (M4, FA-SIG-10/12) mit "Auf Literaturwerte zuruecksetzen" zusammen - beide
// fuehren bis dahin auf dieselben Startwerte (core/src/settings.js#DEFAULT_SETTINGS).
// Gewichtsverlauf + persoenliche Stammdaten sind in profileView.js ("Profil"-Menuepunkt) -
// Einstellungen hier ist Modell-Kalibrierung, kein persoenliches Profil.
// Parameterkatalog + reine Diff-/Protokoll-Logik: settingsParams.js (testbar, ohne DOM).
// Jede Karte unten ist eine eigene Funktion; openSettings() setzt nur das Modal zusammen.

import { isLightTheme, setTheme } from './theme.js';
import { loadOrInitSettings, SETTINGS_FILE } from './onboarding.js';
import { writeJson, deleteAllFiles } from './storage.js';
import { recomputeAll } from './compute.js';
import { deleteMyAccount, disconnectStrava, fetchSession } from './api.js';
import { signOut } from './auth.js';
import { PARAM_GROUPS, collectModelSettingsOverrides, describeSettingsChanges, effectiveValue, roundedDisplay } from './settingsParams.js';

export async function openSettings() {
  const settings = await loadOrInitSettings();
  // Fuer die "Strava-Verbindung"-Karte unten - ein eigener, frischer Aufruf statt eines
  // durchgereichten Werts, damit der Verbindungsstatus beim Oeffnen der Einstellungen immer
  // aktuell ist (z. B. nachdem Strava zwischenzeitlich getrennt/neu verbunden wurde). Scheitert
  // der Aufruf (z. B. Netzwerk), bleibt die Karte einfach weg statt die ganze Ansicht zu blockieren.
  const session = await fetchSession().catch(() => null);

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

  renderAppearanceCard(panel);
  renderLabValuesCard(panel, settings);
  renderParamsCard(panel, settings);
  renderChangelogCard(panel, settings);
  if (session) renderStravaConnectionCard(panel, session);
  renderAccountCard(panel);
}

// ---------- Erscheinungsbild ----------
function renderAppearanceCard(panel) {
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

// ---------- FA-MET-02: Laborwerte (Stoffwechselmodell, Kap. 7.9) ----------
function renderLabValuesCard(panel, settings) {
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
function renderParamsCard(panel, settings) {
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
      const effective = effectiveValue(settings.modelSettings, param.key);

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
    // Nur echte Abweichungen vom Startwert persistieren - Begruendung in settingsParams.js.
    const next = collectModelSettingsOverrides((key) => Number(inputs.get(key).value));
    await applyModelSettings(settings, next, statusP, saveBtn, resetBtn);
  };

  resetBtn.onclick = async () => {
    await applyModelSettings(settings, {}, statusP, saveBtn, resetBtn);
  };
}

async function applyModelSettings(settings, next, statusP, saveBtn, resetBtn) {
  const changes = describeSettingsChanges(settings.modelSettings, next);
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
function renderChangelogCard(panel, settings) {
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

// ---------- Strava-Verbindung: welches Konto ist verbunden + trennen (ohne Konto zu loeschen) ----------
function renderStravaConnectionCard(panel, session) {
  const card = document.createElement('div');
  card.className = 'card';
  panel.appendChild(card);

  const h = document.createElement('h3');
  h.textContent = 'Strava-Verbindung';
  card.appendChild(h);

  const p = document.createElement('p');
  if (session.status === 'strava_connected') {
    const name = document.createElement('strong');
    name.textContent = session.stravaAthleteName || 'unbekannt';
    p.append('Verbunden mit Strava-Konto: ', name);
  } else {
    p.className = 'hint';
    p.textContent = 'Keine Strava-Verbindung aktiv.';
  }
  card.appendChild(p);

  if (session.status !== 'strava_connected') return;

  const disconnectBtn = document.createElement('button');
  disconnectBtn.className = 'btn-danger';
  disconnectBtn.textContent = 'Strava-Verbindung trennen';
  card.appendChild(disconnectBtn);

  const statusP = document.createElement('p');
  card.appendChild(statusP);

  // Zwei-Schritt-Bestaetigung wie beim Konto-loeschen unten (irreversibel bis zum Neu-Verbinden).
  let confirming = false;
  disconnectBtn.onclick = async () => {
    if (!confirming) {
      confirming = true;
      disconnectBtn.textContent = 'Wirklich trennen?';
      disconnectBtn.classList.add('btn-danger-confirm');
      statusP.className = 'error';
      statusP.textContent = 'Klicke erneut zum Bestätigen. Du kannst danach ein (anderes) Strava-Konto neu verbinden - dein Konto/deine Daten bleiben erhalten.';
      return;
    }
    disconnectBtn.disabled = true;
    statusP.className = 'hint';
    statusP.textContent = 'Trenne Verbindung...';
    try {
      await disconnectStrava();
      window.location.reload(); // fuehrt zurueck zum Strava-Verbinden-Schritt im Onboarding
    } catch (err) {
      statusP.className = 'error';
      statusP.textContent = err.message;
      disconnectBtn.disabled = false;
    }
  };
}

// ---------- FA-USER-07: "Meine Daten löschen" ----------
function renderAccountCard(panel) {
  const card = document.createElement('div');
  card.className = 'card';
  panel.appendChild(card);

  const h = document.createElement('h3');
  h.textContent = 'Konto';
  card.appendChild(h);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Löscht deinen gesamten App-Ordner in deinem Google Drive und trennt die Strava-Verbindung. Unwiderruflich - siehe Datenschutzhinweis.';
  card.appendChild(hint);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-danger';
  deleteBtn.textContent = 'Meine Daten löschen';
  card.appendChild(deleteBtn);

  const statusP = document.createElement('p');
  card.appendChild(statusP);

  // Zwei-Schritt-Bestaetigung statt Ein-Klick-Loeschen (die Aktion ist irreversibel):
  // erster Klick zeigt eine explizite "wirklich?"-Rueckfrage mit eigenem Bestaetigungs-
  // Button, erst der zweite Klick loest die Loeschung tatsaechlich aus.
  let confirming = false;
  deleteBtn.onclick = async () => {
    if (!confirming) {
      confirming = true;
      deleteBtn.textContent = 'Wirklich unwiderruflich löschen?';
      deleteBtn.classList.add('btn-danger-confirm');
      statusP.className = 'error';
      statusP.textContent = 'Klicke erneut, um endgültig zu bestätigen.';
      return;
    }
    deleteBtn.disabled = true;
    statusP.className = 'hint';
    statusP.textContent = 'Lösche Daten...';
    try {
      await deleteMyAccount();
      await deleteAllFiles();
      signOut();
      window.location.reload();
    } catch (err) {
      statusP.className = 'error';
      statusP.textContent = err.message;
      deleteBtn.disabled = false;
    }
  };
}

