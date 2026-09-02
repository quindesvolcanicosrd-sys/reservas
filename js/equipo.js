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
    return;
  }
  wrap.style.maxHeight = wrap.scrollHeight + 'px'; // aterriza en el alto real (pudo estar en 'none') antes de animar a 0
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
  if (!_eqYaInicializado) _eqInit();
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
  });
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
// Ícono Material `keyboard_arrow_up`/`_down` (pedido explícito -- ya NO
// `keyboard_double_arrow_*`, cambio de ícono sin cambiar el resto de la
// lógica/estilo). Vacío si `tendencia` es `null` -- ver `_eqAvatarConTendenciaHtml()`
// justo abajo, que decide si hace falta el wrapper `position:relative`.
// `claseTamano` opcional (pedido explícito, re-ajuste de tamaño): sin
// pasarla, el badge queda en el tamaño base 18px (usado hoy solo en "Mis
// estadísticas", sin pedido de agrandarlo ahí) -- `'eq-tendencia-badge--card'`
// (22px, filas de lista) o `'eq-tendencia-badge--detalle'` (28px, perfil de
// detalle, foto mucho más grande) la agrandan, ver css/equipo.css.
function _eqTendenciaBadgeHtml(p, claseTamano) {
  if (p.tendencia !== 'sube' && p.tendencia !== 'baja') return '';
  return '<span class="eq-tendencia-badge eq-tendencia-badge-' + p.tendencia + (claseTamano ? ' ' + claseTamano : '') + '">' +
    '<span class="material-symbols-outlined">keyboard_arrow_' + (p.tendencia === 'sube' ? 'up' : 'down') + '</span></span>';
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
  if (_eqPanelAbierto === tag) { _eqCerrarPanel(tag); return; }
  if (_eqPanelAbierto) _eqCerrarPanel(_eqPanelAbierto);
  _eqAbrirPanel(tag);
}
function _eqAbrirPanel(tag) {
  var cfg = _EQ_PANELES[tag];
  var panel = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (!panel || !btn) return;
  _eqPanelAbierto = tag;
  panel.classList.add('abierta');
  panel.style.maxHeight = panel.scrollHeight + 'px';
  btn.classList.add('activo');
  if (tag === 'busqueda') {
    setTimeout(function() { var inp = document.getElementById('eq-search-input'); if (inp) inp.focus(); }, 50);
  }
}
function _eqCerrarPanel(tag) {
  var cfg = _EQ_PANELES[tag];
  var panel = document.getElementById(cfg.el);
  var btn = document.getElementById(cfg.btn);
  if (_eqPanelAbierto === tag) _eqPanelAbierto = null;
  if (panel) {
    panel.style.maxHeight = panel.scrollHeight + 'px';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        panel.classList.remove('abierta');
        panel.style.maxHeight = '0px';
      });
    });
  }
  if (btn) btn.classList.remove('activo');
}

// Estado del período de puntaje -- default mes/año actuales (mismo
// comportamiento que getEquipo() sin parámetros). `modo`: 'mes' | 'rango' |
// 'historico'. Los 4 campos de rango/mes único conviven siempre en el
// objeto (no se borran al cambiar de modo) para no perder la selección si
// el usuario va y vuelve entre pestañas del panel.
var _eqFiltroPeriodo = (function() {
  var hoy = new Date();
  var m = hoy.getMonth() + 1, a = hoy.getFullYear();
  return { modo: 'mes', mesUnico: m, anioUnico: a, mesDesde: m, anioDesde: a, mesHasta: m, anioHasta: a };
})();
var _EQ_MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
var _eqFiltroRoles = [];

