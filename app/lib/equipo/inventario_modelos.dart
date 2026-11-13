import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../sesion/sesion.dart';

/// Íconos para elegir al crear una lista (se guarda la clave).
// Lista amplia y general (Victor, 2026-11-13), para cualquier deporte.
const iconosInventario = <String, IconData>{
  'equipamiento': Icons.content_paste_rounded,
  'patines': Icons.roller_skating_rounded,
  'protecciones': Icons.health_and_safety_outlined,
  'casco': Icons.sports_motorsports_outlined,
  'conos': Icons.change_history_rounded,
  'balones': Icons.sports_soccer_rounded,
  'basquet': Icons.sports_basketball_outlined,
  'voley': Icons.sports_volleyball_outlined,
  'pesas': Icons.fitness_center_rounded,
  'cronometro': Icons.timer_outlined,
  'silbato': Icons.campaign_outlined,
  'ropa': Icons.checkroom_rounded,
  'uniforme': Icons.dry_cleaning_outlined,
  'botiquin': Icons.medical_services_outlined,
  'medicina': Icons.medication_outlined,
  'curitas': Icons.healing_outlined,
  'hielo': Icons.ac_unit_rounded,
  'agua': Icons.water_drop_outlined,
  'comida': Icons.restaurant_outlined,
  'cinta': Icons.straighten_rounded,
  'herramientas': Icons.build_outlined,
  'limpieza': Icons.cleaning_services_outlined,
  'electronica': Icons.speaker_outlined,
  'camara': Icons.photo_camera_outlined,
  'bolsa': Icons.shopping_bag_outlined,
  'caja': Icons.inventory_2_outlined,
  'merch': Icons.storefront_outlined,
  'documentos': Icons.description_outlined,
  'otro': Icons.category_outlined,
};

/// Secciones del Inventario (Victor, 2026-11-13).
const seccionesInventario = {
  'equipamiento': ('Equipamiento deportivo', 'Lo que se presta: patines, protecciones…', Icons.content_paste_rounded),
  'entrenamiento': ('Insumos de entrenamiento', 'Conos, cintas, balones…', Icons.change_history_rounded),
  'botiquin': ('Botiquín', 'Qué hay, cuándo vence y qué reponer', Icons.medical_services_outlined),
  'miscelaneo': ('Misceláneos', 'Todo lo demás', Icons.category_outlined),
};

IconData iconoInventario(String? clave) => iconosInventario[clave] ?? Icons.inventory_2_outlined;

/// Una fila de stock: talla, pieza o '' (unidades e insumos).
class StockFila {
  StockFila(Map m)
    : variante = '${m['variante'] ?? ''}',
      cantidad = (m['cantidad'] as num?)?.toInt() ?? 0,
      enUso = (m['enUso'] as num?)?.toInt() ?? 0,
      libres = (m['libres'] as num?)?.toInt() ?? 0,
      vence = DateTime.tryParse('${m['vence'] ?? ''}'),
      minimo = (m['minimo'] as num?)?.toInt();
  final String variante;
  final int cantidad, enUso, libres;
  final DateTime? vence;
  final int? minimo;
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
      seccion = '${m['seccion'] ?? 'equipamiento'}',
      activa = m['activa'] != false,
      setsCompletos = (m['sets']?['completos'] as num?)?.toInt() ?? 0,
      setsLibres = (m['sets']?['libres'] as num?)?.toInt() ?? 0;
  final String id, nombre, tipo, seccion;
  final bool activa;
  final String? icono, unidad, sistema;
  final List<Pieza> piezas;
  final List<StockFila> stock;
  final int setsCompletos, setsLibres;

  bool get esTallas => tipo == 'tallas';
  bool get esSet => tipo == 'set';
  bool get esInsumo => tipo == 'insumo';

  /// Botiquín e insumos: un renglón por cosa, con cantidad (y vencimiento).
  bool get porRenglones => tipo == 'insumo' || seccion == 'botiquin';
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
    if (porRenglones) {
      final faltan = stock.where((s) => s.minimo != null && s.cantidad <= s.minimo!).length;
      final vencen = stock.where((s) => s.vence != null && s.vence!.difference(DateTime.now()).inDays <= 30).length;
      return [
        '${stock.length} ${stock.length == 1 ? 'cosa' : 'cosas'}',
        if (faltan > 0) '$faltan por reponer',
        if (vencen > 0) '$vencen por vencer',
      ].join(' · ');
    }
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

