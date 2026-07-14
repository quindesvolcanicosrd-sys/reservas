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
  // Salud
  var saludVal = document.getElementById('aj-salud-val');
  if (saludVal) {
    var saludPartes = [];
    if (d.enfermedad) saludPartes.push(d.enfermedad);
    if (d.alergias === 'Sí') saludPartes.push('Alergias');
    if (d.medicamentos === 'Sí') saludPartes.push('Medicamentos');
    saludVal.textContent = saludPartes.join(' · ') || 'Completa los datos de salud';
  }
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
  _registrarOverlayAbierto(_cerrarModalPermisos);
}

function _cerrarModalPermisos(porGesto) {
  if (!porGesto) { history.back(); return; }
  var mp = document.getElementById('modal-permisos');
  if (mp) { mp.style.opacity = '0'; setTimeout(function(){ mp.style.display = 'none'; }, 250); }
}

function guardarPermisos() {
  var fecha    = document.getElementById('mp-fecha-iso').value;
  var togFecha = document.getElementById('mp-tog-fecha').classList.contains('toggle-on');
  var togEdad  = document.getElementById('mp-tog-edad').classList.contains('toggle-on');
  var togFoto  = document.getElementById('mp-tog-foto').classList.contains('toggle-on');
  var errEl    = document.getElementById('err-modal-permisos');

  if (!fecha) {
    errEl.textContent = 'La fecha de nacimiento es obligatoria.';
    errEl.style.display = 'block';
    setTimeout(function(){ errEl.style.display = 'none'; }, 4000);
    return;
  }

  var fn = new Date(fecha);
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var edad = hoy.getFullYear() - fn.getUTCFullYear();
  var dm = hoy.getMonth() - fn.getUTCMonth();
  if (dm < 0 || (dm === 0 && hoy.getDate() < fn.getUTCDate())) edad--;
  if (edad < 16) { mostrarModalEdadBloqueo(); return; }

  var btn = document.getElementById('btn-guardar-permisos');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  var fotoUrl = togFoto ? _fotoGoogleUrl : '';

  api({
    action:       'actualizarPerfilGoogle',
    foto:         fotoUrl,
    fechaNac:     fecha,
    guardarFecha: 'si',
    fechaPublica: togFecha ? (togEdad ? 'Sí' : 'No') : 'No',
    edadPublica:  togEdad ? 'Sí' : 'No'
  }, function(res) {
    btn.disabled = false; btn.textContent = 'Guardar y continuar';
    if (res.exito) {
      if (E.datos) {
        E.datos.permisosConfigurados = true;
        if (fotoUrl) E.datos.fotoPerfil = fotoUrl;
      }
      _cerrarModalPermisos();
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
  _cerrarModalPermisos();
}

function mostrarModalEdadBloqueo() {
  var m = document.getElementById('modal-edad-bloqueo');
  if (m) m.style.display = 'flex';
  _registrarOverlayAbierto(cerrarModalEdadBloqueo);
}
function cerrarModalEdadBloqueo(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-edad-bloqueo');
  if (m) m.style.display = 'none';
}

// ─── PIN de acceso (desde modal-permisos) ─────────────────────────────────────
function _mpToggleClick(btn) {
  var on = btn.classList.contains('toggle-on');
  btn.classList.toggle('toggle-on', !on);
  btn.classList.toggle('toggle-off', on);
  btn.setAttribute('aria-pressed', String(!on));
}

function _mpTogglePinClick(btn) {
  var on = btn.classList.contains('toggle-on');
  btn.classList.toggle('toggle-on', !on);
  btn.classList.toggle('toggle-off', on);
  btn.setAttribute('aria-pressed', String(!on));
  if (!on) abrirModalPinConfig();
}

function _mpTogglePinVis() {
  var inp = document.getElementById('mp-pin-input');
  var ico = document.getElementById('mp-pin-ico');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (ico) ico.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
}

function abrirModalPinConfig() {
  var inp = document.getElementById('mp-pin-input');
  if (inp) { inp.value = ''; inp.type = 'password'; }
  var ico = document.getElementById('mp-pin-ico');
  if (ico) ico.textContent = 'visibility';
  var errEl = document.getElementById('err-modal-pin-config');
  if (errEl) errEl.style.display = 'none';
  var m = document.getElementById('modal-pin-config');
  if (m) { m.style.display = 'flex'; m.style.opacity = ''; m.style.animation = 'fadeIn 0.3s ease'; }
}

function cerrarModalPinConfig(guardado) {
  var m = document.getElementById('modal-pin-config');
  if (m) { m.style.opacity = '0'; setTimeout(function(){ m.style.display = 'none'; }, 250); }
  if (!guardado) {
    var tog = document.getElementById('mp-tog-pin');
    if (tog) { tog.classList.remove('toggle-on'); tog.classList.add('toggle-off'); tog.setAttribute('aria-pressed', 'false'); }
  }
}

function guardarPinConfig() {
  var inp   = document.getElementById('mp-pin-input');
  var pin   = (inp && inp.value || '').trim();
  var errEl = document.getElementById('err-modal-pin-config');

  if (!/^[0-9]{4}$/.test(pin)) {
    errEl.textContent = 'Ingresa un PIN de 4 dígitos.';
    errEl.style.display = 'block';
    setTimeout(function(){ errEl.style.display = 'none'; }, 4000);
    return;
  }

  var btn = document.getElementById('btn-guardar-pin-config');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  sha256Hex(pin + '|' + E.nombre).then(function(hash) {
    api({ action: 'actualizarPin', nombre: E.nombre, pinHash: hash }, function(res) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      if (res.exito) {
        cerrarModalPinConfig(true);
      } else {
        errEl.textContent = res.error || 'Error al guardar.';
        errEl.style.display = 'block';
        setTimeout(function(){ errEl.style.display = 'none'; }, 4000);
      }
    }, function(e) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      errEl.textContent = 'Error de conexión: ' + e.message;
      errEl.style.display = 'block';
    });
  });
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
  var ov = document.getElementById('modal-eliminar-cuenta-overlay');
  var sh = document.getElementById('modal-eliminar-cuenta');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'block'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  setTimeout(function() { document.getElementById('mec-input').focus(); }, 300);
  _registrarOverlayAbierto(mecCerrar);
}

function mecValidar() {
  var val = (document.getElementById('mec-input').value || '').trim();
  var btn = document.getElementById('mec-btn-confirmar');
  var ok = val === E.nombre;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '0.4';
  btn.style.cursor = ok ? 'pointer' : 'not-allowed';
}

function mecCerrar(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('modal-eliminar-cuenta');
  var ov = document.getElementById('modal-eliminar-cuenta-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
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

// ─── DATE PICKER (Mis Datos — ddp-*) ─────────────────────────────────────────
var _MESES_DDP = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var _ddpSt = { vy:1990, vm:0, sy:null, sm:null, sd:null, yearMode:false, monthMode:false };
var _ddpTarget = null; // { hiddenId, displayId } o { callback(iso, label) } — configurado en cada apertura

function abrirPickerMisDatos(target) {
  _ddpTarget = target || null;
  var hiddenId = (_ddpTarget && _ddpTarget.hiddenId) || 'd-fechaNacimiento';
  var hiddenEl = document.getElementById(hiddenId);
  var iso = hiddenEl ? hiddenEl.value : '';
  if (iso) { var p=iso.split('-'); if(p.length===3){ _ddpSt.vy=parseInt(p[0]); _ddpSt.vm=parseInt(p[1])-1; _ddpSt.sy=parseInt(p[0]); _ddpSt.sm=parseInt(p[1])-1; _ddpSt.sd=parseInt(p[2]); } }
  else { _ddpSt.vy=1990; _ddpSt.vm=0; _ddpSt.sy=null; _ddpSt.sm=null; _ddpSt.sd=null; }
  _ddpSt.yearMode=false; _ddpSt.monthMode=false;
  _ddpRender();
  document.getElementById('ddp-modal').classList.add('active');
  document.body.style.overflow='hidden';
  _registrarOverlayAbierto(_ddpCerrar);
}
function _ddpCerrar(porGesto) {
  if (!porGesto) { history.back(); return; }
  document.getElementById('ddp-modal').classList.remove('active'); document.body.style.overflow='';
}
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
    var canc=document.getElementById('ddp-cancelar'); if(canc)canc.onclick=function(){_ddpCerrar();};
    var ok=document.getElementById('ddp-ok');
    if(ok)ok.onclick=function(){
      if(!_ddpSt.sd)return;
      var iso=_ddpSt.sy+'-'+String(_ddpSt.sm+1).padStart(2,'0')+'-'+String(_ddpSt.sd).padStart(2,'0');
      var label=_ddpSt.sd+' de '+_MESES_DDP[_ddpSt.sm]+' de '+_ddpSt.sy;
      if (_ddpTarget && typeof _ddpTarget.callback === 'function') {
        _ddpTarget.callback(iso, label);
      } else {
        var hiddenId = (_ddpTarget && _ddpTarget.hiddenId) || 'd-fechaNacimiento';
        var displayId = (_ddpTarget && _ddpTarget.displayId) || 'ddp-trigger-display';
        var hidden=document.getElementById(hiddenId); if(hidden) hidden.value=iso;
        var disp=document.getElementById(displayId);
        if(disp){disp.textContent=label;disp.classList.remove('fnac-placeholder');}
      }
      _ddpCerrar();
    };
  });
})();

/* ── Ajustes: navegación de sub-pantallas ─────────────── */
var _ajSubAbierto = null; // id del aj-sub-* actualmente abierto, o null

function irAjSub(id, desdeHistorial) {
  var sub = document.getElementById(id);
  if (!sub) return;
  // Defensivo: #cta-footer-salud es un position:fixed a nivel <body>, ajeno
  // al propio aj-sub-salud — si quedó visible (wizard a mitad de camino) y
  // se entra a OTRO sub-panel sin pasar por _saludMostrarEstado(), quedaría
  // flotando sobre la pantalla equivocada sin esto.
  if (id !== 'aj-sub-salud' && typeof _saludOcultarFooter === 'function') _saludOcultarFooter();
  _ajCargarSub(id);
  sub.classList.add('activa');
  _ajSubAbierto = id;
  if (!desdeHistorial) {
    history.pushState({ pantalla: 's-datos', ajSub: id }, '', '#' + id);
  }
}

function cerrarAjSub(id, desdeHistorial) {
  var sub = document.getElementById(id);
  if (sub) {
    sub.classList.remove('activa');
    _ajSubAbierto = null;
  }
  // Mismo motivo que en irAjSub: cerrar aj-sub-salud por el gesto nativo de
  // "atrás" (popstate) no pasa por saludCerrarWizard()/_saludMostrarEstado().
  if (id === 'aj-sub-salud' && typeof _saludOcultarFooter === 'function') _saludOcultarFooter();
  if (!desdeHistorial) {
    history.pushState({ pantalla: 's-datos' }, '', '#s-datos');
  }
}

