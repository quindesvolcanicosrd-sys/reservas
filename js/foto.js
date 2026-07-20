/* ══ FOTO DE PERFIL — recorte + subida (Cropper.js) ═══════════════════
   Módulo compartido, cargado igual en index.html e inscripcion/index.html
   (ver MANIFEST). Funciona en ambos porque llama funciones que cada página
   define por su cuenta con el mismo nombre/firma — apiPost, mostrarCargando/
   ocultarCargando (js/ui.js vs inscripcion.js, mismo contrato) — y detecta en
   runtime cuáles existen (_registrarOverlayAbierto, _token, G, E) para elegir
   el camino correcto según el contexto. No asume que ambas páginas cargan
   los mismos scripts. */

var _fotoCropper = null;
var _fotoContexto = ''; // 'inscripcion' | 'ajustes'
var _fotoInputEl = null;

function _fotoToast(msg) {
  if (typeof mostrarToast === 'function') { mostrarToast(msg, 'error'); return; }
  alert(msg); // inscripcion/inscripcion.js no tiene mostrarToast — fallback simple
}

function _fotoGetInput() {
  if (_fotoInputEl) return _fotoInputEl;
  _fotoInputEl = document.createElement('input');
  _fotoInputEl.type = 'file';
  _fotoInputEl.accept = 'image/*';
  _fotoInputEl.style.display = 'none';
  _fotoInputEl.addEventListener('change', function() {
    var file = _fotoInputEl.files && _fotoInputEl.files[0];
    _fotoInputEl.value = ''; // permite re-elegir el mismo archivo dos veces seguidas
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) { abrirCropper(e.target.result); };
    reader.readAsDataURL(file);
  });
  document.body.appendChild(_fotoInputEl);
  return _fotoInputEl;
}

/* ── Bottom sheet de opciones (Usar foto de Google / Desde el dispositivo /
   Quitar foto) ──────────────────────────────────────────────────────────
   Sin `abrirBottomSheet()`/`cerrarBottomSheet()` genérico en el proyecto
   (ver MANIFEST) — cada sheet arma su propio par abrir/cerrar. Acá además
   hay que soportar 2 mecanismos de cierre-por-history distintos según la
   página: la app principal integra con `_overlayStack`/`_registrarOverlayAbierto`
   (js/ui.js, back del navegador cierra el sheet); inscripción no tiene ese
   mecanismo (su propio `popstate`, inscripcion.js, solo navega entre pasos)
   y sus sheets (`_inscAbrirSheet`/`_inscCerrarSheet`) cierran directo, sin
   pushState. Se detecta `_registrarOverlayAbierto` en runtime para elegir. */
