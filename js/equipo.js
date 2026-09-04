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

// Roles dentro del equipo (Jammer/Blocker/etc, Batch 4) -- **sin columna
// real en `equipo`** (mismo hallazgo ya documentado para `roles` desde el
// Cambio 55: nunca existió esa columna, confirmado de nuevo antes de escribir
// esto). Se persiste por `localStorage`, clave `eq_roles_<username>` --
// leído/escrito por username, no por `id` (mismo valor en este roster, ver
// getEquipo()), para que "mi perfil" (Ajustes, `js/perfil.js`, guarda con
// `E.nombre`) y "ver a alguien en Equipo" (lee con `p.username`) apunten a
// la MISMA clave real. **Limitación real, no resuelta -- sin backend, el rol
// que alguien fija en su propio perfil solo es visible desde el MISMO
// dispositivo/navegador** (cualquier otra cuenta viendo ese perfil, en otro
// dispositivo, no lo va a ver) -- documentado tal cual en MANIFEST.md, no
// se inventó ningún endpoint real que no existe.
var _EQ_ROLES = ['Jammer', 'Blocker', 'Coach', 'Bench', 'SO', 'NSO', 'No definido'];
function _eqRolesDe(username) {
  if (!username) return [];
  try {
    var raw = localStorage.getItem('eq_roles_' + username);
    return raw ? JSON.parse(raw) : [];
  } catch (ex) { return []; }
}
function _eqSetRolesDe(username, roles) {
  if (!username) return;
  try { localStorage.setItem('eq_roles_' + username, JSON.stringify(roles)); } catch (ex) {}
}
// Texto para mostrar (detalle de Equipo, tarjetas) -- roles reales
// separados por coma, o el fallback pedido si está vacío o es
// exactamente `['No definido']` (mismo criterio: "sin rol real que mostrar").
function _eqRolesTexto(username) {
  var roles = _eqRolesDe(username);
  if (!roles.length || (roles.length === 1 && roles[0] === 'No definido')) return null;
  return roles.join(', ');
}

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

// Usuarios inactivos (bug real corregido, ver MANIFEST.md -- "no aparecen
// en la lista de Equipo ni en las listas de toma de asistencia"): definición
// PURA por fecha (30+ días sin una asistencia real registrada),
// independiente del `estado` fijado a mano por un admin -- a diferencia de
// `_eqEstadoEfectivo()` (arriba, mezcla ambos criterios para lo que se
// MUESTRA como estado en el panel admin), acá se separan a propósito:
// "Técnico"/"Lesionadx" siguen siendo miembros visibles del roster aunque
// no entrenen, este filtro es solo sobre inasistencia real. **Client-side,
// depende de que `ultimaAsistencia` (getEquipo(), poblada desde
// `log_asistencias`) esté al día en el modelo** -- si esa columna deja de
// actualizarse o el log real se desincroniza, esta función evalúa contra un
// dato viejo sin ningún aviso. Reversión explícita de Victor sobre el
// criterio anterior: antes, sin fecha registrada (nunca asistió, o el campo
// no llegó) se asumía ACTIVX ("no hay con qué evaluar inactividad
// todavía") -- pero eso dejaba a personas que JAMÁS asistieron (caso real:
// Zafiro) mostradas como activas indefinidamente, que es el escenario
// opuesto al que este chequeo existe para detectar. Ahora sin ninguna
// asistencia registrada se asume INACTIVX. Al registrarse una asistencia
// real, `ultimaAsistencia` se llena en el próximo `getEquipo()` y esta
// función vuelve a evaluar según los 30 días normales -- sin ningún estado
// propio que "reactivar" a mano.
function _eqEsInactivo(p) {
  if (!p) return false;
  if (!p.ultimaAsistencia) return true;
  var dias = Math.floor((Date.now() - new Date(p.ultimaAsistencia).getTime()) / 86400000);
  return dias >= 30;
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
  // Modo sin conexión (ver MANIFEST.md/CHANGELOG.md -- "soporte offline
  // para Ajustes, Equipo y Tareas"): sin red, sirve el último roster
  // cacheado ('eqcache', ver el hook chico en el callback de éxito de
  // abajo) en vez de encolar el callback esperando un fetch que nunca va
  // a resolver. `_eqCargado` queda en `false` a propósito -- al volver la
  // conexión, la próxima llamada real sigue pegándole a la red.
  if (!navigator.onLine) {
    var _eqCache = localStorage.getItem('eqcache');
    if (_eqCache) {
      try {
        var _eqCacheParsed = JSON.parse(_eqCache);
        _eqPersonas = _eqCacheParsed.equipo || [];
        cb();
        return;
      } catch (exEqCache) {}
    }
  }
  _eqCallbacksEspera.push(cb);
  if (_eqCargando) return;
  _eqCargando = true;
  api({ action: 'getEquipo' }, function(res) {
    _eqPersonas = (res && res.personas) || [];
    _eqCargado = true;
    _eqCargando = false;
    try { localStorage.setItem('eqcache', JSON.stringify({ equipo: _eqPersonas, ts: Date.now() })); } catch (exEqSave) {}
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
// Actualiza SOLO el botón de favorito (ícono/clase/title) de cada instancia
// visible de esta persona -- Batch 3, bug real "parpadeo al agregar a
// favoritos con usuarios con foto": `_eqRenderGrupo()` reconstruye el
// `innerHTML` entero de la lista (`_eqFilaHtml()`, incluye un `.eq-avatar`
// vacío que recién se hidrata DESPUÉS con la `<img>` real vía
// `_eqHidratarAvatares()`/`_avatarSetFotoOInicial()`) -- llamarla en cada
// toggle de favorito destruía y recreaba la `<img>` de TODOS los miembros
// del grupo (no solo el que cambió), forzando al navegador a re-pintarlas
// todas de nuevo, visible como parpadeo. `[data-eq-fav="id"]` ya identifica
// cada instancia del botón (fila de lista/favoritos, nav de detalle) sin
// necesitar tocar nada del resto de la fila (avatar incluido).
function _eqActualizarBotonesFavorito(id, fav) {
  document.querySelectorAll('[data-eq-fav="' + id + '"]').forEach(function(btn) {
    btn.classList.toggle('activo', fav);
    btn.title = fav ? 'Quitar de favoritos' : 'Agregar a favoritos';
    var icono = btn.querySelector('.material-symbols-outlined');
    if (icono) icono.textContent = fav ? 'favorite' : 'favorite_border';
  });
}

function _eqToggleFavorito(id) {
  var favs = _eqFavoritos();
  var idx = favs.indexOf(id);
  var fav = idx === -1;
  if (fav) favs.push(id); else favs.splice(idx, 1);
  _eqSetFavoritos(favs);
  _eqActualizarBotonesFavorito(id, fav);
  // Bug real corregido (ver MANIFEST.md -- "persona desaparece y reaparece
  // arriba al agregar a favoritos"): `_eqRenderFavoritos()` (re-render
  // completo del `innerHTML` de #eq-favoritos-lista) quedó reemplazada acá
  // por `_eqAnimarCambioFavorito()`, que solo toca el DOM de ESA fila
  // puntual con un fade -- el resto de la lista de Favoritos ni se toca.
  _eqAnimarCambioFavorito(id, fav);
  // Fade in/out breve sobre CADA instancia visible del ícono de esta persona
  // (`[data-eq-fav]`, `_eqFilaHtml()`/`_eqNavHtml()`) -- puede haber más de
  // una a la vez (favoritos + su grupo, o nav de detalle + fila de lista).
  // Reflow forzado (`offsetWidth`) antes de agregar la clase para que la
  // animación reinicie si la persona togglea de nuevo antes de que termine
  // la anterior (0.3s), en vez de quedarse sin efecto la segunda vez.
  document.querySelectorAll('[data-eq-fav="' + id + '"]').forEach(function(el) {
    el.classList.remove('eq-fav-pulse');
    void el.offsetWidth;
    el.classList.add('eq-fav-pulse');
    setTimeout(function() { el.classList.remove('eq-fav-pulse'); }, 300);
  });
}

// Mueve/agrega/saca SOLO la fila de `id` en #eq-favoritos-lista, con fade
// (ver _eqToggleFavorito() arriba) -- nunca reconstruye el resto de la
// lista. Al agregar: crea la fila con opacity:0 e insertada al inicio,
// reflow forzado (mismo truco que el pulse de arriba) para que el navegador
// registre el estado inicial antes de subir a opacity:1, si no la
// transición no se ve. Al sacar: fade-out de 0.25s y recién ahí `.remove()`
// -- el timeout coincide con la `transition` de css/equipo.css
// (`.eq-fila-fade`).
//
// Rediseño (Favoritos ahora es un acordeón `.eq-grupo` no colapsable,
// oculto por completo cuando no hay favoritos -- ver MANIFEST.md/
// CHANGELOG.md): ya no hay ningún empty state dentro de la lista
// (`.eq-favoritos-vacio` se sacó de acá -- sigue viva en este archivo para
// "sin rol asignado"/"mes no disponible", ver css/equipo.css). En su
// lugar, la SECCIÓN entera (`#eq-favoritos-wrap`) se muestra/oculta con
// slide (max-height) + fade de opacidad al agregar el primer favorito o
// sacar el último, vía `_eqMostrarSeccionFavoritos()`/
// `_eqOcultarSeccionFavoritos()` de abajo -- pedido explícito ("debe
// deslizarse suavemente hacia abajo... no debe aparecer abruptamente"):
// antes solo animaba `opacity`, con `display:block` dando el alto final de
// golpe en el mismo frame -- se veía como un salto, no un slide. Mismo
// mecanismo de `max-height` que el resto de acordeones/paneles de esta
// sección (`_eqToggleGrupo()`/`_eqAbrirPanel()`/`_eqCerrarPanel()`, más
// abajo): abrir mide el `scrollHeight` real y anima hacia ahí; cerrar
// "aterriza" primero en ese alto real (nunca se puede animar DESDE `none`)
// y recién al frame siguiente baja a `0px`. Sin animación de altura para
// agregar/sacar un favorito que no sea el primero/último -- eso sigue
// cambiando el alto de la lista sin transición propia, igual que
// Quindes/Mirlxs/Inactivos.
function _eqMostrarSeccionFavoritos() {
  var wrap = document.getElementById('eq-favoritos-wrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  // Bug real corregido (ver MANIFEST.md -- "favorito agregado desde el
  // perfil de detalle no aparece en Favoritos al volver a la home"):
  // togglear un favorito desde `#s-equipo-perfil` deja `#s-equipo` (y con
  // él, `#eq-favoritos-wrap`) en `display:none` -- `.pantalla` no activa,
  // ver `ir()`/js/ui.js -- así que `wrap.scrollHeight` mide `0` (mismo
  // problema ya documentado para los acordeones en la cabecera de este
  // archivo: "medir con la pantalla todavía display:none da 0"). Ese `0px`
  // quedaba fijado en `wrap.style.maxHeight` para siempre: sin transición
  // real (0px→0px no dispara `transitionend`), el listener que libera el
  // techo a `'none'` (más abajo) nunca corría, y la sección quedaba con
  // `display:block` pero `max-height:0px` -- invisible pese a tener
  // contenido, incluso después de volver a la lista. `offsetParent === null`
  // detecta ese caso (cualquier ancestro, incluida esta pantalla, en
  // `display:none`) -- sin nada realmente visible que animar, se fija el
  // estado final directo, sin medir ni animar.
  if (wrap.offsetParent === null) {
    wrap.style.maxHeight = 'none';
    wrap.style.opacity = '1';
    wrap.style.overflow = 'visible';
    return;
  }
  wrap.style.maxHeight = '0px';
  void wrap.offsetWidth;
  wrap.style.maxHeight = wrap.scrollHeight + 'px';
  wrap.style.opacity = '1';
  // Libera el techo fijo una vez terminada la animación (mismo bug real ya
  // corregido para `.eq-grupo-body`, ver ese comentario más abajo -- "lista
  // de Mirlxs truncada"): sin esto, agregar un 2do/3er favorito después de
  // este primero quedaría recortado contra el alto medido en ESTE momento.
  wrap.addEventListener('transitionend', function liberarAlturaAlTerminar(ev) {
    if (ev.propertyName !== 'max-height') return;
    wrap.removeEventListener('transitionend', liberarAlturaAlTerminar);
    wrap.style.maxHeight = 'none';
    // `overflow:visible` (ver MANIFEST.md -- "sticky headers apilados"):
    // el `overflow:hidden` de `.eq-favoritos-wrap` (CSS) es necesario
    // mientras este `max-height` anima (clipea el crecimiento) pero, una
    // vez asentado en `'none'`, seguiría siendo el ANCESTRO SCROLLEABLE más
    // cercano del header sticky de adentro (`#eq-favoritos-header`) para el
    // navegador -- cualquier `overflow` != `visible` cuenta como tal, aunque
    // el wrap en sí nunca tenga scroll propio -- así que el header quedaría
    // "stuck" relativo a ESTE wrap en vez del scroll real de la página. Con
    // `overflow:visible` acá (recién cuando ya no hace falta clipear nada,
    // el alto es `'none'` = el contenido real) el header vuelve a stickear
    // contra el scroll de la página, igual que los otros 4.
    wrap.style.overflow = 'visible';
  });
}

function _eqOcultarSeccionFavoritos() {
  var wrap = document.getElementById('eq-favoritos-wrap');
  if (!wrap) return;
  // Mismo fix que _eqMostrarSeccionFavoritos() de arriba -- sección
  // invisible ahora mismo (perfil de detalle abierto encima), nada que
  // animar de verdad.
  if (wrap.offsetParent === null) {
    wrap.style.maxHeight = '0px';
    wrap.style.opacity = '0';
    wrap.style.display = 'none';
    wrap.style.overflow = 'hidden';
    return;
  }
  wrap.style.maxHeight = wrap.scrollHeight + 'px'; // aterriza en el alto real (pudo estar en 'none') antes de animar a 0
  wrap.style.overflow = 'hidden'; // restablecido antes de animar a 0 -- ver `_eqMostrarSeccionFavoritos()`, se relaja a 'visible' solo mientras está asentada abierta
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      wrap.style.maxHeight = '0px';
      wrap.style.opacity = '0';
    });
  });
  wrap.addEventListener('transitionend', function ocultarAlTerminar(ev) {
    if (ev.propertyName !== 'opacity') return;
    wrap.removeEventListener('transitionend', ocultarAlTerminar);
    wrap.style.display = 'none';
  });
}

function _eqAnimarCambioFavorito(id, fav) {
  var wrap = document.getElementById('eq-favoritos-wrap');
  var cont = document.getElementById('eq-favoritos-lista');
  if (!wrap || !cont) return;
  var pillEl = document.getElementById('eq-favoritos-pill');
  var persona = _eqPersonaPorId(id);
  if (!persona || _eqEsUsuarioActual(persona)) return;
  if (fav) {
    if (_eqBusqueda && !_eqPasaBusqueda(persona)) return; // no visible bajo el filtro actual -- nada que animar
    // Bug real corregido (ver MANIFEST.md -- "el fade existe pero la
    // persona no se mueve hacia arriba"): la versión anterior solo creaba
    // la fila nueva de Favoritos y la hacía aparecer con fade-in, sin
    // ningún fade-out previo en la posición de origen (donde de verdad
    // tocó el corazón -- su fila dentro de Quindes/Mirlxs) -- se veía como
    // "aparece arriba", nunca como "se mueve hacia arriba". Fix: si hay una
    // instancia visible de esta persona FUERA de Favoritos (`origen`), esa
    // fila puntual hace fade-out (250ms) primero: recién ahí se inserta la
    // fila nueva en Favoritos con su propio fade-in, y `origen` recupera su
    // opacidad. `origen` nunca se borra del DOM de su grupo -- a
    // diferencia de una lista única, esta app mantiene Favoritos como una
    // sección aparte, no exclusiva (la persona sigue perteneciendo a su
    // grupo de rol aunque también sea favorita, ver `_eqRenderGrupo()`) --
    // borrarla de ahí la sacaría de su grupo hasta el próximo re-render,
    // una regresión real. El efecto visual (fade-out en su fila actual,
    // fade-in arriba de Favoritos) es el mismo "viaje" pedido, sin ese
    // costo.
    var origen = null;
    document.querySelectorAll('[data-eq-fav="' + id + '"]').forEach(function(btn) {
      if (origen) return;
      var f = btn.closest('.eq-miembro-fila');
      if (f && !cont.contains(f)) origen = f;
    });
    var insertarEnFavoritos = function() {
      var eraVacio = !cont.children.length;
      var tmp = document.createElement('div');
      tmp.innerHTML = _eqFilaHtml(persona);
      var filaNueva = tmp.firstChild;
      filaNueva.classList.add('eq-fila-fade');
      filaNueva.style.opacity = '0';
      cont.insertBefore(filaNueva, cont.firstChild);
      if (pillEl) pillEl.textContent = cont.children.length;
      _eqHidratarAvatares();
      void filaNueva.offsetWidth;
      filaNueva.style.opacity = '1';
      if (eraVacio) _eqMostrarSeccionFavoritos();
    };
    if (origen) {
      origen.classList.add('eq-fila-fade');
      void origen.offsetWidth;
      origen.style.opacity = '0';
      setTimeout(function() {
        insertarEnFavoritos();
        origen.style.opacity = '1'; // restaurada -- sigue viva en su grupo, ver comentario de arriba
      }, 250);
    } else {
      insertarEnFavoritos();
    }
  } else {
    var btnExistente = cont.querySelector('[data-eq-fav="' + id + '"]');
    var filaExistente = btnExistente ? btnExistente.closest('.eq-miembro-fila') : null;
    if (!filaExistente) return;
    filaExistente.classList.add('eq-fila-fade');
    void filaExistente.offsetWidth;
    filaExistente.style.opacity = '0';
    setTimeout(function() {
      filaExistente.remove();
      if (pillEl) pillEl.textContent = cont.children.length;
      if (!cont.children.length) _eqOcultarSeccionFavoritos();
    }, 250);
  }
}

/* ── Punto de entrada (ver 'entrar' de APP_BOTTOM_NAV_ITEMS en js/ui.js) ── */
// Bug real corregido (ver MANIFEST.md -- "acordeones siguen colapsados al
// abrir"): el orden ERA `_eqInit()` primero, `volver('s-equipo')` después.
// `_eqInit()` -> `_eqAsegurarCargado(cb)` llama a `cb()` DE INMEDIATO
// (síncrono, sin red) si el roster ya se cargó antes en la sesión -- caso
// real y común, no un edge case: `_datosRenderStats()` (js/perfil.js,
// stats de "Mi perfil" en Ajustes) dispara el mismo `_eqAsegurarCargado()`,
// así que cualquiera que visite Ajustes ANTES que Equipo llega acá con
// `_eqCargado` ya en `true`. En ese camino síncrono, `_eqRenderGrupo()`
// (llamado dentro de ese mismo `cb()`) mide `body.scrollHeight` de los
// acordeones ANTES de que `volver('s-equipo')` le sume `.activa` a
// `#s-equipo` -- y `.pantalla` (css/global.css) es `display:none` hasta esa
// clase, así que CUALQUIER medición de `scrollHeight` dentro de una
// `.pantalla` no-activa da `0` (elementos sin caja de layout, no es un bug
// de esta función puntual -- mismo problema ya documentado para los
// sliders de RSVP de Eventos, ver "Cambios recientes" en MANIFEST.md:
// "medir con la pantalla todavía display:none da 0"). Resultado real:
// `max-height:0px` aplicado con la clase `.abierto` puesta -- exactamente
// "acordeón colapsado pese al fix anterior". Fix: `volver('s-equipo')`
// PRIMERO -- para cuando `_eqInit()` corra (y con ella cualquier `cb()`
// síncrono), `#s-equipo` ya es `display:block` y `scrollHeight` mide la
// altura real. Sin impacto visual por invertir el orden: `_eqInit()` solo
// escribe `innerHTML`/estilos, nunca dispara un paint intermedio -- todo
// corre en el mismo tick síncrono antes de que el navegador pinte una sola
// vez, con o sin este reorden.
function irEquipo() {
  volver('s-equipo');
  // Bug real corregido -- "el tour no vuelve a intentar mostrarse al
  // renavegar a la sección" (pedido explícito): a diferencia de Eventos
  // (`_evActualizarTopBarModo()`, llamada SIN gate en cada `irEventos()`)
  // y Mi Perfil (`_ajTourIniciarSiCorresponde()`, llamada en cada
  // `irEditarDatos()` real), acá el chequeo vivía SOLO adentro de
  // `_eqInit()` -- una función que corre una única vez por sesión
  // (`_eqYaInicializado`, guard de arriba). Si la primera visita se
  // abandonaba antes de que el tour llegara a completarse/marcarse visto
  // (`eq_tour_visto`), volver a Equipo más tarde en la MISMA sesión nunca
  // volvía a intentarlo -- `_eqInit()` ya no corre de nuevo. El `else`
  // cubre exactamente esa entrada repetida (el roster ya está en el DOM
  // de la visita anterior, sin necesitar esperar ningún fetch) -- la
  // primera visita sigue disparándolo desde adentro de `_eqInit()`
  // (`_eqAsegurarCargado()`, más abajo), recién cuando el roster real ya
  // está pintado.
  if (!_eqYaInicializado) _eqInit();
  else _eqTourIniciarSiCorresponde();
}

function _eqInit() {
  _eqYaInicializado = true;
  // No depende del roster real -- arranca ya, aunque el fetch de abajo
  // todavía no resolvió (mismo criterio que antes tenía la inicialización
  // de sugerencias rotativas, que ocupaba este lugar).
  _eqRenderFiltroRolPills();
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
      if (estadoEl) estadoEl.innerHTML = '<p class="eq-error">No se pudo cargar el equipo. Intenta de nuevo.</p>';
      return;
    }
    if (estadoEl) estadoEl.innerHTML = '';
    _eqRenderFavoritos();
    _eqRenderGrupo('Quindes');
    _eqRenderGrupo('Mirlxs');
    _eqRenderInactivos();
    _eqRenderLesionadxs();
    _eqRenderMisEstadisticas();
    _eqTourIniciarSiCorresponde();
  });
}

// ═══ Tour guiado de Equipo (pedido explícito, "idéntico al tour de
// Eventos -- mismos estilos, misma lógica, mismo componente") -- reusa el
// motor genérico de `_evTourIniciarConPasos()`/js/eventos.js (mismo
// tooltip/overlay/halo que ya usan los 3 tours de Eventos, `#ev-tour-*`
// pese al prefijo -- son hijos directos de `<body>`, compartidos por
// cualquier tour de la app, no exclusivos de esa sección) con clave de
// localStorage y selectores propios de esta sección. `_evTourMostrarPaso()`
// ya saltea solo cualquier paso cuyo selector no resuelva a un elemento
// VISIBLE (ver ese archivo) -- sin guardas propias acá, mismo criterio que
// los tours de Eventos. 650ms (mismo margen que el tour de bienvenida de
// Eventos) -- deja asentar el layout real del roster recién renderizado
// antes de medir geometría para posicionar el primer halo/tooltip. */
var _EQ_TOUR_PASOS = [
  { selector: '#eq-misstats-toggle-btn', titulo: 'Tus estadísticas', texto: 'Consulta tus estadísticas personales.' },
  { selector: '#eq-busqueda-toggle-btn', titulo: 'Busca y filtra', texto: 'Busca y filtra por puntos según períodos y filtra según rol en el equipo.' },
  { selector: '.eq-grupo-header', titulo: 'Colapsa secciones', texto: 'Colapsa las secciones que te interesan de las personas que te interesan.' },
  { selector: '.eq-fav-btn', titulo: 'Favoritos', texto: 'Agrega miembros del equipo a favoritos para tenerlos siempre visibles.' },
  { selector: '.eq-miembro-fila', titulo: 'Detalle de cada persona', texto: 'Toca donde se encuentra alguien del equipo para consultar información adicional.' }
];
function _eqTourIniciarSiCorresponde() {
  if (typeof _evTourActivo !== 'undefined' && _evTourActivo) return;
  if (localStorage.getItem('eq_tour_visto') === '1') return;
  var tooltip = document.getElementById('ev-tour-tooltip');
  if (!tooltip) return;
  setTimeout(function() {
    _evTourIniciarConPasos(_EQ_TOUR_PASOS, 'eq_tour_visto', 'FINALIZAR TOUR');
  }, 650);
}

/* ── Hidratación de avatares (mismo patrón que _evHidratarAvatares(),
   js/eventos.js): puebla cualquier `.eq-avatar[data-nombre]` visible con
   foto o inicial vía el helper compartido. */
