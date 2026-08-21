/* ══ REGISTRO EXPRESS — Flujo por pasos ═══════════════════════════════
   Mini-SPA hermana de ../inscripcion/ (mismo patrón de pasos/CSS), pero sin
   Google Sign-In: solo nombre + PIN. Por eso vive con sus propias copias
   locales de apiGet()/apiPost()/errMsg() (ver ../inscripcion/inscripcion.js,
   mismo criterio ahí -- esta carpeta tampoco carga js/api.js/js/ui.js). */

var _reNecesitaPatines = '';
var _reNecesitaProtecciones = '';
var _reTipoPago = 'clase';
var _reFechas = [];
var _reNombre = '';
var _rePin = '';
var _reEnviando = false;
var _RE_STEPS = ['re-step-0', 're-step-1', 're-step-2', 're-step-3'];
var _reCurIdx = 0;
var NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* ── Inicialización ─────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  try {
    _reRenderProg();
    reMostrarPaso(0, true);
  } catch (e) {
    console.error('[REGISTRO-EXPRESS] Error en init:', e);
  } finally {
    ocultarCargando();
  }
});

function ocultarCargando() {
  var ov = document.getElementById('loading-overlay');
  if (ov) { ov.style.opacity = '0'; setTimeout(function() { ov.style.display = 'none'; }, 400); }
}
function mostrarCargando(msg) {
  var ov = document.getElementById('loading-overlay');
  var m = document.getElementById('loading-msg');
  if (m) m.textContent = msg || 'Cargando...';
  if (ov) { ov.style.display = 'flex'; ov.style.opacity = '1'; }
}

/* ── Navegación entre pasos (mismo mecanismo exacto que inscMostrarPaso(),
   ../inscripcion/inscripcion.js -- toggle de clase .activo + historial
   propio, sin animar 2 pasos a la vez) ─────────── */
function _reRenderProg() {
  var cont = document.getElementById('re-prog'); if (!cont) return;
  var total = _RE_STEPS.length;
  cont.innerHTML = '';
  for (var i = 0; i < total; i++) {
    var d = document.createElement('div');
    d.className = 'insc-prog-dot' + (i < _reCurIdx ? ' done' : i === _reCurIdx ? ' active' : '');
    cont.appendChild(d);
  }
  cont.style.display = 'flex';
}

function reMostrarPaso(idx, desdeHistorial) {
  _RE_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _reCurIdx = idx;
  _reRenderProg();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // .cta-footer-fixed vive fuera de .insc-step (ver index.html) -- hay que
  // ocultar todos y mostrar solo el que corresponde al paso nuevo a mano.
  document.querySelectorAll('.cta-footer-fixed').forEach(function(f) { f.style.display = 'none'; });
  var footer = document.getElementById('cta-footer-' + _RE_STEPS[idx]);
  if (footer) footer.style.display = 'block';
  if (!desdeHistorial) history.pushState({ pasoRe: idx }, '', '#paso-' + (idx + 1));
  if (idx === 1) _rePoblarPaso1();
  if (idx === 3) _rePoblarResumen();
}

function rePasoAnterior() {
  if (_reCurIdx === 0) { window.location.href = 'https://app.quindesvolcanicos.com/#s1'; return; }
  reMostrarPaso(_reCurIdx - 1);
}

window.addEventListener('popstate', function(ev) {
  var idx = (ev.state && typeof ev.state.pasoRe === 'number') ? ev.state.pasoRe : 0;
  reMostrarPaso(idx, true);
});
history.replaceState({ pasoRe: 0 }, '', '#paso-1');

/* ── Paso 0: Equipamiento ────────────────────── */
var _rePatinesVal = null;
var _reProteccionesVal = null;

function reSelPatines(el) {
  document.querySelectorAll('#re-patines-pills .equip-pill-bin').forEach(function(p) { p.classList.remove('sel-si', 'sel-no'); });
  var val = el.dataset.val;
  el.classList.add(val === 'Sí' ? 'sel-si' : 'sel-no');
  _rePatinesVal = val;
}
function reSelProtecciones(el) {
  document.querySelectorAll('#re-protecciones-pills .equip-pill-bin').forEach(function(p) { p.classList.remove('sel-si', 'sel-no'); });
  var val = el.dataset.val;
  el.classList.add(val === 'Sí' ? 'sel-si' : 'sel-no');
  _reProteccionesVal = val;
}
function reContinuar0() {
  if (!_rePatinesVal || !_reProteccionesVal) { errMsg('err-re-0', 'Selecciona una opción en las 2 preguntas.'); return; }
  _reNecesitaPatines = _rePatinesVal;
  _reNecesitaProtecciones = _reProteccionesVal;
  _reTipoPago = (_reNecesitaPatines === 'Sí' || _reNecesitaProtecciones === 'Sí') ? 'clase' : 'mensual';
  reMostrarPaso(1, false);
}

