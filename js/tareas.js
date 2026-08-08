// Sección Tareas — backend Apps Script ya desplegado (getTareasDisponibles/
// getMisTareas/getConfigTareas/tomarTarea/soltarTarea/rescatarTarea/
// enviarRevisionTarea/adminCrearTarea/adminGetTareasPendientesValidacion/
// adminValidarTarea). Reusa helpers globales ya existentes de otras
// secciones en vez de duplicarlos: _avatarSetFotoOInicial (js/ui.js),
// _evToISO/_evParseISO/_evHoyISO/_evFechaCmp/_evLunesDeSemana/_evCalMesDe/
// _evAntFechaLegible/NOMBRES_MESES/_EV_DIAS_CORTOS (js/eventos.js),
// adminStepperChange/_adminSetStepperValue/adminApi (js/admin.js).

var _tarDisponibles = [];
var _tarBaul = [];
var _tarMisTareas = [];
var _tarConfig = { limiteTareasActivas: null };
var _tarCargaId = 0;
var _tarTabActual = 'disponibles';
var _tarBaulAbierto = false;
var _tarPendientesValidacion = [];

var _TAR_ICONOS_AREA = {
  'Logística': 'inventory_2',
  'Entrenamientos': 'sports_gymnastics',
  'Eventos': 'event',
  'Finanzas': 'payments',
  'Mantenimiento': 'build',
  'Redes Sociales y Comunicación': 'campaign',
  'Reclutamiento': 'group_add'
};

/* ── Entrada de la sección (APP_BOTTOM_NAV_ITEMS, js/ui.js) ───────────── */
function irTareas() {
  _tarTabActual = 'disponibles';
  var optD = document.getElementById('tar-opt-disponibles');
  var optM = document.getElementById('tar-opt-mis');
  if (optD) optD.classList.add('active');
  if (optM) optM.classList.remove('active');
  var panelD = document.getElementById('tar-tab-disponibles');
  var panelM = document.getElementById('tar-tab-mis');
  if (panelD) panelD.style.display = 'block';
  if (panelM) panelM.style.display = 'none';
  ir('s-tareas');
  setTimeout(function() { _tarUpdateSlider(false); }, 50);
  _tarCargarTodo();
}

/* ── Pill-toggle "Disponibles / Mis tareas" -- mismo componente .tp-seg/
   .tp-slider/.tp-opt que "Por clase/Mensual" (css/reservas.css). ──────── */
function _tarCambiarTab(tab) {
  if (_tarTabActual === tab) return;
  _tarTabActual = tab;
  var optD = document.getElementById('tar-opt-disponibles');
  var optM = document.getElementById('tar-opt-mis');
  if (optD) optD.classList.toggle('active', tab === 'disponibles');
  if (optM) optM.classList.toggle('active', tab === 'mis');
  _tarUpdateSlider(true);
  var panelD = document.getElementById('tar-tab-disponibles');
  var panelM = document.getElementById('tar-tab-mis');
  if (panelD) panelD.style.display = tab === 'disponibles' ? 'block' : 'none';
  if (panelM) panelM.style.display = tab === 'mis' ? 'block' : 'none';
}
function _tarUpdateSlider(animate) {
  var slider = document.getElementById('tar-slider');
  var activeOpt = document.getElementById(_tarTabActual === 'disponibles' ? 'tar-opt-disponibles' : 'tar-opt-mis');
  if (!slider || !activeOpt) return;
  slider.classList.toggle('animado', !!animate);
  slider.style.width = activeOpt.offsetWidth + 'px';
  slider.style.transform = 'translateX(' + activeOpt.offsetLeft + 'px)';
}

/* ── Carga de datos ────────────────────────────────────────────────────
   3 llamadas independientes en paralelo (disponibles+baúl, config, mis
   tareas) -- cada una re-renderiza lo suyo apenas resuelve, sin esperarse
   entre sí; `_tarRenderDisponibles()` se vuelve a llamar tras `getMisTareas`
   y `getConfigTareas` (además de tras `getTareasDisponibles`) porque el
   gating de "límite alcanzado" de sus botones depende de las 3 a la vez, sin
   importar el orden real de llegada. */
