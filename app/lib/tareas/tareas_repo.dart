import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../sesion/sesion.dart';
import 'tareas_modelos.dart';

/// Datos de la pestaña Tareas (getTareasApp) y sus acciones.
class TareasRepo extends ChangeNotifier {
  TareasRepo._(this.sesion);
  final Sesion sesion;

  static TareasRepo? _instancia;
  static TareasRepo de(Sesion s) {
    if (_instancia == null || !identical(_instancia!.sesion, s)) _instancia = TareasRepo._(s);
    return _instancia!;
  }

  Api get _api => sesion.api;
  bool get esAdmin => sesion.esAdmin && sesion.adminToken != null;
  String get yo => sesion.nombre ?? '';

  List<MiTarea> mias = [];
  List<Tarea> tablero = [];
  List<Tarea> baul = [];
  int limite = 3;
  int iniciadas = 0;
  double puntosMes = 0;
  ({String nombre, int minPuntos, int minClases})? meta;

  bool cargado = false;
  String? error;
  bool _cargando = false;
  bool get cargando => _cargando;

  Future<void> cargar({bool forzar = false}) async {
    if (_cargando || (cargado && !forzar)) return;
    _cargando = true;
    error = null;
    notifyListeners();
    try {
      final r = await _api.get('getTareasApp');
      List<Map<String, dynamic>> lista(String k) => [
        for (final x in (r[k] as List? ?? const []))
          if (x is Map<String, dynamic>) x,
      ];
      mias = lista('misTareas').map(MiTarea.new).toList()..sort(_porVencimiento);
      tablero = lista('tablero').map(Tarea.new).toList();
      baul = lista('baul').map(Tarea.new).toList();
      limite = (r['limite'] as num?)?.toInt() ?? 3;
      iniciadas = (r['iniciadas'] as num?)?.toInt() ?? 0;
      puntosMes = (r['puntosMes'] as num?)?.toDouble() ?? 0;
      final m = r['meta'];
      meta = m is Map ? (nombre: '${m['nombre']}', minPuntos: (m['minPuntos'] as num?)?.toInt() ?? 0, minClases: (m['minClases'] as num?)?.toInt() ?? 0) : null;
      cargado = true;
    } catch (e) {
      error = e is ApiException ? e.message : 'No se pudieron cargar las tareas. Revisa tu conexión.';
    } finally {
      _cargando = false;
      notifyListeners();
    }
  }

  /// Lo que vence antes primero; lo que está en revisión al final.
  static int _porVencimiento(MiTarea a, MiTarea b) {
    if (a.enRevision != b.enRevision) return a.enRevision ? 1 : -1;
    final x = a.vence, y = b.vence;
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return x.compareTo(y);
  }

  bool get enLimite => iniciadas >= limite;

  /// Tareas con cupo que no son mías.
  List<Tarea> get disponibles => [
    for (final t in tablero)
      if (t.libres > 0 && !t.tiene(yo)) t,
  ];

  /// Sin cupos y de otras personas.
  List<Tarea> get completas => [
    for (final t in tablero)
      if (t.libres == 0 && !t.tiene(yo)) t,
  ];

  /// Puntos que faltan este mes para la meta (0 si ya llegó o no hay meta).
  int get faltan {
    final m = meta;
    if (m == null) return 0;
    final f = m.minPuntos - puntosMes;
    return f > 0 ? f.ceil() : 0;
  }

  /// "Sugeridas para ti": si faltan puntos, primero las que alcanzan solas
  /// y después las de más puntos; hasta 3.
  List<Tarea> get sugeridas {
    if (faltan == 0) return const [];
    final l = disponibles.where((t) => t.puntos > 0).toList()
      ..sort((a, b) {
        final aa = a.puntos >= faltan, bb = b.puntos >= faltan;
        if (aa != bb) return aa ? -1 : 1;
        return aa ? a.puntos.compareTo(b.puntos) : b.puntos.compareTo(a.puntos);
      });
    final s = l.take(3).toList();
    // Si serían todas las disponibles, no aportan nada: se ocultan.
    return s.length == disponibles.length ? const [] : s;
  }

  // ─── Acciones de cada persona ───────────────────────────────────────────

  Future<void> _accion(String accion, Map<String, Object?> params, {String error = 'No se pudo completar.'}) async {
    final r = await _api.post(accion, params);
    if (r['exito'] == false) throw ApiException('${r['error'] ?? error}');
    await cargar(forzar: true);
  }

