// M3: verbindet Sync-Rohdaten mit dem Rechenkern (compute.js) und den
// Ansichten (Aktivitaetsliste FA-ACT-01, PMC FA-TP-06, Breakthroughs
// FA-SIG-07/08). Berechnung laeuft im Web Worker (NFA-04) und wird nicht bei
// jedem Seitenaufruf automatisch wiederholt (kann bei langer Historie
// spuerbar dauern) - nur beim allerersten Mal (noch kein model-File) und auf
// Knopfdruck (z. B. nach einem Sync mit neuen Aktivitaeten).
//
// Uebersicht-Redesign 2026-09: 3-Spalten-Layout nach TrainingPeaks-Vorbild
// (Screenshot des Auftraggebers) - links Signatur/Wochen-Zusammenfassung,
// Mitte letzte Aktivitaet + PMC-Chart, rechts Performance-Metrics-Kacheln +
// Ramp Rates + neueste Breakthroughs. Da wir keine geplanten Workouts haben
// (kein TrainingPeaks-Import dafuer vorgesehen), ersetzt "Letzte Aktivitaet"
// das dortige "Today"-Workout-Widget.

import { loadIndex } from './sync.js';
import { loadModelState, loadThresholds, loadMmpCurves, recomputeAll } from './compute.js';
import { ppPlausibility } from './ppCheck.js';
import { renderActivityList } from './activityListView.js';
import { computePmcSeries, renderMetricsSidebar, renderPmcChart } from './pmcView.js';
import { renderBreakthroughs } from './breakthroughView.js';
import { renderPowerCurve } from './powerCurveView.js';
import { renderWeekOverview } from './weekView.js';
import { renderRecentActivity, renderThisWeekSummary, renderRecentBreakthroughs, renderSportThresholds } from './dashboardExtras.js';

