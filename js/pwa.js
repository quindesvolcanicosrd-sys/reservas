var _deferredPrompt = null;
// Setead por `_pwaInstalarDirecto()` cuando la persona acepta el prompt
// nativo -- evita que el timeout de "ya instalada" de `_verificarPwa()` pise
// el mensaje de "recién instalada" si vence DESPUÉS de ese accept.
var _pwaInstaladoAhora = false;
window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); _deferredPrompt = e; });
// Segundo listener (no reemplaza al de arriba -- corre DESPUÉS, mismo evento,
// mismo orden de registro) -- refresca los botones del gate bloqueante si
// `beforeinstallprompt` llega DESPUÉS de que `_verificarPwa()` ya lo mostró
// (caso real: el navegador puede tardar unos segundos en decidir que la PWA
// es instalable). Reusa `_deferredPrompt` -- ya capturado arriba por
// `pwaInstalar()`/el banner descartable existente -- en vez de una 2da
// variable propia, para no mantener 2 fuentes del mismo dato.
window.addEventListener('beforeinstallprompt', function() { _pwaActualizarBotonesGate(); });

// Navegador compatible con instalar como PWA -- Android exige Chrome real
// (no Edge/Opera/Samsung Internet, cada uno con su propio flujo de
// instalación distinto al de Chrome, o directamente sin soporte), iOS exige
// Safari real (no Chrome/Firefox/Opera para iOS -- son WebKit por mandato de
// Apple pero NINGUNO expone "Agregar a pantalla de inicio" salvo Safari, ni
// siquiera Mercury/otros navegadores WebKit de terceros). Cualquier otro
// navegador (desktop, o ninguno de los de arriba) se considera compatible
// por default -- esta función solo se consulta desde dentro de
// `_verificarPwa()`, ya acotada a Android/iOS antes de llamarla.
function _pwaBrowserCompatible() {
  var ua = navigator.userAgent.toLowerCase();
  var esAndroidUa = /android/.test(ua);
  var esIosUa = /iphone|ipad|ipod/.test(ua);
  if (esAndroidUa) return /chrome/.test(ua) && !/edg|opr|samsung/.test(ua);
  if (esIosUa) return /safari/.test(ua) && !/crios|fxios|opios|mercury/.test(ua);
  return true;
}

