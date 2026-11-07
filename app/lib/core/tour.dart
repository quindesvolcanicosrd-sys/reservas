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

class _VistaTourState extends State<_VistaTour> with SingleTickerProviderStateMixin {
  late final _entrada = AnimationController(vsync: this, duration: const Duration(milliseconds: 260))..forward();
  int _i = 0;
  bool _saliendo = false;

  @override
  void dispose() {
    _entrada.dispose();
    super.dispose();
  }

  Future<void> _cerrar() async {
    if (_saliendo) return;
    _saliendo = true;
    await _entrada.reverse();
    widget.alTerminar();
  }

  void _siguiente() {
    // El siguiente paso visible; si el objetivo ya no está en pantalla, se salta.
    for (var j = _i + 1; j < widget.pasos.length; j++) {
            if (Tour._rect(widget.pasos[j]) != null) {
        setState(() => _i = j);
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
        final objetivo = Tour._rect(paso) ?? Rect.fromCenter(center: pantalla.center(Offset.zero), width: 0, height: 0);
    final hueco = paso.sinHalo ? Rect.fromCenter(center: objetivo.center, width: 0, height: 0) : objetivo.inflate(6);
        final ultimo = !widget.pasos.skip(_i + 1).any((s) => Tour._rect(s) != null);
    // La tarjeta va en la mitad libre: debajo si el objetivo está arriba, si no encima.
    final abajo = paso.sinHalo || objetivo.center.dy < pantalla.height / 2;
    final margen = MediaQuery.paddingOf(context);

    return FadeTransition(
      opacity: CurvedAnimation(parent: _entrada, curve: Curves.easeOut),
      child: Material(
        type: MaterialType.transparency,
        child: Stack(
          children: [
            // Velo con recorte; se desliza de un objetivo al siguiente.
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _siguiente,
                child: TweenAnimationBuilder<Rect?>(
                  tween: RectTween(end: hueco),
                  duration: const Duration(milliseconds: 380),
                  curve: Curves.easeInOutCubic,
                  builder: (context, r, _) => CustomPaint(painter: _PintorVelo(r ?? hueco, p.veloTour)),
                ),
              ),
            ),
            AnimatedPositioned(
              duration: const Duration(milliseconds: 380),
              curve: Curves.easeInOutCubic,
              left: 16,
              right: 16,
              top: paso.sinHalo ? null : (abajo ? hueco.bottom + 14 : null),
              bottom: paso.sinHalo ? margen.bottom + 120 : (abajo ? null : pantalla.height - hueco.top + 14),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                transitionBuilder: (c, a) => FadeTransition(
                  opacity: a,
                  child: SlideTransition(position: Tween(begin: const Offset(0, 0.06), end: Offset.zero).animate(a), child: c),
                ),
                child: _tarjeta(context, paso, ultimo, key: ValueKey(_i)),
              ),
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
          Text(paso.titulo, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.texto)),
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
                  duration: const Duration(milliseconds: 220),
                  margin: const EdgeInsets.only(right: 5),
                  width: j == _i ? 16 : 6,
                  height: 6,
                  decoration: BoxDecoration(color: j == _i ? p.marca : p.tarjetaBorde, borderRadius: BorderRadius.circular(3)),
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
  _PintorVelo(this.hueco, this.color);
  final Rect hueco;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final todo = Path()..addRect(Offset.zero & size);
    final recorte = Path()..addRRect(RRect.fromRectAndRadius(hueco, const Radius.circular(PivotRadios.tarjeta)));
    canvas.drawPath(Path.combine(PathOperation.difference, todo, recorte), Paint()..color = color);
  }

  @override
  bool shouldRepaint(_PintorVelo old) => old.hueco != hueco || old.color != color;
}
