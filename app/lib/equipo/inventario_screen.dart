import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/cargando.dart';
import '../core/config_liga.dart';
import '../core/fechas.dart';
import '../core/menu_acciones.dart';
import '../core/tema.dart';
import '../ajustes/ajustes_screen.dart' show textoEquipamiento;
import '../ajustes/componentes.dart' show SubAjustes;
import '../ajustes/datos_screens.dart' show EquipamientoScreen;
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

  /// El "+" (como en Calendario): opciones que suben desde el botón.
  Future<void> _mas() => MenuAcciones.abrir(context, [
    if (_pivot) ...[
      AccionMenu(Icons.rule_rounded, 'Reglas de préstamo', () => _abrir(ReglasPrestamoScreen(repo: repo), 'Guardado')),
      AccionMenu(Icons.assignment_ind_outlined, 'Alguien tiene algo del equipo', () => _prestamo(ModoPrestamo.registrar)),
      AccionMenu(Icons.playlist_add_rounded, 'Nueva lista', () => _abrir(NuevaListaAsistente(repo: repo), 'Lista creada')),
    ] else ...[
      if (repo.reglaPrestamo != 'no' && tieneEquipoPropio(widget.sesion.datos))
        AccionMenu(Icons.emergency_outlined, 'Equipamiento de emergencia', () => _prestamo(ModoPrestamo.uso)),
      AccionMenu(Icons.back_hand_outlined, 'Me llevé algo del equipo', () => _prestamo(ModoPrestamo.salida)),
    ],
  ]);

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
            ListTile(
              leading: const Icon(Icons.edit_calendar_outlined),
              title: const Text('Cambiar plazo o entrega'),
              subtitle: const Text('Se le avisa a la persona.'),
              onTap: () => Navigator.of(h).pop('plazo'),
            ),
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
    if (!mounted) return;
    if (a == 'devolver') {
      await _hacer(() => repo.accion(pr, 'devolver'), ok: 'Marcado como devuelto');
    } else if (a == 'permanente') {
      await _hacer(() => repo.accion(pr, 'permanente', extra: {'valor': !pr.permanente}), ok: pr.permanente ? 'Ahora es temporal' : 'Ahora es permanente');
    } else if (a == 'plazo') {
      final c = await elegirPlazoPrestamo(
        context,
        titulo: 'Plazo de ${pr.nombreMostrar}',
        textoBoton: 'Guardar y avisar',
        plazo: pr.plazo,
        hasta: pr.hasta,
        recordarCada: pr.recordarCada,
        entrega: pr.entrega.isEmpty ? 'casa' : pr.entrega,
      );
      if (c != null && mounted) await _hacer(() => repo.accion(pr, 'editar', extra: c), ok: 'Guardado. Se le avisó a ${pr.nombreMostrar}.');
    }
  }

  /// Interruptor de la tarjeta: apagar pide confirmación; no se borra nada.
  Future<void> _activar(ListaInventario l, bool activa) async {
    if (!activa) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text('¿Ocultar ${l.nombre}?'),
          content: Text(
            l.sistema != null
                ? 'Deja de aparecer en el Inventario y no se podrá reservar ni pedir. Nada se borra: puedes volver a encenderla cuando quieras.'
                : 'Deja de aparecer en el Inventario para el equipo. Nada se borra: puedes volver a encenderla cuando quieras.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
            FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Ocultar')),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    await _hacer(() => repo.activarLista(l, activa), ok: activa ? '${l.nombre} visible' : '${l.nombre} oculta');
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    Widget cuerpo;
    if (!_cargado) {
      cuerpo = _error != null ? Center(key: const ValueKey('e'), child: Text(_error!)) : const Center(key: ValueKey('c'), child: PivotCargando());
    } else {
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
            // Tu equipamiento (antes en Mi perfil, Victor 2026-11-13).
            if (widget.sesion.datos.isNotEmpty) _TuEquipamiento(sesion: widget.sesion, regla: repo.reglaPrestamo, alPedir: () => _prestamo(ModoPrestamo.uso)),
            for (final e in seccionesInventario.entries)
              if (repo.listas.any((l) => l.seccion == e.key)) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
                  child: Row(
                    children: [
                      Icon(e.value.$3, size: 18, color: p.marcaTexto),
                      const SizedBox(width: 8),
                      seccion(e.value.$1.toUpperCase()),
                    ],
                  ),
                ),
                for (final l in repo.listas.where((l) => l.seccion == e.key))
                  _TarjetaLista(
                    lista: l,
                    conPrestamos: activos.where((x) => x.lista == l.nombre).length,
                    alTocar: () => _abrir(ListaInventarioScreen(repo: repo, lista: l), 'Guardado'),
                    alActivar: _pivot ? (v) => _activar(l, v) : null,
                  ),
              ],
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
    if (pr.plazo == 'dia') return Etiqueta(texto: '${pr.nombreMostrar} · solo hoy', icono: Icons.today_rounded);
    if (pr.plazo == 'fecha' && pr.hasta != null) {
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
  const _TarjetaLista({required this.lista, required this.conPrestamos, required this.alTocar, this.alActivar});
  final ListaInventario lista;
  final int conPrestamos;
  final VoidCallback alTocar;

  /// Pivots: interruptor para ocultar o mostrar la lista.
  final void Function(bool)? alActivar;

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
                              if (l.esSet) '${l.setsLibres} libres' else if (!l.esTallas && !l.porRenglones) '${l.libresTotal} libres',
                              if (conPrestamos > 0) '$conPrestamos con personas',
                            ].join(' · '),
                            style: TextStyle(fontSize: 13, color: p.textoSecundario),
                          ),
                        ],
                      ),
                    ),
                    if (alActivar != null) Switch(value: l.activa, onChanged: alActivar) else Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                  ],
                ),
                if (pills.isNotEmpty && l.activa) ...[
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
  // Botiquín e insumos: un renglón por cosa (Victor, 2026-11-13).
  late final List<RenglonInventario> _renglones = [
    for (final f in l.stock) RenglonInventario(nombre: f.variante, cantidad: f.cantidad, vence: f.vence, minimo: f.minimo),
  ];
  bool _cambio = false, _ocupado = false;

  InventarioRepo get repo => widget.repo;

  Future<void> _guardar() async {
    setState(() => _ocupado = true);
    try {
      if (l.porRenglones) {
        await repo.guardarRenglones(l, [for (final r in _renglones.where((r) => r.nombre.trim().isNotEmpty)) r.json]);
      } else {
        final stock = l.esSet ? [for (final pz in l.piezas) (pz.nombre, _stock[pz.nombre] ?? 0)] : [for (final e in _stock.entries) (e.key, e.value)];
        await repo.editarLista(l, stock: stock);
      }
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

  /// "Se usó": descuenta del botiquín o de los insumos y avisa si falta.
  Future<void> _seUso(StockFila f) async {
    var n = 1;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Se usó ${f.variante}', style: Theme.of(h).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text('Quedan ${f.cantidad}. Si baja del mínimo, se avisa a los Pivots.', style: TextStyle(color: h.pivot.textoSecundario)),
                const SizedBox(height: 16),
                Center(
                  child: Contador(valor: n, min: 1, max: f.cantidad < 1 ? 1 : f.cantidad, alCambiar: (v) => set(() => n = v)),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.of(h).pop(true), child: const Text('Registrar uso')),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await repo.registrarUso(l, f.variante, n);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo registrar.')));
    }
  }

  Widget _filaRenglon(StockFila f) {
    final p = context.pivot;
    final hoy = Fechas.hoy();
    final vencido = f.vence != null && !f.vence!.isAfter(hoy);
    final porVencer = f.vence != null && !vencido && f.vence!.difference(hoy).inDays <= 30;
    final falta = f.minimo != null && f.cantidad <= f.minimo!;
    return ListTile(
      title: Text(f.variante, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(
        [
          '${f.cantidad}${(l.unidad ?? '').isNotEmpty ? ' ${l.unidad}' : ''}',
          if (f.vence != null) vencido ? 'venció el ${Fechas.corta(f.vence!)}' : 'vence el ${Fechas.corta(f.vence!)}',
          if (falta) 'hay que reponer',
        ].join(' · '),
        style: TextStyle(color: vencido || falta || porVencer ? p.marcaTexto : p.textoSecundario, fontWeight: vencido || falta ? FontWeight.w700 : null),
      ),
      trailing: TextButton(onPressed: f.cantidad > 0 ? () => _seUso(f) : null, child: const Text('Se usó')),
    );
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
                if (l.porRenglones && pivot)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: EditorRenglones(renglones: _renglones, botiquin: l.seccion == 'botiquin', alCambiar: () => setState(() => _cambio = true)),
                  )
                else if (l.porRenglones) ...[
                  for (final f in l.stock) _filaRenglon(f),
                  if (l.stock.isEmpty) const ListTile(title: Text('Todavía no hay nada registrado.')),
                ] else if (l.esTallas) ...[
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
          if (l.porRenglones && pivot && l.stock.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              'REGISTRAR USO',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
            ),
            const SizedBox(height: 8),
            Material(
              color: p.tarjeta,
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              clipBehavior: Clip.antiAlias,
              child: Column(children: [for (final f in l.stock) _filaRenglon(f)]),
            ),
          ],
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

/// "Tu equipamiento" arriba del Inventario (sale de Mi perfil, Victor
/// 2026-11-13). Con equipamiento propio: pedir prestado por un tiempo. Sin
/// él: cambiar talla o protecciones, o declarar el propio.
/// Tiene patines y protecciones propias (no usa las del equipo).
bool tieneEquipoPropio(Map<String, dynamic> d) {
  final pro = '${d['necesitaProtecciones'] ?? ''}'.trim();
  return '${d['necesitaPatines'] ?? ''}' != 'Sí' && (pro.isEmpty || pro == 'No');
}

class _TuEquipamiento extends StatelessWidget {
  const _TuEquipamiento({required this.sesion, required this.regla, required this.alPedir});
  final Sesion sesion;
  final String regla;
  final VoidCallback alPedir;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final d = sesion.datos;
    // Quien tiene equipamiento propio puede pedir el del equipo en una
    // emergencia; quien usa el del equipo (Mirlxs) solo cambia su talla o
    // qué protecciones necesita (Victor, 2026-11-13).
    final propio = tieneEquipoPropio(d);
    final emergencia = propio && regla != 'no';
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: p.tarjeta,
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            child: InkWell(
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              onTap: () => SubAjustes.abrir(context, EquipamientoScreen(sesion: sesion)),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                child: Row(
                  children: [
                    Icon(Icons.person_outline_rounded, color: p.marcaTexto),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Tu equipamiento',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: p.texto),
                          ),
                          Text(textoEquipamiento(d), style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                          if (!propio)
                            Text(
                              'Toca para cambiar tu talla de patines o qué protecciones necesitas.',
                              style: TextStyle(fontSize: 13, color: p.textoSecundario),
                            ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                  ],
                ),
              ),
            ),
          ),
          if (emergencia) ...[
            const SizedBox(height: 10),
            Material(
              color: p.marca,
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              child: InkWell(
                borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                onTap: alPedir,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                  child: Row(
                    children: [
                      Icon(Icons.emergency_outlined, color: p.sobreMarca),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Solicitar equipamiento de emergencia',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: p.sobreMarca),
                            ),
                            Text('Si se te rompió o estás haciendo mantenimiento a tu equipamiento.', style: TextStyle(fontSize: 13, color: p.sobreMarca)),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: p.sobreMarca),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Reglas de préstamo por equipo (Victor, 2026-11-13): como la asistencia
/// anticipada, con fechas o sin fin; gana la más específica.
class ReglasPrestamoScreen extends StatefulWidget {
  const ReglasPrestamoScreen({super.key, required this.repo});
  final InventarioRepo repo;

  @override
  State<ReglasPrestamoScreen> createState() => _ReglasPrestamoScreenState();
}

class _ReglasPrestamoScreenState extends State<ReglasPrestamoScreen> {
  List<ReglaPrestamo>? _reglas;
  List<String> _equipos = const [];
  String? _error;
  bool _cambio = false;

  InventarioRepo get repo => widget.repo;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await Future.wait([
        repo.reglas(),
        repo.sesion.api.get('getTiers', {'adminToken': repo.sesion.adminToken}).catchError((_) => <String, dynamic>{}),
      ]);
      final tiers = [
        for (final t in ((r[1] as Map)['tiers'] as List? ?? const []))
          if (t is Map) t,
      ]..sort((a, b) => ((a['orden'] as num?) ?? 0).compareTo((b['orden'] as num?) ?? 0));
      if (!mounted) return;
      setState(() {
        _reglas = r[0] as List<ReglaPrestamo>;
        _equipos = [for (final t in tiers) '${t['nombre']}'];
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar.');
    }
  }

  String _vigencia(ReglaPrestamo r) {
    if (r.desde == null && r.hasta == null) return 'Sin fecha de fin';
    if (r.hasta == null) return 'Desde el ${Fechas.corta(r.desde!)}';
    if (r.desde == null) return 'Hasta el ${Fechas.corta(r.hasta!)}';
    return 'Del ${Fechas.corta(r.desde!)} al ${Fechas.corta(r.hasta!)}';
  }

  String? _nombreLista(String? id) => id == null ? null : repo.listas.where((l) => l.id == id).firstOrNull?.nombre;

  Future<void> _editar([ReglaPrestamo? r]) async {
    String equipo = r?.equipo ?? '';
    String presta = r?.presta ?? 'excepcional';
    String? lista = r?.listaId;
    DateTimeRange? fechas = r?.desde != null && r?.hasta != null ? DateTimeRange(start: r!.desde!, end: r.hasta!) : null;
    bool activa = r?.activa ?? true;
    final listas = repo.listas.where((l) => l.seccion == 'equipamiento').toList();
    String iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final res = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) {
          final p = h.pivot;
          Widget titulo(String t) => Padding(
            padding: const EdgeInsets.only(top: 16, bottom: 8),
            child: Text(
              t,
              style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
            ),
          );
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(r == null ? 'Nueva regla' : 'Editar regla', style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  titulo('¿Para quién?'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      ChoiceChip(label: const Text('Todos'), selected: equipo.isEmpty, onSelected: (_) => set(() => equipo = '')),
                      for (final e in _equipos) ChoiceChip(label: Text(e), selected: equipo == e, onSelected: (_) => set(() => equipo = e)),
                    ],
                  ),
                  titulo('¿Se presta?'),
                  for (final o in ReglaPrestamo.opciones.entries)
                    Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      color: presta == o.key ? p.suave : p.tarjeta,
                      child: ListTile(
                        leading: Icon(o.value.$3, color: presta == o.key ? p.sobreSuave : p.textoSecundario),
                        title: Text(o.value.$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(o.value.$2),
                        onTap: () => set(() => presta = o.key),
                      ),
                    ),
                  if (listas.length > 1) ...[
                    titulo('¿Qué se presta?'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ChoiceChip(label: const Text('Todo'), selected: lista == null, onSelected: (_) => set(() => lista = null)),
                        for (final l in listas) ChoiceChip(label: Text(l.nombre), selected: lista == l.id, onSelected: (_) => set(() => lista = l.id)),
                      ],
                    ),
                  ],
                  titulo('¿Cuándo?'),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(label: const Text('Sin fecha de fin'), selected: fechas == null, onSelected: (_) => set(() => fechas = null)),
                      ChoiceChip(
                        label: Text(fechas == null ? 'Entre fechas' : 'Del ${Fechas.corta(fechas!.start)} al ${Fechas.corta(fechas!.end)}'),
                        selected: fechas != null,
                        onSelected: (_) async {
                          final hoy = Fechas.hoy();
                          final f = await showDateRangePicker(
                            context: h,
                            firstDate: hoy.subtract(const Duration(days: 365)),
                            lastDate: hoy.add(const Duration(days: 730)),
                            initialDateRange: fechas,
                          );
                          if (f != null) set(() => fechas = f);
                        },
                      ),
                    ],
                  ),
                  if (r != null) ...[
                    const SizedBox(height: 8),
                    SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Activa'), value: activa, onChanged: (v) => set(() => activa = v)),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(onPressed: () => Navigator.of(h).pop('guardar'), child: const Text('Guardar')),
                  if (r != null) TextButton(onPressed: () => Navigator.of(h).pop('borrar'), child: const Text('Borrar regla')),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (!mounted || res == null) return;
    try {
      if (res == 'borrar') {
        final ok = await showDialog<bool>(
          context: context,
          builder: (d) => AlertDialog(
            title: const Text('¿Borrar la regla?'),
            content: const Text('Se vuelve a aplicar la regla general.'),
            actions: [
              TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
              FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Borrar')),
            ],
          ),
        );
        if (ok != true) return;
        await repo.borrarRegla(r!);
      } else {
        await repo.guardarRegla({
          'equipo': equipo,
          'presta': presta,
          'listaId': lista ?? '',
          'desde': fechas == null ? '' : iso(fechas!.start),
          'hasta': fechas == null ? '' : iso(fechas!.end),
          'activa': activa,
        }, id: r?.id);
      }
      _cambio = true;
      await _cargar();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final reglas = _reglas;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (hecho, _) {
        if (!hecho) Navigator.of(context).pop(_cambio);
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Reglas de préstamo', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        body: AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: reglas == null
              ? (_error != null ? Center(child: Text(_error!)) : const PivotCargando(centrarEnPantalla: true))
              : ListView(
                  key: const ValueKey('l'),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                      child: Text(
                        'Sin reglas, el equipamiento se presta solo en casos excepcionales. El pago de la clase ya incluye el equipamiento: no se cobra aparte.',
                        style: TextStyle(fontSize: 13, color: p.textoSecundario),
                      ),
                    ),
                    for (final r in reglas)
                      Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          leading: Icon(ReglaPrestamo.opciones[r.presta]?.$3 ?? Icons.rule_rounded, color: r.activa ? p.marcaTexto : p.apagado),
                          title: Text(
                            '${r.equipo ?? 'Todos'} · ${ReglaPrestamo.opciones[r.presta]?.$1 ?? r.presta}',
                            style: TextStyle(fontWeight: FontWeight.w600, color: r.activa ? p.texto : p.apagado),
                          ),
                          subtitle: Text([_nombreLista(r.listaId) ?? 'Todo el equipamiento', _vigencia(r), if (!r.activa) 'Apagada'].join(' · ')),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => _editar(r),
                        ),
                      ),
                  ],
                ),
        ),
        floatingActionButton: FloatingActionButton(tooltip: 'Nueva regla', onPressed: reglas == null ? null : _editar, child: const Icon(Icons.add_rounded)),
      ),
    );
  }
}
