// FA-SIG-11: drei Belastungscharts (Low/CP, High/W', Peak/Pmax) zusaetzlich zum PMC - je
// System der taegliche g/h/p-Verlauf aus dem belastungsgekoppelten Signaturmodell
// (FA-SIG-10, core/src/loadResponse.js). M4 Phase 1 (siehe core/README.md): k1,s ist nur
// dann echt gefittet, wenn genug eigene Breakthroughs vorliegen - sonst zeigt jede Karte
// deutlich den Fallback-Hinweis statt eine unbelegte Zahl als "fertig kalibriert" zu tarnen.
//
// Eigener, einfacherer SVG-Chart-Baustein statt Wiederverwendung von pmcView.js#buildChart:
// g/h/p teilen sich (anders als CTL/ATL vs. TSB) EINE Skala, das dortige Zwei-Achsen-Chart
// waere hier unnoetiger Umbauaufwand am bereits funktionierenden PMC-Chart. Teilt sich aber
// bewusst dieselben CSS-Klassen (.pmc-chart-wrapper/.pmc-tooltip/.pmc-range-row) fuer ein
// einheitliches Erscheinungsbild.

import { loadLoadResponse, loadModelState } from './compute.js';
import { sliceSeriesForRange } from './pmcMath.js';

const CHART_RANGES = [
  { value: '90', label: '90 Tage' },
  { value: '365', label: '365 Tage' },
  { value: 'thisYear', label: 'Dieses Jahr' },
  { value: 'all', label: 'Gesamt' },
];
const DEFAULT_CHART_RANGE = '365';

// g/h/p sind hier bewusst in rohen Strain-Score-Einheiten (SS/Tag) belassen, nicht in
// W/J - das ist die tatsaechliche Groesse aus Kap. 7.7 VOR der k1-Skalierung. Erst
// displaySignatureAtDate() (core/src/loadResponse.js) multipliziert mit k1,s und liefert
// eine physikalische Einheit (W/J) - hier ginge das nur mit dem jeweils aktuellen k1,
// wuerde aber den ZEITVERLAUF selbst verfaelschen (k1 ist ein einziger, global gefitteter
// Faktor, keine Tagesgroesse).
const SYSTEMS = [
  { key: 'cp', label: 'Low · CP (TP)', unit: 'SS', color: '#8b90a8' },
  { key: 'wPrime', label: 'High · W\' (HIE)', unit: 'SS', color: 'var(--accent)' },
  { key: 'pMax', label: 'Peak · Pmax (PP)', unit: 'SS', color: 'var(--danger)' },
];

/** FA-SIG-11: eigener Tab-Panel-Renderer, analog zu renderPowerCurve/renderBreakthroughs. */
export async function renderLoadResponse(container) {
  container.innerHTML = '';

  const intro = document.createElement('p');
  intro.className = 'hint';
  intro.textContent =
    'Belastungsgekoppelter Signaturverlauf zwischen Breakthroughs (Kap. 7.7, M4 Phase 1). g = schnelle, h = langsame Anpassung an die tägliche Belastung, p = g − h. Noch keine vollständige Kalibrierung (τ1-Suche/Hold-out-Backtesting folgt in Phase 2) - siehe "Begriffe".';
  container.appendChild(intro);

  const [{ series, calibration }, modelState] = await Promise.all([loadLoadResponse(), loadModelState()]);

  if (!series || series.length === 0) {
    const p = document.createElement('p');
    p.className = 'card';
    p.textContent = 'Noch keine Kennzahlen berechnet, oder noch keine Strain-Scores vorhanden.';
    container.appendChild(p);
    return;
  }

  for (const sys of SYSTEMS) {
    container.appendChild(renderSystemCard(sys, series, calibration ? calibration[sys.key] : null, modelState));
  }
}

