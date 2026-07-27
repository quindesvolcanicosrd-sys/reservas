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

var _EV_ICONOS = { 'Entrenamiento': 'directions_run', 'Torneo': 'emoji_events', 'Asamblea': 'groups' };
var _EV_DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
var _EV_DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// "Más información" de la card (ver _evMasInfoHtml() más abajo) -- Tanda 2
// deriva mapsUrl/duración/descripción por lugar/tipo en vez de pedirle a
// cada evento de prueba sus propios 4 campos repetidos; la Tanda 3 los
// reemplaza por columnas reales de Venues (mapsUrl/horaFin/duración/
// descripción por evento, no por lugar/tipo genérico como acá).
var _EV_MAPS_URL_POR_LUGAR = {
  'Parque La Carolina': 'https://www.google.com/maps/search/?api=1&query=Parque+La+Carolina+Quito',
  'Coliseo Rumiñahui': 'https://www.google.com/maps/search/?api=1&query=Coliseo+Rumi%C3%B1ahui+Quito',
  'Sede Quindes Volcánicos': 'https://www.google.com/maps/search/?api=1&query=Quindes+Volc%C3%A1nicos+Quito',
  'Pista Bicentenario': 'https://www.google.com/maps/search/?api=1&query=Parque+Bicentenario+Quito'
};
var _EV_DURACION_MIN_POR_TIPO = { 'Entrenamiento': 90, 'Torneo': 180, 'Asamblea': 60 };
var _EV_DESCRIPCION_POR_TIPO = {
  'Entrenamiento': 'Entrenamiento regular del equipo. Trae tus patines y protecciones completas.',
  'Torneo': 'Competencia oficial. Revisá el reglamento y llegá con anticipación para el registro.',
  'Asamblea': 'Reunión general del equipo para tratar temas administrativos y de organización.'
};

var _EV_RESP_ICONO  = { 'Asistiré': 'check_circle', 'No asistiré': 'cancel', 'No jugador': 'visibility' };
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
// Color sólido del indicador de la barra segmentada de RSVP (ver
// _evRsvpBarraHtml() más abajo) por opción -- fijos, independientes del
// color de énfasis (mismo criterio que el resto de esta pantalla: "Asistiré"
// tiene que seguir leyéndose verde pase lo que pase con --brand). Variantes
// "dark" (no el token base --success/--warning) para que el texto blanco de
// encima tenga contraste suficiente sobre el indicador sólido.
var _EV_RSVP_COLOR = { 'Asistiré': 'var(--success-dark)', 'No asistiré': 'var(--danger)', 'No jugador': 'var(--amber-dark)' };

var _evVista = 'semana';
var _evSemanaOffset = 0;
var _evMesOffset = 0;
var _evConfettiMostrado = {};

/* ── Utilidades de fecha (sin dependencias externas) ─────────────────── */
function _evPad(n) { return n < 10 ? '0' + n : '' + n; }
function _evToISO(d) { return d.getFullYear() + '-' + _evPad(d.getMonth() + 1) + '-' + _evPad(d.getDate()); }
function _evParseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function _evSumarDias(iso, n) { var d = _evParseISO(iso); d.setDate(d.getDate() + n); return _evToISO(d); }
function _evHoyISO() { return _evToISO(new Date()); }
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
    { id: 'EVT-12', fecha: _evSumarDias(hoy, -24), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Finalizado', miEstado: null, asistentes: [] }
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
  _evVista = 'semana'; _evSemanaOffset = 0; _evMesOffset = 0;
  document.getElementById('ev-vista-semana').classList.add('active');
  document.getElementById('ev-vista-calendario').classList.remove('active');
  document.getElementById('ev-vista-lista').classList.remove('active');
  document.getElementById('ev-vista-semana-wrap').style.display = 'block';
  document.getElementById('ev-vista-calendario-wrap').style.display = 'none';
  document.getElementById('ev-vista-lista-wrap').style.display = 'none';
  document.getElementById('ev-lista').style.display = 'block';
  var addBtn = document.getElementById('eventos-btn-add');
  if (addBtn) addBtn.style.display = _esAdminDemo ? 'flex' : 'none';
  _evRenderVistaActual();
  volver('s-eventos');
  // Igual criterio que _updateTpSlider()/_adminUpdateFiltroSlider() (js/reservas.js,
  // js/admin.js): offsetWidth/offsetLeft del tp-opt activo solo son reales una
  // vez que la pantalla es visible -- se recalcula sin animar apenas lo es.
  setTimeout(function() { _evUpdateVistaSlider(false); _evUpdateRsvpSliders(false); }, 50);
}

