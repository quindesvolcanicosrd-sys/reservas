-- Roles en el equipo guardados en la base (antes solo en el navegador) y país del equipo (2026-11-07).
alter table public.equipo add column if not exists roles text[] not null default '{}';
insert into public.config_app (key, value) values ('pais_equipo', 'EC') on conflict (key) do nothing;
