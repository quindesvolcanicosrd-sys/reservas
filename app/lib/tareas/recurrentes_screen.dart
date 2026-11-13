import 'package:flutter/material.dart';

import '../ajustes/componentes.dart';
import '../core/api.dart';
import '../core/cargando.dart';
import '../core/tema.dart';
import 'tareas_modelos.dart';
import 'tareas_repo.dart';

/// Tareas recurrentes (admins): plantillas que crean una tarea cada cierto tiempo.
/// Se editan (cambia la de este mes y las siguientes), se pausan, se
/// reanudan o se terminan sin borrar el historial.
class RecurrentesScreen extends StatefulWidget {
  const RecurrentesScreen({super.key, required this.repo});
  final TareasRepo repo;

  @override
  State<RecurrentesScreen> createState() => _RecurrentesScreenState();
}

class _RecurrentesScreenState extends State<RecurrentesScreen> {
  late Future<List<Recurrente>> _f = widget.repo.recurrentes();

  void _recargar() => setState(() => _f = widget.repo.recurrentes());

  Future<void> _hacer(Future<void> Function() accion, String ok) async {
    final hecho = await guardarConAviso(context, accion, ok: ok);
    if (hecho && mounted) _recargar();
  }

  Future<void> _opciones(Recurrente r) async {
    final v = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => HojaBase(
        titulo: r.titulo,
        ayuda: '${r.area} · ${textoPuntos(r.puntos)} · ${r.cupos == 1 ? '1 cupo' : '${r.cupos} cupos'}',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(leading: const Icon(Icons.edit_rounded), title: const Text('Editar'), onTap: () => Navigator.pop(c, 'editar')),
            ListTile(
              leading: Icon(r.pausada ? Icons.play_arrow_rounded : Icons.pause_rounded),
              title: Text(r.pausada ? 'Reanudar' : 'Pausar'),
              subtitle: Text(r.pausada ? 'Vuelve a crearse según su frecuencia.' : 'Deja de crearse hasta que la reanudes.'),
              onTap: () => Navigator.pop(c, r.pausada ? 'activa' : 'pausada'),
            ),
            ListTile(
              leading: Icon(Icons.stop_circle_outlined, color: context.pivot.marcaTexto),
              title: Text('Terminar', style: TextStyle(color: context.pivot.marcaTexto)),
              subtitle: const Text('No se crea más. El historial y los puntos dados se mantienen.'),
              onTap: () => Navigator.pop(c, 'terminada'),
            ),
          ],
        ),
      ),
    );
    if (v == null || !mounted) return;
    if (v == 'editar') return _editar(r);
    if (v == 'terminada') {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('¿Terminar la recurrente?'),
          content: const Text('Deja de crearse. Si la que está en curso no la tomó nadie, también se quita.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Terminar')),
          ],
        ),
      );
      if (ok != true) return;
    }
    await _hacer(() => widget.repo.estadoPlantilla(r.id, v), switch (v) {
      'activa' => 'Recurrente reanudada',
      'pausada' => 'Recurrente pausada',
      _ => 'Recurrente terminada',
    });
  }

  Future<void> _editar(Recurrente r) async {
    final titulo = await editarTexto(
      context,
      titulo: 'Título',
      valor: r.titulo,
      maxLength: 120,
      validar: (v) => v.length < 3 ? 'Escribe al menos 3 caracteres.' : null,
    );
    if (titulo == null || !mounted) return;
    final notas = await editarTexto(context, titulo: 'Detalles', valor: r.notas, lineas: 6, maxLength: 1000);
    if (notas == null || !mounted) return;
    final area = await elegirOpciones(context, titulo: 'Área', opciones: [for (final a in AreaTarea.lista) a.nombre], valor: r.area);
    if (area == null || !mounted) return;
    final puntos = await editarTexto(
      context,
      titulo: 'Puntos',
      valor: '${r.puntos}',
      teclado: TextInputType.number,
      maxLength: 3,
      validar: (v) => int.tryParse(v) == null ? 'Escribe un número.' : null,
    );
    if (puntos == null || !mounted) return;
    final cupos = await editarTexto(
      context,
      titulo: 'Cupos',
      valor: '${r.cupos}',
      teclado: TextInputType.number,
      maxLength: 2,
      validar: (v) => (int.tryParse(v) ?? 0) < 1 ? 'Al menos 1.' : null,
    );
    if (cupos == null || !mounted) return;
    await _hacer(
      () =>
          widget.repo.editarPlantilla(r, titulo: titulo, notas: notas, area: area.isEmpty ? r.area : area, puntos: int.parse(puntos), cupos: int.parse(cupos)),
      'Cambios guardados en esta y las siguientes',
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tareas recurrentes', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: FutureBuilder<List<Recurrente>>(
        future: _f,
        builder: (context, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: PivotCargando());
          if (s.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      s.error is ApiException ? '${s.error}' : 'No se pudieron cargar. Revisa tu conexión.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: p.textoSecundario),
                    ),
                    const SizedBox(height: 12),
                    FilledButton.tonal(onPressed: _recargar, child: const Text('Reintentar')),
                  ],
                ),
              ),
            );
          }
          final l = s.data!;
          final activas = l.where((r) => !r.pausada).toList(), pausadas = l.where((r) => r.pausada).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
            children: [
              if (l.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'No hay tareas recurrentes. Créalas desde "Nueva tarea" eligiendo "Recurrente".',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: p.textoSecundario),
                  ),
                ),
              if (activas.isNotEmpty) GrupoAjustes(titulo: 'ACTIVAS', pie: 'Se crean solas según su frecuencia.', filas: [for (final r in activas) _fila(r)]),
              if (pausadas.isNotEmpty) GrupoAjustes(titulo: 'PAUSADAS', filas: [for (final r in pausadas) _fila(r)]),
            ],
          );
        },
      ),
    );
  }

  Widget _fila(Recurrente r) {
    final a = AreaTarea.de(r.area);
    return FilaAjuste(
      icono: r.pausada ? Icons.pause_rounded : a.icono,
      seccion: a.seccion,
      titulo: r.titulo,
      valor: '${r.frecuencia} · ${textoPuntos(r.puntos)} · ${r.cupos == 1 ? '1 cupo' : '${r.cupos} cupos'}',
      alTocar: () => _opciones(r),
    );
  }
}
