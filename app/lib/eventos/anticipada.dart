import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/fechas.dart';
import '../sesion/sesion.dart';
import 'modelos.dart';

/// Asistencia anticipada: reglas que marcan solas tus entrenamientos futuros.
/// Misma tabla y lógica que la web (`_evAnt*` en js/eventos.js):
/// `reglas_asistencia` por PostgREST, prioridad periodo > meses > indefinido,
/// nunca pisa una respuesta real y el motivo de "No asistiré" actualiza tu
/// estado en el equipo (`autodeclararEstado` / `terminarMiViaje`).
enum TipoRango {
  meses('meses', 'Por meses'),
  periodo('periodo', 'Por período'),
  indefinido('indefinido', 'Indefinido');

  const TipoRango(this.valor, this.etiqueta);
  final String valor;
  final String etiqueta;

  static TipoRango? desde(String? v) {
    for (final t in values) {
      if (t.valor == v) return t;
    }
    return null;
  }
}

class MotivoAusencia {
  const MotivoAusencia(this.valor, this.estadoEquipo, this.icono, this.ayuda);
  final String valor;
  final String estadoEquipo;
  final IconData icono;
  final String ayuda;

  static const todos = [
    MotivoAusencia('De viaje', 'De viaje', Icons.flight_rounded, 'Tu equipo no cambia durante el viaje.'),
    MotivoAusencia('Lesionadx', 'Lesionadx', Icons.personal_injury_outlined, 'Tu equipo no cambia mientras dure la lesión.'),
    MotivoAusencia('Inactivx', 'Ausente', Icons.event_busy_outlined, 'Tu equipo sigue las reglas normales de asistencia.'),
  ];
  static const ayudaComun = 'Si vienes a entrenar, vuelves a Activx automáticamente.';

  static MotivoAusencia? de(String? v) {
    for (final m in todos) {
      if (m.valor == v) return m;
    }
    return null;
  }
}

class ReglaAnticipada {
  const ReglaAnticipada({
    this.id,
    required this.tipo,
    required this.estado,
    this.motivo,
    this.desde,
    this.hasta,
    this.meses = const [],
    this.tiposEvento = const ['Entrenamiento'],
    this.diasSemana = const [],
    this.lugares = const [],
    this.horaDesde,
    this.horaHasta,
    this.creada,
  });

  final String? id;
  final TipoRango tipo;
  final EstadoRsvp estado;
  final String? motivo;
  final DateTime? desde;
  final DateTime? hasta;

  /// Meses como aaaamm (202611), 12 meses desde el actual (2026-11-07).
  /// Un valor 1..12 es una regla vieja: ese mes de cualquier año.
  final List<int> meses;
  final List<String> tiposEvento;

  /// Solo estos días (1 = lunes … 7 = domingo) y lugares; vacío = todos
  /// (Victor, 2026-11-12).
  final List<int> diasSemana;
  final List<String> lugares;

  /// Solo eventos que empiezan entre estas horas ('HH:MM'), ej. "No asistiré
  /// los lunes de 10:00 a 19:00" (Victor, 2026-11-13); null = cualquier hora.
  final String? horaDesde;
  final String? horaHasta;
  bool get conHorario => horaDesde != null && horaHasta != null;
  final DateTime? creada;

  /// Cuántos filtros tiene: con dos reglas del mismo tipo en un evento, gana
  /// la más específica y, si empatan, la más reciente.
  int get especificidad => (diasSemana.isEmpty ? 0 : 1) + (lugares.isEmpty ? 0 : 1) + (conHorario ? 1 : 0);

