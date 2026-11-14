-- Medios de pago editables: nombre del medio guardado en cada pago; cuentas de Tesorería archivadas (Victor, 2026-11-13).
alter table public.reservas add column if not exists medio_nombre text;
update public.reservas set medio_nombre = case medio_pago when 'deuna' then 'Billetera virtual' when 'transferencia' then 'Transferencia bancaria' when 'efectivo' then 'Efectivo' end
  where medio_nombre is null and medio_pago is not null;
alter table public.tesoreria_cuentas add column if not exists archivada boolean not null default false;
alter table public.tesoreria_movimientos add column if not exists medio_nombre text;
