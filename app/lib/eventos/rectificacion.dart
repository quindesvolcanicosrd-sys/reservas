import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';

/// Rectificaciones (Victor, 2026-11-12): en un evento pasado con la lista
/// tomada, "¿Es correcto?" deja pedir a los Pivots que corrijan tu
/// asistencia. Mientras espera, el botón dice "Revisión pendiente" y al
/// tocarlo explica el estado y cuántos días quedan. A los 7 días sin
/// respuesta se descarta y se puede volver a pedir.
class BotonRectificacion extends StatelessWidget {
  const BotonRectificacion({super.key, required this.repo, required this.ev});
  final EventosRepo repo;
  final Evento ev;

  /// Solo eventos terminados con asistencia tomada, de los últimos 30 días.
  static bool aplica(Evento ev) => !ev.cancelado && ev.finalizado && ev.asistentes.isNotEmpty && Fechas.hoy().difference(ev.fecha).inDays <= 30;

  EstadoReal? _mio() {
    final yo = (repo.sesion.nombre ?? '').toLowerCase();
    return ev.asistentes.where((a) => a.persona.username.toLowerCase() == yo).firstOrNull?.estado;
  }

  static String _texto(String estado) => switch (estado) {
    'A tiempo' => 'Llegué a horario',
    'Tarde' => 'Llegué tarde',
    _ => 'No fui',
  };

  Future<void> _pedir(BuildContext context) async {
    final actual = switch (_mio()) {
      EstadoReal.aTiempo => 'A tiempo',
      EstadoReal.tarde => 'Tarde',
      null => 'Sin registrar',
    };
    final elegido = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (hoja) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
              child: Text('¿Cómo fue en realidad?', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                'Un Pivot revisará tu pedido y, si corresponde, corregirá tu asistencia del ${Fechas.corta(ev.fecha)}.',
                style: TextStyle(color: hoja.pivot.textoSecundario),
              ),
            ),
            for (final (estado, icono) in const [
              ('A tiempo', Icons.check_circle_rounded),
              ('Tarde', Icons.schedule_rounded),
              ('Sin registrar', Icons.cancel_outlined),
            ])
              if (estado != actual) ListTile(leading: Icon(icono), title: Text(_texto(estado)), onTap: () => Navigator.of(hoja).pop(estado)),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (elegido == null || !context.mounted) return;
    final m = ScaffoldMessenger.of(context);
    try {
      await repo.pedirRectificacion(ev, elegido);
      m.showSnackBar(const SnackBar(content: Text('Pedido enviado. Un Pivot lo revisará.')));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo enviar. Revisa tu conexión.')));
    }
  }

  void _info(BuildContext context, Map<String, dynamic> r) {
    final pendiente = r['decision'] == 'Pendiente';
    final dias = (r['diasQuedan'] as num?)?.toInt() ?? 0;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (hoja) {
        final p = hoja.pivot;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  pendiente ? 'Revisión pendiente' : 'Revisión rechazada',
                  style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  pendiente
                      ? 'Pediste que diga "${_texto('${r['estadoSolicitado']}').toLowerCase()}". Un Pivot lo revisará. '
                            '${dias <= 1 ? 'Si nadie lo revisa hoy' : 'Si nadie lo revisa en $dias días'}, el pedido se descarta y podrás pedirlo de nuevo.'
                      : 'Un Pivot revisó tu pedido y la asistencia quedó como estaba. Si crees que hay un error, habla con un Pivot.',
                  style: TextStyle(fontSize: 15, color: p.texto),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.of(hoja).pop(), child: const Text('Entendido')),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!aplica(ev)) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final p = context.pivot;
        final r = repo.rectificaciones[ev.id];
        final decision = r?['decision'];
        final Widget boton;
        if (decision == 'Pendiente' || decision == 'Rechazada') {
          boton = TextButton.icon(
            key: ValueKey(decision),
            style: TextButton.styleFrom(visualDensity: VisualDensity.compact, foregroundColor: p.textoSecundario),
            onPressed: () => _info(context, r!),
            icon: const Icon(Icons.info_outline_rounded, size: 18),
            label: Text(decision == 'Pendiente' ? 'Revisión pendiente' : 'Revisión rechazada'),
          );
        } else if (decision == 'Aprobada') {
          boton = const SizedBox.shrink(key: ValueKey('ok'));
        } else {
          boton = TextButton(
            key: const ValueKey('pedir'),
            style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
            onPressed: () => _pedir(context),
            child: const Text('¿Es correcto?'),
          );
        }
        return AnimatedSwitcher(duration: const Duration(milliseconds: 220), child: boton);
      },
    );
  }
}
