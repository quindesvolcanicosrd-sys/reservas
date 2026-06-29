function irEditarDatos() {
  if (!E.datos) return;
  var d = E.datos;
  // Hero
  var avatarEl = document.getElementById('aj-avatar');
  if (avatarEl) {
    var foto = d.fotoPerfil || '';
    if (foto) { avatarEl.innerHTML = '<img src="' + foto + '" alt="">'; }
    else { avatarEl.textContent = (E.nombre || '?').charAt(0).toUpperCase(); }
  }
  var heroName = document.getElementById('aj-hero-name');
  var heroSub = document.getElementById('aj-hero-sub');
  if (heroName) heroName.textContent = d.nombreDerby || E.nombre || '—';
  if (heroSub) {
    var partes = [];
    if (d.numeroDerby) partes.push('#' + d.numeroDerby);
    if (d.pronombres) partes.push(d.pronombres.split(',').map(function(p){ return p.trim().split('/')[0]; }).join(', '));
    heroSub.textContent = partes.join(' · ') || '—';
  }
  // Equipamiento
  var eqVal = document.getElementById('aj-equip-val');
  if (eqVal) {
    var eqPartes = [];
    var pat = d.necesitaPatines || '';
    if (pat.toLowerCase() !== 'no' && pat) { eqPartes.push('Patines' + (d.talla ? ' talla ' + d.talla : '')); }
    var pro = d.necesitaProtecciones || '';
    if (pro.toLowerCase() !== 'no' && pro) { eqPartes.push('Protecciones: ' + pro); } else { eqPartes.push('Protecciones propias'); }
    eqVal.textContent = eqPartes.join(' · ') || '—';
  }
  // Teléfono
  var telVal = document.getElementById('aj-tel-val');
  if (telVal) telVal.textContent = (d.prefijo ? d.prefijo.match(/\+\d+/)?.[0] || '' : '') + ' ' + (d.telefono || '') || '—';
  // Privacidad
  var privVal = document.getElementById('aj-priv-val');
  if (privVal) {
    var fp = d.fechaPublica === 'Sí' ? 'Fecha pública' : 'Fecha privada';
    var ep = d.edadPublica === 'Sí' ? 'Edad pública' : 'Edad privada';
    privVal.textContent = fp + ' · ' + ep;
  }
  // Legal
  var legVal = document.getElementById('aj-legal-val');
  if (legVal) legVal.textContent = [d.tipoDocumento, d.paisExpedicion].filter(Boolean).join(' · ') || '—';
  // Dirección
  var dirVal = document.getElementById('aj-dir-val');
  if (dirVal) dirVal.textContent = [d.sector, d.canton].filter(Boolean).join(', ') || '—';
  // Emergencias
  var emVal = document.getElementById('aj-emerg-val');
  if (emVal) emVal.textContent = [d.emerg1Nombre, d.emerg2Nombre].filter(Boolean).join(' · ') || '—';
  // Notif toggle
  _poblarResumenEquipPerfil();
  ir('s-datos');
}

function irEditarPerfil() { irAjSub('aj-sub-perfil'); }

function limpiarTelefono(input) { input.value = input.value.replace(/[^0-9]/g, ''); }

// ─── MODAL PRIMER LOGIN (permisos Google) ─────────────────────────────────────
var _fotoGoogleUrl = '';

function mostrarModalPermisos(nombre, fotoUrl) {
  _fotoGoogleUrl = fotoUrl || '';
  var el = document.getElementById('modal-permisos');
  document.getElementById('mp-saludo').textContent = '¡Hola, ' + nombre + '!';
  el.style.display = 'flex';
  el.style.animation = 'fadeIn 0.3s ease';
}

