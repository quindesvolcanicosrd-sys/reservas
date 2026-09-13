-- Bug real corregido (pedido explícito de Victor: "una tarea que venció
-- desaparece completamente de la home de tareas, debe seguir visible con
-- estado Vencida"). Investigación (confirmada contra la DB real vía
-- `supabase db query --linked`, solo lecturas -- `SELECT * FROM cron.job`
-- no tenía NINGÚN job relacionado con `tareas`):
--
-- `getTareasDisponibles()` (supabase/functions/api/index.ts) ya divide las
-- tareas sin cupos llenos en 2 baldes -- "Disponibles" (`estado IN
-- ('no_iniciada','en_progreso')`) y "El Baúl de tareas" (`estado =
-- 'expirada'`, sección propia en `#s-tareas` con su propio acordeón, ver
-- MANIFEST.md sección 1 -- `js/tareas.js`). El Baúl es, literalmente, el
-- estado "Vencida" que pidió Victor: sus cards ya muestran el pill rojo
-- "Venció el DD/MM/AAAA" (`_tarFechaInfo()`) y el botón "Rescatar tarea".
--
-- Pero NADA transicionaba una tarea a `estado='expirada'` cuando pasaba su
-- `fecha_vencimiento` -- ni un cron, ni ninguna acción del backend (`grep`
-- de `'expirada'` en todo el repo: solo aparece LEYENDO ese estado, nunca
-- escribiéndolo). Migración de Puntos y Tareas a GAS→Supabase completa
-- (CHANGELOG.md, "incluye el sistema Baúl de Tareas") migró el READ/WRITE
-- de ida y vuelta del Baúl (`rescatarTarea()`) pero nunca portó el
-- mecanismo que lo alimenta -- el mismo patrón de trigger perdido en la
-- migración que ya se encontró para "recalcular-categorias"/pushes (ver
-- `20260912150000_fix_cron_gateway_auth_api.sql`). Efecto real: una tarea
-- sin tomar que vence se queda en `no_iniciada` para siempre, indistinguible
-- de una tarea sana en "Disponibles" -- de ahí la sensación de "desaparece"
-- que reportó Victor (nunca llega a mostrarse en el Baúl, que es donde el
-- usuario esperaría encontrarla marcada como vencida).
--
-- Fix: cron diario (fecha_vencimiento es `date`, sin hora -- granularidad
-- diaria alcanza, a diferencia de "marcar-eventos-finalizados" que sí
-- necesita los 30min por tener hora de fin real) que transiciona
-- `no_iniciada`/`en_progreso` -> `expirada` una vez que `fecha_vencimiento`
-- ya quedó atrás en hora Ecuador (mismo criterio de zona horaria que
-- `marcar_eventos_finalizados_y_recalcular()`, comentario "Ecuador =
-- UTC-5" -- `America/Guayaquil` no tiene DST). Asignaciones activas
-- (`asignaciones_tareas`, `iniciada`/`pendiente_revision`) de una tarea que
-- pasa a 'expirada' NO se tocan -- siguen viéndose en "Mis tareas" de cada
-- asignadx exactamente igual que antes (ese comportamiento nunca dependió
-- de `tareas.estado`, ver `getMisTareas()`); `rescatarTarea()` ya exige
-- `estado='expirada'` para los cupos que queden libres, sin cambios acá.
--
-- cron.schedule() con un jobname ya existente actualiza ese job en vez de
-- duplicarlo -- misma nota que el resto de estas migraciones, segura de
-- correr más de una vez. Aplicar vía `supabase db query --linked -f
-- <archivo>` (no `supabase db push`, roto en este repo -- ver la nota de
-- infraestructura ya documentada en MANIFEST.md).
SELECT cron.schedule(
  'marcar-tareas-vencidas',
  '0 6 * * *',
  $$
  UPDATE tareas
  SET estado = 'expirada'
  WHERE estado IN ('no_iniciada', 'en_progreso')
  AND fecha_vencimiento < (NOW() AT TIME ZONE 'America/Guayaquil')::date
  $$
);
