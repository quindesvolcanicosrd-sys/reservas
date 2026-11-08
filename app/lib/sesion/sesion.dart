import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../core/api.dart';
import '../push/push.dart';

/// Resultado de un intento de inicio de sesión que no terminó en sesión.
class LoginFallido implements Exception {
  LoginFallido(this.mensaje);
  final String mensaje;
  @override
  String toString() => mensaje;
}

/// Sesión de la persona logueada. Mismo modelo que la web: un token de
/// `sessions` (30 días) para las acciones de usuario y, si es admin, un
/// `adminToken` aparte. Se guarda cifrado en el teléfono.
class Sesion extends ChangeNotifier {
  Sesion(this.api);

  final Api api;
  final _almacen = const FlutterSecureStorage();

  String? nombre; // username
  String? adminToken;
  bool esAdmin = false;
  Map<String, dynamic> datos = const {};
  bool cargando = true;

  bool get activa => api.token != null && nombre != null;

  String get nombreDerby => (datos['nombreDerby'] ?? '').toString();
  String get nombreMostrar => nombreDerby.trim().isNotEmpty ? nombreDerby.trim() : (nombre ?? '');
  String get fotoPerfil => (datos['fotoPerfil'] ?? '').toString();

  /// Restaura la sesión guardada (equivalente a `restaurarSesion` de la web).
  Future<void> restaurar() async {
    try {
      final guardado = await _almacen.read(key: 'sesion');
      if (guardado == null) return;
      final s = jsonDecode(guardado) as Map<String, dynamic>;
      api.token = s['token'] as String?;
      nombre = s['nombre'] as String?;
      if (!activa) return;
      final res = await api.get('restaurarSesion');
      if (res['valido'] != true) {
        await cerrar(avisarBackend: false);
        return;
      }
      _aplicar(res);
    } catch (_) {
      // Sin conexión: se conserva lo guardado; los datos se recargan luego.
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  Future<void> conGoogle() async {
    final gs = GoogleSignIn.instance;
    await gs.initialize(serverClientId: ApiConfig.googleWebClientId);
    final GoogleSignInAccount cuenta;
    try {
      cuenta = await gs.authenticate();
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) throw LoginFallido('');
      throw LoginFallido('No se pudo iniciar sesión con Google (${e.code.name}).');
    }
    final idToken = cuenta.authentication.idToken;
    if (idToken == null) throw LoginFallido('Google no devolvió la identidad de la cuenta.');
    final res = await api.post('loginGoogle', {'idToken': idToken});
    if (res['noRegistrado'] == true) {
      await gs.signOut();
      throw LoginFallido('Esta cuenta de Google no está registrada en el equipo. Pide tu enlace de inscripción.');
    }
    if (res['valido'] != true) throw LoginFallido((res['error'] ?? 'No se pudo iniciar sesión.').toString());
    if (res['token'] == null) {
      throw LoginFallido('Esta cuenta es solo de administración. Por ahora úsala desde la web.');
    }
    await _guardar(res);
  }

  /// Inicio con PIN: mismo hash que la web, sha256(pin + '|' + username).
  Future<void> conPin(String identificador, String pin) async {
    final r = await api.get('resolverNombre', {'identificador': identificador.trim()});
    if (r['encontrado'] != true) throw LoginFallido('No encontramos a nadie con ese nombre o correo.');
    final usuario = r['nombre'] as String;
    final hash = sha256.convert(utf8.encode('$pin|$usuario')).toString();
    final res = await api.get('validarPin', {'nombre': usuario, 'pinHash': hash});
    if (res['bloqueado'] == true) throw LoginFallido('Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.');
    if (res['pinNeedsReset'] == true) throw LoginFallido('Tu PIN fue reiniciado. Entra con Google para configurar uno nuevo.');
    if (res['valido'] != true) throw LoginFallido('PIN incorrecto.');
    res['nombre'] = usuario;
    await _guardar(res);
  }

  Future<void> cerrar({bool avisarBackend = true}) async {
    if (avisarBackend && api.token != null) {
      await Push.desregistrar(api);
      try {
        await api.get('cerrarSesion');
      } catch (_) {}
    }
    api.token = null;
    nombre = null;
    adminToken = null;
    esAdmin = false;
    datos = const {};
    await _almacen.delete(key: 'sesion');
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> _guardar(Map<String, dynamic> res) async {
    api.token = res['token'] as String;
    nombre = res['nombre'] as String;
    _aplicar(res);
    await _almacen.write(key: 'sesion', value: jsonEncode({'token': api.token, 'nombre': nombre}));
    cargando = false;
    notifyListeners();
  }

  // ─── Ajustes: guardar datos propios ─────────────────────────────────────
  // Lo guardado se mezcla en `datos` (solo en memoria: nada sensible se
  // escribe en el teléfono).

  Map<String, dynamic> _ok(Map<String, dynamic> r, String error) {
    if (r['exito'] == false || r['error'] != null && r['exito'] != true) throw ApiException('${r['error'] ?? error}');
    return r;
  }

  /// Campos de `actualizarDatosPersona` (lista blanca del servidor).
  Future<void> guardarDatos(Map<String, String> cambios) async {
    _ok(await api.post('actualizarDatosPersona', {'nombre': nombre, 'datos': jsonEncode(cambios)}), 'No se pudo guardar.');
    datos = {...datos, ...cambios};
    notifyListeners();
  }

  /// Patines y protecciones. Devuelve true si pasó de Quindes a Mirlxs.
  Future<bool> guardarEquipamiento({required String patines, required String talla, required String protecciones}) async {
    final r = _ok(
      await api.post('actualizarEquipamientoPersona', {'nombre': nombre, 'necesitaPatines': patines, 'talla': talla, 'necesitaProtecciones': protecciones}),
      'No se pudo guardar tu equipamiento.',
    );
    datos = {
      ...datos,
      'necesitaPatines': patines,
      'talla': talla,
      'necesitaProtecciones': protecciones,
      if (r['categoria'] != null) 'categoria': r['categoria'],
    };
    notifyListeners();
    return r['categoriaCambiada'] == true;
  }

  /// Fecha de nacimiento y qué ve el resto (web `guardarPermisos()`).
  Future<void> guardarPrivacidad({required String fechaNacimiento, required bool fechaPublica, required bool edadPublica}) async {
    final f = fechaPublica ? 'Sí' : 'No', e = edadPublica ? 'Sí' : 'No';
    _ok(
      await api.post('actualizarPerfilGoogle', {'fechaNac': fechaNacimiento, 'guardarFecha': 'si', 'fechaPublica': f, 'edadPublica': e}),
      'No se pudo guardar tu privacidad.',
    );
    datos = {...datos, 'fechaNacimiento': fechaNacimiento, 'fechaPublica': f, 'edadPublica': e, 'permisosConfigurados': true};
    notifyListeners();
  }

  /// Foto de perfil (JPEG ya reducido). Vacío = quitar la foto.
  Future<void> subirFoto(List<int>? jpeg) async {
    final r = _ok(
      await api.post('subirFotoPerfil', {'base64Data': jpeg == null ? '' : 'data:image/jpeg;base64,${base64Encode(jpeg)}'}),
      'No se pudo subir la foto.',
    );
    final url = '${r['url'] ?? ''}';
    // Misma ruta en el servidor: el ?v= evita que se vea la foto anterior en caché.
    datos = {...datos, 'fotoPerfil': url.isEmpty ? '' : '$url?v=${DateTime.now().millisecondsSinceEpoch}'};
    notifyListeners();
  }

  /// PIN de 4 dígitos, mismo hash que la web: sha256(pin + '|' + username).
  Future<void> cambiarPin(String pin) async {
    final hash = sha256.convert(utf8.encode('$pin|$nombre')).toString();
    _ok(await api.post('actualizarPin', {'nombre': nombre, 'pinHash': hash}), 'No se pudo cambiar el PIN.');
  }

  /// Borra los datos personales y cierra la sesión (web `mecConfirmar()`).
  Future<void> eliminarCuenta() async {
    _ok(await api.post('eliminarCuenta'), 'No se pudo eliminar la cuenta.');
    await cerrar(avisarBackend: false);
  }

  void _aplicar(Map<String, dynamic> res) {
    if (res['datos'] is Map<String, dynamic>) datos = res['datos'] as Map<String, dynamic>;
    esAdmin = res['esAdmin'] == true;
    adminToken = res['adminToken'] as String?;
  }
}
