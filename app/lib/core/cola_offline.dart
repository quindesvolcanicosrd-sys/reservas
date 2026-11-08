import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';

/// Modo sin conexión (Victor, 2026-11-08): las respuestas Asistiré / No
/// asistiré y las marcas de asistencia que se hacen sin señal se guardan en el
/// teléfono y se suben solas cuando vuelve la conexión (al abrir la app, al
/// volver a ella, después de cualquier carga que funcione y cada 30 s
/// mientras quede algo pendiente).
///
/// - Se guarda cifrado (FlutterSecureStorage): lleva el token de admin.
/// - Una acción por `clave` (evento + persona): si se marca dos veces sin
///   señal, solo vale la última, en el orden en que se hicieron.
/// - Si el servidor rechaza una (ej. el evento se canceló), se descarta y se
///   avisa con `rechazos`; si es la red otra vez, se reintenta más tarde.
class ColaOffline extends ChangeNotifier {
  ColaOffline(this.api);
  final Api api;

  static const _llave = 'cola_offline';
  static const _almacen = FlutterSecureStorage();

  final List<Map<String, dynamic>> _items = [];
  bool _cargada = false;
  bool _subiendo = false;
  Timer? _reintento;

  /// Hay acciones esperando conexión.
  int get pendientes => _items.length;

  /// Mensajes de acciones que el servidor rechazó al subirlas (se vacía al leer).
  final List<String> rechazos = [];

  /// La última petición falló por falta de red.
  bool sinConexion = false;

  /// ¿Es un error de red (no de la app)?
  static bool esDeRed(Object e) => e is! ApiException;

  Future<void> cargar() async {
    if (_cargada) return;
    _cargada = true;
    try {
      final raw = await _almacen.read(key: _llave);
      if (raw != null && raw.isNotEmpty) {
        _items.addAll((jsonDecode(raw) as List).whereType<Map<String, dynamic>>());
      }
    } catch (_) {}
    if (_items.isNotEmpty) {
      notifyListeners();
      unawaited(sincronizar());
    }
  }

  Future<void> _guardar() async {
    try {
      await _almacen.write(key: _llave, value: jsonEncode(_items));
    } catch (_) {}
  }

  /// Deja una acción para subir después. Reemplaza la anterior con la misma clave.
  Future<void> encolar(String accion, Map<String, Object?> params, {required String clave, Map<String, Object?>? despues}) async {
    await cargar();
    _items.removeWhere((x) => x['clave'] == clave);
    _items.add({'accion': accion, 'params': params, 'clave': clave, 'despues': ?despues, 'creado': DateTime.now().toIso8601String()});
    sinConexion = true;
    await _guardar();
    notifyListeners();
    _programar();
  }

  /// Valor encolado para una clave (para mostrarlo en la app sin conexión).
  Map<String, dynamic>? pendiente(String clave) {
    for (final x in _items.reversed) {
      if (x['clave'] == clave) return Map<String, dynamic>.from(x['params'] as Map);
    }
    return null;
  }

  void _programar() {
    _reintento?.cancel();
    if (_items.isEmpty) return;
    _reintento = Timer(const Duration(seconds: 30), sincronizar);
  }

  /// Sube lo pendiente en orden. Corta al primer error de red.
  Future<void> sincronizar() async {
    await cargar();
    if (_subiendo || _items.isEmpty) return;
    _subiendo = true;
    var cambio = false;
    try {
      while (_items.isNotEmpty) {
        final x = _items.first;
        try {
          final r = await api.post('${x['accion']}', Map<String, Object?>.from(x['params'] as Map));
          if (r['exito'] == false) rechazos.add('${r['error'] ?? 'Un cambio guardado sin conexión no se pudo subir.'}');
          // Aviso secundario (ej. notificar el cambio de asistencia): sin reintentos.
          final despues = x['despues'];
          if (despues is Map && r['exito'] != false) {
            unawaited(api.post('${despues['accion']}', Map<String, Object?>.from(despues['params'] as Map)).catchError((_) => <String, dynamic>{}));
          }
          _items.removeAt(0);
          cambio = true;
          sinConexion = false;
        } catch (e) {
          if (esDeRed(e)) {
            sinConexion = true;
            break;
          }
          rechazos.add(e.toString());
          _items.removeAt(0);
          cambio = true;
        }
      }
    } finally {
      _subiendo = false;
      await _guardar();
      if (cambio || rechazos.isNotEmpty) subidas++;
      notifyListeners();
      _programar();
    }
  }

  /// Cuenta de tandas subidas (la app recarga cuando cambia).
  int subidas = 0;

  /// Algo funcionó contra el servidor: hay red, se intenta subir lo pendiente.
  void hayConexion() {
    if (sinConexion) {
      sinConexion = false;
      notifyListeners();
    }
    if (_items.isNotEmpty) unawaited(sincronizar());
  }

  @override
  void dispose() {
    _reintento?.cancel();
    super.dispose();
  }
}
