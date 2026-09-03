-- Cron diario de notificaciones push (OneSignal) -- llama a la Edge Function
-- (action:'cronDiario', supabase/functions/api/index.ts) todos los días a
-- las 8am hora de Ecuador (UTC-5 fijo, sin DST -- mismo criterio ya
-- documentado en 20260831_cron_eventos_finalizados.sql) = 13:00 UTC.
--
-- A diferencia de regenerar_ventana_asistencias()/marcar-eventos-finalizados
-- (SQL puro dentro de Postgres, sin salir de la base), esta tarea vive en la
-- Edge Function porque necesita llamar a la API de OneSignal (fetch a un
-- host externo) -- pg_net es el puente: net.http_post() dispara la llamada
-- HTTP de forma asíncrona desde dentro de Postgres, con el mismo header
-- `x-cron-secret` que la Edge Function exige para esta acción en particular
-- (ver el case 'cronDiario' del router, supabase/functions/api/index.ts) --
-- sin ese header, corriendo distinto al secret real, la Edge Function
-- responde 401 y no manda ningún push.
--
-- El secret va literal acá (mismo criterio que cualquier fila de `cron.job`
-- -- visible para quien tenga acceso de servicio a la base, no distinto del
-- resto de la config de este cron) -- debe coincidir EXACTO con el secret
-- real de la Edge Function:
--   supabase secrets set CRON_SECRET=270da8e9802bde05bc95227d6fcde2f417bac222720bb74b
--
-- cron.schedule() con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- misma nota que dejan las 2 migraciones de cron anteriores,
-- esta migración es segura de correr más de una vez.
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'notificaciones-diarias',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronDiario"}'::jsonb
  )
  $$
);
