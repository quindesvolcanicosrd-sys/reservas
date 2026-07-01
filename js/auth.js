var _gisUsuarioInicializado = false;

function iniciarGoogleSignInUsuario() {
  if (_gisUsuarioInicializado) return;
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(iniciarGoogleSignInUsuario, 200); return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID_FRONT,
    callback: onGoogleCredentialUsuario
  });
  _gisUsuarioInicializado = true;
  var cont = document.getElementById('g-signin-btn-usuario');
  if (!cont) return;
  var wrapper = document.getElementById('google-btn-wrapper');
  var ancho = Math.min(400, wrapper ? wrapper.offsetWidth : window.innerWidth - 48);
  google.accounts.id.renderButton(cont, {
    theme: 'filled_blue', size: 'large', text: 'continue_with', locale: 'es', width: ancho
  });
  var skMain = document.getElementById('gsignin-skeleton-main');
  if (skMain) { skMain.style.opacity = '0'; setTimeout(function(){ skMain.style.display = 'none'; }, 400); }
  if (!window._restaurandoSesion) {
    var _gObs = new MutationObserver(function() {
      var iframe = document.querySelector('#g-signin-btn-usuario iframe');
      if (!iframe) return;
      _gObs.disconnect();
      setTimeout(ocultarCargando, 350);
    });
    _gObs.observe(document.getElementById('g-signin-btn-usuario'), { childList: true, subtree: true });
    setTimeout(function() { _gObs.disconnect(); ocultarCargando(); }, 6000);
  }
}

function onGoogleCredentialUsuario(resp) {
  mostrarCargando('Verificando tu cuenta...');
  apiPost({ action: 'loginGoogle', idToken: resp.credential }, function(res) {
    if (res.esAdmin) {
      ocultarCargando();
      _adminToken = res.adminToken;
      _adminEmail = res.email;
      localStorage.setItem('adminSession', JSON.stringify({ adminToken: _adminToken, email: _adminEmail, exp: Date.now() + 11.5 * 3600 * 1000 }));
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(function(OneSignal) { OneSignal.login('admin_' + _adminEmail).catch(function(){}); });
      adminEntrar();
      return;
    }
    if (!res.valido) {
      ocultarCargando();
      if (res.noRegistrado) {
        window._tokenPendienteRegistro = resp.credential;
        var emailMostrar = '';
        try {
          var p = resp.credential.split('.');
          var pl = JSON.parse(atob(p[1].replace(/-/g,'+').replace(/_/g,'/')));
          emailMostrar = pl.email || '';
        } catch(ex) {}
        document.getElementById('msg-nr-email').textContent = emailMostrar;
        var msgNR = document.getElementById('msg-no-registrado');
        msgNR.style.display = 'block';
        msgNR.style.animation = 'fadeIn 0.35s ease';
        ocultarCargando();
        return;
      }
      var errEl = document.getElementById('err-google-login');
      errEl.textContent = res.error || 'Error al iniciar sesión. Intenta de nuevo.';
      errEl.style.display = 'block';
      setTimeout(function(){ errEl.style.display = 'none'; }, 5000);
      return;
    }
    _token = res.token || '';
    E.nombre = res.nombre;
    E.datos = res.datos;
    E.datosCompletos = res.datos;
    localStorage.setItem('session', JSON.stringify({ nombre: E.nombre, token: _token }));
    vincularPush(E.nombre);
    mostrarCargando('Cargando tus reservas...');
    api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
      _todasReservas = reservas;
      prepararHome();
      if (window._pendingNuevx) {
        var _pnx = window._pendingNuevx;
        window._pendingNuevx = null;
        if (E.datos) {
          E.datos.necesitaPatines      = _pnx.patines === 'si' ? 'Sí' : 'No';
          E.datos.necesitaProtecciones = _pnx.protec ? _pnx.protec : 'No';
          if (_pnx.talla) E.datos.talla = _pnx.talla;
        }
        setTimeout(function() { irNuevaReserva(true); }, 300);
      } else {
        ir('s-home');
        if (E.datos && !E.datos.permisosConfigurados) {
          setTimeout(function() { mostrarModalPermisos(E.nombre, E.datos.fotoPerfil || ''); }, 600);
        }
      }
    }, function() { prepararHome(); ir('s-home'); });
  }, function(e) {
    ocultarCargando();
    var errEl = document.getElementById('err-google-login');
    errEl.textContent = 'Error de conexión. Intenta de nuevo.';
    errEl.style.display = 'block';
    setTimeout(function(){ errEl.style.display = 'none'; }, 5000);
  });
}

