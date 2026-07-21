var GOOGLE_CLIENT_ID_FRONT = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';
var _adminToken = '';
var _adminEmail = '';
var _adminNombre = '';
var _admTodasReservas = [];
var _admFiltro = 'pendientes';
var _gisInicializado = false;

// Tanda 2 del dashboard admin (banners condicionales + burbuja de
// Notificación + container transform de las 3 tiles de contenido largo) —
// ver MANIFEST.md "Cambios recientes".
// `_admDashAbierto` solo trackea lo que puede convivir con el dashboard
// visible: los 2 acordeones de banner ('admin-banner-pendientes-body'/
// 'admin-banner-equip-body') o la burbuja de notificación ('notif') — las 3
// pantallas completas NUNCA conviven con el dashboard (lo tapan por
// completo), así que no necesitan wrappearse acá para la exclusión mutua.
var _admDashAbierto = null;
var _admDashOrigenRect = null; // rect de la tile que abrió la pantalla completa actual, para la animación de cierre
var _admBannerPendientes = null; // null = todavía no llegó la respuesta
var _admBannerQueLlevar = null;

var ADMIN_PANTALLAS = ['s-admin-login','s-admin-home','s-admin-reservas','s-admin-quellevar','s-admin-equip','s-admin-usuarios','s-admin-admins'];

function adminApi(params, onSuccess, onError) {
  params.adminToken = _adminToken;
  api(params, onSuccess, function(e) {
    if (e.message && e.message.indexOf('Sesión admin') !== -1) {
      adminCerrarSesionLocal(true);
      err('err-admin-login', 'Tu sesión admin expiró. Vuelve a iniciar sesión.');
    }
    onError(e);
  });
}

function irAdminLogin() {
  var s = localStorage.getItem('adminSession');
  if (s) {
    try {
      var d = JSON.parse(s);
      if (d.adminToken && d.email && Date.now() < (d.exp || 0)) {
        _adminToken = d.adminToken; _adminEmail = d.email; _adminNombre = d.nombre || d.email;
        adminEntrar(); return;
      }
    } catch (ex) {}
    localStorage.removeItem('adminSession');
  }
  ir('s-admin-login');
  iniciarGoogleSignIn();
}

// Decodifica el payload de un idToken de Google (JWT) para leer datos como
// `name`/`email` sin ida y vuelta al backend -- mismo idioma ya usado en
// onGoogleCredentialUsuario() (js/auth.js) para el mensaje "no registrado".
function _decodificarJwtGoogle(credential) {
  try {
    var p = credential.split('.');
    return JSON.parse(atob(p[1].replace(/-/g,'+').replace(/_/g,'/')));
  } catch (ex) { return null; }
}

function iniciarGoogleSignIn() {
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(iniciarGoogleSignIn, 300); return;
  }
  if (!_gisInicializado) {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID_FRONT, callback: onGoogleCredential });
    _gisInicializado = true;
  }
  var cont = document.getElementById('g-signin-btn');
  if (cont) {
    cont.innerHTML = '';
    google.accounts.id.renderButton(cont, {
      theme: 'outline', size: 'large', text: 'signin_with', locale: 'es', shape: 'pill', width: 320
    });
  }
}

function onGoogleCredential(resp) {
  mostrarCargando('Verificando acceso...');
  api({ action: 'adminLogin', idToken: resp.credential }, function(res) {
    ocultarCargando();
    if (!res.ok) { err('err-admin-login', res.error || 'Acceso denegado.'); return; }
    _adminToken = res.adminToken; _adminEmail = res.email;
    var _pl = _decodificarJwtGoogle(resp.credential);
    _adminNombre = (_pl && _pl.name) || _adminEmail;
    localStorage.setItem('adminSession', JSON.stringify({ adminToken: _adminToken, email: _adminEmail, nombre: _adminNombre, exp: Date.now() + 11.5 * 3600 * 1000 }));
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(function(OneSignal) { OneSignal.login('admin_' + _adminEmail).catch(function(){}); });
    adminEntrar();
  }, function(e) { ocultarCargando(); err('err-admin-login', 'Error al verificar acceso. Intenta de nuevo.'); });
}

function adminEntrar() {
  var nombreEl = document.getElementById('admin-dash-nombre');
  if (nombreEl) nombreEl.textContent = _adminNombre || _adminEmail;
  adminRenderColorEnfasis();
  _admDashAbierto = null; _admDashOrigenRect = null;
  ir('s-admin-home');
  _adminCargarBanners();
}

// Acordeón "Ajustes adicionales" del nuevo dashboard admin -- por ahora solo
// abre/cierra un cuerpo vacío (estructura visual nada más, ver MANIFEST.md
// "Cambios recientes"); el contenido real (Usuarios, Administradorxs, color
// de énfasis, Mi Liga) se agrega en una tanda posterior.
function adminToggleAjustesAdicionales() {
  var body = document.getElementById('admin-extra-acordeon-body');
  var chevron = document.getElementById('admin-extra-acordeon-chevron');
  var abierto = body.style.maxHeight && body.style.maxHeight !== '0px';
  if (!abierto) {
    body.style.maxHeight = '400px'; body.style.opacity = '1';
    chevron.style.transform = 'rotate(180deg)';
  } else {
    body.style.maxHeight = '0'; body.style.opacity = '0';
    chevron.style.transform = 'rotate(0deg)';
  }
}

