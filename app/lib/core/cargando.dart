import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'tema.dart';

/// Loader de Pivot (formas de Victor, 2026-11-08; inspirado en las cargas de
/// Google Home / Google TV): las 6 variaciones de la "P" —cápsula inclinada
/// con estrella, flor, círculo con estrella o cuenco— se transforman una en
/// otra en bucle. La cápsula respira e inclina, el acento se encoge y vuelve
/// a crecer con rebote cuando cambia de forma, las estrellas giran un pico
/// con ease-in-out y los colores se cruzan entre rojo y vino (rosa en
/// oscuro). Con "reducir animaciones" queda quieto en la primera forma.
class PivotCargando extends StatefulWidget {
  const PivotCargando({super.key, this.tamano = 48, this.progreso});
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

    // Cápsula: color cruzado, respira e inclina un poco durante el cambio.
    final colCapsula = Color.lerp(de.capsulaRoja ? rojo : otro, a2.capsulaRoja ? rojo : otro, t)!;
    final colAcento = Color.lerp(de.capsulaRoja ? otro : rojo, a2.capsulaRoja ? otro : rojo, t)!;
    final pulso = math.sin(math.pi * t);
    final capsula = _capsula(1 - 0.07 * pulso, 18 + 8 * pulso);

    // Acento: posición interpolada; si cambia de forma, se encoge y crece.
    final x = _lerp(de.x, a2.x, t), y = _lerp(de.y, a2.y, t);
    final giro = _lerp(de.giro, a2.giro + (a2.giro < de.giro ? 360 : 0), t);
    final cambia = de.tipo != a2.tipo;
    final _Cuadro forma;
    double r;
    if (!cambia) {
      forma = de;
      r = _lerp(de.r, a2.r, t);
    } else if (bruto < 0.5) {
      forma = de;
      r = de.r * (1 - Curves.easeInCubic.transform(bruto * 2));
    } else {
      forma = a2;
      r = a2.r * Curves.easeOutBack.transform((bruto - 0.5) * 2);
    }
    final fusion = cambia ? (bruto < 0.5 ? de.fusion : a2.fusion) : (t < 0.5 ? de.fusion : a2.fusion);

    final pintura = Paint()..isAntiAlias = true;
    // El cuenco va detrás de la cápsula (la "P").
    if (forma.tipo == _Tipo.cuenco) {
      canvas.drawPath(_cuenco(x, y, r), pintura..color = colAcento);
      canvas.drawPath(capsula, pintura..color = colCapsula);
      canvas.restore();
      return;
    }
    canvas.drawPath(capsula, pintura..color = colCapsula);
    final acento = _acento(forma.tipo, x, y, r, giro);
    if (fusion) {
      // Fuera de la cápsula: color de la cápsula; dentro: el contraste.
      canvas.drawPath(acento, pintura..color = colCapsula);
      canvas.save();
      canvas.clipPath(capsula);
      canvas.drawPath(acento, pintura..color = colAcento);
      canvas.restore();
    } else {
      canvas.drawPath(acento, pintura..color = colAcento);
    }
    // Círculo con estrella adentro (formas 3 y 4).
    if (forma.tipo == _Tipo.circulo && r > 4) {
      canvas.drawPath(_estrella(x, y, r * 0.62, giro, 5, 0.55), pintura..color = colCapsula);
    }
    canvas.restore();
  }

  /// Cápsula inclinada (cuerpo de la P), centrada en (44, 58).
  Path _capsula(double escala, double grados) {
    const w = 32.0, h = 70.0;
    final rect = Rect.fromCenter(center: Offset.zero, width: w * escala, height: h * escala);
    final m = Matrix4.identity()
      ..translateByDouble(44, 58, 0, 1)
      ..rotateZ(grados * math.pi / 180);
    return (Path()..addRRect(RRect.fromRectAndRadius(rect, Radius.circular(w * escala / 2)))).transform(m.storage);
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
