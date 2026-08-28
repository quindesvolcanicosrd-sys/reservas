-- Reemplaza _mantenerVentanaAsistenciasInterno() (Apps Script) por una
-- función nativa de Postgres que expande las reglas de recurrencia de
-- `venues` hacia `asistencias`, corrida por pg_cron cada 15 minutos y
-- también invocable a demanda desde la Edge Function
-- (case 'adminRegenerarVentanaAsistencias', supabase/functions/api/index.ts)
-- justo después de crear/editar un venue.
--
-- Esquema real verificado con `supabase db query --linked` contra la base
-- de producción (no asumido desde el código del frontend, que documenta
-- este mismo esquema con caveats de "no confirmado"):
--   venues(id uuid, lugar text, dias text, inicia time, finaliza time,
--          google_maps text, tipo text, frecuencia int4, unidad text,
--          fecha_referencia date, tipo_icono text, info_adicional text, ...)
--   asistencias(id_evento text PK, t text, tipo_evento text, mes text,
--               dia text, fecha date, donde text, google_maps text,
--               inicia time, termina time, estado text, bloqueado bool,
--               id_regla text, es_excepcion bool NOT NULL, info_adicional
--               text, ...)
--   temporadas_descanso(id uuid, nombre text, fecha_inicio date,
--                        fecha_fin date, ...)
--
-- 2 hallazgos reales en los datos de producción, NO asumibles desde el
-- código JS (que asume/espera un esquema ya normalizado y falla silencioso
-- si no lo es -- ver `_evLugarParseDiasSemana()`/`_evMapVenueSupabase()`,
-- js/eventos.js, y la nota que dejan en el propio código sobre esto):
--   1. `venues.tipo` tiene DOS convenciones mezcladas en la tabla real: las
--      reglas nuevas (creadas por el wizard actual, `_evCrearGuardar()`)
--      usan los códigos en minúscula ('dias_semana'/'cada_tantos'/'unico'),
--      pero 5 reglas reales de "Días de la semana" siguen con la ETIQUETA
--      vieja en español tal como la dejó la migración de Sheets
--      ('Días de la semana', nunca renormalizada) -- si esta función solo
--      reconociera los códigos nuevos, esas 5 reglas reales dejarían de
--      generar eventos por completo. Se aceptan ambas formas para los 3
--      tipos (ver `_tipo` más abajo).
--   2. `venues.dias` (texto libre) en esas mismas 5 reglas viejas guarda
--      NOMBRES de día en español separados por coma ("Sábado",
--      "Miércoles, Lunes") -- NO el array numérico 1-7 que espera
--      `_evLugarParseDiasSemana()` del frontend (que hace `parseInt()` de
--      cada token; contra un nombre de día devuelve NaN y la regla queda
--      con `diasSemana:[]` en la UI de "Editar lugares", bug silencioso ya
--      señalado en el propio comentario de esa función pero no corregido
--      ahí -- fuera de alcance de esta tanda, que es solo backend). Esta
--      función tolera ambos formatos (nombre en español o número 1-7,
--      1=Lunes..7=Domingo == EXTRACT(ISODOW ...)) vía `_dias_venue_a_isodow()`.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Normaliza `venues.dias` (nombres de día en español separados por coma,
-- CSV numérico, o JSON/array-literal con los mismos números) a un array de
-- enteros ISODOW (1=Lunes..7=Domingo). Function propia en vez de inline
-- para no repetir el CASE en cada iteración del loop de fechas -- se calcula
-- UNA vez por venue, no una vez por día de la ventana.
CREATE OR REPLACE FUNCTION _dias_venue_a_isodow(p_dias text)
RETURNS int[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT dow) FILTER (WHERE dow IS NOT NULL), ARRAY[]::int[])
  FROM (
    SELECT
      CASE
        WHEN trim(tok) ~ '^[0-9]+$' THEN trim(tok)::int
        WHEN translate(lower(trim(tok)), 'áéíóú', 'aeiou') LIKE 'lun%'  THEN 1
        WHEN translate(lower(trim(tok)), 'áéíóú', 'aeiou') LIKE 'mar%'  THEN 2
        WHEN translate(lower(trim(tok)), 'áéíóú', 'aeiou') LIKE 'mie%'  THEN 3
        WHEN translate(lower(trim(tok)), 'áéíóú', 'aeiou') LIKE 'jue%'  THEN 4
        WHEN translate(lower(trim(tok)), 'áéíóú', 'aeiou') LIKE 'vie%'  THEN 5
        WHEN translate(lower(trim(tok)), 'áéíóú', 'aeiou') LIKE 'sab%'  THEN 6
        WHEN translate(lower(trim(tok)), 'áéíóú', 'aeiou') LIKE 'dom%'  THEN 7
        ELSE NULL
      END AS dow
    FROM unnest(string_to_array(regexp_replace(COALESCE(p_dias, ''), '[][{}]', '', 'g'), ',')) AS tok
  ) t;
