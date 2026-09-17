// FA-TP-06: Performance Management Chart (CTL, ATL, TSB) ueber alle
// Sportarten. Reines SVG, keine Chart-Bibliothek (Zero-Build-Architektur).

import { computeCTLATL } from '../vendor/core/src/index.js';

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

export function renderPmc(container, index, modelState) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Performance Management Chart</h2>';
  box.appendChild(header);

  const withTss = index.activities.filter((a) => a.date && a.tss != null);
  if (withTss.length === 0) {
    const p = document.createElement('p');
    // FA-SIG-03: die ersten 90 Tage der Historie dienen der Startsignatur-Regression,
    // erst danach gibt es ueberhaupt eine Schwelle und damit TSS (Kap. 7.1) - das ist
    // der haeufigste Grund fuer "noch kein TSS", nicht fehlende Leistungsdaten.
    p.textContent = modelState && modelState.needsMoreData
      ? `Noch keine Startsignatur, deshalb noch kein TSS: ${modelState.initial?.reason || 'nicht genug Daten in den ersten 90 Tagen der Historie'}. Mehr Historie importieren (z. B. "Gesamte Historie") oder abwarten, bis 90 Tage Trainingsdaten vorliegen.`
      : 'Noch keine Kennzahlen berechnet (Aktivitäten ohne Leistung/Schwelle liefern keinen TSS).';
    box.appendChild(p);
    return;
  }

  const dailyTSSMap = {};
  for (const a of withTss) {
    dailyTSSMap[a.date] = (dailyTSSMap[a.date] || 0) + a.tss;
  }
  const dates = allDatesBetween(withTss[0].date, withTss[withTss.length - 1].date);
  const series = computeCTLATL(dates, dailyTSSMap);

  const latest = series[series.length - 1];
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.style.marginBottom = '0.9rem';
  grid.innerHTML = `
    <div class="stat-tile accent">
      <span class="stat-tile-label">CTL · Fitness</span>
      <span class="stat-tile-value">${latest.ctl.toFixed(1)}</span>
    </div>
    <div class="stat-tile">
      <span class="stat-tile-label">ATL · Fatigue</span>
      <span class="stat-tile-value">${latest.atl.toFixed(1)}</span>
    </div>
    <div class="stat-tile">
      <span class="stat-tile-label">TSB · Form</span>
      <span class="stat-tile-value">${latest.tsb.toFixed(1)}</span>
    </div>
  `;
  box.appendChild(grid);

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
