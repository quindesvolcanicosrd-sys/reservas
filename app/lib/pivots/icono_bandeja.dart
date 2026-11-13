import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/tema.dart';

/// Ícono de la Bandeja (Victor, 2026-11-13): bandeja normal; con novedades
/// pasa a una campana que se balancea con un punto rojo arriba a la derecha,
/// y vuelve a bandeja solo cuando se abre y se ve. Para Pivots, el número de
/// pedidos por revisar va en la bandeja.
class IconoBandeja extends StatefulWidget {
  const IconoBandeja({super.key, required this.novedades, this.pendientes = 0});
  final bool novedades;
  final int pendientes;

  @override
  State<IconoBandeja> createState() => _IconoBandejaState();
}

class _IconoBandejaState extends State<IconoBandeja> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));

  @override
  void initState() {
    super.initState();
    if (widget.novedades) _c.repeat();
  }

  @override
  void didUpdateWidget(IconoBandeja old) {
    super.didUpdateWidget(old);
    if (widget.novedades && !_c.isAnimating) _c.repeat();
    if (!widget.novedades && _c.isAnimating) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (hijo, a) => ScaleTransition(
        scale: a,
        child: FadeTransition(opacity: a, child: hijo),
      ),
      child: widget.novedades
          ? SizedBox(
              key: const ValueKey('campana'),
              width: 28,
              height: 28,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Center(
                    child: AnimatedBuilder(
                      animation: _c,
                      // Balanceo corto al principio de cada ciclo y quieta el resto.
                      builder: (_, hijo) {
                        final t = _c.value;
                        final ang = t < 0.4 ? math.sin(t / 0.4 * math.pi * 4) * 0.35 * (1 - t / 0.4) : 0.0;
                        return Transform.rotate(angle: ang, alignment: Alignment.topCenter, child: hijo);
                      },
                      child: const Icon(Icons.notifications_rounded),
                    ),
                  ),
                  Positioned(
                    right: 1,
                    top: 1,
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: p.marca,
                        shape: BoxShape.circle,
                        border: Border.all(color: p.fondo, width: 1.5),
                      ),
                    ),
                  ),
                ],
              ),
            )
          : Badge(
              key: const ValueKey('bandeja'),
              isLabelVisible: widget.pendientes > 0,
              backgroundColor: p.marca,
              label: Text('${widget.pendientes}'),
              child: const Icon(Icons.inbox_rounded),
            ),
    );
  }
}
