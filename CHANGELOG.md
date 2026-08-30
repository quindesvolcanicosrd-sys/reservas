# Changelog

Historial de cambios del proyecto, reorganizado por área a partir del MANIFEST.md anterior (que mezclaba estado actual + historial en un solo archivo de ~7000 líneas). Dentro de cada sección, más reciente primero. Las fechas exactas están confirmadas cuando el MANIFEST las traía en formato ISO; el resto del historial (desarrollado a lo largo de 2025 y 2026 sin registrar fecha por entrada) queda con el mes/año aproximado que se pudo inferir del contexto (migraciones con fecha en su nombre, menciones explícitas de mes, o posición relativa en el archivo original).

## Eventos

2026-08-30 — Batch 6: 4 ajustes del tour guiado (gradiente hasta el borde, texto de "Detalle del evento", ícono de "Siguiente", botón final centrado).
2026-08-30 — Batch 2: 2 tours nuevos ("primera reserva"/"cambio de tipo de cuenta") reusando el motor de tour existente; scroll-to-today confirmado.
2026-08-30 — Batch 1: gradiente del tour más oscuro, título consistente entre pasos, pasos faltantes para Quindes, 2 textos ajustados.
2026-08-29 — Reversión del Cambio 64: mini-tours puntuales (RSVP/cancelado/llegada) eliminados por completo a pedido de Victor.
2026-08-29 — Fix conjunto #4: orden de "Tu equipamiento" en el tour, gradiente sin tapar el borde, texto del FAB para admin.
2026-08-29 — Fix conjunto #3: spotlight más oscuro y glow de marca en el tooltip del tour.
2026-08-29 — Fix conjunto #2: texto "Ir a hoy" más corto, texto dinámico del FAB según perfil, filtro de pasos del tour por visibilidad real.
2026-08-29 — Fix conjunto: español neutro en el tour, gradiente más alto, mini-tours re-anclados al detalle, borde de marca en el tooltip.
2026-08-29 — Cambio 64: mini-tours puntuales de una sola vez para RSVP, evento cancelado y llegada registrada (revertido al día siguiente, ver arriba).
2026-08-29 — Cambio 63: fix del tour guiado — spotlight, pasos nuevos, bugs de navegación y scroll.
2026-08-28 — Cambio 52: control de tier admin [Quindes | Auto | Mirlxs] en el perfil de Equipo, con fade del termómetro al cambiar de modo (frontera Equipo/Eventos, ver también sección Equipo).
2026-08-28 — Cambio 50: tour guiado — halo dinámico reemplaza `.ev-tour-halo` CSS por un `div` calculado en JS con `getBoundingClientRect()`.
2026-08-28 — Cambio 49: fix de stacking context del tour — eleva el ancestro fixed/sticky más cercano en vez del target hijo.
2026-08-28 — Cambio 47: tooltip del tour más ancho (320px) + overlay sutil reintroducido + fix de tour flotante al cambiar de sección.
2026-08-28 — Cambio 46: fix real — `background`/`color` fusionados en una declaración CSS inválida en `#ev-tour-tooltip`.
2026-08-28 — Cambio 44: Opción D del tour — sin overlay/spotlight, tooltip sutil con halo punteado + flecha dinámica.
2026-08-28 — Cambio 43: reversión de la fila de navegación del tour (vuelve "Omitir", se saca el contador/chevron); fix de dark mode en el spotlight.
2026-08-28 — Cambio 42: tour — fila de navegación con chevron "volver"/contador de pasos + fix de z-index (target oscurecido por el overlay).
2026-08-28 — Cambio 41: tour — lente menos oscura + link "Omitir" acortado.
2026-08-28 — Cambio 40: tour guiado interactivo (spotlight/coach-marks) reemplaza el banner rotativo de sugerencias.
2026-08-28 — Cambio 38: campo "Hora de finalización" agregado al wizard de creación de eventos (recurrentes y únicos).
2026-08-28 — Limpieza de datos: 3 filas duplicadas del venue "Cumandá" borradas de producción.
2026-08-28 — Cambio 37: FAB "+" de Eventos rediseñado para Quindes — 4 variantes según admin/cuota, siempre solo-ícono en ese modo.
2026-08-27 — Cambio 36: Bug 1 — cancelar evento no limpiaba asistencia real ni bloqueaba volver a marcarla; Bug 2 — doble submit creaba venue duplicado al crear evento.
2026-08-27 — Cambios 33/34/35: "Reservar esta clase" salta directo a "Realiza tu transferencia" (límite real a los próximos 6 vía `getFechasDisponibles`); 9+9 ajustes de texto/formato en "Pago registrado" (flujo por clase y por mes).
2026-08-27 — Cambio 32: "Reserva por mes" del speed-dial preselecciona mes actual (o siguiente si ya pagado); modal de "reserva pendiente" al marcar Asistiré tras pagar.
2026-08-27 — Cambio 31: timeline/calendario deja de filtrar eventos futuros por perfil (cuota/equipo/Mirlxs-Quindes) — visibles para todo perfil.
2026-08-27 — Cambios 25–30: FAB "+" unificado de Eventos (reemplaza 3 FAB previos + el "+" de la nav), quita "Reservar" de las cards; 2 rondas de bugs del speed-dial "Reserva por clase/mes"; `cargarFechas()` pisaba `E.tipoPago`; rediseño del FAB a ícono+texto "Reservar"; "Reserva por clase" no volvía al timeline al terminar.
2026-08-24 — Cambio 24: bloquear RSVP "Asistiré" cuando ya existe una reserva mensual pendiente de aprobación para ese mes.
2026-08-24 — Cambio 23: 8 bugs de Eventos/Mi Liga (fade del pill informativo, estilo de "Rectificar asistencia", modal de confirmación, tile de rectificaciones, FAB oculto en detalle + reserva inline, dots del calendario filtrados por timeline).
2026-08-24 — Cambio 19: sheet "Solo esta clase / Todo el mes" recordado por sesión; FAB mensual oculto durante reserva por clase y wizard de pago.
2026-08-24 — Cambio 17: pills de información con referencias visuales inline; fix de text-transform en botón cancelar/re-agendar.
2026-08-24 — Cambio 16: ícono de nav de Eventos, "Nuevo evento" movido al header (admin), panel de calendario ya no tapa el pill banner.
2026-08-23 — Cambios 6–12: `a_horario`/`tarde` invisibles en eventos pasados; timeline no reflejaba una marca de asistencia sin recargar; fallback a `a_horario`/`tarde` se salteaba con eventos solo-RSVP; sistema `estado_miembro`; 2 bugs de asistencia real en la card del timeline; criterio de "pasado" inconsistente en el render inicial; salvaguarda de re-lectura cuando `E.nombre`/`E.datos` terminan de confirmarse.
2026-08-21 — Cambio 5 + tanda de 7 pedidos: navegación "atrás" desde s4 vuelve a Eventos cuando viene del timeline; FAB mirlxs con equipo propio + filtro por `fechaIngreso`; re-render del timeline al guardar talla/protecciones; RSVP vs Reservar según cuota para mirlxs con equipo propio.
2026-08 (aprox., previo al 21) — Asistencia anticipada: frontend completo nuevo (wizard, resumen, conflicto de reglas), conectada primero a Apps Script y luego migrada a Supabase directo; iteración larga sobre el wizard (de 4 a 2 a 3 pasos, reveal inline de frecuencia, paso 0 explicativo, pill "Todo tipo de evento", condición de carrera al salir de la pantalla, footer flotando fuera de contexto, nav inferior invisible por z-index).
2026-08 (aprox.) — "Gestionar venues": guardado real contra Supabase (corrección de 4 nombres de columna reales — `inicia`/`google_maps`/`tipo`/`dias`, `lat`/`lng` inexistentes), wizard de 3 pasos, recurrencia deseleccionable, hora opcional, editar/borrar desde la lista, mapa interactivo + Places para "Ubicación" (reemplaza el input de link pegado).
2026-08 (aprox.) — Wizard "Crear evento": rediseño completo a pasos dinámicos según tipo (antes 3 pasos fijos); flujo "Descanso" simplificado a 1 paso con calendario de rango; pill "Otro" en categoría; card "Agregar lugar" con borde punteado; fix de que los eventos nuevos no aparecían en el timeline sin F5.
2026-08 (aprox.) — Hub "Editar evento": pantalla de página completa reemplaza el bottom sheet anterior; guardado real vía PATCH directo a PostgREST (la acción `adminEditarEvento` nunca llegó a implementarse en el backend); 2 pasos (datos editables / alcance individual-desde acá-por período).
2026-08 (aprox.) — "Marcar asistencia" (rollcall admin): diseño final consolidado como subpantalla dedicada, tras 2 diseños intermedios descartados (roster en la card, roster inline en el detalle); roster completo del equipo precargado + slider de 2 estados por persona; enriquecido con Nombre Derby y foto.
2026-08 (aprox.) — "Rectificar asistencia": un usuario puede pedir corrección de su asistencia real ya marcada; flujo de aprobar/rechazar desde Mi Liga.
2026-08 (aprox.) — "Cancelar evento": pasa de botón al fondo del contenido a ícono en el nav + bottom sheet de confirmación (reemplaza `confirm()` nativo); fix de que la asistencia real no se limpiaba al cancelar.
2026-08 (aprox.) — Temporadas de descanso (offseason) en el timeline: creación desde el FAB, lectura vía fetch directo a PostgREST, edición/borrado desde el timeline.
2026-08 (aprox.) — "Evento único": flujo de creación propio (antes placeholder "Próximamente").
2026-08 (aprox.) — Video instructivo de cómo llegar (columna `video_instructivo` en `venues`), pill visible en la card/detalle.
2026-08 (aprox.) — Distinción Mirlxs/Quindes en Eventos, por fases: `_modoUsuario()` nuevo leyendo `equipo.categoria`; top bar y banner de sugerencias condicionados al modo; bottom sheet "safe zone" al tocar una card de Entrenamiento (modo equipamiento); FAB "Nueva reserva" en Eventos; gracia de 1 Entrenamiento libre/mes para RSVP de Quindes sin cuota + sheet "¿Cómo querés reservar?"; Asistencia Anticipada exclusiva de Quindes; bypass total de filtros de cuota/reserva para admin y Quindes; eliminado el 3er modo `'equipamiento'` de `_modoUsuario()` a favor de que solo `categoria` decida.
2026-08 (aprox.) — Selección múltiple de clases sin salir del timeline: botón "Reservar" en cards de Entrenamiento (equipo del club, próximas 6), selección múltiple con footer sticky, gate de "cuota al día" antes de marcar RSVP.
2026-08 (aprox.) — Feature "Excepción de pago" (ausencias justificadas/dificultad económica): solicitud de socix + aprobación admin.
2026-08 (aprox.) — Filtro de timeline para cuentas con equipo prestado del club: se ocultan eventos "irrelevantes" (Entrenamientos futuros fuera de ventana de reserva, pasados sin asistencia registrada).
2026-08 (aprox.) — Sistema de tiers (categorías automáticas Quindes/Mirlxs): `_modoUsuario()` lee `equipo.categoria`; Fase B agrega UI admin de `config_tiers` dentro de Mi Liga.
2026-08 (aprox.) — Generación de eventos recurrentes migrada de Apps Script (`_mantenerVentanaAsistenciasInterno`, trigger cada 15 min) a `regenerar_ventana_asistencias()` nativa de Postgres vía pg_cron.
2026-07/08 (aprox.) — Rediseño grande del timeline/calendario (múltiples sesiones iterativas): unificación en un timeline único que fusiona pasados+hoy+próximos (reemplaza el sistema de tabs Semana/Calendario/Lista anterior); calendario expandible simplificado de 3 a 2 estados; auto-colapso por scroll y drag-to-dismiss en vivo; búsqueda y filtros fusionados en un solo ícono/panel; RSVP de las cards rediseñado varias veces (de barra de 3 botones a botón único + acordeón, y vuelta a barra de 3 botones); pills de estado unificadas entre card y detalle; fade/transición de altura del calendario entre meses de distinta cantidad de semanas, con varias rondas de fixes de secuencia y timing; scroll a "hoy" corregido con `_evOffsetAbsoluto()` (inmune a transform en curso) tras diagnóstico con Playwright; costura visible en el sticky apilado del detalle; card de cumpleaños con avatar circular real, confetti acotado a hoy y ajustado en densidad/velocidad varias veces; ícono del tab "Eventos" cambiado de `event` a `campaign`.
2026 (fundacional, sin fecha exacta) — Backend Tanda 1 de Eventos: 6 funciones nuevas documentadas para Apps Script (`Code.gs`, sin acceso desde el repo); Tanda 2: estructura estática completa (Semana/Calendario/lista/"Ver todos") sobre datos de prueba; Tanda 3: conexión a datos reales, eliminados `_evGenerarDemo()` y los datasets demo.

