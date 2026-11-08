import 'package:coach/core/api.dart';
import 'package:coach/core/datos_pendientes.dart';
import 'package:coach/core/fechas.dart';
import 'package:coach/eventos/anticipada.dart';
import 'package:coach/eventos/eventos_repo.dart';
import 'package:coach/eventos/modelos.dart';
import 'package:coach/sesion/sesion.dart';
import 'package:flutter_test/flutter_test.dart';

Evento _ev(DateTime f, {String tipo = 'Entrenamiento', String id = 'e1'}) => Evento.desdeJson({
  'idEvento': id,
  'fecha': Fechas.iso(f),
  'lugar': 'CCI',
  'tipoIcono': tipo,
  'horaInicio': '19:00',
  'horaFin': '21:00',
  'estado': 'Evento Programado',
}, '');

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
    final r = _repo(
      {'categoria': 'Mirlxs'},
      reservas: [
        {
          'tipo': 'mensual',
          'estado': 'Confirmada',
          'fecha': Fechas.mes(futuro),
          'validezHasta': '${DateTime(futuro.year, futuro.month + 1, 0).day}/${futuro.month}/${futuro.year}',
        },
      ],
    );
    expect(r.motivoSinRespuesta(_ev(futuro)), isNull);
  });
  test('Quindes responde normal; equipo del club no en entrenamientos', () {
    expect(_repo({'categoria': 'Quindes'}).motivoSinRespuesta(_ev(futuro)), isNull);
    expect(_repo({'categoria': 'Quindes', 'necesitaPatines': 'Sí'}).motivoSinRespuesta(_ev(futuro)), contains('equipo del club'));
    expect(_repo({'categoria': 'Quindes', 'necesitaPatines': 'Sí'}).motivoSinRespuesta(_ev(futuro, tipo: 'Partido')), isNull);
  });
  test('Con reserva para el evento no responde', () {
    final r = _repo(
      {'categoria': 'Quindes'},
      reservas: [
        {'tipo': 'clase', 'estado': 'Confirmada', 'fecha': 'e1'},
      ],
    );
    expect(r.motivoSinRespuesta(_ev(futuro)), contains('reserva'));
  });
  test('Cuota vencida ya no cuenta como al día (bug de la web, 2026-11-07)', () {
    final c = Cuota(
      datos: const {},
      esAdmin: false,
      nombre: 'X',
      excepciones: const [],
      reservas: [
        {'tipo': 'mensual', 'estado': 'Confirmada', 'fecha': 'octubre', 'validezHasta': '31/10/2025'},
      ],
    );
    expect(c.alDia, isFalse);
    expect(c.asistireHabilitado, isFalse);
    expect(c.mesPagado(10, 2025), isTrue);
    expect(c.mesPagado(10, 2026), isFalse);
  });
  test('Asistiré anticipado solo en fechas pagadas', () {
    final c = Cuota(
      datos: const {},
      esAdmin: false,
      nombre: 'X',
      excepciones: const [],
      reservas: [
        {
          'tipo': 'mensual',
          'estado': 'Confirmada',
          'fecha': Fechas.mes(futuro),
          'validezHasta': '${DateTime(futuro.year, futuro.month + 1, 0).day}/${futuro.month}/${futuro.year}',
        },
      ],
    );
    expect(c.asistireHabilitado, isTrue);
    expect(c.cubre(_ev(futuro)), isTrue);
    expect(c.cubre(_ev(DateTime(futuro.year, futuro.month + 2, 5))), isFalse);
    expect(Cuota(datos: const {'exenta_cuota': true}, esAdmin: false, nombre: 'X', excepciones: const [], reservas: const []).asistireHabilitado, isTrue);
  });
  test('Meses de asistencia anticipada con año (aaaamm) y reglas viejas', () {
    final hoy = Fechas.hoy();
    final prox = DateTime(hoy.year, hoy.month + 11);
    expect(ReglaAnticipada.ventana().length, 12);
    expect(ReglaAnticipada.ventana().last, prox);
    expect(ReglaAnticipada.coincide(ReglaAnticipada.clave(prox), DateTime(prox.year, prox.month, 15)), isTrue);
    expect(ReglaAnticipada.coincide(ReglaAnticipada.clave(prox), DateTime(prox.year + 1, prox.month, 15)), isFalse);
    expect(ReglaAnticipada.coincide(prox.month, DateTime(prox.year + 1, prox.month, 15)), isTrue);
    expect(ReglaAnticipada.mesDe(202609), DateTime(2026, 9));
  });
  test('Datos pendientes del perfil', () {
    // 6 de seguridad + foto, teléfono, nombre derby y pronombres (roles solo si el servidor los manda).
    expect(DatosPendientes.calcular(const {}).length, 10);
    expect(DatosPendientes.calcular(const {'roles': []}).length, 11);
    final completo = {
      for (final c in [
        'emerg1Nombre',
        'emerg1Telefono',
        'seguro',
        'alergias',
        'enfermedad',
        'medicamentos',
        'atencionMedica',
        'fechaNacimiento',
        'nombreLegal',
        'tipoDocumento',
        'numeroDocumento',
        'callePrincipal',
        'sector',
        'canton',
        'fotoPerfil',
        'telefono',
        'nombreDerby',
        'pronombres',
      ])
        c: 'x',
      'permisosConfigurados': true,
    };
    expect(DatosPendientes.calcular(completo), isEmpty);
  });
}
