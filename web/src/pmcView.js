// FA-TP-06: Performance Management Chart (CTL, ATL, TSB) ueber alle
// Sportarten. Reines SVG, keine Chart-Bibliothek (Zero-Build-Architektur).
// TrainingPeaks-Vorbild (Uebersicht-Redesign 2026-09): die aktuellen Werte
// werden als farbige Kacheln (Fatigue/Fitness/Form) plus "Fitness Ramp
// Rates" in der rechten Spalte gezeigt (renderMetricsSidebar), der eigentliche
// Verlaufschart bleibt in der Mitte (renderPmcChart) - beide teilen sich die
// einmal berechnete Serie (computePmcSeries), damit CTL/ATL/TSB nicht doppelt
// berechnet werden.

import { computeCTLATL } from '../vendor/core/src/index.js';
import { rampRate } from './pmcMath.js';

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function allDatesBetween(startDate, endDate) {
  const dates = [];
  let d = startDate;
  while (d <= endDate) {
    dates.push(d);
    d = addDaysISO(d, 1);
  }
  return dates;
}

/** Einmal pro Uebersicht-Refresh aufrufen, Ergebnis an renderMetricsSidebar + renderPmcChart reichen. */
export function computePmcSeries(index, modelState) {
  const withTss = index.activities.filter((a) => a.date && a.tss != null);
  if (withTss.length === 0) {
    // FA-SIG-03: die ersten 90 Tage der Historie dienen der Startsignatur-Regression,
    // erst danach gibt es ueberhaupt eine Schwelle und damit TSS (Kap. 7.1) - das ist
    // der haeufigste Grund fuer "noch kein TSS", nicht fehlende Leistungsdaten. Wenn die
    // Startsignatur bereits steht (modelState.history nicht leer) aber trotzdem noch kein
    // TSS existiert, liegt die GESAMTE bisher importierte Historie noch im Regressionsfenster
    // (z. B. weil genau "letzte 90 Tage" importiert wurden) - dann fehlen schlicht Tage NACH
    // dem Regressionsfenster, kein technisches Problem.
    let message;
    if (modelState && modelState.needsMoreData) {
      message = `Noch keine Startsignatur, deshalb noch kein TSS: ${modelState.initial?.reason || 'nicht genug Daten in den ersten 90 Tagen der Historie'}. Mehr Historie importieren (z. B. "Gesamte Historie") oder abwarten, bis 90 Tage Trainingsdaten vorliegen.`;
    } else if (modelState && modelState.history && modelState.history.length > 0) {
      const effectiveDate = modelState.history[0].date;
      message = `Startsignatur steht seit ${effectiveDate} (aus den ersten 90 Tagen der Historie ermittelt). TSS/PMC gibt es erst für Aktivitäten danach - deine importierte Historie reicht noch nicht darüber hinaus. Unter "Daten" mehr/ältere Historie laden (dadurch rückt das 90-Tage-Fenster weiter zurück) oder auf neue Aktivitäten warten.`;
    } else {
      message = 'Noch keine Kennzahlen berechnet (Aktivitäten ohne Leistung/Schwelle liefern keinen TSS).';
    }
    return { series: null, message };
  }

  const dailyTSSMap = {};
  for (const a of withTss) {
    dailyTSSMap[a.date] = (dailyTSSMap[a.date] || 0) + a.tss;
  }
  const dates = allDatesBetween(withTss[0].date, withTss[withTss.length - 1].date);
  return { series: computeCTLATL(dates, dailyTSSMap), message: null };
}

const RAMP_WINDOWS = [
  { days: 7, label: 'Letzte 7 Tage' },
  { days: 28, label: 'Letzte 28 Tage' },
  { days: 90, label: 'Letzte 90 Tage' },
  { days: 365, label: 'Letzte 365 Tage' },
];

function rampBadge(value) {
  if (value == null) return '<span class="ramp-rate-value hint">-</span>';
  const sign = value > 0 ? '+' : '';
  const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
  return `<span class="ramp-rate-value ${cls}">${sign}${value}</span>`;
}

