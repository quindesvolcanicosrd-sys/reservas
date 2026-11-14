import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/config_liga.dart';
import '../core/tema.dart';
import '../finanzas/tesoreria_repo.dart';
import 'categorias_screen.dart' show elegirYSubirLogo;
import '../core/vidrio.dart';

/// Logo de un medio de pago (o su ícono sobre su color de énfasis).
class LogoMedio extends StatelessWidget {
  const LogoMedio({super.key, required this.medio, this.tamano = 44});
  final MedioPago medio;
  final double tamano;

  @override
  Widget build(BuildContext context) {
    final c = PivotMedios.de(medio.color);
    return ClipRRect(
      borderRadius: BorderRadius.circular(tamano * 0.28),
      child: SizedBox(
        width: tamano,
        height: tamano,
        child: medio.logo.isNotEmpty ? Image.network(medio.logo, fit: BoxFit.cover, errorBuilder: (_, _, _) => _icono(c)) : _icono(c),
      ),
    );
  }

  Widget _icono(Color c) => ColoredBox(
    color: c,
    child: Icon(medio.icono, color: PivotPaleta.sobreSeccion, size: tamano * 0.55),
  );
}

/// Mi Liga → Cobros → Formas de pago (Victor, 2026-11-13): lista editable de
/// medios genéricos. Quitar uno no cambia pagos pasados: cada pago guarda el
/// nombre del medio con que se hizo.
class FormasPagoScreen extends StatefulWidget {
  const FormasPagoScreen({super.key, required this.config});
  final ConfigLiga config;

  @override
  State<FormasPagoScreen> createState() => _FormasPagoScreenState();
}

class _FormasPagoScreenState extends State<FormasPagoScreen> {
  ConfigLiga get c => widget.config;
  late List<Map<String, dynamic>> _medios = [for (final m in c.medios) Map.of(m.m)];
  late final _whatsapp = TextEditingController(text: c.whatsappComprobante);
  bool _ocupado = false;

  Future<void> _guardar({String ok = 'Guardado'}) async {
    setState(() => _ocupado = true);
    try {
      await c.guardar({
        'formasPago': jsonEncode({'medios': _medios, 'whatsapp': _whatsapp.text.trim()}),
      });
      if (!mounted) return;
      setState(() {
        _medios = [for (final m in c.medios) Map.of(m.m)];
        _ocupado = false;
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(ok)));
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar.')));
    }
  }

