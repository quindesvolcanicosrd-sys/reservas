-- Reglas de Equipos (Victor, 2026-11-13): qué puntos cuentan (solo tareas o
-- todos), y período y gracia con unidad libre (día, semana, mes, año). Con
-- 'mes' se cuentan meses calendario cerrados (ej. "3 clases al mes").
-- ventana_meses y meses_gracia_demotion pasan a ser la CANTIDAD de esa unidad.
alter table public.config_tiers
  add column if not exists puntos_fuente text not null default 'tareas' check (puntos_fuente in ('tareas', 'todos')),
  add column if not exists periodo_unidad text not null default 'mes' check (periodo_unidad in ('dia', 'semana', 'mes', 'anio')),
  add column if not exists gracia_unidad text not null default 'mes' check (gracia_unidad in ('dia', 'semana', 'mes', 'anio'));

-- Mirlxs tenía ventana 2 por error de carga; no pide mínimo, da igual, pero queda en 1 mes.
update public.config_tiers set ventana_meses = 1 where es_default = true and ventana_meses <> 1;
