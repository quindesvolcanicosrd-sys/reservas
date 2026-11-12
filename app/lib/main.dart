import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/actualizacion.dart';
import 'core/api.dart';
import 'core/tema.dart';
import 'eventos/detalle_screen.dart';
import 'eventos/eventos_repo.dart';
import 'inicio_shell.dart';
import 'push/push.dart';
import 'sesion/login_screen.dart';
import 'sesion/sesion.dart';
import 'core/cargando.dart';
import 'core/intro.dart';

final _navegador = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final sesion = Sesion(Api());
  // La interfaz se dibuja SIEMPRE primero (bug real 1.0.4: si Firebase o las
  // notificaciones fallaban al iniciar, la app quedaba en el logo). Firebase
  // y las notificaciones arrancan después y, si fallan, la app sigue andando.
  runApp(PivotApp(sesion: sesion));
  sesion.restaurar();
  await Push.arrancarSeguro();
}

class PivotApp extends StatelessWidget {
  const PivotApp({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pivot',
      navigatorKey: _navegador,
      debugShowCheckedModeBanner: false,
      theme: construirTema(Brightness.light),
      darkTheme: construirTema(Brightness.dark),
      themeMode: ThemeMode.system,
      // Textos del sistema (selectores de fecha y hora, menús) en el idioma
      // del teléfono; si no está entre los soportados, español.
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      supportedLocales: const [Locale('es'), Locale('es', 'EC'), Locale('en'), Locale('pt')],
      localeResolutionCallback: (locale, soportados) {
        for (final s in soportados) {
          if (locale != null && s.languageCode == locale.languageCode) return s;
        }
        return const Locale('es');
      },
      // Actualización obligatoria: tapa toda la app si hay versión nueva.
      builder: (context, child) => ControlActualizacion(child: IntroPivot(child: child ?? const SizedBox.shrink())),
      home: _Raiz(sesion: sesion),
    );
  }
}

class _Raiz extends StatefulWidget {
  const _Raiz({required this.sesion});
  final Sesion sesion;

  @override
  State<_Raiz> createState() => _RaizState();
}

class _RaizState extends State<_Raiz> {
  late final EventosRepo _repo = EventosRepo(widget.sesion);
  StreamSubscription<AperturaPush>? _sub;
  AperturaPush? _pendiente;
  String? _registradoPara;

  @override
  void initState() {
    super.initState();
    _sub = Push.aperturas.listen((a) {
      _pendiente = a;
      _abrirPendiente();
    });
    widget.sesion.addListener(_alCambiarSesion);
    widget.sesion.addListener(_revisarListo);
    _repo.addListener(_revisarListo);
  }

  /// La animación de entrada revela la app cuando la primera pantalla ya
  /// tiene sus datos (o se sabe que no hay sesión).
  void _revisarListo() {
    if (IntroPivot.listo.value) return;
    final s = widget.sesion;
    if (s.cargando) return;
    if (!s.activa || (!_repo.cargando && (_repo.eventos.isNotEmpty || _repo.error != null))) IntroPivot.listo.value = true;
  }

  @override
  void dispose() {
    _sub?.cancel();
    widget.sesion.removeListener(_alCambiarSesion);
    widget.sesion.removeListener(_revisarListo);
    _repo.removeListener(_revisarListo);
    super.dispose();
  }

  void _alCambiarSesion() {
    final s = widget.sesion;
    if (s.activa && _registradoPara != s.nombre) {
      _registradoPara = s.nombre;
      Push.registrar(s.api);
      _abrirPendiente();
    } else if (!s.activa) {
      _registradoPara = null;
    }
  }

  /// Abre el evento de una notificación tocada, una vez que hay sesión.
  void _abrirPendiente() {
    final a = _pendiente;
    if (a == null || !widget.sesion.activa) return;
    _pendiente = null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _navegador.currentState?.push(
        MaterialPageRoute(
          builder: (_) => DetalleScreen(repo: _repo, eventoId: a.eventoId, abrirCancelar: a.accion == 'cancelar', abrirNoAsistire: a.accion == 'no-asistire'),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.sesion,
      builder: (context, _) {
        final s = widget.sesion;
        final Widget pantalla;
        if (s.cargando) {
          pantalla = const Scaffold(
            key: ValueKey('cargando'),
            body: Center(child: PivotCargando()),
          );
        } else if (!s.activa) {
          pantalla = LoginScreen(key: const ValueKey('login'), sesion: s);
        } else {
          pantalla = InicioShell(key: ValueKey('inicio-${s.nombre}'), sesion: s, repo: _repo);
        }
        return AnimatedSwitcher(duration: const Duration(milliseconds: 300), child: pantalla);
      },
    );
  }
}
