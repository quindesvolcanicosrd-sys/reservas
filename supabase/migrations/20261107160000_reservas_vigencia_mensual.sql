-- Cuota mensual: cada reserva mensual vence el último día de su mes.
-- Antes las reservas nuevas se guardaban sin validez_hasta y la web las
-- contaba como "al día" para siempre. mes_texto no trae año: se toma el de
-- fecha_pago, corrigiendo el cruce de año (Enero pagado en diciembre = enero
-- del año siguiente; Diciembre pagado en enero = diciembre del año anterior).
create or replace function public.fn_vigencia_mensual(p_mes text, p_ref date)
returns date language sql immutable as $$
  with m as (
    select array_position(array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
                          lower(trim(p_mes))) as n,
           coalesce(p_ref, current_date) as r
  )
  select case when n is null then null else
    (make_date(extract(year from r)::int
               + case when n < extract(month from r) - 6 then 1
                      when n > extract(month from r) + 6 then -1 else 0 end,
               n, 1) + interval '1 month' - interval '1 day')::date
  end from m
$$;

create or replace function public.fn_reservas_vigencia_mensual()
returns trigger language plpgsql as $$
begin
  if new.tipo = 'mensual' and new.validez_hasta is null then
    new.validez_hasta := public.fn_vigencia_mensual(new.mes_texto, coalesce(new.fecha_pago, current_date));
  end if;
  return new;
end $$;

drop trigger if exists trg_reservas_vigencia_mensual on public.reservas;
create trigger trg_reservas_vigencia_mensual before insert or update on public.reservas
  for each row execute function public.fn_reservas_vigencia_mensual();

update public.reservas set validez_hasta = public.fn_vigencia_mensual(mes_texto, fecha_pago)
  where tipo = 'mensual' and validez_hasta is null;

grant execute on function public.fn_vigencia_mensual(text, date) to service_role;
grant execute on function public.fn_reservas_vigencia_mensual() to service_role;
