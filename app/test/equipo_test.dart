import 'package:coach/equipo/buscador_equipo.dart';
import 'package:coach/equipo/equipo_modelos.dart';
import 'package:flutter_test/flutter_test.dart';

Integrante _p(
  String u, {
  List<String> roles = const [],
  String? cumple,
  String cat = 'Quindes',
  String estado = 'Activx',
  String num = '',
  String? ingreso,
  int asis = 0,
  int ev = 0,
  double pts = 0,
}) => Integrante({
  'username': u,
  'nombreDerby': u[0].toUpperCase() + u.substring(1),
  'rol': cat,
  'roles': roles,
  'cumple': cumple,
  'estado': estado,
  'numeroDerby': num,
  'fechaIngreso': ingreso,
  'asistenciasPeriodo': asis,
  'eventosPeriodo': ev,
  'puntosTotal': pts,
  'ultimaAsistencia': DateTime.now().toIso8601String().substring(0, 10),
});

void main() {
  test('Inactivx: 30+ días sin asistir, salvo de viaje o lesionadx', () {
    String hace(int d) => DateTime.now().subtract(Duration(days: d)).toIso8601String().substring(0, 10);
    expect(Integrante({'estado': 'Activx', 'ultimaAsistencia': hace(5)}).inactivx, isFalse);
    expect(Integrante({'estado': 'Activx', 'ultimaAsistencia': hace(31)}).inactivx, isTrue);
    expect(Integrante({'estado': 'Activx'}).inactivx, isTrue);
    expect(Integrante({'estado': 'De viaje', 'ultimaAsistencia': hace(60)}).inactivx, isFalse);
    expect(Integrante({'estado': 'Activx', 'ultimaAsistencia': hace(40)}).grupo, 'Inactivxs');
  });

  final hoy = DateTime(2026, 11, 7);
  final equipo = [
    _p('lola', roles: ['Jammer', 'Blocker'], cumple: '12-14', num: '12'),
    _p('maru', roles: ['Blocker'], cat: 'Mirlxs', cumple: '11-09', ingreso: '2023-11-10'),
    _p('nina', roles: ['Coach'], estado: 'De viaje'),
    _p('olga', estado: 'Inactivx'),
  ];
  List<String> nombres(String q) => BuscadorEquipo.buscar(q, equipo, favoritos: {'nina'}, esAdmin: false, hoy: hoy).map((r) => r.persona.username).toList();

  test('Busca por rol con plural y sin tildes', () {
    expect(nombres('jammers'), ['lola']);
    expect(nombres('Blockers'), ['lola', 'maru']);
  });
  test('Busca por mes (cumpleaños o aniversario) y explica por qué', () {
    final r = BuscadorEquipo.buscar('diciembre', equipo, favoritos: const {}, esAdmin: false, hoy: hoy);
    expect(r.single.persona.username, 'lola');
    expect(r.single.motivos.single, 'Cumple el 14 de diciembre');
    expect(nombres('noviembre'), ['maru']);
  });
  test('Combina palabras, categoría, estado, número y favoritos', () {
    expect(nombres('blocker mirlxs'), ['maru']);
    expect(nombres('de viaje'), ['nina']);
    expect(nombres('#12'), ['lola']);
    expect(nombres('favoritos'), ['nina']);
    expect(nombres('inactivxs'), ['olga']);
  });
  test('Tolera un error de tipeo en el nombre', () {
    expect(nombres('lolla'), ['lola']);
  });
  test('Dato de la fila: estado fijo; si no, lo más relevante', () {
    expect(datosRelevantes(equipo[2], hoy).single.fijo, isTrue);
    final m = datosRelevantes(equipo[1], hoy).map((d) => d.texto).toList();
    expect(m.first, 'Cumple en 2 días');
    expect(m[1], '3 años en el equipo en 3 días');
    final alta = _p('pia', asis: 9, ev: 10, pts: 12);
    expect(datosRelevantes(alta, hoy).map((d) => d.texto), ['90% de asistencia', '12 pts este mes']);
  });
}