/** Rechte Spalte (TrainingPeaks-Vorbild "Performance Metrics"): Fatigue/Fitness/Form als farbige Kacheln + Ramp Rates. */
export function renderMetricsSidebar(container, { series, message }) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Performance Metrics</h2>';
  box.appendChild(header);

  if (!series) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = message;
    box.appendChild(p);
    return;
  }

  const latest = series[series.length - 1];
  const badges = document.createElement('div');
  badges.className = 'metric-badge-row';
  badges.innerHTML = `
    <div class="metric-badge fatigue">
      <span class="metric-badge-value">${Math.round(latest.atl)}</span>
      <span class="metric-badge-label">Fatigue</span>
    </div>
    <div class="metric-badge fitness">
      <span class="metric-badge-value">${Math.round(latest.ctl)}</span>
      <span class="metric-badge-label">Fitness</span>
    </div>
    <div class="metric-badge form">
      <span class="metric-badge-value">${Math.round(latest.tsb)}</span>
      <span class="metric-badge-label">Form</span>
    </div>
  `;
  box.appendChild(badges);

  const rampHeader = document.createElement('h3');
  rampHeader.textContent = 'Fitness Ramp Rates';
  rampHeader.style.marginTop = '1rem';
  box.appendChild(rampHeader);

  const rampGrid = document.createElement('div');
  rampGrid.className = 'ramp-rate-grid';
  rampGrid.innerHTML = RAMP_WINDOWS.map(
    (w) => `<div class="ramp-rate-cell">${rampBadge(rampRate(series, w.days))}<span class="hint">${w.label}</span></div>`
  ).join('');
  box.appendChild(rampGrid);
}

/** Mittlere Spalte: der eigentliche CTL/ATL/TSB-Verlaufschart. */
export function renderPmcChart(container, { series, message }) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Performance Management Chart</h2>';
  box.appendChild(header);

  if (!series) {
    const p = document.createElement('p');
    p.textContent = message;
    box.appendChild(p);
    return;
  }

  box.appendChild(buildChart(series));
}

const CTL_COLOR = '#45b8b4';
const ATL_COLOR = '#8b90a8';
const TSB_COLOR = '#d8b34a';

