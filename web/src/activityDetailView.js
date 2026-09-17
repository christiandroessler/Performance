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
import { downsample } from './chartUtils.js';

const MEDAL_LABEL = { bronze: '🥉 Bronze', silver: '🥈 Silber', gold: '🥇 Gold' };

function formatDuration(sec) {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatDistance(m) {
  if (!m) return '-';
  return `${(m / 1000).toFixed(1)} km`;
}

function buildLineChart(series, { height = 140, width = 820 } = {}) {
  const padding = 24;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.style.display = 'block';

  const n = Math.max(...series.map((s) => s.data.length));
  if (n === 0) return svg;
  const x = (i) => padding + (i / Math.max(1, n - 1)) * (width - 2 * padding);

  for (const s of series) {
    const yMin = s.yMin ?? Math.min(...s.data);
    const yMax = s.yMax ?? Math.max(...s.data, yMin + 1);
    const y = (v) => height - padding - ((v - yMin) / (yMax - yMin || 1)) * (height - 2 * padding);
    const d = s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', s.color);
    path.setAttribute('stroke-width', String(s.width || 1.5));
    if (s.dashed) path.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(path);
  }
  return svg;
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
    const prepared = prepareActivity({ id: activityId, date: meta.date, startTime: meta.startTime, points }, settings);
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

    // Leistung (+ MPA, falls Signatur zum Datum bekannt) und Herzfrequenz
    if (stream.n > 0) {
      const chartsCard = document.createElement('div');
      chartsCard.className = 'card';
      chartsCard.innerHTML = '<h3>Verläufe</h3>';
      panel.appendChild(chartsCard);

      if (validWatts.length > 0) {
        const sig = modelState.history && modelState.history.length ? signatureAtDate(modelState.history, meta.date) : null;
        const powerTitle = document.createElement('p');
        powerTitle.className = 'chart-title';
        powerTitle.textContent = sig ? 'Leistung (teal) · MPA (rot gestrichelt)' : 'Leistung';
        chartsCard.appendChild(powerTitle);

        const wattsDown = downsample(stream.watts);
        const series = [{ data: wattsDown, color: '#45b8b4', width: 1.5, yMin: 0 }];

        if (sig && sig.cp && sig.wPrimeJ && sig.pMax) {
          const balance = wPrimeBalanceSkiba2015(prepared.recoveryWatts, sig.cp, sig.wPrimeJ);
          const { mpa } = mpaTrace(prepared.recoveryWatts, { cp: sig.cp, wPrimeJ: sig.wPrimeJ, pMax: sig.pMax, n: settings.mpaExponent }, { balance });
          series.push({ data: downsample(mpa), color: '#e5495b', width: 1.25, dashed: true, yMin: 0 });

          chartsCard.appendChild(buildLineChart(series));

          const wbalTitle = document.createElement('p');
          wbalTitle.className = 'chart-title';
          wbalTitle.style.marginTop = '0.75rem';
          wbalTitle.textContent = "W'bal";
          chartsCard.appendChild(wbalTitle);
          chartsCard.appendChild(buildLineChart([{ data: downsample(balance), color: '#d8b34a', width: 1.5, yMin: 0, yMax: sig.wPrimeJ }], { height: 90 }));
        } else {
          chartsCard.appendChild(buildLineChart(series));
          if (!sig) {
            const hint = document.createElement('p');
            hint.className = 'hint';
            hint.textContent = 'MPA/W\'bal nicht verfügbar - noch keine Leistungssignatur zu diesem Datum bekannt.';
            chartsCard.appendChild(hint);
          }
        }
      }

      if (validHr.length > 0) {
        const hrTitle = document.createElement('p');
        hrTitle.className = 'chart-title';
        hrTitle.style.marginTop = '0.75rem';
        hrTitle.textContent = 'Herzfrequenz';
        chartsCard.appendChild(hrTitle);
        chartsCard.appendChild(buildLineChart([{ data: downsample(stream.heartrate), color: '#f0a7b0', width: 1.5 }], { height: 90 }));
      }

      const hasCadence = [...stream.cadence].some((c) => c > 0);
      if (hasCadence) {
        const cadTitle = document.createElement('p');
        cadTitle.className = 'chart-title';
        cadTitle.style.marginTop = '0.75rem';
        cadTitle.textContent = 'Kadenz';
        chartsCard.appendChild(cadTitle);
        chartsCard.appendChild(buildLineChart([{ data: downsample(stream.cadence), color: '#9397ab', width: 1.5, yMin: 0 }], { height: 90 }));
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
