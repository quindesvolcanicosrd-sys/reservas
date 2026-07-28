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
// `_esAdminDemo = true; _evRenderVistaActual();`
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
// Chip de asistencia REAL de la pestaña "Lista" > "Pasados" (ver
// _evListaTabFilaHtml() más abajo) -- a diferencia de _EV_CHIP_BADGE (arriba,
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
// Color sólido del indicador de la barra segmentada de RSVP (ver
// _evRsvpBarraHtml() más abajo) por opción -- fijos, independientes del
// color de énfasis (mismo criterio que el resto de esta pantalla: "Asistiré"
// tiene que seguir leyéndose verde pase lo que pase con --brand). Variantes
// "dark" (no el token base --success/--warning) para que el texto blanco de
// encima tenga contraste suficiente sobre el indicador sólido.
var _EV_RSVP_COLOR = { 'Asistiré': 'var(--success-dark)', 'No asistiré': 'var(--danger)', 'No jugador': 'var(--amber-dark)' };

// `_evVista` ('calendario'|'lista', ver "Cambios recientes" -- rediseño de
// cabecera): antes tenía un 3er valor 'semana' (pill grande Semana/
// Calendario/Lista) -- esa opción se funde como una de las 3 sub-opciones de
// `_evCalSubvista` de acá abajo, seleccionable con el ícono ojo (burbuja de
// 2 opciones, `_evToggleVistaBurbuja()`) en vez de un segmentado de 3.
var _evVista = 'calendario';
// Sub-opciones de la vista Calendario (Hoy/Esta semana/Este mes, ver
// "Cambios recientes") -- único lugar que declara el orden, reusado por el
// indicador del pill (`_evUpdateSubtabIndicator()`, genérica, compartida con
// la pestaña "Lista") y el swipe con `_evAnimarCambioContenido()` (misma
// idea que `_EV_SUBTABS` de la pestaña "Lista" más abajo, sin loop en los
// extremos a propósito: "Hoy" -> "Esta semana" -> "Este mes" se lee como una
// progresión de zoom, no como un ciclo).
var _EV_CAL_SUBVISTAS = ['hoy', 'semana', 'mes'];
var _evCalSubvista = 'hoy';
var _evSemanaOffset = 0;
var _evMesOffset = 0;
var _evConfettiMostrado = {};
// Vista Calendario -- 2 modos (ver "Cambios recientes"): 'dia' filtra la
// lista de abajo a un solo día tocado (_evCalFechaSel), 'mes' la muestra
// completa (agenda del mes, comportamiento de siempre de _evRangoActual()).
// `_evCalFechaSel` arranca en null -- se inicializa a "hoy" recién la
// primera vez que se renderiza la grilla (_evRenderCalendario(), init
// perezosa) para que, una vez que el usuario elige otro día, ese elegido
// sobreviva a cambiar de vista y volver a Calendario en vez de resetearse.
var _evCalModo = 'dia';
var _evCalFechaSel = null;

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
  _EV_CUMPLEANOS = [
    { id: 'CUMP-1', nombre: 'Isabela Moreno', fecha: _evSumarDias(hoy, -1), edad: 24, edadPublica: true },
    { id: 'CUMP-2', nombre: 'Joaquín Vega', fecha: hoy, edad: null, edadPublica: false },
    { id: 'CUMP-3', nombre: 'Karen Zambrano', fecha: _evSumarDias(hoy, 2), edad: 29, edadPublica: true },
    { id: 'CUMP-4', nombre: 'Luis Ortiz', fecha: _evSumarDias(hoy, 9), edad: null, edadPublica: false }
  ];
}

/* ── Punto de entrada (ver 'entrar' de APP_BOTTOM_NAV_ITEMS en js/ui.js) ── */
function irEventos() {
  if (_EV_EVENTOS.length === 0) _evGenerarDemo();
  _evVista = 'calendario'; _evCalSubvista = 'hoy';
  _evSemanaOffset = 0; _evMesOffset = 0;
  _evCalModo = 'dia'; _evCalFechaSel = null; // vuelve a "hoy seleccionado" cada vez que se entra a Eventos de nuevo
  _EV_CAL_SUBVISTAS.forEach(function(s) { document.getElementById('ev-cal-sub-' + s).classList.toggle('activo', s === 'hoy'); });
  document.getElementById('ev-cal-sub-wrap').style.display = 'block';
  document.getElementById('ev-lista-subtabs-wrap').style.display = 'none';
  document.getElementById('ev-vista-semana-wrap').style.display = 'none';
  document.getElementById('ev-vista-calendario-wrap').style.display = 'none';
  document.getElementById('ev-vista-lista-wrap').style.display = 'none';
  document.getElementById('ev-lista').style.display = 'block';
  _evActualizarVistaOpciones();
  _evActualizarFiltrosRow();
  var addBtn = document.getElementById('eventos-btn-add');
  if (addBtn) addBtn.style.display = _esAdminDemo ? 'flex' : 'none';
  _evRenderVistaActual();
  volver('s-eventos');
  // Igual criterio que _updateTpSlider()/_adminUpdateFiltroSlider() (js/reservas.js,
  // js/admin.js): offsetWidth/offsetLeft del tab activo solo son reales una
  // vez que la pantalla es visible -- se recalcula sin animar apenas lo es.
  setTimeout(function() { _evUpdateSubtabIndicator('#ev-cal-sub-wrap', 'ev-cal-sub-indicator', false); _evUpdateRsvpSliders(false); }, 50);
}

/* ── Selector de vista (ícono ojo, ver "Cambios recientes" -- rediseño de
   cabecera): reemplaza el pill grande Semana/Calendario/Lista por una
   burbuja de 2 opciones (Vista calendario/Lista de eventos,
   `_evToggleVistaBurbuja()` más abajo) -- "Lista" sigue fusionando lo que
   antes era la pantalla separada "Ver todos los eventos": #ev-lista (el
   combinado evento+cumpleaños de Calendario) se oculta mientras "Lista" está
   activa, ninguna de las 2 vistas usa el contenedor de la otra. */
function _evCambiarVista(v) {
  _evVista = v;
  document.getElementById('ev-cal-sub-wrap').style.display = v === 'calendario' ? 'block' : 'none';
  document.getElementById('ev-lista-subtabs-wrap').style.display = v === 'lista' ? 'block' : 'none';
  document.getElementById('ev-vista-semana-wrap').style.display = (v === 'calendario' && _evCalSubvista === 'semana') ? 'block' : 'none';
  document.getElementById('ev-vista-calendario-wrap').style.display = (v === 'calendario' && _evCalSubvista === 'mes') ? 'block' : 'none';
  // #ev-vista-lista-wrap (#ev-lista-tab-filas, afuera del sticky, scrollea
  // libre) -- la mitad "fija" de Lista (subtabs) ya se resolvió arriba
  // togglando #ev-lista-subtabs-wrap, dentro del pill contextual compartido.
  document.getElementById('ev-vista-lista-wrap').style.display = v === 'lista' ? 'block' : 'none';
  document.getElementById('ev-lista').style.display = v === 'lista' ? 'none' : 'block';
  _evActualizarVistaOpciones();
  // Filtros universales (ver "Cambios recientes"): el panel entero
  // (Lugar/Tipo, +Mes en Lista) ya no se fuerza a cerrar al cambiar de vista
  // -- solo el trigger/burbuja de "Mes" desaparece en Calendario (no aplica
  // ahí), así que si esa burbuja puntual estaba abierta se cierra sola.
  _evActualizarFiltrosRow();
  if (v === 'calendario' && _evFiltroBurbujaAbierta === 'mes') {
    _evColapsarFiltroBurbuja('mes');
    _evFiltroBurbujaAbierta = null;
    _evActualizarBotonesFiltro();
  }
  if (v === 'lista') {
    _evListaTabPoblarFiltros(); _evActualizarBotonesFiltro(); _evListaTabRenderLista();
    // Primera vez que "Lista" se hace visible en esta entrada a Eventos --
    // mismo problema ya conocido de offsetWidth/offsetLeft en 0 mientras el
    // wrap todavía está terminando de aplicar `display:block` (mismo criterio
    // que el setTimeout(50) de _evUpdateSubtabIndicator()/_evUpdateRsvpSliders()
    // en irEventos()) -- sin animar, el indicador ya arranca en su posición
    // real de "Próximos" en vez de deslizarse desde 0 la primera vez.
    setTimeout(function() { _evUpdateSubtabIndicator('#ev-lista-subtabs-wrap', 'ev-subtabs-indicator', false); }, 50);
  }
  else {
    _evRenderVistaActual();
    if (_evCalSubvista === 'mes') _evCalActualizarColapso();
  }
  _evColapsarVistaBurbuja();
}
// Marca cuál de las 2 opciones de la burbuja de vista corresponde a la vista
// activa (check visual, ver css/eventos.css) -- se actualiza al cambiar de
// vista y también al abrir la burbuja (por si `_evVista` cambió por otro
// camino mientras estuvo cerrada, aunque hoy no hay otro camino que
// _evCambiarVista()).
function _evActualizarVistaOpciones() {
  var elCal = document.getElementById('ev-vista-opcion-calendario');
  var elLista = document.getElementById('ev-vista-opcion-lista');
  if (elCal) elCal.classList.toggle('ev-vista-opcion-activa', _evVista === 'calendario');
  if (elLista) elLista.classList.toggle('ev-vista-opcion-activa', _evVista === 'lista');
}
// Chip "Mes" (ver "Cambios recientes" -- filtros universales): solo tiene
// sentido en Lista (Calendario ya navega por mes/semana/día directamente) --
// se saca por completo del panel en vez de mostrarse deshabilitado, sin
// toast al tocarlo (no hay nada que tocar, no está).
function _evActualizarFiltrosRow() {
  var mesBtn = document.getElementById('ev-lista-tab-filtro-btn-mes');
  if (mesBtn) mesBtn.style.display = _evVista === 'calendario' ? 'none' : '';
}
/* ── Sub-opciones de Calendario: Hoy/Esta semana/Este mes (ver "Cambios
   recientes" -- fusiona la vieja vista "Semana" acá adentro) -- MISMO
   componente visual de tabs que la pestaña "Lista" (texto simple +
   `.ev-subtabs-indicator` deslizante vía `_evUpdateSubtabIndicator()`
   genérica, ver "Cambios recientes" -- antes un `.tp-seg`/`.tp-slider` con
   fondo sólido, 2 estilos paralelos para el mismo rol), `direccion` opcional
   (swipe) igual criterio que `_evListaTabCambiarSubtab()`: sin ella (tap
   directo) se calcula comparando índices en `_EV_CAL_SUBVISTAS`. El
   contenido (franja semanal/grilla mensual, arriba, instantáneo) y la lista
   de resultados (#ev-lista, abajo, animada con `_evAnimarCambioContenido()`
   -- mismo mecanismo ya usado por la pestaña Lista) cambian juntos en una
   sola llamada. */
