/* Transición "shared axis X" (Material Design 3) — mecánica compartida para
   navegación entre pantallas/pasos/subsecciones (ver MANIFEST). Un solo
   lugar para el JS, reusado por ir() (js/ui.js), inscMostrarPaso()
   (inscripcion/inscripcion.js) e irAjSub()/cerrarAjSub() (js/perfil.js) —
   cualquier flujo nuevo debe llamar a esta función en vez de reimplementar
   la animación. Mismos valores en los 3 usos: translateX 100%<->0 (entra) /
   0<->-25% (recede), opacity 0.85<->1, 320ms, var(--ease-axis)
   (css/estilos.css). Las clases .axis-enter/.axis-leave (css/global.css)
   solo aportan el `transition`/posicionamiento — todo el resto (transform,
   opacity, cuándo mostrar/ocultar) lo controla esta función.

   saliente: elemento actualmente visible, o null/undefined si no hay ninguno
   (primera navegación de la sesión) — se queda en flujo normal, .axis-leave.
   entrante: elemento que pasa a mostrarse — se superpone, .axis-enter,
   position:absolute (necesita un ancestro con position:relative — ya lo
   tienen .contenedor e .page-wrap).
   atras: true invierte el sentido (entra desde la izquierda, sale hacia la
   derecha) — usado al volver/gesto nativo de "atrás".
   mostrar(el)/ocultar(el): callbacks del caller para el toggle de clase real
   (ej. .activa/.activo) — esta función no asume ningún nombre de clase fijo. */
// Epoch global para el guard de limpieza descrito arriba de axisTransicion()
// — incrementado en cada llamada, estampado en los elementos que participan.
var _axisEpoch = 0;

function axisTransicion(saliente, entrante, atras, mostrar, ocultar) {
  // Guard contra navegación solapada (ver MANIFEST, "Cambios recientes" —
  // bug real encontrado con Playwright bajo navegación rápida ida-vuelta: 2
  // llamadas a ir() dentro de la ventana de 320ms de la anterior). Sin este
  // guard, el `setTimeout` de limpieza de ESTA llamada podía disparar 320ms
  // después y ocultar (`ocultar(saliente)`) una pantalla que, mientras
  // tanto, una llamada MÁS NUEVA ya había vuelto a poner `.activa` (porque
  // ese mismo elemento volvió a ser la `entrante` de esa llamada más
  // reciente) — la pantalla realmente vigente quedaba sin `.activa` para
  // siempre, sin que ninguna nueva limpieza la reestableciera. Cada llamada
  // estampa un `epoch` propio en `saliente`/`entrante`; en la limpieza, solo
  // actúa sobre un elemento si nadie más lo reclamó (estampó un epoch más
  // nuevo) entre medio.
  var epoch = ++_axisEpoch;
  if (saliente) saliente._axisEpoch = epoch;
  entrante._axisEpoch = epoch;
  // .axis-enter usa inset:0 (css/global.css) — ancla al borde de padding del
  // contenedor posicionado (.contenedor/.page-wrap), ignorando cualquier
  // hermano en flujo normal ANTES de las .pantalla (ej. #top-bar, sticky,
  // con altura variable según la pantalla). La saliente (.axis-leave, sigue
  // en flujo normal) sí respeta esa altura — así que sin este ajuste, la
  // entrante arrancaba más arriba que la saliente (tapada parcialmente por
  // #top-bar, con z-index más alto) en vez de alinearse con ella, mezclando
  // visualmente el cruce. Fix: se lee la posición real de la saliente ANTES
  // de tocar el DOM (offsetTop, relativo al mismo ancestro posicionado que
  // usa .axis-enter) y se la aplica como `top` inline a la entrante — si no
  // hay saliente (primera navegación), se deja el `top:0` por default de la
  // clase. Ver "Cambios recientes" — auditoría de la propagación del shared
  // axis X a ir().
  if (saliente) entrante.style.top = saliente.offsetTop + 'px';
  if (mostrar) mostrar(entrante);
  entrante.classList.add('axis-enter');
  if (saliente) saliente.classList.add('axis-leave');

  var entraDesde = atras ? '-25%' : '100%';
  var saleHacia  = atras ? '100%' : '-25%';

  entrante.style.transform = 'translateX(' + entraDesde + ')';
  entrante.style.opacity = '0.85';
  if (saliente) { saliente.style.transform = 'translateX(0)'; saliente.style.opacity = '1'; }

  // Doble rAF: deja que el navegador pinte el "desde" antes de moverlo al
  // destino — si se setea el transform final en el mismo tick que se
  // muestra/superpone el panel, la transition no tiene qué animar.
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      entrante.style.transform = 'translateX(0)';
      entrante.style.opacity = '1';
      if (saliente) { saliente.style.transform = 'translateX(' + saleHacia + ')'; saliente.style.opacity = '0.85'; }
    });
  });

  setTimeout(function() {
    if (entrante._axisEpoch === epoch) {
      entrante.classList.remove('axis-enter');
      entrante.style.transform = ''; entrante.style.opacity = ''; entrante.style.top = '';
    }
    if (saliente && saliente._axisEpoch === epoch) {
      saliente.classList.remove('axis-leave');
      saliente.style.transform = ''; saliente.style.opacity = '';
      if (ocultar) ocultar(saliente);
    }
  }, 320);
}

