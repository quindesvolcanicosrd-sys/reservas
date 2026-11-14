-- Motivo al rechazar una reserva o pago (Victor, 2026-11-13).
alter table public.reservas add column if not exists motivo_rechazo text;
