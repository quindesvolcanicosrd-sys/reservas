-- Protege filas de asistencias marcadas como excepción (es_excepcion = true)
-- de ser sobreescritas por el cron de GAS.
-- Lógica: si una fila ya es excepción y el UPDATE no viene con es_excepcion = true
-- explícito (lo que hace el admin en el frontend), se rechaza el cambio (RETURN OLD).
-- El admin siempre manda es_excepcion = true en sus patches → el trigger lo permite.
CREATE OR REPLACE FUNCTION fn_proteger_asistencia_excepcion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.es_excepcion = TRUE AND (NEW.es_excepcion IS NULL OR NEW.es_excepcion = FALSE) THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_asistencias_excepciones ON asistencias;
CREATE TRIGGER trg_proteger_asistencias_excepciones
BEFORE UPDATE ON asistencias
FOR EACH ROW
EXECUTE FUNCTION fn_proteger_asistencia_excepcion();
