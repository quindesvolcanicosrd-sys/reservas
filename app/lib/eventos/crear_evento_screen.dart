import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'selector_fechas.dart';

enum _Paso { tipo, lugar, detalles, frecuencia, fecha, hora }

/// "Nuevo evento" (solo admins). Mismos pasos que el asistente de la web
/// (`irEvCrear()`): Tipo → Lugar → Detalles → Frecuencia → Fecha → Horario.
/// "Temporada de descanso" queda fuera: en la web todavía no guarda.
class CrearEventoScreen extends StatefulWidget {
  const CrearEventoScreen({super.key, required this.repo});
  final EventosRepo repo;

  @override
  State<CrearEventoScreen> createState() => _CrearEventoScreenState();
}

class _CrearEventoScreenState extends State<CrearEventoScreen> {
  _Paso _paso = _Paso.tipo;
  bool _adelante = true;

  bool? _recurrente;
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
    _cargarVenues();
  }

  @override
  void dispose() {
    _otro.dispose();
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

  List<_Paso> get _pasos => [_Paso.tipo, _Paso.lugar, _Paso.detalles, if (_recurrente == true) _Paso.frecuencia, if (!_porSemana) _Paso.fecha, _Paso.hora];

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

  // ─── Construcción ───────────────────────────────────────────────────────

  static const _titulos = {
    _Paso.tipo: 'Tipo de evento',
    _Paso.lugar: 'Seleccionar lugar',
    _Paso.detalles: 'Detalles del evento',
    _Paso.frecuencia: 'Frecuencia',
    _Paso.fecha: 'Fecha del evento',
    _Paso.hora: 'Horario',
  };

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final pasos = _pasos;
    final idx = pasos.indexOf(_paso);
    final ultimo = idx == pasos.length - 1;
    return PopScope(
      canPop: _paso == _Paso.tipo,
      onPopInvokedWithResult: (hecho, _) {
        if (!hecho) _ir(-1);
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), tooltip: 'Atrás', onPressed: () => _ir(-1)),
          title: AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: Text(_titulos[_paso]!, key: ValueKey(_paso)),
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(12),
            child: Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < pasos.length; i++)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: i == idx ? 20 : 8,
                      height: 4,
                      decoration: BoxDecoration(color: i <= idx ? p.marca : p.tarjetaBorde, borderRadius: BorderRadius.circular(PivotRadios.chip)),
                    ),
                ],
              ),
            ),
          ),
        ),
        body: AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          transitionBuilder: (c, a) => FadeTransition(
            opacity: a,
            child: SlideTransition(
              position: Tween(begin: Offset(_adelante ? 0.08 : -0.08, 0), end: Offset.zero).animate(a),
              child: c,
            ),
          ),
          child: KeyedSubtree(key: ValueKey(_paso), child: _contenido(context)),
        ),
        bottomNavigationBar: _paso == _Paso.tipo
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    onPressed: !_valido(_paso) || _guardando ? null : (ultimo ? _guardar : () => _ir(1)),
                    child: _guardando
                        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: p.sobreMarca))
                        : Text(ultimo ? 'Crear evento' : 'Siguiente'),
                  ),
                ),
              ),
      ),
    );
  }

  Widget _contenido(BuildContext context) => switch (_paso) {
    _Paso.tipo => _pasoTipo(context),
    _Paso.lugar => _pasoLugar(context),
    _Paso.detalles => _pasoDetalles(context),
    _Paso.frecuencia => _pasoFrecuencia(context),
    _Paso.fecha => _pasoFecha(context),
    _Paso.hora => _pasoHora(context),
  };

  Widget _tarjetaOpcion(
    BuildContext context, {
    required IconData icono,
    required String titulo,
    required String texto,
    required bool activa,
    required VoidCallback alTocar,
  }) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: activa ? p.suave : p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: alTocar,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                Icon(icono, size: 30, color: p.marcaTexto),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titulo,
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                      ),
                      const SizedBox(height: 2),
                      Text(texto, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _pasoTipo(BuildContext context) {
    void elegir(bool recurrente) {
      setState(() => _recurrente = recurrente);
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
    if (_venues == null) return const Center(child: CircularProgressIndicator());
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
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text('Para agregar un lugar nuevo, por ahora usa la web.', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
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
          decoration: const InputDecoration(hintText: 'Ej.: trae protecciones completas'),
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
