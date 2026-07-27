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

var _EV_RESP_BADGE  = { 'Asistiré': 'badge-confirmada', 'No asistiré': 'badge-cancelada', 'Tal vez': 'badge-pendiente' };
var _EV_RESP_ICONO  = { 'Asistiré': 'check_circle', 'No asistiré': 'cancel', 'Tal vez': 'help' };
var _EV_CHIP_BADGE  = { 'A tiempo': 'badge-confirmada', 'Tarde': 'badge-pendiente', 'Ausente': 'badge-cancelada' };

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
    { id: 'EVT-1', fecha: _evSumarDias(hoy, -10), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Finalizado', miEstado: 'Asistiré',
      asistentes: [{ nombre: 'Andrea Vélez', estado: 'A tiempo' }, { nombre: 'Bruno Salazar', estado: 'Tarde' }, { nombre: 'Camila Torres', estado: 'Ausente' }] },
    { id: 'EVT-2', fecha: _evSumarDias(hoy, -3), horaInicio: '19:00', lugar: 'Coliseo Rumiñahui', tipo: 'Entrenamiento', estado: 'Finalizado', miEstado: null,
      asistentes: [{ nombre: 'Diego Ramírez', estado: 'A tiempo' }] },
    { id: 'EVT-3', fecha: _evSumarDias(hoy, -1), horaInicio: '18:30', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Cancelado', miEstado: null, asistentes: [] },
    { id: 'EVT-4', fecha: hoy, horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'Evento Programado', miEstado: null, asistentes: [] },
    { id: 'EVT-5', fecha: _evSumarDias(hoy, 1), horaInicio: '19:00', lugar: 'Coliseo Rumiñahui', tipo: 'Entrenamiento', estado: 'Evento Programado', miEstado: 'Tal vez', asistentes: [] },
    { id: 'EVT-6', fecha: _evSumarDias(hoy, 3), horaInicio: '10:00', lugar: 'Sede Quindes Volcánicos', tipo: 'Asamblea', estado: 'Evento Programado', miEstado: null, asistentes: [] },
    { id: 'EVT-7', fecha: _evSumarDias(hoy, 4), horaInicio: '18:00', lugar: 'Parque La Carolina', tipo: 'Entrenamiento', estado: 'No se entrena', miEstado: null, asistentes: [] },
    { id: 'EVT-8', fecha: _evSumarDias(hoy, 6), horaInicio: '09:00', lugar: 'Pista Bicentenario', tipo: 'Torneo', estado: 'Evento Programado', miEstado: null, asistentes: [] },
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
  document.getElementById('ev-vista-semana-wrap').style.display = 'block';
  document.getElementById('ev-vista-calendario-wrap').style.display = 'none';
  var addBtn = document.getElementById('eventos-btn-add');
  if (addBtn) addBtn.style.display = _esAdminDemo ? 'flex' : 'none';
  _evRenderVistaActual();
  volver('s-eventos');
  // Igual criterio que _updateTpSlider()/_adminUpdateFiltroSlider() (js/reservas.js,
  // js/admin.js): offsetWidth/offsetLeft del tp-opt activo solo son reales una
  // vez que la pantalla es visible -- se recalcula sin animar apenas lo es.
  setTimeout(function() { _evUpdateVistaSlider(false); }, 50);
}

