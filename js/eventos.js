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

// 'Partido'/'Evento social'/'Otro' sumados para el formulario de Venues (ver
// MANIFEST.md) -- mismo mapa ya usado por las cards de evento reales
// (Venues!Tipo de ícono), ahora también alimentado por el selector de pills
// del formulario en vez de solo por datos de prueba/backend.
var _EV_ICONOS = { 'Entrenamiento': 'directions_run', 'Torneo': 'emoji_events', 'Partido': 'sports', 'Asamblea': 'groups', 'Evento social': 'groups', 'Otro': 'category', 'Ciclopaseo': 'pedal_bike' };
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
// "1899-12-30T19:00:00.000Z" -- un valor de solo-hora de Sheets, serializado
// por Apps Script como Date completo (ver getEventosRango(), MANIFEST.md).
// `getHours()`/`getMinutes()` LOCALES (no UTC) -- el mismo criterio que ya
// usa el resto de la app para horarios de negocio (ej. `ahora.getHours()`,
// js/admin.js) asumiendo que el dispositivo real de unx usuarix del equipo
// está en su misma zona horaria; confirmado con datos reales de la hoja
// (un evento nocturno real cae en la madrugada UTC del día siguiente, no en
// UTC "tal cual", así que el offset de por medio es real, no solo cero).
function _evHoraDeISO(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return _evPad(d.getHours()) + ':' + _evPad(d.getMinutes());
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
    miEstado: miEstado, miAsistenciaReal: miAsistenciaReal, asistentes: asistentes, rsvps: rsvps
  };
}
// getCumpleañosRango() no manda `fotoPerfil` (no está en el contrato
// documentado en MANIFEST.md) -- cae sola al fallback de inicial de
// _evHidratarAvatares(), igual que un E.datos.fotoPerfil vacío en cualquier
// otro lado de la app. `id` es solo para el `id` del host de confetti
// (_evCardCumpleHtml()) -- por índice alcanza, se regenera en cada carga.
function _evMapCumpleBackend(raw, idx) {
  var conEdad = typeof raw.edad === 'number';
  return { id: 'cumple-' + idx, nombre: raw.nombre, fecha: raw.fecha, edad: conEdad ? raw.edad : null, edadPublica: conEdad, fotoPerfil: '' };
}
// Único punto de carga real de esta pantalla -- 2 pedidos en paralelo,
// `onListo()` corre cuando ambos terminaron (éxito o error). getEventosRango
// es la data crítica: un error ahí avisa con un toast y deja el timeline
// vacío. getCumpleañosRango tiene un bug real CONOCIDO en el backend
// desplegado hoy ("Columna no encontrada: Nombre" -- el encabezado real de
// la hoja Equipo no coincide con el que espera el script, ver MANIFEST.md)
// -- degrada en silencio a "sin cumpleaños" en vez de mostrarle un error a
// cada persona que entra a Eventos por un problema ajeno al frontend.
function _evCargarDatosReales(onListo) {
  var rango = _evRangoCargaCompleto();
  var pendientes = 2;
  function unoListo() { pendientes--; if (pendientes === 0) onListo(); }
  api({ action: 'getEventosRango', desde: rango.desde, hasta: rango.hasta }, function(res) {
    _EV_EVENTOS = (res.eventos || []).map(_evMapEventoBackend);
    unoListo();
  }, function(e) {
    _EV_EVENTOS = [];
    mostrarToast(e && e.message ? e.message : 'No se pudieron cargar los eventos.', 'error');
    unoListo();
  });
  api({ action: 'getCumpleañosRango', desde: rango.desde, hasta: rango.hasta }, function(res) {
    _EV_CUMPLEANOS = (res.cumpleanos || []).map(_evMapCumpleBackend);
    unoListo();
  }, function(e) {
    _EV_CUMPLEANOS = [];
    if (window.console) console.warn('getCumpleañosRango: ' + (e && e.message || 'error'));
    unoListo();
  });
}

