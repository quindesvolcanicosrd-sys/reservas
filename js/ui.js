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

function abrirContacto() { var m = document.getElementById('modal-contacto'); if (m) { m.style.display = 'flex'; } }
function cerrarContacto() { var m = document.getElementById('modal-contacto'); if (m) { m.style.display = 'none'; } }

var TOP_BAR_CONFIG = {
  's2': { titulo: 'Equipamiento', volver: 's-home' },
  's3a': { titulo: 'Editar equipamiento', volver: function() { return 's-home'; } }, 's3b': { titulo: 'Editar equipamiento', volver: 's3a' },
  's3c': { titulo: 'Editar equipamiento', volver: function() { return E.editPat === 'Sí' ? 's3b' : 's3a'; } },
  's4': { titulo: function() { return E.reagendando ? 'Reagendar clase' : canPayMonthly() ? 'Nueva reserva' : 'Fecha y pago'; }, volver: function() { return 's-home'; } },
  's-pago': { titulo: 'Pago', volver: 's4' }, 's5': { titulo: 'Confirmar reserva', volver: function() { return (E.creditosUsados > 0 || E.cuponAplicado) && E.totalPago === 0 ? 's4' : 's-pago'; } },
  's-gestionar': { titulo: 'Re-agendar fecha', volver: 's-home' },
  's-misreservas': { titulo: 'Historial de reservas', volver: 's-home' }, 's-datos': { titulo: 'Editar mis datos', volver: 's-home' },
  's-admin-login': { titulo: 'Administradorx', volver: 's1' },
  's-admin-reservas': { titulo: 'Reservas', volver: 's-admin-home' },
  's-admin-notif': { titulo: 'Notificaciones', volver: 's-admin-home' },
  's-admin-quellevar': { titulo: 'Qué llevar', volver: 's-admin-home' },
  's-admin-equip': { titulo: 'Equipamiento', volver: 's-admin-home' },
  's-admin-usuarios': { titulo: 'Usuarios', volver: 's-admin-home' },
  's-admin-admins': { titulo: 'Administradorxs', volver: 's-admin-home' }
};

function ir(id, desdeHistorial) {
  if (id === 's1b' || !document.getElementById(id)) { ir('s1', true); return; }
  document.querySelectorAll('.pantalla').forEach(function(p) { p.classList.remove('activa'); });
  document.getElementById(id).classList.add('activa');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  var sinHistorial = ['s-carga', 's-carga-fechas', 's-carga-conf'];
  if (!desdeHistorial && sinHistorial.indexOf(id) === -1) {
    history.pushState({ pantalla: id }, '', '#' + id);
  }

  document.body.classList.toggle('logueada', id !== 's1');

  if (id === 's-home') {
    setTimeout(mostrarBannerPWA, 1200);
    setTimeout(function() {
      if (!_yaVioModal('home')) {
        var mh = document.getElementById('modal-info-home');
        if (mh) mh.style.display = 'flex';
      }
    }, 600);
  }

  var topBar = document.getElementById('top-bar'); var topBtn = document.getElementById('top-bar-btn'); var topTitulo = document.getElementById('top-bar-titulo');
  var cfg = TOP_BAR_CONFIG[id];
  if (cfg) {
    topBar.classList.add('visible'); topTitulo.textContent = typeof cfg.titulo === 'function' ? cfg.titulo() : cfg.titulo;
    var _volverTarget = typeof cfg.volver === 'function' ? cfg.volver() : cfg.volver;
    if (_volverTarget) { topBtn.style.display = ''; topBtn.onclick = function() { volver(_volverTarget); }; } else { topBtn.style.display = 'none'; }
  } else { topBar.classList.remove('visible'); }

  var sinPasos = ['s1','s-home','s-misreservas','s-carga','s6','s-datos','s-gestionar'].concat(ADMIN_PANTALLAS);
  if (E.reagendando) sinPasos = sinPasos.concat(['s4','s5','s-carga-conf']);
  var dotContainer = document.querySelector('.paso-indicator');
  if (sinPasos.indexOf(id) !== -1) { if (dotContainer) dotContainer.style.display = 'none'; return; }
  if (dotContainer) {
    dotContainer.style.display = 'flex';
    var pasos = { 's2':1,'s3a':1,'s3b':1,'s3c':1,'s-carga-fechas':2,'s4':2,'s-pago':3,'s5':4,'s-carga-conf':4 };
    var p = pasos[id] || 1;
    for (var i = 1; i <= 4; i++) {
      var d = document.getElementById('dot'+i);
      if (d) d.className = 'paso-dot' + (i < p ? ' completado' : i === p ? ' activo' : '');
    }
  }
}
function volver(id) { ir(id); }

window.addEventListener('popstate', function(ev) {
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
  var onchange = confirmado ? '' : ' onchange="actualizarTotalS4()"';
  return '<label class="' + clases + '">' +
    '<input type="checkbox" value="' + nombre + '"' + disabled + onchange + '>' +
    '<span class="mes-nombre">' + nombre + '</span>' +
    badge +
    '</label>';
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

function modalInfoOk(id) {
  localStorage.setItem(_modalInfoKey(id), 'visto');
  var el = document.getElementById('modal-info-' + id);
  if (el) el.style.display = 'none';
  if (id === 'reserva' && window._modalInfoReservaCallback) {
    var cb = window._modalInfoReservaCallback;
    window._modalInfoReservaCallback = null;
    cb();
  }
}

function modalInfoLater(id) {
  sessionStorage.setItem(_modalInfoKey(id), 'luego');
  var el = document.getElementById('modal-info-' + id);
  if (el) el.style.display = 'none';
  if (id === 'reserva' && window._modalInfoReservaCallback) {
    var cb = window._modalInfoReservaCallback;
    window._modalInfoReservaCallback = null;
    cb();
  }
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
}

function mostrarToast(msg, tipo) {
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