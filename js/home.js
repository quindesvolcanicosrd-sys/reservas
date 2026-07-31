var _todasReservas = [];
var _proximosData = {};
var _MESES_MAP = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
var _MESES_DISPLAY = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var _homeExpandido = false;

function prepararHome(saltarFadeInicial, onListo) {
  if (!E.datos) {
    // Backstop: si llegamos acá sin datos de persona (token válido pero sin
    // registro asociado, error de red silencioso, o cualquier otro caller
    // futuro que pase por acá con E.datos sin setear), no hay nada real para
    // pintar — cerrar sesión y volver al login en vez de explotar más abajo
    // leyendo E.datos.necesitaPatines de un objeto null.
    if (typeof cerrarSesion === 'function') cerrarSesion();
    return;
  }
  var saludoEl = document.getElementById('home-saludo');
  if (saludoEl) saludoEl.textContent = E.nombre + '!';
  var homeContent = document.getElementById('home-reservas-lista');
  var homeContenidoFinalListo = false;
  if (!saltarFadeInicial) {
    // saltarFadeInicial=true significa que el caller (ej. irHomeDesdeExito()) ya está
    // mostrando su propio fade-out/spinner sobre este mismo contenedor — evita que se
    // repita acá el ciclo completo (contenido real pintado y tapado por un segundo spinner).
    if (homeContent) { homeContent.style.opacity = '0'; homeContent.style.transition = 'opacity 0.3s ease'; }
    _renderHomeReservas();
    if (homeContent) {
      setTimeout(function() {
        if (homeContenidoFinalListo) return; // el fetch ya resolvió y pintó el contenido real; no lo pisamos con el loader
        // min-height + flex centra el spinner dentro del área del contenedor dinámico
        // en vez de quedar pegado arriba (antes solo tenía padding:24px 0, sin alto
        // propio) — ver "Cambios recientes", mismo alto aproximado que .empty-state-body
        // para minimizar el salto de layout cuando el contenido real lo reemplace.
        homeContent.innerHTML = '<div class="loader" style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;"><div class="spinner"></div></div>';
        homeContent.style.opacity = '1';
      }, 50);
    }
  }
  var d = E.datos;
  var talla = d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no' ? d.talla : '';
  api({ action: 'getFechasDisponibles', nombre: E.nombre, talla: talla, necesitaProtecciones: d.necesitaProtecciones }, function(fechas) {
    var infoMap = {};
    fechas.forEach(function(f) { infoMap[f.fecha] = f; });
    _todasReservas = (_todasReservas || []).map(function(r) {
      var info = infoMap[r.fecha];
      if (info) {
        r.mapsUrl = info.mapsUrl || ''; r.horaFin = info.horaFin || ''; r.duracion = info.duracion || ''; r.descripcion = info.descripcion || '';
      }
      return r;
    });
    homeContenidoFinalListo = true;
    _renderHomeReservas();
    if (homeContent) { homeContent.style.opacity = '1'; void homeContent.offsetWidth; homeContent.style.animation = 'fadeIn 0.3s ease'; }
    if (!window._cargandoFechasReserva) ocultarCargando();
    if (onListo) onListo(); // ver refrescarMisReservas(): dispara justo cuando arranca el fadeIn real del contenido
  }, function() {
    homeContenidoFinalListo = true;
    _renderHomeReservas();
    if (homeContent) { homeContent.style.opacity = '1'; void homeContent.offsetWidth; homeContent.style.animation = 'fadeIn 0.3s ease'; }
    if (!window._cargandoFechasReserva) ocultarCargando();
    if (onListo) onListo();
  });
  var bannerCupon = document.getElementById('banner-cupon');
  if (bannerCupon) {
    api({ action: 'getCuponDisponible', nombre: E.nombre }, function(res) {
      if (E.datos) E.datos.cuponDisponible = res.cuponDisponible === true;
      if (res.cuponDisponible) localStorage.removeItem('cupon_' + E.nombre);
      bannerCupon.style.display = 'none';
      // Bug real de seguridad corregido (ver MANIFEST): este fetch es async y puede
      // resolver mientras el usuario ya está en s4 con el cupón marcado desde un valor
      // cacheado desactualizado (ej. sesión restaurada) — sin este re-sync, el wrapper
      // de cupón nunca se re-evalúa con el dato fresco y E.cuponAplicado podía quedar
      // en true (cupón "gratis" sin cupón real disponible) hasta confirmarReserva().
      var s4El = document.getElementById('s4');
      if (typeof _s4SincronizarCuponWrapper === 'function' && s4El && s4El.classList.contains('activa')) {
        _s4SincronizarCuponWrapper();
      }
    }, function() {
      bannerCupon.style.display = 'none';
    });
  }
  var notifBanner = document.getElementById('notif-banner');
  if (notifBanner) {
    var yaDescarto = localStorage.getItem('notif_dismiss') === '1';
    var yaActivado = 'Notification' in window && Notification.permission === 'granted';
    notifBanner.style.display = (!yaDescarto && !yaActivado) ? 'block' : 'none';
  }
  var notifActivas = 'Notification' in window && Notification.permission === 'granted';
  var tNotif = document.getElementById('toggle-notif');
  if (tNotif) _ajSetToggleOn(tNotif, notifActivas);
  var rowNotif = document.getElementById('row-notif-home');
  if (rowNotif) rowNotif.style.display = notifActivas ? 'none' : '';
  var rowInstalar = document.getElementById('row-instalar-app');
  if (rowInstalar) rowInstalar.style.display = esStandalone() ? 'none' : '';
  _initHomeNav();
}

function refrescarMisReservas(callback, btn) {
  var icon = btn ? btn.querySelector('.material-symbols-outlined') : null;
  if (icon) icon.style.animation = 'spin 0.6s linear infinite';
  // Fade-out SOLO de #home-reservas-lista (el contenedor dinámico: ícono+saludo+
  // empty-state o cards) — nunca del avatar/"¿Dudas? Contáctanos" (#home-empty-topbar,
  // elemento separado desde el fix de "Cambios recientes"), ni de #home-nav ni del
  // footer fijo de CTAs, ninguno de los 3 vive dentro de este contenedor. Sin loader
  // genérico en este flujo — el único feedback de carga es #ptr-indicator (gesto) o
  // el ícono girando de este mismo botón (refresh de escritorio).
  var homeContent = document.getElementById('home-reservas-lista');
  if (homeContent) { homeContent.style.transition = 'opacity 0.22s var(--ease-sheet)'; homeContent.style.opacity = '0'; }
  api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
    _todasReservas = reservas;
    // prepararHome(true, onListo): saltarFadeInicial=true evita que repita su propio
    // ciclo de fade/loader (ya hicimos el fade-out arriba, sin loader) — solo re-pide
    // getFechasDisponibles (enriquece mapsUrl/horaFin/duración/descripción, que
    // getReservasPersona no trae). `callback` (que en el touchend de #ptr-indicator
    // dispara _ptrOcultarIndicador(), y el ícono girando del botón desktop) se
    // dispara recién en `onListo`, en el mismo instante exacto en que prepararHome()
    // arranca el fadeIn real del contenido — no apenas resuelve este primer fetch.
    // Antes se llamaba acá mismo, mientras el segundo fetch (getFechasDisponibles,
    // dentro de prepararHome) todavía podía tardar 1-2s+ más — el indicador/ícono se
    // ocultaba/paraba con el contenedor todavía en opacity:0, una ventana sin ningún
    // loader visible (ver "Cambios recientes").
    prepararHome(true, function() {
      if (icon) icon.style.animation = '';
      if (callback) callback();
    });
  }, function(e) {
    // Repuebla primero, recién después revierte el fade-out con un fadeIn real
    // (antes se revertía opacity a 1 ANTES de re-renderizar — el contenido
    // viejo reaparecía de golpe, sin ninguna transición, a diferencia del
    // camino de éxito que sí anima la entrada vía prepararHome()).
    _renderHomeReservas();
    if (homeContent) { homeContent.style.opacity = '1'; void homeContent.offsetWidth; homeContent.style.animation = 'fadeIn 0.3s ease'; }
    if (icon) icon.style.animation = '';
    mostrarToast((e && e.message) || 'No se pudo actualizar. Intenta de nuevo.', 'error');
    if (callback) callback();
  });
}

var _ptrStartY = 0, _ptrArrastrando = false, _ptrRefrescando = false, _ptrProgreso = 0;
var _PTR_RANGO = 75, _PTR_MAX_VISUAL = 52;

function _ptrEnMisReservas() {
  var s = document.getElementById('s-home');
  return !!(s && s.classList.contains('activa'));
}

window.addEventListener('touchstart', function(e) {
  if (!_ptrEnMisReservas() || _ptrRefrescando) return;
  if ((window.scrollY || 0) > 0) return;
  _ptrStartY = e.touches[0].clientY;
  _ptrArrastrando = true;
  _ptrProgreso = 0;
  var anillo = document.getElementById('ptr-spinner');
  if (anillo) { anillo.style.animation = 'none'; anillo.style.transform = 'rotate(0deg)'; }
  // Texto de ayuda ("Desliza hacia abajo para recargar") oculto apenas arranca
  // el gesto, para no competir con el spinner agrandado mientras se arrastra
  // — se restaura en _ptrOcultarIndicador(), el único punto de "vuelta a
  // reposo" tanto si no llegó al umbral como al terminar un refresh real.
  var ptrHelper = document.getElementById('ptr-helper-texto');
  if (ptrHelper) ptrHelper.classList.add('ptr-helper-oculto');
}, { passive: true });

