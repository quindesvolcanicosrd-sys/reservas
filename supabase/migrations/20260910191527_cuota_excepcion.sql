-- Excepciones de cuota (feat nueva, admin) -- permite a un admin marcar a
-- una persona Quindes o Mirlxs como exenta de pagar un mes puntual, o
-- registrar que ya pagó ese mes por fuera del sistema de reservas
-- mensuales (`reservas`/tipo `'mensual'`) -- ej. pago en efectivo, acuerdo
-- puntual, etc. Tabla propia, sin tocar `reservas`/`reservas.tipo='mensual'`
-- ni la lógica de `_evMesPagado()`/`_evTieneCuotaAlDia()` existente -- ver
-- js/eventos.js, que la consulta ANTES de esa lógica (gana si hay
-- excepción, sin reemplazar el resto del flujo).
--
-- `id_miembro` (no `nombre`/`username` a secas, ver el resto del esquema)
-- -- mismo criterio que `invite_tokens.username` (migración
-- 20260903_invite_tokens.sql): `equipo.username` es la PK real de esa
-- tabla, FK directa en vez de duplicar el dato.
--
-- `mes` como texto 'aaaa-mm' (no una columna `date`) -- mismo criterio
-- liviano que ya usa el resto de este archivo para agrupar por mes
-- calendario (`e.fecha.substring(0,7)` en `_quindesGraciaAgotada()`, js/eventos.js)
-- en vez de manejar rangos de fecha real -- una excepción es por mes
-- calendario completo, no por rango de días.
--
-- `tipo` -- 'pago' (alguien registra que esta persona ya pagó ese mes,
-- monto opcional informativo) o 'exenta' (no debe pagar ese mes, sin
-- monto). Un tercer estado ("sin excepción") es simplemente la AUSENCIA de
-- fila para ese (id_miembro, mes) -- no un valor de `tipo`.
--
-- Índice único (id_miembro, mes) -- como pidió Victor, además de servir de
-- índice de búsqueda rápida, garantiza como MÁXIMO 1 excepción por persona
-- por mes -- guardarExcepcionCuota() (Edge Function) hace upsert sobre esa
-- misma combinación (`onConflict: 'id_miembro,mes'`), nunca duplica filas.
create table if not exists cuota_excepcion (
  id uuid primary key default gen_random_uuid(),
  id_miembro text not null references equipo(username),
  mes text not null, -- formato 'aaaa-mm'
  tipo text not null check (tipo in ('pago', 'exenta')),
  monto numeric, -- solo si tipo = 'pago', puede ser null
  notas text,
  creado_en timestamptz default now()
);

create unique index if not exists cuota_excepcion_miembro_mes_idx on cuota_excepcion (id_miembro, mes);

-- RLS: bloqueada por completo a anon/authenticated, mismo criterio que
-- `equipo`/`invite_tokens` (ver 20260830_equipo_rls.sql/20260903_invite_tokens.sql)
-- -- toda lectura/escritura real pasa por la Edge Function
-- (listarExcepcionesCuota/guardarExcepcionCuota, service_role, bypasea
-- RLS). Sin esto, la anon key (pública, embebida en el cliente) podría
-- leer/escribir esta tabla directo vía PostgREST -- expondría quién pagó
-- qué monto y quién tiene una exención, y permitiría a cualquiera
-- otorgarse una exención propia.
alter table cuota_excepcion enable row level security;

grant all on table cuota_excepcion to service_role;
