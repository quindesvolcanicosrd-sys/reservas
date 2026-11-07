import 'dart:async';

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

  // ─── Filtros (web `_eqFiltroPeriodo` / `_eqFiltroRoles`) ───────────────
  /// Mes de los stats (null = el actual) o histórico. Pide de nuevo al servidor.
  DateTime? periodoMes;
  bool periodoHistorico = false;

  /// Roles elegidos; filtran la lista sin ir al servidor.
  final Set<String> filtroRoles = {};
  static const rolesCatalogo = ['Jammer', 'Blocker', 'Coach', 'Bench', 'SO', 'NSO', 'No definido'];

  bool get hayFiltros => filtroRoles.isNotEmpty || periodoMes != null || periodoHistorico;

  /// "este mes", "en octubre", "en total" (para textos como "Asistencia en octubre").
  String get periodoCorto {
    if (periodoHistorico) return 'en total';
    final m = periodoMes;
    if (m == null) return 'este mes';
    return 'en ${Fechas.mes(m)}${m.year != Fechas.hoy().year ? ' ${m.year}' : ''}';
  }

  String get periodoTitulo => periodoHistorico ? 'Histórico' : (periodoMes == null ? 'Este mes' : Fechas.mesAnio(periodoMes!));

  bool pasaRoles(Integrante p) {
    if (filtroRoles.isEmpty) return true;
    final r = p.roles.isEmpty ? const ['No definido'] : p.roles;
    return r.any(filtroRoles.contains);
  }

  void alternarRol(String r) {
    filtroRoles.contains(r) ? filtroRoles.remove(r) : filtroRoles.add(r);
    notifyListeners();
  }

  Future<void> cambiarPeriodo({DateTime? mes, bool historico = false}) {
    final hoy = Fechas.hoy();
    periodoHistorico = historico;
    periodoMes = historico || mes == null || (mes.year == hoy.year && mes.month == hoy.month) ? null : DateTime(mes.year, mes.month);
    return cargar(forzar: true);
  }

  Future<void> limpiarFiltros() async {
    filtroRoles.clear();
    if (periodoMes != null || periodoHistorico) {
      await cambiarPeriodo();
    } else {
      notifyListeners();
    }
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
    if (personas != null) scheduleMicrotask(notifyListeners); // barra de carga al cambiar el período
    try {
      final prefs = await SharedPreferences.getInstance();
      favoritos = (prefs.getStringList(_prefFavoritos) ?? const []).toSet();
      final m = periodoMes;
      final r = await _api.get('getEquipo', {
        if (esAdmin) 'adminToken': sesion.adminToken,
        if (periodoHistorico) 'historico': 'true',
        if (!periodoHistorico && m != null) ...{'mesDesde': '${m.month}', 'anioDesde': '${m.year}', 'mesHasta': '${m.month}', 'anioHasta': '${m.year}'},
      });
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

  Future<List<Map<String, dynamic>>> desglose(String username, String concepto) async {
    final r = await _api.get('getDesglosePuntos', {'nombreUsuario': username, 'concepto': concepto});
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

  /// Link de activación de cuenta (web `_eqGenerarInviteLink()`).
  Future<String> linkActivacion(Integrante p) async {
    final r = await _api.post('generarInviteToken', {'adminToken': sesion.adminToken, 'username': p.username});
    if (r['exito'] != true) throw ApiException('${r['error'] ?? 'No se pudo generar el link.'}');
    return 'https://app.quindesvolcanicos.com/activar/?token=${Uri.encodeComponent('${r['token']}')}';
  }
}
