import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/api.dart';
import 'core/fechas.dart';
import 'core/tema.dart';
import 'core/vidrio.dart';
import 'core/datos_pendientes.dart';
import 'core/tour.dart';
import 'ajustes/ajustes_screen.dart';
import 'core/aviso_sin_conexion.dart';
import 'equipo/equipo_repo.dart';
import 'equipo/equipo_screen.dart';
import 'eventos/eventos_repo.dart';
import 'eventos/timeline_screen.dart';
import 'sesion/sesion.dart';
import 'core/navegacion.dart';
import 'eventos/widgets_comunes.dart';

/// Estructura principal con la barra de navegación inferior. En esta
/// primera versión solo Eventos es nativo; el resto abre la web mientras se
/// migra (decisión 2026-11-06, ver MANIFEST.md "App Android").
class InicioShell extends StatefulWidget {
  const InicioShell({super.key, required this.sesion, required this.repo});
  final Sesion sesion;
  final EventosRepo repo;

  @override
  State<InicioShell> createState() => _InicioShellState();
}

class _InicioShellState extends State<InicioShell> with WidgetsBindingObserver {
  int _indice = 0;
  final _irAHoy = SenalHoy();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Navegacion.ir.addListener(_irAPestana);
    // Datos del perfil pendientes: al entrar, sin tapar el tour de primera vez.
    Future.delayed(const Duration(milliseconds: 2500), _recordarDatos);
  }

  Future<void> _recordarDatos() async {
    if (!mounted || Tour.activo) return;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool('tour.calendario.visto') != true || !mounted) return;
    await DatosPendientes.recordarSiCorresponde(context, widget.sesion, abrir: (clave) => abrirPendiente(context, widget.sesion, clave));
  }

  /// Otra pantalla pidió abrir una pestaña (ej. Mi perfil desde tu ficha).
  void _irAPestana() {
    final p = Navegacion.ir.value;
    if (p == null || !mounted) return;
    Navegacion.ir.value = null;
    Navigator.of(context).popUntil((r) => r.isFirst);
    setState(
      () => _indice = switch (p) {
        Pestana.calendario => 0,
        Pestana.equipo => 1,
        Pestana.perfil => widget.sesion.esAdmin ? 3 : 2,
      },
    );
  }

  @override
  void dispose() {
    Navegacion.ir.removeListener(_irAPestana);
    WidgetsBinding.instance.removeObserver(this);
    _irAHoy.dispose();
    super.dispose();
  }

  // El número del ícono de Eventos se actualiza al volver a la app (por si cambió el día).
  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (estado == AppLifecycleState.resumed) {
      setState(() {});
      // Al volver a la app: subir lo guardado sin señal.
      widget.repo.cola.sincronizar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final destinos = <(NavigationDestination, Widget)>[
      (
        // Ícono con la fecha de hoy (como Google Calendar); tocarlo estando
        // en Eventos lleva a hoy.
        NavigationDestination(
          icon: _IconoHoy(dia: Fechas.hoy().day),
          label: 'Calendario',
          tooltip: 'Calendario · tócalo de nuevo para ir a hoy',
        ),
        TimelineScreen(repo: widget.repo, irAHoy: _irAHoy),
      ),
      (
        const NavigationDestination(icon: Icon(Icons.group_outlined), selectedIcon: Icon(Icons.group), label: 'Equipo'),
        EquipoScreen(repo: EquipoRepo.de(widget.sesion)),
      ),
      // Mi Liga sigue en la web hasta repartir sus funciones (HOJA_DE_RUTA etapa 3).
      if (widget.sesion.esAdmin)
        (
          const NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield), label: 'Mi Liga'),
          const _EnLaWeb(titulo: 'Mi Liga', ruta: '/'),
        ),
      // Mi perfil (Victor, 2026-11-12): reemplaza a Ajustes, con tu avatar.
      (
        NavigationDestination(
          icon: ListenableBuilder(
            listenable: widget.sesion,
            builder: (context, _) => AvatarPersona(nombre: widget.sesion.nombreMostrar, foto: widget.sesion.fotoPerfil, tamano: 26),
          ),
          label: 'Mi perfil',
        ),
        AjustesScreen(sesion: widget.sesion, eventos: widget.repo),
      ),
    ];
    final indice = _indice.clamp(0, destinos.length - 1);
    ClavesTour.destinos = destinos.length;
    return Scaffold(
      // Barra de abajo de vidrio: el contenido pasa por detrás desenfocado.
      extendBody: true,
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: KeyedSubtree(key: ValueKey(indice), child: destinos[indice].$2),
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AvisoSinConexion(repo: widget.repo),
          Vidrio(
            abajo: true,
            child: NavigationBar(
              backgroundColor: Colors.transparent,
              surfaceTintColor: Colors.transparent,
              elevation: 0,
              key: ClavesTour.navegacion,
              selectedIndex: indice,
              onDestinationSelected: (i) {
                if (i == 0 && indice == 0) {
                  _irAHoy.disparar();
                } else {
                  setState(() => _indice = i);
                }
              },
              destinations: [for (final d in destinos) d.$1],
            ),
          ),
        ],
      ),
    );
  }
}

/// Ícono de Eventos: cuadrado redondeado con el número del día adentro
/// (como el de Google Calendar). Siempre en contorno: la selección ya la marca el fondo
/// de la pestaña (un ícono lleno se veía como un cuadrado sin forma).
class _IconoHoy extends StatelessWidget {
  const _IconoHoy({required this.dia});
  final int dia;

  @override
  Widget build(BuildContext context) {
    final tema = IconTheme.of(context);
    final color = tema.color ?? context.pivot.texto;
    return SizedBox(
      width: 24,
      height: 24,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Cuadrado redondeado simple (sin las anillas del ícono de Material,
          // que apretaban el número) y el día en Nunito Black.
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              border: Border.all(color: color, width: 2),
              borderRadius: BorderRadius.circular(PivotRadios.iconoDia),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Text(
              '$dia',
              textAlign: TextAlign.center,
              style: PivotTexto.numeroIcono(color, tam: dia > 9 ? 11.5 : 12.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _EnLaWeb extends StatelessWidget {
  const _EnLaWeb({required this.titulo, required this.ruta});
  final String titulo;
  final String ruta;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(titulo, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.construction_rounded, size: 48, color: context.pivot.textoSecundario),
              const SizedBox(height: 16),
              Text(
                '$titulo llega pronto a la app',
                style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text('Mientras tanto, puedes usarlo desde la web.', textAlign: TextAlign.center),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => launchUrl(Uri.parse('${ApiConfig.webAppUrl}$ruta'), mode: LaunchMode.externalApplication),
                child: const Text('Abrir en la web'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
