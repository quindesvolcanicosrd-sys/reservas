import 'dart:convert';

import 'package:http/http.dart' as http;

/// Configuración pública del backend (la misma que usa la web en
/// js/config.js). La anon key de Supabase es pública por diseño: solo
/// satisface el gateway; la autorización real es el token de sesión.
class ApiConfig {
  static const backend = 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/api';
  static const recordAttendance = 'https://uusbnreitoobqssizbfq.supabase.co/functions/v1/record-attendance';
  static const anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1c2JucmVpdG9vYnFzc2l6YmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDg2NDgsImV4cCI6MjEwMTYyNDY0OH0.1LkHIpmhaA8pY_BKFGMiKK4VHoNzQcVAX05DC1BV4Wk';

  /// Client ID web de Google (mismo GOOGLE_CLIENT_ID que valida el backend
  /// en `_verificarGoogleToken()`): el idToken nativo debe tener este `aud`.
  static const googleWebClientId = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';

  static const webAppUrl = 'https://app.quindesvolcanicos.com';
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Cliente del Edge Function `api`. Mismo contrato que `api()`/`apiPost()`
/// de la web: `action` + parámetros, token de sesión en `token`.
class Api {
  Api({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? token;

  static const _timeout = Duration(seconds: 20);

  Map<String, String> get _headers => {
        'apikey': ApiConfig.anonKey,
        'Authorization': 'Bearer ${ApiConfig.anonKey}',
      };

  Map<String, String> _conToken(Map<String, Object?> params) {
    final out = <String, String>{};
    params.forEach((k, v) {
      if (v != null) out[k] = v.toString();
    });
    if (token != null && !out.containsKey('token')) out['token'] = token!;
    return out;
  }

  Future<Map<String, dynamic>> get(String action, [Map<String, Object?> params = const {}]) async {
    final uri = Uri.parse(ApiConfig.backend).replace(queryParameters: _conToken({'action': action, ...params}));
    final resp = await _client.get(uri, headers: _headers).timeout(_timeout);
    return _decodificar(resp);
  }

  Future<Map<String, dynamic>> post(String action, [Map<String, Object?> params = const {}]) async {
    final resp = await _client
        .post(Uri.parse(ApiConfig.backend),
            headers: {..._headers, 'Content-Type': 'application/x-www-form-urlencoded'},
            body: _conToken({'action': action, ...params}))
        .timeout(_timeout);
    return _decodificar(resp);
  }

  Map<String, dynamic> _decodificar(http.Response resp) {
    Map<String, dynamic> data;
    try {
      data = jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('Respuesta inesperada del servidor (${resp.statusCode}).');
    }
    if (data['error'] is String && (data['error'] as String).isNotEmpty) {
      throw ApiException(data['error'] as String);
    }
    return data;
  }
}
