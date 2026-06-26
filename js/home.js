var _todasReservas = [];
var _proximosData = {};
var _MESES_MAP = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
var _MESES_DISPLAY = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var _homeExpandido = false;

function prepararHome() {
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
  renderHomeReservas();
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
    renderHomeReservas();
  }, function() { renderHomeReservas(); });
  var bannerCupon = document.getElementById('banner-cupon');
  if (bannerCupon) {
    api({ action: 'getCuponDisponible', nombre: E.nombre }, function(res) {
      if (E.datos) E.datos.cuponDisponible = res.cuponDisponible === true;
      if (res.cuponDisponible) localStorage.removeItem('cupon_' + E.nombre);
      bannerCupon.style.display = tieneCuponDisponible() ? 'block' : 'none';
    }, function() {
      bannerCupon.style.display = tieneCuponDisponible() ? 'block' : 'none';
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
}

function irNuevaReserva(skipEquip) {
  E.conf = ''; E.fechas = []; E.tipoPago = 'clase'; E.totalPago = 0; E.notaPago = ''; E.cuponAplicado = false; E.creditosUsados = 0; E.reagendando = false;
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
  E.conf = ''; E.fechas = []; E.tipoPago = 'clase'; E.totalPago = 0;
  E.notaPago = ''; E.cuponAplicado = false; E.creditosUsados = 0; E.reagendando = true;
  var chkC = document.getElementById('chk-cupon'); if (chkC) chkC.checked = false;
  document.querySelectorAll('input[name="conf"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
  cargarFechas();
}

function irHomeDesdeExito() {
  api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
    _todasReservas = reservas;
    renderHomeReservas();
  }, function() { renderHomeReservas(); });
  ir('s-home');
}

function renderHomeReservas() {
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var cl = _clasificarReservas(_todasReservas || [], hoy);
  var activas = cl.activas, historial = cl.historial;
  var container = document.getElementById('home-reservas-lista');
  var btnVerMas = document.getElementById('btn-ver-mas-home');
  var btnHist = document.getElementById('btn-historial-home');
  _homeExpandido = false;
  var labelMisReservas = document.getElementById('label-mis-reservas');
  var html = activas.length === 0
    ? '<button onclick="irNuevaReserva()" style="width:100%;padding:14px;border:2px solid var(--brand);border-radius:12px;background:rgba(249,115,22,0.12);color:var(--brand) !important;text-align:center;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:0.3px;animation:pulseBtn 2.4s ease-in-out infinite;">📅 Hacer una reserva</button>'
    : activas.slice(0, 2).map(function(r) { return _renderCardHome(r, hoy); }).join('');
  container.innerHTML = html;
  if (labelMisReservas) labelMisReservas.style.display = activas.length === 0 ? 'none' : '';
  var filasBotones = document.getElementById('fila-botones-home');
  var btnNueva = document.getElementById('btn-nueva-reserva-home');
  if (activas.length === 0) {
    if (filasBotones) filasBotones.style.display = 'none';
    if (btnNueva) btnNueva.style.display = 'none';
  } else {
    if (filasBotones) filasBotones.style.display = 'flex';
    if (btnVerMas) { btnVerMas.style.display = activas.length <= 2 ? 'none' : ''; btnVerMas.textContent = 'Ver más ▾'; }
    if (btnHist)   btnHist.style.display = historial.length === 0 ? 'none' : '';
    if (btnNueva) btnNueva.style.display = '';
  }
}

function verMasHomeReservas() {
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var activas = _clasificarReservas(_todasReservas || [], hoy).activas;
  _homeExpandido = !_homeExpandido;
  var toShow = _homeExpandido ? activas : activas.slice(0, 2);
  var container = document.getElementById('home-reservas-lista');
  container.style.opacity = '0';
  setTimeout(function() {
    container.innerHTML = toShow.map(function(r) { return _renderCardHome(r, hoy); }).join('');
    container.style.transition = 'opacity 0.3s ease';
    container.style.opacity = '1';
  }, 150);
  var btn = document.getElementById('btn-ver-mas-home');
  if (btn) btn.textContent = _homeExpandido ? 'Ver menos ▴' : 'Ver más ▾';
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
    } else { btn.disabled = false; alert('Error al cancelar.'); }
  }, function(e) { btn.disabled = false; alert('Error: ' + e.message); });
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

  var necesitaPatines = r.necesitaPatines && r.necesitaPatines.toLowerCase() !== 'no';
  var equipTexto = necesitaPatines ? 'Patines' + (r.talla ? ' talla ' + r.talla : '') : 'Llevas tu equipo';
  var equipIcono = necesitaPatines ? 'roller_skating' : 'check_circle';
  var equipClase = necesitaPatines ? 'fi-pill fi-pill-patines' : 'fi-pill fi-pill-equip';
  var equipPill = '<div class="rn-equip-estado">' +
    '<span class="' + equipClase + '"><span class="material-symbols-outlined">' + equipIcono + '</span>' + equipTexto + '</span>' +
    '<span class="rn-estado-txt" style="color:' + estadoColor + '"><span class="material-symbols-outlined" style="font-size:13px;">' + estadoIcono + '</span>' + estadoTexto + '</span>' +
    '</div>';

  var pillsHtml = '<div class="fi-pills">';
  if (hora) pillsHtml += '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + hora + '</span>';
  if (lugar) pillsHtml += '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>';
  pillsHtml += '</div>' + equipPill;

  var uid = 'rcard-' + (r.fila || Math.random().toString(36).slice(2));
  var fechaEsc = (r.fecha || '').replace(/'/g, "\\'");
  var filaEsc = r.fila || '';

  var hasInfo = !!(r.descripcion || r.mapsUrl || r.horaFin || r.duracion || lugar);
  var bodyHtml = '';
  if (hasInfo) {
    bodyHtml = '<div class="rn-body" id="' + uid + '-body">' +
      '<div class="rn-body-inner">';
    if (r.descripcion) bodyHtml += '<p style="margin-bottom:10px;">' + r.descripcion + '</p>';
    if (lugar || r.mapsUrl || r.horaFin || r.duracion) {
      bodyHtml += '<div class="fi-pills">';
      if (r.mapsUrl) bodyHtml += '<a class="fi-pill fi-pill-maps" href="' + r.mapsUrl + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><span class="material-symbols-outlined">near_me</span>Cómo llegar</a>';
      if (r.horaFin) bodyHtml += '<span class="fi-pill"><span class="material-symbols-outlined">schedule</span>Fin ' + r.horaFin + '</span>';
      if (r.duracion) bodyHtml += '<span class="fi-pill"><span class="material-symbols-outlined">timer</span>' + r.duracion + '</span>';
      bodyHtml += '</div>';
    }
    bodyHtml += '</div></div>';
  }

  var masInfoHtml = hasInfo
    ? '<div class="rn-divider"></div>' +
      '<div class="rn-mas-info" id="' + uid + '-toggle" onclick="_toggleCardBody(\'' + uid + '\')">' +
      '<span>Más información</span><span class="material-symbols-outlined rn-chevron">expand_more</span></div>' +
      bodyHtml
    : '';

  return '<div class="res-card-home res-card-nueva ' + estadoClase + '">' +
    '<div class="rn-header">' +
    '<div class="rn-top"><div class="rn-date">' + fechaTexto + '</div></div>' +
    pillsHtml +
    '</div>' +
    masInfoHtml +
    '<div class="rn-divider"></div>' +
    '<div class="rn-cancel-wrap">' +
    '<button class="btn-cancel-text" onclick="abrirGestionar(\'' + fechaEsc + '\',' + filaEsc + ')">Cancelar reserva</button>' +
    '</div>' +
    '</div>';
}

