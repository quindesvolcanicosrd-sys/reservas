import 'package:flutter/material.dart';

import '../ajustes/componentes.dart';
import '../core/api.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import 'crear_tarea_screen.dart';
import 'tareas_modelos.dart';
import 'tareas_repo.dart';
import 'tareas_screen.dart';

/// Detalle de una tarea: datos, quiénes la tienen y lo que se puede hacer
/// (tomar, soltar, enviar a revisión, rescatar). Admins además editan,
/// duplican, asignan, aprueban o devuelven, archivan y eliminan.
class TareaScreen extends StatefulWidget {
  const TareaScreen({super.key, required this.repo, required this.tarea, this.mia});
  final TareasRepo repo;
  final Tarea tarea;
  final MiTarea? mia;

  @override
  State<TareaScreen> createState() => _TareaScreenState();
}

class _TareaScreenState extends State<TareaScreen> {
  TareasRepo get repo => widget.repo;
  bool _ocupado = false;

  /// Versión al día (después de cada acción el repo recarga).
  ({Tarea t, MiTarea? mia}) get _actual {
    final id = widget.tarea.id;
    for (final m in repo.mias) {
      if (m.tarea.id == id) return (t: m.tarea, mia: m);
    }
    for (final t in [...repo.tablero, ...repo.baul]) {
      if (t.id == id) return (t: t, mia: null);
    }
    return (t: widget.tarea, mia: null);
  }