function renderSystemCard(sys, series, calib, modelState) {
  const box = document.createElement('div');
  box.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `<h2>${sys.label}</h2>`;
  box.appendChild(header);

  const calibP = document.createElement('p');
  calibP.className = 'hint';
  if (calib && calib.fitted) {
    const physicalUnit = sys.key === 'wPrime' ? 'J' : 'W';
    calibP.textContent = `k1 aus ${calib.supportCount} eigenen Breakthroughs geschätzt (k1 ≈ ${calib.k1.toFixed(2)} ${physicalUnit} pro SS).`;
  } else {
    const need = calib ? calib.supportCount : 0;
    calibP.innerHTML = `<span class="badge badge-muted">Fallback</span> noch zu wenige eigene Breakthroughs für eine Schätzung (${need} vorhanden) - zeigt den unkalibrierten Trend (k1 = 1).`;
  }
  box.appendChild(calibP);

  const rangeRow = document.createElement('div');
  rangeRow.className = 'btn-row pmc-range-row';
  box.appendChild(rangeRow);

  const chartContainer = document.createElement('div');
  box.appendChild(chartContainer);

  let selectedRange = DEFAULT_CHART_RANGE;
  const rangeButtons = {};

  function renderChart() {
    chartContainer.innerHTML = '';
    const sliced = selectedRange === 'all' ? series : sliceSeriesForRange(series, selectedRange);
    chartContainer.appendChild(buildSystemChart(sliced, sys, modelState));
    for (const r of CHART_RANGES) rangeButtons[r.value].className = r.value === selectedRange ? 'btn-primary' : 'btn-ghost';
  }

  for (const r of CHART_RANGES) {
    const btn = document.createElement('button');
    btn.textContent = r.label;
    btn.onclick = () => {
      selectedRange = r.value;
      renderChart();
    };
    rangeRow.appendChild(btn);
    rangeButtons[r.value] = btn;
  }

  renderChart();
  return box;
}

const G_COLOR = 'var(--text-faint)';
const H_COLOR = 'var(--text-muted)';

