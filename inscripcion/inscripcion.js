/* ══ INSCRIPCIÓN — Flujo por pasos ══════════════════════════════════ */

var G = { email:'', idToken:'', nombre:'', foto:'', guardarFoto:false, fechaNac:'', mayorEdad:false };
var _INSC_STEPS = ['insc-step-1','insc-step-3','insc-step-4','insc-step-5a','insc-step-5b','insc-step-5c','insc-step-6'];
var _INSC_TITLES = ['Tu perfil','Tu identidad','Contacto','Equipamiento','Equipamiento','Equipamiento','Último paso'];
var _inscCurIdx = 0;
var _inscVinoConToken = false;
var _inscNecesitaPatines = false;
var _inscWpUnido = false;
var _inscProtecOtro = '';
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
var _inscPrefijoSel = _AJ_PREFIJOS[0];

/* ── Inicialización ─────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  try {
    _inscRenderProg();
    _inscCargarTallas();
    iniciarDatePicker();
    _inscRenderPrefijos(_AJ_PREFIJOS);
    inscMostrarPaso(0);
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
  cont.style.display = (_inscCurIdx === 0) ? 'none' : 'flex';
  var t = document.getElementById('insc-nav-title');
  if (t) t.textContent = _INSC_TITLES[_inscCurIdx] || 'Inscripción';
  var back = document.getElementById('insc-back');
  var ph = document.getElementById('insc-nav-ph');
  if (back) back.style.display = (_inscCurIdx > 0 || _inscVinoConToken) ? 'flex' : 'none';
  if (ph) ph.style.display = _inscCurIdx > 0 ? 'none' : 'block';
}

function inscMostrarPaso(idx) {
  _INSC_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _inscCurIdx = idx;
  _inscRenderProg();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

/* ── Google Sign-In ─────────────────────────── */
function iniciarGoogleSignIn() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogleCredentialInscripcion,
    context: 'signup'
  });
  google.accounts.id.renderButton(document.getElementById('gsignin-btn'), {
    theme: 'filled_blue', size: 'large', text: 'continue_with', locale: 'es', width: document.getElementById('gsignin-btn').offsetWidth || 300
  });
  var sk = document.getElementById('gsignin-skeleton');
  if (sk) setTimeout(function() { sk.style.opacity = '0'; setTimeout(function() { sk.style.display = 'none'; }, 400); }, 800);
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
  apiGet({ action: 'verificarGoogle', idToken: response.credential }, function(res) {
    _continuar(function() {
      ocultarCargando();
      if (res.yaRegistrado) { errMsg('err-p1', 'Esta cuenta ya está registrada. Inicia sesión desde la app principal.'); return; }
      G.email = res.email; G.idToken = response.credential; G.foto = res.foto || '';
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
  var av = document.getElementById('insc-avatar');
  var nm = document.getElementById('insc-profile-name');
  var em = document.getElementById('insc-profile-email');
  if (nm) nm.textContent = res.nombre || res.email;
  if (em) em.textContent = res.email;
  if (av) { av.textContent = (res.nombre || res.email || '?').charAt(0).toUpperCase(); }
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
function inscToggleFoto(tog) {
  var av = document.getElementById('insc-avatar');
  G.guardarFoto = tog.checked;
  if (!av) return;
  if (tog.checked && G.foto) {
    av.innerHTML = '<img src="' + G.foto + '" alt="">';
  } else {
    av.innerHTML = (G.email || '?').charAt(0).toUpperCase();
  }
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
  G.fechaNac = fnac;
  var d = new Date(fnac);
  var hoy = new Date();
  var edad = hoy.getFullYear() - d.getUTCFullYear();
  G.mayorEdad = edad >= 18;
  G.guardarFoto = document.getElementById('tog-foto').checked;
  G.fechaPublica = document.getElementById('tog-fecha-pub').checked ? 'Sí' : 'No';
  G.edadPublica = document.getElementById('tog-edad-pub').checked ? 'Sí' : 'No';
  inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-3'));
}

/* ── Paso 3: nombre y pronombres ────────────── */
function inscValidarNombre(inp) {
  inp.value = inp.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]/g, '');
  var ok = document.getElementById('hint-nombre-ok');
  if (ok) ok.style.display = inp.value.trim().length >= 2 ? 'block' : 'none';
}

function inscTogglePron(el) {
  el.classList.toggle('activa');
}

function inscAbrirOtroPron() {
  _inscAbrirSheet('insc-sheet-pron-overlay', 'insc-sheet-pron');
  setTimeout(function() { var i = document.getElementById('insc-pron-otro-inp'); if (i) i.focus(); }, 400);
}

function inscCancelarOtroPron() {
  var v = (document.getElementById('insc-pron-otro-inp').value || '').trim();
  var otroPill = document.querySelector('#insc-pron-pills .aj-pill-otro');
  if (!v && otroPill) otroPill.classList.remove('activa');
  _inscCerrarSheet('insc-sheet-pron-overlay', 'insc-sheet-pron');
}

function inscConfirmarOtroPron() {
  var v = (document.getElementById('insc-pron-otro-inp').value || '').trim();
  if (!v) return;
  var otroPill = document.querySelector('#insc-pron-pills .aj-pill-otro');
  if (otroPill) { otroPill.classList.add('activa'); otroPill.dataset.val = v; }
  var disp = document.getElementById('insc-pron-otro-display');
  if (disp) { disp.textContent = 'Otro: ' + v; disp.style.display = 'block'; }
  _inscCerrarSheet('insc-sheet-pron-overlay', 'insc-sheet-pron');
}

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
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/.test(nombre)) { errMsg('err-p3', 'El nombre solo puede contener letras y espacios.'); return; }
  var prons = _inscGetPronombres();
  if (!prons) { errMsg('err-p3', 'Selecciona al menos un pronombre.'); return; }
  G.nombre = nombre;
  inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-4'));
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
  if (_inscNecesitaPatines) { inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-5b')); }
  else { inscMostrarPaso(_INSC_STEPS.indexOf('insc-step-5c')); }
}

/* ── Paso 5B: talla ─────────────────────────── */
function _inscCargarTallas() {
  var grid = document.getElementById('insc-tallas-grid'); if (!grid) return;
  apiGet({ action: 'getTallasDisponibles' }, function(tallas) {
    grid.innerHTML = (tallas || []).map(function(t) {
      return '<div class="equip-talla-pill" onclick="inscSelTalla(this,\'' + t + '\')">' + t + '</div>';
    }).join('');
  }, function() {
    grid.innerHTML = '<p style="color:var(--danger);font-size:0.82rem;">Error al cargar tallas.</p>';
  });
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
    setTimeout(function() {
      _inscAbrirSheet('insc-sheet-protec-overlay', 'insc-sheet-protec');
      setTimeout(function() { var i = document.getElementById('insc-protec-otro-inp'); if (i) i.focus(); }, 400);
    }, 150);
  }
}
function inscCancelarOtroProtec() {
  var v = (document.getElementById('insc-protec-otro-inp').value || '').trim();
  if (!v) document.querySelectorAll('#insc-protec-pills .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  _inscCerrarSheet('insc-sheet-protec-overlay', 'insc-sheet-protec');
}
function inscConfirmarOtroProtec() {
  var v = (document.getElementById('insc-protec-otro-inp').value || '').trim();
  if (!v) return;
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
  if (btn) { btn.className = 'btn-wp-activo'; btn.innerHTML = '<span style="font-size:1.2rem;">✅</span> ¡Ya estás en el grupo!'; }
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
  if (!_inscWpUnido) { errMsg('err-p6', 'Por favor únete al grupo de WhatsApp antes de finalizar.'); return; }
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
    apiGet({
      action:'inscribirPersona', nombre:nombre, email:G.email, idToken:G.idToken,
      pronombres:prons, prefijo:prefVal, telefono:tel,
      necesitaPatines:patines, talla:talla, necesitaProtecciones:protec,
      foto:G.guardarFoto ? G.foto : '',
      fechaNac:G.fechaNac, guardarFecha:'si',
      fechaPublica:G.fechaPublica || 'No', edadPublica:G.edadPublica || 'No',
      mayorEdad:G.mayorEdad, pinHash:pinHash||''
    }, function(res) {
      ocultarCargando();
      if (res.exito) {
        document.getElementById('exito-nombre').textContent = nombre;
        document.querySelector('.page-wrap').innerHTML = document.getElementById('section-exito').outerHTML;
        document.getElementById('section-exito').style.display = 'block';
        setTimeout(function() {
          window.location.href = 'https://reservas.quindesvolcanicos.com?nuevx=1&nombre=' + encodeURIComponent(nombre) + '&patines=' + (patines==='Sí'?'si':'no') + '&protec=' + (protec==='No'?'no':'si') + (talla?'&talla='+encodeURIComponent(talla):'') + '&token=' + encodeURIComponent(G.idToken||'');
        }, 2800);
      } else {
        errMsg('err-p6', res.error || 'Error al registrarse. Intenta de nuevo.');
      }
    }, function(e) { ocultarCargando(); errMsg('err-p6', 'Error: ' + (e.message || 'Intenta de nuevo')); });
  }
  if (pin && pin.length === 4) {
    sha256Hex(pin).then(function(hash) { _doEnviar(hash); }).catch(function() { _doEnviar(''); });
  } else { _doEnviar(''); }
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
function errMsg(id, msg) {
  var el = document.getElementById(id); if (!el) return;
  el.textContent = msg; el.style.display = 'block';
  setTimeout(function(){ el.style.display='none'; }, 6000);
}
function abrirContacto() { var m=document.getElementById('modal-contacto-insc'); if(m)m.style.display='flex'; }
function cerrarContacto() { var m=document.getElementById('modal-contacto-insc'); if(m)m.style.display='none'; }

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
