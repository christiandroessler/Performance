// Einstiegspunkt: Google-Sign-In -> Session-/Allowlist-Pruefung -> Onboarding
// (FA-AUTH-02) oder die App-Oberflaeche (Kopfzeile mit angemeldetem Nutzer +
// Tab-Navigation Uebersicht/Aktivitaeten/Leistungskurve/Breakthroughs/Daten).

import { signInWithGoogle, trySilentSignIn, getSignedInEmail, signOut } from './auth.js';
import { fetchSession } from './api.js';
import { renderOnboarding, loadOrInitSettings } from './onboarding.js';
import { renderSyncView } from './syncView.js';
import { renderDashboard } from './dashboardView.js';
import { renderGroup } from './groupView.js';
import { applyStoredTheme } from './theme.js';
import { openSettings } from './settingsView.js';
import { openProfile, PROFILE_PHOTO_FILE } from './profileView.js';
import { openGlossary } from './glossaryView.js';
import { readFile } from './storage.js';

const app = document.getElementById('app');

applyStoredTheme(); // vor dem ersten Render, damit kein kurzes Dunkel-Aufblitzen im Hellmodus entsteht
registerServiceWorker(); // FA-PWA-01: nur fuer die Installierbarkeits-Heuristik, siehe sw.js

main().catch(showFatalError);

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service Worker nicht registriert:', err));
}

async function main() {
  renderCheckingScreen();
  // "Angemeldet bleiben": erst still versuchen, ohne dass der Nutzer klicken muss (Google One
  // Tap/FedCM) - klappt nur, wenn der Browser noch bei Google angemeldet ist. trySilentSignIn()
  // haengt/wirft nie (siehe auth.js), daher reicht hier ein einfaches await ohne eigenes Zeitlimit.
  const silentToken = await trySilentSignIn();
  if (silentToken) return afterSignIn();
  renderSignIn();
}

function renderCheckingScreen() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'centered-screen';
  app.appendChild(screen);
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = 'Anmeldung wird geprüft...';
  screen.appendChild(p);
}

function renderSignIn() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'centered-screen';
  app.appendChild(screen);

  const card = document.createElement('div');
  card.className = 'card signin-card';
  screen.appendChild(card);

  const icon = document.createElement('img');
  icon.src = '/icon.svg';
  icon.alt = '';
  icon.className = 'signin-icon';
  card.appendChild(icon);

  const h = document.createElement('h1');
  h.textContent = 'Performance App';
  card.appendChild(h);
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = 'Leistungssignatur, Trainingsbelastung und Stoffwechselmodell an einem Ort.';
  card.appendChild(p);
  const container = document.createElement('div');
  container.className = 'signin-button-row';
  card.appendChild(container);

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

  const onComplete = (settings) => renderAppShell(settings, session);

  if (session.status === 'strava_connected') {
    const settings = await loadOrInitSettings();
    if (settings.weightKg) return renderAppShell(settings, session);
    return renderOnboarding(app, { resumeStep: 5, onComplete });
  }

  const resumeStep = stravaResult === 'connected' ? 5 : 1;
  renderOnboarding(app, { resumeStep, onComplete });
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

const BASE_TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'activities', label: 'Aktivitäten' },
  { id: 'weeks', label: 'Wochen/Kalender' },
  { id: 'power', label: 'Leistungskurve' },
  { id: 'load', label: 'Belastung' },
  { id: 'metabolic', label: 'Stoffwechsel' },
  { id: 'breakthroughs', label: 'Breakthroughs' },
  { id: 'sync', label: 'Daten' },
];
const ADMIN_TAB = { id: 'group', label: 'Gruppe' }; // FA-USER-04: Admin-Ansicht, nur fuer session.role==='admin'