  static const nombresDias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  /// "Solo lunes y miércoles · en CCI" (vacío si aplica a todos).
  String get resumenFiltros {
    String lista(List<String> l) => l.length <= 1 ? l.join() : '${l.sublist(0, l.length - 1).join(', ')} y ${l.last}';
    final partes = [
      if (diasSemana.isNotEmpty)
        'Solo ${lista([
          for (final d in [...diasSemana]..sort()) nombresDias[d - 1],
        ])}',
      if (lugares.isNotEmpty) '${diasSemana.isEmpty ? 'Solo en' : 'en'} ${lista(lugares)}',
      if (conHorario) '${diasSemana.isEmpty && lugares.isEmpty ? 'Solo si empiezan' : 'si empiezan'} entre ${horaAmPm(horaDesde!)} y ${horaAmPm(horaHasta!)}',
    ];
    return partes.join(' · ');
  }

  bool _pasaFiltros(Evento ev) =>
      (diasSemana.isEmpty || diasSemana.contains(ev.fecha.weekday)) &&
      (lugares.isEmpty || lugares.any((l) => l.trim().toLowerCase() == ev.lugar.trim().toLowerCase())) &&
      (!conHorario || (ev.horaInicio.compareTo(horaDesde!) >= 0 && ev.horaInicio.compareTo(horaHasta!) <= 0));

  /// Fechas que cubre (para ver si dos reglas se cruzan).
  bool _rangoCruza(ReglaAnticipada o) {
    (DateTime, DateTime?) r(ReglaAnticipada x) => switch (x.tipo) {
      TipoRango.indefinido => (x.desde ?? DateTime(2000), null),
      TipoRango.periodo => (x.desde ?? DateTime(2000), x.hasta),
      TipoRango.meses => (
        x.mesesOrdenados.isEmpty ? DateTime(2000) : x.mesesOrdenados.first,
        x.mesesOrdenados.isEmpty ? null : DateTime(x.mesesOrdenados.last.year, x.mesesOrdenados.last.month + 1, 0),
      ),
    };
    final (a0, a1) = r(this);
    final (b0, b1) = r(o);
    if (tipo == TipoRango.meses && o.tipo == TipoRango.meses) return meses.any((m) => o.meses.contains(m));
    return (a1 == null || !a1.isBefore(b0)) && (b1 == null || !b1.isBefore(a0));
  }

  /// Otra regla que podría tocar los mismos eventos con otra respuesta.
  bool seCruzaCon(ReglaAnticipada o) {
    if (o.estado == estado && o.motivo == motivo) return false;
    if (!_rangoCruza(o)) return false;
    final dias = diasSemana.isEmpty || o.diasSemana.isEmpty || diasSemana.any(o.diasSemana.contains);
    final lugs = lugares.isEmpty || o.lugares.isEmpty || lugares.any((l) => o.lugares.any((x) => x.toLowerCase() == l.toLowerCase()));
    final horas = !conHorario || !o.conHorario || (horaDesde!.compareTo(o.horaHasta!) <= 0 && o.horaDesde!.compareTo(horaHasta!) <= 0);
    return dias && lugs && horas;
  }

  static int clave(DateTime d) => d.year * 100 + d.month;

  /// Primer día del mes que representa [v] (una regla vieja toma el próximo).
  static DateTime mesDe(int v) {
    if (v > 12) return DateTime(v ~/ 100, v % 100);
    final hoy = Fechas.hoy();
    return DateTime(hoy.year + (v < hoy.month ? 1 : 0), v);
  }

  static bool coincide(int v, DateTime f) => v > 12 ? v == clave(f) : v == f.month;

  /// Los 12 meses elegibles: del actual a 11 meses después.
  static List<DateTime> ventana() {
    final hoy = Fechas.hoy();
    return [for (var i = 0; i < 12; i++) DateTime(hoy.year, hoy.month + i)];
  }

  /// "Noviembre" / "Enero 2027" (el año solo si no es el actual).
  static String nombreMes(DateTime d, {bool corto = false}) {
    final n = corto ? Fechas.mes(d) : Fechas.mesNombre(d);
    return d.year == Fechas.hoy().year ? n : '$n ${d.year}';
  }

  List<DateTime> get mesesOrdenados => meses.map(mesDe).toList()..sort();

  static ReglaAnticipada? desdeFila(Map<String, dynamic> f) {
    final tipo = TipoRango.desde(f['tipo_rango']?.toString());
    final estado = EstadoRsvp.desde(f['estado']?.toString());
    if (tipo == null || estado == null) return null;
    final te = f['tipos_evento'];
    final tipos = te is List ? te.map((e) => e.toString()).toList() : (te == null ? <String>[] : te.toString().split(','));
    final ms = f['meses'];
    return ReglaAnticipada(
      id: f['id']?.toString(),
      tipo: tipo,
      estado: estado,
      motivo: f['motivo']?.toString(),
      desde: Fechas.desdeIso(f['fecha_desde']),
      hasta: Fechas.desdeIso(f['fecha_hasta']),
      meses: ms is List ? ms.map((e) => int.tryParse(e.toString()) ?? 0).where((m) => (m >= 1 && m <= 12) || m > 190001).toList() : const [],
      tiposEvento: tipos.where((t) => t.trim().isNotEmpty).toList(),
      diasSemana: f['dias_semana'] is List ? [for (final d in f['dias_semana'] as List) ?int.tryParse('$d')] : const [],
      lugares: f['lugares'] is List ? [for (final l in f['lugares'] as List) '$l'] : const [],
      horaDesde: (f['hora_desde'] ?? '').toString().isEmpty ? null : '${f['hora_desde']}',
      horaHasta: (f['hora_hasta'] ?? '').toString().isEmpty ? null : '${f['hora_hasta']}',
      creada: DateTime.tryParse('${f['created_at'] ?? ''}'),
    );
  }

  bool aplicaA(Evento ev) {
    if (tiposEvento.isNotEmpty && !tiposEvento.contains(ev.tipo)) return false;
    if (!_pasaFiltros(ev)) return false;
    switch (tipo) {
      case TipoRango.indefinido:
        return desde != null && !ev.fecha.isBefore(desde!);
      case TipoRango.meses:
        return meses.any((v) => coincide(v, ev.fecha));
      case TipoRango.periodo:
        return desde != null && hasta != null && !ev.fecha.isBefore(desde!) && !ev.fecha.isAfter(hasta!);
    }
  }

  /// "Meses: noviembre, diciembre 2026" / "Del 9/11/2026 al 20/11/2026".
  String get resumenRango {
    String num(DateTime d) => '${d.day}/${d.month}/${d.year}';
    switch (tipo) {
      case TipoRango.meses:
        return 'Meses: ${mesesOrdenados.map((d) => nombreMes(d, corto: true)).join(', ')}';
      case TipoRango.periodo:
        return 'Del ${desde == null ? '' : num(desde!)} al ${hasta == null ? '' : num(hasta!)}';
      case TipoRango.indefinido:
        return 'Desde el ${desde == null ? '' : num(desde!)}, sin fecha de fin';
    }
  }

  String get resumenEstado => 'Estado: ${estado.valor}${estado == EstadoRsvp.noAsistire && motivo != null ? ' · $motivo' : ''}';

  Map<String, Object?> aFila(String nombre) => {
    'nombre': nombre,
    'tipo_rango': tipo.valor,
    'tipos_evento': tiposEvento.join(','),
    'estado': estado.valor,
    'motivo': estado == EstadoRsvp.noAsistire ? motivo : null,
    'meses': tipo == TipoRango.meses ? meses : null,
    'fecha_desde': tipo == TipoRango.meses || desde == null ? null : Fechas.iso(desde!),
    'fecha_hasta': tipo == TipoRango.periodo && hasta != null ? Fechas.iso(hasta!) : null,
    'dias_semana': diasSemana.isEmpty ? null : (diasSemana.toList()..sort()),
    'lugares': lugares.isEmpty ? null : lugares,
    'hora_desde': conHorario ? horaDesde : null,
    'hora_hasta': conHorario ? horaHasta : null,
  };

  /// Rango del viaje para `autodeclararEstado` (`_evAntRangoViaje()`).
  (DateTime?, DateTime?) get rangoViaje {
    switch (tipo) {
      case TipoRango.periodo:
        return (desde, hasta);
      case TipoRango.indefinido:
        return (desde, null);
      case TipoRango.meses:
        if (meses.isEmpty) return (null, null);
        final ord = mesesOrdenados;
        var d = ord.first;
        if (d.isBefore(Fechas.hoy())) d = Fechas.hoy();
        return (d, DateTime(ord.last.year, ord.last.month + 1, 0));
    }
  }
}

