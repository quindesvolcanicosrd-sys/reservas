// Helper compartido (js/home.js + js/perfil.js) para poblar cualquier
// .avatar-pill con foto o inicial — antes cada uno de los 4 call sites hacía
// su propio innerHTML directo (foto ? '<img>' : '<span>inicial</span>'),
// swap instantáneo sin transición aunque el avatar realmente cambiara (ej.
// tras subir una foto nueva). No-op si el HTML resultante es idéntico al
// actual (se llama en cada re-render de home/ajustes, no solo cuando la
// foto cambia — animar un contenido que no cambió sería ruido, mismo
// criterio ya usado por axisFooterFijo() para no animar swaps idénticos).
function _avatarSetFotoOInicial(el, foto, nombre) {
  if (!el) return;
  var htmlNuevo = foto
    ? '<img src="' + foto + '" alt="">'
    : '<span class="avatar-pill-letter">' + (nombre || '?').charAt(0).toUpperCase() + '</span>';
  if (el.innerHTML === htmlNuevo) return;
  if (!el.firstChild) { el.innerHTML = htmlNuevo; return; } // primera vez, nada que crossfadear
  el.style.transition = 'opacity 0.2s ease';
  el.style.opacity = '0';
  setTimeout(function() {
    el.innerHTML = htmlNuevo;
    void el.offsetWidth;
    el.style.opacity = '1';
  }, 200);
}

function mostrarCargando(msg) {
  var el = document.getElementById('loading-overlay');
  var msgEl = document.getElementById('loading-msg');
  var estaOculto = el.style.display === 'none' || el.style.display === '';
  el.classList.remove('fade-out');
  el.classList.remove('fade-in');
  el.style.display = 'flex';
  if (estaOculto) { void el.offsetWidth; el.classList.add('fade-in'); }
  if (msgEl.textContent === (msg || 'Cargando...')) return;
  msgEl.style.opacity = '0';
  setTimeout(function() {
    msgEl.textContent = msg || 'Cargando...';
    msgEl.style.opacity = '1';
  }, 200);
}

function ocultarCargando() {
  var el = document.getElementById('loading-overlay');
  el.classList.remove('fade-in');
  el.classList.add('fade-out');
  setTimeout(function() {
    el.style.display = 'none';
    el.classList.remove('fade-out');
  }, 400);
}

function err(id, msg) {
  var el = document.getElementById(id);
  clearTimeout(el._errTimer);
  el.style.cssText = '';
  el.textContent = msg;
  el.style.display = 'block';
  void el.offsetWidth;
  el.style.animation = 'fadeIn 0.35s ease';
  el._errTimer = setTimeout(function() {
    var h = el.scrollHeight;
    el.style.overflow = 'hidden';
    el.style.maxHeight = h + 'px';
    void el.offsetWidth;
    el.style.animation = 'fadeOut 0.3s ease forwards';
    el.style.transition = 'max-height 0.35s 0.2s ease, padding 0.35s 0.2s ease, margin 0.35s 0.2s ease';
    setTimeout(function() {
      el.style.maxHeight = '0';
      el.style.paddingTop = '0'; el.style.paddingBottom = '0';
      el.style.marginTop = '0'; el.style.marginBottom = '0';
    }, 50);
    setTimeout(function() { el.style.cssText = ''; el.style.display = 'none'; }, 600);
  }, 4400);
}

function selOp(label, name, val) {
  document.querySelectorAll('input[name="'+name+'"]').forEach(function(r) { r.closest('.opcion').classList.remove('sel'); });
  label.classList.add('sel');
  if (name === 'conf') E.conf = val;
  if (name === 'edit-pat') E.editPat = val;
  if (name === 'edit-protec') {
    E.editProtec = val; document.getElementById('txt-otro').style.display = val === 'Otro' ? 'block' : 'none';
  }
}

function abrirContacto() {
  var ov = document.getElementById('modal-contacto-overlay');
  var m = document.getElementById('modal-contacto');
  if (!m) return;
  ov.style.display = 'block';
  m.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(cerrarContacto);
}
function cerrarContacto(porGesto) {
  if (!porGesto) { history.back(); return; }
  var ov = document.getElementById('modal-contacto-overlay');
  var m = document.getElementById('modal-contacto');
  if (!m) return;
  m.style.transform = 'translateY(100%)';
  setTimeout(function() { m.style.display = 'none'; ov.style.display = 'none'; }, 350);
}

