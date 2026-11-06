import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/api.dart';
import 'core/tema.dart';
import 'eventos/eventos_repo.dart';
import 'eventos/timeline_screen.dart';
import 'sesion/sesion.dart';

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

class _InicioShellState extends State<InicioShell> {
  int _indice = 0;

  @override
  Widget build(BuildContext context) {
    final destinos = <(NavigationDestination, Widget)>[
      (
        const NavigationDestination(icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month), label: 'Eventos'),
        TimelineScreen(repo: widget.repo, nombreParaAvatar: widget.sesion.nombreMostrar, fotoParaAvatar: widget.sesion.fotoPerfil),
      ),
      (
        const NavigationDestination(icon: Icon(Icons.group_outlined), selectedIcon: Icon(Icons.group), label: 'Equipo'),
        const _EnLaWeb(titulo: 'Equipo', ruta: '/'),
      ),
      (
        const NavigationDestination(icon: Icon(Icons.checklist_rounded), label: 'Tareas'),
        const _EnLaWeb(titulo: 'Tareas', ruta: '/'),
      ),
      (
        const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Mi perfil'),
        _MiPerfil(sesion: widget.sesion),
      ),
      if (widget.sesion.esAdmin)
        (
          const NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield), label: 'Mi Liga'),
          const _EnLaWeb(titulo: 'Mi Liga', ruta: '/'),
        ),
    ];
    final indice = _indice.clamp(0, destinos.length - 1);
    return Scaffold(
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: KeyedSubtree(key: ValueKey(indice), child: destinos[indice].$2),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: indice,
        onDestinationSelected: (i) => setState(() => _indice = i),
        destinations: [for (final d in destinos) d.$1],
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
      appBar: AppBar(title: Text(titulo, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700))),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.construction_rounded, size: 48, color: PivotColores.textoSecundario),
            const SizedBox(height: 16),
            Text('$titulo llega pronto a la app', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            const Text('Mientras tanto, puedes usarlo desde la web.', textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => launchUrl(Uri.parse('${ApiConfig.webAppUrl}$ruta'), mode: LaunchMode.externalApplication),
              child: const Text('Abrir en la web'),
            ),
          ]),
        ),
      ),
    );
  }
}

class _MiPerfil extends StatelessWidget {
  const _MiPerfil({required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text('Mi perfil', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(sesion.nombreMostrar, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          subtitle: Text(sesion.nombre ?? ''),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => launchUrl(Uri.parse('${ApiConfig.webAppUrl}/'), mode: LaunchMode.externalApplication),
          icon: const Icon(Icons.open_in_new_rounded),
          label: const Text('Editar mis datos en la web'),
        ),
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: () => sesion.cerrar(),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Cerrar sesión'),
        ),
      ]),
    );
  }
}