/* ── Selector Semana/Calendario/Lista (reusa .tp-seg/.tp-slider/.tp-opt) ──
   "Lista" fusiona lo que antes era la pantalla separada "Ver todos los
   eventos" (ver "Cambios recientes") -- #ev-lista (el combinado evento+
   cumpleaños de Semana/Calendario) se oculta mientras "Lista" está activa,
   ninguna de las 2 vistas usa el contenedor de la otra. */
function _evCambiarVista(v) {
  _evVista = v;
  document.getElementById('ev-vista-semana').classList.toggle('active', v === 'semana');
  document.getElementById('ev-vista-calendario').classList.toggle('active', v === 'calendario');
  document.getElementById('ev-vista-lista').classList.toggle('active', v === 'lista');
  document.getElementById('ev-vista-semana-wrap').style.display = v === 'semana' ? 'block' : 'none';
  document.getElementById('ev-vista-calendario-wrap').style.display = v === 'calendario' ? 'block' : 'none';
  document.getElementById('ev-vista-lista-wrap').style.display = v === 'lista' ? 'block' : 'none';
  document.getElementById('ev-lista').style.display = v === 'lista' ? 'none' : 'block';
  _evUpdateVistaSlider(true);
  if (v === 'lista') { _evListaTabPoblarFiltros(); _evActualizarBotonesFiltro(); _evListaTabRenderLista(); }
  else _evRenderVistaActual();
}
function _evUpdateVistaSlider(animate) {
  var slider = document.getElementById('ev-vista-slider');
  var activeOpt = document.getElementById('ev-vista-' + _evVista);
  if (!slider || !activeOpt) return;
  slider.classList.toggle('animado', !!animate);
  slider.style.width = activeOpt.offsetWidth + 'px';
  slider.style.transform = 'translateX(' + activeOpt.offsetLeft + 'px)';
}
function _evRenderVistaActual() {
  if (_evVista === 'semana') _evRenderSemana(); else _evRenderCalendario();
  _evRenderLista();
}
function _evSemanaAnterior() { _evSemanaOffset--; _evRenderVistaActual(); }
function _evSemanaSiguiente() { _evSemanaOffset++; _evRenderVistaActual(); }
function _evMesAnterior() { _evMesOffset--; _evRenderVistaActual(); }
function _evMesSiguiente() { _evMesOffset++; _evRenderVistaActual(); }

/* ── Consultas sobre los datos de prueba (idénticas a como se filtrarían
   los datos reales de getEventosRango()/getCumpleañosRango()) ──────────── */
function _evEventosDeFecha(iso) { return _EV_EVENTOS.filter(function(e) { return e.fecha === iso; }); }
function _evCumpleDeFecha(iso) { return _EV_CUMPLEANOS.filter(function(c) { return c.fecha === iso; }); }

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
      '<div class="ev-dia-num">' + d.getDate() + '</div>' +
      '<div class="ev-dia-dots">' +
        (tieneEv ? '<span class="ev-dot" onclick="_evScrollAFecha(\'' + iso + '\')"></span>' : '') +
        (tieneCumple ? '<span class="ev-dot-cumple" onclick="_evScrollAFecha(\'' + iso + '\')"></span>' : '') +
      '</div>' +
    '</div>';
  });
  var cont = document.getElementById('ev-semana-dias');
  if (cont) cont.innerHTML = html;
}

