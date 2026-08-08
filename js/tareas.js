// Sección Tareas — backend Apps Script ya desplegado (getTareasDisponibles/
// getMisTareas/getConfigTareas/tomarTarea/soltarTarea/rescatarTarea/
// enviarRevisionTarea/adminCrearTarea/adminGetTareasPendientesValidacion/
// adminValidarTarea/getTareasArchivadas/adminEliminarTareaArchivada). Reusa
// helpers globales ya existentes de otras secciones en vez de duplicarlos:
// _avatarSetFotoOInicial (js/ui.js), _evToISO/_evParseISO/_evHoyISO/
// _evFechaCmp/_evLunesDeSemana/_evCalMesDe/_evAntFechaLegible/NOMBRES_MESES/
// _EV_DIAS_CORTOS (js/eventos.js), adminStepperChange/_adminSetStepperValue/
// adminApi (js/admin.js).

var _tarDisponibles = [];
var _tarBaul = [];
var _tarMisTareas = [];
var _tarConfig = { limiteTareasActivas: null };
var _tarCargaId = 0;
var _tarTabActual = 'disponibles';
var _tarBaulAbierto = false;
var _tarPendientesValidacion = [];
var _tarArchivadas = [];
var _tarEliminarArchivadaIdPendiente = null;

// Marca qué card debe entrar con `.tar-card-entrando` en el próximo render
// de Disponibles/Mis tareas -- consumida y limpiada por
// `_tarAplicarEntradaPendiente()`, ver bloque de actualización optimista
// más abajo (tomar/soltar/enviar a revisión).
var _tarEntradaPendiente = null; // { lista: 'disponibles'|'mis', id: idTarea|idAsignacion }
function _tarAplicarEntradaPendiente(lista, prefijoDom) {
  if (!_tarEntradaPendiente || _tarEntradaPendiente.lista !== lista) return;
  var el = document.getElementById(prefijoDom + _tarEntradaPendiente.id);
  if (el) el.classList.add('tar-card-entrando');
  _tarEntradaPendiente = null;
}

var _TAR_ICONOS_AREA = {
  'Logística': 'inventory_2',
  'Entrenamientos': 'sports_gymnastics',
  'Eventos': 'event',
  'Finanzas': 'payments',
  'Mantenimiento': 'build',
  'Redes Sociales y Comunicación': 'campaign',
  'Reclutamiento': 'group_add'
};

/* ── Ícono de card + pills compartidas (Disponibles/Baúl/Mis tareas/
   Archivadas/Gestionar) -- ver MANIFEST.md "Cambios recientes": el ícono
   se mudó de una columna a la izquierda (`.ev-card-icon`, restaba ancho a
   todo el contenido) a un recuadro en la esquina superior junto al título
   (`.tar-card-header`/`.tar-card-icono-box`, css/tareas.css), y las pills
   de Área/Cupos/Puntos/Fecha se unificaron en una sola fila `.fi-pills`
   (mismo componente pill sutil ya usado en el resto de la app,
   css/reservas.css) en vez de 2 filas de texto plano. Un solo par de
   helpers reusado por los 5 templates de card en vez de repetir el mismo
   HTML 5 veces. */
// `personas` = el array crudo de asignados/personas de la tarea, en
// cualquiera de sus 2 formas según la vista (`t.asignados` en Disponibles/
// Baúl/Mis tareas, `t.personas` en Archivadas/Gestionar) -- ambas formas
// comparten el mismo campo `estado` por persona cuando existe. Defensivo a
// propósito: en Disponibles/Baúl/Mis tareas ese campo hoy no viene
// (siempre `iniciada`, la tarea todavía sigue en el tablero), así que acá
// simplemente nunca da `true` -- sin romper nada si el backend lo suma a
// futuro.
function _tarTieneAprobada(personas) {
  return (personas || []).some(function(p) { return p.estado === 'aprobada'; });
}
function _tarIconoBoxHtml(area, aprobada) {
  var icono = _TAR_ICONOS_AREA[area] || 'task_alt';
  return '<div class="tar-card-icono-box' + (aprobada ? ' tar-card-icono-aprobada' : '') + '">' +
    '<span class="material-symbols-outlined">' + icono + '</span>' +
    (aprobada ? '<span class="tar-card-icono-aprobada-txt">Aprobada</span>' : '') +
  '</div>';
}
// `cupos` (opcional) = { tomados, total } -- solo Disponibles/Baúl/Gestionar
// muestran el cupo restante; Mis tareas/Archivadas no traían ese pill antes
// de este cambio y no lo suman ahora (fuera del pedido, ver "Reglas
// globales del proyecto" -- no agregar más de lo pedido).
function _tarPillsRowHtml(area, puntos, fechaRaw, cupos) {
  var fi = _tarFechaInfo(fechaRaw);
  var cuposHtml = cupos ? '<span class="fi-pill fi-pill-hora tar-cupos-pill">' + cupos.tomados + '/' + cupos.total + ' cupos</span>' : '';
  return '<div class="fi-pills" style="margin-top:8px;">' +
    '<span class="fi-pill fi-pill-fin tar-area-pill">' + (area || '') + '</span>' +
    cuposHtml +
    '<span class="fi-pill fi-pill-dur">' + (puntos != null ? puntos : 0) + ' pts</span>' +
    '<span class="fi-pill ' + fi.clase + '"><span class="material-symbols-outlined">event</span>' + fi.texto + '</span>' +
  '</div>';
}

/* ── Buscador + filtros compartidos (Disponibles/Mis tareas/Baúl -- las 3
   conviven en #s-tareas, un solo estado de filtro -- y Archivadas, su
   propia pantalla con el suyo) -- mismo mecanismo de burbuja que Eventos
   (_evTogglePanel()/_evAbrirPanel()/_evCerrarPanel()/_evToggleFiltroBurbuja(),
   js/eventos.js), reimplementado acá parametrizado por `ctx`
   ('principal'|'archivadas') en vez de una copia literal por pantalla --
   los 2 comparten 4 campos idénticos (Área/Personas/Puntos/Mes), separarlo
   del todo hubiera duplicado ~15 funciones casi idénticas. Filtrado 100%
   client-side sobre lo ya cargado (`_tarDisponibles`/`_tarBaul`/
   `_tarMisTareas`/`_tarArchivadas`) -- ninguna acción nueva de backend. */
var _tarFiltro = { area: [], personas: [], puntosMin: null, puntosMax: null, mes: null };
var _tarFiltroArch = { area: [], personas: [], puntosMin: null, puntosMax: null, mes: null, estado: [] };
var _tarBusqueda = '';
var _tarBusquedaArch = '';
function _tarFiltroObj(ctx) { return ctx === 'archivadas' ? _tarFiltroArch : _tarFiltro; }
function _tarPrefijo(ctx) { return ctx === 'archivadas' ? 'tarch' : 'tar'; }

var _TAR_PANELES = {
  busqueda: { el: 'tar-busqueda-panel', btn: 'tar-busqueda-toggle-btn' },
  busquedaArch: { el: 'tarch-busqueda-panel', btn: 'tarch-busqueda-toggle-btn' }
};
// Un solo slot alcanza para las 2 pantallas -- #s-tareas y
// #s-tareas-archivadas nunca están visibles a la vez (son `.pantalla`
// distintas), así que nunca hay 2 burbujas de búsqueda abiertas juntas.
var _tarPanelAbierto = null; // 'busqueda' | 'busquedaArch'
var _tarFiltroBurbujaAbierta = null; // 'area' | 'personas' | 'puntos' | 'mes' | 'estado'

function _tarCtxDePanel(tag) { return tag === 'busquedaArch' ? 'archivadas' : 'principal'; }
function _tarTogglePanel(tag) {
  if (_tarPanelAbierto === tag) _tarCerrarPanel(tag);
  else { if (_tarPanelAbierto) _tarCerrarPanel(_tarPanelAbierto); _tarAbrirPanel(tag); }
}
function _tarAbrirPanel(tag) {
  _tarPanelAbierto = tag;
  var cfg = _TAR_PANELES[tag];
  var el = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (el) { el.classList.add('abierta'); el.style.maxHeight = el.scrollHeight + 'px'; }
  if (btn) btn.classList.add('ev-filtro-toggle-activo');
  var ctx = _tarCtxDePanel(tag);
  setTimeout(function() { var inp = document.getElementById(_tarPrefijo(ctx) + '-search-input'); if (inp) inp.focus(); }, 50);
}
function _tarCerrarPanel(tag, instant) {
  if (_tarPanelAbierto === tag) _tarPanelAbierto = null;
  var cfg = _TAR_PANELES[tag];
  var el = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (el) {
    if (instant) {
      el.style.transition = 'none'; el.classList.remove('abierta'); el.style.maxHeight = '0px';
      void el.offsetHeight; el.style.transition = '';
    } else {
      el.style.maxHeight = el.scrollHeight + 'px';
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { el.classList.remove('abierta'); el.style.maxHeight = '0px'; });
      });
    }
  }
  if (btn) btn.classList.remove('ev-filtro-toggle-activo');
  var ctx = _tarCtxDePanel(tag);
  if (_tarFiltroBurbujaAbierta) { _tarColapsarFiltroBurbuja(ctx, _tarFiltroBurbujaAbierta); _tarFiltroBurbujaAbierta = null; _tarActualizarBotonesFiltro(ctx); }
  var inp = document.getElementById(_tarPrefijo(ctx) + '-search-input');
  if (inp) inp.value = '';
  _tarBuscar(ctx, '');
}
// Mismo chequeo compartido que `_evCerrarBurbujaSiFueraDe()` (js/eventos.js):
// cualquier toque afuera de la burbuja abierta (y de su propio ícono
// trigger) la cierra.
function _tarCerrarBurbujaSiFueraDe(target) {
  if (!_tarPanelAbierto) return;
  var cfg = _TAR_PANELES[_tarPanelAbierto];
  if (!cfg) return;
  var panelEl = document.getElementById(cfg.el);
  var btnEl = document.getElementById(cfg.btn);
  if ((panelEl && panelEl.contains(target)) || (btnEl && btnEl.contains(target))) return;
  _tarCerrarPanel(_tarPanelAbierto);
}
document.addEventListener('click', function(e) { _tarCerrarBurbujaSiFueraDe(e.target); });
['pointerdown', 'touchstart'].forEach(function(tipo) {
  document.addEventListener(tipo, function(e) { _tarCerrarBurbujaSiFueraDe(e.target); }, { capture: true, passive: true });
});
function _tarToggleBusqueda() { _tarTogglePanel('busqueda'); }
function _tarToggleBusquedaArch() { _tarTogglePanel('busquedaArch'); }

