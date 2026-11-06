-- push_enviados: anti-duplicado de push por tipo + evento + persona.
--
-- cronRecordatorio1Dia() (api/index.ts) pasa de una ventana fija 23-25h a
-- "cualquier evento que empiece en las próximas 24h" corriendo cada hora,
-- para que también avise de eventos creados con menos de 24h de
-- anticipación. Esta tabla garantiza que ese aviso salga UNA sola vez por
-- persona y evento. Solo la usa la Edge Function (service role): RLS
-- activado y sin políticas = sin acceso desde el navegador.

create table if not exists public.push_enviados (
  tipo        text        not null,
  id_evento   text        not null,
  username    text        not null,
  enviado_en  timestamptz not null default now(),
  primary key (tipo, id_evento, username)
);
create index if not exists push_enviados_enviado_en_idx on public.push_enviados (enviado_en);

alter table public.push_enviados enable row level security;

-- Siembra: los eventos que empiezan en las próximas 25h ya recibieron el
-- recordatorio con la ventana vieja (23-25h) -- se marcan como enviados
-- para que el primer tick del cron nuevo no los repita.
insert into public.push_enviados (tipo, id_evento, username)
select 'recordatorio_1dia', a.id_evento, e.username
from public.asistencias a
cross join public.equipo e
where e.eliminado_en is null
  and a.fecha is not null and a.inicia is not null
  and ((a.fecha + a.inicia) at time zone 'America/Guayaquil') between now() and now() + interval '25 hours'
on conflict do nothing;
