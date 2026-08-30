// js/equipo.js — Sección Equipo (Cambio 42, greenfield; Cambio 55: conectada
// a Supabase real, ver MANIFEST.md "Auditoría previa" para el detalle de qué
// columnas existen/faltaban). Roster del club: lista con búsqueda +
// favoritos (localStorage) + perfil de detalle. Reusa helpers compartidos ya
// existentes: _avatarSetFotoOInicial (js/ui.js), ir()/volver() (js/ui.js),
// .aj-pill (css/perfil.css).

// Datos reales, poblados por _eqAsegurarCargado() (action 'getEquipo',
// supabase/functions/api/index.ts) -- ver más abajo. Reemplaza a
// _EQ_EQUIPO_DEMO (Cambios 42-54), que queda comentada como referencia de
// desarrollo, sin ningún caller vivo.
var _eqPersonas = [];
var _eqCargado = false;
var _eqCargando = false;
var _eqCallbacksEspera = [];

/*
var _EQ_EQUIPO_DEMO = [
  { id: 'q1', nombreDerby: 'Comet Fatal', numeroDerby: 7, username: 'cometfatal', fotoPerfil: '',
    rol: 'Quindes', pronombres: 'Ella, elle', roles: ['Jammer', 'Coach'],
    telefono: '+593987654321', cumple: '15 de abril', email: 'comet@example.com',
    rankPct: 82, tierModo: 'auto',
    estado: 'Activx', pagaCuota: true, esAdminMiembro: false, ultimaAsistencia: '2026-08-20',
    stats: { horasPatinadas: 48, asistenciaPct: 87 } },
  { id: 'q2', nombreDerby: 'Furia Andina', numeroDerby: 22, username: 'furiaandina', fotoPerfil: '',
    rol: 'Quindes', pronombres: 'Ella', roles: ['Bloqueadora'],
    telefono: '+593998765432', cumple: '3 de julio', email: 'furia@example.com',
    rankPct: 22, tierModo: 'auto',
    estado: 'Activx', pagaCuota: true, esAdminMiembro: false, ultimaAsistencia: '2026-08-20',
    stats: { horasPatinadas: 36, asistenciaPct: 74 } },
  { id: 'q3', nombreDerby: 'Vudú Cría', numeroDerby: 13, username: 'vuducria', fotoPerfil: '',
    rol: 'Quindes', pronombres: 'Elle', roles: ['Pivot', 'Capitana'],
    telefono: '', cumple: '', email: '',
    rankPct: 95, tierModo: 'auto',
    estado: 'Activx', pagaCuota: true, esAdminMiembro: true, ultimaAsistencia: '2026-08-20',
    stats: { horasPatinadas: 52, asistenciaPct: 92 } },
  { id: 'm1', nombreDerby: 'Pluma Letal', numeroDerby: 9, username: 'plumaletal', fotoPerfil: '',
    rol: 'Mirlxs', pronombres: 'Ella, elle', roles: ['Jammer'],
    telefono: '+593991112233', cumple: '22 de octubre', email: 'pluma@example.com',
    rankPct: 55, tierModo: 'auto',
    estado: 'Activx', pagaCuota: true, esAdminMiembro: false, ultimaAsistencia: '2026-08-20',
    stats: { horasPatinadas: 31, asistenciaPct: 68 } },
  { id: 'm2', nombreDerby: 'Chukirawa', numeroDerby: 44, username: 'chukirawa', fotoPerfil: '',
    rol: 'Mirlxs', pronombres: 'Él', roles: ['Bloqueador', 'Entrenador'],
    telefono: '+593984445566', cumple: '9 de enero', email: 'chukirawa@example.com',
    rankPct: 90, tierModo: 'auto',
    estado: 'Activx', pagaCuota: true, esAdminMiembro: false, ultimaAsistencia: '2026-08-20',
    stats: { horasPatinadas: 60, asistenciaPct: 95 } },
  { id: 'm3', nombreDerby: 'Neblina Roja', numeroDerby: 18, username: 'neblinaroja', fotoPerfil: '',
    rol: 'Mirlxs', pronombres: 'Ella', roles: ['Pivot'],
    telefono: '', cumple: '30 de mayo', email: '',
    rankPct: 30, tierModo: 'auto',
    estado: 'Activx', pagaCuota: true, esAdminMiembro: false, ultimaAsistencia: '2026-08-20',
    stats: { horasPatinadas: 24, asistenciaPct: 55 } }
];
*/

// Descripciones del modo de categoría (tier) -- ver _eqCambiarTier()/
// _eqPerfilContenidoHtml() más abajo (Cambio 52). 'quinde'/'mirlxs': fijado
// a mano por un admin (persiste en `equipo.tier_modo`, Cambio 55) -- el
// recálculo automático (recalcular-categorias, botón "Recalcular ahora" de
// Mi Liga) salta a esa persona mientras no esté en 'auto'. 'auto' (default
// real de la columna): la categoría sigue derivándose del % de asistencia
// según config_tiers.
var _EQ_TIER_DESCRIPCIONES = {
  quinde: 'Categoría fijada manualmente en Quindes. El sistema ignorará los stats de asistencia.',
  auto:   'La categoría se asigna automáticamente según el porcentaje de asistencia.',
  mirlxs: 'Categoría fijada manualmente en Mirlxs. El sistema ignorará los stats de asistencia.'
};

