-- Seguridad, último paso (aprobado por Victor, 2026-11-12): la clave pública
-- queda solo para leer. Las escrituras de la web y la app pasan por la API
-- (`escrituraDirecta`), que valida quién escribe.
drop policy if exists "anon puede actualizar asistencias" on public.asistencias;
drop policy if exists anon_crea_asistencias on public.asistencias;
drop policy if exists "anon puede insertar venues" on public.venues;
drop policy if exists "anon puede actualizar venues" on public.venues;
drop policy if exists "anon puede insertar reglas_asistencia" on public.reglas_asistencia;
drop policy if exists "anon puede borrar reglas_asistencia" on public.reglas_asistencia;
revoke insert, update, delete on table public.asistencias, public.venues, public.reglas_asistencia, public.log_asistencias, public.temporadas_descanso from anon, authenticated;
