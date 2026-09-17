// FA-SET-01: Einstellungen-UI - erste Runde nur Erscheinungsbild (Hell/Dunkel), bewusst als
// eigenstaendiges Modal statt Tab angelegt, damit spaeter weitere Einstellungen (Schwellen,
// Benachrichtigungen, ...) einfach als weitere Abschnitte dazukommen koennen (FA-SET-02-04).

import { isLightTheme, setTheme } from './theme.js';

export function openSettings() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  document.addEventListener('keydown', onKeydown);

  const panel = document.createElement('div');
  panel.className = 'modal-panel modal-panel-narrow';
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
  heading.textContent = 'Einstellungen';
  panel.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'card';
  panel.appendChild(card);

  const cardHeading = document.createElement('h3');
  cardHeading.textContent = 'Erscheinungsbild';
  card.appendChild(cardHeading);

  const row = document.createElement('div');
  row.className = 'btn-row';
  card.appendChild(row);

  const darkBtn = document.createElement('button');
  const lightBtn = document.createElement('button');
  darkBtn.textContent = '🌙 Dunkel';
  lightBtn.textContent = '☀️ Hell';
  row.appendChild(darkBtn);
  row.appendChild(lightBtn);

  function refresh() {
    const light = isLightTheme();
    darkBtn.className = light ? '' : 'btn-primary';
    lightBtn.className = light ? 'btn-primary' : '';
  }
  darkBtn.onclick = () => {
    setTheme(false);
    refresh();
  };
  lightBtn.onclick = () => {
    setTheme(true);
    refresh();
  };
  refresh();

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.style.marginTop = '1.5rem';
  hint.textContent = 'Weitere Einstellungen (Schwellenwerte, Benachrichtigungen, ...) folgen hier in einer späteren Ausbaustufe.';
  panel.appendChild(hint);
}
