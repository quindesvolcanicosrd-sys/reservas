import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/fechas.dart';
import '../sesion/sesion.dart';
import 'modelos.dart';

/// Datos de la sección Eventos: carga eventos + cumpleaños de un rango y
/// guarda la asistencia propia (mismo flujo que `_evMarcarAsistencia()` de
/// la web: marcarAsistenciaUsuario y, si salió bien, notificarCambioAsistencia).
class EventosRepo extends ChangeNotifier {
  EventosRepo(this.sesion);

  final Sesion sesion;
  Api get _api => sesion.api;

  List<Evento> eventos = [];
  List<Cumple> cumples = [];
  bool cargando = false;
  String? error;
  DateTime? _cargadoEn;

  static const diasAtras = 30;
  static const diasAdelante = 120;

  Future<void> cargar({bool forzar = false}) async {
    if (cargando) return;
    if (!forzar && _cargadoEn != null && DateTime.now().difference(_cargadoEn!) < const Duration(minutes: 2)) return;
    cargando = true;
    error = null;
    notifyListeners();
    final hoy = Fechas.hoy();
    final desde = Fechas.iso(hoy.subtract(const Duration(days: diasAtras)));
    final hasta = Fechas.iso(hoy.add(const Duration(days: diasAdelante)));
    try {
      final resultados = await Future.wait([
        _api.get('getEventosRango', {'desde': desde, 'hasta': hasta}),
        _api.get('getCumpleañosRango', {'desde': desde, 'hasta': hasta}).catchError((_) => <String, dynamic>{}),
      ]);
      final yo = sesion.nombre ?? '';
      eventos = (resultados[0]['eventos'] as List? ?? const [])
          .map((e) => Evento.desdeJson(e as Map<String, dynamic>, yo))
          .toList()
        ..sort((a, b) {
          final c = a.fecha.compareTo(b.fecha);
          return c != 0 ? c : a.horaInicio.compareTo(b.horaInicio);
        });
      cumples = (resultados[1]['cumpleanos'] as List? ?? const [])
          .map((c) => Cumple.desdeJson(c as Map<String, dynamic>))
          .toList();
      _cargadoEn = DateTime.now();
    } catch (e) {
      error = e is ApiException ? e.message : 'No se pudieron cargar los eventos. Revisa tu conexión.';
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  Evento? porId(String id) {
    for (final e in eventos) {
      if (e.id == id) return e;
    }
    return null;
  }

  /// Guarda la asistencia de forma optimista; si falla, revierte y lanza.
  Future<void> marcar(Evento ev, EstadoRsvp estado) async {
    final anterior = ev.miEstado;
    if (anterior == estado) return;
    ev.miEstado = estado;
    _reemplazarMiRsvp(ev, estado);
    notifyListeners();
    try {
      final res = await _api.post('marcarAsistenciaUsuario', {
        'nombre': sesion.nombre,
        'idEvento': ev.id,
        'estado': estado.valor,
      });
      if (res['exito'] == false) throw ApiException((res['error'] ?? 'No se pudo guardar tu asistencia.').toString());
      // Aviso a admins/equipo (fire-and-forget, igual que la web).
      _api.post('notificarCambioAsistencia', {
        'idEvento': ev.id,
        'estadoNuevo': estado.valor,
        'estadoAnterior': anterior?.valor ?? '',
      }).catchError((_) => <String, dynamic>{});
    } catch (e) {
      ev.miEstado = anterior;
      _reemplazarMiRsvp(ev, anterior);
      notifyListeners();
      rethrow;
    }
  }

  /// Cancela un evento (solo admins): mismo par de acciones que la web
  /// (`_evCancelarEvento()`): adminCancelarEvento y el aviso al equipo.
  Future<void> cancelar(Evento ev) async {
    final adminToken = sesion.adminToken;
    if (adminToken == null) throw ApiException('Solo un admin puede cancelar el evento.');
    final res = await _api.get('adminCancelarEvento', {'adminToken': adminToken, 'idEvento': ev.id});
    if (res['exito'] == false) throw ApiException((res['error'] ?? 'No se pudo cancelar el evento.').toString());
    _api.get('pushEventoCancelado', {
      'adminToken': adminToken,
      'tipo': ev.tipo,
      'fecha': Fechas.iso(ev.fecha),
      'hora': ev.horaInicio,
      'lugar': ev.lugar,
    }).catchError((_) => <String, dynamic>{});
    await cargar(forzar: true);
  }

  void _reemplazarMiRsvp(Evento ev, EstadoRsvp? estado) {
    final yo = (sesion.nombre ?? '').trim().toLowerCase();
    ev.rsvps.removeWhere((r) => r.persona.username.trim().toLowerCase() == yo);
    if (estado != null) {
      ev.rsvps.add(Rsvp(
        persona: Persona(username: sesion.nombre ?? '', nombreDerby: sesion.nombreDerby, fotoPerfil: sesion.fotoPerfil),
        estado: estado,
      ));
    }
  }
}
