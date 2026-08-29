// js/equipo.js — Sección Equipo (Cambio 42, greenfield). Roster del club:
// lista con búsqueda + favoritos (localStorage) + perfil de detalle.
// Datos 100% demo (_EQ_EQUIPO_DEMO abajo) -- sin backend real todavía, ver
// MANIFEST.md. Reusa helpers compartidos ya existentes: _avatarSetFotoOInicial
// (js/ui.js), ir()/volver() (js/ui.js), .aj-pill (css/perfil.css).

var _EQ_EQUIPO_DEMO = [
  { id: 'q1', nombreDerby: 'Comet Fatal', numeroDerby: 7, username: 'cometfatal', fotoPerfil: '',
    rol: 'Quindes', pronombres: 'Ella, elle', roles: ['Jammer', 'Coach'],
    telefono: '+593987654321', cumple: '15 de abril', email: 'comet@example.com',
    rankPct: 82, tierModo: 'auto', stats: { horasPatinadas: 48, asistenciaPct: 87 } },
  { id: 'q2', nombreDerby: 'Furia Andina', numeroDerby: 22, username: 'furiaandina', fotoPerfil: '',
    rol: 'Quindes', pronombres: 'Ella', roles: ['Bloqueadora'],
    telefono: '+593998765432', cumple: '3 de julio', email: 'furia@example.com',
    rankPct: 22, tierModo: 'auto', stats: { horasPatinadas: 36, asistenciaPct: 74 } },
  { id: 'q3', nombreDerby: 'Vudú Cría', numeroDerby: 13, username: 'vuducria', fotoPerfil: '',
    rol: 'Quindes', pronombres: 'Elle', roles: ['Pivot', 'Capitana'],
    telefono: '', cumple: '', email: '',
    rankPct: 95, tierModo: 'auto', stats: { horasPatinadas: 52, asistenciaPct: 92 } },
  { id: 'm1', nombreDerby: 'Pluma Letal', numeroDerby: 9, username: 'plumaletal', fotoPerfil: '',
    rol: 'Mirlxs', pronombres: 'Ella, elle', roles: ['Jammer'],
    telefono: '+593991112233', cumple: '22 de octubre', email: 'pluma@example.com',
    rankPct: 55, tierModo: 'auto', stats: { horasPatinadas: 31, asistenciaPct: 68 } },
  { id: 'm2', nombreDerby: 'Chukirawa', numeroDerby: 44, username: 'chukirawa', fotoPerfil: '',
    rol: 'Mirlxs', pronombres: 'Él', roles: ['Bloqueador', 'Entrenador'],
    telefono: '+593984445566', cumple: '9 de enero', email: 'chukirawa@example.com',
    rankPct: 90, tierModo: 'auto', stats: { horasPatinadas: 60, asistenciaPct: 95 } },
  { id: 'm3', nombreDerby: 'Neblina Roja', numeroDerby: 18, username: 'neblinaroja', fotoPerfil: '',
    rol: 'Mirlxs', pronombres: 'Ella', roles: ['Pivot'],
    telefono: '', cumple: '30 de mayo', email: '',
    rankPct: 30, tierModo: 'auto',
    stats: { horasPatinadas: 24, asistenciaPct: 55 } }
];

// Descripciones del modo de categoría (tier) -- ver _eqCambiarTier()/
// _eqPerfilContenidoHtml() más abajo (Cambio 52). 'quinde'/'mirlxs': fijado
// a mano por un admin, el sistema deja de recalcularla según asistencia.
// 'auto' (default de todas las personas en _EQ_EQUIPO_DEMO): la categoría
// sigue derivándose del % de asistencia (el termómetro, `rankPct`).
var _EQ_TIER_DESCRIPCIONES = {
  quinde: 'Categoría fijada manualmente en Quindes. El sistema ignorará los stats de asistencia.',
  auto:   'La categoría se asigna automáticamente según el porcentaje de asistencia.',
  mirlxs: 'Categoría fijada manualmente en Mirlxs. El sistema ignorará los stats de asistencia.'
};

var _eqYaInicializado = false;
var _eqPersonaActual = null;
var _eqBusqueda = '';

function _eqEsc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

function _eqPersonaPorId(id) {
  return _EQ_EQUIPO_DEMO.filter(function(p) { return p.id === id; })[0] || null;
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
}

/* ── Punto de entrada (ver 'entrar' de APP_BOTTOM_NAV_ITEMS en js/ui.js) ── */
function irEquipo() {
  if (!_eqYaInicializado) _eqInit();
  volver('s-equipo');
}

