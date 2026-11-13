import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api.dart';
import '../core/fechas.dart';
import '../sesion/sesion.dart';
import 'equipo_modelos.dart';

/// Datos de Equipo (getEquipo + favoritos), compartidos por la pestaña
/// Equipo y por el detalle de un evento (tocar un avatar abre la ficha).
class EquipoRepo extends ChangeNotifier {
  EquipoRepo._(this.sesion);
  final Sesion sesion;

  static EquipoRepo? _instancia;
  static EquipoRepo de(Sesion s) {
    if (_instancia == null || !identical(_instancia!.sesion, s)) _instancia = EquipoRepo._(s);
    return _instancia!;
  }

  static const _prefFavoritos = 'equipo.favoritos';

  List<Integrante>? personas;
  Set<String> favoritos = {};
  String? error;
  bool _cargando = false;
  bool get cargando => _cargando;

  // ─── Filtro por rol (web `_eqFiltroRoles`) ─────────────────────────────
  // El período de las stats ya no filtra la home: se elige por persona en su
  // ficha (`enMes`, Victor 2026-11-07).

  /// Roles elegidos; filtran la lista sin ir al servidor.
  final Set<String> filtroRoles = {};

  /// Catálogo de roles de la liga (editable por Pivots, Victor 2026-11-12).
  /// Hasta que llega del servidor, los de roller derby.
  List<String> roles = const ['Jammer', 'Pivot', 'Blocker', 'Bench', 'Coach', 'SO', 'NSO'];

  /// Cuántas personas tienen cada rol.
  Map<String, int> rolesEnUso = const {};

  /// Para filtrar Equipo: el catálogo y "No definido".
  List<String> get rolesCatalogo => [...roles, 'No definido'];

  Future<void> cargarRoles() async {
    try {
      final r = await _api.get('getRolesEquipo', {});
      roles = [for (final x in (r['roles'] as List? ?? const [])) '$x'];
      rolesEnUso = {for (final e in ((r['enUso'] as Map?) ?? const {}).entries) '${e.key}': (e.value as num).toInt()};
      notifyListeners();
    } catch (_) {}
  }

  /// crear (nombre), renombrar (nombre → nuevo), borrar (nombre), ordenar (lista).
  /// Devuelve el error, o null si salió bien.
  Future<String?> cambiarRol(String accion, {String? nombre, String? nuevo, List<String>? lista}) async {
    try {
      final r = await _api.post('adminRolesEquipo', {'adminToken': sesion.adminToken, 'accion': accion, 'nombre': ?nombre, 'nuevo': ?nuevo, 'roles': ?lista});
      if (r['exito'] != true) return '${r['error'] ?? 'No se pudo guardar.'}';
      roles = [for (final x in (r['roles'] as List? ?? const [])) '$x'];
      notifyListeners();
      await cargar(forzar: true); // también trae el catálogo y los conteos
      return null;
    } catch (_) {
      return 'No se pudo guardar. Revisa tu conexión.';
    }
  }

  bool get hayFiltros => filtroRoles.isNotEmpty;

  bool pasaRoles(Integrante p) {
    if (filtroRoles.isEmpty) return true;
    final r = p.roles.isEmpty ? const ['No definido'] : p.roles;
    return r.any(filtroRoles.contains);
  }

  void alternarRol(String r) {
    filtroRoles.contains(r) ? filtroRoles.remove(r) : filtroRoles.add(r);
    notifyListeners();
  }

  void limpiarFiltros() {
    filtroRoles.clear();
    notifyListeners();
  }

  /// Stats de una persona en otro mes (la ficha). El mes actual sale de la
  /// lista ya cargada; los demás se piden una vez y quedan en memoria.
  final Map<String, Future<List<Integrante>>> _porMes = {};

  static Map<String, String> paramsMes(DateTime m) => {'mesDesde': '${m.month}', 'anioDesde': '${m.year}', 'mesHasta': '${m.month}', 'anioHasta': '${m.year}'};

  Future<Integrante?> enMes(String username, DateTime mes) {
    final hoy = Fechas.hoy();
    if (mes.year == hoy.year && mes.month == hoy.month) return Future.value(persona(username));
    final clave = '${mes.year}-${mes.month}';
    final f = _porMes[clave] ??= _api.get('getEquipo', {if (esAdmin) 'adminToken': sesion.adminToken, ...paramsMes(mes)}).then((r) {
      return [
        for (final m in (r['personas'] as List? ?? const []))
          if (m is Map<String, dynamic>) Integrante(m),
      ];
    });
    return f
        .then((l) {
          final u = username.toLowerCase();
          return l.where((x) => x.username.toLowerCase() == u).firstOrNull;
        })
        .catchError((Object e) {
          _porMes.remove(clave);
          throw e;
        });
  }

  bool get esAdmin => sesion.esAdmin && sesion.adminToken != null;
  Api get _api => sesion.api;

  Integrante? persona(String username) {
    final u = username.trim().toLowerCase();
    for (final p in personas ?? const <Integrante>[]) {
      if (p.username.toLowerCase() == u) return p;
    }
    return null;
  }

  bool esYo(Integrante p) => p.username.toLowerCase() == (sesion.nombre ?? '').toLowerCase();

