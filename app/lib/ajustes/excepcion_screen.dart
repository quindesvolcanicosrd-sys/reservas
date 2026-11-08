import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';

/// Excepción de cuota en pasos, con el mismo marco que los asistentes de
/// Eventos (`Asistente`): tipo → detalles → (compromiso) → revisar y enviar.
/// Va a admins con `solicitarExcepcion` (web: asistente `wizExc*`).
class ExcepcionScreen extends StatefulWidget {
  const ExcepcionScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<ExcepcionScreen> createState() => _ExcepcionScreenState();
}

enum _Paso { tipo, nivel, detalle, compromiso, revisar }

class _ExcepcionScreenState extends State<ExcepcionScreen> {
  _Paso _paso = _Paso.tipo;
  bool _adelante = true;
  String? _tipo; // 'ausencias' | 'economica'
  String? _nivel;
  final _a = TextEditingController(), _b = TextEditingController();
  bool _acepta = false, _enviando = false;

  static const _niveles = {
    'bajo': ('Bajo', 'No puedo cubrir necesidades básicas como alimentación, alquiler u otros gastos esenciales.'),
    'medio': ('Medio', 'Puedo cubrir lo básico, pero pagar la cuota supone un esfuerzo económico significativo.'),
    'alto': ('Alto', 'No tengo dificultades para pagar la cuota en las condiciones habituales.'),
  };

  @override
  void dispose() {
    _a.dispose();
    _b.dispose();
    super.dispose();
  }

  List<_Paso> get _pasos => _tipo == 'economica' ? _Paso.values : const [_Paso.tipo, _Paso.detalle, _Paso.revisar];

