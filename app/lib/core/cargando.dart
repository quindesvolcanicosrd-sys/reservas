import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'tema.dart';

/// Loader de Pivot (formas de Victor, 2026-11-08; inspirado en las cargas de
/// Google Home / Google TV): estrella, flor, círculo con estrella y cuenco se
/// transforman una en otra en bucle. Sin la cápsula del lado izquierdo y más
/// grande (Victor, 2026-11-12). La forma se encoge y vuelve a crecer con
/// rebote cuando cambia, las estrellas giran un pico con ease-in-out y los
/// colores se cruzan entre rojo y vino (rosa en oscuro). Con "reducir
/// animaciones" queda quieto en la primera forma.
class PivotCargando extends StatefulWidget {
  const PivotCargando({super.key, this.tamano = 96, this.progreso});
  final double tamano;

  /// Solo pruebas: dibuja un instante fijo del bucle (0 a 1).
  @visibleForTesting
  final double? progreso;

  @override
  State<PivotCargando> createState() => _PivotCargandoState();
}

class _PivotCargandoState extends State<PivotCargando> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 6000), value: widget.progreso ?? 0);

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
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: 'Cargando',
      child: SizedBox.square(
        dimension: widget.tamano,
        child: CustomPaint(painter: _Pintor(_c, PivotPaleta.cargandoRojo, oscuro ? PivotPaleta.cargandoRosa : PivotPaleta.cargandoVino)),
      ),
    );
  }
}

enum _Tipo { estrella, flor, circulo, cuenco }

/// Un "cuadro" del bucle, en un lienzo de 100×100.
class _Cuadro {
  const _Cuadro({required this.capsulaRoja, required this.tipo, required this.x, required this.y, required this.r, this.giro = 0, this.fusion = false});
  final bool capsulaRoja;
  final _Tipo tipo;
  final double x, y, r; // centro y radio del acento
  final double giro; // grados
  /// Lo que sale de la cápsula toma el color de la cápsula (se "funden").
  final bool fusion;
}

// Las 6 formas del SVG, en orden.
const _cuadros = [
  _Cuadro(capsulaRoja: true, tipo: _Tipo.estrella, x: 67, y: 33, r: 22),
  _Cuadro(capsulaRoja: false, tipo: _Tipo.flor, x: 64, y: 31, r: 24, giro: 20, fusion: true),
  _Cuadro(capsulaRoja: true, tipo: _Tipo.circulo, x: 55, y: 30, r: 25, giro: 36),
  _Cuadro(capsulaRoja: false, tipo: _Tipo.circulo, x: 62, y: 42, r: 24, giro: 72),
  _Cuadro(capsulaRoja: true, tipo: _Tipo.estrella, x: 64, y: 42, r: 25, giro: 108),
  _Cuadro(capsulaRoja: true, tipo: _Tipo.cuenco, x: 62, y: 44, r: 21),
];

class _Pintor extends CustomPainter {
  _Pintor(this.a, this.rojo, this.otro) : super(repaint: a);
  final Animation<double> a;
  final Color rojo, otro;