$$;

CREATE OR REPLACE FUNCTION regenerar_ventana_asistencias()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy        date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_hasta      date := (now() AT TIME ZONE 'America/Bogota')::date + 365;
  v_venue      RECORD;
  v_tipo       text;
  v_dias_dow   int[];
  v_fecha      date;
  v_dow        int;
  v_diff       int;
  v_incluye    boolean;
  v_dia_nombre text;
BEGIN
  FOR v_venue IN SELECT * FROM venues WHERE tipo IS NOT NULL LOOP
    -- Acepta el código nuevo ('dias_semana'/'cada_tantos'/'unico',
    -- _evCrearGuardar() actual) y la etiqueta vieja en español que dejó la
    -- migración de Sheets sin renormalizar (ver nota de cabecera arriba).
    v_tipo := CASE trim(v_venue.tipo)
      WHEN 'dias_semana' THEN 'dias_semana'
      WHEN 'Días de la semana' THEN 'dias_semana'
      WHEN 'cada_tantos' THEN 'cada_tantos'
      WHEN 'Cada tantos días/semanas/meses' THEN 'cada_tantos'
      WHEN 'unico' THEN 'unico'
      WHEN 'Evento único' THEN 'unico'
      ELSE NULL
    END;
    IF v_tipo IS NULL THEN CONTINUE; END IF;

    v_dias_dow := CASE WHEN v_tipo = 'dias_semana' THEN _dias_venue_a_isodow(v_venue.dias) ELSE NULL END;

    v_fecha := v_hoy;
    WHILE v_fecha <= v_hasta LOOP
      v_incluye := false;

      IF v_tipo = 'dias_semana' THEN
        v_dow := EXTRACT(ISODOW FROM v_fecha)::int;
        v_incluye := v_dias_dow IS NOT NULL AND v_dow = ANY (v_dias_dow);

      ELSIF v_tipo = 'cada_tantos' THEN
        IF v_venue.fecha_referencia IS NOT NULL AND v_venue.frecuencia IS NOT NULL
           AND v_venue.frecuencia > 0 AND v_fecha >= v_venue.fecha_referencia THEN
          IF lower(trim(v_venue.unidad)) = 'dias' THEN
            v_incluye := MOD((v_fecha - v_venue.fecha_referencia), v_venue.frecuencia) = 0;
          ELSIF lower(trim(v_venue.unidad)) = 'semanas' THEN
            v_diff := v_fecha - v_venue.fecha_referencia;
            v_incluye := MOD(v_diff, 7) = 0 AND MOD(v_diff / 7, v_venue.frecuencia) = 0;
          ELSIF lower(trim(v_venue.unidad)) = 'meses' THEN
            v_incluye := EXTRACT(DAY FROM v_fecha)::int = EXTRACT(DAY FROM v_venue.fecha_referencia)::int
              AND MOD(
                    (EXTRACT(YEAR FROM v_fecha)::int - EXTRACT(YEAR FROM v_venue.fecha_referencia)::int) * 12
                  + (EXTRACT(MONTH FROM v_fecha)::int - EXTRACT(MONTH FROM v_venue.fecha_referencia)::int),
                    v_venue.frecuencia
                  ) = 0;
          END IF;
        END IF;

      ELSIF v_tipo = 'unico' THEN
        v_incluye := v_venue.fecha_referencia IS NOT NULL AND v_fecha = v_venue.fecha_referencia;
      END IF;

      IF v_incluye AND NOT EXISTS (
        SELECT 1 FROM temporadas_descanso td
        WHERE v_fecha BETWEEN td.fecha_inicio AND td.fecha_fin
      ) THEN
        v_dia_nombre := CASE EXTRACT(ISODOW FROM v_fecha)::int
          WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'Miércoles'
          WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'Sábado'
          ELSE 'Domingo' END;

        INSERT INTO asistencias (
          id_evento, t, tipo_evento, mes, dia, fecha, donde, google_maps,
          inicia, termina, estado, bloqueado, es_excepcion, id_regla, info_adicional
        ) VALUES (
          'EV-' || v_venue.id::text || '-' || to_char(v_fecha, 'YYYYMMDD'),
          v_venue.tipo_icono, v_venue.tipo_icono, to_char(v_fecha, 'YYYY-MM'), v_dia_nombre, v_fecha,
          v_venue.lugar, v_venue.google_maps, v_venue.inicia, v_venue.finaliza,
          'Próximo', false, false, v_venue.id::text, COALESCE(v_venue.info_adicional, '')
        )
        ON CONFLICT (id_regla, fecha) WHERE id_regla IS NOT NULL DO UPDATE SET
          t             = EXCLUDED.t,
          tipo_evento   = EXCLUDED.tipo_evento,
          donde         = EXCLUDED.donde,
          google_maps   = EXCLUDED.google_maps,
          inicia        = EXCLUDED.inicia,
          termina       = EXCLUDED.termina,
          mes           = EXCLUDED.mes,
          dia           = EXCLUDED.dia,
          info_adicional = EXCLUDED.info_adicional
        WHERE asistencias.es_excepcion = false;
        -- `estado`/`bloqueado` a propósito FUERA del UPDATE: si el admin
        -- canceló esta ocurrencia puntual (adminCancelarEvento, todavía en
        -- GAS) sin marcarla es_excepcion=true, no se "revive" en la próxima
        -- corrida del cron -- solo se refrescan los campos que vienen de la
        -- regla en sí (lugar/horario/categoría/descripción).
      END IF;

      v_fecha := v_fecha + 1;
    END LOOP;
  END LOOP;
