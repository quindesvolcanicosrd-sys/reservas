/* Service Worker — Mirlxs RD Reservas
   Estrategia: network-first con fallback a cache (solo recursos del mismo origen).
   Las llamadas a la API de Apps Script (script.google.com) NUNCA se cachean. */

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

var CACHE = 'mirlxs-v2';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Solo cachear recursos del mismo origen (HTML, manifest, iconos).
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then(function (resp) {
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copia); }).catch(function () {});
        return resp;
      })
      .catch(function () { return caches.match(e.request); })
  );
});

/* Preparado para OneSignal/push en una fase futura:
   aquí se agregarían los listeners 'push' y 'notificationclick'. */
