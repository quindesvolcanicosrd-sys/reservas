/* ── Modo sin conexión para Eventos (feat nueva, ver MANIFEST.md/
   CHANGELOG.md -- "modo sin conexión completo para la sección Eventos")
   ─────────────────────────────────────────────────────────────────────
   Módulo autocontenido, cargado junto al resto de js/*.js -- se apoya en
   variables/funciones YA existentes de js/eventos.js (_EV_EVENTOS,
   _EV_CUMPLEANOS, _EV_ANIVERSARIO_INGRESO, _EV_OFFSEASON,
   _evCargarDatosReales(), _evRenderTimeline(), _evNombresCoinciden()) en
   vez de duplicar su propio estado -- este archivo solo agrega la CAPA de
   persistencia/cola, la sección sigue siendo dueña de sus datos en
   memoria. Vanilla ES5 (var/function, sin arrow functions/let/const),
   mismo criterio que el resto del proyecto.

   Piezas:
   1. IndexedDB con 2 stores -- 'cache' (1 sola fila, snapshot completo de
      lo que pinta el timeline) y 'cola' (acciones pendientes de RSVP/
      marcado admin hechas sin conexión, en orden de creación real vía
      autoIncrement).
   2. `_evCargarDatosReales()` (js/eventos.js) se engancha acá: sin
      conexión, sirve el último snapshot cacheado en vez de pegarle a la
      red; con conexión, escribe el cache al terminar (ver el hook chico
      agregado ahí mismo).
   3. `_evMarcarAsistencia()`/`_evMarcarAsistenciaAdmin()` (RSVP propio y
      marcado admin) se enganchan para encolar en vez de pegarle a la red
      cuando `!navigator.onLine` -- el resto de esas 2 funciones (update
      optimista del array en memoria + DOM) queda intacto, sin duplicar
      esa lógica acá.
   4. Al volver la conexión (evento `online`): pull fresco primero, cola
      procesada en orden cronológico después, con detección de conflicto
      (¿el valor remoto fresco difiere del que había ANTES de la acción
      offline?) y reintento con backoff exponencial (máx. 3 intentos).
   5. Banner + botón "Actualizar" (`#ev-offline-banner`, index.html):
      visible sin conexión, o con conexión si el último snapshot ya pasa
      los `_OFF_BANNER_MAX_MIN` minutos.
*/

var _OFF_DB_NAME = 'mirlxs_eventos_offline';
var _OFF_DB_VERSION = 1;
var _OFF_BANNER_MAX_MIN = 15;
var _offDb = null;
var _offSincronizando = false;
// Timestamp (ms) del último snapshot que terminó de pintar el timeline --
// online recién cacheado, u offline leído del cache -- alimenta el banner
// ("Sin conexión -- mostrando datos guardados (14:32)"). `null` = todavía
// sin ningún dato real esta sesión (ni red ni cache).
var _offUltimoSyncTs = null;

// ── IndexedDB: apertura perezosa, 1 sola conexión reusada ──────────────
function _offAbrirDb(cb) {
  if (_offDb) { cb(_offDb); return; }
  if (!window.indexedDB) { cb(null); return; }
  var req;
  try { req = indexedDB.open(_OFF_DB_NAME, _OFF_DB_VERSION); } catch (e) { cb(null); return; }
  req.onupgradeneeded = function(ev) {
    var db = ev.target.result;
    if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'id', autoIncrement: true });
  };
  req.onsuccess = function(ev) { _offDb = ev.target.result; cb(_offDb); };
  req.onerror = function() { cb(null); };
}

// ── Cache completo (snapshot único, key='eventos') ──────────────────────
// Guarda TODO lo que _evCargarDatosReales() pobló esta vuelta -- eventos ya
// traen `asistentes`/`rsvps` embebidos por evento (_evMapEventoBackend(),
// js/eventos.js), así que cachear _EV_EVENTOS alcanza para cubrir el
// roster completo de asistentes de cada evento en modo admin, sin un
// fetch/cache separado por evento.
function _offGuardarCache() {
  _offAbrirDb(function(db) {
    if (!db) return;
    var ahora = Date.now();
    var payload = {
      key: 'eventos',
      eventos: _EV_EVENTOS, cumpleanos: _EV_CUMPLEANOS,
      aniversarios: _EV_ANIVERSARIO_INGRESO, offseason: _EV_OFFSEASON,
      ts: ahora
    };
    _offUltimoSyncTs = ahora;
    try {
      var tx = db.transaction('cache', 'readwrite');
      tx.objectStore('cache').put(payload);
    } catch (e) {}
  });
}
function _offLeerCache(cb) {
  _offAbrirDb(function(db) {
    if (!db) { cb(null); return; }
    try {
      var tx = db.transaction('cache', 'readonly');
      var req = tx.objectStore('cache').get('eventos');
      req.onsuccess = function() { cb(req.result || null); };
      req.onerror = function() { cb(null); };
    } catch (e) { cb(null); }
  });
}
// Llamada por _evCargarDatosReales() (js/eventos.js) cuando arranca sin
// conexión -- repuebla las mismas variables globales que el camino real de
// red, así el resto del archivo (render, filtros, detalle) sigue sin
// enterarse de dónde vino el dato.
function _offCargarDesdeCache(onListo) {
  _offLeerCache(function(data) {
    _EV_EVENTOS = (data && data.eventos) || [];
    _EV_CUMPLEANOS = (data && data.cumpleanos) || [];
    _EV_ANIVERSARIO_INGRESO = (data && data.aniversarios) || null;
    _EV_OFFSEASON = (data && data.offseason) || [];
    _offUltimoSyncTs = data ? data.ts : null;
    onListo();
  });
}