## Tareas

2026-08 (aprox.) — Tareas por validar / Gestión de tareas activas dejan de ser subpantallas detrás de un ícono "Administrar" y pasan a ser 2 secciones más del tablero fusionado (4ta y 5ta, admin-only).
2026-08 (aprox.) — Fusión de Tareas en una sola pantalla con scroll (reemplaza el pill-toggle Disponibles/Mis tareas); selector de salto rápido en el header.
2026-08 (aprox.) — Rediseño de card + detalle según 2 mockups; bug real corregido en "A cargo"; límites de caracteres en el wizard "Nueva tarea".
2026-08 (aprox.) — Vista admin "Gestionar tareas activas" (3ra opción del FAB); pills de card rediseñadas (Área/Cupos/Puntos/Fecha límite con color dinámico).
2026-08 (aprox.) — Ajustes puntuales varios: pill de Área integrada al ícono de tipo, toggle animado en gestión de tareas activas, fix de duplicación de personas, distinción vencidas/completadas en Archivadas, "Archivar tarea" movida a ícono en la esquina, pill "Aprobada" quitada por redundante, paso "Notas" fusionado en "Descripción de la tarea".
2026-08 (aprox.) — Buscador+filtros compartido (Área/Personas/Puntos/Mes/Estado final) y bug de ancho en Tareas archivadas corregido.
2026-08 (aprox.) — Detalle de tarea nuevo (`#s-tareas-detalle`, mismo esqueleto que el detalle de evento) con edición/gestión de personas/borrado admin; cards simplificadas (área como pill, cupos fuera de la lista).
2026-08 (aprox.) — Sección "Tareas" completa nueva: tablero con cupos + wizard de creación admin + panel de validación admin, sobre backend Apps Script ya desplegado (`getTareasDisponibles`/`getMisTareas`/`tomarTarea`/`soltarTarea`/`enviarRevisionTarea`/etc.).
2026-08 (aprox.) — Migración de Puntos y Tareas a Supabase completa (incluye el sistema "Baúl de Tareas").
2026-08 (aprox.) — Fix real: botón "Continuar"/"Crear tarea" del wizard tapado por la nav inferior, corregido a fijo arriba de la nav (mismo criterio que Crear evento/Reservas).

