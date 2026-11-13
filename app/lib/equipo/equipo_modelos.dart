import 'package:flutter/material.dart';

import '../core/fechas.dart';

/// Una persona del equipo tal como la devuelve `getEquipo` (Edge Function).
class Integrante {
  Integrante(this.m);
  final Map<String, dynamic> m;

  String get username => '${m['username'] ?? ''}';
  String get nombreDerby => '${m['nombreDerby'] ?? ''}'.trim();
  String get nombreMostrar => nombreDerby.isNotEmpty ? nombreDerby : username;
  String get numero => '${m['numeroDerby'] ?? ''}'.trim();
  String get foto => '${m['fotoPerfil'] ?? ''}';

  /// Categoría: 'Quindes' o 'Mirlxs' (el servidor la llama `rol`).
  String get categoria => '${m['rol'] ?? 'Mirlxs'}';

  /// Datos viejos traían "Ella/ella"; se muestra solo "Ella" (migración 20261108010000).
  String get pronombres => normalizarPronombres('${m['pronombres'] ?? ''}');
  String get prefijo => '${m['prefijo'] ?? ''}'.replaceAll(RegExp(r'[^0-9]'), '');
  String get telefono => '${m['telefono'] ?? ''}'.replaceAll(RegExp(r'[^0-9]'), '');
  String get email => '${m['email'] ?? ''}';
  String get estado => '${m['estado'] ?? 'Activx'}';
  String get tierModo => '${m['tierModo'] ?? 'auto'}';
  DateTime? get viajeDesde => Fechas.desdeIso(m['viajeDesde']);
  DateTime? get viajeHasta => Fechas.desdeIso(m['viajeHasta']);
  DateTime? get fechaIngreso => Fechas.desdeIso(m['fechaIngreso']);
  DateTime? get ultimaAsistencia => Fechas.desdeIso(m['ultimaAsistencia']);

  /// Roles en el equipo (Jammer, Blocker...), sin "No definido".
  List<String> get roles => [for (final r in (m['roles'] is List ? m['roles'] as List : const [])) ?(r.toString() == 'No definido' ? null : r.toString())];

  /// "mm-dd" del cumpleaños, solo si la persona lo hizo público.
  String? get cumple => m['cumple'] is String && (m['cumple'] as String).length == 5 ? m['cumple'] as String : null;

  int get asistenciasPeriodo => (m['asistenciasPeriodo'] as num?)?.toInt() ?? 0;
  int get eventosPeriodo => (m['eventosPeriodo'] as num?)?.toInt() ?? 0;
  int? get asistenciaPct => eventosPeriodo == 0 ? null : (asistenciasPeriodo * 100 / eventosPeriodo).round();
  double get puntos => (m['puntosTotal'] as num?)?.toDouble() ?? 0;
  double get puntosAsistencia => (m['puntosAsistencia'] as num?)?.toDouble() ?? 0;
  double get puntosTareas => (m['puntosTareas'] as num?)?.toDouble() ?? 0;
  double get puntosRacha => (m['puntosRacha'] as num?)?.toDouble() ?? 0;
  int get racha => (m['rachaActual'] as num?)?.toInt() ?? 0;
  double get horasAnio => (m['horas_ano'] as num?)?.toDouble() ?? 0;
  int get asistenciasAnio => (m['asistencias_ano'] as num?)?.toInt() ?? 0;
  int get eventosAnio => (m['total_eventos_ano'] as num?)?.toInt() ?? 0;

  /// "sube", "baja" o null (`tendencia` del servidor).
  String? get tendencia {
    final t = m['tendencia'];
    if (t is String) return t;
    if (t is Map) return '${t['direccion'] ?? t['tipo'] ?? ''}';
    return null;
  }

  // Solo llegan con vista admin.
  bool get exentaCuota => m['exentaCuota'] == true;
  bool get esAdminMiembro => m['esAdminMiembro'] == true;
  bool get solicitudLesionPendiente => m['solicitudLesionPendiente'] == true;

  /// Inactivx = 30+ días sin una asistencia real (o ninguna), salvo de viaje
  /// o lesionadx (mismo criterio que la web `_eqEsInactivo()`; el servidor no
  /// guarda un estado "Inactivx").
  bool get inactivx {
    if (deViaje || lesionadx) return false;
    if (estado == 'Inactivx') return true;
    final u = ultimaAsistencia;
    return u == null || Fechas.diasEntre(u, Fechas.hoy()) >= 30;
  }

  /// Marcada hoy "A tiempo" o "Tarde" (habilita el botón de emergencia).
  bool get presenteHoy => m['presenteHoy'] == true;
  bool get deViaje => estado == 'De viaje';
  bool get lesionadx => estado == 'Lesionadx';

