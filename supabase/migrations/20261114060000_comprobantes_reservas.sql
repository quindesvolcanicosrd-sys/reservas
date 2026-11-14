-- Comprobantes dentro de la app (Victor, 2026-11-14): la reserva se guarda
-- igual sin comprobante (cuando era obligatorio, se perdían reservas); la
-- persona sube la captura cuando puede y se le recuerda. La imagen se borra
-- a los 30 días para no ocupar espacio; queda la fecha en que se subió.
alter table reservas add column if not exists comprobante_path text;
alter table reservas add column if not exists comprobante_subido_en timestamptz;
alter table reservas add column if not exists comprobante_avisos int not null default 0;
alter table reservas add column if not exists comprobante_ultimo_aviso timestamptz;

-- Almacenamiento privado: solo el servidor (service role) lee y escribe; los
-- Pivots ven la imagen con un enlace firmado que vence en minutos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