var PANTALLAS_RAIZ = ['s1', 's-home'];

var TOP_BAR_CONFIG = {
  's2': { titulo: 'Equipamiento', volver: 's-home' },
  's3a': { titulo: 'Editar equipamiento', volver: function() { return E.editandoDesdeHome ? 's-datos' : 's-home'; } }, 's3b': { titulo: 'Editar equipamiento', volver: 's3a' },
  's3c': { titulo: 'Editar equipamiento', volver: function() { return E.editPat === 'Sí' ? 's3b' : 's3a'; } },
  's4': { titulo: function() { return E.reagendando ? 'Reagendar clase' : 'Nueva reserva'; }, volver: function() { return 's-home'; } },
  's-pago': { titulo: 'Pago', volver: 's4' },
  's-gestionar': { titulo: 'Re-agendar fecha', volver: 's-home' },
  's-misreservas': { titulo: 'Historial de reservas', volver: 's-home' },
  // Detalle de un evento (Eventos) -- ya NO usa el #top-bar genérico (ver
  // "Cambios recientes": nav compacta propia y sticky, #ev-detalle-sticky,
  // poblada por _evRenderDetalle()/js/eventos.js con flecha atrás + ícono +
  // tipo/fecha-hora + pills de Inicio/Lugar, todo en un solo bloque). Sin
  // entrada acá, `ir()` oculta el #top-bar entero para esta pantalla.
  // Sin volver (ver "Cambios recientes" — nav inferior): Ajustes es ahora
  // una pantalla raíz de APP_BOTTOM_NAV_ITEMS, alcanzable siempre desde la
  // nav inferior -- no necesita ni debe tener un botón que la redirija hacia
  // Reservas/Home, mismo criterio que ya aplica a las demás pantallas raíz
  // (s1/s-home, que ni siquiera pasan por TOP_BAR_CONFIG). `volver` en falsy
  // (antes una función dinámica s-home/s1 según E.datos/_dashboardAdminLimitado,
  // ver historial) hace que ir() (js/ui.js) oculte solo el botón atrás
  // (topBtn.style.display='none') sin ocultar el resto del top-bar -- el
  // título "AJUSTES" se sigue mostrando, solo desaparece la flecha.
  's-datos': { titulo: 'Ajustes', volver: null },
  's-admin-login': { titulo: 'Administradorx', volver: 's1' },
  // 's-admin-reservas'/'s-admin-quellevar'/'s-admin-equip'/'notif'/
  // 'admin-color'/'admin-precios' NUNCA son pantallas propias -- viven como
  // burbujas embebidas dentro de "Mi Liga" (aj-sub-miliga), nunca pantalla
  // completa/navegación, así que no necesitan entrada acá.
  's-admin-usuarios': { titulo: 'Usuarios', volver: 's-datos' }
};

