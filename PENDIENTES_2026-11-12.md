> Revisión de ideas del 2026-11-12 (documento "Pivot — Revisión de ideas y hoja de ruta", https://claude.ai/artifact/MqCCxzsXEGrYZr3KBhGXfE): pendiente de las decisiones de Victor; reemplaza el orden de abajo cuando se apruebe.

# Ronda de cambios — app Android (pedida el 2026-11-08, se trabaja desde el jueves 2026-11-12, 17:00)

Antes de empezar: leer MANIFEST.md. Al terminar: actualizar MANIFEST.md y CHANGELOG.md, commit y push.
Reglas de siempre: español neutro (sin voseo), sin pronombres femeninos, "administradorxs" en textos de la app, colores solo en `tema.dart` (`PivotPaleta` / `PivotRadios`), transiciones suaves (fade/slide).

## Lo primero el jueves (Victor: urgente)
- [x] **Prioridad 1 de la auditoría (sección G)** (hecho 2026-11-12, migración 20261112170000; resultados idénticos a los de antes, verificados contra todos los datos):
  - Dejar de traer `log_asistencias` completa en `_ultimaAsistenciaPorPersonaTodas`, `_ultimaAsistenciaRealPorUsuario` y la racha.
  - Añadir los índices.
  - Probar que "Asistiré" se guarda y se ve igual que antes (web y app).

## Pendiente de la ronda anterior

- [ ] Aplicar la migración `supabase/migrations/20261108040000_tareas_recurrentes_estado.sql` (columna `tareas_recurrentes.estado` + cron `push-recordatorio-tareas`). Supabase pide aprobación de Victor. Sin ella, la pantalla "Tareas recurrentes" muestra error.

## Cambios

1. **Loader (`core/cargando.dart`)**
   - [x] Bastante más grande (revisar el tamaño por defecto y los lugares donde se usa).
   - [x] Quitar la cápsula/cilindro inclinado del lado izquierdo en todas las formas; lo demás queda igual.

2. **Degradados en íconos**
   - [~] (en curso: emergencia, desgloses, panel de excepciones y tareas ya los usan; seguir en Calendario y Mi perfil) A Victor le encantaron los degradados y sombreados de los íconos: le dan identidad a la app. Llevarlos a más lugares donde sumen (ej. Equipo, Eventos, Mi Liga) y usarlos de aquí en adelante en lo nuevo.

3. **Emergencia (`equipo/emergencia_screen.dart` y ficha de salud)**
   - [x] Si no hay seguro de salud privado, no mostrar el texto de "se usa salud pública" debajo.
   - [x] Rediseñar la pantalla que se abre al tocar Emergencia en una persona: mostrar solo lo que se sabe; si no hay datos, solo el botón de llamar a emergencias.
   - [x] Estilo más bonito, cómodo y muy visible para un momento de emergencia (botones grandes, contraste alto).

4. **Desgloses de estadísticas en la ficha (`equipo/persona_screen.dart`)**
   - [x] Puntos por asistencia, por racha y por tareas abren hoy una hoja plana. Hacerlos más completos y visuales (ej. resumen arriba, gráfico o barras por mes, detalle por evento o tarea).

5. **Cuenta**
   - [x] El aviso que aparece al tocar "Reestablecer tour guiado de Pivot" debe decir "Tours guiados reestablecidos".

6. **Notificaciones**
   - [x] Nueva notificación push cuando se crea una tarea nueva (agregar al catálogo, categoría Tareas; definir a quién llega: todo el equipo activo, excepto quien la creó).

7. **Buscadores de país y prefijo (`ajustes/campos.dart`, `_HojaPais`)**
   - [x] El texto dentro del buscador debe decir solo "Buscar país" o "Buscar prefijo", según corresponda.

8. **Mi perfil en Equipo (`MiPerfilEditable`)**
   - [x] Quitar el texto "Esto lo verá todo el equipo en tu ficha".
   - [x] Unir el teléfono al resto de los bloques (ya es visible por el botón de WhatsApp).

9. **Mi equipamiento** (ver F.6: ahora va a Yo, no a Ajustes; si Yo todavía no existe el jueves, se deja para la entrega de Calendario + Yo)
   - [x] Sacarlo de Mi perfil en Equipo y moverlo a Ajustes, junto a Excepción de cuota (mismo grupo).

10. **Excepción de cuota (`ajustes/excepcion_screen.dart`)**
    - [x] Al tocarla, abrir primero un panel (no el asistente):
      - Excepciones aprobadas o rechazadas, con el período de vigencia de cada una.
      - Botón de historial para ver las pasadas.
      - Si no hay ninguna: decir que no tienes y explicar qué son, para qué sirven y cómo se aprueban.
      - Botón para pedir una nueva, que lleva al asistente.
      - Bonito y fácil de usar.
    - [x] En el asistente, cambiar "¿Quiénes pueden leerla?" por "¿Quiénes pueden leerla y aprobarla?" (solo la aprueban lxs administradorxs elegidxs).
    - [x] En los textos que dicen que la aprueban administradorxs, decir que solo lxs administradorxs que elijas podrán leer y aprobar tu solicitud.
    - [x] Poner el recuadro de confidencialidad dentro de la misma sección donde se eligen las personas, como un solo bloque.
    - [x] En el paso final, donde dice "la leen", poner "la leen y aprueban".

11. **Contactos de emergencia**
    - [x] Quitar los avatares de los contactos de emergencia (nadie va a subir una foto de esas personas).
    - [x] Cambiar el título "A quién llamar" por "Contactos de emergencia".

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

## Decisión (2026-11-08): los equipos son las categorías
Quindes es la categoría A y Mirlxs la B; se sube o baja según el desempeño (tier). "Para quién aplica" usa esas categorías, más estas audiencias:
- Toda la liga · una o varias categorías · **Solo administradorxs**.
- (Propuesta) **Por rol** (ej. entrenadorxs, comité de eventos), usando los roles de la ficha.

Una tarea o evento "solo administradorxs":
- Solo lo ven ellxs en el timeline.
- Solo ellxs pueden tomarlo.
- El aviso push solo les llega a ellxs.

Al asignar personas en el asistente:
- La lista ya tiene buscador.
- Ahora muestra solo a quienes pueden recibir esa tarea, según la audiencia elegida.

### Cambio de categoría (reglas de Victor, 2026-11-08)
**Cuándo se recalcula**
- **Puntos de tareas**: se acreditan solo cuando admin aprueba la tarea enviada a revisión. Si la rechaza, no hay puntos.
- **Tarea que vence sin enviarse**: se archiva pasada la fecha. La persona no recibe puntos y la tarea se le suelta.
- **Nadie cambia de categoría con tareas en curso o en revisión**: el recálculo espera a que todas se resuelvan (aprobada, rechazada o vencida).

**Qué pasa al cambiar**
- **Respuestas "Asistiré" a eventos futuros de la categoría anterior**: se quitan. Le toca responder a los de su nueva categoría.
- **Asistencias pasadas y puntos ya ganados**: no se tocan.
- **Historial de categoría por mes** (ej. `categoria_mensual`): las estadísticas se calculan contra lo que le aplicaba en cada fecha.
- **Si admins fijaron la categoría a mano** (`tier_modo`): no cambia sola.

**Aviso al abrir la app** (después de cada cambio, en una ventana, no en un toast)
- Contenido:
  - A qué equipo pasa.
  - Por qué, con sus números del período, ej. "2 de 3 clases y 31 de 50 puntos".
  - Qué pasó con sus respuestas a eventos y con sus tareas.
- Botones: "Entiendo" y "Pedir revisión" (en vez de "disputa").
- "Pedir revisión":
  - Mensaje opcional.
  - Llega a lxs administradorxs (push `avisos_admin`).
  - Muestra la lista de administradorxs con llamar o WhatsApp.
- **Mientras está en revisión**: el cambio queda "En revisión" (ver pregunta abierta 2).
- **Admins resuelven** desde la bandeja de Mi Liga: se queda o pasa.
- **Al resolver**: push con el resultado y, al abrir la app, otra ventana que explica la decisión.
- **Al subir de categoría**: la misma ventana en tono de celebración, sin botón de revisión.

### Respuestas de Victor (2026-11-08)
1. **Baúl**: se mantiene. Una tarea vencida se le suelta a quien la tenía y pasa al baúl, donde otra persona la puede rescatar. **Archivadas** = cerradas: las aprobadas y las que admins sacaron del tablero. No se ven en el tablero, pero quedan como historial para puntos y estadísticas.
2. **Mientras está en revisión**: sigue en su categoría anterior y no se le quita nada.
3. **Plazo de 7 días** desde el aviso:
   - La ventana aparece cada vez que abre la app hasta que toque "Entiendo" o "Pedir revisión".
   - Durante esos 7 días sigue en su categoría anterior.
   - Si toca "Entiendo", el cambio aplica en ese momento.
   - Si pasan los 7 días sin respuesta, el cambio aplica solo y ya no puede pedir revisión.
   - Pendiente de definir: plazo para que admins respondan. Propuesta: recordatorio push a admins a los 3 días, sin cambio automático.
4. **Audiencia por rol**: sí, se suma (ej. reunión solo de entrenadorxs, tarea solo para árbitros). Usa los roles de la ficha.

## D. Personalización de la liga en Mi Liga (Victor, 2026-11-08)
Cada liga decide cómo se ve la app según su tamaño. Una sección "Cómo funciona tu liga" en Mi Liga, con interruptores (`config_app`, clave `personalizacion`).

**Valores por defecto**: todo apagado, es decir el comportamiento de hoy, con todo visible para todos. Así nada cambia en la liga actual al publicar.

1. **Equipo dividido por categorías**:
   - Encendido: mi equipo primero, con el selector "Mi equipo · Quindes · Mirlxs · Toda la liga".
   - Apagado: una sola lista como hoy.
2. **Calendario dividido por categorías**:
   - Encendido: el timeline muestra mi equipo más lo de toda la liga, con el mismo selector, y los asistentes de eventos y tareas suman el paso "Para quién es".
   - Apagado: todo para todos y el paso no aparece.
3. **Gestión de tareas**:
   - Qué categorías pueden ver y tomar tareas.
   - Quién crea: solo admins, todo el equipo, o todo el equipo con aprobación previa.
   - Quién asigna a otras personas.
   - Quién valida.
   - Límite de tareas activas.
   - Si se ven las tareas de otras personas en el timeline.
   - A quién llega el aviso de tarea nueva.
   - (Reemplaza la lista de la sección C.)
4. **Audiencias extra**: permitir publicar "solo administradorxs" y "por rol".

**Ideas para que sea fácil de usar**
- **Arriba, dos atajos que encienden un conjunto de interruptores de una vez**:
  - "Liga pequeña: todo visible para todos".
  - "Liga con varios equipos: cada equipo ve lo suyo primero".
  - Después cada interruptor se puede ajustar.
- **Cada interruptor con una vista previa corta** de cómo cambia la app.
- **Cambio de categoría y "Pedir revisión"**: dependen de que la liga use tiers automáticos. Si las categorías se fijan a mano, no hay ventana de cambio.

**Cosas a cuidar al construirlo**
- **El servidor aplica las reglas**, no solo la app: quién puede crear, tomar y ver. Así la web y cualquier versión vieja de la app no se las saltan.
- **La web lee la misma configuración**: al menos no muestra lo que no corresponde.
- **El tour guiado se adapta**: si la liga no está dividida, no habla de equipos.

## E. Personalización completa de la liga (Victor, 2026-11-08)
Amplía D: que Pivot sirva a cualquier liga del mundo, de cualquier tamaño, y que cada liga active solo lo que usa.

**Configuración rápida** (tres botones arriba, cada uno con explicación detallada):
1. **Completo**: todo lo que ofrece la app.
2. **Sin datos personales**: todo menos datos personales:
   - sin nombre legal, documento, dirección, salud ni contactos de emergencia
   - solo nombre derby, número y lo deportivo
3. **Básico**: asistencias, grilla de Equipo, Mi perfil y un Mi Liga reducido.

Abajo, **Avanzado**: cada opción una por una, con una explicación clara de qué hace y qué pasa al cambiarla.

**Qué se puede personalizar**
- **Identidad**:
  - nombre y logo de la liga
  - logo de cada equipo o categoría (se usa como ícono en el selector del calendario y en Equipo; si no hay logo, las iniciales sobre el degradado de la marca)
  - país, zona horaria, moneda e idioma (hoy Ecuador, UTC-5 y USD están fijos en el código)
- **Canales de comunicación**:
  - WhatsApp (grupo y contacto directo), Messenger, Telegram, Instagram, correo, etc.
  - Cuáles se muestran y en qué orden: botones de contacto en las fichas y "Canales de la liga" en Yo/Equipo.
- **Pagos**:
  - si la liga cobra, cuánto (cuota, clases, paquetes)
  - hasta 3 medios de pago (ej. De Una y banco internacional), cada uno con:
    - nombre y datos
    - color de énfasis, elegido de una paleta fija de `tema.dart` para que siempre se lea bien
    - logo opcional de 150×150, con el mismo recorte que la foto de perfil
- **Datos personales**:
  - salud, contactos de emergencia, identidad y dirección, cada uno activable
  - al desactivarlos se borran (ver abajo)
- **Puntos y tiers**:
  - si la liga usa puntos
  - cuántos da cada cosa
  - tiers automáticos o fijados a mano
  - racha
- **Tareas**: activadas o no, y todo lo de la sección D.
- **Administradorxs**:
  - agregar o quitar
  - qué puede ver o hacer cada una, por áreas: personas, eventos, tareas, finanzas, salud y emergencia
  - ej. alguien que gestiona eventos pero no ve datos de emergencia
  - siempre debe quedar al menos un administrador/a con acceso total, y nadie se quita su propio acceso total si es el último

**Borrado de datos al pasar a un modo más básico** (cuidado especial)
- Antes de confirmar:
  - mostrar qué se borra y a cuántas personas afecta (ej. "Se borrarán los datos de salud de 23 personas")
  - pedir que se escriba el nombre de la liga
- **Propuesta**: el borrado queda programado 7 días, se puede cancelar en ese plazo y después es permanente. Evita perder todo por un toque equivocado.
- A cada persona afectada le llega un aviso de que sus datos se borraron.

**Compromiso de privacidad** (texto visible en la personalización, en el registro y en la política de privacidad)
- Pivot guarda solo los datos que tu liga decide activar.
- Nunca los vende, no los usa para publicidad ni los monetiza, ahora ni en el futuro.
- Se cifran en la base de datos y solo los ven las personas autorizadas de tu liga.
- Cada persona decide qué información pone.
- Ojo con la redacción: no decir "Pivot no recolecta datos personales" si una liga activa salud o identidad, porque sí los guarda. Lo correcto es "no los vende ni los usa con otros fines".
- **Antes de la app pública**:
  - política de privacidad formal (Google Play la exige, junto con el formulario de seguridad de datos)
  - revisarla contra la Ley Orgánica de Protección de Datos Personales de Ecuador: los datos de salud son sensibles y piden consentimiento explícito
  - pedir ese consentimiento a cada persona al activar salud o emergencia

**Decisión grande antes de construir E: varias ligas en una sola app**
- Hoy Pivot es una sola liga por base de datos.
- Para que cualquier liga la use hay dos caminos:
  - (a) Una base compartida, con `liga_id` en todas las tablas y reglas (RLS) que aíslen a cada liga. Es lo más escalable.
  - (b) Un proyecto de Supabase por liga. Es más simple de aislar, pero más caro y difícil de mantener.
- Afecta a todo lo anterior, así que conviene decidirlo antes de empezar D y E.

## F. Decisiones de Victor sobre E (2026-11-08)
1. **País, zona horaria, moneda e idioma** se eligen al crear la liga y se pueden cambiar después desde la personalización.
2. **Color de los medios de pago**: paleta fija.
3. **Acceso total**:
   - Quien crea la liga tiene acceso total siempre.
   - Si deja la liga o borra su cuenta, el acceso total pasa a la siguiente persona administradora. Le llega un aviso que explica por qué lo recibe.
   - Si la única persona con acceso total quiere borrar su cuenta, al tocar "Eliminar cuenta" primero debe elegir de una lista a quién se lo pasa. Recién después se borra.
4. **Borrado de datos** al pasar a un modo más básico:
   - Desglose de cuántas personas pierden qué.
   - Se hace efectivo 7 días después y se puede cancelar en ese plazo.
   - A cada persona afectada le llega un aviso con la categoría borrada (ej. "Se borraron tus contactos de emergencia"), nunca el dato en sí.
5. **Redacción del compromiso de privacidad**: "no los vende ni los usa con otros fines", no "no recolecta".
6. **Datos sensibles en Yo, con consentimiento de cada persona**:
   - Excepción de cuota, Salud y emergencia, e Identidad y dirección se mudan a Yo.
   - Mi equipamiento va a Yo también: reemplaza el punto 9 de la ronda, que lo llevaba a Ajustes.
   - **Pantalla de consentimiento**: la primera vez que la persona abre Salud y emergencia o Identidad y dirección:
     - Título "Tratamiento de datos personales y de salud".
     - Términos completos y claros.
     - Dos botones grandes: "Acepto" / "No acepto".
   - **"No acepto"**:
     - Vuelve a la pantalla anterior y no se guarda nada, aunque admin haya activado esos datos.
     - Si cambia de opinión, vuelve a entrar y acepta.
   - Se guarda la aceptación con fecha y versión del texto: si el texto cambia, se pide de nuevo.
   - **Retirar el consentimiento**: si después lo retira, se borran sus datos de esa sección.
   - **Modelo legal propuesto**:
     - La liga es la responsable de los datos de su gente y lo acepta al activar esas secciones.
     - Pivot es quien los guarda por encargo (encargado del tratamiento), cifrados, sin venderlos ni usarlos para nada más.
     - Las secciones sensibles vienen apagadas en las ligas nuevas.
     - Revisión con abogadx antes de la app pública (Ecuador y los países donde se lance).
7. **Varias ligas**: una sola base de datos compartida, con `liga_id` en todas las tablas y reglas en el servidor que aíslan a cada liga. Sin bases separadas.

## G. Auditoría de escalabilidad y seguridad (antes de abrir a otras ligas)
- [ ] **Contexto**: el error de "Asistiré" era que la respuesta no se guardaba o no se veía. Victor lo resolvió subiendo el límite de 1000 filas de Supabase. Eso tapa el síntoma, pero con más ligas vuelve a pasar.
- [ ] **Prioridad 1**: `_ultimaAsistenciaPorPersonaTodas` (index.ts ~línea 267, la que arma las respuestas de cada evento):
  - Trae toda la tabla `log_asistencias` (`.limit(100000)`, hoy ~11.200 filas y crece unas 4.000 por mes) y filtra en memoria.
  - Pasarla a `.in('id_evento', ids)` en lotes, o a una función SQL que devuelva solo la última fila por persona y evento.
- [ ] `_ultimaAsistenciaRealPorUsuario` (~línea 340): trae todas las asistencias reales de la historia. Acotar por período o resolverlo en SQL.
- [ ] Racha (~línea 4199, sin `soloUsuario`): trae todos los registros de Admin. Acotar al período de la racha.
- [ ] Revisar el resto de consultas sin filtro de evento, persona o fecha, y añadir índices en `log_asistencias (id_evento)`, `(nombre_usuario, origen)` y `(fecha_entrenamiento)` (y `liga_id` cuando exista).
- [ ] **Regla para código nuevo**: nunca traer una tabla completa para filtrar en memoria. Toda consulta va filtrada en la base, y si puede crecer sin techo, paginada.
- [ ] Revisar las consultas que pueden pasar de 1000 filas: Supabase devuelve como máximo 1000 por consulta, salvo que se pagine. Ej. asistencias, notificaciones enviadas, historial de puntos.
- [ ] **Índices** en las columnas que se filtran siempre (usuario, evento, fecha, y `liga_id` cuando exista).
- [ ] **Plan de Supabase**: conexiones, tamaño de base, invocaciones de Edge Functions y tráfico. El plan gratis pausa el proyecto si no se usa y tiene límites bajos; para producción con varias ligas, plan pago con copias de seguridad diarias.
- [ ] **RLS activado en todas las tablas** con datos de ligas; revisar los avisos de seguridad y rendimiento de Supabase (advisors).
- [ ] **Prueba de carga simple**: muchas personas marcando "Asistiré" a la vez en el mismo evento.
- [ ] **Monitoreo**: alertas de errores de la Edge Function y del uso del plan.

## H. Inicio de sesión, crear cuenta y crear liga (Victor, 2026-11-08)
**Pantalla de inicio**
- Entrar con Google · con correo o usuario y contraseña.
- Abajo: "Crear cuenta" y "Crear tu liga".

**Crear tu liga**: asistente por pasos, bonito. Las secciones opcionales se pueden saltar y completar después desde Mi Liga.
1. **Deporte y equipos**:
   - Deporte elegido de una lista muy completa, solo deportes de equipo (fútbol, roller derby, bicipolo, rugby, hockey, vóley, ultimate, etc.), cada uno con su ícono.
   - Nombre de la liga, nombre de cada equipo y logo opcional de cada equipo.
2. **Datos de la liga**:
   - Fecha de fundación, redes sociales y contacto.
   - Grupos de WhatsApp (con enlace), Facebook, Messenger, Instagram, etc.
   - Todo esto se ve en una sección **"Comunidad"** dentro de Equipo: tarjetas con el ícono de cada red y botón para unirse o abrir.
3. **Equipamiento** (opcional):
   - ¿Tu liga presta equipamiento? Qué presta, con un inventario.
   - Si se salta: la liga no presta, ni en entrenamientos, ni a personas nuevas, ni a integrantes.
4. **Cuota** (opcional):
   - Cuánto se cobra, por clase o por mes, por equipo.
   - Si se salta: no hay cobros. Si se completó el paso 3, se puede reservar equipamiento sin aprobar pagos.
5. **Tareas** (opcional): qué son, cómo funcionan y opciones de personalización (las de la sección D).
6. **Puntos** (opcional, para ligas competitivas):
   - Mínimo de puntos por asistencia y por tareas, por mes, trimestre o semestre, para entrar o mantenerse en un equipo.
   - Si se salta: la liga no usa puntos. **Pendiente: Victor no terminó la frase "y cualquier persona que…"**.

**Sugerencias para completar el flujo**
- **Cómo entra la gente a una liga**:
  - La liga recién creada genera un enlace y un código QR de invitación.
  - Quien crea cuenta con ese enlace queda en esa liga, con aprobación de admins si la liga lo pide.
  - Sin enlace, "Crear cuenta" pide buscar la liga o ingresar el código.
- **Paso de datos personales** en el asistente: modo Completo / Sin datos personales / Básico (sección E), con la explicación de privacidad.
- **Paso final**: resumen de todo, con "Editar" en cada bloque, y "Crear liga".
- Al terminar, un tour guiado para admins: cómo invitar, crear el primer evento y abrir Mi Liga.
- **Una persona en varias ligas** (ej. juega en una y arbitra en otra): decidir si se permite y cómo se cambia entre ellas.
- **Técnico**:
  - Entrar con Google implica pasar del login propio (token + PIN/contraseña) a Supabase Auth, o enlazar las dos cosas. Es un cambio grande que conviene hacer junto con la base multi-liga (F.7).
  - Si la app sale en iPhone y ofrece Google, Apple exige también "Continuar con Apple".
  - Recuperar contraseña por correo.

## I. Del documento original "Cambios" (revisión 2026-11-13): lo que no estaba en la hoja de ruta
- [ ] **Rectificaciones a un Pivot elegido**: como en las excepciones, la persona puede elegir a qué Pivots enviarla.
- [ ] **Qué llevar, recordatorio configurable**: el aviso de equipamiento a llevar 1 h antes por defecto; cada Pivot puede cambiarlo a 2 o 3 h antes.
- [ ] **Enviar notificaciones (hoy en Mi Liga web)**: versión más completa y bonita en la app, con envío programado en una fecha y hora específicas, además del envío inmediato.
- [ ] **Pago por clase aprobado**: la persona queda como "Asistiré" sola en ese evento (el servidor ya lo hace con Mirlxs); si no puede ir, una hoja con "Cancelar o reagendar". Verificar que en la app sea así para todos los casos.
- [ ] **Precios de clases y cupones en un solo lugar** (hoy son dos pills separadas en la web).
- [ ] **Tesorería, extras** (sumar a la etapa 5):
  - porcentaje de pagos por medio (De Una, banco, efectivo);
  - un tablero con vistas rápidas (saldo, ingresos y egresos del mes, deudas, números rojos);
  - saldo inicial y transparencia como pasos opcionales del asistente de crear liga;
  - consentimiento de quien ve las finanzas y aviso de que Pivot no responde por fondos mal administrados.
- [ ] **Pagos por defecto según categoría**: en el asistente, la categoría A paga por mes y B o C por clase (editable).
- [ ] **Datos sensibles**: siempre que una liga los active, al menos una persona debe poder verlos; cada persona (Pivot o no) elige qué Pivots ven sus datos de emergencia y domicilio.
- [ ] **Partidos y torneos (solo roller derby)**, detalle para la etapa 11:
  - equipos de la liga y de otras ligas en Pivot, invitados por solicitud a sus Pivots;
  - rosters por partido, editables hasta 5 días antes;
  - reglas básicas de pista plana, con tiempos y medios tiempos personalizables;
  - oficiales (SO y NSO) de la liga u otras ligas, con solicitud para aceptar; la app no deja poner a la misma persona como jugadora y oficial del mismo partido;
  - cronograma tipo calendario con tiempos entre partidos (y partidos simultáneos en un torneo);
  - tareas del torneo (anfitriones: preparar la cancha, con fechas límite) y de equipos invitados (firmar documentos, pagar inscripción);
  - adjuntos (ej. documentos legales) visibles para los equipos invitados;
  - merch: inventario y precios visibles para otros equipos;
  - una pantalla de torneos con próximos partidos, invitaciones y pendientes; quizás con lugar propio en la barra.
- [ ] **No se pasan a la app**: "Estado actual del equipo" y "Usuarios" de Mi Liga web (archivar queda en Equipo; eliminar, como último recurso y conservando los pagos).

## J. Ronda del 2026-11-13 (tarde): quedó para después
- [ ] **Saldo a favor o en contra de una persona** (Victor; dinero, necesita su aprobación): ver HOJA_DE_RUTA etapa 5.
- [ ] **Crear liga**: sumar al asistente el canal de comunicación, el país y la zona horaria, las reglas de Categoría/Equipo, las listas de equipamiento (y si hay cosas que una persona tiene de forma permanente) y la regla de pedidos de Pivots (todo ya editable en Ajustes de la liga).
- [ ] **Zona horaria**: se guarda en Ajustes de la liga; aplicarla a horarios, push y cron con la base para varias ligas (hoy todo usa la hora de Ecuador).
- [ ] **Desactivar cobros, planes y cupones**: con Finanzas (etapas 5 y 6).
- [ ] **Inventario**: fotos y etiqueta por artículo.

## K. Notas del 2026-11-13, 14:58 (para la ronda de las 4 p. m.)
0. [x] **BUG (prioridad):** `puntos_mensuales` no suma puntos de asistencia desde octubre (noviembre en 0 para todo el equipo; tareas también en 0). Por eso Tormento no "cumple" con "Solo puntos". Encontrar dónde se escribían (¿al tomar lista? ¿cron?), arreglar y recalcular octubre y noviembre.
1. [x] Tareas: quitar el recuadro rojo de puntos (se consulta en Estadísticas).
2. [x] Tareas recurrentes: no como subsección, sino tarjetas que se deslizan de lado.
3. [x] Bandeja → pagos y reservas: decir dónde se pagó (ej. Deuna, banco internacional) para saber dónde revisar.
4. [x] Inventario (hecho 2026-11-13: secciones, interruptor por lista, Tu equipamiento, botiquín con vencimiento y "Se usó", reglas de préstamo, plazos editables):
   1. Quitar el texto de arriba "Lo libre es para el entrenamiento…".
   2. Íconos más generales y una lista más completa.
   3. Estructura (confirmar con Victor): Inventario → **Equipamiento deportivo** (Con talla · Sets completos), **Insumos de entrenamiento** (conos, cintas…), **Botiquín** (insumos médicos con vencimiento) y **Misceláneos**. Sin los tipos técnicos "unidades/insumo".
   4. El + muestra botones encima (como en Calendario), no una hoja.
   5. Botiquín: qué hay, cantidades, fechas de vencimiento, registrar lo que se usó, avisos cuando falta algo, se usó o está por vencer/venció.
   6. Mi equipamiento: si tenías equipamiento propio, tocar la sección lleva al asistente con "Necesito equipamiento por un tiempo"; si nunca tuviste, deja cambiar talla/protecciones o decir que ya tienes propio. Posible: mover "Mi equipamiento" a Equipo → Inventario y quitarlo de Mi perfil (Victor duda si sobrecarga).
   7. **Reglas de préstamo (Pivots)** con + (como asistencia anticipada): prestar o no, temporal a quien tenía propio, por Categoría/Equipo, con costo o sin costo, por período / indefinidas / que pisan a otras (ej. indefinida "se presta a Quindes sin costo" y del 15-ene al 12-feb no se presta). Poder desactivar el equipamiento de la liga (se oculta, no se borra) y dejar solo insumos/botiquín. Vivirían en Equipo → Inventario.
   8. Respuestas de Victor (15:04): estructura del punto 3 confirmada; "Tu equipamiento" como tarjeta en Equipo → Inventario (sale de Mi perfil); canal "Solo teléfono" en vez de SMS. **Habilitar/deshabilitar**: menú de 3 puntos en la barra de Inventario (Pivots) → pantalla que lista lo que existe en el inventario (si no hay patines, no aparecen) con un interruptor por lista; oculta, no borra. Las reglas (FAB +) deciden **por Equipo**: si se presta o no, con costo o sin costo, y "solo en situaciones excepcionales" (ej. rodilleras mojadas, olvidó el casco): esas se piden desde el Inventario y las aprueba un Pivot. Todo encendible/apagable a gusto del Pivot.
   9. Aclaraciones de Victor (15:11): (a) cualquier lista (patines, protecciones, botiquín, insumos…) se habilita/deshabilita con un interruptor en su tarjeta del Inventario, no con 3 puntos; al apagar pide confirmación. (b) Sin cobro aparte en las reglas: el precio de la clase ya incluye el equipamiento (Mirlxs pagan por clase); la regla solo dice si se presta y en qué casos, y el cobro sigue las reglas de pago del equipo. (c) Casos excepcionales: la persona lo pide, el Pivot aprueba o rechaza y define el plazo: **mismo día** (sin avisos; el Pivot lo lleva y se lo vuelve a llevar), **hasta una fecha** (aviso al Pivot ese día para que lo devuelva) o **indefinido** (aviso cada X días, X lo elige el Pivot). El Pivot puede editar un préstamo activo desde la Bandeja o el Inventario (alargar el plazo, pasar a "se lo lleva a casa").
   10. Regla general (Victor, 15:15): **todo pedido de la Bandeja es editable por un Pivot** (préstamos, excepciones de cuota, reservas, rectificaciones, etc.), también después de aprobado; al editarlo se notifica a la persona afectada. **Cuando se cumple un plazo, siempre se avisa a ambas partes** (la persona y los Pivots).
   11. **Mi Liga completa + Tesorería para la sesión de las 4** (Victor, 15:16): todo lo de HOJA_DE_RUTA etapas 3 (Mi Liga nativa, nav con Finanzas), 5 (Tesorería completa) y 6 (planes, cursos, inscripción rápida, cupones) que se pueda. **Aprobado por Victor (15:20):** todas las migraciones de Tesorería y Mi Liga que solo agregan tablas/columnas (cuentas, movimientos, saldos, fondos de viaje, planes, reglas de préstamo, botiquín); el diseño del saldo a favor/en contra tal como se propuso; conservar el historial de pagos aunque se elimine la cuenta. El aviso legal sigue necesitando su revisión (no publicar textos legales sin preguntarle).
   12. **Mi Liga 100 % completa en Mi perfil** (Victor, 15:20): antes de construir, revisar a fondo TODO lo hablado (este archivo completo —secciones B, C, D, E, H, I—, HOJA_DE_RUTA etapas 3–6 y 9, MANIFEST, el doc original "Cambios" y el historial del chat) y no dejar nada afuera. Incluye: logos de equipos y de la liga, datos de la liga, y **Pivots y permisos** (etapa 4): a quién se nombra Pivot, permisos por área con explicación de qué habilita cada uno (qué puede ver y hacer), quién ve datos sensibles, qué Pivots reciben cada aviso. Victor revisa y prueba después.
   13. Acceso de Pivot (propuesta a Victor, 15:22): quitar el interruptor "Acceso administradorx" de la ficha. El lugar principal es Mi perfil → Mi Liga → **Pivots y permisos** (lista de Pivots con sus áreas, "+" para nombrar a alguien con un asistente: persona → áreas con explicación → confirmar). En la ficha queda solo una fila de atajo ("Pivot · Finanzas, Inventario" o "Nombrar Pivot") que abre esa misma pantalla para esa persona. Quitar a alguien pide confirmación y no puede dejar la liga sin Pivots.
   14. Avisos de Pivot (acordado con Victor, 15:24): en Mi perfil → Notificaciones, un grupo "Avisos de Pivot" que solo muestra los avisos de las áreas que esa persona tiene (ej. solo Tesorería → pagos y reservas por confirmar, pagos atrasados, conciliación). Cada uno se activa o desactiva. Al nombrar a alguien Pivot de un área, esos avisos empiezan encendidos; al quitarle el área, desaparecen y deja de recibirlos. El servidor filtra los destinatarios por área + preferencia (reemplaza a `_adminDestinatariosPush()` sin filtro). En Pivots y permisos, el Pivot principal puede ver quién recibe cada aviso, para que ninguno quede sin destinatario (si nadie lo tiene encendido, avisa).
   15. **Regla de Equipos (Victor, 15:28) — responde la pregunta de Quindes:** la regla es por **mes calendario** y los puntos son **solo de tareas**: "Quindes pide un mínimo de 3 clases asistidas o 5 puntos por tareas al mes". Cambios: (a) `recalcular-categorias` cuenta clases del mes y solo `puntos_tareas` (no asistencia ni rachas) — cambio de cálculo aprobado por Victor; (b) se deja de usar la ventana móvil ("desde el 13 de octubre"); (c) textos de Estadísticas y Tareas: "Quindes pide un mínimo de 3 clases asistidas o 5 puntos por tareas al mes." y, si no llega: "No estás llegando a los mínimos de 3 clases o 5 puntos por tareas al mes. Si sigues así N meses, bajarás a Mirlxs." (N = meses de gracia); (d) los meses para bajar (gracia) y para subir tienen que estar a la vista en Equipos y puntos, como opción clara de cada equipo (hoy están en el último paso del asistente y Victor no los encontró). Revisar el valor actual de gracia de Quindes y decírselo.
   16. Editar un equipo (Victor, 15:30, propuesta pendiente de su ok): el asistente completo queda solo para **crear** un equipo. Al tocar un equipo existente se abre su resumen con filas tocables ("Para mantenerse: 3 clases o 5 puntos de tareas al mes", "Para subir: 3 meses seguidos", "Para bajar: 1 mes de gracia"); cada fila abre solo ese ajuste (hoja corta) con el impacto en personas debajo y Guardar. Así cambiar la gracia es tocar, elegir y guardar.
   17. **Plazos libres en todos los ajustes** (Victor, 15:32): cualquier plazo que defina un Pivot (gracia para bajar, tiempo para subir, período que se mide, recordatorios de préstamos, duración de excepciones, plazos de rectificación, etc.) se elige como **número + unidad** (días, semanas, meses o años), no solo en meses. Un selector común (`SelectorPlazo`) para toda la app; en la base guardar `cantidad` + `unidad` (o días) — migración aditiva, aprobada en el paquete de Mi Liga. En `recalcular-categorias`, "mes calendario" sigue siendo el período por defecto; si el Pivot elige días/semanas, el período se mide hacia atrás desde hoy.
   18. **Cuándo se revisan los equipos** (Victor, 15:33). Hoy: `recalcular-categorias` corre cada vez que termina un evento (cron cada 30 min) con ventana móvil; quien deja de cumplir entra "en riesgo" ese día y baja al terminar la gracia (fecha fija desde ese día); el ascenso cuenta meses cumplidos y puede pasar a mitad de mes. Nuevo ajuste en Equipos y puntos ("Revisión de equipos"): el Pivot elige cuándo se deciden subidas y bajadas — **al cerrar cada mes** (el 1, mirando el mes anterior; default con la regla por mes calendario), **cada N días/semanas** o **un día fijo del mes**. Entre revisiones solo se muestra el avance (Estadísticas), sin cambios de equipo. Mostrar "Próxima revisión: 1 de diciembre" en Equipos y puntos y en Estadísticas.
   18. **Cuándo se aplican los cambios de equipo** (Victor, 15:34; aprobado a las 15:37): hoy `recalcular-categorias` corre cada 30 min tras cada evento finalizado (cron `marcar-eventos-finalizados`); la caída usa `tier_riesgo_hasta` (gracia) y la subida suma 1 por mes. Con la regla por mes calendario eso marcaría "en riesgo" a todos a principio de mes. Propuesta: evaluar **al cierre** en un **día de corte** que elige el Pivot (por defecto el 1 de cada mes, cerrando el mes anterior), automático, con dos modos en Equipos y puntos: "Automático" (se aplica y se avisa a la persona y a los Pivots) o "Revisar antes" (3 días antes del corte llega a la Bandeja la lista de quién subiría o bajaría; el Pivot aprueba, cambia o deja a alguien como está, y lo no revisado se aplica en el corte). Durante el mes solo se muestran avisos amables ("vas 1 de 3 clases"), sin cambios. El Pivot elige el modo, el día de corte y los días de anticipación en Mi Liga → Equipos y puntos (por defecto "Revisar antes"). Si el día de corte quedan cambios sin revisar, se aplican en automático y llega un aviso a los Pivots ("Se aplicaron N cambios de equipo que no se revisaron") con el detalle en la Bandeja; nada queda pendiente. En "Revisar antes" la pantalla explica en una línea, con fechas reales, cuándo llegan y cuánto tiempo hay: "La lista llegará a la Bandeja el 28 de noviembre. Tendrás hasta el 1 de diciembre para revisarla; lo que no revises se aplicará automáticamente ese día." La tarjeta en la Bandeja muestra lo mismo con cuenta regresiva ("Quedan 2 días"), y un recordatorio a los Pivots el día antes del corte si quedan cambios sin revisar.
   19. **Nada fijo en el código** (Victor, 15:40: todo visible y editable por un Pivot). Sugerencias propuestas a Victor para Mi Liga (confirmar en la sesión antes de construir las que él no descarte):
       - Equipos: nombre, logo, color, orden (cuál está arriba), equipo inicial de quien se une, si un equipo se puede saltar (bajar dos de golpe), si ascender requiere aprobación.
       - Qué cuenta como clase: tipos de evento que suman (entrenamiento, scrimmage, partido, externos), si "tarde" cuenta como asistencia, minutos de tolerancia para "a horario".
       - Puntos: cuánto vale cada cosa (a horario 1, tarde 0,5, cada racha, puntos por defecto de una tarea), y el "dividir puntos a la mitad" y "califica para fondos de viaje" que hoy existen escondidos por equipo.
       - Rachas: cuántas clases seguidas forman una racha y cuántos puntos da.
       - Estados que congelan el equipo (lesión, de viaje, técnico, pausa): cuáles existen, si congelan y por cuánto tiempo como máximo.
       - Equipamiento y equipo: si usar equipamiento del equipo obliga a quedar en el equipo inicial (hoy fijo), por equipo.
       - Inactividad: cuántas semanas sin venir para pasar a inactivx y si se avisa antes.
       - Eventos: con cuántas personas se puede cancelar (hoy menos de 5), cancelar solo si nadie tomó lista, cuánto antes se manda el recordatorio (hoy 1 h), hasta cuándo se puede cambiar la respuesta.
       - Rectificaciones: hasta cuántos días después se puede pedir (hoy 30) y cuándo se descarta (hoy 7).
       - Cuota: día de vencimiento, recargo por mora (o ninguno), meses de gracia de pago.
       - Privacidad dentro del equipo: qué ve cada persona de las demás (porcentaje de asistencia, puntos, equipo, cumpleaños), si hay ranking o no.
       - Historial: cada cambio de estos ajustes queda registrado (quién, cuándo, antes/después) en Mi Liga.
   20. **Respuestas de Victor a la lista 19 (15:57) — todo va en Mi Liga, visible y editable:**
       - Equipos: nombre, logo y orden editables. **Enlaces de invitación por equipo**: un enlace para entrar directo a Quindes aplica los requisitos de Quindes al unirse (hoy: equipamiento propio); si no los cumple, entra al equipo inicial. Los requisitos de entrada de cada equipo los edita el Pivot (ej. "al menos protecciones" o ninguno). Bajar dos equipos de una vez: explicado a Victor (con 3+ equipos), pendiente de su respuesta; por defecto, de a uno.
       - Qué cuenta: botón "Todo suma" o "Solo algunos eventos" con interruptores por tipo de evento. Si llegar tarde cuenta y cuánto vale (0,5, 0 o lo que diga el Pivot).
       - Tolerancia de llegada (hoy 15 min): editable. Al tomar asistencia después de la tolerancia, **sugerir** "Tarde" (preseleccionado o destacado), nunca forzarlo: quien llegó 19:13 puede marcarse "A horario" aunque la lista se tome 19:20.
       - Puntos y rachas: valores claros y editables (revisar cuántas clases forman racha hoy y mostrarlo). "Dividir puntos a la mitad" y "Califica para fondos de viaje" en la sección de Puntos y rachas (por equipo).
       - Estados que congelan: cuáles congelan y máximo de tiempo o sin fin.
       - Inactividad, eventos (sugerir cancelar con menos de N personas; siempre se puede cancelar), rectificaciones, cuota y privacidad: editables en Mi Liga.
       - Historial de ajustes: visible los últimos 6 meses (propuesta: guardar más tiempo sin mostrarlo, o borrar a los 6 meses; preguntó Victor, falta su respuesta).
       - **REGLA DE ORO: un cambio de reglas de puntos nunca cambia puntos ya ganados.** Los puntos se calculan y guardan con la regla vigente el día del evento; un cambio aplica desde ese momento en adelante. Guardar en cada regla su fecha de inicio (versionado) para que un recálculo use la regla de cada fecha. Esto vale también para arreglar el bug K.0 (recalcular octubre y noviembre con las reglas de esos meses).
5. [ ] "Categorías/Equipos y puntos" → **"Equipos y puntos"**; donde dice "Categoría/Equipo" pasa a **"Equipo"** (revertir el cambio de hoy).
6. [ ] Equipos y puntos: poder editar también Mirlxs (la inicial) y un + para crear equipos nuevos con asistente completo.
7. [ ] Asistente de puntos: textos más cortos y claros; explicar qué significa "Solo puntos".
8. [ ] Cobros: subsección propia con más personalización: formas de pago (cómo se configuran y a quién aplican), planes (ej. semestre de clases). Va con Finanzas.
9. [ ] Canal de comunicación: quitar SMS; si la liga no usa ninguna de la lista, se usa el número de teléfono (llamar).

## Orden propuesto
0. Prioridad 1 de la auditoría (consultas de `log_asistencias` + índices).
1. Ronda de 11 cambios de arriba y la migración pendiente.
2. A (Calendario + Yo).
3. C y D junto con Mi Liga nativa (primero los interruptores, con todo apagado por defecto).
4. B (audiencias por categoría, administradorxs y roles), encendible desde D.
5. G (auditoría), antes de construir la base para varias ligas.
6. E (personalización completa) sobre la base multi-liga (F.7).
7. H (inicio de sesión, crear cuenta y crear liga), junto con la base multi-liga y Supabase Auth.


## L. Estado al cierre de la ronda de las 4 p. m. (2026-11-13)
- [x] K.0 Bug de puntos · K.1 Tareas sin recuadro rojo · K.2 Recurrentes en carrusel · K.3 Dónde se pagó.
- [x] K.4 Inventario completo (secciones, interruptor, Tu equipamiento, botiquín, reglas y plazos de préstamo).
- [x] K.13 Pivots y permisos · K.14 Avisos de Pivot por área.
- [x] K.15–18 Equipos y puntos (resumen por filas, plazos con unidad, corte con revisión en la Bandeja, aplicación automática y aviso).
- [x] K.19 Ajustes editables: qué cuenta como clase, tarde, tolerancia (sugiere Tarde), puntos versionados (regla de oro), rectificaciones, mínimo de personas, inactividad, logos, enlace de invitación por equipo con requisitos, historial de 6 meses.
- [x] Tesorería (etapa 5) y Cobros → Formas de pago.
- [x] Inicio y cuenta con correo: preparado y apagado (falta activarlo; pedir a Victor).
- [x] Estados que congelan editables con máximo (2026-11-13 noche). Al cumplirse, la asistencia vuelve a contar y se avisa (Victor).
- [x] Privacidad: puntos de otras personas (Victor eligió solo el ranking; asistencia, estado y cumpleaños quedan como están).
- [x] Cuota: día de vencimiento, gracia y recargo fijo (Victor: monto fijo).
- [ ] Rachas y "puntos por defecto de una tarea" editables.
- [ ] Cobros: planes (semestre de clases), cupones por persona o equipo (etapa 6), cursos, inscripción rápida.
- [x] Al pagar la cuota, la persona ve su saldo a favor o en contra y elige si lo usa o lo paga junto (Victor: preguntarle al pagar).
- [ ] Bandeja doc: casillas "En prueba".

## M. Ronda de las 8:30 p. m. (2026-11-13)
- [x] Los 17 puntos del párrafo de la Bandeja: motivos de rechazo, barras de vidrio, "No hay tareas disponibles", FAB del Calendario, Tu equipamiento por tipo de persona, avisos de Pivot por subárea, sin "DeUna", marca de cuenta, borrar o archivar cuentas de Tesorería, llegadas tarde, historial amigable, texto de equipo fijado, pill de asistencia, pestaña Mi Liga, buscador, formas de pago editables.
- [ ] La web antigua (index.html) puede seguir diciendo "DeUna".
- Documento de Mi Liga en Drive: no aparece en Drive (solo "Autorización mayores de 16 años" y "Gestión de cuentas"); lo acordado está en la Bandeja y en este archivo.
- Pendiente de lo acordado en chats anteriores (revisar si sigue en pie): push de pago parcial (Victor lo aprobó en octubre; hoy no hay pagos parciales).

## N. Siguiente tanda (Victor, 2026-11-13 desde las 22:23; se van sumando en la Bandeja)
- [x] Pantalla de carga: quitar el splash con revelado de máscara; solo el logo y fade out a la app.
- [x] Asistencia anticipada → horario: selector de hora con AM/PM (la rueda actual es difícil).
- [x] Asistencia anticipada → "Solo algunos": días primero; los lugares se deducen de los entrenamientos de esos días (sin Cumandá si los lunes solo hay CCI). Horarios: mostrar los de esos días y decir qué entrenamiento afecta; si no afecta ninguno, avisar que se guarda igual por si se crea un evento en ese horario. Decidir qué pasa si luego se crea un evento en un lugar que no estaba.
- [x] Bandeja: cancelar pedidos propios pendientes (Pivots y personas, desde Mis pedidos). Editar = cancelar y pedir de nuevo; preguntar a Victor si quiere edición directa de algún tipo.
- [x] Inventario → Tu equipamiento: solo para equipos que exigen equipamiento propio (Quindes); sin "Necesito equipamiento por un tiempo"; la tarjeta roja de emergencia con ícono de inventario.
- [x] Equipos y puntos → Cuándo se aplican: en Automático el texto dice "Los cambios se aplican apenas alguien cumple o deja de cumplir los requisitos"; ejemplo con los requisitos del equipo en ambas opciones.
- [x] Puntos por asistencia: texto "Los puntos ya ganados nunca cambian".
- [x] Qué cuenta como clase: "Si alguien llega tarde a un evento puntual, ese evento se toma en cuenta de todas formas para el puntaje total y los requisitos mínimos".
- [x] Historial de cambios: tarjetas más claras.
- [ ] Reglas de Equipos y puntos globales o por equipo.
- [x] Puntos a la mitad: hoy solo cambia el número y el orden en la lista de Equipo de la web antigua (`puntosEfectivos`); no cambia requisitos, fondos ni la app. Explicarlo bien o replantearlo (preguntar a Victor).
- [x] Loader siempre centrado (Pivots y permisos y el resto).
- [x] Vencimiento de la cuota: explicación en pantalla.
- [x] "Clase suelta" → "Valor por clase". - [ ] Tipos de equipo (cobro por mes o por clase, equipamiento propio obligatorio, reserva de equipamiento, quién marca Asistiré, cancelar/reagendar): definir con Victor, se elige al crear el equipo y se edita.
- [x] "Tolerancia de llegada" → "Tolerancia para llegadas tarde".
- [x] Rectificaciones: explicar qué son.
- [x] Inactividad: texto más claro.
- [ ] Estados (hecho: sin máximo, Técnico fuera; ya existía la vuelta a Activx al asistir). Falta:  sumar Enfermedad, Situación personal o fuerza mayor y Otro (también en No asistiré de la anticipada); viaje no se congela; quitar Técnico si es estado; al asistir pasa a Activx y se quitan estados y anticipadas con estado. Victor propone quitar el máximo de congelado (contradice lo hecho el 13: confirmar).
- [x] Quitar "Logo de la liga".
- [x] Tesorería: texto cortado bajo el saldo inicial; el cambio de saldo inicial queda en historial_ajustes_liga (antes/después) pero recalcula el saldo hacia atrás.
- [x] **Bug (hecho 2026-11-13):** la app no aplicaba la clase de gracia de Quindes (web: `_quindesGraciaAgotada()` en js/eventos.js, hasta 2 Asistiré o 1 asistencia confirmada en el mes sin pagar y después hoja de cuota pendiente). En `eventos_repo.dart` `motivoSinRespuesta` solo tiene la regla de Mirlxs: Quindes marca Asistiré sin pagar.
- [x] Clases de gracia editables en Mi Liga: cuántas y a qué equipos; con 0 se paga antes de marcar Asistiré y lleva a pagar.
- [x] Tesorería → Cuotas: desglose por mes (quién pagó qué mes, monto, fecha, medio) y quién no ha pagado.
- [x] Formas de pago dentro de Tesorería: cada medio = una cuenta (`cuentaId`), al crear un medio se crea la cuenta. Hoy hay 1 cuenta ("Banco internacional"), los medios tienen `cuentaId` null y 0 movimientos: los pagos aprobados no entraron. Preguntar si se importan los pagos aprobados anteriores.
- [x] **Vital (hecho 2026-11-13, falta ver el día 1 de diciembre):** recordatorios de cuota. Hoy solo el día 1 (cronDiario, Quindes, mira `pagos`/`solicitudes_pago`, tablas viejas). Falta lo acordado en octubre (chat "Notificaciones de la web app"): fuente única de "¿pagó el mes?" (reservas mensuales + cuota_excepcion + pagos), día 1 con punto extra, día 14, día 16, deuda tras la clase de gracia, punto extra por pronto pago con `fecha_pago` (incluye el 15), sin avisos a quien está en revisión, exentx o inactivx; Mirlxs que pagan mensual también.
- [x] Tesorería: registro rápido de "usé plata del equipo" desde el FAB (personas, monto, cuenta, concepto; se divide entre varias) que crea el egreso y la deuda de cada persona. Victor: con Sant usan la billetera del equipo cuando no tienen efectivo.
- [~] Importar a Tesorería los pagos ya aprobados (hecho DeUna y Efectivo; falta decidir Pichincha $265, sin medio $35 y reservas sin medio $195) (Victor: "importa los datos desde lo que se tenga registro") al unificar formas de pago y cuentas.
- [x] Datos de emergencia: la lista de seguros médicos es de Ecuador; que se edite en Mi Liga (agregar, editar, quitar) y, con salud pública, mostrar siempre el número de emergencias del país (casi siempre 911).
- [x] Barras superiores de vidrio en toda la app (salvo emergencia, comunidad y asistente, a propósito).