window.addEventListener('touchmove', function(e) {
  if (!_ptrArrastrando) return;
  var ind = document.getElementById('ptr-indicator');
  var anillo = document.getElementById('ptr-spinner');
  if (!ind || !anillo) return;
  // Clamp en vez de resetear+ocultar con transición: el dedo humano no es perfectamente
  // monótono (jitter de unos pocos px hacia arriba durante un arrastre neto hacia abajo),
  // y volver a activar la transición acá cortaba el seguimiento 1:1 con parpadeos (ver
  // diagnóstico pull-to-refresh en MANIFEST). Con el clamp el indicador solo se oculta
  // de verdad al soltar el dedo (touchend), nunca a mitad de gesto.
  var delta = Math.max(0, e.touches[0].clientY - _ptrStartY);
  var progreso = Math.min(delta / _PTR_RANGO, 1);
  _ptrProgreso = progreso;
  var offsetY = _PTR_MAX_VISUAL * (1 - Math.pow(1 - progreso, 2)); // resistencia tipo goma elástica
  var escala = 0.7 + 0.3 * progreso;
  ind.classList.add('ptr-sin-transicion');
  ind.style.opacity = Math.min(progreso / 0.15, 1);
  ind.style.transform = 'translate(-50%,' + (offsetY - _PTR_MAX_VISUAL) + 'px) scale(' + escala + ')';
  anillo.style.transform = 'rotate(' + (progreso * 360) + 'deg)';
}, { passive: true });

window.addEventListener('touchend', function() {
  if (!_ptrArrastrando) return;
  _ptrArrastrando = false;
  var ind = document.getElementById('ptr-indicator');
  var anillo = document.getElementById('ptr-spinner');
  var progreso = _ptrProgreso;
  _ptrProgreso = 0;
  if (!ind || !anillo) return;
  ind.classList.remove('ptr-sin-transicion');
  if (progreso >= 1) {
    _ptrRefrescando = true;
    ind.style.opacity = '1';
    ind.style.transform = 'translate(-50%,0) scale(1)';
    anillo.style.transform = 'rotate(0deg)';
    requestAnimationFrame(function() {
      anillo.style.animation = '';
      anillo.style.transform = '';
    });
    var yaResolvio = false;
    var backstop = setTimeout(function() {
      if (yaResolvio) return;
      yaResolvio = true; _ptrRefrescando = false; _ptrOcultarIndicador();
    }, 10000); // por si el fetch nunca resuelve (sin timeout propio en api()), no bloquear el gesto para siempre
    refrescarMisReservas(function() {
      if (yaResolvio) return;
      yaResolvio = true; clearTimeout(backstop);
      _ptrRefrescando = false; _ptrOcultarIndicador();
    });
  } else {
    _ptrOcultarIndicador();
  }
});

function _ptrOcultarIndicador() {
  var ind = document.getElementById('ptr-indicator');
  var anillo = document.getElementById('ptr-spinner');
  if (!ind) return;
  ind.classList.remove('ptr-sin-transicion');
  ind.style.opacity = '0';
  ind.style.transform = 'translate(-50%,-50px) scale(0.7)';
  if (anillo) { anillo.style.animation = 'none'; anillo.style.transform = 'rotate(0deg)'; }
  var ptrHelper = document.getElementById('ptr-helper-texto');
  if (ptrHelper) ptrHelper.classList.remove('ptr-helper-oculto');
}

function irNuevaReserva(skipEquip) {
  E.conf = ''; E.fechas = []; E.tallasPorFecha = {}; E.tipoPago = 'clase'; E.totalPago = 0; E.notaPago = ''; E.cuponAplicado = false; E.creditosUsados = 0; E.reagendando = false;
  var chkC = document.getElementById('chk-cupon'); if (chkC) chkC.checked = false;
  document.querySelectorAll('input[name="conf"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
  // Flecha atrás de #s4-nav condicional según el origen (ver "Cambios
  // recientes" -- bug real: antes dependía únicamente de `puedeElegir`
  // en `_s4ActualizarNav()`, js/reservas.js, sin importar si había o no una
  // pantalla previa real a la que volver). Con reservas activas, el usuario
  // necesariamente vio #s-home con contenido antes de llegar acá (el único
  // otro camino, `irReservas()`, redirige directo a esta función sin pasar
  // por #s-home cuando `activas.length===0`) -- mismo cálculo que ya usa
  // `irReservas()`, reusado acá en vez de pasarlo como parámetro por los 2
  // callers posibles (CTA de `#home-nav`, `irReservas()`).
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  _s4MostrarAtras = _clasificarReservas(_todasReservas || [], hoy).activas.length > 0;
  cargarFechas();
}
// Punto de entrada del tab "Reservas" de la nav inferior (ver "Cambios
// recientes" -- `entrar` de APP_BOTTOM_NAV_ITEMS, js/ui.js): sin ninguna
// reserva activa, salta directo a "Nueva Reserva" en vez de mostrar el
// estado vacío de #s-home ("¿Deseas hacer una reserva?" + 3 links
// secundarios) -- esa pantalla intermedia no aporta nada si de todos modos
// no hay nada que consultar. Con reservas activas, comportamiento de
// siempre (`ir('s-home')`, historial visible). Reusa `_clasificarReservas()`
// (la misma función que ya calcula "activas" para `_renderHomeReservas()`)
// sobre `_todasReservas` ya cargado en memoria -- sin pedir nada al backend
// de nuevo, este tab no hace un fetch propio al tocarlo.
function irReservas() {
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  var activas = _clasificarReservas(_todasReservas || [], hoy).activas;
  if (activas.length === 0) { irNuevaReserva(); return; }
  ir('s-home');
}

function irMisReservas() {
  _poblarPillsAnio();
  ir('s-misreservas');
}

function verTodasReservas() { irMisReservas(); }

function iniciarReagendamiento() {
  E.conf = ''; E.fechas = []; E.tallasPorFecha = {}; E.tipoPago = 'clase'; E.totalPago = 0;
  E.notaPago = ''; E.cuponAplicado = false; E.creditosUsados = 0; E.reagendando = true;
  var chkC = document.getElementById('chk-cupon'); if (chkC) chkC.checked = false;
  document.querySelectorAll('input[name="conf"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
  // Reagendar siempre parte de una reserva existente vista en #s-home -- ver
  // nota de `_s4MostrarAtras` en irNuevaReserva().
  _s4MostrarAtras = true;
  cargarFechas();
}

function irHomeDesdeExito() {
  // ir() primero: así el nav forzado más abajo aparece ya sobre #s-home (position:fixed,
  // independiente de qué .pantalla esté activa) en vez de asomar un instante sobre s6.
  ir('s-home');
  var homeContent = document.getElementById('home-reservas-lista');
  var reservasListas = false; // mismo guard que homeContenidoFinalListo en prepararHome(): evita que el
                               // spinner pise contenido si getReservasPersona resuelve antes de los 50ms
  // Llegar acá implica que confirmarReserva() ya guardó al menos una reserva nueva (s6 solo
  // se muestra si al menos una fecha/mes tuvo éxito) — no hace falta esperar la respuesta de
  // getReservasPersona para saber que el nav/header deben estar visibles. Sin esto, el spinner
  // quedaba "suelto" (sin nav ni "MIS RESERVAS"/"Ver historial" arriba) durante toda la espera
  // de red, y recién aparecía con el layout completo cuando el fetch resolvía — dos aspectos
  // visualmente distintos de la misma transición en vez de una sola (verificado con capturas
  // de pantalla cuadro a cuadro contra index.html real).
  _sincronizarNavHome(true);
  if (homeContent) {
    homeContent.style.transition = 'opacity 0.3s ease';
    homeContent.style.opacity = '0';
    setTimeout(function() {
      if (reservasListas) return;
      homeContent.innerHTML = '<div class="loader" style="padding:24px 0;"><div class="spinner"></div></div>';
      homeContent.style.opacity = '1';
    }, 50);
  }
  api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
    reservasListas = true;
    _todasReservas = reservas;
    // Confirma/corrige con datos reales (por si activas.length terminara siendo 0, caso
    // extremo) — ya no hace falta para la ventana de espera, esa la cubre el forzado de arriba.
    _sincronizarNavHome();
    // prepararHome(true) hace el único render real (con saltarFadeInicial=true no repite
    // su propio fade/spinner) — así queda una sola transición en vez de dos en secuencia.
    prepararHome(true);
  }, function() {
    reservasListas = true;
    // getReservasPersona falló — no hay datos nuevos para confirmar nada, así que se
    // mantiene forzado en vez de re-sincronizar con _todasReservas (todavía desactualizado,
    // podría no incluir la reserva recién creada y esconder el nav de nuevo sin motivo).
    // Pendiente conocido, no resuelto acá: si además getFechasDisponibles (dentro de
    // prepararHome(true), más abajo) también falla o resuelve con datos que dejan
    // activas.length en 0, su propio _renderHomeReservas() vuelve a llamar a
    // _sincronizarNavHome() sin forzar y podría ocultar el nav de nuevo — falla compuesta
    // de dos fetches fallando en la misma navegación, poco probable, señalada para otra pasada.
    _sincronizarNavHome(true);
    // aunque falle, dejamos que prepararHome(true) haga el render final (con lo que haya
    // en _todasReservas) para que el contenedor vuelva a opacity:1 con fadeIn — si solo se
    // llamaba _renderHomeReservas() acá, un error antes de los 50ms dejaba el contenedor
    // en opacity:0 para siempre.
    prepararHome(true);
  });
}