// Navegación entre pantallas con fade simple (animation:smoothSlideUp vía
// .pantalla.activa, ver css/global.css) — ver MANIFEST, "Cambios recientes":
// se probó acá el shared axis X (axisTransicion()/axisBarraTitulo()/
// axisFooterFijo(), ver shared/axis-transicion.js) y se revirtió por
// acumular demasiados bugs de fondo (superposición, footer/título
// desincronizados, salto de scroll) para el tiempo invertido — se mantiene
// ÚNICAMENTE en aj-sub-*/irAjSub()/cerrarAjSub() (js/perfil.js), que sigue
// validado y sin tocar. Este es el mecanismo simple de antes de esa
// propagación: toggle de clase directo, chrome (top-bar/footer/home-nav/
// paso-indicator) aplicado de inmediato, sin animar dos pantallas a la vez
// ni diferir nada a un setTimeout.
function ir(id, desdeHistorial, sinTrampa) {
  if (id === 's1b' || !document.getElementById(id)) { ir('s1', true); return; }
  // #s4-total-fijo (panel de total fijo de s4, js/reservas.js): su propia
  // salida (fade-out + slide-down del panel hijo, independiente de este
  // mecanismo de pantallas) sigue disparándose al abandonar s4 — feature
  // separada, sin relación con el shared axis, no tocada por este revert.
  var actual = document.querySelector('.pantalla.activa');
  if (actual && actual.id === 's4' && typeof _s4TotalOcultarFijo === 'function') {
    _s4TotalOcultarFijo(document.getElementById('s4-total-fijo'));
  }
  document.querySelectorAll('.pantalla').forEach(function(p) { p.classList.remove('activa'); });
  document.getElementById(id).classList.add('activa');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  var sinHistorial = ['s-carga', 's-carga-fechas', 's-carga-conf'];
  if (!desdeHistorial && sinHistorial.indexOf(id) === -1) {
    history.pushState({ pantalla: id }, '', '#' + id);
  }
  if (!sinTrampa && PANTALLAS_RAIZ.indexOf(id) !== -1) {
    history.pushState({ pantalla: id }, '', '#' + id); // entrada "trampa": atrás en una pantalla raíz no debe navegar ni salir de la app
  }

  document.body.classList.toggle('logueada', id !== 's1');

  if (id === 's-home') {
    setTimeout(mostrarBannerPWA, 1200);
    setTimeout(function() {
      if (!_yaVioModal('home')) {
        var mh = document.getElementById('modal-info-home');
        if (mh) { mh.style.display = 'flex'; _registrarOverlayAbierto(function(porGesto) { _cerrarModalInfo('home', porGesto); }); }
      }
    }, 600);
  }

  if (id === 's-pago' && typeof _resetChkPago === 'function') {
    _resetChkPago();
  }

  var topBar = document.getElementById('top-bar'); var topBtn = document.getElementById('top-bar-btn'); var topTitulo = document.getElementById('top-bar-titulo');
  var cfg = TOP_BAR_CONFIG[id];
  // Buscador de Ajustes (ver "Cambios recientes") -- reemplaza el título
  // "AJUSTES" solo en `s-datos`, togglea con #top-bar-titulo. Se resetea
  // (input vacío, todas las filas visibles) cada vez que se entra de nuevo,
  // para no arrastrar un filtro viejo entre visitas.
  var ajSearchWrap = document.getElementById('aj-search-wrap');
  if (ajSearchWrap) {
    var esAjustes = id === 's-datos';
    ajSearchWrap.style.display = esAjustes ? 'flex' : 'none';
    if (esAjustes) {
      var ajInput = document.getElementById('aj-search-input');
      if (ajInput) ajInput.value = '';
      if (typeof ajFiltrarSettings === 'function') ajFiltrarSettings('');
    }
  }
  if (cfg) {
    topBar.style.display = 'flex';
    topTitulo.textContent = typeof cfg.titulo === 'function' ? cfg.titulo() : cfg.titulo;
    topTitulo.style.display = (id === 's-datos') ? 'none' : '';
    var _volverTarget = typeof cfg.volver === 'function' ? cfg.volver() : cfg.volver;
    var topBtnIcono = topBtn.querySelector('.material-symbols-outlined');
    if (_volverTarget) {
      // Flecha atrás real: navega, mismo comportamiento de siempre.
      topBtn.style.display = '';
      topBtn.onclick = function() { volver(_volverTarget); };
      topBtn.classList.remove('app-nav-back--decorativo');
      topBtn.removeAttribute('aria-hidden');
      topBtnIcono.textContent = 'arrow_back';
    } else {
      // Sin volver: si `id` es pantalla raíz de la nav inferior (ver
      // _iconoRaizDeNav()), el slot de la flecha se reusa para un ícono
      // decorativo (mismo ícono que su tab en .app-bottom-nav, sin onclick
      // ni feedback de hover/active) en vez de quedar vacío -- si no,
      // se oculta entero como antes.
      var _iconoRaiz = _iconoRaizDeNav(id);
      if (_iconoRaiz) {
        topBtn.style.display = '';
        topBtn.onclick = null;
        topBtn.classList.add('app-nav-back--decorativo');
        topBtn.setAttribute('aria-hidden', 'true');
        topBtnIcono.textContent = _iconoRaiz;
      } else {
        topBtn.style.display = 'none';
      }
    }
  } else { topBar.style.display = 'none'; }

  // Los .cta-footer-fixed viven como hijos directos de <body> (fuera de .pantalla/
  // .card) para no quedar atrapados por el containing block que .pantalla.activa
  // establece mientras corre su animación de entrada (smoothSlideUp) y "atrape"
  // al footer fuera del viewport real. js/ui.js (ir()) muestra solo el que
  // corresponde a la pantalla activa.
  document.querySelectorAll('.cta-footer-fixed').forEach(function(f) { f.style.display = 'none'; });
  var ctaFooter = document.getElementById('cta-footer-' + id);
  if (ctaFooter) ctaFooter.style.display = 'block';

  if (id === 's4' && typeof actualizarTotalS4 === 'function') actualizarTotalS4();

  var homeNav = document.getElementById('home-nav');
  if (homeNav) {
    if (id !== 's-home') {
      homeNav.style.display = 'none';
    } else {
      var _tieneActivas = (typeof _todasReservas !== 'undefined' && _todasReservas && _todasReservas.some(function(r) {
        return r.estado !== 'Cancelada' && r.estado !== 'Crédito usado';
      }));
      homeNav.style.display = _tieneActivas ? 'flex' : 'none';
    }
  }

  _actualizarBottomNav(id);

  var sinPasos = ['s1','s-home','s-misreservas','s-carga','s6','s-datos','s-gestionar'].concat(ADMIN_PANTALLAS);
  if (E.reagendando) sinPasos = sinPasos.concat(['s4','s-carga-conf']);
  var dotContainer = document.querySelector('.paso-indicator');
  if (sinPasos.indexOf(id) !== -1) { if (dotContainer) dotContainer.style.display = 'none'; return; }
  if (dotContainer) {
    dotContainer.style.display = 'flex';
    var pasos = { 's2':1,'s3a':1,'s3b':1,'s3c':1,'s-carga-fechas':2,'s4':2,'s-pago':3,'s-carga-conf':3 };
    var p = pasos[id] || 1;
    for (var i = 1; i <= 4; i++) {
      var d = document.getElementById('dot'+i);
      if (d) d.className = 'paso-dot' + (i < p ? ' completado' : i === p ? ' activo' : '');
    }
  }
}
function volver(id) { ir(id); }

