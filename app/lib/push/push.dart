import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;

import '../core/api.dart';
import '../core/tema.dart';

// firebase_messaging 17 marca getToken/onTokenRefresh/deleteToken como
// obsoletos a favor de register()/onRegistered ("direct-send" con el ID de
// instalación). Se mantiene el token clásico a propósito: es el formato que
// usa el backend con la API HTTP v1 (`message.token`, ver _enviarFcm()).
// Revisar al migrar el backend a direct-send.
// ignore_for_file: deprecated_member_use

/// Lo que pide abrir una notificación tocada: un evento y, opcionalmente,
/// una acción (`cancelar` = abrir la confirmación de cancelar, solo admins).
class AperturaPush {
  const AperturaPush({required this.eventoId, this.accion});
  final String eventoId;
  final String? accion;
}

/// Mensaje de FCM recibido con la app cerrada o en segundo plano. Corre en
/// un isolate aparte: inicializa lo mínimo y muestra la notificación.
@pragma('vm:entry-point')
Future<void> manejarMensajeEnSegundoPlano(RemoteMessage mensaje) async {
  await Firebase.initializeApp();
  await Push.iniciarPlugin();
  await Push.mostrar(mensaje.data);
}

/// Botón de una notificación tocado con la app cerrada (Asistiré / No
/// asistiré): guarda la respuesta sin abrir la app, igual que la web.
@pragma('vm:entry-point')
Future<void> respuestaEnSegundoPlano(NotificationResponse r) async {
  await Push.procesarBoton(r);
}

/// Notificaciones nativas (Firebase Cloud Messaging + notificaciones
/// locales). El backend manda mensajes SOLO de datos (titulo, cuerpo,
/// evento_id, token_accion, botones); la app arma la notificación con sus
/// botones. Ver `_enviarFcm()` en supabase/functions/api/index.ts.
class Push {
  static final _notis = FlutterLocalNotificationsPlugin();
  static final _aperturas = StreamController<AperturaPush>.broadcast();
  static Stream<AperturaPush> get aperturas => _aperturas.stream;
  static AperturaPush? aperturaInicial;

  static const _canal = AndroidNotificationChannel(
    'avisos_equipo',
    'Avisos del equipo',
    description: 'Eventos, asistencia, cumpleaños y avisos de Pivot.',
    importance: Importance.high,
  );

  static bool _pluginListo = false;