// ── Enforcement de instalación PWA en Android + iOS ────────────────────────
// A diferencia de mostrarBannerPWA() (arriba en este archivo -- descartable,
// localStorage.pwa_dismiss), esto BLOQUEA la pantalla entera sin forma de
// cerrarla mientras la condición sea cierta -- Android o iPhone/iPad/iPod
// reales, fuera de modo standalone. Desktop no se toca, a propósito (pedido
// original: "enforcement de PWA en Android", extendido después a iOS -- el
// mismo motivo real de fondo, recibir push notifications, aplica en los 2).
// Llamada PRIMERO que cualquier otra cosa en window.onload (js/auth.js) --
// si bloquea, el resto del boot (login, restaurar sesión) sigue corriendo
// igual en segundo plano (no hay ningún `return` que lo frene ahí), pero la
// persona no puede ver ni operar nada detrás del gate. `esStandalone()`
// (más abajo en este archivo) ya cubre `display-mode:standalone` (Android/
// Chrome) Y `navigator.standalone===true` (iOS/Safari) -- una sola función
// para las 2 plataformas, sin reimplementar el chequeo acá.
function _verificarPwa() {
  var esAndroid = /android/i.test(navigator.userAgent);
  var esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if ((!esAndroid && !esIos) || esStandalone()) return false;

  var gate = document.getElementById('pwa-gate');
  if (gate) gate.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  var secAndroid = document.getElementById('pwa-instrucciones-android');
  var secIos = document.getElementById('pwa-instrucciones-ios');
  var secBrowser = document.getElementById('pwa-instrucciones-browser');
  var secYaInstalada = document.getElementById('pwa-ya-instalada');
  if (secYaInstalada) secYaInstalada.style.display = 'none';

  // Navegador sin soporte real de instalación (ej. in-app browser de
  // Instagram/Facebook, Firefox en Android) -- ni el botón directo ni los
  // pasos manuales de Chrome/Safari sirven ahí (esos menús no existen en
  // ese navegador): mensaje aparte con "Copiar enlace" para abrir la URL en
  // un navegador real, en vez de instrucciones que la persona no va a poder
  // seguir.
  if (!_pwaBrowserCompatible()) {
    if (secAndroid) secAndroid.style.display = 'none';
    if (secIos) secIos.style.display = 'none';
    if (secBrowser) {
      secBrowser.style.display = '';
      var txtBrowser = document.getElementById('pwa-browser-texto');
      if (txtBrowser) txtBrowser.textContent = esIos ? 'Para instalar Pivot abre esta página en Safari.' : 'Para instalar Pivot abre esta página en Chrome.';
      var iconBrowser = document.getElementById('pwa-browser-icono');
      if (iconBrowser) iconBrowser.textContent = esIos ? 'safari' : 'open_in_browser';
    }
    return true;
  }

  if (secBrowser) secBrowser.style.display = 'none';
  if (secAndroid) secAndroid.style.display = esAndroid ? '' : 'none';
  if (secIos) secIos.style.display = esIos ? '' : 'none';
  // Botón de instalación directa vs. pasos manuales -- solo aplica del lado
  // Android (`beforeinstallprompt` no existe en Safari/iOS, esa sección
  // siempre son los 3 pasos manuales, sin alternativa).
  if (esAndroid) {
    _pwaActualizarBotonesGate();
    // Detección de "ya instalada" -- SOLO del lado Android: `beforeinstallprompt`
    // no se dispara si el navegador ya considera la PWA instalada (entre
    // otras razones reales) -- 2.5s le da tiempo de sobra al navegador para
    // decidir (normalmente dispara casi al instante) antes de asumir que no
    // va a llegar. A propósito NO se aplica del lado iOS -- Safari JAMÁS
    // dispara este evento, esté instalada o no, así que su ausencia ahí no
    // significa nada (los pasos manuales de iOS ya cubren ambos casos).
    // `_pwaInstaladoAhora` (más abajo, seteado por `_pwaInstalarDirecto()`)
    // evita pisar el mensaje de "recién instalada" si esta espera vence
    // DESPUÉS de que la persona ya instaló por el botón directo.
    if (!_deferredPrompt) {
      setTimeout(function() {
        if (!_deferredPrompt && !_pwaInstaladoAhora) _pwaMostrarYaInstalada();
      }, 2500);
    }
  }
  return true;
}

// Reemplaza el contenido del gate por el mensaje de "ya instalada" -- 2
// call sites (el timeout de `_verificarPwa()`, sin argumentos = mensaje
// default; `_pwaInstalarDirecto()` tras un prompt aceptado, con texto
// propio de "recién instalada") comparten esta función en vez de duplicar
// la manipulación del DOM.
function _pwaMostrarYaInstalada(textoPrincipal, textoSub) {
  var secAndroid = document.getElementById('pwa-instrucciones-android');
  var secIos = document.getElementById('pwa-instrucciones-ios');
  var secYaInstalada = document.getElementById('pwa-ya-instalada');
  if (secAndroid) secAndroid.style.display = 'none';
  if (secIos) secIos.style.display = 'none';
  if (!secYaInstalada) return;
  secYaInstalada.style.display = '';
  var txt = secYaInstalada.querySelector('.pwa-gate-ya-inst-texto');
  var sub = secYaInstalada.querySelector('.pwa-gate-ya-inst-sub');
  if (txt) txt.textContent = textoPrincipal || 'La app ya está instalada en tu dispositivo.';
  if (sub) sub.textContent = textoSub || 'Cierra esta ventana y abre Pivot desde tu pantalla de inicio.';
}

// Alterna entre el botón de instalación directa y los pasos manuales dentro
// de #pwa-gate según si el navegador ya entregó `beforeinstallprompt`
// (`_deferredPrompt`, capturado arriba) -- Chrome/Android real lo dispara
// casi siempre; los pasos manuales quedan como fallback real para cuando no
// llega (navegador sin soporte, ya descartado antes en esta sesión, etc.).
function _pwaActualizarBotonesGate() {
  var btnInstalar = document.getElementById('pwa-install-btn');
  var pasosManuales = document.getElementById('pwa-pasos-manuales');
  if (!btnInstalar || !pasosManuales) return;
  if (_deferredPrompt) {
    btnInstalar.style.display = 'flex';
    pasosManuales.style.display = 'none';
  } else {
    btnInstalar.style.display = 'none';
    pasosManuales.style.display = 'flex';
  }
}

