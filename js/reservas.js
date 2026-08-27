var E = {
  nombre: '', datos: null,
  conf: '', editPat: '', editTalla: '', editProtec: '',
  fechas: [], tallasPorFecha: {}, tipoPago: 'clase', meses: [],
  precioPorClase: 0, precioMensual: 0,
  totalPago: 0, notaPago: '', wpEnviado: false, wpUrl: '', cuponAplicado: false, creditosUsados: 0, reagendando: false, editandoDesdeHome: false,
  viaEventosInline: false
};

var _conflictosTalla = {};
var _fechasPosibleProtecRiesgo = {};
// id_evento (f.fecha, ver getFechasDisponibles) -> texto legible para mostrar
// en pantalla ("Sábado 15 de Agosto - 13:00hs - Cumandá"). El backend cambió
// `fecha` de texto legible a id_evento (UUID/slug interno) -- ese id sigue
// viajando igual en toggleFecha()/E.fechas/guardarReserva() etc. (así lo
// espera el backend), pero nunca debe mostrarse tal cual en pantalla; este
// mapa (poblado en cargarFechas(), reseteado en cada carga) es la única
// fuente para traducir un id a texto en los pocos lugares que necesitan
// mostrarlo fuera de la card ya renderizada (abrirSheetTallaNuevaReserva(),
// continuar_s4(), confirmarReserva()).
var _fechaInfoDisponible = {};
// Flecha atrás de #s4-nav condicional según el origen (ver "Cambios
// recientes" -- bug real corregido). Seteada por `irNuevaReserva()`/
// `iniciarReagendamiento()` (js/home.js) ANTES de `cargarFechas()`, leída
// por `_s4ActualizarNav()` acá abajo -- independiente de `puedeElegir`
// (esa decide título vs. selector Por clase/Mensual, no si hay o no una
// pantalla previa real a la que volver).
var _s4MostrarAtras = false;
// Pantalla de origen para el botón atrás de s4 -- 's-home' por defecto,
// 's-eventos' cuando se llega desde el timeline (FAB mirlxs).
var _s4OrigenSeccion = 's-home';
// Título "Realiza una reserva" (#s4-titulo-vacio, junto al selector Por
// clase/Mensual) -- visible SOLO cuando se llega a #s4 por el auto-redirect
// de "sin reservas" (`irReservas()`, js/home.js, cuando `activas.length===0`
// llama directo a `irNuevaReserva()` sin pasar por #s-home), no cuando se
// entra manualmente con reservas ya existentes. Mismo punto/mismo cálculo
// que ya usa `_s4MostrarAtras` de arriba (`activas.length`, ver
// `irNuevaReserva()`/`iniciarReagendamiento()`, js/home.js) pero flag propio
// -- se mantienen separados a propósito, aunque hoy resulten equivalentes en
// la práctica (la única forma de llegar acá con `activas.length===0` es este
// auto-redirect): `_s4MostrarAtras` es sobre la flecha atrás, un concepto
// distinto que no debería acoplarse a esto solo porque hoy coincida.
var _s4VacioAutoRedirect = false;

// "2026-08-15" -> "Sábado 15 de Agosto". Reusa _EV_DIAS_LARGOS/NOMBRES_MESES
// (js/eventos.js, js/ui.js -- ya cargados antes que este archivo, ver orden
// de scripts en MANIFEST) en vez de duplicar los arrays de días/meses; misma
// capitalización de mes que ya usaba el texto legible que mandaba el backend
// antes de pasar `fecha` a id_evento, para que el resultado se vea igual.
function _fechaCalendarioATexto(fechaCalendario) {
  if (!fechaCalendario) return '';
  var p = fechaCalendario.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  return _EV_DIAS_LARGOS[d.getDay()] + ' ' + d.getDate() + ' de ' + NOMBRES_MESES[d.getMonth()];
}

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

// Skeleton de #tallas-grid mientras continuar_s3a() espera getTallasDisponibles
// — 4 chips placeholder, mismo shimmer que .fi-skel-block (cargarFechas()).
function _skeletonTallasHtml() {
  return '<div class="equip-talla-pill equip-skel"></div>'.repeat(4);
}

function continuar_s3a() {
  if (!E.editPat) { err('err-s3a', 'Por favor selecciona una opción.'); return; }
  if (E.editPat === 'Sí') {
    // Overlay de pantalla completa reemplazado por skeleton en #tallas-grid:
    // navega a s3b de inmediato, mismo criterio que cargarFechas() (ver
    // MANIFEST, "Cambios recientes"). Un error acá ya no puede mostrarse en
    // #err-s3a (esa pantalla ya no está activa) — pasa a #err-s3b.
    var grid = document.getElementById('tallas-grid');
    grid.innerHTML = _skeletonTallasHtml();
    document.getElementById('sel-talla').value = '';
    ir('s3b');
    api({ action: 'getTallasDisponibles' }, function(tallas) {
      grid.innerHTML = tallas.map(function(t) {
        return '<div class="equip-talla-pill" onclick="selTallaEquip(this,\'' + t + '\')">' + t + '</div>';
      }).join('');
      void grid.offsetWidth; grid.style.animation = 'fadeIn 0.3s ease';
    }, function(e) { err('err-s3b', 'Error: ' + e.message); });
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

function continuar_s3c_nuevo(btn) {
  var protecFinal = E.editProtec;
  if (!protecFinal) { err('err-s3c', 'Por favor selecciona una opción.'); return; }
  // Overlay de pantalla completa reemplazado por spinner inline en el botón
  // — mismo patrón que confirmarReserva() (ver MANIFEST, "Cambios recientes").
  var btnHtmlOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Guardando...'; }
  api({ action: 'actualizarEquipamientoPersona', nombre: E.nombre, necesitaPatines: E.editPat, talla: E.editTalla, necesitaProtecciones: protecFinal }, function() {
    E.datos.necesitaPatines = E.editPat;
    E.datos.talla = E.editTalla;
    E.datos.necesitaProtecciones = protecFinal;
    if (E.editPat === 'Sí' && (E.datos.categoria || '').toLowerCase() === 'quindes') {
      E.datos.categoria = 'Mirlxs';
      api({ action: 'actualizarDatosPersona', nombre: E.nombre, datos: JSON.stringify({ categoria: 'Mirlxs' }) }, function() {}, function(e) { if (window.console) console.warn('reservas: no se pudo actualizar categoría — ' + (e && e.message || 'error')); });
    }
    E.editProtec = '';
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; }
    if (E.editandoDesdeHome) { E.editandoDesdeHome = false; ir('s-datos'); } else { cargarFechas(); }
  }, function(e) { if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; } err('err-s3c', 'Error al guardar: ' + e.message); });
}

