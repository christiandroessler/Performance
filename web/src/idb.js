// Generische IndexedDB-Anbindung fuer den lokalen Cache (Kap. 5.1: "jederzeit
// aus Drive wiederherstellbar" - hier bewusst ein simpler Key-Value-Store,
// keine eigene Datenmodellierung, damit "wiederherstellbar" einfach zu
// garantieren ist: leert man den Store, liest storage.js einfach erneut aus
// Drive nach.

const DB_NAME = 'performance-app-cache';
const DB_VERSION = 1;
const STORE = 'files';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** @returns {Promise<{name: string, content: ArrayBuffer, contentType: string, updatedAt: string} | undefined>} */
export async function idbGet(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(name, content, contentType) {
  await withStore('readwrite', (store) => store.put({ name, content, contentType, updatedAt: new Date().toISOString() }));
}

export async function idbDelete(name) {
  await withStore('readwrite', (store) => store.delete(name));
}

/** Fuer FA-USER-07 ("Meine Daten loeschen") - leert nur den lokalen Cache, nicht Drive. */
export async function idbClearAll() {
  await withStore('readwrite', (store) => store.clear());
}
