import '../core/api.dart';
import '../core/fechas.dart';
import '../eventos/anticipada.dart';
import '../sesion/sesion.dart';

/// Fase 3: reservas y pagos desde el "+", con la misma lógica que la web
/// (js/reservas.js: `cargarFechas()`, `actualizarTotalS4()`,
/// `confirmarReserva()`). El servidor pone el precio y aplica solo la clase
/// a favor o el cupón (`guardarReserva`); acá se calcula igual para mostrarlo.
enum TipoReserva { clase, mes }

class FechaClase {
  FechaClase({
    required this.id,
    required this.fecha,
    required this.hora,
    required this.lugar,
    required this.disponible,
    required this.razon,
    required this.tallaAgotada,
  });

  final String id;
  final DateTime? fecha;
  final String hora;
  final String lugar;
  final bool disponible;
  final String razon;

  /// No hay patines de tu talla, pero se puede elegir otra para esa fecha.
  final bool tallaAgotada;

  bool get elegible => disponible || tallaAgotada;
}

class MesReserva {
  const MesReserva(this.mes, {required this.pagado, this.pasado = false});
  final DateTime mes; // primer día del mes
  final bool pagado;
  final bool pasado; // adeudado de antes del mes actual
}

class Precios {
  const Precios(this.porClase, this.mensual);
  final double porClase;
  final double mensual;
}

/// Cómo queda el total con los descuentos (`actualizarTotalS4()`).
class Total {
  const Total({required this.cantidad, required this.aFavor, required this.cupon, required this.cobradas, required this.monto, required this.precio});
  final int cantidad;
  final int aFavor; // clases a favor por entrenamientos cancelados
  final int cupon; // 0 o 1
  final int cobradas;
  final double monto;
  final double precio;
}

class ResultadoReserva {
  const ResultadoReserva({required this.guardados, required this.fallidos, required this.mensajeWhatsapp});
  final List<String> guardados;
  final List<String> fallidos;
  final String mensajeWhatsapp;
}

/// Una reserva activa (clase o mes) para "Mis reservas" y "Cancelar o
/// reagendar". `clave` es lo que espera el servidor: el id del evento o el
/// nombre del mes.
class ReservaActiva {
  const ReservaActiva({required this.clave, required this.mensual, required this.estado, this.dia, this.mes, this.hora = '', this.lugar = ''});
  final String clave;
  final bool mensual;
  final String estado;
  final DateTime? dia; // clase
  final DateTime? mes; // mensual: primer día del mes
  final String hora;
  final String lugar;

  String get titulo => mensual
      ? 'Cuota de ${ReglaAnticipada.nombreMes(mes!)}'
      : dia == null
      ? clave
      : '${Fechas.dia(dia!)[0].toUpperCase()}${Fechas.dia(dia!).substring(1)} ${Fechas.corta(dia!)}';

  String get detalle => mensual ? 'Mensualidad' : [if (hora.isNotEmpty) hora, if (lugar.isNotEmpty) lugar].join(' · ');

  /// "Reserva confirmada" / "Clase a favor" / "Reserva pendiente" (web).
  String get textoEstado => estado == 'Confirmada' ? 'Reserva confirmada' : (estado == 'Reagendar' ? 'Clase a favor' : 'Reserva pendiente');

  /// Una clase a favor ya no se cancela ni se reagenda (web: sin botón).
  bool get gestionable => estado != 'Reagendar';

  static ReservaActiva? desde(Map<String, dynamic> r) {
    final estado = (r['estado'] ?? '').toString();
    if (estado == 'Cancelada' || estado == 'Crédito usado') return null;
    final hoy = Fechas.hoy();
    if (r['tipo'] == 'mensual') {
      final v = RegExp(r'^(\d{1,2})/(\d{1,2})/(\d{4})$').firstMatch('${r['validezHasta'] ?? ''}');
      final nombre = (r['fecha'] ?? r['mes_texto'] ?? '').toString();
      if (v == null || nombre.isEmpty) return null;
      final fin = DateTime(int.parse(v[3]!), int.parse(v[2]!), int.parse(v[1]!));
      if (fin.isBefore(hoy)) return null;
      return ReservaActiva(clave: nombre, mensual: true, estado: estado, mes: DateTime(fin.year, fin.month));
    }
    final dia = Fechas.desdeIso(r['fechaCalendario']);
    if (dia != null && dia.isBefore(hoy)) return null;
    return ReservaActiva(
      clave: '${r['fecha']}',
      mensual: false,
      estado: estado,
      dia: dia,
      hora: (r['horaInicio'] ?? '').toString(),
      lugar: (r['donde'] ?? '').toString(),
    );
  }
}

