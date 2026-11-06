-- dispositivos_push: tokens de Firebase Cloud Messaging de la app Android
-- nativa (app/, Flutter). sendPush() (api/index.ts) manda por FCM a quien
-- tenga al menos un token acá y por OneSignal (web) al resto, así nadie
-- recibe el mismo aviso dos veces. Un token por dispositivo (PK); si el
-- teléfono cambia de cuenta, el upsert lo reasigna. Solo la Edge Function
-- (service role) lo lee/escribe — regla de "GRANT explícito" del MANIFEST.

create table if not exists public.dispositivos_push (
  token           text        primary key,
  username        text        not null references public.equipo (username) on delete cascade,
  plataforma      text        not null default 'android',
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists dispositivos_push_username_idx on public.dispositivos_push (username);

alter table public.dispositivos_push enable row level security;
revoke all on public.dispositivos_push from anon, authenticated;
grant select, insert, update, delete on public.dispositivos_push to service_role;
