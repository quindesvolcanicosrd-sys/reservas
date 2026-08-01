// Helper compartido (js/home.js + js/perfil.js + js/eventos.js) para poblar
// cualquier .avatar-pill con foto o inicial — antes cada call site hacía su
// propio innerHTML directo (foto ? '<img>' : '<span>inicial</span>'), swap
// instantáneo sin transición aunque el avatar realmente cambiara (ej. tras
// subir una foto nueva) NI espera real a que la imagen termine de bajar de
// su URL (aparecía de golpe apenas el navegador terminaba, sin ningún
// estado intermedio). No-op si nada cambió respecto al último llamado
// (`el.dataset.avatarClave`, se llama en cada re-render de home/ajustes, no
// solo cuando la foto cambia — animar un contenido que no cambió sería
// ruido, mismo criterio ya usado por axisFooterFijo() para no animar swaps
// idénticos).
function _avatarSetFotoOInicial(el, foto, nombre) {
  if (!el) return;
  var clave = (foto || '') + '|' + (nombre || '');
  if (el.dataset.avatarClave === clave) return;
  el.dataset.avatarClave = clave;
  var miCarga = (el._avatarCargaId = (el._avatarCargaId || 0) + 1);

  if (!foto) {
    _avatarAplicarHtml(el, '<span class="avatar-pill-letter">' + (nombre || '?').charAt(0).toUpperCase() + '</span>');
    return;
  }
  // Con foto: se precarga con Image() antes de mostrarla, así nunca hay un
  // <img> roto/vacío mientras el navegador todavía la está bajando. Primera
  // vez que se puebla este avatar (vacío, nada que crossfadear todavía):
  // skeleton circular (mismo shimmer que .fi-skel-block, css/reservas.css)
  // mientras dura la carga. Si ya tenía contenido (ej. subir una foto
  // nueva), ese contenido se queda visible hasta que la nueva esté lista —
  // sin flash de skeleton sobre un avatar que ya se veía bien.
  if (!el.firstChild) el.innerHTML = '<div class="fi-skel-block avatar-pill-skel"></div>';
  var img = new Image();
  img.alt = '';
  img.onload = function() {
    if (el._avatarCargaId !== miCarga) return; // el avatar pidió otra foto/inicial mientras esta cargaba
    _avatarAplicarHtml(el, img.outerHTML);
  };
  img.onerror = function() {
    if (el._avatarCargaId !== miCarga) return;
    _avatarAplicarHtml(el, '<span class="avatar-pill-letter">' + (nombre || '?').charAt(0).toUpperCase() + '</span>');
  };
  img.src = foto;
}
function _avatarAplicarHtml(el, html) {
  if (!el.firstChild) { el.innerHTML = html; return; }
  el.style.transition = 'opacity 0.2s ease';
  el.style.opacity = '0';
  setTimeout(function() {
    el.innerHTML = html;
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
  // 's4' -- ya NO usa el #top-bar genérico (ver "Cambios recientes"): nav
  // fija propia, #s4-nav (mismo patrón que #home-nav), poblada por
  // `_s4ActualizarNav()`/js/reservas.js -- 2 variantes según `canPayMonthly()
  // && !E.reagendando` (con el selector Por clase/Mensual centrado, sin
  // título ni flecha; o con el título de siempre + flecha atrás real). Sin
  // entrada acá, `ir()` oculta el #top-bar entero para esta pantalla, mismo
  // criterio que la pantalla de detalle de Eventos.
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
  // Cierre forzoso de cualquier overlay fijo (aj-sub-*/_overlayStack) al
  // navegar -- ver "Cambios recientes": ambos viven fuera de .pantalla
  // (position:fixed, hermanos de .pantalla en el DOM), así que cambiar de
  // pantalla NO los oculta solo -- sin este guard quedan flotando encima de
  // la pantalla nueva. Vive acá (no duplicado en cada caller) porque ir() es
  // el único punto real de "cambio de pantalla", se llegue desde la nav
  // inferior (_bottomNavClick()), popstate o cualquier otra navegación
  // directa. Instantáneo y sin animación de salida -- ya estamos abandonando
  // la sección entera, no tiene sentido animar algo que el usuario no va a
  // alcanzar a ver. `_ajSubAbierto` (js/perfil.js) se resetea directo acá en
  // vez de pasar por el flujo animado de cerrarAjSub() (setTimeout de 320ms);
  // `_overlayStack` se vacía llamando ya a cada función de cierre registrada
  // con el mismo `true` que usa popstate más abajo para saltarse su propio
  // history.back(), pero todas juntas en el momento en vez de una por evento
  // de historial. Ninguno de los dos toca `_ajUltimoSubAbierto` (ver
  // _bottomNavClick()) -- ese solo se limpia en un cierre manual real
  // (cerrarAjSub()), acá se abandona la sección con el sub técnicamente
  // "todavía abierto" a los efectos de restaurarlo si se vuelve.
  if (_ajSubAbierto) {
    var _subForzado = document.getElementById(_ajSubAbierto);
    if (_subForzado) {
      _subForzado.classList.remove('activa');
      _subForzado.style.transform = ''; _subForzado.style.opacity = '';
    }
    var _fondoForzado = document.getElementById('s-datos-card');
    if (_fondoForzado) { _fondoForzado.style.transform = ''; _fondoForzado.style.opacity = ''; }
    if (_ajSubAbierto === 'aj-sub-salud' && typeof _saludOcultarFooter === 'function') _saludOcultarFooter();
    _ajSubAbierto = null;
    if (typeof _ajSincronizarClaseSalud === 'function') _ajSincronizarClaseSalud();
  }
  while (_overlayStack.length > 0) { _overlayStack.pop()(true); }
  if (id === 's1b' || !document.getElementById(id)) { ir('s1', true); return; }
  // #s4-total-fijo (panel de total fijo de s4, js/reservas.js): su propia
  // salida (fade-out + slide-down del panel hijo, independiente de este
  // mecanismo de pantallas) sigue disparándose al abandonar s4 — feature
  // separada, sin relación con el shared axis, no tocada por este revert.
  var actual = document.querySelector('.pantalla.activa');
  if (actual && actual.id === 's4' && typeof _s4TotalOcultarFijo === 'function') {
    _s4TotalOcultarFijo(document.getElementById('s4-total-fijo'));
  }
  // Bug real corregido (ver "Cambios recientes" -- el guard de carga vigente
  // de eventosAbrirAnticipada() no alcanzaba solo): `#cta-footer-eventos-anticipada`
  // ("Aplicar", footer fijo hijo directo de `<body>`) es un elemento
  // SEPARADO del contenido de `#s-eventos-anticipada` -- su mostrar/ocultar
  // (`_evAntActualizarFooter()`/`_evAntOcultarFooter()`) no está atado a
  // `.pantalla.activa` para nada, así que si `getReglasAsistenciaAnticipada`
  // resolvía tarde con el usuario ya en OTRA pantalla (sin haber vuelto a
  // entrar -- el caso que el guard de carga vigente no cubre, ver esa
  // función), el footer podía quedar mostrándose flotando sobre esa otra
  // pantalla. Doble protección, igual que `_s4TotalOcultarFijo()` arriba:
  // ocultarlo de inmediato acá, en cuanto se abandona `s-eventos-anticipada`
  // por CUALQUIER motivo, sin depender únicamente de que la carga tardía
  // nunca lo muestre.
  if (actual && actual.id === 's-eventos-anticipada' && typeof _evAntOcultarFooter === 'function') {
    _evAntOcultarFooter();
  }
  // Guardar el scroll de una sección raíz de la nav inferior AL ABANDONARLA
  // (ver "Cambios recientes" -- regla general, no solo para Eventos/detalle:
  // toda sección de APP_BOTTOM_NAV_ITEMS que quiera restaurar su posición al
  // volver por nav inferior define un `alSalir()` opcional, corrido acá
  // ANTES de cambiar de `.pantalla` -- mismo criterio que ya usa `entrar()`
  // para poblar al entrar, ahora con su contraparte simétrica al salir).
  // `actual` ya está calculado arriba para el caso de s4, se reusa. Ningún
  // ítem sin `alSalir` definido paga ningún costo acá (`reservas` todavía no
  // lo necesita).
  if (actual) {
    for (var _k = 0; _k < APP_BOTTOM_NAV_ITEMS.length; _k++) {
      if (APP_BOTTOM_NAV_ITEMS[_k].pantalla === actual.id && APP_BOTTOM_NAV_ITEMS[_k].alSalir) {
        APP_BOTTOM_NAV_ITEMS[_k].alSalir();
        break;
      }
    }
  }
  document.querySelectorAll('.pantalla').forEach(function(p) { p.classList.remove('activa'); });
  document.getElementById(id).classList.add('activa');
  // Preservación de estado por tab (ver "Cambios recientes" -- regla general
  // de arquitectura, no específica de Eventos/Ajustes): cada vez que `ir()`
  // deja una pantalla activa que pertenece a algún tab de la nav inferior
  // (raíz o drill-down, vía `_tabIdDePantalla()` -- misma resolución que ya
  // usa `_actualizarBottomNav()`/`_esPantallaAlcanzable()`), se recuerda acá
  // en `_bottomNavUltimaPantalla[tabId]` -- sin importar el disparador
  // (botón, popstate, nav inferior). `_bottomNavClick()` lo consulta al
  // cambiar de tab para reaparecer exactamente ahí en vez de resetear a la
  // raíz -- ver esa función más abajo. Pantallas ajenas a cualquier tab
  // (login, wizard de Nueva Reserva antes de s4, loaders `sinHistorial`,
  // etc.) resuelven `null` y no pagan ningún costo acá.
  var _tabDeEstaPantalla = _tabIdDePantalla(id);
  if (_tabDeEstaPantalla) _bottomNavUltimaPantalla[_tabDeEstaPantalla] = id;
  // Instantáneo (ver "Cambios recientes" -- antes `behavior:'smooth'`): ya
  // estamos abandonando la sección entera (mismo criterio que el resto de
  // esta función, ver comentario de más arriba sobre `_ajSubAbierto`/
  // `_overlayStack`) -- no tiene sentido animar un scroll que el usuario no
  // va a alcanzar a ver. Los 2 casos que dependían de que ESTE scroll fuera
  // smooth para poder "pisarlo" después con un `setTimeout(50)` (restaurar
  // scroll del timeline al volver de un detalle, indicador de RSVP) siguen
  // funcionando igual -- verificado con Playwright -- el `setTimeout(50)` ya
  // no hace falta para "ganarle" a una animación (no hay ninguna corriendo),
  // pero se deja tal cual: sigue siendo necesario por su otro motivo real
  // (offsetWidth/getBoundingClientRect de una pantalla recién visible no son
  // reales hasta el siguiente tick), así que simplificarlo no aportaría nada.
  window.scrollTo(0, 0);

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

  // Bug real (ver "Cambios recientes", js/eventos.js): el indicador de la
  // barra de RSVP de una card del timeline (`.ev-rsvp-slider`, posicionado
  // por `offsetWidth`/`offsetLeft` de la opción activa) quedaba mal ubicado
  // -- pegado cerca del extremo izquierdo, como si "Asistiré" estuviera
  // resaltado sin importar el estado real -- al volver de la pantalla de
  // detalle: mientras `#s-eventos` está `display:none` (detrás de
  // `#s-eventos-detalle`), esas medidas dan 0, y nada las recalculaba al
  // volver a hacerse visible. Mismo fix ya usado en la dirección contraria
  // (entrar al detalle, `abrirEvDetalle()`, mismo motivo) -- acá centralizado
  // en `ir()` en vez de solo en el botón "atrás" del detalle porque cubre
  // TODOS los caminos de vuelta a `s-eventos` (botón, gesto nativo/popstate),
  // no solo uno.
  // Restaurar el scroll del timeline (ver "Cambios recientes", js/eventos.js
  // -- pedido explícito: no debe saltar arriba de todo). `_evRestaurarScrollTimeline`
  // se arma en 2 disparadores -- `abrirEvDetalle()` (volver de un detalle,
  // por botón "atrás" o gesto nativo/popstate) e `irEventos()` (nav inferior
  // a una sección ya visitada esta sesión) -- ambos caminos pasan por acá.
  // `ir()` ya disparó su propio `scrollTo(0,0)` instantáneo unas líneas
  // arriba -- este `setTimeout(50)` (mismo delay que ya usa el fix del
  // indicador de RSVP, agrupados en el mismo callback) sigue haciendo falta
  // por SU motivo real (offsetWidth/getBoundingClientRect de una pantalla
  // recién visible no son reales hasta el siguiente tick), no ya para
  // "pisar" una animación smooth (esa ya no existe, ver más arriba).
  if (id === 's-eventos' && typeof _evUpdateRsvpSliders === 'function') {
    setTimeout(function() {
      _evUpdateRsvpSliders(false);
      if (typeof _evRestaurarScrollTimeline !== 'undefined' && _evRestaurarScrollTimeline) {
        _evRestaurarScrollTimeline = false;
        window.scrollTo(0, _evTimelineScrollY);
      }
    }, 50);
  }
  // Restaurar el scroll del home de Ajustes al volver por nav inferior a una
  // sesión que ya lo había visitado (ver "Cambios recientes" -- generaliza a
  // Ajustes el mismo mecanismo de Eventos de arriba; distinto de
  // `_ajUltimoSubAbierto`/`_reabrirAjSubInstantaneo()`, que restaura la
  // SUB-sección abierta -- esto es el scroll del propio home, `#s-datos`,
  // que hasta ahora no se restauraba nunca). `_ajRestaurarScroll` se arma en
  // `irEditarDatos()` cuando la sección ya estaba inicializada esta sesión.
  if (id === 's-datos' && typeof _ajRestaurarScroll !== 'undefined' && _ajRestaurarScroll) {
    setTimeout(function() {
      _ajRestaurarScroll = false;
      window.scrollTo(0, _ajHomeScrollY);
    }, 50);
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
  // Spacer de 40px que balancea la flecha atrás en otras pantallas de
  // TOP_BAR_CONFIG (ver "Cambios recientes") -- en `s-datos` no hay flecha
  // que balancear (`topBtn` se oculta más abajo) y el buscador es `flex:1`,
  // así que este spacer solo le resta ancho real al pill sin cumplir
  // ningún rol visual acá -- se oculta junto con el buscador.
  var topBarSpacer = document.getElementById('top-bar-spacer');
  if (topBarSpacer) topBarSpacer.style.display = (id === 's-datos') ? 'none' : '';
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
      // se oculta entero como antes. Excepción: `s-datos` (Ajustes) -- ahí
      // el slot lo ocupa el buscador (#aj-search-wrap, ver arriba), que ya
      // cumple el rol de "marca de sección"; el ícono de tuerca ahí no
      // aportaba nada y solo restaba espacio al buscador (ver "Cambios
      // recientes").
      var _iconoRaiz = (id === 's-datos') ? null : _iconoRaizDeNav(id);
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

  var s4Nav = document.getElementById('s4-nav');
  if (s4Nav) {
    s4Nav.style.display = id === 's4' ? 'flex' : 'none';
    if (id === 's4' && typeof _s4ActualizarNav === 'function') _s4ActualizarNav();
  }

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

  // FAB de #s-eventos (#ev-fab-menu, index.html) -- solo cuenta admin Y con
  // 's-eventos' como pantalla activa (no en s-eventos-detalle/
  // s-eventos-anticipada, aunque compartan tab de la nav inferior). Mismo
  // criterio que #home-nav/#s4-nav de arriba: togglea acá, único punto real
  // de "cambio de pantalla" (ver comentario de arriba de esta función). Si
  // se abandona 's-eventos' con el menú "speed dial" abierto, se fuerza su
  // cierre -- no debe quedar abierto e invisible esperando la próxima vez
  // que se muestre el FAB.
  // Bug real corregido (ver "Cambios recientes"): gateaba con `_esAdminDemo`
  // (js/eventos.js) -- un flag de demo para probar la variante admin de la
  // card SIN sesión real (`var _esAdminDemo = false;`, nunca lo pisa ningún
  // flujo de login/restauración real), no la señal real de sesión admin --
  // con eso, el FAB quedaba invisible para CUALQUIER cuenta admin real,
  // siempre. `_adminToken` (js/admin.js) es la señal real ya usada por el
  // resto de la UI admin fuera de Eventos (ej. `#aj-group-miliga` en
  // `js/perfil.js`, mismo criterio: truthy con cualquier sesión admin,
  // "pura" o con cuota) -- no `E.datos`/`_dashboardAdminLimitado` (esa
  // distingue admin "puro" de admin+usuarix, un eje distinto, no "es
  // admin"). Recalculado en cada `ir()` -- cubre login directo, restaurar
  // sesión y cambio de tab por igual, sin caso especial en ninguno.
  var eventosFab = document.getElementById('ev-fab-menu');
  if (eventosFab) {
    var _mostrarFab = id === 's-eventos' && !!_adminToken;
    eventosFab.style.display = _mostrarFab ? 'flex' : 'none';
    if (!_mostrarFab && typeof _evFabCerrar === 'function') _evFabCerrar();
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
    visible: function() { return !_dashboardAdminLimitado; }, entrar: function() { irReservas(); },
    // `alSalir` (ver "Cambios recientes" -- regla general de más arriba, mismo
    // mecanismo que ya usan 'eventos'/'ajustes'): si el pull-to-refresh de
    // #ptr-indicator (js/home.js) sigue "refrescando" (arrastre ya soltado,
    // `_ptrRefrescando===true`, esperando la respuesta de refrescarMisReservas())
    // cuando el usuario cambia de tab, el indicador es un elemento fijo GLOBAL
    // (fuera de `.pantalla`, hermano de todas) -- cambiar de pantalla no lo
    // oculta solo, quedaba girando encima de la sección nueva hasta que el
    // fetch viejo resolvía. Solo oculta el indicador (puramente visual,
    // `_ptrOcultarIndicador()` no toca `_ptrRefrescando` ni el backstop) -- el
    // fetch en curso sigue y termina en segundo plano, y como `prepararHome()`/
    // `_renderHomeReservas()` escriben directo sobre `#home-reservas-lista`
    // sin chequear si `#s-home` está activa (el DOM no se destruye entre
    // tabs), al volver a Reservas los datos ya están al día sin necesidad de
    // un segundo gesto.
    alSalir: function() { if (typeof _ptrOcultarIndicador === 'function') _ptrOcultarIndicador(); } },
  // 'eventos' -- Tanda 2 (ver MANIFEST.md "Cambios recientes" -- sección
  // Eventos, estructura estática): calendario de entrenamientos/torneos/
  // asambleas + cumpleaños del equipo, separado de "Reservas" (que sigue
  // siendo el flujo de equipamiento/pago). Visible para todo tipo de
  // cuenta -- a diferencia de 'reservas', no depende de _dashboardAdminLimitado,
  // ambos perfiles (usuarix normal y admin) necesitan ver el calendario.
  // `entrar` (no volver(pantalla) a secas) porque #s-eventos necesita
  // poblarse por JS (semana/mes actual + cards) antes de mostrarse, mismo
  // motivo que 'ajustes'/irEditarDatos().
  { id: 'eventos', icono: 'campaign', texto: 'Eventos', pantalla: 's-eventos',
    entrar: function() { irEventos(); },
    // `restaurar` (ver "Cambios recientes" -- preservación de estado por tab,
    // regla general de _bottomNavClick() de más arriba): al volver a Eventos
    // desde OTRO tab, reaparece en la sub-pantalla real con la que se había
    // quedado (detalle de un evento, o el wizard/resumen de Asistencia
    // anticipada con sus pills/fechas ya tocadas) en vez de resetear a la
    // raíz -- eso último es lo que sigue haciendo `entrar` (irEventos())
    // cuando se toca el tab Eventos YA activo. Implementada en js/eventos.js
    // (_evRestaurarTab()) -- vive ahí junto al resto del estado del wizard,
    // no acá.
    restaurar: function(pantallaGuardada) { if (typeof _evRestaurarTab === 'function') _evRestaurarTab(pantallaGuardada); else irEventos(); },
    // `alSalir` (ver "Cambios recientes" -- regla general de restaurar
    // posición al volver por nav inferior): guarda el scroll del timeline al
    // ABANDONAR la sección, sin importar hacia dónde -- complementa a
    // `abrirEvDetalle()` (que guarda lo mismo al entrar a un detalle, un
    // camino distinto hacia la misma variable, `_evTimelineScrollY`).
    alSalir: function() { if (typeof _evGuardarScrollTimeline === 'function') _evGuardarScrollTimeline(); },
    visible: function() { return true; } },
  { id: 'ajustes', icono: 'settings', texto: 'Ajustes', pantalla: 's-datos',
    entrar: function() { irEditarDatos(); },
    // `alSalir` (ver "Cambios recientes") -- guarda el scroll del HOME de
    // Ajustes (`#s-datos`) al abandonar la sección, distinto de
    // `_ajUltimoSubAbierto`/js/perfil.js (que guarda qué SUB-sección estaba
    // abierta, no el scroll del home en sí).
    alSalir: function() { if (typeof _ajGuardarScrollHome === 'function') _ajGuardarScrollHome(); },
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
//
// Los 9 aj-sub-* (Perfil/Contacto/Privacidad/Legal/Dirección/Emergencia/Mi
// liga/Equipamiento/Salud) NO pasan por acá -- descartado a propósito, ver
// "Cambios recientes": son overlays `position:fixed` propios (`.aj-sub`,
// css/perfil.css), montados/desmontados por `irAjSub()`/`cerrarAjSub()`
// (js/perfil.js), un mecanismo COMPLETAMENTE separado de `ir()` -- nunca
// tocan `.pantalla`/`_actualizarBottomNav()`, la pantalla activa real sigue
// siendo 's-datos' todo el tiempo que un aj-sub-* está abierto (por eso
// `_actualizarBottomNav('s-datos')` ya dejó la nav visible con 'ajustes'
// resaltado desde antes de abrir cualquier sub-panel -- nunca hizo falta
// sumarlas acá). El bug real (ver "Cambios recientes") era puramente
// visual: `.aj-sub` (z-index:950) se pintaba ENCIMA de `.app-bottom-nav`
// (z-index:900) Y ocupaba el mismo espacio (`inset:0`, hasta el borde
// inferior real) -- la tapaba por completo aunque siguiera técnicamente
// visible en el DOM. Fix en css/perfil.css (`.aj-sub` ahora reserva
// `bottom:calc(var(--bottom-nav-h) + safe-area)`, no llega a taparla), no acá.
//
// s-misreservas (historial completo, drill-down de 'reservas') / s6 (éxito/
// confirmación, cierre del flujo de "Nueva Reserva") / s-pago (pago en
// curso) / s-gestionar (reagendar una reserva) / s-eventos-detalle (detalle
// de un evento, drill-down de 'eventos') SÍ suman acá (ver "Cambios
// recientes" -- confirmado con Victor: mismo principio permanente, seguir
// viendo la nav en cualquier sub-pantalla de una sección autenticada,
// incluidas s-pago/s-gestionar pese a tener una confirmación en curso).
var _BOTTOM_NAV_EXTRA = {
  's4': 'reservas', 's-misreservas': 'reservas', 's6': 'reservas',
  's-pago': 'reservas', 's-gestionar': 'reservas',
  's-eventos-detalle': 'eventos', 's-eventos-anticipada': 'eventos'
};

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

// Resuelve una `.pantalla` (raíz o drill-down) al `id` del ítem de
// APP_BOTTOM_NAV_ITEMS al que pertenece, o null si no pertenece a ningún tab
// -- misma resolución que ya usaba `_esPantallaAlcanzable()` inline (raíz
// directa, o vía `_BOTTOM_NAV_EXTRA` para drill-downs como
// `s-eventos-detalle`/`s4`), factorizada acá porque ahora también la usa el
// tracking de `ir()` y `_bottomNavClick()` (ver "Cambios recientes" --
// preservación de estado por tab). `_esPantallaAlcanzable()` sigue con su
// propia copia inline sin tocar -- no es el foco de este cambio y ya está
// validada, duplicar 4 líneas ahí es más seguro que arriesgar su comportamiento.
function _tabIdDePantalla(id) {
  var idExtra = _BOTTOM_NAV_EXTRA[id];
  if (idExtra) return idExtra;
  for (var i = 0; i < APP_BOTTOM_NAV_ITEMS.length; i++) {
    if (APP_BOTTOM_NAV_ITEMS[i].pantalla === id) return APP_BOTTOM_NAV_ITEMS[i].id;
  }
  return null;
}

// Última pantalla mostrada de cada tab (id de ítem -> id de `.pantalla`),
// poblado por `ir()` en cada navegación (ver ahí) -- fuente de verdad de
// "dónde había quedado" cada sección para `_bottomNavClick()` de abajo.
var _bottomNavUltimaPantalla = {};

// Bug real corregido (ver "Cambios recientes" -- gesto de "atrás" saltaba a
// login en vez de al tab anterior): el listener de `popstate` de abajo tenía
// su PROPIO allowlist manual de pantallas válidas para una cuenta
// `_dashboardAdminLimitado` (`esAdminPantalla`/`esAdminEnDatos`), separado
// del que ya usa la navegación hacia adelante (`item.visible()` de
// APP_BOTTOM_NAV_ITEMS, consultado por `_actualizarBottomNav()`/
// `_bottomNavClick()`) -- cuando el tab "Eventos" se sumó como visible para
// TODOS los tipos de cuenta (`visible: function(){return true;}`), ese
// allowlist manual del popstate nunca se actualizó: `_bottomNavClick()`
// dejaba entrar a `s-eventos` sin problema, pero un popstate apuntando ahí
// (gesto nativo de "atrás") no encontraba `s-eventos` en `ADMIN_PANTALLAS`
// ni cumplía `esAdminEnDatos`, así que caía al `id='s1'` de emergencia --
// aterrizaba en login pese a que la sesión seguía activa y esa pantalla es
// perfectamente alcanzable para esa cuenta. Fix: en vez de mantener 2
// allowlists en paralelo (con el riesgo real de que una quede desincronizada
// de la otra, como pasó acá), el popstate ahora consulta la MISMA fuente de
// verdad que la navegación hacia adelante -- `_esPantallaAlcanzable(id)`
// resuelve `id` a su ítem de `APP_BOTTOM_NAV_ITEMS` (directo, o vía
// `_BOTTOM_NAV_EXTRA` para drill-downs como `s-eventos-detalle`) y devuelve
// su `visible()` actual.
function _esPantallaAlcanzable(id) {
  var itemId = _BOTTOM_NAV_EXTRA[id];
  if (!itemId) {
    for (var i = 0; i < APP_BOTTOM_NAV_ITEMS.length; i++) {
      if (APP_BOTTOM_NAV_ITEMS[i].pantalla === id) { itemId = APP_BOTTOM_NAV_ITEMS[i].id; break; }
    }
  }
  if (!itemId) return false;
  for (var j = 0; j < APP_BOTTOM_NAV_ITEMS.length; j++) {
    if (APP_BOTTOM_NAV_ITEMS[j].id === itemId) return APP_BOTTOM_NAV_ITEMS[j].visible();
  }
  return false;
}

// Preservación de estado por tab (ver "Cambios recientes" -- regla general de
// arquitectura, aplica a todo ítem de APP_BOTTOM_NAV_ITEMS, no solo a
// Eventos/Ajustes): tocar un tab DISTINTO al activo restaura la última
// sub-pantalla/estado con el que había quedado esa sección (sin resetear
// nada tocado por el usuario -- pills/fechas de un wizard, sub-panel
// abierto, etc.); tocar el tab en el que YA se está parado es la única forma
// de "volver a home" de esa sección -- descarta cualquier estado recordado y
// navega a su pantalla raíz. Ambos caminos conviven con pushState/popstate
// sin tocarlo: toda navegación de acá abajo sigue pasando por `ir()`/
// `volver()`, que son quienes manejan el historial -- este mecanismo solo
// decide A QUÉ pantalla navegar, nunca cómo se registra en el historial.
function _bottomNavClick(id) {
  for (var i = 0; i < APP_BOTTOM_NAV_ITEMS.length; i++) {
    if (APP_BOTTOM_NAV_ITEMS[i].id !== id) continue;
    var item = APP_BOTTOM_NAV_ITEMS[i];
    var actual = document.querySelector('.pantalla.activa');
    var tabActivo = actual ? _tabIdDePantalla(actual.id) : null;

    if (tabActivo === id) {
      // Bug real corregido (ver "Cambios recientes"): tocar el ícono de la
      // tab en la que ya se está SIEMPRE disparaba el reset de abajo, incluso
      // ya parado en la home de esa tab (nada que resetear) -- cada toque
      // repetido re-ejecutaba `entrar()`/`volver()` de la nada (recarga/
      // re-render sin ningún cambio real). Si ya se está en la raíz (`actual.id
      // === item.pantalla`) Y, para 'ajustes' puntualmente, sin ningún
      // aj-sub-* abierto encima (`_ajSubAbierto` -- la pantalla `s-datos` de
      // abajo es la misma est'e o no un sub abierto, así que no alcanza con
      // comparar el id), no hay nada que hacer: no-op real, sin efecto
      // visual. Solo cuando el usuario está efectivamente en una sub-pantalla
      // de esta tab (`s4`/`s-eventos-detalle`/un aj-sub-* abierto/etc.) se
      // sigue de largo al reset real de siempre.
      var yaEnHome = actual && actual.id === item.pantalla && (id !== 'ajustes' || !_ajSubAbierto);
      if (yaEnHome) return;
      // Tab ya activo -- "volver a home" real: Ajustes descarta el sub-panel
      // recordado (mismo criterio que un cierre manual, cerrarAjSub()) antes
      // de navegar, así un futuro cambio de tab de ida y vuelta no lo
      // reabre solo. Eventos no necesita un reset explícito acá -- su propio
      // `entrar` (irEventos()) ya aterriza siempre en la raíz `s-eventos` sin
      // importar la sub-pantalla actual (detalle o Asistencia anticipada).
      if (id === 'ajustes') _ajUltimoSubAbierto = null;
      if (item.entrar) item.entrar(); else volver(item.pantalla);
      return;
    }

    // Veníamos de otro tab: restaurar tal cual había quedado esta sección.
    // `item.restaurar` (si lo define, ver 'eventos' más arriba) sabe
    // reconstruir estado propio más allá de la pantalla en sí (ej. el paso
    // del wizard de Asistencia anticipada); sin él, alcanza con volver a la
    // última pantalla recordada -- su contenido sigue intacto en el DOM
    // (`ir()` solo togglea `.activa`, nunca lo destruye).
    var pantallaGuardada = _bottomNavUltimaPantalla[id];
    if (pantallaGuardada && pantallaGuardada !== item.pantalla) {
      if (item.restaurar) item.restaurar(pantallaGuardada); else ir(pantallaGuardada);
    } else if (item.entrar) {
      item.entrar();
    } else {
      volver(item.pantalla);
    }
    // Ajustes: si la sección se abandonó con un aj-sub-* abierto (el guard de
    // ir() lo cerró de golpe, sin animación, pero dejó `_ajUltimoSubAbierto`
    // con su id -- ver js/perfil.js), restaurarlo acá en vez de aterrizar en
    // el home de Ajustes a secas -- pedido explícito: volver al tab debe
    // dejar al usuario donde había quedado, no resetear su navegación interna.
    if (id === 'ajustes' && _ajUltimoSubAbierto) _reabrirAjSubInstantaneo(_ajUltimoSubAbierto);
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
  if (!_tieneHomeNormal && !esAdminPantalla && !esAdminEnDatos && !_esPantallaAlcanzable(id) && id !== 's1') id = 's1';
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
// (canvas fixed a pantalla completa, burst único con fade, usado por s6 tras
// confirmarReserva()). Con un elemento, el confetti queda contenido dentro de
// ese elemento en vez de cubrir la pantalla: el canvas pasa a
// position:absolute dentro de `contenedorEl` (que necesita
// position:relative/overflow:hidden propio, ver .ev-card-cumple en
// css/eventos.css) y usa clientWidth/clientHeight en vez de
// innerWidth/innerHeight, con muchas menos piezas (14 vs 120). A diferencia
// del burst de pantalla completa, acá es un loop continuo sin fade: cada
// pieza se recicla (nuevo x/color, y arriba del canvas) al salir por abajo
// en vez de fadear y tirar el canvas entero. El loop corta solo cuando
// contenedorEl.isConnected da false (la card salió del DOM).
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
  var nPiezas = acotado ? 14 : 120;
  function reciclar(p) {
    p.x = Math.random() * canvas.width;
    p.y = Math.random() * -canvas.height;
    p.color = colores[Math.floor(Math.random() * colores.length)];
  }
  for (var i = 0; i < nPiezas; i++) {
    var p = {
      w: Math.random() * (acotado ? 6 : 10) + (acotado ? 4 : 6),
      h: Math.random() * (acotado ? 4 : 6) + (acotado ? 2 : 3),
      rot: Math.random() * Math.PI * 2,
      // Rama acotada a ~mitad de velocidad (ver "Cambios recientes" -- goteo
      // suave en vez de lluvia rápida, la card de cumpleaños queda fija en
      // pantalla así que no hace falta que caiga rápido): vx/vy/vr son la
      // mitad de sus rangos de antes, la rama de pantalla completa (s6) no se
      // toca.
      vx: (Math.random() - 0.5) * (acotado ? 1 : 3),
      vy: Math.random() * (acotado ? 1.5 : 4) + (acotado ? 1 : 2),
      vr: (Math.random() - 0.5) * (acotado ? 0.075 : 0.15)
    };
    reciclar(p);
    piezas.push(p);
  }
  var frames = 0;
  var maxFrames = 200;
  var fadeDesde = 180;
  // Rama acotada (card de cumpleaños): loop continuo sin fade, cada pieza
  // se recicla al salir del área en vez de fadear+desaparecer. El corte real
  // es contenedorEl.isConnected, no un contador de frames (#ev-lista se
  // re-renderiza con innerHTML al navegar de semana/mes en Eventos: sin este
  // chequeo el rAF de una card vieja seguiría corriendo sobre un canvas ya
  // desconectado, acumulándose en cada navegación).
  function animar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    piezas.forEach(function(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = acotado ? 1 : Math.max(0, 1 - frames / fadeDesde);
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (acotado && p.y - p.h > canvas.height) reciclar(p);
    });
    frames++;
    if (acotado) {
      if (contenedorEl.isConnected) requestAnimationFrame(animar);
      else canvas.remove();
    } else if (frames < maxFrames) {
      requestAnimationFrame(animar);
    } else {
      canvas.remove();
    }
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