/* ── Paso 1: Selección de reserva ────────────── */
function _rePoblarPaso1() {
  var contClase = document.getElementById('re-paso1-clase');
  var contMensual = document.getElementById('re-paso1-mensual');
  if (_reTipoPago === 'clase') {
    if (contClase) contClase.style.display = 'block';
    if (contMensual) contMensual.style.display = 'none';
    _reCargarFechas();
  } else {
    if (contClase) contClase.style.display = 'none';
    if (contMensual) contMensual.style.display = 'block';
    _reFechas = [];
    _reCargarPrecioMensual();
  }
}

// `nombre: ''` a propósito -- todavía no existe la cuenta en este paso
// (se crea recién en el Paso 2). getFechasDisponibles() solo usa `nombre`
// para excluir fechas donde esa persona YA tiene una reserva -- con
// nombre vacío ese chequeo simplemente no matchea nada, sin romper la
// disponibilidad real por talla/protecciones (verificado contra
// supabase/functions/api/index.ts antes de escribir esto).
function _reCargarFechas() {
  var lista = document.getElementById('re-lista-fechas');
  if (lista) lista.innerHTML = '<p style="text-align:center;color:var(--muted);">Cargando fechas...</p>';
  apiGet({ action: 'getFechasDisponibles', nombre: '', talla: '', necesitaProtecciones: _reNecesitaProtecciones }, function(fechas) {
    if (!lista) return;
    var disponibles = (fechas || []).filter(function(f) { return f.disponible; });
    if (disponibles.length === 0) { lista.innerHTML = '<p style="text-align:center;color:var(--muted);">No hay fechas disponibles.</p>'; return; }
    var html = '';
    disponibles.forEach(function(f) {
      var slug = f.fecha.replace(/\s/g, '_');
      var sub = (f.fechaCalendario || f.fecha) + (f.donde ? ' · ' + f.donde : '') + (f.horaInicio ? ' · ' + f.horaInicio + 'hs' : '');
      html += '<div class="fecha-item" id="fi-' + slug + '">' +
        '<div class="fi-header" onclick="reToggleFecha(this.closest(\'.fecha-item\'))">' +
        '<div class="fi-content"><div class="fi-title">' + sub + '</div></div>' +
        '<div class="fi-circle"><span class="material-symbols-outlined">check</span></div>' +
        '<input type="checkbox" name="re-fecha" value="' + f.fecha + '" style="display:none">' +
        '</div></div>';
    });
    lista.innerHTML = html;
  }, function() {
    if (lista) lista.innerHTML = '<p style="text-align:center;color:var(--danger);">No se pudieron cargar las fechas.</p>';
  });
}

// Mismo mecanismo exacto que toggleFecha() (js/reservas.js): `el` es el
// `.fecha-item` completo (no el `.fi-header` que originó el click), togglea
// el checkbox oculto adentro y recalcula el array desde TODOS los
// checkboxes marcados del DOM, no solo el tocado.
function reToggleFecha(el) {
  var chk = el.querySelector('input[type="checkbox"]');
  chk.checked = !chk.checked;
  el.classList.toggle('sel', chk.checked);
  _reFechas = Array.from(document.querySelectorAll('input[name="re-fecha"]:checked')).map(function(c) { return c.value; });
}

function _reCargarPrecioMensual() {
  var mesEl = document.getElementById('re-mes-actual');
  var precioEl = document.getElementById('re-precio-mensual');
  if (mesEl) mesEl.textContent = NOMBRES_MESES[new Date().getMonth()];
  apiGet({ action: 'getPreciosClases' }, function(res) {
    if (precioEl) precioEl.textContent = res && res.precioMensual ? ('$' + parseFloat(res.precioMensual).toFixed(2)) : '—';
  }, function() { if (precioEl) precioEl.textContent = '—'; });
}

function reContinuar1() {
  if (_reTipoPago === 'clase' && _reFechas.length === 0) { errMsg('err-re-1', 'Selecciona al menos una fecha.'); return; }
  reMostrarPaso(2, false);
}

