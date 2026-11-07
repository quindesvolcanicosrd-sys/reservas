import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';

/// Calendario del mes que se despliega hacia abajo desde la barra de
/// Eventos (como Google Calendar). Muestra los días con eventos (mismo
/// código de puntos que el timeline); deslizar a los lados cambia de mes
/// y tocar un día lleva a ese punto del timeline.
class PanelCalendario extends StatefulWidget {
  const PanelCalendario({super.key, required this.repo, required this.mes, required this.alCambiarMes, required this.alElegirDia});
  final EventosRepo repo;
  final DateTime mes;
  final ValueChanged<DateTime> alCambiarMes;
  final ValueChanged<DateTime> alElegirDia;

  @override
  State<PanelCalendario> createState() => _CalendarioState();
}

class _CalendarioState extends State<PanelCalendario> {
  DateTime get _mes => DateTime(widget.mes.year, widget.mes.month);
  int _direccion = 1;

  static const _cabecera = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  @override
  void initState() {
    super.initState();
    widget.repo.asegurarMes(_mes);
  }

  void _cambiarMes(int delta) {
    setState(() => _direccion = delta);
    final nuevo = DateTime(_mes.year, _mes.month + delta);
    widget.alCambiarMes(nuevo);
    widget.repo.asegurarMes(nuevo);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return GestureDetector(
      onHorizontalDragEnd: (d) {
        final v = d.primaryVelocity ?? 0;
        if (v.abs() > 200) _cambiarMes(v < 0 ? 1 : -1);
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: ListenableBuilder(
          listenable: widget.repo,
          builder: (context, _) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  for (final c in _cabecera)
                    Expanded(
                      child: Center(
                        child: Text(
                          c,
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.textoSecundario),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 260),
                transitionBuilder: (c, a) => FadeTransition(
                  opacity: a,
                  child: SlideTransition(
                    position: Tween(begin: Offset(0.12 * _direccion, 0), end: Offset.zero).animate(a),
                    child: c,
                  ),
                ),
                child: KeyedSubtree(key: ValueKey(_mes), child: _grilla(context)),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                runSpacing: 4,
                alignment: WrapAlignment.center,
                children: [
                  _leyenda(p, relleno: p.marca, borde: p.marca, texto: 'Asistirás'),
                  _leyenda(p, relleno: p.fondo, borde: p.marca, texto: 'Sin responder'),
                  _leyenda(p, relleno: p.apagadoPunto, borde: p.apagadoPunto, texto: 'Cancelado / no vas'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _leyenda(PivotPaleta p, {required Color relleno, required Color borde, required String texto}) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(
            color: relleno,
            shape: BoxShape.circle,
            border: Border.all(color: borde, width: 1.5),
          ),
        ),
        const SizedBox(width: 6),
        Text(texto, style: TextStyle(fontSize: 12, color: p.textoSecundario)),
      ],
    );
  }

  Widget _grilla(BuildContext context) {
    final p = context.pivot;
    final hoy = Fechas.hoy();
    final primero = DateTime(_mes.year, _mes.month, 1);
    final diasMes = DateTime(_mes.year, _mes.month + 1, 0).day;
    final huecos = primero.weekday - 1;
    final porDia = <int, List<Evento>>{};
    for (final e in widget.repo.eventos) {
      if (e.fecha.year == _mes.year && e.fecha.month == _mes.month) porDia.putIfAbsent(e.fecha.day, () => []).add(e);
    }
    final cumples = {
      for (final c in widget.repo.cumples)
        if (c.fecha.year == _mes.year && c.fecha.month == _mes.month) c.fecha.day,
    };
    final celdas = <Widget>[
      for (var i = 0; i < huecos; i++) const SizedBox.shrink(),
      for (var d = 1; d <= diasMes; d++) _celda(context, p, DateTime(_mes.year, _mes.month, d), porDia[d] ?? const [], cumples.contains(d), hoy),
    ];
    return GridView.count(crossAxisCount: 7, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), childAspectRatio: 1.15, children: celdas);
  }

  Widget _celda(BuildContext context, PivotPaleta p, DateTime dia, List<Evento> eventos, bool cumple, DateTime hoy) {
    final esHoy = dia == hoy;
    final tieneAlgo = eventos.isNotEmpty || cumple;
    Widget puntoDe(Evento e) {
      final Color relleno, borde;
      if (e.cancelado || e.miEstado == EstadoRsvp.noAsistire) {
        relleno = p.apagadoPunto;
        borde = p.apagadoPunto;
      } else if (e.miEstado != null) {
        relleno = p.marca;
        borde = p.marca;
      } else {
        relleno = p.fondo;
        borde = p.marca;
      }
      return Container(
        width: 7,
        height: 7,
        margin: const EdgeInsets.symmetric(horizontal: 1),
        decoration: BoxDecoration(
          color: relleno,
          shape: BoxShape.circle,
          border: Border.all(color: borde, width: 1.5),
        ),
      );
    }

    return InkWell(
      customBorder: const CircleBorder(),
      onTap: () => widget.alElegirDia(dia),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: esHoy ? p.marca : null, shape: BoxShape.circle),
            child: Text(
              '${dia.day}',
              style: TextStyle(
                fontSize: 15,
                fontWeight: tieneAlgo || esHoy ? FontWeight.w700 : FontWeight.w400,
                color: esHoy ? p.sobreMarca : (tieneAlgo ? p.texto : p.textoSecundario),
              ),
            ),
          ),
          const SizedBox(height: 3),
          SizedBox(
            height: 8,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (final e in eventos.take(3)) puntoDe(e),
                if (cumple) Icon(Icons.cake_rounded, size: 8, color: p.marcaTexto),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
