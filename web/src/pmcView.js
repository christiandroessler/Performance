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

function buildChart(series) {
  const width = 600;
  const height = 220;
  const padding = 30;
  const maxVal = Math.max(1, ...series.map((s) => Math.max(s.ctl, s.atl)));
  const minTsb = Math.min(0, ...series.map((s) => s.tsb));
  const maxTsb = Math.max(1, ...series.map((s) => s.tsb));
  const n = series.length;

  const x = (i) => padding + (i / Math.max(1, n - 1)) * (width - 2 * padding);
  const yVal = (v) => height - padding - (v / maxVal) * (height - 2 * padding);
  const yTsb = (v) => height - padding - ((v - minTsb) / (maxTsb - minTsb || 1)) * (height - 2 * padding);

  const pathFor = (getY) => series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${getY(s).toFixed(1)}`).join(' ');

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.style.maxWidth = `${width}px`;

  function addPath(d, color, widthPx) {
    const p = document.createElementNS(svgNs, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', String(widthPx));
    svg.appendChild(p);
  }

  addPath(pathFor((s) => yTsb(s.tsb)), '#d8b34a', 1.5);
  addPath(pathFor((s) => yVal(s.atl)), '#8b90a8', 1.5);
  addPath(pathFor((s) => yVal(s.ctl)), '#45b8b4', 2);

  const legend = document.createElement('div');
  legend.innerHTML =
    '<span style="color:#45b8b4">● CTL</span> &nbsp; <span style="color:#8b90a8">● ATL</span> &nbsp; <span style="color:#d8b34a">● TSB</span>';
  legend.style.fontSize = '0.78rem';
  legend.style.color = 'var(--text-muted)';
  legend.style.marginBottom = '0.5rem';

  const wrapper = document.createElement('div');
  wrapper.appendChild(legend);
  wrapper.appendChild(svg);
  return wrapper;
}