## Equipo

2026-08-30 — Batch de 7 pedidos re-auditado contra código real: 1 bug real revertido, 1 mejora CSS aditiva, 1 deploy pendiente resuelto, 5 ya cubiertos por batches anteriores.
2026-08-30 — Bug 4 re-confirmado sin cambios + Bugs 11/12 rediseñados: acordeón "INACTIVOS" reemplaza el ocultamiento directo.
2026-08-30 — Pedido rechazado: "migrar recalcularStatsEquipo/recalcularStatsUsuario al Edge Function" — premisa falsa, contradecía código ya funcionando.
2026-08-30 — 3er pedido puntual: Bugs 2 (repetido), 5 (lista) y 9.
2026-08-30 — Fix conjunto: Bug 2, 2do intento — `max-height:'none'` en vez de medir `scrollHeight`, instrucción puntual de Victor.
2026-08-30 — Batch 9: re-auditoría de 10 bugs "resueltos" que seguían rotos en producción.
2026-08-30 — Batch 8: `recalcularStatsUsuario()` conectado a cada escritor real de asistencia (`adminMarcarAsistencia`, rectificación aprobada).
2026-08-30 — Batch 7: 12 bugs de Equipo + 2 investigaciones (stats tras marcar asistencia, "Recalcular ahora" de Mi Liga).
2026-08-30 — Batch 5: FAB de Eventos visible por error en Ajustes, reserva mensual con equipo del club, barrido al volver a Ajustes, empty state de Tareas antes de tiempo.
2026-08-30 — Batch 4: username editable en Mi Perfil, rol de equipo, estadísticas + estado, lesión reubicada; rol en detalle de Equipo, búsqueda inteligente, stats inline.
2026-08-30 — Batch 3: 3 bugs — lista de Mirlxs truncada, parpadeo al marcar favoritos, favorito sin estado activo en el detalle.
2026-08-29 — Cambio 62: fix de filtro de eventos en stats/categorías — filtrar por `estado = 'Evento Finalizado'` en vez de una lista negra que no matcheaba.
2026-08-29 — Cambio 61: 6 fixes puntuales — pre-carga del roster, autoexclusión de la lista, fecha de ingreso en el detalle, nav de detalle consistente, WhatsApp con código de país real, fade del ícono de favorito.
2026-08-29 — Cambio 60: fix `primerDiaMesesAtras()` — ventana de N meses exacta en vez de "primer día del mes".
2026-08-29 — Cambio 59: termómetro con datos reales (`equipo.termometro_pct`, calculado junto con `categoria` por `recalcular-categorias`).
2026-08-29 — Cambio 58: stats reales desde asistencias (`horas_ano`/`asistencias_ano`/`total_eventos_ano`, migración `20260829_stats_equipo.sql`).
2026-08-29 — Cambio 57: acordeones "Categoría"/"Estado" del perfil de detalle, colapsados por default.
2026-08-29 — Cambio 56: stats movidas de Ajustes general a "Mi perfil".
2026-08-29 — Cambio 55: Equipo conectado a Supabase — `_EQ_EQUIPO_DEMO` reemplazado por `getEquipo()` real; Edge Function nueva `recalcular-categorias`.
2026-08-29 — Cambio 54: flujo de lesión — usuario reporta desde Ajustes, queda pendiente hasta aprobación admin.
2026-08-28 — Cambio 53: gestión admin de miembro (estado/cuota/admin) desde el perfil de Equipo.
2026-08-28 — Cambio 52: control de tier admin [Quindes | Auto | Mirlxs] en el perfil, con fade del termómetro al cambiar de modo.
2026-08-28 — Cambio 51: bloque de stats en Ajustes (`#dat-stats-wrap`) — horas, asistencia, termómetro del usuario logueado.
2026-08-28 — Cambio 48: íconos Material Symbols en las stat cards + barra de rango horizontal con contexto por rol.
2026-08-28 — Cambio 45: sección Equipo, greenfield completo — lista con favoritos/grupos colapsables + perfil de detalle (nuevos `js/equipo.js`/`css/equipo.css`).

