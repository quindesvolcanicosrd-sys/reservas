import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lottie/lottie.dart';

import 'tema.dart';

/// Entrada de la app (Victor, 2026-11-12). Encima de todo, mientras la app
/// carga por debajo:
/// 1. El logo, igual que la pantalla de arranque nativa (continuidad).
/// 2. Si los datos todavía no llegaron: fondo de marca con la animación en
///    bucle (`assets/lottie/loop.json`).
/// 3. Cuando todo está listo: la animación de entrada (`intro.json`), que al
///    segundo 1:12 abre un hueco y revela la app ya cargada.
/// Así, una vez adentro, no hay pantallas de carga. Si los datos ya están al
/// terminar el logo, se salta el bucle. Con "reducir animaciones" solo hay un
/// fundido. Nunca espera más de [espera] por los datos.
class IntroPivot extends StatefulWidget {
  const IntroPivot({super.key, required this.child, this.espera = const Duration(seconds: 6)});
  final Widget child;
  final Duration espera;

  /// La app avisa aquí cuando terminó de cargar lo de la primera pantalla.
  static final listo = ValueNotifier<bool>(false);

  @override
  State<IntroPivot> createState() => _IntroPivotState();
}

enum _Fase { logo, bucle, entrada, revelar, fin }

class _IntroPivotState extends State<IntroPivot> with TickerProviderStateMixin {
  _Fase _fase = _Fase.logo;
  late final AnimationController _bucle = AnimationController(vsync: this, duration: const Duration(seconds: 3));
  late final AnimationController _entrada = AnimationController(vsync: this, duration: const Duration(seconds: 3));
  LottieComposition? _compBucle, _compEntrada;
  bool _pidioEntrada = false;
  bool _desdeLogo = false;
  double _ultimoBucle = 0;
  Timer? _tope;

  // Fotograma (25 fps, 75 en total) de intro.json en que la forma roja ya
  // cubre toda la pantalla. Desde ahí el hueco que revela la app lo dibuja
  // la app (`_PintorRevelar`): el reproductor de Lottie de Flutter no
  // dibuja la máscara invertida del archivo y la pantalla quedaba roja.
  static const _cubre = 46 / 75;
  static const _escala = 0.6;
  late final AnimationController _revelar = AnimationController(vsync: this, duration: const Duration(milliseconds: 520));

  @override
  void initState() {
    super.initState();
    AssetLottie('assets/lottie/loop.json').load().then((c) {
      if (mounted) setState(() => _compBucle = c);
    });
    AssetLottie('assets/lottie/intro.json').load().then((c) {
      if (mounted) setState(() => _compEntrada = c);
      _quizasEntrar();
    });
    IntroPivot.listo.addListener(_quizasEntrar);
    _bucle.addListener(_alAvanzarBucle);
    _entrada.addListener(() {
      if (_entrada.value >= _cubre && _fase == _Fase.entrada) {
        _entrada.stop();
        setState(() => _fase = _Fase.revelar);
        _revelar.forward(from: 0).whenComplete(() {
          if (mounted) setState(() => _fase = _Fase.fin);
        });
      }
    });
    // El logo se ve un instante y después sigue la animación.
    Timer(const Duration(milliseconds: 450), () {
      if (!mounted || _fase != _Fase.logo) return;
      if (_listo && _compEntrada != null) {
        _empezarEntrada();
      } else {
        setState(() => _fase = _Fase.bucle);
        _bucle.repeat();
      }
    });
    _tope = Timer(widget.espera, () {
      if (!IntroPivot.listo.value) IntroPivot.listo.value = true;
    });
  }

  bool get _listo => IntroPivot.listo.value;

