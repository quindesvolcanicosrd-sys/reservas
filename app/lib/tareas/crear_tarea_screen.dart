import 'package:flutter/material.dart';

import '../ajustes/componentes.dart';
import '../core/api.dart';
import '../core/asistente.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../equipo/equipo_repo.dart';
import '../eventos/widgets_comunes.dart';
import 'tareas_modelos.dart';
import 'tareas_repo.dart';

enum ModoTarea { crear, editar, duplicar, proponer }

enum _Paso { tipo, repeticion, titulo, area, puntos, fecha, personas, revisar }

/// Frecuencias rápidas de una recurrente (Victor, 2026-11-12: flexible).
const _frecuencias = [
  ('semana', 1, 'Cada semana'),
  ('dia', 15, 'Cada 15 días'),
  ('mes', 1, 'Cada mes'),
  ('mes', 2, 'Cada 2 meses'),
  ('mes', 3, 'Cada 3 meses'),
  ('mes', 4, 'Cada 4 meses'),
  ('mes', 6, 'Cada 6 meses'),
  ('mes', 12, 'Cada año'),
];

String textoFrecuencia(String unidad, int n) => switch (unidad) {
  'dia' => n == 1 ? 'Cada día' : 'Cada $n días',
  'semana' => n == 1 ? 'Cada semana' : 'Cada $n semanas',
  _ => n == 1 ? 'Cada mes' : (n == 12 ? 'Cada año' : 'Cada $n meses'),
};

/// Asistente por pasos para crear, editar, duplicar o proponer una tarea
/// (mismo marco que el resto de la app, `Asistente`).
/// - Admins: única o recurrente, título y detalles, área, puntos y cupos,
///   fecha límite y, si quieren, a quién se asigna.
/// - El resto propone una tarea propia (queda asignada, sin puntos: los
///   decide admin al aprobarla).
class CrearTareaScreen extends StatefulWidget {
  const CrearTareaScreen({super.key, required this.repo, required this.modo, this.base, this.siguientes = false});
  final TareasRepo repo;
  final ModoTarea modo;
  final Tarea? base;

  /// Edición de una recurrente "esta y las siguientes".
  final bool siguientes;

  static Future<void> abrir(BuildContext context, {required TareasRepo repo, required ModoTarea modo, Tarea? base, bool siguientes = false}) {
    return SubAjustes.abrir(context, CrearTareaScreen(repo: repo, modo: modo, base: base, siguientes: siguientes));
  }

  @override
  State<CrearTareaScreen> createState() => _CrearTareaScreenState();
}

class _CrearTareaScreenState extends State<CrearTareaScreen> {
  late final _titulo = TextEditingController(text: widget.base?.titulo ?? '');
  late final _notas = TextEditingController(text: widget.base?.notas ?? '');
  late String? _area = widget.base?.area;
  late int _puntos = widget.base?.puntos ?? 1;
  late int _cupos = widget.base?.cupos ?? 1;
  late DateTime? _fecha = widget.modo == ModoTarea.editar ? widget.base?.vence : null;
  late bool? _recurrente = switch (widget.modo) {
    ModoTarea.editar => widget.base?.recurrente ?? false,
    ModoTarea.proponer => false,
    _ => null,
  };
  final Set<String> _personas = {};
  // Recurrente: cada cuánto, desde cuándo y cuándo vence.
  String _unidad = 'mes';
  int _cadaN = 1;
  late DateTime _inicio = Fechas.hoy();
  int? _venceEnDias; // null = el día antes de la siguiente

  int _i = 0;
  bool _adelante = true;
  bool _ocupado = false;

  bool get _admin => widget.modo != ModoTarea.proponer;

  List<_Paso> get _pasos => [
    if (widget.modo == ModoTarea.crear || widget.modo == ModoTarea.duplicar) _Paso.tipo,
    if ((widget.modo == ModoTarea.crear || widget.modo == ModoTarea.duplicar) && _recurrente == true) _Paso.repeticion,
    _Paso.titulo,
    _Paso.area,
    if (_admin) _Paso.puntos,
    if (_recurrente != true) _Paso.fecha,
    if ((widget.modo == ModoTarea.crear || widget.modo == ModoTarea.duplicar) && _recurrente != true) _Paso.personas,
    _Paso.revisar,
  ];

  _Paso get _paso => _pasos[_i.clamp(0, _pasos.length - 1)];

  @override
  void dispose() {
    _titulo.dispose();
    _notas.dispose();
    super.dispose();
  }