// ── Cola de acciones pendientes ─────────────────────────────────────────
// Cada fila: { id (auto), tipo: 'rsvp'|'adminMarcar', apiParams (los
// mismos params que ya arma el caller para apiPost()), meta: { idEvento,
// nombre (solo adminMarcar), previo, estadoNuevo, descripcion },
// intentos, ts }.
function _offEncolar(accion, cb) {
  _offAbrirDb(function(db) {
    if (!db) { cb && cb(null); return; }
    accion.intentos = 0;
    accion.ts = Date.now();
    try {
      var tx = db.transaction('cola', 'readwrite');
      var req = tx.objectStore('cola').add(accion);
      req.onsuccess = function() { cb && cb(req.result); };
      req.onerror = function() { cb && cb(null); };
    } catch (e) { cb && cb(null); }
  });
}
function _offListarCola(cb) {
  _offAbrirDb(function(db) {
    if (!db) { cb([]); return; }
    try {
      var tx = db.transaction('cola', 'readonly');
      var req = tx.objectStore('cola').getAll();
      req.onsuccess = function() { cb(req.result || []); };
      req.onerror = function() { cb([]); };
    } catch (e) { cb([]); }
  });
}
function _offBorrarDeCola(id, cb) {
  _offAbrirDb(function(db) {
    if (!db) { cb && cb(); return; }
    try {
      var tx = db.transaction('cola', 'readwrite');
      tx.objectStore('cola').delete(id);
      tx.oncomplete = function() { cb && cb(); };
    } catch (e) { cb && cb(); }
  });
}
function _offActualizarEnCola(accion, cb) {
  _offAbrirDb(function(db) {
    if (!db) { cb && cb(); return; }
    try {
      var tx = db.transaction('cola', 'readwrite');
      tx.objectStore('cola').put(accion);
      tx.oncomplete = function() { cb && cb(); };
    } catch (e) { cb && cb(); }
  });
}

// ── Punto de entrada usado por _evMarcarAsistencia()/
// _evMarcarAsistenciaAdmin() (js/eventos.js) cuando `!navigator.onLine` --
// esas 2 funciones YA aplicaron el cambio optimista al array en memoria y
// al DOM antes de llamar acá (mismo bloque de siempre, sin duplicar esa
// lógica); esto solo encola la escritura real pendiente y prende el ícono
// de "pendiente de sincronizar" sobre el control tocado.
function _offEjecutarOEncolar(accion) {
  _offEncolar(accion, function() {
    _offMarcarPendiente(accion.tipo, accion.meta.idEvento, true);
    _offActualizarBanner();
  });
}

