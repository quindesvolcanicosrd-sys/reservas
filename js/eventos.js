/* ═══════════════════════════════════════════════════════
   EVENTOS.JS — Sección Eventos (Tanda 2: estructura estática)
   Datos de prueba hardcodeados acá abajo simulan la forma que van a
   devolver getEventosRango()/getCumpleañosRango() (Apps Script, Tanda 1,
   ya construidas) y getEventosFiltrados() -- la Tanda 3 reemplaza
   _evGenerarDemo()/_EV_EVENTOS_DEMO/_EV_CUMPLEANOS_DEMO por las llamadas
   reales (api()/apiPost(), js/api.js) sin tocar el resto de este archivo:
   toda la lógica de render/navegación de vistas ya trabaja sobre los
   arrays _EV_EVENTOS/_EV_CUMPLEANOS, no sobre la fuente de los datos.
   ═══════════════════════════════════════════════════════ */

var _EV_EVENTOS = [];
var _EV_CUMPLEANOS = [];

// Alterna la variante de card usuario/admin sin necesitar sesión real
// todavía (ver brief de la Tanda 2) -- flip desde la consola del navegador:
// `_esAdminDemo = true; _evRenderTimeline();`
var _esAdminDemo = false;

var _EV_EQUIPO_DEMO = [
  'Andrea Vélez', 'Bruno Salazar', 'Camila Torres', 'Diego Ramírez',
  'Estefanía Cruz', 'Fernando León', 'Gabriela Ponce', 'Hernán Ibarra',
  'Isabela Moreno', 'Joaquín Vega', 'Karen Zambrano', 'Luis Ortiz'
];

var _EV_ICONOS = { 'Entrenamiento': 'directions_run', 'Torneo': 'emoji_events', 'Asamblea': 'groups', 'Ciclopaseo': 'pedal_bike' };
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
// nombre aparece en la hoja "Asistencias" (columnas "A horario"/"Tarde" del
// backend, Tanda 3) -- no del RSVP que marcó antes del evento (`miEstado`).
// `miAsistenciaReal: null` (o el campo ausente) = "Sin registrar", sin chip
// de color propio.
var _EV_ASISTENCIA_REAL_BADGE = { 'A horario': 'badge-confirmada', 'Tarde': 'badge-pendiente', 'Ausente': 'badge-cancelada' };
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
var _EV_ASISTENCIA_REAL_LABEL = { 'A horario': 'Llegué a horario', 'Tarde': 'Llegué tarde', 'Ausente': 'No asistí', 'Sin registrar': 'No asistí' };
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
// `--purple-bg` (mismo violeta que `.fi-pill-hora`/el botón único de las
// cards, antes inconsistente entre las 2 pantallas).
var _EV_RSVP_BG = { 'Asistiré': 'var(--success-bg)', 'No asistiré': 'var(--danger-bg)', 'No jugador': 'var(--purple-bg)' };
// Sufijo de clase CSS por estado -- botón único + opciones grandes de las
// cards (`.ev-rsvp-boton-<clase>`/`.ev-rsvp-opcion-<clase>`, css/eventos.css)
// reusan los mismos tokens que sus pills equivalentes en otras pantallas
// (`.fi-pill-dur`/verde, `.fi-pill-hora`/violeta), no colores inventados.
var _EV_RSVP_CLASE = { 'Asistiré': 'asistire', 'No asistiré': 'no-asistire', 'No jugador': 'no-jugador' };

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

/* ── Datos de prueba ──────────────────────────────────────────────────
   Generados en relación a "hoy" (no fechas fijas) para que la semana y el
   mes actuales siempre tengan contenido sin importar cuándo se revise esta
   pantalla. */
