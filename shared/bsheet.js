/* Manija de bottom sheets (.bsheet-handle): un solo listener delegado que
   cierra el sheet tocando/clickeando la barra, sin duplicar lógica de cierre
   por instancia. Cada .bsheet-overlay ya trae su propio onclick="cerrarX()"
   (patrón porGesto/history.back(), ver MANIFEST "Cierre de overlays vía
   historial") — acá solo se le encuentra el overlay correspondiente al sheet
   que contiene la manija tocada y se dispara ese click ya existente, para
   overlays anidados incluidos (cierra siempre el de más arriba: el handle
   pertenece a un .bsheet puntual, no hay ambigüedad de cuál cerrar). */
document.addEventListener('click', function(ev) {
  var handle = ev.target.closest && ev.target.closest('.bsheet-handle');
  if (!handle) return;
  var sheet = handle.closest('.bsheet');
  var overlay = sheet && sheet.previousElementSibling;
  if (overlay && overlay.classList.contains('bsheet-overlay')) overlay.click();
});