function canPayMonthly() { if (!E.datos) return false; var d = E.datos; return (!d.necesitaPatines || d.necesitaPatines.toLowerCase() === 'no') && (!d.necesitaProtecciones || d.necesitaProtecciones.toLowerCase() === 'no'); }
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
  _s4ActualizarNav();
}

// Nav fija de s4 (ver "Cambios recientes", #s4-nav/index.html) -- 2 variantes
// mutuamente excluyentes según `canPayMonthly() && !E.reagendando` (misma
// condición que ya decide `#s4-tipo-pago-wrapper`/el hint de cupón, más
// abajo en cargarFechas()): con el selector Por clase/Mensual centrado (sin
// título ni ícono decorativo) o con el título de siempre (`#s4-titulo`,
// recién poblado arriba), sin cambios de comportamiento respecto al #top-bar
// genérico que usaba esta pantalla antes. Llamada también desde `ir()`
// (js/ui.js) al entrar a 's4' -- `actualizarTextosPago()` no corre
// necesariamente antes de esa primera entrada si `cargarFechas()` (asíncrona)
// todavía no resolvió.
// Bug real corregido (ver "Cambios recientes"): la flecha atrás vivía atada
// a `puedeElegir` (`display:none` fijo en la variante del selector, sin
// importar el origen) -- con reservas activas, el usuario SÍ tiene una
// #s-home real a la que volver aunque le toque ver el selector Por clase/
// Mensual, y sin ellas (redirigido acá sin haber visto #s-home con
// contenido) no la tiene aunque le toque ver el título. Ahora es
// independiente de `puedeElegir`: `_s4MostrarAtras` (seteado por
// `irNuevaReserva()`/`iniciarReagendamiento()`, js/home.js, ANTES de
// `cargarFechas()`) decide la flecha sola; `puedeElegir` sigue decidiendo
// únicamente título vs. selector.
function _s4ActualizarNav() {
  var puedeElegir = canPayMonthly() && !E.reagendando;
  var back = document.getElementById('s4-nav-back');
  var titulo = document.getElementById('s4-titulo');
  var segWrap = document.getElementById('s4-nav-seg-wrap');
  var tituloVacio = document.getElementById('s4-titulo-vacio');
  if (!back || !titulo || !segWrap) return;
  back.style.display = _s4MostrarAtras ? '' : 'none';
  titulo.style.display = puedeElegir ? 'none' : '';
  segWrap.style.display = puedeElegir ? 'flex' : 'none';
  // "Realiza una reserva" (#s4-titulo-vacio): junto al selector, no en su
  // lugar (a diferencia de #s4-titulo, que sí es mutuamente excluyente con
  // el selector) -- solo cuando además se llegó por el auto-redirect de
  // "sin reservas" (ver _s4VacioAutoRedirect, arriba de este archivo).
  if (tituloVacio) tituloVacio.style.display = (puedeElegir && _s4VacioAutoRedirect) ? '' : 'none';
  // Mirlxs: tipo ya elegido antes de entrar a s4 (FAB → mensual,
  // botón inline → clase). Ocultar el selector Por clase/Mensual y mostrar
  // un título fijo -- sin esto, con canPayMonthly()===true (`puedeElegir`)
  // el título quedaba oculto (mutuamente excluyente con el selector, más
  // arriba) Y el selector se ocultaba acá mismo, dejando el nav sin ningún
  // texto real para esta cuenta (bug real, único camino de mirlxs a s4 hoy
  // es el FAB de reserva mensual, ver "Cambios recientes").
  if (_modoUsuario() === 'mirlxs') {
    segWrap.style.display = 'none';
    titulo.textContent = 'Reservas mensuales';
    titulo.style.display = '';
  }
  // #s4-nav-spacer (ver index.html): re-medir siempre acá, no solo al entrar
  // a s4 -- las 2 variantes de #s4-nav (arriba) pueden tener alto distinto y
  // esta función es la única fuente que las togglea, mismo criterio que
  // _sincronizarNavHome()/#home-nav-spacer (js/home.js).
  var nav = document.getElementById('s4-nav');
  var spacer = document.getElementById('s4-nav-spacer');
  if (nav && spacer) spacer.style.height = (nav.offsetHeight + 8) + 'px';
}

// Onclick real de #s4-nav-back (index.html) -- wrapper sobre
// volver(_s4OrigenSeccion || 's-home') para poder sumar side-effects propios
// de la flecha atrás sin tocar el atributo inline. Restaura el FAB "+"
// unificado (#ev-fab-menu, js/eventos.js, ver MANIFEST.md "Cambios
// recientes") que irNuevaReserva() (js/home.js) oculta al entrar al wizard
// -- sin esto, tocar atrás desde s4 dejaba el FAB oculto hasta la próxima
// recarga del timeline, aunque el timeline mismo ya estuviera visible de
// nuevo. También limpia E.quindesPendingRsvpEvento (ver "Cambios recientes"
// -- flujo de gracia de quindes, js/eventos.js): abandonar el wizard acá
// (único botón atrás real de s4) es un cancelar explícito -- sin pago, no
// corresponde auto-marcar "Asistiré" si la persona vuelve a pagar por otro
// camino más adelante en la misma sesión.
function _s4NavBack() {
  E.quindesPendingRsvpEvento = null;
  volver(_s4OrigenSeccion || 's-home');
  if (typeof _evFabUnificadoActualizar === 'function') _evFabUnificadoActualizar();
}