function _evCambiarCalSubvista(sv, direccion) {
  if (sv === _evCalSubvista) return;
  if (!direccion) {
    direccion = _EV_CAL_SUBVISTAS.indexOf(sv) > _EV_CAL_SUBVISTAS.indexOf(_evCalSubvista) ? 'izquierda' : 'derecha';
  }
  _evCalSubvista = sv;
  _EV_CAL_SUBVISTAS.forEach(function(s) {
    document.getElementById('ev-cal-sub-' + s).classList.toggle('activo', s === sv);
  });
  _evUpdateSubtabIndicator('#ev-cal-sub-wrap', 'ev-cal-sub-indicator', true);
  document.getElementById('ev-vista-semana-wrap').style.display = sv === 'semana' ? 'block' : 'none';
  document.getElementById('ev-vista-calendario-wrap').style.display = sv === 'mes' ? 'block' : 'none';
  var cont = document.getElementById('ev-lista');
  _evAnimarCambioContenido(cont, function() {
    if (sv === 'semana') _evRenderSemana();
    else if (sv === 'mes') _evRenderCalendario();
    _evRenderLista();
  }, direccion);
  if (sv === 'mes') _evCalActualizarColapso();
}
// Siguiente/anterior SIN loop (a diferencia de la pestaña Lista, ver
// declaración de `_EV_CAL_SUBVISTAS` -- pedido explícito: Hoy/Semana/Mes es
// una progresión, no un ciclo) -- usadas por el swipe, ver
// `_evInicializarSwipeCalendario()` más abajo.
function _evCalSubvistaSiguiente() {
  var idx = _EV_CAL_SUBVISTAS.indexOf(_evCalSubvista);
  if (idx >= _EV_CAL_SUBVISTAS.length - 1) return;
  _evCambiarCalSubvista(_EV_CAL_SUBVISTAS[idx + 1], 'izquierda');
}
function _evCalSubvistaAnterior() {
  var idx = _EV_CAL_SUBVISTAS.indexOf(_evCalSubvista);
  if (idx <= 0) return;
  _evCambiarCalSubvista(_EV_CAL_SUBVISTAS[idx - 1], 'derecha');
}
// Swipe horizontal sobre la lista de resultados de Calendario (#ev-lista) --
// mismo criterio que `_evInicializarSwipeLista()` más abajo (touchstart/
// touchend simple, eje horizontal predominante, mismo umbral). Solo activo
// con la vista Calendario al frente -- guard barata, aunque `#ev-lista` ya
// está `display:none` mientras "Lista" está activa (sin eventos táctiles
// reales sobre un elemento oculto de todos modos).
var _EV_CAL_SWIPE_UMBRAL = 45;
var _evCalSwipeStartX = 0, _evCalSwipeStartY = 0, _evCalSwipeActivo = false;
function _evInicializarSwipeCalendario() {
  var cont = document.getElementById('ev-lista');
  if (!cont) return;
  cont.addEventListener('touchstart', function(e) {
    if (_evVista !== 'calendario' || e.touches.length !== 1) return;
    _evCalSwipeStartX = e.touches[0].clientX;
    _evCalSwipeStartY = e.touches[0].clientY;
    _evCalSwipeActivo = true;
  }, { passive: true });
  cont.addEventListener('touchend', function(e) {
    if (!_evCalSwipeActivo) return;
    _evCalSwipeActivo = false;
    if (_evVista !== 'calendario') return;
    var t = e.changedTouches[0];
    var dx = t.clientX - _evCalSwipeStartX;
    var dy = t.clientY - _evCalSwipeStartY;
    if (Math.abs(dx) < _EV_CAL_SWIPE_UMBRAL || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) _evCalSubvistaSiguiente(); else _evCalSubvistaAnterior();
  }, { passive: true });
}
_evInicializarSwipeCalendario();
function _evRenderVistaActual() {
  if (_evCalSubvista === 'semana') _evRenderSemana();
  else if (_evCalSubvista === 'mes') _evRenderCalendario();
  _evRenderLista();
}
/* Navegación de semana/mes (chevrones ‹/› de siempre, ver "Cambios
   recientes" -- ahora también alcanzables por swipe, `_evInicializarSwipe*()`
   más abajo) -- crossfade en el strip/grilla Y en la lista de resultados,
   una llamada independiente por contenedor (mismo `_evAnimarCambioContenido()`
   ya usado por el swipe de subtabs/sub-vistas, ambas arrancan su fade-out en
   el mismo tick así se ven coordinadas). 'izquierda'/'derecha' fijas acá
   (no calculadas por índice como en los sub-tabs, no hay lista de opciones
   -- "siguiente" siempre entra desde la derecha, "anterior" desde la
   izquierda, mismo criterio que el resto del archivo). */
function _evSemanaAnterior() { _evSemanaOffset--; _evAnimarCambioSemana('derecha'); }
function _evSemanaSiguiente() { _evSemanaOffset++; _evAnimarCambioSemana('izquierda'); }
function _evAnimarCambioSemana(direccion) {
  _evAnimarCambioContenido(document.getElementById('ev-semana-dias'), _evRenderSemana, direccion);
  _evAnimarCambioContenido(document.getElementById('ev-lista'), _evRenderLista, direccion);
}
// Swipe horizontal sobre el strip de días (ver "Cambios recientes") -- mismo
// criterio/umbral que el resto de los swipes de este archivo, reusa
// _evSemanaAnterior()/_evSemanaSiguiente() tal cual (tap en los chevrones y
// swipe terminan en el mismo lugar, mismo criterio ya usado para Calendario/
// Lista: sin duplicar la navegación en 2 caminos separados).
var _EV_SEMANA_SWIPE_UMBRAL = 45;
var _evSemanaSwipeStartX = 0, _evSemanaSwipeStartY = 0, _evSemanaSwipeActivo = false;
function _evInicializarSwipeSemana() {
  var cont = document.getElementById('ev-semana-dias');
  if (!cont) return;
  cont.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    _evSemanaSwipeStartX = e.touches[0].clientX;
    _evSemanaSwipeStartY = e.touches[0].clientY;
    _evSemanaSwipeActivo = true;
  }, { passive: true });
  cont.addEventListener('touchend', function(e) {
    if (!_evSemanaSwipeActivo) return;
    _evSemanaSwipeActivo = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - _evSemanaSwipeStartX;
    var dy = t.clientY - _evSemanaSwipeStartY;
    if (Math.abs(dx) < _EV_SEMANA_SWIPE_UMBRAL || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) _evSemanaSiguiente(); else _evSemanaAnterior();
  }, { passive: true });
}
_evInicializarSwipeSemana();
// Cambiar de mes deja atrás cualquier día puntual seleccionado del mes
// anterior (no tendría sentido arrastrarlo a otro mes) -- vuelve a "modo
// mes" (agenda completa) del mes recién mostrado, ver _evCalModo más abajo.
function _evMesAnterior() { _evMesOffset--; _evCalModo = 'mes'; _evCalFechaSel = null; _evAnimarCambioMes('derecha'); }
function _evMesSiguiente() { _evMesOffset++; _evCalModo = 'mes'; _evCalFechaSel = null; _evAnimarCambioMes('izquierda'); }
function _evAnimarCambioMes(direccion) {
  _evAnimarCambioContenido(document.getElementById('ev-cal-grid'), _evRenderCalendario, direccion);
  _evAnimarCambioContenido(document.getElementById('ev-lista'), _evRenderLista, direccion);
}
// Swipe horizontal sobre la grilla mensual (ver "Cambios recientes") --
// mismo criterio que el swipe de semana de arriba, reusa
// _evMesAnterior()/_evMesSiguiente() tal cual.
var _EV_MES_SWIPE_UMBRAL = 45;
var _evMesSwipeStartX = 0, _evMesSwipeStartY = 0, _evMesSwipeActivo = false;
function _evInicializarSwipeMes() {
  var cont = document.getElementById('ev-cal-grid');
  if (!cont) return;
  cont.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    _evMesSwipeStartX = e.touches[0].clientX;
    _evMesSwipeStartY = e.touches[0].clientY;
    _evMesSwipeActivo = true;
  }, { passive: true });
  cont.addEventListener('touchend', function(e) {
    if (!_evMesSwipeActivo) return;
    _evMesSwipeActivo = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - _evMesSwipeStartX;
    var dy = t.clientY - _evMesSwipeStartY;
    if (Math.abs(dx) < _EV_MES_SWIPE_UMBRAL || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) _evMesSiguiente(); else _evMesAnterior();
  }, { passive: true });
}
_evInicializarSwipeMes();

/* ── Consultas sobre los datos de prueba (idénticas a como se filtrarían
   los datos reales de getEventosRango()/getCumpleañosRango()) ──────────── */
