-- Estado "De viaje" (feat nueva, ver MANIFEST.md) -- jugadora fuera por un
-- viaje: mismo efecto que Lesionadx sobre el tier (recalcular-categorias la
-- saltea, tier congelado) y sus ausencias no la pasan a Ausente/Inactivx.
-- Valor 'De viaje' (mismo estilo que los demás: 'Activx'/'Ausente'/
-- 'Técnico'/'Lesionadx', texto visible tal cual en la UI).
--
-- Aplicar vía `supabase db query --linked -f <archivo>` (`supabase db push`
-- sigue roto en este repo, ver MANIFEST.md).

-- 1) Período del viaje, ambos opcionales ("Omitir fechas" = estado sin fechas).
ALTER TABLE public.equipo ADD COLUMN IF NOT EXISTS viaje_desde date;
ALTER TABLE public.equipo ADD COLUMN IF NOT EXISTS viaje_hasta date;
ALTER TABLE public.equipo DROP CONSTRAINT IF EXISTS equipo_viaje_rango_check;
ALTER TABLE public.equipo ADD CONSTRAINT equipo_viaje_rango_check
  CHECK (viaje_desde IS NULL OR viaje_hasta IS NULL OR viaje_hasta >= viaje_desde);

-- 2) 'De viaje' como valor válido de estado_miembro (CHECK real en
-- producción: equipo_estado_miembro_check, verificado contra pg_constraint).
ALTER TABLE public.equipo DROP CONSTRAINT IF EXISTS equipo_estado_miembro_check;
ALTER TABLE public.equipo ADD CONSTRAINT equipo_estado_miembro_check
  CHECK (estado_miembro IN ('Activx', 'Ausente', 'Técnico', 'Lesionadx', 'De viaje'));

-- 3) Desactivación automática -- mismo cron de cada 30 min
-- (`marcar-eventos-finalizados`). Cuerpo idéntico a la definición viva en
-- producción (pg_get_functiondef, 2026-09-25) + el UPDATE nuevo al
-- principio, que corre SIEMPRE (no depende de que haya eventos recién
-- finalizados). "Pasado" = viaje_hasta ANTERIOR a hoy en Ecuador: el
-- último día del viaje todavía cuenta como de viaje. Sin viaje_hasta
-- (viaje sin fecha de fin) nunca se desactiva sola.
CREATE OR REPLACE FUNCTION public.marcar_eventos_finalizados_y_recalcular()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  filas_afectadas integer;
  v_cron_secret    text;
BEGIN
  -- Fin de viaje: De viaje -> Activx, limpiando el período.
  UPDATE equipo
  SET estado_miembro = 'Activx', viaje_desde = NULL, viaje_hasta = NULL
  WHERE estado_miembro = 'De viaje'
  AND viaje_hasta IS NOT NULL
  AND viaje_hasta < (NOW() AT TIME ZONE 'America/Guayaquil')::date;

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
$function$;