function _tarCargarTodo() {
  var miCarga = ++_tarCargaId;
  var contDisp = document.getElementById('tar-lista-disponibles');
  var contMis = document.getElementById('tar-lista-mis');
  if (contDisp) contDisp.innerHTML = _tarSkeletonHtml(2);
  if (contMis) contMis.innerHTML = _tarSkeletonHtml(2);

  api({ action: 'getTareasDisponibles' }, function(res) {
    if (miCarga !== _tarCargaId) return;
    _tarDisponibles = (res && res.disponibles) || [];
    _tarBaul = (res && res.baul) || [];
    _tarRenderDisponibles();
  }, function(e) {
    if (miCarga !== _tarCargaId) return;
    if (contDisp) contDisp.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">error_outline</span>No se pudieron cargar las tareas.</div>';
  });

  api({ action: 'getConfigTareas' }, function(res) {
    if (miCarga !== _tarCargaId) return;
    _tarConfig = res || { limiteTareasActivas: null };
    _tarRenderDisponibles();
  }, function() {});

  api({ action: 'getMisTareas', nombre: E.nombre }, function(res) {
    if (miCarga !== _tarCargaId) return;
    _tarMisTareas = res || [];
    _tarRenderMisTareas();
    _tarRenderDisponibles();
  }, function(e) {
    if (miCarga !== _tarCargaId) return;
    _tarMisTareas = [];
    if (contMis) contMis.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">error_outline</span>No se pudieron cargar tus tareas.</div>';
  });

  _tarCargarPendientesValidacion();
}

function _tarSkeletonHtml(n) {
  var carta = '<div class="ev-ant-card"><div class="ev-card-top-row">' +
    '<div class="fi-skel-block ev-ant-skel-icon"></div>' +
    '<div class="ev-card-body">' +
      '<div class="fi-skel-block ev-ant-skel-title"></div>' +
      '<div class="fi-skel-block ev-ant-skel-sub"></div>' +
    '</div></div></div>';
  var out = '';
  for (var i = 0; i < n; i++) out += carta;
  return out;
}

/* ── Límite de tareas activas (getConfigTareas.limiteTareasActivas, `null`
   = sin límite) comparado contra la cantidad de asignaciones 'iniciada' de
   getMisTareas -- fuente única consultada por las cards de Disponibles/
   Baúl para deshabilitar "Tomar"/"Rescatar". ──────────────────────────── */
function _tarEnLimite() {
  var lim = _tarConfig.limiteTareasActivas;
  if (lim == null) return false;
  var activas = _tarMisTareas.filter(function(a) { return a.estado === 'iniciada'; }).length;
  return activas >= lim;
}

/* ── Render "Disponibles" + "El Baúl de tareas" ───────────────────────── */
function _tarRenderDisponibles() {
  var cont = document.getElementById('tar-lista-disponibles');
  if (!cont) return;
  if (!_tarDisponibles.length) {
    cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">task_alt</span>No hay tareas disponibles por ahora.</div>';
  } else {
    cont.innerHTML = _tarDisponibles.map(function(t) { return _tarCardHtml(t, 'disponible'); }).join('');
  }
  var n = _tarBaul.length;
  var baulWrap = document.getElementById('tar-baul-wrap');
  if (baulWrap) baulWrap.style.display = n ? 'block' : 'none';
  var titulo = document.getElementById('tar-baul-titulo');
  if (titulo) titulo.textContent = 'El Baúl de tareas (' + n + ')';
  var listaBaul = document.getElementById('tar-lista-baul');
  if (listaBaul) listaBaul.innerHTML = _tarBaul.map(function(t) { return _tarCardHtml(t, 'baul'); }).join('');
  _tarHidratarAvatares();
}

function _tarToggleBaul() {
  _tarBaulAbierto = !_tarBaulAbierto;
  var body = document.getElementById('tar-baul-body');
  var chevron = document.getElementById('tar-baul-chevron');
  if (!body) return;
  if (_tarBaulAbierto) {
    body.style.maxHeight = body.scrollHeight + 'px';
    body.style.opacity = '1';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  } else {
    body.style.maxHeight = '0';
    body.style.opacity = '0';
    if (chevron) chevron.style.transform = '';
  }
}

