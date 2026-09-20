// Persoenliche Stammdaten (Profilfoto, Geburtsdatum, Groesse, Gewichtsverlauf) - navigierbar
// ueber das Nutzermenue ("Profil"), getrennt von "Einstellungen" (Modellparameter/Kalibrierung,
// Kap. 12). Recherche-Ergebnis (TrainingPeaks/branchenueblich): Athleten-Profile enthalten
// typischerweise Name, Foto, Geburtsdatum/Alter, Groesse, Gewicht - FTP/Schwellenwerte gehoeren
// bei TP zum Profil, bleiben hier aber bewusst in "Einstellungen" (ein anderes Konzept:
// Modell-Kalibrierung statt persoenlicher Stammdaten).

import { loadOrInitSettings, SETTINGS_FILE } from './onboarding.js';
import { writeJson, writeFile, readFile } from './storage.js';
import { getSignedInEmail } from './auth.js';

export const PROFILE_PHOTO_FILE = 'profile-photo.jpg';
const PHOTO_SIZE = 256;

/** Verkleinert/beschneidet ein hochgeladenes Bild clientseitig auf ein quadratisches JPEG (kein Backend-Aufwand). */
function resizeImageToJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const cropSize = Math.min(img.width, img.height);
      const sx = (img.width - cropSize) / 2;
      const sy = (img.height - cropSize) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden.'));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden.'));
    };
    img.src = url;
  });
}

