// FA-ACT-02: Aktivitaets-Detailansicht - Verlaeufe von Leistung, Herzfrequenz,
// Kadenz, dazu MPA und W'bal (bei Rad mit Leistung), Belastungsanteile
// (Strain-Aufteilung Low/High/Peak), Kennzahlen. Rechnet direkt im
// Hauptfenster (kein Worker noetig - eine einzelne Aktivitaet ist klein genug,
// NFA-04 gilt fuer den Gesamtverlauf ueber alle Aktivitaeten, nicht hierfuer).

import { prepareActivity, mergeSettings, wPrimeBalanceSkiba2015, mpaTrace, signatureAtDate } from '../vendor/core/src/index.js';
import { loadIndex } from './sync.js';
import { loadModelState } from './compute.js';
import { readFile, readJson } from './storage.js';
import { decodeBundle, streamFileName, pointsFromActivityBundle } from './streamCodec.js';
import { downsample, downsampledBucketSize } from './chartUtils.js';
import { formatDuration, formatDistance } from './format.js';

const MEDAL_LABEL = { bronze: '🥉 Bronze', silver: '🥈 Silber', gold: '🥇 Gold' };

/** "1:23:45" bzw. "23:45" - Zeit im Training seit Start (nicht Uhrzeit). */
function formatElapsed(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * Achsbeschriftete Verlaufsgrafik mit Hover-Crosshair; die eigentliche Tooltip-Anzeige (mit allen
 * Kennzahlen ueber alle Verlaufs-Charts hinweg synchronisiert) steuert der Aufrufer per onHoverIndex/onLeave,
 * damit z. B. Leistung, Herzfrequenz und Kadenz in EINEM Tooltip erscheinen, egal welche Grafik gehovert wird.
 */
function createTimeChart(series, { height = 140, width = 820, bucketSize = 1, showXAxis = false, unitLabel = '', formatY = (v) => String(Math.round(v)), onHoverIndex, onLeave } = {}) {
  const padL = 38;
  const padR = 10;
  const padT = 10;
  const padB = showXAxis ? 22 : 8;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.style.display = 'block';

  const n = Math.max(...series.map((s) => s.data.length));
  if (n === 0) return { element: svg, setCrosshair() {} };

  function addEl(tag, attrs) {
    const el = document.createElementNS(svgNs, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
    return el;
  }

  const x = (i) => padL + (i / Math.max(1, n - 1)) * plotW;
  const yMin = Math.min(...series.map((s) => s.yMin ?? Math.min(...s.data)));
  const yMax = Math.max(...series.map((s) => s.yMax ?? Math.max(...s.data)), yMin + 1);
  const y = (v) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  // Y-Achse: Gitterlinien + Beschriftung (eine gemeinsame Skala fuer alle Serien dieser Grafik, damit z. B.
  // Leistung und MPA direkt vergleichbar bleiben statt unabhaengig voneinander normiert zu werden).
  for (const frac of [0, 1 / 3, 2 / 3, 1]) {
    const val = yMin + (yMax - yMin) * frac;
    const yy = y(val);
    addEl('line', { x1: padL, y1: yy.toFixed(1), x2: width - padR, y2: yy.toFixed(1), stroke: 'var(--border)', 'stroke-width': 1 });
    addEl('text', { x: padL - 6, y: (yy + 3).toFixed(1), 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = formatY(val);
  }
  if (unitLabel) {
    addEl('text', { x: 2, y: padT - 2, 'text-anchor': 'start', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = unitLabel;
  }

  // X-Achse (nur bei der untersten sichtbaren Grafik, sonst redundant): Zeit im Training seit Start.
  if (showXAxis) {
    const tickCount = Math.min(6, n);
    for (let k = 0; k < tickCount; k++) {
      const idx = Math.round((k / Math.max(1, tickCount - 1)) * (n - 1));
      addEl('text', { x: x(idx).toFixed(1), y: height - 4, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--text-faint)' }).textContent = formatElapsed(idx * bucketSize);
    }
  }

  for (const s of series) {
    const d = s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    addEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 1.5, ...(s.dashed ? { 'stroke-dasharray': '4 3' } : {}) });
  }

  // Hover: eigener Crosshair + je Serie ein Punkt, Position wird von aussen gesetzt (setCrosshair),
  // damit alle Verlaufs-Charts synchron denselben Zeitpunkt markieren.
  const crosshair = addEl('line', { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: 'var(--text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
  const dots = series.map((s) => addEl('circle', { r: 3, fill: s.color, opacity: 0 }));
  const hoverRect = addEl('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'transparent' });
  hoverRect.style.cursor = 'crosshair';

  function setCrosshair(idx) {
    if (idx == null) {
      crosshair.setAttribute('opacity', 0);
      dots.forEach((d) => d.setAttribute('opacity', 0));
      return;
    }
    const px = x(idx);
    crosshair.setAttribute('x1', px.toFixed(1));
    crosshair.setAttribute('x2', px.toFixed(1));
    crosshair.setAttribute('opacity', 1);
    series.forEach((s, i) => {
      const v = s.data[idx];
      if (v == null) {
        dots[i].setAttribute('opacity', 0);
        return;
      }
      dots[i].setAttribute('cx', px.toFixed(1));
      dots[i].setAttribute('cy', y(v).toFixed(1));
      dots[i].setAttribute('opacity', 1);
    });
  }

  function indexFromClientX(clientX) {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 ? width / rect.width : 1;
    const localX = (clientX - rect.left) * scale;
    const stepX = plotW / Math.max(1, n - 1);
    return Math.max(0, Math.min(n - 1, Math.round((localX - padL) / stepX)));
  }

  if (onHoverIndex) {
    hoverRect.addEventListener('pointermove', (evt) => onHoverIndex(indexFromClientX(evt.clientX), evt));
  }
  if (onLeave) {
    hoverRect.addEventListener('pointerleave', onLeave);
  }

  return { element: svg, setCrosshair };
}

function statTile(label, value, unit, accent) {
  return `<div class="stat-tile${accent ? ' accent' : ''}">
    <span class="stat-tile-label">${label}</span>
    <span class="stat-tile-value">${value}${unit ? `<span class="unit">${unit}</span>` : ''}</span>
  </div>`;
}

export async function openActivityDetail(activityId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  document.addEventListener('keydown', onKeydown);

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.innerHTML = '<p>Lade Aktivität...</p>';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  try {
    await render();
  } catch (err) {
    panel.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = err.message;
    panel.appendChild(p);
  }

  async function render() {
    const [index, modelState, settingsJson] = await Promise.all([loadIndex(), loadModelState(), readJson('settings.json')]);
    const meta = index.activities.find((a) => a.id === activityId);
    if (!meta) {
      panel.innerHTML = '<p class="error">Aktivität nicht gefunden.</p>';
      return;
    }

    const monthKey = meta.startTime.slice(0, 7);
    const buf = await readFile(streamFileName(monthKey));
    const bundle = buf ? await decodeBundle(buf) : null;
    const activityBundle = bundle ? bundle.activities[activityId] : null;

    panel.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-ghost modal-close-btn';
    closeBtn.textContent = 'Schließen ✕';
    closeBtn.onclick = close;
    panel.appendChild(closeBtn);

    const heading = document.createElement('h2');
    heading.textContent = `${meta.type} · ${meta.date}`;
    panel.appendChild(heading);
    if (meta.name) {
      const sub = document.createElement('p');
      sub.className = 'hint';
      sub.textContent = meta.name;
      panel.appendChild(sub);
    }

    if (!activityBundle) {
      const p = document.createElement('p');
      p.textContent = 'Keine Stream-Daten für diese Aktivität gefunden.';
      panel.appendChild(p);
      return;
    }

    const points = pointsFromActivityBundle(activityBundle);
    const settings = mergeSettings({});
    const prepared = prepareActivity({ id: activityId, date: meta.date, startTime: meta.startTime, type: meta.type, points }, settings);
    const stream = prepared.stream;

    // Kennzahlen
    const validWatts = [...stream.watts].filter((_, i) => stream.hasWatts[i]);
    const avgWatts = validWatts.length ? Math.round(validWatts.reduce((a, b) => a + b, 0) / validWatts.length) : null;
    const maxWatts = validWatts.length ? Math.round(Math.max(...validWatts)) : null;
    const validHr = [...stream.heartrate].filter((_, i) => stream.hasHeartrate[i]);
    const avgHr = validHr.length ? Math.round(validHr.reduce((a, b) => a + b, 0) / validHr.length) : null;
    const maxHr = validHr.length ? Math.round(Math.max(...validHr)) : null;

    const statsCard = document.createElement('div');
    statsCard.className = 'card';
    statsCard.innerHTML = `
      <h3>Kennzahlen</h3>
      <div class="stat-grid">
        ${statTile('Dauer', formatDuration(meta.movingTimeSec))}
        ${statTile('Distanz', formatDistance(meta.distanceM))}
        ${meta.np != null ? statTile('NP', meta.np, 'W', true) : ''}
        ${meta.if != null ? statTile('IF', meta.if.toFixed(2)) : ''}
        ${meta.tss != null ? statTile('TSS', meta.tss, '', true) : ''}
        ${avgWatts != null ? statTile('Ø Leistung', avgWatts, 'W') : ''}
        ${maxWatts != null ? statTile('Max Leistung', maxWatts, 'W') : ''}
        ${avgHr != null ? statTile('Ø Puls', avgHr, 'bpm') : ''}
        ${maxHr != null ? statTile('Max Puls', maxHr, 'bpm') : ''}
      </div>
    `;
    panel.appendChild(statsCard);

    // Belastungsanteile (Strain Low/High/Peak)
    if (meta.strain && meta.strain.total > 0) {
      const s = meta.strain;
      const total = s.total || s.low + s.high + s.peak || 1;
      const strainCard = document.createElement('div');
      strainCard.className = 'card';
      strainCard.innerHTML = `
        <h3>Belastungsanteile (Strain ${s.total})</h3>
        <div class="strain-bar">
          <div class="strain-bar-seg low" style="width:${(s.low / total) * 100}%"></div>
          <div class="strain-bar-seg high" style="width:${(s.high / total) * 100}%"></div>
          <div class="strain-bar-seg peak" style="width:${(s.peak / total) * 100}%"></div>
        </div>
        <div class="strain-legend">
          <span class="low">Low ${s.low}</span>
          <span class="high">High ${s.high}</span>
          <span class="peak">Peak ${s.peak}</span>
        </div>
      `;
      panel.appendChild(strainCard);
    }

    // Leistung (+ MPA, falls Signatur zum Datum bekannt), W'bal, Herzfrequenz, Kadenz - EIN gemeinsamer Hover:
    // egal welche Grafik gehovert wird, markieren alle synchron denselben Zeitpunkt und EIN Tooltip zeigt Zeit
    // im Training + alle an diesem Zeitpunkt verfuegbaren Kennzahlen (Leistung/MPA/W'bal/Herzfrequenz/Kadenz).
    if (stream.n > 0) {
      const chartsCard = document.createElement('div');
      chartsCard.className = 'card chart-tooltip-anchor';
      chartsCard.innerHTML = '<h3>Verläufe</h3>';
      panel.appendChild(chartsCard);

      const tooltip = document.createElement('div');
      tooltip.className = 'chart-tooltip';
      tooltip.hidden = true;
      chartsCard.appendChild(tooltip);

      const bucketSize = downsampledBucketSize(stream.n);
      const chartInstances = [];
      const combined = [];

      function collect(idx, key, value) {
        if (!combined[idx]) combined[idx] = { timeSec: idx * bucketSize };
        combined[idx][key] = value;
      }

      function onHoverIndex(idx, evt) {
        chartInstances.forEach((c) => c.setCrosshair(idx));
        const d = combined[idx];
        if (!d) return;
        const rows = [`<strong>Zeit: ${formatElapsed(d.timeSec)}</strong>`];
        if (d.watts != null) rows.push(`<div><span class="chart-tooltip-dot" style="background:#45b8b4"></span>Leistung: ${Math.round(d.watts)} W</div>`);
        if (d.mpa != null) rows.push(`<div><span class="chart-tooltip-dot" style="background:#e5495b"></span>MPA: ${Math.round(d.mpa)} W</div>`);
        if (d.balanceKJ != null) rows.push(`<div><span class="chart-tooltip-dot" style="background:#d8b34a"></span>W'bal: ${d.balanceKJ.toFixed(1)} kJ</div>`);
        if (d.hr != null) rows.push(`<div><span class="chart-tooltip-dot" style="background:#f0a7b0"></span>Herzfrequenz: ${Math.round(d.hr)} bpm</div>`);
        if (d.cadence != null) rows.push(`<div><span class="chart-tooltip-dot" style="background:#9397ab"></span>Kadenz: ${Math.round(d.cadence)} rpm</div>`);
        tooltip.innerHTML = rows.join('');
        tooltip.hidden = false;

        const anchorRect = chartsCard.getBoundingClientRect();
        const left = evt.clientX - anchorRect.left + 14;
        const nearRight = left > anchorRect.width - 170;
        tooltip.style.left = nearRight ? `${evt.clientX - anchorRect.left - 170}px` : `${left}px`;
        tooltip.style.top = `${Math.max(0, evt.clientY - anchorRect.top - 24)}px`;
      }

      function onLeave() {
        chartInstances.forEach((c) => c.setCrosshair(null));
        tooltip.hidden = true;
      }

      const sig = validWatts.length > 0 && modelState.history && modelState.history.length ? signatureAtDate(modelState.history, meta.date) : null;
      const hasFullSignature = !!(sig && sig.cp && sig.wPrimeJ && sig.pMax);
      const hasCadence = [...stream.cadence].some((c) => c > 0);

      const willRenderPower = validWatts.length > 0;
      const willRenderHr = validHr.length > 0;
      const willRenderCadence = hasCadence;
      const lastChart = willRenderCadence ? 'cadence' : willRenderHr ? 'hr' : willRenderPower ? (hasFullSignature ? 'wbal' : 'power') : null;

      if (willRenderPower) {
        const powerTitle = document.createElement('p');
        powerTitle.className = 'chart-title';
        powerTitle.textContent = sig ? 'Leistung (teal) · MPA (rot gestrichelt)' : 'Leistung';
        chartsCard.appendChild(powerTitle);

        const wattsDown = downsample(stream.watts);
        const powerSeries = [{ data: wattsDown, color: '#45b8b4', width: 1.5, yMin: 0 }];
        wattsDown.forEach((v, i) => collect(i, 'watts', v));

        if (hasFullSignature) {
          const balance = wPrimeBalanceSkiba2015(prepared.recoveryWatts, sig.cp, sig.wPrimeJ);
          const { mpa } = mpaTrace(prepared.recoveryWatts, { cp: sig.cp, wPrimeJ: sig.wPrimeJ, pMax: sig.pMax, n: settings.mpaExponent }, { balance });
          const mpaDown = downsample(mpa);
          powerSeries.push({ data: mpaDown, color: '#e5495b', width: 1.25, dashed: true, yMin: 0 });
          mpaDown.forEach((v, i) => collect(i, 'mpa', v));

          const powerChart = createTimeChart(powerSeries, { bucketSize, showXAxis: lastChart === 'power', unitLabel: 'W', onHoverIndex, onLeave });
          chartInstances.push(powerChart);
          chartsCard.appendChild(powerChart.element);

          const wbalTitle = document.createElement('p');
          wbalTitle.className = 'chart-title';
          wbalTitle.style.marginTop = '0.75rem';
          wbalTitle.textContent = "W'bal";
          chartsCard.appendChild(wbalTitle);

          const balanceKJDown = downsample(balance).map((v) => v / 1000);
          balanceKJDown.forEach((v, i) => collect(i, 'balanceKJ', v));
          const wbalChart = createTimeChart([{ data: balanceKJDown, color: '#d8b34a', width: 1.5, yMin: 0, yMax: sig.wPrimeJ / 1000 }], {
            height: 90,
            bucketSize,
            showXAxis: lastChart === 'wbal',
            unitLabel: 'kJ',
            formatY: (v) => v.toFixed(1),
            onHoverIndex,
            onLeave,
          });
          chartInstances.push(wbalChart);
          chartsCard.appendChild(wbalChart.element);
        } else {
          const powerChart = createTimeChart(powerSeries, { bucketSize, showXAxis: lastChart === 'power', unitLabel: 'W', onHoverIndex, onLeave });
          chartInstances.push(powerChart);
          chartsCard.appendChild(powerChart.element);
          if (!sig) {
            const hint = document.createElement('p');
            hint.className = 'hint';
            hint.textContent = 'MPA/W\'bal nicht verfügbar - noch keine Leistungssignatur zu diesem Datum bekannt.';
            chartsCard.appendChild(hint);
          }
        }
      }

      if (willRenderHr) {
        const hrTitle = document.createElement('p');
        hrTitle.className = 'chart-title';
        hrTitle.style.marginTop = '0.75rem';
        hrTitle.textContent = 'Herzfrequenz';
        chartsCard.appendChild(hrTitle);

        const hrDown = downsample(stream.heartrate);
        hrDown.forEach((v, i) => collect(i, 'hr', v));
        const hrChart = createTimeChart([{ data: hrDown, color: '#f0a7b0', width: 1.5 }], { height: 90, bucketSize, showXAxis: lastChart === 'hr', unitLabel: 'bpm', onHoverIndex, onLeave });
        chartInstances.push(hrChart);
        chartsCard.appendChild(hrChart.element);
      }

      if (willRenderCadence) {
        const cadTitle = document.createElement('p');
        cadTitle.className = 'chart-title';
        cadTitle.style.marginTop = '0.75rem';
        cadTitle.textContent = 'Kadenz';
        chartsCard.appendChild(cadTitle);

        const cadDown = downsample(stream.cadence);
        cadDown.forEach((v, i) => collect(i, 'cadence', v));
        const cadChart = createTimeChart([{ data: cadDown, color: '#9397ab', width: 1.5, yMin: 0 }], { height: 90, bucketSize, showXAxis: lastChart === 'cadence', unitLabel: 'rpm', onHoverIndex, onLeave });
        chartInstances.push(cadChart);
        chartsCard.appendChild(cadChart.element);
      }
    }

    // Breakthrough-Hinweis, falls diese Aktivitaet einer ist
    if (meta.breakthrough) {
      const btCard = document.createElement('div');
      btCard.className = 'card';
      btCard.innerHTML = `<h3>Breakthrough</h3><p>${meta.breakthrough.medal ? MEDAL_LABEL[meta.breakthrough.medal] : ''}${meta.breakthrough.discarded ? ' · verworfen' : ''}</p>`;
      panel.appendChild(btCard);
    }
  }
}