  void _ir(int d) {
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = d > 0;
      _i = (_i + d).clamp(0, _pasos.length - 1);
    });
  }

  bool get _puedeSeguir => switch (_paso) {
    _Paso.tipo => _recurrente != null,
    _Paso.titulo => _titulo.text.trim().length >= 3,
    _Paso.area => _area != null,
    _Paso.fecha => _fecha != null,
    _ => true,
  };

  String get _tituloAsistente => switch (widget.modo) {
    ModoTarea.crear => 'Nueva tarea',
    ModoTarea.editar => 'Editar tarea',
    ModoTarea.duplicar => 'Duplicar tarea',
    ModoTarea.proponer => 'Proponer tarea',
  };

  Future<void> _guardar() async {
    setState(() => _ocupado = true);
    final repo = widget.repo;
    final titulo = _titulo.text.trim(), notas = _notas.text.trim(), area = _area ?? 'Otro';
    final m = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      switch (widget.modo) {
        case ModoTarea.proponer:
          await repo.proponer(titulo: titulo, notas: notas, area: area, vence: _fecha!);
        case ModoTarea.editar:
          await repo.editar(
            widget.base!,
            titulo: titulo,
            notas: notas,
            area: area,
            puntos: _puntos,
            cupos: _cupos,
            vence: _fecha,
            siguientes: widget.siguientes,
          );
        case ModoTarea.crear || ModoTarea.duplicar:
          await repo.crear(
            titulo: titulo,
            notas: notas,
            area: area,
            puntos: _puntos,
            cupos: _cupos,
            vence: _fecha,
            recurrente: _recurrente == true,
            unidad: _unidad,
            cadaN: _cadaN,
            inicio: _inicio,
            venceEnDias: _venceEnDias,
            asignarA: _personas.toList(),
          );
      }
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(switch (widget.modo) {
              ModoTarea.editar => 'Cambios guardados',
              ModoTarea.proponer => 'Tarea creada y asignada a ti',
              _ => 'Tarea creada',
            }),
          ),
        );
      nav.pop();
    } catch (e) {
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ultimo = _paso == _Paso.revisar;
    return Asistente(
      titulo: _tituloAsistente,
      indice: _i,
      total: _pasos.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: _tituloPaso,
      ayuda: _ayuda,
      cuerpo: _cuerpo(context),
      ocupado: _ocupado,
      textoBoton: _paso == _Paso.tipo
          ? null
          : ultimo
          ? (widget.modo == ModoTarea.editar ? 'Guardar cambios' : (widget.modo == ModoTarea.proponer ? 'Crear y asignármela' : 'Crear tarea'))
          : (_paso == _Paso.personas && _personas.isEmpty ? 'Dejarla libre' : 'Continuar'),
      alContinuar: _puedeSeguir ? (ultimo ? _guardar : () => _ir(1)) : null,
    );
  }

  String get _tituloPaso => switch (_paso) {
    _Paso.tipo => '¿Se hace una vez o se repite?',
    _Paso.repeticion => '¿Cada cuánto se repite?',
    _Paso.titulo => '¿Qué hay que hacer?',
    _Paso.area => '¿De qué área es?',
    _Paso.puntos => 'Puntos y cupos',
    _Paso.fecha => 'Fecha límite',
    _Paso.personas => '¿A quién se la asignas?',
    _Paso.revisar => 'Revisa y confirma',
  };

  String? get _ayuda => switch (_paso) {
    _Paso.tipo => 'Una recurrente se crea sola cada cierto tiempo (cada semana, cada mes, cada 6 meses…). Puedes pausarla o terminarla cuando quieras.',
    _Paso.repeticion => 'Elige cada cuánto aparece en el tablero, desde qué día y cuándo vence cada vez.',
    _Paso.titulo => widget.modo == ModoTarea.proponer ? 'Queda asignada a ti. Los puntos los define admin al aprobarla.' : null,
    _Paso.puntos => 'Los puntos se suman al aprobarla. Los cupos son cuántas personas pueden tomarla.',
    _Paso.fecha => widget.siguientes ? 'La fecha cambia solo en la de este mes.' : null,
    _Paso.personas => 'Opcional. Si no eliges a nadie, queda libre en el tablero para que alguien la tome.',
    _ => null,
  };

  Widget _cuerpo(BuildContext context) {
    final p = context.pivot;
    return switch (_paso) {
      _Paso.tipo => ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        children: [
          OpcionAsistente(
            icono: Icons.event_available_rounded,
            titulo: 'Una vez',
            texto: 'Con su propia fecha límite.',
            activa: _recurrente == false,
            alTocar: () {
              setState(() => _recurrente = false);
              _ir(1);
            },
          ),
          OpcionAsistente(
            icono: Icons.event_repeat_rounded,
            titulo: 'Recurrente',
            texto: 'Se repite sola cada cierto tiempo: tú eliges cada cuánto.',
            activa: _recurrente == true,
            alTocar: () {
              setState(() => _recurrente = true);
              _ir(1);
            },
          ),
        ],
      ),
      _Paso.titulo => ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        children: [
          TextField(
            controller: _titulo,
            autofocus: true,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Título', hintText: 'Ej. Llevar el botiquín al partido'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _notas,
            maxLength: 1000,
            minLines: 3,
            maxLines: 8,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Detalles (opcional)', hintText: 'Qué incluye, a quién avisar, enlaces…', alignLabelWithHint: true),
          ),
        ],
      ),
      _Paso.area => ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        children: [
          for (final a in AreaTarea.lista)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _OpcionArea(
                area: a,
                activa: _area == a.nombre,
                alTocar: () {
                  setState(() => _area = a.nombre);
                  _ir(1);
                },
              ),
            ),
        ],
      ),
      _Paso.puntos => ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        children: [
          _Contador(
            titulo: 'Puntos',
            texto: 'Al aprobarla, para cada persona',
            valor: _puntos,
            min: 0,
            max: 100,
            alCambiar: (v) => setState(() => _puntos = v),
          ),
          const SizedBox(height: 12),
          _Contador(titulo: 'Cupos', texto: 'Personas que pueden tomarla', valor: _cupos, min: 1, max: 30, alCambiar: (v) => setState(() => _cupos = v)),
        ],
      ),
      _Paso.repeticion => _repeticion(context),
      _Paso.fecha => ListView(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 20),
        children: [
          CalendarDatePicker(
            initialDate: _fecha,
            firstDate: _fecha != null && _fecha!.isBefore(Fechas.hoy()) ? _fecha! : Fechas.hoy(),
            lastDate: Fechas.hoy().add(const Duration(days: 730)),
            onDateChanged: (d) => setState(() => _fecha = d),
          ),
          AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: _fecha == null ? 0 : 1,
            child: Text(
              _fecha == null ? '' : 'Vence el ${Fechas.dia(_fecha!).toLowerCase()} ${Fechas.corta(_fecha!)}.',
              textAlign: TextAlign.center,
              style: TextStyle(color: p.textoSecundario),
            ),
          ),
        ],
      ),
      _Paso.personas => _ListaPersonas(repo: widget.repo, elegidas: _personas, maximo: _cupos, alCambiar: () => setState(() {})),
      _Paso.revisar => ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        children: [
          GrupoAjustes(
            filas: [
              FilaAjuste(icono: Icons.title_rounded, titulo: 'Título', valor: _titulo.text.trim(), alTocar: () => _saltar(_Paso.titulo)),
              if (_notas.text.trim().isNotEmpty)
                FilaAjuste(icono: Icons.notes_rounded, titulo: 'Detalles', valor: _notas.text.trim(), alTocar: () => _saltar(_Paso.titulo)),
              FilaAjuste(icono: AreaTarea.de(_area ?? 'Otro').icono, titulo: 'Área', valor: _area ?? '', alTocar: () => _saltar(_Paso.area)),
              if (_pasos.contains(_Paso.tipo))
                FilaAjuste(
                  icono: Icons.repeat_rounded,
                  titulo: 'Se hace',
                  valor: _recurrente == true ? '${textoFrecuencia(_unidad, _cadaN)} · desde el ${Fechas.corta(_inicio)}' : 'Una vez',
                  alTocar: () => _saltar(_Paso.tipo),
                ),
              if (_admin)
                FilaAjuste(
                  icono: Icons.stars_rounded,
                  titulo: 'Puntos y cupos',
                  valor: '${textoPuntos(_puntos)} · ${_cupos == 1 ? '1 cupo' : '$_cupos cupos'}',
                  alTocar: () => _saltar(_Paso.puntos),
                ),
              if (_pasos.contains(_Paso.fecha))
                FilaAjuste(
                  icono: Icons.event_rounded,
                  titulo: 'Fecha límite',
                  valor: _fecha == null ? '' : Fechas.corta(_fecha!),
                  alTocar: () => _saltar(_Paso.fecha),
                ),
              if (_pasos.contains(_Paso.personas))
                FilaAjuste(
                  icono: Icons.group_rounded,
                  titulo: 'Asignada a',
                  valor: _personas.isEmpty ? 'Libre en el tablero' : _nombres(),
                  alTocar: () => _saltar(_Paso.personas),
                ),
            ],
          ),
          if (widget.siguientes)
            Text('Los cambios se aplican a la de este mes y a las que se creen después.', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
        ],
      ),
    };
  }

  String _nombres() {
    final eq = EquipoRepo.de(widget.repo.sesion);
    return [for (final u in _personas) eq.persona(u)?.nombreMostrar ?? u].join(', ');
  }

  void _saltar(_Paso paso) {
    final j = _pasos.indexOf(paso);
    if (j < 0) return;
    setState(() {
      _adelante = false;
      _i = j;
    });
  }

  Widget _repeticion(BuildContext context) {
    final p = context.pivot;
    final rapida = _frecuencias.any((f) => f.$1 == _unidad && f.$2 == _cadaN);
    Text titulo(String t) => Text(
      t,
      style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
    );
    final siguiente = switch (_unidad) {
      'dia' => _inicio.add(Duration(days: _cadaN)),
      'semana' => _inicio.add(Duration(days: 7 * _cadaN)),
      _ => DateTime(_inicio.year, _inicio.month + _cadaN, _inicio.day),
    };
    final vence = _venceEnDias == null ? siguiente.subtract(const Duration(days: 1)) : _inicio.add(Duration(days: _venceEnDias!));
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      children: [
        titulo('Frecuencia'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (u, n, t) in _frecuencias)
              ChoiceChip(
                showCheckmark: false,
                label: Text(t),
                selected: _unidad == u && _cadaN == n,
                onSelected: (_) => setState(() {
                  _unidad = u;
                  _cadaN = n;
                }),
              ),
            ChoiceChip(
              showCheckmark: false,
              label: Text(rapida ? 'Otra' : textoFrecuencia(_unidad, _cadaN)),
              selected: !rapida,
              onSelected: (_) => _otraFrecuencia(),
            ),
          ],
        ),
        const SizedBox(height: 20),
        titulo('Aparece por primera vez'),
        const SizedBox(height: 4),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.event_rounded, color: p.marcaTexto),
          title: Text('${Fechas.dia(_inicio)} ${Fechas.corta(_inicio)}'),
          subtitle: Text(_unidad == 'mes' ? 'Después, el día ${_inicio.day} de cada vez.' : 'Después, contando desde ese día.'),
          trailing: const Icon(Icons.edit_calendar_rounded),
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: _inicio,
              firstDate: Fechas.hoy(),
              lastDate: Fechas.hoy().add(const Duration(days: 365)),
            );
            if (d != null) setState(() => _inicio = d);
          },
        ),
        const SizedBox(height: 12),
        titulo('Cada vez vence'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ChoiceChip(
              showCheckmark: false,
              label: const Text('Antes de la siguiente'),
              selected: _venceEnDias == null,
              onSelected: (_) => setState(() => _venceEnDias = null),
            ),
            for (final d in const [3, 7, 15])
              ChoiceChip(showCheckmark: false, label: Text('A los $d días'), selected: _venceEnDias == d, onSelected: (_) => setState(() => _venceEnDias = d)),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          'La primera vez aparece el ${Fechas.corta(_inicio)} y vence el ${Fechas.corta(vence)}. La siguiente aparece el ${Fechas.corta(siguiente)}.',
          style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
        ),
      ],
    );
  }

  Future<void> _otraFrecuencia() async {
    var n = _cadaN;
    var u = _unidad;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (hoja) => StatefulBuilder(
        builder: (hoja, refrescar) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Repetir cada…', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton.filledTonal(onPressed: n > 1 ? () => refrescar(() => n--) : null, icon: const Icon(Icons.remove_rounded)),
                    SizedBox(
                      width: 64,
                      child: Text(
                        '$n',
                        textAlign: TextAlign.center,
                        style: Theme.of(hoja).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    IconButton.filledTonal(onPressed: n < 365 ? () => refrescar(() => n++) : null, icon: const Icon(Icons.add_rounded)),
                  ],
                ),
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: 'dia', label: Text('Días')),
                    ButtonSegment(value: 'semana', label: Text('Semanas')),
                    ButtonSegment(value: 'mes', label: Text('Meses')),
                  ],
                  selected: {u},
                  onSelectionChanged: (s) => refrescar(() => u = s.first),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: () => Navigator.of(hoja).pop(true), child: Text(textoFrecuencia(u, n))),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok == true && mounted) {
      setState(() {
        _unidad = u;
        _cadaN = n;
      });
    }
  }
}