function guardarPermisos() {
  var fecha    = document.getElementById('mp-fecha').value;
  var togFecha = document.getElementById('mp-tog-fecha').checked;
  var togEdad  = document.getElementById('mp-tog-edad').checked;
  var togFoto  = document.getElementById('mp-tog-foto').checked;
  var errEl    = document.getElementById('err-modal-permisos');

  if (!fecha) {
    errEl.textContent = 'La fecha de nacimiento es obligatoria.';
    errEl.style.display = 'block';
    setTimeout(function(){ errEl.style.display = 'none'; }, 4000);
    return;
  }

  var btn = document.getElementById('btn-guardar-permisos');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  var fotoUrl = togFoto ? _fotoGoogleUrl : '';

  api({
    action:       'actualizarPerfilGoogle',
    foto:         fotoUrl,
    fechaNac:     fecha,
    guardarFecha: togFecha ? 'si' : 'no',
    fechaPublica: togFecha ? (togEdad ? 'Sí' : 'No') : 'No',
    edadPublica:  togEdad ? 'Sí' : 'No'
  }, function(res) {
    btn.disabled = false; btn.textContent = 'Guardar y continuar';
    if (res.exito) {
      if (E.datos) {
        E.datos.permisosConfigurados = true;
        if (fotoUrl) E.datos.fotoPerfil = fotoUrl;
      }
      document.getElementById('modal-permisos').style.display = 'none';
      if (fotoUrl) actualizarFotoPerfil(fotoUrl);
    } else {
      errEl.textContent = res.error || 'Error al guardar.';
      errEl.style.display = 'block';
      setTimeout(function(){ errEl.style.display = 'none'; }, 4000);
    }
  }, function(e) {
    btn.disabled = false; btn.textContent = 'Guardar y continuar';
    errEl.textContent = 'Error de conexión: ' + e.message;
    errEl.style.display = 'block';
  });
}

function saltarPermisos() {
  document.getElementById('modal-permisos').style.display = 'none';
}

function actualizarFotoPerfil(url) {
  var emoji = document.getElementById('home-emoji-mobile');
  if (emoji && url) {
    emoji.innerHTML = '<img src="' + url + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--brand);" onerror="this.parentElement.textContent=\'🛼\'">';
  }
  var emojiD = document.querySelector('.home-emoji-desktop');
  if (emojiD && url) {
    emojiD.innerHTML = '<img src="' + url + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid var(--brand);margin-bottom:12px;" onerror="this.textContent=\'🛼\'">';
  }
}

function eliminarCuenta() {
  document.getElementById('mec-nombre-label').textContent = E.nombre;
  document.getElementById('mec-input').value = '';
  document.getElementById('err-mec').style.display = 'none';
  mecValidar();
  var overlay = document.getElementById('modal-eliminar-cuenta');
  var inner = overlay.querySelector('div');
  overlay.style.display = 'flex';
  void overlay.offsetWidth;
  overlay.style.opacity = '1';
  inner.style.opacity = '1';
  inner.style.transform = 'scale(1) translateY(0)';
  document.body.style.overflow = 'hidden';
  setTimeout(function() { document.getElementById('mec-input').focus(); }, 300);
}

function mecValidar() {
  var val = (document.getElementById('mec-input').value || '').trim();
  var btn = document.getElementById('mec-btn-confirmar');
  var ok = val === E.nombre;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '0.4';
  btn.style.cursor = ok ? 'pointer' : 'not-allowed';
}

function mecCerrar() {
  var overlay = document.getElementById('modal-eliminar-cuenta');
  var inner = overlay.querySelector('div');
  overlay.style.opacity = '0';
  inner.style.opacity = '0';
  inner.style.transform = 'scale(0.92) translateY(12px)';
  setTimeout(function() { overlay.style.display = 'none'; document.body.style.overflow = ''; }, 300);
}

function mecConfirmar() {
  var btn = document.getElementById('mec-btn-confirmar');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Eliminando...';
  api({ action: 'eliminarCuenta', nombre: E.nombre }, function(res) {
    mecCerrar();
    if (res.exito) {
      setTimeout(function() {
        localStorage.removeItem('session');
        _token = ''; E.nombre = ''; E.datos = null; E.datosCompletos = null; _todasReservas = [];
        document.body.style.overflow = '';
        ir('s1');
      }, 310);
    } else {
      btn.disabled = false; btn.innerHTML = 'Eliminar mi cuenta';
      var e = document.getElementById('err-mec');
      e.textContent = res.error || 'Error al eliminar. Intenta de nuevo.';
      e.style.display = 'block';
    }
  }, function(e) {
    btn.disabled = false; btn.innerHTML = 'Eliminar mi cuenta';
    var errEl = document.getElementById('err-mec');
    errEl.textContent = 'Error de conexión: ' + e.message;
    errEl.style.display = 'block';
  });
}

function _poblarResumenEquipPerfil() {
  var el = document.getElementById('equip-resumen-perfil');
  if (!el || !E.datos) return;
  var d = E.datos;
  var pat = d.necesitaPatines || '—';
  var tal = d.talla || '';
  var pro = d.necesitaProtecciones || '—';
  el.innerHTML =
    '<strong>Patines:</strong> ' + pat + (tal ? ' — Talla ' + tal : '') + '<br>' +
    '<strong>Protecciones:</strong> ' + pro;
}