// Mismo criterio que `_evNormalizarBusqueda()` (js/eventos.js) -- minúsculas
// + sin acentos, para que "Diaz"/"díaz" o "logistica"/"Logística" matcheen.
function _tarNormalizarBusqueda(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function _tarBuscar(ctx, q) {
  if (ctx === 'archivadas') _tarBusquedaArch = q; else _tarBusqueda = q;
  _tarAplicarFiltros(ctx);
}
function _tarPasaBusqueda(ctx, texto) {
  var q = _tarNormalizarBusqueda(ctx === 'archivadas' ? _tarBusquedaArch : _tarBusqueda).trim();
  if (!q) return true;
  return _tarNormalizarBusqueda(texto).indexOf(q) !== -1;
}

function _tarToggleFiltroBurbuja(ctx, campo) {
  var prefijo = _tarPrefijo(ctx);
  if (_tarFiltroBurbujaAbierta === campo) { _tarColapsarFiltroBurbuja(ctx, campo); _tarFiltroBurbujaAbierta = null; }
  else {
    if (_tarFiltroBurbujaAbierta) _tarColapsarFiltroBurbuja(ctx, _tarFiltroBurbujaAbierta);
    _tarFiltroBurbujaAbierta = campo;
    if (campo === 'area') _tarRenderFiltroAreaPills(ctx);
    else if (campo === 'personas') _tarRenderFiltroPersonasLista(ctx, '');
    else if (campo === 'mes') _tarRenderFiltroMesPills(ctx);
    else if (campo === 'estado') _tarRenderFiltroEstadoPills();
    var el = document.getElementById(prefijo + '-filtro-burbuja-' + campo);
    if (el) el.classList.add('abierta');
    // Relaja el techo del panel padre para que la burbuja hija no quede
    // recortada -- mismo criterio que `_evToggleFiltroBurbuja()`
    // (js/eventos.js).
    var panelEl = document.getElementById(_TAR_PANELES[ctx === 'archivadas' ? 'busquedaArch' : 'busqueda'].el);
    if (panelEl) panelEl.style.maxHeight = '650px';
  }
  _tarActualizarBotonesFiltro(ctx);
}
function _tarColapsarFiltroBurbuja(ctx, campo) {
  var el = document.getElementById(_tarPrefijo(ctx) + '-filtro-burbuja-' + campo);
  if (el) el.classList.remove('abierta');
}
function _tarEstadoLabel(v) { return v === 'aprobada' ? 'Aprobada' : (v === 'rechazada' ? 'Rechazada' : 'Sin asignados'); }
function _tarActualizarBotonesFiltro(ctx) {
  var f = _tarFiltroObj(ctx);
  var prefijo = _tarPrefijo(ctx);
  var campos = ctx === 'archivadas' ? ['area', 'personas', 'puntos', 'mes', 'estado'] : ['area', 'personas', 'puntos', 'mes'];
  campos.forEach(function(campo) {
    var btn = document.getElementById(prefijo + '-filtro-btn-' + campo);
    if (!btn) return;
    var labelEl = btn.querySelector('.ev-filtro-trigger-label');
    var chevron = btn.querySelector('.material-symbols-outlined');
    var base = btn.dataset.label;
    var activo = false, texto = base;
    if (campo === 'area') { activo = f.area.length > 0; texto = f.area.length === 1 ? f.area[0] : (f.area.length > 1 ? base + ' (' + f.area.length + ')' : base); }
    else if (campo === 'personas') { activo = f.personas.length > 0; texto = f.personas.length === 1 ? f.personas[0].label : (f.personas.length > 1 ? base + ' (' + f.personas.length + ')' : base); }
    else if (campo === 'puntos') { activo = f.puntosMin != null || f.puntosMax != null; texto = activo ? (f.puntosMin != null ? f.puntosMin : '0') + '–' + (f.puntosMax != null ? f.puntosMax : '∞') : base; }
    else if (campo === 'mes') { activo = f.mes != null; texto = activo ? NOMBRES_MESES[f.mes] : base; }
    else if (campo === 'estado') { activo = f.estado.length > 0; texto = f.estado.length === 1 ? _tarEstadoLabel(f.estado[0]) : (f.estado.length > 1 ? base + ' (' + f.estado.length + ')' : base); }
    if (labelEl) labelEl.textContent = texto;
    btn.classList.toggle('ev-filtro-activo', activo || _tarFiltroBurbujaAbierta === campo);
    if (chevron) chevron.textContent = _tarFiltroBurbujaAbierta === campo ? 'expand_less' : 'expand_more';
  });
  _tarActualizarBadgeFiltro(ctx);
}
function _tarActualizarBadgeFiltro(ctx) {
  var f = _tarFiltroObj(ctx);
  var badge = document.getElementById(_tarPrefijo(ctx) + '-filtro-badge');
  if (!badge) return;
  var n = 0;
  if (f.area.length) n++;
  if (f.personas.length) n++;
  if (f.puntosMin != null || f.puntosMax != null) n++;
  if (f.mes != null) n++;
  if (ctx === 'archivadas' && f.estado.length) n++;
  badge.textContent = String(n);
  badge.style.display = n > 0 ? 'flex' : 'none';
}
function _tarFiltroActivo(ctx) {
  var f = _tarFiltroObj(ctx);
  var busq = (ctx === 'archivadas' ? _tarBusquedaArch : _tarBusqueda).trim();
  return !!(busq || f.area.length || f.personas.length || f.puntosMin != null || f.puntosMax != null || f.mes != null || (ctx === 'archivadas' && f.estado.length));
}

/* Campo Área -- mismas opciones que el paso "Nombre + Área" del wizard
   (`_TAR_ICONOS_AREA` + "Otro", index.html `#tar-crear-area-pills`), pills
   `.aj-pill` multi-select tal cual (mismo mecanismo que Lugar/Tipo de
   Eventos, `ajTogglePill()`-equivalente a mano acá). */
function _tarRenderFiltroAreaPills(ctx) {
  var cont = document.getElementById(_tarPrefijo(ctx) + '-filtro-area-pills');
  if (!cont) return;
  var f = _tarFiltroObj(ctx);
  var areas = Object.keys(_TAR_ICONOS_AREA).concat(['Otro']);
  cont.innerHTML = areas.map(function(a) {
    var sel = f.area.indexOf(a) !== -1;
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + a + '" onclick="_tarToggleFiltroAreaChip(this,\'' + ctx + '\')">' + a + '</span>';
  }).join('');
}
function _tarToggleFiltroAreaChip(el, ctx) {
  el.classList.toggle('activa');
  var f = _tarFiltroObj(ctx);
  var cont = el.parentNode;
  f.area = Array.prototype.slice.call(cont.querySelectorAll('.aj-pill.activa')).map(function(p) { return p.dataset.val; });
  _tarActualizarBotonesFiltro(ctx);
  _tarAplicarFiltros(ctx);
}

/* Campo Personas -- a diferencia del picker del wizard (`_tarCrearRenderPersonas()`,
   que ofrece TODO el roster vía `adminGetRosterEquipo`, acción admin-only),
   acá las candidatas salen de las propias tareas YA CARGADAS (`asignados`/
   `personas`, según la vista) -- ni pide nada nuevo al backend (100%
   client-side, como pide el punto 1) ni depende de `_adminToken` (esta
   vista es para cualquier usuarix, no solo admin). */
function _tarPersonasCandidatas(ctx) {
  var mapa = {};
  var agregar = function(p) { if (p && p.nombre && !mapa[p.nombre]) mapa[p.nombre] = { nombre: p.nombre, label: p.nombreDerby || p.nombre }; };
  if (ctx === 'archivadas') {
    _tarArchivadas.forEach(function(t) { (t.personas || []).forEach(agregar); });
  } else {
    _tarDisponibles.forEach(function(t) { (t.asignados || []).forEach(agregar); });
    _tarBaul.forEach(function(t) { (t.asignados || []).forEach(agregar); });
    _tarMisTareas.forEach(function(a) { ((a.tarea && a.tarea.asignados) || []).forEach(agregar); });
  }
  var out = [];
  for (var k in mapa) { if (mapa.hasOwnProperty(k)) out.push(mapa[k]); }
  out.sort(function(a, b) { return a.label.localeCompare(b.label); });
  return out;
}
function _tarRenderFiltroPersonasLista(ctx, q) {
  var cont = document.getElementById(_tarPrefijo(ctx) + '-filtro-personas-lista');
  if (!cont) return;
  var f = _tarFiltroObj(ctx);
  var candidatas = _tarPersonasCandidatas(ctx);
  var qn = _tarNormalizarBusqueda(q).trim();
  var filtradas = qn ? candidatas.filter(function(p) { return _tarNormalizarBusqueda(p.label).indexOf(qn) !== -1; }) : candidatas;
  if (!filtradas.length) {
    cont.innerHTML = '<div class="ev-roster-vacio">' + (candidatas.length ? 'Sin resultados.' : 'Nadie asignado todavía en esta vista.') + '</div>';
    return;
  }
  cont.innerHTML = filtradas.map(function(p) {
    var sel = false;
    for (var i = 0; i < f.personas.length; i++) { if (f.personas[i].nombre === p.nombre) { sel = true; break; } }
    var nombreAttr = p.nombre.replace(/'/g, "\\'");
    var labelAttr = p.label.replace(/'/g, "\\'");
    return '<div class="ev-roster-fila tar-persona-fila" onclick="_tarToggleFiltroPersona(this,\'' + ctx + '\',\'' + nombreAttr + '\',\'' + labelAttr + '\')">' +
      '<span class="ev-roster-nombre">' + p.label + '</span>' +
      '<div class="fi-circle' + (sel ? ' sel' : '') + '"><span class="material-symbols-outlined">check</span></div>' +
    '</div>';
  }).join('');
}
function _tarToggleFiltroPersona(el, ctx, nombre, label) {
  var f = _tarFiltroObj(ctx);
  var idx = -1;
  for (var i = 0; i < f.personas.length; i++) { if (f.personas[i].nombre === nombre) { idx = i; break; } }
  if (idx === -1) f.personas.push({ nombre: nombre, label: label });
  else f.personas.splice(idx, 1);
  var circle = el.querySelector('.fi-circle');
  if (circle) circle.classList.toggle('sel');
  _tarActualizarBotonesFiltro(ctx);
  _tarAplicarFiltros(ctx);
}

/* Campo Puntos -- rango mín/máx, sin precedente exacto en el resto de la
   app (ver investigación previa a implementar esto) -- 2 `<input
   type="number">` simples, ya estilizados por la regla genérica de
   `input[type="number"]` (css/ui.css), en vez de inventar un componente
   nuevo tipo slider. `null` = sin acotar de ese lado. */
function _tarSetFiltroPuntos(ctx, cual, val) {
  var f = _tarFiltroObj(ctx);
  var n = val === '' ? null : parseFloat(val);
  if (n != null && isNaN(n)) n = null;
  if (cual === 'min') f.puntosMin = n; else f.puntosMax = n;
  _tarActualizarBotonesFiltro(ctx);
  _tarAplicarFiltros(ctx);
}

/* Campo Mes -- reusa tal cual `.meses-grid-pills`/`.mes-item` (css/reservas.css)
   y el patrón de radios de `_cargarMesesGestionar()` (js/home.js): selección
   única, sin año (matchea cualquier año de ese mes -- ver `_tarMesDeFecha()`
   más abajo, asunción marcada a propósito: el pedido no especificó si debía
   acotar también por año). Suma una opción "Todos" al principio para poder
   volver a "sin filtro de mes" (los otros 12 son un `<input type="radio">`
   real, sin un estado "ninguno marcado" nativo limpio). */
function _tarRenderFiltroMesPills(ctx) {
  var cont = document.getElementById(_tarPrefijo(ctx) + '-filtro-mes-grid');
  if (!cont) return;
  var f = _tarFiltroObj(ctx);
  var name = _tarPrefijo(ctx) + '-filtro-mes';
  var html = '<label class="mes-item"><input type="radio" name="' + name + '"' + (f.mes == null ? ' checked' : '') + ' onchange="_tarSelFiltroMes(\'' + ctx + '\', null)"><span class="mes-nombre">Todos</span></label>';
  for (var i = 0; i < NOMBRES_MESES.length; i++) {
    html += '<label class="mes-item"><input type="radio" name="' + name + '"' + (f.mes === i ? ' checked' : '') + ' onchange="_tarSelFiltroMes(\'' + ctx + '\', ' + i + ')"><span class="mes-nombre">' + NOMBRES_MESES[i] + '</span></label>';
  }
  cont.innerHTML = html;
}
function _tarSelFiltroMes(ctx, mes) {
  _tarFiltroObj(ctx).mes = mes;
  _tarActualizarBotonesFiltro(ctx);
  _tarAplicarFiltros(ctx);
}

/* Campo Estado final -- SOLO Archivadas (Disponibles/Mis tareas/Baúl son
   tareas todavía en curso, sin estado final). Multi-select OR, mismo
   mecanismo de pills que Área. "Sin asignados" = `personas` vacío (nadie
   trabajó nunca en esa tarea); "Aprobada"/"Rechazada" matchean si ALGUNA
   persona de la tarea tiene ese estado (una tarea con gente aprobada Y
   rechazada a la vez puede aparecer bajo ambos filtros si los 2 están
   activos -- ver `_tarPasaFiltro()`). */
function _tarRenderFiltroEstadoPills() {
  var cont = document.getElementById('tarch-filtro-estado-pills');
  if (!cont) return;
  var f = _tarFiltroArch;
  var opciones = [{ val: 'aprobada', label: 'Aprobada' }, { val: 'rechazada', label: 'Rechazada' }, { val: 'sin_asignados', label: 'Sin asignados' }];
  cont.innerHTML = opciones.map(function(o) {
    var sel = f.estado.indexOf(o.val) !== -1;
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o.val + '" onclick="_tarToggleFiltroEstadoChip(this)">' + o.label + '</span>';
  }).join('');
}
function _tarToggleFiltroEstadoChip(el) {
  el.classList.toggle('activa');
  var cont = el.parentNode;
  _tarFiltroArch.estado = Array.prototype.slice.call(cont.querySelectorAll('.aj-pill.activa')).map(function(p) { return p.dataset.val; });
  _tarActualizarBotonesFiltro('archivadas');
  _tarAplicarFiltros('archivadas');
}

// Mes (0-11) de una fecha ISO (`YYYY-MM-DD...`) u otro formato parseable por
// `Date` -- sin año, a propósito (ver comentario de `_tarRenderFiltroMesPills()`).
function _tarMesDeFecha(raw) {
  if (!raw) return null;
  var s = raw.toString();
  var m = /^(\d{4})-(\d{2})-\d{2}/.exec(s);
  if (m) return parseInt(m[2], 10) - 1;
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getMonth();
}
// Predicado genérico -- recibe un objeto YA NORMALIZADO (`_tarNormalizarTarea()`/
// `_tarNormalizarAsignacion()`/`_tarNormalizarArchivada()`, junto a las
// funciones `_tarRender*()` que las usan) en vez de conocer la forma cruda
// de cada una de las 4 vistas (Mis tareas trae asignaciones con `.tarea`
// anidada, no tareas sueltas como las otras 3).
function _tarPasaFiltro(ctx, norm) {
  var f = _tarFiltroObj(ctx);
  if (f.area.length && f.area.indexOf(norm.area) === -1) return false;
  if (f.personas.length) {
    var tieneAlguna = false;
    for (var i = 0; i < f.personas.length && !tieneAlguna; i++) {
      for (var j = 0; j < norm.personas.length; j++) {
        if (norm.personas[j].nombre === f.personas[i].nombre) { tieneAlguna = true; break; }
      }
    }
    if (!tieneAlguna) return false;
  }
  if (f.puntosMin != null && norm.puntos < f.puntosMin) return false;
  if (f.puntosMax != null && norm.puntos > f.puntosMax) return false;
  if (f.mes != null && _tarMesDeFecha(norm.fechaFiltroMes) !== f.mes) return false;
  if (ctx === 'archivadas' && f.estado.length) {
    var pasaEstado = false;
    for (var k = 0; k < f.estado.length && !pasaEstado; k++) {
      var val = f.estado[k];
      if (val === 'sin_asignados') { if (!norm.personas.length) pasaEstado = true; }
      else { for (var p = 0; p < norm.personas.length; p++) { if (norm.personas[p].estado === val) { pasaEstado = true; break; } } }
    }
    if (!pasaEstado) return false;
  }
  if (!_tarPasaBusqueda(ctx, norm.titulo + ' ' + norm.area)) return false;
  return true;
}
function _tarAplicarFiltros(ctx) {
  if (ctx === 'archivadas') _tarRenderArchivadas();
  else { _tarRenderDisponibles(); _tarRenderMisTareas(); }
}
function _tarNormalizarTarea(t) {
  return { titulo: t.titulo || '', area: t.area || '', puntos: t.puntos != null ? t.puntos : 0, personas: t.asignados || [], fechaFiltroMes: t.fechaVencimiento };
}
function _tarNormalizarAsignacion(a) {
  var t = a.tarea || {};
  return { titulo: t.titulo || '', area: t.area || '', puntos: t.puntos != null ? t.puntos : 0, personas: t.asignados || [], fechaFiltroMes: a.fechaVencimientoPersonal || t.fechaVencimiento };
}
function _tarNormalizarArchivada(t) {
  return { titulo: t.titulo || '', area: t.area || '', puntos: t.puntos != null ? t.puntos : 0, personas: t.personas || [], fechaFiltroMes: t.fechaArchivado };
}

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
  // Refleja el estado de filtros persistido de una visita anterior a esta
  // sesión (los filtros NO se resetean al re-entrar, mismo criterio que
  // `_evTimelineFiltro` en Eventos) -- labels/badge de los triggers, no la
  // data en sí (eso lo cubre `_tarCargarTodo()` de abajo).
  _tarActualizarBotonesFiltro('principal');
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
  // Fade al cambiar de tab (cards Y estados vacíos, ambos viven dentro de
  // #tar-tabs-wrap) -- mismo mecanismo (`_evFadeSwap()`, js/eventos.js) que
  // ya usa el calendario del wizard, en vez de un toggle de display seco.
  var wrap = document.getElementById('tar-tabs-wrap');
  _evFadeSwap(wrap, function() {
    var panelD = document.getElementById('tar-tab-disponibles');
    var panelM = document.getElementById('tar-tab-mis');
    if (panelD) panelD.style.display = tab === 'disponibles' ? 'block' : 'none';
    if (panelM) panelM.style.display = tab === 'mis' ? 'block' : 'none';
  }, !wrap);
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
   tareas). Bug real corregido (ver MANIFEST.md "Cambios recientes" --
   parpadeo doble al abrir Tareas): antes cada una de las 3 disparaba su
   PROPIO `_tarRenderDisponibles()` apenas resolvía -- como `_tarEnLimite()`
   depende de `_tarConfig` Y `_tarMisTareas` (no solo de `_tarDisponibles`),
   el primer render (con las otras 2 todavía sin resolver) mostraba un
   gating de "límite alcanzado" parcial/potencialmente incorrecto, que el o
   los renders siguientes reemplazaban de golpe -- un `innerHTML=` completo
   cada vez, con la re-hidratación de TODOS los avatares
   (`_tarHidratarAvatares()`) incluida, visible como parpadeo doble/triple
   cuando 2+ de las 3 respuestas llegaban cerca en el tiempo (el caso
   típico). Fix de raíz: banderas `listo.*` -- Disponibles/Baúl se pintan
   una sola vez, recién cuando las 3 respuestas ya están adentro (éxito o
   error, lo que sea que haya resuelto primero para cada una). `getMisTareas`
   sigue pintando "Mis tareas" en cuanto resuelve (una sola llamada real la
   alimenta, no hay nada que coalescer ahí). */
function _tarCargarTodo() {
  var miCarga = ++_tarCargaId;
  var contDisp = document.getElementById('tar-lista-disponibles');
  var contMis = document.getElementById('tar-lista-mis');
  if (contDisp) contDisp.innerHTML = _tarSkeletonHtml(2);
  if (contMis) contMis.innerHTML = _tarSkeletonHtml(2);

  var listo = { disponibles: false, config: false, misTareas: false };
  var disponiblesOk = false;
  function _tarPintarDisponiblesSiListo() {
    if (listo.disponibles && listo.config && listo.misTareas && disponiblesOk) _tarRenderDisponibles();
  }

  api({ action: 'getTareasDisponibles' }, function(res) {
    if (miCarga !== _tarCargaId) return;
    _tarDisponibles = (res && res.disponibles) || [];
    _tarBaul = (res && res.baul) || [];
    disponiblesOk = true;
    listo.disponibles = true;
    _tarPintarDisponiblesSiListo();
  }, function(e) {
    if (miCarga !== _tarCargaId) return;
    listo.disponibles = true;
    if (contDisp) contDisp.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">error_outline</span>No se pudieron cargar las tareas.</div>';
  });

  api({ action: 'getConfigTareas' }, function(res) {
    if (miCarga !== _tarCargaId) return;
    _tarConfig = res || { limiteTareasActivas: null };
    listo.config = true;
    _tarPintarDisponiblesSiListo();
  }, function() {
    if (miCarga !== _tarCargaId) return;
    listo.config = true;
    _tarPintarDisponiblesSiListo();
  });

  api({ action: 'getMisTareas', nombre: E.nombre }, function(res) {
    if (miCarga !== _tarCargaId) return;
    _tarMisTareas = res || [];
    listo.misTareas = true;
    _tarRenderMisTareas();
    _tarPintarDisponiblesSiListo();
  }, function(e) {
    if (miCarga !== _tarCargaId) return;
    _tarMisTareas = [];
    listo.misTareas = true;
    if (contMis) contMis.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">error_outline</span>No se pudieron cargar tus tareas.</div>';
    _tarPintarDisponiblesSiListo();
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
  // Filtrado client-side (`_tarFiltro`/buscador de #s-tareas) -- ver
  // `_tarPasaFiltro()` más arriba. Mensaje de vacío distinto según la
  // causa: "no hay tareas" (dato real vacío) vs. "sin resultados" (los
  // filtros descartaron todo), mismo criterio que Eventos.
  var disponibles = _tarDisponibles.filter(function(t) { return _tarPasaFiltro('principal', _tarNormalizarTarea(t)); });
  if (!disponibles.length) {
    cont.innerHTML = (_tarDisponibles.length && _tarFiltroActivo('principal')) ?
      '<div class="ev-lista-vacia"><span class="material-symbols-outlined">filter_alt_off</span>No hay tareas que coincidan con estos filtros.</div>' :
      '<div class="ev-lista-vacia"><span class="material-symbols-outlined">task_alt</span>No hay tareas disponibles por ahora.</div>';
  } else {
    cont.innerHTML = disponibles.map(function(t) { return _tarCardHtml(t, 'disponible'); }).join('');
  }
  var baul = _tarBaul.filter(function(t) { return _tarPasaFiltro('principal', _tarNormalizarTarea(t)); });
  var n = baul.length;
  var baulWrap = document.getElementById('tar-baul-wrap');
  if (baulWrap) baulWrap.style.display = n ? 'block' : 'none';
  var titulo = document.getElementById('tar-baul-titulo');
  if (titulo) titulo.textContent = 'El Baúl de tareas (' + n + ')';
  var listaBaul = document.getElementById('tar-lista-baul');
  if (listaBaul) listaBaul.innerHTML = baul.map(function(t) { return _tarCardHtml(t, 'baul'); }).join('');
  _tarHidratarAvatares();
  _tarAplicarEntradaPendiente('disponibles', 'tar-card-disponible-');
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

/* Tarjeta de tarea (Disponibles/Baúl) -- título+ícono por área (esquina
   superior, ver `_tarIconoBoxHtml()`), pills de Área/Cupos/Puntos/Fecha
   límite (`_tarPillsRowHtml()`), fila de avatares de quienes ya la
   tomaron, y el botón de acción que corresponda (o la nota de límite
   alcanzado en su lugar). Ya NO usa `.ev-card-top-row`/`.ev-card-icon`
   (css/eventos.css, columna de ícono a la izquierda) -- ver MANIFEST.md
   "Cambios recientes". */
function _tarCardHtml(t, contexto) {
  var cuposLibres = (t.cuposLibres != null) ? t.cuposLibres : Math.max(0, (t.cuposTotales || 0) - (t.cuposTomados || 0));
  var accionHtml;
  if (_tarEnLimite()) {
    accionHtml = '<p class="tar-limite-nota">Alcanzaste el límite de tareas activas' +
      (_tarConfig.limiteTareasActivas != null ? ' (' + _tarConfig.limiteTareasActivas + ')' : '') +
      '. Suelta o envía a revisión una tarea para tomar otra.</p>';
  } else if (contexto === 'baul') {
    accionHtml = '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarRescatar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">restore_from_trash</span>Rescatar tarea</button>';
  } else {
    accionHtml = '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarTomar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">add_task</span>Tomar tarea</button>';
  }
  // "Archivar tarea" (admin, Disponibles Y Baúl -- antes solo Baúl, ver
  // MANIFEST.md "Cambios recientes") -- independiente del límite de arriba
  // a propósito: ese límite solo gatea Tomar/Rescatar (acciones de
  // autoservicio del propio admin como usuarix), Archivar es una acción
  // administrativa sin relación con ningún cupo personal. Sin límite de
  // días ni automatismo -- el admin archiva cuando quiere, tarea por
  // tarea (pedido explícito). Mismo backend (`adminArchivarTarea`) sin
  // ningún cambio -- la acción ya no depende de en qué lista viva la tarea.
  if ((contexto === 'baul' || contexto === 'disponible') && _adminToken) {
    accionHtml += '<button type="button" class="btn btn-text-simple tar-card-btn" onclick="_tarArchivar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">archive</span>Archivar tarea</button>';
  }
  var asignados = t.asignados || [];
  var tomados = asignados.length;
  var total = t.cuposTotales != null ? t.cuposTotales : (tomados + cuposLibres);
  return '<div class="ev-card" id="tar-card-' + contexto + '-' + t.idTarea + '">' +
    '<div class="ev-card-body">' +
      '<div class="tar-card-header">' +
        '<div class="ev-card-titulo">' + (t.titulo || '') + '</div>' +
        _tarIconoBoxHtml(t.area, _tarTieneAprobada(asignados)) +
      '</div>' +
      _tarPillsRowHtml(t.area, t.puntos, t.fechaVencimiento, { tomados: tomados, total: total }) +
      _tarAvataresHtml(asignados) +
      accionHtml +
    '</div>' +
  '</div>';
}

/* Fila de avatares superpuestos (primer uso real de .avatar-pill--xs,
   css/global.css) -- el conteo "N/total cupos" que vivía acá se mudó a una
   pill dentro de `.fi-pills` (ver `_tarPillsRowHtml()` más arriba). */
function _tarAvataresHtml(asignados) {
  asignados = asignados || [];
  var avatares = asignados.map(function(p) {
    var foto = (p.fotoPerfil || '').replace(/"/g, '&quot;');
    var nombre = (p.nombreDerby || p.nombre || '').replace(/"/g, '&quot;');
    return '<div class="avatar-pill avatar-pill--xs" data-nombre="' + nombre + '" data-foto="' + foto + '"></div>';
  }).join('');
  if (!avatares) return '';
  return '<div class="tar-avatares-row"><div class="tar-avatar-stack">' + avatares + '</div></div>';
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

/* Info de la pill de fecha límite (color + texto relativo en español) --
   ver MANIFEST.md "Cambios recientes". Color: rojo si ya venció o vence
   hoy, naranja si vence dentro de los próximos 3 días, amarillo si falta
   más (corte ajustable, sin más criterio explícito en el pedido). Texto:
   "Vence hoy"/"Vence mañana"/"Vence el [día]" (si cae el resto de esta
   semana)/"Vence el [día] que viene" (si cae la semana próxima)/"Vence el
   [día] [núm] de [mes]" para fechas más lejanas -- mismo criterio de
   "semana actual"/"semana próxima" que `_evEsRestoDeSemana()`/
   `_evEsProximaSemana()` (js/eventos.js), reusadas tal cual acá en vez de
   reimplementar ese cálculo (mismo semana-empieza-en-lunes que el resto de
   la app). */
function _tarFechaInfo(fechaRaw) {
  if (!fechaRaw) return { texto: 'Sin fecha límite', clase: 'tar-fecha-amarillo' };
  var s = fechaRaw.toString();
  var esIso = /^\d{4}-\d{2}-\d{2}/.test(s);
  var d = esIso ? _evParseISO(s.slice(0, 10)) : new Date(s);
  if (isNaN(d.getTime())) return { texto: 'Vence: ' + _tarFechaLegible(fechaRaw), clase: 'tar-fecha-amarillo' };
  d.setHours(0, 0, 0, 0);
  var hoy = _evParseISO(_evHoyISO());
  var diff = Math.round((d - hoy) / 86400000);
  var diaSemana = _EV_DIAS_LARGOS[d.getDay()].toLowerCase();
  var fechaCompleta = 'el ' + diaSemana + ' ' + d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()].toLowerCase() +
    (d.getFullYear() !== hoy.getFullYear() ? ' de ' + d.getFullYear() : '');
  var clase = diff <= 0 ? 'tar-fecha-rojo' : (diff <= 3 ? 'tar-fecha-naranja' : 'tar-fecha-amarillo');
  var isoCorta = esIso ? s.slice(0, 10) : _evToISO(d);
  var texto;
  if (diff < 0) texto = 'Venció ' + fechaCompleta;
  else if (diff === 0) texto = 'Vence hoy';
  else if (diff === 1) texto = 'Vence mañana';
  else if (_evEsRestoDeSemana(isoCorta)) texto = 'Vence el ' + diaSemana;
  else if (_evEsProximaSemana(isoCorta)) texto = 'Vence el ' + diaSemana + ' que viene';
  else texto = 'Vence ' + fechaCompleta;
  return { texto: texto, clase: clase };
}

/* ── Render "Mis tareas" (asignaciones activas: iniciada/pendiente_revision) ── */
function _tarRenderMisTareas() {
  var cont = document.getElementById('tar-lista-mis');
  if (!cont) return;
  var filtradas = _tarMisTareas.filter(function(a) { return _tarPasaFiltro('principal', _tarNormalizarAsignacion(a)); });
  if (!filtradas.length) {
    cont.innerHTML = (_tarMisTareas.length && _tarFiltroActivo('principal')) ?
      '<div class="ev-lista-vacia"><span class="material-symbols-outlined">filter_alt_off</span>No hay tareas que coincidan con estos filtros.</div>' :
      '<div class="ev-lista-vacia"><span class="material-symbols-outlined">assignment_turned_in</span>Todavía no tomaste ninguna tarea.</div>';
    _tarEntradaPendiente = null;
    return;
  }
  cont.innerHTML = filtradas.map(_tarCardMisHtml).join('');
  _tarAplicarEntradaPendiente('mis', 'tar-mis-card-');
}
// Bloque de acción de una card de "Mis tareas" -- factorizado aparte de
// `_tarCardMisHtml()` (antes inline ahí) para que `_tarEnviarRevision()`
// pueda repintar SOLO este bloque (con fade, ver más abajo) en vez de la
// card entera cuando el estado cambia de forma optimista.
function _tarAccionMisHtml(a) {
  var t = a.tarea || {};
  // `estado==='iniciada'` es la única rama con acciones -- cualquier otro
  // valor (`pendiente_revision` por contrato, `en_revision` según el nombre
  // de columna real documentado en la migración a Supabase, MANIFEST.md)
  // cae al mismo aviso "Esperando validación": getMisTareas ya solo
  // devuelve asignaciones activas (iniciada/en revisión), así que no hace
  // falta listar el nombre exacto del segundo estado acá para que la UI se
  // comporte bien ante ese desfasaje de nomenclatura.
  if (a.estado === 'iniciada') {
    return '<div class="tar-acciones-col">' +
      '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarEnviarRevision(\'' + a.idAsignacion + '\', this)"><span class="material-symbols-outlined">send</span>Enviar a revisión</button>' +
      '<button type="button" class="btn btn-text-simple tar-card-btn" onclick="_tarSoltar(\'' + a.idAsignacion + '\', \'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">remove_circle</span>Soltar tarea</button>' +
    '</div>';
  }
  return '<div class="ev-estado-pill ev-estado-pill-warning"><span class="material-symbols-outlined">hourglass_top</span>Esperando validación</div>';
}
function _tarCardMisHtml(a) {
  var t = a.tarea || {};
  var fechaTope = a.fechaVencimientoPersonal || t.fechaVencimiento;
  return '<div class="ev-card" id="tar-mis-card-' + a.idAsignacion + '">' +
    '<div class="ev-card-body">' +
      '<div class="tar-card-header">' +
        '<div class="ev-card-titulo">' + (t.titulo || '') + (a.esRescate ? ' <span style="font-size:0.68rem;color:var(--muted);font-weight:600;">(rescatada)</span>' : '') + '</div>' +
        _tarIconoBoxHtml(t.area, a.estado === 'aprobada') +
      '</div>' +
      _tarPillsRowHtml(t.area, t.puntos, fechaTope) +
      '<div class="tar-accion-wrap" id="tar-accion-wrap-' + a.idAsignacion + '">' + _tarAccionMisHtml(a) + '</div>' +
    '</div>' +
  '</div>';
}

/* ── Acciones de usuarix ───────────────────────────────────────────────
   `mostrarToast(msg,'error')` sin `forzar` en éxito -- silencio en éxito es
   el default intencional de la app (ver MANIFEST.md, "Reglas globales").
   Bug sistémico corregido (ver MANIFEST.md "Cambios recientes"): las 4
   acciones de abajo (tomarTarea/rescatarTarea/soltarTarea/
   enviarRevisionTarea), igual que adminCrearTarea más abajo, viven en el
   router de GET (doGet) del backend, no en doPost -- llamarlas con
   apiPost() (POST) devolvía "Acción POST no válida". Fix: usan api() (GET),
   mismo mecanismo que getTareasDisponibles/getMisTareas/getConfigTareas.

   Tomar/soltar/enviar a revisión -- actualización OPTIMISTA (ver
   MANIFEST.md "Cambios recientes"): la card reacciona en el DOM apenas se
   toca el botón, sin esperar la respuesta del servidor -- recién si el
   request falla se revierte el cambio (la tarea vuelve a su lista/estado
   anterior, con su propia animación de "entrada") y se muestra el toast de
   error. Cada una de las 3 tiene su propia transición (no una genérica):
   "tomar" sale con un lift + glow verde (semántica de logro), "soltar" sale
   con un drop sutil hacia abajo (semántica de soltar/entregar), "enviar a
   revisión" no cambia de lista -- solo cruza (fade) el bloque de botones
   por la píldora "Esperando validación" y pulsa el borde de la card en
   verde (`.tar-card-confirmando`, css/tareas.css). `_tarRescatar()`
   (Baúl) queda fuera del pedido -- sigue recargando todo como antes. */
function _tarTomar(idTarea, btn) {
  if (btn) btn.disabled = true;
  var idx = -1;
  for (var i = 0; i < _tarDisponibles.length; i++) { if (String(_tarDisponibles[i].idTarea) === String(idTarea)) { idx = i; break; } }
  var snapshot = idx !== -1 ? _tarDisponibles[idx] : null;
  var card = document.getElementById('tar-card-disponible-' + idTarea);
  _tarAnimarSalida(card, 'tar-card-saliendo-tomada', function() {
    if (snapshot) {
      var real = _tarDisponibles.indexOf(snapshot);
      if (real !== -1) _tarDisponibles.splice(real, 1);
    }
    _tarRenderDisponibles();
  });
  api({ action: 'tomarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    if (res && res.exito === false) {
      _tarRevertirDisponible(snapshot, res.error || 'No se pudo tomar la tarea.');
      return;
    }
    _tarSincronizarTrasTomar();
  }, function(e) {
    _tarRevertirDisponible(snapshot, (e && e.message) || 'No se pudo tomar la tarea.');
  });
}
function _tarRevertirDisponible(snapshot, mensaje) {
  if (snapshot && _tarDisponibles.indexOf(snapshot) === -1) {
    _tarDisponibles.unshift(snapshot);
    _tarEntradaPendiente = { lista: 'disponibles', id: snapshot.idTarea };
  }
  _tarRenderDisponibles();
  mostrarToast(mensaje, 'error');
}
// Tras un "Tomar" optimista confirmado por el servidor: la lista de
// Disponibles ya quedó correcta con la resta local de arriba (no se vuelve
// a repintar acá -- evitaría el parpadeo que corrige el punto de "doble
// parpadeo", ver `_tarCargarTodo()`). Solo sincroniza "Mis tareas"/el
// gating de límite en segundo plano -- ese panel está OCULTO en este
// momento (el toque fue desde la tab Disponibles), repintarlo no se nota.
function _tarSincronizarTrasTomar() {
  api({ action: 'getConfigTareas' }, function(res) { _tarConfig = res || _tarConfig; }, function() {});
  api({ action: 'getMisTareas', nombre: E.nombre }, function(res) {
    _tarMisTareas = res || _tarMisTareas;
    _tarRenderMisTareas();
  }, function() {});
}
function _tarRescatar(idTarea, btn) {
  if (btn) btn.disabled = true;
  api({ action: 'rescatarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
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
  var idx = -1;
  for (var i = 0; i < _tarMisTareas.length; i++) { if (String(_tarMisTareas[i].idAsignacion) === String(idAsignacion)) { idx = i; break; } }
  var snapshot = idx !== -1 ? _tarMisTareas[idx] : null;
  var card = document.getElementById('tar-mis-card-' + idAsignacion);
  _tarAnimarSalida(card, 'tar-card-saliendo-soltada', function() {
    if (snapshot) {
      var real = _tarMisTareas.indexOf(snapshot);
      if (real !== -1) _tarMisTareas.splice(real, 1);
    }
    _tarRenderMisTareas();
  });
  api({ action: 'soltarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    if (res && res.exito === false) {
      _tarRevertirMisTareas(snapshot, res.error || 'No se pudo soltar la tarea.');
      return;
    }
    _tarSincronizarTrasSoltar();
  }, function(e) {
    _tarRevertirMisTareas(snapshot, (e && e.message) || 'No se pudo soltar la tarea.');
  });
}
function _tarRevertirMisTareas(snapshot, mensaje) {
  if (snapshot && _tarMisTareas.indexOf(snapshot) === -1) {
    _tarMisTareas.unshift(snapshot);
    _tarEntradaPendiente = { lista: 'mis', id: snapshot.idAsignacion };
  }
  _tarRenderMisTareas();
  mostrarToast(mensaje, 'error');
}
// Simétrico a `_tarSincronizarTrasTomar()`: Disponibles está oculta en este
// momento (el toque fue desde la tab Mis tareas), sincronizarla en segundo
// plano no se nota.
function _tarSincronizarTrasSoltar() {
  api({ action: 'getConfigTareas' }, function(res) { _tarConfig = res || _tarConfig; }, function() {});
  api({ action: 'getTareasDisponibles' }, function(res) {
    _tarDisponibles = (res && res.disponibles) || _tarDisponibles;
    _tarBaul = (res && res.baul) || _tarBaul;
    _tarRenderDisponibles();
  }, function() {});
}
function _tarEnviarRevision(idAsignacion, btn) {
  // El botón real desaparece con el fade de `_tarSwapAccionMis()` de abajo,
  // pero se deshabilita también acá de una (mismo criterio anti-doble-toque
  // que el resto de las acciones) por si un segundo toque llega mientras el
  // fade todavía está en curso y el botón viejo sigue técnicamente en el DOM.
  if (btn) btn.disabled = true;
  var idx = -1;
  for (var i = 0; i < _tarMisTareas.length; i++) { if (String(_tarMisTareas[i].idAsignacion) === String(idAsignacion)) { idx = i; break; } }
  var a = idx !== -1 ? _tarMisTareas[idx] : null;
  if (!a) return;
  var estadoAnterior = a.estado;
  a.estado = 'pendiente_revision';
  _tarSwapAccionMis(a);
  api({ action: 'enviarRevisionTarea', nombre: E.nombre, token: _token, idAsignacion: idAsignacion }, function(res) {
    if (res && res.exito === false) {
      a.estado = estadoAnterior;
      _tarSwapAccionMis(a);
      mostrarToast(res.error || 'No se pudo enviar a revisión.', 'error');
      return;
    }
    // Ya quedó en su estado final vía la actualización optimista de arriba
    // -- a diferencia de tomar/soltar, esta acción no cambia de lista, así
    // que no hay nada más que sincronizar en segundo plano.
  }, function(e) {
    a.estado = estadoAnterior;
    _tarSwapAccionMis(a);
    mostrarToast((e && e.message) || 'No se pudo enviar a revisión.', 'error');
  });
}
// Repinta con fade SOLO el bloque de acción de una card de "Mis tareas"
// (`.tar-accion-wrap`, ver `_tarCardMisHtml()`) en vez de la card entera, y
// pulsa el borde de la card en verde -- mismo `_evFadeSwap()` genérico ya
// usado para el cambio de tab Disponibles/Mis tareas (js/eventos.js),
// sumándole acá la firma visual propia de esta transición puntual.
function _tarSwapAccionMis(a) {
  var wrap = document.getElementById('tar-accion-wrap-' + a.idAsignacion);
  if (!wrap) { _tarRenderMisTareas(); return; }
  var card = document.getElementById('tar-mis-card-' + a.idAsignacion);
  if (card) {
    card.classList.remove('tar-card-confirmando');
    void card.offsetWidth; // fuerza reflow para poder re-disparar la animación si se llama 2 veces seguidas (revert)
    card.classList.add('tar-card-confirmando');
  }
  _evFadeSwap(wrap, function() { wrap.innerHTML = _tarAccionMisHtml(a); });
}
// Anima la salida de una card (tomar/soltar) y recién DESPUÉS ejecuta
// `alTerminar` (la resta real del array + el re-render de la lista) --
// `animationend` con un fallback por `setTimeout` (tab en background,
// card ya ausente del DOM, etc. pueden no disparar el evento).
function _tarAnimarSalida(card, claseAnim, alTerminar) {
  if (!card) { alTerminar(); return; }
  var terminado = false;
  var fin = function() {
    if (terminado) return;
    terminado = true;
    card.removeEventListener('animationend', fin);
    alTerminar();
  };
  card.addEventListener('animationend', fin);
  card.classList.add(claseAnim);
  setTimeout(fin, 500);
}
// "Archivar tarea" (admin, Baúl) -- adminArchivarTarea, mismo mecanismo GET+
// adminToken que el resto de las acciones admin* de Tareas (adminApi()).
// Si el backend rechaza el archivado (ej. todavía hay revisiones pendientes
// sin validar sobre esta tarea), el error se muestra como toast tal cual lo
// devuelva -- sin reintento automático ni confirmación extra, pedido así.
function _tarArchivar(idTarea, btn) {
  if (btn) btn.disabled = true;
  adminApi({ action: 'adminArchivarTarea', idTarea: idTarea }, function(res) {
    if (res && res.exito === false) {
      if (btn) btn.disabled = false;
      mostrarToast(res.error || 'No se pudo archivar la tarea.', 'error');
      return;
    }
    _tarCargarTodo();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo archivar la tarea.', 'error');
  });
}

/* ── Wizard "Nueva tarea" (admin) -- mismo mecanismo de pasos progresivos
   (.salud-paso/.salud-prog, "fade simple sin side-to-side" por ser
   pantalla->paso de un wizard, ver MANIFEST.md "Estándar de navegación")
   que `_evCrear*()` (js/eventos.js, #s-eventos-crear), replicado acá con su
   propio estado. ─────────────────────────────────────────────────────── */
// Orden (ver MANIFEST.md "Cambios recientes" -- se sumó el paso "¿Cómo se
// asigna esta tarea?" después de puntos/cupos, el picker de personas se
// corrió antes de la fecha límite, y Notas se separó en su propio paso al
// final, antes compartido con Fecha límite): 0 Nombre+Área / 1 Puntos+
// Máximo de personas / 2 Modo de asignación / 3 Asignar a personas (SOLO
// si modoAsignacion==='elegir', ver `_tarCrearIrSiguiente()`/
// `_tarCrearBack()`) / 4 Fecha límite / 5 Notas (último paso siempre, sin
// importar el modo -- "Crear tarea").
var _TAR_CREAR_STEPS = ['tar-crear-paso-0', 'tar-crear-paso-1', 'tar-crear-paso-modo', 'tar-crear-paso-personas', 'tar-crear-paso-fecha', 'tar-crear-paso-notas'];
var _tarCrearCurIdx = 0;
var _tarCrearData = { titulo: '', area: null, fecha: null, notas: '', asignarA: [], modoAsignacion: null };
var _tarCrearCal = { mostrado: null };
// Último valor de "días para completar" mostrado (ver
// `_tarActualizarDiasParaCompletar()` más abajo) -- `null` = todavía no se
// mostró nada esta apertura del wizard, distingue "primera vez que
// aparece" (fade del texto completo) de "ya estaba visible" (fade normal).
var _tarCrearDiasAnterior = null;

function irTarCrear() {
  _tarCrearData = { titulo: '', area: null, fecha: null, notas: '', asignarA: [], modoAsignacion: null };
  _tarCrearCal.mostrado = _evHoyISO();
  ir('s-tareas-crear');
  _tarCrearResetUI();
  _tarCrearMostrarPaso(0);
  _tarCrearCalRender();
  // Paso "Asignar personas" -- mismo roster precargado que ya usa "Marcar
  // asistencia" (js/eventos.js, _evRosterEquipo/_evPrecargarRoster()), sin
  // pedirlo de nuevo si ya está en memoria (ej. se visitó Eventos antes en
  // esta sesión). Si todavía no llegó (o nunca se llamó porque esta sesión
  // no pasó por Eventos), se dispara acá -- el repintado real de la lista
  // pasa por `_tarCrearMostrarPaso()` cada vez que este paso se vuelve el
  // activo (ver esa función), así que llegue el roster antes o después no
  // importa; esta llamada solo limpia el contenedor de entrada, para no
  // arrastrar la lista de una apertura anterior del wizard.
  if (_adminToken && typeof _evRosterEquipo !== 'undefined' && _evRosterEquipo === null && typeof _evPrecargarRoster === 'function') _evPrecargarRoster();
  _tarCrearRenderPersonas('');
}
function _tarCrearResetUI() {
  var t = document.getElementById('tar-crear-titulo'); if (t) t.value = '';
  document.querySelectorAll('#tar-crear-area-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  _adminSetStepperValue('tar-crear-puntos', 0);
  _adminSetStepperValue('tar-crear-cupos', 1);
  document.querySelectorAll('#tar-crear-modo-opciones .opcion').forEach(function(o) { o.classList.remove('sel'); });
  var n = document.getElementById('tar-crear-notas'); if (n) n.value = '';
  var resumen = document.getElementById('tar-crear-cal-resumen'); if (resumen) resumen.textContent = '';
  var s = document.getElementById('tar-crear-personas-search'); if (s) s.value = '';
  _tarCrearDiasAnterior = null;
  var diasWrap = document.getElementById('tar-crear-dias-wrap'); if (diasWrap) diasWrap.style.display = 'none';
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
  // Bug real corregido (encontrado en la propia verificación con
  // Playwright, no al aplicar el fix a ciegas): el picker de personas solo
  // se pintaba UNA vez, al abrir el wizard (`irTarCrear()`) -- si el
  // roster (`_evPrecargarRoster()`) resolvía ANTES de que el usuario
  // llegara a este paso (el caso típico, la respuesta suele volver rápido),
  // `_tarCrearRepintarPersonasSiHaceFalta()` no hacía nada (el guard de esa
  // función descarta el repintado si el paso todavía no está `.activo`) y
  // la lista quedaba congelada en "Cargando equipo..." para siempre, sin
  // importar que el roster ya estuviera en memoria. Fix: repintar siempre
  // que este paso puntual se vuelve el activo (yendo hacia adelante O
  // hacia atrás), con el texto de búsqueda que hubiera quedado tipeado --
  // y de paso, recapear `asignarA` contra el "Máximo de personas" vigente
  // (pudo bajar si el usuario volvió al paso de cupos y lo redujo después
  // de ya haber elegido gente).
  if (_TAR_CREAR_STEPS[idx] === 'tar-crear-paso-personas') {
    var max = _tarCrearMaxPersonas();
    if (_tarCrearData.asignarA.length > max) _tarCrearData.asignarA = _tarCrearData.asignarA.slice(0, max);
    var inp = document.getElementById('tar-crear-personas-search');
    _tarCrearRenderPersonas(inp ? inp.value : '');
  }
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
// El paso "Asignar a personas" se salta en los 2 sentidos (adelante/atrás)
// cuando `modoAsignacion !== 'elegir'` -- "Que la tome quien quiera" (nuevo,
// paso "¿Cómo se asigna esta tarea?") va derecho de Modo a Fecha límite sin
// mostrar el picker, tal como se pidió.
function _tarCrearBack() {
  if (_tarCrearCurIdx === 0) { ir('s-tareas'); return; }
  var prev = _tarCrearCurIdx - 1;
  if (_TAR_CREAR_STEPS[prev] === 'tar-crear-paso-personas' && _tarCrearData.modoAsignacion !== 'elegir') prev--;
  _tarCrearMostrarPaso(prev);
}
function _tarCrearIrSiguiente() {
  if (_tarCrearCurIdx === 0 && !_tarCrearPaso0Valido()) return;
  if (_TAR_CREAR_STEPS[_tarCrearCurIdx] === 'tar-crear-paso-modo' && !_tarCrearData.modoAsignacion) return;
  var next = _tarCrearCurIdx + 1;
  if (_TAR_CREAR_STEPS[next] === 'tar-crear-paso-personas' && _tarCrearData.modoAsignacion !== 'elegir') next++;
  _tarCrearMostrarPaso(next);
}
function _tarCrearPaso0Valido() { return !!(_tarCrearData.titulo && _tarCrearData.titulo.trim() && _tarCrearData.area); }
function _tarCrearPasoFechaValido() { return !!_tarCrearData.fecha; }
function _tarCrearActualizarFooter() {
  var btn = document.getElementById('tar-crear-btn-footer'); if (!btn) return;
  // Último paso: "Notas" -- siempre el último sin importar el modo elegido
  // (el picker de personas, si se muestra, va antes), el botón final se
  // calcula contra el largo real de _TAR_CREAR_STEPS para no tener que
  // tocar este número cada vez que se suma/saca un paso. La fecha sigue
  // siendo obligatoria para poder crear (se exige un paso antes, al salir
  // de "Fecha límite", pero se revalida acá también por las dudas).
  if (_tarCrearCurIdx === _TAR_CREAR_STEPS.length - 1) {
    btn.textContent = 'Crear tarea';
    btn.onclick = _tarCrearGuardar;
    btn.disabled = !_tarCrearPasoFechaValido();
  } else {
    btn.textContent = 'Continuar';
    btn.onclick = _tarCrearIrSiguiente;
    var pasoId = _TAR_CREAR_STEPS[_tarCrearCurIdx];
    btn.disabled = pasoId === 'tar-crear-paso-0' ? !_tarCrearPaso0Valido() :
      (pasoId === 'tar-crear-paso-modo' ? !_tarCrearData.modoAsignacion :
      (pasoId === 'tar-crear-paso-fecha' ? !_tarCrearPasoFechaValido() : false));
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
/* Paso nuevo "¿Cómo se asigna esta tarea?" -- reusa `.opcion`/`.opcion.sel`
   tal cual (css/ui.css), toggle de selección exclusiva a mano (sin
   `<input type="radio">` real, ver comentario en index.html). */
function _tarCrearSelModo(el, val) {
  document.querySelectorAll('#tar-crear-modo-opciones .opcion').forEach(function(o) { o.classList.remove('sel'); });
  el.classList.add('sel');
  _tarCrearData.modoAsignacion = val;
  _tarCrearActualizarFooter();
}

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
  // Repintado instantáneo, sin fade de grilla completa (ver MANIFEST.md
  // "Cambios recientes" -- pedido explícito: antes `_evFadeSwap()` envolvía
  // TODO el `innerHTML` acá, tanto al cambiar de mes como al tocar un día;
  // se sentía pesado para un cambio tan chico). Al cambiar de mes el
  // contenido entero cambia de todas formas (otros días), así que un fade
  // de grilla no comunicaba nada puntual -- el único fade que sobrevive es
  // el de la celda que cambia de seleccionada, ver `_tarCrearCalTocarDia()`
  // más abajo (togglea la clase sobre nodos YA renderizados en vez de
  // reconstruir el DOM, aprovechando el `transition: background-color`/
  // `background`/`color` que `.ev-cal-celda`/`.ev-cal-num` ya traen de
  // fábrica, css/eventos.css, pensado exactamente para este caso).
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
  // Fade acotado a la celda tocada (ver comentario en `_tarCrearCalRender()`)
  // -- ya NO reconstruye la grilla entera, solo togglea `.ev-ant-cal-sel`
  // sobre la celda vieja (la pierde) y la nueva (la gana), nodos que ya
  // están en el DOM -- la transición CSS existente hace el resto.
  var anterior = _tarCrearData.fecha;
  _tarCrearData.fecha = iso;
  if (anterior && anterior !== iso) {
    var celdaVieja = document.querySelector('#tar-crear-cal .ev-cal-celda[data-iso="' + anterior + '"]');
    if (celdaVieja) celdaVieja.classList.remove('ev-ant-cal-sel');
  }
  var celdaNueva = document.querySelector('#tar-crear-cal .ev-cal-celda[data-iso="' + iso + '"]');
  if (celdaNueva) celdaNueva.classList.add('ev-ant-cal-sel');
  var resumen = document.getElementById('tar-crear-cal-resumen');
  if (resumen) resumen.textContent = _evAntFechaLegible(iso);
  _tarCrearActualizarFooter();
  _tarActualizarDiasParaCompletar();
}

/* "X días para realizar la tarea" (ver MANIFEST.md "Cambios recientes") --
   texto rojo al lado de "Fecha límite", con fade in/out al cambiar la
   fecha en vez de un salto seco: si el TEXTO cambia (primera vez que
   aparece, o cruza el límite singular/plural "1 día" <-> "N días") fadea
   `#tar-crear-dias-wrap` completo (`_evFadeSwap()`, js/eventos.js); si el
   número cambia pero la frase de al lado se mantiene igual (ej. 5 días ->
   8 días), fadea solo `#tar-crear-dias-num`. */
function _tarActualizarDiasParaCompletar() {
  var wrap = document.getElementById('tar-crear-dias-wrap');
  var numEl = document.getElementById('tar-crear-dias-num');
  var restoEl = document.getElementById('tar-crear-dias-resto');
  if (!wrap || !numEl || !restoEl) return;
  var fecha = _tarCrearData.fecha;
  if (!fecha) { wrap.style.display = 'none'; _tarCrearDiasAnterior = null; return; }
  var hoy = _evParseISO(_evHoyISO());
  var d = _evParseISO(fecha);
  var dias = Math.max(0, Math.round((d - hoy) / 86400000));
  var restoTexto = dias === 1 ? ' día para realizar la tarea' : ' días para realizar la tarea';
  var yaVisible = wrap.style.display !== 'none';
  var cambioSingularPlural = _tarCrearDiasAnterior == null || (_tarCrearDiasAnterior === 1) !== (dias === 1);
  wrap.style.display = 'inline-flex';
  if (!yaVisible || cambioSingularPlural) {
    _evFadeSwap(wrap, function() { numEl.textContent = dias; restoEl.textContent = restoTexto; }, false, 180);
  } else {
    _evFadeSwap(numEl, function() { numEl.textContent = dias; }, false, 180);
  }
  _tarCrearDiasAnterior = dias;
}

/* ── Paso "Asignar personas" (nuevo, opcional) -- mismo patrón de búsqueda +
   lista que "Marcar asistencia" de Eventos (.app-nav-search/.ev-marcar-lista/
   .ev-roster-fila/.ev-roster-nombre/.ev-roster-vacio, css/eventos.css) y el
   mismo roster precargado (_evRosterEquipo/_evPrecargarRoster(), js/eventos.js
   -- sin pedirlo de nuevo), pero con selección MÚLTIPLE vía checkmarks
   (.fi-circle, css/reservas.css -- círculo con check, ya usado como
   indicador de selección en Reservas) en vez del toggle exclusivo de 2
   estados que usa esa pantalla (A horario/Tarde no aplica acá: elegir a
   alguien acá no marca asistencia, solo la deja pre-asignada). ────────── */
// Tope real = "Máximo de personas que pueden trabajar en esta tarea" (paso
// de puntos/cupos, `#tar-crear-cupos`, mismo `<input type="hidden">` que ya
// lee `_tarCrearGuardar()`) -- fuente única, sin duplicar el número acá.
function _tarCrearMaxPersonas() {
  var cuposEl = document.getElementById('tar-crear-cupos');
  return cuposEl ? (parseInt(cuposEl.value, 10) || 1) : 1;
}
function _tarCrearFiltrarPersonas(q) { _tarCrearRenderPersonas(q); }
function _tarCrearRenderPersonas(q) {
  var cont = document.getElementById('tar-crear-personas-lista');
  if (!cont) return;
  if (typeof _evRosterEquipo === 'undefined' || _evRosterEquipo === null) {
    cont.innerHTML = '<div class="ev-roster-vacio">Cargando equipo...</div>';
    return;
  }
  var roster = _evRosterEquipo || [];
  var qn = (q || '').toLowerCase().trim();
  var filtrado = qn ? roster.filter(function(p) { return (p.nombreDerby || '').toLowerCase().indexOf(qn) !== -1 || String(p.nombre).toLowerCase().indexOf(qn) !== -1; }) : roster;
  if (!filtrado.length) {
    var vacioHtml = '<div class="ev-roster-vacio">' + (roster.length ? 'Sin resultados.' : 'No se pudo cargar el equipo.') + '</div>';
    _evFadeSwap(cont, function() { cont.innerHTML = vacioHtml; });
    return;
  }
  // Bug real corregido (ver MANIFEST.md "Cambios recientes"): el picker no
  // capeaba la selección contra "Máximo de personas" del paso de cupos --
  // se podía elegir más gente de la que la tarea admite. Al llegar al tope,
  // las filas no elegidas se deshabilitan (sin onclick, atenuadas) y se
  // suma un aviso explícito arriba de la lista.
  var max = _tarCrearMaxPersonas();
  var enLimite = _tarCrearData.asignarA.length >= max;
  var avisoHtml = enLimite ? '<p class="tar-limite-nota" style="margin:0 0 10px;text-align:left;">Ya elegiste el máximo de personas para esta tarea (' + max + ').</p>' : '';
  var listaHtml = avisoHtml + filtrado.map(function(p) {
    var nombreAttr = String(p.nombre).replace(/'/g, "\\'");
    var sel = _tarCrearData.asignarA.indexOf(p.nombre) !== -1;
    var deshabilitada = enLimite && !sel;
    return '<div class="ev-roster-fila tar-persona-fila' + (deshabilitada ? ' tar-persona-fila-disabled' : '') + '"' +
      (deshabilitada ? '' : ' onclick="_tarCrearTogglePersona(this,\'' + nombreAttr + '\')"') + '>' +
      '<span class="ev-roster-nombre">' + (p.nombreDerby || p.nombre) + '</span>' +
      '<div class="fi-circle' + (sel ? ' sel' : '') + '"><span class="material-symbols-outlined">check</span></div>' +
    '</div>';
  }).join('');
  // Fade in/out (ver MANIFEST.md "Cambios recientes") en vez de un
  // `innerHTML=` seco -- cubre tanto la aparición/desaparición del aviso de
  // "máximo alcanzado" como el reordenamiento de la lista debajo (ambos
  // viven dentro del mismo repintado de `cont`, un solo fade para los 2).
  _evFadeSwap(cont, function() { cont.innerHTML = listaHtml; });
}
// Si el roster tardó más que la carga del wizard en llegar (mismo caso raro
// que _evRepintarMarcarAsistSiHaceFalta(), ver esa función) -- repinta solo
// si el usuario sigue parado en este paso puntual.
function _tarCrearRepintarPersonasSiHaceFalta() {
  var paso = document.getElementById('tar-crear-paso-personas');
  if (!paso || !paso.classList.contains('activo')) return;
  var inp = document.getElementById('tar-crear-personas-search');
  _tarCrearRenderPersonas(inp ? inp.value : '');
}
function _tarCrearTogglePersona(el, nombre) {
  var idx = _tarCrearData.asignarA.indexOf(nombre);
  if (idx === -1) {
    if (_tarCrearData.asignarA.length >= _tarCrearMaxPersonas()) return; // fila ya viene deshabilitada -- guard de más
    _tarCrearData.asignarA.push(nombre);
  } else {
    _tarCrearData.asignarA.splice(idx, 1);
  }
  // Repinta la lista entera (no solo el círculo tocado) -- al llegar al
  // tope hay que deshabilitar el resto de las filas (o rehabilitarlas al
  // soltar una), algo que un toggle puntual del círculo no refleja.
  var inp = document.getElementById('tar-crear-personas-search');
  _tarCrearRenderPersonas(inp ? inp.value : '');
}

// `adminCrearTarea` -- Bug real corregido (ver MANIFEST.md "Cambios
// recientes"): esta acción vive en el router de GET (doGet) del backend, no
// en doPost -- llamarla con apiPost() (POST) devolvía "Acción POST no
// válida". Fix: usa adminApi() (api() GET + adminToken inyectado), mismo
// mecanismo que ya usan el resto de las acciones admin* de Venues/Tareas
// (adminGetTareasPendientesValidacion, adminGuardarEquipamiento, etc.) --
// nunca se agregó adminCrearTarea al router de POST, el fix es 100%
// frontend.
function _tarCrearGuardar() {
  if (!_tarCrearPaso0Valido() || !_tarCrearPasoFechaValido()) return;
  var puntosEl = document.getElementById('tar-crear-puntos');
  var cuposEl = document.getElementById('tar-crear-cupos');
  var datos = {
    titulo: _tarCrearData.titulo.trim(),
    notas: _tarCrearData.notas || '',
    area: _tarCrearData.area,
    puntos: puntosEl ? (parseFloat(puntosEl.value) || 0) : 0,
    maxAsignados: cuposEl ? (parseInt(cuposEl.value, 10) || 1) : 1,
    fechaVencimiento: _tarCrearData.fecha,
    creadoPor: E.nombre,
    // Opcional -- si viene con gente, el backend crea la asignación directo
    // (estado 'iniciada') para cada unx y la tarea pasa a 'en_progreso'.
    asignarA: _tarCrearData.asignarA
  };
  mostrarCargando('Creando tarea...');
  adminApi({ action: 'adminCrearTarea', datos: JSON.stringify(datos) }, function(res) {
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
   js/admin.js) que abre una SUBSECCIÓN de página completa (`#s-tareas-validar`,
   mismo patrón `.pantalla`+`ir()` que el wizard "Nueva tarea" -- ver
   MANIFEST.md "Cambios recientes": un bottom sheet no escala bien con
   muchas tareas pendientes a la vez, más difícil de scrollear/leer que una
   pantalla completa) con las filas .admin-banner-res-row ya existentes
   (css/admin.css) -- Aprobar/Rechazar, Rechazar revela un textarea corto
   antes de confirmar. */
// "Tareas por validar" -- antes un ícono propio en `.ev-header-row` (visible
// siempre, con su propio gating por `_adminToken`), ahora una opción del FAB
// de admin (`#tar-fab-menu`, ver MANIFEST.md "Cambios recientes") -- el FAB
// entero ya solo se muestra con `_adminToken` (`ir()`/js/ui.js), así que acá
// no hace falta repetir ese chequeo por separado: solo el número del badge.
function _tarCargarPendientesValidacion() {
  if (!_adminToken) { _tarPendientesValidacion = []; _tarActualizarBadgeValidacion(); return; }
  adminApi({ action: 'adminGetTareasPendientesValidacion' }, function(res) {
    _tarPendientesValidacion = res || [];
    _tarActualizarBadgeValidacion();
  }, function() { _tarPendientesValidacion = []; _tarActualizarBadgeValidacion(); });
}
function _tarActualizarBadgeValidacion() {
  var badge = document.getElementById('tar-validar-badge');
  if (!badge) return;
  var n = _tarPendientesValidacion.length;
  badge.style.display = n > 0 ? 'flex' : 'none';
  badge.textContent = n > 9 ? '9+' : String(n);
}
// Speed-dial del FAB de #s-tareas -- mismo mecanismo que
// `_evFabToggle()`/`_evFabCerrar()` (js/eventos.js), estado propio
// (`_tarFabAbierto`, no comparte `_evFabAbierto`).
var _tarFabAbierto = false;
function _tarFabToggle() {
  _tarFabAbierto = !_tarFabAbierto;
  var menu = document.getElementById('tar-fab-menu');
  if (menu) menu.classList.toggle('ev-fab-abierto', _tarFabAbierto);
  var btn = document.getElementById('tar-fab-btn');
  if (btn) btn.setAttribute('aria-expanded', String(_tarFabAbierto));
}
function _tarFabCerrar() {
  if (!_tarFabAbierto) return;
  _tarFabAbierto = false;
  var menu = document.getElementById('tar-fab-menu');
  if (menu) menu.classList.remove('ev-fab-abierto');
  var btn = document.getElementById('tar-fab-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', function(e) {
  if (!_tarFabAbierto) return;
  var menu = document.getElementById('tar-fab-menu');
  if (menu && !menu.contains(e.target)) _tarFabCerrar();
});
function _tarAbrirValidacion() {
  _tarRenderValidacion();
  ir('s-tareas-validar');
}
function _tarCerrarValidacion() {
  ir('s-tareas');
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
  // Mismo bug sistémico que tomarTarea/etc. (ver arriba) -- adminValidarTarea
  // también vive en doGet. Usa adminApi() (GET + adminToken inyectado, mismo
  // mecanismo que adminCrearTarea/adminGetTareasPendientesValidacion) en vez
  // de apiPost() con adminToken armado a mano.
  adminApi({ action: 'adminValidarTarea', idAsignacion: idAsignacion, accion: accion, notaRechazo: nota || '' }, function(res) {
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

/* ── "Gestionar tareas activas" (admin) -- Nuevo, ver MANIFEST.md "Cambios
   recientes". A diferencia de "Disponibles" (solo tareas con cupos
   libres, sin mostrar las ya tomadas) y de "Tareas por validar" (solo
   asignaciones `pendiente_revision`), esta vista trae TODAS las tareas
   activas con TODAS sus asignaciones -- `adminGetTareasActivas`, sin
   params -- resuelve el caso de una tarea asignada directo al crearla
   (queda en `en_progreso` con gente en estado `iniciada`) que hoy no
   aparece en ningún lado hasta que la propia persona la manda a revisión.
   Aprobar/Rechazar quedan disponibles para CUALQUIER asignación activa
   (`iniciada` O `pendiente_revision`), no solo `pendiente_revision` -- el
   admin puede validar directo sin esperar. Mismo patrón .pantalla+ir() que
   Validar/Archivadas; cada tarea es una card (mismo esqueleto que el resto
   de la sección, ícono+pills+`_tarIconoBoxHtml()`/`_tarPillsRowHtml()`)
   con sus asignaciones anidadas debajo como filas `.admin-banner-res-row`
   (mismo componente que "Tareas por validar", ver esa sección arriba) --
   acá se necesita agrupar por tarea (a diferencia de la lista plana de
   "Tareas por validar") para no repetir el ícono/pills de la tarea una vez
   por persona asignada.
   Asunción marcada a propósito (sin contrato explícito del shape de
   `adminGetTareasActivas`, endpoint nuevo): cada tarea trae su lista de
   asignaciones en `t.asignaciones`, con fallback a `t.asignados` (mismo
   nombre de campo que ya usan getTareasDisponibles/getMisTareas, por si el
   backend lo reusa) -- cada asignación con `idAsignacion`/`estado` +
   nombre en `nombreDerby`/`nombreUsuario`/`nombre` (mismos alias que el
   resto de la sección ya contempla). Si el backend real difiere, este es
   el punto exacto a ajustar. */
var _tarActivas = [];
var _tarActivasCargaId = 0;
function irTarGestionar() {
  ir('s-tareas-gestionar');
  _tarCargarGestionar();
}
function _tarCerrarGestionar() { ir('s-tareas'); }
function _tarAsignacionesDe(t) { return t.asignaciones || t.asignados || []; }
function _tarNombreAsignacion(a) { return a.nombreDerby || a.nombreUsuario || a.nombre || ''; }
function _tarCargarGestionar() {
  var miCarga = ++_tarActivasCargaId;
  var cont = document.getElementById('tar-gestionar-lista');
  if (cont) cont.innerHTML = _tarSkeletonHtml(3);
  adminApi({ action: 'adminGetTareasActivas' }, function(res) {
    if (miCarga !== _tarActivasCargaId) return;
    _tarActivas = res || [];
    _tarRenderGestionar();
  }, function(e) {
    if (miCarga !== _tarActivasCargaId) return;
    if (typeof console !== 'undefined' && console.error) console.error('adminGetTareasActivas falló:', e);
    var c = document.getElementById('tar-gestionar-lista');
    if (c) c.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">error_outline</span>No se pudieron cargar las tareas activas.' +
      '<button type="button" class="btn-text-simple tar-reintentar-btn" onclick="_tarCargarGestionar()"><span class="material-symbols-outlined">refresh</span>Reintentar</button>' +
      '</div>';
  });
}
function _tarRenderGestionar() {
  var cont = document.getElementById('tar-gestionar-lista');
  if (!cont) return;
  if (!_tarActivas.length) {
    cont.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">task_alt</span>No hay tareas activas por ahora.</div>';
    return;
  }
  cont.innerHTML = _tarActivas.map(_tarGestionarCardHtml).join('');
}
// Fila de una asignación individual dentro de la card de su tarea --
// Aprobar/Rechazar visibles para `iniciada`/`pendiente_revision` (pedido
// explícito: el admin no necesita esperar a que la persona la mande a
// revisión), badge de estado final (mismo `_tarArchivadaEstadoBadge()` ya
// usado en Archivadas) para asignaciones ya resueltas.
function _tarGestionarFilaHtml(a) {
  var estado = a.estado;
  var nombre = _tarNombreAsignacion(a);
  var pendiente = estado === 'iniciada' || estado === 'pendiente_revision';
  var accionesHtml = pendiente ?
    '<div class="admin-banner-res-actions">' +
      '<button class="admin-banner-btn admin-banner-btn-ok" onclick="_tarGestionarAprobar(\'' + a.idAsignacion + '\')" aria-label="Aprobar"><span class="material-symbols-outlined">check</span></button>' +
      '<button class="admin-banner-btn admin-banner-btn-no" onclick="_tarGestionarMostrarRechazo(\'' + a.idAsignacion + '\')" aria-label="Rechazar"><span class="material-symbols-outlined">close</span></button>' +
    '</div>' :
    _tarArchivadaEstadoBadge(estado);
  return '<div class="admin-banner-res-row" id="tar-gest-row-' + a.idAsignacion + '" style="flex-wrap:wrap;">' +
    '<div class="admin-banner-res-info">' +
      '<div class="admin-banner-res-nombre">' + nombre + '</div>' +
      '<div class="admin-banner-res-fecha">' + (estado === 'pendiente_revision' ? 'Esperando validación' : (estado === 'iniciada' ? 'En curso' : '')) + '</div>' +
    '</div>' +
    accionesHtml +
    (pendiente ? '<div id="tar-gest-rechazo-' + a.idAsignacion + '" style="display:none;width:100%;margin-top:8px;">' +
      '<textarea id="tar-gest-nota-' + a.idAsignacion + '" placeholder="Motivo del rechazo (opcional)..." style="min-height:60px;resize:none;width:100%;font-size:0.8rem;"></textarea>' +
      '<button class="btn btn-danger tar-card-btn" style="padding:10px;margin-top:6px;" onclick="_tarGestionarConfirmarRechazo(\'' + a.idAsignacion + '\')"><span class="material-symbols-outlined">close</span>Confirmar rechazo</button>' +
    '</div>' : '') +
  '</div>';
}
function _tarGestionarCardHtml(t) {
  var asignaciones = _tarAsignacionesDe(t);
  var cupos = { tomados: asignaciones.length, total: t.cuposTotales != null ? t.cuposTotales : asignaciones.length };
  var personasHtml = asignaciones.length ?
    '<div class="tar-gestionar-personas">' + asignaciones.map(_tarGestionarFilaHtml).join('') + '</div>' :
    '<p style="font-size:0.78rem;color:var(--muted);margin:12px 0 0;">Todavía nadie tomó esta tarea.</p>';
  return '<div class="ev-card" id="tar-gest-card-' + t.idTarea + '">' +
    '<div class="ev-card-body">' +
      '<div class="tar-card-header">' +
        '<div class="ev-card-titulo">' + (t.titulo || '') + '</div>' +
        _tarIconoBoxHtml(t.area, _tarTieneAprobada(asignaciones)) +
      '</div>' +
      _tarPillsRowHtml(t.area, t.puntos, t.fechaVencimiento, cupos) +
      personasHtml +
    '</div>' +
  '</div>';
}
function _tarGestionarAprobar(idAsignacion) { _tarGestionarEnviar(idAsignacion, 'aprobar', ''); }
function _tarGestionarMostrarRechazo(idAsignacion) {
  var wrap = document.getElementById('tar-gest-rechazo-' + idAsignacion);
  if (!wrap) return;
  wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}
function _tarGestionarConfirmarRechazo(idAsignacion) {
  var nota = document.getElementById('tar-gest-nota-' + idAsignacion);
  _tarGestionarEnviar(idAsignacion, 'rechazar', nota ? nota.value : '');
}
// Mismo endpoint/contrato que `_tarValidarEnviar()` (`adminValidarTarea`,
// GET+adminToken) -- reimplementado acá en vez de compartir función porque
// esta vista recarga/repinta agrupado por tarea (`_tarCargarGestionar()`),
// no la lista plana de `_tarPendientesValidacion`. Sincroniza de paso el
// badge de "Tareas por validar" (`_tarCargarPendientesValidacion()`) --
// aprobar/rechazar acá también puede sacar asignaciones de esa lista si
// estaban en `pendiente_revision`.
function _tarGestionarEnviar(idAsignacion, accion, nota) {
  var row = document.getElementById('tar-gest-row-' + idAsignacion);
  if (row) row.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
  adminApi({ action: 'adminValidarTarea', idAsignacion: idAsignacion, accion: accion, notaRechazo: nota || '' }, function(res) {
    if (res && res.exito === false) {
      if (row) row.querySelectorAll('button').forEach(function(b) { b.disabled = false; });
      mostrarToast(res.error || 'No se pudo procesar la validación.', 'error');
      return;
    }
    _tarCargarGestionar();
    _tarCargarPendientesValidacion();
  }, function(e) {
    if (row) row.querySelectorAll('button').forEach(function(b) { b.disabled = false; });
    mostrarToast((e && e.message) || 'No se pudo procesar la validación.', 'error');
  });
}

/* ── "Tareas archivadas" -- subsección de página completa, visible para
   cualquiera (sin gating de _adminToken, a diferencia del wizard/panel de
   validación de arriba): lista de solo consulta de `getTareasArchivadas`
   (sin params). Nada es editable acá para usuarios normales -- el único
   admin* real es el botón "Eliminar" por tarjeta (más abajo), gateado con
   el mismo criterio que el resto de la app (`_adminToken` truthy). ────── */
function irTarArchivadas() {
  ir('s-tareas-archivadas');
  _tarActualizarBotonesFiltro('archivadas');
  _tarCargarArchivadas();
}
function _tarCerrarArchivadas() {
  ir('s-tareas');
}
// `_tarArchCargaId` -- mismo guard anti-carrera que `_tarCargaId` en
// `_tarCargarTodo()`: si el usuario entra/sale de Archivadas rápido (2
// llamadas en vuelo), solo la respuesta de la carga más reciente pinta.
var _tarArchCargaId = 0;
function _tarCargarArchivadas() {
  var miCarga = ++_tarArchCargaId;
  var cont = document.getElementById('tar-archivadas-lista');
  if (cont) cont.innerHTML = _tarSkeletonHtml(3);
  api({ action: 'getTareasArchivadas' }, function(res) {
    if (miCarga !== _tarArchCargaId) return;
    _tarArchivadas = res || [];
    _tarRenderArchivadas();
  }, function(e) {
    if (miCarga !== _tarArchCargaId) return;
    // Loguea el error real (antes se descartaba del todo) -- clave para
    // poder diagnosticar la próxima vez que esto falle en vivo, en vez de
    // quedar solo con el mensaje genérico de la UI.
    if (typeof console !== 'undefined' && console.error) console.error('getTareasArchivadas falló:', e);
    var c = document.getElementById('tar-archivadas-lista');
    if (c) c.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">error_outline</span>No se pudieron cargar las tareas archivadas.' +
      '<button type="button" class="btn-text-simple tar-reintentar-btn" onclick="_tarCargarArchivadas()"><span class="material-symbols-outlined">refresh</span>Reintentar</button>' +
      '</div>';
  });
}
function _tarRenderArchivadas() {
  var cont = document.getElementById('tar-archivadas-lista');
  if (!cont) return;
  var filtradas = _tarArchivadas.filter(function(t) { return _tarPasaFiltro('archivadas', _tarNormalizarArchivada(t)); });
  if (!filtradas.length) {
    cont.innerHTML = (_tarArchivadas.length && _tarFiltroActivo('archivadas')) ?
      '<div class="ev-lista-vacia"><span class="material-symbols-outlined">filter_alt_off</span>No hay tareas que coincidan con estos filtros.</div>' :
      '<div class="ev-lista-vacia"><span class="material-symbols-outlined">archive</span>Todavía no hay tareas archivadas.</div>';
    return;
  }
  cont.innerHTML = filtradas.map(_tarCardArchivadaHtml).join('');
  _tarHidratarAvataresArchivadas();
}
// Chip chico de estado final por persona -- inline (no `.badge-confirmada`/
// `.badge-cancelada`, css/ui.css: esos nombres son de estados de RESERVA,
// tomar uno prestado acá por el color nada más sería confuso a futuro) con
// los mismos tokens de color que ya usa el resto de la app para
// éxito/error (`--success`/`--danger` + sus `-bg`, css/colors.css).
function _tarArchivadaEstadoBadge(estado) {
  var aprobada = estado === 'aprobada';
  var color = aprobada ? 'var(--success)' : 'var(--danger)';
  var bg = aprobada ? 'var(--success-bg)' : 'var(--danger-bg)';
  var texto = aprobada ? 'Aprobada' : 'Rechazada';
  return '<span style="font-size:0.66rem;font-weight:800;padding:2px 9px;border-radius:20px;background:' + bg + ';color:' + color + ';white-space:nowrap;flex-shrink:0;">' + texto + '</span>';
}
function _tarCardArchivadaHtml(t) {
  var personas = t.personas || [];
  var personasHtml = personas.length ?
    '<div class="tar-archivada-personas">' + personas.map(function(p) {
      var foto = (p.fotoPerfil || '').replace(/"/g, '&quot;');
      var nombre = (p.nombreDerby || p.nombre || '').replace(/"/g, '&quot;');
      return '<div class="tar-archivada-persona-fila">' +
        '<div class="avatar-pill avatar-pill--xs" data-nombre="' + nombre + '" data-foto="' + foto + '"></div>' +
        '<span class="tar-archivada-persona-nombre">' + (p.nombreDerby || p.nombre || '') + '</span>' +
        _tarArchivadaEstadoBadge(p.estado) +
      '</div>';
    }).join('') + '</div>' :
    '<p style="font-size:0.78rem;color:var(--muted);margin:10px 0 0;">Nadie trabajó en esta tarea.</p>';
  // Botón "Eliminar" -- admin-only, mismo criterio que cualquier otro botón
  // admin* de una card (ej. `_evAccionAdminHtml()`, js/eventos.js): togglea
  // por `_adminToken` en el propio render, no por CSS.
  var accionAdmin = _adminToken ? '<button type="button" class="btn btn-danger tar-card-btn" onclick="_tarEliminarArchivadaAbrir(\'' + t.idTarea + '\')"><span class="material-symbols-outlined">delete</span>Eliminar</button>' : '';
  var cupos = t.cuposTotales != null ? { tomados: personas.length, total: t.cuposTotales } : null;
  return '<div class="ev-card" id="tar-archivada-card-' + t.idTarea + '">' +
    '<div class="ev-card-body">' +
      '<div class="tar-card-header">' +
        '<div class="ev-card-titulo">' + (t.titulo || '') + '</div>' +
        _tarIconoBoxHtml(t.area, _tarTieneAprobada(personas)) +
      '</div>' +
      _tarPillsRowHtml(t.area, t.puntos, t.fechaVencimiento, cupos) +
      personasHtml +
      accionAdmin +
    '</div>' +
  '</div>';
}
function _tarHidratarAvataresArchivadas() {
  document.querySelectorAll('#tar-archivadas-lista [data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, el.getAttribute('data-foto') || '', el.getAttribute('data-nombre'));
  });
}

/* ── Eliminar tarea archivada (admin, destructivo e irreversible) ─────────
   Mismo nivel de fricción que cualquier otra eliminación permanente de la
   app: antes de poder confirmar, el modal muestra explícitamente el
   impacto real (quién pierde cuántos puntos), no solo un genérico
   "¿Estás seguro?" -- ver #modal-tar-eliminar-archivada, index.html. */
function _tarEliminarArchivadaAbrir(idTarea) {
  var t = _tarArchivadas.filter(function(x) { return String(x.idTarea) === String(idTarea); })[0];
  if (!t) return;
  _tarEliminarArchivadaIdPendiente = idTarea;
  var personas = (t.personas || []).filter(function(p) { return p.estado === 'aprobada'; });
  var mesAnio = _tarArchivadaMesAnio(t.fechaVencimiento);
  var cont = document.getElementById('tar-eliminar-archivada-impacto');
  if (cont) {
    if (!personas.length) {
      cont.innerHTML = '<p style="font-size:0.85rem;color:var(--muted);margin:0;">Nadie tiene puntos aprobados en esta tarea -- no hay impacto de puntos.</p>';
    } else {
      cont.innerHTML = personas.map(function(p) {
        var nombre = p.nombreDerby || p.nombre || '';
        return '<div style="display:flex;gap:10px;align-items:center;padding:10px 12px;background:var(--danger-bg);border:1px solid var(--danger-bdr);border-radius:10px;">' +
          '<span class="material-symbols-outlined" style="color:var(--danger);font-size:1.1rem;flex-shrink:0;">remove_circle</span>' +
          '<span style="font-size:0.85rem;color:var(--text);">' + nombre + ' perderá ' + (t.puntos != null ? t.puntos : 0) + ' puntos' + (mesAnio ? ' de ' + mesAnio : '') + '.</span>' +
        '</div>';
      }).join('');
    }
  }
  var btn = document.getElementById('tar-eliminar-archivada-btn-confirmar');
  if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
  var m = document.getElementById('modal-tar-eliminar-archivada');
  if (!m) return;
  m.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.opacity = '1'; }); });
  _registrarOverlayAbierto(_tarEliminarArchivadaCerrar);
}
function _tarEliminarArchivadaCerrar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-tar-eliminar-archivada');
  if (!m) return;
  m.style.opacity = '0';
  setTimeout(function() { m.style.display = 'none'; }, 300);
  _tarEliminarArchivadaIdPendiente = null;
}
function _tarEliminarArchivadaConfirmar() {
  if (!_tarEliminarArchivadaIdPendiente) return;
  var idTarea = _tarEliminarArchivadaIdPendiente;
  var btn = document.getElementById('tar-eliminar-archivada-btn-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Eliminando...'; }
  // Mismo bug sistémico que el resto de las acciones de Tareas (ver arriba)
  // -- adminEliminarTareaArchivada vive en doGet, no en doPost. adminApi()
  // (GET + adminToken inyectado) desde el principio acá, nunca se escribió
  // con apiPost().
  adminApi({ action: 'adminEliminarTareaArchivada', idTarea: idTarea }, function(res) {
    if (res && res.exito === false) {
      if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
      mostrarToast(res.error || 'No se pudo eliminar la tarea.', 'error');
      return;
    }
    // Cierra vía history.back() (sin `true`) -- mismo mecanismo que el resto
    // de los overlays de la app (`_registrarOverlayAbierto()`, js/ui.js):
    // dispara el popstate que a su vez llama a `_tarEliminarArchivadaCerrar(true)`
    // de vuelta y recién ahí anima el cierre real; cerrar "directo" con
    // `true` acá dejaría un estado de historial fantasma sin popear.
    _tarEliminarArchivadaCerrar();
    _tarArchivadas = _tarArchivadas.filter(function(x) { return String(x.idTarea) !== String(idTarea); });
    _tarRenderArchivadas();
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
    mostrarToast((e && e.message) || 'No se pudo eliminar la tarea.', 'error');
  });
}
// Asunción marcada a propósito (sin contrato explícito del backend sobre
// "de qué mes son esos puntos" más allá del ejemplo del pedido -- "Sant
// perderá 8 puntos de agosto 2026"): se usa el mes/año de la propia
// `fechaVencimiento` de la tarea archivada como proxy de "cuándo se
// ganaron", el único dato de fecha real que trae. Si el backend atribuye
// los puntos a un mes distinto (ej. la fecha en que se validó/aprobó, no
// el vencimiento original), este es el punto exacto a ajustar.
function _tarArchivadaMesAnio(fechaVencimiento) {
  if (!fechaVencimiento) return '';
  var s = fechaVencimiento.toString();
  var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(s);
  var d;
  if (m) d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
  else { d = new Date(s); if (isNaN(d.getTime())) return ''; }
  return NOMBRES_MESES[d.getMonth()].toLowerCase() + ' ' + d.getFullYear();
}