/** Achsbeschriftete Verlaufsgrafik mit Hover-Tooltip (Datum + CTL/ATL/TSB an der Mausposition). */
function buildChart(series) {
  const width = 600;
  const height = 260;
  const padL = 38;
  const padR = 38;
  const padT = 12;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(1, ...series.map((s) => Math.max(s.ctl, s.atl)));
  const minTsb = Math.min(0, ...series.map((s) => s.tsb));
  const maxTsb = Math.max(1, ...series.map((s) => s.tsb));
  const n = series.length;

  const x = (i) => padL + (i / Math.max(1, n - 1)) * plotW;
  const yVal = (v) => padT + plotH - (v / maxVal) * plotH;
  const yTsb = (v) => padT + plotH - ((v - minTsb) / (maxTsb - minTsb || 1)) * plotH;

  const pathFor = (getY) => series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${getY(s).toFixed(1)}`).join(' ');

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

  // Gitterlinien + Primaerachse links (CTL/ATL-Skala, "TSS/Tag").
  for (const frac of [0, 1 / 3, 2 / 3, 1]) {
    const val = maxVal * frac;
    const y = yVal(val);
    addEl('line', { x1: padL, y1: y.toFixed(1), x2: width - padR, y2: y.toFixed(1), stroke: 'var(--border)', 'stroke-width': 1 });
    addEl('text', { x: padL - 6, y: (y + 3).toFixed(1), 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = String(Math.round(val));
  }

  // Sekundaerachse rechts (TSB-Skala, eigener Wertebereich, farblich TSB zugeordnet).
  for (const frac of [0, 0.5, 1]) {
    const val = minTsb + (maxTsb - minTsb) * frac;
    const y = yTsb(val);
    addEl('text', { x: width - padR + 6, y: (y + 3).toFixed(1), 'text-anchor': 'start', 'font-size': 9, fill: TSB_COLOR }).textContent = String(Math.round(val));
  }

  // X-Achse: bis zu 6 Datumsbeschriftungen ueber den Verlauf verteilt.
  const xTickCount = Math.min(6, n);
  for (let k = 0; k < xTickCount; k++) {
    const idx = Math.round((k / Math.max(1, xTickCount - 1)) * (n - 1));
    const label = new Date(series[idx].date + 'T00:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    addEl('text', { x: x(idx).toFixed(1), y: height - padB + 14, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = label;
  }

  function addPath(d, color, widthPx) {
    addEl('path', { d, fill: 'none', stroke: color, 'stroke-width': widthPx });
  }
  addPath(pathFor((s) => yTsb(s.tsb)), TSB_COLOR, 1.5);
  addPath(pathFor((s) => yVal(s.atl)), ATL_COLOR, 1.5);
  addPath(pathFor((s) => yVal(s.ctl)), CTL_COLOR, 2);

  // Hover: Crosshair + 3 Punkte + Tooltip (HTML-Overlay, da SVG kein natives Tooltip kennt).
  const crosshair = addEl('line', { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: 'var(--text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
  const dotCtl = addEl('circle', { r: 3.5, fill: CTL_COLOR, opacity: 0 });
  const dotAtl = addEl('circle', { r: 3.5, fill: ATL_COLOR, opacity: 0 });
  const dotTsb = addEl('circle', { r: 3.5, fill: TSB_COLOR, opacity: 0 });
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
    dotCtl.setAttribute('cx', px.toFixed(1));
    dotCtl.setAttribute('cy', yVal(s.ctl).toFixed(1));
    dotCtl.setAttribute('opacity', 1);
    dotAtl.setAttribute('cx', px.toFixed(1));
    dotAtl.setAttribute('cy', yVal(s.atl).toFixed(1));
    dotAtl.setAttribute('opacity', 1);
    dotTsb.setAttribute('cx', px.toFixed(1));
    dotTsb.setAttribute('cy', yTsb(s.tsb).toFixed(1));
    dotTsb.setAttribute('opacity', 1);

    const dateLabel = new Date(s.date + 'T00:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    tooltip.innerHTML = `
      <strong>${dateLabel}</strong>
      <div><span class="pmc-tooltip-dot" style="background:${CTL_COLOR}"></span>CTL · Fitness: ${s.ctl.toFixed(1)}</div>
      <div><span class="pmc-tooltip-dot" style="background:${ATL_COLOR}"></span>ATL · Fatigue: ${s.atl.toFixed(1)}</div>
      <div><span class="pmc-tooltip-dot" style="background:${TSB_COLOR}"></span>TSB · Form: ${s.tsb.toFixed(1)}</div>
    `;
    tooltip.hidden = false;

    const wrapperRect = wrapper.getBoundingClientRect();
    const nearRightEdge = evt.clientX - wrapperRect.left > wrapperRect.width - 150;
    tooltip.style.left = nearRightEdge ? `${evt.clientX - wrapperRect.left - 150}px` : `${evt.clientX - wrapperRect.left + 14}px`;
    tooltip.style.top = `${Math.max(0, evt.clientY - wrapperRect.top - 46)}px`;
  });

  hoverRect.addEventListener('pointerleave', () => {
    crosshair.setAttribute('opacity', 0);
    dotCtl.setAttribute('opacity', 0);
    dotAtl.setAttribute('opacity', 0);
    dotTsb.setAttribute('opacity', 0);
    tooltip.hidden = true;
  });

  const legend = document.createElement('div');
  legend.innerHTML = `<span style="color:${CTL_COLOR}">● CTL · Fitness</span> &nbsp; <span style="color:${ATL_COLOR}">● ATL · Fatigue</span> &nbsp; <span style="color:${TSB_COLOR}">● TSB · Form (rechte Achse)</span>`;
  legend.style.fontSize = '0.78rem';
  legend.style.color = 'var(--text-muted)';
  legend.style.marginBottom = '0.5rem';

  wrapper.prepend(svg);
  wrapper.prepend(legend);
  return wrapper;
}
