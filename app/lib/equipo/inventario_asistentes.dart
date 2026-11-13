import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/asistente.dart';
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

// ─── Nueva lista de equipamiento ─────────────────────────────────────────

enum _PasoLista { tipo, nombre, detalle }

/// Crear una lista (Victor, 2026-11-13): 100 % personalizable para cualquier
/// deporte. Con tallas, sets de piezas, unidades o insumos.
class NuevaListaAsistente extends StatefulWidget {
  const NuevaListaAsistente({super.key, required this.repo});
  final InventarioRepo repo;

  @override
  State<NuevaListaAsistente> createState() => _NuevaListaAsistenteState();
}

class _NuevaListaAsistenteState extends State<NuevaListaAsistente> {
  _PasoLista _paso = _PasoLista.tipo;
  bool _adelante = true, _ocupado = false;
  String? _tipo;
  final _nombre = TextEditingController();
  final _unidad = TextEditingController();
  String _icono = 'otro';
  final _tallas = <(String, int)>[];
  final _piezas = <Pieza>[Pieza('', 1)];
  int _sets = 1, _cantidad = 1;

  @override
  void dispose() {
    _nombre.dispose();
    _unidad.dispose();
    super.dispose();
  }

  void _ir(int d) {
    final i = _paso.index + d;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= _PasoLista.values.length) return;
    setState(() {
      _adelante = d > 0;
      _paso = _PasoLista.values[i];
    });
  }

  bool get _valido => switch (_paso) {
    _PasoLista.tipo => _tipo != null,
    _PasoLista.nombre => _nombre.text.trim().isNotEmpty,
    _PasoLista.detalle => switch (_tipo) {
      'tallas' => _tallas.isNotEmpty,
      'set' => _piezas.any((p) => p.nombre.trim().isNotEmpty),
      _ => true,
    },
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
        tipo: _tipo!,
        icono: _icono,
        unidad: _unidad.text.trim(),
        piezas: piezas,
        stock: switch (_tipo) {
          'tallas' => _tallas,
          'set' => [for (final p in piezas) (p.nombre, p.cantidad * _sets)],
          _ => [('', _cantidad)],
        },
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
    return Asistente(
      titulo: 'Nueva lista de equipamiento',
      indice: _paso.index,
      total: _PasoLista.values.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _PasoLista.tipo => '¿Cómo se cuenta?',
        _PasoLista.nombre => '¿Cómo se llama?',
        _PasoLista.detalle => switch (_tipo) {
          'tallas' => '¿Qué tallas hay?',
          'set' => '¿Qué trae cada set?',
          'insumo' => '¿Cuánto hay?',
          _ => '¿Cuántos hay?',
        },
      },
      ayuda: switch (_paso) {
        _PasoLista.tipo => 'Puedes crear tantas listas como necesite la liga, para cualquier deporte.',
        _PasoLista.nombre => null,
        _PasoLista.detalle => 'Después puedes cambiar las cantidades desde Inventario.',
      },
      cuerpo: switch (_paso) {
        _PasoLista.tipo => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final e in ListaInventario.tipos.entries)
              OpcionAsistente(
                icono: e.value.$3,
                titulo: e.value.$1,
                texto: e.value.$2,
                activa: _tipo == e.key,
                alTocar: () {
                  setState(() => _tipo = e.key);
                  Future.delayed(const Duration(milliseconds: 180), () {
                    if (mounted) _ir(1);
                  });
                },
              ),
          ],
        ),
        _PasoLista.nombre => _pasoNombre(context),
        _PasoLista.detalle => _pasoDetalle(context),
      },
      textoBoton: _paso == _PasoLista.tipo ? (_tipo == null ? null : 'Siguiente') : (_paso == _PasoLista.detalle ? 'Crear lista' : 'Siguiente'),
      alContinuar: !_valido ? null : (_paso == _PasoLista.detalle ? _crear : () => _ir(1)),
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
            hintText: switch (_tipo) {
              'tallas' => 'Ej. Patines',
              'set' => 'Ej. Protecciones',
              'insumo' => 'Ej. Cinta',
              _ => 'Ej. Conos',
            },
          ),
        ),
        if (_tipo == 'insumo') ...[
          const SizedBox(height: 12),
          TextField(
            controller: _unidad,
            decoration: const InputDecoration(labelText: 'Se cuenta en (opcional)', hintText: 'Ej. rollos, botellas'),
          ),
        ],
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
    switch (_tipo) {
      case 'tallas':
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
      case 'set':
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
            TextButton.icon(
              onPressed: () => setState(() => _piezas.add(Pieza('', 1))),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Agregar pieza'),
            ),
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
      default:
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Center(
              child: Contador(valor: _cantidad, max: 100000, alCambiar: (v) => setState(() => _cantidad = v)),
            ),
            const SizedBox(height: 8),
            Text(
              _tipo == 'insumo' && _unidad.text.trim().isNotEmpty ? _unidad.text.trim() : 'en total',
              textAlign: TextAlign.center,
              style: TextStyle(color: p.textoSecundario),
            ),
          ],
        );
    }
  }
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
      if (modo != ModoPrestamo.uso || l.tipo == 'tallas' || l.tipo == 'set') l,
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
        ModoPrestamo.uso => 'Pedir equipamiento',
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
        _PasoPrestamo.que when modo == ModoPrestamo.uso =>
          'Si se te rompió o estás lavando tu equipamiento, un Pivot decide por cuánto tiempo puedes usar el del equipo sin cambiar de equipo.',
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
        ('Lo estoy lavando o reparando', Icons.local_laundry_service_outlined),
        ('Me lo robaron o lo perdí', Icons.report_gmailerrorred_outlined),
        ('Otro motivo', Icons.more_horiz_rounded),
      ])
        OpcionAsistente(icono: icono, titulo: m, texto: '', activa: _motivo == m, alTocar: () => setState(() => _motivo = m)),
    ],
  );
}
