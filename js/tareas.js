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
var _tarBaulAbierto = false;
var _tarPendientesValidacion = [];
var _tarArchivadas = [];
var _tarEliminarArchivadaIdPendiente = null;
// Sección "por defecto" del selector de salto rápido del header (`null` ->
// pantalla fusionada de una sola vista con scroll, ver "Cambios recientes")
// -- `'mis'`/`'disponibles'`/`'baul'`, calculada por
// `_tarActualizarLayoutTablero()` en cada re-render. `_tarSelectorNecesario`
// (boolean) refleja si el contenido de las 3 secciones combinadas excede el
// viewport visible -- ver `_tarActualizarSelectorHeader()`.
var _tarSeccionDefault = null;
var _tarSelectorNecesario = false;

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
  'Logística': 'inventory',
  'Entrenamientos': 'sports',
  'Eventos': 'event',
  'Finanzas': 'savings',
  'Mantenimiento': 'build',
  'Redes Sociales y Comunicación': 'thumbs_up_down',
  'Reclutamiento': 'group_add',
  'Otro': 'help'
};

/* ── Ícono de card + pills compartidas (Disponibles/Baúl/Mis tareas/
   Archivadas/Gestionar) -- ver MANIFEST.md "Cambios recientes" (rediseño de
   card, mockup de lista): el ícono de área se fusiona con el título en una
   sola fila (`_tarCardHeaderHtml()`, más abajo -- reemplaza la pill de área
   suelta que vivía en la esquina, `_tarAreaPillHtml()`, eliminada: el área
   ya solo se comunica vía el ícono), y las pills de Puntos/Vencimiento se
   unifican en una sola fila `.fi-pills` (mismo componente pill sutil ya
   usado en el resto de la app, css/reservas.css). Un solo par de helpers
   reusado por los 5 templates de card en vez de repetir el mismo HTML 5
   veces. */
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
// Puntos ("Vale por N puntos", antes "N pts") + Vencimiento ("Vence el
// [día]", ver MANIFEST.md "Cambios recientes" -- rediseño de card: antes
// esta fila podía leerse como un texto de puntos duplicado por lo parecido
// de las 2 pills a simple vista -- ahora cada una lleva su propio ícono e
// texto sin ambigüedad, y NUNCA hay una segunda pill de puntos acá). El
// ícono de la pill de vencimiento sale de `_tarFechaInfo()` (dinámico según
// color/urgencia, ver esa función) en vez de quedar fijo -- `event` para
// rojo/naranja (sin cambios), `hourglass_top` para el estado "verde" (falta
// bastante para vencer, pedido explícito). `fechaOverride` (opcional) =
// `{ texto, clase, icono }` -- salta el cálculo relativo de `_tarFechaInfo()`
// y usa estos valores tal cual, solo lo pasa `_tarCardArchivadaHtml()`
// (Archivadas no muestra "vence en X días", siempre "Finalizada el..."/
// "Venció el..." fijos).
function _tarPillsRowHtml(puntos, fechaRaw, fechaOverride) {
  var fi = fechaOverride || _tarFechaInfo(fechaRaw);
  return '<div class="fi-pills" style="margin-top:8px;">' +
    '<span class="fi-pill fi-pill-dur"><span class="material-symbols-outlined">stars</span>Vale por ' + (puntos != null ? puntos : 0) + ' puntos</span>' +
    '<span class="fi-pill ' + fi.clase + '"><span class="material-symbols-outlined">' + (fi.icono || 'event') + '</span>' + fi.texto + '</span>' +
  '</div>';
}
// Descripción de la tarea (campo `notas`) -- SIEMPRE visible como texto
// plano debajo del título (ver MANIFEST.md "Cambios recientes" -- rediseño
// de card: reemplaza el acordeón colapsado "Descripción de la tarea ⌄" que
// tenía antes, `.fi-footer`/`.fi-body`, pedido explícito ya una vez antes
// de esta sesión y confirmado de nuevo acá -- sin ningún toggle/estado
// `.open` que mantener). Mismo `.fi-desc` (css/reservas.css) para el
// tipografía/color de texto secundario, sin el wrapper de acordeón.
function _tarDescHtml(notas) {
  if (!notas) return '';
  return '<p class="fi-desc tar-desc" style="margin:8px 0 0;">' + notas + '</p>';
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

// `esBusqueda: true` (busqueda/busquedaArch) -- las únicas 2 con input de
// texto propio que hay que enfocar al abrir y limpiar al cerrar (ver
// `_tarAbrirPanel()`/`_tarCerrarPanel()` más abajo). `secciones` (selector
// de salto rápido) es una simple lista de opciones, sin ese costado --
// comparte el mismo slot único/mecanismo de burbuja inline
// (`.ev-header-burbuja`) sin necesitar su propio open/close a mano.
var _TAR_PANELES = {
  busqueda: { el: 'tar-busqueda-panel', btn: 'tar-busqueda-toggle-btn', esBusqueda: true },
  busquedaArch: { el: 'tarch-busqueda-panel', btn: 'tarch-busqueda-toggle-btn', esBusqueda: true },
  secciones: { el: 'tar-secciones-panel', btn: 'tar-secciones-toggle-btn' }
};
// Un solo slot alcanza para las 3 (2 pantallas -- #s-tareas y
// #s-tareas-archivadas -- nunca están visibles a la vez, y dentro de
// #s-tareas las 2 burbujas propias -- búsqueda/secciones -- nunca tienen
// sentido abiertas juntas), así que nunca hay 2 a la vez.
var _tarPanelAbierto = null; // 'busqueda' | 'busquedaArch' | 'secciones'
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
  if (btn) btn.classList.add('ev-filtro-toggle-activo', 'ev-nav-mes-label-activo');
  if (cfg.esBusqueda) {
    var ctx = _tarCtxDePanel(tag);
    setTimeout(function() { var inp = document.getElementById(_tarPrefijo(ctx) + '-search-input'); if (inp) inp.focus(); }, 50);
  }
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
  if (btn) btn.classList.remove('ev-filtro-toggle-activo', 'ev-nav-mes-label-activo');
  if (cfg.esBusqueda) {
    var ctx = _tarCtxDePanel(tag);
    if (_tarFiltroBurbujaAbierta) { _tarColapsarFiltroBurbuja(ctx, _tarFiltroBurbujaAbierta); _tarFiltroBurbujaAbierta = null; _tarActualizarBotonesFiltro(ctx); }
    var inp = document.getElementById(_tarPrefijo(ctx) + '-search-input');
    if (inp) inp.value = '';
    _tarBuscar(ctx, '');
  }
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
// Selector de salto rápido -- sin sentido si no hay ninguna sección extra
// para saltar (ver `_tarActualizarSelectorHeader()`, que oculta el chevron
// y deja el botón inerte en ese caso, sin sacarlo del DOM).
function _tarToggleSecciones() {
  if (!_tarSelectorNecesario) return;
  _tarTogglePanel('secciones');
}

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
   (`_TAR_ICONOS_AREA`, ya incluye "Otro", index.html `#tar-crear-area-pills`),
   pills `.aj-pill` multi-select tal cual (mismo mecanismo que Lugar/Tipo de
   Eventos, `ajTogglePill()`-equivalente a mano acá). */
function _tarRenderFiltroAreaPills(ctx) {
  var cont = document.getElementById(_tarPrefijo(ctx) + '-filtro-area-pills');
  if (!cont) return;
  var f = _tarFiltroObj(ctx);
  var areas = Object.keys(_TAR_ICONOS_AREA);
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
  ir('s-tareas');
  // Refleja el estado de filtros persistido de una visita anterior a esta
  // sesión (los filtros NO se resetean al re-entrar, mismo criterio que
  // `_evTimelineFiltro` en Eventos) -- labels/badge de los triggers, no la
  // data en sí (eso lo cubre `_tarCargarTodo()` de abajo).
  _tarActualizarBotonesFiltro('principal');
  _tarCargarTodo();
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
  // Los encabezados de sección se muestran optimistamente mientras carga
  // (evita el hueco visual de cards-esqueleto sin ningún título arriba) --
  // `_tarRenderDisponibles()`/`_tarRenderMisTareas()`/`_tarRenderValidacion()`/
  // `_tarRenderGestionar()` los corrigen (ocultan si la sección terminó
  // realmente vacía) apenas resuelve cada llamada. Las 2 admin (Validar/
  // Gestión) solo se muestran optimistas si la cuenta YA es admin
  // (`_adminToken`, conocido sin red -- restaurado desde localStorage al
  // cargar la app) -- para una cuenta normal quedan ocultas de entrada, sin
  // parpadeo de skeleton-que-nunca-se-llena.
  var misHeader = document.getElementById('tar-mis-header');
  var dispHeader = document.getElementById('tar-disp-header');
  var validarHeader = document.getElementById('tar-validar-header');
  var gestionarHeader = document.getElementById('tar-gestionar-header');
  var contValidar = document.getElementById('tar-lista-validar');
  var contGestionar = document.getElementById('tar-lista-gestionar');
  var vacio = document.getElementById('tar-tablero-vacio');
  if (misHeader) misHeader.style.display = '';
  if (dispHeader) dispHeader.style.display = '';
  if (vacio) { vacio.style.display = 'none'; vacio.innerHTML = ''; vacio.classList.remove('tar-vacio-visible'); }
  if (contDisp) contDisp.innerHTML = _tarSkeletonHtml(2);
  if (contMis) contMis.innerHTML = _tarSkeletonHtml(2);
  if (_adminToken) {
    if (validarHeader) validarHeader.style.display = '';
    if (gestionarHeader) gestionarHeader.style.display = '';
    if (contValidar) contValidar.innerHTML = _tarSkeletonHtml(1);
    if (contGestionar) contGestionar.innerHTML = _tarSkeletonHtml(1);
  } else {
    if (validarHeader) validarHeader.style.display = 'none';
    if (gestionarHeader) gestionarHeader.style.display = 'none';
    if (contValidar) contValidar.innerHTML = '';
    if (contGestionar) contGestionar.innerHTML = '';
  }

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
  _tarCargarGestionar();
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
// Ya NO pinta un mensaje de "sin resultados"/"no hay tareas" propio -- ver
// MANIFEST.md "Cambios recientes" (fusión de Tareas en una sola pantalla
// con scroll): mismo criterio que el timeline fusionado de Eventos
// (`_evRenderTimeline()`), una sección sin contenido se oculta ENTERA
// (header `#tar-disp-header` + lista) en vez de mostrar un aviso propio --
// el único mensaje de vacío que puede verse es el global de
// `#tar-tablero-vacio`, cuando las 3 secciones combinadas quedan sin nada
// (ver `_tarActualizarLayoutTablero()`, llamada al final de esta función).
function _tarRenderDisponibles() {
  var cont = document.getElementById('tar-lista-disponibles');
  if (!cont) return;
  var disponibles = _tarDisponibles.filter(function(t) { return _tarPasaFiltro('principal', _tarNormalizarTarea(t)); });
  cont.innerHTML = disponibles.map(function(t) { return _tarCardHtml(t, 'disponible'); }).join('');
  var dispHeader = document.getElementById('tar-disp-header');
  if (dispHeader) dispHeader.style.display = disponibles.length ? '' : 'none';

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
  _tarActualizarLayoutTablero();
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

/* Tarjeta de tarea (Disponibles/Baúl) -- ícono de área fusionado con el
   título (esquina superior, ver `_tarCardHeaderHtml()`), avatares de
   asignados en la esquina opuesta, pills de Puntos/Vencimiento
   (`_tarPillsRowHtml()`, ver MANIFEST.md "Cambios recientes" -- Cupos ya
   NO se ve en la lista, solo en el detalle), descripción siempre visible, y
   el botón de acción que corresponda (o la nota de límite alcanzado en su
   lugar). Ya NO usa `.ev-card-top-row`/`.ev-card-icon` (css/eventos.css,
   columna de ícono a la izquierda) -- ver MANIFEST.md "Cambios recientes". */
// Card ahora clickeable entera (abre el detalle, `_tarAbrirDetalle()`, ver
// MANIFEST.md "Cambios recientes") -- cada botón/control interactivo de
// abajo suma `event.stopPropagation()` a su onclick para no disparar
// también la apertura del detalle al tocarlo.
function _tarCardHtml(t, contexto) {
  var accionHtml;
  if (_tarEnLimite()) {
    accionHtml = '<p class="tar-limite-nota">Alcanzaste el límite de tareas activas' +
      (_tarConfig.limiteTareasActivas != null ? ' (' + _tarConfig.limiteTareasActivas + ')' : '') +
      '. Suelta o envía a revisión una tarea para tomar otra.</p>';
  } else if (contexto === 'baul') {
    accionHtml = '<button type="button" class="btn btn-outline tar-card-btn" onclick="event.stopPropagation();_tarRescatar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">restore_from_trash</span>Rescatar tarea</button>';
  } else {
    accionHtml = '<button type="button" class="btn btn-outline tar-card-btn" onclick="event.stopPropagation();_tarTomar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">add_task</span>Tomar tarea</button>';
  }
  // "Archivar tarea" (admin, Disponibles Y Baúl) -- independiente del
  // límite de arriba a propósito: ese límite solo gatea Tomar/Rescatar
  // (acciones de autoservicio del propio admin como usuarix), Archivar es
  // una acción administrativa sin relación con ningún cupo personal. Sin
  // límite de días ni automatismo -- el admin archiva cuando quiere, tarea
  // por tarea (pedido explícito). Mismo backend (`adminArchivarTarea`) sin
  // ningún cambio en ningún caso.
  // Baúl: sigue como botón de texto debajo de "Rescatar tarea" (sin
  // cambios, ver MANIFEST.md "Cambios recientes" anterior). Disponibles
  // (ver "Cambios recientes" -- pedido explícito): en vez de vivir como
  // botón debajo de "Tomar tarea", pasa a ser un ícono en la esquina
  // superior derecha del header, junto a los avatares --
  // `archivarBtnHtml`, pasado a `_tarCardHeaderHtml()` más abajo.
  var archivarBtnHtml = '';
  if (contexto === 'baul' && _adminToken) {
    accionHtml += '<button type="button" class="btn btn-text-simple tar-card-btn" onclick="event.stopPropagation();_tarArchivar(\'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">archive</span>Archivar tarea</button>';
  } else if (contexto === 'disponible' && _adminToken) {
    archivarBtnHtml = '<button type="button" class="tar-card-archivar-btn" onclick="event.stopPropagation();_tarArchivar(\'' + t.idTarea + '\', this)" aria-label="Archivar tarea"><span class="material-symbols-outlined">archive</span></button>';
  }
  var asignados = t.asignados || [];
  return '<div class="ev-card" id="tar-card-' + contexto + '-' + t.idTarea + '" onclick="_tarAbrirDetalle(\'' + t.idTarea + '\')">' +
    '<div class="ev-card-body">' +
      _tarCardHeaderHtml(t, _tarTieneAprobada(asignados), _tarAvataresHtml(asignados), archivarBtnHtml) +
      _tarPillsRowHtml(t.puntos, t.fechaVencimiento) +
      _tarDescHtml(t.notas) +
      accionHtml +
    '</div>' +
  '</div>';
}

/* Pila de avatares superpuestos (.avatar-pill--xs, css/global.css) -- ver
   MANIFEST.md "Cambios recientes" (rediseño de card, mockup de lista): se
   mudó de una fila propia debajo de las pills a la esquina superior derecha
   del header de la card (`.tar-card-header-right`, ver `_tarCardHeaderHtml()`
   más abajo), reemplazando ahí a la pill de área -- el área ya solo se
   comunica vía el ícono fusionado con el título. Sin el wrapper
   `.tar-avatares-row` que tenía antes (ese margen ya no aplica en la nueva
   posición) -- devuelve solo `.tar-avatar-stack`, o '' si no hay nadie.
   `_tarNombreAsignacion(p)` cubre el alias `nombreUsuario` que usan las
   asignaciones de `adminGetTareasActivas`/Archivadas -- antes esta función
   solo miraba `nombreDerby`/`nombre`, dejando esas 2 fuentes sin nombre para
   la inicial de fallback. */
function _tarAvataresHtml(asignados) {
  asignados = asignados || [];
  var avatares = asignados.map(function(p) {
    var foto = (p.fotoPerfil || '').replace(/"/g, '&quot;');
    var nombre = (p.nombreDerby || _tarNombreAsignacion(p) || p.nombre || '').replace(/"/g, '&quot;');
    return '<div class="avatar-pill avatar-pill--xs" data-nombre="' + nombre + '" data-foto="' + foto + '"></div>';
  }).join('');
  if (!avatares) return '';
  return '<div class="tar-avatar-stack">' + avatares + '</div>';
}
/* Header de card -- ícono de área fusionado con el título (mismo componente
   `.ev-card-titulo-row`/`.ev-card-icono-inline` que ya usan las cards de
   Eventos, css/eventos.css, reusado tal cual -- ver MANIFEST.md "Cambios
   recientes": reemplaza el recuadro/pill de área que vivía suelto en la
   esquina, `_tarAreaPillHtml()`, eliminada -- el área ya solo se comunica
   acá) + avatares de asignados en la esquina superior derecha (reemplaza
   ahí mismo a esa pill). `estado` -- mismo contrato que tenía
   `_tarAreaPillHtml(area, estado)`: `'vencida'` (SOLO Archivadas, sin
   ninguna aprobación) tiñe el ícono de rojo + suma "Vencida" debajo del
   título; cualquier otro valor truthy (Archivadas aprobada, o el resto de
   las vistas cuando `_tarTieneAprobada()` da `true`) tiñe de verde + suma
   "Aprobada" -- solo tinte de color + texto, sin ningún ícono de check
   aparte (ver MANIFEST.md "Cambios recientes" -- pedido explícito, no debe
   quedar mezclado ningún mecanismo viejo tipo check). `extraDerechaHtml`
   (opcional) -- el ícono de "Archivar tarea" (Disponibles, admin), que ya
   vivía en esta esquina antes del rediseño, va ANTES de los avatares. */
function _tarCardHeaderHtml(t, estado, avataresHtml, extraDerechaHtml, tituloSufijoHtml) {
  var icono = _TAR_ICONOS_AREA[t.area] || 'task_alt';
  var esVencida = estado === 'vencida';
  var claseEstado = esVencida ? ' tar-titulo-vencida' : (estado ? ' tar-titulo-aprobada' : '');
  var textoEstado = esVencida ? 'Vencida' : (estado ? 'Aprobada' : '');
  return '<div class="tar-card-header">' +
    '<div class="tar-card-header-left">' +
      '<div class="ev-card-titulo-row' + claseEstado + '">' +
        '<span class="material-symbols-outlined ev-card-icono-inline">' + icono + '</span>' +
        '<div class="ev-card-titulo">' + (t.titulo || '') + (tituloSufijoHtml || '') + '</div>' +
      '</div>' +
      (textoEstado ? '<div class="tar-aprobada-txt' + (esVencida ? ' tar-vencida-txt' : '') + '">' + textoEstado + '</div>' : '') +
    '</div>' +
    '<div class="tar-card-header-right">' + (extraDerechaHtml || '') + (avataresHtml || '') + '</div>' +
  '</div>';
}
// Bug real corregido de paso (encontrado en la propia investigación del bug
// de "A cargo", no al aplicar el fix a ciegas): el selector de acá solo
// cubría `.tar-avatares-row` (la fila de avatares de las cards de lista) --
// los avatares de la sección "A cargo" del detalle (`.ev-asist-persona`,
// `_tarPersonaCardHtml()`) NUNCA vivieron dentro de esa fila, así que pese a
// que `_tarRenderDetalle()` ya llamaba a esta función después de pintarlos,
// ninguno se hidrataba (quedaban en su estado inicial sin foto/inicial).
// `.tar-avatar-stack` (la esquina superior de cada card, ver MANIFEST.md
// "Cambios recientes" -- reemplaza a `.tar-avatares-row`) + el contenedor
// del detalle, ambos explícitos.
function _tarHidratarAvatares() {
  document.querySelectorAll('.tar-avatar-stack [data-nombre], #tar-detalle-cargo-lista [data-nombre]').forEach(function(el) {
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

/* Info de la pill de fecha límite (color + ícono + texto relativo en
   español) -- ver MANIFEST.md "Cambios recientes". Color: rojo si ya venció
   o vence hoy, naranja si vence dentro de los próximos 3 días, verde si
   falta bastante (antes amarillo -- pedido explícito del rediseño de card:
   "falta bastante para vencer" pasa a leerse como un semáforo en verde, no
   como una advertencia amarilla; corte de días sin cambios, sin más
   criterio explícito en el pedido). Ícono: `event` para rojo/naranja (sin
   cambios, "su ícono actual"), `hourglass_top` para el estado verde --
   pedido explícito, el reloj de arena comunica "todavía queda tiempo" mejor
   que el ícono de calendario genérico. `tar-fecha-amarillo` (CSS) se
   conserva sin uso en esta rama -- sigue siendo el color neutro del caso
   "sin fecha límite"/fecha sin parsear, más abajo, un estado distinto a
   "falta bastante" (no hay plazo que mostrar en absoluto). Texto
   para fechas futuras (sin cambios): "Vence hoy"/"Vence mañana"/"Vence el
   [día]" (si cae el resto de esta semana)/"Vence el [día] que viene" (si
   cae la semana próxima)/"Vence el [día] [núm] de [mes]" para fechas más
   lejanas -- mismo criterio de "semana actual"/"semana próxima" que
   `_evEsRestoDeSemana()`/`_evEsProximaSemana()` (js/eventos.js), reusadas
   tal cual acá en vez de reimplementar ese cálculo (mismo semana-empieza-
   en-lunes que el resto de la app). Texto para fechas YA VENCIDAS (ver
   MANIFEST.md "Cambios recientes" -- pedido explícito, típicamente las del
   Baúl): "Venció el DD/MM/AAAA" -- numérico y siempre con año (a
   diferencia del texto relativo de arriba, que solo suma el año si es
   distinto al actual), para que quede claro de qué año es sin alargarse
   con el formato largo "el [día de semana] [núm] de [mes] de [año]" que
   sigue usando la rama "Vence"/no vencida de abajo. */
// Formato numérico "DD/MM/AAAA", siempre con año -- misma rama de parseo
// que `_tarFechaInfo()` de abajo (reusada acá para no duplicarla), factor
// común de "Venció el ..." (Baúl/Archivadas vencidas) y "Finalizada el ..."
// (Archivadas completadas, `_tarCardArchivadaHtml()`). Devuelve '' si
// `fechaRaw` falta o no parsea.
function _tarFechaDDMMAAAA(fechaRaw) {
  if (!fechaRaw) return '';
  var s = fechaRaw.toString();
  var esIso = /^\d{4}-\d{2}-\d{2}/.test(s);
  var d = esIso ? _evParseISO(s.slice(0, 10)) : new Date(s);
  if (isNaN(d.getTime())) return '';
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}
function _tarFechaInfo(fechaRaw) {
  if (!fechaRaw) return { texto: 'Sin fecha límite', clase: 'tar-fecha-amarillo', icono: 'event' };
  var s = fechaRaw.toString();
  var esIso = /^\d{4}-\d{2}-\d{2}/.test(s);
  var d = esIso ? _evParseISO(s.slice(0, 10)) : new Date(s);
  if (isNaN(d.getTime())) return { texto: 'Vence: ' + _tarFechaLegible(fechaRaw), clase: 'tar-fecha-amarillo', icono: 'event' };
  d.setHours(0, 0, 0, 0);
  var hoy = _evParseISO(_evHoyISO());
  var diff = Math.round((d - hoy) / 86400000);
  var diaSemana = _EV_DIAS_LARGOS[d.getDay()].toLowerCase();
  var fechaCompleta = 'el ' + diaSemana + ' ' + d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()].toLowerCase() +
    (d.getFullYear() !== hoy.getFullYear() ? ' de ' + d.getFullYear() : '');
  var clase = diff <= 0 ? 'tar-fecha-rojo' : (diff <= 3 ? 'tar-fecha-naranja' : 'tar-fecha-verde');
  var icono = clase === 'tar-fecha-verde' ? 'hourglass_top' : 'event';
  var isoCorta = esIso ? s.slice(0, 10) : _evToISO(d);
  var texto;
  if (diff < 0) texto = 'Venció el ' + _tarFechaDDMMAAAA(fechaRaw);
  else if (diff === 0) texto = 'Vence hoy';
  else if (diff === 1) texto = 'Vence mañana';
  else if (_evEsRestoDeSemana(isoCorta)) texto = 'Vence el ' + diaSemana;
  else if (_evEsProximaSemana(isoCorta)) texto = 'Vence el ' + diaSemana + ' que viene';
  else texto = 'Vence ' + fechaCompleta;
  return { texto: texto, clase: clase, icono: icono };
}

/* ── Render "Mis tareas" (asignaciones activas: iniciada/pendiente_revision) ── */
// Ver el comentario de `_tarRenderDisponibles()` -- mismo criterio, ya NO
// pinta un mensaje de vacío propio, solo oculta `#tar-mis-header` entero.
function _tarRenderMisTareas() {
  var cont = document.getElementById('tar-lista-mis');
  if (!cont) return;
  var filtradas = _tarMisTareas.filter(function(a) { return _tarPasaFiltro('principal', _tarNormalizarAsignacion(a)); });
  var misHeader = document.getElementById('tar-mis-header');
  if (!filtradas.length) {
    cont.innerHTML = '';
    if (misHeader) misHeader.style.display = 'none';
    _tarEntradaPendiente = null;
    _tarActualizarLayoutTablero();
    return;
  }
  if (misHeader) misHeader.style.display = '';
  cont.innerHTML = filtradas.map(_tarCardMisHtml).join('');
  _tarAplicarEntradaPendiente('mis', 'tar-mis-card-');
  _tarActualizarLayoutTablero();
}

/* ── Reconciliador de layout de la pantalla fusionada (ver MANIFEST.md
   "Cambios recientes" -- fusión de Tareas en una sola pantalla con scroll)
   -- se llama al final de `_tarRenderDisponibles()`/`_tarRenderMisTareas()`
   (cada una ya pintó su propia sección +, la primera, el Baúl). No repinta
   ningún card -- solo reconcilia lo que rodea a las 3 secciones a partir
   del DOM ya pintado: el mensaje de vacío global, la sección "por
   defecto"/lista del selector de salto rápido del header, y si ese
   selector hace falta en absoluto. Contar `.ev-card` reales en el DOM (en
   vez de repetir el filtrado de cada render acá) refleja siempre lo que
   está efectivamente pintado en ESTE instante, sin importar cuál de las 2
   funciones disparó la reconciliación ni el orden en que resolvieron las
   3 llamadas de `_tarCargarTodo()`. ────────────────────────────────────── */
// Reconciliador de layout de la pantalla fusionada -- ver MANIFEST.md
// "Cambios recientes". Llamado al final de `_tarRenderDisponibles()`/
// `_tarRenderMisTareas()`/`_tarRenderValidacion()`/`_tarRenderGestionar()`
// (las 4 funciones que pueden cambiar el contenido de alguna de las 5
// secciones) -- no repinta ningún card, solo cuenta lo YA pintado en el DOM
// para reflejar siempre el estado actual sin importar cuál de las 4
// disparó la reconciliación ni el orden de resolución de las llamadas
// paralelas de `_tarCargarTodo()`.
function _tarActualizarLayoutTablero() {
  var misN = document.querySelectorAll('#tar-lista-mis > .ev-card').length;
  var dispN = document.querySelectorAll('#tar-lista-disponibles > .ev-card').length;
  var baulWrap = document.getElementById('tar-baul-wrap');
  var baulN = (baulWrap && baulWrap.style.display !== 'none') ? document.querySelectorAll('#tar-lista-baul > .ev-card').length : 0;
  var validarN = document.querySelectorAll('#tar-lista-validar > .admin-banner-res-row').length;
  var gestN = document.querySelectorAll('#tar-lista-gestionar > .ev-card').length;

  // Mensaje de vacío único (mismo criterio que el timeline fusionado de
  // Eventos, `_evRenderTimeline()`: una sola lista continua, un solo
  // mensaje) -- solo si las 5 secciones combinadas quedaron sin nada (las 2
  // admin siempre cuentan 0 para un usuario normal, así que esto no cambia
  // nada para esa cuenta -- ver `_tarRenderValidacion()`/`_tarRenderGestionar()`).
  var vacio = document.getElementById('tar-tablero-vacio');
  if (vacio) {
    // Bug real corregido -- esta reconciliación corre cada vez que
    // CUALQUIERA de las 4 llamadas paralelas de `_tarCargarTodo()` resuelve
    // (ver el comentario de esa función), sin orden garantizado entre ellas.
    // Antes solo contaba `.ev-card`/`.admin-banner-res-row` ya pintados --
    // si "Mis tareas" resolvía vacío ANTES que "Disponibles" (carrera real),
    // el total ya daba 0 con Disponibles todavía mostrando su skeleton
    // (`.ev-ant-card`, `_tarSkeletonHtml()`) -- "No hay tareas por ahora"
    // aparecía superpuesto al skeleton en vez de esperar a que terminara.
    // `.ev-ant-card` es EXCLUSIVO del skeleton (las cards reales usan
    // `.ev-card`/`.admin-banner-res-row`, confirmado por grep antes de
    // usar este selector) -- su presencia en cualquiera de las 4 listas es
    // señal confiable de "todavía cargando esa sección".
    var cargando = !!document.querySelector('#tar-lista-disponibles .ev-ant-card, #tar-lista-mis .ev-ant-card, #tar-lista-validar .ev-ant-card, #tar-lista-gestionar .ev-ant-card');
    if (cargando) {
      vacio.classList.remove('tar-vacio-visible');
      vacio.style.display = 'none';
    } else if (misN + dispN + baulN + validarN + gestN === 0) {
      var hayDatosReales = !!(_tarMisTareas.length || _tarDisponibles.length || _tarBaul.length || _tarPendientesValidacion.length || _tarActivas.length);
      // Empty state con fade real (Batch nuevo) -- `display:block` primero
      // (parte de `opacity:0` por CSS, ver css/tareas.css), doble rAF para
      // que el navegador pinte ese `opacity:0` antes de animar a `1` (mismo
      // patrón que el resto de la app, ej. `abrirSheetTipoPago()`), recién
      // con el skeleton ya afuera del DOM (rama `cargando` de arriba).
      vacio.style.display = 'block';
      vacio.innerHTML = (hayDatosReales && _tarFiltroActivo('principal')) ?
        '<div class="ev-lista-vacia"><span class="material-symbols-outlined">filter_alt_off</span>No hay tareas que coincidan con estos filtros.</div>' :
        '<div class="ev-lista-vacia"><span class="material-symbols-outlined">task_alt</span>No hay tareas por ahora.</div>';
      requestAnimationFrame(function() { requestAnimationFrame(function() { vacio.classList.add('tar-vacio-visible'); }); });
    } else {
      vacio.classList.remove('tar-vacio-visible');
      vacio.style.display = 'none';
      vacio.innerHTML = '';
    }
  }

  // Orden fijo de las 5 -- las 2 últimas (admin) quedan naturalmente al
  // final de `conContenido` sin ningún caso especial, por venir últimas acá.
  var secciones = [
    { key: 'mis', label: 'Mis tareas', icono: 'assignment_ind', n: misN },
    { key: 'disponibles', label: 'Tareas disponibles', icono: 'inventory_2', n: dispN },
    { key: 'baul', label: 'El Baúl de tareas', icono: 'inventory', n: baulN },
    { key: 'validar', label: 'Tareas por validar' + (validarN ? ' (' + validarN + ')' : ''), icono: 'fact_check', n: validarN },
    { key: 'gestionar', label: 'Gestión de tareas activas', icono: 'checklist', n: gestN }
  ];
  var conContenido = secciones.filter(function(s) { return s.n > 0; });
  // El label por defecto SIEMPRE sale de las primeras 3 (Mis tareas/
  // Disponibles/Baúl) -- NUNCA una sección admin, pedido explícito. Si
  // ninguna de esas 3 tiene contenido (caso raro: admin sin nada propio
  // pero con validaciones/gestión pendientes), no hay "default" -- el label
  // cae al estático "Tareas" más abajo, aunque eso deje el selector inerte
  // incluso si las secciones admin necesitarían scroll (esas 2 quedan
  // igual visibles/alcanzables scrolleando a mano, arrancan cerca del tope
  // en ese escenario).
  var primerasTresConContenido = secciones.slice(0, 3).filter(function(s) { return s.n > 0; });
  _tarSeccionDefault = primerasTresConContenido.length ? primerasTresConContenido[0].key : null;

  // Mide ANTES de decidir el label -- si no hace falta selector, el label
  // pasa a "Tareas" estático sin importar que sí exista una sección
  // "por defecto" con contenido real (pedido explícito).
  _tarActualizarSelectorHeader();

  var seccionDefaultObj = null;
  for (var i = 0; i < secciones.length; i++) { if (secciones[i].key === _tarSeccionDefault) { seccionDefaultObj = secciones[i]; break; } }
  var label = document.getElementById('tar-secciones-label');
  if (label) label.textContent = (_tarSelectorNecesario && seccionDefaultObj) ? seccionDefaultObj.label : 'Tareas';

  var lista = document.getElementById('tar-secciones-lista');
  if (lista) {
    var resto = _tarSelectorNecesario ? conContenido.filter(function(s) { return s.key !== _tarSeccionDefault; }) : [];
    lista.innerHTML = resto.map(function(s) {
      return '<button type="button" class="tar-menu-row" onclick="_tarScrollASeccion(\'' + s.key + '\')"><span class="material-symbols-outlined">' + s.icono + '</span><span>' + s.label + '</span></button>';
    }).join('');
  }
}

// Alto real de la cabecera sticky de Tareas -- mismo criterio que
// `_evAlturaStickyHeader()` (js/eventos.js), id propio (`#tar-sticky-header`
// no `#ev-sticky-header`).
function _tarAlturaStickyHeader() {
  var h = document.getElementById('tar-sticky-header');
  return h ? h.getBoundingClientRect().height : 90;
}
// Tolerancia antes de considerar que hace falta scroll "real" (pedido
// explícito: "o con muy poco" margen no amerita el selector) -- ~el alto de
// una fila de pills, no un valor arbitrario grande.
var _TAR_SELECTOR_TOLERANCIA = 56;
// Mide el alto REAL renderizado de `#tar-tablero` contra el alto visible
// disponible (viewport menos cabecera sticky y nav inferior) -- NO un
// conteo fijo de cards, para que se adapte solo a cualquier tamaño de
// pantalla o densidad de contenido (pedido explícito, más confiable que un
// número fijo). Togglea el chevron del selector y, si el panel de
// secciones estaba abierto y deja de hacer falta, lo cierra.
function _tarActualizarSelectorHeader() {
  var pantalla = document.getElementById('s-tareas');
  if (!pantalla || !pantalla.classList.contains('activa')) return;
  var cont = document.getElementById('tar-tablero');
  var chevron = document.getElementById('tar-secciones-chevron');
  if (!cont || !chevron) return;
  var bottomNav = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-h')) || 60;
  var disponible = window.innerHeight - _tarAlturaStickyHeader() - bottomNav;
  var necesario = !!_tarSeccionDefault && cont.scrollHeight > (disponible + _TAR_SELECTOR_TOLERANCIA);
  _tarSelectorNecesario = necesario;
  chevron.style.display = necesario ? '' : 'none';
  if (!necesario && _tarPanelAbierto === 'secciones') _tarCerrarPanel('secciones');
}
// Recalcula en cada resize (rotación, ventana redimensionada en desktop) --
// mismo criterio que otros recálculos de layout de la app disparados por
// resize (ej. `_evCalActualizarMaxHeightExterior()`, js/eventos.js), solo
// mientras `#s-tareas` es la pantalla activa. Debounced -- no hace falta
// recalcular en cada frame de un resize continuo.
var _tarResizeTimeout = null;
window.addEventListener('resize', function() {
  clearTimeout(_tarResizeTimeout);
  _tarResizeTimeout = setTimeout(_tarActualizarLayoutTablero, 150);
});
// Salto suave a una sección desde el desplegable del selector -- mismo
// criterio de offset que `_evScrollAFecha()` (js/eventos.js): cadena
// `offsetTop`/`offsetParent` en vez de `getBoundingClientRect()` (inmune a
// cualquier `transform` de animación de entrada de `.pantalla.activa`
// todavía en curso), destino alineado contra el borde inferior de la
// cabecera sticky.
var _TAR_SECCION_ID = { mis: 'tar-mis-header', disponibles: 'tar-disp-header', baul: 'tar-baul-wrap', validar: 'tar-validar-header', gestionar: 'tar-gestionar-header' };
function _tarScrollASeccion(key) {
  _tarCerrarPanel('secciones');
  var el = document.getElementById(_TAR_SECCION_ID[key]);
  if (!el) return;
  var top = 0, node = el;
  while (node) { top += node.offsetTop; node = node.offsetParent; }
  window.scrollTo({ top: Math.max(0, top - _tarAlturaStickyHeader() - 8), behavior: 'smooth' });
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
  // Lado a lado, no una debajo de la otra (ver MANIFEST.md "Cambios
  // recientes" -- pedido explícito, mismo layout que el detalle,
  // `_tarDetalleAccionesHtml()` más abajo: `.tar-acciones-row`, no
  // `.tar-acciones-col`).
  if (a.estado === 'iniciada') {
    return '<div class="tar-acciones-row">' +
      '<button type="button" class="btn btn-outline tar-card-btn" onclick="event.stopPropagation();_tarEnviarRevision(\'' + a.idAsignacion + '\', this)"><span class="material-symbols-outlined">send</span>Enviar a revisión</button>' +
      '<button type="button" class="btn btn-text-simple tar-card-btn" onclick="event.stopPropagation();_tarSoltar(\'' + a.idAsignacion + '\', \'' + t.idTarea + '\', this)"><span class="material-symbols-outlined">remove_circle</span>Soltar tarea</button>' +
    '</div>';
  }
  return '<div class="ev-estado-pill ev-estado-pill-warning"><span class="material-symbols-outlined">hourglass_top</span>Esperando validación</div>';
}
function _tarCardMisHtml(a) {
  var t = a.tarea || {};
  var fechaTope = a.fechaVencimientoPersonal || t.fechaVencimiento;
  var sufijo = a.esRescate ? ' <span style="font-size:0.68rem;color:var(--muted);font-weight:600;">(rescatada)</span>' : '';
  // `t.asignados` (ver MANIFEST.md "Cambios recientes" -- mismo bug de
  // contrato que el de "A cargo" en el detalle, corregido en la misma
  // sesión): `getMisTareas()` no siempre trae la lista completa de
  // asignados dentro de `tarea`, así que sin `_tarConMiAsignacion()` la
  // propia card de "Mis tareas" podía quedar sin ningún avatar en la
  // esquina pese a que la tarea es, por definición, propia.
  return '<div class="ev-card" id="tar-mis-card-' + a.idAsignacion + '" onclick="_tarAbrirDetalle(\'' + t.idTarea + '\')">' +
    '<div class="ev-card-body">' +
      _tarCardHeaderHtml(t, a.estado === 'aprobada', _tarAvataresHtml(_tarConMiAsignacion(t.asignados || [], t.idTarea)), '', sufijo) +
      _tarPillsRowHtml(t.puntos, fechaTope) +
      _tarDescHtml(t.notas) +
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
// corrió antes de la fecha límite, y el paso separado "Notas" se eliminó
// del todo: el mismo campo `notas` ahora vive como "Descripción de la
// tarea" dentro del paso 0, debajo de Área -- ver `_tarCrearSetNotas()`,
// sin cambios de nombre/shape): 0 Nombre+Área+Descripción / 1 Puntos+
// Máximo de personas / 2 Modo de asignación / 3 Asignar a personas (SOLO
// si modoAsignacion==='elegir', ver `_tarCrearIrSiguiente()`/
// `_tarCrearBack()`) / 4 "¿Cuándo se hace esta tarea?" (nuevo, ver
// MANIFEST.md "Cambios recientes" -- por realizar/ya realizada, mismo
// componente `.opciones` que el paso de Modo) / 5 Fecha límite (último
// paso siempre, sin importar el modo -- "Crear tarea"; título y dirección
// del calendario dependen de `_tarCrearData.tipo`, ver
// `_tarCrearMostrarPaso()`/`_tarCrearCalRender()` más abajo).
var _TAR_CREAR_STEPS = ['tar-crear-paso-0', 'tar-crear-paso-1', 'tar-crear-paso-modo', 'tar-crear-paso-personas', 'tar-crear-paso-tipo', 'tar-crear-paso-fecha'];
var _tarCrearCurIdx = 0;
var _tarCrearData = { titulo: '', area: null, fecha: null, notas: '', asignarA: [], modoAsignacion: null, tipo: null };
var _tarCrearCal = { mostrado: null };
// Último valor de "días para completar" mostrado (ver
// `_tarActualizarDiasParaCompletar()` más abajo) -- `null` = todavía no se
// mostró nada esta apertura del wizard, distingue "primera vez que
// aparece" (fade del texto completo) de "ya estaba visible" (fade normal).
var _tarCrearDiasAnterior = null;
// Último valor de "límite de personas alcanzado" ya pintado en el picker
// (ver `_tarCrearRenderPersonas()` más abajo) -- mismo criterio que
// `_tarCrearDiasAnterior`: `null` = todavía no se pintó nada esta apertura
// del wizard (sin fade en el primer paint), distingue de "ya estaba en tal
// o cual estado" para animar el aviso "Ya elegiste el máximo..." SOLO en
// la transición real (false->true / true->false), no en cada click que no
// cambia el estado.
var _tarCrearEnLimiteAnterior = null;

function irTarCrear() {
  _tarCrearData = { titulo: '', area: null, fecha: null, notas: '', asignarA: [], modoAsignacion: null, tipo: null };
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
  document.querySelectorAll('#tar-crear-tipo-opciones .opcion').forEach(function(o) { o.classList.remove('sel'); });
  var n = document.getElementById('tar-crear-notas'); if (n) n.value = '';
  _tarActualizarContador('tar-crear-titulo-contador', '', _TAR_TITULO_MAXLEN);
  _tarActualizarContador('tar-crear-notas-contador', '', _TAR_NOTAS_MAXLEN);
  var resumen = document.getElementById('tar-crear-cal-resumen'); if (resumen) resumen.textContent = '';
  var s = document.getElementById('tar-crear-personas-search'); if (s) s.value = '';
  _tarCrearDiasAnterior = null;
  _tarCrearEnLimiteAnterior = null;
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
  // Paso "Fecha límite"/"¿Cuándo se completó?" -- título y dirección del
  // calendario dependen de `_tarCrearData.tipo` (paso anterior, nuevo, ver
  // MANIFEST.md "Cambios recientes"), así que se re-derivan cada vez que
  // este paso se vuelve el activo (no solo una vez al abrir el wizard) --
  // cubre ir y volver cambiando de tipo en el medio.
  if (_TAR_CREAR_STEPS[idx] === 'tar-crear-paso-fecha') {
    var tituloEl = document.getElementById('tar-crear-fecha-titulo');
    if (tituloEl) tituloEl.textContent = _tarCrearData.tipo === 'realizada' ? '¿Cuándo se completó?' : '¿Cuál es la fecha límite?';
    _tarCrearCalRender();
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
  if (_TAR_CREAR_STEPS[_tarCrearCurIdx] === 'tar-crear-paso-tipo' && !_tarCrearData.tipo) return;
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
      (pasoId === 'tar-crear-paso-tipo' ? !_tarCrearData.tipo :
      (pasoId === 'tar-crear-paso-fecha' ? !_tarCrearPasoFechaValido() : false)));
  }
}
// Límites de caracteres del wizard "Nueva tarea" (ver MANIFEST.md "Cambios
// recientes" -- pedido explícito, título 70/descripción 400): `maxlength`
// en los inputs (index.html, `#tar-crear-titulo`/`#tar-crear-notas`) ya
// impide escribir de más -- el contador acá solo hace visible cuánto queda,
// mismo criterio de "no confiar solo en un límite invisible" que ya usan
// otros campos de la app con feedback en vivo. `_tarActualizarContador()`
// es genérica (id del contador + valor actual + máximo) para poder
// reusarla en los 2 campos sin duplicar la cuenta.
var _TAR_TITULO_MAXLEN = 70;
var _TAR_NOTAS_MAXLEN = 400;
function _tarActualizarContador(id, valor, max) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = Math.max(0, max - (valor || '').length) + ' caracteres restantes';
}
function _tarCrearSetTitulo(v) { _tarCrearData.titulo = v; _tarActualizarContador('tar-crear-titulo-contador', v, _TAR_TITULO_MAXLEN); _tarCrearActualizarFooter(); }
function _tarCrearSelArea(el) {
  document.querySelectorAll('#tar-crear-area-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _tarCrearData.area = el.dataset.val;
  _tarCrearActualizarFooter();
}
function _tarCrearSetNotas(v) { _tarCrearData.notas = v; _tarActualizarContador('tar-crear-notas-contador', v, _TAR_NOTAS_MAXLEN); }
/* Paso nuevo "¿Cómo se asigna esta tarea?" -- reusa `.opcion`/`.opcion.sel`
   tal cual (css/ui.css), toggle de selección exclusiva a mano (sin
   `<input type="radio">` real, ver comentario en index.html). */
function _tarCrearSelModo(el, val) {
  document.querySelectorAll('#tar-crear-modo-opciones .opcion').forEach(function(o) { o.classList.remove('sel'); });
  el.classList.add('sel');
  _tarCrearData.modoAsignacion = val;
  _tarCrearActualizarFooter();
}
/* Paso nuevo "¿Cuándo se hace esta tarea?" (ver MANIFEST.md "Cambios
   recientes") -- mismo patrón exacto que `_tarCrearSelModo()` de arriba
   (`.opcion`/`.opcion.sel`, toggle exclusivo a mano). Al cambiar de tipo
   se limpia la fecha ya elegida (si había una) -- una fecha futura válida
   para "por realizar" puede no serlo para "ya realizada" (y viceversa),
   el paso siguiente vuelve a pedirla contra la dirección correcta del
   calendario en vez de arrastrar una selección que podría quedar
   deshabilitada. */
function _tarCrearSelTipo(el, val) {
  document.querySelectorAll('#tar-crear-tipo-opciones .opcion').forEach(function(o) { o.classList.remove('sel'); });
  el.classList.add('sel');
  _tarCrearData.tipo = val;
  _tarCrearData.fecha = null;
  var resumen = document.getElementById('tar-crear-cal-resumen'); if (resumen) resumen.textContent = '';
  var diasWrap = document.getElementById('tar-crear-dias-wrap'); if (diasWrap) diasWrap.style.display = 'none';
  _tarCrearDiasAnterior = null;
  _tarCrearActualizarFooter();
}

/* Calendario inline de fecha límite -- mismo componente (.ev-ant-cal-nav,
   .ev-cal-grid, .ev-cal-dow, .ev-cal-celda, .ev-ant-cal-sel, .ev-ant-cal-pasado,
   css/eventos.css) que ya usan Asistencia anticipada/Crear evento
   (`_evCrearCalRender()`), reusado con estado propio -- un único día, sin
   rango. Dirección de bloqueo depende de `_tarCrearData.tipo` (paso nuevo
   "¿Cuándo se hace esta tarea?", ver MANIFEST.md "Cambios recientes"):
   "futura" (default, tarea por realizar) bloquea fechas PASADAS, como
   siempre; "realizada" (ya se hizo) invierte el criterio y bloquea fechas
   FUTURAS -- solo pasado/hoy habilitados. Reusa la misma clase visual
   `.ev-ant-cal-pasado` ("celda deshabilitada, texto tenue") en los 2
   casos -- el nombre de la clase describe el look, no la razón, y ya
   existía para el otro sentido -- sin sumar una clase nueva solo para
   invertir la etiqueta. */
function _tarCrearCalRender() {
  var cont = document.getElementById('tar-crear-cal'); if (!cont) return;
  var m = _evCalMesDe(_tarCrearCal.mostrado);
  var labelEl = document.getElementById('tar-crear-cal-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var esRealizada = _tarCrearData.tipo === 'realizada';
  var seleccionada = _tarCrearData.fecha;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var deshabilitada = esRealizada ? _evFechaCmp(celdaIso, hoy) > 0 : _evFechaCmp(celdaIso, hoy) < 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (deshabilitada ? ' ev-ant-cal-pasado' : '');
    if (seleccionada && celdaIso === seleccionada) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = deshabilitada ? '' : ' onclick="_tarCrearCalTocarDia(\'' + celdaIso + '\')"';
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
  // "X días para realizar la tarea" no tiene sentido en modo "ya
  // realizada" (la fecha elegida es pasada/hoy, no un plazo a futuro) --
  // se deja oculto en vez de mostrar "0 días".
  if (_tarCrearData.tipo !== 'realizada') _tarActualizarDiasParaCompletar();
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
  // Fade in/out (ver MANIFEST.md "Cambios recientes") SOLO en la transición
  // real de `enLimite` -- antes fadeaba en CADA click/búsqueda (cada
  // llamada a esta función), incluso mientras el estado se mantenía igual
  // (ya en el máximo, o todavía lejos de él), lo que hacía re-animar el
  // aviso "Ya elegiste el máximo..." de más. `null` = todavía no se pintó
  // nada esta apertura del wizard (primer paint, sin fade -- mismo criterio
  // que `_tarCrearDiasAnterior`).
  var cambioEstadoLimite = _tarCrearEnLimiteAnterior !== null && _tarCrearEnLimiteAnterior !== enLimite;
  _evFadeSwap(cont, function() { cont.innerHTML = listaHtml; }, !cambioEstadoLimite);
  _tarCrearEnLimiteAnterior = enLimite;
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
    // (estado 'iniciada') para cada unx y la tarea pasa a 'en_progreso' --
    // salvo `yaRealizada` (paso nuevo "¿Cuándo se hace esta tarea?", ver
    // MANIFEST.md "Cambios recientes"): ahí el backend crea esas mismas
    // asignaciones directo en 'aprobada' con `fecha_revision`=la fecha
    // elegida y acredita los puntos ya, sin pasar por revisión.
    asignarA: _tarCrearData.asignarA,
    yaRealizada: _tarCrearData.tipo === 'realizada'
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

/* ── "Tareas por validar" (admin) -- sección del tablero fusionado ───────
   Antes ícono con badge propio + subpantalla de página completa
   (`#s-tareas-validar`); ahora una sección MÁS de `#tar-tablero` (ver
   MANIFEST.md "Cambios recientes" -- fusión de las 2 secciones admin), con
   el mismo encabezado+divisor (`.ev-hoy-separador`) que "Mis tareas"/
   "Tareas disponibles" y el mismo criterio "se oculta entera si no tiene
   contenido". Filas `.admin-banner-res-row` ya existentes (css/admin.css)
   -- Aprobar/Rechazar, Rechazar revela un textarea corto antes de
   confirmar. */
function _tarCargarPendientesValidacion() {
  if (!_adminToken) { _tarPendientesValidacion = []; _tarRenderValidacion(); return; }
  adminApi({ action: 'adminGetTareasPendientesValidacion' }, function(res) {
    _tarPendientesValidacion = res || [];
    _tarRenderValidacion();
  }, function() { _tarPendientesValidacion = []; _tarRenderValidacion(); });
}
// Ya NO pinta ningún mensaje de "sin tareas por validar" propio -- mismo
// criterio que `_tarRenderDisponibles()`/`_tarRenderMisTareas()`: solo
// oculta `#tar-validar-header` entero (header + lista) si quedó vacía o si
// la cuenta no es admin. Termina llamando a `_tarActualizarLayoutTablero()`
// -- mismo reconciliador que las otras secciones.
function _tarRenderValidacion() {
  var cont = document.getElementById('tar-lista-validar');
  var header = document.getElementById('tar-validar-header');
  if (!cont) return;
  var lista = _adminToken ? _tarPendientesValidacion : [];
  if (header) header.style.display = lista.length ? '' : 'none';
  cont.innerHTML = lista.map(function(p) {
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
  _tarActualizarLayoutTablero();
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
    _tarCargarTodo();
  }, function(e) {
    if (row) row.querySelectorAll('button').forEach(function(b) { b.disabled = false; });
    mostrarToast((e && e.message) || 'No se pudo procesar la validación.', 'error');
  });
}

/* ── "Gestión de tareas activas" (admin) -- sección del tablero fusionado
   (ver MANIFEST.md "Cambios recientes" -- antes subpantalla propia,
   `#s-tareas-gestionar`, ahora la última sección de `#tar-tablero`, mismo
   criterio "se oculta entera si no tiene contenido" que el resto). A
   diferencia de "Disponibles" (solo tareas con cupos libres, sin mostrar
   las ya tomadas) y de "Tareas por validar" (solo asignaciones
   `pendiente_revision`), esta vista trae TODAS las tareas activas con
   TODAS sus asignaciones -- `adminGetTareasActivas`, sin params -- resuelve
   el caso de una tarea asignada directo al crearla (queda en `en_progreso`
   con gente en estado `iniciada`) que hoy no aparece en ningún lado hasta
   que la propia persona la manda a revisión. Aprobar/Rechazar quedan
   disponibles para CUALQUIER asignación activa (`iniciada` O
   `pendiente_revision`), no solo `pendiente_revision` -- el admin puede
   validar directo sin esperar. Cada tarea es una card (mismo esqueleto que
   el resto de la sección, ícono+título+pills fusionados vía
   `_tarCardHeaderHtml()`/`_tarPillsRowHtml()`) con sus asignaciones anidadas debajo como filas
   `.admin-banner-res-row` (mismo componente que "Tareas por validar", ver
   esa sección arriba) -- acá se necesita agrupar por tarea (a diferencia
   de la lista plana de "Tareas por validar") para no repetir el
   ícono/pills de la tarea una vez por persona asignada.
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
// **Dedupe defensivo (ver MANIFEST.md "Cambios recientes" -- bug real
// reportado: una persona aparecía repetida varias veces dentro de la misma
// card).** Revisado el resto de la cadena (`_tarRenderGestionar()` hace un
// `innerHTML=` que REEMPLAZA el contenedor entero, nunca acumula; `_tarCargarGestionar()`
// se llama una sola vez por `_tarCargarTodo()`, con guard `_tarActivasCargaId`
// contra respuestas tardías de una carga vieja; `_tarGestionarCardHtml()`
// arma UNA card por tarea, nunca una por persona) -- sin causa real
// encontrada del lado cliente, así que la duplicación más probable viene
// del propio array `t.asignaciones`/`t.asignados` que trae `adminGetTareasActivas`
// (ej. un join del backend sin `DISTINCT`). Filtra por `idAsignacion`
// (clave real de la fila, la misma que ya usa `adminValidarTarea`) -- si 2+
// filas comparten el mismo `idAsignacion`, es literalmente la misma
// asignación repetida, se queda con la primera.
function _tarAsignacionesDe(t) {
  var asignaciones = t.asignaciones || t.asignados || [];
  var vistos = {}, out = [];
  asignaciones.forEach(function(a) {
    var clave = a.idAsignacion != null ? String(a.idAsignacion) : null;
    if (clave != null) { if (vistos[clave]) return; vistos[clave] = true; }
    out.push(a);
  });
  return out;
}
function _tarNombreAsignacion(a) { return a.nombreDerby || a.nombreUsuario || a.nombre || ''; }
// Cargada automáticamente por `_tarCargarTodo()` en cada visita a la
// sección (mismo criterio que `_tarCargarPendientesValidacion()`), no solo
// bajo demanda como cuando era una subpantalla propia -- gateada acá
// (`!_adminToken` -> lista vacía sin red) por el mismo motivo que esa
// función.
function _tarCargarGestionar() {
  if (!_adminToken) { _tarActivas = []; _tarRenderGestionar(); return; }
  var miCarga = ++_tarActivasCargaId;
  adminApi({ action: 'adminGetTareasActivas' }, function(res) {
    if (miCarga !== _tarActivasCargaId) return;
    _tarActivas = res || [];
    _tarRenderGestionar();
  }, function(e) {
    if (miCarga !== _tarActivasCargaId) return;
    if (typeof console !== 'undefined' && console.error) console.error('adminGetTareasActivas falló:', e);
    var c = document.getElementById('tar-lista-gestionar');
    var header = document.getElementById('tar-gestionar-header');
    if (header) header.style.display = '';
    if (c) c.innerHTML = '<div class="ev-lista-vacia"><span class="material-symbols-outlined">error_outline</span>No se pudieron cargar las tareas activas.' +
      '<button type="button" class="btn-text-simple tar-reintentar-btn" onclick="_tarCargarGestionar()"><span class="material-symbols-outlined">refresh</span>Reintentar</button>' +
      '</div>';
  });
}
// Ya NO pinta ningún mensaje de "sin tareas activas" propio -- mismo
// criterio que el resto de las secciones: solo oculta `#tar-gestionar-header`
// entero si quedó vacía o si la cuenta no es admin. Termina llamando a
// `_tarActualizarLayoutTablero()`.
function _tarRenderGestionar() {
  var cont = document.getElementById('tar-lista-gestionar');
  var header = document.getElementById('tar-gestionar-header');
  if (!cont) return;
  var activas = _adminToken ? _tarActivas : [];
  if (header) header.style.display = activas.length ? '' : 'none';
  cont.innerHTML = activas.map(_tarGestionarCardHtml).join('');
  _tarGestActualizarSliders();
  _tarActualizarLayoutTablero();
}
// Fila de una asignación individual dentro de la card de su tarea --
// **Toggle "Completada"/"No completada" (ver MANIFEST.md "Cambios
// recientes" -- reemplaza los 2 botones sueltos check/X + reveal de
// rechazo): mismo componente/mecanismo que "A horario"/"Tarde" del roster
// admin de Marcar asistencia (`.ev-rsvp-seg`/`.ev-rsvp-opt`/`.ev-rsvp-slider`,
// `_evRosterAdminFilasHtml()`/`_evPosicionarRsvpSlider()`, js/eventos.js) --
// clases reusadas LITERAL (visual/mecánica), reimplementado acá con mapa de
// color propio (`_tarGestPosicionarSlider()`/`_TAR_GEST_BG`, más abajo) en
// vez de tocar `_EV_RSVP_BG` de Eventos, mismo criterio que el resto de
// esta sección al reusar componentes de Eventos.** Visible para CUALQUIER
// asignación (`iniciada`/`pendiente_revision`/`aprobada`/`rechazada`) --
// pedido explícito: el backend ya devuelve las 4, así que la persona
// aprobada/rechazada NO desaparece de la lista, se queda con la opción
// correspondiente ya resaltada (`.activa`) en vez de mostrar un badge de
// solo lectura. Tocar la opción activa la deselecciona (llama
// `adminDesvalidarTarea`, ver `_tarGestionarToggle()`).
// Toggle "Completada"/"No completada" -- extraído aparte (ver MANIFEST.md
// "Cambios recientes") para poder reusarlo LITERAL desde 2 lugares: las
// filas de "Gestión de tareas activas" (acá abajo) y las cards de persona
// del nuevo detalle de tarea (`_tarPersonaCardHtml()`, más abajo) -- mismo
// pedido explícito ("reusar el componente tal cual, no duplicarlo").
// `event.stopPropagation()` en el wrapper entero (antes solo hacía falta
// implícitamente acá -- esta fila nunca vivió dentro de nada clickeable; el
// nuevo consumidor sí, la card de persona del detalle).
// `prefijoId` (opcional, ver MANIFEST.md "Cambios recientes" -- bug real de
// IDs duplicados encontrado en la propia verificación con Playwright, no al
// aplicar el fix a ciegas): default `'tar-gest-seg-'` (comportamiento de
// siempre, Gestión de tareas activas). El detalle de tarea reusa esta misma
// asignación con un `idAsignacion` idéntico mientras la sección Gestionar
// sigue pintada (oculta, no destruida) detrás -- sin un prefijo propio para
// el segundo consumidor, 2 elementos con el MISMO id conviven en el DOM a
// la vez (HTML inválido, y `querySelector('#id')` se vuelve ambiguo:
// Playwright lo detectó como "resolved to 2 elements" al clickear desde el
// detalle). `_tarRenderDetalle()` pasa `'tar-detalle-seg-'` acá.
function _tarPersonaToggleHtml(a, prefijoId) {
  var estado = a.estado;
  var opts = [{ estado: 'aprobada', icono: 'check', label: 'Completada' }, { estado: 'rechazada', icono: 'close', label: 'No completada' }].map(function(o) {
    var act = estado === o.estado ? ' activa' : '';
    return '<div class="ev-rsvp-opt' + act + '" data-estado="' + o.estado + '" onclick="event.stopPropagation();_tarGestionarToggle(\'' + a.idAsignacion + '\',\'' + o.estado + '\',this)"><span class="material-symbols-outlined">' + o.icono + '</span>' + o.label + '</div>';
  }).join('');
  return '<div class="ev-rsvp-seg ev-rsvp-seg-roster tar-gest-toggle" id="' + (prefijoId || 'tar-gest-seg-') + a.idAsignacion + '" onclick="event.stopPropagation()"><div class="ev-rsvp-slider"></div>' + opts + '</div>';
}
function _tarGestionarFilaHtml(a) {
  var estado = a.estado;
  var nombre = _tarNombreAsignacion(a);
  var subtexto = estado === 'pendiente_revision' ? 'Esperando validación' : (estado === 'iniciada' ? 'En curso' : (estado === 'aprobada' ? 'Completada' : (estado === 'rechazada' ? 'No completada' : '')));
  return '<div class="admin-banner-res-row" id="tar-gest-row-' + a.idAsignacion + '">' +
    '<div class="admin-banner-res-info">' +
      '<div class="admin-banner-res-nombre">' + nombre + '</div>' +
      '<div class="admin-banner-res-fecha">' + subtexto + '</div>' +
    '</div>' +
    _tarPersonaToggleHtml(a) +
  '</div>';
}
function _tarGestionarCardHtml(t) {
  var asignaciones = _tarAsignacionesDe(t);
  var personasHtml = asignaciones.length ?
    '<div class="tar-gestionar-personas">' + asignaciones.map(_tarGestionarFilaHtml).join('') + '</div>' :
    '<p style="font-size:0.78rem;color:var(--muted);margin:12px 0 0;">Todavía nadie tomó esta tarea.</p>';
  return '<div class="ev-card" id="tar-gest-card-' + t.idTarea + '" onclick="_tarAbrirDetalle(\'' + t.idTarea + '\')">' +
    '<div class="ev-card-body">' +
      _tarCardHeaderHtml(t, _tarTieneAprobada(asignaciones), _tarAvataresHtml(asignaciones)) +
      _tarPillsRowHtml(t.puntos, t.fechaVencimiento) +
      _tarDescHtml(t.notas) +
      personasHtml +
    '</div>' +
  '</div>';
}
// Color del slider por estado -- reimplementado acá (no `_EV_RSVP_BG` de
// js/eventos.js) para no acoplar vocabulario de Tareas a ese archivo, mismo
// criterio ya seguido por el resto de esta sección al reusar componentes
// de Eventos sin tocar su archivo fuente.
var _TAR_GEST_BG = { aprobada: 'var(--success-bg)', rechazada: 'var(--danger-bg)' };
// Copia paramétrica de `_evPosicionarRsvpSlider()` (js/eventos.js) --
// mismo mecanismo exacto (mide `.ev-rsvp-opt.activa` real, posiciona
// `.ev-rsvp-slider` con `transform:translateX`), leyendo del mapa de color
// propio de arriba en vez de `_EV_RSVP_BG`.
function _tarGestPosicionarSlider(seg, animate) {
  var slider = seg.querySelector('.ev-rsvp-slider');
  if (!slider) return;
  slider.classList.toggle('animado', !!animate);
  var activo = seg.querySelector('.ev-rsvp-opt.activa');
  if (!activo) { slider.style.opacity = '0'; slider.style.width = '0'; return; }
  slider.style.opacity = '1';
  slider.style.width = (activo.offsetWidth - 6) + 'px';
  slider.style.transform = 'translateX(' + (activo.offsetLeft + 3) + 'px)';
  slider.style.background = _TAR_GEST_BG[activo.getAttribute('data-estado')] || 'var(--brand-light)';
}
// `contId` (opcional, ver MANIFEST.md "Cambios recientes") -- default
// `#tar-lista-gestionar` (comportamiento de siempre); el detalle de tarea
// (`_tarRenderDetalle()`, más abajo) pasa `#tar-detalle-personas` para
// posicionar el mismo slider ahí, reusando esta función tal cual en vez de
// una copia paramétrica.
function _tarGestActualizarSliders(contId) {
  document.querySelectorAll('#' + (contId || 'tar-lista-gestionar') + ' .ev-rsvp-seg').forEach(function(seg) { _tarGestPosicionarSlider(seg, false); });
}
// Tocar la tarjeta YA activa la deselecciona -- llama `adminDesvalidarTarea`
// (nueva, ver MANIFEST.md "Cambios recientes" -- asunción marcada a
// propósito, sin contrato explícito verificado: `idAsignacion`+`adminToken`
// vía `adminApi()`, mismo mecanismo que el resto de las acciones admin* de
// esta sección) y el toggle vuelve a quedar neutro (ninguna opción
// resaltada). Tocar la otra aplica ese estado -- `adminValidarTarea`, mismo
// endpoint/contrato que `_tarValidarEnviar()`. Optimista (mismo criterio
// que `_evMarcarAsistenciaAdmin()`, js/eventos.js): aplica el cambio en el
// DOM YA, con la animación real del slider, antes de que la escritura
// resuelva -- revierte al estado anterior si falla. Sin recargar toda la
// sección al terminar (a diferencia de `_tarValidarEnviar()`) -- eso
// perdería la animación y, más importante, es justo el patrón que dejaba a
// una persona "desaparecer y reaparecer" de la lista en cada validación;
// solo sincroniza "Tareas por validar" (`_tarCargarPendientesValidacion()`),
// que si tenía esta asignación en `pendiente_revision` necesita reflejar
// que ya se resolvió.
function _tarGestionarToggle(idAsignacion, estado, btnEl) {
  var seg = btnEl.closest('.ev-rsvp-seg');
  var yaActiva = btnEl.classList.contains('activa');
  var estadoAnterior = null;
  seg.querySelectorAll('.ev-rsvp-opt').forEach(function(o) { if (o.classList.contains('activa')) estadoAnterior = o.getAttribute('data-estado'); });
  var aplicar = function(estadoAMostrar) {
    seg.querySelectorAll('.ev-rsvp-opt').forEach(function(o) { o.classList.toggle('activa', o.getAttribute('data-estado') === estadoAMostrar); });
    _tarGestPosicionarSlider(seg, true);
  };
  var revertir = function() { aplicar(estadoAnterior); mostrarToast('No se pudo procesar la acción.', 'error'); };
  aplicar(yaActiva ? null : estado);
  if (yaActiva) {
    adminApi({ action: 'adminDesvalidarTarea', idAsignacion: idAsignacion }, function(res) {
      if (res && res.exito === false) { aplicar(estadoAnterior); mostrarToast(res.error || 'No se pudo procesar la acción.', 'error'); return; }
      _tarCargarPendientesValidacion();
    }, revertir);
  } else {
    adminApi({ action: 'adminValidarTarea', idAsignacion: idAsignacion, accion: estado === 'aprobada' ? 'aprobar' : 'rechazar', notaRechazo: '' }, function(res) {
      if (res && res.exito === false) { aplicar(estadoAnterior); mostrarToast(res.error || 'No se pudo procesar la validación.', 'error'); return; }
      _tarCargarPendientesValidacion();
    }, revertir);
  }
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
// Ya NO pinta nada para 'aprobada' (ver MANIFEST.md "Cambios recientes" --
// pedido explícito: quitar la pill "Aprobada" de las cards, redundante con
// el texto "Aprobada" que `_tarCardHeaderHtml()` ya suma bajo el título
// cuando ALGUNA asignación está aprobada). "Rechazada"
// sigue mostrándose -- ese estado no tiene ninguna otra señal visual en la
// card.
function _tarArchivadaEstadoBadge(estado) {
  if (estado !== 'rechazada') return '';
  return '<span style="font-size:0.66rem;font-weight:800;padding:2px 9px;border-radius:20px;background:var(--danger-bg);color:var(--danger);white-space:nowrap;flex-shrink:0;">Rechazada</span>';
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
  var accionAdmin = _adminToken ? '<button type="button" class="btn btn-danger tar-card-btn" onclick="event.stopPropagation();_tarEliminarArchivadaAbrir(\'' + t.idTarea + '\')"><span class="material-symbols-outlined">delete</span>Eliminar</button>' : '';
  // "Vencida" (roja, se archivó sin ninguna aprobación) vs "Aprobada"
  // (verde, ya existía) -- mismo criterio para la pill de fecha: "Venció
  // el..."/fechaVencimiento en el primer caso, "Finalizada el..."/
  // fechaArchivado (fecha real de archivado, no la de vencimiento) en el
  // segundo. Ver MANIFEST.md "Cambios recientes".
  var tieneAprobada = _tarTieneAprobada(personas);
  var fechaOverride = tieneAprobada ?
    { texto: 'Finalizada el ' + _tarFechaDDMMAAAA(t.fechaArchivado), clase: 'tar-fecha-verde' } :
    { texto: 'Venció el ' + _tarFechaDDMMAAAA(t.fechaVencimiento), clase: 'tar-fecha-rojo' };
  return '<div class="ev-card" id="tar-archivada-card-' + t.idTarea + '" onclick="_tarAbrirDetalle(\'' + t.idTarea + '\')">' +
    '<div class="ev-card-body">' +
      _tarCardHeaderHtml(t, tieneAprobada ? true : 'vencida', _tarAvataresHtml(personas)) +
      _tarPillsRowHtml(t.puntos, t.fechaVencimiento, fechaOverride) +
      _tarDescHtml(t.notas) +
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

/* ── Detalle de tarea (nuevo, `#s-tareas-detalle`) -- mismo esqueleto
   visual que el detalle de evento (`#s-eventos-detalle`, js/eventos.js):
   header sticky (acá ícono+nombre de área, en el lugar de ícono+tipo) +
   secciones de contenido con scroll (`.ev-detalle-section`, reusadas tal
   cual) + footer fijo contextual (`.cta-footer-fixed`, mismo mecanismo
   genérico que ya usan los wizards -- `ir()`, js/ui.js, muestra
   automáticamente `#cta-footer-<pantalla-activa>`). Se abre desde
   CUALQUIERA de las 5 cards de lista (Disponibles/Baúl/Mis tareas/
   Archivadas/Gestión de tareas activas) -- cada una con su propio shape de
   datos, normalizado acá antes de pintar. ─────────────────────────────── */
var _tarDetalleIdActual = null;
var _tarDetalleEditando = false;

// Busca la tarea por id en TODAS las listas ya cargadas -- prioriza
// `_tarActivas` (Gestionar) porque es la única con el shape más completo
// (asignaciones con `idAsignacion`+`estado` real), pero cualquiera de las 5
// alcanza para los campos comunes (`titulo`/`notas`/`area`/`puntos`/
// `fechaVencimiento`/`cuposTotales` son la MISMA tarea en cualquier vista).
function _tarBuscarTareaBase(idTarea) {
  idTarea = String(idTarea);
  var t = _tarActivas.filter(function(x) { return String(x.idTarea) === idTarea; })[0]
    || _tarDisponibles.filter(function(x) { return String(x.idTarea) === idTarea; })[0]
    || _tarBaul.filter(function(x) { return String(x.idTarea) === idTarea; })[0]
    || _tarArchivadas.filter(function(x) { return String(x.idTarea) === idTarea; })[0];
  if (!t) {
    var asign = _tarMiAsignacionEn(idTarea);
    if (asign) t = asign.tarea;
  }
  return t || null;
}
function _tarMiAsignacionEn(idTarea) {
  return _tarMisTareas.filter(function(a) { return String((a.tarea || {}).idTarea) === String(idTarea); })[0] || null;
}
// `conToggle:true` SOLO cuando la fuente es `adminGetTareasActivas`
// (`_tarActivas`) -- asunción marcada a propósito (sin contrato explícito
// verificado): es la única de las 4 fuentes que trae `idAsignacion`+`estado`
// real por persona (ver el comentario de `_tarAsignacionesDe()` más arriba
// -- Disponibles/Baúl/Mis tareas no traen ese campo hoy, siempre
// `'iniciada'` implícito). Archivadas trae `estado` (aprobada/rechazada)
// pero sin `idAsignacion` -- sin toggle tampoco ahí, una tarea archivada no
// se "desmarca" desde acá (para eso está "Borrar tarea", más abajo).
// Bug real corregido (ver MANIFEST.md "Cambios recientes" -- reportado como
// "el detalle de mi propia tarea no me muestra en 'A cargo'"): investigado
// ANTES de asumir un fix -- instrumentado a mano contra las 4 fuentes
// posibles. La causa real es de contrato de datos, no de lógica: para una
// cuenta NO admin, `_tarActivas` siempre está vacío (`_tarCargarGestionar()`
// la gatea con `_adminToken`), así que esta función cae a la rama
// `_tarDisponibles.concat(_tarBaul)` -- y si la tarea tiene 1 solo cupo
// (`maxAsignados===1`) YA tomado por el usuario, `getTareasDisponibles` deja
// de devolverla del todo (0 cupos libres), así que tampoco aparece ahí.
// Termina cayendo al fallback `_tarMiAsignacionEn(idTarea)`, que lee
// `asign.tarea.asignados` -- pero `getMisTareas()` arma ese sub-objeto
// `tarea` como el catálogo de LA TAREA (título/notas/puntos/cupos), sin la
// lista de personas asignadas (no la necesita para "mis propias tareas");
// `t.asignados` ahí sale `undefined`, y el `|| []` lo deja vacío --
// "A cargo" quedaba realmente sin nadie pese a que `_tarMisTareas` SÍ tiene
// la asignación activa del usuario (la fuente de la verdad de "estoy
// asignado a esto"). Fix: `_tarConMiAsignacion()` (abajo) agrega una
// entrada sintética con los datos de la sesión (`E`/`E.datos`) + el
// `estado`/`idAsignacion` reales de la propia asignación cuando el usuario
// actual está asignado y no aparece ya en la lista que trajo la fuente --
// aplicado a las 4 ramas por igual (no solo el fallback) para cubrir
// también el caso, menos común pero real, de que `getTareasDisponibles`/
// `adminGetTareasActivas` omitan al propio usuario por el mismo motivo.
function _tarConMiAsignacion(personas, idTarea) {
  var mia = _tarMiAsignacionEn(idTarea);
  if (!mia) return personas;
  var yaEsta = personas.some(function(p) { return _tarNombreAsignacion(p) === E.nombre || p.nombre === E.nombre; });
  if (yaEsta) return personas;
  return personas.concat([{
    nombre: E.nombre,
    nombreDerby: (E.datos && E.datos.nombreDerby) || '',
    fotoPerfil: (E.datos && E.datos.fotoPerfil) || '',
    estado: mia.estado,
    idAsignacion: mia.idAsignacion
  }]);
}
function _tarPersonasParaDetalle(idTarea) {
  idTarea = String(idTarea);
  var activa = _tarActivas.filter(function(x) { return String(x.idTarea) === idTarea; })[0];
  if (activa) return { personas: _tarConMiAsignacion(_tarAsignacionesDe(activa), idTarea), conToggle: true };
  var archivada = _tarArchivadas.filter(function(x) { return String(x.idTarea) === idTarea; })[0];
  if (archivada) return { personas: archivada.personas || [], conToggle: false };
  var base = _tarDisponibles.concat(_tarBaul).filter(function(x) { return String(x.idTarea) === idTarea; })[0];
  if (base) return { personas: _tarConMiAsignacion(base.asignados || [], idTarea), conToggle: false };
  var asign = _tarMiAsignacionEn(idTarea);
  if (asign) return { personas: _tarConMiAsignacion((asign.tarea && asign.tarea.asignados) || [], idTarea), conToggle: false };
  return { personas: [], conToggle: false };
}
function _tarAbrirDetalle(idTarea) {
  var t = _tarBuscarTareaBase(idTarea);
  if (!t) return;
  _tarDetalleIdActual = String(idTarea);
  _tarDetalleEditando = false;
  ir('s-tareas-detalle');
  window.scrollTo(0, 0);
  _tarRenderDetalle();
}
// Header sticky -- mismo componente/clases Y mismo formato que
// `_evDetalleStickyHtml()` (js/eventos.js): `.ev-detalle-nav-row`/
// `.ev-detalle-nav-icono`/`.ev-detalle-nav-texto`/`.ev-detalle-tipo`/
// `.ev-detalle-fechahora`, reusadas tal cual (ver MANIFEST.md "Cambios
// recientes" -- pedido explícito: flecha+ícono+nombre del área+fecha, "mismo
// formato que ícono+tipo+fecha del detalle de evento"). Antes solo mostraba
// ícono+nombre del área en una línea -- suma la fecha de vencimiento como
// 2da línea, mismo `_evFechaCompleta()` que arma "lunes 12 de agosto" para
// Eventos (reusado tal cual, sin duplicar el formateo).
function _tarDetalleStickyHtml(t) {
  var icono = _TAR_ICONOS_AREA[t.area] || 'task_alt';
  var fechaHtml = '';
  if (t.fechaVencimiento) {
    var s = t.fechaVencimiento.toString();
    var esIso = /^\d{4}-\d{2}-\d{2}/.test(s);
    var d = esIso ? _evParseISO(s.slice(0, 10)) : new Date(s);
    if (!isNaN(d.getTime())) fechaHtml = '<div class="ev-detalle-fechahora">' + _evFechaCompleta(esIso ? s.slice(0, 10) : _evToISO(d)) + '</div>';
  }
  return '<div class="ev-detalle-nav-row">' +
      '<button class="app-nav-back" onclick="volver(\'s-tareas\')" title="Volver"><span class="material-symbols-outlined">arrow_back</span></button>' +
      '<span class="material-symbols-outlined ev-detalle-nav-icono">' + icono + '</span>' +
      '<div class="ev-detalle-nav-texto"><div class="ev-detalle-tipo">' + (t.area || '') + '</div>' + fechaHtml + '</div>' +
    '</div>';
}
// Card de persona ("Quiénes están a cargo") -- mismo componente visual que
// las cards de asistentes del detalle de evento (`.ev-asist-persona`/
// `.avatar-pill--sm`/`.ev-asist-persona-nombre`, css/eventos.css, ver
// `_evGrupoAsistenciaHtml()`), reusadas tal cual. El toggle "Completada"/
// "No completada" (admin, `conToggle`) es el MISMO componente que ya usa
// "Gestión de tareas activas" (`_tarPersonaToggleHtml()`, factorizada
// aparte más arriba en este archivo justo para este reuso) -- nunca una
// copia paralela.
function _tarPersonaCardHtml(p, conToggle) {
  var fotoAttr = (p.fotoPerfil || '').replace(/"/g, '&quot;');
  var nombre = p.nombreDerby || _tarNombreAsignacion(p) || p.nombre || '';
  var nombreAttr = (p.nombre || nombre).replace(/"/g, '&quot;');
  var estadoTxt = p.estado === 'pendiente_revision' ? 'Esperando validación' : (p.estado === 'iniciada' ? 'En curso' : (p.estado === 'aprobada' ? 'Completada' : (p.estado === 'rechazada' ? 'No completada' : '')));
  return '<div class="ev-asist-persona"><div class="avatar-pill avatar-pill--sm" data-nombre="' + nombreAttr + '" data-foto="' + fotoAttr + '"></div>' +
    '<span class="ev-asist-persona-nombre">' + nombre + (estadoTxt ? ' <span style="color:var(--muted);font-weight:600;">· ' + estadoTxt + '</span>' : '') + '</span>' +
    (conToggle && _adminToken && p.idAsignacion != null ? _tarPersonaToggleHtml(p, 'tar-detalle-seg-') : '') +
  '</div>';
}
// Botones de acción principal -- contextual según el estado del usuario
// actual respecto a esta tarea (pedido explícito, los 5 casos): asignado
// 'iniciada' -> Enviar a revisión + Soltar, uno al lado del otro (ver
// MANIFEST.md "Cambios recientes" -- pedido explícito: mismo layout que la
// card de "Mis tareas", `.tar-acciones-row`, no uno debajo del otro);
// asignado 'pendiente_revision' -> aviso info; no asignado pero en el Baúl
// -> Rescatar; no asignado, hay cupos libres -> Tomar; si no, ningún botón
// (ej. tarea llena y no soy parte). Ya NO vive en el footer fijo de abajo de
// la pantalla (`#cta-footer-s-tareas-detalle`, eliminado) -- ahora es una
// sección más del flujo normal, inmediatamente debajo de la descripción
// (ver `_tarRenderDetalle()` más abajo). Los 4 wrappers de abajo
// (`_tarDetalle*`) llaman a la MISMA acción de backend que ya usan las
// cards de lista (`tomarTarea`/`soltarTarea`/`enviarRevisionTarea`/
// `rescatarTarea`, todas GET) -- sin la coreografía de animación optimista
// de esas cards (acá no hay una lista de la que "salir"), solo
// disabled+toast+refresco real al terminar.
function _tarDetalleAccionesHtml(t) {
  var idTarea = t.idTarea;
  var mia = _tarMiAsignacionEn(idTarea);
  if (mia) {
    if (mia.estado === 'iniciada') {
      return '<div class="tar-acciones-row">' +
        '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarDetalleEnviarRevision(\'' + mia.idAsignacion + '\', this)"><span class="material-symbols-outlined">send</span>Enviar a revisión</button>' +
        '<button type="button" class="btn btn-text-simple tar-card-btn" onclick="_tarDetalleSoltar(\'' + mia.idAsignacion + '\',\'' + idTarea + '\', this)"><span class="material-symbols-outlined">remove_circle</span>Soltar tarea</button>' +
      '</div>';
    }
    return '<div class="ev-estado-pill ev-estado-pill-warning" style="width:100%;justify-content:center;"><span class="material-symbols-outlined">hourglass_top</span>Esperando validación</div>';
  }
  var enBaul = _tarBaul.some(function(x) { return String(x.idTarea) === String(idTarea); });
  if (enBaul) return '<button type="button" class="btn btn-outline tar-card-btn" onclick="_tarDetalleRescatar(\'' + idTarea + '\', this)"><span class="material-symbols-outlined">restore_from_trash</span>Rescatar tarea</button>';
  if (t.fechaArchivado) return ''; // tarea archivada -- sin acción de autoservicio
  var personas = _tarPersonasParaDetalle(idTarea).personas;
  var total = t.cuposTotales != null ? t.cuposTotales : personas.length;
  var cuposLibres = t.cuposLibres != null ? t.cuposLibres : Math.max(0, total - personas.length);
  if (cuposLibres > 0) return '<button type="button" class="btn btn-primary tar-card-btn" onclick="_tarDetalleTomar(\'' + idTarea + '\', this)"><span class="material-symbols-outlined">add_task</span>Tomar tarea</button>';
  return '';
}
// Orden del detalle (ver MANIFEST.md "Cambios recientes" -- reordenado,
// mismo esqueleto visual que el detalle de evento en todo lo demás): header
// fijo (`_tarDetalleStickyHtml()`) -> pills de puntos+vencimiento ->
// descripción completa (texto plano, siempre visible) -> acciones -> "A
// CARGO (N)" -- el orden real es el orden de `.ev-detalle-section` en
// index.html (`#s-tareas-detalle`), esta función solo puebla cada slot ya
// posicionado ahí.
function _tarRenderDetalle() {
  var t = _tarBuscarTareaBase(_tarDetalleIdActual);
  if (!t) { volver('s-tareas'); return; }
  var sticky = document.getElementById('tar-detalle-sticky');
  if (sticky) sticky.innerHTML = _tarDetalleStickyHtml(t);
  var pills = document.getElementById('tar-detalle-pills');
  if (pills) pills.innerHTML = _tarPillsRowHtml(t.puntos, t.fechaVencimiento);
  var desc = document.getElementById('tar-detalle-desc');
  if (desc) { desc.textContent = t.notas || ''; desc.style.display = t.notas ? '' : 'none'; }
  var acciones = document.getElementById('tar-detalle-acciones');
  if (acciones) acciones.innerHTML = _tarDetalleAccionesHtml(t);
  var pInfo = _tarPersonasParaDetalle(_tarDetalleIdActual);
  var cargoTitulo = document.getElementById('tar-detalle-cargo-titulo');
  if (cargoTitulo) cargoTitulo.textContent = 'A CARGO (' + pInfo.personas.length + ')';
  var cargoLista = document.getElementById('tar-detalle-cargo-lista');
  if (cargoLista) {
    cargoLista.innerHTML = pInfo.personas.length ?
      pInfo.personas.map(function(p) { return _tarPersonaCardHtml(p, pInfo.conToggle); }).join('') :
      '<p style="font-size:0.82rem;color:var(--muted);margin:0;">Todavía nadie está a cargo de esta tarea.</p>';
    _tarHidratarAvatares();
    _tarGestActualizarSliders('tar-detalle-cargo-lista');
  }
  // FAB "Editar tarea" (admin, ver MANIFEST.md "Cambios recientes" --
  // reemplaza la sección `#tar-detalle-admin`/3 botones apilados que tenía
  // antes) -- oculto mientras el modo edición ya está abierto (ese mismo
  // formulario trae sus propios botones Cancelar/Guardar, más "Editar
  // personas"/"Borrar tarea" -- ver `_tarDetalleRenderEditar()` más abajo).
  var fab = document.getElementById('tar-detalle-fab-menu');
  if (fab) fab.style.display = (_adminToken && !_tarDetalleEditando) ? 'flex' : 'none';
  if (_tarDetalleEditando) _tarDetalleRenderEditar(t); else _tarDetalleCerrarEditar(true);
}

/* ── Acciones de usuarix desde el detalle -- misma acción de
   backend que las cards de lista, sin la animación optimista (ver
   comentario de `_tarDetalleAccionesHtml()` más arriba). Siempre terminan
   recargando TODO (`_tarCargarTodo()`, sincroniza las 5 listas) +
   re-pintando el detalle con los datos ya frescos. ────────────────────── */
function _tarDetalleTomar(idTarea, btn) {
  if (btn) btn.disabled = true;
  api({ action: 'tomarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    if (res && res.exito === false) { if (btn) btn.disabled = false; mostrarToast(res.error || 'No se pudo tomar la tarea.', 'error'); return; }
    _tarCargarTodo();
    _tarRenderDetalle();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo tomar la tarea.', 'error');
  });
}
function _tarDetalleSoltar(idAsignacion, idTarea, btn) {
  if (btn) btn.disabled = true;
  api({ action: 'soltarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    if (res && res.exito === false) { if (btn) btn.disabled = false; mostrarToast(res.error || 'No se pudo soltar la tarea.', 'error'); return; }
    _tarCargarTodo();
    _tarRenderDetalle();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo soltar la tarea.', 'error');
  });
}
function _tarDetalleEnviarRevision(idAsignacion, btn) {
  if (btn) btn.disabled = true;
  api({ action: 'enviarRevisionTarea', nombre: E.nombre, token: _token, idAsignacion: idAsignacion }, function(res) {
    if (res && res.exito === false) { if (btn) btn.disabled = false; mostrarToast(res.error || 'No se pudo enviar a revisión.', 'error'); return; }
    _tarCargarTodo();
    _tarRenderDetalle();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo enviar a revisión.', 'error');
  });
}
function _tarDetalleRescatar(idTarea, btn) {
  if (btn) btn.disabled = true;
  api({ action: 'rescatarTarea', nombre: E.nombre, token: _token, idTarea: idTarea }, function(res) {
    if (res && res.exito === false) { if (btn) btn.disabled = false; mostrarToast(res.error || 'No se pudo rescatar la tarea.', 'error'); return; }
    _tarCargarTodo();
    _tarRenderDetalle();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo rescatar la tarea.', 'error');
  });
}

/* ── "Editar tarea" (admin) -- edición inline en la misma pantalla (ver
   MANIFEST.md "Cambios recientes"): reemplaza el bloque estático de
   título/descripción/pills por un formulario (`#tar-detalle-editar`),
   mismos componentes que el wizard "Nueva tarea" (`.aj-pill` de área,
   `.qty-stepper` de puntos/cupos, calendario inline `.ev-ant-cal-*` de
   fecha) -- estado propio (`_tarDetEdit*`), reimplementado acá en vez de
   reusar el estado del wizard (mismo criterio que ya sigue el resto de esta
   sección al reusar COMPONENTES de otras pantallas sin acoplar su estado). */
var _tarDetEditData = { titulo: '', notas: '', area: null, puntos: 0, cupos: 1, fecha: null };
var _tarDetEditCal = { mostrado: null };
function _tarDetalleAbrirEditar() {
  var t = _tarBuscarTareaBase(_tarDetalleIdActual);
  if (!t) return;
  _tarDetEditData = {
    titulo: t.titulo || '', notas: t.notas || '', area: t.area || null,
    puntos: t.puntos != null ? t.puntos : 0, cupos: t.cuposTotales != null ? t.cuposTotales : 1,
    fecha: (t.fechaVencimiento || '').toString().slice(0, 10) || null
  };
  _tarDetEditCal.mostrado = _tarDetEditData.fecha || _evHoyISO();
  _tarDetalleEditando = true;
  var fab = document.getElementById('tar-detalle-fab-menu');
  if (fab) fab.style.display = 'none';
  _tarDetalleRenderEditar(t);
}
function _tarDetalleCerrarEditar(silencioso) {
  _tarDetalleEditando = false;
  var ed = document.getElementById('tar-detalle-editar');
  var vista = document.getElementById('tar-detalle-vista');
  if (ed) ed.style.display = 'none';
  if (vista) vista.style.display = '';
  if (!silencioso) _tarRenderDetalle();
}
function _tarDetEditSetTitulo(v) { _tarDetEditData.titulo = v; }
function _tarDetEditSetNotas(v) { _tarDetEditData.notas = v; }
function _tarDetEditSelArea(el) {
  el.parentNode.querySelectorAll('.aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _tarDetEditData.area = el.dataset.val;
}
function _tarDetEditCalRender() {
  var cont = document.getElementById('tar-detedit-cal'); if (!cont) return;
  var m = _evCalMesDe(_tarDetEditCal.mostrado);
  var labelEl = document.getElementById('tar-detedit-cal-label');
  if (labelEl) labelEl.textContent = NOMBRES_MESES[m.month] + ' ' + m.year;
  var inicioGrid = _evLunesDeSemana(new Date(m.year, m.month, 1));
  var finMes = new Date(m.year, m.month + 1, 0);
  var finGrid = _evLunesDeSemana(finMes); finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var seleccionada = _tarDetEditData.fecha;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== m.month;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '');
    if (seleccionada && celdaIso === seleccionada) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    html += '<div class="' + clases + '" data-iso="' + celdaIso + '" onclick="_tarDetEditCalTocarDia(\'' + celdaIso + '\')"><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>';
}
function _tarDetEditCalMoverMes(dir) {
  var m = _evCalMesDe(_tarDetEditCal.mostrado);
  var year = m.year, month = m.month + dir;
  if (month < 0) { month = 11; year--; } else if (month > 11) { month = 0; year++; }
  _tarDetEditCal.mostrado = _evToISO(new Date(year, month, 1));
  _tarDetEditCalRender();
}
function _tarDetEditCalTocarDia(iso) { _tarDetEditData.fecha = iso; _tarDetEditCalRender(); }
function _tarDetalleRenderEditar(t) {
  var vista = document.getElementById('tar-detalle-vista');
  var ed = document.getElementById('tar-detalle-editar');
  if (!ed) return;
  if (vista) vista.style.display = 'none';
  ed.style.display = '';
  var tit = document.getElementById('tar-detedit-titulo'); if (tit) tit.value = _tarDetEditData.titulo;
  var not = document.getElementById('tar-detedit-notas'); if (not) not.value = _tarDetEditData.notas;
  var areaCont = document.getElementById('tar-detedit-area-pills');
  if (areaCont) {
    areaCont.innerHTML = Object.keys(_TAR_ICONOS_AREA).map(function(a) {
      return '<span class="aj-pill' + (a === _tarDetEditData.area ? ' activa' : '') + '" data-val="' + a + '" onclick="_tarDetEditSelArea(this)">' + a + '</span>';
    }).join('');
  }
  _adminSetStepperValue('tar-detedit-puntos', _tarDetEditData.puntos);
  _adminSetStepperValue('tar-detedit-cupos', _tarDetEditData.cupos);
  _tarDetEditCalRender();
}
function _tarDetalleGuardarEditar(btn) {
  var puntosEl = document.getElementById('tar-detedit-puntos');
  var cuposEl = document.getElementById('tar-detedit-cupos');
  var datos = {
    titulo: (_tarDetEditData.titulo || '').trim(),
    notas: _tarDetEditData.notas || '',
    area: _tarDetEditData.area,
    puntos: puntosEl ? (parseFloat(puntosEl.value) || 0) : 0,
    maxAsignados: cuposEl ? (parseInt(cuposEl.value, 10) || 1) : 1,
    fechaVencimiento: _tarDetEditData.fecha
  };
  if (!datos.titulo || !datos.area || !datos.fechaVencimiento) { mostrarToast('Completa título, área y fecha límite antes de guardar.', 'error'); return; }
  if (btn) btn.disabled = true;
  adminApi({ action: 'adminEditarTarea', idTarea: _tarDetalleIdActual, datos: JSON.stringify(datos) }, function(res) {
    if (btn) btn.disabled = false;
    if (res && res.exito === false) { mostrarToast(res.error || 'No se pudo guardar los cambios.', 'error'); return; }
    _tarDetalleCerrarEditar(true);
    _tarCargarTodo();
    _tarRenderDetalle();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo guardar los cambios.', 'error');
  });
}

/* ── "Editar personas" (admin) -- subpantalla `#s-tareas-detalle-personas`,
   mismo picker de búsqueda+checkmarks del wizard "Nueva tarea"
   (`.ev-roster-fila`/`.fi-circle`/`_evRosterEquipo`, ver
   `_tarCrearRenderPersonas()` más arriba) reusado tal cual (mismo roster
   precargado, sin pedirlo de nuevo). Diferencia real: cada persona con
   asignación YA `aprobada` aparece bloqueada (checkbox marcado, sin
   `onclick`, atenuada) -- ya completó la tarea, sacarla de acá le revertiría
   el trabajo hecho sin pasar por "Borrar tarea" (la única acción pensada
   para ese impacto, con su propia confirmación explícita). */
var _tarPersonasSeleccion = []; // nombres (string) actualmente marcados
var _tarPersonasBloqueadas = []; // nombres con asignación 'aprobada' -- no se pueden destildar
// Nombre canónico de una persona ya asignada -- bug real encontrado en la
// propia verificación con Playwright (no al aplicar el fix a ciegas): las
// asignaciones de `adminGetTareasActivas`/Archivadas no siempre traen
// `nombre` (mismo desfasaje ya documentado en `_tarNombreAsignacion()`, más
// arriba -- "Tareas por validar"/Gestión muestran `nombreUsuario`, no
// `nombre`), pero el roster del picker (`_evRosterEquipo`) SÍ usa `nombre`
// como clave canónica -- sin este fallback, `_tarPersonasSeleccion`/
// `_tarPersonasBloqueadas` quedaban filtrando `undefined` (nadie
// preseleccionado, nadie bloqueado) para cualquier persona sin el campo
// `nombre` exacto.
function _tarPersonaNombreCanonico(p) { return p.nombre || p.nombreUsuario || ''; }
function _tarPersonasAbrir() {
  var idTarea = _tarDetalleIdActual;
  var info = _tarPersonasParaDetalle(idTarea);
  _tarPersonasSeleccion = info.personas.map(_tarPersonaNombreCanonico).filter(Boolean);
  _tarPersonasBloqueadas = info.personas.filter(function(p) { return p.estado === 'aprobada'; }).map(_tarPersonaNombreCanonico).filter(Boolean);
  ir('s-tareas-detalle-personas');
  var s = document.getElementById('tar-detpersonas-search'); if (s) s.value = '';
  if (_adminToken && typeof _evRosterEquipo !== 'undefined' && _evRosterEquipo === null && typeof _evPrecargarRoster === 'function') _evPrecargarRoster();
  _tarPersonasRenderPicker('');
}
function _tarPersonasFiltrar(q) { _tarPersonasRenderPicker(q); }
// Mismo bug de raza ya corregido para el picker del wizard
// (`_tarCrearRepintarPersonasSiHaceFalta()`, más arriba) -- si el roster
// resuelve DESPUÉS de que `_tarPersonasAbrir()` ya mostró "Cargando
// equipo...", nada volvía a repintar la lista sin esto. Llamada desde
// `_evPrecargarRoster()` (js/eventos.js) junto al mismo hook del wizard.
function _tarPersonasRepintarSiHaceFalta() {
  var pantalla = document.getElementById('s-tareas-detalle-personas');
  if (!pantalla || !pantalla.classList.contains('activa')) return;
  var inp = document.getElementById('tar-detpersonas-search');
  _tarPersonasRenderPicker(inp ? inp.value : '');
}
function _tarPersonasRenderPicker(q) {
  var cont = document.getElementById('tar-detpersonas-lista');
  if (!cont) return;
  if (typeof _evRosterEquipo === 'undefined' || _evRosterEquipo === null) {
    cont.innerHTML = '<div class="ev-roster-vacio">Cargando equipo...</div>';
    return;
  }
  var roster = _evRosterEquipo || [];
  var qn = (q || '').toLowerCase().trim();
  var filtrado = qn ? roster.filter(function(p) { return (p.nombreDerby || '').toLowerCase().indexOf(qn) !== -1 || String(p.nombre).toLowerCase().indexOf(qn) !== -1; }) : roster;
  if (!filtrado.length) { cont.innerHTML = '<div class="ev-roster-vacio">' + (roster.length ? 'Sin resultados.' : 'No se pudo cargar el equipo.') + '</div>'; return; }
  cont.innerHTML = filtrado.map(function(p) {
    var nombreAttr = String(p.nombre).replace(/'/g, "\\'");
    var sel = _tarPersonasSeleccion.indexOf(p.nombre) !== -1;
    var bloqueada = _tarPersonasBloqueadas.indexOf(p.nombre) !== -1;
    return '<div class="ev-roster-fila tar-persona-fila' + (bloqueada ? ' tar-persona-fila-disabled' : '') + '"' +
      (bloqueada ? '' : ' onclick="_tarPersonasToggle(\'' + nombreAttr + '\')"') + '>' +
      '<span class="ev-roster-nombre">' + (p.nombreDerby || p.nombre) + (bloqueada ? ' <span style="font-size:0.68rem;color:var(--success);font-weight:700;">· Completada</span>' : '') + '</span>' +
      '<div class="fi-circle' + (sel ? ' sel' : '') + '"><span class="material-symbols-outlined">check</span></div>' +
    '</div>';
  }).join('');
}
function _tarPersonasToggle(nombre) {
  var idx = _tarPersonasSeleccion.indexOf(nombre);
  if (idx === -1) _tarPersonasSeleccion.push(nombre); else _tarPersonasSeleccion.splice(idx, 1);
  var inp = document.getElementById('tar-detpersonas-search');
  _tarPersonasRenderPicker(inp ? inp.value : '');
}
function _tarPersonasGuardar(btn) {
  if (btn) btn.disabled = true;
  adminApi({ action: 'adminEditarAsignacionesTarea', idTarea: _tarDetalleIdActual, nombres: JSON.stringify(_tarPersonasSeleccion) }, function(res) {
    if (btn) btn.disabled = false;
    if (res && res.exito === false) { mostrarToast(res.error || 'No se pudo guardar los cambios.', 'error'); return; }
    volver('s-tareas-detalle');
    _tarCargarTodo();
    _tarRenderDetalle();
  }, function(e) {
    if (btn) btn.disabled = false;
    mostrarToast((e && e.message) || 'No se pudo guardar los cambios.', 'error');
  });
}

/* ── "Borrar tarea" (admin, destructivo e irreversible) -- generaliza
   `_tarEliminarArchivadaAbrir()`/`adminEliminarTareaArchivada()` (más
   arriba en este archivo, solo para tareas YA archivadas) a CUALQUIER tarea
   desde su detalle, activa o archivada -- mismo nivel de fricción/mismo
   modal de impacto (quién pierde cuántos puntos) antes de confirmar,
   `adminEliminarTarea` en vez de `adminEliminarTareaArchivada` (acción
   nueva, asunción marcada a propósito: mismo contrato `idTarea`+`adminToken`
   vía `adminApi()` que el resto de las acciones admin* de esta sección). */
var _tarEliminarTareaIdPendiente = null;
function _tarEliminarTareaAbrir() {
  var t = _tarBuscarTareaBase(_tarDetalleIdActual);
  if (!t) return;
  _tarEliminarTareaIdPendiente = _tarDetalleIdActual;
  var personas = _tarPersonasParaDetalle(_tarDetalleIdActual).personas.filter(function(p) { return p.estado === 'aprobada'; });
  var cont = document.getElementById('tar-eliminar-tarea-impacto');
  if (cont) {
    if (!personas.length) {
      cont.innerHTML = '<p style="font-size:0.85rem;color:var(--muted);margin:0;">Nadie tiene puntos aprobados en esta tarea -- no hay impacto de puntos.</p>';
    } else {
      cont.innerHTML = personas.map(function(p) {
        var nombre = p.nombreDerby || _tarNombreAsignacion(p) || p.nombre || '';
        return '<div style="display:flex;gap:10px;align-items:center;padding:10px 12px;background:var(--danger-bg);border:1px solid var(--danger-bdr);border-radius:10px;">' +
          '<span class="material-symbols-outlined" style="color:var(--danger);font-size:1.1rem;flex-shrink:0;">remove_circle</span>' +
          '<span style="font-size:0.85rem;color:var(--text);">' + nombre + ' perderá ' + (t.puntos != null ? t.puntos : 0) + ' puntos.</span>' +
        '</div>';
      }).join('');
    }
  }
  var btn = document.getElementById('tar-eliminar-tarea-btn-confirmar');
  if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
  var m = document.getElementById('modal-tar-eliminar-tarea');
  if (!m) return;
  m.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.opacity = '1'; }); });
  _registrarOverlayAbierto(_tarEliminarTareaCerrar);
}
function _tarEliminarTareaCerrar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-tar-eliminar-tarea');
  if (!m) return;
  m.style.opacity = '0';
  setTimeout(function() { m.style.display = 'none'; }, 300);
  _tarEliminarTareaIdPendiente = null;
}
function _tarEliminarTareaConfirmar() {
  if (!_tarEliminarTareaIdPendiente) return;
  var idTarea = _tarEliminarTareaIdPendiente;
  var btn = document.getElementById('tar-eliminar-tarea-btn-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Eliminando...'; }
  adminApi({ action: 'adminEliminarTarea', idTarea: idTarea }, function(res) {
    if (res && res.exito === false) {
      if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
      mostrarToast(res.error || 'No se pudo eliminar la tarea.', 'error');
      return;
    }
    // Bug real encontrado en la propia verificación con Playwright (no al
    // aplicar el fix a ciegas): llamar `_tarEliminarTareaCerrar()` (sin
    // `porGesto`, dispara `history.back()` ASÍNCRONO) y de inmediato
    // `volver('s-tareas')` (navegación SÍNCRONA) corría en el orden
    // incorrecto -- el popstate del `history.back()` llegaba DESPUÉS de que
    // `ir('s-tareas')` ya había cambiado de pantalla, pisándola de vuelta a
    // `s-tareas-detalle`. `ir()` (js/ui.js) ya vacía `_overlayStack` sola en
    // cada navegación (`while (_overlayStack.length > 0)
    // _overlayStack.pop()(true)`) -- alcanza con `volver('s-tareas')` a
    // secas, sin cerrar el modal a mano primero.
    volver('s-tareas');
    _tarCargarTodo();
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Eliminar definitivamente'; }
    mostrarToast((e && e.message) || 'No se pudo eliminar la tarea.', 'error');
  });
}
