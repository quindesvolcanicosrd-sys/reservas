-- Limpieza manual de los huérfanos históricos que la migración
-- 20260912120000_cascade_delete_usuario.sql dejó A PROPÓSITO sin tocar
-- (agregó `ON DELETE CASCADE ... NOT VALID` en 6 tablas para no borrar datos
-- históricos como efecto colateral de esa migración, ver su comentario) --
-- Victor reportó el bug como "persistente" (usuario eliminado sigue
-- apareciendo como 'Asistiré' en eventos/rollcall) y pidió explícitamente
-- limpiarlos a mano ahora.
--
-- Re-confirmado contra la DB real (`supabase db query --linked`, solo
-- lecturas) ANTES de escribir esta migración -- mismos 6 conteos EXACTOS
-- que ya documentaba la migración de cascada (151/24/13/12/2/1), porque esa
-- migración nunca los borró: 151 en `log_asistencias` (100 de ellas con
-- `nombre_usuario=''`, NO son huérfanos de un usuario eliminado -- vienen de
-- un batch `origen='AsistenciaAnticipada'` insertado el mismo segundo
-- 2026-09-08 17:07:32 con el nombre vacío, bug DISTINTO de reglas de
-- asistencia anticipada que queda fuera de esta migración a propósito,
-- pendiente de investigar aparte; las otras 51 sí son huérfanos reales:
-- "Ale Lora" ×5, "Victor" ×46 -- "Victor" no es el admin actual, que es
-- "Vic", verificado contra `equipo.username` real antes de armar este
-- DELETE), 24 en `puntos_mensuales` ("Ale Lora"/"Victor"), 13 en `pagos`
-- ("Alejandro"/"Byron"/"Dani"/"Flor"/"Nadine"/"Paulo"/"Robin"/"Robyn"/
-- "Sebas"), 12 en `asignaciones_tareas` (de las cuales SOLO 3 son huérfanos
-- reales de un único usuario -- "Dani"/"Sebas"/"Victor", las 9 restantes
-- tienen `nombre_usuario` con una lista CSV de varios nombres a la vez, ej.
-- "Marce, Sant, Vic, Darah, Cami" -- formato LEGACY de antes del refactor a
-- una fila por persona por asignación (`adminAsignarTarea()`/
-- `supabase/functions/api/index.ts` ya inserta una fila por persona desde
-- hace tiempo) que nunca puede matchear un único `equipo.username` -- no
-- son huérfanos de un usuario puntual eliminado, son debris de un modelo de
-- datos viejo, se dejan intactos a propósito, fuera de alcance de este
-- pedido), 2 en `reservas` ("Dani" real + una fila "Reserva" que es un
-- resto de plantilla/encabezado de una importación vieja de Sheets --
-- `email:'Mail'`, `estado:'Estado de la reserva'`, `mes_texto:'Entrenamiento
-- /s suscritos o mes/mses pagados'`, ningún dato real -- se borra igual acá
-- por ser basura evidente, no porque corresponda a una persona), 1 en
-- `nivel_actual` ("Victor", tabla legacy sin escritor/lector activo, ver
-- comentario "nivel_actual congelado").
--
-- Ningún dato de una cuenta TODAVÍA activa se toca -- cada lista de abajo
-- salió de un `NOT EXISTS (SELECT 1 FROM equipo WHERE username = ...)` real
-- contra la DB de producción, confirmado inmediatamente antes de escribir
-- este archivo. Idempotente -- correrla de nuevo no borra nada la 2da vez
-- (los `WHERE` ya no matchean ninguna fila).
delete from log_asistencias where nombre_usuario in ('Ale Lora', 'Victor');
delete from puntos_mensuales where nombre_usuario in ('Ale Lora', 'Victor');
delete from pagos where nombre_usuario in ('Alejandro', 'Byron', 'Dani', 'Flor', 'Nadine', 'Paulo', 'Robin', 'Robyn', 'Sebas');
delete from asignaciones_tareas where nombre_usuario in ('Dani', 'Sebas', 'Victor');
delete from reservas where nombre_usuario in ('Dani', 'Reserva');
delete from nivel_actual where nombre_usuario = 'Victor';
