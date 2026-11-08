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

---

# Rediseño acordado el 2026-11-08: Calendario, Yo y tareas del equipo

Objetivo: que las tareas del equipo se vean junto a los eventos, para que la gente sepa qué hay para tomar y se involucre más, sin llenar el timeline.

## A. Calendario (antes Eventos) y nueva pestaña Yo
- [ ] "Eventos" pasa a llamarse "Calendario". Se quita la pestaña Tareas y entra "Yo" en su lugar.
- [ ] Barra inferior: Calendario · Equipo · Yo · Mi Liga (admins) · Ajustes.
- [ ] **Yo**: la ficha propia que hoy está en Equipo (foto, estadísticas, desgloses, datos editables), más el resumen de mis tareas y los puntos del mes.
- [ ] En Equipo, el avatar propio queda como atajo a Yo.
- [ ] **Mis tareas en el timeline** en su fecha de vencimiento:
  - Tarjeta compacta, distinta a la de un evento: ícono en degradado del área y puntos.
  - Las vencidas van fijas arriba en una franja roja "Atrasadas".
- [ ] **Tareas tomadas por otras personas**: una línea agrupada por día ("3 tareas vencen este día ›") que se despliega.
- [ ] **Vista de mes**: un puntito distinto para los días con vencimientos de tareas.
- [ ] **Tareas sin tomar**, franja deslizable arriba del timeline:
  - Título "Para tomar · N tareas · hasta +X pts".
  - Primero las sugeridas si me faltan puntos; última tarjeta "Ver todas".
  - No aparece si no hay ninguna.
- [ ] **Ícono de tareas junto a la lupa**, con el número de disponibles, que abre el tablero completo:
  - Lo que hoy es la pestaña Tareas: puntos del mes, filtros por área, sin cupos y baúl.
- [ ] **Detalle de tarea** con el mismo estilo que el detalle de un evento:
  - Cabecera grande en degradado del área, fecha, puntos y quiénes la tienen.
  - Acciones abajo.
- [ ] **Filtros** "Todo · Eventos · Tareas" arriba del timeline; la lupa también busca tareas.
- [ ] **Botón flotante**:
  - Admins: se abre en "Nuevo evento" y "Nueva tarea".
  - El resto: "Proponer tarea", si la configuración lo permite (ver C).
- [ ] **Asistente de tareas más pulido**: vista previa de la tarjeta mientras se arma y áreas en mosaico.
- [ ] **Tour guiado actualizado**: Calendario, franja de tareas, tarea en el timeline, botón de crear y la pestaña Yo.

## B. Por equipo o para toda la liga (para que escale a ligas grandes)
- [ ] Eventos y tareas llevan "para quién aplica": toda la liga, o uno o varios equipos (hoy Mirlxs y Quindes).
  - Se agrega como un paso en los dos asistentes.
- [ ] El timeline muestra por defecto lo de mi equipo más lo de toda la liga, con un selector arriba:
  - "Mi equipo · Quindes · Mirlxs · Toda la liga". Admins ven todo.
- [ ] Una tarea de un equipo solo la puede tomar alguien de ese equipo.
- [ ] Las notificaciones, recordatorios y el % de asistencia respetan a quién aplica. Un evento solo de Quindes no baja la asistencia de Mirlxs ni les llega aviso.
- [ ] Equipo se organiza igual: mi equipo primero, con el mismo selector.
- [ ] La web debe respetar el campo nuevo (al menos no romperse ni mostrar mal).

## C. Gestión de tareas en Mi Liga (configuración de admins)
- [ ] **Quién puede crear tareas**: solo admins, o todo el equipo.
  - Opción "pasan por aprobación antes de publicarse": evita spam en el timeline.
- [ ] **Quién puede asignar tareas a otras personas.**
- [ ] **Quién valida**: admins, o también quien creó la tarea.
- [ ] **Límite de tareas activas por persona** (hoy `config_tareas.limite_tareas_activas`).
- [ ] **Puntos de tareas propuestas**: los define admin al aprobar.
- [ ] **Si se muestran las tareas de otras personas en el timeline** (sí/no).
- [ ] **Aviso de tarea nueva**: a todo el equipo, solo a quienes aplica, o a nadie.

## Pregunta abierta (decidir antes de construir B)
- Mirlxs y Quindes hoy son **tiers**: se recalculan solos por asistencia y puntos, así que una persona puede cambiar de uno a otro de un mes a otro. Si el timeline se separa por tier, lo que ve cambiaría solo.
- Alternativas:
  - (a) Usar el tier tal cual: simple y sirve para esta liga.
  - (b) Crear "equipos" fijos que asignan admins (ej. selección, equipo B, árbitros), con tiers aparte para puntos y cuota. Es lo más escalable para ligas grandes, y aquí se podría arrancar con dos equipos que copien los tiers actuales.

## Orden propuesto
1. Ronda de 11 cambios de arriba y la migración pendiente.
2. A (Calendario + Yo).
3. C junto con Mi Liga nativa.
4. B, cuando se decida la pregunta abierta.