## Reservas

2026-08-27 — 9 ajustes de texto/formato en "Realiza tu transferencia"/"Pago registrado" (flujo por clase y por mes).
2026-08-24 — Cambio 21: registrar pago en efectivo desde admin (Mi Liga → Miembros); auto-RSVP "Asistiré" al pagar una reserva por clase.
2026-08-24 — Cambio 18: degradación automática de categoría Quindes → Mirlxs al guardar equipamiento.
2026-08 (aprox.) — Cupón de descuento agregado a `s-pago`; fix de race condition del cupón en `cargarFechas()`; crédito ("clase a favor") deja de marcarse consumido si la reserva gratis que lo usó no se guardó realmente.
2026-08 (aprox.) — `getFechasDisponibles`/`getProximosEntrenamientos`/`getReservasPersona` cambian `fecha` de texto legible a `id_evento` — fix de ids crudos mostrados en pantalla; `_parseFechaStr` con null guard.
2026-07/08 (aprox.) — Rediseño de la card de reserva en `#s-home`: fecha+hora fusionadas en un renglón ("Este Viernes a las 14hs"), pill de ubicación al lado del título (no debajo, con fallback a 2da línea si no entran juntos), acordeón "Más información" con equipo/talla/protecciones, badge de estado rediseñado reusando `.badge-*` en vez de una barra full-bleed propia; varios fixes de texto ("hshs" duplicado), de acordeón que abría de golpe pero cerraba suave, y de pills mudándose dentro/fuera del acordeón en sucesivas pasadas.
2026-07/08 (aprox.) — Home: nav rediseñado (`#home-nav`), footer fijo de `#s-home` eliminado (sus 2 acciones se mudan a la nav); "Re-agendar o cancelar" pasa a estar siempre visible en la card; ícono de historial oculto si no hay reservas pasadas; empty-state con ícono clickeable + badge "+".
2026-07/08 (aprox.) — s4: panel de total (`#s4-total-box`→`#s4-total-fijo`) migrado a `.cta-footer-fixed` (fuera de `.card`, para no perderse al scrollear); selector de tipo de pago a segmented control con slider animado; nuevo `#modal-equip-aviso` cuando hay fechas agotadas por equipamiento.
2026-07/08 (aprox.) — Bottom sheet de talla (`#sheet-talla`) compartido entre "cambiar talla de una reserva ya creada" y "elegir talla alternativa solo para esta fecha"; flujo de "Cambiar talla"/"Cambiar protecciones" añadido desde Mis Reservas y desde Home.
2026-07/08 (aprox.) — Rediseño completo de `#s-misreservas` (historial); overlay `#modal-agotada-overlay` y selector de cupón nuevos; 3 fixes sobre el flujo de fecha agotada.
2025–2026 (fundacional) — Buildout original del flujo s1→s6: selector de meses unificado en s4, cards de selección rediseñadas, checkbox "ya pagué", botones de pago DeUna/Banco Internacional con logos oficiales, fusión de s5→s6 (pantalla de éxito con resumen completo), eliminación del campo "Referencia de pago", loaders reemplazados por skeletons/spinners inline en vez de overlay de pantalla completa, WhatsApp con ícono SVG oficial en vez de emoji.