/* ── Paso 2: Crear cuenta ───────────────────── */
function reTogglePinVis(inputId, icoId) {
  var inp = document.getElementById(inputId);
  var ico = document.getElementById(icoId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (ico) ico.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
}

function reContinuar2() {
  var nombre = (document.getElementById('re-nombre').value || '').trim();
  var pin = (document.getElementById('re-pin').value || '').trim();
  var pin2 = (document.getElementById('re-pin-confirm').value || '').trim();
  if (!nombre || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/.test(nombre)) { errMsg('err-re-2', 'Ingresa un nombre válido (solo letras y espacios).'); return; }
  if (!/^\d{4}$/.test(pin)) { errMsg('err-re-2', 'El PIN debe tener exactamente 4 dígitos.'); return; }
  if (pin !== pin2) { errMsg('err-re-2', 'Los 2 PIN no coinciden.'); return; }
  _reNombre = nombre;
  _rePin = pin;
  reMostrarPaso(3, false);
}

/* ── Paso 3: Confirmar y registrarse ────────── */
function _reEscHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _rePoblarResumen() {
  var el = document.getElementById('re-resumen');
  if (!el) return;
  var tipoTxt = _reTipoPago === 'mensual' ? 'Mensual' : 'Por clase';
  var detalleLabel = _reTipoPago === 'mensual' ? 'Mes' : 'Fechas';
  var detalleTxt = _reTipoPago === 'mensual'
    ? NOMBRES_MESES[new Date().getMonth()]
    : (_reFechas.length + (_reFechas.length === 1 ? ' fecha seleccionada' : ' fechas seleccionadas'));
  el.innerHTML =
    '<div class="aj-dato-row"><div class="aj-dato-texts"><div class="aj-dato-label">Nombre</div><div class="aj-dato-val">' + _reEscHtml(_reNombre) + '</div></div></div>' +
    '<div class="aj-dato-row"><div class="aj-dato-texts"><div class="aj-dato-label">Tipo de reserva</div><div class="aj-dato-val">' + tipoTxt + '</div></div></div>' +
    '<div class="aj-dato-row"><div class="aj-dato-texts"><div class="aj-dato-label">' + detalleLabel + '</div><div class="aj-dato-val">' + _reEscHtml(detalleTxt) + '</div></div></div>';
}

function reEnviar() {
  if (_reEnviando) return;
  _reEnviando = true;
  var btn = document.getElementById('re-btn-enviar');
  if (btn) { btn.disabled = true; btn.textContent = 'Creando tu cuenta...'; }
  sha256Hex(_rePin + '|' + _reNombre).then(function(hash) {
    apiPost({
      action: 'inscribirPersonaExpress',
      nombre: _reNombre,
      pinHash: hash,
      necesitaPatines: _reNecesitaPatines,
      necesitaProtecciones: _reNecesitaProtecciones,
    }, function(res) {
      _reEnviando = false;
      if (res && res.exito) {
        mostrarCargando('¡Listo! Redirigiendo...');
        var url = 'https://app.quindesvolcanicos.com/?registro=1&token=' + encodeURIComponent(res.token) + '&tipo=' + encodeURIComponent(_reTipoPago);
        if (_reTipoPago === 'clase') url += '&fechas=' + encodeURIComponent(JSON.stringify(_reFechas));
        window.location.href = url;
      } else {
        if (btn) { btn.disabled = false; btn.textContent = 'Registrarme y reservar'; }
        errMsg('err-re-3', (res && res.error) || 'Error al registrarse. Intenta de nuevo.');
      }
    }, function(e) {
      _reEnviando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Registrarme y reservar'; }
      errMsg('err-re-3', 'Error: ' + (e.message || 'Intenta de nuevo'));
    });
  });
}

/* ── Helpers locales (mismo criterio que ../inscripcion/inscripcion.js:
   esta carpeta tampoco carga js/api.js/js/ui.js, así que necesita sus
   propias copias de apiGet()/apiPost()/errMsg() en vez de importarlos). ── */

/* Equivalente local de err() (js/ui.js) -- mismo timing/animación exacto:
   fadeIn 0.35s al aparecer, 4.4s visible, fadeOut 0.3s + colapso de alto/
   padding/margin antes de display:none. */
function errMsg(id, msg) {
  var el = document.getElementById(id); if (!el) return;
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

function apiGet(params, ok, fail) {
  var qs = Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k] || ''); }).join('&');
  fetch(BACKEND + '?' + qs, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } })
    .then(function(r) { return r.json(); })
    .then(function(d) { if (d.error && fail) fail(new Error(d.error)); else if (ok) ok(d); })
    .catch(function(e) { if (fail) fail(e); });
}

function apiPost(params, ok, fail) {
  var body = Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k] || ''); }).join('&');
  fetch(BACKEND, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    body: body
  })
    .then(function(r) { return r.json(); })
    .then(function(d) { if (d.error && fail) fail(new Error(d.error)); else if (ok) ok(d); })
    .catch(function(e) { if (fail) fail(e); });
}
