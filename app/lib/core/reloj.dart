import 'dart:async';

import 'package:flutter/widgets.dart';

/// Reloj compartido que avisa justo al cambiar cada minuto y al volver a la
/// app (Victor, 2026-11-12: la línea de "ahora" del timeline no avanzaba y
/// "Tomar asistencia" no aparecía al llegar la hora con la app abierta).
class RelojMinuto extends ChangeNotifier with WidgetsBindingObserver {
  RelojMinuto._() {
    WidgetsBinding.instance.addObserver(this);
  }

  static final RelojMinuto instancia = RelojMinuto._();

  Timer? _t;
  int _oyentes = 0;

  // El temporizador solo corre mientras alguna pantalla escucha.
  @override
  void addListener(VoidCallback listener) {
    super.addListener(listener);
    if (_oyentes++ == 0) _programar();
  }

  @override
  void removeListener(VoidCallback listener) {
    super.removeListener(listener);
    if (--_oyentes <= 0) {
      _oyentes = 0;
      _t?.cancel();
      _t = null;
    }
  }

  void _programar() {
    _t?.cancel();
    final ahora = DateTime.now();
    final siguiente = DateTime(ahora.year, ahora.month, ahora.day, ahora.hour, ahora.minute + 1);
    _t = Timer(siguiente.difference(ahora) + const Duration(milliseconds: 50), () {
      notifyListeners();
      _programar();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _oyentes > 0) {
      notifyListeners();
      _programar();
    }
  }
}