// Filtros universales Lugar/Tipo (ver "Cambios recientes" -- antes solo
// aplicaban en la pestaña "Lista", `_evListaTabRenderLista()`) -- comparten
// el mismo estado `_evListaTabFiltro` (declarado más abajo, junto al resto
// del panel de filtros): un solo helper reusado tanto acá (puntitos del mes/
// semana) como en `_evRenderLista()` más abajo (cards de Calendario). Los
// cumpleaños NUNCA pasan por acá -- no tienen lugar/tipo, y ya no se
// muestran en la pestaña "Lista" tampoco, mismo criterio en los 2 lugares.
function _evPasaFiltroLugarTipo(lugar, tipo) {
  var fl = _evListaTabFiltro.lugar, ft = _evListaTabFiltro.tipo;
  if (fl.length && !fl.some(function(o) { return o.val === lugar; })) return false;
  if (ft.length && !ft.some(function(o) { return o.val === tipo; })) return false;
  return true;
}
function _evEventosDeFecha(iso) { return _EV_EVENTOS.filter(function(e) { return _evFechaCmp(e.fecha, iso) === 0 && _evPasaFiltroLugarTipo(e.lugar, e.tipo); }); }
function _evCumpleDeFecha(iso) { return _EV_CUMPLEANOS.filter(function(c) { return _evFechaCmp(c.fecha, iso) === 0; }); }

/* ── Vista Semana ─────────────────────────────────────────────────────
   Franja de 7 días (L a D) de la semana actual + _evSemanaOffset semanas. */
function _evDiasDeSemana(offsetSemanas) {
  var base = _evLunesDeSemana(new Date());
  base.setDate(base.getDate() + offsetSemanas * 7);
  var dias = [];
  for (var i = 0; i < 7; i++) dias.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
  return dias;
}
function _evRenderSemana() {
  var dias = _evDiasDeSemana(_evSemanaOffset);
  var hoy = _evHoyISO();
  var html = '';
  dias.forEach(function(d) {
    var iso = _evToISO(d);
    var esHoy = iso === hoy;
    var tieneEv = _evEventosDeFecha(iso).length > 0;
    var tieneCumple = _evCumpleDeFecha(iso).length > 0;
    html += '<div class="ev-dia' + (esHoy ? ' ev-dia-hoy' : '') + '">' +
      '<div class="ev-dia-nombre">' + _EV_DIAS_CORTOS[(d.getDay() + 6) % 7] + '</div>' +
      '<div class="ev-dia-num" onclick="_evScrollAFecha(\'' + iso + '\')">' + d.getDate() + '</div>' +
      '<div class="ev-dia-dots">' +
        (tieneEv ? '<span class="ev-dot" onclick="_evScrollAFecha(\'' + iso + '\')"></span>' : '') +
        (tieneCumple ? '<span class="ev-dot-cumple" onclick="_evScrollAFecha(\'' + iso + '\')"></span>' : '') +
      '</div>' +
    '</div>';
  });
  var cont = document.getElementById('ev-semana-dias');
  if (cont) cont.innerHTML = html;
}

/* ── Vista Calendario (grilla mensual tipo Google Calendar) -- "hoy" y
   "seleccionado" son 2 estados visuales independientes (ver "Cambios
   recientes"): "hoy" es siempre un anillo (`.ev-dia-hoy`, sin importar qué
   otro día esté elegido), "seleccionado" es el relleno de color de marca
   (`.ev-cal-sel`, el día tocado -- arranca en "hoy" al entrar). Si coinciden
   en el mismo día, ambas clases conviven en la misma celda (CSS combina
   relleno + anillo, ver css/eventos.css). ─────────────────────────────── */
function _evRenderCalendario() {
  var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + _evMesOffset);
  var year = base.getFullYear(), month = base.getMonth();
  var inicioGrid = _evLunesDeSemana(new Date(year, month, 1));
  var finMes = new Date(year, month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes);
  finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  if (_evCalFechaSel === null) _evCalFechaSel = hoy; // init perezosa, ver declaración de la variable
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var iso = _evToISO(cur);
    var ajeno = cur.getMonth() !== month;
    var esHoy = iso === hoy;
    var esSel = _evCalModo === 'dia' && iso === _evCalFechaSel;
    var tieneEv = _evEventosDeFecha(iso).length > 0;
    var tieneCumple = _evCumpleDeFecha(iso).length > 0;
    html += '<div class="ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (esHoy ? ' ev-dia-hoy' : '') + (esSel ? ' ev-cal-sel' : '') +
      '" onclick="_evCalSeleccionarDia(\'' + iso + '\')">' +
      '<div class="ev-cal-num">' + cur.getDate() + '</div>' +
      '<div class="ev-cal-dots">' +
        (tieneEv ? '<span class="ev-dot"></span>' : '') +
        (tieneCumple ? '<span class="ev-dot-cumple"></span>' : '') +
      '</div>' +
    '</div>';
    cur.setDate(cur.getDate() + 1);
  }
  var grid = document.getElementById('ev-cal-grid');
  if (grid) grid.innerHTML = html;
  var label = document.getElementById('ev-cal-mes-label');
  if (label) { label.textContent = NOMBRES_MESES[month] + ' ' + year; label.classList.toggle('ev-cal-mes-activo', _evCalModo === 'mes'); }
}
// Tocar un día de la grilla -- selecciona ese día (relleno) y filtra la
// lista de abajo a solo sus eventos/cumpleaños (_evRangoActual(), un solo
// re-render de grilla+lista, sin reconstruir toda la vista). Reusa la misma
// card completa de siempre (_evCardEventoHtml(), con su barra de RSVP
// compacta) -- _evRenderLista() no cambia, solo el rango que le llega.
function _evCalSeleccionarDia(iso) {
  _evCalModo = 'dia';
  _evCalFechaSel = iso;
  _evRenderCalendario();
  _evRenderLista();
}
// Tocar el título del mes -- pasa a "modo mes" (agenda completa, ver
// _evRangoActual()), deseleccionando el punto de día (ningún `.ev-cal-sel`
// en la grilla mientras este modo esté activo -- el propio label agarra
// `.ev-cal-mes-activo` como indicador del modo activo, ver
// _evRenderCalendario()).
function _evCalVerMesCompleto() {
  _evCalModo = 'mes';
  _evRenderCalendario();
  _evRenderLista();
}
// Colapso de 2 estados de la grilla mensual al scrollear (ver "Cambios
// recientes" -- pedido explícito: umbral simple, no interpolado con el
// scroll). `_evCalActualizarColapso()` se llama tanto desde el scroll
// listener (registrado una sola vez a nivel de módulo, con guardas baratas
// -- vista activa + pantalla activa -- para no hacer nada el resto del
// tiempo) como al entrar a la vista Calendario (_evCambiarVista()) -- sin
// esto, si el usuario ya estaba scrolleado en otra vista (Semana/Lista) al
// tocar "Calendario", ningún evento de scroll nuevo dispara todavía y la
// grilla quedaría expandida de más hasta el próximo scroll, inconsistente
// con la posición real de la página.
var _evCalGridColapsada = false;
// Bug real encontrado y corregido (ver "Cambios recientes" -- reportado como
// "flicker" del colapso de Calendario específicamente tras un HARD refresh,
// Ctrl+Shift+R): `document.documentElement.scrollHeight`/`window.innerHeight`
// no son estables mientras la página todavía está cargando recursos externos
// (fuente de Material Symbols, Google Fonts, etc, sin caché de por medio en
// un hard refresh) -- un ícono que todavía muestra su fallback (texto plano
// o un glifo de otro ancho) puede rendir con una altura de línea distinta a
// una vez que la fuente real termina de aplicarse, corriendo el layout real
// varias veces seguidas mientras carga. Si el usuario scrollea en esa
// ventana, `hayContenidoDeSobra`/`deberiaColapsar` de abajo pueden calcularse
// con medidas todavía en transición y alternar de resultado en sucesivos
// scroll events reales (no un bug del debounce ni del umbral en sí) -- eso
// es el parpadeo. Fix, en 2 partes -- confirmado con Playwright que CUALQUIERA
// de las 2 solas todavía dejaba una ventana de parpadeo, hace falta juntar
// ambas: (1) `window.load` (no `DOMContentLoaded`, que no espera recursos)
// SOLO certifica que la descarga/decode de red terminó, NO que las fuentes ya
// se aplicaron al layout -- `@font-face` con `font-display:swap` (el que usa
// Google Fonts acá) puede terminar de intercambiar el glifo real recién
// DESPUÉS de `load`, sin bloquearlo. (2) `document.fonts.ready` (Font Loading
// API) sí es la señal correcta y específica para "las fuentes ya están
// aplicadas", pero por su cuenta puede resolver antes de que otros recursos
// (imágenes, el resto del boot de la app) terminen. Se espera lo que tarde
// más de las 2 + un `requestAnimationFrame` extra para asegurar que ese
// estado final ya se pintó, no solo se resolvió a nivel de promesa/red.
var _evPageCargada = (document.readyState === 'complete' && (!document.fonts || document.fonts.status === 'loaded'));
if (!_evPageCargada) {
  var _evEsperaCarga = new Promise(function(resolve) {
    if (document.readyState === 'complete') resolve(); else window.addEventListener('load', resolve);
  });
  var _evEsperaFuentes = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  Promise.all([_evEsperaCarga, _evEsperaFuentes]).then(function() {
    requestAnimationFrame(function() {
      _evPageCargada = true;
      // Sincroniza con la posición de scroll YA acumulada mientras cargaba
      // (el usuario pudo haber scrolleado antes de que terminara de cargar)
      // -- sin esto, si no llega un scroll event nuevo después, la grilla
      // queda en el estado inicial (expandida) aunque la página ya esté
      // scrolleada.
      _evCalActualizarColapso();
    });
  });
}
// Segunda causa real del mismo "flicker" reportado, encontrada con
// Playwright reproduciendo el hard refresh con recursos demorados
// (además de la inestabilidad de layout durante la carga, ya cubierta por
// `_evPageCargada` arriba): colapsar/expandir `#ev-cal-grid-colapsable`
// ANIMA su alto (0.28s) -- mientras esa transición corre, "Scroll Anchoring"
// del navegador (ajusta `window.scrollY` automáticamente para que el
// contenido bajo el punto de scroll no "salte" cuando algo ARRIBA cambia de
// tamaño) puede mover `window.scrollY` en tiempo real para compensar el
// propio resize de la grilla -- eso dispara scroll events reales nuevos, que
// recalculan con ese `scrollY` ya desplazado, pueden decidir lo contrario, y
// retrigger otra transición, que vuelve a mover el scroll, etc.: un loop de
// retroalimentación real entre la animación CSS y este cálculo, no una sola
// medición mala. Confirmado con Playwright: `window.scrollY` oscilando entre
// 0 y 200+ (scrollTo(0,100) constante de por medio) mientras la transición
// de la grilla estaba en curso, causando varios ciclos de colapso/expansión
// antes de asentarse. Fix: bloquear cualquier reevaluación mientras una
// transición propia ya está en curso (`_evCalTransicionando`), liberado
// recién en `transitionend` -- ahí se re-chequea una vez más por si el
// scroll real (no el de la retroalimentación) cambió mientras tanto.
var _evCalTransicionando = false;
function _evCalActualizarColapso() {
  if (_evVista !== 'calendario' || _evCalSubvista !== 'mes') return;
  if (!_evPageCargada) return;
  if (_evCalTransicionando) return;
  var el = document.getElementById('ev-cal-grid-colapsable');
  if (!el) return;
  // Guarda contra un loop real con poco contenido (mes con pocos eventos):
  // colapsar la grilla (hasta 340px, ver css/eventos.css) puede dejar la
  // página más corta que el viewport -- el navegador clampea el scroll de
  // vuelta a 0 solo, lo que dispara des-colapsar de nuevo, ida y vuelta.
  // Si no sobra al menos ese margen de contenido real para scrollear, ni
  // siquiera se intenta colapsar (tampoco hay nada que "revelar" haciéndolo).
  var hayContenidoDeSobra = document.documentElement.scrollHeight > window.innerHeight + 380;
  var deberiaColapsar = hayContenidoDeSobra && window.scrollY > 40;
  if (deberiaColapsar === _evCalGridColapsada) return;
  _evCalGridColapsada = deberiaColapsar;
  el.classList.toggle('colapsada', deberiaColapsar);
  // Botones ‹/› de siempre -- reaparecen (fade-in) justo cuando la grilla se
  // oculta, mismo instante que .colapsada de arriba (ver "Cambios recientes"
  // -- favorecen el swipe/chevrones sutiles de la grilla mientras esta está
  // expandida, vuelven a ser la forma principal de navegar una vez que la
  // cabecera queda compacta/sticky).
  var header = document.getElementById('ev-cal-header');
  if (header) header.classList.toggle('ev-cal-header-compacto', deberiaColapsar);
  _evCalTransicionando = true;
  el.addEventListener('transitionend', function _fin() {
    el.removeEventListener('transitionend', _fin);
    _evCalTransicionando = false;
    _evCalActualizarColapso();
  });
}
window.addEventListener('scroll', function() {
  var pantalla = document.getElementById('s-eventos');
  if (!pantalla || !pantalla.classList.contains('activa')) return;
  _evCalActualizarColapso();
}, { passive: true });