// Dispara el prompt NATIVO de instalación (mismo `_deferredPrompt` que ya
// usa `pwaInstalar()`, más abajo en este archivo) -- distinto de esa función
// en que esta es SOLO el camino directo (sin fallback a `mostrarModalNavegador()`/
// instrucciones del banner viejo, que no aplican dentro de este gate). Ya NO
// cierra el gate al aceptar (re-ajuste, pedido explícito) -- el navegador
// tarda unos segundos en terminar de instalar/pasar a `display-mode:standalone`
// DESPUÉS del accept, así que cerrar de inmediato dejaba a la persona de
// vuelta en la app sin la PWA todavía lista -- ahora muestra la confirmación
// "ya instalada" (`_pwaMostrarYaInstalada()`, arriba) y la deja cerrar ella
// misma la pestaña/ventana para abrir la app real desde el ícono nuevo.
function _pwaInstalarDirecto() {
  if (!_deferredPrompt) return;
  _deferredPrompt.prompt();
  _deferredPrompt.userChoice.then(function(result) {
    _deferredPrompt = null;
    if (result.outcome === 'accepted') {
      _pwaInstaladoAhora = true;
      _pwaMostrarYaInstalada('¡Listo! La app quedó instalada.', 'Cierra esta ventana y abre Pivot desde tu pantalla de inicio para continuar.');
    }
  });
}

// ── Modal obligatoria de notificaciones dentro de la PWA instalada ────────
// Solo aplica ya INSTALADA como PWA (esStandalone()) -- dentro del navegador
// normal ya existe el banner descartable (#notif-banner/mostrarBannerPWA()),
// pedir el permiso de forma obligatoria ahí sería redundante con ese banner
// y con el propio prompt nativo del navegador. Idempotente: puede llamarse
// más de una vez por sesión (login fresco Y restauración de sesión) sin
// duplicar nada -- si el permiso ya está concedido, no hace nada.
function _verificarNotificaciones() {
  if (!esStandalone()) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  var gate = document.getElementById('notif-gate');
  if (!gate) return;
  gate.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  var denegado = document.getElementById('notif-gate-denegado');
  var btn = gate.querySelector('.notif-gate-btn');
  if (Notification.permission === 'denied') {
    if (denegado) denegado.style.display = 'block';
    if (btn) btn.style.display = 'none';
  } else {
    if (denegado) denegado.style.display = 'none';
    if (btn) btn.style.display = 'block';
  }
}

function _cerrarNotifGate() {
  var gate = document.getElementById('notif-gate');
  if (gate) { gate.style.display = 'none'; document.body.style.overflow = ''; }
}

function _activarNotificaciones() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(function(OneSignal) {
    OneSignal.Notifications.requestPermission().then(function(granted) {
      if (granted) {
        OneSignal.User.PushSubscription.optIn().catch(function(){});
        _cerrarNotifGate();
        return;
      }
      var denegado = document.getElementById('notif-gate-denegado');
      var btn = document.querySelector('#notif-gate .notif-gate-btn');
      if (denegado) denegado.style.display = 'block';
      if (btn) btn.style.display = 'none';
    }).catch(function() {
      // El propio navegador (no OneSignal) es el que puede rechazar/fallar
      // el prompt -- mismo tratamiento que un "denied" real: instrucciones
      // manuales en vez de dejar el botón colgado sin feedback.
      var denegado = document.getElementById('notif-gate-denegado');
      var btn = document.querySelector('#notif-gate .notif-gate-btn');
      if (denegado) denegado.style.display = 'block';
      if (btn) btn.style.display = 'none';
    });
  });
}

