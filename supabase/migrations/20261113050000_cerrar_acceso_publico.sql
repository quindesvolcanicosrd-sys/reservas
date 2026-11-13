-- Revisión de permisos de lectura (Victor aprobó, 2026-11-12).
-- Con la clave pública (que va dentro de la web) se podían leer y cambiar
-- tablas enteras: sesiones de personas y de Pivots (tokens), pagos,
-- ingresos, egresos, reservas, tareas, configuración... La API (Edge
-- Function) usa la clave de servicio y no depende de estas políticas.
-- Quedan para la clave pública solo los accesos directos que usan la web y
-- la app hoy: asistencias (leer, crear, actualizar), log_asistencias (leer),
-- reglas_asistencia (leer, crear, borrar), temporadas_descanso (leer) y
-- venues (leer, crear, actualizar).

-- Sesiones y configuración: nada para la clave pública.
drop policy if exists allow_all_admin_sessions on public.admin_sessions;
drop policy if exists allow_all_select_sessions on public.sessions;
drop policy if exists allow_all_delete_sessions on public.sessions;
drop policy if exists allow_all_insert_sessions on public.sessions;
drop policy if exists allow_all_pin_attempts on public.pin_attempts;
drop policy if exists allow_all_config on public.config_app;

-- Políticas viejas del backend de Google Apps Script (ya no se usa).
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.asignaciones_tareas;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.config_equipamiento;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.config_niveles;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.config_tareas;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.egresos;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.equipamiento_tallas;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.ingresos;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.nivel_actual;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.pagos;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.reservas;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.solicitudes_pago;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.tareas;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.tareas_recurrentes;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.asistencias;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.log_asistencias;
drop policy if exists "Acceso del backend de Mirlxs (GAS)" on public.venues;

-- Lo que sí usan la web y la app directamente.
create policy anon_lee_asistencias on public.asistencias for select to anon using (true);
create policy anon_crea_asistencias on public.asistencias for insert to anon with check (true);
-- (se mantiene "anon puede actualizar asistencias")
create policy anon_lee_log_asistencias on public.log_asistencias for select to anon using (true);
create policy anon_lee_venues on public.venues for select to anon using (true);
-- (se mantienen insertar y actualizar venues; borrar va por la API)
drop policy if exists "anon puede borrar venues" on public.venues;
-- temporadas_descanso: solo leer (se guardan y borran por la API)
drop policy if exists all_anon on public.temporadas_descanso;
drop policy if exists delete_anon on public.temporadas_descanso;

-- Además, sin permisos de tabla para la clave pública en lo sensible.
revoke all on table
  public.admin_sessions, public.sessions, public.pin_attempts, public.config_app, public.admins,
  public.asignaciones_tareas, public.config_equipamiento, public.config_niveles, public.config_tareas,
  public.config_tiers, public.cuota_excepcion, public.dispositivos_push, public.egresos,
  public.equipamiento_tallas, public.equipo, public.historial_tier, public.ingresos, public.invite_tokens,
  public.nivel_actual, public.pagos, public.puntos_mensuales, public.push_enviados,
  public.rectificaciones_asistencia, public.reservas, public.solicitudes_excepcion, public.solicitudes_pago,
  public.tareas, public.tareas_recurrentes
from anon, authenticated;
revoke delete on table public.venues, public.temporadas_descanso, public.asistencias, public.log_asistencias from anon, authenticated;
revoke insert, update on table public.temporadas_descanso, public.log_asistencias from anon, authenticated;