// Modo de período (rediseño, ver MANIFEST.md -- "eliminar botón Aplicar
// filtros: los filtros se aplican automáticamente al seleccionar cada
// opción"): 'historico' aplica directo (sin datos que elegir) y es
// toggleable (tocarlo YA activo lo desactiva y vuelve al default, mes
// actual -- "para resetear, el usuario deselecciona los pills", pedido
// explícito). 'mes'/'rango' SIEMPRE abren su modal de calendario al
// tocarlos (`_eqAbrirModalMes()`/`_eqAbrirModalRango()`, más abajo) --
// **no** son toggleables del mismo modo: bug real encontrado con
// Playwright en una versión anterior de esta función -- "Mes" arranca
// `activa` por default (mes actual ya aplicado sin que el usuario haga
// nada), así que tratarlo como toggleable hacía que el PRIMER tap en
// "Mes" (para elegir OTRO mes) se leyera como "ya está activo, desactivar"
// en vez de "abrir la modal". El filtro real de mes/rango recién se aplica
// al confirmar la modal correspondiente, nunca al tocar el pill.
function _eqFiltroPeriodoModo(modo) {
  if (modo === 'historico') {
    var pillHist = document.querySelector('.eq-periodo-pills .aj-pill[data-modo="historico"]');
    if (pillHist && pillHist.classList.contains('activa')) {
      var hoy = new Date();
      _eqFiltroPeriodo.modo = 'mes';
      _eqFiltroPeriodo.mesUnico = hoy.getMonth() + 1;
      _eqFiltroPeriodo.anioUnico = hoy.getFullYear();
      document.querySelectorAll('.eq-periodo-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
      _eqAplicarFiltrosAhora();
      return;
    }
  }
  _eqFiltroPeriodo.modo = modo;
  // `.eq-periodo-pills` (no `#eq-filtro-periodo-modo` a secas) -- feat
  // nueva, filtro de período también en el perfil de detalle (ver
  // MANIFEST.md/`_eqPerfilContenidoHtml()` más abajo): hay 2 instancias
  // posibles de esta fila de pills en el DOM a la vez (panel de Filtros de
  // la home + acordeón "Estadísticas" del perfil, si está abierto), ambas
  // comparten esta clase -- togglear 'activa' desde CUALQUIERA de las 2
  // mantiene a la otra en sync, sin importar cuál disparó el click.
  document.querySelectorAll('.eq-periodo-pills .aj-pill').forEach(function(p) {
    p.classList.toggle('activa', p.getAttribute('data-modo') === modo);
  });
  if (modo === 'historico') _eqAplicarFiltrosAhora();
  else if (modo === 'mes') _eqAbrirModalMes();
  else if (modo === 'rango') _eqAbrirModalRango();
}

/* ── Modal "Elige el mes" (rediseño, ver MANIFEST.md -- reemplaza la
   modal anterior de año+12 pills genéricas) -- header de navegación por
   AÑO (`‹ 2025 ›`, `.ev-ant-cal-nav*`/css/eventos.css, reusado tal cual --
   pedido explícito de "mismo header, mismos estilos, mismo fondo" que la
   modal de Rango, más abajo) + los 12 meses como pills
   (`.ev-ant-mes-grid`/`.ev-ant-mes-cell`, MISMA grilla que ya usaba
   "asistencia anticipada → Por meses", `_evAntRenderMesesGrid()`/
   js/eventos.js -- acá sin la restricción de "mes ya pasado"/cuota al día
   de esa función, que no aplica al filtro histórico de Equipo: cualquier
   mes, pasado o futuro, es un período válido para filtrar puntos).
   Single-select (un mes a la vez, no varios) -- `_eqFiltroPeriodo.mesUnico`/
   `anioUnico` son un único par, mismo contrato que siempre tuvo el modo
   'mes' de `getEquipo()` (supabase/functions/api/index.ts): un pill grid
   multi-seleccionable no tendría a dónde mapear una selección de varios
   meses sin cambiar ese contrato, fuera de alcance de esta feature (solo
   UI). Markup real en index.html (`#eq-modal-mes-overlay`/
   `#eq-modal-mes-sheet`) -- mismo componente `.bsheet-overlay`/`.bsheet`
   estándar que el resto de sheets de la app (`_datLesionAbrirSheet()`/
   js/perfil.js), mismo criterio de apertura/cierre. */
var _eqCalMes = { anio: null, mesSel: null, anioSel: null };
function _eqAbrirModalMes() {
  var hoy = new Date();
  _eqCalMes.anio = _eqFiltroPeriodo.anioUnico || hoy.getFullYear();
  _eqCalMes.mesSel = _eqFiltroPeriodo.mesUnico || null;
  _eqCalMes.anioSel = _eqFiltroPeriodo.mesUnico ? _eqFiltroPeriodo.anioUnico : null;
  _eqRenderModalMes();
  var ov = document.getElementById('eq-modal-mes-overlay');
  var sh = document.getElementById('eq-modal-mes-sheet');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
}
function _eqCerrarModalMes() {
  var ov = document.getElementById('eq-modal-mes-overlay');
  var sh = document.getElementById('eq-modal-mes-sheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() {
    if (sh) sh.style.display = 'none';
    if (ov) ov.style.display = 'none';
  }, 350);
}
function _eqCalMesAnio(delta) {
  _eqCalMes.anio += delta;
  _eqRenderModalMes();
}
function _eqRenderModalMes() {
  var label = document.getElementById('eq-modal-mes-anio-label');
  if (label) label.textContent = String(_eqCalMes.anio);
  var cont = document.getElementById('eq-modal-mes-grid');
  if (!cont) return;
  cont.innerHTML = _EQ_MESES_CORTOS.map(function(nombre, i) {
    var mesNum = i + 1;
    var activo = _eqCalMes.mesSel === mesNum && _eqCalMes.anioSel === _eqCalMes.anio;
    return '<button type="button" class="ev-ant-mes-cell' + (activo ? ' activo' : '') + '" onclick="_eqTocarMesModal(' + mesNum + ')">' + nombre + '</button>';
  }).join('');
}
function _eqTocarMesModal(mesNum) {
  _eqCalMes.mesSel = mesNum;
  _eqCalMes.anioSel = _eqCalMes.anio;
  _eqRenderModalMes();
}
function _eqConfirmarModalMes() {
  if (!_eqCalMes.mesSel || !_eqCalMes.anioSel) { _eqCerrarModalMes(); return; }
  _eqFiltroPeriodo.modo = 'mes';
  _eqFiltroPeriodo.mesUnico = _eqCalMes.mesSel;
  _eqFiltroPeriodo.anioUnico = _eqCalMes.anioSel;
  _eqCerrarModalMes();
  _eqAplicarFiltrosAhora();
}