/* ── Barras fijas (título superior / footer inferior) como parte del shared
   axis X — ver MANIFEST, "Cambios recientes": 2 intentos previos intentaron
   sincronizar el TIMING de un swap instantáneo (display/texto reemplazado de
   golpe, solo movido a distintos puntos de los 320ms) y ambos siguieron
   mostrando bleed-through real (contenido/footer de la pantalla saliente
   visible detrás/debajo de la entrante). Nueva estrategia: en vez de un swap
   instantáneo en algún punto del ciclo, la barra saliente y la entrante se
   animan de verdad (slide vertical + fade) como un par, ambas montadas y
   visibles en simultáneo durante los 320ms — mismo criterio que ya usa
   axisTransicion() para el contenido principal (arriba). Elimina por
   completo la pregunta de "en qué instante exacto hago el swap" porque ya
   no hay ningún swap instantáneo que sincronizar.

   axisBarraVertical(saliente, entrante, atras, invertido, cleanup, baseTransform):
   coreografía de bajo nivel, reusada tanto por axisBarraTitulo() (barra
   superior) como por axisFooterFijo() (footer). saliente/entrante: ya
   montados y visibles (nunca display:none durante la llamada) — cualquiera
   puede ser null (pantalla sin barra). invertido=false: barra superior —
   sale hacia arriba/entra desde arriba (adelante); invertido=true: footer —
   sale hacia abajo/entra desde abajo (adelante). atras invierte el sentido
   en ambos casos (mismo parámetro que atras en axisTransicion()).
   baseTransform: prefijo de transform a preservar (ej. 'translateX(-50%)',
   el centrado de .cta-footer-fixed) — nunca se pisa, siempre se antepone.
   cleanup(vigente) recibe un helper `vigente(el)` — mismo guard de epoch que
   axisTransicion() (ver esa nota) para navegación solapada: los callers lo
   usan para no tocar un elemento que una llamada más nueva ya reclamó.

   El fade se aplica a los HIJOS DIRECTOS de saliente/entrante, nunca al
   contenedor — ver MANIFEST, "Cambios recientes" (bug real de bleed-through
   encontrado con Playwright: #top-bar/.cta-footer-fixed tienen background
   sólido propio, pero `opacity` en el contenedor vuelve TAMBIÉN
   transparente ese fondo durante el fade, no solo el texto — con solo
   16px de desplazamiento, hay una ventana de varios frames donde el
   contenedor es un "vidrio esmerilado" en vez de un panel sólido, dejando
   ver lo que esté exactamente detrás en esa franja si la pantalla
   entrante tiene contenido ahí — ej. la fila "Notificaciones" de
   `s-datos` asomando detrás/encima del botón "Hacer una reserva" de
   `s-home` mientras este se desvanecía). El contenedor (fondo sólido) solo
   se traslada — su opacity nunca se toca, queda como un escudo opaco
   constante — y son sus hijos (botones/texto/título) los que hacen el
   fade visual, logrando el mismo efecto percibido sin nunca volver
   translúcido el fondo. */
var _axisBarEpoch = 0;
function axisBarraVertical(saliente, entrante, atras, invertido, cleanup, baseTransform) {
  var prefix = baseTransform ? baseTransform + ' ' : '';
  var OFFSET = 16;
  var dir = (atras ? -1 : 1) * (invertido ? 1 : -1);
  var offset = dir * OFFSET;
  var epoch = ++_axisBarEpoch;
  if (saliente) saliente._axisBarEpoch = epoch;
  if (entrante) entrante._axisBarEpoch = epoch;

  function hijos(el) { return el ? Array.prototype.slice.call(el.children) : []; }
  var hijosSaliente = hijos(saliente), hijosEntrante = hijos(entrante);

  if (entrante) {
    entrante.style.transition = 'none';
    entrante.style.transform = prefix + 'translateY(' + offset + 'px)';
    hijosEntrante.forEach(function(h) { h.style.transition = 'none'; h.style.opacity = '0'; });
  }
  if (saliente) {
    saliente.style.transition = 'none';
    saliente.style.transform = prefix + 'translateY(0px)';
    hijosSaliente.forEach(function(h) { h.style.transition = 'none'; h.style.opacity = '1'; });
  }

  // Doble rAF, mismo motivo que axisTransicion(): pintar el "desde" antes de
  // animar al destino.
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var tTransform = 'transform 0.32s var(--ease-axis)';
      var tOpacity = 'opacity 0.32s var(--ease-axis)';
      if (entrante) {
        entrante.style.transition = tTransform; entrante.style.transform = prefix + 'translateY(0px)';
        hijosEntrante.forEach(function(h) { h.style.transition = tOpacity; h.style.opacity = '1'; });
      }
      if (saliente) {
        saliente.style.transition = tTransform; saliente.style.transform = prefix + 'translateY(' + offset + 'px)';
        hijosSaliente.forEach(function(h) { h.style.transition = tOpacity; h.style.opacity = '0'; });
      }
    });
  });

  setTimeout(function() {
    hijosEntrante.forEach(function(h) { h.style.opacity = ''; h.style.transition = ''; });
    hijosSaliente.forEach(function(h) { h.style.opacity = ''; h.style.transition = ''; });
    if (cleanup) cleanup(function(el) { return !!el && el._axisBarEpoch === epoch; });
  }, 320);
}

