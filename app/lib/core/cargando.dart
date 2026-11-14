import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

import 'tema.dart';

/// Loader de Pivot: la animación en bucle de Victor (`assets/lottie/loop.json`,
/// 2026-11-12; reemplaza a las formas de estrella y círculo). El archivo es
/// un lienzo de pantalla completa con la P al centro: aquí se recorta a un
/// cuadrado de [tamano]. Los trazos van del rojo de marca a transparente
/// (en el archivo, de blanco a negro). Con "reducir animaciones" queda quieto.
class PivotCargando extends StatefulWidget {
  const PivotCargando({super.key, this.tamano = 92, this.progreso, this.centrarEnPantalla = true});
  final double tamano;

  /// Se acomoda al centro de la PANTALLA y no del espacio que le queda bajo
  /// la barra superior (Victor, 2026-11-13: se veía abajo).
  final bool centrarEnPantalla;

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
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200), value: widget.progreso ?? 0);
  LottieComposition? _comp;
  final _clave = GlobalKey();
  double? _dy; // corrimiento para quedar al centro de la pantalla

  // Lienzo del archivo y caja que ocupa la P (con sus anillos) en él.
  static const _lienzo = Size(1125, 2436);
  static const _caja = 820.0;

  @override
  void initState() {
    super.initState();
    PivotCargando.composicion.then((c) {
      if (mounted) setState(() => _comp = c);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _medir());
  }

  void _medir() {
    if (!mounted) return;
    var dy = 0.0;
    final caja = _clave.currentContext?.findRenderObject() as RenderBox?;
    if (widget.centrarEnPantalla && caja != null && caja.hasSize) {
      final centro = caja.localToGlobal(caja.size.center(Offset.zero)).dy;
      dy = (MediaQuery.sizeOf(context).height / 2 - centro).clamp(-90.0, 90.0);
    }
    setState(() => _dy = dy);
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
    // Aparece con un fundido ya en su lugar (sin saltos). Siempre centrado
    // en el espacio que recibe (Victor, 2026-11-13: en Pivots y permisos y
    // otras pantallas quedaba pegado a la izquierda cuando el padre no lo
    // centraba).
    return Semantics(
      label: 'Cargando',
      child: Center(
        child: Transform.translate(
          offset: Offset(0, _dy ?? 0),
          child: AnimatedOpacity(
            opacity: _dy == null || _comp == null ? 0 : 1,
            duration: const Duration(milliseconds: 220),
            child: SizedBox.square(
              key: _clave,
              dimension: widget.tamano,
              child: _comp == null
                  ? null
                  : RepaintBoundary(
                      child: ClipRect(
                        child: OverflowBox(
                          maxWidth: _lienzo.width * k,
                          maxHeight: _lienzo.height * k,
                          child: Lottie(
                            composition: _comp,
                            controller: _c,
                            // El archivo es de 25 cuadros por segundo: sin esto se
                            // dibuja a 25 y se ve trabado. Así interpola a 60/120.
                            frameRate: FrameRate.max,
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
            ),
          ),
        ),
      ),
    );
  }
}
