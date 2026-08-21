var GOOGLE_CLIENT_ID_FRONT = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';
var _adminToken = '';
var _adminEmail = '';
var _adminNombre = '';
// true si esta cuenta admin NO debe comportarse como usuarix normal (no
// paga cuota) -- independiente de si E.datos está poblado o no. E.datos ya
// no alcanza solo para decidir esto desde que restaurarSesion()/validarPin()
// también cargan datos reales para admins sin cuota (ver MANIFEST.md).
var _dashboardAdminLimitado = false;
var _admTodasReservas = [];
var _admFiltro = 'pendientes';
var _gisInicializado = false;

// "Mi Liga" (s-miliga, tab propio de la nav inferior -- antes aj-sub-miliga,
// overlay embebido en Ajustes/s-datos): banners
// condicionales + burbujas embebidas de las 4 tiles grandes (Reservas /
// Notificación / Equipamiento / Qué llevar) + 2 pills chicas (Color /
// Precios de clases) + Administradorxs — ver MANIFEST.md "Cambios
// recientes". Tanda 7: se elimina s-admin-home del todo (era un dashboard
// separado, pantalla propia) y TODO su contenido se muda acá — "Mi Liga" es
// ahora el único lugar administrativo de la app. Las 6 burbujas comparten el
// MISMO mecanismo inline (nunca pantalla completa, nunca navegación) — ver
// ADMIN_TILE_INFO/adminToggleBurbuja() más abajo. `_admDashAbierto` trackea
// qué hay abierto entre lo que puede convivir con "Mi Liga" visible: los 2
// acordeones de banner ('admin-banner-pendientes-body-ml'/
// 'admin-banner-equip-body-ml') o una de las 6 burbujas (clave de
// ADMIN_TILE_INFO: 'notif'/'s-admin-reservas'/'s-admin-equip'/
// 's-admin-quellevar'/'admin-color'/'admin-precios') — todo vive siempre en
// el mismo `s-miliga`, así que sí necesitan exclusión mutua entre sí.
var _admDashAbierto = null;
var _admBannerPendientes = null; // null = todavía no llegó la respuesta
var _admBannerQueLlevar = null;

// Tanda 4 (rediseño panel admin) — ver MANIFEST.md "Cambios recientes":
// destinatarios de Notificación (bottom sheet con buscador) y hora
// seleccionada en la rueda de tiempo (la fecha sigue en un <input
// type="date"> nativo, ya no un <input type="datetime-local">).
var _admDestinatarios = [];
var _admNotifHora = null;
var _admNotifMinuto = null;

// Universo de tallas estándar para las pills de "Agregar talla"
// (Equipamiento) — EU 30 a 45 con su equivalente US aproximado (referencia
// para admins, la talla guardada/autoritativa sigue siendo el número EU).
var TALLAS_EU_US = [
  { eu: 30, us: '12' }, { eu: 31, us: '13' }, { eu: 32, us: '1' }, { eu: 33, us: '2' },
  { eu: 34, us: '3' }, { eu: 35, us: '4' }, { eu: 36, us: '5' }, { eu: 37, us: '6' },
  { eu: 38, us: '7' }, { eu: 39, us: '8' }, { eu: 40, us: '8.5' }, { eu: 41, us: '9.5' },
  { eu: 42, us: '10.5' }, { eu: 43, us: '11.5' }, { eu: 44, us: '12.5' }, { eu: 45, us: '13.5' }
];

var ADMIN_PANTALLAS = ['s-admin-login','s-admin-usuarios'];

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

// Cuenta admin "pura" (dashboardAdmin:true) o restauración de sesión admin
// (irAdminLogin()): llega directo a "Mi Liga" -- ya no hay ningún dashboard
// separado (s-admin-home, eliminado Tanda 7) ni Ajustes (Mi Liga salió de
// ahí) al que aterrizar de entrada.
function adminEntrar() {
  _admDashAbierto = null;
  irMiLiga();
}

// "Mi Liga" -- tab propio de la nav inferior (antes aj-sub-miliga, overlay
// embebido en Ajustes), mostrando todo de entrada sin subsecciones propias.
// `_adminCargarMiLiga()` ya cubre banners/administradorxs/color/precios --
// única carga de datos necesaria antes de mostrar la pantalla.
function irMiLiga() {
  _adminCargarMiLiga();
  ir('s-miliga');
}