// Estados de miembro (Cambio 53) -- NO es una lista inventada/fallback: son
// los 4 valores reales del CHECK constraint de `equipo.estado_miembro`
// (`supabase/migrations/20260823_estado_miembro.sql` + 20260829_solicitud_lesion.sql,
// que le quita 'Satélite' al constraint -- Cambio 54, ver MANIFEST.md).
// Se reusan acá tal cual para que el selector de esta demo no invente un
// vocabulario paralelo que después no tenga a dónde mapear en la integración real.
var _EQ_ESTADOS = ['Activx', 'Ausente', 'Técnico', 'Lesionadx'];

// Estado "efectivo" a mostrar/resaltar -- si ya está fijado a mano en
// 'Ausente' se respeta tal cual; si no, se deriva de `ultimaAsistencia`
// (30+ días sin asistir → 'Ausente' automático, sin tocar `persona.estado`
// real -- el toggle manual y el cálculo automático son 2 cosas separadas,
// mismo criterio que ya usa el backend real para reactivar a 'Activx' al
// marcar asistencia de nuevo, ver `_evMarcarAsistencia()`/js/eventos.js).
// 'Ausente' (no 'Inactiva', que no es un valor válido del enum real de
// arriba) es el estado más cercano semánticamente a "30 días sin venir".
function _eqEstadoEfectivo(persona) {
  if (persona.estado === 'Ausente') return 'Ausente';
  if (persona.ultimaAsistencia) {
    var dias = Math.floor((Date.now() - new Date(persona.ultimaAsistencia).getTime()) / 86400000);
    if (dias >= 30) return 'Ausente';
  }
  return persona.estado;
}

var _eqYaInicializado = false;
var _eqPersonaActual = null;
var _eqBusqueda = '';

function _eqEsc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

function _eqPersonaPorId(id) {
  return _eqPersonas.filter(function(p) { return p.id === id; })[0] || null;
}

// Carga el roster real UNA sola vez por sesión y la reusa -- tanto
// _eqInit() (visita a la sección Equipo) como _datosRenderStats()
// (js/perfil.js, Cambio 51 -- stats del usuario logueado en Ajustes) la
// necesitan, y pueden dispararse en cualquier orden según qué pantalla visite
// primero la persona. Callbacks en cola mientras hay un fetch en curso, para
// no disparar 2 requests si ambas pantallas piden la carga casi al mismo
// tiempo. `cb` se invoca igual si el fetch falla (con `_eqPersonas` vacío) --
// cada caller decide qué mostrar según el resultado, ninguno se queda
// esperando para siempre.
function _eqAsegurarCargado(cb) {
  if (_eqCargado) { cb(); return; }
  _eqCallbacksEspera.push(cb);
  if (_eqCargando) return;
  _eqCargando = true;
  api({ action: 'getEquipo' }, function(res) {
    _eqPersonas = (res && res.personas) || [];
    _eqCargado = true;
    _eqCargando = false;
    var cbs = _eqCallbacksEspera; _eqCallbacksEspera = [];
    cbs.forEach(function(fn) { fn(); });
  }, function() {
    _eqCargando = false;
    var cbs = _eqCallbacksEspera; _eqCallbacksEspera = [];
    cbs.forEach(function(fn) { fn(); });
  });
}

/* ── Favoritos (localStorage, clave 'eq_favoritos') ──────────────────── */
function _eqFavoritos() {
  try {
    var raw = localStorage.getItem('eq_favoritos');
    return raw ? JSON.parse(raw) : [];
  } catch (ex) { return []; }
}
function _eqSetFavoritos(arr) {
  try { localStorage.setItem('eq_favoritos', JSON.stringify(arr)); } catch (ex) {}
}
function _eqEsFavorito(id) { return _eqFavoritos().indexOf(id) !== -1; }
function _eqToggleFavorito(id) {
  var favs = _eqFavoritos();
  var idx = favs.indexOf(id);
  if (idx === -1) favs.push(id); else favs.splice(idx, 1);
  _eqSetFavoritos(favs);
  _eqRenderFavoritos();
  _eqRenderGrupo('Quindes');
  _eqRenderGrupo('Mirlxs');
  if (_eqPersonaActual && _eqPersonaActual.id === id) _eqActualizarNavPerfil();
  // Fade in/out breve sobre CADA instancia visible del ícono de esta persona
  // (`[data-eq-fav]`, `_eqFilaHtml()`/`_eqNavHtml()`) -- puede haber más de
  // una a la vez (favoritos + su grupo, o nav de detalle + fila de lista) ya
  // que los 3 renders de arriba reconstruyen el HTML entero por `innerHTML`,
  // así que la clase se aplica DESPUÉS de re-renderizar, sobre los elementos
  // nuevos. Reflow forzado (`offsetWidth`) antes de agregar la clase para que
  // la animación reinicie si la persona togglea de nuevo antes de que termine
  // la anterior (0.3s), en vez de quedarse sin efecto la segunda vez.
  document.querySelectorAll('[data-eq-fav="' + id + '"]').forEach(function(el) {
    el.classList.remove('eq-fav-pulse');
    void el.offsetWidth;
    el.classList.add('eq-fav-pulse');
    setTimeout(function() { el.classList.remove('eq-fav-pulse'); }, 300);
  });
}

/* ── Punto de entrada (ver 'entrar' de APP_BOTTOM_NAV_ITEMS en js/ui.js) ── */
function irEquipo() {
  if (!_eqYaInicializado) _eqInit();
  volver('s-equipo');
}