class ReservasRepo {
  ReservasRepo(this.sesion);
  final Sesion sesion;
  Api get _api => sesion.api;

  Map<String, dynamic> get _d => sesion.datos;

  static bool _usa(Object? v) {
    final t = (v ?? '').toString().trim().toLowerCase();
    return t.isNotEmpty && t != 'no';
  }

  bool get necesitaPatines => _usa(_d['necesitaPatines']);
  bool get necesitaProtecciones => _usa(_d['necesitaProtecciones']);
  String get talla => (_d['talla'] ?? '').toString();

  /// Equipamiento del club: solo reserva por clase (`canPayMonthly()`).
  bool get necesitaEquipo => necesitaPatines || necesitaProtecciones;

  bool get _exenta {
    final e = _d['exenta_cuota'];
    return e == true || e == 'true' || _d['estado_miembro'] == 'Técnico' || _d['estado_miembro'] == 'Lesionadx';
  }

  String get _categoria => (_d['categoria'] ?? '').toString().toLowerCase();

  /// Qué reservas ofrece el "+" (doc Fase 3, validado por Victor 2026-11-07):
  /// Quindes → por mes; Mirlxs con equipo del club → por clase; Mirlxs con
  /// equipo propio → por clase o por mes. Exentas, Técnico y Lesionadx no pagan.
  List<TipoReserva> get opciones {
    if (_exenta) return const [];
    if (_categoria == 'quindes') return necesitaEquipo ? const [] : const [TipoReserva.mes];
    if (_categoria == 'mirlxs' || _categoria.isEmpty) {
      return necesitaEquipo ? const [TipoReserva.clase] : const [TipoReserva.clase, TipoReserva.mes];
    }
    return const [];
  }

  /// "Patines talla 38 y protecciones (Rodilleras)" o null con equipo propio.
  String? get resumenEquipo {
    final partes = [
      if (necesitaPatines) 'patines talla $talla',
      if (necesitaProtecciones)
        _d['necesitaProtecciones'].toString().toLowerCase() == 'sí' ? 'protecciones completas' : 'protecciones (${_d['necesitaProtecciones']})',
    ];
    if (partes.isEmpty) return null;
    final t = partes.join(' y ');
    return t[0].toUpperCase() + t.substring(1);
  }

  Future<Precios> precios() async {
    final r = await _api.get('getPreciosClases');
    double n(Object? v) => double.tryParse('${v ?? ''}') ?? 0;
    return Precios(n(r['precioPorClase']), n(r['precioMensual']));
  }

  Future<bool> cuponDisponible() async {
    try {
      final r = await _api.get('getCuponDisponible', {'nombre': sesion.nombre});
      return r['cuponDisponible'] == true;
    } catch (_) {
      return false;
    }
  }

  /// Próximos entrenamientos con sus cupos (`getFechasDisponibles`).
  Future<List<FechaClase>> fechas() async {
    final lista = await _api.getLista('getFechasDisponibles', {
      'nombre': sesion.nombre,
      'talla': necesitaPatines ? talla : '',
      'necesitaProtecciones': (_d['necesitaProtecciones'] ?? '').toString(),
    });
    final agotada = 'sin patines talla $talla disponibles';
    return [
      for (final f in lista.whereType<Map<String, dynamic>>())
        FechaClase(
          id: '${f['fecha']}',
          fecha: Fechas.desdeIso(f['fechaCalendario']),
          hora: (f['horaInicio'] ?? '').toString(),
          lugar: (f['donde'] ?? '').toString(),
          disponible: f['disponible'] == true,
          razon: (f['razon'] ?? '').toString(),
          tallaAgotada: f['disponible'] != true && necesitaPatines && (f['razon'] ?? '').toString().trim().toLowerCase() == agotada,
        ),
    ];
  }

  /// Tallas con patines libres para una fecha (`getTallasDisponiblesParaFecha`).
  Future<List<String>> tallasLibres(String idEvento) async {
    final lista = await _api.getLista('getTallasDisponiblesParaFecha', {'fecha': idEvento, 'nombreExcluir': sesion.nombre});
    return [
      for (final t in lista.whereType<Map<String, dynamic>>())
        if ((int.tryParse('${t['disponibles']}') ?? 0) > 0) '${t['talla']}',
    ];
  }

