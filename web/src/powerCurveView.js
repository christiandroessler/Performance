// FA-ACT-03: persoenliche Bestwerte ueber Dauern (Leistungskurve) fuer
// waehlbare Zeitraeume, auch in W/kg mit dem Gewicht zum Aktivitaetsdatum.
// Aggregation (core/src/mmp.js#aggregateMMP) laeuft im Hauptfenster, nicht im
// Worker - die MMP-Kurven je Aktivitaet sind bereits vorberechnet (compute.js),
// das Aggregieren ueber wenige Dutzend Stuetzpunkte je Aktivitaet ist auch bei
// mehreren tausend Aktivitaeten schnell genug, um die UI nicht zu blockieren.

import { aggregateMMP, DEFAULT_GRID } from '../vendor/core/src/index.js';
import { loadMmpCurves } from './compute.js';
import { readJson } from './storage.js';

const WINDOWS = [
  { days: 42, label: '42 Tage' },
  { days: 90, label: '90 Tage' },
  { days: 365, label: '1 Jahr' },
  { days: null, label: 'Gesamt' },
];

function formatDuration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function weightAtDate(settings, date) {
  const history = (settings && settings.weightHistory) || [];
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let w = settings ? settings.weightKg : null;
  for (const entry of sorted) {
    if (entry.date <= date) w = entry.kg;
    else break;
  }
  return w;
}

export async function renderPowerCurve(container) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Leistungskurve</h2>';
  box.appendChild(header);

  const curves = await loadMmpCurves();
  if (curves.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Noch keine Kennzahlen berechnet.';
    box.appendChild(p);
    return;
  }

  const settings = await readJson('settings.json');

  const controls = document.createElement('div');
  controls.className = 'btn-row';
  controls.style.marginBottom = '0.75rem';
  const windowSelect = document.createElement('select');
  for (const w of WINDOWS) {
    const opt = document.createElement('option');
    opt.value = w.days ?? '';
    opt.textContent = w.label;
    windowSelect.appendChild(opt);
  }
  controls.appendChild(windowSelect);

  const wkgLabel = document.createElement('label');
  wkgLabel.className = 'checkbox-row';
  wkgLabel.style.marginBottom = '0';
  const wkgCheckbox = document.createElement('input');
  wkgCheckbox.type = 'checkbox';
  wkgLabel.appendChild(wkgCheckbox);
  wkgLabel.append(' W/kg (Gewicht zum Aktivitätsdatum)');
  controls.appendChild(wkgLabel);
  box.appendChild(controls);

  const tableContainer = document.createElement('div');
  box.appendChild(tableContainer);

  function render() {
    const days = windowSelect.value ? Number(windowSelect.value) : null;
    const filtered = days
      ? curves.filter((c) => {
          const ageDays = (Date.now() - new Date(c.date).getTime()) / 86400e3;
          return ageDays <= days;
        })
      : curves;

    const envelope = aggregateMMP(filtered, DEFAULT_GRID);

    tableContainer.innerHTML = '';
    if (envelope.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'Keine Daten in diesem Zeitraum.';
      tableContainer.appendChild(p);
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
      <th>Dauer</th>
      <th>Leistung</th>
      ${wkgCheckbox.checked ? '<th>W/kg</th>' : ''}
      <th>Datum</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const e of envelope) {
      const tr = document.createElement('tr');
      const kg = wkgCheckbox.checked ? weightAtDate(settings, e.date) : null;
      tr.innerHTML = `
        <td>${formatDuration(e.t)}</td>
        <td>${e.watts} W</td>
        ${wkgCheckbox.checked ? `<td>${kg ? (e.watts / kg).toFixed(2) : '-'}</td>` : ''}
        <td>${e.date}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableContainer.appendChild(table);
  }

  windowSelect.onchange = render;
  wkgCheckbox.onchange = render;
  render();
}
