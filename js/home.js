var _todasReservas = [];
var _proximosData = {};
var _MESES_MAP = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
var _MESES_DISPLAY = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var _homeExpandido = false;

function prepararHome(saltarFadeInicial) {
  var saludoEl = document.getElementById('home-saludo');
  if (saludoEl) saludoEl.textContent = E.nombre + '!';
  var avatarEl = document.getElementById('home-avatar');
  if (avatarEl) {
    var foto = E.datos && (E.datos.fotoUrl || E.datos.foto || E.datos.fotoPerfil || E.datos.picture || E.datos.photoUrl || '');
    if (foto) {
      avatarEl.innerHTML = '<img src="' + foto + '" alt="">';
    } else {
      avatarEl.textContent = (E.nombre || '?').charAt(0).toUpperCase();
    }
  }
  var navAvatar = document.getElementById('home-avatar-nav');
if (navAvatar) {
  var foto = E.datos && (E.datos.fotoPerfil || E.datos.fotoUrl || E.datos.foto || E.datos.picture || E.datos.photoUrl || '');
  if (foto) { navAvatar.innerHTML = '<img src="' + foto + '" alt="" style="width:100%;height:100%;object-fit:cover;">'; }
  else { navAvatar.textContent = (E.nombre || '?').charAt(0).toUpperCase(); }
}
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
        homeContent.innerHTML = '<div class="loader" style="padding:24px 0;"><div class="spinner"></div></div>';
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
    if (!window._nuevxCargandoFechas) ocultarCargando();
  }, function() {
    homeContenidoFinalListo = true;
    _renderHomeReservas();
    if (homeContent) { homeContent.style.opacity = '1'; void homeContent.offsetWidth; homeContent.style.animation = 'fadeIn 0.3s ease'; }
    if (!window._nuevxCargandoFechas) ocultarCargando();
  });
  var bannerCupon = document.getElementById('banner-cupon');
  if (bannerCupon) {
    api({ action: 'getCuponDisponible', nombre: E.nombre }, function(res) {
      if (E.datos) E.datos.cuponDisponible = res.cuponDisponible === true;
      if (res.cuponDisponible) localStorage.removeItem('cupon_' + E.nombre);
      bannerCupon.style.display = 'none';
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
  if (tNotif) tNotif.checked = notifActivas;
  var rowNotif = document.getElementById('row-notif-home');
  if (rowNotif) rowNotif.style.display = notifActivas ? 'none' : '';
  var rowInstalar = document.getElementById('row-instalar-app');
  if (rowInstalar) rowInstalar.style.display = esStandalone() ? 'none' : '';
  _initHomeNav();
}

function refrescarMisReservas(callback, btn) {
  var icon = btn ? btn.querySelector('.material-symbols-outlined') : null;
  if (icon) icon.style.animation = 'spin 0.6s linear infinite';
  api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
    _todasReservas = reservas;
    prepararHome();
    if (icon) icon.style.animation = '';
    if (callback) callback();
  }, function() {
    _renderHomeReservas();
    if (icon) icon.style.animation = '';
    mostrarToast('No se pudo actualizar. Intenta de nuevo.', 'error');
    if (callback) callback();
  });
}

var _ptrStartY = 0, _ptrArrastrando = false, _ptrRefrescando = false, _ptrProgreso = 0;
var _PTR_RANGO = 140, _PTR_MAX_VISUAL = 70;

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
}, { passive: true });