// ── Dashboard admin, Tanda 2: banners condicionales ─────────────────────────────
// Cierra lo que esté abierto entre los 2 acordeones de banner y la burbuja de
// notificación (los únicos 3 que pueden convivir con el dashboard visible al
// mismo tiempo) — llamado al principio de cualquier acción "abrir X" para que
// nunca queden 2 abiertos a la vez. Defensivo ante cualquier valor viejo que
// _admDashAbierto pudiera tener (ej. si el gesto nativo de "atrás" saltó por
// encima de _adminCerrarFullscreen()): cualquier valor que no sea uno de los
// 3 casos conocidos simplemente se descarta sin tocar el DOM.
function _adminCerrarTodoAbierto() {
  if (_admDashAbierto === 'notif') {
    _adminCerrarNotifBubbleInterno();
  } else if (_admDashAbierto === 'admin-banner-pendientes-body' || _admDashAbierto === 'admin-banner-equip-body') {
    var body = document.getElementById(_admDashAbierto);
    var chevron = document.getElementById(_admDashAbierto + '-chevron');
    if (body) { body.style.maxHeight = '0'; body.style.opacity = '0'; }
    if (chevron) chevron.style.transform = '';
  }
  _admDashAbierto = null;
}

function adminToggleBanner(bodyId) {
  var estabaAbierto = _admDashAbierto === bodyId;
  _adminCerrarTodoAbierto();
  if (estabaAbierto) return;
  var body = document.getElementById(bodyId);
  var chevron = document.getElementById(bodyId + '-chevron');
  if (!body) return;
  body.style.maxHeight = body.scrollHeight + 'px';
  body.style.opacity = '1';
  if (chevron) chevron.style.transform = 'rotate(180deg)';
  _admDashAbierto = bodyId;
}

// Ventana de fecha "hoy"/"mañana" para el banner de equipamiento -- réplica
// en el frontend del criterio que ya usa recordatoriosQueLlevar() del lado
// del backend (fuera de este repo, no accesible desde acá) para decidir
// cuándo mandar el push de recordatorio. Mismo idioma de parseo ya usado en
// adminRenderQueLlevar() (detección "GMT" + getters UTC) para no introducir
// una segunda forma de leer estas fechas.
function _adminVentanaFecha(fechaRaw) {
  if (!fechaRaw || !fechaRaw.toString().includes('GMT')) return null;
  var f = new Date(fechaRaw);
  var claveFecha = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  var ahora = new Date();
  var claveHoy = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var unDia = 86400000;
  if (claveFecha === claveHoy) return 'hoy';
  if (claveFecha === claveHoy + unDia) return 'mañana';
  return null;
}

// Carga los datos de los 2 banners condicionales del dashboard en paralelo,
// apenas se entra a s-admin-home (adminEntrar()) — independiente de
// _admTodasReservas (que sigue siendo responsabilidad de adminIrReservas()/
// adminRefreshReservas(), para no acoplar el banner con la pantalla completa).
function _adminCargarBanners() {
  _admBannerPendientes = null; _admBannerQueLlevar = null;
  adminApi({ action: 'adminGetReservas' }, function(res) {
    _admBannerPendientes = (res || []).filter(function(r) { return r.estado === 'Pendiente'; });
    _adminRenderBannerPendientes();
  }, function() { _admBannerPendientes = []; _adminRenderBannerPendientes(); });
  adminApi({ action: 'adminGetQueLlevar' }, function(res) {
    _admBannerQueLlevar = (res || []).filter(function(q) { q._ventana = _adminVentanaFecha(q.fecha); return q._ventana; });
    _adminRenderBannerQueLlevar();
  }, function() { _admBannerQueLlevar = []; _adminRenderBannerQueLlevar(); });
}

function _adminRenderBannerPendientes() {
  var slot = document.getElementById('admin-banner-pendientes-slot');
  if (!slot) return;
  if (!_admBannerPendientes || _admBannerPendientes.length === 0) { slot.innerHTML = ''; return; }
  var filas = _admBannerPendientes.map(function(r) {
    return '<div class="admin-banner-res-row">' +
      '<div class="admin-banner-res-info"><div class="admin-banner-res-nombre">' + r.nombre + '</div><div class="admin-banner-res-fecha">' + r.fecha + '</div></div>' +
      '<div class="admin-banner-res-actions">' +
        '<button class="admin-banner-btn admin-banner-btn-ok" onclick="adminBannerSetEstado(' + r.fila + ',\'Confirmada\',this)" aria-label="Aprobar"><span class="material-symbols-outlined">check</span></button>' +
        '<button class="admin-banner-btn admin-banner-btn-no" onclick="adminBannerSetEstado(' + r.fila + ',\'Cancelada\',this)" aria-label="Rechazar"><span class="material-symbols-outlined">close</span></button>' +
      '</div></div>';
  }).join('');
  var n = _admBannerPendientes.length;
  slot.innerHTML =
    '<div class="admin-dash-banner" id="admin-banner-pendientes">' +
      '<div class="admin-dash-banner-header" onclick="adminToggleBanner(\'admin-banner-pendientes-body\')">' +
        '<span class="material-symbols-outlined admin-dash-banner-icon">pending_actions</span>' +
        '<span class="admin-dash-banner-texto" id="admin-banner-pendientes-texto">Tenés ' + n + ' reserva' + (n !== 1 ? 's' : '') + ' pendiente' + (n !== 1 ? 's' : '') + ' de revisión</span>' +
        '<span class="material-symbols-outlined admin-dash-banner-chevron" id="admin-banner-pendientes-body-chevron">expand_more</span>' +
      '</div>' +
      '<div class="admin-dash-banner-body" id="admin-banner-pendientes-body">' +
        '<div class="admin-dash-banner-body-inner">' + filas +
          '<div class="admin-dash-banner-link" onclick="adminIrReservas()">Ver todas las reservas ↗</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function adminBannerSetEstado(fila, estado, btn) {
  var row = btn.closest('.admin-banner-res-row');
  var botones = row.querySelectorAll('.admin-banner-btn');
  botones.forEach(function(b) { b.disabled = true; });
  adminApi({ action: 'adminSetEstadoReserva', fila: fila, estado: estado }, function(res) {
    if (!res.exito) { botones.forEach(function(b) { b.disabled = false; }); mostrarToast(res.error || 'Error al actualizar.', 'error'); return; }
    _admBannerPendientes = _admBannerPendientes.filter(function(r) { return r.fila !== fila; });
    row.style.transition = 'opacity 0.25s ease';
    row.style.opacity = '0';
    setTimeout(function() {
      row.remove();
      var n = _admBannerPendientes.length;
      var banner = document.getElementById('admin-banner-pendientes');
      if (n === 0) { if (banner) banner.remove(); _admDashAbierto = null; return; }
      var texto = document.getElementById('admin-banner-pendientes-texto');
      if (texto) texto.textContent = 'Tenés ' + n + ' reserva' + (n !== 1 ? 's' : '') + ' pendiente' + (n !== 1 ? 's' : '') + ' de revisión';
      var body = document.getElementById('admin-banner-pendientes-body');
      if (body && body.style.maxHeight && body.style.maxHeight !== '0px') body.style.maxHeight = body.scrollHeight + 'px';
    }, 250);
  }, function(e) { botones.forEach(function(b) { b.disabled = false; }); mostrarToast(e.message || 'Error al actualizar.', 'error'); });
}

