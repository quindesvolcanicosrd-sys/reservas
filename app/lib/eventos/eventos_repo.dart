import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/fechas.dart';
import '../sesion/sesion.dart';
import 'anticipada.dart';
import 'modelos.dart';

/// Modo de edición de un evento recurrente (mismos 3 de la web,
/// `_evAdminEditarEvento()`): solo este, un período o desde este en adelante.
enum AlcanceEdicion { individual, periodo, desdeAqui }

/// Persona del equipo sin respuesta para un evento (solo admins).
class SinRespuesta {
  const SinRespuesta(this.persona);
  final Persona persona;
}

/// Datos de la sección Eventos. Carga por rango (inicio: 30 días atrás y 120
/// adelante) y amplía el rango cuando el calendario pide otro mes.
/// Persona del equipo en la lista de "Tomar asistencia".
class MiembroRoster {
  const MiembroRoster({required this.persona, required this.inactivo});
  final Persona persona;
  final bool inactivo;
}

class EventosRepo extends ChangeNotifier {
  EventosRepo(this.sesion);

  final Sesion sesion;
  Api get _api => sesion.api;
  late final AnticipadaRepo anticipada = AnticipadaRepo(sesion);

  List<Evento> eventos = [];
  List<Cumple> cumples = [];
  List<Temporada> temporadas = [];
  bool cargando = false;
  String? error;
  DateTime? _cargadoEn;
  DateTime? _desde;
  DateTime? _hasta;
  List<Lugar>? _lugares;

  static const diasAtras = 30;
  static const diasAdelante = 120;

  DateTime? get desdeCargado => _desde;
  DateTime? get hastaCargado => _hasta;

  Future<void> cargar({bool forzar = false}) async {
    if (cargando) return;
    if (!forzar && _cargadoEn != null && DateTime.now().difference(_cargadoEn!) < const Duration(minutes: 2)) return;
    final hoy = Fechas.hoy();
    final desde = _desde ?? hoy.subtract(const Duration(days: diasAtras));
    final hasta = _hasta ?? hoy.add(const Duration(days: diasAdelante));
    if (forzar) _cuota = null;
    _cargarCuota();
    await _traer(desde, hasta, reemplazar: true);
  }

  // ─── ¿Puede responder "¿Vas a ir?"? (mismas reglas que la web) ─────────

    Cuota? _cuota;
  bool _cargandoCuota = false;

    @visibleForTesting
  set cuotaParaPruebas(Cuota c) => _cuota = c;

  /// Reservas, cuotas y créditos de la persona (null mientras carga).
  Cuota? get cuota => _cuota;

  /// Vuelve a pedir reservas y cuota (después de reservar, cancelar o reagendar).
  Future<void> recargarCuota() async {
    _cuota = null;
    await _cargarCuota();
    notifyListeners();
  }

  /// Reserva activa de esta clase (Mirlxs, entrenamientos; web:
  /// `_evCardEventoHtml()`).
  Map<String, dynamic>? reservaDe(Evento ev) {
    if (_modo != 'mirlxs' || ev.tipo != 'Entrenamiento') return null;
    for (final r in _cuota?.reservas ?? const <Map<String, dynamic>>[]) {
      if (r['fecha'] == ev.id && r['estado'] != 'Cancelada' && r['estado'] != 'Crédito usado') return r;
    }
    return null;
  }

  Future<void> _cargarCuota() async {
    if (_cuota != null || _cargandoCuota || !sesion.activa) return;
    _cargandoCuota = true;
    try {
      _cuota = await anticipada.cuota();
      notifyListeners();
    } catch (_) {
      // Sin datos de cuota: no se bloquea a nadie por error de red.
    } finally {
      _cargandoCuota = false;
    }
  }

  String get _modo {
    final c = (sesion.datos['categoria'] ?? '').toString().toLowerCase();
    return c.isEmpty ? 'mirlxs' : c;
  }

  bool get _esAdminActivo => sesion.esAdmin && sesion.adminToken != null;

  /// Mirlxs con la cuota al día pueden marcar "Asistiré", pero ya no
  /// "No asistiré" en ese evento (web: `_evRsvpBarraHtml()`).
  bool sinNoAsistire(Evento ev) => _modo == 'mirlxs' && ev.miEstado == EstadoRsvp.asistire;

