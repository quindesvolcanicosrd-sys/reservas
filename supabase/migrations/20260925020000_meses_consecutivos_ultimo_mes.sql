-- Bug real corregido (ver MANIFEST.md -- "meses_consecutivos_cumplidos sumaba
-- 1 por corrida"): recalcular-categorias corre varias veces por mes (cron
-- `marcar-eventos-finalizados` cada vez que termina un evento, "Recalcular
-- ahora", modo soloUsuario de "De viaje") y sumaba 1 al contador de
-- re-ascenso en CADA corrida -- con meses_consecutivos_ascenso=3, alguien
-- podía subir de tier en ~3 entrenamientos en vez de 3 meses. Confirmado en
-- producción el 2026-09-25: 6 Quindes con el contador en 13 a 15 días de
-- existir la columna.
--
-- Fix: la Edge Function solo suma si el mes actual ('YYYY-MM') es distinto
-- de `meses_consecutivos_ultimo_mes`, y guarda ahí el mes contado.
--
-- Revisión previa al reset (2026-09-25, solo lectura): ninguna Quindes
-- actual subió por este bug -- las 8 ya eran Quindes en la primera corrida
-- con contador (historial_tier 2026-09, 2026-09-11 04:08 UTC, todos los
-- contadores en 0, imposible ascender con umbral 3). No hace falta corregir
-- tiers a mano.
--
-- Tabla real: `equipo` (no existe una tabla `jugadoras`).
-- Aplicar vía `supabase db query --linked -f <archivo>` (`supabase db push`
-- sigue roto en este repo, ver MANIFEST.md). Deployar recalcular-categorias
-- DESPUÉS de aplicar esto (la función nueva lee/escribe la columna).

ALTER TABLE public.equipo ADD COLUMN IF NOT EXISTS meses_consecutivos_ultimo_mes text;

-- Reset: los valores actuales están inflados por el bug, no representan meses.
UPDATE public.equipo SET meses_consecutivos_cumplidos = 0, meses_consecutivos_ultimo_mes = NULL;
