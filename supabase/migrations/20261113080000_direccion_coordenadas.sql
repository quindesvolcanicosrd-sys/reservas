-- Pin de la dirección (Victor aprobó, 2026-11-12): se guarda el punto
-- exacto para que el mapa lo muestre donde la persona lo puso.
alter table public.equipo
  add column if not exists direccion_lat double precision,
  add column if not exists direccion_lng double precision;
