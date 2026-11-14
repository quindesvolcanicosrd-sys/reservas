-- Saldo al pagar la cuota (Victor 2026-11-13: preguntarle a la persona al pagar).
-- Aditiva. `saldo_aplicado`: positivo = saldo a favor que se usó como
-- descuento; negativo = deuda que se paga junto con la cuota. Se registra en
-- `saldos_movimientos` solo cuando un Pivot confirma la reserva.
alter table reservas add column if not exists saldo_aplicado numeric(12,2);
alter table reservas add column if not exists saldo_movimiento_id uuid;
