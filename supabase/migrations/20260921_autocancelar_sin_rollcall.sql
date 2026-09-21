-- Actualiza el cron marcar-eventos-finalizados para que además de finalizar,
-- también auto-cancele eventos que pasaron hace >24h sin ningún rollcall marcado.
--
-- El job `marcar-eventos-finalizados` ya no es SQL plano: desde
-- 20260912140000_cron_finalizados_recalcula_categorias.sql ejecuta
-- `marcar_eventos_finalizados_y_recalcular()`, que además dispara
-- `recalcular-categorias` (vía pg_net + secret de Vault). Reprogramar el job
-- con SQL plano lo habría pisado y dejado de recalcular categorías, así que
-- acá se actualiza la FUNCIÓN (CREATE OR REPLACE) y el job sigue apuntando a
-- ella -- se re-declara igual al final por si esta migración se corre sola.
-- cron.schedule() con jobname existente reemplaza el job en lugar de duplicarlo.
--
-- El recálculo se dispara si CUALQUIERA de los 2 UPDATEs afectó filas: un
-- evento auto-cancelado deja de contar para stats/termómetro.
--
-- Aplicar vía `supabase db query --linked -f <archivo>` (no `supabase db push`).
CREATE OR REPLACE FUNCTION marcar_eventos_finalizados_y_recalcular()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filas_finalizadas integer;
  filas_canceladas  integer;
  v_cron_secret     text;
BEGIN
  -- 1. Transición normal: Evento Programado → Evento Finalizado al terminar
  UPDATE asistencias
  SET estado = 'Evento Finalizado'
  WHERE estado = 'Evento Programado'
  AND (fecha + termina)::timestamp < NOW() AT TIME ZONE 'America/Guayaquil';

  GET DIAGNOSTICS filas_finalizadas = ROW_COUNT;

  -- 2. Auto-cancelar: si pasaron más de 24h desde que terminó y no hay rollcall
  UPDATE asistencias
  SET estado = 'Evento Cancelado'
  WHERE estado IN ('Próximo', 'Evento Programado', 'Evento Finalizado')
  AND (fecha + termina)::timestamp < NOW() AT TIME ZONE 'America/Guayaquil' - INTERVAL '24 hours'
  AND COALESCE(trim(a_horario), '') = ''
  AND COALESCE(trim(tarde), '') = '';

  GET DIAGNOSTICS filas_canceladas = ROW_COUNT;

  IF filas_finalizadas + filas_canceladas > 0 THEN
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
