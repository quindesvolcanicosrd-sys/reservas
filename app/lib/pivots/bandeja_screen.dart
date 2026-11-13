import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import 'bandeja_repo.dart';

/// Bandeja de Pivots (etapa 3, Victor 2026-11-12): todo lo que espera una
/// decisión, agrupado. Aprobar o rechazar quita la tarjeta con una
/// animación; si falla, vuelve y se avisa. Nada de esto se guarda en el
/// teléfono.
class BandejaPivotsScreen extends StatefulWidget {
  const BandejaPivotsScreen({super.key, required this.repo});
  final BandejaRepo repo;

  @override
  State<BandejaPivotsScreen> createState() => _BandejaPivotsScreenState();
}

class _BandejaPivotsScreenState extends State<BandejaPivotsScreen> {
  BandejaRepo get repo => widget.repo;
  final _saliendo = <String>{};
  static String _clave(Pedido x) => '${x.tipo.name}-${x.id}';

  @override
  void initState() {
    super.initState();
    repo.cargar(forzar: true);
  }

  static const _grupos = [
    (TipoPedido.reserva, 'Pagos y reservas', Icons.receipt_long_rounded),
    (TipoPedido.rectificacion, 'Rectificaciones de asistencia', Icons.fact_check_outlined),
    (TipoPedido.excepcion, 'Excepciones de cuota', Icons.volunteer_activism_outlined),
    (TipoPedido.lesion, 'Lesiones', Icons.healing_outlined),
    (TipoPedido.tarea, 'Tareas por validar', Icons.task_alt_rounded),
  ];

  Future<void> _resolver(Pedido p, bool aprobar) async {
    var nota = '';
    // Al rechazar una tarea o una excepción se puede explicar por qué.
    if (!aprobar && (p.tipo == TipoPedido.tarea || p.tipo == TipoPedido.excepcion)) {
      final n = await _pedirNota(p);
      if (n == null || !mounted) return;
      nota = n;
    }
    // Al aprobar una excepción, el Pivot decide cuánto dura (y, si es por
    // dificultad económica, si paga media cuota o nada).
    var extra = const <String, Object?>{};
    if (aprobar && p.tipo == TipoPedido.excepcion) {
      final r = await elegirDuracionExcepcion(context, p);
      if (r == null || !mounted) return;
      extra = r;
    }
    if (!mounted) return;
    final m = ScaffoldMessenger.of(context);
    // La tarjeta se cierra con una animación antes de salir de la lista.
    setState(() => _saliendo.add(_clave(p)));
    await Future<void>.delayed(const Duration(milliseconds: 260));
    try {
      await repo.resolver(p, aprobar: aprobar, nota: nota, extra: extra);
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(aprobar ? 'Aprobado' : 'Rechazado')));
    } catch (e) {
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    } finally {
      if (mounted) setState(() => _saliendo.remove(_clave(p)));
    }
  }

  Future<String?> _pedirNota(Pedido p) {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('¿Por qué se rechaza?'),
        content: TextField(
          controller: c,
          autofocus: true,
          maxLines: 3,
          minLines: 1,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(hintText: p.tipo == TipoPedido.tarea ? 'Ej. Falta la foto del resultado' : 'Opcional'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text), child: const Text('Rechazar')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bandeja de Pivots', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            tooltip: 'Excepciones vigentes',
            icon: const Icon(Icons.event_repeat_rounded),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ExcepcionesVigentesScreen(repo: repo))),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: repo,
        builder: (context, _) {
          if (!repo.cargado && repo.cargando) return const Center(child: PivotCargando());
          if (!repo.cargado && repo.error != null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(repo.error!, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    OutlinedButton(onPressed: () => repo.cargar(forzar: true), child: const Text('Reintentar')),
                  ],
                ),
              ),
            );
          }
          final hijos = <Widget>[];
          for (final (tipo, titulo, icono) in _grupos) {
            final l = repo.pedidos.where((x) => x.tipo == tipo).toList();
            if (l.isEmpty) continue;
            hijos.add(_Encabezado(titulo: titulo, icono: icono, cantidad: l.length));
            for (final x in l) {
              final c = _clave(x);
              hijos.add(
                AnimatedSize(
                  key: ValueKey(c),
                  duration: const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  child: AnimatedOpacity(
                    opacity: _saliendo.contains(c) ? 0 : 1,
                    duration: const Duration(milliseconds: 200),
                    child: _saliendo.contains(c)
                        ? const SizedBox(width: double.infinity)
                        : _TarjetaPedido(pedido: x, alResolver: _saliendo.isEmpty ? (a) => _resolver(x, a) : null),
                  ),
                ),
              );
            }
          }
          return RefreshIndicator(
            onRefresh: () => repo.cargar(forzar: true),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              child: hijos.isEmpty
                  ? ListView(
                      key: const ValueKey('vacia'),
                      children: [
                        const SizedBox(height: 120),
                        Icon(Icons.inbox_rounded, size: 56, color: p.textoSecundario),
                        const SizedBox(height: 12),
                        Text(
                          'No hay nada pendiente',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.texto),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Aquí llegan pagos, rectificaciones, excepciones, lesiones y tareas por validar.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: p.textoSecundario),
                        ),
                      ],
                    )
                  : ListView(key: const ValueKey('lista'), padding: const EdgeInsets.fromLTRB(16, 4, 16, 40), children: hijos),
            ),
          );
        },
      ),
    );
  }
}