// Paleta de fondo/letra para avatares sin foto (Bug real corregido, ver
// MANIFEST.md -- antes SIEMPRE el mismo fondo neutro, `var(--surface-2)`,
// para cualquier persona, css/global.css). Pares bg/fg ya existentes en
// css/colors.css (con su propia variante oscura -- nada hardcodeado acá),
// mismo patrón visual que ya usa `.eq-mini-tier-pill`/etc: fondo tenue +
// letra en el color sólido correspondiente.
var _EQ_AVATAR_PALETTE = [
  { bg: 'var(--brand-light)', fg: 'var(--brand)' },
  { bg: 'var(--purple-bg)', fg: 'var(--purple)' },
  { bg: 'var(--info-bg)', fg: 'var(--info)' },
  { bg: 'var(--success-bg)', fg: 'var(--success)' },
  { bg: 'var(--amber-light)', fg: 'var(--amber)' }
];
// `charCodeAt(0) % paleta.length` (pedido explícito) sobre la PRIMERA letra
// real (mismo criterio que `_avatarSetFotoOInicial()`, js/ui.js, para
// decidir qué letra mostrar) -- consistente entre renders, nunca al azar,
// porque depende solo del nombre.
function _eqColorAvatarDe(nombre) {
  var letra = String(nombre || '?').trim().charAt(0).toUpperCase() || '?';
  return _EQ_AVATAR_PALETTE[letra.charCodeAt(0) % _EQ_AVATAR_PALETTE.length];
}
// Re-auditado (ver MANIFEST.md -- "avatar con signo de pregunta en lugar de
// inicial"). TODOS los puntos reales donde se renderiza un avatar de
// persona en esta sección (grep de `_eqAvatarHtml(` en este archivo, la
// única función que arma el `<div class="avatar-pill eq-avatar">`):
// `_eqFilaHtml()` (fila de lista -- reusada tal cual por Favoritos, los
// grupos Quindes/Mirlxs Y los acordeones de búsqueda por rol, `_eqRenderPorRol()`
// -- NO hay una función de fila separada por sección) y
// `_eqPerfilContenidoHtml()` (avatar grande del detalle). Las 5 pantallas
// (lista general, favoritos, grupos, búsqueda por rol, detalle) pasan por
// ESTA MISMA función de hidratación (`_eqHidratarAvatares()`, llamada al
// final de cada uno de esos renders) -- no hay una 2da implementación de
// avatar en ningún lado de esta sección. `_avatarSetFotoOInicial()`
// (js/ui.js) ya evalúa `foto` ANTES de crear cualquier `<img>` (`if
// (!foto) { ...letra...; return; }`, primeras líneas de esa función) -- el
// fallback de letra NUNCA depende de un evento `onerror` de imagen rota
// para el caso "sin foto" (ese `onerror` de más abajo es un caso aparte:
// SÍ hay `foto`, pero la URL no carga). Código verificado correcto; si el
// "?" seguía visible en producción, incluye la misma sospecha que el resto
// de este batch: `equipo.js` servido desde una copia vieja cacheada por
// Fastly (no estaba en `CACHEBUST_FILES` hasta este commit).
function _eqHidratarAvatares() {
  document.querySelectorAll('.eq-avatar[data-nombre]').forEach(function(el) {
    var foto = el.getAttribute('data-foto') || '';
    var nombre = el.getAttribute('data-nombre');
    _avatarSetFotoOInicial(el, foto, nombre);
    // Solo en Equipo (`.eq-avatar`) -- `.avatar-pill` es compartido por el
    // resto de la app (Tareas, Eventos, Ajustes...) y tocarle el color ahí
    // también queda fuera de alcance de este pedido.
    if (!foto) {
      var c = _eqColorAvatarDe(nombre);
      el.style.background = c.bg;
      var letraEl = el.querySelector('.avatar-pill-letter');
      if (letraEl) letraEl.style.color = c.fg;
    } else {
      el.style.background = '';
    }
  });
}

// `p.nombreDerby || p.username` (Batch 10, ver MANIFEST.md -- "avatar '?'
// para usuarios sin nombre derby"): `nombreDerby` puede llegar `''`
// (getEquipo(), `nombre_derby ?? ''`) -- sin este fallback, `data-nombre`
// quedaba vacío y `_avatarSetFotoOInicial()` (js/ui.js) caía a su propio
// fallback final, el "?" literal. `username` (siempre presente, es la
// natural key real de `equipo`, ver `_eqCambiarTier()`/más abajo en este
// archivo) da una inicial real en vez del signo de pregunta para esos
// casos.
function _eqAvatarHtml(p, claseExtra) {
  return '<div class="avatar-pill ' + claseExtra + ' eq-avatar" data-nombre="' + _eqEsc(p.nombreDerby || p.username) + '" data-foto="' + _eqEsc(p.fotoPerfil || '') + '"></div>';
}

// Badge de tendencia de termómetro (re-ubicado, ver MANIFEST.md -- vivía
// como círculo suelto en la fila de stats, `_eqStatsInlineHtml()` más abajo
// -- pedido explícito de moverlo a la esquina inferior derecha de la foto de
// perfil, tipo badge de estado). `p.tendencia` ('sube'/'baja'/`null`,
// getEquipo()/supabase/functions/api/index.ts) sin nada que recalcular acá.
// Ícono Material `keyboard_arrow_up` (pedido explícito -- ya NO
// `keyboard_double_arrow_*`, cambio de ícono sin cambiar el resto de la
// lógica/estilo). Vacío si `tendencia` es `null` -- ver `_eqAvatarConTendenciaHtml()`
// justo abajo, que decide si hace falta el wrapper `position:relative`.
// **Chevron de descenso eliminado de toda la UI** (pedido explícito, ver
// MANIFEST.md -- "quitar los chevrones de descenso en todos los lugares
// donde aparecen en Equipo"): `tendencia === 'baja'` ahora se trata igual
// que `null` -- vacío, sin badge -- en los 3 consumidores de esta función
// (cards de la lista/favoritos y "Mis estadísticas" vía
// `_eqAvatarConTendenciaHtml()`, perfil de detalle vía llamada directa en
// `_eqPerfilContenidoHtml()`), sin tocar el cálculo de `tendencia` en sí
// (`getEquipo()`/supabase/functions/api/index.ts sigue devolviendo
// `'baja'` tal cual -- solo se dejó de RENDERIZAR acá, pedido explícito de
// solo tocar la UI). `.eq-tendencia-badge-baja` (css/equipo.css) queda sin
// ningún consumidor -- ver ese archivo si hace falta limpiarla.
// `claseTamano` opcional (pedido explícito, re-ajuste de tamaño): sin
// pasarla, el badge queda en el tamaño base 18px (usado hoy solo en "Mis
// estadísticas", sin pedido de agrandarlo ahí) -- `'eq-tendencia-badge--card'`
// (22px, filas de lista) o `'eq-tendencia-badge--detalle'` (28px, perfil de
// detalle, foto mucho más grande) la agrandan, ver css/equipo.css.
function _eqTendenciaBadgeHtml(p, claseTamano) {
  if (p.tendencia !== 'sube') return '';
  return '<span class="eq-tendencia-badge eq-tendencia-badge-sube' + (claseTamano ? ' ' + claseTamano : '') + '">' +
    '<span class="material-symbols-outlined">keyboard_arrow_up</span></span>';
}

// Avatar + badge de tendencia superpuesto (esquina inferior derecha, ver
// `.eq-avatar-badge-wrap`/css/equipo.css) -- usado en las 2 fotos SIN
// wrapper `position:relative` propio ya existente (fila de lista/favoritos
// y "Mis estadísticas"; el perfil de detalle sí tiene el suyo,
// `.eq-avatar-wrap`, `_eqPerfilContenidoHtml()` más abajo, así que ese caso
// no pasa por acá -- pone `_eqTendenciaBadgeHtml()` directo adentro de ese
// wrapper existente en vez de anidar uno nuevo). `claseTamano` se pasa tal
// cual a `_eqTendenciaBadgeHtml()`.
function _eqAvatarConTendenciaHtml(p, claseExtra, claseTamano) {
  return '<span class="eq-avatar-badge-wrap">' + _eqAvatarHtml(p, claseExtra) + _eqTendenciaBadgeHtml(p, claseTamano) + '</span>';
}

// Fila de stats inline (Batch 4) -- `pointer-events:none` propio de cada
// pieza (clases de abajo, css/equipo.css) para que el click siempre
// propague a `.eq-miembro-fila` (abre el detalle), pedido explícito -- en
// los hechos ya pasaría igual por burbujeo normal (son `<span>` sin
// comportamiento propio), pero se deja explícito tal como se pidió.
// Reducida a un solo dato (pedido explícito, re-ajuste, ver MANIFEST.md --
// "en cada card de la lista, mostrar únicamente el total de puntos"): horas
// patinadas/% asistencia/puntos por tareas/puntos por asistencia se sacaron
// de la card de lista -- siguen disponibles completos en el perfil de
// detalle (`_eqPerfilContenidoHtml()`, más abajo), un toque más lejos.
// `puntosTotal` (getEquipo(), ya respeta el período elegido en el panel de
// filtros -- mismo campo que usa el perfil de detalle) es el único dato que
// queda en esta fila.
function _eqStatsInlineHtml(p) {
  if (p.puntosTotal === undefined || p.puntosTotal === null) return '';
  return '<span class="eq-mini-stat"><span class="material-symbols-rounded">military_tech</span>' + p.puntosTotal + ' pts</span>';
}

function _eqFilaHtml(p) {
  var fav = _eqEsFavorito(p.id);
  var statsHtml = _eqStatsInlineHtml(p);
  // Bug real corregido (ver MANIFEST.md -- "no mostrar '#' si el usuario no
  // tiene número de derby"): `numeroDerby` puede llegar `null`/`undefined`/
  // `''` (getEquipo(), `numero_derby ?? ''`) -- antes se concatenaba
  // igual, mostrando un "#" pelado sin número al lado del nombre.
  var numeroHtml = (p.numeroDerby !== null && p.numeroDerby !== undefined && p.numeroDerby !== '')
    ? ' <span class="eq-miembro-numero">#' + p.numeroDerby + '</span>' : '';
  return '<div class="eq-miembro-fila" onclick="_eqAbrirPerfil(\'' + p.id + '\')">' +
      _eqAvatarConTendenciaHtml(p, 'avatar-pill--sm', 'eq-tendencia-badge--card') +
      '<div class="eq-miembro-info">' +
        '<div class="eq-miembro-nombre">' + _eqEsc(p.nombreDerby) + numeroHtml + '</div>' +
        '<div class="eq-miembro-username">@' + _eqEsc(p.username) + '</div>' +
        (statsHtml ? '<div class="eq-miembro-stats">' + statsHtml + '</div>' : '') +
      '</div>' +
      '<button type="button" class="eq-fav-btn' + (fav ? ' activo' : '') + '" data-eq-fav="' + p.id + '" onclick="event.stopPropagation();_eqToggleFavorito(\'' + p.id + '\')" title="' + (fav ? 'Quitar de favoritos' : 'Agregar a favoritos') + '">' +
        '<span class="material-symbols-outlined">' + (fav ? 'favorite' : 'favorite_border') + '</span>' +
      '</button>' +
    '</div>';
}

// Meses reales para detectar una búsqueda "por mes de cumpleaños" (Batch 4)
// -- simple `indexOf` del nombre del mes contra el query ya en minúsculas,
// sin parsear frases -- "abril", "cumple en abril", "cumpleaños en abril"
// coinciden todos igual, el nombre del mes está en las 3.
var _EQ_MESES_BUSQUEDA = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function _eqDetectarMes(q) {
  for (var i = 0; i < _EQ_MESES_BUSQUEDA.length; i++) {
    if (q.indexOf(_EQ_MESES_BUSQUEDA[i]) !== -1) return i;
  }
  return null;
}
// "rol"/"roles" como palabra completa (`\b`, evita falsos positivos tipo
// una palabra que solo CONTENGA "rol") o coincidencia EXACTA con un nombre
// de rol real -- exacta, no `indexOf`, porque roles como "SO"/"NSO" son
// substrings casi seguros de un montón de nombres/usernames reales; con
// `indexOf` cualquier búsqueda normal hubiera disparado el modo rol por
// error.
function _eqEsQueryDeRol(q) {
  if (/\brol(es)?\b/.test(q)) return true;
  return _EQ_ROLES.some(function(r) { return r.toLowerCase() === q; });
}

/* ── Búsqueda (Batch 4 -- 4 modos según el query, mutuamente excluyentes):
   1) "@" en el query -- filtra por email (p.email), dentro de la vista
      normal (Favoritos + Quindes/Mirlxs), mismo mecanismo que nombre/username.
   2) Nombre de un rol real, o la palabra "rol"/"roles" -- vista alternativa
      de acordeones agrupados por rol (#eq-roles-wrap/_eqRenderPorRol()),
      reemplaza Favoritos+grupos mientras está activa.
   3) Nombre de un mes -- `getEquipo()` no expone fecha de nacimiento (dato
      gateado por privacidad, ver Cambio 55/MANIFEST.md) -- sin ese campo no
      hay con qué filtrar de verdad; se muestra #eq-mes-vacio en vez de
      inventar un resultado.
   4) Default -- nombre derby + username, comportamiento de siempre. ── */
