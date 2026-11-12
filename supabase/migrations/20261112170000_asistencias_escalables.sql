-- Auditoría de escalabilidad, prioridad 1 (Victor, 2026-11-12).
-- Antes la Edge Function traía `log_asistencias` completa (.limit(100000)) y
-- filtraba en memoria: con más ligas o más tiempo se llega al tope y vuelve
-- el error de "Asistiré no se guarda / no se ve". Ahora la base devuelve
-- solo lo necesario, ya agrupado y en UN solo valor JSON (no filas, así no
-- aplica el máximo de filas por respuesta de la API).

CREATE INDEX IF NOT EXISTS log_asistencias_evento_usuario_idx ON log_asistencias (id_evento, nombre_usuario);
CREATE INDEX IF NOT EXISTS log_asistencias_usuario_origen_idx ON log_asistencias (nombre_usuario, origen);
CREATE INDEX IF NOT EXISTS log_asistencias_origen_fecha_idx ON log_asistencias (origen, fecha_entrenamiento);

-- Respuesta vigente por (evento, persona) de los eventos pedidos.
-- Misma regla que tenía la Edge Function: 'Admin' (asistencia real) gana
-- siempre; entre RSVPs, 'Usuario' gana a 'AsistenciaAnticipada'; a igual
-- prioridad, la marca más reciente (las sin marca solo si no hay otra).
-- Devuelve { id_evento: [ {nombre, estado, origen}, ... ] }.
CREATE OR REPLACE FUNCTION fn_asistencia_vigente_por_evento(ids text[])
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH vigente AS (
    SELECT DISTINCT ON (id_evento, nombre_usuario) id_evento, nombre_usuario, origen, estado
    FROM log_asistencias
    WHERE id_evento = ANY(ids)
    ORDER BY id_evento, nombre_usuario,
      CASE origen WHEN 'Admin' THEN 2 WHEN 'Usuario' THEN 1 ELSE 0 END DESC,
      marca_temporal DESC NULLS LAST
  )
  SELECT coalesce(jsonb_object_agg(id_evento, filas), '{}'::jsonb)
  FROM (
    SELECT id_evento, jsonb_agg(jsonb_build_object('nombre', nombre_usuario, 'estado', estado, 'origen', origen)) AS filas
    FROM vigente GROUP BY id_evento
  ) x;
$$;

-- Última asistencia REAL (Admin o Externa, estado distinto de 'Ninguno')
-- por persona, con la clave normalizada (trim + mayúsculas) como en la
-- Edge Function. La fecha sale como texto con el mismo formato que antes
-- (timestamptz ISO, o la fecha del evento si la fila no tiene fecha).
CREATE OR REPLACE FUNCTION fn_ultima_asistencia_real_por_usuario()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(clave, fecha), '{}'::jsonb)
  FROM (
    SELECT upper(btrim(l.nombre_usuario)) AS clave,
           max(coalesce(to_jsonb(l.fecha_entrenamiento) #>> '{}', a.fecha::text)) AS fecha
    FROM log_asistencias l
    LEFT JOIN asistencias a ON a.id_evento = l.id_evento AND l.fecha_entrenamiento IS NULL
    WHERE l.origen IN ('Admin', 'Externa') AND l.estado <> 'Ninguno'
      AND btrim(coalesce(l.nombre_usuario, '')) <> ''
    GROUP BY 1
  ) x
  WHERE fecha IS NOT NULL;
$$;

-- Última marca 'Admin' por (evento, persona), para la racha. Opcionalmente
-- de una sola persona. Devuelve { "id_evento|usuario": {estado, marca} }
-- (marca en milisegundos, 0 si no tiene).
CREATE OR REPLACE FUNCTION fn_ultima_marca_admin(solo_usuario text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(clave, jsonb_build_object('estado', estado, 'marca', marca)), '{}'::jsonb)
  FROM (
    SELECT DISTINCT ON (id_evento, btrim(nombre_usuario))
      id_evento || '|' || btrim(nombre_usuario) AS clave, estado,
      coalesce((extract(epoch FROM marca_temporal) * 1000)::bigint, 0) AS marca
    FROM log_asistencias
    WHERE origen = 'Admin' AND btrim(coalesce(nombre_usuario, '')) <> ''
      AND (solo_usuario IS NULL OR nombre_usuario = solo_usuario)
    ORDER BY id_evento, btrim(nombre_usuario), marca_temporal DESC NULLS LAST, id DESC
  ) x;
$$;

REVOKE ALL ON FUNCTION fn_asistencia_vigente_por_evento(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_ultima_asistencia_real_por_usuario() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_ultima_marca_admin(text) FROM PUBLIC, anon, authenticated;