  Future<void> tomar(Tarea t) => _accion('tomarTarea', {'idTarea': t.id});
  Future<void> soltar(Tarea t) => _accion('soltarTarea', {'idTarea': t.id});
  Future<void> rescatar(Tarea t) => _accion('rescatarTarea', {'idTarea': t.id});
  Future<void> enviar(MiTarea m) => _accion('enviarRevisionTarea', {'idAsignacion': m.idAsignacion});

  Future<void> proponer({required String titulo, required String notas, required String area, required DateTime vence}) =>
      _accion('crearTareaPropia', {'titulo': titulo, 'notas': notas, 'area': area, 'fechaVencimiento': _iso(vence)});

  // ─── Admins ─────────────────────────────────────────────────────────────

  Map<String, Object?> get _admin => {'adminToken': sesion.adminToken};

  /// Crea una tarea única (o recurrente, sin fecha: vence a fin de cada mes).
  Future<void> crear({
    required String titulo,
    required String notas,
    required String area,
    required int puntos,
    required int cupos,
    DateTime? vence,
    bool recurrente = false,
    List<String> asignarA = const [],
  }) {
    final datos = {
      'titulo': titulo,
      'notas': notas,
      'area': area,
      'puntos': puntos,
      'maxAsignados': cupos,
      'creadoPor': yo,
      if (!recurrente) 'fechaVencimiento': vence == null ? null : _iso(vence),
      if (!recurrente && asignarA.isNotEmpty) 'asignarA': asignarA,
    };
    return _accion(recurrente ? 'adminCrearTareaRecurrente' : 'adminCrearTarea', {
      ..._admin,
      'datosJson': jsonEncode(datos),
    }, error: 'No se pudo crear la tarea.');
  }

  /// Edita una tarea; si es recurrente y `siguientes`, también la plantilla.
  Future<void> editar(
    Tarea t, {
    required String titulo,
    required String notas,
    required String area,
    required int puntos,
    required int cupos,
    DateTime? vence,
    bool siguientes = false,
  }) async {
    final datos = {'titulo': titulo, 'notas': notas, 'area': area, 'puntos': puntos, 'maxAsignados': cupos};
    if (siguientes && t.idPlantilla != null) {
      await _accion('adminEditarTareaRecurrente', {..._admin, 'idPlantilla': t.idPlantilla, 'datosJson': jsonEncode(datos)});
      // La fecha es propia de cada período: solo cambia en la de este mes.
      if (vence != null && vence != t.vence) {
        await _accion('adminEditarTarea', {
          ..._admin,
          'idTarea': t.id,
          'datosJson': jsonEncode({'fechaVencimiento': _iso(vence)}),
        });
      }
      return;
    }
    await _accion('adminEditarTarea', {
      ..._admin,
      'idTarea': t.id,
      'datosJson': jsonEncode({...datos, if (vence != null) 'fechaVencimiento': _iso(vence)}),
    });
  }

  Future<void> asignar(Tarea t, List<String> usernames) =>
      _accion('adminEditarAsignacionesTarea', {..._admin, 'idTarea': t.id, 'nombresJson': jsonEncode(usernames)});

  Future<void> archivar(Tarea t) => _accion('adminArchivarTarea', {..._admin, 'idTarea': t.id});
  Future<void> eliminar(Tarea t) => _accion('adminEliminarTarea', {..._admin, 'idTarea': t.id});

  Future<void> validar(PersonaTarea p, {required bool aprobar, String nota = ''}) => _accion('adminValidarTarea', {
    ..._admin,
    'idAsignacion': p.idAsignacion,
    'accion': aprobar ? 'aprobar' : 'rechazar',
    if (nota.isNotEmpty) 'notaRechazo': nota,
  });

  Future<List<Recurrente>> recurrentes() async {
    final r = await _api.get('adminGetTareasRecurrentes', _admin);
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudieron cargar.'}');
    return [
      for (final x in (r['plantillas'] as List? ?? const []))
        if (x is Map<String, dynamic>) Recurrente(x),
    ];
  }

  Future<void> editarPlantilla(Recurrente p, {required String titulo, required String notas, required String area, required int puntos, required int cupos}) =>
      _accion('adminEditarTareaRecurrente', {
        ..._admin,
        'idPlantilla': p.id,
        'datosJson': jsonEncode({'titulo': titulo, 'notas': notas, 'area': area, 'puntos': puntos, 'maxAsignados': cupos}),
      });

  /// 'activa' | 'pausada' | 'terminada'.
  Future<void> estadoPlantilla(String idPlantilla, String estado) =>
      _accion('adminEstadoTareaRecurrente', {..._admin, 'idPlantilla': idPlantilla, 'estado': estado});

  static String _iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}