  void _quizasEntrar() {
    if (!_listo || _pidioEntrada || !mounted) return;
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) {
      setState(() => _fase = _Fase.fin);
      return;
    }
    // En el bucle se espera a que termine la vuelta (empiezan igual).
    if (_fase == _Fase.bucle) _pidioEntrada = true;
  }

  void _alAvanzarBucle() {
    final v = _bucle.value;
    if (_pidioEntrada && v < _ultimoBucle && _compEntrada != null) {
      _bucle.stop();
      _empezarEntrada();
    }
    _ultimoBucle = v;
  }

  void _empezarEntrada() {
    _desdeLogo = _fase == _Fase.logo;
    setState(() => _fase = _Fase.entrada);
    _entrada.forward(from: 0);
  }

  @override
  void dispose() {
    IntroPivot.listo.removeListener(_quizasEntrar);
    _tope?.cancel();
    _bucle.dispose();
    _entrada.dispose();
    _revelar.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final delegados = LottieDelegates(
      values: [
        ValueDelegate.color(const ['**', 'Fill 1'], value: p.marca),
        // En el archivo el degradado va de blanco a negro: es una guía de
        // Victor para "rojo de marca → transparente" (2026-11-12).
        ValueDelegate.gradientColor(const ['**', 'Gradient Stroke 1'], value: [p.marca, p.marca.withValues(alpha: 0)]),
      ],
    );
    // Más chica que el lienzo del archivo (Victor: "quedó enorme").
    Widget animacion(LottieComposition? c, AnimationController ctrl) => c == null
        ? const SizedBox.expand()
        : Transform.scale(
            scale: _escala,
            child: Lottie(composition: c, controller: ctrl, fit: BoxFit.cover, delegates: delegados),
          );
    final Widget capa = switch (_fase) {
      _Fase.logo => ColoredBox(
        key: const ValueKey('logo'),
        color: p.fondo,
        child: Center(child: Image.asset('assets/splash/logo_ancho.png', width: 150)),
      ),
      // Fondo de la app (claro u oscuro), no rojo (Victor, 2026-11-12).
      _Fase.bucle => ColoredBox(
        key: const ValueKey('bucle'),
        color: p.fondo,
        child: _AparecerSuave(child: animacion(_compBucle, _bucle)),
      ),
      _Fase.entrada => ColoredBox(
        key: const ValueKey('entrada'),
        color: p.fondo,
        child: _desdeLogo ? _AparecerSuave(child: animacion(_compEntrada, _entrada)) : animacion(_compEntrada, _entrada),
      ),
      _Fase.revelar => CustomPaint(
        key: const ValueKey('revelar'),
        painter: _PintorRevelar(CurvedAnimation(parent: _revelar, curve: Curves.easeInCubic), p.marca),
        size: Size.infinite,
      ),
      _Fase.fin => const SizedBox.shrink(key: ValueKey('fin')),
    };
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    return Stack(
      children: [
        widget.child,
        Positioned.fill(
          // Barra de navegación del sistema del mismo color que el fondo
          // mientras dura la entrada (antes se veía negra y luego roja).
          child: AnnotatedRegion<SystemUiOverlayStyle>(
            value: _fase == _Fase.fin
                ? (oscuro ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
                : SystemUiOverlayStyle(
                    systemNavigationBarColor: p.fondo,
                    systemNavigationBarIconBrightness: oscuro ? Brightness.light : Brightness.dark,
                    statusBarColor: const Color(0x00000000),
                    statusBarIconBrightness: oscuro ? Brightness.light : Brightness.dark,
                  ),
            child: IgnorePointer(
              ignoring: _fase == _Fase.fin,
              child: AnimatedSwitcher(
                // Del bucle a la entrada no hay corte (empiezan igual); del
                // logo, fundido corto; al final, se quita sin fundido.
                duration: Duration(milliseconds: _fase == _Fase.fin || (_fase == _Fase.entrada && !_desdeLogo) || _fase == _Fase.revelar ? 0 : 280),
                switchOutCurve: Curves.easeIn,
                child: capa,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Fundido de entrada de la animación (antes aparecía de golpe).
class _AparecerSuave extends StatelessWidget {
  const _AparecerSuave({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: const Duration(milliseconds: 380),
    curve: Curves.easeOut,
    builder: (context, v, hijo) => Opacity(opacity: v, child: hijo),
    child: child,
  );
}

/// Rojo de marca con un hueco en forma de la "P" de Pivot (cápsula inclinada)
/// que crece desde el centro hasta dejar ver la app.
class _PintorRevelar extends CustomPainter {
  _PintorRevelar(this.t, this.color) : super(repaint: t);
  final Animation<double> t;
  final Color color;

  @override
  void paint(Canvas canvas, Size s) {
    final diagonal = s.longestSide * 1.6;
    final ancho = diagonal * t.value, alto = ancho * 1.72;
    final hueco = Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset.zero, width: ancho, height: alto), Radius.circular(ancho / 2)));
    final m = Matrix4.identity()
      ..translateByDouble(s.width / 2, s.height / 2, 0, 1)
      ..rotateZ(0.2);
    final velo = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & s)
      ..addPath(hueco.transform(m.storage), Offset.zero);
    canvas.drawPath(velo, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_PintorRevelar old) => old.color != color;
}
