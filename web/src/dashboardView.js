// M3: verbindet Sync-Rohdaten mit dem Rechenkern (compute.js) und den
// Ansichten (Aktivitaetsliste FA-ACT-01, PMC FA-TP-06, Breakthroughs
// FA-SIG-07/08). Berechnung laeuft im Web Worker (NFA-04) und wird nicht bei
// jedem Seitenaufruf automatisch wiederholt (kann bei langer Historie
// spuerbar dauern) - nur beim allerersten Mal (noch kein model-File) und auf
// Knopfdruck (z. B. nach einem Sync mit neuen Aktivitaeten).

import { loadIndex } from './sync.js';
import { loadModelState, recomputeAll } from './compute.js';
import { renderActivityList } from './activityListView.js';
import { renderPmc } from './pmcView.js';
import { renderBreakthroughs } from './breakthroughView.js';
import { renderPowerCurve } from './powerCurveView.js';

export async function renderDashboard(container) {
  const box = document.createElement('div');
  container.appendChild(box);

  const statusP = document.createElement('p');
  box.appendChild(statusP);

  const recomputeBtn = document.createElement('button');
  recomputeBtn.textContent = 'Kennzahlen neu berechnen';
  recomputeBtn.style.marginBottom = '1rem';
  box.appendChild(recomputeBtn);

  const activitiesContainer = document.createElement('div');
  const pmcContainer = document.createElement('div');
  const powerCurveContainer = document.createElement('div');
  const breakthroughsContainer = document.createElement('div');
  box.appendChild(activitiesContainer);
  box.appendChild(pmcContainer);
  box.appendChild(powerCurveContainer);
  box.appendChild(breakthroughsContainer);

  async function refresh() {
    const index = await loadIndex();
    const modelState = await loadModelState();

    const uncomputed = index.activities.filter((a) => a.hasSignature === undefined).length;
    statusP.className = '';
    statusP.textContent = uncomputed > 0 ? `${uncomputed} Aktivität(en) noch ohne berechnete Kennzahlen - "Kennzahlen neu berechnen" klicken.` : '';

    renderActivityList(activitiesContainer, index);
    renderPmc(pmcContainer, index);
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