## Asistencias

2026-08 (aprox.) — `log_asistencias` documentada como mezcla de 2 conceptos por fila (RSVP pre-evento vs. rollcall real de admin) — fuente de un bug recurrente (RSVP mostrándose como "marcado por un admin"), corregido filtrando por `origen==='Admin'` antes de leer como asistencia real.
2026-08 (aprox.) — Regla de negocio: puntualidad (confirmada por admin) y rol (RSVP "No jugador"/jugador) se combinan en un solo texto ("Llegó a horario · No jugador") en vez de que una pise a la otra.
2026-08 (aprox.) — Bug real: `adminMarcarAsistencia` siempre retornaba `exito:true` sin capturar errores reales de escritura — corregido para propagar el error real.
2026-08 (aprox.) — Bug real: `_ultimaAsistenciaPorPersonaTodas` truncaba en silencio a 1000 filas (`max_rows` de PostgREST) — corregido primero con `.range(0,9999)`, luego con `.in(idsEvento)` (fix definitivo).
2026-08 (aprox.) — Migración de "Log de asistencias" a Supabase, completa y verificada de punta a punta.
2026-08 (aprox.) — Migración de "Asistencias" a Supabase, etapas 1–3 completas (incluye 254 filas históricas migradas desde Sheets; disponibilidad de cupos calculada contra la tabla real).
2026-08 (aprox.) — Feature "Rectificar asistencia" — tabla `rectificaciones_asistencia` nueva, solicitud del usuario + aprobar/rechazar desde Mi Liga, aplica el mismo mecanismo que `adminMarcarAsistencia`.
2026-08 (aprox.) — 3 estados de asistencia real ("A horario"/"Tarde"/"Ausente"+"Sin registrar") unificados en un solo componente `.ev-estado-pill` en todos los contextos.

## Perfil

2026-08 (aprox.) — "Cerrar sesión"/"Eliminar cuenta" mudados del fondo de `s-datos` a "Mi perfil" (`aj-sub-perfil`).
2026-07/08 (aprox.) — Rediseño completo de las 7+1 subsecciones de "Ajustes del perfil" (perfil/contacto/privacidad/legal/dirección/emergencia/equipamiento) con filas `.aj-dato-row` en vez de formularios con "Guardar cambios"; sheet de país expandido a ~195 países con buscador; Google Places Autocomplete para Ciudad/Dirección.
2026-07/08 (aprox.) — Wizard de "Ficha de salud" reconstruido varias veces: patrón "Otro" rediseñado en los 4 lugares donde existe, paso de Seguro privado convertido a pills multi-selección, resumen con filas de solo lectura + mecanismo de "editar" explícito (antes sugerían edición directa sin serlo), toast de "completar de nuevo" quitado.
2026-07/08 (aprox.) — Sistema de avatar unificado (`.avatar-pill`, círculo simple) tras 2 iteraciones descartadas (cápsula rotada 45° estilo Pivot, luego rectángulo horizontal) — reverts confirmados explícitamente por Victor.
2026-07/08 (aprox.) — Feature de cambio de foto de perfil: recorte con Cropper.js + subida al backend (`js/foto.js` nuevo); bug grave corregido — el recorte final no correspondía a la selección visual (causa real: chrome default de Cropper.js interfiriendo con la máscara `.crop-area`).
2026-07 (aprox.) — Modal de primer login (`#modal-permisos`) rediseñado con toggles tipo botón; nueva protección de PIN configurable desde ahí; bloqueo real de menores de 16 años.
2025–2026 (fundacional) — Rediseño de `s-datos` → "Ajustes del perfil"; wizard de datos de identidad/dirección/emergencia construido incrementalmente sobre múltiples sesiones.

