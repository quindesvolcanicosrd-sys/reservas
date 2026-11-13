-- Dónde dice la persona que pagó (Victor, 2026-11-13): para que el Pivot
-- sepa dónde revisar (DeUna, transferencia bancaria…).
alter table public.reservas add column if not exists medio_pago text;