function irEditarEquipDesdeHome() {
  E.editPat = ''; E.editTalla = ''; E.editProtec = ''; E.editandoDesdeHome = true;
  document.querySelectorAll('input[name="edit-pat"],input[name="edit-protec"]').forEach(function(r) {
    r.checked = false; r.closest('.opcion').classList.remove('sel');
  });
  ir('s3a');
}

// ─── DATE PICKER (Mis Datos — ddp-*) ─────────────────────────────────────────
var _MESES_DDP = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var _ddpSt = { vy:1990, vm:0, sy:null, sm:null, sd:null, yearMode:false, monthMode:false };

function abrirPickerMisDatos() {
  var iso = document.getElementById('d-fechaNacimiento').value;
  if (iso) { var p=iso.split('-'); if(p.length===3){ _ddpSt.vy=parseInt(p[0]); _ddpSt.vm=parseInt(p[1])-1; _ddpSt.sy=parseInt(p[0]); _ddpSt.sm=parseInt(p[1])-1; _ddpSt.sd=parseInt(p[2]); } }
  else { _ddpSt.vy=1990; _ddpSt.vm=0; _ddpSt.sy=null; _ddpSt.sm=null; _ddpSt.sd=null; }
  _ddpSt.yearMode=false; _ddpSt.monthMode=false;
  _ddpRender();
  document.getElementById('ddp-modal').classList.add('active');
  document.body.style.overflow='hidden';
}
function _ddpCerrar() { document.getElementById('ddp-modal').classList.remove('active'); document.body.style.overflow=''; }
function _ddpRender() {
  var lbl=document.getElementById('ddp-sel-label');
  if(lbl) lbl.textContent=(_ddpSt.sy&&_ddpSt.sd)?_ddpSt.sd+' '+_MESES_DDP[_ddpSt.sm]+' '+_ddpSt.sy:'Sin seleccionar';
  var mEl=document.getElementById('ddp-mes-label'); if(mEl) mEl.textContent=_MESES_DDP[_ddpSt.vm];
  var yEl=document.getElementById('ddp-anio-label'); if(yEl) yEl.textContent=_ddpSt.vy;
  var gw=document.getElementById('ddp-grid-wrap'), yg=document.getElementById('ddp-anios'), mg=document.getElementById('ddp-meses');
  if(_ddpSt.yearMode){gw.style.display='none';yg.style.display='grid';if(mg)mg.style.display='none';_ddpRenderAnios();}
  else if(_ddpSt.monthMode){gw.style.display='none';yg.style.display='none';if(mg){mg.style.display='grid';_ddpRenderMeses();}}
  else{gw.style.display='block';yg.style.display='none';if(mg)mg.style.display='none';_ddpRenderDias();}
}
function _ddpRenderDias() {
  var vy=_ddpSt.vy,vm=_ddpSt.vm,el=document.getElementById('ddp-dias');el.innerHTML='';
  var fd=new Date(vy,vm,1).getDay(),dim=new Date(vy,vm+1,0).getDate(),off=(fd+6)%7,hoy=new Date();
  for(var i=0;i<off;i++){var b=document.createElement('div');b.className='ddp-day ddp-other';el.appendChild(b);}
  for(var d=1;d<=dim;d++){(function(day){
    var btn=document.createElement('button');btn.type='button';btn.className='ddp-day';btn.textContent=day;
    if(_ddpSt.sy===vy&&_ddpSt.sm===vm&&_ddpSt.sd===day)btn.classList.add('ddp-sel');
    else if(hoy.getFullYear()===vy&&hoy.getMonth()===vm&&hoy.getDate()===day)btn.classList.add('ddp-today');
    btn.onclick=function(){_ddpSt.sy=vy;_ddpSt.sm=vm;_ddpSt.sd=day;_ddpRender();};
    el.appendChild(btn);
  })(d);}
}
function _ddpRenderAnios() {
  var yg=document.getElementById('ddp-anios');yg.innerHTML='';
  for(var y=new Date().getFullYear();y>=1920;y--){(function(yr){
    var btn=document.createElement('button');btn.type='button';
    btn.className='ddp-year-btn'+(yr===_ddpSt.vy?' ddp-year-sel':'');btn.textContent=yr;
    btn.onclick=function(){_ddpSt.vy=yr;_ddpSt.sy=yr;_ddpSt.yearMode=false;_ddpRender();};
    yg.appendChild(btn);
  })(y);}
  requestAnimationFrame(function(){var s=yg.querySelector('.ddp-year-sel');if(s)s.scrollIntoView({block:'center'});});
}
function _ddpRenderMeses() {
  var mg=document.getElementById('ddp-meses');if(!mg)return;mg.innerHTML='';
  _MESES_DDP.forEach(function(n,idx){
    var btn=document.createElement('button');btn.type='button';
    btn.className='ddp-month-btn'+(idx===_ddpSt.vm?' ddp-month-sel':'');btn.textContent=n;
    btn.onclick=function(){_ddpSt.vm=idx;_ddpSt.sm=idx;_ddpSt.monthMode=false;_ddpRender();};
    mg.appendChild(btn);
  });
}
(function(){
  document.addEventListener('DOMContentLoaded',function(){
    var modal=document.getElementById('ddp-modal');
    if(!modal)return;
    modal.addEventListener('click',function(e){
      var t=e.target;
      if(t.id==='ddp-mes-label'||t.closest&&t.closest('#ddp-mes-label')){_ddpSt.monthMode=!_ddpSt.monthMode;_ddpSt.yearMode=false;_ddpRender();}
      else if(t.id==='ddp-anio-label'||t.closest&&t.closest('#ddp-anio-label')){_ddpSt.yearMode=!_ddpSt.yearMode;_ddpSt.monthMode=false;_ddpRender();}
      else if(t===modal)_ddpCerrar();
    });
    var canc=document.getElementById('ddp-cancelar'); if(canc)canc.onclick=_ddpCerrar;
    var ok=document.getElementById('ddp-ok');
    if(ok)ok.onclick=function(){
      if(!_ddpSt.sd)return;
      var iso=_ddpSt.sy+'-'+String(_ddpSt.sm+1).padStart(2,'0')+'-'+String(_ddpSt.sd).padStart(2,'0');
      document.getElementById('d-fechaNacimiento').value=iso;
      var disp=document.getElementById('ddp-trigger-display');
      if(disp){disp.textContent=_ddpSt.sd+' de '+_MESES_DDP[_ddpSt.sm]+' de '+_ddpSt.sy;disp.classList.remove('fnac-placeholder');}
      _ddpCerrar();
    };
  });
})();