  static Future<void> iniciarPlugin() async {
    if (_pluginListo) return;
    await _notis.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('@drawable/ic_notificacion')),
      onDidReceiveNotificationResponse: _alTocar,
      onDidReceiveBackgroundNotificationResponse: respuestaEnSegundoPlano,
    );
    await _notis.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(_canal);
    _pluginListo = true;
  }

  /// true cuando Firebase y el plugin quedaron listos; si no, todo lo de
  /// notificaciones se omite sin afectar al resto de la app.
  static bool disponible = false;

  /// Arranque desde main(), DESPUÉS de dibujar la interfaz: nunca lanza ni
  /// bloquea (timeout de 15 s).
  static Future<void> arrancarSeguro() async {
    try {
      await Firebase.initializeApp().timeout(const Duration(seconds: 15));
      await iniciar().timeout(const Duration(seconds: 15));
      disponible = true;
      final inicial = aperturaInicial;
      if (inicial != null) _aperturas.add(inicial);
      _listo.complete();
    } catch (e) {
      debugPrint('Notificaciones no disponibles: $e');
      if (!_listo.isCompleted) _listo.complete();
    }
  }

  static final _listo = Completer<void>();

  /// Arranque en primer plano: plugin, mensaje en segundo plano y la
  /// notificación que abrió la app en frío, si la hubo.
  static Future<void> iniciar() async {
    FirebaseMessaging.onBackgroundMessage(manejarMensajeEnSegundoPlano);
    await iniciarPlugin();
    FirebaseMessaging.onMessage.listen((m) => mostrar(m.data));
    final lanzamiento = await _notis.getNotificationAppLaunchDetails();
    final r = lanzamiento?.notificationResponse;
    if (lanzamiento?.didNotificationLaunchApp == true && r != null) {
      aperturaInicial = _aperturaDe(r);
    }
  }

  /// Con sesión activa: pide permiso (Android 13+) y registra el token en
  /// el backend; lo vuelve a registrar si Firebase lo renueva.
  static Future<void> registrar(Api api) async {
    await _listo.future;
    if (!disponible) return;
    try {
      final fm = FirebaseMessaging.instance;
      await fm.requestPermission();
      final token = await fm.getToken();
      if (token != null) await _enviarToken(api, token);
      fm.onTokenRefresh.listen((t) => _enviarToken(api, t));
    } catch (e) {
      debugPrint('No se pudo activar las notificaciones: $e');
    }
  }

  static Future<void> desregistrar(Api api) async {
    if (!disponible) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await api.post('eliminarDispositivoPush', {'fcmToken': token});
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
  }

  static Future<void> _enviarToken(Api api, String token) async {
    try {
      await api.post('registrarDispositivoPush', {'fcmToken': token});
    } catch (e) {
      debugPrint('No se pudo registrar el dispositivo: $e');
    }
  }

  static Future<void> mostrar(Map<String, dynamic> data) async {
    final titulo = (data['titulo'] ?? '').toString();
    final cuerpo = (data['cuerpo'] ?? '').toString();
    if (titulo.isEmpty && cuerpo.isEmpty) return;
    final eventoId = (data['evento_id'] ?? '').toString();
    final botones = <AndroidNotificationAction>[];
    try {
      for (final b in (jsonDecode((data['botones'] ?? '[]').toString()) as List)) {
        final id = (b['id'] ?? '').toString();
        final texto = (b['texto'] ?? '').toString();
        if (id.isEmpty || texto.isEmpty) continue;
        // Asistiré / No asistiré se guardan sin abrir la app; "cancelar"
        // abre la app en la confirmación (nunca cancela sola).
        final abreApp = id == 'cancelar';
        botones.add(AndroidNotificationAction(id, texto, showsUserInterface: abreApp, cancelNotification: true));
      }
    } catch (_) {}
    final payload = jsonEncode({'evento_id': eventoId, 'token_accion': data['token_accion'] ?? ''});
    await _notis.show(
      id: '${data['tipo']}|$eventoId|$titulo'.hashCode & 0x7fffffff,
      title: titulo,
      body: cuerpo,
      payload: payload,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _canal.id,
          _canal.name,
          channelDescription: _canal.description,
          importance: Importance.high,
          priority: Priority.high,
          color: PivotPaleta.claro.marca,
          styleInformation: BigTextStyleInformation(cuerpo),
          actions: botones,
        ),
      ),
    );
  }

  static Future<void> procesarBoton(NotificationResponse r) async {
    final accion = r.actionId;
    if (accion != 'asistire' && accion != 'no-asistire') return;
    Map<String, dynamic> p = const {};
    try {
      p = jsonDecode(r.payload ?? '{}') as Map<String, dynamic>;
    } catch (_) {}
    final token = (p['token_accion'] ?? '').toString();
    final eventoId = (p['evento_id'] ?? '').toString();
    if (token.isEmpty || eventoId.isEmpty) return;
    try {
      await http.post(
        Uri.parse(ApiConfig.recordAttendance),
        headers: {'Content-Type': 'application/json', 'apikey': ApiConfig.anonKey, 'Authorization': 'Bearer ${ApiConfig.anonKey}'},
        body: jsonEncode({'token': token, 'action': accion == 'asistire' ? 'asistire' : 'no_asistire', 'evento_id': eventoId}),
      );
    } catch (_) {
      // Sin conexión: la persona puede responder desde la app después.
    }
  }

  static void _alTocar(NotificationResponse r) {
    if (r.actionId == 'asistire' || r.actionId == 'no-asistire') {
      procesarBoton(r);
      return;
    }
    final a = _aperturaDe(r);
    if (a != null) _aperturas.add(a);
  }

  static AperturaPush? _aperturaDe(NotificationResponse r) {
    try {
      final p = jsonDecode(r.payload ?? '{}') as Map<String, dynamic>;
      final id = (p['evento_id'] ?? '').toString();
      if (id.isEmpty) return null;
      return AperturaPush(eventoId: id, accion: r.actionId == 'cancelar' ? 'cancelar' : null);
    } catch (_) {
      return null;
    }
  }
}
