-- Feature nueva (pedido explícito de Victor): el cron
-- `marcar-eventos-finalizados` (migración 20260831_cron_eventos_finalizados.sql)
-- transiciona `asistencias.estado` a 'Evento Finalizado' cada 30min, pero
-- nada disparaba `recalcular-categorias` automáticamente después -- el
-- recálculo de categoría/tier solo corría manual ("Recalcular ahora", Mi
-- Liga) o vía el cron histórico de otro proceso. Se convierte el cron de
-- SQL puro (un solo UPDATE) a una función PL/pgSQL que además llama a la
-- Edge Function `recalcular-categorias` vía `pg_net` -- pero SOLO si el
-- UPDATE afectó al menos 1 fila (`GET DIAGNOSTICS ... ROW_COUNT`), para no
-- disparar un recálculo completo del equipo cada 30min sin necesidad real
-- (la mayoría de las corridas no van a tener ningún evento recién
-- finalizado, sobre todo de madrugada).
--
-- `pg_net`/`pg_cron` ya están habilitados en el proyecto (verificado contra
-- `pg_extension` antes de escribir esto: pg_net 0.20.4, pg_cron 1.6.4).
--
-- Auth de la llamada a `recalcular-categorias`: header `x-cron-secret`
-- (mismo `CRON_SECRET` ya configurado en producción, reusado tal cual --
-- ver `20260907180000_push_cron_recordatorios.sql` para el razonamiento
-- completo de por qué NO se usa la `SERVICE_ROLE_KEY` literal en una
-- migración versionada en git) -- requiere el fix de
-- `supabase/functions/recalcular-categorias/index.ts` de esta misma tanda,
-- que agrega ese camino de auth (antes solo aceptaba un `adminToken` real
-- de `admin_sessions`, algo que un cron no tiene). Deployar esa función
-- ANTES de aplicar esta migración.
--
-- Nota (limitación conocida, aceptada): `recalcular-categorias` al final de
-- su corrida hace un segundo llamado best-effort a `recalcularStatsEquipo`
-- (acción de `api`) reusando el MISMO `adminToken` de la request original
-- (ver ese archivo) -- en una corrida disparada por este cron no hay un
-- `adminToken` real que reenviar, así que esa llamada puntual (stats
-- horas_ano/asistencias_ano/total_eventos_ano) va a fallar en silencio
-- (ya está en un try/catch "best-effort" pre-existente, no rompe nada) --
-- el recálculo de categoría/tier/historial_tier, que es el propósito real
-- de este cron, no depende de esa llamada y corre completo igual.
--
-- Aplicar vía `supabase db query --linked -f <archivo>` (no
-- `supabase db push`, roto en este repo -- ver la nota de infraestructura
-- ya documentada en MANIFEST.md/20260903_cron_notificaciones_diarias.sql).
CREATE OR REPLACE FUNCTION marcar_eventos_finalizados_y_recalcular() RETURNS void AS $$
DECLARE
  filas_afectadas integer;
BEGIN
  UPDATE asistencias
  SET estado = 'Evento Finalizado'
  WHERE estado = 'Evento Programado'
  AND (fecha + termina)::timestamp < NOW() AT TIME ZONE 'America/Guayaquil';

  GET DIAGNOSTICS filas_afectadas = ROW_COUNT;

  IF filas_afectadas > 0 THEN
    PERFORM net.http_post(
      url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/recalcular-categorias',
      headers := '{"Content-Type":"application/json","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
      body := '{}'::jsonb
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- cron.schedule() con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- esta migración es segura de correr más de una vez. Mismo
-- horario de siempre ('*/30 * * * *').
SELECT cron.schedule(
  'marcar-eventos-finalizados',
  '*/30 * * * *',
  $$SELECT marcar_eventos_finalizados_y_recalcular();$$
);