  /// null si puede responder; si no, el motivo para mostrar. Copia de
  /// `_evRsvpBarraHtml()` de la web (mismo orden de reglas).
  String? motivoSinRespuesta(Evento ev) {
    final ini = ev.inicioUtc;
    if (ev.cancelado) return 'Este evento fue cancelado.';
    if (ev.yaEmpezo) return 'El evento ya empezó; la asistencia la toma un admin.';
    if (ini != null && DateTime.now().toUtc().isAfter(ini.subtract(const Duration(minutes: 10)))) {
      return 'Faltan menos de 10 minutos: ya no se puede cambiar la respuesta.';
    }
    final d = sesion.datos;
    final c = _cuota;
    final exenta = d['exenta_cuota'] == true || d['exenta_cuota'] == 'true';
    if (_modo == 'mirlxs' &&
        !_esAdminActivo &&
        ev.tipo == 'Entrenamiento' &&
        !exenta &&
        c != null &&
        ev.fecha.isAfter(Fechas.hoy()) &&
        !c.mesPagado(ev.fecha.month, ev.fecha.year)) {
      return 'Para responder necesitas tener pagado el mes de ${Fechas.mes(ev.fecha)}.';
    }
    if (ev.tipo == 'Entrenamiento' && (d['necesitaPatines'] == 'Sí' || d['necesitaProtecciones'] == 'Sí')) {
      return 'Como usas equipo del club, tu lugar en los entrenamientos se confirma con la reserva.';
    }
    if (_modo == 'mirlxs' && c != null && !c.alDia) return 'Para responder necesitas tener tu cuota al día.';
    if (c != null && c.tieneReserva(ev.id)) return 'Ya tienes una reserva para este evento.';
    return null;
  }

  /// Garantiza que el mes de [dia] esté cargado (navegación por calendario).
  Future<void> asegurarMes(DateTime dia) => asegurarRango(DateTime(dia.year, dia.month, 1), DateTime(dia.year, dia.month + 1, 0));

  Future<void>? _enCurso;
  DateTime? _pendDesde, _pendHasta;

  /// Amplía lo cargado para cubrir [inicio]–[fin]. Si ya hay una carga en
  /// curso, el pedido se junta con los siguientes y se hace una sola carga
  /// al terminar (así deslizar varios meses seguidos no dispara N cargas).
  Future<void> asegurarRango(DateTime inicio, DateTime fin) async {
    if (_desde != null && _hasta != null && !inicio.isBefore(_desde!) && !fin.isAfter(_hasta!)) return;
    if (_enCurso != null) {
      _pendDesde = _pendDesde == null || inicio.isBefore(_pendDesde!) ? inicio : _pendDesde;
      _pendHasta = _pendHasta == null || fin.isAfter(_pendHasta!) ? fin : _pendHasta;
      await _enCurso;
      final d = _pendDesde, h = _pendHasta;
      if (d == null || h == null) return;
      _pendDesde = _pendHasta = null;
      return asegurarRango(d, h);
    }
    final desde = _desde == null || inicio.isBefore(_desde!) ? inicio : _desde!;
    final hasta = _hasta == null || fin.isAfter(_hasta!) ? fin : _hasta!;
    _enCurso = _traer(desde, hasta, reemplazar: true);
    try {
      await _enCurso;
    } finally {
      _enCurso = null;
    }
  }