/// Estado de la cuota para limitar "Asistiré" a los meses pagados. Copia
/// literal de la web (`_evAntPagaCuotaMensual()`, `_evMesPagado()`,
/// `_evVencimientoCuota()`, `_evTieneCuotaAlDia()`, `_evAntLimiteCuota()`).
class Cuota {
  Cuota({required this.datos, required this.esAdmin, required this.nombre, required this.reservas, required this.excepciones});

  final Map<String, dynamic> datos;
  final bool esAdmin;
  final String nombre;
  final List<Map<String, dynamic>> reservas;
  final List<Map<String, dynamic>> excepciones;

  static const _meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  bool get _especial {
    final e = datos['exenta_cuota'];
    return e == true || e == 'true' || datos['estado_miembro'] == 'Técnico' || datos['estado_miembro'] == 'Lesionadx';
  }

  String get _categoria => (datos['categoria'] ?? '').toString().toLowerCase();

  Iterable<Map<String, dynamic>> get _mensuales => reservas.where((r) => r['tipo'] == 'mensual' && r['estado'] != 'Cancelada');

  /// Vencimiento de una cuota mensual (`validezHasta`, "d/m/aaaa"): desde
  /// 2026-11-07 el servidor lo manda siempre = fin del mes pagado.
  static DateTime? _vence(Map<String, dynamic> r) {
    final m = RegExp(r'^(\d{1,2})/(\d{1,2})/(\d{4})$').firstMatch('${r['validezHasta'] ?? ''}'.trim());
    return m == null ? null : DateTime(int.parse(m[3]!), int.parse(m[2]!), int.parse(m[1]!));
  }

