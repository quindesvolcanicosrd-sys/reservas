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

var PANTALLAS_RAIZ = ['s1', 's-home', 's-admin-home'];

var TOP_BAR_CONFIG = {
  's2': { titulo: 'Equipamiento', volver: 's-home' },
  's3a': { titulo: 'Editar equipamiento', volver: function() { return E.editandoDesdeHome ? 's-datos' : 's-home'; } }, 's3b': { titulo: 'Editar equipamiento', volver: 's3a' },
  's3c': { titulo: 'Editar equipamiento', volver: function() { return E.editPat === 'Sí' ? 's3b' : 's3a'; } },
  's4': { titulo: function() { return E.reagendando ? 'Reagendar clase' : canPayMonthly() ? 'Nueva reserva' : 'Fecha y pago'; }, volver: function() { return 's-home'; } },
  's-pago': { titulo: 'Pago', volver: 's4' },
  's-gestionar': { titulo: 'Re-agendar fecha', volver: 's-home' },
  's-misreservas': { titulo: 'Historial de reservas', volver: 's-home' }, 's-datos': { titulo: 'Ajustes del perfil', volver: 's-home' },
  's-admin-login': { titulo: 'Administradorx', volver: 's1' },
  's-admin-reservas': { titulo: 'Reservas', volver: 's-admin-home' },
  's-admin-notif': { titulo: 'Notificaciones', volver: 's-admin-home' },
  's-admin-quellevar': { titulo: 'Qué llevar', volver: 's-admin-home' },
  's-admin-equip': { titulo: 'Equipamiento', volver: 's-admin-home' },
  's-admin-usuarios': { titulo: 'Usuarios', volver: 's-admin-home' },
  's-admin-admins': { titulo: 'Administradorxs', volver: 's-admin-home' }
};

function ir(id, desdeHistorial, sinTrampa) {
  if (id === 's1b' || !document.getElementById(id)) { ir('s1', true); return; }
  var nueva = document.getElementById(id);
  var actual = document.querySelector('.pantalla.activa');
  // Transición "shared axis X" (Material Design 3) — estándar de plataforma,
  // ver axisTransicion() (shared/axis-transicion.js) y MANIFEST. `actual`
  // puede ser null en la primerísima navegación de la sesión (nada que
  // animar de fondo) o coincidir con `nueva` (no debería pasar en uso
  // normal, pero por seguridad no se anima una pantalla contra sí misma).
  // `desdeHistorial` ya indica si esto viene de un gesto de "atrás"
  // (popstate) — se reusa tal cual como el parámetro `atras` de
  // axisTransicion(), sin necesitar una señal de dirección aparte.
  var animado = !!(actual && actual !== nueva);
  if (animado) {
    axisTransicion(actual, nueva, !!desdeHistorial,
      function(el) { el.classList.add('activa'); },
      function(el) { el.classList.remove('activa'); });
  } else {
    document.querySelectorAll('.pantalla').forEach(function(p) { p.classList.remove('activa'); });
    nueva.classList.add('activa');
  }

  // #s4-total-fijo (panel de total fijo de s4, js/reservas.js) — al abandonar
  // s4 con transición animada, se dispara su salida (fade-out + slide-down,
  // _s4TotalOcultarFijo()) YA, en sincronía con el axis-leave de s4 que recién
  // arranca (misma duración, 0.32s, ver css/reservas.css) — así el panel
  // termina de desvanecerse justo cuando la pantalla completa su salida, en
  // vez de desaparecer de golpe recién cuando el footer entero cambia a los
  // 320ms (ver actualizarChrome() más abajo). Vuelve a mostrarse (fade-in +
  // slide-up) al reentrar a s4, disparado desde ese mismo punto de 320ms —
  // ver el bloque `if (id === 's4')` dentro de actualizarChrome().
  if (animado && actual && actual.id === 's4' && typeof _s4TotalOcultarFijo === 'function') {
    _s4TotalOcultarFijo(document.getElementById('s4-total-fijo'));
  }
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

  // Chrome de la pantalla (top-bar, footer fijo, home-nav, paso-dots) — ver
  // "Cambios recientes", bug real de superposición desprolija encontrado al
  // auditar la propagación del shared axis X a ir(). #top-bar es
  // position:sticky (NO fixed): vive en flujo normal dentro de .contenedor,
  // justo antes de todas las .pantalla. Togglear su display de golpe (como
  // se hacía antes) le cambiaba el alto disponible a mitad de la transición
  // — mientras la saliente (.axis-leave) sigue en flujo normal durante los
  // 320ms (a diferencia de la entrante, .axis-enter, position:absolute,
  // inmune a esto), aparecer/desaparecer #top-bar la empujaba verticalmente,
  // desalineándola de la entrante y mezclando el contenido de ambas en
  // pantalla. Fix: si hubo transición animada, este bloque completo
  // (top-bar + footer + home-nav + paso-dots) se aplica recién cuando
  // termina — durante el cruce la chrome queda estable en el estado de la
  // pantalla saliente, sin moverle el piso a nadie. Sin animación (primera
  // navegación de la sesión, o misma pantalla) se aplica de inmediato, igual
  // que siempre.
  var actualizarChrome = function() {
    var topBar = document.getElementById('top-bar'); var topBtn = document.getElementById('top-bar-btn'); var topTitulo = document.getElementById('top-bar-titulo');
    var cfg = TOP_BAR_CONFIG[id];
    if (cfg) {
      topBar.style.display = 'flex'; topTitulo.textContent = typeof cfg.titulo === 'function' ? cfg.titulo() : cfg.titulo;
      var _volverTarget = typeof cfg.volver === 'function' ? cfg.volver() : cfg.volver;
      if (_volverTarget) { topBtn.style.display = ''; topBtn.onclick = function() { volver(_volverTarget); }; } else { topBtn.style.display = 'none'; }
    } else { topBar.style.display = 'none'; }

    // Los .cta-footer-fixed viven como hijos directos de <body> (fuera de .pantalla/
    // .card, ver "Cambios recientes") para no quedar atrapados por el containing
    // block que .pantalla.activa establece mientras corre su transición de entrada
    // (shared axis X, ver .axis-enter en css/global.css) y "atrape" al footer
    // fuera del viewport real. js/ui.js (ir()) muestra solo el que corresponde
    // a la pantalla activa.
    document.querySelectorAll('.cta-footer-fixed').forEach(function(f) { f.style.display = 'none'; });
    var ctaFooter = document.getElementById('cta-footer-' + id);
    if (ctaFooter) ctaFooter.style.display = 'block';

    // #s4-total-fijo — reentrada a s4 (ver nota de salida más arriba, en
    // ir()): recalcula y, si corresponde mostrarlo, dispara su entrada
    // (fade-in + slide-up) justo en este mismo instante (320ms, el mismo
    // punto en que el resto de la chrome de s4 vuelve a mostrarse) — nunca
    // antes. Si nunca se ocultó (primera entrada a s4 en la sesión, sin
    // fechas todavía) es un no-op porque no hay ningún cambio de visibilidad
    // real que animar.
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
  };

  if (animado) {
    setTimeout(actualizarChrome, 320);
  } else {
    actualizarChrome();
  }
}
function volver(id) { ir(id); }