  /// 'dia' (mismo día), 'fecha' (hasta una fecha) o 'indefinido' (aviso cada N días).
  String? get plazo => m['plazo'] as String?;
  int get recordarCada => (m['recordarCada'] as num?)?.toInt() ?? 7;
}

/// Regla de préstamo por equipo (como la asistencia anticipada).
class ReglaPrestamo {
  ReglaPrestamo(this.m);
  final Map<String, dynamic> m;
  String get id => '${m['id']}';
  String? get equipo => (m['equipo'] as String?)?.isEmpty == true ? null : m['equipo'] as String?;
  String get presta => '${m['presta'] ?? 'excepcional'}';
  String? get listaId => m['lista_id'] as String?;
  DateTime? get desde => DateTime.tryParse('${m['desde'] ?? ''}');
  DateTime? get hasta => DateTime.tryParse('${m['hasta'] ?? ''}');
  bool get activa => m['activa'] != false;
  String get nota => '${m['nota'] ?? ''}';

  static const opciones = {
    'si': ('Se presta', 'Quien lo pide lo usa ese día sin esperar aprobación.', Icons.check_circle_outline_rounded),
    'excepcional': ('Solo en casos excepcionales', 'Ej. rodilleras mojadas u olvidó el casco: lo pide y un Pivot lo aprueba.', Icons.help_outline_rounded),
    'no': ('No se presta', 'No se puede pedir.', Icons.block_rounded),
  };
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

  /// Qué dice la regla de préstamo para quien mira: 'si' | 'excepcional' | 'no'.
  String reglaPrestamo = 'excepcional';

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
    reglaPrestamo = '${(r['reglaPrestamo'] as Map?)?['presta'] ?? 'excepcional'}';
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
    String seccion = 'equipamiento',
    String unidad = '',
    List<Pieza> piezas = const [],
    required List<(String, int)> stock,
    List<Map<String, Object?>>? renglones,
  }) => _ok(
    _api.post('adminInventarioLista', {
      ..._admin,
      'accion': 'crear',
      'nombre': nombre,
      'tipo': tipo,
      'icono': icono,
      'seccion': seccion,
      'unidad': unidad,
      if (renglones != null) 'stock': jsonEncode(renglones),
      'piezas': jsonEncode([for (final p in piezas) p.json]),
      if (renglones == null)
        'stock': jsonEncode([
          for (final (v, n) in stock) {'variante': v, 'cantidad': n},
        ]),
    }),
  );

  /// Botiquín e insumos: guarda todos los renglones (nombre, cantidad, vence, mínimo).
  Future<void> guardarRenglones(ListaInventario l, List<Map<String, Object?>> renglones) =>
      _ok(_api.post('adminInventarioLista', {..._admin, 'accion': 'editar', 'id': l.id, 'stock': jsonEncode(renglones)}));

  /// Interruptor de la tarjeta: ocultar o mostrar una lista (no borra nada).
  Future<void> activarLista(ListaInventario l, bool activa) =>
      _ok(_api.post('adminInventarioLista', {..._admin, 'accion': 'editar', 'id': l.id, 'activa': activa}));

  /// "Se usó": descuenta del botiquín o de los insumos.
  Future<void> registrarUso(ListaInventario l, String variante, int cantidad) =>
      _ok(_api.post('registrarUsoInventario', {if (esPivot) ..._admin, 'listaId': l.id, 'variante': variante, 'cantidad': cantidad}));

  Future<List<ReglaPrestamo>> reglas() async {
    final r = await _api.get('getReglasPrestamo', _admin);
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
    return [
      for (final x in (r['reglas'] as List? ?? const []))
        if (x is Map<String, dynamic>) ReglaPrestamo(x),
    ];
  }

  Future<void> guardarRegla(Map<String, Object?> datos, {String? id}) =>
      _ok(_api.post('adminReglaPrestamo', {..._admin, 'accion': id == null ? 'crear' : 'editar', 'id': ?id, ...datos}));

  Future<void> borrarRegla(ReglaPrestamo r) => _ok(_api.post('adminReglaPrestamo', {..._admin, 'accion': 'borrar', 'id': r.id}));

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
