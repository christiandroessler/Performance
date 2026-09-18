// Uebersicht-Redesign 2026-09 (TrainingPeaks-Vorbild): kleinere Karten fuer
// die Uebersicht-Seite, die bereits vorhandene Daten (index.json, modelState)
// nur zusammenfassend darstellen - keine eigene Berechnung.

import { openActivityDetail } from './activityDetailView.js';
import { groupByWeek, mondayOf } from './calendarUtils.js';
import { formatDuration, formatDistance, formatPacePerKm, formatPacePer100m } from './format.js';

const MEDAL_LABEL = { bronze: '🥉', silver: '🥈', gold: '🥇' };
const PARAM_LABEL = { cp: 'TP', wPrimeJ: 'HIE', pMax: 'PP' };

/** "Heute"-Karte (TrainingPeaks-Vorbild): die zuletzt importierte Aktivitaet, da wir keine geplanten Workouts haben. */
export function renderRecentActivity(container, index) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Letzte Aktivität</h2>';
  box.appendChild(header);

  if (index.activities.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Noch keine Aktivitäten importiert.';
    box.appendChild(p);
    return;
  }

  const a = index.activities[index.activities.length - 1]; // index.json ist chronologisch aufsteigend sortiert
  const title = document.createElement('p');
  title.className = 'lede';
  title.textContent = `${a.name || a.type} · ${a.date}`;
  box.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML = `
    <div class="stat-tile"><span class="stat-tile-label">Sportart</span><span class="stat-tile-value">${a.type}</span></div>
    <div class="stat-tile"><span class="stat-tile-label">Dauer</span><span class="stat-tile-value">${formatDuration(a.movingTimeSec)}</span></div>
    <div class="stat-tile"><span class="stat-tile-label">Distanz</span><span class="stat-tile-value">${formatDistance(a.distanceM)}</span></div>
    ${a.tss != null ? `<div class="stat-tile accent"><span class="stat-tile-label">TSS</span><span class="stat-tile-value">${a.tss}</span></div>` : ''}
  `;
  box.appendChild(grid);

  const link = document.createElement('button');
  link.className = 'btn-ghost';
  link.style.marginTop = '0.75rem';
  link.textContent = 'Details ansehen →';
  link.onclick = () => openActivityDetail(a.id);
  box.appendChild(link);
}

/** "Diese Woche"-Karte: kompakte Zusammenfassung der laufenden ISO-Woche (wiederverwendet calendarUtils#groupByWeek). */
export function renderThisWeekSummary(container, index) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Diese Woche</h2>';
  box.appendChild(header);

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentWeekStart = mondayOf(todayIso);
  const week = groupByWeek(index.activities).find((w) => w.weekStart === currentWeekStart);

  const sportSummary = week
    ? Object.entries(week.countsByType)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${type} ${count}`)
        .join(' · ')
    : 'Noch keine Einheiten diese Woche';

  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML = `
    <div class="stat-tile accent"><span class="stat-tile-label">TSS</span><span class="stat-tile-value">${week ? Math.round(week.totalTss) : 0}</span></div>
    <div class="stat-tile"><span class="stat-tile-label">Dauer</span><span class="stat-tile-value">${formatDuration(week ? week.totalDurationSec : 0)}</span></div>
  `;
  box.appendChild(grid);

  const p = document.createElement('p');
  p.className = 'hint';
  p.style.marginTop = '0.5rem';
  p.textContent = sportSummary;
  box.appendChild(p);
}

function latestOf(history) {
  return history && history.length ? history[history.length - 1] : null;
}

/** FA-TP-03/04: geschaetzte Sportart-Schwellen (Lauf-/Schwimm-Pace, Rad-HF, HF je sonstiger Sportart), als Schaetzung datiert. */
export function renderSportThresholds(container, thresholds) {
  // Defensiv: darf nie werfen, egal was hereinkommt (siehe dashboardView.js#safeRender -
  // ein kaputtes/fehlendes thresholds-Objekt soll diese Karte leer lassen, nicht die
  // gesamte Uebersicht mitreissen).
  const safeThresholds = thresholds && typeof thresholds === 'object' ? thresholds : {};
  const pace = safeThresholds.pace && typeof safeThresholds.pace === 'object' ? safeThresholds.pace : {};
  const hr = safeThresholds.hr && typeof safeThresholds.hr === 'object' ? safeThresholds.hr : {};

  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Sportart-Schwellen</h2>';
  box.appendChild(header);

  const rows = [];
  const runPace = latestOf(pace.run);
  if (runPace) rows.push({ label: 'Lauf-Schwellenpace', value: formatPacePerKm(runPace.value), date: runPace.date });
  const swimPace = latestOf(pace.swim);
  if (swimPace) rows.push({ label: 'Schwimm-Schwellenpace', value: formatPacePer100m(swimPace.value), date: swimPace.date });
  const cyclingHr = latestOf(hr.cycling);
  if (cyclingHr) rows.push({ label: 'Rad-Schwellen-HF', value: `${Math.round(cyclingHr.value)} bpm`, date: cyclingHr.date });
  for (const [type, history] of Object.entries(hr)) {
    if (type === 'run' || type === 'swim' || type === 'cycling') continue;
    const latest = latestOf(history);
    if (latest) rows.push({ label: `${type} · Schwellen-HF`, value: `${Math.round(latest.value)} bpm`, date: latest.date });
  }

  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Noch keine Sportart-Schwellen schätzbar - siehe "Begriffe" für die Methode.';
    box.appendChild(p);
    return;
  }

  const list = document.createElement('div');
  list.className = 'threshold-list';
  for (const row of rows) {
    const item = document.createElement('div');
    item.className = 'threshold-row';
    item.innerHTML = `<span>${row.label}</span><span class="threshold-value">${row.value}</span><span class="hint">geschätzt · ${row.date}</span>`;
    list.appendChild(item);
  }
  box.appendChild(list);
}

/** Rechte-Spalte-Karte, TrainingPeaks-"Peak Performances"-Vorbild: hier die zuletzt erreichten Signatur-Breakthroughs (Medaillen). */
export function renderRecentBreakthroughs(container, modelState) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Neueste Breakthroughs</h2>';
  box.appendChild(header);

  const active = (modelState.breakthroughs || []).filter((bt) => !bt.discarded && bt.medal);
  if (active.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Bisher keine Breakthroughs erkannt.';
    box.appendChild(p);
    return;
  }

  const list = document.createElement('div');
  list.className = 'breakthrough-mini-list';
  for (const bt of [...active].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)) {
    const row = document.createElement('div');
    row.className = 'breakthrough-mini-row';
    const risenLabels = bt.risen.map((k) => PARAM_LABEL[k] || k).join(', ');
    row.innerHTML = `<span>${MEDAL_LABEL[bt.medal]}</span><span class="breakthrough-mini-date">${bt.date}</span><span class="hint">${risenLabels} gestiegen</span>`;
    list.appendChild(row);
  }
  box.appendChild(list);
}
