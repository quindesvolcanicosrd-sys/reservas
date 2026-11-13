-- Tesorería (HOJA_DE_RUTA etapa 5, aprobada por Victor 2026-11-13). Solo tablas
-- nuevas: no cambia ni borra pagos existentes. Corregir = anular y volver a registrar.
-- (Copia de la migración aplicada con MCP; ver el texto completo en Supabase.)
create table if not exists public.tesoreria_cuentas (
  id uuid primary key default gen_random_uuid(), nombre text not null,
  tipo text not null default 'otro' check (tipo in ('efectivo', 'deuna', 'banco', 'otro')),
  responsable text, saldo_inicial numeric not null default 0, fecha_inicial date not null default current_date,
  activa boolean not null default true, orden int not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.tesoreria_movimientos (
  id uuid primary key default gen_random_uuid(), fecha date not null default current_date,
  tipo text not null check (tipo in ('ingreso', 'egreso', 'transferencia')), monto numeric not null check (monto > 0),
  cuenta_id uuid references public.tesoreria_cuentas(id), cuenta_destino_id uuid references public.tesoreria_cuentas(id),
  categoria text not null default 'otro', descripcion text, persona text, persona_nombre text,
  origen text not null default 'manual', origen_id text, comprobante_url text, registrado_por text,
  anulado boolean not null default false, anulado_por text, anulado_en timestamptz, motivo_anulacion text,
  reemplaza_id uuid references public.tesoreria_movimientos(id), created_at timestamptz not null default now()
);
create index if not exists tesoreria_movimientos_fecha on public.tesoreria_movimientos (fecha desc);
create index if not exists tesoreria_movimientos_origen on public.tesoreria_movimientos (origen, origen_id);
create table if not exists public.tesoreria_conciliaciones (
  id uuid primary key default gen_random_uuid(), cuenta_id uuid not null references public.tesoreria_cuentas(id),
  fecha date not null default current_date, saldo_real numeric not null, saldo_app numeric not null, diferencia numeric not null,
  nota text, por text, created_at timestamptz not null default now()
);
create table if not exists public.saldos_movimientos (
  id uuid primary key default gen_random_uuid(), username text not null, persona_nombre text,
  fecha date not null default current_date, monto numeric not null, concepto text not null,
  tipo text not null default 'cargo' check (tipo in ('cargo', 'abono', 'prestamo', 'a_favor', 'aplicado')),
  aplicar text not null default 'aparte' check (aplicar in ('aparte', 'con_cuota', 'cuotas')), monto_por_cuota numeric,
  movimiento_id uuid references public.tesoreria_movimientos(id), anulado boolean not null default false, anulado_por text, por text,
  created_at timestamptz not null default now()
);
create index if not exists saldos_movimientos_username on public.saldos_movimientos (username);
create table if not exists public.fondos_viaje (
  id uuid primary key default gen_random_uuid(), nombre text not null, monto numeric not null check (monto >= 0), fecha date,
  ventana_desde date not null, ventana_hasta date not null,
  tramos jsonb not null default '[{"min":90,"pct":50},{"min":35,"pct":50}]'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'repartido')), creado_por text, created_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['tesoreria_cuentas','tesoreria_movimientos','tesoreria_conciliaciones','saldos_movimientos','fondos_viaje'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
insert into public.config_app (key, value) values ('tesoreria_transparencia', 'false') on conflict (key) do nothing;
