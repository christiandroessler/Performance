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
import { loadModelState, loadThresholds, recomputeAll } from './compute.js';
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

  async function refresh() {
    const index = await loadIndex();
    const modelState = await loadModelState();

    const uncomputed = index.activities.filter((a) => a.hasSignature === undefined).length;
    statusP.className = '';
    statusP.textContent = uncomputed > 0 ? `${uncomputed} Aktivität(en) noch ohne berechnete Kennzahlen - "Kennzahlen neu berechnen" klicken.` : 'Alle Aktivitäten sind berechnet.';

    renderSignatureTiles(signatureContainer, modelState);
    renderSportThresholds(thresholdsContainer, await loadThresholds());
    renderThisWeekSummary(thisWeekContainer, index);
    renderRecentActivity(recentActivityContainer, index);
    const pmcSeries = computePmcSeries(index, modelState);
    renderPmcChart(pmcChartContainer, pmcSeries);
    renderMetricsSidebar(metricsSidebarContainer, pmcSeries);
    renderRecentBreakthroughs(recentBreakthroughsContainer, modelState);
    renderActivityList(activitiesContainer, index);
    renderWeekOverview(weeksContainer, index);
    await renderPowerCurve(powerCurveContainer);
    await renderBreakthroughs(breakthroughsContainer, modelState, refresh);
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

/** XERT-Vorbild: aktuelle Leistungssignatur (CP/W'/Pmax) prominent als Kacheln. */
function renderSignatureTiles(container, modelState) {
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
}