function _eqInit() {
  _eqYaInicializado = true;
  var estadoEl = document.getElementById('eq-estado-carga');
  if (estadoEl) estadoEl.innerHTML = '<p class="eq-loading">Cargando equipo...</p>';
  _eqAsegurarCargado(function() {
    // `_eqPersonas` vacío acá cubre tanto "falló el fetch" como "el equipo
    // real no tiene ningún miembro" (edge case improbable en producción,
    // ver MANIFEST.md) -- en cualquiera de los 2 casos se resetea
    // `_eqYaInicializado` para que volver a entrar a la pestaña reintente en
    // vez de quedar pegada para siempre con el mensaje de error.
    if (!_eqPersonas.length) {
      _eqYaInicializado = false;
      if (estadoEl) estadoEl.innerHTML = '<p class="eq-error">No se pudo cargar el equipo. Intentá de nuevo.</p>';
      return;
    }
    if (estadoEl) estadoEl.innerHTML = '';
    _eqRenderFavoritos();
    _eqRenderGrupo('Quindes');
    _eqRenderGrupo('Mirlxs');
  });
}

/* ── Hidratación de avatares (mismo patrón que _evHidratarAvatares(),
   js/eventos.js): puebla cualquier `.eq-avatar[data-nombre]` visible con
   foto o inicial vía el helper compartido. */
function _eqHidratarAvatares() {
  document.querySelectorAll('.eq-avatar[data-nombre]').forEach(function(el) {
    _avatarSetFotoOInicial(el, el.getAttribute('data-foto') || '', el.getAttribute('data-nombre'));
  });
}

function _eqAvatarHtml(p, claseExtra) {
  return '<div class="avatar-pill ' + claseExtra + ' eq-avatar" data-nombre="' + _eqEsc(p.nombreDerby) + '" data-foto="' + _eqEsc(p.fotoPerfil || '') + '"></div>';
}

function _eqFilaHtml(p) {
  var fav = _eqEsFavorito(p.id);
  return '<div class="eq-miembro-fila" onclick="_eqAbrirPerfil(\'' + p.id + '\')">' +
      _eqAvatarHtml(p, 'avatar-pill--sm') +
      '<div class="eq-miembro-info">' +
        '<div class="eq-miembro-nombre">' + _eqEsc(p.nombreDerby) + ' <span class="eq-miembro-numero">#' + p.numeroDerby + '</span></div>' +
        '<div class="eq-miembro-username">@' + _eqEsc(p.username) + '</div>' +
      '</div>' +
      '<button type="button" class="eq-fav-btn' + (fav ? ' activo' : '') + '" data-eq-fav="' + p.id + '" onclick="event.stopPropagation();_eqToggleFavorito(\'' + p.id + '\')" title="' + (fav ? 'Quitar de favoritos' : 'Agregar a favoritos') + '">' +
        '<span class="material-symbols-outlined">' + (fav ? 'favorite' : 'favorite_border') + '</span>' +
      '</button>' +
    '</div>';
}

/* ── Búsqueda (filtra por nombre derby + username, AND implícito con el
   grupo/favoritos que la contiene) -- oculta secciones sin resultados sin
   sacarlas del DOM, mismo criterio que el resto de la app. */
function _eqBuscar(valor) {
  _eqBusqueda = (valor || '').trim().toLowerCase();
  _eqRenderFavoritos();
  _eqRenderGrupo('Quindes');
  _eqRenderGrupo('Mirlxs');
}
function _eqPasaBusqueda(p) {
  if (!_eqBusqueda) return true;
  return p.nombreDerby.toLowerCase().indexOf(_eqBusqueda) !== -1 ||
    p.username.toLowerCase().indexOf(_eqBusqueda) !== -1;
}

function _eqRenderFavoritos() {
  var wrap = document.getElementById('eq-favoritos-wrap');
  var cont = document.getElementById('eq-favoritos-lista');
  if (!wrap || !cont) return;
  var todas = _eqFavoritos().map(_eqPersonaPorId).filter(function(p) { return !!p && !_eqEsUsuarioActual(p); });
  if (_eqBusqueda) {
    var filtradas = todas.filter(_eqPasaBusqueda);
    wrap.style.display = filtradas.length ? '' : 'none';
    if (filtradas.length) cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
  } else {
    wrap.style.display = '';
    cont.innerHTML = todas.length
      ? todas.map(_eqFilaHtml).join('')
      : '<div class="eq-favoritos-vacio"><span class="material-symbols-outlined">favorite</span>Agrega personas a favoritos para verlos aquí</div>';
  }
  _eqHidratarAvatares();
}

function _eqRenderGrupo(rol) {
  var key = rol.toLowerCase();
  var wrap = document.getElementById('eq-grupo-' + key);
  var cont = document.getElementById('eq-grupo-' + key + '-lista');
  var pillEl = document.getElementById('eq-grupo-' + key + '-pill');
  if (!wrap || !cont) return;
  var filtradas = _eqPersonas.filter(function(p) { return p.rol === rol; }).filter(function(p) { return !_eqEsUsuarioActual(p); }).filter(_eqPasaBusqueda);
  wrap.style.display = filtradas.length ? '' : 'none';
  if (pillEl) pillEl.textContent = filtradas.length;
  cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
  _eqHidratarAvatares();
}

function _eqToggleGrupo(rol) {
  var key = rol.toLowerCase();
  var header = document.getElementById('eq-grupo-' + key + '-header');
  var body = document.getElementById('eq-grupo-' + key + '-body');
  if (!header || !body) return;
  var abrir = !header.classList.contains('abierto');
  header.classList.toggle('abierto', abrir);
  body.classList.toggle('abierto', abrir);
}