/* Tarjeta de tarea (Disponibles/Baúl) -- ícono por área, título, área+puntos,
   fecha límite, fila de avatares de quienes ya la tomaron + cupos, y el
   botón de acción que corresponda (o la nota de límite alcanzado en su
   lugar). Mismo esqueleto que `_evCardEventoHtml()` (.ev-card/-top-row/
   -icon/-body/-titulo/-sub, css/eventos.css), reusado tal cual. */
function _tarCardHtml(t, contexto) {
  var icono = _TAR_ICONOS_AREA[t.area] || 'task_alt';
  var cuposLibres = (t.cuposLibres != null) ? t.cuposLibres : Math.max(0, (t.cuposTotales || 0) - (t.cuposTomados || 0));
  var accionHtml;
  if (_tarEnLimite()) {
    accionHtml = '<p class="tar-limite-nota">Alcanzaste el límite de tareas activas' +
      (_tarConfig.limiteTareasActivas != null ? ' (' + _tarConfig.limiteTareasActivas + ')' : '') +
      '. Soltá o enviá a revisión una tarea para tomar otra.</p>';
  } else if (contexto === 'baul') {
    accionHtml = '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarRescatar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">restore_from_trash</span>Rescatar tarea</button>';
  } else {
    accionHtml = '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarTomar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">add_task</span>Tomar tarea</button>';
  }
  return '<div class="ev-card" id="tar-card-' + contexto + '-' + t.idTarea + '">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo">' + (t.titulo || '') + '</div>' +
        '<div class="ev-card-sub"><span class="aj-pill activa tar-area-pill">' + (t.area || '') + '</span><span>' + (t.puntos != null ? t.puntos : 0) + ' pts</span></div>' +
        '<div class="ev-card-sub"><span class="material-symbols-outlined">event</span>Vence: ' + _tarFechaLegible(t.fechaVencimiento) + '</div>' +
        _tarAvataresHtml(t.asignados, t.cuposTotales, cuposLibres) +
        accionHtml +
      '</div>' +
    '</div>' +
  '</div>';
}

/* Fila de avatares superpuestos (primer uso real de .avatar-pill--xs,
   css/global.css) + conteo "N/total cupos". */
function _tarAvataresHtml(asignados, cuposTotales, cuposLibres) {
  asignados = asignados || [];
  var avatares = asignados.map(function(p) {
    var foto = (p.fotoPerfil || '').replace(/"/g, '&quot;');
    var nombre = (p.nombreDerby || p.nombre || '').replace(/"/g, '&quot;');
    return '<div class="avatar-pill avatar-pill--xs" data-nombre="' + nombre + '" data-foto="' + foto + '"></div>';
  }).join('');
  var tomados = asignados.length;
  var total = cuposTotales != null ? cuposTotales : (tomados + (cuposLibres || 0));
  return '<div class="tar-avatares-row">' +
    (avatares ? '<div class="tar-avatar-stack">' + avatares + '</div>' : '') +
    '<span class="tar-cupos-label">' + tomados + '/' + total + ' cupos</span>' +
  '</div>';
}
function _tarHidratarAvatares() {
  document.querySelectorAll('.tar-avatares-row [data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, el.getAttribute('data-foto') || '', el.getAttribute('data-nombre'));
  });
}

function _tarFechaLegible(raw) {
  if (!raw) return '—';
  var s = raw.toString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return _evAntFechaLegible(s);
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()] + ' de ' + d.getFullYear();
  return s;
}

