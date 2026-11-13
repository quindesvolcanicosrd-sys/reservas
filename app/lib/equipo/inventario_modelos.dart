import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../sesion/sesion.dart';

/// Íconos para elegir al crear una lista (se guarda la clave).
const iconosInventario = <String, IconData>{
  'patines': Icons.roller_skating_rounded,
  'protecciones': Icons.health_and_safety_outlined,
  'conos': Icons.change_history_rounded,
  'balones': Icons.sports_soccer_rounded,
  'ropa': Icons.checkroom_rounded,
  'botiquin': Icons.medical_services_outlined,
  'agua': Icons.water_drop_outlined,
  'cinta': Icons.straighten_rounded,
  'herramientas': Icons.build_outlined,
  'otro': Icons.inventory_2_outlined,
};

IconData iconoInventario(String? clave) => iconosInventario[clave] ?? Icons.inventory_2_outlined;

/// Una fila de stock: talla, pieza o '' (unidades e insumos).
class StockFila {
  StockFila(Map m)
    : variante = '${m['variante'] ?? ''}',
      cantidad = (m['cantidad'] as num?)?.toInt() ?? 0,
      enUso = (m['enUso'] as num?)?.toInt() ?? 0,
      libres = (m['libres'] as num?)?.toInt() ?? 0;
  final String variante;
  final int cantidad, enUso, libres;
}

class Pieza {
  Pieza(this.nombre, this.cantidad);
  String nombre;
  int cantidad;
  Map<String, Object> get json => {'nombre': nombre, 'cantidad': cantidad};
}

/// Lista de equipamiento (Victor, 2026-11-13): con tallas, sets de piezas,
/// unidades o insumos. "Patines" y "Protecciones" son del sistema (las usan
/// las reservas de clases).
class ListaInventario {
  ListaInventario(Map<String, dynamic> m)
    : id = '${m['id']}',
      nombre = '${m['nombre']}',
      tipo = '${m['tipo']}',
      icono = m['icono'] as String?,
      unidad = m['unidad'] as String?,
      sistema = m['sistema'] as String?,
      piezas = [
        for (final p in (m['piezas'] as List? ?? const []))
          if (p is Map) Pieza('${p['nombre']}', (p['cantidad'] as num?)?.toInt() ?? 1),
      ],
      stock = [
        for (final s in (m['stock'] as List? ?? const []))
          if (s is Map) StockFila(s),
      ],
      setsCompletos = (m['sets']?['completos'] as num?)?.toInt() ?? 0,
      setsLibres = (m['sets']?['libres'] as num?)?.toInt() ?? 0;
  final String id, nombre, tipo;
  final String? icono, unidad, sistema;
  final List<Pieza> piezas;
  final List<StockFila> stock;
  final int setsCompletos, setsLibres;

  bool get esTallas => tipo == 'tallas';
  bool get esSet => tipo == 'set';
  bool get esInsumo => tipo == 'insumo';
  IconData get iconoData => iconoInventario(icono);
  int get total => stock.fold(0, (s, x) => s + x.cantidad);
  int get libresTotal => stock.fold(0, (s, x) => s + x.libres);
  StockFila? fila(String v) => stock.where((x) => x.variante == v).firstOrNull;

  static const tipos = {
    'tallas': ('Con tallas', 'Ej. patines: cuántos hay de cada talla.', Icons.straighten_rounded),
    'set': ('Sets de piezas', 'Ej. protecciones: cada set trae casco, coderas, rodilleras…', Icons.dashboard_customize_outlined),
    'unidades': ('Unidades', 'Ej. conos o balones: solo cuántos hay.', Icons.grid_view_rounded),
    'insumo': ('Insumos', 'Cosas que se gastan: cinta, agua, botiquín…', Icons.inventory_outlined),
  };

  /// "9 tallas · 12 pares", "9 sets completos", "20 conos", "4 rollos".
  String get resumen {
    if (esTallas) return stock.isEmpty ? 'Sin tallas cargadas' : '${stock.length} ${stock.length == 1 ? 'talla' : 'tallas'} · $total en total';
    if (esSet) return '$setsCompletos ${setsCompletos == 1 ? 'set completo' : 'sets completos'}';
    if (esInsumo) return '$total ${unidad?.isNotEmpty == true ? unidad : 'unidades'}';
    return '$total en total';
  }
}

/// Algo del equipo que tiene una persona, o un pedido.
class Prestamo {
  Prestamo(this.m);
  final Map<String, dynamic> m;
  String get id => '${m['id']}';
  String get nombre => '${m['nombre']}';
  String get nombreMostrar => '${m['nombreMostrar'] ?? m['nombre']}';
  String get foto => '${m['foto'] ?? ''}';
  String get texto => '${m['texto'] ?? ''}';
  String get lista => '${m['lista'] ?? ''}';
  String? get icono => m['icono'] as String?;
  bool get activo => m['estado'] == 'activo';
  bool get pendiente => m['estado'] == 'pendiente';
  bool get permanente => m['permanente'] == true;
  bool get esUso => m['tipo'] == 'uso';
  bool get mio => m['mio'] == true;
  bool get preguntar => m['preguntar'] == true;
  bool get preguntarme => m['preguntarme'] == true;
  int get dias => (m['dias'] as num?)?.toInt() ?? 0;
  DateTime? get hasta => DateTime.tryParse('${m['hasta'] ?? ''}');
  String get entrega => '${m['entrega'] ?? ''}';
  String get motivo => '${m['motivo'] ?? ''}';
}

