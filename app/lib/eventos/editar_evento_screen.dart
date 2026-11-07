import 'package:flutter/material.dart';

import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'nuevo_lugar_screen.dart';
import 'selector_fechas.dart';

enum _Paso { cambios, alcance }

/// Edición de un evento (solo admins), como asistente de 2 pasos con el
/// marco común (pedido 2026-11-07): 1) qué cambia (lugar, horario,
/// información adicional), 2) a qué eventos aplica ("Solo este evento",
/// "Un período" hasta una fecha o "Desde este en adelante"). Mismos campos y
/// alcances que la web; el lugar se elige en una hoja con buscador.
class EditarEventoScreen extends StatefulWidget {
  const EditarEventoScreen({super.key, required this.repo, required this.evento});
  final EventosRepo repo;
  final Evento evento;

  @override
  State<EditarEventoScreen> createState() => _EditarEventoScreenState();
}

class _EditarEventoScreenState extends State<EditarEventoScreen> {
  _Paso _paso = _Paso.cambios;
  bool _adelante = true;
  late String _lugar = widget.evento.lugar;
  late String _inicio = widget.evento.horaInicio;
  late String _fin = widget.evento.horaFin;
  late final _descripcion = TextEditingController(text: widget.evento.descripcion);
  AlcanceEdicion _alcance = AlcanceEdicion.individual;
  DateTime? _hasta;
  List<Lugar>? _lugares;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    _cargarLugares();
  }

  Future<void> _cargarLugares() async {
    try {
      final l = await widget.repo.lugares();
      if (mounted) setState(() => _lugares = l);
    } catch (_) {
      if (mounted) setState(() => _lugares = const []);
    }
  }

  @override
  void dispose() {
    _descripcion.dispose();
    super.dispose();
  }

  Evento get _ev => widget.evento;

  bool get _cambiaLugar => _lugar != _ev.lugar;
  bool get _cambiaHorario => _inicio != _ev.horaInicio || _fin != _ev.horaFin;
  bool get _cambiaInfo => _descripcion.text.trim() != _ev.descripcion.trim();
  bool get _hayCambios => _cambiaLugar || _cambiaHorario || _cambiaInfo;

  void _ir(int delta) {
    if (_paso.index + delta < 0) {
      Navigator.of(context).pop();
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = delta > 0;
      _paso = _Paso.values[_paso.index + delta];
    });
  }

  Future<void> _elegirHora(bool esInicio) async {
    TimeOfDay? inicial;
    final p = (esInicio ? _inicio : _fin).split(':');
    if (p.length >= 2) inicial = TimeOfDay(hour: int.tryParse(p[0]) ?? 19, minute: int.tryParse(p[1]) ?? 0);
    final h = await showTimePicker(context: context, initialTime: inicial ?? const TimeOfDay(hour: 19, minute: 0));
    if (h == null) return;
    final texto = '${h.hour.toString().padLeft(2, '0')}:${h.minute.toString().padLeft(2, '0')}';
    setState(() => esInicio ? _inicio = texto : _fin = texto);
  }

  /// Hoja con buscador para cambiar de lugar (en vez del desplegable).
  Future<void> _elegirLugar() async {
    final elegido = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _HojaLugares(lugares: _lugares, actual: _lugar, alAgregar: _agregarLugar),
    );
    if (elegido != null && mounted) setState(() => _lugar = elegido);
  }

  Future<String?> _agregarLugar(BuildContext hoja) async {
    final nuevo = await Navigator.of(hoja).push<Map<String, dynamic>>(MaterialPageRoute(builder: (_) => NuevoLugarScreen(repo: widget.repo)));
    if (nuevo == null) return null;
    await _cargarLugares();
    return (nuevo['lugar'] ?? '').toString();
  }

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      await widget.repo.editar(
        _ev,
        lugar: _cambiaLugar ? _lugar : null,
        horaInicio: _inicio != _ev.horaInicio ? _inicio : null,
        horaFin: _fin != _ev.horaFin ? _fin : null,
        descripcion: _cambiaInfo ? _descripcion.text.trim() : null,
        alcance: _alcance,
        hasta: _hasta,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _guardando = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cambios = _paso == _Paso.cambios;
    return Asistente(
      titulo: 'Editar evento',
      indice: _paso.index,
      total: _Paso.values.length,
      tituloPaso: cambios ? '¿Qué quieres cambiar?' : '¿A qué eventos aplica?',
      ayuda: cambios ? '${_ev.tipo} · ${Fechas.encabezado(_ev.fecha)}' : null,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      cuerpo: cambios ? _pasoCambios(context) : _pasoAlcance(context),
      textoBoton: cambios ? 'Siguiente' : 'Guardar cambios',
      alContinuar: cambios ? (_hayCambios ? () => _ir(1) : null) : (_alcance == AlcanceEdicion.periodo && _hasta == null ? null : _guardar),
      ocupado: _guardando,
    );
  }

  Widget _pasoCambios(BuildContext context) {
    final p = context.pivot;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _titulo(p, 'Lugar', _cambiaLugar),
        Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          child: InkWell(
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            onTap: _lugares == null ? null : _elegirLugar,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(Icons.place_outlined, color: p.marcaTexto),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      _lugar,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                    ),
                  ),
                  _lugares == null
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(
                          'Cambiar',
                          style: TextStyle(fontWeight: FontWeight.w600, color: p.marcaTexto),
                        ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 22),
        _titulo(p, 'Horario', _cambiaHorario),
        Row(
          children: [
            Expanded(child: _campoHora(p, 'Empieza', _inicio, () => _elegirHora(true))),
            const SizedBox(width: 12),
            Expanded(child: _campoHora(p, 'Termina', _fin, () => _elegirHora(false))),
          ],
        ),
        const SizedBox(height: 22),
        _titulo(p, 'Información adicional', _cambiaInfo),
        TextField(
          controller: _descripcion,
          minLines: 2,
          maxLines: 5,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'Ej.: trae protecciones completas'),
        ),
      ],
    );
  }

  Widget _pasoAlcance(BuildContext context) {
    final p = context.pivot;
    final resumen = [
      if (_cambiaLugar) 'Lugar: ${_ev.lugar} → $_lugar',
      if (_cambiaHorario) 'Horario: ${_ev.rangoHorario} → $_inicio${_fin.isEmpty ? '' : ' – $_fin'}',
      if (_cambiaInfo) 'Información adicional',
    ];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(color: p.apagadoFondo, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Cambias',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.textoSecundario),
              ),
              const SizedBox(height: 4),
              for (final r in resumen) Text(r, style: TextStyle(fontSize: 14, height: 1.5, color: p.texto)),
            ],
          ),
        ),
        OpcionAsistente(
          icono: Icons.event_outlined,
          titulo: 'Solo este evento',
          texto: Fechas.encabezado(_ev.fecha),
          activa: _alcance == AlcanceEdicion.individual,
          alTocar: () => setState(() => _alcance = AlcanceEdicion.individual),
        ),
        OpcionAsistente(
          icono: Icons.date_range_rounded,
          titulo: 'Un período',
          texto: 'Desde este evento hasta la fecha que elijas',
          activa: _alcance == AlcanceEdicion.periodo,
          alTocar: () => setState(() => _alcance = AlcanceEdicion.periodo),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: _alcance == AlcanceEdicion.periodo
              ? Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    children: [
                      SelectorFechas(desde: _hasta, deshabilitado: (d) => d.isBefore(_ev.fecha), alCambiar: (d, _) => setState(() => _hasta = d)),
                      Text(
                        _hasta == null ? 'Toca hasta qué día aplicar el cambio.' : 'Hasta el ${Fechas.corta(_hasta!)}',
                        style: TextStyle(fontWeight: FontWeight.w600, color: p.marcaTexto),
                      ),
                    ],
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
        OpcionAsistente(
          icono: Icons.all_inclusive_rounded,
          titulo: 'Desde este en adelante',
          texto: 'Cambia también la regla del lugar para los próximos',
          activa: _alcance == AlcanceEdicion.desdeAqui,
          alTocar: () => setState(() => _alcance = AlcanceEdicion.desdeAqui),
        ),
      ],
    );
  }

  Widget _titulo(PivotPaleta p, String t, bool cambiado) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      children: [
        Text(
          t,
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.texto),
        ),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: cambiado
              ? Padding(
                  key: const ValueKey('cambiado'),
                  padding: const EdgeInsets.only(left: 8),
                  child: Text(
                    '· modificado',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: p.marcaTexto),
                  ),
                )
              : const SizedBox.shrink(),
        ),
      ],
    ),
  );

  Widget _campoHora(PivotPaleta p, String etiqueta, String valor, VoidCallback alTocar) {
    return Material(
      color: p.tarjeta,
      borderRadius: BorderRadius.circular(PivotRadios.boton),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.boton),
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(etiqueta, style: TextStyle(fontSize: 12, color: p.textoSecundario)),
              Text(
                valor.isEmpty ? '—' : valor,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: p.texto),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Hoja para elegir lugar: buscador + lista (el actual marcado) + "Agregar lugar".
class _HojaLugares extends StatefulWidget {
  const _HojaLugares({required this.lugares, required this.actual, required this.alAgregar});
  final List<Lugar>? lugares;
  final String actual;
  final Future<String?> Function(BuildContext hoja) alAgregar;

  @override
  State<_HojaLugares> createState() => _HojaLugaresState();
}

class _HojaLugaresState extends State<_HojaLugares> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final nombres = {...?widget.lugares?.map((l) => l.nombre), widget.actual}.where((l) => l.isNotEmpty).toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    final lista = nombres.where((n) => _q.isEmpty || n.toLowerCase().contains(_q.toLowerCase())).toList();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.92,
      builder: (context, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              decoration: const InputDecoration(hintText: 'Buscar lugar', prefixIcon: Icon(Icons.search_rounded), isDense: true),
              onChanged: (v) => setState(() => _q = v.trim()),
            ),
          ),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                for (final n in lista)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Material(
                      color: n == widget.actual ? p.suave : p.tarjeta,
                      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                        onTap: () => Navigator.of(context).pop(n),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          child: Row(
                            children: [
                              Icon(Icons.place_outlined, color: n == widget.actual ? p.sobreSuave : p.marcaTexto),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Text(
                                  n,
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: n == widget.actual ? p.sobreSuave : p.texto),
                                ),
                              ),
                              if (n == widget.actual) Icon(Icons.check_rounded, color: p.sobreSuave),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                if (lista.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text('Ningún lugar coincide.', style: TextStyle(color: p.textoSecundario)),
                  ),
                TextButton.icon(
                  onPressed: () async {
                    final nav = Navigator.of(context);
                    final nuevo = await widget.alAgregar(context);
                    if (nuevo != null && nuevo.isNotEmpty) nav.pop(nuevo);
                  },
                  icon: const Icon(Icons.add_location_alt_outlined),
                  label: const Text('Agregar lugar'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