// Bug real corregido (ver "Cambios recientes"): el contenido de abajo
// (lista de fechas vs. bloques de meses) cambiaba de golpe al alternar
// pills -- `display:none/block` instantáneo, sin transición de salida ni
// entrada. Mismo patrón ya estandarizado en la app para este tipo de swap
// de contenido -- reusado, no inventado de cero: fadeOut del contenido
// saliente → swap real (mismo criterio que `_evAntCalRestablecer()`,
// js/eventos.js, "Cambios recientes") + fadeIn del entrante, mismo
// mecanismo (`fadeIn`/`fadeOut`, css/estilos.css) y duración (0.2s) que ya
// usa esa función. El sub-bloque de "Por meses"/"Por período"/"Indefinido"
// en Asistencia anticipada (`_evAntMostrarSubFrecuencia()`, js/eventos.js)
// solo fadea IN el entrante (los otros se ocultan de una, sin fade out
// propio) -- acá se pidió explícito que ambas direcciones animen, así que
// se sigue el criterio más completo, no el más simple de los 2 ya
// existentes.
function selTipoPago(tipo) {
  E.tipoPago = tipo;
  document.getElementById('opcion-tipo-clase').classList.toggle('active', tipo === 'clase');
  document.getElementById('opcion-tipo-mensual').classList.toggle('active', tipo === 'mensual');
  // Feedback inmediato del selector en sí (pill activa + slider deslizante,
  // su propia transition de 0.35s) -- separado a propósito del fade del
  // CONTENIDO de abajo (más abajo): retrasar esto junto con el contenido
  // dejaría el slider bailando 200ms detrás de la pill ya marcada `.active`,
  // un desacople nuevo que no existía antes.
  _updateTpSlider(true);
  var listaFechas = document.getElementById('lista-fechas');
  var wrapperMeses = document.getElementById('s4-meses-wrapper');
  var saliente = (listaFechas && listaFechas.style.display !== 'none') ? listaFechas :
    ((wrapperMeses && wrapperMeses.style.display !== 'none') ? wrapperMeses : null);

  function aplicarSwap() {
    var subtitulo = document.getElementById('s4-fechas-subtitulo');
    if (tipo === 'mensual') {
      if (listaFechas) listaFechas.style.display = 'none';
      if (subtitulo) subtitulo.style.display = 'none';
      if (wrapperMeses) {
        wrapperMeses.style.display = 'block';
        void wrapperMeses.offsetWidth;
        wrapperMeses.style.animation = 'fadeIn 0.2s ease';
      }
      generarMeses();
    } else {
      if (wrapperMeses) wrapperMeses.style.display = 'none';
      if (listaFechas) {
        listaFechas.style.display = 'block';
        void listaFechas.offsetWidth;
        listaFechas.style.animation = 'fadeIn 0.2s ease';
      }
      if (subtitulo) { subtitulo.textContent = _s4SubtituloFechasTexto(); subtitulo.style.display = 'block'; }
    }
    actualizarTextosPago();
    actualizarTotalS4(); // ya llama a _s4SincronizarCuponWrapper() internamente
  }

  if (saliente) {
    saliente.style.animation = 'fadeOut 0.2s ease forwards';
    setTimeout(aplicarSwap, 200);
  } else {
    aplicarSwap();
  }
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
  // Bug real de seguridad corregido (ver MANIFEST, "Cambios recientes"): si el cupón
  // quedó marcado como aplicado (E.cuponAplicado=true) pero tieneCuponDisponible() ya
  // no lo respalda — ej. esta función se vuelve a llamar tras un re-sync de
  // getCuponDisponible con dato fresco que corrige un E.datos.cuponDisponible cacheado
  // desactualizado (sesión restaurada) — la aplicación ya no es válida y no debe seguir
  // contando en el total. Se revierte con quitarCupon(), mismo mecanismo que el botón
  // "Quitar" manual (ya resetea checkbox/circle/total/textos de pago en un solo lugar) —
  // nunca dispara para una aplicación recién exitosa, porque en ese momento
  // tieneCuponDisponible() todavía es true.
  if (E.cuponAplicado && !tieneCuponDisponible()) {
    quitarCupon();
    return;
  }
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

// Skeleton de #lista-fechas mientras cargarFechas() espera la respuesta real
// — 4 tarjetas placeholder con la misma forma que un .fi-header real
// (título + 2 pills + círculo), shimmer vía .fi-skel-block (css/reservas.css).
function _skeletonFechasHtml() {
  var carta = '<div class="fecha-item fi-skeleton"><div class="fi-header">' +
    '<div class="fi-content"><div class="fi-skel-block fi-skel-title"></div>' +
    '<div class="fi-pills"><div class="fi-skel-block fi-skel-pill"></div><div class="fi-skel-block fi-skel-pill"></div></div></div>' +
    '<div class="fi-skel-block fi-skel-circle"></div></div></div>';
  return carta.repeat(4);
}

function cargarFechas() {
  // Overlay de pantalla completa reemplazado por un skeleton contenido en
  // #lista-fechas: navega a s4 de inmediato en vez de esperar la respuesta
  // de getFechasDisponibles (ver MANIFEST, "Cambios recientes"). Se fuerza
  // #lista-fechas visible y se ocultan los wrappers de pago mensual acá
  // mismo (en vez de dejarlos como hayan quedado de una visita anterior a
  // s4 dentro de la misma sesión, ej. veniendo de reagendar) — evita mostrar
  // contenido mensual desactualizado detrás/junto al skeleton; el callback
  // de abajo decide el estado final real una vez que la respuesta llega,
  // exactamente igual que antes.
  //
  // window._cargandoFechasReserva se sigue seteando aunque esta función ya
  // no controle ningún overlay propio — sigue siendo la señal que usa
  // prepararHome() (js/home.js) para no cerrar el loader de boot del flujo
  // ?nuevx=1 (ver auth.js) antes de tiempo; se resetea a `false` en los 2
  // callbacks de abajo, igual que antes.
  window._cargandoFechasReserva = true;
  var wrapperMensualInicial = document.getElementById('s4-tipo-pago-wrapper');
  var mesesWrapperInicial = document.getElementById('s4-meses-wrapper');
  var listaFechasSkelEl = document.getElementById('lista-fechas');
  if (wrapperMensualInicial) wrapperMensualInicial.style.display = 'none';
  if (mesesWrapperInicial) mesesWrapperInicial.style.display = 'none';
  if (listaFechasSkelEl) { listaFechasSkelEl.style.display = 'block'; listaFechasSkelEl.innerHTML = _skeletonFechasHtml(); }
  // Selector Por clase/Mensual (#tp-seg) -- mismo criterio que el skeleton de
  // arriba: se marca "cargando" ANTES de ir('s4') (que ya lo arma completo,
  // real, vía _s4ActualizarNav()) para que no aparezca de golpe contra el
  // resto de la pantalla, todavía shimmerizando. Sin condicionar a
  // canPayMonthly() acá -- si el selector termina oculto (variante título),
  // la clase queda sin efecto visible, no vale la pena duplicar ese cálculo.
  var tpSegSkelEl = document.getElementById('tp-seg');
  if (tpSegSkelEl) tpSegSkelEl.classList.add('tp-seg-cargando');
  ir('s4');
  ocultarCargando();
  // "Realiza una reserva" (#s4-titulo-vacio, junto al selector): ir('s4') ya
  // corrió _s4ActualizarNav() internamente y lo pudo haber mostrado de
  // entrada (su condición no depende de datos async, ver _s4VacioAutoRedirect
  // más arriba) -- se fuerza oculto DESPUÉS, para que no aparezca de golpe
  // junto al selector todavía shimmerizando. actualizarTextosPago() (más
  // abajo, en el callback de éxito, mismo punto donde el selector sale de su
  // propio estado de carga) vuelve a llamar _s4ActualizarNav() y lo revela
  // ahí si corresponde -- sin necesitar su propio fade, ya queda en el mismo
  // frame que el resto.
  var tituloVacioSkelEl = document.getElementById('s4-titulo-vacio');
  if (tituloVacioSkelEl) tituloVacioSkelEl.style.display = 'none';

  var d = E.datos; var talla = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no') ? d.talla : '';
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
    var fechaInfoNueva = {};
    if (fechas.length === 0) { html = '<p style="color:var(--muted);text-align:center;">No hay fechas disponibles.</p>'; } else {
      fechas.forEach(function(f) {
        // `f.fecha` es el id_evento (antes era el texto legible completo) --
        // el texto para mostrar se arma ahora a partir de fechaCalendario
        // (yyyy-MM-dd) + donde + horaInicio, campos nuevos que vienen en la
        // misma respuesta (ver MANIFEST, "Cambios recientes"). `f.fecha` en sí
        // sigue viajando igual en el checkbox/E.fechas/toggleFecha/etc. -- acá
        // solo se usa para escapar el onclick y como key del mapa de texto.
        var fechaLegible = _fechaCalendarioATexto(f.fechaCalendario) || f.fecha;
        var fechaTexto = _formatarFechaRelativa(fechaLegible);
        var hora = f.horaInicio || '';
        var lugar = f.donde || '';
        var hasInfo = !!(f.descripcion || f.mapsUrl || f.horaFin || f.duracion || f.videoInstructivo);
        var fechaEsc = f.fecha.replace(/'/g, "\\'");
        fechaInfoNueva[f.fecha] = fechaLegible + (hora ? ' - ' + hora + 'hs' : '') + (lugar ? ' - ' + lugar : '');

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
            if (f.videoInstructivo) html += '<a class="fi-pill fi-pill-video" href="' + f.videoInstructivo + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><span class="material-symbols-outlined">play_circle</span>Video instructivo</a>';
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
    listaFechasEl.innerHTML = html; E.fechas = []; E.tallasPorFecha = {}; _conflictosTalla = {}; _fechasPosibleProtecRiesgo = {}; _fechaInfoDisponible = fechaInfoNueva;
    if (E._fechaPresel) {
      var _fp = E._fechaPresel;
      E._fechaPresel = null;
      var _slug = _fp.replace(/-/g, '');
      var _fi = document.getElementById('fi-' + _slug);
      if (!_fi) {
        // Intentar buscar por valor del input como fallback
        var _inp = document.querySelector('input[name="fecha"][value="' + _fp + '"]');
        if (_inp) _fi = _inp.closest('.fecha-item');
      }
      if (_fi) { toggleFecha(_fi, _fp); }
    }
    // E._fechasPresel (plural, array -- registro-express/, ver MANIFEST.md):
    // mismo mecanismo que E._fechaPresel de arriba, extendido para marcar
    // varias fechas de una vez (Registro Express permite elegir más de una
    // en su Paso 1) en vez de duplicar la lógica de lookup por slug/fallback.
    if (E._fechasPresel && E._fechasPresel.length) {
      var _fps = E._fechasPresel;
      E._fechasPresel = null;
      _fps.forEach(function(_fp2) {
        var _slug2 = _fp2.replace(/-/g, '');
        var _fi2 = document.getElementById('fi-' + _slug2);
        if (!_fi2) {
          var _inp2 = document.querySelector('input[name="fecha"][value="' + _fp2 + '"]');
          if (_inp2) _fi2 = _inp2.closest('.fecha-item');
        }
        if (_fi2 && !_fi2.classList.contains('sel')) { toggleFecha(_fi2, _fp2); }
      });
    }
    void listaFechasEl.offsetWidth;
    listaFechasEl.style.animation = 'fadeIn 0.3s ease';
    // Selector Por clase/Mensual: sale del estado "cargando" en el mismo
    // instante que el resto del contenido de acá arriba, con el mismo fade
    // (0.3s) -- coordinado, ninguno de los 2 aparece antes que el otro.
    var tpSegListoEl = document.getElementById('tp-seg');
    if (tpSegListoEl && tpSegListoEl.classList.contains('tp-seg-cargando')) {
      tpSegListoEl.classList.remove('tp-seg-cargando');
      void tpSegListoEl.offsetWidth;
      tpSegListoEl.style.animation = 'fadeIn 0.3s ease';
    }
    fechasTallaAgotadaSync.forEach(function(item) {
      _conflictosTalla[item.fecha] = true;
      if (item.riesgoProtec) _fechasPosibleProtecRiesgo[item.fecha] = true;
      _mostrarConflictoTalla(item.slug, talla);
    });
    fechasAChequearTalla.forEach(function(item) { _chequearTallaFecha(item.fecha, item.slug); });
    // E.forzarTipoClase (ver _evFabReservaClase(), js/eventos.js): igual que
    // E.reagendando, se lee UNA vez acá (canPayMonthly() sería true para el
    // perfil que dispara ese flag -- mirlxs con equipo propio, sin patines/
    // protecciones que rentar -- y sin este guard puedeMensual siempre
    // ganaba, pisando E.tipoPago a 'mensual' sin importar qué se hubiera
    // preseteado antes de llamar a cargarFechas()) y se limpia de inmediato
    // para no quedar pegado en la próxima carga real de #s4.
    var forzarClase = E.forzarTipoClase; E.forzarTipoClase = false;
    var puedeMensual = canPayMonthly() && !E.reagendando && !forzarClase; var wrapper = document.getElementById('s4-tipo-pago-wrapper'); var subtitulo = document.getElementById('s4-fechas-subtitulo');
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
    api({ action: 'getCuponDisponible', nombre: E.nombre }, function(res) {
      if (E.datos) E.datos.cuponDisponible = res.cuponDisponible === true;
      if (res.cuponDisponible) localStorage.removeItem('cupon_' + E.nombre);
      _s4SincronizarCuponWrapper();
    }, function() {});
    var agotadasEquip = fechas.filter(function(f) {
      return !f.disponible && f.razon && /patines|talla|protec|equip/i.test(f.razon);
    });
    // Modal viejo deshabilitado: reemplazado por el modal por-card #modal-agotada-overlay (inscFechaAgotadaClick)
    // if (agotadasEquip.length > 0) {
    //   setTimeout(function() { mostrarModalEquip(agotadasEquip); }, 300);
    // }
    window._cargandoFechasReserva = false;
    if (puedeMensual) {
      setTimeout(function() { _updateTpSlider(false); }, 50);
    }
    setTimeout(function() {
      if (!_yaVioModal('reserva') && document.getElementById('s4').classList.contains('activa')) {
        mostrarModalInfoReserva(function(){});
      }
    }, 400);
  }, function(e) {
    window._cargandoFechasReserva = false;
    var tpSegErrEl = document.getElementById('tp-seg');
    if (tpSegErrEl) tpSegErrEl.classList.remove('tp-seg-cargando');
    // getFechasDisponibles falló -- el wizard nunca llega a mostrarse, se
    // saca a la persona de vuelta a s-home. Mismo criterio que _s4NavBack()
    // (arriba, ver ese comentario): salir de s4 sin pagar no debe dejar
    // E.quindesPendingRsvpEvento vivo para un pago no relacionado más tarde.
    E.quindesPendingRsvpEvento = null;
    ir('s-home'); mostrarToast(e.message || 'No se pudieron cargar las fechas disponibles.', 'error');
  });
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
    if (t && !t.disponibles) { _conflictosTalla[fecha] = true; _mostrarConflictoTalla(slug, E.datos.talla); }
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
  if (titulo) titulo.textContent = 'Elegir talla para el ' + (_fechaInfoDisponible[fecha] || fecha);
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
  requestAnimationFrame(function() { requestAnimationFrame(function() { overlay.style.opacity = '1'; }); });
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
      '<div style="font-weight:700;color:var(--text);margin-bottom:3px;">' + (_fechaInfoDisponible[f.fecha] || f.fecha) + '</div>' +
      '<div style="color:var(--brand);font-weight:600;">⚠ ' + f.razon + '</div>' +
      '</div>';
  }).join('');
  var modal = document.getElementById('modal-equip-aviso');
  if (modal) { modal.style.opacity = '0'; modal.style.transition = 'opacity 0.25s ease'; modal.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ modal.style.opacity = '1'; }); }); }
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