  Future<void> cargar({bool forzar = false}) async {
    if (_cargando || (personas != null && !forzar)) return;
    _cargando = true;
    if (personas != null) scheduleMicrotask(notifyListeners); // barra de carga al recargar
    _porMes.clear();
    try {
      final prefs = await SharedPreferences.getInstance();
      favoritos = (prefs.getStringList(_prefFavoritos) ?? const []).toSet();
      final rolesF = cargarRoles();
      final r = await _api.get('getEquipo', {if (esAdmin) 'adminToken': sesion.adminToken});
      await rolesF;
      personas = [
        for (final m in (r['personas'] as List? ?? const []))
          if (m is Map<String, dynamic>) Integrante(m),
      ];
      error = null;
    } catch (e) {
      error = 'No se pudo cargar el equipo. Revisa tu conexión.';
    } finally {
      _cargando = false;
      notifyListeners();
    }
  }

  Future<void> alternarFavorito(String username) async {
    favoritos.contains(username) ? favoritos.remove(username) : favoritos.add(username);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_prefFavoritos, favoritos.toList());
  }

  /// Ficha de emergencia (solo admins; nunca se guarda).
  /// Solo pruebas: ficha de emergencia sin servidor.
  @visibleForTesting
  Map<String, dynamic>? fichaPrueba;

  Future<(String, Map<String, dynamic>)> fichaEmergencia(String username) async {
    if (fichaPrueba != null) return ('EC', fichaPrueba!);
    final r = await _api.post('adminFichaEmergencia', {'adminToken': sesion.adminToken, 'username': username});
    if (r['exito'] != true) throw ApiException('${r['error'] ?? 'No se pudo abrir la ficha.'}');
    return ('${r['paisEquipo'] ?? 'EC'}', Map<String, dynamic>.from(r['ficha'] as Map));
  }

  Future<List<Map<String, dynamic>>> desglose(String username, String concepto, {DateTime? mes}) async {
    final r = await _api.get('getDesglosePuntos', {'nombreUsuario': username, 'concepto': concepto, if (mes != null) ...paramsMes(mes)});
    return [
      for (final f in (r['filas'] as List? ?? const []))
        if (f is Map<String, dynamic>) f,
    ];
  }

  // ─── Admin ───────────────────────────────────────────────────────────

  Future<void> _admin(String action, Map<String, Object?> params) async {
    final r = await _api.post(action, {'adminToken': sesion.adminToken, ...params});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
    await cargar(forzar: true);
  }

  /// 'auto', 'quinde' o 'mirlxs' (web `_eqCambiarTier()`).
  Future<void> cambiarTier(Integrante p, String modo) => _admin('adminSetTierModo', {'nombre': p.username, 'tierModo': modo});
  Future<void> cambiarPagaCuota(Integrante p, bool paga) => _admin('adminSetExentaCuota', {'nombre': p.username, 'valor': !paga});
  Future<void> cambiarAdmin(Integrante p, bool admin) =>
      _admin(admin ? 'adminAgregarAdmin' : 'adminQuitarAdmin', {'email': p.email, if (admin) 'nombre': p.username});
  Future<void> cambiarEstado(Integrante p, String estado) => _admin('adminSetEstadoMiembro', {'nombre': p.username, 'estadoMiembro': estado});
  Future<void> archivar(Integrante p) => _admin('adminEliminarUsuario', {'nombre': p.username});

  /// Pago de cuota registrado a mano (efectivo, De Una o banco).
  Future<void> registrarPago(Integrante p, {required DateTime mes, required double monto, required String forma, String notas = ''}) =>
      _admin('adminRegistrarPago', {
        'datosJson': jsonEncode({
          'nombre': p.username,
          'mes': mes.month,
          'anio': mes.year,
          'monto': monto,
          'formaPago': forma,
          'tipo': 'mensual',
          'esManual': true,
          'fecha': Fechas.iso(Fechas.hoy()),
          if (notas.trim().isNotEmpty) 'notas': notas.trim(),
        }),
      });

  /// "No paga (mes)": excepción manual de ese mes, queda en su historial.
  Future<void> noPagaMes(Integrante p, DateTime mes, {String notas = ''}) => _admin('guardarExcepcionCuota', {
    'idMiembro': p.username,
    'mes': '${mes.year}-${mes.month.toString().padLeft(2, '0')}',
    'tipo': 'exenta',
    if (notas.trim().isNotEmpty) 'notas': notas.trim(),
  });

  Future<double> precioMensual() async {
    final r = await _api.get('getPreciosClases');
    return double.tryParse('${r['precioMensual'] ?? ''}') ?? 0;
  }

  /// Asistencia fuera de la liga (web `_eqRegistrarAsistExterna()`); recalcula puntos.
  Future<void> registrarAsistenciaExterna(Integrante p, DateTime fecha, String lugar) =>
      _admin('adminRegistrarAsistenciaExterna', {'idJugadora': p.username, 'fecha': Fechas.iso(fecha), 'lugar': lugar.trim()});

  /// Marca "De viaje" entre dos fechas (web `_eqGuardarViaje()`). Devuelve un aviso si lo hay.
  Future<String?> marcarViaje(Integrante p, DateTime desde, DateTime hasta) async {
    final r = await _api.post('adminActualizarEstadoViaje', {
      'adminToken': sesion.adminToken,
      'idJugadora': p.username,
      'viaje_desde': Fechas.iso(desde),
      'viaje_hasta': Fechas.iso(hasta),
    });
    if (r['exito'] != true) throw ApiException('${r['error'] ?? 'No se pudo guardar el viaje.'}');
    await cargar(forzar: true);
    return r['aviso'] as String?;
  }

  Future<void> cancelarViaje(Integrante p) => _admin('adminCancelarViaje', {'idJugadora': p.username});
}
