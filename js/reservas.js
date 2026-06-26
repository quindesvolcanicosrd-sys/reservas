var E = {
  nombre: '', datos: null,
  conf: '', editPat: '', editTalla: '', editProtec: '',
  fechas: [], tipoPago: 'clase', meses: [],
  precioPorClase: 0, precioMensual: 0,
  totalPago: 0, notaPago: '', wpEnviado: false, wpUrl: '', cuponAplicado: false, creditosUsados: 0, reagendando: false, editandoDesdeHome: false
};

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

function continuar_s3a() {
  if (!E.editPat) { err('err-s3a', 'Por favor selecciona una opción.'); return; }
  if (E.editPat === 'Sí') {
    mostrarCargando('Cargando tallas...');
    api({ action: 'getTallasDisponibles' }, function(tallas) {
      var sel = document.getElementById('sel-talla'); sel.innerHTML = '<option value="">Elige una talla</option>';
      tallas.forEach(function(t) { var o = document.createElement('option'); o.value = o.textContent = t; sel.appendChild(o); });
      ocultarCargando(); ir('s3b');
    }, function(e) { ocultarCargando(); err('err-s3a', 'Error: ' + e.message); });
  } else { E.editTalla = ''; ir('s3c'); }
}

function continuar_s3b() {
  var t = document.getElementById('sel-talla').value;
  if (!t) { err('err-s3b', 'Por favor selecciona una talla.'); return; }
  E.editTalla = t; ir('s3c');
}

function continuar_s3c() {
  if (!E.editProtec) { err('err-s3c', 'Por favor selecciona una opción.'); return; }
  var protecFinal = E.editProtec;
  if (protecFinal === 'Otro') {
    var txt = document.getElementById('txt-otro').value.trim();
    if (!txt) { err('err-s3c', 'Por favor describe qué necesitas.'); return; }
    protecFinal = txt;
  }
  mostrarCargando('Guardando equipamiento...');
  api({ action: 'actualizarEquipamientoPersona', nombre: E.nombre, necesitaPatines: E.editPat, talla: E.editTalla, necesitaProtecciones: protecFinal }, function() {
    ocultarCargando(); E.datos.necesitaPatines = E.editPat; E.datos.talla = E.editTalla; E.datos.necesitaProtecciones = protecFinal; E.conf = '';
    document.querySelectorAll('input[name="conf"]').forEach(function(r) { r.checked = false; r.closest('.opcion').classList.remove('sel'); });
    if (E.editandoDesdeHome) { E.editandoDesdeHome = false; ir('s-home'); } else { cargarFechas(); }
  }, function(e) { ocultarCargando(); err('err-s3c', 'Error al guardar: ' + e.message); });
}

function canPayMonthly() { if (!E.datos) return false; return E.datos.necesitaPatines.toLowerCase() === 'no' && E.datos.necesitaProtecciones.toLowerCase() === 'no'; }
function necesitaEquipo() { return !canPayMonthly(); }