// ── Ícono "pendiente de sincronizar" sobre el control tocado ───────────
// RSVP propio: `.ev-rsvp-seg[data-evid]` (ya existe, ver _evRsvpBarraHtml()).
// Marcado admin: `#ev-asist-admin-header-<id>` (ya existe, ver
// _evAccionAdminHtml()) -- 1 solo ícono por evento alcanza ahí aunque haya
// varias personas encoladas para el mismo evento, es un indicador de
// "este evento tiene cambios sin sincronizar", no un contador por fila.
// Un re-render completo del timeline (_evRenderTimeline()) reconstruye
// estos nodos desde cero -- por eso _offAplicarIndicadoresPendientes()
// (más abajo) se re-llama al final de ese render, para que el ícono
// sobreviva en vez de desaparecer con el nodo viejo.
function _offMarcarPendiente(tipo, idEvento, pendiente) {
  var targets = [];
  if (tipo === 'rsvp') {
    targets = Array.prototype.slice.call(document.querySelectorAll('.ev-rsvp-seg[data-evid="' + idEvento + '"]'));
  } else {
    var header = document.getElementById('ev-asist-admin-header-' + idEvento);
    if (header) targets = [header];
  }
  targets.forEach(function(el) {
    var existente = el.querySelector('.ev-sync-badge');
    if (pendiente) {
      if (!existente) {
        var b = document.createElement('span');
        b.className = 'ev-sync-badge material-symbols-outlined';
        b.textContent = 'sync';
        b.title = 'Pendiente de sincronizar';
        el.appendChild(b);
      }
    } else if (existente) {
      existente.parentNode.removeChild(existente);
    }
  });
}
// Reaplica los íconos de "pendiente" de TODA la cola actual -- llamada al
// final de _evRenderTimeline() (js/eventos.js), ver el hook chico agregado
// ahí, y tras cada sync exitoso/fallido (por si queda algo en la cola).
function _offAplicarIndicadoresPendientes() {
  _offListarCola(function(cola) {
    (cola || []).forEach(function(accion) {
      _offMarcarPendiente(accion.tipo, accion.meta.idEvento, true);
    });
  });
}

// ── Sync al volver la conexión (o refresco manual) ──────────────────────
// 1) pull fresco (_evCargarDatosReales(), ya sabe pegarle a la red porque
//    en este punto navigator.onLine es true) -- 2) cola procesada en
//    orden cronológico, con conflicto/backoff -- 3) re-render + banner.
function _offSincronizarTodo(cb) {
  if (_offSincronizando) { cb && cb(); return; }
  if (!navigator.onLine) { cb && cb(); return; }
  _offSincronizando = true;
  _evCargarDatosReales(function() {
    _offSincronizarCola(function() {
      _offSincronizando = false;
      var cont = document.getElementById('ev-timeline');
      if (cont && typeof _evRenderTimeline === 'function') _evRenderTimeline(true);
      _offActualizarBanner();
      cb && cb();
    });
  });
}
function _offSincronizarCola(cb) {
  _offListarCola(function(cola) {
    if (!cola || !cola.length) { cb && cb(); return; }
    // autoIncrement ya refleja el orden real de creación -- se procesa tal
    // cual llega, sin reordenar.
    var idx = 0;
    function siguiente() {
      if (idx >= cola.length) { cb && cb(); return; }
      var accion = cola[idx];
      _offProcesarAccion(accion, function() { idx++; siguiente(); });
    }
    siguiente();
  });
}
function _offProcesarAccion(accion, cb) {
  var conflicto = _offDetectarConflicto(accion);
  if (conflicto) {
    _offResolverConflicto(accion, conflicto, function(procederIgual) {
      if (!procederIgual) {
        _offBorrarDeCola(accion.id, function() { _offMarcarPendiente(accion.tipo, accion.meta.idEvento, false); cb(); });
        return;
      }
      _offEjecutarAccionReal(accion, cb);
    });
    return;
  }
  _offEjecutarAccionReal(accion, cb);
}
// Compara el valor remoto YA fresco (_EV_EVENTOS recién repoblado por el
// pull de _offSincronizarTodo()) contra `accion.meta.previo` (el valor que
// había ANTES de que la persona actuara sin conexión) -- si alguien más
// cambió ese mismo dato mientras tanto (el remoto fresco no coincide NI
// con lo que había antes NI con lo que esta acción pendiente iba a
// escribir), es un conflicto real. Evento ya inexistente en el pull
// fresco (cancelado/eliminado mientras tanto) -- se deja pasar tal cual,
// que el propio apiPost() falle limpio si corresponde, no es competencia
// de esta función decidir eso.
function _offDetectarConflicto(accion) {
  var ev = (typeof _EV_EVENTOS !== 'undefined' ? _EV_EVENTOS : []).filter(function(e) { return e.id === accion.meta.idEvento; })[0];
  if (!ev) return null;
  var valorRemotoActual;
  if (accion.tipo === 'rsvp') {
    valorRemotoActual = ev.miEstado;
  } else {
    var fila = (ev.asistentes || []).filter(function(a) { return _evNombresCoinciden(a.nombre, accion.meta.nombre); })[0];
    valorRemotoActual = fila ? fila.estado : null;
  }
  if (valorRemotoActual === accion.meta.estadoNuevo) return null;
  if (valorRemotoActual === accion.meta.previo) return null;
  return { remoto: valorRemotoActual };
}
// Aviso simple vía confirm() nativo -- caso borde real pero poco frecuente
// (2 dispositivos/personas tocando el mismo evento mientras una está sin
// conexión); no amerita un bottom sheet propio nuevo solo para esto.
// `true` = aplicar igual el cambio pendiente (sobreescribe lo que puso la
// otra persona); `false` = descartar la acción encolada y quedarse con el
// valor remoto fresco.
function _offResolverConflicto(accion, conflicto, cb) {
  var ev = (typeof _EV_EVENTOS !== 'undefined' ? _EV_EVENTOS : []).filter(function(e) { return e.id === accion.meta.idEvento; })[0];
  var nombreEvento = ev ? (ev.lugar || 'este evento') : 'este evento';
  var sujeto = accion.tipo === 'adminMarcar' ? ('la asistencia de ' + accion.meta.nombre) : 'tu asistencia';
  var msg = 'Mientras estabas sin conexión, ' + sujeto + ' en "' + nombreEvento + '" quedó en "' + (conflicto.remoto || 'Ninguno') +
    '". ¿Aplicar igual tu cambio a "' + (accion.meta.estadoNuevo || 'Ninguno') + '"?';
  var procederIgual = window.confirm(msg);
  cb(procederIgual);
}
// Backoff exponencial 1s/2s/4s, hasta 3 intentos -- al agotarlos se
// descarta la acción (con toast avisando) en vez de bloquear el resto de
// la cola para siempre por una sola acción que sigue fallando.
function _offEjecutarAccionReal(accion, cb) {
  apiPost(accion.apiParams, function() {
    _offBorrarDeCola(accion.id, function() {
      _offMarcarPendiente(accion.tipo, accion.meta.idEvento, false);
      cb();
    });
  }, function(e) {
    accion.intentos = (accion.intentos || 0) + 1;
    if (accion.intentos >= 3) {
      if (typeof mostrarToast === 'function') {
        mostrarToast('No se pudo sincronizar: ' + (accion.meta.descripcion || 'un cambio pendiente') + '.', 'error');
      }
      _offBorrarDeCola(accion.id, function() {
        _offMarcarPendiente(accion.tipo, accion.meta.idEvento, false);
        cb();
      });
      return;
    }
    var espera = Math.pow(2, accion.intentos - 1) * 1000;
    _offActualizarEnCola(accion, function() {
      setTimeout(function() { _offEjecutarAccionReal(accion, cb); }, espera);
    });
  });
}

