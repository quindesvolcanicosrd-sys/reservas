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
  var s1 = document.getElementById('s1');

  function renderizarBoton() {
    var anchoReal = wrapper ? wrapper.offsetWidth : 0;
    var ancho = Math.min(400, anchoReal || (window.innerWidth - 48));
    google.accounts.id.renderButton(cont, {
      theme: 'filled_blue', size: 'large', text: 'continue_with', locale: 'es', width: ancho
    });
    var skMain = document.getElementById('gsignin-skeleton-main');
    if (skMain) { skMain.style.opacity = '0'; setTimeout(function(){ skMain.style.display = 'none'; }, 400); }
    if (!window._restaurandoSesion && !window._loginAutoEnCurso) {
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

  // renderButton() graba el width recibido de forma permanente en el iframe
  // (no se puede volver a renderizar después) -- si #s1 todavía no es la
  // pantalla activa en este momento (restaurando sesión guardada, o login
  // automático ?nuevx=1: ninguno de los 2 llama ir('s1') de entrada),
  // #google-btn-wrapper vive dentro de un .pantalla sin la clase .activa y
  // su offsetWidth es 0 -- medir ahí deja el botón angosto para siempre en
  // esta carga de página, aunque el usuario recién vea #s1 mucho después
  // (ej. al cerrar sesión) -- de ahí el bug siendo intermitente ("a veces"),
  // depende de qué rama de login tomó esta carga. En vez de arriesgar una
  // sola lectura al doble rAF fijo de window.onload (o esperar con un timer
  // acotado, que igual mediría 0 si la sesión dura más que el timer), se
  // observa la clase de #s1 y se difiere la medición/render hasta el
  // momento real en que ir('s1') lo activa -- sin importar cuánto tarde.
  if (s1 && s1.classList.contains('activa')) {
    renderizarBoton();
  } else if (s1) {
    var _obsS1 = new MutationObserver(function() {
      if (s1.classList.contains('activa')) {
        _obsS1.disconnect();
        requestAnimationFrame(function() { requestAnimationFrame(renderizarBoton); });
      }
    });
    _obsS1.observe(s1, { attributes: true, attributeFilter: ['class'] });
  } else {
    renderizarBoton();
  }
}

// Muestra mostrarModalPermisos() (js/perfil.js) si la cuenta todavía no lo
// configuró — llamada tanto desde login fresco de Google (onGoogleCredentialUsuario)
// como desde restaurarSesion() exitosa (window.onload), antes solo el primero
// disparaba este modal: una cuenta que solo mantiene la sesión guardada podía
// no verlo nunca. Coordinada con modal-info-home (que ir('s-home') puede
// mostrar 600ms después, si el usuario no lo vio todavía) para que no compitan
// por pantalla al mismo tiempo — mismo patrón de callback ya usado por
// mostrarModalInfoReserva()/modalInfoOk()/modalInfoLater() (js/ui.js) para
// encadenar una acción a que el usuario cierre un modal-info primero.
function _mostrarPermisosSiHaceFalta(fotoFallback) {
  if (!(E.datos && !E.datos.permisosConfigurados)) return;
  var mostrarPermisos = function() { mostrarModalPermisos(E.nombre, E.datos.fotoPerfil || fotoFallback || ''); };
  if (_yaVioModal('home')) {
    setTimeout(mostrarPermisos, 600);
  } else {
    window._modalInfoHomeCallback = mostrarPermisos;
  }
}

function onGoogleCredentialUsuario(resp) {
  mostrarCargando('Verificando tu cuenta...');
  apiPost({ action: 'loginGoogle', idToken: resp.credential }, function(res) {
    if (res.esAdmin) {
      _adminToken = res.adminToken;
      _adminEmail = res.email;
      _dashboardAdminLimitado = (res.dashboardAdmin !== false);
      var _plAdmin = _decodificarJwtGoogle(resp.credential);
      _adminNombre = (_plAdmin && _plAdmin.name) || _adminEmail;
      // dashboardAdmin cacheado acá (ver MANIFEST.md "Cambios recientes" --
      // 2 caminos de restauración competían al recargar): window.onload lo
      // lee de vuelta para el atajo sin backend de una cuenta admin "pura"
      // sin fila en Equipo (nunca tiene 'session'/token regular, así que no
      // hay ningún otro camino del que sacar este dato al restaurar).
      localStorage.setItem('adminSession', JSON.stringify({ adminToken: _adminToken, email: _adminEmail, nombre: _adminNombre, dashboardAdmin: _dashboardAdminLimitado, exp: Date.now() + 11.5 * 3600 * 1000 }));
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(function(OneSignal) { OneSignal.login('admin_' + _adminEmail).catch(function(){}); });
      // dashboardAdmin:true (o ausente, retrocompatibilidad con cuentas admin
      // sin fila en Equipo) -- cuenta admin "pura" que no paga cuota: entra
      // directo a Ajustes (adminEntrar() -> irEditarDatos() -> s-datos, Tanda
      // 7 -- ver MANIFEST.md "Cambios recientes", elimina s-admin-home del
      // todo). Desde ahí ve la fila "Mi Liga" como cualquier otra cuenta
      // admin y entra manualmente cuando quiera -- ya no hay ningún
      // dashboard separado al que aterrizar de entrada. dashboardAdmin:false
      // -- cuenta admin que además paga cuota: sigue el flujo normal de
      // usuarix más abajo (home de reservas), conservando igual
      // _adminToken/_adminEmail ya guardados arriba para poder acceder a
      // "Mi Liga" desde Ajustes.
      if (res.dashboardAdmin !== false) {
        ocultarCargando();
        if (res.valido && res.datos) {
          _token = res.token || '';
          E.nombre = res.nombre;
          E.datos = res.datos;
          E.datosCompletos = res.datos;
          localStorage.setItem('session', JSON.stringify({ nombre: E.nombre, token: _token }));
        }
        adminEntrar();
        return;
      }
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
    var _fotoGoogleLogin = res.foto || '';
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
        _mostrarPermisosSiHaceFalta(_fotoGoogleLogin);
      }
    }, function() { prepararHome(); ir('s-home'); });
  }, function(e) {
    ocultarCargando();
    var errEl = document.getElementById('err-google-login');
    errEl.textContent = 'Error de conexión: ' + (e && e.message || 'intenta de nuevo');
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

      if (res.esAdmin) {
        _adminToken = res.adminToken;
        _adminEmail = res.email;
        _adminNombre = E.nombre;
        _dashboardAdminLimitado = (res.dashboardAdmin !== false);
        localStorage.setItem('adminSession', JSON.stringify({ adminToken: _adminToken, email: _adminEmail, nombre: _adminNombre, dashboardAdmin: _dashboardAdminLimitado, exp: Date.now() + 11.5 * 3600 * 1000 }));
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        OneSignalDeferred.push(function(OneSignal) { OneSignal.login('admin_' + _adminEmail).catch(function(){}); });
        if (res.dashboardAdmin !== false) {
          ocultarCargando();
          adminEntrar();
          return;
        }
      }

      mostrarCargando('Cargando tus reservas...');
      api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
        _todasReservas = reservas;
        prepararHome();
        ir('s-home');
      }, function(e2) { prepararHome(); ir('s-home'); mostrarToast(e2.message || 'Error al cargar reservas.', 'error'); });

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
  api({ action: 'cerrarSesion' }, function(){}, function(){});
  localStorage.removeItem('session');
  _token = '';
  E.nombre = ''; E.datos = null; E.datosCompletos = null; _todasReservas = []; E.reagendando = false;
  var sel = document.getElementById('sel-nombre'); if (sel) sel.value = '';
  // Flags de "ya inicializada esta sesión" (ver "Cambios recientes",
  // js/eventos.js/js/perfil.js -- regla general de restaurar posición al
  // volver por nav inferior): un logout no recarga la página, así que estas
  // vars de módulo no se resetean solas -- sin esto, un login siguiente
  // dentro de la misma pestaña arrastraría el estado de la sesión anterior
  // (saltearía el reset/salto a "hoy" de Eventos, restauraría un scroll de
  // otra cuenta en Ajustes).
  if (typeof _evYaInicializadoEnSesion !== 'undefined') _evYaInicializadoEnSesion = false;
  if (typeof _ajYaInicializadoEnSesion !== 'undefined') _ajYaInicializadoEnSesion = false;
  ir('s1');
}