function _ajSetDatoVal(id, valor, vacioTexto, marcarVacio) {
  var el = document.getElementById(id); if (!el) return;
  if (valor) { el.textContent = valor; if (marcarVacio) el.classList.remove('vacio'); }
  else { el.textContent = vacioTexto; if (marcarVacio) el.classList.add('vacio'); }
}

/* Oculta/muestra filas .aj-dato-row de campos opcionales dentro de un mismo
   .aj-group (ej. resumen de Salud) según tengan valor o no, sin envolver
   cada fila en su propio wrap: :last-child pierde el border-bottom via CSS,
   así que si se ocultan filas del medio con display:none, el fix tiene que
   ser en JS — se recalcula qué fila visible queda última y se le fuerza
   borderBottom:'none' inline, restaurando '' (el borde de la clase) en el
   resto. Si el .aj-group entero queda sin ninguna fila visible, se oculta
   también (contenedor vacío con fondo redondeado no debe mostrarse). */
function _ajAjustarFilasOpcionales(filas) {
  var visibles = [];
  var groupEl = null;
  filas.forEach(function(f) {
    var val = document.getElementById(f.id);
    var row = val ? val.closest('.aj-dato-row') : null;
    if (!row) return;
    if (!groupEl) groupEl = row.parentElement;
    var mostrar = !f.opcional || !!f.valor;
    row.style.display = mostrar ? '' : 'none';
    if (mostrar) visibles.push(row);
  });
  visibles.forEach(function(row, i) { row.style.borderBottom = (i === visibles.length - 1) ? 'none' : ''; });
  if (groupEl) groupEl.style.display = visibles.length ? '' : 'none';
}

function _ajCargarSub(id) {
  var d = E.datos; if (!d) return;
  if (id === 'aj-sub-equip') {
    var d = E.datos || {};
    document.getElementById('aj-equip-pat-val').textContent = d.necesitaPatines === 'Sí' ? 'Talla ' + (d.talla || '—') : 'No necesitas patines';
    document.getElementById('aj-equip-protec-val').textContent = d.necesitaProtecciones || '—';
    return;
  }
  if (id === 'aj-sub-perfil') {
    _ajSetDatoVal('aj-nombre-display', d.nombre || E.nombre, '—', false);
    _ajSetDatoVal('aj-nombreDerby-val', d.nombreDerby, '—', false);
    _ajSetDatoVal('aj-numeroDerby-val', d.numeroDerby, 'Sin número asignado', true);
    _ajSetDatoVal('aj-pron-val', d.pronombres, '—', false);
  } else if (id === 'aj-sub-contacto') {
    _ajSetDatoVal('aj-email-display', d.email, '—', false);
    _ajSetPrefijo('aj-prefijo-display', null, d.prefijo || '');
    _ajSetDatoVal('aj-telefono-val', d.telefono, '—', false);
  } else if (id === 'aj-sub-privacidad') {
    var fnRaw = (d.fechaNacimiento || '').toString().trim();
    _ajSetDatoVal('aj-fecha-display', fnRaw ? _ajFormatearFecha(fnRaw) : '', '—', false);
    var btnF = document.getElementById('aj-fechaPublica');
    if (btnF) { var onF = d.fechaPublica === 'Sí'; btnF.classList.toggle('toggle-on', onF); btnF.classList.toggle('toggle-off', !onF); btnF.setAttribute('aria-pressed', String(onF)); }
    var btnE = document.getElementById('aj-edadPublica');
    if (btnE) { var onE = d.edadPublica === 'Sí'; btnE.classList.toggle('toggle-on', onE); btnE.classList.toggle('toggle-off', !onE); btnE.setAttribute('aria-pressed', String(onE)); }
  } else if (id === 'aj-sub-legal') {
    _ajSetDatoVal('aj-tipoDoc-val', d.tipoDocumento, '—', true);
    _ajSetDatoVal('aj-numeroDoc-val', d.numeroDocumento, '—', true);
    _ajSetDatoVal('aj-nombreLegal-val', d.nombreLegal, '—', true);
  } else if (id === 'aj-sub-direccion') {
    _ajSetDatoVal('aj-callePrincipal-val', d.callePrincipal, '—', true);
    _ajSetDatoVal('aj-calleSecundaria-val', d.calleSecundaria, '—', true);
    _ajSetDatoVal('aj-numeracion-val', d.numeracion, '—', true);
    _ajSetDatoVal('aj-sector-val', d.sector, '—', true);
    _ajSetDatoVal('aj-canton-val', d.canton, '—', true);
    _ajInicializarMapaDireccion();
  } else if (id === 'aj-sub-emerg') {
    _ajSetDatoVal('aj-em1nombre-val', d.emerg1Nombre, '—', true);
    _ajSetDatoVal('aj-em1relacion-val', d.emerg1Relacion, '—', true);
    _ajSetPrefijo('aj-em1prefijo-display', null, d.emerg1Prefijo || '');
    _ajSetDatoVal('aj-em1tel-val', d.emerg1Telefono, '—', true);
    var tieneEmerg2 = !!(d.emerg2Nombre || d.emerg2Relacion || d.emerg2Prefijo || d.emerg2Telefono);
    var wrap = document.getElementById('aj-emerg2-wrap');
    var btnAgregar = document.getElementById('aj-btn-agregar-em2');
    if (wrap) wrap.style.display = tieneEmerg2 ? 'block' : 'none';
    if (btnAgregar) btnAgregar.style.display = tieneEmerg2 ? 'none' : '';
    _ajSetDatoVal('aj-em2nombre-val', d.emerg2Nombre, '—', true);
    _ajSetDatoVal('aj-em2relacion-val', d.emerg2Relacion, '—', true);
    _ajSetPrefijo('aj-em2prefijo-display', null, d.emerg2Prefijo || '');
    _ajSetDatoVal('aj-em2tel-val', d.emerg2Telefono, '—', true);
  } else if (id === 'aj-sub-salud') {
    _ajSetDatoVal('aj-enfermedad-val', d.enfermedad, '—', true);
    _ajSetDatoVal('aj-dieta-val', d.dieta, '—', true);
    _ajSetDatoVal('aj-antecedentes-val', d.antecedentes, '—', true);
    _ajSetDatoVal('aj-atencionMedica-val', d.atencionMedica, '—', true);
    _ajSetDatoVal('aj-alergias-val', d.alergias, '—', true);
    _ajSetDatoVal('aj-alergiasDesc-val', d.alergiasDesc, '—', true);
    _ajSetDatoVal('aj-medicamentos-val', d.medicamentos, '—', true);
    _ajSetDatoVal('aj-medicamentosDesc-val', d.medicamentosDesc, '—', true);
    _ajSetDatoVal('aj-seguro-val', d.seguro, '—', true);
    _ajSetDatoVal('aj-seguroContacto-val', d.seguroContacto, '—', true);
    /* enfermedad/dieta/antecedentes/seguro/seguroContacto son opcionales en
       el wizard (se pueden omitir/dejar en blanco) — su fila se oculta por
       completo si están vacíos. atencionMedica/alergias/medicamentos son
       obligatorios, siempre visibles. */
    _ajAjustarFilasOpcionales([
      { id: 'aj-enfermedad-val', valor: d.enfermedad, opcional: true },
      { id: 'aj-dieta-val', valor: d.dieta, opcional: true },
      { id: 'aj-antecedentes-val', valor: d.antecedentes, opcional: true },
      { id: 'aj-atencionMedica-val', valor: d.atencionMedica, opcional: false }
    ]);
    _ajAjustarFilasOpcionales([
      { id: 'aj-seguro-val', valor: d.seguro, opcional: true },
      { id: 'aj-seguroContacto-val', valor: d.seguroContacto, opcional: true }
    ]);
    var wrapAlergiasDesc = document.getElementById('aj-alergiasDesc-wrap');
    /* alergias='No' nunca visita el paso 3 (detalle) en el wizard — pero
       'Tal vez' sí (saludContinuar2() solo salta el paso 3 si es 'No'), así
       que el gate no debe limitarse a 'Sí'. Además exige texto no vacío:
       se pudo marcar 'Sí'/'Tal vez' y dejar la descripción en blanco. */
    if (wrapAlergiasDesc) wrapAlergiasDesc.style.display = (d.alergias !== 'No' && !!d.alergiasDesc) ? 'block' : 'none';
    var wrapMedicamentosDesc = document.getElementById('aj-medicamentosDesc-wrap');
    if (wrapMedicamentosDesc) wrapMedicamentosDesc.style.display = (d.medicamentos === 'Sí' && !!d.medicamentosDesc) ? 'block' : 'none';
    /* Ficha nunca completada: entra directo al wizard en vez de mostrar
       primero la card "Completar ficha de salud" — si el usuario cancela
       (saludBack() en el paso 1 -> saludCerrarWizard() -> _saludMostrarEstado()),
       esa llamada no pasa por acá, así que no hay riesgo de loop; la card
       queda como fallback hasta que el usuario reabra la subsección o toque
       "Volver a completar el paso a paso" a mano. */
    if (!d.atencionMedica) { _saludAutoLanzado = true; saludIniciarWizard(); }
    else { _saludMostrarEstado(); }
  }
}

function ajTogglePill(el) {
  el.classList.toggle('activa');
}

/* ── Bottom sheet genérico de texto ───────────────────── */
var _ajSheetTextoCallback = null;
var _ajSheetTextoModo = 'texto'; // 'texto' | 'pills-multi' | 'pills-single'
// Validador opcional del modo 'texto' (ej. longitud de teléfono según país,
// ver ajAbrirSheetTelefono()) — function(v){ return mensajeDeError || null; }.
// Se resetea a null al abrir CUALQUIER sheet de texto para que abrir otro
// campo después de teléfono no herede su validación.
var _ajSheetTextoValidador = null;
// Contador de generación: con el rediseño de filas este mismo sheet se abre/cierra
// mucho más seguido (una fila = un ciclo abrir→guardar→cerrar) que antes, así que
// es fácil abrir un sheet nuevo dentro de la ventana de 350ms en que el cierre
// anterior todavía tiene pendiente su setTimeout de limpieza — sin esta guarda,
// ese cleanup tardío podía nulear el callback del sheet nuevo (o volver a ocultarlo)
// aunque ya estuviera abierto de nuevo. Cada abrir incrementa el contador; el cierre
// solo aplica su limpieza si nadie abrió un sheet nuevo mientras tanto.
var _ajSheetTextoGen = 0;
function ajAbrirSheetTexto(sheetId, titulo, placeholder, callback) {
  _ajSheetTextoGen++;
  _ajSheetTextoCallback = callback;
  _ajSheetTextoModo = 'texto';
  _ajSheetTextoValidador = null;
  var tit = document.getElementById('aj-sheet-texto-titulo');
  var inp = document.getElementById('aj-sheet-texto-input');
  var pills = document.getElementById('aj-sheet-texto-pills');
  var sub = document.getElementById('aj-sheet-texto-subtitulo');
  var btnConfirmar = document.getElementById('aj-sheet-texto-btn-confirmar');
  var errEl = document.getElementById('aj-sheet-texto-error');
  if (sub) sub.style.display = 'none';
  if (pills) { pills.style.display = 'none'; pills.innerHTML = ''; }
  if (errEl) errEl.style.display = 'none';
  if (btnConfirmar) btnConfirmar.style.display = '';
  if (tit) tit.textContent = titulo;
  if (inp) { inp.style.display = ''; inp.value = ''; inp.placeholder = placeholder; inp.oninput = null; }
  var ov = document.getElementById('aj-sheet-texto-overlay');
  var sh = document.getElementById('aj-sheet-texto');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  setTimeout(function(){ var i = document.getElementById('aj-sheet-texto-input'); if (i && _ajSheetTextoModo === 'texto') i.focus(); }, 400);
  _registrarOverlayAbierto(ajCerrarSheetTexto);
}

