import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../sesion/sesion.dart';
import 'api.dart';
import 'iconos_marca.dart';
import 'pagos.dart';

/// Ajustes de la liga (`getConfigLiga`, Victor 2026-11-13): canal para
/// escribir a las personas, cómo se resuelven los pedidos de Pivots, país,
/// zona horaria y precios. Se carga una vez por sesión.
class ConfigLiga extends ChangeNotifier {
  ConfigLiga._(this.sesion);
  final Sesion sesion;
  static ConfigLiga? _instancia;
  static ConfigLiga de(Sesion s) {
    if (_instancia == null || !identical(_instancia!.sesion, s)) _instancia = ConfigLiga._(s)..cargar();
    return _instancia!;
  }

  String canal = 'whatsapp';
  String solicitudesPivots = 'otro';
  String pais = 'EC';
  String zonaHoraria = 'America/Guayaquil';
  num? precioPorClase;
  num? precioMensual;
  String logo = '';

  /// Formas de pago (Cobros). Sin configurar, las del club de siempre.
  Map<String, dynamic>? formasPago;
  bool get deunaActiva => (formasPago?['deuna'] as Map?)?['activa'] != false && deunaEnlace.isNotEmpty;
  String get deunaEnlace =>
      '${(formasPago?['deuna'] as Map?)?['enlace'] ?? ''}'.isNotEmpty ? '${formasPago!['deuna']['enlace']}' : (formasPago == null ? Pagos.deuna : '');
  bool get transferenciaActiva => (formasPago?['transferencia'] as Map?)?['activa'] != false;
  String get banco => formasPago == null ? Pagos.banco : '${(formasPago!['transferencia'] as Map?)?['banco'] ?? ''}';
  List<(String, String)> get datosBancarios => formasPago == null
      ? Pagos.cuenta
      : [
          for (final d in ((formasPago!['transferencia'] as Map?)?['datos'] as List? ?? const []))
            if (d is List && d.length == 2) ('${d[0]}', '${d[1]}'),
        ];
  bool get efectivoActivo => (formasPago?['efectivo'] as Map?)?['activa'] == true;
  String get efectivoTexto => '${(formasPago?['efectivo'] as Map?)?['texto'] ?? ''}';

  /// WhatsApp para comprobantes de la liga cargada (o el del club).
  static String get whatsappActual => _instancia?.whatsappComprobante ?? Pagos.whatsapp;
  String get whatsappComprobante => '${formasPago?['whatsapp'] ?? ''}'.isNotEmpty ? '${formasPago!['whatsapp']}' : Pagos.whatsapp;

  /// Reglas que un Pivot cambia en Mi Liga (`reglas_liga`).
  Map<String, dynamic> reglas = const {};
  int get toleranciaMin => (reglas['toleranciaMin'] as num?)?.toInt() ?? 15;
  int get rectificacionDias => (reglas['rectificacionDias'] as num?)?.toInt() ?? 7;
  int get eventosMinPersonas => (reglas['eventosMinPersonas'] as num?)?.toInt() ?? 5;

  /// Días sin venir para verse como inactivx (lo usan Equipo y Calendario).
  static int diasInactividad = 30;
  bool cargado = false;

  void _leer(Map<String, dynamic> r) {
    canal = '${r['canal'] ?? canal}';
    solicitudesPivots = '${r['solicitudesPivots'] ?? solicitudesPivots}';
    pais = '${r['pais'] ?? pais}';
    zonaHoraria = '${r['zonaHoraria'] ?? zonaHoraria}';
    precioPorClase = num.tryParse('${r['precioPorClase']}');
    precioMensual = num.tryParse('${r['precioMensual']}');
    logo = '${r['logo'] ?? ''}';
    formasPago = r['formasPago'] is Map<String, dynamic> ? r['formasPago'] as Map<String, dynamic> : null;
    if (r['reglas'] is Map<String, dynamic>) reglas = r['reglas'] as Map<String, dynamic>;
    diasInactividad = (reglas['inactividadDias'] as num?)?.toInt() ?? 30;
    cargado = true;
    notifyListeners();
  }

  Future<void> cargar() async {
    try {
      final r = await sesion.api.get('getConfigLiga', {if (sesion.adminToken != null) 'adminToken': sesion.adminToken});
      if (r['exito'] != false) _leer(r);
    } catch (_) {}
  }

  /// Guarda reglas de la liga (`adminReglasLiga`). Lanza ApiException si falla.
  Future<void> guardarReglas(Map<String, Object?> cambios) async {
    final r = await sesion.api.post('adminReglasLiga', {'adminToken': sesion.adminToken, 'reglas': jsonEncode(cambios)});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
    if (r['reglas'] is Map<String, dynamic>) reglas = r['reglas'] as Map<String, dynamic>;
    diasInactividad = (reglas['inactividadDias'] as num?)?.toInt() ?? 30;
    notifyListeners();
  }

  /// Guarda solo lo que se pasa. Lanza ApiException si falla.
  Future<void> guardar(Map<String, Object?> cambios) async {
    final r = await sesion.api.post('adminGuardarConfigLiga', {'adminToken': sesion.adminToken, ...cambios});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
    _leer(r);
  }

  // Sin SMS (Victor, 2026-11-13): si la liga no usa ninguna app, "Solo teléfono" (llamar).
  static const canales = {'whatsapp': 'WhatsApp', 'telegram': 'Telegram', 'signal': 'Signal', 'telefono': 'Solo teléfono'};
  String get nombreCanal => canales[canal] ?? 'WhatsApp';
  String get nombreCanalCorto => canal == 'telefono' ? 'Llamar' : nombreCanal;

  static IconData iconoDe(String c) => switch (c) {
    'telegram' => IconosMarca.telegram,
    'signal' => IconosMarca.signal,
    'telefono' => Icons.call_outlined,
    _ => IconosMarca.whatsapp,
  };
  IconData get icono => iconoDe(canal);

  /// Enlace para escribirle a un número completo ("+593998690423").
  Uri enlace(String telefono, {String texto = ''}) {
    final n = telefono.replaceAll(RegExp(r'[^\d+]'), '');
    final sinMas = n.replaceFirst('+', '');
    final t = Uri.encodeComponent(texto);
    return switch (canal) {
      'telegram' => Uri.parse('https://t.me/+$sinMas'),
      'signal' => Uri.parse('https://signal.me/#p/+$sinMas'),
      'telefono' => Uri.parse('tel:+$sinMas'),
      _ => Uri.parse('https://wa.me/$sinMas${texto.isEmpty ? '' : '?text=$t'}'),
    };
  }

  Future<void> escribir(String telefono, {String texto = ''}) => launchUrl(enlace(telefono, texto: texto), mode: LaunchMode.externalApplication);
}
