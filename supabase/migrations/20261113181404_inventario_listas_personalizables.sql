-- Inventario personalizable (Victor, 2026-11-13, aprobado): cada liga crea
-- sus listas de equipamiento (con tallas, sets de piezas, unidades o
-- insumos). "Patines" y "Protecciones" quedan como listas del sistema y se
-- sincronizan con equipamiento_tallas / config_equipamiento (reservas).
create table if not exists public.inventario_listas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('tallas', 'set', 'unidades', 'insumo')),
  icono text,
  piezas jsonb not null default '[]'::jsonb,  -- set: [{"nombre":"Casco","cantidad":1}, ...]
  unidad text,                                 -- insumo: "rollos", "botellas"...
  sistema text unique,                         -- 'patines' | 'protecciones' | null
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.inventario_stock (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.inventario_listas(id) on delete cascade,
  variante text not null default '',           -- talla, pieza o '' (unidades/insumo)
  cantidad numeric not null default 0,
  unique (lista_id, variante)
);

alter table public.inventario_listas enable row level security;
alter table public.inventario_stock enable row level security;
revoke all on public.inventario_listas, public.inventario_stock from anon, authenticated;

-- Préstamos: de qué lista, cuánto, si es permanente y pedidos de uso
-- (una persona de una Categoría/Equipo que no usa equipamiento del equipo
-- lo pide por un tiempo sin bajar de Categoría/Equipo).
alter table public.inventario_prestamos
  add column if not exists lista_id uuid references public.inventario_listas(id) on delete set null,
  add column if not exists variante text,
  add column if not exists cantidad numeric not null default 1,
  add column if not exists piezas jsonb,
  add column if not exists permanente boolean not null default false,
  add column if not exists motivo text,
  add column if not exists tipo text not null default 'salida' check (tipo in ('salida', 'uso')),
  add column if not exists hasta date,
  add column if not exists entrega text check (entrega in ('casa', 'pivot')),
  add column if not exists aviso_persona_en timestamptz;

-- Listas del sistema con lo que ya había.
insert into public.inventario_listas (nombre, tipo, icono, piezas, sistema, orden)
values
  ('Patines', 'tallas', 'patines', '[]'::jsonb, 'patines', 1),
  ('Protecciones', 'set', 'protecciones',
   '[{"nombre":"Casco","cantidad":1},{"nombre":"Coderas","cantidad":2},{"nombre":"Rodilleras","cantidad":2},{"nombre":"Muñequeras","cantidad":2}]'::jsonb,
   'protecciones', 2)
on conflict (sistema) do nothing;

insert into public.inventario_stock (lista_id, variante, cantidad)
select l.id, t.talla, t.cantidad from public.equipamiento_tallas t
join public.inventario_listas l on l.sistema = 'patines'
on conflict (lista_id, variante) do nothing;

insert into public.inventario_stock (lista_id, variante, cantidad)
select l.id, p->>'nombre', coalesce((select total_protecciones from public.config_equipamiento limit 1), 0) * (p->>'cantidad')::numeric
from public.inventario_listas l, jsonb_array_elements(l.piezas) p
where l.sistema = 'protecciones'
on conflict (lista_id, variante) do nothing;
