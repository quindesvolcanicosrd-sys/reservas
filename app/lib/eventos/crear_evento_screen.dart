import 'package:flutter/material.dart';

import '../core/asistente.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'nuevo_lugar_screen.dart';
import 'selector_fechas.dart';
import '../core/cargando.dart';

enum _Paso { tipo, lugar, detalles, frecuencia, fecha, hora, descanso }

/// "Nuevo evento" (solo admins). Mismos pasos que el asistente de la web
/// (`irEvCrear()`): Tipo → Lugar → Detalles → Frecuencia → Fecha → Horario.
/// "Temporada de descanso": nombre + fechas; el servidor elimina los
/// eventos de ese período y avisa al equipo (`adminGuardarTemporadaDescanso`).
class CrearEventoScreen extends StatefulWidget {
  const CrearEventoScreen({super.key, required this.repo, this.temporada});
  final EventosRepo repo;

  /// Editar una temporada de descanso existente (solo ese paso).
  final Temporada? temporada;

  @override
  State<CrearEventoScreen> createState() => _CrearEventoScreenState();
}

class _CrearEventoScreenState extends State<CrearEventoScreen> {
  _Paso _paso = _Paso.tipo;
  bool _adelante = true;

  bool? _recurrente;
  bool _descanso = false;
  final _nombreDescanso = TextEditingController();
  DateTime? _descDesde;
  DateTime? _descHasta;
  List<Map<String, dynamic>>? _venues;
  String? _errorVenues;
  Map<String, dynamic>? _venue;
  String _busqueda = '';
  String? _categoria;
  final _otro = TextEditingController();
  final _descripcion = TextEditingController();
  String _unidad = 'semanas';
  int _cantidad = 1;
  final Set<int> _dias = {1};
  DateTime? _fecha;
  TimeOfDay _inicio = const TimeOfDay(hour: 19, minute: 0);
  TimeOfDay? _fin;
  bool _guardando = false;

  static const _categorias = ['Entrenamiento', 'Partido', 'Evento', 'Otro'];
  static const _diasCortos = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  static const _diasPlural = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

  @override
  void initState() {
    super.initState();
    final t = widget.temporada;
    if (t != null) {
      _descanso = true;
      _paso = _Paso.descanso;
      _nombreDescanso.text = t.nombre;
      _descDesde = t.desde;
      _descHasta = t.hasta;
      return;
    }
    _cargarVenues();
  }

  @override
  void dispose() {
    _otro.dispose();
    _nombreDescanso.dispose();
    _descripcion.dispose();
    super.dispose();
  }

  Future<void> _cargarVenues() async {
    setState(() => _errorVenues = null);
    try {
      final v = await widget.repo.venues();
      if (mounted) setState(() => _venues = v);
    } catch (_) {
      if (mounted) setState(() => _errorVenues = 'No se pudieron cargar los lugares.');
    }
  }

  // ─── Flujo ──────────────────────────────────────────────────────────────

  bool get _porSemana => _recurrente == true && _unidad == 'semanas';

  List<_Paso> get _pasos => widget.temporada != null
      ? const [_Paso.descanso]
      : _descanso
      ? const [_Paso.tipo, _Paso.descanso]
      : [_Paso.tipo, _Paso.lugar, _Paso.detalles, if (_recurrente == true) _Paso.frecuencia, if (!_porSemana) _Paso.fecha, _Paso.hora];

  String get _tipoEvento {
    final c = _categoria ?? (_venue?['tipo_icono'] ?? 'Entrenamiento').toString();
    if (c == 'Otro') return _otro.text.trim().isEmpty ? 'Otro' : _otro.text.trim();
    return c;
  }

  bool _valido(_Paso p) => switch (p) {
    _Paso.tipo => _recurrente != null,
    _Paso.lugar => _venue != null,
    _Paso.detalles => _categoria != 'Otro' || _otro.text.trim().isNotEmpty,
    _Paso.frecuencia => _unidad != 'semanas' || _dias.isNotEmpty,
    _Paso.fecha => _fecha != null,
    _Paso.hora => true,
    _Paso.descanso => _descDesde != null && _descHasta != null,
  };