// Nav inferior (bottom tab bar), persistente en toda pantalla raíz de la app
// autenticada -- base extensible para secciones futuras (Tareas/Asistencias/
// Equipo, etc.): un array de ítems en vez de botones hardcodeados, así una
// sección nueva solo necesita sumar una entrada acá (con su propia
// 'pantalla' raíz), sin tocar el render de _actualizarBottomNav() ni el CSS
// de css/nav.css. `visible` decide qué tabs se muestran según el tipo de
// cuenta (hoy solo distingue admin "pura" de todo el resto, ver
// _dashboardAdminLimitado en js/admin.js/js/auth.js); `entrar` es opcional
// y reemplaza al volver(pantalla) por defecto cuando la pantalla necesita
// poblarse antes de mostrarse -- 'ajustes' lo necesita: para una cuenta
// normal, #s-datos puede no haberse poblado nunca todavía en la sesión (el
// login normal aterriza en 's-home', irEditarDatos() recién se llamaba
// antes desde el avatar clickeable de home, ahora eliminado -- ver
// MANIFEST.md "Cambios recientes"); un ir('s-datos') a secas dejaría los
// placeholders "—" la primera vez que se toca este tab.
var APP_BOTTOM_NAV_ITEMS = [
  // 'reservas' -- regla de negocio estricta, auditada a propósito (ver
  // MANIFEST.md "Cambios recientes"): dashboardAdmin:true (admin que no paga
  // cuota) nunca debe ver este tab, sin excepción -- ni siquiera si esa
  // cuenta tiene fila en Equipo con necesitaPatines/necesitaProtecciones
  // cargados (posible desde el fix de E.datos para admins con fila en
  // Equipo, ver "Cambios recientes"). `!_dashboardAdminLimitado` es la
  // ÚNICA condición correcta acá -- _dashboardAdminLimitado se deriva
  // pura y exclusivamente de res.dashboardAdmin (loginGoogle/validarPin/
  // restaurarSesion, ver js/auth.js), nunca de E.datos ni de ningún campo
  // de equipamiento. NO agregar un chequeo alternativo tipo "E.datos &&
  // E.datos.necesitaPatines" ni similar -- eso mostraría el tab a una
  // cuenta dashboardAdmin:true con equipamiento propio cargado, violando
  // la regla.
  { id: 'reservas', icono: 'calendar_month', texto: 'Reservas', pantalla: 's-home',
    visible: function() { return !_dashboardAdminLimitado; }, entrar: function() { irReservas(); } },
  // 'eventos' -- Tanda 2 (ver MANIFEST.md "Cambios recientes" -- sección
  // Eventos, estructura estática): calendario de entrenamientos/torneos/
  // asambleas + cumpleaños del equipo, separado de "Reservas" (que sigue
  // siendo el flujo de equipamiento/pago). Visible para todo tipo de
  // cuenta -- a diferencia de 'reservas', no depende de _dashboardAdminLimitado,
  // ambos perfiles (usuarix normal y admin) necesitan ver el calendario.
  // `entrar` (no volver(pantalla) a secas) porque #s-eventos necesita
  // poblarse por JS (semana/mes actual + cards) antes de mostrarse, mismo
  // motivo que 'ajustes'/irEditarDatos().
  { id: 'eventos', icono: 'event', texto: 'Eventos', pantalla: 's-eventos',
    entrar: function() { irEventos(); },
    visible: function() { return true; } },
  { id: 'ajustes', icono: 'settings', texto: 'Ajustes', pantalla: 's-datos',
    entrar: function() { irEditarDatos(); },
    visible: function() { return true; } }
];
var _BOTTOM_NAV_PANTALLAS = APP_BOTTOM_NAV_ITEMS.map(function(item) { return item.pantalla; });
// s4 ("Nueva Reserva") no es la `pantalla` raíz de ningún ítem -- se llega
// ahí desde 'reservas' (irReservas()/irNuevaReserva()), no es un tab en sí
// -- pero también muestra la nav inferior (ver "Cambios recientes": pedido
// explícito, "igual que el resto de las pantallas autenticadas de la
// app"), con 'reservas' resaltado como si estuviera en su pantalla raíz
// (s-home). Mapa chico a propósito -- un solo caso hoy, no un mecanismo
// genérico para evitar sobre-construir sin necesidad real.
var _BOTTOM_NAV_EXTRA = { 's4': 'reservas' };

