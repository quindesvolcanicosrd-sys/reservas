-- 1) Cambiar el nombre de usuario desde la app (Ajustes → Cuenta y acceso).
-- El username es la llave de casi todo: las FK hacia equipo(username) pasan a
-- ON UPDATE CASCADE y fn_renombrar_usuario actualiza además las columnas que
-- guardan el username sin FK.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabla, c.conname, pg_get_constraintdef(c.oid) as def, c.convalidated
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.equipo'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade%s',
      r.tabla, r.conname,
      regexp_replace(r.def, '\s+NOT VALID$', ''),
      case when r.convalidated then '' else ' not valid' end);
  end loop;
end $$;

create or replace function fn_renombrar_usuario(viejo text, nuevo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from equipo where lower(username) = lower(nuevo) and username <> viejo) then
    raise exception 'usuario_en_uso';
  end if;
  update equipo set username = nuevo where username = viejo;
  update push_enviados set username = nuevo where username = viejo;
  update temporadas_descanso set nombre = nuevo where nombre = viejo;
  update tareas set creado_por = nuevo where creado_por = viejo;
  update tareas_recurrentes set creado_por = nuevo where creado_por = viejo;
end $$;
revoke all on function fn_renombrar_usuario(text, text) from public, anon, authenticated;

-- 2) Excepción de cuota: quien la pide elige qué administradorxs la leen
-- (vacío = todxs). Usernames de admins.
alter table solicitudes_excepcion add column if not exists admins_destino text[] not null default '{}';