function _sincronizarNavHome(forzarVisible) {
  // Fuente única de si #home-nav/#home-nav-spacer/"Ver historial" deben estar
  // visibles — separado de _renderHomeReservas() para poder llamarlo apenas se conoce
  // _todasReservas (irHomeDesdeExito()), sin esperar a pintar las cards. El spacer se
  // mide acá mismo (no en _initHomeNav()) para que nunca quede calculado a partir de
  // un #home-nav que en ese instante seguía oculto (ver frente #4 del changelog).
  // forzarVisible=true salta el chequeo de _todasReservas — usado por irHomeDesdeExito()
  // apenas se navega a s-home, antes de tener datos frescos (ver ahí el porqué).
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var clasificado = _clasificarReservas(_todasReservas || [], hoy);
  var activas = clasificado.activas;
  var homeNav = document.getElementById('home-nav');
  var homeNavSpacer = document.getElementById('home-nav-spacer');
  var ptrHelper = document.getElementById('ptr-helper-texto');
  // Ícono de historial (ver "Cambios recientes"): oculto por completo, no
  // deshabilitado, cuando no hay ninguna reserva pasada -- reusa el mismo
  // `_clasificarReservas()`/`_todasReservas` ya cargado para las cards de
  // home (la misma fuente que alimenta `_poblarPillsAnio()`, la pantalla que
  // este botón abre), sin ningún fetch dedicado. Re-evaluado acá porque
  // `_sincronizarNavHome()` ya es la fuente única de qué mostrar en este nav
  // y corre en cada punto natural de refresco de datos (carga inicial, PTR,
  // tras crear una reserva) -- el ícono aparece solo, sin recargar la app,
  // apenas la 1ra reserva pasa a formar parte del historial.
  var historialBtn = document.getElementById('home-nav-historial');
  if (historialBtn) historialBtn.style.display = clasificado.historial.length > 0 ? '' : 'none';

  if (!forzarVisible && activas.length === 0) {
    if (homeNav) homeNav.style.display = 'none';
    if (homeNavSpacer) homeNavSpacer.style.display = 'none';
    if (ptrHelper) ptrHelper.style.display = 'none';
  } else {
    if (homeNav) homeNav.style.display = 'flex';
    if (homeNavSpacer) {
      homeNavSpacer.style.display = '';
      if (homeNav) homeNavSpacer.style.height = (homeNav.offsetHeight + 8) + 'px';
    }
    if (ptrHelper) ptrHelper.style.display = '';
  }
  // Bug real corregido (ver MANIFEST, "Cambios recientes" — nav duplicado al
  // volver a Home tras la primera reserva): forzarVisible fuerza #home-nav
  // ("MIS RESERVAS", estado "con reservas") a mostrarse de inmediato, antes
  // de tener datos reales — pero #home-empty-topbar (avatar + "¿Dudas?
  // Contáctanos", estado "sin reservas") seguía sin tocar acá, así que si
  // venía visible de antes (usuario en su primera reserva) quedaba
  // superpuesto con #home-nav hasta que _renderHomeReservas() lo resolvía
  // recién al terminar el fetch de irHomeDesdeExito(). Como forzarVisible
  // solo se usa cuando el caller YA sabe que hay al menos una reserva activa
  // (ver esa nota en irHomeDesdeExito()), se oculta acá mismo, en el mismo
  // instante que se fuerza #home-nav — nunca ambos headers a la vez.
  if (forzarVisible) {
    var emptyTopbarForzado = document.getElementById('home-empty-topbar');
    if (emptyTopbarForzado) emptyTopbarForzado.style.display = 'none';
  }
  return activas;
}

function _renderHomeReservas() {
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var activas = _sincronizarNavHome();
  var container = document.getElementById('home-reservas-lista');

  // Topbar ("¿Dudas? Contáctanos") es un elemento persistente fuera de
  // #home-reservas-lista (index.html) — acá solo se sincroniza su visibilidad,
  // nunca se re-crea ni queda expuesta a que un innerHTML del contenedor dinámico
  // (loader genérico, re-render) se la lleve puesta (ver "Cambios recientes").
  var emptyTopbar = document.getElementById('home-empty-topbar');
  if (emptyTopbar) emptyTopbar.style.display = activas.length === 0 ? 'flex' : 'none';

  var html = activas.length === 0
    ? '<div class="empty-state-body">' +
        // Todo el recuadro es clickeable (irNuevaReserva(), mismo handler que
        // el botón "Hacer una reserva" del footer, sin duplicar lógica) — el
        // badge "+" (.empty-state-icon-badge, css/home.css) es decorativo.
        '<div class="empty-state-icon" onclick="irNuevaReserva()">' +
          '<span class="material-symbols-outlined">calendar_month</span>' +
          '<span class="empty-state-icon-badge"><span class="material-symbols-outlined">add</span></span>' +
        '</div>' +
        '<div class="empty-state-saludo">¿Deseas hacer una reserva?</div>' +
        '<div class="empty-state-msg">Haz una o más reservas para consultarlas aquí. Presiona el recuadro con el ícono de calendario o el botón de abajo para hacer una reserva. También si deseas puedes:</div>' +
        '<div class="empty-state-links">' +
          '<span class="aj-pill aj-pill-link" onclick="irMisReservas()">Ver historial de reservas</span>' +
          '<span class="aj-pill aj-pill-link" onclick="irEditarDatos()">Editar tu perfil</span>' +
          '<span class="aj-pill aj-pill-link" onclick="abrirSheetEquipHome()">Cambiar tu equipamiento</span>' +
        '</div>' +
      '</div>'
    : activas.map(function(r) { return _renderCardHome(r, hoy); }).join('');

  container.innerHTML = html;
}

function verMasHomeReservas() {
  var wrap = document.getElementById('reservas-scroll-wrap');
  if (!wrap) return;
  var estaAbajo = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 10;
  wrap.scrollTo({ top: estaAbajo ? 0 : wrap.scrollTop + 260, behavior: 'smooth' });
}

function _initScrollReservas() {
  var wrap = document.getElementById('reservas-scroll-wrap');
  var btn  = document.getElementById('btn-ver-mas-home');
  var fila = document.getElementById('fila-botones-home');
  if (!wrap) return;

  function actualizarMascara() {
    var scrollable = wrap.scrollHeight > wrap.clientHeight + 4;
    if (!scrollable) {
      wrap.className = wrap.className.replace(/mask-\w+|sin-mascara/g,'').trim() + ' sin-mascara';
      if (fila) fila.style.display = 'none';
      return;
    }
    if (fila) fila.style.display = 'flex';
    var top    = wrap.scrollTop < 8;
    var bottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 8;
    wrap.classList.remove('mask-middle','mask-top','sin-mascara');
    if (top && bottom) {
      wrap.classList.add('sin-mascara');
    } else if (top) {
      /* sin máscara arriba, fade abajo — clase por defecto, no agregar nada */
    } else if (bottom) {
      wrap.classList.add('mask-top');
      if (btn) btn.classList.add('arriba');
    } else {
      wrap.classList.add('mask-middle');
      if (btn) btn.classList.remove('arriba');
    }
    if (!bottom && btn) btn.classList.remove('arriba');
  }

  wrap.removeEventListener('scroll', actualizarMascara);
  wrap.addEventListener('scroll', actualizarMascara);
  actualizarMascara();
}

function _parsearFechaCard(fechaStr) {
  var partes = fechaStr.split(' - ');
  return { fechaPura: (partes[0] || fechaStr).trim(), hora: (partes[1] || '').trim(), lugar: (partes[2] || '').trim() };
}

function _formatarFechaRelativa(fechaPura) {
  var m = fechaPura.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
  if (!m) return fechaPura;
  var mesNorm = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  var mes = _MESES_MAP[mesNorm];
  if (mes === undefined) return fechaPura;
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var fd = new Date(hoy.getFullYear(), mes, parseInt(m[1])); fd.setHours(0,0,0,0);
  if (fd < hoy) fd.setFullYear(hoy.getFullYear() + 1);
  var diff = Math.round((fd - hoy) / 86400000);
  if (diff === 0) return 'Hoy';
  // "Mañana"/"Pasado mañana" cuentan días hacia adelante, no nombran un día
  // de la semana — nunca son ambiguos cruzando el límite de semana (a
  // diferencia de "Este X" más abajo), así que van antes del corte y sin
  // excepción.
  if (diff === 1) return 'Mañana';
  if (diff === 2) return 'Pasado mañana';
  // Bug real corregido (ver MANIFEST, "Cambios recientes"): "Este X"/"X que
  // viene" usaban una ventana fija de días (3-6 / 7-13) sin importar en qué
  // día de la semana caía "hoy" — con "hoy" a mitad de semana, esa ventana se
  // corría hacia la semana SIGUIENTE (ej. "Este Lunes" terminaba señalando
  // el lunes de la semana que viene, no el de esta). Único criterio real de
  // "semana actual" pedido: hoy hasta el domingo que viene inclusive — si
  // hoy ya es domingo, la semana actual termina hoy mismo (0 días más). Se
  // quita "X que viene" por completo: cualquier fecha más allá de ese corte
  // muestra la fecha real tal cual vino del backend ("Sábado 12 de Enero",
  // ya en el formato día-de-semana + día + mes pedido) en vez de una
  // etiqueta relativa — salvo que caiga en otro año que el actual, en cuyo
  // caso se le suma " de <año>" (el string del backend nunca trae año
  // propio, así que sin esto una fecha de enero del año que viene se vería
  // idéntica a una de este enero).
  var diasHastaFinDeSemana = (7 - hoy.getDay()) % 7;
  var dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  if (diff <= diasHastaFinDeSemana) return 'Este ' + dias[fd.getDay()];
  // "Próximo X" (pedido explícito para la card de reserva de home, ver
  // "Cambios recientes"): mismo bloque lunes-domingo que ya define
  // `_evEsProximaSemana()` (js/eventos.js) como "semana siguiente" -- de
  // `diasHastaFinDeSemana+1` a `diasHastaFinDeSemana+7`. Más allá de esa
  // ventana (2+ semanas), se vuelve a la fecha completa de siempre.
  if (diff <= diasHastaFinDeSemana + 7) return 'Próximo ' + dias[fd.getDay()];
  return fd.getFullYear() !== hoy.getFullYear() ? fechaPura + ' de ' + fd.getFullYear() : fechaPura;
}

function reagendarDesdeCard(fecha, btn) {
  if (!confirm('Se cancelará tu reserva para ' + fecha + ' y podrás elegir una nueva fecha. ¿Continuar?')) return;
  btn.disabled = true;
  api({ action: 'cancelarReserva', nombre: E.nombre, fecha: fecha }, function(res) {
    if (res.exito) {
      if (_todasReservas) _todasReservas.forEach(function(r) { if (r.fecha === fecha && r.estado !== 'Cancelada') r.estado = 'Cancelada'; });
      if (res.cuponRestaurado) { localStorage.removeItem('cupon_' + E.nombre); if (E.datos) E.datos.cuponDisponible = true; }
      irNuevaReserva();
    } else { btn.disabled = false; mostrarToast('Error al cancelar.', 'error'); }
  }, function(e) { btn.disabled = false; mostrarToast(e.message || 'Error al cancelar.', 'error'); });
}