/* ── Ajustes: navegación de sub-pantallas ─────────────── */
function irAjSub(id) {
  var sub = document.getElementById(id);
  if (!sub) return;
  _ajCargarSub(id);
  sub.classList.add('activa');
}

function cerrarAjSub(id) {
  var sub = document.getElementById(id);
  if (sub) sub.classList.remove('activa');
}

function _ajCargarSub(id) {
  var d = E.datos; if (!d) return;
  if (id === 'aj-sub-perfil') {
    var inp = document.getElementById('aj-nombreDerby'); if (inp) inp.value = d.nombreDerby || '';
    var inp2 = document.getElementById('aj-numeroDerby'); if (inp2) inp2.value = d.numeroDerby || '';
    _ajCargarPronombres(d.pronombres || '');
  } else if (id === 'aj-sub-contacto') {
    var em = document.getElementById('aj-email-display'); if (em) em.textContent = d.email || '—';
    _ajSetPrefijo('aj-prefijo-display', 'aj-prefijo-val', d.prefijo || '');
    var tel = document.getElementById('aj-telefono'); if (tel) tel.value = d.telefono || '';
  } else if (id === 'aj-sub-privacidad') {
    var fn = document.getElementById('aj-fn-display');
    if (fn) {
      var fnRaw = (d.fechaNacimiento || '').toString().trim();
      fn.textContent = fnRaw ? _ajFormatearFecha(fnRaw) : '—';
    }
    var fp = document.getElementById('aj-fechaPublica'); if (fp) fp.checked = (d.fechaPublica === 'Sí');
    var ep = document.getElementById('aj-edadPublica'); if (ep) ep.checked = (d.edadPublica === 'Sí');
  } else if (id === 'aj-sub-legal') {
    _ajActivarPill('aj-tipoDoc-pills', d.tipoDocumento || '');
    var nd = document.getElementById('aj-numeroDoc'); if (nd) nd.value = d.numeroDocumento || '';
    var pd = document.getElementById('aj-pais-display'); if (pd) pd.textContent = d.paisExpedicion || 'Selecciona';
    _ajPaisActual = d.paisExpedicion || '';
    var nl = document.getElementById('aj-nombreLegal'); if (nl) nl.value = d.nombreLegal || '';
  } else if (id === 'aj-sub-direccion') {
    var campos = ['callePrincipal','calleSecundaria','numeracion','sector'];
    campos.forEach(function(c) { var el = document.getElementById('aj-'+c); if (el) el.value = d[c] || ''; });
    _ajActivarPill('aj-canton-pills', d.canton || '');
  } else if (id === 'aj-sub-emerg') {
    var e1n = document.getElementById('aj-e1nombre'); if (e1n) e1n.value = d.emerg1Nombre || '';
    _ajActivarPill('aj-e1rel-pills', d.emerg1Relacion || '');
    _ajSetPrefijo('aj-e1pref-display', 'aj-e1prefijo', d.emerg1Prefijo || '');
    var e1t = document.getElementById('aj-e1telefono'); if (e1t) e1t.value = d.emerg1Telefono || '';
    var e2n = document.getElementById('aj-e2nombre'); if (e2n) e2n.value = d.emerg2Nombre || '';
    _ajActivarPill('aj-e2rel-pills', d.emerg2Relacion || '');
    _ajSetPrefijo('aj-e2pref-display', 'aj-e2prefijo', d.emerg2Prefijo || '');
    var e2t = document.getElementById('aj-e2telefono'); if (e2t) e2t.value = d.emerg2Telefono || '';
  }
}