// Reusa el `icono` ya definido por ítem para el slot de la flecha atrás de
// #top-bar cuando una pantalla de TOP_BAR_CONFIG no tiene `volver` (ver
// ir()) -- fuente única entre el ícono de la nav inferior y el decorativo
// del header, sin duplicar el nombre del ícono en 2 configs distintas.
function _iconoRaizDeNav(id) {
  for (var i = 0; i < APP_BOTTOM_NAV_ITEMS.length; i++) {
    if (APP_BOTTOM_NAV_ITEMS[i].pantalla === id) return APP_BOTTOM_NAV_ITEMS[i].icono;
  }
  return null;
}

function _bottomNavClick(id) {
  for (var i = 0; i < APP_BOTTOM_NAV_ITEMS.length; i++) {
    if (APP_BOTTOM_NAV_ITEMS[i].id !== id) continue;
    var item = APP_BOTTOM_NAV_ITEMS[i];
    if (item.entrar) item.entrar(); else volver(item.pantalla);
    return;
  }
}

// Llamada desde ir() en cada navegación: si `id` es una de las pantallas
// raíz de algún ítem, (re)construye los tabs visibles para el tipo de
// cuenta actual y resalta el de la pantalla activa; si no, oculta la nav
// entera (pantallas internas -- s2, s-misreservas, aj-sub-*, etc. -- no
// llevan nav inferior). El cambio de pantalla en sí lo anima ir() como
// cualquier otra navegación (fade de .pantalla.activa) -- no hay ninguna
// animación propia acá.
function _actualizarBottomNav(id) {
  var nav = document.getElementById('app-bottom-nav');
  if (!nav) return;
  var idExtra = _BOTTOM_NAV_EXTRA[id]; // ej. 's4' -> 'reservas'
  if (_BOTTOM_NAV_PANTALLAS.indexOf(id) === -1 && !idExtra) { nav.style.display = 'none'; return; }
  var pantallaAResaltar = id;
  if (idExtra) {
    for (var j = 0; j < APP_BOTTOM_NAV_ITEMS.length; j++) {
      if (APP_BOTTOM_NAV_ITEMS[j].id === idExtra) { pantallaAResaltar = APP_BOTTOM_NAV_ITEMS[j].pantalla; break; }
    }
  }
  var html = '';
  APP_BOTTOM_NAV_ITEMS.forEach(function(item) {
    if (!item.visible()) return;
    html += '<button type="button" class="app-bottom-nav-item' + (item.pantalla === pantallaAResaltar ? ' activo' : '') + '" onclick="_bottomNavClick(\'' + item.id + '\')">' +
      '<span class="material-symbols-outlined">' + item.icono + '</span>' +
      '<span class="app-bottom-nav-label">' + item.texto + '</span>' +
      '</button>';
  });
  nav.innerHTML = html;
  nav.style.display = 'flex';
}

