// Einstiegspunkt: Google-Sign-In -> Session-/Allowlist-Pruefung -> Onboarding
// (FA-AUTH-02) oder direkt die (fuer M2 noch minimale) App-Ansicht.

import { signInWithGoogle, getSignedInEmail } from './auth.js';
import { fetchSession } from './api.js';
import { renderOnboarding, loadOrInitSettings } from './onboarding.js';
import { renderSyncView } from './syncView.js';

const app = document.getElementById('app');

main().catch(showFatalError);

async function main() {
  renderSignIn();
}

function renderSignIn() {
  app.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = 'Performance App';
  app.appendChild(h);
  const p = document.createElement('p');
  p.textContent = 'Bitte mit deinem Google-Konto anmelden.';
  app.appendChild(p);
  const container = document.createElement('div');
  app.appendChild(container);

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
  const h = document.createElement('h1');
  h.textContent = 'Kein Zugang';
  app.appendChild(h);
  const p = document.createElement('p');
  p.textContent = 'Dieses Konto hat aktuell keinen Zugang zu dieser App.';
  app.appendChild(p);
}

function renderStravaError(reason) {
  app.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = 'Strava-Verbindung fehlgeschlagen';
  app.appendChild(h);
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = `Grund: ${reason || 'unbekannt'}. Bitte erneut versuchen.`;
  app.appendChild(p);
  const btn = document.createElement('button');
  btn.textContent = 'Erneut versuchen';
  btn.onclick = () => renderOnboarding(app, { resumeStep: 4, onComplete: renderAppShell });
  app.appendChild(btn);
}

function renderAppShell(settings) {
  app.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = `Willkommen, ${getSignedInEmail() || ''}`;
  app.appendChild(h);
  const p = document.createElement('p');
  p.textContent = `Gewicht: ${settings.weightKg} kg. Kennzahlen/Diagramme folgen in M3.`;
  app.appendChild(p);
  renderSyncView(app).catch(showFatalError);
}

function showFatalError(err) {
  console.error(err);
  app.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = err.message;
  app.appendChild(p);
}