function _eqBuscar(valor) {
  _eqBusqueda = (valor || '').trim().toLowerCase();
  var favWrap = document.getElementById('eq-favoritos-wrap');
  var grupoQuindes = document.getElementById('eq-grupo-quindes');
  var grupoMirlxs = document.getElementById('eq-grupo-mirlxs');
  var grupoInactivos = document.getElementById('eq-grupo-inactivos');
  var grupoLesionadxs = document.getElementById('eq-grupo-lesionadxs');
  var rolesWrap = document.getElementById('eq-roles-wrap');
  var mesVacio = document.getElementById('eq-mes-vacio');
  var esRol = !!_eqBusqueda && _eqEsQueryDeRol(_eqBusqueda);
  var mesIdx = (_eqBusqueda && !esRol) ? _eqDetectarMes(_eqBusqueda) : null;
  if (esRol) {
    if (favWrap) favWrap.style.display = 'none';
    if (grupoQuindes) grupoQuindes.style.display = 'none';
    if (grupoMirlxs) grupoMirlxs.style.display = 'none';
    if (grupoInactivos) grupoInactivos.style.display = 'none';
    if (grupoLesionadxs) grupoLesionadxs.style.display = 'none';
    if (mesVacio) mesVacio.style.display = 'none';
    if (rolesWrap) rolesWrap.style.display = '';
    _eqRenderPorRol();
    // La vista "por rol" tiene su propio empty-state (`_eqRenderPorRol()`,
    // más arriba) -- `_eqActualizarListaVacia()` se llama igual acá para
    // que `#eq-lista-vacia` (de la vista normal) se OCULTE si había
    // quedado visible de un ciclo anterior, en vez de mostrarse encima.
    _eqActualizarListaVacia();
    return;
  }
  if (mesIdx !== null) {
    if (favWrap) favWrap.style.display = 'none';
    if (grupoQuindes) grupoQuindes.style.display = 'none';
    if (grupoMirlxs) grupoMirlxs.style.display = 'none';
    if (grupoInactivos) grupoInactivos.style.display = 'none';
    if (grupoLesionadxs) grupoLesionadxs.style.display = 'none';
    if (rolesWrap) rolesWrap.style.display = 'none';
    if (mesVacio) mesVacio.style.display = '';
    _eqActualizarListaVacia();
    return;
  }
  // Modo normal (nombre/username/email) -- restaura los contenedores reales
  // por si el query anterior había activado el modo rol/mes. `grupoLesionadxs`
  // NO se fuerza a `''` acá a propósito (a diferencia de Quindes/Mirlxs/
  // Inactivos) -- su visibilidad depende de si hay alguien lesionadx, no
  // del modo de búsqueda; `_eqRenderLesionadxs()` de abajo decide sola.
  if (rolesWrap) rolesWrap.style.display = 'none';
  if (mesVacio) mesVacio.style.display = 'none';
  if (grupoQuindes) grupoQuindes.style.display = '';
  if (grupoMirlxs) grupoMirlxs.style.display = '';
  if (grupoInactivos) grupoInactivos.style.display = '';
  _eqRenderFavoritos();
  _eqRenderGrupo('Quindes');
  _eqRenderGrupo('Mirlxs');
  _eqRenderInactivos();
  _eqRenderLesionadxs();
}
// Orden de la lista dentro de cada acordeón (bug real corregido, ver
// MANIFEST.md/CHANGELOG.md -- "ordenar por puntos totales, no
// alfabético"): `_eqPersonas` llega de `getEquipo()` ordenada por
// `username` (`.order('username')`, supabase/functions/api/index.ts) --
// sin ningún `.sort()` propio de este lado, cada render heredaba ese
// orden alfabético tal cual. `puntosTotal` ya respeta el período activo
// (mes/rango/histórico, mismo campo que pintan las cards) -- reusado tal
// cual, sin recalcular nada acá. Empate -> alfabético por `nombreDerby`
// (`localeCompare('es')`, ordena acentos/ñ correctamente) como desempate,
// pedido explícito. Comparador compartido por los 4 renders que arman un
// acordeón real (Favoritos/Quindes-Mirlxs/Inactivos/Lesionadxs, más abajo
// en este archivo) -- NO se aplica a `_eqRenderPorRol()` (vista alternativa
// de búsqueda por rol, fuera del alcance de este pedido, que habla de "cada
// acordeón" refiriéndose a los reales de la lista, no a esa vista aparte).
function _eqCompararPorPuntos(a, b) {
  var pa = Number(a.puntosTotal) || 0, pb = Number(b.puntosTotal) || 0;
  if (pb !== pa) return pb - pa;
  return String(a.nombreDerby || '').localeCompare(String(b.nombreDerby || ''), 'es');
}
function _eqPasaBusqueda(p) {
  if (!_eqBusqueda) return true;
  // Por email (Batch 4) -- el único de los 4 modos que sigue usando la
  // vista normal (Favoritos/grupos), solo cambia el campo contra el que
  // compara.
  if (_eqBusqueda.indexOf('@') !== -1) return (p.email || '').toLowerCase().indexOf(_eqBusqueda) !== -1;
  return p.nombreDerby.toLowerCase().indexOf(_eqBusqueda) !== -1 ||
    p.username.toLowerCase().indexOf(_eqBusqueda) !== -1;
}
// Vista alternativa "por rol" (Batch 4) -- un acordeón por rol real (mismas
// clases `.eq-grupo*` que ya usan Quindes/Mirlxs, "reutilizá el patrón de
// acordeón que ya exista" del pedido) con al menos 1 persona -- roles sin
// nadie asignado no generan un acordeón vacío (mismo criterio que
// _eqRenderGrupo(), que oculta el grupo entero si `filtradas.length === 0`).
function _eqRenderPorRol() {
  var cont = document.getElementById('eq-roles-wrap');
  if (!cont) return;
  var html = '';
  _EQ_ROLES.forEach(function(rol) {
    var miembros = _eqPersonas.filter(function(p) {
      return !_eqEsUsuarioActual(p) && !_eqEsInactivo(p) && _eqRolesDe(p.username).indexOf(rol) !== -1;
    });
    if (!miembros.length) return;
    var key = rol.toLowerCase().replace(/\s+/g, '-');
    html += '<div class="eq-grupo">' +
        '<button type="button" class="eq-grupo-header abierto" id="eq-grupo-' + key + '-header" onclick="_eqToggleGrupo(\'' + rol.replace(/'/g, "\\'") + '\')">' +
          '<span class="eq-grupo-linea"></span>' +
          '<span class="eq-grupo-pill">' + miembros.length + '</span>' +
          '<span class="eq-grupo-nombre">' + _eqEsc(rol) + '</span>' +
          '<span class="material-symbols-outlined eq-grupo-chevron">expand_more</span>' +
          '<span class="eq-grupo-linea"></span>' +
        '</button>' +
        '<div class="eq-grupo-body abierto" id="eq-grupo-' + key + '-body">' +
          '<div class="eq-grupo-body-inner">' + miembros.map(_eqFilaHtml).join('') + '</div>' +
        '</div>' +
      '</div>';
  });
  cont.innerHTML = html || '<div class="eq-favoritos-vacio"><span class="material-symbols-outlined">group_off</span>Nadie tiene un rol asignado todavía.</div>';
  _eqHidratarAvatares();
  // Bug real corregido (ver MANIFEST.md -- "acordeones de roles no se ven
  // expandidos"): la clase `.abierto` de arriba ya NO trae ningún
  // `max-height` propio (esa regla se sacó de css/equipo.css, ver el
  // comentario ahí -- "lista de Mirlxs truncada") -- solo el `style.maxHeight`
  // inline que fija `_eqToggleGrupo()` la abre de verdad. Sin este paso, cada
  // acordeón nacía con la clase `.abierto` puesta pero `max-height:0` heredado
  // de `.eq-grupo-body`, colapsado pese al pedido explícito de "expandido por
  // defecto".
  // `'none'`, no `scrollHeight + 'px'` (2do bug real, Batch 9 -- ver
  // MANIFEST.md): medir `scrollHeight` acá daba `0` si `#s-equipo` todavía
  // era `display:none` en ese momento (una `.pantalla` no-activa no tiene
  // caja de layout, cualquier medición de sus descendientes da 0 en
  // cualquier navegador -- no dependía de esta función en particular). El
  // reorden de `irEquipo()` (Batch 9) ya evita ESE camino puntual, pero
  // `'none'` es la fix real y a prueba de futuro: sin depender de ninguna
  // medición ni de en qué momento/orden corra esta función, el acordeón
  // recién renderizado con `.abierto` puesto simplemente no tiene techo. Sin
  // animación en el primer render (no hace falta -- nace ya abierto) y sin
  // problema con la `transition` de `.eq-grupo-body` (css/equipo.css): un
  // salto de `max-height:0` a `none` no es interpolable, así que no anima,
  // pero tampoco tiene por qué acá.
  cont.querySelectorAll('.eq-grupo-body.abierto').forEach(function(body) {
    body.style.maxHeight = 'none';
  });
}

/* ── Paneles de nav: "Mis estadísticas" + búsqueda/filtros (rediseño, ver
   MANIFEST.md/CHANGELOG.md) -- 2 triggers en `#eq-search-header`
   (`#eq-misstats-toggle-btn`/`#eq-busqueda-toggle-btn`), un solo panel
   abierto a la vez (mismo criterio que `_evTogglePanel()`/`_EV_PANELES`,
   Eventos, js/eventos.js+css/eventos.css -- abrir uno cierra el otro,
   `_eqPanelAbierto` guarda cuál). Mecanismo de animación idéntico al que
   tenía `_eqToggleFiltros()` (reemplazada por esto): abrir fija
   `max-height` al `scrollHeight` real del panel; cerrar "aterriza" primero
   en ese alto real y recién en el frame siguiente (doble
   `requestAnimationFrame`) baja a `0px`, para que la transición tenga 2
   valores numéricos entre los que interpolar (ver "Acordeones animados
   con max-height" en MANIFEST.md). */
var _EQ_PANELES = {
  stats: { el: 'eq-misstats-panel', btn: 'eq-misstats-toggle-btn' },
  busqueda: { el: 'eq-busqueda-panel', btn: 'eq-busqueda-toggle-btn' }
};
var _eqPanelAbierto = null;
function _eqTogglePanel(tag) {
  // localStorage SOLO acá (toque manual del chevron/trigger) -- ni el
  // auto-open inicial (_eqRenderMisEstadisticas()) ni el auto-colapso por
  // scroll (_eqInicializarColapsoStatsPorScroll(), más abajo) pasan por
  // esta función, así que nunca pisan la preferencia guardada -- pedido
  // explícito: "si el usuario nunca la tocó [manualmente], siempre
  // expandido al abrir", un scroll no cuenta como haberla tocado.
  if (_eqPanelAbierto === tag) {
    _eqCerrarPanel(tag);
    if (tag === 'stats') { try { localStorage.setItem('pivot_stats_collapsed', 'true'); } catch (e) {} }
    return;
  }
  if (_eqPanelAbierto) _eqCerrarPanel(_eqPanelAbierto);
  _eqAbrirPanel(tag);
  if (tag === 'stats') { try { localStorage.setItem('pivot_stats_collapsed', 'false'); } catch (e) {} }
}
// Fade out/in de los sticky headers mientras cualquier panel de la nav
// está abierto (bug real corregido, ver MANIFEST.md/CHANGELOG.md --
// "acordeones se rompen cuando el panel está abierto"): `_eqActualizarStickyHeaders()`
// (top/left/width de los headers `--stuck`) solo se llama al abrir/cerrar
// vía `setTimeout(...,300)`, DESPUÉS de que termina la transición CSS de
// `max-height` del panel (0.28s) -- durante esos ~280ms el alto real de
// `#eq-sticky-header` cambia continuamente (por la propia transición) pero
// ningún header stuck se resincroniza en el medio, así que quedan mal
// posicionados/superpuestos justo mientras el panel se expande o se
// contrae. En vez de perseguir esa sincronización a mano frame a frame
// (requeriría un rAF loop calcado a la curva de easing del `max-height`,
// bastante más frágil), la solución pedida es más simple: ocultar del
// todo los headers stuck mientras CUALQUIER panel está abierto -- nada que
// se vea "roto" si no se está pintando. `.eq-panel-abierto` en `#s-equipo`
// (clase, no en cada header suelto) + `.eq-grupo-header--stuck` con
// `opacity`/`transition` propios (css/equipo.css) -- así CUALQUIER header
// que pase a stuck MIENTRAS el panel sigue abierto (ej. el usuario scrollea
// más abajo sin cerrar el panel) también nace oculto, sin depender de que
// esta función lo haya "agarrado" en el instante exacto de abrir/cerrar.
// Los headers en posición NATURAL (sin `--stuck`) no tienen ninguna regla
// de opacidad ligada a esta clase -- no se ven afectados (pedido explícito).
function _eqSincronizarClasePanelAbierto() {
  var s = document.getElementById('s-equipo');
  if (s) s.classList.toggle('eq-panel-abierto', !!_eqPanelAbierto);
}
// Perf real (pedido explícito, jank de Android Chrome al colapsar) -- fija
// `height` (medido, nunca `auto`/infinito) en el wrapper Y `transform:
// translateY` en sus hijos directos (`.eq-misstats-panel-inner`/
// `.eq-busqueda-panel-inner`), en vez de un solo `max-height`: el `height`
// sigue disparando layout igual (es la misma familia de propiedad que
// `max-height`, ninguna es GPU-only) pero el `transform` de los hijos SÍ
// corre por compositor -- el contenido se desliza en vez de solo
// aparecer/desaparecer recortado. `will-change` como clase temporal
// (`eq-panel-wrapper-anim`/`eq-panel-inner-anim`, css/equipo.css) -- se
// saca sola en `transitionend` (`{once:true}`, sin acumular listeners),
// nunca queda permanente (costo de memoria de GPU si will-change quedara
// siempre activo sin necesidad real).
// Patrón único de acordeón (pedido explícito #15, "unificar animación entre
// Equipo y Eventos" -- código idéntico a `_evAnimarPanel()`/js/eventos.js,
// mismos nombres salvo el prefijo eq/ev): recibe el punto de partida
// (`desdePx`, el valor YA visible -- `'0px'` para abrir, `scrollHeight+'px'`
// congelado para cerrar, nunca `'auto'`, que no se puede animar) Y el
// destino (`haciaPx`) -- fija `desdePx` ya en este tick (sin pisar nada
// visualmente, es el valor que el panel ya tenía) y recién en el próximo
// frame (`requestAnimationFrame`) fija `haciaPx`, para que el navegador
// registre el cambio como una transición real de un valor a otro, no un
// salto directo al destino en el mismo tick. `transform:translateY` en los
// hijos directos (`.eq-misstats-panel-inner`/`.eq-busqueda-panel-inner`) en
// vez de animar solo `height`: `height` sigue disparando layout igual (es
// la misma familia de propiedad que `max-height`, ninguna es GPU-only)
// pero el `transform` de los hijos SÍ corre por compositor -- el contenido
// se desliza en vez de solo aparecer/desaparecer recortado. `translateZ(0)`
// sumado acá (no solo en la regla CSS de reposo) -- un `style.transform`
// inline pisaría por completo cualquier `transform` de la clase, incluido
// el `translateZ(0)` permanente de `.eq-misstats-panel-inner`/
// `.eq-busqueda-panel-inner` -- sin esto la capa de compositing se perdía
// justo durante la animación real. `will-change` como clase temporal
// (`eq-panel-wrapper-anim`/`eq-panel-inner-anim`, css/equipo.css) -- se
// saca sola en `transitionend` (`{once:true}`, sin acumular listeners).
// `volverseAuto` (pedido explícito, "panel invisible al abrir" -- fix más
// robusto que el rAF anterior): al TERMINAR de abrir, pasa a `height:auto`
// real (clase `.eq-panel-auto`, css/equipo.css) en vez de quedarse
// congelado en el valor en px que se midió -- `auto` se recalcula SOLO
// cuando hace falta (ej. si el ancestro estaba `display:none` en el
// momento de la transición, o si el contenido cambia de tamaño después),
// nunca depende de una medición vieja. `panel.style.height = ''` limpia el
// inline ANTES de agregar la clase -- un inline pisa cualquier `height` de
// clase, `auto` incluido. Nunca se usa al CERRAR (`volverseAuto` false/
// omitido) -- 0 sigue siendo un valor real, no auto.
function _eqAnimarPanel(panel, desdePx, haciaPx, translateY, volverseAuto) {
  if (!panel) return;
  panel.classList.add('eq-panel-wrapper-anim');
  panel.style.height = desdePx;
  var hijos = panel.children;
  var i;
  for (i = 0; i < hijos.length; i++) {
    hijos[i].classList.add('eq-panel-inner-anim');
    hijos[i].style.transform = translateY + ' translateZ(0)';
  }
  requestAnimationFrame(function() {
    panel.style.height = haciaPx;
    panel.addEventListener('transitionend', function limpiar() {
      panel.classList.remove('eq-panel-wrapper-anim');
      for (var j = 0; j < hijos.length; j++) hijos[j].classList.remove('eq-panel-inner-anim');
      if (volverseAuto) { panel.style.height = ''; panel.classList.add('eq-panel-auto'); }
    }, { once: true });
  });
}
// `instantAuto` (pedido explícito, "estado inicial expandido" más robusto
// que el doble rAF anterior): en vez de medir `scrollHeight` (puede dar 0
// si `#s-equipo` sigue `display:none` en ese instante -- el bug real
// reportado) y animar hasta ese valor, salta DIRECTO a `height:auto` (clase
// `eq-panel-auto`) sin transición ni medición -- `auto` no depende de que
// el ancestro ya sea visible, se recalcula solo cuando el layout real
// corra. Uso: SOLO el auto-open inicial de "Mis estadísticas"
// (`_eqRenderMisEstadisticas()`, más abajo); el toggle manual del chevron
// sigue el camino animado de siempre (mide `scrollHeight`, transiciona,
// recién después pasa a `auto` -- ver `_eqAnimarPanel()`, arriba).
function _eqAbrirPanel(tag, instantAuto) {
  var cfg = _EQ_PANELES[tag];
  var panel = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (!panel || !btn) return;
  _eqPanelAbierto = tag;
  _eqSincronizarClasePanelAbierto();
  panel.classList.add('abierta');
  var hijos = panel.children;
  var i;
  if (instantAuto) {
    panel.style.transition = 'none';
    for (i = 0; i < hijos.length; i++) hijos[i].style.transition = 'none';
    panel.style.height = '';
    panel.classList.add('eq-panel-auto');
    for (i = 0; i < hijos.length; i++) hijos[i].style.transform = 'translateY(0) translateZ(0)';
    void panel.offsetHeight; // fuerza reflow síncrono antes de restaurar la transición
    panel.style.transition = '';
    for (i = 0; i < hijos.length; i++) hijos[i].style.transition = '';
  } else {
    _eqAnimarPanel(panel, '0px', panel.scrollHeight + 'px', 'translateY(0)', true);
  }
  btn.classList.add('activo');
  if (tag === 'busqueda') {
    setTimeout(function() { var inp = document.getElementById('eq-search-input'); if (inp) inp.focus(); }, 50);
  }
  // El alto de `#eq-sticky-header` cambia al abrirse un panel (ver
  // "Headers sticky apilados" -- css/equipo.css) -- los headers de sección
  // que ya estén stuck en ese momento necesitan correrse hacia abajo para no
  // quedar tapados. `setTimeout(300)` espera a que termine la transición de
  // `height` (0.35s, `.eq-header-panel`) para medir el alto FINAL, no el de
  // a mitad de camino -- `instantAuto` no tiene transición que esperar.
  setTimeout(_eqActualizarStickyHeaders, instantAuto ? 0 : 300);
}
// `instant` -- `transition:none` real (en el wrapper Y en los hijos,
// forzando reflow síncrono en el medio) en vez del camino animado de
// siempre. Ya NO lo usa nadie en este archivo (`_eqInicializarColapsoStatsPorScroll()`
// volvió al camino animado, ver ese comentario más abajo) -- el parámetro
// queda vivo, sin uso real por ahora, por si hace falta un cierre
// instantáneo de nuevo más adelante (mismo mecanismo que sigue usando
// `_evCerrarPanel(tag, instant)`/js/eventos.js para su panel de búsqueda).
function _eqCerrarPanel(tag, instant) {
  var cfg = _EQ_PANELES[tag];
  var panel = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (_eqPanelAbierto === tag) _eqPanelAbierto = null;
  // Bug real corregido (ver MANIFEST.md/CHANGELOG.md -- "glitch visual al
  // colapsar Mis estadísticas: el header sticky aparece desplazado"): a
  // diferencia de `_eqAbrirPanel()` (arriba -- ahí SÍ hay que sincronizar
  // la clase de una, para ocultar los headers ANTES de que la nav empiece
  // a crecer), acá NO se llama `_eqSincronizarClasePanelAbierto()` todavía
  // -- hacerlo de una sacaba `.eq-panel-abierto` de `#s-equipo` en el
  // mismo instante en que `_eqPanelAbierto` pasa a `null`, lo que
  // reaparecía (fade-in) los headers stuck DE INMEDIATO, mientras la
  // transición de `max-height` del panel (0.28s) recién estaba empezando
  // -- sus `top`/`left`/`width` seguían siendo los de la nav TODAVÍA
  // abierta (`_eqActualizarStickyHeaders()` no corre hasta el
  // `setTimeout(...,300)` de más abajo), así que quedaban visibles en la
  // posición vieja durante todo el colapso. Fix: la clase se queda tal
  // cual está (todavía `.eq-panel-abierto`, headers ocultos) durante toda
  // la transición -- recién se sincroniza en el mismo `setTimeout` de
  // abajo, DESPUÉS de recalcular las posiciones (`_eqActualizarStickyHeaders()`
  // primero, `_eqSincronizarClasePanelAbierto()` después) -- para cuando
  // los headers reaparecen (fade-in) ya están en su lugar correcto, sin
  // ningún frame intermedio con la posición vieja.
  if (panel) {
    // `eq-panel-auto` sacada ANTES de tocar `height` -- no se puede animar
    // (ni siquiera saltar instantáneo con un valor con sentido) DESDE
    // `auto`; `scrollHeight` sigue midiendo bien el alto real esté el panel
    // en `auto` o en un px explícito, así que el freeze de abajo funciona
    // igual en los 2 casos.
    panel.classList.remove('eq-panel-auto');
    var hijos = panel.children;
    var k;
    if (instant) {
      panel.style.transition = 'none';
      for (k = 0; k < hijos.length; k++) hijos[k].style.transition = 'none';
      panel.classList.remove('abierta');
      panel.style.height = '0px';
      for (k = 0; k < hijos.length; k++) hijos[k].style.transform = 'translateY(-100%) translateZ(0)';
      void panel.offsetHeight; // fuerza reflow síncrono antes de restaurar la transición
      panel.style.transition = '';
      for (k = 0; k < hijos.length; k++) hijos[k].style.transition = '';
    } else {
      // El freeze del punto de partida real (`scrollHeight`, nunca `auto`)
      // ahora es interno a `_eqAnimarPanel()` -- un solo rAF ahí adentro
      // alcanza (pedido explícito #15, "mismo patrón que Eventos"), sin el
      // doble rAF externo que este archivo usaba antes acá.
      panel.classList.remove('abierta');
      _eqAnimarPanel(panel, panel.scrollHeight + 'px', '0px', 'translateY(-100%)');
    }
  }
  if (btn) btn.classList.remove('activo');
  setTimeout(function() {
    _eqActualizarStickyHeaders();
    _eqSincronizarClasePanelAbierto();
  }, instant ? 0 : 300);
}

/* ── Colapso progresivo de "Mis estadísticas" al scrollear (ver MANIFEST.md
   -- "el panel debe cerrarse progresivamente/animado según el scroll, no de
   golpe") -- puerto 1:1 de `_evInicializarCierreCalendarioPorScroll()`/
   js/eventos.js (drag-to-dismiss EN VIVO sobre el contenedor que scrollea,
   mismo criterio que Google Calendar: mientras el dedo sigue abajo, el
   panel se achica proporcional al arrastre, como un acordeón que sigue el
   gesto real; recién al soltar se decide terminar de cerrar -- si se pasó
   el umbral -- o volver al alto original -- si no --, ambos animados).
   SOLO aplica a `stats` (re-ajuste, ver MANIFEST.md -- "el panel de
   búsqueda/filtros debe ocultarse rápido al scrollear, igual que en
   Eventos, no progresivo"): una ronda anterior aplicaba este mismo drag a
   los 2 paneles por igual (pedido explícito de ese momento), pero eso
   dejaba a `busqueda` con un comportamiento DISTINTO al de Eventos, donde
   el panel de búsqueda nunca sigue al dedo -- se cierra de una sola vez
   apenas arranca cualquier gesto afuera, ver `_eqCerrarBurbujaSiFueraDe()`
   más abajo, puerto de `_evCerrarBurbujaSiFueraDe()`/js/eventos.js. Ahora
   Equipo replica esa MISMA distinción: `stats` sigue con el drag en vivo de
   acá, `busqueda` usa el mecanismo instantáneo de abajo -- `_eqPanelAbierto`
   decide cuál está activo en cada momento, nunca los 2 a la vez. Escucha
   `#eq-lista-contenido` (roster completo, equivalente de `#ev-timeline`) --
   nunca el panel en sí, que sigue cerrándose instantáneo por acción directa
   (chevron/ícono). El dedo moviéndose hacia ARRIBA (`dy` negativo) es lo que
   hace que el contenido scrollee hacia ABAJO -- por eso el panel se achica
   cuando `dy` se hace más negativo, no al revés. Solo touch, mismo alcance
   que el resto de los gestos de esta sección. A propósito NO reusa
   `_eqCerrarPanel()` para terminar de cerrar -- esa función arranca fijando
   `max-height` al `scrollHeight` COMPLETO antes de animar a 0 (pensada para
   cerrar desde abierto-de-siempre, sin arrastre de por medio) -- llamarla
   acá saltaría primero de vuelta al alto completo y recién ahí cerraría, un
   "rebote" que el usuario no pidió (mismo motivo documentado en la versión
   de Eventos).
   Bug real corregido (ver MANIFEST.md -- "header sticky del acordeón se
   superpone sobre los nombres de las personas"): antes, `touchmove`
   achicaba `panel.style.maxHeight` (y con él, el alto real de
   `#eq-sticky-header`, que envuelve al panel) en cada frame del gesto, pero
   `_eqActualizarStickyHeaders()` -- la única función que mantiene el `top`
   inline de los 5 headers de sección sincronizado con ese alto real -- solo
   se llamaba en `touchend` + 300ms, nunca durante el propio arrastre.
   Durante todo ese gesto (que puede durar varios segundos), los headers
   quedaban con un `top` desactualizado (el del panel todavía abierto del
   todo), position:sticky los pegaba mucho más abajo de lo real, y al ser
   opacos con z-index por encima del roster (`.eq-grupo-header--sticky`,
   css/equipo.css) terminaban tapando nombres de personas -- no era en
   realidad un problema de VALORES de z-index (`.eq-sticky-header` ya es
   100 contra 5 de `.eq-grupo-header--sticky`, jerarquía correcta) sino de
   un `top` desincronizado durante el arrastre en vivo. Fix:
   `_eqActualizarStickyHeadersThrottled()` (throttle por
   `requestAnimationFrame`, evita forzar layout -- `offsetHeight` -- en
   cada uno de los muchos eventos `touchmove` por segundo) se llama al
   final de cada `touchmove`, así el `top` de los headers stuck se mantiene
   al día con el alto real de la nav en todo momento, no solo al soltar. */
var _eqListaDragY = 0, _eqListaDragActivo = false, _eqListaDragAlturaOriginal = 0;
var _EQ_PANEL_DRAG_UMBRAL_FRACCION = 0.3;
// Perf real (pedido explícito) -- `touchmove` puede disparar más de una vez
// por frame en algunos dispositivos; el patrón rAF+flag ya usado en esta
// app (`_eqActualizarStickyHeadersThrottled()`, más abajo) se aplica acá
// TAMBIÉN al propio trabajo de arrastrar el panel (antes solo envolvía el
// resync de headers sticky que corre al final) -- como mucho 1 escritura
// real de `height`/`transform` por frame de pantalla.
var _eqDragRafTicking = false;
function _eqInicializarCierrePanelesPorScroll() {
  var cont = document.getElementById('eq-lista-contenido');
  if (!cont) return;
  cont.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1 || _eqPanelAbierto !== 'stats') return;
    var cfg = _EQ_PANELES[_eqPanelAbierto];
    var panel = cfg && document.getElementById(cfg.el);
    if (!panel) return;
    panel.classList.remove('eq-panel-auto'); // no se arrastra un height `auto` -- necesita un px real de partida
    _eqListaDragY = e.touches[0].clientY;
    _eqListaDragActivo = true;
    _eqListaDragAlturaOriginal = panel.getBoundingClientRect().height;
  }, { passive: true });
  cont.addEventListener('touchmove', function(e) {
    if (!_eqListaDragActivo || _eqPanelAbierto !== 'stats') return;
    if (_eqDragRafTicking) return;
    _eqDragRafTicking = true;
    var clientY = e.touches[0].clientY;
    requestAnimationFrame(function() {
      _eqDragRafTicking = false;
      var cfg = _EQ_PANELES[_eqPanelAbierto];
      var panel = cfg && document.getElementById(cfg.el);
      if (!panel) return;
      var dy = clientY - _eqListaDragY;
      var hijos = panel.children;
      var k;
      if (dy >= 0) {
        panel.style.transition = '';
        panel.style.height = _eqListaDragAlturaOriginal + 'px';
        for (k = 0; k < hijos.length; k++) hijos[k].style.transform = 'translateY(0) translateZ(0)';
      } else {
        panel.style.transition = 'none';
        var nuevaAltura = Math.max(0, _eqListaDragAlturaOriginal + dy);
        panel.style.height = nuevaAltura + 'px';
        // % arrastrado (0 = recién empezando, 1 = ya llegó a 0) -- mismo
        // porcentaje para el `translateY` de los hijos, así el contenido se
        // desliza 1:1 con el recorte del wrapper durante el gesto en vivo.
        // `translateZ(0)` sumado (mismo motivo que `_eqAnimarPanel()`, más
        // arriba) -- un `style.transform` inline pisa cualquier `transform`
        // de la clase, incluido el permanente de reposo.
        var pct = _eqListaDragAlturaOriginal > 0 ? (1 - nuevaAltura / _eqListaDragAlturaOriginal) : 0;
        for (k = 0; k < hijos.length; k++) hijos[k].style.transform = 'translateY(-' + (pct * 100) + '%) translateZ(0)';
      }
      _eqActualizarStickyHeadersThrottled();
    });
  }, { passive: true });
  cont.addEventListener('touchend', function(e) {
    if (!_eqListaDragActivo) return;
    _eqListaDragActivo = false;
    if (!_eqPanelAbierto) return;
    var tagCerrado = _eqPanelAbierto;
    var cfg = _EQ_PANELES[tagCerrado];
    var panel = cfg && document.getElementById(cfg.el);
    var btn = cfg && document.getElementById(cfg.btn);
    if (!panel) return;
    var dy = e.changedTouches[0].clientY - _eqListaDragY;
    var arrastrado = Math.max(0, -dy);
    panel.style.transition = '';
    if (arrastrado >= _eqListaDragAlturaOriginal * _EQ_PANEL_DRAG_UMBRAL_FRACCION) {
      _eqPanelAbierto = null;
      // Mismo bug real corregido que en `_eqCerrarPanel()` (ver ese
      // comentario grande, más arriba) -- `_eqSincronizarClasePanelAbierto()`
      // NO se llama acá todavía, para no reaparecer los headers stuck
      // antes de que el snap final a `0px` (abajo) termine y
      // `_eqActualizarStickyHeaders()` corrija sus posiciones (mismo
      // `setTimeout(...,300)` de siempre, al final de este handler).
      var panelH = panel.offsetHeight + 'px';
      panel.classList.remove('abierta');
      panel.classList.remove('eq-panel-auto');
      _eqAnimarPanel(panel, panelH, '0px', 'translateY(0)');
      if (btn) btn.classList.remove('activo');
    } else {
      // `volverseAuto:true` -- el drag no llegó al umbral, el panel vuelve a
      // abierto de verdad (no solo visualmente): mismo motivo que el toggle
      // manual, queda flexible en `auto` en vez de congelado en el px que
      // medía la nav en ESTE momento puntual. `desdePx` es el alto parcial
      // actual del arrastre (`panel.style.height`, lo último que dejó el
      // `touchmove`) -- no `scrollHeight`, que ya mide el alto COMPLETO.
      _eqAnimarPanel(panel, panel.style.height, _eqListaDragAlturaOriginal + 'px', 'translateY(0)', true);
    }
    setTimeout(function() {
      _eqActualizarStickyHeaders();
      _eqSincronizarClasePanelAbierto();
    }, 300);
  }, { passive: true });
}
_eqInicializarCierrePanelesPorScroll();

/* ── Colapso de "Mis estadísticas" por umbral de scroll (pedido explícito)
   -- distinto del drag-to-dismiss de arriba (`_eqInicializarCierrePanelesPorScroll()`):
   ese SOLO corre en `touchmove` (sigue el gesto en vivo, proporcional al
   arrastre) -- nunca dispara con scroll de mouse/trackpad/rueda ni con
   scroll inercial después de soltar el dedo (`touchend` ya pasó,
   `_eqListaDragActivo` vuelve a `false`), porque nunca hubo un `touchstart`
   que lo arranque. Esto cubre esos casos con un umbral fijo (80px) en vez
   de seguir el gesto -- corta de una sola vez. Re-ajuste (pedido explícito,
   "cierre consistente con el toggle manual, animado siempre") -- vuelve a
   `_eqCerrarPanel('stats')`, SIN `instant:true` -- mismo camino animado
   (350ms, `_eqAnimarPanel()` con `translateZ(0)` en los hijos) que ya usa
   el toggle manual del chevron (`_eqTogglePanel()`). Revierte el pulido
   anterior (ver CHANGELOG.md, "no se ve bien en Android Chrome" -- ese
   pedido cambió esto a `instant:true`/`transition:none`) -- pedido
   explícito de probar de nuevo con la promoción a capa GPU que ya tiene
   `_eqAnimarPanel()` desde la ronda de perf posterior a ese fix (no
   existía todavía cuando se hizo instantáneo). Si vuelve a trabarse en
   Android Chrome, la causa más probable no es la falta de GPU layer (los
   hijos ya la tienen) sino que animar `height` en sí dispara layout en
   cada frame mientras el scroll compositor sigue corriendo en paralelo --
   ahí el único fix real sería volver a `instant:true`.
   El pedido original decía "contenedor interno de la sección, no window,
   para no interferir con otras secciones" -- pero esta app no tiene
   contenedor propio con scroll: cada `.pantalla` scrollea a nivel
   `window`/`body` (css/global.css, sin `overflow-y` en `#s-equipo` ni en
   `#eq-lista-contenido`) -- un listener de `scroll` en ese div nunca
   dispararía (no es él quien scrollea). Se escucha `window` (mismo patrón
   ya usado por `_eqActualizarStickyHeadersThrottled()`, más abajo en este
   archivo) pero se sale de una si `#s-equipo` no es la pantalla activa --
   ahí queda resuelto el "no interferir con otras secciones" del pedido
   original, por otro camino. `!_eqListaDragActivo` evita pisar el drag en
   vivo de arriba mientras el dedo sigue abajo (los 2 mecanismos conviven:
   el drag maneja el gesto táctil en curso, este cubre todo lo demás). No
   vuelve a expandir solo -- re-expandir es siempre manual, vía el chevron
   (`_eqTogglePanel()`). */
function _eqInicializarColapsoStatsPorScroll() {
  var UMBRAL_PX = 80;
  // Perf real (pedido explícito) -- rAF+flag ("ticking"), mismo patrón que
  // el resto de esta app usa para listeners de `scroll` de bajo costo
  // (`_eqActualizarStickyHeadersThrottled()`, más abajo): como mucho 1
  // chequeo real por frame, sin importar cuántos eventos `scroll` lleguen.
  var ticking = false;
  window.addEventListener('scroll', function() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      ticking = false;
      if (_eqPanelAbierto !== 'stats' || _eqListaDragActivo) return;
      var s = document.getElementById('s-equipo');
      if (!s || !s.classList.contains('activa')) return;
      if (window.scrollY > UMBRAL_PX) _eqCerrarPanel('stats');
    });
  }, { passive: true });
}
_eqInicializarColapsoStatsPorScroll();

/* ── Cierre rápido del panel de búsqueda/filtros al iniciar cualquier gesto
   afuera (ver MANIFEST.md -- "el panel de búsqueda/filtros debe ocultarse
   rápido al scrollear, igual que en Eventos") -- puerto 1:1 de
   `_evCerrarBurbujaSiFueraDe()`/js/eventos.js: a diferencia de `stats`
   (arriba, colapso PROGRESIVO en vivo mientras el dedo arrastra sobre
   `#eq-lista-contenido`), `busqueda` se cierra de UNA SOLA VEZ con la
   transición CSS normal de siempre (`_eqCerrarPanel()`, sin arrastre en
   vivo) apenas arranca cualquier gesto -- `pointerdown`/`touchstart` en
   FASE DE CAPTURA sobre `document` (dispara con el simple inicio de un
   scroll del roster, no hace falta esperar a un `touchend`), o un `click`
   normal -- fuera del panel y de su botón trigger. Con texto ya escrito en
   el buscador este cierre-por-gesto-afuera se desactiva (mismo criterio
   que Eventos) -- solo la lupa lo cierra en ese caso, para no perder el
   query a mitad de tipeo por un scroll accidental. */
function _eqCerrarBurbujaSiFueraDe(target) {
  if (_eqPanelAbierto !== 'busqueda') return;
  if (_eqBusqueda !== '') return;
  var cfg = _EQ_PANELES.busqueda;
  var panelEl = document.getElementById(cfg.el);
  var btnEl = document.getElementById(cfg.btn);
  if ((panelEl && panelEl.contains(target)) || (btnEl && btnEl.contains(target))) return;
  _eqCerrarPanel('busqueda');
}
document.addEventListener('click', function(e) { _eqCerrarBurbujaSiFueraDe(e.target); });
['pointerdown', 'touchstart'].forEach(function(tipo) {
  document.addEventListener(tipo, function(e) { _eqCerrarBurbujaSiFueraDe(e.target); }, { capture: true, passive: true });
});

