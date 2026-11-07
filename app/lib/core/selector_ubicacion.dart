import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import 'tema.dart';

/// Buscador + mapa con pin, todo dentro de la app (decisión 2026-11-07:
/// OpenStreetMap, sin llaves ni costos). Se busca con Nominatim (priorizando
/// Quito/Ecuador) y el pin queda fijo en el centro: se ajusta moviendo el
/// mapa. Devuelve las coordenadas; el enlace de Google Maps se arma con ellas
/// (`enlaceGoogleMaps`), así "Cómo llegar" sigue abriendo Google Maps.
class SelectorUbicacion extends StatefulWidget {
  const SelectorUbicacion({super.key, this.inicial, this.consultaInicial = '', required this.alCambiar});
  final LatLng? inicial;
  final String consultaInicial;
  final ValueChanged<LatLng> alCambiar;

  static const quito = LatLng(-0.1807, -78.4678);

  static String enlaceGoogleMaps(LatLng p) =>
      'https://www.google.com/maps/search/?api=1&query=${p.latitude.toStringAsFixed(6)},${p.longitude.toStringAsFixed(6)}';

  @override
  State<SelectorUbicacion> createState() => _SelectorUbicacionState();
}

class _Resultado {
  const _Resultado(this.nombre, this.detalle, this.punto);
  final String nombre;
  final String detalle;
  final LatLng punto;
}

class _SelectorUbicacionState extends State<SelectorUbicacion> {
  final _mapa = MapController();
  late final _busqueda = TextEditingController(text: widget.consultaInicial);
  final _foco = FocusNode();
  Timer? _espera;
  List<_Resultado> _resultados = const [];
  bool _buscando = false;
  String? _aviso;
  bool _arrastrando = false;

  @override
  void dispose() {
    _espera?.cancel();
    _busqueda.dispose();
    _foco.dispose();
    super.dispose();
  }

  void _alEscribir(String q) {
    _espera?.cancel();
    if (q.trim().length < 3) {
      setState(() {
        _resultados = const [];
        _aviso = null;
      });
      return;
    }
    // Nominatim pide como máximo una búsqueda por segundo: se espera a que se deje de escribir.
    _espera = Timer(const Duration(milliseconds: 700), () => _buscar(q.trim()));
  }

  Future<void> _buscar(String q) async {
    setState(() => _buscando = true);
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'q': q,
        'format': 'jsonv2',
        'limit': '6',
        'countrycodes': 'ec',
        'accept-language': 'es',
        // Prioriza Quito sin excluir el resto del país.
        'viewbox': '-78.65,0.05,-78.33,-0.42',
      });
      final resp = await http.get(uri, headers: {'User-Agent': 'PivotApp/1.0 (com.pivotapp.coach)'}).timeout(const Duration(seconds: 12));
      final lista = jsonDecode(utf8.decode(resp.bodyBytes));
      final res = <_Resultado>[
        if (lista is List)
          for (final r in lista)
            if (r is Map && double.tryParse('${r['lat']}') != null)
              _Resultado(
                ((r['name'] ?? '').toString().isNotEmpty ? r['name'] : r['display_name'].toString().split(',').first).toString(),
                r['display_name'].toString().split(',').skip(1).take(3).join(',').trim(),
                LatLng(double.parse('${r['lat']}'), double.parse('${r['lon']}')),
              ),
      ];
      if (!mounted || _busqueda.text.trim() != q) return;
      setState(() {
        _resultados = res;
        _aviso = res.isEmpty ? 'Sin resultados. Prueba con la calle o el barrio, o mueve el mapa hasta el lugar.' : null;
      });
    } catch (_) {
      if (mounted) setState(() => _aviso = 'No se pudo buscar. Revisa tu conexión o mueve el mapa hasta el lugar.');
    } finally {
      if (mounted) setState(() => _buscando = false);
    }
  }

  void _elegir(_Resultado r) {
    FocusScope.of(context).unfocus();
    setState(() {
      _resultados = const [];
      _busqueda.text = r.nombre;
    });
    _mapa.move(r.punto, 17);
    widget.alCambiar(r.punto);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _busqueda,
          focusNode: _foco,
          textInputAction: TextInputAction.search,
          onChanged: _alEscribir,
          onSubmitted: (q) {
            if (q.trim().length >= 3) _buscar(q.trim());
          },
          decoration: InputDecoration(
            hintText: 'Buscar dirección o lugar',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _buscando
                ? const Padding(
                    padding: EdgeInsets.all(14),
                    child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : (_busqueda.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Borrar',
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () => setState(() {
                            _busqueda.clear();
                            _resultados = const [];
                            _aviso = null;
                          }),
                        )),
          ),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapa,
                  options: MapOptions(
                    initialCenter: widget.inicial ?? SelectorUbicacion.quito,
                    initialZoom: widget.inicial == null ? 12 : 17,
                    onPositionChanged: (camara, conGesto) {
                      if (!conGesto) return;
                      if (!_arrastrando) setState(() => _arrastrando = true);
                      widget.alCambiar(camara.center);
                    },
                    onMapEvent: (e) {
                      if (e is MapEventMoveEnd || e is MapEventFlingAnimationEnd) {
                        if (_arrastrando) setState(() => _arrastrando = false);
                      }
                    },
                  ),
                  children: [
                    TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.pivotapp.coach'),
                    RichAttributionWidget(
                      alignment: AttributionAlignment.bottomLeft,
                      attributions: [TextSourceAttribution('© OpenStreetMap', onTap: () => launchUrl(Uri.parse('https://www.openstreetmap.org/copyright')))],
                    ),
                  ],
                ),
                // Pin fijo en el centro: sube un poco mientras se arrastra el mapa.
                IgnorePointer(
                  child: Center(
                    child: AnimatedSlide(
                      duration: const Duration(milliseconds: 160),
                      offset: Offset(0, _arrastrando ? -0.62 : -0.5),
                      child: Icon(
                        Icons.location_on_rounded,
                        size: 46,
                        color: p.marca,
                        shadows: [Shadow(color: p.velo, blurRadius: 6)],
                      ),
                    ),
                  ),
                ),
                // Resultados de la búsqueda sobre el mapa.
                Positioned(
                  left: 8,
                  right: 8,
                  top: 8,
                  child: AnimatedSize(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOutCubic,
                    alignment: Alignment.topCenter,
                    child: _resultados.isEmpty && _aviso == null
                        ? const SizedBox(width: double.infinity)
                        : Material(
                            color: p.tarjeta,
                            elevation: 3,
                            shadowColor: p.velo,
                            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                            clipBehavior: Clip.antiAlias,
                            child: _aviso != null
                                ? Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Text(_aviso!, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                                  )
                                : Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      for (final r in _resultados)
                                        ListTile(
                                          dense: true,
                                          leading: Icon(Icons.place_outlined, color: p.marcaTexto),
                                          title: Text(r.nombre, maxLines: 1, overflow: TextOverflow.ellipsis),
                                          subtitle: r.detalle.isEmpty ? null : Text(r.detalle, maxLines: 1, overflow: TextOverflow.ellipsis),
                                          onTap: () => _elegir(r),
                                        ),
                                    ],
                                  ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Mueve el mapa para dejar el pin justo en la entrada.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: p.textoSecundario),
        ),
      ],
    );
  }
}