// ── Mi Liga: banners condicionales + burbujas embebidas ─────────────────────────
// Cierra lo que esté abierto entre los 2 acordeones de banner y las 6
// burbujas de tile/pill (las únicas que pueden convivir con "Mi Liga"
// visible al mismo tiempo) — llamado al principio de cualquier acción
// "abrir X" para que nunca queden 2 abiertos a la vez. Defensivo ante
// cualquier valor viejo que _admDashAbierto pudiera tener: cualquier valor
// que no matchee ninguno de los casos conocidos simplemente se descarta
// sin tocar el DOM.
function _adminCerrarTodoAbierto() {
  if (_admDashAbierto && ADMIN_TILE_INFO[_admDashAbierto]) {
    var tile = document.querySelector('.admin-dash-tile.admin-tile-activa');
    if (tile) tile.classList.remove('admin-tile-activa');
    var bubble = document.getElementById(ADMIN_TILE_INFO[_admDashAbierto].bubbleId);
    if (bubble) bubble.style.display = 'none';
  } else if (_admDashAbierto && _admDashAbierto.indexOf('admin-banner-') === 0) {
    // Cualquier bodyId de banner, con o sin sufijo de scope (Tanda 3, ver
    // MANIFEST.md "Cambios recientes" -- Mi Liga reusa estos mismos banners
    // con ids tipo 'admin-banner-pendientes-body-ml') -- ya no se compara
    // contra los 2 literales sin scope únicamente.
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

// Ventana de fecha "hoy"/"mañana" para el banner de equipamiento -- compara
// DÍA CALENDARIO (hoy o mañana en el sentido de fecha, no de horas restantes
// hasta el entrenamiento): el banner debe verse durante todo el día
// calendario, sin importar a qué hora del día se lo evalúe ni la hora exacta
// del entrenamiento (uno a primera hora de la mañana y otro a última hora de
// la noche del mismo día deben tratarse exactamente igual). No es una
// réplica de recordatoriosQueLlevar() del backend (fuera de este repo, no
// accesible desde acá) -- esa función dispara push puntuales ("1 día antes"/
// "2 horas antes", ver texto de s-admin-quellevar), un criterio de ventana
// horaria angosta que no aplica acá a propósito.
//
// Bug real corregido: la primera versión comparaba el día de `f` leído con
// getters UTC contra el día de "ahora" leído con getters LOCALES y luego
// reenvuelto en Date.UTC() -- dos sistemas de referencia distintos que solo
// coinciden por casualidad durante gran parte del día. Para Ecuador
// (GMT-0500, sin horario de verano), cualquier hora local desde
// aproximadamente las 19:00 en adelante cae, en su equivalente UTC, ya
// dentro del día calendario UTC siguiente -- así que un entrenamiento de
// HOY a la noche (ej. 23:30 hora Ecuador) tenía `f.getUTCDate()` un día por
// delante del "hoy" calculado, y el banner lo mostraba como "mañana" en vez
// de "hoy" durante esa franja. Fix: usar getters LOCALES en los 2 lados de
// la comparación (tanto para `f` como para "ahora"), el mismo marco de
// referencia en ambos -- sin ninguna reinterpretación vía UTC de por medio,
// coherente con que el resto de la app ya asume que la hora del dispositivo
// es la hora real de Ecuador (ver "La hora es la de tu dispositivo" en el
// campo de notificación programada).
function _adminVentanaFecha(fechaRaw) {
  if (!fechaRaw || !fechaRaw.toString().includes('GMT')) return null;
  var f = new Date(fechaRaw);
  var claveFecha = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
  var ahora = new Date();
  var claveHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  var unDia = 86400000;
  if (claveFecha === claveHoy) return 'hoy';
  if (claveFecha === claveHoy + unDia) return 'mañana';
  return null;
}

// Carga los datos de los 2 banners condicionales en paralelo. El parámetro
// `scope` es un resabio de cuando existían 2 contextos distintos (dashboard
// propio con scope='', Mi Liga con scope='-ml', Tanda 3) — desde la Tanda 7
// (ver MANIFEST.md "Cambios recientes", elimina s-admin-home) el único
// caller real es `_adminCargarMiLiga()` con `'-ml'`; se deja el parámetro tal
// cual (en vez de sacarlo) porque los ids del HTML ya llevan ese sufijo
// (`admin-banner-pendientes-slot-ml`, etc.) y renombrarlos no es parte de
// esta simplificación. Independiente de _admTodasReservas (que sigue siendo
// responsabilidad de adminIrReservas()/adminRefreshReservas(), para no
// acoplar el banner con la burbuja de Reservas).
function _adminCargarBanners(scope) {
  scope = scope || '';
  _admBannerPendientes = null; _admBannerQueLlevar = null;
  adminApi({ action: 'adminGetReservas' }, function(res) {
    _admBannerPendientes = (res || []).map(_normalizeReserva).filter(function(r) { return r.estado === 'Pendiente'; });
    _adminRenderBannerPendientes(scope);
  }, function() { _admBannerPendientes = []; _adminRenderBannerPendientes(scope); });
  adminApi({ action: 'adminGetQueLlevar' }, function(res) {
    _admBannerQueLlevar = (res || []).filter(function(q) { q._ventana = _adminVentanaFecha(q.fecha); return q._ventana; });
    _adminRenderBannerQueLlevar(scope);
  }, function() { _admBannerQueLlevar = []; _adminRenderBannerQueLlevar(scope); });
}

function _normalizeReserva(r) {
  r.nombre = r.nombre_usuario || r.nombre || '';
  r.fecha = r.fechaEvento
    ? (r.fechaEvento + (r.donde ? ' - ' + r.donde : ''))
    : (r.mes_texto || '-');
  r.fila = r.id;
  return r;
}
function _adminRenderBannerPendientes(scope) {
  scope = scope || '';
  var slot = document.getElementById('admin-banner-pendientes-slot' + scope);
  if (!slot) return;
  if (!_admBannerPendientes || _admBannerPendientes.length === 0) { slot.innerHTML = ''; return; }
  var filas = _admBannerPendientes.map(function(r) {
    return '<div class="admin-banner-res-row">' +
      '<div class="admin-banner-res-info"><div class="admin-banner-res-nombre">' + r.nombre + '</div><div class="admin-banner-res-fecha">' + r.fecha + '</div></div>' +
      '<div class="admin-banner-res-actions">' +
        '<button class="admin-banner-btn admin-banner-btn-ok" onclick="adminBannerSetEstado(\'' + r.fila + '\',\'Confirmada\',this,\'' + scope + '\')" aria-label="Aprobar"><span class="material-symbols-outlined">check</span></button>' +
        '<button class="admin-banner-btn admin-banner-btn-no" onclick="adminBannerSetEstado(\'' + r.fila + '\',\'Cancelada\',this,\'' + scope + '\')" aria-label="Rechazar"><span class="material-symbols-outlined">close</span></button>' +
      '</div></div>';
  }).join('');
  var n = _admBannerPendientes.length;
  // "Ver todas" abre la burbuja de Reservas directo en el lugar -- Reservas
  // vive ahora en el mismo "Mi Liga" que este banner (Tanda 7, ver
  // MANIFEST.md "Cambios recientes"), ya no hace falta navegar a ningún otro
  // lado (antes, con el dashboard separado, adminIrReservasDesdeMiLiga()
  // cerraba Mi Liga y navegaba a s-admin-home primero -- eliminada).
  var verTodasOnclick = 'adminIrReservas()';
  slot.innerHTML =
    '<div class="admin-dash-banner" id="admin-banner-pendientes' + scope + '">' +
      '<div class="admin-dash-banner-header" onclick="adminToggleBanner(\'admin-banner-pendientes-body' + scope + '\')">' +
        '<span class="material-symbols-outlined admin-dash-banner-icon">pending_actions</span>' +
        '<span class="admin-dash-banner-texto" id="admin-banner-pendientes-texto' + scope + '">Tenés ' + n + ' reserva' + (n !== 1 ? 's' : '') + ' pendiente' + (n !== 1 ? 's' : '') + ' de revisión</span>' +
        '<span class="material-symbols-outlined admin-dash-banner-chevron" id="admin-banner-pendientes-body' + scope + '-chevron">expand_more</span>' +
      '</div>' +
      '<div class="admin-dash-banner-body" id="admin-banner-pendientes-body' + scope + '">' +
        '<div class="admin-dash-banner-body-inner">' + filas +
          '<div class="admin-dash-banner-link" onclick="' + verTodasOnclick + '">Ver todas las reservas ↗</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function adminBannerSetEstado(fila, estado, btn, scope) {
  scope = scope || '';
  var row = btn.closest('.admin-banner-res-row');
  var botones = row.querySelectorAll('.admin-banner-btn');
  botones.forEach(function(b) { b.disabled = true; });
  adminApi({ action: 'adminSetEstadoReserva', id: fila, estado: estado }, function(res) {
    if (!res.exito) { botones.forEach(function(b) { b.disabled = false; }); mostrarToast(res.error || 'Error al actualizar.', 'error'); return; }
    _admBannerPendientes = _admBannerPendientes.filter(function(r) { return r.id !== fila; });
    row.style.transition = 'opacity 0.25s ease';
    row.style.opacity = '0';
    setTimeout(function() {
      row.remove();
      var n = _admBannerPendientes.length;
      var banner = document.getElementById('admin-banner-pendientes' + scope);
      if (n === 0) { if (banner) banner.remove(); if (_admDashAbierto === 'admin-banner-pendientes-body' + scope) _admDashAbierto = null; return; }
      var texto = document.getElementById('admin-banner-pendientes-texto' + scope);
      if (texto) texto.textContent = 'Tenés ' + n + ' reserva' + (n !== 1 ? 's' : '') + ' pendiente' + (n !== 1 ? 's' : '') + ' de revisión';
      var body = document.getElementById('admin-banner-pendientes-body' + scope);
      if (body && body.style.maxHeight && body.style.maxHeight !== '0px') body.style.maxHeight = body.scrollHeight + 'px';
    }, 250);
  }, function(e) { botones.forEach(function(b) { b.disabled = false; }); mostrarToast(e.message || 'Error al actualizar.', 'error'); });
}

// ── Rectificaciones de asistencia (solicitudes de usuarios, ver
// #ev-rect-sheet/js/eventos.js) -- mismo patrón banner+fila
// aprobar/rechazar que "Reservas pendientes" arriba
// (_adminRenderBannerPendientes()/adminBannerSetEstado()), con su propio
// slot (#admin-banner-rectif-slot-ml) para no competir por el mismo
// contenedor. Solo `scope='-ml'` tiene caller real (Mi Liga), mismo criterio
// que _adminCargarBanners().
var _admRectificaciones = [];
function _adminCargarRectificaciones(scope) {
  scope = scope || '';
  adminApi({ action: 'adminGetRectificaciones' }, function(res) {
    _admRectificaciones = Array.isArray(res) ? res : [];
    _adminRenderRectificaciones(scope);
  }, function() { _admRectificaciones = []; _adminRenderRectificaciones(scope); });
}
function _adminRenderRectificaciones(scope) {
  scope = scope || '';
  var slot = document.getElementById('admin-banner-rectif-slot' + scope);
  if (!slot) return;
  if (!_admRectificaciones || _admRectificaciones.length === 0) { slot.innerHTML = ''; return; }
  var n = _admRectificaciones.length;
  var filas = _admRectificaciones.map(function(r) {
    var estadoTexto = r.estadoSolicitado === 'Sin registrar' ? 'No asistí' :
                      r.estadoSolicitado === 'A tiempo' ? 'A horario' : 'Tarde';
    return '<div class="admin-banner-res-row" id="ev-rectif-row-' + r.id + '">' +
      '<div class="admin-banner-res-info">' +
        '<div class="admin-banner-res-nombre">' + (r.nombre || '') + '</div>' +
        '<div class="admin-banner-res-fecha">' + (r.fechaEvento || '') + ' · Solicita: ' + estadoTexto + '</div>' +
      '</div>' +
      '<div class="admin-banner-res-actions">' +
        '<button class="admin-banner-btn admin-banner-btn-ok" onclick="_adminRectifSetEstado(\'' + r.id + '\',\'Aprobada\',this,\'' + scope + '\')" aria-label="Aprobar"><span class="material-symbols-outlined">check</span></button>' +
        '<button class="admin-banner-btn admin-banner-btn-no" onclick="_adminRectifSetEstado(\'' + r.id + '\',\'Rechazada\',this,\'' + scope + '\')" aria-label="Rechazar"><span class="material-symbols-outlined">close</span></button>' +
      '</div>' +
    '</div>';
  }).join('');
  slot.innerHTML =
    '<div class="admin-dash-banner" id="admin-banner-rectif' + scope + '">' +
      '<div class="admin-dash-banner-header" onclick="adminToggleBanner(\'admin-banner-rectif-body' + scope + '\')">' +
        '<span class="material-symbols-outlined admin-dash-banner-icon">edit_note</span>' +
        '<span class="admin-dash-banner-texto" id="admin-banner-rectif-texto' + scope + '">' + n + ' rectificación' + (n !== 1 ? 'es' : '') + ' pendiente' + (n !== 1 ? 's' : '') + '</span>' +
        '<span class="material-symbols-outlined admin-dash-banner-chevron" id="admin-banner-rectif-body' + scope + '-chevron">expand_more</span>' +
      '</div>' +
      '<div class="admin-dash-banner-body" id="admin-banner-rectif-body' + scope + '">' +
        '<div class="admin-dash-banner-body-inner">' + filas + '</div>' +
      '</div>' +
    '</div>';
}
function _adminRectifSetEstado(id, decision, btn, scope) {
  scope = scope || '';
  var row = btn.closest('.admin-banner-res-row');
  var botones = row ? row.querySelectorAll('.admin-banner-btn') : [];
  botones.forEach(function(b) { b.disabled = true; });
  adminApi({ action: 'adminSetEstadoRectificacion', id: id, decision: decision }, function(res) {
    if (!res || !res.exito) {
      botones.forEach(function(b) { b.disabled = false; });
      mostrarToast((res && res.error) || 'Error al procesar.', 'error');
      return;
    }
    _admRectificaciones = _admRectificaciones.filter(function(r) { return r.id !== id; });
    if (row) {
      row.style.transition = 'opacity 0.25s ease';
      row.style.opacity = '0';
      setTimeout(function() {
        row.remove();
        var n = _admRectificaciones.length;
        var banner = document.getElementById('admin-banner-rectif' + scope);
        if (n === 0) { if (banner) banner.remove(); if (_admDashAbierto === 'admin-banner-rectif-body' + scope) _admDashAbierto = null; return; }
        var texto = document.getElementById('admin-banner-rectif-texto' + scope);
        if (texto) texto.textContent = n + ' rectificación' + (n !== 1 ? 'es' : '') + ' pendiente' + (n !== 1 ? 's' : '');
        var body = document.getElementById('admin-banner-rectif-body' + scope);
        if (body && body.style.maxHeight && body.style.maxHeight !== '0px') body.style.maxHeight = body.scrollHeight + 'px';
      }, 250);
    }
    mostrarToast(decision === 'Aprobada' ? 'Rectificación aprobada.' : 'Rectificación rechazada.');
  }, function(e) {
    botones.forEach(function(b) { b.disabled = false; });
    mostrarToast(e.message || 'Error al procesar.', 'error');
  });
}

function _adminRenderBannerQueLlevar(scope) {
  scope = scope || '';
  var slot = document.getElementById('admin-banner-equip-slot' + scope);
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
    '<div class="admin-dash-banner" id="admin-banner-equip' + scope + '">' +
      '<div class="admin-dash-banner-header" onclick="adminToggleBanner(\'admin-banner-equip-body' + scope + '\')">' +
        '<span class="material-symbols-outlined admin-dash-banner-icon">backpack</span>' +
        '<span class="admin-dash-banner-texto">' + texto + '</span>' +
        '<span class="material-symbols-outlined admin-dash-banner-chevron" id="admin-banner-equip-body' + scope + '-chevron">expand_more</span>' +
      '</div>' +
      '<div class="admin-dash-banner-body" id="admin-banner-equip-body' + scope + '">' +
        '<div class="admin-dash-banner-body-inner">' + filas + '</div>' +
      '</div>' +
    '</div>';
}

// ── Dashboard admin: burbujas embebidas de las 4 tiles + 2 pills ────────────────
// Corrección de diseño (ver MANIFEST.md "Cambios recientes" — reemplaza el
// "container transform" a pantalla completa de la Tanda 2 para Revisar
// reservas/Equipamiento/Qué llevar): las 4 tiles comparten AHORA el mismo
// mecanismo — el que ya tenía Notificación desde la Tanda 2 — de burbuja
// embebida anclada justo debajo de su fila del grid, sin importar cuán
// largo sea el contenido: nunca pantalla completa, nunca navegación, nunca
// modal. Un solo componente/función para las 4, no una variante por tile.
// `cargar` de cada tile es responsable de poblar su propio contenido
// (fetch + render, reusando las funciones ya existentes de cada una).
// Tanda 6 (ver MANIFEST.md "Cambios recientes" — corrección sobre la Tanda 5,
// que las había dejado siempre visibles sin acordeón): "Color" y "Precios de
// clases" se suman a esta misma tabla con sus propias claves
// ('admin-color'/'admin-precios') — mismo mecanismo exacto que las 4 tiles
// grandes (colapsadas por defecto, "solo una abierta a la vez" entre las 6 +
// los 2 banners), la única diferencia es visual (pills chicas en vez de
// tiles grandes, ver `.admin-dash-pill` en css/admin.css).
var ADMIN_TILE_INFO = {
  'notif': {
    bubbleId: 'admin-notif-bubble',
    cargar: function() {
      document.getElementById('adm-notif-destino').value = 'todos';
      document.getElementById('admin-destino-trigger-label').textContent = 'Todes (suscritxs)';
      adminApi({ action: 'adminGetUsuarios' }, function(res) {
        _admDestinatarios = (res || []).map(function(u) { return u.nombre; });
        var buscador = document.getElementById('admin-destino-search');
        _adminRenderDestinoLista(buscador ? buscador.value : '');
      }, function() {});
      document.getElementById('adm-notif-titulo').value = '';
      document.getElementById('adm-notif-msg').value = '';
      document.getElementById('adm-notif-fecha').value = '';
      var ahora = new Date();
      _adminConstruirRuedaTiempo('adm-notif-hora-wheel', 24, ahora.getHours(), function(v) { _admNotifHora = v; });
      _adminConstruirRuedaTiempo('adm-notif-min-wheel', 60, ahora.getMinutes(), function(v) { _admNotifMinuto = v; });
      document.getElementById('err-admin-notif').style.display = 'none';
    }
  },
  's-admin-reservas': {
    bubbleId: 'admin-burbuja-reservas',
    listaId: 'admin-reservas-lista',
    cargar: function() {
      adminApi({ action: 'adminGetReservas' }, function(res) {
        _admTodasReservas = (res || []).map(_normalizeReserva);
        adminRenderReservas();
      }, function(e) { mostrarToast(e.message || 'Error al cargar reservas.', 'error'); });
      _adminUpdateFiltroSlider(false);
    }
  },
  's-admin-equip': {
    bubbleId: 'admin-burbuja-equip',
    listaId: 'admin-equip-lista',
    cargar: function() {
      var pillsWrap = document.getElementById('admin-tallas-pills-wrap');
      if (pillsWrap) pillsWrap.style.display = 'none';
      adminApi({ action: 'adminGetEquipamiento' }, function(res) {
        adminRenderEquip(res);
      }, function(e) { mostrarToast(e.message || 'Error al cargar equipamiento.', 'error'); });
    }
  },
  's-admin-quellevar': {
    bubbleId: 'admin-burbuja-quellevar',
    listaId: 'admin-quellevar-lista',
    cargar: function() {
      adminApi({ action: 'adminGetQueLlevar' }, function(res) {
        adminRenderQueLlevar(res);
      }, function(e) { mostrarToast(e.message || 'Error al cargar equipamiento.', 'error'); });
    }
  },
  'admin-color': {
    bubbleId: 'admin-burbuja-color',
    // El color de énfasis ya se carga/aplica al entrar (adminEntrar() ->
    // adminRenderColorEnfasis()) -- acá solo se re-renderiza por si cambió
    // en otro lado de la misma sesión (ej. Mi Liga), mismo criterio "fresco
    // al abrir" que las demás tiles aunque acá no haya ningún fetch de por medio.
    cargar: function() { adminRenderColorEnfasis(); }
  },
  'admin-precios': {
    bubbleId: 'admin-burbuja-precios',
    cargar: function() { _adminCargarPrecios(); }
  },
  'admin-cupones': {
    bubbleId: 'admin-burbuja-cupones',
    listaId: 'admin-cupones-lista',
    cargar: function() {
      var s = document.getElementById('admin-cupones-search'); if (s) s.value = '';
      adminApi({ action: 'adminGetUsuarios' }, function(res) {
        _admUsuariosCupones = res || [];
        _adminRenderCupones('');
      }, function(e) { mostrarToast(e.message || 'Error al cargar usuarios.', 'error'); });
    }
  },
  'admin-excepciones': {
    bubbleId: 'admin-burbuja-excepciones',
    listaId: 'admin-excepciones-lista',
    cargar: function() { cargarExcepcionesPendientes(); }
  }
};

// Abre la burbuja de `tileKey` SIEMPRE (sin toggle) -- usada tanto por
// adminToggleBurbuja() (click directo en la tile) como por callers externos
// que quieren "asegurar abierta" sin cerrarla si ya lo estaba (adminIrReservas()).
function _adminAbrirBurbuja(tileKey, tileEl) {
  var info = ADMIN_TILE_INFO[tileKey];
  if (!info) return;
  _adminCerrarTodoAbierto();
  var tile = tileEl || document.querySelector('.admin-dash-tile[data-tile="' + tileKey + '"]');
  if (tile) tile.classList.add('admin-tile-activa');
  var bubble = document.getElementById(info.bubbleId);
  if (bubble) bubble.style.display = 'block';
  // Skeleton mientras cargan los datos reales (mismo criterio "Fase 2" ya
  // establecido en el resto de la app: mostrar de inmediato, swap al llegar
  // la respuesta) -- solo para las 3 tiles con lista propia, Notificación
  // no tiene ninguna lista que precargar.
  if (info.listaId) {
    var lista = document.getElementById(info.listaId);
    if (lista) lista.innerHTML = _skeletonQueLlevarHtml();
  }
  _admDashAbierto = tileKey;
  info.cargar();
}

// Click directo en una tile/pill: si ya estaba abierta, la cierra (toggle);
// si no, la abre. Es el único onclick de las 6 (4 tiles + 2 pills) de Mi Liga.
function adminToggleBurbuja(tileKey, tileEl) {
  if (_admDashAbierto === tileKey) { _adminCerrarTodoAbierto(); return; }
  _adminAbrirBurbuja(tileKey, tileEl);
}

// ── Color de énfasis ──────────────────────────────────────────────────────────
// Paleta de arranque, mismo criterio que el color picker de Pivot: unos
// pocos presets + personalizado libre via <input type="color">. Tanda 5 (ver
// MANIFEST.md "Cambios recientes"): 2 filas de 7 columnas -- 7 presets
// "de siempre" (fila 1, se sacó `#F59E0B` amber de la lista original de 8 por
// ser el tono más parecido a `#F97316` orange, el que menos variedad sumaba)
// + 6 presets nuevos (fila 2, hues elegidos para no repetir ningún tono de la
// fila 1: amarillo, lima, cian, índigo, fucsia y un neutro gris-azulado) + el
// eyedropper como 14º ítem (ver adminRenderColorEnfasis()).
var ADMIN_COLOR_PRESETS = [
  '#F97316', '#EF4444', '#EC4899', '#A855F7', '#3B82F6', '#14B8A6', '#22C55E',
  '#EAB308', '#84CC16', '#06B6D4', '#6366F1', '#D946EF', '#64748B'
];

// Un solo valor de color de énfasis, mostrado en sync donde sea que viva
// `.admin-color-swatches` -- se repinta por clase (no por `id` único) para
// no necesitar trackear "cuál instancia" cambió, todas terminan mostrando lo
// mismo. Antes (Tanda 3-6) vivía en 2 lugares a la vez ("Ajustes
// adicionales"/"Más" del dashboard viejo y "Personalización" de Mi Liga);
// desde la Tanda 7 (ver MANIFEST.md "Cambios recientes" — elimina
// s-admin-home) hay una sola instancia real, la burbuja "Color" de Mi Liga.
function adminRenderColorEnfasis() {
  var conts = document.querySelectorAll('.admin-color-swatches');
  if (!conts.length) return;
  var actual = (typeof _ceColorActual !== 'undefined' && _ceColorActual) ? _ceColorActual.toLowerCase() : '#f97316';
  var html = ADMIN_COLOR_PRESETS.map(function(hex) {
    var sel = hex.toLowerCase() === actual;
    return '<button type="button" class="admin-color-swatch' + (sel ? ' sel' : '') + '" style="background:' + hex + ';" onclick="adminCambiarColorEnfasis(\'' + hex + '\')" aria-label="' + hex + '"></button>';
  }).join('');
  // Eyedropper -- 14º ítem del grid de 7 columnas (cae solo al final de la
  // fila 2), reemplaza al botón "Personalizado" separado que había antes
  // (Tanda 4, ver MANIFEST.md "Cambios recientes"): mismo tamaño/forma que un
  // swatch (`.admin-color-swatch`), con el <input type="color"> real
  // invisible pero clickeable adentro (mismo truco que `.admin-color-custom-btn`,
  // eliminada).
  html += '<label class="admin-color-swatch admin-color-eyedropper" aria-label="Personalizado">' +
    '<span class="material-symbols-outlined">colorize</span>' +
    '<input type="color" class="admin-color-custom-input" onchange="adminCambiarColorEnfasis(this.value)">' +
    '</label>';
  conts.forEach(function(cont) { cont.innerHTML = html; });
  document.querySelectorAll('.admin-color-custom-input').forEach(function(custom) { custom.value = actual; });
}

function adminCambiarColorEnfasis(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  aplicarColorEnfasis(hex);
  adminRenderColorEnfasis();
  adminApi({ action: 'adminSetColorEnfasis', hex: hex }, function(res) {
    if (!res.exito) mostrarToast(res.error || 'No se pudo guardar el color.', 'error');
  }, function(e) { mostrarToast(e.message || 'No se pudo guardar el color.', 'error'); });
}

// Stepper +/- genérico (Tanda 4, ver MANIFEST.md "Cambios recientes") --
// reemplaza los inputs numéricos con spinner nativo (cantidad de talla,
// protecciones, precios). El wrapper `.qty-stepper` lleva un
// `<input type="hidden">` con el valor real (leído por el resto del código
// tal cual antes) y un `<span class="qty-value">` solo visual; `data-step`/
// `data-min`/`data-decimals` en el wrapper controlan el incremento.
function adminStepperChange(btn, delta) {
  var wrap = btn.parentElement;
  var hidden = wrap.querySelector('input[type="hidden"]');
  var span = wrap.querySelector('.qty-value');
  if (!hidden || !span) return;
  var step = parseFloat(wrap.dataset.step || '1');
  var min = parseFloat(wrap.dataset.min || '0');
  var decimals = wrap.dataset.decimals ? parseInt(wrap.dataset.decimals, 10) : 0;
  var val = Math.max(min, (parseFloat(hidden.value) || 0) + delta * step);
  val = parseFloat(val.toFixed(decimals));
  hidden.value = val;
  span.textContent = decimals ? val.toFixed(decimals) : String(val);
}

// Pone el valor inicial de un stepper (al cargar datos del servidor) tanto
// en el <input type="hidden"> como en su <span class="qty-value"> visual.
function _adminSetStepperValue(hiddenId, val, decimals) {
  var hidden = document.getElementById(hiddenId);
  if (!hidden) return;
  val = val || 0;
  hidden.value = val;
  var span = hidden.parentElement.querySelector('.qty-value');
  if (span) span.textContent = decimals ? val.toFixed(decimals) : String(val);
}

// Selector de moneda de "Precios de clases" -- puramente de visualización
// (USD por defecto): ambos selects (precio por clase / precio mensual) se
// mantienen sincronizados entre sí, no tiene sentido que difieran ya que es
// una sola lista de precios. No se persiste al backend -- adminGuardarPreciosAuto()
// sigue guardando el número tal cual, sin unidad.
function adminCambiarMoneda(val) {
  document.querySelectorAll('.admin-moneda-select').forEach(function(s) { s.value = val; });
}

// ── Precios de clases (Tanda 3, "Ajustes adicionales") ──────────────────────────
// getPreciosClases() ya existe y es pública (la usa cualquier persona al
// reservar, js/auth.js) -- se llama acá con la misma api() sin token admin,
// reusando también los mismos campos de E (precioPorClase/precioMensual,
// js/reservas.js) en vez de inventar variables admin-only paralelas.
function _adminCargarPrecios() {
  api({ action: 'getPreciosClases' }, function(precios) {
    E.precioPorClase = parseFloat(precios.precioPorClase) || 0;
    E.precioMensual = parseFloat(precios.precioMensual) || 0;
    _adminSetStepperValue('adm-precio-clase', E.precioPorClase, 2);
    _adminSetStepperValue('adm-precio-mensual', E.precioMensual, 2);
  }, function() {});
}

// Guardado automático (Tanda 5, ver MANIFEST.md "Cambios recientes") --
// reemplaza al botón "Guardar precios": cada tap de cualquiera de los 2
// steppers llama a esta función, debounceada 500ms (mismo criterio que
// adminGuardarEquipAuto()) para no disparar una request por cada click
// rápido consecutivo.
var _admPreciosGuardarTimer = null;
function adminGuardarPreciosAuto() {
  clearTimeout(_admPreciosGuardarTimer);
  _admPreciosGuardarTimer = setTimeout(function() {
    var pClase = parseFloat(document.getElementById('adm-precio-clase').value);
    var pMensual = parseFloat(document.getElementById('adm-precio-mensual').value);
    if (!(pClase > 0) || !(pMensual > 0)) return;
    adminApi({ action: 'adminSetPreciosClases', precioPorClase: pClase, precioMensual: pMensual }, function(res) {
      if (res.exito) { E.precioPorClase = pClase; E.precioMensual = pMensual; mostrarToast('Precios actualizados.', 'ok'); }
      else { mostrarToast(res.error || 'Error al guardar los precios.', 'error'); }
    }, function(e) { mostrarToast('Error: ' + e.message, 'error'); });
  }, 500);
}

function adminCerrarSesionLocal(silencioso) {
  if (!silencioso && !confirm('¿Cerrar sesión de administradorx?')) return;
  if (_adminToken) api({ action: 'adminCerrarSesion', adminToken: _adminToken }, function(){}, function(){});
  _adminToken = ''; _adminEmail = ''; _dashboardAdminLimitado = false;
  localStorage.removeItem('adminSession');
  if (!silencioso) ir('s1');
}

// ── Reservas ──────────────────────────────────────────────────────────────────
// origenEl: la tile que disparó la apertura (pasada como `this` desde
// index.html); si no llega (ej. el link "Ver todas las reservas ↗" del
// banner de pendientes, dentro del mismo "Mi Liga"), _adminAbrirBurbuja() la
// busca sola por data-tile="s-admin-reservas". A diferencia del click
// directo en la tile (adminToggleBurbuja(), que cierra si ya estaba
// abierta), esta función SIEMPRE asegura que la burbuja quede abierta -- la
// usa "Ver todas ↗", donde cerrar no tendría sentido. Tanda 7 (ver
// MANIFEST.md "Cambios recientes"): eliminada adminIrReservasDesdeMiLiga()
// -- existía solo para cerrar Mi Liga y navegar al dashboard viejo
// (s-admin-home) antes de poder abrir esta burbuja; con Reservas viviendo ya
// DENTRO de Mi Liga, "Ver todas ↗" llama a esta función directo, sin navegar
// a ningún lado.
function adminIrReservas(origenEl) {
  if (_admDashAbierto === 's-admin-reservas') return;
  _adminAbrirBurbuja('s-admin-reservas', origenEl);
}

// Botón "Actualizar" DENTRO de la burbuja de Reservas ya abierta -- solo
// refresca los datos en el lugar.
function adminRefreshReservas() {
  adminApi({ action: 'adminGetReservas' }, function(res) {
    _admTodasReservas = (res || []).map(_normalizeReserva);
    adminRenderReservas();
  }, function(e) { mostrarToast(e.message || 'Error al cargar reservas.', 'error'); });
}

// Filtro Pendientes/Todas -- segmented control (.tp-seg, mismo componente ya
// usado para "tipo de pago" en s4/js/reservas.js, ver MANIFEST.md "Cambios
// recientes" — reemplaza las pills .opcion, que no tenían la forma de pill
// del resto de la app) en vez de las .opcion/.sel de antes.
function adminFiltroReservas(filtro) {
  _admFiltro = filtro;
  document.getElementById('admin-filtro-pendientes').classList.toggle('active', filtro === 'pendientes');
  document.getElementById('admin-filtro-todas').classList.toggle('active', filtro === 'todas');
  _adminUpdateFiltroSlider(true);
  adminRenderReservas();
}

// Reposiciona el slider del segmented control -- mismo cálculo que
// _updateTpSlider() (js/reservas.js), pero sobre los ids propios de este
// filtro (offsetWidth/offsetLeft solo dan un valor real una vez que la
// burbuja ya es visible, por eso _adminAbrirBurbuja() la llama recién
// después de mostrar #admin-burbuja-reservas, sin animar el primer
// posicionamiento).
function _adminUpdateFiltroSlider(animate) {
  var slider = document.getElementById('admin-filtro-slider');
  var activo = document.getElementById(_admFiltro === 'pendientes' ? 'admin-filtro-pendientes' : 'admin-filtro-todas');
  if (!slider || !activo) return;
  slider.classList.toggle('animado', !!animate);
  slider.style.width = activo.offsetWidth + 'px';
  slider.style.transform = 'translateX(' + activo.offsetLeft + 'px)';
}

// Acordeón inline de mes (Reservas > filtro "Todas") — reemplaza el
// <select> nativo, roto en mobile, por pills (Tanda 4, ver MANIFEST.md
// "Cambios recientes"). #filtro-mes-reservas pasa de <select> a
// <input type="hidden">, mismo id/semántica de `.value`/`._inicializado`
// que ya leía/escribía adminRenderReservas() — sin tocar esa lectura.
// NOMBRES_MESES es global (js/ui.js, carga antes que este archivo).
function adminToggleMesAcordeon() {
  var body = document.getElementById('admin-mes-acordeon-body');
  var chevron = document.getElementById('admin-mes-chevron');
  var abrir = !body.classList.contains('abierto');
  if (abrir) {
    _adminRenderMesPills();
    body.classList.add('abierto');
    chevron.style.transform = 'rotate(180deg)';
  } else {
    body.classList.remove('abierto');
    chevron.style.transform = '';
  }
}

function _adminRenderMesPills() {
  var hidden = document.getElementById('filtro-mes-reservas');
  var actual = parseInt(hidden.value, 10);
  document.getElementById('admin-mes-pills').innerHTML = NOMBRES_MESES.map(function(nombre, idx) {
    return '<div class="mes-item' + (idx === actual ? ' mes-item-sel' : '') + '" onclick="adminSeleccionarMes(' + idx + ')"><span class="mes-nombre">' + nombre + '</span></div>';
  }).join('');
}

function adminSeleccionarMes(idx) {
  var hidden = document.getElementById('filtro-mes-reservas');
  hidden.value = String(idx);
  hidden._inicializado = true;
  document.getElementById('admin-mes-trigger-label').textContent = NOMBRES_MESES[idx];
  adminToggleMesAcordeon();
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
    document.getElementById('admin-mes-trigger-label').textContent = NOMBRES_MESES[mesSeleccionado];
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
    var mesBody = document.getElementById('admin-mes-acordeon-body');
    if (mesBody) mesBody.classList.remove('abierto');
    var mesChevron = document.getElementById('admin-mes-chevron');
    if (mesChevron) mesChevron.style.transform = '';
  }

  var grupos = {}, orden = [];
  lista.forEach(function(r) {
    if (!grupos[r.fecha]) { grupos[r.fecha] = []; orden.push(r.fecha); }
    grupos[r.fecha].push(r);
  });

  var html = '';
  if (lista.length === 0) {
    html = '<p style="text-align:center;color:var(--muted);padding:20px 0;">' + (_admFiltro === 'pendientes' ? 'No hay reservas pendientes.' : 'No hay reservas.') + '</p>';
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
        // Mismo componente que ya usa js/home.js para patines/protecciones
        // (.fi-pill/.fi-pill-patines, ver MANIFEST.md "Cambios recientes")
        // en vez de emojis sueltos en texto plano.
        var equip = [];
        if (r.talla && r.talla.toLowerCase() !== 'no') equip.push('<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">roller_skating</span>' + r.talla + '</span>');
        if (r.protecciones && r.protecciones.toLowerCase() !== 'no') equip.push('<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">shield</span>' + r.protecciones + '</span>');
        var detalleEquip = equip.length ? equip.join(' ') : '<span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:-2px;">check_circle</span> Equipo propio';
        var detalleMonto = r.monto ? ' · <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:-2px;">payments</span> ' + r.monto : '';
        html += '<div class="reserva-card" style="margin-bottom:8px;">' +
          '<div class="reserva-header"><span class="reserva-fecha">' + r.nombre + '</span><span class="badge ' + badgeClass + '">' + r.estado + '</span></div>' +
          '<div class="reserva-detalle">' + detalleEquip + detalleMonto + '</div>';
        if (r.estado === 'Pendiente') {
          html += '<div style="display:flex;gap:8px;margin-top:10px;">' +
            '<button class="btn btn-primary" style="padding:11px;font-size:0.82rem;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="adminCambiarEstado(\'' + r.fila + '\',\'Confirmada\',this)"><span class="material-symbols-outlined" style="font-size:1rem;">check</span> Aprobar</button>' +
            '<button class="btn-cancelar" style="margin-top:0;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="adminCambiarEstado(\'' + r.fila + '\',\'Cancelada\',this)"><span class="material-symbols-outlined" style="font-size:1rem;">close</span> Cancelar</button>' +
            '</div>';
        } else if (r.estado === 'Confirmada') {
          html += '<button class="btn-cancelar" style="display:flex;align-items:center;justify-content:center;gap:6px;" onclick="adminCambiarEstado(\'' + r.fila + '\',\'Cancelada\',this)"><span class="material-symbols-outlined" style="font-size:1rem;">close</span> Cancelar esta reserva</button>';
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
  adminApi({ action: 'adminSetEstadoReserva', id: fila, estado: estado }, function(res) {
    if (res.exito) {
      _admTodasReservas.forEach(function(r) { if (r.id === fila) r.estado = estado; });
      adminRenderReservas();
    } else { btn.disabled = false; mostrarToast(res.error || 'Error al actualizar.', 'error'); }
  }, function(e) { btn.disabled = false; mostrarToast(e.message || 'Error al actualizar.', 'error'); });
}

// ── Excepciones de pago (ausencias justificadas / dificultad económica) ──
// Mismo patrón que Reservas (arriba): fetch -> array en memoria -> render:
// actualización optimista en aprobar/rechazar (sin re-fetch), mismo criterio
// que adminCambiarEstado(). A diferencia de Reservas, acá no hay tab "Todas"
// -- una vez aprobada/rechazada, la solicitud simplemente se saca de la
// lista en memoria (ya no es "pendiente", que es lo único que se muestra).
var _admExcepciones = [];

// Sin escape reusable en el proyecto (ver grep antes de escribir esto) --
// necesario acá porque `datos`/`nombre` vienen de texto libre escrito por
// cualquier socix (motivo/justificación económica), y esto se renderiza en
// la sesión del ADMIN vía innerHTML -- sin escapar, una persona podría
// inyectar HTML/JS que se ejecute con privilegios de admin al abrir esta
// burbuja (XSS almacenado real, no cosmético).
function _admEscHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cargarExcepcionesPendientes() {
  adminApi({ action: 'adminGetExcepciones' }, function(res) {
    _admExcepciones = res || [];
    adminRenderExcepciones();
  }, function() { _admExcepciones = []; adminRenderExcepciones(); });
}

function _admExcepcionResumenHtml(e) {
  var d = e.datos || {};
  if (e.tipo === 'ausencias') return _admEscHtml(d.motivo || '');
  return 'Nivel ' + _admEscHtml((d.nivelIngreso || '').toUpperCase()) + ' · ' + _admEscHtml(d.situacionEconomica || '');
}

function adminRenderExcepciones() {
  var cont = document.getElementById('admin-excepciones-lista');
  if (!cont) return;
  if (!_admExcepciones || _admExcepciones.length === 0) {
    cont.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px 0;">No hay solicitudes pendientes.</p>';
    return;
  }
  var html = '';
  _admExcepciones.forEach(function(e) {
    var tipoLabel = e.tipo === 'ausencias' ? 'Ausencias justificadas' : 'Dificultad económica';
    html += '<div class="reserva-card">' +
      '<div class="reserva-header"><span class="reserva-fecha">' + _admEscHtml(e.nombre) + '</span><span class="badge badge-pendiente">' + tipoLabel + '</span></div>' +
      '<div class="reserva-detalle">' + _admEscHtml(e.mesAplicacion) + ' · ' + _admExcepcionResumenHtml(e) + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;">' +
        '<button class="btn btn-primary" style="padding:11px;font-size:0.82rem;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="adminCambiarEstadoExcepcion(\'' + e.id + '\',\'aprobada\',this)"><span class="material-symbols-outlined" style="font-size:1rem;">check</span> Aprobar</button>' +
        '<button class="btn-cancelar" style="margin-top:0;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="adminCambiarEstadoExcepcion(\'' + e.id + '\',\'rechazada\',this)"><span class="material-symbols-outlined" style="font-size:1rem;">close</span> Rechazar</button>' +
      '</div>' +
    '</div>';
  });
  cont.innerHTML = html;
}

function adminCambiarEstadoExcepcion(id, estado, btn) {
  var accionTexto = estado === 'aprobada' ? 'aprobar' : 'rechazar';
  if (!confirm('¿Deseas ' + accionTexto + ' esta solicitud?')) return;
  btn.disabled = true;
  adminApi({ action: 'adminSetEstadoExcepcion', id: id, estado: estado }, function(res) {
    if (res.exito) {
      _admExcepciones = _admExcepciones.filter(function(e) { return e.id !== id; });
      adminRenderExcepciones();
    } else { btn.disabled = false; mostrarToast(res.error || 'Error al actualizar.', 'error'); }
  }, function(e) { btn.disabled = false; mostrarToast(e.message || 'Error al actualizar.', 'error'); });
}

// ── Notificaciones ────────────────────────────────────────────────────────────
// ADMIN_TILE_INFO['notif'].cargar (más arriba) tiene el reset de campos que
// antes vivía en adminAbrirNotifBubble(), junto al resto de la mecánica de
// banners/burbuja del dashboard.
var _BTN_ADM_NOTIF_HTML = '<span class="material-symbols-outlined" style="font-size:1.1rem;vertical-align:middle;">send</span> Enviar notificación';
function adminEnviarNotif() {
  var titulo = document.getElementById('adm-notif-titulo').value.trim();
  var msg = document.getElementById('adm-notif-msg').value.trim();
  var destino = document.getElementById('adm-notif-destino').value;
  var fechaVal = document.getElementById('adm-notif-fecha').value;
  if (!titulo || !msg) { err('err-admin-notif', 'Completa el título y el mensaje.'); return; }
  var sendAfter = '';
  if (fechaVal) {
    // La fecha viene de un <input type="date"> nativo, la hora de la rueda
    // de scroll de abajo (Tanda 4, ver MANIFEST.md "Cambios recientes") --
    // antes ambas venían juntas de un único <input type="datetime-local">.
    var hh = String(_admNotifHora != null ? _admNotifHora : 0).padStart(2, '0');
    var mm = String(_admNotifMinuto != null ? _admNotifMinuto : 0).padStart(2, '0');
    var f = new Date(fechaVal + 'T' + hh + ':' + mm + ':00');
    if (isNaN(f.getTime()) || f.getTime() < Date.now() + 60000) { err('err-admin-notif', 'La fecha programada debe ser al menos 1 minuto en el futuro.'); return; }
    sendAfter = f.toISOString();
  }
  var btn = document.getElementById('btn-adm-notif');
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Enviando...';
  adminApi({ action: 'adminEnviarPush', titulo: titulo, mensaje: msg, destino: destino, sendAfter: sendAfter }, function(res) {
    btn.disabled = false; btn.innerHTML = _BTN_ADM_NOTIF_HTML;
    if (res.exito) {
      mostrarToast(sendAfter ? 'Notificación programada.' : 'Notificación enviada.', 'ok');
      document.getElementById('adm-notif-titulo').value = ''; document.getElementById('adm-notif-msg').value = ''; document.getElementById('adm-notif-fecha').value = '';
    } else { err('err-admin-notif', res.error || 'Error al enviar.'); }
  }, function(e) { btn.disabled = false; btn.innerHTML = _BTN_ADM_NOTIF_HTML; err('err-admin-notif', 'Error: ' + e.message); });
}

// Selector de hora tipo rueda/scroll (Tanda 4, ver MANIFEST.md "Cambios
// recientes") — 2 columnas (horas 0-23, minutos 0-59), scroll-snap-type:y
// mandatory hace que el navegador "trabe" el scroll en cada ítem; el ítem
// que queda centrado (según scrollTop) es el seleccionado. onChange(valor)
// se llama tanto al construir (valor inicial) como en cada cambio real.
function _adminConstruirRuedaTiempo(wheelId, max, valorInicial, onChange) {
  var wheel = document.getElementById(wheelId);
  if (!wheel) return;
  var ITEM_H = 40;
  var pad = Math.max(0, (wheel.clientHeight - ITEM_H) / 2);
  var html = '<div style="height:' + pad + 'px;"></div>';
  for (var i = 0; i < max; i++) {
    html += '<div class="time-wheel-item" data-val="' + i + '">' + String(i).padStart(2, '0') + '</div>';
  }
  html += '<div style="height:' + pad + 'px;"></div>';
  wheel.innerHTML = html;
  var timer = null;
  wheel.onscroll = function() {
    clearTimeout(timer);
    timer = setTimeout(function() { _adminSeleccionarRuedaPorScroll(wheel, onChange); }, 130);
  };
  Array.prototype.forEach.call(wheel.querySelectorAll('.time-wheel-item'), function(item) {
    item.onclick = function() { wheel.scrollTo({ top: parseInt(item.dataset.val, 10) * ITEM_H, behavior: 'smooth' }); };
  });
  wheel.scrollTop = valorInicial * ITEM_H;
  _adminMarcarRuedaSeleccion(wheel, valorInicial);
  onChange(valorInicial);
}

function _adminSeleccionarRuedaPorScroll(wheel, onChange) {
  var ITEM_H = 40;
  var items = wheel.querySelectorAll('.time-wheel-item');
  var idx = Math.max(0, Math.min(items.length - 1, Math.round(wheel.scrollTop / ITEM_H)));
  if (wheel.scrollTop !== idx * ITEM_H) wheel.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  _adminMarcarRuedaSeleccion(wheel, idx);
  onChange(idx);
}

function _adminMarcarRuedaSeleccion(wheel, idx) {
  Array.prototype.forEach.call(wheel.querySelectorAll('.time-wheel-item'), function(item) {
    item.classList.toggle('time-wheel-sel', parseInt(item.dataset.val, 10) === idx);
  });
}

// "Destinatarix" — bottom sheet con buscador (Tanda 4, ver MANIFEST.md
// "Cambios recientes"): reemplaza al <select> nativo, roto en mobile, con el
// MISMO componente ya construido para "Agregar administradorx"
// (adminAbrirSheetAgregarAdmin() más abajo) — buscador + lista, filtro local
// por texto sobre una lista ya cargada. `#adm-notif-destino` sigue siendo el
// valor leído por adminEnviarNotif() (ahora un <input type="hidden">).
function adminAbrirSheetDestino() {
  var s = document.getElementById('admin-destino-search'); if (s) s.value = '';
  var ov = document.getElementById('admin-sheet-destino-overlay');
  var sh = document.getElementById('admin-sheet-destino');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(adminCerrarSheetDestino);
  _adminRenderDestinoLista('');
}

function adminCerrarSheetDestino(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('admin-sheet-destino');
  var ov = document.getElementById('admin-sheet-destino-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function _adminFiltrarDestino(q) { _adminRenderDestinoLista(q); }

function _adminRenderDestinoLista(busqueda) {
  var q = (busqueda || '').toLowerCase().trim();
  var todos = [{ nombre: 'Todes (suscritxs)', valor: 'todos' }].concat(_admDestinatarios.map(function(n) { return { nombre: n, valor: n }; }));
  var lista = q ? todos.filter(function(u) { return u.nombre.toLowerCase().indexOf(q) !== -1; }) : todos;
  var list = document.getElementById('admin-destino-lista');
  if (!list) return;
  if (!lista.length) { list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.82rem;">Sin resultados</div>'; return; }
  list.innerHTML = lista.map(function(u) {
    return '<div style="display:flex;align-items:center;padding:13px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;font-size:0.85rem;font-weight:700;" onclick="adminElegirDestino(\'' + u.valor.replace(/'/g, "\\'") + '\',\'' + u.nombre.replace(/'/g, "\\'") + '\')">' + u.nombre + '</div>';
  }).join('');
}

function adminElegirDestino(valor, nombre) {
  document.getElementById('adm-notif-destino').value = valor;
  document.getElementById('admin-destino-trigger-label').textContent = nombre;
  adminCerrarSheetDestino();
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

// Fila HTML de una persona (nombre + pronombres + WhatsApp + equipamiento) —
// extraída para reusarse tal cual tanto en adminRenderQueLlevar() (burbuja
// completa) como en _adminRenderBannerQueLlevar() (banner embebido del
// dashboard, ver MANIFEST.md "Cambios recientes").
function _adminQueLlevarFilaHtml(q) {
  // Mismo componente .fi-pill/.fi-pill-patines que adminRenderReservas()
  // (ver esa entrada en "Cambios recientes") en vez de emojis sueltos.
  var equip = []; if (q.patines && q.patines.toLowerCase() !== 'no') equip.push('<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">roller_skating</span>Patines ' + q.patines + '</span>');
  if (q.protecciones && q.protecciones.toLowerCase() !== 'no') {
    var protecTexto = q.protecciones.toLowerCase() === 'sí' || q.protecciones.toLowerCase() === 'si' ? 'Protecciones completas' : q.protecciones;
    equip.push('<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">shield</span>' + protecTexto + '</span>');
  }
  var pronBadge = q.pronombres ? '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:20px;background:var(--dk-badge-bg);color:var(--dk-badge-text);font-size:0.68rem;font-weight:600;vertical-align:middle;">' + q.pronombres + '</span>' : '';
  if (!q.waLink && q.telefono) {
    var prefijoMatch = (q.prefijo || '').match(/\+(\d+)/);
    var codigoPais = prefijoMatch ? prefijoMatch[1] : '593';
    q.waLink = 'https://wa.me/' + codigoPais + q.telefono.replace(/\D/g,'').replace(/^0+/,'');
  }
  var waBtnQL = q.waLink ? '<a href="' + q.waLink + '" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--wa-brand);flex-shrink:0;text-decoration:none;margin-left:8px;vertical-align:middle;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.845L.057 23.571a.75.75 0 0 0 .92.921l5.763-1.473A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.374l-.36-.214-3.713.949.981-3.625-.235-.374A9.818 9.818 0 1 1 12 21.818z"/></svg></a>' : '';
  return '<div class="reserva-card" style="margin-bottom:8px;"><div style="display:flex;align-items:center;justify-content:space-between;"><div style="font-weight:800;">' + q.nombre + pronBadge + '</div>' + waBtnQL + '</div><div class="reserva-detalle" style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;">' + (equip.join('') || '—') + '</div></div>';
}

function adminRenderQueLlevar(res) {
  var html = '';
  if (!res || res.length === 0) {
    html = '<p style="text-align:center;color:var(--muted);padding:20px 0;">No hay equipamiento asignado por ahora.</p>';
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
// La tile "Equipamiento" llama adminToggleBurbuja('s-admin-equip', this)
// directo (ver ADMIN_TILE_INFO más arriba) -- ya no hace falta una función
// adminIrEquip() propia.
function adminRenderEquip(res) {
  var html = (res.tallas || []).map(function(t) { return adminFilaTallaHtml(t.talla, t.cantidad); }).join('');
  var listaEl = document.getElementById('admin-equip-lista');
  listaEl.innerHTML = html;
  void listaEl.offsetWidth; listaEl.style.animation = 'fadeIn 0.3s ease';
  _adminSetStepperValue('adm-equip-protec', res.protecciones || 0);
}

// Talla: ya no es texto libre -- viene de una pill de TALLAS_EU_US
// (adminSeleccionarTallaPill()), guardada en el <input type="hidden"
// class="adm-talla">. Cantidad: stepper +/- genérico (adminStepperChange()),
// mismo <input type="hidden" class="adm-cant"> de siempre por debajo. Tanda 5:
// tanto el stepper como "quitar" disparan adminGuardarEquipAuto() (guardado
// automático debounced, ver más abajo) -- ya no hay botón "Guardar cambios".
function adminFilaTallaHtml(talla, cantidad) {
  cantidad = cantidad != null ? cantidad : 1;
  return '<div class="adm-fila-talla">' +
    '<span class="adm-talla-label">' + talla + '</span>' +
    '<input type="hidden" class="adm-talla" value="' + talla + '">' +
    '<div class="qty-stepper" data-step="1" data-min="0">' +
      '<button type="button" class="qty-btn" onclick="adminStepperChange(this,-1);adminGuardarEquipAuto();">−</button>' +
      '<span class="qty-value">' + cantidad + '</span>' +
      '<button type="button" class="qty-btn" onclick="adminStepperChange(this,1);adminGuardarEquipAuto();">+</button>' +
      '<input type="hidden" class="adm-cant" value="' + cantidad + '">' +
    '</div>' +
    '<button type="button" class="adm-talla-quitar" onclick="this.closest(\'.adm-fila-talla\').remove(); _adminRenderTallasPills(); adminGuardarEquipAuto();">✕</button>' +
    '</div>';
}

// "Agregar talla" -- en vez de un campo de texto libre, muestra pills con
// las tallas estándar (TALLAS_EU_US) que todavía no estén en la lista (ver
// MANIFEST.md "Cambios recientes").
function adminToggleTallasPanel() {
  var wrap = document.getElementById('admin-tallas-pills-wrap');
  var abrir = wrap.style.display === 'none';
  wrap.style.display = abrir ? 'block' : 'none';
  if (abrir) _adminRenderTallasPills();
}

function _adminRenderTallasPills() {
  var yaAgregadas = Array.prototype.map.call(document.querySelectorAll('#admin-equip-lista .adm-talla'), function(i) { return i.value; });
  var disponibles = TALLAS_EU_US.filter(function(t) { return yaAgregadas.indexOf(String(t.eu)) === -1; });
  var cont = document.getElementById('admin-tallas-pills');
  if (!cont) return;
  cont.innerHTML = disponibles.length
    ? disponibles.map(function(t) { return '<span class="aj-pill" onclick="adminSeleccionarTallaPill(' + t.eu + ')">' + t.eu + ' EU · ' + t.us + ' US</span>'; }).join('')
    : '<span style="font-size:0.8rem;color:var(--muted);">Ya agregaste todas las tallas.</span>';
}

function adminSeleccionarTallaPill(eu) {
  document.getElementById('admin-equip-lista').insertAdjacentHTML('beforeend', adminFilaTallaHtml(String(eu), 1));
  _adminRenderTallasPills();
  adminGuardarEquipAuto();
}

// Guardado automático (Tanda 5, ver MANIFEST.md "Cambios recientes") --
// reemplaza al botón "Guardar cambios": cada tap de stepper (cantidad/
// protecciones) o pill (agregar/quitar talla) llama a esta función, que
// debouncea 500ms para no disparar una request por cada click rápido
// consecutivo (varios taps seguidos → 1 sola request con el estado final).
var _admEquipGuardarTimer = null;
function adminGuardarEquipAuto() {
  clearTimeout(_admEquipGuardarTimer);
  _admEquipGuardarTimer = setTimeout(function() {
    var tallas = [];
    document.querySelectorAll('#admin-equip-lista .adm-fila-talla').forEach(function(f) {
      var t = f.querySelector('.adm-talla').value.trim();
      var c = parseInt(f.querySelector('.adm-cant').value, 10) || 0;
      if (t) tallas.push({ talla: t, cantidad: c });
    });
    var protec = parseInt(document.getElementById('adm-equip-protec').value, 10) || 0;
    adminApi({ action: 'adminGuardarEquipamiento', tallas: JSON.stringify(tallas), protecciones: protec }, function(res) {
      if (!res.exito) mostrarToast(res.error || 'Error al guardar equipamiento.', 'error');
    }, function(e) { mostrarToast('Error: ' + e.message, 'error'); });
  }, 500);
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

// ── Administradorxs (Tanda 3, embebido en Mi Liga — ver MANIFEST.md
// "Cambios recientes") ───────────────────────────────────────────────────────
// Reemplaza a la vieja adminIrAdmins()/pantalla s-admin-admins (eliminada,
// mismo criterio que s-admin-notif en la Tanda 2: Mi Liga muestra "todo de
// entrada, sin subsecciones", así que la lista vive embebida en
// #miliga-admins-lista en vez de navegar a una pantalla aparte).
function _adminCargarAdmins() {
  var lista = document.getElementById('miliga-admins-lista');
  if (lista) lista.innerHTML = _skeletonQueLlevarHtml();
  adminApi({ action: 'adminGetAdmins' }, function(res) {
    adminRenderAdmins(res);
  }, function(e) { mostrarToast(e.message || 'Error al cargar administradores.', 'error'); });
}

function adminRenderAdmins(res) {
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
  var lista = document.getElementById('miliga-admins-lista');
  if (!lista) return;
  lista.innerHTML = html || '<p style="text-align:center;color:var(--muted);padding:10px 0;">Sin administradorxs.</p>';
  void lista.offsetWidth; lista.style.animation = 'fadeIn 0.3s ease';
}

function adminQuitarClick(email) {
  if (!confirm('¿Quitar acceso admin a ' + email + '?')) return;
  adminApi({ action: 'adminQuitarAdmin', email: email, solicitante: _adminEmail }, function(res) {
    if (res.exito) { _adminCargarAdmins(); } else { mostrarToast(res.error || 'Error.', 'error'); }
  }, function(e) { mostrarToast(e.message || 'Error.', 'error'); });
}

// ── Cupones (Mi Liga) — restaurar/quitar el cupón de clase gratis de una
// persona (equipo.cupon_disponible). Lista ya cargada + filtro local por
// nombre (mismo patrón que _adminRenderCandidatosAdmin/_adminFiltrarDestino).
var _admUsuariosCupones = [];

function adminFiltrarCupones(q) { _adminRenderCupones(q); }

function _adminRenderCupones(q) {
  var query = (q || '').toLowerCase().trim();
  var lista = query
    ? _admUsuariosCupones.filter(function(u) { return (u.nombre || '').toLowerCase().indexOf(query) !== -1; })
    : _admUsuariosCupones;
  var html = lista.map(function(u) {
    var disponible = !!u.cuponDisponible;
    var nombreEsc = (u.nombre || '').replace(/'/g, "\\'");
    return '<div class="reserva-card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
      '<div><div style="font-weight:700;font-size:0.9rem;">' + u.nombre + '</div>' +
      '<span class="badge ' + (disponible ? 'badge-confirmada' : 'badge-cancelada') + '" style="margin-top:4px;">' + (disponible ? 'Cupón disponible' : 'Cupón usado') + '</span></div>' +
      '<button onclick="adminToggleCuponClick(\'' + nombreEsc + '\',' + disponible + ')" style="border:2px solid ' + (disponible ? 'var(--error-light-border)' : 'var(--success-border-dark)') + ';background:' + (disponible ? 'var(--error-lightest)' : 'var(--success-lightest)') + ';color:' + (disponible ? 'var(--error)' : 'var(--success-dark)') + ';border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:800;font-size:0.8rem;flex-shrink:0;">' + (disponible ? 'Quitar' : 'Restaurar') + '</button>' +
      '</div>';
  }).join('');
  var el = document.getElementById('admin-cupones-lista');
  if (!el) return;
  el.innerHTML = html || '<p style="text-align:center;color:var(--muted);padding:10px 0;">Sin resultados.</p>';
  void el.offsetWidth; el.style.animation = 'fadeIn 0.3s ease';
}

function adminToggleCuponClick(nombre, disponibleActual) {
  var nuevoEstado = !disponibleActual;
  var msg = nuevoEstado
    ? '¿Restaurar el cupón de clase gratis de ' + nombre + '?'
    : '¿Quitar el cupón de clase gratis de ' + nombre + '?';
  if (!confirm(msg)) return;
  adminApi({ action: 'adminToggleCupon', nombre: nombre, cuponDisponible: nuevoEstado }, function(res) {
    if (!res.exito) { mostrarToast(res.error || 'Error al actualizar el cupón.', 'error'); return; }
    var u = _admUsuariosCupones.find(function(x) { return x.nombre === nombre; });
    if (u) u.cuponDisponible = nuevoEstado;
    var s = document.getElementById('admin-cupones-search');
    _adminRenderCupones(s ? s.value : '');
    mostrarToast(nuevoEstado ? 'Cupón restaurado.' : 'Cupón quitado.', 'ok');
  }, function(e) { mostrarToast(e.message || 'Error al actualizar el cupón.', 'error'); });
}

// "Agregar administradorx" — bottom sheet con buscador (mismo patrón que
// ajAbrirSheetPais()/_ajRenderPaises(), js/perfil.js: lista ya cargada,
// filtro local por texto). La lista viene de adminGetCandidatosAdmin(), que
// ya filtra del lado del backend (excluye admins existentes y personas con
// equipo prestado) — no se duplica ese filtro acá, solo el de texto libre.
var _admCandidatosAdmin = [];

function adminAbrirSheetAgregarAdmin() {
  var s = document.getElementById('admin-agregar-search'); if (s) s.value = '';
  var listaInicial = document.getElementById('admin-agregar-lista');
  if (listaInicial) listaInicial.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.82rem;">Cargando...</div>';
  var ov = document.getElementById('admin-sheet-agregar-overlay');
  var sh = document.getElementById('admin-sheet-agregar');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(adminCerrarSheetAgregarAdmin);
  adminApi({ action: 'adminGetCandidatosAdmin' }, function(res) {
    _admCandidatosAdmin = res || [];
    _adminRenderCandidatosAdmin('');
  }, function(e) {
    var lista = document.getElementById('admin-agregar-lista');
    if (lista) lista.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.82rem;">Error al cargar.</div>';
  });
}

function adminCerrarSheetAgregarAdmin(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('admin-sheet-agregar');
  var ov = document.getElementById('admin-sheet-agregar-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function _adminFiltrarCandidatosAdmin(q) { _adminRenderCandidatosAdmin(q); }

function _adminRenderCandidatosAdmin(busqueda) {
  var q = (busqueda || '').toLowerCase().trim();
  var lista = q ? _admCandidatosAdmin.filter(function(u) { return (u.nombre || '').toLowerCase().indexOf(q) !== -1 || (u.email || '').toLowerCase().indexOf(q) !== -1; }) : _admCandidatosAdmin;
  var list = document.getElementById('admin-agregar-lista');
  if (!list) return;
  if (!lista.length) { list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.82rem;">Sin resultados</div>'; return; }
  list.innerHTML = lista.map(function(u) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;font-size:0.85rem;" onclick="adminElegirCandidatoAdmin(\'' + (u.email || '').replace(/'/g, "\\'") + '\')">' +
      '<div><div style="font-weight:700;">' + u.nombre + '</div><div style="font-size:0.75rem;color:var(--muted);">' + (u.email || '') + '</div></div>' +
      '</div>';
  }).join('');
  void list.offsetWidth; list.style.animation = 'fadeIn 0.09s ease';
}

function adminElegirCandidatoAdmin(email) {
  if (!email) return;
  adminApi({ action: 'adminAgregarAdmin', email: email, invitadoPor: _adminEmail }, function(res) {
    if (res.exito) { adminCerrarSheetAgregarAdmin(); setTimeout(function() { _adminCargarAdmins(); }, 360); }
    else { mostrarToast(res.error || 'Error al agregar.', 'error'); }
  }, function(e) { mostrarToast(e.message || 'Error al agregar.', 'error'); });
}

// Mi Liga: banners (scope='-ml') + Administradorxs + color de énfasis +
// precios de clases — "todo de entrada, sin subsecciones" (Tanda 3). Tanda 7
// (ver MANIFEST.md "Cambios recientes" — elimina s-admin-home): además de
// Administradorxs/Personalización, "Mi Liga" pasa a tener también las 4
// tiles operativas (Qué llevar/Reservas/Equipamiento/Notificación, mismo
// `ADMIN_TILE_INFO`/lazy-load-on-open de siempre, no precargadas acá) y la
// pill "Precios de clases" (nueva en Mi Liga, `_adminCargarPrecios()` suma a
// la lista de lo que se precarga fresco al abrir).
function _adminCargarMiLiga() {
  _adminCargarRectificaciones('-ml');
  _adminCargarBanners('-ml');
  cargarExcepcionesPendientes();
  _adminCargarAdmins();
  adminRenderColorEnfasis();
  _adminCargarPrecios();
}