/* ── Lista de cards (debajo de cualquiera de las 2 vistas) ────────────
   Siempre TODOS los eventos + cumpleaños del rango visible (semana o mes
   completo, no solo el día tocado) — tocar un dot solo hace scroll-anchor
   hasta el grupo de esa fecha dentro de esta misma lista. */
function _evRangoActual() {
  // "Hoy" (ver "Cambios recientes" -- nueva sub-opción de Calendario): un
  // solo día, siempre el actual (a diferencia del "modo día" de "Este mes"
  // más abajo, que puede ser cualquier día tocado en la grilla) -- no hay
  // selector propio, no tiene sentido navegarlo.
  if (_evCalSubvista === 'hoy') {
    var hoyRango = _evHoyISO();
    return { desde: hoyRango, hasta: hoyRango };
  }
  if (_evCalSubvista === 'semana') {
    var dias = _evDiasDeSemana(_evSemanaOffset);
    return { desde: _evToISO(dias[0]), hasta: _evToISO(dias[6]) };
  }
  // "Este mes", "modo día" (ver _evCalModo/_evCalSeleccionarDia() más abajo):
  // un solo día seleccionado en vez del mes completo -- mismo _evRenderLista()
  // de siempre, ya agrupa/ordena/reusa la card completa sin ningún cambio,
  // un rango de un solo día simplemente produce un único grupo (o el estado
  // vacío ya existente si ese día no tiene nada).
  if (_evCalModo === 'dia' && _evCalFechaSel) {
    return { desde: _evCalFechaSel, hasta: _evCalFechaSel };
  }
  var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + _evMesOffset);
  var ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { desde: _evToISO(new Date(base.getFullYear(), base.getMonth(), 1)), hasta: _evToISO(ultimo) };
}
function _evFechaLabel(iso) {
  var hoy = _evHoyISO();
  if (_evFechaCmp(iso, hoy) === 0) return 'Hoy';
  if (_evFechaCmp(iso, _evSumarDias(hoy, 1)) === 0) return 'Mañana';
  if (_evFechaCmp(iso, _evSumarDias(hoy, -1)) === 0) return 'Ayer';
  var d = _evParseISO(iso);
  return _EV_DIAS_LARGOS[d.getDay()] + ' ' + d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()].toLowerCase();
}
// Bug real encontrado y corregido (ver "Cambios recientes" -- confirmado con
// Playwright instrumentando `lanzarConfetti()`, no adivinado leyendo el
// código: el confetti de cumpleaños nunca se veía, sin ningún error en
// consola). `irEventos()` llama `_evRenderVistaActual()` (que termina acá,
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
function _evRenderLista() {
  var rango = _evRangoActual();
  var items = [];
  _EV_EVENTOS.filter(function(e) { return _evFechaCmp(e.fecha, rango.desde) >= 0 && _evFechaCmp(e.fecha, rango.hasta) <= 0 && _evPasaFiltroLugarTipo(e.lugar, e.tipo); })
    .forEach(function(e) { items.push({ fecha: e.fecha, orden: e.horaInicio || '00:00', tipo: 'evento', data: e }); });
  _EV_CUMPLEANOS.filter(function(c) { return _evFechaCmp(c.fecha, rango.desde) >= 0 && _evFechaCmp(c.fecha, rango.hasta) <= 0; })
    .forEach(function(c) { items.push({ fecha: c.fecha, orden: '00:00', tipo: 'cumple', data: c }); });
  // Orden cronológico en una sola pasada, por fecha real -- ver _evFechaCmp().
  items.sort(function(a, b) {
    var c = _evFechaCmp(a.fecha, b.fecha);
    return c !== 0 ? c : (a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : 0);
  });

  var cont = document.getElementById('ev-lista');
  if (!cont) return;
  if (items.length === 0) {
    cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay eventos ni cumpleaños en este rango.</div>';
    return;
  }
  var porFecha = {}, ordenFechas = [];
  items.forEach(function(it) {
    if (!porFecha[it.fecha]) { porFecha[it.fecha] = []; ordenFechas.push(it.fecha); }
    porFecha[it.fecha].push(it);
  });
  var html = '';
  ordenFechas.forEach(function(fecha) {
    html += '<div class="ev-fecha-grupo" id="ev-fecha-' + fecha + '"><div class="ev-fecha-label">' + _evFechaLabel(fecha) + '</div>';
    porFecha[fecha].forEach(function(it) {
      html += it.tipo === 'cumple' ? _evCardCumpleHtml(it.data) : _evCardEventoHtml(it.data, '');
    });
    html += '</div>';
  });
  cont.innerHTML = html;
  _evUpdateRsvpSliders(false);
  _evHidratarAvatares();
  // Confetti contenido dentro de la card, SOLO para el cumpleaños de HOY
  // (fecha === hoy -- ni pasados como "Ayer cumplió..." ni próximos, celebrar
  // los 7 días del rango visible no suma), una sola vez por cumpleaños/sesión
  // (ver _EV_CONFETTI_MOSTRADO) -- si no, re-renders sin relación (navegar
  // semanas, marcar asistencia en otro evento del mismo rango) lo re-disparían
  // en cada innerHTML nuevo, no solo "al aparecer" la primera vez.
  var hoyConfetti = _evHoyISO();
  ordenFechas.forEach(function(fecha) {
    if (fecha !== hoyConfetti) return;
    porFecha[fecha].forEach(function(it) {
      if (it.tipo !== 'cumple' || _evConfettiMostrado[it.data.id]) return;
      _evConfettiMostrado[it.data.id] = true;
      var el = document.getElementById('ev-confetti-' + it.data.id);
      if (el) _evLanzarConfettiCuandoVisible(el);
    });
  });
}
// Tocar un día (número en la franja semanal, o cualquiera de los 2 puntos
// debajo -- evento/cumpleaños) hace scroll-anchor hasta su grupo en la lista
// de abajo, PERO solo si no está ya completamente visible (ver "Cambios
// recientes" -- pedido explícito: nada de saltos si ya se ve todo). Márgenes
// del chequeo iguales a los que ya usa el scroll real: 90px arriba (mismo
// valor que `scroll-margin-top` de `.ev-fecha-grupo`, css/eventos.css) y
// `--bottom-nav-h` abajo (css/colors.css). Sin evento ese día -> no existe
// `#ev-fecha-<iso>` -> no-op, ya cubierto por el `if (!el) return`.
function _evScrollAFecha(iso) {
  var el = document.getElementById('ev-fecha-' + iso);
  if (!el) return;
  var r = el.getBoundingClientRect();
  var margenSup = 90;
  var margenInf = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-h')) || 60;
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var yaVisible = r.top >= margenSup && r.bottom <= (vh - margenInf);
  if (yaVisible) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Card de evento — vista previa simplificada (Semana/Calendario/Lista,
   ver "Cambios recientes": se saca la fila de avatares y "Más información"
   de acá, ahora viven en la pantalla de detalle de pantalla completa,
   abrirEvDetalle()). Ícono+lugar+hora+barra de RSVP+chevron; TODA la card
   es tocable y navega al detalle -- `sufijo` namespacea el id cuando la
   misma card se re-renderiza en más de un contenedor a la vez (lista de
   Eventos vs. fila de la pestaña "Lista"), evita ids duplicados en el DOM. */
function _evCardEventoHtml(e, sufijo) {
  sufijo = sufijo || '';
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var estadoNota = '';
  if (e.estado === 'Cancelado') estadoNota = '<div class="ev-card-estado-nota">Cancelado</div>';
  // Pill roja (ver "Cambios recientes") -- reusa .badge/.badge-cancelada,
  // mismo patrón ya usado para los estados de asistencia real (
  // _evAsistenciaRealHtml()) en vez de una clase nueva paralela a esa.
  // `text-transform:none` scoped a `.ev-card` (css/eventos.css) -- se lee
  // "No se entrena", no "NO SE ENTRENA" (`.badge` base sí es uppercase, la
  // usan otras pantallas que si quieren mayúsculas).
  else if (e.estado === 'No se entrena') estadoNota = '<span class="badge badge-cancelada">No se entrena</span>';
  var accion = _esAdminDemo ? _evAccionAdminHtml(e) : _evRsvpBarraHtml(e);
  // Ícono de tipo INLINE junto al título (ver "Cambios recientes" -- antes
  // `.ev-card-icon`, cuadrado 42px en columna propia a la izquierda). Sin esa
  // columna, `.ev-card-body` pasa a ocupar todo el ancho de la card -- la
  // barra de RSVP (`accion`, adentro de `.ev-card-body`) queda a ancho
  // completo sin más cambios. `.ev-card-icon` sigue existiendo tal cual para
  // `_evCardCumpleHtml()`/la fila compacta de "Pasados" (`.ev-card-compacta`),
  // ninguna de las 2 entra en este rediseño.
  // `estadoNota` (Cancelado/No se entrena) vive fuera de `.ev-card-body` (ver
  // "Cambios recientes") -- `.ev-card{align-items:center}` (ya existente) la
  // centra contra el alto completo de la card. Sin chevron (ver "Cambios
  // recientes" -- eliminado de las 3 vistas, la card entera ya es tocable):
  // `estadoNota` ya no ocupa "el lugar" de nada, simplemente se suma si
  // corresponde.
  return '<div class="ev-card" id="ev-card-' + e.id + sufijo + '" onclick="abrirEvDetalle(\'' + e.id + '\')">' +
    '<div class="ev-card-body">' +
      '<div class="ev-card-titulo-row"><span class="material-symbols-outlined ev-card-icono-inline">' + icono + '</span><div class="ev-card-titulo">' + e.lugar + '</div></div>' +
      '<div class="ev-card-sub"><span class="material-symbols-outlined">schedule</span>' + e.horaInicio + ' · ' + e.tipo + '</div>' +
      accion +
    '</div>' +
    estadoNota +
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
}

/* ── Datos derivados para la pantalla de detalle (ver "Cambios recientes")
   -- Tanda 2 deriva mapsUrl/duración/descripción por lugar/tipo genérico en
   vez de pedirle 4 campos propios a cada evento de prueba; la Tanda 3 los
   reemplaza por columnas reales de Venues por evento. */
function _evDuracionTexto(e) {
  var min = _EV_DURACION_MIN_POR_TIPO[e.tipo] || 90;
  var h = Math.floor(min / 60), m = min % 60;
  return (h ? h + 'h ' : '') + (m ? m + 'min' : '') || '0min';
}
// Hora de fin -- derivada de horaInicio + duración por tipo (mismo criterio
// ya documentado para _evDuracionTexto()/_EV_DURACION_MIN_POR_TIPO: Tanda 2
// deriva por tipo genérico, la Tanda 3 la reemplaza por una columna real de
// Venues por evento). Usada en la pill "Fin" de la pantalla de detalle.
function _evHoraFin(e) {
  var min = _EV_DURACION_MIN_POR_TIPO[e.tipo] || 90;
  var p = (e.horaInicio || '00:00').split(':');
  var d = new Date(2000, 0, 1, +p[0], +p[1]);
  d.setMinutes(d.getMinutes() + min);
  return _evPad(d.getHours()) + ':' + _evPad(d.getMinutes());
}
// Fecha completa (a diferencia de _evFechaLabel(), sin los atajos
// Hoy/Mañana/Ayer -- el detalle siempre muestra la fecha real completa).
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
   (.activa, indicador sólido de color fijo -- ver _EV_RSVP_COLOR). Tocar
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
// Posiciona el indicador de UNA barra (offsetLeft/offsetWidth de la opción
// .activa, mismo mecanismo que _evUpdateSubtabIndicator()/.tp-slider) -- `seg` es
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
  slider.style.background = _EV_RSVP_COLOR[activo.getAttribute('data-estado')] || 'var(--brand)';
}
// Reposiciona TODAS las barras visibles -- llamado tras cualquier re-render
// de lista (chevrones, cambio de vista/tab, filtros) y, con setTimeout(50),
// la primera vez que la pantalla se vuelve visible (mismo problema que
// _evUpdateSubtabIndicator: offsetWidth/offsetLeft de un elemento display:none
// da 0, necesita medirse recién cuando ya es visible).
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
  _evRenderLista();
}

