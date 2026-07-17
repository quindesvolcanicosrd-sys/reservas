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
    // Solo local acá — todavía no hay cuenta creada (ver inscribirPersona()),
    // nada que persistir hasta el envío final del formulario.
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
   Máscara visual .crop-area (css/global.css): mismo truco de cápsula
   rotada que .avatar-pill, pero acá es puramente decorativa sobre la
   imagen — el recorte real lo hace Cropper.js con `aspectRatio: 216/300`
   (mismo 216:300 ≈ 0.72 que .avatar-pill--lg/--md/--sm). */
function abrirCropper(base64) {
  var img = document.getElementById('crop-image');
  var modal = document.getElementById('modal-crop');
  if (!img || !modal) return;
  img.src = base64;
  modal.style.display = 'flex';
  requestAnimationFrame(function() {
    if (_fotoCropper) { _fotoCropper.destroy(); _fotoCropper = null; }
    _fotoCropper = new Cropper(img, {
      aspectRatio: 216 / 300,
      viewMode: 0,
      dragMode: 'move',
      autoCropArea: 1
    });
  });
}
function cancelarCrop() {
  if (_fotoCropper) { _fotoCropper.destroy(); _fotoCropper = null; }
  var modal = document.getElementById('modal-crop');
  if (modal) modal.style.display = 'none';
}
function confirmarCrop() {
  if (!_fotoCropper) return;
  var canvas = _fotoCropper.getCroppedCanvas();
  var MAX_W = 360, MAX_H = 500; // mismo ratio 216:300, tope de tamaño de archivo
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
