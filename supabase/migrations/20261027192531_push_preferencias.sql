-- Preferencias de notificación por persona (pedido explícito -- "cada
-- usuario elige qué notificaciones recibe", ver MANIFEST.md sección push).
--
-- `push_notificaciones_activas`: interruptor general, gana sobre cualquier
-- preferencia puntual -- default true (todas activadas de entrada, nadie
-- tiene que "prender" nada).
-- `push_preferencias`: mapa clave→boolean (clave = catálogo único de tipos
-- de notificación, `CATALOGO_NOTIFICACIONES`/supabase/functions/api/index.ts)
-- -- default '{}'::jsonb, una clave AUSENTE significa "activada" (no
-- "false" explícito) para que un tipo de notificación nuevo agregado al
-- catálogo no deje a nadie afuera retroactivamente.
ALTER TABLE public.equipo ADD COLUMN IF NOT EXISTS push_notificaciones_activas boolean NOT NULL DEFAULT true;
ALTER TABLE public.equipo ADD COLUMN IF NOT EXISTS push_preferencias jsonb NOT NULL DEFAULT '{}'::jsonb;
