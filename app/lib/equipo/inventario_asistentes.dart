import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import 'equipo_modelos.dart';
import 'equipo_repo.dart';
import 'inventario_modelos.dart';

String _enLista(List<String> l) => l.length <= 1 ? l.join() : '${l.sublist(0, l.length - 1).join(', ')} y ${l.last}';

/// Botones − número + para cantidades.
class Contador extends StatelessWidget {
  const Contador({super.key, required this.valor, required this.alCambiar, this.min = 0, this.max = 999});
  final int valor, min, max;
  final void Function(int) alCambiar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(tooltip: 'Menos', onPressed: valor > min ? () => alCambiar(valor - 1) : null, icon: const Icon(Icons.remove_circle_outline_rounded)),
        SizedBox(
          width: 34,
          child: Text(
            '$valor',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.texto),
          ),
        ),
        IconButton(tooltip: 'Más', onPressed: valor < max ? () => alCambiar(valor + 1) : null, icon: const Icon(Icons.add_circle_outline_rounded)),
      ],
    );
  }
}

// ─── Nueva lista de inventario ───────────────────────────────────────────

enum _PasoLista { seccion, tipo, nombre, detalle }

/// Un renglón del botiquín o de insumos mientras se edita.
class RenglonInventario {
  RenglonInventario({this.nombre = '', this.cantidad = 1, this.vence, this.minimo});
  String nombre;
  int cantidad;
  DateTime? vence;
  int? minimo;

  Map<String, Object?> get json => {
    'variante': nombre.trim(),
    'cantidad': cantidad,
    'vence': vence == null ? null : '${vence!.year}-${vence!.month.toString().padLeft(2, '0')}-${vence!.day.toString().padLeft(2, '0')}',
    'minimo': minimo,
  };
}

/// Editor de renglones: nombre, cantidad y, en el botiquín, vencimiento y
/// mínimo para reponer.
class EditorRenglones extends StatelessWidget {
  const EditorRenglones({super.key, required this.renglones, required this.botiquin, required this.alCambiar});
  final List<RenglonInventario> renglones;
  final bool botiquin;
  final VoidCallback alCambiar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, r) in renglones.indexed)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
            decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        initialValue: r.nombre,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(hintText: botiquin ? 'Ej. Gasas' : 'Ej. Conos', isDense: true),
                        onChanged: (v) {
                          r.nombre = v;
                          alCambiar();
                        },
                      ),
                    ),
                    Contador(
                      valor: r.cantidad,
                      max: 9999,
                      alCambiar: (v) {
                        r.cantidad = v;
                        alCambiar();
                      },
                    ),
                    IconButton(
                      tooltip: 'Quitar',
                      onPressed: () {
                        renglones.removeAt(i);
                        alCambiar();
                      },
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                if (botiquin)
                  Wrap(
                    spacing: 8,
                    children: [
                      ActionChip(
                        avatar: const Icon(Icons.event_outlined, size: 18),
                        label: Text(r.vence == null ? 'Sin vencimiento' : 'Vence ${Fechas.corta(r.vence!)}'),
                        onPressed: () async {
                          final hoy = Fechas.hoy();
                          final f = await showDatePicker(
                            context: context,
                            initialDate: r.vence ?? DateTime(hoy.year + 1, hoy.month, hoy.day),
                            firstDate: DateTime(hoy.year - 1),
                            lastDate: DateTime(hoy.year + 10),
                          );
                          if (f != null) {
                            r.vence = f;
                            alCambiar();
                          }
                        },
                      ),
                      ActionChip(
                        avatar: const Icon(Icons.low_priority_rounded, size: 18),
                        label: Text(r.minimo == null ? 'Sin mínimo' : 'Avisar con ${r.minimo} o menos'),
                        onPressed: () {
                          r.minimo = r.minimo == null ? 1 : (r.minimo! >= 10 ? null : r.minimo! + 1);
                          alCambiar();
                        },
                      ),
                    ],
                  ),
              ],
            ),
          ),
        TextButton.icon(
          onPressed: () {
            renglones.add(RenglonInventario());
            alCambiar();
          },
          icon: const Icon(Icons.add_rounded),
          label: Text(botiquin ? 'Agregar al botiquín' : 'Agregar'),
        ),
      ],
    );
  }
}

