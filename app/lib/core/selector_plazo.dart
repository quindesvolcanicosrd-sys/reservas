import 'package:flutter/material.dart';

import 'tema.dart';

/// Unidades de plazo que guarda el servidor (Victor, 2026-11-13: "que lo
/// defina libremente el Pivot… este y cualquier tipo de ajuste").
const unidadesPlazo = {'dia': ('día', 'días'), 'semana': ('semana', 'semanas'), 'mes': ('mes', 'meses'), 'anio': ('año', 'años')};

/// "1 mes", "3 semanas", "2 años".
String textoPlazo(int n, String unidad) {
  final u = unidadesPlazo[unidad] ?? unidadesPlazo['mes']!;
  return '$n ${n == 1 ? u.$1 : u.$2}';
}

/// Meses aproximados de un plazo (para vistas previas con datos por mes).
int mesesDePlazo(int n, String unidad) => switch (unidad) {
  'dia' => (n / 30).ceil().clamp(1, 12),
  'semana' => (n * 7 / 30).ceil().clamp(1, 12),
  'anio' => (n * 12).clamp(1, 12),
  _ => n.clamp(1, 12),
};

/// Número + unidad, el mismo control en todos los ajustes con plazo.
class SelectorPlazo extends StatelessWidget {
  const SelectorPlazo({
    super.key,
    required this.valor,
    required this.unidad,
    required this.alCambiar,
    this.min = 1,
    this.max = 99,
    this.unidades = const ['dia', 'semana', 'mes', 'anio'],
  });
  final int valor, min, max;
  final String unidad;
  final List<String> unidades;
  final void Function(int valor, String unidad) alCambiar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final u = unidadesPlazo[unidad] ?? unidadesPlazo['mes']!;
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton.filledTonal(onPressed: valor > min ? () => alCambiar(valor - 1, unidad) : null, icon: const Icon(Icons.remove_rounded)),
            SizedBox(
              width: 110,
              child: Column(
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 150),
                    child: Text(
                      '$valor',
                      key: ValueKey(valor),
                      style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: p.texto),
                    ),
                  ),
                  Text(valor == 1 ? u.$1 : u.$2, style: TextStyle(color: p.textoSecundario)),
                ],
              ),
            ),
            IconButton.filledTonal(onPressed: valor < max ? () => alCambiar(valor + 1, unidad) : null, icon: const Icon(Icons.add_rounded)),
          ],
        ),
        if (unidades.length > 1) ...[
          const SizedBox(height: 10),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [for (final k in unidades) ChoiceChip(label: Text(unidadesPlazo[k]!.$2), selected: unidad == k, onSelected: (_) => alCambiar(valor, k))],
          ),
        ],
      ],
    );
  }
}

/// Contador simple (número sin unidad), mismo estilo que [SelectorPlazo].
class SelectorNumero extends StatelessWidget {
  const SelectorNumero({
    super.key,
    required this.valor,
    required this.alCambiar,
    this.min = 0,
    this.max = 999,
    this.paso = 1,
    this.etiqueta,
    this.decimales = false,
  });
  final num valor, min, max, paso;
  final String? etiqueta;
  final bool decimales;
  final void Function(num) alCambiar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final t = decimales ? (valor % 1 == 0 ? valor.toInt().toString() : valor.toStringAsFixed(1).replaceAll('.', ',')) : '${valor.toInt()}';
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton.filledTonal(onPressed: valor - paso >= min ? () => alCambiar(valor - paso) : null, icon: const Icon(Icons.remove_rounded)),
        SizedBox(
          width: 110,
          child: Column(
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 150),
                child: Text(
                  t,
                  key: ValueKey(t),
                  style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: p.texto),
                ),
              ),
              if (etiqueta != null) Text(etiqueta!, style: TextStyle(color: p.textoSecundario)),
            ],
          ),
        ),
        IconButton.filledTonal(onPressed: valor + paso <= max ? () => alCambiar(valor + paso) : null, icon: const Icon(Icons.add_rounded)),
      ],
    );
  }
}