class _OpcionArea extends StatelessWidget {
  const _OpcionArea({required this.area, required this.activa, required this.alTocar});
  final AreaTarea area;
  final bool activa;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final (degradado, sobre) = PivotPaleta.seccion(area.seccion, Theme.of(context).brightness);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: activa ? p.suave : p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        border: Border.all(color: activa ? p.marca : p.tarjeta, width: 1.5),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: alTocar,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip + 2)),
                  child: Icon(area.icono, size: 20, color: sobre),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    area.nombre,
                    style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: p.texto),
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Contador extends StatelessWidget {
  const _Contador({required this.titulo, required this.texto, required this.valor, required this.min, required this.max, required this.alCambiar});
  final String titulo;
  final String texto;
  final int valor;
  final int min;
  final int max;
  final ValueChanged<int> alCambiar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                ),
                Text(texto, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              ],
            ),
          ),
          IconButton.outlined(onPressed: valor > min ? () => alCambiar(valor - 1) : null, icon: const Icon(Icons.remove_rounded)),
          SizedBox(
            width: 48,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 160),
              transitionBuilder: (c, a) => FadeTransition(
                opacity: a,
                child: ScaleTransition(scale: Tween(begin: 0.8, end: 1.0).animate(a), child: c),
              ),
              child: Text(
                '$valor',
                key: ValueKey(valor),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: p.texto),
              ),
            ),
          ),
          IconButton.outlined(onPressed: valor < max ? () => alCambiar(valor + 1) : null, icon: const Icon(Icons.add_rounded)),
        ],
      ),
    );
  }
}

