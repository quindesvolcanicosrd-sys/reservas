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
      var mp = document.getElementById('modal-permisos'); if (mp) { mp.style.opacity = '0'; setTimeout(function(){ mp.style.display = 'none'; }, 250); }
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
  var mp = document.getElementById('modal-permisos'); if (mp) { mp.style.opacity = '0'; setTimeout(function(){ mp.style.display = 'none'; }, 250); }
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
var _ajSubAbierto = null; // id del aj-sub-* actualmente abierto, o null

function irAjSub(id, desdeHistorial) {
  var sub = document.getElementById(id);
  if (!sub) return;
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
  if (!desdeHistorial) {
    history.pushState({ pantalla: 's-datos' }, '', '#s-datos');
  }
}

function _ajSetDatoVal(id, valor, vacioTexto, marcarVacio) {
  var el = document.getElementById(id); if (!el) return;
  if (valor) { el.textContent = valor; if (marcarVacio) el.classList.remove('vacio'); }
  else { el.textContent = vacioTexto; if (marcarVacio) el.classList.add('vacio'); }
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
    _ajPaisActual = d.pais || '';
    _ajSetDatoVal('aj-pais-val', d.pais, '—', false);
    _ajSetDatoVal('aj-ciudad-val', d.ciudad, '—', true);
    _ajSetDatoVal('aj-direccion-val', d.callePrincipal, '—', true);
  } else if (id === 'aj-sub-emerg') {
    _ajSetDatoVal('aj-em1nombre-val', d.emerg1Nombre, '—', true);
    _ajSetDatoVal('aj-em1relacion-val', d.emerg1Relacion, '—', true);
    _ajSetDatoVal('aj-em1tel-val', d.emerg1Telefono, '—', true);
    var tieneEmerg2 = !!(d.emerg2Nombre || d.emerg2Relacion || d.emerg2Telefono);
    var wrap = document.getElementById('aj-emerg2-wrap');
    var btnAgregar = document.getElementById('aj-btn-agregar-em2');
    if (wrap) wrap.style.display = tieneEmerg2 ? 'block' : 'none';
    if (btnAgregar) btnAgregar.style.display = tieneEmerg2 ? 'none' : '';
    _ajSetDatoVal('aj-em2nombre-val', d.emerg2Nombre, '—', true);
    _ajSetDatoVal('aj-em2relacion-val', d.emerg2Relacion, '—', true);
    _ajSetDatoVal('aj-em2tel-val', d.emerg2Telefono, '—', true);
  }
}

function ajTogglePill(el) {
  el.classList.toggle('activa');
}

/* ── Bottom sheet genérico de texto ───────────────────── */
var _ajSheetTextoCallback = null;
var _ajSheetTextoModo = 'texto'; // 'texto' | 'pills-multi' | 'pills-single'
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
  var tit = document.getElementById('aj-sheet-texto-titulo');
  var inp = document.getElementById('aj-sheet-texto-input');
  var pills = document.getElementById('aj-sheet-texto-pills');
  var sub = document.getElementById('aj-sheet-texto-subtitulo');
  var btnConfirmar = document.getElementById('aj-sheet-texto-btn-confirmar');
  if (sub) sub.style.display = 'none';
  if (pills) { pills.style.display = 'none'; pills.innerHTML = ''; }
  if (btnConfirmar) btnConfirmar.style.display = '';
  if (tit) tit.textContent = titulo;
  if (inp) { inp.style.display = ''; inp.value = ''; inp.placeholder = placeholder; }
  var ov = document.getElementById('aj-sheet-texto-overlay');
  var sh = document.getElementById('aj-sheet-texto');
  if (ov) ov.style.display = 'block';
  if (sh) { sh.style.display = 'flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ sh.style.transform = 'translateY(0)'; }); }); }
  setTimeout(function(){ var i = document.getElementById('aj-sheet-texto-input'); if (i && _ajSheetTextoModo === 'texto') i.focus(); }, 400);
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
}

function _ajSheetTextoPillSingleClick(el) {
  var v = el.dataset.val;
  if (_ajSheetTextoCallback) _ajSheetTextoCallback(v);
  ajCerrarSheetTexto();
}