/* ── Selector Semana/Calendario (reusa .tp-seg/.tp-slider/.tp-opt) ────── */
function _evCambiarVista(v) {
  _evVista = v;
  document.getElementById('ev-vista-semana').classList.toggle('active', v === 'semana');
  document.getElementById('ev-vista-calendario').classList.toggle('active', v === 'calendario');
  document.getElementById('ev-vista-semana-wrap').style.display = v === 'semana' ? 'block' : 'none';
  document.getElementById('ev-vista-calendario-wrap').style.display = v === 'calendario' ? 'block' : 'none';
  _evUpdateVistaSlider(true);
  _evRenderVistaActual();
}
function _evUpdateVistaSlider(animate) {
  var slider = document.getElementById('ev-vista-slider');
  var activeOpt = document.getElementById(_evVista === 'semana' ? 'ev-vista-semana' : 'ev-vista-calendario');
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
  // Confetti contenido dentro de la card, una sola vez por cumpleaños/sesión
  // (ver _EV_CONFETTI_MOSTRADO) -- si no, re-renders sin relación (navegar
  // semanas, marcar asistencia en otro evento del mismo rango) lo re-disparían
  // en cada innerHTML nuevo, no solo "al aparecer" la primera vez.
  ordenFechas.forEach(function(fecha) {
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
   de "Ver todos", ver abrirEvDetalle()) -- evita ids duplicados en el DOM. */
function _evCardEventoHtml(e, sufijo) {
  sufijo = sufijo || '';
  var icono = _EV_ICONOS[e.tipo] || 'event';
  var estadoNota = '';
  if (e.estado === 'Cancelado') estadoNota = '<div class="ev-card-estado-nota">Cancelado</div>';
  else if (e.estado === 'No se entrena') estadoNota = '<div class="ev-card-estado-nota">No se entrena</div>';
  var accion = _esAdminDemo ? _evAccionAdminHtml(e) : _evAccionUsuarioHtml(e, sufijo);
  return '<div class="ev-card" id="ev-card-' + e.id + sufijo + '">' +
    '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
    '<div class="ev-card-body">' +
      '<div class="ev-card-titulo">' + e.lugar + '</div>' +
      '<div class="ev-card-sub"><span class="material-symbols-outlined">schedule</span>' + e.horaInicio + ' · ' + e.tipo + '</div>' +
      estadoNota +
      accion +
    '</div>' +
  '</div>';
}

/* ── Variante usuario: "¿Asistiré?" → 3 opciones inline (fade) ───────── */
function _evAccionUsuarioHtml(e, sufijo) {
  sufijo = sufijo || '';
  var key = e.id + sufijo;
  if (e.estado === 'Cancelado' || e.estado === 'No se entrena' || e.estado === 'Finalizado') return '';
  if (e.miEstado) {
    return '<div class="ev-asistire-wrap"><div class="ev-mi-respuesta" id="ev-mi-respuesta-' + key + '">' +
      '<span class="badge ' + _EV_RESP_BADGE[e.miEstado] + ' ev-mi-respuesta-pill"><span class="material-symbols-outlined" style="font-size:13px;">' + _EV_RESP_ICONO[e.miEstado] + '</span>' + e.miEstado + '</span>' +
      '<button class="ev-cambiar-respuesta" onclick="_evToggleOpciones(\'' + e.id + '\',\'' + sufijo + '\')">Cambiar</button>' +
    '</div><div id="ev-opciones-' + key + '" style="display:none;"></div></div>';
  }
  return '<div class="ev-asistire-wrap">' +
    '<button class="ev-btn-asistire" id="ev-btn-asistire-' + key + '" onclick="_evToggleOpciones(\'' + e.id + '\',\'' + sufijo + '\')">¿Asistiré?</button>' +
    '<div id="ev-opciones-' + key + '" style="display:none;"></div>' +
  '</div>';
}
function _evToggleOpciones(id, sufijo) {
  sufijo = sufijo || '';
  var key = id + sufijo;
  var wrap = document.getElementById('ev-opciones-' + key);
  if (!wrap) return;
  var abierto = wrap.style.display !== 'none' && wrap.innerHTML !== '';
  var btn = document.getElementById('ev-btn-asistire-' + key);
  if (abierto) { wrap.style.display = 'none'; wrap.innerHTML = ''; if (btn) btn.style.display = ''; return; }
  wrap.innerHTML = '<div class="ev-opciones-asistencia">' +
    '<button class="ev-opcion-asistencia ev-op-si" onclick="_evMarcarAsistencia(\'' + id + '\',\'Asistiré\',\'' + sufijo + '\')"><span class="material-symbols-outlined">check_circle</span>Asistiré</button>' +
    '<button class="ev-opcion-asistencia ev-op-no" onclick="_evMarcarAsistencia(\'' + id + '\',\'No asistiré\',\'' + sufijo + '\')"><span class="material-symbols-outlined">cancel</span>No asistiré</button>' +
    '<button class="ev-opcion-asistencia ev-op-tal-vez" onclick="_evMarcarAsistencia(\'' + id + '\',\'Tal vez\',\'' + sufijo + '\')"><span class="material-symbols-outlined">help</span>Tal vez</button>' +
  '</div>';
  wrap.style.display = 'block';
  if (btn) btn.style.display = 'none';
}
// Tanda 2 (demo, sin backend): solo actualiza el array local. La Tanda 3
// reemplaza el cuerpo por marcarAsistenciaUsuario(nombre, idEvento, estado)
// (apiPost) + las reglas de negocio de perfil (Mirlxs/Quindes, ver brief).
function _evMarcarAsistencia(id, estado, sufijo) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  ev.miEstado = estado;
  mostrarToast('Marcaste "' + estado + '" para ' + ev.lugar, 'ok', true);
  _evRenderLista();
  if (document.getElementById('ev-todos-lista')) _evTodosRenderLista();
  var detalleBody = document.getElementById('ev-detalle-body');
  if (detalleBody && detalleBody.innerHTML.indexOf('ev-card-' + ev.id + '-detalle') !== -1) {
    detalleBody.innerHTML = _evCardEventoHtml(ev, '-detalle');
  }
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
   PANTALLA "VER TODOS LOS ENTRENAMIENTOS" (s-eventos-todos)
   Pantalla principal más (ir()/volver(), TOP_BAR_CONFIG con volver:'s-eventos'
   -- mismo mecanismo que "Historial de reservas"/s-misreservas, no un
   overlay nuevo: incluso reachable solo desde Eventos, se comporta como
   cualquier otra pantalla → pantalla de la app, con back nativo ya
   cubierto por el listener de popstate genérico, sin necesitar registrar
   nada en _overlayStack para la pantalla en sí (el detalle que abre sí es
   un bottom sheet real, ver abrirEvDetalle() más abajo). ═══════════════ */
var _evTodosTab = 'proximos';

function irEventosTodos() {
  if (_EV_EVENTOS.length === 0) _evGenerarDemo();
  _evTodosTab = 'proximos';
  _evTodosPoblarFiltros();
  ['proximos', 'pasados', 'todos'].forEach(function(t) {
    document.getElementById('ev-todos-tab-' + t).classList.toggle('active', t === 'proximos');
  });
  ir('s-eventos-todos');
  setTimeout(function() { _evTodosUpdateTabSlider(false); _evTodosRenderLista(); }, 50);
}
function _evTodosPoblarFiltros() {
  var meses = {}, lugares = {}, tipos = {};
  _EV_EVENTOS.forEach(function(e) {
    meses[_evParseISO(e.fecha).getMonth()] = true;
    lugares[e.lugar] = true;
    tipos[e.tipo] = true;
  });
  // Etiqueta default corta ("Mes" en vez de "Todos los meses") -- 3 selects
  // uno junto a otro en 390px de ancho no tienen espacio para la versión
  // larga sin truncarse (confirmado con Playwright); el significado de cada
  // select ya es obvio por su posición/las opciones que contiene.
  var selMes = document.getElementById('ev-todos-filtro-mes');
  var htmlM = '<option value="">Mes</option>';
  Object.keys(meses).sort(function(a, b) { return a - b; }).forEach(function(m) { htmlM += '<option value="' + m + '">' + NOMBRES_MESES[m] + '</option>'; });
  if (selMes) selMes.innerHTML = htmlM;

  var selLugar = document.getElementById('ev-todos-filtro-lugar');
  var htmlL = '<option value="">Lugar</option>';
  Object.keys(lugares).sort().forEach(function(l) { htmlL += '<option value="' + l + '">' + l + '</option>'; });
  if (selLugar) selLugar.innerHTML = htmlL;

  var selTipo = document.getElementById('ev-todos-filtro-tipo');
  var htmlT = '<option value="">Tipo</option>';
  Object.keys(tipos).sort().forEach(function(t) { htmlT += '<option value="' + t + '">' + t + '</option>'; });
  if (selTipo) selTipo.innerHTML = htmlT;
}
function _evTodosCambiarTab(tab) {
  _evTodosTab = tab;
  ['proximos', 'pasados', 'todos'].forEach(function(t) { document.getElementById('ev-todos-tab-' + t).classList.toggle('active', t === tab); });
  _evTodosUpdateTabSlider(true);
  _evTodosRenderLista();
}
function _evTodosUpdateTabSlider(animate) {
  var slider = document.getElementById('ev-todos-tab-slider');
  var activeOpt = document.getElementById('ev-todos-tab-' + _evTodosTab);
  if (!slider || !activeOpt) return;
  slider.classList.toggle('animado', !!animate);
  slider.style.width = activeOpt.offsetWidth + 'px';
  slider.style.transform = 'translateX(' + activeOpt.offsetLeft + 'px)';
}
// Filtrado 100% en cliente sobre los datos de prueba (Tanda 2) -- la Tanda 3
// reemplaza esto por getEventosFiltrados(estado, mes, lugar, tipo), que ya
// acepta estos mismos 4 parámetros (ver brief).
function _evTodosRenderLista() {
  var hoy = _evHoyISO();
  var mes = document.getElementById('ev-todos-filtro-mes').value;
  var lugar = document.getElementById('ev-todos-filtro-lugar').value;
  var tipo = document.getElementById('ev-todos-filtro-tipo').value;
  var lista = _EV_EVENTOS.filter(function(e) {
    if (_evTodosTab === 'proximos' && e.fecha < hoy) return false;
    if (_evTodosTab === 'pasados' && e.fecha >= hoy) return false;
    if (mes !== '' && _evParseISO(e.fecha).getMonth() !== +mes) return false;
    if (lugar !== '' && e.lugar !== lugar) return false;
    if (tipo !== '' && e.tipo !== tipo) return false;
    return true;
  }).sort(function(a, b) { var ka = a.fecha + a.horaInicio, kb = b.fecha + b.horaInicio; return ka < kb ? -1 : ka > kb ? 1 : 0; });

  var cont = document.getElementById('ev-todos-lista');
  if (!cont) return;
  if (lista.length === 0) {
    cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">event_busy</span>No hay entrenamientos con estos filtros.</div>';
    return;
  }
  cont.innerHTML = lista.map(function(e) {
    var icono = _EV_ICONOS[e.tipo] || 'event';
    var d = _evParseISO(e.fecha);
    var fechaTxt = d.getDate() + ' ' + NOMBRES_MESES[d.getMonth()].slice(0, 3).toLowerCase();
    return '<div class="ev-card-compacta" onclick="abrirEvDetalle(\'' + e.id + '\')">' +
      '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
      '<div class="ev-card-compacta-info">' +
        '<div class="ev-card-compacta-titulo">' + e.lugar + '</div>' +
        '<div class="ev-card-compacta-sub">' + fechaTxt + ' · ' + e.horaInicio + '</div>' +
      '</div>' +
      '<span class="material-symbols-outlined ev-chevron-ver">chevron_right</span>' +
    '</div>';
  }).join('');
}

/* ── Detalle de un evento, desde "Ver todos" (bottom sheet real -- acá sí
   aplica el patrón _overlayStack/porGesto, ver convención "Cierre de
   overlays vía historial" en MANIFEST.md) ────────────────────────────── */
function abrirEvDetalle(id) {
  var ev = _EV_EVENTOS.filter(function(e) { return e.id === id; })[0];
  if (!ev) return;
  var body = document.getElementById('ev-detalle-body');
  if (body) body.innerHTML = _evCardEventoHtml(ev, '-detalle');
  var ov = document.getElementById('ev-detalle-overlay');
  var sh = document.getElementById('ev-detalle-sheet');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(cerrarEvDetalle);
}
function cerrarEvDetalle(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('ev-detalle-sheet');
  var ov = document.getElementById('ev-detalle-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