// "14:00" -> "14hs", "14:30" -> "14:30hs" -- en punto se lee mejor sin los
// minutos dentro de la frase "a las 14hs" que arma _renderCardHome(); con
// minutos reales se conservan (no hay forma linda de redondear sin perder
// información). El `hora` de `r.fecha` a veces ya viene con el sufijo "hs"
// incluido desde el backend (bug real corregido, ver "Cambios recientes" --
// producía "19:10hshs") -- se saca ese sufijo si ya está antes de
// reconstruir, así nunca se duplica sin importar si la fuente lo trae o no.
function _formatearHoraTexto(hora) {
  var horaBase = hora.replace(/\s*hs\s*$/i, '');
  var m = horaBase.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return horaBase + 'hs';
  return (m[2] === '00' ? m[1] : m[1] + ':' + m[2]) + 'hs';
}

function _renderCardHome(r, hoy) {
  var partes = (r.fecha || '').split(' - ');
  // Fecha+hora fusionadas en un solo renglón de título (ver "Cambios
  // recientes"): reusa _formatarFechaRelativa() (arriba en este archivo, ya
  // extendida acá mismo con el bracket "Próximo X") en vez de reimplementar
  // el cálculo de Hoy/Mañana que antes vivía inline acá.
  var fechaTexto = _formatarFechaRelativa((partes[0] || r.fecha).trim());
  var hora = partes[1] ? partes[1].trim() : '';
  var lugar = partes[2] ? partes[2].trim() : '';
  var fechaHoraTexto = hora ? fechaTexto + ' a las ' + _formatearHoraTexto(hora) : fechaTexto;

  var estadoClase = r.estado === 'Confirmada' ? 'confirmada-clase' : r.estado === 'Reagendar' ? 'reagendar-clase' : 'pendiente-clase';
  var estadoColor = r.estado === 'Confirmada' ? 'var(--success-dark)' : r.estado === 'Cancelada' ? 'var(--danger)' : r.estado === 'Reagendar' ? 'var(--dk-purple-mid)' : 'var(--brand)';
  var estadoIcono = r.estado === 'Confirmada' ? 'check_circle' : r.estado === 'Cancelada' ? 'cancel' : r.estado === 'Reagendar' ? 'swap_horiz' : 'hourglass_empty';
  var estadoTexto = r.estado || 'Pendiente';
  var fechaEsc = (r.fecha || '').replace(/'/g, "\\'");

  var necesitaPatines = r.talla && r.talla !== '' && r.talla.toLowerCase() !== 'no';
  var necesitaProtec = r.protecciones && r.protecciones !== '' && r.protecciones.toLowerCase() !== 'no' && r.protecciones.toLowerCase().indexOf('no,') !== 0;
  // Pill de talla separado del de protecciones (antes un solo `equipPillHtml`
  // acumulado) -- ver "Cambios recientes": el de talla pasa al acordeón
  // "Más información" mientras que el de protecciones (pedido explícito, no
  // tocado) se queda visible en su fila de siempre.
  var patinesPillHtml = '';
  if (necesitaPatines) {
    var puedeEditarTalla = (r.estado === 'Pendiente' || r.estado === 'Confirmada');
    if (puedeEditarTalla) {
      var tallaEsc = (r.talla || '').replace(/'/g, "\\'");
      patinesPillHtml = '<span class="fi-pill fi-pill-patines" style="cursor:pointer;" onclick="abrirSheetTalla(\'' + fechaEsc + '\',\'' + tallaEsc + '\')"><span class="material-symbols-outlined">roller_skating</span>' + (r.talla || '') + '<span class="material-symbols-outlined">edit</span></span>';
    } else {
      patinesPillHtml = '<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">roller_skating</span>' + (r.talla || '') + '</span>';
    }
  }
  var protecPillHtml = '';
  if (necesitaProtec) {
    var protecLower = r.protecciones.toLowerCase();
    var protecTexto = (protecLower === 'no' || protecLower === 'no, tengo las mías' || protecLower === 'no, tengo las mias') ? '' :
      (protecLower.indexOf('completa') !== -1 || protecLower === 'sí' || protecLower === 'si') ? 'Protecciones completas' : 'Necesita: ' + r.protecciones;
    if (!protecTexto) { }
    var puedeEditarProtec = (r.estado === 'Pendiente' || r.estado === 'Confirmada');
    if (puedeEditarProtec) {
      var protecEsc = (r.protecciones || '').replace(/'/g, "\\'");
      protecPillHtml = '<span class="fi-pill fi-pill-patines" style="cursor:pointer;" onclick="abrirSheetProtecReserva(\'' + fechaEsc + '\',\'' + protecEsc + '\')"><span class="material-symbols-outlined">shield</span>' + protecTexto + '<span class="material-symbols-outlined">edit</span></span>';
    } else {
      protecPillHtml = '<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">shield</span>' + protecTexto + '</span>';
    }
  }
  var equipoNotaHtml = '';
  if (!necesitaPatines && !necesitaProtec) {
    equipoNotaHtml = '<span class="fi-pill fi-pill-equip"><span class="material-symbols-outlined">check_circle</span>Llevas tu equipo</span>';
  }
  var estadoLabel = r.estado === 'Confirmada' ? 'Reserva confirmada' : r.estado === 'Cancelada' ? 'Reserva cancelada' : r.estado === 'Reagendar' ? 'Clase a favor' : 'Reserva pendiente';
  // Pill de ancho automático con tinte+borde (ver "Cambios recientes" --
  // reusa `.badge`/`.badge-*`, mismo componente ya usado en admin.js/
  // eventos.js, en vez de la barra de fondo sólido a todo el ancho de
  // antes) + "¿Qué significa esto?" como texto tenue al lado, misma fila.
  var badgeClase = 'badge-' + (r.estado === 'Confirmada' ? 'confirmada' : r.estado === 'Cancelada' ? 'cancelada' : r.estado === 'Reagendar' ? 'reagendar' : 'pendiente');
  var statusBar = '<div class="rn-status-row">' +
    '<span class="badge ' + badgeClase + '"><span class="material-symbols-outlined">' + estadoIcono + '</span>' + estadoLabel + '</span>' +
    '<span class="rn-status-info" onclick="abrirModalEstados()">¿Qué significa esto?</span>' +
    '</div>';

  var esMensual = _MESES_MAP[(r.fecha || '').toLowerCase().trim()] !== undefined;

  // Pill de ubicación al lado del título, no en su propia fila (ver "Cambios
  // recientes"). Hora ya fusionada en fechaHoraTexto; "Llevas tu equipo" (el
  // único caso que NO trae un pill accionable de talla/protecciones) pasa al
  // acordeón "Más información" -- ver bodyHtml más abajo.
  var lugarPillHtml = '';
  if (lugar) {
    if (r.mapsUrl) {
      lugarPillHtml = '<a class="fi-pill fi-pill-lugar" href="' + r.mapsUrl + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><span class="material-symbols-outlined">location_on</span>' + lugar + '</a>';
    } else {
      lugarPillHtml = '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>';
    }
  }

  // Solo protecciones se queda visible en la fila de siempre -- talla pasó
  // al acordeón (ver bodyHtml más abajo).
  var pillsHtml = '';
  if (!esMensual && necesitaProtec) {
    pillsHtml = '<div class="fi-pills">' + protecPillHtml + '</div>';
  }

  var uid = 'rcard-' + (r.fila || Math.random().toString(36).slice(2));
  var filaEsc = r.fila || '';

  var bodyHtml = '<div class="rn-body" id="' + uid + '-body"><div class="rn-body-inner">';
  if (r.descripcion) bodyHtml += '<p style="margin-bottom:25px;">' + r.descripcion + '</p>';
  bodyHtml += '<div class="fi-pills">';
  if (!esMensual) bodyHtml += patinesPillHtml + equipoNotaHtml;
  if (r.horaFin) bodyHtml += '<span class="fi-pill"><span class="material-symbols-outlined">schedule</span>Fin ' + r.horaFin + '</span>';
  if (r.duracion) bodyHtml += '<span class="fi-pill"><span class="material-symbols-outlined">timer</span>' + r.duracion + '</span>';
  bodyHtml += '</div></div></div>';

  var rnTopRight = lugarPillHtml;
  if (esMensual) {
    rnTopRight = '<div class="rn-top-extra fi-pills">' + patinesPillHtml + protecPillHtml + equipoNotaHtml;
    if (r.validezHasta) rnTopRight += '<span class="fi-pill fi-pill-validez"><span class="material-symbols-outlined">event_available</span>Válido hasta ' + r.validezHasta + '</span>';
    rnTopRight += '</div>';
  }

  // "Re-agendar o cancelar reserva" comparte renglón con "Más información"
  // (ver "Cambios recientes" -- antes vivía en su propia fila, arriba del
  // acordeón). Reservas mensuales no lo necesitan acá: ya muestran su
  // propio "Cancelar reserva" siempre visible más abajo, sin acordeón.
  var masInfoHtml;
  if (esMensual) {
    masInfoHtml = '<div class="rn-divider"></div><div class="rn-cancel-wrap"><button class="btn-cancel-text" onclick="abrirGestionar(\'' + fechaEsc + '\',' + filaEsc + ')">Cancelar reserva</button></div>';
  } else {
    masInfoHtml = '<div class="rn-divider"></div>' +
      '<div class="rn-footer-row">' +
      '<div class="rn-mas-info" id="' + uid + '-toggle" onclick="_toggleCardBody(\'' + uid + '\')">' +
      '<span>Más información</span><span class="material-symbols-outlined rn-chevron">expand_more</span></div>' +
      '<button class="rn-btn-reagendar" onclick="event.stopPropagation();abrirGestionar(\'' + fechaEsc + '\',' + filaEsc + ')">' +
      '<span class="rn-btn-reagendar-full">Re-agendar o cancelar reserva</span>' +
      '<span class="rn-btn-reagendar-corto">Re-agendar/cancelar</span>' +
      '</button>' +
      '</div>' +
      bodyHtml;
  }

  return '<div class="res-card-home res-card-nueva ' + estadoClase + '">' +
    statusBar +
    '<div class="rn-header">' +
    '<div class="rn-top"><div class="rn-date">' + fechaHoraTexto + '</div>' + rnTopRight + '</div>' +
    pillsHtml +
    '</div>' +
    masInfoHtml +
    '</div>';
}

// Mismo mecanismo que _evAbrirPanel()/_evCerrarPanel() (js/eventos.js): el
// techo de la animación es el scrollHeight real del contenido, no un valor
// fijo -- ver el comentario de `.res-card-nueva .rn-body` (css/home.css)
// para el detalle completo del bug que esto corrige (apertura "de golpe").
function _toggleCardBody(uid) {
  var toggle = document.getElementById(uid + '-toggle');
  var body = document.getElementById(uid + '-body');
  if (!toggle || !body) return;
  toggle.classList.toggle('open');
  if (body.classList.contains('open')) {
    body.classList.remove('open');
    body.style.maxHeight = '0px';
  } else {
    body.classList.add('open');
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

var _tallaSheetFecha = '', _tallaSheetActual = '', _tallaSheetSel = null, _tallaSheetModo = 'existente', _tallaSheetSlug = '';

function abrirSheetTalla(fecha, tallaActual) {
  _tallaSheetModo = 'existente';
  var titulo = document.getElementById('sheet-talla-titulo');
  if (titulo) titulo.textContent = 'Cambiar talla para el entrenamiento del ' + fecha;
  var btn = document.getElementById('btn-confirmar-talla');
  if (btn) btn.textContent = 'Confirmar talla';
  _abrirSheetTallaBase(fecha, tallaActual);
}

function _abrirSheetTallaBase(fecha, tallaActual) {
  _tallaSheetFecha = fecha; _tallaSheetActual = tallaActual; _tallaSheetSel = null;
  var grid = document.getElementById('sheet-talla-grid');
  if (grid) grid.innerHTML = '<div class="loader" style="grid-column:1/-1;padding:20px 0;"><div class="spinner" style="width:26px;height:26px;border-width:3px;"></div></div>';
  var errEl = document.getElementById('err-sheet-talla');
  if (errEl) errEl.style.display = 'none';
  var avisoProtec = document.getElementById('sheet-talla-aviso-protec');
  if (avisoProtec) avisoProtec.style.display = 'none';
  _habilitarConfirmarTalla(false);
  var ov = document.getElementById('sheet-talla-overlay');
  var sh = document.getElementById('sheet-talla');
  if (ov) ov.style.display = 'block';
  if (sh) {
    sh.style.display = 'block';
    requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  }
  _registrarOverlayAbierto(cerrarSheetTalla);
  api({ action: 'getTallasDisponiblesParaFecha', fecha: fecha, nombreExcluir: E.nombre }, function(tallas) {
    _renderGridSheetTalla(tallas || []);
  }, function() {
    if (grid) grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:0.8rem;">No se pudieron cargar las tallas. Intenta de nuevo.</p>';
  });
}

function _renderGridSheetTalla(tallas) {
  var grid = document.getElementById('sheet-talla-grid');
  if (!grid) return;
  var html = '';
  if (_tallaSheetModo === 'existente') {
    var esActualNo = !_tallaSheetActual;
    html += '<span class="aj-pill sheet-talla-pill-ancha' + (esActualNo ? ' talla-actual' : '') + '" style="justify-content:center;" onclick="seleccionarTallaSheet(this,\'\')">No necesitaré patines</span>';
  }
  html += tallas.map(function(t) {
    var esActual = t.talla === _tallaSheetActual;
    var clases = 'aj-pill' + (t.disponible ? '' : ' no-disponible') + (esActual && t.disponible ? ' talla-actual' : '');
    var onclick = t.disponible ? ' onclick="seleccionarTallaSheet(this,\'' + t.talla + '\')"' : '';
    return '<span class="' + clases + '" style="justify-content:center;"' + onclick + '>' + t.talla + '</span>';
  }).join('');
  grid.innerHTML = html;
  void grid.offsetWidth;
  grid.style.animation = 'fadeIn 0.3s ease';
}

function seleccionarTallaSheet(el, talla) {
  document.querySelectorAll('#sheet-talla-grid .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  _tallaSheetSel = talla;
  var errEl = document.getElementById('err-sheet-talla');
  if (errEl) errEl.style.display = 'none';
  _habilitarConfirmarTalla(talla !== _tallaSheetActual);
}

function _habilitarConfirmarTalla(habilitar) {
  var btn = document.getElementById('btn-confirmar-talla');
  if (!btn) return;
  btn.disabled = !habilitar;
  btn.style.opacity = habilitar ? '1' : '0.4';
  btn.style.cursor = habilitar ? 'pointer' : 'not-allowed';
}

function cerrarSheetTalla(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('sheet-talla');
  var ov = document.getElementById('sheet-talla-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function confirmarTallaSheet() {
  if (_tallaSheetSel === null || _tallaSheetSel === _tallaSheetActual) return;
  if (_tallaSheetModo === 'nueva-reserva') { _confirmarTallaNuevaReserva(); return; }
  var btn = document.getElementById('btn-confirmar-talla');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  api({ action: 'actualizarTallaReserva', nombre: E.nombre, fecha: _tallaSheetFecha, tallaNueva: _tallaSheetSel }, function() {
    if (btn) btn.textContent = 'Confirmar talla';
    cerrarSheetTalla();
    _recargarYRenderReservas(function() { mostrarToast('Talla actualizada', 'ok'); });
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar talla'; }
    err('err-sheet-talla', e.message || 'No se pudo actualizar la talla. Intenta de nuevo.');
  });
}

var _protecSheetFecha = '', _protecSheetActual = '';

function abrirSheetProtecReserva(fecha, protecActual) {
  _protecSheetFecha = fecha; _protecSheetActual = protecActual || '';
  var titulo = document.getElementById('sheet-protec-reserva-titulo');
  if (titulo) titulo.textContent = 'Cambiar protecciones para el entrenamiento del ' + fecha;
  document.querySelectorAll('#s3c-pills-reserva .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  document.getElementById('bs-protec-parciales-reserva').style.display = 'none';
  document.querySelectorAll('#bs-protec-pills-reserva .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  var sub = document.getElementById('protec-otro-sub-reserva');
  if (sub) { sub.textContent = 'Toca para especificar'; sub.style.color = ''; }
  var err1 = document.getElementById('err-sheet-protec-reserva'); if (err1) err1.textContent = '';
  var err2 = document.getElementById('err-protec-parciales-reserva'); if (err2) err2.textContent = '';
  var protecLower = _protecSheetActual.toLowerCase();
  if (protecLower === 'sí' || protecLower === 'si') {
    var p = document.querySelector('#s3c-pills-reserva .equip-pill-protec[data-val="Sí"]');
    if (p) p.classList.add('sel');
  } else if (!_protecSheetActual || protecLower === 'no') {
    var p = document.querySelector('#s3c-pills-reserva .equip-pill-protec[data-val="No"]');
    if (p) p.classList.add('sel');
  } else {
    var p = document.getElementById('pill-protec-otro-reserva');
    if (p) p.classList.add('sel');
    document.getElementById('bs-protec-parciales-reserva').style.display = 'block';
    _protecSheetActual.split(',').forEach(function(v) {
      var pill = document.querySelector('#bs-protec-pills-reserva .aj-pill[data-val="' + v.trim() + '"]');
      if (pill) pill.classList.add('activa');
    });
  }
  var ov = document.getElementById('sheet-protec-reserva-overlay');
  var sh = document.getElementById('sheet-protec-reserva');
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(cerrarSheetProtecReserva);
}

function _selProtecReserva(el) {
  document.querySelectorAll('#s3c-pills-reserva .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  var val = el.dataset.val;
  document.getElementById('bs-protec-parciales-reserva').style.display = val === 'Otro' ? 'block' : 'none';
}

function cerrarSheetProtecReserva(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('sheet-protec-reserva');
  var ov = document.getElementById('sheet-protec-reserva-overlay');
  sh.style.transform = 'translateY(100%)';
  setTimeout(function() { sh.style.display = 'none'; ov.style.display = 'none'; }, 350);
}

function confirmarProtecReserva(btn) {
  var sel = document.querySelector('#s3c-pills-reserva .equip-pill-protec.sel');
  if (!sel) { err('err-sheet-protec-reserva', 'Selecciona una opción.'); return; }
  var val = sel.dataset.val;
  var protecFinal;
  if (val === 'Sí') { protecFinal = 'Sí'; }
  else if (val === 'No') { protecFinal = 'No'; }
  else {
    var vals = [];
    document.querySelectorAll('#bs-protec-pills-reserva .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
    if (!vals.length) { err('err-protec-parciales-reserva', 'Selecciona al menos una opción.'); return; }
    if (vals.length === 4) { err('err-protec-parciales-reserva', 'Si necesitas las 4, selecciona "protecciones completas".'); return; }
    protecFinal = vals.join(', ');
  }
  if (protecFinal === _protecSheetActual) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  api({ action: 'actualizarProtecReserva', nombre: E.nombre, fecha: _protecSheetFecha, protecNueva: protecFinal }, function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar protecciones'; }
    cerrarSheetProtecReserva();
    _recargarYRenderReservas(function() { mostrarToast('Protecciones actualizadas', 'ok'); });
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar protecciones'; }
    err('err-sheet-protec-reserva', e.message || 'No se pudo actualizar. Intenta de nuevo.');
  });
}

function _parseFechaSimple(str) {
  if (!str) return null;
  var m = str.toString().trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  var d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  d.setHours(0,0,0,0); return d;
}

function _parseFechaStr(fechaStr) {
  var m = fechaStr.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
  if (!m) return null;
  var mesRaw = m[2].toLowerCase();
  var mesNorm = mesRaw.normalize ? mesRaw.normalize('NFD').replace(/[̀-ͯ]/g,'') : mesRaw;
  var mes = _MESES_MAP[mesNorm];
  if (mes === undefined) return null;
  var d = new Date(new Date().getFullYear(), mes, parseInt(m[1]));
  d.setHours(0,0,0,0); return d;
}

function _clasificarReservas(todas, hoy) {
  var tieneActivaMensual = todas.some(function(r) {
    if (_MESES_MAP[r.fecha.toLowerCase().trim()] === undefined) return false;
    if (r.estado === 'Cancelada') return false;
    var vh = _parseFechaSimple(r.validezHasta);
    return !vh || hoy <= vh;
  });
  var activas = [], historial = [], expMostr = false;
  todas.forEach(function(r) {
    var f = r.fecha.toLowerCase().trim(), estado = r.estado;
    if (estado === 'Cancelada' || estado === 'Crédito usado') { historial.push(r); return; }
    if (_MESES_MAP[f] !== undefined) {
      var vh = _parseFechaSimple(r.validezHasta);
      var exp = vh ? hoy > vh : false;
      if (exp) { (!tieneActivaMensual && !expMostr) ? (activas.push(r), expMostr = true) : historial.push(r); }
      else activas.push(r);
    } else {
      var fd = _parseFechaStr(r.fecha);
      if (!fd) { historial.push(r); return; }
      fd >= hoy ? activas.push(r) : historial.push(r);
    }
  });
  return { activas: activas, historial: historial };
}

function _getAnioReserva(r) {
  var vh = r.validezHasta ? r.validezHasta.toString().trim() : '';
  var m = vh.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return parseInt(m[3]);
  return new Date().getFullYear();
}

function _poblarPillsAnio() {
  var cont = document.getElementById('historial-pills-anio');
  if (!cont) return;
  var hoy = new Date();
  var hist = _clasificarReservas(_todasReservas || [], hoy).historial;
  var aniosConReservas = {};
  hist.forEach(function(r) {
    var a = _getAnioReserva(r);
    if (a) aniosConReservas[a] = true;
  });
  var aniosOrdenados = Object.keys(aniosConReservas).map(Number).sort(function(a,b){return b-a;});
  if (aniosOrdenados.length === 0) {
    cont.innerHTML = '';
    window._historialAnioActual = null;
    renderHistorialMeses();
    return;
  }
  cont.innerHTML = aniosOrdenados.map(function(a, idx) {
    var activa = idx === 0 ? ' activa' : '';
    return '<button class="historial-pill' + activa + '" data-anio="' + a + '" onclick="seleccionarPillAnio(this,' + a + ')">' + a + '</button>';
  }).join('');
  window._historialAnioActual = aniosOrdenados[0];
  renderHistorialMeses();
}

function seleccionarPillAnio(pill, anio) {
  document.querySelectorAll('#historial-pills-anio .historial-pill').forEach(function(p){ p.classList.remove('activa'); });
  pill.classList.add('activa');
  window._historialAnioActual = anio;
  window._historialMesAbierto = undefined;
  renderHistorialMeses();
}

function _getMesReserva(r) {
  var f = r.fecha.toLowerCase().trim();
  if (_MESES_MAP[f] !== undefined) return _MESES_MAP[f];
  var m = f.match(/\d{1,2}\s+de\s+([a-záéíóúñ]+)/i);
  if (!m) return -1;
  var mn = m[1].normalize ? m[1].normalize('NFD').replace(/[̀-ͯ]/g,'') : m[1];
  return _MESES_MAP[mn] !== undefined ? _MESES_MAP[mn] : -1;
}

function renderHistorialMeses() {
  var anio = window._historialAnioActual;
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var hist = _clasificarReservas(_todasReservas || [], hoy).historial;
  var delAnio = hist.filter(function(r) { return _getAnioReserva(r) === anio; });
  var porMes = {};
  delAnio.forEach(function(r) {
    var m = _getMesReserva(r);
    if (m < 0) return;
    if (!porMes[m]) porMes[m] = [];
    porMes[m].push(r);
  });
  var mesesOrdenados = Object.keys(porMes).map(Number).sort(function(a,b){return b-a;});
  var wrap = document.getElementById('historial-meses');
  if (!wrap) return;
  if (mesesOrdenados.length === 0) {
    wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:24px 0;">No hay reservas archivadas en este año.</p>';
    return;
  }
  var html = '';
  mesesOrdenados.forEach(function(m, idx) {
    var abierto = idx === 0, mId = 'hmes-' + m;
    html += '<div style="border:2px solid var(--border-light);border-radius:12px;margin-bottom:10px;overflow:hidden;">';
    html += '<div onclick="toggleMesHistorial(\'' + mId + '\',this)" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;" class="datos-seccion-titulo">';
    html += '<span style="font-weight:800;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.8px;color:var(--brand);">' + _MESES_DISPLAY[m] + ' ' + anio + '</span>';
    html += '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:0.72rem;color:var(--muted);background:var(--brand-lightest);padding:2px 8px;border-radius:99px;">' + porMes[m].length + '</span>';
    html += '<span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--dk-text-muted);transition:transform 0.3s;' + (abierto ? 'transform:rotate(180deg);' : '') + '">expand_more</span></div></div>';
    html += '<div id="' + mId + '" style="overflow:hidden;transition:max-height 0.4s cubic-bezier(0.16,1,0.3,1),opacity 0.3s ease;' + (abierto ? 'max-height:3000px;opacity:1;padding:10px 10px 4px;' : 'max-height:0;opacity:0;padding:0;') + '">';
    porMes[m].forEach(function(r) { html += _renderCardHistorial(r); });
    html += '</div></div>';
  });
  wrap.innerHTML = html;
  void wrap.offsetWidth;
  wrap.style.animation = 'fadeIn 0.3s ease';
}

function toggleMesHistorial(id, header) {
  var el = document.getElementById(id), chevron = header.querySelector('.material-symbols-outlined');
  var abierto = el.style.maxHeight && el.style.maxHeight !== '0px' && el.style.maxHeight !== '0';
  document.querySelectorAll('[id^="hmes-"]').forEach(function(e2) {
    e2.style.maxHeight = '0'; e2.style.opacity = '0'; e2.style.padding = '0';
    var hd = e2.previousElementSibling;
    if (hd) { var c = hd.querySelector('.material-symbols-outlined'); if (c) c.style.transform = ''; }
  });
  if (!abierto) {
    el.style.maxHeight = el.scrollHeight + 200 + 'px';
    el.style.opacity = '1'; el.style.padding = '10px 10px 4px';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  }
}

var _MESES_ABREV = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

function _renderCardHistorial(r) {
  var estStyle = {
    'Confirmada': ['var(--success-bg)','var(--success-dark)'],
    'Cancelada': ['var(--danger-bg)','var(--danger-dark)'],
    'Pendiente': ['var(--warning-bg)','var(--amber-darker)'],
    'Reagendar': ['var(--warning-bg)','var(--amber-darker)'],
    'Crédito usado': ['var(--success-bg)','var(--success-dark)']
  };
  var es = estStyle[r.estado] || estStyle['Pendiente'];
  var esMensual = _MESES_MAP[(r.fecha || '').toLowerCase().trim()] !== undefined;
  var diaNum = '', mesAbr = '', hora = '', lugar = '';
  if (esMensual) {
    mesAbr = _MESES_ABREV[_MESES_MAP[r.fecha.toLowerCase().trim()]];
  } else {
    var partes = (r.fecha || '').split(' - ');
    var fechaPura = (partes[0] || '').trim();
    hora = partes[1] ? partes[1].trim() : '';
    lugar = partes[2] ? partes[2].trim() : '';
    var m = fechaPura.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
    if (m) {
      diaNum = m[1];
      var mn = m[2].toLowerCase().normalize ? m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'') : m[2].toLowerCase();
      if (_MESES_MAP[mn] !== undefined) mesAbr = _MESES_ABREV[_MESES_MAP[mn]];
    }
  }
  var h = '<div style="display:flex;gap:12px;align-items:flex-start;background:var(--surface-2);border:1px solid var(--border-light);border-radius:14px;padding:12px;margin-bottom:8px;">';
  h += '<div style="flex-shrink:0;width:46px;height:46px;border-radius:10px;background:var(--brand-lightest);display:flex;flex-direction:column;align-items:center;justify-content:center;">';
  h += '<span style="font-size:0.95rem;font-weight:800;color:var(--brand);line-height:1.1;">' + (diaNum || 'MES') + '</span>';
  h += '<span style="font-size:0.62rem;font-weight:700;color:var(--muted);letter-spacing:0.5px;">' + mesAbr + '</span></div>';
  h += '<div style="flex:1;min-width:0;">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">';
  h += '<div style="font-size:0.82rem;color:var(--text);display:flex;align-items:center;gap:5px;">';
  h += esMensual ? '<span class="material-symbols-outlined" style="font-size:0.9rem;color:var(--muted);">event_repeat</span>Mensual' : '<span class="material-symbols-outlined" style="font-size:0.9rem;color:var(--muted);">schedule</span>' + hora;
  h += '</div>';
  h += '<span style="font-size:0.68rem;font-weight:700;padding:3px 9px;border-radius:99px;background:' + es[0] + ';color:' + es[1] + ';white-space:nowrap;">' + r.estado + '</span></div>';
  if (!esMensual && lugar) h += '<div style="font-size:0.78rem;color:var(--text-2);display:flex;align-items:center;gap:5px;margin-bottom:6px;"><span class="material-symbols-outlined" style="font-size:0.9rem;color:var(--muted);">location_on</span>' + lugar + '</div>';
  var pie = '';
  if (r.monto) pie += '<span style="font-weight:800;color:var(--text);">$' + r.monto + '</span>';
  if (esMensual && r.validezHasta) pie += (pie ? ' · ' : '') + '<span style="color:var(--muted);">Válido hasta ' + r.validezHasta + '</span>';
  if (pie) h += '<div style="font-size:0.78rem;">' + pie + '</div>';
  h += '</div></div>';
  return h;
}

function cancelarRes(fecha, onSuccess) {
  api({ action: 'cancelarReserva', nombre: E.nombre, fecha: fecha }, function(res) {
    if (res.exito) {
      if (typeof _todasReservas !== 'undefined' && _todasReservas) {
        _todasReservas.forEach(function(r) { if (r.fecha === fecha && r.estado !== 'Cancelada') r.estado = 'Cancelada'; });
      }
      if (res.cuponRestaurado) {
        localStorage.removeItem('cupon_' + E.nombre);
        if (E.datos) E.datos.cuponDisponible = true;
        var bCupon = document.getElementById('banner-cupon');
        if (bCupon) bCupon.style.display = 'none';
      }
      if (onSuccess) { onSuccess(); } else { _renderHomeReservas(); }
    } else {
      mostrarToast(res.error || 'Error al cancelar.', 'error');
    }
  }, function(e) { mostrarToast(e.message || 'Error al cancelar.', 'error'); });
}

function toggleBannerCupon() {
  var body = document.getElementById('banner-cupon-body');
  var chevron = document.getElementById('banner-cupon-chevron');
  var abierto = body.style.maxHeight && body.style.maxHeight !== '0px';
  body.style.maxHeight = abierto ? '0' : '200px';
  chevron.style.transform = abierto ? '' : 'rotate(180deg)';
}

/* ── Cambiar mi equipamiento (desde home) ────────────── */
function abrirSheetEquipHome() {
  var d = E.datos || {};
  var patVal = document.getElementById('home-equip-pat-val');
  var protVal = document.getElementById('home-equip-protec-val');
  if (patVal) patVal.textContent = (d.necesitaPatines === 'Sí') ? 'Talla ' + (d.talla || '?') : 'No necesitas patines';
  if (protVal) protVal.textContent = d.necesitaProtecciones || '—';
  var ov = document.getElementById('sheet-equip-home-overlay');
  var sh = document.getElementById('sheet-equip-home');
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(cerrarSheetEquipHome);
}

function cerrarSheetEquipHome(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('sheet-equip-home');
  var ov = document.getElementById('sheet-equip-home-overlay');
  sh.style.transform = 'translateY(100%)';
  setTimeout(function() { sh.style.display = 'none'; ov.style.display = 'none'; }, 350);
}

function irTallaDesdeHomeEquip() {
  cerrarSheetEquipHome();
  setTimeout(function() { ajAbrirSheetTallaAjustes(); }, 360);
}

function irProtecDesdeHomeEquip() {
  cerrarSheetEquipHome();
  setTimeout(function() { ajAbrirSheetProtecAjustes(); }, 360);
}

/* ── Gestionar reserva ──────────────────────────────── */
var _sgFechaActual = '';
var _sgFilaActual = null;
var _sgFechaSeleccionada = '';
var _sgEsMensual = false;

function abrirGestionar(fecha, fila) {
  _sgFechaActual = fecha; _sgFilaActual = fila; _sgFechaSeleccionada = '';
  _sgEsMensual = _MESES_MAP[(fecha || '').toLowerCase().trim()] !== undefined;
  var partes = (fecha || '').split(' - ');
  var fechaTexto = (partes[0] || fecha).trim();
  var hora = partes[1] ? partes[1].trim() : '';
  var subtitulo = fechaTexto + (hora ? ' · ' + hora : '');
  var lugar = partes[2] ? partes[2].trim() : '';
  if (lugar) subtitulo += ' · ' + lugar;
  document.getElementById('sg-sheet-subtitulo').textContent = subtitulo;
  sheetVolverOpciones();
  var overlay = document.getElementById('sheet-gestionar-overlay');
  var sheet = document.getElementById('sheet-gestionar');
  overlay.style.display = 'block';
  sheet.style.display = 'block';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      sheet.style.transform = 'translateY(0)';
    });
  });
  _registrarOverlayAbierto(cerrarSheetGestionar);
}

// Bloquea el cierre de #sheet-gestionar/#modal-confirm-reagendar (overlay,
// "Volver", gesto/botón atrás) mientras ejecutarCancelacion()/
// ejecutarReagendamiento() tienen una request en vuelo — ver esas 2
// funciones más abajo (ver MANIFEST, "Cambios recientes").
var _sgAccionEnCurso = false;

function cerrarSheetGestionar(porGesto) {
  if (_sgAccionEnCurso) return;
  if (!porGesto) { history.back(); return; }
  var sheet = document.getElementById('sheet-gestionar');
  var overlay = document.getElementById('sheet-gestionar-overlay');
  sheet.style.transform = 'translateY(100%)';
  setTimeout(function() {
    sheet.style.display = 'none';
    overlay.style.display = 'none';
  }, 350);
}

// Crossfade entre los 2 estados de #sheet-gestionar (coexisten como
// hermanos en el DOM, nunca se reemplaza innerHTML): el saliente se
// desvanece mientras el entrante hace fade-in + slide-up sutil, en vez
// del display:none/'' seco de antes. Mismo timing/curva (0.3s var(--ease-sheet))
// y magnitud de slide (translateY(8px), "sutil") que ya usa #s4-total-fijo/
// #s4-cupon-wrapper (js/reservas.js) para el mismo tipo de aparición.
function _sgCrossfade(idSaliente, idEntrante) {
  var saliente = document.getElementById(idSaliente);
  var entrante = document.getElementById(idEntrante);
  var trans = 'opacity 0.3s var(--ease-sheet), transform 0.3s var(--ease-sheet)';
  saliente.style.transition = trans;
  saliente.style.opacity = '0';
  saliente.style.transform = 'translateY(8px)';
  entrante.style.display = '';
  entrante.style.transition = 'none';
  entrante.style.opacity = '0';
  entrante.style.transform = 'translateY(8px)';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      entrante.style.transition = trans;
      entrante.style.opacity = '1';
      entrante.style.transform = 'translateY(0)';
    });
  });
  setTimeout(function() { saliente.style.display = 'none'; }, 300);
}

function sheetVolverOpciones() {
  if (_sgAccionEnCurso) return;
  _sgCrossfade('sg-sheet-cancelar', 'sg-sheet-opciones');
}

function sheetIrCancelar() {
  _sgCrossfade('sg-sheet-opciones', 'sg-sheet-cancelar');
}

function sheetIrReagendar() {
  cerrarSheetGestionar();
  var partes = (_sgFechaActual || '').split(' - ');
  var fechaTexto = (partes[0] || _sgFechaActual).trim();
  var hora = partes[1] ? partes[1].trim() : '';
  var lugar = partes[2] ? partes[2].trim() : '';
  document.getElementById('sg-fecha-texto').textContent = fechaTexto;
  var pillsEl = document.getElementById('sg-fecha-pills');
  pillsEl.innerHTML = '';
  if (hora) pillsEl.innerHTML += '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + hora + '</span>';
  if (lugar) pillsEl.innerHTML += '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>';
  _sgFechaSeleccionada = '';
  document.getElementById('sg-btn-confirmar-fecha').style.display = 'none';
  cargarFechasGestionar();
  setTimeout(function() { ir('s-gestionar'); }, 360);
}

function cargarFechasGestionar() {
  var labelFecha = document.getElementById('sg-label-fecha');
  var labelLista = document.getElementById('sg-label-lista');
  var btnConfirmar = document.getElementById('sg-btn-confirmar-fecha');
  if (labelFecha) labelFecha.textContent = _sgEsMensual ? 'Mes a cambiar' : 'Fecha a re-agendar';
  if (labelLista) labelLista.textContent = _sgEsMensual ? 'Elige el nuevo mes' : 'Fechas disponibles para re-agendar';
  if (btnConfirmar) btnConfirmar.textContent = _sgEsMensual ? 'Confirmar nuevo mes' : 'Confirmar nueva fecha';
  if (_sgEsMensual) { _cargarMesesGestionar(); return; }
  var lista = document.getElementById('sg-lista-fechas');
  lista.innerHTML = '<div class="loader"><div class="spinner"></div><p>Cargando fechas...</p></div>';
  function _fadeInLista() { void lista.offsetWidth; lista.style.animation = 'fadeIn 0.3s ease'; }
  var d = E.datos;
  var talla = d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no' ? d.talla : '';
  api({ action: 'getFechasDisponibles', nombre: E.nombre, talla: talla, necesitaProtecciones: d.necesitaProtecciones }, function(fechas) {
    var disponibles = fechas.filter(function(f) { return f.disponible && f.fecha !== _sgFechaActual; });
    if (disponibles.length === 0) {
      var sinEquip = talla || (d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no');
      lista.innerHTML = '<div class="sg-no-fechas">' +
        '<span class="material-symbols-outlined">' + (sinEquip ? 'roller_skating' : 'event_busy') + '</span>' +
        '<strong>' + (sinEquip ? 'Sin disponibilidad para tu equipamiento' : 'No hay fechas disponibles') + '</strong><br><br>' +
        (sinEquip ? 'No hay cupos con tu equipamiento en los próximos entrenamientos. Puedes actualizar tu equipamiento o volver más tarde.' : 'No hay entrenamientos disponibles en este momento. Vuelve más tarde.') +
        (sinEquip ? '<br><br><button class="btn-text-simple" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:0;" onclick="irEditarDatos()"><span class=\'material-symbols-outlined\' style=\'font-size:1rem;vertical-align:middle;\'>manage_accounts</span> Actualizar equipamiento</button>' : '') +
        '</div>';
      _fadeInLista();
      return;
    }
    lista.innerHTML = disponibles.map(function(f) {
      var partes = f.fecha.split(' - ');
      var texto = (partes[0] || f.fecha).trim();
      var hora = f.hora || (partes[1] ? partes[1].trim() : '');
      var lugar = f.lugar || (partes[2] ? partes[2].trim() : '');
      var fechaEsc = f.fecha.replace(/'/g, "\\'");
      return '<div class="sg-fecha-item" onclick="selFechaGestionar(this,\'' + fechaEsc + '\')">' +
        '<div class="sfi-header">' +
        '<div><div class="sfi-title">' + texto + '</div>' +
        '<div class="fi-pills">' +
        (hora ? '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + hora + '</span>' : '') +
        (lugar ? '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>' : '') +
        '</div></div>' +
        '<div class="sfi-circle"><span class="material-symbols-outlined">check</span></div>' +
        '</div></div>';
    }).join('');
    _fadeInLista();
  }, function() {
    lista.innerHTML = '<p style="color:var(--danger);font-size:0.82rem;">Error al cargar fechas. Intenta de nuevo.</p>';
    _fadeInLista();
  });
}

function selFechaGestionar(el, fecha) {
  document.querySelectorAll('.sg-fecha-item').forEach(function(x) { x.classList.remove('sel'); });
  el.classList.add('sel');
  _sgFechaSeleccionada = fecha;
  document.getElementById('sg-btn-confirmar-fecha').style.display = '';
}

function _cargarMesesGestionar() {
  var lista = document.getElementById('sg-lista-fechas');
  var actual = (_sgFechaActual || '').toLowerCase().trim();
  var html = '<div class="meses-grid-pills">';
  for (var i = 0; i < NOMBRES_MESES.length; i++) {
    var nombre = NOMBRES_MESES[i];
    var esActual = nombre.toLowerCase() === actual;
    html += '<label class="mes-item">' +
      '<input type="radio" name="sg-mes" value="' + nombre + '"' + (esActual ? ' checked' : '') + ' onchange="selMesGestionar(\'' + nombre + '\')">' +
      '<span class="mes-nombre">' + nombre + '</span>' +
      '</label>';
  }
  html += '</div>';
  lista.innerHTML = html;
  void lista.offsetWidth;
  lista.style.animation = 'fadeIn 0.3s ease';
  _sgFechaSeleccionada = '';
  document.getElementById('sg-btn-confirmar-fecha').style.display = 'none';
}

function selMesGestionar(mes) {
  var actual = (_sgFechaActual || '').toLowerCase().trim();
  if (mes.toLowerCase().trim() === actual) {
    _sgFechaSeleccionada = '';
    document.getElementById('sg-btn-confirmar-fecha').style.display = 'none';
    return;
  }
  _sgFechaSeleccionada = mes;
  document.getElementById('sg-btn-confirmar-fecha').style.display = '';
}

function confirmarCambioFecha() {
  if (!_sgFechaSeleccionada) return;
  var partes = (_sgFechaSeleccionada || '').split(' - ');
  var fechaTexto = (partes[0] || _sgFechaSeleccionada).trim();
  var hora = partes[1] ? partes[1].trim() : '';
  var lugar = partes[2] ? partes[2].trim() : '';
  var d = E.datos;
  var equipMsg = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no')
    ? 'Patines talla ' + (d.talla || '?')
    : 'Equipo propio';

  var modal = document.getElementById('modal-confirm-reagendar');
  if (!modal) return;
  var fechaAnteriorPartes = (_sgFechaActual || '').split(' - ');
  var fechaAnteriorTexto = (fechaAnteriorPartes[0] || _sgFechaActual).trim();
  var elFechaAnt = document.getElementById('mcr-fecha-anterior');
  if (elFechaAnt) elFechaAnt.textContent = fechaAnteriorTexto;
  document.getElementById('mcr-fecha').textContent = fechaTexto;
  var pillsEl = document.getElementById('mcr-pills');
  pillsEl.innerHTML = '';
  if (hora) pillsEl.innerHTML += '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + hora + '</span>';
  if (lugar) pillsEl.innerHTML += '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>';
  document.getElementById('mcr-equip').textContent = equipMsg;
  modal.style.display = 'flex';
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ modal.style.opacity = '1'; }); });
  _registrarOverlayAbierto(cerrarModalReagendar);
}

