var G = {
  idToken:     '',
  email:       '',
  nombre:      '',
  foto:        '',
  fechaNac:    '',
  guardarFoto: false,
  guardarFecha:false,
  fechaPublica:false,
  edadPublica: false,
  mayorEdad:   ''
};

var PAISES = [
  { nombre:'Ecuador',flag:'🇪🇨',code:'593',min:10,max:10 },
  { nombre:'Colombia',flag:'🇨🇴',code:'57',min:10,max:10 },
  { nombre:'Perú',flag:'🇵🇪',code:'51',min:9,max:9 },
  { nombre:'Venezuela',flag:'🇻🇪',code:'58',min:10,max:11 },
  { nombre:'Argentina',flag:'🇦🇷',code:'54',min:10,max:11 },
  { nombre:'Chile',flag:'🇨🇱',code:'56',min:9,max:9 },
  { nombre:'Bolivia',flag:'🇧🇴',code:'591',min:8,max:8 },
  { nombre:'Uruguay',flag:'🇺🇾',code:'598',min:8,max:9 },
  { nombre:'Paraguay',flag:'🇵🇾',code:'595',min:9,max:9 },
  { nombre:'México',flag:'🇲🇽',code:'52',min:10,max:10 },
  { nombre:'España',flag:'🇪🇸',code:'34',min:9,max:9 },
  { nombre:'Estados Unidos',flag:'🇺🇸',code:'1',min:10,max:10 },
  { nombre:'Canadá',flag:'🇨🇦',code:'1',min:10,max:10 },
  { nombre:'Brasil',flag:'🇧🇷',code:'55',min:10,max:11 },
  { nombre:'Costa Rica',flag:'🇨🇷',code:'506',min:8,max:8 },
  { nombre:'Panamá',flag:'🇵🇦',code:'507',min:8,max:8 },
  { nombre:'Guatemala',flag:'🇬🇹',code:'502',min:8,max:8 },
  { nombre:'Honduras',flag:'🇭🇳',code:'504',min:8,max:8 },
  { nombre:'El Salvador',flag:'🇸🇻',code:'503',min:8,max:8 },
  { nombre:'Nicaragua',flag:'🇳🇮',code:'505',min:8,max:8 },
  { nombre:'Cuba',flag:'🇨🇺',code:'53',min:8,max:8 },
  { nombre:'República Dominicana',flag:'🇩🇴',code:'1',min:10,max:10 },
  { nombre:'Puerto Rico',flag:'🇵🇷',code:'1',min:10,max:10 },
  { nombre:'Alemania',flag:'🇩🇪',code:'49',min:10,max:12 },
  { nombre:'Francia',flag:'🇫🇷',code:'33',min:9,max:9 },
  { nombre:'Italia',flag:'🇮🇹',code:'39',min:9,max:11 },
  { nombre:'Portugal',flag:'🇵🇹',code:'351',min:9,max:9 },
  { nombre:'Reino Unido',flag:'🇬🇧',code:'44',min:10,max:10 },
  { nombre:'Países Bajos',flag:'🇳🇱',code:'31',min:9,max:9 },
  { nombre:'Suiza',flag:'🇨🇭',code:'41',min:9,max:9 },
  { nombre:'Australia',flag:'🇦🇺',code:'61',min:9,max:9 },
  { nombre:'Japón',flag:'🇯🇵',code:'81',min:10,max:11 },
  { nombre:'Israel',flag:'🇮🇱',code:'972',min:9,max:9 },
  { nombre:'China',flag:'🇨🇳',code:'86',min:11,max:11 }
];
var _paisSel = PAISES[0];

function poblarPaises() {
  var dl = document.getElementById('paises-list');
  PAISES.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.flag + ' ' + p.nombre + ' +' + p.code;
    dl.appendChild(opt);
  });
  document.getElementById('f-prefijo-txt').value = '🇪🇨 Ecuador +593';
}

