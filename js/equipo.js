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
// Anima la altura de #eq-favoritos-lista entre el estado antes/después de
// `mutar()` (Bug 3 -- "cards vecinas saltan sin animación al cambiar
// favorito"): sin esto, insertar/sacar una fila cambia la altura real del
// contenedor de golpe en el mismo frame, empujando todo lo que sigue en el
// flujo normal del documento (`#eq-grupo-quindes`/etc., ver index.html --
// van justo debajo, sin posicionamiento propio). Mismo patrón lock-old-
// height/mutar/medir-scrollHeight/rAF-a-nuevo-alto ya usado para los
// acordeones `.eq-grupo-body` (ver css/equipo.css -- "Acordeones animados
// con max-height" en MANIFEST.md), adaptado a `height` (acá SÍ hace falta
// volver a un valor numérico al final, a diferencia del acordeón, porque
// el contenido de esta lista sigue cambiando con cada toggle -- dejarla en
// `'auto'` explícito evita que un toggle futuro anime desde un `px` viejo
// desactualizado).
function _eqAnimarAlturaFavoritos(cont, mutar) {
  var alturaVieja = cont.offsetHeight;
  cont.style.height = alturaVieja + 'px';
  cont.style.overflow = 'hidden';
  mutar();
  var alturaNueva = cont.scrollHeight;
  cont.style.transition = 'height 0.25s ease';
  requestAnimationFrame(function() {
    cont.style.height = alturaNueva + 'px';
  });
  setTimeout(function() {
    cont.style.height = 'auto';
    cont.style.overflow = '';
    cont.style.transition = '';
  }, 260);
}

// Fade-out del empty state ("Agrega personas a favoritos...") ANTES de
// reemplazarlo (Bug 3, fix específico -- el recuadro desaparecía de golpe
// al agregar el primer favorito, pese a que `_eqAnimarAlturaFavoritos()`
// ya anima la altura del contenedor: esa animación cubre el ALTO del
// contenedor, pero el `.eq-favoritos-vacio` en sí se borraba del DOM sin
// transición propia dentro del mismo `mutar()`, así que el texto pegaba
// un salto seco un instante antes de que la altura empezara a interpolar).
// Si no hay empty state visible (ya hay >=1 favorito), corre `cb` directo
// -- caso normal, sin este delay extra.
function _eqFadeVacioFavoritosYLuego(cont, cb) {
  var vacio = cont.querySelector('.eq-favoritos-vacio');
  if (!vacio) { cb(); return; }
  vacio.style.transition = 'opacity 0.18s';
  vacio.style.opacity = '0';
  setTimeout(cb, 180);
}

