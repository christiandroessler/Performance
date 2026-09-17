// UI fuer den Sync-Zustand nach abgeschlossenem Onboarding (Kap. 5.3,
// FA-SYNC-01 bis 05). Kennzahlen/Diagramme sind M3-Scope - hier nur Fortschritt
// und Steuerung des Imports.

import { getSyncProgress } from './api.js';
import { loadIndex, runSync, isDesktopViewport } from './sync.js';

const WINDOW_OPTIONS = [
  { days: 30, label: 'Letzte 30 Tage' },
  { days: 90, label: 'Letzte 90 Tage' },
  { days: 365, label: 'Letztes Jahr' },
  { days: 'all', label: 'Gesamte Historie' },
];

const REASON_TEXT = {
  rate_limited: 'Kurz gedrosselt (App-weites Strava-Limit) - wird automatisch fortgesetzt.',
  daily_quota_exhausted: 'Heutiges Strava-Tageskontingent erreicht. Der Import setzt sich morgen automatisch fort.',
};

export async function renderSyncView(container) {
  const index = await loadIndex();
  const inFlight = await getSyncProgress();
  const hasData = index.activities.length > 0;

  if (!hasData && !inFlight && !isDesktopViewport()) {
    renderDesktopOnlyNotice(container);
    return;
  }

  const box = document.createElement('div');
  box.className = 'step';
  container.appendChild(box);

  const heading = document.createElement('h2');
  heading.textContent = 'Datenimport';
  box.appendChild(heading);

  const status = document.createElement('p');
  box.appendChild(status);

  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  const barFill = document.createElement('div');
  barFill.style.width = '0%';
  bar.appendChild(barFill);
  box.appendChild(bar);

  const errorP = document.createElement('p');
  errorP.className = 'error';
  box.appendChild(errorP);

  const actions = document.createElement('div');
  box.appendChild(actions);

  function setStatus(text) {
    status.textContent = text;
  }

  function setProgressFraction(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : hasData || done > 0 ? 100 : 0;
    barFill.style.width = `${pct}%`;
  }

  async function start(firstImportWindowDays) {
    actions.innerHTML = '';
    errorP.textContent = '';
    setStatus('Import laeuft...');

    const result = await runSync({ firstImportWindowDays }, (s) => {
      if (s.done) {
        setStatus(`Import abgeschlossen: ${s.storedTotal} Aktivitaeten gespeichert.`);
        setProgressFraction(1, 1);
        return;
      }
      const total = s.discovered || 0;
      const done = total - s.remaining;
      setStatus(
        s.listingDone
          ? `Lade Aktivitaeten: ${done} von ${total} verarbeitet.`
          : `Suche neue Aktivitaeten... (${total} gefunden)`
      );
      setProgressFraction(done, total);
    });

    if (result.status === 'paused') {
      errorP.textContent = REASON_TEXT[result.reason] || `Angehalten (${result.reason}).`;
      if (result.reason === 'rate_limited' && result.retryAfterSeconds) {
        setTimeout(() => start(firstImportWindowDays), (result.retryAfterSeconds + 2) * 1000);
      } else {
        renderContinueButton(firstImportWindowDays);
      }
    } else if (result.status === 'done') {
      renderSyncButton();
    }
  }

  function renderContinueButton(firstImportWindowDays) {
    actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.textContent = 'Jetzt erneut versuchen';
    btn.onclick = () => start(firstImportWindowDays);
    actions.appendChild(btn);
  }

  function renderSyncButton() {
    actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.textContent = 'Jetzt synchronisieren';
    btn.onclick = () => start();
    actions.appendChild(btn);
  }

  function renderWindowChooser() {
    setStatus('Wie viel Trainingshistorie soll importiert werden?');
    actions.innerHTML = '';
    for (const opt of WINDOW_OPTIONS) {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.style.marginRight = '0.5rem';
      btn.onclick = () => start(opt.days);
      actions.appendChild(btn);
    }
  }

  if (inFlight) {
    // Fortsetzen braucht kein Zeitfenster mehr - Modus/Grenze stecken bereits im gespeicherten Fortschritt.
    setStatus('Ein Import wurde unterbrochen und kann fortgesetzt werden.');
    renderContinueButton(undefined);
  } else if (!hasData) {
    renderWindowChooser();
  } else {
    setStatus(`${index.activities.length} Aktivitaeten gespeichert. Letzter Sync: ${formatDate(index.lastSyncAt)}.`);
    setProgressFraction(1, 1);
    start(); // FA-SYNC-01: inkrementeller Sync beim Oeffnen der App
  }
}

function renderDesktopOnlyNotice(container) {
  const box = document.createElement('div');
  box.className = 'step';
  const h = document.createElement('h2');
  h.textContent = 'Datenimport';
  box.appendChild(h);
  const p = document.createElement('p');
  p.textContent = 'Der Erstimport ist nur in der Desktop-Ansicht moeglich. Bitte auf einem breiteren Bildschirm oeffnen.';
  box.appendChild(p);
  container.appendChild(box);
}

function formatDate(iso) {
  if (!iso) return 'nie';
  return new Date(iso).toLocaleString('de-DE');
}
