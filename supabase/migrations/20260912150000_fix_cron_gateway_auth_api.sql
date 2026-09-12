-- Bug real encontrado de paso (mientras se investigaba cómo llamar a una
-- Edge Function desde un cron para la tarea de arriba,
-- 20260912140000_cron_finalizados_recalcula_categorias.sql) y corregido en
-- esta misma tanda: LAS 4 CRONS QUE LLAMAN A `api` VÍA `pg_net`
-- (`notificaciones-diarias`, `push-recordatorio-1h`, `push-recordatorio-1dia`,
-- `push-admin-1h` -- migraciones `20260903_cron_notificaciones_diarias.sql`/
-- `20260907180000_push_cron_recordatorios.sql`) NUNCA FUNCIONARON EN
-- PRODUCCIÓN desde que se crearon.
--
-- Confirmado contra la DB real (`supabase db query --linked`, solo
-- lecturas): `net._http_response` -- la única fila real disponible (la
-- corrida de `notificaciones-diarias` de hoy, 13:00 UTC) devolvió
-- `status_code=401` con body
-- `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`
-- -- ESE formato de error es del GATEWAY de la plataforma Supabase (rechaza
-- la request ANTES de que llegue al código de `api/index.ts`), no del gate
-- interno de `x-cron-secret` de la función (que devuelve
-- `{"error":"No autorizado."}`, un shape distinto -- confirmado leyendo
-- `case 'cronDiario'` en el router). Causa real: `api` está deployada CON
-- verificación de JWT a nivel de plataforma (a diferencia de
-- `recalcular-categorias`, deployada con `--no-verify-jwt` -- ver el
-- comentario de `_mlRecalcular()`/js/admin.js) -- cualquier request sin un
-- `apikey`/`Authorization` con un JWT válido de Supabase nunca llega a
-- ejecutar el chequeo de `x-cron-secret` en absoluto, sin importar que ese
-- secret esté bien puesto. Las 4 migraciones originales solo mandaban
-- `Content-Type`/`x-cron-secret` -- nunca `apikey`, así que estas
-- notificaciones automáticas (recordatorio 1h antes, 1 día antes, resumen
-- admin, resumen diario/cumpleaños/cuota) llevan fallando en silencio desde
-- que se crearon (pg_cron considera "exitosa" la corrida en cuanto
-- `net.http_post` encola la request -- no espera ni valida la respuesta
-- HTTP real, por eso `cron.job_run_details` los muestra como `succeeded`
-- sin que eso signifique que el push realmente salió).
--
-- Fix: se agrega el header `apikey`/`Authorization: Bearer <ANON_KEY>` (el
-- JWT público que ya viaja hardcodeado en `js/config.js` a cualquier
-- browser -- no es un secret nuevo ni de privilegio alto, es exactamente lo
-- que ya usa el propio frontend para llegar al gateway) a las 4 llamadas --
-- el `x-cron-secret` sigue siendo la autorización REAL a nivel de
-- aplicación, esto solo satisface el gate de plataforma que va ANTES.
-- `cron.schedule()` con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- misma nota que el resto de estas migraciones, segura de
-- correr más de una vez.
--
-- Aplicar vía `supabase db query --linked -f <archivo>` (no
-- `supabase db push`, roto en este repo -- ver la nota de infraestructura
-- ya documentada en MANIFEST.md).
SELECT cron.schedule(
  'notificaciones-diarias',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronDiario"}'::jsonb
  )
  $$
);

SELECT cron.schedule(
  'push-recordatorio-1h',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronRecordatorioEvento"}'::jsonb
  )
  $$
);

SELECT cron.schedule(
  'push-recordatorio-1dia',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronRecordatorio1Dia"}'::jsonb
  )
  $$
);

SELECT cron.schedule(
  'push-admin-1h',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronAdminEvento"}'::jsonb
  )
  $$
);