function _ajActivarPill(containerId, valor) {
  var container = document.getElementById(containerId); if (!container) return;
  container.querySelectorAll('.aj-pill').forEach(function(p) { p.classList.remove('activa','activa-outline'); });
  var encontrado = false;
  container.querySelectorAll('.aj-pill:not(.aj-pill-otro)').forEach(function(p) {
    if (p.dataset.val === valor) { p.classList.add('activa'); encontrado = true; }
  });
  if (!encontrado && valor) {
    var otro = container.querySelector('.aj-pill-otro');
    if (otro) { otro.dataset.val = valor; otro.classList.add('activa-outline'); }
  }
}

function _ajCargarPronombres(pronStr) {
  var pills = document.querySelectorAll('#aj-pron-pills .aj-pill:not(.aj-pill-otro)');
  pills.forEach(function(p) { p.classList.remove('activa'); });
  var otros = pronStr.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var otroTexto = '';
  otros.forEach(function(v) {
    var found = false;
    pills.forEach(function(p) { if (p.dataset.val === v) { p.classList.add('activa'); found = true; } });
    if (!found) otroTexto = v;
  });
  var otroPill = document.querySelector('#aj-pron-pills .aj-pill-otro');
  var otroDisplay = document.getElementById('aj-pron-otro-display');
  if (otroTexto) {
    if (otroPill) otroPill.classList.add('activa-outline');
    if (otroDisplay) { otroDisplay.textContent = 'Otro: ' + otroTexto; otroDisplay.style.display = 'block'; }
  } else {
    if (otroPill) otroPill.classList.remove('activa','activa-outline');
    if (otroDisplay) otroDisplay.style.display = 'none';
  }
}

function ajSinglePill(el) {
  var container = el.closest('.aj-pills-row');
  container.querySelectorAll('.aj-pill').forEach(function(p) { p.classList.remove('activa','activa-outline'); });
  el.classList.add('activa');
}

function ajTogglePill(el) {
  el.classList.toggle('activa');
}

function _ajGetPronombres() {
  var vals = [];
  document.querySelectorAll('#aj-pron-pills .aj-pill:not(.aj-pill-otro).activa').forEach(function(p) { vals.push(p.dataset.val); });
  var otroDisplay = document.getElementById('aj-pron-otro-display');
  var otroPill = document.querySelector('#aj-pron-pills .aj-pill-otro');
  if (otroPill && (otroPill.classList.contains('activa') || otroPill.classList.contains('activa-outline')) && otroDisplay && otroDisplay.textContent) {
    vals.push(otroDisplay.textContent.replace('Otro: ',''));
  }
  return vals.join(', ');
}

function _ajGetSinglePill(containerId) {
  var el = document.querySelector('#' + containerId + ' .aj-pill.activa, #' + containerId + ' .aj-pill.activa-outline');
  return el ? el.dataset.val : '';
}

/* ── Pronombre "Otro" ──────────────────────────────────── */
var _ajSheetTextoCallback = null;

function ajAbrirOtroPron() {
  ajAbrirSheetTexto('aj-sheet-canton', 'Escribe tu pronombre', 'Ej: Xe/xem, Xo...', function(v) {
    var otroPill = document.querySelector('#aj-pron-pills .aj-pill-otro');
    var otroDisplay = document.getElementById('aj-pron-otro-display');
    if (otroPill) otroPill.classList.add('activa-outline');
    if (otroDisplay) { otroDisplay.textContent = 'Otro: ' + v; otroDisplay.style.display = 'block'; }
  });
}

