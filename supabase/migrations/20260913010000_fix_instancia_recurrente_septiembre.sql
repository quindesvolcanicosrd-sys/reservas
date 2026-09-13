-- Fix de datos (incidente real reportado por Victor, mismo día): la
-- plantilla recurrente "Gestionar equipamiento del fresh/mirlxs"
-- (tareas_recurrentes 4f942789-d6a9-4840-975f-588ec6eb655a) se creó hoy
-- (2026-09-13) y terminó con una sola instancia real en `tareas`
-- (75fa9a7d-bc68-4e69-a414-8bd179ab7651) creada vía
-- `adminAplicarTareaRecurrenteHistorico()` ("aplicar a meses anteriores")
-- con mes=enero -- confirmado contra la DB real (`supabase db query
-- --linked`, solo lecturas): `estado='archivada'`, `fecha_vencimiento=
-- '2026-01-31'`, con una asignación YA `estado='aprobada'` para Vic (5
-- puntos acreditados a `puntos_mensuales` de enero 2026).
--
-- Causa raíz (ver el fix de código de esta misma tanda,
-- supabase/functions/api/index.ts): antes de este fix, crear una plantilla
-- recurrente NO generaba ninguna instancia activa hasta el día 1 del mes
-- siguiente (el cron mensual era la única vía) -- la única forma de
-- conseguir algo utilizable el mismo día era el flujo "aplicar a meses
-- anteriores", pensado para meses YA completados (archiva + aprueba +
-- acredita de una), no para "esta activa ahora". De ahí el mes equivocado y
-- el estado archivado en vez de disponible.
--
-- Este fix de datos deja la instancia real como la que debió haber sido
-- generada de una al crear la plantilla (mismo resultado que
-- `adminCrearTareaRecurrente()` produce ahora): revierte los 5 puntos
-- indebidos de Vic en enero, borra la asignación aprobada de más, y
-- convierte la tarea en la instancia activa de septiembre (vencimiento =
-- último día del mes de creación).
--
-- Idempotente -- protegido con el guard de `estado` (si ya se corrigió, el
-- bloque completo se salta, seguro correr más de una vez).
DO $$
DECLARE
  v_tarea_id  uuid := '75fa9a7d-bc68-4e69-a414-8bd179ab7651';
  v_ya_ok     boolean;
BEGIN
  SELECT (estado = 'no_iniciada') INTO v_ya_ok FROM tareas WHERE id = v_tarea_id;

  IF v_ya_ok IS NOT TRUE THEN
    UPDATE puntos_mensuales
    SET puntos_tareas = GREATEST(0, puntos_tareas - 5)
    WHERE nombre_usuario = 'Vic' AND anio = 2026 AND mes = 1;

    DELETE FROM asignaciones_tareas WHERE tarea_id = v_tarea_id;

    UPDATE tareas
    SET estado = 'no_iniciada', fecha_vencimiento = '2026-09-30', fecha_archivado = NULL
    WHERE id = v_tarea_id;
  END IF;
END $$;
