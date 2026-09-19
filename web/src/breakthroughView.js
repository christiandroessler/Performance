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

// UI-Schwelle (kein Lastenheft-Parameter, analog zu ppCheck.js#PP_DEVIATION_WARN_PCT): ab wann
// die Nebenbedingungs-Korrektur (core/src/breakthrough.js#enforceMpaConstraint) als eigener
// Hinweis auftaucht, statt nur den bereits sichtbaren `constraintUnsatisfied`-Fall (der nur bei
// Erreichen der Plausibilitaetsgrenzen greift, siehe core/README.md).
const CORRECTION_NOTE_THRESHOLD_PCT = 0.02;

/** Vergleicht das rohe Regressionsergebnis mit der finalen (korrigierten) Signatur - macht die
 * Absenkbremse/Nebenbedingungs-Korrektur sichtbar, auch wenn sie unterhalb der
 * Plausibilitaetsgrenzen konvergiert (dann bleibt `constraintUnsatisfied` false). */
function correctionNote(bt) {
  if (!bt.rawFit) return null;
  const parts = [];
  for (const [key, label, unit, scale] of [
    ['cp', 'CP', 'W', 1],
    ['pMax', 'PP', 'W', 1],
    ['wPrimeJ', 'HIE', 'kJ', 1000],
  ]) {
    const raw = bt.rawFit[key];
    const final = bt.proposedSignature ? bt.proposedSignature[key] : null;
    if (raw == null || final == null || raw === 0) continue;
    const deltaPct = (final - raw) / raw;
    if (Math.abs(deltaPct) < CORRECTION_NOTE_THRESHOLD_PCT) continue;
    const sign = deltaPct > 0 ? '+' : '';
    parts.push(`${label} ${Math.round(raw / scale)}→${Math.round(final / scale)}${unit} (${sign}${Math.round(deltaPct * 100)}%)`);
  }
  if (parts.length === 0) return null;
  return `Nebenbedingungs-Korrektur/Absenkbremse hat den rohen Regressionswert verschoben: ${parts.join(', ')}.`;
}

export async function renderBreakthroughs(container, modelState, onChanged) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Breakthroughs</h2>';
  box.appendChild(header);

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
  bulkBtn.className = 'btn-danger';
  bulkBtn.textContent = 'Ausgewählte verwerfen';
  bulkBtn.disabled = true;
  bulkBtn.style.marginBottom = '0.75rem';
  box.appendChild(bulkBtn);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  box.appendChild(list);

  for (const bt of [...breakthroughs].sort((a, b) => b.date.localeCompare(a.date))) {
    const row = document.createElement('div');
    row.style.borderBottom = '1px solid var(--border)';
    row.style.padding = '0.65rem 0';
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
    const medalPart = bt.medal ? ` <span class="badge badge-accent">${MEDAL_LABEL[bt.medal]}</span>` : '';
    const discardedPart = bt.discarded ? ' <span class="badge badge-muted">Verworfen</span>' : '';
    info.innerHTML = `<strong>${bt.date}</strong>${medalPart}${discardedPart}<br>` + `<span class="hint">${signatureText(bt.previousSignature)} → ${signatureText(bt.proposedSignature)}</span>`;
    if (bt.constraintUnsatisfied) {
      info.innerHTML += '<br><span class="error">Nebenbedingung nicht erfüllt - Datenqualität prüfen</span>';
    }
    const correction = correctionNote(bt);
    if (correction) {
      info.innerHTML += `<br><span class="hint">${correction}</span>`;
    }
    if (bt.pMaxHeld) {
      info.innerHTML += '<br><span class="hint">PP nicht neu geschätzt (keine kurze Sprint-Anstrengung in diesem Refit) - bisheriger Wert beibehalten.</span>';
    }
    if (bt.wPrimeHeld) {
      info.innerHTML += '<br><span class="hint">HIE nicht neu geschätzt (keine nahe-erschöpfende 2-20-min-Anstrengung in diesem Refit) - bisheriger Wert beibehalten.</span>';
    }
    row.appendChild(info);

    if (bt.discarded) {
      const reactivateBtn = document.createElement('button');
      reactivateBtn.className = 'btn-ghost';
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
