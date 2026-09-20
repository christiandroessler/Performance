// Speicherschicht ueber Drive (fuehrend) + IndexedDB (Kap. 5.1: "lokaler
// Cache fuer Geschwindigkeit, jederzeit aus Drive wiederherstellbar").
//
// Schreiben: immer zuerst nach Drive (fuehrende Ablage), erst bei Erfolg auch
// in den lokalen Cache spiegeln - so bleibt Drive nie hinter dem Cache zurueck.
// Lesen: zuerst lokaler Cache (schnell), bei Fehlschlag/Leere Drive lesen und
// den Cache dabei nachfuellen. Damit ist "Drive-Inhalte nach Loeschen des
// Browser-Caches vollstaendig wiederherstellbar" (M2-Abnahme) automatisch
// erfuellt, ohne Sonderfallcode: ein geleerter Cache verhaelt sich wie ein
// erster Lesezugriff.

import * as drive from './drive.js';
import { idbGet, idbPut, idbDelete, idbClearAll } from './idb.js';

const LAST_CACHE_USER_KEY = 'performance-app-last-cache-user';

// Erhoehen, wenn ein Fehler dazu gefuehrt haben koennte, dass FALSCHE Daten unter dem RICHTIGEN
// Konto-Marker gelandet sind (z. B. der Drive-OAuth-hint-Bug vom 2026-09-20: die Kopfzeile zeigte
// waehrenddessen bereits korrekt Konto B, der lokale Cache wurde also unter "B" markiert - aber
// die darunter gecachten INHALTE kamen wegen des fehlenden hint tatsaechlich von Konto As Drive).
// Eine reine E-Mail-Gleichheitspruefung (siehe unten) erkennt genau DAS nicht, weil sich die
// E-Mail beim naechsten Login gar nicht geaendert hat. Ein Versionssprung erzwingt einmalig ein
// Leeren fuer JEDEN bestehenden Marker, unabhaengig vom Konto - danach greift die normale
// Kontowechsel-Erkennung wieder wie gewohnt.
const CACHE_SCHEMA_VERSION = 2;

/**
 * Der lokale IndexedDB-Cache ist NICHT pro Google-Konto getrennt (ein Store fuer die gesamte
 * Origin, Dateinamen wie "index.json" als Schluessel) - meldet sich auf demselben Browser ein
 * ANDERES Konto an, wuerde readFile() sonst weiterhin den Cache des vorherigen Kontos liefern,
 * OHNE je Drive zu befragen (Cache-Hit schlaegt fehl bevor Drive ueberhaupt geprueft wird). Da
 * der Cache laut Kap. 5.1 ohnehin "jederzeit aus Drive wiederherstellbar" ist (idb.js), ist
 * Leeren bei einem Kontowechsel die einfachste korrekte Loesung - kein Aufwand fuer eine
 * Pro-Konto-Schluesselung. Muss aufgerufen werden, BEVOR irgendein anderer storage.js-Aufruf
 * fuer die neu angemeldete Sitzung passiert (main.js#afterSignIn, direkt nach fetchSession()).
 */
export async function ensureCacheMatchesUser(email) {
  if (!email) return;
  let lastMarker;
  try {
    lastMarker = localStorage.getItem(LAST_CACHE_USER_KEY);
  } catch {
    lastMarker = null;
  }
  const currentMarker = `${CACHE_SCHEMA_VERSION}:${email}`;
  if (lastMarker && lastMarker !== currentMarker) {
    await idbClearAll().catch(() => {});
  }
  try {
    localStorage.setItem(LAST_CACHE_USER_KEY, currentMarker);
  } catch {
    // Privater Modus o.ae. - dann bleibt der Cache im Zweifel einmal stehen, kein Absturz.
  }
}

export async function readFile(name) {
  const cached = await idbGet(name).catch(() => undefined);
  if (cached) return cached.content;
  const fromDrive = await drive.readFile(name);
  if (fromDrive) await idbPut(name, fromDrive, 'application/octet-stream').catch(() => {});
  return fromDrive;
}

export async function writeFile(name, contentType, body) {
  await drive.writeFile(name, contentType, body);
  const buf = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
  await idbPut(name, buf, contentType).catch(() => {});
}

export async function readJson(name) {
  const buf = await readFile(name);
  if (!buf) return null;
  return JSON.parse(new TextDecoder().decode(buf));
}

export async function writeJson(name, obj) {
  return writeFile(name, 'application/json', JSON.stringify(obj));
}

export async function deleteFile(name) {
  await drive.deleteFile(name);
  await idbDelete(name).catch(() => {});
}

/** FA-USER-07: "Meine Daten loeschen" - Drive-App-Ordner UND lokalen Cache leeren. */
export async function deleteAllFiles() {
  await drive.deleteAllFiles();
  await idbClearAll().catch(() => {});
}
