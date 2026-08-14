/* ══ INSCRIPCIÓN — Flujo por pasos ══════════════════════════════════ */

/* G.fotoGoogle: foto cruda de la cuenta de Google (disponible apenas se
   verifica la cuenta). G.foto: URL final a enviar en inscribirPersona() —
   se precarga automáticamente con G.fotoGoogle apenas el login se verifica
   (ver "Cambios recientes" — revierte el criterio de privacidad anterior,
   donde empezaba vacía y había que elegirla a mano vía el sheet; decisión
   de Victor: más simple para el usuario, un paso menos). Sigue siendo
   reemplazable en cualquier momento subiendo una foto propia (recorte,
   js/foto.js) — eso sí sigue intacto. */
var G = { email:'', idToken:'', nombre:'', foto:'', fotoGoogle:'', fechaNac:'', mayorEdad:false };
var _INSC_STEPS = ['insc-step-1','insc-step-3','insc-step-4','insc-step-5a','insc-step-5b','insc-step-5c','insc-step-6'];
var _INSC_TITLES = ['Crear cuenta','Crear cuenta','Crear cuenta','Crear cuenta','Crear cuenta','Crear cuenta','Crear cuenta'];
var _inscCurIdx = 0;
var _inscVinoConToken = false;
var _inscNecesitaPatines = false;
var _inscWpUnido = false;
var _inscWpSkipped = false;
var _inscEnviando = false;
var _inscProtecOtro = '';
var _inscTallasListo = false;
var _AJ_PREFIJOS = [
  {pais:'Ecuador',bandera:'🇪🇨',cod:'+593',min:10,max:10},
  {pais:'Colombia',bandera:'🇨🇴',cod:'+57',min:10,max:10},
  {pais:'Perú',bandera:'🇵🇪',cod:'+51',min:9,max:9},
  {pais:'Venezuela',bandera:'🇻🇪',cod:'+58',min:10,max:10},
  {pais:'Argentina',bandera:'🇦🇷',cod:'+54',min:10,max:11},
  {pais:'Chile',bandera:'🇨🇱',cod:'+56',min:9,max:9},
  {pais:'México',bandera:'🇲🇽',cod:'+52',min:10,max:10},
  {pais:'España',bandera:'🇪🇸',cod:'+34',min:9,max:9},
  {pais:'Estados Unidos',bandera:'🇺🇸',cod:'+1',min:10,max:10},
  {pais:'Uruguay',bandera:'🇺🇾',cod:'+598',min:8,max:9},
  {pais:'Bolivia',bandera:'🇧🇴',cod:'+591',min:8,max:8},
  {pais:'Paraguay',bandera:'🇵🇾',cod:'+595',min:9,max:9},
];
var _inscPrefijoSel = null;

/* ── Inicialización ─────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  try {
    _inscRenderProg();
    _inscCargarTallas();
    iniciarDatePicker();
    _inscRenderPrefijos(_AJ_PREFIJOS);
    _inscPrefijoSel = _AJ_PREFIJOS[0];
    var _prefijoDispDefault = document.getElementById('insc-prefijo-display');
    if (_prefijoDispDefault) _prefijoDispDefault.textContent = _inscPrefijoSel.bandera + ' ' + _inscPrefijoSel.cod + ' ' + _inscPrefijoSel.pais;
    inscMostrarPaso(0, true);
    _inscIniciarGoogleSignIn();
    var _tokenUrl = new URLSearchParams(window.location.search).get('token');
    if (_tokenUrl) { _inscVinoConToken = true; onGoogleCredentialInscripcion({ credential: _tokenUrl }); }
  } catch(e) {
    console.error('[INSC] Error en init:', e);
  } finally {
    ocultarCargando();
  }
});

function ocultarCargando() {
  var ov = document.getElementById('loading-overlay');
  if (ov) { ov.style.opacity='0'; setTimeout(function(){ ov.style.display='none'; }, 400); }
}
function mostrarCargando(msg) {
  var ov = document.getElementById('loading-overlay');
  var m = document.getElementById('loading-msg');
  if (m) m.textContent = msg || 'Cargando...';
  if (ov) { ov.style.display='flex'; ov.style.opacity='1'; }
}

/* ── Navegación entre pasos ─────────────────── */
function _inscRenderProg() {
  var cont = document.getElementById('insc-prog'); if (!cont) return;
  var total = _INSC_STEPS.length;
  cont.innerHTML = '';
  for (var i = 0; i < total; i++) {
    var d = document.createElement('div');
    d.className = 'insc-prog-dot' + (i < _inscCurIdx ? ' done' : i === _inscCurIdx ? ' active' : '');
    cont.appendChild(d);
  }
  cont.style.display = 'flex';
  var t = document.getElementById('insc-nav-title');
  if (t) t.textContent = _INSC_TITLES[_inscCurIdx] || 'Inscripción';
  var back = document.getElementById('insc-back');
  var ph = document.getElementById('insc-nav-ph');
  if (back) back.style.display = (_inscCurIdx > 0 || _inscVinoConToken) ? 'flex' : 'none';
  if (ph) ph.style.display = _inscCurIdx > 0 ? 'none' : 'block';
  var btnHome = document.getElementById('insc-btn-home');
  if (btnHome) btnHome.style.display = (_inscCurIdx === 0) ? 'flex' : 'none';
}