function _eqAnimarCambioFavorito(id, fav) {
  var wrap = document.getElementById('eq-favoritos-wrap');
  var cont = document.getElementById('eq-favoritos-lista');
  if (!wrap || !cont) return;
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
      _eqFadeVacioFavoritosYLuego(cont, function() {
        _eqAnimarAlturaFavoritos(cont, function() {
          var vacio = cont.querySelector('.eq-favoritos-vacio');
          if (vacio) vacio.remove();
          var tmp = document.createElement('div');
          tmp.innerHTML = _eqFilaHtml(persona);
          var filaNueva = tmp.firstChild;
          filaNueva.classList.add('eq-fila-fade');
          filaNueva.style.opacity = '0';
          cont.insertBefore(filaNueva, cont.firstChild);
          wrap.style.display = '';
          _eqHidratarAvatares();
          void filaNueva.offsetWidth;
          filaNueva.style.opacity = '1';
        });
      });
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
      _eqAnimarAlturaFavoritos(cont, function() {
        filaExistente.remove();
        if (!cont.children.length) {
          // Fade-in del empty state nuevo (Bug 3, fix específico -- mismo
          // criterio inverso al fade-out de _eqFadeVacioFavoritosYLuego():
          // sin esto, el recuadro aparecía de golpe en el mismo frame en
          // que la altura del contenedor termina de encogerse).
          cont.innerHTML = '<div class="eq-favoritos-vacio" style="opacity:0"><span class="material-symbols-outlined">favorite</span>Agrega personas a favoritos para verlos aquí</div>';
          var vacioNuevo = cont.querySelector('.eq-favoritos-vacio');
          vacioNuevo.style.transition = 'opacity 0.2s';
          void vacioNuevo.offsetWidth;
          vacioNuevo.style.opacity = '1';
        }
      });
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
  // No depende del roster real (Batch 4) -- arranca ya, aunque el fetch de
  // abajo todavía no resolvió.
  _eqSugerenciasIniciar();
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
    _eqRenderInactivos();
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

// Fila de stats inline (Batch 4) -- `pointer-events:none` propio de cada
// pieza (clases de abajo, css/equipo.css) para que el click siempre
// propague a `.eq-miembro-fila` (abre el detalle), pedido explícito -- en
// los hechos ya pasaría igual por burbujeo normal (son `<span>` sin
// comportamiento propio), pero se deja explícito tal como se pidió.
function _eqStatsInlineHtml(p) {
  var statsCalc = _eqStatsCalc(p);
  var html = '';
  // Horas/asistencia -- `horas_ano`/`total_eventos_ano` (getEquipo(), Cambio
  // 58) SIEMPRE vienen en el objeto real (default 0 si no hay datos) -- el
  // chequeo cubre el caso teórico de un objeto en memoria sin esos campos
  // (no ocurre con el backend actual, ver supabase/functions/api/index.ts).
  if (p.horas_ano !== undefined && p.horas_ano !== null) {
    html += '<span class="eq-mini-stat"><span class="material-symbols-rounded">roller_skating</span>' + statsCalc.horas + 'hs</span>';
  }
  if (p.total_eventos_ano !== undefined && p.total_eventos_ano !== null) {
    html += '<span class="eq-mini-stat"><span class="material-symbols-rounded">kid_star</span>' + statsCalc.asistenciaPct + '%</span>';
  }
  // Puntos por tareas/asistencia (re-auditado, ver MANIFEST.md -- "puntos
  // no aparecen"). **Campos reales que devuelve `getEquipo()` hoy, uno por
  // uno (confirmado leyendo el `.select()`/el `.map()` de esa función en
  // supabase/functions/api/index.ts, no supuesto):** `id`/`nombre`/`username`,
  // `nombreDerby`, `numeroDerby`, `fotoPerfil`, `rol`, `pronombres`,
  // `prefijo`, `telefono`, `email`, `fechaIngreso`, `estado`,
  // `solicitudLesionPendiente`, `tierModo`, `exentaCuota`, `esAdminMiembro`,
  // `horas_ano`, `asistencias_ano`, `total_eventos_ano`, `termometro_pct`,
  // `ultimaAsistencia`, `necesitaPatines`, `necesitaProtecciones`. **Ninguno
  // de esos es de puntos** -- no existe `puntos`/`puntos_tareas`/
  // `puntos_asistencia`/`score` ni nada equivalente en esta respuesta. Los
  // puntos reales SÍ existen en la base, pero en OTRA tabla que
  // `getEquipo()` no toca: `puntos_mensuales` (columnas `puntos_tareas`/
  // `puntos_asistencias`/`puntos_bonificaciones`/`puntos_total`, una fila
  // por `nombre_usuario`+año+mes, ver "Datos pendientes del backend" en
  // MANIFEST.md) -- sumarla acá exige antes decidir qué período mostrar
  // (¿mes actual? ¿acumulado del año?), una decisión de producto fuera de
  // alcance de este fix. Mismo criterio que el chevron de tendencia de
  // abajo: el `<span>` queda condicionado a que el campo exista algún día
  // (`puntosTareas`/`puntosAsistencia`, nombres elegidos para cuando se
  // sumen), sin inventar un valor mientras tanto -- en los datos reales de
  // hoy, sencillamente no se pintan (no hay ningún "—" acá tampoco: mismo
  // criterio ya usado por el chevron, no repetir un placeholder en cada fila
  // de cada card de toda la lista -- el "—" explícito sí vive en el perfil
  // de detalle, `_eqPerfilContenidoHtml()`, más abajo en este archivo, un
  // solo lugar por persona).
  if (p.puntosTareas !== undefined && p.puntosTareas !== null) {
    html += '<span class="eq-mini-stat"><span class="material-symbols-rounded">task_alt</span>' + p.puntosTareas + '</span>';
  }
  if (p.puntosAsistencia !== undefined && p.puntosAsistencia !== null) {
    html += '<span class="eq-mini-stat"><span class="material-symbols-rounded">stars</span>' + p.puntosAsistencia + '</span>';
  }
  // Chevron de tendencia (re-auditado, ver MANIFEST.md -- "chevrones no
  // aparecen en vista preliminar de cards"). Campo buscado explícitamente
  // en el objeto real (misma lista completa que el comentario de puntos, un
  // poco más arriba en esta función): `getEquipo()` trae `termometro_pct`
  // (el valor ACTUAL), pero ningún valor anterior con el que compararlo --
  // ni `tendencia`, ni `termometro_delta`, ni `termometro_pct_anterior`, ni
  // nada equivalente (confirmado contra el `.select()`/`.map()` real de esa
  // función, supabase/functions/api/index.ts). Sin un 2do punto en el
  // tiempo no hay tendencia real que calcular -- este `<span>` queda
  // condicionado a `termometro_pct_anterior` (nombre elegido para cuando
  // exista) a propósito, en vez de comparar contra 0 o inventar cualquier
  // otro valor que simule una tendencia falsa. Documentado en MANIFEST.md
  // ("Datos pendientes del backend"). Pill Q/M de tier SACADA (pedido
  // explícito, ver MANIFEST.md -- "quitar pills Q/M, mantener solo
  // chevrones de tendencia"): el chevron de acá abajo es hoy el único
  // indicador de tier/tendencia en la fila.
  if (p.termometro_pct_anterior !== undefined && p.termometro_pct_anterior !== null) {
    var diff = (p.termometro_pct || 0) - p.termometro_pct_anterior;
    if (diff > 0) html += '<span class="eq-mini-tendencia eq-mini-tendencia-up">▲</span>';
    else if (diff < 0) html += '<span class="eq-mini-tendencia eq-mini-tendencia-down">▼</span>';
  }
  return html;
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
      _eqAvatarHtml(p, 'avatar-pill--sm') +
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
  var rolesWrap = document.getElementById('eq-roles-wrap');
  var mesVacio = document.getElementById('eq-mes-vacio');
  var esRol = !!_eqBusqueda && _eqEsQueryDeRol(_eqBusqueda);
  var mesIdx = (_eqBusqueda && !esRol) ? _eqDetectarMes(_eqBusqueda) : null;
  if (esRol) {
    if (favWrap) favWrap.style.display = 'none';
    if (grupoQuindes) grupoQuindes.style.display = 'none';
    if (grupoMirlxs) grupoMirlxs.style.display = 'none';
    if (grupoInactivos) grupoInactivos.style.display = 'none';
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
    if (rolesWrap) rolesWrap.style.display = 'none';
    if (mesVacio) mesVacio.style.display = '';
    return;
  }
  // Modo normal (nombre/username/email) -- restaura los contenedores reales
  // por si el query anterior había activado el modo rol/mes.
  if (rolesWrap) rolesWrap.style.display = 'none';
  if (mesVacio) mesVacio.style.display = 'none';
  if (grupoQuindes) grupoQuindes.style.display = '';
  if (grupoMirlxs) grupoMirlxs.style.display = '';
  if (grupoInactivos) grupoInactivos.style.display = '';
  _eqRenderFavoritos();
  _eqRenderGrupo('Quindes');
  _eqRenderGrupo('Mirlxs');
  _eqRenderInactivos();
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

// Sugerencias rotativas del buscador (Batch 4) -- placeholder real, estático
// (no animable), reemplazado visualmente por este overlay que sí puede
// hacer fade. Pausa con foco (`_eqSugerenciasPausar()`, onfocus del input)
// o con texto tipeado (chequeado en cada tick, no solo al enfocar/desenfocar
// -- cubre el caso de escribir sin que el input pierda el foco).
var _EQ_SUGERENCIAS = ['Busca por nombre o usuario', 'Prueba: Cumpleaños en abril', 'Prueba: Jammer', 'Prueba: Rol en el equipo'];
var _eqSugerenciaIdx = 0;
var _eqSugerenciaIntervalo = null;
function _eqSugerenciasIniciar() {
  var el = document.getElementById('eq-search-suggestion');
  var input = document.getElementById('eq-search-input');
  if (!el || !input || _eqSugerenciaIntervalo) return;
  el.textContent = _EQ_SUGERENCIAS[0];
  _eqSugerenciaIdx = 0;
  _eqSugerenciaIntervalo = setInterval(function() {
    if (document.activeElement === input || input.value) return;
    el.style.opacity = '0';
    setTimeout(function() {
      _eqSugerenciaIdx = (_eqSugerenciaIdx + 1) % _EQ_SUGERENCIAS.length;
      el.textContent = _EQ_SUGERENCIAS[_eqSugerenciaIdx];
      el.style.opacity = '1';
    }, 400);
  }, 3000);
}
function _eqSugerenciasPausar() {
  var el = document.getElementById('eq-search-suggestion');
  if (el) el.style.opacity = '0';
}
function _eqSugerenciasReanudar() {
  var el = document.getElementById('eq-search-suggestion');
  var input = document.getElementById('eq-search-input');
  if (el && input && !input.value) el.style.opacity = '1';
}

function _eqRenderFavoritos() {
  var wrap = document.getElementById('eq-favoritos-wrap');
  var cont = document.getElementById('eq-favoritos-lista');
  if (!wrap || !cont) return;
  var todas = _eqFavoritos().map(_eqPersonaPorId).filter(function(p) { return !!p && !_eqEsUsuarioActual(p) && !_eqEsInactivo(p); });
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
  var filtradas = _eqPersonas.filter(function(p) { return p.rol === rol; }).filter(function(p) { return !_eqEsUsuarioActual(p) && !_eqEsInactivo(p); }).filter(_eqPasaBusqueda);
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
  var filtradas = _eqPersonas.filter(function(p) { return _eqEsInactivo(p) && !_eqEsUsuarioActual(p); }).filter(_eqPasaBusqueda);
  wrap.style.display = filtradas.length ? '' : 'none';
  if (pillEl) pillEl.textContent = filtradas.length;
  cont.innerHTML = filtradas.map(_eqFilaHtml).join('');
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
  // Rol en el equipo (Batch 4) -- `_eqRolesTexto()` (arriba en este archivo)
  // da `null` si no hay roles reales guardados (o si el único guardado es
  // "No definido") -- en ese caso se muestra igual la fila, con el texto
  // fijo pedido y la clase `eq-info-texto-vacio` (color secundario, sin
  // negrita) en vez de ocultarla del todo.
  var rolTexto = _eqRolesTexto(p.username);
  filas += '<div class="eq-info-fila"><span class="material-symbols-outlined">badge</span><span class="eq-info-texto' + (rolTexto ? '' : ' eq-info-texto-vacio') + '">' + (rolTexto ? _eqEsc(rolTexto) : 'Rol no definido') + '</span></div>';

  var statsCalc = _eqStatsCalc(p);
  // Puntos por tareas/asistencia (pedido nuevo, ver MANIFEST.md) -- **sin
  // dato real todavía**: mismo hallazgo que `_eqStatsInlineHtml()` (arriba
  // en este archivo) -- `getEquipo()` no devuelve `puntosTareas`/
  // `puntosAsistencia` (viven en `puntos_mensuales`, agregados por mes, sin
  // decidir todavía qué período mostrar acá). "—" mientras tanto, pedido
  // explícito, en vez de esconder las 2 tarjetas nuevas del todo.
  var puntosTareasTxt = (p.puntosTareas !== undefined && p.puntosTareas !== null) ? p.puntosTareas : '—';
  var puntosAsistenciaTxt = (p.puntosAsistencia !== undefined && p.puntosAsistencia !== null) ? p.puntosAsistencia : '—';
  // Termómetro solo con equipo propio (bug real, ver MANIFEST.md): oculto
  // por completo si la persona necesita patines o protecciones del club
  // (`necesitaPatines`/`necesitaProtecciones`, `getEquipo()` -- equivalente
  // real al "necesita_equipo_club" del pedido, ver ese comentario en
  // supabase/functions/api/index.ts). `_eqRenderPerfil()` (más abajo) ya
  // guarda con `if (rankWrap)`/`if (fill)` antes de tocar este bloque, así
  // que no renderizarlo acá no rompe nada ahí.
  var necesitaEquipoClub = !!(p.necesitaPatines || p.necesitaProtecciones);
  return '<div class="eq-perfil-header">' +
      '<div class="eq-avatar-wrap">' +
        _eqAvatarHtml(p, 'eq-avatar-grande') +
        '<span class="eq-rol-pill">' + _eqEsc(p.rol) + '</span>' +
      '</div>' +
      '<div class="eq-perfil-nombre">' + _eqEsc(p.nombreDerby) + '</div>' +
      '<div class="eq-perfil-sub">' + ((p.numeroDerby !== null && p.numeroDerby !== undefined && p.numeroDerby !== '') ? '#' + p.numeroDerby + ' &bull; ' : '') + '@' + _eqEsc(p.username) + '</div>' +
    '</div>' +
    (pillsHtml ? '<div class="eq-perfil-pills-row">' + pillsHtml + '</div>' : '') +
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">roller_skating</span><div class="eq-stat-valor">' + statsCalc.horas + 'h</div><div class="eq-stat-label">Horas patinadas</div></div>' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">kid_star</span><div class="eq-stat-valor">' + statsCalc.asistenciaPct + '%</div><div class="eq-stat-label">Asistencia anual</div></div>' +
    '</div>' +
    '<div class="eq-stats-grid">' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">task_alt</span><div class="eq-stat-valor">' + puntosTareasTxt + '</div><div class="eq-stat-label">Puntos por tareas</div></div>' +
      '<div class="eq-stat-card"><span class="eq-stat-icon material-symbols-rounded">stars</span><div class="eq-stat-valor">' + puntosAsistenciaTxt + '</div><div class="eq-stat-label">Puntos por asistencia</div></div>' +
    '</div>' +
    (necesitaEquipoClub ? '' :
    '<div class="eq-rank-wrap">' +
      '<div class="eq-rank-labels"><span>Mirlxs</span><span>Quindes</span></div>' +
      '<div class="eq-rank-track"><div class="eq-rank-fill" id="eq-rank-fill" style="width:0%;"></div></div>' +
      '<div class="eq-rank-texto">' + _eqEsc(_eqRankTexto(p)) + '</div>' +
    '</div>') +
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
