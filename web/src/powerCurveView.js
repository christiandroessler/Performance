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

// Kandidaten fuer die X-Achsen-Beschriftung (log-Skala) - nur die im Datenbereich werden gezeichnet.
const DURATION_TICKS = [
  { t: 1, label: '1s' },
  { t: 5, label: '5s' },
  { t: 15, label: '15s' },
  { t: 60, label: '1min' },
  { t: 300, label: '5min' },
  { t: 600, label: '10min' },
  { t: 1200, label: '20min' },
  { t: 3600, label: '1h' },
  { t: 7200, label: '2h' },
  { t: 10800, label: '3h' },
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

  const chartContainer = document.createElement('div');
  box.appendChild(chartContainer);

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

    chartContainer.innerHTML = '';
    tableContainer.innerHTML = '';
    if (envelope.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'Keine Daten in diesem Zeitraum.';
      tableContainer.appendChild(p);
      return;
    }

    const chart = buildPowerCurveChart(envelope, { asWkg: wkgCheckbox.checked, settings });
    if (chart) {
      chartContainer.appendChild(chart);
    } else {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Für die Grafik in W/kg fehlt zu diesen Daten das Gewicht.';
      chartContainer.appendChild(hint);
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

/** Leistungskurve als Grafik (log-Dauer-Achse, da 1s bis mehrere Stunden auf einer Skala nicht ablesbar waeren). */
export function buildPowerCurveChart(envelope, { asWkg, settings }) {
  const points = envelope
    .map((e) => {
      const kg = asWkg ? weightAtDate(settings, e.date) : null;
      const value = asWkg ? (kg ? e.watts / kg : null) : e.watts;
      return { ...e, value };
    })
    .filter((p) => p.value != null);

  if (points.length === 0) return null;

  const width = 620;
  const height = 260;
  const padL = 46;
  const padR = 16;
  const padT = 12;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const minT = Math.min(...points.map((p) => p.t));
  const maxT = Math.max(...points.map((p) => p.t), minT + 1);
  const maxVal = Math.max(...points.map((p) => p.value)) * 1.08;
  const logMin = Math.log10(minT);
  const logMax = Math.log10(maxT);

  const x = (t) => padL + ((Math.log10(t) - logMin) / (logMax - logMin || 1)) * plotW;
  const y = (v) => padT + plotH - (v / maxVal) * plotH;

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.style.maxWidth = `${width}px`;
  svg.style.display = 'block';

  function addEl(tag, attrs) {
    const el = document.createElementNS(svgNs, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
    return el;
  }

  // Y-Achse (Leistung/W'kg): Gitterlinien + Beschriftung.
  for (const frac of [0, 1 / 3, 2 / 3, 1]) {
    const val = maxVal * frac;
    const yy = y(val);
    addEl('line', { x1: padL, y1: yy.toFixed(1), x2: width - padR, y2: yy.toFixed(1), stroke: 'var(--border)', 'stroke-width': 1 });
    addEl('text', { x: padL - 6, y: (yy + 3).toFixed(1), 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = asWkg
      ? val.toFixed(1)
      : String(Math.round(val));
  }

  // X-Achse (Dauer, log-Skala): nur die Standard-Ticks, die im Datenbereich liegen.
  for (const tk of DURATION_TICKS.filter((t) => t.t >= minT && t.t <= maxT)) {
    const xx = x(tk.t);
    addEl('text', { x: xx.toFixed(1), y: height - padB + 14, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = tk.label;
  }
  addEl('text', { x: width - padR, y: height - 4, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = 'Dauer (log)';
  addEl('text', { x: 4, y: padT - 2, 'text-anchor': 'start', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = asWkg ? 'W/kg' : 'Watt';

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  addEl('path', { d, fill: 'none', stroke: '#45b8b4', 'stroke-width': 2 });

  for (const p of points) {
    const circle = addEl('circle', { cx: x(p.t).toFixed(1), cy: y(p.value).toFixed(1), r: 2.75, fill: '#45b8b4' });
    const title = document.createElementNS(svgNs, 'title');
    title.textContent = `${formatDuration(p.t)} · ${asWkg ? `${p.value.toFixed(2)} W/kg` : `${Math.round(p.value)} W`} · ${p.date}`;
    circle.appendChild(title);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'power-curve-chart-wrapper';
  wrapper.appendChild(svg);
  return wrapper;
}