function _evGenerarDemo() {
  var hoy = _evHoyISO();
  _EV_EVENTOS = [
    { id: 'EVT-1', fecha: _evSumarDias(hoy, -10), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Finalizado', miEstado: 'Asistiré', miAsistenciaReal: 'A horario',
      asistentes: [{ nombre: 'Andrea Vélez', estado: 'A tiempo' }, { nombre: 'Bruno Salazar', estado: 'Tarde' }, { nombre: 'Camila Torres', estado: 'Ausente' }] },
    { id: 'EVT-2', fecha: _evSumarDias(hoy, -3), horaInicio: '19:00', lugar: 'Coliseo Rumiñahui', tipo: 'Entrenamiento', estado: 'Finalizado', miEstado: null, miAsistenciaReal: 'Tarde',
      asistentes: [{ nombre: 'Diego Ramírez', estado: 'A tiempo' }] },
    { id: 'EVT-3', fecha: _evSumarDias(hoy, -1), horaInicio: '18:30', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Cancelado', miEstado: null, asistentes: [] },
    { id: 'EVT-4', fecha: hoy, horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Evento Programado', miEstado: null, asistentes: [],
      rsvps: [{ nombre: 'Andrea Vélez', estado: 'Asistiré' }, { nombre: 'Bruno Salazar', estado: 'Asistiré' }, { nombre: 'Camila Torres', estado: 'Asistiré' }, { nombre: 'Diego Ramírez', estado: 'Asistiré' }, { nombre: 'Estefanía Cruz', estado: 'No asistiré' }, { nombre: 'Fernando León', estado: 'No jugador' }] },
    { id: 'EVT-5', fecha: _evSumarDias(hoy, 1), horaInicio: '19:00', lugar: 'Coliseo Rumiñahui', tipo: 'Entrenamiento', estado: 'Evento Programado', miEstado: 'No jugador', asistentes: [],
      rsvps: [{ nombre: 'Gabriela Ponce', estado: 'Asistiré' }, { nombre: 'Hernán Ibarra', estado: 'Asistiré' }, { nombre: 'Isabela Moreno', estado: 'No asistiré' }] },
    { id: 'EVT-6', fecha: _evSumarDias(hoy, 3), horaInicio: '10:00', lugar: 'Sede Quindes Volcánicos', tipo: 'Asamblea', estado: 'Evento Programado', miEstado: null, asistentes: [] },
    { id: 'EVT-7', fecha: _evSumarDias(hoy, 4), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'No se entrena', miEstado: null, asistentes: [] },
    { id: 'EVT-8', fecha: _evSumarDias(hoy, 6), horaInicio: '09:00', lugar: 'Pista Bicentenario', tipo: 'Torneo', estado: 'Evento Programado', miEstado: null, asistentes: [],
      rsvps: [{ nombre: 'Joaquín Vega', estado: 'Asistiré' }] },
    { id: 'EVT-9', fecha: _evSumarDias(hoy, 8), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Evento Programado', miEstado: null, asistentes: [] },
    { id: 'EVT-10', fecha: _evSumarDias(hoy, 15), horaInicio: '18:00', lugar: 'Coliseo Rumiñahui', tipo: 'Entrenamiento', estado: 'Evento Programado', miEstado: null, asistentes: [] },
    { id: 'EVT-11', fecha: _evSumarDias(hoy, 22), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Evento Programado', miEstado: null, asistentes: [] },
    { id: 'EVT-12', fecha: _evSumarDias(hoy, -24), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Finalizado', miEstado: null, asistentes: [] },
    // requiereReserva:false (ver "Cambios recientes") -- viene de Venues!
    // "Requiere reserva"='NO' en el backend real (getEventosRango()/
    // getEventosFiltrados(), MANIFEST.md); el resto de los eventos de este
    // array NO tienen el campo a propósito (undefined), mismo default
    // `true` que ya aplica el backend cuando la columna viene vacía.
    { id: 'EVT-13', fecha: _evSumarDias(hoy, 5), horaInicio: '09:00', lugar: 'Ciclopaseo', tipo: 'Ciclopaseo', estado: 'Evento Programado', miEstado: null, asistentes: [], requiereReserva: false,
      rsvps: [{ nombre: 'Karen Zambrano', estado: 'Asistiré' }] }
  ];
  // `fotoPerfil` (ver _evCardCumpleHtml()/_evHidratarAvatares()) -- mismo
  // campo que ya trae E.datos desde la columna de Equipo real (js/perfil.js/
  // js/home.js), acá vacío a propósito: sin fuente real todavía en esta
  // demo (mismo motivo que _EV_EQUIPO_DEMO, solo nombres, ver comentario de
  // _evHidratarAvatares()) -- cae sola al fallback de inicial.
  _EV_CUMPLEANOS = [
    { id: 'CUMP-1', nombre: 'Isabela Moreno', fecha: _evSumarDias(hoy, -1), edad: 24, edadPublica: true, fotoPerfil: '' },
    { id: 'CUMP-2', nombre: 'Joaquín Vega', fecha: hoy, edad: null, edadPublica: false, fotoPerfil: '' },
    { id: 'CUMP-3', nombre: 'Karen Zambrano', fecha: _evSumarDias(hoy, 2), edad: 29, edadPublica: true, fotoPerfil: '' },
    { id: 'CUMP-4', nombre: 'Luis Ortiz', fecha: _evSumarDias(hoy, 9), edad: null, edadPublica: false, fotoPerfil: '' }
  ];
}

/* ── Punto de entrada (ver 'entrar' de APP_BOTTOM_NAV_ITEMS en js/ui.js) ── */
function irEventos() {
  if (_EV_EVENTOS.length === 0) _evGenerarDemo();
  _evTimelineFiltro = { lugar: [], tipo: [] };
  _evBusqueda = '';
  var inp = document.getElementById('ev-search-input'); if (inp) inp.value = '';
  _evPanelAbierto = null;
  _evNavMesActual = null;
  _evCalVisible = false;
  _evCalFechaMostrada = null;
  _evCalUltimaAccionTs = 0;
  var mesPanel = document.getElementById('ev-mes-panel');
  if (mesPanel) { mesPanel.classList.remove('abierta'); mesPanel.style.maxHeight = '0px'; }
  var navMesLabel = document.getElementById('ev-nav-mes-label');
  if (navMesLabel) navMesLabel.classList.remove('ev-nav-mes-label-activo');
  _evActualizarNavMesChevron();
  var addBtn = document.getElementById('eventos-btn-add');
  if (addBtn) addBtn.style.display = _esAdminDemo ? 'flex' : 'none';
  _evActualizarBotonesFiltro();
  _evRenderTimeline();
  volver('s-eventos');
  // `ir()` (js/ui.js) ya dispara su propio `window.scrollTo(top:0, smooth)`
  // al cambiar de pantalla -- este setTimeout(50) corre DESPUÉS (mismo
  // criterio que el resto del archivo: offsetHeight/getBoundingClientRect de
  // una pantalla recién visible no son reales hasta el siguiente tick) y lo
  // reemplaza por un salto instantáneo (sin animar, es la posición inicial de
  // entrada, no un scroll disparado por el usuario) hasta "hoy" -- mismo
  // espíritu que la agenda de Google Calendar, que abre parada en el día de
  // hoy en vez de en el principio de la lista.
  setTimeout(function() {
    _evScrollAFecha(_evHoyISO(), true);
    _evActualizarNavMesPorScroll();
    _evUpdateRsvpSliders(false);
  }, 50);
}

/* ── Burbujas de cabecera: filtros/búsqueda -- una sola abierta a la vez,
   mecanismo max-height con `scrollHeight` real (evita el "golpe" de un techo
   fijo mucho más alto que el contenido real). El calendario (`_evCalVisible`)
   YA NO pasa por acá (ver "Cambios recientes" -- rediseño de navegación de
   Calendario): tiene su propio mecanismo (`_evAbrirCalendario()`/
   `_evCerrarCalendario()` más abajo), pero sigue siendo mutuamente excluyente
   con estas 2 -- abrir cualquiera cierra las otras. */
var _EV_PANELES = {
  filtros: { el: 'ev-filtros-colapsable', btn: 'ev-filtro-toggle-btn', claseActiva: 'ev-filtro-toggle-activo' },
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
  if (tag === 'filtros' && _evFiltroBurbujaAbierta) {
    _evColapsarFiltroBurbuja(_evFiltroBurbujaAbierta);
    _evFiltroBurbujaAbierta = null;
    _evActualizarBotonesFiltro();
  }
  if (tag === 'busqueda') {
    var inp = document.getElementById('ev-search-input');
    if (inp) inp.value = '';
    _evBuscar('');
  }
}
// Chequeo compartido de "¿este toque fue AFUERA de la burbuja abierta y de su
// propio ícono trigger?" -- usado por los 2 listeners de abajo (click Y
// pointerdown) para no tener 2 copias de la misma condición de contención
// que puedan desincronizarse.
function _evCerrarBurbujaSiFueraDe(target) {
  if (!_evPanelAbierto) return;
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
// depender de cuál pipeline de eventos generó el toque. Fase de CAPTURA (3er
// argumento `true`) a propósito, aunque hoy ningún handler de esta pantalla
// usa `stopPropagation()`: corre ANTES que cualquier handler propio del
// elemento tocado, así un gesto interno futuro (ej. el swipe del calendario)
// no puede interponerse por accidente si algún día suma uno.
['pointerdown', 'touchstart'].forEach(function(tipo) {
  document.addEventListener(tipo, function(e) { _evCerrarBurbujaSiFueraDe(e.target); }, true);
});
function _evToggleMesPanel() { _evTogglePanel('mes'); }
function _evToggleFiltrosPanel() { _evTogglePanel('filtros'); }
function _evToggleBusqueda() { _evTogglePanel('busqueda'); }

/* ── Fade genérico (ver "Cambios recientes" -- reemplaza el crossfade
   `_evAnimarCambioContenido()` que existió en la tanda anterior, eliminado
   por falta de consumidores; se reintroduce acá, más chico, para 2 usos:
   el label de mes de la nav y el contenido del panel de calendario).
   `instant` (usado en la primera pintada al abrir, sin fade desde vacío) se
   salta la animación. Guard de epoch (propiedad del propio `el`) contra que
   un `pintar()` tardío de una llamada vieja pise el contenido que una más
   nueva ya haya pintado -- necesario para swipes rápidos sucesivos sin
   esperar la animación (ver "Cambios recientes", punto de verificación). */
var _EV_FADE_MS = 130;
function _evFadeSwap(el, pintar, instant) {
  if (instant) { pintar(); return; }
  el._fadeEpoch = (el._fadeEpoch || 0) + 1;
  var epoch = el._fadeEpoch;
  el.style.transition = 'opacity ' + _EV_FADE_MS + 'ms ease';
  el.style.opacity = '0';
  setTimeout(function() {
    if (el._fadeEpoch !== epoch) return;
    pintar();
    el.style.transition = 'none';
    el.style.opacity = '0';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (el._fadeEpoch !== epoch) return;
        el.style.transition = 'opacity ' + _EV_FADE_MS + 'ms ease';
        el.style.opacity = '1';
      });
    });
  }, _EV_FADE_MS);
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
  _evCalVisible = true;
  _evCalUltimaAccionTs = Date.now();
  var base = _evNavMesActual ? _evToISO(new Date(_evNavMesActual.year, _evNavMesActual.month, 1)) : _evHoyISO();
  _evCalFechaMostrada = base;
  _evSincronizarNavMesDesde(base, true);
  _evCalRenderContenido(true);
  _evCalRenderPills();
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
function _evCalRenderContenido(instant) {
  var cont = document.getElementById('ev-cal-contenido');
  if (!cont) return;
  _evFadeSwap(cont, function() {
    _evCalRenderMes(cont, _evCalFechaMostrada);
    _evCalActualizarMaxHeightExterior(instant);
  }, instant);
}
// Grilla mensual completa -- sin chevrones/borde/título repetido (ver
// "Cambios recientes", punto 1 del rediseño: el título ya está arriba, en
// el label de la nav). "Hoy" es el único estado de destaque (anillo) -- ya
// no hay un "día seleccionado" con relleno persistente.
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
    var tieneEv = _evEventosDeFecha(celdaIso).length > 0;
    var tieneCumple = _evCumpleDeFecha(celdaIso).length > 0;
    html += '<div class="ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (esHoy ? ' ev-dia-hoy' : '') +
      '" onclick="_evCalTocarDia(\'' + celdaIso + '\')">' +
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
// Tocar un día puntual -- el calendario NUNCA cambia por esto (ver "Cambios
// recientes": se elimina el colapso a franja semanal que existía antes),
// solo scrollea el timeline hasta esa fecha exacta y lo deja tal cual
// estaba (mes completo, sin re-render ni recalcular el label de la nav --
// eso lo termina sincronizando el scroll mismo, `_evActualizarNavMesPorScroll()`,
// como cualquier scroll manual del timeline).
function _evCalTocarDia(iso) {
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
  _evCalFechaMostrada = nuevaFecha;
  _evSincronizarNavMesDesde(nuevaFecha);
  _evCalRenderContenido();
  _evCalRenderPills();
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
// Colapsa el calendario apenas arranca un scroll hacia ABAJO en el timeline
// (ver "Cambios recientes" -- funcionalidad NUEVA, pedido explícito: no
// existía ningún auto-colapso por scroll desde que esta misma sesión
// simplificó el calendario a 2 estados -- a propósito, para no reintroducir
// el conflicto swipe-horizontal-de-mes vs. scroll-vertical que esa
// simplificación evitó. Por eso este listener escucha SOLO `#ev-timeline`,
// nunca el panel del calendario en sí (que sigue cerrándose únicamente por
// acción directa sobre él: chevron/label o su propio swipe hacia abajo,
// arriba). Mismo umbral que el resto de gestos de esta pantalla
// (`_EV_CAL_SWIPE_UMBRAL`) pero medido en CADA `touchmove` -- a diferencia
// del swipe del calendario (que solo mide al soltar), acá hace falta
// reaccionar apenas se cruza el umbral, no recién al terminar el gesto
// (pedido explícito: "no después de que el scroll ya avanzó un rato"). El
// dedo moviéndose hacia ARRIBA (`dy` negativo) es lo que hace que el
// contenido scrollee hacia ABAJO -- convención estándar de touch-scroll.
var _evTimelineScrollCloseY = 0, _evTimelineScrollCloseActivo = false, _evTimelineScrollCloseDisparado = false;
function _evInicializarCierreCalendarioPorScroll() {
  var cont = document.getElementById('ev-timeline');
  if (!cont) return;
  cont.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    _evTimelineScrollCloseY = e.touches[0].clientY;
    _evTimelineScrollCloseActivo = true;
    _evTimelineScrollCloseDisparado = false;
  }, { passive: true });
  cont.addEventListener('touchmove', function(e) {
    if (!_evTimelineScrollCloseActivo || _evTimelineScrollCloseDisparado || !_evCalVisible) return;
    var dy = e.touches[0].clientY - _evTimelineScrollCloseY;
    if (dy <= -_EV_CAL_SWIPE_UMBRAL) {
      _evTimelineScrollCloseDisparado = true;
      _evCerrarCalendario();
    }
  }, { passive: true });
  cont.addEventListener('touchend', function() { _evTimelineScrollCloseActivo = false; }, { passive: true });
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
    html += '<button type="button" class="historial-pill' + (activa ? ' activa' : '') + '" onclick="_evCalTocarPillMes(' + o.year + ',' + o.month + ')">' + _EV_MESES_CORTOS[o.month] + '</button>';
  });
  cont.innerHTML = html;
  var pillActiva = cont.querySelector('.historial-pill.activa');
  if (pillActiva) pillActiva.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