/* ── Bottom sheet genérico de texto ───────────────────── */
function ajAbrirSheetTexto(sheetId, titulo, placeholder, callback) {
  _ajSheetTextoCallback = callback;
  var tit = document.getElementById('aj-sheet-texto-titulo');
  var inp = document.getElementById('aj-sheet-texto-input');
  if (tit) tit.textContent = titulo;
  if (inp) { inp.value = ''; inp.placeholder = placeholder; }
  var ov = document.getElementById('aj-sheet-texto-overlay');
  var sh = document.getElementById('aj-sheet-texto');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  setTimeout(function(){ var i = document.getElementById('aj-sheet-texto-input'); if (i) i.focus(); }, 400);
}

function ajCerrarSheetTexto() {
  var sh = document.getElementById('aj-sheet-texto');
  var ov = document.getElementById('aj-sheet-texto-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){
    if (sh) sh.style.display = 'none';
    if (ov) ov.style.display = 'none';
    _ajSheetTextoCallback = null;
  }, 350);
}

function ajConfirmarSheetTexto() {
  var v = (document.getElementById('aj-sheet-texto-input').value || '').trim();
  if (!v) return;
  if (_ajSheetTextoCallback) _ajSheetTextoCallback(v);
  ajCerrarSheetTexto();
}

function ajSetPillOtro(container, valor) {
  if (!container) return;
  container.querySelectorAll('.aj-pill').forEach(function(p) { p.classList.remove('activa','activa-outline'); });
  var otro = container.querySelector('.aj-pill-otro');
  if (otro) { otro.dataset.val = valor; otro.classList.add('activa-outline'); }
}

/* ── Bottom sheet prefijo ─────────────────────────────── */
var _AJ_PREFIJOS = [
  {pais:'Ecuador', bandera:'🇪🇨', cod:'+593'},
  {pais:'Colombia', bandera:'🇨🇴', cod:'+57'},
  {pais:'Perú', bandera:'🇵🇪', cod:'+51'},
  {pais:'Venezuela', bandera:'🇻🇪', cod:'+58'},
  {pais:'Argentina', bandera:'🇦🇷', cod:'+54'},
  {pais:'Chile', bandera:'🇨🇱', cod:'+56'},
  {pais:'México', bandera:'🇲🇽', cod:'+52'},
  {pais:'España', bandera:'🇪🇸', cod:'+34'},
  {pais:'Estados Unidos', bandera:'🇺🇸', cod:'+1'},
  {pais:'Uruguay', bandera:'🇺🇾', cod:'+598'},
  {pais:'Paraguay', bandera:'🇵🇾', cod:'+595'},
  {pais:'Bolivia', bandera:'🇧🇴', cod:'+591'},
];
var _ajPrefijoTarget = { displayId: 'aj-prefijo-display', hiddenId: null };

function _ajSetPrefijo(displayId, hiddenId, valorGuardado) {
  var el = document.getElementById(displayId);
  if (!el) return;
  if (!valorGuardado) { el.textContent = 'Selecciona'; return; }
  var match = _AJ_PREFIJOS.find(function(p) {
    return valorGuardado.indexOf(p.pais) !== -1 || valorGuardado.indexOf(p.cod) !== -1;
  });
  el.textContent = match ? match.bandera + ' ' + match.cod + ' ' + match.pais : valorGuardado;
  if (hiddenId) { var h = document.getElementById(hiddenId); if (h) h.value = valorGuardado; }
}

function ajAbrirSheetPrefijo() {
  _ajPrefijoTarget = { displayId: 'aj-prefijo-display', hiddenId: null };
  _ajRenderPrefijos(_AJ_PREFIJOS);
  var ov = document.getElementById('aj-sheet-prefijo-overlay');
  var sh = document.getElementById('aj-sheet-prefijo');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  var s = document.getElementById('aj-prefijo-search'); if (s) s.value = '';
}

function ajAbrirSheetPrefijoTarget(displayId, hiddenId) {
  _ajPrefijoTarget = { displayId: displayId, hiddenId: hiddenId };
  _ajRenderPrefijos(_AJ_PREFIJOS);
  var ov = document.getElementById('aj-sheet-prefijo-overlay');
  var sh = document.getElementById('aj-sheet-prefijo');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  var s = document.getElementById('aj-prefijo-search'); if (s) s.value = '';
}