/* ── Bottom sheet de texto en modo pills (pronombres/relación/tipo de doc) ── */
function _ajAbrirSheetTextoPills(titulo, subtitulo, modo, pillsHtml, callback) {
  _ajSheetTextoGen++;
  _ajSheetTextoCallback = callback;
  _ajSheetTextoModo = modo;
  var tit = document.getElementById('aj-sheet-texto-titulo');
  var inp = document.getElementById('aj-sheet-texto-input');
  var pills = document.getElementById('aj-sheet-texto-pills');
  var sub = document.getElementById('aj-sheet-texto-subtitulo');
  var btnConfirmar = document.getElementById('aj-sheet-texto-btn-confirmar');
  if (tit) tit.textContent = titulo;
  if (sub) { if (subtitulo) { sub.textContent = subtitulo; sub.style.display = 'block'; } else { sub.style.display = 'none'; } }
  if (inp) inp.style.display = 'none';
  if (pills) { pills.innerHTML = pillsHtml; pills.style.display = 'flex'; }
  if (btnConfirmar) btnConfirmar.style.display = (modo === 'pills-single') ? 'none' : '';
  var ov = document.getElementById('aj-sheet-texto-overlay');
  var sh = document.getElementById('aj-sheet-texto');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(ajCerrarSheetTexto);
}

function _ajSheetTextoPillSingleClick(el) {
  var v = el.dataset.val;
  if (_ajSheetTextoCallback) _ajSheetTextoCallback(v);
  ajCerrarSheetTexto();
}

function ajCerrarSheetTexto(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('aj-sheet-texto');
  var ov = document.getElementById('aj-sheet-texto-overlay');
  var genAlCerrar = _ajSheetTextoGen;
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){
    if (_ajSheetTextoGen !== genAlCerrar) return; // se abrió un sheet nuevo mientras este cerraba
    if (sh) sh.style.display = 'none';
    if (ov) ov.style.display = 'none';
    _ajSheetTextoCallback = null;
  }, 350);
}