/* ── Perfil de detalle (#s-equipo-perfil) ────────────────────────────── */
function _eqAbrirPerfil(id) {
  var p = _eqPersonaPorId(id);
  if (!p) return;
  _eqPersonaActual = p;
  _eqRenderPerfil(p);
  ir('s-equipo-perfil');
}
function _eqVolverLista() { volver('s-equipo'); }

// `E.nombre` es el username real (así llega desde loginGoogle()/adminLogin(),
// supabase/functions/api/index.ts: `nombre: row.username`), NO el nombre
// derby -- comparación normalizada, mismo criterio que _evNombresCoinciden()
// (js/eventos.js). **Bug real corregido en el Cambio 55:** hasta acá (demo,
// sin backend) comparaba contra `p.nombreDerby`, que en los datos demo
// coincidía por casualidad con lo que se probaba a mano -- contra datos
// reales (derby ≠ username casi siempre) esta comparación era falsa para
// cualquier cuenta real, rompiendo silenciosamente "es mi propio perfil"
// (botón WhatsApp/editar en la nav del perfil).
function _eqEsUsuarioActual(p) {
  return !!(p && p.nombre && typeof E !== 'undefined' && E.nombre &&
    p.nombre.trim().toUpperCase() === String(E.nombre).trim().toUpperCase());
}

// `telefono` (columna real, `getEquipo()`) es el número LOCAL sin código de
// país -- el código de país vive aparte en `prefijo` (formato real
// "🇦🇷 +54 (Argentina)", armado por inscripcion.js), nunca en `telefono`.
// Mismo criterio de extracción/limpieza ya usado por `adminGetQueLlevar()`
// (supabase/functions/api/index.ts, botón WhatsApp de "Qué llevar"): regex
// `/\+(\d+)/` sobre `prefijo` para quedarse solo con los dígitos después del
// `+` (descarta bandera/nombre de país), `telefono` sin nada no-numérico y
// sin el `0` inicial (formato de discado local, inválido en un link
// internacional de wa.me). Antes de este fix, esta función ignoraba
// `prefijo` por completo y armaba el link solo con `telefono` -- para
// cualquier cuenta real (a diferencia de los datos demo, que tenían el `+`
// embebido a mano en el propio `telefono`) el link quedaba sin código de
// país, apuntando a un número inválido/distinto.
function _eqWhatsappUrl(prefijo, telefono) {
  var matchPrefijo = String(prefijo || '').match(/\+(\d+)/);
  if (!matchPrefijo || !telefono) return '';
  var limpio = String(telefono).replace(/\D/g, '');
  if (limpio.charAt(0) === '0') limpio = limpio.slice(1);
  return limpio ? 'https://wa.me/' + matchPrefijo[1] + limpio : '';
}

var _EQ_WA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

function _eqNavHtml(p) {
  var fav = _eqEsFavorito(p.id);
  var waUrl = _eqWhatsappUrl(p.prefijo, p.telefono);
  var acciones = '<button type="button" class="app-nav-icon-btn" data-eq-fav="' + p.id + '" onclick="_eqToggleFavorito(\'' + p.id + '\')" title="' + (fav ? 'Quitar de favoritos' : 'Agregar a favoritos') + '"><span class="material-symbols-outlined">' + (fav ? 'favorite' : 'favorite_border') + '</span></button>';
  if (waUrl) {
    acciones += '<a class="app-nav-icon-btn eq-wa-btn" href="' + waUrl + '" target="_blank" rel="noopener" title="WhatsApp">' + _EQ_WA_SVG + '</a>';
  }
  if (_eqEsUsuarioActual(p)) {
    acciones += '<button type="button" class="app-nav-icon-btn" onclick="irEditarDatos()" title="Editar mis datos"><span class="material-symbols-outlined">edit</span></button>';
  }
  return '<div class="eq-perfil-nav-row">' +
      '<button class="app-nav-back" onclick="_eqVolverLista()" title="Volver"><span class="material-symbols-outlined">arrow_back</span></button>' +
      '<div class="app-nav-actions">' + acciones + '</div>' +
    '</div>';
}

// Texto contextual de la barra de rango -- mismos 3 escalones (>=75/>=50/<50)
// para los 2 roles, pero con la narrativa invertida: para Mirlxs es "cuánto
// falta para llegar a Quindes" (progreso hacia arriba), para Quindes es
// "cuánto margen queda antes de bajar a Mirlxs" (colchón antes de caer) --
// mismo `termometro_pct` numérico en los 2 casos, sin invertir el número ni
// el ancho del fill (0 = punta Mirlxs de la escala, 100 = punta Quindes),
// solo cambia qué significa ese número para cada rol. `termometro_pct` real
// desde el Cambio 59 (antes `rankPct`, 0 fijo desde el Cambio 55 -- ver
// MANIFEST.md), snake_case tal cual llega de getEquipo(), mismo criterio que
// horas_ano/asistencias_ano.
// Horas/asistencia real del año (Cambio 58) -- `p.horas_ano`/
// `p.asistencias_ano`/`p.total_eventos_ano` llegan tal cual de getEquipo()
// (snake_case, ver ese comentario en supabase/functions/api/index.ts),
// pobladas por recalcularStatsEquipo(). Reusada por el panel de Equipo
// (_eqPerfilContenidoHtml(), más abajo) y por Ajustes (_datosRenderStatsHtml(),
// js/perfil.js) para no duplicar la fórmula en 2 archivos.
function _eqStatsCalc(p) {
  return {
    horas: Math.round((p.horas_ano || 0) * 10) / 10,
    asistenciaPct: (p.total_eventos_ano || 0) > 0 ? Math.round((p.asistencias_ano || 0) / p.total_eventos_ano * 100) : 0,
  };
}

