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
function axisTransicion(saliente, entrante, atras, mostrar, ocultar) {
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
    entrante.classList.remove('axis-enter');
    entrante.style.transform = ''; entrante.style.opacity = '';
    if (saliente) {
      saliente.classList.remove('axis-leave');
      saliente.style.transform = ''; saliente.style.opacity = '';
      if (ocultar) ocultar(saliente);
    }
  }, 320);
}