/// Crear una lista (Victor, 2026-11-13): primero la sección (equipamiento
/// deportivo, insumos de entrenamiento, botiquín o misceláneos); el
/// equipamiento se cuenta por tallas o por sets completos y lo demás por
/// renglones (en el botiquín, con vencimiento y mínimo para reponer).
class NuevaListaAsistente extends StatefulWidget {
  const NuevaListaAsistente({super.key, required this.repo, this.seccion});
  final InventarioRepo repo;
  final String? seccion;

  @override
  State<NuevaListaAsistente> createState() => _NuevaListaAsistenteState();
}

class _NuevaListaAsistenteState extends State<NuevaListaAsistente> {
  late String? _seccion = widget.seccion;
  late _PasoLista _paso = widget.seccion == null ? _PasoLista.seccion : (widget.seccion == 'equipamiento' ? _PasoLista.tipo : _PasoLista.nombre);
  bool _adelante = true, _ocupado = false;
  String? _tipo;
  final _nombre = TextEditingController();
  late String _icono = _seccion == 'botiquin' ? 'botiquin' : 'otro';
  final _tallas = <(String, int)>[];
  final _piezas = <Pieza>[Pieza('', 1)];
  final _renglones = <RenglonInventario>[RenglonInventario()];
  int _sets = 1;

  bool get _equipamiento => _seccion == 'equipamiento';

  @override
  void dispose() {
    _nombre.dispose();
    super.dispose();
  }

  List<_PasoLista> get _pasos => [if (widget.seccion == null) _PasoLista.seccion, if (_equipamiento) _PasoLista.tipo, _PasoLista.nombre, _PasoLista.detalle];