function _adminRenderBannerQueLlevar() {
  var slot = document.getElementById('admin-banner-equip-slot');
  if (!slot) return;
  if (!_admBannerQueLlevar || _admBannerQueLlevar.length === 0) { slot.innerHTML = ''; return; }
  var tieneHoy = _admBannerQueLlevar.some(function(q) { return q._ventana === 'hoy'; });
  var texto = 'Equipamiento para llevar ' + (tieneHoy ? 'hoy' : 'mañana');
  var porVentana = {};
  _admBannerQueLlevar.forEach(function(q) {
    var etiqueta = q._ventana === 'hoy' ? 'Hoy' : 'Mañana';
    if (!porVentana[etiqueta]) porVentana[etiqueta] = [];
    porVentana[etiqueta].push(q);
  });
  var filas = '';
  ['Hoy', 'Mañana'].forEach(function(etiqueta) {
    if (!porVentana[etiqueta]) return;
    filas += '<div style="font-weight:800;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.8px;color:var(--brand);margin:10px 0 6px;">' + etiqueta + '</div>';
    porVentana[etiqueta].forEach(function(q) { filas += _adminQueLlevarFilaHtml(q); });
  });
  slot.innerHTML =
    '<div class="admin-dash-banner" id="admin-banner-equip">' +
      '<div class="admin-dash-banner-header" onclick="adminToggleBanner(\'admin-banner-equip-body\')">' +
        '<span class="material-symbols-outlined admin-dash-banner-icon">backpack</span>' +
        '<span class="admin-dash-banner-texto">' + texto + '</span>' +
        '<span class="material-symbols-outlined admin-dash-banner-chevron" id="admin-banner-equip-body-chevron">expand_more</span>' +
      '</div>' +
      '<div class="admin-dash-banner-body" id="admin-banner-equip-body">' +
        '<div class="admin-dash-banner-body-inner">' + filas + '</div>' +
      '</div>' +
    '</div>';
}

// ── Dashboard admin, Tanda 2: burbuja de "Enviar notificación" ──────────────────
// Reemplaza a la vieja adminIrNotif()/pantalla s-admin-notif -- mismos ids/
// campos/función adminEnviarNotif(), ahora embebidos como burbuja bajo la
// tile en vez de navegar a una pantalla completa (contenido corto, ver
// MANIFEST.md "Cambios recientes").
function adminAbrirNotifBubble(tileEl) {
  var yaAbierto = _admDashAbierto === 'notif';
  _adminCerrarTodoAbierto();
  if (yaAbierto) return;
  var selDest = document.getElementById('adm-notif-destino');
  selDest.innerHTML = '<option value="todos">📢 Todes (suscritxs)</option>';
  adminApi({ action: 'adminGetUsuarios' }, function(res) {
    (res || []).forEach(function(u) {
      var op = document.createElement('option'); op.value = op.textContent = u.nombre; selDest.appendChild(op);
    });
  }, function() {});
  document.getElementById('adm-notif-titulo').value = '';
  document.getElementById('adm-notif-msg').value = '';
  document.getElementById('adm-notif-fecha').value = '';
  document.getElementById('err-admin-notif').style.display = 'none';
  tileEl.classList.add('admin-notif-tile-activa');
  document.getElementById('admin-notif-bubble').style.display = 'block';
  _admDashAbierto = 'notif';
}

function _adminCerrarNotifBubbleInterno() {
  var tile = document.querySelector('.admin-dash-tile.admin-notif-tile-activa');
  if (tile) tile.classList.remove('admin-notif-tile-activa');
  var bubble = document.getElementById('admin-notif-bubble');
  if (bubble) bubble.style.display = 'none';
}

