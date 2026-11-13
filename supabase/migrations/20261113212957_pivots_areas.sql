-- Pivots y permisos por área (Victor, 2026-11-13). null = todas las áreas
-- (así quedan los Pivots actuales: nada cambia hasta que se edite).
alter table public.admins add column if not exists areas text[];
grant select, insert, update, delete on public.admins to service_role;