/* ── Modal "Elige el rango" (rediseño, ver MANIFEST.md -- reemplaza la
   modal anterior de 2 bloques año+12 pills "Desde"/"Hasta") -- pedido
   explícito: "reusar/adaptar el calendario de asistencia anticipada
   (grilla de días con selección de rango de inicio y fin)" + "selector de
   año en el encabezado... de modo que el usuario pueda seleccionar un
   rango que cruce años". Una grilla de un solo mes con nav mes-a-mes (como
   `_evAntCalRender()`, js/eventos.js) no alcanza para eso sin 12 clicks de
   "mes siguiente" por cada año de diferencia -- en vez de eso, esta
   modal muestra los 12 MESES COMPLETOS del año elegido a la vez (12
   mini-calendarios apilados, `.eq-cal-mini*`/css/equipo.css -- la MISMA
   grilla `.ev-cal-grid`/`.ev-cal-celda`/`.ev-cal-num` de siempre, escalada
   chica para que las 12 quepan en una sola modal con scroll), con el
   header navegando por AÑO -- tocar cualquier día de cualquier mes fija
   inicio/fin del rango, y cruzar a otro año es tan simple como tocar
   `›`/`‹` y tocar el otro extremo ahí. Mismo mecanismo "ida y vuelta" que
   `_evAntCalTocarDia()` (primer toque fija Desde y limpia Hasta; un toque
   posterior -- fecha >= Desde -- fija Hasta; uno anterior a Desde reemplaza
   Desde) pero SIN el guard de "fecha pasada"/cuota de esa función -- no
   aplican acá: el filtro de Equipo es sobre puntos ya guardados, un rango
   íntegramente en el pasado es el caso de uso normal, no una excepción a
   bloquear. El día tocado exacto es solo el mecanismo de selección visual
   -- lo que de verdad importa para `getEquipo()` es el MES+AÑO de ese día
   (`params.mesDesde`/`anioDesde`/`mesHasta`/`anioHasta`, granularidad real
   del filtro, ver supabase/functions/api/index.ts) -- por eso el resumen
   de abajo muestra "Marzo 2025", no "15/3/2025": el día en sí nunca viajó
   al backend, mostrarlo sugeriría una precisión que el filtro no tiene. */