/* ── Vista Calendario (grilla mensual tipo Google Calendar) ──────────── */
function _evRenderCalendario() {
  var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + _evMesOffset);
  var year = base.getFullYear(), month = base.getMonth();
  var inicioGrid = _evLunesDeSemana(new Date(year, month, 1));
  var finMes = new Date(year, month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes);
  finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var iso = _evToISO(cur);
    var ajeno = cur.getMonth() !== month;
    var esHoy = iso === hoy;
    var tieneEv = _evEventosDeFecha(iso).length > 0;
    var tieneCumple = _evCumpleDeFecha(iso).length > 0;
    html += '<div class="ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (esHoy ? ' ev-dia-hoy' : '') + '">' +
      '<div class="ev-cal-num">' + cur.getDate() + '</div>' +
      '<div class="ev-cal-dots">' +
        (tieneEv ? '<span class="ev-dot" onclick="_evScrollAFecha(\'' + iso + '\')"></span>' : '') +
        (tieneCumple ? '<span class="ev-dot-cumple" onclick="_evScrollAFecha(\'' + iso + '\')"></span>' : '') +
      '</div>' +
    '</div>';
    cur.setDate(cur.getDate() + 1);
  }
  var grid = document.getElementById('ev-cal-grid');
  if (grid) grid.innerHTML = html;
  var label = document.getElementById('ev-cal-mes-label');
  if (label) label.textContent = NOMBRES_MESES[month] + ' ' + year;
}

/* ── Lista de cards (debajo de cualquiera de las 2 vistas) ────────────
   Siempre TODOS los eventos + cumpleaños del rango visible (semana o mes
   completo, no solo el día tocado) — tocar un dot solo hace scroll-anchor
   hasta el grupo de esa fecha dentro de esta misma lista. */
