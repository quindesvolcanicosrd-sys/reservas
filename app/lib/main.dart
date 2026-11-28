import 'cursos/cursos_screen.dart' show CursosAbiertosScreen;

import 'dart:async';
import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/foundation.dart';

import 'equipo/inventario_screen.dart';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/actualizacion.dart';
import 'core/api.dart';
import 'core/tema.dart';
import 'eventos/detalle_screen.dart';
import 'eventos/eventos_repo.dart';
import 'eventos/social/invitado_screen.dart';
import 'inicio_shell.dart';
import 'reglamento/reglamento_screen.dart' show ReglamentoScreen;
import 'push/push.dart';
import 'sesion/login_screen.dart';
import 'sesion/sesion.dart';
import 'core/cargando.dart';
import 'core/intro.dart';
import 'core/puerta_instalar.dart';
import 'core/navegacion.dart';
import 'reservas/reserva_screen.dart';
import 'reservas/reservas_repo.dart' show TipoReserva;

final _navegador = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final sesion = Sesion(Api());
  // Invitadx +1 de un evento social (?social=<token>): entra sin cuenta, sin
  // la puerta de instalar ni notificaciones (NAVIQUINDE.md, 2026-11-19).
  final invitado = kIsWeb ? (Uri.base.queryParameters['social'] ?? '') : '';
  if (invitado.isNotEmpty) {
    runApp(PivotInvitadoApp(token: invitado));
    return;
  }
  // La interfaz se dibuja SIEMPRE primero (bug real 1.0.4: si Firebase o las
  // notificaciones fallaban al iniciar, la app quedaba en el logo). Firebase
  // y las notificaciones arrancan después y, si fallan, la app sigue andando.
  runApp(PivotApp(sesion: sesion));
  sesion.restaurar();
  await Push.arrancarSeguro();
}

class PivotScrollBehavior extends MaterialScrollBehavior {
  const PivotScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => {
    PointerDeviceKind.touch,
    PointerDeviceKind.mouse,
    PointerDeviceKind.trackpad,
    PointerDeviceKind.stylus,
    PointerDeviceKind.invertedStylus,
  };
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
      scrollBehavior: const PivotScrollBehavior(),
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
      builder: (context, child) => PuertaInstalar(
        child: ControlActualizacion(child: IntroPivot(child: child ?? const SizedBox.shrink())),
      ),
      home: _Raiz(sesion: sesion),
    );
  }
}

/// App mínima para lxs invitadxs +1 (sin sesión): solo su pantalla.
class PivotInvitadoApp extends StatelessWidget {
  const PivotInvitadoApp({super.key, required this.token});
  final String token;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pivot',
      debugShowCheckedModeBanner: false,
      scrollBehavior: const PivotScrollBehavior(),
      theme: construirTema(Brightness.light),
      darkTheme: construirTema(Brightness.dark),
      themeMode: ThemeMode.system,
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      supportedLocales: const [Locale('es'), Locale('es', 'EC'), Locale('en'), Locale('pt')],
      locale: const Locale('es'),
      builder: (context, child) => IntroPivot(child: child ?? const SizedBox.shrink()),
      home: InvitadoSocialScreen(token: token, alCargar: () => IntroPivot.listo.value = true),
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
    Navegacion.pantalla.addListener(_abrirPantallaPedida);
    // Web: un aviso abre la app con ?evento=<id>[&accion=cancelar] (mismo
    // enlace que usa la web vieja), así funcionan igual al cambiar de dirección.
    if (kIsWeb) {
      final q = Uri.base.queryParameters;
      final ev = q['evento'] ?? '';
      final abrir = q['abrir'] ?? '';
      if (ev.isNotEmpty || abrir.isNotEmpty) {
        _pendiente = AperturaPush(eventoId: ev, accion: q['accion'], pantalla: abrir.isEmpty ? null : abrir);
        _abrirPendiente();
      }
      // Enlace de invitación a un curso (Victor, 2026-11-17).
      final curso = q['curso'] ?? '';
      if (curso.isNotEmpty) {
        _cursoPendiente = curso;
        _abrirPendiente();
      }
    }
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
    Navegacion.pantalla.removeListener(_abrirPantallaPedida);
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
  String? _cursoPendiente;

  void _abrirPendiente() {
    final curso = _cursoPendiente;
    if (curso != null && widget.sesion.activa) {
      _cursoPendiente = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navegador.currentState?.push(
          MaterialPageRoute(
            builder: (_) => CursosAbiertosScreen(sesion: widget.sesion, destacado: curso),
          ),
        );
      });
    }
    final a = _pendiente;
    if (a == null || !widget.sesion.activa) return;
    _pendiente = null;
    // Cada notificación abre su pantalla (Victor, 2026-11-22).
    final pantalla = a.pantalla;
    if (a.eventoId.isEmpty && pantalla != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _abrirPantalla(pantalla));
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _navegador.currentState?.push(
        MaterialPageRoute(
          builder: (_) => DetalleScreen(repo: _repo, eventoId: a.eventoId, abrirCancelar: a.accion == 'cancelar', abrirNoAsistire: a.accion == 'no-asistire'),
        ),
      );
    });
  }

  void _abrirPantallaPedida() {
    final p = Navegacion.pantalla.value;
    if (p == null) return;
    Navegacion.pantalla.value = null;
    _abrirPantalla(p);
  }

  void _abrirPantalla(String pantalla) {
    final partes = pantalla.split(':');
    switch (partes.first) {
      case 'suscribirse':
        final mes = partes.length > 2 && partes[1] == 'mes' ? DateTime.tryParse('${partes[2]}-01') : null;
        final clase = partes.length > 2 && partes[1] == 'clase' ? partes[2].split(',').first : null;
        _navegador.currentState?.push(
          MaterialPageRoute(
            builder: (_) => ReservaScreen(
              repo: _repo,
              tipo: mes != null || (partes.length > 1 && partes[1] == 'mes') ? TipoReserva.mes : TipoReserva.clase,
              claseInicial: clase == null || clase.isEmpty ? null : clase,
              mesInicial: mes,
            ),
          ),
        );
      case 'inventario':
        // Avisos del inventario abren el inventario (QA 2026-11-27).
        _navegador.currentState?.push(MaterialPageRoute(builder: (_) => InventarioScreen(sesion: widget.sesion)));
      case 'reglamento':
        _navegador.currentState?.push(MaterialPageRoute(builder: (_) => ReglamentoScreen(sesion: widget.sesion)));
      case 'equipo':
        Navegacion.ir.value = Pestana.equipo;
      // Entrenamiento en la barra (Victor, 2026-11-26): cursos, progreso y lo de entrenadorxs.
      case 'entrenamiento' || 'progreso' || 'cursos':
        Navegacion.ir.value = Pestana.entrenamiento;
        Navegacion.entrenamiento.value = partes.first;
      case 'novedades' || 'tareas' || 'pagos':
        Navegacion.ir.value = Pestana.calendario;
        Navegacion.actividad.value = partes.first;
    }
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