END;
$$;

-- Dedup por (id_regla, fecha) -- requerido por el ON CONFLICT de arriba.
-- Parcial (solo id_regla NOT NULL) para no afectar los eventos únicos
-- insertados directo por _evCrearUnicoGuardar() (js/eventos.js), que
-- siempre mandan id_regla:null y nunca pasan por esta función (ver nota de
-- cabecera del archivo -- Pregunta 2 del pedido original).
CREATE UNIQUE INDEX IF NOT EXISTS ux_asistencias_id_regla_fecha
  ON asistencias (id_regla, fecha)
  WHERE id_regla IS NOT NULL;

-- Solo el rol de servidor (Edge Function, service_role) y el propio dueño
-- de la función (postgres, vía pg_cron) pueden ejecutarla -- son ~365
-- días * N venues de trabajo por corrida, no algo para exponer como RPC
-- público de PostgREST (anon/authenticated heredan EXECUTE de PUBLIC por
-- default en Postgres si no se revoca explícito).
REVOKE ALL ON FUNCTION regenerar_ventana_asistencias() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION regenerar_ventana_asistencias() TO service_role;

-- pg_cron -- mismo intervalo que tenía el trigger de GAS
-- (_mantenerVentanaAsistenciasInterno(), cada 15 min). Reprogramable sin
-- error si ya existía (unschedule + schedule), para que esta migración se
-- pueda volver a pegar en el SQL Editor sin fallar por nombre duplicado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'regenerar-ventana-asistencias') THEN
    PERFORM cron.unschedule('regenerar-ventana-asistencias');
  END IF;
END $$;

SELECT cron.schedule(
  'regenerar-ventana-asistencias',
  '*/15 * * * *',
  'SELECT regenerar_ventana_asistencias()'
);