function togglePinAcordeon() {
  var body = document.getElementById('pin-acordeon-body');
  var chevron = document.getElementById('pin-acordeon-chevron');
  var header = document.getElementById('pin-acordeon-header');
  var abierto = body.style.maxHeight && body.style.maxHeight !== '0px';
  if (!abierto) {
    body.style.maxHeight = '400px'; body.style.opacity = '1';
    chevron.style.transform = 'translateY(-50%) rotate(180deg)';
    header.style.background = 'var(--brand-dk)'; chevron.style.color = 'white';
  } else {
    body.style.maxHeight = '0'; body.style.opacity = '0';
    chevron.style.transform = 'translateY(-50%)';
    header.style.background = 'var(--brand)'; chevron.style.color = 'white';
  }
}

function continuar_pin_desde_s1() {
  var val = document.getElementById('inp-nombre-pin').value.trim();
  if (!val) { err('err-s1', 'Ingresa tu nombre o correo registrado.'); return; }
  if (val.indexOf('@') !== -1) {
    mostrarCargando('Verificando...');
    api({ action: 'resolverNombre', identificador: val }, function(res) {
      if (!res.encontrado) { ocultarCargando(); err('err-s1', 'No encontramos ninguna cuenta con ese correo.'); return; }
      E.nombre = res.nombre;
      continuar_pin();
    }, function(e) { ocultarCargando(); err('err-s1', 'Error de conexión: ' + e.message); });
  } else {
    E.nombre = val;
    continuar_pin();
  }
}

function continuar_s1() {
  var nombre = document.getElementById('sel-nombre').value.trim();
  if (!nombre) { err('err-s1', 'Por favor selecciona tu nombre.'); return; }
  E.nombre = nombre; resetPinPad(); ir('s1b');
}

var _validandoPin = false;
function continuar_pin() {
  if (_validandoPin) return;
  var pin = document.getElementById('input-pin').value;
  if (!/^\d{4}$/.test(pin)) { err('err-pin', 'Ingresa un PIN válido de 4 dígitos.'); return; }
  _validandoPin = true;
  mostrarCargando('Verificando tu PIN...');

  sha256Hex(pin + '|' + E.nombre).then(function(hash) {
    api({ action: 'validarPin', nombre: E.nombre, pinHash: hash }, function(res) {
      _validandoPin = false;
      if (!res.valido) {
        ocultarCargando(); resetPinPad();
        err('err-pin', res.bloqueado
          ? 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.'
          : 'PIN o nombre incorrecto.');
        return;
      }
      _token = res.token || '';
      E.datos = res.datos;
      E.datosCompletos = res.datos;
      localStorage.setItem('session', JSON.stringify({ nombre: E.nombre, token: _token }));
      vincularPush(E.nombre);

      mostrarCargando('Cargando tus reservas...');
      api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
        _todasReservas = reservas;
        prepararHome();
        ir('s-home');
      }, function(e2) { prepararHome(); ir('s-home'); alert('Error al cargar reservas: ' + e2.message); });

    }, function(e1) { _validandoPin = false; ocultarCargando(); ir('s1b'); err('err-pin', 'Error: ' + e1.message); });
  });
}

