-- Auto-cancelar eventos sin rollcall tras 24h: REVERTIDO (feature "aviso de
-- eventos sin rollcall"). En vez de cancelar en silencio, la app avisa a los
-- admins (`sinRollcall` en getEventosRango(), badge + banner en js/eventos.js)
-- y el admin decide: marcar asistencias o cancelar explícitamente.
--
-- Esta migración deja el cron `marcar-eventos-finalizados` con SOLO la
-- transición Evento Programado → Evento Finalizado, tal cual quedó en
-- 20260912140000_cron_finalizados_recalcula_categorias.sql (función PL/pgSQL
-- `marcar_eventos_finalizados_y_recalcular()`, que además dispara
-- `recalcular-categorias` vía pg_net + secret de Vault si el UPDATE afectó
-- filas). Es idempotente: si una versión anterior de este archivo (con el
-- 2do UPDATE de auto-cancel) ya se aplicó, correr esta versión la revierte.
-- cron.schedule() con jobname existente reemplaza el job en lugar de duplicarlo.
--
-- Aplicar vía `supabase db query --linked -f <archivo>` (no `supabase db push`).
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
  -- Transición normal: Evento Programado → Evento Finalizado al terminar
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
      RAISE WARNING 'marcar_eventos_finalizados_y_recalcular: secret "cron_secret" no encontrado en Vault -- recalcular-categorias NO se disparó';
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

REVOKE ALL ON FUNCTION marcar_eventos_finalizados_y_recalcular() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marcar_eventos_finalizados_y_recalcular() TO service_role;

SELECT cron.schedule(
  'marcar-eventos-finalizados',
  '*/30 * * * *',
  $$SELECT marcar_eventos_finalizados_y_recalcular();$$
);
