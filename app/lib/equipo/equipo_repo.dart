import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api.dart';
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
    try {
      final prefs = await SharedPreferences.getInstance();
      favoritos = (prefs.getStringList(_prefFavoritos) ?? const []).toSet();
      final r = await _api.get('getEquipo', {if (esAdmin) 'adminToken': sesion.adminToken});
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

  /// Link de activación de cuenta (web `_eqGenerarInviteLink()`).
  Future<String> linkActivacion(Integrante p) async {
    final r = await _api.post('generarInviteToken', {'adminToken': sesion.adminToken, 'username': p.username});
    if (r['exito'] != true) throw ApiException('${r['error'] ?? 'No se pudo generar el link.'}');
    return 'https://app.quindesvolcanicos.com/activar/?token=${Uri.encodeComponent('${r['token']}')}';
  }
}