function _evRangoActual() {
  if (_evVista === 'semana') {
    var dias = _evDiasDeSemana(_evSemanaOffset);
    return { desde: _evToISO(dias[0]), hasta: _evToISO(dias[6]) };
  }
  var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + _evMesOffset);
  var ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { desde: _evToISO(new Date(base.getFullYear(), base.getMonth(), 1)), hasta: _evToISO(ultimo) };
}
function _evFechaLabel(iso) {
  var hoy = _evHoyISO();
  if (iso === hoy) return 'Hoy';
  if (iso === _evSumarDias(hoy, 1)) return 'Mañana';
  if (iso === _evSumarDias(hoy, -1)) return 'Ayer';
  var d = _evParseISO(iso);
  return _EV_DIAS_LARGOS[d.getDay()] + ' ' + d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()].toLowerCase();
}
function _evRenderLista() {
  var rango = _evRangoActual();
  var items = [];
  _EV_EVENTOS.filter(function(e) { return e.fecha >= rango.desde && e.fecha <= rango.hasta; })
    .forEach(function(e) { items.push({ fecha: e.fecha, orden: e.horaInicio || '00:00', tipo: 'evento', data: e }); });
  _EV_CUMPLEANOS.filter(function(c) { return c.fecha >= rango.desde && c.fecha <= rango.hasta; })
    .forEach(function(c) { items.push({ fecha: c.fecha, orden: '00:00', tipo: 'cumple', data: c }); });
  items.sort(function(a, b) { var ka = a.fecha + a.orden, kb = b.fecha + b.orden; return ka < kb ? -1 : ka > kb ? 1 : 0; });

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
      if (el) lanzarConfetti(el);
    });
  });
}
function _evScrollAFecha(iso) {
  var el = document.getElementById('ev-fecha-' + iso);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Card de evento (usuario o admin según _esAdminDemo) ──────────────
   `sufijo` namespacea los ids internos cuando la misma card se re-renderiza
   en más de un contenedor a la vez (lista de Eventos vs. sheet de detalle
   de la pestaña "Lista", ver abrirEvDetalle()) -- evita ids duplicados en el DOM. */
function _evCardEventoHtml(e, sufijo) {
  sufijo = sufijo || '';
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var estadoNota = '';
  if (e.estado === 'Cancelado') estadoNota = '<div class="ev-card-estado-nota">Cancelado</div>';
  else if (e.estado === 'No se entrena') estadoNota = '<div class="ev-card-estado-nota">No se entrena</div>';
  var accion = _esAdminDemo ? _evAccionAdminHtml(e) : _evRsvpBarraHtml(e);
  return '<div class="ev-card" id="ev-card-' + e.id + sufijo + '">' +
    '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
    '<div class="ev-card-body">' +
      '<div class="ev-card-titulo">' + e.lugar + '</div>' +
      '<div class="ev-card-sub"><span class="material-symbols-outlined">schedule</span>' + e.horaInicio + ' · ' + e.tipo + '</div>' +
      estadoNota +
      accion +
      _evAvataresRowHtml(e) +
      _evMasInfoHtml(e, sufijo) +
    '</div>' +
  '</div>';
}

/* ── Fila de avatares de quienes marcaron "Asistiré" (e.rsvps, ver
   _evGenerarDemo()) -- hasta 3 superpuestos + "+N más", toda la fila
   tocable (abre la modal de asistencia, ver más abajo). Mismo gate que la
   barra de RSVP: no aplica a eventos cancelados/sin entrenar. Los
   `.avatar-pill--xs` se insertan vacíos (con `data-nombre`) y se hidratan
   después de insertar el HTML en el DOM -- ver _evHidratarAvatares(),
   mismo motivo que _evUpdateRsvpSliders() (offsetWidth/medir necesita que
   el nodo ya exista). */
function _evAvataresRowHtml(e) {
  if (e.estado === 'Cancelado' || e.estado === 'No se entrena') return '';
  var asisten = (e.rsvps || []).filter(function(p) { return p.estado === 'Asistiré'; });
  if (!asisten.length) return '';
  var avatares = asisten.slice(0, 3).map(function(p) {
    return '<div class="avatar-pill avatar-pill--xs ev-avatar-stack-item" data-nombre="' + p.nombre.replace(/"/g, '&quot;') + '"></div>';
  }).join('');
  var resto = asisten.length - 3;
  var masTxt = resto > 0 ? '<span class="ev-avatares-mas">+' + resto + ' más</span>' : '';
  return '<div class="ev-avatares-row" onclick="_evAbrirModalAsistentes(\'' + e.id + '\')">' +
    '<div class="ev-avatares-stack">' + avatares + '</div>' + masTxt +
  '</div>';
}
// Hidrata TODOS los avatares-placeholder visibles a la vez (mismo criterio
// que _evUpdateRsvpSliders()) -- sin foto real todavía en esta tanda (demo),
// siempre cae al fallback de inicial; la Tanda 3 pasa la foto real de cada
// persona si `_EV_EQUIPO_DEMO` la trae.
function _evHidratarAvatares() {
  document.querySelectorAll('.ev-avatar-stack-item[data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, null, el.getAttribute('data-nombre'));
  });
}

/* ── Modal de asistentes (centrada, no bottom sheet -- mismo componente
   .modal-info/.modal-info-card que ya usan las modales "primera vez"
   (modal-info-reserva/modal-info-home, css/global.css), con contenido y
   apertura/cierre propios en vez del mecanismo _yaVioModal()/modalInfoOk()
   de esas -- acá el contenido es dinámico por evento, no un texto fijo que
   se ve "una sola vez". 4 grupos en orden fijo: Asisten/No asisten/No
   jugador/Sin responder -- "Sin responder" son miembros de _EV_EQUIPO_DEMO
   (fuente de nombres del equipo ya usada por "+ Agregar persona", ver
   _evAbrirAgregarPersona() más abajo) sin ninguna entrada en e.rsvps para
   este evento en particular. */
var _EV_GRUPOS_ASISTENCIA = [
  { estado: 'Asistiré', label: 'Asisten' },
  { estado: 'No asistiré', label: 'No asisten' },
  { estado: 'No jugador', label: 'No jugador' }
];
function _evAbrirModalAsistentes(id) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  var rsvps = ev.rsvps || [];
  var titulo = document.getElementById('ev-modal-asistentes-titulo');
  if (titulo) titulo.textContent = 'Asistencia — ' + ev.lugar;
  var html = _EV_GRUPOS_ASISTENCIA.map(function(g) {
    return _evGrupoAsistenciaHtml(g.label, rsvps.filter(function(p) { return p.estado === g.estado; }));
  }).join('');
  var respondieron = {};
  rsvps.forEach(function(p) { respondieron[p.nombre] = true; });
  var sinResponder = _EV_EQUIPO_DEMO.filter(function(n) { return !respondieron[n]; }).map(function(n) { return { nombre: n }; });
  html += _evGrupoAsistenciaHtml('Sin responder', sinResponder);
  var body = document.getElementById('ev-modal-asistentes-body');
  if (body) body.innerHTML = html;
  _evHidratarAvatares();
  var modal = document.getElementById('ev-modal-asistentes');
  if (modal) modal.style.display = 'flex';
  _registrarOverlayAbierto(_evCerrarModalAsistentes);
}
function _evGrupoAsistenciaHtml(label, personas) {
  if (!personas.length) return '';
  var filas = personas.map(function(p) {
    return '<div class="ev-asist-persona"><div class="avatar-pill avatar-pill--xs ev-avatar-stack-item" data-nombre="' + p.nombre.replace(/"/g, '&quot;') + '"></div><span>' + p.nombre + '</span></div>';
  }).join('');
  return '<div class="ev-asist-grupo"><div class="ev-asist-grupo-titulo">' + label + ' (' + personas.length + ')</div>' + filas + '</div>';
}
function _evCerrarModalAsistentes(porGesto) {
  if (!porGesto) { history.back(); return; }
  var modal = document.getElementById('ev-modal-asistentes');
  if (modal) modal.style.display = 'none';
}

/* ── "Más información" (colapsable) -- mismo mecanismo de expandir/
   contraer que ya usa Reservas (.fi-footer/.fi-body, css/reservas.css,
   toggleFechaExpand()/js/reservas.js: max-height 0→N vía una clase en el
   ancestro), con clases propias acá (`.ev-mas-info-*`) en vez de reusar las
   de Reservas tal cual -- .fi-header/.fi-circle/.fecha-item de esa pantalla
   traen supuestos de layout (fila de fecha con checkbox circular) que no
   aplican a una card de evento. Contenido: "Cómo llegar" (mapsUrl por
   lugar), pill de hora de fin + duración (derivadas de horaInicio + tipo,
   ver _EV_DURACION_MIN_POR_TIPO) y la descripción (por tipo, ver
   _EV_DESCRIPCION_POR_TIPO) -- Tanda 3 reemplaza estos 2 mapas genéricos
   por columnas reales por evento. */
function _evHoraFin(e) {
  var min = _EV_DURACION_MIN_POR_TIPO[e.tipo] || 90;
  var p = e.horaInicio.split(':');
  var d = new Date(2000, 0, 1, +p[0], +p[1] + min);
  return _evPad(d.getHours()) + ':' + _evPad(d.getMinutes());
}
function _evDuracionTexto(e) {
  var min = _EV_DURACION_MIN_POR_TIPO[e.tipo] || 90;
  var h = Math.floor(min / 60), m = min % 60;
  return (h ? h + 'h ' : '') + (m ? m + 'min' : '') || '0min';
}
function _evMasInfoHtml(e, sufijo) {
  var mapsUrl = _EV_MAPS_URL_POR_LUGAR[e.lugar];
  var desc = _EV_DESCRIPCION_POR_TIPO[e.tipo];
  var id = 'ev-mas-info-' + e.id + sufijo;
  return '<div class="ev-mas-info" id="' + id + '">' +
    '<div class="ev-mas-info-footer" onclick="_evToggleMasInfo(\'' + id + '\', event)">' +
      '<span class="ev-mas-info-label">Más información</span>' +
      '<span class="material-symbols-outlined ev-mas-info-chevron">expand_more</span>' +
    '</div>' +
    '<div class="ev-mas-info-body"><div class="ev-mas-info-body-inner">' +
      (desc ? '<p class="ev-mas-info-desc">' + desc + '</p>' : '') +
      '<div class="ev-mas-info-pills">' +
        (mapsUrl ? '<a class="ev-mas-info-pill ev-mas-info-pill-maps" href="' + mapsUrl + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><span class="material-symbols-outlined">near_me</span>Cómo llegar</a>' : '') +
        '<span class="ev-mas-info-pill"><span class="material-symbols-outlined">schedule</span>Fin ' + _evHoraFin(e) + '</span>' +
        '<span class="ev-mas-info-pill"><span class="material-symbols-outlined">timer</span>' + _evDuracionTexto(e) + '</span>' +
      '</div>' +
    '</div></div>' +
  '</div>';
}
function _evToggleMasInfo(id, event) {
  if (event) event.stopPropagation();
  var el = document.getElementById(id);
  if (el) el.classList.toggle('abierto');
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
function _evRsvpBarraHtml(e) {
  if (e.estado === 'Cancelado' || e.estado === 'No se entrena' || e.estado === 'Finalizado') return '';
  var botones = _EV_RESP_OPCIONES.map(function(estado) {
    var act = e.miEstado === estado ? ' activa' : '';
    return '<div class="ev-rsvp-opt' + act + '" data-estado="' + estado + '" onclick="_evMarcarAsistencia(\'' + e.id + '\',\'' + estado + '\')"><span class="material-symbols-outlined">' + _EV_RESP_ICONO[estado] + '</span>' + estado + '</div>';
  }).join('');
  return '<div class="ev-asistire-wrap"><div class="ev-rsvp-seg" data-evid="' + e.id + '"><div class="ev-rsvp-slider"></div>' + botones + '</div></div>';
}
// Posiciona el indicador de UNA barra (offsetLeft/offsetWidth de la opción
// .activa, mismo mecanismo que _evUpdateVistaSlider()/.tp-slider) -- `seg` es
// el .ev-rsvp-seg, no el wrapper. Sin opción activa (miEstado null, evento
// recién creado) el indicador queda con opacity:0 (ver CSS), no en (0,0).
function _evPosicionarRsvpSlider(seg, animate) {
  var slider = seg.querySelector('.ev-rsvp-slider');
  if (!slider) return;
  slider.classList.toggle('animado', !!animate);
  var activo = seg.querySelector('.ev-rsvp-opt.activa');
  if (!activo) { slider.style.opacity = '0'; slider.style.width = '0'; return; }
  slider.style.opacity = '1';
  slider.style.width = activo.offsetWidth + 'px';
  slider.style.transform = 'translateX(' + activo.offsetLeft + 'px)';
  slider.style.background = _EV_RSVP_COLOR[activo.getAttribute('data-estado')] || 'var(--brand)';
}
// Reposiciona TODAS las barras visibles -- llamado tras cualquier re-render
// de lista (chevrones, cambio de vista/tab, filtros) y, con setTimeout(50),
// la primera vez que la pantalla se vuelve visible (mismo problema que
// _evUpdateVistaSlider: offsetWidth/offsetLeft de un elemento display:none
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
  ev.miEstado = estado;
  mostrarToast('Marcaste "' + estado + '" para ' + ev.lugar, 'ok', true);
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
  return '<div class="ev-asistentes-list">' +
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
   navegar aparte). Sub-tabs Próximos/Pasados/Todos (subrayado, sin slider
   propio) + 3 filtros (bottom sheet compartido, pills multi-select) + lista
   de cards compactas -- Próximos suma la barra de RSVP compacta por fila
   (mismo componente que las cards de Semana/Calendario), Pasados reemplaza
   el chevron por un chip con la asistencia REAL ya registrada. ═══════════ */
var _evListaTabSubtab = 'proximos';
// Selección multi-valor por filtro -- arrays de {val,label} (no solo el
// valor: "mes" filtra por índice numérico pero el botón/pill muestra el
// nombre del mes, hace falta guardar ambos). Vacío = sin filtro (todos).
var _evListaTabFiltro = { mes: [], lugar: [], tipo: [] };

function _evListaTabPoblarFiltros() {
  // No-op hoy (las opciones se recalculan al abrir cada sheet, ver
  // _evOpcionesFiltro()) -- se mantiene como punto de entrada separado de
  // _evCambiarVista() por si la Tanda 3 necesita precargar algo async acá.
}
function _evListaTabCambiarSubtab(tab) {
  _evListaTabSubtab = tab;
  ['proximos', 'pasados', 'todos'].forEach(function(t) {
    document.getElementById('ev-lista-tab-subtab-' + t).classList.toggle('activo', t === tab);
  });
  _evListaTabRenderLista();
}
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
/* ── Bottom sheet de filtro (Mes/Lugar/Tipo) -- un solo sheet genérico
   reusado para los 3 (repuebla título+pills según _evFiltroSheetCampo, mismo
   criterio que ev-sheet-agregar/admin-sheet-destino más arriba) con pills
   togleadas multi-select (ajTogglePill(), js/perfil.js -- toggle simple de
   `.activa`, sin exclusividad) en vez de una lista de selección única. ── */
var _evFiltroSheetCampo = null;
var _EV_FILTRO_TITULOS = { mes: 'Mes', lugar: 'Lugar', tipo: 'Tipo' };
function _evAbrirSheetFiltro(campo) {
  _evFiltroSheetCampo = campo;
  var opciones = _evOpcionesFiltro(campo);
  var seleccion = _evListaTabFiltro[campo];
  document.getElementById('ev-sheet-filtro-title').textContent = _EV_FILTRO_TITULOS[campo];
  document.getElementById('ev-sheet-filtro-pills').innerHTML = opciones.map(function(o) {
    var sel = seleccion.some(function(s) { return s.val === o.val; });
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o.val.replace(/"/g, '&quot;') + '" data-label="' + o.label.replace(/"/g, '&quot;') + '" onclick="ajTogglePill(this)">' + o.label + '</span>';
  }).join('') || '<div style="padding:8px 4px;color:var(--muted);font-size:0.82rem;">Sin opciones todavía.</div>';
  var ov = document.getElementById('ev-sheet-filtro-overlay');
  var sh = document.getElementById('ev-sheet-filtro');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(_evCerrarSheetFiltro);
}
function _evCerrarSheetFiltro(porGesto) {
  if (!porGesto) { history.back(); return; }
  // La selección se aplica acá (al cerrar, sea por "Listo", tocar el overlay
  // o gesto de volver) -- no en cada toque de pill, para no re-renderizar la
  // lista completa en cada toggle mientras el sheet sigue abierto.
  if (_evFiltroSheetCampo) {
    var vals = [];
    document.querySelectorAll('#ev-sheet-filtro-pills .aj-pill.activa').forEach(function(p) {
      vals.push({ val: p.getAttribute('data-val'), label: p.getAttribute('data-label') });
    });
    _evListaTabFiltro[_evFiltroSheetCampo] = vals;
    _evActualizarBotonesFiltro();
    _evListaTabRenderLista();
  }
  var sh = document.getElementById('ev-sheet-filtro');
  var ov = document.getElementById('ev-sheet-filtro-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
// Texto de cada botón trigger: label default sin selección, el nombre único
// si hay exactamente 1, o "Label (N)" si hay más de 1 -- pedido explícito.
function _evActualizarBotonesFiltro() {
  ['mes', 'lugar', 'tipo'].forEach(function(campo) {
    var btn = document.getElementById('ev-lista-tab-filtro-btn-' + campo);
    if (!btn) return;
    var label = btn.getAttribute('data-label');
    var sel = _evListaTabFiltro[campo];
    var txt = sel.length === 0 ? label : sel.length === 1 ? sel[0].label : label + ' (' + sel.length + ')';
    btn.querySelector('.ev-filtro-trigger-label').textContent = txt;
    btn.classList.toggle('ev-filtro-activo', sel.length > 0);
  });
}
// Filtrado 100% en cliente sobre los datos de prueba (Tanda 2) -- la Tanda 3
// reemplaza esto por getEventosFiltrados(estado, meses[], lugares[], tipos[]),
// mismos 3 filtros pero ya con selección múltiple (antes 1 solo valor c/u).
function _evListaTabRenderLista() {
  var hoy = _evHoyISO();
  var fm = _evListaTabFiltro;
  var lista = _EV_EVENTOS.filter(function(e) {
    if (_evListaTabSubtab === 'proximos' && e.fecha < hoy) return false;
    if (_evListaTabSubtab === 'pasados' && e.fecha >= hoy) return false;
    if (fm.mes.length && !fm.mes.some(function(o) { return +o.val === _evParseISO(e.fecha).getMonth(); })) return false;
    if (fm.lugar.length && !fm.lugar.some(function(o) { return o.val === e.lugar; })) return false;
    if (fm.tipo.length && !fm.tipo.some(function(o) { return o.val === e.tipo; })) return false;
    return true;
  }).sort(function(a, b) { var ka = a.fecha + a.horaInicio, kb = b.fecha + b.horaInicio; return ka < kb ? -1 : ka > kb ? 1 : 0; });

  var cont = document.getElementById('ev-lista-tab-filas');
  if (!cont) return;
  if (lista.length === 0) {
    cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay eventos con estos filtros.</div>';
    return;
  }
  cont.innerHTML = lista.map(_evListaTabFilaHtml).join('');
  _evUpdateRsvpSliders(false);
  _evHidratarAvatares();
}
// Una fila: futuro reusa la card COMPLETA (_evCardEventoHtml(), mismo
// componente que Semana/Calendario -- pedido explícito, un solo componente
// de card en las 3 vistas, no una fila resumida aparte); pasado usa una fila
// compacta propia (esta vista sí necesita ver muchos eventos pasados de
// un vistazo, y ni la barra de RSVP ni "quién asiste" tienen sentido para
// algo que ya ocurrió) -- Finalizado reemplaza el chevron por el chip de
// asistencia real (`miAsistenciaReal`, "Sin registrar" si falta el dato,
// ver _EV_ASISTENCIA_REAL_BADGE); Cancelado/No se entrena conserva el
// chevron simple, no hay "asistencia" que mostrar ahí. `sufijo='-lt'` en la
// card completa evita colisión de ids con la misma card ya renderizada en
// `#ev-lista` (Semana/Calendario, sufijo '') si el usuario ya visitó ambas
// vistas. TODO (pendiente de confirmar con Victor, ver brief): qué mostrar
// para eventos pasados que el usuario nunca respondió con RSVP -- ¿un
// control de solo lectura con lo marcado, o se omite? No implementado
// todavía, esta fila hoy solo muestra el chip de asistencia real.
function _evListaTabFilaHtml(e) {
  var hoy = _evHoyISO();
  if (e.fecha >= hoy) return _evCardEventoHtml(e, '-lt');
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var d = _evParseISO(e.fecha);
  var fechaTxt = d.getDate() + ' ' + NOMBRES_MESES[d.getMonth()].slice(0, 3).toLowerCase();
  var trailing;
  if (e.estado === 'Finalizado') {
    var estadoReal = e.miAsistenciaReal || 'Sin registrar';
    var clase = _EV_ASISTENCIA_REAL_BADGE[estadoReal];
    trailing = '<span class="badge' + (clase ? ' ' + clase : '') + '">' + estadoReal + '</span>';
  } else {
    trailing = '<span class="material-symbols-outlined ev-chevron-ver">chevron_right</span>';
  }
  return '<div class="ev-card-compacta-wrap">' +
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
function abrirEvDetalle(id) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  var body = document.getElementById('ev-detalle-body');
  if (body) body.innerHTML = _evCardEventoHtml(ev, '-detalle');
  _evHidratarAvatares();
  var ov = document.getElementById('ev-detalle-overlay');
  var sh = document.getElementById('ev-detalle-sheet');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; _evUpdateRsvpSliders(false); }); }); }
  _registrarOverlayAbierto(cerrarEvDetalle);
}
function cerrarEvDetalle(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('ev-detalle-sheet');
  var ov = document.getElementById('ev-detalle-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
