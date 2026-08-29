-- Stats reales de Equipo (Cambio 58, ver MANIFEST.md) -- reemplazan los
-- horasPatinadas/asistenciaPct en 0 que devolvía getEquipo() desde el
-- Cambio 55 (sin ninguna columna real que los trackee hasta ahora).
-- Pobladas por recalcularStatsEquipo() (supabase/functions/api/index.ts),
-- invocada desde Mi Liga → Categorías y al final de
-- recalcular-categorias/index.ts.
ALTER TABLE equipo
  ADD COLUMN IF NOT EXISTS horas_ano float NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asistencias_ano integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_eventos_ano integer NOT NULL DEFAULT 0;
