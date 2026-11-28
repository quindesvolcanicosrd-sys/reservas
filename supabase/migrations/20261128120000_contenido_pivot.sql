-- Contenido general de Pivot que no es de ninguna liga (Victor, 2026-11-28):
-- el reglamento de roller derby ya procesado y las marcas del aviso de WFTDA.
-- Solo el servidor (service role) lee y escribe.
create table if not exists public.contenido_pivot (
  clave text primary key,
  valor jsonb not null,
  version text,
  actualizado_en timestamptz not null default now()
);
alter table public.contenido_pivot enable row level security;
revoke all on public.contenido_pivot from anon, authenticated;
