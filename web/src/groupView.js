// FA-USER-01 bis 07 (Kap. 6.2): Admin-Ansicht fuer die Gruppenverwaltung. Nur fuer Admins
// erreichbar (main.js baut den "Gruppe"-Tab nur bei session.role==='admin' ein - der Worker
// prueft das serverseitig ohnehin nochmal per requireAdmin, siehe worker/src/index.js).
// Zeigt bewusst NUR Verbindungsstatus/Sync-Zeitpunkt/Importfortschritt (letzterer nur als
// Warteschlangen-Laenge) - NIE Trainingsdaten oder Kennzahlen anderer Mitglieder (FA-USER-04).
// Backend-Endpunkte (listMembers/inviteMember/removeMember) existierten bereits fertig in
// api.js, waren aber bis 2026-09-19 nirgends in der UI verdrahtet.

import { listMembers, inviteMember, removeMember } from './api.js';

const STATUS_LABELS = {
  invited: 'Eingeladen',
  google_connected: 'Google verbunden',
  strava_connected: 'Strava verbunden',
};

const MAX_GROUP_SIZE = 10; // FA-USER-03 - muss mit worker/src/index.js#MAX_GROUP_SIZE uebereinstimmen

export async function renderGroup(container) {
  container.innerHTML = '';

  const intro = document.createElement('p');
  intro.className = 'hint';
  intro.textContent =
    'Gruppenverwaltung (Kap. 6.2). Du siehst hier ausschließlich Verbindungsstatus und Sync-Zeitpunkt - niemals Trainingsdaten oder Kennzahlen anderer Mitglieder.';
  container.appendChild(intro);

  let members;
  try {
    members = await listMembers();
  } catch (err) {
    const p = document.createElement('p');
    p.className = 'card error';
    p.textContent = `Mitgliederliste konnte nicht geladen werden: ${err.message}`;
    container.appendChild(p);
    return;
  }

  renderMemberListCard(container, members);
  renderInviteCard(container, members);
}

function renderMemberListCard(container, members) {
  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `<h2>Mitglieder</h2><span class="hint">${members.length} / ${MAX_GROUP_SIZE} Plätze belegt</span>`;
  card.appendChild(header);

  const list = document.createElement('div');
  list.className = 'threshold-list';
  card.appendChild(list);

  for (const m of members) {
    list.appendChild(renderMemberRow(container, m));
  }
}

/** Ein <span> mit Text (textContent - die Werte stammen vom Server und gelten als nicht vertrauenswuerdig, P-12). */
function textSpan(className, text) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  return span;
}

export function renderMemberRow(container, m) {
  const row = document.createElement('div');
  row.className = 'threshold-row';

  const statusLabel = STATUS_LABELS[m.status] || m.status;
  const lastSync = m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString('de-DE') : 'noch nie';

  const emailCell = textSpan('', m.email);
  if (m.role === 'admin') {
    emailCell.appendChild(document.createTextNode(' '));
    emailCell.appendChild(textSpan('badge badge-muted', 'Admin'));
  }

  const syncCell = textSpan('hint', `Letzter Sync: ${lastSync}`);
  if (m.importing) {
    syncCell.appendChild(document.createTextNode(' · '));
    syncCell.appendChild(textSpan('badge badge-muted', `Import läuft${m.queueRemaining != null ? ` (${m.queueRemaining} verbleibend)` : ''}`));
  }

  row.append(emailCell, textSpan('threshold-value', statusLabel), syncCell);

  if (m.role !== 'admin') {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-danger';
    removeBtn.textContent = 'Entfernen';
    removeBtn.style.marginLeft = '0.5rem';

    // Zwei-Schritt-Bestaetigung statt Ein-Klick-Entfernen (widerruft den Strava-Zugriff
    // des Mitglieds unwiderruflich, FA-USER-05).
    let confirming = false;
    removeBtn.onclick = async () => {
      if (!confirming) {
        confirming = true;
        removeBtn.textContent = 'Wirklich entfernen?';
        removeBtn.classList.add('btn-danger-confirm');
        return;
      }
      removeBtn.disabled = true;
      try {
        await removeMember(m.email);
        await renderGroup(container);
      } catch (err) {
        removeBtn.disabled = false;
        removeBtn.textContent = `Fehler: ${err.message}`;
      }
    };
    row.appendChild(removeBtn);
  }

  return row;
}

function renderInviteCard(container, members) {
  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Einladen</h2>';
  card.appendChild(header);

  if (members.length >= MAX_GROUP_SIZE) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Gruppe ist voll (10/10) - erst ein Mitglied entfernen, um jemand Neues einzuladen.';
    card.appendChild(p);
    return;
  }

  const row = document.createElement('div');
  row.className = 'btn-row';
  card.appendChild(row);

  const input = document.createElement('input');
  input.type = 'email';
  input.placeholder = 'E-Mail-Adresse (Google-Konto)';
  row.appendChild(input);

  const inviteBtn = document.createElement('button');
  inviteBtn.className = 'btn-primary';
  inviteBtn.textContent = 'Einladen';
  row.appendChild(inviteBtn);

  const statusP = document.createElement('p');
  card.appendChild(statusP);

  inviteBtn.onclick = async () => {
    const email = input.value.trim();
    // Die eigentliche (strenge) Pruefung macht der Worker (worker/src/emailValidation.js); hier nur
    // die Browser-Pruefung des type=email-Felds fuer schnelles Feedback.
    if (!email || !input.checkValidity()) {
      statusP.className = 'error';
      statusP.textContent = 'Bitte eine gültige E-Mail-Adresse eingeben.';
      return;
    }
    inviteBtn.disabled = true;
    statusP.className = 'hint';
    statusP.textContent = 'Lade ein...';
    try {
      await inviteMember(email);
      await renderGroup(container);
    } catch (err) {
      statusP.className = 'error';
      statusP.textContent = err.message;
      inviteBtn.disabled = false;
    }
  };
}