function _evCalTocarPillMes(year, month) {
  _evCalUltimaAccionTs = Date.now();
  _evCalFechaMostrada = _evToISO(new Date(year, month, 1));
  _evSincronizarNavMesDesde(_evCalFechaMostrada);
  _evCalRenderContenido();
  _evCalRenderPills();
  _evCalIrAFechaEnTimeline(_evCalFechaMostrada, true);
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
window.addEventListener('scroll', _evActualizarNavMesPorScroll, { passive: true });
// Ícono "hoy" -- si el calendario está abierto, lo vuelve al mes actual
// también (no solo scrollea el timeline) -- mismo helper que pill/swipe
// (_evCalIrAFechaEnTimeline()) por el mismo bug real de Playwright: si el
// calendario había navegado a un mes sin eventos, el timeline había quedado
// reemplazado por el aviso "No hay eventos este mes" -- SIN ningún anchor de
// fecha en el DOM, ni el de hoy (que siempre tiene contenido real en la
// demo), dejando este botón sin nada a lo que saltar. El helper ya sabe
// reponer el timeline completo cuando el destino sí tiene contenido (que
// "hoy" siempre tiene), así que alcanza con pasar por él en vez de llamar a
// `_evScrollAFecha()` directo como antes.
function _evIrAHoy() {
  var hoy = _evHoyISO();
  if (_evCalVisible) {
    _evCalUltimaAccionTs = Date.now();
    _evCalFechaMostrada = hoy;
    _evSincronizarNavMesDesde(hoy);
    _evCalRenderContenido();
    _evCalRenderPills();
  }
  _evCalIrAFechaEnTimeline(hoy);
}

/* ── Consultas sobre los datos de prueba (idénticas a como se filtrarían
   los datos reales de getEventosRango()/getCumpleañosRango()) ──────────── */
// Filtros Lugar/Tipo -- comparten el mismo estado `_evTimelineFiltro`
// (declarado más abajo, junto al resto del panel de filtros): un solo helper
// reusado tanto por los puntitos de la grilla del panel de mes
// (_evEventosDeFecha()) como por el timeline (_evRenderTimeline()). Los
// cumpleaños NUNCA pasan por acá -- no tienen lugar/tipo propios.
function _evPasaFiltroLugarTipo(lugar, tipo) {
  var fl = _evTimelineFiltro.lugar, ft = _evTimelineFiltro.tipo;
  if (fl.length && !fl.some(function(o) { return o.val === lugar; })) return false;
  if (ft.length && !ft.some(function(o) { return o.val === tipo; })) return false;
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
// tiempo (_evFechaGrupoMasCercano()).
function _evScrollAFecha(iso, instant) {
  var el = document.getElementById('ev-fecha-' + iso) || _evFechaGrupoMasCercano(iso);
  if (!el) return;
  var margenSup = _evAlturaStickyHeader();
  document.documentElement.style.setProperty('--ev-sticky-h', margenSup + 'px');
  var r = el.getBoundingClientRect();
  var margenInf = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-h')) || 60;
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var yaVisible = r.top >= margenSup && r.bottom <= (vh - margenInf);
  if (yaVisible) return;
  el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
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
// Puente entre "el calendario saltó a este mes" (swipe/pill) y el timeline
// -- si el mes de `iso` no tiene NINGÚN evento/cumpleaños propio (ver
// "Cambios recientes" -- pedido explícito), `_evScrollAFecha()` caería al
// grupo real más cercano en OTRO mes sin ninguna explicación visible, así
// que acá se corta antes: se reemplaza el timeline por el mismo aviso vacío
// que ya usa el resto de la app (`.ev-lista-vacia`) en vez de scrollear a
// contenido ajeno. Si el mes SÍ tiene contenido pero el timeline está
// mostrando ese aviso de una navegación previa, se re-pinta completo antes
// de scrollear (chequeo barato: 0 `.ev-fecha-grupo` en el DOM = timeline no
// está en su estado normal).
function _evCalIrAFechaEnTimeline(iso, instant) {
  var m = _evCalMesDe(iso);
  var hayContenido = _evTimelineItems().some(function(it) {
    var d = _evParseISO(it.fecha);
    return d.getFullYear() === m.year && d.getMonth() === m.month;
  });
  var cont = document.getElementById('ev-timeline');
  if (!hayContenido) {
    if (cont) cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay eventos este mes.</div>';
    return;
  }
  if (cont && !cont.querySelector('.ev-fecha-grupo')) _evRenderTimeline();
  _evScrollAFecha(iso, instant);
}

// Pill de estado (Cancelado/No se entrena, ver "Cambios recientes") -- ancho
// completo, ícono de warning (Material Symbols) a la izquierda del texto,
// mismo tono rojo de advertencia que el resto de la app (--danger/--danger-bg/
// --danger-bdr, ver .ev-estado-pill en css/eventos.css). UN SOLO componente
// reusado tal cual en la card (_evCardEventoHtml(), de abajo) y en el detalle
// (_evDetalleEstadoNotaHtml(), más abajo en este archivo) -- no 2
// implementaciones paralelas.
function _evEstadoNotaPillHtml(estado) {
  return '<div class="ev-estado-pill"><span class="material-symbols-outlined">warning</span>' + estado + '</div>';
}
/* ── Card de evento — vista previa simplificada (Semana/Calendario/Lista,
   ver "Cambios recientes": se saca la fila de avatares y "Más información"
   de acá, ahora viven en la pantalla de detalle de pantalla completa,
   abrirEvDetalle()). Lugar+hora+acción; TODA la card es tocable y navega al
   detalle -- `sufijo` namespacea el id cuando la misma card se re-renderiza
   en más de un contenedor a la vez (lista de Eventos vs. fila de la pestaña
   "Lista"). Sin ícono propio (ver "Cambios recientes" -- se sacó de la card
   del todo: ahora vive una sola vez por fecha, en el badge compartido del
   timeline, `_evRenderTimeline()`, ya que una fecha puede traer varios items
   de tipos distintos). 4 casos de acción, mutuamente excluyentes, TODOS
   dentro de `.ev-card-body`, a ancho completo, apilados debajo de
   título/hora (ver "Cambios recientes" -- antes el RSVP/pill de estado
   vivían en una columna lateral compitiendo por ancho con el título; ahora
   título/hora tienen el ancho completo de la card para respirar, mismo
   tratamiento que ya tenían admin/pasado): admin, pasado (asistencia real),
   cancelado/no-se-entrena (pill de estado) o RSVP editable. El panel de
   alternativas (`accionExpand`) sigue siendo OTRO hermano más, a ancho
   completo, hermano de `.ev-card-top-row` (no anidado en el botón) -- ver
   `_evRsvpExpandHtml()`; no aplica a un evento cancelado (nada que elegir). */
function _evCardEventoHtml(e, sufijo) {
  sufijo = sufijo || '';
  var cancelado = (e.estado === 'Cancelado' || e.estado === 'No se entrena');
  var pasado = !cancelado && _evEsPasado(e);
  var accionBody = '', accionExpand = '';
  if (_esAdminDemo) accionBody = _evAccionAdminHtml(e);
  else if (pasado) accionBody = _evAsistenciaRealHtml(e);
  else if (cancelado) accionBody = _evEstadoNotaPillHtml(e.estado);
  else { accionBody = _evRsvpMiniHtml(e); accionExpand = _evRsvpExpandHtml(e); }
  return '<div class="ev-card" id="ev-card-' + e.id + sufijo + '" onclick="abrirEvDetalle(\'' + e.id + '\')">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo">' + e.lugar + '</div>' +
        '<div class="ev-card-sub"><span class="material-symbols-outlined">schedule</span>' + e.horaInicio + ' · ' + e.tipo + '</div>' +
        accionBody +
      '</div>' +
    '</div>' +
    accionExpand +
  '</div>';
}

// Hidrata TODOS los avatares-placeholder visibles a la vez (`.avatar-pill`
// con `data-nombre`, insertados vacíos por _evAsistenciaGruposHtml() de la
// pantalla de detalle) -- sin foto real todavía en esta tanda (demo),
// siempre cae al fallback de inicial (_avatarSetFotoOInicial(), js/ui.js);
// la Tanda 3 pasa la foto real de cada persona si `_EV_EQUIPO_DEMO` la trae.
function _evHidratarAvatares() {
  document.querySelectorAll('.ev-avatar-stack-item[data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, null, el.getAttribute('data-nombre'));
  });
  // Avatar de la card de cumpleaños (ver _evCardCumpleHtml() más abajo) --
  // a diferencia de la fila de arriba (demo, siempre `null`), acá SÍ hay una
  // fuente real: `data-foto` viene de `c.fotoPerfil`, la misma columna de
  // Equipo que ya consume el resto de la app (E.datos.fotoPerfil, ver
  // js/perfil.js/js/home.js) -- `_avatarSetFotoOInicial()` cae solo a la
  // inicial si viene vacía.
  document.querySelectorAll('.ev-card-cumple-avatar[data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, el.getAttribute('data-foto') || '', el.getAttribute('data-nombre'));
  });
}

/* ── Datos derivados para la pantalla de detalle (ver "Cambios recientes")
   -- Tanda 2 deriva mapsUrl/duración/descripción por lugar/tipo genérico en
   vez de pedirle 4 campos propios a cada evento de prueba; la Tanda 3 los
   reemplaza por columnas reales de Venues por evento. */
// Hora de fin -- derivada de horaInicio + duración por tipo (Tanda 2 deriva
// por tipo genérico vía `_EV_DURACION_MIN_POR_TIPO`, la Tanda 3 la reemplaza
// por una columna real de Venues por evento). Usada en la pill "Fin" de la
// pantalla de detalle. `_evDuracionTexto()` (texto "Xh Ymin" independiente,
// ver "Cambios recientes") se eliminó al sacar la pill de Duración del
// detalle -- código muerto sin más consumidores, no quedó nada que la usara.
function _evHoraFin(e) {
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
   Asisten/No asisten/No jugador/Sin respuesta -- "Sin respuesta" son
   miembros de _EV_EQUIPO_DEMO (fuente de nombres del equipo ya usada por
   "+ Agregar persona", ver _evAbrirAgregarPersona() más abajo) sin ninguna
   entrada en e.rsvps para este evento en particular. */
var _EV_GRUPOS_ASISTENCIA = [
  { estado: 'Asistiré', key: 'Asistiré', label: 'Asisten', clase: 'ev-stat-asisten' },
  { estado: 'No asistiré', key: 'No asistiré', label: 'No asisten', clase: 'ev-stat-no-asisten' },
  { estado: 'No jugador', key: 'No jugador', label: 'No jugador', clase: 'ev-stat-no-jugador' }
];
var _EV_GRUPO_SIN_RESPONDER = { key: 'SinRespuesta', label: 'Sin respuesta', clase: 'ev-stat-sin-respuesta' };
// `grupoKey` marca el grupo (`data-grupo`) para que _evFiltrarAsistenciaPorGrupo()
// pueda mostrar/ocultar este bloque sin reconstruir toda la lista. Cada fila
// lleva además un modificador de color por estado (ver "Cambios recientes"
// -- rediseño de filas: avatar más grande, tinte sólido sutil de fondo según
// el grupo, mismos 4 colores fijos que ya usan las tarjetas de estadística
// -- `g.clase` ya es `ev-stat-<estado>`, se reusa el sufijo tal cual para
// `ev-asist-persona-<estado>`, ver css/eventos.css).
function _evGrupoAsistenciaHtml(label, personas, grupoKey, clase) {
  if (!personas.length) return '';
  var claseFila = 'ev-asist-persona-' + clase.replace('ev-stat-', '');
  var filas = personas.map(function(p) {
    return '<div class="ev-asist-persona ' + claseFila + '"><div class="avatar-pill avatar-pill--sm ev-avatar-stack-item" data-nombre="' + p.nombre.replace(/"/g, '&quot;') + '"></div><span>' + p.nombre + '</span></div>';
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
function _evAsistenciaRealHtml(e) {
  var estadoReal = e.miAsistenciaReal || 'Sin registrar';
  var clase = _EV_ASISTENCIA_REAL_BADGE[estadoReal] || 'badge-sin-registrar';
  var label = _EV_ASISTENCIA_REAL_LABEL[estadoReal] || estadoReal;
  return '<div class="ev-asistire-wrap"><span class="badge ev-rsvp-readonly ' + clase + '">' + label + '</span></div>';
}
function _evRsvpBarraHtml(e) {
  if (e.estado === 'Cancelado' || e.estado === 'No se entrena') return '';
  if (_evEsPasado(e)) return _evAsistenciaRealHtml(e);
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

/* ── Variante usuario en las CARDS de vista previa (Semana/Calendario/Lista,
   ver "Cambios recientes" -- reemplaza la barra segmentada de arriba SOLO
   acá, el detalle sigue con `_evRsvpBarraHtml()` sin cambios de mecánica):
   un botón único mostrando el estado actual, angosto y alineado a la
   derecha (mismo lugar dentro de `.ev-card-body` donde vivía la barra
   completa) -- tocarlo expande un panel debajo con las alternativas en
   botones grandes lado a lado. Elegir una aplica el cambio y colapsa de
   vuelta al botón único. Sin colita conectando botón↔panel a propósito
   (ver "Cambios recientes" -- ya se probó 2 veces en otro lugar de esta
   pantalla, `.ev-header-burbuja-panel`, y las 2 se descartaron por costura/
   desalineación; acá el botón cambia de ancho según el estado ("Asistiré"
   vs. "Sin respuesta" vs. "No jugador"), lo que hace que una colita fija
   quede desalineada la mitad de las veces -- se decidió no repetir el
   mismo problema una 3ra vez, el mecanismo de expansión funciona igual sin
   ella). */
function _evRsvpBotonClase(estado) { return 'ev-rsvp-boton-' + (estado ? _EV_RSVP_CLASE[estado] : 'sin-respuesta'); }
// Alternativas reales para el panel expandido: nunca "Sin respuesta" como
// opción (no se puede "desresponder", ver "Cambios recientes") -- si el
// estado actual es una respuesta real, se excluye a sí misma (quedan 2); si
// todavía no hay respuesta, se muestran las 3.
function _evRsvpOpcionesHtml(e) {
  var alternativas = e.miEstado ? _EV_RESP_OPCIONES.filter(function(o) { return o !== e.miEstado; }) : _EV_RESP_OPCIONES;
  return alternativas.map(function(o) {
    return '<button type="button" class="ev-rsvp-opcion ev-rsvp-opcion-' + _EV_RSVP_CLASE[o] + '" onclick="_evElegirRsvp(this,\'' + e.id + '\',\'' + o + '\')"><span class="material-symbols-outlined">' + _EV_RESP_ICONO[o] + '</span>' + o + '</button>';
  }).join('');
}
// `_evRsvpMiniHtml()` (botón+hint, vive DENTRO de `.ev-card-body`, ancho
// completo, debajo de título/hora -- ver "Cambios recientes": antes columna
// lateral aparte, ahora mismo tratamiento que admin/pasado/pill de estado,
// el botón en sí no cambia de tamaño, solo de posición, centrado dentro de
// ese ancho completo) + `_evRsvpExpandHtml()` (el panel de alternativas, a
// ANCHO COMPLETO, hermano de `.ev-card-top-row` dentro de `.ev-card` -- no
// un hijo anidado del botón, ver "Cambios recientes" -- corrección de
// alineación de una tanda anterior) -- separadas a propósito,
// `_evCardEventoHtml()` decide cuándo llamar a cada una (nunca para
// Cancelado/No se entrena/pasado, ver ahí).
function _evRsvpMiniHtml(e) {
  var estado = e.miEstado;
  var icono = estado ? _EV_RESP_ICONO[estado] : 'help';
  var label = estado || 'Sin respuesta';
  return '<div class="ev-rsvp-mini" data-evid="' + e.id + '" onclick="event.stopPropagation()">' +
      '<button type="button" class="ev-rsvp-boton ' + _evRsvpBotonClase(estado) + '" onclick="_evToggleRsvpExpand(this)"><span class="material-symbols-outlined">' + icono + '</span>' + label + '</button>' +
      '<div class="ev-rsvp-mini-hint">Toca para cambiar</div>' +
    '</div>';
}
function _evRsvpExpandHtml(e) {
  return '<div class="ev-rsvp-expand" data-evid="' + e.id + '" onclick="event.stopPropagation()"><div class="ev-rsvp-expand-inner">' + _evRsvpOpcionesHtml(e) + '</div></div>';
}
// Acordeón (ver "Cambios recientes"): a lo sumo 1 card con el panel abierto
// a la vez, mismo criterio ya usado en burbujas de filtro/vista de esta
// pantalla y en los aj-sub-* de Ajustes -- `_evRsvpExpandidoCard` guarda el
// `.ev-card` (no el `.ev-rsvp-mini`, desde que el panel se separó del botón
// -- ver más arriba -- ni solo el id: un mismo evento puede tener más de
// una instancia simultánea en el DOM, Lista tab reusa la card completa con
// otro sufijo) y el toggle debe operar sobre la instancia tocada, no sobre
// todas.
var _evRsvpExpandidoCard = null;
function _evToggleRsvpExpand(btnEl) {
  var card = btnEl.closest('.ev-card');
  if (!card) return;
  if (_evRsvpExpandidoCard === card) { _evColapsarRsvpExpand(card); return; }
  if (_evRsvpExpandidoCard) _evColapsarRsvpExpand(_evRsvpExpandidoCard);
  _evRsvpExpandidoCard = card;
  var expand = card.querySelector('.ev-rsvp-expand');
  if (expand) expand.classList.add('abierta');
  // "Toca para cambiar" (`.ev-rsvp-mini-hint`, ver "Cambios recientes") solo
  // tiene sentido con el botón colapsado -- se oculta mientras el panel de
  // alternativas está a la vista, mismo criterio (clase en `.ev-rsvp-mini`)
  // que el resto del acordeón.
  var mini = card.querySelector('.ev-rsvp-mini');
  if (mini) mini.classList.add('ev-rsvp-mini-expandida');
}
function _evColapsarRsvpExpand(card) {
  var expand = card.querySelector('.ev-rsvp-expand');
  if (expand) expand.classList.remove('abierta');
  var mini = card.querySelector('.ev-rsvp-mini');
  if (mini) mini.classList.remove('ev-rsvp-mini-expandida');
  if (_evRsvpExpandidoCard === card) _evRsvpExpandidoCard = null;
}
function _evElegirRsvp(btnEl, id, estado) {
  var card = btnEl.closest('.ev-card');
  _evMarcarAsistencia(id, estado);
  if (card) _evColapsarRsvpExpand(card);
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
// Tanda 2 (demo, sin backend): solo actualiza el array local. La Tanda 3
// reemplaza el cuerpo por marcarAsistenciaUsuario(nombre, idEvento, estado)
// (apiPost) + las reglas de negocio de perfil (Mirlxs/Quindes, ver brief).
// Actualiza TODAS las instancias visibles de la barra de este evento en el
// DOM existente (data-evid) en vez de reconstruir HTML -- un mismo evento
// puede estar renderizado en más de un lugar a la vez (lista + detalle de
// "Ver todos"), y reconstruir el nodo mataría la animación del indicador
// (un nodo recién creado no tiene "posición anterior" desde la cual animar).
function _evMarcarAsistencia(id, estado) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  // PUNTO DE EXTENSIÓN (Tanda 3, todavía no construida -- ver "Cambios
  // recientes"): acá es donde va la lógica de negocio por perfil (Mirlxs
  // con equipamiento/paga-clase → redirige a Reservas; validación de cuota
  // al día para Mirlxs-mensual/Quindes) ANTES de escribir el RSVP -- pero
  // SOLO si `ev.requiereReserva !== false` (ya viene en el payload real de
  // getEventosRango()/getEventosFiltrados(), ver backend en MANIFEST.md).
  // Eventos como "Ciclopaseo" (`requiereReserva:false`, `Venues!Requiere
  // reserva`='NO') deben saltear esa lógica entera y dejar marcar Asistiré/
  // No asistiré/No jugador directo, para cualquier perfil -- mismo
  // comportamiento que ya tiene Quindes hoy en un entrenamiento regular.
  // Hoy (demo, sin esa lógica todavía) esta función no tiene nada que
  // saltear: `ev.miEstado = estado` de abajo corre siempre, sin excepción.
  ev.miEstado = estado;
  // Sin toast a propósito (ver "Cambios recientes") -- el resaltado
  // animado de la opción tocada ya es feedback suficiente, mismo criterio
  // que el resto de la app: toasts silenciados salvo error real.
  document.querySelectorAll('.ev-rsvp-seg').forEach(function(seg) {
    if (seg.getAttribute('data-evid') !== id) return;
    seg.querySelectorAll('.ev-rsvp-opt').forEach(function(opt) {
      opt.classList.toggle('activa', opt.getAttribute('data-estado') === estado);
    });
    _evPosicionarRsvpSlider(seg, true);
  });
  // Botón único de las cards (ver "Cambios recientes") -- misma lógica de
  // "actualizar in-place, no reconstruir" que la barra de arriba, por el
  // mismo motivo (más de una instancia simultánea del mismo evento en el
  // DOM, ver `_evRsvpMiniHtml()`).
  document.querySelectorAll('.ev-rsvp-mini[data-evid="' + id + '"]').forEach(function(mini) {
    var boton = mini.querySelector('.ev-rsvp-boton');
    if (boton) {
      boton.className = 'ev-rsvp-boton ' + _evRsvpBotonClase(estado);
      boton.innerHTML = '<span class="material-symbols-outlined">' + _EV_RESP_ICONO[estado] + '</span>' + estado;
    }
  });
  // Panel de alternativas -- ya NO vive anidado dentro de `.ev-rsvp-mini`
  // (ver "Cambios recientes" -- corrección de alineación, ahora es hermano
  // de `.ev-card-top-row`, a ancho completo), así que se busca/actualiza
  // por su propio `data-evid`. Se reconstruye siempre (cambia según el
  // nuevo estado), esté o no expandido en este momento -- invisible
  // mientras `.ev-rsvp-expand` no tenga `.abierta`, ver css/eventos.css.
  document.querySelectorAll('.ev-rsvp-expand[data-evid="' + id + '"] .ev-rsvp-expand-inner').forEach(function(inner) {
    inner.innerHTML = _evRsvpOpcionesHtml(ev);
  });
}

/* ── Variante admin: lista de asistentes con chip + agregar persona ──── */
function _evAccionAdminHtml(e) {
  var asistentes = e.asistentes || [];
  var filas = asistentes.map(function(a) {
    return '<div class="ev-asistente-row"><span class="ev-asistente-nombre">' + a.nombre + '</span>' +
      '<span class="badge ' + (_EV_CHIP_BADGE[a.estado] || 'badge-pendiente') + '">' + a.estado + '</span></div>';
  }).join('');
  // stopPropagation: mismo motivo que _evRsvpBarraHtml() -- la card entera
  // ahora es clickeable (abre el detalle), esto evita que tocar una fila o
  // "Agregar persona" también dispare ese click.
  return '<div class="ev-asistentes-list" onclick="event.stopPropagation()">' +
    (filas || '<div style="font-size:0.76rem;color:var(--muted);">Nadie ha marcado todavía.</div>') +
    '<button class="ev-btn-agregar-persona" onclick="_evAbrirAgregarPersona(\'' + e.id + '\')"><span class="material-symbols-outlined">person_add</span>Agregar persona</button>' +
  '</div>';
}

/* ── Bottom sheet "+ Agregar persona" (demo -- Tanda 3 la conecta a
   adminBuscarPersonasParaEvento(idEvento)) ───────────────────────────── */
var _evAgregarEventoId = null;
function _evAbrirAgregarPersona(idEvento) {
  _evAgregarEventoId = idEvento;
  var s = document.getElementById('ev-agregar-search'); if (s) s.value = '';
  _evRenderListaAgregar('');
  var ov = document.getElementById('ev-sheet-agregar-overlay');
  var sh = document.getElementById('ev-sheet-agregar');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(_evCerrarSheetAgregar);
}
function _evCerrarSheetAgregar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('ev-sheet-agregar');
  var ov = document.getElementById('ev-sheet-agregar-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
function _evFiltrarAgregarPersona(q) { _evRenderListaAgregar(q); }
function _evRenderListaAgregar(q) {
  var lista = document.getElementById('ev-agregar-lista');
  if (!lista) return;
  var qn = (q || '').toLowerCase().trim();
  var candidatos = _EV_EQUIPO_DEMO.filter(function(n) { return n.toLowerCase().indexOf(qn) !== -1; });
  lista.innerHTML = candidatos.map(function(n) {
    return '<div class="ev-persona-row" onclick="_evAgregarPersonaAEvento(\'' + n.replace(/'/g, "\\'") + '\')"><span class="material-symbols-outlined">person</span>' + n + '</div>';
  }).join('') || '<div style="padding:16px;color:var(--muted);font-size:0.82rem;text-align:center;">Sin resultados.</div>';
}
function _evAgregarPersonaAEvento(nombre) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === _evAgregarEventoId; })[0];
  if (!ev) return;
  if (!ev.asistentes) ev.asistentes = [];
  if (ev.asistentes.some(function(a) { return a.nombre === nombre; })) { mostrarToast(nombre + ' ya está en la lista', 'error'); return; }
  ev.asistentes.push({ nombre: nombre, estado: 'A tiempo' });
  mostrarToast(nombre + ' agregadx', 'ok', true);
  _evCerrarSheetAgregar();
  _evRenderTimeline();
}

/* ── Card de cumpleaños ────────────────────────────────────────────────
   Solo entran a _EV_CUMPLEANOS_DEMO personas con Fecha pública=Sí (mismo
   criterio que "Próximos cumpleaños" existente) -- la edad se muestra
   solo si edadPublica también es Sí, si no "Hoy cumple" sin número.
   Mismo tratamiento visual que _evCardEventoHtml() (ver "Cambios recientes"
   -- antes tenía un `.ev-card-icon` cuadrado propio + título en color fijo
   `--cumple-text`, ambos eliminados): avatar circular real (`.avatar-pill`,
   hidratado por _evHidratarAvatares() -- ver ahí) en vez del cuadrado. Sin
   ícono `cake` propio en el título (ver "Cambios recientes" -- sacado junto
   con el ícono de tipo de las cards de evento: vive únicamente una vez en el
   badge de fecha compartido del timeline, `.ev-fecha-badge-tipos`). Sin
   color propio: `.ev-card-titulo` queda en `var(--text)`, como cualquier
   otra card -- ya no hace falta que el título se destaque, el avatar +
   "Cumpleaños de <nombre>" ya son señal suficiente. */
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
        '<div class="ev-card-titulo">Cumpleaños de ' + c.nombre + '</div>' +
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
  // El panel exterior (`.ev-filtros-colapsable`, `_evToggleFiltrosPanel()`)
  // fija su `max-height` a la altura real de SU contenido en el momento de
  // abrirse (sin ninguna burbuja abierta todavía) -- relajarlo acá a un techo
  // holgado evita que esa misma altura ajustada recorte una burbuja que se
  // expande DESPUÉS. Sin transición propia (salto directo, no animado): un
  // techo más alto no cambia nada visible mientras el contenido real quepa
  // adentro, así que no hay "golpe" que evitar acá, a diferencia del panel.
  var panelEl = document.getElementById('ev-filtros-colapsable');
  if (panelEl && panelEl.classList.contains('abierta')) panelEl.style.maxHeight = '460px';
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
  _evRenderTimeline();
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
// Lugar/Tipo, mismo criterio AND que entre esos 2 filtros entre sí.
function _evPasaBusqueda(texto) {
  var q = _evBusqueda.trim().toLowerCase();
  return !q || (texto || '').toLowerCase().indexOf(q) !== -1;
}
function _evBuscar(q) { _evBusqueda = q; _evRenderTimeline(); }

// Una fila del timeline: futuro (incluye hoy) reusa la card COMPLETA
// (_evCardEventoHtml(), con su botón de RSVP); pasado usa una fila compacta
// propia, atenuada (`.ev-pasado-atenuado`, ver "Cambios recientes" -- antes
// solo se atenuaba en el subtab "Todos", ahora el timeline ES ese caso
// siempre) con el chip de asistencia real ya registrada en vez de RSVP/
// "quién asiste" (no tiene sentido para algo que ya ocurrió). La fecha ya la
// muestra el badge lateral del grupo (_evRenderTimeline()), así que acá solo
// queda hora+tipo.
function _evTimelineFilaHtml(e) {
  var hoy = _evHoyISO();
  if (_evFechaCmp(e.fecha, hoy) >= 0) return _evCardEventoHtml(e, '');
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var trailing = '';
  if (e.estado !== 'Cancelado' && e.estado !== 'No se entrena') {
    var estadoReal = e.miAsistenciaReal || 'Sin registrar';
    var clase = _EV_ASISTENCIA_REAL_BADGE[estadoReal] || 'badge-sin-registrar';
    var label = _EV_ASISTENCIA_REAL_LABEL[estadoReal] || estadoReal;
    trailing = '<span class="badge ' + clase + '">' + label + '</span>';
  }
  return '<div class="ev-card-compacta-wrap ev-pasado-atenuado">' +
    '<div class="ev-card-compacta" onclick="abrirEvDetalle(\'' + e.id + '\')">' +
      '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
      '<div class="ev-card-compacta-info">' +
        '<div class="ev-card-compacta-titulo">' + e.lugar + '</div>' +
        '<div class="ev-card-compacta-sub">' + e.horaInicio + ' · ' + e.tipo + '</div>' +
      '</div>' +
      trailing +
    '</div>' +
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
  _EV_CUMPLEANOS.filter(function(c) { return _evPasaBusqueda(c.nombre); })
    .forEach(function(c) { items.push({ fecha: c.fecha, orden: '00:00', tipo: 'cumple', data: c }); });
  items.sort(function(a, b) {
    var c = _evFechaCmp(a.fecha, b.fecha);
    return c !== 0 ? c : (a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : 0);
  });
  return items;
}
function _evRenderTimeline() {
  var items = _evTimelineItems();

  var cont = document.getElementById('ev-timeline');
  if (!cont) return;
  if (items.length === 0) {
    cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay eventos ni cumpleaños con estos filtros.</div>';
    return;
  }
  var porFecha = {}, ordenFechas = [];
  items.forEach(function(it) {
    if (!porFecha[it.fecha]) { porFecha[it.fecha] = []; ordenFechas.push(it.fecha); }
    porFecha[it.fecha].push(it);
  });
  var hoy = _evHoyISO();
  var mesAnterior = null, html = '';
  // Separadores HOY/MAÑANA/PRÓXIMA SEMANA (ver "Cambios recientes" --
  // restaurados) -- HOY siempre se muestra, marca el punto cronológico exacto
  // donde el timeline cruza de pasado a futuro (aunque nada caiga justo hoy,
  // por eso NO es un `else if` del chequeo de bucket de abajo: una fecha
  // puede disparar los 2 separadores a la vez, ej. si el primer grupo futuro
  // es directamente mañana). MAÑANA/PRÓXIMA SEMANA son condicionales -- solo
  // aparecen si ese bucket realmente tiene contenido, por eso se registran en
  // `bucketsMostrados` recién cuando efectivamente se inserta uno.
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
    if (!insertadoHoy && _evFechaCmp(fecha, hoy) >= 0) {
      html += '<div class="ev-hoy-separador"><span>HOY</span></div>';
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
    // Íconos de tipo debajo del número (ver "Cambios recientes" -- movidos
    // acá desde la card individual: esta fecha es COMPARTIDA por todos los
    // items de ese día, así que el ícono también -- uno por item, mismo
    // orden que las cards de abajo (`.map()` de `.ev-fecha-items`, mismo
    // array `porFecha[fecha]`) para que la correspondencia ícono→card se lea
    // por posición, sin ambigüedad. `cake` fijo para cumpleaños (no tienen
    // `tipo` propio como los eventos).
    var iconosTipos = porFecha[fecha].map(function(it) {
      var ic = it.tipo === 'cumple' ? 'cake' : (_EV_ICONOS[it.data.tipo] || 'event');
      return '<span class="material-symbols-outlined ev-fecha-badge-tipo">' + ic + '</span>';
    }).join('');
    html += '<div class="ev-fecha-grupo" id="ev-fecha-' + fecha + '" data-iso="' + fecha + '">' +
      '<div class="ev-fecha-badge">' +
        '<div class="ev-fecha-badge-dia">' + _EV_DIAS_CORTOS[(d.getDay() + 6) % 7] + '</div>' +
        '<div class="ev-fecha-badge-num' + (fecha === hoy ? ' ev-fecha-badge-hoy' : '') + '">' + d.getDate() + '</div>' +
        '<div class="ev-fecha-badge-tipos">' + iconosTipos + '</div>' +
      '</div>' +
      '<div class="ev-fecha-items">' +
        porFecha[fecha].map(function(it) { return it.tipo === 'cumple' ? _evCardCumpleHtml(it.data) : _evTimelineFilaHtml(it.data); }).join('') +
      '</div>' +
    '</div>';
  });
  if (!insertadoHoy) html += '<div class="ev-hoy-separador"><span>HOY</span></div>';
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
function abrirEvDetalle(id) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  _evDetalleActual = ev;
  _evRenderDetalle(ev);
  ir('s-eventos-detalle');
  // offsetHeight/offsetWidth de una pantalla display:none da 0 -- se mide
  // recién una vez que ir() ya volvió visible la pantalla. `_evUpdateRsvpSliders()` se
  // llama ACÁ (no en _evRenderDetalle(), donde la pantalla todavía está
  // display:none) por el mismo motivo -- bug reportado: entrar al detalle
  // con un estado ya elegido desde la card dejaba el indicador sin su fondo
  // sólido (offsetWidth/offsetLeft de la opción activa medidos en 0).
  setTimeout(function() { _evDetalleActualizarSticky(); _evUpdateRsvpSliders(false); }, 50);
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
function _evDetalleActualizarSticky() {
  var pantalla = document.getElementById('s-eventos-detalle');
  if (!pantalla || !pantalla.classList.contains('activa')) return;
  var nivel1 = document.getElementById('ev-detalle-sticky');
  var nivel2 = document.getElementById('ev-detalle-rsvp');
  var nivel3 = document.getElementById('ev-detalle-stats');
  if (!nivel1 || !nivel2 || !nivel3) return;
  var h1 = nivel1.offsetHeight;
  nivel2.style.top = h1 + 'px';
  var h2 = nivel2.offsetHeight;
  nivel3.style.top = (h1 + h2) + 'px';
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
  // nunca se evalúa. `_evUpdateRsvpSliders()` NO se llama acá -- la pantalla
  // todavía está display:none en este punto (ver abrirEvDetalle(), que la
  // llama recién después de ir()); medir offsetWidth/offsetLeft acá daría 0
  // y dejaría el indicador sin su fondo sólido pintado.
  if (rsvpCont) rsvpCont.innerHTML = _evRsvpBarraHtml(ev) || _evDetalleEstadoNotaHtml(ev);
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
function _evRenderDetalleAsistencia(ev) {
  _evDetalleFiltroGrupo = null;
  var rsvps = ev.rsvps || [];
  var respondieron = {};
  rsvps.forEach(function(p) { respondieron[p.nombre] = true; });
  var sinResponder = _EV_EQUIPO_DEMO.filter(function(n) { return !respondieron[n]; }).map(function(n) { return { nombre: n }; });

  var grupos = _EV_GRUPOS_ASISTENCIA.map(function(g) {
    return { key: g.key, label: g.label, clase: g.clase, personas: rsvps.filter(function(p) { return p.estado === g.estado; }) };
  });
  grupos.push({ key: _EV_GRUPO_SIN_RESPONDER.key, label: _EV_GRUPO_SIN_RESPONDER.label, clase: _EV_GRUPO_SIN_RESPONDER.clase, personas: sinResponder });

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
// Tocar una tarjeta filtra la lista de abajo a solo ese grupo; tocarla de
// nuevo (ya activa) deselecciona y vuelve a mostrar los 4. Solo una tarjeta
// activa a la vez -- tocar otra mientras hay una activa cambia el filtro.
function _evFiltrarAsistenciaPorGrupo(cardEl, grupo) {
  var yaActiva = _evDetalleFiltroGrupo === grupo;
  _evDetalleFiltroGrupo = yaActiva ? null : grupo;
  document.querySelectorAll('#ev-detalle-stats .ev-stat-card').forEach(function(c) {
    c.classList.toggle('activa', !yaActiva && c === cardEl);
  });
  document.querySelectorAll('#ev-detalle-asistencia-lista .ev-asist-grupo').forEach(function(g) {
    g.style.display = (!_evDetalleFiltroGrupo || g.getAttribute('data-grupo') === _evDetalleFiltroGrupo) ? '' : 'none';
  });
}