function onPrefijoInput(inp) {
  var q = inp.value.toLowerCase().replace(/\s+/g,' ').trim();
  var encontrado = PAISES.find(function(p) {
    return p.nombre.toLowerCase().includes(q) ||
           ('+' + p.code).includes(q) ||
           p.code.includes(q.replace('+','')) ||
           (p.flag + ' ' + p.nombre + ' +' + p.code).toLowerCase() === q;
  });
  if (!encontrado) {
    var opts = document.querySelectorAll('#paises-list option');
    opts.forEach(function(o) { if (o.value.toLowerCase() === q) {
      var m = o.value.match(/\+(\d+)/);
      if (m) encontrado = PAISES.find(function(p) { return p.code === m[1]; });
    }});
  }
  if (encontrado) {
    _paisSel = encontrado;
    document.getElementById('pref-flag').textContent = encontrado.flag;
    document.getElementById('f-prefijo-val').value   = encontrado.flag + ' +' + encontrado.code + ' (' + encontrado.nombre + ')';
    document.getElementById('f-prefijo-code').value  = encontrado.code;
    document.getElementById('f-tel-minlen').value    = encontrado.min;
    var hint = encontrado.nombre + ' → mínimo ' + encontrado.min;
    if (encontrado.max !== encontrado.min) hint += ', máximo ' + encontrado.max + ' dígitos';
    else hint += ' dígitos exactos';
    document.getElementById('pref-hint').textContent = hint;
  }
}

function soloNumeros(inp) { inp.value = inp.value.replace(/\D/g,''); }

function apiPost(params, ok, fail) {
  var body = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  fetch(BACKEND, {
    method:'POST', mode:'cors',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: body
  })
  .then(function(r){ return r.json(); })
  .then(function(d){ d && d.error ? fail({message:d.error}) : ok(d); })
  .catch(fail);
}
function apiGet(params, ok, fail) {
  var url = BACKEND + '?' + Object.keys(params).map(function(k){
    return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);
  }).join('&');
  fetch(url, {method:'GET', mode:'cors'})
  .then(function(r){ return r.json(); })
  .then(function(d){ d && d.error ? fail({message:d.error}) : ok(d); })
  .catch(fail);
}

function desbloquearForm() {
  var sf = document.getElementById('section-form');
  sf.classList.remove('form-locked');
  sf.classList.add('form-unlocked');
  var div = document.getElementById('divider-form');
  if (div) { div.style.display = ''; div.style.animation = 'slideUp 0.4s 0.15s both'; }
}

var _gisReady = false;
function initGIS() {
  if (_gisReady) return;
  if (typeof google === 'undefined') { setTimeout(initGIS, 200); return; }
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCred });
  var cont = document.getElementById('gsignin-btn');
  cont.innerHTML = '';
  google.accounts.id.renderButton(cont, { theme: 'filled_blue', size:'large', text:'signin_with', locale:'es', width:280 });
  var sk = document.getElementById('gsignin-skeleton');
  if (sk) { sk.style.opacity = '0'; setTimeout(function(){ sk.style.display = 'none'; }, 400); }
  _gisReady = true;
  cont.style.animation = 'fadeInBtn 0.4s ease 0.7s both';
}

function onGoogleCred(resp) {
  mostrarCargando('Verificando cuenta...');
  try {
    var parts   = resp.credential.split('.');
    var payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    G.idToken  = resp.credential;
    G.email    = (payload.email || '').toLowerCase();
    G.nombre   = (payload.given_name || payload.name || '').split(' ')[0];
    G.foto     = payload.picture || '';
    G.fechaNac = payload.birthdate || '';
  } catch(ex) {
    ocultarCargando(); errMsg('err-p0','Error al leer el token. Intenta de nuevo.'); return;
  }

  apiGet({ action:'verificarEmailDisponible', email:G.email }, function(res){
    ocultarCargando();
    if (!res.disponible) {
      errMsg('err-p0','Este correo ya tiene una cuenta registrada ("' + res.nombre + '"). Puedes iniciar sesión directamente en la app.');
      return;
    }
    var gWrap = document.getElementById('gsignin-btn');
    if (gWrap && gWrap.parentElement) gWrap.parentElement.style.display = 'none';
    document.getElementById('form-titulo').textContent = 'Completa tu registro';
    document.getElementById('form-subtitulo').style.display = 'none';
    actualizarPreviewPerfil();
    var sp = document.getElementById('section-permisos');
    sp.classList.add('visible');
    if (G.nombre) { var fn = document.getElementById('f-nombre'); if (!fn.value) fn.value = G.nombre; }
    if (G.fechaNac) {
      establecerFechaNacEnSelects(G.fechaNac);
      calcularMayorEdad(G.fechaNac);
    }
    setTimeout(desbloquearForm, 250);
  }, function(e){ ocultarCargando(); errMsg('err-p0','Error de conexión: '+e.message); });
}