function _eqInit() {
  _eqRenderFavoritos();
  _eqRenderGrupo('Quindes');
  _eqRenderGrupo('Mirlxs');
  _eqYaInicializado = true;
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
      '<button type="button" class="eq-fav-btn' + (fav ? ' activo' : '') + '" onclick="event.stopPropagation();_eqToggleFavorito(\'' + p.id + '\')" title="' + (fav ? 'Quitar de favoritos' : 'Agregar a favoritos') + '">' +
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
  var todas = _eqFavoritos().map(_eqPersonaPorId).filter(function(p) { return !!p; });
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
  var filtradas = _EQ_EQUIPO_DEMO.filter(function(p) { return p.rol === rol; }).filter(_eqPasaBusqueda);
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

// Esta app identifica cuentas por nombre derby (E.nombre), no por un `id`
// numérico real (comparación normalizada, mismo criterio que
// _evNombresCoinciden(), js/eventos.js) -- _EQ_EQUIPO_DEMO no está atado al
// backend real, así que "el usuario logueado" se resuelve así en vez de
// contra un E.id que no existe en esta app.
function _eqEsUsuarioActual(p) {
  return !!(p && p.nombreDerby && typeof E !== 'undefined' && E.nombre &&
    p.nombreDerby.trim().toUpperCase() === String(E.nombre).trim().toUpperCase());
}

function _eqWhatsappUrl(telefono) {
  var limpio = String(telefono || '').replace(/\D/g, '');
  return limpio ? 'https://wa.me/' + limpio : '';
}

var _EQ_WA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

function _eqNavHtml(p) {
  var fav = _eqEsFavorito(p.id);
  var waUrl = _eqWhatsappUrl(p.telefono);
  var acciones = '<button type="button" class="app-nav-icon-btn" onclick="_eqToggleFavorito(\'' + p.id + '\')" title="' + (fav ? 'Quitar de favoritos' : 'Agregar a favoritos') + '"><span class="material-symbols-outlined">' + (fav ? 'favorite' : 'favorite_border') + '</span></button>';
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
// mismo `rankPct` numérico en los 2 casos, sin invertir el número ni el
// ancho del fill (0 = punta Mirlxs de la escala, 100 = punta Quindes),
// solo cambia qué significa ese número para cada rol.
function _eqRankTexto(p) {
  var esQuindes = p.rol === 'Quindes';
  if (esQuindes) {
    if (p.rankPct >= 75) return 'Posición sólida como Quinde';
    if (p.rankPct >= 50) return 'Mantené el ritmo';
    return 'Cerca del límite con Mirlxs';
  }
  if (p.rankPct >= 75) return 'Muy cerca de ser Quinde';
  if (p.rankPct >= 50) return 'Buen progreso hacia Quindes';
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
  return '<div class="eq-tier-admin">' +
      '<p class="eq-tier-label">Categoría (solo admins)</p>' +
      '<div class="eq-tier-control" data-id="' + p.id + '">' + botones + '</div>' +
      '<p class="eq-tier-desc" id="eq-tier-desc-' + p.id + '">' + _eqEsc(_EQ_TIER_DESCRIPCIONES[p.tierModo]) + '</p>' +
    '</div>';
}

// Toggle de modo de tier -- llamada directa desde el `onclick` de cada
// `.eq-tier-btn` (mismo patrón que el resto de este archivo, ej.
// `_eqToggleFavorito()`/`_eqAbrirPerfil()`: onclick inline con el id como
// string, sin ningún listener delegado -- no hay ninguno en toda esta
// sección, no hacía falta sumar el primero acá). `id` siempre es el string
// de `_EQ_EQUIPO_DEMO` (`'q1'`, `'m2'`, etc.), nunca numérico -- no hace
// falta `parseInt`/`+id`.
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

  // TODO: guardar en Supabase cuando esté integrado.
}

function _eqPerfilContenidoHtml(p) {
  var pills = [];
  if (p.pronombres) pills.push(p.pronombres);
  (p.roles || []).forEach(function(r) { pills.push(r); });
  var pillsHtml = pills.map(function(txt) { return '<span class="aj-pill">' + _eqEsc(txt) + '</span>'; }).join('');

  var filas = '';
  if (p.telefono) filas += '<a class="eq-info-fila" href="tel:' + _eqEsc(p.telefono) + '"><span class="material-symbols-outlined">call</span><span class="eq-info-texto">' + _eqEsc(p.telefono) + '</span></a>';
  if (p.cumple) filas += '<div class="eq-info-fila"><span class="material-symbols-outlined">cake</span><span class="eq-info-texto">' + _eqEsc(p.cumple) + '</span></div>';
  if (p.email) filas += '<a class="eq-info-fila" href="mailto:' + _eqEsc(p.email) + '"><span class="material-symbols-outlined">mail</span><span class="eq-info-texto">' + _eqEsc(p.email) + '</span></a>';

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
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">roller_skating</span><div class="eq-stat-valor">' + p.stats.horasPatinadas + 'h</div><div class="eq-stat-label">Horas patinadas</div></div>' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">kid_star</span><div class="eq-stat-valor">' + p.stats.asistenciaPct + '%</div><div class="eq-stat-label">Asistencia anual</div></div>' +
    '</div>' +
    '<div class="eq-rank-wrap">' +
      '<div class="eq-rank-labels"><span>Mirlxs</span><span>Quindes</span></div>' +
      '<div class="eq-rank-track"><div class="eq-rank-fill" id="eq-rank-fill" style="width:0%;"></div></div>' +
      '<div class="eq-rank-texto">' + _eqEsc(_eqRankTexto(p)) + '</div>' +
    '</div>' +
    _eqTierAdminHtml(p) +
    (filas ? '<div class="eq-info-lista">' + filas + '</div>' : '');
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
      if (fill) fill.style.width = p.rankPct + '%';
    });
  });
}
