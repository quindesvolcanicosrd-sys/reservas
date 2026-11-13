import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import '../sesion/sesion.dart';
import 'equipo_repo.dart';

/// Inventario del equipamiento que presta la liga (Victor, 2026-11-12):
/// - Todo el equipo ve cuánto hay por talla y cuánto queda libre en la
///   próxima clase, y quién tiene cosas del equipo ("Las tiene X").
/// - Cualquiera puede avisar que se llevó algo (un Pivot lo aprueba).
/// - Pivots editan cantidades, registran préstamos, marcan devoluciones, ven
///   lo reservado para los próximos entrenamientos y, a los 7 días, "¿Aún
///   lo tiene?".
class InventarioScreen extends StatefulWidget {
  const InventarioScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<InventarioScreen> createState() => _InventarioScreenState();
}

class _InventarioScreenState extends State<InventarioScreen> {
  Sesion get s => widget.sesion;
  Api get _api => s.api;
  bool get _pivot => s.esAdmin && s.adminToken != null;
  Map<String, Object?> get _admin => {'adminToken': s.adminToken};

  Map<String, dynamic>? _datos;
  List<Map<String, dynamic>> _reservas = const [];
  String? _error;
  bool _guardando = false;

  List<({String talla, int cantidad, int libres})> get _tallas {
    final l = [
      for (final t in (_datos?['tallas'] as List? ?? const []))
        if (t is Map) (talla: '${t['talla']}', cantidad: (t['cantidad'] as num?)?.toInt() ?? 0, libres: (t['libres'] as num?)?.toInt() ?? 0),
    ];
    l.sort((a, b) => (double.tryParse(a.talla) ?? 0).compareTo(double.tryParse(b.talla) ?? 0));
    return l;
  }

