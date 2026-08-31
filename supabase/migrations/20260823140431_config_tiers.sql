-- Tabla de configuración de tiers
CREATE TABLE config_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden integer NOT NULL,
  nombre text NOT NULL,
  min_clases integer NOT NULL DEFAULT 0,
  min_puntos integer NOT NULL DEFAULT 0,
  ventana_meses integer NOT NULL DEFAULT 2,
  logica text NOT NULL DEFAULT 'O' CHECK (logica IN ('Y', 'O')),
  es_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Datos por defecto
INSERT INTO config_tiers (orden, nombre, min_clases, min_puntos, ventana_meses, logica, es_default) VALUES
  (1, 'Quindes', 8, 50, 2, 'O', false),
  (2, 'Mirlxs', 0, 0, 2, 'O', true);

-- Columna categoria en equipo
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS categoria text;
UPDATE equipo SET categoria = 'Mirlxs' WHERE categoria IS NULL;
