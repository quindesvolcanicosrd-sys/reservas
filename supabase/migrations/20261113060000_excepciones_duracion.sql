-- Excepciones de cuota con duración (Victor aprobó, 2026-11-12): el Pivot
-- decide al aprobar cuánto dura (este mes, hasta un mes o indefinida) y
-- puede cancelarla; al cancelar dura hasta el fin del mes en curso.
alter table public.solicitudes_excepcion
  add column if not exists vigente_hasta text,          -- 'AAAA-MM'; null = indefinida
  add column if not exists indefinida boolean not null default false,
  add column if not exists efecto text,                 -- 'media' | 'exenta'
  add column if not exists cancelada_en timestamptz;

-- Las aprobadas que ya existen quedan hasta su mes (por ahora, este mes).
update public.solicitudes_excepcion
   set vigente_hasta = mes_aplicacion,
       efecto = case when tipo = 'ausencias' then 'media' else efecto end
 where estado = 'aprobada' and vigente_hasta is null and not indefinida;
