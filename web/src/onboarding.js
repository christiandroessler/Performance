// Onboarding in fester Reihenfolge (FA-AUTH-02):
// (1) Datenschutzhinweis lesen, (2) ausdrueckliche Einwilligung zur
// Drive-Ablage, (3) Drive-Zugriff (drive.appdata) erteilen, (4) Strava
// verbinden, (5) Gewicht bestaetigen/eingeben.
//
// FA-AUTH-03: Schritt 4 (Strava) ist erst erreichbar, nachdem Schritt 2
// (Einwilligung) UND Schritt 3 (Drive-Zugriff) abgeschlossen sind - das wird
// hier durch die Reihenfolge der Schritte selbst erzwungen, nicht nur durch
// UI-Kosmetik.

import { requestDriveAccess, getSignedInEmail } from './auth.js';
import { readJson, writeJson } from './drive.js';
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
    const heading = document.createElement('h1');
    heading.textContent = 'Einrichtung';
    container.appendChild(heading);

    if (step === 1) renderPrivacyStep();
    else if (step === 2) renderConsentStep();
    else if (step === 3) renderDriveStep();
    else if (step === 4) renderStravaStep();
    else if (step === 5) await renderWeightStep();
  }

  function stepBox(title) {
    const box = document.createElement('div');
    box.className = 'step';
    const h = document.createElement('h2');
    h.textContent = title;
    box.appendChild(h);
    container.appendChild(box);
    return box;
  }

  function renderPrivacyStep() {
    const box = stepBox('1. Datenschutzhinweis');
    const p = document.createElement('p');
    p.textContent =
      'Deine Trainingsdaten liegen ausschliesslich in deinem eigenen Google-Drive-App-Ordner und im lokalen Browser-Cache. ' +
      'Der Server (Worker) speichert keine Trainingsdaten, nur deinen Verbindungsstatus und ein verschluesseltes Strava-Token. ' +
      'Der Admin hat keinen Zugriff auf deine Trainingsdaten. Du kannst deine Daten jederzeit vollstaendig loeschen.';
    // Hinweis: vollstaendiger, rechtlich abgestimmter Text folgt in M6 (NFA-02).
    box.appendChild(p);
    const btn = document.createElement('button');
    btn.textContent = 'Gelesen, weiter';
    btn.onclick = () => {
      step = 2;
      render();
    };
    box.appendChild(btn);
  }

  function renderConsentStep() {
    const box = stepBox('2. Einwilligung');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    label.appendChild(checkbox);
    label.append(' Ich willige ausdruecklich ein, dass meine eigenen Strava-Daten in meinem eigenen Google-Drive-App-Ordner gespeichert werden.');
    box.appendChild(label);

    const btn = document.createElement('button');
    btn.textContent = 'Zustimmen und fortfahren';
    btn.disabled = true;
    checkbox.onchange = () => {
      btn.disabled = !checkbox.checked;
    };
    btn.onclick = async () => {
      settings = await loadOrInitSettings();
      settings.consent = { given: true, at: new Date().toISOString() };
      step = 3;
      render();
    };
    box.appendChild(document.createElement('br'));
    box.appendChild(btn);
  }

  function renderDriveStep() {
    const box = stepBox('3. Google-Drive-Zugriff');
    const p = document.createElement('p');
    p.textContent = 'Erlaube Zugriff auf einen versteckten App-Ordner in deinem Google Drive (nur fuer diese App sichtbar, keine anderen Dateien).';
    box.appendChild(p);

    const btn = document.createElement('button');
    btn.textContent = 'Drive-Zugriff erlauben';
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await requestDriveAccess();
        // FA-AUTH-03: die in Schritt 2 gegebene Einwilligung wird JETZT persistiert,
        // sobald ueberhaupt Drive-Zugriff besteht - vorher konnte nichts geschrieben werden.
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

  function renderStravaStep() {
    const box = stepBox('4. Strava verbinden');
    const p = document.createElement('p');
    p.textContent = 'Verbinde dein Strava-Konto (nur Lesezugriff auf deine Aktivitaeten, auch private).';
    box.appendChild(p);

    const btn = document.createElement('button');
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

  async function renderWeightStep() {
    const box = stepBox('5. Gewicht');
    if (!settings) settings = await loadOrInitSettings();

    const p = document.createElement('p');
    p.textContent = 'Fuer W/kg-Kennzahlen brauchen wir dein aktuelles Gewicht.';
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
    btn.textContent = 'Bestaetigen';
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
