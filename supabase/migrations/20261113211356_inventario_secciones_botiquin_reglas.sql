-- Inventario reorganizado (Victor, 2026-11-13).
-- Secciones: equipamiento deportivo (con talla o sets), insumos de
-- entrenamiento, botiquín y misceláneos. Cada lista se puede ocultar.
alter table public.inventario_listas
  add column if not exists seccion text not null default 'equipamiento' check (seccion in ('equipamiento', 'entrenamiento', 'botiquin', 'miscelaneo')),
  add column if not exists activa boolean not null default true;
update public.inventario_listas set seccion = case tipo when 'unidades' then 'entrenamiento' when 'insumo' then 'miscelaneo' else 'equipamiento' end
  where seccion = 'equipamiento' and tipo in ('unidades', 'insumo');

-- Botiquín: cada insumo con vencimiento y mínimo para reponer.
alter table public.inventario_stock
  add column if not exists vence date,
  add column if not exists minimo numeric;

-- Lo que se usó del botiquín o de los insumos (para saber qué reponer).
create table if not exists public.inventario_usos (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.inventario_listas(id) on delete cascade,
  variante text not null default '',
  cantidad numeric not null default 1,
  username text,
  nota text,
  created_at timestamptz not null default now()
);
alter table public.inventario_usos enable row level security;
revoke all on public.inventario_usos from anon, authenticated;
grant select, insert, update, delete on public.inventario_usos to service_role;

-- Plazo de un préstamo: el mismo día, hasta una fecha o indefinido con
-- recordatorio cada N días.
alter table public.inventario_prestamos
  add column if not exists plazo text check (plazo in ('dia', 'fecha', 'indefinido')),
  add column if not exists recordar_cada_dias int;

-- Reglas de préstamo por equipo (como la asistencia anticipada): si se
-- presta, solo en casos excepcionales (pedido que aprueba un Pivot) o no;
-- por fechas o indefinidas; la más específica gana.
create table if not exists public.inventario_reglas (
  id uuid primary key default gen_random_uuid(),
  equipo text,                -- nombre del equipo (config_tiers.nombre) o null = todos
  presta text not null check (presta in ('si', 'excepcional', 'no')),
  lista_id uuid references public.inventario_listas(id) on delete cascade, -- null = todo el equipamiento
  desde date,
  hasta date,
  activa boolean not null default true,
  nota text,
  creada_por text,
  created_at timestamptz not null default now()
);
alter table public.inventario_reglas enable row level security;
revoke all on public.inventario_reglas from anon, authenticated;
grant select, insert, update, delete on public.inventario_reglas to service_role;
