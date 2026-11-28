import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:coach/reglamento/reglamento_datos.dart';

void main() {
  final r = Reglamento.desdeJson(jsonDecode(File('assets/reglamento.json').readAsStringSync()) as Map<String, dynamic>);

  test('el reglamento trae sus partes, casos, glosario y faltas', () {
    expect(r.partes.map((p) => p.id), containsAll(['reglas', 'casos', 'senales', 'glosario', 'nso']));
    expect(r.partes.any((p) => p.id == 'statsbook'), isFalse);
    expect(r.casos.length, greaterThan(100));
    expect(r.glosario.length, greaterThan(60));
    expect(r.faltas.map((f) => f.codigo), containsAll(['B', 'X', 'G']));
    expect(r.reglaPorNumero('4.1.1')?.titulo, contains('zona de objetivo'));
  });

  test('el buscador entiende preguntas y códigos', () {
    final codo = r.buscar('¿puedo bloquear con el codo?');
    expect(codo, isNotEmpty);
    expect(codo.take(6).whereType<Regla>().any((s) => s.num.startsWith('4.1.2') || s.num.startsWith('2.4.2')), isTrue);
    expect(r.buscar('back block').first, isA<Falta>());
    expect((r.buscar('X').single as Falta).codigo, 'X');
    expect(r.buscar('jammer líder').take(3).any((x) => x is Termino || (x is Regla && x.num == '2.2.2')), isTrue);
  });

  test('los casos dicen si hay falta', () {
    final con = r.casos.where((c) => c.hayFalta == true).length;
    final sin = r.casos.where((c) => c.hayFalta == false).length;
    expect(con, greaterThan(20));
    expect(sin, greaterThan(20));
  });
}
