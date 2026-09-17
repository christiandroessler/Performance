// Einstiegspunkt: Google-Sign-In -> Session-/Allowlist-Pruefung -> Onboarding
// (FA-AUTH-02) oder die App-Oberflaeche (Kopfzeile mit angemeldetem Nutzer +
// Tab-Navigation Uebersicht/Aktivitaeten/Leistungskurve/Breakthroughs/Daten).

import { signInWithGoogle, getSignedInEmail, signOut } from './auth.js';
import { fetchSession } from './api.js';
import { renderOnboarding, loadOrInitSettings } from './onboarding.js';
import { renderSyncView } from './syncView.js';
import { renderDashboard } from './dashboardView.js';

const app = document.getElementById('app');

main().catch(showFatalError);

async function main() {
  renderSignIn();
}

function renderSignIn() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'centered-screen';
  app.appendChild(screen);

  const mark = document.createElement('div');
  mark.className = 'brand-mark';
  mark.style.width = '40px';
  mark.style.height = '6px';
  screen.appendChild(mark);

  const h = document.createElement('h1');
  h.textContent = 'Performance App';
  screen.appendChild(h);
  const p = document.createElement('p');
  p.textContent = 'Bitte mit deinem Google-Konto anmelden.';
  screen.appendChild(p);
  const container = document.createElement('div');
  screen.appendChild(container);

  signInWithGoogle(container).then(afterSignIn).catch(showFatalError);
}

async function afterSignIn() {
  let session;
  try {
    session = await fetchSession();
  } catch (err) {
    if (err.status === 403) return renderRejected(); // FA-AUTH-01: neutrale Ablehnung
    throw err;
  }

  const params = new URLSearchParams(window.location.search);
  const stravaResult = params.get('strava');

  if (stravaResult === 'error') {
    return renderStravaError(params.get('reason'));
  }

  if (session.status === 'strava_connected') {
    const settings = await loadOrInitSettings();
    if (settings.weightKg) return renderAppShell(settings);
    return renderOnboarding(app, { resumeStep: 5, onComplete: renderAppShell });
  }

  const resumeStep = stravaResult === 'connected' ? 5 : 1;
  renderOnboarding(app, { resumeStep, onComplete: renderAppShell });
}

function renderRejected() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'centered-screen';
  app.appendChild(screen);
  const h = document.createElement('h1');
  h.textContent = 'Kein Zugang';
  screen.appendChild(h);
  const p = document.createElement('p');
  p.textContent = 'Dieses Konto hat aktuell keinen Zugang zu dieser App.';
  screen.appendChild(p);
}

function renderStravaError(reason) {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'centered-screen';
  app.appendChild(screen);
  const h = document.createElement('h1');
  h.textContent = 'Strava-Verbindung fehlgeschlagen';
  screen.appendChild(h);
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = `Grund: ${reason || 'unbekannt'}. Bitte erneut versuchen.`;
  screen.appendChild(p);
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'Erneut versuchen';
  btn.onclick = () => renderOnboarding(app, { resumeStep: 4, onComplete: renderAppShell });
  screen.appendChild(btn);
}

const TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'activities', label: 'Aktivitäten' },
  { id: 'weeks', label: 'Wochen/Kalender' },
  { id: 'power', label: 'Leistungskurve' },
  { id: 'breakthroughs', label: 'Breakthroughs' },
  { id: 'sync', label: 'Daten' },
];

function renderAppShell(settings) {
  app.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  app.appendChild(shell);

  shell.appendChild(buildHeader());

  const main = document.createElement('main');
  main.className = 'app-main';
  shell.appendChild(main);

  const panels = {};
  const tabButtons = {};
  for (const tab of TABS) {
    const panel = document.createElement('section');
    panel.className = 'tab-panel';
    panel.dataset.tab = tab.id;
    if (tab.id !== 'overview') panel.hidden = true;
    main.appendChild(panel);
    panels[tab.id] = panel;
  }

  function activateTab(id) {
    for (const tab of TABS) {
      panels[tab.id].hidden = tab.id !== id;
      tabButtons[tab.id].classList.toggle('active', tab.id === id);
    }
  }

  const header = shell.querySelector('.app-tabs');
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (tab.id === 'overview' ? ' active' : '');
    btn.textContent = tab.label;
    btn.onclick = () => activateTab(tab.id);
    header.appendChild(btn);
    tabButtons[tab.id] = btn;
  }

  renderSyncView(panels.sync).catch(showFatalError);
  renderDashboard({
    overviewContainer: panels.overview,
    activitiesContainer: panels.activities,
    weeksContainer: panels.weeks,
    powerCurveContainer: panels.power,
    breakthroughsContainer: panels.breakthroughs,
    weightKg: settings.weightKg,
  }).catch(showFatalError);
}

function buildHeader() {
  const header = document.createElement('header');
  header.className = 'app-header';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = '<span class="brand-mark"></span>Performance';
  header.appendChild(brand);

  const tabs = document.createElement('nav');
  tabs.className = 'app-tabs';
  header.appendChild(tabs);

  const email = getSignedInEmail() || '';
  const chip = document.createElement('div');
  chip.className = 'user-chip';
  chip.innerHTML = `
    <div class="user-avatar">${(email[0] || '?').toUpperCase()}</div>
    <div class="user-meta">
      <span class="user-email">${email}</span>
      <span class="user-status"><span class="status-dot"></span>Angemeldet</span>
    </div>
  `;
  const signOutBtn = document.createElement('button');
  signOutBtn.className = 'btn-ghost';
  signOutBtn.textContent = 'Abmelden';
  signOutBtn.onclick = () => {
    signOut();
    window.location.reload();
  };
  chip.appendChild(signOutBtn);
  header.appendChild(chip);

  return header;
}

function showFatalError(err) {
  console.error(err);
  app.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = err.message;
  app.appendChild(p);
}