function ajConfirmarSheetTexto() {
  if (_ajSheetTextoModo === 'pills-multi') {
    var vals = [];
    document.querySelectorAll('#aj-sheet-texto-pills .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
    if (!vals.length) return;
    if (_ajSheetTextoCallback) _ajSheetTextoCallback(vals.join(', '));
    ajCerrarSheetTexto();
    return;
  }
  var v = (document.getElementById('aj-sheet-texto-input').value || '').trim();
  if (!v) return;
  if (_ajSheetTextoValidador) {
    var msgError = _ajSheetTextoValidador(v);
    if (msgError) {
      var errEl = document.getElementById('aj-sheet-texto-error');
      if (errEl) { errEl.textContent = msgError; errEl.style.display = 'block'; }
      return;
    }
  }
  if (_ajSheetTextoCallback) _ajSheetTextoCallback(v);
  ajCerrarSheetTexto();
}

/* ── Bottom sheet prefijo ─────────────────────────────── */
var _AJ_PREFIJOS = [
  {pais:'Ecuador', bandera:'🇪🇨', cod:'+593', min:10, max:10},
  {pais:'Colombia', bandera:'🇨🇴', cod:'+57', min:10, max:10},
  {pais:'Perú', bandera:'🇵🇪', cod:'+51', min:9, max:9},
  {pais:'Venezuela', bandera:'🇻🇪', cod:'+58', min:10, max:10},
  {pais:'Argentina', bandera:'🇦🇷', cod:'+54', min:10, max:11},
  {pais:'Chile', bandera:'🇨🇱', cod:'+56', min:9, max:9},
  {pais:'México', bandera:'🇲🇽', cod:'+52', min:10, max:10},
  {pais:'España', bandera:'🇪🇸', cod:'+34', min:9, max:9},
  {pais:'Estados Unidos', bandera:'🇺🇸', cod:'+1', min:10, max:10},
  {pais:'Uruguay', bandera:'🇺🇾', cod:'+598', min:8, max:9},
  {pais:'Paraguay', bandera:'🇵🇾', cod:'+595', min:9, max:9},
  {pais:'Bolivia', bandera:'🇧🇴', cod:'+591', min:8, max:8},
];
var _ajPrefijoTarget = { displayId: 'aj-prefijo-display', campo: 'prefijo' };

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

function ajAbrirSheetPrefijo(displayId, campo) {
  _ajPrefijoTarget = { displayId: displayId || 'aj-prefijo-display', campo: campo || 'prefijo' };
  _ajRenderPrefijos(_AJ_PREFIJOS);
  var ov = document.getElementById('aj-sheet-prefijo-overlay');
  var sh = document.getElementById('aj-sheet-prefijo');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  var s = document.getElementById('aj-prefijo-search'); if (s) s.value = '';
  _registrarOverlayAbierto(ajCerrarSheetPrefijo);
}

function ajCerrarSheetPrefijo(porGesto) {
  if (!porGesto) { history.back(); return; }
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
  var payload = {};
  payload[_ajPrefijoTarget.campo] = val;
  _ajGuardar(payload);
  ajCerrarSheetPrefijo();
}

/* ── Bottom sheet país emisor ─────────────────────────── */
var _ajPaisActual = '';
var _AJ_PAISES = [
  { continente: 'América', paises: ['Antigua y Barbuda','Argentina','Bahamas','Barbados','Belice','Bolivia','Brasil','Canadá','Chile','Colombia','Costa Rica','Cuba','Dominica','Ecuador','El Salvador','Estados Unidos','Granada','Guatemala','Guyana','Haití','Honduras','Jamaica','México','Nicaragua','Panamá','Paraguay','Perú','República Dominicana','San Cristóbal y Nieves','San Vicente y las Granadinas','Santa Lucía','Surinam','Trinidad y Tobago','Uruguay','Venezuela'] },
  { continente: 'Europa', paises: ['Albania','Alemania','Andorra','Austria','Bélgica','Bielorrusia','Bosnia y Herzegovina','Bulgaria','Chipre','Croacia','Dinamarca','Eslovaquia','Eslovenia','España','Estonia','Finlandia','Francia','Grecia','Hungría','Irlanda','Islandia','Italia','Letonia','Liechtenstein','Lituania','Luxemburgo','Macedonia del Norte','Malta','Moldavia','Mónaco','Montenegro','Noruega','Países Bajos','Polonia','Portugal','Reino Unido','República Checa','Rumania','Rusia','San Marino','Serbia','Suecia','Suiza','Ucrania','Vaticano'] },
  { continente: 'Asia', paises: ['Afganistán','Arabia Saudita','Armenia','Azerbaiyán','Bangladés','Baréin','Brunéi','Bután','Camboya','Catar','China','Corea del Norte','Corea del Sur','Emiratos Árabes Unidos','Filipinas','Georgia','India','Indonesia','Irak','Irán','Israel','Japón','Jordania','Kazajistán','Kirguistán','Kuwait','Laos','Líbano','Malasia','Maldivas','Mongolia','Myanmar','Nepal','Omán','Pakistán','Palestina','Singapur','Siria','Sri Lanka','Tailandia','Tayikistán','Timor Oriental','Turkmenistán','Turquía','Uzbekistán','Vietnam','Yemen'] },
  { continente: 'África', paises: ['Angola','Argelia','Benín','Botsuana','Burkina Faso','Burundi','Cabo Verde','Camerún','Chad','Comoras','Costa de Marfil','Egipto','Eritrea','Esuatini','Etiopía','Gabón','Gambia','Ghana','Guinea','Guinea Ecuatorial','Guinea-Bisáu','Kenia','Lesoto','Liberia','Libia','Madagascar','Malaui','Malí','Marruecos','Mauricio','Mauritania','Mozambique','Namibia','Níger','Nigeria','República Centroafricana','República del Congo','República Democrática del Congo','Ruanda','Santo Tomé y Príncipe','Senegal','Seychelles','Sierra Leona','Somalia','Sudáfrica','Sudán','Sudán del Sur','Tanzania','Togo','Túnez','Uganda','Yibuti','Zambia','Zimbabue'] },
  { continente: 'Oceanía', paises: ['Australia','Fiyi','Islas Marshall','Islas Salomón','Kiribati','Micronesia','Nauru','Nueva Zelanda','Palaos','Papúa Nueva Guinea','Samoa','Tonga','Tuvalu','Vanuatu'] },
];

function _ajRenderPaises(busqueda) {
  var html = '';
  var q = (busqueda || '').toLowerCase().trim();
  _AJ_PAISES.forEach(function(grupo) {
    var paises = q ? grupo.paises.filter(function(p) { return p.toLowerCase().includes(q); }) : grupo.paises;
    if (!paises.length) return;
    if (!q) html += '<div style="padding:8px 16px 4px;font-size:0.68rem;font-weight:700;color:var(--brand-60);text-transform:uppercase;letter-spacing:0.08em;">' + grupo.continente + '</div>';
    paises.forEach(function(p) {
      var sel = p === _ajPaisActual;
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;font-size:0.85rem;color:' + (sel ? 'var(--brand)' : 'var(--text)') + ';font-weight:' + (sel ? '700' : '500') + ';" onclick="ajSelPais(\'' + p.replace(/'/g,"\\'") + '\')">' +
        '<span>' + p + '</span>' +
        (sel ? '<span class="material-symbols-outlined" style="font-size:1rem;color:var(--brand);">check</span>' : '') +
        '</div>';
    });
  });
  var list = document.getElementById('aj-pais-list');
  if (list) list.innerHTML = html || '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.82rem;">Sin resultados</div>';
}

function ajFiltrarPaises(q) { _ajRenderPaises(q); }

function ajAbrirSheetPais() {
  var s = document.getElementById('aj-pais-search'); if (s) s.value = '';
  _ajRenderPaises('');
  var ov = document.getElementById('aj-sheet-pais-overlay');
  var sh = document.getElementById('aj-sheet-pais');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  _registrarOverlayAbierto(ajCerrarSheetPais);
}

function ajCerrarSheetPais(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('aj-sheet-pais');
  var ov = document.getElementById('aj-sheet-pais-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function ajSelPais(pais) {
  _ajPaisActual = pais;
  var disp = document.getElementById('aj-pais-val');
  if (disp) { disp.textContent = pais; disp.classList.remove('vacio'); }
  _ajGuardar({ pais: pais });
  ajCerrarSheetPais();
}


/* ── Filas de dato: bottom sheet de texto genérico ────── */
function ajAbrirSheetTextoGenerico(titulo, subtitulo, displayId, campo, placeholder, onGuardado) {
  var valorActual = (E.datos && E.datos[campo]) || '';
  ajAbrirSheetTexto('aj-sheet-texto', titulo, placeholder, function(v) {
    var payload = {}; payload[campo] = v;
    _ajGuardar(payload);
    var disp = document.getElementById(displayId);
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
    if (typeof onGuardado === 'function') onGuardado(v);
  });
  var sub = document.getElementById('aj-sheet-texto-subtitulo');
  if (sub) { if (subtitulo) { sub.textContent = subtitulo; sub.style.display = 'block'; } else { sub.style.display = 'none'; } }
  var inp = document.getElementById('aj-sheet-texto-input');
  if (inp) inp.value = valorActual;
}

/* Envuelve el sheet genérico con validación de teléfono: solo dígitos
   (filtrados en tiempo real) y longitud mínima/máxima según el país del
   prefijo ya seleccionado (campo prefijoCampo, ver _AJ_PREFIJOS) — mismo
   criterio que ya usa inscripción. */
function ajAbrirSheetTelefono(titulo, displayId, campo, prefijoCampo) {
  var valorActual = (E.datos && E.datos[campo]) || '';
  var prefVal = (E.datos && E.datos[prefijoCampo]) || '';
  var pais = _AJ_PREFIJOS.find(function(p) {
    return prefVal.indexOf(p.pais) !== -1 || prefVal.indexOf(p.cod) !== -1;
  });
  var min = pais ? pais.min : 7, max = pais ? pais.max : 15;

  ajAbrirSheetTexto('aj-sheet-texto', titulo, 'Ej: 0962773052', function(v) {
    var payload = {}; payload[campo] = v;
    _ajGuardar(payload);
    var disp = document.getElementById(displayId);
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
  });

  var sub = document.getElementById('aj-sheet-texto-subtitulo');
  if (sub) {
    sub.textContent = 'Entre ' + min + ' y ' + max + ' dígitos' + (pais ? ' para ' + pais.pais : '') + '. Sin espacios ni caracteres especiales.';
    sub.style.display = 'block';
  }
  var errEl = document.getElementById('aj-sheet-texto-error');
  if (errEl) errEl.style.display = 'none';

  var inp = document.getElementById('aj-sheet-texto-input');
  if (inp) {
    inp.value = valorActual;
    inp.oninput = function() { limpiarTelefono(this); };
  }

  _ajSheetTextoValidador = function(v) {
    if (v.length < min || v.length > max) {
      return 'Debe tener entre ' + min + ' y ' + max + ' dígitos' + (pais ? ' para ' + pais.pais : '') + '.';
    }
    return null;
  };
}

/* ── Pronombres (pills multiselect) ───────────────────── */
function ajAbrirSheetPronombres() {
  var actuales = ((E.datos && E.datos.pronombres) || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var opciones = ['Ella', 'Él', 'Elle'];
  var html = opciones.map(function(o) {
    var sel = actuales.indexOf(o) !== -1;
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o + '" onclick="ajTogglePill(this)">' + o + '</span>';
  }).join('');
  _ajAbrirSheetTextoPills('Pronombres', 'Selecciona todos los que apliquen.', 'pills-multi', html, function(valorJoin) {
    _ajGuardar({
      pronombres: valorJoin,
      nombreDerby: (E.datos && E.datos.nombreDerby) || '',
      numeroDerby: (E.datos && E.datos.numeroDerby) || ''
    });
    var disp = document.getElementById('aj-pron-val');
    if (disp) disp.textContent = valorJoin;
  });
}

/* ── Tipo de documento (pills single, guarda al tocar) ── */
function ajAbrirSheetTipoDoc() {
  var actual = (E.datos && E.datos.tipoDocumento) || '';
  var opciones = ['Cédula', 'DNI', 'Pasaporte', 'Otro'];
  var html = opciones.map(function(o) {
    var sel = o === actual;
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o + '" onclick="_ajSheetTextoPillSingleClick(this)">' + o + '</span>';
  }).join('');
  _ajAbrirSheetTextoPills('Tipo de documento', '', 'pills-single', html, function(v) {
    _ajGuardar({ tipoDocumento: v });
    var disp = document.getElementById('aj-tipoDoc-val');
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
  });
}

/* ── Relación de contacto de emergencia (pills single + "Otra" con texto
   libre, mismo patrón que el chip "Otro" del wizard de Salud: la pill
   revela un campo de texto en vez de guardar el literal "Otra") ── */
function ajAbrirSheetRelacion(campo, displayId) {
  var actual = (E.datos && E.datos[campo]) || '';
  var opciones = ['Madre', 'Padre', 'Pareja', 'Hermana/o', 'Amiga/o', 'Familiar', 'Otra'];
  var esOtra = !!(actual && opciones.indexOf(actual) === -1);
  var html = opciones.map(function(o) {
    if (o === 'Otra') {
      return '<span class="aj-pill' + (esOtra ? ' activa aj-pill-otro-lleno' : '') + '" data-val="Otra" onclick="_ajRelacionOtraClick(this)"><span class="aj-pill-otro-txt">Otra</span><span class="aj-pill-otro-x material-symbols-outlined" onclick="event.stopPropagation();_ajRelacionOtraLimpiar(this)">close</span></span>';
    }
    var sel = o === actual;
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o + '" onclick="_ajSheetTextoPillSingleClick(this)">' + o + '</span>';
  }).join('');
  _ajAbrirSheetTextoPills('Relación', '', 'pills-single', html, function(v) {
    var payload = {}; payload[campo] = v;
    _ajGuardar(payload);
    var disp = document.getElementById(displayId);
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
  });
  if (esOtra) {
    var elOtra = document.querySelector('#aj-sheet-texto-pills .aj-pill[data-val="Otra"]');
    if (elOtra) { var txt = elOtra.querySelector('.aj-pill-otro-txt'); if (txt) txt.textContent = actual; }
    var inp = document.getElementById('aj-sheet-texto-input');
    var btnConfirmar = document.getElementById('aj-sheet-texto-btn-confirmar');
    if (inp) { inp.style.display = ''; inp.placeholder = 'Especifica la relación'; inp.value = actual; }
    if (btnConfirmar) btnConfirmar.style.display = '';
  }
}

/* onclick de la pill "Otra": revela el input de texto compartido del sheet
   (#aj-sheet-texto-input) en vez de guardar el literal "Otra" — el propio
   botón "Guardar" del sheet (ajConfirmarSheetTexto(), sin tocar) ya sabe
   leer ese input y confirmar en modo pills-single. */
function _ajRelacionOtraClick(el) {
  document.querySelectorAll('#aj-sheet-texto-pills .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  el.classList.add('activa');
  var inp = document.getElementById('aj-sheet-texto-input');
  var btnConfirmar = document.getElementById('aj-sheet-texto-btn-confirmar');
  if (inp) {
    inp.style.display = '';
    inp.placeholder = 'Especifica la relación';
    inp.value = el.classList.contains('aj-pill-otro-lleno') ? ((el.querySelector('.aj-pill-otro-txt') || {}).textContent || '') : '';
    setTimeout(function() { inp.focus(); }, 50);
  }
  if (btnConfirmar) btnConfirmar.style.display = '';
}

/* onclick de la X del chip "Otra": limpia el texto y oculta el input,
   dejando la pill igual que si nunca se hubiera usado. */
function _ajRelacionOtraLimpiar(xEl) {
  var el = xEl.closest('.aj-pill');
  if (el) {
    el.classList.remove('activa', 'aj-pill-otro-lleno');
    var txt = el.querySelector('.aj-pill-otro-txt'); if (txt) txt.textContent = 'Otra';
  }
  var inp = document.getElementById('aj-sheet-texto-input');
  if (inp) { inp.style.display = 'none'; inp.value = ''; }
  var btnConfirmar = document.getElementById('aj-sheet-texto-btn-confirmar');
  if (btnConfirmar) btnConfirmar.style.display = 'none';
}

/* ── Sí/No genérico (pills single, con reveal opcional de fila condicionada) ── */
function ajAbrirSheetSiNo(titulo, campo, displayId, condWrapId) {
  var actual = (E.datos && E.datos[campo]) || '';
  var opciones = ['Sí', 'No'];
  var html = opciones.map(function(o) {
    var sel = o === actual;
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o + '" onclick="_ajSheetTextoPillSingleClick(this)">' + o + '</span>';
  }).join('');
  _ajAbrirSheetTextoPills(titulo, '', 'pills-single', html, function(v) {
    var payload = {}; payload[campo] = v;
    _ajGuardar(payload);
    var disp = document.getElementById(displayId);
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
    if (condWrapId) {
      var wrap = document.getElementById(condWrapId);
      if (wrap) wrap.style.display = (v === 'Sí') ? 'block' : 'none';
    }
  });
}

/* ── Wizard "Ficha de salud" (aj-sub-salud) ─────────────
   Reemplaza las filas planas por un paso a paso propio, mismo motor visual
   que inscMostrarPaso()/insc-prog de inscripcion/inscripcion.js (array de
   pasos + índice actual + dots de progreso), adaptado a un flujo interno
   dentro del panel en vez de una pantalla completa. Un solo _ajGuardar() al
   terminar el flujo (no campo por campo) — ver _saludFinalizarWizard(). */
var _SALUD_STEPS = ['salud-paso-0','salud-paso-1','salud-paso-2','salud-paso-3','salud-paso-4','salud-paso-5','salud-paso-6','salud-paso-7','salud-paso-8','salud-paso-9'];
var _saludCurIdx = 0;
var _saludData = {};
// true cuando el wizard se auto-lanzó al entrar a "Salud" sin ficha completa
// (saltando la card "Completar ficha de salud") — si el usuario da "atrás"
// desde el paso 0, hay que cerrar el panel entero en vez de mostrar esa card,
// que en ese caso nunca llegó a verse.
var _saludAutoLanzado = false;

/* Footer fijo compartido (#cta-footer-salud, index.html): un solo par de
   botones para los 9 pasos en vez de un <button> por paso. "Continuar" llama
   a la función saludContinuarN() del paso actual; "Omitir" solo se muestra
   en los pasos 1 y 4 (Enfermedad/Antecedentes, secciones genuinamente
   opcionales) — el paso 9 es el único que termina el wizard, así que su
   botón pasa a .btn-primary sólido con texto "Guardar y finalizar" en vez
   de "Continuar"/.btn-outline. */
var _SALUD_CONTINUAR_FN = {
  'salud-paso-0': function() { saludContinuar0(); },
  'salud-paso-1': function() { saludContinuar1(); }, 'salud-paso-2': function() { saludContinuar2(); },
  'salud-paso-3': function() { saludContinuar3(); }, 'salud-paso-4': function() { saludContinuar4(); },
  'salud-paso-5': function() { saludContinuar5(); }, 'salud-paso-6': function() { saludContinuar6(); },
  'salud-paso-7': function() { saludContinuar7(); }, 'salud-paso-8': function() { saludContinuar8(); },
  'salud-paso-9': function() { saludContinuar9(); }
};
var _SALUD_OMITIR_FN = { 'salud-paso-1': function() { saludOmitir1(); }, 'salud-paso-4': function() { saludOmitir4(); }, 'salud-paso-5': function() { saludOmitir5(); } };

function _saludActualizarFooter(idx) {
  var paso = _SALUD_STEPS[idx];
  var footer = document.getElementById('cta-footer-salud'); if (footer) footer.style.display = 'block';
  var btnContinuar = document.getElementById('salud-footer-continuar');
  if (btnContinuar) {
    btnContinuar.onclick = _SALUD_CONTINUAR_FN[paso];
    var esFinal = (paso === 'salud-paso-9');
    btnContinuar.textContent = esFinal ? 'Guardar y finalizar' : 'Continuar';
    btnContinuar.classList.toggle('btn-primary', esFinal);
    btnContinuar.classList.toggle('btn-outline', !esFinal);
  }
  var btnOmitir = document.getElementById('salud-footer-omitir');
  if (btnOmitir) {
    var fn = _SALUD_OMITIR_FN[paso];
    btnOmitir.style.display = fn ? 'block' : 'none';
    btnOmitir.onclick = fn || null;
  }
}
function _saludOcultarFooter() {
  var footer = document.getElementById('cta-footer-salud'); if (footer) footer.style.display = 'none';
}

function _saludMostrarEstado() {
  var completado = !!(E.datos && E.datos.atencionMedica);
  var wizard = document.getElementById('salud-wizard'); if (wizard) wizard.style.display = 'none';
  var empezar = document.getElementById('salud-card-empezar'); if (empezar) empezar.style.display = completado ? 'none' : 'block';
  var resumen = document.getElementById('salud-resumen'); if (resumen) resumen.style.display = completado ? 'block' : 'none';
  _saludOcultarFooter();
}

function saludBack() {
  var wizard = document.getElementById('salud-wizard');
  if (wizard && wizard.style.display !== 'none') { saludPasoAnterior(); }
  else { cerrarAjSub('aj-sub-salud'); }
}

function saludIniciarWizard() {
  _saludData = {
    enfermedad: (E.datos && E.datos.enfermedad) || '',
    alergias: (E.datos && E.datos.alergias) || '',
    alergiasDesc: (E.datos && E.datos.alergiasDesc) || '',
    antecedentes: (E.datos && E.datos.antecedentes) || '',
    dieta: (E.datos && E.datos.dieta) || '',
    medicamentos: (E.datos && E.datos.medicamentos) || '',
    medicamentosDesc: (E.datos && E.datos.medicamentosDesc) || '',
    atencionMedica: (E.datos && E.datos.atencionMedica) || '',
    seguro: (E.datos && E.datos.seguro) || '',
    seguroContacto: (E.datos && E.datos.seguroContacto) || ''
  };
  var empezar = document.getElementById('salud-card-empezar'); if (empezar) empezar.style.display = 'none';
  var resumen = document.getElementById('salud-resumen'); if (resumen) resumen.style.display = 'none';
  var wizard = document.getElementById('salud-wizard'); if (wizard) wizard.style.display = 'block';
  _saludResetPrefill();
  _saludPrefillWizard();
  _saludMostrarPaso(0);
}

function saludCerrarWizard() {
  if (_saludAutoLanzado) {
    _saludAutoLanzado = false;
    cerrarAjSub('aj-sub-salud');
    return;
  }
  _saludMostrarEstado();
}

function _saludRenderProg() {
  var cont = document.getElementById('salud-prog'); if (!cont) return;
  cont.innerHTML = '';
  for (var i = 0; i < _SALUD_STEPS.length; i++) {
    var d = document.createElement('div');
    d.className = 'salud-prog-dot' + (i < _saludCurIdx ? ' done' : i === _saludCurIdx ? ' active' : '');
    cont.appendChild(d);
  }
}

function _saludMostrarPaso(idx) {
  _SALUD_STEPS.forEach(function(s, i) {
    var el = document.getElementById(s);
    if (el) el.classList.toggle('activo', i === idx);
  });
  _saludCurIdx = idx;
  _saludRenderProg();
  var inner = document.querySelector('#aj-sub-salud .aj-sub-inner');
  if (inner) inner.scrollTo({ top: 0, behavior: 'smooth' });
  _saludActualizarFooter(idx);
}

function saludPasoAnterior() {
  if (_saludCurIdx === 0) { saludCerrarWizard(); return; }
  var actual = _SALUD_STEPS[_saludCurIdx];
  if (actual === 'salud-paso-4' && _saludData.alergias === 'No') { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-2')); return; }
  if (actual === 'salud-paso-8' && _saludData.medicamentos === 'No') { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-6')); return; }
  _saludMostrarPaso(_saludCurIdx - 1);
}

/* Selección única (Alergias, Dieta, Medicamentos, Atención médica): limpia
   .activa de los hermanos del mismo contenedor y la deja solo en el tocado
   — mismo mecanismo que .aj-pill/.activa ya usa el resto de la app, sin
   pasar por el sheet compartido (acá vive inline dentro del paso). Si algún
   hermano es el chip "Otro" de Dieta con texto propio (.aj-pill-otro-lleno),
   se le resetea el label visual a "Otro" — el texto ya escrito no se pierde
   (ver saludConfirmarSheetOtro), solo se oculta, así que si el usuario
   reabre el sheet de "Otro" lo encuentra de nuevo. El propio pill "Otro" de
   Dieta ya no pasa por acá (abre `saludAbrirSheetOtro(...,'single')`
   directo, ver más abajo). */
function _saludSelUnica(el) {
  var cont = el.parentElement;
  cont.querySelectorAll('.aj-pill').forEach(function(p) {
    if (p === el) return;
    p.classList.remove('activa');
    if (p.classList.contains('aj-pill-otro-lleno')) _saludOtroResetVisual(p);
  });
  el.classList.add('activa');
}

function _saludBuscarPill(containerId, val) {
  var pills = document.querySelectorAll('#' + containerId + ' .aj-pill');
  for (var i = 0; i < pills.length; i++) { if (pills[i].dataset.val === val) return pills[i]; }
  return null;
}

/* ── "Otro" del wizard de Salud, vía bottom sheet compartido ──────────
   Reemplaza el textarea inline que antes revelaba cada pill "Otro" (ver
   "Cambios recientes" — rediseño real, no solo chrome). Dos modos:
   - 'multi' (Enfermedad/Antecedentes/Seguro): el pill "Otro" es un simple
     disparador ("+ Otro", sin estado .activa propio) que abre el sheet;
     cada entrada agregada queda como SU PROPIO pill dinámico individual
     en la fila principal (marcado con data-dinamico="1"), activo, con su
     propia X para eliminarlo directo desde la pantalla sin reabrir el sheet.
   - 'single' (Dieta): el pill "Otro" conserva su look de chip editable
     (.aj-pill-otro-txt/.aj-pill-otro-x) — el sheet solo cambia CÓMO se
     ingresa el texto (antes textarea inline, ahora sheet), no qué pasa
     después de guardar. */
var _saludOtroSheetPillsRowId = null;
var _saludOtroSheetModo = 'multi';
var _saludOtroSheetLista = []; // solo modo 'multi'

function saludAbrirSheetOtro(pillsRowId, modo) {
  _saludOtroSheetPillsRowId = pillsRowId;
  _saludOtroSheetModo = modo || 'multi';
  var input = document.getElementById('salud-sheet-otro-input');
  var btnAgregar = document.getElementById('salud-sheet-otro-btn-agregar');
  var lista = document.getElementById('salud-sheet-otro-lista');
  var btnListo = document.getElementById('salud-sheet-otro-btn-listo');
  if (_saludOtroSheetModo === 'single') {
    if (btnAgregar) btnAgregar.style.display = 'none';
    if (lista) lista.style.display = 'none';
    if (btnListo) btnListo.textContent = 'Guardar';
    var pillOtro = _saludBuscarPill(pillsRowId, 'Otro');
    if (input) input.value = (pillOtro && pillOtro.classList.contains('aj-pill-otro-lleno')) ? (pillOtro.querySelector('.aj-pill-otro-txt').textContent || '') : '';
  } else {
    if (btnAgregar) btnAgregar.style.display = '';
    if (lista) lista.style.display = 'flex';
    if (btnListo) btnListo.textContent = 'Listo';
    if (input) input.value = '';
    _saludOtroSheetLista = Array.prototype.map.call(
      document.querySelectorAll('#' + pillsRowId + ' .aj-pill[data-dinamico="1"]'),
      function(p) { return p.dataset.val; }
    );
    _saludRenderSheetOtroLista();
  }
  var ov = document.getElementById('salud-sheet-otro-overlay');
  var sh = document.getElementById('salud-sheet-otro');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  setTimeout(function() { if (input) input.focus(); }, 300);
  _registrarOverlayAbierto(saludCerrarSheetOtro);
}

function saludCerrarSheetOtro(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('salud-sheet-otro');
  var ov = document.getElementById('salud-sheet-otro-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

function _saludRenderSheetOtroLista() {
  var lista = document.getElementById('salud-sheet-otro-lista');
  if (!lista) return;
  lista.innerHTML = '';
  if (!_saludOtroSheetLista.length) {
    var vacio = document.createElement('p');
    vacio.style.cssText = 'font-size:0.78rem;color:var(--muted);text-align:center;margin:4px 0;';
    vacio.textContent = 'Sin opciones agregadas.';
    lista.appendChild(vacio);
    return;
  }
  _saludOtroSheetLista.forEach(function(v, i) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-2);border-radius:10px;font-size:0.85rem;color:var(--text);';
    var span = document.createElement('span');
    span.textContent = v;
    var x = document.createElement('span');
    x.className = 'material-symbols-outlined';
    x.style.cssText = 'cursor:pointer;color:var(--muted);font-size:1.1rem;';
    x.textContent = 'close';
    x.onclick = function() { saludQuitarItemOtro(i); };
    row.appendChild(span); row.appendChild(x);
    lista.appendChild(row);
  });
}

function saludAgregarItemOtro() {
  var input = document.getElementById('salud-sheet-otro-input');
  var t = (input.value || '').trim();
  if (!t) return;
  _saludOtroSheetLista.push(t);
  input.value = '';
  _saludRenderSheetOtroLista();
  input.focus();
}

function saludQuitarItemOtro(idx) {
  _saludOtroSheetLista.splice(idx, 1);
  _saludRenderSheetOtroLista();
}

/* Botón "Listo"/"Guardar" del sheet — aplica la lista (modo 'multi') o el
   valor único (modo 'single') al pills-row de destino y cierra. */
function saludConfirmarSheetOtro() {
  var pillsRowId = _saludOtroSheetPillsRowId;
  if (_saludOtroSheetModo === 'single') {
    var input = document.getElementById('salud-sheet-otro-input');
    var t = (input.value || '').trim();
    var pillOtro = _saludBuscarPill(pillsRowId, 'Otro');
    if (t) {
      document.querySelectorAll('#' + pillsRowId + ' .aj-pill').forEach(function(p) { if (p !== pillOtro) p.classList.remove('activa'); });
      if (pillOtro) _saludOtroSetTexto(pillOtro, t);
    } else if (pillOtro) {
      pillOtro.classList.remove('activa');
      _saludOtroResetVisual(pillOtro);
    }
    saludCerrarSheetOtro();
    return;
  }
  var cont = document.getElementById(pillsRowId);
  if (cont) {
    Array.prototype.forEach.call(cont.querySelectorAll('.aj-pill[data-dinamico="1"]'), function(p) {
      if (_saludOtroSheetLista.indexOf(p.dataset.val) === -1) p.remove();
    });
    var yaPresentes = Array.prototype.map.call(cont.querySelectorAll('.aj-pill[data-dinamico="1"]'), function(p) { return p.dataset.val; });
    _saludOtroSheetLista.forEach(function(v) {
      if (yaPresentes.indexOf(v) === -1) _saludCrearPillDinamico(pillsRowId, v);
    });
  }
  saludCerrarSheetOtro();
}

/* Crea un pill dinámico individual (entrada personalizada agregada vía el
   sheet) — mismo look de chip que .aj-pill-otro-txt/.aj-pill-otro-x, pero
   sin la lógica de "reabrir para editar": su X lo elimina directo. Queda
   .activa desde que existe (no hay estado "existe pero inactivo"). */
function _saludCrearPillDinamico(containerId, valor) {
  var cont = document.getElementById(containerId);
  if (!cont) return;
  var trigger = cont.querySelector('[data-otro-trigger="1"]');
  var pill = document.createElement('span');
  pill.className = 'aj-pill activa aj-pill-otro-lleno'; // .aj-pill-otro-lleno solo para heredar el CSS que muestra la X (.aj-pill-otro-x), no participa en la lógica de "reabrir para editar"
  pill.dataset.val = valor;
  pill.dataset.dinamico = '1';
  var txt = document.createElement('span');
  txt.className = 'aj-pill-otro-txt';
  txt.textContent = valor;
  var x = document.createElement('span');
  x.className = 'aj-pill-otro-x material-symbols-outlined';
  x.textContent = 'close';
  x.onclick = function(ev) { ev.stopPropagation(); saludQuitarPillDinamico(x); };
  pill.appendChild(txt); pill.appendChild(x);
  if (trigger) cont.insertBefore(pill, trigger); else cont.appendChild(pill);
}

/* X de un pill dinámico en la pantalla principal — lo elimina sin reabrir
   el sheet. */
function saludQuitarPillDinamico(xEl) {
  var p = xEl.closest('.aj-pill');
  if (p) p.remove();
}

function _saludOtroSetTexto(el, texto) {
  el.classList.add('activa', 'aj-pill-otro-lleno');
  var txt = el.querySelector('.aj-pill-otro-txt');
  if (txt) txt.textContent = texto;
}
function _saludOtroResetVisual(el) {
  el.classList.remove('aj-pill-otro-lleno');
  var txt = el.querySelector('.aj-pill-otro-txt');
  if (txt) txt.textContent = 'Otro';
}
/* onclick de la X del chip "Otro" de Dieta (modo single): limpia el texto
   y lo deja igual que si nunca se hubiera usado. */
function saludOtroLimpiar(xEl) {
  var el = xEl.closest('.aj-pill');
  if (el) { el.classList.remove('activa'); _saludOtroResetVisual(el); }
}

/* Paso 0 — Intro/consentimiento (sin datos, sin Omitir) */
function saludContinuar0() { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-1')); }

/* Paso 1 — Enfermedad diagnosticada (multi + Otro, con Omitir) */
function saludContinuar1() {
  var vals = [];
  document.querySelectorAll('#salud-enfermedad-pills .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
  _saludData.enfermedad = vals.join(', ');
  _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-2'));
}
function saludOmitir1() { _saludData.enfermedad = ''; _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-2')); }

/* Paso 2 — Alergias (única: Sí/No/Tal vez) */
function saludContinuar2() {
  var sel = document.querySelector('#salud-alergias-pills .aj-pill.activa');
  if (!sel) { err('err-salud-2', 'Selecciona una opción.'); return; }
  _saludData.alergias = sel.dataset.val;
  if (sel.dataset.val === 'No') { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-4')); }
  else { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-3')); }
}

/* Paso 3 — Detalle de alergias (texto libre, solo si paso 2 !== 'No') */
function saludContinuar3() {
  _saludData.alergiasDesc = (document.getElementById('salud-alergiasDesc-input').value || '').trim();
  _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-4'));
}

/* Paso 4 — Antecedentes médicos personales (multi + Otro, con Omitir) */
function saludContinuar4() {
  var vals = [];
  document.querySelectorAll('#salud-antecedentes-pills .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
  _saludData.antecedentes = vals.join(', ');
  _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-5'));
}
function saludOmitir4() { _saludData.antecedentes = ''; _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-5')); }

/* Paso 5 — Dieta (única + Otro) */
function saludContinuar5() {
  var sel = document.querySelector('#salud-dieta-pills .aj-pill.activa');
  if (!sel) { err('err-salud-5', 'Selecciona una opción.'); return; }
  if (sel.dataset.val === 'Otro') {
    var t = (sel.querySelector('.aj-pill-otro-txt') || {}).textContent || '';
    if (!t) { err('err-salud-5', 'Especifica tu dieta.'); return; }
    _saludData.dieta = t;
  } else {
    _saludData.dieta = sel.dataset.val;
  }
  _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-6'));
}
function saludOmitir5() { _saludData.dieta = ''; _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-6')); }

/* Paso 6 — ¿Toma medicamentos? (única: Sí/No) */
function saludContinuar6() {
  var sel = document.querySelector('#salud-medicamentos-pills .aj-pill.activa');
  if (!sel) { err('err-salud-6', 'Selecciona una opción.'); return; }
  _saludData.medicamentos = sel.dataset.val;
  if (sel.dataset.val === 'No') { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-8')); }
  else { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-7')); }
}

/* Paso 7 — Detalle de medicamentos (texto libre, solo si paso 6 === 'Sí') */
function saludContinuar7() {
  _saludData.medicamentosDesc = (document.getElementById('salud-medicamentosDesc-input').value || '').trim();
  _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-8'));
}

/* Paso 8 — Atención médica (única: MSP/IESS/Seguro Privado) */
function saludContinuar8() {
  var sel = document.querySelector('#salud-atencionMedica-pills .aj-pill.activa');
  if (!sel) { err('err-salud-8', 'Selecciona una opción.'); return; }
  _saludData.atencionMedica = sel.dataset.val;
  if (sel.dataset.val === 'Seguro Privado') { _saludMostrarPaso(_SALUD_STEPS.indexOf('salud-paso-9')); }
  else { _saludData.seguro = ''; _saludData.seguroContacto = ''; _saludFinalizarWizard(); }
}

/* Paso 9 — Seguro privado (pills multi + Otro, mismo patrón que Enfermedad/
   Antecedentes) + contacto — último paso posible del flujo; termina y guarda
   todo junto */
function saludContinuar9() {
  var vals = [];
  document.querySelectorAll('#salud-seguro-pills .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
  if (!vals.length) { err('err-salud-9', 'Selecciona al menos una opción.'); return; }
  _saludData.seguro = vals.join(', ');
  _saludData.seguroContacto = (document.getElementById('salud-seguroContacto-input').value || '').trim();
  _saludFinalizarWizard();
}

/* Persistencia: un solo actualizarDatosPersona() con los 10 campos juntos al
   terminar el flujo completo (paso 8 si MSP/IESS, paso 9 si Seguro Privado)
   — no campo por campo en cada paso. Actualiza E.datos de forma optimista
   (mismo criterio que ajTogglePriv()) para no esperar el round-trip antes de
   mostrar el resumen. */
function _saludFinalizarWizard() {
  var payload = {
    enfermedad: _saludData.enfermedad, alergias: _saludData.alergias, alergiasDesc: _saludData.alergiasDesc,
    antecedentes: _saludData.antecedentes, dieta: _saludData.dieta, medicamentos: _saludData.medicamentos,
    medicamentosDesc: _saludData.medicamentosDesc, atencionMedica: _saludData.atencionMedica,
    seguro: _saludData.seguro, seguroContacto: _saludData.seguroContacto
  };
  _ajGuardar(payload);
  Object.assign(E.datos, payload);
  _ajCargarSub('aj-sub-salud');
}

function _saludResetPrefill() {
  document.querySelectorAll('#salud-wizard .aj-pill[data-dinamico="1"]').forEach(function(p) { p.remove(); });
  document.querySelectorAll('#salud-wizard .aj-pill').forEach(function(p) { p.classList.remove('activa'); if (p.classList.contains('aj-pill-otro-lleno')) _saludOtroResetVisual(p); });
  ['salud-alergiasDesc-input','salud-medicamentosDesc-input','salud-seguroContacto-input'].forEach(function(id) {
    var i = document.getElementById(id); if (i) i.value = '';
  });
  document.querySelectorAll('#salud-wizard .error-msg').forEach(function(e) { e.style.display = 'none'; });
}

/* Enfermedad/Antecedentes/Seguro: cada valor guardado que matchee un pill
   fijo lo activa; el resto se recrea como pills dinámicos individuales
   (mismo mecanismo que agrega el sheet de "Otro", ver más arriba) — ya no
   se concatenan en un solo chip de texto. */
function _saludPrefillMulti(valor, containerId) {
  if (!valor) return;
  var partes = valor.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  partes.forEach(function(p) {
    var pill = _saludBuscarPill(containerId, p);
    if (pill) pill.classList.add('activa'); else _saludCrearPillDinamico(containerId, p);
  });
}

function _saludPrefillUnica(valor, containerId) {
  if (!valor) return;
  var pill = _saludBuscarPill(containerId, valor);
  if (pill) pill.classList.add('activa');
}

/* Dieta: si el valor guardado no matchea ningún pill fijo, queda en el
   chip "Otro" (mismo look de siempre, .aj-pill-otro-txt/.aj-pill-otro-x). */
function _saludPrefillUnicaConOtro(valor, containerId) {
  if (!valor) return;
  var pill = _saludBuscarPill(containerId, valor);
  if (pill) { pill.classList.add('activa'); return; }
  var otroPill = _saludBuscarPill(containerId, 'Otro');
  if (otroPill) _saludOtroSetTexto(otroPill, valor);
}

function _saludPrefillWizard() {
  _saludPrefillMulti(_saludData.enfermedad, 'salud-enfermedad-pills');
  _saludPrefillUnica(_saludData.alergias, 'salud-alergias-pills');
  document.getElementById('salud-alergiasDesc-input').value = _saludData.alergiasDesc;
  _saludPrefillMulti(_saludData.antecedentes, 'salud-antecedentes-pills');
  _saludPrefillUnicaConOtro(_saludData.dieta, 'salud-dieta-pills');
  _saludPrefillUnica(_saludData.medicamentos, 'salud-medicamentos-pills');
  document.getElementById('salud-medicamentosDesc-input').value = _saludData.medicamentosDesc;
  _saludPrefillUnica(_saludData.atencionMedica, 'salud-atencionMedica-pills');
  _saludPrefillMulti(_saludData.seguro, 'salud-seguro-pills');
  document.getElementById('salud-seguroContacto-input').value = _saludData.seguroContacto;
}

/* ── Privacidad: autoguardado sin botón ───────────────── */
function ajTogglePriv(btn, campo) {
  var on = btn.classList.contains('toggle-on');
  btn.classList.toggle('toggle-on', !on);
  btn.classList.toggle('toggle-off', on);
  btn.setAttribute('aria-pressed', String(!on));
  var payload = {};
  payload[campo === 'fechaPublica' ? 'fechaPublica' : 'edadPublica'] = !on ? 'Sí' : 'No';
  _ajGuardar(payload);
}

/* ── Segundo contacto de emergencia (agregar/quitar) ──── */
function ajAgregarEmerg2() {
  var wrap = document.getElementById('aj-emerg2-wrap');
  var btn = document.getElementById('aj-btn-agregar-em2');
  if (wrap) { wrap.style.display = 'block'; wrap.classList.add('emerg2-anim'); }
  if (btn) btn.style.display = 'none';
}

function ajEliminarEmerg2() {
  var wrap = document.getElementById('aj-emerg2-wrap');
  var btn = document.getElementById('aj-btn-agregar-em2');
  if (wrap) { wrap.style.display = 'none'; wrap.classList.remove('emerg2-anim'); }
  if (btn) btn.style.display = '';
  _ajSetDatoVal('aj-em2nombre-val', '', '—', true);
  _ajSetDatoVal('aj-em2relacion-val', '', '—', true);
  _ajSetPrefijo('aj-em2prefijo-display', null, '');
  _ajSetDatoVal('aj-em2tel-val', '', '—', true);
  _ajGuardar({ emerg2Nombre: '', emerg2Relacion: '', emerg2Prefijo: '', emerg2Telefono: '' });
}

function _ajGuardar(payload, btn, subId) {
  if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }
  api({ action: 'actualizarDatosPersona', nombre: E.nombre, token: _getSessionToken(), datos: JSON.stringify(payload) }, function() {
    Object.assign(E.datos, payload);
    if (btn) { btn.textContent = 'Guardar cambios'; btn.disabled = false; }
    irEditarDatos();
    cerrarAjSub(subId, true);
    mostrarToast('Datos guardados', 'ok');
  }, function(e) {
    if (btn) { btn.textContent = 'Guardar cambios'; btn.disabled = false; }
    mostrarToast(e.message || 'Error al guardar. Intenta de nuevo.', 'error');
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
  _registrarOverlayAbierto(ajCerrarSheetLogout);
}

function ajCerrarSheetLogout(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('aj-sheet-logout');
  var ov = document.getElementById('aj-sheet-logout-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if (sh) sh.style.display = 'none'; if (ov) ov.style.display = 'none'; }, 350);
}

/* ── Equipamiento (Ajustes del perfil) ────────────────── */
function ajAbrirSheetTallaAjustes() {
  var grid = document.getElementById('aj-talla-aj-grid');
  grid.innerHTML = '<div class="spinner" style="margin:16px auto;"></div>';
  var ov = document.getElementById('aj-sheet-talla-aj-overlay');
  var sh = document.getElementById('aj-sheet-talla-aj');
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(ajCerrarSheetTallaAjustes);
  api({ action: 'getTallasDisponibles' }, function(tallas) {
    var tallaActual = E.datos && E.datos.talla ? E.datos.talla : '';
    var htmlNo = '<div class="equip-talla-pill equip-talla-pill-no' + (!tallaActual ? ' sel' : '') + '" onclick="ajSelTallaGridAjustes(this,\'\')">No necesito patines</div>';
    grid.innerHTML = htmlNo + tallas.map(function(t) {
      return '<div class="equip-talla-pill' + (String(t) === String(tallaActual) ? ' sel' : '') + '" onclick="ajSelTallaGridAjustes(this,\'' + t + '\')">' + t + '</div>';
    }).join('');
  }, function() {
    grid.innerHTML = '<p style="color:var(--danger);font-size:0.82rem;">Error al cargar tallas. Intenta de nuevo.</p>';
  });
}

function ajSelTallaGridAjustes(el, talla) {
  var yaSeleccionada = el.classList.contains('sel');
  document.querySelectorAll('#aj-talla-aj-grid .equip-talla-pill').forEach(function(p) { p.classList.remove('sel'); });
  if (!yaSeleccionada) el.classList.add('sel');
}

function ajCerrarSheetTallaAjustes(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('aj-sheet-talla-aj');
  var ov = document.getElementById('aj-sheet-talla-aj-overlay');
  sh.style.transform = 'translateY(100%)';
  setTimeout(function() { sh.style.display = 'none'; ov.style.display = 'none'; }, 350);
}

function ajGuardarTallaAjustes(btn) {
  var sel = document.querySelector('#aj-talla-aj-grid .equip-talla-pill.sel');
  var talla = (sel && !sel.classList.contains('equip-talla-pill-no')) ? sel.textContent.trim() : '';
  var necesitaPatines = talla ? 'Sí' : 'No';
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  api({ action: 'actualizarEquipamientoPersona', nombre: E.nombre, necesitaPatines: necesitaPatines, talla: talla, necesitaProtecciones: E.datos.necesitaProtecciones || 'No' }, function() {
    E.datos.necesitaPatines = necesitaPatines;
    E.datos.talla = talla;
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    document.getElementById('aj-equip-pat-val').textContent = talla ? 'Talla ' + talla : 'No necesitas patines';
    _actualizarResumenEquipAjustes();
    ajCerrarSheetTallaAjustes();
    mostrarToast('Equipamiento actualizado', 'ok');
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    document.getElementById('err-aj-talla').textContent = e.message || 'Error al guardar.';
  });
}

function ajAbrirSheetProtecAjustes() {
  document.querySelectorAll('#aj-s3c-pills-aj .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  document.getElementById('aj-bs-protec-parciales').style.display = 'none';
  document.querySelectorAll('#aj-bs-protec-pills-aj .aj-pill').forEach(function(p) { p.classList.remove('activa'); });
  var sub = document.getElementById('aj-protec-otro-sub-aj');
  if (sub) { sub.textContent = 'Toca para especificar'; sub.style.color = ''; }
  var protecActual = E.datos && E.datos.necesitaProtecciones ? E.datos.necesitaProtecciones : '';
  if (protecActual === 'Sí') {
    var p = document.querySelector('#aj-s3c-pills-aj .equip-pill-protec[data-val="Sí"]');
    if (p) p.classList.add('sel');
  } else if (protecActual === 'No') {
    var p = document.querySelector('#aj-s3c-pills-aj .equip-pill-protec[data-val="No"]');
    if (p) p.classList.add('sel');
  } else if (protecActual) {
    var p = document.getElementById('aj-pill-protec-otro-aj');
    if (p) p.classList.add('sel');
    document.getElementById('aj-bs-protec-parciales').style.display = 'block';
    protecActual.split(',').forEach(function(v) {
      var pill = document.querySelector('#aj-bs-protec-pills-aj .aj-pill[data-val="' + v.trim() + '"]');
      if (pill) pill.classList.add('activa');
    });
  }
  var ov = document.getElementById('aj-sheet-protec-aj-overlay');
  var sh = document.getElementById('aj-sheet-protec-aj');
  ov.style.display = 'block';
  sh.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sh.style.transform = 'translateY(0)'; }); });
  _registrarOverlayAbierto(ajCerrarSheetProtecAjustes);
}

function ajSelProtecAjustes(el) {
  document.querySelectorAll('#aj-s3c-pills-aj .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  var val = el.dataset.val;
  document.getElementById('aj-bs-protec-parciales').style.display = val === 'Otro' ? 'block' : 'none';
}

function ajCerrarSheetProtecAjustes(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('aj-sheet-protec-aj');
  var ov = document.getElementById('aj-sheet-protec-aj-overlay');
  sh.style.transform = 'translateY(100%)';
  setTimeout(function() { sh.style.display = 'none'; ov.style.display = 'none'; }, 350);
}

function ajGuardarProtecAjustes(btn) {
  var sel = document.querySelector('#aj-s3c-pills-aj .equip-pill-protec.sel');
  if (!sel) { document.getElementById('err-aj-protec-aj').textContent = 'Selecciona una opción.'; return; }
  var val = sel.dataset.val;
  var protecFinal;
  if (val === 'Sí') { protecFinal = 'Sí'; }
  else if (val === 'No') { protecFinal = 'No'; }
  else {
    var vals = [];
    document.querySelectorAll('#aj-bs-protec-pills-aj .aj-pill.activa').forEach(function(p) { vals.push(p.dataset.val); });
    if (!vals.length) { document.getElementById('err-aj-protec-parciales').textContent = 'Selecciona al menos una opción.'; return; }
    if (vals.length === 4) { document.getElementById('err-aj-protec-parciales').textContent = 'Si necesitas las 4, selecciona "protecciones completas".'; return; }
    protecFinal = vals.join(', ');
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  api({ action: 'actualizarEquipamientoPersona', nombre: E.nombre, necesitaPatines: E.datos.necesitaPatines || 'No', talla: E.datos.talla || '', necesitaProtecciones: protecFinal }, function() {
    E.datos.necesitaProtecciones = protecFinal;
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    document.getElementById('aj-equip-protec-val').textContent = protecFinal;
    _actualizarResumenEquipAjustes();
    ajCerrarSheetProtecAjustes();
    mostrarToast('Equipamiento actualizado', 'ok');
  }, function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    document.getElementById('err-aj-protec-aj').textContent = e.message || 'Error al guardar.';
  });
}

function _actualizarResumenEquipAjustes() {
  var d = E.datos;
  var pat = d.necesitaPatines || '—';
  var tal = d.talla || '';
  var pro = d.necesitaProtecciones || '—';
  var el = document.getElementById('aj-equip-val');
  if (el) el.textContent = (pat === 'Sí' ? 'Patines' + (tal ? ' talla ' + tal : '') : 'Sin patines') + ' · ' + (pro === 'Sí' ? 'Protecciones completas' : pro === 'No' ? 'Protecciones propias' : pro);
}

function _initMapsCallback() { window._mapsLoaded = true; }

/* ── Places Autocomplete (ciudad / dirección) ─ */
var _ajPlacesCallback = null;
var _ajPlacesAutocomp = null;

// Mapeo de nombre de país a código ISO para restricción de Places
var _AJ_PAIS_CODES = {
  'Ecuador':'EC','Colombia':'CO','Venezuela':'VE','Perú':'PE','Argentina':'AR',
  'Chile':'CL','México':'MX','España':'ES','Estados Unidos':'US','Uruguay':'UY',
  'Paraguay':'PY','Bolivia':'BO','Brasil':'BR','Costa Rica':'CR','Panamá':'PA',
  'Guatemala':'GT','Honduras':'HN','El Salvador':'SV','Nicaragua':'NI',
  'Cuba':'CU','República Dominicana':'DO','Haití':'HT','Jamaica':'JM',
  'Puerto Rico':'PR','Canadá':'CA','Francia':'FR','Italia':'IT','Alemania':'DE',
  'Reino Unido':'GB','Portugal':'PT','Países Bajos':'NL','Bélgica':'BE',
  'Suiza':'CH','Austria':'AT','Suecia':'SE','Noruega':'NO','Dinamarca':'DK',
  'Finlandia':'FI','Polonia':'PL','Rusia':'RU','Ucrania':'UA','China':'CN',
  'Japón':'JP','Corea del Sur':'KR','India':'IN','Australia':'AU',
  'Nueva Zelanda':'NZ','Sudáfrica':'ZA','Nigeria':'NG','Kenia':'KE',
  'Marruecos':'MA','Egipto':'EG'
};

function ajAbrirSheetPlaces(titulo, tipo, displayId, campo) {
  document.getElementById('aj-places-titulo').textContent = titulo;
  document.getElementById('aj-places-input').value = '';
  var ov = document.getElementById('aj-sheet-places-overlay');
  var sh = document.getElementById('aj-sheet-places');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform='translateY(0)'; }); }); }
  _registrarOverlayAbierto(ajCerrarSheetPlaces);

  _ajPlacesCallback = function(valor) {
    var disp = document.getElementById(displayId);
    if (disp) { disp.textContent = valor; disp.classList.remove('vacio'); }
    var payload = {}; payload[campo] = valor;
    _ajGuardar(payload);
    ajCerrarSheetPlaces();
  };

  var inp = document.getElementById('aj-places-input');
  if (!inp) return;

  // Destruir instancia anterior si existe
  if (_ajPlacesAutocomp) {
    google.maps.event.clearInstanceListeners(inp);
    _ajPlacesAutocomp = null;
  }

  if (!window._mapsLoaded || typeof google === 'undefined') {
    // Places no cargado aún — usar input libre como fallback
    inp.onkeydown = function(e) {
      if (e.key === 'Enter' && inp.value.trim()) {
        if (_ajPlacesCallback) _ajPlacesCallback(inp.value.trim());
      }
    };
    return;
  }

  inp.onkeydown = null; // saca el fallback de Enter por si el sheet se abrió antes de que Maps terminara de cargar

  var opts = { types: tipo === 'ciudad' ? ['(cities)'] : ['address'] };
  var countryCode = _ajPaisActual ? _AJ_PAIS_CODES[_ajPaisActual] : null;
  if (countryCode) opts.componentRestrictions = { country: countryCode };

  _ajPlacesAutocomp = new google.maps.places.Autocomplete(inp, opts);
  _ajPlacesAutocomp.addListener('place_changed', function() {
    var place = _ajPlacesAutocomp.getPlace();
    var valor = tipo === 'ciudad'
      ? (place.address_components
          ? (place.address_components.find(function(c){ return c.types.includes('locality'); }) || {}).long_name || place.name
          : place.name)
      : place.formatted_address || inp.value;
    if (valor && _ajPlacesCallback) _ajPlacesCallback(valor);
  });

  setTimeout(function(){ if(inp) inp.focus(); }, 300);
}

function ajCerrarSheetPlaces(porGesto) {
  if (!porGesto) { history.back(); return; }
  var sh = document.getElementById('aj-sheet-places');
  var ov = document.getElementById('aj-sheet-places-overlay');
  if (sh) sh.style.transform = 'translateY(100%)';
  setTimeout(function(){ if(sh)sh.style.display='none'; if(ov)ov.style.display='none'; }, 350);
  _ajPlacesCallback = null;
}
// _AJ_PAIS_CODES, ajAbrirSheetPlaces/ajCerrarSheetPlaces (arriba) y ajAbrirSheetPais/
// ajSelPais/_ajRenderPaises/ajFiltrarPaises/_AJ_PAISES/_ajPaisActual (más abajo) quedan
// sin ningún llamador desde el rediseño de "Dirección" a mapa interactivo (ver
// "Cambios recientes") — las filas País/Ciudad se eliminaron y "Dirección" dejó de usar
// Places Autocomplete. Se dejan huérfanos a propósito (sin invocar), mismo criterio que
// se usó con mostrarModalEquip en un cambio anterior, por si hace falta revertir.

/* ── Mapa interactivo de Dirección (aj-sub-direccion) ─── */
var _ajDireccionMap = null;
var _AJ_QUITO_LATLNG = { lat: -0.1807, lng: -78.4678 };

function _ajInicializarMapaDireccion() {
  var canvas = document.getElementById('aj-mapa-direccion-canvas');
  if (!canvas) return;
  if (typeof google === 'undefined' || !google.maps || !window._mapsLoaded) {
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.78rem;text-align:center;padding:16px;">No se pudo cargar el mapa. Intenta más tarde.</div>';
    return;
  }
  function centrarEn(pos) {
    if (_ajDireccionMap) {
      _ajDireccionMap.setCenter(pos);
    } else {
      _ajDireccionMap = new google.maps.Map(canvas, {
        center: pos, zoom: 16, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy'
      });
      _ajDireccionMap.addListener('dragend', _ajOnMapaDireccionDragEnd);
    }
  }
  function centrarPorGeolocalizacionOFallback() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(pos) {
        centrarEn({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, function() {
        mostrarToast('No pudimos acceder a tu ubicación. Mostrando Quito por defecto.', 'ok');
        centrarEn(_AJ_QUITO_LATLNG);
      }, { timeout: 8000 });
    } else {
      centrarEn(_AJ_QUITO_LATLNG);
    }
  }
  var d = E.datos || {};
  var tieneDireccionGuardada = !!(d.callePrincipal || d.numeracion || d.sector || d.canton);
  if (tieneDireccionGuardada) {
    var direccion = (d.callePrincipal || '') + ' ' + (d.numeracion || '') + ', ' + (d.sector || '') + ', ' + (d.canton || '');
    new google.maps.Geocoder().geocode({ address: direccion }, function(results, status) {
      if (status === 'OK' && results && results[0]) {
        centrarEn(results[0].geometry.location);
      } else {
        centrarPorGeolocalizacionOFallback();
      }
    });
  } else {
    centrarPorGeolocalizacionOFallback();
  }
}

function _ajOnMapaDireccionDragEnd() {
  if (!_ajDireccionMap) return;
  var center = _ajDireccionMap.getCenter();
  new google.maps.Geocoder().geocode({ location: { lat: center.lat(), lng: center.lng() } }, function(results, status) {
    if (status !== 'OK' || !results || !results[0]) return;
    _ajAplicarReverseGeocode(results[0].address_components || []);
  });
}

function _ajAplicarReverseGeocode(components) {
  function buscar(tiposEnOrden) {
    for (var t = 0; t < tiposEnOrden.length; t++) {
      for (var i = 0; i < components.length; i++) {
        if (components[i].types.indexOf(tiposEnOrden[t]) !== -1) return components[i].long_name;
      }
    }
    return '';
  }
  var payload = {};
  var calle = buscar(['route']); if (calle) payload.callePrincipal = calle;
  var numero = buscar(['street_number']); if (numero) payload.numeracion = numero;
  var canton = buscar(['administrative_area_level_2', 'locality']); if (canton) payload.canton = canton;
  var sector = buscar(['neighborhood', 'sublocality']); if (sector) payload.sector = sector;
  if (!Object.keys(payload).length) return;
  _ajGuardar(payload);
  if (payload.callePrincipal) _ajSetDatoVal('aj-callePrincipal-val', payload.callePrincipal, '—', true);
  if (payload.numeracion) _ajSetDatoVal('aj-numeracion-val', payload.numeracion, '—', true);
  if (payload.canton) _ajSetDatoVal('aj-canton-val', payload.canton, '—', true);
  if (payload.sector) _ajSetDatoVal('aj-sector-val', payload.sector, '—', true);
}

function _ajOnGuardadoDireccion(campo) {
  return function(valorNuevo) { _ajGeocodeDireccion(campo, valorNuevo); };
}

function _ajGeocodeDireccion(campo, valorNuevo) {
  if (typeof google === 'undefined' || !google.maps || !window._mapsLoaded) return;
  var d = E.datos || {};
  var calle = campo === 'callePrincipal' ? valorNuevo : (d.callePrincipal || '');
  var numeracion = campo === 'numeracion' ? valorNuevo : (d.numeracion || '');
  var sector = campo === 'sector' ? valorNuevo : (d.sector || '');
  var canton = campo === 'canton' ? valorNuevo : (d.canton || '');
  var direccion = calle + ' ' + numeracion + ', ' + sector + ', ' + canton;
  new google.maps.Geocoder().geocode({ address: direccion }, function(results, status) {
    if (status !== 'OK' || !results || !results[0] || !_ajDireccionMap) return;
    _ajDireccionMap.setCenter(results[0].geometry.location);
  });
}