function abrirSheetFotoPerfil(contexto) {
  _fotoContexto = contexto;
  var fotoGoogle = contexto === 'inscripcion'
    ? (typeof G !== 'undefined' && G ? G.fotoGoogle : '')
    : (typeof _fotoGoogleUrl !== 'undefined' ? _fotoGoogleUrl : '');
  var optGoogle = document.getElementById('sfp-opt-google');
  var optQuitar = document.getElementById('sfp-opt-quitar');
  if (optGoogle) optGoogle.style.display = fotoGoogle ? 'flex' : 'none';
  if (optQuitar) optQuitar.style.display = contexto === 'ajustes' ? 'flex' : 'none';
  var overlay = document.getElementById('sheet-foto-perfil-overlay');
  var sheet = document.getElementById('sheet-foto-perfil');
  if (!overlay || !sheet) return;
  overlay.style.display = 'block';
  sheet.style.display = 'block';
  requestAnimationFrame(function() { requestAnimationFrame(function() { sheet.style.transform = 'translateY(0)'; }); });
  if (typeof _registrarOverlayAbierto === 'function') _registrarOverlayAbierto(cerrarSheetFotoPerfil);
}
function cerrarSheetFotoPerfil(porGesto) {
  if (typeof _registrarOverlayAbierto === 'function' && !porGesto) { history.back(); return; }
  var overlay = document.getElementById('sheet-foto-perfil-overlay');
  var sheet = document.getElementById('sheet-foto-perfil');
  if (!sheet || !overlay) return;
  sheet.style.transform = 'translateY(100%)';
  setTimeout(function() { sheet.style.display = 'none'; overlay.style.display = 'none'; }, 350);
}
function sfpUsarGoogle() {
  cerrarSheetFotoPerfil();
  if (_fotoContexto === 'inscripcion') {
    // Sin caller real hoy — el sheet de inscripción ya no tiene el botón
    // "Usar foto de Google" (ver MANIFEST, "Cambios recientes": la foto de
    // Google se precarga sola al login, ya no hace falta elegirla a mano).
    // Rama dejada sin quitar por si se revierte; sigue siendo correcta.
    _fotoAplicarResultado(G.fotoGoogle || '', 'google');
    return;
  }
  // Ajustes: persiste en el backend con la misma acción que ya usa
  // guardarPermisos() (actualizarPerfilGoogle) — solo `foto`, el resto de
  // los parámetros se dejan sin mandar para que el backend no toque fecha
  // de nacimiento ni permisos.
  var url = _fotoGoogleUrl || '';
  mostrarCargando('Actualizando foto...');
  api({ action: 'actualizarPerfilGoogle', foto: url }, function(res) {
    ocultarCargando();
    if (res && res.exito) {
      _fotoAplicarResultado(url, 'google');
    } else {
      _fotoToast((res && res.error) || 'No se pudo actualizar la foto.');
    }
  }, function(e) {
    ocultarCargando();
    _fotoToast('Error de conexión: ' + (e && e.message || 'intenta de nuevo'));
  });
}
function sfpDesdeDispositivo() {
  cerrarSheetFotoPerfil();
  _fotoGetInput().click();
}
function sfpQuitarFoto() {
  cerrarSheetFotoPerfil();
  _subirFotoRecortada('');
}

/* ── Cropper ──────────────────────────────────────────────────────────
   Máscara visual .crop-area (css/global.css): círculo decorativo sobre la
   imagen — el recorte real lo hace el crop box REAL (invisible) de
   Cropper.js, con `aspectRatio: 1`. Cropper no soporta un crop box
   circular nativo, por eso el círculo es un div aparte con su propio
   `border-radius:50%`.

   BUG REAL encontrado (foto recortada no correspondía a lo que se veía
   seleccionado en el círculo): `.crop-area` se posicionaba con
   porcentajes fijos de `#crop-viewport` completo (`top:50%;left:50%;
   width:60%`), asumiendo que la imagen renderizada llena ese contenedor.
   Pero el crop box real de Cropper.js (`getCropBoxData()`) se calcula a
   partir de `autoCropArea`/`viewMode` sobre el CANVAS de la imagen
   renderizada — que casi nunca llena `#crop-viewport` (una foto de
   celular es angosta y alta, `#crop-viewport` es todo el alto disponible
   del modal). Con `cropBoxResizable:false` no hay ningún feedback visual
   de la librería que delate el desfasaje: eran dos rectángulos calculados
   por sistemas totalmente independientes, coincidiendo solo por
   casualidad cuando la imagen es cuadrada. Confirmado con una imagen de
   prueba con cuadrantes de color: el círculo decorativo quedaba centrado
   en `#crop-viewport` (ej. 234×234px en `top:302,left:78` en un viewport
   de 390×844) mientras el crop box real medía 390×390px en `top:224,
   left:0` — un desfasaje de >100px verificado con Playwright, no
   cosmético. Se descartaron las 3 causas típicas de este bug en
   Cropper.js antes de llegar a esta (confirmado con Playwright, abriendo/
   cerrando el modal 3 veces seguidas sin recargar la página):
   instancia vieja sin destruir (`abrirCropper()`/`cancelarCrop()` ya
   llamaban `.destroy()` correctamente, un solo `.cropper-container` en el
   DOM en las 3 vueltas), Cropper inicializado antes de que la imagen
   termine de cargar (`initCropper` ya esperaba `img.onload`/
   `img.complete`, geometría idéntica en las 3 vueltas — no hay carrera) y
   aspectRatio desactualizado en otro lugar del código (hay un solo
   `new Cropper(...)` en todo el proyecto, sin duplicados).

   Fix: `.crop-area` deja de ser puro CSS — `_fotoSincronizarMascara()`
   lee `getCropBoxData()` (el rectángulo real que va a usar
   `getCroppedCanvas()`) apenas el Cropper está listo (`ready`) y posiciona/
   dimensiona el círculo en px exactos sobre ese rectángulo, convertido a
   coordenadas de `#crop-viewport` vía `getBoundingClientRect()` de
   `.cropper-container` (que Cropper.js inserta ocupando todo
   `#crop-viewport`). Con `cropBoxResizable:false` y `dragMode:'move'` el
   crop box no se mueve ni cambia de tamaño después de creado (solo la
   imagen se arrastra por debajo, confirmado por `getCropBoxData()`
   idéntico en las 3 vueltas de la prueba) — un solo sync en `ready`
   alcanza para el caso normal. Único caso donde el crop box real SÍ puede
   recalcularse solo, sin acción del usuario, es un resize de ventana
   (`responsive:true`, default de Cropper.js) — ahí si no se vuelve a
   sincronizar el círculo queda desactualizado igual que antes; se
   re-sincroniza con un listener de `resize` (debounced 120ms para dejar
   que el resize interno de Cropper.js termine primero), agregado/quitado
   junto con el modal. Las reglas CSS de `.crop-area` (`css/global.css`)
   quedan como fallback/estado inicial nada más — el sync en JS las pisa
   con estilos inline apenas el crop box real existe. */