function actualizarPreviewPerfil() {
  document.getElementById('pf-email').textContent = G.email;
  if (G.nombre) {
    document.getElementById('pf-name').textContent = G.nombre;
    document.getElementById('pf-initials').textContent = G.nombre.charAt(0).toUpperCase();
    if (G.foto) {
      var img = document.createElement('img');
      img.src = G.foto; img.className='profile-avatar'; img.alt='';
      img.id = 'pf-initials';
      document.getElementById('pf-initials').replaceWith(img);
    }
  } else {
    document.getElementById('pf-initials').textContent = G.email.charAt(0).toUpperCase();
  }
}

function onTogFoto(cb)  { G.guardarFoto  = cb.checked; }
function onTogFecha(cb) { G.guardarFecha = cb.checked; }

var MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function poblarSelectFechaNac() {
  var selD = document.getElementById('fnac-dia');
  var selM = document.getElementById('fnac-mes');
  var selA = document.getElementById('fnac-anio');
  if (!selD || !selM || !selA) return;
  for (var d = 1; d <= 31; d++) {
    var od = document.createElement('option');
    od.value = (d < 10 ? '0' : '') + d; od.textContent = d;
    selD.appendChild(od);
  }
  MESES_ES.forEach(function(nombre, idx) {
    var om = document.createElement('option');
    om.value = (idx + 1 < 10 ? '0' : '') + (idx + 1); om.textContent = nombre;
    selM.appendChild(om);
  });
  var anioActual = new Date().getFullYear();
  for (var a = anioActual; a >= anioActual - 100; a--) {
    var oa = document.createElement('option');
    oa.value = '' + a; oa.textContent = '' + a;
    selA.appendChild(oa);
  }
}

function obtenerFechaNacISO() {
  return document.getElementById('fnac-iso').value || '';
}

function establecerFechaNacEnSelects(iso) {
  if (!iso) return;
  document.getElementById('fnac-iso').value = iso;
  var p = iso.split('-');
  if (p.length === 3) {
    var disp = document.getElementById('fnac-display');
    disp.textContent = parseInt(p[2])+' '+MESES[parseInt(p[1])-1]+' '+p[0];
    disp.classList.remove('fnac-placeholder');
  }
}

function onFechaNacSelectChange() {
  var iso = obtenerFechaNacISO();
  if (!iso) return;
  G.fechaNac = iso;
  calcularMayorEdad(iso);
}

function calcularMayorEdad(fechaStr) {
  var fn = new Date(fechaStr);
  if (isNaN(fn.getTime())) { G.mayorEdad = ''; return; }
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var edad = hoy.getFullYear() - fn.getFullYear();
  var m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m===0 && hoy.getDate() < fn.getDate())) edad--;
  G.mayorEdad = edad >= 18 ? 'Sí, declaro ser mayor de 18 años de edad' : 'No, tengo menos de 18 años';
}

var _nombreTimer = null;
function validarNombreLive(inp) {
  inp.value = inp.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]/g,'');
  var ok = document.getElementById('hint-nombre-ok');
  if (ok) ok.style.display = inp.value.trim().length >= 2 ? 'block' : 'none';
}

function toggleOtroPron(cb) {
  document.getElementById('cond-pron-otro').classList.toggle('visible', cb.checked);
}

function selPat(label, val) {
  document.querySelectorAll('input[name="patines"]').forEach(function(r){ r.closest('.opcion').classList.remove('sel'); });
  label.classList.add('sel');
  document.getElementById('cond-talla').classList.toggle('visible', val==='Sí');
}
function selProtec(label, val) {
  document.querySelectorAll('input[name="protec"]').forEach(function(r){ r.closest('.opcion').classList.remove('sel'); });
  label.classList.add('sel');
  document.getElementById('cond-protec-otro').classList.toggle('visible', val==='Otro');
}

function cargarTallas() {
  apiGet({action:'getTallasDisponibles'}, function(tallas){
    var sel = document.getElementById('f-talla');
    sel.innerHTML = '<option value="">Elige una talla</option>';
    tallas.forEach(function(t){
      var o=document.createElement('option'); o.value=o.textContent=t; sel.appendChild(o);
    });
  }, function(){ /* silencioso, el backend valida */ });
}