function ajCerrarSheetPrefijo() {
  var sh = document.getElementById('aj-sheet-prefijo');
  var ov = document.getElementById('aj-sheet-prefijo-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function _ajRenderPrefijos(lista) {
  var html = lista.map(function(p) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;font-size:0.85rem;" onclick="ajSelPrefijo(\'' + p.pais.replace(/'/g,"\\'") + '\')">' +
      '<span style="font-size:1.2rem;">' + p.bandera + '</span>' +
      '<span style="flex:1;color:var(--text);font-weight:600;">' + p.pais + '</span>' +
      '<span style="color:var(--muted);">' + p.cod + '</span>' +
      '</div>';
  }).join('');
  var list = document.getElementById('aj-prefijo-list');
  if (list) list.innerHTML = html || '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.82rem;">Sin resultados</div>';
}

function ajFiltrarPrefijos(q) {
  var f = _AJ_PREFIJOS.filter(function(p) {
    return p.pais.toLowerCase().includes(q.toLowerCase()) || p.cod.includes(q);
  });
  _ajRenderPrefijos(f);
}

function ajSelPrefijo(pais) {
  var p = _AJ_PREFIJOS.find(function(x) { return x.pais === pais; });
  if (!p) return;
  var val = p.bandera + ' ' + p.cod + ' (' + p.pais + ')';
  var disp = document.getElementById(_ajPrefijoTarget.displayId);
  if (disp) disp.textContent = p.bandera + ' ' + p.cod + ' ' + p.pais;
  if (_ajPrefijoTarget.hiddenId) { var h = document.getElementById(_ajPrefijoTarget.hiddenId); if (h) h.value = val; }
  ajCerrarSheetPrefijo();
}

/* ── Bottom sheet país emisor ─────────────────────────── */
var _ajPaisActual = '';
var _AJ_PAISES = ['Ecuador','Colombia','Venezuela','Perú','Argentina','Chile','México','España','Estados Unidos','Uruguay','Paraguay','Bolivia'];

function ajAbrirSheetPais() {
  var html = _AJ_PAISES.map(function(p) {
    var sel = p === _ajPaisActual;
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;font-size:0.85rem;color:' + (sel ? 'var(--brand)' : 'var(--text)') + ';font-weight:' + (sel ? '700' : '500') + ';" onclick="ajSelPais(\'' + p.replace(/'/g,"\\'") + '\')">' +
      '<span>' + p + '</span>' +
      (sel ? '<span class="material-symbols-outlined" style="font-size:1rem;color:var(--brand);">check</span>' : '') +
      '</div>';
  }).join('') +
  '<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;cursor:pointer;font-size:0.85rem;color:var(--muted);" onclick="ajSelPaisOtro()"><span>Otro...</span><span class="material-symbols-outlined" style="font-size:1rem;">chevron_right</span></div>';
  var list = document.getElementById('aj-pais-list');
  if (list) list.innerHTML = html;
  var ov = document.getElementById('aj-sheet-pais-overlay');
  var sh = document.getElementById('aj-sheet-pais');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
}

function ajCerrarSheetPais() {
  var sh = document.getElementById('aj-sheet-pais');
  var ov = document.getElementById('aj-sheet-pais-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function ajSelPais(pais) {
  _ajPaisActual = pais;
  var disp = document.getElementById('aj-pais-display');
  if (disp) disp.textContent = pais;
  ajCerrarSheetPais();
}

function ajSelPaisOtro() {
  ajCerrarSheetPais();
  ajAbrirSheetTexto('aj-sheet-texto', 'País emisor', 'Escribe el nombre del país', function(v) {
    _ajPaisActual = v;
    var disp = document.getElementById('aj-pais-display');
    if (disp) disp.textContent = v;
  });
}

/* ── Validar teléfono ─────────────────────────────────── */
function ajValidarTel(inp) {
  var v = inp.value.replace(/\D/g, '');
  inp.value = v;
  var hint = inp.nextElementSibling;
  if (v.length > 0 && (v.length < 7 || v.length > 15)) {
    inp.style.borderColor = 'var(--danger)';
    if (hint && hint.classList.contains('datos-hint')) { hint.textContent = 'El número debe tener entre 7 y 15 dígitos.'; hint.style.color = 'var(--danger)'; }
  } else {
    inp.style.borderColor = '';
    if (hint && hint.classList.contains('datos-hint')) { hint.textContent = ''; hint.style.color = ''; }
  }
}

/* ── Guardar cada sub-sección ─────────────────────────── */
function ajGuardarPerfil(btn) {
  var payload = {
    nombreDerby: document.getElementById('aj-nombreDerby').value.trim(),
    numeroDerby: document.getElementById('aj-numeroDerby').value.trim(),
    pronombres: _ajGetPronombres()
  };
  _ajGuardar(payload, btn, 'aj-sub-perfil');
}

function ajGuardarContacto(btn) {
  var tel = document.getElementById('aj-telefono').value.trim();
  if (tel && (tel.length < 7 || tel.length > 15)) { err('err-aj-contacto', 'El número debe tener entre 7 y 15 dígitos.'); return; }
  var prefijoDisp = document.getElementById('aj-prefijo-display');
  var prefijoVal = prefijoDisp ? prefijoDisp.textContent : '';
  var match = _AJ_PREFIJOS.find(function(p) { return prefijoVal.indexOf(p.pais) !== -1; });
  var prefijoGuardar = match ? match.bandera + ' ' + match.cod + ' (' + match.pais + ')' : prefijoVal;
  _ajGuardar({ prefijo: prefijoGuardar, telefono: tel }, btn, 'aj-sub-contacto');
}

function ajGuardarPrivacidad(btn) {
  _ajGuardar({
    fechaPublica: document.getElementById('aj-fechaPublica').checked ? 'Sí' : 'No',
    edadPublica: document.getElementById('aj-edadPublica').checked ? 'Sí' : 'No'
  }, btn, 'aj-sub-privacidad');
}

function ajGuardarLegal(btn) {
  _ajGuardar({
    tipoDocumento: _ajGetSinglePill('aj-tipoDoc-pills'),
    numeroDocumento: document.getElementById('aj-numeroDoc').value.trim(),
    paisExpedicion: _ajPaisActual,
    nombreLegal: document.getElementById('aj-nombreLegal').value.trim()
  }, btn, 'aj-sub-legal');
}

function ajGuardarDireccion(btn) {
  _ajGuardar({
    callePrincipal: document.getElementById('aj-callePrincipal').value.trim(),
    calleSecundaria: document.getElementById('aj-calleSecundaria').value.trim(),
    numeracion: document.getElementById('aj-numeracion').value.trim(),
    sector: document.getElementById('aj-sector').value.trim(),
    canton: _ajGetSinglePill('aj-canton-pills')
  }, btn, 'aj-sub-direccion');
}

function ajGuardarEmerg(btn) {
  var e1pref = document.getElementById('aj-e1prefijo');
  var e2pref = document.getElementById('aj-e2prefijo');
  _ajGuardar({
    emerg1Nombre: document.getElementById('aj-e1nombre').value.trim(),
    emerg1Relacion: _ajGetSinglePill('aj-e1rel-pills'),
    emerg1Prefijo: e1pref ? e1pref.value : '',
    emerg1Telefono: document.getElementById('aj-e1telefono').value.trim(),
    emerg2Nombre: document.getElementById('aj-e2nombre').value.trim(),
    emerg2Relacion: _ajGetSinglePill('aj-e2rel-pills'),
    emerg2Prefijo: e2pref ? e2pref.value : '',
    emerg2Telefono: document.getElementById('aj-e2telefono').value.trim()
  }, btn, 'aj-sub-emerg');
}

function _ajGuardar(payload, btn, subId) {
  if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }
  api({ action: 'actualizarDatosPersona', nombre: E.nombre, token: _getSessionToken(), datos: JSON.stringify(payload) }, function() {
    Object.assign(E.datos, payload);
    if (btn) { btn.textContent = 'Guardado ✓'; btn.classList.add('exito'); setTimeout(function(){ btn.textContent = 'Guardar cambios'; btn.disabled = false; btn.classList.remove('exito'); }, 2000); }
    irEditarDatos();
    cerrarAjSub(subId);
  }, function(e) {
    if (btn) { btn.textContent = 'Guardar cambios'; btn.disabled = false; }
    alert('Error al guardar: ' + (e.message || 'Intenta de nuevo'));
  });
}

function _getSessionToken() {
  try { return localStorage.getItem('session_token') || ''; } catch(e) { return ''; }
}

function _ajFormatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var d = new Date(fechaStr);
  if (isNaN(d.getTime())) return fechaStr;
  return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
}

function ajAbrirSheetLogout() {
  var ov = document.getElementById('aj-sheet-logout-overlay');
  var sh = document.getElementById('aj-sheet-logout');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'block'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
}

function ajCerrarSheetLogout() {
  var sh = document.getElementById('aj-sheet-logout');
  var ov = document.getElementById('aj-sheet-logout-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}
