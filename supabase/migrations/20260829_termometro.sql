-- Termómetro real (Cambio 59, ver MANIFEST.md) -- reemplaza el `rankPct`
-- en 0 fijo que devolvía getEquipo() desde el Cambio 55. Poblada por
-- calcularTermometroPct()/recalcular-categorias/index.ts, junto con
-- `categoria` en el mismo UPDATE.
ALTER TABLE equipo
  ADD COLUMN IF NOT EXISTS termometro_pct float NOT NULL DEFAULT 0;
