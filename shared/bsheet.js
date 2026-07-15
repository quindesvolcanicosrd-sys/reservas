/* Zona de cierre por tap/drag de bottom sheets: manija (.bsheet-handle) +
   título (.bsheet-title) — todo el bloque superior, un solo selector
   compartido por ambos listeners (click y touchstart) para no duplicar el
   criterio. Ningún .bsheet-title de la app trae elementos interactivos
   propios (botones/inputs son siempre hermanos posteriores, ver grep sobre
   index.html), así que sumarlo entero no roba clicks a nada real. Un solo
   listener delegado por gesto, sin duplicar lógica de cierre por instancia.
   Cada .bsheet-overlay ya trae su propio onclick="cerrarX()" (patrón
   porGesto/history.back(), ver MANIFEST "Cierre de overlays vía historial")
   — acá solo se le encuentra el overlay correspondiente al sheet que
   contiene el punto tocado y se dispara ese click ya existente, para
   overlays anidados incluidos (cierra siempre el de más arriba: el punto de
   partida pertenece a un .bsheet puntual, no hay ambigüedad de cuál cerrar). */
var _BS_ZONA_CIERRE = '.bsheet-handle, .bsheet-title';

document.addEventListener('click', function(ev) {
  var zona = ev.target.closest && ev.target.closest(_BS_ZONA_CIERRE);
  if (!zona) return;
  var sheet = zona.closest('.bsheet');
  var overlay = sheet && sheet.previousElementSibling;
  if (overlay && overlay.classList.contains('bsheet-overlay')) overlay.click();
});

/* Arrastre real de la manija+título (drag-to-close) — misma técnica que el
   pull-to-refresh de js/home.js (touchstart guarda el punto de partida,
   touchmove mueve el elemento 1:1 con el dedo sin transición de por medio,
   touchend decide entre completar o volver, según umbral de distancia/
   velocidad). Delegado igual que el listener de click de arriba: touchstart
   solo arranca el seguimiento si el toque originó en _BS_ZONA_CIERRE
   (incluye el ::before de área ampliada de .bsheet-handle, ver esa regla en
   css/global.css — un toque ahí sigue targeteando al nodo real) — un toque
   que arranca en .bsheet-body/.bsheet-scroll (el buscador+lista de
   aj-sheet-pais/aj-sheet-prefijo, por ejemplo) nunca activa _bsDragging, así
   que su scroll interno nativo queda intacto sin ningún caso especial. */
var _bsDragSheet = null, _bsDragOverlay = null, _bsDragging = false;
var _bsDragStartY = 0, _bsDragLastY = 0, _bsDragLastTime = 0, _bsDragVelocity = 0;
var _BS_UMBRAL_PROGRESO = 0.4;   // 40% del alto visible del sheet
var _BS_UMBRAL_VELOCIDAD = 0.5;  // px/ms hacia abajo — swipe rápido, cierra aunque sea corto

document.addEventListener('touchstart', function(ev) {
  var handle = ev.target.closest && ev.target.closest(_BS_ZONA_CIERRE);
  if (!handle) return;
  var sheet = handle.closest('.bsheet');
  var overlay = sheet && sheet.previousElementSibling;
  if (!overlay || !overlay.classList.contains('bsheet-overlay')) return;
  _bsDragSheet = sheet; _bsDragOverlay = overlay; _bsDragging = true;
  _bsDragStartY = _bsDragLastY = ev.touches[0].clientY;
  _bsDragLastTime = Date.now();
  _bsDragVelocity = 0;
  sheet.classList.add('bsheet-sin-transicion');
}, { passive: true });

document.addEventListener('touchmove', function(ev) {
  if (!_bsDragging || !_bsDragSheet) return;
  var y = ev.touches[0].clientY;
  var now = Date.now();
  var dt = now - _bsDragLastTime;
  if (dt > 0) _bsDragVelocity = (y - _bsDragLastY) / dt; // px/ms del último tramo, instantánea (captura el "flick" final)
  _bsDragLastY = y; _bsDragLastTime = now;
  var delta = Math.max(0, y - _bsDragStartY); // solo hacia abajo — arrastrar hacia arriba no hace nada (el sheet no "sobrepasa" su posición abierta)
  _bsDragSheet.style.transform = 'translateY(' + delta + 'px)';
}, { passive: true });

document.addEventListener('touchend', function() {
  if (!_bsDragging || !_bsDragSheet) return;
  _bsDragging = false;
  var sheet = _bsDragSheet, overlay = _bsDragOverlay;
  _bsDragSheet = null; _bsDragOverlay = null;
  sheet.classList.remove('bsheet-sin-transicion'); // reactiva la transition de .bsheet antes de fijar el destino — anima el tramo restante, sin necesitar rAF (no es un "desde" recién montado, ya está pintado en la posición del arrastre)
  var delta = Math.max(0, _bsDragLastY - _bsDragStartY);
  var alto = sheet.getBoundingClientRect().height || 1;
  var progreso = delta / alto;
  var cierra = delta > 0 && (progreso >= _BS_UMBRAL_PROGRESO || _bsDragVelocity >= _BS_UMBRAL_VELOCIDAD);
  if (cierra) {
    overlay.click(); // mismo mecanismo que el tap en la manija (listener de arriba): dispara el onclick="cerrarX()" real del overlay, porGesto/history.back() sin tocar
  } else {
    sheet.style.transform = 'translateY(0)'; // no llegó al umbral — snap back a la posición abierta, con la transition ya reactivada arriba (misma curva que .bsheet, var(--ease-sheet))
  }
}, { passive: true });