export async function openProfile() {
  let settings = await loadOrInitSettings();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  document.addEventListener('keydown', onKeydown);

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-ghost modal-close-btn';
  closeBtn.textContent = 'Schließen ✕';
  closeBtn.onclick = close;
  panel.appendChild(closeBtn);

  const heading = document.createElement('h2');
  heading.textContent = 'Profil';
  panel.appendChild(heading);

  renderPhotoCard();
  renderPersonalDataCard();
  renderWeightCard();

  // ---------- Profilfoto ----------
  function renderPhotoCard() {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Profilfoto';
    card.appendChild(h);

    const row = document.createElement('div');
    row.className = 'btn-row';
    card.appendChild(row);

    // Div mit background-image statt <img> - ein <img> ohne src zeigt in den meisten Browsern
    // ein "kaputtes Bild"-Icon + Alt-Text, auch ganz ohne src-Attribut; das soll der leere
    // Ausgangszustand (noch kein Foto hochgeladen) nicht zeigen.
    const photo = document.createElement('div');
    photo.setAttribute('role', 'img');
    photo.setAttribute('aria-label', 'Profilfoto');
    photo.style.cssText = 'width:72px;height:72px;border-radius:50%;background:var(--bg-elevated-2) center/cover no-repeat;flex-shrink:0;';
    row.appendChild(photo);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    card.appendChild(fileInput);

    const uploadBtn = document.createElement('button');
    uploadBtn.textContent = 'Foto auswählen...';
    uploadBtn.onclick = () => fileInput.click();
    row.appendChild(uploadBtn);

    const statusP = document.createElement('p');
    statusP.className = 'hint';
    card.appendChild(statusP);

    readFile(PROFILE_PHOTO_FILE)
      .then((buf) => {
        if (buf) photo.style.backgroundImage = `url(${URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }))})`;
      })
      .catch(() => {});

    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      statusP.className = 'hint';
      statusP.textContent = 'Wird gespeichert...';
      try {
        const blob = await resizeImageToJpeg(file, PHOTO_SIZE);
        await writeFile(PROFILE_PHOTO_FILE, 'image/jpeg', blob);
        photo.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
        statusP.textContent = 'Gespeichert.';
      } catch (err) {
        statusP.className = 'error';
        statusP.textContent = err.message;
      }
    };
  }

  // ---------- Persoenliche Daten ----------
  function renderPersonalDataCard() {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Persönliche Daten';
    card.appendChild(h);

    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'E-Mail';
    const emailValue = document.createElement('span');
    emailValue.style.color = 'var(--text)';
    emailValue.textContent = getSignedInEmail() || '-';
    emailLabel.appendChild(emailValue);
    card.appendChild(emailLabel);

    const profile = settings.profile || {};

    const birthLabel = document.createElement('label');
    birthLabel.textContent = 'Geburtsdatum';
    const birthInput = document.createElement('input');
    birthInput.type = 'date';
    birthInput.value = profile.birthDate || '';
    birthLabel.appendChild(birthInput);
    card.appendChild(birthLabel);

    const heightLabel = document.createElement('label');
    heightLabel.textContent = 'Größe (cm)';
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.min = '100';
    heightInput.max = '250';
    heightInput.value = profile.heightCm ?? '';
    heightLabel.appendChild(heightInput);
    card.appendChild(heightLabel);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Speichern';
    card.appendChild(saveBtn);

    const statusP = document.createElement('p');
    statusP.className = 'hint';
    card.appendChild(statusP);

    saveBtn.onclick = async () => {
      const heightCm = heightInput.value ? Number(heightInput.value) : null;
      settings.profile = { birthDate: birthInput.value || null, heightCm };
      await writeJson(SETTINGS_FILE, settings);
      statusP.textContent = 'Gespeichert.';
    };
  }

  // ---------- FA-SET-01: Gewichtsverlauf (von "Einstellungen" hierher verschoben -
  // Gewicht ist eine persoenliche Kenngroesse, keine Modell-Kalibrierung) ----------
  function renderWeightCard() {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const h = document.createElement('h3');
    h.textContent = 'Gewichtsverlauf';
    card.appendChild(h);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Wird für W/kg-Kennzahlen verwendet (jeweils das zum Aktivitätsdatum gültige Gewicht) - siehe Leistungskurve.';
    card.appendChild(hint);

    const list = document.createElement('div');
    list.className = 'threshold-list';
    card.appendChild(list);

    const addRow = document.createElement('div');
    addRow.className = 'btn-row';
    addRow.style.marginTop = '0.75rem';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = new Date().toISOString().slice(0, 10);
    const kgInput = document.createElement('input');
    kgInput.type = 'number';
    kgInput.min = '30';
    kgInput.max = '250';
    kgInput.step = '0.1';
    kgInput.placeholder = 'kg';
    kgInput.style.width = '90px';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-primary';
    addBtn.textContent = 'Hinzufügen';
    addRow.appendChild(dateInput);
    addRow.appendChild(kgInput);
    addRow.appendChild(addBtn);
    card.appendChild(addRow);

    addBtn.onclick = async () => {
      const kg = Number(kgInput.value);
      const date = dateInput.value;
      if (!date || !kg || kg < 30 || kg > 250) return;
      settings.weightHistory = [...(settings.weightHistory || []).filter((w) => w.date !== date), { date, kg }];
      await persistWeight();
      kgInput.value = '';
      renderList();
    };

    async function persistWeight() {
      const sorted = [...(settings.weightHistory || [])].sort((a, b) => a.date.localeCompare(b.date));
      settings.weightKg = sorted.length ? sorted[sorted.length - 1].kg : null;
      await writeJson(SETTINGS_FILE, settings);
    }

    function renderList() {
      list.innerHTML = '';
      const sorted = [...(settings.weightHistory || [])].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted.length === 0) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'Noch kein Gewicht hinterlegt.';
        list.appendChild(p);
        return;
      }
      for (const entry of sorted) {
        const row = document.createElement('div');
        row.className = 'threshold-row';
        row.innerHTML = `<span>${entry.date}</span><span class="threshold-value">${entry.kg} kg</span>`;
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-ghost';
        delBtn.textContent = 'Entfernen';
        delBtn.onclick = async () => {
          settings.weightHistory = (settings.weightHistory || []).filter((w) => w.date !== entry.date);
          await persistWeight();
          renderList();
        };
        row.appendChild(delBtn);
        list.appendChild(row);
      }
    }
    renderList();
  }
}
