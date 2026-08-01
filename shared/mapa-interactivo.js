/* Mapa interactivo con pin fijo al centro (patrón Uber/Cabify: el pin no se
   mueve, el mapa se desliza debajo) — mecanismo compartido entre Ajustes →
   Dirección (js/perfil.js, _ajInicializarMapaDireccion/aj-sub-direccion) y el
   formulario de Venues (js/eventos.js, _evLugarInicializarMapa/
   s-eventos-lugar-form). Extraído acá para no duplicar la creación del
   google.maps.Map + el listener de dragend en los 2 lugares — cada caller
   sigue dueño de su propia instancia (mismo criterio ya documentado para
   _ajDireccionMap: se crea una sola vez por canvas y se reusa entre
   aperturas, solo se recentra con setCenter(), nunca se recrea el Map) y de
   su propio pin visual (`.aj-mapa-pin`, css/perfil.css — clase genérica, no
   atada a Ajustes pese al prefijo del archivo donde vive).

   instanciaPrevia: la google.maps.Map ya creada por este caller, o null la
   primera vez.
   canvasEl: contenedor del mapa.
   centro: {lat,lng}.
   onDragEnd(centroNuevo): callback del caller, recibe el google.maps.LatLng
   resultante de arrastrar el mapa — cada caller decide qué hacer con esa
   posición (reverse-geocode a campos de dirección en Ajustes, o armar un link
   de Maps en el formulario de Venues).
   Devuelve la instancia (nueva o la misma recibida) — el caller la guarda en
   su propia variable global para la próxima apertura. */
function crearOCentrarMapaPin(instanciaPrevia, canvasEl, centro, onDragEnd) {
  if (instanciaPrevia) {
    instanciaPrevia.setCenter(centro);
    return instanciaPrevia;
  }
  var mapa = new google.maps.Map(canvasEl, {
    center: centro, zoom: 16, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy'
  });
  mapa.addListener('dragend', function() { onDragEnd(mapa.getCenter()); });
  return mapa;
}
