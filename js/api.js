var _token = '';

function api(params, onSuccess, onError) {
  if (_token && !params.token) params.token = _token;
  var url = BACKEND + '?' + Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  // `cache: 'no-store'` (bug real corregido, investigado de paso -- "tomar
  // una tarea recurrente da 'tarea no encontrada'" pese a que la tarea
  // existía y el backend la encontraba bien probado directo): la Edge
  // Function no manda NINGÚN header `Cache-Control`/`ETag`/`Last-Modified`
  // en sus respuestas (confirmado con `curl -I` contra producción), y este
  // `fetch()` tampoco pedía nunca `cache: 'no-store'` -- con el `cache`
  // default del navegador, una request GET repetida con la MISMA URL
  // (mismos `action`/`nombre`/`tareaId`/`token`, ej. reintentar "Tomar
  // tarea" en la misma tarea) puede quedar servida desde el cache HTTP
  // local en vez de pegarle a la red de nuevo -- un intento fallido viejo
  // (ej. contra datos ya corregidos del lado del servidor mientras tanto)
  // podía seguir devolviéndose indefinidamente sin que el usuario lo note.
  // TODA acción de esta app usa GET acá, incluidas las que mutan estado
  // (`tomarTarea`/`soltarTarea`/etc., ver comentario "bug sistémico" en
  // js/tareas.js) -- ninguna debe cachearse nunca, sin excepción.
  fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (data && data.error) { onError({ message: data.error }); } else { onSuccess(data); } })
    .catch(function(e) { onError(e); });
}

function apiPost(params, onSuccess, onError) {
  var body = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  // Timeout de 15s (pedido explícito, "conexión móvil lenta") -- sin esto,
  // un fetch que ni resuelve ni rechaza (conexión colgada, sin respuesta
  // del servidor) deja a quien llama esperando para siempre: ni onSuccess
  // ni onError corren nunca, mismo síntoma que "login trabado en
  // Verificando cuenta" sin ningún mensaje de error visible. Promise.race
  // no cancela el fetch real si pierde la carrera (sigue en vuelo de
  // fondo) -- alcanza para que ESTE caller ya no quede esperando.
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() { reject(new Error('Tiempo de espera agotado. Verificá tu conexión.')); }, 15000);
  });
  Promise.race([
    fetch(BACKEND, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: body
    }),
    timeoutPromise
  ])
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data && data.error) { onError({ message: data.error }); } else { onSuccess(data); }
  })
  .catch(function(e) { onError(e); });
}