/* ── Render "Mis tareas" (asignaciones activas: iniciada/pendiente_revision) ── */
function _tarRenderMisTareas() {
  var cont = document.getElementById('tar-lista-mis');
  if (!cont) return;
  if (!_tarMisTareas.length) {
    cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">assignment_turned_in</span>Todavía no tomaste ninguna tarea.</div>';
    return;
  }
  cont.innerHTML = _tarMisTareas.map(_tarCardMisHtml).join('');
}
function _tarCardMisHtml(a) {
  var t = a.tarea || {};
  var icono = _TAR_ICONOS_AREA[t.area] || 'task_alt';
  var fechaTope = a.fechaVencimientoPersonal || t.fechaVencimiento;
  var accionHtml;
  // `estado==='iniciada'` es la única rama con acciones -- cualquier otro
  // valor (`pendiente_revision` por contrato, `en_revision` según el nombre
  // de columna real documentado en la migración a Supabase, MANIFEST.md)
  // cae al mismo aviso "Esperando validación": getMisTareas ya solo
  // devuelve asignaciones activas (iniciada/en revisión), así que no hace
  // falta listar el nombre exacto del segundo estado acá para que la UI se
  // comporte bien ante ese desfasaje de nomenclatura.
  if (a.estado === 'iniciada') {
    accionHtml = '<div class="tar-acciones-col">' +
      '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarEnviarRevision(\'' + a.idAsignacion + '\', this)"><span class="material-symbols-outlined">send</span>Enviar a revisión</button>' +
      '<button type="button" class="btn btn-text-simple tar-card-btn" onclick="_tarSoltar(\'' + a.idAsignacion + '\', \'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">remove_circle</span>Soltar tarea</button>' +
    '</div>';
  } else {
    accionHtml = '<div class="ev-estado-pill ev-estado-pill-warning"><span class="material-symbols-outlined">hourglass_top</span>Esperando validación</div>';
  }
  return '<div class="ev-card" id="tar-mis-card-' + a.idAsignacion + '">' +
    '<div class="ev-card-top-row">' +
      '<div class="ev-card-icon"><span class="material-symbols-outlined">' + icono + '</span></div>' +
      '<div class="ev-card-body">' +
        '<div class="ev-card-titulo">' + (t.titulo || '') + (a.esRescate ? ' <span style="font-size:0.68rem;color:var(--muted);font-weight:600;">(rescatada)</span>' : '') + '</div>' +
        '<div class="ev-card-sub"><span class="aj-pill activa tar-area-pill">' + (t.area || '') + '</span><span>' + (t.puntos != null ? t.puntos : 0) + ' pts</span></div>' +
        '<div class="ev-card-sub"><span class="material-symbols-outlined">event</span>Vence: ' + _tarFechaLegible(fechaTope) + '</div>' +
        accionHtml +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ── Acciones de usuarix ───────────────────────────────────────────────
   `mostrarToast(msg,'error')` sin `forzar` en éxito -- silencio en éxito es
   el default intencional de la app (ver MANIFEST.md, "Reglas globales"), el
   re-render de las listas ya refleja el cambio. */
function _tarTomar(idTarea, btn) {
  if (btn) btn.disabled = true;
  apiPost({ action: 'tomarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    if (res && res.exito === false) {
      if (btn) btn.disabled = false;
      mostrarToast(res.error || 'No se pudo tomar la tarea.', 'error');
      return;
    }
    _tarCargarTodo();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo tomar la tarea.', 'error');
  });
}
function _tarRescatar(idTarea, btn) {
  if (btn) btn.disabled = true;
  apiPost({ action: 'rescatarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    if (res && res.exito === false) {
      if (btn) btn.disabled = false;
      mostrarToast(res.error || 'No se pudo rescatar la tarea.', 'error');
      return;
    }
    _tarCargarTodo();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo rescatar la tarea.', 'error');
  });
}
function _tarSoltar(idAsignacion, idTarea, btn) {
  if (btn) btn.disabled = true;
  apiPost({ action: 'soltarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    _tarCargarTodo();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo soltar la tarea.', 'error');
  });
}
function _tarEnviarRevision(idAsignacion, btn) {
  if (btn) btn.disabled = true;
  apiPost({ action: 'enviarRevisionTarea', nombre: E.nombre, token: _token, idAsignacion: idAsignacion }, function(res) {
    if (res && res.exito === false) {
      if (btn) btn.disabled = false;
      mostrarToast(res.error || 'No se pudo enviar a revisión.', 'error');
      return;
    }
    _tarCargarTodo();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo enviar a revisión.', 'error');
  });
}

