import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

import '../core/tema.dart';

/// Encuadre de la foto de perfil (como el lienzo de la web): se arrastra y
/// se pellizca la imagen dentro del círculo; "Guardar" devuelve un JPEG
/// cuadrado de [tamanoSalida] px.
class RecorteFotoScreen extends StatefulWidget {
  const RecorteFotoScreen({super.key, required this.bytes, this.tamanoSalida = 512});
  final Uint8List bytes;
  final int tamanoSalida;

  static Future<Uint8List?> abrir(BuildContext context, Uint8List bytes) {
    return Navigator.of(context).push<Uint8List>(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 260),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (_, _, _) => RecorteFotoScreen(bytes: bytes),
        transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
      ),
    );
  }

  @override
  State<RecorteFotoScreen> createState() => _RecorteFotoScreenState();
}

class _RecorteFotoScreenState extends State<RecorteFotoScreen> {
  final _t = TransformationController();
  ui.Image? _imagen;
  double _lado = 0; // lado del visor
  Size _base = Size.zero; // tamaño de la imagen a escala 1 (cubre el visor)
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    _decodificar();
  }

  Future<void> _decodificar() async {
    final codec = await ui.instantiateImageCodec(widget.bytes);
    final f = await codec.getNextFrame();
    if (mounted) setState(() => _imagen = f.image);
  }

  @override
  void dispose() {
    _t.dispose();
    _imagen?.dispose();
    super.dispose();
  }

  void _prepararVisor(double lado) {
    if (lado == _lado || _imagen == null) return;
    _lado = lado;
    final w = _imagen!.width.toDouble(), h = _imagen!.height.toDouble();
    final k = lado / (w < h ? w : h);
    _base = Size(w * k, h * k);
    // Empieza centrada.
    _t.value = Matrix4.translationValues(-(_base.width - lado) / 2, -(_base.height - lado) / 2, 0);
  }

  Future<void> _guardar() async {
    final im = _imagen;
    if (im == null) return;
    setState(() => _guardando = true);
    final m = _t.value;
    final escala = m.getMaxScaleOnAxis();
    final tx = m.getTranslation().x, ty = m.getTranslation().y;
    // Lo visible del visor, en coordenadas de la imagen original.
    final aPixeles = im.width / _base.width;
    final origen = Rect.fromLTWH(-tx / escala * aPixeles, -ty / escala * aPixeles, _lado / escala * aPixeles, _lado / escala * aPixeles);
    final n = widget.tamanoSalida.toDouble();
    final rec = ui.PictureRecorder();
    Canvas(rec).drawImageRect(im, origen, Rect.fromLTWH(0, 0, n, n), Paint()..filterQuality = FilterQuality.high);
    final salida = await rec.endRecording().toImage(widget.tamanoSalida, widget.tamanoSalida);
    final rgba = await salida.toByteData(format: ui.ImageByteFormat.rawRgba);
    salida.dispose();
    if (rgba == null) {
      if (mounted) setState(() => _guardando = false);
      return;
    }
    final jpeg = img.encodeJpg(img.Image.fromBytes(width: widget.tamanoSalida, height: widget.tamanoSalida, bytes: rgba.buffer, numChannels: 4), quality: 86);
    if (mounted) Navigator.of(context).pop(Uint8List.fromList(jpeg));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      backgroundColor: p.fondo,
      appBar: AppBar(
        title: const Text('Encuadra tu foto', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: LayoutBuilder(
                  builder: (context, c) {
                    final lado = (c.maxWidth < c.maxHeight ? c.maxWidth : c.maxHeight) - 32;
                    if (_imagen == null) return const CircularProgressIndicator();
                    _prepararVisor(lado);
                    return SizedBox(
                      width: lado,
                      height: lado,
                      child: Stack(
                        children: [
                          ClipRect(
                            child: InteractiveViewer(
                              transformationController: _t,
                              constrained: false,
                              minScale: 1,
                              maxScale: 6,
                              boundaryMargin: EdgeInsets.zero,
                              child: SizedBox(
                                width: _base.width,
                                height: _base.height,
                                child: RawImage(image: _imagen, fit: BoxFit.fill),
                              ),
                            ),
                          ),
                          IgnorePointer(
                            child: CustomPaint(size: Size(lado, lado), painter: _Mascara(p.fondo, p.texto)),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Text('Arrastra y pellizca para encuadrar.', style: TextStyle(color: p.textoSecundario)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                onPressed: _imagen == null || _guardando ? null : _guardar,
                child: Text(_guardando ? 'Guardando…' : 'Guardar foto'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Velo con un círculo transparente al centro y su borde.
class _Mascara extends CustomPainter {
  _Mascara(this.fondo, this.borde);
  final Color fondo;
  final Color borde;

  @override
  void paint(Canvas canvas, Size s) {
    final circulo = Rect.fromLTWH(0, 0, s.width, s.height).deflate(2);
    final velo = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & s)
      ..addOval(circulo);
    canvas.drawPath(velo, Paint()..color = fondo.withValues(alpha: 0.72));
    canvas.drawOval(
      circulo,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = borde.withValues(alpha: 0.8),
    );
  }

  @override
  bool shouldRepaint(_Mascara old) => old.fondo != fondo || old.borde != borde;
}