// Navegación por pasos con fade simple (animation:smoothSlideUp vía
// .insc-step.activo, ver ../css/inscripcion.css) — ver MANIFEST, "Cambios
// recientes": se probó el shared axis X acá (axisTransicion()/
// axisBarraTitulo()/axisFooterFijo(), ver shared/axis-transicion.js) y se
// revirtió por acumular demasiados bugs de fondo (superposición, footer/
// título desincronizados, salto de scroll) para el tiempo invertido — se
// mantiene únicamente en aj-sub-*/irAjSub()/cerrarAjSub() (js/perfil.js),
// que sigue validado y sin tocar. Este es el mecanismo simple de antes de
// esa propagación: toggle de clase directo, sin animar dos pasos a la vez.
function inscMostrarPaso(idx, desdeHistorial) {
  _INSC_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _inscCurIdx = idx;
  _inscRenderProg();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // .cta-footer-fixed vive fuera de .insc-step (ver index.html), así que
  // hay que ocultar todos y mostrar solo el que corresponde al paso nuevo
  // a mano.
  document.querySelectorAll('.cta-footer-fixed').forEach(function(f) { f.style.display = 'none'; });
  var footer = document.getElementById('cta-footer-' + _INSC_STEPS[idx]);
  if (footer) footer.style.display = 'block';
  if (!desdeHistorial) history.pushState({ pasoInsc: idx }, '', '#paso-' + (idx + 1));
}

function inscPasoAnterior() {
  if (_inscCurIdx === 0) {
    if (_inscVinoConToken) { window.location.href = 'https://reservas.quindesvolcanicos.com/#s1'; }
    return;
  }
  if (_INSC_STEPS[_inscCurIdx] === 'insc-step-5c' && !_inscNecesitaPatines) {
    inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-5a')); return;
  }
  inscMostrarPaso(_inscCurIdx - 1);
}

// #insc-btn-home navega a una página HTML distinta (index.html) — no se
// puede animar la pantalla de destino (carga desde cero), pero se anima
// la salida de esta para que la transición no se sienta como un corte
// abrupto. mostrarCargando() (más arriba en este archivo) reusa el mismo
// #loading-overlay que ya cubre la carga real de la página siguiente.
function inscIrHome() {
  document.body.style.transition = 'opacity 0.25s ease';
  document.body.style.opacity = '0';
  mostrarCargando();
  setTimeout(function() {
    window.location.href = 'https://reservas.quindesvolcanicos.com/';
  }, 250);
}

window.addEventListener('popstate', function(ev) {
  var idx = (ev.state && typeof ev.state.pasoInsc === 'number') ? ev.state.pasoInsc : 0;
  inscMostrarPaso(idx, true);
});
history.replaceState({ pasoInsc: 0 }, '', '#paso-1');

/* ── Google Sign-In ─────────────────────────── */
function iniciarGoogleSignIn() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogleCredentialInscripcion,
    context: 'signup'
  });
  var cont = document.getElementById('gsignin-btn');
  if (!cont) return;
  cont.style.opacity = '0';
  cont.style.transition = 'opacity 0.4s ease';
  google.accounts.id.renderButton(cont, {
    theme: 'filled_blue', size: 'large', text: 'continue_with', locale: 'es',
    width: cont.offsetWidth || 300
  });
  var sk = document.getElementById('gsignin-skeleton');
  if (sk) {
    var _obs = new MutationObserver(function() {
      var iframe = cont.querySelector('iframe');
      if (!iframe) return;
      _obs.disconnect();
      setTimeout(function() {
        sk.style.opacity = '0';
        cont.style.opacity = '1';
        setTimeout(function() { sk.style.display = 'none'; }, 400);
      }, 250);
    });
    _obs.observe(cont, { childList: true, subtree: true });
    setTimeout(function() { _obs.disconnect(); cont.style.opacity = '1'; }, 6000);
  }
}