  /// 12 meses desde el actual (más los adeudados de antes, como en la web) y
  /// cuáles ya están pagados o pendientes de revisión.
  List<MesReserva> meses(Cuota c) {
    final hoy = Fechas.hoy();
    final actual = DateTime(hoy.year, hoy.month);
    final res = <MesReserva>[];
    // Adeudados: desde el mes siguiente a la última cuota hasta el anterior al actual.
    DateTime? ultimo;
    for (final m in [for (var i = -12; i < 0; i++) DateTime(hoy.year, hoy.month + i)]) {
      if (c.mesPagado(m.month, m.year)) ultimo = m;
    }
    if (ultimo != null) {
      for (var m = DateTime(ultimo.year, ultimo.month + 1); m.isBefore(actual); m = DateTime(m.year, m.month + 1)) {
        res.add(MesReserva(m, pagado: false, pasado: true));
      }
    }
    for (var i = 0; i < 12; i++) {
      final m = DateTime(hoy.year, hoy.month + i);
      res.add(MesReserva(m, pagado: c.mesPagado(m.month, m.year)));
    }
    return res;
  }

  /// Mes que se preselecciona: el actual, o el siguiente si ya está pagado
  /// (`_evFabReservaMesActual()`), más los adeudados.
  Set<DateTime> preseleccion(List<MesReserva> meses) {
    final sel = {
      for (final m in meses)
        if (m.pasado) m.mes,
    };
    final libre = meses.where((m) => !m.pasado && !m.pagado).firstOrNull;
    if (libre != null) sel.add(libre.mes);
    return sel;
  }

  Total total({required TipoReserva tipo, required int cantidad, required Precios p, required int creditos, required bool cupon}) {
    if (tipo == TipoReserva.mes) {
      return Total(cantidad: cantidad, aFavor: 0, cupon: 0, cobradas: cantidad, monto: cantidad * p.mensual, precio: p.mensual);
    }
    final aFavor = creditos < cantidad ? creditos : cantidad;
    final conCupon = cupon && cantidad > aFavor ? 1 : 0;
    final cobradas = cantidad - aFavor - conCupon;
    return Total(cantidad: cantidad, aFavor: aFavor, cupon: conCupon, cobradas: cobradas, monto: cobradas * p.porClase, precio: p.porClase);
  }

  static String dinero(double v) => '\$${v.toStringAsFixed(2)}';

  /// Reservas activas (clases que no pasaron y cuotas sin vencer), las más próximas primero.
  static List<ReservaActiva> activas(Cuota c) {
    final lista = [for (final r in c.reservas) ?ReservaActiva.desde(r)];
    lista.sort((a, b) => (a.dia ?? a.mes ?? DateTime(9999)).compareTo(b.dia ?? b.mes ?? DateTime(9999)));
    return lista;
  }

  /// Devuelve true si el cupón volvió a quedar disponible (la reserva lo
  /// usó y se canceló con al menos 1 hora de anticipación).
  Future<bool> cancelar(ReservaActiva r) async {
    final res = await _api.post('cancelarReserva', {'nombre': sesion.nombre, 'fecha': r.clave, if (r.mensual) 'anio': '${r.mes!.year}'});
    if (res['exito'] != true) throw ApiException('${res['error'] ?? 'No se pudo cancelar.'}');
    return res['cuponRestaurado'] == true;
  }

  /// Cambia una clase por otra fecha (id de evento) o un mes por otro.
  Future<void> reagendar(ReservaActiva r, {String? evento, DateTime? mes}) async {
    final res = await _api.post('reagendarReserva', {
      'nombre': sesion.nombre,
      'fechaAnterior': r.clave,
      'fechaNueva': mes != null ? Fechas.mesNombre(mes) : evento,
      if (r.mensual) 'anioAnterior': '${r.mes!.year}',
      if (mes != null) 'anioNuevo': '${mes.year}',
    });
    if (res['exito'] != true) throw ApiException('${res['error'] ?? 'No se pudo cambiar la fecha.'}');
  }

