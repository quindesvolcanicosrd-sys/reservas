/// Estados de respuesta (RSVP) que acepta `marcarAsistenciaUsuario`.
enum EstadoRsvp {
  asistire('Asistiré'),
  noAsistire('No asistiré'),
  noJugador('No jugador');

  const EstadoRsvp(this.valor);
  final String valor;

  static EstadoRsvp? desde(String? v) {
    for (final e in values) {
      if (e.valor == v) return e;
    }
    return null;
  }
}

enum EstadoEvento { programado, cancelado, sinEntrenamiento, finalizado }

/// Asistencia REAL que toma un admin (rollcall), distinta del RSVP. Mismos
/// valores que la web (`_EV_ESTADOS_ROLLCALL`, etiqueta corta del roster).
enum EstadoReal {
  aTiempo('A tiempo', 'A horario'),
  tarde('Tarde', 'Tarde');

  const EstadoReal(this.valor, this.etiqueta);
  final String valor;
  final String etiqueta;

  static EstadoReal? desde(String? v) {
    for (final e in values) {
      if (e.valor == v) return e;
    }
    return null;
  }
}

class AsistenciaReal {
  const AsistenciaReal({required this.persona, required this.estado});
  final Persona persona;
  final EstadoReal estado;
}

class Persona {
  const Persona({required this.username, required this.nombreDerby, required this.fotoPerfil});
  final String username;
  final String nombreDerby;
  final String fotoPerfil;

  /// Nombre derby, y si no tiene, el username (mismo criterio que la web y
  /// las notificaciones).
  String get nombreMostrar => nombreDerby.trim().isNotEmpty ? nombreDerby.trim() : username;
  String get inicial => nombreMostrar.isEmpty ? '?' : nombreMostrar.characters0.toUpperCase();
}

extension _PrimerCaracter on String {
  String get characters0 => runes.isEmpty ? '' : String.fromCharCode(runes.first);
}

class Rsvp {
  const Rsvp({required this.persona, required this.estado});
  final Persona persona;
  final EstadoRsvp estado;
}

class Evento {
  Evento({
    required this.id,
    required this.fecha,
    required this.lugar,
    required this.tipo,
    required this.horaInicio,
    required this.horaFin,
    required this.estado,
    required this.rsvps,
    required this.miEstado,
    required this.mapsUrl,
    required this.descripcion,
    required this.videoInstructivo,
    List<AsistenciaReal>? asistentes,
  }) : asistentes = asistentes ?? [];

  final String id;
  final DateTime fecha; // solo día (hora de pared de Ecuador)
  final String lugar;
  final String tipo;
  final String horaInicio; // 'HH:MM'
  final String horaFin;
  final EstadoEvento estado;
  final List<Rsvp> rsvps;
  EstadoRsvp? miEstado;
  final String mapsUrl;
  final String descripcion;
  final String videoInstructivo;

  /// Quiénes asistieron de verdad (marcados por un admin).
  final List<AsistenciaReal> asistentes;

  /// Evento ya terminado (o del pasado): no se puede editar.
  bool get finalizado {
    final i = inicioUtc;
    if (i == null) return fecha.isBefore(DateTime.now().subtract(const Duration(days: 1)));
    final p = horaFin.split(':');
    final h = int.tryParse(p.first), m = p.length > 1 ? int.tryParse(p[1]) : null;
        var fin = (h != null && m != null) ? DateTime.utc(fecha.year, fecha.month, fecha.day, h + 5, m) : i.add(const Duration(hours: 2));
    if (!fin.isAfter(i)) fin = fin.add(const Duration(days: 1)); // termina pasada la medianoche
    return DateTime.now().toUtc().isAfter(fin);
  }

  bool get cancelado => estado == EstadoEvento.cancelado || estado == EstadoEvento.sinEntrenamiento;

  List<Rsvp> con(EstadoRsvp e) => rsvps.where((r) => r.estado == e).toList();
  int get cantidadAsisten => con(EstadoRsvp.asistire).length;

  String get rangoHorario => horaFin.isNotEmpty ? '$horaInicio – $horaFin' : horaInicio;

