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
  's3a': { titulo: 'Editar equipamiento', volver: 's2' }, 's3b': { titulo: 'Editar equipamiento', volver: 's3a' },
  's3c': { titulo: 'Editar equipamiento', volver: 's3b' },
  's4': { titulo: function() { return E.reagendando ? 'Reagendar clase' : canPayMonthly() ? 'Selecciona el tipo de modalidad' : 'Fecha y pago'; }, volver: function() { return E.reagendando ? 's-home' : 's2'; } },
  's-pago': { titulo: 'Pago', volver: 's4' }, 's5': { titulo: 'Confirmar reserva', volver: function() { return (E.creditosUsados > 0 || E.cuponAplicado) && E.totalPago === 0 ? 's4' : 's-pago'; } },
  's-misreservas': { titulo: 'Historial de reservas', volver: 's-home' }, 's-datos': { titulo: 'Editar mis datos', volver: 's-home' },
  's6': { titulo: 'Pago registrado', volver: null },
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

  if (id === 's-home') setTimeout(mostrarBannerPWA, 1200);

  var topBar = document.getElementById('top-bar'); var topBtn = document.getElementById('top-bar-btn'); var topTitulo = document.getElementById('top-bar-titulo');
  var cfg = TOP_BAR_CONFIG[id];
  if (cfg) {
    topBar.classList.add('visible'); topTitulo.textContent = typeof cfg.titulo === 'function' ? cfg.titulo() : cfg.titulo;
    var _volverTarget = typeof cfg.volver === 'function' ? cfg.volver() : cfg.volver;
    if (_volverTarget) { topBtn.style.display = ''; topBtn.onclick = function() { volver(_volverTarget); }; } else { topBtn.style.display = 'none'; }
  } else { topBar.classList.remove('visible'); }

  var sinPasos = ['s1','s-home','s-misreservas','s-carga','s6','s-datos'].concat(ADMIN_PANTALLAS);
  if (E.reagendando) sinPasos = sinPasos.concat(['s4','s5','s-carga-conf']);
  var dotContainer = document.querySelector('.paso-indicator');
  if (sinPasos.indexOf(id) !== -1) { dotContainer.style.display = 'none'; return; }
  dotContainer.style.display = 'flex';

  var pasos = { 's2':1,'s3a':1,'s3b':1,'s3c':1,'s-carga-fechas':2,'s4':2,'s-pago':3,'s5':4,'s-carga-conf':4 };
  var p = pasos[id] || 1;
  for (var i = 1; i <= 4; i++) {
    var d = document.getElementById('dot'+i);
    d.className = 'paso-dot' + (i < p ? ' completado' : i === p ? ' activo' : '');
  }
}
function volver(id) { ir(id); }

window.addEventListener('popstate', function(ev) {
  var id = (ev.state && ev.state.pantalla) || (E.datos ? 's-home' : 's1');
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
  var hoy = new Date(); var mesActual = hoy.getMonth();
  var listaPasados = document.getElementById('lista-meses-pasados');
  var listaFuturos = document.getElementById('lista-meses');
  var wrapperPasados = document.getElementById('meses-pasados-wrapper');

  listaPasados.innerHTML = ''; listaFuturos.innerHTML = '';

  if (mesActual === 0) { wrapperPasados.style.display = 'none'; } else {
    wrapperPasados.style.display = 'block';
    for (var i = 0; i < mesActual; i++) { listaPasados.innerHTML += crearMesItem(NOMBRES_MESES[i]); }
  }
  for (var j = mesActual; j < 12; j++) { listaFuturos.innerHTML += crearMesItem(NOMBRES_MESES[j]); }
}

function crearMesItem(nombre) { return '<label class="mes-item"><input type="checkbox" value="' + nombre + '" onchange="actualizarTotalS4()"> ' + nombre + '</label>'; }

function toggleMesesPasados() {
  var lista    = document.getElementById('lista-meses-pasados');
  var chevron  = document.getElementById('chevron-meses');
  var abierto  = lista.style.display === 'grid';
  if (!abierto) {
    lista.style.display = 'grid';
    if (chevron) chevron.style.transform = 'rotate(90deg)';
    var container = document.getElementById('lista-meses-container');
    var chevronA  = document.getElementById('chevron-meses-actuales');
    if (container) container.style.display = 'none';
    if (chevronA)  chevronA.style.transform = '';
  } else {
    lista.style.display = 'none';
    if (chevron) chevron.style.transform = '';
  }
}

function toggleMesesActuales() {
  var container = document.getElementById('lista-meses-container');
  var chevronA  = document.getElementById('chevron-meses-actuales');
  var abierto   = container.style.display !== 'none';
  if (!abierto) {
    container.style.display = 'block';
    if (chevronA) chevronA.style.transform = 'rotate(90deg)';
    var lista   = document.getElementById('lista-meses-pasados');
    var chevron = document.getElementById('chevron-meses');
    if (lista)   lista.style.display = 'none';
    if (chevron) chevron.style.transform = '';
  } else {
    container.style.display = 'none';
    if (chevronA) chevronA.style.transform = '';
  }
}
