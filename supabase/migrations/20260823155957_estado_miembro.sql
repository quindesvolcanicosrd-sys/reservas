-- Estado de miembro por integrante del equipo (Activx por defecto)
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS estado_miembro TEXT DEFAULT 'Activx'
  CHECK (estado_miembro IN ('Activx', 'Ausente', 'Satélite', 'Técnico', 'Lesionadx'));
