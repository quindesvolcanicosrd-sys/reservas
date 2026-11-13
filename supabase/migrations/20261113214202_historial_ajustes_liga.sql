-- Historial de ajustes de la liga (se guarda siempre; la app muestra 6 meses).
create table if not exists public.historial_ajustes_liga (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  antes jsonb,
  despues jsonb,
  por text,
  created_at timestamptz not null default now()
);
alter table public.historial_ajustes_liga enable row level security;
revoke all on public.historial_ajustes_liga from anon, authenticated;
grant select, insert on public.historial_ajustes_liga to service_role;
