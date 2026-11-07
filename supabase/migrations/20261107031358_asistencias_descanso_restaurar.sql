-- Para devolver un evento eliminado por una temporada de descanso tal como
-- estaba (si la temporada se borra o se acorta) se guarda su estado previo.
alter table public.asistencias add column if not exists estado_antes_descanso text;
alter table public.asistencias add column if not exists excepcion_antes_descanso boolean;

-- La protección de excepciones (20260821) rechaza bajar es_excepcion a false.
-- Excepción única: devolver un evento que eliminó una temporada de descanso
-- (se limpia eliminado_por_descanso en el mismo UPDATE).
create or replace function fn_proteger_asistencia_excepcion()
returns trigger as $$
begin
  if old.eliminado_por_descanso is not null and new.eliminado_por_descanso is null then
    return new;
  end if;
  if old.es_excepcion = true and (new.es_excepcion is null or new.es_excepcion = false) then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;