// ── Dashboard admin, Tanda 2: "container transform" de tile a pantalla completa ─
// Usado por Revisar reservas / Equipamiento / Qué llevar (contenido largo,
// ver MANIFEST.md "Cambios recientes"): la tile se resalta y de ahí "crece"
// (técnica FLIP: transform translate+scale desde el rect de la tile hasta el
// rect natural de la pantalla ya activa, nunca animando width/height/top/left
// directo) hasta cubrir toda la pantalla, con el mismo color de fondo que
// tenía la tile resaltada. El botón atrás de #top-bar (ya lo muestra ir() vía
// TOP_BAR_CONFIG) se reemplaza por la animación inversa antes de volver de
// verdad al dashboard.
function _adminAbrirFullscreen(pantallaId, origenEl, contenedorSkeletonId, cargarFn) {
  _adminCerrarTodoAbierto();
  var tile = origenEl || document.querySelector('.admin-dash-tile[data-tile="' + pantallaId + '"]');
  if (!tile) { ir(pantallaId); cargarFn(); return; }
  tile.classList.add('admin-tile-highlight');
  setTimeout(function() {
    tile.classList.remove('admin-tile-highlight');
    var tileRect = tile.getBoundingClientRect();
    var tileBg = getComputedStyle(tile).backgroundColor;
    var skelCont = document.getElementById(contenedorSkeletonId);
    if (skelCont) skelCont.innerHTML = _skeletonQueLlevarHtml();
    var pantalla = document.getElementById(pantallaId);
    pantalla.style.animation = 'none';
    ir(pantallaId);
    var fullRect = pantalla.getBoundingClientRect();
    var bgFinal = getComputedStyle(pantalla).backgroundColor;
    var scaleX = tileRect.width / fullRect.width;
    var scaleY = tileRect.height / fullRect.height;
    var tx = (tileRect.left + tileRect.width / 2) - (fullRect.left + fullRect.width / 2);
    var ty = (tileRect.top + tileRect.height / 2) - (fullRect.top + fullRect.height / 2);
    pantalla.style.transformOrigin = 'center center';
    pantalla.style.overflow = 'hidden';
    pantalla.style.borderRadius = '14px';
    pantalla.style.background = tileBg;
    pantalla.style.transition = 'none';
    pantalla.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scaleX + ',' + scaleY + ')';
    void pantalla.offsetWidth;
    pantalla.style.transition = 'transform 0.38s var(--ease-sheet), border-radius 0.38s var(--ease-sheet), background 0.38s ease';
    requestAnimationFrame(function() {
      pantalla.style.transform = 'translate(0,0) scale(1,1)';
      pantalla.style.borderRadius = '0px';
      pantalla.style.background = bgFinal;
    });
    var topBtn = document.getElementById('top-bar-btn');
    if (topBtn) topBtn.onclick = function() { _adminCerrarFullscreen(pantallaId); };
    setTimeout(function() {
      pantalla.style.transition = '';
      pantalla.style.transform = '';
      pantalla.style.borderRadius = '';
      pantalla.style.overflow = '';
      pantalla.style.background = '';
    }, 400);
    _admDashOrigenRect = tileRect;
    cargarFn();
  }, 150);
}

// Animación inversa: encoge la pantalla activa de vuelta al rect de la tile
// que la abrió (guardado en _admDashOrigenRect al abrir -- la tile real vive
// dentro de s-admin-home, oculta con display:none mientras la pantalla
// completa está activa, así que su rect ya no se puede volver a medir en
// vivo acá) y recién entonces navega de verdad de vuelta al dashboard.
function _adminCerrarFullscreen(pantallaId) {
  var pantalla = document.getElementById(pantallaId);
  var rect = _admDashOrigenRect;
  if (!pantalla || !rect) { volver('s-admin-home'); return; }
  var fullRect = pantalla.getBoundingClientRect();
  var scaleX = rect.width / fullRect.width;
  var scaleY = rect.height / fullRect.height;
  var tx = (rect.left + rect.width / 2) - (fullRect.left + fullRect.width / 2);
  var ty = (rect.top + rect.height / 2) - (fullRect.top + fullRect.height / 2);
  pantalla.style.transformOrigin = 'center center';
  pantalla.style.overflow = 'hidden';
  pantalla.style.transition = 'transform 0.32s var(--ease-sheet), border-radius 0.32s var(--ease-sheet)';
  requestAnimationFrame(function() {
    pantalla.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scaleX + ',' + scaleY + ')';
    pantalla.style.borderRadius = '14px';
  });
  setTimeout(function() {
    volver('s-admin-home');
    pantalla.style.transition = '';
    pantalla.style.transform = '';
    pantalla.style.borderRadius = '';
    pantalla.style.overflow = '';
    _admDashOrigenRect = null;
    _adminCargarBanners();
  }, 320);
}

// ── Color de énfasis — selector TEMPORAL (ver comentario en index.html) ────────
// Paleta de arranque, mismo criterio que el color picker de Pivot: unos
// pocos presets + personalizado libre via <input type="color">.
var ADMIN_COLOR_PRESETS = ['#F97316', '#EF4444', '#EC4899', '#A855F7', '#3B82F6', '#14B8A6', '#22C55E', '#F59E0B'];

function adminRenderColorEnfasis() {
  var cont = document.getElementById('admin-color-swatches');
  if (!cont) return;
  var actual = (typeof _ceColorActual !== 'undefined' && _ceColorActual) ? _ceColorActual.toLowerCase() : '#f97316';
  cont.innerHTML = ADMIN_COLOR_PRESETS.map(function(hex) {
    var sel = hex.toLowerCase() === actual;
    return '<button type="button" class="admin-color-swatch' + (sel ? ' sel' : '') + '" style="background:' + hex + ';" onclick="adminCambiarColorEnfasis(\'' + hex + '\')" aria-label="' + hex + '"></button>';
  }).join('');
  var custom = document.getElementById('admin-color-custom-input');
  if (custom) custom.value = actual;
}

function adminCambiarColorEnfasis(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  aplicarColorEnfasis(hex);
  adminRenderColorEnfasis();
  adminApi({ action: 'adminSetColorEnfasis', hex: hex }, function(res) {
    if (!res.exito) mostrarToast(res.error || 'No se pudo guardar el color.', 'error');
  }, function(e) { mostrarToast(e.message || 'No se pudo guardar el color.', 'error'); });
}

function adminCerrarSesionLocal(silencioso) {
  if (!silencioso && !confirm('¿Cerrar sesión de administradorx?')) return;
  if (_adminToken) api({ action: 'adminCerrarSesion', adminToken: _adminToken }, function(){}, function(){});
  _adminToken = ''; _adminEmail = '';
  localStorage.removeItem('adminSession');
  if (!silencioso) ir('s1');
}