window.addEventListener('popstate', function(ev) {
  if (_overlayStack.length > 0) { var _fn = _overlayStack.pop(); _fn(true); return; }
  if (_ajSubAbierto) { cerrarAjSub(_ajSubAbierto, true); return; }
  var id = (ev.state && ev.state.pantalla) || (E.datos ? 's-home' : 's1');
if (id === 's2') id = E.datos ? 's-home' : 's1';
  if (id === 's1b') id = E.datos ? 's-home' : 's1';
  if (E.datos && id === 's1') id = 's-home';
  var esAdminPantalla = ADMIN_PANTALLAS.indexOf(id) !== -1;
  if (!E.datos && !esAdminPantalla && id !== 's1') id = 's1';
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
  var onchange = confirmado ? '' : ' onchange="_autoencadenarMeses(this);actualizarTotalS4()"';
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
    mostrarToast('Se agregó ' + agregados.join(', ') + ' porque hace falta pagarlo antes de este mes');
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


function lanzarConfetti() {
  var canvas = document.getElementById('confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(canvas);
  }
  var ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var piezas = [];
  var colores = ['#F97316','#fb923c','#fbbf24','#22c55e','#60a5fa','#c084fc','#f472b6'];
  for (var i = 0; i < 120; i++) {
    piezas.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: Math.random() * 10 + 6,
      h: Math.random() * 6 + 3,
      color: colores[Math.floor(Math.random() * colores.length)],
      rot: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 4 + 2,
      vr: (Math.random() - 0.5) * 0.15
    });
  }
  var frames = 0;
  function animar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    piezas.forEach(function(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frames / 180);
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    });
    frames++;
    if (frames < 200) requestAnimationFrame(animar);
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
  _cerrarModalInfo(id);
}

function modalInfoLater(id) {
  sessionStorage.setItem(_modalInfoKey(id), 'luego');
  if (id === 'reserva' && window._modalInfoReservaCallback) {
    var cb = window._modalInfoReservaCallback;
    window._modalInfoReservaCallback = null;
    cb();
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

function mostrarToast(msg, tipo) {
  if (tipo !== 'error') return;
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
  requestAnimationFrame(function() { m.style.opacity = '1'; });
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
  requestAnimationFrame(function() { m.style.opacity = '1'; });
  _registrarOverlayAbierto(cerrarModalInfoPolitica);
}
function cerrarModalInfoPolitica(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-info-politica');
  if (!m) return;
  m.style.opacity = '0';
  setTimeout(function() { m.style.display = 'none'; }, 300);
}