// Overlay de pantalla completa reemplazado por spinner inline en el botón
// de confirmar (mismo patrón .btn-spinner que confirmarReserva()/
// continuar_s3c_nuevo() — ver MANIFEST, "Cambios recientes"). El modal se
// deja ABIERTO (con su botón "Volver" también deshabilitado y con
// _sgAccionEnCurso bloqueando overlay/gesto-atrás) hasta que la respuesta
// real llega — antes se cerraba de entrada, ANTES incluso de llamar a
// mostrarCargando(), tapando todo con el overlay mientras tanto.
function ejecutarReagendamiento(btn) {
  if (_sgAccionEnCurso) return;
  _sgAccionEnCurso = true;
  var btnHtmlOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Guardando...'; }
  var btnVolver = document.getElementById('mcr-btn-volver');
  if (btnVolver) btnVolver.disabled = true;
  api({ action: 'reagendarReserva', nombre: E.nombre, fechaAnterior: _sgFechaActual, fechaNueva: _sgFechaSeleccionada }, function() {
    _sgAccionEnCurso = false;
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; }
    if (btnVolver) btnVolver.disabled = false;
    cerrarModalReagendar();
    ir('s-home');
    setTimeout(function() { _recargarYRenderReservas(function() { mostrarToast('¡Fecha cambiada con éxito! 📅', 'ok'); }); }, 100);
  }, function(e) {
    _sgAccionEnCurso = false;
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; }
    if (btnVolver) btnVolver.disabled = false;
    cerrarModalReagendar();
    mostrarToast(e.message || 'Error al reagendar. Intenta de nuevo.', 'error');
  });
}

