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

/* Botón X de cierre (`.sheet-close-btn`, sumado a todos los `.bsheet` de
   index.html) -- listener propio, NO reusa `_BS_ZONA_CIERRE` de arriba: esa
   lógica resuelve el overlay por `previousElementSibling`, que asume un
   orden de DOM (overlay ANTES del sheet) que 2 sheets no siguen
   (`sheet-cuota-pendiente`/`sheet-ev-tipo-pago` tienen el overlay DESPUÉS
   del sheet en el HTML) -- resolver por `id` (`<sheetId>-overlay`,
   convención real de TODOS los sheets de la app, sin excepción, confirmada
   contra index.html) funciona sin importar el orden. */
document.addEventListener('click', function(ev) {
  var btn = ev.target.closest && ev.target.closest('.sheet-close-btn');
  if (!btn) return;
  var sheet = btn.closest('.bsheet');
  if (!sheet || !sheet.id) return;
  var overlay = document.getElementById(sheet.id + '-overlay');
  if (overlay) overlay.click();
});

/* Bloqueo del scroll de fondo mientras hay un bottom sheet abierto (bug real:
   scrollear dentro del sheet de asistentes movía el timeline de atrás).
   Los ~30 sheets de la app se abren/cierran cada uno con su propia función
   (`ov.style.display = 'block'` / `'none'`, sin un open/close central), así
   que en vez de tocar cada una se observa el `style` de todo
   `.bsheet-overlay`: con al menos uno visible -> body overflow hidden; al
   cerrarse el último -> ''. `_bsBodyBloqueado` hace que solo se restaure lo
   que este mecanismo puso (date-picker/pwa/tour también usan
   body.style.overflow por su cuenta). Al abrir, además, se prepara el
   aislamiento táctil del overlay/sheet (`_bsPrepararTactil()`). */
var _bsBodyBloqueado = false;

/* Aislamiento táctil del sheet abierto (2da ronda del bug de scroll: el
   drag-desde-contenido de la ronda anterior se sacó, enfoque más simple):
   - Overlay: touchmove con preventDefault ({ passive: false } -- sin eso
     iOS Safari ignora el preventDefault) -> un dedo sobre el fondo oscuro
     no scrollea el timeline de atrás. El tap sigue cerrando vía el
     onclick="cerrarX()" que ya trae cada overlay (37/37 confirmados en
     index.html/inscripcion/activar).
   - Contenedores con scroll propio (overflow-y auto/scroll por computed
     style, p. ej. #ev-avatars-sheet-body): touchmove con stopPropagation
     (pasivo, el scroll nativo sigue) -> no llega al sheet, al overlay ni a
     los listeners de fondo (pull-to-refresh de js/home.js, etc.).
     overscroll-behavior:contain para que al tope/fondo no encadene al body.
   - El sheet en sí (si no es él mismo el scroller): touchmove con
     preventDefault -> un dedo sobre manija/título/zonas sin scroll tampoco
     mueve el fondo. Los toques del scroller no llegan acá (stopPropagation
     de arriba); el drag de la manija sigue andando porque preventDefault no
     corta la propagación hacia el listener de document.
   Una sola vez por nodo (`data-bs-tactil`). */
function _bsNoScroll(e) { if (e.cancelable) e.preventDefault(); }
function _bsFrenarPropagacion(e) { e.stopPropagation(); }

function _bsPrepararTactil(overlay, sheet) {
  if (!overlay.hasAttribute('data-bs-tactil')) {
    overlay.setAttribute('data-bs-tactil', '');
    overlay.addEventListener('touchmove', _bsNoScroll, { passive: false });
  }
  if (!sheet) return;
  var sheetScrollea = false;
  [sheet].concat(Array.prototype.slice.call(sheet.querySelectorAll('*'))).forEach(function(el) {
    var oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') return;
    if (el === sheet) sheetScrollea = true;
    if (el.hasAttribute('data-bs-tactil')) return;
    el.setAttribute('data-bs-tactil', '');
    el.style.overscrollBehavior = 'contain';
    el.addEventListener('touchmove', _bsFrenarPropagacion, { passive: true });
  });
  if (!sheetScrollea && !sheet.hasAttribute('data-bs-tactil')) {
    sheet.setAttribute('data-bs-tactil', '');
    sheet.addEventListener('touchmove', _bsNoScroll, { passive: false });
  }
}

function _bsSincronizarBloqueo() {
  var abierto = false;
  document.querySelectorAll('.bsheet-overlay').forEach(function(ov) {
    if (ov.style.display && ov.style.display !== 'none') abierto = true;
  });
  if (abierto && !_bsBodyBloqueado) {
    _bsBodyBloqueado = true;
    document.body.style.overflow = 'hidden';
  } else if (!abierto && _bsBodyBloqueado) {
    _bsBodyBloqueado = false;
    document.body.style.overflow = '';
  }
}

new MutationObserver(function(muts) {
  var toca = false;
  muts.forEach(function(m) {
    var ov = m.target;
    if (!ov.classList || !ov.classList.contains('bsheet-overlay')) return;
    toca = true;
    if (ov.style.display && ov.style.display !== 'none') {
      var sheet = (ov.id && document.getElementById(ov.id.replace(/-overlay$/, ''))) || ov.nextElementSibling;
      if (!sheet || !sheet.classList.contains('bsheet')) sheet = null;
      requestAnimationFrame(function() { _bsPrepararTactil(ov, sheet); }); // rAF: el sheet recibe su display en la línea siguiente al overlay (computed style de sus hijos recién ahí)
    }
  });
  if (toca) _bsSincronizarBloqueo();
}).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style'] });