function enviarForm() {
  if (!G.idToken) { errMsg('err-form','Primero conecta tu cuenta de Google.'); return; }

  var nombre = document.getElementById('f-nombre').value.trim();
  if (!nombre || nombre.length < 2) { errMsg('err-form','El nombre debe tener al menos 2 caracteres.'); document.getElementById('f-nombre').scrollIntoView({behavior:'smooth',block:'center'}); return; }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/.test(nombre)) { errMsg('err-form','El nombre solo puede contener letras y espacios.'); return; }

  var prons = Array.from(document.querySelectorAll('input[name="pron"]:checked'))
    .map(function(cb){ return cb.value==='Otro' ? document.getElementById('f-pron-otro').value.trim() : cb.value; })
    .filter(Boolean);
  if (prons.length === 0) { errMsg('err-form','Selecciona al menos un pronombre.'); return; }

  var fechaNacISO = obtenerFechaNacISO();
  if (!fechaNacISO) {
    errMsg('err-form','La fecha de nacimiento es obligatoria.');
    document.getElementById('fnac-dia').scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  G.fechaNac = fechaNacISO;
  calcularMayorEdad(G.fechaNac);
  var tel    = document.getElementById('f-telefono').value.trim();
  var minLen = parseInt(document.getElementById('f-tel-minlen').value) || 6;
  var maxLen = _paisSel ? _paisSel.max : 15;
  if (!tel) { errMsg('err-form','El número de teléfono es obligatorio.'); return; }
  if (!/^\d+$/.test(tel)) { errMsg('err-form','Solo se permiten números en el teléfono.'); return; }
  if (tel.length < minLen || tel.length > maxLen) { errMsg('err-form','El número debe tener entre ' + minLen + ' y ' + maxLen + ' dígitos para ' + (_paisSel ? _paisSel.nombre : 'este país') + '.'); return; }

  var patRad = document.querySelector('input[name="patines"]:checked');
  if (!patRad) { errMsg('err-form','Indica si necesitas patines.'); return; }
  var patines = patRad.value, talla = '';
  if (patines === 'Sí') {
    talla = document.getElementById('f-talla').value;
    if (!talla) { errMsg('err-form','Selecciona una talla de patines.'); return; }
  }

  var protecRad = document.querySelector('input[name="protec"]:checked');
  if (!protecRad) { errMsg('err-form','Indica si necesitas protecciones.'); return; }
  var protec = protecRad.value;
  if (protec === 'Otro') {
    var otroT = document.getElementById('f-protec-otro').value.trim();
    if (!otroT) { errMsg('err-form','Describe qué protecciones necesitas.'); return; }
    protec = otroT;
  }

  G.guardarFoto  = document.getElementById('tog-foto').checked;
  G.guardarFecha = document.getElementById('tog-fecha').checked;
  G.fechaPublica = document.getElementById('tog-fecha-pub').checked;
  G.edadPublica  = document.getElementById('tog-edad-pub').checked;
  if (!G.guardarFoto) G.foto = '';

  var pin = (document.getElementById('f-pin') || {}).value || '';

  function _doEnviar(pinHash) {
    mostrarCargando('Creando tu cuenta...');
    apiPost({
      action:'inscribirPersona', nombre:nombre, email:G.email, idToken:G.idToken,
      pronombres:prons.join(', '), prefijo:document.getElementById('f-prefijo-val').value,
      telefono:tel, necesitaPatines:patines, talla:talla, necesitaProtecciones:protec,
      foto:G.guardarFoto ? G.foto : '',
      fechaNac:G.guardarFecha ? (G.fechaNac || '') : '',
      guardarFecha:G.guardarFecha ? 'si' : 'no',
      fechaPublica:G.fechaPublica ? 'Sí' : 'No',
      edadPublica:G.edadPublica  ? 'Sí' : 'No',
      mayorEdad:G.mayorEdad,
      pinHash: pinHash || ''
    }, function(res){
      ocultarCargando();
      if (res.exito) {
        document.getElementById('exito-nombre').textContent = nombre;
        document.getElementById('form-card').style.display = 'none';
        var ex = document.getElementById('section-exito');
        ex.style.display = 'block';
        ex.style.animation = 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both';
        window.scrollTo({top:0,behavior:'smooth'});
        var _patinesParam = patines === 'Sí' ? 'si' : 'no';
        var _protecParam  = protec  === 'No' ? 'no' : 'si';
        var _params = 'nuevx=1'
          + '&nombre='   + encodeURIComponent(nombre)
          + '&patines='  + _patinesParam
          + '&protec='   + _protecParam
          + (_patinesParam === 'si' && talla ? '&talla=' + encodeURIComponent(talla) : '');
        setTimeout(function() {
          var lt = document.getElementById('exito-loader-txt');
          if (lt) lt.textContent = '¡Listo! Redirigiendo...';
          var btnWpG = document.getElementById('btn-wp-grupo-exito');
          if (btnWpG) btnWpG.style.display = 'flex';
        }, 1600);
        setTimeout(function() {
          window.location.href = 'https://reservas.quindesvolcanicos.com?' + _params;
        }, 2800);
      } else {
        var msgError = res.error || 'Error al registrarse. Intenta de nuevo.';
        errMsg('err-form', msgError);
        window.scrollTo({top:0,behavior:'smooth'});
      }
    }, function(e){
      ocultarCargando();
      errMsg('err-form','Error de conexión: ' + e.message);
    });
  }

  function ejecutarEnvio() {
    if (pin && /^\d{4}$/.test(pin)) {
      sha256Hex(pin + '|' + nombre).then(function(hash) { _doEnviar(hash); });
    } else {
      _doEnviar('');
    }
  }

  ejecutarEnvio();
}