  void _ir(int d) {
    final l = _pasos;
    final i = l.indexOf(_paso) + d;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= l.length) return;
    setState(() {
      _adelante = d > 0;
      _paso = l[i];
    });
  }

  void _elegirYSeguir(VoidCallback c) {
    setState(c);
    Future.delayed(const Duration(milliseconds: 180), () {
      if (mounted) _ir(1);
    });
  }

  bool get _valido => switch (_paso) {
    _PasoLista.seccion => _seccion != null,
    _PasoLista.tipo => _tipo != null,
    _PasoLista.nombre => _nombre.text.trim().isNotEmpty,
    _PasoLista.detalle =>
      _equipamiento
          ? (_tipo == 'tallas' ? _tallas.isNotEmpty : _piezas.any((p) => p.nombre.trim().isNotEmpty))
          : _renglones.any((r) => r.nombre.trim().isNotEmpty),
  };

  Future<void> _crear() async {
    setState(() => _ocupado = true);
    final piezas = [
      for (final p in _piezas)
        if (p.nombre.trim().isNotEmpty) Pieza(p.nombre.trim(), p.cantidad),
    ];
    try {
      await widget.repo.crearLista(
        nombre: _nombre.text.trim(),
        tipo: _equipamiento ? _tipo! : 'insumo',
        icono: _icono,
        seccion: _seccion!,
        piezas: piezas,
        stock: _equipamiento ? (_tipo == 'tallas' ? _tallas : [for (final p in piezas) (p.nombre, p.cantidad * _sets)]) : const [],
        renglones: _equipamiento
            ? null
            : [
                for (final r in _renglones)
                  if (r.nombre.trim().isNotEmpty) r.json,
              ],
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo crear. Revisa tu conexión.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _pasos;
    final ultimo = _paso == l.last;
    return Asistente(
      titulo: 'Nueva lista',
      indice: l.indexOf(_paso),
      total: l.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _PasoLista.seccion => '¿Qué vas a registrar?',
        _PasoLista.tipo => '¿Cómo se cuenta?',
        _PasoLista.nombre => '¿Cómo se llama la lista?',
        _PasoLista.detalle => switch (_seccion) {
          'equipamiento' => _tipo == 'tallas' ? '¿Qué tallas hay?' : '¿Qué trae cada set?',
          'botiquin' => '¿Qué hay en el botiquín?',
          _ => '¿Qué hay?',
        },
      },
      ayuda: switch (_paso) {
        _PasoLista.seccion => 'Puedes crear tantas listas como necesite la liga, para cualquier deporte.',
        _PasoLista.detalle when _seccion == 'botiquin' => 'Pon la fecha de vencimiento y un mínimo para que la app avise qué reponer.',
        _PasoLista.detalle => 'Después puedes cambiar las cantidades desde Inventario.',
        _ => null,
      },
      cuerpo: switch (_paso) {
        _PasoLista.seccion => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final e in seccionesInventario.entries)
              OpcionAsistente(
                icono: e.value.$3,
                titulo: e.value.$1,
                texto: e.value.$2,
                activa: _seccion == e.key,
                alTocar: () => _elegirYSeguir(() {
                  _seccion = e.key;
                  _icono = e.key == 'botiquin' ? 'botiquin' : (e.key == 'entrenamiento' ? 'conos' : 'otro');
                }),
              ),
          ],
        ),
        _PasoLista.tipo => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            OpcionAsistente(
              icono: Icons.straighten_rounded,
              titulo: 'Con talla',
              texto: 'Ej. patines: cuántos hay de cada talla.',
              activa: _tipo == 'tallas',
              alTocar: () => _elegirYSeguir(() {
                _tipo = 'tallas';
                _icono = 'patines';
              }),
            ),
            OpcionAsistente(
              icono: Icons.dashboard_customize_outlined,
              titulo: 'Sets completos',
              texto: 'Ej. protecciones: cada set trae casco, coderas, rodilleras…',
              activa: _tipo == 'set',
              alTocar: () => _elegirYSeguir(() {
                _tipo = 'set';
                _icono = 'protecciones';
              }),
            ),
          ],
        ),
        _PasoLista.nombre => _pasoNombre(context),
        _PasoLista.detalle => _pasoDetalle(context),
      },
      textoBoton: ultimo ? 'Crear lista' : 'Siguiente',
      alContinuar: !_valido ? null : (ultimo ? _crear : () => _ir(1)),
      ocupado: _ocupado,
    );
  }

  Widget _pasoNombre(BuildContext context) {
    final p = context.pivot;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _nombre,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: 'Nombre',
            hintText: switch (_seccion) {
              'equipamiento' => _tipo == 'tallas' ? 'Ej. Patines' : 'Ej. Protecciones',
              'botiquin' => 'Ej. Botiquín',
              'entrenamiento' => 'Ej. Material de entrenamiento',
              _ => 'Ej. Merch',
            },
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Ícono',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final e in iconosInventario.entries)
              ChoiceChip(showCheckmark: false, label: Icon(e.value, size: 22), selected: _icono == e.key, onSelected: (_) => setState(() => _icono = e.key)),
          ],
        ),
      ],
    );
  }

  Future<void> _agregarTalla() async {
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
    if (t == null || t.isEmpty || _tallas.any((x) => x.$1 == t)) return;
    setState(() => _tallas.add((t, 1)));
  }

  Widget _pasoDetalle(BuildContext context) {
    final p = context.pivot;
    if (!_equipamiento) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [EditorRenglones(renglones: _renglones, botiquin: _seccion == 'botiquin', alCambiar: () => setState(() {}))],
      );
    }
    if (_tipo == 'tallas') {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final (i, t) in _tallas.indexed)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Talla ${t.$1}', style: const TextStyle(fontWeight: FontWeight.w600)),
              trailing: Contador(valor: t.$2, alCambiar: (v) => setState(() => v == 0 ? _tallas.removeAt(i) : _tallas[i] = (t.$1, v))),
            ),
          TextButton.icon(onPressed: _agregarTalla, icon: const Icon(Icons.add_rounded), label: const Text('Agregar talla')),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final (i, pz) in _piezas.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: pz.nombre,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(hintText: i == 0 ? 'Ej. Casco' : 'Pieza', isDense: true),
                    onChanged: (v) => setState(() => pz.nombre = v),
                  ),
                ),
                Contador(valor: pz.cantidad, min: 1, max: 20, alCambiar: (v) => setState(() => pz.cantidad = v)),
                IconButton(
                  tooltip: 'Quitar',
                  onPressed: _piezas.length > 1 ? () => setState(() => _piezas.removeAt(i)) : null,
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
        TextButton.icon(onPressed: () => setState(() => _piezas.add(Pieza('', 1))), icon: const Icon(Icons.add_rounded), label: const Text('Agregar pieza')),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Text(
                '¿Cuántos sets completos hay?',
                style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
              ),
            ),
            Contador(valor: _sets, alCambiar: (v) => setState(() => _sets = v)),
          ],
        ),
      ],
    );
  }
}

// ─── Plazo de un préstamo ───────────────────────────────────────────────

