import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../sesion/sesion.dart';

/// Tipos de pedido que esperan a un Pivot.
enum TipoPedido { reserva, rectificacion, excepcion, lesion, tarea, prestamo }

/// Un pedido de la Bandeja de Pivots (`adminBandeja`).
class Pedido {
  Pedido(this.tipo, this.m);
  final TipoPedido tipo;
  final Map<String, dynamic> m;

  String get id => '${m['id'] ?? m['idAsignacion'] ?? m['nombre']}';
  String get nombre => '${m['nombre'] ?? ''}';
  String get nombreMostrar => '${m['nombreMostrar'] ?? nombre}';
  String get foto => '${m['foto'] ?? ''}';
  Map<String, dynamic>? get evento => m['evento'] is Map<String, dynamic> ? m['evento'] as Map<String, dynamic> : null;
  Map<String, dynamic>? get tarea => m['tarea'] is Map<String, dynamic> ? m['tarea'] as Map<String, dynamic> : null;
  DateTime? get fechaEvento => DateTime.tryParse('${evento?['fecha'] ?? m['fechaEvento'] ?? ''}');
}

/// Excepción de cuota aprobada y vigente (panel de Pivots).
class ExcepcionVigente {
  ExcepcionVigente(this.m);
  final Map<String, dynamic> m;
  String get id => '${m['id']}';
  String get nombreMostrar => '${m['nombreMostrar'] ?? m['nombre']}';
  String get foto => '${m['foto'] ?? ''}';
  String get tipo => '${m['tipo']}';
  String get desde => '${m['desde'] ?? ''}';
  String? get hasta => m['hasta'] == null ? null : '${m['hasta']}';
  bool get exenta => m['efecto'] == 'exenta';
  bool get cancelada => m['cancelada'] == true;
}

/// Bandeja de Pivots (etapa 3, Victor 2026-11-12): pagos y reservas,
/// rectificaciones, excepciones de cuota, lesiones y tareas por validar.
/// Se abre desde Calendario; el número va en el ícono.
class BandejaRepo extends ChangeNotifier {
  BandejaRepo._(this.sesion);
  final Sesion sesion;

  static BandejaRepo? _instancia;
  static BandejaRepo de(Sesion s) {
    if (_instancia == null || !identical(_instancia!.sesion, s)) _instancia = BandejaRepo._(s);
    return _instancia!;
  }

  Api get _api => sesion.api;
  bool get esPivot => sesion.esAdmin && sesion.adminToken != null;

  List<Pedido> pedidos = [];
  int get total => pedidos.length;
  bool cargado = false;
  String? error;
  bool _cargando = false;
  bool get cargando => _cargando;

  /// Solo pruebas: datos sin servidor.
  @visibleForTesting
  void usarDatos(Map<String, dynamic> r) => _leer(r);

  void _leer(Map<String, dynamic> r) {
    List<Pedido> lista(String k, TipoPedido t) => [
      for (final x in (r[k] as List? ?? const []))
        if (x is Map<String, dynamic>) Pedido(t, x),
    ];
    pedidos = [
      ...lista('reservas', TipoPedido.reserva),
      ...lista('rectificaciones', TipoPedido.rectificacion),
      ...lista('excepciones', TipoPedido.excepcion),
      ...lista('lesiones', TipoPedido.lesion),
      ...lista('tareas', TipoPedido.tarea),
      ...lista('prestamos', TipoPedido.prestamo),
    ];
    cargado = true;
    error = null;
    notifyListeners();
  }

  Future<void> cargar({bool forzar = false}) async {
    if (!esPivot || _cargando || (cargado && !forzar)) return;
    _cargando = true;
    notifyListeners();
    try {
      final r = await _api.get('adminBandeja', {'adminToken': sesion.adminToken});
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
      _leer(r);
    } catch (e) {
      error = e is ApiException ? e.message : 'No se pudo cargar la bandeja. Revisa tu conexión.';
    } finally {
      _cargando = false;
      notifyListeners();
    }
  }

  Future<List<ExcepcionVigente>> excepcionesVigentes() async {
    final r = await _api.get('adminGetExcepcionesVigentes', {'adminToken': sesion.adminToken});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
    return [
      for (final x in (r['excepciones'] as List? ?? const []))
        if (x is Map<String, dynamic>) ExcepcionVigente(x),
    ];
  }

  Future<void> cancelarExcepcion(ExcepcionVigente e) async {
    final r = await _api.post('adminCancelarExcepcion', {'adminToken': sesion.adminToken, 'id': e.id});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cancelar.'}');
  }

  /// Aprueba o rechaza. Quita el pedido de la lista al instante; si falla,
  /// lo devuelve y lanza el error.
  Future<void> resolver(Pedido p, {required bool aprobar, String nota = '', Map<String, Object?> extra = const {}}) async {
    final i = pedidos.indexOf(p);
    pedidos = [...pedidos]..remove(p);
    notifyListeners();
    final token = sesion.adminToken;
    try {
      final r = switch (p.tipo) {
        TipoPedido.reserva => await _api.post('adminSetEstadoReserva', {'adminToken': token, 'id': p.id, 'estado': aprobar ? 'Confirmada' : 'Cancelada'}),
        TipoPedido.rectificacion => await _api.post('adminSetEstadoRectificacion', {
          'adminToken': token,
          'id': p.id,
          'decision': aprobar ? 'Aprobada' : 'Rechazada',
        }),
        TipoPedido.excepcion => await _api.post('adminSetEstadoExcepcion', {
          'adminToken': token,
          'id': p.id,
          'estado': aprobar ? 'aprobada' : 'rechazada',
          if (nota.trim().isNotEmpty) 'notaAdmin': nota.trim(),
          ...extra,
        }),
        TipoPedido.prestamo => await _api.post('adminPrestamo', {'adminToken': token, 'accion': aprobar ? 'aprobar' : 'rechazar', 'id': p.id, ...extra}),
        TipoPedido.lesion => await _api.post(aprobar ? 'adminAprobarLesion' : 'adminRechazarLesion', {'adminToken': token, 'nombre': p.nombre}),
        TipoPedido.tarea => await _api.post('adminValidarTarea', {
          'adminToken': token,
          'idAsignacion': p.id,
          'accion': aprobar ? 'aprobar' : 'rechazar',
          if (nota.trim().isNotEmpty) 'notaRechazo': nota.trim(),
        }),
      };
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
    } catch (e) {
      pedidos = [...pedidos]..insert(i.clamp(0, pedidos.length), p);
      notifyListeners();
      rethrow;
    }
  }
}
