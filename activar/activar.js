/* ══ ACTIVAR CUENTA — mini-SPA para vincular una cuenta pre-creada por un
   admin (ver MANIFEST.md) ══════════════════════════════════════════════
   Mismo patrón que inscripcion/inscripcion.js (pedido explícito) -- pasos
   simples con fade (`.insc-step.activo`, inscripcion.css, reusado tal
   cual), helpers de API/errores duplicados acá en vez de importar js/ui.js
   completo (mismo motivo que inscripcion.js: depende de globals E/G del
   app principal que acá no existen).

   Auth: GIS crudo (`google.accounts.id`) + verificación server-side del
   idToken (`_verificarGoogleToken()`, Edge Function) -- EXACTAMENTE el
   mismo mecanismo que loginGoogle()/inscribirPersona()/onGoogleCredencial*()
   en el resto de la app. NO usa Supabase Auth (`supabase.auth.*`) -- esta
   app nunca lo usó en ningún lado, no hay ningún provider de Google
   configurado del lado de Supabase, y no hay ningún cliente
   `@supabase/supabase-js` cargado acá ni en ningún otro HTML del proyecto.
   Introducirlo solo para esta pantalla habría significado una 2da vía de
   auth completa y paralela, sin nada real del lado de Supabase que la
   respalde -- hubiera quedado rota en producción. */

var G = { token:'', idToken:'', nombre:'', email:'', foto:'' };
var _ACT_STEPS = ['act-step-1','act-step-2','act-step-3a','act-step-3b','act-step-3c'];
var _ACT_TITLES = ['Activar cuenta','Activar cuenta','Activar cuenta','Activar cuenta','Activar cuenta'];
var _actCurIdx = 0;
var _actInviteToken = '';
var _actNecesitaPatines = false;
var _actProtecOtro = '';
var _actTallasListo = false;
var _actEnviando = false;
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
var _actPrefijoSel = null;

/* ── Inicialización ─────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  try {
    _actRenderPrefijos(_AJ_PREFIJOS);
    _actCargarTallas();
    _actInviteToken = new URLSearchParams(window.location.search).get('token') || '';
    if (!_actInviteToken) {
      ocultarCargando();
      _actMostrarError('Falta el link de activación', 'Pídele a un admin del equipo que te comparta el link completo.');
      return;
    }
    mostrarCargando('Verificando invitación...');
    apiPost({ action: 'validarInviteToken', token: _actInviteToken }, function(res) {
      ocultarCargando();
      if (!res.valido) {
        if (res.usado) _actMostrarError('Este link ya fue usado', 'Si ya activaste tu cuenta, ingresa desde la app principal con tu cuenta de Google.');
        else if (res.expirado) _actMostrarError('Este link expiró', 'Pídele a un admin del equipo que te comparta un link nuevo.');
        else _actMostrarError('Este link no es válido', 'Pídele a un admin del equipo que te comparta un link nuevo.');
        return;
      }
      var m = res.miembro || {};
      G.nombre = m.username || '';
      var t = document.getElementById('act-bienvenida-titulo');
      if (t) t.textContent = (G.nombre ? 'Hola ' + G.nombre + ', completa' : 'Completa') + ' tu perfil en Pivot';
      _actMostrarBienvenida();
      _actIniciarGoogleSignIn();
    }, function(e) {
      ocultarCargando();
      _actMostrarError('No pudimos verificar el link', e && e.message ? e.message : 'Intenta de nuevo en un momento.');
    });
  } catch(e) {
    console.error('[ACT] Error en init:', e);
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

/* ── Pantallas previas al flujo de pasos (error / bienvenida) ────────── */
function _actMostrarError(titulo, texto) {
  var t = document.getElementById('act-error-titulo');
  var d = document.getElementById('act-error-texto');
  if (t) t.textContent = titulo;
  if (d) d.textContent = texto;
  document.getElementById('act-step-error').classList.add('activo');
}
function _actMostrarBienvenida() {
  document.getElementById('act-step-0').classList.add('activo');
}

