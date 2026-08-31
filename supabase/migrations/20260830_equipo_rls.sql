-- Bug de seguridad real: `equipo` no tenía RLS habilitado -- cualquiera con
-- la anon key (pública, embebida en js/config.js, visible en el HTML
-- servido) podía leer la tabla ENTERA vía PostgREST directo
-- (`/rest/v1/equipo`), incluidos datos médicos, documento de identidad,
-- dirección y contactos de emergencia.
--
-- Verificado antes de aplicar (ver MANIFEST.md/CHANGELOG.md) que esto no
-- rompe nada real: getEquipo() corre 100% dentro de
-- supabase/functions/api/index.ts, con `createClient(SUPABASE_URL,
-- SUPABASE_SERVICE_ROLE_KEY)` -- el service role bypasea RLS siempre, sin
-- policy propia. Ningún fetch directo del cliente (anon key, sin pasar por
-- el Edge Function) toca `equipo` -- los únicos que existen apuntan a
-- `temporadas_descanso`/`log_asistencias`/`asistencias`/`reglas_asistencia`/
-- `venues`. Esta app tampoco usa nunca un JWT de Supabase Auth (login es
-- 100% custom vía `sessions`/`admin_sessions`) -- nadie es jamás
-- `authenticated` en el sentido de Postgres, así que esta policy en la
-- práctica cierra el acceso directo por anon key sin abrir ningún acceso
-- nuevo.
ALTER TABLE equipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipo_read_authenticated ON equipo;
CREATE POLICY equipo_read_authenticated ON equipo
  FOR SELECT TO authenticated USING (true);

-- El service role ya bypasea RLS automáticamente, no necesita policy.

-- Hallazgo adicional al verificar (no estaba en el pedido original, más
-- grave que el problema de lectura): la tabla YA tenía 3 policies previas
-- -- `allow_all_insert`/`allow_all_update` (rol `public`, `USING`/`WITH
-- CHECK: true` -- CUALQUIERA con la anon key podía escribir o pisar
-- CUALQUIER fila de `equipo`, no solo leerla) y `public_read_nombres`
-- (rol `public`, `USING: true` -- deja el SELECT tan abierto como antes,
-- pese al nombre, porque RLS filtra FILAS, no columnas: cualquier columna
-- pedida en el `select=` de PostgREST se sigue devolviendo igual).
-- Quedaron dormidas (sin efecto real) mientras RLS estuvo deshabilitado --
-- al activarlo arriba, las 3 pasan a estar VIGENTES, preservando el mismo
-- agujero que se vino a cerrar. Verificado por grep en todo el repo: NADA
-- del frontend (`index.html`, `inscripcion/`, `registro-express/`) hace un
-- fetch directo a `rest/v1/equipo` -- todo lectura/escritura real de esta
-- tabla pasa por getEquipo()/las acciones admin del Edge Function
-- (service role, no le afecta ninguna policy). Sin ningún consumidor
-- legítimo, se borran las 3.
DROP POLICY IF EXISTS allow_all_insert ON equipo;
DROP POLICY IF EXISTS allow_all_update ON equipo;
DROP POLICY IF EXISTS public_read_nombres ON equipo;