export async function renderDashboard({ overviewContainer, activitiesContainer, weeksContainer, powerCurveContainer, breakthroughsContainer }) {
  overviewContainer.innerHTML = '';

  const statusCard = document.createElement('div');
  statusCard.className = 'card';
  overviewContainer.appendChild(statusCard);

  const statusHeader = document.createElement('div');
  statusHeader.className = 'card-header';
  const statusHeading = document.createElement('h2');
  statusHeading.textContent = 'Status';
  statusHeader.appendChild(statusHeading);
  const recomputeBtn = document.createElement('button');
  recomputeBtn.className = 'btn-primary';
  recomputeBtn.textContent = 'Kennzahlen neu berechnen';
  statusHeader.appendChild(recomputeBtn);
  statusCard.appendChild(statusHeader);

  const statusP = document.createElement('p');
  statusCard.appendChild(statusP);

  const grid = document.createElement('div');
  grid.className = 'dashboard-grid';
  overviewContainer.appendChild(grid);

  const leftCol = document.createElement('div');
  leftCol.className = 'dashboard-col';
  const middleCol = document.createElement('div');
  middleCol.className = 'dashboard-col dashboard-col-main';
  const rightCol = document.createElement('div');
  rightCol.className = 'dashboard-col';
  grid.appendChild(leftCol);
  grid.appendChild(middleCol);
  grid.appendChild(rightCol);

  const signatureContainer = document.createElement('div');
  const thresholdsContainer = document.createElement('div');
  const thisWeekContainer = document.createElement('div');
  leftCol.appendChild(signatureContainer);
  leftCol.appendChild(thresholdsContainer);
  leftCol.appendChild(thisWeekContainer);

  const recentActivityContainer = document.createElement('div');
  const pmcChartContainer = document.createElement('div');
  middleCol.appendChild(recentActivityContainer);
  middleCol.appendChild(pmcChartContainer);

  const metricsSidebarContainer = document.createElement('div');
  const recentBreakthroughsContainer = document.createElement('div');
  rightCol.appendChild(metricsSidebarContainer);
  rightCol.appendChild(recentBreakthroughsContainer);

  // Eine einzelne Karte darf nicht mehr die gesamte Uebersicht mitreissen (genau das ist
  // beim Einbau der Sportart-Schwellen-Karte passiert: ein Fehler dort liess PMC-Chart,
  // Performance Metrics und alles Nachfolgende gar nicht erst rendern, weil ein einzelner
  // Wurf in refresh() den kompletten async-Ablauf abbrach). Jede Karte bekommt daher ihren
  // eigenen Fehler-Fang, der Rest der Uebersicht rendert trotzdem weiter.
  function safeRender(container, label, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[Uebersicht] ${label} fehlgeschlagen:`, err);
      if (container) {
        container.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'card';
        const p = document.createElement('p');
        p.className = 'error';
        p.textContent = `${label}: ${err.message}`;
        box.appendChild(p);
        container.appendChild(box);
      }
    }
  }

  // Selbst ein sauber gefangener Fehler nuetzt nichts, wenn ein Aufruf stattdessen einfach nie
  // resolved/rejected (z. B. ein haengender Drive-Request) - dann wuerde "await fn()" unten fuer
  // immer stehen bleiben und ALLES Nachfolgende in refresh() liefe nie, ganz ohne sichtbaren Fehler.
  function withTimeout(promise, ms, label) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: Zeitlimit (${ms / 1000}s) ueberschritten`)), ms))]);
  }

  async function safeRenderAsync(container, label, fn) {
    try {
      await withTimeout(fn(), 10000, label);
    } catch (err) {
      console.error(`[Uebersicht] ${label} fehlgeschlagen:`, err);
      if (container) {
        container.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'card';
        const p = document.createElement('p');
        p.className = 'error';
        p.textContent = `${label}: ${err.message}`;
        box.appendChild(p);
        container.appendChild(box);
      }
    }
  }

  async function refresh() {
    const index = await loadIndex();
    const modelState = await loadModelState();

    const uncomputed = index.activities.filter((a) => a.hasSignature === undefined).length;
    statusP.className = '';
    statusP.textContent = uncomputed > 0 ? `${uncomputed} Aktivität(en) noch ohne berechnete Kennzahlen - "Kennzahlen neu berechnen" klicken.` : 'Alle Aktivitäten sind berechnet.';

    let mmpCurves = [];
    await safeRenderAsync(null, 'Leistungskurven laden', async () => {
      mmpCurves = await loadMmpCurves();
    });
    safeRender(signatureContainer, 'Leistungssignatur', () => renderSignatureTiles(signatureContainer, modelState, mmpCurves));

    let thresholds = { pace: {}, hr: {} };
    await safeRenderAsync(null, 'Sportart-Schwellen laden', async () => {
      thresholds = await loadThresholds();
    });
    safeRender(thresholdsContainer, 'Sportart-Schwellen', () => renderSportThresholds(thresholdsContainer, thresholds));

    safeRender(thisWeekContainer, 'Diese Woche', () => renderThisWeekSummary(thisWeekContainer, index));
    safeRender(recentActivityContainer, 'Letzte Aktivität', () => renderRecentActivity(recentActivityContainer, index));

    let pmcSeries = { series: null, message: 'Fehler bei der Berechnung.' };
    safeRender(null, 'PMC-Berechnung', () => {
      pmcSeries = computePmcSeries(index, modelState);
    });
    safeRender(pmcChartContainer, 'Performance Management Chart', () => renderPmcChart(pmcChartContainer, pmcSeries));
    safeRender(metricsSidebarContainer, 'Performance Metrics', () => renderMetricsSidebar(metricsSidebarContainer, pmcSeries));
    safeRender(recentBreakthroughsContainer, 'Neueste Breakthroughs', () => renderRecentBreakthroughs(recentBreakthroughsContainer, modelState));
    safeRender(activitiesContainer, 'Aktivitätenliste', () => renderActivityList(activitiesContainer, index));
    safeRender(weeksContainer, 'Wochen-/Kalenderübersicht', () => renderWeekOverview(weeksContainer, index));
    await safeRenderAsync(powerCurveContainer, 'Leistungskurve', () => renderPowerCurve(powerCurveContainer));
    await safeRenderAsync(breakthroughsContainer, 'Breakthroughs', () => renderBreakthroughs(breakthroughsContainer, modelState, refresh));
    return { index, modelState };
  }

  async function triggerRecompute() {
    recomputeBtn.disabled = true;
    statusP.className = '';
    statusP.textContent = 'Berechne Kennzahlen (Web Worker, blockiert die Seite nicht)...';
    try {
      await recomputeAll();
      await refresh();
    } catch (err) {
      statusP.className = 'error';
      statusP.textContent = err.message;
    }
    recomputeBtn.disabled = false;
  }

  recomputeBtn.onclick = triggerRecompute;

  const { index, modelState } = await refresh();
  if (index.activities.length > 0 && !modelState.computedAt) {
    await triggerRecompute(); // Erstberechnung nach dem allerersten Sync
  }
}