/* Barra superior singleton con contenido dinámico (#top-bar en js/ui.js,
   #insc-nav en inscripcion/inscripcion.js): a diferencia del contenido
   principal (pares de pantallas reales) o el footer (ver axisFooterFijo(),
   un elemento real por pantalla), acá hay un solo elemento real cuyo
   texto/botón atrás se reescribe en cada navegación — no hay "entrante"
   real para clonar del lado saliente. Se clona el elemento ANTES de pisar
   su contenido: ese clon ("ghost") congela visualmente el estado saliente
   exacto (texto viejo, botón atrás viejo) y se anima hacia afuera mientras
   la barra real — ya con el contenido nuevo aplicado — anima su entrada.
   El ghost es position:fixed (fuera de .contenedor/.page-wrap, posición
   exacta capturada con getBoundingClientRect() antes de tocar nada) — nunca
   position:absolute dentro del contenedor, mismo motivo documentado para
   .cta-footer-fixed (evitar que un ancestro con transform activo se
   convierta en containing block y rompa su posición real).
   aplicarContenidoNuevo() es el callback del caller que pisa el DOM real
   (texto/botón atrás/display) — se llama de inmediato, antes de animar. */
function axisBarraTitulo(barEl, aplicarContenidoNuevo, atras) {
  if (!barEl) { aplicarContenidoNuevo(); return; }
  var eraVisible = getComputedStyle(barEl).display !== 'none';
  var ghost = null;
  if (eraVisible) {
    var rect = barEl.getBoundingClientRect();
    ghost = barEl.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.classList.add('axis-bar-ghost');
    ghost.querySelectorAll('[id]').forEach(function(el) { el.removeAttribute('id'); });
    ghost.style.position = 'fixed';
    ghost.style.top = rect.top + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.margin = '0';
    ghost.style.zIndex = '101';
    ghost.style.animation = 'none';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
  }

  aplicarContenidoNuevo();
  var vaAVerse = getComputedStyle(barEl).display !== 'none';

  if (!eraVisible && !vaAVerse) return; // nunca hubo barra, sigue sin haberla — nada que animar

  // .app-nav-sticky (css/nav.css) trae su propio `animation:smoothSlideDown`
  // para el caso "sin barra -> con barra" (display:none -> flex) — se
  // desactiva acá porque ahora ese mismo caso ya lo cubre esta función
  // (ghost null, solo entrante), y una `animation` CSS corriendo en paralelo
  // pisaría el transform/opacity inline que se anima a mano.
  if (vaAVerse) barEl.style.animation = 'none';
  axisBarraVertical(ghost, vaAVerse ? barEl : null, atras, false, function(vigente) {
    if (ghost) ghost.remove(); // el ghost es siempre nuevo, nunca lo reclama otra llamada
    if (vaAVerse && vigente(barEl)) { barEl.style.transform = ''; barEl.style.transition = ''; }
  });
}

/* Footer fijo por pantalla (.cta-footer-fixed): a diferencia de la barra
   superior, cada pantalla ya tiene su propio elemento real en el DOM (no
   hace falta clonar nada) — saliente/entrante son 2 elementos distintos,
   cualquiera puede ser null (pantalla sin footer). Si el contenido visible
   es idéntico (ej. varios pasos de inscripción que muestran el mismo botón
   "Continuar", solo cambia el handler onclick) no se anima — swap
   instantáneo, invisible al ojo, evita animar un cambio que no se nota. */
function axisFooterFijo(saliente, entrante, atras) {
  if (saliente === entrante) return;
  if (saliente && entrante && saliente.textContent.trim() === entrante.textContent.trim()) {
    saliente.style.display = 'none';
    entrante.style.display = 'block';
    return;
  }
  if (entrante) entrante.style.display = 'block';
  axisBarraVertical(saliente, entrante, atras, true, function(vigente) {
    if (saliente && vigente(saliente)) { saliente.style.display = 'none'; saliente.style.transform = ''; saliente.style.transition = ''; }
    if (entrante && vigente(entrante)) { entrante.style.transform = ''; entrante.style.transition = ''; }
  }, 'translateX(-50%)');
}
