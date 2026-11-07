import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:coach/core/api.dart';
import 'package:coach/core/tema.dart';
import 'package:coach/eventos/calendario_panel.dart';
import 'package:coach/eventos/eventos_repo.dart';
import 'package:coach/sesion/sesion.dart';

void main() {
  testWidgets('panel calendario sin desbordes y desliza meses', (t) async {
    final repo = EventosRepo(Sesion(Api()));
    DateTime? mes;
    DateTime? elegido;
    var arrastre = 0.0;
    await t.pumpWidget(
      MaterialApp(
        theme: construirTema(Brightness.light),
        home: Scaffold(
          body: Column(
            children: [
              PanelCalendario(
                repo: repo,
                mesInicial: DateTime(2026, 11),
                alCambiarMes: (m) => mes = m,
                alElegirDia: (_) {},
                alMesElegido: (m) => elegido = m,
                alArrastrar: (dy) => arrastre += dy,
                alSoltar: (_) {},
              ),
            ],
          ),
        ),
      ),
    );
    await t.pump(const Duration(seconds: 1));
    expect(find.text('30'), findsWidgets);
    await t.fling(find.byType(PageView), const Offset(-300, 0), 1000);
    await t.pumpAndSettle();
    expect(mes, DateTime(2026, 12));
    expect(elegido, DateTime(2026, 12));
    await t.drag(find.byType(PageView), const Offset(0, -120));
    await t.pumpAndSettle();
    expect(arrastre, lessThan(-50));
  });
}
