// FA-ACT-01: Aktivitaetsliste mit Datum, Sportart, Dauer, Distanz,
// Leistungsdaten ja/nein, TSS, Strain Score, Breakthrough-Status. Filter und
// Sortierung. Die Kennzahlen kommen direkt aus index.json (von compute.js
// nach jeder Neuberechnung dort hinterlegt) - keine erneute Berechnung beim
// Anzeigen. Klick auf eine Zeile oeffnet die Detailansicht (FA-ACT-02).

import { openActivityDetail } from './activityDetailView.js';

const MEDAL_LABEL = { bronze: '🥉', silver: '🥈', gold: '🥇' };

function formatDuration(sec) {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatDistance(m) {
  if (!m) return '-';
  return `${(m / 1000).toFixed(1)} km`;
}

export function renderActivityList(container, index) {
  container.innerHTML = '';

  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Aktivitäten</h2>';
  box.appendChild(header);

  if (index.activities.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Noch keine Aktivitäten importiert.';
    box.appendChild(p);
    return;
  }

  const sportTypes = [...new Set(index.activities.map((a) => a.type))].sort();
  const controls = document.createElement('div');
  controls.style.marginBottom = '0.75rem';
  const sportSelect = document.createElement('select');
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Alle Sportarten';
  sportSelect.appendChild(allOption);
  for (const t of sportTypes) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sportSelect.appendChild(opt);
  }
  controls.appendChild(sportSelect);
  box.appendChild(controls);

  const table = document.createElement('table');
  table.className = 'data-table';
  box.appendChild(table);

  const columns = [
    { key: 'date', label: 'Datum' },
    { key: 'type', label: 'Sportart' },
    { key: 'movingTimeSec', label: 'Dauer' },
    { key: 'distanceM', label: 'Distanz' },
    { key: 'hasWatts', label: 'Leistung' },
    { key: 'tss', label: 'TSS' },
    { key: 'strain', label: 'Strain' },
    { key: 'breakthrough', label: 'Breakthrough' },
  ];

  let sortKey = 'date';
  let sortDesc = true;

  function render() {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const col of columns) {
      const th = document.createElement('th');
      th.textContent = col.label + (sortKey === col.key ? (sortDesc ? ' ▼' : ' ▲') : '');
      th.onclick = () => {
        if (sortKey === col.key) sortDesc = !sortDesc;
        else {
          sortKey = col.key;
          sortDesc = true;
        }
        render();
      };
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);

    const filtered = sportSelect.value ? index.activities.filter((a) => a.type === sportSelect.value) : index.activities.slice();
    filtered.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDesc ? -cmp : cmp;
    });

    const tbody = document.createElement('tbody');
    for (const a of filtered) {
      const row = document.createElement('tr');
      row.className = 'activity-row';
      row.onclick = () => openActivityDetail(a.id);
      const cells = [
        a.date,
        a.type,
        formatDuration(a.movingTimeSec),
        formatDistance(a.distanceM),
        a.hasWatts ? 'ja' : 'nein',
        a.tss != null ? String(a.tss) : '-',
        a.strain != null && a.strain.total != null ? String(Math.round(a.strain.total)) : '-',
        a.breakthrough ? `${MEDAL_LABEL[a.breakthrough.medal] || ''}${a.breakthrough.discarded ? ' (verworfen)' : ''}` : '-',
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
  }

  sportSelect.onchange = render;
  render();
}