function cerrarModalReagendar(porGesto) {
  if (_sgAccionEnCurso) return;
  if (!porGesto) { history.back(); return; }
  var modal = document.getElementById('modal-confirm-reagendar');
  if (modal) { modal.style.opacity = '0'; setTimeout(function(){ modal.style.display = 'none'; }, 250); }
}

function ejecutarCancelacion(btn) {
  if (_sgAccionEnCurso) return;
  _sgAccionEnCurso = true;
  var btnHtmlOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Cancelando...'; }
  var btnVolver = document.getElementById('sg-cancelar-btn-volver');
  if (btnVolver) btnVolver.disabled = true;
  api({ action: 'cancelarReserva', nombre: E.nombre, fecha: _sgFechaActual }, function() {
    _sgAccionEnCurso = false;
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; }
    if (btnVolver) btnVolver.disabled = false;
    cerrarSheetGestionar();
    ir('s-home');
    setTimeout(function() { _recargarYRenderReservas(function() { mostrarToast('Reserva cancelada', 'ok'); }); }, 100);
  }, function(e) {
    _sgAccionEnCurso = false;
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; }
    if (btnVolver) btnVolver.disabled = false;
    cerrarSheetGestionar();
    mostrarToast(e.message || 'Error al cancelar. Intenta de nuevo.', 'error');
  });
}
function abrirModalEstados() {
  var m = document.getElementById('modal-estados-reserva');
  if (m) { m.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ m.style.opacity = '1'; }); }); _registrarOverlayAbierto(cerrarModalEstados); }
}
function cerrarModalEstados(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-estados-reserva');
  if (m) { m.style.opacity = '0'; setTimeout(function(){ m.style.display = 'none'; }, 250); }
}