// Burbujas de categoría "Puntos"/"Rol" (rediseño, ver MANIFEST.md --
// re-ajuste: "acordeón mutuamente excluyente, comportamiento radio, solo
// uno abierto a la vez") -- AHORA sí mismo mecanismo EXACTO que
// `_evToggleFiltroBurbuja()`/js/eventos.js (una ronda anterior las dejaba
// independientes, pedido explícito revertido): `_eqFiltroBurbujaAbierta` es
// un solo valor ('puntos'|'rol'|null), no un mapa de booleanos -- abrir un
// campo cierra el otro si estaba abierto, tocar el que ya está abierto lo
// cierra. `.abierta` togglea con techo FIJO 320px (css/equipo.css, sin
// medir `scrollHeight` -- contenido chico y acotado, 2 pills o 7 pills como
// mucho) + el ícono chevron (`expand_more`/`expand_less`) + `.eq-filtro-activo`
// en el trigger.
var _eqFiltroBurbujaAbierta = null; // 'puntos' | 'rol' | null
function _eqAbrirFiltroBurbuja(campo) {
  var burbuja = document.getElementById('eq-filtro-burbuja-' + campo);
  var btn = document.getElementById('eq-filtro-btn-' + campo);
  if (burbuja) burbuja.classList.add('abierta');
  if (btn) {
    btn.classList.add('eq-filtro-activo');
    var chevron = btn.querySelector('.material-symbols-outlined');
    if (chevron) chevron.textContent = 'expand_less';
  }
}
function _eqCerrarFiltroBurbuja(campo) {
  var burbuja = document.getElementById('eq-filtro-burbuja-' + campo);
  var btn = document.getElementById('eq-filtro-btn-' + campo);
  if (burbuja) burbuja.classList.remove('abierta');
  if (btn) {
    btn.classList.remove('eq-filtro-activo');
    var chevron = btn.querySelector('.material-symbols-outlined');
    if (chevron) chevron.textContent = 'expand_more';
  }
}
function _eqToggleFiltroBurbuja(campo) {
  if (_eqFiltroBurbujaAbierta === campo) {
    _eqCerrarFiltroBurbuja(campo);
    _eqFiltroBurbujaAbierta = null;
  } else {
    if (_eqFiltroBurbujaAbierta) _eqCerrarFiltroBurbuja(_eqFiltroBurbujaAbierta);
    _eqFiltroBurbujaAbierta = campo;
    _eqAbrirFiltroBurbuja(campo);
  }
  // El panel exterior (#eq-busqueda-panel) fija su `max-height` al alto
  // real de SU contenido en el momento de abrirse (`_eqAbrirPanel()`, más
  // arriba en este archivo), sin ninguna burbuja de categoría abierta
  // todavía -- relajarlo acá a un techo holgado evita que esa altura ya
  // ajustada recorte una burbuja que se expande DESPUÉS (mismo fix ya
  // aplicado en Eventos, `_evToggleFiltroBurbuja()`/js/eventos.js). Nunca
  // hay más de UNA burbuja abierta a la vez (comportamiento radio, ver
  // arriba), mismo techo que usa Eventos alcanza acá también.
  var panelEl = document.getElementById('eq-busqueda-panel');
  if (panelEl && panelEl.classList.contains('abierta')) panelEl.style.maxHeight = '600px';
}

// Estado del período de puntaje -- default mes/año actuales (mismo
// comportamiento que getEquipo() sin parámetros). `modo`: 'mes' | 'rango' |
// 'historico'. Los 4 campos de rango/mes único conviven siempre en el
// objeto (no se borran al cambiar de modo) para no perder la selección si
// el usuario va y vuelve entre pestañas del panel.
var _eqFiltroPeriodo = (function() {
  var hoy = new Date();
  var m = hoy.getMonth() + 1, a = hoy.getFullYear();
  return { modo: 'fecha', mesDesde: m, anioDesde: a, mesHasta: m, anioHasta: a };
})();
var _eqFiltroRoles = [];

// Modo de período (rediseño, ver MANIFEST.md -- "reemplazar Mes/Rango/
// Histórico por solo 2 pills: Fecha e Histórico"): 'historico' aplica
// directo (sin datos que elegir) y es toggleable (tocarlo YA activo lo
// desactiva y vuelve al default, mes actual -- "para resetear, el usuario
// deselecciona los pills", pedido explícito). 'fecha' SIEMPRE abre la
// modal de calendario al tocarla (`_eqAbrirModalFecha()`, más abajo) --
// **no** es toggleable del mismo modo: mismo bug real ya encontrado con
// Playwright en una versión anterior de esta función (cuando existían las
// 3 pills Mes/Rango/Histórico) -- "Fecha" arranca `activa` por default
// (mes actual ya aplicado sin que el usuario haga nada), así que tratarla
// como toggleable haría que el PRIMER tap (para elegir OTRA fecha) se
// leyera como "ya está activa, desactivar" en vez de "abrir la modal". El
// filtro real recién se aplica al confirmar la modal, nunca al tocar el
// pill.
function _eqFiltroPeriodoModo(modo) {
  if (modo === 'historico') {
    var pillHist = document.querySelector('.eq-periodo-pills .aj-pill[data-modo="historico"]');
    if (pillHist && pillHist.classList.contains('activa')) {
      var hoy = new Date();
      _eqFiltroPeriodo.modo = 'fecha';
      _eqFiltroPeriodo.mesDesde = _eqFiltroPeriodo.mesHasta = hoy.getMonth() + 1;
      _eqFiltroPeriodo.anioDesde = _eqFiltroPeriodo.anioHasta = hoy.getFullYear();
      document.querySelectorAll('.eq-periodo-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
      _eqAplicarFiltrosAhora();
      return;
    }
  }
  _eqFiltroPeriodo.modo = modo;
  // `.eq-periodo-pills` (no `#eq-filtro-periodo-modo` a secas) -- filtro de
  // período también en el perfil de detalle (ver MANIFEST.md/
  // `_eqPerfilContenidoHtml()` más abajo): hay 2 instancias posibles de
  // esta fila de pills en el DOM a la vez (panel de Filtros de la home +
  // acordeón "Estadísticas" del perfil, si está abierto), ambas comparten
  // esta clase -- togglear 'activa' desde CUALQUIERA de las 2 mantiene a
  // la otra en sync, sin importar cuál disparó el click.
  document.querySelectorAll('.eq-periodo-pills .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', p.getAttribute('data-modo') === modo);
  });
  if (modo === 'historico') _eqAplicarFiltrosAhora();
  else if (modo === 'fecha') _eqAbrirModalFecha();
}

/* ── Modal "Elige la fecha" (rediseño, ver MANIFEST.md -- unifica las 2
   modales anteriores "Elige el mes"/"Elige el rango" en una sola, pedido
   explícito: "reemplazar los pills actuales de período (Mes, Rango,
   Histórico) por solo dos: Fecha e Histórico") -- reusa al máximo el
   componente de calendario de un solo mes ya existente en la app
   ("asistencia anticipada", `_evAntCalRender()`/js/eventos.js: mismas
   clases `.ev-cal-grid`/`.ev-cal-dow`/`.ev-cal-celda`/`.ev-cal-num`/
   `.ev-ajeno`/`.ev-ant-cal-sel`/`.ev-ant-cal-en-rango`/`.ev-ant-cal-hoy`,
   mismo algoritmo de grilla -- lunes de la semana del día 1 hasta el
   domingo de la semana del último día del mes, `_evLunesDeSemana()`/
   `_evToISO()`, js/eventos.js) con nav `‹ mes-a-mes ›` (`.ev-ant-cal-nav*`,
   css/eventos.css, reusado tal cual) en vez de las 12-meses-apilados que
   usaba la modal de Rango vieja (`.eq-cal-mini*`, ya sacada de este
   archivo/css/equipo.css -- sin más consumidores tras este cambio).

   3 vistas dentro de la misma modal (`_eqCalFecha.vista`, ver
   `_eqRenderModalFecha()`/`_eqCalFechaRenderContenido()` más abajo -- TODOS
   los cambios de vista/mes/día pintan a través de esa única función, que
   anima la transición, ver el bloque grande de más abajo, "Animación de
   contenido"): 'dias' (default, la grilla de un solo mes), 'meses' (grilla
   Ene-Dic, `.ev-ant-mes-grid`/`.ev-ant-mes-cell`, MISMO componente/clases
   que ya usa "asistencia anticipada → Por meses",
   `_evAntRenderMesesGrid()`/js/eventos.js, reusado tal cual, sin fork) y
   'anios' (grilla de años estilo Google Calendar, `.eq-cal-fecha-year-*`,
   ver más abajo). El header (re-ajuste, pedido explícito: "header separado
   en 2 partes tappeables") tiene 2 palabras tappeables INDEPENDIENTES
   (`#eq-modal-fecha-label-mes`/`#eq-modal-fecha-label-anio`, cada una con
   su propio subrayado -- punteado el mes, sólido el año,
   `.eq-cal-fecha-label-mes`/`-anio`/css/equipo.css -- para que se lean como
   2 controles distintos, no 1 solo): tocar el mes abre/cierra 'meses'
   (`_eqCalFechaAbrirMeses()`), tocar el año abre/cierra 'anios'
   (`_eqCalFechaAbrirAnios()`) -- las 2 SIEMPRE tappeables sin importar la
   vista activa (tocar "año" estando en 'meses' salta directo a 'anios', sin
   pasar por 'dias' en el medio). Los chevrones `‹›` (mes-a-mes) solo tienen
   sentido mirando días -- se ocultan con `visibility:hidden` (no `display`,
   para no correr los labels del centro al sacar 1 de los 3 hijos de
   `.ev-ant-cal-nav`, `justify-content:space-between`) en 'meses'/'anios'.
   El título de la modal (`#eq-modal-fecha-titulo`) es DINÁMICO por vista
   ("Elige la fecha"/"Elige el mes"/"Elige el año", pedido explícito,
   "limpiar textos" -- reemplaza un texto secundario redundante que vivía
   antes en el header mismo, "Elige un año"/"Elige un mes", ya sacado del
   todo: con el título ya comunicando en qué vista se está, una 2da leyenda
   ahí adentro era ruido, no información nueva).

   Elegir un mes (`_eqCalFechaElegirMes()`) o un año
   (`_eqCalFechaElegirAnio()`) vuelve a 'dias' mostrando ese mes/año.
   Selección por FECHA ISO real (bug real corregido, ver MANIFEST.md -- "al
   tocar un día del calendario el período seleccionado no se actualiza") --
   `_eqCalFecha.desde`/`hasta` guardan la fecha ISO exacta tocada, mismo
   mecanismo "ida y vuelta" de siempre (primer tap fija Desde y limpia
   Hasta; un tap posterior -- fecha >= Desde -- fija Hasta; uno anterior a
   Desde reemplaza Desde), ver el comentario grande de `_eqPintarDiasGrid()`
   más abajo para el detalle del bug (una ronda anterior guardaba una CLAVE
   DE MES en vez de la fecha real, que no distinguía 2 días del mismo mes
   entre sí -- el resumen quedaba pegado mostrando el mismo mes 2 veces sin
   importar qué día se tocara). El filtro real que llega a `getEquipo()`
   sigue siendo solo mes/año (`_eqConfirmarModalFecha()` descarta el día al
   confirmar) -- pero el resumen visual ahora SÍ muestra el día exacto
   tocado ("01/09/2026 al 17/09/2026", pedido explícito), no el mes pelado.
   "Restablecer" (`_eqCalFechaRestablecer()`, re-ajuste, pedido explícito)
   ya NO limpia la selección a vacío -- navega al mes actual (animado,
   mismo camino que cualquier otro cambio) y lo deja pre-seleccionado como
   el rango (Desde=Hasta=hoy), un default útil en vez de un estado vacío
   que obligaba a tocar un día de nuevo. Markup real en index.html
   (`#eq-modal-fecha-*`) -- mismo componente `.bsheet-overlay`/`.bsheet`
   estándar que el resto de sheets de la app, mismo criterio de
   apertura/cierre.

   ── Animación de contenido (pedido explícito, "todas las transiciones
   dentro del bottom sheet deben estar animadas... actualmente solo se
   anima la apertura/cierre del bottom sheet") ──
   `_eqCalFechaRenderContenido(pintarFn, instant)` es el ÚNICO camino que
   toca el HTML de `#eq-modal-fecha-contenido` (grilla de días, de meses o
   de años, según la vista) -- centraliza la animación para que cambiar de
   mes, abrir/cerrar el selector de meses, abrir/cerrar el de años y volver
   al calendario se vean todos igual, sin duplicar la coreografía en cada
   handler. 2 animaciones en paralelo sobre 2 elementos DISTINTOS (mismo
   criterio que ya usan los acordeones de esta sección para separar "qué se
   anima" de "cuánto mide"):
   1) FADE del contenido -- reusa `_evFadeSwap()`/js/eventos.js TAL CUAL
      (la misma función que ya usa `_evAntCalRender()` para animar sus
      propios cambios de mes/selección -- sin fork, sin reimplementar):
      opacity a 0, recién con el contenido ya invisible pinta el HTML nuevo,
      y sube la opacity de vuelta.
   2) RESIZE del wrapper -- `#eq-modal-fecha-viewport` (`.eq-cal-fecha-viewport`,
      css/equipo.css: `overflow:hidden` + `transition:max-height`) envuelve
      a `#eq-modal-fecha-contenido` -- antes de pintar se "aterriza" en su
      alto ACTUAL real (`scrollHeight`, nunca animar desde `none`, mismo
      criterio que el resto de acordeones de este archivo); el callback que
      `_evFadeSwap()` corre para pintar el HTML nuevo (con el contenido
      todavía en opacity:0, así que medir acá no se ve saltar) también mide
      el `scrollHeight` NUEVO y se lo asigna a `viewport.style.maxHeight` --
      la `transition` de esa clase anima el resize del wrapper (y por lo
      tanto el alto real de la modal, que crece/encoge con su contenido) en
      paralelo al fade. Esta modal ya no pasa por `display:none` en ningún
      momento (`.eq-modal-centro-*`/css/equipo.css -- oculta/revela con
      `opacity`+`pointer-events`, no con `display`), así que ni siquiera
      aplica el bug de "medir con la pantalla en display:none da 0"
      documentado en la cabecera de este archivo -- `instant:true` en el
      primer render (`_eqAbrirModalFecha()`) sigue existiendo, pero solo
      para no duplicar el fade de la modal entera con un 2do fade del
      contenido encima, ver ese comentario. */
var _eqCalFecha = { anioMostrado: null, mesMostrado: null, desde: null, hasta: null, vista: 'dias' };
function _eqAbrirModalFecha() {
  var hoy = new Date();
  // Arranca mostrando el mes "Desde" ya elegido (si había uno) -- reabrir
  // la modal conserva la última selección en vez de resetear a hoy.
  // `desde`/`hasta` se reconstruyen como fecha ISO al día 1 del mes
  // correspondiente -- `_eqFiltroPeriodo` solo guarda mes/año (nunca un día
  // real, ver `_eqConfirmarModalFecha()` más abajo), así que el día exacto
  // es arbitrario acá; lo que importa es que caiga en el mes/año correcto
  // para que `_eqPintarDiasGrid()` lo resalte bien.
  _eqCalFecha.anioMostrado = _eqFiltroPeriodo.anioDesde || hoy.getFullYear();
  _eqCalFecha.mesMostrado = (_eqFiltroPeriodo.mesDesde || (hoy.getMonth() + 1)) - 1;
  _eqCalFecha.vista = 'dias';
  if (_eqFiltroPeriodo.mesDesde && _eqFiltroPeriodo.anioDesde) {
    _eqCalFecha.desde = _eqFiltroPeriodo.anioDesde + '-' + _evPad(_eqFiltroPeriodo.mesDesde) + '-01';
    _eqCalFecha.hasta = (_eqFiltroPeriodo.mesHasta && _eqFiltroPeriodo.anioHasta && !(_eqFiltroPeriodo.mesHasta === _eqFiltroPeriodo.mesDesde && _eqFiltroPeriodo.anioHasta === _eqFiltroPeriodo.anioDesde))
      ? _eqFiltroPeriodo.anioHasta + '-' + _evPad(_eqFiltroPeriodo.mesHasta) + '-01' : null;
  } else {
    _eqCalFecha.desde = null;
    _eqCalFecha.hasta = null;
  }
  // Clamp defensivo (ver MANIFEST.md/CHANGELOG.md -- "si por alguna razón
  // se selecciona un rango que incluye fechas futuras, el límite superior
  // debe ajustarse a hoy") -- si `_eqFiltroPeriodo` traía guardado un mes
  // futuro (estado viejo, de antes de este fix, u otro camino cualquiera),
  // tanto el mes MOSTRADO como `desde`/`hasta` se ajustan a hoy acá -- sin
  // esto la modal se abriría mostrando un mes futuro con todo deshabilitado
  // y ninguna fecha realmente seleccionada a la vista.
  if (_eqCalFecha.anioMostrado > hoy.getFullYear() || (_eqCalFecha.anioMostrado === hoy.getFullYear() && _eqCalFecha.mesMostrado > hoy.getMonth())) {
    _eqCalFecha.anioMostrado = hoy.getFullYear();
    _eqCalFecha.mesMostrado = hoy.getMonth();
  }
  _eqCalFechaClampAFuturo();
  // `true` -- primer paint instantáneo, sin el fade+resize normal de
  // `_eqCalFechaRenderContenido()`: la modal entera ya está entrando con su
  // propia animación fade+scale (`.visible`, más abajo), un 2do fade del
  // contenido por encima sería redundante, no un fix de ningún bug de
  // medición (a diferencia del bsheet anterior, esta modal nunca pasa por
  // `display:none` -- ver `.eq-modal-centro-*`/css/equipo.css -- así que
  // `scrollHeight` siempre mide real, con o sin `.visible`).
  _eqRenderModalFecha(true);
  var ov = document.getElementById('eq-modal-fecha-overlay');
  var sh = document.getElementById('eq-modal-fecha-sheet');
  if (!ov || !sh) return;
  ov.classList.add('visible');
  sh.classList.add('visible');
}
// Mismo mecanismo "siempre montada, opacity+pointer-events" que
// `.eq-confirm-sheet-overlay`/`_eqConfirmarAdminCancelar()` (más abajo en
// este archivo) -- sin `setTimeout` ni `display:none`: sacar `.visible`
// alcanza, la propia `transition` de css/equipo.css anima la salida.
function _eqCerrarModalFecha() {
  var ov = document.getElementById('eq-modal-fecha-overlay');
  var sh = document.getElementById('eq-modal-fecha-sheet');
  if (ov) ov.classList.remove('visible');
  if (sh) sh.classList.remove('visible');
}
function _eqCalFechaMoverMes(dir) {
  _eqCalFecha.mesMostrado += dir;
  if (_eqCalFecha.mesMostrado > 11) { _eqCalFecha.mesMostrado = 0; _eqCalFecha.anioMostrado++; }
  else if (_eqCalFecha.mesMostrado < 0) { _eqCalFecha.mesMostrado = 11; _eqCalFecha.anioMostrado--; }
  _eqRenderModalFecha();
}
// Las 2 palabras del header togglean su propia vista -- volver a tocar la
// que ya está abierta cierra sin elegir nada (mismo criterio que el
// selector de fecha de nacimiento, `shared/date-picker.js`:
// `dpState.yearMode = !dpState.yearMode`). Tocar la OTRA palabra mientras
// una ya está abierta salta directo a esa otra vista, sin pasar por 'dias'.
function _eqCalFechaAbrirMeses() {
  _eqCalFecha.vista = _eqCalFecha.vista === 'meses' ? 'dias' : 'meses';
  _eqRenderModalFecha();
}
function _eqCalFechaAbrirAnios() {
  _eqCalFecha.vista = _eqCalFecha.vista === 'anios' ? 'dias' : 'anios';
  _eqRenderModalFecha();
}
function _eqCalFechaElegirMes(mesIdx) {
  _eqCalFecha.mesMostrado = mesIdx;
  _eqCalFecha.vista = 'dias';
  _eqRenderModalFecha();
}
function _eqCalFechaElegirAnio(anio) {
  _eqCalFecha.anioMostrado = anio;
  _eqCalFecha.vista = 'dias';
  _eqRenderModalFecha();
}
// Orquesta el header (título dinámico + las 2 palabras + chevrones) y
// delega el contenido (días/meses/años) a `_eqCalFechaRenderContenido()`,
// que es quien de verdad anima -- ver el comentario grande de arriba,
// "Animación de contenido". `instant` (default false) lo pasa
// `_eqAbrirModalFecha()` en el primer render de cada apertura.
function _eqRenderModalFecha(instant) {
  var titulo = document.getElementById('eq-modal-fecha-titulo');
  var labelMes = document.getElementById('eq-modal-fecha-label-mes');
  var labelAnio = document.getElementById('eq-modal-fecha-label-anio');
  var prevBtn = document.getElementById('eq-modal-fecha-prev');
  var nextBtn = document.getElementById('eq-modal-fecha-next');
  var vista = _eqCalFecha.vista;
  if (titulo) titulo.textContent = vista === 'anios' ? 'Elige el año' : vista === 'meses' ? 'Elige el mes' : 'Elige la fecha';
  if (labelMes) labelMes.textContent = NOMBRES_MESES[_eqCalFecha.mesMostrado];
  if (labelAnio) labelAnio.textContent = String(_eqCalFecha.anioMostrado);
  if (prevBtn) prevBtn.style.visibility = vista === 'dias' ? '' : 'hidden';
  if (nextBtn) nextBtn.style.visibility = vista === 'dias' ? '' : 'hidden';
  _eqCalFechaRenderContenido(function(cont) {
    if (vista === 'anios') _eqPintarAniosGrid(cont);
    else if (vista === 'meses') _eqPintarMesesGrid(cont);
    else _eqPintarDiasGrid(cont);
  }, instant);
  _eqCalFechaActualizarResumen();
}
// Fade (reusa `_evFadeSwap()`/js/eventos.js tal cual) + resize del wrapper
// en paralelo -- ver el comentario grande de "Animación de contenido" más
// arriba para el porqué de cada pieza.
function _eqCalFechaRenderContenido(pintarFn, instant) {
  var viewport = document.getElementById('eq-modal-fecha-viewport');
  var contenido = document.getElementById('eq-modal-fecha-contenido');
  if (!viewport || !contenido) return;
  if (instant) {
    pintarFn(contenido);
    viewport.style.maxHeight = 'none';
    return;
  }
  viewport.style.maxHeight = contenido.scrollHeight + 'px';
  _evFadeSwap(contenido, function() {
    pintarFn(contenido);
    viewport.style.maxHeight = contenido.scrollHeight + 'px';
  }, false);
}
// Grilla de días de un solo mes -- puerto directo del algoritmo de
// `_evAntCalRender()`/js/eventos.js, sin su guard de "fecha pasada"/cuota
// (no aplica acá: el filtro de Equipo es sobre puntos ya guardados, un mes
// íntegramente en el pasado es el caso de uso normal). Selección por FECHA
// ISO real (bug real corregido, ver MANIFEST.md -- "al tocar un día del
// calendario el período seleccionado no se actualiza"): una ronda anterior
// usaba una CLAVE DE MES (`anio*12+mes`) en vez de la fecha real, con la
// intención de que "lo que importa es el mes, no el día" -- pero eso hacía
// que 2 días DISTINTOS del MISMO mes (ej. tocar el 1 y despuós el 17 de
// septiembre) produjeran la MISMA clave, así que el mecanismo "ida y
// vuelta" (ver `_eqCalFechaTocarDia()` más abajo) no podía distinguir un
// 2do toque real de "tocar el mismo valor de nuevo" -- el resumen quedaba
// pegado en "Septiembre 2026 al Septiembre 2026" sin importar qué día se
// tocara. Ahora la selección visual/interna es por fecha ISO real (como
// cualquier selector de rango de fechas normal); el mes+año siguen siendo
// lo único que de verdad viaja a `getEquipo()` (`_eqConfirmarModalFecha()`,
// más abajo, se queda solo con la parte `anio-mes` de cada fecha ISO al
// confirmar) -- el día exacto es el mecanismo de selección, el resumen
// ahora SÍ lo muestra tal cual ("01/09/2026 al 17/09/2026"), pedido
// explícito. Cualquier celda cuyo mes real (el de `cur`, no el mes
// mostrado -- así una celda "ajena" que bordea al mes anterior/siguiente
// también es tocable) caiga dentro de [Desde,Hasta] se pinta con
// `.ev-ant-cal-en-rango`, Desde/Hasta mismos con `.ev-ant-cal-sel` -- mismo
// criterio visual que `_evAntCalRender()`/asistencia anticipada. Recibe
// `cont` (el contenedor a poblar) -- lo pasa `_eqCalFechaRenderContenido()`,
// nunca busca `#eq-modal-fecha-dias` por su cuenta (esa id ya no existe --
// las 3 vistas comparten `#eq-modal-fecha-contenido`).
// Fechas futuras deshabilitadas (ver MANIFEST.md/CHANGELOG.md -- "días
// futuros no seleccionables"): `esFuturo` compara contra `hoy` (fecha REAL
// del dispositivo, `new Date()`/`_evHoyISO()`, nunca el mes MOSTRADO) --
// aplica igual a celdas "ajenas" (bordean el mes anterior/siguiente, ya
// tocables por diseño, ver comentario grande de arriba) -- una celda ajena
// cuya fecha real cae en el futuro también se deshabilita, mismo criterio
// que cualquier otra. Sin `onclick` en las celdas deshabilitadas (no
// alcanza con `pointer-events:none` solo, ver `.eq-cal-fecha-futuro`/
// css/equipo.css) -- mismo criterio que `_evAntCalRender()`/js/eventos.js.
function _eqPintarDiasGrid(cont) {
  var anio = _eqCalFecha.anioMostrado, mes = _eqCalFecha.mesMostrado;
  var inicioGrid = _evLunesDeSemana(new Date(anio, mes, 1));
  var finMes = new Date(anio, mes + 1, 0);
  var finGrid = _evLunesDeSemana(finMes);
  finGrid.setDate(finGrid.getDate() + 6);
  var hoy = _evHoyISO();
  var desde = _eqCalFecha.desde;
  var hasta = _eqCalFecha.hasta !== null ? _eqCalFecha.hasta : desde;
  var html = _EV_DIAS_CORTOS.map(function(d) { return '<div class="ev-cal-dow">' + d + '</div>'; }).join('');
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== mes;
    var futuro = _evFechaCmp(celdaIso, hoy) > 0;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '') + (futuro ? ' eq-cal-fecha-futuro' : '');
    if (desde !== null && _evFechaCmp(celdaIso, desde) >= 0 && _evFechaCmp(celdaIso, hasta) <= 0) clases += ' ev-ant-cal-en-rango';
    if (celdaIso === desde || celdaIso === hasta) clases += ' ev-ant-cal-sel';
    if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
    var onclickAttr = futuro ? '' : ' onclick="_eqCalFechaTocarDia(\'' + celdaIso + '\')"';
    html += '<div class="' + clases + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  cont.innerHTML = '<div class="ev-cal-grid">' + html + '</div>';
}
// Grilla Ene-Dic (feat nueva, pedido explícito: "tocar 'Septiembre' abre un
// selector de meses") -- MISMO componente que "asistencia anticipada → Por
// meses" (`.ev-ant-mes-grid`/`.ev-ant-mes-cell`, css/eventos.css,
// `_evAntRenderMesesGrid()`/js/eventos.js), reusado tal cual (nombres
// completos de mes, 3 columnas) -- sin la restricción de "mes ya
// pasado"/cuota de esa función, que no aplica acá (mismo criterio que el
// resto de esta modal). `.activo` marca el mes actualmente MOSTRADO en la
// grilla de días (no necesariamente el seleccionado como Desde/Hasta -- ver
// el mismo criterio dual documentado en `_eqPintarAniosGrid()`, abajo).
// Meses futuros deshabilitados (ver MANIFEST.md/CHANGELOG.md -- "meses
// futuros no seleccionables") -- compara `(_eqCalFecha.anioMostrado, idx)`
// contra el año/mes REALES de hoy, no solo "meses futuros DEL AÑO ACTUAL":
// generaliza sola al caso de un año mostrado ya futuro (alcanzable desde
// `_eqPintarAniosGrid()`, que sí ofrece `anioReal + 1` como opción) -- ahí
// los 12 meses quedan deshabilitados, no solo los posteriores al actual.
// `disabled` real (botón real, a diferencia de las celdas de día que son
// `<div>`) además de la clase visual -- más robusto que solo omitir el
// `onclick` (bloquea también activación por teclado).
function _eqPintarMesesGrid(cont) {
  var hoy = new Date();
  var anioHoy = hoy.getFullYear(), mesHoy = hoy.getMonth();
  var html = NOMBRES_MESES.map(function(nombre, idx) {
    var futuro = _eqCalFecha.anioMostrado > anioHoy || (_eqCalFecha.anioMostrado === anioHoy && idx > mesHoy);
    var clases = 'ev-ant-mes-cell' + (idx === _eqCalFecha.mesMostrado ? ' activo' : '') + (futuro ? ' eq-cal-fecha-futuro' : '');
    var onclickAttr = futuro ? '' : ' onclick="_eqCalFechaElegirMes(' + idx + ')"';
    var disabledAttr = futuro ? ' disabled' : '';
    return '<button type="button" class="' + clases + '"' + onclickAttr + disabledAttr + '>' + nombre + '</button>';
  }).join('');
  cont.innerHTML = '<div class="ev-ant-mes-grid">' + html + '</div>';
}
// Grilla de años estilo Google Calendar (pedido explícito) -- mismo patrón
// que `renderYearGrid()`/shared/date-picker.js (año actual/mostrado
// resaltado + `scrollIntoView` para que arranque centrado), acotada a una
// ventana de 16 años (año próximo a 15 atrás) en vez de bajar hasta 1920
// como esa función -- ahí tiene sentido para una fecha de nacimiento, acá
// no: cualquier período con puntos guardados va a estar dentro de la vida
// reciente del club. `.hoy` (borde, no relleno -- mismo criterio dual que
// `.ev-ant-cal-hoy`/`.ev-ant-cal-sel` del día-grilla de arriba) marca el
// año calendario REAL de hoy, separado de `.activo` (relleno de marca),
// que marca el año actualmente MOSTRADO -- coinciden la primera vez que se
// abre la modal (arranca en el mes/año de hoy o de la selección previa),
// pero no necesariamente después de navegar. `scrollIntoView` corre igual
// con el contenedor todavía en opacity:0 (el fade de `_evFadeSwap()` no
// afecta layout/scroll, solo pintado) -- no hace falta esperar a que
// termine de aparecer.
function _eqPintarAniosGrid(cont) {
  var anioReal = new Date().getFullYear();
  var html = '';
  for (var y = anioReal + 1; y >= anioReal - 14; y--) {
    var clases = 'eq-cal-fecha-year-btn' + (y === _eqCalFecha.anioMostrado ? ' activo' : '') + (y === anioReal ? ' hoy' : '');
    html += '<button type="button" class="' + clases + '" onclick="_eqCalFechaElegirAnio(' + y + ')">' + y + '</button>';
  }
  cont.innerHTML = '<div class="eq-cal-fecha-year-grid">' + html + '</div>';
  requestAnimationFrame(function() {
    var sel = cont.querySelector('.eq-cal-fecha-year-btn.activo');
    if (sel) sel.scrollIntoView({ block: 'center' });
  });
}
// Clamp defensivo de fechas futuras (ver MANIFEST.md/CHANGELOG.md -- "si
// por alguna razón se selecciona un rango que incluye fechas futuras, el
// límite superior debe ajustarse a hoy") -- bajo uso normal esto nunca
// debería hacer falta (las celdas/meses futuros ya salen del HTML sin
// `onclick`, ver `_eqPintarDiasGrid()`/`_eqPintarMesesGrid()`, así que un
// toque real nunca puede llegar acá con una fecha futura) pero cubre
// cualquier otro camino que pudiera dejar `desde`/`hasta` en el futuro --
// usa `new Date()`/`_evHoyISO()` como referencia, la fecha real del
// dispositivo, nunca el mes MOSTRADO en la modal.
function _eqCalFechaClampAFuturo() {
  var hoy = _evHoyISO();
  if (_eqCalFecha.desde !== null && _evFechaCmp(_eqCalFecha.desde, hoy) > 0) _eqCalFecha.desde = hoy;
  if (_eqCalFecha.hasta !== null && _evFechaCmp(_eqCalFecha.hasta, hoy) > 0) _eqCalFecha.hasta = hoy;
}
// Ida y vuelta -- mismo criterio que `_evAntCalTocarDia()`/js/eventos.js,
// sobre fechas ISO reales (bug real corregido, ver comentario grande de
// `_eqPintarDiasGrid()` más arriba -- antes comparaba una CLAVE DE MES, que
// no distinguía 2 días del mismo mes entre sí). Primer toque (o uno
// posterior a ya tener el rango completo) fija Desde y limpia Hasta; un
// toque posterior -- fecha >= Desde -- fija Hasta; uno anterior a Desde
// reemplaza Desde.
function _eqCalFechaTocarDia(iso) {
  if (_eqCalFecha.desde === null || _eqCalFecha.hasta !== null) {
    _eqCalFecha.desde = iso;
    _eqCalFecha.hasta = null;
  } else if (_evFechaCmp(iso, _eqCalFecha.desde) < 0) {
    _eqCalFecha.desde = iso;
  } else {
    _eqCalFecha.hasta = iso;
  }
  _eqCalFechaClampAFuturo();
  _eqRenderModalFecha();
}
// "01/09/2026" a partir de una fecha ISO -- pedido explícito (bug real
// corregido): antes mostraba "Septiembre 2026" (mes+año, la única
// granularidad real que le importa a `getEquipo()`), pero eso ocultaba
// CUALQUIER cambio de día dentro del mismo mes -- ahora el resumen
// refleja el día exacto tocado, aunque el filtro real que se aplica al
// confirmar siga siendo por mes/año (ver `_eqConfirmarModalFecha()`, más
// abajo).
function _eqCalFechaTextoCorto(iso) {
  var p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}