  void _ir(int d) {
    final i = _pasos.indexOf(_paso) + d;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = d > 0;
      _paso = _pasos[i];
    });
  }

  void _elegirYSeguir(VoidCallback cambio) {
    setState(cambio);
    Future.delayed(const Duration(milliseconds: 180), () {
      if (mounted) _ir(1);
    });
  }

  bool get _pasoListo => switch (_paso) {
    _Paso.tipo => _tipo != null,
    _Paso.nivel => _nivel != null,
    _Paso.detalle => _tipo == 'ausencias' ? _a.text.trim().isNotEmpty && _b.text.trim().isNotEmpty : _a.text.trim().isNotEmpty,
    _Paso.compromiso => _b.text.trim().isNotEmpty && _acepta,
    _Paso.revisar => true,
  };

  Future<void> _enviar() async {
    setState(() => _enviando = true);
    final datos = _tipo == 'ausencias'
        ? {'motivo': _a.text.trim(), 'justificacion': _b.text.trim()}
        : {'nivelIngreso': _nivel, 'situacionEconomica': _a.text.trim(), 'compromiso': _b.text.trim()};
    final hoy = Fechas.hoy();
    final ok = await guardarConAviso(context, () async {
      final r = await widget.sesion.api.post('solicitarExcepcion', {
        'tipo': _tipo,
        'datos': jsonEncode(datos),
        'mesAplicacion': '${hoy.year}-${hoy.month.toString().padLeft(2, '0')}',
      });
      if (r['exito'] != true) throw ApiException('${r['error'] ?? 'No se pudo enviar la solicitud.'}');
    }, ok: 'Solicitud enviada. Admins la revisarán pronto.');
    if (!mounted) return;
    setState(() => _enviando = false);
    if (ok) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final pasos = _pasos;
    final economica = _tipo == 'economica';
    return Asistente(
      titulo: 'Excepción de cuota',
      indice: pasos.indexOf(_paso),
      total: pasos.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _Paso.tipo => '¿Qué necesitas?',
        _Paso.nivel => '¿Cómo está tu ingreso?',
        _Paso.detalle => economica ? 'Cuéntanos tu situación' : 'Cuéntanos qué pasó',
        _Paso.compromiso => '¿Cómo puedes aportar?',
        _Paso.revisar => 'Revisa y envía',
      },
      ayuda: switch (_paso) {
        _Paso.tipo => 'Admins revisan cada solicitud. Lo que escribas es confidencial.',
        _Paso.nivel => 'Elige la opción que mejor te describe.',
        _Paso.detalle =>
          economica ? 'Tipo de ingreso, situación laboral, personas a tu cargo.' : 'Describe el motivo de tus ausencias y por qué corresponde media cuota.',
        _Paso.compromiso => 'La subvención se acompaña de tareas concretas para el equipo.',
        _Paso.revisar => null,
      },
      cuerpo: switch (_paso) {
        _Paso.tipo => _pasoTipo(),
        _Paso.nivel => _pasoNivel(),
        _Paso.detalle => _pasoDetalle(),
        _Paso.compromiso => _pasoCompromiso(),
        _Paso.revisar => _pasoRevisar(),
      },
      textoBoton: switch (_paso) {
        _Paso.tipo || _Paso.nivel => _pasoListo ? 'Siguiente' : null,
        _Paso.revisar => 'Enviar solicitud',
        _ => 'Siguiente',
      },
      alContinuar: _paso == _Paso.revisar ? (_enviando ? null : _enviar) : (_pasoListo ? () => _ir(1) : null),
      ocupado: _enviando,
    );
  }

  Widget _pasoTipo() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      OpcionAsistente(
        icono: Icons.event_busy_outlined,
        titulo: 'Ausencias justificadas',
        texto: 'Si se acepta, pagas media cuota este mes.',
        activa: _tipo == 'ausencias',
        alTocar: () => _elegirYSeguir(() {
          if (_tipo != 'ausencias') _limpiar();
          _tipo = 'ausencias';
        }),
      ),
      OpcionAsistente(
        icono: Icons.volunteer_activism_outlined,
        titulo: 'Dificultad económica',
        texto: 'Pide una subvención parcial o completa.',
        activa: _tipo == 'economica',
        alTocar: () => _elegirYSeguir(() {
          if (_tipo != 'economica') _limpiar();
          _tipo = 'economica';
        }),
      ),
    ],
  );

  void _limpiar() {
    _a.clear();
    _b.clear();
    _nivel = null;
    _acepta = false;
  }

  Widget _pasoNivel() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      for (final e in _niveles.entries)
        OpcionAsistente(
          icono: switch (e.key) {
            'bajo' => Icons.trending_down_rounded,
            'medio' => Icons.trending_flat_rounded,
            _ => Icons.trending_up_rounded,
          },
          titulo: e.value.$1,
          texto: e.value.$2,
          activa: _nivel == e.key,
          alTocar: () => _elegirYSeguir(() => _nivel = e.key),
        ),
    ],
  );

  Widget _campo(TextEditingController c, String etiqueta, {String? pista}) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextField(
      controller: c,
      minLines: 4,
      maxLines: 8,
      maxLength: 600,
      onChanged: (_) => setState(() {}),
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(labelText: etiqueta, hintText: pista, alignLabelWithHint: true),
    ),
  );

  Widget _pasoDetalle() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      if (_tipo == 'ausencias') ...[
        _campo(_a, 'Motivo de las ausencias', pista: 'Ej: viaje de trabajo del 3 al 20.'),
        _campo(_b, 'Por qué corresponde media cuota'),
      ] else
        _campo(_a, 'Tu situación económica', pista: 'Es confidencial: solo la leen admins.'),
    ],
  );

  Widget _pasoCompromiso() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      _campo(_b, 'Tareas con las que puedes aportar', pista: 'Redes, fotos, logística, coordinación…'),
      CheckboxListTile(
        value: _acepta,
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        onChanged: (v) => setState(() => _acepta = v ?? false),
        title: const Text('Entiendo que no cumplir el compromiso puede tener las sanciones que defina la organización.'),
      ),
    ],
  );

  Widget _pasoRevisar() {
    final p = context.pivot;
    Widget fila(String etiqueta, String valor) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            etiqueta,
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: p.textoSecundario),
          ),
          const SizedBox(height: 3),
          Text(valor, style: TextStyle(fontSize: 15, color: p.texto)),
        ],
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 2),
          decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              fila('Tipo', _tipo == 'ausencias' ? 'Ausencias justificadas (media cuota)' : 'Dificultad económica (subvención)'),
              if (_tipo == 'economica') fila('Nivel de ingreso', _niveles[_nivel]?.$1 ?? ''),
              fila(_tipo == 'ausencias' ? 'Motivo' : 'Situación', _a.text.trim()),
              fila(_tipo == 'ausencias' ? 'Justificación' : 'Compromiso', _b.text.trim()),
              fila('Mes', Fechas.mesAnio(Fechas.hoy())),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const AvisoPrivado(texto: 'Solo admins de tu equipo leen tu solicitud. Te avisamos cuando la revisen.'),
      ],
    );
  }
}
