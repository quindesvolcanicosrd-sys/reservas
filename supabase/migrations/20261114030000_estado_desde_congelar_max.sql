-- Estados que congelan con máximo (Mi Liga → Reglas, Victor 2026-11-13).
-- Aditiva: `estado_desde` (desde cuándo tiene el estado actual) y
-- `estado_max_avisado_en` (ya se avisó que se cumplió el máximo).
-- Los estados actuales empiezan a contar desde hoy (De viaje: desde
-- viaje_desde si existe), así nada cambia hacia atrás.
alter table equipo add column if not exists estado_desde date;
alter table equipo add column if not exists estado_max_avisado_en timestamptz;

update equipo
   set estado_desde = case when estado_miembro = 'De viaje' and viaje_desde is not null then viaje_desde
                           else (now() at time zone 'America/Guayaquil')::date end
 where estado_desde is null;

create or replace function equipo_estado_desde() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.estado_desde := coalesce(new.estado_desde, (now() at time zone 'America/Guayaquil')::date);
  elsif new.estado_miembro is distinct from old.estado_miembro then
    new.estado_desde := (now() at time zone 'America/Guayaquil')::date;
    new.estado_max_avisado_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_equipo_estado_desde on equipo;
create trigger trg_equipo_estado_desde before insert or update of estado_miembro on equipo
  for each row execute function equipo_estado_desde();
