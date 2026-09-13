-- Feature nueva (pedido explícito de Victor): tareas recurrentes -- plantillas
-- que generan automáticamente una instancia nueva en `tareas` el día 1 de
-- cada mes (ver `20260912190200_cron_generar_tareas_recurrentes.sql`), sin
-- asignar, disponible para que cualquier miembro la tome -- mismo flujo de
-- toma/aprobación que una tarea normal (ver MANIFEST.md sección 3).
-- Columnas espejo de las que ya colecta el paso 0/1 del wizard de "Nueva
-- tarea" (`js/tareas.js`, `_tarCrearData`) -- título/área/notas/puntos/cupos
-- son comunes a ambos tipos (única/recurrente), solo la plantilla agrega
-- `activa` (para poder pausar la generación mensual sin borrar el historial
-- ya generado).
CREATE TABLE IF NOT EXISTS tareas_recurrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  notas text,
  area text,
  puntos integer NOT NULL DEFAULT 1,
  max_asignados integer NOT NULL DEFAULT 1,
  activa boolean NOT NULL DEFAULT true,
  creado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Traza qué instancia de `tareas` vino de qué plantilla -- usada por el cron
-- mensual para no duplicar la instancia del mes si corre más de una vez
-- (idempotencia, mismo criterio que el resto de los crons de este archivo),
-- y por `adminAplicarTareaRecurrenteHistorico()` (flujo "aplicar a meses
-- anteriores" del wizard, ver supabase/functions/api/index.ts).
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS tarea_recurrente_id uuid REFERENCES tareas_recurrentes(id);

-- Mismo trust boundary que `tareas`/`asignaciones_tareas`/`config_tareas`
-- (RLS habilitado, pero el gate real vive en la Edge Function -- ver
-- MANIFEST.md sección 5): réplica literal de la policy ya existente en esas
-- 3 tablas para no dejar esta como la única del grupo sin ninguna.
ALTER TABLE tareas_recurrentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso del backend de Mirlxs (GAS)" ON tareas_recurrentes
  FOR ALL TO anon USING (true) WITH CHECK (true);
