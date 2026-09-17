// FA-TP-07: Wochen- und Kalenderuebersicht mit TSS, Dauer und Anzahl
// Einheiten je Sportart. Reine Aggregation der bereits in index.json
// abgelegten Kennzahlen (compute.js schreibt TSS/Strain dort hinein nach
// jeder Neuberechnung) - keine erneute Berechnung hier.

import { groupByWeek, groupByMonth, groupByDay, mondayOf, addDays, monthsAgo } from './calendarUtils.js';
import { openActivityDetail } from './activityDetailView.js';

const WEEKS_IN_DETAIL = 4;
const MONTHS_BACK = 12;

function formatDuration(sec) {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatWeekRange(weekStart, weekEnd) {
  const fmt = (dateStr) => new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function sportSummaryOf(countsByType) {
  return Object.entries(countsByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type} ${count}`)
    .join(' · ');
}

export function renderWeekOverview(container, index) {
  container.innerHTML = '';

  if (index.activities.length === 0) {
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = '<h2>Wochen- und Kalenderübersicht</h2><p>Noch keine Aktivitäten importiert.</p>';
    container.appendChild(box);
    return;
  }

  renderMonthCalendar(container, index.activities);

  // Detailliert (Woche-fuer-Woche) nur die letzten 4 Wochen, alles Aeltere (bis 12 Monate zurueck) als
  // Monatsuebersicht - eine Wochenzeile pro Woche fuer ein ganzes Jahr waere unuebersichtlich (TrainingPeaks-Vorbild).
  const todayIso = new Date().toISOString().slice(0, 10);
  const detailCutoff = addDays(mondayOf(todayIso), -7 * (WEEKS_IN_DETAIL - 1));
  const recentActivities = index.activities.filter((a) => a.date >= detailCutoff);
  const olderActivities = index.activities.filter((a) => a.date < detailCutoff && a.date >= monthsAgo(todayIso, MONTHS_BACK));

  renderWeekTable(container, recentActivities);
  renderMonthTable(container, olderActivities);
}

function renderWeekTable(container, activities) {
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `<h2>Wochenübersicht (letzte ${WEEKS_IN_DETAIL} Wochen)</h2>`;
  box.appendChild(header);

  const weeks = groupByWeek(activities);
  if (weeks.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Keine Aktivitäten in den letzten 4 Wochen.';
    box.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>Woche</th><th>TSS</th><th>Dauer</th><th>Einheiten je Sportart</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const w of weeks) {
    const tr = document.createElement('tr');
    const cells = [formatWeekRange(w.weekStart, w.weekEnd), String(Math.round(w.totalTss)), formatDuration(w.totalDurationSec), sportSummaryOf(w.countsByType)];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  box.appendChild(table);
}

function renderMonthTable(container, activities) {
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `<h2>Monatsübersicht (bis ${MONTHS_BACK} Monate zurück)</h2>`;
  box.appendChild(header);

  const months = groupByMonth(activities);
  if (months.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Keine älteren Aktivitäten in diesem Zeitraum.';
    box.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>Monat</th><th>TSS</th><th>Dauer</th><th>Einheiten je Sportart</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const m of months) {
    const tr = document.createElement('tr');
    const cells = [formatMonthLabel(m.month), String(Math.round(m.totalTss)), formatDuration(m.totalDurationSec), sportSummaryOf(m.countsByType)];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  box.appendChild(table);
}

function renderMonthCalendar(container, activities) {
  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Kalender</h2>';
  const nav = document.createElement('div');
  nav.className = 'btn-row calendar-nav';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn-ghost';
  prevBtn.textContent = '‹ Vormonat';
  const monthLabel = document.createElement('span');
  monthLabel.className = 'calendar-month-label';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn-ghost';
  nextBtn.textContent = 'Nächster Monat ›';
  nav.appendChild(prevBtn);
  nav.appendChild(monthLabel);
  nav.appendChild(nextBtn);
  header.appendChild(nav);
  box.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';
  box.appendChild(grid);

  const dayMap = groupByDay(activities);
  const latestDate = activities.reduce((max, a) => (a.date > max ? a.date : max), activities[0].date);
  const cursor = { year: Number(latestDate.slice(0, 4)), month: Number(latestDate.slice(5, 7)) }; // month: 1-12

  function renderMonth() {
    grid.innerHTML = '';
    monthLabel.textContent = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    for (const wd of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
      const wdCell = document.createElement('div');
      wdCell.className = 'calendar-weekday';
      wdCell.textContent = wd;
      grid.appendChild(wdCell);
    }

    const monthStr = String(cursor.month).padStart(2, '0');
    let day = mondayOf(`${cursor.year}-${monthStr}-01`);

    for (let i = 0; i < 42; i++) {
      const inMonth = day.slice(0, 4) === String(cursor.year) && day.slice(5, 7) === monthStr;
      const cell = document.createElement('div');
      cell.className = 'calendar-day' + (inMonth ? '' : ' outside');

      const dateLabel = document.createElement('div');
      dateLabel.className = 'calendar-day-num';
      dateLabel.textContent = String(Number(day.slice(8, 10)));
      cell.appendChild(dateLabel);

      const dayData = dayMap.get(day);
      if (dayData) {
        if (dayData.totalTss > 0) {
          const tssLabel = document.createElement('div');
          tssLabel.className = 'calendar-day-tss';
          tssLabel.textContent = `TSS ${Math.round(dayData.totalTss)}`;
          cell.appendChild(tssLabel);
        }
        for (const a of dayData.activities) {
          const entry = document.createElement('div');
          entry.className = 'calendar-day-activity';
          entry.textContent = a.type;
          entry.title = a.name || a.type;
          entry.onclick = () => openActivityDetail(a.id);
          cell.appendChild(entry);
        }
      }
      grid.appendChild(cell);
      day = addDays(day, 1);
    }
  }

  prevBtn.onclick = () => {
    cursor.month -= 1;
    if (cursor.month < 1) {
      cursor.month = 12;
      cursor.year -= 1;
    }
    renderMonth();
  };
  nextBtn.onclick = () => {
    cursor.month += 1;
    if (cursor.month > 12) {
      cursor.month = 1;
      cursor.year += 1;
    }
    renderMonth();
  };

  renderMonth();
}