function _eqCalFechaActualizarResumen() {
  var cont = document.getElementById('eq-modal-fecha-resumen');
  var btn = document.getElementById('eq-modal-fecha-btn-restablecer');
  if (!cont) return;
  var desde = _eqCalFecha.desde, hasta = _eqCalFecha.hasta;
  if (desde === null) {
    cont.innerHTML = '<span class="ev-ant-rango-vacio">Toca un día para empezar</span>';
    if (btn) btn.style.display = 'none';
    return;
  }
  var html = _eqEsc(_eqCalFechaTextoCorto(desde));
  if (hasta !== null) html += ' al ' + _eqEsc(_eqCalFechaTextoCorto(hasta));
  cont.innerHTML = html;
  if (btn) btn.style.display = '';
}
// Re-ajuste (pedido explícito): ya NO limpia la selección a vacío -- vuelve
// al mes actual (animado, mismo camino que cualquier otro cambio de esta
// modal) y lo deja pre-seleccionado como Desde=Hasta (mismo criterio que un
// primer tap fresco en `_eqCalFechaTocarDia()`: `hasta:null` ya se
// interpreta como "Hasta = Desde" en `_eqPintarDiasGrid()`/
// `_eqCalFechaActualizarResumen()`, sin necesidad de fijarlo aparte).
function _eqCalFechaRestablecer() {
  var hoy = new Date();
  _eqCalFecha.anioMostrado = hoy.getFullYear();
  _eqCalFecha.mesMostrado = hoy.getMonth();
  _eqCalFecha.vista = 'dias';
  _eqCalFecha.desde = _evHoyISO();
  _eqCalFecha.hasta = null;
  _eqRenderModalFecha();
}
// El filtro real que viaja a `getEquipo()` sigue siendo mes/año, nunca un
// día exacto (`params.mesDesde`/`anioDesde`/`mesHasta`/`anioHasta`, ver
// supabase/functions/api/index.ts) -- acá es donde se descarta el día real
// de `_eqCalFecha.desde`/`hasta` y se queda solo con la parte `anio-mes`.
function _eqConfirmarModalFecha() {
  _eqCalFechaClampAFuturo(); // último gate defensivo antes de escribir el filtro real -- ver ese comentario, más arriba
  if (_eqCalFecha.desde === null) { _eqCerrarModalFecha(); return; }
  var hastaIso = _eqCalFecha.hasta !== null ? _eqCalFecha.hasta : _eqCalFecha.desde;
  var desdeParts = _eqCalFecha.desde.split('-');
  var hastaParts = hastaIso.split('-');
  _eqFiltroPeriodo.modo = 'fecha';
  _eqFiltroPeriodo.anioDesde = parseInt(desdeParts[0], 10);
  _eqFiltroPeriodo.mesDesde = parseInt(desdeParts[1], 10);
  _eqFiltroPeriodo.anioHasta = parseInt(hastaParts[0], 10);
  _eqFiltroPeriodo.mesHasta = parseInt(hastaParts[1], 10);
  _eqCerrarModalFecha();
  _eqAplicarFiltrosAhora();
}

// Filtro por rol (Cambio 2B) -- 100% frontend sobre `_eqPersonas` ya
// cargado, sin nueva llamada al backend: reusa `_EQ_ROLES`/`_eqRolesDe()`
// (arriba en este archivo), el único sistema de "rol" que existe hoy en
// esta app -- `equipo` (la tabla real) NO tiene columna `rol`/`posicion`
// (verificado contra el schema real antes de escribir esto); lo más
// cercano es `categoria` (Quindes/Mirlxs, el tier -- ya separado en sus
// propios acordeones, filtrarlo con chips sería redundante). Roles reales
// son client-side/localStorage (`eq_roles_<username>`), la MISMA
// limitación ya documentada en `_eqRolesDe()`.
function _eqRenderFiltroRolPills() {
  var cont = document.getElementById('eq-filtro-rol-pills');
  if (!cont) return;
  cont.innerHTML = _EQ_ROLES.map(function(r) {
    return '<span class="aj-pill' + (_eqFiltroRoles.indexOf(r) !== -1 ? ' activa' : '') + '" onclick="_eqFiltroRolToggle(\'' + r.replace(/'/g, "\\'") + '\')">' + _eqEsc(r) + '</span>';
  }).join('');
}
// Toggle + aplicación inmediata (rediseño, ver MANIFEST.md -- sin botón
// "Aplicar filtros"): 100% frontend, sin re-pedir `getEquipo()` (el rol NO
// vive en el backend, ver comentario de arriba) -- alcanza con
// re-renderizar las listas ya cargadas, mismo set de renders que usaba
// `_eqAplicarFiltrosAhora()` para el resto de la pantalla, sin el fetch.
// El panel de búsqueda/filtros NO se cierra acá (a diferencia de
// `_eqAplicarFiltrosAhora()`) -- a propósito, deja seguir tildando/
// destildando varios roles sin que el panel se cierre en cada toque.
function _eqFiltroRolToggle(rol) {
  var idx = _eqFiltroRoles.indexOf(rol);
  if (idx === -1) _eqFiltroRoles.push(rol); else _eqFiltroRoles.splice(idx, 1);
  _eqRenderFiltroRolPills();
  _eqRenderFavoritos();
  _eqRenderGrupo('Quindes');
  _eqRenderGrupo('Mirlxs');
  _eqRenderInactivos();
  if (typeof _eqRenderLesionadxs === 'function') _eqRenderLesionadxs();
  _eqActualizarBadgeFiltros();
}
// Badge numérico del ícono de lupa (feat nueva, ver MANIFEST.md -- "igual a
// como funciona en Eventos") -- mismo criterio que
// `_evActualizarBadgeFiltros()`/js/eventos.js: cuenta CATEGORÍAS de filtro
// con selección activa (0 a 2 acá, "Puntos"/"Rol"), no el total de opciones
// marcadas (ej. 3 roles tildados siguen contando como 1 sola categoría
// activa). Oculto del todo (`display:none`) si el resultado es 0. "Puntos"
// cuenta activo con `_eqPeriodoEsDefault()` (más abajo) -- Histórico
// siempre cuenta, "Fecha" solo si el mes/rango elegido es distinto al mes
// actual (pedido explícito: "una fecha seleccionada distinta al mes
// actual"). Llamada desde los 2 caminos reales que pueden cambiar el
// resultado: `_eqAplicarFiltrosAhora()` (Puntos: Histórico/Fecha, siempre
// re-pega contra el backend) y `_eqFiltroRolToggle()` (Rol, 100%
// frontend).
function _eqPeriodoEsDefault() {
  if (_eqFiltroPeriodo.modo !== 'fecha') return false;
  var hoy = new Date();
  var mesActual = hoy.getMonth() + 1, anioActual = hoy.getFullYear();
  return _eqFiltroPeriodo.mesDesde === mesActual && _eqFiltroPeriodo.anioDesde === anioActual &&
    _eqFiltroPeriodo.mesHasta === mesActual && _eqFiltroPeriodo.anioHasta === anioActual;
}
function _eqActualizarBadgeFiltros() {
  var badge = document.getElementById('eq-filtro-badge');
  if (!badge) return;
  var n = 0;
  if (!_eqPeriodoEsDefault()) n++;
  if (_eqFiltroRoles.length > 0) n++;
  badge.textContent = String(n);
  badge.style.display = n > 0 ? 'flex' : 'none';
}
// Predicado adicional a `_eqPasaBusqueda()` (nunca modificada -- pedido
// explícito de no tocar la lógica de búsqueda si ya funciona) -- se suma
// con `.filter()` en cada render, no se fusiona con ella.
function _eqPasaFiltroRol(p) {
  if (!_eqFiltroRoles.length) return true;
  var rolesDe = _eqRolesDe(p.username);
  if (!rolesDe.length) rolesDe = ['No definido'];
  return _eqFiltroRoles.some(function(r) { return rolesDe.indexOf(r) !== -1; });
}

// Aplica el período de puntaje pedido -- SÍ pega contra el backend (a
// diferencia del filtro de rol): `puntosAsistencia`/`puntosTareas`/
// `puntosTotal` de cada persona dependen de qué período se pidió, así que
// hay que volver a pedir el roster completo con los parámetros nuevos
// (`getEquipo()`, supabase/functions/api/index.ts). Reemplaza `_eqPersonas`
// entero y re-renderiza todo lo que depende de él -- mismo criterio que
// `_eqAsegurarCargado()`, pero sin el guard de caché -- acá SIEMPRE hay que
// volver a pedir, cambió el período. Renombrada de `_eqAplicarFiltros()`
// (rediseño, sin botón "Aplicar filtros" -- ver MANIFEST.md): ahora la
// disparan 3 caminos automáticos en vez de un click de botón manual --
// `_eqFiltroPeriodoModo('historico')` (directo), `_eqConfirmarModalFecha()`
// (al confirmar la modal de calendario), y el toggle-off del pill de
// histórico (vuelve al default, arriba). Sin spinner de botón propio -- ya
// no hay botón que deshabilitar.
function _eqAplicarFiltrosAhora() {
  var p = _eqFiltroPeriodo;
  var params = { action: 'getEquipo' };
  if (p.modo === 'historico') {
    params.historico = true;
  } else {
    // Siempre como rango (mesDesde/anioDesde/mesHasta/anioHasta), incluso
    // para un solo mes -- `getEquipo()` (supabase/functions/api/index.ts)
    // ya trata un rango con Desde===Hasta exactamente igual que un mes
    // suelto (misma ventana de fechas resultante), así que no hace falta
    // un 3er set de parámetros (`params.mes`/`params.anio`) separado para
    // ese caso -- 2 pills (Fecha/Histórico, ver MANIFEST.md), 1 solo modo
    // real de filtro de fecha.
    params.mesDesde = p.mesDesde; params.anioDesde = p.anioDesde;
    params.mesHasta = p.mesHasta; params.anioHasta = p.anioHasta;
  }
  api(params, function(res) {
    _eqPersonas = (res && res.personas) || [];
    _eqCargado = true;
    _eqCerrarPanel('busqueda');
    _eqActualizarBadgeFiltros();
    _eqRenderFavoritos();
    _eqRenderGrupo('Quindes');
    _eqRenderGrupo('Mirlxs');
    _eqRenderInactivos();
    if (typeof _eqRenderLesionadxs === 'function') _eqRenderLesionadxs();
    if (typeof _eqRenderMisEstadisticas === 'function') _eqRenderMisEstadisticas();
    // Filtro de período del perfil de detalle (feat nueva, ver MANIFEST.md)
    // -- `_eqPersonas` se reemplazó entero arriba, así que `_eqPersonaActual`
    // (si hay un perfil abierto -- puede o no estarlo, `_eqAplicarFiltrosAhora()`
    // también se dispara desde el panel de Filtros de la lista) apunta a un
    // objeto YA VIEJO, de la carga anterior. Se re-busca por id en el array
    // nuevo y se re-renderiza el perfil completo con los stats del período
    // recién pedido -- mismo criterio que el resto de esta función (siempre
    // vuelve a pedir, nunca recalcula localmente un período nuevo).
    if (_eqPersonaActual) {
      var actualizada = _eqPersonaPorId(_eqPersonaActual.id);
      if (actualizada) { _eqPersonaActual = actualizada; _eqRenderPerfil(actualizada); }
    }
  }, function(e) {
    mostrarToast((e && e.message) || 'No se pudo aplicar el filtro.', 'error');
  });
}

// Re-render completo (init / cambio de búsqueda) -- a diferencia de
// _eqAnimarCambioFavorito() (toggle de un corazón puntual, con fade), acá
// no hace falta animar nada: mismo criterio ya usado por
// _eqRenderGrupo()/_eqRenderInactivos(), que tampoco animan sus propios
// re-renders completos. Rediseño (acordeón .eq-grupo no colapsable, ver
// MANIFEST.md/CHANGELOG.md): la sección se oculta del todo
// (display:none + opacity:0) cuando no hay favoritos visibles, sin ningún
// empty state propio -- `body.style.maxHeight = 'none'` es el mismo truco
// ya usado por _eqRenderGrupo()/_eqRenderPorRol() para que un acordeón que
// nace "abierto" (clase `.abierto` en el HTML, ver index.html) no quede
// colapsado por el `max-height:0` default de `.eq-grupo-body`.
// Bug real corregido (ver MANIFEST.md -- "lista de personas desaparece al
// usar los filtros") -- Favoritos/Quindes/Mirlxs/Inactivos/Lesionadxs se
// ocultan uno por uno (`wrap.style.display='none'`) cuando su propio
// filtrado da 0 resultados; si los 5 dan 0 A LA VEZ (el caso real más
// común: un pill de rol tildado que nadie tiene asignado en ESTE
// dispositivo -- `_eqRolesDe()` es per-dispositivo/localStorage, ver
// MANIFEST.md -- así que casi cualquier rol salvo "No definido" filtra a
// TODO el mundo afuera) no quedaba NINGÚN contenido visible debajo de la
// nav, sin ningún aviso -- indistinguible de un bug real de renderizado
// (que es exactamente cómo se reportó). Revisa el resultado FINAL de los
// 5 contenedores (nunca reconstruye nada -- solo lee `style.display`, ya
// escrito por cada render) y muestra `#eq-lista-vacia` (mismo componente
// `.eq-favoritos-vacio` que ya usan `_eqRenderPorRol()`/`#eq-mes-vacio`)
// en vez de dejar la pantalla en blanco. Se salta la vista alternativa
// "por rol" (`#eq-roles-wrap`) y el empty-state de mes de cumpleaños
// (`#eq-mes-vacio`) -- esos 2 ya tienen su propio aviso, no hay que
// duplicarlo encima. Llamada al FINAL de cada una de las 5 funciones de
// render de abajo -- así queda correcta sin importar qué combinación de
// ellas corrió en cada ciclo (búsqueda, filtro de rol, filtro de período,
// carga inicial) sin tener que acordarse de llamarla aparte en cada
// caller.
// Fade-in/out (ver MANIFEST.md -- "aparece de golpe sin transición, agregar
// fade-in consistente con el resto de la app") -- antes un `style.display`
// seco sin transición en ningún extremo, contra el principio general de
// "Animación de entrada y salida obligatoria" (MANIFEST.md, sección 2).
// Mismo patrón documentado ahí (doble `requestAnimationFrame` para la
// entrada, `setTimeout` con la misma duración del CSS antes de ocultar en la
// salida) -- 100% opacidad, sin `max-height`/slide (a diferencia de
// `_eqMostrarSeccionFavoritos()`/`_eqOcultarSeccionFavoritos()`, pensadas
// para una sección con contenido real debajo que necesita space real
// mientras entra/sale -- acá es una sola card fija, un fade solo alcanza).
// `transition`/`opacity` quedan inline, scopeados a esta instancia -- no se
// toca `.eq-favoritos-vacio` (CSS compartida con `#eq-mes-vacio`/
// `_eqRenderPorRol()`, sin pedido de tocar esos 2).
var _EQ_LISTA_VACIA_FADE_MS = 250;
function _eqActualizarListaVacia() {
  // Reusa este mismo punto de entrada (llamado al final de las 5 funciones
  // de render) para recalcular el apilado de headers sticky (ver
  // MANIFEST.md -- "sticky headers apilados") -- cualquier cambio de
  // visibilidad de las 5 secciones (búsqueda, filtro de rol, filtro de
  // período, carga inicial) puede correr headers dentro/fuera del apilado,
  // así que necesita el mismo trigger que este empty-state. Antes del
  // guard de abajo (`#eq-lista-vacia` siempre existe en el DOM real, pero
  // que falte no debería frenar esto).
  _eqActualizarStickyHeaders();
  var el = document.getElementById('eq-lista-vacia');
  if (!el) return;
  var mostrar;
  var rolesWrap = document.getElementById('eq-roles-wrap');
  var mesVacio = document.getElementById('eq-mes-vacio');
  if ((rolesWrap && rolesWrap.style.display !== 'none') || (mesVacio && mesVacio.style.display !== 'none')) {
    mostrar = false;
  } else {
    var ids = ['eq-favoritos-wrap', 'eq-grupo-quindes', 'eq-grupo-mirlxs', 'eq-grupo-inactivos', 'eq-grupo-lesionadxs'];
    var algunaVisible = ids.some(function(id) {
      var wrap = document.getElementById(id);
      return wrap && wrap.style.display !== 'none';
    });
    mostrar = !algunaVisible;
  }
  var yaVisible = el.style.display !== 'none';
  if (mostrar === yaVisible) return; // ya está en el estado pedido, nada que animar
  if (mostrar) {
    el.style.transition = 'none';
    el.style.display = '';
    el.style.opacity = '0';
    void el.offsetWidth; // fuerza el reflow antes de animar, mismo truco que el resto de la app
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        el.style.transition = 'opacity ' + _EQ_LISTA_VACIA_FADE_MS + 'ms ease';
        el.style.opacity = '1';
      });
    });
  } else {
    el.style.transition = 'opacity ' + _EQ_LISTA_VACIA_FADE_MS + 'ms ease';
    el.style.opacity = '0';
    setTimeout(function() { el.style.display = 'none'; }, _EQ_LISTA_VACIA_FADE_MS);
  }
}
function _eqRenderFavoritos() {
  var wrap = document.getElementById('eq-favoritos-wrap');
  var cont = document.getElementById('eq-favoritos-lista');
  var pillEl = document.getElementById('eq-favoritos-pill');
  if (!wrap || !cont) return;
  var todas = _eqFavoritos().map(_eqPersonaPorId).filter(function(p) { return !!p && !_eqEsUsuarioActual(p) && !_eqEsInactivo(p); }).filter(_eqPasaFiltroRol);
  var visibles = (_eqBusqueda ? todas.filter(_eqPasaBusqueda) : todas).sort(_eqCompararPorPuntos);
  cont.innerHTML = visibles.map(_eqFilaHtml).join('');
  if (pillEl) pillEl.textContent = visibles.length;
  wrap.style.display = visibles.length ? 'block' : 'none';
  wrap.style.opacity = visibles.length ? '1' : '0';
  // Re-render "instantáneo" (init/búsqueda/filtro) -- sin animar, a
  // diferencia de `_eqMostrarSeccionFavoritos()`/`_eqOcultarSeccionFavoritos()`
  // (esas SÍ animan, solo se usan al tocar el corazón de una fila puntual).
  // `wrap.style.maxHeight` igual necesita quedar consistente acá (`'none'`
  // si hay favoritos, `'0px'` si no) -- si no, un techo numérico que haya
  // quedado fijo de una animación anterior (`_eqOcultarSeccionFavoritos()`
  // interrumpida, por ejemplo) recortaría la lista sin que nada lo repare.
  wrap.style.maxHeight = visibles.length ? 'none' : '0px';
  // Mismo criterio que `_eqMostrarSeccionFavoritos()`/`_eqOcultarSeccionFavoritos()`
  // (ver esos comentarios, más arriba) -- necesario para que el header
  // sticky de adentro (`#eq-favoritos-header`) quede libre de stickear
  // contra el scroll real de la página en vez de contra este wrap.
  wrap.style.overflow = visibles.length ? 'visible' : 'hidden';
  var body = wrap.querySelector('.eq-grupo-body');
  if (body) body.style.maxHeight = 'none';
  _eqHidratarAvatares();
  _eqActualizarListaVacia();
}

