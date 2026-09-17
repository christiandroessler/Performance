// Datenqualitaet: Ausreisserfilter (FA-DQ-03) und die kombinierte "gueltig
// fuer Leistungsmodelle"-Maske (FA-DQ-01 + FA-DQ-03).
//
// Ausreisserregel (M1-Festlegung, siehe core/README.md Abschnitt "Ausreisserregel"):
// Eine Sekunde gilt als Ausreisser, wenn
//   (a) die Leistung eine absolute Plausibilitaetsgrenze ueberschreitet (Sensorfehler), oder
//   (b) sie gegenueber dem Mittel der validen Nachbarsekunden um mehr als einen Schwellwert
//       nach oben springt UND dieser Sprung isoliert ist (die naechste Sekunde bestaetigt
//       den Sprung nicht) - so werden Sensor-Spikes erkannt, echte kurze Sprints (die sich
//       ueber >= 2 Sekunden halten) aber nicht faelschlich verworfen.

/**
 * @param {import('./types.js').Stream1Hz} stream
 * @param {import('./types.js').ModelSettings} settings
 * @returns {import('./types.js').Stream1Hz} derselbe Stream, `outlier` ist befuellt
 */
export function detectOutliers(stream, settings) {
  const { outlierMaxWatts, outlierMaxJumpWatts } = settings;
  const n = stream.n;

  const validAt = (i) => i >= 0 && i < n && stream.hasWatts[i] && !stream.gap[i] ? stream.watts[i] : null;

  for (let i = 0; i < n; i++) {
    if (!stream.hasWatts[i] || stream.gap[i]) continue;
    const w = stream.watts[i];

    if (w < 0 || w > outlierMaxWatts) {
      stream.outlier[i] = 1;
      continue;
    }

    const prev = validAt(i - 1);
    const next = validAt(i + 1);
    if (prev == null && next == null) continue;

    const neighborAvg = prev != null && next != null ? (prev + next) / 2 : prev ?? next;
    const jump = w - neighborAvg;
    if (jump <= outlierMaxJumpWatts) continue;

    // isoliert = naechste Sekunde bestaetigt den Sprung nicht (faellt wieder auf Nachbarniveau)
    const nextConfirms = next != null && next - neighborAvg > outlierMaxJumpWatts * 0.5;
    if (!nextConfirms) stream.outlier[i] = 1;
  }

  return stream;
}

/**
 * Maske "fliesst in Leistungsmodelle ein": gemessen (nicht geschaetzt), keine
 * Luecke, kein Ausreisser. Siehe FA-DQ-01, FA-DQ-03.
 * @param {import('./types.js').Stream1Hz} stream
 * @returns {Uint8Array}
 */
export function validPowerMask(stream) {
  const n = stream.n;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    mask[i] =
      stream.hasWatts[i] && stream.deviceWatts[i] && !stream.gap[i] && !stream.outlier[i] ? 1 : 0;
  }
  return mask;
}

/**
 * Leistungsarray fuer die W'bal-/MPA-Integration: an gueltigen Sekunden der
 * Messwert, an Luecken 0 W (FA-DQ-04: Erholung laeuft in Pausen bei Leistung 0
 * weiter), an Ausreissern ebenfalls 0 W (werden nicht als Belastung gewertet).
 * @param {import('./types.js').Stream1Hz} stream
 * @returns {Float64Array}
 */
export function wattsForRecovery(stream) {
  const n = stream.n;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (stream.hasWatts[i] && stream.deviceWatts[i] && !stream.outlier[i]) {
      out[i] = stream.watts[i];
    }
  }
  return out;
}
