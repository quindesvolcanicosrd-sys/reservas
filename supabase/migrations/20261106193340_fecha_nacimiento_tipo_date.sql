-- equipo.fecha_nacimiento: text -> date.
--
-- Bug real: la columna era `text` con default '' y guardaba formatos
-- mezclados -- '' (13 de 17 personas activas), 'DD/MM/YYYY' y el toString()
-- de una fecha de JavaScript ('Fri Apr 15 1994 00:00:00 GMT-0500 (...)',
-- heredado de la migración desde Google Sheets). Ni getCumpleañosRango() ni
-- cronDiario() podían leer esos valores, así que los cumpleaños no salían en
-- el timeline ni se notificaban.
--
-- Esta migración rescata los 3 formatos reales encontrados en producción y
-- deja todo lo demás en NULL ("sin fecha registrada" -- dispara la pantalla
-- obligatoria #cumple-gate, ver js/perfil.js). El backend normaliza a
-- 'YYYY-MM-DD' antes de escribir (`_normalizarFechaNac()`, api/index.ts).

alter table public.equipo alter column fecha_nacimiento drop default;

alter table public.equipo
  alter column fecha_nacimiento type date
  using (
    case
      when fecha_nacimiento is null or btrim(fecha_nacimiento) = '' then null
      when fecha_nacimiento ~ '^\d{4}-\d{2}-\d{2}' then substring(fecha_nacimiento from 1 for 10)::date
      when fecha_nacimiento ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(fecha_nacimiento, 'DD/MM/YYYY')
      when fecha_nacimiento ~ '^[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{4}' then to_date(substring(fecha_nacimiento from 5 for 11), 'Mon DD YYYY')
      else null
    end
  );
