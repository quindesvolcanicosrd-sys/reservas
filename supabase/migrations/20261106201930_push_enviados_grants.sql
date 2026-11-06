-- push_enviados: permisos explícitos.
--
-- Bug real (2026-11-06): este proyecto NO da privilegios por defecto sobre
-- tablas nuevas -- service_role (el que usa la Edge Function) solo tenía
-- TRUNCATE/REFERENCES/TRIGGER, así que la lectura y escritura de
-- push_enviados fallaban en silencio y cronRecordatorio1Dia() reenvió el
-- recordatorio. Regla para tablas nuevas: siempre GRANT explícito a
-- service_role (y revocar a anon/authenticated si no se exponen).

revoke all on public.push_enviados from anon, authenticated;
grant select, insert, update, delete on public.push_enviados to service_role;