## Admin (Mi Liga)

2026-08 (aprox.) — UI admin de `config_tiers` ("Categorías") integrada dentro de Mi Liga, no como sección nueva (Fase B del sistema de tiers).
2026-08-24 — Cambio 20: cambiar categoría desde admin (Mi Liga → Miembros).
2026-08-24 — Cambio 21: registrar pago en efectivo desde admin (Mi Liga → Miembros).
2026-08 (aprox.) — "Mi Liga" sale de Ajustes y pasa a ser su propio tab de la nav inferior (`s-miliga`), visible solo para admins; una cuenta admin pura loguea directo ahí.
2026-07/08 (aprox.) — Rediseño del panel admin en 7 tandas sucesivas: dashboard `s-admin-home` inicial → banners + burbuja de notificación + "container transform" de tiles → revertido el container transform, unificados emojis/inputs → "Ajustes adicionales" (color de énfasis + precios) y Mi Liga embebido en Ajustes → reemplazo de controles nativos rotos en mobile por componentes propios → acordeones "Color"/"Precios" corregidos → simplificación final confirmada por Victor: `s-admin-home` eliminada por completo, Mi Liga queda como único lugar administrativo de la app.
2026-07 (aprox.) — Decisión cerrada: "Usuarios" (ver/eliminar cuentas) queda fuera de Mi Liga, como pantalla propia separada.
2026-07 (aprox.) — `_adminVentanaFecha()` (banner de equipamiento del dashboard): bug de mezcla UTC/local corregido.
2025–2026 (fundacional) — Ruteo post-login por `dashboardAdmin`; primer dashboard admin base.

## Nav / UI

2026-08 (aprox.) — Consistencia de tamaños en toda la nav superior: auditoría encontró 4 tamaños de botón-ícono distintos solo en Eventos — todos migrados a `.app-nav-icon-btn`/`.app-nav-title` (44×44px, `border-radius:12px`, ícono 18px).
2026-08 (aprox.) — Preservación de estado por tab de la nav inferior generalizada (antes solo Ajustes lo tenía): cada tab recuerda su última sub-pantalla y la restaura al volver desde otro tab; solo tocar el tab ya activo resetea a la raíz.
2026-08 (aprox.) — Nav inferior siempre visible en toda sub-sección autenticada (los 9 `aj-sub-*` de Ajustes, `s-misreservas`/`s6`/`s-pago`/`s-gestionar`, `s-eventos-detalle`) — antes solo la pantalla raíz de cada sección la mostraba.
2026-07/08 (aprox.) — Bug real: gesto de "atrás" saltaba a login con la sesión todavía activa al hacer popstate a una pantalla no cubierta por el allowlist — `_esPantallaAlcanzable()` nuevo, deriva del mismo criterio que la navegación hacia adelante.
2026-07 (aprox.) — Nueva nav inferior (bottom tab bar) introducida, persistente en toda pantalla raíz autenticada, con config extensible por array de ítems (preparada para Tareas/Equipo futuros).
2026-07 (aprox.) — Cierre de overlays (bottom sheets/modales) vía historial (`_overlayStack`): gesto nativo de "atrás" los cierra en vez de navegar la pantalla de fondo; 24 pares abrir/cerrar migrados; bug real de asignación "pelada" de handler encontrado y corregido en `_ddpCerrar`.
2026-07 (aprox.) — Pantallas raíz (`s1`, `s-home`, y antes `s-admin-home`) dejan de permitir que "atrás" navegue a un estado interno o salga de la app — mecanismo de "trampa" de historial con `pushState` duplicado.
2026-07 (aprox.) — Transición "shared axis X" (Material Design 3) pilotada en `aj-sub-*`, luego adoptada como estándar de plataforma en `ir()`/`inscMostrarPaso()` vía `axisTransicion()` — más tarde revertida de esos 2 usos generales (quedó solo en `aj-sub-*`) tras encontrar bugs de sincronización de título/footer difíciles de mantener.
2026-07 (aprox.) — Nav superior unificada en `css/nav.css` (nuevo archivo) — reemplaza estilos de nav dispersos entre `home.css`/`ui.css`/`perfil.css`.
2026-07 (aprox.) — Deshabilitado pinch-to-zoom y overscroll bounce en toda la app (ambos ejes, `overscroll-behavior:contain` universal).
2026-07 (aprox.) — Cache-busting por hash de contenido (`?v=<hash>` vía `git hash-object`) introducido para `js/config.js`, generalizado luego a una lista (`CACHEBUST_FILES`) mantenida por el hook `.githooks/pre-commit`; sumados sucesivamente `js/eventos.js`/`css/eventos.css`/`js/ui.js`/`js/color-enfasis.js`/`css/nav.css`/`css/colors.css`/`css/global.css`/`js/reservas.js`/`css/reservas.css`/`css/estilos.css`/`js/perfil.js`/`css/ui.css`/`js/admin.js` a medida que se detectaba cada uno sirviendo versión vieja por el TTL de 10 min de Fastly/GitHub Pages.
2026-07 (aprox.) — `theme-color`/PWA: `manifest.json` tenía `theme_color` en naranja de marca sin relación con `--bg`, causando barra de gestos de Android desincronizada del tema real — corregido a sincronizarse a mano con `colors.css`.
2025–2026 (fundacional) — Logo circular de Mirlxs sacado de toda la app; rediseño de `s1` (login) a botones apilados; ícono decorativo en el hueco que dejaron flecha atrás/avatar sacados de las pantallas raíz.