// ── Roster admin precargado UNA sola vez por sesión de Eventos (ver
// "Cambios recientes" -- reemplaza el flujo viejo de "+ Agregar persona",
// que pedía adminBuscarPersonasParaEvento(idEvento) DE NUEVO cada vez que
// se abría la sheet para CUALQUIER evento). `null` = todavía no llegó (o
// nunca se pidió, cuenta no-admin) -- distinto de `[]` ("pedido y sin
// gente"), mismo criterio ya usado en el archivo para "cargando" vs. "vacío"
// (ver `_evAgregarCandidatos`, más abajo). Independiente de
// `_evCargarDatosReales()` a propósito -- no bloquea el render del timeline,
// que no depende de este dato; solo hace falta cuando alguien abre el
// detalle de un evento y `_evPintarGestionAdminDetalle()` arma el roster
// (ver esa función más abajo -- NO la card/home, ver "Cambios recientes":
// una tanda previa lo había puesto ahí, corregido). `adminGetRosterEquipo`
// (nueva acción, MANIFEST.md) es más liviana que `adminBuscarPersonasParaEvento`
// -- no recibe `idEvento` ni recalcula `estadoActual` (dato que ningún
// consumidor de este roster precargado necesita: el estado por evento ya
// viaja en `e.asistentes`, cargado con `getEventosRango()`), evitando
// releer "Log de asistencias" para nada.
var _evRosterEquipo = null;
function _evPrecargarRoster() {
  _evRosterEquipo = null;
  if (!_adminToken) return;
  api({ action: 'adminGetRosterEquipo', adminToken: _adminToken }, function(res) {
    _evRosterEquipo = res.personas || [];
    _evRepintarRosterDetalleSiHaceFalta();
  }, function() {
    _evRosterEquipo = []; // degrada a "sin resultados" -- nunca un loader infinito
    _evRepintarRosterDetalleSiHaceFalta();
  });
}
// Si el detalle de un evento ya estaba abierto (con el roster admin
// visible) cuando esta respuesta llegó -- roster más lento que
// getEventosRango, caso raro pero posible -- repinta ese roster puntual
// ahora que el dato ya está, en vez de dejarlo colgado en "Cargando
// equipo...". Mismo criterio de gate que `_evRenderDetalleAsistencia()`
// para decidir si ESE evento muestra gestión admin.
function _evRepintarRosterDetalleSiHaceFalta() {
  if (!_evDetalleActual || !_adminToken || !_evYaEmpezo(_evDetalleActual)) return;
  var inp = document.getElementById('ev-roster-search-' + _evDetalleActual.id);
  _evRenderRosterAdmin(_evDetalleActual.id, inp ? inp.value : '');
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
   Menú "speed dial" de 2 opciones (Crear evento/Editar lugares). La
   visibilidad del FAB en sí (admin + pantalla activa) la resuelve ir()/
   js/ui.js en cada cambio de pantalla, mismo criterio que #home-nav/
   #s4-nav -- acá solo vive el abrir/cerrar del menú una vez que el FAB ya
   está visible. */
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
    volver('s-eventos');
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
    html += '<div class="ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (esHoy ? ' ev-dia-hoy' : '') + (esSeleccionada ? ' ev-dia-seleccionado' : '') +
      '" data-iso="' + celdaIso + '" onclick="_evCalTocarDia(\'' + celdaIso + '\')">' +
      '<div class="ev-cal-num">' + cur.getDate() + '</div>' +
      '<div class="ev-cal-dots">' +
        (tieneEv ? '<span class="ev-dot"></span>' : '') +
        (tieneCumple ? '<span class="ev-dot-cumple"></span>' : '') +
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
// tiempo (_evFechaGrupoMasCercano()). Si `iso` es hoy (ver "Cambios
// recientes" -- bug real), prioriza el separador -HOY- (`#ev-separador-hoy`)
// sobre el `.ev-fecha-grupo`: son 2 elementos vecinos con su propio
// `scroll-margin-top` cada uno, pero apuntar al grupo dejaba el separador
// (arriba de él en el flujo) tapado a medias por la cabecera -- apuntar al
// separador directo lo deja pegado arriba del todo, mismo criterio que
// cualquier otro salto de fecha.
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
  var el = (iso === _evHoyISO() && document.getElementById('ev-separador-hoy')) ||
    document.getElementById('ev-fecha-' + iso) || _evFechaGrupoMasCercano(iso);
  if (!el) return;
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
function _evEstadoNotaPillHtml(estado) {
  return '<div class="ev-estado-pill ev-estado-pill-danger"><span class="material-symbols-outlined">warning</span>' + estado + '</div>';
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
  return '<div class="ev-card" id="ev-card-' + e.id + sufijo + '" onclick="abrirEvDetalle(\'' + e.id + '\')">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo-row"><span class="material-symbols-outlined ev-card-icono-inline">' + icono + '</span><div class="ev-card-titulo">' + e.lugar + '</div></div>' +
        '<div class="ev-card-sub"><span class="material-symbols-outlined">schedule</span>' + e.horaInicio + ' · ' + e.tipo + '</div>' +
        accionBody +
      '</div>' +
    '</div>' +
  '</div>';
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
// `_evCardEventoHtml()`/`_evYaEmpezo()`). Reusa los mismos 3 tokens de color
// que ya usa `_EV_ASISTENCIA_REAL_PILL_CLASE` (success/warning/danger) vía
// las clases `ev-stat-*` ya existentes -- ninguna clase CSS nueva.
var _EV_GRUPOS_ASISTENCIA_REAL = [
  { estado: 'A tiempo', key: 'A tiempo', label: 'A horario', clase: 'ev-stat-asisten' },
  { estado: 'Tarde', key: 'Tarde', label: 'Tarde', clase: 'ev-stat-no-jugador' },
  { estado: 'Ausente', key: 'Ausente', label: 'Ausentes', clase: 'ev-stat-no-asisten' }
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
function _evGrupoAsistenciaHtml(label, personas, grupoKey, clase) {
  if (!personas.length) return '';
  var claseFila = 'ev-asist-persona-' + clase.replace('ev-stat-', '');
  var filas = personas.map(function(p) {
    var fotoAttr = (p.fotoPerfil || '').replace(/"/g, '&quot;');
    return '<div class="ev-asist-persona ' + claseFila + '"><div class="avatar-pill avatar-pill--sm ev-avatar-stack-item" data-nombre="' + p.nombre.replace(/"/g, '&quot;') + '" data-foto="' + fotoAttr + '"></div><span>' + (p.nombreDerby || p.nombre) + (p.sufijoRol || '') + '</span></div>';
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
function _evOcultarRsvpPorEquipoClub(e) {
  return e.tipo === 'Entrenamiento' && !!E.datos &&
    (E.datos.necesitaPatines === 'Sí' || E.datos.necesitaProtecciones === 'Sí');
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
// confirmada de esta app (ej. `eliminarAsistenciaAnticipada()`, más abajo en
// este archivo); el snippet de MANIFEST.md documenta `e.parameter._token`
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
function _evMarcarAsistencia(id, estado) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  // PUNTO DE EXTENSIÓN, todavía no construido: validación de cuota al día
  // para Mirlxs-mensual/Quindes ANTES de escribir el RSVP, pendiente (fuera
  // de alcance de esta tanda -- solo se pidió conectar los llamados reales,
  // no las reglas de negocio de cuota). La otra mitad de este comentario
  // (equipamiento del club → asistencia vía reserva, no manual) YA NO está
  // pendiente -- implementada, pero como gate de RENDER, no acá: con
  // equipamiento del club en un Entrenamiento, `_evRsvpBarraHtml()` ni
  // siquiera dibuja el botón que llamaría a esta función (ver
  // `_evOcultarRsvpPorEquipoClub()`, más arriba en este archivo, y su
  // entrada en MANIFEST.md) -- `_evMarcarAsistencia()` queda inalcanzable
  // desde la UI para ese caso, no hace falta un guard defensivo acá también.
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

/* ── Variante admin: lista de asistentes con chip + agregar persona ────
   Lista colapsada por default (ver "Cambios recientes"), mismo mecanismo
   que `_evAntSetAcordeon()`/`adminToggleBanner()` (js/admin.js): techo fijo
   generoso vía clase `.abierto` en vez de medir `scrollHeight` en cada
   toggle. `_evAsistAdminAbierto` (id de evento o null) es GLOBAL a todo el
   timeline, no por-card -- abrir el acordeón de una card cierra el de
   cualquier otra que hubiera quedado abierta, mismo criterio "solo uno a la
   vez" que `_adminCerrarTodoAbierto()`. El estado se re-aplica en cada
   render (`abierto` calculado contra `_evAsistAdminAbierto` al armar el
   HTML) para sobrevivir a un re-render completo del timeline.

   REVERTIDO a esta forma (ver "Cambios recientes" -- corrección sobre una
   sesión anterior): una tanda previa había reemplazado este contenido por
   el roster completo + buscador + sliders de 2 estados -- Victor aclaró que
   ese rediseño no correspondía acá (la CARD/home), sino específicamente a
   la pantalla de DETALLE de un evento. El roster precargado
   (`_evRosterEquipo`/`_evPrecargarRoster()`, más arriba) y las funciones que
   arman esas filas (`_evRenderRosterAdmin()`/`_evRosterAdminFilasHtml()`/
   `_evMarcarAsistenciaAdmin()`, más abajo) NO se eliminaron -- se reusan tal
   cual desde `_evPintarGestionAdminDetalle()` (pantalla de detalle, ver esa
   entrada más abajo), solo se sacaron de ACÁ. */
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
  // una fila o "Agregar persona" también dispare ese click.
  return '<div class="ev-asistentes-list" onclick="event.stopPropagation()">' +
    '<div class="ev-asist-admin-header' + (abierto ? ' abierto' : '') + '" id="ev-asist-admin-header-' + e.id + '" onclick="_evAsistAdminToggle(\'' + e.id + '\')">' +
      '<span class="ev-asist-admin-header-titulo">Asistencia (' + asistentes.length + ')</span>' +
      '<span class="material-symbols-outlined ev-asist-admin-chevron">expand_more</span>' +
    '</div>' +
    '<div class="ev-asist-admin-body' + (abierto ? ' abierto' : '') + '" id="ev-asist-admin-body-' + e.id + '">' +
      '<div class="ev-asist-admin-body-inner">' +
        (filas || '<div style="font-size:0.76rem;color:var(--muted);">Nadie ha marcado todavía.</div>') +
      '</div>' +
    '</div>' +
    '<button class="ev-btn-agregar-persona" onclick="_evAbrirAgregarPersona(\'' + e.id + '\')"><span class="material-symbols-outlined">person_add</span>Agregar persona</button>' +
  '</div>';
}
// Buscador local (ver "Cambios recientes") -- mismo criterio que otros
// buscadores instantáneos de la app (`_evFiltrarAgregarPersona()`/
// `_adminFiltrarDestino()`): filtra en cliente sobre el array YA cargado en
// memoria, sin ningún request nuevo por tecla.
function _evFiltrarRosterAdmin(idEvento, q) { _evRenderRosterAdmin(idEvento, q); }
// Repinta SOLO la lista de filas (`#ev-roster-lista-<id>`), nunca el
// `<input>` de búsqueda -- evita perder el foco/cursor del usuario mientras
// tipea (mismo criterio que `_evRenderListaAgregar()`, que tampoco toca su
// propio input). `_evRosterEquipo === null` (todavía no llegó la respuesta
// de `_evPrecargarRoster()`) muestra un mensaje corto en vez de nada -- caso
// raro en la práctica (el roster se pide en paralelo con los eventos apenas
// se entra a Eventos, normalmente ya está listo para cuando alguien llega a
// abrir el detalle de un evento), pero sin esto la lista quedaría en blanco
// sin explicación si alguien lo abre en el primer instante.
function _evRenderRosterAdmin(idEvento, q) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === idEvento; })[0];
  var cont = document.getElementById('ev-roster-lista-' + idEvento);
  if (!ev || !cont) return;
  if (_evRosterEquipo === null) { cont.innerHTML = '<div class="ev-roster-vacio">Cargando equipo...</div>'; return; }
  cont.innerHTML = _evRosterAdminFilasHtml(ev, q);
  // Sin animar (`false`) -- primer pintado de estas filas, no una respuesta
  // a un toque (mismo criterio que `_evUpdateRsvpSliders(false)` tras
  // `_evRenderTimeline()`, más abajo en este archivo).
  cont.querySelectorAll('.ev-rsvp-seg').forEach(function(seg) { _evPosicionarRsvpSlider(seg, false); });
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
// Marca A tiempo/Tarde para UNA persona puntual del roster (llamada desde
// el roster de gestión del DETALLE de un evento, `_evPintarGestionAdminDetalle()`
// más abajo -- ver "Cambios recientes") -- mismo endpoint ya usado
// (`adminMarcarAsistencia`, sin acción nueva), mismo criterio optimista +
// revert que `_evMarcarAsistencia()` (RSVP propio, más arriba): resalta la
// opción y reposiciona SOLO el slider de esa fila (`btnEl.closest('.ev-rsvp-seg')`,
// nunca un sweep de `_evUpdateRsvpSliders()` sobre todo el roster) y
// actualiza `ev.asistentes`/el contador del header de la card (si esa card
// sigue en el timeline detrás del detalle -- consistencia gratis, sin
// costo) en memoria antes de que la escritura real resuelva. Repinta SOLO
// las tarjetas de estadística de arriba (`_evActualizarStatsAsistenciaReal()`,
// no `_evRenderDetalleAsistenciaReal()` completa) -- esta última también
// reconstruye el roster+buscador (`_evPintarGestionAdminDetalle()`), lo que
// resetearía el texto tipeado y todas las filas en cada toque, exactamente
// el refetch/rebuild costoso que el pedido de Victor (punto 4) pidió evitar.
// Sin toast en el éxito, a propósito (mismo criterio que `_evMarcarAsistencia()`)
// -- el resaltado ya es feedback suficiente. Ni `_evPrecargarRoster()` ni
// `_evRenderTimeline()` se llaman acá en ningún momento.
function _evMarcarAsistenciaAdmin(idEvento, nombre, estado, btnEl) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === idEvento; })[0];
  if (!ev) return;
  var seg = btnEl.closest('.ev-rsvp-seg');
  var asistentesAnterior = ev.asistentes || [];
  var anteriorDeEstaPersona = asistentesAnterior.filter(function(a) { return _evNombresCoinciden(a.nombre, nombre); })[0] || null;
  var aplicarEnDom = function(estadoAMostrar) {
    seg.querySelectorAll('.ev-rsvp-opt').forEach(function(o) { o.classList.toggle('activa', o.getAttribute('data-estado') === estadoAMostrar); });
    _evPosicionarRsvpSlider(seg, true);
  };
  var datosRoster = (_evRosterEquipo || []).filter(function(p) { return _evNombresCoinciden(p.nombre, nombre); })[0] || {};
  ev.asistentes = asistentesAnterior.filter(function(a) { return !_evNombresCoinciden(a.nombre, nombre); })
    .concat([{ nombre: nombre, estado: estado, origen: 'Admin', nombreDerby: datosRoster.nombreDerby || '', fotoPerfil: datosRoster.fotoPerfil || '' }]);
  aplicarEnDom(estado);
  _evActualizarContadorAsistAdmin(idEvento);
  if (_evDetalleActual && _evDetalleActual.id === idEvento) _evActualizarStatsAsistenciaReal(ev);
  apiPost({ action: 'adminMarcarAsistencia', adminToken: _adminToken, idEvento: idEvento, nombre: nombre, estado: estado }, function() {}, function(e) {
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

/* ── Bottom sheet "+ Agregar persona" -- conectada a
   adminBuscarPersonasParaEvento(idEvento) (confirmada desplegada en esta
   sesión). El roster completo se pide UNA VEZ al abrir la sheet (no en cada
   tecla del buscador) y se filtra en cliente -- `_evAgregarCandidatos: null`
   marca "todavía cargando" (distinto de `[]`, "cargó y no hay nadie"), así
   `_evFiltrarAgregarPersona()` no pisa el mensaje de carga con "Sin
   resultados" mientras el pedido sigue en vuelo. ───────────────────────── */
var _evAgregarEventoId = null;
var _evAgregarCandidatos = null;
function _evAbrirAgregarPersona(idEvento) {
  _evAgregarEventoId = idEvento;
  var s = document.getElementById('ev-agregar-search'); if (s) s.value = '';
  _evAgregarCandidatos = null;
  var lista = document.getElementById('ev-agregar-lista');
  if (lista) lista.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.82rem;text-align:center;">Cargando equipo...</div>';
  var ov = document.getElementById('ev-sheet-agregar-overlay');
  var sh = document.getElementById('ev-sheet-agregar');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(_evCerrarSheetAgregar);
  api({ action: 'adminBuscarPersonasParaEvento', adminToken: _adminToken, idEvento: idEvento }, function(res) {
    if (_evAgregarEventoId !== idEvento) return; // sheet ya cerrada/otro evento mientras tanto
    _evAgregarCandidatos = (res.personas || []).map(function(p) { return p.nombre; });
    _evRenderListaAgregar(s ? s.value : '');
  }, function() {
    if (_evAgregarEventoId !== idEvento) return;
    _evAgregarCandidatos = [];
    var listaErr = document.getElementById('ev-agregar-lista');
    if (listaErr) listaErr.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.82rem;text-align:center;">No se pudo cargar el equipo.</div>';
  });
}
function _evCerrarSheetAgregar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('ev-sheet-agregar');
  var ov = document.getElementById('ev-sheet-agregar-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
function _evFiltrarAgregarPersona(q) { if (_evAgregarCandidatos) _evRenderListaAgregar(q); }
function _evRenderListaAgregar(q) {
  var lista = document.getElementById('ev-agregar-lista');
  if (!lista) return;
  var qn = (q || '').toLowerCase().trim();
  var candidatos = (_evAgregarCandidatos || []).filter(function(n) { return n.toLowerCase().indexOf(qn) !== -1; });
  lista.innerHTML = candidatos.map(function(n) {
    return '<div class="ev-persona-row" onclick="_evAgregarPersonaAEvento(\'' + n.replace(/'/g, "\\'") + '\')"><span class="material-symbols-outlined">person</span>' + n + '</div>';
  }).join('') || '<div style="padding:16px;color:var(--muted);font-size:0.82rem;text-align:center;">Sin resultados.</div>';
}
function _evAgregarPersonaAEvento(nombre) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === _evAgregarEventoId; })[0];
  if (!ev) return;
  if (!ev.asistentes) ev.asistentes = [];
  if (ev.asistentes.some(function(a) { return a.nombre === nombre; })) { mostrarToast(nombre + ' ya está en la lista', 'error'); return; }
  var idEvento = _evAgregarEventoId;
  apiPost({ action: 'adminMarcarAsistencia', adminToken: _adminToken, idEvento: idEvento, nombre: nombre, estado: 'A tiempo' }, function() {
    ev.asistentes.push({ nombre: nombre, estado: 'A tiempo' });
    mostrarToast(nombre + ' agregadx', 'ok', true);
    _evCerrarSheetAgregar();
    _evRenderTimeline(true);
    // Gestión de asistencia también en el detalle (ver "Cambios recientes")
    // -- si este mismo evento está abierto ahí (misma referencia que
    // `_EV_EVENTOS`, ya mutada arriba), refresca sus tarjetas/lista también,
    // no solo el timeline. Nunca toca al resto de personas ya confirmadas:
    // el push de arriba solo agrega la fila nueva, `_evRenderDetalleAsistenciaReal()`
    // solo vuelve a LEER `ev.asistentes` ya actualizado, no reescribe nada.
    if (_evDetalleActual && _evDetalleActual.id === idEvento) _evRenderDetalleAsistencia(_evDetalleActual);
  }, function(e) {
    mostrarToast(e && e.message ? e.message : 'No se pudo agregar a ' + nombre + '.', 'error');
  });
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
  var nota = cancelado ? _evEstadoNotaPillHtml(e.estado) : _evAsistenciaRealHtml(e);
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
// entrada que espera ("DD de MES") y se interpreta su resultado. Solo 2
// buckets a propósito -- MAÑANA y PRÓXIMA SEMANA (pedido explícito, ver
// "Cambios recientes"; la versión vieja pre-unificación también tenía
// "PASADO MAÑANA", no restaurado acá) -- el resto de días de esta semana no
// llevan separador propio.
function _evBucketRelativo(iso) {
  var d = _evParseISO(iso);
  var label = _formatarFechaRelativa(d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()]);
  if (label === 'Mañana') return 'MAÑANA';
  return _evEsProximaSemana(iso) ? 'PRÓXIMA SEMANA' : null;
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
// Filtrado + orden compartido por el render real (`_evRenderTimeline()`) y
// por el chequeo de "¿el mes X tiene contenido?" (`_evCalIrAFechaEnTimeline()`)
// -- un solo lugar con la lógica de filtros/búsqueda, no 2 implementaciones
// paralelas que puedan desincronizarse.
function _evTimelineItems() {
  var items = [];
  _EV_EVENTOS.filter(function(e) { return _evPasaFiltroLugarTipo(e.lugar, e.tipo) && _evPasaBusqueda(e.lugar + ' ' + e.tipo); })
    .forEach(function(e) { items.push({ fecha: e.fecha, orden: e.horaInicio || '00:00', tipo: 'evento', data: e }); });
  // "Cumpleaños de <nombre>" -- ver "Cambios recientes", bug real: buscar
  // "cumpleaños" no encontraba ninguno porque solo se comparaba contra el
  // nombre de la persona, nunca contra la palabra que en realidad aparece en
  // el título de la card. Mismo texto que `_evCardCumpleHtml()` termina
  // mostrando, para que "encuentra lo que se ve" sea literal.
  _EV_CUMPLEANOS.filter(function(c) { return _evPasaFiltroLugarTipoCumple() && _evPasaBusqueda('Cumpleaños de ' + c.nombre); })
    .forEach(function(c) { items.push({ fecha: c.fecha, orden: '00:00', tipo: 'cumple', data: c }); });
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
  var insertadoHoy = false, bucketsMostrados = {};
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
        porFecha[fecha].map(function(it) { return it.tipo === 'cumple' ? _evCardCumpleHtml(it.data) : _evTimelineFilaHtml(it.data); }).join('') +
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
        if (it.tipo !== 'cumple') return;
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
  if (rsvpCont) rsvpCont.innerHTML = _evOcultarRsvpPorEquipoClub(ev) ? '' : (_evRsvpBarraHtml(ev) || _evDetalleEstadoNotaHtml(ev));
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
// Nav compacta sticky (ver "Cambios recientes" -- reemplaza el #top-bar
// genérico para esta pantalla, ver TOP_BAR_CONFIG/js/ui.js): flecha atrás
// (mismo `.app-nav-back` reusado, con su propio onclick acá ya que no hay
// #top-bar detrás que se lo dé) + ícono de tipo SUELTO (sin el cuadrado de
// fondo de `.ev-detalle-icon-grande` -- pedido explícito: no competir
// visualmente con el botón circular de la flecha) + tipo/fecha-hora. Sin
// pills (ver "Cambios recientes" -- rediseño, las 4 se unificaron en
// _evDetalleInfoHtml(), afuera del sticky) -- este nivel 1 queda liviano a
// propósito, mide menos alto que antes.
function _evDetalleStickyHtml(ev) {
  return '<div class="ev-detalle-nav-row">' +
      '<button class="app-nav-back" onclick="volver(\'s-eventos\')" title="Volver"><span class="material-symbols-outlined">arrow_back</span></button>' +
      '<span class="material-symbols-outlined ev-detalle-nav-icono">' + (_EV_ICONOS[ev.tipo] || 'event') + '</span>' +
      '<div class="ev-detalle-nav-texto">' +
        '<div class="ev-detalle-tipo">' + ev.tipo + '</div>' +
        '<div class="ev-detalle-fechahora">' + _evFechaCompleta(ev.fecha) + '</div>' +
      '</div>' +
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
  var desc = _EV_DESCRIPCION_POR_TIPO[ev.tipo];
  var mapsUrl = _EV_MAPS_URL_POR_LUGAR[ev.lugar];
  return '<div class="fi-pills">' +
      (mapsUrl
        ? '<a class="fi-pill fi-pill-lugar" href="' + mapsUrl + '" target="_blank" rel="noopener"><span class="material-symbols-outlined">location_on</span>' + ev.lugar + '</a>'
        : '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + ev.lugar + '</span>') +
      '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + ev.horaInicio + 'hs</span>' +
      '<span class="fi-pill fi-pill-fin"><span class="material-symbols-outlined">schedule</span>Fin ' + _evHoraFin(ev) + 'hs</span>' +
    '</div>' +
    (desc ? '<p class="ev-detalle-desc">' + desc + '</p>' : '');
}
/* ── Resumen de asistencia como 4 tarjetas de estadística (grid, ver
   "Cambios recientes" — reemplaza la línea de texto "Asisten X · No
   asisten X..." de la tanda anterior) + la lista completa agrupada debajo.
   Separado de _evRenderDetalle() para poder refrescarse solo (sin tocar
   info/RSVP) más adelante. `_evDetalleFiltroGrupo` se resetea a null en
   cada render -- abrir un evento nuevo (o re-abrir el mismo) arranca sin
   ningún filtro activo. */
var _evDetalleFiltroGrupo = null;
function _evPintarStatsAsistencia(grupos) {
  var stats = document.getElementById('ev-detalle-stats');
  if (stats) {
    stats.innerHTML = grupos.map(function(g) {
      return '<div class="ev-stat-card ' + g.clase + '" data-grupo="' + g.key + '" onclick="_evFiltrarAsistenciaPorGrupo(this,\'' + g.key + '\')">' +
        '<div class="ev-stat-num">' + g.personas.length + '</div>' +
        '<div class="ev-stat-label">' + g.label + '</div>' +
      '</div>';
    }).join('');
  }
  var lista = document.getElementById('ev-detalle-asistencia-lista');
  if (lista) {
    lista.innerHTML = grupos.map(function(g) { return _evGrupoAsistenciaHtml(g.label, g.personas, g.key, g.clase); }).join('');
    _evHidratarAvatares();
  }
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
  var gestion = document.getElementById('ev-detalle-gestion-admin');
  if (gestion) gestion.innerHTML = '';
  // Regla de tiempo, no solo de rol/fecha calendario -- mismo criterio ya
  // usado por _evCardEventoHtml()/_evYaEmpezo() para la card: desde que el
  // evento arranca, admin ve la asistencia REAL (rollcall E/F) + gestión acá
  // también (ver _evRenderDetalleAsistenciaReal(), más abajo), no el RSVP de
  // intención pre-evento. Antes de arrancar (cualquier cuenta) o para
  // cuentas no-admin en cualquier momento, sigue el resumen de RSVP de
  // siempre, sin cambios.
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
// Asistencia REAL (rollcall E/F, `ev.asistentes`) agrupada en 3 tarjetas de
// estadística (A horario/Tarde/Ausentes) + la lista completa debajo,
// reusando el MISMO `_evPintarStatsAsistencia()` que ya usa el camino RSVP
// de arriba -- 0 duplicación de la UI de stats/lista, solo cambia qué array
// alimenta los grupos y qué combinación de estado se muestra por persona
// (puntualidad + rol, ver _evLabelPuntualidadRol()/`p.sufijoRol`). Bug real
// corregido acá (el "0 asistentes" reportado en el detalle de eventos
// pasados): antes `_evRenderDetalleAsistencia()` SIEMPRE leía `ev.rsvps`
// (intención pre-evento) sin importar si el evento ya había arrancado -- un
// evento ya jugado con RSVPs vacíos (o gente que nunca respondió pero sí
// vino, admin mediante) mostraba 0 en las 4 tarjetas pese a tener
// asistencia real registrada en `ev.asistentes`.
// Separada de `_evRenderDetalleAsistenciaReal()` (ver esa función, abajo)
// -- ver "Cambios recientes": `_evMarcarAsistenciaAdmin()` necesita poder
// refrescar SOLO las tarjetas/lista de arriba tras marcar a alguien desde
// el roster de gestión, sin volver a reconstruir ese roster entero (que
// perdería el texto ya tipeado en el buscador local en cada toque).
function _evActualizarStatsAsistenciaReal(ev) {
  var asistentes = ev.asistentes || [];
  var grupos = _EV_GRUPOS_ASISTENCIA_REAL.map(function(g) {
    return {
      key: g.key, label: g.label, clase: g.clase,
      personas: asistentes.filter(function(a) { return a.estado === g.estado; }).map(function(a) {
        var rol = _evRolDePersona(ev, a.nombre);
        return { nombre: a.nombre, nombreDerby: a.nombreDerby || '', fotoPerfil: a.fotoPerfil || '', sufijoRol: (rol === 'No jugador') ? ' · No jugador' : '' };
      })
    };
  });
  _evPintarStatsAsistencia(grupos);
}
function _evRenderDetalleAsistenciaReal(ev) {
  _evActualizarStatsAsistenciaReal(ev);
  _evPintarGestionAdminDetalle(ev);
}
// Gestión de asistencia del detalle (ver "Cambios recientes" -- reemplaza
// el botón "Agregar o corregir asistencia" + su bottom sheet remoto por el
// MISMO roster completo + buscador local + slider de 2 estados que ya
// arman `_evRenderRosterAdmin()`/`_evRosterAdminFilasHtml()` (más arriba en
// este archivo, originalmente escritas para la card -- una sesión anterior
// las había puesto ahí, Victor aclaró que el lugar correcto era el
// DETALLE; las funciones en sí no cambiaron, solo quién las llama).
// `_evAbrirAgregarPersona()`/`_evAgregarPersonaAEvento()` (bottom sheet)
// NO se tocaron -- siguen intactas, sin ningún cambio de comportamiento;
// simplemente ya no las llama el DETALLE (esta función). La card SÍ las
// sigue usando (`_evAccionAdminHtml()`, botón "Agregar persona", más
// arriba en este archivo) -- ese flujo nunca se movió ni se duplicó, solo
// coexiste con este roster nuevo del detalle. Reusa LITERAL el mismo
// esquema de ids `ev-roster-search-<id>`/`ev-roster-lista-<id>` que la
// card usó brevemente en la sesión anterior (revertido ahí) -- sin
// colisión posible, la card ya no arma ninguno de los 2.
function _evPintarGestionAdminDetalle(ev) {
  var cont = document.getElementById('ev-detalle-gestion-admin');
  if (!cont) return;
  cont.innerHTML = '<div class="ev-asist-grupo-titulo">Marcar asistencia</div>' +
    '<input type="text" class="ev-roster-search" id="ev-roster-search-' + ev.id + '" placeholder="Buscar por nombre..." oninput="_evFiltrarRosterAdmin(\'' + ev.id + '\', this.value)">' +
    '<div class="ev-roster-lista" id="ev-roster-lista-' + ev.id + '"></div>';
  _evRenderRosterAdmin(ev.id, '');
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
   ASISTENCIA ANTICIPADA (ev-ant-*, #s-eventos-anticipada) -- a diferencia
   del resto de este archivo (todavía sobre datos de prueba, ver cabecera),
   esta sección SÍ llama al backend real (api()/apiPost(), js/api.js) contra
   3 funciones de Apps Script -- 2 ya existentes (getReglasAsistenciaAnticipada/
   aplicarAsistenciaAnticipada) + 1 nueva agregada a pedido en esta misma
   sesión (eliminarAsistenciaAnticipada, ver MANIFEST.md). El backend no
   vive en este repo (Apps Script, script.google.com) así que el contrato de
   parámetros/campos de abajo es una convención razonable -- a confirmar/
   ajustar contra el código real si no coincide 1:1. **`token: _token`
   agregado a las 3 llamadas (ver MANIFEST.md "Cambios recientes" -- Victor
   pidió sacar el `nombre: E.nombre` de prueba como credencial)**, mismo
   patrón ya real que `subirFotoPerfil` (js/foto.js: `token:
   (typeof _token !== 'undefined' ? _token : '')`) -- la única otra llamada
   POST autenticada de toda la app. `nombre: E.nombre` se deja además, sin
   quitarlo todavía: Code.gs (fuera de este repo) hoy resuelve la persona por
   ese `nombre` tal como se lo mandan estas 3 funciones ya desplegadas -- si
   se sacara acá sin tocar el backend a la vez, las 3 llamadas dejarían de
   funcionar en producción hasta el próximo deploy de Apps Script. Pendiente
   documentado en MANIFEST.md ("Cambios recientes"): Code.gs debe pasar a
   derivar la persona de `e.parameter.token` (mismo helper que ya usa
   `restaurarSesion()`) en vez de confiar en el `nombre` que manda el
   cliente -- recién ahí `nombre` deja de ser necesario acá.
   ═══════════════════════════════════════════════════════ */

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
function eventosAbrirAnticipada() {
  ir('s-eventos-anticipada');
  document.getElementById('ev-ant-wizard').style.display = 'none';
  _evAntOcultarFooter();
  document.getElementById('ev-ant-btn-nueva').style.display = 'none';
  document.getElementById('ev-ant-lista').innerHTML = _evAntSkeletonHtml();
  document.getElementById('ev-ant-resumen').style.display = 'block';
  var miCarga = ++_evAntCargaId;
  api({ action: 'getReglasAsistenciaAnticipada', nombre: E.nombre }, function(res) {
    if (!_evAntCargaVigente(miCarga)) return; // el usuario ya salió (con o sin volver a entrar) -- esta respuesta quedó vieja
    _evAntReglas = res || [];
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
  api({ action: 'getReglasAsistenciaAnticipada', nombre: E.nombre }, function(res) {
    if (!_evAntCargaVigente(miCarga)) return;
    _evAntReglas = res || [];
    _evAntRenderLista();
    document.getElementById('ev-ant-btn-nueva').style.display = 'block';
    if (typeof cb === 'function') cb();
  }, function(e) {
    if (!_evAntCargaVigente(miCarga)) return;
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
      '<button type="button" class="ev-ant-card-edit" onclick="_evAntEditar(' + r.fila + ')" title="Editar">' +
        '<span class="material-symbols-outlined">edit</span>' +
      '</button>' +
      '<button type="button" class="ev-ant-card-del" onclick="_evAntEliminar(' + r.fila + ')" title="Eliminar">' +
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

function _evAntEliminar(fila) {
  if (!confirm('¿Eliminar esta asistencia anticipada?')) return;
  mostrarCargando('Eliminando...');
  apiPost({ action: 'eliminarAsistenciaAnticipada', token: _token, nombre: E.nombre, fila: fila }, function(res) {
    ocultarCargando();
    if (res && res.exito === false) { mostrarToast(res.error || 'No se pudo eliminar.', 'error'); return; }
    _evAntRecargarLista();
  }, function(e) {
    ocultarCargando();
    mostrarToast(e && e.message ? e.message : 'No se pudo eliminar la asistencia anticipada.', 'error');
  });
}

// Ícono "editar" de cada card del resumen (ver "Cambios recientes", junto al
// de eliminar) -- abre el mismo wizard de "Nueva asistencia anticipada"
// pre-cargado con los datos de esa regla, ver _evAntIniciarWizard(regla).
function _evAntEditar(fila) {
  var regla = _evAntReglas.filter(function(r) { return r.fila === fila; })[0];
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
// `_evAntData.editando` guarda el número de fila vieja para el flujo
// eliminar+crear de _evAntAplicar().
function _evAntIniciarWizard(regla) {
  _evAntData = {
    tipoRango: regla ? regla.tipoRango : null,
    meses: (regla && regla.meses) ? regla.meses.slice() : [],
    fechaDesde: regla ? (regla.fechaDesde || null) : null,
    fechaHasta: regla ? (regla.fechaHasta || null) : null,
    estado: regla ? regla.estado : null,
    editando: regla ? regla.fila : null
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
  cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>';
}

// Botón final -- Estado y Frecuencia ya están validados en tiempo real (ver
// _evAntCompleto(), el botón queda disabled hasta que ambos estén completos)
// así que acá solo queda un guard defensivo, arma el payload y envía.
// Edición (ver "Cambios recientes", _evAntData.editando -- número de fila de
// la regla vieja, seteado por _evAntIniciarWizard(regla)/_evAntEditar()): no
// existe una función de backend para actualizar en el lugar, así que el
// frontend hace eliminarAsistenciaAnticipada(fila vieja) seguido de
// aplicarAsistenciaAnticipada(datos nuevos) EN SECUENCIA, con un solo
// mostrarCargando()/ocultarCargando() para las 2 llamadas -- el usuario no
// debe percibir que son 2 requests. Si el usuario no cambió nada, el flujo
// es idéntico (elimina y vuelve a crear con los mismos datos), sin caso
// especial.
function _evAntAplicar() {
  if (!_evAntCompleto()) return;
  if (_evAntData.tipoRango === 'indefinido') _evAntData.fechaDesde = _evAntData.fechaDesde || _evAntHoyISO();

  var payload = {
    action: 'aplicarAsistenciaAnticipada',
    token: _token,
    nombre: E.nombre,
    tipoRango: _evAntData.tipoRango,
    // Hardcodeado: la asistencia anticipada aplica únicamente a
    // Entrenamientos (ver "Cambios recientes" -- Torneos/Asambleas no son
    // recurrentes, ya no hay selector de tipos de evento en el wizard).
    tiposEvento: JSON.stringify(['Entrenamiento']),
    estado: _evAntData.estado
  };
  if (_evAntData.tipoRango === 'meses') payload.meses = JSON.stringify(_evAntData.meses);
  else if (_evAntData.tipoRango === 'periodo') { payload.fechaDesde = _evAntData.fechaDesde; payload.fechaHasta = _evAntData.fechaHasta; }
  else payload.fechaDesde = _evAntData.fechaDesde;

  var editando = _evAntData.editando;

  function crear() {
    apiPost(payload, function(res) {
      if (res && res.exito === false && res.reglaExistente) {
        ocultarCargando();
        _evAntMostrarConflicto(res.reglaExistente);
        return;
      }
      _evAntRecargarLista(function() {
        ocultarCargando();
        _evAntCerrarWizardAResumen();
      });
    }, function(e) {
      ocultarCargando();
      mostrarToast(e && e.message ? e.message : 'No se pudo aplicar la asistencia anticipada.', 'error');
    });
  }

  mostrarCargando(editando ? 'Guardando cambios...' : 'Aplicando...');
  if (editando) {
    apiPost({ action: 'eliminarAsistenciaAnticipada', token: _token, nombre: E.nombre, fila: editando }, function(res) {
      if (res && res.exito === false) {
        ocultarCargando();
        mostrarToast(res.error || 'No se pudo guardar los cambios.', 'error');
        return;
      }
      crear();
    }, function(e) {
      ocultarCargando();
      mostrarToast(e && e.message ? e.message : 'No se pudo guardar los cambios.', 'error');
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

function irEvLugares() {
  ir('s-eventos-lugares');
  document.getElementById('ev-lugares-lista').innerHTML = _evLugaresSkeletonHtml();
  var miCarga = ++_evLugaresCargaId;
  api({ action: 'getVenues', adminToken: _adminToken }, function(res) {
    if (miCarga !== _evLugaresCargaId) return;
    _evLugares = res || [];
    _evLugaresRenderLista();
  }, function(e) {
    if (miCarga !== _evLugaresCargaId) return;
    mostrarToast(e && e.message ? e.message : 'No se pudieron cargar los lugares.', 'error');
    var cont = document.getElementById('ev-lugares-lista');
    if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No se pudieron cargar los lugares.</p>';
  });
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
// css/eventos.css) -- sin botones de editar/eliminar propios, la card
// entera es tocable (abre el formulario precargado, ver "Tocar una card
// abre el formulario pre-cargado" del pedido). Sin acción de eliminar --
// no pedida para esta tanda.
function _evLugaresRenderLista() {
  var cont = document.getElementById('ev-lugares-lista'); if (!cont) return;
  if (!_evLugares.length) {
    cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">Todavía no hay lugares creados.</p>';
    return;
  }
  cont.innerHTML = _evLugares.map(function(v) {
    var icono = _EV_ICONOS[v.tipoIcono] || 'place';
    return '<div class="ev-ant-card" onclick="_evLugarAbrirEditar(' + v.fila + ')">' +
      '<div class="ev-card-top-row">' +
        '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
        '<div class="ev-card-body">' +
          '<div class="ev-card-titulo">' + v.nombre + '</div>' +
          '<div class="ev-ant-card-sub">' + _evLugarResumenSub(v) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
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

/* ─── Formulario compartido ("Crear evento"/"Editar lugares") ─────────── */

var _evLugarData = {};
var _evLugarOrigen = 's-eventos-lugares';
// mismo criterio que _evAntCal (arriba): .mostrado guarda un ISO string, no
// un Date -- _evCalMesDe()/_evToISO() (helpers genéricos de este archivo,
// ver el timeline principal) trabajan así, no con objetos Date.
var _evLugarCal = { referencia: { mostrado: null }, unico: { mostrado: null } };
var _evLugarMapa = null;
var _evLugarAutocomp = null;

function _evLugarFormVolver() { return _evLugarOrigen; }

function irEvLugarFormNuevo(origen) {
  _evLugarData = {
    fila: null, nombre: '', mapsUrl: null, lat: null, lng: null,
    tipoIcono: null, requiereReserva: 'si', tipoRecurrencia: null,
    diasSemana: [], frecuenciaNumero: null, frecuenciaUnidad: null,
    fecha: null, hora: ''
  };
  _evLugarOrigen = origen || 's-eventos-lugares';
  ir('s-eventos-lugar-form');
  _evLugarFormPintar();
  _evLugarInicializarMapa();
}

// Card de la lista tocada -- precarga _evLugarData completo desde la fila ya
// cargada en memoria (_evLugares, sin pedirla de nuevo al backend, mismo
// criterio que _evAntEditar()).
function _evLugarAbrirEditar(fila) {
  var v = _evLugares.filter(function(x) { return x.fila === fila; })[0];
  if (!v) return;
  _evLugarData = {
    fila: v.fila, nombre: v.nombre || '', mapsUrl: v.mapsUrl || null,
    lat: (typeof v.lat === 'number') ? v.lat : null, lng: (typeof v.lng === 'number') ? v.lng : null,
    tipoIcono: v.tipoIcono || null, requiereReserva: v.requiereReserva === false ? 'no' : 'si',
    tipoRecurrencia: v.tipoRecurrencia || null,
    diasSemana: (v.diasSemana || []).slice(),
    frecuenciaNumero: v.frecuenciaNumero || null, frecuenciaUnidad: v.frecuenciaUnidad || null,
    fecha: v.fechaReferencia || null, hora: v.hora || ''
  };
  _evLugarOrigen = 's-eventos-lugares';
  ir('s-eventos-lugar-form');
  _evLugarFormPintar();
  _evLugarInicializarMapa();
}

// Pinta TODO el formulario desde _evLugarData -- un solo punto, llamado
// tanto al arrancar en blanco como al precargar una edición (mismo criterio
// que _evAntIniciarWizard()).
function _evLugarFormPintar() {
  var titulo = document.getElementById('ev-lugar-form-titulo');
  if (titulo) titulo.textContent = _evLugarData.fila ? 'Editar lugar' : 'Nuevo lugar';

  var nombreInp = document.getElementById('ev-lugar-nombre');
  if (nombreInp) nombreInp.value = _evLugarData.nombre || '';

  document.querySelectorAll('#ev-lugar-icono-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.val === _evLugarData.tipoIcono); });
  document.querySelectorAll('#ev-lugar-reserva-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.val === _evLugarData.requiereReserva); });
  document.querySelectorAll('#ev-lugar-recurrencia-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.val === _evLugarData.tipoRecurrencia); });
  document.querySelectorAll('#ev-lugar-dias-row .ev-dia-circulo').forEach(function(c) { c.classList.toggle('activa', _evLugarData.diasSemana.indexOf(parseInt(c.dataset.dia, 10)) !== -1); });
  var frecNumInp = document.getElementById('ev-lugar-frec-num');
  if (frecNumInp) frecNumInp.value = _evLugarData.frecuenciaNumero || '';
  document.querySelectorAll('#ev-lugar-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.toggle('activa', p.dataset.val === _evLugarData.frecuenciaUnidad); });
  var horaInp = document.getElementById('ev-lugar-hora');
  if (horaInp) horaInp.value = _evLugarData.hora || '';

  var mesInicial = _evLugarData.fecha || _evHoyISO();
  _evLugarCal.referencia.mostrado = mesInicial;
  _evLugarCal.unico.mostrado = mesInicial;

  _evLugarMostrarSubRecurrencia();
  _evLugarCalRender('referencia');
  _evLugarCalRender('unico');
  _evLugarActualizarCalResumen('referencia');
  _evLugarActualizarCalResumen('unico');
  _evLugarActualizarBotonGuardar();
}

function _evLugarSetNombre(v) { _evLugarData.nombre = v; _evLugarActualizarBotonGuardar(); }

function _evLugarSelIcono(el) {
  document.querySelectorAll('#ev-lugar-icono-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.tipoIcono = el.dataset.val;
  _evLugarActualizarBotonGuardar();
}
function _evLugarSelReserva(el) {
  document.querySelectorAll('#ev-lugar-reserva-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.requiereReserva = el.dataset.val;
  _evLugarActualizarBotonGuardar();
}
function _evLugarSelRecurrencia(el) {
  document.querySelectorAll('#ev-lugar-recurrencia-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.tipoRecurrencia = el.dataset.val;
  _evLugarMostrarSubRecurrencia();
  _evLugarActualizarBotonGuardar();
}
// Reveal inline según la elección -- mismo patrón ya usado por
// _evAntMostrarSubFrecuencia() (ver arriba): oculta los 3 sub-bloques,
// muestra solo el que corresponde con un fade. "Hora" es compartida por los
// 3 (pedido explícito: aparece en los 3 casos), un solo campo en vez de 3
// inputs duplicados.
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
    if (horaPrimeraVez) { void horaWrap.offsetWidth; horaWrap.style.animation = 'fadeIn 0.2s ease'; }
  }
}

function _evLugarToggleDia(el) {
  var dia = parseInt(el.dataset.dia, 10);
  el.classList.toggle('activa');
  var idx = _evLugarData.diasSemana.indexOf(dia);
  if (el.classList.contains('activa')) { if (idx === -1) _evLugarData.diasSemana.push(dia); }
  else if (idx !== -1) { _evLugarData.diasSemana.splice(idx, 1); }
  _evLugarActualizarBotonGuardar();
}
function _evLugarSetFrecNum(v) { _evLugarData.frecuenciaNumero = v ? parseInt(v, 10) : null; _evLugarActualizarBotonGuardar(); }
function _evLugarSelUnidad(el) {
  document.querySelectorAll('#ev-lugar-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evLugarData.frecuenciaUnidad = el.dataset.val;
  _evLugarActualizarBotonGuardar();
}
function _evLugarSetHora(v) { _evLugarData.hora = v; _evLugarActualizarBotonGuardar(); }

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
  cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>';
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
  _evLugarActualizarBotonGuardar();
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
  _evLugarActualizarBotonGuardar();
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
      _evLugarData.nombre = place.name;
      var nombreInp = document.getElementById('ev-lugar-nombre');
      if (nombreInp) nombreInp.value = place.name;
      _evLugarActualizarBotonGuardar();
    }
  });
}

/* ── Validación + guardado (crearVenue/editarVenue) ─────────────────── */
function _evLugarRecurrenciaValida() {
  var t = _evLugarData.tipoRecurrencia;
  if (t === 'dias_semana') return _evLugarData.diasSemana.length > 0 && !!_evLugarData.hora;
  if (t === 'cada_tantos') return !!(_evLugarData.frecuenciaNumero > 0 && _evLugarData.frecuenciaUnidad && _evLugarData.fecha && _evLugarData.hora);
  if (t === 'unico') return !!(_evLugarData.fecha && _evLugarData.hora);
  return false;
}
function _evLugarValido() {
  return !!(_evLugarData.nombre && _evLugarData.nombre.trim() && _evLugarData.mapsUrl &&
    _evLugarData.tipoIcono && _evLugarData.requiereReserva && _evLugarData.tipoRecurrencia &&
    _evLugarRecurrenciaValida());
}
function _evLugarActualizarBotonGuardar() {
  var btn = document.getElementById('ev-lugar-btn-guardar');
  if (btn) btn.disabled = !_evLugarValido();
}

// Guardado real -- crearVenue (sin _evLugarData.fila) o editarVenue (con
// fila) según corresponda, mismas 2 firmas documentadas en MANIFEST.md para
// que Victor las aplique en Code.gs. Ambas ejecutan la reconciliación
// (ver "Backend — Venues" en MANIFEST) en la misma llamada -- no hace falta
// ningún refresco adicional del lado del frontend para que los próximos
// eventos ya existan, la Tanda de "Eventos al backend real" (pendiente, ver
// "Cambios recientes" de Asistencia Anticipada) es la que eventualmente los
// mostrará en el timeline.
function _evLugarGuardar() {
  if (!_evLugarValido()) return;
  var payload = {
    action: _evLugarData.fila ? 'editarVenue' : 'crearVenue',
    adminToken: _adminToken,
    nombre: _evLugarData.nombre.trim(),
    mapsUrl: _evLugarData.mapsUrl,
    lat: _evLugarData.lat,
    lng: _evLugarData.lng,
    tipoIcono: _evLugarData.tipoIcono,
    requiereReserva: _evLugarData.requiereReserva === 'si' ? 'SI' : 'NO',
    tipoRecurrencia: _evLugarData.tipoRecurrencia,
    hora: _evLugarData.hora
  };
  if (_evLugarData.fila) payload.idRegla = _evLugarData.fila;
  if (_evLugarData.tipoRecurrencia === 'dias_semana') {
    payload.diasSemana = JSON.stringify(_evLugarData.diasSemana.slice().sort(function(a, b) { return a - b; }));
  } else if (_evLugarData.tipoRecurrencia === 'cada_tantos') {
    payload.frecuencia = _evLugarData.frecuenciaNumero;
    payload.unidad = _evLugarData.frecuenciaUnidad;
    payload.fechaReferencia = _evLugarData.fecha;
  } else {
    payload.fechaReferencia = _evLugarData.fecha;
  }

  mostrarCargando(_evLugarData.fila ? 'Guardando cambios...' : 'Creando lugar...');
  apiPost(payload, function(res) {
    ocultarCargando();
    if (res && res.exito === false) {
      mostrarToast(res.error || 'No se pudo guardar el lugar.', 'error');
      return;
    }
    mostrarToast(_evLugarData.fila ? 'Lugar actualizado.' : 'Lugar creado.', 'ok');
    var volver = _evLugarFormVolver();
    if (volver === 's-eventos-lugares') irEvLugares(); else ir(volver);
  }, function(e) {
    ocultarCargando();
    mostrarToast(e && e.message ? e.message : 'No se pudo guardar el lugar.', 'error');
  });
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
   "Crear evento" (#s-eventos-crear, FAB) -- wizard propio de 2 pasos
   (Lugar / Recurrencia y horario), YA NO comparte pantalla con "Editar
   lugares" (ver bloque de arriba). Motor de pasos+progreso: array de ids +
   índice actual + dots (_EV_CREAR_STEPS/_evCrearCurIdx), reusando
   .salud-paso/.salud-prog/.salud-prog-dot (css/perfil.css) tal cual --
   mismo mecanismo que el wizard de "Ficha de salud" (js/perfil.js,
   _SALUD_STEPS/_saludCurIdx). Nota: NO es el motor que usa hoy "Asistencia
   anticipada" -- esa pantalla tuvo ese mismo motor en su momento pero
   migró a un acordeón de una sola pantalla (ver el comentario en
   css/eventos.css sobre ".salud-prog, que ya no se usan en esta
   pantalla"), Salud quedó como el único precedente vivo.

   Paso 1: elegir un lugar existente (_evCrearData.venueExistente) O crear
   uno nuevo inline (_evCrearData.nuevoLugarActivo + .nuevoLugar, mismos
   campos/clases que el formulario de "Editar lugares": buscador Places +
   mapa vía crearOCentrarMapaPin() + nombre + tipo de ícono, sin pill de
   "¿Requiere reserva?" -- no pedida para este wizard, crearVenue() la
   recibe en 'SI' por default). Paso 2: recurrencia + hora (stepper).

   Guardado: SIEMPRE crearVenue, incluso con un venue existente elegido --
   el backend documentado (ver MANIFEST.md "Backend — Venues") no tiene una
   operación de "agregar otra regla de recurrencia a un venue ya
   existente", el id de cada regla es la fila de Venues 1 a 1. Elegir un
   venue existente en el paso 1 arma el payload con su nombre/ubicación/
   ícono/reserva COPIADOS + la recurrencia nueva del paso 2, lo que crea una
   fila NUEVA (incluida en el llamado normal a crearVenue) con la misma
   identidad de lugar pero un horario distinto -- consistente con el modelo
   real de datos ya documentado ("1 fila = 1 regla"), no un caso especial.
   Si más adelante Victor quiere que un mismo lugar comparta una sola fila
   "maestra" entre varias reglas, hace falta repensar `Venues` (separarla en
   una hoja de lugares + una hoja de reglas, o una función de backend nueva
   tipo `agregarReglaAVenue(nombreLugar, datosRecurrencia)`) -- fuera de
   alcance de esta tanda, dejado señalado acá en vez de resuelto en silencio.
   ═══════════════════════════════════════════════════════ */

var _EV_CREAR_STEPS = ['ev-crear-paso-0', 'ev-crear-paso-1'];
var _evCrearCurIdx = 0;
var _evCrearData = {};
var _evCrearMapa = null;
var _evCrearAutocomp = null;
var _evCrearCal = { referencia: { mostrado: null }, unico: { mostrado: null } };

function irEvCrear() {
  _evCrearData = {
    venueExistente: null, nuevoLugarActivo: false,
    nuevoLugar: { nombre: '', mapsUrl: null, lat: null, lng: null, tipoIcono: null },
    tipoRecurrencia: null, diasSemana: [], frecuenciaNumero: null, frecuenciaUnidad: null,
    fecha: null, hora: '09:00'
  };
  var mesInicial = _evHoyISO();
  _evCrearCal.referencia.mostrado = mesInicial;
  _evCrearCal.unico.mostrado = mesInicial;
  ir('s-eventos-crear');
  _evCrearResetUI();
  _evCrearMostrarPaso(0);
  _evCrearCargarLugares();
  _evCrearCalRender('referencia');
  _evCrearCalRender('unico');
  _evCrearActualizarCalResumen('referencia');
  _evCrearActualizarCalResumen('unico');
}

function _evCrearResetUI() {
  document.querySelectorAll('#ev-crear-recurrencia-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  document.querySelectorAll('#ev-crear-dias-row .ev-dia-circulo').forEach(function(c) { c.classList.remove('activa'); });
  document.querySelectorAll('#ev-crear-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  document.querySelectorAll('#ev-crear-lugar-icono-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  var frecNum = document.getElementById('ev-crear-frec-num'); if (frecNum) frecNum.value = '';
  var nombreInp = document.getElementById('ev-crear-lugar-nombre'); if (nombreInp) nombreInp.value = '';
  var buscadorLugar = document.getElementById('ev-crear-buscador-lugar'); if (buscadorLugar) buscadorLugar.value = '';
  var nuevoLugarWrap = document.getElementById('ev-crear-nuevo-lugar'); if (nuevoLugarWrap) nuevoLugarWrap.style.display = 'none';
  ['ev-crear-rec-dias', 'ev-crear-rec-cada', 'ev-crear-rec-unico', 'ev-crear-hora-wrap'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
}

/* ── Navegación entre los 2 pasos ─────────────────────────────────────── */
function _evCrearMostrarPaso(idx) {
  _EV_CREAR_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _evCrearCurIdx = idx;
  _evCrearRenderProg();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  _evCrearActualizarFooter();
}
function _evCrearRenderProg() {
  var cont = document.getElementById('ev-crear-prog'); if (!cont) return;
  cont.innerHTML = '';
  for (var i = 0; i < _EV_CREAR_STEPS.length; i++) {
    var d = document.createElement('div');
    d.className = 'salud-prog-dot' + (i < _evCrearCurIdx ? ' done' : (i === _evCrearCurIdx ? ' active' : ''));
    cont.appendChild(d);
  }
}
function _evCrearBack() {
  if (_evCrearCurIdx === 0) { ir('s-eventos'); return; }
  _evCrearMostrarPaso(0);
}
function _evCrearIrPaso1() {
  if (!_evCrearLugarValido()) return;
  _evCrearMostrarPaso(1);
}
function _evCrearActualizarFooter() {
  var btn = document.getElementById('ev-crear-btn-footer'); if (!btn) return;
  if (_evCrearCurIdx === 0) {
    btn.textContent = 'Continuar';
    btn.onclick = _evCrearIrPaso1;
    btn.disabled = !_evCrearLugarValido();
  } else {
    btn.textContent = 'Crear evento';
    btn.onclick = _evCrearGuardar;
    btn.disabled = !_evCrearRecurrenciaValidaWizard();
  }
}

/* ── Paso 1: Lugar -- buscador local sobre _evLugares (reusa la misma
   variable/carga que "Editar lugares", getVenues() no depende de qué
   pantalla la pidió) + lista seleccionable + "+ Este lugar no está en la
   lista". ──── */
function _evCrearCargarLugares() {
  var cont = document.getElementById('ev-crear-lista-lugares');
  if (cont) cont.innerHTML = _evLugaresSkeletonHtml();
  var miCarga = ++_evLugaresCargaId;
  api({ action: 'getVenues', adminToken: _adminToken }, function(res) {
    if (miCarga !== _evLugaresCargaId) return;
    _evLugares = res || [];
    _evCrearRenderLugares(_evLugares);
  }, function(e) {
    if (miCarga !== _evLugaresCargaId) return;
    if (cont) cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No se pudieron cargar los lugares.</p>';
  });
}
function _evCrearRenderLugares(lista) {
  var cont = document.getElementById('ev-crear-lista-lugares'); if (!cont) return;
  if (!lista.length) {
    cont.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">' +
      (_evLugares.length ? 'Ningún lugar coincide con la búsqueda.' : 'Todavía no hay lugares creados.') + '</p>';
    return;
  }
  cont.innerHTML = lista.map(function(v) {
    var activa = _evCrearData.venueExistente && _evCrearData.venueExistente.fila === v.fila;
    return '<div class="ev-ant-card ev-crear-venue-card' + (activa ? ' activa' : '') + '" onclick="_evCrearSeleccionarLugar(' + v.fila + ')">' +
      '<div class="ev-card-top-row">' +
        '<div class="ev-card-icon"><span class="material-symbols-outlined">place</span></div>' +
        '<div class="ev-card-body">' +
          '<div class="ev-card-titulo">' + v.nombre + '</div>' +
          '<div class="ev-ant-card-sub">' + _evLugarResumenRecurrencia(v) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
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
  _evCrearData.nuevoLugarActivo = false;
  var wrap = document.getElementById('ev-crear-nuevo-lugar'); if (wrap) wrap.style.display = 'none';
  var buscador = document.getElementById('ev-crear-buscador-lugar');
  _evCrearFiltrarLugares(buscador ? buscador.value : '');
  _evCrearActualizarFooter();
}
function _evCrearMostrarNuevoLugar() {
  _evCrearData.venueExistente = null;
  _evCrearData.nuevoLugarActivo = true;
  var buscador = document.getElementById('ev-crear-buscador-lugar');
  _evCrearFiltrarLugares(buscador ? buscador.value : ''); // deselecciona cualquier card ya elegida
  var wrap = document.getElementById('ev-crear-nuevo-lugar');
  if (wrap) {
    wrap.style.display = 'block';
    void wrap.offsetWidth;
    wrap.style.animation = 'fadeIn 0.2s ease';
  }
  _evCrearLugarInicializarMapa();
  _evCrearActualizarFooter();
}
function _evCrearSetNombreNuevoLugar(v) { _evCrearData.nuevoLugar.nombre = v; _evCrearActualizarFooter(); }
function _evCrearSelIconoNuevoLugar(el) {
  document.querySelectorAll('#ev-crear-lugar-icono-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evCrearData.nuevoLugar.tipoIcono = el.dataset.val;
  _evCrearActualizarFooter();
}

/* Mapa/buscador del mini-form de lugar nuevo -- mismo mecanismo que
   _evLugarInicializarMapa()/_evLugarInicializarBuscador() de arriba
   (crearOCentrarMapaPin() + google.maps.places.Autocomplete), con su propia
   instancia/ids: no puede compartir el canvas/input de "Editar lugares",
   las 2 pantallas conviven en el mismo DOM. */
function _evCrearLugarInicializarMapa() {
  var canvas = document.getElementById('ev-crear-lugar-mapa-canvas');
  if (!canvas) return;
  _evCrearLugarInicializarBuscador();
  if (typeof google === 'undefined' || !google.maps || !window._mapsLoaded) {
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.78rem;text-align:center;padding:16px;">No se pudo cargar el mapa. Intenta más tarde.</div>';
    return;
  }
  var n = _evCrearData.nuevoLugar;
  var centro = (n.lat != null && n.lng != null) ? { lat: n.lat, lng: n.lng } : _EV_LUGAR_QUITO_LATLNG;
  _evCrearLugarCentrarMapa(centro);
}
function _evCrearLugarCentrarMapa(pos) {
  var canvas = document.getElementById('ev-crear-lugar-mapa-canvas');
  if (!canvas) return;
  _evCrearMapa = crearOCentrarMapaPin(_evCrearMapa, canvas, pos, _evCrearLugarOnDragEnd);
}
function _evCrearLugarOnDragEnd(centro) {
  _evCrearLugarActualizarUbicacion(centro.lat(), centro.lng(), null);
}
function _evCrearLugarActualizarUbicacion(lat, lng, mapsUrlDirecto) {
  _evCrearData.nuevoLugar.lat = lat; _evCrearData.nuevoLugar.lng = lng;
  _evCrearData.nuevoLugar.mapsUrl = mapsUrlDirecto || ('https://www.google.com/maps?q=' + lat + ',' + lng);
  _evCrearActualizarFooter();
}
function _evCrearLugarInicializarBuscador() {
  var inp = document.getElementById('ev-crear-lugar-buscador-input');
  if (!inp) return;
  inp.value = '';
  if (_evCrearAutocomp) { google.maps.event.clearInstanceListeners(inp); _evCrearAutocomp = null; }
  if (!window._mapsLoaded || typeof google === 'undefined') return;
  _evCrearAutocomp = new google.maps.places.Autocomplete(inp, { fields: ['geometry', 'name', 'url'] });
  _evCrearAutocomp.addListener('place_changed', function() {
    var place = _evCrearAutocomp.getPlace();
    if (!place || !place.geometry || !place.geometry.location) return;
    var loc = place.geometry.location;
    _evCrearLugarCentrarMapa({ lat: loc.lat(), lng: loc.lng() });
    _evCrearLugarActualizarUbicacion(loc.lat(), loc.lng(), place.url || null);
    if (!_evCrearData.nuevoLugar.nombre && place.name) {
      _evCrearData.nuevoLugar.nombre = place.name;
      var nombreInp = document.getElementById('ev-crear-lugar-nombre');
      if (nombreInp) nombreInp.value = place.name;
      _evCrearActualizarFooter();
    }
  });
}
function _evCrearLugarValido() {
  if (_evCrearData.venueExistente) return true;
  var n = _evCrearData.nuevoLugar;
  return !!(n.nombre && n.nombre.trim() && n.mapsUrl && n.tipoIcono);
}

/* ── Paso 2: Recurrencia y horario -- mismas pills/reveal inline que el
   formulario de "Editar lugares" (_evLugarMostrarSubRecurrencia()),
   adaptado a _evCrearData/ids propios. "Hora" es el stepper nuevo, inicia
   la primera vez que se revela (una sola vez por visita al wizard). ──── */
function _evCrearSelRecurrencia(el) {
  document.querySelectorAll('#ev-crear-recurrencia-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evCrearData.tipoRecurrencia = el.dataset.val;
  _evCrearMostrarSubRecurrencia();
  _evCrearActualizarFooter();
}
function _evCrearMostrarSubRecurrencia() {
  ['ev-crear-rec-dias', 'ev-crear-rec-cada', 'ev-crear-rec-unico'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var horaWrap = document.getElementById('ev-crear-hora-wrap');
  var t = _evCrearData.tipoRecurrencia;
  if (!t) { if (horaWrap) horaWrap.style.display = 'none'; return; }
  var mapaId = { dias_semana: 'ev-crear-rec-dias', cada_tantos: 'ev-crear-rec-cada', unico: 'ev-crear-rec-unico' };
  var activo = document.getElementById(mapaId[t]);
  if (activo) {
    activo.style.display = 'block';
    void activo.offsetWidth;
    activo.style.animation = 'fadeIn 0.2s ease';
  }
  if (horaWrap) {
    var primeraVez = horaWrap.style.display === 'none';
    horaWrap.style.display = 'block';
    if (primeraVez) {
      void horaWrap.offsetWidth;
      horaWrap.style.animation = 'fadeIn 0.2s ease';
      _evHoraStepperInit('ev-crear-hora', _evCrearData.hora, function(v) { _evCrearData.hora = v; _evCrearActualizarFooter(); });
    }
  }
}
function _evCrearToggleDia(el) {
  var dia = parseInt(el.dataset.dia, 10);
  el.classList.toggle('activa');
  var idx = _evCrearData.diasSemana.indexOf(dia);
  if (el.classList.contains('activa')) { if (idx === -1) _evCrearData.diasSemana.push(dia); }
  else if (idx !== -1) { _evCrearData.diasSemana.splice(idx, 1); }
  _evCrearActualizarFooter();
}
function _evCrearSetFrecNum(v) { _evCrearData.frecuenciaNumero = v ? parseInt(v, 10) : null; _evCrearActualizarFooter(); }
function _evCrearSelUnidad(el) {
  document.querySelectorAll('#ev-crear-frec-unidad-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _evCrearData.frecuenciaUnidad = el.dataset.val;
  _evCrearActualizarFooter();
}

/* Calendario inline de fecha (referencia/único) -- reusa tal cual los
   helpers genéricos de fecha del timeline principal, mismo mecanismo que
   _evLugarCalRender() de arriba. */
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
  cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>';
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
  _evCrearCalRender(cual);
  _evCrearActualizarCalResumen(cual);
  _evCrearActualizarFooter();
}
function _evCrearActualizarCalResumen(cual) {
  var el = document.getElementById('ev-crear-cal-' + cual + '-resumen');
  if (el) el.textContent = _evCrearData.fecha ? _evAntFechaLegible(_evCrearData.fecha) : '';
}
function _evCrearRecurrenciaValidaWizard() {
  var t = _evCrearData.tipoRecurrencia;
  if (t === 'dias_semana') return _evCrearData.diasSemana.length > 0 && !!_evCrearData.hora;
  if (t === 'cada_tantos') return !!(_evCrearData.frecuenciaNumero > 0 && _evCrearData.frecuenciaUnidad && _evCrearData.fecha && _evCrearData.hora);
  if (t === 'unico') return !!(_evCrearData.fecha && _evCrearData.hora);
  return false;
}

/* ── Guardado final -- SIEMPRE crearVenue, ver nota de diseño arriba sobre
   por qué un venue existente también crea una fila nueva. ────────────── */
function _evCrearGuardar() {
  if (!_evCrearLugarValido() || !_evCrearRecurrenciaValidaWizard()) return;
  var payload = { action: 'crearVenue', adminToken: _adminToken };
  if (_evCrearData.venueExistente) {
    var v = _evCrearData.venueExistente;
    payload.nombre = v.nombre;
    payload.mapsUrl = v.mapsUrl;
    payload.lat = v.lat;
    payload.lng = v.lng;
    payload.tipoIcono = v.tipoIcono;
    payload.requiereReserva = v.requiereReserva === false ? 'NO' : 'SI';
  } else {
    var n = _evCrearData.nuevoLugar;
    payload.nombre = n.nombre.trim();
    payload.mapsUrl = n.mapsUrl;
    payload.lat = n.lat;
    payload.lng = n.lng;
    payload.tipoIcono = n.tipoIcono;
    payload.requiereReserva = 'SI'; // sin pill propia en este wizard, ver nota de diseño
  }
  payload.tipoRecurrencia = _evCrearData.tipoRecurrencia;
  payload.hora = _evCrearData.hora;
  if (_evCrearData.tipoRecurrencia === 'dias_semana') {
    payload.diasSemana = JSON.stringify(_evCrearData.diasSemana.slice().sort(function(a, b) { return a - b; }));
  } else if (_evCrearData.tipoRecurrencia === 'cada_tantos') {
    payload.frecuencia = _evCrearData.frecuenciaNumero;
    payload.unidad = _evCrearData.frecuenciaUnidad;
    payload.fechaReferencia = _evCrearData.fecha;
  } else {
    payload.fechaReferencia = _evCrearData.fecha;
  }

  mostrarCargando('Creando evento...');
  apiPost(payload, function(res) {
    ocultarCargando();
    if (res && res.exito === false) {
      mostrarToast(res.error || 'No se pudo crear el evento.', 'error');
      return;
    }
    mostrarToast('Evento creado.', 'ok');
    ir('s-eventos');
  }, function(e) {
    ocultarCargando();
    mostrarToast(e && e.message ? e.message : 'No se pudo crear el evento.', 'error');
  });
}
