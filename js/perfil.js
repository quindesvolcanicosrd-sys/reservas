function guardarEquipPerfil(btn) {
  var pat = document.getElementById('d-necesitaPatines').value;
  var talla = document.getElementById('d-talla').value.trim();
  var protec = document.getElementById('d-necesitaProtecciones').value;
  var textoOriginal = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Guardando...';
  api({ action: 'actualizarEquipamientoPersona', nombre: E.nombre, necesitaPatines: pat, talla: talla, necesitaProtecciones: protec }, function() {
    btn.disabled = false;
    if (E.datos) { E.datos.necesitaPatines = pat; E.datos.talla = talla; E.datos.necesitaProtecciones = protec; }
    btn.innerHTML = '✓ Guardado'; btn.classList.add('exito');
    setTimeout(function() { btn.innerHTML = textoOriginal; btn.classList.remove('exito'); }, 2500);
  }, function(e) { btn.disabled = false; btn.innerHTML = textoOriginal; alert('Error: ' + e.message); });
}

function irEditarDatos() {
  var datos = E.datosCompletos;
  if (!datos) { alert('No se encontraron datos pre-cargados.'); ir('s-home'); return; }

  var camposSimples = ['nombreDerby','numeroDerby','telefono','email','fechaPublica','edadPublica','tipoDocumento','numeroDocumento','nombreLegal','callePrincipal','calleSecundaria','numeracion','sector','emerg1Nombre','emerg1Telefono','emerg2Nombre','emerg2Telefono','talla','alergias','alergiasDesc','medicamentos','medicamentosDesc','atencionMedica','seguroContacto','antecedentesDetalle'];
  camposSimples.forEach(function(c) { var el = document.getElementById('d-' + c); if (el && datos[c] !== undefined) el.value = datos[c] || ''; });
  cargarSelect('d-canton', datos.canton, 'd-cantonOtro', 'campo-cantonOtro');
  cargarSelect('d-paisExpedicion',datos.paisExpedicion, null, null);
  cargarSelect('d-emerg1Relacion',datos.emerg1Relacion, null, null);
  cargarSelect('d-prefijo', datos.prefijo, 'd-prefijoOtro', 'campo-prefijoOtro');
  cargarSelect('d-emerg1Prefijo', datos.emerg1Prefijo, 'd-emerg1PrefijoOtro', 'campo-emerg1PrefijoOtro');
  cargarSelect('d-emerg2Relacion', datos.emerg2Relacion, null, null);
  cargarSelect('d-emerg2Prefijo', datos.emerg2Prefijo, 'd-emerg2PrefijoOtro', 'campo-emerg2PrefijoOtro');
  cargarSelect('d-necesitaPatines', datos.necesitaPatines, null, null);
  cargarSelect('d-necesitaProtecciones', datos.necesitaProtecciones, null, null);

  var fnDisp = document.getElementById('d-fechaNacimiento-display');
  if (fnDisp) {
    var fnRaw = (datos.fechaNacimiento || '').toString().trim();
    var fnText = '—';
    if (fnRaw) {
      var fpIso = fnRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (fpIso) {
        fnText = parseInt(fpIso[3]) + ' de ' + _MESES_DDP[parseInt(fpIso[2])-1] + ' de ' + fpIso[1];
      } else {
        var d = new Date(fnRaw);
        if (!isNaN(d.getTime())) {
          fnText = d.getUTCDate() + ' de ' + _MESES_DDP[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
        }
      }
    }
    fnDisp.textContent = fnText;
  }

  document.querySelectorAll('input[data-group="pronombres"]').forEach(function(cb) { cb.checked = false; });
  var inpPronOtro = document.getElementById('d-pronombresOtro'); if (inpPronOtro) inpPronOtro.value = ''; document.getElementById('campo-pronombresOtro').classList.remove('visible');
  if (datos.pronombres) { datos.pronombres.split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(val) { var cb = document.querySelector('input[data-group="pronombres"][value="' + val + '"]'); if (cb) { cb.checked = true; } else { var cbOtro = document.querySelector('input[data-group="pronombres"][value="Otro"]'); if (cbOtro) cbOtro.checked = true; if (inpPronOtro) inpPronOtro.value = val; document.getElementById('campo-pronombresOtro').classList.add('visible'); } }); }
  ir('s-datos');
}