function ajCerrarSheetTexto() {
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
  if (_ajSheetTextoCallback) _ajSheetTextoCallback(v);
  ajCerrarSheetTexto();
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
  if (_ajPrefijoTarget.hiddenId) {
    var h = document.getElementById(_ajPrefijoTarget.hiddenId); if (h) h.value = val;
  } else {
    // Sin hiddenId significa que no hay un formulario capturando este valor para
    // guardarlo después con un botón — con el rediseño de filas ya no existe ese
    // botón, así que autoguarda directo (mismo criterio que ajSelPais/ajSelPaisOtro).
    _ajGuardar({ prefijo: val });
  }
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
  var disp = document.getElementById('aj-pais-val');
  if (disp) { disp.textContent = pais; disp.classList.remove('vacio'); }
  _ajGuardar({ pais: pais });
  ajCerrarSheetPais();
}

function ajSelPaisOtro() {
  ajCerrarSheetPais();
  ajAbrirSheetTexto('aj-sheet-texto', 'País', 'Escribe el nombre del país', function(v) {
    _ajPaisActual = v;
    var disp = document.getElementById('aj-pais-val');
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
    _ajGuardar({ pais: v });
  });
}

/* ── Filas de dato: bottom sheet de texto genérico ────── */
function ajAbrirSheetTextoGenerico(titulo, subtitulo, displayId, campo, placeholder) {
  var valorActual = (E.datos && E.datos[campo]) || '';
  ajAbrirSheetTexto('aj-sheet-texto', titulo, placeholder, function(v) {
    var payload = {}; payload[campo] = v;
    _ajGuardar(payload);
    var disp = document.getElementById(displayId);
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
  });
  var sub = document.getElementById('aj-sheet-texto-subtitulo');
  if (sub) { if (subtitulo) { sub.textContent = subtitulo; sub.style.display = 'block'; } else { sub.style.display = 'none'; } }
  var inp = document.getElementById('aj-sheet-texto-input');
  if (inp) inp.value = valorActual;
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

/* ── Relación de contacto de emergencia (pills single) ── */
function ajAbrirSheetRelacion(campo, displayId) {
  var actual = (E.datos && E.datos[campo]) || '';
  var opciones = ['Madre', 'Padre', 'Pareja', 'Hermana/o', 'Amiga/o', 'Otra'];
  var html = opciones.map(function(o) {
    var sel = o === actual;
    return '<span class="aj-pill' + (sel ? ' activa' : '') + '" data-val="' + o + '" onclick="_ajSheetTextoPillSingleClick(this)">' + o + '</span>';
  }).join('');
  _ajAbrirSheetTextoPills('Relación', '', 'pills-single', html, function(v) {
    var payload = {}; payload[campo] = v;
    _ajGuardar(payload);
    var disp = document.getElementById(displayId);
    if (disp) { disp.textContent = v; disp.classList.remove('vacio'); }
  });
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
  if (wrap) wrap.style.display = 'block';
  if (btn) btn.style.display = 'none';
}

function ajEliminarEmerg2() {
  var wrap = document.getElementById('aj-emerg2-wrap');
  var btn = document.getElementById('aj-btn-agregar-em2');
  if (wrap) wrap.style.display = 'none';
  if (btn) btn.style.display = '';
  _ajSetDatoVal('aj-em2nombre-val', '', '—', true);
  _ajSetDatoVal('aj-em2relacion-val', '', '—', true);
  _ajSetDatoVal('aj-em2tel-val', '', '—', true);
  _ajGuardar({ emerg2Nombre: '', emerg2Relacion: '', emerg2Telefono: '' });
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
}

function ajCerrarSheetLogout() {
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
  api({ action: 'getTallasDisponibles' }, function(tallas) {
    var tallaActual = E.datos && E.datos.talla ? E.datos.talla : '';
    grid.innerHTML = tallas.map(function(t) {
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

function ajCerrarSheetTallaAjustes() {
  var sh = document.getElementById('aj-sheet-talla-aj');
  var ov = document.getElementById('aj-sheet-talla-aj-overlay');
  sh.style.transform = 'translateY(100%)';
  setTimeout(function() { sh.style.display = 'none'; ov.style.display = 'none'; }, 350);
}

function ajGuardarTallaAjustes(btn) {
  var sel = document.querySelector('#aj-talla-aj-grid .equip-talla-pill.sel');
  var talla = sel ? sel.textContent.trim() : '';
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
}

function ajSelProtecAjustes(el) {
  document.querySelectorAll('#aj-s3c-pills-aj .equip-pill-protec').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
  var val = el.dataset.val;
  document.getElementById('aj-bs-protec-parciales').style.display = val === 'Otro' ? 'block' : 'none';
}

function ajCerrarSheetProtecAjustes() {
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