// ── Reservas ──────────────────────────────────────────────────────────────────
// origenEl: la tile que disparó la apertura (pasada como `this` desde
// index.html); si no llega (ej. el link "Ver todas las reservas ↗" del
// banner de pendientes), _adminAbrirFullscreen() la busca sola por
// data-tile="s-admin-reservas".
function adminIrReservas(origenEl) {
  _adminAbrirFullscreen('s-admin-reservas', origenEl, 'admin-reservas-lista', function() {
    adminApi({ action: 'adminGetReservas' }, function(res) {
      _admTodasReservas = res || [];
      adminRenderReservas();
    }, function(e) { mostrarToast(e.message || 'Error al cargar reservas.', 'error'); });
  });
}

// Botón "Actualizar" DENTRO de s-admin-reservas ya abierta -- a diferencia de
// adminIrReservas(), no dispara ninguna animación (la pantalla ya está
// activa), solo refresca los datos en el lugar.
function adminRefreshReservas() {
  adminApi({ action: 'adminGetReservas' }, function(res) {
    _admTodasReservas = res || [];
    adminRenderReservas();
  }, function(e) { mostrarToast(e.message || 'Error al cargar reservas.', 'error'); });
}

function adminFiltroReservas(filtro, label) {
  _admFiltro = filtro;
  document.querySelectorAll('#s-admin-reservas .opcion').forEach(function(o) { o.classList.remove('sel'); });
  label.classList.add('sel');
  adminRenderReservas();
}

function adminRenderReservas() {
  var lista = _admFiltro === 'pendientes'
    ? _admTodasReservas.filter(function(r) { return r.estado === 'Pendiente'; })
    : _admTodasReservas;

  if (_admFiltro === 'todas') {
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var meses = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
    lista = lista.filter(function(r) {
      var f = r.fecha.toString().toLowerCase().trim();
      if (meses[f] !== undefined) {
        var inicioMes = new Date(hoy.getFullYear(), meses[f], 1);
        return inicioMes >= new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      }
      var mDia = f.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/);
      if (mDia && meses[mDia[2].normalize('NFD').replace(/[̀-ͯ]/g,'')] !== undefined) {
        var mes = meses[mDia[2].normalize('NFD').replace(/[̀-ͯ]/g,'')];
        var anio = hoy.getFullYear();
        var fechaClase = new Date(anio, mes, parseInt(mDia[1]));
        if (fechaClase < new Date(hoy.getFullYear(), hoy.getMonth(), 1)) fechaClase.setFullYear(anio + 1);
        return fechaClase >= hoy;
      }
      return true;
    });
  }

  var selMes = document.getElementById('filtro-mes-reservas');
  var wrapper = document.getElementById('filtro-fecha-wrapper');
  var mesesMap = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
  if (_admFiltro === 'todas') {
    wrapper.style.display = '';
    if (!selMes._inicializado) { selMes.value = String(new Date().getMonth()); selMes._inicializado = true; }
    var mesSeleccionado = parseInt(selMes.value);
    lista = lista.filter(function(r) {
      var f = r.fecha.toString().toLowerCase().trim();
      if (mesesMap[f] !== undefined) return mesesMap[f] === mesSeleccionado;
      var mDia = f.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/);
      if (mDia) {
        var mesNombre = mDia[2].normalize('NFD').replace(/[̀-ͯ]/g,'');
        return mesesMap[mesNombre] === mesSeleccionado;
      }
      return true;
    });
  } else {
    wrapper.style.display = 'none';
  }

  var grupos = {}, orden = [];
  lista.forEach(function(r) {
    if (!grupos[r.fecha]) { grupos[r.fecha] = []; orden.push(r.fecha); }
    grupos[r.fecha].push(r);
  });

  var html = '';
  if (lista.length === 0) {
    html = '<p style="text-align:center;color:var(--muted);padding:20px 0;">' + (_admFiltro === 'pendientes' ? 'No hay reservas pendientes. 🎉' : 'No hay reservas.') + '</p>';
  } else {
    orden.forEach(function(fecha, idx) {
      var count = grupos[fecha].length;
      var grupoId = 'grp-res-' + idx;
      var abierto = idx === 0;
      var partesFecha = fecha.split(' - ');
      var fechaCorta = partesFecha[0];
      var fechaExtra = partesFecha.slice(1).join(' · ');

      html += '<div style="border:2px solid var(--border-light);border-radius:12px;margin-bottom:10px;overflow:hidden;">';
      html += '<div onclick="toggleGrupoReserva(\'' + grupoId + '\', this)" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;background:var(--surface-light);">';
      html += '<div><div style="font-weight:800;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.8px;color:var(--brand);">' + fechaCorta + '</div></div>';
      html += '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:0.75rem;color:var(--dk-text-muted);font-weight:600;">' + count + ' reserva' + (count !== 1 ? 's' : '') + '</span><span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--dk-text-muted);transition:transform 0.3s;' + (abierto ? 'transform:rotate(180deg);' : '') + '">expand_more</span></div>';
      html += '</div>';
      html += '<div id="' + grupoId + '" style="' + (abierto ? 'max-height:2000px;opacity:1;padding:10px 10px 4px;' : 'max-height:0px;opacity:0;padding:0;') + '">';

      if (fechaExtra) {
        html += '<div style="font-size:0.78rem;color:var(--dk-text-muted);font-weight:600;padding:0 4px 10px;">' + fechaExtra + '</div>';
      }
      grupos[fecha].forEach(function(r) {
        var badgeClass = r.estado === 'Confirmada' ? 'badge-confirmada' : r.estado === 'Cancelada' ? 'badge-cancelada' : 'badge-pendiente';
        var equip = [];
        if (r.talla && r.talla.toLowerCase() !== 'no') equip.push('🛼 ' + r.talla);
        if (r.protecciones && r.protecciones.toLowerCase() !== 'no') equip.push('🛡️ ' + r.protecciones);
        html += '<div class="reserva-card" style="margin-bottom:8px;">' +
          '<div class="reserva-header"><span class="reserva-fecha">' + r.nombre + '</span><span class="badge ' + badgeClass + '">' + r.estado + '</span></div>' +
          '<div class="reserva-detalle">' + (equip.length ? equip.join(' · ') : '✅ Equipo propio') + (r.monto ? ' · 💵 ' + r.monto : '') + '</div>';
        if (r.estado === 'Pendiente') {
          html += '<div style="display:flex;gap:8px;margin-top:10px;">' +
            '<button class="btn btn-primary" style="padding:11px;font-size:0.82rem;" onclick="adminCambiarEstado(' + r.fila + ',\'Confirmada\',this)">✅ Aprobar</button>' +
            '<button class="btn-cancelar" style="margin-top:0;" onclick="adminCambiarEstado(' + r.fila + ',\'Cancelada\',this)">❌ Cancelar</button>' +
            '</div>';
        } else if (r.estado === 'Confirmada') {
          html += '<button class="btn-cancelar" onclick="adminCambiarEstado(' + r.fila + ',\'Cancelada\',this)">❌ Cancelar esta reserva</button>';
        }
        html += '</div>';
      });

      html += '</div></div>';
    });
  }
  document.getElementById('admin-reservas-lista').innerHTML = html;
}

