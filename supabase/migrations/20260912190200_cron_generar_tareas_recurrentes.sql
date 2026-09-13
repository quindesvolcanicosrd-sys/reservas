-- Feature nueva (pedido explícito de Victor, "Tareas recurrentes"): cron
-- mensual que llama a la Edge Function `api` (`action:'cronGenerarTareasRecurrentes'`,
-- ver supabase/functions/api/index.ts) para generar, el día 1 de cada mes,
-- una instancia nueva en `tareas` (sin asignar, `estado='no_iniciada'`) por
-- cada fila activa de `tareas_recurrentes` -- mismo mecanismo de llamada que
-- el resto de los crons que pegan contra `api` (headers `apikey`/
-- `Authorization` con la anon key pública + `x-cron-secret` leído en
-- caliente de Supabase Vault, nunca en texto plano acá -- ver el
-- razonamiento completo en `20260912150000_fix_cron_gateway_auth_api.sql`,
-- el bug real de las 4 crons que nunca funcionaron en producción por faltar
-- justamente el `apikey`/`Authorization` del gateway de la plataforma).
--
-- Horario '0 10 1 * *' (10:00 UTC = 05:00 Ecuador, día 1 de cada mes) --
-- de madrugada para no competir con tráfico real, mismo criterio que el
-- resto de los crons de mantenimiento de este archivo.
--
-- cron.schedule() con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- segura de correr más de una vez. Aplicar vía
-- `supabase db query --linked -f <archivo>` (no `supabase db push`, roto en
-- este repo -- ver la nota de infraestructura ya documentada en
-- MANIFEST.md).
SELECT cron.schedule(
  'generar-tareas-recurrentes',
  '0 10 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{"action":"cronGenerarTareasRecurrentes"}'::jsonb
  )
  $$
);