function _fotoSincronizarMascara() {
  var mask = document.getElementById('crop-area');
  var viewport = document.getElementById('crop-viewport');
  if (!mask || !viewport || !_fotoCropper) return;
  var box = _fotoCropper.getCropBoxData();
  var vpRect = viewport.getBoundingClientRect();
  var containerEl = viewport.querySelector('.cropper-container');
  var containerRect = containerEl ? containerEl.getBoundingClientRect() : vpRect;
  var offsetLeft = containerRect.left - vpRect.left;
  var offsetTop = containerRect.top - vpRect.top;
  mask.style.maxHeight = 'none';
  mask.style.width = box.width + 'px';
  mask.style.height = box.height + 'px';
  mask.style.left = (offsetLeft + box.left + box.width / 2) + 'px';
  mask.style.top = (offsetTop + box.top + box.height / 2) + 'px';
}
var _fotoResizeTimer = null;
function _fotoSincronizarMascaraDiferida() {
  clearTimeout(_fotoResizeTimer);
  _fotoResizeTimer = setTimeout(_fotoSincronizarMascara, 120);
}

function abrirCropper(base64) {
  var img = document.getElementById('crop-image');
  var modal = document.getElementById('modal-crop');
  if (!img || !modal) return;
  if (_fotoCropper) { _fotoCropper.destroy(); _fotoCropper = null; }
  modal.style.display = 'flex';
  requestAnimationFrame(function() { requestAnimationFrame(function() { modal.style.opacity = '1'; }); });
  function initCropper() {
    _fotoCropper = new Cropper(img, {
      aspectRatio: 1,
      viewMode: 0,
      dragMode: 'move',
      autoCropArea: 1,
      guides: false,
      center: false,
      highlight: false,
      background: false,
      modal: false,
      cropBoxResizable: false,
      // cropBoxMovable:false — BUG REAL corregido (recorte final no correspondía
      // a la selección visual, ver MANIFEST "Cambios recientes"): sin esto, el
      // crop box quedaba con el default de la librería (movable=true) y un
      // drag del usuario (pensado para mover la FOTO bajo el visor fijo, la UX
      // que comunica .crop-area) en realidad movía el crop box invisible —
      // la máscara decorativa nunca se re-sincroniza fuera de `ready`, así que
      // no había ningún indicio visual de que el crop box real se había ido a
      // otra parte de la imagen. Reproducido y confirmado con Playwright
      // (marcador de color en posición conocida + drag real + comparación
      // pixel a pixel del resultado) antes de aplicar este fix.
      cropBoxMovable: false,
      ready: _fotoSincronizarMascara
    });
    window.addEventListener('resize', _fotoSincronizarMascaraDiferida);
  }
  // Espera a que la imagen NUEVA termine de cargar antes de crear el
  // Cropper — crearlo sobre un <img> todavía cargando (o mostrando el
  // frame anterior) le hace agarrar dimensiones erróneas/momentáneas y
  // reajustar solo cuando el load real llega, visto como un parpadeo.
  // Mismo patrón que usa Pivot.
  img.onload = null;
  img.src = base64;
  if (img.complete && img.naturalWidth) {
    initCropper();
  } else {
    img.onload = initCropper;
  }
}
function cancelarCrop() {
  window.removeEventListener('resize', _fotoSincronizarMascaraDiferida);
  clearTimeout(_fotoResizeTimer);
  if (_fotoCropper) { _fotoCropper.destroy(); _fotoCropper = null; }
  var modal = document.getElementById('modal-crop');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(function() { modal.style.display = 'none'; }, 300);
  }
  var mask = document.getElementById('crop-area');
  if (mask) { mask.style.left = ''; mask.style.top = ''; mask.style.width = ''; mask.style.height = ''; mask.style.maxHeight = ''; }
}
function confirmarCrop() {
  if (!_fotoCropper) return;
  var canvas = _fotoCropper.getCroppedCanvas();
  var MAX_W = 500, MAX_H = 360; // mismo ratio 300:216, tope de tamaño de archivo
  var ratio = Math.min(MAX_W / canvas.width, MAX_H / canvas.height, 1);
  var outW = Math.round(canvas.width * ratio);
  var outH = Math.round(canvas.height * ratio);
  var out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  out.getContext('2d').drawImage(canvas, 0, 0, outW, outH);
  var base64 = out.toDataURL('image/jpeg', 0.8);
  cancelarCrop();
  _subirFotoRecortada(base64);
}