window.addEventListener('popstate', function(ev) {
  if (_overlayStack.length > 0) { var _fn = _overlayStack.pop(); _fn(true); return; }
  if (_ajSubAbierto) { cerrarAjSub(_ajSubAbierto, true); return; }
  var _tieneHomeNormal = E.datos && !_dashboardAdminLimitado;
  var id = (ev.state && ev.state.pantalla) || (_tieneHomeNormal ? 's-home' : 's1');
if (id === 's2') id = _tieneHomeNormal ? 's-home' : 's1';
  if (id === 's1b') id = _tieneHomeNormal ? 's-home' : 's1';
  if (_tieneHomeNormal && id === 's1') id = 's-home';
  var esAdminPantalla = ADMIN_PANTALLAS.indexOf(id) !== -1;
  // Tanda 7 (ver MANIFEST.md "Cambios recientes" — elimina s-admin-home):
  // una cuenta admin "pura" (sin E.datos) ahora vive en 's-datos' (Ajustes),
  // no en ninguna pantalla de ADMIN_PANTALLAS -- sin este permiso explícito,
  // un popstate apuntando a 's-datos' la mandaría de vuelta a 's1' por no
  // tener E.datos, aunque sí tenga _adminToken.
  var esAdminEnDatos = id === 's-datos' && _adminToken;
  if (!_tieneHomeNormal && !esAdminPantalla && !esAdminEnDatos && id !== 's1') id = 's1';
  if (esAdminPantalla && id !== 's-admin-login' && !_adminToken) id = 's1';
  ir(id, true);
});
history.replaceState({ pantalla: 's1' }, '', '#s1');
history.pushState({ pantalla: 's1' }, '', '#s1'); // entrada "trampa" inicial, ver PANTALLAS_RAIZ en ir()

var _overlayStack = [];
function _registrarOverlayAbierto(cerrarFn) {
  history.pushState({ overlay: true }, '', location.hash);
  _overlayStack.push(cerrarFn);
}

var NOMBRES_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function generarMeses() {
  var hoy = new Date();
  var mesActual = hoy.getMonth();
  var lista = document.getElementById('lista-meses-unificada');
  if (!lista) return;

  var mesesConfirmados = (_todasReservas || [])
    .filter(function(r) { return r.estado === 'Confirmada'; })
    .map(function(r) { return r.fecha.toLowerCase().trim(); });

  var html = '';
  for (var i = 0; i < 12; i++) {
    if (i === mesActual && mesActual > 0) {
      html += '<div class="meses-divider"></div>';
    }
    var nombre = NOMBRES_MESES[i];
    var esPasado = i < mesActual;
    var confirmado = mesesConfirmados.indexOf(nombre.toLowerCase()) !== -1;
    html += crearMesItem(nombre, esPasado, confirmado);
  }
  lista.innerHTML = html;
}

function crearMesItem(nombre, esPasado, confirmado) {
  var clases = 'mes-item' + (esPasado ? ' mes-past' : '') + (confirmado ? ' mes-confirmado' : '');
  var badge = confirmado
    ? '<span class="mes-badge"><span class="material-symbols-outlined">check_circle</span>Pagado</span>'
    : '';
  var disabled = confirmado ? ' disabled checked' : '';
  var onchange = confirmado ? '' : ' onchange="this.checked ? _autoencadenarMeses(this) : _autodesencadenarMeses(this);actualizarTotalS4()"';
  return '<label class="' + clases + '">' +
    '<input type="checkbox" value="' + nombre + '"' + disabled + onchange + '>' +
    '<span class="mes-nombre">' + nombre + '</span>' +
    badge +
    '</label>';
}

function _autoencadenarMeses(el) {
  if (!el.checked) return;
  var checkboxes = Array.prototype.slice.call(document.querySelectorAll('#lista-meses-unificada .mes-item input[type="checkbox"]'));
  var idx = checkboxes.indexOf(el);
  var agregados = [];
  for (var i = idx - 1; i >= 0; i--) {
    var cb = checkboxes[i];
    var item = cb.closest('.mes-item');
    if (item.classList.contains('mes-past')) break;
    if (cb.checked) break;
    cb.checked = true;
    agregados.push(cb.value);
  }
  if (agregados.length > 0) {
    agregados.reverse();
    mostrarToast(agregados.join(', ') + (agregados.length > 1 ? ' también se agregaron' : ' también se agregó'), null, true);
  }
}