  int get _protecciones => (_datos?['protecciones'] as num?)?.toInt() ?? 0;
  int get _proteccionesLibres => (_datos?['proteccionesLibres'] as num?)?.toInt() ?? 0;
  List<Map<String, dynamic>> get _prestamos => [
    for (final p in (_datos?['prestamos'] as List? ?? const []))
      if (p is Map<String, dynamic>) p,
  ];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await _api.get('getInventario', {if (_pivot) ..._admin});
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
      final res = _pivot ? await _api.getLista('adminGetQueLlevar', _admin).catchError((_) => <dynamic>[]) : const <dynamic>[];
      if (!mounted) return;
      setState(() {
        _datos = r;
        _reservas = res.whereType<Map<String, dynamic>>().toList();
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  Future<void> _hacer(Future<Map<String, dynamic>> Function() f, {String? ok}) async {
    setState(() => _guardando = true);
    final m = ScaffoldMessenger.of(context);
    try {
      final r = await f();
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
      await _cargar();
      if (ok != null) m.showSnackBar(SnackBar(content: Text(ok)));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _guardarStock(List<({String talla, int cantidad})> tallas, int protecciones) => _hacer(
    () => _api.post('adminGuardarEquipamiento', {
      ..._admin,
      'tallasJson': jsonEncode([
        for (final t in tallas) {'talla': t.talla, 'cantidad': t.cantidad},
      ]),
      'protecciones': protecciones,
    }),
  );

  void _cambiarTalla(int i, int delta) {
    final l = [for (final t in _tallas) (talla: t.talla, cantidad: t.cantidad)];
    l[i] = (talla: l[i].talla, cantidad: (l[i].cantidad + delta).clamp(0, 99));
    _guardarStock(l, _protecciones);
  }

  Future<void> _nuevaTalla() async {
    final c = TextEditingController();
    final t = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Nueva talla de patines'),
        content: TextField(
          controller: c,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(hintText: 'Ej. 38'),
          onSubmitted: (v) => Navigator.of(d).pop(v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text.trim()), child: const Text('Agregar')),
        ],
      ),
    );
    if (t == null || t.isEmpty || !mounted) return;
    if (_tallas.any((x) => x.talla == t)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Esa talla ya está. Usa + para sumar pares.')));
      return;
    }
    await _guardarStock([for (final x in _tallas) (talla: x.talla, cantidad: x.cantidad), (talla: t, cantidad: 1)], _protecciones);
  }

  /// "Me llevé algo" (persona) o "Registrar préstamo" (Pivot, eligiendo a quién).
  Future<void> _prestamo({required bool comoPivot}) async {
    var articulo = 'patines';
    String? persona;
    String talla = _tallas.isEmpty ? '' : _tallas.first.talla;
    final detalle = TextEditingController();
    final equipo = EquipoRepo.de(s);
    if (comoPivot) await equipo.cargar();
    if (!mounted) return;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (hoja) => StatefulBuilder(
        builder: (hoja, refrescar) {
          final p = hoja.pivot;
          final personas = [...?equipo.personas]..sort((a, b) => a.nombreMostrar.toLowerCase().compareTo(b.nombreMostrar.toLowerCase()));
          final listo = (!comoPivot || persona != null) && (articulo != 'otro' || detalle.text.trim().isNotEmpty);
          return Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(hoja).bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(comoPivot ? 'Registrar préstamo' : '¿Qué te llevaste?', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  comoPivot
                      ? 'Quedará visible para el equipo hasta que lo marques como devuelto.'
                      : 'Un Pivot lo aprueba para evitar errores. Después se ve en Inventario.',
                  style: TextStyle(color: p.textoSecundario),
                ),
                const SizedBox(height: 14),
                if (comoPivot) ...[
                  DropdownButtonFormField<String>(
                    initialValue: persona,
                    decoration: const InputDecoration(labelText: 'Quién lo tiene'),
                    items: [for (final x in personas) DropdownMenuItem(value: x.username, child: Text(x.nombreMostrar))],
                    onChanged: (v) => refrescar(() => persona = v),
                  ),
                  const SizedBox(height: 12),
                ],
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: 'patines', label: Text('Patines')),
                    ButtonSegment(value: 'protecciones', label: Text('Protecciones')),
                    ButtonSegment(value: 'otro', label: Text('Otro')),
                  ],
                  selected: {articulo},
                  onSelectionChanged: (x) => refrescar(() => articulo = x.first),
                ),
                const SizedBox(height: 12),
                if (articulo == 'patines' && _tallas.isNotEmpty)
                  SizedBox(
                    height: 40,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        for (final t in _tallas)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              showCheckmark: false,
                              label: Text('Talla ${t.talla}'),
                              selected: talla == t.talla,
                              onSelected: (_) => refrescar(() => talla = t.talla),
                            ),
                          ),
                      ],
                    ),
                  )
                else
                  TextField(
                    controller: detalle,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => refrescar(() {}),
                    decoration: InputDecoration(
                      labelText: articulo == 'protecciones' ? 'Cuáles (opcional)' : 'Qué es',
                      hintText: articulo == 'protecciones' ? 'Ej. rodilleras y casco' : 'Ej. silbato, conos',
                    ),
                  ),
                const SizedBox(height: 18),
                FilledButton(onPressed: listo ? () => Navigator.of(hoja).pop(true) : null, child: Text(comoPivot ? 'Registrar' : 'Avisar')),
              ],
            ),
          );
        },
      ),
    );
    if (ok != true || !mounted) return;
    final d = articulo == 'patines' ? talla : detalle.text.trim();
    await _hacer(
      () => comoPivot
          ? _api.post('adminPrestamo', {..._admin, 'accion': 'registrar', 'nombre': persona, 'articulo': articulo, 'detalle': d})
          : _api.post('pedirPrestamo', {'articulo': articulo, 'detalle': d}),
      ok: comoPivot ? 'Préstamo registrado' : 'Aviso enviado. Un Pivot lo aprobará.',
    );
  }

  Future<void> _accionPrestamo(Map<String, dynamic> pr, String accion, String ok) =>
      _hacer(() => _api.post('adminPrestamo', {..._admin, 'accion': accion, 'id': pr['id']}), ok: ok);

  static String _texto(Map<String, dynamic> pr) {
    final d = '${pr['detalle'] ?? ''}'.trim();
    return switch (pr['articulo']) {
      'patines' => d.isEmpty ? 'Patines' : 'Patines talla $d',
      'protecciones' => d.isEmpty ? 'Protecciones' : 'Protecciones: $d',
      _ => d.isEmpty ? 'Equipamiento' : d,
    };
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    Widget cuerpo;
    if (_datos == null) {
      cuerpo = _error != null ? Center(key: const ValueKey('e'), child: Text(_error!)) : const Center(key: ValueKey('c'), child: PivotCargando());
    } else {
      final tallas = _tallas;
      final prox = _datos!['proxima'] as Map?;
      final proxTxt = prox == null ? null : 'Libres para el ${Fechas.corta(DateTime.tryParse('${prox['fecha']}') ?? Fechas.hoy())}';
      Widget tarjeta(List<Widget> hijos) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          clipBehavior: Clip.antiAlias,
          child: Column(children: hijos),
        ),
      );
      Text seccion(String t) => Text(
        t,
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
      );
      Widget fila(String titulo, int n, int libres, void Function(int)? cambiar) => ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14),
        title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text([n == 1 ? '1 en total' : '$n en total', if (proxTxt != null) '$libres ${libres == 1 ? 'libre' : 'libres'}'].join(' · ')),
        trailing: cambiar == null
            ? null
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Quitar uno',
                    onPressed: _guardando || n == 0 ? null : () => cambiar(-1),
                    icon: const Icon(Icons.remove_circle_outline_rounded),
                  ),
                  SizedBox(
                    width: 28,
                    child: Text(
                      '$n',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.texto),
                    ),
                  ),
                  IconButton(tooltip: 'Sumar uno', onPressed: _guardando ? null : () => cambiar(1), icon: const Icon(Icons.add_circle_outline_rounded)),
                ],
              ),
      );
      final activos = _prestamos.where((x) => x['estado'] == 'activo').toList();
      final misPendientes = _prestamos.where((x) => x['estado'] == 'pendiente' && x['mio'] == true).toList();
      cuerpo = RefreshIndicator(
        key: const ValueKey('lista'),
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            if (proxTxt != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                child: Text(
                  '$proxTxt${prox?['lugar'] == null ? '' : ' en ${prox!['lugar']}'}: lo que queda sin reservar ni prestar.',
                  style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
                ),
              ),
            seccion('PATINES'),
            const SizedBox(height: 8),
            tarjeta([
              for (var i = 0; i < tallas.length; i++)
                fila('Talla ${tallas[i].talla}', tallas[i].cantidad, tallas[i].libres, _pivot ? (d) => _cambiarTalla(i, d) : null),
              if (tallas.isEmpty) const ListTile(title: Text('Sin patines cargados')),
              if (_pivot)
                ListTile(
                  leading: Icon(Icons.add_rounded, color: p.marcaTexto),
                  title: Text(
                    'Agregar talla',
                    style: TextStyle(color: p.marcaTexto, fontWeight: FontWeight.w600),
                  ),
                  onTap: _guardando ? null : _nuevaTalla,
                ),
            ]),
            seccion('PROTECCIONES'),
            const SizedBox(height: 8),
            tarjeta([
              fila(
                'Juegos completos',
                _protecciones,
                _proteccionesLibres,
                _pivot ? (d) => _guardarStock([for (final x in tallas) (talla: x.talla, cantidad: x.cantidad)], (_protecciones + d).clamp(0, 99)) : null,
              ),
            ]),
            seccion('QUIÉN TIENE COSAS DEL EQUIPO'),
            const SizedBox(height: 8),
            if (activos.isEmpty && misPendientes.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 16),
                child: Text('Todo está en su lugar.', style: TextStyle(color: p.textoSecundario)),
              )
            else
              tarjeta([
                for (final pr in [...misPendientes, ...activos])
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                    child: Row(
                      children: [
                        AvatarPersona(nombre: '${pr['nombreMostrar']}', foto: '${pr['foto'] ?? ''}', tamano: 40),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _texto(pr),
                                style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                              ),
                              const SizedBox(height: 4),
                              Etiqueta(
                                texto: pr['estado'] == 'pendiente'
                                    ? 'Esperando aprobación'
                                    : 'Las tiene ${pr['nombreMostrar']} · ${(pr['dias'] as num? ?? 0) == 0 ? 'desde hoy' : 'hace ${pr['dias']} ${(pr['dias'] as num) == 1 ? 'día' : 'días'}'}',
                                icono: pr['estado'] == 'pendiente' ? Icons.hourglass_top_rounded : Icons.inventory_2_outlined,
                              ),
                            ],
                          ),
                        ),
                        if (_pivot && pr['estado'] == 'activo')
                          PopupMenuButton<String>(
                            tooltip: 'Opciones',
                            onSelected: (a) =>
                                a == 'sigue' ? _accionPrestamo(pr, 'sigue', 'Anotado: aún lo tiene') : _accionPrestamo(pr, 'devolver', 'Marcado como devuelto'),
                            itemBuilder: (_) => [
                              const PopupMenuItem(value: 'devolver', child: Text('Ya lo devolvió')),
                              if (pr['preguntar'] == true) const PopupMenuItem(value: 'sigue', child: Text('Aún lo tiene')),
                            ],
                          ),
                      ],
                    ),
                  ),
              ]),
            // A los 7 días, el Pivot confirma si aún lo tiene.
            for (final pr in activos.where((x) => x['preguntar'] == true && _pivot))
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: p.suave,
                  borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                    child: Row(
                      children: [
                        Icon(Icons.help_outline_rounded, color: p.sobreSuave),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '¿${pr['nombreMostrar']} aún tiene ${_texto(pr).toLowerCase()}?',
                            style: TextStyle(fontWeight: FontWeight.w600, color: p.sobreSuave),
                          ),
                        ),
                        TextButton(onPressed: _guardando ? null : () => _accionPrestamo(pr, 'devolver', 'Marcado como devuelto'), child: const Text('No')),
                        FilledButton.tonal(
                          onPressed: _guardando ? null : () => _accionPrestamo(pr, 'sigue', 'Anotado: aún lo tiene'),
                          child: const Text('Aún lo tiene'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (_pivot) ...[
              seccion('RESERVADO PARA LOS PRÓXIMOS ENTRENAMIENTOS'),
              const SizedBox(height: 8),
              if (_reservas.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                  child: Text('Nadie reservó equipamiento todavía.', style: TextStyle(color: p.textoSecundario)),
                )
              else
                tarjeta([
                  for (final r in _reservas)
                    ListTile(
                      title: Text('${r['nombre']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        [
                          '${r['fecha']}',
                          if ('${r['patines']}'.isNotEmpty && r['patines'] != 'No') 'Patines ${r['patines']}',
                          if ('${r['protecciones']}'.isNotEmpty && r['protecciones'] != 'No')
                            r['protecciones'] == 'Sí' ? 'Protecciones' : '${r['protecciones']}',
                        ].join(' · '),
                      ),
                      trailing: '${r['waLink'] ?? ''}'.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Escribir por WhatsApp',
                              icon: const Icon(Icons.chat_rounded),
                              onPressed: () => launchUrl(Uri.parse('${r['waLink']}'), mode: LaunchMode.externalApplication),
                            ),
                    ),
                ]),
            ],
          ],
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventario', style: TextStyle(fontWeight: FontWeight.w700)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: AnimatedOpacity(opacity: _guardando ? 1 : 0, duration: const Duration(milliseconds: 200), child: const LinearProgressIndicator(minHeight: 3)),
        ),
      ),
      floatingActionButton: _datos == null
          ? null
          : FloatingActionButton.extended(
              onPressed: _guardando ? null : () => _prestamo(comoPivot: _pivot),
              icon: Icon(_pivot ? Icons.assignment_ind_outlined : Icons.back_hand_outlined),
              label: Text(_pivot ? 'Registrar préstamo' : 'Me llevé algo'),
            ),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: cuerpo),
    );
  }
}
