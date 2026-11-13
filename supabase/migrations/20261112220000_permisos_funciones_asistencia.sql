-- Bug real (Victor, 2026-11-12 20:17: "todas las Quindes aparecen inactivas"):
-- la migración 20261112170000 hizo REVOKE ... FROM PUBLIC en las 3 funciones
-- nuevas y la Edge Function (rol service_role) se quedó sin permiso para
-- ejecutarlas. Sin la última asistencia real, todo el equipo quedaba inactivo
-- y las respuestas de los eventos salían vacías. Se da permiso explícito solo
-- a service_role (anon y authenticated siguen sin acceso).
GRANT EXECUTE ON FUNCTION fn_asistencia_vigente_por_evento(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION fn_ultima_asistencia_real_por_usuario() TO service_role;
GRANT EXECUTE ON FUNCTION fn_ultima_marca_admin(text) TO service_role;