  Future<void> _hacer(Future<void> Function() accion, String ok, {bool cerrar = false}) async {
    if (_ocupado) return;
    setState(() => _ocupado = true);
    final m = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      await accion();
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(ok)));
      if (cerrar) nav.pop();
    } catch (e) {
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo completar. Revisa tu conexión.')));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<bool> _confirmar(String titulo, String texto, String si, {bool peligro = false}) async {
    final p = context.pivot;
    final r = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(titulo),
        content: Text(texto),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
          FilledButton(
            style: peligro ? FilledButton.styleFrom(backgroundColor: p.marca, foregroundColor: p.sobreMarca) : null,
            onPressed: () => Navigator.pop(c, true),
            child: Text(si),
          ),
        ],
      ),
    );
    return r == true;
  }

  /// Recurrente: ¿solo la de este período o también las siguientes?
  Future<bool?> _alcance() => showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (c) => HojaBase(
      titulo: 'Editar tarea recurrente',
      ayuda: 'Esta tarea se repite cada mes.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(leading: const Icon(Icons.event_rounded), title: const Text('Solo la de este mes'), onTap: () => Navigator.pop(c, false)),
          ListTile(leading: const Icon(Icons.event_repeat_rounded), title: const Text('Esta y las siguientes'), onTap: () => Navigator.pop(c, true)),
        ],
      ),
    ),
  );

  Future<void> _editar(Tarea t) async {
    var siguientes = false;
    if (t.recurrente) {
      final r = await _alcance();
      if (r == null || !mounted) return;
      siguientes = r;
    }
    await CrearTareaScreen.abrir(context, repo: repo, modo: ModoTarea.editar, base: t, siguientes: siguientes);
    if (mounted) setState(() {});
  }

  Future<void> _asignar(Tarea t) async {
    final elegidas = await elegirPersonas(context, repo: repo, iniciales: {for (final x in t.personas) x.username}, maximo: t.cupos);
    if (elegidas == null) return;
    await _hacer(() => repo.asignar(t, elegidas.toList()), 'Personas actualizadas');
  }

  Future<void> _devolver(PersonaTarea x) async {
    final nota = await editarTexto(
      context,
      titulo: 'Devolver a ${x.nombreMostrar}',
      ayuda: 'Cuéntale qué falta. La tarea vuelve a sus tareas y le llega una notificación.',
      lineas: 4,
      maxLength: 300,
    );
    if (nota == null) return;
    await _hacer(() => repo.validar(x, aprobar: false, nota: nota), 'Tarea devuelta');
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final (:t, :mia) = _actual;
        return Scaffold(
          appBar: AppBar(
            title: const Text('Tarea', style: TextStyle(fontWeight: FontWeight.w700)),
            actions: [if (repo.esAdmin) _menuAdmin(t)],
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
            children: [
              _Cabecera(tarea: t, mia: mia),
              if (mia != null && mia.notaRechazo.isNotEmpty && !mia.enRevision)
                _Aviso(icono: Icons.reply_rounded, texto: 'Admins pidieron cambios: ${mia.notaRechazo}'),
              if (mia?.enRevision == true)
                const _Aviso(icono: Icons.hourglass_top_rounded, texto: 'En revisión. Te llegará una notificación cuando la revisen.'),
              if (t.notas.isNotEmpty)
                GrupoAjustes(
                  titulo: 'DETALLES',
                  filas: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: SelectableText(t.notas, style: const TextStyle(fontSize: 15, height: 1.4)),
                    ),
                  ],
                ),
              GrupoAjustes(
                titulo: 'QUIÉNES LA TIENEN',
                pie: t.libres > 0
                    ? (t.libres == 1 ? 'Queda 1 cupo libre de ${t.cupos}.' : 'Quedan ${t.libres} cupos libres de ${t.cupos}.')
                    : 'Sin cupos libres.',
                filas: t.personas.isEmpty
                    ? [
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Text('Nadie la tomó todavía.', style: TextStyle(color: context.pivot.textoSecundario)),
                        ),
                      ]
                    : [for (final x in t.personas) _filaPersona(x)],
              ),
              const SizedBox(height: 4),
              ..._acciones(t, mia),
            ],
          ),
        );
      },
    );
  }

  Widget _filaPersona(PersonaTarea x) {
    final p = context.pivot;
    final revisar = repo.esAdmin && x.enRevision;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: 36),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  x.nombreMostrar,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.texto),
                ),
                Text(x.enRevision ? 'Enviada a revisión' : 'En curso', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              ],
            ),
          ),
          if (revisar) ...[
            IconButton(tooltip: 'Devolver', onPressed: _ocupado ? null : () => _devolver(x), icon: const Icon(Icons.undo_rounded)),
            IconButton.filled(
              tooltip: 'Aprobar',
              onPressed: _ocupado ? null : () => _hacer(() => repo.validar(x, aprobar: true), 'Tarea aprobada'),
              icon: const Icon(Icons.check_rounded),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _acciones(Tarea t, MiTarea? mia) {
    final p = context.pivot;
    Widget principal(String texto, IconData icono, VoidCallback? alTocar) => FilledButton.icon(
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      onPressed: _ocupado ? null : alTocar,
      icon: Icon(icono),
      label: Text(texto),
    );
    if (mia != null) {
      if (mia.enRevision) return const [];
      return [
        principal(repo.esAdmin ? 'Finalizar tarea' : 'Enviar a revisión', Icons.send_rounded, () async {
          final ok = await _confirmar(
            repo.esAdmin ? '¿Finalizar tarea?' : '¿Enviar a revisión?',
            repo.esAdmin ? 'Se aprueba de una vez y suma sus puntos.' : 'Admins la revisan y, al aprobarla, suma tus puntos.',
            repo.esAdmin ? 'Finalizar' : 'Enviar',
          );
          if (ok) await _hacer(() => repo.enviar(mia), repo.esAdmin ? 'Tarea finalizada' : 'Enviada a revisión', cerrar: true);
        }),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _ocupado
              ? null
              : () async {
                  final ok = await _confirmar('¿Soltar tarea?', 'Vuelve a quedar libre para el resto del equipo.', 'Soltar');
                  if (ok) await _hacer(() => repo.soltar(t), 'Tarea soltada', cerrar: true);
                },
          child: Text('Soltar tarea', style: TextStyle(color: p.marcaTexto)),
        ),
      ];
    }
    if (t.tiene(repo.yo) || t.libres == 0) return const [];
    final enLimite = repo.enLimite;
    return [
      principal(
        t.enBaul ? 'Rescatar tarea' : 'Tomar tarea',
        t.enBaul ? Icons.restore_rounded : Icons.add_task_rounded,
        enLimite ? null : () => _hacer(() => t.enBaul ? repo.rescatar(t) : repo.tomar(t), t.enBaul ? 'Tarea rescatada' : 'Tarea tomada'),
      ),
      if (enLimite)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            'Ya tienes ${repo.limite} tareas activas, el máximo. Termina o suelta una para tomar otra.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: p.textoSecundario),
          ),
        ),
    ];
  }

  Widget _menuAdmin(Tarea t) {
    return PopupMenuButton<String>(
      tooltip: 'Más opciones',
      onSelected: (v) async {
        switch (v) {
          case 'editar':
            await _editar(t);
          case 'duplicar':
            await CrearTareaScreen.abrir(context, repo: repo, modo: ModoTarea.duplicar, base: t);
          case 'asignar':
            await _asignar(t);
          case 'pausar':
            if (await _confirmar('¿Pausar la recurrente?', 'Deja de crearse cada mes hasta que la reanudes. La de este mes sigue disponible.', 'Pausar')) {
              await _hacer(() => repo.estadoPlantilla(t.idPlantilla!, 'pausada'), 'Recurrente pausada');
            }
          case 'archivar':
            if (await _confirmar('¿Archivar tarea?', 'Sale del tablero. Quienes la tienen en curso la pierden; lo ya aprobado se mantiene.', 'Archivar')) {
              await _hacer(() => repo.archivar(t), 'Tarea archivada', cerrar: true);
            }
          case 'eliminar':
            if (await _confirmar(
              '¿Eliminar tarea?',
              'Se borra con su historial y se restan los puntos que ya dio. No se puede deshacer.',
              'Eliminar',
              peligro: true,
            )) {
              await _hacer(() => repo.eliminar(t), 'Tarea eliminada', cerrar: true);
            }
        }
      },
      itemBuilder: (_) => [
        const PopupMenuItem(value: 'editar', child: Text('Editar')),
        const PopupMenuItem(value: 'duplicar', child: Text('Duplicar')),
        if (!t.enBaul) const PopupMenuItem(value: 'asignar', child: Text('Asignar personas')),
        if (t.recurrente) const PopupMenuItem(value: 'pausar', child: Text('Pausar recurrente')),
        const PopupMenuItem(value: 'archivar', child: Text('Archivar')),
        const PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
      ],
    );
  }
}

