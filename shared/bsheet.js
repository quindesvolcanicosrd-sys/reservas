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

/* Drag-to-close también desde el contenido scrolleable (pedido explícito,
   bug de scroll del sheet de asistentes) -- SOLO si el contenedor ya está en
   su tope (scrollTop === 0) Y el primer movimiento del dedo es hacia abajo:
   touchstart ahí deja el gesto "pendiente" (`_bsDragPendiente`), y recién el
   primer touchmove decide -- hacia abajo arranca el arrastre real, hacia
   arriba lo descarta y el scroll nativo sigue intacto. Con scrollTop > 0
   nunca se arma nada: ese toque es scroll puro. Este touchmove llega por
   `_bsDragMove()` llamado desde el listener propio del contenedor
   (`_bsPrepararScroll()`, abajo), no desde el de document -- ese listener
   hace stopPropagation. */
var _bsDragPendiente = false;

function _bsIniciarDrag(sheet, overlay, y) {
  _bsDragSheet = sheet; _bsDragOverlay = overlay; _bsDragging = true;
  _bsDragStartY = _bsDragLastY = y;
  _bsDragLastTime = Date.now();
  _bsDragVelocity = 0;
  sheet.classList.add('bsheet-sin-transicion');
}

document.addEventListener('touchstart', function(ev) {
  _bsDragPendiente = false;
  if (!ev.target.closest) return;
  var handle = ev.target.closest(_BS_ZONA_CIERRE);
  var scroller = handle ? null : ev.target.closest('[data-bs-scroll]');
  if (!handle && !scroller) return;
  var sheet = (handle || scroller).closest('.bsheet');
  var overlay = sheet && sheet.previousElementSibling;
  if (!overlay || !overlay.classList.contains('bsheet-overlay')) return;
  if (handle) { _bsIniciarDrag(sheet, overlay, ev.touches[0].clientY); return; }
  if (scroller.scrollTop > 0) return; // contenido ya scrolleado: el toque es scroll, nunca drag
  _bsDragSheet = sheet; _bsDragOverlay = overlay; _bsDragPendiente = true;
  _bsDragStartY = ev.touches[0].clientY;
}, { passive: true });

function _bsDragMove(ev) {
  if (_bsDragPendiente) {
    var dy = ev.touches[0].clientY - _bsDragStartY;
    if (dy === 0) return;
    _bsDragPendiente = false;
    if (dy < 0) { _bsDragSheet = null; _bsDragOverlay = null; return; } // hacia arriba: scroll normal del contenido
    _bsIniciarDrag(_bsDragSheet, _bsDragOverlay, _bsDragStartY);
  }
  if (!_bsDragging || !_bsDragSheet) return;
  var y = ev.touches[0].clientY;
  var now = Date.now();
  var dt = now - _bsDragLastTime;
  if (dt > 0) _bsDragVelocity = (y - _bsDragLastY) / dt; // px/ms del último tramo, instantánea (captura el "flick" final)
  _bsDragLastY = y; _bsDragLastTime = now;
  var delta = Math.max(0, y - _bsDragStartY); // solo hacia abajo — arrastrar hacia arriba no hace nada (el sheet no "sobrepasa" su posición abierta)
  _bsDragSheet.style.transform = 'translateY(' + delta + 'px)';
}
document.addEventListener('touchmove', _bsDragMove, { passive: true });

document.addEventListener('touchend', function() {
  if (_bsDragPendiente) { _bsDragPendiente = false; _bsDragSheet = null; _bsDragOverlay = null; }
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
   contenedor scrolleable del sheet (`_bsPrepararScroll()`). */
var _bsBodyBloqueado = false;

/* Contenedores con scroll propio dentro del sheet (overflow-y auto/scroll,
   p. ej. #ev-avatars-sheet-body): touchmove con stopPropagation para que el
   gesto no llegue a los listeners de fondo (pull-to-refresh de js/home.js,
   drag del calendario de js/eventos.js) + overscroll-behavior:contain para
   que al llegar al tope/fondo el scroll no encadene al body. Como el
   stopPropagation corta también el touchmove de document, el mismo listener
   alimenta a `_bsDragMove()` (drag-to-close desde scrollTop === 0, arriba).
   Una sola vez por contenedor (`data-bs-scroll`). */
function _bsPrepararScroll(sheet) {
  var nodos = [sheet].concat(Array.prototype.slice.call(sheet.querySelectorAll('*')));
  nodos.forEach(function(el) {
    if (el.hasAttribute('data-bs-scroll')) return;
    var oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') return;
    el.setAttribute('data-bs-scroll', '');
    el.style.overscrollBehavior = 'contain';
    el.addEventListener('touchmove', function(e) { e.stopPropagation(); _bsDragMove(e); }, { passive: true });
  });
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
      if (sheet && sheet.classList.contains('bsheet')) requestAnimationFrame(function() { _bsPrepararScroll(sheet); }); // rAF: el sheet recibe su display en la línea siguiente al overlay
    }
  });
  if (toca) _bsSincronizarBloqueo();
}).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style'] });
