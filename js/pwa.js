var _deferredPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); _deferredPrompt = e; });

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
  requestAnimationFrame(function() { m.style.opacity = '1'; });
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
  OneSignal.init({ appId: 'f434ccdc-bcca-40b6-bb64-16b662b8b0d9', serviceWorkerPath: 'sw.js' });
});
