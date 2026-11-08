-- Tareas en la app Android (2026-11-08): las plantillas recurrentes se
-- pueden pausar o terminar sin borrar el historial. `activa` se mantiene
-- (lo lee el cron) y queda sincronizada con `estado`.
ALTER TABLE tareas_recurrentes ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activa';
UPDATE tareas_recurrentes SET estado = CASE WHEN activa THEN 'activa' ELSE 'pausada' END;
ALTER TABLE tareas_recurrentes DROP CONSTRAINT IF EXISTS tareas_recurrentes_estado_chk;
ALTER TABLE tareas_recurrentes ADD CONSTRAINT tareas_recurrentes_estado_chk CHECK (estado IN ('activa', 'pausada', 'terminada'));

-- Recordatorio push un día antes de que venza una tarea tomada (9:00 Ecuador).
SELECT cron.schedule(
  'push-recordatorio-tareas',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api',
    headers := '{"Content-Type":"application/json","x-cron-secret":"270da8e9802bde05bc95227d6fcde2f417bac222720bb74b"}'::jsonb,
    body := '{"action":"cronRecordatorioTareas"}'::jsonb
  )
  $$
);