  static double _lerp(double x, double y, double t) => x + (y - x) * t;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 100, size.height / 100);

    final fase = a.value * _cuadros.length;
    final i = fase.floor() % _cuadros.length;
    final de = _cuadros[i], a2 = _cuadros[(i + 1) % _cuadros.length];
    // 30 % quieto, 70 % transición suave.
    final bruto = ((fase - fase.floor() - 0.3) / 0.7).clamp(0.0, 1.0);
    final t = Curves.easeInOutCubic.transform(bruto);

    // Colores cruzados entre los dos tonos de la marca.
    final colForma = Color.lerp(de.capsulaRoja ? otro : rojo, a2.capsulaRoja ? otro : rojo, t)!;
    final colInterior = Color.lerp(de.capsulaRoja ? rojo : otro, a2.capsulaRoja ? rojo : otro, t)!;

    // Sin la cápsula, cada forma va centrada y más grande; conserva un leve
    // desplazamiento entre cuadros para que el cambio se sienta vivo.
    double cx(_Cuadro c) => 50 + (c.x - 62) * 0.35;
    double cy(_Cuadro c) => 50 + (c.y - 38) * 0.35;
    const escala = 1.75;
    final x = _lerp(cx(de), cx(a2), t), y = _lerp(cy(de), cy(a2), t);
    final giro = _lerp(de.giro, a2.giro + (a2.giro < de.giro ? 360 : 0), t);
    final cambia = de.tipo != a2.tipo;
    final _Cuadro forma;
    double r;
    if (!cambia) {
      forma = de;
      r = _lerp(de.r, a2.r, t) * escala;
    } else if (bruto < 0.5) {
      forma = de;
      r = de.r * escala * (1 - Curves.easeInCubic.transform(bruto * 2));
    } else {
      forma = a2;
      r = a2.r * escala * Curves.easeOutBack.transform((bruto - 0.5) * 2);
    }

    final pintura = Paint()..isAntiAlias = true;
    if (forma.tipo == _Tipo.cuenco) {
      canvas.drawPath(_cuenco(x + r * 0.2, y, r), pintura..color = colForma);
      canvas.restore();
      return;
    }
    canvas.drawPath(_acento(forma.tipo, x, y, r, giro), pintura..color = colForma);
    // Círculo con estrella adentro (formas 3 y 4).
    if (forma.tipo == _Tipo.circulo && r > 4) {
      canvas.drawPath(_estrella(x, y, r * 0.62, giro, 5, 0.55), pintura..color = colInterior);
    }
    canvas.restore();
  }

  Path _acento(_Tipo tipo, double x, double y, double r, double giro) => switch (tipo) {
    _Tipo.estrella => _estrella(x, y, r, giro, 5, 0.5),
    _Tipo.flor => _flor(x, y, r, giro),
    _ => Path()..addOval(Rect.fromCircle(center: Offset(x, y), radius: r)),
  };

  /// Estrella de puntas redondeadas (picos con curvas cuadráticas).
  Path _estrella(double cx, double cy, double r, double giro, int puntas, double interior) {
    final p = Path();
    final n = puntas * 2;
    final pts = <Offset>[];
    for (var k = 0; k < n; k++) {
      final ang = (giro - 90) * math.pi / 180 + k * math.pi / puntas;
      final rr = k.isEven ? r : r * interior;
      pts.add(Offset(cx + rr * math.cos(ang), cy + rr * math.sin(ang)));
    }
    // Esquinas suavizadas: se corta cada esquina y se une con una curva.
    Offset medio(Offset a, Offset b, double f) => Offset.lerp(a, b, f)!;
    for (var k = 0; k < n; k++) {
      final prev = pts[(k - 1 + n) % n], act = pts[k], sig = pts[(k + 1) % n];
      final entrada = medio(act, prev, k.isEven ? 0.28 : 0.18), salida = medio(act, sig, k.isEven ? 0.28 : 0.18);
      k == 0 ? p.moveTo(entrada.dx, entrada.dy) : p.lineTo(entrada.dx, entrada.dy);
      p.quadraticBezierTo(act.dx, act.dy, salida.dx, salida.dy);
    }
    return p..close();
  }

  /// Flor de 8 pétalos (círculo festoneado).
  Path _flor(double cx, double cy, double r, double giro) {
    var p = Path()..addOval(Rect.fromCircle(center: Offset(cx, cy), radius: r * 0.72));
    for (var k = 0; k < 8; k++) {
      final ang = (giro + k * 45) * math.pi / 180;
      final c = Offset(cx + r * 0.66 * math.cos(ang), cy + r * 0.66 * math.sin(ang));
      p = Path.combine(PathOperation.union, p, Path()..addOval(Rect.fromCircle(center: c, radius: r * 0.34)));
    }
    return p;
  }

  /// Cuenco de la P: rectángulo con el lado derecho redondo.
  Path _cuenco(double x, double y, double r) {
    final rect = Rect.fromLTRB(x - r * 1.4, y - r, x + r, y + r);
    return Path()..addRRect(RRect.fromRectAndCorners(rect, topRight: Radius.circular(r), bottomRight: Radius.circular(r)));
  }

  @override
  bool shouldRepaint(_Pintor old) => old.rojo != rojo || old.otro != otro;
}
