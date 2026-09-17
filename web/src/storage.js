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