// FA-SIG-13: ab dieser Abweichung wird die PP-Plausibilisierung als auffaellig markiert (rot statt
// dezent). Kein Lastenheft-Parameter (nur "Abweichungen werden angezeigt", keine Schwelle
// vorgegeben) - bewusst als UI-Konstante statt Modellparameter, da rein die Anzeige betroffen ist.
const PP_DEVIATION_WARN_PCT = 0.1;

/** XERT-Vorbild: aktuelle Leistungssignatur (CP/W'/Pmax) prominent als Kacheln. */
function renderSignatureTiles(container, modelState, mmpCurves) {
  container.innerHTML = '';
  if (modelState.needsMoreData || !modelState.history || modelState.history.length === 0) return;

  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Leistungssignatur</h2>';
  box.appendChild(header);

  const latest = modelState.history[modelState.history.length - 1];
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML = `
    <div class="stat-tile accent">
      <span class="stat-tile-label">Critical Power</span>
      <span class="stat-tile-value">${Math.round(latest.cp)}<span class="unit">W</span></span>
    </div>
    <div class="stat-tile accent">
      <span class="stat-tile-label">W' (HIE)</span>
      <span class="stat-tile-value">${(latest.wPrimeJ / 1000).toFixed(1)}<span class="unit">kJ</span></span>
    </div>
    <div class="stat-tile accent">
      <span class="stat-tile-label">Pmax</span>
      <span class="stat-tile-value">${Math.round(latest.pMax)}<span class="unit">W</span></span>
    </div>
  `;
  box.appendChild(grid);

  const caption = document.createElement('p');
  caption.className = 'stat-tile-caption';
  caption.textContent = `Stand: ${latest.date}${latest.source === 'initial' ? ' (Startsignatur)' : ' (nach Breakthrough)'}`;
  box.appendChild(caption);

  renderPpPlausibility(box, latest, mmpCurves);
}

/** FA-SIG-13: Modell-PP gegen die bis dahin gemessene beste 5-s-Leistung. Reine Anzeige, korrigiert das Modell nicht. */
function renderPpPlausibility(box, latest, mmpCurves) {
  const { measuredWatts, measuredDate, deviationWatts, deviationPct } = ppPlausibility(latest, mmpCurves || []);
  if (measuredWatts == null) return;

  const flagged = Math.abs(deviationPct) >= PP_DEVIATION_WARN_PCT;
  const p = document.createElement('p');
  p.className = 'stat-tile-caption';
  p.style.marginTop = '0.4rem';
  const sign = deviationWatts > 0 ? '+' : '';
  const badgeClass = flagged ? 'badge-danger' : 'badge-muted';
  p.innerHTML = `Gemessene beste 5-s-Leistung: ${Math.round(measuredWatts)} W (${measuredDate}) <span class="badge ${badgeClass}">${sign}${deviationWatts} W / ${sign}${Math.round(deviationPct * 100)} % ggü. PP</span>`;
  box.appendChild(p);
}
