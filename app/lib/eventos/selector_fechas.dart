import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';

/// Calendario de un mes para elegir una fecha o un rango (ida y vuelta).
/// Mismo criterio que los calendarios inline de la web (`_evAntCalRender()`,
/// `_evCrearCalRender()`): días pasados o fuera de límite deshabilitados,
/// el primer toque fija "desde", el segundo "hasta".
class SelectorFechas extends StatefulWidget {
  const SelectorFechas({super.key, required this.desde, this.hasta, this.rango = false, this.deshabilitado, required this.alCambiar});

  final DateTime? desde;
  final DateTime? hasta;
  final bool rango;
  final bool Function(DateTime dia)? deshabilitado;
  final void Function(DateTime? desde, DateTime? hasta) alCambiar;

  @override
  State<SelectorFechas> createState() => _SelectorFechasState();
}

class _SelectorFechasState extends State<SelectorFechas> {
  late DateTime _mes;
  int _direccion = 1;

  static const _cabecera = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  @override
  void initState() {
    super.initState();
    final base = widget.desde ?? Fechas.hoy();
    _mes = DateTime(base.year, base.month);
  }

  void _mover(int delta) => setState(() {
    _direccion = delta;
    _mes = DateTime(_mes.year, _mes.month + delta);
  });

  void _tocar(DateTime dia) {
    if (!widget.rango) {
      widget.alCambiar(dia, null);
      return;
    }
    final d = widget.desde, h = widget.hasta;
    if (d == null || h != null) {
      widget.alCambiar(dia, null);
    } else if (dia.isBefore(d)) {
      widget.alCambiar(dia, null);
    } else {
      widget.alCambiar(d, dia);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final t = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            IconButton(tooltip: 'Mes anterior', icon: const Icon(Icons.chevron_left_rounded), onPressed: () => _mover(-1)),
            Expanded(
              child: Text(
                Fechas.mesAnio(_mes),
                textAlign: TextAlign.center,
                style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            IconButton(tooltip: 'Mes siguiente', icon: const Icon(Icons.chevron_right_rounded), onPressed: () => _mover(1)),
          ],
        ),
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
          duration: const Duration(milliseconds: 240),
          transitionBuilder: (c, a) => FadeTransition(
            opacity: a,
            child: SlideTransition(
              position: Tween(begin: Offset(0.1 * _direccion, 0), end: Offset.zero).animate(a),
              child: c,
            ),
          ),
          child: KeyedSubtree(key: ValueKey(_mes), child: _grilla(p)),
        ),
      ],
    );
  }

  Widget _grilla(PivotPaleta p) {
    final hoy = Fechas.hoy();
    final primero = DateTime(_mes.year, _mes.month, 1);
    final diasMes = DateTime(_mes.year, _mes.month + 1, 0).day;
    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.1,
      children: [
        for (var i = 0; i < primero.weekday - 1; i++) const SizedBox.shrink(),
        for (var d = 1; d <= diasMes; d++) _celda(p, DateTime(_mes.year, _mes.month, d), hoy),
      ],
    );
  }

  Widget _celda(PivotPaleta p, DateTime dia, DateTime hoy) {
    final off = widget.deshabilitado?.call(dia) ?? false;
    final d = widget.desde, h = widget.hasta;
    final extremo = (d != null && dia == d) || (h != null && dia == h);
    final enRango = d != null && h != null && dia.isAfter(d) && dia.isBefore(h);
    final esHoy = dia == hoy;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(color: enRango ? p.suave : null),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: off ? null : () => _tocar(dia),
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: extremo ? p.marca : null,
                shape: BoxShape.circle,
                border: esHoy && !extremo ? Border.all(color: p.marca, width: 1.5) : null,
              ),
              child: Text(
                '${dia.day}',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: extremo || esHoy ? FontWeight.w700 : FontWeight.w500,
                  color: extremo ? p.sobreMarca : (off ? p.apagado : (enRango ? p.sobreSuave : p.texto)),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
