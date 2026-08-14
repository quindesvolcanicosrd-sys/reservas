var BACKEND = 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api';
var GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';
var MAPS_API_KEY = 'AIzaSyDSGkh2AyuM_-6ngo5-XMPi0NYrXZHEBl8';
// Fetch directo del navegador a la REST API de Supabase (sin pasar por
// BACKEND/la Edge Function) -- hoy solo lo usa _evCargarDatosReales()/
// js/eventos.js para `temporadas_descanso` (ver MANIFEST.md "Cambios
// recientes", Tanda B). Mismo proyecto que BACKEND (mismo project ref en la
// URL), pero acá se habla directo con PostgREST (`/rest/v1/<tabla>`), no con
// la Edge Function (`/functions/v1/api`). SUPABASE_ANON_KEY es la
// anon/publishable key del proyecto -- a diferencia de SUPABASE_SERVICE_ROLE_KEY
// (secreta, usada SOLO server-side por `supabase/functions/api/index.ts` vía
// variable de entorno, nunca debe viajar al cliente), esta key está pensada
// para exponerse en el navegador: su seguridad depende de las políticas RLS
// de la tabla en Supabase, no de mantenerla oculta -- mismo criterio ya
// documentado para MAPS_API_KEY, arriba.
// PENDIENTE (Victor): pegar acá la anon/publishable key real del proyecto
// (Supabase Dashboard → Project Settings → API). Hasta entonces el fetch de
// temporadas_descanso falla con 401 -- degrada solo (_EV_OFFSEASON=[],
// console.warn, sin toast), mismo comportamiento ya previsto para cualquier
// error de ese fetch.
var SUPABASE_URL = 'https://uusbnreitoobqssizbfq.supabase.co';
var SUPABASE_ANON_KEY = '';

function sha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data).then(function(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}
