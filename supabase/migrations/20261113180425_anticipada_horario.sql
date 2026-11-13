-- Asistencia anticipada por horario (Victor, 2026-11-13): la regla aplica
-- solo a eventos que empiezan entre hora_desde y hora_hasta ('HH:MM').
alter table public.reglas_asistencia
  add column if not exists hora_desde text,
  add column if not exists hora_hasta text;