  /// Grupo de la home: 'Quindes', 'Mirlxs' o 'Inactivxs'.
  String get grupo => inactivx ? 'Inactivxs' : (categoria == 'Quindes' ? 'Quindes' : 'Mirlxs');

  /// Próxima fecha de [mmdd] a partir de hoy.
  static DateTime? proxima(String? mmdd, DateTime hoy) {
    if (mmdd == null) return null;
    final p = mmdd.split('-');
    if (p.length != 2) return null;
    final mes = int.tryParse(p[0]), dia = int.tryParse(p[1]);
    if (mes == null || dia == null) return null;
    var f = DateTime(hoy.year, mes, dia);
    if (f.isBefore(hoy)) f = DateTime(hoy.year + 1, mes, dia);
    return f;
  }

  DateTime? proximoCumple(DateTime hoy) => proxima(cumple, hoy);

  DateTime? proximoAniversario(DateTime hoy) {
    final f = fechaIngreso;
    if (f == null) return null;
    final a = proxima('${f.month.toString().padLeft(2, '0')}-${f.day.toString().padLeft(2, '0')}', hoy);
    if (a == null || a.year <= f.year) return null;
    return a;
  }

  int? aniosEnEquipo(DateTime en) {
    final f = fechaIngreso;
    if (f == null) return null;
    return en.year - f.year;
  }
}

/// Un dato corto para la fila de Equipo ("Cumple en 3 días").
class DatoFila {
  const DatoFila(this.icono, this.texto, {this.fijo = false});
  final IconData icono;
  final String texto;

  /// El estado (de viaje, lesionadx) no rota con los demás.
  final bool fijo;
}

/// Lo más relevante de la persona AHORA (Victor, 2026-11-07), por prioridad:
/// estado (fijo) > cumpleaños en 7 días > aniversario en 7 días > nuevo en el
/// equipo (< 30 días) > asistencia del mes ≥ 80% > ≥ 5 puntos > racha.
/// Hasta 3; la fila los rota con fundido.
List<DatoFila> datosRelevantes(Integrante p, DateTime hoy, {String periodo = 'este mes'}) {
  if (p.deViaje) {
    final h = p.viajeHasta;
    return [DatoFila(Icons.flight_takeoff_rounded, h == null ? 'De viaje' : 'De viaje hasta el ${h.day}/${h.month}', fijo: true)];
  }
  if (p.lesionadx) return const [DatoFila(Icons.healing_rounded, 'Lesionadx', fijo: true)];
  final res = <DatoFila>[];
  String enDias(int d) => d == 0 ? 'hoy' : (d == 1 ? 'mañana' : 'en $d días');
  final c = p.proximoCumple(hoy);
  if (c != null) {
    final d = Fechas.diasEntre(hoy, c);
    if (d <= 7) res.add(DatoFila(Icons.cake_outlined, d == 0 ? '¡Cumple hoy!' : 'Cumple ${enDias(d)}'));
  }
  final a = p.proximoAniversario(hoy);
  if (a != null) {
    final d = Fechas.diasEntre(hoy, a);
    final n = p.aniosEnEquipo(a)!;
    if (d <= 7) res.add(DatoFila(Icons.celebration_outlined, '$n ${n == 1 ? 'año' : 'años'} en el equipo ${enDias(d)}'));
  }
  final ingreso = p.fechaIngreso;
  if (ingreso != null && !ingreso.isAfter(hoy) && Fechas.diasEntre(ingreso, hoy) < 30) {
    res.add(const DatoFila(Icons.waving_hand_outlined, 'Nuevo en el equipo'));
  }
  final pct = p.asistenciaPct;
  if (pct != null && pct >= 80) {
    final flecha = p.tendencia == 'sube' ? ' ↑' : (p.tendencia == 'baja' ? ' ↓' : '');
    // Con el mes (Victor, 2026-11-12): "100% de asistencia en noviembre".
    res.add(DatoFila(Icons.event_available_outlined, '$pct% de asistencia ${periodo == 'este mes' ? 'en ${Fechas.mes(hoy)}' : periodo}$flecha'));
  }
  if (p.puntos >= 5) res.add(DatoFila(Icons.star_outline_rounded, '${_num(p.puntos)} pts $periodo'));
  if (p.racha >= 2) res.add(DatoFila(Icons.local_fire_department_outlined, 'Racha de ${p.racha} meses'));
  return res.take(3).toList();
}

String normalizarPronombres(String s) => s.replaceAll(RegExp(r'/(ella|él|elle)', caseSensitive: false), '').trim();

String _num(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);
String numero(num v) => _num(v.toDouble());
