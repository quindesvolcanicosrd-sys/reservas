var E = {
  nombre: '', datos: null,
  conf: '', editPat: '', editTalla: '', editProtec: '',
  fechas: [], tallasPorFecha: {}, tipoPago: 'clase', meses: [],
  precioPorClase: 0, precioMensual: 0,
  totalPago: 0, notaPago: '', wpEnviado: false, wpUrl: '', cuponAplicado: false, creditosUsados: 0, reagendando: false, editandoDesdeHome: false
};

var _conflictosTalla = {};
var _fechasPosibleProtecRiesgo = {};

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
  _registrarOverlayAbierto(cerrarBsProtec);
}

function toggleProtecItem(el) {
  el.classList.toggle('activa');
}

function cerrarBsProtec(porGesto) {
  if (!porGesto) { history.back(); return; }
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

// Texto real de #s4-fechas-subtitulo, contextual (distinto en reagendamiento)
// — usado tanto por cargarFechas() como por selTipoPago() para que el
// elemento nunca quede visible vacío (ver esa nota en index.html).
function _s4SubtituloFechasTexto() {
  return E.reagendando ? 'Seleccioná la nueva fecha para tu clase a favor.' : 'Selecciona uno o varios entrenamientos.';
}

function actualizarTextosPago() {
  var necesitaEquipamiento = !canPayMonthly();
  // "Paso 1 de 2" se quitó (ver MANIFEST, "Cambios recientes" — no aportaba
  // suficiente información para el espacio que ocupaba); #s4-label se oculta
  // por completo salvo en el flujo de reagendamiento, donde sigue siendo un
  // rótulo real ("Reagendar clase"), no un contador de pasos.
  var s4Label = document.getElementById('s4-label');
  if (E.reagendando) { s4Label.textContent = 'Reagendar clase'; s4Label.style.display = ''; }
  else { s4Label.textContent = ''; s4Label.style.display = 'none'; }
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
    if (subtitulo) { subtitulo.textContent = _s4SubtituloFechasTexto(); subtitulo.style.display = 'block'; }
    if (wrapperMeses) wrapperMeses.style.display = 'none';
  }
  _updateTpSlider(true);
  actualizarTextosPago();
  actualizarTotalS4(); // ya llama a _s4SincronizarCuponWrapper() internamente
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
  actualizarTotalS4(); // ya llama a _s4SincronizarCuponWrapper() internamente — oculta el wrapper si quedó aplicado
  actualizarTextosPago();
}

// Undo del cupón desde la líneita "Cupón aplicado ✓" del total fijo (ver
// actualizarTotalS4()) — #s4-cupon-wrapper queda oculto mientras el cupón
// está aplicado, así que sin esto no había forma de deshacerlo una vez
// aplicado salvo recargar la pantalla.
function quitarCupon() {
  E.cuponAplicado = false;
  var chk = document.getElementById('chk-cupon');
  if (chk) chk.checked = false;
  var circle = document.getElementById('cupon-circle');
  if (circle) circle.classList.remove('sel-cupon');
  actualizarTotalS4(); // recalcula sin el descuento y vuelve a mostrar #s4-cupon-wrapper
  actualizarTextosPago();
}

// Muestra/oculta #s4-cupon-wrapper con la animación de colapso (opacity +
// max-height/margin en simultáneo, ver esa regla en css/reservas.css) — única
// fuente de esta decisión, reemplaza los 3 puntos que antes tocaban
// cuponWrap.style.display directo (selTipoPago(), cargarFechas(),
// actualizarTotalS4()). No re-anima si ya está en el estado pedido.
function _s4SincronizarCuponWrapper() {
  var w = document.getElementById('s4-cupon-wrapper');
  if (!w) return;
  var mostrar = E.tipoPago === 'clase' && tieneCuponDisponible() && !E.cuponAplicado;
  var yaVisible = w.classList.contains('mostrar');
  if (mostrar && !yaVisible) {
    w.style.display = 'block';
    requestAnimationFrame(function() { requestAnimationFrame(function() { w.classList.add('mostrar'); }); });
  } else if (!mostrar && yaVisible) {
    w.classList.remove('mostrar');
    setTimeout(function() { if (!w.classList.contains('mostrar')) w.style.display = 'none'; }, 350);
  } else if (!mostrar) {
    w.style.display = 'none';
  }
}

