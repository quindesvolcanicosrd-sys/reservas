import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'tema.dart';

/// Un paso del tour: resalta el widget de [clave] con un recorte en el velo.
/// Si el widget no está en pantalla (p. ej. no hay eventos), el paso se salta.
class PasoTour {
  const PasoTour({required this.clave, required this.titulo, required this.texto, this.sinHalo = false, this.ajuste});
  final GlobalKey clave;

  /// Recorta el área del widget (p. ej. una sola pestaña de la barra inferior).
  final Rect Function(Rect)? ajuste;
  final String titulo;
  final String texto;

  /// Sin recorte (el objetivo ocupa casi toda la pantalla): solo velo y tarjeta.
  final bool sinHalo;
}

/// Claves compartidas entre pantallas (la barra inferior vive en otro widget).
class ClavesTour {
  static final navegacion = GlobalKey(debugLabel: 'tour-navegacion');
  static int destinos = 1;

  /// La primera pestaña (Eventos) de la barra inferior.
  static Rect primeraPestana(Rect barra) => Rect.fromLTWH(barra.left, barra.top, barra.width / destinos, barra.height);
}

/// Tour guiado de primera vez, como el de la web (`_evTourIniciarConPasos()`):
/// velo oscuro con recorte que se desliza de un paso al siguiente, tarjeta con
/// título, texto, puntos de progreso, "Omitir" y "Siguiente". Se marca como
/// visto al terminar u omitir (no al salir por otro lado).
class Tour {
  static bool _activo = false;

  /// Muestra el tour si no se vio. [preferencia] guarda que ya se vio.
  static Future<void> mostrarSiCorresponde(BuildContext context, {required String preferencia, required List<PasoTour> pasos}) async {
    if (_activo) return;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(preferencia) == true || !context.mounted) return;
    final visibles = pasos.where((p) => _rect(p) != null).toList();
    if (visibles.isEmpty) return;
    _activo = true;
    final overlay = Overlay.of(context, rootOverlay: true);
    late OverlayEntry entrada;
    final terminado = Completer<void>();
    entrada = OverlayEntry(
      builder: (_) => _VistaTour(
        pasos: visibles,
        alTerminar: () {
          prefs.setBool(preferencia, true);
          entrada.remove();
          _activo = false;
          terminado.complete();
        },
      ),
    );
    overlay.insert(entrada);
    return terminado.future;
  }

  static Rect? _rect(PasoTour p) {
    final ro = p.clave.currentContext?.findRenderObject();
    if (ro is! RenderBox || !ro.attached || !ro.hasSize) return null;
    final r = ro.localToGlobal(Offset.zero) & ro.size;
    if (r.isEmpty) return null;
    return p.ajuste?.call(r) ?? r;
  }
}

class _VistaTour extends StatefulWidget {
  const _VistaTour({required this.pasos, required this.alTerminar});
  final List<PasoTour> pasos;
  final VoidCallback alTerminar;

  @override
  State<_VistaTour> createState() => _VistaTourState();
}

/// Animaciones (pedido 2026-11-07, "más fluido"):
/// - al abrir, el velo aparece y el recorte crece desde el centro del objetivo;
/// - entre pasos, recorte y tarjeta viajan juntos (misma curva, un solo reloj);
/// - un anillo de la marca late alrededor del recorte para señalarlo;
/// - la tarjeta lleva una flecha que apunta al objetivo y su contenido cambia
///   con fundido y un leve deslizamiento hacia el lado del avance.
class _VistaTourState extends State<_VistaTour> with TickerProviderStateMixin {
  late final _entrada = AnimationController(vsync: this, duration: const Duration(milliseconds: 360))..forward();
  late final _mov = AnimationController(vsync: this, duration: const Duration(milliseconds: 480))..forward();
  late final _pulso = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat();
  late final _curva = CurvedAnimation(parent: _mov, curve: Curves.easeInOutCubicEmphasized);
  int _i = 0;
  bool _saliendo = false;
  Rect? _desde;
  Rect? _hasta;

  @override
  void dispose() {
    _entrada.dispose();
    _mov.dispose();
    _pulso.dispose();
    super.dispose();
  }

