-- Asistencia anticipada "Por meses": los meses pasan a guardarse como aaaamm
-- (202611) para poder elegir 12 meses desde el actual (2026-11-07). Las
-- reglas viejas (1..12) se convierten con el año en que se crearon (o el
-- siguiente, si el mes ya había pasado al crearla).
update public.reglas_asistencia r
set meses = (
  select jsonb_agg(
    case when (m::int) > 12 then m::int
         else (extract(year from r.created_at)::int
               + case when (m::int) < extract(month from r.created_at)::int then 1 else 0 end) * 100 + m::int
    end order by m::int)
  from jsonb_array_elements_text(r.meses) m
)
where r.tipo_rango = 'meses' and jsonb_typeof(r.meses) = 'array' and jsonb_array_length(r.meses) > 0;