class InventarioRepo {
  InventarioRepo(this.sesion);
  final Sesion sesion;
  Api get _api => sesion.api;
  bool get esPivot => sesion.esAdmin && sesion.adminToken != null;
  Map<String, Object?> get _admin => {'adminToken': sesion.adminToken};

  List<ListaInventario> listas = [];
  List<Prestamo> prestamos = [];
  Map<String, dynamic>? proxima;

  Future<void> cargar() async {
    final r = await _api.get('getInventario', {if (esPivot) ..._admin});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
    listas = [
      for (final l in (r['listas'] as List? ?? const []))
        if (l is Map<String, dynamic>) ListaInventario(l),
    ];
    prestamos = [
      for (final p in (r['prestamos'] as List? ?? const []))
        if (p is Map<String, dynamic>) Prestamo(p),
    ];
    proxima = r['proxima'] is Map<String, dynamic> ? r['proxima'] as Map<String, dynamic> : null;
  }

  Future<void> _ok(Future<Map<String, dynamic>> f) async {
    final r = await f;
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
  }

  Map<String, Object?> _detalle({
    required String listaId,
    String? variante,
    int cantidad = 1,
    Map<String, int>? piezas,
    bool permanente = false,
    String motivo = '',
  }) => {
    'listaId': listaId,
    'variante': ?variante,
    'cantidad': cantidad,
    if (piezas != null && piezas.isNotEmpty)
      'piezas': jsonEncode([
        for (final e in piezas.entries) {'nombre': e.key, 'cantidad': e.value},
      ]),
    'permanente': permanente,
    if (motivo.isNotEmpty) 'motivo': motivo,
  };

  /// Un Pivot registra que alguien tiene algo (queda activo).
  Future<void> registrar({
    required String persona,
    required String listaId,
    String? variante,
    int cantidad = 1,
    Map<String, int>? piezas,
    bool permanente = false,
    String motivo = '',
  }) => _ok(
    _api.post('adminPrestamo', {
      ..._admin,
      'accion': 'registrar',
      'nombre': persona,
      ..._detalle(listaId: listaId, variante: variante, cantidad: cantidad, piezas: piezas, permanente: permanente, motivo: motivo),
    }),
  );

  /// La persona avisa que se llevó algo ('salida') o pide usarlo ('uso').
  Future<void> pedir({
    required String tipo,
    required String listaId,
    String? variante,
    int cantidad = 1,
    Map<String, int>? piezas,
    bool permanente = false,
    String motivo = '',
  }) => _ok(
    _api.post('pedirPrestamo', {
      'tipo': tipo,
      ..._detalle(listaId: listaId, variante: variante, cantidad: cantidad, piezas: piezas, permanente: permanente, motivo: motivo),
    }),
  );

  Future<void> accion(Prestamo p, String accion, {Map<String, Object?> extra = const {}}) =>
      _ok(_api.post('adminPrestamo', {..._admin, 'accion': accion, 'id': p.id, ...extra}));

  Future<void> responder(Prestamo p, {required bool devuelto}) => _ok(_api.post('responderPrestamo', {'id': p.id, 'devuelto': devuelto}));

  Future<void> crearLista({
    required String nombre,
    required String tipo,
    required String icono,
    String unidad = '',
    List<Pieza> piezas = const [],
    required List<(String, int)> stock,
  }) => _ok(
    _api.post('adminInventarioLista', {
      ..._admin,
      'accion': 'crear',
      'nombre': nombre,
      'tipo': tipo,
      'icono': icono,
      'unidad': unidad,
      'piezas': jsonEncode([for (final p in piezas) p.json]),
      'stock': jsonEncode([
        for (final (v, n) in stock) {'variante': v, 'cantidad': n},
      ]),
    }),
  );

  Future<void> editarLista(ListaInventario l, {String? nombre, String? icono, String? unidad, List<Pieza>? piezas, List<(String, int)>? stock}) => _ok(
    _api.post('adminInventarioLista', {
      ..._admin,
      'accion': 'editar',
      'id': l.id,
      'nombre': ?nombre,
      'icono': ?icono,
      'unidad': ?unidad,
      if (piezas != null) 'piezas': jsonEncode([for (final p in piezas) p.json]),
      if (stock != null)
        'stock': jsonEncode([
          for (final (v, n) in stock) {'variante': v, 'cantidad': n},
        ]),
    }),
  );

  Future<void> borrarLista(ListaInventario l) => _ok(_api.post('adminInventarioLista', {..._admin, 'accion': 'borrar', 'id': l.id}));
}