  /// Guarda cada clase o mes (`guardarReserva`), la nota de pago y el
  /// resumen por correo, y marca "Asistiré" en las clases reservadas.
  Future<ResultadoReserva> confirmar({
    required TipoReserva tipo,
    required List<FechaClase> clases,
    required List<DateTime> meses,
    required Map<String, String> tallaPorFecha,
    required Total total,
    String? medio,
    String? medioNombre,
  }) async {
    final tallaBase = necesitaPatines ? talla : 'No';
    final protec = necesitaProtecciones ? (_d['necesitaProtecciones'] ?? '').toString() : 'No';
    final email = (_d['email'] ?? '').toString();
    final guardados = <String>[];
    final fallidos = <String>[];
    final etiquetas = <String, String>{};

    if (tipo == TipoReserva.mes) {
      for (final m in meses) {
        final nombre = Fechas.mesNombre(m);
        final etiqueta = ReglaAnticipada.nombreMes(m);
        etiquetas[nombre] = etiqueta;
        try {
          final r = await _api.post('guardarReserva', {
            'nombre': sesion.nombre,
            'fecha': nombre,
            'anio': '${m.year}',
            'talla': tallaBase,
            'protecciones': protec,
            'monto': total.precio.toStringAsFixed(2),
            'email': email,
            'medio': ?medio,
            'medioNombre': ?medioNombre,
          });
          if (r['exito'] == false) throw ApiException('${r['mensaje'] ?? r['error'] ?? 'No se pudo guardar'}');
          guardados.add(etiqueta);
        } catch (_) {
          fallidos.add(etiqueta);
        }
      }
    } else {
      var aFavor = total.aFavor, cupon = total.cupon;
      for (final c in clases) {
        final gratis = aFavor > 0 || cupon > 0;
        if (aFavor > 0) {
          aFavor--;
        } else if (cupon > 0) {
          cupon--;
        }
        final etiqueta = _etiquetaClase(c);
        try {
          final r = await _api.post('guardarReserva', {
            'nombre': sesion.nombre,
            'fecha': c.id,
            'talla': tallaPorFecha[c.id] ?? tallaBase,
            'protecciones': protec,
            'monto': gratis ? '0.00' : total.precio.toStringAsFixed(2),
            'email': email,
            if (!gratis) 'medio': ?medio,
            if (!gratis) 'medioNombre': ?medioNombre,
          });
          if (r['exito'] == false) throw ApiException('${r['mensaje'] ?? r['error'] ?? 'No se pudo guardar'}');
          guardados.add(etiqueta);
          // Como la web cuando se reserva desde Eventos: queda "Asistiré".
          _api.post('marcarAsistenciaUsuario', {'nombre': sesion.nombre, 'idEvento': c.id, 'estado': 'Asistiré'}).catchError((_) => <String, dynamic>{});
        } catch (_) {
          fallidos.add(etiqueta);
        }
      }
    }

    if (guardados.isNotEmpty) {
      // Aviso a admins: pago pendiente de revisión.
      if (total.monto > 0) {
        final n = guardados.length;
        _api
            .post('avisarPagoPendiente', {
              'nombre': sesion.nombre,
              'monto': total.monto.toStringAsFixed(2),
              'detalle': tipo == TipoReserva.mes ? '$n ${n == 1 ? 'mes' : 'meses'}' : '$n ${n == 1 ? 'clase' : 'clases'}',
            })
            .catchError((_) => <String, dynamic>{});
      }
    }

    return ResultadoReserva(guardados: guardados, fallidos: fallidos, mensajeWhatsapp: _mensaje(tipo, guardados, total.monto));
  }

  static String _etiquetaClase(FechaClase c) {
    final f = c.fecha;
    final dia = f == null ? c.id : '${Fechas.dia(f)[0].toUpperCase()}${Fechas.dia(f).substring(1)} ${Fechas.corta(f)}';
    return [dia, if (c.hora.isNotEmpty) c.hora, if (c.lugar.isNotEmpty) c.lugar].join(' - ');
  }

  static String etiquetaClase(FechaClase c) => _etiquetaClase(c);

  /// Mismo mensaje que la web (`_pagoArmarResumen()`).
  String _mensaje(TipoReserva tipo, List<String> items, double monto) {
    final hoy = Fechas.hoy();
    final equipo = resumenEquipo;
    final linea = equipo == null ? 'Llevaré mi propio equipamiento.' : 'Necesitaré ${equipo[0].toLowerCase()}${equipo.substring(1)}.';
    final bloque = tipo == TipoReserva.mes
        ? '${items.length == 1 ? '*Mes reservado*' : '*Meses reservados*'}\n${items.map((m) => '- $m').join('\n')}'
        : '*Clases reservadas*\n${items.map((m) => '- $m').join('\n')}';
    return '¡Hola! Mi nombre de usuario es *${sesion.nombre}* y acabo de realizar mi pago de *${dinero(monto)}* el día ${hoy.day} de ${Fechas.mes(hoy)} de ${hoy.year}.\n'
        '$bloque\n$linea\n*Mi mail es: ${_d['email'] ?? ''}*\nTe envío el comprobante adjunto. Si no lo ves, por favor solicítalo. ¡Gracias!';
  }
}
