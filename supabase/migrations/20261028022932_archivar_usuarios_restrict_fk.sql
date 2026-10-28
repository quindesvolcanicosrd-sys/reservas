-- Archivado de usuarios (soft delete) -- pedido explícito, "dejar de perder
-- historial al eliminar usuarios" (ver MANIFEST.md sección push... no, ver
-- sección "Archivado de usuarios"). Ya se perdió el historial de 10 cuentas
-- por esto -- este es el fix de fondo, no un parche más.
--
-- `eliminado_en` (timestamptz, null = cuenta activa) reemplaza al DELETE de
-- la fila de `equipo`: ambos flujos de eliminación (`adminEliminarUsuario`/
-- `eliminarCuenta`, supabase/functions/api/index.ts) pasan a hacer
-- `UPDATE equipo SET eliminado_en = now(), eliminado_por = ...` en vez de
-- `DELETE` -- la fila (y todo lo que referencia su `username`) nunca más se
-- borra. `eliminado_por` ('admin' | 'usuario') distingue quién archivó --
-- determina si la cuenta se puede "Restaurar" después (admin: sí, propia
-- persona: no, ver Mi Liga → Usuarios) y si se le vaciaron datos personales
-- (solo si `eliminado_por = 'usuario'`).
ALTER TABLE public.equipo ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;
ALTER TABLE public.equipo ADD COLUMN IF NOT EXISTS eliminado_por text;

-- Las 12 FK reales de `equipo(username)` con `ON DELETE CASCADE` que agregó
-- `20260912120000_cascade_delete_usuario.sql` pasan a `ON DELETE RESTRICT`:
-- con la fila de `equipo` nunca borrándose desde la app, esta FK solo
-- importa como red de seguridad contra un DELETE manual/accidental (SQL
-- Editor, un bug futuro) -- RESTRICT lo hace fallar en vez de arrastrarse
-- el historial de pagos/asistencias/puntos de esa persona. Se preserva el
-- `NOT VALID` donde ya estaba (6 tablas con huérfanos históricos de ANTES
-- de que esta FK existiera, confirmado contra `pg_constraint.convalidated`
-- real -- no se vuelven a validar acá, sigue siendo decisión deliberada de
-- no tocar esos huérfanos, ver `20260912170000`/`20260912180000`/
-- `20260912200000`). `sessions`/`invite_tokens` (2 FK más que SÍ tienen
-- CASCADE hacia `equipo`, confirmado contra `pg_constraint` real) se dejan
-- como están -- no son historial, cascadear ahí nunca borra nada que haya
-- que proteger.

ALTER TABLE public.historial_tier DROP CONSTRAINT historial_tier_username_fkey;
ALTER TABLE public.historial_tier ADD CONSTRAINT historial_tier_username_fkey
  FOREIGN KEY (username) REFERENCES public.equipo(username) ON DELETE RESTRICT;

ALTER TABLE public.cuota_excepcion DROP CONSTRAINT cuota_excepcion_id_miembro_fkey;
ALTER TABLE public.cuota_excepcion ADD CONSTRAINT cuota_excepcion_id_miembro_fkey
  FOREIGN KEY (id_miembro) REFERENCES public.equipo(username) ON DELETE RESTRICT;

ALTER TABLE public.rectificaciones_asistencia DROP CONSTRAINT rectificaciones_asistencia_nombre_fkey;
ALTER TABLE public.rectificaciones_asistencia ADD CONSTRAINT rectificaciones_asistencia_nombre_fkey
  FOREIGN KEY (nombre) REFERENCES public.equipo(username) ON DELETE RESTRICT;

ALTER TABLE public.solicitudes_excepcion DROP CONSTRAINT solicitudes_excepcion_nombre_fkey;
ALTER TABLE public.solicitudes_excepcion ADD CONSTRAINT solicitudes_excepcion_nombre_fkey
  FOREIGN KEY (nombre) REFERENCES public.equipo(username) ON DELETE RESTRICT;

ALTER TABLE public.solicitudes_pago DROP CONSTRAINT solicitudes_pago_nombre_usuario_fkey;
ALTER TABLE public.solicitudes_pago ADD CONSTRAINT solicitudes_pago_nombre_usuario_fkey
  FOREIGN KEY (nombre_usuario) REFERENCES public.equipo(username) ON DELETE RESTRICT;

ALTER TABLE public.pin_attempts DROP CONSTRAINT pin_attempts_username_fkey;
ALTER TABLE public.pin_attempts ADD CONSTRAINT pin_attempts_username_fkey
  FOREIGN KEY (username) REFERENCES public.equipo(username) ON DELETE RESTRICT;

-- Las 6 con huérfanos históricos (NOT VALID -- sin validar contra las filas
-- ya existentes, mismo criterio que la migración original).
ALTER TABLE public.log_asistencias DROP CONSTRAINT log_asistencias_nombre_usuario_fkey;
ALTER TABLE public.log_asistencias ADD CONSTRAINT log_asistencias_nombre_usuario_fkey
  FOREIGN KEY (nombre_usuario) REFERENCES public.equipo(username) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.reservas DROP CONSTRAINT reservas_nombre_usuario_fkey;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_nombre_usuario_fkey
  FOREIGN KEY (nombre_usuario) REFERENCES public.equipo(username) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.puntos_mensuales DROP CONSTRAINT puntos_mensuales_nombre_usuario_fkey;
ALTER TABLE public.puntos_mensuales ADD CONSTRAINT puntos_mensuales_nombre_usuario_fkey
  FOREIGN KEY (nombre_usuario) REFERENCES public.equipo(username) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.asignaciones_tareas DROP CONSTRAINT asignaciones_tareas_nombre_usuario_fkey;
ALTER TABLE public.asignaciones_tareas ADD CONSTRAINT asignaciones_tareas_nombre_usuario_fkey
  FOREIGN KEY (nombre_usuario) REFERENCES public.equipo(username) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.pagos DROP CONSTRAINT pagos_nombre_usuario_fkey;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_nombre_usuario_fkey
  FOREIGN KEY (nombre_usuario) REFERENCES public.equipo(username) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.nivel_actual DROP CONSTRAINT nivel_actual_nombre_usuario_fkey;
ALTER TABLE public.nivel_actual ADD CONSTRAINT nivel_actual_nombre_usuario_fkey
  FOREIGN KEY (nombre_usuario) REFERENCES public.equipo(username) ON DELETE RESTRICT NOT VALID;

-- `reglas_asistencia.nombre` -- bug real encontrado el 2026-10-25 (ver
-- MANIFEST.md): SÍ guarda usernames reales, nunca tuvo ninguna FK hacia
-- `equipo`. 0 huérfanos hoy (confirmado), se agrega validada de una.
ALTER TABLE public.reglas_asistencia ADD CONSTRAINT reglas_asistencia_nombre_fkey
  FOREIGN KEY (nombre) REFERENCES public.equipo(username) ON DELETE RESTRICT;