var _eqCalRango = { anio: null, desde: null, hasta: null };
function _eqAbrirModalRango() {
  _eqCalRango.anio = _eqFiltroPeriodo.anioDesde || new Date().getFullYear();
  _eqCalRango.desde = (_eqFiltroPeriodo.mesDesde && _eqFiltroPeriodo.anioDesde)
    ? _eqFiltroPeriodo.anioDesde + '-' + String(_eqFiltroPeriodo.mesDesde).padStart(2, '0') + '-01' : null;
  _eqCalRango.hasta = (_eqFiltroPeriodo.mesHasta && _eqFiltroPeriodo.anioHasta)
    ? _eqFiltroPeriodo.anioHasta + '-' + String(_eqFiltroPeriodo.mesHasta).padStart(2, '0') + '-01' : null;
  _eqRenderModalRango();
  var ov = document.getElementById('eq-modal-rango-overlay');
  var sh = document.getElementById('eq-modal-rango-sheet');
  if (!ov || !sh) return;
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
}
function _eqCerrarModalRango() {
  var ov = document.getElementById('eq-modal-rango-overlay');
  var sh = document.getElementById('eq-modal-rango-sheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() {
    if (sh) sh.style.display = 'none';
    if (ov) ov.style.display = 'none';
  }, 350);
}
function _eqCalRangoAnio(delta) {
  _eqCalRango.anio += delta;
  _eqRenderModalRango();
}
// Un mini-calendario (mes `mesIdx`, 0-indexado, del año `anio`) -- mismo
// algoritmo de grilla que `_evAntCalRender()`/js/eventos.js (lunes de la
// semana del día 1, hasta el domingo de la semana del último día del mes),
// mismas clases (`.ev-cal-grid`/`.ev-cal-celda`/`.ev-cal-num`/`.ev-ajeno`/
// `.ev-ant-cal-sel`/`.ev-ant-cal-en-rango`/`.ev-ant-cal-hoy`). Celdas
// "ajenas" (día de OTRO mes, relleno de grilla) sin onclick a propósito --
// ese mismo día ya es tocable en SU mini-calendario real, más abajo o más
// arriba en la lista de los 12; dejarlo clickeable acá también sería un
// 2do camino redundante hacia el mismo resultado.
function _eqCalMiniHtml(anio, mesIdx) {
  var inicioGrid = _evLunesDeSemana(new Date(anio, mesIdx, 1));
  var finMes = new Date(anio, mesIdx + 1, 0);
  var finGrid = _evLunesDeSemana(finMes);
  finGrid.setDate(finGrid.getDate() + 6);
  var desde = _eqCalRango.desde, hasta = _eqCalRango.hasta;
  var hoy = _evHoyISO();
  var html = '<div class="eq-cal-mini-titulo">' + _EQ_MESES_CORTOS[mesIdx] + '</div><div class="ev-cal-grid eq-cal-mini-grid">';
  var cur = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate());
  while (cur <= finGrid) {
    var celdaIso = _evToISO(cur);
    var ajeno = cur.getMonth() !== mesIdx;
    var clases = 'ev-cal-celda' + (ajeno ? ' ev-ajeno' : '');
    var onclickAttr = '';
    if (!ajeno) {
      if (desde && celdaIso === desde) clases += ' ev-ant-cal-sel';
      if (hasta && celdaIso === hasta) clases += ' ev-ant-cal-sel';
      if (desde && hasta && _evFechaCmp(celdaIso, desde) > 0 && _evFechaCmp(celdaIso, hasta) < 0) clases += ' ev-ant-cal-en-rango';
      if (celdaIso === hoy) clases += ' ev-ant-cal-hoy';
      onclickAttr = ' onclick="_eqTocarDiaRangoModal(\'' + celdaIso + '\')"';
    }
    html += '<div class="' + clases + '"' + onclickAttr + '><div class="ev-cal-num">' + cur.getDate() + '</div></div>';
    cur.setDate(cur.getDate() + 1);
  }
  html += '</div>';
  return '<div class="eq-cal-mini">' + html + '</div>';
}
function _eqRenderModalRango() {
  var label = document.getElementById('eq-modal-rango-anio-label');
  if (label) label.textContent = String(_eqCalRango.anio);
  var cont = document.getElementById('eq-modal-rango-meses');
  if (cont) {
    var html = '';
    for (var m = 0; m < 12; m++) html += _eqCalMiniHtml(_eqCalRango.anio, m);
    cont.innerHTML = html;
  }
  _eqCalRangoActualizarResumen();
}
// Ida y vuelta -- mismo criterio que `_evAntCalTocarDia()`/js/eventos.js
// para 'periodo' (ver comentario grande de arriba, "Modal 'Elige el
// rango'"), sin el guard de fecha pasada/cuota que esa función sí tiene.
function _eqTocarDiaRangoModal(iso) {
  var desde = _eqCalRango.desde, hasta = _eqCalRango.hasta;
  if (!desde || hasta) {
    _eqCalRango.desde = iso;
    _eqCalRango.hasta = null;
  } else if (_evFechaCmp(iso, desde) < 0) {
    _eqCalRango.desde = iso;
  } else {
    _eqCalRango.hasta = iso;
  }
  _eqRenderModalRango();
}
// "Marzo 2025" en vez de "15/3/2025" -- ver el comentario grande de
// "Modal 'Elige el rango'" más arriba: el día tocado es solo el mecanismo
// de selección, `getEquipo()` nunca recibe un día real, así que mostrarlo
// sugeriría una precisión que el filtro no tiene.
function _eqFechaCortaModal(iso) {
  var p = iso.split('-');
  return NOMBRES_MESES[parseInt(p[1], 10) - 1] + ' ' + p[0];
}
function _eqCalRangoActualizarResumen() {
  var cont = document.getElementById('eq-modal-rango-resumen');
  var btn = document.getElementById('eq-modal-rango-btn-restablecer');
  if (!cont) return;
  var desde = _eqCalRango.desde, hasta = _eqCalRango.hasta;
  if (!desde) {
    cont.innerHTML = '<span class="ev-ant-rango-vacio">Toca un día para empezar</span>';
    if (btn) btn.style.display = 'none';
    return;
  }
  var html = 'Del ' + _eqEsc(_eqFechaCortaModal(desde));
  if (hasta) html += ' al ' + _eqEsc(_eqFechaCortaModal(hasta));
  cont.innerHTML = html;
  if (btn) btn.style.display = '';
}
function _eqCalRangoRestablecer() {
  _eqCalRango.desde = null;
  _eqCalRango.hasta = null;
  _eqRenderModalRango();
}
function _eqConfirmarModalRango() {
  if (!_eqCalRango.desde) { _eqCerrarModalRango(); return; }
  var desdeParts = _eqCalRango.desde.split('-');
  var hastaIso = _eqCalRango.hasta || _eqCalRango.desde;
  var hastaParts = hastaIso.split('-');
  _eqFiltroPeriodo.modo = 'rango';
  _eqFiltroPeriodo.mesDesde = parseInt(desdeParts[1], 10);
  _eqFiltroPeriodo.anioDesde = parseInt(desdeParts[0], 10);
  _eqFiltroPeriodo.mesHasta = parseInt(hastaParts[1], 10);
  _eqFiltroPeriodo.anioHasta = parseInt(hastaParts[0], 10);
  _eqCerrarModalRango();
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
// `_eqFiltroPeriodoModo('historico')` (directo), `_eqConfirmarModalMes()`/
// `_eqConfirmarModalRango()` (al confirmar la modal de calendario
// correspondiente), y el toggle-off del pill de histórico (vuelve al
// default, arriba). Sin spinner de botón propio -- ya no hay botón que
// deshabilitar.
function _eqAplicarFiltrosAhora() {
  var p = _eqFiltroPeriodo;
  var params = { action: 'getEquipo' };
  if (p.modo === 'historico') {
    params.historico = true;
  } else if (p.modo === 'rango') {
    params.mesDesde = p.mesDesde; params.anioDesde = p.anioDesde;
    params.mesHasta = p.mesHasta; params.anioHasta = p.anioHasta;
  } else {
    params.mes = p.mesUnico; params.anio = p.anioUnico;
  }
  api(params, function(res) {
    _eqPersonas = (res && res.personas) || [];
    _eqCargado = true;
    _eqCerrarPanel('busqueda');
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
function _eqRenderFavoritos() {
  var wrap = document.getElementById('eq-favoritos-wrap');
  var cont = document.getElementById('eq-favoritos-lista');
  var pillEl = document.getElementById('eq-favoritos-pill');
  if (!wrap || !cont) return;
  var todas = _eqFavoritos().map(_eqPersonaPorId).filter(function(p) { return !!p && !_eqEsUsuarioActual(p) && !_eqEsInactivo(p); }).filter(_eqPasaFiltroRol);
  var visibles = _eqBusqueda ? todas.filter(_eqPasaBusqueda) : todas;
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
  var body = wrap.querySelector('.eq-grupo-body');
  if (body) body.style.maxHeight = 'none';
  _eqHidratarAvatares();
}

function _eqRenderGrupo(rol) {
  var key = rol.toLowerCase();
  var wrap = document.getElementById('eq-grupo-' + key);
  var cont = document.getElementById('eq-grupo-' + key + '-lista');
  var pillEl = document.getElementById('eq-grupo-' + key + '-pill');
  if (!wrap || !cont) return;
  var filtradas = _eqPersonas.filter(function(p) { return p.rol === rol; }).filter(function(p) { return !_eqEsUsuarioActual(p) && !_eqEsInactivo(p); }).filter(_eqPasaBusqueda).filter(_eqPasaFiltroRol);
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
  var filtradas = _eqPersonas.filter(function(p) { return _eqEsInactivo(p) && !_eqEsUsuarioActual(p); }).filter(_eqPasaBusqueda).filter(_eqPasaFiltroRol);
  wrap.style.display = filtradas.length ? '' : 'none';
  if (pillEl) pillEl.textContent = filtradas.length;
  cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
  _eqHidratarAvatares();
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
  var filtradas = _eqPersonas.filter(function(p) { return p.estado === 'Lesionadx' && !_eqEsUsuarioActual(p); }).filter(_eqPasaBusqueda).filter(_eqPasaFiltroRol);
  wrap.style.display = filtradas.length ? '' : 'none';
  if (pillEl) pillEl.textContent = filtradas.length;
  cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
  var body = wrap.querySelector('.eq-grupo-body');
  if (body) body.style.maxHeight = 'none';
  _eqHidratarAvatares();
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
  var statsCalc = _eqStatsCalc(persona);
  var estadoTexto = persona.estado === 'Lesionadx' ? 'Lesionadx' : persona.estado === 'Activx' ? 'Activo' : 'Inactivo';
  var estadoClase = persona.estado === 'Lesionadx' ? 'dat-estado-lesion' : persona.estado === 'Activx' ? 'dat-estado-activo' : 'dat-estado-inactivo';
  // Termómetro solo con equipo propio -- mismo bug real/mismo criterio ya
  // corregido en `_eqPerfilContenidoHtml()`/`_datosRenderStatsHtml()`
  // (js/perfil.js): `necesitaPatines`/`necesitaProtecciones` (getEquipo())
  // son el equivalente real a "usa equipo del club".
  var necesitaEquipoClub = !!(persona.necesitaPatines || persona.necesitaProtecciones);
  var rankHtml = necesitaEquipoClub ? '' :
    '<div class="eq-rank-wrap">' +
      '<div class="eq-rank-labels"><span>Mirlxs</span><span>Quindes</span></div>' +
      '<div class="eq-rank-track"><div class="eq-rank-fill" style="width:' + (persona.termometro_pct || 0) + '%;"></div></div>' +
      '<div class="eq-rank-texto">' + _eqEsc(_eqRankTexto(persona)) + '</div>' +
    '</div>';
  cont.innerHTML =
    '<div class="eq-mis-stats-header">' +
      '<div class="eq-mis-stats-info">' +
        // Pill de categoría + pill de estado en la misma fila (pedido
        // explícito) -- antes `rol` era texto pelado (`.eq-mis-stats-nombre`)
        // arriba del chip de estado, apilados. `.eq-mis-stats-rol-pill`
        // nueva, mismas métricas de caja que `.dat-estado-chip` (padding/
        // radius/font, css/perfil.css) para que ambas pills midan igual,
        // pero con el color de marca (no un color de estado -- no es un
        // estado, es la categoría/tier).
        '<div class="eq-mis-stats-pills">' +
          '<span class="eq-mis-stats-rol-pill">' + _eqEsc(persona.rol) + '</span>' +
          '<span class="dat-estado-chip ' + estadoClase + '">' + estadoTexto + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">roller_skating</span><div class="eq-stat-valor">' + statsCalc.horas + 'h</div><div class="eq-stat-label">Horas patinadas</div></div>' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">kid_star</span><div class="eq-stat-valor">' + statsCalc.asistenciaPct + '%</div><div class="eq-stat-label">Asistencia anual</div></div>' +
    '</div>' +
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">task_alt</span><div class="eq-stat-valor">' + (persona.puntosTareas !== undefined && persona.puntosTareas !== null ? persona.puntosTareas : '—') + '</div><div class="eq-stat-label">Puntos por tareas (mes)</div></div>' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">stars</span><div class="eq-stat-valor">' + (persona.puntosAsistencia !== undefined && persona.puntosAsistencia !== null ? persona.puntosAsistencia : '—') + '</div><div class="eq-stat-label">Puntos por asistencia (mes)</div></div>' +
    '</div>' +
    // Total del período pedido (`puntosTotal`, getEquipo()) -- en modo
    // histórico ya viene con `equipo.puntos_anteriores` sumado adentro
    // (ver supabase/functions/api/index.ts), sin nada que recalcular acá.
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card eq-stat-card--full"><span class="eq-stat-icon material-symbols-rounded">military_tech</span><div class="eq-stat-valor">' + (persona.puntosTotal !== undefined && persona.puntosTotal !== null ? persona.puntosTotal : '—') + '</div><div class="eq-stat-label">' + _eqEsc(_eqFiltroPeriodo.modo === 'historico' ? 'Puntos totales (histórico)' : 'Puntos totales') + '</div></div>' +
    '</div>' +
    rankHtml;
  _eqHidratarAvatares();
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
        '</div>' +
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

  var statsCalc = _eqStatsCalc(p);
  var puntosTareasTxt = (p.puntosTareas !== undefined && p.puntosTareas !== null) ? p.puntosTareas : '—';
  var puntosAsistenciaTxt = (p.puntosAsistencia !== undefined && p.puntosAsistencia !== null) ? p.puntosAsistencia : '—';
  // Puntos totales del período pedido (getEquipo(), `puntosTotal`) -- en
  // modo histórico ya viene con `equipo.puntos_anteriores` sumado adentro
  // (ver supabase/functions/api/index.ts), así que basta con pintar el
  // campo tal cual, sin volver a sumar nada acá. Card propia, span completo
  // (`eq-stat-card--full`, css/equipo.css) en vez de compartir grid de a 2
  // con tareas/asistencia -- es un total, no un dato del mismo nivel.
  var puntosTotalTxt = (p.puntosTotal !== undefined && p.puntosTotal !== null) ? p.puntosTotal : '—';
  var puntosTotalLabel = _eqFiltroPeriodo.modo === 'historico' ? 'Puntos totales (histórico)' : 'Puntos totales';
  var puntosTotalHtml = '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card eq-stat-card--full"><span class="eq-stat-icon material-symbols-rounded">military_tech</span><div class="eq-stat-valor">' + puntosTotalTxt + '</div><div class="eq-stat-label">' + _eqEsc(puntosTotalLabel) + '</div></div>' +
    '</div>';
  // Termómetro solo con equipo propio (bug real, ver MANIFEST.md): oculto
  // por completo si la persona necesita patines o protecciones del club
  // (`necesitaPatines`/`necesitaProtecciones`, `getEquipo()` -- equivalente
  // real al "necesita_equipo_club" del pedido, ver ese comentario en
  // supabase/functions/api/index.ts). `_eqRenderPerfil()` (más abajo) ya
  // guarda con `if (rankWrap)`/`if (fill)` antes de tocar este bloque, así
  // que no renderizarlo acá no rompe nada ahí.
  var necesitaEquipoClub = !!(p.necesitaPatines || p.necesitaProtecciones);
  var rankWrapHtml = necesitaEquipoClub ? '' :
    '<div class="eq-rank-wrap">' +
      '<div class="eq-rank-labels"><span>Mirlxs</span><span>Quindes</span></div>' +
      '<div class="eq-rank-track"><div class="eq-rank-fill" id="eq-rank-fill" style="width:0%;"></div></div>' +
      '<div class="eq-rank-texto">' + _eqEsc(_eqRankTexto(p)) + '</div>' +
    '</div>';
  // Filtro de período (feat nueva, ver MANIFEST.md -- "igual al filtro de
  // período que existe en la home de Equipo") -- MISMAS 3 pills
  // (Mes/Rango/Histórico) y MISMOS handlers (`_eqFiltroPeriodoModo()`,
  // que abre las mismas 2 modales globales `#eq-modal-mes-*`/
  // `#eq-modal-rango-*` de siempre) que el panel de Filtros de la lista --
  // sin duplicar la lógica, solo una 2da instancia de la fila de pills,
  // identificada por la clase compartida `.eq-periodo-pills` (no un id
  // único: `_eqFiltroPeriodoModo()` ahora sincroniza TODAS las instancias
  // en el DOM a la vez, ver ese comentario más arriba en este archivo).
  // Confirmar la modal (o tocar "Histórico") dispara `_eqAplicarFiltrosAhora()`,
  // que re-pide `getEquipo()` con el período nuevo y, si hay un perfil de
  // detalle abierto, lo vuelve a renderizar completo con los stats de ese
  // período -- mismo mecanismo ya usado por la lista, extendido acá.
  var periodoPillsHtml = '<div class="eq-perfil-stats-periodo">' +
      '<p class="eq-tier-label" style="margin:0 0 6px">Período</p>' +
      '<div class="aj-pills-row eq-periodo-pills">' +
        '<span class="aj-pill' + (_eqFiltroPeriodo.modo === 'mes' ? ' activa' : '') + '" data-modo="mes" onclick="_eqFiltroPeriodoModo(\'mes\')">Mes</span>' +
        '<span class="aj-pill' + (_eqFiltroPeriodo.modo === 'rango' ? ' activa' : '') + '" data-modo="rango" onclick="_eqFiltroPeriodoModo(\'rango\')">Rango</span>' +
        '<span class="aj-pill' + (_eqFiltroPeriodo.modo === 'historico' ? ' activa' : '') + '" data-modo="historico" onclick="_eqFiltroPeriodoModo(\'historico\')">Histórico</span>' +
      '</div>' +
    '</div>';
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
  // duplicar valores).
  var statsAcordHtml = '<div class="eq-acord eq-perfil-stats-acord eq-acord-abierto">' +
      '<div class="eq-acord-header" onclick="eqToggleAcordeon(this)">' +
        '<p class="eq-tier-label" style="margin:0">Estadísticas</p>' +
        '<span class="eq-acord-icono"><span class="material-symbols-rounded">chevron_right</span></span>' +
      '</div>' +
      '<div class="eq-acord-cuerpo">' +
        periodoPillsHtml +
        '<div class="eq-stats-grid">' +
          '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">roller_skating</span><div class="eq-stat-valor">' + statsCalc.horas + 'h</div><div class="eq-stat-label">Horas patinadas</div></div>' +
          '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">kid_star</span><div class="eq-stat-valor">' + statsCalc.asistenciaPct + '%</div><div class="eq-stat-label">Asistencia anual</div></div>' +
        '</div>' +
        '<div class="eq-stats-grid">' +
          '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">task_alt</span><div class="eq-stat-valor">' + puntosTareasTxt + '</div><div class="eq-stat-label">Puntos por tareas</div></div>' +
          '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">stars</span><div class="eq-stat-valor">' + puntosAsistenciaTxt + '</div><div class="eq-stat-label">Puntos por asistencia</div></div>' +
        '</div>' +
        puntosTotalHtml +
        rankWrapHtml +
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
  // en `.aj-pill`, mismo look genérico de siempre.
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
    statsAcordHtml +
    (filas ? '<div class="eq-info-lista">' + filas + '</div>' : '') +
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