  /// Inicio real del evento (las columnas son hora de pared de Ecuador, UTC-5 fijo).
  DateTime? get inicioUtc {
    final p = horaInicio.split(':');
    if (p.length < 2) return null;
    final h = int.tryParse(p[0]), m = int.tryParse(p[1]);
    if (h == null || m == null) return null;
    return DateTime.utc(fecha.year, fecha.month, fecha.day, h + 5, m);
  }

  bool get yaEmpezo {
    final i = inicioUtc;
    return i != null && DateTime.now().toUtc().isAfter(i);
  }

  /// Está pasando ahora mismo.
  bool get enCurso => !cancelado && yaEmpezo && !finalizado;

  /// Admin: desde que empieza (igual que la web, `_evYaEmpezo()`).
  bool get sePuedeTomarAsistencia => !cancelado && yaEmpezo;

  static EstadoEvento _estado(String? s) {
    switch (s) {
      case 'Evento Cancelado':
      case 'Cancelado':
        return EstadoEvento.cancelado;
      case 'No se entrena':
        return EstadoEvento.sinEntrenamiento;
      case 'Evento Finalizado':
      case 'Finalizado':
        return EstadoEvento.finalizado;
      default:
        return EstadoEvento.programado;
    }
  }

  /// Mismo mapeo que `_evMapEventoBackend()` (js/eventos.js): descarta RSVPs
  /// huérfanos (`existeEnEquipo === false`) y separa el estado propio.
  factory Evento.desdeJson(Map<String, dynamic> raw, String miUsername) {
    final rsvps = <Rsvp>[];
    final reales = <AsistenciaReal>[];
    EstadoRsvp? mio;
    for (final a in (raw['asistencias'] as List? ?? const [])) {
      final m = a as Map<String, dynamic>;
      if (m['existeEnEquipo'] == false) continue;
      final persona = Persona(
        username: (m['nombre'] ?? '').toString(),
        nombreDerby: (m['nombreDerby'] ?? '').toString(),
        fotoPerfil: (m['fotoPerfil'] ?? '').toString(),
      );
      final real = EstadoReal.desde(m['estado'] as String?);
      if (real != null) {
        reales.add(AsistenciaReal(persona: persona, estado: real));
        continue;
      }
      final est = EstadoRsvp.desde(m['estado'] as String?);
      if (est == null) continue;
      rsvps.add(Rsvp(persona: persona, estado: est));
      if (persona.username.trim().toLowerCase() == miUsername.trim().toLowerCase()) mio = est;
    }
    return Evento(
      id: raw['idEvento'].toString(),
      fecha: DateTime.parse((raw['fecha'] as String).substring(0, 10)),
      lugar: (raw['lugar'] ?? '').toString(),
      tipo: (raw['tipoIcono'] ?? 'Entrenamiento').toString(),
      horaInicio: (raw['horaInicio'] ?? '').toString(),
      horaFin: (raw['horaFin'] ?? '').toString(),
      estado: _estado(raw['estado'] as String?),
      rsvps: rsvps,
      miEstado: mio,
      mapsUrl: (raw['mapsUrl'] ?? '').toString(),
      descripcion: (raw['descripcion'] ?? '').toString(),
      videoInstructivo: (raw['videoInstructivo'] ?? '').toString(),
      asistentes: reales,
    );
  }
}

/// Lugar (tabla `venues`): para editar eventos.
class Lugar {
  const Lugar({required this.nombre, required this.mapsUrl, required this.tipo});
  final String nombre;
  final String mapsUrl;
  final String tipo;
}

class Cumple {
  const Cumple({required this.nombre, required this.fecha, required this.edad, required this.fotoPerfil});
  final String nombre;
  final DateTime fecha;
  final int? edad;
  final String fotoPerfil;

  factory Cumple.desdeJson(Map<String, dynamic> raw) => Cumple(
    nombre: (raw['nombre'] ?? '').toString(),
    fecha: DateTime.parse((raw['fecha'] as String).substring(0, 10)),
    edad: raw['edad'] is num ? (raw['edad'] as num).toInt() : null,
    fotoPerfil: (raw['fotoPerfil'] ?? '').toString(),
  );
}
