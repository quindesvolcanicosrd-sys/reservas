var E = {
  nombre: '', datos: null,
  conf: '', editPat: '', editTalla: '', editProtec: '',
  fechas: [], tallasPorFecha: {}, tipoPago: 'clase', meses: [],
  precioPorClase: 0, precioMensual: 0,
  totalPago: 0, notaPago: '', wpEnviado: false, wpUrl: '', cuponAplicado: false, creditosUsados: 0, reagendando: false, editandoDesdeHome: false
};

var _conflictosTalla = {};

function tieneCuponDisponible() {
  if (!E.datos || !E.datos.cuponDisponible) return false;
  return localStorage.getItem('cupon_' + E.nombre) !== 'usado';
}
function marcarCuponUsadoLocal() { localStorage.setItem('cupon_' + E.nombre, 'usado'); }

function contarCreditos() {
  return (_todasReservas || []).filter(function(r) { return r.estado === 'Reagendar'; }).length;
}

function renderEquip() {
  var d = E.datos; var pat = d.necesitaPatines, tal = d.talla, pro = d.necesitaProtecciones;
  var titulos = { '00': 'No necesitas equipamiento prestado', '10': 'Necesitas patines, pero no protecciones', '01': 'No necesitas patines, pero sí protecciones', '11': 'Necesitas patines y protecciones' };
  var k = (pat.toLowerCase() !== 'no' ? '1' : '0') + (pro.toLowerCase() !== 'no' ? '1' : '0');
  document.getElementById('s2-titulo').textContent = titulos[k] || 'Tu equipamiento';
  var h = '<div class="r-titulo">Detalle</div>';
  h += fila('¿Necesita patines?', pat); if (tal) h += fila('Talla', tal); h += fila('¿Necesita protecciones?', pro);
  document.getElementById('s2-resumen').innerHTML = h;
}
function fila(label, val) { return '<div class="r-fila"><span class="r-label">'+label+'</span><span class="r-valor">'+val+'</span></div>'; }

function continuar_s2() {
  if (!E.conf) { err('err-s2', 'Por favor selecciona una opción.'); return; }
  if (E.conf === 'si') { cargarFechas(); } else {
    E.editPat = ''; E.editTalla = ''; E.editProtec = '';
    document.querySelectorAll('input[name="edit-pat"],input[name="edit-protec"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
    document.getElementById('txt-otro').style.display = 'none'; ir('s3a');
  }
}

/* ── Pills equipamiento ─────────────────────── */
function selPillBin(el, containerId, hiddenId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.equip-pill-bin').forEach(function(p) {
    p.classList.remove('sel-si', 'sel-no');
  });
  var val = el.dataset.val;
  el.classList.add(val === 'Sí' ? 'sel-si' : 'sel-no');
  E.editPat = val;
  var hidden = document.getElementById(hiddenId + '-val');
  if (hidden) hidden.value = val;
}

function selPillProtec(el) {
  document.querySelectorAll('#s3c-pills .equip-pill-protec').forEach(function(p) {
    p.classList.remove('sel');
  });
  el.classList.add('sel');
  var val = el.dataset.val;
  if (val === 'Otro') {
    setTimeout(abrirBsProtec, 150);
  } else {
    E.editProtec = val;
    document.getElementById('edit-protec-val').value = val;
    var sub = document.getElementById('protec-otro-sub');
    if (sub) { sub.textContent = 'Toca para especificar'; sub.style.color = ''; }
  }
}

function abrirBsProtec() {
  var ov = document.getElementById('bs-protec-overlay');
  var bs = document.getElementById('bs-protec');
  if (ov) ov.style.display = 'block';
  if (bs) {
    bs.style.display = 'block';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { bs.style.transform = 'translateY(0)'; });
    });
  }
}

function toggleProtecItem(el) {
  el.classList.toggle('activa');
}

function cerrarBsProtec() {
  var bs = document.getElementById('bs-protec');
  var ov = document.getElementById('bs-protec-overlay');
  if (bs) bs.style.transform = 'translateY(100%)';
  setTimeout(function() {
    if (bs) bs.style.display = 'none';
    if (ov) ov.style.display = 'none';
  }, 350);
}

function cancelarOtroProtec() {
  cerrarBsProtec();
  var hayAlguna = document.querySelector('#bs-protec-pills .aj-pill.activa');
  if (!hayAlguna) {
    document.querySelectorAll('#s3c-pills .equip-pill-protec').forEach(function(p) {
      p.classList.remove('sel');
    });
    E.editProtec = '';
  }
}