function _eqRankTexto(p) {
  var esQuindes = p.rol === 'Quindes';
  if (esQuindes) {
    if (p.termometro_pct >= 75) return 'Posición sólida como Quinde';
    if (p.termometro_pct >= 50) return 'Mantené el ritmo';
    return 'Cerca del límite con Mirlxs';
  }
  if (p.termometro_pct >= 75) return 'Muy cerca de ser Quinde';
  if (p.termometro_pct >= 50) return 'Buen progreso hacia Quindes';
  return 'Seguí sumando asistencia';
}

// Segmented control [Quindes | Auto | Mirlxs] del perfil de detalle,
// admin-only (Cambio 52) -- fija/libera manualmente la categoría de una
// persona (`persona.tierModo`, ver _EQ_TIER_DESCRIPCIONES/_eqCambiarTier()
// más abajo). `_adminToken` (no un `E.esAdmin` que no existe en esta app --
// el admin real se identifica con ese token, mismo criterio ya usado en
// todo js/eventos.js, ej. `_evTourIniciarSiCorresponde()`) gatea el bloque
// entero, incluido para el propio perfil del admin.
function _eqTierAdminHtml(p) {
  if (typeof _adminToken === 'undefined' || !_adminToken) return '';
  var modos = ['quinde', 'auto', 'mirlxs'];
  var textos = { quinde: 'Quindes', auto: 'Auto', mirlxs: 'Mirlxs' };
  var botones = modos.map(function(m) {
    return '<button type="button" class="eq-tier-btn' + (p.tierModo === m ? ' activo' : '') + '" data-modo="' + m + '" onclick="_eqCambiarTier(\'' + p.id + '\',\'' + m + '\')">' + textos[m] + '</button>';
  }).join('');
  return '<div class="eq-tier-admin eq-acord">' +
      '<div class="eq-acord-header" onclick="eqToggleAcordeon(this)">' +
        '<p class="eq-tier-label" style="margin:0">Categoría</p>' +
        '<span class="eq-acord-icono"><span class="material-symbols-rounded">chevron_right</span></span>' +
      '</div>' +
      '<div class="eq-acord-cuerpo">' +
        '<div class="eq-tier-control" data-id="' + p.id + '">' + botones + '</div>' +
        '<p class="eq-tier-desc" id="eq-tier-desc-' + p.id + '">' + _eqEsc(_EQ_TIER_DESCRIPCIONES[p.tierModo]) + '</p>' +
      '</div>' +
    '</div>';
}

// Toggle genérico de acordeón (Cambio 57) -- `header` es el `.eq-acord-header`
// clickeado (`this` del onclick inline, mismo patrón sin listener delegado
// que el resto de este archivo); el contenedor a togglear es su padre
// directo (`.eq-acord`, ver `_eqTierAdminHtml()`/`_eqAdminGestionHtml()`).
function eqToggleAcordeon(header) {
  header.parentNode.classList.toggle('eq-acord-abierto');
}

// Toggle de modo de tier -- llamada directa desde el `onclick` de cada
// `.eq-tier-btn` (mismo patrón que el resto de este archivo, ej.
// `_eqToggleFavorito()`/`_eqAbrirPerfil()`: onclick inline con el id como
// string, sin ningún listener delegado -- no hay ninguno en toda esta
// sección, no hacía falta sumar el primero acá). `id` es el `username` real
// (Cambio 55 -- `equipo` no tiene ningún id numérico propio, se identifica
// por esa natural key en todas las acciones existentes), siempre string --
// no hace falta `parseInt`/`+id`.
function _eqCambiarTier(id, modo) {
  var persona = _eqPersonaPorId(id);
  if (!persona) return;
  persona.tierModo = modo;

  document.querySelectorAll('.eq-tier-control[data-id="' + id + '"] .eq-tier-btn').forEach(function(btn) {
    btn.classList.toggle('activo', btn.getAttribute('data-modo') === modo);
  });

  var desc = document.getElementById('eq-tier-desc-' + id);
  if (desc) desc.textContent = _EQ_TIER_DESCRIPCIONES[modo];

  var rankWrap = document.querySelector('#s-equipo-perfil .eq-rank-wrap');
  if (rankWrap) rankWrap.classList.toggle('eq-rank-oculto', modo !== 'auto');

  // Sección de gestión admin (estado/cuota/admin, Cambio 53) -- solo tiene
  // sentido para Quindes, se desvanece si la categoría pasa a Mirlxs (y
  // vuelve si sale de ahí), mismo mecanismo `.eq-oculto` que el termómetro.
  var secAdminQ = document.getElementById('eq-admin-q-' + id);
  if (secAdminQ) {
    if (modo === 'mirlxs') {
      secAdminQ.classList.add('eq-oculto');
    } else {
      secAdminQ.classList.remove('eq-oculto');
    }
  }

  apiPost({ action: 'adminSetTierModo', adminToken: _adminToken, nombre: persona.nombre, tierModo: modo }, function() {}, function() {
    mostrarToast('No se pudo guardar el cambio de categoría.', 'error');
  });
}