/* ── Navegación entre pasos (1 a 3c) ────────────────────────────────── */
function _actRenderProg() {
  var cont = document.getElementById('act-prog'); if (!cont) return;
  var total = _ACT_STEPS.length;
  cont.innerHTML = '';
  for (var i = 0; i < total; i++) {
    var d = document.createElement('div');
    d.className = 'insc-prog-dot' + (i < _actCurIdx ? ' done' : i === _actCurIdx ? ' active' : '');
    cont.appendChild(d);
  }
  cont.style.display = 'flex';
  var back = document.getElementById('act-back');
  if (back) back.style.display = 'flex';
}
function actMostrarPaso(idx) {
  document.getElementById('act-step-0').classList.remove('activo');
  _ACT_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _actCurIdx = idx;
  _actRenderProg();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelectorAll('.cta-footer-fixed').forEach(function(f) { f.style.display = 'none'; });
  var footer = document.getElementById('cta-footer-' + _ACT_STEPS[idx]);
  if (footer) footer.style.display = 'block';
}
function actPasoAnterior() {
  if (_actCurIdx === 0) return;
  if (_ACT_STEPS[_actCurIdx] === 'act-step-3c' && !_actNecesitaPatines) {
    actMostrarPaso(_ACT_STEPS.indexOf('act-step-3a')); return;
  }
  actMostrarPaso(_actCurIdx - 1);
}

/* ── Google Sign-In ──────────────────────────────────────────────────
   Mismo mecanismo que inscripcion.js: GIS crudo, `verificarGoogle` para
   chequear la cuenta ANTES de comprometerse a nada (acá además valida
   contra el invite token) -- ver `_actAlVerificarGoogle()`. */
function _actIniciarGoogleSignIn() {
  if (typeof google !== 'undefined' && google.accounts) { actIniciarGoogleSignIn(); }
  else { var s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.onload=actIniciarGoogleSignIn; document.head.appendChild(s); }
}
function actIniciarGoogleSignIn() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: _actAlVerificarGoogle,
    context: 'signin'
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

// Al elegir cuenta de Google en el prompt: llama activarCuenta() directo
// (a diferencia de inscripcion.js, que primero llama a `verificarGoogle`
// "de prueba" y recién crea la cuenta al final del formulario -- acá la
// cuenta YA EXISTE, activarla es el primer paso real, no el último) --
// vincula el email a la fila de `equipo` de este invite token y devuelve
// una sesión real (mismo formato que loginGoogle()/inscribirPersona()).
function _actAlVerificarGoogle(response) {
  mostrarCargando('Activando tu cuenta...');
  apiPost({ action: 'activarCuenta', token: _actInviteToken, idToken: response.credential }, function(res) {
    ocultarCargando();
    if (!res.exito) { errMsg('err-p0', res.error || 'No se pudo activar la cuenta. Intenta de nuevo.'); return; }
    G.token = res.token || '';
    G.idToken = response.credential;
    G.email = res.email || '';
    G.foto = res.foto || '';
    G.nombre = res.nombre || G.nombre;
    // Misma sesión que usa el resto de la app -- de acá en adelante, si la
    // persona cierra esta pestaña a mitad del flujo y vuelve más tarde
    // desde la app principal, ya puede entrar con Google normalmente (la
    // cuenta ya está activada, aunque le falten los datos de los pasos
    // 1-3 -- esos quedan vacíos hasta que complete este flujo o los cargue
    // después desde Ajustes).
    try { localStorage.setItem('session', JSON.stringify({ nombre: G.nombre, token: G.token })); } catch(ex) {}
    actMostrarPaso(0);
  }, function(e) {
    ocultarCargando();
    errMsg('err-p0', 'Error al activar: ' + (e && e.message ? e.message : 'Intenta de nuevo'));
  });
}

