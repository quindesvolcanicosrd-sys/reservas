/* Service Worker — Mirlxs RD Reservas
   Estrategia: network-first con fallback a cache (solo recursos del mismo origen).
   Las llamadas a la API de Apps Script (script.google.com) NUNCA se cachean.
   js/config.js además se pide con cache:'no-store' (ver fetch handler) para que
   ni el caché HTTP local del navegador pueda servirlo sin ir a la red — ver
   "Cambios recientes" en MANIFEST.md, causa raíz real: Fastly (CDN de GitHub
   Pages) cacheaba config.js 10 min en el edge, fuera del alcance de este SW;
   el fix real de esa capa es el query string ?v=<hash> en los <script src=...>,
   esto es solo la mitigación del lado del navegador. */

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

var CACHE = 'mirlxs-v3';

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

  // config.js es config de arranque (BACKEND/GOOGLE_CLIENT_ID/MAPS_API_KEY) —
  // nunca debe poder servirse desde el caché HTTP local del navegador ni
  // guardarse en Cache Storage, para no sumar una capa más de staleness
  // encima del cache-busting por query string.
  var esConfig = /\/js\/config\.js(\?|$)/.test(e.request.url);

  e.respondWith(
    fetch(e.request, esConfig ? { cache: 'no-store' } : undefined)
      .then(function (resp) {
        if (esConfig) return resp;
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copia); }).catch(function () {});
        return resp;
      })
      .catch(function () { return caches.match(e.request); })
  );
});

/* Preparado para OneSignal/push en una fase futura:
   aquí se agregarían los listeners 'push' y 'notificationclick'. */