/* ── Card de cumpleaños ────────────────────────────────────────────────
   Solo entran a _EV_CUMPLEANOS_DEMO personas con Fecha pública=Sí (mismo
   criterio que "Próximos cumpleaños" existente) -- la edad se muestra
   solo si edadPublica también es Sí, si no "Hoy cumple" sin número. */
function _evCardCumpleHtml(c) {
  var texto = (c.edadPublica && c.edad) ? ('cumple ' + c.edad + ' años') : 'Hoy cumple';
  return '<div class="ev-card ev-card-cumple">' +
    '<div class="ev-card-icon"><span class="material-symbols-outlined">cake</span></div>' +
    '<div class="ev-card-body">' +
      '<div class="ev-card-titulo">Cumpleaños de ' + c.nombre + '</div>' +
      '<div class="ev-card-sub">' + texto + '</div>' +
    '</div>' +
    '<div class="ev-confetti-host" id="ev-confetti-' + c.id + '" style="position:absolute;inset:0;pointer-events:none;"></div>' +
  '</div>';
}

/* ═══════════════════════════════════════════════════════
   VISTA "LISTA" (dentro de #s-eventos -- ver "Cambios recientes": fusiona
   lo que antes era la pantalla separada "Ver todos los eventos"/
   s-eventos-todos como una 3ra opción del selector de arriba, en vez de
   navegar aparte). Sub-tabs Próximos/Pasados/Todos (indicador medido/
   animado por JS, ver `_evUpdateSubtabIndicator()`, + swipe horizontal con
   loop, ver `_evInicializarSwipeLista()`) + 3 filtros (burbujas inline
   desplegables, pills multi-select) + lista de cards compactas -- Próximos
   suma la barra de RSVP compacta por fila (mismo componente que las cards
   de Semana/Calendario), Pasados reemplaza el chevron por un chip con la
   asistencia REAL ya registrada. ═ */
var _evListaTabSubtab = 'proximos';
// Orden real de los sub-tabs -- único lugar que lo declara, reusado por el
// indicador, el cambio de tab por tap (dirección = comparar índices) y el
// swipe (siguiente/anterior con loop, ver "Cambios recientes").
var _EV_SUBTABS = ['proximos', 'pasados', 'todos'];
// Selección multi-valor por filtro -- arrays de {val,label} (no solo el
// valor: "mes" filtra por índice numérico pero el botón/pill muestra el
// nombre del mes, hace falta guardar ambos). Vacío = sin filtro (todos).
var _evListaTabFiltro = { mes: [], lugar: [], tipo: [] };