// ── Gestión admin de miembro (Cambio 53): estado + cuota + admin ───────
// Sección propia del perfil, solo Quindes (se oculta con fade si la
// categoría es Mirlxs, ver `.eq-oculto`/`_eqCambiarTier()` arriba) --
// admin-only, mismo gate que `_eqTierAdminHtml()`.
function _eqAdminGestionHtml(p) {
  if (typeof _adminToken === 'undefined' || !_adminToken) return '';
  var estadoActual = _eqEstadoEfectivo(p);
  var botonesEstado = _EQ_ESTADOS.map(function(est) {
    return '<button type="button" class="eq-estado-btn' + (estadoActual === est ? ' activo' : '') + '" data-estado="' + est + '" onclick="_eqCambiarEstado(\'' + p.id + '\',\'' + est + '\')">' + est + '</button>';
  }).join('');
  var hint = (estadoActual === 'Ausente' && p.estado !== 'Ausente')
    ? 'Marcada automáticamente como ausente por más de 30 días sin asistir.'
    : 'Si no asiste por 30 días seguidos, pasa a Ausente automáticamente.';
  // "Paga cuota" (visible) es el inverso de `exentaCuota` (real, Cambio 55) --
  // el toggle sigue leyendo/mostrando "paga" (más natural para un admin que
  // "está exenta"), pero internamente togglea `exenta_cuota` invertido, ver
  // _eqToggleCuota() más abajo.
  var pagaCuota = !p.exentaCuota;
  // Sin email registrado, `adminAgregarAdmin`/`adminQuitarAdmin` (acciones
  // reales, identifican por email -- no hay ningún flag de admin por
  // username en el backend) no tienen a quién apuntar -- mismo criterio de
  // "deshabilitar con hint" que el toggle de cuota en Lesionadx.
  var sinEmail = !p.email;
  return '<div class="eq-admin-quindes' + (p.tierModo === 'mirlxs' ? ' eq-oculto' : '') + '" id="eq-admin-q-' + p.id + '">' +
      '<div class="eq-admin-sep"></div>' +
      '<div class="eq-admin-campo eq-acord">' +
        '<div class="eq-acord-header" onclick="eqToggleAcordeon(this)">' +
          '<p class="eq-tier-label" style="margin:0">Estado</p>' +
          '<span class="eq-acord-icono"><span class="material-symbols-rounded">chevron_right</span></span>' +
        '</div>' +
        '<div class="eq-acord-cuerpo">' +
          '<div class="eq-estado-opciones">' + botonesEstado + '</div>' +
          '<p class="eq-admin-hint" id="eq-estado-hint-' + p.id + '">' + hint + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="eq-admin-campo eq-admin-campo--row">' +
        '<div>' +
          '<p class="eq-tier-label" style="margin-bottom:2px">Paga cuota</p>' +
          '<p class="eq-admin-hint" style="margin:0" id="eq-cuota-hint-' + p.id + '">' + (estadoActual === 'Lesionadx' ? 'Exento/a de cuota mientras está Lesionadx.' : 'Indica si está al día con la cuota mensual.') + '</p>' +
        '</div>' +
        '<label class="eq-toggle" id="eq-tog-cuota-' + p.id + '">' +
          '<input type="checkbox"' + (pagaCuota ? ' checked' : '') + (estadoActual === 'Lesionadx' ? ' disabled' : '') +
            ' onchange="_eqToggleCuota(\'' + p.id + '\', this.checked)">' +
          '<span class="eq-toggle-slider"></span>' +
        '</label>' +
      '</div>' +
      '<div class="eq-admin-campo eq-admin-campo--row">' +
        '<div>' +
          '<p class="eq-tier-label" style="margin-bottom:2px">Administradora</p>' +
          '<p class="eq-admin-hint" style="margin:0" id="eq-admin-hint-' + p.id + '">' + (sinEmail ? 'Sin email registrado -- no se puede dar acceso admin.' : 'Tendrá acceso completo al panel de administración (Mi Liga).') + '</p>' +
        '</div>' +
        '<label class="eq-toggle" id="eq-tog-admin-' + p.id + '">' +
          '<input type="checkbox"' + (p.esAdminMiembro ? ' checked' : '') + (sinEmail ? ' disabled' : '') +
            ' onchange="_eqToggleAdmin(\'' + p.id + '\', this.checked, this)">' +
          '<span class="eq-toggle-slider"></span>' +
        '</label>' +
      '</div>' +
    '</div>';
}

