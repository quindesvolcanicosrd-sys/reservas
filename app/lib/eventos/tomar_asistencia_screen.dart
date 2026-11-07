import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'widgets_comunes.dart';

/// "Tomar asistencia" (solo admins, desde que el evento empieza). Mismo
/// comportamiento que la subpantalla de la web (`_evAbrirMarcarAsistencia()`):
/// equipo completo con buscador, activos arriba e "Inactivxs" abajo, y por
/// persona "A horario" / "Tarde" (tocar la opción marcada la quita).
class TomarAsistenciaScreen extends StatefulWidget {
  const TomarAsistenciaScreen({super.key, required this.repo, required this.eventoId});
  final EventosRepo repo;
  final String eventoId;

  @override
  State<TomarAsistenciaScreen> createState() => _TomarAsistenciaScreenState();
}

class _TomarAsistenciaScreenState extends State<TomarAsistenciaScreen> {
  List<MiembroRoster>? _roster;
  String? _error;
  String _busqueda = '';

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final r = await widget.repo.roster(forzar: true);
      if (mounted) setState(() => _roster = r);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo cargar el equipo.');
    }
  }

  Future<void> _marcar(Evento ev, Persona persona, EstadoReal? estado) async {
    try {
      await widget.repo.marcarReal(ev, persona, estado);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return ListenableBuilder(
      listenable: widget.repo,
      builder: (context, _) {
        final ev = widget.repo.porId(widget.eventoId);
        if (ev == null) {
          return Scaffold(appBar: AppBar(), body: const Center(child: Text('No encontramos este evento.')));
        }
        final marcados = {for (final a in ev.asistentes) a.persona.username.trim().toUpperCase(): a.estado};
        return Scaffold(
          appBar: AppBar(
            titleSpacing: 0,
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Tomar asistencia', style: TextStyle(fontWeight: FontWeight.w700)),
                Text('${ev.tipo} · ${Fechas.encabezado(ev.fecha)} · ${ev.horaInicio}', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              ],
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                  child: Etiqueta(key: ValueKey(marcados.length), texto: '${marcados.length} ${marcados.length == 1 ? 'presente' : 'presentes'}'),
                ),
              ),
            ],
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: TextField(
                  decoration: const InputDecoration(hintText: 'Buscar persona', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                  onChanged: (v) => setState(() => _busqueda = v),
                ),
              ),
              Expanded(child: _lista(context, ev, marcados)),
            ],
          ),
        );
      },
    );
  }

  Widget _lista(BuildContext context, Evento ev, Map<String, EstadoReal> marcados) {
    final p = context.pivot;
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
          ],
        ),
      );
    }
    if (_roster == null) return const Center(child: CircularProgressIndicator());
    final q = _busqueda.trim().toLowerCase();
    bool coincide(MiembroRoster m) => q.isEmpty || m.persona.nombreMostrar.toLowerCase().contains(q) || m.persona.username.toLowerCase().contains(q);
    final activos = _roster!.where((m) => !m.inactivo && coincide(m)).toList();
    final inactivos = _roster!.where((m) => m.inactivo && coincide(m)).toList();
    if (activos.isEmpty && inactivos.isEmpty) {
      return Center(
        child: Text('Sin resultados.', style: TextStyle(color: p.textoSecundario)),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      children: [
        for (final m in activos) _fila(context, ev, m, marcados),
        if (inactivos.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Row(
              children: [
                Expanded(child: Divider(color: p.tarjetaBorde)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    'Inactivxs',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: p.textoSecundario),
                  ),
                ),
                Expanded(child: Divider(color: p.tarjetaBorde)),
              ],
            ),
          ),
          for (final m in inactivos) _fila(context, ev, m, marcados),
        ],
      ],
    );
  }

  Widget _fila(BuildContext context, Evento ev, MiembroRoster m, Map<String, EstadoReal> marcados) {
    final p = context.pivot;
    final actual = marcados[m.persona.username.trim().toUpperCase()];
    // Su respuesta previa (RSVP), como ayuda al pasar lista.
    Rsvp? rsvp;
    for (final r in ev.rsvps) {
      if (r.persona.username.trim().toUpperCase() == m.persona.username.trim().toUpperCase()) rsvp = r;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          AvatarPersona(nombre: m.persona.nombreMostrar, foto: m.persona.fotoPerfil, tamano: 38),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  m.persona.nombreMostrar,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w600, color: p.texto),
                ),
                if (rsvp != null) Text('Respondió: ${rsvp.estado.valor}', style: TextStyle(fontSize: 12, color: p.textoSecundario)),
              ],
            ),
          ),
          SegmentedButton<EstadoReal>(
            emptySelectionAllowed: true,
            showSelectedIcon: false,
            style: const ButtonStyle(visualDensity: VisualDensity.compact, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
            segments: [for (final e in EstadoReal.values) ButtonSegment(value: e, label: Text(e.etiqueta))],
            selected: {?actual},
            onSelectionChanged: (s) => _marcar(ev, m.persona, s.isEmpty ? null : s.first),
          ),
        ],
      ),
    );
  }
}
