-- Aprobado por Victor (2026-11-12).
-- 1) Asistencia anticipada por día de la semana o lugar: null = todos.
alter table public.reglas_asistencia
  add column if not exists dias_semana integer[],   -- 1 = lunes … 7 = domingo
  add column if not exists lugares text[];

-- 2) Inventario: quién tiene cosas del equipo. Solo la API (clave de
-- servicio) lee y escribe; la clave pública no tiene acceso.
create table if not exists public.inventario_prestamos (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  articulo text not null,                 -- 'patines' | 'protecciones' | 'otro'
  detalle text,                           -- talla, qué protecciones, etc.
  estado text not null default 'pendiente', -- 'pendiente' | 'activo' | 'devuelto' | 'rechazado'
  pedido_por text not null default 'persona', -- 'persona' | 'pivot'
  desde timestamptz not null default now(),
  devuelto_en timestamptz,
  aprobado_por text,
  aviso_7d_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inventario_prestamos_estado_idx on public.inventario_prestamos (estado, username);
alter table public.inventario_prestamos enable row level security;
revoke all on table public.inventario_prestamos from anon, authenticated;
