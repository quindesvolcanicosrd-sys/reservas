import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';

/// Edición de un evento (solo admins). Mismos campos y alcances que la web:
/// lugar, hora de inicio y fin, información adicional; "Solo este evento",
/// "Un período" (hasta una fecha) o "Desde este en adelante".
class EditarEventoScreen extends StatefulWidget {
  const EditarEventoScreen({super.key, required this.repo, required this.evento});
  final EventosRepo repo;
  final Evento evento;

  @override
  State<EditarEventoScreen> createState() => _EditarEventoScreenState();
}

class _EditarEventoScreenState extends State<EditarEventoScreen> {
  late String _lugar = widget.evento.lugar;
  late String _inicio = widget.evento.horaInicio;
  late String _fin = widget.evento.horaFin;
  late final _descripcion = TextEditingController(text: widget.evento.descripcion);
  AlcanceEdicion _alcance = AlcanceEdicion.individual;
  DateTime? _hasta;
  List<Lugar>? _lugares;
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.repo.lugares().then((l) {
      if (mounted) setState(() => _lugares = l);
    }).catchError((_) {
      if (mounted) setState(() => _lugares = const []);
    });
  }

  @override
  void dispose() {
    _descripcion.dispose();
    super.dispose();
  }

  bool get _hayCambios =>
      _lugar != widget.evento.lugar ||
      _inicio != widget.evento.horaInicio ||
      _fin != widget.evento.horaFin ||
      _descripcion.text.trim() != widget.evento.descripcion.trim();

  Future<void> _elegirHora(bool esInicio) async {
    TimeOfDay? inicial;
    final p = (esInicio ? _inicio : _fin).split(':');
    if (p.length >= 2) inicial = TimeOfDay(hour: int.tryParse(p[0]) ?? 19, minute: int.tryParse(p[1]) ?? 0);
    final h = await showTimePicker(context: context, initialTime: inicial ?? const TimeOfDay(hour: 19, minute: 0));
    if (h == null) return;
    final texto = '${h.hour.toString().padLeft(2, '0')}:${h.minute.toString().padLeft(2, '0')}';
    setState(() => esInicio ? _inicio = texto : _fin = texto);
  }

  Future<void> _elegirHasta() async {
    final d = await showDatePicker(
      context: context,
      firstDate: widget.evento.fecha,
      lastDate: widget.evento.fecha.add(const Duration(days: 365)),
      initialDate: _hasta ?? widget.evento.fecha.add(const Duration(days: 28)),
    );
    if (d != null) setState(() => _hasta = d);
  }

  Future<void> _guardar() async {
    if (!_hayCambios) {
      Navigator.of(context).pop(false);
      return;
    }
    if (_alcance == AlcanceEdicion.periodo && _hasta == null) {
      setState(() => _error = 'Elige hasta qué fecha aplicar el cambio.');
      return;
    }
    setState(() {
      _guardando = true;
      _error = null;
    });
    final ev = widget.evento;
    try {
      await widget.repo.editar(
        ev,
        lugar: _lugar != ev.lugar ? _lugar : null,
        horaInicio: _inicio != ev.horaInicio ? _inicio : null,
        horaFin: _fin != ev.horaFin ? _fin : null,
        descripcion: _descripcion.text.trim() != ev.descripcion.trim() ? _descripcion.text.trim() : null,
        alcance: _alcance,
        hasta: _hasta,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final ev = widget.evento;
    final opcionesLugar = {...?_lugares?.map((l) => l.nombre), ev.lugar}.where((l) => l.isNotEmpty).toList()..sort();
    return Scaffold(
      appBar: AppBar(title: const Text('Editar evento')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 120), children: [
        Text('${ev.tipo} · ${Fechas.encabezado(ev.fecha)}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: p.marcaTexto)),
        const SizedBox(height: 20),
        _titulo(p, 'Lugar'),
        _lugares == null
            ? const LinearProgressIndicator()
            : DropdownButtonFormField<String>(
                initialValue: _lugar,
                items: [for (final l in opcionesLugar) DropdownMenuItem(value: l, child: Text(l))],
                onChanged: (v) => setState(() => _lugar = v ?? _lugar),
              ),
        const SizedBox(height: 20),
        _titulo(p, 'Horario'),
        Row(children: [
          Expanded(child: _campoHora(p, 'Empieza', _inicio, () => _elegirHora(true))),
          const SizedBox(width: 12),
          Expanded(child: _campoHora(p, 'Termina', _fin, () => _elegirHora(false))),
        ]),
        const SizedBox(height: 20),
        _titulo(p, 'Información adicional'),
        TextField(
          controller: _descripcion,
          minLines: 2,
          maxLines: 5,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'Ej.: trae protecciones completas'),
        ),
        const SizedBox(height: 24),
        _titulo(p, '¿A qué eventos aplicar el cambio?'),
        RadioGroup<AlcanceEdicion>(
          groupValue: _alcance,
          onChanged: (v) => setState(() => _alcance = v ?? _alcance),
          child: Column(children: [
            const RadioListTile(value: AlcanceEdicion.individual, title: Text('Solo este evento'), contentPadding: EdgeInsets.zero),
            const RadioListTile(
              value: AlcanceEdicion.periodo,
              title: Text('Un período'),
              subtitle: Text('Desde este evento hasta la fecha que elijas'),
              contentPadding: EdgeInsets.zero,
            ),
            const RadioListTile(
              value: AlcanceEdicion.desdeAqui,
              title: Text('Desde este en adelante'),
              subtitle: Text('Cambia también la regla del lugar para los próximos'),
              contentPadding: EdgeInsets.zero,
            ),
          ]),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 220),
          child: _alcance == AlcanceEdicion.periodo
              ? Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: OutlinedButton.icon(
                    onPressed: _elegirHasta,
                    icon: const Icon(Icons.event_outlined),
                    label: Text(_hasta == null ? 'Elegir hasta qué fecha' : 'Hasta el ${Fechas.encabezado(_hasta!).toLowerCase()}'),
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          Text(_error!, style: TextStyle(color: p.marcaTexto)),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: _guardando || !_hayCambios ? null : _guardar,
            child: _guardando
                ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: p.sobreMarca))
                : const Text('Guardar cambios'),
          ),
        ),
      ),
    );
  }

  Widget _titulo(PivotPaleta p, String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.texto)),
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
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(etiqueta, style: TextStyle(fontSize: 12, color: p.textoSecundario)),
            Text(valor.isEmpty ? '—' : valor, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: p.texto)),
          ]),
        ),
      ),
    );
  }
}