function onGoogleCredentialInscripcion(response) {
  mostrarCargando('Verificando cuenta...');
  var _t0 = Date.now();
  var MIN_DELAY = 650;
  function _continuar(fn) {
    var elapsed = Date.now() - _t0;
    var falta = MIN_DELAY - elapsed;
    if (falta > 0) { setTimeout(fn, falta); } else { fn(); }
  }
  apiPost({ action: 'verificarGoogle', idToken: response.credential }, function(res) {
    _continuar(function() {
      ocultarCargando();
      if (res.yaRegistrado) { errMsg('err-p1', 'Esta cuenta ya está registrada. Inicia sesión desde la app principal.'); return; }
      G.email = res.email; G.idToken = response.credential; G.fotoGoogle = res.foto || '';
      G.foto = G.fotoGoogle; // precargada por defecto, ver comentario arriba
      _inscDesbloquearForm(res);
    });
  }, function(e) {
    _continuar(function() {
      ocultarCargando();
      errMsg('err-p1', 'Error al verificar: ' + (e.message || 'Intenta de nuevo'));
    });
  });
}

function _inscPoblarPaso2(res) {
  var avLetter = document.getElementById('insc-avatar-letter');
  var nm = document.getElementById('insc-profile-name');
  var em = document.getElementById('insc-profile-email');
  if (nm) nm.textContent = res.nombre || res.email;
  if (em) em.textContent = res.email;
  if (avLetter) avLetter.textContent = (res.nombre || res.email || '?').charAt(0).toUpperCase();
  // Avatar: arranca ya mostrando la foto de Google (G.foto precargada más
  // arriba, en onGoogleCredentialInscripcion) — mismo helper que usa
  // js/foto.js tras un recorte/subida, con su propio crossfade.
  if (typeof _inscActualizarAvatar === 'function') _inscActualizarAvatar(G.foto);
  var origenEl = document.getElementById('insc-foto-origen');
  if (origenEl) origenEl.textContent = G.foto ? 'Foto de Google' : 'Sin foto de perfil';
  var fNombre = document.getElementById('f-nombre');
  if (fNombre && res.nombre && !fNombre.value) {
    fNombre.value = res.nombre;
    inscValidarNombre(fNombre);
  }
  if (res.fechaNac) {
    var disp = document.getElementById('fecha-importada-display');
    var btn = document.getElementById('fnac-btn');
    var hint = document.getElementById('fnac-hint');
    if (disp) { disp.textContent = 'Importada de Google: ' + _inscFormatFecha(res.fechaNac); disp.style.display = 'block'; }
    if (btn) btn.style.display = 'none';
    if (hint) hint.style.display = 'none';
    document.getElementById('fnac-iso').value = res.fechaNac;
    G.fechaNac = res.fechaNac;
  } else {
    var disp2 = document.getElementById('fecha-importada-display');
    var btn2 = document.getElementById('fnac-btn');
    var hint2 = document.getElementById('fnac-hint');
    if (disp2) disp2.style.display = 'none';
    if (btn2) btn2.style.display = 'flex';
    if (hint2) hint2.style.display = 'block';
  }
}

function _inscDesbloquearForm(res) {
  _inscPoblarPaso2(res);
  var card = document.getElementById('insc-google-card');
  var fields = document.getElementById('insc-form-fields');
  if (card) {
    card.style.transition = 'opacity 0.35s ease, max-height 0.4s ease';
    card.style.maxHeight = card.scrollHeight + 'px';
    void card.offsetWidth;
    card.style.opacity = '0';
    card.style.maxHeight = '0';
    card.style.overflow = 'hidden';
    card.style.marginTop = '0';
    setTimeout(function() { card.style.display = 'none'; }, 420);
  }
  if (fields) {
    fields.classList.remove('form-locked');
    fields.classList.add('form-unlocked');
  }
}