function _eqRenderGrupo(rol) {
  var key = rol.toLowerCase();
  var wrap = document.getElementById('eq-grupo-' + key);
  var cont = document.getElementById('eq-grupo-' + key + '-lista');
  var pillEl = document.getElementById('eq-grupo-' + key + '-pill');
  if (!wrap || !cont) return;
  var filtradas = _eqPersonas.filter(function(p) { return p.rol === rol; }).filter(function(p) { return !_eqEsUsuarioActual(p) && !_eqEsInactivo(p); }).filter(_eqPasaBusqueda).filter(_eqPasaFiltroRol).sort(_eqCompararPorPuntos);
  wrap.style.display = filtradas.length ? '' : 'none';
  if (pillEl) pillEl.textContent = filtradas.length;
  cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
  _eqHidratarAvatares();
  // Bug real corregido (Batch 3) -- ver _eqToggleGrupo() más abajo: si el
  // grupo está abierto cuando el contenido cambia (búsqueda/filtro), el
  // `max-height` inline que dejó _eqToggleGrupo() queda desactualizado --
  // recalculado acá para que no quede recortado ni con espacio vacío de más.
  // `'none'`, no `scrollHeight + 'px'` (Batch 9 -- mismo fix y mismo motivo
  // que `_eqRenderPorRol()`, más arriba: medir `scrollHeight` con la
  // `.pantalla` todavía `display:none` da 0, colapsando el acordeón pese a
  // la clase `.abierto`). Con `'none'` este recálculo ni siquiera hace
  // falta en el sentido estricto -- un acordeón sin techo nunca queda
  // recortado por más que cambie el contenido -- pero se deja el guard
  // (recién actualiza si YA estaba abierto) para no pisarle el `max-height`
  // a uno cerrado.
  var bodyAbierto = document.getElementById('eq-grupo-' + key + '-body');
  if (bodyAbierto && bodyAbierto.classList.contains('abierto')) bodyAbierto.style.maxHeight = 'none';
  _eqActualizarListaVacia();
}

// Acordeón "INACTIVOS" (Bugs 11+12 rediseñados, ver MANIFEST.md -- antes
// se ocultaban del todo de la lista de Equipo; ahora viven acá, colapsados
// por defecto en vez de invisibles). Reusa LITERAL el mismo componente que
// Quindes/Mirlxs (`.eq-grupo-header`/`.eq-grupo-body`, `id="eq-grupo-inactivos-*"`
// -- ver el bloque estático nuevo en index.html) para que `_eqToggleGrupo('Inactivos')`
// funcione sin ningún caso especial. Todos los roles juntos en un solo
// grupo (no separado en "Quindes inactivas"/"Mirlxs inactivos") -- acá
// "Inactivos" es un cajón aparte, no una 3ra categoría de tier. `_eqEsInactivo(p)`
// es el ÚNICO filtro (sin el `p.rol === rol` de `_eqRenderGrupo()`) --
// entre esta función y esa, cada persona cae en exactamente un balde: activa
// de su rol, o acá. Este acordeón nace SIN la clase `.abierto` en index.html
// (colapsado por defecto, pedido explícito) -- por eso, a diferencia de
// `_eqRenderGrupo()`, acá NUNCA hay que tocar `style.maxHeight` en el
// render (ese `if (bodyAbierto.classList.contains('abierto'))` de
// `_eqRenderGrupo()` no aplica -- este grupo nunca nace abierto).
function _eqRenderInactivos() {
  var wrap = document.getElementById('eq-grupo-inactivos');
  var cont = document.getElementById('eq-grupo-inactivos-lista');
  var pillEl = document.getElementById('eq-grupo-inactivos-pill');
  if (!wrap || !cont) return;
  var filtradas = _eqPersonas.filter(function(p) { return _eqEsInactivo(p) && !_eqEsUsuarioActual(p); }).filter(_eqPasaBusqueda).filter(_eqPasaFiltroRol).sort(_eqCompararPorPuntos);
  wrap.style.display = filtradas.length ? '' : 'none';
  if (pillEl) pillEl.textContent = filtradas.length;
  cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
  _eqHidratarAvatares();
  _eqActualizarListaVacia();
}

// Acordeón "LESIONADXS" (feat nueva, ver MANIFEST.md/CHANGELOG.md) --
// `getEquipo()` ya devuelve `estado` (`equipo.estado_miembro` tal cual,
// mismo campo que ya usa `_datosRenderStatsHtml()`/js/perfil.js para el
// chip de estado en Ajustes) -- sin cambio de backend necesario. NO
// colapsable (pedido explícito, mismo criterio que Favoritos): nunca pasa
// por `_eqToggleGrupo()`, `max-height:'none'` fijo. Oculta por completo
// (display:none, sin fade -- a diferencia de Favoritos, acá no se pidió
// animación de entrada/salida de la sección) cuando no hay nadie
// lesionadx.
function _eqRenderLesionadxs() {
  var wrap = document.getElementById('eq-grupo-lesionadxs');
  var cont = document.getElementById('eq-grupo-lesionadxs-lista');
  var pillEl = document.getElementById('eq-grupo-lesionadxs-pill');
  if (!wrap || !cont) return;
  var filtradas = _eqPersonas.filter(function(p) { return p.estado === 'Lesionadx' && !_eqEsUsuarioActual(p); }).filter(_eqPasaBusqueda).filter(_eqPasaFiltroRol).sort(_eqCompararPorPuntos);
  wrap.style.display = filtradas.length ? '' : 'none';
  if (pillEl) pillEl.textContent = filtradas.length;
  cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
  var body = wrap.querySelector('.eq-grupo-body');
  if (body) body.style.maxHeight = 'none';
  _eqHidratarAvatares();
  _eqActualizarListaVacia();
}

// "Mis estadísticas" -- panel deslizable de la nav de Equipo (rediseño, ver
// MANIFEST.md/CHANGELOG.md; antes card fija debajo de la nav y encima de
// Favoritos, mismo contenido, ahora dentro de `#eq-misstats-panel`/
// `_eqTogglePanel('stats')`). La persona propia YA está en `_eqPersonas`
// (roster completo, cargado una sola vez por `_eqAsegurarCargado()`) -- sin
// ninguna llamada extra al backend, mismo criterio de búsqueda que
// `_eqEsUsuarioActual()`. Mismos componentes visuales que el perfil de
// detalle (`.eq-stats-grid`/`.eq-stat-card`/`.eq-rank-wrap`, ver
// `_eqPerfilContenidoHtml()` más abajo) y que el chip de estado de Ajustes
// (`.dat-estado-chip`/`.dat-estado-*`, css/perfil.css) -- sin duplicar
// ningún estilo, solo el layout propio del wrapper (`.eq-mis-stats-*`,
// css/equipo.css). Sin datos de contacto (pedido explícito) -- a diferencia
// del perfil de detalle, acá nunca se muestra teléfono/email. Header
// recortado (pedido explícito, ver MANIFEST.md): SIN foto, nombre real,
// nombre derby ni número -- solo rol (Quindes/Mirlxs, `persona.rol`) +
// chip de estado (activo/inactivo/lesionadx). Esos 3 datos sacados siguen
// visibles en el trigger de la nav (`#eq-misstats-toggle-btn`/
// `toggleAvatar` más abajo) y en el perfil de detalle -- este panel es el
// único lugar donde dejan de mostrarse.
function _eqRenderMisEstadisticas() {
  var cont = document.getElementById('eq-misstats-panel-inner');
  var toggleBtn = document.getElementById('eq-misstats-toggle-btn');
  var toggleAvatar = document.getElementById('eq-misstats-toggle-avatar');
  var toggleTendencia = document.getElementById('eq-misstats-toggle-tendencia');
  var togglePills = document.getElementById('eq-misstats-toggle-pills');
  if (!cont || !toggleBtn) return;
  var persona = _eqPersonas.filter(function(p) { return _eqEsUsuarioActual(p); })[0];
  if (!persona) {
    toggleBtn.style.display = 'none';
    // Nadie puede haber abierto un panel sin su trigger visible, pero por
    // las dudas (ej. cambio de cuenta mid-sesión) -- lo cierra si había
    // quedado abierto, mismo criterio defensivo que el resto de esta
    // función.
    if (_eqPanelAbierto === 'stats') _eqCerrarPanel('stats');
    return;
  }
  toggleBtn.style.display = '';
  if (toggleAvatar) {
    toggleAvatar.setAttribute('data-nombre', persona.nombreDerby || persona.username);
    toggleAvatar.setAttribute('data-foto', persona.fotoPerfil || '');
  }
  // Título personalizado (pedido explícito, "reemplazar 'Mis Estadísticas'
  // fijo por el nombre de la persona") -- mismo fallback `nombreDerby ||
  // username` que ya usa el avatar de arriba, único lugar de este archivo
  // donde se resuelve ese nombre para esta persona.
  var toggleNombre = document.getElementById('eq-misstats-toggle-nombre');
  if (toggleNombre) toggleNombre.textContent = persona.nombreDerby || persona.username || '';
  // Chevron de tendencia sobre el avatar chico del botón colapsado (bug
  // real corregido, ver MANIFEST.md/CHANGELOG.md -- "chevron en Mis
  // estadísticas"): el tamaño base de `.eq-tendencia-badge` (18px/13px,
  // css/equipo.css) ya estaba pensado para este lugar exacto desde que se
  // agregó la feature de tendencia ("usado hoy solo en 'Mis estadísticas'"
  // dice el comentario de ese momento) pero nunca se llegó a conectar acá
  // en el JS -- el panel en sí no tiene foto propia (recortada a propósito
  // en una ronda anterior, "sin foto/nombre/número"), así que este avatar
  // chico de la nav (siempre visible, panel abierto o cerrado) es el único
  // lugar real donde puede vivir. `_eqTendenciaBadgeHtml()` sin
  // `claseTamano` (tamaño base) -- mismo criterio que el resto de esta
  // función, sin `_eqAvatarConTendenciaHtml()` completo porque el avatar
  // en sí ya es markup estático en index.html (`#eq-misstats-toggle-avatar`,
  // mutado con `data-nombre`/`data-foto` arriba, nunca reconstruido) --
  // solo el badge se re-renderiza acá, adentro de su propio wrapper
  // `.eq-avatar-badge-wrap` (index.html) ya `position:relative`.
  if (toggleTendencia) toggleTendencia.innerHTML = _eqTendenciaBadgeHtml(persona);
  // Pill de nivel SACADO de la nav (pedido explícito, "se va a mover al
  // termómetro") -- vivía en `#eq-misstats-toggle-pills` (index.html), ahora
  // vacío a propósito, sin más consumidores acá. Reemplazado por el pill
  // dentro de `.eq-rank-labels` (`_eqStatsContenidoHtml()`, más abajo en
  // este archivo) -- mismo `.eq-mis-stats-rol-pill`, misma persona, solo
  // cambia dónde vive.
  if (togglePills) togglePills.innerHTML = '';
  // Contenido de stats -- función compartida con `_eqPerfilContenidoHtml()`
  // (más abajo en este archivo, ver `_eqStatsContenidoHtml()`) -- pedido
  // explícito, ver MANIFEST.md/CHANGELOG.md: "la vista detallada debe usar
  // exactamente el mismo layout, clases y estructura HTML que Mis
  // estadísticas" -- antes esta función tenía su propia copia de este
  // bloque entero (horas/asistencia + separador PUNTOS + grid
  // tareas/asistencia-combo + termómetro), duplicada a mano en las 2
  // funciones -- extraída a un solo lugar, un solo caller cada una.
  cont.innerHTML = _eqStatsContenidoHtml(persona);
  _eqHidratarAvatares();
  // Expandido por defecto (pedido explícito) -- una sola vez por carga de
  // pantalla, no en cada re-render (esta función se re-llama en cada
  // refresh/filtro del roster, ver los 2 callers más arriba en este
  // archivo -- forzar el estado acá en CADA corrida pisaría un toggle
  // manual de la persona a mitad de sesión). `_eqStatsColapsadoGuardado()`
  // default `false` (expandido) si `pivot_stats_collapsed` nunca se guardó.
  // Bug real corregido -- "chevron dice expandido, contenido no se ve",
  // 2da vuelta (fix más robusto, el doble rAF de la ronda anterior no
  // alcanzaba): esta función puede correr con `#s-equipo` todavía
  // `display:none` (ej. re-render disparado por un fetch en segundo plano
  // mientras otra pestaña está activa) -- `panel.scrollHeight` con un
  // ancestro oculto da `0` SIN IMPORTAR cuánto se difiera la medición con
  // rAF, porque el problema no es timing de layout sino que el ancestro
  // sigue oculto en el momento en que se mide. Fix real: `_eqAbrirPanel('stats',
  // true)` -- `instantAuto:true` salta DIRECTO a `height:auto` (clase
  // `eq-panel-auto`, css/equipo.css) sin medir nada -- `auto` se recalcula
  // solo cuando el layout real corra (cuando `#s-equipo` se vuelva visible
  // de verdad), nunca depende de una medición congelada mientras estaba
  // oculto. Sin transición (mismo `instantAuto`) -- es el estado de
  // ARRANQUE, no una animación disparada por una acción real.
  if (!_eqStatsPanelInicializado) {
    _eqStatsPanelInicializado = true;
    if (!_eqStatsColapsadoGuardado()) _eqAbrirPanel('stats', true);
  }
}
var _eqStatsPanelInicializado = false;
function _eqStatsColapsadoGuardado() {
  try { return localStorage.getItem('pivot_stats_collapsed') === 'true'; } catch (e) { return false; }
}
// Contenido de stats compartido entre "Mis estadísticas" (arriba) y el
// perfil de detalle (`_eqPerfilContenidoHtml()`, más abajo) -- pedido
// explícito, ver MANIFEST.md/CHANGELOG.md: "mismo layout, clases y
// estructura HTML... mismas cards de Horas/Asistencia arriba, mismo
// separador 'PUNTOS [total]', mismo grid de 2 cards (Tareas |
// Asistencia con pill de racha si aplica), mismo termómetro abajo".
// Termómetro solo con equipo propio -- mismo bug real/mismo criterio ya
// corregido en `_datosRenderStatsHtml()` (js/perfil.js):
// `necesitaPatines`/`necesitaProtecciones` (getEquipo()) son el
// equivalente real a "usa equipo del club". Racha inline en la card
// combinada -- badge propio SOLO si hay puntos de racha ese período,
// mismo criterio "nunca mostrar 0" que `_eqPuntosRachaHtml()` (esa sigue
// viva, sin más consumidores tras este cambio -- ni "Mis estadísticas" ni
// el perfil de detalle la llaman más, la racha se dobla acá adentro de la
// card de asistencia en vez de tener su propia card aparte -- se deja
// definida por si algún día hace falta una card de racha suelta de
// nuevo). Card combinada Asistencia -- toda la card abre el desglose de
// ASISTENCIA (concepto principal/valor grande); el badge de racha, si hay
// puntos ese período, es su PROPIO target de tap con
// `event.stopPropagation()` (mismo patrón ya usado por `.eq-fav-btn`
// dentro de `.eq-miembro-fila`, más arriba en este archivo) para no
// competir con el tap de la card completa. Solo ícono `sports` arriba
// (sin `local_fire_department` -- el fuego de la racha ya se ve en el
// badge inline, sin duplicarlo). Label "Asistencia" sola (sin "+ Racha"
// -- ya se entiende por el ícono/badge de fuego).
function _eqStatsContenidoHtml(p) {
  var statsCalc = _eqStatsCalc(p);
  // Bug real corregido (ver MANIFEST.md/CHANGELOG.md -- "termómetro
  // Quindes/Mirlxs ya no se muestra"): `necesitaPatines`/`necesitaProtecciones`
  // son strings ("Sí"/"No"/lista parcial, ver js/perfil.js), no booleanos --
  // `!!(a || b)` daba `true` con CUALQUIER valor no vacío, incluido el
  // string literal "No" (JS lo trata como truthy), así que el termómetro se
  // ocultaba para prácticamente todo el roster (confirmado: 100% de las
  // filas de `equipo` tienen `necesita_patines` en "Sí" o "No", nunca
  // vacío) -- exactamente al revés de la intención ("solo con equipo
  // propio"). Comparación explícita, mismo criterio que ya usa
  // `js/perfil.js` para estos mismos campos.
  var necesitaEquipoClub = p.necesitaPatines === 'Sí' ||
    (!!p.necesitaProtecciones && p.necesitaProtecciones.toLowerCase() !== 'no');
  // Pill de tier DENTRO del termómetro (pedido explícito, "acá estás vos")
  // -- reemplaza el texto plano del lado que coincide con `p.rol`, mismo
  // `.eq-mis-stats-rol-pill` (var(--brand), ya destacado) que antes vivía
  // en la nav (`.eq-misstats-toggle-pills`, sacado de ahí -- ver
  // `_eqRenderMisEstadisticas()` más abajo). El lado opuesto sigue texto
  // plano, sin cambios.
  var labelMirlxs = p.rol === 'Quindes' ? '<span>Mirlxs</span>' : '<span class="eq-mis-stats-rol-pill">Mirlxs</span>';
  var labelQuindes = p.rol === 'Quindes' ? '<span class="eq-mis-stats-rol-pill">Quindes</span>' : '<span>Quindes</span>';
  var rankHtml = necesitaEquipoClub ? '' :
    '<div class="eq-rank-wrap">' +
      '<div class="eq-rank-labels">' + labelMirlxs + labelQuindes + '</div>' +
      '<div class="eq-rank-track"><div class="eq-rank-fill" style="width:' + (p.termometro_pct || 0) + '%;"></div></div>' +
      '<div class="eq-rank-texto">' + _eqEsc(_eqRankTexto(p)) + '</div>' +
    '</div>';
  var rachaPuntos = Number(p.puntosRacha) || 0;
  var rachaBadgeHtml = rachaPuntos > 0
    ? '<span class="eq-stat-combo-racha-badge" onclick="event.stopPropagation();' + _eqDesgloseOnclick(p.username, 'racha', 'Puntos por racha') + '"><span class="material-symbols-rounded">local_fire_department</span>+' + rachaPuntos + '</span>'
    : '';
  // Divisor "Datos anuales" (pedido explícito) -- mismo estilo/clases
  // exactas que el separador "Puntos" de más abajo (`.eq-mis-stats-puntos-row`/
  // `.eq-grupo-linea`/`.eq-grupo-nombre`), sin el pill de total (acá no hay
  // un valor único que resumir, son 2 cards distintas debajo).
  return '<div class="eq-mis-stats-puntos-row">' +
      '<span class="eq-grupo-linea"></span>' +
      '<span class="eq-grupo-nombre">Datos anuales</span>' +
      '<span class="eq-grupo-linea"></span>' +
    '</div>' +
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">roller_skating</span><div class="eq-stat-valor">' + statsCalc.horas + 'h</div><div class="eq-stat-label">Horas patinadas</div></div>' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">kid_star</span><div class="eq-stat-valor">' + statsCalc.asistenciaPct + '%</div><div class="eq-stat-label">Asistencia anual</div></div>' +
    '</div>' +
    '<div class="eq-mis-stats-puntos-row">' +
      '<span class="eq-grupo-linea"></span>' +
      '<span class="eq-grupo-nombre">Puntos</span>' +
      '<span class="eq-mis-stats-total-pill">' + (p.puntosTotal !== undefined && p.puntosTotal !== null ? p.puntosTotal : '—') + '</span>' +
      '<span class="eq-grupo-linea"></span>' +
    '</div>' +
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card eq-stat-card--tappable" onclick="' + _eqDesgloseOnclick(p.username, 'tareas', 'Puntos por tareas') + '"><span class="eq-stat-icon material-symbols-rounded">task_alt</span><div class="eq-stat-valor">' + (p.puntosTareas !== undefined && p.puntosTareas !== null ? p.puntosTareas : '—') + '</div><div class="eq-stat-label">Puntos por tareas</div></div>' +
      '<div class="eq-stat-card eq-stat-card--combo eq-stat-card--tappable" onclick="' + _eqDesgloseOnclick(p.username, 'asistencia', 'Puntos por asistencia') + '">' +
        '<div class="eq-stat-combo-iconos"><span class="material-symbols-rounded">sports</span></div>' +
        '<div class="eq-stat-combo-valor-row">' +
          '<span class="eq-stat-valor">' + (p.puntosAsistencia !== undefined && p.puntosAsistencia !== null ? p.puntosAsistencia : '—') + '</span>' +
          rachaBadgeHtml +
        '</div>' +
        '<div class="eq-stat-label">Asistencia</div>' +
      '</div>' +
    '</div>' +
    rankHtml;
}

function _eqToggleGrupo(rol) {
  // `.replace(/\s+/g, '-')` (Batch 4) -- antes solo `.toLowerCase()`, suficiente
  // mientras los únicos 2 valores reales eran "Quindes"/"Mirlxs" (una sola
  // palabra). Los acordeones por rol (`_eqRenderPorRol()`, más abajo)
  // reusan esta misma función con nombres como "No definido" -- sin este
  // slug, el id generado tendría un espacio literal adentro.
  var key = rol.toLowerCase().replace(/\s+/g, '-');
  var header = document.getElementById('eq-grupo-' + key + '-header');
  var body = document.getElementById('eq-grupo-' + key + '-body');
  if (!header || !body) return;
  var abrir = !header.classList.contains('abierto');
  header.classList.toggle('abierto', abrir);
  body.classList.toggle('abierto', abrir);
  // Bug real corregido (Batch 3, "Lista de Mirlxs truncada") -- la clase
  // `.abierto` (css/equipo.css) fijaba `max-height:2000px`, un techo FIJO
  // que un grupo con más miembros (Mirlxs, típicamente el grupo más grande)
  // podía superar en alto real, recortando el resto de la lista sin scroll
  // ni aviso -- nunca hubo ningún `slice()`/límite en JS, era 100% este
  // techo de CSS. Medido con `scrollHeight` real (mismo criterio que ya usa
  // "Mi Liga" para sus propios acordeones, ver comentario de cabecera de
  // este archivo) en vez de una constante -- crece con la lista real, sin
  // techo. El inline (`style.maxHeight`) siempre gana sobre la clase CSS,
  // así que la declaración vieja en `css/equipo.css` queda sin uso -- se
  // sacó de ahí (ver ese archivo).
  // Reescrito (Batch 9, ver MANIFEST.md -- mismo diagnóstico de
  // `_eqRenderGrupo()`/`_eqRenderPorRol()` de arriba, "acordeones
  // colapsados"): esta función SÍ necesita animar (a diferencia del primer
  // render, acá el click ya está pasando con la pantalla visible, `scrollHeight`
  // nunca da 0), pero ninguno de los 2 extremos puede ser la palabra clave
  // `none` -- CSS no puede interpolar una `transition` entre `none` y un
  // valor en píxeles, el cambio se aplicaría de golpe, sin animación.
  // Al abrir: arranca la transición real con `scrollHeight`px (valor
  // concreto, anima 0→alto real) y, recién cuando esa transición ya
  // terminó, se suelta a `'none'` -- así, si el contenido cambia después
  // mientras sigue abierto (buscar, filtrar), el acordeón no vuelve a
  // quedar corto por un `max-height` numérico desactualizado (mismo
  // problema que ya resolvía `_eqRenderGrupo()` recalculando, ahora
  // innecesario una vez que llega a `none`). `setTimeout(...,400)` -- 400,
  // no menos: tiene que ser >= la duración real de la `transition` de
  // `.eq-grupo-body` (css/equipo.css, `0.4s` = 400ms) para no cortarla a
  // mitad de camino; si ese `0.4s` cambia algún día, este número tiene que
  // moverse junto. Al cerrar: el `max-height` actual puede ser YA `'none'`
  // (si se abrió hace rato y se asentó) -- para animar el cierre hace falta
  // primero "aterrizarlo" en un valor concreto (`scrollHeight`px, la altura
  // real actual, sin cambiar nada visualmente) y RECIÉN en el frame
  // siguiente bajarlo a `0px`, para que la `transition` tenga 2 valores
  // numéricos reales entre los que interpolar -- doble `requestAnimationFrame`
  // (mismo truco ya usado en `_eqRenderPerfil()`, más abajo en este
  // archivo, y en `abrirContacto()`/js/ui.js) para forzar que el navegador
  // pinte el valor "aterrizado" en un frame antes de cambiarlo de nuevo, si
  // no el navegador colapsa los 2 cambios en un solo frame y tampoco anima.
  if (abrir) {
    body.style.maxHeight = body.scrollHeight + 'px';
    var t = body;
    setTimeout(function() { t.style.maxHeight = 'none'; }, 400);
  } else {
    body.style.maxHeight = body.scrollHeight + 'px';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { body.style.maxHeight = '0px'; });
    });
  }
}

