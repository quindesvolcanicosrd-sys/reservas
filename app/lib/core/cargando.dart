import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

import 'tema.dart';

/// Loader de Pivot: la animación en bucle de Victor (`assets/lottie/loop.json`,
/// 2026-11-12; reemplaza a las formas de estrella y círculo). El archivo es
/// un lienzo de pantalla completa con la P al centro: aquí se recorta a un
/// cuadrado de [tamano]. Los trazos van del rojo de marca a transparente
/// (en el archivo, de blanco a negro). Con "reducir animaciones" queda quieto.
class PivotCargando extends StatefulWidget {
  const PivotCargando({super.key, this.tamano = 72, this.progreso});
  final double tamano;

  /// Solo pruebas: dibuja un instante fijo del bucle (0 a 1).
  @visibleForTesting
  final double? progreso;

  // La composición se lee una vez y la comparten todos los loaders.
  static Future<LottieComposition>? _comp;
  static Future<LottieComposition> get composicion => _comp ??= AssetLottie('assets/lottie/loop.json').load();

  @override
  State<PivotCargando> createState() => _PivotCargandoState();
}

class _PivotCargandoState extends State<PivotCargando> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(seconds: 3), value: widget.progreso ?? 0);
  LottieComposition? _comp;

  // Lienzo del archivo y caja que ocupa la P (con sus anillos) en él.
  static const _lienzo = Size(1125, 2436);
  static const _caja = 820.0;

  @override
  void initState() {
    super.initState();
    PivotCargando.composicion.then((c) {
      if (mounted) setState(() => _comp = c);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations || widget.progreso != null) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final k = widget.tamano / _caja;
    return Semantics(
      label: 'Cargando',
      child: SizedBox.square(
        dimension: widget.tamano,
        child: _comp == null
            ? null
            : ClipRect(
                child: OverflowBox(
                  maxWidth: _lienzo.width * k,
                  maxHeight: _lienzo.height * k,
                  child: Lottie(
                    composition: _comp,
                    controller: _c,
                    width: _lienzo.width * k,
                    height: _lienzo.height * k,
                    fit: BoxFit.fill,
                    delegates: LottieDelegates(
                      values: [
                        ValueDelegate.gradientColor(const ['**', 'Gradient Stroke 1'], value: [p.marca, p.marca.withValues(alpha: 0)]),
                      ],
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
