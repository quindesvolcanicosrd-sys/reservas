-- Temporadas de descanso (2026-11-06): al crear una, los eventos de esas
-- fechas se eliminan (soft-delete) y quedan marcados con la temporada que los
-- eliminó, para poder devolverlos si la temporada se borra o se acorta.
alter table public.asistencias add column if not exists eliminado_por_descanso uuid;
create index if not exists asistencias_eliminado_por_descanso_idx on public.asistencias (eliminado_por_descanso) where eliminado_por_descanso is not null;