  Future<void> _traer(DateTime desde, DateTime hasta, {required bool reemplazar}) async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final d = Fechas.iso(desde), h = Fechas.iso(hasta);
      final resultados = await Future.wait([
        _api.get('getEventosRango', {'desde': d, 'hasta': h}),
        _api.get('getCumpleañosRango', {'desde': d, 'hasta': h}).catchError((_) => <String, dynamic>{}),
        _api
            .restGet('temporadas_descanso?select=id,nombre,fecha_inicio,fecha_fin&fecha_fin=gte.$d&fecha_inicio=lte.$h&order=fecha_inicio.asc')
            .then((l) => <String, dynamic>{'temporadas': l})
            .catchError((_) => <String, dynamic>{}),
      ]);
      temporadas = [
        for (final t in (resultados[2]['temporadas'] as List? ?? const []))
          if (t is Map<String, dynamic>) ?Temporada.desdeFila(t),
      ];
      final yo = sesion.nombre ?? '';
      eventos = (resultados[0]['eventos'] as List? ?? const []).map((e) => Evento.desdeJson(e as Map<String, dynamic>, yo)).toList()
        ..sort((a, b) {
          final c = a.fecha.compareTo(b.fecha);
          return c != 0 ? c : a.horaInicio.compareTo(b.horaInicio);
        });
      cumples = (resultados[1]['cumpleanos'] as List? ?? const []).map((c) => Cumple.desdeJson(c as Map<String, dynamic>)).toList();
      _desde = desde;
      _hasta = hasta;
      _cargadoEn = DateTime.now();
      // Asistencia anticipada: se aplica sola al cargar, igual que la web.
      anticipada.reconciliar(eventos).then((cambio) {
        if (cambio) notifyListeners();
      });
    } catch (e) {
      error = e is ApiException ? e.message : 'No se pudieron cargar los eventos. Revisa tu conexión.';
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  Evento? porId(String id) {
    for (final e in eventos) {
      if (e.id == id) return e;
    }
    return null;
  }

  /// Guarda la asistencia de forma optimista; si falla, revierte y lanza.
  Future<void> marcar(Evento ev, EstadoRsvp estado) async {
    final anterior = ev.miEstado;
    if (anterior == estado) return;
    ev.miEstado = estado;
    _reemplazarMiRsvp(ev, estado);
    notifyListeners();
    try {
      final res = await _api.post('marcarAsistenciaUsuario', {'nombre': sesion.nombre, 'idEvento': ev.id, 'estado': estado.valor});
      if (res['exito'] == false) throw ApiException((res['error'] ?? 'No se pudo guardar tu asistencia.').toString());
      _api
          .post('notificarCambioAsistencia', {'idEvento': ev.id, 'estadoNuevo': estado.valor, 'estadoAnterior': anterior?.valor ?? ''})
          .catchError((_) => <String, dynamic>{});
    } catch (e) {
      ev.miEstado = anterior;
      _reemplazarMiRsvp(ev, anterior);
      notifyListeners();
      rethrow;
    }
  }

  // ─── Solo admins ────────────────────────────────────────────────────────

  String get _adminToken {
    final t = sesion.adminToken;
    if (t == null) throw ApiException('Esta acción es solo para admins.');
    return t;
  }

  /// Miembros activos sin respuesta (mismo filtro que la web: ni 'Ausente'
  /// ni 30+ días sin una asistencia real).
  Future<List<Persona>> sinRespuesta(Evento ev) async {
    final res = await _api.get('adminBuscarPersonasParaEvento', {'adminToken': _adminToken, 'idEvento': ev.id});
    final respondieron = ev.rsvps.map((r) => r.persona.username.trim().toUpperCase()).toSet();
    final hoy = DateTime.now();
    final out = <Persona>[];
    for (final p in (res['personas'] as List? ?? const [])) {
      final m = p as Map<String, dynamic>;
      final nombre = (m['nombre'] ?? '').toString();
      if (respondieron.contains(nombre.trim().toUpperCase())) continue;
      if (m['estadoMiembro'] == 'Ausente') continue;
      final ultima = DateTime.tryParse((m['ultimaAsistencia'] ?? '').toString());
      if (ultima == null || hoy.difference(ultima).inDays >= 30) continue;
      out.add(Persona(username: nombre, nombreDerby: (m['nombreDerby'] ?? '').toString(), fotoPerfil: (m['fotoPerfil'] ?? '').toString()));
    }
    out.sort((a, b) => a.nombreMostrar.toLowerCase().compareTo(b.nombreMostrar.toLowerCase()));
    return out;
  }

  Future<List<Lugar>> lugares() async {
    if (_lugares != null) return _lugares!;
    final filas = await _api.restGet('venues?select=lugar,google_maps,tipo_icono&order=lugar.asc');
    final vistos = <String>{};
    _lugares = [
      for (final f in filas)
        if (vistos.add(((f as Map)['lugar'] ?? '').toString()) && (f['lugar'] ?? '').toString().isNotEmpty)
          Lugar(nombre: f['lugar'].toString(), mapsUrl: (f['google_maps'] ?? '').toString(), tipo: (f['tipo_icono'] ?? '').toString()),
    ];
    return _lugares!;
  }

  /// Edita lugar/horario/descripción. Mismo mecanismo que la web
  /// (`_evAdminEditarEvento()`): PATCH directo a `asistencias` (y a `venues`
  /// si es "desde este en adelante"), verificación del guardado y aviso al equipo.
  Future<void> editar(
    Evento ev, {
    String? lugar,
    String? horaInicio,
    String? horaFin,
    String? descripcion,
    required AlcanceEdicion alcance,
    DateTime? hasta,
  }) async {
    final token = _adminToken;
    final upd = <String, Object?>{};
    if (lugar != null) upd['donde'] = lugar;
    if (horaInicio != null) upd['inicia'] = horaInicio;
    if (horaFin != null) upd['termina'] = horaFin;
    if (descripcion != null) upd['info_adicional'] = descripcion;
    if (upd.isEmpty) return;
    Lugar? lugarNuevo;
    if (lugar != null) {
      for (final l in await lugares()) {
        if (l.nombre == lugar) lugarNuevo = l;
      }
      if (lugarNuevo != null) {
        upd['google_maps'] = lugarNuevo.mapsUrl.isEmpty ? null : lugarNuevo.mapsUrl;
        if (lugarNuevo.tipo.isNotEmpty) upd['tipo_evento'] = lugarNuevo.tipo;
      }
    }
    final id = Uri.encodeComponent(ev.id);
    if (alcance == AlcanceEdicion.individual) {
      await _api.restPatch('asistencias?id_evento=eq.$id', {...upd, 'es_excepcion': true});
    } else {
      final filas = await _api.restGet('asistencias?id_evento=eq.$id&select=id_regla&limit=1');
      final idRegla = filas.isEmpty ? null : (filas.first as Map)['id_regla'];
      if (idRegla == null) throw ApiException('Este evento no es recurrente: edítalo como "Solo este evento".');
      final regla = Uri.encodeComponent(idRegla.toString());
      final desde = Fechas.iso(ev.fecha);
      final filtro = alcance == AlcanceEdicion.periodo ? '&fecha=gte.$desde&fecha=lte.${Fechas.iso(hasta!)}' : '&fecha=gte.$desde';
      await _api.restPatch('asistencias?id_regla=eq.$regla$filtro', {...upd, 'es_excepcion': true});
      if (alcance == AlcanceEdicion.desdeAqui) {
        final patchLugar = <String, Object?>{};
        if (horaInicio != null) patchLugar['inicia'] = horaInicio;
        if (lugar != null) patchLugar['lugar'] = lugar;
        if (lugarNuevo != null) {
          patchLugar['google_maps'] = lugarNuevo.mapsUrl.isEmpty ? null : lugarNuevo.mapsUrl;
          if (lugarNuevo.tipo.isNotEmpty) patchLugar['tipo_icono'] = lugarNuevo.tipo;
        }
        if (patchLugar.isNotEmpty) await _api.restPatch('venues?id=eq.$regla', patchLugar);
      }
    }
    // Verificación: relee el evento y confirma que quedó guardado.
    final campos = upd.keys.where((k) => k != 'google_maps' && k != 'tipo_evento').toList();
    final fila = await _api.restGet('asistencias?id_evento=eq.$id&select=${campos.join(',')}&limit=1');
    if (fila.isEmpty) throw ApiException('No se encontró el evento tras guardar.');
    final guardado = fila.first as Map;
    for (final c in campos) {
      final esperado = upd[c]?.toString() ?? '';
      final real = guardado[c]?.toString() ?? '';
      final ok = (c == 'inicia' || c == 'termina') ? real.padRight(5).substring(0, 5) == esperado.padRight(5).substring(0, 5) : real == esperado;
      if (!ok) throw ApiException('Los cambios no se guardaron: el evento sigue con los valores anteriores.');
    }
    _api
        .get('pushEventoEditado', {
          'adminToken': token,
          'idEvento': ev.id,
          'antesLugar': ev.lugar,
          'antesHoraInicio': ev.horaInicio,
          'antesHoraFin': ev.horaFin,
        })
        .catchError((_) => <String, dynamic>{});
    await cargar(forzar: true);
  }

  // ─── Tomar asistencia (admins) ──────────────────────────────────────────

  List<MiembroRoster>? _roster;

  /// Equipo completo para tomar asistencia (`adminGetRosterEquipo`, igual
  /// que la web): activos e inactivos (30+ días sin asistencia real).
  Future<List<MiembroRoster>> roster({bool forzar = false}) async {
    if (_roster != null && !forzar) return _roster!;
    final res = await _api.get('adminGetRosterEquipo', {'adminToken': _adminToken});
    final hoy = DateTime.now();
    _roster = [
      for (final p in (res['personas'] as List? ?? const []))
        if (p is Map<String, dynamic>)
          MiembroRoster(
            persona: Persona(
              username: (p['nombre'] ?? '').toString(),
              nombreDerby: (p['nombreDerby'] ?? '').toString(),
              fotoPerfil: (p['fotoPerfil'] ?? '').toString(),
            ),
            inactivo: () {
              final u = DateTime.tryParse((p['ultimaAsistencia'] ?? '').toString());
              return u != null && hoy.difference(u).inDays >= 30;
            }(),
          ),
    ]..sort((a, b) => a.persona.nombreMostrar.toLowerCase().compareTo(b.persona.nombreMostrar.toLowerCase()));
    return _roster!;
  }

  /// Marca (o quita, con null) la asistencia real de una persona. Optimista:
  /// si el servidor falla, vuelve atrás y lanza (`_evMarcarAsistenciaAdmin()`).
  Future<void> marcarReal(Evento ev, Persona persona, EstadoReal? estado) async {
    final token = _adminToken;
    final clave = persona.username.trim().toUpperCase();
    final anterior = List<AsistenciaReal>.of(ev.asistentes);
    ev.asistentes.removeWhere((a) => a.persona.username.trim().toUpperCase() == clave);
    if (estado != null) ev.asistentes.add(AsistenciaReal(persona: persona, estado: estado));
    notifyListeners();
    try {
      final res = await _api.post('adminMarcarAsistencia', {
        'adminToken': token,
        'idEvento': ev.id,
        'nombre': persona.username,
        'estado': estado?.valor ?? 'Ninguno',
      });
      if (res['exito'] == false) throw ApiException((res['error'] ?? 'No se pudo guardar la asistencia.').toString());
    } catch (e) {
      ev.asistentes
        ..clear()
        ..addAll(anterior);
      notifyListeners();
      rethrow;
    }
  }

  // ─── Temporadas de descanso y lugares (admins) ──────────────────────────

  /// Crea o edita una temporada: el servidor elimina los eventos de esas
  /// fechas y avisa al equipo. Devuelve cuántos eventos se eliminaron.
  Future<int> guardarDescanso({String? id, required String nombre, required DateTime desde, required DateTime hasta}) async {
    final res = await _api.post('adminGuardarTemporadaDescanso', {
      'adminToken': _adminToken,
      'id': id ?? '',
      'nombre': nombre,
      'desde': Fechas.iso(desde),
      'hasta': Fechas.iso(hasta),
    });
    if (res['exito'] != true) throw ApiException((res['error'] ?? 'No se pudo guardar la temporada.').toString());
    await cargar(forzar: true);
    return (res['eliminados'] as num?)?.toInt() ?? 0;
  }

  /// Borra una temporada: los eventos que había eliminado vuelven.
  Future<void> eliminarDescanso(Temporada t) async {
    final res = await _api.post('adminEliminarTemporadaDescanso', {'adminToken': _adminToken, 'id': t.id});
    if (res['exito'] != true) throw ApiException((res['error'] ?? 'No se pudo eliminar la temporada.').toString());
    await cargar(forzar: true);
  }

  /// Nuevo lugar (como `_evLugarGuardar()` de la web): queda sin horario
  /// hasta que se use para crear un evento.
  Future<Map<String, dynamic>> crearLugar({required String nombre, required String mapsUrl, required String tipo, String? video}) async {
    _adminToken;
    final fila = await _api.restPostDevolver('venues', {
      'lugar': nombre.trim(),
      'google_maps': mapsUrl.trim(),
      'video_instructivo': (video ?? '').trim().isEmpty ? null : video!.trim(),
      'tipo_icono': tipo,
      'requiere_reserva': tipo == 'Entrenamiento',
      'tipo': null,
    });
    _lugares = null;
    return fila;
  }

  /// Venues completos (para crear eventos: se copian nombre, mapa, etc.).
  Future<List<Map<String, dynamic>>> venues() async {
    final filas = await _api.restGet('venues?select=*&order=lugar.asc');
    return filas.whereType<Map<String, dynamic>>().where((f) => (f['lugar'] ?? '').toString().trim().isNotEmpty).toList();
  }

  /// Crea un evento (único o recurrente). Mismo mecanismo que la web
  /// (`_evCrearGuardar()`): una fila NUEVA en `venues` con la identidad del
  /// lugar elegido + la recurrencia, después se regeneran las asistencias y
  /// se avisa al equipo. Devuelve la fecha del primer evento creado.
  Future<DateTime?> crear({
    required Map<String, dynamic> venue,
    required String tipoEvento,
    required String descripcion,
    required String tipoRecurrencia, // 'unico' | 'dias_semana' | 'cada_tantos'
    List<int> dias = const [],
    int? frecuencia,
    String? unidad,
    DateTime? fecha,
    required String horaInicio,
    String? horaFin,
  }) async {
    final token = _adminToken;
    final fila = <String, Object?>{
      'lugar': venue['lugar'],
      'google_maps': venue['google_maps'],
      'video_instructivo': venue['video_instructivo'],
      'tipo_icono': tipoEvento,
      'requiere_reserva': venue['requiere_reserva'] != false,
      'info_adicional': descripcion.trim().isEmpty ? null : descripcion.trim(),
      'tipo': tipoRecurrencia,
      'inicia': horaInicio,
      'finaliza': horaFin,
    };
    if (tipoRecurrencia == 'dias_semana') {
      fila['dias'] = ([...dias]..sort()).toString();
    } else {
      fila['fecha_referencia'] = Fechas.iso(fecha!);
      if (tipoRecurrencia == 'cada_tantos') {
        fila['frecuencia'] = frecuencia;
        fila['unidad'] = unidad;
      }
    }
    // Lugar recién creado sin horario: se completa esa misma fila en vez de
    // dejarla huérfana (mismo criterio que la web, `esVenuePlaceholderRecienCreado`).
    if (venue['tipo'] == null && venue['id'] != null) {
      await _api.restPatch('venues?id=eq.${Uri.encodeComponent(venue['id'].toString())}', fila);
    } else {
      await _api.restPost('venues', fila);
    }
    try {
      await _api.get('adminRegenerarVentanaAsistencias', {'adminToken': token});
    } catch (_) {
      // El cron diario también regenera la ventana.
    }
    DateTime? primera;
    if (tipoRecurrencia == 'dias_semana') {
      final hoy = Fechas.hoy();
      for (var i = 0; i < 7 && primera == null; i++) {
        final c = hoy.add(Duration(days: i));
        if (dias.contains(c.weekday)) primera = c;
      }
    } else {
      primera = fecha;
    }
    if (primera != null) {
      _api
          .get('pushEventoCreado', {'adminToken': token, 'tipo': tipoEvento, 'fecha': Fechas.iso(primera), 'hora': horaInicio, 'lugar': venue['lugar']})
          .catchError((_) => <String, dynamic>{});
    }
    _lugares = null;
    await cargar(forzar: true);
    return primera;
  }

  /// Cancela un evento: mismas acciones que la web (`_evCancelarEvento()`).
  Future<void> cancelar(Evento ev) async {
    final token = _adminToken;
    final res = await _api.get('adminCancelarEvento', {'adminToken': token, 'idEvento': ev.id});
    if (res['exito'] == false) throw ApiException((res['error'] ?? 'No se pudo cancelar el evento.').toString());
    if (!ev.finalizado) {
      _api
          .get('pushEventoCancelado', {'adminToken': token, 'tipo': ev.tipo, 'fecha': Fechas.iso(ev.fecha), 'hora': ev.horaInicio, 'lugar': ev.lugar})
          .catchError((_) => <String, dynamic>{});
    }
    await cargar(forzar: true);
  }

  Future<void> eliminar(Evento ev) async {
    final res = await _api.get('adminBorrarEvento', {'adminToken': _adminToken, 'idEvento': ev.id});
    if (res['exito'] == false) throw ApiException((res['error'] ?? 'Este evento no pudo ser eliminado.').toString());
    eventos.removeWhere((e) => e.id == ev.id);
    notifyListeners();
  }

  void _reemplazarMiRsvp(Evento ev, EstadoRsvp? estado) {
    final yo = (sesion.nombre ?? '').trim().toLowerCase();
    ev.rsvps.removeWhere((r) => r.persona.username.trim().toLowerCase() == yo);
    if (estado != null) {
      ev.rsvps.add(
        Rsvp(
          persona: Persona(username: sesion.nombre ?? '', nombreDerby: sesion.nombreDerby, fotoPerfil: sesion.fotoPerfil),
          estado: estado,
        ),
      );
    }
  }
}