  int? _mesDe(Map<String, dynamic> r) {
    final i = _meses.indexOf((r['fecha'] ?? r['mes_texto'] ?? '').toString().toLowerCase().trim());
    return i < 0 ? null : i + 1;
  }

  bool get pagaCuotaMensual {
    if (_especial) return false;
    if (_categoria == 'quindes' && !esAdmin && _mensuales.isEmpty) return false;
    return _mensuales.isNotEmpty;
  }

  bool _excepcion(int mes, int anio) {
    final clave = '$anio-${mes.toString().padLeft(2, '0')}';
    return excepciones.any((x) => x['idMiembro'] == nombre && x['mes'] == clave && (x['tipo'] == 'pago' || x['tipo'] == 'exenta'));
  }

  /// Reserva no cancelada para un evento puntual (`r.fecha === e.id` en la web).
  bool tieneReserva(String idEvento) => reservas.any((r) => r['fecha'] == idEvento && r['estado'] != 'Cancelada');

  /// Mes pagado de ese año (`_evMesPagado()` de la web).
  bool mesPagado(int mes, int anio) => _mensuales.any((r) {
    if (_mesDe(r) != mes) return false;
    final v = _vence(r);
    return v == null || v.year == anio;
  });

  /// Al día = alguna cuota sin vencer (vence el fin del mes pagado).
  bool get alDia {
    final hoy = Fechas.hoy();
    if (_excepcion(hoy.month, hoy.year) || _especial) return true;
    return _mensuales.any((r) {
      final v = _vence(r);
      return v != null && !hoy.isAfter(v);
    });
  }

  /// El vencimiento más lejano entre las cuotas vigentes.
  DateTime? get _vencimiento {
    final hoy = Fechas.hoy();
    DateTime? res;
    for (final r in _mensuales) {
      final v = _vence(r);
      if (v != null && !hoy.isAfter(v) && (res == null || v.isAfter(res))) res = v;
    }
    return res;
  }

  /// Exenta, Técnico o Lesionadx: sin restricción de pago.
  bool get exenta => _especial;

  /// "Asistiré" en asistencia anticipada solo para fechas pagadas (regla
  /// 2026-11-07): mes con cuota de ese año, excepción del admin o clase reservada.
  bool cubre(Evento ev) => _especial || mesPagado(ev.fecha.month, ev.fecha.year) || _excepcion(ev.fecha.month, ev.fecha.year) || tieneReserva(ev.id);