function errMsg(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg; el.style.display = 'block';
  setTimeout(function(){ el.style.display='none'; }, 6000);
}

function mostrarCargando(msg) {
  var ov  = document.getElementById('loading-overlay');
  var txt = ov.querySelector('.loading-txt');
  ov.style.opacity = '0';
  ov.style.display = 'flex';
  ov.classList.remove('fade-out');
  void ov.offsetWidth;
  ov.style.transition = 'opacity 0.35s ease';
  ov.style.opacity = '1';
  if (txt && msg) txt.textContent = msg;
}
function ocultarCargando() {
  var ov = document.getElementById('loading-overlay');
  ov.style.transition = 'opacity 0.35s ease';
  ov.style.opacity = '0';
  setTimeout(function(){
    ov.style.display = 'none';
    ov.style.opacity = '';
    ov.style.transition = '';
  }, 380);
}

function abrirContacto()  { document.getElementById('modal-contacto').classList.add('visible'); }
function cerrarContacto() { document.getElementById('modal-contacto').classList.remove('visible'); }

function abrirPickerFecha() {
  var actual = document.getElementById('fnac-iso').value;
  var display = '';
  if (actual) { var p=actual.split('-'); if(p.length===3) display=p[2]+'/'+p[1]+'/'+p[0]; }
  abrirDatePicker(display, function(val) {
    var parts = val.split('/');
    var iso = parts[2]+'-'+parts[1]+'-'+parts[0];
    document.getElementById('fnac-iso').value = iso;
    var p = parseFecha(val);
    var disp = document.getElementById('fnac-display');
    if (p) { disp.textContent = p.day+' '+MESES[p.month]+' '+p.year; disp.classList.remove('fnac-placeholder'); }
    G.fechaNac = iso;
    calcularMayorEdad(iso);
  });
}

function togglePinVisibilityForm() {
  var inp = document.getElementById('f-pin');
  var icon = document.getElementById('toggle-pin-icon-form');
  if (inp.type === 'password') { inp.type = 'tel'; icon.textContent = 'visibility_off'; }
  else { inp.type = 'password'; icon.textContent = 'visibility'; }
}

window.onload = function() {
  poblarPaises();
  cargarTallas();
  initDatePickerListeners();
  var _urlToken = new URLSearchParams(location.search).get('token');
  if (_urlToken) {
    ocultarCargando();
    onGoogleCred({ credential: _urlToken });
  } else {
    initGIS();
    ocultarCargando();
  }
  var _ref = document.referrer;
  var _btnBack = document.getElementById('btn-back-inscripcion');
  if (_btnBack && (_ref.includes('reservas.quindesvolcanicos.com') || _urlToken)) {
    _btnBack.style.display = 'flex';
  }
};
