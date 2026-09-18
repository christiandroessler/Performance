// FA-MET-01 bis 04: Stoffwechselprofil (VO2max/VLamax) + metabolische Zonen
// mit kcal/KH/Fett je Stunde. Nur die Steady-State-Variante (V1, Kap. 7.9) -
// siehe core/README.md "Stoffwechselmodell" fuer die volle Methodik und alle
// M5-Festlegungen. Reine Anzeige/Modellschaetzung (FA-MET-06/NFA-11), keine
// experimentelle Validierung.

import { mergeSettings, signatureAtDate, deriveMetabolicProfile, metabolicZones, substrateSplitForZoneLookup } from '../vendor/core/src/index.js';
import { loadModelState } from './compute.js';
import { loadOrInitSettings } from './onboarding.js';

/** Gewicht zum Datum (FA-MET-01), analog powerCurveView.js#weightAtDate/activityDetailView.js. */
function weightAtDate(settingsJson, date) {
  const history = (settingsJson && settingsJson.weightHistory) || [];
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let w = settingsJson ? settingsJson.weightKg : null;
  for (const entry of sorted) {
    if (entry.date <= date) w = entry.kg;
  }
  return w;
}

/**
 * Leitet das aktuelle Stoffwechselprofil aus der zuletzt gueltigen Signatur + dem
 * aktuellen Gewicht ab (V1-Scope-Entscheidung, siehe core/README.md "Stoffwechselmodell":
 * live aus der jeweils aktuellen Signatur berechnet, keine persistierte historische
 * Zeitreihe - analog dazu, wie die Leistungssignatur-Kacheln nur den letzten Stand zeigen).
 */
export async function computeCurrentMetabolicProfile() {
  const [modelState, settingsJson] = await Promise.all([loadModelState(), loadOrInitSettings()]);
  if (modelState.needsMoreData || !modelState.history || modelState.history.length === 0) return null;

  const latest = modelState.history[modelState.history.length - 1];
  const massKg = weightAtDate(settingsJson, latest.date);
  if (!massKg) return null;

  const settings = mergeSettings(settingsJson.modelSettings || {});
  const profile = deriveMetabolicProfile(
    { cp: latest.cp, wPrimeJ: latest.wPrimeJ, pMax: latest.pMax, bodyMassKg: massKg, activeMusclePct: settings.activeMusclePctDefault, labValues: settingsJson.labValues || [] },
    settings
  );
  return { profile, latest, massKg, settings };
}

/** Kompakte Kachel-Karte fuer die Uebersicht, 1:1 nach dem Vorbild von dashboardView.js#renderSignatureTiles. */
export function renderMetabolicTiles(container, computed) {
  container.innerHTML = '';
  if (!computed || !computed.profile.converged) return;
  const { profile, settings } = computed;

  const box = document.createElement('div');
  box.className = 'card';
  container.appendChild(box);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = '<h2>Stoffwechselprofil <span class="badge badge-muted">Modellschätzung</span></h2>';
  box.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML = `
    <div class="stat-tile accent">
      <span class="stat-tile-label">VO2max</span>
      <span class="stat-tile-value">${profile.vo2max.toFixed(1)}<span class="unit">ml/min/kg</span></span>
    </div>
    <div class="stat-tile accent">
      <span class="stat-tile-label">VLamax</span>
      <span class="stat-tile-value">${profile.vlamax.toFixed(2)}<span class="unit">mmol/l/s</span></span>
    </div>
  `;
  box.appendChild(grid);

  const caption = document.createElement('p');
  caption.className = 'stat-tile-caption';
  caption.textContent = `Abgeleitet aus TP=${Math.round(profile.mlssPower)} W (Modell-MLSS) und der Kurzzeitleistung bei ${settings.metShortDurationSeconds} s - keine experimentelle Validierung (Kap. 7.9).`;
  box.appendChild(caption);
}

/** Voller Tab "Stoffwechsel": Profil-Kacheln + Zonen-Tabelle (FA-MET-03/04). */
export async function renderMetabolicView(container) {
  container.innerHTML = '';

  const intro = document.createElement('p');
  intro.className = 'hint';
  intro.textContent =
    'Stoffwechselmodell nach Mader (Kap. 7.9) - VO2max/VLamax werden aus der Leistungssignatur und dem Gewicht abgeleitet, nicht gemessen. Reine Modellschätzung, keine experimentelle Validierung (FA-MET-06).';
  container.appendChild(intro);

  const computed = await computeCurrentMetabolicProfile();
  if (!computed) {
    const p = document.createElement('p');
    p.className = 'card';
    p.textContent = 'Noch keine Signatur oder kein Gewicht hinterlegt - siehe Einstellungen.';
    container.appendChild(p);
    return;
  }

  const tilesContainer = document.createElement('div');
  container.appendChild(tilesContainer);
  renderMetabolicTiles(tilesContainer, computed);

  if (!computed.profile.converged) {
    const p = document.createElement('p');
    p.className = 'card error';
    p.textContent = `Ableitung nicht möglich: ${computed.profile.reason || 'unbekannter Grund'}.`;
    container.appendChild(p);
    return;
  }

  const { profile, massKg, settings } = computed;
  const muscleMassKg = massKg * settings.activeMusclePctDefault;
  const zoneParams = { bodyMassKg: massKg, muscleMassKg, vo2max: profile.vo2max, vlamax: profile.vlamax };

  const zonesCard = document.createElement('div');
  zonesCard.className = 'card';
  const zonesHeader = document.createElement('div');
  zonesHeader.className = 'card-header';
  zonesHeader.innerHTML = '<h2>Metabolische Zonen</h2>';
  zonesCard.appendChild(zonesHeader);

  const list = document.createElement('div');
  list.className = 'threshold-list';
  for (const zone of metabolicZones(profile.mlssPower, settings)) {
    const midPower = zone.upperWatts == null ? zone.lowerWatts + 10 : (zone.lowerWatts + zone.upperWatts) / 2;
    const split = substrateSplitForZoneLookup(midPower, zoneParams, settings);
    const range = zone.upperWatts == null ? `> ${Math.round(zone.lowerWatts)} W` : `${Math.round(zone.lowerWatts)}-${Math.round(zone.upperWatts)} W`;
    const notSustainableNote = zone.key === 'z5' ? ' <span class="hint">(hochgerechnet, nicht über eine Stunde haltbar)</span>' : '';
    const row = document.createElement('div');
    row.className = 'threshold-row';
    row.innerHTML = `<span>${zone.label}</span><span class="threshold-value">${range}</span><span class="hint">${Math.round(split.kcalPerMin * 60)} kcal/h · ${Math.round(split.choGPerMin * 60)} g KH/h · ${Math.round(split.fatGPerMin * 60)} g Fett/h${notSustainableNote}</span>`;
    list.appendChild(row);
  }
  zonesCard.appendChild(list);
  container.appendChild(zonesCard);
}