// Cambia el estado manual de una persona -- botones del segmented control
// de arriba, sin listener delegado (mismo criterio que `_eqCambiarTier()`).
// `querySelectorAll` sin scope por id: hay como mucho UN perfil abierto a
// la vez en esta app (#s-equipo-perfil muestra una sola persona), así que
// nunca conviven 2 `.eq-estado-opciones` distintas en el DOM al mismo
// tiempo -- no hace falta escopear por `data-id` como sí hace el control
// de tier (ese si puede, en teoría, convivir con el próximo si se
// reabriera rápido; acá el propio querySelectorAll ya alcanza).
function _eqCambiarEstado(id, nuevoEstado) {
  var persona = _eqPersonaPorId(id); // helper ya existente
  if (!persona) return;
  persona.estado = nuevoEstado;
  var bots = document.querySelectorAll('.eq-estado-opciones .eq-estado-btn');
  for (var i = 0; i < bots.length; i++) {
    bots[i].className = 'eq-estado-btn' + (bots[i].getAttribute('data-estado') === nuevoEstado ? ' activo' : '');
  }
  // Auto-cuota: Lesionadx exime de cuota -- deshabilita el toggle con un
  // hint (sin forzar su valor localmente; el backend sí la fuerza --
  // adminSetEstadoMiembro mantiene exenta_cuota en sync con Lesionadx como
  // única fuente de verdad, ver supabase/functions/api/index.ts), cualquier
  // otro estado lo rehabilita y restaura el hint default.
  var cuotaInput = document.querySelector('#eq-tog-cuota-' + id + ' input');
  if (cuotaInput) cuotaInput.disabled = (nuevoEstado === 'Lesionadx');
  var cuotaHint = document.getElementById('eq-cuota-hint-' + id);
  if (cuotaHint) cuotaHint.textContent = (nuevoEstado === 'Lesionadx') ? 'Exento/a de cuota mientras está Lesionadx.' : 'Indica si está al día con la cuota mensual.';
  persona.exentaCuota = (nuevoEstado === 'Lesionadx');
  if (cuotaInput) cuotaInput.checked = !persona.exentaCuota;
  apiPost({ action: 'adminSetEstadoMiembro', adminToken: _adminToken, nombre: persona.nombre, estadoMiembro: nuevoEstado }, function() {}, function() {
    mostrarToast('No se pudo guardar el cambio de estado.', 'error');
  });
}

// "Paga cuota" (checked) es el inverso de `exentaCuota` (real) -- ver el
// comentario de _eqAdminGestionHtml() de arriba.
function _eqToggleCuota(id, valorPagaCuota) {
  var persona = _eqPersonaPorId(id);
  if (!persona) return;
  persona.exentaCuota = !valorPagaCuota;
  apiPost({ action: 'adminSetExentaCuota', adminToken: _adminToken, nombre: persona.nombre, valor: !valorPagaCuota }, function() {}, function() {
    mostrarToast('No se pudo guardar el cambio de cuota.', 'error');
  });
}

function _eqToggleAdmin(id, valor, checkboxEl) {
  if (!valor) {
    var persona = _eqPersonaPorId(id);
    if (!persona) return;
    persona.esAdminMiembro = false;
    apiPost({ action: 'adminQuitarAdmin', adminToken: _adminToken, email: persona.email }, function() {}, function(e) {
      persona.esAdminMiembro = true;
      checkboxEl.checked = true;
      mostrarToast((e && e.message) || 'No se pudo quitar el acceso admin.', 'error');
    });
    return;
  }
  // Revertir visualmente hasta confirmación
  checkboxEl.checked = false;
  _eqAbrirConfirmAdmin(id);
}

function _eqAbrirConfirmAdmin(id) {
  var persona = _eqPersonaPorId(id);
  if (!persona || !persona.email) return; // toggle ya viene disabled sin email, ver _eqAdminGestionHtml()
  var sheet = document.getElementById('eq-sheet-confirm-admin');
  var msg = document.getElementById('eq-sheet-confirm-msg');
  // Mensaje real (Cambio 55) -- el admin de esta app es global (tabla
  // `admins`), no un rol acotado a "editar el equipo": corregido para no
  // subestimar el alcance real del acceso que se está por otorgar.
  if (msg) msg.textContent = '¿Dar acceso de administradora a ' + persona.nombreDerby + '? Tendrá acceso completo al panel de administración (Mi Liga).';
  sheet.setAttribute('data-pendiente-id', id);
  sheet.classList.add('visible');
}

function _eqConfirmarAdminOk() {
  var sheet = document.getElementById('eq-sheet-confirm-admin');
  var id = sheet.getAttribute('data-pendiente-id');
  var persona = _eqPersonaPorId(id);
  sheet.classList.remove('visible');
  if (!persona || !persona.email) return;
  persona.esAdminMiembro = true;
  var cb = document.querySelector('#eq-tog-admin-' + id + ' input');
  if (cb) cb.checked = true;
  apiPost({ action: 'adminAgregarAdmin', adminToken: _adminToken, email: persona.email }, function() {}, function(e) {
    persona.esAdminMiembro = false;
    if (cb) cb.checked = false;
    mostrarToast((e && e.message) || 'No se pudo dar el acceso admin.', 'error');
  });
}

function _eqConfirmarAdminCancelar() {
  document.getElementById('eq-sheet-confirm-admin').classList.remove('visible');
}

// "2024-07-03" -> "3 de julio de 2024" -- misma fórmula que
// _ajFormatearFechaIngreso() (js/perfil.js), duplicada a propósito acá en
// vez de depender de que perfil.js ya haya cargado (carga DESPUÉS de
// equipo.js, ver orden de scripts en index.html), mismo criterio ya usado
// por _fechaCalendarioATexto()/js/home.js.
function _eqFormatearFechaIngreso(iso) {
  var p = iso.split('-');
  var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return p[2].replace(/^0/, '') + ' de ' + meses[+p[1] - 1] + ' de ' + p[0];
}