/* ── Paso 1: pronombres ──────────────────────── */
function actTogglePron(el) { el.classList.toggle('activa'); }
function _actGetPronombres() {
  var vals = [];
  document.querySelectorAll('#act-pron-pills .aj-pill.activa').forEach(function(p) {
    var v = p.dataset.val || p.textContent.trim();
    if (v) vals.push(v);
  });
  return vals.join(', ');
}
function actContinuar1() {
  var prons = _actGetPronombres();
  if (!prons) { errMsg('err-p1', 'Selecciona al menos un pronombre.'); return; }
  G.pronombres = prons;
  actMostrarPaso(_ACT_STEPS.indexOf('act-step-2'));
}

/* ── Paso 2: teléfono ────────────────────────── */
function actValidarTel(inp) {
  inp.value = inp.value.replace(/\D/g, '');
}
function actContinuar2() {
  if (!_actPrefijoSel) { errMsg('err-p2', 'Selecciona un código de país.'); return; }
  var tel = (document.getElementById('f-telefono').value || '').trim();
  if (!tel) { errMsg('err-p2', 'El número de teléfono es obligatorio.'); return; }
  var min = _actPrefijoSel.min, max = _actPrefijoSel.max;
  if (tel.length < min || tel.length > max) { errMsg('err-p2', 'Número inválido para ' + _actPrefijoSel.pais + '.'); return; }
  actMostrarPaso(_ACT_STEPS.indexOf('act-step-3a'));
}