class _Encabezado extends StatelessWidget {
  const _Encabezado({required this.titulo, required this.icono, required this.cantidad});
  final String titulo;
  final IconData icono;
  final int cantidad;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
      child: Row(
        children: [
          Icon(icono, size: 20, color: p.marcaTexto),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              titulo,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.texto),
            ),
          ),
          Text(
            '$cantidad',
            style: TextStyle(fontWeight: FontWeight.w700, color: p.textoSecundario),
          ),
        ],
      ),
    );
  }
}

/// Qué pide cada tarjeta, en una o dos líneas.
(String, String?) describirPedido(Pedido x) {
  final m = x.m;
  final f = x.fechaEvento;
  final cuando = f == null ? '' : Fechas.corta(f);
  String v(String k) => '${m[k] ?? ''}'.trim();
  String plata(Object? v) => '\$${((v as num?) ?? 0).toStringAsFixed(2)}';
  switch (x.tipo) {
    case TipoPedido.reserva:
      final equipo = [
        if (v('talla').isNotEmpty && v('talla') != 'No') 'Patines ${v('talla')}',
        if (v('protecciones').isNotEmpty && v('protecciones') != 'No')
          v('protecciones') == 'Sí' ? 'todas las protecciones' : 'protecciones: ${v('protecciones').toLowerCase()}',
      ].join(' · ');
      final que = m['tipo'] == 'mensual'
          ? 'Mensualidad ${m['mesTexto'] ?? ''}'.trim()
          : 'Clase del $cuando${x.evento?['lugar'] != null && '${x.evento!['lugar']}'.isNotEmpty ? ' · ${x.evento!['lugar']}' : ''}';
      return ('$que · ${m['usoCupon'] == true ? 'con cupón' : plata(m['monto'])}', equipo.isEmpty ? null : 'Equipamiento del equipo: $equipo');
    case TipoPedido.rectificacion:
      return ('Pide corregir su asistencia del $cuando', 'Debería decir: ${m['estadoSolicitado'] ?? ''}');
    case TipoPedido.excepcion:
      final mes = DateTime.tryParse('${m['mesAplicacion'] ?? ''}-01');
      final d = m['datos'];
      final datos = d is Map ? d : const {};
      if (m['tipo'] == 'ausencias') {
        return (
          'Media cuota por ausencias justificadas${mes == null ? '' : ' · ${Fechas.mesNombre(mes)}'}',
          '${datos['motivo'] ?? ''}'.trim().isEmpty ? null : 'Motivo: ${datos['motivo']}',
        );
      }
      final partes = [
        if ('${datos['nivelIngreso'] ?? ''}'.isNotEmpty) 'Ingresos: ${datos['nivelIngreso']}',
        if ('${datos['situacionEconomica'] ?? ''}'.trim().isNotEmpty) '${datos['situacionEconomica']}'.trim(),
        if ('${datos['compromiso'] ?? ''}'.isNotEmpty) 'Compromiso: ${datos['compromiso']}',
      ];
      return ('Subvención por dificultad económica${mes == null ? '' : ' · ${Fechas.mesNombre(mes)}'}', partes.isEmpty ? null : partes.join('\n'));
    case TipoPedido.lesion:
      return ('Pidió pasar a Lesionadx', 'Mientras dure no cuenta para la asistencia ni paga cuota.');
    case TipoPedido.tarea:
      final t = x.tarea;
      return (
        t == null ? 'Envió una tarea para revisión' : '${t['titulo']}',
        t == null ? null : '${t['puntos']} puntos · ${t['area'] ?? ''}'.replaceAll(RegExp(r' · $'), ''),
      );
  }
}

