-- Asistencia externa (adminRegistrarAsistenciaExterna, supabase/functions/api/index.ts):
-- una jugadora entrenó con otro equipo y un admin lo registra a mano. La fila
-- vive en log_asistencias con origen='Externa' (estado 'A tiempo', id_evento
-- 'ext_<uuid>' sin fila en asistencias) -- esta columna guarda el "¿Dónde
-- entrenó?" opcional. NULL en todas las filas existentes (Usuario/
-- AsistenciaAnticipada/Admin nunca la usan).
ALTER TABLE public.log_asistencias ADD COLUMN IF NOT EXISTS lugar_externo text;