// ── Refresco manual (botón del banner) ──────────────────────────────────
function _offRefrescarManual() {
  if (!navigator.onLine) {
    if (typeof mostrarToast === 'function') mostrarToast('Seguís sin conexión.', 'error');
    return;
  }
  var btn = document.getElementById('ev-offline-banner-btn');
  if (btn) btn.classList.add('ev-offline-banner-btn--girando');
  _offSincronizarTodo(function() {
    if (btn) btn.classList.remove('ev-offline-banner-btn--girando');
  });
}

// ── Banner "Sin conexión" / "Datos de hace N min" ───────────────────────
function _off2Dig(n) { return (n < 10 ? '0' : '') + n; }
function _offFormatearHora(ts) {
  var d = new Date(ts);
  return _off2Dig(d.getHours()) + ':' + _off2Dig(d.getMinutes());
}
function _offActualizarBanner() {
  var banner = document.getElementById('ev-offline-banner');
  if (!banner) return;
  var offline = !navigator.onLine;
  var edadMin = _offUltimoSyncTs ? Math.round((Date.now() - _offUltimoSyncTs) / 60000) : null;
  var stale = !offline && edadMin !== null && edadMin >= _OFF_BANNER_MAX_MIN;
  if (!offline && !stale) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  var msgEl = document.getElementById('ev-offline-banner-msg');
  if (msgEl) {
    var horaTxt = _offUltimoSyncTs ? _offFormatearHora(_offUltimoSyncTs) : null;
    msgEl.textContent = offline
      ? ('Sin conexión — mostrando datos guardados' + (horaTxt ? ' (' + horaTxt + ')' : ''))
      : ('Datos de hace ' + edadMin + ' min — toca para actualizar');
  }
  var syncEl = document.getElementById('ev-offline-banner-sync');
  _offListarCola(function(cola) {
    if (!syncEl) return;
    if (cola && cola.length) {
      syncEl.style.display = 'block';
      syncEl.textContent = cola.length + (cola.length === 1 ? ' cambio pendiente de sincronizar' : ' cambios pendientes de sincronizar');
    } else {
      syncEl.style.display = 'none';
    }
  });
}

window.addEventListener('online', function() { _offActualizarBanner(); _offSincronizarTodo(); });
window.addEventListener('offline', function() { _offActualizarBanner(); });
setInterval(function() { _offActualizarBanner(); }, 60000);