function syncPinDots() {
  var inp = document.getElementById('input-pin');
  inp.value = inp.value.replace(/\D/g,'').slice(0,4);
  if (inp.value.length === 4) { inp.blur(); continuar_pin_desde_s1(); }
}
function resetPinPad() {
  var inp = document.getElementById('input-pin');
  inp.value = '';
  inp.type = 'password';
  var icon = document.getElementById('toggle-pin-icon');
  if (icon) icon.textContent = 'visibility';
}
function togglePinVisibility() {
  var inp = document.getElementById('input-pin');
  var icon = document.getElementById('toggle-pin-icon');
  if (inp.type === 'password') { inp.type = 'tel'; icon.textContent = 'visibility_off'; }
  else { inp.type = 'password'; icon.textContent = 'visibility'; }
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  api({ action: 'cerrarSesion' }, function(){}, function(){});
  localStorage.removeItem('session');
  _token = '';
  E.nombre = ''; E.datos = null; E.datosCompletos = null; _todasReservas = []; E.reagendando = false;
  var sel = document.getElementById('sel-nombre'); if (sel) sel.value = '';
  ir('s1');
}

function cerrarMsgNoRegistrado() {
  var el = document.getElementById('msg-no-registrado');
  var h = el.scrollHeight;
  el.style.overflow = 'hidden'; el.style.maxHeight = h + 'px';
  void el.offsetWidth;
  el.style.animation = 'fadeOut 0.3s ease forwards';
  el.style.transition = 'max-height 0.35s 0.2s ease, padding 0.35s 0.2s ease, margin 0.35s 0.2s ease';
  setTimeout(function() { el.style.maxHeight = '0'; el.style.paddingTop = '0'; el.style.paddingBottom = '0'; el.style.marginTop = '0'; el.style.marginBottom = '0'; }, 50);
  setTimeout(function() { el.style.cssText = ''; el.style.display = 'none'; }, 600);
}

function irAlRegistro() {
  var token = window._tokenPendienteRegistro || '';
  window.location.href = 'https://reservas.quindesvolcanicos.com/inscripcion/' + (token ? '?token=' + encodeURIComponent(token) : '');
}

function solicitarNombreUsuario() {
  window.location.href = 'mailto:quindesvolcanicosrd@gmail.com?subject=' + encodeURIComponent('Consulta nombre de usuario') + '&body=' + encodeURIComponent('Hola,\n\nOlvidé el nombre con que me registré.\n\nMi correo: \n\nGracias.');
}

function solicitarNuevoPIN(){
  var email = ((E.datos && E.datos.email) || '').trim();
  var subject = encodeURIComponent('Solicitud de nuevo PIN - ' + email);
  var body = encodeURIComponent('Hola,\n\nNecesito solicitar un nuevo PIN de acceso para mis reservas.\n\nEmail registrado: ' + email + '\n\nGracias.');
  window.location.href = 'mailto:quindesvolcanicosrd@gmail.com?subject=' + subject + '&body=' + body;
}