function _recargarYRenderReservas(callback) {
  // Mismo patrón de fade-out + spinner de respaldo que prepararHome(): sin esto, la
  // card vieja quedaba visible en silencio durante los dos fetches encadenados de acá
  // abajo, hasta que el toast del caller aparecía de la nada (reagendar/cancelar/
  // cambiar talla o protecciones desde Mis Reservas).
  var homeContent = document.getElementById('home-reservas-lista');
  var listo = false;
  if (homeContent) {
    homeContent.style.transition = 'opacity 0.3s ease';
    homeContent.style.opacity = '0';
    setTimeout(function() {
      if (listo) return; // el fetch ya resolvió y pintó el contenido real; no lo pisamos con el loader
      homeContent.innerHTML = '<div class="loader" style="padding:24px 0;"><div class="spinner"></div></div>';
      homeContent.style.opacity = '1';
    }, 50);
  }
  function _terminar() {
    listo = true;
    _renderHomeReservas();
    if (homeContent) { homeContent.style.opacity = '1'; void homeContent.offsetWidth; homeContent.style.animation = 'fadeIn 0.3s ease'; }
    setTimeout(_initScrollReservas, 50);
    if (callback) callback();
  }
  api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
    _todasReservas = reservas || [];
    var d = E.datos;
    var talla = d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no' ? d.talla : '';
    api({ action: 'getFechasDisponibles', nombre: E.nombre, talla: talla, necesitaProtecciones: d.necesitaProtecciones }, function(fechas) {
      var infoMap = {};
      fechas.forEach(function(f) { infoMap[f.fecha] = f; });
      _todasReservas = _todasReservas.map(function(r) {
        var info = infoMap[r.fecha];
        if (info) { r.mapsUrl = info.mapsUrl || ''; r.horaFin = info.horaFin || ''; r.duracion = info.duracion || ''; r.descripcion = info.descripcion || ''; }
        return r;
      });
      _terminar();
    }, _terminar);
  }, _terminar);
}

function _initHomeNav() {
  var nav = document.getElementById('home-nav');
  var spacer = document.getElementById('home-nav-spacer');
  if (!nav) return;
  // display controlado exclusivamente por _renderHomeReservas

  nav.style.top = '0';
  if (spacer) spacer.style.height = (nav.offsetHeight + 8) + 'px';

  var contenedor = document.querySelector('.contenedor');
  if (!contenedor) return;

  function onScroll() {
    var scrollY = contenedor.scrollTop || window.scrollY || 0;
    nav.classList.toggle('compacto', scrollY > 40);
  }

  contenedor.removeEventListener('scroll', onScroll);
  contenedor.addEventListener('scroll', onScroll);
  window.removeEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}