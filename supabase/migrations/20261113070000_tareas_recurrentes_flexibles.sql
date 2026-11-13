-- Tareas recurrentes flexibles (Victor aprobó, 2026-11-12): cada N días,
-- semanas o meses; aparecen en la fecha de inicio (para meses, ese día del
-- mes) y vencen N días después o justo antes de la siguiente.
alter table public.tareas_recurrentes
  add column if not exists unidad text not null default 'mes',   -- 'dia' | 'semana' | 'mes'
  add column if not exists cada_n integer not null default 1,
  add column if not exists inicio date,
  add column if not exists vence_en_dias integer,                 -- null = hasta antes de la siguiente
  add column if not exists proxima date;                          -- próxima vez que se crea

-- Las que ya existen: cada mes desde el día 1; la próxima, el mes que viene.
update public.tareas_recurrentes
   set inicio = coalesce(inicio, date_trunc('month', created_at at time zone 'America/Guayaquil')::date),
       proxima = coalesce(proxima, (date_trunc('month', now() at time zone 'America/Guayaquil') + interval '1 month')::date);

-- El generador corre todos los días (antes, solo el día 1).
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'generar-tareas-recurrentes'), schedule := '0 10 * * *');
