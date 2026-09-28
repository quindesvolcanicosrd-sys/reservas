-- Cron que transiciona asistencias.estado a 'Evento Finalizado' cuando ya
-- pasó la hora de fin del evento. Cierra el gap real documentado en
-- MANIFEST.md (Bug 13): desde que la generación de eventos se migró a
-- pg_cron (regenerar_ventana_asistencias(), migración 20260828), nada
-- transicionaba el estado -- los eventos quedaban en 'Evento Programado'
-- para siempre aunque ya hubieran pasado. recalcularStatsEquipo()/
-- recalcularStatsUsuario()/recalcular-categorias() ya NO dependen de este
-- estado (usan fecha < hoy directo, ver ese fix) -- este cron es para que
-- la columna `estado` en sí sea correcta de cara al resto de la app
-- (timeline, rollcall admin, etc.), no un prerequisito de los stats.
--
-- Timezone verificado antes de escribir esto (no asumido): la base corre
-- en UTC (`current_setting('TIMEZONE')`); `asistencias.fecha`/`.inicia`/
-- `.termina` se guardan en hora LOCAL de Ecuador, sin componente de zona
-- (ver comentario "Ecuador = UTC-5" en supabase/functions/api/index.ts) --
-- por eso la comparación conviene hacerla en naive-local, no en UTC:
-- `(fecha + termina)::timestamp` (naive, hora Ecuador) contra
-- `NOW() AT TIME ZONE 'America/Guayaquil'` (también naive, NOW() real
-- convertido a hora de pared Ecuador). Ecuador no tiene horario de verano
-- -- UTC-5 fijo todo el año, `America/Guayaquil` no necesita reglas de DST.
--
-- '*/30 * * * *' -- cada 30 min, mismo criterio que pidió Victor
-- (precisión de "ya terminó" no necesita ser al minuto). Nombre con
-- guiones, mismo estilo que el cron ya existente
-- ('regenerar-ventana-asistencias', cada 15 min).
--
-- cron.schedule() con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- esta migración es segura de correr más de una vez.
SELECT cron.schedule(
  'marcar-eventos-finalizados',
  '*/30 * * * *',
  $$
  UPDATE asistencias
  SET estado = 'Evento Finalizado'
  WHERE estado = 'Evento Programado'
  AND (fecha + termina)::timestamp < NOW() AT TIME ZONE 'America/Guayaquil'
  $$
);
