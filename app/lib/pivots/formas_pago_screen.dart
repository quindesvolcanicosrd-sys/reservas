import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/config_liga.dart';
import '../core/tema.dart';

/// Mi Liga → Cobros → Formas de pago (Victor, 2026-11-13): qué medios ve la
/// persona al pagar y con qué datos. Sin configurar, quedan los del club.
class FormasPagoScreen extends StatefulWidget {
  const FormasPagoScreen({super.key, required this.config});
  final ConfigLiga config;

  @override
  State<FormasPagoScreen> createState() => _FormasPagoScreenState();
}

class _FormasPagoScreenState extends State<FormasPagoScreen> {
  ConfigLiga get c => widget.config;
  late bool _deuna = c.deunaActiva, _transf = c.transferenciaActiva, _efectivo = c.efectivoActivo;
  late final _enlace = TextEditingController(text: c.deunaEnlace);
  late final _banco = TextEditingController(text: c.banco);
  late final List<(TextEditingController, TextEditingController)> _datos = [
    for (final (e, v) in c.datosBancarios) (TextEditingController(text: e), TextEditingController(text: v)),
  ];
  late final _textoEfectivo = TextEditingController(text: c.efectivoTexto);
  late final _whatsapp = TextEditingController(text: c.whatsappComprobante);
  bool _ocupado = false;

  Future<void> _guardar() async {
    setState(() => _ocupado = true);
    try {
      await c.guardar({
        'formasPago': jsonEncode({
          'deuna': {'activa': _deuna, 'enlace': _enlace.text.trim()},
          'transferencia': {
            'activa': _transf,
            'banco': _banco.text.trim(),
            'datos': [
              for (final (e, v) in _datos)
                if (e.text.trim().isNotEmpty && v.text.trim().isNotEmpty) [e.text.trim(), v.text.trim()],
            ],
          },
          'efectivo': {'activa': _efectivo, 'texto': _textoEfectivo.text.trim()},
          'whatsapp': _whatsapp.text.trim(),
        }),
      });
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar.')));
    }
  }

  Widget _tarjeta(List<Widget> hijos) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Material(
      color: context.pivot.tarjeta,
      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: hijos),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Formas de pago', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
            child: Text('Lo que ve cada persona al pagar una clase o la mensualidad.', style: TextStyle(color: p.textoSecundario)),
          ),
          _tarjeta([
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('DeUna'), value: _deuna, onChanged: (v) => setState(() => _deuna = v)),
            if (_deuna)
              TextField(
                controller: _enlace,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(labelText: 'Enlace de pago de DeUna'),
              ),
          ]),
          _tarjeta([
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Transferencia bancaria'),
              value: _transf,
              onChanged: (v) => setState(() => _transf = v),
            ),
            if (_transf) ...[
              TextField(
                controller: _banco,
                decoration: const InputDecoration(labelText: 'Banco'),
              ),
              const SizedBox(height: 8),
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
              TextButton.icon(
                onPressed: () => setState(() => _datos.add((TextEditingController(), TextEditingController()))),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Agregar dato (titular, N° de cuenta…)'),
              ),
            ],
          ]),
          _tarjeta([
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Efectivo'), value: _efectivo, onChanged: (v) => setState(() => _efectivo = v)),
            if (_efectivo)
              TextField(
                controller: _textoEfectivo,
                decoration: const InputDecoration(labelText: 'Indicaciones (ej. Entrégalo a un Pivot antes de la clase)'),
              ),
          ]),
          _tarjeta([
            const SizedBox(height: 8),
            TextField(
              controller: _whatsapp,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'WhatsApp para comprobantes', helperText: 'Con código de país, sin +. Ej. 593998690423'),
            ),
          ]),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _ocupado ? null : _guardar,
        icon: const Icon(Icons.check_rounded),
        label: const Text('Guardar'),
      ),
    );
  }
}
