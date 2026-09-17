// Onboarding in fester Reihenfolge (FA-AUTH-02):
// (1) Datenschutzhinweis lesen, (2) ausdrueckliche Einwilligung zur
// Drive-Ablage, (3) Drive-Zugriff (drive.appdata) erteilen, (4) Strava
// verbinden, (5) Gewicht bestaetigen/eingeben.
//
// UX: Schritte 1-3 sind EIN Bildschirm (Datenschutztext + Einwilligungs-
// Haken + ein Button, der Einwilligung UND Drive-Zugriff in einem Klick
// erledigt) - weniger Klick-Strecke vor dem eigentlich einzig unvermeidbaren
// zweiten Google-Dialog (Google trennt "Anmeldung" und "Drive-Zugriff
// erlauben" technisch, das laesst sich ohne Sicherheitsabstriche nicht in
// einen einzigen Google-Dialog zusammenfassen - wohl aber in einen
// einzigen App-Bildschirm). Interne Schrittnummern (1/4/5) bleiben wie
// zuvor gueltige Einstiegspunkte fuer main.js (resumeStep).
//
// FA-AUTH-03: Strava (Schritt 4) ist erst erreichbar, nachdem Einwilligung
// UND Drive-Zugriff abgeschlossen sind - das wird hier durch die
// Reihenfolge der Schritte selbst erzwungen, nicht nur durch UI-Kosmetik.

import { requestDriveAccess, getSignedInEmail } from './auth.js';
import { readJson, writeJson } from './storage.js';
import { startStravaConnect } from './api.js';

const SETTINGS_FILE = 'settings.json';

export async function loadOrInitSettings() {
  const existing = await readJson(SETTINGS_FILE);
  if (existing) return existing;
  return {
    schemaVersion: 1,
    email: getSignedInEmail(),
    consent: { given: false, at: null },
    weightKg: null,
    weightHistory: [],
  };
}

export function renderOnboarding(container, { resumeStep, onComplete }) {
  let settings = null;
  let step = resumeStep || 1;

  render();

  async function render() {
    container.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'onboarding-shell';
    container.appendChild(shell);

    const mark = document.createElement('div');
    mark.className = 'brand-mark';
    mark.style.width = '32px';
    mark.style.height = '5px';
    mark.style.marginBottom = '0.75rem';
    shell.appendChild(mark);

    const heading = document.createElement('h1');
    heading.textContent = 'Einrichtung';
    shell.appendChild(heading);

    const progressStage = step >= 4 ? (step >= 5 ? 2 : 1) : 0;
    const progress = document.createElement('div');
    progress.className = 'onboarding-progress';
    for (let i = 0; i < 3; i++) {
      const seg = document.createElement('div');
      seg.className = 'onboarding-progress-step' + (i <= progressStage ? ' done' : '');
      progress.appendChild(seg);
    }
    shell.appendChild(progress);

    if (step === 1 || step === 2 || step === 3) renderWelcomeStep(shell);
    else if (step === 4) renderStravaStep(shell);
    else if (step === 5) await renderWeightStep(shell);
  }

  function stepBox(container, title) {
    const box = document.createElement('div');
    box.className = 'card';
    const h = document.createElement('h2');
    h.textContent = title;
    box.appendChild(h);
    container.appendChild(box);
    return box;
  }

  function renderWelcomeStep(container) {
    const box = stepBox(container, 'Konto einrichten');
    const p = document.createElement('p');
    p.className = 'lede';
    p.textContent =
      'Deine Trainingsdaten liegen ausschliesslich in deinem eigenen Google-Drive-App-Ordner und im lokalen Browser-Cache. ' +
      'Der Server (Worker) speichert keine Trainingsdaten, nur deinen Verbindungsstatus und ein verschluesseltes Strava-Token. ' +
      'Der Admin hat keinen Zugriff auf deine Trainingsdaten. Du kannst deine Daten jederzeit vollstaendig loeschen.';
    // Hinweis: vollstaendiger, rechtlich abgestimmter Text folgt in M6 (NFA-02).
    box.appendChild(p);

    const label = document.createElement('label');
    label.className = 'checkbox-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    label.appendChild(checkbox);
    label.append('Ich willige ausdrücklich ein, dass meine eigenen Strava-Daten in meinem eigenen Google-Drive-App-Ordner gespeichert werden.');
    box.appendChild(label);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Google zeigt dazu gleich noch einmal einen eigenen Freigabe-Dialog für den Drive-Zugriff - das ist eine Sicherheitsvorgabe von Google und lässt sich nicht überspringen.';
    box.appendChild(hint);

    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Erlauben & fortfahren';
    btn.disabled = true;
    checkbox.onchange = () => {
      btn.disabled = !checkbox.checked;
    };
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        settings = await loadOrInitSettings();
        settings.consent = { given: true, at: new Date().toISOString() };
        await requestDriveAccess();
        // FA-AUTH-03: die Einwilligung wird JETZT persistiert, sobald ueberhaupt Drive-Zugriff besteht.
        await writeJson(SETTINGS_FILE, settings);
        step = 4;
        render();
      } catch (err) {
        showError(box, err);
        btn.disabled = false;
      }
    };
    box.appendChild(btn);
  }

  function renderStravaStep(container) {
    const box = stepBox(container, 'Strava verbinden');
    const p = document.createElement('p');
    p.textContent = 'Verbinde dein Strava-Konto (nur Lesezugriff auf deine Aktivitäten, auch private).';
    box.appendChild(p);

    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Mit Strava verbinden';
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await startStravaConnect(); // navigiert weg, kein weiterer Code laeuft hier
      } catch (err) {
        showError(box, err);
        btn.disabled = false;
      }
    };
    box.appendChild(btn);
  }

  async function renderWeightStep(container) {
    const box = stepBox(container, 'Gewicht');
    if (!settings) settings = await loadOrInitSettings();

    const p = document.createElement('p');
    p.textContent = 'Für W/kg-Kennzahlen brauchen wir dein aktuelles Gewicht.';
    box.appendChild(p);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '30';
    input.max = '250';
    input.step = '0.1';
    input.placeholder = 'Gewicht in kg';
    if (settings.weightKg) input.value = settings.weightKg;
    box.appendChild(input);
    box.appendChild(document.createElement('br'));

    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.style.marginTop = '0.75rem';
    btn.textContent = 'Bestätigen';
    btn.onclick = async () => {
      const kg = Number(input.value);
      if (!kg || kg < 30 || kg > 250) {
        showError(box, new Error('Bitte ein plausibles Gewicht in kg eingeben.'));
        return;
      }
      btn.disabled = true;
      const today = new Date().toISOString().slice(0, 10);
      settings.weightKg = kg;
      settings.weightHistory = [...(settings.weightHistory || []).filter((w) => w.date !== today), { date: today, kg }];
      await writeJson(SETTINGS_FILE, settings);
      onComplete(settings);
    };
    box.appendChild(btn);
  }

  function showError(box, err) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = err.message;
    box.appendChild(p);
  }
}