window.addEventListener('touchmove', function(e) {
  if (!_ptrArrastrando) return;
  var delta = e.touches[0].clientY - _ptrStartY;
  if (delta <= 0) { _ptrArrastrando = false; _ptrOcultarIndicador(); return; }
  var ind = document.getElementById('ptr-indicator');
  var anillo = document.getElementById('ptr-spinner');
  if (!ind || !anillo) return;
  var progreso = Math.min(delta / _PTR_RANGO, 1);
  _ptrProgreso = progreso;
  var offsetY = _PTR_MAX_VISUAL * (1 - Math.pow(1 - progreso, 2)); // resistencia tipo goma elástica
  var escala = 0.7 + 0.3 * progreso;
  ind.classList.add('ptr-sin-transicion');
  ind.style.opacity = Math.min(progreso / 0.3, 1);
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
    anillo.style.animation = '';    // vuelve al spin infinito propio de .spinner
    anillo.style.transform = '';
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
}

function irNuevaReserva(skipEquip) {
  E.conf = ''; E.fechas = []; E.tallasPorFecha = {}; E.tipoPago = 'clase'; E.totalPago = 0; E.notaPago = ''; E.cuponAplicado = false; E.creditosUsados = 0; E.reagendando = false;
  var chkC = document.getElementById('chk-cupon'); if (chkC) chkC.checked = false;
  document.querySelectorAll('input[name="conf"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
  cargarFechas();
}

function irMisReservas() {
  _poblarSelectMesHistorial();
  renderHistorial();
  ir('s-misreservas');
}

function verTodasReservas() { irMisReservas(); }

function iniciarReagendamiento() {
  E.conf = ''; E.fechas = []; E.tallasPorFecha = {}; E.tipoPago = 'clase'; E.totalPago = 0;
  E.notaPago = ''; E.cuponAplicado = false; E.creditosUsados = 0; E.reagendando = true;
  var chkC = document.getElementById('chk-cupon'); if (chkC) chkC.checked = false;
  document.querySelectorAll('input[name="conf"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
  cargarFechas();
}

function irHomeDesdeExito() {
  var homeContent = document.getElementById('home-reservas-lista');
  var reservasListas = false; // mismo guard que homeContenidoFinalListo en prepararHome(): evita que el
                               // spinner pise contenido si getReservasPersona resuelve antes de los 50ms
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
    // prepararHome(true) hace el único render real (con saltarFadeInicial=true no repite
    // su propio fade/spinner) — así queda una sola transición en vez de dos en secuencia.
    prepararHome(true);
  }, function() {
    reservasListas = true;
    // aunque falle, dejamos que prepararHome(true) haga el render final (con lo que haya
    // en _todasReservas) para que el contenedor vuelva a opacity:1 con fadeIn — si solo se
    // llamaba _renderHomeReservas() acá, un error antes de los 50ms dejaba el contenedor
    // en opacity:0 para siempre.
    prepararHome(true);
  });
  ir('s-home');
}

function _renderHomeReservas() {
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var cl = _clasificarReservas(_todasReservas || [], hoy);
  var activas = cl.activas;
  var container = document.getElementById('home-reservas-lista');
  var labelMisReservas = document.getElementById('label-mis-reservas');

  var homeNav = document.getElementById('home-nav');
  var homeNavSpacer = document.getElementById('home-nav-spacer');
  var labelMisRes = document.getElementById('label-mis-reservas');
  var verHistBtn = document.querySelector('[onclick="irMisReservas()"]');

  if (activas.length === 0) {
    if (homeNav) homeNav.style.display = 'none';
    if (homeNavSpacer) homeNavSpacer.style.display = 'none';
    if (labelMisRes) labelMisRes.style.display = 'none';
    if (verHistBtn) verHistBtn.style.display = 'none';
  } else {
    if (homeNav) homeNav.style.display = 'flex';
    if (homeNavSpacer) homeNavSpacer.style.display = '';
    if (labelMisRes) labelMisRes.style.display = '';
    if (verHistBtn) verHistBtn.style.display = '';
  }

  var fotoUrl = E.datos && (E.datos.fotoPerfil || '');
  var avatarHtml = fotoUrl
    ? '<img src="' + fotoUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">'
    : (E.nombre || '?').charAt(0).toUpperCase();

  var html = activas.length === 0
    ? '<div class="empty-state-home">' +
        '<div class="empty-state-topbar">' +
          '<div class="empty-state-avatar" onclick="irEditarDatos()">' + avatarHtml + '</div>' +
          '<button class="empty-state-contacto" onclick="abrirContacto()"><span class="material-symbols-outlined">forum</span>¿Dudas? Contáctanos</button>' +
        '</div>' +
        '<div class="empty-state-body">' +
          '<div class="empty-state-icon"><span class="material-symbols-outlined">calendar_month</span></div>' +
          '<div class="empty-state-saludo">¡Hola, ' + (E.nombre || '') + '!</div>' +
          '<div class="empty-state-msg">Todavía no tienes ninguna reserva.<br>¿Te animas a hacer una?</div>' +
          '<button onclick="irNuevaReserva()" class="empty-state-btn"><span class="material-symbols-outlined">calendar_add_on</span>Nueva reserva</button>' +
          '<div class="empty-state-links">' +
            '<span class="empty-state-link" onclick="irMisReservas()">Ver historial de reservas</span>' +
            '<span class="empty-state-link empty-state-link-muted" onclick="irEditarDatos()">Editar mi perfil</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    : activas.map(function(r) { return _renderCardHome(r, hoy); }).join('');

  container.innerHTML = html;
  if (labelMisReservas) labelMisReservas.style.display = activas.length === 0 ? 'none' : '';
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
  if (diff === 1) return 'Mañana';
  if (diff === 2) return 'Pasado mañana';
  var dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var dn = dias[fd.getDay()];
  if (diff >= 3 && diff <= 6) return 'Este ' + dn;
  if (diff >= 7 && diff <= 13) return dn + ' que viene';
  return fechaPura;
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

function _renderCardHome(r, hoy) {
  var partes = (r.fecha || '').split(' - ');
  var fechaTexto = (partes[0] || r.fecha).trim();
  var hora = partes[1] ? partes[1].trim() : '';
  var lugar = partes[2] ? partes[2].trim() : '';

  var estadoClase = r.estado === 'Confirmada' ? 'confirmada-clase' : r.estado === 'Reagendar' ? 'reagendar-clase' : 'pendiente-clase';
  var estadoColor = r.estado === 'Confirmada' ? 'var(--success-dark)' : r.estado === 'Cancelada' ? 'var(--danger)' : r.estado === 'Reagendar' ? 'var(--dk-purple-mid)' : 'var(--brand)';
  var estadoIcono = r.estado === 'Confirmada' ? 'check_circle' : r.estado === 'Cancelada' ? 'cancel' : r.estado === 'Reagendar' ? 'swap_horiz' : 'hourglass_empty';
  var estadoTexto = r.estado || 'Pendiente';
  var fechaEsc = (r.fecha || '').replace(/'/g, "\\'");

  var necesitaPatines = r.talla && r.talla !== '' && r.talla.toLowerCase() !== 'no';
  var necesitaProtec = r.protecciones && r.protecciones !== '' && r.protecciones.toLowerCase() !== 'no' && r.protecciones.toLowerCase().indexOf('no,') !== 0;
  var equipPillHtml = '';
  if (necesitaPatines) {
    var puedeEditarTalla = (r.estado === 'Pendiente' || r.estado === 'Confirmada');
    if (puedeEditarTalla) {
      var tallaEsc = (r.talla || '').replace(/'/g, "\\'");
      equipPillHtml += '<span class="fi-pill fi-pill-patines" style="cursor:pointer;" onclick="abrirSheetTalla(\'' + fechaEsc + '\',\'' + tallaEsc + '\')"><span class="material-symbols-outlined">roller_skating</span>' + (r.talla || '') + '<span class="material-symbols-outlined">edit</span></span>';
    } else {
      equipPillHtml += '<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">roller_skating</span>' + (r.talla || '') + '</span>';
    }
  }
  if (necesitaProtec) {
    var protecLower = r.protecciones.toLowerCase();
    var protecTexto = (protecLower === 'no' || protecLower === 'no, tengo las mías' || protecLower === 'no, tengo las mias') ? '' :
      (protecLower.indexOf('completa') !== -1 || protecLower === 'sí' || protecLower === 'si') ? 'Protecciones completas' : 'Necesita: ' + r.protecciones;
    if (!protecTexto) { }
    equipPillHtml += '<span class="fi-pill fi-pill-patines"><span class="material-symbols-outlined">shield</span>' + protecTexto + '</span>';
  }
  if (!necesitaPatines && !necesitaProtec) {
    equipPillHtml = '<span class="fi-pill fi-pill-equip"><span class="material-symbols-outlined">check_circle</span>Llevas tu equipo</span>';
  }
  var estadoLabel = r.estado === 'Confirmada' ? 'Reserva confirmada' : r.estado === 'Cancelada' ? 'Reserva cancelada' : r.estado === 'Reagendar' ? 'Clase a favor' : 'Reserva pendiente';
  var statusBarClase = 'rn-status-' + (r.estado === 'Confirmada' ? 'confirmada' : r.estado === 'Cancelada' ? 'cancelada' : r.estado === 'Reagendar' ? 'reagendar' : 'pendiente');
  var statusBar = '<div class="rn-status-bar ' + statusBarClase + '" onclick="abrirModalEstados()">' +
    '<span class="material-symbols-outlined">' + estadoIcono + '</span>' +
    '<span>' + estadoLabel + '</span>' +
    '<span class="rn-status-link">¿Qué significa esto?</span>' +
    '</div>';

  var pillsHtml = '<div class="fi-pills">';
  if (hora) pillsHtml += '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + hora + '</span>';
  if (lugar) {
  if (r.mapsUrl) {
    pillsHtml += '<a class="fi-pill fi-pill-lugar fi-pill-lugar-fusionado" href="' + r.mapsUrl + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><span class="material-symbols-outlined">location_on</span>' + lugar + '<span class="fi-pill-fusionado-sep"></span><span class="material-symbols-outlined">near_me</span>Cómo llegar</a>';
  } else {
    pillsHtml += '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>';
  }
}
  pillsHtml += '</div>';

  var uid = 'rcard-' + (r.fila || Math.random().toString(36).slice(2));
  var filaEsc = r.fila || '';

  var bodyHtml = '<div class="rn-body" id="' + uid + '-body"><div class="rn-body-inner">';
  if (r.descripcion) bodyHtml += '<p style="margin-bottom:25px;">' + r.descripcion + '</p>';
  bodyHtml += '<div class="fi-pills">' + equipPillHtml;
  
  if (r.horaFin) bodyHtml += '<span class="fi-pill"><span class="material-symbols-outlined">schedule</span>Fin ' + r.horaFin + '</span>';
  if (r.duracion) bodyHtml += '<span class="fi-pill"><span class="material-symbols-outlined">timer</span>' + r.duracion + '</span>';
  bodyHtml += '</div><div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border-light);text-align:center;"><button class="btn-cancel-text" onclick="abrirGestionar(\'' + fechaEsc + '\',' + filaEsc + ')">Re-agendar o cancelar reserva</button></div></div></div>';

  var masInfoHtml = '<div class="rn-divider"></div>' +
    '<div class="rn-mas-info" id="' + uid + '-toggle" onclick="_toggleCardBody(\'' + uid + '\')">' +
    '<span>Más información</span><span class="material-symbols-outlined rn-chevron">expand_more</span></div>' +
    bodyHtml;

  return '<div class="res-card-home res-card-nueva ' + estadoClase + '">' +
    statusBar +
    '<div class="rn-header">' +
    '<div class="rn-top"><div class="rn-date">' + fechaTexto + '</div></div>' +
    pillsHtml +
    '</div>' +
    masInfoHtml +
    
    '</div>';
}

function _toggleCardBody(uid) {
  var toggle = document.getElementById(uid + '-toggle');
  var body = document.getElementById(uid + '-body');
  if (!toggle || !body) return;
  toggle.classList.toggle('open');
  body.classList.toggle('open');
}

var _tallaSheetFecha = '', _tallaSheetActual = '', _tallaSheetSel = '', _tallaSheetModo = 'existente', _tallaSheetSlug = '';

function abrirSheetTalla(fecha, tallaActual) {
  _tallaSheetModo = 'existente';
  var titulo = document.getElementById('sheet-talla-titulo');
  if (titulo) titulo.textContent = 'Cambiar talla para el entrenamiento del ' + fecha;
  var btn = document.getElementById('btn-confirmar-talla');
  if (btn) btn.textContent = 'Confirmar talla';
  _abrirSheetTallaBase(fecha, tallaActual);
}

function _abrirSheetTallaBase(fecha, tallaActual) {
  _tallaSheetFecha = fecha; _tallaSheetActual = tallaActual; _tallaSheetSel = '';
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
  api({ action: 'getTallasDisponiblesParaFecha', fecha: fecha, nombreExcluir: E.nombre }, function(tallas) {
    _renderGridSheetTalla(tallas || []);
  }, function() {
    if (grid) grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:0.8rem;">No se pudieron cargar las tallas. Intenta de nuevo.</p>';
  });
}

function _renderGridSheetTalla(tallas) {
  var grid = document.getElementById('sheet-talla-grid');
  if (!grid) return;
  grid.innerHTML = tallas.map(function(t) {
    var esActual = t.talla === _tallaSheetActual;
    var clases = 'aj-pill' + (t.disponible ? '' : ' no-disponible') + (esActual && t.disponible ? ' talla-actual' : '');
    var onclick = t.disponible ? ' onclick="seleccionarTallaSheet(this,\'' + t.talla + '\')"' : '';
    return '<span class="' + clases + '" style="justify-content:center;"' + onclick + '>' + t.talla + '</span>';
  }).join('');
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

function cerrarSheetTalla() {
  var sh = document.getElementById('sheet-talla');
  var ov = document.getElementById('sheet-talla-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function() { if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function confirmarTallaSheet() {
  if (!_tallaSheetSel || _tallaSheetSel === _tallaSheetActual) return;
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

function _poblarSelectMesHistorial() {
  var cont = document.getElementById('historial-pills-mes');
  if (!cont) return;
  var hoy = new Date();
  var hist = _clasificarReservas(_todasReservas || [], hoy).historial;
  var mesesConReservas = {};
  hist.forEach(function(r) {
    var m = _getMesReserva(r);
    if (m >= 0) mesesConReservas[m] = true;
  });
  var mesActual = hoy.getMonth();
  if (Object.keys(mesesConReservas).length === 0) {
    mesesConReservas[mesActual] = true;
  }
  var mesesOrdenados = Object.keys(mesesConReservas).map(Number).sort(function(a,b){return b-a;});
  cont.innerHTML = mesesOrdenados.map(function(m) {
    var activa = m === mesActual ? ' activa' : '';
    return '<button class="historial-pill-mes' + activa + '" data-mes="' + m + '" onclick="seleccionarPillMes(this,' + m + ')">' + _MESES_DISPLAY[m] + ' ' + hoy.getFullYear() + '</button>';
  }).join('');
  window._historialMesActual = mesesOrdenados[0] !== undefined ? mesesOrdenados[0] : mesActual;
}

function seleccionarPillMes(pill, mes) {
  document.querySelectorAll('.historial-pill-mes').forEach(function(p){ p.classList.remove('activa'); });
  pill.classList.add('activa');
  window._historialMesActual = mes;
  renderHistorial();
}

function _getMesReserva(r) {
  var f = r.fecha.toLowerCase().trim();
  if (_MESES_MAP[f] !== undefined) return _MESES_MAP[f];
  var m = f.match(/\d{1,2}\s+de\s+([a-záéíóúñ]+)/i);
  if (!m) return -1;
  var mn = m[1].normalize ? m[1].normalize('NFD').replace(/[̀-ͯ]/g,'') : m[1];
  return _MESES_MAP[mn] !== undefined ? _MESES_MAP[mn] : -1;
}

function renderHistorial() {
  var mesNum = (window._historialMesActual !== undefined) ? window._historialMesActual : new Date().getMonth();
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var hist = _clasificarReservas(_todasReservas || [], hoy).historial;
  var delMes = hist.filter(function(r) { return _getMesReserva(r) === mesNum; });
  var grupos = {}, orden = [];
  delMes.forEach(function(r) { if (!grupos[r.fecha]) { grupos[r.fecha] = []; orden.push(r.fecha); } grupos[r.fecha].push(r); });
  var html = '';
  if (delMes.length === 0) {
    html = '<p style="text-align:center;color:var(--muted);padding:24px 0;">No hay reservas archivadas en este mes.</p>';
  } else {
    orden.forEach(function(fecha, idx) {
      var gId = 'hgrp-' + idx, abierto = idx === 0, count = grupos[fecha].length;
      html += '<div style="border:2px solid var(--border-light);border-radius:12px;margin-bottom:10px;overflow:hidden;">';
      html += '<div onclick="toggleGrupoHistorial(\'' + gId + '\',this)" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;" class="datos-seccion-titulo">';
      html += '<span style="font-weight:800;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.8px;color:var(--brand);">' + fecha + '</span>';
      html += '<span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--dk-text-muted);transition:transform 0.3s;' + (abierto ? 'transform:rotate(180deg);' : '') + '">expand_more</span></div>';
      html += '<div id="' + gId + '" style="overflow:hidden;transition:max-height 0.4s cubic-bezier(0.16,1,0.3,1),opacity 0.3s ease;' + (abierto ? 'max-height:2000px;opacity:1;padding:10px 10px 4px;' : 'max-height:0;opacity:0;padding:0;') + '">';
      grupos[fecha].forEach(function(r) { html += _renderCardHistorial(r); });
      html += '</div></div>';
    });
  }
  var histEl = document.getElementById('historial-lista');
  histEl.innerHTML = html;
  void histEl.offsetWidth;
  histEl.style.animation = 'fadeIn 0.3s ease';
}

function _renderCardHistorial(r) {
  var bMap = {Confirmada:['badge-confirmada','✅'],Cancelada:['badge-cancelada','❌'],Pendiente:['badge-pendiente','⏳'],Reagendar:['badge-pendiente','🔁'],'Crédito usado':['badge-confirmada','🎟️']};
  var b = bMap[r.estado] || ['badge-pendiente','?'];
  var tP = r.talla && r.talla.toLowerCase() !== 'no';
  var tR = r.protecciones && r.protecciones.toLowerCase() !== 'no';
  var icoP = '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;">roller_skating</span>';
  var icoR = '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;">shield</span>';
  var icoOk = '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;">check_circle</span>';
  var eq = tP && tR ? icoP + ' T.' + r.talla + ' · ' + icoR + ' Protecciones' : tP ? icoP + ' Talla ' + r.talla : tR ? icoR + ' ' + r.protecciones : icoOk + ' Equipo propio';
  var h = '<div class="reserva-card" style="margin-bottom:8px;">';
  h += '<div class="reserva-header" style="align-items:flex-start;gap:8px;"><span class="reserva-fecha" style="font-size:0.82rem;flex:1;min-width:0;">' + r.fecha + '</span>';
  h += '<span class="badge ' + b[0] + '" style="flex-shrink:0;white-space:nowrap;">' + b[1] + ' ' + r.estado + '</span></div>';
  h += '<div class="reserva-detalle">' + eq + '</div>';
  if (r.monto) h += '<div style="font-size:0.78rem;color:var(--muted);margin-top:3px;">💵 ' + r.monto + '</div>';
  h += '</div>'; return h;
}

function toggleGrupoHistorial(id, header) {
  var el = document.getElementById(id), chevron = header.querySelector('.material-symbols-outlined');
  var abierto = el.style.maxHeight && el.style.maxHeight !== '0px' && el.style.maxHeight !== '0';
  document.querySelectorAll('[id^="hgrp-"]').forEach(function(e2) {
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

/* ── Gestionar reserva ──────────────────────────────── */
var _sgFechaActual = '';
var _sgFilaActual = null;
var _sgFechaSeleccionada = '';

function abrirGestionar(fecha, fila) {
  _sgFechaActual = fecha; _sgFilaActual = fila; _sgFechaSeleccionada = '';
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
}

function cerrarSheetGestionar() {
  var sheet = document.getElementById('sheet-gestionar');
  var overlay = document.getElementById('sheet-gestionar-overlay');
  sheet.style.transform = 'translateY(100%)';
  setTimeout(function() {
    sheet.style.display = 'none';
    overlay.style.display = 'none';
  }, 350);
}

function sheetVolverOpciones() {
  document.getElementById('sg-sheet-opciones').style.display = '';
  document.getElementById('sg-sheet-cancelar').style.display = 'none';
}

function sheetIrCancelar() {
  document.getElementById('sg-sheet-opciones').style.display = 'none';
  document.getElementById('sg-sheet-cancelar').style.display = '';
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
        (sinEquip ? '<br><br><button class="btn btn-secondary" style="margin-top:0;" onclick="irEditarDatos()"><span class=\'material-symbols-outlined\' style=\'font-size:1rem;vertical-align:middle;\'>manage_accounts</span> Actualizar equipamiento</button>' : '') +
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
}

function ejecutarReagendamiento() {
  var modal = document.getElementById('modal-confirm-reagendar');
  if (modal) modal.style.display = 'none';
  mostrarCargando('Reagendando...');
  api({ action: 'reagendarReserva', nombre: E.nombre, fechaAnterior: _sgFechaActual, fechaNueva: _sgFechaSeleccionada }, function() {
    ocultarCargando();
    ir('s-home');
    setTimeout(function() { _recargarYRenderReservas(function() { mostrarToast('¡Fecha cambiada con éxito! 📅', 'ok'); }); }, 100);
  }, function(e) {
    ocultarCargando();
    mostrarToast(e.message || 'Error al reagendar. Intenta de nuevo.', 'error');
  });
}

function cerrarModalReagendar() {
  var modal = document.getElementById('modal-confirm-reagendar');
  if (modal) modal.style.display = 'none';
}

function ejecutarCancelacion() {
  cerrarSheetGestionar();
  mostrarCargando('Cancelando reserva...');
  api({ action: 'cancelarReserva', nombre: E.nombre, fecha: _sgFechaActual }, function() {
ocultarCargando();
    ir('s-home');
    setTimeout(function() { _recargarYRenderReservas(function() { mostrarToast('Reserva cancelada', 'ok'); }); }, 100);
  }, function(e) {
    ocultarCargando();
    mostrarToast(e.message || 'Error al cancelar. Intenta de nuevo.', 'error');
  });
}
function abrirModalEstados() {
  var m = document.getElementById('modal-estados-reserva');
  if (m) m.style.display = 'flex';
}
function cerrarModalEstados() {
  var m = document.getElementById('modal-estados-reserva');
  if (m) m.style.display = 'none';
}

function _recargarYRenderReservas(callback) {
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
      _renderHomeReservas();
      setTimeout(_initScrollReservas, 50);
      if (callback) callback();
    }, function() { _renderHomeReservas(); setTimeout(_initScrollReservas, 50); if (callback) callback(); });
  }, function() { _renderHomeReservas(); setTimeout(_initScrollReservas, 50); if (callback) callback(); });
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