## CSS / Diseño

2026-08 (aprox.) — Sección Tareas (`css/tareas.css`) deliberadamente chico: reusa clases de `eventos.css`/`reservas.css`/`perfil.css`/`admin.css`/`ui.css` en vez de duplicar.
2026-07 (aprox.) — Consolidación de bottom sheets al "Sistema A": chrome único (`.bsheet-overlay`/`.bsheet`/`.bsheet-handle`/`.bsheet-title`/`.bsheet-body`) en `css/global.css`, migrando `#modal-eliminar-cuenta` y otros modales centrados que simulaban ser bottom sheet solo en mobile.
2026-07 (aprox.) — Sistema de botones en 4 tandas: jerarquía de color, bloque "Guardar"/"Confirmar" inline sólido, resolución de casos colgados, pasada final sobre el resto de la app.
2026-07 (aprox.) — Auditoría de estilos hardcodeados en 3 lotes: reemplazo de colores literales por variables existentes, corrección de fallbacks `var(--x, literal)` desactualizados, 3 variables nuevas puntuales, y borrado de selectores de dark-mode muertos.
2026-07 (aprox.) — Fase 1 de consolidación de CSS (`css/estilos.css` nuevo): toasts, loaders/spinners, pull-to-refresh y keyframes globales unificados — antes repartidos y duplicados (a veces con valores distintos) entre `global.css`/`login.css`/`ui.css`/`home.css`/`inscripcion.css`.
2026-07 (aprox.) — Tanda 1/2 del "color de énfasis" (Material-You-style): motor de derivación de color portado de Pivot (`js/color-enfasis.js` nuevo), luego Tanda 3 con selector real desde el panel admin.
2026-07-12 — Decisión de diseño confirmada: `mostrarToast()` silencioso por default para tipos no-error es intencional (Victor revirtió un revert que lo había reactivado por error de interpretación de una auditoría).
2026-07 (aprox.) — CTA fijo abajo (`.cta-footer-fixed`) implementado en todo el flujo de reserva (s2/s3a/s3b/s3c/s4/s6/s-pago), luego migrado a hijo directo de `<body>` (en vez de anidado en `.pantalla > .card`) para eliminar de raíz un bug de containing block con animaciones `transform` en curso.
2025–2026 (fundacional) — Bordes 1px activados de forma consistente en `ui.css`/`reservas.css`/`home.css`/`perfil.css`/`inscripcion.css`; colores hardcodeados eliminados de `index.html` reemplazados por variables; tipografía cambiada de Montserrat a "Be Vietnam Pro" en toda la app.

## Auth

2026-08 (aprox.) — `restaurarSesion()`/`validarPin()` detectan cuenta admin con el mismo criterio que `loginGoogle` (email en `_listaAdmins()` + fila en Equipo); fix de datos vacíos al recargar sesión para admin con fila propia en Equipo.
2026-07 (aprox.) — Auditoría y fix de bug real: `#loading-overlay` podía quedar visible hasta 12 segundos en la carga más común (visitante nuevo sin sesión guardada).
2026-07 (aprox.) — `onGoogleCredentialUsuario()`: mensaje de error de login deja de ser siempre "Error de conexión" genérico.
2026-07 (aprox.) — Coordinación entre `modal-permisos` y `modal-info-home` para que no se abran superpuestos; modal de permisos también se dispara desde `restaurarSesion()` exitosa, no solo login fresco.
2025–2026 (fundacional) — Flujo base de Google Sign-In + PIN, `window.onload`, restauración de sesión.

## Edge Function / Backend