/* ── Bottom sheet prefijo (mismos ids que inscripcion.js) ───────────── */
function actAbrirSheetPrefijo() {
  _actRenderPrefijos(_AJ_PREFIJOS);
  _actAbrirSheet('insc-sheet-prefijo-overlay', 'insc-sheet-prefijo');
  var s = document.getElementById('insc-prefijo-search'); if (s) s.value = '';
}
function actCerrarSheetPrefijo() { _actCerrarSheet('insc-sheet-prefijo-overlay', 'insc-sheet-prefijo'); }
function _actRenderPrefijos(lista) {
  var html = lista.map(function(p) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;font-size:0.85rem;" onclick="actSelPrefijo(\'' + p.pais.replace(/'/g,"\\'") + '\')">' +
      '<span style="font-size:1.2rem;">' + p.bandera + '</span>' +
      '<span style="flex:1;color:var(--text);font-weight:600;">' + p.pais + '</span>' +
      '<span style="color:var(--muted);">' + p.cod + '</span>' +
      '</div>';
  }).join('');
  var list = document.getElementById('insc-prefijo-list');
  if (list) list.innerHTML = html || '<div style="padding:16px;text-align:center;color:var(--muted);">Sin resultados</div>';
}
function actFiltrarPrefijos(q) {
  var f = _AJ_PREFIJOS.filter(function(p) { return p.pais.toLowerCase().includes(q.toLowerCase()) || p.cod.includes(q); });
  _actRenderPrefijos(f);
}
function actSelPrefijo(pais) {
  var p = _AJ_PREFIJOS.find(function(x) { return x.pais === pais; });
  if (!p) return;
  _actPrefijoSel = p;
  var disp = document.getElementById('act-prefijo-display');
  if (disp) disp.textContent = p.bandera + ' ' + p.cod + ' ' + p.pais;
  actCerrarSheetPrefijo();
}

/* ── Paso 3A: patines ────────────────────────── */
function actSelBin(el, containerId) {
  var container = document.getElementById(containerId); if (!container) return;
  container.querySelectorAll('.equip-pill-bin').forEach(function(p) { p.classList.remove('sel-si','sel-no'); });
  var val = el.dataset.val;
  el.classList.add(val === 'Sí' ? 'sel-si' : 'sel-no');
  _actNecesitaPatines = val === 'Sí';
}
function actContinuar3a() {
  var sel = document.querySelector('#act-patines-pills .equip-pill-bin.sel-si, #act-patines-pills .equip-pill-bin.sel-no');
  if (!sel) { errMsg('err-p3a', 'Selecciona una opción.'); return; }
  if (_actNecesitaPatines) {
    if (!_actTallasListo) {
      var grid = document.getElementById('act-tallas-grid');
      if (grid) grid.innerHTML = '<div class="loader" style="grid-column:1/-1;padding:20px 0;"><div class="spinner" style="width:26px;height:26px;border-width:3px;"></div></div>';
    }
    actMostrarPaso(_ACT_STEPS.indexOf('act-step-3b'));
  } else {
    actMostrarPaso(_ACT_STEPS.indexOf('act-step-3c'));
  }
}

/* ── Paso 3B: talla ──────────────────────────── */
function _actCargarTallas() {
  var grid = document.getElementById('act-tallas-grid'); if (!grid) return;
  apiGet({ action: 'getTallasDisponibles' }, function(tallas) {
    _actTallasListo = true;
    grid.innerHTML = (tallas || []).map(function(t) {
      return '<div class="equip-talla-pill" onclick="actSelTalla(this,\'' + t + '\')">' + t + '</div>';
    }).join('');
    void grid.offsetWidth;
    grid.style.animation = 'fadeIn 0.3s ease';
  }, function() {
    _actTallasListo = true;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;">' +
      '<p style="color:var(--danger);font-size:0.82rem;margin-bottom:8px;">Error al cargar tallas.</p>' +
      '<button type="button" class="btn-text-simple" style="display:flex;align-items:center;justify-content:center;gap:6px;margin:0 auto;" onclick="_actReintentarTallas()"><span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;">refresh</span> Reintentar</button>' +
      '</div>';
  });
}
function _actReintentarTallas() {
  _actTallasListo = false;
  var grid = document.getElementById('act-tallas-grid');
  if (grid) grid.innerHTML = '<div class="loader" style="grid-column:1/-1;padding:20px 0;"><div class="spinner" style="width:26px;height:26px;border-width:3px;"></div></div>';
  _actCargarTallas();
}
function actSelTalla(el, talla) {
  document.querySelectorAll('#act-tallas-grid .equip-talla-pill').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  document.getElementById('f-talla').value = talla;
}
function actContinuar3b() {
  if (!document.getElementById('f-talla').value) { errMsg('err-p3b', 'Selecciona una talla.'); return; }
  actMostrarPaso(_ACT_STEPS.indexOf('act-step-3c'));
}

/* ── Paso 3C: protecciones ───────────────────── */
function actSelProtec(el) {
  document.querySelectorAll('#act-protec-pills .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  if (el.dataset.val === 'Otro') {
    setTimeout(function() { _actAbrirSheet('insc-sheet-protec-overlay', 'insc-sheet-protec'); }, 150);
  }
}
function actToggleProtecItem(el) { el.classList.toggle('activa'); }
function actCancelarOtroProtec() {
  var hayAlguna = document.querySelector('#insc-protec-otro-pills .aj-pill.activa');
  if (!hayAlguna) document.querySelectorAll('#act-protec-pills .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  _actCerrarSheet('insc-sheet-protec-overlay', 'insc-sheet-protec');
}
function actConfirmarOtroProtec() {
  var vals = [];
  document.querySelectorAll('#insc-protec-otro-pills .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
  if (!vals.length) { errMsg('err-act-protec-sheet', 'Selecciona al menos una opción.'); return; }
  if (vals.length === 4) { errMsg('err-act-protec-sheet', 'Si necesitas las 4 protecciones, selecciona la opción "Sí, necesito protecciones completas".'); return; }
  var v = vals.join(', ');
  _actProtecOtro = v;
  var sub = document.getElementById('act-protec-otro-sub');
  if (sub) { sub.textContent = '"' + v + '"'; sub.style.color = 'var(--brand)'; }
  _actCerrarSheet('insc-sheet-protec-overlay', 'insc-sheet-protec');
}
/* ── Finalizar ────────────────────────────────
   Llama completarActivacion() con la sesión real ya creada por
   activarCuenta() (paso 0) y redirige a la app -- mismo patrón de éxito
   que inscripcion.js (?nuevx=1, precarga el equipamiento elegido). */
function actFinalizar() {
  if (_actEnviando) return;
  var sel = document.querySelector('#act-protec-pills .equip-pill-protec.sel');
  if (!sel) { errMsg('err-p3c', 'Selecciona una opción.'); return; }
  _actEnviando = true;
  var patines = _actNecesitaPatines ? 'Sí' : 'No';
  var talla = document.getElementById('f-talla').value || '';
  var protec = sel.dataset.val === 'Otro' ? _actProtecOtro : sel.dataset.val;
  var tel = (document.getElementById('f-telefono').value || '').trim();
  var prefVal = _actPrefijoSel ? _actPrefijoSel.bandera + ' ' + _actPrefijoSel.cod + ' (' + _actPrefijoSel.pais + ')' : '';
  mostrarCargando('Guardando tu perfil...');
  apiPost({
    action: 'completarActivacion', token: G.token,
    pronombres: G.pronombres || '', prefijo: prefVal, telefono: tel,
    necesitaPatines: patines, talla: talla, necesitaProtecciones: protec
  }, function(res) {
    ocultarCargando();
    _actEnviando = false;
    if (!res.exito) { errMsg('err-p3c', res.error || 'Error al guardar. Intenta de nuevo.'); return; }
    document.querySelectorAll('.cta-footer-fixed').forEach(function(f) { f.style.display = 'none'; });
    document.getElementById('exito-nombre').textContent = G.nombre;
    document.querySelector('.page-wrap').innerHTML = document.getElementById('section-exito').outerHTML;
    var _exitoEl = document.getElementById('section-exito');
    _exitoEl.style.display = 'block';
    _exitoEl.style.transition = 'opacity 0.4s ease';
    setTimeout(function() {
      _exitoEl.style.opacity = '0';
      setTimeout(function() {
        window.location.href = 'https://app.quindesvolcanicos.com?nuevx=1&nombre=' + encodeURIComponent(G.nombre) + '&patines=' + (patines==='Sí'?'si':'no') + '&protec=' + encodeURIComponent(protec || 'No') + (talla?'&talla='+encodeURIComponent(talla):'') + '&token=' + encodeURIComponent(G.idToken||'');
      }, 400);
    }, 2600);
  }, function(e) {
    ocultarCargando();
    _actEnviando = false;
    errMsg('err-p3c', 'Error: ' + (e && e.message ? e.message : 'Intenta de nuevo'));
  });
}

/* ── Helpers (duplicados de inscripcion.js -- mismo motivo, ver cabecera) ── */
function _actAbrirSheet(ovId, shId) {
  var ov = document.getElementById(ovId); var sh = document.getElementById(shId);
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform='translateY(0)'; }); }); }
}
function _actCerrarSheet(ovId, shId) {
  var sh = document.getElementById(shId); var ov = document.getElementById(ovId);
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if(sh)sh.style.display='none'; if(ov)ov.style.display='none'; }, 350);
}
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
  var qs = Object.keys(params).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]||''); }).join('&');
  fetch(BACKEND + '?' + qs)
    .then(function(r){ return r.json(); })
    .then(function(d){ if(d.error&&fail)fail(new Error(d.error));else if(ok)ok(d); })
    .catch(function(e){ if(fail)fail(e); });
}
function apiPost(params, ok, fail) {
  var body = Object.keys(params).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]||''); }).join('&');
  fetch(BACKEND, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    body: body
  })
    .then(function(r){ return r.json(); })
    .then(function(d){ if(d.error&&fail)fail(new Error(d.error));else if(ok)ok(d); })
    .catch(function(e){ if(fail)fail(e); });
}
