-- Feature nueva (pedido explícito de Victor): wizard de registro manual de
-- pagos (Mi Liga, solo admin) — reusa la tabla `pagos` YA existente (mismo
-- criterio que ya usa el sheet simple "Registrar pago",
-- `adminRegistrarPago()`/supabase/functions/api/index.ts) en vez de crear
-- una tabla nueva -- `notas` ya existía; se suman los 2 campos que pedía el
-- pedido explícitamente ("flag de si fue manual o automático") más
-- `id_evento` para poder trazar un pago tipo 'clase' hasta el evento real.
--
-- `tipo`: 'mensual' (cuota, como hasta ahora) o 'clase' (pago de una clase
-- puntual, nuevo con este wizard) -- default 'mensual' para no romper las
-- filas ya existentes (100% cuota hasta hoy) ni el sheet simple actual, que
-- nunca manda este campo.
-- `es_manual`: default `true` porque HOY el 100% de las filas de `pagos` se
-- originan en una acción admin manual (no hay ningún flujo automático de
-- pago que inserte acá todavía) -- deja la puerta abierta a un futuro
-- origen automático sin tocar el schema de nuevo.
-- `id_evento`: SOLO se completa para `tipo='clase'` -- texto libre (mismo
-- tipo que `asistencias.id_evento`, sin FK: un evento puede regenerarse/
-- excepcionarse, y este campo es puramente informativo/trazabilidad, no
-- necesita integridad referencial dura para esta feature).
alter table pagos
  add column if not exists tipo text not null default 'mensual',
  add column if not exists es_manual boolean not null default true,
  add column if not exists id_evento text;

alter table pagos drop constraint if exists pagos_tipo_check;
alter table pagos add constraint pagos_tipo_check check (tipo in ('mensual', 'clase'));