window.onload = function() {
  document.querySelectorAll('.pantalla').forEach(function(p) { p.classList.remove('activa'); });
  var ov = document.getElementById('loading-overlay');
  ov.classList.remove('fade-out');
  ov.style.display = 'flex';
  document.getElementById('loading-msg').textContent = 'Cargando...';
  (function() {
    var logo = document.querySelector('.loading-logo');
    var spinner = document.querySelector('#loading-overlay .spinner');
    var msg = document.getElementById('loading-msg');
    if (logo && window.innerWidth <= 600) {
      logo.style.opacity = '0'; spinner.style.opacity = '0'; msg.style.opacity = '0';
      setTimeout(function() { logo.style.transition='opacity 0.5s ease'; logo.style.opacity='1'; }, 100);
      setTimeout(function() { spinner.style.transition='opacity 0.4s ease'; spinner.style.opacity='1'; }, 600);
      setTimeout(function() { msg.style.transition='opacity 0.4s ease'; msg.style.opacity='1'; }, 900);
    }
  })();

  setTimeout(function() {
    var ov2 = document.getElementById('loading-overlay');
    if (ov2 && ov2.style.display !== 'none' && !ov2.classList.contains('fade-out')) {
      ocultarCargando();
      if (!E.datos) ir('s1', true);
    }
  }, 12000);

  var _urlParams = new URLSearchParams(location.search);
  var _tokenNuevx = '';
  if (_urlParams.get('nuevx') === '1') {
    var _patinesNuevx = _urlParams.get('patines') || 'no';
    var _protecNuevx  = _urlParams.get('protec')  || 'no';
    var _tallaNuevx   = _urlParams.get('talla')   || '';
    _tokenNuevx = _urlParams.get('token') || '';
    window._pendingNuevx = { patines: _patinesNuevx, protec: _protecNuevx, talla: _tallaNuevx };
    history.replaceState({}, '', location.pathname);
  }

  var _restaurando = false;

  var adminSession = localStorage.getItem('adminSession');
  if (adminSession) {
    try {
      var ad = JSON.parse(adminSession);
      if (ad.adminToken && ad.email && Date.now() < (ad.exp || 0)) {
        _restaurando = true;
        _adminToken = ad.adminToken; _adminEmail = ad.email;
        adminEntrar();
        ocultarCargando();
      } else { localStorage.removeItem('adminSession'); }
    } catch (ex) { localStorage.removeItem('adminSession'); }
  }

  var session = localStorage.getItem('session');
  if (!_restaurando && session) {
    try {
      var s = JSON.parse(session);
      if (s.token && s.nombre) {
        _restaurando = true;
        window._restaurandoSesion = true;
        _token = s.token; E.nombre = s.nombre;
        mostrarCargando('Restaurando tu sesión...');
        api({ action: 'restaurarSesion' }, function(res) {
          if (!res.valido) { window._restaurandoSesion = false; localStorage.removeItem('session'); _token = ''; E.nombre = ''; ocultarCargando(); ir('s1', true); return; }
          E.datos = res.datos; E.datosCompletos = res.datos;
          vincularPush(E.nombre);
          api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
            _todasReservas = reservas;
            prepararHome();
            window._restaurandoSesion = false;
            if (window._pendingNuevx) {
              var _pnx = window._pendingNuevx; window._pendingNuevx = null;
              if (E.datos) { E.datos.necesitaPatines = _pnx.patines === 'si' ? 'Sí' : 'No'; E.datos.necesitaProtecciones = _pnx.protec ? _pnx.protec : 'No'; if (_pnx.talla) E.datos.talla = _pnx.talla; }
              setTimeout(function() { irNuevaReserva(true); }, 300);
            } else { ir('s-home'); }
          }, function() { prepararHome(); ir('s-home'); window._restaurandoSesion = false; });
        }, function() { window._restaurandoSesion = false; localStorage.removeItem('session'); _token = ''; E.nombre = ''; ocultarCargando(); ir('s1', true); });
      } else { localStorage.removeItem('session'); }
    } catch (ex) { localStorage.removeItem('session'); }
  }
  if (!_restaurando) {
    if (_tokenNuevx) {
      mostrarCargando('Iniciando tu sesión...');
      onGoogleCredentialUsuario({ credential: _tokenNuevx });
    } else {
      ir('s1', true);
    }
  }
  requestAnimationFrame(function() { requestAnimationFrame(iniciarGoogleSignInUsuario); });

  api({ action: 'getPreciosClases' }, function(precios) {
    E.precioPorClase = parseFloat(precios.precioPorClase) || 0;
    E.precioMensual  = parseFloat(precios.precioMensual)  || 0;
  }, function() {});
  generarMeses();
};

window.addEventListener('pageshow', function(e) {
  if (e.persisted) {
    document.querySelectorAll('.pantalla').forEach(function(p) { p.classList.remove('activa'); });
    var ov = document.getElementById('loading-overlay');
    ov.classList.remove('fade-out');
    ov.style.display = 'flex';
    if (_adminToken) { ir('s-admin-home'); ocultarCargando(); }
    else if (E.datos) { prepararHome(); ir('s-home'); }
    else { ir('s1', true); ocultarCargando(); }
  }
});
