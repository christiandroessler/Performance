// FA-PWA-01: minimaler Service Worker, NUR fuer die Installierbarkeits-Heuristik von
// Chrome/Android (die einen registrierten Service Worker mit fetch-Handler verlangt).
// Bewusst KEIN Offline-Caching - das Lastenheft verlangt keinen Offline-Modus, nur
// Installierbarkeit + die mobile Kurzuebersicht (Kap. 6.10). Ein reiner Passthrough
// haelt das Verhalten identisch zum unregistrierten Zustand, keine Cache-Invalidierungs-
// Komplexitaet noetig.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