function _autodesencadenarMeses(el) {
  if (el.checked) return;
  var checkboxes = Array.prototype.slice.call(document.querySelectorAll('#lista-meses-unificada .mes-item input[type="checkbox"]'));
  var idx = checkboxes.indexOf(el);
  var quitados = [];
  for (var i = idx + 1; i < checkboxes.length; i++) {
    var cb = checkboxes[i];
    var item = cb.closest('.mes-item');
    if (item.classList.contains('mes-confirmado')) break;
    if (cb.checked) { cb.checked = false; quitados.push(cb.value); }
  }
  if (quitados.length > 0) {
    mostrarToast(quitados.join(', ') + (quitados.length > 1 ? ' también se quitaron' : ' también se quitó'), null, true);
  }
}

function togglePagoMetodo(header) {
  var body = header.nextElementSibling;
  var chevron = header.querySelector('.material-symbols-outlined');
  var abierto = body.style.maxHeight && body.style.maxHeight !== '0px';
  if (!abierto) {
    body.style.paddingBottom = '16px';
    body.style.paddingTop = '12px';
    setTimeout(function() { body.style.maxHeight = body.scrollHeight + 'px'; }, 10);
  } else {
    body.style.maxHeight = '0';
    body.style.paddingBottom = '0';
    body.style.paddingTop = '0';
  }
  if (chevron) chevron.style.transform = abierto ? '' : 'rotate(180deg)';
}


// `contenedorEl` (opcional, ver MANIFEST.md "Cambios recientes" -- cards de
// cumpleaños de Eventos): sin argumento, mismo comportamiento de siempre
// (canvas fixed a pantalla completa, usado por s6 tras confirmarReserva()).
// Con un elemento, el confetti queda contenido dentro de ese elemento en vez
// de cubrir la pantalla -- mismo motor (piezas/física/fade), reusado tal
// cual en vez de reimplementarlo: el canvas pasa a position:absolute dentro
// de `contenedorEl` (que necesita position:relative/overflow:hidden propio,
// ver .ev-card-cumple en css/eventos.css) y usa clientWidth/clientHeight en
// vez de innerWidth/innerHeight, con menos piezas (más chico = menos
// densidad, si no se ve saturado) y velocidades más cortas para que el
// ciclo entero quede visible en un área acotada.
function lanzarConfetti(contenedorEl) {
  var acotado = !!contenedorEl;
  var canvas = document.createElement('canvas');
  var ancho, alto;
  if (acotado) {
    ancho = contenedorEl.clientWidth;
    alto = contenedorEl.clientHeight;
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    contenedorEl.appendChild(canvas);
  } else {
    ancho = window.innerWidth;
    alto = window.innerHeight;
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(canvas);
  }
  var ctx = canvas.getContext('2d');
  canvas.width = ancho;
  canvas.height = alto;
  var piezas = [];
  var colores = ['#F97316','#fb923c','#fbbf24','#22c55e','#60a5fa','#c084fc','#f472b6'];
  var nPiezas = acotado ? 45 : 120;
  for (var i = 0; i < nPiezas; i++) {
    piezas.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: Math.random() * (acotado ? 6 : 10) + (acotado ? 4 : 6),
      h: Math.random() * (acotado ? 4 : 6) + (acotado ? 2 : 3),
      color: colores[Math.floor(Math.random() * colores.length)],
      rot: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * (acotado ? 2 : 3),
      vy: Math.random() * (acotado ? 3 : 4) + 2,
      vr: (Math.random() - 0.5) * 0.15
    });
  }
  var frames = 0;
  var maxFrames = acotado ? 110 : 200;
  var fadeDesde = acotado ? 90 : 180;
  function animar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    piezas.forEach(function(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frames / fadeDesde);
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    });
    frames++;
    if (frames < maxFrames) requestAnimationFrame(animar);
    else { canvas.remove(); }
  }
  animar();
}

/* ─── MODALES INFO ─────────────────────────────────────────────────── */
function _modalInfoKey(id) { return 'modal_info_' + id + '_' + (E.nombre || ''); }

