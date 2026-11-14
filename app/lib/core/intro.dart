import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tema.dart';

/// Entrada de la app. Encima de todo, mientras la app carga por debajo, se
/// ve el logo (igual que la pantalla de arranque nativa, sin corte) y,
/// cuando la primera pantalla está lista, se desvanece hacia la app.
///
/// Victor, 2026-11-14: se quitó la animación con revelado de máscara; "con
/// que esté el logo y luego fade out a la app está bien". Nunca espera más
/// de [espera] por los datos.
class IntroPivot extends StatefulWidget {
  const IntroPivot({super.key, required this.child, this.espera = const Duration(seconds: 6)});
  final Widget child;
  final Duration espera;

  /// La app avisa aquí cuando terminó de cargar lo de la primera pantalla.
  static final listo = ValueNotifier<bool>(false);

  @override
  State<IntroPivot> createState() => _IntroPivotState();
}

class _IntroPivotState extends State<IntroPivot> {
  bool _visible = true;
  bool _quitado = false;
  bool _minimo = false;
  Timer? _tope, _min;

  @override
  void initState() {
    super.initState();
    IntroPivot.listo.addListener(_quizasSalir);
    // El logo se ve al menos un instante (sin parpadeo si todo ya cargó).
    _min = Timer(const Duration(milliseconds: 450), () {
      _minimo = true;
      _quizasSalir();
    });
    _tope = Timer(widget.espera, () {
      if (!IntroPivot.listo.value) IntroPivot.listo.value = true;
    });
  }

  void _quizasSalir() {
    if (!mounted || !_minimo || !IntroPivot.listo.value || !_visible) return;
    setState(() => _visible = false);
  }

  @override
  void dispose() {
    IntroPivot.listo.removeListener(_quizasSalir);
    _tope?.cancel();
    _min?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final reducir = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Stack(
      children: [
        widget.child,
        if (!_quitado)
          Positioned.fill(
            // Barras del sistema del color del fondo mientras se ve el logo.
            child: AnnotatedRegion<SystemUiOverlayStyle>(
              value: SystemUiOverlayStyle(
                systemNavigationBarColor: p.fondo,
                systemNavigationBarIconBrightness: oscuro ? Brightness.light : Brightness.dark,
                statusBarColor: const Color(0x00000000),
                statusBarIconBrightness: oscuro ? Brightness.light : Brightness.dark,
              ),
              child: IgnorePointer(
                ignoring: !_visible,
                child: AnimatedOpacity(
                  opacity: _visible ? 1 : 0,
                  duration: Duration(milliseconds: reducir ? 120 : 420),
                  curve: Curves.easeOut,
                  onEnd: () {
                    if (!_visible && mounted) setState(() => _quitado = true);
                  },
                  child: ColoredBox(
                    color: p.fondo,
                    child: Center(child: Image.asset('assets/splash/logo_ancho.png', width: 150)),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