  Rect _hueco(PasoTour paso, Size pantalla) {
    final objetivo = Tour._rect(paso) ?? Rect.fromCenter(center: pantalla.center(Offset.zero), width: 0, height: 0);
        if (paso.sinHalo) return Rect.fromCenter(center: objetivo.center, width: 0, height: 0);
    // Siempre dentro de la pantalla, para que el borde y el anillo se vean enteros.
    final limite = (Offset.zero & pantalla).deflate(6);
    final r = objetivo.inflate(6);
    return Rect.fromLTRB(
      r.left.clamp(limite.left, limite.right),
      r.top.clamp(limite.top, limite.bottom),
      r.right.clamp(limite.left, limite.right),
      r.bottom.clamp(limite.top, limite.bottom),
    );
  }

  Rect get _actual => Rect.lerp(_desde, _hasta, _curva.value)!;

  Future<void> _cerrar() async {
    if (_saliendo) return;
    _saliendo = true;
    _pulso.stop();
    await _entrada.reverse();
    widget.alTerminar();
  }

  void _siguiente() {
    if (_saliendo) return;
    // El siguiente paso visible; si el objetivo ya no está en pantalla, se salta.
    for (var j = _i + 1; j < widget.pasos.length; j++) {
      if (Tour._rect(widget.pasos[j]) != null) {
        final pantalla = MediaQuery.sizeOf(context);
        setState(() {
          _desde = _actual;
          _hasta = _hueco(widget.pasos[j], pantalla);
          _i = j;
        });
        _mov.forward(from: 0);
        return;
      }
    }
    _cerrar();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final paso = widget.pasos[_i];
    final pantalla = MediaQuery.sizeOf(context);
    final margen = MediaQuery.paddingOf(context);
    if (_hasta == null) {
      _hasta = _hueco(paso, pantalla);
      // Primer paso: el recorte nace en el centro del objetivo.
      _desde = Rect.fromCenter(center: _hasta!.center, width: 0, height: 0);
    }
    final ultimo = !widget.pasos.skip(_i + 1).any((s) => Tour._rect(s) != null);
    // La tarjeta va en el lado libre: debajo si el objetivo está arriba, si no encima.
    final abajo = paso.sinHalo || _hasta!.center.dy < pantalla.height / 2;

    return FadeTransition(
      opacity: CurvedAnimation(parent: _entrada, curve: Curves.easeOut),
      child: Material(
        type: MaterialType.transparency,
        child: AnimatedBuilder(
          animation: Listenable.merge([_curva, _pulso]),
          builder: (context, _) {
            final hueco = _actual;
            const flecha = 10.0;
            final double? arriba = paso.sinHalo ? null : (abajo ? hueco.bottom + 8 : null);
            final double? debajo = paso.sinHalo ? margen.bottom + 120 : (abajo ? null : pantalla.height - hueco.top + 8);
            return Stack(
              children: [
                // Velo con recorte y anillo que late; tocar en cualquier lado avanza.
                Positioned.fill(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _siguiente,
                    child: CustomPaint(painter: _PintorVelo(hueco, p.veloTour, p.marca, paso.sinHalo ? null : _pulso.value)),
                  ),
                ),
                Positioned(
                  left: 16,
                  right: 16,
                  top: arriba,
                  bottom: debajo,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (abajo && !paso.sinHalo) _flecha(p, hueco.center.dx - 16, flecha, haciaArriba: true),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 320),
                        curve: Curves.easeInOutCubic,
                        alignment: abajo ? Alignment.topCenter : Alignment.bottomCenter,
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 320),
                          switchInCurve: Curves.easeOutCubic,
                          switchOutCurve: Curves.easeInCubic,
                          layoutBuilder: (actual, previos) => Stack(alignment: Alignment.topCenter, children: [...previos, ?actual]),
                          transitionBuilder: (c, a) => FadeTransition(
                            opacity: a,
                            child: SlideTransition(
                              position: Tween(begin: const Offset(0.05, 0), end: Offset.zero).animate(a),
                              child: ScaleTransition(scale: Tween(begin: 0.97, end: 1.0).animate(a), child: c),
                            ),
                          ),
                          child: _tarjeta(context, paso, ultimo, key: ValueKey(_i)),
                        ),
                      ),
                      if (!abajo && !paso.sinHalo) _flecha(p, hueco.center.dx - 16, flecha, haciaArriba: false),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  /// Triángulo que une la tarjeta con el objetivo (sigue su centro horizontal).
  Widget _flecha(PivotPaleta p, double x, double alto, {required bool haciaArriba}) {
    return SizedBox(
      height: alto,
      child: LayoutBuilder(
        builder: (context, c) => Stack(
          children: [
            Positioned(
              left: (x - 10).clamp(PivotRadios.tarjeta, c.maxWidth - PivotRadios.tarjeta - 20),
              top: 0,
              child: CustomPaint(size: Size(20, alto), painter: _PintorFlecha(p.tarjeta, haciaArriba)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tarjeta(BuildContext context, PasoTour paso, bool ultimo, {Key? key}) {
    final p = context.pivot;
    return Container(
      key: key,
      padding: const EdgeInsets.fromLTRB(20, 18, 12, 10),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            paso.titulo,
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.texto),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(paso.texto, style: TextStyle(fontSize: 14, height: 1.4, color: p.textoSecundario)),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (var j = 0; j < widget.pasos.length; j++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  margin: const EdgeInsets.only(right: 5),
                  width: j == _i ? 16 : 6,
                  height: 6,
                  decoration: BoxDecoration(color: j <= _i ? p.marca : p.tarjetaBorde, borderRadius: BorderRadius.circular(3)),
                ),
              const Spacer(),
              if (!ultimo) TextButton(onPressed: _cerrar, child: const Text('Omitir')),
              FilledButton(onPressed: _siguiente, child: Text(ultimo ? 'Listo' : 'Siguiente')),
            ],
          ),
        ],
      ),
    );
  }
}

class _PintorVelo extends CustomPainter {
  _PintorVelo(this.hueco, this.color, this.anillo, this.pulso);
  final Rect hueco;
  final Color color;
  final Color anillo;
  final double? pulso; // 0..1, null = sin anillo

  @override
  void paint(Canvas canvas, Size size) {
    const radio = Radius.circular(PivotRadios.tarjeta);
    final todo = Path()..addRect(Offset.zero & size);
    final recorte = Path()..addRRect(RRect.fromRectAndRadius(hueco, radio));
    canvas.drawPath(Path.combine(PathOperation.difference, todo, recorte), Paint()..color = color);
    if (pulso == null || hueco.isEmpty) return;
    // Borde fijo + una onda que se expande y se apaga.
    final borde = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = anillo.withValues(alpha: 0.9);
    canvas.drawRRect(RRect.fromRectAndRadius(hueco, radio), borde);
    final t = Curves.easeOut.transform(pulso!);
    final onda = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = anillo.withValues(alpha: 0.6 * (1 - t));
    canvas.drawRRect(RRect.fromRectAndRadius(hueco.inflate(2 + 10 * t), Radius.circular(PivotRadios.tarjeta + 10 * t)), onda);
  }

  @override
  bool shouldRepaint(_PintorVelo old) => old.hueco != hueco || old.color != color || old.pulso != pulso || old.anillo != anillo;
}

class _PintorFlecha extends CustomPainter {
  _PintorFlecha(this.color, this.haciaArriba);
  final Color color;
  final bool haciaArriba;

  @override
  void paint(Canvas canvas, Size size) {
    final path = haciaArriba
        ? (Path()
            ..moveTo(0, size.height)
            ..lineTo(size.width / 2, 0)
            ..lineTo(size.width, size.height))
        : (Path()
            ..moveTo(0, 0)
            ..lineTo(size.width / 2, size.height)
            ..lineTo(size.width, 0));
    canvas.drawPath(path..close(), Paint()..color = color);
  }

  @override
  bool shouldRepaint(_PintorFlecha old) => old.color != color || old.haciaArriba != haciaArriba;
}