  void _ir(int delta) {
    final i = _pasos.indexOf(_paso) + delta;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= _pasos.length) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = delta > 0;
      _paso = _pasos[i];
    });
  }

  String _hhmm(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  String get _textoFrecuencia {
    if (_unidad == 'semanas') {
      final d = (_dias.toList()..sort()).map((x) => _diasPlural[x - 1]).toList();
      if (d.isEmpty) return 'Elige al menos un día.';
      final lista = d.length == 1 ? d.first : '${d.sublist(0, d.length - 1).join(', ')} y ${d.last}';
      return 'El evento será los $lista de cada semana.';
    }
    if (_unidad == 'meses') return _cantidad == 1 ? 'El evento ocurrirá cada mes.' : 'El evento ocurrirá cada $_cantidad meses.';
    return _cantidad == 1 ? 'El evento ocurrirá todos los días.' : 'El evento ocurrirá cada $_cantidad días.';
  }

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      final primera = await widget.repo.crear(
        venue: _venue!,
        tipoEvento: _tipoEvento,
        descripcion: _descripcion.text,
        tipoRecurrencia: _recurrente == false ? 'unico' : (_porSemana ? 'dias_semana' : 'cada_tantos'),
        dias: _dias.toList(),
        frecuencia: _cantidad,
        unidad: _unidad,
        fecha: _fecha,
        horaInicio: _hhmm(_inicio),
        horaFin: _fin == null ? null : _hhmm(_fin!),
      );
      if (mounted) Navigator.of(context).pop(primera ?? true);
    } catch (e) {
      if (mounted) {
        setState(() => _guardando = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo crear el evento: $e')));
      }
    }
  }

  Future<void> _guardarDescanso() async {
    setState(() => _guardando = true);
    try {
      final n = await widget.repo.guardarDescanso(id: widget.temporada?.id, nombre: _nombreDescanso.text, desde: _descDesde!, hasta: _descHasta!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${widget.temporada != null ? 'Temporada actualizada.' : 'Temporada creada. Se avisó al equipo.'} ${n == 0
                ? ''
                : n == 1
                ? 'Se eliminó 1 evento.'
                : 'Se eliminaron $n eventos.'}',
          ),
        ),
      );
      Navigator.of(context).pop({'descanso': _descDesde});
    } catch (e) {
      if (mounted) {
        setState(() => _guardando = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _agregarLugar() async {
    final nuevo = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(builder: (_) => NuevoLugarScreen(repo: widget.repo)));
    if (nuevo == null || !mounted) return;
    await _cargarVenues();
    if (!mounted) return;
    setState(() {
      _venue = nuevo;
      _categoria = _categorias.contains(nuevo['tipo_icono']) ? nuevo['tipo_icono'].toString() : _categoria;
    });
  }

  // ─── Construcción ───────────────────────────────────────────────────────

  static const _titulos = {
    _Paso.tipo: '¿Qué quieres crear?',
    _Paso.lugar: '¿Dónde será?',
    _Paso.detalles: 'Detalles',
    _Paso.frecuencia: '¿Cada cuánto se repite?',
    _Paso.fecha: '¿Qué día?',
    _Paso.hora: 'Horario',
    _Paso.descanso: 'Temporada de descanso',
  };

  String? get _ayuda => switch (_paso) {
    _Paso.tipo => null,
    _Paso.lugar => 'Elige un lugar o agrega uno nuevo.',
    _Paso.detalles => 'El tipo define el ícono y cómo se ve en el timeline.',
    _Paso.frecuencia => null,
    _Paso.fecha => _recurrente == true ? 'Desde esta fecha se cuenta la frecuencia.' : null,
    _Paso.hora => null,
    _Paso.descanso => 'Sin entrenamientos entre esas fechas: los eventos que ya existen se eliminan y se avisa al equipo.',
  };

  @override
  Widget build(BuildContext context) {
    final pasos = _pasos;
    final idx = pasos.indexOf(_paso);
    final ultimo = idx == pasos.length - 1;
    return Asistente(
      titulo: widget.temporada != null ? 'Editar temporada' : (_descanso ? 'Nueva temporada de descanso' : 'Nuevo evento'),
      indice: idx,
      total: _paso == _Paso.tipo ? 4 : pasos.length,
      tituloPaso: _titulos[_paso]!,
      ayuda: _ayuda,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      cuerpo: _contenido(context),
      textoBoton: _paso == _Paso.tipo
          ? null
          : (ultimo ? (_descanso ? (widget.temporada != null ? 'Guardar cambios' : 'Crear temporada') : 'Crear evento') : 'Siguiente'),
      alContinuar: !_valido(_paso) ? null : (ultimo ? (_descanso ? _guardarDescanso : _guardar) : () => _ir(1)),
      ocupado: _guardando,
    );
  }

  Widget _contenido(BuildContext context) => switch (_paso) {
    _Paso.tipo => _pasoTipo(context),
    _Paso.lugar => _pasoLugar(context),
    _Paso.detalles => _pasoDetalles(context),
    _Paso.frecuencia => _pasoFrecuencia(context),
    _Paso.fecha => _pasoFecha(context),
    _Paso.hora => _pasoHora(context),
    _Paso.descanso => _pasoDescanso(context),
  };

  Widget _pasoDescanso(BuildContext context) {
    final p = context.pivot;
    final hoy = Fechas.hoy();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _nombreDescanso,
          maxLength: 40,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Nombre (opcional)', hintText: 'Ej.: Vacaciones de fin de año'),
        ),
        SelectorFechas(
          desde: _descDesde,
          hasta: _descHasta,
          rango: true,
          deshabilitado: (d) => d.isBefore(hoy),
          alCambiar: (d, h) => setState(() {
            _descDesde = d;
            _descHasta = h;
          }),
        ),
        const SizedBox(height: 8),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: Text(
            _descDesde == null
                ? 'Toca el primer día y luego el último.'
                : _descHasta == null
                ? 'Desde el ${Fechas.corta(_descDesde!)}: ahora toca el último día.'
                : 'Del ${Fechas.corta(_descDesde!)} al ${Fechas.corta(_descHasta!)}',
            key: ValueKey('$_descDesde$_descHasta'),
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w600, color: p.marcaTexto),
          ),
        ),
      ],
    );
  }

  Widget _tarjetaOpcion(
    BuildContext context, {
    required IconData icono,
    required String titulo,
    required String texto,
    required bool activa,
    required VoidCallback alTocar,
  }) => OpcionAsistente(icono: icono, titulo: titulo, texto: texto, activa: activa, alTocar: alTocar);

  Widget _pasoTipo(BuildContext context) {
    void elegir(bool? recurrente) {
      setState(() {
        _descanso = recurrente == null;
        _recurrente = recurrente;
      });
      Future.delayed(const Duration(milliseconds: 150), () {
        if (mounted) _ir(1);
      });
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _tarjetaOpcion(
          context,
          icono: Icons.repeat_rounded,
          titulo: 'Recurrente',
          texto: 'Evento que se repetirá',
          activa: _recurrente == true,
          alTocar: () => elegir(true),
        ),
        _tarjetaOpcion(
          context,
          icono: Icons.event_outlined,
          titulo: 'Único',
          texto: 'Evento que ocurre una vez',
          activa: _recurrente == false,
          alTocar: () => elegir(false),
        ),
        if (widget.repo.sesion.esAdmin)
          _tarjetaOpcion(
            context,
            icono: Icons.bedtime_outlined,
            titulo: 'Temporada de descanso',
            texto: 'Un período sin entrenamientos',
            activa: _descanso,
            alTocar: () => elegir(null),
          ),
      ],
    );
  }

  Widget _pasoLugar(BuildContext context) {
    final p = context.pivot;
    if (_errorVenues != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_errorVenues!),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _cargarVenues, child: const Text('Reintentar')),
          ],
        ),
      );
    }
    if (_venues == null) return const Center(child: PivotCargando());
    // Un mismo lugar puede tener varias filas (una por horario): se muestra una vez.
    final vistos = <String>{};
    final q = _busqueda.trim().toLowerCase();
    final lista = [
      for (final v in _venues!)
        if (vistos.add(v['lugar'].toString().trim().toLowerCase()) && (q.isEmpty || v['lugar'].toString().toLowerCase().contains(q))) v,
    ];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          decoration: const InputDecoration(hintText: 'Buscar lugar', prefixIcon: Icon(Icons.search_rounded)),
          onChanged: (v) => setState(() => _busqueda = v),
        ),
        const SizedBox(height: 12),
        if (lista.isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('Ningún lugar coincide con la búsqueda.', style: TextStyle(color: p.textoSecundario)),
          ),
        for (final v in lista)
          _tarjetaOpcion(
            context,
            icono: Icons.place_outlined,
            titulo: v['lugar'].toString(),
            texto: (v['tipo_icono'] ?? '').toString(),
            activa: _venue != null && _venue!['lugar'] == v['lugar'],
            alTocar: () => setState(() {
              _venue = v;
              _categoria ??= _categorias.contains(v['tipo_icono']) ? v['tipo_icono'].toString() : null;
            }),
          ),
        _tarjetaOpcion(
          context,
          icono: Icons.add_location_alt_outlined,
          titulo: 'Agregar lugar',
          texto: 'Un lugar que todavía no está en la lista',
          activa: false,
          alTocar: _agregarLugar,
        ),
      ],
    );
  }

  Widget _pasoDetalles(BuildContext context) {
    final p = context.pivot;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Tipo de evento',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in _categorias)
              ChoiceChip(label: Text(c), selected: (_categoria ?? 'Entrenamiento') == c, onSelected: (_) => setState(() => _categoria = c)),
          ],
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          child: _categoria == 'Otro'
              ? Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: TextField(
                    controller: _otro,
                    autofocus: true,
                    decoration: const InputDecoration(labelText: '¿Qué tipo de evento es?'),
                    onChanged: (_) => setState(() {}),
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
        const SizedBox(height: 20),
        Text(
          'Información adicional (opcional)',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _descripcion,
          maxLength: 150,
          maxLines: null,
          decoration: const InputDecoration(hintText: 'Ej.: Traer botella de agua'),
        ),
      ],
    );
  }

  Widget _pasoFrecuencia(BuildContext context) {
    final p = context.pivot;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'dias', label: Text('Días')),
            ButtonSegment(value: 'semanas', label: Text('Semanas')),
            ButtonSegment(value: 'meses', label: Text('Meses')),
          ],
          selected: {_unidad},
          onSelectionChanged: (s) => setState(() => _unidad = s.first),
        ),
        const SizedBox(height: 20),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: _unidad == 'semanas'
              ? Row(key: const ValueKey('dias'), mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [for (var d = 1; d <= 7; d++) _circuloDia(p, d)])
              : Row(
                  key: const ValueKey('cantidad'),
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Cada', style: TextStyle(fontSize: 16, color: p.texto)),
                    IconButton(onPressed: _cantidad > 1 ? () => setState(() => _cantidad--) : null, icon: const Icon(Icons.remove_circle_outline_rounded)),
                    Text(
                      '$_cantidad',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: p.texto),
                    ),
                    IconButton(onPressed: _cantidad < 30 ? () => setState(() => _cantidad++) : null, icon: const Icon(Icons.add_circle_outline_rounded)),
                    Text(
                      _unidad == 'meses' ? (_cantidad == 1 ? 'mes' : 'meses') : (_cantidad == 1 ? 'día' : 'días'),
                      style: TextStyle(fontSize: 16, color: p.texto),
                    ),
                  ],
                ),
        ),
        const SizedBox(height: 16),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: Text(
            _textoFrecuencia,
            key: ValueKey(_textoFrecuencia),
            textAlign: TextAlign.center,
            style: TextStyle(color: p.textoSecundario),
          ),
        ),
      ],
    );
  }

  Widget _circuloDia(PivotPaleta p, int d) {
    final activo = _dias.contains(d);
    return InkWell(
      customBorder: const CircleBorder(),
      onTap: () => setState(() => activo ? _dias.remove(d) : _dias.add(d)),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: activo ? p.marca : null,
          shape: BoxShape.circle,
          border: Border.all(color: activo ? p.marca : p.borde),
        ),
        child: Text(
          _diasCortos[d - 1],
          style: TextStyle(fontWeight: FontWeight.w700, color: activo ? p.sobreMarca : p.texto),
        ),
      ),
    );
  }

  Widget _pasoFecha(BuildContext context) {
    final p = context.pivot;
    final hoy = Fechas.hoy();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_recurrente == true)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('Elige la fecha del primer evento: desde ahí se cuenta la frecuencia.', style: TextStyle(color: p.textoSecundario)),
          ),
        SelectorFechas(desde: _fecha, deshabilitado: _recurrente == false ? (d) => d.isBefore(hoy) : null, alCambiar: (d, _) => setState(() => _fecha = d)),
        const SizedBox(height: 8),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: Text(
            _fecha == null ? '' : Fechas.encabezado(_fecha!),
            key: ValueKey(_fecha),
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w600, color: p.marcaTexto),
          ),
        ),
      ],
    );
  }

  Widget _pasoHora(BuildContext context) {
    final p = context.pivot;
    Future<void> elegir(bool inicio) async {
      final h = await showTimePicker(
        context: context,
        initialTime: inicio ? _inicio : (_fin ?? _inicio.replacing(hour: (_inicio.hour + 2) % 24)),
      );
      if (h != null) setState(() => inicio ? _inicio = h : _fin = h);
    }

    Widget fila(String etiqueta, String valor, VoidCallback alTocar) => ListTile(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      tileColor: p.tarjeta,
      leading: Icon(Icons.schedule_rounded, color: p.marcaTexto),
      title: Text(etiqueta),
      trailing: Text(
        valor,
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: p.texto),
      ),
      onTap: alTocar,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        fila('Hora de inicio', _hhmm(_inicio), () => elegir(true)),
        const SizedBox(height: 10),
        fila('Hora de finalización', _fin == null ? 'Opcional' : _hhmm(_fin!), () => elegir(false)),
        const SizedBox(height: 20),
        Text(
          '$_tipoEvento en ${_venue?['lugar'] ?? ''}'
          '${_recurrente == true ? '\n${_porSemana ? _textoFrecuencia : '$_textoFrecuencia Primero: ${_fecha == null ? '' : Fechas.corta(_fecha!)}.'}' : (_fecha == null ? '' : '\n${Fechas.encabezado(_fecha!)}')}',
          textAlign: TextAlign.center,
          style: TextStyle(color: p.textoSecundario, height: 1.5),
        ),
      ],
    );
  }
}
