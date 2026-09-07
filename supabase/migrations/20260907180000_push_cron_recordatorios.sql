-- Crons de recordatorios/resumen admin de push (OneSignal) -- llaman a la
-- Edge Function (action:'cronRecordatorioEvento'/'cronRecordatorio1Dia'/
-- 'cronAdminEvento', supabase/functions/api/index.ts) con el MISMO
-- mecanismo pg_net + header x-cron-secret que ya usa
-- 20260903_cron_notificaciones_diarias.sql -- reusa el mismo CRON_SECRET
-- ya configurado en producción, no hace falta un secret nuevo.
--
-- Deliberadamente NO se usa la SERVICE_ROLE_KEY acá (a diferencia de lo
-- que suele sugerirse para llamar Edge Functions vía pg_net con
-- `Authorization: Bearer ...`) -- pegar esa key en un archivo de migración
-- versionado en git sería un secret de privilegio MUCHO más alto expuesto
-- en texto plano (bypasea RLS de TODA la base) que el CRON_SECRET
-- dedicado, que solo gatea estas acciones puntuales del cron. Mismo
-- criterio ya usado por la migración de cronDiario.
--
-- El secret va literal acá (mismo criterio que esa migración -- visible
-- para quien tenga acceso de servicio a la base, no distinto del resto de
-- la config de este cron) -- debe coincidir EXACTO con el secret real de
-- la Edge Function:
--   supabase secrets set CRON_SECRET=270da8e9802bde05bc95227d6fcde2f417bac222720bb74b
--
-- cron.schedule() con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- esta migración es segura de correr más de una vez.
--
-- Aplicar con `supabase db query --linked -f <archivo>` (NO
-- `supabase db push`, roto en este repo por una colisión de versiones de
-- migraciones preexistente -- ver la nota de infraestructura en
-- 20260903_cron_notificaciones_diarias.sql / MANIFEST.md).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Recordatorio 1h antes (SOLO quien marcó 'Asistiré') -- cada 10min,
-- ventana de 55-65min calculada dentro de cronRecordatorioEvento() (10min
-- de ancho = 1 tick del cron, sin solaparse con el siguiente).
SELECT cron.schedule(
  'push-recordatorio-1h',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronRecordatorioEvento"}'::jsonb
  )
  $$
);

-- 2) Recordatorio 1 día antes (SOLO quien no tiene ninguna respuesta) --
-- cada hora, ventana de 23-25h calculada dentro de cronRecordatorio1Dia().
SELECT cron.schedule(
  'push-recordatorio-1dia',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronRecordatorio1Dia"}'::jsonb
  )
  $$
);

-- 3) Resumen admin 1h antes (quiénes vienen + equipamiento) -- misma
-- cadencia/ventana que (1), calculada dentro de cronAdminEvento().
SELECT cron.schedule(
  'push-admin-1h',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronAdminEvento"}'::jsonb
  )
  $$
);
