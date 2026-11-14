import 'package:flutter/material.dart';

import '../core/tema.dart';
import 'equipo_repo.dart';
import '../core/vidrio.dart';

/// Roles del equipo (Victor, 2026-11-12): catálogo de la liga con los del
/// deporte precargados. Solo Pivots. Renombrar cambia el nombre en todas las
/// fichas; borrar uno en uso pide confirmar y lo quita de esas fichas.
/// Mantener presionado y arrastrar cambia el orden.
class RolesScreen extends StatefulWidget {
  const RolesScreen({super.key, required this.repo});
  final EquipoRepo repo;

  @override
  State<RolesScreen> createState() => _RolesScreenState();
}

class _RolesScreenState extends State<RolesScreen> {
  EquipoRepo get repo => widget.repo;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    repo.cargarRoles();
  }

  Future<void> _hacer(String accion, {String? nombre, String? nuevo, List<String>? lista, String? ok}) async {
    setState(() => _guardando = true);
    final error = await repo.cambiarRol(accion, nombre: nombre, nuevo: nuevo, lista: lista);
    if (!mounted) return;
    setState(() => _guardando = false);
    final texto = error ?? ok;
    if (texto != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(texto)));
    }
  }

  Future<String?> _pedirNombre({String? actual}) {
    final c = TextEditingController(text: actual ?? '');
    return showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(actual == null ? 'Nuevo rol' : 'Renombrar rol'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: c,
              autofocus: true,
              maxLength: 30,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(hintText: 'Ej. Capitán'),
              onSubmitted: (v) => Navigator.of(d).pop(v.trim()),
            ),
            if (actual != null && (repo.rolesEnUso[actual] ?? 0) > 0)
              Text('Cambiará en la ficha de ${_personas(repo.rolesEnUso[actual]!)}.', style: TextStyle(fontSize: 13, color: d.pivot.textoSecundario)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text.trim()), child: const Text('Guardar')),
        ],
      ),
    );
  }

  static String _personas(int n) => n == 1 ? '1 persona' : '$n personas';

  Future<void> _crear() async {
    final n = await _pedirNombre();
    if (n == null || n.isEmpty || !mounted) return;
    await _hacer('crear', nombre: n, ok: 'Rol creado');
  }

  Future<void> _renombrar(String r) async {
    final n = await _pedirNombre(actual: r);
    if (n == null || n.isEmpty || n == r || !mounted) return;
    await _hacer('renombrar', nombre: r, nuevo: n, ok: 'Rol renombrado');
  }

  Future<void> _borrar(String r) async {
    final n = repo.rolesEnUso[r] ?? 0;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Borrar "$r"?'),
        content: Text(n > 0 ? 'Se le quitará este rol a ${_personas(n)}.' : 'Nadie tiene este rol todavía.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Borrar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _hacer('borrar', nombre: r, ok: 'Rol borrado');
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        flexibleSpace: const Vidrio(child: SizedBox.expand()),
        title: const Text('Roles del equipo', style: TextStyle(fontWeight: FontWeight.w700)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: AnimatedOpacity(opacity: _guardando ? 1 : 0, duration: const Duration(milliseconds: 200), child: const LinearProgressIndicator(minHeight: 3)),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _guardando ? null : _crear,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Nuevo rol'),
      ),
      body: ListenableBuilder(
        listenable: repo,
        builder: (context, _) {
          final roles = repo.roles;
          return ReorderableListView.builder(
            padding: EdgeInsets.fromLTRB(16, 8 + altoBarra(context), 16, 96),
            header: Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: Text(
                'Cada persona elige sus roles en su ficha. Mantén presionado un rol para cambiar el orden.',
                style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
              ),
            ),
            itemCount: roles.length,
            onReorderItem: (de, a) {
              final l = [...roles];
              final r = l.removeAt(de);
              l.insert(a, r);
              repo.roles = l; // se ve al instante
              setState(() {});
              _hacer('ordenar', lista: l);
            },
            itemBuilder: (context, i) {
              final r = roles[i];
              final n = repo.rolesEnUso[r] ?? 0;
              return Padding(
                key: ValueKey(r),
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: p.tarjeta,
                  borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                  child: ListTile(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                    leading: Icon(Icons.shield_outlined, color: p.marcaTexto),
                    title: Text(r, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(n == 0 ? 'Nadie todavía' : _personas(n)),
                    onTap: _guardando ? null : () => _renombrar(r),
                    trailing: IconButton(
                      tooltip: 'Borrar rol',
                      icon: const Icon(Icons.delete_outline_rounded),
                      onPressed: _guardando ? null : () => _borrar(r),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