function _inscFormatFecha(iso) {
  var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.getUTCDate() + ' de ' + meses[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
}

/* ── Paso 2: foto y fecha ───────────────────── */
// Actualiza #insc-avatar con la URL final (o '' para volver a la inicial) —
// llamada al precargar la foto de Google apenas se verifica el login
// (_inscPoblarPaso2) y por _fotoAplicarResultado() (js/foto.js) tras
// recortar una foto propia o quitarla. Crossfade entre las 2 capas
// (.insc-avatar-layer, inscripcion.css) — ambas quedan siempre montadas,
// solo se togglea cuál tiene .mostrar; nunca se reemplaza innerHTML de
// golpe. Caso especial: pasar de una foto a OTRA foto (mismo <img>, ej.
// Google → recorte propio) no dispara la transition de opacity solo con el
// toggle de arriba porque avImg ya está en opacity:1 — fade-out primero
// (quitar .mostrar), swap de src recién con la capa invisible, fade-in
// después (doble requestAnimationFrame, mismo patrón que el resto de la
// app para no perderse el frame inicial), en vez de un salto instantáneo.
function _inscActualizarAvatar(url) {
  var avLetter = document.getElementById('insc-avatar-letter');
  var avImg = document.getElementById('insc-avatar-img');
  if (!avImg) { if (avLetter) avLetter.classList.toggle('mostrar', !url); return; }
  if (url && avImg.classList.contains('mostrar')) {
    avImg.classList.remove('mostrar');
    setTimeout(function() {
      avImg.src = url;
      requestAnimationFrame(function() { requestAnimationFrame(function() { avImg.classList.add('mostrar'); }); });
    }, 220); // mismo tiempo que la transition de .insc-avatar-layer (inscripcion.css)
    if (avLetter) avLetter.classList.remove('mostrar');
    return;
  }
  if (url) avImg.src = url;
  avImg.classList.toggle('mostrar', !!url);
  if (avLetter) avLetter.classList.toggle('mostrar', !url);
}

function _inscToggleClick(btn) {
  var on = btn.classList.contains('toggle-on');
  btn.classList.toggle('toggle-on', !on);
  btn.classList.toggle('toggle-off', on);
  btn.setAttribute('aria-pressed', String(!on));
}

function abrirPickerFecha() {
  abrirDatePicker(G.fechaNac || '', function(isoStr) {
    document.getElementById('fnac-iso').value = isoStr;
    G.fechaNac = isoStr;
    var btn = document.getElementById('fnac-btn');
    var span = btn ? btn.querySelector('.fnac-placeholder') : null;
    if (span) { span.textContent = _inscFormatFecha(isoStr); span.style.color = 'var(--text)'; span.style.fontStyle = 'normal'; }
  });
}

function inscContinuar2() {
  var fnac = document.getElementById('fnac-iso').value || G.fechaNac;
  if (!fnac) { errMsg('err-p2', 'La fecha de nacimiento es obligatoria.'); return; }
  var partes = fnac.indexOf('/') !== -1 ? fnac.split('/') : fnac.split('-');
  var fn = fnac.indexOf('/') !== -1
    ? new Date(partes[2], partes[1] - 1, partes[0])
    : new Date(partes[0], partes[1] - 1, partes[2]);
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var edad = hoy.getFullYear() - fn.getFullYear();
  var dm = hoy.getMonth() - fn.getMonth();
  if (dm < 0 || (dm === 0 && hoy.getDate() < fn.getDate())) edad--;
  if (edad < 16) { mostrarModalEdadBloqueo(); return; }
  G.fechaNac = fnac;
  G.mayorEdad = edad >= 18;
  G.fechaPublica = document.getElementById('tog-fecha-pub').classList.contains('toggle-on') ? 'Sí' : 'No';
  G.edadPublica = document.getElementById('tog-edad-pub').classList.contains('toggle-on') ? 'Sí' : 'No';
  inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-3'));
}

function mostrarModalEdadBloqueo() {
  var m = document.getElementById('modal-edad-bloqueo');
  if (m) m.style.display = 'flex';
}
function cerrarModalEdadBloqueo() {
  var m = document.getElementById('modal-edad-bloqueo');
  if (m) m.style.display = 'none';
}

/* ── Paso 3: nombre y pronombres ────────────── */
function inscValidarNombre(inp) {
  inp.value = inp.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s'.\-_]/g, '');
}

function inscTogglePron(el) {
  el.classList.toggle('activa');
}

// Opción "Otro" de pronombres eliminada del HTML (paso 3) — funciones comentadas, sin referencias vivas.
// function inscAbrirOtroPron() {
//   _inscAbrirSheet('insc-sheet-pron-overlay', 'insc-sheet-pron');
//   setTimeout(function() { var i = document.getElementById('insc-pron-otro-inp'); if (i) i.focus(); }, 400);
// }
//
// function inscCancelarOtroPron() {
//   var v = (document.getElementById('insc-pron-otro-inp').value || '').trim();
//   var otroPill = document.querySelector('#insc-pron-pills .aj-pill-otro');
//   if (!v && otroPill) otroPill.classList.remove('activa');
//   _inscCerrarSheet('insc-sheet-pron-overlay', 'insc-sheet-pron');
// }
//
// function inscConfirmarOtroPron() {
//   var v = (document.getElementById('insc-pron-otro-inp').value || '').trim();
//   if (!v) return;
//   var otroPill = document.querySelector('#insc-pron-pills .aj-pill-otro');
//   if (otroPill) { otroPill.classList.add('activa'); otroPill.dataset.val = v; }
//   var disp = document.getElementById('insc-pron-otro-display');
//   if (disp) { disp.textContent = 'Otro: ' + v; disp.style.display = 'block'; }
//   _inscCerrarSheet('insc-sheet-pron-overlay', 'insc-sheet-pron');
// }

function _inscGetPronombres() {
  var vals = [];
  document.querySelectorAll('#insc-pron-pills .aj-pill.activa').forEach(function(p) {
    var v = p.dataset.val || p.textContent.trim();
    if (v && v !== 'Otro...') vals.push(v);
  });
  return vals.join(', ');
}

function inscContinuar3() {
  var nombre = (document.getElementById('f-nombre').value || '').trim();
  if (!nombre || nombre.length < 2) { errMsg('err-p3', 'El nombre debe tener al menos 2 caracteres.'); return; }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s'.\-_]+$/.test(nombre)) { errMsg('err-p3', 'El nombre contiene caracteres no permitidos.'); return; }
  var prons = _inscGetPronombres();
  if (!prons) { errMsg('err-p3', 'Selecciona al menos un pronombre.'); return; }
  mostrarCargando('Verificando disponibilidad...');
  apiGet({ action: 'verificarNombreDisponible', nombre: nombre }, function(res) {
    ocultarCargando();
    if (!res.disponible) { errMsg('err-p3', 'Este nombre de usuario ya está en uso.'); return; }
    G.nombre = nombre;
    inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-4'));
  }, function(e) {
    ocultarCargando();
    errMsg('err-p3', 'Error al verificar: ' + (e.message || 'Intenta de nuevo'));
  });
}

/* ── Paso 4: teléfono ───────────────────────── */
function inscValidarTel(inp) {
  inp.value = inp.value.replace(/\D/g, '');
  var hint = document.getElementById('insc-tel-hint');
  var min = _inscPrefijoSel ? _inscPrefijoSel.min : 7;
  var max = _inscPrefijoSel ? _inscPrefijoSel.max : 15;
  if (inp.value.length > 0 && (inp.value.length < min || inp.value.length > max)) {
    inp.style.borderColor = 'var(--danger)';
    if (hint) { hint.textContent = 'Debe tener entre ' + min + ' y ' + max + ' dígitos para ' + (_inscPrefijoSel ? _inscPrefijoSel.pais : 'este país') + '.'; hint.style.color = 'var(--danger)'; }
  } else {
    inp.style.borderColor = '';
    if (hint) { hint.textContent = 'Sin prefijo ni espacios.'; hint.style.color = ''; }
  }
}

function inscContinuar4() {
  if (!_inscPrefijoSel) { errMsg('err-p4', 'Selecciona un código de país.'); return; }
  var tel = (document.getElementById('f-telefono').value || '').trim();
  if (!tel) { errMsg('err-p4', 'El número de teléfono es obligatorio.'); return; }
  var min = _inscPrefijoSel ? _inscPrefijoSel.min : 7;
  var max = _inscPrefijoSel ? _inscPrefijoSel.max : 15;
  if (tel.length < min || tel.length > max) { errMsg('err-p4', 'Número inválido para ' + (_inscPrefijoSel ? _inscPrefijoSel.pais : 'este país') + '.'); return; }
  inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-5a'));
}

/* ── Bottom sheet prefijo ────────────────────── */
function inscAbrirSheetPrefijo() {
  _inscRenderPrefijos(_AJ_PREFIJOS);
  _inscAbrirSheet('insc-sheet-prefijo-overlay', 'insc-sheet-prefijo');
  var s = document.getElementById('insc-prefijo-search'); if (s) s.value = '';
}
function inscCerrarSheetPrefijo() { _inscCerrarSheet('insc-sheet-prefijo-overlay', 'insc-sheet-prefijo'); }
function _inscRenderPrefijos(lista) {
  var html = lista.map(function(p) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;font-size:0.85rem;" onclick="inscSelPrefijo(\'' + p.pais.replace(/'/g,"\\'") + '\')">' +
      '<span style="font-size:1.2rem;">' + p.bandera + '</span>' +
      '<span style="flex:1;color:var(--text);font-weight:600;">' + p.pais + '</span>' +
      '<span style="color:var(--muted);">' + p.cod + '</span>' +
      '</div>';
  }).join('');
  var list = document.getElementById('insc-prefijo-list');
  if (list) list.innerHTML = html || '<div style="padding:16px;text-align:center;color:var(--muted);">Sin resultados</div>';
}
function inscFiltrarPrefijos(q) {
  var f = _AJ_PREFIJOS.filter(function(p) { return p.pais.toLowerCase().includes(q.toLowerCase()) || p.cod.includes(q); });
  _inscRenderPrefijos(f);
}
function inscSelPrefijo(pais) {
  var p = _AJ_PREFIJOS.find(function(x) { return x.pais === pais; });
  if (!p) return;
  _inscPrefijoSel = p;
  var disp = document.getElementById('insc-prefijo-display');
  if (disp) disp.textContent = p.bandera + ' ' + p.cod + ' ' + p.pais;
  inscCerrarSheetPrefijo();
}

/* ── Paso 5A: patines ───────────────────────── */
function inscSelBin(el, containerId) {
  var container = document.getElementById(containerId); if (!container) return;
  container.querySelectorAll('.equip-pill-bin').forEach(function(p) { p.classList.remove('sel-si','sel-no'); });
  var val = el.dataset.val;
  el.classList.add(val === 'Sí' ? 'sel-si' : 'sel-no');
  _inscNecesitaPatines = val === 'Sí';
}
function inscContinuar5a() {
  var sel = document.querySelector('#insc-patines-pills .equip-pill-bin.sel-si, #insc-patines-pills .equip-pill-bin.sel-no');
  if (!sel) { errMsg('err-p5a', 'Selecciona una opción.'); return; }
  if (_inscNecesitaPatines) {
    // _inscCargarTallas() se dispara una sola vez en DOMContentLoaded, en paralelo
    // mientras el usuario completa los pasos 1-4 — si todavía no resolvió al llegar
    // acá, el grid quedaba vacío y sin ningún indicador hasta que la respuesta llegara
    // sola de fondo. Mismo spinner de grid que ya usan sheet-talla (js/home.js) y
    // aj-sheet-talla-aj (js/perfil.js) para el mismo tipo de grilla.
    if (!_inscTallasListo) {
      var grid = document.getElementById('insc-tallas-grid');
      if (grid) grid.innerHTML = '<div class="loader" style="grid-column:1/-1;padding:20px 0;"><div class="spinner" style="width:26px;height:26px;border-width:3px;"></div></div>';
    }
    inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-5b'));
  }
  else { inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-5c')); }
}

/* ── Paso 5B: talla ─────────────────────────── */
function _inscCargarTallas() {
  var grid = document.getElementById('insc-tallas-grid'); if (!grid) return;
  apiGet({ action: 'getTallasDisponibles' }, function(tallas) {
    _inscTallasListo = true;
    grid.innerHTML = (tallas || []).map(function(t) {
      return '<div class="equip-talla-pill" onclick="inscSelTalla(this,\'' + t + '\')">' + t + '</div>';
    }).join('');
    void grid.offsetWidth;
    grid.style.animation = 'fadeIn 0.3s ease';
  }, function() {
    _inscTallasListo = true;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;">' +
      '<p style="color:var(--danger);font-size:0.82rem;margin-bottom:8px;">Error al cargar tallas.</p>' +
      '<button type="button" class="btn-text-simple" style="display:flex;align-items:center;justify-content:center;gap:6px;margin:0 auto;" onclick="_inscReintentarTallas()"><span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;">refresh</span> Reintentar</button>' +
      '</div>';
  });
}
function _inscReintentarTallas() {
  _inscTallasListo = false;
  var grid = document.getElementById('insc-tallas-grid');
  if (grid) grid.innerHTML = '<div class="loader" style="grid-column:1/-1;padding:20px 0;"><div class="spinner" style="width:26px;height:26px;border-width:3px;"></div></div>';
  _inscCargarTallas();
}
function inscSelTalla(el, talla) {
  document.querySelectorAll('#insc-tallas-grid .equip-talla-pill').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  document.getElementById('f-talla').value = talla;
}
function inscContinuar5b() {
  if (!document.getElementById('f-talla').value) { errMsg('err-p5b', 'Selecciona una talla.'); return; }
  inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-5c'));
}

/* ── Paso 5C: protecciones ──────────────────── */
function inscSelProtec(el) {
  document.querySelectorAll('#insc-protec-pills .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  if (el.dataset.val === 'Otro') {
    setTimeout(function() { _inscAbrirSheet('insc-sheet-protec-overlay', 'insc-sheet-protec'); }, 150);
  }
}
function inscToggleProtecItem(el) {
  el.classList.toggle('activa');
}
function inscCancelarOtroProtec() {
  var hayAlguna = document.querySelector('#insc-protec-otro-pills .aj-pill.activa');
  if (!hayAlguna) document.querySelectorAll('#insc-protec-pills .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  _inscCerrarSheet('insc-sheet-protec-overlay', 'insc-sheet-protec');
}
function inscConfirmarOtroProtec() {
  var vals = [];
  document.querySelectorAll('#insc-protec-otro-pills .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
  if (!vals.length) { errMsg('err-insc-protec-sheet', 'Selecciona al menos una opción.'); return; }
  if (vals.length === 4) { errMsg('err-insc-protec-sheet', 'Si necesitas las 4 protecciones, selecciona la opción "Sí, necesito protecciones completas".'); return; }
  var v = vals.join(', ');
  _inscProtecOtro = v;
  var sub = document.getElementById('insc-protec-otro-sub');
  if (sub) { sub.textContent = '"' + v + '"'; sub.style.color = 'var(--brand)'; }
  _inscCerrarSheet('insc-sheet-protec-overlay', 'insc-sheet-protec');
}
function inscContinuar5c() {
  var sel = document.querySelector('#insc-protec-pills .equip-pill-protec.sel');
  if (!sel) { errMsg('err-p5c', 'Selecciona una opción.'); return; }
  inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-6'));
}

/* ── Paso 6: PIN + WA + envío ───────────────── */
function inscWpUnido() {
  _inscWpUnido = true;
  var btn = document.getElementById('btn-wp-grupo-insc');
  if (btn) { btn.className = 'btn-wp-activo'; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:1.2rem;vertical-align:middle;">check_circle</span> ¡Ya estás en el grupo!'; }
}
function _inscMostrarModalWp() {
  document.getElementById('modal-wp-insc').style.display = 'flex';
}
function inscWpDesdeModal() {
  _inscWpUnido = true;
  document.getElementById('modal-wp-insc').style.display = 'none';
  var btn = document.getElementById('btn-wp-grupo-insc');
  if (btn) {
    btn.className = 'btn-wp-activo';
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px;margin-right:8px;">check_circle</span> ¡Ya estás en el grupo!';
  }
}
function inscWpSkipModal() {
  _inscWpSkipped = true;
  document.getElementById('modal-wp-insc').style.display = 'none';
  inscEnviar();
}
function inscTogglePinVis() {
  var inp = document.getElementById('f-pin');
  var ico = document.getElementById('insc-pin-ico');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (ico) ico.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
}
function inscEnviarSinPin() { document.getElementById('f-pin').value = ''; inscEnviar(); }
function inscEnviar() {
  if (_inscEnviando) return;
  if (!_inscWpUnido && !_inscWpSkipped) {
    _inscMostrarModalWp();
    return;
  }
  _inscEnviando = true;
  var nombre = G.nombre;
  var prons = _inscGetPronombres();
  var patines = _inscNecesitaPatines ? 'Sí' : 'No';
  var talla = document.getElementById('f-talla').value || '';
  var protecSel = document.querySelector('#insc-protec-pills .equip-pill-protec.sel');
  var protec = protecSel ? (protecSel.dataset.val === 'Otro' ? _inscProtecOtro : protecSel.dataset.val) : '';
  var tel = (document.getElementById('f-telefono').value || '').trim();
  var prefVal = _inscPrefijoSel ? _inscPrefijoSel.bandera + ' ' + _inscPrefijoSel.cod + ' (' + _inscPrefijoSel.pais + ')' : '';
  var pin = (document.getElementById('f-pin').value || '').trim();
  mostrarCargando('Creando tu cuenta...');
  function _doEnviar(pinHash) {
    apiPost({
      action:'inscribirPersona', nombre:nombre, email:G.email, idToken:G.idToken,
      pronombres:prons, prefijo:prefVal, telefono:tel,
      necesitaPatines:patines, talla:talla, necesitaProtecciones:protec,
      foto:G.foto,
      fechaNac:G.fechaNac, guardarFecha:'si',
      fechaPublica:G.fechaPublica || 'No', edadPublica:G.edadPublica || 'No',
      mayorEdad:G.mayorEdad, pinHash:pinHash||''
    }, function(res) {
      ocultarCargando();
      _inscEnviando = false;
      if (res.exito) {
        // Los .cta-footer-fixed viven fuera de .page-wrap (a nivel <body>, ver
        // inscMostrarPaso()) para no quedar atrapados por el containing block
        // de .insc-step.activo — por eso no desaparecen solos al reemplazar
        // .page-wrap por la pantalla de éxito, hay que ocultarlos a mano.
        document.querySelectorAll('.cta-footer-fixed').forEach(function(f) { f.style.display = 'none'; });
        document.getElementById('exito-nombre').textContent = nombre;
        document.querySelector('.page-wrap').innerHTML = document.getElementById('section-exito').outerHTML;
        var _exitoEl = document.getElementById('section-exito');
        _exitoEl.style.display = 'block';
        _exitoEl.style.transition = 'opacity 0.4s ease';
        setTimeout(function() {
          _exitoEl.style.opacity = '0';
          setTimeout(function() {
            window.location.href = 'https://reservas.quindesvolcanicos.com?nuevx=1&nombre=' + encodeURIComponent(nombre) + '&patines=' + (patines==='Sí'?'si':'no') + '&protec=' + encodeURIComponent(protec || 'No') + (talla?'&talla='+encodeURIComponent(talla):'') + '&token=' + encodeURIComponent(G.idToken||'');
          }, 400);
        }, 3600);
      } else {
        errMsg('err-p6', res.error || 'Error al registrarse. Intenta de nuevo.');
      }
    }, function(e) { ocultarCargando(); _inscEnviando = false; errMsg('err-p6', 'Error: ' + (e.message || 'Intenta de nuevo')); });
  }
  // Re-chequea disponibilidad justo antes de enviar — ya se verificó en el
  // paso 3, pero pueden pasar varios pasos/minutos hasta este envío final,
  // ventana suficiente para que otra persona elija el mismo nombre mientras
  // tanto (no elimina la carrera del todo — el backend sigue siendo la
  // fuente de verdad final — pero la reduce a la ventana entre este chequeo
  // y el guardado real, mucho más chica que la de todo el formulario).
  apiGet({ action: 'verificarNombreDisponible', nombre: nombre }, function(res) {
    if (!res.disponible) {
      ocultarCargando();
      _inscEnviando = false;
      errMsg('err-p6', 'Este nombre de usuario ya está en uso. Volvé al paso "¿Cómo te llamamos?" para elegir otro.');
      return;
    }
    if (pin && pin.length === 4) {
      sha256Hex(pin + '|' + G.nombre).then(function(hash) { _doEnviar(hash); }).catch(function() { _doEnviar(''); });
    } else { _doEnviar(''); }
  }, function(e) {
    ocultarCargando();
    _inscEnviando = false;
    errMsg('err-p6', 'Error al verificar disponibilidad: ' + (e.message || 'Intenta de nuevo'));
  });
}

/* ── Helpers ─────────────────────────────────── */
function _inscAbrirSheet(ovId, shId) {
  var ov = document.getElementById(ovId); var sh = document.getElementById(shId);
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform='translateY(0)'; }); }); }
}
function _inscCerrarSheet(ovId, shId) {
  var sh = document.getElementById(shId); var ov = document.getElementById(ovId);
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if(sh)sh.style.display='none'; if(ov)ov.style.display='none'; }, 350);
}
/* Equivalente local de err() (js/ui.js) — inscripcion/index.html no carga
   js/ui.js (depende de E/G globales del app principal que acá no existen),
   mismo criterio que la copia local de apiPost() más abajo: se duplica la
   función completa en vez de importar el archivo entero. Mismo timing/
   animación exactos que err(): fadeIn 0.35s al aparecer, 4.4s visible,
   fadeOut 0.3s + colapso de alto/padding/margin (0.35s, arranca 0.2s
   después de empezar el fadeOut) antes de display:none — mismas clases
   CSS fadeIn/fadeOut de css/estilos.css que ya usa .error-msg en toda la
   app, sin animación nueva. */
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
function abrirContacto() {
  var ov = document.getElementById('modal-contacto-insc-overlay');
  var m = document.getElementById('modal-contacto-insc');
  if (!m) return;
  ov.style.display = 'block';
  m.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.transform = 'translateY(0)'; }); });
}
function cerrarContacto() {
  var ov = document.getElementById('modal-contacto-insc-overlay');
  var m = document.getElementById('modal-contacto-insc');
  if (!m) return;
  m.style.transform = 'translateY(100%)';
  setTimeout(function() { m.style.display = 'none'; ov.style.display = 'none'; }, 350);
}

