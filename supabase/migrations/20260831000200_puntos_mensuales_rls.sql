-- Mismo bug de seguridad que equipo (migración 20260830_equipo_rls.sql):
-- puntos_mensuales tenía RLS habilitado pero con una sola policy
-- ("Acceso del backend de Mirlxs (GAS)", FOR ALL TO anon USING(true)
-- WITH CHECK(true)) que dejaba la tabla ENTERA legible Y escribible con
-- solo la anon key pública -- confirmado en vivo con un GET anónimo.
-- Nombre de la policy sugiere que quedó de cuando el backend legado
-- (Google Apps Script, fuera de este repo) hablaba directo contra
-- PostgREST con la anon key -- huérfana desde que la Edge Function
-- (service_role, bypasea RLS sin policy propia) es la única escritora
-- real (`_acreditarPuntosTarea`/`_restarPuntosTarea`,
-- supabase/functions/api/index.ts).
ALTER TABLE puntos_mensuales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso del backend de Mirlxs (GAS)" ON puntos_mensuales;

DROP POLICY IF EXISTS puntos_read_authenticated ON puntos_mensuales;
CREATE POLICY puntos_read_authenticated ON puntos_mensuales
  FOR SELECT TO authenticated USING (true);

-- El service role ya bypasea RLS automáticamente, no necesita policy.