  Future<void> _editar([int? i]) async {
    final r = await Navigator.of(context).push<Object>(
      MaterialPageRoute(
        builder: (_) => _MedioScreen(config: c, medio: i == null ? null : Map.of(_medios[i])),
      ),
    );
    if (r == null) return;
    if (r == 'borrar' && i != null) {
      final nombre = '${_medios[i]['nombre']}';
      setState(() => _medios.removeAt(i));
      await _guardar(ok: '$nombre quitado. Los pagos ya hechos con $nombre no cambian.');
    } else if (r is Map<String, dynamic>) {
      setState(() => i == null ? _medios.add(r) : _medios[i] = r);
      await _guardar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        flexibleSpace: const Vidrio(child: SizedBox.expand()),
        title: const Text('Formas de pago', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AbsorbPointer(
        absorbing: _ocupado,
        child: ListView(
          padding: EdgeInsets.fromLTRB(16, 8 + altoBarra(context), 16, 100),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: Text('Lo que ve cada persona al pagar una clase o la mensualidad, en este orden.', style: TextStyle(color: p.textoSecundario)),
            ),
            if (_medios.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'Sin medios de pago: nadie podrá pagar desde la app.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.marcaTexto),
                ),
              ),
            for (final (i, m) in _medios.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: p.tarjeta,
                  borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => _editar(i),
                    child: Container(
                      decoration: BoxDecoration(
                        border: Border(left: BorderSide(color: PivotMedios.de(MedioPago(m).color), width: 5)),
                      ),
                      padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
                      child: Row(
                        children: [
                          LogoMedio(medio: MedioPago(m)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  MedioPago(m).nombre,
                                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: p.texto),
                                ),
                                Text(MedioPago(m).nombreTipo, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                              ],
                            ),
                          ),
                          Switch(
                            value: MedioPago(m).activo,
                            onChanged: (v) {
                              setState(() => _medios[i]['activo'] = v);
                              _guardar(ok: v ? '${m['nombre']} visible al pagar' : '${m['nombre']} oculto al pagar');
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Material(
              color: p.tarjeta,
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: TextField(
                  controller: _whatsapp,
                  keyboardType: TextInputType.phone,
                  onSubmitted: (_) => _guardar(),
                  decoration: const InputDecoration(
                    labelText: 'WhatsApp para comprobantes',
                    helperText: 'Con código de país, sin +. Se guarda al tocar Listo en el teclado.',
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(tooltip: 'Agregar medio de pago', onPressed: _ocupado ? null : _editar, child: const Icon(Icons.add_rounded)),
    );
  }
}

/// Crear o editar un medio de pago.
class _MedioScreen extends StatefulWidget {
  const _MedioScreen({required this.config, this.medio});
  final ConfigLiga config;
  final Map<String, dynamic>? medio;

  @override
  State<_MedioScreen> createState() => _MedioScreenState();
}

class _MedioScreenState extends State<_MedioScreen> {
  late final Map<String, dynamic> _m =
      widget.medio ?? {'id': 'medio${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}', 'tipo': 'billetera', 'color': 'verde', 'activo': true};
  late final _nombre = TextEditingController(text: '${_m['nombre'] ?? ''}');
  late final _enlace = TextEditingController(text: '${_m['enlace'] ?? ''}');
  late final _indicaciones = TextEditingController(text: '${_m['indicaciones'] ?? ''}');
  late final List<(TextEditingController, TextEditingController)> _datos = [
    for (final (e, v) in MedioPago(_m).datos) (TextEditingController(text: e), TextEditingController(text: v)),
  ];
  List<Map<String, dynamic>> _cuentas = const [];
  bool _subiendo = false;

  @override
  void initState() {
    super.initState();
    TesoreriaRepo(widget.config.sesion)
        .accion('resumen')
        .then((r) {
          if (mounted) {
            setState(
              () => _cuentas = [
                for (final c in (r['cuentas'] as List? ?? const []))
                  if ((c as Map)['activa'] != false) c as Map<String, dynamic>,
              ],
            );
          }
        })
        .catchError((_) {});
  }

  String get _tipo => '${_m['tipo']}';

  Map<String, dynamic> get _resultado => {
    ..._m,
    'nombre': _nombre.text.trim().isEmpty ? MedioPago(_m).nombreTipo : _nombre.text.trim(),
    'enlace': _enlace.text.trim(),
    'indicaciones': _indicaciones.text.trim(),
    'datos': [
      for (final (e, v) in _datos)
        if (e.text.trim().isNotEmpty && v.text.trim().isNotEmpty) [e.text.trim(), v.text.trim()],
    ],
  };

  Future<void> _logo() async {
    setState(() => _subiendo = true);
    try {
      final u = await elegirYSubirLogo(context, widget.config.sesion, 'medio-${_m['id']}');
      if (u != null && mounted) setState(() => _m['logo'] = u);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo subir el logo.')));
    } finally {
      if (mounted) setState(() => _subiendo = false);
    }
  }

  Future<void> _borrar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Quitar ${_nombre.text.trim().isEmpty ? 'este medio' : _nombre.text.trim()}?'),
        content: const Text('Deja de aparecer al pagar. Los pagos y movimientos ya hechos con este medio no cambian ni se borran.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Quitar')),
        ],
      ),
    );
    if (ok == true && mounted) Navigator.of(context).pop('borrar');
  }

  Widget _titulo(String t) => Padding(
    padding: const EdgeInsets.only(top: 18, bottom: 8),
    child: Text(
      t,
      style: TextStyle(fontWeight: FontWeight.w700, color: context.pivot.texto),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final medio = MedioPago(_resultado);
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        flexibleSpace: const Vidrio(child: SizedBox.expand()),
        title: Text(widget.medio == null ? 'Nuevo medio de pago' : 'Editar medio', style: const TextStyle(fontWeight: FontWeight.w700)),
        actions: [if (widget.medio != null) IconButton(tooltip: 'Quitar', onPressed: _borrar, icon: const Icon(Icons.delete_outline_rounded))],
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16, 8 + altoBarra(context), 16, 100),
        children: [
          Center(
            child: Column(
              children: [
                InkWell(
                  borderRadius: BorderRadius.circular(24),
                  onTap: _subiendo ? null : _logo,
                  child: Stack(
                    children: [
                      LogoMedio(medio: medio, tamano: 84),
                      if (_subiendo) const Positioned.fill(child: Center(child: CircularProgressIndicator())),
                    ],
                  ),
                ),
                TextButton(onPressed: _subiendo ? null : _logo, child: Text(medio.logo.isEmpty ? 'Agregar logo (150 × 150)' : 'Cambiar logo')),
                if (medio.logo.isNotEmpty) TextButton(onPressed: () => setState(() => _m['logo'] = ''), child: const Text('Quitar logo')),
              ],
            ),
          ),
          TextField(
            controller: _nombre,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Nombre que ve la persona'),
          ),
          _titulo('Tipo'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final e in MedioPago.tipos.entries)
                ChoiceChip(
                  showCheckmark: false,
                  avatar: Icon(e.value.$2, size: 18),
                  label: Text(e.value.$1),
                  selected: _tipo == e.key,
                  onSelected: (_) => setState(() => _m['tipo'] = e.key),
                ),
            ],
          ),
          _titulo('Color'),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (final e in PivotMedios.colores.entries)
                InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => setState(() => _m['color'] = e.key),
                  child: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: e.value,
                      shape: BoxShape.circle,
                      border: Border.all(color: _m['color'] == e.key ? p.texto : Colors.transparent, width: 3),
                    ),
                    child: _m['color'] == e.key ? const Icon(Icons.check_rounded, color: PivotPaleta.sobreSeccion, size: 20) : null,
                  ),
                ),
            ],
          ),
          if (_tipo == 'billetera' || _tipo == 'enlace') ...[
            _titulo('Enlace para pagar'),
            TextField(
              controller: _enlace,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(hintText: 'https://…', helperText: 'Se abre al tocar "Pagar". Opcional para billeteras.'),
            ),
          ],
          if (_tipo != 'efectivo') ...[
            _titulo('Datos para pagar (se pueden copiar)'),
            for (final (i, (e, v)) in _datos.indexed)
              Row(
                children: [
                  SizedBox(
                    width: 110,
                    child: TextField(
                      controller: e,
                      decoration: const InputDecoration(labelText: 'Dato'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: v,
                      decoration: const InputDecoration(labelText: 'Valor'),
                    ),
                  ),
                  IconButton(tooltip: 'Quitar', onPressed: () => setState(() => _datos.removeAt(i)), icon: const Icon(Icons.close_rounded)),
                ],
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => setState(() => _datos.add((TextEditingController(), TextEditingController()))),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Agregar dato (titular, número, teléfono…)'),
              ),
            ),
          ],
          _titulo('Indicaciones (opcional)'),
          TextField(
            controller: _indicaciones,
            minLines: 1,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Ej. Entrégalo a un Pivot antes de la clase'),
          ),
          if (_cuentas.isNotEmpty) ...[
            _titulo('¿A qué cuenta de Tesorería entra?'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  showCheckmark: false,
                  label: const Text('Elegir al aprobar'),
                  selected: _m['cuentaId'] == null,
                  onSelected: (_) => setState(() => _m['cuentaId'] = null),
                ),
                for (final c in _cuentas)
                  ChoiceChip(
                    showCheckmark: false,
                    label: Text('${c['nombre']}'),
                    selected: _m['cuentaId'] == c['id'],
                    onSelected: (_) => setState(() => _m['cuentaId'] = c['id']),
                  ),
              ],
            ),
          ],
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).pop(_resultado),
        icon: const Icon(Icons.check_rounded),
        label: const Text('Guardar'),
      ),
    );
  }
}

/// Copiar un dato de pago con aviso.
void copiarDato(BuildContext context, String etiqueta, String valor) {
  Clipboard.setData(ClipboardData(text: valor));
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text('$etiqueta copiado')));
}
