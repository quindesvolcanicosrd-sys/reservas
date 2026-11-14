import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api.dart';
import '../sesion/sesion.dart';

/// Tipos de pedido que esperan a un Pivot.
enum TipoPedido { reserva, rectificacion, excepcion, lesion, tarea, prestamo, equipo }

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

/// Un pedido propio y cómo quedó (`getMiBandeja`).
class MiPedido {
  MiPedido(this.m);
  final Map<String, dynamic> m;
  String get tipo => '${m['tipo']}';
  String get titulo => '${m['titulo'] ?? ''}';
  String get detalle => '${m['detalle'] ?? ''}';
  String get estado => '${m['estado'] ?? 'pendiente'}';
  DateTime? get fecha => DateTime.tryParse('${m['fecha'] ?? ''}');
}

/// Ajuste que la app recomienda completar.
class Recomendacion {
  Recomendacion(this.m);
  final Map<String, dynamic> m;
  String get clave => '${m['clave']}';
  String get titulo => '${m['titulo'] ?? ''}';
  String get texto => '${m['texto'] ?? ''}';
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

  // Bandeja de cada persona (Victor, 2026-11-13): sus pedidos y lo que la
  // app recomienda. La campana suena con lo nuevo desde la última vez que
  // abrió la Bandeja (fecha guardada en el teléfono, solo como comodidad).
  List<MiPedido> misPedidos = [];
  List<Recomendacion> recomendaciones = [];
  DateTime? _ultimaVista;
  Set<String> _recomVistas = {};
  bool _cargandoMia = false;

  bool get hayNovedades {
    final u = _ultimaVista;
    if (u == null) return misPedidos.isNotEmpty || pedidos.isNotEmpty || recomendaciones.isNotEmpty;
    final nuevoMio = misPedidos.any((x) => x.estado != 'pendiente' && (x.fecha?.isAfter(u) ?? false));
    final nuevoPivot = pedidos.any((x) => (DateTime.tryParse('${x.m['creada'] ?? x.m['enviada'] ?? ''}')?.isAfter(u) ?? false));
    final recomNueva = recomendaciones.any((r) => !_recomVistas.contains(r.clave));
    return nuevoMio || nuevoPivot || recomNueva;
  }

  Future<void> cargarMia() async {
    if (_cargandoMia) return;
    _cargandoMia = true;
    try {
      try {
        final pr = await SharedPreferences.getInstance();
        _ultimaVista = DateTime.tryParse(pr.getString('bandeja.vista.${sesion.nombre}') ?? '');
        _recomVistas = (pr.getStringList('bandeja.recom.${sesion.nombre}') ?? const []).toSet();
      } catch (_) {}
      final r = await _api.get('getMiBandeja', {});
      if (r['exito'] != false) {
        misPedidos = [
          for (final x in (r['solicitudes'] as List? ?? const []))
            if (x is Map<String, dynamic>) MiPedido(x),
        ];
        recomendaciones = [
          for (final x in (r['recomendaciones'] as List? ?? const []))
            if (x is Map<String, dynamic>) Recomendacion(x),
        ];
      }
    } catch (_) {
      // La Bandeja propia es secundaria: si falla, no se muestra la campana.
    } finally {
      _cargandoMia = false;
      notifyListeners();
    }
  }

  /// Al abrir la Bandeja: lo de ahora queda visto y la campana vuelve a ser bandeja.
  /// Vino y nunca se confirmó el pago: la reserva se cierra y queda como deuda
  /// que paga con su próxima reserva (Victor, 2026-11-14).
  Future<void> pasarADeuda(Pedido p) async {
    final r = await _api.post('adminDeudaReserva', {'adminToken': sesion.adminToken, 'id': '${p.m['id']}'});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo pasar a deuda.'}');
    pedidos = [...pedidos]..remove(p);
    notifyListeners();
  }

  /// Le pide el comprobante a la persona con una notificación (sin WhatsApp).
  Future<void> pedirComprobante(Pedido p) async {
    final r = await _api.post('adminPedirComprobante', {'adminToken': sesion.adminToken, 'id': '${p.m['id']}'});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo avisar.'}');
    p.m['comprobanteAvisos'] = ((p.m['comprobanteAvisos'] as num?) ?? 0) + 1;
    notifyListeners();
  }

  /// Cancela un pedido propio que sigue pendiente (Victor, 2026-11-14).
  Future<void> cancelarMio(MiPedido x) async {
    final r = await _api.post('cancelarMiSolicitud', {'tipo': x.tipo, 'id': '${x.m['id']}'});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cancelar.'}');
    await cargarMia();
  }

  Future<void> marcarVista() async {
    _ultimaVista = DateTime.now();
    _recomVistas = {for (final r in recomendaciones) r.clave};
    notifyListeners();
    try {
      final pr = await SharedPreferences.getInstance();
      await pr.setString('bandeja.vista.${sesion.nombre}', _ultimaVista!.toIso8601String());
      await pr.setStringList('bandeja.recom.${sesion.nombre}', _recomVistas.toList());
    } catch (_) {}
  }

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
      ...lista('cambiosEquipo', TipoPedido.equipo),
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

  /// Cambia duración o efecto de una excepción ya aprobada (se avisa a la persona).
  Future<void> editarExcepcion(ExcepcionVigente e, Map<String, Object?> cambios) async {
    final r = await _api.post('adminSetEstadoExcepcion', {'adminToken': sesion.adminToken, 'id': e.id, 'estado': 'aprobada', 'editar': true, ...cambios});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
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
        TipoPedido.reserva => await _api.post('adminSetEstadoReserva', {
          'adminToken': token,
          'id': p.id,
          'estado': aprobar ? 'Confirmada' : 'Cancelada',
          ...extra,
        }),
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
        TipoPedido.equipo => await _api.post('adminCambiosEquipo', {'adminToken': token, 'accion': aprobar ? 'aprobar' : 'rechazar', 'id': p.id}),
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