/* ── Subida al backend ────────────────────────────────────────────────
   Dos acciones distintas según contexto (backend Apps Script, fuera de
   este repo, no se toca desde acá) — ambas POST (el base64 es muy largo
   para una URL de GET) y devuelven { exito:true, url } o { exito:false,
   error }:
   - ajustes: `subirFotoPerfil`, params `token` (sesión real, `_token`,
     js/api.js) + `base64Data` (data URL o '' para quitar foto).
   - inscripción: `subirFotoInscripcion`, params `idToken` (JWT de Google,
     `G.idToken`) + `email` (`G.email`) + `base64Data` — todavía no existe
     cuenta/sesión en ese punto del flujo (se crea recién al final,
     `inscribirPersona()`), así que la credencial es el idToken + el email
     ya verificado en el paso 1 (`verificarGoogle`), no un token de sesión. */
function _subirFotoRecortada(base64) {
  mostrarCargando(base64 ? 'Subiendo foto...' : 'Quitando foto...');
  var params = _fotoContexto === 'inscripcion'
    ? { action: 'subirFotoInscripcion', idToken: G.idToken, email: G.email, base64Data: base64 }
    : { action: 'subirFotoPerfil', token: (typeof _token !== 'undefined' ? _token : ''), base64Data: base64 };
  apiPost(params, function(res) {
    ocultarCargando();
    if (res && res.exito) {
      _fotoAplicarResultado(res.url || '', 'subida');
    } else {
      _fotoToast((res && res.error) || 'No se pudo actualizar la foto.');
    }
  }, function(e) {
    ocultarCargando();
    _fotoToast('Error de conexión: ' + (e && e.message || 'intenta de nuevo'));
  });
}

/* ── Reflejar el resultado en el avatar + estado local ───────────────── */
function _fotoAplicarResultado(url, origen) {
  if (_fotoContexto === 'inscripcion') {
    G.foto = url;
    if (typeof _inscActualizarAvatar === 'function') _inscActualizarAvatar(url);
    var origenEl = document.getElementById('insc-foto-origen');
    if (origenEl) origenEl.textContent = url ? (origen === 'google' ? 'Foto de Google' : 'Foto personalizada') : 'Sin foto de perfil';
  } else {
    if (typeof E !== 'undefined' && E.datos) E.datos.fotoPerfil = url;
    if (typeof irEditarDatos === 'function') irEditarDatos();
    if (typeof _ajCargarSub === 'function' && document.getElementById('aj-avatar-hero')) _ajCargarSub('aj-sub-perfil');
  }
}