/* ── Headers sticky apilados (rediseño REAL, ver MANIFEST.md/CHANGELOG.md
   -- "los sticky headers deben apilarse, no reemplazarse") -- los 5 headers
   de sección (Favoritos/Quindes/Mirlxs/Inactivos/Lesionadxs,
   `.eq-grupo-header.eq-grupo-header--sticky` en index.html, ver ese
   modificador en css/equipo.css -- NUNCA fusionado a `.eq-grupo-header` a
   secas, que también generan al vuelo los acordeones de "por rol",
   `_eqRenderPorRol()` más arriba, y esos no deben volverse sticky) se
   apilan uno debajo del otro a medida que el usuario scrollea, y SIGUEN
   apilados aunque su propia sección ya haya pasado del todo -- solo
   desaparecen del stack al scrollear de vuelta hacia arriba, por encima de
   su posición original en el DOM.
   Bug real corregido (ver MANIFEST.md -- "cuando aparece un nuevo sticky
   header el anterior desaparece"): la 1ra versión de esta feature usaba
   `position:sticky` nativo -- pero cada header vive dentro de su propio
   `.eq-grupo`/`#eq-favoritos-wrap`, y un `position:sticky` SOLO puede
   quedar pegado mientras su propio contenedor (el ancestro de layout más
   cercano) todavía tiene alto por scrollear debajo; en cuanto esa sección
   entera termina de pasar, el navegador lo suelta y sigue de largo con el
   resto del scroll -- funciona perfecto DENTRO de la propia sección (por
   eso nunca se notaba ahí), pero es estructuralmente incapaz de mantener
   un header pegado más allá de los límites de su propia sección:
   exactamente "aparece Mirlxs, desaparece Quindes" en vez de acumularse.
   Fix: ya no se usa `position:sticky` -- `_eqActualizarStickyHeaders()`
   ahora maneja el pegado A MANO, alternando cada header entre 2 modos
   (clase `.eq-grupo-header--stuck`, css/equipo.css):
   - NATURAL (default): el header vive en flujo normal, sin `position`
     propio -- comportamiento de toda la vida, tap colapsa/expande.
   - STUCK (`position:fixed`, `top`/`left`/`width` inline): flota pegado
     arriba en CUALQUIER punto del scroll posterior a su sección, sin
     depender de los límites de su `.eq-grupo` -- tap hace scroll-to.
   Cada header, recorrido en orden de DOM (Favoritos→Quindes→Mirlxs→
   Inactivos→Lesionadxs), pasa a STUCK cuando `window.scrollY` supera su
   propio umbral (posición natural menos el alto acumulado de los headers
   YA decididos STUCK antes que él en ESTA MISMA pasada) -- puro JS,
   recalculado en cada evento de `scroll` de la página (throttled por
   `requestAnimationFrame`, ver `_eqActualizarStickyHeadersThrottled()` más
   abajo) más los mismos triggers de siempre (resize,
   `_eqActualizarListaVacia()`, abrir/cerrar los 2 paneles de la nav). Como
   el recorrido va sumando el alto de los headers YA stuck en la misma
   pasada, el apilado (top dinámico = suma de los stuck anteriores) sale
   solo, sin nada especial por header.
   `position:fixed` saca al header del flujo del documento -- sin
   compensar, el resto del contenido (su propio body + todo lo que sigue)
   saltaría hacia arriba el alto exacto del header apenas se vuelve stuck.
   `.eq-grupo-header-spacer` (nuevo, un `<div>` vacío justo ANTES de cada
   header en index.html, dentro del mismo `.eq-grupo`/`#eq-favoritos-wrap`
   -- así `display:none` en el grupo sigue ocultando spacer+header juntos
   sin JS extra) es quien compensa: `0px` mientras el header está NATURAL
   (no hace falta, el header ya reserva su propio lugar),
   `header.offsetHeight`px mientras está STUCK (el header ya no aporta nada
   al flujo, el spacer aporta exactamente lo mismo que aportaba antes --
   alto total sin cambios, cero salto visual). El spacer sirve ADEMÁS como
   referencia ESTABLE de la posición "natural" de cada header
   (`spacer.offsetTop`) -- a diferencia del header, que una vez
   `position:fixed` ya no tiene una posición de flujo real que leer con
   `.offsetTop`, el spacer JAMÁS deja el flujo normal, así que su
   `offsetTop` siempre refleja bien dónde arrancaría su sección, sin
   importar el estado (natural/stuck) de NINGÚN header, incluido él mismo
   (por el "alto total sin cambios" de arriba, el offsetTop de cada spacer
   tampoco se mueve cuando otro header anterior pasa de natural a stuck o
   viceversa).
   `left`/`width` del header STUCK se toman de
   `#eq-lista-contenido.getBoundingClientRect()` (mismo ancho de contenido
   que ya tenía en flujo normal -- ni `.eq-grupo` ni `#eq-lista-contenido`
   tienen padding propio, ver css/equipo.css) -- recalculados en cada
   pasada, así que un `resize`/rotación de pantalla los mantiene al día
   solos, sin listener aparte.
   `#eq-favoritos-wrap`'s `overflow:hidden` permanente (ver
   `_eqMostrarSeccionFavoritos()`/`_eqOcultarSeccionFavoritos()`, más
   arriba en este archivo) sigue siendo necesario con este mecanismo nuevo
   -- un `overflow`≠`visible` en un ancestro recorta a CUALQUIER
   descendiente `position:fixed` durante el pintado (no solo a
   `position:sticky`, mismo problema, otra causa) -- por eso ese wrap lo
   sigue relajando a `visible` recién una vez asentado abierto.
   `header.parentElement.offsetParent === null` (el header sigue siendo
   hijo real de su `.eq-grupo` en el DOM aunque esté `position:fixed` --
   eso nunca lo desconecta del árbol, solo cambia cómo se pinta) detecta
   secciones ocultas (grupo sin resultados, Lesionadxs sin nadie
   lesionadx, o `#s-equipo` no activa) -- se lee del PADRE, no del propio
   header, porque un header `position:fixed` SIEMPRE da
   `offsetParent === null` así esté perfectamente visible (por spec,
   ningún elemento `fixed` tiene offsetParent), así que ese chequeo en el
   header mismo ya no serviría para detectar "oculto". */
var _EQ_GRUPO_HEADERS = ['eq-favoritos-header', 'eq-grupo-quindes-header', 'eq-grupo-mirlxs-header', 'eq-grupo-inactivos-header', 'eq-grupo-lesionadxs-header'];
// Umbral de `window.scrollY` a partir del cual cada header pasa a STUCK --
// recalculado en cada pasada de `_eqActualizarStickyHeaders()`, reusado
// por `_eqScrollAlGrupo()` (destino del scroll suave al tocar un header
// stuck) sin tener que re-derivarlo ahí.
var _eqHeaderUmbral = {};
function _eqActualizarStickyHeaders() {
  var navEl = document.getElementById('eq-sticky-header');
  var acumulado = navEl ? navEl.offsetHeight : 0;
  var listaEl = document.getElementById('eq-lista-contenido');
  var rectLista = listaEl ? listaEl.getBoundingClientRect() : null;
  var scrollY = window.scrollY;
  _EQ_GRUPO_HEADERS.forEach(function(id) {
    var header = document.getElementById(id);
    if (!header) return;
    var spacer = document.getElementById(id + '-spacer');
    var grupo = header.parentElement;
    if (!grupo || grupo.offsetParent === null) {
      header.classList.remove('eq-grupo-header--stuck');
      header.style.position = ''; header.style.top = ''; header.style.left = ''; header.style.width = '';
      if (spacer) spacer.style.height = '0px';
      return;
    }
    var offsetNatural = spacer ? spacer.offsetTop : header.offsetTop;
    var umbral = offsetNatural - acumulado;
    _eqHeaderUmbral[id] = umbral;
    if (scrollY > umbral) {
      header.classList.add('eq-grupo-header--stuck');
      header.style.position = 'fixed';
      header.style.top = acumulado + 'px';
      if (rectLista) { header.style.left = rectLista.left + 'px'; header.style.width = rectLista.width + 'px'; }
      if (spacer) spacer.style.height = header.offsetHeight + 'px';
      acumulado += header.offsetHeight;
    } else {
      header.classList.remove('eq-grupo-header--stuck');
      header.style.position = ''; header.style.top = ''; header.style.left = ''; header.style.width = '';
      if (spacer) spacer.style.height = '0px';
    }
  });
}
window.addEventListener('resize', _eqActualizarStickyHeaders);
// Throttle por `requestAnimationFrame` -- usado tanto por el listener de
// `scroll` de abajo (nuevo: el pegado ahora es 100% manejado a mano, así
// que necesita reaccionar a CUALQUIER scroll de la página, no solo al
// arrastre en vivo del panel "Mis estadísticas") como por el drag de
// `_eqInicializarCierrePanelesPorScroll()` (bug real corregido antes, ver
// MANIFEST.md -- "header sticky del acordeón se superpone sobre los
// nombres") -- en ambos casos evita forzar `offsetHeight`/
// `getBoundingClientRect()` (layout) en cada evento crudo, una sola vez
// por frame de pantalla.
var _eqStickyHeadersRafPendiente = false;
function _eqActualizarStickyHeadersThrottled() {
  if (_eqStickyHeadersRafPendiente) return;
  _eqStickyHeadersRafPendiente = true;
  requestAnimationFrame(function() {
    _eqStickyHeadersRafPendiente = false;
    _eqActualizarStickyHeaders();
  });
}
window.addEventListener('scroll', _eqActualizarStickyHeadersThrottled, { passive: true });

/* Comportamiento dual al tocar un header (ver MANIFEST.md): con el pegado
   ahora manejado a mano (arriba), el estado STUCK/NATURAL de cada header
   ya no hay que derivarlo con matemática de scroll -- `.eq-grupo-header--stuck`
   (clase que `_eqActualizarStickyHeaders()` pone/saca en cada pasada) ES
   la fuente de verdad, ya la tenemos. Header STUCK -> tap hace scroll
   suave hasta `_eqHeaderUmbral[headerId]` (el mismo `scrollY` que
   `_eqActualizarStickyHeaders()` usó para decidir que este header entra en
   modo stuck) -- el listener de `scroll` de arriba corre en cada frame del
   scroll suave, así que el header vuelve a NATURAL en vivo, a mitad de
   camino de la animación, apenas `scrollY` cruza ese umbral de nuevo hacia
   abajo (`scrollY > umbral`, `>` estricto -- aterrizar EXACTO en el umbral
   cae del lado NATURAL, así un 2do tap justo después de un scroll-to ya
   expande/contrae en vez de quedar en un limbo). Header NATURAL -> tap
   llama `_eqToggleGrupo(rol)` tal cual (comportamiento de siempre) si
   `rol` no es null -- nunca se llega acá con el header stuck (el `if` de
   abajo corta antes), así que colapsar/expandir el acordeón mientras está
   pegado arriba es imposible por construcción, no por un chequeo aparte. */
function _eqHeaderEstaSticky(header) {
  return header.classList.contains('eq-grupo-header--stuck');
}
function _eqScrollAlGrupo(header) {
  var umbral = _eqHeaderUmbral[header.id];
  window.scrollTo({ top: umbral || 0, behavior: 'smooth' });
}
// `rol` null para Favoritos/Lesionadxs -- no colapsables, nunca pasan por
// `_eqToggleGrupo()` (ver ese comentario más arriba): "comportamiento
// actual" en modo natural para esos 2 es no hacer nada, mismo que tenían
// antes de sumar este handler, así que acá simplemente no llama a nada.
function _eqGrupoHeaderTap(headerId, rol) {
  var header = document.getElementById(headerId);
  if (!header) return;
  if (_eqHeaderEstaSticky(header)) { _eqScrollAlGrupo(header); return; }
  if (rol) _eqToggleGrupo(rol);
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
  // Bug real corregido (Batch 3, "botón de favoritos en detalle no muestra
  // estado activo") -- `.app-nav-icon-btn` (css/nav.css) no tiene NINGÚN
  // color propio de estado, a diferencia de `.eq-fav-btn.activo` (color:
  // `--brand`) que sí usan las filas de lista -- acá el único indicador
  // real era el glyph (`favorite`/`favorite_border`), un cambio de forma
  // mucho más sutil que el color naranja de la lista, fácil de no notar.
  // `eq-nav-fav-btn` (nueva, css/equipo.css) + `.activo` condicional -- NO
  // se reusa `.eq-fav-btn` tal cual (esa clase trae su propio tamaño/forma
  // circular, pisaría el cuadrado de `.app-nav-icon-btn`), solo el color.
  // Re-auditado (ver MANIFEST.md -- "corazón de favoritos no cambia
  // visualmente"): selector real del botón en el detalle es
  // `button.app-nav-icon-btn.eq-nav-fav-btn[data-eq-fav]`, con `.activo`
  // agregada acá mismo según `fav` (calculado arriba, `_eqEsFavorito(p.id)`
  // -- SÍ nace en estado activo si la persona ya es favorita, no depende de
  // ningún evento de click). `.eq-nav-fav-btn.activo { color: var(--brand); }`
  // (css/equipo.css) es la única regla que le toca el color a esta clase --
  // sin conflicto de cascada real: `css/nav.css` (carga ANTES que
  // css/equipo.css en index.html) no define ningún `.app-nav-icon-btn.activo`
  // ni usa `!important` que pudiera ganarle. `_eqToggleFavorito()` llama a
  // `_eqActualizarBotonesFavorito(id, fav)` en cada toggle, que hace
  // `document.querySelectorAll('[data-eq-fav="'+id+'"]')` y togglea
  // `.activo` + el glyph ahí mismo -- este botón de nav queda incluido
  // (mismo atributo `data-eq-fav`). Código verificado correcto extremo a
  // extremo -- no se encontró ningún bug real acá; si seguía sin verse en
  // producción, la causa más probable es `equipo.js`/`equipo.css` servidos
  // desde una copia vieja cacheada por Fastly (ver "Cache-busting" en
  // MANIFEST.md -- estos 2 archivos NO estaban en `CACHEBUST_FILES` hasta
  // este mismo commit, fix aparte, ver ese archivo).
  var acciones = '<button type="button" class="app-nav-icon-btn eq-nav-fav-btn' + (fav ? ' activo' : '') + '" data-eq-fav="' + p.id + '" onclick="_eqToggleFavorito(\'' + p.id + '\')" title="' + (fav ? 'Quitar de favoritos' : 'Agregar a favoritos') + '"><span class="material-symbols-outlined">' + (fav ? 'favorite' : 'favorite_border') + '</span></button>';
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

// "Puntos por racha" -- línea del desglose de estadísticas (feat nueva, ver
// MANIFEST.md/CHANGELOG.md -- "el total de puntos no cierra con el
// desglose mostrado"): `p.puntosRacha` (getEquipo(), suma de
// `puntos_bonificacion` + `puntos_extra` del período pedido -- ver el
// comentario grande en supabase/functions/api/index.ts, junto a
// `puntosPeriodoPorUsuario`, para el porqué de sumar 2 columnas reales
// distintas bajo un solo concepto) faltaba como línea propia -- sin ella,
// "Puntos por tareas" + "Puntos por asistencia" nunca sumaban lo mismo que
// "Puntos totales" para alguien con bonus de racha ese período. Oculta del
// todo si `puntosRacha` es `0`/`undefined`/`null` (pedido explícito: nunca
// mostrar "0 pts por racha") -- a diferencia de tareas/asistencia (arriba
// en los 2 renders que la usan), que siempre se muestran con `'—'` de
// fallback si el dato no llegó; acá el criterio es otro, "sin racha no hay
// línea", no "sin dato togavía". `emoji_events` (trofeo, Material Symbols)
// -- pedido explícito "estrella/trofeo", distinto del resto de íconos ya
// usados en este desglose (`task_alt`/`stars`/`military_tech`) para no
// repetir. Reusada por `_eqRenderMisEstadisticas()` y
// `_eqPerfilContenidoHtml()`, más abajo -- mismo criterio que `_eqStatsCalc()`
// de arriba, una sola fórmula para los 2 lugares.
function _eqPuntosRachaHtml(p) {
  var puntos = Number(p.puntosRacha) || 0;
  if (puntos <= 0) return '';
  return '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card eq-stat-card--full eq-stat-card--tappable" onclick="' + _eqDesgloseOnclick(p.username, 'racha', 'Puntos por racha') + '"><span class="eq-stat-icon material-symbols-rounded">emoji_events</span><div class="eq-stat-valor">' + puntos + '</div><div class="eq-stat-label">Puntos por racha</div></div>' +
    '</div>';
}

/* ── Desglose detallado de puntos por concepto (feat nueva, ver
   MANIFEST.md/CHANGELOG.md -- "subpantalla de desglose de puntos por
   concepto") -- tocar cualquiera de las 3 cards de puntos tappables
   (asistencia/tareas/racha, `.eq-stat-card--tappable` arriba y en
   `_eqPerfilContenidoHtml()` más abajo) abre `#eq-desglose-panel`, la
   contraparte "línea por línea" de esos mismos 3 totales -- backend nuevo,
   `getDesglosePuntos`/supabase/functions/api/index.ts, un `concepto` a la
   vez.
   Mecanismo visual "shared axis X" (Material Design 3) -- MISMO criterio
   que `irAjSub()`/`cerrarAjSub()` (js/perfil.js, subsecciones de Ajustes,
   pedido explícito "igual a como se navega a subsecciones en Ajustes"):
   el panel entra desde la derecha (`translateX(100%)->0`,
   `opacity:0.85->1`) mientras la card de la pantalla de ORIGEN retrocede
   levemente (`translateX(0)->-25%`, `opacity:1->0.85`), en simultáneo;
   cerrar invierte ambos. A diferencia de `irAjSub()` (que agrega su propio
   chequeo dedicado -- `if (_ajSubAbierto)` -- al handler GLOBAL de
   `popstate`, js/ui.js) esto usa `_registrarOverlayAbierto()`/
   `_overlayStack` (ui.js), el mecanismo YA genérico para overlays (ver
   MANIFEST.md, "Principios UX" -- "Todo overlay/modal/sheet se cierra vía
   _overlayStack") -- mismo resultado real para el usuario (gesto nativo de
   "atrás" cierra el panel en vez de navegar la pantalla de fondo, un
   `history.pushState` propio por apertura) sin sumar un 2do caso especial
   al handler compartido que hay que mantener sincronizado a mano.
   `_eqCerrarDesglosePuntos(porGesto)` sigue el mismo patrón ya usado por
   `cerrarSheetEvAccion()`/js/eventos.js (mismo overlay stack): sin
   `porGesto` (tap en la flecha atrás propia) hace `history.back()`, que
   dispara un popstate real -- el propio handler de `_overlayStack`
   (ui.js) vuelve a llamar a esta función, ahora SÍ con `porGesto:true`,
   recién ahí anima/oculta de verdad. Evita duplicar la animación de
   cierre en 2 lugares (botón vs. gesto nativo).
   Pantalla de ORIGEN -- puede abrirse desde "Mis estadísticas" (panel
   deslizable dentro de `#s-equipo`) o desde el perfil de detalle
   (`#s-equipo-perfil`) -- cada una con su propia card a retroceder
   (`#eq-lista-card`/`#eq-perfil-card`, index.html) -- `_eqDesgloseCtx`
   guarda cuál para que `_eqCerrarDesglosePuntos()` sepa a cuál devolverle
   la posición neutra, sin asumir siempre la misma. */
var _EQ_DESGLOSE_ICONOS = { asistencia: 'stars', tareas: 'task_alt', racha: 'emoji_events' };
var _EQ_DESGLOSE_VACIO_TXT = {
  asistencia: 'No hay asistencias registradas en este período.',
  tareas: 'No hay tareas completadas en este período.',
  racha: 'No hay bonos de racha en este período.'
};
// `username` es dato real (nombre_usuario), no un literal controlado --
// se escapa para no romper el string JS de una sola comilla dentro del
// atributo `onclick="..."` (mismo criterio ya usado por
// `rol.replace(/'/g, "\\'")` en `_eqRenderPorRol()`, más arriba en este
// archivo) + `&quot;` por si acaso, para el delimitador del atributo HTML
// en sí. `concepto`/`titulo` sí son literales fijos, pasados tal cual por
// cada caller -- nunca dato de usuario.
function _eqDesgloseOnclick(username, concepto, titulo) {
  var u = String(username || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return "_eqAbrirDesglosePuntos('" + u + "', '" + concepto + "', '" + titulo + "')";
}
function _eqAbrirDesglosePuntos(nombreUsuario, concepto, titulo) {
  var panel = document.getElementById('eq-desglose-panel');
  var tituloEl = document.getElementById('eq-desglose-titulo');
  var lista = document.getElementById('eq-desglose-lista');
  if (!panel || !lista) return;
  if (tituloEl) tituloEl.textContent = titulo;
  var perfilEl = document.getElementById('s-equipo-perfil');
  var fondoId = (perfilEl && perfilEl.classList.contains('activa')) ? 'eq-perfil-card' : 'eq-lista-card';
  _eqDesgloseCtx = { fondoId: fondoId };
  var fondo = document.getElementById(fondoId);
  lista.innerHTML = '<p class="eq-loading">Cargando...</p>';
  // Por si quedó a mitad de una animación de salida (reapertura rápida) --
  // mismo criterio que `irAjSub()`: limpia el inline para arrancar desde
  // el estado de reposo real de la clase (sin `.activa`: `translateX(100%)`/
  // `opacity:0.85`), no desde un valor a medio camino.
  panel.style.transform = '';
  panel.style.opacity = '';
  panel.classList.add('activa');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      panel.style.transform = 'translateX(0)';
      panel.style.opacity = '1';
      if (fondo) { fondo.style.transform = 'translateX(-25%)'; fondo.style.opacity = '0.85'; }
    });
  });
  _registrarOverlayAbierto(_eqCerrarDesglosePuntos);
  var mostrarError = function() { lista.innerHTML = '<p class="eq-error">No se pudo cargar el desglose.</p>'; };
  // Bonificación de racha dentro del desglose de asistencia (feat nueva,
  // ver MANIFEST.md/CHANGELOG.md -- "mostrar bonificaciones de racha en el
  // mismo desglose") -- `getDesglosePuntos()` no tiene un modo "combinado"
  // (cada `concepto` es una consulta propia, ver supabase/functions/api/index.ts)
  // así que acá se piden los 2 en paralelo y se combinan recién al
  // renderizar (`_eqRenderDesgloseAsistenciaConRacha()`, más abajo) --
  // nunca se bloquean entre sí, cualquiera de los 2 puede resolver primero.
  if (concepto === 'asistencia') {
    var pendientes = { asistencia: null, racha: null };
    var intentarRenderizar = function() {
      if (pendientes.asistencia === null || pendientes.racha === null) return;
      if (pendientes.asistencia === false) { mostrarError(); return; }
      _eqRenderDesgloseAsistenciaConRacha(pendientes.asistencia, pendientes.racha);
    };
    api(_eqDesglosePuntosParams(nombreUsuario, 'asistencia'), function(res) {
      pendientes.asistencia = (res && res.exito !== false) ? res : false;
      intentarRenderizar();
    }, function() { pendientes.asistencia = false; intentarRenderizar(); });
    api(_eqDesglosePuntosParams(nombreUsuario, 'racha'), function(res) {
      // Sin bloquear el desglose de asistencia por un error puntual acá --
      // si la racha falla, simplemente no se muestra esa sección (mismo
      // criterio que "ocultar si viene vacío", punto 2 del pedido).
      pendientes.racha = (res && res.exito !== false) ? res : { filas: [], total: 0 };
      intentarRenderizar();
    }, function() { pendientes.racha = { filas: [], total: 0 }; intentarRenderizar(); });
    return;
  }
  api(_eqDesglosePuntosParams(nombreUsuario, concepto), function(res) {
    if (!res || res.exito === false) {
      lista.innerHTML = '<p class="eq-error">' + _eqEsc((res && res.error) || 'No se pudo cargar el desglose.') + '</p>';
      return;
    }
    _eqRenderDesglosePuntos(res, concepto);
  }, mostrarError);
}
// Mismos params EXACTOS que `_eqAplicarFiltrosAhora()` arma para
// `getEquipo()` (más arriba en este archivo) -- extraído a helper propio
// (antes inline, duplicado a mano acá abajo desde que `_eqAbrirDesglosePuntos()`
// necesita armar 2 requests en paralelo para `concepto:'asistencia'`, ver
// arriba) en vez de tocar esa otra función ya probada varias veces contra
// producción esta sesión, mismo criterio de riesgo ya documentado en
// supabase/functions/api/index.ts para `_periodoDesdeParams()`.
function _eqDesglosePuntosParams(nombreUsuario, concepto) {
  var params = { action: 'getDesglosePuntos', nombreUsuario: nombreUsuario, concepto: concepto };
  var periodo = _eqFiltroPeriodo;
  if (periodo.modo === 'historico') {
    params.historico = true;
  } else {
    params.mesDesde = periodo.mesDesde; params.anioDesde = periodo.anioDesde;
    params.mesHasta = periodo.mesHasta; params.anioHasta = periodo.anioHasta;
  }
  return params;
}
var _eqDesgloseCtx = null; // { fondoId } -- qué card retroceder al abrir/restaurar al cerrar
function _eqCerrarDesglosePuntos(porGesto) {
  if (!porGesto) { history.back(); return; }
  var panel = document.getElementById('eq-desglose-panel');
  var fondo = _eqDesgloseCtx ? document.getElementById(_eqDesgloseCtx.fondoId) : null;
  if (panel) { panel.style.transform = 'translateX(100%)'; panel.style.opacity = '0.85'; }
  if (fondo) { fondo.style.transform = 'translateX(0)'; fondo.style.opacity = '1'; }
  setTimeout(function() {
    if (panel) { panel.classList.remove('activa'); panel.style.transform = ''; panel.style.opacity = ''; }
    if (fondo) { fondo.style.transform = ''; fondo.style.opacity = ''; }
    _eqDesgloseCtx = null;
  }, 320);
}
// "+1 pt"/"+0.5 pts"/"+2 pts" -- `Math.round(n*10)/10` evita basura de
// punto flotante (ej. 0.1+0.2) antes de decidir singular/plural; los
// únicos valores reales posibles hoy son 0.5/1 (asistencia), enteros
// (tareas, racha) o el `Math.max(x-diasTarde, x/2)` de tareas (puede dar
// cualquier .5), así que 1 decimal alcanza siempre.
function _eqDesglosePuntosTxt(n) {
  var num = Math.round((Number(n) || 0) * 10) / 10;
  return '+' + num + (Math.abs(num) === 1 ? ' pt' : ' pts');
}
// Período mostrado como subtítulo de la lista (pedido explícito: "el
// período mostrado debe respetar el filtro activo") -- mismo criterio de
// lectura de `_eqFiltroPeriodo` que el resto de esta sección, solo texto,
// nada que recalcular.
function _eqDesglosePeriodoTxt() {
  var p = _eqFiltroPeriodo;
  if (p.modo === 'historico') return 'Histórico';
  if (p.mesDesde === p.mesHasta && p.anioDesde === p.anioHasta) return NOMBRES_MESES[p.mesDesde - 1] + ' ' + p.anioDesde;
  return NOMBRES_MESES[p.mesDesde - 1] + ' ' + p.anioDesde + ' – ' + NOMBRES_MESES[p.mesHasta - 1] + ' ' + p.anioHasta;
}
function _eqRenderDesglosePuntos(res, concepto) {
  var lista = document.getElementById('eq-desglose-lista');
  if (!lista) return;
  var filas = res.filas || [];
  var icono = _EQ_DESGLOSE_ICONOS[concepto] || 'military_tech';
  var html = '<p class="eq-desglose-periodo">' + _eqEsc(_eqDesglosePeriodoTxt()) + '</p>';
  if (!filas.length) {
    html += '<div class="eq-favoritos-vacio"><span class="material-symbols-outlined">inbox</span>' + _eqEsc(_EQ_DESGLOSE_VACIO_TXT[concepto] || 'Sin datos en este período.') + '</div>';
    lista.innerHTML = html;
    return;
  }
  html += filas.map(function(f) { return _eqDesgloseFilaHtml(f, concepto, icono); }).join('');
  html += '<div class="eq-desglose-total"><span>Total</span><span class="eq-desglose-total-valor">' + _eqDesglosePuntosTxt(res.total) + '</span></div>';
  lista.innerHTML = html;
}
// Desglose de asistencia + sección "Bonificación por racha" (feat nueva,
// ver MANIFEST.md/CHANGELOG.md -- "mostrar bonificaciones de racha en el
// mismo desglose") -- variante de `_eqRenderDesglosePuntos()` (arriba)
// SOLO para `concepto:'asistencia'`, que recibe los 2 resultados ya
// resueltos (`_eqAbrirDesglosePuntos()`, más arriba) y los pinta como 2
// bloques secuenciales: filas de asistencia normales primero (mismo
// criterio que la función de arriba, empty-state incluido), después --
// SOLO si `resRacha.filas` trae algo, pedido explícito ("ni el header ni
// las filas" si no hay bonificaciones) -- un separador "Bonificación por
// racha" (reusa `.eq-mis-stats-puntos-row`/`.eq-grupo-linea`/`.eq-grupo-nombre`
// tal cual, mismo look que el separador "Puntos" de "Mis estadísticas",
// sin duplicar esas reglas) + las filas de racha con `_eqDesgloseFilaHtml()`
// (mismo formato de fila que asistencia, pedido explícito) pero con ícono
// `local_fire_department` -- distinto del `emoji_events` que usa la vista
// STANDALONE del concepto `'racha'` (`_EQ_DESGLOSE_ICONOS.racha`, sin
// tocar, sigue viva -- se llega ahí tocando el badge de racha de la card
// combinada, `_eqPuntosRachaHtml()`/onclick de `.eq-stat-combo-racha-badge`
// más arriba) -- acá el fuego calza con el mismo ícono que ya usa ese
// badge en la card, más coherente en este contexto puntual. Un "Total"
// propio para la sección de racha, separado del total de asistencia --
// 2 números con distinto significado, nunca mezclados en una sola suma.
function _eqRenderDesgloseAsistenciaConRacha(resAsistencia, resRacha) {
  var lista = document.getElementById('eq-desglose-lista');
  if (!lista) return;
  var filasAsistencia = resAsistencia.filas || [];
  var filasRacha = resRacha.filas || [];
  var html = '<p class="eq-desglose-periodo">' + _eqEsc(_eqDesglosePeriodoTxt()) + '</p>';
  if (!filasAsistencia.length) {
    html += '<div class="eq-favoritos-vacio"><span class="material-symbols-outlined">inbox</span>' + _eqEsc(_EQ_DESGLOSE_VACIO_TXT.asistencia) + '</div>';
  } else {
    html += filasAsistencia.map(function(f) { return _eqDesgloseFilaHtml(f, 'asistencia', _EQ_DESGLOSE_ICONOS.asistencia); }).join('');
    html += '<div class="eq-desglose-total"><span>Total</span><span class="eq-desglose-total-valor">' + _eqDesglosePuntosTxt(resAsistencia.total) + '</span></div>';
  }
  if (filasRacha.length) {
    html += '<div class="eq-mis-stats-puntos-row">' +
        '<span class="eq-grupo-linea"></span>' +
        '<span class="eq-grupo-nombre">Bonificación por racha</span>' +
        '<span class="eq-grupo-linea"></span>' +
      '</div>' +
      filasRacha.map(function(f) { return _eqDesgloseFilaHtml(f, 'racha', 'local_fire_department'); }).join('') +
      '<div class="eq-desglose-total"><span>Total racha</span><span class="eq-desglose-total-valor">' + _eqDesglosePuntosTxt(resRacha.total) + '</span></div>';
  }
  lista.innerHTML = html;
}
// "agosto 2026" -- sin día, para filas que representan un MES entero sin
// fecha real más precisa disponible (racha `legado:true`, reconciliación
// de tareas `reconciliacion:true`, ver comentario grande más abajo) --
// `fecha` en esos casos ya llega como el primer día de ese mes
// (`'YYYY-MM-01'`, getDesglosePuntos()/supabase/functions/api/index.ts),
// nunca un día real -- mostrarlo con `_eqFormatearFechaIngreso()` (que sí
// muestra el día) fingiría una precisión que no existe en el dato.
function _eqDesgloseMesTxt(fechaIso) {
  var partes = fechaIso.split('-');
  return NOMBRES_MESES[Number(partes[1]) - 1] + ' ' + partes[0];
}
// Fila individual -- `fecha` (todos los conceptos) llega `'YYYY-MM-DD'`
// (getDesglosePuntos()/supabase/functions/api/index.ts, ya recortada a
// solo fecha, sin hora) -- reusa `_eqFormatearFechaIngreso()` (más abajo
// en este archivo) para el mismo formato "3 de julio de 2024" que ya usa
// el resto de Equipo, sin inventar un 2do formato de fecha, salvo en las
// filas de mes-entero de arriba (`_eqDesgloseMesTxt()`). `reconciliacion:true`
// (tareas, feat nueva, ver MANIFEST.md/CHANGELOG.md -- "hueco de datos en
// puntos_tareas sin asignaciones_tareas trazables") -- mismo criterio que
// `legado:true` en racha: un mes con más puntos guardados en
// `puntos_mensuales.puntos_tareas` que tareas trazables via
// `asignaciones_tareas` (típico de una importación histórica que solo
// trajo el total mensual) entra como una fila "Otros" por ese mes, en vez
// de dejar que el desglose sume menos que la card de arriba sin ninguna
// explicación.
function _eqDesgloseFilaHtml(f, concepto, icono) {
  var titulo, sub;
  if (concepto === 'asistencia') {
    titulo = f.estado;
    sub = _eqFormatearFechaIngreso(f.fecha);
  } else if (concepto === 'tareas') {
    titulo = f.titulo;
    sub = f.reconciliacion ? _eqDesgloseMesTxt(f.fecha) : _eqFormatearFechaIngreso(f.fecha);
  } else {
    titulo = f.legado ? 'Bono histórico' : '+2 racha';
    sub = f.legado ? _eqDesgloseMesTxt(f.fecha) : _eqFormatearFechaIngreso(f.fecha);
  }
  return '<div class="eq-desglose-fila">' +
      '<span class="eq-desglose-fila-icono"><span class="material-symbols-rounded">' + icono + '</span></span>' +
      '<div class="eq-desglose-fila-info">' +
        '<div class="eq-desglose-fila-titulo">' + _eqEsc(titulo) + '</div>' +
        '<div class="eq-desglose-fila-sub">' + _eqEsc(sub) + '</div>' +
      '</div>' +
      '<div class="eq-desglose-fila-valor">' + _eqDesglosePuntosTxt(f.puntos) + '</div>' +
    '</div>';
}

