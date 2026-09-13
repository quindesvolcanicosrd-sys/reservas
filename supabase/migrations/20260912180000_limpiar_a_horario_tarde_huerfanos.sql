-- Complemento de 20260912170000_limpiar_huerfanos_usuarios_eliminados.sql:
-- esa migración limpió log_asistencias/puntos_mensuales/pagos/
-- asignaciones_tareas/reservas/nivel_actual, pero NUNCA tocó las columnas
-- legado `asistencias.a_horario`/`tarde` (texto CSV de nombres, fallback de
-- `fuenteAsistencia` en getEventosRango() cuando un evento no tiene marca
-- real de admin en log_asistencias, ver MANIFEST.md sección 3 `asistencias`).
--
-- Victor reportó que el usuario eliminado seguía apareciendo como
-- "A horario"/asistencia en eventos DESPUÉS de que 20260912170000 se corriera
-- -- confirmado contra la DB real (`supabase db query --linked`, solo
-- lecturas) que la causa real era esta: "Victor" (cuenta vieja eliminada,
-- distinta del admin actual "Vic") seguía en `a_horario` de 3 eventos de
-- agosto 2026 (`ev_20260819_cci`, `ev_20260817_cci`, `ev_20260815_cumanda`)
-- y "Ale Lora" en `tarde` de 2 eventos (`ev_20260819_cci`, `ev_20260812_cci`)
-- -- exactamente los mismos 2 usuarios que 20260912170000 ya identificaba
-- como huérfanos reales en log_asistencias/puntos_mensuales.
--
-- Fix: quita solo el nombre puntual de cada CSV (regexp_replace acotado por
-- comas a ambos lados, para no matchear substrings de otros nombres), sin
-- tocar al resto de asistentes de esas filas. Ya aplicado a mano contra
-- producción (`supabase db query --linked -f`) y verificado con 0 filas
-- restantes que mencionen a ninguno de los 2 -- esta migración documenta esa
-- limpieza para que quede trazada en git y se replique en cualquier otro
-- entorno. Idempotente -- correrla de nuevo no cambia nada (los nombres ya
-- no están en esas columnas).
update asistencias
set a_horario = trim(both ', ' from regexp_replace(', ' || a_horario || ', ', ',\s*(Victor|Ale Lora)\s*,', ',', 'g'))
where a_horario ilike '%Victor%' or a_horario ilike '%Ale Lora%';

update asistencias
set tarde = trim(both ', ' from regexp_replace(', ' || tarde || ', ', ',\s*(Victor|Ale Lora)\s*,', ',', 'g'))
where tarde ilike '%Victor%' or tarde ilike '%Ale Lora%';