function cargarSelect(selectId, valor, otroInputId, campoOtroId) {
  var sel = document.getElementById(selectId); if (!sel || valor === undefined) return;
  var opciones = Array.from(sel.options).map(function(o) { return o.value; });
  if (valor && opciones.indexOf(valor) !== -1) { sel.value = valor; } else if (valor) { sel.value = 'Otro'; if (otroInputId) { var inp = document.getElementById(otroInputId); if (inp) inp.value = valor; } if (campoOtroId) { var c = document.getElementById(campoOtroId); if (c) c.classList.add('visible'); } } else { sel.value = ''; }
}

function guardarSeccion(secId, btn) {
  var sec = document.getElementById(secId); var payload = {};
  var camposTel = { 'sec-contacto': 'd-telefono', 'sec-emerg1': 'd-emerg1Telefono', 'sec-emerg2': 'd-emerg2Telefono' };
  if (camposTel[secId]) { var telEl = document.getElementById(camposTel[secId]); if (telEl && telEl.value.trim()) { var tel = telEl.value.trim(); if (!/^[0-9]{7,15}$/.test(tel)) { alert('El número de teléfono debe tener entre 7 y 15 dígitos y solo puede contener números.'); return; } } }
  sec.querySelectorAll('input[id^="d-"]:not([type="checkbox"]):not([type="radio"]):not(.otro-texto):not([readonly]), select[id^="d-"], textarea[id^="d-"]:not(.otro-texto)').forEach(function(el) { payload[el.id.replace('d-', '')] = el.value.trim(); });
  ['canton','prefijo','emerg1Prefijo'].forEach(function(campo) { if (payload[campo] === 'Otro') { var inp = sec.querySelector('#d-' + campo + 'Otro'); if (inp && inp.value.trim()) payload[campo] = inp.value.trim(); } });
  var cbGroups = {}; sec.querySelectorAll('input[type="checkbox"][data-group]').forEach(function(cb) { var g = cb.getAttribute('data-group'); if (!cbGroups[g]) cbGroups[g] = []; if (cb.checked) cbGroups[g].push(cb.value); });
  Object.keys(cbGroups).forEach(function(g) { var vals = cbGroups[g].map(function(v) { if (v === 'Otro') { var inp = sec.querySelector('#d-' + g + 'Otro'); return inp && inp.value.trim() ? inp.value.trim() : ''; } return v; }).filter(Boolean); payload[g] = vals.join(', '); });
  if (Object.keys(payload).length === 0) return;
  var textoOriginal = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Guardando...';
  api({ action: 'actualizarDatosPersona', nombre: E.nombre, datos: JSON.stringify(payload) }, function(res) {
    btn.disabled = false;
    if (res.exito) {
      btn.innerHTML = '✓ Guardado'; btn.classList.add('exito');
      if (!E.datosCompletos) E.datosCompletos = {};
      for (var k in payload) { E.datosCompletos[k] = payload[k]; }
      setTimeout(function() { btn.innerHTML = textoOriginal; btn.classList.remove('exito'); }, 2500);
    } else { btn.innerHTML = textoOriginal; }
  }, function(e) { btn.disabled = false; btn.innerHTML = textoOriginal; alert('Error al guardar: ' + e.message); });
}

function toggleSeccion(id, titulo) {
  var body = document.getElementById(id); var estaAbierta = body.classList.contains('abierta');
  document.querySelectorAll('.datos-seccion-body.abierta').forEach(function(el) { if (el.id !== id) { el.classList.remove('abierta'); var otroTitulo = el.previousElementSibling; if (otroTitulo) otroTitulo.classList.remove('abierta'); } });
  body.classList.toggle('abierta', !estaAbierta); if (titulo) titulo.classList.toggle('abierta', !estaAbierta);
}

function toggleOtroSelect(campo) { var sel = document.getElementById('d-' + campo); var campoEl = document.getElementById('campo-' + campo + 'Otro'); if (campoEl) campoEl.classList.toggle('visible', sel && sel.value === 'Otro'); }
function toggleOtroCheckbox(grupo) { var cb = document.querySelector('input[data-group="' + grupo + '"][value="Otro"]'); var campoEl = document.getElementById('campo-' + grupo + 'Otro'); if (campoEl) campoEl.classList.toggle('visible', cb && cb.checked); }

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
    emoji.innerHTML = '<img src="' + url + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #F97316;" onerror="this.parentElement.textContent=\'🛼\'">';
  }
  var emojiD = document.querySelector('.home-emoji-desktop');
  if (emojiD && url) {
    emojiD.innerHTML = '<img src="' + url + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #F97316;margin-bottom:12px;" onerror="this.textContent=\'🛼\'">';
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
