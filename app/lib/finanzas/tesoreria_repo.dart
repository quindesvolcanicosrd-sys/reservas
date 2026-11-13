import 'dart:convert';

import '../core/api.dart';
import '../sesion/sesion.dart';

/// Tesorería (HOJA_DE_RUTA etapa 5, Victor 2026-11-13). Todo pasa por
/// `adminTesoreria`; nada se guarda en el teléfono.
class TesoreriaRepo {
  TesoreriaRepo(this.sesion);
  final Sesion sesion;

  Future<Map<String, dynamic>> accion(String accion, [Map<String, Object?> datos = const {}]) async {
    final r = await sesion.api.post('adminTesoreria', {'adminToken': sesion.adminToken, 'accion': accion, 'datos': jsonEncode(datos)});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo completar.'}');
    return r;
  }
}

const categoriasTesoreria = {
  'cuota': 'Cuotas',
  'clase': 'Clases',
  'merch': 'Merch',
  'evento': 'Eventos',
  'equipamiento': 'Equipamiento',
  'alquiler': 'Alquiler de pista',
  'viaje': 'Viajes',
  'prestamo': 'Préstamos',
  'abono': 'Abonos',
  'donacion': 'Donaciones',
  'otro': 'Otro',
};

const tiposCuenta = {'efectivo': 'Efectivo', 'deuna': 'DeUna', 'banco': 'Banco', 'otro': 'Otra'};

String plata(num v) {
  final neg = v < 0;
  final t = v.abs().toStringAsFixed(2).replaceAll('.', ',');
  return '${neg ? '−' : ''}\$$t';
}

String isoFecha(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