// Arma/actualiza TODO lo que depende de E.fechas/E.meses/E.cuponAplicado/
// E.creditosUsados para #s-pago (monto+detalle+desglose, #chk-pago-texto,
// mensaje de WhatsApp post-pago) -- extraído de continuar_s4() para poder
// re-ejecutarse solo (sin re-navegar/re-validar) cuando togglePagoCupon()
// cambia el cupón ya estando en #s-pago, sin duplicar esta lógica una 3ª vez.
function _pagoArmarResumen() {
  var esClase = E.tipoPago === 'clase';
  var detalleTexto = '';
  if (esClase) {
    var partesDet = [];
    if (E.creditosUsados > 0) partesDet.push('🔁 ' + E.creditosUsados + (E.creditosUsados === 1 ? ' clase a favor' : ' clases a favor'));
    var conCupon = E.cuponAplicado && E.fechas.length > (E.creditosUsados || 0);
    if (conCupon) partesDet.push('🎟️ 1 clase con cupón');
    var cobradasDet = E.fechas.length - (E.creditosUsados || 0) - (conCupon ? 1 : 0);
    E.totalPago = cobradasDet * E.precioPorClase;
    if (cobradasDet > 0) partesDet.push(cobradasDet + (cobradasDet === 1 ? ' clase' : ' clases') + ' × $' + E.precioPorClase.toFixed(2));
    detalleTexto = partesDet.join(' + ');
  } else {
    detalleTexto = E.meses.join(', ');
  }
  var fechasHtml = esClase ? E.fechas.map(function(f) { return '• ' + (_fechaInfoDisponible[f] || f); }).join('<br>') : '';
  _pagoTotalActualizar('Total: $' + (E.totalPago || 0).toFixed(2), detalleTexto, fechasHtml, esClase);
  var chkPagoTexto = document.getElementById('chk-pago-texto');
  if (chkPagoTexto) chkPagoTexto.textContent = canPayMonthly() ? 'Ya realicé mi pago y entiendo este estará pendiente hasta que sea verificada por el equipo.' : 'Realicé mi pago y entiendo que mi reserva quedará pendiente.';
  var lineasFechas = E.tipoPago === 'mensual' ? 'Meses pagados:\n- ' + E.meses.join('\n- ') + '\n\nTotal: $' + (E.totalPago || 0).toFixed(2) : E.fechas.map(function(f) { return '- ' + (_fechaInfoDisponible[f] || f); }).join('\n');
  var d = E.datos; var talla = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no') ? d.talla : ''; var protec = (d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no') ? d.necesitaProtecciones : '';
  var equipLinea = (talla && protec && protec.toLowerCase() !== 'no') ? 'Necesitare patines talla ' + talla + ' y protecciones.' : (talla) ? 'Necesitare patines talla ' + talla + '.' : (protec && protec.toLowerCase() !== 'no') ? 'Necesitare protecciones (' + protec + ').' : 'Llevare mi propio equipamiento.';
  var msgWp = '¡Hola! Soy *' + E.nombre + '* y acabo de realizar mi pago de *$' + (E.totalPago || 0).toFixed(2) + '*.\n\n*Clases reservadas:*\n' + lineasFechas + '\n\n' + equipLinea + '\n\nTe envío el comprobante adjunto. Si no lo ves, por favor solicítamelo. ¡Gracias!';
  E.wpUrl = 'https://wa.me/593998690423?text=' + encodeURIComponent(msgWp); // usado por #btn-wp-exito en s6 (finalizar())
}

