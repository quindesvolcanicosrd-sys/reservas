-- Bucket público para subirFotoPerfil()/subirFotoInscripcion() (supabase/functions/api/index.ts)
-- -- reemplaza el forward a GAS (Google Apps Script ya no se usa para esto).
-- Carpetas: avatars/<username>.jpg, inscripcion/<email>.jpg.
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-perfil', 'fotos-perfil', true)
ON CONFLICT (id) DO NOTHING;
