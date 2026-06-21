var _todasReservas = [];
var _MESES_MAP = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
var _MESES_DISPLAY = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var _homeExpandido = false;

function prepararHome() {
  document.getElementById('home-saludo').textContent = '¡Hola, ' + E.nombre + '!';
  renderHomeReservas();
  var bannerCupon = document.getElementById('banner-cupon');
  if (bannerCupon) bannerCupon.style.display = tieneCuponDisponible() ? 'block' : 'none';
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

function irNuevaReserva() {
  E.conf = ''; E.fechas = []; E.tipoPago = 'clase'; E.totalPago = 0; E.notaPago = ''; E.cuponAplicado = false; E.creditosUsados = 0; E.reagendando = false;
  var chkC = document.getElementById('chk-cupon'); if (chkC) chkC.checked = false;
  document.querySelectorAll('input[name="conf"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
  renderEquip(); ir('s2');
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
    ? '<button onclick="irNuevaReserva()" style="width:100%;padding:14px;border:2px solid #f97316;border-radius:12px;background:rgba(249,115,22,0.12);color:#f97316 !important;text-align:center;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:0.3px;animation:pulseBtn 2.4s ease-in-out infinite;">📅 Hacer una reserva</button>'
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

function _renderCardHome(r, hoy) {
  var f = r.fecha.toLowerCase().trim(), estado = r.estado;
  if (_MESES_MAP[f] !== undefined) {
    var vh = _parseFechaSimple(r.validezHasta);
    var inicioMes = new Date(hoy.getFullYear(), _MESES_MAP[f], 1); inicioMes.setHours(0,0,0,0);
    var exp = vh ? hoy > vh : false;
    var dias = vh ? Math.ceil((vh.getTime() - hoy.getTime()) / 86400000) : 999;
    var tipo = exp ? 'vencida' : inicioMes > hoy ? 'futura' : dias <= 15 ? 'vencimiento' : 'vigente';
    if (estado === 'Pendiente') tipo = 'pendiente-mens';
    var nombreMes = r.fecha.charAt(0).toUpperCase() + r.fecha.slice(1);
    var icons = {vencida:'❌',futura:'🔒',vencimiento:'⚠️','pendiente-mens':'⏳',vigente:'✅'};
    var colors = {vencida:'#dc2626',futura:'#aaa',vencimiento:'#b45309','pendiente-mens':'#b45309',vigente:'#166534'};
    var labels = {vencida:'Pago vencido',futura:'Mes futuro',vencimiento:'Próximo a cumplirse','pendiente-mens':'Pendiente de verificación',vigente:'Pago activo'};
    var h = '<div class="res-card-home ' + tipo + '">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">';
    h += '<div><div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:' + colors[tipo] + ';margin-bottom:4px;">' + icons[tipo] + ' ' + labels[tipo] + '</div>';
    h += '<div style="font-weight:800;font-size:1.05rem;">' + nombreMes + '</div></div>';
    if (r.monto) h += '<span style="font-weight:800;color:#F97316;font-size:0.95rem;margin-left:8px;flex-shrink:0;">' + r.monto + '</span>';
    h += '</div>';
    if (r.fechaPago && tipo !== 'futura') h += '<div style="font-size:0.8rem;color:#888;margin-bottom:2px;">Pagado el ' + r.fechaPago + '</div>';
    if (vh && tipo !== 'futura' && tipo !== 'pendiente-mens') h += '<div style="font-size:0.8rem;color:#888;">Válido hasta el ' + r.validezHasta + '</div>';
    if (tipo === 'futura') h += '<div style="font-size:0.8rem;color:#aaa;">Vigente desde el 1 de ' + nombreMes + '</div>';
    if (tipo === 'pendiente-mens') h += '<div style="font-size:0.8rem;color:#888;margin-top:2px;">Esperando verificación del pago</div>';
    if (tipo === 'vencida') h += '<button class="btn btn-primary" style="margin-top:12px;padding:12px;" onclick="irNuevaReserva()">Hacer nuevo pago mensual</button>';
    if (tipo === 'pendiente-mens') h += '<button class="btn-cancelar" style="margin-top:10px;" onclick="cancelarRes(\'' + r.fecha.replace(/'/g,"\\'") + '\')">Cancelar</button>';
    h += '</div>'; return h;
  }
  var tipoC = estado === 'Confirmada' ? 'confirmada-clase' : estado === 'Reagendar' ? 'reagendar-clase' : 'pendiente-clase';
  var tienePat = r.talla && r.talla.toLowerCase() !== 'no';
  var tieneProc = r.protecciones && r.protecciones.toLowerCase() !== 'no';
  var equipMsg = tienePat && tieneProc ? '🛼 T.' + r.talla + ' · 🛡️ Protecciones' :
                 tienePat ? '🛼 Patines talla ' + r.talla : tieneProc ? '🛡️ ' + r.protecciones : '✅ Equipo propio';
  var bIcon = {Confirmada:'✅',Reagendar:'🔁',Pendiente:'⏳'}[estado] || '⏳';
  var bColor = {Confirmada:'#166534',Reagendar:'#6d28d9',Pendiente:'#b45309'}[estado] || '#b45309';
  var bBg = {Confirmada:'#dcfce7',Reagendar:'#ede9fe',Pendiente:'#fef3c7'}[estado] || '#fef3c7';
  var h = '<div class="res-card-home ' + tipoC + '">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">';
  h += '<div style="font-weight:800;font-size:0.88rem;flex:1;margin-right:8px;line-height:1.3;">' + r.fecha + '</div>';
  h += '<span style="padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:800;background:' + bBg + ';color:' + bColor + ';white-space:nowrap;">' + bIcon + ' ' + estado + '</span></div>';
  h += '<div class="res-card-equip" style="font-size:0.82rem;margin-bottom:' + (estado === 'Reagendar' ? '6' : '8') + 'px;">' + equipMsg + '</div>';
  if (estado === 'Reagendar') {
    h += '<div style="font-size:0.78rem;color:#7c3aed;background:#ede9fe;border-radius:8px;padding:6px 10px;margin-bottom:8px;">🔁 Clase a favor por entrenamiento cancelado</div>';
    h += '<button class="btn btn-primary" style="margin-top:8px;padding:12px;background:#7c3aed;box-shadow:0 4px 14px rgba(124,58,237,0.3);" onclick="iniciarReagendamiento()">🔁 Reagendar clase</button>';
  }
  if (estado === 'Pendiente' || estado === 'Confirmada') h += '<button class="btn-cancelar" style="margin-top:2px;" onclick="cancelarRes(\'' + r.fecha.replace(/'/g,"\\'") + '\')">Cancelar esta reserva</button>';
  h += '</div>'; return h;
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
    html = '<p style="text-align:center;color:#888;padding:24px 0;">No hay reservas archivadas en este mes.</p>';
  } else {
    orden.forEach(function(fecha, idx) {
      var gId = 'hgrp-' + idx, abierto = idx === 0, count = grupos[fecha].length;
      html += '<div style="border:2px solid #e5e5e5;border-radius:12px;margin-bottom:10px;overflow:hidden;">';
      html += '<div onclick="toggleGrupoHistorial(\'' + gId + '\',this)" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;" class="datos-seccion-titulo">';
      html += '<span style="font-weight:800;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.8px;color:#F97316;">' + fecha + '</span>';
      html += '<span class="material-symbols-outlined" style="font-size:1.1rem;color:#aaa;transition:transform 0.3s;' + (abierto ? 'transform:rotate(180deg);' : '') + '">expand_more</span></div>';
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
  var eq = tP && tR ? '🛼 T.' + r.talla + ' · 🛡️ Protecciones' : tP ? '🛼 Talla ' + r.talla : tR ? '🛡️ ' + r.protecciones : '✅ Equipo propio';
  var h = '<div class="reserva-card" style="margin-bottom:8px;">';
  h += '<div class="reserva-header" style="align-items:flex-start;gap:8px;"><span class="reserva-fecha" style="font-size:0.82rem;flex:1;min-width:0;">' + r.fecha + '</span>';
  h += '<span class="badge ' + b[0] + '" style="flex-shrink:0;white-space:nowrap;">' + b[1] + ' ' + r.estado + '</span></div>';
  h += '<div class="reserva-detalle">' + eq + '</div>';
  if (r.monto) h += '<div style="font-size:0.78rem;color:#888;margin-top:3px;">💵 ' + r.monto + '</div>';
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

function cancelarRes(fecha) {
  if (!confirm('¿Segura que quieres cancelar ' + (necesitaEquipo() ? 'tu reserva' : 'tu pago') + ' para el ' + fecha + '?')) return;
  var btn = event.target; btn.disabled = true; btn.innerHTML = '<span class="btn-spinner" style="border-color:rgba(220,38,38,0.3); border-top-color:#dc2626;"></span>Cancelando...';
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
      renderHomeReservas();
    } else {
      btn.disabled = false; btn.innerHTML = 'Cancelar esta reserva'; alert('Error al cancelar.');
    }
  }, function(e) { btn.disabled = false; btn.innerHTML = 'Cancelar'; alert('Error: ' + e.message); });
}