// Intenta llevar a la persona directo a los ajustes de notificaciones del
// sitio -- Android/Chrome soporta un intent especial para eso; iOS no tiene
// forma de abrir un ajuste específico desde la web (limitación real de
// Safari/WebKit, no de esta app), así que ahí se queda en instrucciones de
// texto. En Android, el intent puede no dispararse en cada combinación de
// versión/OEM de Chrome (no hay forma de detectarlo desde JS) -- el
// fallback de copiar la URL corre SIEMPRE de todos modos (no solo si el
// intent falla), para que la persona tenga la referencia igual así el
// intent sí haya abierto la pantalla correcta.
function _notifAbrirAjustesChrome() {
  var esAndroid = /android/i.test(navigator.userAgent);
  if (!esAndroid) {
    mostrarToast('Ve a Configuración → Safari → Notificaciones para activarlas.');
    return;
  }
  var intentUrl = 'intent://settings/content/siteDetails#Intent;scheme=android-app;package=com.android.chrome;end';
  var a = document.createElement('a');
  a.href = intentUrl;
  try { a.click(); } catch(e) {}
  setTimeout(function() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(location.origin).then(function() {
        mostrarToast('URL copiada. Búscala en Ajustes de Chrome → Notificaciones.');
      }).catch(function() {});
    }
  }, 500);
}

function esStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function detectarNavegador() {
  var ua = navigator.userAgent;
  var esIOS = /iPhone|iPad|iPod/.test(ua);
  if (esIOS) return 'ios';
  if (/Edg\//.test(ua)) return 'chromium';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  if (/Chrome|CriOS/.test(ua)) return 'chromium';
  if (/Safari/.test(ua)) return 'ios';
  return 'otro';
}

function mostrarBannerPWA() {
  if (esStandalone()) return;
  if (!/iPhone|iPad|iPod|Android/.test(navigator.userAgent)) return;
  if (localStorage.getItem('pwa_dismiss') === '1') return;
  document.getElementById('pwa-banner').style.display = 'block';
}

function navegadorRecomendado() {
  var ua = navigator.userAgent;
  var esIOS = /iPhone|iPad|iPod/.test(ua);
  var esAndroid = /Android/.test(ua);
  if (esIOS) {
    var esSafariReal = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (!esSafariReal) { mostrarModalNavegador('ios-safari'); return false; }
  }
  if (esAndroid) {
    var esChromeAndroid = /Chrome\//.test(ua) && !/EdgA|OPR\/|SamsungBrowser/.test(ua);
    if (!esChromeAndroid) { mostrarModalNavegador('android-chrome'); return false; }
  }
  return true;
}

function mostrarModalNavegador(tipo) {
  var m = document.getElementById('modal-navegador');
  var icon = document.getElementById('modal-nav-icon');
  var titulo = document.getElementById('modal-nav-titulo');
  var texto = document.getElementById('modal-nav-texto');
  icon.textContent = tipo === 'android-chrome' ? '🌐' : tipo === 'ios-instalar' ? '📲' : '📱';
  titulo.textContent = tipo === 'android-chrome' ? 'Usa Chrome en Android' :
                       tipo === 'ios-instalar'   ? 'Instala la app primero' :
                                                   'Usa Safari en iPhone/iPad';
  if (tipo === 'android-chrome') {
    texto.innerHTML = 'En Android el portal funciona con <strong>Google Chrome</strong>.<br><br>' +
      '1️⃣ Copia la dirección de abajo<br>' +
      '2️⃣ Ábrela en <strong>Chrome</strong><br>' +
      '3️⃣ Inicia sesión con tu PIN<br>' +
      '4️⃣ Toca <em>"Instalar app"</em> y sigue los pasos';
  } else if (tipo === 'ios-safari') {
    texto.innerHTML = 'En iPhone/iPad el portal funciona con <strong>Safari</strong>.<br><br>' +
      '1️⃣ Copia la dirección de abajo<br>' +
      '2️⃣ Ábrela en <strong>Safari</strong><br>' +
      '3️⃣ Inicia sesión con tu PIN<br>' +
      '4️⃣ Toca <em>"Instalar app"</em> y sigue los pasos';
  } else {
    texto.innerHTML = 'En iPhone/iPad necesitas instalar la app para recibir notificaciones:<br><br>' +
      '1️⃣ Toca el botón <strong>Compartir</strong> de Safari<br>' +
      '2️⃣ Elige <strong>"Agregar a pantalla de inicio"</strong><br>' +
      '3️⃣ Abre la app instalada y activa las notificaciones';
  }
  m.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() { m.style.opacity = '1'; }); });
  _registrarOverlayAbierto(cerrarModalNavegador);
}

