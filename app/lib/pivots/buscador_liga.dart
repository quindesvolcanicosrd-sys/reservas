import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/tema.dart';

/// Buscador de Mi Liga (Victor, 2026-11-13), como el de ajustes de Android:
/// encuentra cualquier ajuste, aunque esté dentro de una subsección, lleva
/// hasta ahí y lo hace parpadear.
class EntradaAjuste {
  const EntradaAjuste(this.id, this.titulo, this.ruta, this.palabras, {this.dentro});

  /// Id de la fila a resaltar (en Mi Liga o en la subsección).
  final String id;
  final String titulo;

  /// Dónde está, para mostrarlo: "Mi Liga › Equipos y puntos".
  final String ruta;

  /// Sinónimos para encontrarlo aunque no se escriba el nombre exacto.
  final String palabras;

  /// Subsección que hay que abrir (null = está en Mi Liga).
  final String? dentro;
}

const entradasLiga = [
  EntradaAjuste('tesoreria', 'Tesorería', 'Mi Liga', 'dinero cuentas caja banco saldo plata finanzas'),
  EntradaAjuste('equipos', 'Equipos y puntos', 'Mi Liga › Equipo', 'categorías quindes mirlxs subir bajar reglas mínimos'),
  EntradaAjuste('pivots', 'Pivots y permisos', 'Mi Liga › Equipo', 'administradores admins áreas acceso permisos roles'),
  EntradaAjuste('pedidos', 'Pedidos de Pivots', 'Mi Liga › Equipo', 'aprobar solicitudes otro pivot automático'),
  EntradaAjuste('canal', 'Canal de comunicación', 'Mi Liga › Comunicación', 'whatsapp telegram signal teléfono llamar mensajes'),
  EntradaAjuste('formas', 'Formas de pago', 'Mi Liga › Cobros', 'medios billetera virtual banco transferencia efectivo enlace comprobante logo color'),
  EntradaAjuste('mensualidad', 'Mensualidad', 'Mi Liga › Cobros', 'precio cuota mes valor'),
  EntradaAjuste('clase', 'Clase suelta', 'Mi Liga › Cobros', 'precio por clase valor'),
  EntradaAjuste('tolerancia', 'Tolerancia de llegada', 'Mi Liga › Reglas', 'tarde minutos llegar atraso lista'),
  EntradaAjuste('rectificaciones', 'Rectificaciones', 'Mi Liga › Reglas', 'corregir asistencia días revisar'),
  EntradaAjuste('minimo', 'Pocas personas en un evento', 'Mi Liga › Reglas', 'cancelar mínimo personas evento'),
  EntradaAjuste('inactividad', 'Inactividad', 'Mi Liga › Reglas', 'inactivos días sin venir'),
  EntradaAjuste('logo', 'Logo de la liga', 'Mi Liga › Datos de la liga', 'imagen escudo marca'),
  EntradaAjuste('pais', 'País', 'Mi Liga › Datos de la liga', 'país teléfono prefijo'),
  EntradaAjuste('zona', 'Zona horaria', 'Mi Liga › Datos de la liga', 'hora horario reloj'),
  // Dentro de Equipos y puntos.
  EntradaAjuste(
    'corte',
    'Cuándo se aplican los cambios',
    'Mi Liga › Equipos y puntos',
    'corte revisar antes automático día cambio de equipo',
    dentro: 'equipos',
  ),
  EntradaAjuste('puntos', 'Puntos por asistencia', 'Mi Liga › Equipos y puntos', 'valor a tiempo tarde puntos fecha', dentro: 'equipos'),
  EntradaAjuste('queCuenta', 'Qué cuenta como clase', 'Mi Liga › Equipos y puntos', 'clase tipos de evento partido llegadas tarde suman', dentro: 'equipos'),
  EntradaAjuste('historial', 'Historial de cambios', 'Mi Liga › Equipos y puntos', 'quién cambió registro auditoría', dentro: 'equipos'),
  EntradaAjuste('nuevoEquipo', 'Crear un equipo', 'Mi Liga › Equipos y puntos', 'nuevo equipo agregar', dentro: 'equipos'),
  // Dentro de Tesorería.
  EntradaAjuste('saldos', 'Saldos de personas', 'Mi Liga › Tesorería', 'deudas préstamos a favor debe', dentro: 'tesoreria'),
  EntradaAjuste('fondos', 'Fondos de viaje', 'Mi Liga › Tesorería', 'viaje torneo reparto asistencia', dentro: 'tesoreria'),
  EntradaAjuste('movimientos', 'Todos los movimientos', 'Mi Liga › Tesorería', 'ingresos gastos exportar excel csv filtrar', dentro: 'tesoreria'),
  EntradaAjuste('transparencia', 'Transparencia', 'Mi Liga › Tesorería', 'equipo ve totales público', dentro: 'tesoreria'),
];