  /// Hay algo pagado de hoy en adelante (si no, "Asistiré" queda deshabilitado).
  bool get asistireHabilitado {
    final hoy = Fechas.hoy();
    if (_especial || _excepcion(hoy.month, hoy.year)) return true;
    return reservas.any((r) {
      if (r['estado'] == 'Cancelada' || r['estado'] == 'Crédito usado') return false;
      if (r['tipo'] == 'mensual') {
        final v = _vence(r);
        return v != null && !hoy.isAfter(v);
      }
      final f = DateTime.tryParse('${r['fechaCalendario'] ?? ''}');
      return f != null && !f.isBefore(hoy);
    });
  }

  /// Con "Asistiré" y cuota mensual: solo meses pagados.
  bool restringe(EstadoRsvp? estado) => estado == EstadoRsvp.asistire && pagaCuotaMensual;

  bool mesPermitido(EstadoRsvp? estado, int mes, int anio) => !restringe(estado) || mesPagado(mes, anio) || _excepcion(mes, anio);

  DateTime? limite(EstadoRsvp? estado) {
    if (!restringe(estado)) return null;
    final v = _vencimiento;
    if (v != null) return v;
    final hoy = Fechas.hoy();
    if (_excepcion(hoy.month, hoy.year)) return DateTime(hoy.year, hoy.month + 1, 0);
    if (alDia) return null;
    return hoy.subtract(const Duration(days: 1));
  }
}

class AnticipadaRepo {
  AnticipadaRepo(this.sesion);
  final Sesion sesion;
  Api get _api => sesion.api;
  final _enVuelo = <String>{};

  /// Quién la ve (regla 2026-11-07, web `_evAntDisponible()`): Quindes o
  /// Mirlxs con equipamiento completo propio (ni patines ni protecciones del club).
  bool get disponible {
    final d = sesion.datos;
    final cat = (d['categoria'] ?? '').toString().toLowerCase();
    bool usa(Object? v) {
      final t = (v ?? '').toString().trim().toLowerCase();
      return t.isNotEmpty && t != 'no';
    }

    return (cat == 'quindes' || cat == 'mirlxs') && !usa(d['necesitaPatines']) && !usa(d['necesitaProtecciones']);
  }

  Future<List<ReglaAnticipada>> reglas() async {
    final nombre = Uri.encodeComponent(sesion.nombre ?? '');
    final filas = await _api.restGet('reglas_asistencia?select=*&nombre=eq.$nombre&order=created_at.desc');
    return [for (final f in filas) ?ReglaAnticipada.desdeFila(f as Map<String, dynamic>)];
  }

  Future<Cuota> cuota() async {
    final res = await Future.wait([
      _api.getLista('getReservasPersona', {'nombre': sesion.nombre}).catchError((_) => <dynamic>[]),
      _api.get('listarExcepcionesCuota').then((r) => (r['excepciones'] as List?) ?? const []).catchError((_) => <dynamic>[]),
    ]);
    return Cuota(
      datos: sesion.datos,
      esAdmin: sesion.esAdmin,
      nombre: sesion.nombre ?? '',
      reservas: res[0].whereType<Map<String, dynamic>>().toList(),
      excepciones: res[1].whereType<Map<String, dynamic>>().toList(),
    );
  }

  /// Crea (o reemplaza, al editar: la web borra y vuelve a crear) una regla.
  /// Devuelve un aviso si la regla se guardó pero tu estado no se pudo actualizar.
  Future<String?> guardar(ReglaAnticipada nueva, {ReglaAnticipada? vieja}) async {
    if (vieja?.id != null) await _api.restDelete('reglas_asistencia?id=eq.${vieja!.id}');
    await _api.restPost('reglas_asistencia', nueva.aFila(sesion.nombre ?? ''));
    return _sincronizarEstado(nueva, vieja);
  }

  Future<String?> eliminar(ReglaAnticipada r) async {
    await _api.restDelete('reglas_asistencia?id=eq.${r.id}');
    return _sincronizarEstado(null, r);
  }

