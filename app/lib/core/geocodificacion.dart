import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

/// Direcciones con Nominatim (OpenStreetMap), sin llaves ni costos, igual
/// que el selector de lugares de Eventos. Máximo una consulta por segundo:
/// quien llama espera a que el mapa deje de moverse.
class Geocodificacion {
  static const _ua = {'User-Agent': 'PivotApp/1.0 (com.pivotapp.coach)'};

  /// Dirección escrita → punto (o null).
  static Future<LatLng?> buscar(String direccion, {String pais = 'ec'}) async {
    if (direccion.trim().length < 4) return null;
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'q': direccion,
        'format': 'jsonv2',
        'limit': '1',
        'countrycodes': pais.toLowerCase(),
        'accept-language': 'es',
      });
      final r = await http.get(uri, headers: _ua).timeout(const Duration(seconds: 10));
      final l = jsonDecode(utf8.decode(r.bodyBytes));
      if (l is List && l.isNotEmpty) {
        final lat = double.tryParse('${l.first['lat']}'), lon = double.tryParse('${l.first['lon']}');
        if (lat != null && lon != null) return LatLng(lat, lon);
      }
    } catch (_) {}
    return null;
  }

  /// Punto → calle, número, sector y cantón (como el geocoder de la web).
  static Future<Map<String, String>> inversa(LatLng p) async {
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/reverse', {
        'lat': '${p.latitude}',
        'lon': '${p.longitude}',
        'format': 'jsonv2',
        'zoom': '18',
        'addressdetails': '1',
        'accept-language': 'es',
      });
      final r = await http.get(uri, headers: _ua).timeout(const Duration(seconds: 10));
      final a = (jsonDecode(utf8.decode(r.bodyBytes)) as Map)['address'];
      if (a is! Map) return const {};
      String de(List<String> claves) => claves.map((k) => '${a[k] ?? ''}'.trim()).firstWhere((v) => v.isNotEmpty, orElse: () => '');
      return {
        'callePrincipal': de(['road', 'pedestrian', 'footway']),
        'numeracion': de(['house_number']),
        'sector': de(['neighbourhood', 'suburb', 'quarter', 'city_district']),
        'canton': de(['city', 'town', 'county', 'village']),
      }..removeWhere((_, v) => v.isEmpty);
    } catch (_) {
      return const {};
    }
  }
}