/** Ein-Achsen-Verlaufsgrafik (g/h/p teilen sich eine Skala) mit Hover-Tooltip. */
function buildSystemChart(series, sys, modelState) {
  const width = 600;
  const height = 220;
  const padL = 44;
  const padR = 16;
  const padT = 12;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = series.length;

  const breakthroughDates = new Set((modelState.breakthroughs || []).filter((b) => !b.discarded).map((b) => b.date));

  const values = series.flatMap((s) => [s[sys.key].g, s[sys.key].h, s[sys.key].p]);
  const maxVal = Math.max(1, ...values);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;

  const x = (i) => padL + (i / Math.max(1, n - 1)) * plotW;
  const y = (v) => padT + plotH - ((v - minVal) / range) * plotH;
  const pathFor = (field) => series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(s[sys.key][field]).toFixed(1)}`).join(' ');

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

  for (const frac of [0, 1 / 3, 2 / 3, 1]) {
    const val = minVal + range * frac;
    const yy = y(val);
    addEl('line', { x1: padL, y1: yy.toFixed(1), x2: width - padR, y2: yy.toFixed(1), stroke: 'var(--border)', 'stroke-width': 1 });
    addEl('text', { x: padL - 6, y: (yy + 3).toFixed(1), 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = String(Math.round(val));
  }
  if (minVal < 0 && maxVal > 0) {
    const yy = y(0);
    addEl('line', { x1: padL, y1: yy.toFixed(1), x2: width - padR, y2: yy.toFixed(1), stroke: 'var(--text-faint)', 'stroke-width': 1 });
  }

  const xTickCount = Math.min(6, n);
  for (let k = 0; k < xTickCount; k++) {
    const idx = Math.round((k / Math.max(1, xTickCount - 1)) * (n - 1));
    const label = new Date(series[idx].date + 'T00:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    addEl('text', { x: x(idx).toFixed(1), y: height - padB + 14, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = label;
  }

  // Breakthrough-Marker: senkrechte gestrichelte Linie (Reset-Punkte des Modells, siehe loadResponse.js).
  for (let i = 0; i < n; i++) {
    if (breakthroughDates.has(series[i].date)) {
      const px = x(i);
      addEl('line', { x1: px.toFixed(1), y1: padT, x2: px.toFixed(1), y2: padT + plotH, stroke: sys.color, 'stroke-width': 1, 'stroke-dasharray': '2 2', opacity: 0.5 });
    }
  }

  function addPath(d, color, widthPx, dash) {
    const attrs = { d, fill: 'none', stroke: color, 'stroke-width': widthPx };
    if (dash) attrs['stroke-dasharray'] = dash;
    addEl('path', attrs);
  }
  addPath(pathFor('g'), G_COLOR, 1, '3 2');
  addPath(pathFor('h'), H_COLOR, 1, '1 2');
  addPath(pathFor('p'), sys.color, 2);

  const crosshair = addEl('line', { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: 'var(--text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
  const dotP = addEl('circle', { r: 3.5, fill: sys.color, opacity: 0 });
  const hoverRect = addEl('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'transparent' });
  hoverRect.style.cursor = 'crosshair';

  const wrapper = document.createElement('div');
  wrapper.className = 'pmc-chart-wrapper';

  const tooltip = document.createElement('div');
  tooltip.className = 'pmc-tooltip';
  tooltip.hidden = true;
  wrapper.appendChild(tooltip);

  function indexFromClientX(clientX) {
    const svgRect = svg.getBoundingClientRect();
    const scaleX = svgRect.width > 0 ? width / svgRect.width : 1;
    const localX = (clientX - svgRect.left) * scaleX;
    const stepX = plotW / Math.max(1, n - 1);
    return Math.max(0, Math.min(n - 1, Math.round((localX - padL) / stepX)));
  }

  hoverRect.addEventListener('pointermove', (evt) => {
    const idx = indexFromClientX(evt.clientX);
    const s = series[idx];
    const px = x(idx);

    crosshair.setAttribute('x1', px.toFixed(1));
    crosshair.setAttribute('x2', px.toFixed(1));
    crosshair.setAttribute('opacity', 1);
    dotP.setAttribute('cx', px.toFixed(1));
    dotP.setAttribute('cy', y(s[sys.key].p).toFixed(1));
    dotP.setAttribute('opacity', 1);

    const dateLabel = new Date(s.date + 'T00:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    tooltip.innerHTML = `
      <strong>${dateLabel}</strong>
      <div><span class="pmc-tooltip-dot" style="background:${G_COLOR}"></span>g (schnell): ${s[sys.key].g.toFixed(1)}</div>
      <div><span class="pmc-tooltip-dot" style="background:${H_COLOR}"></span>h (langsam): ${s[sys.key].h.toFixed(1)}</div>
      <div><span class="pmc-tooltip-dot" style="background:${sys.color}"></span>p = g − h: ${s[sys.key].p.toFixed(1)} ${sys.unit}</div>
    `;
    tooltip.hidden = false;

    const wrapperRect = wrapper.getBoundingClientRect();
    const nearRightEdge = evt.clientX - wrapperRect.left > wrapperRect.width - 150;
    tooltip.style.left = nearRightEdge ? `${evt.clientX - wrapperRect.left - 150}px` : `${evt.clientX - wrapperRect.left + 14}px`;
    tooltip.style.top = `${Math.max(0, evt.clientY - wrapperRect.top - 46)}px`;
  });

  hoverRect.addEventListener('pointerleave', () => {
    crosshair.setAttribute('opacity', 0);
    dotP.setAttribute('opacity', 0);
    tooltip.hidden = true;
  });

  const legend = document.createElement('div');
  legend.innerHTML = `<span style="color:${G_COLOR}">┄ g</span> &nbsp; <span style="color:${H_COLOR}">┄ h</span> &nbsp; <span style="color:${sys.color}">● p = g − h</span>`;
  legend.style.fontSize = '0.78rem';
  legend.style.color = 'var(--text-muted)';
  legend.style.marginBottom = '0.5rem';

  wrapper.prepend(svg);
  wrapper.prepend(legend);
  return wrapper;
}
