// Glossar aller Berechnungsgrundlagen der App, fuer alle Nutzer zum Nachlesen (kein Admin-
// Feature). Begriffe/Definitionen folgen dem Lastenheft (docs/LASTENHEFT.md Kap. 7) und
// core/README.md - hier bewusst in einfacher Sprache statt Formeln.

const GLOSSARY = [
  {
    group: 'Leistungssignatur (XERT-Vorbild)',
    terms: [
      { term: 'Critical Power (CP / TP)', def: 'Die Leistung, die theoretisch sehr lange gehalten werden kann, ohne dass die anaerobe Reserve (W\') aufgebraucht wird - die "Dauerleistungsgrenze".' },
      { term: 'W\' (HIE)', def: 'Anaerobe Arbeitskapazität in Joule (intern) bzw. Kilojoule (Anzeige) - die "Energiereserve" oberhalb von CP. Wird bei Belastung über CP aufgebraucht und unterhalb von CP wieder aufgefüllt.' },
      { term: 'Pmax (PP)', def: 'Die theoretische Maximalleistung bei einer Belastungsdauer nahe null (Sprintvermögen), Teil des 3-Parameter-Leistungsmodells.' },
      { term: 'Startsignatur', def: 'CP/W\'/Pmax werden einmalig per Regression über die stärksten Anstrengungen der ersten 90 Tage der Trainingshistorie ermittelt. Erst danach gibt es überhaupt eine Schwelle für TSS/PMC.' },
      { term: 'Breakthrough', def: 'Eine Aktivität, bei der die Leistung deutlich über der aktuell gültigen MPA lag - Hinweis auf eine gestiegene Leistungsfähigkeit. Löst eine Neuberechnung (Refit) von CP/W\'/Pmax aus.' },
      { term: 'Medaillen (Bronze/Silber/Gold)', def: 'Bronze = 1 der 3 Parameter (CP/W\'/Pmax) gestiegen, Silber = 2, Gold = alle 3 - jeweils über der Medaillenschwelle.' },
    ],
  },
  {
    group: 'Pro Aktivität',
    terms: [
      { term: 'MPA (Maximal Power Available)', def: 'Die sekündlich verfügbare Maximalleistung, abhängig vom aktuellen W\'bal-Füllstand. Sinkt bei Belastung über CP, steigt bei Erholung wieder Richtung Pmax.' },
      { term: 'W\'bal', def: 'Der sekündliche Füllstand der anaeroben Reserve W\' während einer Aktivität (Skiba-2015-Modell) - 0 bedeutet vollständig erschöpft.' },
      { term: 'NP (Normalized Power)', def: 'Eine um kurzfristige Leistungsspitzen gewichtete Durchschnittsleistung, bildet die physiologische Belastung besser ab als der reine Mittelwert.' },
      { term: 'IF (Intensity Factor)', def: 'NP geteilt durch die zum Aktivitätsdatum gültige Schwelle (CP) - Maß für die relative Intensität einer Einheit.' },
      { term: 'TSS (Training Stress Score)', def: 'Belastungspunktzahl einer Aktivität aus Dauer, NP und IF. Eine Stunde bei genau CP-Leistung ergibt 100 TSS.' },
      { term: 'Strain Score', def: 'Belastung aufgeteilt in Low (unterhalb CP), High (zwischen CP und Pmax) und Peak (nahe Pmax) - zeigt, welcher Belastungsbereich dominierte.' },
    ],
  },
  {
    group: 'Verlauf über die Zeit (Performance Management Chart)',
    terms: [
      { term: 'CTL (Fitness)', def: 'Chronic Training Load - gleitender ~42-Tage-Mittelwert des täglichen TSS. Bildet die längerfristig aufgebaute Fitness ab.' },
      { term: 'ATL (Fatigue)', def: 'Acute Training Load - gleitender ~7-Tage-Mittelwert des täglichen TSS. Bildet die kurzfristige, akute Ermüdung ab.' },
      { term: 'TSB (Form)', def: 'Training Stress Balance = CTL minus ATL. Positiv deutet auf Frische/Formaufbau hin, stark negativ auf Ermüdung.' },
      { term: 'Fitness Ramp Rate', def: 'Veränderung der CTL über ein bestimmtes Zeitfenster (7/28/90/365 Tage) - zeigt, wie schnell die Fitness aktuell steigt oder sinkt.' },
    ],
  },
];

export function openGlossary() {
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
  heading.textContent = 'Begriffe';
  panel.appendChild(heading);
  const sub = document.createElement('p');
  sub.className = 'hint';
  sub.textContent = 'Kurzerklärung aller Kennzahlen, die in der App verwendet werden.';
  panel.appendChild(sub);

  for (const group of GLOSSARY) {
    const card = document.createElement('div');
    card.className = 'card';
    panel.appendChild(card);

    const groupHeading = document.createElement('h3');
    groupHeading.textContent = group.group;
    card.appendChild(groupHeading);

    const dl = document.createElement('dl');
    dl.className = 'glossary-list';
    for (const { term, def } of group.terms) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = def;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    card.appendChild(dl);
  }
}
