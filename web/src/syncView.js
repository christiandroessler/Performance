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
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Datenimport</h2>';
  box.appendChild(header);

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
  actions.className = 'btn-row';
  box.appendChild(actions);

  const backfillBox = document.createElement('div');
  backfillBox.style.marginTop = '0.75rem';
  box.appendChild(backfillBox);

  function setStatus(text) {
    status.textContent = text;
  }

  function setProgressFraction(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : hasData || done > 0 ? 100 : 0;
    barFill.style.width = `${pct}%`;
  }

  async function start(opts = {}) {
    actions.innerHTML = '';
    backfillBox.innerHTML = '';
    errorP.textContent = '';
    setStatus(opts.backfillWindowDays !== undefined ? 'Lade ältere Historie...' : 'Import läuft...');

    let result;
    try {
      result = await runSync(opts, (s) => {
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
    } catch (err) {
      setStatus('Import unterbrochen.');
      errorP.textContent = `Fehler: ${err.message}`;
      renderContinueButton(opts);
      return;
    }

    if (result.status === 'paused') {
      errorP.textContent = REASON_TEXT[result.reason] || `Angehalten (${result.reason}).`;
      if (result.reason === 'rate_limited' && result.retryAfterSeconds) {
        setTimeout(() => start(opts), (result.retryAfterSeconds + 2) * 1000);
      } else {
        renderContinueButton(opts);
      }
    } else if (result.status === 'done') {
      renderSyncButton();
    }
  }

  function renderContinueButton(opts) {
    actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Jetzt erneut versuchen';
    btn.onclick = () => start(opts);
    actions.appendChild(btn);
  }

  function renderSyncButton() {
    actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Jetzt synchronisieren';
    btn.onclick = () => start();
    actions.appendChild(btn);
    renderBackfillOffer();
  }

  function renderWindowChooser() {
    setStatus('Wie viel Trainingshistorie soll importiert werden?');
    actions.innerHTML = '';
    for (const opt of WINDOW_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.textContent = opt.label;
      btn.onclick = () => start({ firstImportWindowDays: opt.days });
      actions.appendChild(btn);
    }
  }

  /** Nachtraeglich mehr (aeltere) Historie laden - kein erneuter Abruf bereits gespeicherter Aktivitaeten. */
  function renderBackfillOffer() {
    backfillBox.innerHTML = '';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-ghost';
    toggleBtn.textContent = 'Mehr Historie laden...';
    toggleBtn.onclick = () => {
      backfillBox.innerHTML = '';
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Laedt zusaetzliche, aeltere Aktivitaeten nach (ohne bereits Gespeichertes erneut abzufragen). Bis zu wann zurueck insgesamt?';
      backfillBox.appendChild(hint);
      const row = document.createElement('div');
      row.className = 'btn-row';
      for (const opt of WINDOW_OPTIONS) {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.onclick = () => start({ backfillWindowDays: opt.days });
        row.appendChild(btn);
      }
      backfillBox.appendChild(row);
    };
    backfillBox.appendChild(toggleBtn);
  }

  if (inFlight) {
    // Fortsetzen braucht kein Zeitfenster mehr - Modus/Grenze stecken bereits im gespeicherten Fortschritt.
    // Automatisch fortsetzen (nicht nur Button anzeigen) - deckt genau den Fall ab, dass der Import beim
    // letzten Mal wegen eines Fehlers oder geschlossenen Browsers stehen geblieben ist.
    setStatus('Ein unterbrochener Import wird fortgesetzt...');
    start({});
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
  box.className = 'card';
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