function _toggleCardBody(uid) {
  var toggle = document.getElementById(uid + '-toggle');
  var body = document.getElementById(uid + '-body');
  if (!toggle || !body) return;
  toggle.classList.toggle('open');
  body.classList.toggle('open');
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
  var sel = document.getElementById('sel-mes-historial');
  if (!sel) return;
  var anio = new Date().getFullYear(), mesActual = new Date().getMonth();
  sel.innerHTML = '';
  _MESES_DISPLAY.forEach(function(m, i) {
    var o = document.createElement('option');
    o.value = String(i); o.textContent = m + ' ' + anio; sel.appendChild(o);
  });
  sel.value = String(mesActual);
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
  var sel = document.getElementById('sel-mes-historial');
  if (!sel) return;
  var mesNum = parseInt(sel.value);
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
  document.getElementById('historial-lista').innerHTML = html;
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
        if (bCupon) bCupon.style.display = 'block';
      }
      if (onSuccess) { onSuccess(); } else { renderHomeReservas(); }
    } else {
      alert('Error al cancelar.');
    }
  }, function(e) { alert('Error: ' + e.message); });
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
  }, function() {
    lista.innerHTML = '<p style="color:var(--danger);font-size:0.82rem;">Error al cargar fechas. Intenta de nuevo.</p>';
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
    _todasReservas = (_todasReservas || []).map(function(r) {
      if (r.fecha === _sgFechaActual) { r.fecha = _sgFechaSeleccionada; r.estado = 'Pendiente'; }
      return r;
    });
    ocultarCargando();
    ir('s-home');
    setTimeout(function() { _renderHomeReservas(); mostrarToast('¡Fecha cambiada con éxito! 📅', 'ok'); }, 100);
  }, function(e) {
    ocultarCargando();
    alert('Error al reagendar: ' + (e.message || 'Intenta de nuevo'));
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
    _todasReservas = (_todasReservas || []).filter(function(r) { return r.fecha !== _sgFechaActual; });
    ocultarCargando();
    ir('s-home');
    setTimeout(function() { renderHomeReservas(); }, 100);
  }, function(e) {
    ocultarCargando();
    alert('Error al cancelar: ' + (e.message || 'Intenta de nuevo'));
  });
}