function confirmarCerrarSesion() {
  ajCerrarSheetLogout();
  setTimeout(cerrarSesion, 350);
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
    // _cargandoFechasReserva (ver esa nota en cargarFechas(), js/reservas.js):
    // protege también la cadena completa previa a cargarFechas() en este
    // flujo (loginGoogle→getReservasPersona→...), que cargarFechas() por sí
    // sola no puede cubrir porque todavía no arrancó.
    window._cargandoFechasReserva = true;
    setTimeout(function() { window._cargandoFechasReserva = false; }, 15000);
    history.replaceState({}, '', location.pathname);
  }

  var _restaurando = false;

  // Prioridad de restauración (bug real corregido -- ver MANIFEST.md
  // "Cambios recientes" para el diagnóstico completo): 2 caminos de
  // restauración competían acá, y 'adminSession' corría siempre primero sin
  // importar si 'session' también existía -- para una cuenta admin con fila
  // propia en Equipo (dashboardAdmin:true, pero con datos reales de
  // usuarix), eso hacía que 'session'/restaurarSesion() ni se intentara: la
  // cuenta terminaba en Ajustes con E.datos vacío (nunca se pidió al
  // backend) y _dashboardAdminLimitado en su default `false` (nunca se
  // seteaba en el atajo de adminSession), mostrando la nav como si fuera
  // cuenta normal. Fix: 'session' (token regular) corre PRIMERO si existe,
  // sea cual sea el contenido de 'adminSession' -- es la única fuente que
  // trae E.datos real vía restaurarSesion() (backend), y de ahí sale
  // también res.dashboardAdmin con el mismo criterio que ya usa el login
  // fresco (loginGoogle()/validarPin()). 'adminSession' (cache local, sin
  // pedir nada al backend) pasa a ser solo el atajo para cuando NO hay
  // 'session' -- caso real: admin "pura" sin ninguna fila en Equipo, que
  // nunca recibió un token regular para empezar, así que no hay ningún otro
  // camino del que "priorizar". En ambos caminos, _dashboardAdminLimitado
  // queda seteada explícitamente antes de navegar -- nunca se deja en su
  // default `false` (`js/admin.js`).
  var session = localStorage.getItem('session');
  if (session) {
    try {
      var s = JSON.parse(session);
      if (s.token && s.nombre) {
        _restaurando = true;
        window._restaurandoSesion = true;
        _token = s.token; E.nombre = s.nombre;
        mostrarCargando('Restaurando tu sesión...');
        api({ action: 'restaurarSesion' }, function(res) {
          if (!res.valido || !res.datos) { window._restaurandoSesion = false; localStorage.removeItem('session'); _token = ''; E.nombre = ''; ocultarCargando(); ir('s1', true); return; }
          E.datos = res.datos; E.datosCompletos = res.datos;
          if (res.esAdmin) {
            _adminToken = res.adminToken;
            _adminEmail = res.email;
            _adminNombre = E.nombre;
            _dashboardAdminLimitado = (res.dashboardAdmin !== false);
            localStorage.setItem('adminSession', JSON.stringify({ adminToken: _adminToken, email: _adminEmail, nombre: _adminNombre, dashboardAdmin: _dashboardAdminLimitado, exp: Date.now() + 11.5 * 3600 * 1000 }));
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(function(OneSignal) { OneSignal.login('admin_' + _adminEmail).catch(function(){}); });
            if (res.dashboardAdmin !== false) {
              window._restaurandoSesion = false;
              ocultarCargando();
              adminEntrar();
              return;
            }
          }
          vincularPush(E.nombre);
          api({ action: 'getReservasPersona', nombre: E.nombre }, function(reservas) {
            _todasReservas = reservas;
            prepararHome();
            window._restaurandoSesion = false;
            if (window._pendingNuevx) {
              var _pnx = window._pendingNuevx; window._pendingNuevx = null;
              if (E.datos) { E.datos.necesitaPatines = _pnx.patines === 'si' ? 'Sí' : 'No'; E.datos.necesitaProtecciones = _pnx.protec ? _pnx.protec : 'No'; if (_pnx.talla) E.datos.talla = _pnx.talla; }
              setTimeout(function() { irNuevaReserva(true); }, 300);
            } else { ir('s-home'); _mostrarPermisosSiHaceFalta(); }
          }, function() { prepararHome(); ir('s-home'); window._restaurandoSesion = false; });
        }, function() { window._restaurandoSesion = false; localStorage.removeItem('session'); _token = ''; E.nombre = ''; ocultarCargando(); ir('s1', true); });
      } else { localStorage.removeItem('session'); }
    } catch (ex) { localStorage.removeItem('session'); }
  }

  var adminSession = localStorage.getItem('adminSession');
  if (!_restaurando && adminSession) {
    try {
      var ad = JSON.parse(adminSession);
      if (ad.adminToken && ad.email && Date.now() < (ad.exp || 0)) {
        _restaurando = true;
        _adminToken = ad.adminToken; _adminEmail = ad.email;
        _dashboardAdminLimitado = (ad.dashboardAdmin !== false);
        adminEntrar();
        ocultarCargando();
      } else { localStorage.removeItem('adminSession'); }
    } catch (ex) { localStorage.removeItem('adminSession'); }
  }

  if (!_restaurando) {
    if (_tokenNuevx) {
      window._loginAutoEnCurso = true;
      mostrarCargando('Iniciando tu sesión...');
      onGoogleCredentialUsuario({ credential: _tokenNuevx });
    } else {
      ocultarCargando();
      ir('s1', true);
    }
  }
  requestAnimationFrame(function() { requestAnimationFrame(iniciarGoogleSignInUsuario); });

  api({ action: 'getPreciosClases' }, function(precios) {
    E.precioPorClase = parseFloat(precios.precioPorClase) || 0;
    E.precioMensual  = parseFloat(precios.precioMensual)  || 0;
  }, function() {});

  // Color de énfasis guardado (Tanda 3): pedido una sola vez por carga de
  // página, para cualquier cuenta (no requiere sesión/adminToken — a
  // propósito, ver nota del backend en MANIFEST.md). Si la celda todavía
  // está vacía (primera vez) no hay nada que aplicar — color-enfasis.js ya
  // corrió aplicarColorEnfasis('#F97316') como fallback al cargar el script.
  api({ action: 'adminGetColorEnfasis' }, function(res) {
    if (res && res.colorEnfasis) aplicarColorEnfasis(res.colorEnfasis);
  }, function() {});

  generarMeses();
};

window.addEventListener('pageshow', function(e) {
  if (e.persisted) {
    document.querySelectorAll('.pantalla').forEach(function(p) { p.classList.remove('activa'); });
    var ov = document.getElementById('loading-overlay');
    ov.classList.remove('fade-out');
    ov.style.display = 'flex';
    // Tanda 7 (ver MANIFEST.md "Cambios recientes" — elimina s-admin-home):
    // una cuenta admin "pura" restaurada desde bfcache vuelve a 's-datos'
    // (Ajustes), no a ningún dashboard propio -- el DOM ya está poblado
    // (bfcache preserva el heap de JS entero), solo hace falta re-mostrar
    // la pantalla correcta, mismo criterio que las 2 ramas de abajo.
    if (_adminToken) { ir('s-datos', true, true); ocultarCargando(); }
    else if (E.datos) { prepararHome(); ir('s-home', true, true); }
    else { ir('s1', true, true); ocultarCargando(); }
  }
});
