import 'package:flutter/material.dart';

import 'package:latlong2/latlong.dart';

import '../core/asistente.dart';
import '../core/selector_ubicacion.dart';
import 'eventos_repo.dart';

enum _Paso { ubicacion, tipo, video }

/// "Agregar lugar" (solo admins), con el mismo marco que el resto de los
/// asistentes. Mismos datos que el formulario de la web (`_evLugarGuardar()`):
/// nombre (20 caracteres), enlace de Google Maps, tipo de evento y video
/// instructivo opcional. La ubicación se elige dentro de la app con buscador y
/// mapa (OpenStreetMap, `SelectorUbicacion`) y se guarda como enlace de
/// Google Maps armado con las coordenadas del pin.
class NuevoLugarScreen extends StatefulWidget {
  const NuevoLugarScreen({super.key, required this.repo});
  final EventosRepo repo;

  @override
  State<NuevoLugarScreen> createState() => _NuevoLugarScreenState();
}

class _NuevoLugarScreenState extends State<NuevoLugarScreen> {
  _Paso _paso = _Paso.ubicacion;
  bool _adelante = true;
  final _nombre = TextEditingController();
  LatLng? _pin;
  final _video = TextEditingController();
  String? _tipo;
  bool _guardando = false;

  static const _tipos = ['Entrenamiento', 'Torneo', 'Partido', 'Asamblea', 'Evento social', 'Otro'];

  @override
  void dispose() {
    _nombre.dispose();

    _video.dispose();
    super.dispose();
  }

  bool get _valido => switch (_paso) {
    _Paso.ubicacion => _nombre.text.trim().isNotEmpty && _pin != null,
    _Paso.tipo => _tipo != null,
    _Paso.video => _video.text.trim().isEmpty || Uri.tryParse(_video.text.trim())?.hasScheme == true,
  };

  void _ir(int delta) {
    final i = _paso.index + delta;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= _Paso.values.length) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = delta > 0;
      _paso = _Paso.values[i];
    });
  }

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      final fila = await widget.repo.crearLugar(nombre: _nombre.text, mapsUrl: SelectorUbicacion.enlaceGoogleMaps(_pin!), tipo: _tipo!, video: _video.text);
      if (mounted) Navigator.of(context).pop(fila);
    } catch (e) {
      if (mounted) {
        setState(() => _guardando = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo crear el lugar: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ultimo = _paso == _Paso.video;
    return Asistente(
      titulo: 'Nuevo lugar',
      indice: _paso.index,
      total: _Paso.values.length,
      tituloPaso: switch (_paso) {
        _Paso.ubicacion => 'Nombre y ubicación',
        _Paso.tipo => '¿Qué se hace ahí?',
        _Paso.video => 'Video instructivo',
      },
      ayuda: switch (_paso) {
        _Paso.ubicacion => 'Búscalo o mueve el mapa hasta dejar el pin en el lugar.',
        _Paso.tipo => 'Se usa como tipo de evento por defecto en este lugar.',
        _Paso.video => 'Opcional: un video de cómo llegar o entrar.',
      },
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      cuerpo: switch (_paso) {
        _Paso.ubicacion => _pasoUbicacion(context),
        _Paso.tipo => _pasoTipo(context),
        _Paso.video => _pasoVideo(context),
      },
      textoBoton: ultimo ? 'Crear lugar' : 'Siguiente',
      alContinuar: !_valido ? null : (ultimo ? _guardar : () => _ir(1)),
      ocupado: _guardando,
    );
  }

  Widget _pasoUbicacion(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _nombre,
            maxLength: 20,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Nombre del lugar', hintText: 'Ej.: Cumandá', counterText: ''),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: SelectorUbicacion(inicial: _pin, alCambiar: (p) => setState(() => _pin = p)),
          ),
        ],
      ),
    );
  }

  Widget _pasoTipo(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [for (final t in _tipos) ChoiceChip(label: Text(t), selected: _tipo == t, onSelected: (_) => setState(() => _tipo = t))],
        ),
      ],
    );
  }

  Widget _pasoVideo(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _video,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(labelText: 'Enlace del video (opcional)', hintText: 'https://…'),
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}