2026-08-30 — Pedido rechazado: migrar `recalcularStatsEquipo`/`recalcularStatsUsuario` al Edge Function — premisa falsa, código ya funcionaba como estaba.
2026-08-30 — Batch 8: `recalcularStatsUsuario()` conectado a `adminMarcarAsistencia`/`_aplicarRectificacion`.
2026-08-29 — Cambio 62: fix filtro `estado = 'Evento Finalizado'` en stats/categorías (`api/index.ts`, `recalcular-categorias`).
2026-08-29 — Cambio 60: fix `primerDiaMesesAtras()` en `recalcular-categorias`.
2026-08-29 — Cambio 59: `equipo.termometro_pct` calculado por `recalcular-categorias` (migración `20260829_termometro.sql`).
2026-08-29 — Cambio 58: `equipo.horas_ano`/`asistencias_ano`/`total_eventos_ano` poblados por `recalcularStatsEquipo` (migración `20260829_stats_equipo.sql`).
2026-08-29 — Cambio 55: `getEquipo()` real reemplaza datos demo; Edge Function nueva `recalcular-categorias`.
2026-08-29 — Cambio 54: acciones de flujo de lesión (`solicitarLesion`/`adminAprobarLesion`/etc.) en `api/index.ts`.
2026-08-28 — Fase A/B del sistema de tiers: tabla `config_tiers` + `equipo.categoria`; acciones `getTiers`/`upsertTier`/`deleteTier`/`adminGetCategorias`/`adminSetCategoria`.
2026-08-28 — Sistema `estado_miembro`: migración `20260823_estado_miembro.sql`, acción `adminSetEstadoMiembro`.
2026-08-28 — Generación de eventos migrada de Apps Script a `regenerar_ventana_asistencias()` nativa de Postgres + `pg_cron` (migración `20260828_regenerar_ventana_asistencias_rpc_cron.sql`).
2026-08-24 — Cambio 20: fix real — `categoria` no persistía vía `actualizarDatosPersona`.
2026-08 (aprox., previo al 21) — Feature "Rectificar asistencia": tabla `rectificaciones_asistencia` + acciones `solicitarRectificacionAsistencia`/`adminGetRectificaciones`/`adminSetEstadoRectificacion`.
2026-08 (aprox.) — Feature "Aniversario de entrada al equipo".
2026-08 (aprox.) — Fix subida de foto de perfil: `subirFotoPerfil`/`subirFotoInscripcion` caían al `default` del router y se reenviaban a GAS por GET en vez de POST — corregido.
2026-08 (aprox.) — `getEventosRango()`: eliminada la fuente EF (`asistencias.a_horario`/`tarde`) del merge de asistencias — corrige usuarios marcados "Llegó a horario" sin que ningún admin los marcara.
2026-08 (aprox.) — Acción nueva `adminBorrarEvento` — DELETE en `asistencias` (no una tabla `eventos` separada) con validación de admin token.
2026-08 (aprox.) — Acciones nuevas `verificarGoogle`/`inscribirPersona` — cubren alta de persona nueva vía Google (antes solo estaba migrado el camino de alguien ya existente en `equipo`).
2026-08 (aprox.) — El `default` del router deja de responder "Acción no implementada": pasa a hacer proxy real a `Code.gs` (`forwardToGAS`) para cualquier `action` sin `case` propio.
2026-08 (aprox.) — `BACKEND` (`js/config.js`) activado hacia la Edge Function de Supabase, revertido a Apps Script por un problema, y reactivado definitivamente tras una reescritura de `api/index.ts`.
2026-08 (aprox.) — Primera tanda de reemplazo de `Code.gs` por la Supabase Edge Function (`supabase/functions/api/index.ts` nuevo) — sexta migración de la saga GAS→Supabase.
2026-08 (aprox.) — Migración de Reservas a Supabase, etapas 1–4 completas (quinta migración).
2026-08 (aprox.) — Migración de Puntos y Tareas a Supabase completa (cuarta migración, incluye "Baúl de Tareas").
2026-08 (aprox.) — Migración de Asistencias a Supabase, etapas 1–3 completas (tercera migración, 254 filas históricas desde Sheets).
2026-08 (aprox.) — Migración de "Log de asistencias" a Supabase completa (segunda migración).
2026-08 (aprox.) — Migración de Venues a Supabase completa — CRUD (`adminGetVenues`/`adminCrearVenue`/`adminEditarVenue`/`adminEliminarVenue`) reemplaza lectura/escritura directa sobre Sheets (primera migración, piloto de la saga GAS→Supabase).
2026-08 (aprox.) — Migración de dominio: `reservas.quindesvolcanicos.com` → `app.quindesvolcanicos.com`.
2026-07 (aprox.) — Bug real de timezone en `_proximosEntrenamientos()`: la Edge Function corre en UTC pero los horarios están en hora Ecuador (UTC-5) — corregido.
2025–2026 (fundacional) — Backend original 100% Apps Script (`Code.gs`, fuera del repo): reservas, eventos, tareas, venues, log de asistencias — documentado en el MANIFEST como pseudocódigo porque el repo nunca tuvo acceso directo al proyecto de script.google.com.

## General

2026-08 (aprox.) — Feature `registro-express/`: mini-SPA hermana de `inscripcion/` para altas rápidas sin Google Sign-In (nombre + PIN), con reserva de fecha/mes pre-seleccionada completada al volver a la app principal; acción de backend nueva `inscribirPersonaExpress` (sin email/idToken, PIN obligatorio).
2026-07/08 (aprox.) — Fallo intermitente conocido de GitHub Pages ("Deployment failed, try again later.") — confirmado ajeno al contenido del repo (el job `build` siempre sale en verde, solo falla el paso de publicación interno de GitHub); sin acción de código posible, la única vía es forzar un run nuevo.
2026-07 (aprox.) — Causa raíz real de "el navegador sigue pegándole a una URL vieja de `js/config.js` después de pushear el fix": CDN de Fastly cacheando 10 minutos, no un problema del service worker — origen del mecanismo de cache-busting (ver sección Nav/UI).
2025–2026 (fundacional) — Buildout de `inscripcion/` (formulario completo de alta vía Google) como mini-SPA independiente, con su propio `apiGet`/`apiPost`/`errMsg` locales; validaciones de nombre duplicado, edad mínima, WhatsApp del grupo.