function toggleGrupoReserva(id, header) {
  var contenido = document.getElementById(id);
  var chevron = header.querySelector('.material-symbols-outlined');
  var abierto = contenido.style.maxHeight && contenido.style.maxHeight !== '0px';
  document.querySelectorAll('[id^="grp-res-"]').forEach(function(el) {
    el.style.maxHeight = '0px'; el.style.opacity = '0'; el.style.padding = '0';
    var h = el.previousElementSibling;
    if (h) { var c = h.querySelector('.material-symbols-outlined'); if (c) c.style.transform = ''; }
  });
  if (!abierto) {
    contenido.style.maxHeight = contenido.scrollHeight + 200 + 'px';
    contenido.style.opacity = '1';
    contenido.style.padding = '10px 10px 4px';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  }
}

function adminCambiarEstado(fila, estado, btn) {
  if (!confirm('¿Marcar esta reserva como "' + estado + '"? Se notificará a la persona.')) return;
  btn.disabled = true;
  adminApi({ action: 'adminSetEstadoReserva', fila: fila, estado: estado }, function(res) {
    if (res.exito) {
      _admTodasReservas.forEach(function(r) { if (r.fila === fila) r.estado = estado; });
      adminRenderReservas();
    } else { btn.disabled = false; mostrarToast(res.error || 'Error al actualizar.', 'error'); }
  }, function(e) { btn.disabled = false; mostrarToast(e.message || 'Error al actualizar.', 'error'); });
}

// ── Notificaciones ────────────────────────────────────────────────────────────
// adminAbrirNotifBubble()/_adminCerrarNotifBubbleInterno() están más arriba,
// junto al resto de la mecánica de banners/burbuja del dashboard (Tanda 2).
function adminEnviarNotif() {
  var titulo = document.getElementById('adm-notif-titulo').value.trim();
  var msg = document.getElementById('adm-notif-msg').value.trim();
  var destino = document.getElementById('adm-notif-destino').value;
  var fechaVal = document.getElementById('adm-notif-fecha').value;
  if (!titulo || !msg) { err('err-admin-notif', 'Completa el título y el mensaje.'); return; }
  var sendAfter = '';
  if (fechaVal) {
    var f = new Date(fechaVal);
    if (isNaN(f.getTime()) || f.getTime() < Date.now() + 60000) { err('err-admin-notif', 'La fecha programada debe ser al menos 1 minuto en el futuro.'); return; }
    sendAfter = f.toISOString();
  }
  var btn = document.getElementById('btn-adm-notif');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Enviando...';
  adminApi({ action: 'adminEnviarPush', titulo: titulo, mensaje: msg, destino: destino, sendAfter: sendAfter }, function(res) {
    btn.disabled = false; btn.innerHTML = 'Enviar notificación 📣';
    if (res.exito) {
      mostrarToast(sendAfter ? 'Notificación programada.' : 'Notificación enviada.', 'ok');
      document.getElementById('adm-notif-titulo').value = ''; document.getElementById('adm-notif-msg').value = ''; document.getElementById('adm-notif-fecha').value = '';
    } else { err('err-admin-notif', res.error || 'Error al enviar.'); }
  }, function(e) { btn.disabled = false; btn.innerHTML = 'Enviar notificación 📣'; err('err-admin-notif', 'Error: ' + e.message); });
}

// ── Qué llevar ────────────────────────────────────────────────────────────────
function adminRefreshQueLlevar() {
  var lista = document.getElementById('admin-quellevar-lista');
  if (lista) lista.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner" style="width:28px;height:28px;border-width:3px;margin:0 auto;"></div></div>';
  adminApi({ action: 'adminGetQueLlevar' }, function(res) {
    adminRenderQueLlevar(res);
  }, function(e) { mostrarToast(e.message || 'Error al actualizar.', 'error'); });
}

// Skeleton de #admin-quellevar-lista mientras adminIrQueLlevar() espera la
// respuesta real — filas con la forma de un .reserva-card real (nombre +
// detalle), mismo shimmer que .fi-skel-block/.equip-skel.
function _skeletonQueLlevarHtml() {
  var fila = '<div class="reserva-card" style="margin-bottom:8px;"><div class="ql-skel-line ql-skel-line-title"></div><div class="ql-skel-line ql-skel-line-sub"></div></div>';
  return fila.repeat(4);
}

