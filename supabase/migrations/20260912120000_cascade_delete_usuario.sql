-- Bug real corregido (pedido explícito de Victor, ver MANIFEST.md): al
-- eliminar un usuario de equipo (`adminEliminarUsuario`,
-- supabase/functions/api/index.ts), solo se borraba la fila de `equipo` (y
-- `sessions`, por código explícito) -- todo lo demás quedaba huérfano.
-- Confirmado contra la DB real (`supabase db query --linked`, solo lecturas)
-- ANTES de esta migración: 151 filas huérfanas en `log_asistencias`, 24 en
-- `puntos_mensuales`, 13 en `pagos`, 12 en `asignaciones_tareas`, 2 en
-- `reservas`, 1 en `nivel_actual` (username sin fila correspondiente en
-- `equipo`) -- exactamente la causa de "el usuario eliminado sigue
-- apareciendo en listas de 'Asistiré' de eventos" (ver también el comentario
-- ya existente sobre `existeEnEquipo` en `getEventosRango()`, que filtra
-- estos huérfanos en el FRONTEND pero nunca los limpiaba en la DB).
--
-- Esta migración agrega `ON DELETE CASCADE` a `equipo(username)` en TODAS
-- las tablas reales del schema que guardan datos por usuario (confirmado
-- contra `information_schema` -- se descartaron `config_niveles`/
-- `reglas_asistencia`/`temporadas_descanso`, cuya columna `nombre` es el
-- nombre de un tier/regla/temporada, no de una persona). `nivel_actual` es
-- una tabla legacy ya no leída ni escrita por ningún código actual (ver
-- comentario "nivel_actual congelado" en supabase/functions/api/index.ts) --
-- se le agrega la FK de todos modos por consistencia/garantía a nivel DB,
-- sin volver a activarla en ningún flujo.
--
-- `historial_tier`/`cuota_excepcion` YA tenían FK a `equipo(username)` pero
-- `NO ACTION` (el default) -- hoy mismo BLOQUEARÍAN el DELETE de un usuario
-- que tenga esas filas (a diferencia del resto, que no tienen FK y por eso
-- quedan huérfanas en silencio en vez de fallar). Como sus datos ya son
-- 100% válidos (0 huérfanas encontradas en ambas), se las reemplaza
-- directo por `ON DELETE CASCADE` sin necesidad de `NOT VALID`.
alter table historial_tier drop constraint historial_tier_username_fkey;
alter table historial_tier add constraint historial_tier_username_fkey
  foreign key (username) references equipo(username) on delete cascade;

alter table cuota_excepcion drop constraint cuota_excepcion_id_miembro_fkey;
alter table cuota_excepcion add constraint cuota_excepcion_id_miembro_fkey
  foreign key (id_miembro) references equipo(username) on delete cascade;

-- Tablas SIN huérfanos hoy (0 filas, confirmado) -- FK agregada y validada
-- de una: cualquier violación futura fallaría de inmediato, como debe ser.
alter table rectificaciones_asistencia add constraint rectificaciones_asistencia_nombre_fkey
  foreign key (nombre) references equipo(username) on delete cascade;

alter table solicitudes_excepcion add constraint solicitudes_excepcion_nombre_fkey
  foreign key (nombre) references equipo(username) on delete cascade;

alter table solicitudes_pago add constraint solicitudes_pago_nombre_usuario_fkey
  foreign key (nombre_usuario) references equipo(username) on delete cascade;

alter table pin_attempts add constraint pin_attempts_username_fkey
  foreign key (username) references equipo(username) on delete cascade;

-- Tablas CON huérfanos reales hoy (ver conteo arriba) -- `not valid` agrega
-- la FK (y su `on delete cascade`, que sí aplica a cualquier DELETE futuro
-- de `equipo`) SIN validar las filas ya existentes, que se quedan como
-- están -- decisión deliberada de NO borrar datos históricos reales (pagos,
-- asistencias, puntos ya ganados de cuentas que ya no existen) como efecto
-- colateral de esta migración. Un admin puede limpiarlas a mano más
-- adelante si quiere, y recién ahí correr `validate constraint` si se
-- quisiera exigir integridad completa hacia atrás también.
alter table log_asistencias add constraint log_asistencias_nombre_usuario_fkey
  foreign key (nombre_usuario) references equipo(username) on delete cascade not valid;

alter table reservas add constraint reservas_nombre_usuario_fkey
  foreign key (nombre_usuario) references equipo(username) on delete cascade not valid;

alter table puntos_mensuales add constraint puntos_mensuales_nombre_usuario_fkey
  foreign key (nombre_usuario) references equipo(username) on delete cascade not valid;

alter table asignaciones_tareas add constraint asignaciones_tareas_nombre_usuario_fkey
  foreign key (nombre_usuario) references equipo(username) on delete cascade not valid;

alter table pagos add constraint pagos_nombre_usuario_fkey
  foreign key (nombre_usuario) references equipo(username) on delete cascade not valid;

alter table nivel_actual add constraint nivel_actual_nombre_usuario_fkey
  foreign key (nombre_usuario) references equipo(username) on delete cascade not valid;
