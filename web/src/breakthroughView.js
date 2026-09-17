// FA-SIG-07/08: Uebersichtsliste aller erkannten Breakthroughs, mit
// Mehrfachauswahl zum Verwerfen. Verworfene bleiben protokolliert und sind
// einzeln reaktivierbar. Jede Aenderung stoesst eine vollstaendige
// chronologische Neuberechnung an (compute.js#recomputeAll).

import { discardBreakthrough, reactivateBreakthrough } from './compute.js';

const MEDAL_LABEL = { bronze: '🥉 Bronze', silver: '🥈 Silber', gold: '🥇 Gold' };

function signatureText(sig) {
  if (!sig) return '-';
  return `TP ${Math.round(sig.cp)}W · HIE ${Math.round(sig.wPrimeJ / 1000)}kJ · PP ${Math.round(sig.pMax)}W`;
}

export async function renderBreakthroughs(container, modelState, onChanged) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'step';
  container.appendChild(box);

  const heading = document.createElement('h2');
  heading.textContent = 'Breakthroughs';
  box.appendChild(heading);

  if (modelState.needsMoreData) {
    const p = document.createElement('p');
    p.textContent = `Noch keine Startsignatur: ${modelState.initial?.reason || 'nicht genug Daten in den ersten 90 Tagen'}.`;
    box.appendChild(p);
    return;
  }

  const breakthroughs = modelState.breakthroughs || [];
  if (breakthroughs.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Bisher keine Breakthroughs erkannt.';
    box.appendChild(p);
    return;
  }

  const selected = new Set();
  const busyBox = document.createElement('p');
  box.appendChild(busyBox);

  const bulkBtn = document.createElement('button');
  bulkBtn.textContent = 'Ausgewählte verwerfen';
  bulkBtn.disabled = true;
  bulkBtn.style.marginBottom = '0.5rem';
  box.appendChild(bulkBtn);

  const list = document.createElement('div');
  box.appendChild(list);

  for (const bt of [...breakthroughs].sort((a, b) => b.date.localeCompare(a.date))) {
    const row = document.createElement('div');
    row.style.borderBottom = '1px solid #8882';
    row.style.padding = '0.5rem 0';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.75rem';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = bt.discarded;
    checkbox.onchange = () => {
      if (checkbox.checked) selected.add(bt.activityId);
      else selected.delete(bt.activityId);
      bulkBtn.disabled = selected.size === 0;
    };
    row.appendChild(checkbox);

    const info = document.createElement('div');
    info.style.flex = '1';
    const medalPart = bt.medal ? ` · ${MEDAL_LABEL[bt.medal]}` : '';
    const discardedPart = bt.discarded ? ' · VERWORFEN' : '';
    info.innerHTML = `<strong>${bt.date}</strong>${medalPart}${discardedPart}<br>` + `${signatureText(bt.previousSignature)} → ${signatureText(bt.proposedSignature)}`;
    if (bt.constraintUnsatisfied) {
      info.innerHTML += '<br><span class="error">Nebenbedingung nicht erfüllt - Datenqualität prüfen</span>';
    }
    row.appendChild(info);

    if (bt.discarded) {
      const reactivateBtn = document.createElement('button');
      reactivateBtn.textContent = 'Reaktivieren';
      reactivateBtn.onclick = () => runChange(() => reactivateBreakthrough(bt.activityId));
      row.appendChild(reactivateBtn);
    }

    list.appendChild(row);
  }

  bulkBtn.onclick = () =>
    runChange(async () => {
      for (const id of selected) await discardBreakthrough(id);
    });

  async function runChange(fn) {
    busyBox.textContent = 'Neuberechnung läuft...';
    bulkBtn.disabled = true;
    try {
      await fn();
      busyBox.textContent = '';
      await onChanged();
    } catch (err) {
      busyBox.textContent = '';
      busyBox.className = 'error';
      busyBox.textContent = err.message;
    }
  }
}
