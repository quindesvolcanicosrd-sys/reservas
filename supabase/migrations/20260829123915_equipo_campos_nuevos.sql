-- Auditoría previa (Cambio 55, ver MANIFEST.md): de los campos que necesita
-- el frontend de Equipo, YA EXISTEN en `equipo` -- nombre_derby, numero_derby,
-- foto_perfil, categoria (rol Quindes/Mirlxs), pronombres, telefono, email,
-- estado_miembro, solicitud_lesion_pendiente. NO existen (y no se agregan acá
-- por no ser necesarios / estar fuera de alcance): un array de "roles"
-- (Jammer/Bloqueadora/etc, nunca tuvo columna real), horas patinadas / % de
-- asistencia (sin ninguna columna que las trackee -- getEquipo() los devuelve
-- en 0, ver index.ts), ni un id numérico propio (la tabla se identifica por
-- `username`, natural key ya usada en absolutamente todas las acciones
-- existentes). Solo faltaban estos 2:

-- Tier manual (para el control Quindes/Auto/Mirlxs del perfil de Equipo,
-- Cambio 52/55) -- distinto de `categoria` (el valor actual, recalculado por
-- recalcular-categorias salvo que tier_modo != 'auto', ver ese archivo).
ALTER TABLE equipo
  ADD COLUMN IF NOT EXISTS tier_modo text NOT NULL DEFAULT 'auto'
  CHECK (tier_modo IN ('auto', 'quinde', 'mirlxs'));

-- Exención de cuota por miembro (Cambio 54/55) -- distinto de `paga_cuota`
-- (columna TEXT ya existente, 'sí'/'no', usada únicamente para el
-- `dashboardAdmin` del propio ADMIN cuando no pagó su propia cuota, ver
-- loginGoogle()/adminLogin() en supabase/functions/api/index.ts). Esta es la
-- que corresponde a la exención real por Lesionadx (toggle "Paga cuota" del
-- perfil de Equipo) -- adminSetEstadoMiembro/adminAprobarLesion/
-- recuperarseLesion la mantienen en sync con estado_miembro='Lesionadx'.
ALTER TABLE equipo
  ADD COLUMN IF NOT EXISTS exenta_cuota boolean NOT NULL DEFAULT false;