  Future<String?> _sincronizarEstado(ReglaAnticipada? nueva, ReglaAnticipada? vieja) async {
    final def = nueva != null && nueva.estado == EstadoRsvp.noAsistire ? MotivoAusencia.de(nueva.motivo) : null;
    Map<String, Object?>? req;
    String accion;
    if (def != null) {
      accion = 'autodeclararEstado';
      req = {'estado': def.estadoEquipo};
      if (def.estadoEquipo == 'De viaje') {
        final (d, h) = nueva!.rangoViaje;
        if (d != null) req['viajeDesde'] = Fechas.iso(d);
        if (h != null) req['viajeHasta'] = Fechas.iso(h);
      }
    } else if (vieja != null && vieja.estado == EstadoRsvp.noAsistire && vieja.motivo == 'De viaje') {
      accion = 'terminarMiViaje';
      req = {};
    } else {
      return null;
    }
    try {
      final res = await _api.post(accion, req);
      if (res['exito'] != true) return 'La asistencia anticipada se guardó, pero no se pudo actualizar tu estado: ${res['error'] ?? 'error desconocido'}';
    } catch (e) {
      return 'La asistencia anticipada se guardó, pero no se pudo actualizar tu estado: $e';
    }
    return null;
  }

  /// Aplica las reglas a los eventos futuros sin respuesta real y guarda la
  /// respuesta en el servidor (`_evAntReconciliarConReglas()` de la web).
  /// Devuelve true si cambió algún evento.
  Future<bool> reconciliar(List<Evento> eventos, {List<ReglaAnticipada>? precargadas}) async {
    final List<ReglaAnticipada> lista;
    Cuota? c;
    try {
      lista = precargadas ?? await reglas();
      // "Asistiré" solo en fechas pagadas: la regla queda guardada y se aplica sola al pagar.
      if (lista.any((r) => r.estado == EstadoRsvp.asistire)) c = await cuota();
    } catch (_) {
      return false;
    }
    if (lista.isEmpty) return false;
    const orden = {TipoRango.indefinido: 0, TipoRango.meses: 1, TipoRango.periodo: 2};
    // De menos a más prioritaria (la última que aplica gana): tipo, luego
    // la más específica, luego la más reciente.
    lista.sort((a, b) {
      final t = orden[a.tipo]!.compareTo(orden[b.tipo]!);
      if (t != 0) return t;
      final e = a.especificidad.compareTo(b.especificidad);
      if (e != 0) return e;
      return (a.creada ?? DateTime(2000)).compareTo(b.creada ?? DateTime(2000));
    });
    final hoy = Fechas.hoy();
    final yo = (sesion.nombre ?? '').trim().toLowerCase();
    final resultado = <Evento, EstadoRsvp>{};
    for (final ev in eventos) {
      if (ev.fecha.isBefore(hoy) || ev.cancelado || ev.miEstado != null) continue;
      for (final r in lista) {
        if (r.estado == EstadoRsvp.asistire && c != null && !c.cubre(ev)) continue;
        if (r.aplicaA(ev)) resultado[ev] = r.estado;
      }
    }
    for (final entrada in resultado.entries) {
      final ev = entrada.key;
      if (ev.rsvps.any((r) => r.persona.username.trim().toLowerCase() == yo)) continue;
      if (!_enVuelo.add(ev.id)) continue;
      ev.miEstado = entrada.value;
      ev.rsvps.add(
        Rsvp(
          persona: Persona(username: sesion.nombre ?? '', nombreDerby: sesion.nombreDerby, fotoPerfil: sesion.fotoPerfil),
          estado: entrada.value,
        ),
      );
      _api
          .post('marcarAsistenciaUsuario', {'nombre': sesion.nombre, 'idEvento': ev.id, 'estado': entrada.value.valor, 'origenAuto': 'true'})
          .catchError((_) {
            return <String, dynamic>{};
          })
          .whenComplete(() => _enVuelo.remove(ev.id));
    }
    return resultado.isNotEmpty;
  }
}

/// 'HH:MM' → '7:00 p. m.' (Victor, 2026-11-14: horas con AM/PM).
String horaAmPm(String hhmm) {
  final p = hhmm.split(':');
  final h = int.tryParse(p[0]) ?? 0, m = p.length > 1 ? p[1].padLeft(2, '0').substring(0, 2) : '00';
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return '$h12:$m ${h < 12 ? 'a. m.' : 'p. m.'}';
}