function adminIrQueLlevar(origenEl) {
  _adminAbrirFullscreen('s-admin-quellevar', origenEl, 'admin-quellevar-lista', function() {
    adminApi({ action: 'adminGetQueLlevar' }, function(res) {
      adminRenderQueLlevar(res);
    }, function(e) { mostrarToast(e.message || 'Error al cargar equipamiento.', 'error'); });
  });
}

// Fila HTML de una persona (nombre + pronombres + WhatsApp + equipamiento) —
// extraída para reusarse tal cual tanto en adminRenderQueLlevar() (pantalla
// completa) como en _adminRenderBannerQueLlevar() (banner embebido del
// dashboard, Tanda 2, ver MANIFEST.md "Cambios recientes").
function _adminQueLlevarFilaHtml(q) {
  var equip = []; if (q.patines && q.patines.toLowerCase() !== 'no') equip.push('🛼 Patines ' + q.patines);
  if (q.protecciones && q.protecciones.toLowerCase() !== 'no') {
    var protecTexto = q.protecciones.toLowerCase() === 'sí' || q.protecciones.toLowerCase() === 'si' ? '🛡️ Protecciones completas' : '🛡️ ' + q.protecciones;
    equip.push(protecTexto);
  }
  var pronBadge = q.pronombres ? '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:20px;background:var(--dk-badge-bg);color:var(--dk-badge-text);font-size:0.68rem;font-weight:600;vertical-align:middle;">' + q.pronombres + '</span>' : '';
  if (!q.waLink && q.telefono) {
    var prefijoMatch = (q.prefijo || '').match(/\+(\d+)/);
    var codigoPais = prefijoMatch ? prefijoMatch[1] : '593';
    q.waLink = 'https://wa.me/' + codigoPais + q.telefono.replace(/\D/g,'').replace(/^0+/,'');
  }
  var waBtnQL = q.waLink ? '<a href="' + q.waLink + '" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--wa-brand);flex-shrink:0;text-decoration:none;margin-left:8px;vertical-align:middle;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.845L.057 23.571a.75.75 0 0 0 .92.921l5.763-1.473A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.374l-.36-.214-3.713.949.981-3.625-.235-.374A9.818 9.818 0 1 1 12 21.818z"/></svg></a>' : '';
  return '<div class="reserva-card" style="margin-bottom:8px;"><div style="display:flex;align-items:center;justify-content:space-between;"><div style="font-weight:800;">' + q.nombre + pronBadge + '</div>' + waBtnQL + '</div><div class="reserva-detalle" style="margin-top:4px;">' + (equip.join(' · ') || '—') + '</div></div>';
}

function adminRenderQueLlevar(res) {
  var html = '';
  if (!res || res.length === 0) {
    html = '<p style="text-align:center;color:var(--muted);padding:20px 0;">No hay equipamiento asignado por ahora. 🎉</p>';
  } else {
    var grupos = {}, orden = [];
    var diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    var mesesNombres = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    function formatFechaQL(val) {
      if (!val || !val.toString().includes('GMT')) return val;
      var f = new Date(val);
      var dia = f.getUTCDate(); var mes = f.getUTCMonth(); var anio = f.getUTCFullYear();
      return diasSemana[new Date(Date.UTC(anio, mes, dia)).getUTCDay()] + ' ' + dia + ' de ' + mesesNombres[mes] + ' de ' + anio;
    }
    res.forEach(function(q) {
      q.fecha = formatFechaQL(q.fecha);
      if (!grupos[q.fecha]) { grupos[q.fecha] = []; orden.push(q.fecha); }
      grupos[q.fecha].push(q);
    });
    orden.forEach(function(fecha) {
      html += '<div style="margin-bottom:20px;">';
      var count = grupos[fecha].length;
      html += '<div style="display:flex;align-items:baseline;gap:8px;padding:8px 4px 10px;"><span style="font-weight:800;font-size:0.85rem;text-transform:uppercase;letter-spacing:1px;color:var(--brand);">' + fecha + '</span><span style="font-size:0.78rem;color:var(--dk-text-muted);font-weight:600;">' + count + ' persona' + (count !== 1 ? 's' : '') + '</span></div>';
      grupos[fecha].forEach(function(q) { html += _adminQueLlevarFilaHtml(q); });
      html += '</div>';
    });
  }
  var listaEl = document.getElementById('admin-quellevar-lista');
  listaEl.innerHTML = html;
  void listaEl.offsetWidth; listaEl.style.animation = 'fadeIn 0.3s ease';
}

// ── Equipamiento ──────────────────────────────────────────────────────────────
function adminIrEquip(origenEl) {
  _adminAbrirFullscreen('s-admin-equip', origenEl, 'admin-equip-lista', function() {
    adminApi({ action: 'adminGetEquipamiento' }, function(res) {
      adminRenderEquip(res);
    }, function(e) { mostrarToast(e.message || 'Error al cargar equipamiento.', 'error'); });
  });
}

function adminRenderEquip(res) {
  var html = '<div class="r-fila" style="display:flex;gap:8px;font-weight:800;font-size:0.78rem;text-transform:uppercase;color:var(--muted);padding:4px 0;"><span style="flex:1;">Talla</span><span style="width:110px;">Cantidad</span><span style="width:42px;"></span></div>';
  (res.tallas || []).forEach(function(t) { html += adminFilaTallaHtml(t.talla, t.cantidad); });
  var listaEl = document.getElementById('admin-equip-lista');
  listaEl.innerHTML = html;
  void listaEl.offsetWidth; listaEl.style.animation = 'fadeIn 0.3s ease';
  document.getElementById('adm-equip-protec').value = res.protecciones || 0;
}