/* ── Wizard "Nueva tarea" (admin) -- mismo mecanismo de pasos progresivos
   (.salud-paso/.salud-prog, "fade simple sin side-to-side" por ser
   pantalla->paso de un wizard, ver MANIFEST.md "Estándar de navegación")
   que `_evCrear*()` (js/eventos.js, #s-eventos-crear), replicado acá con su
   propio estado. ─────────────────────────────────────────────────────── */
var _TAR_CREAR_STEPS = ['tar-crear-paso-0', 'tar-crear-paso-1', 'tar-crear-paso-2'];
var _tarCrearCurIdx = 0;
var _tarCrearData = { titulo: '', area: null, fecha: null, notas: '' };
var _tarCrearCal = { mostrado: null };

function irTarCrear() {
  _tarCrearData = { titulo: '', area: null, fecha: null, notas: '' };
  _tarCrearCal.mostrado = _evHoyISO();
  ir('s-tareas-crear');
  _tarCrearResetUI();
  _tarCrearMostrarPaso(0);
  _tarCrearCalRender();
}
function _tarCrearResetUI() {
  var t = document.getElementById('tar-crear-titulo'); if (t) t.value = '';
  document.querySelectorAll('#tar-crear-area-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  _adminSetStepperValue('tar-crear-puntos', 0);
  _adminSetStepperValue('tar-crear-cupos', 1);
  var n = document.getElementById('tar-crear-notas'); if (n) n.value = '';
  var resumen = document.getElementById('tar-crear-cal-resumen'); if (resumen) resumen.textContent = '';
}
function _tarCrearMostrarPaso(idx) {
  _TAR_CREAR_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _tarCrearCurIdx = idx;
  _tarCrearRenderProg();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  _tarCrearActualizarFooter();
}
function _tarCrearRenderProg() {
  var cont = document.getElementById('tar-crear-prog'); if (!cont) return;
  cont.innerHTML = '';
  for (var i = 0; i < _TAR_CREAR_STEPS.length; i++) {
    var d = document.createElement('div');
    d.className = 'salud-prog-dot' + (i < _tarCrearCurIdx ? ' done' : (i === _tarCrearCurIdx ? ' active' : ''));
    cont.appendChild(d);
  }
}
function _tarCrearBack() {
  if (_tarCrearCurIdx === 0) { ir('s-tareas'); return; }
  _tarCrearMostrarPaso(_tarCrearCurIdx - 1);
}
function _tarCrearIrSiguiente() {
  if (_tarCrearCurIdx === 0 && !_tarCrearPaso0Valido()) return;
  _tarCrearMostrarPaso(_tarCrearCurIdx + 1);
}
function _tarCrearPaso0Valido() { return !!(_tarCrearData.titulo && _tarCrearData.titulo.trim() && _tarCrearData.area); }
function _tarCrearPaso2Valido() { return !!_tarCrearData.fecha; }
function _tarCrearActualizarFooter() {
  var btn = document.getElementById('tar-crear-btn-footer'); if (!btn) return;
  if (_tarCrearCurIdx === 2) {
    btn.textContent = 'Crear tarea';
    btn.onclick = _tarCrearGuardar;
    btn.disabled = !_tarCrearPaso2Valido();
  } else {
    btn.textContent = 'Continuar';
    btn.onclick = _tarCrearIrSiguiente;
    btn.disabled = _tarCrearCurIdx === 0 ? !_tarCrearPaso0Valido() : false;
  }
}
function _tarCrearSetTitulo(v) { _tarCrearData.titulo = v; _tarCrearActualizarFooter(); }
function _tarCrearSelArea(el) {
  document.querySelectorAll('#tar-crear-area-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _tarCrearData.area = el.dataset.val;
  _tarCrearActualizarFooter();
}
function _tarCrearSetNotas(v) { _tarCrearData.notas = v; }

/* Calendario inline de fecha límite -- mismo componente (.ev-ant-cal-nav,
   .ev-cal-grid, .ev-cal-dow, .ev-cal-celda, .ev-ant-cal-sel, .ev-ant-cal-pasado,
   css/eventos.css) que ya usan Asistencia anticipada/Crear evento
   (`_evCrearCalRender()`), reusado con estado propio -- un único día, sin
   rango, bloqueando fechas pasadas. */
function _tarCrearCalRender() {
  var cont = document.getElementById('tar-crear-cal'); if (!cont) return;
  var m = _evCalMesDe(_tarCrearCal.mostrado);
  var labelEl = document.getElementById('tar-crear-cal-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var seleccionada = _tarCrearData.fecha;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var pasado = _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (pasado ? ' ev-ant-cal-pasado' : '');
    if (seleccionada && celdaIso === seleccionada) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = pasado ? '' : ' onclick="_tarCrearCalTocarDia(\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>';
}
function _tarCrearCalMoverMes(dir) {
  var m = _evCalMesDe(_tarCrearCal.mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _tarCrearCal.mostrado = _evToISO(new Date(year, month, 1));
  _tarCrearCalRender();
}
function _tarCrearCalTocarDia(iso) {
  _tarCrearData.fecha = iso;
  _tarCrearCalRender();
  var resumen = document.getElementById('tar-crear-cal-resumen');
  if (resumen) resumen.textContent = _evAntFechaLegible(iso);
  _tarCrearActualizarFooter();
}

function _tarCrearGuardar() {
  if (!_tarCrearPaso0Valido() || !_tarCrearPaso2Valido()) return;
  var puntosEl = document.getElementById('tar-crear-puntos');
  var cuposEl = document.getElementById('tar-crear-cupos');
  var datos = {
    titulo: _tarCrearData.titulo.trim(),
    notas: _tarCrearData.notas || '',
    area: _tarCrearData.area,
    puntos: puntosEl ? (parseFloat(puntosEl.value) || 0) : 0,
    maxAsignados: cuposEl ? (parseInt(cuposEl.value, 10) || 1) : 1,
    fechaVencimiento: _tarCrearData.fecha,
    creadoPor: E.nombre
  };
  mostrarCargando('Creando tarea...');
  apiPost({ action: 'adminCrearTarea', adminToken: _adminToken, datos: JSON.stringify(datos) }, function(res) {
    ocultarCargando();
    if (res && res.exito === false) {
      mostrarToast(res.error || 'No se pudo crear la tarea.', 'error');
      return;
    }
    ir('s-tareas');
    _tarCargarTodo();
  }, function(e) {
    ocultarCargando();
    mostrarToast((e && e.message) || 'No se pudo crear la tarea.', 'error');
  });
}

/* ── Panel de validación (admin) ───────────────────────────────────────
   Ícono con badge en el header de Tareas (mismo criterio que el badge de
   reservas pendientes de Mi Liga, `_adminRenderBannerPendientes()`,
   js/admin.js) que abre un bottom sheet con las filas .admin-banner-res-row
   ya existentes (css/admin.css) -- Aprobar/Rechazar, Rechazar revela un
   textarea corto antes de confirmar. Sigue el mecanismo estándar de
   apertura/cierre de bottom sheets (doble RAF / _registrarOverlayAbierto /
   porGesto, ver MANIFEST.md). */
function _tarCargarPendientesValidacion() {
  if (!_adminToken) { _tarPendientesValidacion = []; _tarActualizarBadgeValidacion(); return; }
  adminApi({ action: 'adminGetTareasPendientesValidacion' }, function(res) {
    _tarPendientesValidacion = res || [];
    _tarActualizarBadgeValidacion();
  }, function() { _tarPendientesValidacion = []; _tarActualizarBadgeValidacion(); });
}
function _tarActualizarBadgeValidacion() {
  var btn = document.getElementById('tar-btn-validar');
  var badge = document.getElementById('tar-validar-badge');
  if (!btn || !badge) return;
  btn.style.display = _adminToken ? 'flex' : 'none';
  var n = _tarPendientesValidacion.length;
  badge.style.display = n > 0 ? 'flex' : 'none';
  badge.textContent = n > 9 ? '9+' : String(n);
}
function _tarAbrirValidacion() {
  _tarRenderValidacion();
  var ov = document.getElementById('tar-sheet-validar-overlay');
  var sh = document.getElementById('tar-sheet-validar');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(_tarCerrarValidacion);
}
function _tarCerrarValidacion(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('tar-sheet-validar');
  var ov = document.getElementById('tar-sheet-validar-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
function _tarRenderValidacion() {
  var cont = document.getElementById('tar-validar-lista');
  if (!cont) return;
  if (!_tarPendientesValidacion.length) {
    cont.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--muted);font-size:0.85rem;">No hay tareas por validar.</div>';
    return;
  }
  cont.innerHTML = _tarPendientesValidacion.map(function(p) {
    var t = p.tarea || {};
    return '<div class="admin-banner-res-row" id="tar-val-row-' + p.idAsignacion + '" style="flex-wrap:wrap;">' +
      '<div class="admin-banner-res-info">' +
        '<div class="admin-banner-res-nombre">' + (p.nombreUsuario || '') + '</div>' +
        '<div class="admin-banner-res-fecha">' + (t.titulo || '') + ' · ' + (t.puntos != null ? t.puntos : 0) + ' pts</div>' +
      '</div>' +
      '<div class="admin-banner-res-actions">' +
        '<button class="admin-banner-btn admin-banner-btn-ok" onclick="_tarValidarAprobar(\'' + p.idAsignacion + '\', this)" aria-label="Aprobar"><span class="material-symbols-outlined">check</span></button>' +
        '<button class="admin-banner-btn admin-banner-btn-no" onclick="_tarValidarMostrarRechazo(\'' + p.idAsignacion + '\')" aria-label="Rechazar"><span class="material-symbols-outlined">close</span></button>' +
      '</div>' +
      '<div id="tar-val-rechazo-' + p.idAsignacion + '" style="display:none;width:100%;margin-top:8px;">' +
        '<textarea id="tar-val-nota-' + p.idAsignacion + '" placeholder="Motivo del rechazo (opcional)..." style="min-height:60px;resize:none;width:100%;font-size:0.8rem;"></textarea>' +
        '<button class="btn btn-danger tar-card-btn" style="padding:10px;margin-top:6px;" onclick="_tarValidarConfirmarRechazo(\'' + p.idAsignacion + '\', this)"><span class="material-symbols-outlined">close</span>Confirmar rechazo</button>' +
      '</div>' +
    '</div>';
  }).join('');
}
function _tarValidarMostrarRechazo(idAsignacion) {
  var wrap = document.getElementById('tar-val-rechazo-' + idAsignacion);
  if (!wrap) return;
  wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}
function _tarValidarAprobar(idAsignacion, btn) {
  _tarValidarEnviar(idAsignacion, 'aprobar', '');
}
function _tarValidarConfirmarRechazo(idAsignacion) {
  var nota = document.getElementById('tar-val-nota-' + idAsignacion);
  _tarValidarEnviar(idAsignacion, 'rechazar', nota ? nota.value : '');
}
function _tarValidarEnviar(idAsignacion, accion, nota) {
  var row = document.getElementById('tar-val-row-' + idAsignacion);
  if (row) row.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
  apiPost({ action: 'adminValidarTarea', adminToken: _adminToken, idAsignacion: idAsignacion, accion: accion, notaRechazo: nota || '' }, function(res) {
    if (res && res.exito === false) {
      if (row) row.querySelectorAll('button').forEach(function(b) { b.disabled = false; });
      mostrarToast(res.error || 'No se pudo procesar la validación.', 'error');
      return;
    }
    _tarPendientesValidacion = _tarPendientesValidacion.filter(function(p) { return String(p.idAsignacion) !== String(idAsignacion); });
    _tarRenderValidacion();
    _tarActualizarBadgeValidacion();
    if (!_tarPendientesValidacion.length) _tarCerrarValidacion();
    _tarCargarTodo();
  }, function(e) {
    if (row) row.querySelectorAll('button').forEach(function(b) { b.disabled = false; });
    mostrarToast((e && e.message) || 'No se pudo procesar la validación.', 'error');
  });
}