String _sinTildes(String s) => s
    .toLowerCase()
    .replaceAll(RegExp('[áà]'), 'a')
    .replaceAll(RegExp('[éè]'), 'e')
    .replaceAll(RegExp('[íì]'), 'i')
    .replaceAll(RegExp('[óò]'), 'o')
    .replaceAll(RegExp('[úùü]'), 'u');

List<EntradaAjuste> buscarAjustes(String q, {bool tesoreria = true}) {
  final palabras = _sinTildes(q).split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  if (palabras.isEmpty) return const [];
  final r = <(int, EntradaAjuste)>[];
  for (final e in entradasLiga) {
    if (!tesoreria && (e.id == 'tesoreria' || e.dentro == 'tesoreria')) continue;
    final t = _sinTildes(e.titulo), todo = _sinTildes('${e.titulo} ${e.ruta} ${e.palabras}');
    if (!palabras.every(todo.contains)) continue;
    // Primero lo que coincide con el nombre.
    r.add((palabras.every(t.contains) ? 0 : 1, e));
  }
  r.sort((a, b) => a.$1.compareTo(b.$1));
  return [for (final x in r) x.$2];
}

/// Pantalla del buscador. Devuelve la entrada elegida.
class BuscadorLigaScreen extends StatefulWidget {
  const BuscadorLigaScreen({super.key, this.tesoreria = true});
  final bool tesoreria;

  @override
  State<BuscadorLigaScreen> createState() => _BuscadorLigaScreenState();
}

class _BuscadorLigaScreenState extends State<BuscadorLigaScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final r = buscarAjustes(_q, tesoreria: widget.tesoreria);
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: true,
          onChanged: (v) => setState(() => _q = v),
          decoration: const InputDecoration(hintText: 'Buscar en Mi Liga', border: InputBorder.none, filled: false),
        ),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        child: _q.trim().isEmpty
            ? Center(
                key: const ValueKey('v'),
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    'Escribe lo que buscas: "tarde", "precio", "whatsapp", "deudas"…',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: p.textoSecundario),
                  ),
                ),
              )
            : r.isEmpty
            ? Center(
                key: const ValueKey('n'),
                child: Text('No hay ajustes con "${_q.trim()}".', style: TextStyle(color: p.textoSecundario)),
              )
            : ListView(
                key: const ValueKey('l'),
                children: [
                  for (final e in r)
                    ListTile(
                      leading: Icon(Icons.subdirectory_arrow_right_rounded, color: p.marcaTexto),
                      title: Text(e.titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(e.ruta),
                      onTap: () => Navigator.of(context).pop(e),
                    ),
                ],
              ),
      ),
    );
  }
}

/// Envuelve una fila: cuando `resaltado` tiene su id, la lleva a la vista y
/// la hace parpadear tres veces.
class Resaltable extends StatefulWidget {
  const Resaltable({super.key, required this.id, required this.resaltado, required this.child});
  final String id;
  final ValueNotifier<String?> resaltado;
  final Widget child;

  @override
  State<Resaltable> createState() => _ResaltableState();
}

class _ResaltableState extends State<Resaltable> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));

  @override
  void initState() {
    super.initState();
    widget.resaltado.addListener(_revisar);
    WidgetsBinding.instance.addPostFrameCallback((_) => _revisar());
  }

  void _revisar() {
    if (!mounted || widget.resaltado.value != widget.id) return;
    Scrollable.ensureVisible(context, duration: const Duration(milliseconds: 400), curve: Curves.easeOutCubic, alignment: 0.3).then((_) {
      if (!mounted) return;
      _c.forward(from: 0).then((_) {
        if (widget.resaltado.value == widget.id) widget.resaltado.value = null;
      });
    });
  }

  @override
  void dispose() {
    widget.resaltado.removeListener(_revisar);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = context.pivot.marca;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, hijo) {
        // Tres pulsos que se apagan.
        final v = _c.isAnimating ? (0.5 - 0.5 * math.cos(_c.value * 6 * math.pi)) * (1 - _c.value * 0.4) : 0.0;
        return DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.22 * v)),
          child: hijo,
        );
      },
      child: widget.child,
    );
  }
}