class _Cabecera extends StatelessWidget {
  const _Cabecera({required this.tarea, this.mia});
  final Tarea tarea;
  final MiTarea? mia;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final area = tarea.areaInfo;
    final (degradado, sobre) = PivotPaleta.seccion(area.seccion, Theme.of(context).brightness);
    final vence = mia?.vence ?? tarea.vence;
    final vencida = mia != null && !mia!.enRevision && (mia!.dias ?? 0) < 0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Hero(
                tag: 'tarea-${tarea.id}',
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                  child: Icon(area.icono, size: 30, color: sobre),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      area.nombre,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: p.textoSecundario),
                    ),
                    const SizedBox(height: 2),
                    Text(tarea.titulo, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              PillPuntos(puntos: tarea.puntos),
              _Dato(
                icono: Icons.event_rounded,
                texto: vence == null
                    ? 'Sin fecha límite'
                    : '${textoVence(vence)}${(vence.difference(Fechas.hoy()).inDays).abs() < 7 ? ' · ${Fechas.corta(vence)}' : ''}',
                destacado: vencida,
              ),
              if (tarea.recurrente) const _Dato(icono: Icons.repeat_rounded, texto: 'Se repite cada mes'),
              if (mia?.rescate == true) const _Dato(icono: Icons.restore_rounded, texto: 'Rescatada del baúl'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Dato extends StatelessWidget {
  const _Dato({required this.icono, required this.texto, this.destacado = false});
  final IconData icono;
  final String texto;
  final bool destacado;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final c = destacado ? p.marcaTexto : p.textoSecundario;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(PivotRadios.boton),
        border: Border.all(color: destacado ? p.marca : p.bordeSuave),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icono, size: 15, color: c),
          const SizedBox(width: 5),
          Text(
            texto,
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c),
          ),
        ],
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.icono, required this.texto});
  final IconData icono;
  final String texto;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, size: 20, color: p.sobreSuave),
          const SizedBox(width: 12),
          Expanded(
            child: Text(texto, style: TextStyle(fontSize: 14, height: 1.35, color: p.sobreSuave)),
          ),
        ],
      ),
    );
  }
}