class _TarjetaPedido extends StatelessWidget {
  const _TarjetaPedido({required this.pedido, required this.alResolver});
  final Pedido pedido;
  final void Function(bool aprobar)? alResolver;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final (linea, detalle) = describirPedido(pedido);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _Entrar(
        child: Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AvatarPersona(nombre: pedido.nombreMostrar, foto: pedido.foto, tamano: 40),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            pedido.nombreMostrar,
                            style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                          ),
                          const SizedBox(height: 2),
                          Text(linea, style: TextStyle(fontSize: 14, color: p.texto)),
                          if (detalle != null) ...[const SizedBox(height: 4), Text(detalle, style: TextStyle(fontSize: 13, color: p.textoSecundario))],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(onPressed: alResolver == null ? null : () => alResolver!(false), child: const Text('Rechazar')),
                    const SizedBox(width: 8),
                    FilledButton(onPressed: alResolver == null ? null : () => alResolver!(true), child: const Text('Aprobar')),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Entrada suave de cada tarjeta.
class _Entrar extends StatelessWidget {
  const _Entrar({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: const Duration(milliseconds: 260),
    curve: Curves.easeOutCubic,
    builder: (context, v, hijo) => Opacity(
      opacity: v,
      child: Transform.translate(offset: Offset(0, 8 * (1 - v)), child: hijo),
    ),
    child: child,
  );
}

/// Duración (y efecto) de una excepción al aprobarla.
Future<Map<String, Object?>?> elegirDuracionExcepcion(BuildContext context, Pedido p) {
  final desde = DateTime.tryParse('${p.m['mesAplicacion'] ?? ''}-01') ?? DateTime(Fechas.hoy().year, Fechas.hoy().month);
  final meses = [for (var i = 1; i <= 12; i++) DateTime(desde.year, desde.month + i)];
  var duracion = 'mes';
  var hasta = meses[1];
  var efecto = 'media';
  final economica = p.m['tipo'] != 'ausencias';
  String clave(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';
  return showModalBottomSheet<Map<String, Object?>>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (hoja) => StatefulBuilder(
      builder: (hoja, refrescar) {
        final pal = hoja.pivot;
        Text titulo(String t) => Text(
          t,
          style: TextStyle(fontWeight: FontWeight.w700, color: pal.texto),
        );
        final resumen = duracion == 'mes'
            ? 'Solo ${Fechas.mes(desde)}.'
            : duracion == 'hasta'
            ? 'De ${Fechas.mes(desde)} a ${Fechas.mes(hasta)} de ${hasta.year}.'
            : 'Desde ${Fechas.mes(desde)}, hasta que la canceles.';
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Aprobar excepción de ${p.nombreMostrar}', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                if (economica) ...[
                  titulo('Cuánto paga'),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(value: 'media', label: Text('Media cuota')),
                      ButtonSegment(value: 'exenta', label: Text('No paga')),
                    ],
                    selected: {efecto},
                    onSelectionChanged: (s) => refrescar(() => efecto = s.first),
                  ),
                  const SizedBox(height: 16),
                ],
                titulo('Cuánto dura'),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: 'mes', label: Text('Este mes')),
                    ButtonSegment(value: 'hasta', label: Text('Hasta…')),
                    ButtonSegment(value: 'indefinida', label: Text('Indefinida')),
                  ],
                  selected: {duracion},
                  onSelectionChanged: (s) => refrescar(() => duracion = s.first),
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  child: duracion != 'hasta'
                      ? const SizedBox(width: double.infinity)
                      : Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: SizedBox(
                            height: 40,
                            child: ListView(
                              scrollDirection: Axis.horizontal,
                              children: [
                                for (final m in meses)
                                  Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: ChoiceChip(
                                      showCheckmark: false,
                                      label: Text(m.year == desde.year ? Fechas.mesNombre(m) : Fechas.mesAnio(m)),
                                      selected: m == hasta,
                                      onSelected: (_) => refrescar(() => hasta = m),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                ),
                const SizedBox(height: 12),
                Text(
                  '$resumen Puedes cancelarla cuando quieras desde Excepciones vigentes; si la cancelas, dura hasta el fin del mes en curso.',
                  style: TextStyle(fontSize: 13, color: pal.textoSecundario),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () =>
                      Navigator.of(hoja).pop({'duracion': duracion, if (duracion == 'hasta') 'hasta': clave(hasta), if (economica) 'efecto': efecto}),
                  child: const Text('Aprobar'),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

/// Pivots: excepciones aprobadas que siguen vigentes, para cancelarlas.
class ExcepcionesVigentesScreen extends StatefulWidget {
  const ExcepcionesVigentesScreen({super.key, required this.repo});
  final BandejaRepo repo;

  @override
  State<ExcepcionesVigentesScreen> createState() => _ExcepcionesVigentesScreenState();
}

class _ExcepcionesVigentesScreenState extends State<ExcepcionesVigentesScreen> {
  List<ExcepcionVigente>? _lista;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final l = await widget.repo.excepcionesVigentes();
      if (mounted) {
        setState(() {
          _lista = l;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  static String _mes(String clave) {
    final d = DateTime.tryParse('$clave-01');
    return d == null ? clave : (d.year == Fechas.hoy().year ? Fechas.mes(d) : '${Fechas.mes(d)} de ${d.year}');
  }

  Future<void> _cancelar(ExcepcionVigente e) async {
    final h = Fechas.hoy();
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Cancelar la excepción de ${e.nombreMostrar}?'),
        content: Text('Sigue vigente hasta el fin de ${Fechas.mes(h)}. Desde el mes que viene paga la cuota normal. Se le avisará.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Cancelar excepción')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final m = ScaffoldMessenger.of(context);
    try {
      await widget.repo.cancelarExcepcion(e);
      m.showSnackBar(SnackBar(content: Text('Cancelada. Termina el fin de ${Fechas.mes(h)}.')));
      await _cargar();
    } catch (x) {
      m.showSnackBar(SnackBar(content: Text(x is ApiException ? x.message : 'No se pudo cancelar.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final l = _lista;
    final Widget cuerpo;
    if (l == null) {
      cuerpo = _error != null ? Center(key: const ValueKey('e'), child: Text(_error!)) : const Center(key: ValueKey('c'), child: PivotCargando());
    } else if (l.isEmpty) {
      cuerpo = Center(
        key: const ValueKey('v'),
        child: Text('No hay excepciones vigentes.', style: TextStyle(color: p.textoSecundario)),
      );
    } else {
      cuerpo = RefreshIndicator(
        key: const ValueKey('l'),
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            for (final e in l)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: p.tarjeta,
                  borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                    child: Row(
                      children: [
                        AvatarPersona(nombre: e.nombreMostrar, foto: e.foto, tamano: 40),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                e.nombreMostrar,
                                style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                              ),
                              Text(
                                '${e.exenta ? 'No paga' : 'Media cuota'} · ${e.tipo == 'ausencias' ? 'ausencias' : 'dificultad económica'}',
                                style: TextStyle(fontSize: 13.5, color: p.texto),
                              ),
                              Text(
                                e.hasta == null
                                    ? 'Desde ${_mes(e.desde)}, indefinida'
                                    : 'De ${_mes(e.desde)} a ${_mes(e.hasta!)}${e.cancelada ? ' (cancelada)' : ''}',
                                style: TextStyle(fontSize: 13, color: p.textoSecundario),
                              ),
                            ],
                          ),
                        ),
                        if (!e.cancelada) TextButton(onPressed: () => _cancelar(e), child: const Text('Cancelar')),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Excepciones vigentes', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: cuerpo),
    );
  }
}
