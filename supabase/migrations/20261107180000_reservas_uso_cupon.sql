-- Qué reserva usó el cupón (2026-11-07): al cancelarla con al menos 1 hora
-- de anticipación el cupón vuelve a la persona.
alter table public.reservas add column if not exists uso_cupon boolean not null default false;
