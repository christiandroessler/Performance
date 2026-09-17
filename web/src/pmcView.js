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

export function renderPmc(container, index) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'step';
  container.appendChild(box);

  const heading = document.createElement('h2');
  heading.textContent = 'Performance Management Chart';
  box.appendChild(heading);

  const withTss = index.activities.filter((a) => a.date && a.tss != null);
  if (withTss.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Noch keine Kennzahlen berechnet (Aktivitäten ohne Leistung/Schwelle liefern keinen TSS).';
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
  const summary = document.createElement('p');
  summary.textContent = `Aktuell: CTL (Fitness) ${latest.ctl.toFixed(1)} · ATL (Fatigue) ${latest.atl.toFixed(1)} · TSB (Form) ${latest.tsb.toFixed(1)}`;
  box.appendChild(summary);

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

  addPath(pathFor((s) => yTsb(s.tsb)), '#f39c12', 1.5);
  addPath(pathFor((s) => yVal(s.atl)), '#e74c3c', 1.5);
  addPath(pathFor((s) => yVal(s.ctl)), '#2e86de', 2);

  const legend = document.createElement('div');
  legend.innerHTML =
    '<span style="color:#2e86de">● CTL</span> &nbsp; <span style="color:#e74c3c">● ATL</span> &nbsp; <span style="color:#f39c12">● TSB</span>';
  legend.style.fontSize = '0.85rem';
  legend.style.marginBottom = '0.5rem';

  const wrapper = document.createElement('div');
  wrapper.appendChild(legend);
  wrapper.appendChild(svg);
  return wrapper;
}
