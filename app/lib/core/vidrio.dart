import 'dart:ui';

import 'package:flutter/material.dart';

import 'tema.dart';

/// Fondo de vidrio para barras: desenfoca lo que pasa por detrás, con el
/// degradado y el reflejo de `PivotVidrio` y una línea fina en el borde.
class Vidrio extends StatelessWidget {
  const Vidrio({super.key, required this.child, this.abajo = false});
  final Widget child;

  /// true = barra inferior (la línea va arriba y el degradado sube).
  final bool abajo;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final linea = BorderSide(color: PivotVidrio.borde(p), width: 0.6);
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: PivotVidrio.desenfoque, sigmaY: PivotVidrio.desenfoque),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: PivotVidrio.degradado(p, haciaArriba: abajo),
            border: abajo ? Border(top: linea) : Border(bottom: linea),
          ),
          child: Stack(
            children: [
              // Reflejo: una franja de brillo en el borde de arriba.
              Positioned(
                left: 0,
                right: 0,
                top: 0,
                height: 18,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [PivotVidrio.reflejo(p), PivotVidrio.reflejo(p).withValues(alpha: 0)],
                      ),
                    ),
                  ),
                ),
              ),
              child,
            ],
          ),
        ),
      ),
    );
  }
}
