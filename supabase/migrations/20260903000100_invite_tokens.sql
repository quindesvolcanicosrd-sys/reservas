-- Activación de cuenta pre-creada por un admin (mini-SPA activar/, ver
-- MANIFEST.md) — un admin crea/da de alta a alguien en `equipo` sin pasar
-- por `inscribirPersona`/`inscribirPersonaExpress` (ej. alguien que ya está
-- en el roster real pero nunca se registró solx), genera un link de un solo
-- uso (`generarInviteToken`, Edge Function) y esa persona lo usa para
-- vincular su cuenta de Google y completar los datos que falten.
--
-- `username` (no `miembro_id`) — `equipo.username` es la PK real de esa
-- tabla (verificado con `information_schema`/`pg_constraint` antes de
-- escribir esto, no asumido) -- mismo criterio que el resto del esquema
-- (`log_asistencias.nombre_usuario`, `reservas.nombre_usuario`, etc.), que
-- siempre usa el username como key natural, nunca un id separado.
--
-- `token` con default real (`gen_random_bytes`, pgcrypto) -- el INSERT de
-- `generarInviteToken` no necesita generarlo a mano, y no hay forma de
-- olvidarse de setearlo.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS invite_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  username text not null references equipo(username) on delete cascade,
  datos_prefill jsonb not null default '{}',
  usado boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);

-- RLS: bloqueada por completo a anon/authenticated -- toda lectura/escritura
-- real pasa por la Edge Function (service_role, bypasea RLS), mismo
-- criterio que `equipo` (migración 20260830_equipo_rls.sql). Sin esto, la
-- anon key (pública, embebida en el cliente) podría leer/escribir esta
-- tabla directo vía PostgREST -- expondría tokens de activación válidos de
-- cualquier cuenta a cualquiera.
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE invite_tokens TO service_role;
GRANT ALL ON TABLE invite_tokens TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