function actualizarTextosPago() {
  var necesitaEquipamiento = !canPayMonthly();
  document.getElementById('s4-label').textContent = E.reagendando ? 'Reagendar clase' : 'Paso 1 de 3';
  document.getElementById('s4-titulo').textContent = necesitaEquipamiento ? 'Próximos entrenamientos' : '¿Cómo quieres pagar?';
  document.getElementById('chk-pago-texto').textContent = canPayMonthly() ? 'Ya realicé mi pago y entiendo este estará pendiente hasta que sea verificada por el equipo.' : 'Ya realicé mi pago y entiendo que mi reserva quedará pendiente hasta que sea verificada por el equipo.';
  document.getElementById('nota-pago-hint').textContent = canPayMonthly() ? 'Escribe tu nombre o referencia así sabemos que el pago corresponde a tí.' : 'Escribe tu nombre o referencia de a quien corresponde la reserva así sabemos que el pago corresponde a tí.';
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

function toggleCupon(cb) { E.cuponAplicado = cb.checked; actualizarTotalS4(); }

function actualizarTotalS4() {
  var total = 0, gratisCredito = 0, gratisCupon = 0, cobradas = 0;
  E.creditosUsados = 0;
  var bannerCred = document.getElementById('s4-credito-banner');

  if (E.tipoPago === 'mensual') {
    var mesesSeleccionados = Array.from(document.querySelectorAll('#lista-meses input:checked, #lista-meses-pasados input:checked')).map(function(cb) { return cb.value; });
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
    box.innerHTML = '<div class="total-box"><div>Total a pagar:</div><div style="font-size:1.6rem;font-weight:800;">$' + total.toFixed(2) + '</div></div>';
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
          html += '<div class="fecha-item">';
          html += '<div class="fi-header" onclick="toggleFecha(this.closest(\'.fecha-item\'),\'' + fechaEsc + '\')">';
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
        } else {
          html += '<div class="fecha-item agotada">';
          html += '<div class="fi-header">';
          html += '<div class="fi-content"><div class="fi-title">' + fechaTexto + '</div>' + pillsHtml + '<div class="fecha-razon">⚠ ' + f.razon + '</div></div>';
          html += '</div></div>';
        }
      });
    }
    document.getElementById('lista-fechas').innerHTML = html; E.fechas = [];
    var puedeMensual = canPayMonthly() && !E.reagendando; var wrapper = document.getElementById('s4-tipo-pago-wrapper'); var subtitulo = document.getElementById('s4-fechas-subtitulo');
    if (puedeMensual) {
      wrapper.style.display = 'block'; selTipoPago('mensual');
      setTimeout(function() { _updateTpSlider(false); }, 30);
    } else {
      wrapper.style.display = 'none'; E.tipoPago = 'clase'; subtitulo.textContent = E.reagendando ? 'Seleccioná la nueva fecha para tu clase a favor.' : 'Selecciona uno o varios entrenamientos a los que asistirás.';
      subtitulo.style.display = 'block'; document.getElementById('lista-fechas').style.display = 'block';
      document.getElementById('s4-total-box').style.display = 'none'; document.getElementById('s4-meses-wrapper').style.display = 'none';
      document.querySelectorAll('#lista-meses input').forEach(function(cb) { cb.checked = false; }); E.meses = []; E.totalPago = 0;
      if (disponibles.length === 0) { err('err-s4', 'No hay cupos disponibles actualmente.'); }
    }
    actualizarTextosPago();
    var cuponWrap = document.getElementById('s4-cupon-wrapper'); var chkCupon = document.getElementById('chk-cupon');
    if (cuponWrap) cuponWrap.style.display = (!puedeMensual && tieneCuponDisponible()) ? 'block' : 'none';
    var icoCupon = document.getElementById('tp-cupon-ico');
    var hintCupon = document.getElementById('tp-cupon-hint');
    var tieneCupon = tieneCuponDisponible();
    if (icoCupon) icoCupon.style.display = tieneCupon ? 'inline-flex' : 'none';
    if (hintCupon) hintCupon.classList.toggle('visible', tieneCupon);
    if (chkCupon) chkCupon.checked = false; E.cuponAplicado = false;
    var agotadasEquip = fechas.filter(function(f) {
      return !f.disponible && f.razon && /patines|talla|protec|equip/i.test(f.razon);
    });
    if (agotadasEquip.length > 0) {
      setTimeout(function() { mostrarModalEquip(agotadasEquip); }, 300);
    }
    ocultarCargando(); ir('s4');
    setTimeout(function() {
      if (!_yaVioModal('reserva') && document.getElementById('s4').classList.contains('activa')) {
        mostrarModalInfoReserva(function(){});
      }
    }, 400);
  }, function(e) { ocultarCargando(); ir('s-home'); alert('Error cargarFechas: ' + e.message); });
}

function toggleFecha(el, fecha) {
  var chk = el.querySelector('input[type="checkbox"]');
  chk.checked = !chk.checked;
  el.classList.toggle('sel', chk.checked);
  E.fechas = Array.from(document.querySelectorAll('input[name="fecha"]:checked')).map(function(c) { return c.value; });
  actualizarTotalS4();
}

function toggleFechaExpand(footer, event) {
  event.stopPropagation();
  footer.closest('.fecha-item').classList.toggle('open');
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
  document.getElementById('s-pago-total-monto').textContent = 'Total a pagar: $' + (E.totalPago || 0).toFixed(2);

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
  document.getElementById('chk-pago').checked = false; document.getElementById('btn-pago').disabled = true; document.getElementById('nota-pago').value = ''; E.wpEnviado = false;
  var lineasFechas = E.tipoPago === 'mensual' ? 'Meses pagados:\n- ' + E.meses.join('\n- ') + '\n\nTotal: $' + (E.totalPago || 0).toFixed(2) : E.fechas.map(function(f) { return '- ' + f; }).join('\n');
  var d = E.datos; var talla = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no') ? d.talla : ''; var protec = (d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no') ? d.necesitaProtecciones : '';
  var equipLinea = (talla && protec && protec.toLowerCase() !== 'no') ? 'Necesitare patines talla ' + talla + ' y protecciones.' : (talla) ? 'Necesitare patines talla ' + talla + '.' : (protec && protec.toLowerCase() !== 'no') ? 'Necesitare protecciones (' + protec + ').' : 'Llevare mi propio equipamiento.';
  var msgWp = '¡Hola! Soy *' + E.nombre + '* y acabo de realizar mi pago de *$' + (E.totalPago || 0).toFixed(2) + '*.\n\n*Clases reservadas:*\n' + lineasFechas + '\n\n' + equipLinea + '\n\nTe envío el comprobante adjunto. Si no lo ves, por favor solicítamelo. ¡Gracias!';
  E.wpUrl = 'https://wa.me/593998690423?text=' + encodeURIComponent(msgWp);
  if ((E.cuponAplicado || E.creditosUsados > 0) && E.totalPago === 0) {
    E.notaPago = E.creditosUsados > 0
      ? 'Clase(s) a favor por entrenamiento cancelado' + (E.cuponAplicado ? ' + cupón' : '')
      : 'Cupón clase gratis';
    construirResumenS5('s4'); ir('s5'); return;
  }
  ir('s-pago');
}

