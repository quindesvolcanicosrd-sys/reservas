import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/cargando.dart';
import '../core/config_liga.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import '../sesion/sesion.dart';
import 'equipo_repo.dart';
import 'inventario_asistentes.dart';
import 'inventario_modelos.dart';

/// Inventario del equipo (Victor, 2026-11-13): listas personalizables
/// (con tallas, sets de piezas, unidades o insumos), quién tiene qué
/// (temporal con recordatorio cada 7 días o permanente) y pedidos para usar
/// equipamiento. Pivots crean listas y registran; todos ven y avisan.
class InventarioScreen extends StatefulWidget {
  const InventarioScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<InventarioScreen> createState() => _InventarioScreenState();
}

class _InventarioScreenState extends State<InventarioScreen> {
  late final InventarioRepo repo = InventarioRepo(widget.sesion);
  bool _cargado = false;
  String? _error;
  bool _guardando = false;
  List<Map<String, dynamic>> _reservas = const [];

  bool get _pivot => repo.esPivot;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      await repo.cargar();
      final res = _pivot
          ? await widget.sesion.api.getLista('adminGetQueLlevar', {'adminToken': widget.sesion.adminToken}).catchError((_) => <dynamic>[])
          : const <dynamic>[];
      if (!mounted) return;
      setState(() {
        _cargado = true;
        _error = null;
        _reservas = res.whereType<Map<String, dynamic>>().toList();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  Future<void> _hacer(Future<void> Function() f, {String? ok}) async {
    setState(() => _guardando = true);
    final m = ScaffoldMessenger.of(context);
    try {
      await f();
      await _cargar();
      if (ok != null) m.showSnackBar(SnackBar(content: Text(ok)));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _abrir(Widget pantalla, String ok) async {
    final r = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => pantalla));
    if (r == true && mounted) {
      await _cargar();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok)));
    }
  }

  void _prestamo(ModoPrestamo modo) => _abrir(PrestamoAsistente(repo: repo, equipo: EquipoRepo.de(widget.sesion), modo: modo), switch (modo) {
    ModoPrestamo.registrar => 'Registrado',
    ModoPrestamo.salida => 'Aviso enviado. Un Pivot lo aprobará.',
    ModoPrestamo.uso => 'Pedido enviado. Un Pivot decidirá por cuánto tiempo.',
  });

  /// El "+": Pivots crean listas o registran; el resto avisa o pide.
  Future<void> _mas() async {
    final opciones = <(String, String, IconData, VoidCallback)>[
      if (_pivot) ...[
        (
          'Nueva lista de equipamiento',
          'Con tallas, sets, unidades o insumos',
          Icons.playlist_add_rounded,
          () => _abrir(NuevaListaAsistente(repo: repo), 'Lista creada'),
        ),
        ('Alguien tiene equipamiento', 'Temporal o permanente', Icons.assignment_ind_outlined, () => _prestamo(ModoPrestamo.registrar)),
      ] else ...[
        ('Me llevé equipamiento', 'Para limpiarlo, repararlo o traerlo', Icons.back_hand_outlined, () => _prestamo(ModoPrestamo.salida)),
        ('Necesito equipamiento del equipo', 'Si el tuyo se rompió o lo estás lavando', Icons.volunteer_activism_outlined, () => _prestamo(ModoPrestamo.uso)),
      ],
    ];
    final elegido = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (h) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (i, o) in opciones.indexed)
              ListTile(
                leading: Icon(o.$3, color: h.pivot.marcaTexto),
                title: Text(o.$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(o.$2),
                onTap: () => Navigator.of(h).pop(i),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (elegido != null && mounted) opciones[elegido].$4();
  }

  Future<void> _opcionesPrestamo(Prestamo pr) async {
    final a = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (h) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('${pr.nombreMostrar} · ${pr.texto}', style: Theme.of(h).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            ),
            ListTile(leading: const Icon(Icons.assignment_return_outlined), title: const Text('Ya lo devolvió'), onTap: () => Navigator.of(h).pop('devolver')),
            if (!pr.esUso)
              ListTile(
                leading: Icon(pr.permanente ? Icons.timelapse_rounded : Icons.all_inclusive_rounded),
                title: Text(pr.permanente ? 'Cambiar a temporal' : 'Cambiar a permanente'),
                onTap: () => Navigator.of(h).pop('permanente'),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (a == 'devolver') await _hacer(() => repo.accion(pr, 'devolver'), ok: 'Marcado como devuelto');
    if (a == 'permanente') {
      await _hacer(() => repo.accion(pr, 'permanente', extra: {'valor': !pr.permanente}), ok: pr.permanente ? 'Ahora es temporal' : 'Ahora es permanente');
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    Widget cuerpo;
    if (!_cargado) {
      cuerpo = _error != null ? Center(key: const ValueKey('e'), child: Text(_error!)) : const Center(key: ValueKey('c'), child: PivotCargando());
    } else {
      final prox = repo.proxima;
      final activos = repo.prestamos.where((x) => x.activo).toList();
      final misPendientes = repo.prestamos.where((x) => x.pendiente && x.mio).toList();
      final preguntarme = activos.where((x) => x.preguntarme).toList();
      final preguntar = _pivot ? activos.where((x) => x.preguntar).toList() : const <Prestamo>[];
      Text seccion(String t) => Text(
        t,
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
      );
      cuerpo = RefreshIndicator(
        key: const ValueKey('lista'),
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            // Recordatorio a la persona: "¿Ya lo devolviste?" (se renueva cada 7 días).
            for (final pr in preguntarme)
              _Aviso(
                icono: Icons.help_outline_rounded,
                texto: '¿Ya devolviste ${pr.texto}?',
                no: ('Aún no', () => _hacer(() => repo.responder(pr, devuelto: false), ok: 'Te lo recordamos en 7 días')),
                si: ('Ya lo devolví', () => _hacer(() => repo.responder(pr, devuelto: true), ok: 'Gracias, se avisó a los Pivots')),
                ocupado: _guardando,
              ),
            for (final pr in preguntar)
              _Aviso(
                icono: Icons.help_outline_rounded,
                texto: '¿${pr.nombreMostrar} aún tiene ${pr.texto}?',
                no: ('No', () => _hacer(() => repo.accion(pr, 'devolver'), ok: 'Marcado como devuelto')),
                si: ('Aún lo tiene', () => _hacer(() => repo.accion(pr, 'sigue'), ok: 'Anotado: aún lo tiene')),
                ocupado: _guardando,
              ),
            if (prox != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                child: Text(
                  'Lo libre es para el entrenamiento del ${Fechas.corta(DateTime.tryParse('${prox['fecha']}') ?? Fechas.hoy())}, descontando reservas y lo que tienen personas.',
                  style: TextStyle(fontSize: 13, color: p.textoSecundario),
                ),
              ),
            for (final l in repo.listas)
              _TarjetaLista(
                lista: l,
                conPrestamos: activos.where((x) => x.lista == l.nombre).length,
                alTocar: () => _abrir(ListaInventarioScreen(repo: repo, lista: l), 'Guardado'),
              ),
            if (repo.listas.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _pivot ? 'Todavía no hay listas. Crea la primera con el botón +.' : 'Todavía no hay equipamiento registrado.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.textoSecundario),
                ),
              ),
            if (activos.isNotEmpty || misPendientes.isNotEmpty) ...[
              const SizedBox(height: 8),
              seccion('QUIÉN TIENE COSAS DEL EQUIPO'),
              const SizedBox(height: 8),
              Material(
                color: p.tarjeta,
                borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    for (final pr in [...misPendientes, ...activos])
                      ListTile(
                        leading: AvatarPersona(nombre: pr.nombreMostrar, foto: pr.foto, tamano: 40),
                        title: Text(
                          '${pr.texto[0].toUpperCase()}${pr.texto.substring(1)}',
                          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                        ),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Align(alignment: Alignment.centerLeft, child: _etiqueta(pr)),
                        ),
                        trailing: _pivot && pr.activo ? const Icon(Icons.more_vert_rounded) : null,
                        onTap: _pivot && pr.activo ? () => _opcionesPrestamo(pr) : null,
                      ),
                  ],
                ),
              ),
            ],
            if (_pivot && _reservas.isNotEmpty) ...[
              const SizedBox(height: 16),
              seccion('RESERVADO PARA LOS PRÓXIMOS ENTRENAMIENTOS'),
              const SizedBox(height: 8),
              Material(
                color: p.tarjeta,
                borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                child: Column(
                  children: [
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
                                tooltip: 'Escribir',
                                icon: Icon(ConfigLiga.de(widget.sesion).icono),
                                onPressed: () => launchUrl(Uri.parse('${r['waLink']}'), mode: LaunchMode.externalApplication),
                              ),
                      ),
                  ],
                ),
              ),
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
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: _guardando ? const LinearProgressIndicator(minHeight: 3) : const SizedBox(height: 3),
          ),
        ),
      ),
      // Solo el ícono (Victor, 2026-11-13); las opciones se eligen al tocarlo.
      floatingActionButton: !_cargado
          ? null
          : FloatingActionButton(tooltip: _pivot ? 'Agregar' : 'Avisar o pedir', onPressed: _guardando ? null : _mas, child: const Icon(Icons.add_rounded)),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: cuerpo),
    );
  }

  Widget _etiqueta(Prestamo pr) {
    if (pr.pendiente) return const Etiqueta(texto: 'Esperando aprobación', icono: Icons.hourglass_top_rounded);
    if (pr.esUso && pr.hasta != null) {
      return Etiqueta(
        texto: '${pr.nombreMostrar} · hasta el ${Fechas.corta(pr.hasta!)}${pr.entrega == 'pivot' ? ' · lo trae un Pivot' : ''}',
        icono: Icons.event_available_rounded,
      );
    }
    if (pr.permanente) return Etiqueta(texto: '${pr.nombreMostrar} · permanente', icono: Icons.all_inclusive_rounded);
    return Etiqueta(
      texto: '${pr.nombreMostrar} · ${pr.dias == 0 ? 'desde hoy' : 'hace ${pr.dias} ${pr.dias == 1 ? 'día' : 'días'}'}',
      icono: Icons.inventory_2_outlined,
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.icono, required this.texto, required this.no, required this.si, required this.ocupado});
  final IconData icono;
  final String texto;
  final (String, VoidCallback) no, si;
  final bool ocupado;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: p.suave,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icono, color: p.sobreSuave),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      texto,
                      style: TextStyle(fontWeight: FontWeight.w600, color: p.sobreSuave),
                    ),
                  ),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(onPressed: ocupado ? null : no.$2, child: Text(no.$1)),
                  const SizedBox(width: 6),
                  FilledButton.tonal(onPressed: ocupado ? null : si.$2, child: Text(si.$1)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TarjetaLista extends StatelessWidget {
  const _TarjetaLista({required this.lista, required this.conPrestamos, required this.alTocar});
  final ListaInventario lista;
  final int conPrestamos;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final l = lista;
    // Lo libre de un vistazo: tallas y piezas como pills.
    final pills = <String>[
      if (l.esTallas)
        for (final f in l.stock)
          if (f.cantidad > 0) '${f.variante}: ${f.libres}/${f.cantidad}',
      if (l.esSet)
        for (final pz in l.piezas) '${pz.nombre}: ${l.fila(pz.nombre)?.libres ?? 0}',
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: alTocar,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(l.iconoData, color: p.marcaTexto),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l.nombre,
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: p.texto),
                          ),
                          Text(
                            [
                              l.resumen,
                              if (l.esSet) '${l.setsLibres} libres' else if (!l.esTallas) '${l.libresTotal} libres',
                              if (conPrestamos > 0) '$conPrestamos con personas',
                            ].join(' · '),
                            style: TextStyle(fontSize: 13, color: p.textoSecundario),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                  ],
                ),
                if (pills.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(spacing: 6, runSpacing: 6, children: [for (final t in pills) Etiqueta(texto: t)]),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Una lista: su stock (Pivots lo cambian con − y +), nombre, ícono,
/// piezas de cada set y quién tiene cosas de ella.
class ListaInventarioScreen extends StatefulWidget {
  const ListaInventarioScreen({super.key, required this.repo, required this.lista});
  final InventarioRepo repo;
  final ListaInventario lista;

  @override
  State<ListaInventarioScreen> createState() => _ListaInventarioScreenState();
}

class _ListaInventarioScreenState extends State<ListaInventarioScreen> {
  late ListaInventario l = widget.lista;
  // Cantidades editadas (variante → cantidad); se guardan con "Guardar".
  late final Map<String, int> _stock = {for (final f in l.stock) f.variante: f.cantidad};
  late int _sets = l.setsCompletos;
  bool _cambio = false, _ocupado = false;

  InventarioRepo get repo => widget.repo;

  Future<void> _guardar() async {
    setState(() => _ocupado = true);
    try {
      final stock = l.esSet ? [for (final pz in l.piezas) (pz.nombre, _stock[pz.nombre] ?? 0)] : [for (final e in _stock.entries) (e.key, e.value)];
      await repo.editarLista(l, stock: stock);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar.')));
    }
  }

  Future<void> _renombrar() async {
    final c = TextEditingController(text: l.nombre);
    final n = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Nombre de la lista'),
        content: TextField(controller: c, autofocus: true, textCapitalization: TextCapitalization.sentences),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text.trim()), child: const Text('Guardar')),
        ],
      ),
    );
    if (n == null || n.isEmpty || n == l.nombre || !mounted) return;
    try {
      await repo.editarLista(l, nombre: n);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar.')));
    }
  }

  Future<void> _borrar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Borrar "${l.nombre}"?'),
        content: const Text('Se borra la lista y sus cantidades. No se puede deshacer.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Borrar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await repo.borrarLista(l);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo borrar.')));
    }
  }

  Future<void> _nuevaTalla() async {
    final c = TextEditingController();
    final t = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Nueva talla'),
        content: TextField(
          controller: c,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Ej. 38 o M'),
          onSubmitted: (v) => Navigator.of(d).pop(v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text.trim()), child: const Text('Agregar')),
        ],
      ),
    );
    if (t == null || t.isEmpty || _stock.containsKey(t)) return;
    setState(() {
      _stock[t] = 1;
      _cambio = true;
    });
  }

  void _cambiarSets(int v) => setState(() {
    _sets = v;
    for (final pz in l.piezas) {
      _stock[pz.nombre] = v * pz.cantidad;
    }
    _cambio = true;
  });

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final pivot = repo.esPivot;
    final tienen = repo.prestamos.where((x) => x.activo && x.lista == l.nombre).toList();
    Widget fila(String titulo, String? sub, String clave) {
      final f = l.fila(clave);
      final n = _stock[clave] ?? 0;
      return ListTile(
        title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(sub ?? '${f?.libres ?? n} libres${(f?.enUso ?? 0) > 0 ? ' · ${f!.enUso} en uso' : ''}'),
        trailing: pivot
            ? Contador(
                valor: n,
                max: 100000,
                alCambiar: (v) => setState(() {
                  _stock[clave] = v;
                  _cambio = true;
                }),
              )
            : Text(
                '$n',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.texto),
              ),
      );
    }

    final variantes = l.esTallas ? (_stock.keys.toList()..sort((a, b) => (double.tryParse(a) ?? 0).compareTo(double.tryParse(b) ?? 0))) : <String>[];
    return Scaffold(
      appBar: AppBar(
        title: Text(l.nombre, style: const TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          if (pivot)
            PopupMenuButton<String>(
              tooltip: 'Opciones',
              onSelected: (a) => a == 'nombre' ? _renombrar() : _borrar(),
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'nombre', child: Text('Cambiar nombre')),
                if (l.sistema == null) const PopupMenuItem(value: 'borrar', child: Text('Borrar lista')),
              ],
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        children: [
          if (l.sistema != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: Text('Se puede reservar al confirmar asistencia a una clase.', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
            ),
          Material(
            color: p.tarjeta,
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                if (l.esTallas) ...[
                  for (final v in variantes) fila('Talla $v', null, v),
                  if (pivot)
                    ListTile(
                      leading: Icon(Icons.add_rounded, color: p.marcaTexto),
                      title: Text(
                        'Agregar talla',
                        style: TextStyle(color: p.marcaTexto, fontWeight: FontWeight.w600),
                      ),
                      onTap: _nuevaTalla,
                    ),
                ] else if (l.esSet) ...[
                  if (pivot)
                    ListTile(
                      title: const Text('Sets completos', style: TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: const Text('Cambia todas las piezas a la vez'),
                      trailing: Contador(valor: _sets, max: 999, alCambiar: _cambiarSets),
                    ),
                  for (final pz in l.piezas) fila(pz.nombre, '${pz.cantidad} por set · ${l.fila(pz.nombre)?.libres ?? 0} libres', pz.nombre),
                ] else
                  fila(l.esInsumo && (l.unidad ?? '').isNotEmpty ? l.unidad![0].toUpperCase() + l.unidad!.substring(1) : 'En total', null, ''),
              ],
            ),
          ),
          if (tienen.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              'LO TIENEN',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
            ),
            const SizedBox(height: 8),
            for (final pr in tienen)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: AvatarPersona(nombre: pr.nombreMostrar, foto: pr.foto, tamano: 36),
                title: Text(pr.nombreMostrar),
                subtitle: Text('${pr.texto}${pr.permanente ? ' · permanente' : ''}'),
              ),
          ],
        ],
      ),
      floatingActionButton: AnimatedScale(
        scale: _cambio ? 1 : 0,
        duration: const Duration(milliseconds: 200),
        child: FloatingActionButton.extended(
          onPressed: _ocupado ? null : _guardar,
          icon: _ocupado ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check_rounded),
          label: const Text('Guardar'),
        ),
      ),
    );
  }
}