/* ── Google GIS init ─────────────────────────── */
function iniciarDatePicker() {
  if (typeof initDatePickerListeners === 'function') initDatePickerListeners();
}

function _inscIniciarGoogleSignIn() {
  if (typeof google !== 'undefined' && google.accounts) { iniciarGoogleSignIn(); }
  else { var s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.onload=iniciarGoogleSignIn; document.head.appendChild(s); }
}

/* ── API helper (GET como en la app) ─────────── */
function apiGet(params, ok, fail) {
  var qs = Object.keys(params).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]||''); }).join('&');
  fetch(BACKEND + '?' + qs)
    .then(function(r){ return r.json(); })
    .then(function(d){ if(d.error&&fail)fail(new Error(d.error));else if(ok)ok(d); })
    .catch(function(e){ if(fail)fail(e); });
}

/* ── API helper (POST — mismo patrón que apiPost() de js/api.js) ───────────
   Reservado para llamadas que cargan un idToken de Google: ese JWT ronda
   los 1200-1300 caracteres y, sumado al resto de los parámetros, arma una
   URL de GET de ~2000 caracteres — larga como para que algún punto de la
   infra la rechace y devuelva HTML en vez de JSON (el JSON.parse: unexpected
   character at line 1 column 1 reportado al completar la inscripción). Ver
   detalle en MANIFEST.md. */
function apiPost(params, ok, fail) {
  var body = Object.keys(params).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]||''); }).join('&');
  fetch(BACKEND, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  })
    .then(function(r){ return r.json(); })
    .then(function(d){ if(d.error&&fail)fail(new Error(d.error));else if(ok)ok(d); })
    .catch(function(e){ if(fail)fail(e); });
}