/// Lista de personas activas del equipo con casillas (hasta [maximo]).
class _ListaPersonas extends StatefulWidget {
  const _ListaPersonas({required this.repo, required this.elegidas, required this.maximo, required this.alCambiar});
  final TareasRepo repo;
  final Set<String> elegidas;
  final int maximo;
  final VoidCallback alCambiar;

  @override
  State<_ListaPersonas> createState() => _ListaPersonasState();
}

class _ListaPersonasState extends State<_ListaPersonas> {
  late final eq = EquipoRepo.de(widget.repo.sesion);
  String _q = '';

  @override
  void initState() {
    super.initState();
    if (eq.personas == null) eq.cargar();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return ListenableBuilder(
      listenable: eq,
      builder: (context, _) {
        final todas = eq.personas;
        if (todas == null) {
          return eq.error != null
              ? Center(
                  child: Text(eq.error!, style: TextStyle(color: p.textoSecundario)),
                )
              : const Center(child: PivotCargando());
        }
        final q = _q.trim().toLowerCase();
        final lista = [
          for (final x in todas)
            if (!x.inactivx && (q.isEmpty || x.nombreMostrar.toLowerCase().contains(q) || x.username.toLowerCase().contains(q))) x,
        ]..sort((a, b) => a.nombreMostrar.toLowerCase().compareTo(b.nombreMostrar.toLowerCase()));
        final lleno = widget.elegidas.length >= widget.maximo;
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: TextField(
                onChanged: (v) => setState(() => _q = v),
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Buscar'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('${widget.elegidas.length} de ${widget.maximo} cupos', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                children: [
                  for (final x in lista)
                    CheckboxListTile(
                      value: widget.elegidas.contains(x.username),
                      onChanged: !widget.elegidas.contains(x.username) && lleno
                          ? null
                          : (si) {
                              si == true ? widget.elegidas.add(x.username) : widget.elegidas.remove(x.username);
                              widget.alCambiar();
                              setState(() {});
                            },
                      secondary: AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: 36),
                      title: Text(x.nombreMostrar),
                      subtitle: Text(x.grupo),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Hoja para asignar personas a una tarea existente (admins).
Future<Set<String>?> elegirPersonas(BuildContext context, {required TareasRepo repo, required Set<String> iniciales, required int maximo}) {
  final elegidas = {...iniciales};
  return showModalBottomSheet<Set<String>>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (c) => SizedBox(
      height: MediaQuery.of(c).size.height * 0.8,
      child: StatefulBuilder(
        builder: (c, set) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
              child: Text('Asignar personas', style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            ),
            Expanded(
              child: _ListaPersonas(repo: repo, elegidas: elegidas, maximo: maximo, alCambiar: () => set(() {})),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => Navigator.pop(c, elegidas),
                  child: const Text('Guardar'),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