function cerrarModalNavegador(porGesto) {
  if (!porGesto) { history.back(); return; }
  var m = document.getElementById('modal-navegador');
  m.style.opacity = '0';
  setTimeout(function() { m.style.display = 'none'; }, 300);
}

function pwaInstalar() {
  if (!navegadorRecomendado()) return;
  if (_deferredPrompt) {
    _deferredPrompt.prompt();
    _deferredPrompt.userChoice.then(function() { pwaCerrar(); });
    return;
  }
  var nav = detectarNavegador();
  if (nav === 'ios') {
    mostrarModalNavegador('ios-instalar');
    return;
  }
  var banner = document.getElementById('pwa-banner');
  var box = document.getElementById('pwa-instrucciones');
  var btnInstalar = document.getElementById('pwa-btn-instalar');
  var html = nav === 'chromium'
    ? '<strong>En Chrome:</strong><br>• Móvil: menú <strong>⋮</strong> → <strong>"Agregar a la pantalla principal"</strong>.<br>• Escritorio: icono <span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;">install_desktop</span> en la barra de direcciones.'
    : '⚠️ Usa <strong>Chrome</strong> (Android) o <strong>Safari</strong> (iPhone/iPad) para instalar la app.';
  if (box) { box.innerHTML = html; box.style.display = 'block'; }
  if (btnInstalar) btnInstalar.style.display = 'none';
  if (banner) banner.style.display = 'block';
}

function pwaCerrar() {
  localStorage.setItem('pwa_dismiss', '1');
  document.getElementById('pwa-banner').style.display = 'none';
}

function _ajSetToggleOn(cb, on) {
  cb.classList.toggle('toggle-on', on);
  cb.classList.toggle('toggle-off', !on);
  cb.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function toggleNotifHome(cb) {
  if (cb.classList.contains('toggle-on')) { mostrarToast('Para desactivar, ve a ajustes del navegador.', 'error'); return; }
  _ajSetToggleOn(cb, true);
  activarPush();
  setTimeout(function() {
    if ('Notification' in window && Notification.permission === 'granted') {
      var row = document.getElementById('row-notif-home');
      if (row) {
        var t = row.querySelector('.hmr-titulo');
        var s = row.querySelector('.hmr-sub');
        if (t) t.textContent = 'Notificaciones activadas';
        if (s) s.textContent = 'No te perderás de ninguna notificación ✅';
        setTimeout(function() {
          row.style.transition = 'opacity 0.6s ease';
          row.style.opacity = '0';
          setTimeout(function() { row.style.display = 'none'; }, 650);
        }, 1800);
      }
    } else if (Notification.permission === 'denied') { _ajSetToggleOn(cb, false); }
  }, 1500);
}

function activarPush() {
  if (!navegadorRecomendado()) return;
  var ua = navigator.userAgent;
  var esIOS = /iPhone|iPad|iPod/.test(ua);
  if (esIOS && !esStandalone()) { mostrarModalNavegador('ios-instalar'); return; }
  if (!('Notification' in window)) {
    mostrarToast('Tu navegador no soporta notificaciones. Usa Chrome, Edge o Firefox en Android/desktop.', 'error');
    return;
  }
  if (Notification.permission === 'denied') {
    mostrarToast('Las notificaciones están bloqueadas. Ve a Configuración del navegador → Notificaciones y permite este sitio.', 'error');
    return;
  }
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    try {
      var granted = await OneSignal.Notifications.requestPermission();
      if (granted) {
        await OneSignal.User.PushSubscription.optIn().catch(function(){});
        document.getElementById('notif-banner').style.display = 'none';
        localStorage.setItem('notif_dismiss', '1');
      }
    } catch(e) { console.log('OS activar:', e); }
  });
}

function vincularPush(nombre) {
  if (!window.OneSignalDeferred) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.login(nombre);
      var perm = (typeof Notification !== 'undefined') ? Notification.permission : 'default';
      if (perm === 'granted') {
        await OneSignal.User.PushSubscription.optIn().catch(function(){});
        var b = document.getElementById('notif-banner');
        if (b) b.style.display = 'none';
      }
    } catch(e) { console.warn('OneSignal vincularPush:', e.message); }
  });
}

window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(function(OneSignal) {
  OneSignal.init({ appId: 'f434ccdc-bcca-40b6-bb64-16b662b8b0d9' });
});