function toggleBtnPago() { document.getElementById('btn-pago').disabled = !document.getElementById('chk-pago').checked; }

function construirResumenS5(backTarget) {
  document.getElementById('btn-confirmar').disabled = false; document.getElementById('btn-confirmar').textContent = necesitaEquipo() ? 'Confirmar mi reserva' : 'Confirmar mi pago';
  document.getElementById('s5-titulo-h2').textContent = necesitaEquipo() ? 'Resumen de tu reserva' : 'Resumen de tu pago'; document.getElementById('s5-liberar-cupo').style.display = necesitaEquipo() ? 'block' : 'none';
  var avisoPago = document.getElementById('s5-aviso-pago'); if(avisoPago) avisoPago.style.display = (E.totalPago === 0) ? 'none' : 'block';
  var d = E.datos; var talla = d.necesitaPatines.toLowerCase() !== 'no' ? d.talla : '';
  var h = '<div class="r-titulo">Tu reserva</div>';
  h += fila('Nombre', E.nombre); h += fila('Tipo de pago', E.tipoPago === 'mensual' ? '📅 Mensual' : '🎟️ Por clase');
  if (E.cuponAplicado || E.creditosUsados > 0) {
    var partesT = [];
    if (E.creditosUsados > 0) partesT.push('🔁 ' + E.creditosUsados + ' a favor');
    if (E.cuponAplicado) partesT.push('🎟️ cupón');
    var textoTotal = (E.totalPago > 0 ? '$' + E.totalPago.toFixed(2) + ' + ' : '$0.00 — ') + partesT.join(' + ');
    h += fila('Total', '<span style="color:var(--success-dark);font-weight:800;">' + textoTotal + '</span>');
  }
  else { h += fila('Total', '<span style="font-weight:800;">$' + (E.totalPago || 0).toFixed(2) + '</span>'); }
  if (E.tipoPago === 'clase') {     h += '<div style="padding: 10px 0; border-bottom: 1px solid var(--border-softest); font-size: 0.9rem; color: inherit;"><div class="r-label" style="margin-bottom: 6px;">Fecha/s:</div><div style="font-weight: 600; color: inherit; line-height: 1.6; text-align: left;">' + E.fechas.map(function(f) { return '• ' + f; }).join('<br>') + '</div></div>';   } else if (E.meses && E.meses.length > 0) {     h += '<div style="padding: 10px 0; border-bottom: 1px solid var(--border-softest); font-size: 0.9rem; color: inherit;"><div class="r-label" style="margin-bottom: 6px;">Meses pagados:</div><div style="font-weight: 600; color: inherit; line-height: 1.6; text-align: left;">' + E.meses.map(function(m) { return '• ' + m; }).join('<br>') + '</div></div>';   }
  h += fila('Patines', d.necesitaPatines + (talla ? ' — Talla ' + talla : '')); h += fila('Protecciones', d.necesitaProtecciones); if (E.notaPago) h += fila('Referencia pago', E.notaPago);
  document.getElementById('s5-resumen').innerHTML = h;
  var s5Back = document.querySelector('#s5 .btn-secondary'); if (s5Back) s5Back.onclick = function() { volver(backTarget || 's-pago'); };
}

function continuar_pago() {
  if (!document.getElementById('chk-pago').checked) { err('err-pago', 'Debes confirmar que realizaste el pago.'); return; }
  E.notaPago = document.getElementById('nota-pago').value.trim(); construirResumenS5('s-pago'); ir('s5');
}