function _eqPerfilContenidoHtml(p) {
  var pills = [];
  if (p.pronombres) pills.push(p.pronombres);
  // `p.roles` (Jammer/Bloqueadora/Capitana/etc) nunca tuvo columna real en
  // `equipo` (auditado en el Cambio 55, ver MANIFEST.md) -- `getEquipo()` no
  // lo devuelve, así que este `.forEach` no agrega nada hoy. Se deja el
  // guard (no un array hardcodeado) por si Victor agrega esa columna a futuro.
  (p.roles || []).forEach(function(r) { pills.push(r); });
  var pillsHtml = pills.map(function(txt) { return '<span class="aj-pill">' + _eqEsc(txt) + '</span>'; }).join('');

  // Fila de cumpleaños sacada (Cambio 55) -- `getEquipo()` no la devuelve:
  // el dato real (`fecha_nacimiento`) está gateado por privacidad
  // (`fecha_publica`, hoy solo consumida por getCumpleañosRango()/js/eventos.js
  // para el listado de cumples, con su propia regla de visibilidad) -- traerla
  // acá habría requerido decidir de nuevo esa regla para un contexto distinto,
  // fuera de alcance de "reemplazar el demo por datos reales". Pendiente que
  // Victor decida si la quiere de vuelta en el perfil de Equipo.
  var filas = '';
  if (p.telefono) filas += '<a class="eq-info-fila" href="tel:' + _eqEsc(p.telefono) + '"><span class="material-symbols-outlined">call</span><span class="eq-info-texto">' + _eqEsc(p.telefono) + '</span></a>';
  if (p.email) filas += '<a class="eq-info-fila" href="mailto:' + _eqEsc(p.email) + '"><span class="material-symbols-outlined">mail</span><span class="eq-info-texto">' + _eqEsc(p.email) + '</span></a>';
  // `fechaIngreso` ('fecha_ingreso', getEquipo()) -- mismo dato ya expuesto
  // para la cuenta propia en Ajustes (E.datos.fechaIngreso, js/perfil.js),
  // ahora también visible en el perfil de detalle de CUALQUIER miembro. Sin
  // link (a diferencia de telefono/email) -- `<div>`, no `<a>`, mismo
  // `.eq-info-fila` (estilo genérico de fila, no depende de ser un enlace).
  if (p.fechaIngreso) filas += '<div class="eq-info-fila"><span class="material-symbols-outlined">calendar_month</span><span class="eq-info-texto">Entró al equipo ' + _eqEsc(_eqFormatearFechaIngreso(p.fechaIngreso)) + '</span></div>';

  var statsCalc = _eqStatsCalc(p);
  return '<div class="eq-perfil-header">' +
      '<div class="eq-avatar-wrap">' +
        _eqAvatarHtml(p, 'eq-avatar-grande') +
        '<span class="eq-rol-pill">' + _eqEsc(p.rol) + '</span>' +
      '</div>' +
      '<div class="eq-perfil-nombre">' + _eqEsc(p.nombreDerby) + '</div>' +
      '<div class="eq-perfil-sub">#' + p.numeroDerby + ' &bull; @' + _eqEsc(p.username) + '</div>' +
    '</div>' +
    (pillsHtml ? '<div class="eq-perfil-pills-row">' + pillsHtml + '</div>' : '') +
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">roller_skating</span><div class="eq-stat-valor">' + statsCalc.horas + 'h</div><div class="eq-stat-label">Horas patinadas</div></div>' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">kid_star</span><div class="eq-stat-valor">' + statsCalc.asistenciaPct + '%</div><div class="eq-stat-label">Asistencia anual</div></div>' +
    '</div>' +
    '<div class="eq-rank-wrap">' +
      '<div class="eq-rank-labels"><span>Mirlxs</span><span>Quindes</span></div>' +
      '<div class="eq-rank-track"><div class="eq-rank-fill" id="eq-rank-fill" style="width:0%;"></div></div>' +
      '<div class="eq-rank-texto">' + _eqEsc(_eqRankTexto(p)) + '</div>' +
    '</div>' +
    (filas ? '<div class="eq-info-lista">' + filas + '</div>' : '') +
    _eqTierAdminHtml(p) +
    _eqAdminGestionHtml(p);
}

function _eqActualizarNavPerfil() {
  if (!_eqPersonaActual) return;
  var nav = document.getElementById('eq-perfil-nav');
  if (nav) nav.innerHTML = _eqNavHtml(_eqPersonaActual);
}

function _eqRenderPerfil(p) {
  var nav = document.getElementById('eq-perfil-nav');
  var cont = document.getElementById('eq-perfil-contenido');
  if (nav) nav.innerHTML = _eqNavHtml(p);
  if (cont) cont.innerHTML = _eqPerfilContenidoHtml(p);
  _eqHidratarAvatares();
  // Tier fijado a mano (Cambio 52) -- el termómetro arranca YA oculto, sin
  // animar el estado inicial (`.sin-transicion` se saca en el frame
  // siguiente, mismo truco doble-rAF que el fill de acá abajo) en vez de
  // aparecer un instante y recién ahí desvanecerse.
  if (p.tierModo !== 'auto') {
    var rankWrap = document.querySelector('#s-equipo-perfil .eq-rank-wrap');
    if (rankWrap) {
      rankWrap.classList.add('eq-rank-oculto', 'sin-transicion');
      requestAnimationFrame(function() { rankWrap.classList.remove('sin-transicion'); });
    }
  }
  // Arranca en width:0 (innerHTML de arriba) y recién acá sube a su valor
  // real -- doble rAF para forzar al navegador a pintar el 0% primero, sin
  // eso la transición de `.eq-rank-fill` (css/equipo.css) no se ve (mismo
  // truco ya usado en abrirContacto(), js/ui.js).
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var fill = document.getElementById('eq-rank-fill');
      if (fill) fill.style.width = (p.termometro_pct || 0) + '%';
    });
  });
}
