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

  /// Tocar la asistencia: pedir revisión o, si ya hay una, ver su estado.
  void tocar(BuildContext context) {
    final r = repo.rectificaciones[ev.id];
    final d = r?['decision'];
    if (d == 'Pendiente' || d == 'Rechazada') {
      _info(context, r!);
    } else if (d != 'Aprobada') {
      _pedir(context);
    }
  }

  /// Texto de la acción: "¿Es correcto?", "En revisión" o nada si ya se aprobó.
  String? accion() => switch (repo.rectificaciones[ev.id]?['decision']) {
    'Pendiente' => 'En revisión',
    'Rechazada' => 'Revisada',
    'Aprobada' => null,
    _ => '¿Es correcto?',
  };

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: repo,
    builder: (context, _) {
      final txt = aplica(ev) ? accion() : null;
      if (txt == null) return const SizedBox.shrink();
      return _SegmentoAccion(texto: txt, info: txt != '¿Es correcto?');
    },
  );
}

class _SegmentoAccion extends StatelessWidget {
  const _SegmentoAccion({required this.texto, required this.info});
  final String texto;
  final bool info;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (info) ...[Icon(Icons.info_outline_rounded, size: 14, color: p.marcaTexto), const SizedBox(width: 3)],
        Text(
          texto,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.marcaTexto),
        ),
        Icon(Icons.chevron_right_rounded, size: 16, color: p.marcaTexto),
      ],
    );
  }
}

/// Pill de tu asistencia real con "¿Es correcto?" dentro (Victor,
/// 2026-11-13: suelto se veía sin sentido). Toda la pill se toca.
class PillAsistencia extends StatelessWidget {
  const PillAsistencia({super.key, required this.repo, required this.ev, required this.texto, this.icono, this.completa = false});
  final EventosRepo repo;
  final Evento ev;
  final String texto;
  final IconData? icono;

  /// Ocupa todo el ancho, como el botón de asistencia de abajo (2026-11-13).
  final bool completa;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final b = BotonRectificacion(repo: repo, ev: ev);
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final accion = BotonRectificacion.aplica(ev) ? b.accion() : null;
        return Material(
          color: p.suave,
          shape: const StadiumBorder(),
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: accion == null ? null : () => b.tocar(context),
            child: Padding(
              padding: completa ? const EdgeInsets.fromLTRB(16, 11, 12, 11) : const EdgeInsets.fromLTRB(10, 5, 6, 5),
              child: Row(
                mainAxisSize: completa ? MainAxisSize.max : MainAxisSize.min,
                children: [
                  if (icono != null) ...[Icon(icono, size: 15, color: p.sobreSuave), const SizedBox(width: 4)],
                  Text(
                    texto,
                    style: TextStyle(fontSize: completa ? 13.5 : 12, fontWeight: FontWeight.w700, color: p.sobreSuave),
                  ),
                  if (completa) const Spacer(),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 200),
                    child: accion == null
                        ? const SizedBox(width: 4)
                        : Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(width: 1, height: 14, margin: const EdgeInsets.symmetric(horizontal: 8), color: p.sobreSuave.withValues(alpha: 0.3)),
                              _SegmentoAccion(texto: accion, info: accion != '¿Es correcto?'),
                            ],
                          ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
