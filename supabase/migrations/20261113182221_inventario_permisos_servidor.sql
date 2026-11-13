-- Las tablas nuevas no reciben permisos por defecto (regla 8 de MANIFEST):
-- la Edge Function (service_role) no podía leer ni escribir préstamos ni
-- las listas del inventario. Solo el servidor; la clave pública sigue sin acceso.
grant select, insert, update, delete on table public.inventario_prestamos, public.inventario_listas, public.inventario_stock to service_role;
