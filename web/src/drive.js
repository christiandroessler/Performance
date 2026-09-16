// Zugriff auf den versteckten App-Ordner im Google Drive des Nutzers (Scope
// drive.appdata, Kap. 5.2). Der App-Ordner ist flach; `name` darf z. B.
// "streams/2026-01.bin" enthalten - fuer Drive ist das nur ein String, keine
// echte Ordnerstruktur, das reicht aber als eindeutiger logischer Pfad.

import { getDriveAccessToken } from './auth.js';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

async function driveFetch(url, init = {}) {
  const token = await getDriveAccessToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive-Anfrage fehlgeschlagen (${res.status}): ${text}`);
  }
  return res;
}

/** Findet die Datei-ID zu einem logischen Namen, oder null. */
export async function findFileId(name) {
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set('spaces', 'appDataFolder');
  url.searchParams.set('q', `name = '${name.replace(/'/g, "\\'")}' and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  const res = await driveFetch(url.toString());
  const body = await res.json();
  return body.files && body.files.length > 0 ? body.files[0].id : null;
}

/** Fuer NFA-08/Wiederherstellbarkeit: alle Dateien im App-Ordner (Metadaten, kein Inhalt). */
export async function listAllFiles() {
  const out = [];
  let pageToken;
  do {
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('fields', 'nextPageToken, files(id,name,modifiedTime,size)');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await driveFetch(url.toString());
    const body = await res.json();
    out.push(...(body.files || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

async function createFile(name, contentType, body) {
  const metadata = { name, parents: ['appDataFolder'] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([body], { type: contentType }));
  const url = new URL(DRIVE_UPLOAD_URL);
  url.searchParams.set('uploadType', 'multipart');
  url.searchParams.set('fields', 'id');
  const res = await driveFetch(url.toString(), { method: 'POST', body: form });
  const created = await res.json();
  return created.id;
}

async function updateFile(fileId, contentType, body) {
  const url = new URL(`${DRIVE_UPLOAD_URL}/${fileId}`);
  url.searchParams.set('uploadType', 'media');
  await driveFetch(url.toString(), { method: 'PATCH', headers: { 'Content-Type': contentType }, body });
}

/** Legt die Datei an oder ueberschreibt sie, falls sie unter diesem Namen schon existiert. */
export async function writeFile(name, contentType, body) {
  const existingId = await findFileId(name);
  if (existingId) {
    await updateFile(existingId, contentType, body);
    return existingId;
  }
  return createFile(name, contentType, body);
}

export async function readFile(name) {
  const fileId = await findFileId(name);
  if (!fileId) return null;
  const url = new URL(`${DRIVE_FILES_URL}/${fileId}`);
  url.searchParams.set('alt', 'media');
  const res = await driveFetch(url.toString());
  return res.arrayBuffer();
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
  const fileId = await findFileId(name);
  if (!fileId) return;
  await driveFetch(`${DRIVE_FILES_URL}/${fileId}`, { method: 'DELETE' });
}

/** FA-USER-07: "Meine Daten loeschen" - gesamten App-Ordner leeren. */
export async function deleteAllFiles() {
  const files = await listAllFiles();
  for (const f of files) {
    await driveFetch(`${DRIVE_FILES_URL}/${f.id}`, { method: 'DELETE' });
  }
}
