// Parser fuer die `activities.csv`-Indexdatei des Strava-Datenexports
// (FA-SYNC-06). Liefert pro Zeile Aktivitaets-ID, Datum, Typ und den relativen
// Dateipfad der Originaldatei (GPX/TCX/FIT, ggf. .gz).

export function parseActivitiesCsv(csvText) {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return [];
  const header = rows[0];
  const col = (name) => header.indexOf(name);

  const iId = col('Activity ID');
  const iDate = col('Activity Date');
  const iType = col('Activity Type');
  const iFilename = col('Filename');
  const iName = col('Activity Name');

  return rows
    .slice(1)
    .filter((r) => r.length > 1 && r.some((c) => c !== ''))
    .map((r) => ({
      id: iId >= 0 ? r[iId] : null,
      date: iDate >= 0 ? r[iDate] : null,
      type: iType >= 0 ? r[iType] : null,
      filename: iFilename >= 0 && r[iFilename] ? r[iFilename] : null,
      name: iName >= 0 ? r[iName] : null,
    }));
}

/** RFC-4180-naher CSV-Parser (Anfuehrungszeichen, escapte Anfuehrungszeichen, CRLF/LF). */
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