/// Hoja para elegir el plazo y la entrega al aprobar o editar un préstamo
/// (Victor, 2026-11-13): el mismo día (sin avisos), hasta una fecha (ese día
/// se avisa a ambos) o indefinido (aviso cada N días).
Future<Map<String, Object?>?> elegirPlazoPrestamo(
  BuildContext context, {
  required String titulo,
  String textoBoton = 'Aprobar',
  String? plazo,
  DateTime? hasta,
  int recordarCada = 7,
  String entrega = 'casa',
}) {
  var pl = plazo ?? 'dia';
  var h = hasta ?? Fechas.hoy().add(const Duration(days: 7));
  var cada = recordarCada;
  var en = entrega;
  String iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  return showModalBottomSheet<Map<String, Object?>>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (hoja) => StatefulBuilder(
      builder: (hoja, refrescar) {
        final p = hoja.pivot;
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(titulo, style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                for (final (v, t, d) in const [
                  ('dia', 'Solo hoy', 'Un Pivot lo lleva y se lo vuelve a llevar. Sin avisos.'),
                  ('fecha', 'Hasta una fecha', 'Ese día se avisa a la persona y a los Pivots.'),
                  ('indefinido', 'Sin fecha de fin', 'Se pregunta cada tanto si aún lo tiene.'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: OpcionAsistente(
                      icono: v == 'dia' ? Icons.today_rounded : (v == 'fecha' ? Icons.event_rounded : Icons.all_inclusive_rounded),
                      titulo: t,
                      texto: d,
                      activa: pl == v,
                      alTocar: () => refrescar(() => pl = v),
                    ),
                  ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  alignment: Alignment.topCenter,
                  child: switch (pl) {
                    'fecha' => OutlinedButton.icon(
                      icon: const Icon(Icons.event_outlined),
                      label: Text('Hasta el ${Fechas.corta(h)}'),
                      onPressed: () async {
                        final f = await showDatePicker(
                          context: hoja,
                          initialDate: h,
                          firstDate: Fechas.hoy(),
                          lastDate: Fechas.hoy().add(const Duration(days: 730)),
                        );
                        if (f != null) refrescar(() => h = f);
                      },
                    ),
                    'indefinido' => Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Preguntar cada $cada días',
                            style: TextStyle(fontWeight: FontWeight.w600, color: p.texto),
                          ),
                        ),
                        Contador(valor: cada, min: 1, max: 90, alCambiar: (v) => refrescar(() => cada = v)),
                      ],
                    ),
                    _ => const SizedBox(width: double.infinity),
                  },
                ),
                if (pl != 'dia') ...[
                  const SizedBox(height: 12),
                  Text(
                    '¿Cómo lo usa?',
                    style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                  ),
                  RadioGroup<String>(
                    groupValue: en,
                    onChanged: (v) => refrescar(() => en = v ?? 'casa'),
                    child: const Column(
                      children: [
                        RadioListTile(contentPadding: EdgeInsets.zero, value: 'casa', title: Text('Se lo lleva a su casa')),
                        RadioListTile(contentPadding: EdgeInsets.zero, value: 'pivot', title: Text('Un Pivot lo trae a cada entrenamiento')),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: () => Navigator.of(
                    hoja,
                  ).pop({'plazo': pl, if (pl == 'fecha') 'hasta': iso(h), if (pl == 'indefinido') 'recordarCada': cada, 'entrega': pl == 'dia' ? 'pivot' : en}),
                  child: Text(textoBoton),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

// ─── Alguien tiene algo / Me llevé algo / Pedir equipamiento ───────────

/// 'registrar' (un Pivot anota que alguien tiene algo), 'salida' (la persona
/// avisa que se llevó algo) o 'uso' (la persona pide usar equipamiento por
/// un tiempo sin bajar de Equipo).
enum ModoPrestamo { registrar, salida, uso }

enum _PasoPrestamo { persona, que, detalle, tiempo, motivo }

class PrestamoAsistente extends StatefulWidget {
  const PrestamoAsistente({super.key, required this.repo, required this.equipo, required this.modo});
  final InventarioRepo repo;
  final EquipoRepo equipo;
  final ModoPrestamo modo;

  @override
  State<PrestamoAsistente> createState() => _PrestamoAsistenteState();
}

class _PrestamoAsistenteState extends State<PrestamoAsistente> {
  late _PasoPrestamo _paso = _pasos.first;
  bool _adelante = true, _ocupado = false;
  Integrante? _persona;
  ListaInventario? _lista;
  String? _variante;
  int _cantidad = 1;
  bool _setCompleto = true;
  final _piezas = <String, int>{};
  bool? _permanente;
  String _motivo = '';
  final _buscar = TextEditingController();

  ModoPrestamo get modo => widget.modo;

  @override
  void initState() {
    super.initState();
    if (modo == ModoPrestamo.registrar) widget.equipo.cargar().then((_) => mounted ? setState(() {}) : null);
  }

  @override
  void dispose() {
    _buscar.dispose();
    super.dispose();
  }

  List<_PasoPrestamo> get _pasos => [
    if (modo == ModoPrestamo.registrar) _PasoPrestamo.persona,
    _PasoPrestamo.que,
    _PasoPrestamo.detalle,
    if (modo == ModoPrestamo.uso) _PasoPrestamo.motivo else _PasoPrestamo.tiempo,
  ];

  /// En un pedido de uso solo se ofrecen las listas que se prestan para entrenar.
  List<ListaInventario> get _listas => [
    for (final l in widget.repo.listas)
      if (l.activa && (modo != ModoPrestamo.uso || l.seccion == 'equipamiento')) l,
  ];

  void _ir(int d) {
    final l = _pasos;
    final i = l.indexOf(_paso) + d;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= l.length) return;
    setState(() {
      _adelante = d > 0;
      _paso = l[i];
    });
  }

  void _elegirYSeguir(VoidCallback c) {
    setState(c);
    Future.delayed(const Duration(milliseconds: 180), () {
      if (mounted) _ir(1);
    });
  }

  bool get _valido => switch (_paso) {
    _PasoPrestamo.persona => _persona != null,
    _PasoPrestamo.que => _lista != null,
    _PasoPrestamo.detalle =>
      _lista != null &&
          switch (_lista!.tipo) {
            'tallas' => _variante != null,
            'set' => _setCompleto || _piezas.isNotEmpty,
            'insumo' => _variante != null && _cantidad > 0,
            _ => _cantidad > 0,
          },
    _PasoPrestamo.tiempo => _permanente != null,
    _PasoPrestamo.motivo => _motivo.isNotEmpty,
  };

  Future<void> _enviar() async {
    setState(() => _ocupado = true);
    final l = _lista!;
    final piezas = l.esSet && !_setCompleto ? Map.of(_piezas) : null;
    try {
      if (modo == ModoPrestamo.registrar) {
        await widget.repo.registrar(
          persona: _persona!.username,
          listaId: l.id,
          variante: _variante,
          cantidad: _cantidad,
          piezas: piezas,
          permanente: _permanente == true,
          motivo: _motivo,
        );
      } else {
        await widget.repo.pedir(
          tipo: modo == ModoPrestamo.uso ? 'uso' : 'salida',
          listaId: l.id,
          variante: _variante,
          cantidad: _cantidad,
          piezas: piezas,
          permanente: _permanente == true,
          motivo: _motivo,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo enviar. Revisa tu conexión.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _pasos;
    final ultimo = _paso == l.last;
    return Asistente(
      titulo: switch (modo) {
        ModoPrestamo.registrar => '¿Alguien tiene equipamiento?',
        ModoPrestamo.salida => 'Me llevé equipamiento',
        ModoPrestamo.uso => 'Equipamiento de emergencia',
      },
      indice: l.indexOf(_paso),
      total: l.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _PasoPrestamo.persona => '¿Quién lo tiene?',
        _PasoPrestamo.que => modo == ModoPrestamo.uso ? '¿Qué necesitas?' : '¿Qué equipamiento?',
        _PasoPrestamo.detalle => switch (_lista?.tipo) {
          'tallas' => '¿Qué talla?',
          'set' => '¿El set completo o algunas piezas?',
          _ => '¿Cuántos?',
        },
        _PasoPrestamo.tiempo => '¿Por cuánto tiempo?',
        _PasoPrestamo.motivo => '¿Por qué lo necesitas?',
      },
      ayuda: switch (_paso) {
        _PasoPrestamo.persona =>
          'Si alguien del equipo se llevó equipamiento para darle mantenimiento, limpiarlo o tenerlo por algún motivo, regístralo aquí. '
              'Si es temporal, a los 7 días se pregunta a los Pivots y a la persona si aún lo tiene.',
        _PasoPrestamo.que when modo == ModoPrestamo.uso => 'Si se te rompió o estás haciendo mantenimiento a tu equipamiento, un Pivot decide por cuánto tiempo puedes usar el del equipo sin cambiar de equipo.',
        _PasoPrestamo.que when modo == ModoPrestamo.salida =>
          'Para cuando te llevas algo del equipo fuera del entrenamiento (por ejemplo, a limpiarlo). Un Pivot lo aprueba.',
        _PasoPrestamo.tiempo => 'Lo temporal recibe un recordatorio cada 7 días hasta que se devuelve.',
        _ => null,
      },
      cuerpo: switch (_paso) {
        _PasoPrestamo.persona => _pasoPersona(context),
        _PasoPrestamo.que => _pasoQue(context),
        _PasoPrestamo.detalle => _pasoDetalle(context),
        _PasoPrestamo.tiempo => _pasoTiempo(context),
        _PasoPrestamo.motivo => _pasoMotivo(context),
      },
      textoBoton: ultimo ? (modo == ModoPrestamo.registrar ? 'Registrar' : 'Enviar') : 'Siguiente',
      alContinuar: !_valido ? null : (ultimo ? _enviar : () => _ir(1)),
      ocupado: _ocupado,
    );
  }

  Widget _pasoPersona(BuildContext context) {
    final p = context.pivot;
    final q = _buscar.text.trim().toLowerCase();
    final gente = [
      for (final x in widget.equipo.personas ?? const <Integrante>[])
        if (q.isEmpty || x.nombreMostrar.toLowerCase().contains(q) || x.username.toLowerCase().contains(q)) x,
    ]..sort((a, b) => a.nombreMostrar.toLowerCase().compareTo(b.nombreMostrar.toLowerCase()));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: TextField(
            controller: _buscar,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Buscar por nombre',
              prefixIcon: const Icon(Icons.search_rounded),
              isDense: true,
              suffixIcon: q.isEmpty
                  ? null
                  : IconButton(tooltip: 'Borrar texto', icon: const Icon(Icons.close_rounded), onPressed: () => setState(_buscar.clear)),
            ),
          ),
        ),
        Expanded(
          child: widget.equipo.personas == null
              ? const Center(child: CircularProgressIndicator())
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                  itemCount: gente.length,
                  itemBuilder: (_, i) {
                    final x = gente[i];
                    final sel = _persona?.username == x.username;
                    return ListTile(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                      tileColor: sel ? p.suave : null,
                      leading: AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: 40),
                      title: Text(
                        x.nombreMostrar,
                        style: TextStyle(fontWeight: FontWeight.w600, color: sel ? p.sobreSuave : p.texto),
                      ),
                      trailing: sel ? Icon(Icons.check_rounded, color: p.sobreSuave) : null,
                      onTap: () => _elegirYSeguir(() => _persona = x),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _pasoQue(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      for (final l in _listas)
        OpcionAsistente(
          icono: l.iconoData,
          titulo: l.nombre,
          texto: l.resumen,
          activa: _lista?.id == l.id,
          alTocar: () => _elegirYSeguir(() {
            if (_lista?.id != l.id) {
              _variante = null;
              _piezas.clear();
              _setCompleto = true;
              _cantidad = 1;
            }
            _lista = l;
          }),
        ),
      if (_listas.isEmpty) const Text('Todavía no hay listas de equipamiento.'),
    ],
  );

  Widget _pasoDetalle(BuildContext context) {
    final p = context.pivot;
    final l = _lista!;
    if (l.esTallas) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final f in l.stock)
                if (f.cantidad > 0)
                  ChoiceChip(
                    showCheckmark: false,
                    label: Text('${f.variante} · ${f.libres} ${f.libres == 1 ? 'libre' : 'libres'}'),
                    selected: _variante == f.variante,
                    onSelected: (_) => setState(() => _variante = f.variante),
                  ),
            ],
          ),
        ],
      );
    }
    if (l.esSet) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          OpcionAsistente(
            icono: Icons.dashboard_customize_outlined,
            titulo: 'Set completo',
            texto: _enLista(l.piezas.map((x) => '${x.cantidad} ${x.nombre.toLowerCase()}').toList()),
            activa: _setCompleto,
            alTocar: () => setState(() => _setCompleto = true),
          ),
          OpcionAsistente(
            icono: Icons.checklist_rounded,
            titulo: 'Algunas piezas',
            texto: 'Elige cuáles y cuántas.',
            activa: !_setCompleto,
            alTocar: () => setState(() => _setCompleto = false),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _setCompleto
                ? Row(
                    children: [
                      Expanded(
                        child: Text(
                          '¿Cuántos sets?',
                          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                        ),
                      ),
                      Contador(valor: _cantidad, min: 1, max: 50, alCambiar: (v) => setState(() => _cantidad = v)),
                    ],
                  )
                : Column(
                    children: [
                      for (final pz in l.piezas)
                        Row(
                          children: [
                            Expanded(
                              child: CheckboxListTile(
                                contentPadding: EdgeInsets.zero,
                                controlAffinity: ListTileControlAffinity.leading,
                                title: Text(pz.nombre),
                                subtitle: Text('${l.fila(pz.nombre)?.libres ?? 0} libres'),
                                value: _piezas.containsKey(pz.nombre),
                                onChanged: (v) => setState(() => v == true ? _piezas[pz.nombre] = pz.cantidad : _piezas.remove(pz.nombre)),
                              ),
                            ),
                            AnimatedOpacity(
                              duration: const Duration(milliseconds: 180),
                              opacity: _piezas.containsKey(pz.nombre) ? 1 : 0,
                              child: IgnorePointer(
                                ignoring: !_piezas.containsKey(pz.nombre),
                                child: Contador(
                                  valor: _piezas[pz.nombre] ?? pz.cantidad,
                                  min: 1,
                                  max: 50,
                                  alCambiar: (v) => setState(() => _piezas[pz.nombre] = v),
                                ),
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
          ),
        ],
      );
    }
    if (l.porRenglones) {
      // Botiquín o insumos: qué cosa y cuántas.
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final f in l.stock)
                if (f.cantidad > 0)
                  ChoiceChip(
                    showCheckmark: false,
                    label: Text('${f.variante} · ${f.libres}'),
                    selected: _variante == f.variante,
                    onSelected: (_) => setState(() => _variante = f.variante),
                  ),
            ],
          ),
          const SizedBox(height: 16),
          Center(
            child: Contador(valor: _cantidad, min: 1, max: 9999, alCambiar: (v) => setState(() => _cantidad = v)),
          ),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Center(
          child: Contador(valor: _cantidad, min: 1, max: 9999, alCambiar: (v) => setState(() => _cantidad = v)),
        ),
        Text(
          l.esInsumo && (l.unidad ?? '').isNotEmpty ? l.unidad! : l.nombre.toLowerCase(),
          textAlign: TextAlign.center,
          style: TextStyle(color: p.textoSecundario),
        ),
      ],
    );
  }

  Widget _pasoTiempo(BuildContext context) {
    final p = context.pivot;
    const motivos = ['Mantenimiento', 'Limpieza', 'Lo trae a los entrenamientos', 'Otro'];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OpcionAsistente(
          icono: Icons.timelapse_rounded,
          titulo: 'Temporal',
          texto: 'Lo devuelve después. Cada 7 días se pregunta si aún lo tiene.',
          activa: _permanente == false,
          alTocar: () => setState(() => _permanente = false),
        ),
        OpcionAsistente(
          icono: Icons.all_inclusive_rounded,
          titulo: 'Permanente',
          texto: 'Lo tiene siempre (ej. trae los conos a cada entrenamiento). Sin recordatorios.',
          activa: _permanente == true,
          alTocar: () => setState(() => _permanente = true),
        ),
        const SizedBox(height: 16),
        Text(
          'Motivo (opcional)',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [for (final m in motivos) ChoiceChip(label: Text(m), selected: _motivo == m, onSelected: (s) => setState(() => _motivo = s ? m : ''))],
        ),
      ],
    );
  }

  Widget _pasoMotivo(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      for (final (m, icono) in const [
        ('Se me rompió', Icons.build_circle_outlined),
        ('Lo estoy limpiando o reparando', Icons.local_laundry_service_outlined),
        ('Me lo robaron o lo perdí', Icons.report_gmailerrorred_outlined),
        ('Otro motivo', Icons.more_horiz_rounded),
      ])
        OpcionAsistente(icono: icono, titulo: m, texto: '', activa: _motivo == m, alTocar: () => setState(() => _motivo = m)),
    ],
  );
}