// Checkbox de #pago-cupon-wrapper (mismo patrón que toggleCupon()/#s4-cupon-wrapper,
// más arriba) -- recalcula in-place (_pagoArmarResumen(), sin volver a llamar
// continuar_s4()/ir('s-pago'): re-navegar solo por tocar un checkbox reabriría
// overlays/history de ir() innecesariamente, y el auto-confirm de "$0" de
// continuar_s4() no debe dispararse solo porque el cupón dejó el total en 0
// mientras la persona todavía está mirando #s-pago, sin haber tocado nada más).
function togglePagoCupon(cb) {
  E.cuponAplicado = cb.checked;
  var circle = document.getElementById('pago-cupon-circle');
  if (circle) circle.classList.toggle('sel-cupon', cb.checked);
  _pagoArmarResumen();
  _pagoSincronizarCuponWrapper();
}

// Gemela de _s4SincronizarCuponWrapper() (más arriba) para #pago-cupon-wrapper
// -- mismo criterio de mostrar/ocultar y mismo auto-revert de seguridad si
// tieneCuponDisponible() ya no respalda un cupón marcado como aplicado.
function _pagoSincronizarCuponWrapper() {
  var w = document.getElementById('pago-cupon-wrapper');
  if (!w) return;
  if (E.cuponAplicado && !tieneCuponDisponible()) {
    E.cuponAplicado = false;
    var chk = document.getElementById('chk-pago-cupon'); if (chk) chk.checked = false;
    var circle = document.getElementById('pago-cupon-circle'); if (circle) circle.classList.remove('sel-cupon');
    _pagoArmarResumen();
  }
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

function continuar_s4() {
  if (E.tipoPago === 'mensual') { if (!E.meses || E.meses.length === 0) { err('err-s4', 'Por favor selecciona al menos un mes.'); return; } }
  else { if (!E.fechas || E.fechas.length === 0) { err('err-s4', 'Por favor selecciona al menos una fecha.'); return; } }
  _pagoArmarResumen();
  _resetChkPago();
  if ((E.cuponAplicado || E.creditosUsados > 0) && E.totalPago === 0) {
    E.notaPago = E.creditosUsados > 0
      ? 'Clase(s) a favor por entrenamiento cancelado' + (E.cuponAplicado ? ' + cupón' : '')
      : 'Cupón clase gratis';
    confirmarReserva(document.getElementById('btn-s4-continuar')); return;
  }
  // #pago-cupon-wrapper (ver "Cambios recientes"): sincroniza checkbox/circle
  // con E.cuponAplicado (por si arrastra un cupón ya aplicado desde #s4) y
  // muestra/oculta el wrapper -- necesario en cada entrada a #s-pago, no solo
  // una vez, porque la ruta inline desde Eventos (_evContinuarReserva(),
  // js/eventos.js) llega acá SIN haber pasado nunca por #s4/cargarFechas(),
  // la única otra pantalla que hoy ofrece aplicar el cupón.
  var chkPagoCuponEl = document.getElementById('chk-pago-cupon');
  if (chkPagoCuponEl) chkPagoCuponEl.checked = E.cuponAplicado;
  var pagoCuponCircleEl = document.getElementById('pago-cupon-circle');
  if (pagoCuponCircleEl) pagoCuponCircleEl.classList.toggle('sel-cupon', E.cuponAplicado);
  _pagoSincronizarCuponWrapper();
  // Dato fresco de getCuponDisponible (mismo patrón ya usado en cargarFechas()/
  // js/home.js) -- cubre el caso de sesión con E.datos.cuponDisponible cacheado
  // desactualizado, que la ruta inline desde Eventos nunca refresca por su cuenta.
  api({ action: 'getCuponDisponible', nombre: E.nombre }, function(res) {
    if (E.datos) E.datos.cuponDisponible = res.cuponDisponible === true;
    if (res.cuponDisponible) localStorage.removeItem('cupon_' + E.nombre);
    _pagoSincronizarCuponWrapper();
  }, function() {});
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
  // Overlay de pantalla completa reemplazado por spinner inline en el botón
  // (mismo patrón .btn-spinner que ya usan adminEnviarNotif()/js/admin.js y
  // mecConfirmar()/js/perfil.js) — la persona se queda viendo s4/s-pago en
  // vez de que se le tape todo (ver MANIFEST, "Cambios recientes"). Se
  // guarda el HTML original del botón (en vez de hardcodear el texto a
  // restaurar, como hacen esos otros 2 call sites) porque esta función
  // recibe 2 botones distintos según el caller (#btn-s4-continuar desde
  // continuar_s4() cuando la reserva es 100% gratis, #btn-pago desde
  // continuar_pago()) — hardcodear un solo string de restauración acoplaría
  // esta función al markup de ambos botones a la vez.
  var btnHtmlOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Guardando...'; }
  var d = E.datos; var talla = (d.necesitaPatines && d.necesitaPatines.toLowerCase() !== 'no') ? d.talla : 'No'; var protec = (d.necesitaProtecciones && d.necesitaProtecciones.toLowerCase() !== 'no') ? d.necesitaProtecciones : 'No';
  var itemsFallidos = []; // fechas/meses cuyo guardarReserva falló
  var erroresPorFecha = {}; // fecha -> mensaje real del backend (o de red), solo para las que fallaron
  var fallosSecundarios = []; // etiquetas de guardarNotaPago/usarCreditos/enviarResumenReservas/marcarCuponUsado que fallaron
  var fechasGratisCredito = []; // fechas marcadas monto:'0.00' por venir de un crédito (no del cupón) — ver finalizar()

  function finalizar() {
    var totalIntentos = E.tipoPago === 'mensual' ? E.meses.length : E.fechas.length;
    if (totalIntentos > 0 && itemsFallidos.length === totalIntentos) {
      if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; }
      mostrarToast('No se pudo guardar tu reserva. Intenta de nuevo.', 'error');
      return;
    }
    var huboFalloParcial = itemsFallidos.length > 0;
    var fechasExitosas = E.fechas.filter(function(f) { return itemsFallidos.indexOf(f) === -1; });
    var mesesExitosos = E.meses.filter(function(m) { return itemsFallidos.indexOf(m) === -1; });

    // Todo lo de acá para abajo hasta "E.reagendando = false" es trabajo
    // POSTERIOR al guardado (ya confirmado exitoso arriba): llamadas
    // secundarias no críticas y armado del resumen de s6. Va envuelto en
    // try/catch porque, si algo de esto tira una excepción (ej. un elemento
    // del DOM que no existe), el throw ocurre dentro del mismo .then() del
    // último guardarReserva() que llamó a finalizar() — sin este try/catch,
    // ese error lo agarra el .catch() de esa misma llamada fetch (js/api.js)
    // y la marca como fallida, pisando el guardado que en realidad SÍ se
    // hizo (bug real: toast de error tras una reserva guardada con éxito).
    // El botón y la navegación a s6 quedan fuera del try para que corran
    // siempre, incluso si algo de acá adentro falla.
    try {
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
      // Solo se marca como consumido el crédito de una fecha que realmente
      // se guardó (ver "Cambios recientes" — antes se marcaban los N créditos
      // de forma incondicional, sin chequear si guardarReserva() de esa fecha
      // puntual había fallado).
      var creditosConfirmados = fechasGratisCredito.filter(function(f) { return itemsFallidos.indexOf(f) === -1; }).length;
      if (creditosConfirmados > 0) {
        var porMarcar = creditosConfirmados;
        (_todasReservas || []).forEach(function(r) {
          if (porMarcar > 0 && r.estado === 'Reagendar') { r.estado = 'Crédito usado'; porMarcar--; }
        });
      }
      if (creditosConfirmados < E.creditosUsados) {
        var fechasCreditoFallidas = fechasGratisCredito.filter(function(f) { return itemsFallidos.indexOf(f) !== -1; });
        var detalleErrorCredito = fechasCreditoFallidas.length === 1 ? (erroresPorFecha[fechasCreditoFallidas[0]] || '') : '';
        var faltantes = E.creditosUsados - creditosConfirmados;
        mostrarToast(
          (faltantes === 1 ? 'No se pudo aplicar tu clase a favor' : 'No se pudieron aplicar ' + faltantes + ' clases a favor') +
          (detalleErrorCredito ? ': ' + detalleErrorCredito : ' para ' + fechasCreditoFallidas.join(', ')) +
          ' — se mantiene disponible para tu próxima reserva.',
          'error'
        );
      }
      secundarioTerminado();
    }
    var fechasResumen = E.tipoPago === 'mensual' ? mesesExitosos : fechasExitosas;
    api({ action: 'enviarResumenReservas', nombre: E.nombre, fechas: JSON.stringify(fechasResumen), talla: talla, protecciones: protec, email: E.datos.email || '', montoTotal: (E.totalPago || 0).toFixed(2) }, function() { secundarioTerminado(); }, function() { fallosSecundarios.push('resumen por email'); secundarioTerminado(); });

    if (E.cuponAplicado) {
      marcarCuponUsadoLocal();
      var bannerCuponUsado = document.getElementById('banner-cupon');
      if (bannerCuponUsado) bannerCuponUsado.style.display = 'none';
      secundarioTerminado();
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
        var info = _fechaInfoDisponible[f] || '';
        // Formato corto DD/MM/YYYY en vez de "Miércoles 26 de Agosto"
        var fechaCorta = (f && /^\d{4}-\d{2}-\d{2}/.test(f))
          ? f.substring(8, 10) + '/' + f.substring(5, 7) + '/' + f.substring(0, 4)
          : f;
        var resto = info ? info.replace(/^[^-]+-\s*/, '') : '';
        var linea = resto ? fechaCorta + ' - ' + resto : (info || f);
        return linea + (necesitaPatinesLocal && tFecha ? ' — Talla ' + tFecha : '');
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
        avisoEl.style.cssText = 'background:var(--green-light);border:1px solid var(--green-border);border-radius:12px;padding:16px;font-size:0.9rem;color:var(--green-dark);margin-bottom:18px;text-align:center;box-shadow: 0 4px 12px var(--success-bg);display:block;';
      } else if (E.creditosUsados > 0) {
        avisoEl.textContent = '🔁 Reserva registrada con tus clases a favor. ¡Nos vemos en el entrenamiento!';
        avisoEl.style.cssText = 'background:var(--green-light);border:1px solid var(--green-border);border-radius:12px;padding:16px;font-size:0.9rem;color:var(--green-dark);margin-bottom:18px;text-align:center;box-shadow: 0 4px 12px var(--success-bg);display:block;';
      } else {
        avisoEl.style.display = 'none';
      }
      if (btnWpExito) btnWpExito.style.display = 'none';
    } else {
      avisoEl.style.display = 'none';
      if (avisoPagoEl) avisoPagoEl.style.display = 'block';
      if (btnWpExito && E.wpUrl) {
        btnWpExito.href = E.wpUrl;
        btnWpExito.style.display = 'flex';
        _wpComprobanteEnviado = false;
        btnWpExito.addEventListener('click', function() { _wpComprobanteEnviado = true; });
      }
    }
    } catch (eUiPosGuardado) {
      console.error('Reserva guardada, pero falló algo posterior al guardado (UI/resumen de s6):', eUiPosGuardado);
    }
    E.reagendando = false;
    // Restaurar el botón acá (no solo en el camino de fallo total de arriba)
    // para que no quede con el spinner/"Guardando..." pegado si la persona
    // vuelve a s4/s-pago más adelante en la misma sesión (ninguna otra
    // función repuebla el innerHTML de estos botones, solo _resetChkPago()
    // vuelve a deshabilitar #btn-pago sin tocar su texto).
    if (btn) { btn.disabled = false; btn.innerHTML = btnHtmlOriginal; }
    // Auto-marcar "Asistiré" tras un pago mensual disparado desde el sheet
    // de cuota pendiente en modo "gracia" (ver _evMarcarAsistencia()/
    // _evCuotaPagarAhora(), js/eventos.js) -- E.quindesPendingRsvpEvento
    // (seteado ahí, sobrevive todo el wizard s4/s-pago sin que
    // irNuevaReserva() lo toque) guarda el evento puntual que quedó
    // bloqueado. apiPost() (js/api.js) es callback-based, no devuelve una
    // Promise -- `.then()` sobre su valor de retorno (undefined) tiraría
    // directo; se usa la misma firma (params, onSuccess, onError) que
    // cualquier otra llamada de este archivo, con `token: _token` explícito
    // (apiPost no lo auto-inyecta como sí hace api() para GET) -- mismo
    // patrón exacto que ya usa _evMarcarAsistencia() (js/eventos.js) para
    // esta misma action. Falla silenciosa (solo console.warn) a propósito:
    // el pago YA se guardó y s6 ya muestra éxito, un error acá no debería
    // alarmar con un toast justo después de esa pantalla -- la persona
    // igual puede marcar "Asistiré" a mano si esto no llegó a aplicarse.
    if (E.tipoPago === 'clase' && E.viaEventosInline && E.fechas && E.fechas.length) {
      var _fechasParaRsvp = E.fechas.slice();
      _fechasParaRsvp.forEach(function(idEvento) {
        apiPost({ action: 'marcarAsistenciaUsuario', token: _token, idEvento: idEvento, estado: 'Asistiré' },
          function() {}, function(e) { if (window.console) console.warn('rsvp clase: ' + (e && e.message || 'error')); });
      });
    }
    if (E.quindesPendingRsvpEvento) {
      var _pId = E.quindesPendingRsvpEvento;
      E.quindesPendingRsvpEvento = null;
      apiPost({ action: 'marcarAsistenciaUsuario', token: _token, idEvento: _pId, estado: 'Asistiré' }, function() {
        var _pEv = (typeof _EV_EVENTOS !== 'undefined' ? _EV_EVENTOS : []).filter(function(e) { return e.id === _pId; })[0];
        if (_pEv) _pEv.miEstado = 'Asistiré';
      }, function(e) {
        if (window.console) console.warn('marcarAsistenciaUsuario (post-pago mensual): ' + (e && e.message || 'error'));
      });
    }
    ir('s6');
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
    // Créditos y cupón se rastrean por separado (antes un solo contador
    // gratisRestantes que los mezclaba) para poder saber, en finalizar(),
    // EXACTAMENTE qué fecha puntual consumió un crédito — los créditos se
    // siguen asignando primero, en el mismo orden que antes.
    var creditosRestantes = E.creditosUsados || 0;
    var cuponRestante = (E.cuponAplicado && E.fechas.length > (E.creditosUsados || 0)) ? 1 : 0;
    function guardarSiguiente() {
      if (pendientes.length === 0) { finalizar(); return; }
      var fecha = pendientes.shift();
      var esGratisCredito = creditosRestantes > 0;
      var esGratisCupon = !esGratisCredito && cuponRestante > 0;
      var montoClase = (esGratisCredito || esGratisCupon) ? '0.00' : E.precioPorClase.toFixed(2);
      if (esGratisCredito) { creditosRestantes--; fechasGratisCredito.push(fecha); }
      else if (esGratisCupon) { cuponRestante--; }
      var tallaFecha = (E.tallasPorFecha && E.tallasPorFecha[fecha]) ? E.tallasPorFecha[fecha] : talla;
      api({ action: 'guardarReserva', nombre: E.nombre, fecha: fecha, talla: tallaFecha, protecciones: protec, monto: montoClase, email: E.datos.email || '' }, function() { guardarSiguiente(); }, function(e) { itemsFallidos.push(fecha); erroresPorFecha[fecha] = (e && e.message) || ''; guardarSiguiente(); });
    }
    guardarSiguiente();
  }
}