function renderAppShell(settings, session) {
  app.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  app.appendChild(shell);

  shell.appendChild(buildHeader());

  const main = document.createElement('main');
  main.className = 'app-main';
  shell.appendChild(main);

  // FA-USER-04: der "Gruppe"-Tab ist NUR fuer Admins sichtbar - Mitglieder sehen ihn gar
  // nicht erst, statt sich auf die serverseitige 403-Antwort (requireAdmin) zu verlassen.
  const tabs = session && session.role === 'admin' ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  const panels = {};
  const tabButtons = {};
  for (const tab of tabs) {
    const panel = document.createElement('section');
    panel.className = 'tab-panel';
    panel.dataset.tab = tab.id;
    if (tab.id !== 'overview') panel.hidden = true;
    main.appendChild(panel);
    panels[tab.id] = panel;
  }

  function activateTab(id) {
    for (const tab of tabs) {
      panels[tab.id].hidden = tab.id !== id;
      tabButtons[tab.id].classList.toggle('active', tab.id === id);
    }
  }

  const header = shell.querySelector('.app-tabs');
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (tab.id === 'overview' ? ' active' : '');
    btn.textContent = tab.label;
    btn.onclick = () => activateTab(tab.id);
    header.appendChild(btn);
    tabButtons[tab.id] = btn;
  }

  // dashboardPromise wird an renderSyncView durchgereicht, damit "Kennzahlen neu berechnen"
  // (jetzt im "Daten"-Tab, siehe syncView.js) die Uebersicht danach aktualisieren kann - beide
  // Views starten weiterhin parallel, das Neuberechnen wartet nur bis zum tatsaechlichen Klick.
  const dashboardPromise = renderDashboard({
    overviewContainer: panels.overview,
    activitiesContainer: panels.activities,
    weeksContainer: panels.weeks,
    powerCurveContainer: panels.power,
    loadResponseContainer: panels.load,
    metabolicContainer: panels.metabolic,
    breakthroughsContainer: panels.breakthroughs,
    weightKg: settings.weightKg,
  }).catch(showFatalError);
  renderSyncView(panels.sync, {
    onRecomputed: async () => {
      const dashboard = await dashboardPromise;
      if (dashboard) await dashboard.refresh();
    },
  }).catch(showFatalError);
  if (panels.group) renderGroup(panels.group).catch(showFatalError);
}

function buildHeader() {
  const header = document.createElement('header');
  header.className = 'app-header';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = '<span class="brand-mark"></span>Performance App';
  header.appendChild(brand);

  const tabs = document.createElement('nav');
  tabs.className = 'app-tabs';
  header.appendChild(tabs);

  header.appendChild(buildUserMenu());

  return header;
}

/** Klick auf den Hamburger-Button (drei Striche) oeffnet ein Menue (Einstellungen/Begriffe/Abmelden); der Chip ist reine Anzeige. */
function buildUserMenu() {
  const email = getSignedInEmail() || '';

  const wrap = document.createElement('div');
  wrap.className = 'user-menu';

  const chip = document.createElement('div');
  chip.className = 'user-chip';
  chip.innerHTML = `
    <div class="user-avatar">${(email[0] || '?').toUpperCase()}</div>
    <div class="user-meta">
      <span class="user-email">${email}</span>
      <span class="user-status"><span class="status-dot"></span>Angemeldet</span>
    </div>
  `;
  wrap.appendChild(chip);

  // Profilfoto statt Buchstaben-Avatar, falls in profileView.js eines hochgeladen wurde.
  readFile(PROFILE_PHOTO_FILE)
    .then((buf) => {
      if (!buf) return;
      const avatar = chip.querySelector('.user-avatar');
      avatar.textContent = '';
      avatar.style.backgroundImage = `url(${URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }))})`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
    })
    .catch(() => {});

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'menu-toggle';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', 'Menü');
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  wrap.appendChild(toggleBtn);

  const dropdown = document.createElement('div');
  dropdown.className = 'user-menu-dropdown';
  dropdown.hidden = true;
  wrap.appendChild(dropdown);

  function addItem(label, onClick, { danger = false } = {}) {
    const btn = document.createElement('button');
    btn.className = 'user-menu-item' + (danger ? ' danger' : '');
    btn.textContent = label;
    btn.onclick = () => {
      closeDropdown();
      onClick();
    };
    dropdown.appendChild(btn);
    return btn;
  }

  addItem('Profil', openProfile);
  addItem('Einstellungen', openSettings);
  addItem('Begriffe', openGlossary);
  addItem('Datenschutz', () => window.open('/privacy.html', '_blank', 'noopener')); // NFA-02: jederzeit einsehbar, nicht nur im Onboarding
  const divider = document.createElement('hr');
  divider.className = 'user-menu-divider';
  dropdown.appendChild(divider);
  addItem(
    'Abmelden',
    () => {
      signOut();
      window.location.reload();
    },
    { danger: true }
  );

  function openDropdown() {
    dropdown.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKeydown);
  }
  function closeDropdown() {
    dropdown.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKeydown);
  }
  function onOutsideClick(e) {
    if (!wrap.contains(e.target)) closeDropdown();
  }
  function onKeydown(e) {
    if (e.key === 'Escape') closeDropdown();
  }

  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    if (dropdown.hidden) openDropdown();
    else closeDropdown();
  };

  return wrap;
}

function showFatalError(err) {
  console.error(err);
  app.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = err.message;
  app.appendChild(p);
}
