-- Punto extra por pronto pago de la cuota (Victor, octubre 2026): marca de
-- que esta reserva ya dio su punto, para no darlo dos veces y poder
-- descontarlo si la reserva se cancela. Aditiva.
alter table reservas add column if not exists punto_extra_en timestamptz;