function actualizarTotalS4() {
  var total = 0, gratisCredito = 0, gratisCupon = 0, cobradas = 0;
  E.creditosUsados = 0;
  var bannerCred = document.getElementById('s4-credito-banner');

  if (E.tipoPago === 'mensual') {
    var mesesSeleccionados = Array.from(document.querySelectorAll('#lista-meses-unificada input:checked:not(:disabled)')).map(function(cb) { return cb.value; });
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

  // Líneita "Cupón aplicado ✓" (clickeable, deshace vía quitarCupon()) — mismo
  // color ámbar que el resto de la UI de cupón (var(--amber-dark), ver
  // .s4-cupon-aplicado-linea en css/reservas.css). Solo cuando el cupón está
  // realmente aplicado Y efectivamente contribuyendo al descuento (gratisCupon>0).
  var htmlCupon = (E.cuponAplicado && gratisCupon > 0)
    ? '<div class="s4-cupon-aplicado-linea" onclick="quitarCupon()">🎟️ Cupón aplicado ✓ · Quitar</div>'
    : '';

  var box = document.getElementById('s4-total-fijo');
  var mostrarConGratis = E.tipoPago === 'clase' && (gratisCredito > 0 || gratisCupon > 0) && E.fechas.length > 0;
  var mostrarNormal = !mostrarConGratis && total > 0;
  var mostrarTotal = mostrarConGratis || mostrarNormal;

  var htmlNuevo = '';
  if (mostrarConGratis) {
    var partes = [];
    if (gratisCredito > 0) partes.push('🔁 ' + gratisCredito + (gratisCredito === 1 ? ' clase a favor' : ' clases a favor'));
    if (gratisCupon > 0) partes.push('🎟️ 1 clase con cupón');
    htmlNuevo = '<div class="total-box" style="background:var(--green-light);border-color:var(--success);">' +
      '<div style="color:var(--green-dark);">' + partes.join(' + ') + '</div>' +
      '<div style="font-size:1.6rem;font-weight:800;color:var(--success-dark);">$' + total.toFixed(2) + '</div>' +
      (cobradas > 0
        ? '<div style="font-size:0.8rem;color:var(--success-bright);">' + cobradas + ' clase' + (cobradas > 1 ? 's' : '') + ' × $' + E.precioPorClase.toFixed(2) + '</div>'
        : '<div style="font-size:0.8rem;color:var(--success-bright);">Sin costo ✓</div>') +
      htmlCupon +
      '</div>';
  } else if (mostrarNormal) {
    htmlNuevo = '<div class="total-box"><div>Total:</div><div style="font-size:1.6rem;font-weight:800;">$' + total.toFixed(2) + '</div>' + htmlCupon + '</div>';
  }

  // Entrada/salida animada de #s4-total-fijo (fade + slide sutil, .mostrar en
  // css/reservas.css) — solo transiciona en los cambios reales de visibilidad,
  // no en cada actualización de monto mientras ya está visible (evita re-
  // animar en cada fecha que se selecciona/deselecciona).
  var totalYaVisible = box.classList.contains('mostrar');
  var contenidoActual = box.querySelector('.total-box');
  // Crossfade corto del monto (ver "Cambios recientes"): si el panel ya está
  // visible y el contenido realmente cambió (monto y/o detalle debajo, ej.
  // "1 clase × $5.00" -> "2 clases × $10.00" al agregar/quitar una fecha), no
  // se reemplaza el texto de golpe — _s4TotalCrossfade() hace fade-out del
  // contenido viejo y fade-in del nuevo. El toggle de `.mostrar` del panel
  // entero (abajo) sigue siendo aparte, solo para aparecer/desaparecer el
  // panel completo — no se reinicia en cada cambio de monto.
  if (mostrarTotal && totalYaVisible && contenidoActual && htmlNuevo !== box.innerHTML) {
    _s4TotalCrossfade(box, htmlNuevo);
  } else if (mostrarTotal) {
    // No hay crossfade en curso que deshacer, pero por si el monto volvió a
    // coincidir con el ya mostrado a mitad de un crossfade (ráfaga de
    // clicks), se cancela cualquier fade pendiente y se restaura la opacidad.
    if (_s4TotalFadeTimer) { clearTimeout(_s4TotalFadeTimer); _s4TotalFadeTimer = null; if (contenidoActual) contenidoActual.style.opacity = ''; }
    box.innerHTML = htmlNuevo;
  }

  if (mostrarTotal && !totalYaVisible) {
    box.style.display = 'block';
    requestAnimationFrame(function() { requestAnimationFrame(function() { box.classList.add('mostrar'); }); });
  } else if (!mostrarTotal && totalYaVisible) {
    _s4TotalOcultarFijo(box);
  } else if (!mostrarTotal) {
    box.style.display = 'none';
  }

  _s4SincronizarCuponWrapper();
}

// Timer del crossfade de monto en curso (ver _s4TotalCrossfade) — module-level
// para poder cancelarlo si actualizarTotalS4() se vuelve a llamar antes de que
// termine (ráfaga de fechas agregadas/quitadas seguidas).
var _s4TotalFadeTimer = null;

// Crossfade corto (~180ms totales: 90ms fade-out + 90ms fade-in) del contenido
// de #s4-total-fijo cuando el monto/detalle cambia mientras el panel ya está
// visible — evita el corte seco de reemplazar el texto de un frame al otro.
// Si se llama de nuevo antes de que el fade-out anterior termine (el usuario
// sigue tildando/destildando fechas rápido), se cancela el timer viejo y se
// arranca uno nuevo con el html final — así solo se muestra el valor
// definitivo, nunca un intermedio de una ráfaga de clicks.
function _s4TotalCrossfade(box, htmlNuevo) {
  if (_s4TotalFadeTimer) { clearTimeout(_s4TotalFadeTimer); _s4TotalFadeTimer = null; }
  var actual = box.querySelector('.total-box');
  if (actual) { actual.style.transition = 'opacity 0.09s var(--ease-sheet)'; actual.style.opacity = '0'; }
  _s4TotalFadeTimer = setTimeout(function() {
    _s4TotalFadeTimer = null;
    box.innerHTML = htmlNuevo;
    var nuevo = box.querySelector('.total-box');
    if (nuevo) {
      nuevo.style.transition = 'opacity 0.09s var(--ease-sheet)';
      nuevo.style.opacity = '0';
      requestAnimationFrame(function() { requestAnimationFrame(function() { nuevo.style.opacity = '1'; }); });
    }
  }, 90);
}

// Oculta #s4-total-fijo con su fade-out/slide-down (.mostrar, css/reservas.css)
// en vez de un display:none seco — reusada tanto por actualizarTotalS4()
// (cuando el monto cae a 0 mientras s4 sigue en pantalla) como por el hook de
// ir() (js/ui.js) que anima la salida del panel al abandonar s4 hacia otra
// pantalla (ver "Cambios recientes" — sync con el shared axis X).
function _s4TotalOcultarFijo(box) {
  box.classList.remove('mostrar');
  setTimeout(function() { if (!box.classList.contains('mostrar')) box.style.display = 'none'; }, 350);
}

function cargarFechas() {
  mostrarCargando('Verificando próximas fechas...');
  // Bug real de regresión encontrado y corregido (ver MANIFEST, "Cambios
  // recientes"): mientras este fetch está en curso, el fetch INDEPENDIENTE de
  // prepararHome() (js/home.js, para poblar las cards de Home) puede resolver
  // primero y llamar a su propio ocultarCargando() sin saber que este overlay
  // ya está siendo usado para otra cosa — lo oculta de golpe, revelando Home
  // de nuevo durante el resto de la espera hasta que este fetch finalmente
  // resuelve y llama a ir('s4'). _cargandoFechasReserva (reusada del flujo
  // ?nuevx=1, que ya la seteaba para su propia cadena — ver auth.js) le avisa
  // a prepararHome() que no toque el overlay mientras tanto; se resetea a
  // `false` en los 2 callbacks de abajo, sea cual sea el caller que la puso
  // en `true`.
  window._cargandoFechasReserva = true;
  var d = E.datos; var talla = d.necesitaPatines.toLowerCase() !== 'no' ? d.talla : '';
  var necesitaProtec = d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no';
  function esTallaAgotada(f) {
    return !f.disponible && talla && f.razon &&
      f.razon.trim().toLowerCase() === ('sin patines talla ' + talla + ' disponibles').toLowerCase();
  }
  api({ action: 'getFechasDisponibles', nombre: E.nombre, talla: talla, necesitaProtecciones: d.necesitaProtecciones }, function(fechas) {
    var disponibles = fechas.filter(function(f) { return f.disponible || esTallaAgotada(f); });
    var html = '';
    var fechasAChequearTalla = [];
    var fechasTallaAgotadaSync = [];
    if (fechas.length === 0) { html = '<p style="color:var(--muted);text-align:center;">No hay fechas disponibles.</p>'; } else {
      fechas.forEach(function(f) {
        var partes = f.fecha.split(' - ');
        var fechaTexto = _formatarFechaRelativa((partes[0] || f.fecha).trim());
        var hora = f.hora || (partes[1] ? partes[1].trim() : '');
        var lugar = f.lugar || (partes[2] ? partes[2].trim() : '');
        var hasInfo = !!(f.descripcion || f.mapsUrl || f.horaFin || f.duracion);
        var fechaEsc = f.fecha.replace(/'/g, "\\'");

        var pillsHtml = '<div class="fi-pills">';
        if (hora) pillsHtml += '<span class="fi-pill fi-pill-hora"><span class="material-symbols-outlined">schedule</span>' + hora + '</span>';
        if (lugar) pillsHtml += '<span class="fi-pill fi-pill-lugar"><span class="material-symbols-outlined">location_on</span>' + lugar + '</span>';
        pillsHtml += '</div>';

        var esAgotadaTalla = esTallaAgotada(f);
        if (f.disponible || esAgotadaTalla) {
          var slugFecha = f.fecha.replace(/\s/g,'_');
          if (esAgotadaTalla) {
            fechasTallaAgotadaSync.push({ fecha: f.fecha, slug: slugFecha, riesgoProtec: necesitaProtec });
          } else if (talla) {
            fechasAChequearTalla.push({ fecha: f.fecha, slug: slugFecha });
          }
          html += '<div class="fecha-item" id="fi-' + slugFecha + '">';
          html += '<div class="fi-header" onclick="manejarClickFecha(this.closest(\'.fecha-item\'),\'' + fechaEsc + '\',\'' + slugFecha + '\')">';
          html += '<div class="fi-content"><div class="fi-title">' + fechaTexto + '</div>' + pillsHtml + '</div>';
          html += '<div class="fi-circle"><span class="material-symbols-outlined">check</span></div>';
          html += '<input type="checkbox" name="fecha" value="' + f.fecha + '" style="display:none">';
          html += '</div>';
          html += '<div class="fi-conflicto-talla" id="fi-conflicto-' + slugFecha + '" style="display:none;font-size:0.75rem;padding:0 16px 10px;"></div>';
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
    var listaFechasEl = document.getElementById('lista-fechas');
    listaFechasEl.innerHTML = html; E.fechas = []; E.tallasPorFecha = {}; _conflictosTalla = {}; _fechasPosibleProtecRiesgo = {};
    void listaFechasEl.offsetWidth;
    listaFechasEl.style.animation = 'fadeIn 0.3s ease';
    fechasTallaAgotadaSync.forEach(function(item) {
      _conflictosTalla[item.fecha] = true;
      if (item.riesgoProtec) _fechasPosibleProtecRiesgo[item.fecha] = true;
      _mostrarConflictoTalla(item.slug, talla);
    });
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
      wrapper.style.display = 'none'; E.tipoPago = 'clase'; subtitulo.textContent = _s4SubtituloFechasTexto();
      subtitulo.style.display = 'block'; document.getElementById('lista-fechas').style.display = 'block';
      var totalFijoReset = document.getElementById('s4-total-fijo');
      if (totalFijoReset) { totalFijoReset.classList.remove('mostrar'); totalFijoReset.style.display = 'none'; }
      document.getElementById('s4-meses-wrapper').style.display = 'none';
      document.querySelectorAll('#lista-meses-unificada input').forEach(function(cb) { cb.checked = false; }); E.meses = []; E.totalPago = 0;
      if (disponibles.length === 0) { err('err-s4', 'No hay cupos disponibles actualmente.'); }
    }
    actualizarTextosPago();
    var chkCupon = document.getElementById('chk-cupon');
    var icoCupon = document.getElementById('tp-cupon-ico');
    var hintCupon = document.getElementById('tp-cupon-hint');
    var tieneCupon = tieneCuponDisponible();
    if (icoCupon) icoCupon.style.display = tieneCupon ? 'inline-flex' : 'none';
    if (hintCupon) hintCupon.classList.toggle('visible', tieneCupon);
    if (chkCupon) chkCupon.checked = false; E.cuponAplicado = false;
    _s4SincronizarCuponWrapper();
    var agotadasEquip = fechas.filter(function(f) {
      return !f.disponible && f.razon && /patines|talla|protec|equip/i.test(f.razon);
    });
    // Modal viejo deshabilitado: reemplazado por el modal por-card #modal-agotada-overlay (inscFechaAgotadaClick)
    // if (agotadasEquip.length > 0) {
    //   setTimeout(function() { mostrarModalEquip(agotadasEquip); }, 300);
    // }
    window._cargandoFechasReserva = false;
    ocultarCargando(); ir('s4');
    if (puedeMensual) {
      setTimeout(function() { _updateTpSlider(false); }, 50);
    }
    setTimeout(function() {
      if (!_yaVioModal('reserva') && document.getElementById('s4').classList.contains('activa')) {
        mostrarModalInfoReserva(function(){});
      }
    }, 400);
  }, function(e) { window._cargandoFechasReserva = false; ocultarCargando(); ir('s-home'); mostrarToast(e.message || 'No se pudieron cargar las fechas disponibles.', 'error'); });
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
  var texto = document.getElementById('fi-conflicto-' + slug);
  if (texto) {
    texto.textContent = 'Talla ' + talla + ' no disponible — selecciona el evento para cambiar la talla en esta fecha';
    texto.style.color = 'var(--warning)';
    texto.style.display = 'block';
    texto.style.animation = 'fadeIn 0.3s ease';
  }
}

function _resolverConflictoTalla(slug, talla) {
  var texto = document.getElementById('fi-conflicto-' + slug);
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
  var avisoProtec = document.getElementById('sheet-talla-aviso-protec');
  if (avisoProtec) avisoProtec.style.display = _fechasPosibleProtecRiesgo[fecha] ? 'block' : 'none';
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
  _registrarOverlayAbierto(cerrarModalAgotada);
}

function cerrarModalAgotada(porGesto) {
  if (!porGesto) { history.back(); return; }
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
  if (modal) { modal.style.opacity = '0'; modal.style.transition = 'opacity 0.25s ease'; modal.style.display = 'flex'; requestAnimationFrame(function(){ modal.style.opacity = '1'; }); }
  _registrarOverlayAbierto(cerrarModalEquip);
}

function cerrarModalEquip(porGesto) {
  if (!porGesto) { history.back(); return; }
  var modal = document.getElementById('modal-equip-aviso');
  if (modal) { modal.style.opacity = '0'; setTimeout(function(){ modal.style.display = 'none'; }, 250); }
}

function irEditarEquipDesdeModal() {
  cerrarModalEquip();
  irEditarDatos();
}

// Timer del crossfade de #s-pago-total en curso — mismo criterio que
// _s4TotalFadeTimer (#s4-total-fijo, actualizarTotalS4()): se cancela y
// reemplaza si continuar_s4() se vuelve a llamar antes de que termine (ida y
// vuelta rápida entre s4 y s-pago cambiando de fecha).
var _pagoTotalFadeTimer = null;

// Actualiza el monto/detalle/fechas de #s-pago-total (ver MANIFEST, "Cambios
// recientes") — si el contenido cambió respecto al ya mostrado (ej. volver a
// entrar a s-pago tras cambiar de fecha en s4), hace un crossfade corto
// (~180ms) en vez de reemplazar el texto de golpe; si es la primera vez
// (todavía sin monto) lo aplica directo, sin fade.
function _pagoTotalActualizar(montoTexto, detalleTexto, fechasHtml, mostrarFechas) {
  var elMonto = document.getElementById('s-pago-total-monto');
  var elDetalle = document.getElementById('s-pago-total-detalle');
  var elFechas = document.getElementById('s-pago-total-fechas');
  if (!elMonto) return;
  var grupo = [elMonto, elDetalle, elFechas].filter(function(el) { return !!el; });
  function aplicar() {
    elMonto.textContent = montoTexto;
    if (elDetalle) elDetalle.textContent = detalleTexto;
    if (elFechas) { elFechas.innerHTML = fechasHtml || ''; elFechas.style.display = mostrarFechas ? 'block' : 'none'; }
  }
  var huboAntes = elMonto.textContent !== '';
  var cambio = elMonto.textContent !== montoTexto || (elDetalle && elDetalle.textContent !== detalleTexto);
  if (_pagoTotalFadeTimer) { clearTimeout(_pagoTotalFadeTimer); _pagoTotalFadeTimer = null; }
  if (huboAntes && cambio) {
    grupo.forEach(function(el) { el.style.transition = 'opacity 0.09s var(--ease-sheet)'; el.style.opacity = '0'; });
    _pagoTotalFadeTimer = setTimeout(function() {
      _pagoTotalFadeTimer = null;
      aplicar();
      grupo.forEach(function(el) { el.style.opacity = '0'; });
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          grupo.forEach(function(el) { el.style.transition = 'opacity 0.09s var(--ease-sheet)'; el.style.opacity = '1'; });
        });
      });
    }, 90);
  } else {
    grupo.forEach(function(el) { el.style.opacity = ''; el.style.transition = ''; });
    aplicar();
  }
}

function continuar_s4() {
  if (E.tipoPago === 'mensual') { if (!E.meses || E.meses.length === 0) { err('err-s4', 'Por favor selecciona al menos un mes.'); return; } }
  else { if (!E.fechas || E.fechas.length === 0) { err('err-s4', 'Por favor selecciona al menos una fecha.'); return; } }
  var esClase = E.tipoPago === 'clase';

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
  var fechasHtml = esClase ? E.fechas.map(function(f) { return '• ' + f; }).join('<br>') : '';
  _pagoTotalActualizar('Total: $' + (E.totalPago || 0).toFixed(2), detalleTexto, fechasHtml, esClase);
  _resetChkPago();
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

function _resetChkPago() {
  var chk = document.getElementById('chk-pago'); if (chk) chk.checked = false;
  var btn = document.getElementById('btn-pago'); if (btn) btn.disabled = true;
  var circle = document.getElementById('chk-pago-circle'); if (circle) circle.classList.remove('sel-pago');
  var lbl = document.querySelector('.chk-pago-label'); if (lbl) lbl.classList.remove('sel');
}

function continuar_pago() {
  if (!document.getElementById('chk-pago').checked) { err('err-pago', 'Debes confirmar que realizaste el pago.'); return; }
  E.notaPago = E.nombre || ''; confirmarReserva(document.getElementById('btn-pago'));
}

function confirmarReserva(btn) {
  if (btn) btn.disabled = true;
  mostrarCargando('Guardando tu reserva/pago...');
  var d = E.datos; var talla = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no') ? d.talla : 'No'; var protec = (d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no') ? d.necesitaProtecciones : 'No';
  var itemsFallidos = []; // fechas/meses cuyo guardarReserva falló
  var fallosSecundarios = []; // etiquetas de guardarNotaPago/usarCreditos/enviarResumenReservas/marcarCuponUsado que fallaron

  function finalizar() {
    var totalIntentos = E.tipoPago === 'mensual' ? E.meses.length : E.fechas.length;
    if (totalIntentos > 0 && itemsFallidos.length === totalIntentos) {
      ocultarCargando();
      if (btn) btn.disabled = false;
      mostrarToast('No se pudo guardar tu reserva. Intenta de nuevo.', 'error');
      return;
    }
    var huboFalloParcial = itemsFallidos.length > 0;
    var fechasExitosas = E.fechas.filter(function(f) { return itemsFallidos.indexOf(f) === -1; });
    var mesesExitosos = E.meses.filter(function(m) { return itemsFallidos.indexOf(m) === -1; });

    var secundariosTotal = 2 + (E.creditosUsados > 0 ? 1 : 0) + (E.cuponAplicado ? 1 : 0);
    var secundariosListos = 0;
    function secundarioTerminado() {
      secundariosListos++;
      if (secundariosListos === secundariosTotal && !huboFalloParcial && fallosSecundarios.length > 0) {
        mostrarToast('Reserva guardada. Un detalle no se procesó, contáctanos si algo no cuadra.', 'error');
      }
    }

    var fechasStr = fechasExitosas.length > 0 ? fechasExitosas.join(', ') : (E.tipoPago === 'mensual' ? 'mensual (sin clases seleccionadas)' : '—');
    api({ action: 'guardarNotaPago', nombre: E.nombre, tipoPago: E.tipoPago, monto: (E.totalPago || 0).toFixed(2), nota: E.notaPago || '—', fechas: fechasStr, talla: talla, protecciones: protec }, function() { secundarioTerminado(); }, function() { fallosSecundarios.push('nota de pago'); secundarioTerminado(); });
    if (E.creditosUsados > 0) {
      api({ action: 'usarCreditos', nombre: E.nombre, cantidad: E.creditosUsados }, function(){ secundarioTerminado(); }, function(){ fallosSecundarios.push('créditos a favor'); secundarioTerminado(); });
      var porMarcar = E.creditosUsados;
      (_todasReservas || []).forEach(function(r) {
        if (porMarcar > 0 && r.estado === 'Reagendar') { r.estado = 'Crédito usado'; porMarcar--; }
      });
    }
    var fechasResumen = E.tipoPago === 'mensual' ? mesesExitosos : fechasExitosas;
    api({ action: 'enviarResumenReservas', nombre: E.nombre, fechas: JSON.stringify(fechasResumen), talla: talla, protecciones: protec, email: E.datos.email || '', montoTotal: (E.totalPago || 0).toFixed(2) }, function() { secundarioTerminado(); }, function() { fallosSecundarios.push('resumen por email'); secundarioTerminado(); });

    if (E.cuponAplicado) {
      marcarCuponUsadoLocal();
      api({ action: 'marcarCuponUsado', nombre: E.nombre }, function(){ secundarioTerminado(); }, function(){ fallosSecundarios.push('cupón'); secundarioTerminado(); });
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
      var fechasConTalla = fechasExitosas.map(function(f) {
        var tFecha = (E.tallasPorFecha && E.tallasPorFecha[f]) ? E.tallasPorFecha[f] : tallaLocal;
        return '• ' + f + (necesitaPatinesLocal && tFecha ? ' — Talla ' + tFecha : '');
      }).join('<br>');
      h += '<div style="padding: 10px 0; border-bottom: 1px solid var(--border-softest); font-size: 0.9rem; color: inherit;"><div class="r-label" style="margin-bottom: 6px;">Fecha/s:</div><div style="font-weight: 600; color: inherit; line-height: 1.6; text-align: left;">' + fechasConTalla + '</div></div>';
    } else if (mesesExitosos && mesesExitosos.length > 0) {
      h += '<div style="padding: 10px 0; border-bottom: 1px solid var(--border-softest); font-size: 0.9rem; color: inherit;"><div class="r-label" style="margin-bottom: 6px;">Meses pagados:</div><div style="font-weight: 600; color: inherit; line-height: 1.6; text-align: left;">' + mesesExitosos.map(function(m) { return '• ' + m; }).join('<br>') + '</div></div>';
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
    ocultarCargando(); ir('s6');
    if (huboFalloParcial) {
      mostrarToast('Algunas fechas no se pudieron guardar', 'error');
    } else {
      setTimeout(lanzarConfetti, 400);
    }
  }

  if (E.tipoPago === 'mensual') {
    var pendientesMeses = E.meses.slice();
    function guardarMesSiguiente() { if (pendientesMeses.length === 0) { finalizar(); return; } var mes = pendientesMeses.shift(); api({ action: 'guardarReserva', nombre: E.nombre, fecha: mes, talla: talla, protecciones: protec, monto: E.precioMensual.toFixed(2), email: E.datos.email || '' }, function() { guardarMesSiguiente(); }, function() { itemsFallidos.push(mes); guardarMesSiguiente(); }); }
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
      api({ action: 'guardarReserva', nombre: E.nombre, fecha: fecha, talla: tallaFecha, protecciones: protec, monto: montoClase, email: E.datos.email || '' }, function() { guardarSiguiente(); }, function() { itemsFallidos.push(fecha); guardarSiguiente(); });
    }
    guardarSiguiente();
  }
}