function _eqRankTexto(p) {
  var esQuindes = p.rol === 'Quindes';
  if (esQuindes) {
    if (p.termometro_pct >= 75) return 'Posición sólida como Quinde';
    if (p.termometro_pct >= 50) return 'Mantén el ritmo';
    return 'Cerca del límite con Mirlxs';
  }
  if (p.termometro_pct >= 75) return 'Muy cerca de ser Quinde';
  if (p.termometro_pct >= 50) return 'Buen progreso hacia Quindes';
  return 'Sigue sumando asistencia';
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
  var acord = header.parentNode;
  var seAbrio = !acord.classList.contains('eq-acord-abierto');
  acord.classList.toggle('eq-acord-abierto');
  // Auto-scroll al abrir (pedido explícito, ver MANIFEST.md) -- espera a
  // que termine la transición de `max-height` de `.eq-acord-cuerpo`
  // (css/equipo.css, 0.3s) antes de medir/scrollear, si no el cálculo de
  // `scrollIntoView` usa la altura vieja (colapsada) y no mueve nada.
  if (seAbrio) {
    setTimeout(function() {
      acord.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 320);
  }
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
  if (!navigator.onLine) { mostrarToast('Sin conexión. No es posible guardar cambios en este momento.', 'error'); return; }
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
  // "Paga cuota"/"Admin" (pedido explícito, re-ajuste, ver MANIFEST.md) --
  // se movieron DENTRO de `.eq-acord-cuerpo` de "Estado" (antes eran 2
  // `.eq-admin-campo--row` propios, siempre visibles) -- al colapsar
  // "Estado" (`eqToggleAcordeon()`, ya existente) ambos toggles se ocultan
  // solos, sin lógica nueva: `.eq-acord-cuerpo` ya colapsa TODO su
  // contenido vía `max-height:0` (css/equipo.css), pasen los toggles a
  // formar parte de él o no. `_eqToggleCuota()`/`_eqToggleAdmin()`/
  // `_eqCambiarEstado()` (más abajo) siguen ubicando estos nodos por id
  // (`#eq-tog-cuota-<id>`/`#eq-tog-admin-<id>`/etc.) -- ningún cambio de
  // lógica, solo de posición en el DOM.
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
          '<div class="eq-admin-campo--row" style="margin-top:14px;">' +
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
          '<div class="eq-admin-campo--row" style="margin-top:14px;">' +
            '<div>' +
              '<p class="eq-tier-label" style="margin-bottom:2px">Admin</p>' +
              '<p class="eq-admin-hint" style="margin:0" id="eq-admin-hint-' + p.id + '">' + (sinEmail ? 'Sin email registrado -- no se puede dar acceso admin.' : 'Tendrá acceso completo al panel de administración (Mi Liga).') + '</p>' +
            '</div>' +
            '<label class="eq-toggle" id="eq-tog-admin-' + p.id + '">' +
              '<input type="checkbox"' + (p.esAdminMiembro ? ' checked' : '') + (sinEmail ? ' disabled' : '') +
                ' onchange="_eqToggleAdmin(\'' + p.id + '\', this.checked, this)">' +
              '<span class="eq-toggle-slider"></span>' +
            '</label>' +
          '</div>' +
          // "Generar link de activación" -- SOLO si todavía no tiene email
          // vinculado (mismo campo/criterio que `sinEmail` arriba, ver
          // MANIFEST.md — activar/): una cuenta con email ya pasó por
          // inscripcion/ o ya se activó, este link no aplica más ahí. Fila
          // propia en vez de acordeón nuevo -- mismo patrón visual que las
          // 2 de arriba (`.eq-admin-campo--row`), pero un botón en vez de
          // un toggle (acción puntual, no un estado persistente).
          (sinEmail ? (
            '<div class="eq-admin-campo--row" style="margin-top:14px;">' +
              '<div>' +
                '<p class="eq-tier-label" style="margin-bottom:2px">Activar cuenta</p>' +
                '<p class="eq-admin-hint" style="margin:0">Genera un link de un solo uso para que vincule su cuenta de Google.</p>' +
              '</div>' +
              '<button type="button" class="btn-text-simple" style="white-space:nowrap;" onclick="_eqGenerarInviteLink(\'' + p.id + '\')">Generar link</button>' +
            '</div>'
          ) : '') +
        '</div>' +
      '</div>' +
    '</div>';
}

// "Activar cuenta" (fila de arriba) -- crea la invitación (Edge Function,
// `generarInviteToken`) y copia el link listo para compartir por WhatsApp/
// donde sea. `p.id` es el username (mismo criterio que el resto de esta
// función). Sin confirmación previa -- generar un link de más no tiene
// costo real (el anterior, si existía, sigue siendo válido hasta que se
// use o expire; no hay límite de 1 vigente por persona).
function _eqGenerarInviteLink(id) {
  if (!navigator.onLine) { mostrarToast('Sin conexión. No es posible generar el link en este momento.', 'error'); return; }
  apiPost({ action: 'generarInviteToken', adminToken: _adminToken, username: id }, function(res) {
    if (!res.exito) { mostrarToast(res.error || 'No se pudo generar el link.', 'error'); return; }
    var url = 'https://app.quindesvolcanicos.com/activar/?token=' + encodeURIComponent(res.token);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() { mostrarToast('¡Link copiado!', 'ok', true); }).catch(function() {
        mostrarToast('No se pudo copiar el link automáticamente: ' + url, 'error');
      });
    } else {
      mostrarToast('No se pudo copiar el link automáticamente: ' + url, 'error');
    }
  }, function(e) {
    mostrarToast(e && e.message ? e.message : 'No se pudo generar el link.', 'error');
  });
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
  if (!navigator.onLine) { mostrarToast('Sin conexión. No es posible guardar cambios en este momento.', 'error'); return; }
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
  if (!navigator.onLine) { mostrarToast('Sin conexión. No es posible guardar cambios en este momento.', 'error'); return; }
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
  // `pronombres` se sacó de acá (pedido explícito, re-ajuste, ver
  // MANIFEST.md) -- se muestra en `categoriaPronombresHtml`, más abajo,
  // junto a la categoría. `pills`/`pillsHtml` quedan solo para `p.roles`
  // (Jammer/Bloqueadora/Capitana/etc, nunca tuvo columna real en `equipo`,
  // auditado en el Cambio 55, ver MANIFEST.md -- `getEquipo()` no lo
  // devuelve, así que este `.forEach` no agrega nada hoy; se deja el guard,
  // no un array hardcodeado, por si Victor agrega esa columna a futuro).
  var pills = [];
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
  // Rol en el equipo (Batch 4, re-ajuste ver MANIFEST.md) -- `_eqRolesTexto()`
  // (arriba en este archivo) da `null` si no hay roles reales guardados (o
  // si el único guardado es "No definido"). Pedido explícito posterior: sin
  // dato, la fila entera se OCULTA (no se muestra un "Rol no definido") --
  // mismo criterio que el resto de `filas` acá (telefono/email/fechaIngreso
  // ya solo se agregan `if` hay dato real). `eq-info-texto-vacio` (color
  // secundario) queda sin ningún consumidor en este archivo tras este
  // cambio, pero se deja viva en css/equipo.css por si un campo futuro
  // vuelve a necesitar ese tratamiento.
  var rolTexto = _eqRolesTexto(p.username);
  if (rolTexto) filas += '<div class="eq-info-fila"><span class="material-symbols-outlined">badge</span><span class="eq-info-texto">' + _eqEsc(rolTexto) + '</span></div>';

  // Sección de stats -- rediseñada como acordeón compacto (pedido explícito,
  // ver MANIFEST.md: "colapsable y más compacta, igual de liviana que el
  // panel Mis estadísticas de la home") -- reusa `.eq-acord`/`.eq-acord-header`/
  // `.eq-acord-cuerpo`/`eqToggleAcordeon()` (mismo mecanismo ya usado por
  // "Categoría"/"Estado" en este mismo perfil, ver `_eqTierAdminHtml()`/
  // `_eqAdminGestionHtml()` más abajo) -- a diferencia de esos 2 (admin-only,
  // colapsados por default), este nace YA abierto (`eq-acord-abierto` en el
  // HTML inicial): es el contenido principal que cualquiera que abre un
  // perfil quiere ver primero, solo colapsable para quien lo prefiera
  // compacto. `.eq-perfil-stats-acord` (css/equipo.css) aplica el mismo
  // achique de `.eq-stat-card`/`.eq-rank-wrap` que ya usa
  // `#eq-misstats-panel-inner` ("Mis estadísticas", scopeado igual, sin
  // duplicar valores). Re-ajuste (pedido explícito, ver MANIFEST.md/CHANGELOG.md
  // -- "mismo layout, clases y estructura HTML que Mis estadísticas"):
  // el contenido real (horas/asistencia + separador PUNTOS + grid
  // tareas/asistencia-combo + termómetro) ahora es `_eqStatsContenidoHtml(p)`
  // (función compartida, ver ese bloque más arriba en este archivo) --
  // antes era una copia a mano de todo ese bloque, con la card de
  // "Puntos totales" separada y las 2 cards de tareas/asistencia sin
  // fusionar (versión vieja de "Mis estadísticas", desactualizada desde
  // el rediseño compacto de esa función). Filtro de período (2 pills
  // Fecha/Histórico, `.eq-periodo-pills`) SACADO (pedido explícito,
  // re-ajuste -- "sin filtros de período en estadísticas del detalle") --
  // reemplazado por una nota de texto chica (`.eq-perfil-stats-nota`,
  // color `var(--muted)`) que aclara que el período viene del filtro
  // global de Equipo (el mismo que ya usa "Mis estadísticas", sin UI
  // propia ahí tampoco) -- `_eqFiltroPeriodoModo()` sigue sincronizando
  // TODAS las instancias de `.eq-periodo-pills` que queden en el DOM
  // (panel de Filtros de la lista, la única que sobrevive), sin romperse
  // por esta menos.
  // Bug real corregido (pedido explícito) -- "expandido por defecto solo en
  // la vista propia de la home de Equipo": este acordeón nacía SIEMPRE
  // abierto (`eq-acord-abierto` hardcodeado) sin importar de quién sea el
  // perfil -- esta función es la vista de DETALLE (roster -> tocar a
  // alguien), un componente distinto de "Mis estadísticas"
  // (`_eqRenderMisEstadisticas()`, arriba en este archivo, el único lugar
  // con expandido-por-defecto real). Ahora nace colapsado, igual que
  // Categoría/Estado (`_eqTierAdminHtml()`/`_eqAdminGestionHtml()`, mismo
  // mecanismo `.eq-acord`/`eqToggleAcordeon()`).
  var statsAcordHtml = '<div class="eq-acord eq-perfil-stats-acord">' +
      '<div class="eq-acord-header" onclick="eqToggleAcordeon(this)">' +
        '<p class="eq-tier-label" style="margin:0">Estadísticas</p>' +
        '<span class="eq-acord-icono"><span class="material-symbols-rounded">chevron_right</span></span>' +
      '</div>' +
      '<div class="eq-acord-cuerpo">' +
        '<p class="eq-perfil-stats-nota">Los resultados se basan en los filtros aplicados en Equipo.</p>' +
        _eqStatsContenidoHtml(p) +
      '</div>' +
    '</div>';
  // Categoría (Quindes/Mirlxs) + pronombres, misma fila, justo debajo del
  // nombre (pedido explícito, re-ajuste, ver MANIFEST.md) -- la categoría
  // vivía como `.eq-rol-pill` superpuesta bajo la foto (ver comentario en
  // css/equipo.css); pronombres vivía mezclado con `roles` (ver `pills`/
  // `pillsHtml` más arriba, todavía usado para `roles`, que nunca tuvo
  // dato real -- ver ese comentario) en `.eq-perfil-pills-row` de abajo.
  // Reusa `.eq-mis-stats-rol-pill` (misma pill de categoría que "Mis
  // estadísticas", css/equipo.css) para la categoría -- pronombres sigue
  // en `.aj-pill`, mismo look genérico de siempre. Re-ajuste posterior
  // (pedido explícito, ver MANIFEST.md/CHANGELOG.md -- "mismo tamaño,
  // padding y font-size que el pill de pronombres"): `.eq-mis-stats-rol-pill`
  // en este contexto puntual (`.eq-perfil-pills-row--top`, css/equipo.css)
  // pisa su propio padding/font-size/radius con los mismos valores EXACTOS
  // de `.aj-pill` (perfil.css) -- sin tocar la declaración base (la de la
  // nav de "Mis estadísticas" sigue chica, sin este pedido).
  var categoriaPronombresHtml = '<div class="eq-perfil-pills-row eq-perfil-pills-row--top">' +
    '<span class="eq-mis-stats-rol-pill">' + _eqEsc(p.rol) + '</span>' +
    (p.pronombres ? '<span class="aj-pill">' + _eqEsc(p.pronombres) + '</span>' : '') +
  '</div>';
  return '<div class="eq-perfil-header">' +
      '<div class="eq-avatar-wrap">' +
        _eqAvatarHtml(p, 'eq-avatar-grande') +
        _eqTendenciaBadgeHtml(p, 'eq-tendencia-badge--detalle') +
      '</div>' +
      '<div class="eq-perfil-nombre">' + _eqEsc(p.nombreDerby) + '</div>' +
      categoriaPronombresHtml +
      '<div class="eq-perfil-sub">' + ((p.numeroDerby !== null && p.numeroDerby !== undefined && p.numeroDerby !== '') ? '#' + p.numeroDerby + ' &bull; ' : '') + '@' + _eqEsc(p.username) + '</div>' +
    '</div>' +
    (pillsHtml ? '<div class="eq-perfil-pills-row">' + pillsHtml + '</div>' : '') +
    // Orden re-ajustado (pedido explícito, "los datos de contacto deben
    // aparecer siempre ANTES de cualquier desplegable") -- `filas` (datos
    // personales con ícono: teléfono/email/fecha de ingreso/rol) pasa a
    // ser lo PRIMERO después del header, antes de los 3 acordeones
    // (Estadísticas/Categoría/Estado). Orden anterior (ver "Cambios
    // recientes" de una ronda previa, ya sin vigencia): Estadísticas ->
    // Categoría -> `filas` -> Estado.
    (filas ? '<div class="eq-info-lista">' + filas + '</div>' : '') +
    statsAcordHtml +
    _eqTierAdminHtml(p) +
    _eqAdminGestionHtml(p);
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
}