function _evListaTabPoblarFiltros() {
  // No-op hoy (las opciones se recalculan al abrir cada sheet, ver
  // _evOpcionesFiltro()) -- se mantiene como punto de entrada separado de
  // _evCambiarVista() por si la Tanda 3 necesita precargar algo async acá.
}
// `direccion` ('izquierda'/'derecha') es opcional -- viene del swipe
// (_evInicializarSwipeLista(), siempre explícita: la dirección real del dedo,
// incluso en el loop de los extremos, donde el índice salta al otro extremo
// en el sentido contrario). Sin `direccion` (tap directo en un tab) se
// calcula comparando índices en `_EV_SUBTABS` -- tab más a la derecha que el
// actual = 'izquierda' (entra deslizando desde la derecha), mismo criterio de
// "adelante entra desde la derecha, atrás desde la izquierda" que irAjSub()/
// cerrarAjSub() (js/perfil.js), aplicado al orden visual de los tabs en vez
// de abrir/cerrar un sub-panel.
function _evListaTabCambiarSubtab(tab, direccion) {
  if (tab === _evListaTabSubtab) return;
  if (!direccion) {
    direccion = _EV_SUBTABS.indexOf(tab) > _EV_SUBTABS.indexOf(_evListaTabSubtab) ? 'izquierda' : 'derecha';
  }
  _evListaTabSubtab = tab;
  _EV_SUBTABS.forEach(function(t) {
    document.getElementById('ev-lista-tab-subtab-' + t).classList.toggle('activo', t === tab);
  });
  _evUpdateSubtabIndicator('#ev-lista-subtabs-wrap', 'ev-subtabs-indicator', true);
  _evListaTabRenderLista(direccion);
}
// Indicador medido/animado por JS (ver "Cambios recientes" -- reemplaza la
// línea estática por tab) -- mismo patrón que _updateTpSlider() (js/reservas.js):
// mide offsetWidth/offsetLeft del .ev-subtab.activo y posiciona el indicador
// con width/transform:translateX. A diferencia de _updateTpSlider() (que
// togglea la clase .animado), acá se togglea `transition:none` inline
// directo sobre el elemento -- mismo resultado (sin transición en el render
// inicial, animado en cambios de tab posteriores) sin necesitar una clase
// .animado paralela para un solo uso.
// Genérica -- toma el wrap/indicator como parámetros (ver "Cambios recientes"
// -- antes hardcodeada a `#ev-lista-subtabs-wrap`/`#ev-subtabs-indicator`,
// exclusiva de "Lista"): reusada tal cual por el pill de Calendario
// (Hoy/Esta semana/Este mes, `#ev-cal-sub-wrap`/`#ev-cal-sub-indicator`) --
// un solo componente visual de tabs para las 2 pills contextuales de la
// cabecera, no 2 implementaciones paralelas.
function _evUpdateSubtabIndicator(wrapSelector, indicatorId, animate) {
  var ind = document.getElementById(indicatorId);
  var activo = document.querySelector(wrapSelector + ' .ev-subtab.activo');
  if (!ind || !activo) return;
  ind.style.transition = animate ? '' : 'none';
  ind.style.width = activo.offsetWidth + 'px';
  ind.style.transform = 'translateX(' + activo.offsetLeft + 'px)';
}
// Siguiente/anterior con loop en los extremos (Todos -> Próximos y viceversa,
// pedido explícito) -- usadas por el swipe, no por el tap directo de un tab
// puntual (_evListaTabCambiarSubtab() ya cubre eso con su propio cálculo de
// dirección por índice).
function _evListaTabSiguiente() {
  var idx = _EV_SUBTABS.indexOf(_evListaTabSubtab);
  _evListaTabCambiarSubtab(_EV_SUBTABS[(idx + 1) % _EV_SUBTABS.length], 'izquierda');
}
function _evListaTabAnterior() {
  var idx = _EV_SUBTABS.indexOf(_evListaTabSubtab);
  _evListaTabCambiarSubtab(_EV_SUBTABS[(idx - 1 + _EV_SUBTABS.length) % _EV_SUBTABS.length], 'derecha');
}
// Swipe horizontal sobre el contenido de la lista (ver "Cambios recientes")
// -- touchstart/touchend simple (sin seguimiento 1:1 del dedo como el
// pull-to-refresh de js/home.js, acá no hace falta arrastre visual del gesto
// en sí, solo detectar intención al soltar) sobre #ev-lista-tab-filas, que
// vive fijo en el DOM (solo se le reemplaza el innerHTML en cada render, ver
// _evListaTabRenderLista()) -- los listeners se registran una sola vez acá
// abajo, a nivel de módulo, mismo criterio que el listener de scroll de
// Calendario más arriba en este archivo. Izquierda = siguiente tab, derecha
// = anterior; eje predominante horizontal (dx > dy) para no competir con el
// scroll vertical normal de la lista.
var _EV_SWIPE_UMBRAL = 45; // mismo criterio de umbral que el pull-to-refresh (_PTR_RANGO, js/home.js)
var _evSwipeStartX = 0, _evSwipeStartY = 0, _evSwipeActivo = false;
function _evInicializarSwipeLista() {
  var cont = document.getElementById('ev-lista-tab-filas');
  if (!cont) return;
  cont.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    _evSwipeStartX = e.touches[0].clientX;
    _evSwipeStartY = e.touches[0].clientY;
    _evSwipeActivo = true;
  }, { passive: true });
  cont.addEventListener('touchend', function(e) {
    if (!_evSwipeActivo) return;
    _evSwipeActivo = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - _evSwipeStartX;
    var dy = t.clientY - _evSwipeStartY;
    if (Math.abs(dx) < _EV_SWIPE_UMBRAL || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) _evListaTabSiguiente(); else _evListaTabAnterior();
  }, { passive: true });
}
_evInicializarSwipeLista();
// Opciones candidatas de un filtro, como {val,label} únicos -- "mes" usa el
// índice (0-11) como val (coincide con getMonth()) y el nombre como label;
// "lugar"/"tipo" usan el mismo string para las 2 cosas.
function _evOpcionesFiltro(campo) {
  var vistos = {}, out = [];
  _EV_EVENTOS.forEach(function(e) {
    var val, label;
    if (campo === 'mes') { val = String(_evParseISO(e.fecha).getMonth()); label = NOMBRES_MESES[+val]; }
    else if (campo === 'lugar') { val = e.lugar; label = e.lugar; }
    else { val = e.tipo; label = e.tipo; }
    if (!vistos[val]) { vistos[val] = true; out.push({ val: val, label: label }); }
  });
  if (campo === 'mes') out.sort(function(a, b) { return (+a.val) - (+b.val); });
  else out.sort(function(a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
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
  var seleccion = _evListaTabFiltro[campo];
  var cont = document.getElementById('ev-filtro-burbuja-pills-' + campo);
  if (!cont) return;
  cont.innerHTML = opciones.map(function(o) {
    var sel = seleccion.some(function(s) { return s.val === o.val; });
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o.val.replace(/"/g, '&quot;') + '" data-label="' + o.label.replace(/"/g, '&quot;') + '" onclick="_evToggleFiltroChip(this,\'' + campo + '\')">' + o.label + '</span>';
  }).join('') || '<div style="padding:2px 4px 10px;color:var(--muted);font-size:0.82rem;">Sin opciones todavía.</div>';
}
// Toca una pill dentro de una burbuja abierta -- aplica la selección
// completa del campo de inmediato (re-render de la lista incluido), no hace
// falta cerrar la burbuja ni tocar un botón de confirmación aparte.
function _evToggleFiltroChip(pillEl, campo) {
  ajTogglePill(pillEl);
  var vals = [];
  document.querySelectorAll('#ev-filtro-burbuja-pills-' + campo + ' .aj-pill.activa').forEach(function(p) {
    vals.push({ val: p.getAttribute('data-val'), label: p.getAttribute('data-label') });
  });
  _evListaTabFiltro[campo] = vals;
  _evActualizarBotonesFiltro();
  // Filtros universales (ver "Cambios recientes"): re-renderiza lo que esté
  // al frente -- Lugar/Tipo ahora también afectan Calendario (puntitos +
  // lista de resultados, ver _evPasaFiltroLugarTipo()/_evRenderVistaActual()).
  if (_evVista === 'lista') _evListaTabRenderLista(); else _evRenderVistaActual();
}
// Texto de cada botón trigger: label default sin selección, el nombre único
// si hay exactamente 1, o "Label (N)" si hay más de 1 -- pedido explícito.
// `.ev-filtro-activo` (mismo relleno de color ya existente) marca tanto
// selección aplicada como burbuja abierta sin selección todavía; el chevron
// se invierte mientras la burbuja de ese campo está abierta.
function _evActualizarBotonesFiltro() {
  ['mes', 'lugar', 'tipo'].forEach(function(campo) {
    var btn = document.getElementById('ev-lista-tab-filtro-btn-' + campo);
    if (!btn) return;
    var label = btn.getAttribute('data-label');
    var sel = _evListaTabFiltro[campo];
    var abierta = _evFiltroBurbujaAbierta === campo;
    var txt = sel.length === 0 ? label : sel.length === 1 ? sel[0].label : label + ' (' + sel.length + ')';
    btn.querySelector('.ev-filtro-trigger-label').textContent = txt;
    btn.classList.toggle('ev-filtro-activo', sel.length > 0 || abierta);
    var chevron = btn.querySelector('.material-symbols-outlined');
    if (chevron) chevron.textContent = abierta ? 'expand_less' : 'expand_more';
  });
  _evActualizarBadgeFiltros();
}
// Botón embudo -- expande/colapsa la fila de filtros Lugar/Tipo (+Mes en
// Lista, ver _evActualizarFiltrosRow()) + sus burbujas (ver "Cambios
// recientes" -- ahora universal, disponible en las 2 vistas). Al colapsar
// (tocar de nuevo, o desde afuera) también cierra cualquier burbuja
// individual que hubiera quedado abierta adentro. `max-height` se fija por
// JS con `scrollHeight` real, NO con un número fijo en CSS (bug real
// corregido, ver comentario de `.ev-filtros-colapsable` en css/eventos.css:
// un techo mucho más alto que el contenido real hacía que la transición se
// viera instantánea en vez de animada).
// Abrir/colapsar separadas en 2 funciones (antes un solo toggle, ver
// "Cambios recientes") -- mismo criterio ya usado para las burbujas
// individuales de campo (`_evToggleFiltroBurbuja()`/`_evColapsarFiltroBurbuja()`
// más arriba): hace falta poder colapsar este panel DESDE AFUERA (la nueva
// burbuja de selector de vista, `_evAbrirVistaBurbuja()` más abajo, la cierra
// si estaba abierta -- solo una burbuja de cabecera a la vez) sin pasar por
// el toggle, que solo sabe invertir el estado actual.
var _evFiltrosPanelAbierto = false;
function _evToggleFiltrosPanel() {
  if (_evFiltrosPanelAbierto) _evColapsarFiltrosPanel(); else _evAbrirFiltrosPanel();
}
function _evAbrirFiltrosPanel() {
  _evFiltrosPanelAbierto = true;
  // Una sola burbuja de cabecera a la vez (ver "Cambios recientes") -- mismo
  // criterio ya usado entre las 3 burbujas de filtro individuales.
  if (_evVistaBurbujaAbierta) _evColapsarVistaBurbuja();
  var panel = document.getElementById('ev-filtros-colapsable');
  var btn = document.getElementById('ev-filtro-toggle-btn');
  if (panel) { panel.classList.add('abierta'); panel.style.maxHeight = panel.scrollHeight + 'px'; }
  if (btn) btn.classList.add('ev-filtro-toggle-activo');
}
function _evColapsarFiltrosPanel() {
  if (!_evFiltrosPanelAbierto) return;
  _evFiltrosPanelAbierto = false;
  var panel = document.getElementById('ev-filtros-colapsable');
  var btn = document.getElementById('ev-filtro-toggle-btn');
  if (panel) {
    // Congela el alto actualmente visible (pudo haber quedado relajado a
    // 460px por `_evToggleFiltroBurbuja()` si se abrió alguna burbuja) ANTES
    // de animar a 0 -- si no, arrancaría desde ese techo holgado en vez del
    // alto real, con el mismo bug de "golpe" pero al revés. Doble
    // requestAnimationFrame para asegurar que el browser pinte ese valor
    // congelado en un frame propio antes de cambiarlo a 0 -- un solo rAF a
    // veces cae en el mismo frame que el cambio anterior en algunos
    // navegadores, y sin el frame intermedio no hay desde-dónde animar.
    panel.style.maxHeight = panel.scrollHeight + 'px';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        panel.classList.remove('abierta');
        panel.style.maxHeight = '0px';
      });
    });
  }
  if (btn) btn.classList.remove('ev-filtro-toggle-activo');
  if (_evFiltroBurbujaAbierta) {
    _evColapsarFiltroBurbuja(_evFiltroBurbujaAbierta);
    _evFiltroBurbujaAbierta = null;
    _evActualizarBotonesFiltro();
  }
}
/* ── Burbuja del selector de vista (ícono ojo, ver "Cambios recientes" --
   rediseño de cabecera): mismo mecanismo exacto que el panel de filtros de
   arriba (max-height por JS con scrollHeight real, --ease-sheet, abrir/
   colapsar separadas) -- 2 opciones (Vista calendario/Lista de eventos,
   `_evCambiarVista()`) en vez de una fila de triggers + burbujas propias.
   Solo una burbuja de cabecera a la vez entre esta y el panel de filtros
   (`_evAbrirFiltrosPanel()` la cierra si esta estaba abierta, y viceversa). */
