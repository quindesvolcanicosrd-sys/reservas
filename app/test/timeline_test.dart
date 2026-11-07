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
    // Con el panel abierto, scrollear el timeline lo cierra.
    await t.tap(find.byIcon(Icons.keyboard_arrow_down_rounded));
    await t.pumpAndSettle();
    expect(find.byType(PanelCalendario), findsOneWidget);
    // Arrastrar el timeline hacia arriba cierra el calendario (se mueven juntos).
    await t.dragFrom(const Offset(200, 560), const Offset(0, -450));
    await t.pumpAndSettle();
    expect(find.byType(PanelCalendario), findsNothing);
    // El filtro guardado se cargó: la lupa tiene el punto.
    expect(find.byType(Badge), findsWidgets);
    // Atrás con el buscador abierto lo cierra (no sale de la app).
    await t.tap(find.byIcon(Icons.search_rounded));
    await t.pumpAndSettle();
    expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    expect(find.byIcon(Icons.arrow_back_rounded), findsNothing);
    expect(find.byType(TimelineScreen), findsOneWidget);
    senal.disparar();
    await t.pumpAndSettle();
  });
}
