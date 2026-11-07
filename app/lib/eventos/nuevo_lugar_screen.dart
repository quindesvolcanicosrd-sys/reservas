import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/asistente.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';

enum _Paso { ubicacion, tipo, video }

/// "Agregar lugar" (solo admins), con el mismo marco que el resto de los
/// asistentes. Mismos datos que el formulario de la web (`_evLugarGuardar()`):
/// nombre (20 caracteres), enlace de Google Maps, tipo de evento y video
/// instructivo opcional. La web busca con Google Places dentro del mapa; esa
/// llave solo sirve en el sitio web, así que acá se abre Google Maps para
/// buscar el lugar y se pega el enlace ("Compartir" → "Copiar enlace").
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
  final _mapa = TextEditingController();
  final _video = TextEditingController();
  String? _tipo;
  bool _guardando = false;

  static const _tipos = ['Entrenamiento', 'Torneo', 'Partido', 'Asamblea', 'Evento social', 'Otro'];
  static final _enlaceMaps = RegExp(r'^https?://(maps\.app\.goo\.gl|goo\.gl/maps|(www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+)', caseSensitive: false);

  @override
  void dispose() {
    _nombre.dispose();
    _mapa.dispose();
    _video.dispose();
    super.dispose();
  }

  bool get _enlaceValido => _enlaceMaps.hasMatch(_mapa.text.trim());

  bool get _valido => switch (_paso) {
    _Paso.ubicacion => _nombre.text.trim().isNotEmpty && _enlaceValido,
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

  Future<void> _buscarEnMaps() async {
    final q = _nombre.text.trim().isEmpty ? 'Quito' : '${_nombre.text.trim()} Quito';
    await launchUrl(Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(q)}'), mode: LaunchMode.externalApplication);
  }

  Future<void> _pegar() async {
    final datos = await Clipboard.getData(Clipboard.kTextPlain);
    final texto = (datos?.text ?? '').trim();
    // Google Maps comparte "Nombre del lugar https://maps.app.goo.gl/…": se toma solo el enlace.
    final m = RegExp(r'https?://\S+').firstMatch(texto);
    setState(() => _mapa.text = m?.group(0) ?? texto);
  }

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      final fila = await widget.repo.crearLugar(nombre: _nombre.text, mapsUrl: _mapa.text, tipo: _tipo!, video: _video.text);
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
        _Paso.ubicacion => 'Busca el lugar en Google Maps, toca "Compartir" → "Copiar enlace" y pégalo aquí.',
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
    final p = context.pivot;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _nombre,
          maxLength: 20,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Nombre del lugar', hintText: 'Ej.: Cumandá'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 4),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          onPressed: _buscarEnMaps,
          icon: const Icon(Icons.map_outlined),
          label: const Text('Buscar en Google Maps'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _mapa,
          keyboardType: TextInputType.url,
          decoration: InputDecoration(
            labelText: 'Enlace de Google Maps',
            hintText: 'https://maps.app.goo.gl/…',
            suffixIcon: IconButton(tooltip: 'Pegar', icon: const Icon(Icons.content_paste_rounded), onPressed: _pegar),
          ),
          onChanged: (_) => setState(() {}),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          child: _mapa.text.trim().isEmpty || _enlaceValido
              ? const SizedBox(width: double.infinity)
              : Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('Ese enlace no parece de Google Maps.', style: TextStyle(fontSize: 13, color: p.marcaTexto)),
                ),
        ),
      ],
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