var _evVistaBurbujaAbierta = false;
function _evToggleVistaBurbuja() {
  if (_evVistaBurbujaAbierta) _evColapsarVistaBurbuja(); else _evAbrirVistaBurbuja();
}
function _evAbrirVistaBurbuja() {
  _evVistaBurbujaAbierta = true;
  if (_evFiltrosPanelAbierto) _evColapsarFiltrosPanel();
  _evActualizarVistaOpciones();
  var panel = document.getElementById('ev-vista-burbuja');
  var btn = document.getElementById('ev-vista-toggle-btn');
  if (panel) { panel.classList.add('abierta'); panel.style.maxHeight = panel.scrollHeight + 'px'; }
  if (btn) btn.classList.add('ev-filtro-toggle-activo');
}
function _evColapsarVistaBurbuja() {
  if (!_evVistaBurbujaAbierta) return;
  _evVistaBurbujaAbierta = false;
  var panel = document.getElementById('ev-vista-burbuja');
  var btn = document.getElementById('ev-vista-toggle-btn');
  if (panel) {
    panel.style.maxHeight = panel.scrollHeight + 'px';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        panel.classList.remove('abierta');
        panel.style.maxHeight = '0px';
      });
    });
  }
  if (btn) btn.classList.remove('ev-filtro-toggle-activo');
}
// Cuenta de los 3 filtros (mes/lugar/tipo) CON al menos una opción
// seleccionada -- a propósito NO la cantidad total de opciones marcadas
// entre los 3 (pedido explícito). Badge oculto del todo si el resultado es 0.
function _evActualizarBadgeFiltros() {
  var badge = document.getElementById('ev-filtro-badge');
  if (!badge) return;
  var n = ['mes', 'lugar', 'tipo'].filter(function(campo) { return _evListaTabFiltro[campo].length > 0; }).length;
  badge.textContent = String(n);
  badge.style.display = n > 0 ? 'flex' : 'none';
}
// Bucket relativo de una fecha futura para los separadores de la pestaña
// "Todos" (ver "Cambios recientes") -- reusa `_formatarFechaRelativa()`
// (js/home.js, ya usada por las cards de "Nueva Reserva" para "Mañana"/
// "Pasado mañana"/"Este Sábado") en vez de reimplementar ese cálculo de
// días acá: se le arma el mismo formato de entrada que espera ("DD de MES")
// y se interpreta su resultado. Esa función no sabe de "Próxima semana" --
// se suma acá como el único bucket nuevo, mismo criterio de semana
// Lunes-Domingo que ya usa esa función para "Este X" (`diasHastaFinDeSemana`).
function _evBucketRelativo(iso) {
  var d = _evParseISO(iso);
  var label = _formatarFechaRelativa(d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()]);
  if (label === 'Mañana') return 'MAÑANA';
  if (label === 'Pasado mañana') return 'PASADO MAÑANA';
  if (/^Este /.test(label)) return null; // resto de esta semana -- sin separador propio, pedido explícito
  return _evEsProximaSemana(iso) ? 'PRÓXIMA SEMANA' : null;
}
// "Próxima semana" = bloque Lunes-Domingo siguiente a la semana actual
// (pedido explícito, semana empieza en lunes) -- la semana actual termina en
// el domingo que viene inclusive (`diasHastaFinDeSemana`, mismo cálculo que
// `_formatarFechaRelativa()`/js/home.js: getDay() 0=domingo).
function _evEsProximaSemana(iso) {
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  var diasHastaFinDeSemana = (7 - hoy.getDay()) % 7;
  var inicioProxima = new Date(hoy); inicioProxima.setDate(inicioProxima.getDate() + diasHastaFinDeSemana + 1);
  var finProxima = new Date(inicioProxima); finProxima.setDate(finProxima.getDate() + 6);
  var d = _evParseISO(iso);
  return d >= inicioProxima && d <= finProxima;
}
// Filtrado 100% en cliente sobre los datos de prueba (Tanda 2) -- la Tanda 3
// reemplaza esto por getEventosFiltrados(estado, meses[], lugares[], tipos[]),
// mismos 3 filtros pero ya con selección múltiple (antes 1 solo valor c/u).
// `direccion` ('izquierda'/'derecha', opcional) -- presente SOLO al venir de
// un cambio real de sub-tab (_evListaTabCambiarSubtab()); ausente en un
// filtro nuevo o la primera carga de la vista, que pintan directo sin
// animar (ver _evListaTabAnimarCambio() más abajo).
function _evListaTabRenderLista(direccion) {
  var hoy = _evHoyISO();
  var fm = _evListaTabFiltro;
  var lista = _EV_EVENTOS.filter(function(e) {
    if (_evListaTabSubtab === 'proximos' && _evFechaCmp(e.fecha, hoy) < 0) return false;
    if (_evListaTabSubtab === 'pasados' && _evFechaCmp(e.fecha, hoy) >= 0) return false;
    if (fm.mes.length && !fm.mes.some(function(o) { return +o.val === _evParseISO(e.fecha).getMonth(); })) return false;
    if (fm.lugar.length && !fm.lugar.some(function(o) { return o.val === e.lugar; })) return false;
    if (fm.tipo.length && !fm.tipo.some(function(o) { return o.val === e.tipo; })) return false;
    return true;
  }).sort(function(a, b) {
    var c = _evFechaCmp(a.fecha, b.fecha);
    return c !== 0 ? c : (a.horaInicio < b.horaInicio ? -1 : a.horaInicio > b.horaInicio ? 1 : 0);
  });

  var cont = document.getElementById('ev-lista-tab-filas');
  if (!cont) return;

  // Sigue pintando UN subtab a la vez (nada de pre-renderizar los 3 en un
  // track de columnas) -- `pintar()` es exactamente lo que hacía antes esta
  // función completa, ahora aislado para poder envolverlo con la transición
  // direccional cuando corresponde (ver _evListaTabAnimarCambio()).
  function pintar() {
    if (lista.length === 0) {
      cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay eventos con estos filtros.</div>';
      return;
    }
    // Subtab "Todos" -- única que mezcla pasados+futuros en una sola lista
    // (ver "Cambios recientes"): suma el separador "HOY" exactamente en el
    // punto cronológico donde termina el bloque de pasados y arranca el de
    // futuros (`lista` ya viene ordenada por fecha/hora, ver el `.sort()` de
    // arriba) -- al principio si TODOS son futuros, al final si TODOS son
    // pasados. `_evListaTabFilaHtml()` atenúa cada fila pasada solo en este
    // subtab (mismo criterio -- en "Pasados" a secas no hay nada con qué
    // contrastar, todo pasado se ve igual de normal que hoy).
    if (_evListaTabSubtab === 'todos') {
      var out = [], insertado = false;
      // Separadores MAÑANA/PASADO MAÑANA/PRÓXIMA SEMANA (ver "Cambios
      // recientes", `_evBucketRelativo()` más abajo) -- a diferencia de HOY
      // (siempre se muestra, marca el punto cronológico exacto aunque no haya
      // ningún evento justo hoy), estos 3 son condicionales: solo aparecen si
      // de verdad hay >=1 evento en ese bucket, por eso se registran en
      // `bucketsMostrados` recién cuando efectivamente se inserta uno.
      var bucketsMostrados = {};
      lista.forEach(function(e) {
        if (!insertado && _evFechaCmp(e.fecha, hoy) >= 0) { out.push('<div class="ev-hoy-separador"><span>HOY</span></div>'); insertado = true; }
        if (_evFechaCmp(e.fecha, hoy) > 0) {
          var bucket = _evBucketRelativo(e.fecha);
          if (bucket && !bucketsMostrados[bucket]) {
            bucketsMostrados[bucket] = true;
            out.push('<div class="ev-hoy-separador"><span>' + bucket + '</span></div>');
          }
        }
        out.push(_evListaTabFilaHtml(e));
      });
      if (!insertado) out.push('<div class="ev-hoy-separador"><span>HOY</span></div>');
      cont.innerHTML = out.join('');
    } else {
      cont.innerHTML = lista.map(_evListaTabFilaHtml).join('');
    }
    _evUpdateRsvpSliders(false);
    _evHidratarAvatares();
  }

  _evAnimarCambioContenido(cont, pintar, direccion);
}
/* ── Transición de contenido REUSABLE para "3 sub-tabs dentro de un único
   contenedor cuyo innerHTML se reemplaza en cada cambio" (Lista: Próximos/
   Pasados/Todos, Calendario: Hoy/Esta semana/Este mes) -- CROSSFADE simple
   (ver "Cambios recientes"), no el slide horizontal shared-axis X de un
   intento anterior. `direccion` ya no afecta la animación en sí (un
   crossfade no tiene "izquierda"/"derecha") -- se conserva el parámetro
   solo como flag de "esto vino de un cambio de tab explícito, animar" vs.
   "vino de un filtro/carga inicial, no animar" (mismo uso que ya tenía),
   para no tener que tocar ningún caller. Nombre genérico a propósito, sin
   prefijo `_evListaTab` -- reusada tal cual por el swipe de Calendario, no
   una implementación aparte.

   Fallback deliberado sobre un intento anterior con slide horizontal (roles
   saliente/entrante calcados de axisTransicion(), ver "Cambios recientes"
   para el diagnóstico completo del bug de solapamiento que esa versión
   corrigió): sin Playwright disponible en este entorno para confirmar
   visualmente que había quedado 100% libre de cualquier rastro de
   solapamiento/parpadeo, se optó por el fallback explícitamente provisto
   para este escenario. Este mecanismo es OTRA cosa, no una versión más del
   fix -- un SWAP SECUENCIAL (fade-out completo -> `pintar()` reemplaza el
   innerHTML -> fade-in) nunca tiene 2 contenidos reales montados/visibles a
   la vez, sin clonar nada ni necesitar un ancestro `position:relative`:
   imposible que se superpongan por construcción, no por la corrección de un
   bug puntual. El indicador de arriba (`.tp-slider`/`.ev-subtabs-indicator`)
   sigue con su propio slide de siempre, sin cambios -- esto aplica solo al
   contenido de abajo. Guard de epoch (propiedad de `cont`, mismo criterio
   que el resto de este archivo) contra que un `pintar()` tardío de una
   llamada vieja pise el contenido que una más nueva ya haya pintado. */