function _yaVioModal(id) {
  var k = _modalInfoKey(id);
  return localStorage.getItem(k) === 'visto' || sessionStorage.getItem(k) === 'luego';
}

function _cerrarModalInfo(id, porGesto) {
  if (!porGesto) { history.back(); return; }
  var el = document.getElementById('modal-info-' + id);
  if (el) el.style.display = 'none';
}

function modalInfoOk(id) {
  localStorage.setItem(_modalInfoKey(id), 'visto');
  if (id === 'reserva' && window._modalInfoReservaCallback) {
    var cb = window._modalInfoReservaCallback;
    window._modalInfoReservaCallback = null;
    cb();
  }
  // id==='home': mismo patrón que 'reserva' — permite encadenar mostrarModalPermisos()
  // (js/auth.js) para que no compita por pantalla con modal-info-home, ver esa entrada.
  if (id === 'home' && window._modalInfoHomeCallback) {
    var cbHome = window._modalInfoHomeCallback;
    window._modalInfoHomeCallback = null;
    cbHome();
  }
  _cerrarModalInfo(id);
}

function modalInfoLater(id) {
  sessionStorage.setItem(_modalInfoKey(id), 'luego');
  if (id === 'reserva' && window._modalInfoReservaCallback) {
    var cb = window._modalInfoReservaCallback;
    window._modalInfoReservaCallback = null;
    cb();
  }
  if (id === 'home' && window._modalInfoHomeCallback) {
    var cbHome = window._modalInfoHomeCallback;
    window._modalInfoHomeCallback = null;
    cbHome();
  }
  _cerrarModalInfo(id);
}

function mostrarModalInfoReserva(callback) {
  if (_yaVioModal('reserva')) { callback(); return; }
  var puedeMonthly = canPayMonthly();
  var elClase = document.getElementById('mri-modalidad-clase');
  var elMes   = document.getElementById('mri-modalidad-mes');
  var elCupon = document.getElementById('mri-cupon');
  if (elClase) elClase.style.display = puedeMonthly ? 'none' : '';
  if (elMes)   elMes.style.display   = puedeMonthly ? '' : 'none';
var elCuponHr = document.getElementById('mri-cupon-hr');
  var mostrarCupon = tieneCuponDisponible();
  if (elCupon) elCupon.style.display = mostrarCupon ? '' : 'none';
  if (elCuponHr) elCuponHr.style.display = mostrarCupon ? '' : 'none';  window._modalInfoReservaCallback = callback;
  document.getElementById('modal-info-reserva').style.display = 'flex';
  _registrarOverlayAbierto(function(porGesto) { _cerrarModalInfo('reserva', porGesto); });
}

// Silencia por default cualquier tipo que no sea 'error' — decisión de
// diseño intencional de Victor (le resultaban molestos la mayoría de los
// toasts de éxito/informativos), NO un bug — ver MANIFEST.md, "Reglas
// globales del proyecto", para el detalle completo antes de "corregir" esto
// de nuevo en una futura auditoría. `forzar=true` es la válvula de escape
// explícita para el puñado de casos donde sí hace falta mostrar un toast
// no-error (hoy solo _autoencadenarMeses()/_autodesencadenarMeses(), más
// abajo en este archivo) — pasarlo solo en el call site que de verdad lo
// necesite, nunca reactivar en masa los demás.
function mostrarToast(msg, tipo, forzar) {
  if (tipo !== 'error' && !forzar) return;
  var t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'app-toast' + (tipo === 'error' ? ' app-toast-error' : tipo === 'ok' ? ' app-toast-ok' : '');
  t.classList.add('visible');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('visible'); }, 3000);
}

function abrirModalInfoEstado() {
  var m = document.getElementById('modal-info-estado');
  if (!m) return;
  m.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.opacity = '1'; }); });
  _registrarOverlayAbierto(cerrarModalInfoEstado);
}
function cerrarModalInfoEstado(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-info-estado');
  if (!m) return;
  m.style.opacity = '0';
  setTimeout(function() { m.style.display = 'none'; }, 300);
}
function abrirModalInfoPolitica() {
  var m = document.getElementById('modal-info-politica');
  if (!m) return;
  m.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.opacity = '1'; }); });
  _registrarOverlayAbierto(cerrarModalInfoPolitica);
}
function cerrarModalInfoPolitica(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-info-politica');
  if (!m) return;
  m.style.opacity = '0';
  setTimeout(function() { m.style.display = 'none'; }, 300);
}