import 'dart:ui';

import 'package:flutter/material.dart';

import 'tema.dart';

/// Fondo de vidrio para barras: desenfoca lo que pasa por detrás.
class Vidrio extends StatelessWidget {
  const Vidrio({super.key, required this.child, this.abajo = false});
  final Widget child;

  /// Barra inferior (hoy se ve igual que las de arriba).
  final bool abajo;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    // Todas las barras iguales (Victor, 2026-11-13 arriba y 2026-11-14
    // abajo): solo el desenfoque con el fondo translúcido, sin tinte,
    // degradado, reflejo ni borde.
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: PivotVidrio.desenfoque, sigmaY: PivotVidrio.desenfoque),
        child: ColoredBox(color: PivotVidrio.plano(p), child: child),
      ),
    );
  }
}

/// Alto de la barra superior de vidrio (estado + toolbar) para dejar ese
/// espacio arriba del contenido cuando el cuerpo pasa por detrás
/// (`extendBodyBehindAppBar`). Se calcula con un `context` de fuera del
/// Scaffold (Victor, 2026-11-14: barras de vidrio en toda la app).
double altoBarra(BuildContext context) => MediaQuery.paddingOf(context).top + kToolbarHeight;
