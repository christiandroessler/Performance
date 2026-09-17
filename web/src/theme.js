// Heller/dunkler Modus ist eine reine Anzeigepraeferenz je Geraet, daher localStorage statt
// Drive/Settings. Zentral hier, damit main.js (Anwenden beim Start) und settingsView.js
// (Umschalten im Menue) dieselbe Logik teilen.

export function applyStoredTheme() {
  try {
    if (localStorage.getItem('theme') === 'light') document.documentElement.dataset.theme = 'light';
  } catch {
    // localStorage kann in seltenen Faellen (privater Modus etc.) fehlschlagen - dann bleibt es beim Dunkelmodus.
  }
}

export function isLightTheme() {
  return document.documentElement.dataset.theme === 'light';
}

export function setTheme(light) {
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem('theme', light ? 'light' : 'dark');
  } catch {
    // s. o.
  }
}