function adminFilaTallaHtml(talla, cantidad) {
  return '<div class="adm-fila-talla" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">' +
    '<input type="text" class="adm-talla" value="' + (talla || '') + '" placeholder="Ej: 38" style="flex:1;">' +
    '<input type="number" class="adm-cant" value="' + (cantidad != null ? cantidad : 1) + '" min="0" style="width:110px;">' +
    '<button onclick="this.parentElement.remove()" style="width:42px;height:42px;border:2px solid var(--error-light-border);background:var(--error-lightest);color:var(--error);border-radius:10px;cursor:pointer;font-weight:800;">✕</button>' +
    '</div>';
}

function adminAgregarTalla() {
  document.getElementById('admin-equip-lista').insertAdjacentHTML('beforeend', adminFilaTallaHtml('', 1));
}

function adminGuardarEquip(btn) {
  if (btn) btn.disabled = true;
  var tallas = [];
  document.querySelectorAll('#admin-equip-lista .adm-fila-talla').forEach(function(f) {
    var t = f.querySelector('.adm-talla').value.trim();
    var c = parseInt(f.querySelector('.adm-cant').value, 10) || 0;
    if (t) tallas.push({ talla: t, cantidad: c });
  });
  var protec = parseInt(document.getElementById('adm-equip-protec').value, 10) || 0;
  mostrarCargando('Guardando...');
  adminApi({ action: 'adminGuardarEquipamiento', tallas: JSON.stringify(tallas), protecciones: protec }, function(res) {
    ocultarCargando();
    if (btn) btn.disabled = false;
    if (res.exito) { mostrarToast('Equipamiento actualizado.', 'ok'); } else { err('err-admin-equip', res.error || 'Error.'); }
  }, function(e) { ocultarCargando(); if (btn) btn.disabled = false; err('err-admin-equip', 'Error: ' + e.message); });
}

// ── Usuarios ──────────────────────────────────────────────────────────────────
function adminIrUsuarios() {
  mostrarCargando('Cargando usuarios...');
  adminApi({ action: 'adminGetUsuarios' }, function(res) {
    ocultarCargando();
    var html = '';
    (res || []).forEach(function(u) {
      html += '<div class="reserva-card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
        '<div><div style="font-weight:800;">' + u.nombre + '</div><div style="font-size:0.8rem;color:var(--muted);">' + (u.email || 'sin email') + '</div></div>' +
        '<button onclick="adminEliminarUsuarioClick(\'' + u.nombre.replace(/'/g, "\\'") + '\')" style="border:2px solid var(--error-light-border);background:var(--error-lightest);color:var(--error);border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:800;font-size:0.8rem;flex-shrink:0;">Eliminar</button>' +
        '</div>';
    });
    document.getElementById('admin-usuarios-lista').innerHTML = html || '<p style="text-align:center;color:var(--muted);">Sin usuarios.</p>';
    ir('s-admin-usuarios');
  }, function(e) { ocultarCargando(); mostrarToast(e.message || 'Error al cargar usuarios.', 'error'); });
}

function adminEliminarUsuarioClick(nombre) {
  var escrito = prompt('⚠️ Vas a ELIMINAR a "' + nombre + '" y todos sus datos de la hoja Mirlxs.\n\nPara confirmar, escribe el nombre exactamente:');
  if (escrito === null) return;
  if (escrito.trim() !== nombre) { mostrarToast('El nombre no coincide. No se eliminó nada.', 'error'); return; }
  mostrarCargando('Eliminando...');
  adminApi({ action: 'adminEliminarUsuario', nombre: nombre }, function(res) {
    ocultarCargando();
    if (res.exito) { adminIrUsuarios(); } else { mostrarToast(res.error || 'Error al eliminar.', 'error'); }
  }, function(e) { ocultarCargando(); mostrarToast(e.message || 'Error al eliminar.', 'error'); });
}

// ── Administradorxs ───────────────────────────────────────────────────────────
function adminIrAdmins() {
  mostrarCargando('Cargando...');
  adminApi({ action: 'adminGetAdmins' }, function(res) {
    ocultarCargando();
    var html = '';
    (res || []).forEach(function(a) {
      html += '<div class="reserva-card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
        '<div><div style="font-weight:700;font-size:0.9rem;">' + a.email + (a.principal ? ' <span class="badge badge-confirmada" style="margin-left:6px;">Principal</span>' : '') + '</div>' +
        (a.invitadoPor ? '<div style="font-size:0.78rem;color:var(--muted);">Invitado por ' + a.invitadoPor + '</div>' : '') + '</div>' +
        (!a.principal && _adminEmail === 'quindesvolcanicosrd@gmail.com'
          ? '<button onclick="adminQuitarClick(\'' + a.email + '\')" style="border:2px solid var(--error-light-border);background:var(--error-lightest);color:var(--error);border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:800;font-size:0.8rem;flex-shrink:0;">Quitar</button>'
          : '') +
        '</div>';
    });
    document.getElementById('admin-admins-lista').innerHTML = html;
    ir('s-admin-admins');
  }, function(e) { ocultarCargando(); mostrarToast(e.message || 'Error al cargar administradores.', 'error'); });
}

function adminInvitar() {
  var email = document.getElementById('adm-nuevo-email').value.trim();
  if (!email) { err('err-admin-admins', 'Escribe un email.'); return; }
  adminApi({ action: 'adminAgregarAdmin', email: email, invitadoPor: _adminEmail }, function(res) {
    if (res.exito) { document.getElementById('adm-nuevo-email').value = ''; adminIrAdmins(); }
    else { err('err-admin-admins', res.error || 'Error.'); }
  }, function(e) { err('err-admin-admins', 'Error: ' + e.message); });
}

function adminQuitarClick(email) {
  if (!confirm('¿Quitar acceso admin a ' + email + '?')) return;
  adminApi({ action: 'adminQuitarAdmin', email: email, solicitante: _adminEmail }, function(res) {
    if (res.exito) { adminIrAdmins(); } else { mostrarToast(res.error || 'Error.', 'error'); }
  }, function(e) { mostrarToast(e.message || 'Error.', 'error'); });
}