function confirmarOtroProtec() {
  var vals = [];
  document.querySelectorAll('#bs-protec-pills .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
  if (!vals.length) { err('err-bs-protec', 'Selecciona al menos una opción.'); return; }
  if (vals.length === 4) { err('err-bs-protec', 'Si necesitas las 4 protecciones, selecciona la opción "Sí, necesito protecciones completas".'); return; }
  var v = vals.join(', ');
  E.editProtec = v;
  document.getElementById('edit-protec-val').value = v;
  var sub = document.getElementById('protec-otro-sub');
  if (sub) { sub.textContent = '"' + v + '"'; sub.style.color = 'var(--brand)'; }
  cerrarBsProtec();
}

function continuar_s3a() {
  if (!E.editPat) { err('err-s3a', 'Por favor selecciona una opción.'); return; }
  if (E.editPat === 'Sí') {
    mostrarCargando('Cargando tallas...');
    api({ action: 'getTallasDisponibles' }, function(tallas) {
      var grid = document.getElementById('tallas-grid');
      grid.innerHTML = tallas.map(function(t) {
        return '<div class="equip-talla-pill" onclick="selTallaEquip(this,\'' + t + '\')">' + t + '</div>';
      }).join('');
      document.getElementById('sel-talla').value = '';
      ocultarCargando(); ir('s3b');
    }, function(e) { ocultarCargando(); err('err-s3a', 'Error: ' + e.message); });
  } else { E.editTalla = ''; ir('s3c'); }
}

function selTallaEquip(el, talla) {
  document.querySelectorAll('#tallas-grid .equip-talla-pill').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  document.getElementById('sel-talla').value = talla;
  E.editTalla = talla;
}

function continuar_s3b() {
  var t = document.getElementById('sel-talla').value;
  if (!t) { err('err-s3b', 'Por favor selecciona una talla.'); return; }
  E.editTalla = t; ir('s3c');
}

function continuar_s3c_nuevo() {
  var protecFinal = E.editProtec;
  if (!protecFinal) { err('err-s3c', 'Por favor selecciona una opción.'); return; }
  mostrarCargando('Guardando equipamiento...');
  api({ action: 'actualizarEquipamientoPersona', nombre: E.nombre, necesitaPatines: E.editPat, talla: E.editTalla, necesitaProtecciones: protecFinal }, function() {
    ocultarCargando();
    E.datos.necesitaPatines = E.editPat;
    E.datos.talla = E.editTalla;
    E.datos.necesitaProtecciones = protecFinal;
    E.editProtec = '';
    if (E.editandoDesdeHome) { E.editandoDesdeHome = false; ir('s-datos'); } else { cargarFechas(); }
  }, function(e) { ocultarCargando(); err('err-s3c', 'Error al guardar: ' + e.message); });
}

function canPayMonthly() { if (!E.datos) return false; return E.datos.necesitaPatines.toLowerCase() === 'no' && E.datos.necesitaProtecciones.toLowerCase() === 'no'; }
function necesitaEquipo() { return !canPayMonthly(); }

function actualizarTextosPago() {
  var necesitaEquipamiento = !canPayMonthly();
  document.getElementById('s4-label').textContent = E.reagendando ? 'Reagendar clase' : 'Paso 1 de 2';
  document.getElementById('s4-titulo').textContent = necesitaEquipamiento ? 'Próximos entrenamientos' : '¿Cómo quieres pagar?';
  document.getElementById('chk-pago-texto').textContent = canPayMonthly() ? 'Ya realicé mi pago y entiendo este estará pendiente hasta que sea verificada por el equipo.' : 'Realicé mi pago y entiendo que mi reserva quedará pendiente.';
}

function selTipoPago(tipo) {
  E.tipoPago = tipo;
  document.getElementById('opcion-tipo-clase').classList.toggle('active', tipo === 'clase');
  document.getElementById('opcion-tipo-mensual').classList.toggle('active', tipo === 'mensual');
  var listaFechas = document.getElementById('lista-fechas');
  var subtitulo = document.getElementById('s4-fechas-subtitulo');
  var wrapperMeses = document.getElementById('s4-meses-wrapper');
  if (tipo === 'mensual') {
    if (listaFechas) listaFechas.style.display = 'none';
    if (subtitulo) subtitulo.style.display = 'none';
    if (wrapperMeses) wrapperMeses.style.display = 'block';
    generarMeses();
  } else {
    if (listaFechas) listaFechas.style.display = 'block';
    if (subtitulo) subtitulo.style.display = 'block';
    if (wrapperMeses) wrapperMeses.style.display = 'none';
  }
  _updateTpSlider(true);
  actualizarTextosPago();
  actualizarTotalS4();
  var cuponWrap = document.getElementById('s4-cupon-wrapper');
  if (cuponWrap) cuponWrap.style.display = (tipo === 'clase' && tieneCuponDisponible()) ? 'block' : 'none';
}

function _updateTpSlider(animate) {
  var tipo = E.tipoPago;
  var slider = document.getElementById('tp-slider');
  var activeOpt = document.getElementById(tipo === 'clase' ? 'opcion-tipo-clase' : 'opcion-tipo-mensual');
  if (!slider || !activeOpt) return;
  if (animate) {
    slider.classList.add('animado');
  } else {
    slider.classList.remove('animado');
  }
  slider.style.width = activeOpt.offsetWidth + 'px';
  slider.style.transform = 'translateX(' + activeOpt.offsetLeft + 'px)';
}

function toggleCupon(cb) {
  E.cuponAplicado = cb.checked;
  var circle = document.getElementById('cupon-circle');
  if (circle) circle.classList.toggle('sel-cupon', cb.checked);
  actualizarTotalS4();
  actualizarTextosPago();
}

function actualizarTotalS4() {
  var total = 0, gratisCredito = 0, gratisCupon = 0, cobradas = 0;
  E.creditosUsados = 0;
  var bannerCred = document.getElementById('s4-credito-banner');

  if (E.tipoPago === 'mensual') {
    var mesesSeleccionados = Array.from(document.querySelectorAll('#lista-meses-unificada input:checked')).map(function(cb) { return cb.value; });
    E.meses = mesesSeleccionados;
    total = mesesSeleccionados.length * E.precioMensual;
    document.getElementById('s4-meses-wrapper').style.display = 'block';
    if (bannerCred) bannerCred.style.display = 'none';
  } else {
    document.getElementById('s4-meses-wrapper').style.display = 'none';
    E.meses = [];
    var creditos = contarCreditos();
    gratisCredito = Math.min(creditos, E.fechas.length);
    gratisCupon   = (E.cuponAplicado && E.fechas.length > gratisCredito) ? 1 : 0;
    cobradas      = Math.max(0, E.fechas.length - gratisCredito - gratisCupon);
    total         = cobradas * E.precioPorClase;
    E.creditosUsados = gratisCredito;

    if (bannerCred) {
      if (creditos > 0) {
        bannerCred.style.display = 'block';
        bannerCred.innerHTML = '🔁 Tienes <strong>' + creditos + (creditos === 1 ? ' clase a favor' : ' clases a favor') + '</strong> por entrenamientos cancelados. ' +
          (gratisCredito > 0
            ? 'Se ' + (gratisCredito === 1 ? 'aplicó 1 clase gratis a esta reserva ✅' : 'aplicaron ' + gratisCredito + ' clases gratis a esta reserva ✅')
            : 'Se descontará automáticamente al seleccionar fechas.');
      } else { bannerCred.style.display = 'none'; }
    }
  }

  E.totalPago = total;

  var box = document.getElementById('s4-total-box');
  if (E.tipoPago === 'clase' && (gratisCredito > 0 || gratisCupon > 0) && E.fechas.length > 0) {
    var partes = [];
    if (gratisCredito > 0) partes.push('🔁 ' + gratisCredito + (gratisCredito === 1 ? ' clase a favor' : ' clases a favor'));
    if (gratisCupon > 0) partes.push('🎟️ 1 clase con cupón');
    box.style.display = 'block';
    box.innerHTML = '<div class="total-box" style="background:var(--green-light);border-color:var(--success);">' +
      '<div style="color:var(--green-dark);">' + partes.join(' + ') + '</div>' +
      '<div style="font-size:1.6rem;font-weight:800;color:var(--success-dark);">$' + total.toFixed(2) + '</div>' +
      (cobradas > 0
        ? '<div style="font-size:0.8rem;color:var(--success-bright);">' + cobradas + ' clase' + (cobradas > 1 ? 's' : '') + ' × $' + E.precioPorClase.toFixed(2) + '</div>'
        : '<div style="font-size:0.8rem;color:var(--success-bright);">Sin costo ✓</div>') +
      '</div>';
  } else if (total > 0) {
    box.style.display = 'block';
    box.innerHTML = '<div class="total-box"><div>Total:</div><div style="font-size:1.6rem;font-weight:800;">$' + total.toFixed(2) + '</div></div>';
  } else {
    box.style.display = 'none';
  }
}

function cargarFechas() {
  mostrarCargando('Verificando próximas fechas...');
  var d = E.datos; var talla = d.necesitaPatines.toLowerCase() !== 'no' ? d.talla : '';
  api({ action: 'getFechasDisponibles', nombre: E.nombre, talla: talla, necesitaProtecciones: d.necesitaProtecciones }, function(fechas) {
    var disponibles = fechas.filter(function(f) { return f.disponible; });
    var html = '';
    var fechasAChequearTalla = [];
    if (fechas.length === 0) { html = '<p style="color:var(--muted);text-align:center;">No hay fechas disponibles.</p>'; } else {
      fechas.forEach(function(f) {
        var partes = f.fecha.split(' - ');
        var fechaTexto = (partes[0] || f.fecha).trim();
        var hora = f.hora || (partes[1] ? partes[1].trim() : '');
        var lugar = f.lugar || (partes[2] ? partes[2].trim() : '');
        var hasInfo = !!(f.descripcion || f.mapsUrl || f.horaFin || f.duracion);
        var fechaEsc = f.fecha.replace(/'/g, "\\'");

        var pillsHtml = '<div class="fi-pills">';
        if (hora) pillsHtml += '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + hora + '</span>';
        if (lugar) pillsHtml += '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>';
        pillsHtml += '</div>';

        if (f.disponible) {
          var slugFecha = f.fecha.replace(/\s/g,'_');
          if (talla) fechasAChequearTalla.push({ fecha: f.fecha, slug: slugFecha });
          html += '<div class="fecha-item" id="fi-' + slugFecha + '">';
          html += '<span class="badge badge-pendiente" id="fi-badge-' + slugFecha + '" style="display:none;position:absolute;top:8px;right:8px;"><span class="material-symbols-outlined" style="font-size:0.85rem;">priority_high</span></span>';
          html += '<div class="fi-header" onclick="manejarClickFecha(this.closest(\'.fecha-item\'),\'' + fechaEsc + '\',\'' + slugFecha + '\')">';
          html += '<div class="fi-content"><div class="fi-title">' + fechaTexto + '</div>' + pillsHtml + '</div>';
          html += '<div class="fi-circle"><span class="material-symbols-outlined">check</span></div>';
          html += '<input type="checkbox" name="fecha" value="' + f.fecha + '" style="display:none">';
          html += '</div>';
          if (hasInfo) {
            html += '<div class="fi-footer" onclick="toggleFechaExpand(this,event)">';
            html += '<span class="fi-footer-label">Más información</span>';
            html += '<span class="material-symbols-outlined fi-footer-chevron">expand_more</span>';
            html += '</div>';
            html += '<div class="fi-body"><div class="fi-body-inner">';
            if (f.descripcion) html += '<p class="fi-desc">' + f.descripcion + '</p>';
            html += '<div class="fi-extra">';
            if (f.mapsUrl) html += '<a class="fi-pill fi-pill-maps" href="' + f.mapsUrl + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><span class="material-symbols-outlined">near_me</span>Cómo llegar</a>';
            if (f.horaFin) html += '<span class="fi-pill fi-pill-fin"><span class="material-symbols-outlined">schedule</span>Fin ' + f.horaFin + '</span>';
            if (f.duracion) html += '<span class="fi-pill fi-pill-dur"><span class="material-symbols-outlined">timer</span>' + f.duracion + '</span>';
            html += '</div></div></div>';
          }
          html += '</div>';
          html += '<div class="fi-conflicto-talla" id="fi-conflicto-' + slugFecha + '" style="display:none;font-size:0.75rem;margin:-4px 0 10px 6px;"></div>';
        } else {
          var fechaEscAgot = f.fecha.replace(/'/g, "\\'");
          var razonEsc = (f.razon || '').replace(/'/g, "\\'");
          html += '<div class="fecha-item agotada-pendiente" id="fi-' + fechaEscAgot.replace(/\s/g,'_') + '">';
          html += '<div class="fi-header" onclick="inscFechaAgotadaClick(this,\'' + fechaEscAgot + '\',\'' + razonEsc + '\')">';
          html += '<div class="fi-content"><div class="fi-title">' + fechaTexto + '</div>' + pillsHtml + '<div class="fecha-razon">⚠ ' + f.razon + '</div></div>';
          html += '<div class="fi-circle"><span class="material-symbols-outlined">check</span></div>';
          html += '</div></div>';
        }
      });
    }
    document.getElementById('lista-fechas').innerHTML = html; E.fechas = []; E.tallasPorFecha = {}; _conflictosTalla = {};
    fechasAChequearTalla.forEach(function(item) { _chequearTallaFecha(item.fecha, item.slug); });
    var puedeMensual = canPayMonthly() && !E.reagendando; var wrapper = document.getElementById('s4-tipo-pago-wrapper'); var subtitulo = document.getElementById('s4-fechas-subtitulo');
    if (puedeMensual) {
      wrapper.style.display = 'block';
      E.tipoPago = 'mensual';
      document.getElementById('opcion-tipo-clase').classList.remove('active');
      document.getElementById('opcion-tipo-mensual').classList.add('active');
      if (document.getElementById('lista-fechas')) document.getElementById('lista-fechas').style.display = 'none';
      if (subtitulo) subtitulo.style.display = 'none';
      if (document.getElementById('s4-meses-wrapper')) document.getElementById('s4-meses-wrapper').style.display = 'block';
      generarMeses();
      actualizarTotalS4();
    } else {
      wrapper.style.display = 'none'; E.tipoPago = 'clase'; subtitulo.textContent = E.reagendando ? 'Seleccioná la nueva fecha para tu clase a favor.' : 'Selecciona uno o varios entrenamientos.';
      subtitulo.style.display = 'block'; document.getElementById('lista-fechas').style.display = 'block';
      document.getElementById('s4-total-box').style.display = 'none'; document.getElementById('s4-meses-wrapper').style.display = 'none';
      document.querySelectorAll('#lista-meses-unificada input').forEach(function(cb) { cb.checked = false; }); E.meses = []; E.totalPago = 0;
      if (disponibles.length === 0) { err('err-s4', 'No hay cupos disponibles actualmente.'); }
    }
    actualizarTextosPago();
    var cuponWrap = document.getElementById('s4-cupon-wrapper'); var chkCupon = document.getElementById('chk-cupon');
    if (cuponWrap) cuponWrap.style.display = (E.tipoPago === 'clase' && tieneCuponDisponible()) ? 'block' : 'none';
    var icoCupon = document.getElementById('tp-cupon-ico');
    var hintCupon = document.getElementById('tp-cupon-hint');
    var tieneCupon = tieneCuponDisponible();
    if (icoCupon) icoCupon.style.display = tieneCupon ? 'inline-flex' : 'none';
    if (hintCupon) hintCupon.classList.toggle('visible', tieneCupon);
    if (chkCupon) chkCupon.checked = false; E.cuponAplicado = false;
    var agotadasEquip = fechas.filter(function(f) {
      return !f.disponible && f.razon && /patines|talla|protec|equip/i.test(f.razon);
    });
    // Modal viejo deshabilitado: reemplazado por el modal por-card #modal-agotada-overlay (inscFechaAgotadaClick)
    // if (agotadasEquip.length > 0) {
    //   setTimeout(function() { mostrarModalEquip(agotadasEquip); }, 300);
    // }
    window._nuevxCargandoFechas = false;
    ocultarCargando(); ir('s4');
    if (puedeMensual) {
      setTimeout(function() { _updateTpSlider(false); }, 50);
    }
    setTimeout(function() {
      if (!_yaVioModal('reserva') && document.getElementById('s4').classList.contains('activa')) {
        mostrarModalInfoReserva(function(){});
      }
    }, 400);
  }, function(e) { window._nuevxCargandoFechas = false; ocultarCargando(); ir('s-home'); alert('Error cargarFechas: ' + e.message); });
}

function toggleFecha(el, fecha) {
  var chk = el.querySelector('input[type="checkbox"]');
  chk.checked = !chk.checked;
  el.classList.toggle('sel', chk.checked);
  E.fechas = Array.from(document.querySelectorAll('input[name="fecha"]:checked')).map(function(c) { return c.value; });
  actualizarTotalS4();
}

function manejarClickFecha(el, fecha, slug) {
  if (_conflictosTalla[fecha] && !E.tallasPorFecha[fecha]) {
    abrirSheetTallaNuevaReserva(fecha, E.datos.talla, slug);
    return;
  }
  toggleFecha(el, fecha);
}

function _chequearTallaFecha(fecha, slug) {
  api({ action: 'getTallasDisponiblesParaFecha', fecha: fecha, nombreExcluir: E.nombre }, function(tallas) {
    var t = (tallas || []).find(function(x) { return x.talla === E.datos.talla; });
    if (t && !t.disponible) { _conflictosTalla[fecha] = true; _mostrarConflictoTalla(slug, E.datos.talla); }
  }, function() { /* falla de red: se trata como sin conflicto detectado, no bloquea la selección */ });
}

function _mostrarConflictoTalla(slug, talla) {
  var badge = document.getElementById('fi-badge-' + slug);
  var texto = document.getElementById('fi-conflicto-' + slug);
  if (badge) { badge.style.display = 'inline-flex'; badge.style.animation = 'fadeIn 0.3s ease'; }
  if (texto) {
    texto.textContent = 'Talla ' + talla + ' no disponible — selecciona el evento para cambiar la talla en esta fecha';
    texto.style.color = 'var(--warning)';
    texto.style.display = 'block';
    texto.style.animation = 'fadeIn 0.3s ease';
  }
}

function _resolverConflictoTalla(slug, talla) {
  var badge = document.getElementById('fi-badge-' + slug);
  var texto = document.getElementById('fi-conflicto-' + slug);
  if (badge) { badge.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(function() { badge.style.display = 'none'; }, 300); }
  if (texto) {
    texto.textContent = 'Talla ' + talla + ' asignada para este día';
    texto.style.color = 'var(--success-dark)';
    texto.style.animation = 'fadeIn 0.3s ease';
  }
}

function abrirSheetTallaNuevaReserva(fecha, tallaActual, slug) {
  _tallaSheetModo = 'nueva-reserva';
  _tallaSheetSlug = slug;
  var titulo = document.getElementById('sheet-talla-titulo');
  if (titulo) titulo.textContent = 'Elegir talla para el ' + fecha;
  var btn = document.getElementById('btn-confirmar-talla');
  if (btn) btn.textContent = 'Usar esta talla para este día';
  _abrirSheetTallaBase(fecha, tallaActual);
}

function _confirmarTallaNuevaReserva() {
  var fecha = _tallaSheetFecha, talla = _tallaSheetSel, slug = _tallaSheetSlug;
  E.tallasPorFecha[fecha] = talla;
  delete _conflictosTalla[fecha];
  _resolverConflictoTalla(slug, talla);
  cerrarSheetTalla();
  var card = document.getElementById('fi-' + slug);
  if (card && !card.classList.contains('sel')) { toggleFecha(card, fecha); }
}

function toggleFechaExpand(footer, event) {
  event.stopPropagation();
  footer.closest('.fecha-item').classList.toggle('open');
}

function inscFechaAgotadaClick(el, fecha, razon) {
  var card = el.closest('.fecha-item');
  if (!card || card.classList.contains('agotada')) return;
  abrirModalAgotada(razon, function() {
    card.classList.remove('agotada-pendiente');
    card.classList.add('agotada');
    el.onclick = null;
  });
}

function abrirModalAgotada(razon, onCerrar) {
  var overlay = document.getElementById('modal-agotada-overlay');
  var msg = document.getElementById('modal-agotada-msg');
  if (!overlay || !msg) return;
  msg.textContent = razon || 'No hay disponibilidad para esta fecha con tu configuración actual.';
  overlay.style.display = 'flex';
  requestAnimationFrame(function() { overlay.style.opacity = '1'; });
  window._modalAgotadaCb = onCerrar;
}

function cerrarModalAgotada() {
  var overlay = document.getElementById('modal-agotada-overlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  setTimeout(function() { overlay.style.display = 'none'; }, 300);
  if (typeof window._modalAgotadaCb === 'function') {
    window._modalAgotadaCb();
    window._modalAgotadaCb = null;
  }
}

function mostrarModalEquip(fechasAfectadas) {
  var lista = document.getElementById('modal-equip-lista');
  if (!lista) return;
  lista.innerHTML = fechasAfectadas.map(function(f) {
    return '<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:0.8rem;">' +
      '<div style="font-weight:700;color:var(--text);margin-bottom:3px;">' + f.fecha + '</div>' +
      '<div style="color:var(--brand);font-weight:600;">⚠ ' + f.razon + '</div>' +
      '</div>';
  }).join('');
  var modal = document.getElementById('modal-equip-aviso');
  if (modal) modal.style.display = 'flex';
}

function cerrarModalEquip() {
  var modal = document.getElementById('modal-equip-aviso');
  if (modal) modal.style.display = 'none';
}

function irEditarEquipDesdeModal() {
  cerrarModalEquip();
  irEditarDatos();
}

function continuar_s4() {
  if (E.tipoPago === 'mensual') { if (!E.meses || E.meses.length === 0) { err('err-s4', 'Por favor selecciona al menos un mes.'); return; } }
  else { if (!E.fechas || E.fechas.length === 0) { err('err-s4', 'Por favor selecciona al menos una fecha.'); return; } }
  var esClase = E.tipoPago === 'clase';
  document.getElementById('s-pago-total-monto').textContent = 'Total: $' + (E.totalPago || 0).toFixed(2);

  var detalleTexto = '';
  if (esClase) {
    var partesDet = [];
    if (E.creditosUsados > 0) partesDet.push('🔁 ' + E.creditosUsados + (E.creditosUsados === 1 ? ' clase a favor' : ' clases a favor'));
    var conCupon = E.cuponAplicado && E.fechas.length > (E.creditosUsados || 0);
    if (conCupon) partesDet.push('🎟️ 1 clase con cupón');
    var cobradasDet = E.fechas.length - (E.creditosUsados || 0) - (conCupon ? 1 : 0);
    if (cobradasDet > 0) partesDet.push(cobradasDet + (cobradasDet === 1 ? ' clase' : ' clases') + ' × $' + E.precioPorClase.toFixed(2));
    detalleTexto = partesDet.join(' + ');
  } else {
    detalleTexto = E.meses.join(', ');
  }
  document.getElementById('s-pago-total-detalle').textContent = detalleTexto;
  var totalFechasEl = document.getElementById('s-pago-total-fechas');
  if (totalFechasEl) {
    if (esClase) { totalFechasEl.innerHTML = E.fechas.map(function(f) { return '• ' + f; }).join('<br>'); totalFechasEl.style.display = 'block'; }
    else { totalFechasEl.style.display = 'none'; }
  }
  document.getElementById('chk-pago').checked = false; document.getElementById('btn-pago').disabled = true;
  var lineasFechas = E.tipoPago === 'mensual' ? 'Meses pagados:\n- ' + E.meses.join('\n- ') + '\n\nTotal: $' + (E.totalPago || 0).toFixed(2) : E.fechas.map(function(f) { return '- ' + f; }).join('\n');
  var d = E.datos; var talla = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no') ? d.talla : ''; var protec = (d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no') ? d.necesitaProtecciones : '';
  var equipLinea = (talla && protec && protec.toLowerCase() !== 'no') ? 'Necesitare patines talla ' + talla + ' y protecciones.' : (talla) ? 'Necesitare patines talla ' + talla + '.' : (protec && protec.toLowerCase() !== 'no') ? 'Necesitare protecciones (' + protec + ').' : 'Llevare mi propio equipamiento.';
  var msgWp = '¡Hola! Soy *' + E.nombre + '* y acabo de realizar mi pago de *$' + (E.totalPago || 0).toFixed(2) + '*.\n\n*Clases reservadas:*\n' + lineasFechas + '\n\n' + equipLinea + '\n\nTe envío el comprobante adjunto. Si no lo ves, por favor solicítamelo. ¡Gracias!';
  E.wpUrl = 'https://wa.me/593998690423?text=' + encodeURIComponent(msgWp);
  var btnWpPago = document.getElementById('btn-wp-pago'); if (btnWpPago) btnWpPago.href = E.wpUrl;
  if ((E.cuponAplicado || E.creditosUsados > 0) && E.totalPago === 0) {
    E.notaPago = E.creditosUsados > 0
      ? 'Clase(s) a favor por entrenamiento cancelado' + (E.cuponAplicado ? ' + cupón' : '')
      : 'Cupón clase gratis';
    confirmarReserva(document.getElementById('btn-s4-continuar')); return;
  }
  ir('s-pago');
}

function toggleBtnPago() {
  document.getElementById('btn-pago').disabled = !document.getElementById('chk-pago').checked;
  var circle = document.getElementById('chk-pago-circle');
  var lbl = document.querySelector('.chk-pago-label');
  if (circle) circle.classList.toggle('sel-pago', document.getElementById('chk-pago').checked);
  if (lbl) lbl.classList.toggle('sel', document.getElementById('chk-pago').checked);
}

function continuar_pago() {
  if (!document.getElementById('chk-pago').checked) { err('err-pago', 'Debes confirmar que realizaste el pago.'); return; }
  E.notaPago = E.nombre || ''; confirmarReserva(document.getElementById('btn-pago'));
}

function confirmarReserva(btn) {
  if (btn) btn.disabled = true;
  mostrarCargando('Guardando tu reserva/pago...');
  var d = E.datos; var talla = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no') ? d.talla : 'No'; var protec = (d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no') ? d.necesitaProtecciones : 'No';

  function finalizar() {
    var fechasStr = E.fechas.length > 0 ? E.fechas.join(', ') : (E.tipoPago === 'mensual' ? 'mensual (sin clases seleccionadas)' : '—');
    api({ action: 'guardarNotaPago', nombre: E.nombre, tipoPago: E.tipoPago, monto: (E.totalPago || 0).toFixed(2), nota: E.notaPago || '—', fechas: fechasStr, talla: talla, protecciones: protec }, function() {}, function() {});
    if (E.creditosUsados > 0) {
      api({ action: 'usarCreditos', nombre: E.nombre, cantidad: E.creditosUsados }, function(){}, function(){});
      var porMarcar = E.creditosUsados;
      (_todasReservas || []).forEach(function(r) {
        if (porMarcar > 0 && r.estado === 'Reagendar') { r.estado = 'Crédito usado'; porMarcar--; }
      });
    }
    var fechasResumen = E.tipoPago === 'mensual' ? E.meses : E.fechas;
    api({ action: 'enviarResumenReservas', nombre: E.nombre, fechas: JSON.stringify(fechasResumen), talla: talla, protecciones: protec, email: E.datos.email || '', montoTotal: (E.totalPago || 0).toFixed(2) }, function() {}, function() {});

    if (E.cuponAplicado) {
      marcarCuponUsadoLocal();
      api({ action: 'marcarCuponUsado', nombre: E.nombre }, function(){}, function(){});
      var bannerCuponUsado = document.getElementById('banner-cupon');
      if (bannerCuponUsado) bannerCuponUsado.style.display = 'none';
    }

    var necesitaPatinesLocal = (E.datos.necesitaPatines || '').toLowerCase() !== 'no' && E.datos.necesitaPatines; var tallaLocal = E.datos.talla || ''; var protecLocal = (E.datos.necesitaProtecciones || '').toLowerCase() !== 'no' ? E.datos.necesitaProtecciones : '';
    var necesitaEquipoLocal = !!necesitaPatinesLocal || !!protecLocal;

    var h = fila('Nombre', E.nombre); h += fila('Tipo de pago', E.tipoPago === 'mensual' ? '📅 Mensual' : '🎟️ Por clase');
    if (E.cuponAplicado || E.creditosUsados > 0) {
      var partesT = [];
      if (E.creditosUsados > 0) partesT.push('🔁 ' + E.creditosUsados + ' a favor');
      if (E.cuponAplicado) partesT.push('🎟️ cupón');
      var textoTotal = (E.totalPago > 0 ? '$' + E.totalPago.toFixed(2) + ' + ' : '$0.00 — ') + partesT.join(' + ');
      h += fila('Total', '<span style="color:var(--success-dark);font-weight:800;">' + textoTotal + '</span>');
    } else {
      h += fila('Total', '<span style="font-weight:800;">$' + (E.totalPago || 0).toFixed(2) + '</span>');
    }
    if (E.tipoPago === 'clase') {
      var fechasConTalla = E.fechas.map(function(f) {
        var tFecha = (E.tallasPorFecha && E.tallasPorFecha[f]) ? E.tallasPorFecha[f] : tallaLocal;
        return '• ' + f + (necesitaPatinesLocal && tFecha ? ' — Talla ' + tFecha : '');
      }).join('<br>');
      h += '<div style="padding: 10px 0; border-bottom: 1px solid var(--border-softest); font-size: 0.9rem; color: inherit;"><div class="r-label" style="margin-bottom: 6px;">Fecha/s:</div><div style="font-weight: 600; color: inherit; line-height: 1.6; text-align: left;">' + fechasConTalla + '</div></div>';
    } else if (E.meses && E.meses.length > 0) {
      h += '<div style="padding: 10px 0; border-bottom: 1px solid var(--border-softest); font-size: 0.9rem; color: inherit;"><div class="r-label" style="margin-bottom: 6px;">Meses pagados:</div><div style="font-weight: 600; color: inherit; line-height: 1.6; text-align: left;">' + E.meses.map(function(m) { return '• ' + m; }).join('<br>') + '</div></div>';
    }
    h += fila('Patines', d.necesitaPatines || 'No'); h += fila('Protecciones', d.necesitaProtecciones); if (E.notaPago) h += fila('Referencia pago', E.notaPago);
    document.getElementById('s6-resumen').innerHTML = h;

    if (E.reagendando) { document.getElementById('s6-titulo').textContent = '🔁 ¡Clase reagendada!'; document.getElementById('s6-texto').innerHTML = 'Tu nueva reserva está <strong>pendiente de confirmación</strong>. Podés ver el estado desde "Mis reservas".'; document.getElementById('s6-texto').style.display = 'block'; }
    else if (necesitaEquipoLocal) { document.getElementById('s6-titulo').textContent = '¡Reserva registrada!'; document.getElementById('s6-texto').style.display = 'none'; } else { document.getElementById('s6-titulo').textContent = '¡Pago registrado!'; document.getElementById('s6-texto').innerHTML = 'Puedes revisar el estado de tu pago desde <strong>"Ver mis reservas"</strong>.'; document.getElementById('s6-texto').style.display = 'block'; }

    var avisoEl = document.getElementById('s6-email-aviso');
    var avisoPagoEl = document.getElementById('s6-aviso-pago');
    var liberarCupoEl = document.getElementById('s6-liberar-cupo');
    var btnWpExito = document.getElementById('btn-wp-exito');
    if (liberarCupoEl) liberarCupoEl.style.display = necesitaEquipoLocal ? 'block' : 'none';
    if (E.totalPago === 0) {
      if (avisoPagoEl) avisoPagoEl.style.display = 'none';
      if (E.reagendando) {
        avisoEl.textContent = '🔁 Clase reagendada. Te avisaremos por correo cuando sea confirmada.';
        avisoEl.style.cssText = 'background:var(--purple-lightest);border:1px solid var(--purple-border-soft);border-radius:12px;padding:16px;font-size:0.9rem;color:var(--dk-purple-mid);margin-bottom:18px;text-align:center;display:block;';
      } else if (E.cuponAplicado) {
        avisoEl.textContent = '🎟️ Tu cupón fue aplicado. ¡Nos vemos en el entrenamiento!';
        avisoEl.style.cssText = 'background:var(--green-light);border:1px solid #bbf7d0;border-radius:12px;padding:16px;font-size:0.9rem;color:var(--green-dark);margin-bottom:18px;text-align:center;box-shadow: 0 4px 12px rgba(34,197,94,0.1);display:block;';
      } else if (E.creditosUsados > 0) {
        avisoEl.textContent = '🔁 Reserva registrada con tus clases a favor. ¡Nos vemos en el entrenamiento!';
        avisoEl.style.cssText = 'background:var(--green-light);border:1px solid #bbf7d0;border-radius:12px;padding:16px;font-size:0.9rem;color:var(--green-dark);margin-bottom:18px;text-align:center;box-shadow: 0 4px 12px rgba(34,197,94,0.1);display:block;';
      } else {
        avisoEl.style.display = 'none';
      }
      if (btnWpExito) btnWpExito.style.display = 'none';
    } else {
      avisoEl.style.display = 'none';
      if (avisoPagoEl) avisoPagoEl.style.display = 'block';
      if (btnWpExito && E.wpUrl) { btnWpExito.href = E.wpUrl; btnWpExito.style.display = 'flex'; }
    }
    E.reagendando = false;
    ocultarCargando(); ir('s6'); setTimeout(lanzarConfetti, 400);
  }

  if (E.tipoPago === 'mensual') {
    var pendientesMeses = E.meses.slice();
    function guardarMesSiguiente() { if (pendientesMeses.length === 0) { finalizar(); return; } var mes = pendientesMeses.shift(); api({ action: 'guardarReserva', nombre: E.nombre, fecha: mes, talla: talla, protecciones: protec, monto: E.precioMensual.toFixed(2), email: E.datos.email || '' }, function() { guardarMesSiguiente(); }, function() { guardarMesSiguiente(); }); }
    guardarMesSiguiente();
  } else {
    var pendientes = E.fechas.slice();
    var gratisRestantes = (E.creditosUsados || 0) + ((E.cuponAplicado && E.fechas.length > (E.creditosUsados || 0)) ? 1 : 0);
    function guardarSiguiente() {
      if (pendientes.length === 0) { finalizar(); return; }
      var fecha = pendientes.shift();
      var montoClase = gratisRestantes > 0 ? '0.00' : E.precioPorClase.toFixed(2);
      if (gratisRestantes > 0) gratisRestantes--;
      var tallaFecha = (E.tallasPorFecha && E.tallasPorFecha[fecha]) ? E.tallasPorFecha[fecha] : talla;
      api({ action: 'guardarReserva', nombre: E.nombre, fecha: fecha, talla: tallaFecha, protecciones: protec, monto: montoClase, email: E.datos.email || '' }, function() { guardarSiguiente(); }, function() { guardarSiguiente(); });
    }
    guardarSiguiente();
  }
}
