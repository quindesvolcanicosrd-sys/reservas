/* Service Worker — Mirlxs RD Reservas
   Estrategia: network-first con fallback a cache (solo recursos del mismo origen),
   con timeout de 4s (ver fetch handler, Promise.race red/timeout) — si la red no
   responde en ese margen se sirve desde caché, sin dejar la navegación/el recurso
   colgado indefinidamente ante una red en estado ambiguo (ver "Cambios recientes"
   en MANIFEST.md, loader que quedaba indefinido al reabrir el navegador).
   Las llamadas a la API de Apps Script (script.google.com) NUNCA se cachean.
   js/config.js además se pide con cache:'no-store' (ver fetch handler) para que
   ni el caché HTTP local del navegador pueda servirlo sin ir a la red — ver
   "Cambios recientes" en MANIFEST.md, causa raíz real: Fastly (CDN de GitHub
   Pages) cacheaba config.js 10 min en el edge, fuera del alcance de este SW;
   el fix real de esa capa es el query string ?v=<hash> en los <script src=...>,
   esto es solo la mitigación del lado del navegador. */

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

var CACHE = 'mirlxs-v10';

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

// RSVP en segundo plano desde los botones de acción "Asistiré"/"No asistiré"
// (`web_buttons` id 'asistire'/'no-asistire', ver pushEventoCreado() en
// supabase/functions/api/index.ts) -- a diferencia del clic en el CUERPO de
// la notificación (que sigue abriendo la app normal, sin tocar acá, mismo
// comportamiento de siempre vía el propio SDK de OneSignal importado abajo),
// tocar uno de estos 2 botones NO debe abrir ninguna ventana: solo confirma
// la asistencia en background (fetch a la Edge Function record-attendance)
// y cierra la notificación. El `url` de cada uno de esos 2 botones se manda
// como el string mágico '_osp=do_not_open' (documentado por OneSignal para
// Chrome/Firefox -- no soportado en Safari, ahí cae al comportamiento
// default de abrir esa "url" literal) para que el propio handler default
// de OneSignal no abra nada -- este listener no necesita pelear por orden
// de registro contra `self.addEventListener` de OneSignalSDK.sw.js (abajo).
// `token`/`evento_id` viajan en `data` del payload de la notification
// (mint-eado por usuario+evento en pushEventoCreado(), ver Edge Function),
// expuestos acá vía `event.notification.data` (Notification API estándar --
// lo que se pasó como `data` a `showNotification()`, que es lo que hace
// internamente el worker de OneSignal con el `data` del payload REST).
self.addEventListener('notificationclick', function (e) {
  var accion = e.action;
  if (accion !== 'asistire' && accion !== 'no-asistire') return; // deja pasar body-click/otros al handler default de OneSignal

  e.notification.close();
  var datos = (e.notification && e.notification.data) || {};
  var token = datos.token;
  var idEvento = datos.evento_id;
  if (!token || !idEvento) return;

  e.waitUntil(
    fetch('https://uusbnreitoobqssizbfq.supabase.co/functions/v1/record-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token,
        action: accion === 'asistire' ? 'asistire' : 'no_asistire',
        evento_id: idEvento,
      }),
    }).catch(function () { /* best-effort, sin toast posible desde el SW */ })
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

  var redPromise = fetch(e.request, esConfig ? { cache: 'no-store' } : undefined)
    .then(function (resp) {
      if (esConfig) return resp;
      var copia = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copia); }).catch(function () {});
      return resp;
    });

  var timeoutPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve(caches.match(e.request)); }, 4000);
  });

  e.respondWith(
    Promise.race([redPromise, timeoutPromise])
      .catch(function () { return caches.match(e.request); })
  );
});