function continuar_pago_y_wp() {
  if (!document.getElementById('chk-pago').checked) { err('err-pago', 'Debes confirmar que realizaste el pago.'); return; }
  var modal = document.getElementById('modal-wp-comprobante');
  var btnWp = document.getElementById('modal-wp-btn');
  if (btnWp && E.wpUrl) btnWp.href = E.wpUrl;
  if (modal) { modal.style.display = 'flex'; }
}
function modalWpEnviado() {
  E.wpEnviado = true;
  var modal = document.getElementById('modal-wp-comprobante');
  if (modal) modal.style.display = 'none';
  continuar_pago();
}
function modalWpSaltear() {
  E.wpEnviado = false;
  var modal = document.getElementById('modal-wp-comprobante');
  if (modal) modal.style.display = 'none';
  continuar_pago();
}

function confirmarReserva() {
  var btn = document.getElementById('btn-confirmar'); btn.disabled = true; mostrarCargando('Guardando tu reserva/pago...');
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
    var equipMsg = necesitaEquipoLocal ? (necesitaPatinesLocal ? 'Patines: Sí (talla ' + (tallaLocal || '?') + ')\n' : '') + (protecLocal ? '· Protecciones: Necesita protecciones (' + protecLocal + ')' : '') : 'Equipamiento propio';
    var fechasHtml = ''; if (E.tipoPago === 'mensual') { fechasHtml = '· Pago mensual ($' + (E.totalPago || 0).toFixed(2) + ')\n' + E.meses.map(function(m) { return '· ' + m; }).join('\n'); } else { fechasHtml = E.fechas.map(function(f) { return '· ' + f; }).join('\n'); }

    document.getElementById('s6-detalle').innerHTML = '<strong>' + E.nombre + '</strong><br><br>' + fechasHtml + '<br><br>· ' + equipMsg;
    if (E.reagendando) { document.getElementById('s6-titulo').textContent = '🔁 ¡Clase reagendada!'; document.getElementById('s6-texto').innerHTML = 'Tu nueva reserva está <strong>pendiente de confirmación</strong>. Podés ver el estado desde "Ver mis reservas".'; }
    else if (necesitaEquipoLocal) { document.getElementById('s6-titulo').textContent = '¡Reserva registrada!'; document.getElementById('s6-texto').innerHTML = 'Puedes revisar el estado desde <strong>"Ver mis reservas"</strong>. Si no puedes venir, cancela para liberar el cupo.'; } else { document.getElementById('s6-titulo').textContent = '¡Pago registrado!'; document.getElementById('s6-texto').innerHTML = 'Puedes revisar el estado de tu pago desde <strong>"Ver mis reservas"</strong>.'; }

    var avisoEl = document.getElementById('s6-email-aviso');
    var btnWpExito = document.getElementById('btn-wp-exito');
    if (E.totalPago === 0) {
      if (E.reagendando) {
        avisoEl.textContent = '🔁 Clase reagendada. Te avisaremos por correo cuando sea confirmada.';
        avisoEl.style.cssText = 'background:var(--purple-lightest);border:1px solid var(--purple-border-soft);border-radius:12px;padding:16px;font-size:0.9rem;color:var(--dk-purple-mid);margin-bottom:18px;text-align:center;';
      } else if (E.cuponAplicado) {
        avisoEl.textContent = '🎟️ Tu cupón fue aplicado. ¡Nos vemos en el entrenamiento!';
        avisoEl.style.cssText = 'background:var(--green-light);border:1px solid #bbf7d0;border-radius:12px;padding:16px;font-size:0.9rem;color:var(--green-dark);margin-bottom:18px;text-align:center;box-shadow: 0 4px 12px rgba(34,197,94,0.1);';
      }
      if (btnWpExito) btnWpExito.style.display = 'none';
    } else {
      var emailText = (E.datos && E.datos.email) ? ' en ' + E.datos.email : '';
      avisoEl.textContent = (E.cuponAplicado ? '🎟️ Cupón aplicado. ' : '') + '⏳ Tu pago está pendiente de verificación. Recibirás un correo' + emailText + ' cuando esté confirmado.';
      avisoEl.style.cssText = 'background:#fffbeb;border:2px solid var(--amber-border);border-radius:10px;padding:14px 16px;font-size:0.9rem;font-weight:500;color:var(--amber-darker);margin-bottom:16px;text-align:center;line-height:1.5;';
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
      api({ action: 'guardarReserva', nombre: E.nombre, fecha: fecha, talla: talla, protecciones: protec, monto: montoClase, email: E.datos.email || '' }, function() { guardarSiguiente(); }, function() { guardarSiguiente(); });
    }
    guardarSiguiente();
  }
}
