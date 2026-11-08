# Ronda de cambios — app Android (pedida el 2026-11-08, se trabaja desde el jueves 2026-11-12, 17:00)

Antes de empezar: leer MANIFEST.md. Al terminar: actualizar MANIFEST.md y CHANGELOG.md, commit y push.
Reglas de siempre: español neutro (sin voseo), sin pronombres femeninos, "administradorxs" en textos de la app, colores solo en `tema.dart` (`PivotPaleta` / `PivotRadios`), transiciones suaves (fade/slide).

## Pendiente de la ronda anterior

- [ ] Aplicar la migración `supabase/migrations/20261108040000_tareas_recurrentes_estado.sql` (columna `tareas_recurrentes.estado` + cron `push-recordatorio-tareas`). Supabase pide aprobación de Victor. Sin ella, la pantalla "Tareas recurrentes" muestra error.

## Cambios

1. **Loader (`core/cargando.dart`)**
   - [ ] Bastante más grande (revisar el tamaño por defecto y los lugares donde se usa).
   - [ ] Quitar la cápsula/cilindro inclinado del lado izquierdo en todas las formas; lo demás queda igual.

2. **Degradados en íconos**
   - [ ] A Victor le encantaron los degradados y sombreados de los íconos: le dan identidad a la app. Llevarlos a más lugares donde sumen (ej. Equipo, Eventos, Mi Liga) y usarlos de aquí en adelante en lo nuevo.

3. **Emergencia (`equipo/emergencia_screen.dart` y ficha de salud)**
   - [ ] Si no hay seguro de salud privado, no mostrar el texto de "se usa salud pública" debajo.
   - [ ] Rediseñar la pantalla que se abre al tocar Emergencia en una persona: mostrar solo lo que se sabe; si no hay datos, solo el botón de llamar a emergencias.
   - [ ] Estilo más bonito, cómodo y muy visible para un momento de emergencia (botones grandes, contraste alto).

4. **Desgloses de estadísticas en la ficha (`equipo/persona_screen.dart`)**
   - [ ] Puntos por asistencia, por racha y por tareas abren hoy una hoja plana. Hacerlos más completos y visuales (ej. resumen arriba, gráfico o barras por mes, detalle por evento o tarea).

5. **Cuenta**
   - [ ] El aviso que aparece al tocar "Reestablecer tour guiado de Pivot" debe decir "Tours guiados reestablecidos".

6. **Notificaciones**
   - [ ] Nueva notificación push cuando se crea una tarea nueva (agregar al catálogo, categoría Tareas; definir a quién llega: todo el equipo activo, excepto quien la creó).

7. **Buscadores de país y prefijo (`ajustes/campos.dart`, `_HojaPais`)**
   - [ ] El texto dentro del buscador debe decir solo "Buscar país" o "Buscar prefijo", según corresponda.

8. **Mi perfil en Equipo (`MiPerfilEditable`)**
   - [ ] Quitar el texto "Esto lo verá todo el equipo en tu ficha".
   - [ ] Unir el teléfono al resto de los bloques (ya es visible por el botón de WhatsApp).

9. **Mi equipamiento**
   - [ ] Sacarlo de Mi perfil en Equipo y moverlo a Ajustes, junto a Excepción de cuota (mismo grupo).

10. **Excepción de cuota (`ajustes/excepcion_screen.dart`)**
    - [ ] Al tocarla, abrir primero un panel (no el asistente):
      - Excepciones aprobadas o rechazadas, con el período de vigencia de cada una.
      - Botón de historial para ver las pasadas.
      - Si no hay ninguna: decir que no tienes y explicar qué son, para qué sirven y cómo se aprueban.
      - Botón para pedir una nueva, que lleva al asistente.
      - Bonito y fácil de usar.
    - [ ] En el asistente, cambiar "¿Quiénes pueden leerla?" por "¿Quiénes pueden leerla y aprobarla?" (solo la aprueban lxs administradorxs elegidxs).
    - [ ] En los textos que dicen que la aprueban administradorxs, decir que solo lxs administradorxs que elijas podrán leer y aprobar tu solicitud.
    - [ ] Poner el recuadro de confidencialidad dentro de la misma sección donde se eligen las personas, como un solo bloque.
    - [ ] En el paso final, donde dice "la leen", poner "la leen y aprueban".

11. **Contactos de emergencia**
    - [ ] Quitar los avatares de los contactos de emergencia (nadie va a subir una foto de esas personas).
    - [ ] Cambiar el título "A quién llamar" por "Contactos de emergencia".

## Después de esta ronda

- Entrega 3: Mi Liga nativa (bandeja "Por revisar" y cinco grupos; Finanzas al final).
