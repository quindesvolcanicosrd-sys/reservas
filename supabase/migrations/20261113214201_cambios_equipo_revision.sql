-- Cambios de equipo con revisión antes de aplicarse (Victor, 2026-11-13).
create table if not exists public.cambios_equipo (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  de text,
  a text not null,
  mes text not null,
  actualizacion jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'auto')),
  resuelto_por text,
  resuelto_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username, mes)
);
alter table public.cambios_equipo enable row level security;
revoke all on public.cambios_equipo from anon, authenticated;
grant select, insert, update, delete on public.cambios_equipo to service_role;
insert into public.config_app (key, value) values ('equipos_corte', '{"modo":"revisar","dia":1,"avisoDias":3}')
  on conflict (key) do nothing;
