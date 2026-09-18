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
      { term: 'PP-Plausibilisierung', def: 'Das Modell-Pmax wird gegen die bisher tatsächlich gemessene beste 5-Sekunden-Leistung verglichen und die Abweichung angezeigt (unter der Leistungssignatur). Das Modell wird dadurch NICHT automatisch korrigiert - eine größere Abweichung ist nur ein Hinweis, dass ein neuer Sprint-Bestwert die Signatur ggf. noch nicht widerspiegelt.' },
    ],
  },
  {
    group: 'Pro Aktivität',
    terms: [
      { term: 'MPA (Maximal Power Available)', def: 'Die sekündlich verfügbare Maximalleistung, abhängig vom aktuellen W\'bal-Füllstand. Sinkt bei Belastung über CP, steigt bei Erholung wieder Richtung Pmax.' },
      { term: 'W\'bal', def: 'Der sekündliche Füllstand der anaeroben Reserve W\' während einer Aktivität (Skiba-2015-Modell) - 0 bedeutet vollständig erschöpft.' },
      { term: 'NP (Normalized Power)', def: 'Eine um kurzfristige Leistungsspitzen gewichtete Durchschnittsleistung, bildet die physiologische Belastung besser ab als der reine Mittelwert.' },
      { term: 'IF (Intensity Factor)', def: 'NP geteilt durch die zum Aktivitätsdatum gültige Schwelle (CP) - Maß für die relative Intensität einer Einheit.' },
      { term: 'TSS (Training Stress Score)', def: 'Belastungspunktzahl einer Aktivität aus Dauer, NP und IF. Eine Stunde bei genau CP-Leistung ergibt 100 TSS. Bei Rad-Aktivitäten ohne Leistungsmesser bzw. bei Laufen/Schwimmen wird stattdessen hrTSS bzw. Pace-TSS aus der geschätzten Sportart-Schwelle berechnet (in der Aktivitätsliste mit "≈" markiert) - fehlt auch das, gibt es keinen TSS.' },
      { term: 'Strain Score', def: 'Belastung aufgeteilt in Low (unterhalb CP), High (zwischen CP und Pmax) und Peak (nahe Pmax) - zeigt, welcher Belastungsbereich dominierte.' },
    ],
  },
  {
    group: 'Sportart-Schwellen (für Laufen/Schwimmen/Rad ohne Leistungsmesser)',
    terms: [
      { term: 'Schwellenpace (Lauf/Schwimm)', def: 'Die schnellste Pace, die über ca. 20 Minuten gehalten werden kann - automatisch aus der besten Anstrengung der letzten 180 Tage geschätzt. Grundlage für Pace-TSS bei Läufen/Schwimmeinheiten ohne Leistungsmesser.' },
      { term: 'Rad-Schwellen-HF', def: 'Die durchschnittliche Herzfrequenz während Radabschnitten mit Leistung nahe der aktuellen CP - genauer als eine reine HF-Schätzung, weil sie an eine bereits leistungsbasiert bestätigte Schwelle gekoppelt ist. Für Radfahrten ohne Leistungsmesser (z. B. Indoor-Spinning).' },
      { term: 'Schwellen-HF (sonstige Sportarten)', def: 'Für Sportarten ohne Pace-Konzept (z. B. Wandern, Krafttraining) wird ebenfalls die beste ca. 20-Minuten-Herzfrequenz der letzten 180 Tage als Schwelle geschätzt, getrennt je Sportart.' },
      { term: '"Geschätzt"-Kennzeichnung', def: 'Alle Sportart-Schwellen sind Schätzungen aus eigenen Trainingsdaten (keine Laborwerte) und werden entsprechend datiert angezeigt - sie können sich mit neuen Bestleistungen ändern und "verjähren", wenn 180 Tage lang keine bessere Anstrengung mehr vorkam.' },
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
  {
    group: 'Belastungsgekoppelter Signaturverlauf (3D-Impulse-Response, Tab "Belastung")',
    terms: [
      { term: 'g (schnelle Anpassung)', def: 'Gleitender Mittelwert der täglichen Belastung (Strain Score) mit kurzer Zeitkonstante (Standard 7 Tage) - reagiert schnell auf zuletzt Trainiertes.' },
      { term: 'h (langsame Anpassung)', def: 'Wie g, aber mit langer Zeitkonstante (Standard 42 Tage) - bildet den längerfristigen Trend ab.' },
      { term: 'p = g − h', def: 'Die eigentliche Modellgröße: positiv, wenn die jüngste Belastung stärker war als der langfristige Trend (Fitness baut sich auf), negativ bei nachlassender Belastung.' },
      { term: 'k1 (Kalibrierung)', def: 'Rechnet p in eine physikalische Änderung von TP/HIE/PP um. Wird aus den eigenen bestätigten Breakthroughs per kleinste-Quadrate-Fit geschätzt - erst ab einer Mindestanzahl an Breakthroughs, sonst gilt ein unkalibrierter Fallback-Wert (deutlich gekennzeichnet).' },
      { term: 'Phase 1 vs. vollständige Kalibrierung', def: 'Diese erste Ausbaustufe schätzt nur k1. Die volle Kalibrierung (zusätzlich die Zeitkonstante τ1 je System, plus ein Hold-out-Test mit Abweichungsbericht) ist laut Lastenheft explizit eine spätere, separate Ausbaustufe (FA-SIG-12) - bis dahin ist der Signaturverlauf ein Trendindikator, keine präzise kalibrierte Vorhersage.' },
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
