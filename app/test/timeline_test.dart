import 'package:coach/core/api.dart';
import 'package:coach/core/tema.dart';
import 'package:coach/eventos/calendario_panel.dart';
import 'package:coach/eventos/eventos_repo.dart';
import 'package:coach/eventos/timeline_screen.dart';
import 'package:coach/sesion/sesion.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('calendario se abre, se cierra arrastrando y los filtros se guardan', (t) async {
    SharedPreferences.setMockInitialValues({'eventos.filtroTipo': 'Partido'});
    final repo = EventosRepo(Sesion(Api()));
    final senal = SenalHoy();
    await t.pumpWidget(MaterialApp(theme: construirTema(Brightness.light), home: TimelineScreen(repo: repo, irAHoy: senal)));
    await t.pump(const Duration(seconds: 1));
    // Abrir tocando el mes.
    await t.tap(find.byIcon(Icons.keyboard_arrow_down_rounded));
    await t.pumpAndSettle();
    expect(find.byType(PanelCalendario), findsOneWidget);
    // Tocar un día deja el panel abierto.
    await t.tap(find.text('15').first);
    await t.pumpAndSettle();
    expect(find.byType(PanelCalendario), findsOneWidget);
    // Arrastrar hacia arriba lo cierra.
    await t.drag(find.byType(PanelCalendario), const Offset(0, -400));
    await t.pumpAndSettle();
    expect(find.byType(PanelCalendario), findsNothing);
    // El filtro guardado se cargó: la lupa tiene el punto.
    expect(find.byType(Badge), findsWidgets);
    senal.disparar();
    await t.pumpAndSettle();
  });
}
