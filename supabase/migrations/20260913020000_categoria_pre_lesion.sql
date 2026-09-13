-- Tier previo a una lesión, para restaurarlo al volver a Activx en vez de
-- recalcularlo desde un historial reciente que puede estar vacío por la
-- ausencia (ver adminSetEstadoMiembro/supabase/functions/api/index.ts).
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS categoria_pre_lesion TEXT;
