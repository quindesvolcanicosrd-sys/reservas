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
-- Bug de seguridad real corregido (pedido explícito de Victor, 2026-09-13):
-- la versión original de este archivo tenía el valor literal de
-- `CRON_SECRET` embebido en el `net.http_post` de abajo -- a diferencia de
-- `20260903_cron_notificaciones_diarias.sql`/`20260907180000_push_cron_recordatorios.sql`
-- (que ya tenían el mismo problema, aceptado en su momento como "no peor
-- que el resto de la config de este cron"), esta migración TODAVÍA no
-- había sido aplicada contra producción -- se corrige acá antes de
-- aplicarla en vez de sumar una 3ra copia en texto plano al repo. El
-- secret ahora vive ENCRIPTADO en Supabase Vault (`supabase_vault`,
-- extensión ya habilitada en el proyecto -- verificado contra
-- `pg_extension` antes de escribir esto), no en este archivo -- la función
-- lo lee en caliente vía `vault.decrypted_secrets` por `name`, nunca por
-- valor literal.
--
-- Setup manual UNA SOLA VEZ, FUERA de esta migración (no versionado en
-- git a propósito -- sería el mismo problema de nuevo): correr, con el
-- valor REAL de `CRON_SECRET` (`supabase secrets list` no lo expone en
-- texto plano por diseño -- pedirlo directo a quien lo configuró o
-- generarlo de nuevo con `supabase secrets set CRON_SECRET=<nuevo valor>`
-- y actualizar la Edge Function si hace falta rotarlo):
--   select vault.create_secret(
--     '<VALOR REAL DE CRON_SECRET, nunca commitear esto>',
--     'cron_secret',
--     'CRON_SECRET compartido con la Edge Function api/recalcular-categorias via header x-cron-secret.'
--   );
-- (Ya aplicado contra la base de este proyecto en esta misma sesión --
-- ver CHANGELOG.md. Si se recrea la base o se rota `CRON_SECRET`, repetir
-- este paso -- o `select vault.update_secret(id, '<nuevo valor>')` con el
-- `id` real, para no duplicar el nombre.)
--
-- Si el secret no está en Vault todavía, la función abajo lo detecta
-- (`v_cron_secret IS NULL`), deja un `RAISE WARNING` en los logs de
-- Postgres y NO llama a `recalcular-categorias` -- el `UPDATE` de
-- `asistencias.estado` (el propósito original de este cron) sigue
-- corriendo igual, nunca queda bloqueado por un secret faltante.
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
CREATE OR REPLACE FUNCTION marcar_eventos_finalizados_y_recalcular()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filas_afectadas integer;
  v_cron_secret    text;
BEGIN
  UPDATE asistencias
  SET estado = 'Evento Finalizado'
  WHERE estado = 'Evento Programado'
  AND (fecha + termina)::timestamp < NOW() AT TIME ZONE 'America/Guayaquil';

  GET DIAGNOSTICS filas_afectadas = ROW_COUNT;

  IF filas_afectadas > 0 THEN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;

    IF v_cron_secret IS NULL THEN
      RAISE WARNING 'marcar_eventos_finalizados_y_recalcular: secret "cron_secret" no encontrado en Vault -- recalcular-categorias NO se disparó (ver nota de setup manual en esta migración)';
    ELSE
      PERFORM net.http_post(
        url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/recalcular-categorias',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_cron_secret),
        body := '{}'::jsonb
      );
    END IF;
  END IF;
END;
$$;

-- Solo el rol de servidor y el dueño de la función (postgres, vía pg_cron)
-- pueden ejecutarla -- mismo criterio que `regenerar_ventana_asistencias()`
-- (migración 20260828): PostgREST expone por default cualquier función de
-- `public` como RPC a `anon`/`authenticated`, y esta dispara un recálculo
-- completo del equipo si la llaman -- nunca fue intención exponerla así.
REVOKE ALL ON FUNCTION marcar_eventos_finalizados_y_recalcular() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marcar_eventos_finalizados_y_recalcular() TO service_role;

-- cron.schedule() con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- esta migración es segura de correr más de una vez. Mismo
-- horario de siempre ('*/30 * * * *').
SELECT cron.schedule(
  'marcar-eventos-finalizados',
  '*/30 * * * *',
  $$SELECT marcar_eventos_finalizados_y_recalcular();$$
);
