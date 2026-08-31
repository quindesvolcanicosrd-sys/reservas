-- Quitar 'Satélite' del enum de estado_miembro
ALTER TABLE equipo
  DROP CONSTRAINT equipo_estado_miembro_check;

ALTER TABLE equipo
  ADD CONSTRAINT equipo_estado_miembro_check
  CHECK (estado_miembro IN ('Activx', 'Ausente', 'Técnico', 'Lesionadx'));

-- Campo para solicitud pendiente de lesión
ALTER TABLE equipo
  ADD COLUMN IF NOT EXISTS solicitud_lesion_pendiente boolean NOT NULL DEFAULT false;
