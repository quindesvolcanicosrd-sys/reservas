-- Motivo obligatorio en Asistencia anticipada (modelo de autodeclaración, ver
-- MANIFEST.md): una regla "No asistiré" lleva el motivo que la persona
-- declara ('De viaje' / 'Lesionadx' / 'Inactivx'), que además cambia su
-- `equipo.estado_miembro` vía la acción `autodeclararEstado` (Edge Function).
-- Con 'Asistiré'/'No jugador' el motivo no aplica y queda NULL.
--
-- Aplicar vía `supabase db query --linked -f <archivo>` (mismo workaround
-- documentado en MANIFEST.md para las migraciones posteriores a 20260831).

ALTER TABLE public.reglas_asistencia ADD COLUMN IF NOT EXISTS motivo text;

-- Reglas "No asistiré" creadas antes de este cambio: no tenían motivo y
-- nunca cambiaron el estado de nadie -- 'Inactivx' es el equivalente exacto
-- de ese comportamiento para la categoría ("sigue las reglas normales de
-- asistencia"). Solo se completa la columna; NO se toca `equipo`.
UPDATE public.reglas_asistencia SET motivo = 'Inactivx'
  WHERE estado = 'No asistiré' AND motivo IS NULL;

ALTER TABLE public.reglas_asistencia DROP CONSTRAINT IF EXISTS reglas_asistencia_motivo_check;
ALTER TABLE public.reglas_asistencia ADD CONSTRAINT reglas_asistencia_motivo_check CHECK (
  (estado = 'No asistiré' AND motivo IN ('De viaje', 'Lesionadx', 'Inactivx'))
  OR (estado IS DISTINCT FROM 'No asistiré' AND motivo IS NULL)
);

NOTIFY pgrst, 'reload schema';