var _EV_CROSSFADE_MS = 130;
function _evAnimarCambioContenido(cont, pintar, direccion) {
  if (!direccion) { pintar(); return; }
  cont._crossfadeEpoch = (cont._crossfadeEpoch || 0) + 1;
  var epoch = cont._crossfadeEpoch;

  cont.style.transition = 'opacity ' + _EV_CROSSFADE_MS + 'ms ease';
  cont.style.opacity = '0';

  setTimeout(function() {
    if (cont._crossfadeEpoch !== epoch) return; // una llamada más nueva ya tomó la posta
    pintar(); // recién ACÁ, con el contenido viejo ya invisible del todo
    cont.style.transition = 'none';
    cont.style.opacity = '0';
    // Doble rAF, mismo motivo que en el resto de este archivo: deja que el
    // navegador pinte el "desde" (contenido nuevo a opacity:0) antes de
    // animarlo a 1 -- si no, no hay transición real que ver.
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (cont._crossfadeEpoch !== epoch) return;
        cont.style.transition = 'opacity ' + _EV_CROSSFADE_MS + 'ms ease';
        cont.style.opacity = '1';
      });
    });
  }, _EV_CROSSFADE_MS);
}
// Una fila: futuro reusa la card COMPLETA (_evCardEventoHtml(), mismo
// componente que Semana/Calendario -- pedido explícito, un solo componente
// de card en las 3 vistas, no una fila resumida aparte); pasado usa una fila
// compacta propia (esta vista sí necesita ver muchos eventos pasados de
// un vistazo, y ni la barra de RSVP ni "quién asiste" tienen sentido para
// algo que ya ocurrió) -- Finalizado suma el chip de asistencia real
// (`miAsistenciaReal`, "Sin registrar" si falta el dato, ver
// _EV_ASISTENCIA_REAL_BADGE) para cualquier evento pasado (fecha < hoy,
// aunque el backend todavía no lo haya marcado Finalizado -- mismo criterio
// que _evEsPasado()/_evRsvpBarraHtml() más arriba, ya resuelve el TODO de
// abajo); Cancelado/No se entrena no tiene "asistencia" que mostrar ahí, y
// ya no suma un chevron tampoco (ver "Cambios recientes" -- eliminado de las
// 3 vistas, `.ev-card-compacta` entera ya es tocable). `sufijo='-lt'` en la
// card completa evita colisión de ids con la misma card ya renderizada en
// `#ev-lista` (Semana/Calendario, sufijo '') si el usuario ya visitó ambas
// vistas.
function _evListaTabFilaHtml(e) {
  var hoy = _evHoyISO();
  if (_evFechaCmp(e.fecha, hoy) >= 0) return _evCardEventoHtml(e, '-lt');
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var d = _evParseISO(e.fecha);
  var fechaTxt = d.getDate() + ' ' + NOMBRES_MESES[d.getMonth()].slice(0, 3).toLowerCase();
  var trailing = '';
  if (e.estado !== 'Cancelado' && e.estado !== 'No se entrena') {
    var estadoReal = e.miAsistenciaReal || 'Sin registrar';
    var clase = _EV_ASISTENCIA_REAL_BADGE[estadoReal] || 'badge-sin-registrar';
    var label = _EV_ASISTENCIA_REAL_LABEL[estadoReal] || estadoReal;
    trailing = '<span class="badge ' + clase + '">' + label + '</span>';
  }
  var atenuado = _evListaTabSubtab === 'todos' ? ' ev-pasado-atenuado' : '';
  return '<div class="ev-card-compacta-wrap' + atenuado + '">' +
    '<div class="ev-card-compacta" onclick="abrirEvDetalle(\'' + e.id + '\')">' +
      '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
      '<div class="ev-card-compacta-info">' +
        '<div class="ev-card-compacta-titulo">' + e.lugar + '</div>' +
        '<div class="ev-card-compacta-sub">' + fechaTxt + ' · ' + e.horaInicio + '</div>' +
      '</div>' +
      trailing +
    '</div>' +
  '</div>';
}

/* ── Detalle de un evento, desde la pestaña "Lista" (bottom sheet real --
   acá sí aplica el patrón _overlayStack/porGesto, ver convención "Cierre de
   overlays vía historial" en MANIFEST.md) ────────────────────────────── */
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
  // offsetHeight de una pantalla display:none da 0 -- mismo problema que
  // _evUpdateSubtabIndicator()/_evUpdateRsvpSliders() (ver esas notas más
  // arriba), se mide recién una vez que ir() ya volvió visible la pantalla.
  setTimeout(_evDetalleActualizarSticky, 50);
}
// Sticky de 3 niveles apilados (ver "Cambios recientes"): nav+pills (ya
// sticky por CSS, top:0) -> barra de RSVP -> grid de 4 tarjetas de
// estadística, cada uno pegado justo debajo del anterior. El `top` de los
// niveles 2 y 3 se calcula acá a partir de `offsetHeight` REAL del nivel
// anterior (nunca un valor fijo) -- así un contenido más alto de lo normal
// en cualquier nivel (ej. el nombre del lugar de la pill "Lugar" envolviendo
// a 2 líneas, dentro del nivel 1) empuja correctamente a los niveles
// siguientes sin superponerse ni dejar hueco. Se re-llama después de
// cualquier render que pueda cambiar la altura de los niveles 1/2 (abrir un
// evento nuevo, o el viewport cambiando de tamaño/orientación).
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
  if (rsvpCont) { rsvpCont.innerHTML = _evRsvpBarraHtml(ev); _evUpdateRsvpSliders(false); }
  _evRenderDetalleAsistencia(ev);
}
// Nav compacta sticky (ver "Cambios recientes" -- reemplaza el #top-bar
// genérico para esta pantalla, ver TOP_BAR_CONFIG/js/ui.js): flecha atrás
// (mismo `.app-nav-back` reusado, con su propio onclick acá ya que no hay
// #top-bar detrás que se lo dé) + ícono de tipo SUELTO (sin el cuadrado de
// fondo de `.ev-detalle-icon-grande` -- pedido explícito: no competir
// visualmente con el botón circular de la flecha) + tipo/fecha-hora, más la
// fila de pills Inicio (violeta)/Lugar (roja, clickeable → Maps). El resto
// (Fin/Duración, descripción, RSVP, stats, lista) queda en _evDetalleInfoHtml(),
// afuera de este bloque, scrollea libre.
function _evDetalleStickyHtml(ev) {
  var mapsUrl = _EV_MAPS_URL_POR_LUGAR[ev.lugar];
  return '<div class="ev-detalle-nav-row">' +
      '<button class="app-nav-back" onclick="volver(\'s-eventos\')" title="Volver"><span class="material-symbols-outlined">arrow_back</span></button>' +
      '<span class="material-symbols-outlined ev-detalle-nav-icono">' + (_EV_ICONOS[ev.tipo] || 'event') + '</span>' +
      '<div class="ev-detalle-nav-texto">' +
        '<div class="ev-detalle-tipo">' + ev.tipo + '</div>' +
        '<div class="ev-detalle-fechahora">' + _evFechaCompleta(ev.fecha) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ev-detalle-pills-row-sticky">' +
      '<span class="ev-detalle-pill-sm ev-detalle-pill-inicio"><span class="material-symbols-outlined">schedule</span>' + ev.horaInicio + 'hs</span>' +
      (mapsUrl
        ? '<a class="ev-detalle-pill-sm ev-detalle-pill-lugar" href="' + mapsUrl + '" target="_blank" rel="noopener"><span class="material-symbols-outlined">location_on</span>' + ev.lugar + '</a>'
        : '<span class="ev-detalle-pill-sm ev-detalle-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + ev.lugar + '</span>') +
    '</div>';
}
function _evDetalleInfoHtml(ev) {
  var desc = _EV_DESCRIPCION_POR_TIPO[ev.tipo];
  return '<div class="ev-detalle-pills-row">' +
      '<span class="ev-detalle-pill-sm"><span class="material-symbols-outlined">flag</span>Fin ' + _evHoraFin(ev) + 'hs</span>' +
      '<span class="ev-detalle-pill-sm"><span class="material-symbols-outlined">timer</span>' + _evDuracionTexto(ev) + '</span>' +
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
