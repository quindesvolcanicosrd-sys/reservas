-- Equipos: logo, enlace de invitación propio y requisitos para entrar directo.
alter table public.config_tiers
  add column if not exists logo text,
  add column if not exists codigo_invitacion text unique,
  add column if not exists requisitos jsonb not null default '{}'::jsonb;
update public.config_tiers set codigo_invitacion = substr(md5(random()::text || id::text), 1, 10) where codigo_invitacion is null;
insert into public.config_app (key, value) values ('logo_liga', '') on conflict (key) do nothing;
