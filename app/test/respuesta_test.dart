import 'package:coach/core/api.dart';
import 'package:coach/core/fechas.dart';
import 'package:coach/eventos/anticipada.dart';
import 'package:coach/eventos/eventos_repo.dart';
import 'package:coach/eventos/modelos.dart';
import 'package:coach/sesion/sesion.dart';
import 'package:flutter_test/flutter_test.dart';

Evento _ev(DateTime f, {String tipo = 'Entrenamiento', String id = 'e1'}) => Evento.desdeJson(
  {'idEvento': id, 'fecha': Fechas.iso(f), 'lugar': 'CCI', 'tipoIcono': tipo, 'horaInicio': '19:00', 'horaFin': '21:00', 'estado': 'Evento Programado'},
  '',
);

EventosRepo _repo(Map<String, dynamic> datos, {List<Map<String, dynamic>> reservas = const []}) {
  final s = Sesion(Api())..datos = datos;
  return EventosRepo(s)..cuotaParaPruebas = Cuota(datos: datos, esAdmin: false, nombre: 'X', reservas: reservas, excepciones: const []);
}

void main() {
  final futuro = Fechas.hoy().add(const Duration(days: 40));
  test('Mirlxs sin el mes pagado no puede responder', () {
    expect(_repo({'categoria': 'Mirlxs'}).motivoSinRespuesta(_ev(futuro)), contains('pagado'));
  });
  test('Mirlxs con el mes pagado sí puede', () {
    final r = _repo({'categoria': 'Mirlxs'}, reservas: [
      {'tipo': 'mensual', 'estado': 'Confirmada', 'fecha': Fechas.mes(futuro)},
    ]);
    expect(r.motivoSinRespuesta(_ev(futuro)), isNull);
  });
  test('Quindes responde normal; equipo del club no en entrenamientos', () {
    expect(_repo({'categoria': 'Quindes'}).motivoSinRespuesta(_ev(futuro)), isNull);
    expect(_repo({'categoria': 'Quindes', 'necesitaPatines': 'Sí'}).motivoSinRespuesta(_ev(futuro)), contains('equipo del club'));
    expect(_repo({'categoria': 'Quindes', 'necesitaPatines': 'Sí'}).motivoSinRespuesta(_ev(futuro, tipo: 'Partido')), isNull);
  });
  test('Con reserva para el evento no responde', () {
    final r = _repo({'categoria': 'Quindes'}, reservas: [
      {'tipo': 'clase', 'estado': 'Confirmada', 'fecha': 'e1'},
    ]);
    expect(r.motivoSinRespuesta(_ev(futuro)), contains('reserva'));
  });
}
