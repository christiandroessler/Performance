// FA-ACT-03: persoenliche Bestwerte ueber Dauern (Leistungskurve) fuer
// waehlbare Zeitraeume, auch in W/kg mit dem Gewicht zum Aktivitaetsdatum.
// Aggregation (core/src/mmp.js#aggregateMMP) laeuft im Hauptfenster, nicht im
// Worker - die MMP-Kurven je Aktivitaet sind bereits vorberechnet (compute.js),
// das Aggregieren ueber wenige Dutzend Stuetzpunkte je Aktivitaet ist auch bei
// mehreren tausend Aktivitaeten schnell genug, um die UI nicht zu blockieren.

import { aggregateMMP, DEFAULT_GRID, powerDurationCurve, currentSignatureAtDate, mergeSettings } from '../vendor/core/src/index.js';
import { loadMmpCurves, loadThresholds, loadModelState } from './compute.js';
import { readJson } from './storage.js';
import { renderSportThresholds } from './dashboardExtras.js';

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

  // Leistungsvorhersage steht bewusst VOR dem Diagramm (Kundenwunsch 2026-09-20) - eigene Karte,
  // haengt nur an der Leistungssignatur, nicht an den MMP-Kurven unten, laedt daher unabhaengig.
  const predictionContainer = document.createElement('div');
  container.appendChild(predictionContainer);
  try {
    const modelState = await loadModelState();
    renderPredictionCard(predictionContainer, modelState);
  } catch (err) {
    console.error('[Leistungskurve] Leistungsvorhersage fehlgeschlagen:', err);
  }

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

  // Sportart-Schwellen (FA-TP-03/04): von der Uebersicht hierher umgezogen, da sie inhaltlich
  // zur Leistungskurve gehoeren (beide leiten sich aus Bestwerten je Sportart her) und auf der
  // Uebersicht selbst weniger zentral waren als Performance Metrics/Leistungssignatur.
  const thresholdsContainer = document.createElement('div');
  container.appendChild(thresholdsContainer);
  try {
    const thresholds = await loadThresholds();
    renderSportThresholds(thresholdsContainer, thresholds);
  } catch (err) {
    console.error('[Leistungskurve] Sportart-Schwellen fehlgeschlagen:', err);
  }
}

/**
 * Leistungsvorhersage: "was kann ich aktuell fuer X Minuten fahren" als Regler statt Tabelle.
 * Nutzt die bereits im Kern vorhandene `powerDurationCurve` (Morton-CP-Fit, `cpFit.js`) auf dem
 * ROHEN Breakthrough-Stand (wie die Leistungssignatur-Kacheln auf der Uebersicht) - bewusst
 * NICHT die belastungsgekoppelte Anzeige (Kap. 7.7), da eine Vorhersage eine Kapazitaetsaussage
 * ist ("was ist maximal moeglich"), keine "wie fit bin ich heute unter Ermuedung"-Aussage.
 */
function renderPredictionCard(container, modelState) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Leistungsvorhersage</h2>';
  box.appendChild(header);

  // Heute gueltige Signatur inkl. Signatur-Verfall (siehe dashboardView.js#renderSignatureTiles).
  const latest =
    modelState && modelState.history && modelState.history.length
      ? currentSignatureAtDate(modelState.history, new Date().toISOString().slice(0, 10), mergeSettings(modelState.settings || {}))
      : null;
  if (!latest) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Noch keine Leistungssignatur vorhanden.';
    box.appendChild(p);
    return;
  }

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Modellierte maximale Leistung (Morton-CP-Fit) für eine frei wählbare Dauer, aus der aktuellen Leistungssignatur - keine Belastungs-/Ermüdungsanpassung.';
  box.appendChild(hint);

  const readout = document.createElement('div');
  readout.className = 'stat-grid';
  readout.style.marginBottom = '0.9rem';
  box.appendChild(readout);

  // Stufenlos (Kundenwunsch 2026-09-20) statt fester Raststufen (1/5/10/20 min, ...) - Sekunden
  // direkt als Reglerwert, kein Umweg ueber DURATION_TICKS-Indizes. Endet bei 1h: laengere
  // Vorhersagen sind fuer diese Kapazitaetsaussage nicht mehr sinnvoll (Kundenwunsch).
  const MIN_SECONDS = 60;
  const MAX_SECONDS = 3600;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'slider';
  slider.min = String(MIN_SECONDS);
  slider.max = String(MAX_SECONDS);
  slider.step = '1';
  slider.value = '1200'; // 20 min - gaengiger Testdauer-Referenzwert
  box.appendChild(slider);

  const rangeLabels = document.createElement('div');
  rangeLabels.className = 'hint';
  rangeLabels.style.cssText = 'display:flex;justify-content:space-between;margin-top:0.2rem;';
  rangeLabels.innerHTML = '<span>1 min</span><span>60 min</span>';
  box.appendChild(rangeLabels);

  const sig = { cp: latest.cp, wPrime: latest.wPrimeJ, pMax: latest.pMax };

  function formatMinSec(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')} min`;
  }

  function update() {
    const t = Number(slider.value);
    const [point] = powerDurationCurve(sig, [t]);
    readout.innerHTML = `
      <div class="stat-tile accent">
        <span class="stat-tile-label">${formatMinSec(t)}</span>
        <span class="stat-tile-value">${point ? Math.round(point.watts) : '-'}<span class="unit">W</span></span>
      </div>
    `;
  }
  slider.oninput = update;
  update();
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
