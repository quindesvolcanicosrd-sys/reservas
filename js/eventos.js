/* ═══════════════════════════════════════════════════════
   EVENTOS.JS — Sección Eventos, conectada al backend real (ver "Cambios
   recientes" -- reemplaza la última demo hardcodeada que quedaba en esta
   pantalla: _evGenerarDemo()/_EV_EVENTOS_DEMO/_EV_CUMPLEANOS_DEMO/
   _EV_EQUIPO_DEMO). getEventosRango()/getCumpleañosRango()/
   marcarAsistenciaUsuario()/adminMarcarAsistencia()/
   adminBuscarPersonasParaEvento() (Apps Script, documentadas en
   MANIFEST.md) ya están desplegadas y confirmadas en vivo -- ver
   _evCargarDatosReales()/_evMapEventoBackend() más abajo para el adaptador
   entre la forma real del backend y la que espera el resto de este
   archivo (toda la lógica de render/navegación sigue trabajando sobre los
   arrays _EV_EVENTOS/_EV_CUMPLEANOS, no sobre la fuente de los datos).
   getVenues()/crearVenue()/editarVenue() (Paso 1 del wizard "Crear
   evento" + "Editar lugares") ya estaban conectadas desde una sesión
   anterior, pero el backend real todavía no las tiene desplegadas --
   devuelven "Acción no válida" hoy, pendiente de que Victor pegue el
   código ya documentado en MANIFEST.md.
   ═══════════════════════════════════════════════════════ */

var _EV_EVENTOS = [];
var _EV_CUMPLEANOS = [];
var _EV_ANIVERSARIO_INGRESO = null;
// Temporadas de descanso (Tanda B, ver MANIFEST.md "Cambios recientes") --
// poblado por _evCargarDatosReales() desde `res.offseason` (getEventosRango,
// arreglo nuevo, opcional -- ausente o vacío en un backend viejo, degrada
// solo: timeline/calendario quedan exactamente como antes). Cada item:
// {id, nombre, fechaInicio, fechaFin} (fechas 'yyyy-mm-dd').
var _EV_OFFSEASON = [];

// Selección múltiple de fechas para reservar clases directo desde el
// timeline (ver _evReservarClase()/_evToggleSeleccion()/_evContinuarReserva()
// más abajo, MANIFEST.md "Cambios recientes"). _evDisponibles: mapa
// idEvento -> objeto crudo de getFechasDisponibles (incluye disponible/razon).
var _evSeleccionados = new Set();
var _evDisponibles = {};
var _evModoReservaActivo = false;
// Doble tap real en "Reservar" (ver "Cambios recientes"): _evModoReservaActivo
// solo se prendía DENTRO del callback de éxito del apiPost, no antes de
// llamarlo -- un 2º tap mientras el 1er fetch todavía estaba en vuelo
// disparaba un 2º apiPost idéntico, sin ninguna guardia. Este flag se prende
// SÍNCRONO, antes del apiPost, y se apaga en los 2 callbacks (éxito y error).
var _evCargandoDisponibles = false;
var _evConflictosTalla = {}; // evId -> razon (string)
var _evTallasPorFecha = {};  // evId -> talla override elegida por el usuario
var _evTallaConflictoEvId = ''; // evId pendiente de confirmar talla en sheet

// 'Partido'/'Evento social'/'Otro' sumados para el formulario de Venues (ver
// MANIFEST.md) -- mismo mapa ya usado por las cards de evento reales
// (Venues!Tipo de ícono), ahora también alimentado por el selector de pills
// del formulario en vez de solo por datos de prueba/backend.
var _EV_ICONOS = { 'Entrenamiento': 'sports', 'Torneo': 'emoji_events', 'Partido': 'sports', 'Asamblea': 'groups', 'Evento social': 'groups', 'Otro': 'category', 'Ciclopaseo': 'pedal_bike' };
var _EV_DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
var _EV_DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Info de la pantalla de detalle (ver _evDetalleInfoHtml() más abajo) --
// Tanda 2 deriva mapsUrl/duración/descripción por lugar/tipo en vez de
// pedirle a cada evento de prueba sus propios 4 campos repetidos; la Tanda 3
// los reemplaza por columnas reales de Venues (mapsUrl/horaFin/duración/
// descripción por evento, no por lugar/tipo genérico como acá).
var _EV_MAPS_URL_POR_LUGAR = {
  'Parque La Carolina': 'https://www.google.com/maps/search/?api=1&query=Parque+La+Carolina+Quito',
  'Coliseo Rumiñahui': 'https://www.google.com/maps/search/?api=1&query=Coliseo+Rumi%C3%B1ahui+Quito',
  'Sede Quindes Volcánicos': 'https://www.google.com/maps/search/?api=1&query=Quindes+Volc%C3%A1nicos+Quito',
  'Pista Bicentenario': 'https://www.google.com/maps/search/?api=1&query=Parque+Bicentenario+Quito'
};
var _EV_DURACION_MIN_POR_TIPO = { 'Entrenamiento': 90, 'Torneo': 180, 'Asamblea': 60, 'Ciclopaseo': 120 };
var _EV_DESCRIPCION_POR_TIPO = {
  'Entrenamiento': 'Entrenamiento regular del equipo. Trae tus patines y protecciones completas.',
  'Torneo': 'Competencia oficial. Revisá el reglamento y llegá con anticipación para el registro.',
  'Asamblea': 'Reunión general del equipo para tratar temas administrativos y de organización.',
  'Ciclopaseo': 'Paseo recreativo abierto a todo el equipo. No requiere reserva previa.'
};

var _EV_RESP_ICONO  = { 'Asistiré': 'check_circle', 'No asistiré': 'cancel', 'No jugador': 'radio_button_checked' };
var _EV_CHIP_BADGE  = { 'A tiempo': 'badge-confirmada', 'Tarde': 'badge-pendiente', 'Ausente': 'badge-cancelada' };
// Chip de asistencia REAL de un evento pasado en el timeline (ver
// _evTimelineFilaHtml() más abajo) -- a diferencia de _EV_CHIP_BADGE (arriba,
// asistentes de OTRAS personas en la variante admin), este es el dato de LA
// PROPIA persona logueada para un evento ya Finalizado: viene de si su
// nombre aparece en las columnas E/F de la hoja "Asistencias" (ver
// "Cambios recientes" -- el backend las mezcla en `asistencias[]` con
// `estado: 'A tiempo'`/`'Tarde'`, mismo vocabulario que ya usa
// `_EV_CHIP_BADGE`/`_EV_ESTADOS_ROLLCALL` arriba -- bug real corregido acá:
// estos 3 mapas tenían la clave `'A horario'`, que nunca coincidía con
// `'A tiempo'`, el valor real; nunca se notó porque `asistencias[]` venía
// vacío del backend hasta esta sesión) -- no del RSVP que marcó antes del
// evento (`miEstado`). `miAsistenciaReal: null` (o el campo ausente) =
// "Sin registrar", sin chip de color propio.
var _EV_ASISTENCIA_REAL_BADGE = { 'A tiempo': 'badge-confirmada', 'Tarde': 'badge-pendiente', 'Ausente': 'badge-cancelada' };
// Texto mostrado al usuario para cada estado de asistencia real (ver
// "Cambios recientes" -- antes se mostraba la clave interna tal cual). Las
// claves de arriba (`_EV_ASISTENCIA_REAL_BADGE`) siguen siendo las que llegan
// del backend/`miAsistenciaReal` -- separado a propósito, mismo criterio que
// el resto del archivo (interno vs. texto de cara al usuario). "Ausente"
// (marcado explícito por el admin) y "Sin registrar" (nunca se marcó nada)
// son 2 casos internos distintos pero deben leerse igual para elle: ambos
// caen en "No asistí". Primera persona (ver "Cambios recientes" -- antes
// segunda persona, "Llegaste"/"No asististe"), sentence case (el uppercase
// heredado de `.badge` se saca puntualmente para estos 2 usos, ver
// `.ev-rsvp-readonly`/`.ev-card-compacta .badge` en css/eventos.css).
var _EV_ASISTENCIA_REAL_LABEL = { 'A tiempo': 'Llegué a horario', 'Tarde': 'Llegué tarde', 'Ausente': 'No asistí', 'Sin registrar': 'No asistí' };
// Pill grande para los 4 estados de asistencia real (ver "Cambios
// recientes" -- rediseño completado: "Ausente"/"Sin registrar" ("No
// asistí") sumados acá, antes quedaban afuera a propósito y caían al badge
// chico viejo -- ahora los 3 estados comparten el mismo componente visual
// que `.ev-estado-pill` de Cancelado/No se entrena -- mismo padding/ancho/
// tamaño de fuente, ícono a la izquierda, sin ninguna excepción). Colores:
// mismos tokens `--success`/`--warning`/`--danger` que ya usa el resto de la
// app (`.ev-estado-pill-danger`, `.ev-estado-pill-success`,
// `.ev-estado-pill-warning`, css/eventos.css) -- "Ausente"/"Sin registrar"
// reusan el mismo tono rojo que ya usa `.ev-estado-pill-danger` para
// Cancelado. Ícono `cancel` -- ya usado en `_EV_RESP_ICONO['No asistiré']`
// más arriba para el mismo concepto ("no asistió"), sin introducir uno
// nuevo.
var _EV_ASISTENCIA_REAL_PILL_CLASE = { 'A tiempo': 'ev-estado-pill-success', 'Tarde': 'ev-estado-pill-warning', 'Ausente': 'ev-estado-pill-danger', 'Sin registrar': 'ev-estado-pill-danger' };
var _EV_ASISTENCIA_REAL_PILL_ICONO = { 'A tiempo': 'check_circle', 'Tarde': 'schedule', 'Ausente': 'cancel', 'Sin registrar': 'cancel' };
// Etiqueta CORTA de las 2 opciones del slider de roster admin (ver
// "Cambios recientes", `_evRosterAdminFilasHtml()` más abajo) -- deliberadamente
// sin "Ausente" (pedido explícito: solo 2 estados marcables desde acá, no
// marcar nada equivale a ausente, mismo criterio que ya rige "sin ninguna
// entrada en E/F para un evento pasado" en el resto del archivo). Distinta
// de `_EV_ASISTENCIA_REAL_LABEL` (abajo, oración completa "Llegué a
// horario" para la pill de la propia persona) -- acá va el texto corto que
// entra en un botón compacto de 2 opciones.
var _EV_ROLLCALL_LABEL_CORTO = { 'A tiempo': 'A horario', 'Tarde': 'Tarde' };
// Fondo ATENUADO del indicador de la barra segmentada de RSVP (pantalla de
// detalle, `_evRsvpBarraHtml()`/`_evPosicionarRsvpSlider()` más abajo) --
// ver "Cambios recientes": antes un fill SÓLIDO de color puro + texto
// blanco encima (mismo lenguaje que un botón de acción, no el de un
// badge/chip), corregido a propósito para usar el mismo lenguaje que el
// resto de badges/chips de la app (fondo tenue del color + texto/ícono en
// el tono saturado de ESE color, ver `.badge-confirmada`/`.fi-pill-dur`,
// nunca texto blanco sobre un fill plano) -- mismos 3 tokens `-bg` que ya
// usan esas pills, independientes del color de énfasis (mismo criterio de
// siempre: "Asistiré" tiene que seguir leyéndose verde pase lo que pase con
// --brand). El texto/ícono saturado de la opción activa no se fija acá --
// va por CSS, `.ev-rsvp-opt.activa[data-estado=...]` (mismo criterio: color
// fijo por estado, no depende de --brand). "No jugador" pasa de ámbar a
// `--purple-bg` (mismo violeta que `.fi-pill-hora`, antes inconsistente
// entre las 2 pantallas).
// 'A tiempo'/'Tarde' (ver "Cambios recientes" -- slider de 2 estados del
// roster admin, `_evRosterAdminFilasHtml()` más abajo) suman a este MISMO
// mapa en vez de uno propio -- `_evPosicionarRsvpSlider()` es genérica sobre
// cualquier `data-estado`, no distingue RSVP de rollcall.
var _EV_RSVP_BG = { 'Asistiré': 'var(--success-bg)', 'No asistiré': 'var(--danger-bg)', 'No jugador': 'var(--purple-bg)', 'A tiempo': 'var(--success-bg)', 'Tarde': 'var(--warning-bg)' };

// Estado de la cabecera fija. `_evPanelAbierto` ('filtros'|'busqueda'|null)
// -- filtros/búsqueda comparten el mecanismo genérico de burbuja (una sola a
// la vez, ver `_evTogglePanel()`); el calendario (`_evCalVisible`) es un
// mecanismo aparte (ver "Cambios recientes" -- rediseño de navegación de
// Calendario, swipe-first). SOLO 2 estados, no 3 (ver "Cambios recientes" --
// se elimina la franja semanal compacta que existía antes como estado
// intermedio): `_evCalVisible` es si el panel de calendario se muestra del
// todo, SIEMPRE con la grilla del mes completo -- lo togglea el chevron/
// label de la nav (`_evToggleMesPanel()`), un swipe hacia abajo sobre el
// panel, o tocar una pill/swipe horizontal de mes (que además lo fuerza a
// visible). Sin estado intermedio ya no hace falta resolver el conflicto
// swipe-horizontal-de-mes vs. scroll-vertical-de-página con 3 estados
// distintos -- tocar un día NUNCA cambia el calendario, solo scrollea el
// timeline. `_evCalFechaMostrada` (iso) es la única fuente de verdad de qué
// mes se ve -- swipe/tap la cambian directo y re-renderizan sincrónico (no
// dependen de un scroll-listener async, ver "Cambios recientes" -- necesario
// para que swipes rápidos sucesivos, sin esperar la animación, terminen en
// un estado consistente). `_evNavMesActual` es el mes que el LABEL de la nav
// muestra, normalmente sincronizado por el scroll del timeline
// (`_evActualizarNavMesPorScroll()`) pero fijado DIRECTO por cualquier
// acción explícita del calendario (pill/swipe/abrir) vía
// `_evSincronizarNavMesDesde()`. `_evCalUltimaAccionTs` (ver "Cambios
// recientes" -- bug real de Playwright: la pill de mes no actualizaba el
// label) evita que el scroll-listener pise ese valor recién fijado: al
// saltar a un mes lejano sin contenido propio, `_evScrollAFecha()` cae al
// grupo real más cercano (otro mes), y el evento de scroll que dispara
// dejaba a `_evActualizarNavMesPorScroll()` "corrigiendo" el label de
// vuelta a ese mes ajeno una fracción de segundo después -- por eso la
// resincronización por scroll se salta entera (no solo el toggle de
// expandido/colapsado que existía antes) durante los 500ms siguientes a
// cualquier acción explícita.
var _evPanelAbierto = null;
var _evNavMesActual = null;
var _evCalVisible = false;
var _evCalFechaMostrada = null;
var _evCalUltimaAccionTs = 0;
// "Hoy" (fijo) vs "fecha seleccionada" (dinámica, ver "Cambios recientes")
// -- SOLO cambia por una acción explícita de ir a un día puntual (tocar una
// celda de la grilla, tocar el ícono "hoy"), nunca por navegar de mes
// (swipe/pill) ni por scrollear el timeline a mano. Decisión de diseño
// documentada acá a propósito (pedida explícitamente): el label de la nav
// YA sigue el scroll en vivo (`_evActualizarNavMesPorScroll()`) y da
// feedback continuo de "dónde estoy"; que el anillo de la grilla hiciera lo
// mismo sería redundante con eso Y, a diferencia del label (siempre
// visible en la cabecera), el anillo solo se ve con el panel abierto --
// duplicar el trabajo de seguimiento en vivo para un elemento que no
// siempre está a la vista no pagaba su complejidad. En cambio, la grilla
// funciona como un "así quedó" -- el último lugar al que se saltó a
// propósito -- no como un indicador de posición en tiempo real.
var _evCalFechaSeleccionada = null;

/* ── Utilidades de fecha (sin dependencias externas) ─────────────────── */
function _evPad(n) { return n < 10 ? '0' + n : '' + n; }
function _evToISO(d) { return d.getFullYear() + '-' + _evPad(d.getMonth() + 1) + '-' + _evPad(d.getDate()); }
function _evParseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function _evSumarDias(iso, n) { var d = _evParseISO(iso); d.setDate(d.getDate() + n); return _evToISO(d); }
function _evHoyISO() { return _evToISO(new Date()); }
// Compara 2 fechas ISO por su valor real (Date), no como strings -- ver
// "Cambios recientes": comparar "fecha1 >= fecha2" como texto plano solo da
// el resultado cronológico correcto si AMBAS llegan con el mismo ancho
// (cero-padding); un backend real (Tanda 3, ej. Apps Script formateando una
// celda de fecha con mes/día de un solo dígito) puede no garantizarlo. Toda
// comparación de fechas de este archivo pasa por acá.
function _evFechaCmp(a, b) { return _evParseISO(a).getTime() - _evParseISO(b).getTime(); }
function _evLunesDeSemana(d) {
  var dia = d.getDay();
  var diff = (dia === 0 ? -6 : 1 - dia);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

/* ── Carga real desde el backend ──────────────────────────────────────
   Rango fijo: mes actual ±12 meses -- exactamente la misma ventana que ya
   permite navegar el selector de mes del calendario (`_evGenerarOpcionesMesPill()`,
   más abajo, mismo -12..+12). Un solo fetch de punta a punta en vez de
   paginar por mes: esta pantalla nunca tuvo scroll infinito/carga
   incremental (ver _evRenderTimeline() -- arma el timeline entero de una
   sobre el array ya cargado), así que cargar de más lejos de lo que se ve
   "hoy" es lo que hace que swipear/tocar una pill de mes lejano en el
   calendario encuentre contenido real en vez de una ventana vacía. */
function _evRangoCargaCompleto() {
  var hoy = new Date();
  var desde = new Date(hoy.getFullYear(), hoy.getMonth() - 12, 1);
  var hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 13, 0);
  return { desde: _evToISO(desde), hasta: _evToISO(hasta) };
}
// Estado (columna "Estado" de Asistencias, backend real) llega con un
// prefijo "Evento " en 2 de los 4 valores posibles ("Evento Cancelado"/
// "Evento Finalizado") que el resto de este archivo NO espera -- toda
// comparación existente (_evEsPasado()/_evRsvpBarraHtml()/etc.) chequea
// 'Cancelado'/'Finalizado' a secas (mismo criterio que la demo vieja, nunca
// actualizado). "No se entrena"/"Evento Programado" SÍ coinciden tal cual
// (el 2do nunca se compara por igualdad literal en ningún lado, ver
// _evCardEventoHtml() -- cualquier estado que no sea Cancelado/Finalizado/No
// se entrena cae al camino "normal"), quedan afuera del mapa a propósito.
var _EV_ESTADO_MAP = { 'Evento Cancelado': 'Cancelado', 'Evento Finalizado': 'Finalizado' };
function _evNormalizarEstadoEvento(estado) { return _EV_ESTADO_MAP[estado] || estado; }
var _EV_ESTADOS_RSVP = ['Asistiré', 'No asistiré', 'No jugador'];
var _EV_ESTADOS_ROLLCALL = ['A tiempo', 'Tarde', 'Ausente'];
// Ya NO es un ISO datetime -- getEventosRango() (supabase/functions/api/
// index.ts) manda `horaInicio`/`horaFin` truncados server-side a "HH:MM"
// (`fila.inicia?.substring(0, 5)`, columnas `time` de Postgres). `new
// Date("14:30")` da Invalid Date (probado), así que el parseo viejo devolvía
// '' siempre -- bug real, no cosmético. Nada de conversión de huso: son 5
// caracteres, se extraen tal cual.
function _evHoraDeISO(hhmm) {
  if (!hhmm) return '';
  return hhmm.substring(0, 5);
}
// Compara 2 nombres tolerando mayúsculas/espacios de más -- el nombre que
// llega en `asistencias[]` sale de "Log de asistencias" (tipeado a mano por
// quien pasa lista), mientras que `E.nombre` sale de la fila de "Equipo" vía
// login -- son 2 hojas distintas escritas en momentos distintos, sin ninguna
// garantía real de que coincidan carácter a carácter aunque refieran a la
// misma persona (bug real encontrado: la comparación exacta `===` dejaba a
// alguien con asistencia real registrada cayendo en "No asistí"/"Sin
// responder" por una diferencia de mayúsculas o un espacio de más). Mismo
// criterio de normalización que ya usa `_mapaRequiereReservaPorLugar()` en el
// backend documentado (MANIFEST.md) para el mismo tipo de problema.
function _evNombresCoinciden(a, b) {
  return !!a && !!b && String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}
// Puntualidad (E/F, confirmada por el admin -- `_EV_ESTADOS_ROLLCALL`) y rol
// (RSVP original de la persona en "Log de asistencias" -- jugador de
// siempre, o `'No jugador'` si avisó que venía de espectadora) son 2
// dimensiones INDEPENDIENTES: una persona puede llegar a horario Y haber
// avisado que venía como espectadora. Regla de negocio (pedido explícito de
// Victor, bug real corregido: antes una pisaba a la otra según qué mapa se
// leyera primero, o directamente no se cruzaban nunca) -- se combinan en un
// solo texto, nunca una reemplaza a la otra: "Llegó a horario · No jugador"
// en vez de solo una de las 2. Sin dato de rol (nunca respondió el RSVP para
// este evento, o el evento no lo pedía) se muestra la puntualidad sola, sin
// sufijo. Un solo punto de combinación, reusado por _evAsistenciaRealHtml()
// (la propia persona logueada) y _evAccionAdminHtml()/
// _evRenderDetalleAsistenciaReal() (cualquier otra persona, admin) -- mismo
// criterio en los 2 contextos.
function _evLabelPuntualidadRol(labelPuntualidad, estadoRol) {
  return (estadoRol === 'No jugador') ? (labelPuntualidad + ' · No jugador') : labelPuntualidad;
}
// Busca el RSVP ORIGINAL de una persona puntual dentro de `e.rsvps` (ya
// separado del rollcall por _evMapEventoBackend()) -- mismo criterio de
// nombres normalizados que el resto del archivo (`_evNombresCoinciden()`),
// las 2 listas salen de la misma hoja "Log de asistencias" pero en filas
// distintas (una por respuesta), sin garantía de mayúsculas/espacios
// idénticos entre sí tampoco.
function _evRolDePersona(e, nombre) {
  var match = (e.rsvps || []).filter(function(r) { return _evNombresCoinciden(r.nombre, nombre); })[0];
  return match ? match.estado : null;
}
// Adapta UN evento crudo de getEventosRango() (idEvento/tipoIcono/
// horaInicio-horaFin ISO/asistencias[]) a la forma que ya espera el resto de
// este archivo (id/tipo/horaInicio "HH:MM"/miEstado/miAsistenciaReal/
// asistentes/rsvps) -- toda la lógica de render sigue intacta, sin enterarse
// del cambio de fuente. `asistencias` (un registro por persona, el más
// reciente si cambió de opinión más de una vez, ver
// `_ultimaAsistenciaPorPersonaTodas()` en MANIFEST.md) mezcla 2 conceptos
// bajo un mismo `estado` -- un RSVP propio (ESTADOS_RSVP, antes del evento) o
// una asistencia real tomada por el admin (ESTADOS_ROLLCALL, después) -- acá
// se separan en 2 arrays distintos (rsvps/asistentes) según cuál de las 2
// listas contenga ese valor exacto, y la propia fila de `E.nombre` alimenta
// miEstado/miAsistenciaReal según corresponda (comparación normalizada, ver
// `_evNombresCoinciden()` arriba).
function _evMapEventoBackend(raw) {
  var miEstado = null, miAsistenciaReal = null;
  var asistentes = [], rsvps = [];
  (raw.asistencias || []).forEach(function(a) {
    if (_EV_ESTADOS_ROLLCALL.indexOf(a.estado) !== -1) {
      asistentes.push({ nombre: a.nombre, estado: a.estado, nombreDerby: a.nombreDerby || '', fotoPerfil: a.fotoPerfil || '' });
      if (_evNombresCoinciden(a.nombre, E.nombre)) miAsistenciaReal = a.estado;
    } else if (_EV_ESTADOS_RSVP.indexOf(a.estado) !== -1) {
      rsvps.push({ nombre: a.nombre, estado: a.estado, nombreDerby: a.nombreDerby || '', fotoPerfil: a.fotoPerfil || '' });
      if (_evNombresCoinciden(a.nombre, E.nombre)) miEstado = a.estado;
    }
  });
  return {
    id: String(raw.idEvento), fecha: raw.fecha, lugar: raw.lugar, tipo: raw.tipoIcono,
    horaInicio: _evHoraDeISO(raw.horaInicio), horaFinReal: _evHoraDeISO(raw.horaFin),
    estado: _evNormalizarEstadoEvento(raw.estado), requiereReserva: raw.requiereReserva !== false,
    miEstado: miEstado, miAsistenciaReal: miAsistenciaReal, asistentes: asistentes, rsvps: rsvps,
    mapsUrl: raw.mapsUrl || raw.google_maps || '',
    descripcion: raw.descripcion || raw.infoAdicional || raw.info_adicional || '',
  };
}
// getCumpleañosRango() no manda `fotoPerfil` (no está en el contrato
// documentado en MANIFEST.md) -- cae sola al fallback de inicial de
// _evHidratarAvatares(), igual que un E.datos.fotoPerfil vacío en cualquier
// otro lado de la app. `id` es solo para el `id` del host de confetti
// (_evCardCumpleHtml()) -- por índice alcanza, se regenera en cada carga.
function _evComputarAniversariosIngreso() {
  var fi = E.datos && E.datos.fechaIngreso;
  if (!fi) return null;
  var fip = fi.split('-'); // [anio, mes, dia]
  var rango = _evRangoCargaCompleto();
  var items = [];
  var desde = rango.desde, hasta = rango.hasta;
  var ayDesde = new Date(desde + 'T00:00:00').getFullYear();
  var ayHasta = new Date(hasta + 'T00:00:00').getFullYear();
  for (var ay = ayDesde; ay <= ayHasta; ay++) {
    if ('' + ay === fip[0]) continue; // saltar el año de ingreso real
    var isoAniv = ay + '-' + fip[1] + '-' + fip[2];
    if (isoAniv >= desde && isoAniv <= hasta) {
      items.push({ id: 'aniv-' + ay, fecha: isoAniv, anios: ay - +fip[0] });
    }
  }
  return { items: items, fechaIngreso: fi };
}
function _evMapCumpleBackend(raw, idx) {
  var conEdad = typeof raw.edad === 'number';
  return { id: 'cumple-' + idx, nombre: raw.nombre, fecha: raw.fecha, edad: conEdad ? raw.edad : null, edadPublica: conEdad, fotoPerfil: '' };
}
// Único punto de carga real de esta pantalla -- 3 pedidos en paralelo,
// `onListo()` corre cuando los 3 terminaron (éxito o error). getEventosRango
// es la data crítica: un error ahí avisa con un toast y deja el timeline
// vacío. getCumpleañosRango tiene un bug real CONOCIDO en el backend
// desplegado hoy ("Columna no encontrada: Nombre" -- el encabezado real de
// la hoja Equipo no coincide con el que espera el script, ver MANIFEST.md)
// -- degrada en silencio a "sin cumpleaños" en vez de mostrarle un error a
// cada persona que entra a Eventos por un problema ajeno al frontend.
// `temporadas_descanso` (Tanda B, ver MANIFEST.md "Cambios recientes") --
// a diferencia de los otros 2, NO pasa por `api()`/BACKEND (la Edge
// Function): es un fetch directo del navegador a la REST API de Supabase
// (PostgREST, `SUPABASE_URL`/`SUPABASE_ANON_KEY`, `js/config.js`) -- misma
// mecánica (publishable key + headers de autenticación) que `Code.gs` ya usa
// server-side vía `UrlFetchApp` para Venues/log_asistencias (ver esas
// entradas de este MANIFEST), acá replicada del lado del cliente con
// `fetch()` porque así lo pidió Victor para esta tabla puntual. Degrada
// igual que getCumpleañosRango (console.warn, sin toast) -- ambos son datos
// secundarios del timeline, ninguno debería bloquear ni asustar con un error
// visible por un problema ajeno al resto de la pantalla.
function _evCargarDatosReales(onListo) {
  var rango = _evRangoCargaCompleto();
  var pendientes = 4;
  // Reglas de asistencia anticipada del usuario actual, cargadas en
  // paralelo con el resto (mismo criterio degradado que
  // getCumpleañosRango/temporadas_descanso, abajo: console.warn sin toast
  // si falla, dato secundario que no debería bloquear el timeline) --
  // `_evAntReconciliarConReglas()` (ver ese comentario, sección "ASISTENCIA
  // ANTICIPADA" más abajo en este archivo) recién corre una vez que TODO
  // terminó de cargar (pendientes === 0), para no pisar `_EV_EVENTOS` antes
  // de que `getEventosRango` haya terminado de poblarlo.
  var reglasAnt = [];
  function unoListo() {
    pendientes--;
    if (pendientes === 0) { _evAntReconciliarConReglas(reglasAnt); onListo(); }
  }
  api({ action: 'getEventosRango', desde: rango.desde, hasta: rango.hasta }, function(res) {
    _EV_EVENTOS = (res.eventos || []).map(_evMapEventoBackend);
    unoListo();
  }, function(e) {
    _EV_EVENTOS = [];
    mostrarToast(e && e.message ? e.message : 'No se pudieron cargar los eventos.', 'error');
    unoListo();
  });
  _evAntFetchReglas(function(reglas) {
    reglasAnt = reglas;
    unoListo();
  }, function(e) {
    reglasAnt = [];
    if (window.console) console.warn('reglas_asistencia (timeline): ' + (e && e.message || 'error'));
    unoListo();
  });
  api({ action: 'getCumpleañosRango', desde: rango.desde, hasta: rango.hasta }, function(res) {
    _EV_CUMPLEANOS = (res.cumpleanos || []).map(_evMapCumpleBackend);
    _EV_ANIVERSARIO_INGRESO = _evComputarAniversariosIngreso();
    unoListo();
  }, function(e) {
    _EV_CUMPLEANOS = [];
    if (window.console) console.warn('getCumpleañosRango: ' + (e && e.message || 'error'));
    unoListo();
  });
  // Filtro de solapamiento de rango (sintaxis PostgREST: `?col=operador.valor`,
  // varios params = AND) -- una temporada "cuenta" para [desde,hasta] si
  // arrancó antes/durante Y todavía no había terminado al empezar el rango:
  // fecha_inicio <= hasta AND fecha_fin >= desde. `select=` pide solo las 4
  // columnas que hacen falta, nunca `*`.
  fetch(
    SUPABASE_URL + '/rest/v1/temporadas_descanso?select=id,nombre,fecha_inicio,fecha_fin' +
      '&fecha_inicio=lte.' + rango.hasta + '&fecha_fin=gte.' + rango.desde,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
  ).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(rows) {
    _EV_OFFSEASON = (rows || []).map(function(r) {
      return { id: r.id, nombre: r.nombre, fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin };
    });
    unoListo();
  }).catch(function(e) {
    _EV_OFFSEASON = [];
    if (window.console) console.warn('temporadas_descanso: ' + (e && e.message || 'error'));
    unoListo();
  });
}

// ── Roster admin precargado UNA sola vez por sesión de Eventos (ver
// "Cambios recientes" -- reemplaza el flujo viejo de "+ Agregar persona",
// que pedía adminBuscarPersonasParaEvento(idEvento) DE NUEVO cada vez que
// se abría la sheet para CUALQUIER evento). `null` = todavía no llegó (o
// nunca se pidió, cuenta no-admin) -- distinto de `[]` ("pedido y sin
// gente"), mismo criterio ya usado en el archivo para "cargando" vs. "vacío".
// Independiente de `_evCargarDatosReales()` a propósito -- no bloquea el
// render del timeline, que no depende de este dato; solo hace falta cuando
// alguien abre la subpantalla dedicada "Marcar asistencia", que arma el
// roster con esto (ver _evRosterAdminFilasHtml()/_evRenderMarcarAsistLista(),
// más abajo -- NO la card/home, ver "Cambios recientes"). `adminGetRosterEquipo`
// (nueva acción, MANIFEST.md) es más liviana que `adminBuscarPersonasParaEvento`
// -- no recibe `idEvento` ni recalcula `estadoActual` (dato que ningún
// consumidor de este roster precargado necesita: el estado por evento ya
// viaja en `e.asistentes`, cargado con `getEventosRango()`), evitando
// releer "Log de asistencias" para nada.
var _evRosterEquipo = null;
// Diagnóstico (ver "Cambios recientes" -- bug real reportado: "Marcar
// asistencia" mostraba "No se pudo cargar el equipo" después de unos
// segundos, sin ningún request nuevo visible en Network AL ABRIR LA
// SUBPANTALLA). Instrumentado con console.log/warn en vez de arreglar a
// ciegas, según pedido explícito de Victor -- confirma en la consola real
// (no solo acá) los 3 puntos de la cadena: (1) si esta función se llama de
// verdad al entrar a Eventos, (2) si el request a `adminGetRosterEquipo`
// sale de verdad en ESE momento (no al abrir la subpantalla -- por diseño,
// la subpantalla NUNCA pide nada nuevo, reusa lo que esto ya cargó), (3) si
// el resultado (éxito o error) llega y se guarda. El `console.warn` del
// error (antes silencioso, `_evRosterEquipo = []` sin dejar rastro) usa el
// mismo criterio ya establecido en este archivo para errores degradados sin
// toast (ver `getCumpleañosRango`, más arriba) -- expone el mensaje real del
// backend en vez de esconderlo detrás de un roster vacío indistinguible de
// "el equipo no tiene nadie cargado".
function _evPrecargarRoster() {
  _evRosterEquipo = null;
  if (window.console) console.log('Eventos: _evPrecargarRoster() llamada -- _adminToken=' + (_adminToken ? 'presente' : 'AUSENTE'));
  if (!_adminToken) return;
  if (window.console) console.log('Eventos: pidiendo adminGetRosterEquipo...');
  api({ action: 'adminGetRosterEquipo', adminToken: _adminToken }, function(res) {
    _evRosterEquipo = res.personas || [];
    if (window.console) console.log('Eventos: adminGetRosterEquipo OK -- ' + _evRosterEquipo.length + ' personas');
    _evRepintarMarcarAsistSiHaceFalta();
    // Picker "Asignar a personas" del wizard de Tareas (js/tareas.js) --
    // mismo roster, otro consumidor: repinta si el usuario ya está parado
    // en ese paso esperando esta misma respuesta (guard `typeof`, cruza de
    // módulo -- mismo criterio defensivo que el resto de la app).
    if (typeof _tarCrearRepintarPersonasSiHaceFalta === 'function') _tarCrearRepintarPersonasSiHaceFalta();
    if (typeof _tarPersonasRepintarSiHaceFalta === 'function') _tarPersonasRepintarSiHaceFalta();
  }, function(e) {
    _evRosterEquipo = []; // degrada a "sin resultados" -- nunca un loader infinito
    if (window.console) console.warn('Eventos: adminGetRosterEquipo falló -- ' + (e && e.message || 'error') + ' (revisar si adminGetRosterEquipo está desplegada en Code.gs, ver MANIFEST.md)');
    _evRepintarMarcarAsistSiHaceFalta();
    if (typeof _tarCrearRepintarPersonasSiHaceFalta === 'function') _tarCrearRepintarPersonasSiHaceFalta();
    if (typeof _tarPersonasRepintarSiHaceFalta === 'function') _tarPersonasRepintarSiHaceFalta();
  });
}

// Flag de sesión (ver "Cambios recientes" -- regla general de "restaurar
// posición al volver a una sección por nav inferior", ya aplicada primero acá
// y después generalizada a Ajustes, ver `_ajYaInicializadoEnSesion` en
// js/perfil.js): `false` al cargar la página (var de módulo, se resetea sola
// en cada carga real) y explícito en `cerrarSesion()` (js/auth.js) para que
// un logout/login sin recargar la página tampoco arrastre el estado de la
// sesión anterior. La PRIMERA vez que se entra a Eventos en la sesión corre
// el flujo completo de siempre (reset de filtros/búsqueda/calendario + salto
// a "hoy"); las siguientes veces (nav inferior, sección ya visitada) NO se
// resetea nada -- el usuario vuelve exactamente donde había dejado el
// timeline, con los filtros/búsqueda/calendario tal cual estaban.
var _evYaInicializadoEnSesion = false;

/* ── FAB de #s-eventos (solo admin, ver #ev-fab-menu en index.html) ──────
   Ex-menú "speed dial" -- ver MANIFEST.md "Cambios recientes" (wizard
   "Tipo → Lugar → Detalles"): `#ev-fab-btn` ya NO llama `_evFabToggle()`,
   llama `irEvCrear()` directo. Funciones/listener de abajo quedan
   definidas sin caller real desde el FAB de Eventos (dejadas tal cual,
   no eliminadas -- `js/ui.js` sigue invocando `_evFabCerrar()` de forma
   defensiva al ocultar el FAB, ver ese archivo). La visibilidad del FAB
   en sí (admin + pantalla activa) la resuelve ir()/js/ui.js en cada
   cambio de pantalla, mismo criterio que #home-nav/#s4-nav. */
var _evFabAbierto = false;
function _evFabToggle() {
  _evFabAbierto = !_evFabAbierto;
  var menu = document.getElementById('ev-fab-menu');
  if (menu) menu.classList.toggle('ev-fab-abierto', _evFabAbierto);
  var btn = document.getElementById('ev-fab-btn');
  if (btn) btn.setAttribute('aria-expanded', String(_evFabAbierto));
}
function _evFabCerrar() {
  if (!_evFabAbierto) return;
  _evFabAbierto = false;
  var menu = document.getElementById('ev-fab-menu');
  if (menu) menu.classList.remove('ev-fab-abierto');
  var btn = document.getElementById('ev-fab-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
// Tocar afuera del menú (y del propio botón, que ya vive adentro de
// #ev-fab-menu) lo cierra -- un solo listener delegado en document, mismo
// patrón que ya usan las burbujas de mes/búsqueda/filtros de esta misma
// pantalla (_evTogglePanel()) para su cierre "al tocar afuera".
document.addEventListener('click', function(e) {
  if (!_evFabAbierto) return;
  var menu = document.getElementById('ev-fab-menu');
  if (menu && !menu.contains(e.target)) _evFabCerrar();
});

// Skeleton de #ev-timeline mientras _evCargarDatosReales() espera la
// respuesta real -- reemplaza el loader de pantalla completa que tenía antes
// (ver "Cambios recientes"), mismo criterio ya establecido en este mismo
// archivo (`_evAntSkeletonHtml()`, `eventosAbrirAnticipada()`) y en
// `_skeletonFechasHtml()`/`cargarFechas()` (js/reservas.js): navegar a la
// pantalla de una, con un skeleton CONTENIDO en el lugar real del contenido,
// en vez de bloquear la navegación detrás de un overlay. Reusa `.ev-card`
// real (para que el ancho/padding/radio coincidan con las cards reales que
// lo van a reemplazar) + el shimmer ya existente `.fi-skel-block` con las
// mismas 3 formas que `_evAntSkeletonHtml()` (ícono 42px + 2 barras).
function _evTimelineSkeletonHtml() {
  var carta = '<div class="ev-card"><div class="ev-card-top-row">' +
    '<div class="fi-skel-block ev-ant-skel-icon"></div>' +
    '<div class="ev-card-body">' +
      '<div class="fi-skel-block ev-ant-skel-title"></div>' +
      '<div class="fi-skel-block ev-ant-skel-sub"></div>' +
    '</div>' +
  '</div></div>';
  return carta.repeat(5);
}

/* ── Punto de entrada (ver 'entrar' de APP_BOTTOM_NAV_ITEMS en js/ui.js) ── */
function irEventos() {
  if (_evYaInicializadoEnSesion) {
    _evRestaurarScrollTimeline = true;
    // Bug real (ver "Cambios recientes"): `_evPrecargarRoster()` -- más
    // abajo, "precarga UNA sola vez por sesión" -- solo se llamaba en la
    // rama de INICIALIZACIÓN completa (la de abajo, primera visita real a
    // Eventos), nunca acá. Si esa primera visita ocurrió ANTES de que
    // `_adminToken` estuviera listo (carrera con la restauración de sesión
    // admin async, `window.onload`/`restaurarSesion()`, js/auth.js -- caso
    // real posible: alguien navega a Eventos apenas carga la página, antes
    // de que el token admin termine de restaurarse), `_evPrecargarRoster()`
    // se ejecutaba, veía `_adminToken` todavía vacío y retornaba sin pedir
    // nada -- `_evRosterEquipo` quedaba en `null` PARA SIEMPRE, porque
    // ninguna visita siguiente a Eventos esta sesión iba a volver a llamar
    // esa función (esta rama de acá, la de "ya inicializado", nunca la
    // tocaba). Reintento barato acá: si el roster nunca llegó a cargarse
    // (`null`, no `[]` -- distinto de "cargó y no hay nadie"), reintentar es
    // gratis -- la propia función ya es un no-op si `_adminToken` sigue sin
    // estar, y si ya está, dispara el único request real que faltaba.
    if (_evRosterEquipo === null) {
      if (window.console) console.log('Eventos: irEventos() ya inicializado esta sesión, pero _evRosterEquipo sigue null -- reintentando _evPrecargarRoster()');
      _evPrecargarRoster();
    }
    volver('s-eventos');
    _evActualizarTopBarModo();
    return;
  }
  _evTimelineFiltro = { lugar: [], tipo: [] };
  _evBusqueda = '';
  var inp = document.getElementById('ev-search-input'); if (inp) inp.value = '';
  _evPanelAbierto = null;
  _evNavMesActual = null;
  _evCalVisible = false;
  _evCalFechaMostrada = null;
  _evCalFechaSeleccionada = null;
  _evCalUltimaAccionTs = 0;
  _evRestaurarScrollTimeline = false;
  var mesPanel = document.getElementById('ev-mes-panel');
  if (mesPanel) { mesPanel.classList.remove('abierta'); mesPanel.style.maxHeight = '0px'; }
  var navMesLabel = document.getElementById('ev-nav-mes-label');
  if (navMesLabel) navMesLabel.classList.remove('ev-nav-mes-label-activo');
  _evActualizarNavMesChevron();
  // Visibilidad del FAB (#ev-fab-menu, index.html) según _adminToken se
  // resuelve en ir()/js/ui.js (mismo criterio que #home-nav/#s4-nav ahí),
  // no acá -- irEventos() ya no necesita tocar ningún botón "+" propio.
  _evActualizarBotonesFiltro();
  // Skeleton en vez de loader de pantalla completa (ver _evTimelineSkeletonHtml()
  // arriba) -- se navega a la pantalla de inmediato, ANTES de que la carga
  // real resuelva, mismo criterio que cargarFechas()/eventosAbrirAnticipada().
  var cont = document.getElementById('ev-timeline');
  if (cont) cont.innerHTML = _evTimelineSkeletonHtml();
  volver('s-eventos');
  // Independiente de _evCargarDatosReales() -- no bloquea el render del
  // timeline (ver el comentario de _evPrecargarRoster() para el porqué).
  _evPrecargarRoster();
  _evCargarDatosReales(function() {
    _evRenderTimeline(true);
    // `ir()` (js/ui.js) ya disparó su propio `window.scrollTo(0,0)`
    // instantáneo al cambiar de pantalla, arriba -- este setTimeout(50) corre
    // DESPUÉS (mismo criterio que el resto del archivo: offsetHeight/
    // getBoundingClientRect de una pantalla recién visible no son reales
    // hasta el siguiente tick) y lo reemplaza por un salto instantáneo
    // hasta "hoy" -- mismo espíritu que la agenda de Google Calendar, que
    // abre parada en el día de hoy en vez de en el principio de la lista.
    setTimeout(function() {
      _evScrollAFecha(_evHoyISO(), true);
      _evActualizarNavMesPorScroll();
      _evUpdateRsvpSliders(false);
    }, 50);
  });
  _evYaInicializadoEnSesion = true;
  _evActualizarTopBarModo();
}

// Punto de entrada usado por `restaurar` del ítem 'eventos' (APP_BOTTOM_NAV_ITEMS,
// js/ui.js) -- ver "Cambios recientes", preservación de estado por tab: se
// llama en vez de `irEventos()` cuando se vuelve a Eventos desde OTRO tab de
// la nav inferior (irEventos() sigue siendo el que corre al tocar el tab
// Eventos YA activo -- ese SÍ debe resetear a la raíz, ver `_bottomNavClick()`).
// `pantallaGuardada` es la última `.pantalla` de Eventos que estaba activa
// (`s-eventos`/`s-eventos-detalle`/`s-eventos-anticipada`, ver
// `_bottomNavUltimaPantalla`, js/ui.js). Detalle y Asistencia anticipada
// reaparecen tal cual: ninguno de los dos se destruye al abandonarlos (`ir()`
// solo togglea `.activa`), así que alcanza con volver a mostrarlos -- lo
// único que hace falta re-disparar es lo que depende de layout REAL (sticky
// del detalle, footer/paso del wizard), medido en cero mientras la pantalla
// estuvo `display:none` detrás de otro tab.
function _evRestaurarTab(pantallaGuardada) {
  if (pantallaGuardada === 's-eventos-anticipada' && document.getElementById('s-eventos-anticipada')) {
    ir('s-eventos-anticipada');
    var wizard = document.getElementById('ev-ant-wizard');
    // Wizard visible -- re-muestra el footer (oculto de golpe por `ir()` al
    // abandonar la sección -- ver comentario de `#cta-footer-eventos-anticipada`
    // en ese archivo), reposiciona el slider de "Estado a aplicar" y el `top`
    // de los headers sticky del acordeón (mide layout real, cero mientras la
    // pantalla estuvo `display:none` detrás de otro tab, mismo motivo que
    // `_evDetalleActualizarSticky()` en `abrirEvDetalle()`) -- las
    // pills/fechas/secciones abiertas del acordeón siguen tal cual quedaron,
    // nunca se resetean.
    if (wizard && wizard.style.display !== 'none') {
      _evAntActualizarFooter();
      var estadoSeg = document.getElementById('ev-ant-estado-seg');
      if (estadoSeg) _evPosicionarRsvpSlider(estadoSeg, false);
      _evAntActualizarStickyAcordeon();
    }
    return;
  }
  if (pantallaGuardada === 's-eventos-detalle' && document.getElementById('s-eventos-detalle')) {
    ir('s-eventos-detalle');
    _evDetalleActualizarSticky();
    setTimeout(function() { _evUpdateRsvpSliders(false); }, 50);
    return;
  }
  // Bug real corregido (ver "Cambios recientes"): esta rama faltaba --
  // `s-eventos-marcar-asistencia` sí está en `_BOTTOM_NAV_EXTRA` (js/ui.js,
  // así que `_bottomNavUltimaPantalla['eventos']` SÍ queda con este id), pero
  // sin una rama acá caía al fallback `irEventos()` de más abajo, que resetea
  // a la raíz -- volver a Eventos desde otro tab mientras esta subpantalla
  // estaba abierta perdía la subpantalla en vez de reaparecer en ella (mismo
  // síntoma general que ya se había corregido para detalle/anticipada, esta
  // quedó afuera por ser nueva). `_evMarcarAsistIdEvento` sigue en memoria
  // (nunca se limpia al salir) -- alcanza con reusarlo para repintar la lista.
  if (pantallaGuardada === 's-eventos-marcar-asistencia' && document.getElementById('s-eventos-marcar-asistencia') && _evMarcarAsistIdEvento) {
    ir('s-eventos-marcar-asistencia');
    _evRenderMarcarAsistLista('');
    return;
  }
  irEventos();
}

/* ── Burbuja de cabecera: búsqueda + filtros fusionados (ver "Cambios
   recientes" -- antes 2 burbujas separadas, filtros/búsqueda, mismo
   mecanismo pero 2 entradas en `_EV_PANELES`; ahora 1 sola). Mecanismo
   max-height con `scrollHeight` real (evita el "golpe" de un techo fijo
   mucho más alto que el contenido real). El calendario (`_evCalVisible`) YA
   NO pasa por acá (ver "Cambios recientes" -- rediseño de navegación de
   Calendario): tiene su propio mecanismo (`_evAbrirCalendario()`/
   `_evCerrarCalendario()` más abajo), pero sigue siendo mutuamente excluyente
   con esta -- abrir cualquiera cierra la otra. Queda como objeto (en vez de
   variables sueltas) por si a futuro suma otra burbuja hermana. */
var _EV_PANELES = {
  busqueda: { el: 'ev-busqueda-panel', btn: 'ev-busqueda-toggle-btn', claseActiva: 'ev-filtro-toggle-activo' }
};
function _evTogglePanel(tag) {
  if (tag === 'mes') {
    if (_evPanelAbierto) { _evCerrarPanel(_evPanelAbierto); _evPanelAbierto = null; }
    if (_evCalVisible) _evCerrarCalendario(); else _evAbrirCalendario();
    return;
  }
  if (_evCalVisible) _evCerrarCalendario();
  if (_evPanelAbierto === tag) _evCerrarPanel(tag);
  else { if (_evPanelAbierto) _evCerrarPanel(_evPanelAbierto); _evAbrirPanel(tag); }
}
function _evAbrirPanel(tag) {
  _evPanelAbierto = tag;
  var cfg = _EV_PANELES[tag];
  var el = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (el) { el.classList.add('abierta'); el.style.maxHeight = el.scrollHeight + 'px'; }
  if (btn) btn.classList.add(cfg.claseActiva);
  if (tag === 'busqueda') {
    setTimeout(function() { var inp = document.getElementById('ev-search-input'); if (inp) inp.focus(); }, 50);
  }
}
function _evCerrarPanel(tag, instant) {
  if (_evPanelAbierto === tag) _evPanelAbierto = null;
  var cfg = _EV_PANELES[tag];
  var el = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (el) {
    if (instant) {
      el.style.transition = 'none';
      el.classList.remove('abierta');
      el.style.maxHeight = '0px';
      void el.offsetHeight; // fuerza el reflow síncrono antes de restaurar la transición
      el.style.transition = '';
    } else {
      // Congela el alto actualmente visible ANTES de animar a 0 -- una
      // burbuja hija (filtro Lugar/Tipo) pudo haber relajado el techo por su
      // cuenta mientras este panel estaba abierto.
      el.style.maxHeight = el.scrollHeight + 'px';
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          el.classList.remove('abierta');
          el.style.maxHeight = '0px';
        });
      });
    }
  }
  if (btn) btn.classList.remove(cfg.claseActiva);
  // Limpieza de las 2 secciones fusionadas (ver "Cambios recientes" -- antes
  // 2 ramas separadas, `tag === 'filtros'`/`tag === 'busqueda'`, ahora un
  // solo panel las contiene a ambas siempre): colapsa cualquier burbuja
  // Lugar/Tipo que haya quedado abierta (sin tocar la SELECCIÓN de esos
  // filtros, que persiste) y vacía el texto de búsqueda.
  if (_evFiltroBurbujaAbierta) {
    _evColapsarFiltroBurbuja(_evFiltroBurbujaAbierta);
    _evFiltroBurbujaAbierta = null;
    _evActualizarBotonesFiltro();
  }
  var inp = document.getElementById('ev-search-input');
  if (inp) inp.value = '';
  _evBuscar('');
}
// Chequeo compartido de "¿este toque fue AFUERA de la burbuja abierta y de su
// propio ícono trigger?" -- usado por los 2 listeners de abajo (click Y
// pointerdown) para no tener 2 copias de la misma condición de contención
// que puedan desincronizarse.
function _evCerrarBurbujaSiFueraDe(target) {
  if (!_evPanelAbierto) return;
  // Excepción explícita (ver "Cambios recientes" -- pedido confirmado): con
  // texto escrito en el buscador, un scroll/tap AFUERA del panel (ej. entre
  // las cards de resultado, que viven en #ev-timeline, afuera de
  // #ev-busqueda-panel) NO debe cerrar la burbuja -- solo el ícono de la
  // lupa (#ev-busqueda-toggle-btn, `_evToggleBusqueda()`, no pasa por acá)
  // la cierra en ese estado. Buscador vacío sigue con el comportamiento de
  // siempre (cierre por cualquier gesto afuera).
  if (_evPanelAbierto === 'busqueda' && _evBusqueda.trim() !== '') return;
  var cfg = _EV_PANELES[_evPanelAbierto];
  if (!cfg) return;
  var panelEl = document.getElementById(cfg.el);
  var btnEl = document.getElementById(cfg.btn);
  if ((panelEl && panelEl.contains(target)) || (btnEl && btnEl.contains(target))) return;
  _evCerrarPanel(_evPanelAbierto);
}
// Cualquier click fuera de la burbuja de filtros/búsqueda ABIERTA (y fuera de
// su propio ícono trigger) la cierra -- sin bloquear la acción tocada (ver
// "Cambios recientes": "hoy" cierra la burbuja Y navega en el mismo toque,
// tocar una card cierra la burbuja Y abre el detalle). Bubble phase a
// propósito (sin 3er argumento `true`): corre DESPUÉS del onclick del propio
// elemento tocado, así ambos efectos conviven en el mismo toque sin
// necesitar coordinarlos a mano en cada botón. El calendario (`_evCalVisible`)
// NO pasa por acá -- solo el chevron/label de la nav lo cierra (ver
// "Cambios recientes" -- rediseño de Calendario, es la única acción que lo
// cierra del todo, a propósito, para no pelear con el scroll/swipe).
document.addEventListener('click', function(e) { _evCerrarBurbujaSiFueraDe(e.target); });
// Cierre por el INICIO de cualquier gesto, no solo un tap completo (ver
// "Cambios recientes" -- pedido explícito: scrollear el timeline con la
// burbuja abierta debía cerrarla apenas arranca el gesto, sin esperar a que
// termine). El listener de arriba (`click`) NO alcanza para esto: un
// scroll/drag real nunca dispara `click` -- solo un tap sin arrastre lo hace
// -- así que la burbuja se quedaba abierta/flotando mientras el usuario
// scrolleaba por abajo. 2 eventos, mismo handler (no alcanza con uno solo):
// `pointerdown` es lo que dispara un toque real en un dispositivo (mouse/pen/
// touch unificados, llega ANTES que cualquier `touchstart`) pero un
// `TouchEvent` armado a mano (`new TouchEvent(...)` + `dispatchEvent()`, como
// hace este mismo archivo para el swipe del calendario, y como usa la
// verificación de Playwright de este punto) NO pasa por la traducción nativa
// touch→pointer del navegador y nunca dispara `pointerdown` -- por eso
// también se escucha `touchstart` directo, para cubrir ambos casos sin
// depender de cuál pipeline de eventos generó el toque. Fase de CAPTURA
// (`capture:true`) a propósito, aunque hoy ningún handler de esta pantalla
// usa `stopPropagation()`: corre ANTES que cualquier handler propio del
// elemento tocado, así un gesto interno futuro (ej. el swipe del calendario)
// no puede interponerse por accidente si algún día suma uno. `passive:true`
// (ver "Cambios recientes" -- bug real de corrección, encontrado auditando
// el propio listener durante la investigación de scroll poco fluido: la
// versión anterior pasaba `true` como 3er argumento posicional -- solo
// `capture`, SIN `passive` -- un listener de `touchstart` no-pasivo en
// `document` puede forzar al navegador a esperar a que el handler termine
// antes de comprometerse con el gesto de scroll nativo, en TODA la app, no
// solo donde hay una burbuja para cerrar. El handler nunca llama
// `preventDefault()` -- marcarlo pasivo es 100% seguro y solo puede ayudar,
// sin cambiar nada de su comportamiento).
['pointerdown', 'touchstart'].forEach(function(tipo) {
  document.addEventListener(tipo, function(e) { _evCerrarBurbujaSiFueraDe(e.target); }, { capture: true, passive: true });
});
function _evToggleMesPanel() { _evTogglePanel('mes'); }
function _evToggleBusqueda() { _evTogglePanel('busqueda'); }

/* ── Fade genérico (ver "Cambios recientes" -- reemplaza el crossfade
   `_evAnimarCambioContenido()` que existió en la tanda anterior, eliminado
   por falta de consumidores; se reintroduce acá, más chico, para 2 usos:
   el label de mes de la nav y el contenido del panel de calendario).
   `instant` (usado en la primera pintada al abrir, sin fade desde vacío) se
   salta la animación. Guard de epoch (propiedad del propio `el`) contra que
   un `pintar()` tardío de una llamada vieja pise el contenido que una más
   nueva ya haya pintado -- necesario para swipes rápidos sucesivos sin
   esperar la animación (ver "Cambios recientes", punto de verificación).
   `ms` (opcional, ver "Cambios recientes" -- bug real encontrado con
   Playwright grabando frame a frame: al swipear entre un mes de 5 y uno de
   6 semanas, este fade -- fijo en 130ms -- terminaba mucho ANTES que la
   transición de `max-height` del panel exterior (280ms, CSS), así que el
   contenido nuevo quedaba 100% opaco pero todavía "recortándose" contra un
   panel que seguía creciendo/encogiendo por otros ~150ms -- se veía como un
   salto/superposición en vez de una transición prolija) permite que el
   panel de calendario pase el mismo largo que su propia transición de alto,
   para que ambas terminen exactamente juntas; los demás usos (label de mes)
   no lo pasan y siguen en el valor rápido de siempre. */
var _EV_FADE_MS = 130;
function _evFadeSwap(el, pintar, instant, ms) {
  if (instant) { pintar(); return; }
  ms = ms || _EV_FADE_MS;
  el._fadeEpoch = (el._fadeEpoch || 0) + 1;
  var epoch = el._fadeEpoch;
  el.style.transition = 'opacity ' + ms + 'ms ease';
  el.style.opacity = '0';
  setTimeout(function() {
    if (el._fadeEpoch !== epoch) return;
    pintar();
    el.style.transition = 'none';
    el.style.opacity = '0';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (el._fadeEpoch !== epoch) return;
        el.style.transition = 'opacity ' + ms + 'ms ease';
        el.style.opacity = '1';
      });
    });
  }, ms);
}

/* ── Panel de calendario -- swipe-first (ver "Cambios recientes": rediseño
   completo de la navegación de Calendario). `_evCalFechaMostrada` (iso) es
   la única fuente de verdad de qué mes se ve -- mes mostrado = mes de esa
   fecha. Swipe/tap la cambian directo y re-renderizan sincrónico, SIN
   esperar a que el scroll del timeline "confirme" nada (evita
   inconsistencias con swipes rápidos sucesivos). Sin estado de semana (ver
   "Cambios recientes" -- eliminado), el scroll del timeline YA NO gobierna
   nada del calendario en sí -- solo sigue sincronizando el label de mes de
   la nav de forma pasiva, ver `_evActualizarNavMesPorScroll()`. */
// Sincroniza el label de mes de la nav DIRECTO desde una fecha del
// calendario (swipe/tap/pill) -- ver "Cambios recientes", bug real
// encontrado con Playwright: depender solo del scroll-listener pasivo
// (`_evActualizarNavMesPorScroll()`) para actualizar el label fallaba
// cuando `_evScrollAFecha()` decidía que el destino YA estaba visible (no
// scrollea, no dispara ningún evento de scroll, el label quedaba
// congelado) -- típico en swipes de semana (±7 días, casi siempre ya
// visible) y en swipes rápidos sucesivos. El calendario ahora siempre fija
// el label él mismo, sin depender de que el scroll "confirme" nada.
function _evSincronizarNavMesDesde(iso, instant) {
  var m = _evCalMesDe(iso);
  if (_evNavMesActual && _evNavMesActual.year === m.year && _evNavMesActual.month === m.month) return;
  _evNavMesActual = { year: m.year, month: m.month };
  _evActualizarNavMesLabel(instant);
}
function _evAbrirCalendario() {
  _evCalUltimaAccionTs = Date.now();
  var base = _evNavMesActual ? _evToISO(new Date(_evNavMesActual.year, _evNavMesActual.month, 1)) : _evHoyISO();
  _evCalFechaMostrada = base;
  _evSincronizarNavMesDesde(base, true);
  // `_evCalVisible` recién pasa a true DESPUÉS de pintar contenido/pills (ver
  // "Cambios recientes" -- bug real: si se seteaba arriba, el guard de
  // `_evCalActualizarMaxHeightExterior()` (llamado por `_evCalRenderContenido()`
  // con `instant=true` acá abajo) dejaba de cortar por `if (!_evCalVisible)
  // return`, así que esa llamada YA fijaba `el.style.maxHeight` al alto real
  // con `transition:none` -- el panel quedaba "commiteado" a su alto final
  // ANTES de que el `classList.add('abierta')` + `maxHeight` de abajo (el que
  // debía animar) corriera, así que ese 2do set no cambiaba nada (mismo
  // valor) y no había transición que reproducir -- se abría de golpe. El
  // cierre (`_evCerrarCalendario()`) no compartía este bug: ahí no hay
  // ningún set instantáneo previo que pise el punto de partida.
  _evCalRenderContenido(true);
  _evCalRenderPills();
  _evCalVisible = true;
  var el = document.getElementById('ev-mes-panel');
  if (el) { el.classList.add('abierta'); el.style.maxHeight = el.scrollHeight + 'px'; }
  _evActualizarNavMesChevron();
}
// Única acción que cierra el calendario del todo (ver "Cambios recientes",
// punto 7 del rediseño) -- sin importar si estaba expandido (mes) o
// colapsado (semana).
function _evCerrarCalendario() {
  _evCalVisible = false;
  var el = document.getElementById('ev-mes-panel');
  if (el) {
    el.style.maxHeight = el.scrollHeight + 'px';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.classList.remove('abierta');
        el.style.maxHeight = '0px';
      });
    });
  }
  _evActualizarNavMesChevron();
}
function _evActualizarNavMesChevron() {
  var ch = document.getElementById('ev-nav-mes-chevron');
  if (ch) ch.textContent = _evCalVisible ? 'expand_less' : 'expand_more';
  var label = document.getElementById('ev-nav-mes-label');
  if (label) label.classList.toggle('ev-nav-mes-label-activo', _evCalVisible);
}
function _evCalMesDe(iso) { var d = _evParseISO(iso); return { year: d.getFullYear(), month: d.getMonth() }; }
// Techo del panel exterior -- se recalcula tras CUALQUIER cambio de
// contenido (ej. otro mes con 5 vs. 6 semanas en la grilla) para que nunca
// recorte contenido más alto que el que tenía la última vez que se fijó
// (ver "Cambios recientes" -- mismo criterio que `_evToggleFiltroBurbuja()`
// relajando el panel padre). `instant` (sin transición + reflow forzado,
// mismo truco que `_evCerrarPanel(tag, true)`) SOLO se usa para la primera
// pintada al abrir el calendario (`_evAbrirCalendario()`, sin nada que
// animar todavía -- el panel pasa de `max-height:0` a su alto real vía la
// transición normal de `.abierta` inmediatamente después, este set previo es
// solo para no arrancar en 0 durante ese primer instante) y para el resize
// de ventana (sin gesto de por medio que justifique animar). En cambio-de-mes
// real (swipe/pill, ver "Cambios recientes" -- pedido explícito: el cambio
// de alto entre un mes de 5 y uno de 6 semanas se sentía como un salto en
// vez de una transición) NO es instant -- el techo crece/encoge con la
// misma transición CSS de `max-height` (0.28s, `.ev-header-burbuja`) que ya
// usa abrir/cerrar el panel entero, en vez de saltar de golpe.
function _evCalActualizarMaxHeightExterior(instant) {
  if (!_evCalVisible) return;
  var el = document.getElementById('ev-mes-panel');
  if (!el) return;
  if (instant) {
    el.style.transition = 'none';
    el.style.maxHeight = el.scrollHeight + 'px';
    void el.offsetHeight;
    el.style.transition = '';
  } else {
    el.style.maxHeight = el.scrollHeight + 'px';
  }
}
window.addEventListener('resize', function() { if (_evCalVisible) _evCalActualizarMaxHeightExterior(true); });
// Sin fade de opacidad acá a propósito (ver "Cambios recientes" -- revierte
// el crossfade sincronizado que esta misma sesión le había agregado): la
// grilla cambia de contenido INSTANTÁNEO siempre. El `max-height` del panel
// exterior, en cambio, YA NO anima en el cambio de mes con distinta
// cantidad de semanas (ver "Cambios recientes" -- decisión final de Victor,
// prioridad explícita sobre el "empuje" de la grilla: cero fade en la fila
// de pills en cualquier momento, sea cual sea el costo en la animación de
// alto -- `_evCalCambiarMes()`, más abajo, llama `_evCalRenderContenido(true)`
// para esos casos). Abrir/cerrar el panel entero (`_evAbrirCalendario()`/
// `_evCerrarCalendario()`) siguen animando `max-height` con su transición
// CSS de siempre -- código separado, no tocado por esta decisión.
function _evCalRenderContenido(instant) {
  var cont = document.getElementById('ev-cal-contenido');
  if (!cont) return;
  _evCalRenderMes(cont, _evCalFechaMostrada);
  _evCalActualizarMaxHeightExterior(instant);
}
// Grilla mensual completa -- sin chevrones/borde/título repetido (ver
// "Cambios recientes", punto 1 del rediseño: el título ya está arriba, en
// el label de la nav). 2 estados de destaque posibles por celda -- "hoy"
// (relleno, `_evHoyISO()`, fijo) y "seleccionada" (anillo,
// `_evCalFechaSeleccionada`, dinámica) -- mutuamente excluyentes: si
// coinciden, gana `esHoy` (nunca las 2 clases en la misma celda, ver
// css/eventos.css). `data-iso` en cada celda -- lo usa `_evCalTocarDia()`
// para mover el anillo sin re-pintar la grilla entera.
// Cantidad de FILAS (semanas) que ocupa la grilla de un mes -- mismo cálculo
// de `inicioGrid`/`finGrid` que ya usa `_evCalRenderMes()` (lunes anterior
// al día 1 hasta el domingo siguiente al último día del mes), pero sin
// pintar nada, solo cuenta. Usado por `_evCalCambiarMes()` (ver más abajo)
// para decidir si el panel realmente necesita cambiar de alto -- y por lo
// tanto si a las pills les hace falta el fade -- o no.
function _evCalContarSemanas(iso) {
  var m = _evCalMesDe(iso);
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes);
  finGrid.setDate(finGrid.getDate() + 6);
  var dias = Math.round((finGrid - inicioGrid) / 86400000);
  return Math.round((dias + 1) / 7);
}
function _evCalRenderMes(cont, iso) {
  var m = _evCalMesDe(iso);
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes);
  finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var esHoy = celdaIso === hoy;
    var esSeleccionada = !esHoy && celdaIso === _evCalFechaSeleccionada;
    var tieneEv = _evEventosDeFecha(celdaIso).length > 0;
    var tieneCumple = _evCumpleDeFecha(celdaIso).length > 0;
    var tieneOffseason = _evOffseasonDeFecha(celdaIso);
    html += '<div class="ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (esHoy ? ' ev-dia-hoy' : '') + (esSeleccionada ? ' ev-dia-seleccionado' : '') +
      '" data-iso="' + celdaIso + '" onclick="_evCalTocarDia(\'' + celdaIso + '\')">' +
      '<div class="ev-cal-num">' + cur.getDate() + '</div>' +
      '<div class="ev-cal-dots">' +
        (tieneEv ? '<span class="ev-dot"></span>' : '') +
        (tieneCumple ? '<span class="ev-dot-cumple"></span>' : '') +
        (tieneOffseason ? '<span class="ev-dot-offseason"></span>' : '') +
      '</div>' +
    '</div>';
    cur.setDate(cur.getDate() + 1);
  }
  cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>';
}
// Tocar un día puntual -- el calendario NUNCA cambia de mes/alto por esto
// (ver "Cambios recientes": se elimina el colapso a franja semanal que
// existía antes), solo scrollea el timeline hasta esa fecha exacta y lo
// deja tal cual estaba (mes completo, sin recalcular el label de la nav --
// eso lo termina sincronizando el scroll mismo, `_evActualizarNavMesPorScroll()`,
// como cualquier scroll manual del timeline). SÍ mueve el anillo de "fecha
// seleccionada" (ver "Cambios recientes", `_evCalFechaSeleccionada` de más
// arriba) -- pero con cirugía puntual de 2 clases vía `data-iso`, no
// `_evCalRenderMes()` completo (evita un re-pintado/recalculo de alto
// innecesario por un cambio que no afecta ni contenido ni tamaño de la
// grilla).
function _evCalTocarDia(iso) {
  if (iso !== _evCalFechaSeleccionada) {
    var cont = document.getElementById('ev-cal-contenido');
    if (cont) {
      var anterior = cont.querySelector('.ev-cal-celda.ev-dia-seleccionado');
      if (anterior) anterior.classList.remove('ev-dia-seleccionado');
      if (iso !== _evHoyISO()) {
        var nueva = cont.querySelector('.ev-cal-celda[data-iso="' + iso + '"]');
        if (nueva) nueva.classList.add('ev-dia-seleccionado');
      }
    }
    _evCalFechaSeleccionada = iso;
  }
  _evScrollAFecha(iso);
}
// Swipe horizontal sobre la grilla -- único mecanismo de navegación de mes
// (ver "Cambios recientes", punto 2 del rediseño original: sin botones ‹/›)
// -- ±1 mes, siempre salta al día 1. Ya no hay branch de semana (ver
// "Cambios recientes" -- eliminada).
function _evCalMoverSwipe(dir) {
  _evCalUltimaAccionTs = Date.now();
  var m = _evCalMesDe(_evCalFechaMostrada);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  var nuevaFecha = _evToISO(new Date(year, month, 1));
  _evSincronizarNavMesDesde(nuevaFecha);
  _evCalCambiarMes(nuevaFecha);
  _evCalIrAFechaEnTimeline(nuevaFecha, true);
}
// Swipe sobre el panel (`#ev-cal-contenido` -- listeners únicos, no hace
// falta re-adjuntar por render): horizontal cambia de mes, vertical hacia
// ABAJO cierra el calendario del todo (ver "Cambios recientes", reemplaza el
// colapso a franja semanal que tenía antes esta misma dirección de swipe --
// con solo 2 estados ya no hace falta un 3er gesto). Sin `touchmove` (mismo
// criterio liviano de siempre en este archivo: solo delta inicio/fin, sin
// drag en vivo ni velocidad).
var _EV_CAL_SWIPE_UMBRAL = 45;
var _evCalSwipeStartX = 0, _evCalSwipeStartY = 0, _evCalSwipeActivo = false;
function _evInicializarSwipeCalendario() {
  var cont = document.getElementById('ev-cal-contenido');
  if (!cont) return;
  cont.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    _evCalSwipeStartX = e.touches[0].clientX;
    _evCalSwipeStartY = e.touches[0].clientY;
    _evCalSwipeActivo = true;
  }, { passive: true });
  cont.addEventListener('touchend', function(e) {
    if (!_evCalSwipeActivo) return;
    _evCalSwipeActivo = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - _evCalSwipeStartX;
    var dy = t.clientY - _evCalSwipeStartY;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) >= _EV_CAL_SWIPE_UMBRAL) _evCalMoverSwipe(dx < 0 ? 1 : -1);
    } else if (dy >= _EV_CAL_SWIPE_UMBRAL) {
      _evCerrarCalendario();
    }
  }, { passive: true });
}
_evInicializarSwipeCalendario();
// Colapso del calendario al scrollear el timeline -- drag-to-dismiss EN
// VIVO (ver "Cambios recientes" -- reemplaza la versión anterior de esta
// misma sesión, que cerraba de un salto apenas se cruzaba un umbral fijo:
// pedido explícito, mismo criterio que Google Calendar -- mientras el dedo
// sigue abajo, el panel se achica proporcional al arrastre, como un
// acordeón que sigue el gesto real; recién al soltar se decide terminar de
// cerrar (si se pasó el umbral) o volver al alto original (si no), ambos
// animados). Escucha SOLO `#ev-timeline` (nunca el panel del calendario en
// sí, que sigue cerrándose instantáneo por acción directa: chevron/label o
// su propio swipe horizontal-hacia-abajo, arriba) -- para no reintroducir el
// conflicto swipe-horizontal-de-mes vs. scroll-vertical que la
// simplificación a 2 estados de esta sesión evitó. El dedo moviéndose hacia
// ARRIBA (`dy` negativo) es lo que hace que el contenido scrollee hacia
// ABAJO -- convención estándar de touch-scroll -- por eso el panel se achica
// cuando `dy` se hace más negativo, no al revés. Solo touch (el mismo
// alcance que ya tenía el resto de los gestos de este panel -- swipe de
// mes, cierre por umbral -- ninguno soporta mouse-drag tampoco; un
// click-and-drag sobre el timeline no es un gesto estándar de desktop, ahí
// se scrollea con la rueda).
var _evTimelineDragY = 0, _evTimelineDragActivo = false, _evTimelineDragAlturaOriginal = 0;
// Umbral de "commit" como fracción del alto del panel (no el `_EV_CAL_SWIPE_UMBRAL`
// fijo de 45px que usan los otros gestos de esta pantalla) -- mismo criterio
// que un bottom sheet nativo (iOS/Android): con un panel que puede medir
// 300-450px, un umbral fijo chico se sentiría demasiado fácil de disparar
// sin querer estando el panel todavía visualmente casi entero abierto.
var _EV_CAL_DRAG_UMBRAL_FRACCION = 0.3;
function _evInicializarCierreCalendarioPorScroll() {
  var cont = document.getElementById('ev-timeline');
  var panel = document.getElementById('ev-mes-panel');
  if (!cont || !panel) return;
  cont.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1 || !_evCalVisible) return;
    _evTimelineDragY = e.touches[0].clientY;
    _evTimelineDragActivo = true;
    _evTimelineDragAlturaOriginal = panel.getBoundingClientRect().height;
  }, { passive: true });
  cont.addEventListener('touchmove', function(e) {
    if (!_evTimelineDragActivo || !_evCalVisible) return;
    var dy = e.touches[0].clientY - _evTimelineDragY;
    if (dy >= 0) { panel.style.transition = ''; panel.style.maxHeight = _evTimelineDragAlturaOriginal + 'px'; return; }
    // Sin transición mientras se arrastra -- cada frame de touchmove pisa
    // el `max-height` directo, 1:1 con el dedo (si hubiera transición
    // encima, el panel iría "atrasado" respecto al dedo en vez de seguirlo
    // en vivo).
    panel.style.transition = 'none';
    var nuevaAltura = Math.max(0, _evTimelineDragAlturaOriginal + dy);
    panel.style.maxHeight = nuevaAltura + 'px';
  }, { passive: true });
  cont.addEventListener('touchend', function(e) {
    if (!_evTimelineDragActivo) return;
    _evTimelineDragActivo = false;
    if (!_evCalVisible) return;
    var dy = e.changedTouches[0].clientY - _evTimelineDragY;
    var arrastrado = Math.max(0, -dy);
    // Restaura la transición del CSS (`.ev-header-burbuja`, 0.28s) para que
    // el tramo final -- terminar de cerrar o volver al alto original --
    // quede animado, no un salto.
    panel.style.transition = '';
    if (arrastrado >= _evTimelineDragAlturaOriginal * _EV_CAL_DRAG_UMBRAL_FRACCION) {
      // Termina de cerrar DESDE el alto parcial actual -- a propósito no
      // reusa `_evCerrarCalendario()` tal cual: esa función arranca
      // fijando `max-height` al `scrollHeight` COMPLETO antes de animar a
      // 0 (pensada para cerrar desde abierto-de-siempre, sin arrastre de
      // por medio) -- llamarla acá saltaría primero de vuelta al alto
      // completo y recién ahí cerraría, un "rebote" que el usuario no pidió.
      _evCalVisible = false;
      requestAnimationFrame(function() {
        panel.classList.remove('abierta');
        panel.style.maxHeight = '0px';
      });
      _evActualizarNavMesChevron();
    } else {
      // No llegó al umbral -- vuelve animado al alto original, el
      // calendario se queda abierto tal cual estaba.
      panel.style.maxHeight = _evTimelineDragAlturaOriginal + 'px';
    }
  }, { passive: true });
}
_evInicializarCierreCalendarioPorScroll();

/* ── Selector de mes/año en pills (ver "Cambios recientes" -- rediseño,
   punto 3: TODOS los 12 meses de una ventana de 2 años alrededor de hoy, no
   solo los que tienen eventos -- con un corte visual de año en vez de
   repetir el año en cada pill, mismo criterio que Google Calendar). Reusa
   literal `.historial-pill` (mismo componente que el selector de año de Mis
   Reservas, `js/home.js`). Tocar una pill salta al día 1 de ese mes -- mismo
   comportamiento que un swipe de mes, mismo llamado a
   `_evSincronizarNavMesDesde()` para que el label de la nav quede
   consistente sin importar el camino (ver "Cambios recientes" -- bug real
   de Playwright: el label no se actualizaba al tocar una pill de un mes
   lejano sin contenido propio, corregido en `_evActualizarNavMesPorScroll()`,
   no acá -- este handler siempre lo hizo bien). */
var _EV_MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function _evGenerarOpcionesMesPill() {
  var hoy = new Date();
  var out = [];
  for (var i = -12; i <= 12; i++) {
    var d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return out;
}
// Centrado SIEMPRE instantáneo (ver "Cambios recientes" -- unificado, antes
// solo `_evAbrirCalendario()` centraba así; swipe/pill/hoy con el calendario
// ya abierto tenían el mismo bug de corte, sin corregir en esa rama): el
// centrado corre ANTES de que arranque la transición de `max-height` del
// panel, así la fila de pills ya está en su posición final apenas se
// revela/reacomoda el panel, sin un 2do movimiento después.
function _evCalRenderPills() {
  var cont = document.getElementById('ev-mes-pills-row');
  if (!cont) return;
  var opciones = _evGenerarOpcionesMesPill();
  var actual = _evCalMesDe(_evCalFechaMostrada);
  var anioAnterior = null, html = '';
  opciones.forEach(function(o) {
    if (anioAnterior !== null && o.year !== anioAnterior) {
      html += '<div class="ev-mes-pill-corte"><span>' + o.year + '</span></div>';
    }
    anioAnterior = o.year;
    var activa = o.year === actual.year && o.month === actual.month;
    html += '<button type="button" class="historial-pill' + (activa ? ' activa' : '') + '" data-year="' + o.year + '" data-month="' + o.month + '" onclick="_evCalTocarPillMes(' + o.year + ',' + o.month + ')">' + _EV_MESES_CORTOS[o.month] + '</button>';
  });
  cont.innerHTML = html;
  _evCalCentrarPillActivaInstant();
}
// Centrado INSTANTÁNEO (ver "Cambios recientes" -- bug real, pills cortadas
// al cambiar de mes -- abrir, swipe, pill u "hoy"): `scrollLeft` fijado a
// mano en vez de `scrollIntoView({behavior:'smooth'})` -- el ancho de
// `#ev-mes-pills-row` ya es el real en este instante (`max-height:0`/en
// transición del panel exterior solo recorta VERTICAL, `overflow:hidden`,
// el ancho horizontal de adentro no se ve afectado), así que el cálculo es
// válido sin esperar a que el panel termine de asentar su alto.
function _evCalCentrarPillActivaInstant() {
  var cont = document.getElementById('ev-mes-pills-row');
  var pillActiva = cont && cont.querySelector('.historial-pill.activa');
  if (!cont || !pillActiva) return;
  cont.scrollLeft = pillActiva.offsetLeft - (cont.clientWidth - pillActiva.offsetWidth) / 2;
}
// Cambio de MES con el calendario YA ABIERTO -- 2 caminos distintos según
// si la cantidad de SEMANAS de la grilla realmente cambia (ver "Cambios
// recientes" -- antes fadeaba la fila de pills SIEMPRE, sin distinguir):
// el corte que motivó el fade de la fila (ver más abajo) solo puede pasar
// cuando el panel exterior de verdad cambia de `max-height` (grilla de 5
// semanas -> 6, o viceversa) -- si el mes viejo y el nuevo tienen la MISMA
// cantidad de semanas, el panel no se mueve un solo píxel, así que no hace
// falta esconder nada.
//
// Camino A (semanas distintas) -- deslizamiento PURO de la fila de pills
// (`transform:translateY`), SIN fade en ningún momento -- decisión final de
// Victor, con prioridad explícita sobre el "empuje" animado de la grilla
// (ver "Cambios recientes" -- 2 alternativas previas descartadas antes de
// llegar acá):
// 1. Fade de opacidad -- funcionaba (0 corte confirmado), pero se pidió
//    sacarlo de la ecuación por completo: cero fade en cualquier momento.
// 2. Desplazamiento CON el "empuje" de `max-height` corriendo en paralelo --
//    se probó y se DESCARTÓ con evidencia real de Playwright: al ENCOGER
//    (6→5 semanas), el contenido de la grilla ya shrinkea casi de
//    inmediato (el alto renderizado del panel sigue el patrón
//    `min(contenido, max-height)` de una investigación anterior de esta
//    sesión), mientras la fila de pills todavía tarda los ~0.28s completos
//    en deslizarse a su lugar -- durante ese tramo, hasta 52px de la fila
//    quedaban recortados contra el borde ya encogido del panel.
// La única forma de tener deslizamiento SIN fade y SIN ese corte: sacarle
// al panel la posibilidad de estar "a medio camino" -- `_evCalRenderContenido(true)`
// fija `max-height` de un salto (mismo truco `instant` que ya usa esta
// función para el resize de ventana) en vez de animarlo. La grilla nueva
// aparece en su tamaño final desde el primer frame -- ya no hay ningún
// tramo de alto intermedio contra el que la fila de pills pueda recortarse,
// así que el deslizamiento (que si necesita su propio tiempo para verse
// bien) no compite contra nada.
//
// Mecánica: `_evCalContarSemanas()` da la diferencia de filas entre el mes
// viejo y el nuevo; cada fila de diferencia son `filaAltura` píxeles
// (medidos del `offsetHeight` real de una celda + el `gap` de
// `.ev-cal-grid`, no un número inventado). ANTES de repintar, se fija
// `transform:translateY(deltaPx)` SIN transición -- deja la fila
// VISUALMENTE en su posición VIEJA. Se repinta grilla (`instant`, salta
// directo a su alto final) + pills, y recién ahí se anima `translateY(0)`
// con transición propia (`--ease-sheet`) -- la fila "cae"/"sube" a su
// lugar, sin que el panel se mueva ni un pixel mientras tanto (ya está en
// su tamaño final desde el repintado).
//
// Camino B (misma cantidad de semanas) -- sin fade, cirugía puntual (mismo
// criterio que ya usa `_evCalTocarDia()` para el anillo de día
// seleccionado): en vez de regenerar TODO el HTML de las pills, se le saca
// `.activa` al botón viejo y se le pone al del mes destino (ubicado por
// `data-year`/`data-month`, sumados al template de `_evCalRenderPills()`
// para esto). `.historial-pill` suma una transición de `background-color`/
// `color` (css/eventos.css) para que el relleno se sienta como que "se
// mueve" de una pill a la otra, no un cambio seco. El centrado horizontal
// va SUAVE acá (`scrollIntoView({behavior:'smooth'})`) -- a diferencia del
// Camino A, no hay ningún riesgo de corte (el panel no cambia de alto), así
// que un desplazamiento visible es la señal esperada de "te moviste de
// pill" en vez de un salto.
function _evCalCambiarMes(nuevaFecha) {
  var semanasViejas = _evCalContarSemanas(_evCalFechaMostrada);
  var semanasNuevas = _evCalContarSemanas(nuevaFecha);
  _evCalFechaMostrada = nuevaFecha;
  if (semanasViejas === semanasNuevas) {
    _evCalRenderContenido();
    _evCalMoverFillPill(nuevaFecha);
    return;
  }
  var pillsRow = document.getElementById('ev-mes-pills-row');
  var panel = document.getElementById('ev-mes-panel');
  if (!pillsRow) { _evCalRenderContenido(true); _evCalRenderPills(); return; }
  var celda = document.querySelector('.ev-cal-celda');
  var filaAltura = celda ? (celda.offsetHeight + 2) : 48; // +2px = gap de .ev-cal-grid
  var deltaPx = (semanasViejas - semanasNuevas) * filaAltura;
  // Al ENCOGER (deltaPx > 0 -- la fila arranca desplazada hacia ABAJO, en su
  // posición vieja): el panel ya salta a su alto final (más chico) en el
  // mismo instante en que se repinta -- sin margen extra, la fila queda
  // recortada contra ese borde ya más chico durante CASI TODA la animación
  // de deslizamiento (confirmado con Playwright antes de este ajuste: hasta
  // 52px de corte, sostenido ~280ms -- más severo que con el "empuje"
  // animado de la versión anterior, porque acá el panel no le da ningún
  // margen progresivo). Se relaja `overflow` del panel puntualmente
  // mientras dura el deslizamiento -- mismo criterio ya probado en el fix
  // del scroll al filtrar asistencia (reservar espacio de sobra durante una
  // transición y liberarlo recién al terminar): el panel en sí sigue sin
  // animar su alto (fijo, instantáneo, como se pidió), solo se le permite
  // temporalmente NO recortar contenido que todavía no llegó a su lugar.
  // Al CRECER no hace falta -- el panel ya es lo bastante alto desde el
  // primer frame para la fila entera, sin importar en qué punto del
  // deslizamiento esté.
  var encogiendo = deltaPx > 0;
  pillsRow.style.transition = 'none';
  pillsRow.style.transform = 'translateY(' + deltaPx + 'px)';
  void pillsRow.offsetHeight; // fuerza reflow -- fija la posición vieja antes de repintar
  if (encogiendo && panel) panel.style.overflow = 'visible';
  _evCalRenderContenido(true); // instant: el panel salta directo a su alto final, sin animar
  _evCalRenderPills();
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      pillsRow.style.transition = 'transform 0.28s var(--ease-sheet)';
      pillsRow.style.transform = 'translateY(0)';
      if (encogiendo && panel) {
        setTimeout(function() { panel.style.overflow = ''; }, 320);
      }
    });
  });
}
// Cirugía puntual del relleno de pill activa (Camino B de arriba) -- sin
// re-pintar `#ev-mes-pills-row` entero, solo mueve la clase `.activa` del
// botón viejo al del mes destino (ubicado por `data-year`/`data-month`).
// Si el destino no está en el DOM (fuera de la ventana de ±12 meses que
// genera `_evGenerarOpcionesMesPill()`) no hace nada -- mismo criterio de
// tolerancia que `_evCalTocarDia()` con un `data-iso` no encontrado.
function _evCalMoverFillPill(iso) {
  var cont = document.getElementById('ev-mes-pills-row');
  if (!cont) return;
  var m = _evCalMesDe(iso);
  var anterior = cont.querySelector('.historial-pill.activa');
  if (anterior) anterior.classList.remove('activa');
  var nueva = cont.querySelector('.historial-pill[data-year="' + m.year + '"][data-month="' + m.month + '"]');
  if (!nueva) return;
  nueva.classList.add('activa');
  nueva.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
function _evCalTocarPillMes(year, month) {
  _evCalUltimaAccionTs = Date.now();
  var nuevaFecha = _evToISO(new Date(year, month, 1));
  _evSincronizarNavMesDesde(nuevaFecha);
  _evCalCambiarMes(nuevaFecha);
  _evCalIrAFechaEnTimeline(nuevaFecha, true);
}

/* ── Label de mes de la nav, sincronizado por el scroll del timeline (ver
   "Cambios recientes" -- desde el rediseño de navegación de Calendario). Sin
   `IntersectionObserver` -- mismo patrón ya usado en el resto de este
   archivo: listener de scroll a nivel de módulo + `getBoundingClientRect()`.
   `_evCalUltimaAccionTs` (ver arriba) evita que el eco de scroll de un
   swipe/tap/pill recién hecho (el `scrollIntoView` instantáneo de
   `_evScrollAFecha()`) pise el label que esa misma acción ya fijó
   directo vía `_evSincronizarNavMesDesde()` -- bug real encontrado con
   Playwright: al saltar a un mes sin contenido propio, `_evScrollAFecha()`
   cae al grupo real más cercano (de OTRO mes), y sin este guard el evento de
   scroll que dispara terminaba corrigiendo el label de vuelta a ese mes
   ajeno una fracción de segundo después. */
function _evActualizarNavMesLabel(instant) {
  var span = document.getElementById('ev-nav-mes-texto');
  if (!span || !_evNavMesActual) return;
  _evFadeSwap(span, function() {
    span.textContent = NOMBRES_MESES[_evNavMesActual.month] + ' ' + _evNavMesActual.year;
  }, instant);
}
// Alto REAL de la cabecera sticky en este instante (incluye el panel de
// calendario si está expandido, o cualquier otra burbuja abierta) -- ver
// "Cambios recientes": reemplaza el `90` fijo que usaban `_evScrollAFecha()`/
// este mismo listener, correcto solo con la cabecera colapsada. Bug real
// encontrado con Playwright: al swipear de mes con el calendario expandido
// (cabecera bastante más alta que 90px), el destino del `scrollIntoView()`
// quedaba tapado por la cabecera igual que el bug original de esta sesión --
// mismo síntoma, causa distinta (acá no es scroll-anchoring, es un margen
// desactualizado). Se lee en vivo en vez de cachear: no vale la pena
// trackear cada cambio de alto (abrir/cerrar calendario, otro mes con 5 vs.
// 6 semanas, abrir/cerrar filtros/búsqueda) por separado.
function _evAlturaStickyHeader() {
  var h = document.getElementById('ev-sticky-header');
  return h ? h.getBoundingClientRect().height : 90;
}
function _evActualizarNavMesPorScroll() {
  var pantalla = document.getElementById('s-eventos');
  if (!pantalla || !pantalla.classList.contains('activa')) return;
  if (Date.now() - _evCalUltimaAccionTs < 500) return;
  var headers = document.querySelectorAll('.ev-mes-header');
  if (!headers.length) return;
  var margenSup = _evAlturaStickyHeader();
  var actual = headers[0];
  headers.forEach(function(h) { if (h.getBoundingClientRect().top <= margenSup) actual = h; });
  var year = +actual.getAttribute('data-anio'), month = +actual.getAttribute('data-mes');
  if (!_evNavMesActual || _evNavMesActual.year !== year || _evNavMesActual.month !== month) {
    var esPrimera = !_evNavMesActual;
    _evNavMesActual = { year: year, month: month };
    _evActualizarNavMesLabel(esPrimera);
  }
}
// Throttle real con rAF (ver "Cambios recientes" -- 3ra ronda de
// investigación de scroll poco fluido: perfilado con Playwright -- frame
// timing real vía rAF + `PerformanceObserver` de `longtask`, no solo
// "se siente mejor" -- en 5 pantallas distintas (Eventos, Ajustes, Mi Liga,
// detalle de evento, Home) antes de tocar nada; NINGUNA mostró long tasks ni
// un patrón de jank atribuible a este listener o a los otros 2 sospechosos
// nombrados (`overscroll-behavior` universal, el listener de cierre de
// burbujas en fase de captura -- aislados por separado, resultados
// estadísticamente iguales con o sin cada uno). Sin una causa medible que
// perseguir, este throttle se agrega de todos modos como buena práctica
// defensiva de bajo costo (no una respuesta a un problema confirmado): un
// evento `scroll` puede dispararse más de una vez por frame en algunos
// navegadores/dispositivos (trackpad de alta frecuencia, etc.) -- sin esto,
// `_evActualizarNavMesPorScroll()` (que fuerza layout con
// `getBoundingClientRect()`) podría correr más de una vez por frame sin
// necesidad. `_evNavMesScrollRafPendiente` evita encolar un 2do rAF si ya
// hay uno esperando -- como máximo 1 llamada real por frame, sin importar
// cuántos eventos `scroll` lleguen mientras tanto.
var _evNavMesScrollRafPendiente = false;
window.addEventListener('scroll', function() {
  if (_evNavMesScrollRafPendiente) return;
  _evNavMesScrollRafPendiente = true;
  requestAnimationFrame(function() {
    _evNavMesScrollRafPendiente = false;
    _evActualizarNavMesPorScroll();
  });
}, { passive: true });
// Ícono "hoy" -- si el calendario está abierto, lo vuelve al mes actual
// también (no solo scrollea el timeline) -- mismo helper que pill/swipe
// (_evCalIrAFechaEnTimeline()) por el mismo bug real de Playwright: si el
// calendario había navegado a un mes sin eventos, el timeline había quedado
// reemplazado por el aviso "No hay eventos este mes" -- SIN ningún anchor de
// fecha en el DOM, dejando este botón sin nada a lo que saltar. El helper ya
// sabe reponer el timeline completo cuando el destino sí tiene contenido,
// así que alcanza con pasar por él en vez de llamar a `_evScrollAFecha()`
// directo como antes -- PERO con `forzarHayContenido=true` (ver "Cambios
// recientes" -- bug real distinto, confirmado con Playwright: si el MES
// REAL de hoy no tiene ningún evento/cumpleaños propio -- aunque otros
// meses sí -- el chequeo normal de `_evCalIrAFechaEnTimeline()` reemplazaba
// TODO el timeline por el aviso vacío en vez de caer al día más cercano con
// contenido real, algo que "ir a hoy" nunca debería poder hacer). Sigue
// pasando por el helper (no `_evScrollAFecha()` suelto) para no perder el
// fade ni el re-pintado de recuperación si el timeline ya estaba mostrando
// ese aviso de una navegación previa.
function _evIrAHoy() {
  var hoy = _evHoyISO();
  // Tocar "hoy" es una acción explícita de ir a un día puntual -- también
  // actualiza "fecha seleccionada" (ver "Cambios recientes",
  // `_evCalFechaSeleccionada`), aunque al coincidir con `esHoy` no se note
  // ningún anillo extra (gana el relleno) -- resetea cualquier selección
  // previa de otro día.
  _evCalFechaSeleccionada = hoy;
  if (_evCalVisible) {
    _evCalUltimaAccionTs = Date.now();
    _evSincronizarNavMesDesde(hoy);
    _evCalCambiarMes(hoy);
  }
  _evCalIrAFechaEnTimeline(hoy, false, true, true);
}

/* ── Consultas sobre los datos de prueba (idénticas a como se filtrarían
   los datos reales de getEventosRango()/getCumpleañosRango()) ──────────── */
// Filtros Lugar/Tipo -- comparten el mismo estado `_evTimelineFiltro`
// (declarado más abajo, junto al resto del panel de filtros): un solo helper
// reusado tanto por los puntitos de la grilla del panel de mes
// (_evEventosDeFecha()) como por el timeline (_evRenderTimeline()). Los
// cumpleaños NUNCA pasan por ACÁ -- no tienen lugar/tipo propios, tienen su
// propio criterio (`_evPasaFiltroLugarTipoCumple()`, justo abajo).
function _evPasaFiltroLugarTipo(lugar, tipo) {
  var fl = _evTimelineFiltro.lugar, ft = _evTimelineFiltro.tipo;
  if (fl.length && !fl.some(function(o) { return o.val === lugar; })) return false;
  if (ft.length && !ft.some(function(o) { return o.val === tipo; })) return false;
  return true;
}
// Criterio de Lugar/Tipo para CUMPLEAÑOS (ver "Cambios recientes" -- antes
// inmunes a estos 2 filtros del todo, solo respetaban la búsqueda de texto).
// Lugar: los cumpleaños no tienen lugar propio -- cualquier selección de
// Lugar los excluye siempre (si el usuario filtró por un lugar puntual, no
// tiene sentido mostrarle cumpleaños ahí). Tipo: pasan solo si "Cumpleaños"
// (la opción fija agregada en `_evOpcionesFiltro()`) está entre los tipos
// seleccionados -- mismo criterio OR-dentro-del-campo que ya tienen
// Lugar/Tipo entre sí (ej. "Cumpleaños" + "Entrenamiento" seleccionados a la
// vez muestra ambos). Sin ningún filtro activo, pasan siempre (default).
function _evPasaFiltroLugarTipoCumple() {
  var fl = _evTimelineFiltro.lugar, ft = _evTimelineFiltro.tipo;
  if (fl.length) return false;
  if (ft.length && !ft.some(function(o) { return o.val === 'Cumpleaños'; })) return false;
  return true;
}
function _evEventosDeFecha(iso) { return _EV_EVENTOS.filter(function(e) { return _evFechaCmp(e.fecha, iso) === 0 && _evPasaFiltroLugarTipo(e.lugar, e.tipo); }); }
function _evCumpleDeFecha(iso) { return _EV_CUMPLEANOS.filter(function(c) { return _evFechaCmp(c.fecha, iso) === 0; }); }
// Temporadas de descanso (Tanda B, ver MANIFEST.md "Cambios recientes") --
// `iso` cae "dentro" de una temporada con `fechaInicio <= iso <= fechaFin`
// (inclusive en ambos extremos), no solo coincidencia exacta como
// _evCumpleDeFecha() -- una temporada dura varios días, cada uno de ellos
// debe marcarse en la grilla, no solo el primero.
function _evOffseasonDeFecha(iso) { return _EV_OFFSEASON.some(function(o) { return _evFechaCmp(iso, o.fechaInicio) >= 0 && _evFechaCmp(iso, o.fechaFin) <= 0; }); }

// Bug real encontrado y corregido (ver "Cambios recientes" -- confirmado con
// Playwright instrumentando `lanzarConfetti()`, no adivinado leyendo el
// código: el confetti de cumpleaños nunca se veía, sin ningún error en
// consola). `irEventos()` llama `_evRenderTimeline()` (que termina acá,
// disparando esto) ANTES de `volver('s-eventos')` -- en ese instante
// `#s-eventos` todavía NO tiene `.activa` (display:none heredado de
// `.pantalla`), así que `#ev-confetti-<id>` mide `clientWidth`/`clientHeight`
// = 0. `lanzarConfetti()` (js/ui.js) usa esas medidas UNA SOLA VEZ para fijar
// `canvas.width`/`canvas.height` al crear el canvas -- un canvas creado a
// 0×0 se queda en 0×0 para siempre (el atributo `width`/`height` del canvas
// no se re-mide solo cuando el contenedor se vuelve visible después), así
// que nunca se veía una sola partícula, sin lanzar ningún error. Fix: no
// lanzar el confetti hasta confirmar que el contenedor YA tiene medidas
// reales (`clientWidth`/`clientHeight` > 0) -- reintenta en el próximo frame
// (`requestAnimationFrame`, no un `setTimeout` con un número inventado) si
// todavía no las tiene, con un tope de reintentos para no loopear para
// siempre si el contenedor nunca llega a mostrarse.
function _evLanzarConfettiCuandoVisible(el, intentosRestantes) {
  if (intentosRestantes === undefined) intentosRestantes = 10;
  if (el.clientWidth > 0 && el.clientHeight > 0) { lanzarConfetti(el); return; }
  if (intentosRestantes <= 0) return;
  requestAnimationFrame(function() { _evLanzarConfettiCuandoVisible(el, intentosRestantes - 1); });
}
// Tocar un día (grilla del panel de mes, o el ícono "hoy") hace scroll hasta
// su grupo en el timeline, PERO solo si no está ya completamente visible
// (ver "Cambios recientes" -- pedido explícito: nada de saltos si ya se ve
// todo). Márgenes del chequeo iguales a los que usa el scroll real: alto
// REAL de la cabecera sticky arriba (`_evAlturaStickyHeader()`, ver
// "Cambios recientes" -- ya NO es un 90px fijo, variaba con el calendario
// expandido/colapsado) y `--bottom-nav-h` abajo (css/colors.css). Antes de
// scrollear, publica ese mismo alto en `--ev-sticky-h` (CSS var que lee
// `scroll-margin-top` de `.ev-fecha-grupo`, css/eventos.css) -- el
// `scrollIntoView()` nativo de más abajo usa esa property para no alinear el
// destino justo debajo del borde de la cabecera, sino con el margen real que
// tiene en este instante. `instant` (opcional, ver irEventos()) fuerza
// `behavior:'auto'` en vez de `'smooth'` -- posición inicial de entrada, no
// un scroll disparado por el usuario. Sin grupo exacto para `iso` (ej. "hoy"
// sin eventos propios, ver "Cambios recientes" -- decisión confirmada: no se
// fuerza un renglón vacío para hoy) cae al grupo real más cercano en el
// tiempo (_evFechaGrupoMasCercano()). Prioriza el separador de sección
// (`.ev-hoy-separador` -- HOY/MAÑANA/ESTA SEMANA/PRÓXIMA SEMANA,
// `_evRenderTimeline()`) sobre el `.ev-fecha-grupo` cuando ese grupo tiene
// uno pegado justo arriba en el flujo (ver "Cambios recientes" -- antes solo
// cubría el caso -HOY-, generalizado acá a los 3 restantes): son elementos
// vecinos con su propio `scroll-margin-top` cada uno, pero apuntar al grupo
// deja el separador (arriba de él en el flujo) fuera de vista -- SIN
// contexto de si lo que sigue es mañana, esta semana o la próxima. Bug real
// (ver MANIFEST.md "Cambios recientes"): con "Hoy" sin eventos propios pero
// sí mañana/la semana que viene, el botón llevaba directo al primer grupo
// futuro sin que el separador correspondiente quedara visible arriba,
// perdiendo ese contexto -- el mismo bug que ya se había corregido puntual
// para -HOY-, sin generalizar en su momento a los otros 3 separadores.
//
// **Bug real encontrado y corregido con Playwright (ver "Cambios
// recientes" -- separador -HOY- tapado a medias por la cabecera SOLO en el
// salto automático al abrir Eventos, nunca en un salto manual posterior).**
// Causa raíz: `irEventos()` llama a esta función a los 50ms de activar
// `#s-eventos` (`ir()`), pero `.pantalla.activa` anima
// `transform:translateY(20px)->none` durante sus primeros 600ms
// (`smoothSlideUp`, css/estilos.css) -- a los 50ms ese transform sigue
// activo casi por completo. `getBoundingClientRect()` (usado antes acá,
// tanto en el chequeo `yaVisible` como implícitamente dentro de
// `scrollIntoView()`) devuelve la posición YA RENDERIZADA, con el
// desplazamiento del transform incluido -- `#ev-sticky-header`
// (`position:sticky`) se re-ancla solo en cada frame contra el viewport y
// queda inmune, pero `#ev-separador-hoy`/`.ev-fecha-grupo` (elementos
// normales) SÍ heredan el desplazamiento. `scrollIntoView()` alineaba el
// destino contra esa posición TRANSFORMADA del instante -- al terminar de
// asentarse la animación (transform ya en `none`, sin ningún re-scroll)
// el separador quedaba hasta 20px más arriba de lo calculado, parcialmente
// tapado por la cabecera. Confirmado con Playwright instrumentando
// `_evScrollAFecha()`: `offsetTop`/`offsetParent` (posición de LAYOUT,
// ajena a cualquier `transform` de pintado) dan el MISMO valor absoluto
// tanto a los 50ms (transform activo) como 2s después (ya asentado) --
// `getBoundingClientRect()` en cambio difiere exactamente en los 20px del
// transform. Fix: `_evOffsetAbsoluto()` calcula el destino con la cadena
// `offsetTop`/`offsetParent` en vez de `getBoundingClientRect()`, y el
// scroll se dispara a mano con `window.scrollTo()` en vez de
// `scrollIntoView()` (que solo sabe alinear contra la posición renderizada
// actual). Mismo criterio ya aplicado en otros bugs de este archivo con
// `.pantalla.activa`: no confiar en medidas tomadas mientras esa animación
// sigue corriendo. Verificado con Playwright: separador -HOY- alineado
// exactamente contra el borde inferior de la cabecera (0px de solape) tanto
// en el salto automático de `irEventos()` como en un salto manual
// posterior (`_evIrAHoy()`), con historial real de varios meses antes y
// después de hoy (con poco contenido a los lados no hay margen para que el
// bug se note, por eso pasaba desapercibido con los datos de prueba
// originales, muy acotados).
function _evOffsetAbsoluto(el) {
  var top = 0;
  while (el) { top += el.offsetTop; el = el.offsetParent; }
  return top;
}
function _evScrollAFecha(iso, instant, forzar) {
  var el = document.getElementById('ev-fecha-' + iso) || _evFechaGrupoMasCercano(iso);
  if (!el) return;
  // Generaliza el separador -HOY- a los 3 restantes (MAÑANA/ESTA SEMANA/
  // PRÓXIMA SEMANA) -- ver el comentario largo más arriba. `previousElementSibling`
  // (no texto/whitespace) es el propio `.ev-hoy-separador` cuando `el` lo
  // tiene pegado justo arriba en el HTML generado por `_evRenderTimeline()`;
  // para cualquier grupo sin separador propio (ej. un día más de la misma
  // semana ya cubierta por uno anterior) cae en `null`/otro elemento y no
  // matchea `.ev-hoy-separador`, sin cambiar nada.
  var separador = el.previousElementSibling;
  if (separador && separador.classList.contains('ev-hoy-separador')) el = separador;
  var margenSup = _evAlturaStickyHeader();
  document.documentElement.style.setProperty('--ev-sticky-h', margenSup + 'px');
  var absTop = _evOffsetAbsoluto(el);
  var destino = Math.max(0, absTop - margenSup);
  if (!forzar) {
    var margenInf = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-h')) || 60;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var yaVisible = window.scrollY <= destino && window.scrollY >= (absTop + el.offsetHeight - vh + margenInf);
    if (yaVisible) return;
  }
  window.scrollTo({ top: destino, behavior: instant ? 'auto' : 'smooth' });
}
function _evFechaGrupoMasCercano(iso) {
  var grupos = document.querySelectorAll('.ev-fecha-grupo');
  var mejor = null, mejorDiff = Infinity;
  grupos.forEach(function(g) {
    var diff = Math.abs(_evFechaCmp(g.getAttribute('data-iso'), iso));
    if (diff < mejorDiff) { mejorDiff = diff; mejor = g; }
  });
  return mejor;
}
// Puente entre "el calendario saltó a este mes" (swipe/pill/hoy) y el
// timeline -- TODO el cuerpo vive dentro de un único `_evFadeSwap()` (ver
// "Cambios recientes" -- antes el caso más común, mes ya presente en el DOM
// sin necesidad de re-pintar nada, no tenía ningún fade: era un salto mudo,
// más notorio todavía al saltar a un mes con menos contenido que el
// anterior). El fade es siempre de CONTENIDO -- no depende de si el mes
// nuevo es más largo/corto que el anterior, ni de si técnicamente hace
// falta re-pintar algo; se dispara igual aunque el único cambio real sea la
// posición de scroll. Si el mes de `iso` no tiene NINGÚN evento/cumpleaños
// propio, `_evScrollAFecha()` caería al grupo real más cercano en OTRO mes
// sin ninguna explicación visible, así que acá se corta antes: se reemplaza
// el timeline por el mismo aviso vacío que ya usa el resto de la app
// (`.ev-lista-vacia`) en vez de scrollear a contenido ajeno. Si el mes SÍ
// tiene contenido pero el timeline está mostrando ese aviso de una
// navegación previa, se re-pinta completo antes de scrollear (chequeo
// barato: 0 `.ev-fecha-grupo` en el DOM = timeline no está en su estado
// normal) -- ese re-pintado interno va `instant` (`true`) a propósito: ya
// corre agazapado dentro de la ventana de opacidad-0 del fade exterior, un
// segundo fade anidado ahí adentro solo duplicaría el delay sin ningún
// beneficio visual.
// `forzarHayContenido` (ver "Cambios recientes" -- bug real, `_evIrAHoy()`):
// el chequeo de "mes sin contenido propio -> reemplazar timeline por aviso
// vacío" tiene sentido para saltos explícitos de MES (swipe/pill, donde
// perderse en un mes ajeno sin avisar sería peor), pero "ir a hoy" NUNCA
// debería poder vaciar el timeline -- "hoy" puede caer en un mes sin ningún
// evento/cumpleaños propio mientras otros meses sí tienen contenido, y aun
// así el usuario espera caer en el día real más cercano con contenido
// (`_evFechaGrupoMasCercano()`, lo que ya hace `_evScrollAFecha()` en
// cualquier otro caso), no en un cartel de "no hay eventos". `_evIrAHoy()`
// pasa `true` acá para saltear el chequeo sin duplicar el resto de esta
// función (fade + re-pintado de recuperación si hace falta).
function _evCalIrAFechaEnTimeline(iso, instant, forzarHayContenido, forzarScroll) {
  var m = _evCalMesDe(iso);
  var hayContenido = forzarHayContenido || _evTimelineItems().some(function(it) {
    var d = _evParseISO(it.fecha);
    return d.getFullYear() === m.year && d.getMonth() === m.month;
  });
  var cont = document.getElementById('ev-timeline');
  if (!cont) return;
  _evFadeSwap(cont, function() {
    if (!hayContenido) {
      cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay eventos este mes.</div>';
      return;
    }
    if (!cont.querySelector('.ev-fecha-grupo')) {
      _evRenderTimeline(true, function() { _evScrollAFecha(iso, instant, forzarScroll); });
    } else {
      _evScrollAFecha(iso, instant, forzarScroll);
    }
  }, false, _EV_TIMELINE_FADE_MS);
}

// Pill de estado (Cancelado/No se entrena, ver "Cambios recientes") -- ancho
// completo, ícono de warning (Material Symbols) a la izquierda del texto,
// mismo tono rojo de advertencia que el resto de la app (--danger/--danger-bg/
// --danger-bdr, `.ev-estado-pill-danger` en css/eventos.css -- ver "Cambios
// recientes": `.ev-estado-pill` pasó a ser solo la geometría COMPARTIDA
// -tamaño/padding/layout- con `_evAsistenciaRealHtml()` de más abajo, que
// reusa esta misma base con sus propios modificadores de color/ícono para
// "Llegué a horario"/"Llegué tarde"). UN SOLO componente de geometría
// reusado tal cual en la card (_evCardEventoHtml(), de abajo) y en el
// detalle (_evDetalleEstadoNotaHtml(), más abajo en este archivo) -- no 2
// implementaciones paralelas.
// "Evento Cancelado" (en vez del `estado` corto "Cancelado" que ya usa
// `_evNormalizarEstadoEvento()` para comparar internamente, ver más arriba)
// -- ver MANIFEST.md "Cambios recientes": pedido explícito para el botón no
// clickeable que reemplaza las acciones de RSVP/asistencia una vez que un
// admin cancela el evento (`_evCancelarEvento()`) -- debe quedar claro que
// nadie debe ir ni marcar asistencia, "Cancelado" a secas es ambiguo fuera
// de contexto (¿cancelé yo mi asistencia, o canceló el evento?). "No se
// entrena" no tiene esa ambigüedad, queda sin cambios.
function _evEstadoNotaPillHtml(estado) {
  var texto = estado === 'Cancelado' ? 'Evento Cancelado' : estado;
  return '<div class="ev-estado-pill ev-estado-pill-danger"><span class="material-symbols-outlined">warning</span>' + texto + '</div>';
}
/* ── Card de evento — vista previa simplificada (Semana/Calendario/Lista,
   ver "Cambios recientes": se saca la fila de avatares y "Más información"
   de acá, ahora viven en la pantalla de detalle de pantalla completa,
   abrirEvDetalle()). Ícono+lugar+hora+acción; TODA la card es tocable y
   navega al detalle -- `sufijo` namespacea el id cuando la misma card se
   re-renderiza en más de un contenedor a la vez (lista de Eventos vs. fila
   de la pestaña "Lista"). Ícono de tipo INLINE junto al título (ver
   "Cambios recientes" -- revertido: 2 tandas atrás había pasado a vivir en
   el badge de fecha compartido del timeline, pedido explícito de volver a
   como estaba antes de esta sesión, mismo componente `.ev-card-titulo-row`/
   `.ev-card-icono-inline` que ya usa `_evCardCumpleHtml()`). 4 casos de
   acción, mutuamente excluyentes, TODOS dentro de `.ev-card-body`, a ancho
   completo, apilados debajo de título/hora: admin, pasado (asistencia
   real), cancelado/no-se-entrena (pill de estado, sin cambios) o RSVP --
   la barra segmentada de 3 opciones SIEMPRE visible (`_evRsvpBarraHtml()`,
   ver "Cambios recientes" -- revertido el botón único + panel expandible
   que existía acá: mismo componente que ya usa el detalle, `.ev-rsvp-seg`,
   en vez de mantener 2 implementaciones de RSVP en paralelo). */
function _evCardAniversarioHtml(a) {
  var aniosTexto = a.anios === 1 ? '1 año en el equipo' : a.anios + ' años en el equipo';
  return '<div class="ev-card ev-card-cumple">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo-row">' +
          '<span class="material-symbols-outlined ev-card-icono-inline">celebration</span>' +
          '<span class="ev-card-titulo">Aniversario de entrada al equipo</span>' +
        '</div>' +
        '<div class="ev-card-sub">' + aniosTexto + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ev-confetti-host" id="ev-confetti-' + a.id + '" style="position:absolute;inset:0;pointer-events:none;"></div>' +
  '</div>';
}
// `eventoId` es el id de evento real (`e.id`, `String(idEvento)`) -- mismo
// valor que espera la pre-selección de `cargarFechas()`/`js/reservas.js`
// (`f.fecha` ahí es el id de evento, no una fecha calendario, ver MANIFEST.md
// -- ya verificado y corregido una vez para este mismo 2º parámetro).
// Ya no navega directo a Nueva Reserva -- entra en modo selección múltiple
// sobre el propio timeline (botones "Reservar" de las cards + footer sticky
// #ev-reserva-footer, ver _evToggleSeleccion()/_evActualizarFooterReserva()/
// _evContinuarReserva() más abajo).
function _evReservarClase(eventoId) {
  if (!_evModoReservaActivo) {
    if (_evCargandoDisponibles) return;
    _evCargandoDisponibles = true;
    var _btnEvCargando = document.querySelector('[data-ev-reservar][data-evid="' + eventoId + '"]');
    if (_btnEvCargando) { _btnEvCargando.disabled = true; _btnEvCargando.style.opacity = '0.45'; }
    // Ya no es exclusivo de "equipo propio" (ver MANIFEST.md, eliminación del
    // modo 'equipamiento') -- talla/necesitaProtecciones viajan igual que en
    // cargarFechas() (js/reservas.js:613-619, mismo criterio: talla vacía si
    // la persona no necesita patines) para que el backend chequee stock real
    // también para quien depende de equipo del club.
    var dRes = E.datos || {};
    var tallaRes = (dRes.necesitaPatines && dRes.necesitaPatines.toLowerCase() !== 'no') ? dRes.talla : '';
    apiPost({ action: 'getFechasDisponibles', token: _token, nombre: E.nombre, talla: tallaRes, necesitaProtecciones: dRes.necesitaProtecciones }, function(res) {
      _evCargandoDisponibles = false;
      if (_btnEvCargando) { _btnEvCargando.disabled = false; _btnEvCargando.style.opacity = ''; }
      (res || []).forEach(function(f) {
        _evDisponibles[f.fecha] = f;
        // Mismo formato exacto que cargarFechas() (js/reservas.js:633-639)
        // para _fechaInfoDisponible -- sin esto, continuar_s4()/confirmarReserva()
        // (js/reservas.js) caen a su fallback `_fechaInfoDisponible[f] || f` y
        // muestran el id crudo del evento en vez de una fecha legible (footer,
        // resumen de pago, mensaje de WhatsApp) -- ese fallback nunca se puebla
        // solo, porque esta ruta nueva no pasa por cargarFechas().
        var fechaLegibleEv = (typeof _fechaCalendarioATexto === 'function' ? _fechaCalendarioATexto(f.fechaCalendario) : '') || f.fecha;
        _fechaInfoDisponible[f.fecha] = fechaLegibleEv + (f.horaInicio ? ' - ' + f.horaInicio + 'hs' : '') + (f.donde ? ' - ' + f.donde : '');
      });
      _evConflictosTalla = {};
      (res || []).forEach(function(f) {
        if (!f.disponible && f.razon && /patines|talla|protec|equip/i.test(f.razon)) {
          _evConflictosTalla[f.fecha] = f.razon;
        }
      });
      _evActualizarAdvertenciasTalla();
      _evModoReservaActivo = true;
      // E.precioPorClase ya se carga al iniciar sesión (js/auth.js,
      // getPreciosClases) -- guardia solo por si ese fetch async todavía no
      // resolvió cuando se entra acá, para que el total del footer nunca
      // muestre NaN.
      E.precioPorClase = E.precioPorClase || 0;
      var f = _evDisponibles[eventoId];
      if (!f || f.disponible === false) {
        if (f && f.razon && /patines|talla|protec|equip/i.test(f.razon)) {
          _evModoReservaActivo = false;
          _evAbrirSheetTallaConflicto(eventoId);
        } else {
          mostrarToast((f && f.razon) || 'No disponible', 'error', true);
          _evModoReservaActivo = false;
        }
        return;
      }
      _evToggleSeleccion(eventoId);
    }, function() { _evCargandoDisponibles = false; if (_btnEvCargando) { _btnEvCargando.disabled = false; _btnEvCargando.style.opacity = ''; } mostrarToast('Error de conexión.', 'error', true); });
  } else {
    if (_evConflictosTalla[eventoId] && !_evTallasPorFecha[eventoId]) {
      _evAbrirSheetTallaConflicto(eventoId);
    } else {
      _evToggleSeleccion(eventoId);
    }
  }
}
function _evToggleSeleccion(eventoId) {
  var f = _evDisponibles[eventoId];
  if (!f || f.disponible === false) {
    mostrarToast((f && f.razon) || 'No disponible', 'error', true);
    return;
  }
  if (_evSeleccionados.has(eventoId)) { _evSeleccionados.delete(eventoId); }
  else { _evSeleccionados.add(eventoId); }
  _evActualizarBotonesReserva();
  _evActualizarFooterReserva();
}
function _evActualizarBotonesReserva() {
  document.querySelectorAll('[data-ev-reservar]').forEach(function(btn) {
    var evid = btn.getAttribute('data-evid');
    if (_evSeleccionados.has(evid)) { btn.classList.add('ev-card-btn-reservar--sel'); }
    else { btn.classList.remove('ev-card-btn-reservar--sel'); }
  });
}
// Disclaimer inline en la card cuando la talla/protecciones de la persona no
// están disponibles para esa fecha puntual (ver "Cambios recientes") --
// `_evConflictosTalla` ya viene poblado por _evReservarClase() con la razón
// real que mandó el backend para cada fecha en conflicto.
function _evActualizarAdvertenciasTalla() {
  Object.keys(_evConflictosTalla).forEach(function(evId) {
    var div = document.getElementById('ev-talla-conflicto-' + evId);
    if (!div) return;
    var razon = _evConflictosTalla[evId] || '';
    var msg = /protec/i.test(razon)
      ? 'Las protecciones no están disponibles para este entrenamiento'
      : 'La talla que usas no está disponible para este entrenamiento';
    div.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;color:var(--warning);margin-right:4px;">warning</span><span style="font-size:0.76rem;color:var(--warning);font-weight:600;">' + msg + '</span>';
    div.style.display = 'block';
  });
}
// Sheet de talla en modo "resolver conflicto" (ver "Cambios recientes") --
// reusa `#sheet-talla`/`_abrirSheetTallaBase()` (js/home.js), el mismo sheet
// que ya usan `abrirSheetTalla()` (reserva existente) y `_confirmarTallaNuevaReserva()`
// (flujo S1-S4 viejo) -- `_tallaSheetModo = 'ev-nueva-reserva'` (nuevo, junto
// a los 2 existentes 'existente'/'nueva-reserva') identifica esta 3ª rama
// para que `confirmarTallaSheet()` (js/home.js) sepa a cuál de las 3
// funciones de confirmación derivar. Se llama `_abrirSheetTallaBase()`
// directo (no `abrirSheetTalla()`, que pisa `_tallaSheetModo` a 'existente'
// incondicional). El aviso de protecciones se setea DESPUÉS de
// `_abrirSheetTallaBase()`, no antes -- esa función resetea
// `#sheet-talla-aviso-protec` a `display:none` incondicional al abrir
// (mismo reset que hace para cualquier apertura del sheet), así que
// setearlo antes se hubiera pisado solo.
function _evAbrirSheetTallaConflicto(eventoId) {
  _evTallaConflictoEvId = eventoId;
  _tallaSheetModo = 'ev-nueva-reserva';
  var titulo = document.getElementById('sheet-talla-titulo');
  if (titulo) titulo.textContent = 'Elegir talla para este entrenamiento';
  var btn = document.getElementById('btn-confirmar-talla');
  if (btn) btn.textContent = 'Reservar con esta talla';
  _abrirSheetTallaBase(eventoId, (E.datos && E.datos.talla) || '');
  var avisoProtec = document.getElementById('sheet-talla-aviso-protec');
  if (avisoProtec) avisoProtec.style.display = /protec/i.test(_evConflictosTalla[eventoId] || '') ? 'block' : 'none';
}
function _evConfirmarTallaConflicto() {
  var evId = _evTallaConflictoEvId;
  var talla = _tallaSheetSel;
  if (!talla || !evId) { cerrarSheetTalla(); return; }
  _evTallasPorFecha[evId] = talla;
  if (_evDisponibles[evId]) _evDisponibles[evId].disponible = true;
  delete _evConflictosTalla[evId];
  var div = document.getElementById('ev-talla-conflicto-' + evId);
  if (div) div.style.display = 'none';
  cerrarSheetTalla();
  _evModoReservaActivo = true;
  _evToggleSeleccion(evId);
}
function _evActualizarFooterReserva() {
  if (_evSeleccionados.size === 0) { _evSalirModoReserva(); return; }
  // Footer compacto (ver "Cambios recientes" -- se saca el detalle/total,
  // que vivía en #ev-reserva-footer-detalle/-total, ya sin esos elementos en
  // index.html): solo togglea el footer, el monto real se ve en #s-pago
  // (continuar_s4()/_pagoTotalActualizar(), ya poblado con el total real).
  // Fade-in real (ver "Cambios recientes") -- display:block ANTES del
  // cambio de opacity/clase (mismo patrón que abrirSheetTipoPago()/
  // evAbrirAccionCard()/etc.: .bsheet-* parten de display:none por CSS, el
  // transform/opacity no alcanza solo para mostrarlos) + doble
  // requestAnimationFrame para que el navegador pinte el estado opacity:0
  // (recién puesto por el display:block) antes de animar hacia opacity:1 --
  // sin el 2º frame, la transición podría arrancar ya en el valor final,
  // sin animar nada. El guard evita re-disparar el rAF si el footer ya
  // estaba visible (ej. seleccionar una 2ª fecha con el footer ya abierto).
  var footer = document.getElementById('ev-reserva-footer');
  if (footer && !footer.classList.contains('ev-reserva-footer--visible')) {
    footer.style.display = 'block';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { footer.classList.add('ev-reserva-footer--visible'); });
    });
  }
  var _btnCont = document.getElementById('ev-btn-continuar-reserva');
  if (_btnCont) {
    var _nSel = _evSeleccionados.size;
    _btnCont.innerHTML = (_nSel > 1 ? 'Finalizar tus reservas' : 'Finalizar tu reserva') + ' <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">arrow_forward</span>';
  }
}
function _evSalirModoReserva() {
  _evModoReservaActivo = false;
  _evSeleccionados = new Set();
  _evDisponibles = {};
  _evTallasPorFecha = {};
  _evConflictosTalla = {};
  _evActualizarBotonesReserva();
  // Fade-out real -- se saca la clase (arranca la transición de opacity) y
  // recién 220ms después (mismo valor que la transición CSS, criterio ya
  // usado en toda la app para este tipo de cierre -- ver cerrarSheetTipoPago()/
  // cerrarSheetEvAccion()/etc., ninguno usa `transitionend`) se vuelve a
  // poner display:none, para no cortar la animación a la mitad.
  var footer = document.getElementById('ev-reserva-footer');
  if (footer) {
    footer.classList.remove('ev-reserva-footer--visible');
    setTimeout(function() { footer.style.display = 'none'; }, 220);
  }
}
// Cierra continuar_s4() completo (js/reservas.js) en vez de navegar directo
// a 's-pago' -- esa función arma detalleTexto/fechasHtml + llama
// _pagoTotalActualizar()/_resetChkPago() a partir de E antes de navegar,
// además de la rama de total $0 (crédito/cupón) que llama confirmarReserva()
// directo en vez de ir a s-pago. Reimplementar eso acá duplicaría lógica de
// negocio real ya escrita, con riesgo de que las 2 copias diverjan.
function _evContinuarReserva() {
  E.fechas = Array.from(_evSeleccionados);
  E.tipoPago = 'clase';
  E.totalPago = (E.precioPorClase || 0) * _evSeleccionados.size;
  E.cuponAplicado = false;
  E.creditosUsados = 0;
  E.notaPago = '';
  // Marca el origen para que la flecha atrás de #s-pago (TOP_BAR_CONFIG,
  // js/ui.js) y "Volver a Mis Reservas" (irHomeDesdeExito(), js/home.js)
  // vuelvan acá (#s-eventos) en vez de 's4'/'s-home' -- esta ruta nunca pasa
  // por cargarFechas()/#s4, así que 's4' quedaría vacío/sin datos si alguien
  // intentara volver ahí. Reseteado a false en irNuevaReserva() (flujo
  // normal S1-S4) para que no quede pegado entre sesiones.
  E.viaEventosInline = true;
  // Tallas elegidas al resolver un conflicto de stock (ver "Cambios
  // recientes", _evAbrirSheetTallaConflicto()/_evConfirmarTallaConflicto())
  // -- confirmarReserva() (js/reservas.js:~1196) ya lee `E.tallasPorFecha[fecha]
  // || talla` por cada reserva guardada, mismo mecanismo que usa el flujo
  // S1-S4 viejo para "talla distinta por fecha" -- copia superficial
  // (Object.assign a un objeto nuevo) para no compartir referencia con
  // _evTallasPorFecha, que _evSalirModoReserva() limpia unas líneas más
  // abajo.
  E.tallasPorFecha = Object.assign({}, _evTallasPorFecha);
  // Mismo mecanismo que abrirEvDetalle() (más abajo en este archivo) para
  // no perder la posición de scroll del timeline -- `ir()` (js/ui.js) ya
  // tiene el hook genérico que restaura `_evTimelineScrollY` en CUALQUIER
  // entrada a 's-eventos' mientras `_evRestaurarScrollTimeline` esté prendido
  // (botón atrás de #s-pago vía TOP_BAR_CONFIG, o "Volver a Mis Reservas" vía
  // irHomeDesdeExito() -- ambos terminan en ir('s-eventos')) -- alcanza con
  // armar el flag acá una sola vez, antes de navegar lejos de Eventos.
  _evGuardarScrollTimeline();
  _evRestaurarScrollTimeline = true;
  continuar_s4();
  _evSalirModoReserva();
}

function _evCardEventoHtml(e, sufijo) {
  sufijo = sufijo || '';
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var cancelado = (e.estado === 'Cancelado' || e.estado === 'No se entrena');
  var accionBody = '';
  // Bug real corregido (ver "Cambios recientes", confirmado por Victor):
  // antes, `_adminToken` solo con ser truthy ya reemplazaba el RSVP propio
  // por la gestión de asistentes en TODAS las cards de una cuenta admin,
  // sin importar si el evento ya había arrancado -- una cuenta admin nunca
  // podía marcar su PROPIA asistencia. Regla nueva: antes de que el evento
  // arranque (`_evYaEmpezo()`), toda cuenta (admin incluida) ve solo su
  // RSVP, igual que cualquier usuarix; desde que arranca en adelante
  // (evento en curso o ya pasado, sin importar cuánto), admin ve las 2
  // cosas apiladas -- su RSVP/asistencia real (`_evRsvpBarraHtml()`, mismo
  // componente de siempre, ya sabe alternar entre botones y chip real
  // según `_evEsPasado()`) arriba, gestión de asistentes abajo. Cuentas
  // no-admin: sin cambios, `_evRsvpBarraHtml()` sola cubre los 2 casos
  // (RSVP futuro / chip de asistencia real pasado) que antes duplicaba a
  // mano acá.
  if (cancelado) accionBody = _evEstadoNotaPillHtml(e.estado);
  else if (_adminToken && _evYaEmpezo(e)) accionBody = _evRsvpBarraHtml(e) + _evAccionAdminHtml(e);
  else accionBody = _evRsvpBarraHtml(e);

  // Botón "Reservar" (mirlxs -- equipo propio, paga por clase) en cards de
  // Entrenamiento futuras dentro de las próximas 6 -- fuera de esa ventana
  // no se ofrece (evita reservar con demasiada anticipación). `_evFechaCmp()`
  // (no comparación de string `>=`) -- toda comparación de fechas ISO de
  // este archivo pasa por ahí (ver esa función, más arriba: comparar como
  // texto solo da el orden correcto si el ancho/cero-padding es idéntico
  // siempre, no garantizado según el origen del dato). `e.horaInicio` (no
  // `e.inicia`, que no existe en el objeto evento -- ver `_evMapEventoBackend()`,
  // el campo real es `horaInicio`) para el corte de 2hs antes del inicio,
  // hoy mismo.
  // Estado de una reserva ya hecha para este evento (mirlxs -- ver "Cambios
  // recientes"). `_todasReservas` (js/home.js, global, poblado por
  // getReservasPersona) -- `r.fecha` es el id_evento para una reserva de
  // tipo "clase" (mismo campo/valor que `e.id` acá, ya confirmado y usado en
  // el resto de este archivo/`js/reservas.js` para el mismo cruce). Se
  // excluye 'Cancelada' -- una reserva cancelada no debe tapar el botón de
  // volver a reservar. Estados reales de la app: 'Pendiente' (default, sin
  // valor)/'Confirmada'/'Cancelada'/'Reagendar' (ver `_renderCardHome()`,
  // js/home.js -- NO existen 'Aprobada'/'Rechazada' en ningún lado del
  // proyecto, ese vocabulario no es el real).
  var miReserva = null;
  if (_modoUsuario() === 'mirlxs' && e.tipo === 'Entrenamiento') {
    miReserva = (_todasReservas || []).filter(function(r) { return r.fecha === e.id && r.estado !== 'Cancelada'; })[0] || null;
  }
  var mostrarBtnReservar = false;
  var btnReservarDesactivado = false;
  if (_modoUsuario() === 'mirlxs' && e.tipo === 'Entrenamiento' && !miReserva) {
    var hoyISO = _evHoyISO();
    if (_evFechaCmp(e.fecha, hoyISO) >= 0) {
      var proximas6 = (_EV_EVENTOS || []).filter(function(x) {
        return x.tipo === 'Entrenamiento' && _evFechaCmp(x.fecha, hoyISO) >= 0;
      }).sort(function(a, b) { return _evFechaCmp(a.fecha, b.fecha); }).slice(0, 6);
      mostrarBtnReservar = proximas6.some(function(x) { return x.id === e.id; });
      if (mostrarBtnReservar && e.fecha === hoyISO && e.horaInicio) {
        var partes = e.horaInicio.split(':');
        var inicioH = parseInt(partes[0], 10), inicioM = parseInt(partes[1] || '0', 10);
        var ahora = new Date();
        var minHastaInicio = (inicioH * 60 + inicioM) - (ahora.getHours() * 60 + ahora.getMinutes());
        if (minHastaInicio < 120) btnReservarDesactivado = true;
      }
    }
  }
  var btnReservarHtml = mostrarBtnReservar ?
    '<button type="button" class="ev-card-btn-reservar' + (btnReservarDesactivado ? ' ev-card-btn-reservar--off' : '') + '"' +
    ' data-ev-reservar="true" data-evid="' + e.id + '"' +
    ' onclick="event.stopPropagation();' + (btnReservarDesactivado ? 'mostrarToast(\'No se puede reservar para esta clase. Ya se cerraron las reservas.\',\'info\',true)' : '_evReservarClase(\'' + e.id + '\')') + '"' +
    '>Reservar</button>'
    : '';
  // Chip de estado -- mismo componente/labels/colores que ya usa
  // `_renderCardHome()` (js/home.js, `.badge`/`.badge-<estado>`), reusado
  // tal cual (no reinventado) -- `.ev-card-reserva-estado` (nueva,
  // css/eventos.css) en vez de `.rn-status-row` (esa es horizontal, pensada
  // para una fila de card ancha; acá va apilado y alineado a la derecha, en
  // la esquina donde iba el botón "Reservar", reemplazándolo). `stopPropagation()`
  // puesto directo en el onclick del link (no solo en un wrapper) -- sin
  // eso, el click en "¿Qué significa esto?" burbujea al onclick de la card
  // padre (abre el detalle/sheet), que corre DESPUÉS de abrir el modal y lo
  // tapa/cierra de inmediato (la navegación de `ir()` vacía `_overlayStack`).
  // `abrirModalEstados()` (js/home.js) es el modal real "¿Qué significa
  // esto?" del flujo de reservas -- distinto de `abrirModalInfoEstado()`
  // (js/ui.js), que es el modal de la pantalla de confirmación de PAGO (s6),
  // no el de estados de reserva.
  var miReservaChipHtml = '';
  var btnCancelarReagendarHtml = '';
  if (miReserva) {
    var estIcono = miReserva.estado === 'Confirmada' ? 'check_circle' : miReserva.estado === 'Reagendar' ? 'swap_horiz' : 'hourglass_empty';
    var estLabel = miReserva.estado === 'Confirmada' ? 'Reserva confirmada' : miReserva.estado === 'Reagendar' ? 'Clase a favor' : 'Reserva pendiente';
    var estBadgeClase = 'badge-' + (miReserva.estado === 'Confirmada' ? 'confirmada' : miReserva.estado === 'Reagendar' ? 'reagendar' : 'pendiente');
    miReservaChipHtml = '<div class="ev-card-reserva-estado" onclick="event.stopPropagation()">' +
      '<span class="badge ' + estBadgeClase + '"><span class="material-symbols-outlined">' + estIcono + '</span>' + estLabel + '</span>' +
      '<span class="rn-status-info" onclick="event.stopPropagation();abrirModalEstados()">¿Qué significa esto?</span>' +
      '</div>';
    // Botón "Cancelar o re - agendar" -- solo para Pendiente/Confirmada
    // (una reserva 'Reagendar', "clase a favor", ya está cancelada de fondo,
    // sin acción real que ofrecer sobre ESE evento puntual). `_evBtnCancelarReagendarHtml()`
    // (más abajo en este archivo) es la misma que usa el detalle del evento.
    if (miReserva.estado !== 'Reagendar') btnCancelarReagendarHtml = _evBtnCancelarReagendarHtml(e, 'ev-card-btn-cancelar');
  }

  // Botón "Reservar" (equipamiento -- equipo del club) en cards de
  // Entrenamiento futuras dentro de las próximas 6, "zona segura": el botón
  // abre el mismo sheet de acción de siempre (evAbrirAccionCard(), 2
  // opciones: "Ver más información"/"Reservar esta fecha") en vez de
  // requerir tocar la card entera para llegar ahí -- el resto de la card
  // (fuera del botón) pasa a ir directo a abrirEvDetalle(), ver el onclick
  // de la card más abajo. Mismo criterio de "próximas 6" que el botón de
  // mirlxs de arriba, pero gateado a `_modoUsuario() === 'equipamiento'`.
  var mostrarBtnReservarEquip = false;
  if (_modoUsuario() === 'equipamiento' && e.tipo === 'Entrenamiento') {
    var hoyISOEquip = _evHoyISO();
    if (_evFechaCmp(e.fecha, hoyISOEquip) >= 0) {
      var proximas6Equip = (_EV_EVENTOS || []).filter(function(x) {
        return x.tipo === 'Entrenamiento' && _evFechaCmp(x.fecha, hoyISOEquip) >= 0;
      }).sort(function(a, b) { return _evFechaCmp(a.fecha, b.fecha); }).slice(0, 6);
      mostrarBtnReservarEquip = proximas6Equip.some(function(x) { return x.id === e.id; });
    }
  }
  var btnReservarEquipHtml = mostrarBtnReservarEquip ?
    '<button type="button" class="ev-card-btn-reservar" data-ev-reservar="true" data-evid="' + e.id + '"' +
    ' onclick="event.stopPropagation();evAbrirAccionCard(\'' + e.id + '\')">Reservar</button>'
    : '';
  var cardOnclick = mostrarBtnReservarEquip ?
    'abrirEvDetalle(\'' + e.id + '\')' :
    '_evTapCard(\'' + e.id + '\',\'' + e.tipo + '\')';

  return '<div class="ev-card" id="ev-card-' + e.id + sufijo + '" onclick="' + cardOnclick + '">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo-row"><span class="material-symbols-outlined ev-card-icono-inline">' + icono + '</span><div class="ev-card-titulo">' + e.lugar + '</div></div>' +
        '<div class="ev-card-sub"><span class="material-symbols-outlined">schedule</span>' + e.horaInicio + ' · ' + e.tipo + '</div>' +
        accionBody +
      '</div>' +
      btnReservarHtml + miReservaChipHtml + btnReservarEquipHtml +
    '</div>' +
    btnCancelarReagendarHtml +
    '<div class="ev-card-talla-conflicto" id="ev-talla-conflicto-' + e.id + sufijo + '" style="display:none;padding:0 12px 10px;animation:fadeIn 0.3s ease;"></div>' +
  '</div>';
}
// Botón "Cancelar o re - agendar" -- reusa abrirGestionar() (js/home.js,
// el sheet real "Reagendar"/"Cancelar reserva") sobre una reserva de tipo
// "clase" ya existente para este evento puntual. Compartido entre la card
// del timeline y el detalle del evento (ver _evDetalleInfoHtml()) para no
// duplicar el armado/escapado de argumentos en 2 lugares. `fila` (2°
// parámetro de abrirGestionar()) se manda `null` -- confirmado por lectura
// de código que `_sgFilaActual` nunca se lee en ningún lado del archivo, es
// un parámetro vivo solo para el flujo de Home (una card/fila real del DOM
// que acá no existe). `.btn-danger` (css/ui.css, ya existente, rojo real
// vía `--danger`, no hardcodeado) + `.btn` para el tamaño/padding real.
function _evBtnCancelarReagendarHtml(ev, extraClass) {
  var fechaTexto = _evFechaCompleta(ev.fecha);
  var fechaEsc = String(ev.id).replace(/'/g, "\\'");
  var fechaTextoEsc = fechaTexto.replace(/'/g, "\\'");
  var horaEsc = (ev.horaInicio || '').replace(/'/g, "\\'");
  var lugarEsc = (ev.lugar || '').replace(/'/g, "\\'");
  return '<button type="button" class="btn btn-danger' + (extraClass ? ' ' + extraClass : '') + '"' +
    ' onclick="event.stopPropagation();abrirGestionar(\'' + fechaEsc + '\',null,\'' + fechaTextoEsc + '\',\'' + horaEsc + '\',\'' + lugarEsc + '\')">Cancelar o re - agendar</button>';
}

// Hidrata TODOS los avatares-placeholder visibles a la vez (`.avatar-pill`
// con `data-nombre`, insertados vacíos por _evAsistenciaGruposHtml() de la
// pantalla de detalle) -- adminBuscarPersonasParaEvento()/getEventosRango()
// SÍ mandan foto por persona ahora (`fotoPerfil`, columna `Equipo` vía
// `_mapaEquipoPorNombre()`, ver MANIFEST.md), así que esta fila usa el
// `data-foto` real que _evGrupoAsistenciaHtml() ya deja en cada avatar --
// solo cae al fallback de inicial (_avatarSetFotoOInicial(), js/ui.js)
// cuando esa persona no tiene foto cargada en `Equipo`.
function _evHidratarAvatares() {
  document.querySelectorAll('.ev-avatar-stack-item[data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, el.getAttribute('data-foto') || '', el.getAttribute('data-nombre'));
  });
  // Avatar de la card de cumpleaños (ver _evCardCumpleHtml() más abajo) --
  // `data-foto` viene de `c.fotoPerfil`, siempre '' hoy: getCumpleañosRango()
  // no manda esa columna (contrato documentado en MANIFEST.md, solo
  // nombre/fecha/edad) -- cae al mismo fallback de inicial que la fila de
  // arriba. Si Victor suma esa columna al backend real más adelante,
  // alcanza con que _evMapCumpleBackend() la pase -- esta función ya sabe
  // usarla tal cual (mismo criterio que E.datos.fotoPerfil en el resto de
  // la app, js/perfil.js/js/home.js).
  document.querySelectorAll('.ev-card-cumple-avatar[data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, el.getAttribute('data-foto') || '', el.getAttribute('data-nombre'));
  });
}

/* ── Datos derivados para la pantalla de detalle (ver "Cambios recientes")
   -- mapsUrl/descripción siguen derivados por lugar/tipo genérico
   (`_EV_MAPS_URL_POR_LUGAR`/`_EV_DESCRIPCION_POR_TIPO`, más arriba): Venues
   (getVenues(), MANIFEST.md) traería mapsUrl real por lugar, pero esa acción
   todavía no está desplegada en el backend real (confirmado en esta sesión)
   y es admin-only para colmo (adminToken) -- sin una acción pública de
   Venues, un usuario normal no tiene de dónde traer esos 2 datos por evento
   todavía. Sin cambios acá, queda pendiente. */
// Hora de fin -- getEventosRango() SÍ manda un horaFin real por evento
// (`e.horaFinReal`, ya adaptado por _evMapEventoBackend()) -- se usa tal
// cual cuando está presente. El cálculo derivado por tipo
// (`_EV_DURACION_MIN_POR_TIPO`) queda como fallback para cuando no venga
// (valor vacío en la hoja) en vez de mostrar un vacío en la pill "Fin".
// `_evDuracionTexto()` (texto "Xh Ymin" independiente, ver "Cambios
// recientes") se eliminó al sacar la pill de Duración del detalle -- código
// muerto sin más consumidores, no quedó nada que la usara.
function _evHoraFin(e) {
  if (e.horaFinReal) return e.horaFinReal;
  var min = _EV_DURACION_MIN_POR_TIPO[e.tipo] || 90;
  var p = (e.horaInicio || '00:00').split(':');
  var d = new Date(2000, 0, 1, +p[0], +p[1]);
  d.setMinutes(d.getMinutes() + min);
  return _evPad(d.getHours()) + ':' + _evPad(d.getMinutes());
}
// Fecha completa (a diferencia del badge Día+número del timeline, sin
// atajos Hoy/Mañana/Ayer -- el detalle siempre muestra la fecha real completa).
function _evFechaCompleta(iso) {
  var d = _evParseISO(iso);
  return _EV_DIAS_LARGOS[d.getDay()] + ' ' + d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()].toLowerCase();
}

/* ── Desglose de asistencia (4 grupos, ver "Cambios recientes" -- antes
   modal, ahora una sección más de la pantalla de detalle). Orden fijo:
   Asisten/No asisten/No jugador/Sin respuesta -- "Sin respuesta" (solo
   admin, ver _evRenderDetalleAsistencia() más abajo) son miembros del
   roster real (adminBuscarPersonasParaEvento()) sin ninguna entrada en
   e.rsvps para este evento en particular. */
var _EV_GRUPOS_ASISTENCIA = [
  { estado: 'Asistiré', key: 'Asistiré', label: 'Asisten', clase: 'ev-stat-asisten' },
  { estado: 'No asistiré', key: 'No asistiré', label: 'No asisten', clase: 'ev-stat-no-asisten' },
  { estado: 'No jugador', key: 'No jugador', label: 'No jugador', clase: 'ev-stat-no-jugador' }
];
var _EV_GRUPO_SIN_RESPONDER = { key: 'SinRespuesta', label: 'Sin respuesta', clase: 'ev-stat-sin-respuesta' };
// Grupos de la asistencia REAL (rollcall, E/F) -- usados en el detalle en
// vez de `_EV_GRUPOS_ASISTENCIA` (RSVP) desde que el evento arranca para
// admin (ver _evRenderDetalleAsistencia() más abajo, "regla de tiempo, no
// solo de rol/fecha calendario", mismo criterio ya usado por
// `_evCardEventoHtml()`/`_evYaEmpezo()`). Reusa los mismos tokens de color
// que ya usa `_EV_ASISTENCIA_REAL_PILL_CLASE` (success/warning) vía las
// clases `ev-stat-*` ya existentes -- ninguna clase CSS nueva. Ya NO incluye
// "Ausente" (ver "Cambios recientes" -- ese grupo se dejó de calcular/
// mostrar del todo: el 3er lugar de la fila de 3 estadísticas ahora es el
// botón "Marcar asistencia", ver _evStatCardMarcarAsistenciaHtml()).
var _EV_GRUPOS_ASISTENCIA_REAL = [
  { estado: 'A tiempo', key: 'A tiempo', label: 'A horario', clase: 'ev-stat-asisten' },
  { estado: 'Tarde', key: 'Tarde', label: 'Tarde', clase: 'ev-stat-no-jugador' }
];
// `grupoKey` marca el grupo (`data-grupo`) para que _evFiltrarAsistenciaPorGrupo()
// pueda mostrar/ocultar este bloque sin reconstruir toda la lista. Cada fila
// lleva además un modificador de color por estado (ver "Cambios recientes"
// -- rediseño de filas: avatar más grande, tinte sólido sutil de fondo según
// el grupo, mismos 4 colores fijos que ya usan las tarjetas de estadística
// -- `g.clase` ya es `ev-stat-<estado>`, se reusa el sufijo tal cual para
// `ev-asist-persona-<estado>`, ver css/eventos.css). `p.sufijoRol` (opcional,
// ver `_evRenderDetalleAsistenciaReal()`) agrega el rol combinado (" · No
// jugador") SOLO al texto visible -- `data-nombre` del avatar se arma con
// `p.nombre` a secas (nunca `nombreDerby`, para no romper el fallback de
// inicial de `_evHidratarAvatares()` con un nombre distinto al real);
// `data-foto` (`p.fotoPerfil`, ver `_mapaEquipoPorNombre()`/MANIFEST.md)
// la hidrata esa misma función en vez de caer siempre al inicial. El texto
// visible sí prioriza `p.nombreDerby` sobre `p.nombre` cuando existe.
// `conToggle`/`idEvento` (ver "Cambios recientes" -- punto 3 del pedido de
// Victor): solo lo pasa `_evActualizarStatsAsistenciaReal()` (asistencia
// REAL, admin) -- las listas de RSVP (`_evRenderDetalleAsistencia()`, arriba
// en el archivo) nunca los pasan, quedan de solo lectura como siempre (no
// tiene sentido "marcar asistencia" antes de que el evento arranque). Cada
// fila con toggle reusa LITERAL el mismo componente `.ev-rsvp-seg-roster`
// que ya usa el roster completo de la subpantalla "Marcar asistencia" --
// `p.estado` ya viene resuelto por el grupo al que pertenece esta persona
// (A horario/Tarde), así que la opción activa sale directo de ahí, sin
// recalcular nada. Toca `_evMarcarAsistenciaAdmin()`, la MISMA función ya
// usada por el roster de la subpantalla -- sin ninguna acción nueva.
function _evGrupoAsistenciaHtml(label, personas, grupoKey, clase, conToggle, idEvento) {
  if (!personas.length) return '';
  var claseFila = 'ev-asist-persona-' + clase.replace('ev-stat-', '');
  var filas = personas.map(function(p) {
    var fotoAttr = (p.fotoPerfil || '').replace(/"/g, '&quot;');
    var toggleHtml = '';
    if (conToggle) {
      var nombreAttr = String(p.nombre).replace(/'/g, "\\'");
      var opts = ['A tiempo', 'Tarde'].map(function(estado) {
        var act = p.estado === estado ? ' activa' : '';
        return '<div class="ev-rsvp-opt' + act + '" data-estado="' + estado + '" onclick="event.stopPropagation();_evMarcarAsistenciaAdmin(\'' + idEvento + '\',\'' + nombreAttr + '\',\'' + estado + '\',this)"><span class="material-symbols-outlined">' + _EV_ASISTENCIA_REAL_PILL_ICONO[estado] + '</span>' + _EV_ROLLCALL_LABEL_CORTO[estado] + '</div>';
      }).join('');
      toggleHtml = '<div class="ev-rsvp-seg ev-rsvp-seg-roster" onclick="event.stopPropagation()"><div class="ev-rsvp-slider"></div>' + opts + '</div>';
    }
    return '<div class="ev-asist-persona ' + claseFila + '"><div class="avatar-pill avatar-pill--sm ev-avatar-stack-item" data-nombre="' + p.nombre.replace(/"/g, '&quot;') + '" data-foto="' + fotoAttr + '"></div><span class="ev-asist-persona-nombre">' + (p.nombreDerby || p.nombre) + (p.sufijoRol || '') + '</span>' + toggleHtml + '</div>';
  }).join('');
  return '<div class="ev-asist-grupo" data-grupo="' + grupoKey + '"><div class="ev-asist-grupo-titulo">' + label + ' (' + personas.length + ')</div>' + filas + '</div>';
}

/* ── Variante usuario: "¿Asistiré?" → barra segmentada única, las 3
   opciones siempre visibles, la que coincide con e.miEstado queda resaltada
   (.activa, indicador de fondo ATENUADO + texto/ícono saturado, ver
   "Cambios recientes" -- _EV_RSVP_BG/.ev-rsvp-opt.activa[data-estado]).
   Tocar
   cualquiera marca directo, sin estado colapsado ni paso intermedio (antes:
   chip + "Cambiar" abría estas mismas 3 opciones aparte). Un único tamaño --
   la variante `compacta` (pensada para una fila resumida de "Ver todos") se
   sacó al rediseñar la card: ver "Cambios recientes", ahora TODAS las vistas
   (Semana/Calendario/Lista) reusan la card completa (_evCardEventoHtml()),
   sin una fila resumida aparte que necesitara su propio tamaño chico. ──── */
var _EV_RESP_OPCIONES = ['Asistiré', 'No asistiré', 'No jugador'];
// Evento pasado (fecha < hoy, o Estado = Finalizado aunque la fecha por algún
// motivo no lo refleje todavía) -- ver "Cambios recientes": ya no tiene
// sentido un RSVP editable para algo que ya ocurrió, se reemplaza por la
// asistencia REAL tomada por el admin (`miAsistenciaReal`, viene de si el
// nombre de la persona logueada aparece en Asistencias!A horario/Tarde del
// backend, origen:'Admin' -- Tanda 3). Cancelado/No se entrena no muestran
// nada acá en ningún caso (nunca hubo/habrá asistencia que registrar).
function _evEsPasado(e) { return _evFechaCmp(e.fecha, _evHoyISO()) < 0 || e.estado === 'Finalizado'; }
// Distinto de _evEsPasado() (que es por FECHA, día completo) -- esta
// compara fecha+horaInicio real contra el instante actual, para saber si
// el evento YA ARRANCÓ (aunque siga siendo "hoy", no pasado por fecha
// todavía). Usada solo por la variante admin de la card (ver
// _evCardEventoHtml() -- "Cambios recientes", fix del bug real "Agregar
// personas en vez de selector RSVP") para decidir cuándo sumar la gestión
// de asistentes ADEMÁS del RSVP propio, no para reemplazar ninguna otra
// comparación de fecha ya existente en el archivo.
function _evYaEmpezo(e) {
  var p = (e.horaInicio || '00:00').split(':');
  var inicio = _evParseISO(e.fecha);
  inicio.setHours(+p[0], +p[1], 0, 0);
  return new Date() >= inicio;
}
function _evAsistenciaRealHtml(e) {
  var estadoReal = e.miAsistenciaReal || 'Sin registrar';
  // Puntualidad (miAsistenciaReal, E/F) + rol (miEstado, el RSVP propio ya
  // cargado con el evento) combinados -- ver _evLabelPuntualidadRol().
  var label = _evLabelPuntualidadRol(_EV_ASISTENCIA_REAL_LABEL[estadoReal] || estadoReal, e.miEstado);
  var pillClase = _EV_ASISTENCIA_REAL_PILL_CLASE[estadoReal];
  if (pillClase) {
    return '<div class="ev-estado-pill ' + pillClase + '"><span class="material-symbols-outlined">' + _EV_ASISTENCIA_REAL_PILL_ICONO[estadoReal] + '</span>' + label + '</div>';
  }
  var clase = _EV_ASISTENCIA_REAL_BADGE[estadoReal] || 'badge-sin-registrar';
  return '<div class="ev-asistire-wrap"><span class="badge ev-rsvp-readonly ' + clase + '">' + label + '</span></div>';
}
// Un usuario que necesita equipamiento del club (patines o protecciones)
// marca su asistencia a un Entrenamiento INDIRECTAMENTE al hacer una reserva
// (que le asigna el equipo) -- no debe poder marcarla a mano acá, quedaría
// una segunda fuente de verdad desincronizada de la reserva real. Con
// equipo PROPIO, su asistencia no depende de ninguna reserva -- selector
// normal, sin cambios. Cualquier otro tipo de evento (Torneo/Asamblea/etc.)
// tampoco depende de una reserva -- selector normal para todos, sin
// importar equipamiento. Comparación exacta a 'Sí' (no la variante
// case-insensitive/más laxa de `canPayMonthly()`, js/reservas.js) -- mismo
// criterio que `_irTabAterrizajeInicial()` (js/auth.js) cuando el pedido
// especifica la comparación exacta, como acá. Un solo punto de verdad,
// reusado en `_evRsvpBarraHtml()` (card) y `_evRenderDetalle()` (detalle) --
// ver el comentario de esta última para por qué no alcanza con que
// `_evRsvpBarraHtml()` sola devuelva `''`.
function _evTapCard(eventoId, eventoTipo) {
  if (_modoUsuario() === 'equipamiento' && eventoTipo === 'Entrenamiento') {
    evAbrirAccionCard(eventoId);
  } else {
    abrirEvDetalle(eventoId);
  }
}
var _evAccionCardCtx = null;
function evAbrirAccionCard(eventoId) {
  var e = _EV_EVENTOS.filter(function(x) { return x.id === eventoId; })[0];
  if (!e) { abrirEvDetalle(eventoId); return; }
  _evAccionCardCtx = e;
  var titulo = document.getElementById('sheet-ev-accion-titulo');
  if (titulo) titulo.textContent = (e.tipo || 'Evento') + ' — ' + _evFechaCompleta(e.fecha);
  var ov = document.getElementById('sheet-ev-accion-overlay');
  var sh = document.getElementById('sheet-ev-accion');
  if (!ov || !sh) { abrirEvDetalle(eventoId); return; }
  ov.style.display = 'block'; sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(cerrarSheetEvAccion);
}
function cerrarSheetEvAccion(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('sheet-ev-accion');
  var ov = document.getElementById('sheet-ev-accion-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() {
    if (sh) sh.style.display = 'none';
    if (ov) ov.style.display = 'none';
  }, 350);
}
function cerrarSheetEvAccionEIrDetalle() {
  // Bug real corregido: `cerrarSheetEvAccion(true)` cierra visualmente pero
  // salta la rama `history.back()` de esa función -- la entrada de historial
  // que `_registrarOverlayAbierto()` empujó al abrir el sheet queda huérfana
  // (sin `.pantalla` asociada), y `ir()` (llamado 360ms después por
  // abrirEvDetalle()) solo vacía `_overlayStack` en JS, no el historial del
  // navegador. Resultado: 1 solo "atrás" después de este flujo saltaba a
  // s-home/s1 en vez de volver a s-eventos. Fix: sin argumento (como
  // `cerrarSheetEquipHome()` en `irTallaDesdeHomeEquip()`/js/home.js, mismo
  // patrón ya usado y correcto), pasa por `history.back()` de verdad -- el
  // popstate resultante consume esa entrada y hace el cierre visual real vía
  // `_overlayStack`, todo antes de que el `setTimeout` de abajo navegue.
  cerrarSheetEvAccion();
  if (_evAccionCardCtx) setTimeout(function() { abrirEvDetalle(_evAccionCardCtx.id); }, 360);
}
function cerrarSheetEvAccionEIrReserva() {
  var ctx = _evAccionCardCtx;
  // Mismo bug/fix que cerrarSheetEvAccionEIrDetalle() de arriba.
  cerrarSheetEvAccion();
  if (ctx) setTimeout(function() { irNuevaReserva(false, ctx.id); }, 360);
}
function evAbrirEquipamiento() {
  // Abre el mismo bottom sheet de equipamiento que usa Reservas
  if (typeof abrirSheetEquipHome === 'function') abrirSheetEquipHome();
}
function _evOcultarRsvpPorEquipoClub(e) {
  return e.tipo === 'Entrenamiento' && !!E.datos &&
    (E.datos.necesitaPatines === 'Sí' || E.datos.necesitaProtecciones === 'Sí');
}
// Modelo real (ver MANIFEST.md "Cambios recientes" -- ya NO existe un 3er
// modo 'equipamiento'): mirlxs incluye cuentas con y sin equipo propio,
// distinguidas por necesitaPatines/necesitaProtecciones donde haga falta
// (ver _evOcultarRsvpPorEquipoClub(), que sigue leyendo esos 2 campos
// directo, sin pasar por acá) -- categoria es lo único que separa quindes.
function _modoUsuario() {
  var d = E.datos;
  if (d && d.categoria === 'Quindes') return 'quindes';
  return 'mirlxs';
}
// Equipo del club (no propio) -- mismo campo/criterio guardado (case-
// insensitive) que ya usa el resto de la app para esta misma distinción
// (cargarFechas()/confirmarReserva(), js/reservas.js: `d.necesitaPatines &&
// d.necesitaPatines.toLowerCase() !== 'no'`) en vez de la comparación
// estricta `!== 'No'` -- evita un falso "necesita equipo" si el dato
// llegara en otra capitalización.
function _evNecesitaEquipo() {
  return !!(E.datos && E.datos.necesitaPatines && E.datos.necesitaPatines.toLowerCase() !== 'no');
}

function _evActualizarTopBarModo() {
  var modo = _modoUsuario();
  var btnPatin = document.getElementById('ev-btn-patin');
  var btnAnticipada = document.getElementById('ev-btn-anticipada');
  // Bug real corregido (ver "Cambios recientes"): comparaban contra
  // `modo === 'equipamiento'`, un valor que `_modoUsuario()` ya no devuelve
  // desde el refactor que lo redujo a mirlxs/quindes -- #ev-btn-patin
  // quedaba oculto para TODA cuenta, sin importar si dependía de equipo del
  // club. `_evNecesitaEquipo()` (junto a `_modoUsuario()`, más arriba) es
  // el reemplazo real -- lee `necesitaPatines` directo, independiente de la
  // categoría mirlxs/quindes.
  var necesitaEquipo = _evNecesitaEquipo();
  if (btnPatin) btnPatin.style.display = necesitaEquipo ? '' : 'none';
  if (btnAnticipada) btnAnticipada.style.display = necesitaEquipo ? 'none' : '';
  // Hallazgo relacionado, no pedido explícito pero mismo bug de fondo:
  // _evPillsInit() (más abajo, listas['equipamiento'] YA existe con los
  // tips correctos -- ícono de patín, reagendar/cancelar) recibía siempre
  // `modo` ('mirlxs'/'quindes'), nunca 'equipamiento' -- una cuenta con
  // equipo del club veía las sugerencias de mirlxs (mencionan "asistencia
  // anticipada", el ícono que este mismo fix oculta para ellas 2 líneas
  // arriba). Se pasa la lista correcta sin tocar `modo` en sí (sigue
  // resolviendo mirlxs/quindes para todo lo demás de esta función).
  _evPillsInit(necesitaEquipo ? 'equipamiento' : modo);
  var fabRes = document.getElementById('ev-fab-reserva');
  if (fabRes) {
    var esAdmin = typeof _adminToken !== 'undefined' && !!_adminToken;
    // Ya no "modo !== 'equipamiento'" (ver MANIFEST.md, eliminación de ese
    // modo) -- mirlxs tiene el botón "Reservar" inline en cada card
    // (_evReservarClase()), este FAB quedaría duplicado/redundante para
    // ellxs. Exclusivo de quindes, que no tienen ese botón en la card.
    fabRes.style.display = (modo === 'quindes' && !esAdmin) ? 'flex' : 'none';
  }
}

var _evPillsTimer = null;
function _evPillsInit(modo) {
  if (localStorage.getItem('ev_pills_ocultos') === '1') return;
  var listas = {
    equipamiento: [
      'Selecciona una fecha para hacer una reserva',
      'Cambia tu equipamiento desde el ícono de patín',
      'Re Agenda o cancela cuando quieras entrando a un evento reservado',
      'Busca fechas y eventos desde el buscador',
      'Selecciona el mes en la esquina superior para ver la vista calendario'
    ],
    mirlxs: [
      'Para registrar una reserva mensual o por clase selecciona el ícono de +',
      'Anticipa tu asistencia desde el ícono de asistencia anticipada',
      'Toca un evento para ver más información',
      'Busca fechas y eventos desde el buscador',
      'Selecciona el mes en la esquina superior para ver la vista calendario'
    ],
    quindes: [
      'Para registrar una reserva mensual selecciona el ícono de +',
      'Anticipa tu asistencia desde el ícono de asistencia anticipada',
      'Toca un evento para ver más información',
      'Busca fechas y eventos desde el buscador',
      'Selecciona el mes en la esquina superior para ver la vista calendario'
    ]
  };
  var msgs = listas[modo] || listas.mirlxs;
  var idx = 0;
  var banner = document.getElementById('ev-pill-banner');
  var texto = document.getElementById('ev-pill-texto');
  var cerrar = document.getElementById('ev-pill-cerrar');
  if (!banner || !texto) return;
  banner.style.display = 'flex';
  if (cerrar) cerrar.style.display = '';
  texto.textContent = msgs[0];
  if (_evPillsTimer) clearInterval(_evPillsTimer);
  _evPillsTimer = setInterval(function() {
    banner.classList.add('ev-pill-fade');
    setTimeout(function() {
      idx = (idx + 1) % msgs.length;
      texto.textContent = msgs[idx];
      banner.classList.remove('ev-pill-fade');
    }, 400);
  }, 10000);
}

function _evPillsCerrar() {
  var modal = document.getElementById('modal-deshabilitar-pills');
  if (modal) { modal.style.display = 'flex'; return; }
  if (confirm('¿Deseas deshabilitar las sugerencias?')) {
    localStorage.setItem('ev_pills_ocultos', '1');
    var banner = document.getElementById('ev-pill-banner');
    if (banner) banner.style.display = 'none';
    if (_evPillsTimer) { clearInterval(_evPillsTimer); _evPillsTimer = null; }
  }
}
function evAbrirSheetTipoPago() {
  var modo = _modoUsuario();
  if (modo === 'quindes') { irNuevaReservaConTipo('mensual'); return; }
  var cont = document.getElementById('ev-tipo-pago-opciones');
  if (cont) {
    cont.innerHTML =
      '<div class="ev-tipo-pago-opcion" onclick="irNuevaReservaConTipo(\'clase\')">' +
        '<span class="material-symbols-outlined ev-tipo-pago-opcion-icono">confirmation_number</span>' +
        '<div class="ev-tipo-pago-opcion-texto">' +
          '<span class="ev-tipo-pago-opcion-titulo">Por clase</span>' +
          '<span class="ev-tipo-pago-opcion-desc">Reservá clases individuales según disponibilidad</span>' +
        '</div>' +
      '</div>' +
      '<div class="ev-tipo-pago-opcion" onclick="irNuevaReservaConTipo(\'mensual\')">' +
        '<span class="material-symbols-outlined ev-tipo-pago-opcion-icono">calendar_month</span>' +
        '<div class="ev-tipo-pago-opcion-texto">' +
          '<span class="ev-tipo-pago-opcion-titulo">Mensual</span>' +
          '<span class="ev-tipo-pago-opcion-desc">Pago único por el mes — acceso a todas las clases</span>' +
        '</div>' +
        '<span class="ev-tipo-pago-badge">Más económico</span>' +
      '</div>';
  }
  var sh = document.getElementById('sheet-ev-tipo-pago');
  var ov = document.getElementById('sheet-ev-tipo-pago-overlay');
  if (!sh || !ov) return;
  // Mismo patrón de apertura que abrirSheetEquipHome()/evAbrirAccionCard():
  // display:block ANTES del transform, y el cambio real de transform recién
  // en el 2do rAF -- necesario para que el navegador pinte el estado cerrado
  // (translateY(100%), inline en el HTML) antes de animar hacia abierto; sin
  // el display:block acá, .bsheet/.bsheet-overlay quedan en su display:none
  // de base (css/global.css) sin importar qué transform/opacity se les
  // setee, el sheet nunca llega a verse.
  ov.style.display = 'block'; sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() {
    sh.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
    sh.style.transform = 'translateY(0)';
    ov.style.opacity = '1';
  }); });
  _registrarOverlayAbierto(function() { cerrarSheetTipoPago(true); });
}
function cerrarSheetTipoPago(porGesto) {
  // Mismo contrato que cerrarSheetEquipHome()/cerrarSheetEvAccion(): sin
  // porGesto (tap en "Cancelar"/overlay), delega en history.back() -- el
  // popstate/_overlayStack (js/ui.js) vuelve a llamar acá con porGesto=true,
  // que es la única rama que hace el cierre visual real. Sin esta guardia,
  // un cierre por tap deja la entrada de historial de _registrarOverlayAbierto()
  // sin consumir -- el próximo gesto de "atrás" real quedaría absorbido por
  // ese entry viejo en vez de navegar de verdad.
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('sheet-ev-tipo-pago');
  var ov = document.getElementById('sheet-ev-tipo-pago-overlay');
  if (sh) { sh.style.transition = 'transform 0.28s cubic-bezier(0.32,0.72,0,1)'; sh.style.transform = 'translateY(100%)'; }
  if (ov) ov.style.opacity = '0';
  setTimeout(function() {
    if (sh) sh.style.display = 'none';
    if (ov) ov.style.display = 'none';
  }, 300);
}

function _evAbrirSheetCuotaPendiente() {
  var modo = _modoUsuario();
  var acc = document.getElementById('sheet-cuota-pendiente-acciones');
  if (acc) {
    var html = '<button type="button" class="btn btn-primary" style="width:100%;margin-bottom:10px;" onclick="_evCuotaPagarAhora()">Pagar ahora</button>';
    if (modo === 'quindes') {
      html += '<button type="button" class="btn btn-secondary" style="width:100%;margin-bottom:10px;" onclick="_evCuotaSolicitarAyuda()">Solicitar ayuda con el pago</button>';
    }
    acc.innerHTML = html;
  }
  var sh = document.getElementById('sheet-cuota-pendiente');
  var ov = document.getElementById('sheet-cuota-pendiente-overlay');
  if (!sh || !ov) return;
  ov.style.display = 'block'; sh.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() {
    sh.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
    sh.style.transform = 'translateY(0)';
    ov.style.opacity = '1';
  }); });
  _registrarOverlayAbierto(function() { cerrarSheetCuotaPendiente(true); });
}
// Mismo contrato que cerrarSheetTipoPago()/cerrarSheetEvAccion() de arriba
// (porGesto/history.back(), ver el comentario de cerrarSheetTipoPago()) --
// sin esta guardia, un tap en "Cancelar"/overlay hubiera dejado huérfana la
// entrada de historial de _registrarOverlayAbierto(), mismo bug ya
// encontrado y corregido 2 veces antes en este archivo (ver MANIFEST.md).
function cerrarSheetCuotaPendiente(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('sheet-cuota-pendiente');
  var ov = document.getElementById('sheet-cuota-pendiente-overlay');
  if (sh) { sh.style.transition = 'transform 0.28s cubic-bezier(0.32,0.72,0,1)'; sh.style.transform = 'translateY(100%)'; }
  if (ov) ov.style.opacity = '0';
  setTimeout(function() {
    if (sh) sh.style.display = 'none';
    if (ov) ov.style.display = 'none';
  }, 300);
}
// "Pagar ahora"/"Solicitar ayuda" -- cierre sin argumento (pasa por
// history.back(), no cierre directo) + navegación diferida por setTimeout,
// mismo patrón que irNuevaReservaConTipo() (abajo): llamar acá mismo,
// sincrónicamente, a evAbrirSheetTipoPago()/irNuevaReservaConTipo()/
// abrirWizardExcepcion() (cada una con su propio _registrarOverlayAbierto(),
// osea su propio history.pushState()) hubiera competido con el
// history.back() todavía en curso de este cierre -- exactamente la carrera
// que ya se corrigió una vez en este archivo para irNuevaReservaConTipo().
function _evCuotaPagarAhora() {
  var modo = _modoUsuario();
  cerrarSheetCuotaPendiente();
  setTimeout(function() {
    if (modo === 'quindes') irNuevaReservaConTipo('mensual');
    else evAbrirSheetTipoPago();
  }, 310);
}
function _evCuotaSolicitarAyuda() {
  cerrarSheetCuotaPendiente();
  setTimeout(function() { abrirWizardExcepcion(); }, 310);
}

function irNuevaReservaConTipo(tipo) {
  // Corrección de una tanda anterior (ver MANIFEST.md "Cambios recientes"):
  // acá se llamaba `cerrarSheetTipoPago(true)` -- cierre visual directo, sin
  // pasar por `history.back()`. Eso evita la carrera contra un pushState
  // síncrono (motivo original del cambio), pero deja huérfana la entrada de
  // historial que `_registrarOverlayAbierto()` empujó al abrir el sheet:
  // `ir('s4')` (vía irNuevaReserva()->cargarFechas(), 310ms después) sí vacía
  // `_overlayStack` en JS pero no toca esa entrada de historial del
  // navegador -- 1 solo "atrás" desde s4 saltaba a s-home/s1 en vez de volver
  // a s-eventos. Fix real: sin argumento (mismo patrón ya usado y correcto
  // en `cerrarSheetEquipHome()`/`irTallaDesdeHomeEquip()`, js/home.js) --
  // pasa por `history.back()`, que consume esa entrada antes de que corra
  // el `setTimeout` de abajo, sin competir con el pushState de ir('s4')
  // porque éste corre recién después, no en el mismo tick.
  cerrarSheetTipoPago();
  setTimeout(function() {
    irNuevaReserva(false, null);
    if (tipo === 'mensual') {
      setTimeout(function() { if (typeof selTipoPago === 'function') selTipoPago('mensual'); }, 80);
    }
  }, 310);
}
function _evRsvpBarraHtml(e) {
  if (e.estado === 'Cancelado' || e.estado === 'No se entrena') return '';
  if (_evEsPasado(e)) return _evAsistenciaRealHtml(e);
  if (_evOcultarRsvpPorEquipoClub(e)) return '';
  var botones = _EV_RESP_OPCIONES.map(function(estado) {
    var act = e.miEstado === estado ? ' activa' : '';
    return '<div class="ev-rsvp-opt' + act + '" data-estado="' + estado + '" onclick="_evMarcarAsistencia(\'' + e.id + '\',\'' + estado + '\')"><span class="material-symbols-outlined">' + _EV_RESP_ICONO[estado] + '</span>' + estado + '</div>';
  }).join('');
  // stopPropagation: la card entera ahora es clickeable (abre el detalle,
  // ver _evCardEventoHtml()) -- sin esto, tocar cualquier opción de RSVP
  // también dispararía ese click y abriría el detalle encima de marcar la
  // asistencia.
  return '<div class="ev-asistire-wrap" onclick="event.stopPropagation()"><div class="ev-rsvp-seg" data-evid="' + e.id + '"><div class="ev-rsvp-slider"></div>' + botones + '</div></div>';
}

// Posiciona el indicador de UNA barra (offsetLeft/offsetWidth de la opción
// .activa, mismo mecanismo que .tp-slider/js/reservas.js) -- `seg` es
// el .ev-rsvp-seg, no el wrapper. Sin opción activa (miEstado null, evento
// recién creado) el indicador queda con opacity:0 (ver CSS), no en (0,0).
function _evPosicionarRsvpSlider(seg, animate) {
  var slider = seg.querySelector('.ev-rsvp-slider');
  if (!slider) return;
  slider.classList.toggle('animado', !!animate);
  var activo = seg.querySelector('.ev-rsvp-opt.activa');
  if (!activo) { slider.style.opacity = '0'; slider.style.width = '0'; return; }
  slider.style.opacity = '1';
  // Inset horizontal de 3px (ver "Cambios recientes") -- mismo valor que el
  // inset vertical ya existente en CSS (.ev-rsvp-slider, top/bottom:3px), para
  // que el indicador tenga el mismo aire en las 4 direcciones -- antes solo
  // tenía aire arriba/abajo, quedaba pegado al borde del contenedor en los 2
  // extremos (Asistiré/No jugador).
  slider.style.width = (activo.offsetWidth - 6) + 'px';
  slider.style.transform = 'translateX(' + (activo.offsetLeft + 3) + 'px)';
  slider.style.background = _EV_RSVP_BG[activo.getAttribute('data-estado')] || 'var(--brand-light)';
}
// Reposiciona TODAS las barras visibles -- llamado tras cualquier re-render
// del timeline (filtros, búsqueda) y, con setTimeout(50), la primera vez que
// la pantalla se vuelve visible (offsetWidth/offsetLeft de un elemento
// display:none da 0, necesita medirse recién cuando ya es visible).
function _evUpdateRsvpSliders(animate) {
  document.querySelectorAll('.ev-rsvp-seg').forEach(function(seg) { _evPosicionarRsvpSlider(seg, animate); });
}
// Conectada a marcarAsistenciaUsuario() real (apiPost, confirmada
// desplegada en esta sesión) -- optimista: actualiza el array local y el DOM
// de una (mismo criterio "se siente instantáneo" que el resto de esta
// pantalla), y recién DESPUÉS dispara la escritura real; si falla, revierte
// las 2 cosas y avisa con un toast -- nunca deja la UI mostrando un estado
// que en realidad no se guardó. `token: _token` (no `_token: _token`) --
// mismo nombre de parámetro que usa CUALQUIER otra escritura real ya
// confirmada de esta app contra el backend viejo de Apps Script (ej.
// `subirFotoPerfil`, js/foto.js -- la Asistencia anticipada que citaba este
// comentario antes ya migró a Supabase directo, ver "Cambios recientes",
// así que dejó de ser un ejemplo válido de esto); el snippet de MANIFEST.md
// documenta `e.parameter._token`
// para esta acción puntual, pero como el backend real ya desplegado difiere
// del snippet documentado en otros campos (ver _evMapEventoBackend()) no hay
// forma de confirmar cuál de los 2 nombres usa de verdad sin una escritura
// real -- si el backend espera `_token`, esto va a fallar limpio (toast +
// revert, nunca corrompe el estado local) hasta que Victor confirme/ajuste.
// Actualiza TODAS las instancias visibles de la barra de este evento en el
// DOM existente (data-evid) en vez de reconstruir HTML -- un mismo evento
// puede estar renderizado en más de un lugar a la vez (lista + detalle), y
// reconstruir el nodo mataría la animación del indicador (un nodo recién
// creado no tiene "posición anterior" desde la cual animar).
// Cuota al día para Mirlxs-mensual/Quindes -- cierra el "PUNTO DE EXTENSIÓN"
// que señalaba `_evMarcarAsistencia()` (ver MANIFEST.md). Ya NO hay
// excepción por depender de equipo del club (ver MANIFEST.md, eliminación
// del modo 'equipamiento') -- toda cuenta pasa por el mismo chequeo de
// reserva mensual activa, sin importar si necesita patines/protecciones.
// `_todasReservas` (js/home.js, global) es la misma fuente que ya usa
// `_clasificarReservas()` para "reserva mensual activa" -- mismo criterio de
// campo/parseo (`r.validezHasta` vía `_parseFechaSimple()`, formato real
// `d/m/aaaa`, NO ISO -- `new Date(...)` directo sobre ese string da
// `Invalid Date`/fecha mal interpretada).
function _evTieneCuotaAlDia() {
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return (_todasReservas || []).some(function(r) {
    if (r.tipo !== 'mensual') return false;
    if (r.estado === 'Cancelada') return false;
    var vh = _parseFechaSimple(r.validezHasta);
    return !vh || hoy <= vh;
  });
}

function _evMarcarAsistencia(id, estado) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  if (estado === 'Asistiré' && !_evTieneCuotaAlDia()) {
    _evAbrirSheetCuotaPendiente();
    return;
  }
  var estadoAnterior = ev.miEstado;
  var rsvpsAnterior = ev.rsvps || [];
  ev.miEstado = estado;
  // Bug real corregido (ver "Cambios recientes"): antes esta función solo
  // tocaba `ev.miEstado` (para resaltar la barra de RSVP propia) -- nunca
  // `ev.rsvps`, que es de donde sale el conteo/lista "Asisten"/"No
  // asisten"/"No jugador" de la pantalla de detalle
  // (`_evRenderDetalleAsistencia()`). Resultado: marcar "Asistiré" y entrar
  // al detalle del mismo evento SIN recargar la página entera mostraba "0"
  // y no listaba a quien acababa de responder, pese a que la escritura ya
  // había quedado guardada en Log de asistencias -- `ev.rsvps` seguía
  // siendo el array de la última carga de `getEventosRango()`, de antes de
  // este marcado. Mismo criterio de normalización que ya usa el resto del
  // archivo para cruzar nombres de 2 hojas distintas (`_evNombresCoinciden()`).
  ev.rsvps = rsvpsAnterior.filter(function(p) { return !_evNombresCoinciden(p.nombre, E.nombre); })
    .concat([{ nombre: E.nombre, estado: estado, origen: 'Usuario' }]);
  var actualizarDom = function(est) {
    document.querySelectorAll('.ev-rsvp-seg').forEach(function(seg) {
      if (seg.getAttribute('data-evid') !== id) return;
      seg.querySelectorAll('.ev-rsvp-opt').forEach(function(opt) {
        opt.classList.toggle('activa', opt.getAttribute('data-estado') === est);
      });
      _evPosicionarRsvpSlider(seg, true);
    });
    // Repinta el desglose de asistencia si el detalle de ESTE evento está
    // abierto en este momento -- si no, no hace falta (se arma fresco desde
    // `ev.rsvps`, ya actualizado, la próxima vez que se abra).
    if (_evDetalleActual && _evDetalleActual.id === id) _evRenderDetalleAsistencia(ev);
  };
  // Sin toast en el éxito, a propósito (ver "Cambios recientes") -- el
  // resaltado animado de la opción tocada ya es feedback suficiente, mismo
  // criterio que el resto de la app: toasts silenciados salvo error real.
  actualizarDom(estado);
  apiPost({ action: 'marcarAsistenciaUsuario', token: _token, idEvento: id, estado: estado }, function() {}, function(e) {
    ev.miEstado = estadoAnterior;
    ev.rsvps = rsvpsAnterior;
    actualizarDom(estadoAnterior);
    mostrarToast(e && e.message ? e.message : 'No se pudo guardar tu asistencia.', 'error');
  });
}

/* ── Variante admin: lista de asistentes con chip + botón de gestión ───
   Lista colapsada por default (ver "Cambios recientes"), mismo mecanismo
   que `_evAntSetAcordeon()`/`adminToggleBanner()` (js/admin.js): techo fijo
   generoso vía clase `.abierto` en vez de medir `scrollHeight` en cada
   toggle. `_evAsistAdminAbierto` (id de evento o null) es GLOBAL a todo el
   timeline, no por-card -- abrir el acordeón de una card cierra el de
   cualquier otra que hubiera quedado abierta, mismo criterio "solo uno a la
   vez" que `_adminCerrarTodoAbierto()`. El estado se re-aplica en cada
   render (`abierto` calculado contra `_evAsistAdminAbierto` al armar el
   HTML) para sobrevivir a un re-render completo del timeline.

   El botón "Tomar asistencia" (ver "Cambios recientes" -- texto y posición:
   antes decía "Agregar persona" y vivía debajo de "Asistencia (N)", ahora
   arriba del todo) navega a la subpantalla dedicada (`_evAbrirMarcarAsistencia()`,
   ver más abajo -- consolidación final, ver MANIFEST.md) -- MISMO componente
   que el botón equivalente del detalle de un evento (reemplaza a la card
   "Ausentes" ahí), ambos puntos de entrada reusan el roster precargado
   (`_evRosterEquipo`/`_evPrecargarRoster()`, más arriba) y las filas que arma
   `_evRosterAdminFilasHtml()`. */
var _evAsistAdminAbierto = null;
function _evAsistAdminSetAbierto(id, abrir) {
  var header = document.getElementById('ev-asist-admin-header-' + id);
  var body = document.getElementById('ev-asist-admin-body-' + id);
  if (header) header.classList.toggle('abierto', abrir);
  if (body) body.classList.toggle('abierto', abrir);
}
function _evAsistAdminToggle(id) {
  var estabaAbierto = _evAsistAdminAbierto === id;
  if (_evAsistAdminAbierto) _evAsistAdminSetAbierto(_evAsistAdminAbierto, false);
  _evAsistAdminAbierto = estabaAbierto ? null : id;
  if (_evAsistAdminAbierto) _evAsistAdminSetAbierto(_evAsistAdminAbierto, true);
}
function _evAccionAdminHtml(e) {
  var asistentes = e.asistentes || [];
  var filas = asistentes.map(function(a) {
    // Puntualidad (a.estado) + rol (RSVP original de esa persona, si lo
    // hay) combinados -- ver _evLabelPuntualidadRol(). El badge de color
    // sigue leyendo a.estado a secas (A tiempo/Tarde/Ausente): el rol nunca
    // cambia el color, solo agrega texto.
    var label = _evLabelPuntualidadRol(a.estado, _evRolDePersona(e, a.nombre));
    return '<div class="ev-asistente-row"><span class="ev-asistente-nombre">' + (a.nombreDerby || a.nombre) + '</span>' +
      '<span class="badge ' + (_EV_CHIP_BADGE[a.estado] || 'badge-pendiente') + '">' + label + '</span></div>';
  }).join('');
  var abierto = _evAsistAdminAbierto === e.id;
  // stopPropagation: mismo motivo que _evRsvpBarraHtml() -- la card entera
  // ahora es clickeable (abre el detalle), esto evita que tocar el header,
  // una fila o "Tomar asistencia" también dispare ese click.
  // Orden (ver "Cambios recientes" -- pedido explícito de Victor): el botón
  // va PRIMERO, arriba de "Asistencia (N)" -- antes vivía debajo del todo.
  return '<div class="ev-asistentes-list" onclick="event.stopPropagation()">' +
    '<button class="ev-btn-agregar-persona" onclick="_evAbrirMarcarAsistencia(\'' + e.id + '\',\'s-eventos\')"><span class="material-symbols-outlined">person_add</span>Tomar asistencia</button>' +
    '<div class="ev-asist-admin-header' + (abierto ? ' abierto' : '') + '" id="ev-asist-admin-header-' + e.id + '" onclick="_evAsistAdminToggle(\'' + e.id + '\')">' +
      '<span class="ev-asist-admin-header-titulo">Asistencia (' + asistentes.length + ')</span>' +
      '<span class="material-symbols-outlined ev-asist-admin-chevron">expand_more</span>' +
    '</div>' +
    '<div class="ev-asist-admin-body' + (abierto ? ' abierto' : '') + '" id="ev-asist-admin-body-' + e.id + '">' +
      '<div class="ev-asist-admin-body-inner">' +
        (filas || '<div style="font-size:0.76rem;color:var(--muted);">Nadie ha marcado todavía.</div>') +
      '</div>' +
    '</div>' +
  '</div>';
}
// Subpantalla dedicada "Marcar asistencia" (ver "Cambios recientes" --
// consolidación final: reemplaza el roster que había vivido inline en el
// acordeón del detalle -- `_evPintarGestionAdminDetalle()`, eliminada -- Y
// el bottom sheet remoto "+ Agregar persona" -- `_evAbrirAgregarPersona()`/
// `#ev-sheet-agregar`, eliminados -- 2 diseños intermedios probados antes de
// este). Único punto real de gestión de asistencia admin, con 2 puntos de
// entrada que reusan el MISMO componente: la card del home/timeline
// (`_evAccionAdminHtml()`, más arriba) y el botón que reemplaza a la card
// "Ausentes" en el detalle (`_evStatCardMarcarAsistenciaHtml()`, más abajo)
// -- cada uno pasa su propio `origen` para que la flecha atrás vuelva a
// donde corresponde (mismo patrón que `_evLugarOrigen`/`_evLugarFormVolver()`
// más abajo en este archivo).
var _evMarcarAsistIdEvento = null;
var _evMarcarAsistOrigen = 's-eventos';
function _evMarcarAsistVolver() { return _evMarcarAsistOrigen; }
function _evAbrirMarcarAsistencia(idEvento, origen) {
  // Guard explícito (ver "Cambios recientes", punto 6 del pedido de Victor):
  // los 2 botones que llaman a esta función ya están ocultos del todo para
  // no-admin, pero queda explícito acá también, mismo criterio que el resto
  // de la app -- ninguna cuenta no-admin debería poder marcar nada aunque
  // llegara acá por otro medio (ej. tocando "atrás" del navegador).
  if (!_adminToken) return;
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === idEvento; })[0];
  if (!ev) return;
  var origenFinal = origen || 's-eventos';
  // Bug real corregido (ver "Cambios recientes" -- scroll del timeline
  // perdido al volver de esta subpantalla): a diferencia de `abrirEvDetalle()`,
  // esta función nunca guardaba `_evTimelineScrollY` antes de navegar afuera
  // de `s-eventos` -- quedó afuera del mecanismo de preservación de scroll
  // por ser nueva. Solo cuando SE ABANDONA el timeline en sí (origen
  // 's-eventos'): si se entra desde el detalle (origen 's-eventos-detalle'),
  // no hay que tocar nada acá -- ya quedó guardado por `abrirEvDetalle()` al
  // entrar ahí, y pisarlo con `window.scrollY` del DETALLE lo rompería.
  if (origenFinal === 's-eventos') { _evGuardarScrollTimeline(); _evRestaurarScrollTimeline = true; }
  _evMarcarAsistIdEvento = idEvento;
  _evMarcarAsistOrigen = origenFinal;
  var s = document.getElementById('ev-marcar-search'); if (s) s.value = '';
  ir('s-eventos-marcar-asistencia');
  _evRenderMarcarAsistLista('');
}
// Buscador local (ver "Cambios recientes") -- mismo criterio que otros
// buscadores instantáneos de la app (`_adminFiltrarDestino()`/etc.): filtra
// en cliente sobre el roster YA cargado en memoria (`_evRosterEquipo`), sin
// ningún request nuevo por tecla.
function _evMarcarAsistFiltrar(q) { _evRenderMarcarAsistLista(q); }
// Repinta SOLO la lista de filas (`#ev-marcar-lista`), nunca el `<input>` de
// búsqueda -- evita perder el foco/cursor del usuario mientras tipea.
// `_evRosterEquipo === null` (todavía no llegó la respuesta de
// `_evPrecargarRoster()`) muestra un mensaje corto en vez de nada -- caso
// raro en la práctica (el roster se pide en paralelo con los eventos apenas
// se entra a Eventos, normalmente ya está listo para cuando alguien abre
// esta subpantalla), pero sin esto la lista quedaría en blanco sin
// explicación si alguien llega acá en el primer instante.
function _evRenderMarcarAsistLista(q) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === _evMarcarAsistIdEvento; })[0];
  var cont = document.getElementById('ev-marcar-lista');
  if (!ev || !cont) return;
  // Diagnóstico (ver "Cambios recientes", punto 3 del pedido de Victor --
  // confirmar si esta pantalla accede al resultado ya cacheado, o si se
  // pierde en algún punto): loguea el estado de `_evRosterEquipo` en el
  // momento exacto en que la subpantalla intenta pintarse -- si acá dice
  // "null" mucho después de haber entrado a Eventos, la precarga nunca
  // resolvió (ver _evPrecargarRoster()); si dice un array (aunque sea
  // `[]`), la variable de módulo SÍ es accesible desde acá -- el problema,
  // si lo hay, está en cómo/si `_evPrecargarRoster()` la llenó, no en el
  // scoping.
  if (window.console) console.log('Eventos: _evRenderMarcarAsistLista() -- _evRosterEquipo=' + (_evRosterEquipo === null ? 'null (todavía sin cargar)' : '[' + _evRosterEquipo.length + ' personas]'));
  if (_evRosterEquipo === null) { cont.innerHTML = '<div class="ev-roster-vacio">Cargando equipo...</div>'; return; }
  cont.innerHTML = _evRosterAdminFilasHtml(ev, q);
  // Sin animar (`false`) -- primer pintado de estas filas, no una respuesta
  // a un toque (mismo criterio que `_evUpdateRsvpSliders(false)` tras
  // `_evRenderTimeline()`, más abajo en este archivo).
  cont.querySelectorAll('.ev-rsvp-seg').forEach(function(seg) { _evPosicionarRsvpSlider(seg, false); });
}
// Si el roster tardó más que `getEventosRango()` en llegar y esta
// subpantalla ya estaba abierta esperándolo -- caso raro pero posible --
// repinta ahora que el dato ya está, en vez de dejarla colgada en "Cargando
// equipo...". Mismo criterio de gate que el resto del archivo.
function _evRepintarMarcarAsistSiHaceFalta() {
  var pantalla = document.getElementById('s-eventos-marcar-asistencia');
  if (!pantalla || !pantalla.classList.contains('activa') || !_evMarcarAsistIdEvento) return;
  var inp = document.getElementById('ev-marcar-search');
  _evRenderMarcarAsistLista(inp ? inp.value : '');
}
// Arma las filas del roster completo (`_evRosterEquipo`, precargado) contra
// EL estado real de este evento puntual (`e.asistentes`) -- cada persona
// lleva su propio slider de 2 estados (`_EV_ROLLCALL_LABEL_CORTO`: "A
// horario"/"Tarde", a propósito sin "Ausente", ver esa constante más
// arriba), reusando LITERAL el mismo componente `.ev-rsvp-seg`/
// `.ev-rsvp-opt`/`.ev-rsvp-slider` que ya usa la barra de RSVP de 3
// opciones -- `_evPosicionarRsvpSlider()` es genérica sobre cualquier
// `data-estado` (ver el comentario de `_EV_RSVP_BG`, más arriba), no hizo
// falta ningún mecanismo nuevo de deslizamiento. Si la persona no tiene
// ninguna entrada A tiempo/Tarde en `e.asistentes` (nunca se marcó, o solo
// está "Ausente" -- un estado que esta UI no puede escribir, ver la
// constante de arriba), el slider arranca sin ninguna opción activa
// (`_evPosicionarRsvpSlider()` ya sabe mostrar eso con opacity:0, mismo
// comportamiento que la barra de RSVP para alguien que nunca respondió).
function _evRosterAdminFilasHtml(e, q) {
  var roster = _evRosterEquipo || [];
  var qn = (q || '').toLowerCase().trim();
  var filtrado = qn ? roster.filter(function(p) { return (p.nombreDerby || '').toLowerCase().indexOf(qn) !== -1 || String(p.nombre).toLowerCase().indexOf(qn) !== -1; }) : roster;
  if (!filtrado.length) return '<div class="ev-roster-vacio">' + (roster.length ? 'Sin resultados.' : 'No se pudo cargar el equipo.') + '</div>';
  var asistPorNombre = {};
  (e.asistentes || []).forEach(function(a) { asistPorNombre[String(a.nombre).trim().toUpperCase()] = a.estado; });
  return filtrado.map(function(p) {
    var estadoActual = asistPorNombre[String(p.nombre).trim().toUpperCase()];
    if (estadoActual !== 'A tiempo' && estadoActual !== 'Tarde') estadoActual = null;
    var nombreAttr = String(p.nombre).replace(/'/g, "\\'");
    var opts = ['A tiempo', 'Tarde'].map(function(estado) {
      var act = estadoActual === estado ? ' activa' : '';
      return '<div class="ev-rsvp-opt' + act + '" data-estado="' + estado + '" onclick="_evMarcarAsistenciaAdmin(\'' + e.id + '\',\'' + nombreAttr + '\',\'' + estado + '\',this)"><span class="material-symbols-outlined">' + _EV_ASISTENCIA_REAL_PILL_ICONO[estado] + '</span>' + _EV_ROLLCALL_LABEL_CORTO[estado] + '</div>';
    }).join('');
    return '<div class="ev-roster-fila">' +
      '<span class="ev-roster-nombre">' + (p.nombreDerby || p.nombre) + '</span>' +
      '<div class="ev-rsvp-seg ev-rsvp-seg-roster"><div class="ev-rsvp-slider"></div>' + opts + '</div>' +
    '</div>';
  }).join('');
}
// Marca A tiempo/Tarde para UNA persona puntual -- 3 llamadores posibles
// (ver "Cambios recientes", consolidación final): el roster completo de la
// subpantalla "Marcar asistencia" (`_evRosterAdminFilasHtml()`, arriba), el
// toggle inline de las listas "A horario"/"Tarde" del detalle
// (`_evGrupoAsistenciaHtml()`, más abajo), y -- indirectamente -- ninguno
// más. Mismo endpoint ya usado (`adminMarcarAsistencia`, sin acción nueva),
// mismo criterio optimista + revert que `_evMarcarAsistencia()` (RSVP
// propio, más arriba): resalta la opción y reposiciona SOLO el slider de
// esa fila (`btnEl.closest('.ev-rsvp-seg')`, nunca un sweep de
// `_evUpdateRsvpSliders()` sobre todo el roster) y actualiza
// `ev.asistentes`/el contador del header de la card (si esa card sigue en
// el timeline detrás del detalle -- consistencia gratis, sin costo) en
// memoria antes de que la escritura real resuelva. Repinta también las
// tarjetas de estadística + lista del detalle (`_evActualizarStatsAsistenciaReal()`)
// si ese evento está abierto ahí -- sin reconstruir la subpantalla "Marcar
// asistencia" en sí (que vive aparte, con su propio buscador con texto
// tipeado que no debe perderse). Sin toast en el éxito, a propósito (mismo
// criterio que `_evMarcarAsistencia()`) -- el resaltado ya es feedback
// suficiente. Ni `_evPrecargarRoster()` ni `_evRenderTimeline()` se llaman
// acá en ningún momento.
function _evMarcarAsistenciaAdmin(idEvento, nombre, estado, btnEl) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === idEvento; })[0];
  if (!ev) return;
  var seg = btnEl.closest('.ev-rsvp-seg');
  // Toggle-off (ver "Cambios recientes"): tocar la opción que YA está
  // activa para esta persona la deselecciona, en vez de re-aplicar el
  // mismo estado (antes un no-op visual que igual disparaba un POST
  // idéntico). Se lee `btnEl.classList` ANTES de que `aplicarEnDom()` la
  // toque más abajo -- el estado real tocado en pantalla, no un cálculo
  // aparte contra `ev.asistentes` (que podría haber quedado desincronizado
  // por un revert previo todavía en vuelo). 'Ninguno' viaja tal cual al
  // backend (pedido explícito) -- no es un valor "borrar la fila", es un
  // 3er estado real que `adminMarcarAsistencia` entiende, mismo mecanismo
  // que 'A tiempo'/'Tarde'.
  var yaActiva = btnEl.classList.contains('activa');
  var estadoAEnviar = yaActiva ? 'Ninguno' : estado;
  var asistentesAnterior = ev.asistentes || [];
  var anteriorDeEstaPersona = asistentesAnterior.filter(function(a) { return _evNombresCoinciden(a.nombre, nombre); })[0] || null;
  var aplicarEnDom = function(estadoAMostrar) {
    seg.querySelectorAll('.ev-rsvp-opt').forEach(function(o) { o.classList.toggle('activa', o.getAttribute('data-estado') === estadoAMostrar); });
    _evPosicionarRsvpSlider(seg, true);
  };
  var datosRoster = (_evRosterEquipo || []).filter(function(p) { return _evNombresCoinciden(p.nombre, nombre); })[0] || {};
  var sinPersona = asistentesAnterior.filter(function(a) { return !_evNombresCoinciden(a.nombre, nombre); });
  // 'Ninguno' -- sin fila en `ev.asistentes` para esta persona (mismo
  // criterio ya documentado: "no marcar nada equivale a sin marca"), así
  // que el contador (`.length`) y las estadísticas de A horario/Tarde la
  // excluyen solas, sin necesitar ningún caso especial en esas 2 funciones.
  ev.asistentes = estadoAEnviar === 'Ninguno' ? sinPersona :
    sinPersona.concat([{ nombre: nombre, estado: estadoAEnviar, origen: 'Admin', nombreDerby: datosRoster.nombreDerby || '', fotoPerfil: datosRoster.fotoPerfil || '' }]);
  aplicarEnDom(estadoAEnviar === 'Ninguno' ? null : estadoAEnviar);
  _evActualizarContadorAsistAdmin(idEvento);
  if (_evDetalleActual && _evDetalleActual.id === idEvento) _evActualizarStatsAsistenciaReal(ev);
  apiPost({ action: 'adminMarcarAsistencia', adminToken: _adminToken, idEvento: idEvento, nombre: nombre, estado: estadoAEnviar }, function() {}, function(e) {
    ev.asistentes = asistentesAnterior;
    aplicarEnDom(anteriorDeEstaPersona ? anteriorDeEstaPersona.estado : null);
    _evActualizarContadorAsistAdmin(idEvento);
    if (_evDetalleActual && _evDetalleActual.id === idEvento) _evActualizarStatsAsistenciaReal(ev);
    mostrarToast(e && e.message ? e.message : 'No se pudo guardar la asistencia.', 'error');
  });
}
function _evActualizarContadorAsistAdmin(idEvento) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === idEvento; })[0];
  var titulo = document.querySelector('#ev-asist-admin-header-' + idEvento + ' .ev-asist-admin-header-titulo');
  if (ev && titulo) titulo.textContent = 'Asistencia (' + (ev.asistentes || []).length + ')';
}

/* ── Card de cumpleaños ────────────────────────────────────────────────
   Solo entran a _EV_CUMPLEANOS_DEMO personas con Fecha pública=Sí (mismo
   criterio que "Próximos cumpleaños" existente) -- la edad se muestra
   solo si edadPublica también es Sí, si no "Hoy cumple" sin número.
   Mismo tratamiento visual que _evCardEventoHtml() (ver "Cambios recientes"
   -- antes tenía un `.ev-card-icon` cuadrado propio + título en color fijo
   `--cumple-text`, ambos eliminados): avatar circular real (`.avatar-pill`,
   hidratado por _evHidratarAvatares() -- ver ahí) en vez del cuadrado, e
   ícono `cake` INLINE junto al título (`.ev-card-titulo-row`/
   `.ev-card-icono-inline`, mismas clases que cualquier card de evento) en
   vez de vivir en ese cuadrado. Sin color propio: `.ev-card-titulo` queda en
   `var(--text)`, como cualquier otra card -- ya no hace falta que el título
   se destaque, el avatar + "Cumpleaños de <nombre>" ya son señal suficiente. */
function _evCardCumpleHtml(c) {
  var texto = (c.edadPublica && c.edad) ? ('cumple ' + c.edad + ' años') : 'Hoy cumple';
  var nombreAttr = c.nombre.replace(/"/g, '&quot;');
  var fotoAttr = (c.fotoPerfil || '').replace(/"/g, '&quot;');
  // `.ev-card-top-row` (ver "Cambios recientes" -- corrección de alineación
  // del RSVP de eventos, reusada tal cual acá): antes esta fila (avatar+
  // body) era `.ev-card` mismo (`display:flex`); sin RSVP ni panel
  // expandido, el cambio es puramente estructural, sin efecto visual --
  // `.ev-confetti-host` (`position:absolute`) sigue como hijo directo de
  // `.ev-card` (necesita `.ev-card-cumple{position:relative}`, sin tocar).
  return '<div class="ev-card ev-card-cumple">' +
    '<div class="ev-card-top-row">' +
      '<div class="avatar-pill ev-card-cumple-avatar" data-nombre="' + nombreAttr + '" data-foto="' + fotoAttr + '"></div>' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo-row"><span class="material-symbols-outlined ev-card-icono-inline">cake</span><div class="ev-card-titulo">Cumpleaños de ' + c.nombre + '</div></div>' +
        '<div class="ev-card-sub">' + texto + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ev-confetti-host" id="ev-confetti-' + c.id + '" style="position:absolute;inset:0;pointer-events:none;"></div>' +
  '</div>';
}
// Temporada de descanso (Tanda B, ver MANIFEST.md "Cambios recientes") --
// UNA sola card por temporada, sin importar cuántos días dure (posicionada
// en el timeline por `fechaInicio`, ver _evTimelineItems()). No interactiva
// para usuarios normales -- sin `onclick`, sin RSVP, sin botón de reserva --
// una temporada de descanso no es un evento con el que se pueda interactuar,
// solo informa un rango. Mismo esqueleto `.ev-card`/`.ev-card-top-row`/
// `.ev-card-body`/`.ev-card-titulo-row`/`.ev-card-icono-inline` que
// cualquier otra card de este timeline (reuso literal, cero estructura
// propia) -- `.ev-card-offseason` (css/eventos.css) es el único agregado:
// fondo/borde con las variables nuevas `--offseason-bg`/`--offseason-border`
// (colors.css) y el ícono en `--muted` en vez de `--brand`, para que se lea
// "apagada" frente a una card de evento normal. Subtítulo con
// `_evAntFechaLegible()` (ya existente, usada para el mismo formato
// "Del X al Y" en los resúmenes de Asistencia anticipada, más abajo en este
// archivo) -- ninguna función de fecha nueva.
// Acciones admin (ver "Cambios recientes" -- editar/borrar temporadas de
// descanso): solo con `_adminToken` presente, 2 botones al final de la card
// reusando LITERAL `.ev-ant-card-edit`/`.ev-ant-card-del` (mismo par de
// clases que usa el resumen de Asistencia anticipada, css/eventos.css) --
// cero CSS nuevo. Van dentro de `.ev-card-top-row` (ya `display:flex`),
// después de `.ev-card-body`, que absorbe el ancho sobrante con `flex:1` --
// mismo resultado visual que en `.ev-ant-card` sin necesitar su propio
// contenedor flex. Usuarios normales ven la card exactamente igual que antes.
function _evCardOffseasonHtml(o) {
  var rango = 'Del ' + _evAntFechaLegible(o.fechaInicio) + ' al ' + _evAntFechaLegible(o.fechaFin);
  var acciones = _adminToken ?
    '<button type="button" class="ev-ant-card-edit" onclick="_evOffseasonEditar(\'' + o.id + '\')" title="Editar">' +
      '<span class="material-symbols-outlined">edit</span>' +
    '</button>' +
    '<button type="button" class="ev-ant-card-del" onclick="_evOffseasonEliminar(\'' + o.id + '\')" title="Eliminar">' +
      '<span class="material-symbols-outlined">delete</span>' +
    '</button>' : '';
  return '<div class="ev-card ev-card-offseason">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo-row"><span class="material-symbols-outlined ev-card-icono-inline">bedtime</span><div class="ev-card-titulo">' + o.nombre + '</div></div>' +
        '<div class="ev-card-sub">' + rango + '</div>' +
      '</div>' +
      acciones +
    '</div>' +
  '</div>';
}

/* ═══════════════════════════════════════════════════════
   TIMELINE ÚNICO (ver "Cambios recientes" -- rediseño: reemplaza la vieja
   pestaña "Lista"/subtabs Próximos-Pasados-Todos. Es funcionalmente lo que
   ya hacía antes solo el subtab "Todos": una sola lista continua que fusiona
   pasados+hoy+próximos, ordenada cronológicamente, con eventos Y
   cumpleaños). Filtros Lugar/Tipo (burbujas inline desplegables, pills
   multi-select) + búsqueda de texto libre, ambos combinables (AND) -- ver
   `_evPasaFiltroLugarTipo()`/`_evPasaBusqueda()`. Cada fecha lleva una card
   completa (futuro, con RSVP) o una fila compacta (pasado, con la
   asistencia real ya registrada) -- ver `_evTimelineFilaHtml()` más abajo. ═ */
// Selección multi-valor por filtro -- arrays de {val,label} (el label es lo
// que se muestra en el trigger/pill, el val lo que se compara). Vacío = sin
// filtro (todos).
var _evTimelineFiltro = { lugar: [], tipo: [] };
// Texto libre del buscador (ver "Cambios recientes" -- reusa el mismo
// componente visual del buscador de Ajustes, `_evPasaBusqueda()` más abajo).
var _evBusqueda = '';

// Opciones candidatas de un filtro, como {val,label} únicos -- lugar/tipo
// usan el mismo string para las 2 cosas.
function _evOpcionesFiltro(campo) {
  var vistos = {}, out = [];
  _EV_EVENTOS.forEach(function(e) {
    var val = campo === 'lugar' ? e.lugar : e.tipo;
    if (!vistos[val]) { vistos[val] = true; out.push({ val: val, label: val }); }
  });
  // "Cumpleaños" -- opción FIJA del filtro Tipo (ver "Cambios recientes"), no
  // derivada de `_EV_EVENTOS` -- los cumpleaños viven en `_EV_CUMPLEANOS`,
  // array aparte sin campo `tipo` propio. Solo para `campo === 'tipo'`; Lugar
  // no tiene equivalente (los cumpleaños no tienen lugar propio, ver
  // `_evPasaFiltroLugarTipoConCumple()` más abajo). Chequeo de `vistos` evita
  // duplicarla si algún evento real ya tuviera `tipo:'Cumpleaños'`.
  if (campo === 'tipo' && !vistos['Cumpleaños']) out.push({ val: 'Cumpleaños', label: 'Cumpleaños' });
  out.sort(function(a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
  return out;
}
/* ── Burbuja inline de filtro (Mes/Lugar/Tipo, ver "Cambios recientes" --
   reemplaza el bottom sheet compartido de antes) -- 3 contenedores propios
   (uno por campo, `#ev-filtro-burbuja-<campo>`) que se expanden/colapsan con
   `max-height` (mismo mecanismo que .admin-mes-acordeon-body/.fi-body,
   `--ease-sheet`) empujando naturalmente la lista de abajo, sin overlay ni
   pantalla completa. Solo uno abierto a la vez (_evToggleFiltroBurbuja()
   colapsa cualquier otro antes de expandir el tocado). Pills togleadas
   multi-select (ajTogglePill(), js/perfil.js) que aplican la selección al
   instante en cada toque -- sin paso "Listo" aparte. ─────────────────── */
var _evFiltroBurbujaAbierta = null; // 'mes' | 'lugar' | 'tipo' | null
function _evToggleFiltroBurbuja(campo) {
  if (_evFiltroBurbujaAbierta === campo) { _evColapsarFiltroBurbuja(campo); _evFiltroBurbujaAbierta = null; }
  else {
    if (_evFiltroBurbujaAbierta) _evColapsarFiltroBurbuja(_evFiltroBurbujaAbierta);
    _evFiltroBurbujaAbierta = campo;
    _evRenderFiltroBurbujaPills(campo);
    var el = document.getElementById('ev-filtro-burbuja-' + campo);
    if (el) el.classList.add('abierta');
  }
  _evActualizarBotonesFiltro();
  // El panel exterior (`#ev-busqueda-panel`, ver "Cambios recientes" --
  // antes `#ev-filtros-colapsable`, panel propio antes de fusionar
  // búsqueda+filtros) fija su `max-height` a la altura real de SU contenido
  // en el momento de abrirse (sin ninguna burbuja Lugar/Tipo abierta
  // todavía) -- relajarlo acá a un techo holgado evita que esa misma altura
  // ajustada recorte una burbuja que se expande DESPUÉS. Sin transición
  // propia (salto directo, no animado): un techo más alto no cambia nada
  // visible mientras el contenido real quepa adentro, así que no hay
  // "golpe" que evitar acá, a diferencia del panel. Más alto que antes
  // (550px, no 460px) porque el panel ahora también contiene el buscador +
  // el subtítulo "Filtros" arriba de Lugar/Tipo.
  var panelEl = document.getElementById('ev-busqueda-panel');
  if (panelEl && panelEl.classList.contains('abierta')) panelEl.style.maxHeight = '550px';
}
function _evColapsarFiltroBurbuja(campo) {
  var el = document.getElementById('ev-filtro-burbuja-' + campo);
  if (el) el.classList.remove('abierta');
}
function _evRenderFiltroBurbujaPills(campo) {
  var opciones = _evOpcionesFiltro(campo);
  var seleccion = _evTimelineFiltro[campo];
  var cont = document.getElementById('ev-filtro-burbuja-pills-' + campo);
  if (!cont) return;
  cont.innerHTML = opciones.map(function(o) {
    var sel = seleccion.some(function(s) { return s.val === o.val; });
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o.val.replace(/"/g, '&quot;') + '" data-label="' + o.label.replace(/"/g, '&quot;') + '" onclick="_evToggleFiltroChip(this,\'' + campo + '\')">' + o.label + '</span>';
  }).join('') || '<div style="padding:2px 4px 10px;color:var(--muted);font-size:0.82rem;">Sin opciones todavía.</div>';
}
// Toca una pill dentro de una burbuja abierta -- aplica la selección
// completa del campo de inmediato (re-render del timeline incluido), no hace
// falta cerrar la burbuja ni tocar un botón de confirmación aparte.
function _evToggleFiltroChip(pillEl, campo) {
  ajTogglePill(pillEl);
  var vals = [];
  document.querySelectorAll('#ev-filtro-burbuja-pills-' + campo + ' .aj-pill.activa').forEach(function(p) {
    vals.push({ val: p.getAttribute('data-val'), label: p.getAttribute('data-label') });
  });
  _evTimelineFiltro[campo] = vals;
  _evActualizarBotonesFiltro();
  _evRenderTimeline(true);
}
// Texto de cada botón trigger: label default sin selección, el nombre único
// si hay exactamente 1, o "Label (N)" si hay más de 1 -- pedido explícito.
// `.ev-filtro-activo` (mismo relleno de color ya existente) marca tanto
// selección aplicada como burbuja abierta sin selección todavía; el chevron
// se invierte mientras la burbuja de ese campo está abierta.
function _evActualizarBotonesFiltro() {
  ['lugar', 'tipo'].forEach(function(campo) {
    var btn = document.getElementById('ev-filtro-btn-' + campo);
    if (!btn) return;
    var label = btn.getAttribute('data-label');
    var sel = _evTimelineFiltro[campo];
    var abierta = _evFiltroBurbujaAbierta === campo;
    var txt = sel.length === 0 ? label : sel.length === 1 ? sel[0].label : label + ' (' + sel.length + ')';
    btn.querySelector('.ev-filtro-trigger-label').textContent = txt;
    btn.classList.toggle('ev-filtro-activo', sel.length > 0 || abierta);
    var chevron = btn.querySelector('.material-symbols-outlined');
    if (chevron) chevron.textContent = abierta ? 'expand_less' : 'expand_more';
  });
  _evActualizarBadgeFiltros();
}
// Cuenta de los 2 filtros (lugar/tipo) CON al menos una opción seleccionada
// -- a propósito NO la cantidad total de opciones marcadas entre los 2
// (pedido explícito, ver "Cambios recientes"). Badge oculto del todo si el
// resultado es 0.
function _evActualizarBadgeFiltros() {
  var badge = document.getElementById('ev-filtro-badge');
  if (!badge) return;
  var n = ['lugar', 'tipo'].filter(function(campo) { return _evTimelineFiltro[campo].length > 0; }).length;
  badge.textContent = String(n);
  badge.style.display = n > 0 ? 'flex' : 'none';
}
// Búsqueda de texto libre (ver "Cambios recientes" -- reusa el componente
// visual del buscador de Ajustes, index.html/css/nav.css) -- convive con
// Lugar/Tipo, mismo criterio AND que entre esos 2 filtros entre sí. Sin
// tildes (ver "Cambios recientes" -- bug real: "cumpleanos" no encontraba
// "Cumpleaños") -- mismo patrón de normalización ya usado en el resto de la
// app (`.normalize('NFD').replace(...)`, js/home.js/js/admin.js) para
// comparar acentos de forma laxa, aplicado tanto al texto ingresado como al
// texto contra el que se compara (simétrico: da igual qué lado lleve o no
// la tilde).
function _evNormalizarBusqueda(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function _evPasaBusqueda(texto) {
  var q = _evNormalizarBusqueda(_evBusqueda.trim());
  return !q || _evNormalizarBusqueda(texto).indexOf(q) !== -1;
}
function _evBuscar(q) { _evBusqueda = q; _evRenderTimeline(true); }

// Una fila del timeline: futuro (incluye hoy) reusa la card COMPLETA
// (_evCardEventoHtml(), con su botón de RSVP); pasado usa una fila compacta
// propia, atenuada (`.ev-pasado-atenuado`, ver "Cambios recientes" -- antes
// solo se atenuaba en el subtab "Todos", ahora el timeline ES ese caso
// siempre) con la asistencia real ya registrada en vez de RSVP/"quién
// asiste" (no tiene sentido para algo que ya ocurrió). Reusa
// `_evAsistenciaRealHtml()` (ver "Cambios recientes" -- antes armaba su
// propio `<span class="badge">` a mano, puesto AL COSTADO dentro de la fila
// flex `.ev-card-compacta`: 2da implementación paralela del mismo concepto,
// con un look distinto -- badge chico con borde -- al de la card completa
// -- `.ev-estado-pill`, rectángulo con ícono. Ahora un solo componente en
// los 2 contextos) como bloque HERMANO de `.ev-card-compacta` (no adentro,
// no al costado) dentro de `.ev-card-compacta-wrap` -- mismo patrón que
// `.ev-asistire-wrap` en la card completa (ver `.ev-card-compacta-wrap
// .ev-estado-pill`/`.ev-card-compacta-wrap .ev-asistire-wrap`,
// css/eventos.css, mismo margen lateral/inferior para las 2). Cancelado/No
// se entrena muestran la MISMA pill de estado que ya usa la card completa/el
// detalle (`_evEstadoNotaPillHtml()`, bug real corregido: se había perdido el
// indicador acá -- un entrenamiento cancelado en el pasado quedaba sin
// ninguna marca visual, indistinguible de uno normal sin asistencia
// registrada) en vez de la asistencia real (nunca hubo/habrá una que
// mostrar). La fecha ya la muestra el badge lateral del grupo
// (_evRenderTimeline()), así que la fila en sí solo necesita hora+tipo.
function _evTimelineFilaHtml(e) {
  var hoy = _evHoyISO();
  if (_evFechaCmp(e.fecha, hoy) >= 0) return _evCardEventoHtml(e, '');
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var cancelado = (e.estado === 'Cancelado' || e.estado === 'No se entrena');
  var _preIngreso = E.datos && E.datos.fechaIngreso && _evFechaCmp(e.fecha, E.datos.fechaIngreso) < 0;
  var _noAsistio = !e.miAsistenciaReal || e.miAsistenciaReal === 'Ausente';
  var nota = cancelado ? _evEstadoNotaPillHtml(e.estado) : (_preIngreso && _noAsistio ? '' : _evAsistenciaRealHtml(e));
  // Bug real corregido (gestión de asistencia admin "desaparecida" en
  // eventos pasados, reportado por Victor): esta fila compacta solo
  // mostraba la propia asistencia (`nota`, arriba) -- a diferencia de
  // `_evCardEventoHtml()` (usada para hoy/futuro), nunca sumaba
  // `_evAccionAdminHtml()` para cuentas admin. La regla de tiempo ya vigente
  // ("disponible desde la hora de inicio en adelante, incluso mucho después
  // de terminado el evento", `_evYaEmpezo()`) siempre da `true` acá (esta
  // fila es exclusiva de fechas YA pasadas, que por definición ya arrancaron)
  // -- se chequea explícito de todos modos, mismo criterio que el resto del
  // archivo, en vez de asumirlo implícito. Cancelado/No se entrena quedan
  // afuera (mismo motivo que en la card completa: nunca hubo/habrá
  // asistencia que gestionar).
  var gestionAdmin = (_adminToken && !cancelado && _evYaEmpezo(e)) ? _evAccionAdminHtml(e) : '';
  return '<div class="ev-card-compacta-wrap ev-pasado-atenuado">' +
    '<div class="ev-card-compacta" onclick="abrirEvDetalle(\'' + e.id + '\')">' +
      '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
      '<div class="ev-card-compacta-info">' +
        '<div class="ev-card-compacta-titulo">' + e.lugar + '</div>' +
        '<div class="ev-card-compacta-sub">' + e.horaInicio + ' · ' + e.tipo + '</div>' +
      '</div>' +
    '</div>' +
    nota +
    gestionAdmin +
  '</div>';
}
// Filtrado 100% en cliente sobre los datos de prueba (Tanda 2) -- la Tanda 3
// reemplaza esto por getEventosFiltrados(lugares[], tipos[], q), mismos 2
// filtros + búsqueda ya con selección múltiple. Fusiona TODOS los eventos +
// cumpleaños (sin importar pasado/hoy/futuro) en una sola lista continua
// ordenada por fecha real -- es exactamente lo que antes hacía solo el
// subtab "Todos" (ver "Cambios recientes", motivo del rediseño: de 6
// combinaciones de vista a 1 timeline único). Cada fecha lleva un badge
// lateral tipo Google Calendar (día+número, ver `_evRenderTimeline()` más
// abajo) en vez de un separador de texto -- por eso, a diferencia de la
// vieja "Todos", acá NO se fuerza un renglón para "hoy" si no tiene eventos
// propios (decisión confirmada: si hoy está vacío, el timeline simplemente
// sigue hasta la fecha real más próxima con contenido).
// Bucket relativo de una fecha futura para los separadores del timeline (ver
// "Cambios recientes" -- restaurados, existían antes de unificar las vistas
// en un único timeline). Reusa `_formatarFechaRelativa()` (js/home.js, ya
// usada por las cards de "Nueva Reserva" para "Mañana"/"Este Sábado") en vez
// de reimplementar ese cálculo de días acá: se le arma el mismo formato de
// entrada que espera ("DD de MES") y se interpreta su resultado. 3 buckets --
// MAÑANA, ESTA SEMANA (ver "Cambios recientes" -- nuevo, pedido explícito de
// Victor: sin esto, un evento a mitad de semana sin nada mañana quedaba sin
// separador propio, dando la sensación de que todo lo que sigue después de
// "Hoy" ya es la semana próxima) y PRÓXIMA SEMANA (la versión vieja
// pre-unificación también tenía "PASADO MAÑANA", no restaurado acá). "ESTA
// SEMANA" es un bucket CANDIDATO acá -- devuelto siempre que la fecha caiga
// en el resto de la semana actual, sin importar si mañana tiene contenido o
// no; el gating real ("solo si NO hubo nada mañana") vive en el loop de
// `_evRenderTimeline()` (consulta `bucketsMostrados['MAÑANA']`, que a esa
// altura del recorrido ascendente ya sabe si mañana se mostró o no) -- esta
// función no tiene esa información, solo conoce la fecha que le pasan.
function _evBucketRelativo(iso) {
  var d = _evParseISO(iso);
  var label = _formatarFechaRelativa(d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()]);
  if (label === 'Mañana') return 'MAÑANA';
  if (_evEsProximaSemana(iso)) return 'PRÓXIMA SEMANA';
  return _evEsRestoDeSemana(iso) ? 'ESTA SEMANA' : null;
}
// "Próxima semana" = bloque Lunes-Domingo siguiente a la semana actual
// (pedido explícito, semana empieza en lunes) -- la semana actual termina en
// el domingo que viene inclusive, mismo cálculo que `_formatarFechaRelativa()`
// (js/home.js: getDay() 0=domingo).
function _evEsProximaSemana(iso) {
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  var diasHastaFinDeSemana = (7 - hoy.getDay()) % 7;
  var inicioProxima = new Date(hoy); inicioProxima.setDate(inicioProxima.getDate() + diasHastaFinDeSemana + 1);
  var finProxima = new Date(inicioProxima); finProxima.setDate(finProxima.getDate() + 6);
  var d = _evParseISO(iso);
  return d >= inicioProxima && d <= finProxima;
}
// "Esta semana" = de pasado-mañana hasta el domingo que viene inclusive
// (ver "Cambios recientes", nuevo) -- rango justo ANTERIOR y adyacente a
// `_evEsProximaSemana()` (nunca se solapan: éste termina el domingo, aquél
// empieza el lunes siguiente). Si hoy es domingo, `finSemana` cae en hoy
// mismo y "mañana" ya es el lunes siguiente (fuera de este rango) -- no hay
// "resto de semana" que mostrar, correcto: no queda ningún día de esta
// semana después de mañana.
function _evEsRestoDeSemana(iso) {
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  var manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
  var diasHastaFinDeSemana = (7 - hoy.getDay()) % 7;
  var finSemana = new Date(hoy); finSemana.setDate(finSemana.getDate() + diasHastaFinDeSemana);
  var d = _evParseISO(iso);
  return d > manana && d <= finSemana;
}
// Filtrado + orden compartido por el render real (`_evRenderTimeline()`) y
// por el chequeo de "¿el mes X tiene contenido?" (`_evCalIrAFechaEnTimeline()`)
// -- un solo lugar con la lógica de filtros/búsqueda, no 2 implementaciones
// paralelas que puedan desincronizarse.
function _evTimelineItems() {
  var items = [];
  // Relevancia por equipo prestado (ver "Cambios recientes") -- para
  // hoy/futuro solo aplica a Entrenamiento (único tipo con concepto de
  // "Reservar" real para estas cuentas; Torneo/Asamblea/etc. nunca lo
  // tienen, quedan siempre visibles); para PASADO aplica a cualquier tipo
  // (corrección explícita sobre el alcance original, ver más abajo).
  // Nunca para admin (necesita ver/gestionar TODOS los eventos, sin
  // importar su propio necesitaPatines -- exclusión no pedida en el pedido
  // original pero necesaria: sin ella, un evento fuera del filtro
  // desaparecería también de la vista de gestión admin). `_evProximas6EntrenIds`
  // (mismo cálculo exacto que ya usa `_evCardEventoHtml()` para
  // `mostrarBtnReservar` -- ver esa función, más arriba -- computado UNA
  // sola vez acá en vez de por cada evento evaluado) marca qué
  // Entrenamientos futuros tienen botón "Reservar" real.
  var _hoyIsoTimeline = _evHoyISO();
  var _filtroEquipoActivo = _evNecesitaEquipo() && !_adminToken;
  var _evProximas6EntrenIds = {};
  if (_filtroEquipoActivo) {
    (_EV_EVENTOS || []).filter(function(x) {
      return x.tipo === 'Entrenamiento' && _evFechaCmp(x.fecha, _hoyIsoTimeline) >= 0;
    }).sort(function(a, b) { return _evFechaCmp(a.fecha, b.fecha); }).slice(0, 6)
      .forEach(function(x) { _evProximas6EntrenIds[x.id] = true; });
  }
  function _evEsRelevantePorEquipo(e) {
    if (!_filtroEquipoActivo) return true;
    var cmp = _evFechaCmp(e.fecha, _hoyIsoTimeline);
    if (cmp >= 0) {
      // Hoy/futuro: el filtro solo tiene sentido para Entrenamiento (único
      // tipo con "botón Reservar" real -- Torneo/Asamblea/etc. nunca lo
      // tienen, ocultarlos acá los haría desaparecer siempre sin relación
      // con el problema real). Hoy, o cualquier tipo que no sea
      // Entrenamiento, siempre visible.
      if (e.tipo !== 'Entrenamiento' || cmp === 0) return true;
      return !!_evProximas6EntrenIds[e.id]; // futuro sin botón Reservar -- oculto
    }
    // Pasado: aplica a CUALQUIER tipo (pedido explícito -- corrige el
    // alcance "solo Entrenamiento" de la entrada anterior de este MANIFEST).
    if (e.miAsistenciaReal) return true; // asistencia confirmada -- siempre visible
    return (_todasReservas || []).some(function(r) { return r.fecha === e.id; }); // sin reserva -- oculto
  }
  _EV_EVENTOS.filter(function(e) { return _evPasaFiltroLugarTipo(e.lugar, e.tipo) && _evPasaBusqueda(e.lugar + ' ' + e.tipo) && _evEsRelevantePorEquipo(e); })
    .forEach(function(e) { items.push({ fecha: e.fecha, orden: e.horaInicio || '00:00', tipo: 'evento', data: e }); });
  // "Cumpleaños de <nombre>" -- ver "Cambios recientes", bug real: buscar
  // "cumpleaños" no encontraba ninguno porque solo se comparaba contra el
  // nombre de la persona, nunca contra la palabra que en realidad aparece en
  // el título de la card. Mismo texto que `_evCardCumpleHtml()` termina
  // mostrando, para que "encuentra lo que se ve" sea literal.
  _EV_CUMPLEANOS.filter(function(c) { return _evPasaFiltroLugarTipoCumple() && _evPasaBusqueda('Cumpleaños de ' + c.nombre); })
    .forEach(function(c) { items.push({ fecha: c.fecha, orden: '00:00', tipo: 'cumple', data: c }); });
  if (_EV_ANIVERSARIO_INGRESO && _evPasaFiltroLugarTipoCumple()) {
    _EV_ANIVERSARIO_INGRESO.items.forEach(function(a) {
      if (_evPasaBusqueda('Aniversario de entrada al equipo')) {
        items.push({ fecha: a.fecha, orden: '00:01', tipo: 'aniversario', data: a });
      }
    });
  }
  // Temporadas de descanso (Tanda B, ver MANIFEST.md "Cambios recientes") --
  // una sola card por temporada, posicionada en el timeline por su
  // `fechaInicio` (sin importar cuántos días dure). Sin lugar/tipo propios
  // -- no pasan por _evPasaFiltroLugarTipo() (ningún filtro de Lugar/Tipo
  // les aplica, siempre visibles ante esos 2), solo respetan la búsqueda de
  // texto (por nombre), mismo criterio que ya usa cualquier otro item de
  // este timeline.
  _EV_OFFSEASON.filter(function(o) { return _evPasaBusqueda(o.nombre); })
    .forEach(function(o) { items.push({ fecha: o.fechaInicio, orden: '00:00', tipo: 'offseason', data: o }); });
  items.sort(function(a, b) {
    var c = _evFechaCmp(a.fecha, b.fecha);
    return c !== 0 ? c : (a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : 0);
  });
  return items;
}
// Fade al repintar (ver "Cambios recientes" -- pedido explícito: al cambiar
// de mes por swipe/pill, las cards del timeline aparecían de golpe -- mismo
// criterio de transición que ya usa el resto de la app para contenido que se
// reemplaza). `instant` (SIEMPRE explícito en cada llamador, nunca un
// default implícito -- ver cada caso más abajo) solo es `false` en el único
// camino que en verdad cambia de mes (`_evCalIrAFechaEnTimeline()`); todos
// los demás (primera carga, búsqueda en vivo tecla por tecla, togglear un
// chip de filtro, admin agregando una persona) siguen instantáneos como
// antes -- animar esos con el mismo fade se sentiría tarde/parpadeante,
// nadie lo pidió. `alTerminar` (opcional) corre DESPUÉS de que el contenido
// nuevo ya está pintado -- necesario para que quien llame con `instant:
// false` pueda encadenar un scroll (`_evScrollAFecha()`) al elemento recién
// creado sin buscarlo antes de que exista.
var _EV_TIMELINE_FADE_MS = 180;
function _evRenderTimeline(instant, alTerminar) {
  var items = _evTimelineItems();

  var cont = document.getElementById('ev-timeline');
  if (!cont) return;
  if (items.length === 0) {
    _evFadeSwap(cont, function() {
      cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay eventos ni cumpleaños con estos filtros.</div>';
      if (alTerminar) alTerminar();
    }, instant, _EV_TIMELINE_FADE_MS);
    return;
  }
  var porFecha = {}, ordenFechas = [];
  items.forEach(function(it) {
    if (!porFecha[it.fecha]) { porFecha[it.fecha] = []; ordenFechas.push(it.fecha); }
    porFecha[it.fecha].push(it);
  });
  var hoy = _evHoyISO();
  var mesAnterior = null, html = '';
  // Separadores HOY/MAÑANA/PRÓXIMA SEMANA -- bug real corregido: HOY se
  // insertaba con solo `_evFechaCmp(fecha, hoy) >= 0` (el PRIMER grupo
  // futuro-o-presente, sin importar si esa fecha era hoy realmente),
  // mostrando una sección "HOY" vacía seguida directo del próximo evento con
  // contenido cuando no había nada exactamente hoy (ej. solo un evento en 3
  // semanas). Ahora exige coincidencia exacta (`_evFechaCmp(fecha, hoy) === 0`)
  // -- mismo criterio que ya pide el resto del archivo para separadores
  // condicionales: sin match exacto, sin separador. Sigue sin ser `else if`
  // del chequeo de bucket de abajo -- una fecha puede disparar los 2
  // separadores a la vez si HOY tiene contenido Y el primer grupo futuro es
  // directamente mañana. MAÑANA/PRÓXIMA SEMANA ya eran condicionales -- solo
  // aparecen si ese bucket realmente tiene contenido (se registran en
  // `bucketsMostrados` recién cuando efectivamente se inserta uno), sin
  // cambios ahí.
  var insertadoHoy = false, bucketsMostrados = {}, _ingresoMarcado = false;
  var _fechaIngreso = (E.datos && E.datos.fechaIngreso) || null;
  var _mostrarSepIngreso = _fechaIngreso && ordenFechas.length > 0 && _evFechaCmp(_fechaIngreso, ordenFechas[0]) >= 0;
  ordenFechas.forEach(function(fecha) {
    var d = _evParseISO(fecha);
    var mesKey = d.getFullYear() + '-' + d.getMonth();
    // Encabezado de mes ("AGOSTO 2026") como separador de sección -- uno por
    // cada mes real presente en la lista ya ordenada, nunca repetido. Lleva
    // `data-anio`/`data-mes` propios: es lo que lee
    // `_evActualizarNavMesPorScroll()` para actualizar el label de la nav
    // fija según qué encabezado está más arriba visible.
    if (mesKey !== mesAnterior) {
      mesAnterior = mesKey;
      html += '<div class="ev-mes-header" data-anio="' + d.getFullYear() + '" data-mes="' + d.getMonth() + '">' + NOMBRES_MESES[d.getMonth()].toUpperCase() + ' ' + d.getFullYear() + '</div>';
    }
    if (_mostrarSepIngreso && !_ingresoMarcado && _evFechaCmp(fecha, _fechaIngreso) >= 0) {
      _ingresoMarcado = true;
      html += '<div class="ev-hoy-separador ev-ingreso-separador"><span>Te uniste al equipo</span></div>';
    }
    if (!insertadoHoy && _evFechaCmp(fecha, hoy) === 0) {
      // `id` propio (ver "Cambios recientes" -- bug real: el ícono "hoy"
      // scrolleaba al `.ev-fecha-grupo` de hoy, que SÍ tiene su propio
      // `scroll-margin-top` -- pero el separador -HOY- que vive JUSTO
      // ARRIBA en el flujo normal no tenía ninguno propio, así que quedaba
      // parcialmente tapado por la cabecera sticky en vez de terminar pegado
      // arriba del todo como el resto de los saltos de fecha). `_evScrollAFecha()`
      // prioriza este id cuando la fecha pedida es hoy.
      html += '<div class="ev-hoy-separador" id="ev-separador-hoy"><span>HOY</span></div>';
      insertadoHoy = true;
    }
    if (_evFechaCmp(fecha, hoy) > 0) {
      var bucket = _evBucketRelativo(fecha);
      // "ESTA SEMANA" (ver "Cambios recientes", nuevo) solo se muestra si NO
      // hubo nada mañana -- `ordenFechas` ya viene ordenado ascendente, así
      // que si mañana tuvo contenido, `bucketsMostrados['MAÑANA']` ya está en
      // `true` para cuando el recorrido llega acá (pedido explícito: con
      // "Mañana" ya mostrado, no hace falta este separador extra).
      if (bucket === 'ESTA SEMANA' && bucketsMostrados['MAÑANA']) bucket = null;
      if (bucket && !bucketsMostrados[bucket]) {
        bucketsMostrados[bucket] = true;
        html += '<div class="ev-hoy-separador"><span>' + bucket + '</span></div>';
      }
    }
    // Badge de fecha estilo Google Calendar: abreviatura de día (3 letras) +
    // número en círculo, relleno de marca solo si es hoy. `data-iso` lo usa
    // `_evFechaGrupoMasCercano()` (_evScrollAFecha()) para caer al grupo real
    // más cercano cuando la fecha exacta pedida no tiene contenido propio.
    html += '<div class="ev-fecha-grupo" id="ev-fecha-' + fecha + '" data-iso="' + fecha + '">' +
      '<div class="ev-fecha-badge">' +
        '<div class="ev-fecha-badge-dia">' + _EV_DIAS_CORTOS[(d.getDay() + 6) % 7] + '</div>' +
        '<div class="ev-fecha-badge-num' + (fecha === hoy ? ' ev-fecha-badge-hoy' : '') + '">' + d.getDate() + '</div>' +
      '</div>' +
      '<div class="ev-fecha-items">' +
        porFecha[fecha].map(function(it) {
          return it.tipo === 'cumple' ? _evCardCumpleHtml(it.data) : it.tipo === 'aniversario' ? _evCardAniversarioHtml(it.data) : it.tipo === 'offseason' ? _evCardOffseasonHtml(it.data) : _evTimelineFilaHtml(it.data);
        }).join('') +
      '</div>' +
    '</div>';
  });
  // Bug real corregido (mismo fix que la condición de arriba): este
  // fallback agregaba un "HOY" vacío al FINAL de toda la lista cuando
  // ninguna fecha coincidía exacto con hoy -- pensado originalmente para el
  // caso "todo pasado, nada hoy/futuro" (ahí sí tenía sentido un ancla al
  // final), pero disparaba igual con contenido futuro real más abajo (ej. un
  // solo evento a 3 semanas): la sección "HOY" aparecía sin nada debajo,
  // después de todo el resto del timeline. Se elimina sin reemplazo -- sin
  // match exacto, sin separador, en cualquier posición (mismo criterio ya
  // aplicado arriba). `_evScrollAFecha()` ya reemplaza sola el "HOY"
  // faltante por el grupo real más cercano vía `_evFechaGrupoMasCercano()`
  // cuando no hay contenido exacto de hoy, sin depender de este marcador.
  _evFadeSwap(cont, function() {
    cont.innerHTML = html;
    _evUpdateRsvpSliders(false);
    _evHidratarAvatares();
    // Confetti contenido dentro de la card, SOLO para el cumpleaños de HOY --
    // mismo criterio/mecanismo de siempre (_evLanzarConfettiCuandoVisible()),
    // sin guard de "ya se mostró": `cont.innerHTML = html` de arriba siempre
    // crea un nodo DOM nuevo para la card, así que disparar acá es "un nodo
    // nuevo = un confetti nuevo", sin estado que mantener sincronizado.
    if (porFecha[hoy]) {
      porFecha[hoy].forEach(function(it) {
        if (it.tipo !== 'cumple' && it.tipo !== 'aniversario') return;
        var el = document.getElementById('ev-confetti-' + it.data.id);
        if (el) _evLanzarConfettiCuandoVisible(el);
      });
    }
    // Los encabezados de mes recién se insertaron -- resincroniza el label de
    // la nav fija con el nuevo DOM (ej. un filtro nuevo pudo haber sacado del
    // timeline el mes que el label estaba mostrando).
    _evActualizarNavMesPorScroll();
    if (alTerminar) alTerminar();
  }, instant, _EV_TIMELINE_FADE_MS);
}

/* ── Detalle de un evento (ver "Cambios recientes" — reemplaza el bottom
   sheet ev-detalle-sheet/cerrarEvDetalle() por una pantalla de PANTALLA
   COMPLETA nueva, s-eventos-detalle, con el mismo mecanismo ir()/
   TOP_BAR_CONFIG que ya usa el resto de la app (flecha atrás + título,
   volver:'s-eventos') — no un modal ni bottom sheet. La modal de asistentes
   de la tanda anterior se elimina del todo: su contenido (desglose de 4
   grupos) pasa a vivir inline en esta pantalla, ver _evRenderDetalle().
   `_evDetalleActual` guarda el evento que se está mostrando -- lo lee el
   `titulo` de TOP_BAR_CONFIG (dinámico, mismo patrón que 's4') y
   _evMarcarAsistencia() para refrescar el resumen de conteos in-place si la
   barra de RSVP de esta misma pantalla cambia de opción. */
var _evDetalleActual = null;
// Scroll del timeline (ver "Cambios recientes" -- `_evRestaurarScrollTimeline`
// nació como "_evVolviendoDeDetalle", solo para volver de un detalle; se
// generalizó para cubrir TAMBIÉN volver a Eventos por nav inferior en una
// sesión que ya lo había visitado antes, mismo mecanismo, 2 disparadores
// distintos). `_evGuardarScrollTimeline()` guarda la posición actual --
// llamada desde `abrirEvDetalle()` (al entrar a un detalle) y desde el
// `alSalir()` de Eventos en `APP_BOTTOM_NAV_ITEMS` (js/ui.js, al abandonar
// la sección por CUALQUIER vía, no solo un detalle). `_evRestaurarScrollTimeline`
// se arma en cualquiera de esos 2 disparadores -- el consumidor único sigue
// siendo el hook centralizado en `ir()` (js/ui.js, mismo lugar que ya usa el
// fix del indicador de RSVP) que lo lee y apaga una sola vez, cubriendo
// cualquier camino de entrada a `s-eventos` por igual (botón "atrás", gesto
// nativo/popstate, o nav inferior). `irEventos()` lo apaga en su flujo de
// PRIMERA vez (reset completo) para que esa entrada fresca no restaure una
// posición vieja de una sesión anterior.
var _evTimelineScrollY = 0;
var _evRestaurarScrollTimeline = false;
function _evGuardarScrollTimeline() { _evTimelineScrollY = window.scrollY; }
function abrirEvDetalle(id) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  _evGuardarScrollTimeline();
  _evRestaurarScrollTimeline = true;
  _evDetalleActual = ev;
  _evRenderDetalle(ev);
  ir('s-eventos-detalle');
  // Bug real de esta sesión (2do intento -- el 1ro, `_evDetalleActualizarSticky()`
  // síncrono más abajo, era real pero NO era la causa de este síntoma en
  // particular): instrumentado con Playwright antes de tocar nada, en los 4
  // momentos exactos pedidos -- `scrollY` queda IDÉNTICO (900 en la prueba)
  // en los 2 checkpoints alrededor de `_evRenderDetalleAsistencia()`
  // (síncrono en este build, sin fetch real todavía -- Tanda 2), confirmando
  // que la carga de asistentes no toca el scroll para nada. El culpable real:
  // `ir()` (js/ui.js) dispara SIEMPRE `scrollTo({top:0, behavior:'smooth'})`
  // sin importar la pantalla -- si el usuario estaba lejos scrolleado en el
  // timeline, esa animación tarda ~400ms en decaer suavemente hasta 0,
  // VISIBLE encima de la pantalla de detalle ya mostrada (confirmado
  // muestreando `scrollY` cada ~12ms: rampa lenta 545→0, no un salto). Se
  // siente como que el contenido "jala" porque, de hecho, literalmente lo
  // hace -- unos 400ms de scroll animado que nadie pidió, no relacionado con
  // ningún crecimiento de contenido. Mismo criterio que ya usa
  // `irEventos()` para su propia entrada (`_evScrollAFecha(hoy, true)`,
  // instant a propósito, mismo comentario ahí): entrar a una pantalla nueva
  // debe pararse en su posición inicial de una, no animar un scroll que el
  // usuario no disparó.
  window.scrollTo(0, 0);
  // Bug real (ver "Cambios recientes"): `_evDetalleActualizarSticky()` vivía
  // en el mismo `setTimeout(50)` que `_evUpdateRsvpSliders()` de abajo,
  // "por si acaso" -- de más, y con costo real: durante esos ~50ms el RSVP y
  // el grid de estadísticas (niveles 2/3 del sticky) se veían saltados a un
  // `top` muy fuera de lugar (confirmado con Playwright, `getBoundingClientRect()`
  // -300px+ antes del fix) porque nunca habían tenido un `top` propio
  // asignado, y recién LUEGO saltaban de golpe a su posición real. Leer
  // `offsetHeight` FUERZA un reflow síncrono -- `ir()`, unas líneas arriba,
  // ya sacó la pantalla de `display:none`, así que llamar esto ACÁ MISMO
  // (sin ningún `setTimeout`) ya mide valores reales, sin ventana de tiempo
  // en la que se vea la posición vieja/rota.
  _evDetalleActualizarSticky();
  // `_evUpdateRsvpSliders()` SÍ sigue necesitando el setTimeout -- motivo
  // distinto (bug real aparte, ya documentado): entrar al detalle con un
  // estado ya elegido desde la card dejaba el indicador sin su fondo sólido
  // (offsetWidth/offsetLeft de la opción activa medidos en 0).
  setTimeout(function() { _evUpdateRsvpSliders(false); }, 50);
}
// Sticky de 3 niveles apilados (ver "Cambios recientes"): nav (ya sticky por
// CSS, top:0, sin pills desde el rediseño -- ver _evDetalleStickyHtml())
// -> barra de RSVP -> grid de 4 tarjetas de estadística, cada uno pegado
// justo debajo del anterior. El `top` de los niveles 2 y 3 se calcula acá a
// partir de `offsetHeight` REAL del nivel anterior (nunca un valor fijo) --
// así un contenido más alto de lo normal en cualquier nivel (ej. el tipo/
// fecha-hora del nivel 1 envolviendo a 2 líneas en una pantalla angosta)
// empuja correctamente a los niveles siguientes sin superponerse ni dejar
// hueco. Se re-llama después de cualquier render que pueda cambiar la
// altura de los niveles 1/2 (abrir un evento nuevo, o el viewport
// cambiando de tamaño/orientación).
// `_EV_STICKY_SOLAPE` (ver "Cambios recientes" -- bug real reportado: costura
// de ~1px visible en la unión entre niveles al scrollear, línea en oscuro/
// sombra en claro) -- `offsetHeight` redondea a entero, pero el alto
// REALMENTE renderizado (`getBoundingClientRect().height`, el que la
// pantalla pinta) puede ser fraccionario -- en un dispositivo con
// `devicePixelRatio` alto (la mayoría de los celulares reales, no
// necesariamente el desktop donde se armó/probó originalmente) ese
// redondeo alcanza a dejar un hueco subpíxel real entre el borde inferior
// de un nivel y el `top` que se le asignó al siguiente, por el que se
// filtra el fondo de atrás. Cada nivel se solapa 1px hacia ARRIBA contra el
// anterior en vez de quedar pegado exacto -- inofensivo (nivel 1 tiene
// z-index más alto que nivel 2, que a su vez es más alto que nivel 3, así
// que el de arriba siempre pinta encima del solape, sin recortar contenido
// real: el solape cae dentro del padding de cada nivel, no sobre texto) y
// elimina el hueco sin importar el redondeo del navegador.
var _EV_STICKY_SOLAPE = 1;
function _evDetalleActualizarSticky() {
  var pantalla = document.getElementById('s-eventos-detalle');
  if (!pantalla || !pantalla.classList.contains('activa')) return;
  var nivel1 = document.getElementById('ev-detalle-sticky');
  var nivel2 = document.getElementById('ev-detalle-rsvp');
  var nivel3 = document.getElementById('ev-detalle-stats');
  if (!nivel1 || !nivel2 || !nivel3) return;
  var h1 = nivel1.offsetHeight;
  nivel2.style.top = (h1 - _EV_STICKY_SOLAPE) + 'px';
  var h2 = nivel2.offsetHeight;
  nivel3.style.top = (h1 + h2 - _EV_STICKY_SOLAPE * 2) + 'px';
}
window.addEventListener('resize', function() { _evDetalleActualizarSticky(); });
// Estructura en secciones (`.ev-detalle-section`, cada una su propio
// contenedor #id) a propósito -- pedido explícito: dejar espacio para sumar
// secciones futuras (editar evento admin, tareas, mensajes) como nuevos
// `.ev-detalle-section` hermanos, sin reordenar/rehacer lo que ya existe.
function _evRenderDetalle(ev) {
  var sticky = document.getElementById('ev-detalle-sticky');
  if (sticky) sticky.innerHTML = _evDetalleStickyHtml(ev);
  var info = document.getElementById('ev-detalle-info');
  if (info) info.innerHTML = _evDetalleInfoHtml(ev);
  var rsvpCont = document.getElementById('ev-detalle-rsvp');
  // `_evRsvpBarraHtml(ev)` devuelve '' (falsy) para Cancelado/No se entrena
  // (mismo guard que `_evRsvpBotonHtml()`, ver ese comentario) -- antes esta
  // pantalla se quedaba con la sección de RSVP vacía en esos 2 casos, sin
  // ningún indicador de por qué. `_evDetalleEstadoNotaHtml()` (ver "Cambios
  // recientes") llena ese hueco reusando la misma pill que ya muestra la
  // card (`_evEstadoNotaPillHtml()`) -- para un evento normal,
  // `_evRsvpBarraHtml(ev)` siempre gana (truthy), el fallback
  // nunca se evalúa.
  // Excepción real (ver "Cambios recientes", `_evOcultarRsvpPorEquipoClub()`
  // más arriba): acá SÍ hace falta chequearla aparte antes del `||` -- ese
  // caso también deja `_evRsvpBarraHtml(ev)` en `''` (mismo motivo: no hay
  // selector que mostrar), pero caer a `_evDetalleEstadoNotaHtml()` sería
  // incorrecto -- esa función arma una pill de ESTADO del evento (Cancelado/
  // No se entrena), no tiene ningún caso para "ocultado por equipamiento
  // propio del club" y mostraría la nota equivocada (o vacía sin sentido);
  // acá directamente no debe quedar NADA, ni selector ni nota, mismo pedido
  // que para la card.
  // `_evUpdateRsvpSliders()` NO se llama acá -- la pantalla
  // todavía está display:none en este punto (ver abrirEvDetalle(), que la
  // llama recién después de ir()); medir offsetWidth/offsetLeft acá daría 0
  // y dejaría el indicador sin su fondo sólido pintado.
  var cancelado = (ev.estado === 'Cancelado' || ev.estado === 'No se entrena');
  var _preIngresoDetalle = E.datos && E.datos.fechaIngreso && _evFechaCmp(ev.fecha, E.datos.fechaIngreso) < 0;
  var _noAsistioDetalle = !ev.miAsistenciaReal || ev.miAsistenciaReal === 'Ausente';
  // "Rectificar asistencia" (ver _evDetalleInfoHtml(), bloque debajo de la
  // descripción) ya pinta esta misma pill (_evAsistenciaRealHtml()) para este
  // mismo caso -- mismo guard exacto, para no mostrarla 2 veces en la misma
  // pantalla. `_evRsvpBarraHtml(ev)` seguiría devolviendo esta pill acá
  // también si no se saltea (ver su propio `if (_evEsPasado(e)) return
  // _evAsistenciaRealHtml(e);`, arriba en este archivo).
  var _yaMostradaEnInfo = _evEsPasado(ev) && ev.miAsistenciaReal && ev.miAsistenciaReal !== 'Sin registrar';
  if (rsvpCont) rsvpCont.innerHTML = cancelado
    ? _evDetalleEstadoNotaHtml(ev)
    : (_yaMostradaEnInfo ? '' : (_preIngresoDetalle && _noAsistioDetalle ? '' : (_evOcultarRsvpPorEquipoClub(ev) ? '' : (_evRsvpBarraHtml(ev) || _evDetalleEstadoNotaHtml(ev)))));
  _evRenderDetalleAsistencia(ev);
}
// Mismo componente que la card (`_evEstadoNotaPillHtml()`, más arriba en
// este archivo) para Cancelado/No se entrena -- reuso literal, no una
// implementación paralela (ver "Cambios recientes"). Llena la sección de
// RSVP, que si no quedaría vacía sin ningún indicador de por qué.
function _evDetalleEstadoNotaHtml(e) {
  if (e.estado === 'Cancelado' || e.estado === 'No se entrena') return _evEstadoNotaPillHtml(e.estado);
  return '';
}
// `adminCancelarEvento` -- el criterio "escrituras de Eventos van por
// apiPost()/POST" que este comentario daba por verificado (apoyado en
// `adminMarcarAsistencia`, más arriba en este archivo) resultó FALSO para
// esta acción puntual: el backend (Code.gs, fuera de este repo) sólo tiene
// `adminCancelarEvento` en el router de `doGet(e)`, no en `doPost(e)` --
// por eso el toast "Acción POST no válida" y el evento nunca se
// cancelaba. Mismo patrón ya visto varias veces con acciones de Tareas
// (TODAS -- lectura y escritura -- viven en el router de GET). Arreglo:
// `api()`/GET, igual que `adminGetRosterEquipo`/`adminBuscarPersonasParaEvento`
// más arriba en este archivo -- `adminToken` viaja como param de la query,
// no del body. Optimista + revert (mismo criterio que
// `_evMarcarAsistenciaAdmin()`, arriba en este archivo) -- `ev` es el MISMO
// objeto referenciado por `_evDetalleActual` (ver `abrirEvDetalle()`), así
// que mutarlo acá alcanza para que `_evRenderDetalle()` refleje el cambio
// en las 2 secciones (RSVP y esta) sin tener que sincronizar 2 variables.
// Bug real corregido (ver MANIFEST.md "Cambios recientes" -- reportado como
// "cancelar un evento y volver al timeline lo sigue mostrando como si no
// estuviera cancelado, hasta un refresh completo"): investigado ANTES de
// asumir el fix -- `ev` acá es el MISMO objeto referenciado por `_EV_EVENTOS`
// (mismo criterio que el resto de esta función, ver comentario original de
// más abajo), así que `ev.estado = 'Cancelado'` YA deja el array local
// correcto de inmediato -- ese no era el problema. La causa real es que
// `volver('s-eventos')` (el botón atrás del detalle) es un simple `ir()`
// (js/ui.js): togglea qué `.pantalla` está visible, pero NUNCA vuelve a
// pintar el timeline -- el DOM de `#ev-timeline` seguía siendo el HTML
// generado ANTES de cancelar (con RSVP habilitado, sin la pill de estado),
// aunque los DATOS ya estuvieran al día. Un refresh completo "arregla" esto
// solo porque re-arma todo desde cero. Fix: `_evRenderTimeline(true)`
// (instant, sin fade) acá mismo, ANTES de volver -- repinta `#ev-timeline`
// con los datos ya actualizados mientras la pantalla puede estar oculta
// (`#s-eventos` no necesita estar activa para esto, mismo criterio que
// `_tarCargarTodo()` ya usa en Tareas: mantener el DOM en segundo plano
// sincronizado, no solo lo que se ve en este instante) -- para cuando el
// usuario efectivamente vuelve, la card ya está correcta, sin esperar a la
// próxima carga real de la sección.
// Ya NO pide confirmación acá adentro (era un `confirm()` nativo) -- la
// confirmación vive en `#ev-sheet-cancelar` (index.html)/
// `_evConfirmarCancelarEvento()` (abajo), disparada por el ícono
// `event_busy` del nav (`_evDetalleStickyHtml()`, más abajo en este
// archivo) en vez del botón que vivía al fondo de la pantalla. Para cuando
// se llega acá, la confirmación ya pasó.
function _evCancelarEvento(idEvento, btn) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === idEvento; })[0];
  if (!ev) return;
  if (btn) btn.disabled = true;
  var estadoAnterior = ev.estado;
  ev.estado = 'Cancelado';
  if (_evDetalleActual && _evDetalleActual.id === idEvento) _evRenderDetalle(ev);
  _evRenderTimeline(true);
  api({ action: 'adminCancelarEvento', adminToken: _adminToken, idEvento: idEvento }, function(res) {
    if (res && res.exito === false) {
      ev.estado = estadoAnterior;
      if (btn) btn.disabled = false;
      if (_evDetalleActual && _evDetalleActual.id === idEvento) _evRenderDetalle(ev);
      _evRenderTimeline(true);
      mostrarToast(res.error || 'No se pudo cancelar el evento.', 'error');
    }
  }, function(e) {
    ev.estado = estadoAnterior;
    if (btn) btn.disabled = false;
    if (_evDetalleActual && _evDetalleActual.id === idEvento) _evRenderDetalle(ev);
    _evRenderTimeline(true);
    mostrarToast((e && e.message) || 'No se pudo cancelar el evento.', 'error');
  });
}
/* ── Sheet de confirmación "Cancelar evento" (#ev-sheet-cancelar,
   index.html) -- mismo patrón abrir/cerrar que el resto de la app (ver
   `abrirSheetFotoPerfil()`/`cerrarSheetFotoPerfil()`, js/foto.js, o
   `ajAbrirSheetLogout()`/`ajCerrarSheetLogout()`, js/perfil.js): display
   block + transform vía doble rAF al abrir, `_registrarOverlayAbierto()`
   para que el botón atrás del navegador (o el swipe-to-dismiss de
   shared/bsheet.js) lo cierre igual que a cualquier otro sheet. El id del
   evento pendiente viaja en `_evCancelarPendienteId` (variable de módulo,
   mismo criterio que `_tarEliminarTareaIdPendiente` en js/tareas.js) en vez
   de un data-attribute -- el sheet es único, no hay 2 instancias abiertas a
   la vez que puedan pisarse. */
var _evCancelarPendienteId = null;
function _evAbrirSheetCancelar(idEvento) {
  _evCancelarPendienteId = idEvento;
  var ov = document.getElementById('ev-sheet-cancelar-overlay');
  var sh = document.getElementById('ev-sheet-cancelar');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(_evCerrarSheetCancelar);
}
function _evCerrarSheetCancelar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var ov = document.getElementById('ev-sheet-cancelar-overlay');
  var sh = document.getElementById('ev-sheet-cancelar');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
var _evBorrarPendienteId = null;
function _evAbrirSheetBorrar(idEvento) {
  _evBorrarPendienteId = idEvento;
  var ov = document.getElementById('ev-sheet-borrar-overlay');
  var sh = document.getElementById('ev-sheet-borrar');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(_evCerrarSheetBorrar);
}
function _evCerrarSheetBorrar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var ov = document.getElementById('ev-sheet-borrar-overlay');
  var sh = document.getElementById('ev-sheet-borrar');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
/* ── "Rectificar asistencia" (usuario no-admin, #ev-rect-sheet, index.html) --
   mismo patrón abrir/cerrar que _evAbrirSheetCancelar()/_evAbrirSheetBorrar()
   arriba: `_evRectIdEvento` viaja como variable de módulo (sheet único, sin
   instancias paralelas), _registrarOverlayAbierto() para que el botón atrás
   del navegador o el swipe-to-dismiss lo cierren igual que a cualquier otro
   sheet. `_evRectEstadoElegido` guarda la opción tocada del sheet
   (.ev-rect-opt[data-estado]) hasta que se confirma con "Enviar
   rectificación". */
var _evRectIdEvento = null;
var _evRectEstadoElegido = null;
function _evAbrirRectSheet(idEvento) {
  _evRectIdEvento = idEvento;
  _evRectEstadoElegido = null;
  document.querySelectorAll('.ev-rect-opt').forEach(function(b) { b.classList.remove('activa'); });
  var btnEnviar = document.getElementById('ev-rect-btn-enviar');
  if (btnEnviar) btnEnviar.disabled = true;
  var ov = document.getElementById('ev-rect-sheet-overlay');
  var sh = document.getElementById('ev-rect-sheet');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(_evCerrarRectSheet);
}
function _evCerrarRectSheet(porGesto) {
  if (!porGesto) { history.back(); return; }
  var ov = document.getElementById('ev-rect-sheet-overlay');
  var sh = document.getElementById('ev-rect-sheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
function _evRectElegir(btn) {
  document.querySelectorAll('.ev-rect-opt').forEach(function(b) { b.classList.remove('activa'); });
  btn.classList.add('activa');
  _evRectEstadoElegido = btn.getAttribute('data-estado');
  var btnEnviar = document.getElementById('ev-rect-btn-enviar');
  if (btnEnviar) btnEnviar.disabled = false;
}
function _evEnviarRectificacion(btn) {
  if (!_evRectIdEvento || !_evRectEstadoElegido) return;
  var id = _evRectIdEvento;
  var estado = _evRectEstadoElegido;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  apiPost({ action: 'solicitarRectificacionAsistencia', token: _token, idEvento: id, estadoSolicitado: estado }, function(res) {
    if (res && res.exito) {
      _evCerrarRectSheet();
      mostrarToast('Solicitud enviada. Un administrador la revisará pronto.');
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar rectificación'; }
      mostrarToast((res && res.error) || 'Error al enviar la solicitud.', 'error');
    }
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar rectificación'; }
    mostrarToast((e && e.message) || 'Error al enviar la solicitud.', 'error');
  });
}
function _evConfirmarBorrarEvento(btn) {
  if (!_evBorrarPendienteId) return;
  var id = _evBorrarPendienteId;
  _evBorrarPendienteId = null;
  _evCerrarSheetBorrar();
  if (btn) { btn.disabled = true; btn.textContent = 'Eliminando...'; }
  api({ action: 'adminBorrarEvento', adminToken: _adminToken, idEvento: id }, function() {
    _EV_EVENTOS = _EV_EVENTOS.filter(function(e) { return e.id !== id; });
    _evRenderTimeline(true);
    volver('s-eventos');
    mostrarToast('Evento eliminado.', 'ok');
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
    mostrarToast((e && e.message) || 'Este evento no pudo ser eliminado.', 'error');
  });
}
// Botón "Confirmar cancelación" del sheet -- cierra primero (mismo orden que
// `ajConfirmarSheetTexto()`, js/perfil.js: acá no hay una navegación
// síncrona en el medio como la que forzó el orden inverso en
// `_tarEliminarTareaConfirmar()`, así que alcanza con este orden simple) y
// recién ahí dispara `_evCancelarEvento()`, la misma lógica optimista de
// siempre, sin duplicarla.
function _evConfirmarCancelarEvento(btn) {
  if (!_evCancelarPendienteId) return;
  var idEvento = _evCancelarPendienteId;
  _evCancelarPendienteId = null;
  _evCerrarSheetCancelar();
  _evCancelarEvento(idEvento, btn);
}
// Nav compacta sticky (ver "Cambios recientes" -- reemplaza el #top-bar
// genérico para esta pantalla, ver TOP_BAR_CONFIG/js/ui.js): flecha atrás
// (mismo `.app-nav-back` reusado, con su propio onclick acá ya que no hay
// #top-bar detrás que se lo dé) + ícono de tipo SUELTO (sin el cuadrado de
// fondo de `.ev-detalle-icon-grande` -- pedido explícito: no competir
// visualmente con el botón circular de la flecha) + tipo/fecha-hora. Sin
// pills (ver "Cambios recientes" -- rediseño, las 4 se unificaron en
// _evDetalleInfoHtml(), afuera del sticky) -- este nivel 1 queda liviano a
// propósito, mide menos alto que antes.
// Ícono "Editar evento" (admin, ver MANIFEST.md "Cambios recientes" -- flujo
// de edición para admin, reemplaza el bottom sheet #ev-editar-sheet de la
// tanda anterior por completo) -- lado derecho, mismo patrón que usan otras
// pantallas para acciones del top bar (`.app-nav-actions > .app-nav-icon-btn`,
// css/nav.css, ver TOP_BAR_CONFIG en js/ui.js para el resto de ejemplos)
// aunque esta pantalla no pase por TOP_BAR_CONFIG (nav propia, ver arriba).
// `.ev-detalle-nav-texto` suma `flex:1` (css/eventos.css) para empujar este
// bloque al borde derecho de `.ev-detalle-nav-row`. Navega a
// `#s-eventos-editar` vía `_evEditarAbrir()` (más abajo en este archivo), que
// arma el estado inicial del flujo antes de `ir()`.
// Ícono "Cancelar evento" (admin, ver "Cambios recientes" -- reemplaza al
// botón `.btn-danger` que vivía al fondo del contenido scrolleable,
// `_evDetalleAdminCancelarHtml()`, eliminada) -- mismo `.app-nav-icon-btn`
// que "Editar evento", con el modificador `-danger` (css/nav.css, mismo
// criterio que `-brand`: solo cambia el color, nunca la forma/tamaño) para
// distinguirlo como acción destructiva a simple vista. `event_busy` en vez
// de `cancel` -- se reserva ese ícono para el estado YA cancelado
// (`_evEstadoNotaPillHtml()`), evitar el mismo glifo acá habría sido
// ambiguo (¿acción o estado?). Mismo guard que la sección vieja
// (`e.estado !== 'Cancelado'`) -- un evento ya cancelado no tiene nada más
// que cancelar. Abre el sheet de confirmación en vez de cancelar directo
// (`_evAbrirSheetCancelar()`, arriba en este archivo).
function _evDetalleStickyHtml(ev) {
  var acciones = '';
  if (_adminToken) {
    acciones += '<button type="button" class="app-nav-icon-btn" onclick="_evEditarAbrir()" title="Editar evento" aria-label="Editar evento"><span class="material-symbols-outlined">edit</span></button>';
    acciones += '<button type="button" class="app-nav-icon-btn app-nav-icon-btn-danger" onclick="_evAbrirSheetBorrar(\'' + ev.id + '\')" title="Eliminar evento" aria-label="Eliminar evento"><span class="material-symbols-outlined">delete</span></button>';
    if (ev.estado !== 'Cancelado') {
      acciones += '<button type="button" class="app-nav-icon-btn app-nav-icon-btn-danger" onclick="_evAbrirSheetCancelar(\'' + ev.id + '\')" title="Cancelar evento" aria-label="Cancelar evento"><span class="material-symbols-outlined">event_busy</span></button>';
    }
  }
  return '<div class="ev-detalle-nav-row">' +
      '<button class="app-nav-back" onclick="volver(\'s-eventos\')" title="Volver"><span class="material-symbols-outlined">arrow_back</span></button>' +
      '<span class="material-symbols-outlined ev-detalle-nav-icono">' + (_EV_ICONOS[ev.tipo] || 'event') + '</span>' +
      '<div class="ev-detalle-nav-texto">' +
        '<div class="ev-detalle-tipo">' + ev.tipo + '</div>' +
        '<div class="ev-detalle-fechahora">' + _evFechaCompleta(ev.fecha) + '</div>' +
      '</div>' +
      (acciones ? '<div class="app-nav-actions">' + acciones + '</div>' : '') +
    '</div>';
}
// Las 3 pills juntas -- Ubicación/Inicio/Fin, ver "Cambios recientes" --
// corrección de orden + fusión + recorte: antes Inicio/Lugar/"Cómo
// llegar"/Fin/Duración (5 pills, con el link a Maps viviendo aparte de
// Lugar). Ahora Ubicación (`.fi-pill-lugar`) ES el link clickeable (mismo
// patrón `<a href="mapsUrl">` que antes usaba solo "Cómo llegar", fusionado
// acá en vez de vivir aparte -- sin mapsUrl, cae a `<span>` no clickeable,
// mismo criterio de siempre), y la pill de Duración se saca del todo
// (redundante con Inicio+Fin, ya visibles) -- CERO clases `.ev-detalle-pill*`
// propias (reuso LITERAL de `.fi-pill*`/`.fi-pills`, css/reservas.css,
// mismas clases que usa el panel "Más información" de Reservas). Todas acá,
// afuera del sticky, scrollean con el resto del contenido.
function _evDetalleInfoHtml(ev) {
  var desc = ev.descripcion || _EV_DESCRIPCION_POR_TIPO[ev.tipo] || '';
  var mapsUrl = ev.mapsUrl || _EV_MAPS_URL_POR_LUGAR[ev.lugar] || '';
  var videoInstructivo = ev.videoInstructivo || '';
  var html = '<div class="fi-pills">' +
      (mapsUrl
        ? '<a class="fi-pill fi-pill-lugar" href="' + mapsUrl + '" target="_blank" rel="noopener"><span class="material-symbols-outlined">location_on</span>' + ev.lugar + '</a>'
        : '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + ev.lugar + '</span>') +
      (videoInstructivo ? '<a class="fi-pill fi-pill-video" href="' + videoInstructivo + '" target="_blank" rel="noopener"><span class="material-symbols-outlined">play_circle</span>Video instructivo</a>' : '') +
      '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + ev.horaInicio + 'hs</span>' +
      '<span class="fi-pill fi-pill-fin"><span class="material-symbols-outlined">schedule</span>Fin ' + _evHoraFin(ev) + 'hs</span>' +
    '</div>' +
    (desc ? '<p class="ev-detalle-desc">' + desc + '</p>' : '');
  // Botón "Cancelar o re - agendar" (mirlxs, ver "Cambios recientes")
  // -- justo debajo de la descripción, pedido explícito de ubicación (antes
  // vivía en una sección propia al final de la pantalla, después de
  // Asistencia -- se saca esa sección entera, esto la reemplaza). Mismo
  // gate/match que el chip de la card (`_evCardEventoHtml()`, más arriba):
  // reserva activa (no 'Cancelada') sobre ESTE evento puntual, sin botón
  // para 'Reagendar' (esa reserva ya está cancelada de fondo, "clase a
  // favor", sin acción real que ofrecer sobre este evento en particular).
  var miReservaInfo = ev.tipo === 'Entrenamiento' ? (_todasReservas || []).filter(function(r) { return r.fecha === ev.id && r.estado !== 'Cancelada'; })[0] : null;
  if (miReservaInfo && miReservaInfo.estado !== 'Reagendar') {
    html += _evBtnCancelarReagendarHtml(ev, 'ev-detalle-btn-cancelar');
  }
  if (miReservaInfo && _evNecesitaEquipo()) {
    var _tallaActualDet = (E.datos && E.datos.talla) ? E.datos.talla : '';
    var _fechaDetTxt = _evFechaCompleta(ev.fecha).replace(/'/g, "\\'");
    var _evIdEsc = String(ev.id).replace(/'/g, "\\'");
    var _tallaEsc = _tallaActualDet.replace(/'/g, "\\'");
    html += '<button type="button" class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="abrirSheetTalla(\'' + _fechaDetTxt + '\',\'' + _evIdEsc + '\',\'' + _tallaEsc + '\')"><span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;margin-right:4px;">straight</span>Cambiar talla para esta reserva</button>';
  }
  // "Rectificar asistencia" (usuario no-admin) -- ver MANIFEST.md, justo
  // debajo de la descripción del evento. Repite la pill de
  // `_evAsistenciaRealHtml(ev)` a propósito (la sección #ev-detalle-rsvp más
  // abajo ya la muestra también vía _evRsvpBarraHtml() para eventos pasados)
  // porque acá es el ancla visual del botón "Rectificar asistencia" -- pedido
  // explícito de Victor sobre la ubicación exacta del bloque.
  if (_evEsPasado(ev) && ev.miAsistenciaReal && ev.miAsistenciaReal !== 'Sin registrar') {
    html += '<div class="ev-detalle-section" style="padding-top:0">';
    html += _evAsistenciaRealHtml(ev);
    if (!_adminToken && (ev.miAsistenciaReal === 'A tiempo' || ev.miAsistenciaReal === 'Tarde' || ev.miAsistenciaReal === 'Ausente')) {
      html += '<button type="button" class="ev-stat-marcar" onclick="_evAbrirRectSheet(\'' + ev.id + '\')"><span class="material-symbols-outlined">edit</span>Rectificar asistencia</button>';
    }
    html += '</div>';
  }
  return html;
}

/* ═══════════════════════════════════════════════════════
   "Editar evento" (admin, ver MANIFEST.md "Cambios recientes") --
   #s-eventos-editar, pantalla de página completa (REEMPLAZA por completo el
   bottom sheet #ev-editar-sheet de la tanda anterior, eliminado de
   index.html) -- mismo criterio que #s-eventos-crear/#s-eventos-anticipada:
   un flujo con 2 "pasos" reales (campos a editar -> a cuáles eventos aplica)
   se siente mejor como pantalla propia que apretado en un sheet. Header
   propio (#ev-editar-header, .app-nav.app-nav-sticky, sin entrada en
   TOP_BAR_CONFIG -- mismo motivo que #s-eventos-marcar-asistencia/
   #s-eventos-anticipada) + footer fijo #cta-footer-s-eventos-editar
   (.cta-footer-fixed, hijo directo de <body>, mostrado/ocultado solo por
   `ir()` vía su id -- ver "Reglas globales del proyecto" § CTA footer).

   Paso 0 (#ev-editar-paso-campos, `.salud-paso` -- mismo motor de 2 pasos
   que #s-eventos-crear, `_EV_EDITAR_PASOS`/`_evEditarMostrarPaso()`, MISMA
   transición fade/slide `smoothSlideUp` vía la clase reusada, sin CSS
   nuevo): 3 filas editables (Lugar/Horario/Descripción), cada una un
   `.ev-ant-acc-header`/`.ev-ant-acc-body` REUSADO tal cual del acordeón de
   Asistencia anticipada (mismo chrome/mecánica de expandir -- max-height +
   opacity + chevron que rota) pero SIN el criterio "una sola abierta a la
   vez": `_evEditarToggleCampo()` nunca cierra las otras, las 3 se expanden y
   editan en cualquier orden/combinación (pedido explícito). El valor
   colapsado (`.ev-ant-acc-resumen`, mismo slot) lleva el modificador nuevo
   `.ev-editar-valor-original` (css/eventos.css) cuando el campo NO tiene un
   cambio pendiente (color neutro, `--text-2`) -- se saca esa clase apenas
   hay un cambio real, cayendo al color brand ya default de
   `.ev-ant-acc-resumen`, el "indicador sutil de modificado" pedido.
   `_evEditarCambios` guarda SOLO los campos con un valor distinto al
   original (`_evEditarOriginal`) -- es exactamente el objeto que viaja como
   `campos` en el POST final (ver `_evEditarConfirmar()`).

   Paso 1 (#ev-editar-paso-scope, mismo `.salud-paso`): "¿A cuáles eventos
   aplica?" (pills de selección única, mismo `.aj-pill` de siempre) +, solo
   para "Por un período", el calendario de rango (`_evEditarCal*`) -- MISMO
   patrón visual que el calendario "Por período" de Asistencia anticipada
   (`_evAntCal*`, más abajo en este archivo: `.ev-ant-cal-nav*`/
   `.ev-ant-fecha-pill`/`.ev-ant-rango-linea`/`.ev-ant-rango-fila`/
   `.ev-ant-btn-restablecer-icono`, todas reusadas TAL CUAL, cero CSS nuevo
   para el calendario en sí) pero simplificado: acá la fecha de INICIO no se
   elige -- siempre es `_evDetalleActual.fecha` (fija, se muestra como pill
   no-clickeable), el calendario solo deja tocar la fecha de FIN. Confirmado
   con Victor (la redacción original pedía "elegir fecha de inicio y fin",
   pero el contrato del POST decía "fechaDesde: siempre la fecha del
   evento" -- ambas cosas juntas solo tienen sentido si el inicio es fijo y
   nunca se pide, ver el resto de esta tanda en "Cambios recientes").
   ═══════════════════════════════════════════════════════ */
var _EV_EDITAR_PASOS = ['ev-editar-paso-campos', 'ev-editar-paso-scope'];
var _evEditarPaso = 0;
var _evEditarOriginal = { lugar: '', horaInicio: '', horaFin: '', descripcion: '' };
var _evEditarCambios = {};
var _EV_EDITAR_CLAVE = { lugar: 'lugar', horario: 'horaInicio', horaFin: 'horaFin', descripcion: 'descripcion' };
var _evEditarHoraTemp = null;
var _evEditarHoraFinTemp = null;
var _evEditarDescTemp = '';
var _evEditarScope = null;
var _evEditarFechaHasta = null;
var _evEditarCal = { mostrado: null, touched: false };
// Cache de venues para el picker de lugar -- null = todavía no pedido en
// esta sesión, distinto de _evLugares (getVenues, el flujo viejo de "Crear
// evento"/"Editar lugares", todavía sobre el contrato pre-Supabase, ver
// MANIFEST.md "Cambios recientes" -- Migración de Venues a Supabase). Acá se
// usa la acción YA migrada, adminGetVenues, que devuelve filas reales de la
// tabla `venues` (columnas `id`/`lugar`/`tipo_icono`/`requiere_reserva`, no
// el shape `{fila,nombre,...}` de _evLugares).
var _EV_VENUES = null;

// Entrada del flujo -- botón `edit` del sticky nav de #s-eventos-detalle
// (ver _evDetalleStickyHtml()). Arma todo el estado ANTES de navegar (mismo
// criterio que eventosAbrirAnticipada()/irEvCrear()): valores originales
// desde `_evDetalleActual` (fuente única de verdad, ya en memoria, sin
// request nuevo), cambios/scope en blanco, las 3 filas colapsadas.
function _evEditarAbrir() {
  var ev = _evDetalleActual;
  if (!ev || !_adminToken) return;
  _evEditarOriginal = { lugar: ev.lugar, horaInicio: ev.horaInicio, horaFin: ev.horaFinReal, descripcion: ev.descripcion || '' };
  _evEditarCambios = {};
  _evEditarScope = null;
  _evEditarFechaHasta = null;
  _evEditarCal = { mostrado: null, touched: false };
  ['lugar', 'horario', 'horaFin', 'descripcion'].forEach(function(campo) {
    var header = document.getElementById('ev-editar-campo-' + campo + '-header');
    var body = document.getElementById('ev-editar-campo-' + campo + '-body');
    if (header) header.classList.remove('abierto');
    if (body) body.classList.remove('abierto');
    _evEditarActualizarResumenCampo(campo);
  });
  document.querySelectorAll('#ev-editar-scope-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  var periodoWrap = document.getElementById('ev-editar-periodo-wrap');
  if (periodoWrap) periodoWrap.style.display = 'none';
  var restablecerBtn = document.getElementById('ev-editar-btn-restablecer');
  if (restablecerBtn) restablecerBtn.style.display = 'none';
  _evEditarMostrarPaso(0);
  ir('s-eventos-editar');
}
function _evEditarBack() {
  if (_evEditarPaso === 1) { _evEditarMostrarPaso(0); return; }
  ir('s-eventos-detalle');
}
// Motor de 2 pasos -- mismo mecanismo que _evCrearMostrarPaso() (más abajo
// en este archivo): toggle de `.activo` sobre `.salud-paso` (fade/slide
// `smoothSlideUp`, css/perfil.css, ya usado por Ficha de salud/Crear evento)
// + footer que cambia texto/acción según el paso activo.
function _evEditarMostrarPaso(idx) {
  _EV_EDITAR_PASOS.forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _evEditarPaso = idx;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  _evEditarActualizarFooter();
}
function _evEditarActualizarFooter() {
  var btn = document.getElementById('ev-editar-btn-footer');
  if (!btn) return;
  if (_evEditarPaso === 0) {
    btn.textContent = 'Guardar cambios';
    btn.onclick = _evEditarIrScope;
    btn.disabled = !_evEditarHayCambios();
  } else {
    btn.textContent = 'Confirmar';
    btn.onclick = _evEditarConfirmar;
    btn.disabled = !_evEditarScopeValido();
  }
}
function _evEditarHayCambios() { return Object.keys(_evEditarCambios).length > 0; }
function _evEditarIrScope() {
  if (!_evEditarHayCambios()) return;
  _evEditarMostrarPaso(1);
}

/* ── Paso 0: filas editables -- toggle independiente por fila (sin cerrar
   las demás, pedido explícito), reusa `.ev-ant-acc-header`/`.ev-ant-acc-body`
   tal cual (ver comentario del bloque de arriba). `forzarAbrir` (opcional):
   true/false fuerza el estado en vez de alternar -- usado por
   _evEditarSelVenue() para el "colapsar con Listo automático" al elegir un
   lugar. ──── */
function _evEditarToggleCampo(campo, forzarAbrir) {
  var header = document.getElementById('ev-editar-campo-' + campo + '-header');
  var body = document.getElementById('ev-editar-campo-' + campo + '-body');
  if (!header || !body) return;
  var abrir = forzarAbrir !== undefined ? forzarAbrir : !header.classList.contains('abierto');
  header.classList.toggle('abierto', abrir);
  body.classList.toggle('abierto', abrir);
  if (!abrir) return;
  // Cada editor arranca desde el valor YA vigente (el cambio pendiente si
  // existe, si no el original) cada vez que la fila se abre -- si el admin
  // la cierra sin tocar "Listo" no se pierde nada (nunca se llegó a
  // confirmar) y, si la vuelve a abrir, ve el último valor confirmado.
  if (campo === 'lugar') _evEditarCargarVenues();
  else if (campo === 'horario') {
    _evHoraStepperInit('ev-editar-hora', _evEditarCambios.horaInicio || _evEditarOriginal.horaInicio, function(v) { _evEditarHoraTemp = v; });
    _evEditarHoraTemp = _evHoraStepperA24h('ev-editar-hora');
  } else if (campo === 'horaFin') {
    _evHoraStepperInit('ev-editar-horaFin', _evEditarCambios.horaFin || _evEditarOriginal.horaFin, function(v) { _evEditarHoraFinTemp = v; });
    _evEditarHoraFinTemp = _evHoraStepperA24h('ev-editar-horaFin');
  } else if (campo === 'descripcion') {
    var inp = document.getElementById('ev-editar-descripcion-input');
    var valorVigente = _evEditarCambios.hasOwnProperty('descripcion') ? _evEditarCambios.descripcion : _evEditarOriginal.descripcion;
    if (inp) { inp.value = valorVigente; _evEditarDescripcionInput(inp); }
  }
}
// Texto + color del valor colapsado de cada fila -- ver comentario del
// bloque de arriba sobre `.ev-editar-valor-original`.
function _evEditarActualizarResumenCampo(campo) {
  var el = document.getElementById('ev-editar-resumen-' + campo);
  if (!el) return;
  var clave = _EV_EDITAR_CLAVE[campo];
  var modificado = _evEditarCambios.hasOwnProperty(clave);
  var texto = '';
  if (campo === 'lugar') {
    texto = modificado ? _evEditarCambios.lugar : _evEditarOriginal.lugar;
  } else if (campo === 'horario') {
    texto = modificado ? ('Nuevo: ' + _evEditarCambios.horaInicio + 'hs') : (_evEditarOriginal.horaInicio + 'hs');
  } else if (campo === 'horaFin') {
    texto = modificado ? ('Nuevo: ' + _evEditarCambios.horaFin + 'hs') : (_evEditarOriginal.horaFin ? _evEditarOriginal.horaFin + 'hs' : 'Sin definir');
  } else if (campo === 'descripcion') {
    var desc = modificado ? _evEditarCambios.descripcion : _evEditarOriginal.descripcion;
    texto = desc ? (desc.length > 60 ? desc.substring(0, 60) + '…' : desc) : 'Sin descripción';
  }
  el.textContent = texto;
  el.classList.toggle('ev-editar-valor-original', !modificado);
}
function _evEditarConfirmarCampoGenerico(campo, clave, valorNuevo, valorOriginal) {
  if (valorNuevo === valorOriginal) delete _evEditarCambios[clave];
  else _evEditarCambios[clave] = valorNuevo;
  _evEditarActualizarResumenCampo(campo);
  _evEditarActualizarFooter();
  _evEditarToggleCampo(campo, false);
}
function _evEditarConfirmarHorario() { _evEditarConfirmarCampoGenerico('horario', 'horaInicio', _evEditarHoraTemp, _evEditarOriginal.horaInicio); }
function _evEditarConfirmarHoraFin() { _evEditarConfirmarCampoGenerico('horaFin', 'horaFin', _evEditarHoraFinTemp, _evEditarOriginal.horaFin); }
function _evEditarConfirmarDescripcion() { _evEditarConfirmarCampoGenerico('descripcion', 'descripcion', _evEditarDescTemp, _evEditarOriginal.descripcion); }
// Auto-crecimiento + contador de caracteres del textarea de descripción --
// patrón estándar (height:'auto' seguido de height:scrollHeight+'px', para
// que el navegador primero "encoja" al mínimo y recién ahí mida el alto real
// del contenido -- sin el paso a 'auto', scrollHeight quedaría atado al alto
// ya seteado en el ciclo anterior y nunca encogería si el usuario borra
// texto). Recibe el propio `<textarea>` (no `this.value`, ver el `oninput`
// en index.html) porque necesita el elemento para leer/escribir `style.height`,
// no solo su valor. Mismo llamado desde `_evEditarToggleCampo()` al
// pre-poblar el campo al abrir el acordeón (arriba en este archivo) -- así
// el alto ya arranca ajustado al valor vigente, sin esperar a la primera
// tecla.
function _evEditarDescripcionInput(el) {
  _evEditarDescTemp = el.value;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  _evEditarDescActualizarContador(el.value.length);
}
// Límite de 150 caracteres (maxlength en el HTML) -- el contador vive
// SIEMPRE en "[n]/150" y pasa a `--warning` (sin hardcodear el color, ver
// css/eventos.css) cuando quedan 20 caracteres o menos.
function _evEditarDescActualizarContador(len) {
  var cont = document.getElementById('ev-editar-desc-contador');
  if (!cont) return;
  cont.textContent = len + '/150';
  cont.classList.toggle('ev-editar-desc-contador-limite', (150 - len) <= 20);
}

/* ── Campo "Lugar" -- lista de venues como pills, mismo `.aj-pill` de
   siempre. Seleccionar una pill guarda Y colapsa de una (sin botón "Listo"
   propio, pedido explícito -- a diferencia de Horario/Descripción, que sí
   necesitan confirmar un valor compuesto/de texto libre antes de aplicar). ──── */
function _evEditarCargarVenues() {
  var cont = document.getElementById('ev-editar-lugar-pills');
  if (_EV_VENUES) { _evEditarRenderVenues(); return; }
  if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.78rem;margin:0;">Cargando lugares...</p>';
  api({ action: 'adminGetVenues', adminToken: _adminToken }, function(res) {
    _EV_VENUES = res || [];
    _evEditarRenderVenues();
  }, function(e) {
    if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.78rem;margin:0;">No se pudieron cargar los lugares.</p>';
  });
}
function _evEditarRenderVenues() {
  var cont = document.getElementById('ev-editar-lugar-pills'); if (!cont) return;
  if (!_EV_VENUES.length) { cont.innerHTML = '<p style="color:var(--muted);font-size:0.78rem;margin:0;">Todavía no hay lugares creados.</p>'; return; }
  var valorVigente = _evEditarCambios.hasOwnProperty('lugar') ? _evEditarCambios.lugar : _evEditarOriginal.lugar;
  cont.innerHTML = _EV_VENUES.map(function(v) {
    var activa = valorVigente === v.lugar;
    return '<span class="aj-pill' + (activa ? ' activa' : '') + '" data-id="' + v.id + '" onclick="_evEditarSelVenue(\'' + v.id + '\')">' + v.lugar + '</span>';
  }).join('');
}
function _evEditarSelVenue(id) {
  var v = (_EV_VENUES || []).filter(function(x) { return x.id === id; })[0];
  if (!v) return;
  document.querySelectorAll('#ev-editar-lugar-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.id == id); });
  _evEditarConfirmarCampoGenerico('lugar', 'lugar', v.lugar, _evEditarOriginal.lugar);
}

/* ── Paso 1: alcance + calendario de "Por período" (ver comentario del
   bloque de arriba -- inicio SIEMPRE fijo en _evDetalleActual.fecha, el
   calendario solo deja elegir el fin). ──── */
function _evEditarSelScope(el) {
  document.querySelectorAll('#ev-editar-scope-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evEditarScope = el.dataset.val;
  var periodoWrap = document.getElementById('ev-editar-periodo-wrap');
  if (periodoWrap) {
    var mostrar = _evEditarScope === 'periodo';
    var yaVisible = periodoWrap.style.display !== 'none';
    periodoWrap.style.display = mostrar ? 'block' : 'none';
    if (mostrar && !yaVisible) {
      void periodoWrap.offsetWidth; periodoWrap.style.animation = 'fadeIn 0.2s ease';
      if (!_evEditarCal.mostrado) _evEditarCal.mostrado = _evDetalleActual.fecha;
      _evEditarCalRender();
      _evEditarCalActualizarResumen();
    }
    if (!mostrar) { _evEditarFechaHasta = null; _evEditarCal.touched = false; }
  }
  _evEditarActualizarFooter();
}
function _evEditarCalMoverMes(dir) {
  var m = _evCalMesDe(_evEditarCal.mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evEditarCal.mostrado = _evToISO(new Date(year, month, 1));
  _evEditarCalRender();
}
function _evEditarCalMinIso() {
  var ev = _evDetalleActual;
  var hoy = _evHoyISO();
  return (ev && _evFechaCmp(hoy, ev.fecha) > 0) ? hoy : (ev ? ev.fecha : hoy);
}
function _evEditarCalTocarDia(iso) {
  if (_evFechaCmp(iso, _evEditarCalMinIso()) < 0) return;
  _evEditarFechaHasta = iso;
  _evEditarCal.touched = true;
  _evEditarCalRender();
  _evEditarCalActualizarResumen();
  _evEditarActualizarFooter();
}
function _evEditarCalRestablecer() {
  _evEditarFechaHasta = null;
  _evEditarCal.touched = false;
  _evEditarCalRender();
  _evEditarCalActualizarResumen();
  _evEditarActualizarFooter();
}
// Resumen "Del <fecha del evento, fija> al <fecha elegida>" -- mismo
// componente visual que _evAntPeriodoResumenHtml()/_evAntFechaPillHtml()
// (más abajo en este archivo), la pill de inicio no lleva onclick (fija, no
// hay a dónde "volver").
function _evEditarCalActualizarResumen() {
  var cont = document.getElementById('ev-editar-rango-resumen'); if (!cont) return;
  var ev = _evDetalleActual; if (!ev) return;
  var html = 'Del <span class="ev-ant-fecha-pill" style="cursor:default;">' + _evAntFechaCorta(ev.fecha) + '</span>';
  if (_evEditarFechaHasta) html += ' al <span class="ev-ant-fecha-pill" style="animation:fadeIn 0.2s ease">' + _evAntFechaCorta(_evEditarFechaHasta) + '</span>';
  cont.innerHTML = html;
  var btn = document.getElementById('ev-editar-btn-restablecer');
  if (btn) {
    if (_evEditarFechaHasta) { btn.style.display = 'flex'; void btn.offsetWidth; btn.style.animation = 'fadeIn 0.2s ease'; }
    else { btn.style.animation = 'fadeOut 0.2s ease forwards'; setTimeout(function() { if (!_evEditarFechaHasta) btn.style.display = 'none'; }, 200); }
  }
}
// Grilla del calendario -- mismo componente/clases que _evAntCalRender('periodo')
// (más abajo en este archivo), simplificado: `desde` es siempre
// _evDetalleActual.fecha (fijo, nunca cambia por un tap) y solo `hasta` es
// tocable; celdas antes de _evEditarCalMinIso() quedan bloqueadas
// (.ev-ant-cal-pasado, sin onclick) igual que el resto del calendario de
// Asistencia anticipada.
function _evEditarCalRender() {
  var cont = document.getElementById('ev-editar-cal-periodo'); if (!cont) return;
  var ev = _evDetalleActual; if (!ev) return;
  var m = _evCalMesDe(_evEditarCal.mostrado);
  var labelEl = document.getElementById('ev-editar-cal-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var minIso = _evEditarCalMinIso();
  var desde = ev.fecha, hasta = _evEditarFechaHasta;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var bloqueada = _evFechaCmp(celdaIso, minIso) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (bloqueada ? ' ev-ant-cal-pasado' : '');
    if (celdaIso === desde) clases += ' ev-ant-cal-sel';
    if (hasta && celdaIso === hasta) clases += ' ev-ant-cal-sel';
    if (hasta && _evFechaCmp(celdaIso, desde) > 0 && _evFechaCmp(celdaIso, hasta) < 0) clases += ' ev-ant-cal-en-rango';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = bloqueada ? '' : ' onclick="_evEditarCalTocarDia(\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}
function _evEditarScopeValido() {
  if (!_evEditarScope) return false;
  if (_evEditarScope === 'periodo' && !_evEditarFechaHasta) return false;
  return true;
}

// Guardado -- PATCH directo del navegador a la REST API de Supabase vía
// _evAdminEditarEvento() (junto a _evOffseasonEliminar()/_evOffseasonEditar(),
// más abajo en este archivo) -- ya NO pasa por apiPost()/`adminEditarEvento`
// (la acción nunca llegó a implementarse en el backend, ver el comentario
// que tenía esta función antes). `campos` sale de `_evEditarCambios` --
// SOLO trae las claves que el admin efectivamente confirmó con "Listo" en
// alguna fila (`_evEditarConfirmarCampoGenerico()`, arriba en este archivo),
// traducidas de las claves internas de esta pantalla a las columnas reales
// de `asistencias`: `lugar`->`donde`, `horaInicio`->`inicia`,
// `horaFin`->`termina`, `descripcion`->`info_adicional` --
// `_evAdminEditarEvento()` ya trata cada campo como opcional
// (`if (campos.x !== undefined)`), así que omitir cualquiera de estas claves
// no rompe nada, esa columna simplemente no se toca. `fechaDesde` viaja
// SIEMPRE como `ev.fecha` (la fecha del evento que se está editando, nunca
// elegida por el admin), `fechaHasta` solo con modo `'periodo'`. Error: toast
// y se queda en #s-eventos-editar (pedido explícito), sin tocar nada más.
// Éxito: además del toast, `_evEditarAplicarCambiosLocal()` (abajo) pisa
// `_evDetalleActual`/`_EV_EVENTOS` en memoria con los mismos valores ANTES
// de navegar -- bug real corregido en esta sesión: el PATCH ya había
// guardado en la base, pero el objeto local seguía con el valor viejo hasta
// que `_evCargarDatosReales()` (asincrónico, corre después) volvía a pisar
// todo, así que cualquier pantalla que leyera `_evDetalleActual` en el medio
// (ej. el pill de lugar del sticky) mostraba el dato desactualizado por un
// instante -- o directamente uno viejo si `ir('s-eventos')` no esperaba ese
// refetch.
function _evEditarConfirmar() {
  if (!_evEditarScopeValido()) return;
  var ev = _evDetalleActual;
  if (!ev) return;

  var campos = {};
  if (_evEditarCambios.hasOwnProperty('lugar')) campos.donde = _evEditarCambios.lugar;
  if (_evEditarCambios.hasOwnProperty('horaInicio')) campos.inicia = _evEditarCambios.horaInicio;
  if (_evEditarCambios.hasOwnProperty('horaFin')) campos.termina = _evEditarCambios.horaFin;
  if (_evEditarCambios.hasOwnProperty('descripcion')) campos.info_adicional = _evEditarCambios.descripcion;

  var modo = _evEditarScope;
  var fechaHasta = modo === 'periodo' ? _evEditarFechaHasta : null;

  mostrarCargando('Guardando cambios...');
  _evAdminEditarEvento(
    ev.id, campos, modo, ev.fecha, fechaHasta,
    function() {
      ocultarCargando();
      _evEditarAplicarCambiosLocal(ev);
      mostrarToast('Cambios guardados.', 'ok', true);
      ir('s-eventos');
      _evCargarDatosReales(function() { _evRenderTimeline(true); });
    },
    function(e) {
      ocultarCargando();
      mostrarToast((e && e.message) || 'No se pudieron guardar los cambios.', 'error');
    }
  );
}
// Pisa en memoria los campos recién guardados -- `abrirEvDetalle()` deja
// `_evDetalleActual` como la MISMA referencia que su fila en `_EV_EVENTOS`
// (`.filter()[0]`, nunca una copia), así que mutar `ev` ya alcanza en el
// camino normal; el `filter` de acá es solo defensivo por si ese invariante
// cambia el día de mañana. `lugar` además resuelve `mapsUrl` de nuevo contra
// `_EV_VENUES` (el cache YA cargado por el picker de esta misma pantalla,
// `_evEditarCargarVenues()` -- no `_evLugares`, que es el cache de la
// pantalla vieja "Crear evento"/"Editar lugares" y puede no estar poblado en
// esta sesión) -- sin esto el pill de lugar cambiaría de nombre pero
// quedaría apuntando al mapsUrl del lugar anterior hasta el próximo refetch.
function _evEditarAplicarCambiosLocal(ev) {
  if (!ev) return;
  var destinos = [ev];
  var otro = _EV_EVENTOS.filter(function(e) { return e.id === ev.id && e !== ev; })[0];
  if (otro) destinos.push(otro);
  destinos.forEach(function(e) {
    if (_evEditarCambios.hasOwnProperty('lugar')) {
      e.lugar = _evEditarCambios.lugar;
      var venue = (_EV_VENUES || []).filter(function(v) { return v.lugar === e.lugar; })[0];
      if (venue && venue.google_maps) e.mapsUrl = venue.google_maps;
    }
    if (_evEditarCambios.hasOwnProperty('horaInicio')) e.horaInicio = _evEditarCambios.horaInicio;
    if (_evEditarCambios.hasOwnProperty('horaFin')) e.horaFinReal = _evEditarCambios.horaFin;
    if (_evEditarCambios.hasOwnProperty('descripcion')) e.descripcion = _evEditarCambios.descripcion;
  });
}
/* ── Resumen de asistencia como 4 tarjetas de estadística (grid, ver
   "Cambios recientes" — reemplaza la línea de texto "Asisten X · No
   asisten X..." de la tanda anterior) + la lista completa agrupada debajo.
   Separado de _evRenderDetalle() para poder refrescarse solo (sin tocar
   info/RSVP) más adelante. `_evDetalleFiltroGrupo` se resetea a null en
   cada render -- abrir un evento nuevo (o re-abrir el mismo) arranca sin
   ningún filtro activo. */
var _evDetalleFiltroGrupo = null;
// `conToggle`/`idEvento` (ver "Cambios recientes"): solo los manda
// `_evActualizarStatsAsistenciaReal()` (asistencia REAL, admin) -- el camino
// de RSVP (`_evRenderDetalleAsistencia()`) sigue llamando esta función con 1
// solo argumento, sin tocar nada de lo de acá. Con `conToggle`, suma la
// tarjeta "Marcar asistencia" (`_evStatCardMarcarAsistenciaHtml()`) al final
// del grid de estadísticas -- ocupa el lugar donde antes vivía la card
// "Ausentes" (ver "Cambios recientes", punto 1/2 del pedido de Victor) -- y
// propaga el toggle inline a cada fila de personas de la lista de abajo
// (`_evGrupoAsistenciaHtml()`, punto 3).
function _evPintarStatsAsistencia(grupos, conToggle, idEvento) {
  var stats = document.getElementById('ev-detalle-stats');
  if (stats) {
    stats.innerHTML = grupos.map(function(g) {
      return '<div class="ev-stat-card ' + g.clase + '" data-grupo="' + g.key + '" onclick="_evFiltrarAsistenciaPorGrupo(this,\'' + g.key + '\')">' +
        '<div class="ev-stat-num">' + g.personas.length + '</div>' +
        '<div class="ev-stat-label">' + g.label + '</div>' +
      '</div>';
    }).join('') + (conToggle ? _evStatCardMarcarAsistenciaHtml(idEvento) : '');
  }
  var lista = document.getElementById('ev-detalle-asistencia-lista');
  if (lista) {
    lista.innerHTML = grupos.map(function(g) { return _evGrupoAsistenciaHtml(g.label, g.personas, g.key, g.clase, conToggle, idEvento); }).join('');
    _evHidratarAvatares();
    // Mismo criterio que _evRenderMarcarAsistLista()/js/eventos.js -- sin animar
    // (`false`), primer pintado de estas filas, no una respuesta a un toque.
    lista.querySelectorAll('.ev-rsvp-seg').forEach(function(seg) { _evPosicionarRsvpSlider(seg, false); });
  }
}
// Reemplaza el lugar donde antes vivía la card "Ausentes" (ver "Cambios
// recientes", punto 2 del pedido de Victor) -- visible únicamente para
// admin (`_evPintarStatsAsistencia()` solo la agrega con `conToggle`
// truthy, que a su vez solo llega en `true` desde `_evActualizarStatsAsistenciaReal()`
// cuando `_adminToken` es real). `stopPropagation()` -- mismo motivo que el
// resto de los controles de esta pantalla, evita que el toque también
// dispare cualquier click de fondo de la card.
// Texto/ícono/ancho/borde (ver "Cambios recientes" -- pedido explícito de
// Victor): "Tomar asistencia" (antes "Marcar asistencia", mismo texto que
// `.ev-btn-agregar-persona` de la card de home) + mismo ícono `person_add`
// (antes `edit_calendar`) -- el ensanchado (`grid-column:span 2`) y el
// borde dashed viven en `.ev-stat-marcar`, css/eventos.css: `_EV_GRUPOS_ASISTENCIA_REAL`
// solo tiene 2 entradas (A horario/Tarde), así que este botón es el 3er
// ítem de una grilla de 4 columnas -- sin el span, la 4ta quedaba vacía.
function _evStatCardMarcarAsistenciaHtml(idEvento) {
  return '<button type="button" class="ev-stat-card ev-stat-marcar" onclick="event.stopPropagation();_evAbrirMarcarAsistencia(\'' + idEvento + '\',\'s-eventos-detalle\')">' +
    '<span class="material-symbols-outlined">person_add</span>' +
    '<div class="ev-stat-label">Tomar asistencia</div>' +
  '</button>';
}
// Asisten/No asisten/No jugador salen directo de `ev.rsvps` (ya cargado con
// el evento, ver _evMapEventoBackend() -- sin fetch extra). "Sin responder"
// es distinto: necesita el roster COMPLETO del equipo para poder restarle
// quién ya respondió, y la única acción real que lo trae
// (adminBuscarPersonasParaEvento) es admin-only (adminToken) -- no existe
// ninguna acción pública de roster (decisión de Victor, esta sesión): en vez
// de listar a todo el equipo a cualquier cuenta logueada, este grupo queda
// oculto del todo para no-admin. Para admin, se pide aparte (no bloquea el
// resto de la pantalla) y se repinta solo si nadie tocó ya un filtro
// mientras tanto (`_evDetalleFiltroGrupo`) -- no le pisa la selección a la
// persona que ya filtró un grupo mientras el pedido todavía viajaba.
function _evRenderDetalleAsistencia(ev) {
  _evDetalleFiltroGrupo = null;
  // Cancelado/No se entrena: nunca hubo/habrá asistencia que mostrar --
  // oculta la sección entera (heading "Asistencia" del HTML incluido, no
  // solo stats/lista) en vez de dejarla vacía debajo de la pill de estado
  // (ver _evEstadoNotaPillHtml()). Se restaura ('') al abrir un evento no
  // cancelado después -- mismo elemento, no se recrea entre aperturas.
  var seccion = document.getElementById('ev-detalle-asistencia');
  var cancelado = (ev.estado === 'Cancelado' || ev.estado === 'No se entrena');
  if (seccion) seccion.style.display = cancelado ? 'none' : '';
  if (cancelado) return;
  // Regla de tiempo, no solo de rol/fecha calendario -- mismo criterio ya
  // usado por _evCardEventoHtml()/_evYaEmpezo() para la card: desde que el
  // evento arranca, admin ve la asistencia REAL (rollcall E/F) + gestión acá
  // también (ver _evRenderDetalleAsistenciaReal(), más abajo), no el RSVP de
  // intención pre-evento. Antes de arrancar (cualquier cuenta) o para
  // cuentas no-admin en cualquier momento, sigue el resumen de RSVP de
  // siempre, sin cambios.
  console.log('[ev-detalle]', 'pasado:', _evEsPasado(ev), 'asistentes:', JSON.stringify(ev.asistentes), 'asistencias:', JSON.stringify(ev.asistencias));
  if (_adminToken && _evYaEmpezo(ev)) { _evRenderDetalleAsistenciaReal(ev); return; }
  var rsvps = ev.rsvps || [];
  var grupos = _EV_GRUPOS_ASISTENCIA.map(function(g) {
    return { key: g.key, label: g.label, clase: g.clase, personas: rsvps.filter(function(p) { return p.estado === g.estado; }) };
  });
  _evPintarStatsAsistencia(grupos);
  if (!_adminToken) return;
  var idEvento = ev.id;
  api({ action: 'adminBuscarPersonasParaEvento', adminToken: _adminToken, idEvento: idEvento }, function(res) {
    if (!_evDetalleActual || _evDetalleActual.id !== idEvento || _evDetalleFiltroGrupo) return;
    // Claves normalizadas (ver _evNombresCoinciden()) -- rsvps[].nombre sale
    // de "Log de asistencias" y res.personas[].nombre de "Equipo", 2 hojas
    // distintas sin garantía de coincidir carácter a carácter para la misma
    // persona (mismo bug real que _evMapEventoBackend(), acá aplicado al
    // cruce con el roster completo en vez de con E.nombre solo).
    var respondieron = {};
    rsvps.forEach(function(p) { respondieron[String(p.nombre).trim().toUpperCase()] = true; });
    var sinResponder = (res.personas || []).filter(function(p) { return !respondieron[String(p.nombre).trim().toUpperCase()]; }).map(function(p) { return { nombre: p.nombre, nombreDerby: p.nombreDerby || '', fotoPerfil: p.fotoPerfil || '' }; });
    _evPintarStatsAsistencia(grupos.concat([{ key: _EV_GRUPO_SIN_RESPONDER.key, label: _EV_GRUPO_SIN_RESPONDER.label, clase: _EV_GRUPO_SIN_RESPONDER.clase, personas: sinResponder }]));
  }, function() { /* silencioso -- el resto de la pantalla ya funciona sin este grupo */ });
}
// Asistencia REAL (rollcall E/F, `ev.asistentes`) agrupada en 2 tarjetas de
// estadística (A horario/Tarde, ver "Cambios recientes" -- ya no incluye
// "Ausentes") + la lista completa debajo, reusando el MISMO
// `_evPintarStatsAsistencia()` que ya usa el camino RSVP de arriba -- 0
// duplicación de la UI de stats/lista, solo cambia qué array alimenta los
// grupos y qué combinación de estado se muestra por persona (puntualidad +
// rol, ver _evLabelPuntualidadRol()/`p.sufijoRol`). `estado` se suma a cada
// persona (a diferencia del resto de los campos, no viene de un mapeo --
// ES el `g.estado` del grupo al que pertenece) para que
// `_evGrupoAsistenciaHtml()` sepa qué opción del toggle marcar activa sin
// tener que recalcularlo. Bug real corregido acá (el "0 asistentes"
// reportado en el detalle de eventos pasados): antes
// `_evRenderDetalleAsistencia()` SIEMPRE leía `ev.rsvps` (intención
// pre-evento) sin importar si el evento ya había arrancado -- un evento ya
// jugado con RSVPs vacíos (o gente que nunca respondió pero sí vino, admin
// mediante) mostraba 0 en las tarjetas pese a tener asistencia real
// registrada en `ev.asistentes`.
// Separada de `_evRenderDetalleAsistenciaReal()` (ver esa función, abajo)
// -- ver "Cambios recientes": `_evMarcarAsistenciaAdmin()` necesita poder
// refrescar SOLO las tarjetas/lista de arriba tras marcar a alguien desde
// la subpantalla "Marcar asistencia" o desde el toggle inline de estas
// mismas listas, sin volver a reconstruir ninguna otra pantalla.
function _evActualizarStatsAsistenciaReal(ev) {
  var asistentes = ev.asistentes || [];
  var grupos = _EV_GRUPOS_ASISTENCIA_REAL.map(function(g) {
    return {
      key: g.key, label: g.label, clase: g.clase,
      personas: asistentes.filter(function(a) { return a.estado === g.estado; }).map(function(a) {
        var rol = _evRolDePersona(ev, a.nombre);
        return { nombre: a.nombre, nombreDerby: a.nombreDerby || '', fotoPerfil: a.fotoPerfil || '', estado: a.estado, sufijoRol: (rol === 'No jugador') ? ' · No jugador' : '' };
      })
    };
  });
  // `_adminToken` explícito (ver "Cambios recientes", punto 6 del pedido de
  // Victor -- guard confirmado en cada punto de entrada): en la práctica
  // esta función solo se llama ya desde caminos admin-only
  // (`_evRenderDetalleAsistenciaReal()`/`_evMarcarAsistenciaAdmin()`), pero
  // queda explícito acá también en vez de asumirlo implícito, mismo
  // criterio que el resto del archivo.
  _evPintarStatsAsistencia(grupos, !!_adminToken, ev.id);
}
function _evRenderDetalleAsistenciaReal(ev) {
  _evActualizarStatsAsistenciaReal(ev);
}
// Tocar una tarjeta filtra la lista de abajo a solo ese grupo; tocarla de
// nuevo (ya activa) deselecciona y vuelve a mostrar los 4. Solo una tarjeta
// activa a la vez -- tocar otra mientras hay una activa cambia el filtro.
//
// Bug real (ver "Cambios recientes"), y por qué el fix no es un simple
// `scrollTo(smooth)` DESPUÉS de togglear `display`: togglear `display:none`
// en los grupos que no matchean puede achicar el documento de golpe (ej. de
// "Sin respuesta", el más largo, a "Asisten") -- confirmado con Playwright
// ANTES de aplicar nada: si el usuario estaba scrolleado bien abajo mirando
// ese grupo largo, `window.scrollY` YA aparece clampeado al nuevo máximo
// DENTRO de esta misma función, apenas se togglea `display` -- el propio
// navegador reflowea y clampea el scroll de forma síncrona (instantánea, sin
// animación posible) antes de que el código de más abajo llegue a correr, así
// que animar un `scrollTo` recién DESPUÉS de togglear no tiene nada que
// corregir: el salto ya pasó. Fix real: reservar el alto viejo de la lista
// (`min-height` puntual, temporal) ANTES de togglear `display` -- el
// documento no se achica todavía, así que el navegador no tiene motivo para
// clampear nada -- calcular ahí, con el layout todavía "grande", a dónde
// debería ir el scroll (mismo offset que ya usa `_evDetalleActualizarSticky()`,
// `nivel3.style.top`, reusado) y animar el `scrollTo` con espacio real de
// sobra para moverse. Recién cuando esa animación termina (timeout, no hay
// evento de "fin" nativo para `window.scrollTo`) se suelta el `min-height`.
//
// 2do bug real, encontrado DESPUÉS de aplicar el fix de arriba (instrumentado
// con Playwright muestreando `scrollY` cuadro a cuadro, no adivinado): el fix
// de arriba evita el salto AL TOGGLEAR `display`, pero cuando el destino
// filtrado es una lista muy corta (ej. "Sin respuesta"(11) → "Asisten"(1)),
// `scrollDestino` -- calculado con el `min-height` todavía puesto, documento
// todavía "grande" -- puede ser una posición que YA NO EXISTE una vez que el
// `min-height` se suelta (el documento real, sin el relleno artificial, es
// más corto que `scrollDestino`). La animación `smooth` sí llega bien y se
// asienta en `scrollDestino` (confirmado, ~320ms) -- pero al soltar el
// `min-height` en el `setTimeout` de más abajo, el documento se encoge más
// allá de esa posición y el navegador reclampea `scrollY` de golpe, SIN
// animación posible (mismo mecanismo síncrono del primer bug, esta vez
// disparado por soltar el relleno en vez de por togglear `display`) --
// visible como un 2do salto mudo justo cuando la animación ya se veía
// terminada. Fix: no animar hacia el `scrollDestino` "on-a-tall-document" tal
// cual -- clampearlo primero contra el alto MÁXIMO real que va a quedar tras
// soltar el `min-height` (`maxScrollTrasSoltar`, medido soltando el
// `min-height` un instante para leer `scrollHeight` y devolviéndolo antes de
// que el navegador llegue a pintar nada -- una sola lectura de layout
// síncrona, sin cambio visual). Así la animación converge directo al destino
// FINAL real; soltar el `min-height` después no tiene nada nuevo que
// clampear.
function _evFiltrarAsistenciaPorGrupo(cardEl, grupo) {
  var yaActiva = _evDetalleFiltroGrupo === grupo;
  _evDetalleFiltroGrupo = yaActiva ? null : grupo;
  document.querySelectorAll('#ev-detalle-stats .ev-stat-card').forEach(function(c) {
    c.classList.toggle('activa', !yaActiva && c === cardEl);
  });
  var lista = document.getElementById('ev-detalle-asistencia-lista');
  var statsSticky = document.getElementById('ev-detalle-stats');
  var alturaViejaLista = lista ? lista.scrollHeight : 0;
  if (lista) lista.style.minHeight = alturaViejaLista + 'px';
  document.querySelectorAll('#ev-detalle-asistencia-lista .ev-asist-grupo').forEach(function(g) {
    g.style.display = (!_evDetalleFiltroGrupo || g.getAttribute('data-grupo') === _evDetalleFiltroGrupo) ? '' : 'none';
  });
  var animo = false;
  if (statsSticky && lista) {
    // `scrollDestino`: NO se puede leer `statsSticky.getBoundingClientRect().top`
    // acá -- es `position:sticky` y, si ya está pegada (el usuario scrolleado
    // más allá del punto donde se fija), su rect SIEMPRE reporta su posición
    // FIJADA (`offsetSticky`) sin importar cuánto se haya scrolleado de más --
    // restarle `offsetSticky` a eso da ~0, así que `scrollDestino` terminaba
    // dando prácticamente el mismo `window.scrollY` actual (confirmado con
    // Playwright: un bug real de esta implementación, no el de arriba -- la
    // condición de más abajo nunca se cumplía, el salto seguía intacto).
    // `lista` en cambio NO es sticky -- su posición ABSOLUTA en el documento
    // (`rect.top + window.scrollY`) es estable sin importar cuánto se haya
    // scrolleado, así que sirve como referencia real para calcular a dónde
    // scrollear.
    var scrollYInicio = window.scrollY;
    var offsetSticky = parseFloat(statsSticky.style.top) || 0;
    var listaAbsY = lista.getBoundingClientRect().top + scrollYInicio;
    var scrollDestino = Math.max(0, listaAbsY - offsetSticky - statsSticky.offsetHeight);
    // Clamp contra el alto real que va a quedar tras soltar `min-height` (ver
    // comentario de arriba, 2do bug) -- soltar+medir+reponer en el mismo tick
    // síncrono, sin `requestAnimationFrame` de por medio, así que no hay pintado
    // intermedio con el documento corto. Soltar el `min-height` acá fuerza el
    // mismo reflow-y-clamp síncrono del 1er bug (el navegador ve el documento
    // corto un instante y clampea `scrollY` de verdad, no solo lo que
    // reportaría un cálculo) -- por eso se restaura `scrollY` a
    // `scrollYInicio` explícitamente después de reponer el `min-height`, en
    // vez de asumir que iba a quedar intacto.
    lista.style.minHeight = '';
    var maxScrollTrasSoltar = Math.max(0, document.documentElement.scrollHeight - (window.innerHeight || document.documentElement.clientHeight));
    lista.style.minHeight = alturaViejaLista + 'px';
    window.scrollTo(0, scrollYInicio);
    scrollDestino = Math.min(scrollDestino, maxScrollTrasSoltar);
    if (scrollYInicio > scrollDestino + 1) {
      animo = true;
      window.scrollTo({ top: scrollDestino, behavior: 'smooth' });
    }
  }
  if (lista) {
    setTimeout(function() { lista.style.minHeight = ''; }, animo ? 400 : 0);
  }
}

/* ═══════════════════════════════════════════════════════
   ASISTENCIA ANTICIPADA (ev-ant-*, #s-eventos-anticipada) -- MIGRADA de
   Apps Script a Supabase directo (ver MANIFEST.md "Cambios recientes"),
   mismo mecanismo que venues/temporadas_descanso: `fetch()` del navegador
   directo a la REST API de Supabase (PostgREST, `SUPABASE_URL`/
   `SUPABASE_ANON_KEY`, `js/config.js`), sin pasar por `api()`/`apiPost()`
   (js/api.js, que hoy pegan contra la Edge Function -- y esta acción, al no
   tener case propio ahí, terminaba reenviada a Apps Script vía
   `forwardToGAS()`). Tabla `reglas_asistencia`: `id` (uuid, reemplaza el
   viejo número de `fila` de Sheets -- `regla.id` en todo el JS de acá en
   más), `nombre`, `tipo_rango`, `tipos_evento` (texto separado por comas,
   NO array/JSON -- mismo contrato que ya mandaba el cliente antes de esta
   migración, `.join(',')`; se separa de vuelta a array al leer,
   `_evAntMapReglaSupabase()`, porque `_evAntResumenDetalle()` ya asume
   array), `fecha_desde`, `fecha_hasta`, `estado`, `meses` (array real,
   columna de tipo array/jsonb -- no se serializa a mano), `created_at`.
   Sin `token`/`_token` -- ya no hace falta: la identidad viaja en el campo
   `nombre` de cada fila, mismo criterio que `donde`/`asistencias.nombre` en
   el resto de Eventos, no una sesión autenticada del lado del backend.
   **El chequeo de solapamiento del flujo viejo (`{exito:false,
   reglaExistente}` → `_evAntMostrarConflicto()`) se cae con esta migración**
   -- era lógica de negocio de Code.gs, nunca confirmada 1:1 contra el
   código real (ver comentario que tenía este bloque antes) y sin
   equivalente en un `POST` crudo a PostgREST; decisión explícita de Victor
   en esta tanda: sacarla sin más vueltas en vez de reimplementarla acá.
   `_evAntMostrarConflicto()`/`_evAntCerrarConflicto()`/`#modal-ant-conflicto`
   quedan en el código sin llamador real, por si se retoma más adelante.
   ═══════════════════════════════════════════════════════ */
// Mapea una fila cruda de `reglas_asistencia` a la forma que ya espera el
// resto de esta sección (id/tipoRango/tiposEvento/fechaDesde/fechaHasta/
// estado/meses) -- mismo criterio que `_evMapVenueSupabase()`/
// `_evMapEventoBackend()`, un solo punto de mapeo reusado por
// `eventosAbrirAnticipada()` Y `_evAntRecargarLista()` (antes 2 llamadas
// idénticas a `getReglasAsistenciaAnticipada` con el mismo shape, ahora 1
// sola función de fetch+mapeo detrás de las 2).
function _evAntMapReglaSupabase(row) {
  return {
    id: row.id,
    tipoRango: row.tipo_rango,
    tiposEvento: row.tipos_evento ? row.tipos_evento.split(',') : [],
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    estado: row.estado,
    meses: row.meses || [],
  };
}
function _evAntFetchReglas(onOk, onErr) {
  fetch(
    SUPABASE_URL + '/rest/v1/reglas_asistencia?select=*&nombre=eq.' + encodeURIComponent(E.nombre) + '&order=created_at.desc',
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
  ).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(rows) {
    onOk((rows || []).map(_evAntMapReglaSupabase));
  }).catch(onErr);
}

// Reconcilia las reglas de asistencia anticipada (tabla `reglas_asistencia`,
// vía `_evAntFetchReglas()`) contra el timeline recién cargado -- llamada
// desde `_evCargarDatosReales()` (ver ese comentario) después de que
// `_EV_EVENTOS` ya tiene los eventos del rango. Hasta esta función las
// reglas se guardaban bien pero nunca se leían de vuelta acá: el timeline
// mostraba `ev.miEstado` tal cual venía del backend (RSVP real, ver
// `_evMapEventoBackend()`) sin aplicar ninguna regla -- ese era el bug
// principal. Solo toca eventos FUTUROS (fecha >= hoy, mismo criterio que
// `_evEsPasado()`/`_evHoyISO()` del resto del archivo) -- una regla nunca
// debe reescribir la asistencia de un evento que ya pasó. Orden de
// aplicación intencional para que gane la más específica: `reglas` se
// ordena primero (`orden`, 'indefinido' < 'meses' < 'periodo') y RECIÉN
// DESPUÉS se itera evento por evento aplicando cada regla en ese orden --
// así 'meses' siempre pisa a 'indefinido', y 'periodo' siempre pisa a las
// 2 anteriores (matchea por número de mes de `ev.fecha`, cualquier año,
// mismo criterio que la grilla de meses del wizard, ver `_evAntData.meses`)
// -- cada match sobreescribe `ev.miEstado`, así que el orden del `.sort()`
// ES la prioridad real.
function _evAntReconciliarConReglas(reglas) {
  if (!reglas || !reglas.length) return;
  var hoy = _evHoyISO();
  var futuros = _EV_EVENTOS.filter(function(e) { return _evFechaCmp(e.fecha, hoy) >= 0; });

  function tipoAplica(r, ev) {
    return !r.tiposEvento || !r.tiposEvento.length || r.tiposEvento.indexOf(ev.tipo) !== -1;
  }
  function matchFecha(r, ev) {
    if (r.tipoRango === 'indefinido') return !!r.fechaDesde && _evFechaCmp(ev.fecha, r.fechaDesde) >= 0;
    if (r.tipoRango === 'meses') return (r.meses || []).indexOf(parseInt(ev.fecha.split('-')[1], 10)) !== -1;
    if (r.tipoRango === 'periodo') return !!r.fechaDesde && !!r.fechaHasta && _evFechaCmp(ev.fecha, r.fechaDesde) >= 0 && _evFechaCmp(ev.fecha, r.fechaHasta) <= 0;
    return false;
  }

  var orden = { 'indefinido': 0, 'meses': 1, 'periodo': 2 };
  reglas.sort(function(a, b) { return orden[a.tipoRango] - orden[b.tipoRango]; });

  reglas.forEach(function(r) {
    futuros.forEach(function(ev) {
      if (tipoAplica(r, ev) && matchFecha(r, ev)) ev.miEstado = r.estado;
    });
  });
}

var _evAntData = {};
var _evAntReglas = [];
// Guard de condición de carrera (ver "Cambios recientes" -- patrón estándar
// a reusar en cualquier pantalla con estado preservado + carga async en el
// punto de entrada): con la preservación de estado por tab, `.pantalla` ya
// no se destruye al navegar afuera -- si el usuario entra, sale (flecha
// atrás/otro tab) y vuelve a entrar antes de que la 1ra carga resuelva, esa
// respuesta vieja llega tarde y su callback sigue vivo, pisando el DOM con
// el estado por default (wizard/"Aplicar") aunque el usuario ya esté viendo
// una carga más nueva (o ya ni siquiera esta pantalla). `_evAntCargaId` se
// incrementa en cada ENTRADA real a la pantalla (`eventosAbrirAnticipada()`,
// nunca en un refresco interno como `_evAntRecargarLista()`) -- cada
// callback async captura el valor vigente al momento de disparar el fetch y
// lo compara contra el valor GLOBAL actual antes de tocar nada; si no
// coinciden, la carga quedó obsoleta y se descarta en silencio.
var _evAntCargaId = 0;

// Fortalecido (ver "Cambios recientes" -- el chequeo de `miCarga` solo no
// alcanzaba): cubre re-entrar a la pantalla (`_evAntCargaId` cambió, caso
// original) PERO NO cubre salir sin volver a entrar nunca -- en ese caso
// `_evAntCargaId` no cambia (nadie disparó una carga nueva), así que la
// única carga en vuelo seguía "vigente" según ese chequeo solo, aunque el
// usuario ya esté en otra pantalla. Se suma acá el chequeo real de que
// `#s-eventos-anticipada` siga siendo la pantalla activa -- entre los 2,
// cualquier forma de "ya no estoy viendo esto" queda cubierta.
function _evAntCargaVigente(miCarga) {
  if (miCarga !== _evAntCargaId) return false;
  var p = document.getElementById('s-eventos-anticipada');
  return !!(p && p.classList.contains('activa'));
}

// Reemplaza el loader de pantalla completa que tenía antes (ver "Cambios
// recientes" -- mismo criterio que `cargarFechas()`/`_skeletonFechasHtml()`,
// js/reservas.js: skeleton CONTENIDO en el lugar real del contenido en vez
// de un overlay, navegación/entrada a la pantalla sin esperar la respuesta).
// Bug real corregido (ver "Cambios recientes" -- scroll del timeline perdido
// al volver de Asistencia anticipada): esta función nunca guardaba
// `_evTimelineScrollY` antes de navegar afuera de `s-eventos` -- mismo bug
// que ya se había corregido para `_evAbrirMarcarAsistencia()`, esta pantalla
// más vieja quedó afuera del mecanismo. A diferencia de esa otra, acá no
// hace falta chequear el origen -- el único punto de entrada real es el
// ícono del header de `#s-eventos` (`index.html`), siempre se abandona el
// timeline en sí.
function eventosAbrirAnticipada() {
  _evGuardarScrollTimeline();
  _evRestaurarScrollTimeline = true;
  ir('s-eventos-anticipada');
  document.getElementById('ev-ant-wizard').style.display = 'none';
  _evAntOcultarFooter();
  document.getElementById('ev-ant-btn-nueva').style.display = 'none';
  document.getElementById('ev-ant-lista').innerHTML = _evAntSkeletonHtml();
  document.getElementById('ev-ant-resumen').style.display = 'block';
  var miCarga = ++_evAntCargaId;
  _evAntFetchReglas(function(reglas) {
    if (!_evAntCargaVigente(miCarga)) return; // el usuario ya salió (con o sin volver a entrar) -- esta respuesta quedó vieja
    _evAntReglas = reglas;
    if (_evAntReglas.length > 0) {
      _evAntRenderLista();
      document.getElementById('ev-ant-btn-nueva').style.display = 'block';
    } else {
      _evAntIniciarWizard();
    }
  }, function(e) {
    if (!_evAntCargaVigente(miCarga)) return;
    mostrarToast(e && e.message ? e.message : 'No se pudieron cargar tus asistencias anticipadas.', 'error');
    ir('s-eventos');
  });
}

function _evAntSkeletonHtml() {
  var carta = '<div class="ev-ant-card">' +
    '<div class="ev-card-top-row">' +
      '<div class="fi-skel-block ev-ant-skel-icon"></div>' +
      '<div class="ev-card-body">' +
        '<div class="fi-skel-block ev-ant-skel-title"></div>' +
        '<div class="fi-skel-block ev-ant-skel-sub"></div>' +
      '</div>' +
    '</div>' +
  '</div>';
  return carta.repeat(3);
}

// Recarga la lista sin decidir el estado resumen/wizard (a diferencia de
// eventosAbrirAnticipada()) -- usada después de aplicar/eliminar, para que
// borrar la última asistencia anticipada deje un resumen vacío en vez de
// forzar al wizard (ese salto es solo el comportamiento de ENTRADA a la
// pantalla, no algo que deba repetirse en cada refresco).
function _evAntRecargarLista(cb) {
  // Mismo guard reforzado que eventosAbrirAnticipada() (ver
  // _evAntCargaVigente()) -- NO incrementa `_evAntCargaId` (esto es un
  // refresco de la carga vigente, no una entrada nueva), solo verifica que
  // nadie haya vuelto a entrar (o simplemente salido sin volver) mientras
  // este refresco estaba en vuelo.
  var miCarga = _evAntCargaId;
  _evAntFetchReglas(function(reglas) {
    if (!_evAntCargaVigente(miCarga)) { if (typeof cb === 'function') cb(); return; }
    _evAntReglas = reglas;
    _evAntRenderLista();
    document.getElementById('ev-ant-btn-nueva').style.display = 'block';
    if (typeof cb === 'function') cb();
  }, function(e) {
    if (!_evAntCargaVigente(miCarga)) { if (typeof cb === 'function') cb(); return; }
    mostrarToast(e && e.message ? e.message : 'No se pudo actualizar la lista.', 'error');
    if (typeof cb === 'function') cb();
  });
}

function _evAntRenderLista() {
  var cont = document.getElementById('ev-ant-lista'); if (!cont) return;
  if (!_evAntReglas.length) {
    cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No tenés asistencias anticipadas todavía.</p>';
    return;
  }
  cont.innerHTML = _evAntReglas.map(function(r) {
    return '<div class="ev-ant-card">' +
      '<div class="ev-card-top-row">' +
        '<div class="ev-card-icon"><span class="material-symbols-outlined">event_available</span></div>' +
        '<div class="ev-card-body">' +
          '<div class="ev-card-titulo">' + _evAntResumenRango(r) + '</div>' +
          '<div class="ev-ant-card-sub">' + _evAntResumenDetalle(r) + '</div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="ev-ant-card-edit" onclick="_evAntEditar(\'' + r.id + '\')" title="Editar">' +
        '<span class="material-symbols-outlined">edit</span>' +
      '</button>' +
      '<button type="button" class="ev-ant-card-del" onclick="_evAntEliminar(\'' + r.id + '\')" title="Eliminar">' +
        '<span class="material-symbols-outlined">delete</span>' +
      '</button>' +
    '</div>';
  }).join('');
}

function _evAntResumenRango(r) {
  if (r.tipoRango === 'meses') {
    var anio = new Date().getFullYear();
    var nombres = (r.meses || []).map(function(m) { return NOMBRES_MESES[m - 1]; });
    return 'Meses: ' + nombres.join(', ') + ' ' + anio;
  }
  if (r.tipoRango === 'periodo') {
    return 'Del ' + _evAntFechaLegible(r.fechaDesde) + ' al ' + _evAntFechaLegible(r.fechaHasta);
  }
  return 'Desde el ' + _evAntFechaLegible(r.fechaDesde) + ', sin fecha de fin';
}
function _evAntFechaLegible(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  if (p.length !== 3) return iso;
  return parseInt(p[2], 10) + ' de ' + NOMBRES_MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
}
function _evAntResumenDetalle(r) {
  var tipos = (r.tiposEvento && r.tiposEvento.length) ? r.tiposEvento.join(', ') : 'Todos los tipos';
  return 'Tipos: ' + tipos + ' · Estado: ' + r.estado;
}

// Sheet de confirmación "Eliminar asistencia anticipada" (#ev-ant-sheet-eliminar,
// index.html) -- reemplaza el confirm() nativo que tenía esta función antes,
// mismo patrón abrir/cerrar que #ev-sheet-cancelar (ver
// _evAbrirSheetCancelar()/_evCerrarSheetCancelar(), más arriba en este
// archivo): display block + transform vía doble rAF al abrir,
// `_registrarOverlayAbierto()` para que el botón atrás del navegador (o el
// swipe-to-dismiss de shared/bsheet.js) lo cierre igual que a cualquier otro
// sheet. El id de la regla pendiente viaja en `_evAntEliminarPendienteId`
// (variable de módulo, mismo criterio que `_evCancelarPendienteId`) en vez
// de un data-attribute -- el sheet es único, no hay 2 instancias abiertas a
// la vez que puedan pisarse.
var _evAntEliminarPendienteId = null;
function _evAntEliminar(id) {
  _evAntEliminarPendienteId = id;
  var ov = document.getElementById('ev-ant-sheet-eliminar-overlay');
  var sh = document.getElementById('ev-ant-sheet-eliminar');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(_evAntCerrarSheetEliminar);
}
function _evAntCerrarSheetEliminar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var ov = document.getElementById('ev-ant-sheet-eliminar-overlay');
  var sh = document.getElementById('ev-ant-sheet-eliminar');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
// Botón "Eliminar" del sheet -- cierra primero (mismo orden que
// `_evConfirmarCancelarEvento()`) y recién ahí dispara el DELETE contra
// Supabase (mismo mecanismo que `_evOffseasonEliminar()`, más abajo en este
// archivo), sin `Prefer` (no hace falta el registro borrado de vuelta,
// PostgREST responde 204 por default).
function _evAntConfirmarEliminar(btn) {
  if (!_evAntEliminarPendienteId) return;
  var id = _evAntEliminarPendienteId;
  _evAntEliminarPendienteId = null;
  _evAntCerrarSheetEliminar();
  mostrarCargando('Eliminando...');
  fetch(SUPABASE_URL + '/rest/v1/reglas_asistencia?id=eq.' + id, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then(function(r) {
    ocultarCargando();
    if (!r.ok) { mostrarToast('No se pudo eliminar.', 'error'); return; }
    _evAntRecargarLista();
  }).catch(function() {
    ocultarCargando();
    mostrarToast('No se pudo eliminar la asistencia anticipada.', 'error');
  });
}

// Ícono "editar" de cada card del resumen (ver "Cambios recientes", junto al
// de eliminar) -- abre el mismo wizard de "Nueva asistencia anticipada"
// pre-cargado con los datos de esa regla, ver _evAntIniciarWizard(regla).
function _evAntEditar(id) {
  var regla = _evAntReglas.filter(function(r) { return r.id === id; })[0];
  if (!regla) return;
  _evAntIniciarWizard(regla);
}

function _evAntBack() {
  var wizard = document.getElementById('ev-ant-wizard');
  if (wizard && wizard.style.display !== 'none') { _evAntCerrarWizard(); }
  else { ir('s-eventos'); }
}

// ─── Wizard (ver "Cambios recientes" -- ya NO es una secuencia de pasos:
// una sola pantalla con 2 secciones en acordeón, "Estado a aplicar" y
// "Frecuencia" (_evAntToggleAcordeon(), más abajo), un solo botón "Aplicar"
// habilitado solo cuando ambas están completas (_evAntActualizarBotonAplicar()).
// Sin botón "Atrás" propio, redundante con la flecha del header
// (#ev-ant-header, _evAntBack()). ─────────────────────

// Sin argumento: wizard "en blanco" ("+ Nueva asistencia anticipada", arranca
// con "Estado a aplicar" abierto y "Frecuencia" cerrado). Con `regla` (desde
// _evAntEditar()): pre-carga ambas secciones con los valores existentes y
// arrancan las 2 COLAPSADAS (ya resueltas, listas para tocar y cambiar) --
// `_evAntData.editando` guarda el `id` (uuid) de la regla vieja para el
// flujo eliminar+crear de _evAntAplicar().
function _evAntIniciarWizard(regla) {
  _evAntData = {
    tipoRango: regla ? regla.tipoRango : null,
    meses: (regla && regla.meses) ? regla.meses.slice() : [],
    fechaDesde: regla ? (regla.fechaDesde || null) : null,
    fechaHasta: regla ? (regla.fechaHasta || null) : null,
    estado: regla ? regla.estado : null,
    editando: regla ? regla.id : null
  };
  // Editar una regla existente ya trae fecha(s) resueltas -- el botón
  // restablecer debe estar visible desde el arranque, no recién tras un
  // toque nuevo del usuario. Wizard "en blanco": arranca sin tocar, oculto.
  _evAntCal.periodo.touched = !!(regla && regla.fechaDesde);
  _evAntCal.indefinido.touched = !!(regla && regla.fechaDesde);
  document.getElementById('ev-ant-resumen').style.display = 'none';
  document.getElementById('ev-ant-wizard').style.display = 'block';
  window.scrollTo(0, 0);

  document.querySelectorAll('#ev-ant-wizard .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  document.querySelectorAll('#ev-ant-wizard .ev-rsvp-opt').forEach(function(o) { o.classList.remove('activa'); });

  var estadoSeg = document.getElementById('ev-ant-estado-seg');
  if (_evAntData.estado && estadoSeg) {
    var opt = estadoSeg.querySelector('.ev-rsvp-opt[data-estado="' + _evAntData.estado + '"]');
    if (opt) opt.classList.add('activa');
  }
  if (estadoSeg) _evPosicionarRsvpSlider(estadoSeg, false);

  ['ev-ant-paso1-meses', 'ev-ant-paso1-periodo', 'ev-ant-paso1-indefinido'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });

  if (_evAntData.tipoRango) {
    var pill = document.querySelector('#ev-ant-tipo-pills .aj-pill[data-val="' + _evAntData.tipoRango + '"]');
    if (pill) pill.classList.add('activa');
    _evAntMostrarSubFrecuencia();
  } else {
    document.body.classList.remove('ev-ant-cal-abierto');
  }

  _evAntActualizarResumenEstado();
  _evAntActualizarResumenFrecuencia();

  // Nuevo: arranca con "Estado a aplicar" abierto. Edición: ambas secciones
  // ya tienen valor, arrancan colapsadas (ver _evAntEditar() más arriba).
  _evAntSetAcordeon('estado', !regla);
  _evAntSetAcordeon('frecuencia', false);

  _evAntActualizarFooter();
}

function _evAntCerrarWizard() {
  _evAntOcultarFooter();
  document.getElementById('ev-ant-wizard').style.display = 'none';
  if (_evAntReglas.length > 0) {
    document.getElementById('ev-ant-resumen').style.display = 'block';
  } else {
    ir('s-eventos');
  }
}

function _evAntCerrarWizardAResumen() {
  _evAntOcultarFooter();
  document.getElementById('ev-ant-wizard').style.display = 'none';
  document.getElementById('ev-ant-resumen').style.display = 'block';
}

function _evAntActualizarFooter() {
  var footer = document.getElementById('cta-footer-eventos-anticipada');
  if (footer) footer.style.display = 'block';
  document.body.classList.add('ev-ant-footer-visible');
  var btn = document.getElementById('ev-ant-footer-aplicar');
  if (btn) btn.onclick = _evAntAplicar;
  _evAntActualizarBotonAplicar();
}
// `body.ev-ant-footer-visible` (ver css/eventos.css) sube el #app-toast
// global (css/estilos.css, bottom:28px fijo de fábrica) para que quede
// justo encima de #cta-footer-eventos-anticipada en vez de superpuesto a
// las pills del wizard -- togglea junto con el propio footer, nunca suelto.
function _evAntOcultarFooter() {
  var footer = document.getElementById('cta-footer-eventos-anticipada');
  if (footer) footer.style.display = 'none';
  document.body.classList.remove('ev-ant-footer-visible');
  document.body.classList.remove('ev-ant-cal-abierto');
}

// ── Acordeón de 2 secciones (ver "Cambios recientes" -- reemplaza la
// secuencia de pasos anterior). Mismo TIPO de transición que ya usa el
// acordeón de banners de Mi Liga (.admin-dash-banner-*, adminToggleBanner()/
// js/admin.js -- .datos-seccion* de css/perfil.css, la otra referencia
// nombrada en el pedido ("Ajustes"), resultó ser CSS muerto de un rediseño
// anterior, sin ningún consumidor real hoy, así que se siguió Mi Liga en su
// lugar). A diferencia de Mi Liga (max-height medido con `scrollHeight` en
// cada toggle), acá alcanza con un techo fijo generoso vía clase `.abierto`
// (mismo criterio que `.datos-seccion-body.abierta{max-height:2500px}`,
// css/perfil.css) -- el contenido de "Frecuencia" cambia de alto según la
// sub-elección (grilla de meses vs. calendario), un techo fijo ya cubre
// cualquier combinación sin necesitar re-medir en cada cambio.
// Header y body YA NO viven anidados en un `.ev-ant-acc` común (ver
// "Cambios recientes" -- headers sticky): `_evAntSetAcordeon()` togglea
// `.abierto` en los 2 elementos por separado (`#ev-ant-acc-<cual>-header`/
// `-body`), mismo resultado visual de antes vía selectores CSS propios en
// vez de un solo padre con `.abierto`. */
function _evAntSetAcordeon(cual, abrir) {
  var header = document.getElementById('ev-ant-acc-' + cual + '-header');
  var body = document.getElementById('ev-ant-acc-' + cual + '-body');
  if (header) header.classList.toggle('abierto', abrir);
  if (body) body.classList.toggle('abierto', abrir);
  _evAntActualizarStickyAcordeon();
}
// Header tocado -- solo 1 sección abierta a la vez (mismo criterio que
// _adminCerrarTodoAbierto()/adminToggleBanner(), js/admin.js): abrir una
// cierra la otra. Tocar el header de la que ya está abierta la colapsa sin
// abrir ninguna otra.
function _evAntToggleAcordeon(cual) {
  var header = document.getElementById('ev-ant-acc-' + cual + '-header');
  var estabaAbierto = header && header.classList.contains('abierto');
  _evAntSetAcordeon('estado', false);
  _evAntSetAcordeon('frecuencia', false);
  if (!estabaAbierto) _evAntSetAcordeon(cual, true);
}

// Headers sticky apilados (ver "Cambios recientes") -- mismo mecanismo que
// `_evDetalleActualizarSticky()` (niveles de #s-eventos-detalle, más abajo
// en este archivo): el `top` de cada nivel se mide con `offsetHeight` REAL
// del/de los nivel(es) de arriba, nunca un valor fijo (un alto fijo se
// rompería apenas el resumen colapsado de "Estado a aplicar" ocupe más de 1
// línea en una pantalla angosta). "Nivel 0" acá es `#ev-ant-header` (nav
// propia de la pantalla, ya `.app-nav-sticky`) -- "Estado a aplicar" pega
// justo debajo, "Frecuencia" pega debajo de ese.
function _evAntActualizarStickyAcordeon() {
  var header0 = document.getElementById('ev-ant-header');
  var h1 = document.getElementById('ev-ant-acc-estado-header');
  var h2 = document.getElementById('ev-ant-acc-frecuencia-header');
  if (!header0 || !h1 || !h2) return;
  var offset0 = header0.offsetHeight;
  h1.style.top = offset0 + 'px';
  h2.style.top = (offset0 + h1.offsetHeight) + 'px';
}
window.addEventListener('resize', function() { _evAntActualizarStickyAcordeon(); });

function _evAntSelUnica(el) {
  var cont = el.parentElement;
  cont.querySelectorAll('.aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
}

// "Estado a aplicar" -- reusa EXACTAMENTE el mismo componente que la barra
// "¿Asistiré?" de la card de evento (.ev-rsvp-seg/.ev-rsvp-opt/
// .ev-rsvp-slider, ver css/eventos.css y _evRsvpBarraHtml()/
// _evPosicionarRsvpSlider() más arriba en este archivo) -- acá es solo la
// selección PREVIA a "Aplicar" del wizard, no dispara ningún marcado
// inmediato (a diferencia de _evMarcarAsistencia(), que sí postea al
// backend al toque). _evPosicionarRsvpSlider() ya es genérica sobre
// cualquier `.ev-rsvp-seg` real, se reusa tal cual sin tocarla. Al elegir
// (ver "Cambios recientes"): colapsa esta sección y expande "Frecuencia"
// automáticamente -- el usuario puede volver a tocar este header para
// reabrirlo y cambiar su elección (_evAntToggleAcordeon()).
function _evAntSelEstado(el) {
  var seg = el.parentElement;
  seg.querySelectorAll('.ev-rsvp-opt').forEach(function(o) { o.classList.remove('activa'); });
  el.classList.add('activa');
  _evPosicionarRsvpSlider(seg, true);
  _evAntData.estado = el.getAttribute('data-estado');
  _evAntActualizarResumenEstado();
  _evAntSetAcordeon('estado', false);
  _evAntSetAcordeon('frecuencia', true);
  _evAntActualizarBotonAplicar();
}

function _evAntActualizarResumenEstado() {
  var el = document.getElementById('ev-ant-acc-estado-resumen');
  if (el) el.textContent = _evAntData.estado || '';
}

// Frecuencia (pill), con reveal inline de meses/período/indefinido según la
// elección.
function _evAntSelFrecuencia(el) {
  _evAntSelUnica(el);
  var nuevo = el.dataset.val;
  // Cambiar de frecuencia descarta fechaDesde/fechaHasta ya elegidas -- ese
  // par se comparte entre "Por período"/"Indefinido" (ver _evAntAplicar()),
  // así que sin este reset una fecha elegida en un modo quedaba viva (y
  // potencialmente inválida, ej. Hasta anterior a la nueva Desde) al saltar
  // al otro.
  if (nuevo !== _evAntData.tipoRango) {
    _evAntData.fechaDesde = null; _evAntData.fechaHasta = null;
    _evAntCal.periodo.touched = false; _evAntCal.indefinido.touched = false;
  }
  _evAntData.tipoRango = nuevo;
  _evAntMostrarSubFrecuencia();
  _evAntActualizarResumenFrecuencia();
  _evAntActualizarBotonAplicar();
}

// Muestra el sub-bloque (meses/período/indefinido) que corresponde a
// `_evAntData.tipoRango`, con un fade en vez de un corte abrupto (ver
// "Cambios recientes" -- reusa @keyframes fadeIn de css/estilos.css, mismo
// mecanismo ya usado en el resto de la app -- ej. toggleMesHistorial(),
// js/home.js -- reflow forzado con `void el.offsetWidth` para poder
// re-disparar la animation en cada cambio de pill, no solo la primera vez).
function _evAntMostrarSubFrecuencia() {
  var bMeses = document.getElementById('ev-ant-paso1-meses');
  var bPeriodo = document.getElementById('ev-ant-paso1-periodo');
  var bIndef = document.getElementById('ev-ant-paso1-indefinido');
  bMeses.style.display = 'none'; bPeriodo.style.display = 'none'; bIndef.style.display = 'none';
  // "Por período"/"Indefinido" muestran el calendario inline, que en pantallas
  // bajas (ej. 667px de alto, iPhone SE) llega a ocupar hasta la franja del
  // toast subido (ver body.ev-ant-footer-visible #app-toast, css/eventos.css)
  // -- confirmado con Playwright, la última fila de días quedaba tapada por
  // un toast de error tras "Aplicar". "Por meses" no lo necesita, su grilla
  // de 4 filas es más corta y no llega a esa franja en ningún alto probado.
  document.body.classList.toggle('ev-ant-cal-abierto', _evAntData.tipoRango === 'periodo' || _evAntData.tipoRango === 'indefinido');
  var activo = null;
  if (_evAntData.tipoRango === 'meses') {
    activo = bMeses; activo.style.display = 'block';
    _evAntRenderMesesGrid();
  } else if (_evAntData.tipoRango === 'periodo') {
    activo = bPeriodo; activo.style.display = 'block';
    _evAntCal.periodo.mostrado = _evAntData.fechaDesde || _evAntHoyISO();
    _evAntCalRender('periodo');
    _evAntCalActualizarResumen('periodo');
  } else if (_evAntData.tipoRango === 'indefinido') {
    activo = bIndef; activo.style.display = 'block';
    if (!_evAntData.fechaDesde) _evAntData.fechaDesde = _evAntHoyISO();
    _evAntCal.indefinido.mostrado = _evAntData.fechaDesde;
    _evAntCalRender('indefinido');
    _evAntCalActualizarResumen('indefinido');
  }
  if (activo) {
    void activo.offsetWidth;
    activo.style.animation = 'fadeIn 0.25s ease';
  }
}

function _evAntHoyISO() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _evAntRenderMesesGrid() {
  var cont = document.getElementById('ev-ant-meses-grid'); if (!cont) return;
  cont.innerHTML = '';
  var mesActual = new Date().getMonth(); // 0-indexado
  NOMBRES_MESES.forEach(function(nombre, idx) {
    var mesNum = idx + 1;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ev-ant-mes-cell' + (_evAntData.meses.indexOf(mesNum) !== -1 ? ' activo' : '');
    btn.textContent = nombre;
    if (idx < mesActual) {
      btn.classList.add('deshabilitado');
      btn.disabled = true;
    } else {
      btn.onclick = function() { _evAntToggleMes(mesNum, btn); };
    }
    cont.appendChild(btn);
  });
}
function _evAntToggleMes(mesNum, btn) {
  var i = _evAntData.meses.indexOf(mesNum);
  if (i === -1) { _evAntData.meses.push(mesNum); btn.classList.add('activo'); }
  else { _evAntData.meses.splice(i, 1); btn.classList.remove('activo'); }
  _evAntActualizarResumenFrecuencia();
  _evAntActualizarBotonAplicar();
}

/* ── Calendario inline de "Por período"/"Indefinido" (ev-ant-cal-*) --
   reemplaza el modal de calendario genérico (abrirPickerMisDatos(),
   shared/date-picker.js -- bug real: arranca en 1990) por un panel SIEMPRE
   inline, sin abrir nada. Reusa el layout real de la grilla del panel de
   mes de Home Eventos (.ev-cal-grid/.ev-cal-dow/.ev-cal-celda/.ev-cal-num/
   .ev-ajeno, css/eventos.css, y los helpers de fecha genéricos
   _evCalMesDe()/_evLunesDeSemana()/_evToISO()/_evParseISO()/_evFechaCmp() de
   más arriba en este archivo) -- pero es un componente NUEVO scopeado a
   este wizard (_evAntCal*, con su propio mes mostrado por selector), el
   panel de mes original de Home (_evCalRenderMes()/_evAbrirCalendario()) no
   se toca. "Por período" y "Indefinido" comparten `_evAntData.fechaDesde`/
   `fechaHasta` (mismos campos que ya arma el payload, ver _evAntAplicar())
   -- `_evAntSelFrecuencia()` los resetea al cambiar de modo. */
var _evAntCal = { periodo: { mostrado: null, prevDesde: null, prevHasta: null, touched: false }, indefinido: { mostrado: null, prevDesde: null, prevHasta: null, touched: false } };

function _evAntCalMoverMes(cual, dir) {
  var m = _evCalMesDe(_evAntCal[cual].mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evAntCal[cual].mostrado = _evToISO(new Date(year, month, 1));
  _evAntCalRender(cual);
}

// "Por período": ida y vuelta -- primer toque (o cualquier toque sin
// "Hasta" pendiente) fija Desde y limpia Hasta; un toque posterior (fecha
// >= Desde) fija Hasta; un toque anterior a Desde reemplaza Desde (empieza
// de nuevo, en vez de quedar en un rango invertido). "Indefinido": un solo
// toque siempre reemplaza la única fecha (Desde), sin Hasta. Guard de fecha
// pasada (ver "Cambios recientes" -- una asistencia anticipada nunca debería
// poder aplicarse retroactivamente): defensivo además del `onclick` que
// _evAntCalRender() ya omite en las celdas pasadas, por si algo más
// disparara esta función con una fecha inválida.
function _evAntCalTocarDia(cual, iso) {
  if (_evFechaCmp(iso, _evHoyISO()) < 0) return;
  if (cual === 'indefinido') {
    _evAntData.fechaDesde = iso;
  } else {
    var desde = _evAntData.fechaDesde, hasta = _evAntData.fechaHasta;
    if (!desde || hasta) {
      _evAntData.fechaDesde = iso;
      _evAntData.fechaHasta = null;
    } else if (_evFechaCmp(iso, desde) < 0) {
      _evAntData.fechaDesde = iso;
    } else {
      _evAntData.fechaHasta = iso;
    }
  }
  _evAntCal[cual].touched = true;
  _evAntCalRender(cual);
  // Alto animado de #ev-ant-periodo-fila/#ev-ant-indefinido-fila (contenedor
  // de la línea de fecha(s) + botón "Restablecer", ver "Cambios recientes"):
  // antes _evAntCalActualizarResumen() mutaba el contenido (texto + botón)
  // de una, así que el alto de la fila -- mayor con el botón visible que sin
  // él -- cambiaba de golpe en el mismo instante, empujando el layout sin
  // transición. Técnica FLIP estándar ya usada en este archivo
  // (_evAbrirPanel()/_evCerrarPanel(), mismo `void el.offsetHeight` para
  // forzar el reflow síncrono que "congela" el alto viejo antes de dejar que
  // el nuevo se anime): se mide el alto ANTES de mutar (fuerza reflow para
  // que quede como estado real del que partir), se muta, y se vuelve a medir
  // DESPUÉS -- con `.ev-ant-rango-fila { transition: max-height }` (css/eventos.css)
  // ya declarado, el cambio de un valor numérico a otro anima solo. Mismo
  // instante que el fadeIn propio del botón (_evAntSetBotonRestablecerVisible()),
  // así que ambos leen como un solo movimiento, no 2 pasos separados.
  var fila = document.getElementById(cual === 'periodo' ? 'ev-ant-periodo-fila' : 'ev-ant-indefinido-fila');
  if (fila) { fila.style.maxHeight = fila.scrollHeight + 'px'; void fila.offsetHeight; }
  _evAntCalActualizarResumen(cual);
  if (fila) fila.style.maxHeight = fila.scrollHeight + 'px';
  _evAntActualizarResumenFrecuencia();
  _evAntActualizarBotonAplicar();
}

// Con `touched` (ya había fecha(s) elegida(s) en pantalla): las pills y el
// botón "Restablecer" fadean juntos ANTES de tocar nada de estado -- si se
// reseteara `_evAntData` de una y se llamara a _evAntCalActualizarResumen()
// de inmediato (como antes), el texto instructivo largo ("Toca una fecha en
// el calendario para empezar") reemplaza a las pills en el mismo instante en
// que el botón recién empieza su propio fadeOut de 200ms (ver
// _evAntSetBotonRestablecerVisible()) -- 2 timings independientes que
// generan una ventana donde el texto ya creció pero el botón todavía ocupa
// su lugar, empujando el layout (salto visible antes de que el botón
// desaparezca). Acá los 2 elementos fadean a la vez con la misma duración
// (200ms) y el swap real de contenido (texto instructivo + reset de estado)
// recién pasa cuando ambos ya están invisibles -- ningún reflow queda a la
// vista.
function _evAntCalRestablecer(cual) {
  var st = _evAntCal[cual];
  function aplicar() {
    _evAntData.fechaDesde = null;
    _evAntData.fechaHasta = null;
    st.touched = false;
    _evAntCalRender(cual);
    _evAntCalActualizarResumen(cual);
    _evAntActualizarResumenFrecuencia();
    _evAntActualizarBotonAplicar();
  }
  if (!st.touched) { aplicar(); return; }
  var cont = document.getElementById(cual === 'periodo' ? 'ev-ant-periodo-resumen' : 'ev-ant-indefinido-resumen');
  var btn = document.getElementById(cual === 'periodo' ? 'ev-ant-btn-restablecer' : 'ev-ant-btn-restablecer-indefinido');
  if (cont) cont.style.animation = 'fadeOut 0.2s ease forwards';
  if (btn) btn.style.animation = 'fadeOut 0.2s ease forwards';
  // Celdas del calendario marcadas como seleccionadas (.ev-ant-cal-sel/
  // .ev-ant-cal-en-rango, css/eventos.css) -- mismo fade coordinado, mismos
  // 200ms. A diferencia de cont/btn (animation inline), acá se quitan las
  // clases DIRECTO sobre las celdas YA renderizadas (no se espera al
  // re-render de aplicar()) para que el `transition` de `.ev-cal-celda`
  // tenga un estado real "antes" del que animar -- _evAntCalRender() destruye
  // y recrea toda la grilla (innerHTML) en cada toque, así que si se
  // esperara a ese re-render el cambio ya llegaría con las clases afuera de
  // entrada, sin nada que transicionar (nodos nuevos, sin fade posible).
  var calCont = document.getElementById(cual === 'periodo' ? 'ev-ant-cal-periodo' : 'ev-ant-cal-indefinido');
  if (calCont) {
    calCont.querySelectorAll('.ev-ant-cal-sel, .ev-ant-cal-en-rango').forEach(function(celda) {
      celda.classList.remove('ev-ant-cal-sel', 'ev-ant-cal-en-rango');
    });
  }
  // Alto animado de la fila (ver "Cambios recientes" -- misma técnica FLIP
  // que _evAntCalTocarDia(), pero acá el swap real de contenido recién pasa
  // DENTRO de aplicar(), a los 200ms -- si se esperara a ese momento para
  // recién ahí medir/animar, el colapso arrancaría DESPUÉS del fade en vez
  // de junto con él (2 movimientos en fila, no 1 solo). Se mide el alto
  // FINAL de antemano con una mutación temporal (texto instructivo sin
  // pills + botón oculto) que se revierte en el mismo tick, antes de que el
  // navegador llegue a pintarla -- invisible para el usuario, pero da un
  // valor real del que animar `max-height` en paralelo con el fadeOut de
  // arriba, mismos 200ms.
  var fila = document.getElementById(cual === 'periodo' ? 'ev-ant-periodo-fila' : 'ev-ant-indefinido-fila');
  if (fila) {
    var altoActual = fila.scrollHeight;
    var contHtmlOriginal = cont ? cont.innerHTML : null;
    var btnDisplayOriginal = btn ? btn.style.display : null;
    if (cont) cont.innerHTML = '<span class="ev-ant-rango-vacio">Toca una fecha en el calendario para empezar</span>';
    if (btn) btn.style.display = 'none';
    var altoFinal = fila.scrollHeight;
    if (cont) cont.innerHTML = contHtmlOriginal;
    if (btn) btn.style.display = btnDisplayOriginal;
    fila.style.maxHeight = altoActual + 'px';
    void fila.offsetHeight;
    fila.style.maxHeight = altoFinal + 'px';
  }
  setTimeout(function() {
    if (btn) { btn.style.display = 'none'; btn.dataset.visible = '0'; }
    aplicar();
  }, 200);
}

// Formato corto d/m/aaaa -- usado dentro de las pills ev-ant-fecha-pill
// (a diferencia de _evAntFechaLegible(), formato largo, usado en el resumen
// de #ev-ant-lista).
function _evAntFechaCorta(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  if (p.length !== 3) return iso;
  return parseInt(p[2], 10) + '/' + parseInt(p[1], 10) + '/' + p[0];
}

// Pill de fecha individual del resumen -- fade PROPIO (ver "Cambios
// recientes" -- antes el fade vivía en el contenedor entero, `cont` en
// _evAntCalActualizarResumen(), así que CUALQUIER cambio re-fadeaba la línea
// completa, incluida la pill de Desde ya visible al tocar solo Hasta). Acá
// el `style="animation:..."` se aplica solo cuando `animar` es true (esta
// pill puntual cambió de valor respecto al render anterior, ver
// `_evAntCal[cual].prevDesde`/`prevHasta` más abajo) -- las pills que no
// cambiaron se recrean igual (innerHTML completo se reconstruye siempre,
// más simple que un diff de nodos) pero SIN animation inline, así que
// aparecen ya en su opacity final, sin parpadeo.
function _evAntFechaPillHtml(iso, cual, animar) {
  var style = animar ? ' style="animation:fadeIn 0.2s ease"' : '';
  return '<span class="ev-ant-fecha-pill" onclick="_evAntFocoCalendario(\'' + cual + '\')"' + style + '>' + _evAntFechaCorta(iso) + '</span>';
}

// Resumen de "Por período" (#ev-ant-periodo-resumen, ver "Cambios recientes"
// -- reemplaza las 2 pills fijas "Desde el/hasta el", vacías o llenas, por
// una sola línea que cambia de FORMA según cuánto haya elegido el usuario,
// no solo de contenido): sin nada elegido, texto instructivo (nunca
// "Desde el ___ hasta el ___" vacío); con solo Desde, "Del <fecha>" sin
// mención de "al..." (no queda pendiente algo que no aplica todavía); con
// las 2, "Del <fecha> al <fecha>". Las fechas siguen usando `.ev-ant-fecha-pill`
// (mismo chip visual de antes) + `_evAntFocoCalendario('periodo')` al
// tocarlas -- solo el texto instructivo (sin fecha) no lleva pill ni foco,
// no hay nada a lo que "volver".
function _evAntPeriodoResumenHtml(desdeNueva, hastaNueva) {
  var desde = _evAntData.fechaDesde, hasta = _evAntData.fechaHasta;
  if (!desde) return '<span class="ev-ant-rango-vacio">Toca una fecha en el calendario para empezar</span>';
  var html = 'Del ' + _evAntFechaPillHtml(desde, 'periodo', desdeNueva);
  if (hasta) html += ' al ' + _evAntFechaPillHtml(hasta, 'periodo', hastaNueva);
  return html;
}

// "Indefinido" -- mismo criterio que _evAntPeriodoResumenHtml() ("Desde
// <fecha>", sin "al..." porque no hay Hasta -- texto "Desde" en vez de "Del",
// pedido explícito para diferenciarlo de "Por período", que sigue diciendo
// "Del X al Y" sin cambios): unificado con esa función en vez de mantener un
// textContent fijo "Desde el ___" aparte, para que las 2 pasen por el mismo
// mecanismo de fade de _evAntCalActualizarResumen(). En la práctica
// `fechaDesde` siempre está poblada acá (_evAntMostrarSubFrecuencia() la
// setea a hoy apenas se entra a esta sub-sección), así que el estado "vacío"
// no se ve en uso normal -- se cubre igual por el botón restablecer nuevo
// (ver #ev-ant-btn-restablecer-indefinido, index.html).
function _evAntIndefinidoResumenHtml(desdeNueva) {
  var desde = _evAntData.fechaDesde;
  if (!desde) return '<span class="ev-ant-rango-vacio">Toca una fecha en el calendario para empezar</span>';
  return 'Desde ' + _evAntFechaPillHtml(desde, 'indefinido', desdeNueva);
}

function _evAntCalActualizarResumen(cual) {
  var cont = document.getElementById(cual === 'periodo' ? 'ev-ant-periodo-resumen' : 'ev-ant-indefinido-resumen');
  if (!cont) return;
  var st = _evAntCal[cual];
  var desde = _evAntData.fechaDesde, hasta = _evAntData.fechaHasta;
  var desdeNueva = !!desde && desde !== st.prevDesde;
  var hastaNueva = cual === 'periodo' && !!hasta && hasta !== st.prevHasta;
  cont.innerHTML = cual === 'periodo' ? _evAntPeriodoResumenHtml(desdeNueva, hastaNueva) : _evAntIndefinidoResumenHtml(desdeNueva);
  if (!desde) {
    // Único caso que sigue fadeando el CONTENEDOR entero: volver al texto
    // instructivo (_evAntCalRestablecer()) -- no hay pill involucrada, así
    // que no hay nada puntual a lo que aplicarle el fade de arriba.
    void cont.offsetWidth;
    cont.style.animation = 'fadeIn 0.2s ease';
  } else {
    cont.style.animation = '';
  }
  st.prevDesde = desde;
  st.prevHasta = hasta;
  _evAntSetBotonRestablecerVisible(cual, st.touched);
}

// Botón "Restablecer" (ícono) -- oculto hasta que el usuario tocó al menos
// una fecha (`_evAntCal[cual].touched`, ver _evAntCalTocarDia()/
// _evAntCalRestablecer()/_evAntSelFrecuencia()/_evAntIniciarWizard()): no
// tiene sentido "restablecer" algo que nunca se tocó -- incluye el "Desde
// hoy" que "Indefinido" precarga solo, que no cuenta como un toque real.
// Aparece/desaparece con el mismo fadeIn/fadeOut (@keyframes, css/estilos.css)
// que el resto de estados de esta pantalla. `dataset.visible` guarda el
// estado ya aplicado para no re-disparar la animación en cada actualización
// del resumen (ej. tocar Hasta después de Desde no debe volver a fadear un
// botón que ya estaba visible).
function _evAntSetBotonRestablecerVisible(cual, mostrar) {
  var btn = document.getElementById(cual === 'periodo' ? 'ev-ant-btn-restablecer' : 'ev-ant-btn-restablecer-indefinido');
  if (!btn) return;
  var yaVisible = btn.dataset.visible === '1';
  if (!!mostrar === yaVisible) return;
  btn.dataset.visible = mostrar ? '1' : '0';
  if (mostrar) {
    btn.style.display = 'flex';
    void btn.offsetWidth;
    btn.style.animation = 'fadeIn 0.2s ease';
  } else {
    btn.style.animation = 'fadeOut 0.2s ease forwards';
    setTimeout(function() {
      if (btn.dataset.visible !== '1') btn.style.display = 'none';
    }, 200);
  }
}

// Texto del header colapsado de "Frecuencia" (#ev-ant-acc-frecuencia-resumen)
// -- vacío mientras no haya nada elegido todavía (el header simplemente no
// muestra nada extra, ver .ev-ant-acc-resumen:empty en css/eventos.css).
function _evAntResumenFrecuenciaTexto() {
  if (_evAntData.tipoRango === 'meses') {
    if (!_evAntData.meses.length) return '';
    var nombres = _evAntData.meses.slice().sort(function(a, b) { return a - b; }).map(function(m) { return NOMBRES_MESES[m - 1]; });
    return nombres.join(', ');
  }
  if (_evAntData.tipoRango === 'periodo') {
    if (!_evAntData.fechaDesde || !_evAntData.fechaHasta) return '';
    return _evAntFechaCorta(_evAntData.fechaDesde) + ' - ' + _evAntFechaCorta(_evAntData.fechaHasta);
  }
  if (_evAntData.tipoRango === 'indefinido') {
    if (!_evAntData.fechaDesde) return '';
    return 'Desde ' + _evAntFechaCorta(_evAntData.fechaDesde);
  }
  return '';
}
function _evAntActualizarResumenFrecuencia() {
  var el = document.getElementById('ev-ant-acc-frecuencia-resumen');
  if (el) el.textContent = _evAntResumenFrecuenciaTexto();
}

// Completa un tipoRango = tiene todo lo que _evAntAplicar() necesita para
// ese modo (mismas 3 reglas que antes validaba _evAntAplicar() al tocar
// "Aplicar" -- ahora se evalúan en cada cambio para habilitar/deshabilitar
// el botón, ver _evAntActualizarBotonAplicar()).
function _evAntFrecuenciaValida() {
  if (_evAntData.tipoRango === 'meses') return _evAntData.meses.length > 0;
  if (_evAntData.tipoRango === 'periodo') return !!(_evAntData.fechaDesde && _evAntData.fechaHasta && _evAntData.fechaHasta >= _evAntData.fechaDesde);
  if (_evAntData.tipoRango === 'indefinido') return !!_evAntData.fechaDesde;
  return false;
}
function _evAntCompleto() {
  return !!_evAntData.estado && _evAntFrecuenciaValida();
}
// Botón "Aplicar" del footer -- habilitado solo con Estado Y Frecuencia
// completos (ver "Cambios recientes"), sin importar qué sección del
// acordeón esté abierta/cerrada en ese momento.
function _evAntActualizarBotonAplicar() {
  var btn = document.getElementById('ev-ant-footer-aplicar');
  if (btn) btn.disabled = !_evAntCompleto();
}

// Tocar cualquiera de las 2 pills "Desde"/"Hasta" hace foco en el calendario
// inline de abajo (SIEMPRE visible, nunca un modal/sheet aparte -- ver
// _evAntCalRender()) -- el mecanismo de selección (primer toque = Desde,
// segundo = Hasta) ya vive en _evAntCalTocarDia(), esto solo lleva la vista
// hasta ahí.
function _evAntFocoCalendario(cual) {
  var el = document.getElementById(cual === 'periodo' ? 'ev-ant-cal-periodo' : 'ev-ant-cal-indefinido');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// El día de HOY siempre lleva el stroke rojo (`.ev-ant-cal-hoy`, ver
// css/eventos.css) sin importar la selección -- independiente de
// `.ev-ant-cal-sel`/`.ev-ant-cal-en-rango`, nunca se pisan entre sí (ver esa
// misma regla CSS, `box-shadow` en vez de `background`). Fechas pasadas (ver
// "Cambios recientes" -- una asistencia anticipada nunca debería poder
// aplicarse retroactivamente): `.ev-ant-cal-pasado` (gris, sin interacción,
// ver css/eventos.css) + SIN el `onclick` (no solo deshabilitado
// visualmente) -- aplica igual navegando a meses anteriores con `_evAntCalMoverMes()`,
// esta misma función se re-ejecuta en cada cambio de mes.
function _evAntCalRender(cual) {
  var contId = cual === 'periodo' ? 'ev-ant-cal-periodo' : 'ev-ant-cal-indefinido';
  var cont = document.getElementById(contId); if (!cont) return;
  var m = _evCalMesDe(_evAntCal[cual].mostrado);
  var labelEl = document.getElementById('ev-ant-cal-' + cual + '-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes);
  finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var desde = _evAntData.fechaDesde, hasta = _evAntData.fechaHasta;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (desde && celdaIso === desde) clases += ' ev-ant-cal-sel';
    if (cual === 'periodo') {
      if (hasta && celdaIso === hasta) clases += ' ev-ant-cal-sel';
      if (desde && hasta && _evFechaCmp(celdaIso, desde) > 0 && _evFechaCmp(celdaIso, hasta) < 0) clases += ' ev-ant-cal-en-rango';
    }
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_evAntCalTocarDia(\'' + cual + '\',\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '>' +
      '<div class="ev-cal-num">' + cur.getDate() + '</div>' +
    '</div>';
    cur.setDate(cur.getDate() + 1);
  }
  // Fade al repintar la grilla (ver MANIFEST.md "Cambios recientes" --
  // pedido explícito sobre el calendario de Tareas, aplicado acá también
  // por ser el MISMO componente: cambiar de mes o tocar un día antes
  // reemplazaba `innerHTML` de golpe, sin ninguna señal visual del cambio).
  // `_evFadeSwap()` -- ya usado por el panel de mes del timeline principal,
  // reusado tal cual -- dispara tanto en `_evAntCalMoverMes()` (cambio de
  // mes) como en `_evAntCalTocarDia()` (selección de fecha), ambos re-llaman
  // a esta función.
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}

// Botón final -- Estado y Frecuencia ya están validados en tiempo real (ver
// _evAntCompleto(), el botón queda disabled hasta que ambos estén completos)
// así que acá solo queda un guard defensivo, arma el body y envía.
// Edición (ver "Cambios recientes", _evAntData.editando -- `id` uuid de la
// regla vieja, seteado por _evAntIniciarWizard(regla)/_evAntEditar()): no
// existe un UPDATE en el lugar, así que el frontend hace
// `DELETE ?id=eq.<editando>` seguido de un `POST` con los datos nuevos EN
// SECUENCIA, con un solo mostrarCargando()/ocultarCargando() para las 2
// llamadas -- el usuario no debe percibir que son 2 requests. Si el usuario
// no cambió nada, el flujo es idéntico (borra y vuelve a crear con los
// mismos datos), sin caso especial. Sin chequeo de solapamiento (ver el
// comentario del bloque de arriba -- se cayó con la migración a Supabase,
// decisión explícita de Victor).
function _evAntAplicar() {
  if (!_evAntCompleto()) return;
  if (_evAntData.tipoRango === 'indefinido') _evAntData.fechaDesde = _evAntData.fechaDesde || _evAntHoyISO();

  // Regla indefinida única: como no hay chequeo de solapamiento (ver el
  // comentario del bloque de arriba -- se cayó con la migración a
  // Supabase), esta validación puntual evita el caso más molesto que
  // dejaba sin cubrir -- 2 reglas 'indefinido' activas a la vez, donde
  // no hay forma de saber cuál "gana" (a diferencia de 'meses'/'periodo',
  // que sí tienen un rango acotado). Compara contra `_evAntReglas` (la
  // lista ya cargada en memoria, misma fuente que pinta el resumen) en vez
  // de pedirle al backend -- excluye `_evAntData.editando` para no
  // bloquearse a sí misma al reeditar una regla indefinida existente sin
  // cambiarle el tipo.
  if (_evAntData.tipoRango === 'indefinido') {
    var yaExisteIndefinida = _evAntReglas.some(function(r) {
      return r.tipoRango === 'indefinido' && r.id !== _evAntData.editando;
    });
    if (yaExisteIndefinida) {
      mostrarToast('Ya tienes una regla indefinida activa. Eliminala antes de crear una nueva.', 'error');
      return;
    }
  }

  var body = {
    nombre: E.nombre,
    tipo_rango: _evAntData.tipoRango,
    // Hardcodeado: la asistencia anticipada aplica únicamente a
    // Entrenamientos (ver "Cambios recientes" -- Torneos/Asambleas no son
    // recurrentes, ya no hay selector de tipos de evento en el wizard).
    // `.join(',')`, no un array real -- `tipos_evento` es una columna de
    // texto separado por comas (ver el comentario del bloque de arriba),
    // mismo formato que ya mandaba el cliente antes de esta migración.
    tipos_evento: ['Entrenamiento'].join(','),
    estado: _evAntData.estado,
    meses: null, fecha_desde: null, fecha_hasta: null
  };
  if (_evAntData.tipoRango === 'meses') body.meses = _evAntData.meses;
  else if (_evAntData.tipoRango === 'periodo') { body.fecha_desde = _evAntData.fechaDesde; body.fecha_hasta = _evAntData.fechaHasta; }
  else body.fecha_desde = _evAntData.fechaDesde;

  var editando = _evAntData.editando;

  function crear() {
    fetch(SUPABASE_URL + '/rest/v1/reglas_asistencia', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      _evAntRecargarLista(function() {
        ocultarCargando();
        _evAntCerrarWizardAResumen();
      });
    }).catch(function(e) {
      ocultarCargando();
      mostrarToast((e && e.message) || 'No se pudo aplicar la asistencia anticipada.', 'error');
    });
  }

  mostrarCargando(editando ? 'Guardando cambios...' : 'Aplicando...');
  if (editando) {
    fetch(SUPABASE_URL + '/rest/v1/reglas_asistencia?id=eq.' + editando, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      crear();
    }).catch(function(e) {
      ocultarCargando();
      mostrarToast((e && e.message) || 'No se pudo guardar los cambios.', 'error');
    });
  } else {
    crear();
  }
}

// Modal de conflicto (mismo idioma de animación que abrirModalInfoEstado()/
// cerrarModalInfoEstado(), js/ui.js -- ver MANIFEST.md "Reglas globales del
// proyecto", animación de entrada Y salida obligatoria).
function _evAntMostrarConflicto(regla) {
  var desc = document.getElementById('ev-ant-conflicto-desc');
  if (desc) desc.textContent = _evAntResumenRango(regla) + ' — ' + _evAntResumenDetalle(regla);
  var m = document.getElementById('modal-ant-conflicto');
  if (!m) return;
  m.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.opacity = '1'; }); });
  _registrarOverlayAbierto(_evAntCerrarConflicto);
}
function _evAntCerrarConflicto(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-ant-conflicto');
  if (!m) return;
  m.style.opacity = '0';
  setTimeout(function() { m.style.display = 'none'; }, 300);
}

/* ═══════════════════════════════════════════════════════
   VENUES -- "Editar lugares" (lista + formulario, #s-eventos-lugares/
   #s-eventos-lugar-form). Desde esta tanda, "Crear evento" (FAB) YA NO usa
   este formulario -- tiene su propio wizard de 2 pasos, ver "Crear evento"
   más abajo (_evCrear*, #s-eventos-crear). Ver MANIFEST.md, sección
   "Backend — Venues", para las firmas exactas de crearVenue/editarVenue/
   getVenues documentadas para Victor (Apps Script no vive en este repo,
   mismo criterio de honestidad ya establecido para Asistencia Anticipada
   más arriba: el contrato de parámetros es una convención razonable a
   confirmar contra Code.gs real).

   _evLugarData alimenta esta única pantalla: la lista la puebla para editar
   (_evLugarAbrirEditar), "+ Nuevo lugar" arranca en blanco
   (irEvLugarFormNuevo). _evLugarOrigen siempre vuelve a 's-eventos-lugares'
   (ambos caminos entran desde esa lista). Guarda con crearVenue (sin
   _evLugarData.fila) o editarVenue (con fila) -- misma entidad de backend,
   una fila de Venues.
   ═══════════════════════════════════════════════════════ */

var _evLugares = [];
var _evLugaresCargaId = 0;
// Fallback si Maps no puede geolocalizar -- constante propia (no
// _AJ_QUITO_LATLNG, js/perfil.js: ese archivo carga DESPUÉS de este, ver
// MANIFEST.md "Carga de scripts", así que depender de esa variable acá
// sería frágil/orden-dependiente).
var _EV_LUGAR_QUITO_LATLNG = { lat: -0.1807, lng: -78.4678 };
var _EV_LUGAR_UNIDAD_LABEL = { 'dias': 'días', 'semanas': 'semanas', 'meses': 'meses' };

// Fix real (ver "Cambios recientes" -- error al entrar a "Gestionar
// venues"): `action:'getVenues'` es la acción vieja de Apps Script,
// NUNCA desplegada tras la migración de Venues a Supabase (confirmado por
// auditoría de backend en una sesión anterior, "Acción no válida o no
// especificada") -- cada entrada a esta pantalla tiraba ese error. Pasa a
// `fetch()` directo a la REST API de Supabase, mismo mecanismo ya usado en
// el resto de esta sección para `temporadas_descanso`/`asistencias`, contra
// la tabla `venues` real (la misma que ya usa `adminGetVenues` -- Edge
// Function, `#s-eventos-editar` -- pero esa acción devuelve las filas
// crudas sin mapear; acá SÍ hace falta traducir a camelCase porque
// `_evLugares`/`_evLugarData` y el resto de este bloque ya esperan el shape
// viejo de `getVenues()`, ver `_evMapVenueSupabase()` más abajo).
// `order=lugar.asc` -- la columna real es `lugar`, no `nombre` (confirmado
// contra `supabase/functions/api/index.ts`, `adminGetVenues()`/
// `_mapaTipoIconoPorLugar()`, y contra el uso ya existente de
// `v.lugar` en `_evEditarRenderVenues()`, más arriba en este archivo).
function irEvLugares() {
  ir('s-eventos-lugares');
  document.getElementById('ev-lugares-lista').innerHTML = _evLugaresSkeletonHtml();
  var miCarga = ++_evLugaresCargaId;
  fetch(SUPABASE_URL + '/rest/v1/venues?select=*&order=lugar.asc', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(rows) {
    if (miCarga !== _evLugaresCargaId) return;
    _evLugares = (rows || []).map(_evMapVenueSupabase);
    _evLugaresRenderLista();
  }).catch(function(e) {
    if (miCarga !== _evLugaresCargaId) return;
    mostrarToast(e && e.message ? e.message : 'No se pudieron cargar los lugares.', 'error');
    var cont = document.getElementById('ev-lugares-lista');
    if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No se pudieron cargar los lugares.</p>';
  });
}

// Traduce las columnas reales (snake_case) de `venues` (Supabase) al mismo
// shape camelCase que ya esperaba TODO este bloque desde el contrato viejo
// de Apps Script (`getVenues()`, ver MANIFEST.md "Backend — Venues"):
// `{fila,nombre,mapsUrl,lat,lng,tipoIcono,requiereReserva,tipoRecurrencia,
// diasSemana,frecuenciaNumero,frecuenciaUnidad,fechaReferencia,hora}`.
// **Columnas CONFIRMADAS por Victor** contra el esquema real de `venues`
// (ver MANIFEST.md "Cambios recientes" -- tabla completa): `id`, `lugar`,
// `tipo_icono`, `requiere_reserva` (boolean real, `!== false`), `inicia`
// (la hora -- OJO, no `hora`), `google_maps`, `tipo` (no `tipo_recurrencia`),
// `dias` (no `dias_semana`), `frecuencia`, `unidad`, `fecha_referencia`.
// **`lat`/`lng` NO EXISTEN en la tabla** -- confirmado por Victor, no un
// nombre distinto: el pin del mapa no tiene forma de recentrarse a la
// ubicación real guardada al editar un venue existente (cae al fallback
// `_EV_LUGAR_QUITO_LATLNG`, ver `_evLugarInicializarMapa()` más abajo) hasta
// que la tabla sume esas columnas -- señalado, no resuelto acá (fuera de
// alcance de esta corrección, que es solo de mapeo).
function _evMapVenueSupabase(v) {
  return {
    fila: v.id,
    nombre: v.lugar || '',
    mapsUrl: v.google_maps || null,
    lat: null,
    lng: null,
    tipoIcono: v.tipo_icono || null,
    videoInstructivo: v.video_instructivo || null,
    requiereReserva: v.requiere_reserva !== false,
    tipoRecurrencia: v.tipo || null,
    diasSemana: _evLugarParseDiasSemana(v.dias),
    frecuenciaNumero: v.frecuencia || null,
    frecuenciaUnidad: v.unidad || null,
    fechaReferencia: v.fecha_referencia || null,
    hora: v.inicia || ''
  };
}
// `dias` -- nombre de columna confirmado por Victor, pero el FORMATO en el
// que Supabase lo devuelve no -- tolera array real (Postgres
// `int[]`/`smallint[]`, lo más probable para un esquema nuevo -- PostgREST
// ya lo entrega como array de JS nativo), string JSON (`"[1,3,5]"`) o CSV
// numérico (`"1,3,5"`). NO tolera el formato viejo de nombres de día en
// texto (`"Lunes,Miércoles"`, el que usaba la hoja de Sheets) -- ese formato
// no debería sobrevivir a una migración a un esquema nuevo de Supabase,
// pero si Victor confirma que sí, esta función necesita un caso más.
function _evLugarParseDiasSemana(raw) {
  if (Array.isArray(raw)) return raw.map(Number).filter(function(n) { return !isNaN(n); });
  if (typeof raw === 'string' && raw.trim()) {
    try {
      var j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map(Number).filter(function(n) { return !isNaN(n); });
    } catch (e) { /* no era JSON, cae al split de abajo */ }
    return raw.split(',').map(function(s) { return parseInt(s.trim(), 10); }).filter(function(n) { return !isNaN(n); });
  }
  return [];
}

// Mismo shimmer que _evAntSkeletonHtml() (ver arriba) -- 3 cards del mismo
// tamaño real que .ev-ant-card, reusado tal cual en vez de un skeleton propio.
function _evLugaresSkeletonHtml() {
  var carta = '<div class="ev-ant-card">' +
    '<div class="ev-card-top-row">' +
      '<div class="fi-skel-block ev-ant-skel-icon"></div>' +
      '<div class="ev-card-body">' +
        '<div class="fi-skel-block ev-ant-skel-title"></div>' +
        '<div class="fi-skel-block ev-ant-skel-sub"></div>' +
      '</div>' +
    '</div>' +
  '</div>';
  return carta.repeat(3);
}

// Cards con el mismo look que el resumen de Asistencia Anticipada
// (.ev-ant-card/.ev-card-top-row/.ev-card-icon/.ev-card-body, ver
// css/eventos.css) -- suma 2 botones de acción (Editar/Borrar, ver
// MANIFEST.md "Cambios recientes"), reusando LITERAL `.ev-ant-card-edit`/
// `.ev-ant-card-del` (mismo par de clases que ya usan las cards de
// Asistencia anticipada y la de offseason en el timeline) -- cero CSS
// nuevo. La card entera deja de ser tocable (antes abría directo el
// formulario precargado) -- con un botón "Editar" explícito, el click de
// fondo quedaba redundante y además complicaba anidar "Borrar" adentro sin
// `stopPropagation()`.
function _evLugaresRenderLista() {
  var cont = document.getElementById('ev-lugares-lista'); if (!cont) return;
  if (!_evLugares.length) {
    cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">Todavía no hay lugares creados.</p>';
    return;
  }
  cont.innerHTML = _evLugares.map(function(v) {
    var icono = _EV_ICONOS[v.tipoIcono] || 'place';
    return '<div class="ev-ant-card">' +
      '<div class="ev-card-top-row">' +
        '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
        '<div class="ev-card-body">' +
          '<div class="ev-card-titulo">' + v.nombre + '</div>' +
          '<div class="ev-ant-card-sub">' + _evLugarResumenSub(v) + '</div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="ev-ant-card-edit" onclick="_evLugarAbrirEditar(\'' + v.fila + '\')" title="Editar">' +
        '<span class="material-symbols-outlined">edit</span>' +
      '</button>' +
      '<button type="button" class="ev-ant-card-del" onclick="_evLugarBorrar(\'' + v.fila + '\')" title="Borrar">' +
        '<span class="material-symbols-outlined">delete</span>' +
      '</button>' +
    '</div>';
  }).join('');
}

// Borrar (ver MANIFEST.md "Cambios recientes") -- primero cuenta cuántos
// eventos vinculados hay en `asistencias` (por nombre, columna `donde` -- la
// relación real entre las 2 tablas es por texto, no por FK: `asistencias.donde`
// guarda el NOMBRE del lugar tal cual, no un id de `venues`), separando
// futuros/pasados contra la fecha de hoy, y recién con ese conteo en mano
// abre el bsheet de confirmación (#ev-lugar-sheet-eliminar, index.html) --
// reemplaza al `confirm()` nativo que tenía esta función antes (mismo
// motivo que ya llevó a `_evAntEliminar()`/#ev-ant-sheet-eliminar a dejar de
// usar `confirm()`, arriba en este archivo: consistencia visual con el
// resto de la app). El bsheet se muestra SIEMPRE (a diferencia del
// `confirm()` viejo, que solo aparecía si había eventos vinculados) -- el
// pedido de diseño ya cubre el caso "sin eventos" con su propio mensaje
// ("Esta acción no se puede deshacer.", sin la advertencia extra).
function _evLugarBorrar(fila) {
  var v = _evLugares.filter(function(x) { return x.fila === fila; })[0];
  if (!v) return;
  mostrarCargando('Verificando...');
  fetch(SUPABASE_URL + '/rest/v1/asistencias?select=fecha&donde=eq.' + encodeURIComponent(v.nombre), {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(rows) {
    ocultarCargando();
    var hoy = _evHoyISO();
    var futuros = 0, pasados = 0;
    (rows || []).forEach(function(f) {
      if (_evFechaCmp(f.fecha, hoy) > 0) futuros++; else pasados++;
    });
    _evLugarAbrirSheetEliminar(fila, futuros, pasados);
  }).catch(function() {
    ocultarCargando();
    mostrarToast('No se pudo verificar si el lugar tiene eventos vinculados.', 'error');
  });
}
// Texto de advertencia -- cubre los 4 casos posibles (0 eventos ya lo
// maneja _evLugarAbrirSheetEliminar() dejando este bloque oculto): solo
// futuros, solo pasados, o ambos (el único caso explícito en el pedido
// original, "N eventos futuros... y M eventos pasados en el historial").
// Singular/plural real (nunca "1 eventos") para que el texto lea bien
// también en el caso más común de un solo evento vinculado.
function _evLugarEliminarTextoWarn(futuros, pasados) {
  function frase(n, singular, plural) { return n + ' ' + (n === 1 ? singular : plural); }
  if (futuros > 0 && pasados > 0) {
    return 'Este lugar tiene ' + frase(futuros, 'evento futuro', 'eventos futuros') + ' que también se ' + (futuros === 1 ? 'eliminará' : 'eliminarán') + ', y ' + frase(pasados, 'evento pasado', 'eventos pasados') + ' en el historial.';
  }
  if (futuros > 0) {
    return 'Este lugar tiene ' + frase(futuros, 'evento futuro', 'eventos futuros') + ' que también se ' + (futuros === 1 ? 'eliminará' : 'eliminarán') + '.';
  }
  return 'Este lugar tiene ' + frase(pasados, 'evento pasado', 'eventos pasados') + ' en el historial que también se ' + (pasados === 1 ? 'eliminará' : 'eliminarán') + '.';
}
var _evLugarEliminarPendienteFila = null;
function _evLugarAbrirSheetEliminar(fila, futuros, pasados) {
  _evLugarEliminarPendienteFila = fila;
  var warn = document.getElementById('ev-lugar-sheet-eliminar-warn');
  var warnTexto = document.getElementById('ev-lugar-sheet-eliminar-warn-texto');
  var hayEventos = (futuros + pasados) > 0;
  if (warn) warn.style.display = hayEventos ? 'flex' : 'none';
  if (warnTexto) warnTexto.textContent = hayEventos ? _evLugarEliminarTextoWarn(futuros, pasados) : '';
  var ov = document.getElementById('ev-lugar-sheet-eliminar-overlay');
  var sh = document.getElementById('ev-lugar-sheet-eliminar');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(_evLugarCerrarSheetEliminar);
}
// Mismo mecanismo doble-hop por history.back() que _evAntCerrarSheetEliminar()
// (arriba en este archivo, ver ese comentario) -- el botón "Cancelar"
// dispara history.back(), que el listener de popstate intercepta y recién
// ahí llama de vuelta acá con porGesto=true para animar el cierre real.
function _evLugarCerrarSheetEliminar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var ov = document.getElementById('ev-lugar-sheet-eliminar-overlay');
  var sh = document.getElementById('ev-lugar-sheet-eliminar');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
// Botón "Eliminar" del sheet -- cierra primero, recién ahí dispara el
// DELETE real, mismo orden que _evAntConfirmarEliminar().
function _evLugarConfirmarEliminar(btn) {
  if (!_evLugarEliminarPendienteFila) return;
  var fila = _evLugarEliminarPendienteFila;
  _evLugarEliminarPendienteFila = null;
  _evLugarCerrarSheetEliminar();
  mostrarCargando('Eliminando...');
  fetch(SUPABASE_URL + '/rest/v1/venues?id=eq.' + encodeURIComponent(fila), {
    method: 'DELETE',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then(function(r) {
    ocultarCargando();
    if (!r.ok) { mostrarToast('No se pudo eliminar el lugar.', 'error'); return; }
    mostrarToast('Lugar eliminado.', 'ok');
    if (_evCrearPasoActual === 'ev-crear-paso-lugar') {
      _evCrearCargarLugares();
    } else {
      irEvLugares();
    }
  }).catch(function() {
    ocultarCargando();
    mostrarToast('No se pudo eliminar el lugar.', 'error');
  });
}

function _evLugarResumenSub(v) {
  return _evLugarResumenRecurrencia(v) + ' · ' + (v.requiereReserva === false ? 'Sin reserva' : 'Con reserva');
}
function _evLugarResumenRecurrencia(v) {
  if (v.tipoRecurrencia === 'dias_semana') {
    var dias = (v.diasSemana || []).slice().sort(function(a, b) { return a - b; }).map(function(d) { return _EV_DIAS_CORTOS[d - 1]; });
    return dias.length ? dias.join(', ') : 'Días de la semana';
  }
  if (v.tipoRecurrencia === 'cada_tantos') {
    return 'Cada ' + (v.frecuenciaNumero || '?') + ' ' + (_EV_LUGAR_UNIDAD_LABEL[v.frecuenciaUnidad] || v.frecuenciaUnidad || '');
  }
  if (v.tipoRecurrencia === 'unico') return 'Evento único';
  return v.tipoIcono || '';
}

/* ─── Formulario compartido ("Crear evento"/"Editar lugares") -- wizard de
   3 pasos (ver MANIFEST.md "Cambios recientes"), array de ids de paso +
   índice numérico actual, reusando .salud-paso/.salud-prog/.salud-prog-dot
   (css/perfil.css) tal cual -- MISMA base visual que "Crear evento" más
   abajo en este archivo, pero ya no el mismo motor de navegación: "Crear
   evento" pasó a pasos dinámicos por ID de paso (string, ver
   _EV_CREAR_STEPS/_evCrearPasoActual/_evCrearMostrarPaso(), ver MANIFEST.md
   "Cambios recientes") porque su secuencia de pasos varía según el tipo de
   evento elegido; este formulario de venue sigue con la lista fija de
   siempre (_EV_LUGAR_STEPS/_evLugarCurIdx, índice numérico) porque sus 3
   pasos son siempre los mismos. Paso 0 -- Ubicación+Nombre.
   Paso 1 -- Tipo de evento (ya NO pide "¿Requiere reserva?", ver
   _evLugarGuardar() más abajo -- se auto-deriva de `tipoIcono` al guardar,
   nunca se pregunta ni se guarda como elección propia en _evLugarData).
   Paso 2 -- Horario, con TODOS sus sub-campos de recurrencia (días de
   semana/frecuencia/fecha de referencia/hora) sin cambios de mecánica --
   la única diferencia es que este paso YA NO bloquea el guardado (ver
   _evLugarActualizarFooter(), más abajo, fuerza `disabled=false` sin
   consultar ninguna validación en ese paso). ─────────────────────────── */

var _EV_LUGAR_STEPS = ['ev-lugar-paso-0', 'ev-lugar-paso-1', 'ev-lugar-paso-2'];
// Título de la nav por paso (ver MANIFEST.md "Cambios recientes") -- mismo
// índice que _EV_LUGAR_STEPS, actualizado con fade dentro de
// _evLugarMostrarPaso() (única dueña del título, ver esa función más abajo).
var _EV_LUGAR_STEP_TITULOS = ['Ubicación', 'Tipo de evento', 'Horario'];
var _evLugarCurIdx = 0;
var _evLugarData = {};
var _evLugarOrigen = 's-eventos-lugares';
// mismo criterio que _evAntCal (arriba): .mostrado guarda un ISO string, no
// un Date -- _evCalMesDe()/_evToISO() (helpers genéricos de este archivo,
// ver el timeline principal) trabajan así, no con objetos Date.
var _evLugarCal = { referencia: { mostrado: null }, unico: { mostrado: null } };
var _evLugarMapa = null;
var _evLugarAutocomp = null;
// Instancia de mapa/buscador propia del hub "Editar lugar" (#s-eventos-lugar-editar,
// ver MANIFEST.md "Cambios recientes") -- mismo mecanismo que _evLugarMapa/
// _evLugarAutocomp del wizard de arriba, nunca la misma instancia (2 canvas
// de DOM distintos, `#ev-lugar-mapa-canvas` vs `#ev-lugar-editar-mapa-canvas`).
var _evLugarEditarMapa = null;
var _evLugarEditarAutocomp = null;
// true cuando el formulario de venue fue abierto desde el paso "Lugar" del
// wizard "Crear evento" (irEvLugarFormNuevo('desde_crear'), ver
// MANIFEST.md "Cambios recientes") -- ese wizard ya NO tiene su propio
// mini-formulario inline, reusa este mismo formulario compartido pero
// recortado a solo el Paso 0 (Ubicación+Nombre): _evLugarMostrarPaso()
// guarda directo al llegar al Paso 1 en vez de mostrarlo, y
// _evLugarGuardar() vuelve al wizard (no a `_evLugarOrigen`) al terminar.
// `false` en cualquier otro flujo (`irEvLugares()` -> "+ Nuevo lugar"), el
// wizard de 3 pasos completo sigue disponible tal cual ahí.
var _evLugarFromWizard = false;

function _evLugarFormVolver() { return _evLugarOrigen; }

// El único parámetro sirve doble uso: nombre de pantalla de origen (para
// _evLugarFormVolver()/el back del Paso 0) O el string especial
// 'desde_crear' (ver _evLugarFromWizard arriba) -- no un 2do parámetro
// aparte, para no tocar el único caller preexistente
// (irEvLugarFormNuevo('s-eventos-lugares'), #s-eventos-lugares).
function irEvLugarFormNuevo(origen) {
  _evLugarFromWizard = (origen === 'desde_crear');
  _evLugarData = {
    fila: null, nombre: '', mapsUrl: null, lat: null, lng: null, videoInstructivo: null,
    // Sin pill de "Tipo de ícono" en el flujo recortado del wizard (ver
    // _evLugarMostrarPaso() más abajo, salta directo del Paso 0 a guardar)
    // -- 'Otro' como default neutro, corregible después desde "Editar
    // lugares" si hace falta uno más específico.
    tipoIcono: _evLugarFromWizard ? 'Otro' : null,
    tipoRecurrencia: null,
    diasSemana: [], frecuenciaNumero: null, frecuenciaUnidad: null,
    fecha: null, hora: '', horaTocada: false
  };
  _evLugarOrigen = _evLugarFromWizard ? 's-eventos-crear' : (origen || 's-eventos-lugares');
  ir('s-eventos-lugar-form');
  _evLugarFormPintar();
  _evLugarMostrarPaso(0);
  _evLugarInicializarMapa();
}

// Card de la lista tocada -- precarga _evLugarData completo desde la fila ya
// cargada en memoria (_evLugares, sin pedirla de nuevo al backend, mismo
// criterio que _evAntEditar()). Abre el HUB de edición (#s-eventos-lugar-editar,
// ver MANIFEST.md "Cambios recientes"), no el wizard -- ese wizard quedó
// create-only. `_evLugarEditarOriginal` (snapshot JSON de `_evLugarData` tal
// como se cargó) es lo que compara `_evLugarEditarHayCambios()` para
// habilitar "Guardar cambios" en el hub, ver ese bloque más abajo.
function _evLugarEditarBack() {
  if (_evLugarOrigen === 's-eventos-crear') {
    ir('s-eventos-crear');
  } else {
    irEvLugares();
  }
}

function _evLugarAbrirEditar(fila, desdeWizard) {
  var v = _evLugares.filter(function(x) { return x.fila === fila; })[0];
  if (!v) return;
  _evLugarData = {
    fila: v.fila, nombre: v.nombre || '', nombreOriginal: v.nombre || '', mapsUrl: v.mapsUrl || null, videoInstructivo: v.videoInstructivo || null,
    lat: (typeof v.lat === 'number') ? v.lat : null, lng: (typeof v.lng === 'number') ? v.lng : null,
    tipoIcono: v.tipoIcono || null,
    tipoRecurrencia: v.tipoRecurrencia || null,
    diasSemana: (v.diasSemana || []).slice(),
    frecuenciaNumero: v.frecuenciaNumero || null, frecuenciaUnidad: v.frecuenciaUnidad || null,
    fecha: v.fechaReferencia || null, hora: v.hora || '',
    // El lugar ya tenía una hora guardada -- arranca "tocada" (mismo criterio
    // que _evAntIniciarWizard()/_evOffseasonEditar() con datos ya resueltos),
    // así el valor precargado viaja de vuelta en el guardado aunque el admin
    // no vuelva a tocar el stepper.
    horaTocada: !!v.hora
  };
  _evLugarOrigen = (typeof desdeWizard !== 'undefined' && desdeWizard) ? 's-eventos-crear' : 's-eventos-lugares';
  _evLugarEditarOriginal = JSON.stringify(_evLugarData);
  ir('s-eventos-lugar-editar');
  _evLugarEditarPintar();
}

// Pinta TODO el wizard desde _evLugarData -- este wizard es create-only
// (ver MANIFEST.md "Cambios recientes" -- "Editar" abre el hub
// #s-eventos-lugar-editar en su lugar, con su propia _evLugarEditarPintar()
// más abajo), así que hoy el único caller real es irEvLugarFormNuevo(). Solo
// VALORES de campo -- la navegación entre pasos (a qué paso arrancar, los
// dots de progreso) vive aparte en _evLugarMostrarPaso(), llamada siempre
// después de esta, mismo criterio que _evCrearResetUI()/_evCrearMostrarPaso()
// en "Crear evento".
function _evLugarFormPintar() {
  // El título de la nav NO se pinta acá -- este wizard es create-only desde
  // que "Editar" pasó a abrir el hub #s-eventos-lugar-editar (ver MANIFEST.md
  // "Cambios recientes"), así que el título siempre refleja el paso activo,
  // no "Nuevo lugar"/"Editar lugar" -- ver _evLugarMostrarPaso() más abajo,
  // única dueña de `#ev-lugar-form-titulo` en esta pantalla.
  var nombreInp = document.getElementById('ev-lugar-nombre');
  if (nombreInp) nombreInp.value = _evLugarData.nombre || '';
  var videoInp = document.getElementById('ev-lugar-video');
  if (videoInp) videoInp.value = _evLugarData.videoInstructivo || '';
  _actualizarContadorTexto(_evLugarData.nombre, 'ev-lugar-nombre-contador', 15);

  document.querySelectorAll('#ev-lugar-icono-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.val === _evLugarData.tipoIcono); });
  document.querySelectorAll('#ev-lugar-recurrencia-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.val === _evLugarData.tipoRecurrencia); });
  document.querySelectorAll('#ev-lugar-dias-row .ev-dia-circulo').forEach(function(c) { c.classList.toggle('activa', _evLugarData.diasSemana.indexOf(parseInt(c.dataset.dia, 10)) !== -1); });
  var frecNumInp = document.getElementById('ev-lugar-frec-num');
  if (frecNumInp) frecNumInp.value = _evLugarData.frecuenciaNumero || '';
  document.querySelectorAll('#ev-lugar-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.val === _evLugarData.frecuenciaUnidad); });
  // "Hora" (stepper) NO se pinta acá -- a diferencia de los campos de
  // arriba, se inicializa solo cuando `_evLugarMostrarSubRecurrencia()`
  // (llamada más abajo en esta misma función) revela la sección por primera
  // vez, ver esa función para el detalle.

  var mesInicial = _evLugarData.fecha || _evHoyISO();
  _evLugarCal.referencia.mostrado = mesInicial;
  _evLugarCal.unico.mostrado = mesInicial;

  _evLugarMostrarSubRecurrencia();
  _evLugarCalRender('referencia');
  _evLugarCalRender('unico');
  _evLugarActualizarCalResumen('referencia');
  _evLugarActualizarCalResumen('unico');
  _evLugarActualizarFooter();
}

/* ── Navegación entre los 3 pasos -- mismo mecanismo que
   _evCrearMostrarPaso()/_evCrearRenderProg()/_evCrearBack() (más abajo en
   este archivo), con su propio índice/array (nunca comparte estado con
   "Crear evento", pese a compartir el motor). ──────────────────────── */
function _evLugarMostrarPaso(idx) {
  // Flujo recortado desde el wizard "Crear evento" (ver _evLugarFromWizard
  // más arriba) -- el Paso 0 (Ubicación+Nombre) es el único que se muestra,
  // "Siguiente" ahí (_evLugarIrPaso1(), pide idx===1) guarda directo en vez
  // de mostrar los Pasos 1/2 (Tipo de ícono/Horario, no pedidos en este
  // flujo).
  if (_evLugarFromWizard && idx === 1) { _evLugarGuardar(); return; }
  _EV_LUGAR_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _evLugarCurIdx = idx;
  _evLugarRenderProg();
  // Título de la nav = nombre del paso actual, mismo helper de fade que el
  // timeline principal (_evFadeSwap(), arriba en este archivo) -- no un fade
  // propio a mano.
  var tituloEl = document.getElementById('ev-lugar-form-titulo');
  if (tituloEl) _evFadeSwap(tituloEl, function() { tituloEl.textContent = _EV_LUGAR_STEP_TITULOS[idx]; }, false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  _evLugarActualizarFooter();
}
function _evLugarRenderProg() {
  var cont = document.getElementById('ev-lugar-prog'); if (!cont) return;
  cont.innerHTML = '';
  for (var i = 0; i < _EV_LUGAR_STEPS.length; i++) {
    var d = document.createElement('div');
    d.className = 'salud-prog-dot' + (i < _evLugarCurIdx ? ' done' : (i === _evLugarCurIdx ? ' active' : ''));
    cont.appendChild(d);
  }
}
// Flecha del header Y botón "Atrás" del footer -- mismo destino, un paso
// atrás o (desde el paso 0) de vuelta al origen real (_evLugarFormVolver()).
function _evLugarBack() {
  if (_evLugarCurIdx === 0) { ir(_evLugarFormVolver()); return; }
  _evLugarMostrarPaso(_evLugarCurIdx - 1);
}
function _evLugarIrPaso1() {
  if (!_evLugarPaso0Valido()) return;
  _evLugarMostrarPaso(1);
}
function _evLugarIrPaso2() {
  if (!_evLugarPaso1Valido()) return;
  _evLugarMostrarPaso(2);
}
// Footer de 2 botones lado a lado ("Atrás"/acción principal, ver el HTML) --
// "Atrás" oculto en el paso 0 (mismo criterio que "Editar evento": la
// flecha del header ya cubre esa acción ahí). El botón principal cambia
// texto/acción/habilitación según el paso -- Paso 2 SIEMPRE habilitado
// (pedido explícito, "el botón Guardar está siempre habilitado
// independientemente de si se seleccionó o no un tipo de recurrencia").
// Un solo botón (ver MANIFEST.md "Cambios recientes" -- el footer tenía
// "Atrás"/acción principal lado a lado, eliminado: el header ya tiene la
// flecha de volver, `_evLugarBack()`, que cubre exactamente lo mismo --
// mismo criterio que "Crear evento"/#s-eventos-crear, el único botón de
// footer cambia texto/acción/habilitación según el paso).
function _evLugarActualizarFooter() {
  var btn = document.getElementById('ev-lugar-btn-guardar');
  if (!btn) return;
  if (_evLugarCurIdx === 0) {
    btn.textContent = 'Siguiente';
    btn.onclick = _evLugarIrPaso1;
    btn.disabled = !_evLugarPaso0Valido();
  } else if (_evLugarCurIdx === 1) {
    btn.textContent = 'Siguiente';
    btn.onclick = _evLugarIrPaso2;
    btn.disabled = !_evLugarPaso1Valido();
  } else {
    btn.textContent = 'Guardar';
    btn.onclick = _evLugarGuardar;
    btn.disabled = false;
  }
}

function _evLugarSetNombre(v) { _evLugarData.nombre = v; _actualizarContadorTexto(v, 'ev-lugar-nombre-contador', 15); _evLugarActualizarFooter(); }

function _evLugarSelIcono(el) {
  document.querySelectorAll('#ev-lugar-icono-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.tipoIcono = el.dataset.val;
  _evLugarActualizarFooter();
}
// Deseleccionable -- tocar la pill ya activa la apaga en vez de dejarla fija
// (mismo patrón "yaActiva" ya usado en la app para pills de selección única
// con esta misma semántica, ver _evFiltrarAsistenciaPorGrupo()/js/eventos.js).
function _evLugarSelRecurrencia(el) {
  var yaActiva = el.classList.contains('activa');
  document.querySelectorAll('#ev-lugar-recurrencia-pills .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', !yaActiva && p === el);
  });
  _evLugarData.tipoRecurrencia = yaActiva ? null : el.dataset.val;
  _evLugarMostrarSubRecurrencia();
  _evLugarActualizarFooter();
}
// Reveal inline según la elección -- mismo patrón ya usado por
// _evAntMostrarSubFrecuencia() (ver arriba): oculta los 3 sub-bloques,
// muestra solo el que corresponde con un fade. "Hora" es compartida por los
// 3 (aparece en los 3 casos, sección extra condicionada a que haya un tipo
// de recurrencia elegido -- ver MANIFEST.md "Cambios recientes"), un solo
// campo en vez de 3 inputs duplicados. Sin recurrencia elegida, "Hora"
// queda oculta y `_evLugarData.horaTocada` nunca pasa a `true` -- el campo
// es opcional, nunca bloquea el guardado (ver _evLugarGuardar()/
// _evLugarPaso1Valido() más abajo).
function _evLugarMostrarSubRecurrencia() {
  ['ev-lugar-rec-dias', 'ev-lugar-rec-cada', 'ev-lugar-rec-unico'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var horaWrap = document.getElementById('ev-lugar-hora-wrap');
  var t = _evLugarData.tipoRecurrencia;
  if (!t) { if (horaWrap) horaWrap.style.display = 'none'; return; }
  var mapaId = { dias_semana: 'ev-lugar-rec-dias', cada_tantos: 'ev-lugar-rec-cada', unico: 'ev-lugar-rec-unico' };
  var activo = document.getElementById(mapaId[t]);
  if (activo) {
    activo.style.display = 'block';
    void activo.offsetWidth;
    activo.style.animation = 'fadeIn 0.2s ease';
  }
  if (horaWrap) {
    var horaPrimeraVez = horaWrap.style.display === 'none' || !horaWrap.style.display;
    horaWrap.style.display = 'block';
    if (horaPrimeraVez) {
      void horaWrap.offsetWidth; horaWrap.style.animation = 'fadeIn 0.2s ease';
      // Mismo componente que usa "Crear evento" (_evHoraStepper*, más abajo
      // en este archivo) -- solo se inicializa la PRIMERA vez que
      // el campo se revela (igual que el criterio ya usado acá para la
      // animación), nunca al cambiar entre los 3 tipos de recurrencia con
      // "Hora" ya visible -- el valor elegido es compartido, no se resetea
      // por cambiar de tipo. `horaTocada` (ver _evLugarAbrirEditar() más
      // arriba, ya en `true` si el lugar editado ya tenía hora guardada)
      // solo pasa a `true` acá dentro del propio `onChange`, es decir, con
      // una interacción real del admin -- el valor visual por default del
      // stepper (09:00 AM) nunca cuenta como "elegido".
      _evHoraStepperInit('ev-lugar-hora', _evLugarData.hora || null, function(v) {
        _evLugarData.hora = v;
        _evLugarData.horaTocada = true;
        _evLugarActualizarFooter();
      });
    }
  }
}

function _evLugarToggleDia(el) {
  var dia = parseInt(el.dataset.dia, 10);
  el.classList.toggle('activa');
  var idx = _evLugarData.diasSemana.indexOf(dia);
  if (el.classList.contains('activa')) { if (idx === -1) _evLugarData.diasSemana.push(dia); }
  else if (idx !== -1) { _evLugarData.diasSemana.splice(idx, 1); }
  _evLugarActualizarFooter();
}
function _evLugarSetFrecNum(v) { _evLugarData.frecuenciaNumero = v ? parseInt(v, 10) : null; _evLugarActualizarFooter(); }
function _evLugarSelUnidad(el) {
  document.querySelectorAll('#ev-lugar-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.frecuenciaUnidad = el.dataset.val;
  _evLugarActualizarFooter();
}
/* ── Calendario inline de fecha única -- "fecha de referencia" (recurrencia
   "cada tantos") y "fecha única" (evento único) comparten el mismo campo de
   datos (_evLugarData.fecha, solo uno de los 2 calendarios está visible por
   vez según _evLugarData.tipoRecurrencia) pero cada uno tiene su propio
   contenedor/mes navegable (mismo motivo que "Por período"/"Indefinido" en
   Asistencia Anticipada tienen 2 calendarios separados: distinto contexto
   visual, aunque comparten mecánica). Reusa tal cual los helpers genéricos
   de fecha del timeline principal (_evCalMesDe/_evLunesDeSemana/_evToISO/
   _evHoyISO/_evFechaCmp) y las clases CSS del calendario de Asistencia
   Anticipada (.ev-cal-grid/.ev-ant-cal-hoy/.ev-ant-cal-sel/.ev-ant-cal-pasado)
   -- selección de un solo toque, sin rango. ── */
function _evLugarCalRender(cual) {
  var cont = document.getElementById('ev-lugar-cal-' + cual); if (!cont) return;
  var m = _evCalMesDe(_evLugarCal[cual].mostrado);
  var labelEl = document.getElementById('ev-lugar-cal-' + cual + '-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var seleccionada = _evLugarData.fecha;
  // "Evento único" no debería poder crearse en el pasado; la fecha de
  // referencia de "cada tantos" SÍ puede ser pasada (ancla histórica del
  // patrón, ej. "cada 2 semanas desde el 1 de marzo") -- solo 'unico'
  // bloquea días pasados.
  var bloquearPasado = cual === 'unico';
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = bloquearPasado && _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (seleccionada && celdaIso === seleccionada) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_evLugarCalTocarDia(\'' + cual + '\',\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  // Fade al repintar -- mismo fix aplicado a las otras 3 instancias de este
  // componente (_evAntCalRender/_evCrearCalRender/_tarCrearCalRender, ver
  // comentario completo en _evAntCalRender()).
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}
function _evLugarCalMoverMes(cual, dir) {
  var m = _evCalMesDe(_evLugarCal[cual].mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evLugarCal[cual].mostrado = _evToISO(new Date(year, month, 1));
  _evLugarCalRender(cual);
}
function _evLugarCalTocarDia(cual, iso) {
  _evLugarData.fecha = iso;
  _evLugarCalRender(cual);
  _evLugarActualizarCalResumen(cual);
  _evLugarActualizarFooter();
}
function _evLugarActualizarCalResumen(cual) {
  var el = document.getElementById('ev-lugar-cal-' + cual + '-resumen');
  if (el) el.textContent = _evLugarData.fecha ? _evAntFechaLegible(_evLugarData.fecha) : '';
}

/* ── Ubicación: buscador (Places Autocomplete) + mapa interactivo con pin
   fijo -- mismo mecanismo ya cargado en la app para Ajustes → Dirección
   (window._mapsLoaded/MAPS_API_KEY vía el script de index.html,
   google.maps.places.Autocomplete tal como usa ajAbrirSheetPlaces()), mapa
   creado/recentrado con crearOCentrarMapaPin() (shared/mapa-interactivo.js,
   extraído de _ajInicializarMapaDireccion() para no duplicarlo, ver
   MANIFEST.md). A diferencia de Dirección (que geocodifica campos de texto
   ya guardados), acá el buscador alimenta el mapa directo y cualquiera de
   los 2 caminos (buscar o arrastrar) termina en el mismo lugar: guardar
   lat/lng + un link de Maps usable (el de Google si vino de una búsqueda
   real, o uno armado a partir de las coordenadas si el usuario solo
   arrastró el pin). ── */
function _evLugarInicializarMapa() {
  var canvas = document.getElementById('ev-lugar-mapa-canvas');
  if (!canvas) return;
  _evLugarInicializarBuscador();
  if (typeof google === 'undefined' || !google.maps || !window._mapsLoaded) {
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.78rem;text-align:center;padding:16px;">No se pudo cargar el mapa. Intenta más tarde.</div>';
    return;
  }
  var centro = (_evLugarData.lat != null && _evLugarData.lng != null) ? { lat: _evLugarData.lat, lng: _evLugarData.lng } : _EV_LUGAR_QUITO_LATLNG;
  _evLugarCentrarMapa(centro);
}
function _evLugarCentrarMapa(pos) {
  var canvas = document.getElementById('ev-lugar-mapa-canvas');
  if (!canvas) return;
  _evLugarMapa = crearOCentrarMapaPin(_evLugarMapa, canvas, pos, _evLugarOnDragEnd);
}
function _evLugarOnDragEnd(centro) {
  _evLugarActualizarUbicacion(centro.lat(), centro.lng(), null);
}
function _evLugarActualizarUbicacion(lat, lng, mapsUrlDirecto) {
  _evLugarData.lat = lat; _evLugarData.lng = lng;
  _evLugarData.mapsUrl = mapsUrlDirecto || ('https://www.google.com/maps?q=' + lat + ',' + lng);
  _evLugarActualizarFooter();
}
function _evLugarInicializarBuscador() {
  var inp = document.getElementById('ev-lugar-buscador-input');
  if (!inp) return;
  inp.value = '';
  if (_evLugarAutocomp) { google.maps.event.clearInstanceListeners(inp); _evLugarAutocomp = null; }
  if (!window._mapsLoaded || typeof google === 'undefined') return; // sin Places -- el mapa sigue usable arrastrando el pin
  _evLugarAutocomp = new google.maps.places.Autocomplete(inp, { fields: ['geometry', 'name', 'url'] });
  _evLugarAutocomp.addListener('place_changed', function() {
    var place = _evLugarAutocomp.getPlace();
    if (!place || !place.geometry || !place.geometry.location) return;
    var loc = place.geometry.location;
    _evLugarCentrarMapa({ lat: loc.lat(), lng: loc.lng() });
    _evLugarActualizarUbicacion(loc.lat(), loc.lng(), place.url || null);
    // Sugerencia de nombre solo si el campo sigue vacío -- nunca pisa un
    // nombre que el usuario ya haya escrito a mano.
    if (!_evLugarData.nombre && place.name) {
      // `.substring(0,15)` -- el nombre sugerido por Places puede superar el
      // límite del input (`maxlength`, que solo frena tipeo/paste real, no
      // una asignación de `.value` por JS como esta), mismo límite real que
      // el resto del campo.
      _evLugarData.nombre = place.name.substring(0, 15);
      var nombreInp = document.getElementById('ev-lugar-nombre');
      if (nombreInp) nombreInp.value = _evLugarData.nombre;
      _actualizarContadorTexto(_evLugarData.nombre, 'ev-lugar-nombre-contador', 15);
      _evLugarActualizarFooter();
    }
  });
}

/* ── Validación por paso (ver MANIFEST.md "Cambios recientes") --
   `_evLugarRecurrenciaValida()` (el gate viejo del Paso "Horario", que
   exigía tipoRecurrencia + todos sus sub-campos + hora) se ELIMINÓ del
   todo, no solo se dejó de llamar -- el pedido es explícito ("tipoRecurrencia
   y hora ya NO son campos requeridos", "el botón Guardar está siempre
   habilitado"), no una relajación parcial. Paso 2 nunca bloquea el guardado
   -- `_evLugarActualizarFooter()` fuerza `disabled=false` ahí sin consultar
   ninguna validación (ver esa función, arriba en este archivo). ──────── */
function _evLugarPaso0Valido() {
  return !!(_evLugarData.nombre && _evLugarData.nombre.trim() && _evLugarData.mapsUrl);
}
function _evLugarPaso1Valido() {
  return !!_evLugarData.tipoIcono;
}
// Guard defensivo de _evLugarGuardar() (ver más abajo) -- en el flujo normal
// nunca debería poder tocarse "Guardar" sin haber pasado por los pasos 0/1
// ya válidos (el botón de esos pasos ya lo exige para avanzar), pero el
// paso 2 en sí no vuelve a chequearlos.
function _evLugarValido() {
  return _evLugarPaso0Valido() && _evLugarPaso1Valido();
}

// Guardado real -- fetch() directo a Supabase (mismo mecanismo que el resto
// de esta sección), ya NO pasa por apiPost()/`crearVenue`/`editarVenue`
// (esas 2 acciones nunca existieron en el router del Edge Function --
// "Acción no válida" en cada guardado, ver MANIFEST.md "Cambios recientes").
// POST a la colección entera sin `_evLugarData.fila` (lugar nuevo), PATCH a
// `?id=eq.<fila>` con `_evLugarData.fila` (edición) -- mismo criterio
// "editando = truthy de la fila" que ya usan `_evCrearDescansoGuardar()`/
// `_evAdminEditarEvento()`. Payload con los nombres reales de columna de
// `venues` (confirmados por Victor): `lugar`/`google_maps`/`tipo_icono`/
// `requiere_reserva` (boolean real, no `'SI'`/`'NO'`)/`tipo`/`dias`/
// `frecuencia`/`unidad`/`fecha_referencia`/`inicia`. `lat`/`lng` -- la tabla
// no tiene esas columnas, nunca se mandan. `created_at`/`updated_at` --
// columnas de auditoría típicas de Supabase, si existen las maneja la
// propia base (default/trigger), el cliente nunca las setea.
function _evLugarGuardar() {
  if (!_evLugarValido()) return;
  // "¿Requiere reserva?" ya no es una pregunta propia del form (ver
  // MANIFEST.md "Cambios recientes") -- se auto-deriva acá mismo, al armar
  // el payload final, a partir del tipo de evento elegido en el Paso 1:
  // solo "Entrenamiento" habilita reservas de equipamiento para este lugar.
  // Booleano real -- `requiere_reserva` es `boolean` en Supabase, confirmado
  // por `!== false` ya usado 2 veces en `supabase/functions/api/index.ts`.
  var requiereReserva = _evLugarData.tipoIcono === 'Entrenamiento';
  var payload = {
    lugar: _evLugarData.nombre.trim(),
    google_maps: _evLugarData.mapsUrl,
    video_instructivo: _evLugarData.videoInstructivo || null,
    tipo_icono: _evLugarData.tipoIcono,
    requiere_reserva: requiereReserva,
    tipo: _evLugarData.tipoRecurrencia
  };
  if (_evLugarData.tipoRecurrencia === 'dias_semana') {
    payload.dias = _evLugarData.diasSemana.slice().sort(function(a, b) { return a - b; });
  } else if (_evLugarData.tipoRecurrencia === 'cada_tantos') {
    payload.frecuencia = _evLugarData.frecuenciaNumero;
    payload.unidad = _evLugarData.frecuenciaUnidad;
    payload.fecha_referencia = _evLugarData.fecha;
  } else if (_evLugarData.tipoRecurrencia === 'unico') {
    payload.fecha_referencia = _evLugarData.fecha;
  }
  // "Hora" es opcional (ver MANIFEST.md "Cambios recientes") -- solo viaja
  // si el admin la tocó de verdad (`horaTocada`, ver
  // _evLugarMostrarSubRecurrencia()/_evLugarAbrirEditar() más arriba), nunca
  // el valor visual por default del stepper.
  if (_evLugarData.horaTocada) payload.inicia = _evLugarData.hora;

  var editando = _evLugarData.fila;
  var url = SUPABASE_URL + '/rest/v1/venues' + (editando ? ('?id=eq.' + encodeURIComponent(editando)) : '');
  var headers = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

  mostrarCargando(editando ? 'Guardando cambios...' : 'Creando lugar...');
  fetch(url, { method: editando ? 'PATCH' : 'POST', headers: headers, body: JSON.stringify(payload) })
    .then(function(r) {
      if (r.ok) {
        ocultarCargando();
        mostrarToast(editando ? 'Lugar actualizado.' : 'Lugar creado.', 'ok');
        // Si se editó (no creó) un venue y el nombre cambió, las filas de
        // `asistencias` ya generadas por este venue quedan con `donde`
        // apuntando al nombre viejo (esa columna no se deriva del venue,
        // se copió al generarlas -- ver `_mantenerVentanaAsistenciasInterno()`
        // en GAS) -- fire & forget, no bloquea la navegación ni el toast de
        // éxito ya mostrado arriba.
        if (editando && _evLugarData.nombreOriginal && _evLugarData.nombreOriginal !== payload.lugar) {
          fetch(SUPABASE_URL + '/rest/v1/asistencias?donde=eq.' + encodeURIComponent(_evLugarData.nombreOriginal), {
            method: 'PATCH', headers: headers, body: JSON.stringify({ donde: payload.lugar })
          }).catch(function(e) { console.warn('No se pudo sincronizar asistencias.donde tras renombrar el lugar:', e); });
        }
        // Vuelve al wizard "Crear evento" en vez de a `_evLugarFormVolver()`
        // -- NO usa irEvCrear() (resetea todo el wizard a cero, perdiendo el
        // tipo ya elegido en el Paso "Tipo") -- solo recarga la lista de
        // lugares (para que el venue recién creado aparezca) y muestra el
        // paso "Lugar" directo, ver MANIFEST.md "Cambios recientes".
        if (_evLugarFromWizard) {
          _evLugarFromWizard = false;
          ir('s-eventos-crear');
          _evCrearMostrarPaso('ev-crear-paso-lugar');
          _evCrearCargarLugares();
          return;
        }
        var volver = _evLugarFormVolver();
        if (volver === 's-eventos-lugares') irEvLugares(); else ir(volver);
        return;
      }
      return r.json().catch(function() { return null; }).then(function(body) {
        throw new Error((body && body.message) || ('No se pudo guardar el lugar (HTTP ' + r.status + ').'));
      });
    })
    .catch(function(e) {
      ocultarCargando();
      mostrarToast((e && e.message) || 'No se pudo guardar el lugar.', 'error');
    });
}

/* ═══════════════════════════════════════════════════════
   Hub "Editar lugar" (#s-eventos-lugar-editar, ver MANIFEST.md "Cambios
   recientes") -- reemplaza al wizard de arriba para EDITAR un venue
   existente (ese wizard quedó create-only, ver _evLugarAbrirEditar()). Todos
   los campos visibles y editables directo, sin pasos ni acordeón -- reusa
   `_evLugarData` (el mismo estado que ya llena `_evLugarAbrirEditar()`) y
   `_evLugarGuardar()` TAL CUAL para el guardado real (ya sabe hacer PATCH
   con `_evLugarData.fila` poblado, sin que le importe qué pantalla lo llenó)
   -- solo la pintura/interacción de los campos vive acá, con su propio set
   de ids (`ev-lugar-editar-*`) para no chocar con el wizard.

   Diferencia real con el wizard, no solo de layout: "Ubicación" acá es un
   campo de texto simple para el link de Google Maps (`_evLugarData.mapsUrl`
   directo), no el mapa interactivo + buscador de Places del wizard -- un
   venue que ya existe ya tiene su `google_maps` guardado, corregirlo a mano
   es más simple que rehacer la búsqueda/arrastre del pin cada vez (y
   `lat`/`lng`, lo único que ese mapa interactivo alimentaba además del link,
   ni siquiera son columnas reales de `venues`, ver la corrección de nombres
   de columna más arriba en este archivo).

   "Guardar cambios" habilitado SOLO si algo cambió -- `_evLugarEditarHayCambios()`
   compara `JSON.stringify(_evLugarData)` contra `_evLugarEditarOriginal` (el
   snapshot tomado en `_evLugarAbrirEditar()` al cargar) -- sin un tracker de
   cambios campo por campo (a diferencia de `_evEditarCambios` en el hub de
   "Editar evento"), suficiente porque acá no hay alcance ni PATCH parcial
   que armar: se manda el objeto completo siempre, igual que el wizard.
   ═══════════════════════════════════════════════════════ */

var _evLugarEditarOriginal = null;
var _evLugarEditarCal = { referencia: { mostrado: null }, unico: { mostrado: null } };

// Pinta TODO el hub desde _evLugarData -- mismo criterio que _evLugarFormPintar()
// del wizard, sin el paso a paso (todo se pinta de una).
function _evLugarEditarPintar() {
  var titulo = document.getElementById('ev-lugar-editar-titulo');
  if (titulo) titulo.textContent = 'Editar ' + (_evLugarData.nombre || 'lugar');
  var nombreInp = document.getElementById('ev-lugar-editar-nombre');
  if (nombreInp) nombreInp.value = _evLugarData.nombre || '';
  _actualizarContadorTexto(_evLugarData.nombre, 'ev-lugar-editar-nombre-contador', 15);
  var videoEditInp = document.getElementById('ev-lugar-editar-video');
  if (videoEditInp) videoEditInp.value = _evLugarData.videoInstructivo || '';
  _evLugarEditarInicializarMapa();
  _evLugarEditarActualizarBoton();
}

function _evLugarEditarHayCambios() { return JSON.stringify(_evLugarData) !== _evLugarEditarOriginal; }
function _evLugarEditarActualizarBoton() {
  var btn = document.getElementById('ev-lugar-editar-btn-guardar');
  if (btn) btn.disabled = !_evLugarEditarHayCambios();
}

function _evLugarEditarSetNombre(v) {
  _evLugarData.nombre = v;
  _actualizarContadorTexto(v, 'ev-lugar-editar-nombre-contador', 15);
  var titulo = document.getElementById('ev-lugar-editar-titulo');
  if (titulo) titulo.textContent = 'Editar ' + (v || 'lugar');
  _evLugarEditarActualizarBoton();
}
function _evLugarSetVideoInstructivo(v) {
  _evLugarData.videoInstructivo = v.trim() || null;
}
function _evLugarEditarSetVideoInstructivo(v) {
  _evLugarData.videoInstructivo = v.trim() || null;
  _evLugarEditarActualizarBoton();
}
/* ── Ubicación del hub "Editar lugar" -- mismo mapa interactivo + buscador
   de Places que el wizard de creación (_evLugarInicializarMapa()/
   _evLugarInicializarBuscador(), más arriba en este archivo), NUNCA más un
   `<input>` de texto para pegar un link de Google Maps a mano (ver
   MANIFEST.md "Cambios recientes" -- ese patrón se eliminó de acá, la única
   parte de la app que todavía lo tenía). Instancia de mapa/buscador propia
   (_evLugarEditarMapa/_evLugarEditarAutocomp, arriba en este archivo) sobre
   su propio canvas (#ev-lugar-editar-mapa-canvas) -- mismo criterio de
   "estado propio por pantalla" que el resto de calendarios/mapas
   duplicados de este archivo, nunca comparte la instancia con el wizard.
   Centra sobre `_evLugarData.lat`/`.lng` si el venue ya los tenía (un venue
   editado desde acá siempre viene de `_evLugarAbrirEditar()`, que ya carga
   esos 2 campos si existen), si no cae al centro por defecto de Quito
   (`_EV_LUGAR_QUITO_LATLNG`), igual que el wizard. */
function _evLugarEditarInicializarMapa() {
  var canvas = document.getElementById('ev-lugar-editar-mapa-canvas');
  if (!canvas) return;
  _evLugarEditarInicializarBuscador();
  if (typeof google === 'undefined' || !google.maps || !window._mapsLoaded) {
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.78rem;text-align:center;padding:16px;">No se pudo cargar el mapa. Intenta más tarde.</div>';
    return;
  }
  var centro = (_evLugarData.lat != null && _evLugarData.lng != null) ? { lat: _evLugarData.lat, lng: _evLugarData.lng } : _EV_LUGAR_QUITO_LATLNG;
  _evLugarEditarCentrarMapa(centro);
}
function _evLugarEditarCentrarMapa(pos) {
  var canvas = document.getElementById('ev-lugar-editar-mapa-canvas');
  if (!canvas) return;
  _evLugarEditarMapa = crearOCentrarMapaPin(_evLugarEditarMapa, canvas, pos, _evLugarEditarOnDragEnd);
}
function _evLugarEditarOnDragEnd(centro) {
  _evLugarEditarActualizarUbicacion(centro.lat(), centro.lng(), null);
}
// Mismo cálculo que _evLugarActualizarUbicacion() del wizard (arriba en
// este archivo) -- lat/lng + un mapsUrl usable (el de Google si vino de una
// búsqueda real, o uno armado a partir de las coordenadas si el usuario
// solo arrastró el pin) -- pero con su propio hook de footer
// (_evLugarEditarActualizarBoton(), no _evLugarActualizarFooter() del
// wizard) porque este hub tiene su propio botón "Guardar cambios" con su
// propia condición de habilitado (_evLugarEditarHayCambios()).
function _evLugarEditarActualizarUbicacion(lat, lng, mapsUrlDirecto) {
  _evLugarData.lat = lat; _evLugarData.lng = lng;
  _evLugarData.mapsUrl = mapsUrlDirecto || ('https://www.google.com/maps?q=' + lat + ',' + lng);
  _evLugarEditarActualizarBoton();
}
function _evLugarEditarInicializarBuscador() {
  var inp = document.getElementById('ev-lugar-editar-buscador-input');
  if (!inp) return;
  inp.value = '';
  if (_evLugarEditarAutocomp) { google.maps.event.clearInstanceListeners(inp); _evLugarEditarAutocomp = null; }
  if (!window._mapsLoaded || typeof google === 'undefined') return; // sin Places -- el mapa sigue usable arrastrando el pin
  _evLugarEditarAutocomp = new google.maps.places.Autocomplete(inp, { fields: ['geometry', 'name', 'url'] });
  _evLugarEditarAutocomp.addListener('place_changed', function() {
    var place = _evLugarEditarAutocomp.getPlace();
    if (!place || !place.geometry || !place.geometry.location) return;
    var loc = place.geometry.location;
    _evLugarEditarCentrarMapa({ lat: loc.lat(), lng: loc.lng() });
    _evLugarEditarActualizarUbicacion(loc.lat(), loc.lng(), place.url || null);
  });
}
function _evLugarEditarSelIcono(el) {
  document.querySelectorAll('#ev-lugar-editar-icono-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.tipoIcono = el.dataset.val;
  _evLugarEditarActualizarBoton();
}
// Deseleccionable, mismo patrón "yaActiva" que la pill equivalente del
// wizard (_evLugarSelRecurrencia(), más arriba en este archivo).
function _evLugarEditarSelRecurrencia(el) {
  var yaActiva = el.classList.contains('activa');
  document.querySelectorAll('#ev-lugar-editar-recurrencia-pills .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', !yaActiva && p === el);
  });
  _evLugarData.tipoRecurrencia = yaActiva ? null : el.dataset.val;
  _evLugarEditarMostrarSubRecurrencia();
  _evLugarEditarActualizarBoton();
}
// Mismo comportamiento que _evLugarMostrarSubRecurrencia() del wizard (ver
// esa función, más arriba en este archivo, para el detalle completo del
// reveal/fade y de `horaTocada`) -- reveal inline según la elección, "Hora"
// compartida por los 3 tipos, inicializada una sola vez (la primera vez que
// se revela), nunca bloquea el guardado.
function _evLugarEditarMostrarSubRecurrencia() {
  ['ev-lugar-editar-rec-dias', 'ev-lugar-editar-rec-cada', 'ev-lugar-editar-rec-unico'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var horaWrap = document.getElementById('ev-lugar-editar-hora-wrap');
  var t = _evLugarData.tipoRecurrencia;
  if (!t) { if (horaWrap) horaWrap.style.display = 'none'; return; }
  var mapaId = { dias_semana: 'ev-lugar-editar-rec-dias', cada_tantos: 'ev-lugar-editar-rec-cada', unico: 'ev-lugar-editar-rec-unico' };
  var activo = document.getElementById(mapaId[t]);
  if (activo) {
    activo.style.display = 'block';
    void activo.offsetWidth;
    activo.style.animation = 'fadeIn 0.2s ease';
  }
  if (horaWrap) {
    var horaPrimeraVez = horaWrap.style.display === 'none' || !horaWrap.style.display;
    horaWrap.style.display = 'block';
    if (horaPrimeraVez) {
      void horaWrap.offsetWidth; horaWrap.style.animation = 'fadeIn 0.2s ease';
      _evHoraStepperInit('ev-lugar-editar-hora', _evLugarData.hora || null, function(v) {
        _evLugarData.hora = v;
        _evLugarData.horaTocada = true;
        _evLugarEditarActualizarBoton();
      });
    }
  }
}
function _evLugarEditarToggleDia(el) {
  var dia = parseInt(el.dataset.dia, 10);
  el.classList.toggle('activa');
  var idx = _evLugarData.diasSemana.indexOf(dia);
  if (el.classList.contains('activa')) { if (idx === -1) _evLugarData.diasSemana.push(dia); }
  else if (idx !== -1) { _evLugarData.diasSemana.splice(idx, 1); }
  _evLugarEditarActualizarBoton();
}
function _evLugarEditarSetFrecNum(v) { _evLugarData.frecuenciaNumero = v ? parseInt(v, 10) : null; _evLugarEditarActualizarBoton(); }
function _evLugarEditarSelUnidad(el) {
  document.querySelectorAll('#ev-lugar-editar-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.frecuenciaUnidad = el.dataset.val;
  _evLugarEditarActualizarBoton();
}

// Calendario inline de fecha única -- mismo mecanismo/clases que
// _evLugarCalRender() del wizard (ver ese comentario, más arriba en este
// archivo, para el detalle completo), con contenedores/estado propios.
function _evLugarEditarCalRender(cual) {
  var cont = document.getElementById('ev-lugar-editar-cal-' + cual); if (!cont) return;
  var m = _evCalMesDe(_evLugarEditarCal[cual].mostrado);
  var labelEl = document.getElementById('ev-lugar-editar-cal-' + cual + '-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var seleccionada = _evLugarData.fecha;
  var bloquearPasado = cual === 'unico';
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = bloquearPasado && _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (seleccionada && celdaIso === seleccionada) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_evLugarEditarCalTocarDia(\'' + cual + '\',\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}
function _evLugarEditarCalMoverMes(cual, dir) {
  var m = _evCalMesDe(_evLugarEditarCal[cual].mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evLugarEditarCal[cual].mostrado = _evToISO(new Date(year, month, 1));
  _evLugarEditarCalRender(cual);
}
function _evLugarEditarCalTocarDia(cual, iso) {
  _evLugarData.fecha = iso;
  _evLugarEditarCalRender(cual);
  _evLugarEditarActualizarCalResumen(cual);
  _evLugarEditarActualizarBoton();
}
function _evLugarEditarActualizarCalResumen(cual) {
  var el = document.getElementById('ev-lugar-editar-cal-' + cual + '-resumen');
  if (el) el.textContent = _evLugarData.fecha ? _evAntFechaLegible(_evLugarData.fecha) : '';
}

/* ═══════════════════════════════════════════════════════
   Selector de hora tipo stepper (_evHoraStepper*) -- 2 columnas (hora/
   minutos) con flechas arriba/abajo + pills AM/PM, sin rueda de scroll
   infinito. Primer selector de hora de la app (los horarios de Venues se
   cargaron siempre a mano en Sheets hasta esta tanda) -- componente
   genérico por prefijo de id (_EV_HORA_STEPPER[prefix]), no atado a "Crear
   evento" pese a vivir en este archivo, para poder montarse más de una vez
   si hiciera falta más adelante. Minutos en pasos de 5 -- un horario de
   evento rara vez necesita el minuto exacto, y son muchos menos toques que
   1 en 1. Siempre representa un valor válido (arranca en 09:00 AM si no se
   pasa uno) -- a diferencia de un <input type="time">, un stepper no tiene
   forma natural de estar "vacío". ═══════════════════════════════════════ */
var _EV_HORA_STEPPER = {};

function _evHoraStepperInit(prefix, valor24h, onChange) {
  var hora = 9, minuto = 0, meridiano = 'AM';
  if (valor24h) {
    var partes = valor24h.split(':');
    var h24 = parseInt(partes[0], 10), min = parseInt(partes[1], 10);
    if (!isNaN(h24) && !isNaN(min)) {
      meridiano = h24 >= 12 ? 'PM' : 'AM';
      hora = h24 % 12; if (hora === 0) hora = 12;
      minuto = Math.round(min / 5) * 5; if (minuto === 60) minuto = 0;
    }
  }
  _EV_HORA_STEPPER[prefix] = { hora: hora, minuto: minuto, meridiano: meridiano, onChange: onChange };
  _evHoraStepperRender(prefix);
}
function _evHoraStepperA24h(prefix) {
  var e = _EV_HORA_STEPPER[prefix]; if (!e) return '';
  var h24 = e.hora % 12; if (e.meridiano === 'PM') h24 += 12;
  return ('0' + h24).slice(-2) + ':' + ('0' + e.minuto).slice(-2);
}
// campoAnimar (opcional): 'hora'/'minuto' -- solo el dígito que efectivamente
// cambió por un tap de flecha se anima, no el otro ni al render inicial
// (_evHoraStepperInit no pasa este argumento, ese primer pintado ya viaja
// dentro del fadeIn del reveal contenedor -- animarlo también sería doble
// fade). Fade rápido (0.09s, no el fadeIn estándar de 0.2s/0.3s de esta
// sección) -- mismo criterio ya documentado en _ajRenderPrefijos()
// (js/perfil.js) de "frecuente = rápido": este valor se re-renderiza en
// cada tap de flecha, igual que ese buscador en cada tecla.
function _evHoraStepperRender(prefix, campoAnimar) {
  var e = _EV_HORA_STEPPER[prefix]; if (!e) return;
  var horaEl = document.getElementById(prefix + '-hora');
  var minEl = document.getElementById(prefix + '-minuto');
  if (horaEl) {
    horaEl.textContent = ('0' + e.hora).slice(-2);
    if (campoAnimar === 'hora') { horaEl.style.animation = 'none'; void horaEl.offsetWidth; horaEl.style.animation = 'fadeIn 0.09s ease'; }
  }
  if (minEl) {
    minEl.textContent = ('0' + e.minuto).slice(-2);
    if (campoAnimar === 'minuto') { minEl.style.animation = 'none'; void minEl.offsetWidth; minEl.style.animation = 'fadeIn 0.09s ease'; }
  }
  document.querySelectorAll('#' + prefix + '-meridiano .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', p.dataset.val === e.meridiano);
  });
}
function _evHoraStepperCambiar(prefix, campo, delta) {
  var e = _EV_HORA_STEPPER[prefix]; if (!e) return;
  if (campo === 'hora') {
    e.hora += delta;
    if (e.hora > 12) e.hora = 1; else if (e.hora < 1) e.hora = 12;
  } else {
    e.minuto += delta * 5;
    if (e.minuto >= 60) e.minuto = 0; else if (e.minuto < 0) e.minuto = 55;
  }
  _evHoraStepperRender(prefix, campo);
  if (e.onChange) e.onChange(_evHoraStepperA24h(prefix));
}
function _evHoraStepperSetMeridiano(prefix, el) {
  var e = _EV_HORA_STEPPER[prefix]; if (!e) return;
  e.meridiano = el.dataset.val;
  _evHoraStepperRender(prefix);
  if (e.onChange) e.onChange(_evHoraStepperA24h(prefix));
}

/* ═══════════════════════════════════════════════════════
   "Crear evento" (#s-eventos-crear, FAB) -- wizard de pasos DINÁMICOS según
   el tipo elegido (ver MANIFEST.md "Cambios recientes" -- antes 3 pasos
   fijos Tipo/Lugar/Detalles, con fecha y hora embebidas dentro de
   "Detalles"). Motor de pasos+progreso reusa .salud-paso/.salud-prog/
   .salud-prog-dot (css/perfil.css) tal cual, pero la navegación YA NO es
   por índice numérico fijo -- `_evCrearMostrarPaso(pasoId)` recibe el ID de
   paso como STRING (`_evCrearPasoActual` guarda cuál está activo), y
   `_EV_CREAR_STEPS` (el array usado SOLO para contar/pintar los dots de
   progreso) se recalcula cada vez que cambia `tipoEvento`/`tipoRecurrencia`
   (`_evCrearRecalcularSteps()`) -- nunca es la lista fija de "todos los
   pasos posibles" (esa es `_EV_CREAR_TODOS_LOS_PASOS`, ver abajo, usada
   solo para togglear `.activo` sin dejar huérfanos de una elección de tipo
   anterior).

   Secuencias reales por tipo (después de "Tipo"):
   - Recurrente + Días de la semana: Lugar → Detalles → Hora.
   - Recurrente + Personalizada: Lugar → Detalles → Fecha → Hora (la
     cantidad/unidad/días de "Personalizada" se eligen en un bottom sheet,
     #ev-crear-bsheet-frecuencia, no expandiendo contenido inline -- ver
     _evCrearSelRecurrencia() más abajo).
   - Único: Lugar → Detalles → Fecha → Hora.
   - Descanso: Fecha de inicio → Fecha de fin (sin Lugar/Detalles/Hora,
     guarda directo -- stub, ver _evCrearGuardar()).

   Paso "Lugar": elegir un venue existente (_evCrearData.venueExistente) de
   la lista, o tocar "Agregar lugar" para abrir el formulario de venue
   COMPARTIDO (#s-eventos-lugar-form, irEvLugarFormNuevo('desde_crear')) y
   volver acá con la lista recargada -- este wizard YA NO tiene su propio
   mini-formulario de lugar nuevo inline (buscador Places + mapa), ver
   `_evLugarFromWizard` más abajo en este archivo. Paso "Detalles" (id
   `ev-crear-paso-config`): pills de categoría (Entrenamiento/Partido/
   Evento, para `asistencias.tipo_evento`) + tipo de recurrencia para
   "Recurrente" (_evCrearActualizarDetalles()).

   Guardado (Recurrente/Único): SIEMPRE crearVenue, incluso con un venue
   existente elegido -- el backend documentado (ver MANIFEST.md "Backend —
   Venues") no tiene una operación de "agregar otra regla de recurrencia a
   un venue ya existente", el id de cada regla es la fila de Venues 1 a 1.
   Elegir un venue existente en el paso "Lugar" arma el payload con su
   nombre/ubicación/ícono/reserva COPIADOS + la recurrencia nueva de los
   pasos siguientes, lo que crea una fila NUEVA (incluida en el llamado
   normal a crearVenue) con la misma identidad de lugar pero un horario
   distinto -- consistente con el modelo real de datos ya documentado ("1
   fila = 1 regla"), no un caso especial. Si más adelante Victor quiere que
   un mismo lugar comparta una sola fila "maestra" entre varias reglas, hace
   falta repensar `Venues` (separarla en una hoja de lugares + una hoja de
   reglas, o una función de backend nueva tipo
   `agregarReglaAVenue(nombreLugar, datosRecurrencia)`) -- fuera de alcance
   de esta tanda, dejado señalado acá en vez de resuelto en silencio.
   ═══════════════════════════════════════════════════════ */

// Universo COMPLETO de pasos posibles -- usado solo para togglear `.activo`
// sin dejar ninguno prendido de una elección de tipo anterior (ej.: el
// admin avanza como "Único" hasta "Lugar", vuelve a "Tipo" y elige
// "Descanso" -- sin esta lista completa, `#ev-crear-paso-lugar` seguiría
// `.activo` para siempre). `_EV_CREAR_STEPS` (abajo) es un subconjunto
// ORDENADO de esta lista, recalculado según la elección real.
var _EV_CREAR_TODOS_LOS_PASOS = ['ev-crear-paso-tipo', 'ev-crear-paso-lugar', 'ev-crear-paso-cat', 'ev-crear-paso-recurrencia', 'ev-crear-paso-fecha', 'ev-crear-paso-hora', 'ev-crear-paso-descanso-rango'];
// Título de la nav por paso -- objeto (no array, los pasos ya no tienen un
// índice fijo), actualizado con fade dentro de _evCrearMostrarPaso() (mismo
// patrón que _EV_LUGAR_STEP_TITULOS/_evLugarMostrarPaso(), más arriba en
// este archivo).
var _EV_CREAR_PASO_TITULOS = {
  'ev-crear-paso-tipo': 'Tipo de evento',
  'ev-crear-paso-lugar': 'Seleccionar lugar',
  'ev-crear-paso-cat': 'Detalles del evento',
  'ev-crear-paso-recurrencia': 'Frecuencia',
  'ev-crear-paso-config': 'Detalles',
  'ev-crear-paso-fecha': 'Fecha del evento',
  'ev-crear-paso-hora': 'Hora de inicio',
  'ev-crear-paso-descanso-rango': 'Período de descanso'
};
// Secuencia ORDENADA del flujo actual -- solo para los dots de progreso
// (_evCrearRenderProg(), indexOf(_evCrearPasoActual) contra este array).
// Recalculada por _evCrearRecalcularSteps() cada vez que cambia
// tipoEvento/tipoRecurrencia -- arranca con un solo paso ("Tipo") porque
// todavía no hay elección de la que derivar el resto del flujo.
var _EV_CREAR_STEPS = ['ev-crear-paso-tipo'];
var _evCrearPasoActual = 'ev-crear-paso-tipo';
var _evCrearData = {};
var _evCrearCal = { referencia: { mostrado: null }, unico: { mostrado: null } };
// Calendarios del paso "Descanso" -- 2 instancias independientes (Desde/
// Hasta), mismo criterio de `.mostrado` (ISO string, no Date) que
// _evCrearCal/_evLugarCal/_evAntCal de este archivo. Estado propio, nunca
// comparte nada con _evCrearCal (que es de "referencia"/"único", del flujo
// Recurrente/Único) ni con _evAntCal (Asistencia anticipada).
var _evCrearDescCal = { mostrado: null, touched: false, prevDesde: null, prevHasta: null };
// El paso "Hora" (#ev-crear-paso-hora) YA ES el wrap del stepper (ya no hay
// un <div style="display:none"> interno que revele por primera vez, como
// tenía el viejo paso "Detalles") -- este flag reemplaza a esa lógica para
// seguir inicializando el stepper UNA sola vez por visita al wizard.
var _evCrearHoraInicializada = false;

function irEvCrear() {
  _evCrearData = {
    tipoEvento: null, tipoEventoCategoria: null, tipoEventoPersonalizado: '',
    descripcion: '',
    venueExistente: null,
    tipoRecurrencia: null, diasSemana: [], frecuenciaNumero: null, frecuenciaUnidad: null,
    fecha: null, hora: '09:00',
    fechaInicioDescanso: null, fechaFinDescanso: null,
    // Estado del bottom sheet "Frecuencia personalizada" (Cambio 2, ver
    // MANIFEST.md "Cambios recientes") -- se espeja hacia
    // frecuenciaNumero/frecuenciaUnidad recién al confirmar (ver
    // _evCrearConfirmarBsheetFrecuencia()), para no duplicar la validación/
    // el payload de guardado que ya usaban esos 2 campos.
    frecConfig: { unidad: 'semanas', cantidad: 1, diasSemana: [] }
  };
  var mesInicial = _evHoyISO();
  _evCrearCal.referencia.mostrado = mesInicial;
  _evCrearCal.unico.mostrado = mesInicial;
  _evCrearDescCal = { mostrado: mesInicial, touched: false, prevDesde: null, prevHasta: null };
  _evCrearHoraInicializada = false;
  _evRestaurarScrollTimeline = true;
  ir('s-eventos-crear');
  _evCrearResetUI();
  _evCrearRecalcularSteps();
  _evCrearMostrarPaso('ev-crear-paso-tipo');
  _evCrearCargarLugares();
  _evCrearCalRender('referencia');
  _evCrearCalRender('unico');
  _evCrearActualizarCalResumen('referencia');
  _evCrearActualizarCalResumen('unico');
  _evCrearDescRangoCalRender();
  _evCrearDescRangoActualizarResumen();
}

// Recalcula _EV_CREAR_STEPS según la elección actual -- llamada desde
// irEvCrear() (estado inicial), _evCrearSetTipo() (cambia tipoEvento) y
// _evCrearSelRecurrencia() (cambia tipoRecurrencia dentro de "Recurrente").
// "Único" y "Recurrente + Personalizada" comparten la misma secuencia
// (Lugar→Detalles→Fecha→Hora) -- ambos necesitan una fecha de referencia/
// única antes de la hora, a diferencia de "Recurrente + Días de la semana"
// (esa recurrencia no depende de ninguna fecha puntual).
function _evCrearRecalcularSteps() {
  var t = _evCrearData.tipoEvento;
  if (t === 'descanso') {
    _EV_CREAR_STEPS = ['ev-crear-paso-tipo', 'ev-crear-paso-descanso-rango'];
  } else if (t === 'unico') {
    _EV_CREAR_STEPS = ['ev-crear-paso-tipo', 'ev-crear-paso-lugar', 'ev-crear-paso-cat', 'ev-crear-paso-fecha', 'ev-crear-paso-hora'];
  } else if (t === 'recurrente' && _evCrearData.tipoRecurrencia === 'cada_tantos') {
    _EV_CREAR_STEPS = ['ev-crear-paso-tipo', 'ev-crear-paso-lugar', 'ev-crear-paso-cat', 'ev-crear-paso-recurrencia', 'ev-crear-paso-fecha', 'ev-crear-paso-hora'];
  } else if (t === 'recurrente') {
    _EV_CREAR_STEPS = ['ev-crear-paso-tipo', 'ev-crear-paso-lugar', 'ev-crear-paso-cat', 'ev-crear-paso-recurrencia', 'ev-crear-paso-hora'];
  } else {
    _EV_CREAR_STEPS = ['ev-crear-paso-tipo'];
  }
}

function _evCrearResetUI() {
  document.querySelectorAll('#ev-crear-tipo-cat-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  ['ev-crear-fecha-referencia-wrap', 'ev-crear-fecha-unico-wrap'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var otroInput = document.getElementById('ev-crear-tipo-otro-input');
  if (otroInput) { otroInput.style.display = 'none'; otroInput.value = ''; }
  var descInput = document.getElementById('ev-crear-descripcion-input');
  if (descInput) { descInput.value = ''; descInput.style.height = 'auto'; }
  var descContador = document.getElementById('ev-crear-desc-contador');
  if (descContador) { descContador.textContent = '0/150'; descContador.classList.remove('ev-editar-desc-contador-limite'); }
}

/* ── Navegación entre pasos -- ver el comentario del encabezado de esta
   sección para el detalle completo de por qué es por ID de paso (string) y
   no por índice. ─────────────────────────────────────────────────────── */
function _evCrearMostrarPaso(pasoId) {
  _EV_CREAR_TODOS_LOS_PASOS.forEach(function(s) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', s === pasoId);
  });
  _evCrearPasoActual = pasoId;
  _evCrearRenderProg();
  // Título de la nav = nombre del paso actual, mismo helper de fade que
  // _evLugarMostrarPaso()/el timeline principal (_evFadeSwap()) -- no un
  // fade propio a mano.
  var tituloEl = document.getElementById('ev-crear-form-titulo');
  if (tituloEl) _evFadeSwap(tituloEl, function() { tituloEl.textContent = _EV_CREAR_PASO_TITULOS[pasoId] || ''; }, false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (pasoId === 'ev-crear-paso-recurrencia') _evCrearIniciarPasoRecurrencia();
  if (pasoId === 'ev-crear-paso-fecha') _evCrearActualizarPasoFecha();
  if (pasoId === 'ev-crear-paso-hora') _evCrearActualizarPasoHora();
  if (pasoId === 'ev-crear-paso-descanso-rango') { _evCrearDescRangoCalRender(); _evCrearDescRangoActualizarResumen(); }
  _evCrearActualizarFooter();
}
function _evCrearRenderProg() {
  var cont = document.getElementById('ev-crear-prog'); if (!cont) return;
  var idx = _EV_CREAR_STEPS.indexOf(_evCrearPasoActual);
  cont.innerHTML = '';
  for (var i = 0; i < _EV_CREAR_STEPS.length; i++) {
    var d = document.createElement('div');
    d.className = 'salud-prog-dot' + (i < idx ? ' done' : (i === idx ? ' active' : ''));
    cont.appendChild(d);
  }
}
// `irEventos()`, no `ir('s-eventos')` a secas (ver "Cambios recientes" --
// bug real: volver del FAB dejaba el timeline saltado a scroll 0). Solo
// `irEventos()` arma `_evRestaurarScrollTimeline = true` antes de navegar --
// `_evTimelineScrollY` ya queda guardado solo (el hook genérico `alSalir()`
// de `ir()`, js/ui.js, corre para CUALQUIER salida de `#s-eventos`, no solo
// por nav inferior), pero sin ese flag el restore de `ir()` nunca se activa.
function _evCrearBack() {
  var p = _evCrearPasoActual;
  if (p === 'ev-crear-paso-tipo') { irEventos(); return; }
  if (p === 'ev-crear-paso-lugar') { _evCrearMostrarPaso('ev-crear-paso-tipo'); return; }
  if (p === 'ev-crear-paso-cat') { _evCrearMostrarPaso('ev-crear-paso-lugar'); return; }
  if (p === 'ev-crear-paso-recurrencia') { _evCrearMostrarPaso('ev-crear-paso-cat'); return; }
  if (p === 'ev-crear-paso-fecha') {
    var prevFecha = (_evCrearData.tipoEvento === 'unico') ? 'ev-crear-paso-cat' : 'ev-crear-paso-recurrencia';
    _evCrearMostrarPaso(prevFecha); return;
  }
  if (p === 'ev-crear-paso-hora') {
    var previo = (_evCrearData.tipoRecurrencia === 'dias_semana')
      ? 'ev-crear-paso-recurrencia' : 'ev-crear-paso-fecha';
    _evCrearMostrarPaso(previo);
    return;
  }
  if (p === 'ev-crear-paso-descanso-rango') { _evCrearMostrarPaso('ev-crear-paso-tipo'); return; }
}
// Reemplaza a la vieja _evCrearIrPaso1() -- ahora cubre las transiciones
// hacia adelante de TODOS los flujos (ver el comentario del encabezado de
// esta sección para la secuencia completa de cada tipo).
function _evCrearIrSiguiente() {
  var p = _evCrearPasoActual;
  if (p === 'ev-crear-paso-tipo') {
    if (!_evCrearData.tipoEvento) return;
    _evCrearMostrarPaso(_evCrearData.tipoEvento === 'descanso' ? 'ev-crear-paso-descanso-rango' : 'ev-crear-paso-lugar');
    return;
  }
  if (p === 'ev-crear-paso-lugar') {
    if (!_evCrearLugarValido()) return;
    _evCrearMostrarPaso('ev-crear-paso-cat');
    return;
  }
  if (p === 'ev-crear-paso-cat') {
    if (_evCrearData.tipoEvento === 'recurrente') {
      _evCrearMostrarPaso('ev-crear-paso-recurrencia');
    } else {
      _evCrearMostrarPaso('ev-crear-paso-fecha');
    }
    return;
  }
  if (p === 'ev-crear-paso-recurrencia') {
    if (!_evCrearPasoValido(p)) return;
    _evCrearSincronizarRecurrencia();
    _evCrearRecalcularSteps();
    var sigRecurrencia = (_evCrearData.tipoRecurrencia === 'dias_semana') ? 'ev-crear-paso-hora' : 'ev-crear-paso-fecha';
    _evCrearMostrarPaso(sigRecurrencia);
    return;
  }
  if (p === 'ev-crear-paso-fecha') {
    if (!_evCrearPasoValido(p)) return;
    _evCrearMostrarPaso('ev-crear-paso-hora');
    return;
  }
  // 'ev-crear-paso-hora'/'ev-crear-paso-descanso-rango' son los últimos
  // pasos de sus flujos -- el footer ahí ya muestra "Guardar"
  // (_evCrearGuardar()), esta función no aplica.
}
// Validez de los pasos INTERMEDIOS (habilita "Continuar") -- separada de
// _evCrearPasoFinalValido() (habilita "Guardar"), que reusa la validación
// completa ya existente (_evCrearRecurrenciaValidaWizard()) sin importar en
// qué paso se completó cada campo.
function _evCrearPasoValido(p) {
  if (p === 'ev-crear-paso-lugar') return _evCrearLugarValido();
  if (p === 'ev-crear-paso-cat') return true;
  if (p === 'ev-crear-paso-recurrencia') {
    var cfg = _evCrearData.frecConfig;
    if (cfg.unidad === 'semanas') return cfg.diasSemana.length > 0;
    return true;
  }
  if (p === 'ev-crear-paso-fecha') return !!_evCrearData.fecha;
  return false;
}
function _evCrearPasoFinalValido() {
  if (_evCrearPasoActual === 'ev-crear-paso-hora') return _evCrearRecurrenciaValidaWizard();
  if (_evCrearPasoActual === 'ev-crear-paso-descanso-rango') return !!(_evCrearData.fechaInicioDescanso && _evCrearData.fechaFinDescanso);
  return false;
}
function _evCrearActualizarFooter() {
  var footer = document.getElementById('cta-footer-s-eventos-crear');
  var btn = document.getElementById('ev-crear-btn-footer'); if (!btn) return;
  var p = _evCrearPasoActual;
  if (p === 'ev-crear-paso-tipo') {
    // Paso "Tipo": sin botón de footer real -- tocar una card ya avanza sola
    // (_evCrearSetTipo() -> _evCrearIrSiguiente()), ver #ev-crear-paso-tipo
    // en index.html. El footer fijo queda oculto acá en vez de borrado del
    // DOM, mismo criterio que el resto de este wizard con elementos que no
    // aplican a un paso puntual.
    if (footer) footer.style.display = 'none';
    btn.textContent = 'Continuar';
    btn.onclick = _evCrearIrSiguiente;
    btn.disabled = !_evCrearData.tipoEvento;
    return;
  }
  if (footer) footer.style.display = 'flex';
  var esUltimo = (p === 'ev-crear-paso-hora' || p === 'ev-crear-paso-descanso-rango');
  if (esUltimo) {
    btn.textContent = 'Guardar';
    btn.onclick = _evCrearGuardar;
    btn.disabled = !_evCrearPasoFinalValido();
  } else {
    btn.textContent = 'Continuar';
    btn.onclick = _evCrearIrSiguiente;
    btn.disabled = !_evCrearPasoValido(p);
  }
}

/* ── Paso "Lugar" -- buscador local sobre _evLugares (reusa la misma
   variable/carga que "Editar lugares") + lista seleccionable + un ítem
   final "Agregar lugar" que abre el formulario de venue COMPARTIDO
   (#s-eventos-lugar-form, irEvLugarFormNuevo('desde_crear')) -- ver
   MANIFEST.md "Cambios recientes": este wizard YA NO tiene su propio
   mini-formulario inline (buscador Places + mapa + nombre + tipo de
   ícono), esa creación vive en un solo lugar (`_evLugarFromWizard`, más
   abajo en este archivo). Mismo fix real que `irEvLugares()` (ver
   MANIFEST.md "Cambios recientes" -- fix de "Gestionar venues"): esta
   función pedía el MISMO `action:'getVenues'` roto (Apps Script, nunca
   desplegada tras la migración de Venues a Supabase), señalado en esa
   tanda como "fuera de alcance" y muy probablemente con el mismo síntoma
   -- confirmado y corregido acá con el mismo patrón. ──── */
function _evCrearCargarLugares() {
  var cont = document.getElementById('ev-crear-lista-lugares');
  if (cont) cont.innerHTML = _evLugaresSkeletonHtml();
  var miCarga = ++_evLugaresCargaId;
  fetch(SUPABASE_URL + '/rest/v1/venues?select=*&order=lugar.asc', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(rows) {
    if (miCarga !== _evLugaresCargaId) return;
    _evLugares = (rows || []).map(_evMapVenueSupabase);
    _evCrearRenderLugares(_evLugares);
  }).catch(function(e) {
    if (miCarga !== _evLugaresCargaId) return;
    if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No se pudieron cargar los lugares.</p>';
  });
}
// "Agregar lugar" (_evCrearAgregarLugarHtml()) va SIEMPRE al final de la
// lista, con o sin resultados de búsqueda -- mismo criterio que "+ Este
// lugar no está en la lista" tenía antes, ahora como una card más en vez de
// un botón aparte bajo la lista.
function _evCrearRenderLugares(lista) {
  var cont = document.getElementById('ev-crear-lista-lugares'); if (!cont) return;
  var htmlLista = !lista.length
    ? '<p style="color:var(--muted);font-size:0.85rem;">' +
        (_evLugares.length ? 'Ningún lugar coincide con la búsqueda.' : 'Todavía no hay lugares creados.') + '</p>'
    : lista.map(function(v) {
        var activa = _evCrearData.venueExistente && _evCrearData.venueExistente.fila === v.fila;
        return '<div class="ev-ant-card ev-crear-venue-card' + (activa ? ' activa' : '') + '" onclick="_evCrearSeleccionarLugar(\'' + v.fila + '\')">' +
          '<div class="ev-card-top-row">' +
            '<div class="ev-card-icon"><span class="material-symbols-outlined">place</span></div>' +
            '<div class="ev-card-body">' +
              '<div class="ev-card-titulo">' + v.nombre + '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="ev-ant-card-edit" onclick="event.stopPropagation();_evLugarAbrirEditar(\'' + v.fila + '\', true)" title="Editar">' +
            '<span class="material-symbols-outlined">edit</span>' +
          '</button>' +
          '<button type="button" class="ev-ant-card-del" onclick="event.stopPropagation();_evLugarBorrar(\'' + v.fila + '\')" title="Borrar">' +
            '<span class="material-symbols-outlined">delete</span>' +
          '</button>' +
        '</div>';
      }).join('');
  cont.innerHTML = htmlLista + _evCrearAgregarLugarHtml();
}
// `.ev-crear-venue-add` (css/eventos.css) -- borde punteado, sin fondo
// sólido, para distinguirla visualmente de las cards de venues reales.
function _evCrearAgregarLugarHtml() {
  return '<div class="ev-ant-card ev-crear-venue-card ev-crear-venue-add" onclick="irEvLugarFormNuevo(\'desde_crear\')">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-icon"><span class="material-symbols-outlined">add_circle</span></div>' +
      '<div class="ev-card-body"><div class="ev-card-titulo">Agregar lugar</div></div>' +
    '</div>' +
  '</div>';
}
function _evCrearFiltrarLugares(texto) {
  var q = (texto || '').trim().toLowerCase();
  var lista = !q ? _evLugares : _evLugares.filter(function(v) { return (v.nombre || '').toLowerCase().indexOf(q) !== -1; });
  _evCrearRenderLugares(lista);
}
function _evCrearSeleccionarLugar(fila) {
  var v = _evLugares.filter(function(x) { return x.fila === fila; })[0];
  if (!v) return;
  _evCrearData.venueExistente = v;
  var buscador = document.getElementById('ev-crear-buscador-lugar');
  _evCrearFiltrarLugares(buscador ? buscador.value : '');
  _evCrearActualizarFooter();
}
function _evCrearLugarValido() {
  return !!_evCrearData.venueExistente;
}

/* ── Paso "Tipo" -- 3 cards (_evCrearSetTipo()) que avanzan solas al
   tocarlas, sin botón de footer (ver _evCrearActualizarFooter()). "Único"
   ya no se elige con una pill dentro de "Detalles" (quedaba redundante con
   este selector de más alto nivel) -- fija `_evCrearData.tipoRecurrencia =
   'unico'` a mano, que es lo que hace que el paso "Fecha" muestre el
   calendario de fecha única (ver _evCrearActualizarPasoFecha()) en vez del
   de fecha de referencia. ──── */
function _evCrearSetTipo(tipo) {
  _evCrearData.tipoEvento = tipo;
  // Si cambia el tipo, resetear tipoEventoCategoria (no aplica a "descanso")
  // y cualquier sub-elección de recurrencia ya hecha -- evita arrastrar un
  // estado de una elección de tipo anterior (ida y vuelta entre cards).
  _evCrearData.tipoEventoCategoria = null;
  document.querySelectorAll('#ev-crear-tipo-cat-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  _evCrearData.tipoRecurrencia = (tipo === 'unico') ? 'unico' : null;
  document.querySelectorAll('#ev-crear-recurrencia-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  _evCrearRecalcularSteps();
  _evCrearIrSiguiente();
}
function _evCrearSetTipoCategoria(cat) {
  _evCrearData.tipoEventoCategoria = cat;
  document.querySelectorAll('#ev-crear-tipo-cat-pills .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', p.dataset.val === cat);
  });
  // Input libre solo para "Otro" -- se oculta y limpia al elegir cualquier
  // otra pill, mismo criterio que el resto de los "wrap" condicionales de
  // este paso (ver _evCrearResetUI()/_evCrearActualizarDetalles()).
  var otroInput = document.getElementById('ev-crear-tipo-otro-input');
  if (otroInput) {
    if (cat === 'Otro') {
      otroInput.style.display = '';
      otroInput.style.animation = 'none';
      void otroInput.offsetWidth;
      otroInput.style.animation = 'fadeIn 0.2s ease';
    } else {
      otroInput.value = '';
      _evCrearData.tipoEventoPersonalizado = '';
      otroInput.style.animation = 'fadeOut 0.15s ease forwards';
      setTimeout(function() {
        if (_evCrearData.tipoEventoCategoria !== 'Otro') otroInput.style.display = 'none';
      }, 150);
    }
  }
}
// Textarea "Descripción (opcional)" del paso "Detalles" -- mismo componente
// (auto-resize + contador `.ev-editar-desc-contador`, límite 150) que ya
// usaba la pantalla huérfana "Nuevo evento único" (_evCrearUnicoDescripcionInput()),
// reusado tal cual acá para el wizard activo.
function _evCrearDescripcionInput(el) {
  _evCrearData.descripcion = el.value;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  var cont = document.getElementById('ev-crear-desc-contador');
  if (cont) {
    cont.textContent = el.value.length + '/150';
    cont.classList.toggle('ev-editar-desc-contador-limite', (150 - el.value.length) <= 20);
  }
}
/* ── Calendario de rango "ida y vuelta" del paso "Descanso"
   (`ev-crear-paso-descanso-rango`, ver MANIFEST.md "Cambios recientes") --
   reemplaza a los 2 calendarios independientes "Desde"/"Hasta" que tenía
   este paso antes. Mismo mecanismo/clases que usa "Por período" en
   Asistencia Anticipada (`_evAntCalRender('periodo')`/
   `_evAntCalTocarDia('periodo', iso)`) y la pantalla huérfana-para-creación-
   pero-viva-para-edición "Nueva/Editar temporada de descanso"
   (`_evCrearDescansoCalRender()`/`_evCrearDescansoCalTocarDia()`, más abajo
   en este archivo) -- mismo criterio ya documentado ahí: comparte el LOOK
   del calendario (clases `.ev-ant-cal-*`/`.ev-ant-fecha-pill`/
   `.ev-ant-rango-*`) entre los 3 flujos, nunca el estado -- este wizard
   tiene el suyo propio (`_evCrearDescCal` + `_evCrearData.fechaInicioDescanso`/
   `fechaFinDescanso`). Reusa literal `_evCrearDescansoFechaPillHtml()` (sin
   estado propio, ya pensada para compartirse entre pantallas). Bloquea
   fechas pasadas (una temporada de descanso no debería poder arrancar ni
   terminar en el pasado). ──────────────────────────────────────────────── */
function _evCrearDescRangoCalMoverMes(dir) {
  var m = _evCalMesDe(_evCrearDescCal.mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evCrearDescCal.mostrado = _evToISO(new Date(year, month, 1));
  _evCrearDescRangoCalRender();
}
// "Ida y vuelta" -- mismo criterio que _evAntCalTocarDia('periodo', iso)/
// _evCrearDescansoCalTocarDia(iso): sin inicio, o con inicio+fin ya
// completos, el toque fija el inicio y limpia el fin; con solo inicio
// pendiente, un toque posterior (>= inicio) fija el fin, uno anterior AL
// inicio lo reemplaza -- empieza el rango de nuevo desde esa fecha, nunca
// queda un rango invertido (cubre "si la segunda es anterior a la primera,
// intercambiarlas" sin necesitar un swap real).
function _evCrearDescRangoCalTocarDia(iso) {
  if (_evFechaCmp(iso, _evHoyISO()) < 0) return;
  var inicio = _evCrearData.fechaInicioDescanso, fin = _evCrearData.fechaFinDescanso;
  if (!inicio || fin) {
    _evCrearData.fechaInicioDescanso = iso;
    _evCrearData.fechaFinDescanso = null;
  } else if (_evFechaCmp(iso, inicio) < 0) {
    _evCrearData.fechaInicioDescanso = iso;
  } else {
    _evCrearData.fechaFinDescanso = iso;
  }
  _evCrearDescCal.touched = true;
  _evCrearDescRangoCalRender();
  _evCrearDescRangoActualizarResumen();
  _evCrearActualizarFooter();
}
function _evCrearDescRangoCalRestablecer() {
  _evCrearData.fechaInicioDescanso = null;
  _evCrearData.fechaFinDescanso = null;
  _evCrearDescCal.touched = false;
  _evCrearDescRangoCalRender();
  _evCrearDescRangoActualizarResumen();
  _evCrearActualizarFooter();
}
function _evCrearDescRangoActualizarResumen() {
  var cont = document.getElementById('ev-crear-desc-rango-resumen');
  if (!cont) return;
  var st = _evCrearDescCal;
  var inicio = _evCrearData.fechaInicioDescanso, fin = _evCrearData.fechaFinDescanso;
  var inicioNuevo = !!inicio && inicio !== st.prevDesde;
  var finNuevo = !!fin && fin !== st.prevHasta;
  if (!inicio) {
    cont.innerHTML = '<span class="ev-ant-rango-vacio">Toca una fecha en el calendario para empezar</span>';
    void cont.offsetWidth;
    cont.style.animation = 'fadeIn 0.2s ease';
  } else {
    var html = 'Del ' + _evCrearDescansoFechaPillHtml(inicio, inicioNuevo);
    if (fin) html += ' al ' + _evCrearDescansoFechaPillHtml(fin, finNuevo);
    cont.innerHTML = html;
    cont.style.animation = '';
  }
  st.prevDesde = inicio;
  st.prevHasta = fin;
  var btn = document.getElementById('ev-crear-desc-rango-btn-restablecer');
  if (btn) {
    if (st.touched) { btn.style.display = 'flex'; void btn.offsetWidth; btn.style.animation = 'fadeIn 0.2s ease'; }
    else {
      btn.style.animation = 'fadeOut 0.2s ease forwards';
      setTimeout(function() { if (!_evCrearDescCal.touched) btn.style.display = 'none'; }, 200);
    }
  }
}
function _evCrearDescRangoCalRender() {
  var cont = document.getElementById('ev-crear-desc-rango-cal');
  if (!cont) return;
  var m = _evCalMesDe(_evCrearDescCal.mostrado);
  var labelEl = document.getElementById('ev-crear-desc-rango-cal-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var inicio = _evCrearData.fechaInicioDescanso, fin = _evCrearData.fechaFinDescanso;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (inicio && celdaIso === inicio) clases += ' ev-ant-cal-sel';
    if (fin && celdaIso === fin) clases += ' ev-ant-cal-sel';
    if (inicio && fin && _evFechaCmp(celdaIso, inicio) > 0 && _evFechaCmp(celdaIso, fin) < 0) clases += ' ev-ant-cal-en-rango';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_evCrearDescRangoCalTocarDia(\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  // Fade al repintar -- mismo fix aplicado al resto de instancias de este
  // componente en este archivo (ver comentario completo en _evAntCalRender()).
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}
/* ── Paso "Detalles" (id `ev-crear-paso-config`) -- categoría (siempre
   visible, este paso ya no lo comparte con "Descanso") + tipo de
   recurrencia para "Recurrente" ("Días de la semana" revela el selector de
   días inline acá mismo; "Personalizada" abre un bottom sheet en vez de
   expandir contenido, ver _evCrearSelRecurrencia() más abajo). "Único" no
   muestra nada de recurrencia acá -- nada que elegir, solo la categoría. ── */
function _evCrearActualizarDetalles() {
  var semanalWrap = document.getElementById('ev-crear-rec-semanal-wrap');
  if (semanalWrap) semanalWrap.style.display = (_evCrearData.tipoEvento === 'recurrente') ? '' : 'none';
  _evCrearMostrarDiasSiCorresponde();
  var frecResumen = document.getElementById('ev-crear-frec-resumen');
  if (frecResumen) frecResumen.style.display = (_evCrearData.tipoRecurrencia === 'cada_tantos' && _evCrearData.frecuenciaNumero != null) ? 'block' : 'none';
}
function _evCrearSelRecurrencia(el) {
  document.querySelectorAll('#ev-crear-recurrencia-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evCrearData.tipoRecurrencia = el.dataset.val;
  _evCrearRecalcularSteps();
  _evCrearActualizarDetalles();
  // "Personalizada" abre el bottom sheet en vez de expandir contenido
  // inline (Cambio 2, ver MANIFEST.md "Cambios recientes") -- reemplaza al
  // viejo bloque #ev-crear-rec-cada (número + pills de unidad + calendario
  // de fecha de referencia, todo inline).
  if (el.dataset.val === 'cada_tantos') _evCrearAbrirBsheetFrecuencia();
  _evCrearActualizarFooter();
}
// Reveal del selector de días (#ev-crear-rec-dias) SOLO para "Días de la
// semana" -- "Personalizada" tiene su propio selector de días adentro del
// bottom sheet (#ev-crear-frec-dias-row), no comparte este. Separada de
// _evCrearActualizarDetalles() para poder llamarla también sola desde
// _evCrearSelRecurrencia() sin repintar el resto del paso.
function _evCrearMostrarDiasSiCorresponde() {
  var el = document.getElementById('ev-crear-rec-dias'); if (!el) return;
  var mostrar = _evCrearData.tipoRecurrencia === 'dias_semana';
  var yaVisible = el.style.display === 'block';
  el.style.display = mostrar ? 'block' : 'none';
  if (mostrar && !yaVisible) { void el.offsetWidth; el.style.animation = 'fadeIn 0.2s ease'; }
}
function _evCrearToggleDia(el) {
  var dia = parseInt(el.dataset.dia, 10);
  el.classList.toggle('activa');
  var idx = _evCrearData.diasSemana.indexOf(dia);
  if (el.classList.contains('activa')) { if (idx === -1) _evCrearData.diasSemana.push(dia); }
  else if (idx !== -1) { _evCrearData.diasSemana.splice(idx, 1); }
  _evCrearActualizarFooter();
}

/* ── Paso "Frecuencia" (ev-crear-paso-recurrencia) -- unifica el antiguo
   selector "Días de la semana" y el bottom sheet "Frecuencia personalizada"
   en un único paso inline: stepper de cantidad + pills Días/Semanas/Meses +
   círculos de día (solo visibles cuando unidad=semanas). Maneja todo sobre
   _evCrearData.frecConfig directamente; _evCrearSincronizarRecurrencia()
   vuelca hacia tipoRecurrencia/diasSemana/frecuenciaNumero/frecuenciaUnidad
   al avanzar al siguiente paso. ──────────────────────────────────────────── */
function _evCrearIniciarPasoRecurrencia() {
  // Defaults solo la primera vez (frecConfig puede venir pre-llenado si el
  // usuario volvió atrás desde un paso posterior).
  if (!_evCrearData.frecConfig.inicializado) {
    _evCrearData.frecConfig = { unidad: 'semanas', cantidad: 1, diasSemana: [1], inicializado: true };
  }
  _evCrearRecRenderUI();
  _evCrearRecActualizarTexto();
}
function _evCrearRecRenderUI() {
  var cfg = _evCrearData.frecConfig;
  _adminSetStepperValue('ev-crear-rec-cantidad', cfg.cantidad);
  document.querySelectorAll('#ev-crear-rec-unidad-pills .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', p.dataset.val === cfg.unidad);
  });
  document.querySelectorAll('#ev-crear-rec-dias-row .ev-dia-circulo').forEach(function(c) {
    c.classList.toggle('activa', cfg.diasSemana.indexOf(parseInt(c.dataset.dia, 10)) !== -1);
  });
  var diasRow = document.getElementById('ev-crear-rec-dias-row');
  if (diasRow) diasRow.style.display = cfg.unidad === 'semanas' ? 'flex' : 'none';
}
function _evCrearRecFrecCambio() {
  var inp = document.getElementById('ev-crear-rec-cantidad');
  _evCrearData.frecConfig.cantidad = inp ? (parseInt(inp.value, 10) || 1) : 1;
  _evCrearRecActualizarTexto();
  _evCrearActualizarFooter();
}
function _evCrearRecSelUnidad(el) {
  document.querySelectorAll('#ev-crear-rec-unidad-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evCrearData.frecConfig.unidad = el.dataset.val;
  var diasRow = document.getElementById('ev-crear-rec-dias-row');
  if (diasRow) {
    if (el.dataset.val === 'semanas') {
      diasRow.style.display = 'flex';
      void diasRow.offsetWidth;
      diasRow.style.animation = 'fadeIn 0.2s ease';
    } else {
      diasRow.style.display = 'none';
    }
  }
  _evCrearRecActualizarTexto();
  _evCrearActualizarFooter();
}
function _evCrearRecToggleDia(el) {
  var dia = parseInt(el.dataset.dia, 10);
  el.classList.toggle('activa');
  var arr = _evCrearData.frecConfig.diasSemana;
  var idx = arr.indexOf(dia);
  if (el.classList.contains('activa')) { if (idx === -1) arr.push(dia); }
  else if (idx !== -1) { arr.splice(idx, 1); }
  _evCrearRecActualizarTexto();
  _evCrearActualizarFooter();
}
var _EV_CREAR_DIAS_NOMBRES_REC = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
function _evCrearRecTextoResultado() {
  var cfg = _evCrearData.frecConfig;
  var n = cfg.cantidad || 1;
  if (cfg.unidad === 'semanas') {
    var dias = (cfg.diasSemana || []).slice().sort(function(a, b) { return a - b; })
      .map(function(d) { return _EV_CREAR_DIAS_NOMBRES_REC[d - 1]; });
    if (!dias.length) return 'El evento ocurrirá cada semana.';
    var diasStr;
    if (dias.length === 1) diasStr = dias[0];
    else diasStr = dias.slice(0, -1).join(', ') + ' y ' + dias[dias.length - 1];
    if (n === 1) return 'El evento será los ' + diasStr + ' de cada semana.';
    return 'El evento ocurrirá cada ' + n + ' semanas los ' + diasStr + '.';
  }
  if (cfg.unidad === 'meses') {
    return n === 1 ? 'El evento ocurrirá cada mes.' : 'El evento ocurrirá cada ' + n + ' meses.';
  }
  return n === 1 ? 'El evento ocurrirá todos los días.' : 'El evento ocurrirá cada ' + n + ' días.';
}
function _evCrearRecActualizarTexto() {
  var el = document.getElementById('ev-crear-rec-texto-resultado');
  if (el) el.textContent = _evCrearRecTextoResultado();
}
// Vuelca frecConfig → los campos que usa _evCrearGuardar() y
// _evCrearRecurrenciaValidaWizard() -- llamada siempre al avanzar desde
// ev-crear-paso-recurrencia, nunca antes para no pisar datos mientras el
// usuario navega.
function _evCrearSincronizarRecurrencia() {
  var cfg = _evCrearData.frecConfig;
  if (cfg.unidad === 'semanas') {
    _evCrearData.tipoRecurrencia = 'dias_semana';
    _evCrearData.diasSemana = cfg.diasSemana.slice();
    _evCrearData.frecuenciaNumero = null;
    _evCrearData.frecuenciaUnidad = null;
  } else {
    _evCrearData.tipoRecurrencia = 'cada_tantos';
    _evCrearData.diasSemana = [];
    _evCrearData.frecuenciaNumero = cfg.cantidad;
    _evCrearData.frecuenciaUnidad = cfg.unidad;
  }
}

/* ── Bottom sheet "Frecuencia personalizada" (#ev-crear-bsheet-frecuencia,
   index.html) -- Cambio 2, ver MANIFEST.md "Cambios recientes". Mismo
   patrón `.bsheet`/`.bsheet-overlay` + `_registrarOverlayAbierto()` +
   `history.back()` en el cierre normal que ya usa el resto de sheets de la
   app (`_evAbrirSheetCancelar()`/`_evCerrarSheetCancelar()`, más arriba en
   este archivo). Unidad de tiempo (pills) + cantidad (`.qty-stepper`, mismo
   componente de Tareas/Equipamiento, `adminStepperChange()`/js/admin.js) +
   día(s) de la semana (ocultos si la unidad es "Días"). Todo escribe EN
   VIVO sobre `_evCrearData.frecConfig` (persiste entre aperturas -- volver
   a abrir el sheet para editar no resetea nada); "Confirmar" solo cierra y
   espeja `frecuenciaNumero`/`frecuenciaUnidad` (ver
   _evCrearConfirmarBsheetFrecuencia() más abajo). ──────────────────────── */
function _evCrearAbrirBsheetFrecuencia() {
  var f = _evCrearData.frecConfig;
  document.querySelectorAll('#ev-crear-frec-unidad-pills .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', p.dataset.val === f.unidad);
  });
  _adminSetStepperValue('ev-crear-frec-cantidad', f.cantidad);
  document.querySelectorAll('#ev-crear-frec-dias-row .ev-dia-circulo').forEach(function(c) {
    c.classList.toggle('activa', f.diasSemana.indexOf(parseInt(c.dataset.dia, 10)) !== -1);
  });
  var diasWrap = document.getElementById('ev-crear-frec-dias-wrap');
  if (diasWrap) diasWrap.style.display = (f.unidad === 'dias') ? 'none' : 'block';
  _evCrearFrecActualizarPreview();

  var ov = document.getElementById('ev-crear-bsheet-frecuencia-overlay');
  var sh = document.getElementById('ev-crear-bsheet-frecuencia');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(_evCrearCerrarBsheetFrecuencia);
}
function _evCrearCerrarBsheetFrecuencia(porGesto) {
  if (!porGesto) { history.back(); return; }
  var ov = document.getElementById('ev-crear-bsheet-frecuencia-overlay');
  var sh = document.getElementById('ev-crear-bsheet-frecuencia');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
function _evCrearFrecSelUnidad(el) {
  document.querySelectorAll('#ev-crear-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evCrearData.frecConfig.unidad = el.dataset.val;
  var diasWrap = document.getElementById('ev-crear-frec-dias-wrap');
  if (diasWrap) diasWrap.style.display = (el.dataset.val === 'dias') ? 'none' : 'block';
  _evCrearFrecActualizarPreview();
}
// Llamada encadenada después de adminStepperChange() (mismo patrón ya usado
// por _tarCrearActualizarFooter()/adminGuardarEquipAuto() en index.html) --
// ese helper genérico ya escribió el valor nuevo en el <input type="hidden">
// y el <span class="qty-value">, acá solo se refleja en frecConfig + el
// texto de preview.
function _evCrearFrecStepperCambio() {
  var inp = document.getElementById('ev-crear-frec-cantidad');
  _evCrearData.frecConfig.cantidad = inp ? (parseInt(inp.value, 10) || 1) : 1;
  _evCrearFrecActualizarPreview();
}
function _evCrearFrecToggleDia(el) {
  var dia = parseInt(el.dataset.dia, 10);
  el.classList.toggle('activa');
  var arr = _evCrearData.frecConfig.diasSemana;
  var idx = arr.indexOf(dia);
  if (el.classList.contains('activa')) { if (idx === -1) arr.push(dia); }
  else if (idx !== -1) { arr.splice(idx, 1); }
  _evCrearFrecActualizarPreview();
}
function _evCrearFrecActualizarPreview() {
  var el = document.getElementById('ev-crear-frec-preview');
  if (el) el.textContent = _evCrearFrecResumenTexto();
}
// Copia frecConfig -> frecuenciaNumero/frecuenciaUnidad (mismos 2 campos
// que ya usaba "cada_tantos" antes de este cambio, ver
// _evCrearRecurrenciaValidaWizard()/_evCrearGuardar() más abajo -- sin
// tocar esas 2 funciones, siguen validando/armando el payload igual).
// `diasSemana` del bottom sheet NO viaja al payload de guardado -- el
// backend de `crearVenue` (nunca visto desplegado en `supabase/functions/
// api/index.ts`, cualquier acción no listada ahí cae a `forwardToGAS()`
// hacia Apps Script) no tiene manejo conocido de días de semana combinados
// con "cada_tantos"; se captura solo para el texto de resumen (acá y en el
// paso "Detalles") hasta que se confirme soporte real del lado backend --
// señalado por honestidad, no resuelto en silencio.
function _evCrearConfirmarBsheetFrecuencia() {
  _evCrearData.frecuenciaNumero = _evCrearData.frecConfig.cantidad;
  _evCrearData.frecuenciaUnidad = _evCrearData.frecConfig.unidad;
  _evCrearCerrarBsheetFrecuencia();
  var resumen = document.getElementById('ev-crear-frec-resumen');
  if (resumen) {
    resumen.textContent = _evCrearFrecResumenTexto();
    resumen.style.display = 'block';
    void resumen.offsetWidth; resumen.style.animation = 'fadeIn 0.2s ease';
  }
  _evCrearActualizarFooter();
}
// "lunes"/"martes"/"miércoles"/"jueves"/"viernes" ya son iguales en singular
// y plural en español ("el lunes"/"los lunes") -- solo "sábado"/"domingo"
// cambian de forma al pluralizar, por eso la lista de abajo va directo en
// plural (siempre se usa detrás de "los", nunca sueltos).
var _EV_CREAR_DIAS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
function _evCrearFrecDiasTexto(dias) {
  var nombres = dias.slice().sort(function(a, b) { return a - b; }).map(function(d) { return _EV_CREAR_DIAS_PLURAL[d - 1]; });
  if (!nombres.length) return '';
  if (nombres.length === 1) return nombres[0];
  return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}
function _evCrearFrecResumenTexto() {
  var f = _evCrearData.frecConfig;
  var n = f.cantidad || 1;
  var diasTxt = _evCrearFrecDiasTexto(f.diasSemana || []);
  if (f.unidad === 'dias') return 'Cada ' + n + ' día' + (n === 1 ? '' : 's');
  if (f.unidad === 'semanas') {
    var base = 'Cada ' + n + ' semana' + (n === 1 ? '' : 's');
    return diasTxt ? base + ' los ' + diasTxt : base;
  }
  var base2 = n + (n === 1 ? ' vez al mes' : ' veces al mes');
  return diasTxt ? base2 + ' los ' + diasTxt : base2;
}

/* ── Paso "Fecha del evento" (`ev-crear-paso-fecha`) -- 2 calendarios ya
   existentes (fecha de referencia/fecha única), reasignados de "vivir
   dentro de Detalles" a un paso propio -- _evCrearActualizarPasoFecha()
   togglea cuál de los 2 wraps se muestra según tipoRecurrencia, llamada
   desde _evCrearMostrarPaso() al entrar acá. Calendario inline (reusa tal
   cual los helpers genéricos de fecha del timeline principal, mismo
   mecanismo que _evLugarCalRender() de arriba). ──────────────────────── */
function _evCrearActualizarPasoFecha() {
  var t = _evCrearData.tipoRecurrencia;
  var refWrap = document.getElementById('ev-crear-fecha-referencia-wrap');
  if (refWrap) refWrap.style.display = (t === 'cada_tantos') ? '' : 'none';
  var unicoWrap = document.getElementById('ev-crear-fecha-unico-wrap');
  if (unicoWrap) unicoWrap.style.display = (t === 'unico') ? '' : 'none';
}
function _evCrearCalRender(cual) {
  var cont = document.getElementById('ev-crear-cal-' + cual); if (!cont) return;
  var m = _evCalMesDe(_evCrearCal[cual].mostrado);
  var labelEl = document.getElementById('ev-crear-cal-' + cual + '-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var seleccionada = _evCrearData.fecha;
  var bloquearPasado = cual === 'unico';
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = bloquearPasado && _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (seleccionada && celdaIso === seleccionada) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_evCrearCalTocarDia(\'' + cual + '\',\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  // Fade al repintar -- mismo fix aplicado a las otras 3 instancias de este
  // componente (_evAntCalRender/_evLugarCalRender/_tarCrearCalRender, ver
  // comentario completo en _evAntCalRender()).
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}
function _evCrearCalMoverMes(cual, dir) {
  var m = _evCalMesDe(_evCrearCal[cual].mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evCrearCal[cual].mostrado = _evToISO(new Date(year, month, 1));
  _evCrearCalRender(cual);
}
function _evCrearCalTocarDia(cual, iso) {
  _evCrearData.fecha = iso;
  var cont = document.getElementById('ev-crear-cal-' + cual);
  if (cont) {
    cont.querySelectorAll('.ev-ant-cal-sel').forEach(function(c) { c.classList.remove('ev-ant-cal-sel'); });
    var celda = cont.querySelector('[data-iso="' + iso + '"]');
    if (celda) {
      celda.classList.add('ev-ant-cal-sel');
      celda.style.animation = 'none';
      void celda.offsetWidth;
      celda.style.animation = 'evCalCeldaSel 0.25s ease';
    }
  }
  _evCrearActualizarCalResumen(cual);
  _evCrearActualizarFooter();
}
function _evCrearActualizarCalResumen(cual) {
  var el = document.getElementById('ev-crear-cal-' + cual + '-resumen');
  if (el) el.textContent = _evCrearData.fecha ? _evAntFechaLegible(_evCrearData.fecha) : '';
}

/* ── Paso "Hora de inicio" (`ev-crear-paso-hora`) -- el stepper YA existía
   (_evHoraStepper*, ver ese bloque más arriba en este archivo), lo único
   nuevo es CUÁNDO se inicializa: antes lo hacía _evCrearMostrarSubRecurrencia()
   la primera vez que revelaba el wrap `#ev-crear-hora-wrap` dentro del paso
   "Detalles"; ahora este paso entero ES ese wrap (mostrado/ocultado por
   `.salud-paso.activo`, sin wrap interno propio), así que la bandera
   `_evCrearHoraInicializada` reemplaza a ese chequeo de "primera vez". ── */
function _evCrearActualizarPasoHora() {
  if (_evCrearHoraInicializada) return;
  _evCrearHoraInicializada = true;
  _evHoraStepperInit('ev-crear-hora', _evCrearData.hora, function(v) { _evCrearData.hora = v; _evCrearActualizarFooter(); });
}
function _evCrearRecurrenciaValidaWizard() {
  var t = _evCrearData.tipoRecurrencia;
  if (t === 'dias_semana') return _evCrearData.diasSemana.length > 0 && !!_evCrearData.hora;
  if (t === 'cada_tantos') return !!(_evCrearData.frecuenciaNumero > 0 && _evCrearData.frecuenciaUnidad && _evCrearData.fecha && _evCrearData.hora);
  if (t === 'unico') return !!(_evCrearData.fecha && _evCrearData.hora);
  return false;
}

// Fecha del evento recién creado, para poder saltar el timeline ahí al
// volver (ver _evCrearGuardar() más abajo) -- 3 casos:
// - "Único"/"Recurrente + Personalizada" (tipoRecurrencia 'unico'/'cada_tantos'):
//   ya tienen una fecha puntual real en `_evCrearData.fecha` (paso "Fecha
//   del evento", _evCrearCalTocarDia() más arriba en este archivo).
// - "Recurrente + Días de la semana" (sin fecha puntual elegida en el
//   wizard -- solo `_evCrearData.diasSemana`, array de 1=Lunes..7=Domingo):
//   se calcula la próxima ocurrencia desde HOY (inclusive) que caiga en
//   alguno de los días elegidos. `Date.getDay()` nativo es 0=Domingo..6=Sábado
//   -- se traduce a la convención 1..7 de este archivo antes de comparar
//   contra `diasSemana`.
// - "Descanso": `_evCrearData.fechaInicioDescanso` (el guardado real de
//   este tipo todavía es un stub, ver _evCrearGuardar() -- este caso queda
//   listo para cuando se implemente, sin caller real todavía).
function _evCrearFechaEventoCreado() {
  var d = _evCrearData;
  if (d.tipoEvento === 'descanso') return d.fechaInicioDescanso;
  if (d.tipoRecurrencia === 'dias_semana') {
    var hoy = new Date();
    for (var i = 0; i < 7; i++) {
      var candidato = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      var diaISO = candidato.getDay() === 0 ? 7 : candidato.getDay();
      if (d.diasSemana.indexOf(diaISO) !== -1) return _evToISO(candidato);
    }
    return null;
  }
  return d.fecha || null;
}
/* ── Guardado final -- Bug real corregido (ver MANIFEST.md "Cambios
   recientes"): esto seguía usando `apiPost({action:'crearVenue',...})`, la
   acción vieja de la era Sheets/Apps Script que NUNCA se desplegó
   ("Acción no válida o no especificada" en cada guardado, señalado como
   "fuera de alcance" en varias entradas anteriores de este MANIFEST y
   nunca corregido acá). Fix: mismo mecanismo `fetch()` directo a Supabase
   que ya usa `_evLugarGuardar()` (arriba en este archivo) para crear
   venues, con las mismas columnas reales confirmadas por Victor
   (`lugar`/`google_maps`/`tipo_icono`/`requiere_reserva`/`tipo`/`dias`/
   `frecuencia`/`unidad`/`fecha_referencia`/`inicia`) -- ninguna acción de
   por medio. SIEMPRE POST (nunca PATCH), incluso con un venue existente
   elegido en el paso "Lugar", ver la nota de diseño más arriba en el
   encabezado de esta sección ("1 fila = 1 regla", sin operación de backend
   para "agregar otra recurrencia a un venue ya existente").

   `tipoEventoCategoria`/`tipoEventoPersonalizado`/`descripcion` (nuevos,
   ver MANIFEST.md) quedan capturados en `_evCrearData` y disponibles para
   cuando haga falta mandarlos, pero NO viajan en este payload a propósito:
   `venues` no tiene ninguna columna confirmada para categoría de evento ni
   descripción (la tabla de columnas confirmadas/sin confirmar documentada
   más arriba en este MANIFEST no incluye ninguna de las 2), y una tabla
   real de Postgres/PostgREST rechaza el INSERT COMPLETO si un solo campo
   no existe -- mandar una columna inventada acá rompería de nuevo la
   creación del evento, el mismo síntoma que se está arreglando. Señalado,
   no resuelto en silencio -- el punto exacto a ajustar el día que Victor
   confirme (o cree) las columnas reales. "Descanso" queda pendiente -- toast
   informativo, sin guardar nada todavía (ver `_evCrearDescansoGuardar()`
   más abajo en este archivo). ────────────────────────────────────────── */
function _evCrearGuardar() {
  if (_evCrearData.tipoEvento === 'descanso') {
    mostrarToast('Temporada de descanso: disponible próximamente.', 'ok', true);
    return;
  }
  if (!_evCrearLugarValido() || !_evCrearRecurrenciaValidaWizard()) return;
  var v = _evCrearData.venueExistente;
  var payload = {
    lugar: v.nombre,
    google_maps: v.mapsUrl,
    tipo_icono: v.tipoIcono,
    requiere_reserva: v.requiereReserva !== false,
    tipo: _evCrearData.tipoRecurrencia,
    inicia: _evCrearData.hora
  };
  if (_evCrearData.tipoRecurrencia === 'dias_semana') {
    payload.dias = _evCrearData.diasSemana.slice().sort(function(a, b) { return a - b; });
  } else if (_evCrearData.tipoRecurrencia === 'cada_tantos') {
    payload.frecuencia = _evCrearData.frecuenciaNumero;
    payload.unidad = _evCrearData.frecuenciaUnidad;
    payload.fecha_referencia = _evCrearData.fecha;
  } else if (_evCrearData.tipoRecurrencia === 'unico') {
    payload.fecha_referencia = _evCrearData.fecha;
  }

  mostrarCargando('Creando evento...');
  fetch(SUPABASE_URL + '/rest/v1/venues', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    // El POST de arriba solo guarda la REGLA (fila de `venues`) -- las
    // filas de `asistencias` que el timeline realmente lee (getEventosRango())
    // las genera un proceso de backend aparte (_mantenerVentanaAsistenciasInterno(),
    // GAS, ver MANIFEST.md "Backend — Venues"/"Migración de Venues a
    // Supabase Etapa B") que por default corre 1 vez al día (cron 3am) --
    // sin este llamado, el venue queda guardado pero NINGÚN evento nuevo
    // aparece en el timeline hasta el día siguiente, aunque el guardado
    // "salió bien". `adminRegenerarVentanaAsistencias` (ya en el router de
    // GAS desde esa migración, `forwardToGAS()` -- ver MANIFEST.md) dispara
    // esa regeneración a mano. Best-effort a propósito: si falla (ej. GAS
    // caído), NO bloquea el flujo -- "Evento creado" ya es cierto (la regla
    // se guardó) y el timeline igual se refresca por si la regeneración
    // automática ya había corrido antes.
    // Capturada ANTES de navegar/refrescar -- _evCrearData sigue intacta acá
    // (nada la resetea hasta la próxima vez que se abra el wizard,
    // irEvCrear()), pero mejor no depender de eso más adelante en la cadena.
    var fechaEventoCreado = _evCrearFechaEventoCreado();
    function _evCrearGuardarTerminar() {
      ocultarCargando();
      mostrarToast('Evento creado.', 'ok');
      ir('s-eventos');
      // Bug real corregido (ver MANIFEST.md "Cambios recientes"): esto le
      // faltaba a este guardado en particular -- `ir('s-eventos')` sola NO
      // vuelve a pedir `_EV_EVENTOS` si la sesión ya había visitado Eventos
      // antes (`irEventos()`/`_evYaInicializadoEnSesion`, más arriba en este
      // archivo), así que el timeline quedaba mostrando datos viejos hasta
      // un F5. Mismo patrón que el resto de guardados/borrados de esta
      // sección (`_evCrearDescansoGuardar()`/`_evOffseasonEliminar()`, más
      // abajo en este archivo): refetch explícito + re-render.
      // Salta el timeline a la fecha del evento recién creado -- mismo
      // combo re-render+scroll que ya usa _evCalIrAFechaEnTimeline() cuando
      // el timeline no está en su estado normal (`_evScrollAFecha()`, ver
      // más arriba en este archivo, encuentra `#ev-fecha-<iso>` o cae al
      // grupo real más cercano si esa fecha puntual no tiene contenido
      // propio -- ej. "Recurrente" cuando la próxima ocurrencia calculada
      // no coincide 1:1 con lo que el backend termine generando). Sin
      // fecha calculable (caso borde, no debería pasar con la validación ya
      // exigida en `_evCrearRecurrenciaValidaWizard()`), solo re-renderiza.
      _evCargarDatosReales(function() {
        if (fechaEventoCreado) {
          _evRenderTimeline(true, function() { _evScrollAFecha(fechaEventoCreado, false, true); });
        } else {
          _evRenderTimeline(true);
        }
      });
    }
    api({ action: 'adminRegenerarVentanaAsistencias', adminToken: _adminToken }, _evCrearGuardarTerminar, _evCrearGuardarTerminar);
  }).catch(function(e) {
    ocultarCargando();
    mostrarToast((e && e.message) || 'No se pudo crear el evento.', 'error');
  });
}

/* ═══════════════════════════════════════════════════════
   Tanda C1 -- FAB de 4 opciones (Recurrente/Único/Descanso/Venues, ver
   MANIFEST.md "Cambios recientes") + "Nueva temporada de descanso"
   (#s-eventos-crear-descanso). "Único" pasa de placeholder a implementación
   real en la Tanda C2, ver el bloque de abajo.

   HUÉRFANO desde el wizard "Tipo → Lugar → Detalles" (ver MANIFEST.md
   "Cambios recientes", entrada más reciente): `irEvCrearUnico()`/
   `irEvCrearDescanso()` y las pantallas `#s-eventos-crear-unico`/
   `#s-eventos-crear-descanso` de acá abajo quedan SIN caller real -- "Único"
   ahora vive dentro del wizard de arriba (paso "Tipo", ver
   `_evCrearSetTipo()`), y "Descanso" tiene un paso equivalente en el mismo
   wizard aunque el guardado real todavía no está implementado ahí (stub,
   ver `_evCrearGuardar()`). Código dejado intacto, no eliminado -- útil de
   referencia mientras se termina de decidir/implementar el guardado real de
   "Descanso" en el wizard nuevo. ═══════════════════════════════════════ */

/* ── Tanda C2 -- "Nuevo evento único" (#s-eventos-crear-unico, admin). Un
   evento único es UNA fila directa de la tabla `asistencias` de Supabase
   (POST, ver _evCrearUnicoGuardar() más abajo) -- a diferencia del wizard
   "Crear evento" (#s-eventos-crear, arriba en este archivo), que siempre
   crea una REGLA de recurrencia en `venues` (una fila de Venues, con
   `_mantenerVentanaAsistenciasInterno()` generando los eventos concretos a
   partir de ella). Sin pasos -- todos los campos siempre visibles en una
   sola pantalla scrolleable, mismo criterio que "Nueva temporada de
   descanso" (Tanda C1.5) -- acá tampoco hay nada que revelar/ocultar según
   una elección previa. Estado 100% propio (`_evCrearUnicoData`/
   `_evCrearUnicoCal`), nunca comparte estado con `_evCrearData`/`_evCrearCal`
   del wizard de arriba pese a reusar varios de sus mismos componentes
   visuales (calendario de fecha única, stepper de hora). ──── */
var _evCrearUnicoData = { tipo: null, lugarId: null, lugarNombre: '', lugarMapsUrl: null, fecha: null, hora: null, horaTocada: false, descripcion: '' };
var _evCrearUnicoCal = { mostrado: null };

function irEvCrearUnico() {
  _evCrearUnicoData = { tipo: null, lugarId: null, lugarNombre: '', lugarMapsUrl: null, fecha: null, hora: null, horaTocada: false, descripcion: '' };
  _evCrearUnicoCal = { mostrado: _evHoyISO() };
  document.querySelectorAll('#ev-crear-unico-tipo-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  var descInp = document.getElementById('ev-crear-unico-descripcion-input');
  if (descInp) { descInp.value = ''; descInp.style.height = 'auto'; }
  var descCont = document.getElementById('ev-crear-unico-desc-contador');
  if (descCont) { descCont.textContent = '0/150'; descCont.classList.remove('ev-editar-desc-contador-limite'); }
  var calResumen = document.getElementById('ev-crear-unico-cal-resumen');
  if (calResumen) calResumen.textContent = '';
  ir('s-eventos-crear-unico');
  _evCrearUnicoCargarVenues();
  _evCrearUnicoCalRender();
  _evHoraStepperInit('ev-crear-unico-hora', null, function(v) { _evCrearUnicoData.hora = v; _evCrearUnicoData.horaTocada = true; });
  _evCrearUnicoActualizarBoton();
}

/* Tipo de evento -- 4 pills de selección única (subconjunto de _EV_ICONOS,
   arriba en este archivo -- ya cubre "Entrenamiento"/"Partido"/"Asamblea"/
   "Otro" sin agregar ninguna clave nueva al mapa). Determina el ícono que
   se va a ver en el timeline el día que este evento aparezca ahí, gratis --
   _evCardEventoHtml()/el resto del render de eventos ya resuelven el ícono
   a partir de `tipo` para cualquier evento real, sin importar si vino de
   una regla de venue o de este flujo. */
function _evCrearUnicoSelTipo(el) {
  document.querySelectorAll('#ev-crear-unico-tipo-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evCrearUnicoData.tipo = el.dataset.val;
  _evCrearUnicoActualizarBoton();
}

/* Lugar -- lista de venues existentes como pills, mismo `.aj-pill` de
   siempre y misma acción de backend (`adminGetVenues`) que el campo
   "Lugar" de #s-eventos-editar (_evEditarCargarVenues()/_evEditarRenderVenues()/
   _evEditarSelVenue(), más arriba en este archivo) -- reusa el mismo cache
   de módulo `_EV_VENUES` (poblado una sola vez por sesión, sin importar cuál
   de las 2 pantallas lo pidió primero) en vez de duplicar el fetch. Sin
   pill de "requiere reserva" ni mini-formulario de lugar nuevo acá -- un
   evento único siempre elige un lugar YA existente, a diferencia del Paso 1
   de #s-eventos-crear (que sí permite crear uno). */
function _evCrearUnicoCargarVenues() {
  var cont = document.getElementById('ev-crear-unico-lugar-pills');
  if (_EV_VENUES) { _evCrearUnicoRenderVenues(); return; }
  if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.78rem;margin:0;">Cargando lugares...</p>';
  api({ action: 'adminGetVenues', adminToken: _adminToken }, function(res) {
    _EV_VENUES = res || [];
    _evCrearUnicoRenderVenues();
  }, function(e) {
    if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.78rem;margin:0;">No se pudieron cargar los lugares.</p>';
  });
}
function _evCrearUnicoRenderVenues() {
  var cont = document.getElementById('ev-crear-unico-lugar-pills'); if (!cont) return;
  if (!_EV_VENUES.length) { cont.innerHTML = '<p style="color:var(--muted);font-size:0.78rem;margin:0;">Todavía no hay lugares creados.</p>'; return; }
  cont.innerHTML = _EV_VENUES.map(function(v) {
    var activa = _evCrearUnicoData.lugarId === v.id;
    return '<span class="aj-pill' + (activa ? ' activa' : '') + '" data-id="' + v.id + '" onclick="_evCrearUnicoSelVenue(\'' + v.id + '\')">' + v.lugar + '</span>';
  }).join('');
}
// google_maps: el nombre real de la columna de link de Maps en la tabla
// `venues` no está confirmado (adminGetVenues() hace select('*') sin lista
// explícita de columnas, y `venues` -- a diferencia de `asistencias`, ver
// MANIFEST.md -- nunca quedó documentada campo por campo en este archivo).
// Se prueban las 3 variantes de nombre que este proyecto ya usa en otros
// lados para el mismo concepto (snake_case real de Supabase, camelCase del
// contrato viejo de Apps Script) -- si ninguna existe en el objeto, queda
// `null` sin romper nada (mismo criterio "opcional, si está disponible" que
// pidió el brief de esta tanda).
function _evCrearUnicoSelVenue(id) {
  var v = (_EV_VENUES || []).filter(function(x) { return x.id === id; })[0];
  if (!v) return;
  _evCrearUnicoData.lugarId = id;
  _evCrearUnicoData.lugarNombre = v.lugar;
  _evCrearUnicoData.lugarMapsUrl = v.google_maps || v.maps_url || v.mapsUrl || null;
  document.querySelectorAll('#ev-crear-unico-lugar-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.id == id); });
  _evCrearUnicoActualizarBoton();
}

/* Fecha -- calendario inline de fecha única, mismo mecanismo/clases que
   _evCrearCalRender('unico') (arriba en este archivo, Paso 2 del wizard de
   recurrencia) pero con estado propio (_evCrearUnicoCal, nunca comparte
   _evCrearCal). Bloquea cualquier fecha anterior a hoy -- un evento único
   nunca debería poder crearse retroactivamente, mismo criterio ya
   establecido en el resto de esta sección (Asistencia anticipada, "Nueva
   temporada de descanso"). */
function _evCrearUnicoCalRender() {
  var cont = document.getElementById('ev-crear-unico-cal'); if (!cont) return;
  var m = _evCalMesDe(_evCrearUnicoCal.mostrado);
  var labelEl = document.getElementById('ev-crear-unico-cal-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var seleccionada = _evCrearUnicoData.fecha;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (seleccionada && celdaIso === seleccionada) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_evCrearUnicoCalTocarDia(\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}
function _evCrearUnicoCalMoverMes(dir) {
  var m = _evCalMesDe(_evCrearUnicoCal.mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evCrearUnicoCal.mostrado = _evToISO(new Date(year, month, 1));
  _evCrearUnicoCalRender();
}
function _evCrearUnicoCalTocarDia(iso) {
  _evCrearUnicoData.fecha = iso;
  _evCrearUnicoCalRender();
  var resumen = document.getElementById('ev-crear-unico-cal-resumen');
  if (resumen) resumen.textContent = _evAntFechaLegible(iso);
  _evCrearUnicoActualizarBoton();
}

/* Descripción -- mismo patrón de auto-crecimiento + contador "[n]/150" que
   #s-eventos-editar (_evEditarDescripcionInput()/_evEditarDescActualizarContador(),
   más arriba en este archivo), con su propio id de textarea (CSS scoped por
   ID, ver css/eventos.css) -- el contador SÍ reusa las 2 clases genéricas
   de esa pantalla tal cual, cero CSS nuevo para el contador en sí. */
function _evCrearUnicoDescripcionInput(el) {
  _evCrearUnicoData.descripcion = el.value;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  var cont = document.getElementById('ev-crear-unico-desc-contador');
  if (cont) {
    cont.textContent = el.value.length + '/150';
    cont.classList.toggle('ev-editar-desc-contador-limite', (150 - el.value.length) <= 20);
  }
}

function _evCrearUnicoValido() {
  var d = _evCrearUnicoData;
  return !!(d.tipo && d.lugarId && d.fecha);
}
function _evCrearUnicoActualizarBoton() {
  var btn = document.getElementById('ev-crear-unico-btn-footer');
  if (btn) btn.disabled = !_evCrearUnicoValido();
}

// Guardado -- POST directo del navegador a la REST API de Supabase (mismo
// mecanismo `fetch()` ya usado por el resto de esta sección para
// `temporadas_descanso`, acá contra `asistencias`), no `apiPost()`/BACKEND.
// `id_evento` se arma client-side (mismo criterio ya usado en otros lados
// de la app para IDs sin backend de por medio -- prefijo legible + timestamp
// + sufijo random corto, suficiente para que 2 clicks seguidos nunca
// choquen). `dia` (día de la semana en texto) sale de `_EV_DIAS_LARGOS`
// (arriba en este archivo, ya usado por el resto del timeline) indexado por
// `Date.getDay()` -- mismo array, ningún cálculo nuevo. `inicia` viaja como
// `null` si el stepper de hora nunca se tocó (`horaTocada`, ver
// irEvCrearUnico()/_evHoraStepperInit()) -- el stepper en sí SIEMPRE
// representa un valor visual válido (no tiene forma de estar "vacío"), así
// que la única forma de saber si el admin realmente eligió una hora es este
// flag aparte, no el valor de `_evCrearUnicoData.hora`.
function _evCrearUnicoGuardar() {
  if (!_evCrearUnicoValido()) return;
  var d = _evCrearUnicoData;
  var idEvento = 'EV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  var dia = _EV_DIAS_LARGOS[_evParseISO(d.fecha).getDay()];
  var body = {
    id_evento: idEvento,
    t: d.tipo,
    fecha: d.fecha,
    mes: d.fecha.slice(0, 7),
    dia: dia,
    donde: d.lugarNombre,
    google_maps: d.lugarMapsUrl || null,
    inicia: d.horaTocada ? d.hora : null,
    estado: 'Próximo',
    info_adicional: d.descripcion || '',
    bloqueado: false,
    es_excepcion: false,
    id_regla: null
  };
  mostrarCargando('Creando evento...');
  fetch(SUPABASE_URL + '/rest/v1/asistencias', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  }).then(function(r) {
    if (r.status === 201) {
      ocultarCargando();
      mostrarToast('Evento creado', 'ok', true);
      ir('s-eventos');
      _evCargarDatosReales(function() { _evRenderTimeline(true); });
      return;
    }
    return r.json().catch(function() { return null; }).then(function(errBody) {
      throw new Error((errBody && errBody.message) || ('No se pudo crear el evento (HTTP ' + r.status + ').'));
    });
  }).catch(function(e) {
    ocultarCargando();
    mostrarToast((e && e.message) || 'No se pudo crear el evento.', 'error');
  });
}

/* ── "Nueva temporada de descanso" -- pantalla de página completa, sin
   pasos: Nombre + calendario de rango, ambos siempre visibles (a diferencia
   de Asistencia anticipada, acá no hay nada que revelar/ocultar). El
   calendario reusa LITERAL las clases `.ev-ant-cal-*`/`.ev-ant-fecha-pill`/
   `.ev-ant-rango-*` (mismo patrón visual pedido explícito) con el selector
   "ida y vuelta" completo del `_evAntCal.periodo` original (ambas fechas
   libres, a diferencia del calendario de #s-eventos-editar, donde el inicio
   queda fijo) -- pero con estado 100% propio (`_evCrearDescansoData`/
   `_evCrearDescansoCal`), nunca comparte `_evAntData`/`_evAntCal` con
   Asistencia anticipada: son 2 flujos independientes que solo comparten el
   look del calendario, no su estado. ──── */
var _evCrearDescansoData = { nombre: '', fechaDesde: null, fechaHasta: null };
var _evCrearDescansoCal = { mostrado: null, touched: false, prevDesde: null, prevHasta: null };
// `id` de la temporada en edición (ver "Cambios recientes" -- editar/borrar
// temporadas de descanso desde el timeline), `null` en modo creación.
// `_evCrearDescansoGuardar()` decide POST vs PATCH según este valor -- se
// setea al entrar en modo edición (`_evOffseasonEditar()`) y se limpia al
// entrar en modo creación (`irEvCrearDescanso()`) y al volver atrás
// (`_evCrearDescansoVolver()`), así nunca queda pisado entre una edición y la
// siguiente apertura de la pantalla, sea cual sea el camino de salida.
var _evDescansoEditandoId = null;

function irEvCrearDescanso() {
  _evDescansoEditandoId = null;
  _evCrearDescansoData = { nombre: '', fechaDesde: null, fechaHasta: null };
  _evCrearDescansoCal = { mostrado: _evHoyISO(), touched: false, prevDesde: null, prevHasta: null };
  var inp = document.getElementById('ev-crear-descanso-nombre');
  if (inp) inp.value = '';
  var btn = document.getElementById('ev-crear-descanso-btn-restablecer');
  if (btn) btn.style.display = 'none';
  _evCrearDescansoActualizarChrome();
  ir('s-eventos-crear-descanso');
  _evCrearDescansoCalRender();
  _evCrearDescansoCalActualizarResumen();
  _evCrearDescansoActualizarBoton();
}

// Modo edición (ver "Cambios recientes" -- ícono editar de la card de
// offseason en el timeline, `_evCardOffseasonHtml()`) -- misma pantalla que
// "Nueva temporada de descanso", pre-cargada con los datos de `o`
// (`_EV_OFFSEASON`, ya en camelCase). Mismo criterio que `_evAntEditar()`:
// arranca "touched" (el botón restablecer visible desde el arranque, no
// recién tras un toque nuevo) porque ya trae fechas resueltas.
function _evOffseasonEditar(id) {
  var o = _EV_OFFSEASON.filter(function(x) { return x.id === id; })[0];
  if (!o) return;
  _evDescansoEditandoId = id;
  _evCrearDescansoData = { nombre: o.nombre, fechaDesde: o.fechaInicio, fechaHasta: o.fechaFin };
  _evCrearDescansoCal = { mostrado: o.fechaInicio, touched: true, prevDesde: null, prevHasta: null };
  var inp = document.getElementById('ev-crear-descanso-nombre');
  if (inp) inp.value = o.nombre;
  _evCrearDescansoActualizarChrome();
  ir('s-eventos-crear-descanso');
  _evCrearDescansoCalRender();
  _evCrearDescansoCalActualizarResumen();
  _evCrearDescansoActualizarBoton();
}

// Título del header + label del botón del footer, según modo creación/edición.
function _evCrearDescansoActualizarChrome() {
  var titulo = document.getElementById('ev-crear-descanso-titulo');
  if (titulo) titulo.textContent = _evDescansoEditandoId ? 'Editar temporada' : 'Nueva temporada de descanso';
  var btn = document.getElementById('ev-crear-descanso-btn-footer');
  if (btn) btn.textContent = _evDescansoEditandoId ? 'Guardar cambios' : 'Crear temporada';
}

// Flecha atrás del header -- limpia el modo edición antes de volver, para
// que una entrada futura por `irEvCrearDescanso()` nunca herede un id viejo
// (defensivo, `irEvCrearDescanso()` ya lo limpia igual apenas arranca).
function _evCrearDescansoVolver() {
  // irEventos(), no volver('s-eventos') -- mismo fix de scroll que
  // _evCrearBack(), ver ese comentario.
  _evDescansoEditandoId = null;
  irEventos();
}
function _evCrearDescansoInput() {
  var inp = document.getElementById('ev-crear-descanso-nombre');
  _evCrearDescansoData.nombre = inp ? inp.value : '';
  _evCrearDescansoActualizarBoton();
}
function _evCrearDescansoCalMoverMes(dir) {
  var m = _evCalMesDe(_evCrearDescansoCal.mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _evCrearDescansoCal.mostrado = _evToISO(new Date(year, month, 1));
  _evCrearDescansoCalRender();
}
// "Ida y vuelta" -- mismo criterio que _evAntCalTocarDia('periodo', iso):
// sin Desde, o con Desde+Hasta ya completos, el toque fija Desde y limpia
// Hasta; con solo Desde pendiente, un toque posterior (>=Desde) fija Hasta,
// uno anterior a Desde lo reemplaza (empieza de nuevo, nunca queda un rango
// invertido). Ambas fechas libres desde hoy en adelante (pedido explícito) --
// mismo guard de fecha pasada que el resto de los calendarios de esta
// sección.
function _evCrearDescansoCalTocarDia(iso) {
  if (_evFechaCmp(iso, _evHoyISO()) < 0) return;
  var desde = _evCrearDescansoData.fechaDesde, hasta = _evCrearDescansoData.fechaHasta;
  if (!desde || hasta) {
    _evCrearDescansoData.fechaDesde = iso;
    _evCrearDescansoData.fechaHasta = null;
  } else if (_evFechaCmp(iso, desde) < 0) {
    _evCrearDescansoData.fechaDesde = iso;
  } else {
    _evCrearDescansoData.fechaHasta = iso;
  }
  _evCrearDescansoCal.touched = true;
  _evCrearDescansoCalRender();
  _evCrearDescansoCalActualizarResumen();
  _evCrearDescansoActualizarBoton();
}
function _evCrearDescansoCalRestablecer() {
  _evCrearDescansoData.fechaDesde = null;
  _evCrearDescansoData.fechaHasta = null;
  _evCrearDescansoCal.touched = false;
  _evCrearDescansoCalRender();
  _evCrearDescansoCalActualizarResumen();
  _evCrearDescansoActualizarBoton();
}
// Pill de fecha propia -- NO reusa _evAntFechaPillHtml() (su onclick llama
// _evAntFocoCalendario(), un scroll específico del wizard de Asistencia
// anticipada) -- sí reusa _evAntFechaCorta() (formato d/m/aaaa puro, sin
// ningún estado propio, seguro de compartir entre pantallas).
function _evCrearDescansoFechaPillHtml(iso, animar) {
  var style = animar ? ' style="animation:fadeIn 0.2s ease"' : '';
  return '<span class="ev-ant-fecha-pill"' + style + '>' + _evAntFechaCorta(iso) + '</span>';
}
function _evCrearDescansoCalActualizarResumen() {
  var cont = document.getElementById('ev-crear-descanso-rango-resumen');
  if (!cont) return;
  var st = _evCrearDescansoCal;
  var desde = _evCrearDescansoData.fechaDesde, hasta = _evCrearDescansoData.fechaHasta;
  var desdeNueva = !!desde && desde !== st.prevDesde;
  var hastaNueva = !!hasta && hasta !== st.prevHasta;
  if (!desde) {
    cont.innerHTML = '<span class="ev-ant-rango-vacio">Toca una fecha en el calendario para empezar</span>';
    void cont.offsetWidth;
    cont.style.animation = 'fadeIn 0.2s ease';
  } else {
    var html = 'Del ' + _evCrearDescansoFechaPillHtml(desde, desdeNueva);
    if (hasta) html += ' al ' + _evCrearDescansoFechaPillHtml(hasta, hastaNueva);
    cont.innerHTML = html;
    cont.style.animation = '';
  }
  st.prevDesde = desde;
  st.prevHasta = hasta;
  var btn = document.getElementById('ev-crear-descanso-btn-restablecer');
  if (btn) {
    if (st.touched) { btn.style.display = 'flex'; void btn.offsetWidth; btn.style.animation = 'fadeIn 0.2s ease'; }
    else {
      btn.style.animation = 'fadeOut 0.2s ease forwards';
      setTimeout(function() { if (!_evCrearDescansoCal.touched) btn.style.display = 'none'; }, 200);
    }
  }
}
// Grilla del calendario -- mismo componente/clases que _evAntCalRender('periodo')
// (más arriba en este archivo), con estado propio (ver comentario del
// bloque de arriba). Bloquea cualquier fecha anterior a hoy (`.ev-ant-cal-pasado`,
// sin `onclick`), ambos extremos libres desde ahí en adelante.
function _evCrearDescansoCalRender() {
  var cont = document.getElementById('ev-crear-descanso-cal');
  if (!cont) return;
  var m = _evCalMesDe(_evCrearDescansoCal.mostrado);
  var labelEl = document.getElementById('ev-crear-descanso-cal-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var desde = _evCrearDescansoData.fechaDesde, hasta = _evCrearDescansoData.fechaHasta;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (desde && celdaIso === desde) clases += ' ev-ant-cal-sel';
    if (hasta && celdaIso === hasta) clases += ' ev-ant-cal-sel';
    if (desde && hasta && _evFechaCmp(celdaIso, desde) > 0 && _evFechaCmp(celdaIso, hasta) < 0) clases += ' ev-ant-cal-en-rango';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_evCrearDescansoCalTocarDia(\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  _evFadeSwap(cont, function() { cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>'; }, false);
}
function _evCrearDescansoValido() {
  var d = _evCrearDescansoData;
  return !!(d.nombre && d.nombre.trim() && d.fechaDesde && d.fechaHasta);
}
function _evCrearDescansoActualizarBoton() {
  var btn = document.getElementById('ev-crear-descanso-btn-footer');
  if (btn) btn.disabled = !_evCrearDescansoValido();
}
// Guardado -- fetch directo del navegador a la REST API de Supabase (mismo
// mecanismo que la lectura de temporadas_descanso en _evCargarDatosReales(),
// ver MANIFEST.md "Cambios recientes"), no `apiPost()`/BACKEND. `Prefer:
// return=minimal` -- no hace falta el registro de vuelta, solo confirmar
// éxito (`r.ok`, cubre el 201 de un POST y el 204 de un PATCH por igual). En
// error, intenta leer el mensaje real de PostgREST (`{message,...}`, formato
// estándar de error de PostgREST/Supabase) antes de caer a un texto genérico
// -- sigue funcionando igual si el body de error no es JSON válido
// (`.catch(() => null)`). Modo edición (`_evDescansoEditandoId`, ver
// "Cambios recientes" -- editar/borrar temporadas de descanso): mismo body,
// PATCH a `?id=eq.<id>` en vez de POST a la colección entera.
function _evCrearDescansoGuardar() {
  if (!_evCrearDescansoValido()) return;
  var d = _evCrearDescansoData;
  var editando = _evDescansoEditandoId;
  var url = SUPABASE_URL + '/rest/v1/temporadas_descanso' + (editando ? ('?id=eq.' + editando) : '');
  mostrarCargando(editando ? 'Guardando cambios...' : 'Creando temporada...');
  fetch(url, {
    method: editando ? 'PATCH' : 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ nombre: d.nombre.trim(), fecha_inicio: d.fechaDesde, fecha_fin: d.fechaHasta })
  }).then(function(r) {
    if (r.ok) {
      ocultarCargando();
      mostrarToast(editando ? 'Temporada actualizada' : 'Temporada creada', 'ok', true);
      _evDescansoEditandoId = null;
      ir('s-eventos');
      _evCargarDatosReales(function() { _evRenderTimeline(true); });
      return;
    }
    return r.json().catch(function() { return null; }).then(function(body) {
      throw new Error((body && body.message) || ('No se pudo guardar la temporada (HTTP ' + r.status + ').'));
    });
  }).catch(function(e) {
    ocultarCargando();
    mostrarToast((e && e.message) || 'No se pudo guardar la temporada.', 'error');
  });
}

// Eliminar (ver "Cambios recientes" -- ícono borrar de la card de offseason
// en el timeline, `_evCardOffseasonHtml()`) -- mismo `confirm()` nativo que
// `_evAntEliminar()`, DELETE directo a Supabase (mismo mecanismo que el
// guardado de arriba, sin `Prefer` -- no hace falta el registro borrado de
// vuelta, PostgREST responde 204 por default).
function _evOffseasonEliminar(id) {
  if (!confirm('¿Eliminar esta temporada de descanso? Esta acción no se puede deshacer.')) return;
  mostrarCargando('Eliminando...');
  fetch(SUPABASE_URL + '/rest/v1/temporadas_descanso?id=eq.' + id, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then(function(r) {
    ocultarCargando();
    if (!r.ok) { mostrarToast('No se pudo eliminar la temporada.', 'error'); return; }
    mostrarToast('Temporada eliminada', 'ok', true);
    _evCargarDatosReales(function() { _evRenderTimeline(true); });
  }).catch(function() {
    ocultarCargando();
    mostrarToast('No se pudo eliminar la temporada.', 'error');
  });
}

// Guardado del hub "Editar evento" (#s-eventos-editar, ver
// _evEditarConfirmar() más abajo en este archivo) -- PATCH directo del
// navegador a la REST API de Supabase (mismo mecanismo `fetch()` que el
// resto de esta sección), no `apiPost()`/BACKEND -- reemplaza a
// `adminEditarEvento`, la acción que `_evEditarConfirmar()` llamaba antes
// (nunca llegó a implementarse en el backend, ver el comentario que tenía
// esa función). `campos` (`{donde,inicia,termina,info_adicional}`, todas
// opcionales -- undefined = "no tocar esa columna") llega ya traducido a
// nombres reales de columna, arma acá el objeto PATCH real. `modo`
// (`'individual'`/`'periodo'`/`'desde_aqui'`, mismos 3 valores que las pills
// de `#ev-editar-scope-pills`) decide el alcance:
//  - `'individual'` -- solo la fila de ESTE `id_evento`, marcada
//    `es_excepcion:true` (deja de heredar los valores de su regla).
//  - `'periodo'`/`'desde_aqui'` -- todas las filas de la misma `id_regla`
//    (la regla de recurrencia que generó este evento, resuelta con un GET
//    aparte porque el llamador solo tiene el `id_evento`) desde `fechaDesde`
//    en adelante, acotado a `fechaHasta` si es `'periodo'`. `'periodo'`
//    también marca cada fila tocada como excepción (mismo motivo que
//    individual); `'desde_aqui'` NO -- es un cambio permanente del patrón,
//    así que además actualiza la REGLA (`venues.inicia`/`venues.lugar`, solo
//    los campos que de verdad cambiaron) para que los eventos que la regla
//    genere a futuro también nazcan con el horario/lugar nuevo, no solo los
//    ya existentes -- bug real corregido en esta tanda: antes solo cubría
//    `inicia`, dejando `venues.lugar` sin sincronizar cuando el único campo
//    tocado era el lugar (ver MANIFEST.md "Cambios recientes").
function _evAdminEditarEvento(idEvento, campos, modo, fechaDesde, fechaHasta, onOk, onErr) {
  var H = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
  var upd = {};
  if (campos.donde !== undefined) upd.donde = campos.donde;
  if (campos.inicia !== undefined) upd.inicia = campos.inicia;
  if (campos.termina !== undefined) upd.termina = campos.termina;
  if (campos.info_adicional !== undefined) upd.info_adicional = campos.info_adicional;

  function patch(url, body, ok, fail) {
    fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify(body) })
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); ok(); })
      .catch(fail);
  }

  if (modo === 'individual') {
    upd.es_excepcion = true;
    patch(SUPABASE_URL + '/rest/v1/asistencias?id_evento=eq.' + encodeURIComponent(idEvento), upd, onOk, onErr);
    return;
  }

  // periodo / desde_aqui: necesita id_regla del evento
  fetch(SUPABASE_URL + '/rest/v1/asistencias?id_evento=eq.' + encodeURIComponent(idEvento) + '&select=id_regla&limit=1', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
  })
  .then(function(r) { return r.json(); })
  .then(function(rows) {
    var idRegla = rows[0] && rows[0].id_regla;
    if (!idRegla) { onErr(new Error('Este evento no tiene regla de recurrencia')); return; }

    var filtroFecha = modo === 'periodo'
      ? '&fecha=gte.' + fechaDesde + '&fecha=lte.' + fechaHasta
      : '&fecha=gte.' + fechaDesde;

    if (modo === 'periodo' || modo === 'desde_aqui') upd.es_excepcion = true;

    var urlAsis = SUPABASE_URL + '/rest/v1/asistencias?id_regla=eq.' + encodeURIComponent(idRegla) + filtroFecha;

    // 'desde_aqui' además sincroniza la REGLA (`venues`, no solo las filas de
    // `asistencias` ya generadas) para que los eventos futuros que esa regla
    // vaya a generar nazcan con el valor nuevo -- `venues.inicia` para la
    // hora, `venues.lugar` para el lugar (columna con nombre distinto a
    // `asistencias.donde`, ver `_evLugarGuardar()` más arriba en este
    // archivo). Bug real corregido acá (ver MANIFEST.md "Cambios
    // recientes"): antes solo cubría la hora (`campos.inicia`) -- si el
    // admin cambiaba SOLO el lugar en este modo, las filas de `asistencias`
    // ya existentes quedaban bien, pero `venues.lugar` nunca se tocaba, así
    // que la próxima vez que la regla generara eventos nuevos
    // (`_mantenerVentanaAsistenciasInterno()`) seguían naciendo con el lugar
    // viejo. Caveat conocido, no resuelto acá (fuera de alcance de este
    // fix, señalado por honestidad): este PATCH solo manda `lugar`, no
    // `google_maps`/`tipo_icono`/etc. del venue nuevo -- la regla queda con
    // el nombre correcto pero el resto de los metadatos del venue anterior,
    // mismo hueco que ya tenía el PATCH a `asistencias` (que tampoco
    // sincroniza `asistencias.google_maps` al cambiar `donde`).
    var patchVenue = {};
    if (campos.inicia !== undefined) patchVenue.inicia = campos.inicia;
    if (campos.donde !== undefined) patchVenue.lugar = campos.donde;

    if (modo === 'desde_aqui' && Object.keys(patchVenue).length > 0) {
      patch(urlAsis, upd, function() {
        patch(SUPABASE_URL + '/rest/v1/venues?id=eq.' + encodeURIComponent(idRegla), patchVenue, onOk, onErr);
      }, onErr);
    } else {
      patch(urlAsis, upd, onOk, onErr);
    }
  })
  .catch(onErr);
}
