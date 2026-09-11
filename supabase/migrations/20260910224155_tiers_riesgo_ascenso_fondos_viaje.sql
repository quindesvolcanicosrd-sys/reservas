-- Sistema completo de tiers (Fase 2 completa, ver MANIFEST.md) -- período de
-- prueba/gracia antes de demotar, re-ascenso automático tras N meses
-- consecutivos cumpliendo, puntos "a mitad" para el tier default, y
-- elegibilidad a fondos de viaje. Toda la lógica de evaluación vive en
-- supabase/functions/recalcular-categorias/index.ts (sigue siendo 100%
-- manual, disparada por "Recalcular ahora" en Mi Liga -- no hay cron, ver
-- MANIFEST.md "Cambios recientes" para la investigación completa que
-- confirmó esto antes de tocar nada).

-- ─── PARTE 1: nuevos campos configurables por tier ──────────────────────────
alter table config_tiers
  add column if not exists meses_consecutivos_ascenso integer not null default 3,
  add column if not exists meses_gracia_demotion integer not null default 1,
  add column if not exists dividir_puntos_mitad boolean not null default false,
  add column if not exists califica_fondos_viaje boolean not null default false;

-- Seed real (2 tiers existentes, ver migración 20260823140431_config_tiers.sql):
-- Quindes cuenta puntos completos y da elegibilidad a fondos de viaje;
-- Mirlxs (el tier default/piso) divide los puntos a la mitad y no da
-- elegibilidad -- exactamente como pidió Victor para el seed inicial.
update config_tiers set dividir_puntos_mitad = false, califica_fondos_viaje = true  where nombre = 'Quindes';
update config_tiers set dividir_puntos_mitad = true,  califica_fondos_viaje = false where nombre = 'Mirlxs';

grant all on table config_tiers to service_role;

-- ─── PARTE 2: config global de fondos de viaje ──────────────────────────────
-- `config_app` YA es una tabla clave-valor genérica para configuración
-- global de la liga (ver getPreciosClases()/adminSetPreciosClases(),
-- supabase/functions/api/index.ts -- `precio_por_clase`/`precio_mensual`
-- viven ahí) -- se reusa en vez de crear una `config_liga` nueva, mismo
-- criterio "no dupliques una tabla que ya sirve exactamente para esto".
-- `on conflict do nothing`: no pisa un valor ya editado por un admin si esta
-- migración se corre más de una vez o después de que alguien ya lo cambió.
insert into config_app (key, value) values ('fondos_viaje_meses', '6')
  on conflict (key) do nothing;

-- ─── PARTE 3: historial de tier por miembro por mes ─────────────────────────
-- Fuente de verdad para calcular fondos de viaje (¿estuvo en un tier
-- elegible los últimos N meses SIN interrupción?) y, en general, para poder
-- auditar cambios de categoría en el tiempo. `recalcular-categorias/index.ts`
-- hace upsert de una fila por persona por mes en CADA corrida (no solo
-- cuando el tier cambia -- ver el comentario grande en ese archivo: la
-- consulta de fondos de viaje necesita un registro POR MES, incluso los
-- meses en que el tier se mantuvo igual, para poder confirmar continuidad
-- sin agujeros).
create table if not exists historial_tier (
  id uuid primary key default gen_random_uuid(),
  username text not null references equipo(username),
  mes text not null, -- formato 'aaaa-mm'
  tier_nombre text not null,
  creado_en timestamptz default now()
);
create unique index if not exists historial_tier_username_mes_idx on historial_tier (username, mes);

-- RLS bloqueada por completo a anon/authenticated, mismo criterio que
-- `equipo`/`invite_tokens`/`cuota_excepcion` (ver esas migraciones) -- toda
-- lectura/escritura real pasa por la Edge Function (service_role).
alter table historial_tier enable row level security;
grant all on table historial_tier to service_role;

-- ─── PARTE 4: estado "en riesgo" + contador de re-ascenso en equipo ─────────
-- `tier_riesgo_desde`/`tier_riesgo_hasta`: el período de gracia se computa
-- UNA sola vez, al momento de entrar en riesgo (`tier_riesgo_hasta =
-- tier_riesgo_desde + meses_gracia_demotion del tier ACTUAL en ese momento`)
-- y se guarda ya resuelto -- evita 2 problemas de calcularlo "al vuelo" en
-- cada lectura: (1) necesitaría un JOIN extra contra config_tiers en TODO
-- lugar que exponga esto (login, getEquipo(), etc.), y (2) si un admin
-- cambia `meses_gracia_demotion` a mitad de un período de gracia ya
-- empezado, la fecha límite de alguien que ya está adentro no debería
-- moverse retroactivamente -- congelarla al entrar es más correcto, no solo
-- más simple.
-- `tier_riesgo_objetivo`: a qué tier caería si la gracia vence sin cumplir
-- -- calculado con el mismo algoritmo de siempre (mejor tier que sus
-- clases/puntos actuales SÍ alcanzan) en el momento de entrar en riesgo, y
-- vuelto a calcular fresco recién al ejecutar la demotion real (no se
-- confía en el snapshot viejo para la demotion en sí, solo para mostrarlo
-- en el aviso de la app mientras tanto).
-- `meses_consecutivos_cumplidos`: contador de re-ascenso (Milrxs -> tier
-- superior) Y de ascenso en cadena si hubiera más de 2 tiers -- se resetea a
-- 0 en cualquier mes que NO cumpla el tier relevante (el propio si no es el
-- default, o el tier inmediatamente superior si sí lo es), sin importar si
-- eso implica o no una demotion real.
alter table equipo
  add column if not exists tier_riesgo_desde timestamptz,
  add column if not exists tier_riesgo_hasta timestamptz,
  add column if not exists tier_riesgo_objetivo text,
  add column if not exists meses_consecutivos_cumplidos integer not null default 0;

grant all on table equipo to service_role;
