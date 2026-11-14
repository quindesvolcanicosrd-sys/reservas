import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../ajustes/recorte_foto.dart';
import '../core/api.dart';
import '../core/asistente.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/selector_plazo.dart';
import '../core/tema.dart';
import '../equipo/equipo_modelos.dart';
import '../eventos/widgets_comunes.dart';
import '../sesion/sesion.dart';

/// Persona con clases y puntos por mes calendario (`adminDatosCategorias`):
/// índice 0 = mes en curso, 1 = último mes cerrado… hasta 12.
class _Persona {
  _Persona(Map<String, dynamic> m)
    : nombre = '${m['nombre']}',
      nombreMostrar = '${m['nombreMostrar'] ?? m['nombre']}',
      foto = '${m['foto'] ?? ''}',
      categoria = '${m['categoria'] ?? ''}',
      auto = (m['modo'] ?? 'auto') == 'auto',
      estado = '${m['estado'] ?? ''}',
      usaEquipo = m['usaEquipo'] == true,
      clasesMes = [for (final x in (m['clasesMes'] as List? ?? const [])) (x as num)],
      tareasMes = [for (final x in (m['tareasMes'] as List? ?? const [])) (x as num)],
      puntosMes = [for (final x in (m['puntosMes'] as List? ?? const [])) (x as num)];
  final String nombre, nombreMostrar, foto, categoria, estado;
  final bool auto, usaEquipo;
  final List<num> clasesMes, tareasMes, puntosMes;

  /// Entra en el cálculo automático (no fijada a mano, no congelada).
  bool get evaluable => auto && !const ['Lesionadx', 'De viaje', 'Técnico'].contains(estado);
  static num _suma(List<num> l, int meses) {
    num t = 0;
    for (var i = 1; i <= meses && i < l.length; i++) {
      t += l[i];
    }
    return t;
  }

  /// Meses cerrados (como el servidor: en noviembre se mira octubre).
  num c(int meses) => _suma(clasesMes, meses);
  num p(int meses, String fuente) => _suma(fuente == 'todos' ? puntosMes : tareasMes, meses);
}

/// Lo que pide un equipo (fila de `config_tiers`).
class _Regla {
  _Regla({
    required this.clases,
    required this.puntos,
    required this.logica,
    required this.ventana,
    required this.unidad,
    required this.fuente,
    required this.subir,
    required this.gracia,
    required this.graciaUnidad,
  });
  factory _Regla.de(Map<String, dynamic> t) {
    int n(Object? v) => (v as num?)?.toInt() ?? int.tryParse('$v') ?? 0;
    return _Regla(
      clases: n(t['min_clases']),
      puntos: n(t['min_puntos']),
      logica: t['logica'] == 'Y' ? 'Y' : 'O',
      ventana: n(t['ventana_meses']).clamp(1, 99),
      unidad: '${t['periodo_unidad'] ?? 'mes'}',
      fuente: t['puntos_fuente'] == 'todos' ? 'todos' : 'tareas',
      subir: n(t['meses_consecutivos_ascenso']).clamp(1, 24),
      gracia: n(t['meses_gracia_demotion']).clamp(0, 99),
      graciaUnidad: '${t['gracia_unidad'] ?? 'mes'}',
    );
  }
  int clases, puntos, ventana, subir, gracia;
  String logica, unidad, fuente, graciaUnidad;

  _Regla copia() => _Regla(
    clases: clases,
    puntos: puntos,
    logica: logica,
    ventana: ventana,
    unidad: unidad,
    fuente: fuente,
    subir: subir,
    gracia: gracia,
    graciaUnidad: graciaUnidad,
  );

  int get meses => mesesDePlazo(ventana, unidad);

  /// 'clases', 'puntos', 'o' (cualquiera) o 'y' (los dos).
  String get modo => clases > 0 && puntos > 0 ? logica.toLowerCase() : (puntos > 0 ? 'puntos' : 'clases');

  /// Igual que el servidor: un mínimo en 0 siempre se cumple.
  bool cumple(_Persona x) {
    final c = x.c(meses) >= clases, p = x.p(meses, fuente) >= puntos;
    return logica == 'Y' ? c && p : c || p;
  }

  String get periodo => ventana == 1
      ? switch (unidad) {
          'dia' => 'en el último día',
          'semana' => 'por semana',
          'anio' => 'al año',
          _ => 'al mes',
        }
      : 'en ${unidad == 'semana' ? 'las últimas' : 'los últimos'} ${textoPlazo(ventana, unidad)}';

  String get texto {
    final partes = [
      if (clases > 0) clases == 1 ? '1 clase asistida' : '$clases clases asistidas',
      if (puntos > 0) '$puntos puntos${fuente == 'tareas' ? ' por tareas' : ''}',
    ];
    if (partes.isEmpty) return 'No pide un mínimo';
    return '${partes.join(logica == 'Y' ? ' y ' : ' o ')} $periodo';
  }

  String get textoSubir => '$subir ${subir == 1 ? 'mes' : 'meses seguidos'} cumpliéndolo';
  String get textoBajar => gracia == 0 ? 'Baja en el siguiente cálculo' : '${textoPlazo(gracia, graciaUnidad)} para ponerse al día';

  Map<String, Object?> params(Map<String, dynamic> t) => {
    if (t['id'] != null) 'id': t['id'],
    'orden': t['orden'],
    'nombre': t['nombre'],
    'min_clases': clases,
    'min_puntos': puntos,
    'ventana_meses': ventana,
    'logica': logica,
    'es_default': t['es_default'] == true ? 'true' : '',
    'meses_consecutivos_ascenso': subir,
    'meses_gracia_demotion': gracia,
    'dividir_puntos_mitad': t['dividir_puntos_mitad'] == true ? 'true' : '',
    'califica_fondos_viaje': t['califica_fondos_viaje'] == true ? 'true' : '',
    'puntos_fuente': fuente,
    'periodo_unidad': unidad,
    'gracia_unidad': graciaUnidad,
    'requisitos': jsonEncode(t['requisitos'] ?? const {}),
  };
}

/// Guarda un equipo con `upsertTier`. Lanza ApiException si falla.
Future<Map<String, dynamic>> _guardarTier(Sesion s, Map<String, Object?> params) async {
  final r = await s.api.post('upsertTier', {'adminToken': s.adminToken, ...params});
  if (r['error'] != null) throw ApiException('${r['error']}');
  return (r['tier'] as Map<String, dynamic>?) ?? const {};
}

/// Elegir, encuadrar y subir un logo (de la liga o de un equipo).
Future<String?> elegirYSubirLogo(BuildContext context, Sesion s, String destino) async {
  XFile? img;
  try {
    img = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1200, maxHeight: 1200, imageQuality: 92);
  } catch (_) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir la galería.')));
    return null;
  }
  if (img == null || !context.mounted) return null;
  final original = await img.readAsBytes();
  if (!context.mounted) return null;
  final bytes = await RecorteFotoScreen.abrir(context, original);
  if (bytes == null) return null;
  final r = await s.api.post('adminSubirLogo', {'adminToken': s.adminToken, 'destino': destino, 'base64Data': 'data:image/jpeg;base64,${base64Encode(bytes)}'});
  if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo subir.'}');
  return '${r['url'] ?? ''}';
}

/// Logo redondo de un equipo o de la liga; sin logo, la inicial.
class LogoEquipo extends StatelessWidget {
  const LogoEquipo({super.key, required this.nombre, this.url, this.tamano = 44});
  final String nombre;
  final String? url;
  final double tamano;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final u = url ?? '';
    return ClipOval(
      child: SizedBox(
        width: tamano,
        height: tamano,
        child: u.isNotEmpty ? Image.network(u, fit: BoxFit.cover, errorBuilder: (_, _, _) => _inicial(p)) : _inicial(p),
      ),
    );
  }

  Widget _inicial(PivotPaleta p) => Container(
    color: p.suave,
    alignment: Alignment.center,
    child: Text(
      nombre.isEmpty ? '?' : nombre.characters.first.toUpperCase(),
      style: TextStyle(fontSize: tamano * 0.42, fontWeight: FontWeight.w900, color: p.sobreSuave),
    ),
  );
}

String _fechaLarga(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : Fechas.corta(d);
}

/// Ajustes de la liga → Equipos y puntos (Victor, 2026-11-13). Cada equipo
/// en palabras y con cuántos lo cumplen hoy; tocar uno abre su resumen con
/// filas que se cambian por separado. El asistente es solo para crear.
/// También: cuándo se aplican los cambios, cuánto vale cada marca y qué
/// cuenta como clase.
class CategoriasScreen extends StatefulWidget {
  const CategoriasScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<CategoriasScreen> createState() => _CategoriasScreenState();
}

class _CategoriasScreenState extends State<CategoriasScreen> {
  List<Map<String, dynamic>>? _tiers;
  List<_Persona> _gente = const [];
  Map<String, dynamic> _reglas = const {};
  String? _error;

  Sesion get s => widget.sesion;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final token = {'adminToken': s.adminToken};
      final r = await Future.wait([s.api.get('getTiers', token), s.api.get('adminDatosCategorias', token), s.api.get('getReglasLiga', token)]);
      final l = [
        for (final t in (r[0]['tiers'] as List? ?? const []))
          if (t is Map<String, dynamic>) t,
      ]..sort((a, b) => ((a['orden'] as num?) ?? 0).compareTo((b['orden'] as num?) ?? 0));
      final g = [
        for (final p in (r[1]['personas'] as List? ?? const []))
          if (p is Map<String, dynamic>) _Persona(p),
      ];
      if (mounted) {
        setState(() {
          _tiers = l;
          _gente = g;
          _reglas = r[2];
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  void _aviso(String t) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(t)));

  Future<void> _abrirEquipo(int i) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _EquipoScreen(sesion: s, tiers: _tiers!, indice: i, gente: _gente),
      ),
    );
    await _cargar();
  }

  Future<void> _nuevo() async {
    final l = _tiers!;
    final inicial = l.firstWhere((t) => t['es_default'] == true, orElse: () => l.last);
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _NuevoEquipoAsistente(sesion: s, inicial: inicial, gente: _gente),
      ),
    );
    if (ok == true) {
      _aviso('Equipo creado. Quedó justo encima de ${inicial['nombre']}.');
      await _cargar();
    }
  }

  Future<void> _guardarReglas(Map<String, Object?> cambios, {String ok = 'Guardado'}) async {
    try {
      final r = await s.api.post('adminReglasLiga', {'adminToken': s.adminToken, ...cambios});
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
      if (mounted) setState(() => _reglas = r);
      _aviso(ok);
    } catch (e) {
      _aviso(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.');
    }
  }

  // ─── Cuándo se aplican los cambios de equipo ───────────────────────────
  Map<String, dynamic> get _corte => (_reglas['corte'] as Map<String, dynamic>?) ?? const {'modo': 'revisar', 'dia': 1, 'avisoDias': 3};

  /// Fechas reales del próximo corte para un modo/día/aviso dados.
  (DateTime, DateTime) _fechasCorte(int dia, int aviso) {
    final h = Fechas.hoy();
    final c = h.day < dia ? DateTime(h.year, h.month, dia) : DateTime(h.year, h.month + 1, dia);
    return (c, c.subtract(Duration(days: aviso)));
  }

  String _textoCorte(String modo, int dia, int aviso) {
    final (c, llega) = _fechasCorte(dia, aviso);
    if (modo == 'auto') return 'Los cambios se aplican apenas alguien cumple o deja de cumplir lo de su equipo, con el margen de cada uno.';
    return 'La lista llegará a la Bandeja el ${Fechas.corta(llega)}. Tendrás hasta el ${Fechas.corta(c)} para revisarla; lo que no revises se aplicará automáticamente ese día.';
  }

  Future<void> _editarCorte() async {
    var modo = '${_corte['modo'] ?? 'revisar'}';
    var dia = (_corte['dia'] as num?)?.toInt() ?? 1;
    var aviso = (_corte['avisoDias'] as num?)?.toInt() ?? 3;
    final ok = await _hoja(
      titulo: 'Cuándo se aplican los cambios',
      contenido: (set) => [
        for (final (k, t, d, i) in const [
          (
            'revisar',
            'Revisar antes',
            'Los cambios llegan a la Bandeja antes del día de corte para aprobarlos o dejarlos como están.',
            Icons.fact_check_outlined,
          ),
          ('auto', 'Automático', 'Se aplican solos, sin revisión.', Icons.bolt_rounded),
        ])
          OpcionAsistente(icono: i, titulo: t, texto: d, activa: modo == k, alTocar: () => set(() => modo = k)),
        if (modo == 'revisar') ...[
          const SizedBox(height: 8),
          Text(
            'Día de corte (de cada mes)',
            style: TextStyle(fontWeight: FontWeight.w700, color: context.pivot.texto),
          ),
          const SizedBox(height: 6),
          SelectorNumero(valor: dia, min: 1, max: 28, etiqueta: 'día', alCambiar: (v) => set(() => dia = v.toInt())),
          const SizedBox(height: 12),
          Text(
            'La lista llega antes',
            style: TextStyle(fontWeight: FontWeight.w700, color: context.pivot.texto),
          ),
          const SizedBox(height: 6),
          SelectorNumero(valor: aviso, min: 1, max: 20, etiqueta: aviso == 1 ? 'día antes' : 'días antes', alCambiar: (v) => set(() => aviso = v.toInt())),
        ],
        const SizedBox(height: 12),
        _Nota(texto: _textoCorte(modo, dia, aviso)),
      ],
    );
    if (ok == true) {
      await _guardarReglas({
        'corte': jsonEncode({'modo': modo, 'dia': dia, 'avisoDias': aviso}),
      });
    }
  }

  // ─── Puntos por asistencia (con fecha de inicio: regla de oro) ─────────
  Map<String, dynamic> get _puntosActual =>
      ((_reglas['puntos'] as Map?)?['actual'] as Map<String, dynamic>?) ?? const {'aTiempo': 1, 'tarde': 0.5, 'tardeCuenta': true};
  Map<String, dynamic>? get _puntosProxima => (_reglas['puntos'] as Map?)?['proxima'] as Map<String, dynamic>?;

  static String _n(num v) => numero(v).replaceAll('.', ',');

  String _textoPuntos(Map<String, dynamic> v) {
    final tarde = v['tardeCuenta'] == false ? 'llegar tarde no suma' : 'tarde ${_n((v['tarde'] as num?) ?? 0.5)}';
    return 'A tiempo ${_n((v['aTiempo'] as num?) ?? 1)} · $tarde';
  }

  Future<void> _editarPuntos() async {
    final base = _puntosProxima ?? _puntosActual;
    num aTiempo = (base['aTiempo'] as num?) ?? 1;
    num tarde = (base['tarde'] as num?) ?? 0.5;
    var tardeCuenta = base['tardeCuenta'] != false;
    final manana = Fechas.hoy().add(const Duration(days: 1));
    final h = Fechas.hoy();
    var desde = DateTime.tryParse('${_puntosProxima?['desde'] ?? ''}') ?? DateTime(h.year, h.month + 1, 1);
    if (desde.isBefore(manana)) desde = manana;
    final ok = await _hoja(
      titulo: 'Puntos por asistencia',
      contenido: (set) => [
        Text(
          'Por clase a tiempo',
          style: TextStyle(fontWeight: FontWeight.w700, color: context.pivot.texto),
        ),
        SelectorNumero(valor: aTiempo, min: 0, max: 10, paso: 0.5, decimales: true, etiqueta: 'puntos', alCambiar: (v) => set(() => aTiempo = v)),
        const SizedBox(height: 8),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Llegar tarde suma puntos'),
          value: tardeCuenta,
          onChanged: (v) => set(() => tardeCuenta = v),
        ),
        if (tardeCuenta) SelectorNumero(valor: tarde, min: 0, max: 10, paso: 0.5, decimales: true, etiqueta: 'puntos', alCambiar: (v) => set(() => tarde = v)),
        const SizedBox(height: 12),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.event_rounded),
          title: Text('Empieza el ${Fechas.corta(desde)}'),
          subtitle: const Text('Desde mañana o después.'),
          trailing: const Icon(Icons.edit_calendar_outlined),
          onTap: () async {
            final f = await showDatePicker(context: context, firstDate: manana, lastDate: manana.add(const Duration(days: 730)), initialDate: desde);
            if (f != null) set(() => desde = f);
          },
        ),
        const _Nota(texto: 'Los puntos ya ganados nunca cambian: el valor nuevo se aplica solo a clases desde esa fecha.'),
      ],
    );
    if (ok == true) {
      final iso = '${desde.year}-${desde.month.toString().padLeft(2, '0')}-${desde.day.toString().padLeft(2, '0')}';
      await _guardarReglas({
        'puntos': jsonEncode({'desde': iso, 'aTiempo': aTiempo, 'tarde': tarde, 'tardeCuenta': tardeCuenta}),
      }, ok: 'Guardado. Empieza el ${Fechas.corta(desde)}.');
    }
  }

  // ─── Qué cuenta como clase ──────────────────────────────────────────────
  static const _tiposEvento = ['Entrenamiento', 'Partido', 'Evento', 'Otro', 'Externa'];
  Map<String, dynamic> get _reglasLiga => (_reglas['reglas'] as Map<String, dynamic>?) ?? const {};

  String get _textoQueCuenta {
    final t = _reglasLiga['tiposCuentan'];
    final base = t is List && t.isNotEmpty ? t.map((x) => x == 'Externa' ? 'con otros equipos' : '$x'.toLowerCase()).join(', ') : 'Todo suma';
    return '${base[0].toUpperCase()}${base.substring(1)}${_reglasLiga['tardeCuentaClase'] == false ? ' · llegar tarde no suma' : ''}';
  }

  Future<void> _editarQueCuenta() async {
    final t = _reglasLiga['tiposCuentan'];
    var todo = t is! List || t.isEmpty;
    final sel = <String>{if (t is List) ...t.map((x) => '$x')};
    var tarde = _reglasLiga['tardeCuentaClase'] != false;
    final ok = await _hoja(
      titulo: 'Qué cuenta como clase',
      contenido: (set) => [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Todo suma'),
          subtitle: const Text('Cualquier evento con asistencia tomada.'),
          value: todo,
          onChanged: (v) => set(() => todo = v),
        ),
        if (!todo)
          for (final x in _tiposEvento)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(x == 'Externa' ? 'Entrenar con otros equipos' : x),
              value: sel.contains(x),
              onChanged: (v) => set(() => v == true ? sel.add(x) : sel.remove(x)),
            ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Las llegadas tarde suman para el equipo'),
          subtitle: Text(
            tarde
                ? 'Si alguien llega tarde, esa clase igual cuenta para lo que pide su equipo (por ejemplo, las 3 clases al mes).'
                : 'Si alguien llega tarde, esa clase no cuenta para lo que pide su equipo. Los puntos por llegar tarde no cambian.',
          ),
          value: tarde,
          onChanged: (v) => set(() => tarde = v),
        ),
      ],
    );
    if (ok == true) {
      await _guardarReglas({
        'reglas': jsonEncode({'tiposCuentan': todo || sel.isEmpty ? null : sel.toList(), 'tardeCuentaClase': tarde}),
      });
    }
  }

  /// Hoja corta con contenido y "Guardar". Devuelve true si se guarda.
  Future<bool?> _hoja({required String titulo, required List<Widget> Function(StateSetter set) contenido}) => showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (h) => StatefulBuilder(
      builder: (h, set) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(h).height * 0.88),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(titulo, style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                ...contenido(set),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.of(h).pop(true), child: const Text('Guardar')),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l = _tiers;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Equipos y puntos', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: l == null
            ? Center(key: const ValueKey('c'), child: _error == null ? const PivotCargando(centrarEnPantalla: true) : Text(_error!))
            : RefreshIndicator(
                key: const ValueKey('l'),
                onRefresh: _cargar,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                  children: [
                    _Seccion('EQUIPOS'),
                    for (final (i, t) in l.indexed) _tarjeta(context, i, t),
                    const SizedBox(height: 8),
                    _Seccion('REGLAS'),
                    _Fila(
                      icono: Icons.event_repeat_rounded,
                      titulo: 'Cuándo se aplican los cambios',
                      texto: _corte['modo'] == 'auto'
                          ? 'Automático'
                          : 'Revisar antes · se aplican el ${Fechas.corta(_fechasCorte((_corte['dia'] as num?)?.toInt() ?? 1, 0).$1)}',
                      alTocar: _editarCorte,
                    ),
                    _Fila(
                      icono: Icons.star_outline_rounded,
                      titulo: 'Puntos por asistencia',
                      texto: [
                        _textoPuntos(_puntosActual),
                        if (_puntosProxima != null) 'Desde el ${_fechaLarga('${_puntosProxima!['desde']}')}: ${_textoPuntos(_puntosProxima!)}',
                      ].join('\n'),
                      alTocar: _editarPuntos,
                    ),
                    _Fila(icono: Icons.event_available_outlined, titulo: 'Qué cuenta como clase', texto: _textoQueCuenta, alTocar: _editarQueCuenta),
                    _Fila(
                      icono: Icons.history_rounded,
                      titulo: 'Historial de cambios',
                      texto: 'Últimos 6 meses',
                      alTocar: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => HistorialAjustesScreen(sesion: s))),
                    ),
                  ],
                ),
              ),
      ),
      floatingActionButton: l == null ? null : FloatingActionButton(tooltip: 'Nuevo equipo', onPressed: _nuevo, child: const Icon(Icons.add_rounded)),
    );
  }

  Widget _tarjeta(BuildContext context, int i, Map<String, dynamic> t) {
    final p = context.pivot;
    final piso = t['es_default'] == true;
    final r = _Regla.de(t);
    final miembros = _gente.where((x) => x.categoria == t['nombre'] && x.evaluable && !x.usaEquipo).toList();
    final cumplen = miembros.where(r.cumple).length;
    final total = _gente.where((x) => x.categoria == t['nombre']).length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: () => _abrirEquipo(i),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
            child: Row(
              children: [
                LogoEquipo(nombre: '${t['nombre']}', url: t['logo'] as String?),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${t['nombre']}',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: p.texto),
                      ),
                      const SizedBox(height: 2),
                      Text(piso ? 'Equipo inicial: no pide un mínimo.' : 'Pide ${r.texto}.', style: TextStyle(fontSize: 14, color: p.texto)),
                      const SizedBox(height: 2),
                      Text(
                        piso || miembros.isEmpty ? '$total ${total == 1 ? 'persona' : 'personas'}' : 'Hoy lo cumplen $cumplen de ${miembros.length}.',
                        style: TextStyle(fontSize: 13, color: p.textoSecundario),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Seccion extends StatelessWidget {
  const _Seccion(this.texto);
  final String texto;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
    child: Text(
      texto,
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: context.pivot.textoSecundario),
    ),
  );
}

class _Fila extends StatelessWidget {
  const _Fila({required this.icono, required this.titulo, required this.texto, required this.alTocar, this.final_});
  final IconData icono;
  final String titulo, texto;
  final VoidCallback? alTocar;
  final Widget? final_;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          leading: Icon(icono, color: p.marcaTexto),
          title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(texto),
          trailing: final_ ?? (alTocar == null ? null : const Icon(Icons.chevron_right_rounded)),
          onTap: alTocar,
        ),
      ),
    );
  }
}

class _Nota extends StatelessWidget {
  const _Nota({required this.texto});
  final String texto;
  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.tarjeta - 4)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 20, color: p.sobreSuave),
          const SizedBox(width: 10),
          Expanded(
            child: Text(texto, style: TextStyle(fontSize: 13.5, height: 1.35, color: p.sobreSuave)),
          ),
        ],
      ),
    );
  }
}

/// Historial de cambios en los ajustes de la liga (Victor, 2026-11-13):
/// tarjetas con quién lo hizo, qué cambió en palabras, buscador y filtros.
class HistorialAjustesScreen extends StatefulWidget {
  const HistorialAjustesScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<HistorialAjustesScreen> createState() => _HistorialAjustesScreenState();
}

class _HistorialAjustesScreenState extends State<HistorialAjustesScreen> {
  List<Map<String, dynamic>>? _items;
  int _desdeAnio = DateTime.now().year;
  String _periodo = '6m'; // '6m' | 'mes' | 'anio:<n>' | 'todo' | 'rango'
  DateTimeRange? _rango;
  String _grupo = '';
  String _q = '';
  String? _error;

  static const _grupos = {
    'equipos': ('Equipos', Icons.groups_outlined),
    'puntos': ('Puntos y reglas', Icons.rule_rounded),
    'tesoreria': ('Tesorería', Icons.account_balance_wallet_outlined),
    'liga': ('Liga', Icons.stadium_outlined),
  };

  static String _grupoDe(String clave) => switch (clave) {
    'equipo' || 'corte' => 'equipos',
    'puntos' || 'tiposCuentan' || 'tardeCuentaClase' || 'toleranciaMin' || 'rectificacionDias' || 'eventosMinPersonas' || 'inactividadDias' => 'puntos',
    'cuenta' || 'transparencia' => 'tesoreria',
    _ => 'liga',
  };

  static const _nombres = {
    'corte': 'Cuándo se aplican los cambios de equipo',
    'puntos': 'Puntos por asistencia',
    'tiposCuentan': 'Qué cuenta como clase',
    'tardeCuentaClase': 'Llegadas tarde para el equipo',
    'toleranciaMin': 'Tolerancia de llegada',
    'rectificacionDias': 'Días para revisar rectificaciones',
    'eventosMinPersonas': 'Mínimo de personas por evento',
    'inactividadDias': 'Inactividad',
    'equipo': 'Equipos',
    'logo': 'Logo',
    'cuenta': 'Cuenta de Tesorería',
    'transparencia': 'Transparencia de Tesorería',
  };

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  (String?, String?) get _fechas {
    final h = Fechas.hoy();
    if (_periodo == '6m') return (_iso(DateTime(h.year, h.month - 6, h.day)), null);
    if (_periodo == 'mes') return (_iso(DateTime(h.year, h.month, 1)), null);
    if (_periodo.startsWith('anio:')) {
      final a = int.parse(_periodo.substring(5));
      return ('$a-01-01', '$a-12-31');
    }
    if (_periodo == 'rango' && _rango != null) return (_iso(_rango!.start), _iso(_rango!.end));
    return (null, null);
  }

  Future<void> _cargar() async {
    setState(() => _items = null);
    try {
      final (d, h) = _fechas;
      final r = await widget.sesion.api.get('adminHistorialAjustes', {'adminToken': widget.sesion.adminToken, 'desde': ?d, 'hasta': ?h});
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
      if (!mounted) return;
      setState(() {
        _items = [
          for (final x in (r['historial'] as List? ?? const []))
            if (x is Map<String, dynamic>) x,
        ];
        _desdeAnio = (r['desdeAnio'] as num?)?.toInt() ?? DateTime.now().year;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => (_items = const [], _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.'));
    }
  }

  static String _v(Object? x, [String unidad = '']) {
    if (x == null) return '—';
    if (x is bool) return x ? 'sí' : 'no';
    if (x is num) return '${numero(x).replaceAll('.', ',')}${unidad.isEmpty ? '' : ' $unidad'}';
    if (x is List) return x.isEmpty ? 'todo suma' : x.join(', ');
    return '$x';
  }

  static const _camposEquipo = {
    'nombre': 'nombre',
    'min_clases': 'clases',
    'min_puntos': 'puntos',
    'ventana_meses': 'período',
    'periodo_unidad': 'unidad del período',
    'logica': 'clases y/o puntos',
    'meses_consecutivos_ascenso': 'meses para subir',
    'meses_gracia_demotion': 'margen para bajar',
    'gracia_unidad': 'unidad del margen',
    'dividir_puntos_mitad': 'puntos a la mitad',
    'califica_fondos_viaje': 'fondos de viaje',
    'puntos_fuente': 'qué puntos cuentan',
    'orden': 'orden',
    'requisitos': 'requisitos del enlace',
    'logo': 'logo',
  };

  /// Qué cambió, en palabras.
  String _detalle(Map<String, dynamic> h) {
    final clave = '${h['clave']}';
    final antes = h['antes'], despues = h['despues'];
    switch (clave) {
      case 'equipo':
        final nombre = despues is Map ? despues['nombre'] : (antes is Map ? antes['nombre'] : 'un equipo');
        if (despues == null) return 'Borró el equipo $nombre.';
        if (antes == null) return 'Creó el equipo $nombre.';
        final cambios = <String>[];
        if (antes is Map && despues is Map) {
          for (final e in _camposEquipo.entries) {
            final a = antes[e.key], d = despues[e.key];
            if ('$a' != '$d') cambios.add(e.key == 'nombre' ? 'se llama $d (antes $a)' : '${e.value}: ${_v(a is Map ? null : a)} → ${_v(d is Map ? null : d)}');
          }
        }
        return cambios.isEmpty ? 'Editó $nombre.' : 'En $nombre: ${cambios.join('; ')}.';
      case 'puntos':
        final d = despues is Map ? despues : const {};
        final a = antes is Map ? antes : const {};
        final desde = DateTime.tryParse('${d['desde'] ?? ''}');
        return 'A tiempo ${_v(a['aTiempo'])} → ${_v(d['aTiempo'])}; tarde ${a['tardeCuenta'] == false ? 'no suma' : _v(a['tarde'])} → ${d['tardeCuenta'] == false ? 'no suma' : _v(d['tarde'])}'
            '${desde == null ? '' : ', desde el ${Fechas.corta(desde)}'}.';
      case 'corte':
        String t(Object? x) =>
            x is Map ? (x['modo'] == 'auto' ? 'automático' : 'revisar antes, día ${x['dia']}, la lista llega ${x['avisoDias']} días antes') : '—';
        return '${t(antes)} → ${t(despues)}.';
      case 'toleranciaMin':
        return '${_v(antes, 'minutos')} → ${_v(despues, 'minutos')}.';
      case 'rectificacionDias' || 'inactividadDias':
        return '${_v(antes, 'días')} → ${_v(despues, 'días')}.';
      case 'eventosMinPersonas':
        return '${_v(antes, 'personas')} → ${_v(despues, 'personas')}.';
      case 'tardeCuentaClase':
        return despues == false ? 'Llegar tarde ya no cuenta para el equipo.' : 'Llegar tarde cuenta para el equipo.';
      case 'tiposCuentan':
        return '${_v(antes)} → ${_v(despues)}.';
      case 'logo':
        final d = despues is Map ? despues['destino'] : '';
        return d == 'liga'
            ? 'Cambió el logo de la liga.'
            : ('$d'.startsWith('medio-') ? 'Cambió el logo de un medio de pago.' : 'Cambió el logo de un equipo.');
      case 'cuenta':
        final n = despues is Map ? despues['nombre'] : (antes is Map ? antes['nombre'] : 'una cuenta');
        if (despues == null) return 'Borró la cuenta $n.';
        if (antes == null) return 'Creó la cuenta $n.';
        if (despues is Map && despues['archivada'] == true) return 'Archivó la cuenta $n.';
        return 'Editó la cuenta $n.';
      case 'transparencia':
        return despues == true ? 'Activó la transparencia: el equipo ve los totales.' : 'Desactivó la transparencia.';
    }
    return '${_v(antes)} → ${_v(despues)}.';
  }

  Future<void> _elegirPeriodo() async {
    final anios = [for (var a = DateTime.now().year; a >= _desdeAnio; a--) a];
    final v = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (s) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(title: const Text('Este mes'), onTap: () => Navigator.of(s).pop('mes')),
            ListTile(title: const Text('Últimos 6 meses'), onTap: () => Navigator.of(s).pop('6m')),
            for (final a in anios) ListTile(title: Text('Año $a'), onTap: () => Navigator.of(s).pop('anio:$a')),
            ListTile(title: const Text('Todo'), onTap: () => Navigator.of(s).pop('todo')),
            ListTile(title: const Text('Elegir fechas'), trailing: const Icon(Icons.date_range_rounded), onTap: () => Navigator.of(s).pop('rango')),
          ],
        ),
      ),
    );
    if (v == null || !mounted) return;
    if (v == 'rango') {
      final r = await showDateRangePicker(context: context, firstDate: DateTime(_desdeAnio), lastDate: Fechas.hoy(), initialDateRange: _rango);
      if (r == null) return;
      _rango = r;
    }
    _periodo = v;
    _cargar();
  }

  String get _textoPeriodo => switch (_periodo) {
    'mes' => 'Este mes',
    '6m' => 'Últimos 6 meses',
    'todo' => 'Todo',
    'rango' => _rango == null ? 'Fechas' : '${Fechas.corta(_rango!.start)} – ${Fechas.corta(_rango!.end)}',
    _ => 'Año ${_periodo.substring(5)}',
  };

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final todos = _items;
    final q = _q.trim().toLowerCase();
    final l = todos == null
        ? null
        : [
            for (final h in todos)
              if ((_grupo.isEmpty || _grupoDe('${h['clave']}') == _grupo) &&
                  (q.isEmpty || '${_nombres['${h['clave']}'] ?? ''} ${_detalle(h)} ${h['por']}'.toLowerCase().contains(q)))
                h,
          ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Historial de cambios', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: TextField(
              onChanged: (v) => setState(() => _q = v),
              decoration: const InputDecoration(hintText: 'Buscar (persona, equipo, regla…)', prefixIcon: Icon(Icons.search_rounded), isDense: true),
            ),
          ),
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: [
                ActionChip(avatar: const Icon(Icons.date_range_rounded, size: 18), label: Text(_textoPeriodo), onPressed: _elegirPeriodo),
                const SizedBox(width: 8),
                for (final e in _grupos.entries) ...[
                  FilterChip(
                    showCheckmark: false,
                    avatar: Icon(e.value.$2, size: 18),
                    label: Text(e.value.$1),
                    selected: _grupo == e.key,
                    onSelected: (v) => setState(() => _grupo = v ? e.key : ''),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: l == null
                  ? const PivotCargando()
                  : l.isEmpty
                  ? Center(
                      child: Text(_error ?? 'Sin cambios con estos filtros.', style: TextStyle(color: p.textoSecundario)),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
                      itemCount: l.length,
                      itemBuilder: (_, i) {
                        final h = l[i];
                        final f = DateTime.tryParse('${h['fecha']}')?.toLocal();
                        final grupo = _grupos[_grupoDe('${h['clave']}')]!;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Material(
                            color: p.tarjeta,
                            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  h['automatico'] == true
                                      ? CircleAvatar(
                                          radius: 20,
                                          backgroundColor: p.suave,
                                          child: Icon(Icons.bolt_rounded, color: p.sobreSuave),
                                        )
                                      : AvatarPersona(nombre: '${h['por']}', foto: '${h['foto'] ?? ''}', tamano: 40),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Icon(grupo.$2, size: 16, color: p.marcaTexto),
                                            const SizedBox(width: 6),
                                            Expanded(
                                              child: Text(
                                                _nombres['${h['clave']}'] ?? '${h['clave']}',
                                                style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(_detalle(h), style: TextStyle(color: p.texto, height: 1.3)),
                                        const SizedBox(height: 6),
                                        Text(
                                          '${h['por']}${f == null ? '' : ' · ${Fechas.corta(f)} a las ${f.hour.toString().padLeft(2, '0')}:${f.minute.toString().padLeft(2, '0')}'}',
                                          style: TextStyle(fontSize: 12.5, color: p.textoSecundario),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Resumen de un equipo: cada fila se cambia por separado en una hoja corta
/// que muestra a quién afecta (Victor, 2026-11-13).
class _EquipoScreen extends StatefulWidget {
  const _EquipoScreen({required this.sesion, required this.tiers, required this.indice, required this.gente});
  final Sesion sesion;
  final List<Map<String, dynamic>> tiers;
  final int indice;
  final List<_Persona> gente;

  @override
  State<_EquipoScreen> createState() => _EquipoScreenState();
}

class _EquipoScreenState extends State<_EquipoScreen> {
  late Map<String, dynamic> t = Map.of(widget.tiers[widget.indice]);
  bool _ocupado = false;

  Sesion get s => widget.sesion;
  bool get _piso => t['es_default'] == true;
  String get _nombre => '${t['nombre']}';
  Map<String, dynamic>? get _debajo {
    final i = widget.tiers.indexWhere((x) => x['id'] == t['id']);
    return i + 1 < widget.tiers.length ? widget.tiers[i + 1] : null;
  }

  String get _nombreDebajo => '${_debajo?['nombre'] ?? 'el equipo inicial'}';
  String get _inicial => '${widget.tiers.firstWhere((x) => x['es_default'] == true, orElse: () => widget.tiers.last)['nombre']}';
  List<_Persona> get _miembros => widget.gente.where((x) => x.categoria == _nombre && x.evaluable && !x.usaEquipo).toList();
  List<_Persona> get _candidatos => _debajo == null ? const [] : widget.gente.where((x) => x.categoria == _nombreDebajo && x.evaluable).toList();
  Map<String, dynamic> get _req => (t['requisitos'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};

  void _aviso(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));

  Future<void> _guardar(Map<String, Object?> cambios, {_Regla? regla, String ok = 'Guardado'}) async {
    setState(() => _ocupado = true);
    try {
      final base = (regla ?? _Regla.de(t)).params({...t, ...cambios});
      final nuevo = await _guardarTier(s, {...base, ...cambios.map((k, v) => MapEntry(k, v is Map ? jsonEncode(v) : v))});
      if (!mounted) return;
      setState(() {
        if (nuevo.isNotEmpty) t = Map.of(nuevo);
        _ocupado = false;
      });
      _aviso(ok);
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      _aviso(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.');
    }
  }

  Future<bool?> _hoja(String titulo, List<Widget> Function(StateSetter set) contenido, {String boton = 'Guardar'}) => showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (h) => StatefulBuilder(
      builder: (h, set) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(h).height * 0.9),
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(h).bottom),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(titulo, style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                ...contenido(set),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.of(h).pop(true), child: Text(boton)),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Widget _impacto(_Regla antes, _Regla ahora) =>
      _Impacto(antes: antes, ahora: ahora, miembros: _miembros, candidatos: _candidatos, nombre: _nombre, debajo: _nombreDebajo);

  Future<void> _mantener() async {
    final antes = _Regla.de(t);
    final r = antes.copia();
    void modo(String m) {
      switch (m) {
        case 'clases':
          if (r.clases == 0) r.clases = antes.clases > 0 ? antes.clases : 3;
          r.puntos = 0;
          r.logica = 'Y';
        case 'puntos':
          if (r.puntos == 0) r.puntos = antes.puntos > 0 ? antes.puntos : 5;
          r.clases = 0;
          r.logica = 'Y';
        default:
          if (r.clases == 0) r.clases = antes.clases > 0 ? antes.clases : 3;
          if (r.puntos == 0) r.puntos = antes.puntos > 0 ? antes.puntos : 5;
          r.logica = m == 'y' ? 'Y' : 'O';
      }
    }

    final ok = await _hoja('Para mantenerse en $_nombre', (set) {
      final p = context.pivot;
      return [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (m, txt) in const [('clases', 'Solo clases'), ('puntos', 'Solo puntos'), ('o', 'Clases o puntos'), ('y', 'Clases y puntos')])
              ChoiceChip(label: Text(txt), selected: r.modo == m, onSelected: (_) => set(() => modo(m))),
          ],
        ),
        if (r.modo != 'puntos') ...[
          const SizedBox(height: 14),
          Text(
            'Clases asistidas',
            style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
          ),
          SelectorNumero(valor: r.clases, min: 1, max: 60, etiqueta: r.clases == 1 ? 'clase' : 'clases', alCambiar: (v) => set(() => r.clases = v.toInt())),
        ],
        if (r.modo != 'clases') ...[
          const SizedBox(height: 14),
          Text(
            'Puntos',
            style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
          ),
          SelectorNumero(valor: r.puntos, min: 1, max: 500, etiqueta: 'puntos', alCambiar: (v) => set(() => r.puntos = v.toInt())),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [
              ChoiceChip(label: const Text('Solo por tareas'), selected: r.fuente == 'tareas', onSelected: (_) => set(() => r.fuente = 'tareas')),
              ChoiceChip(label: const Text('Todos los puntos'), selected: r.fuente == 'todos', onSelected: (_) => set(() => r.fuente = 'todos')),
            ],
          ),
        ],
        const SizedBox(height: 14),
        Text(
          'En cuánto tiempo',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
        ),
        SelectorPlazo(valor: r.ventana, unidad: r.unidad, max: 52, alCambiar: (v, u) => set(() => (r.ventana = v, r.unidad = u))),
        const SizedBox(height: 8),
        Text(
          r.unidad == 'mes' ? 'Se cuentan meses completos: en diciembre se mira noviembre.' : 'Se cuenta hacia atrás desde hoy.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: p.textoSecundario),
        ),
        const SizedBox(height: 14),
        _Nota(texto: 'Pedirá ${r.texto}.'),
        const SizedBox(height: 12),
        _impacto(antes, r),
      ];
    });
    if (ok == true) await _guardar(const {}, regla: r);
  }

  Future<void> _subir() async {
    final antes = _Regla.de(t);
    final r = antes.copia();
    final ok = await _hoja('Para subir a $_nombre', (set) {
      return [
        SelectorNumero(valor: r.subir, min: 1, max: 12, etiqueta: r.subir == 1 ? 'mes' : 'meses seguidos', alCambiar: (v) => set(() => r.subir = v.toInt())),
        const SizedBox(height: 12),
        _Nota(texto: 'Desde $_nombreDebajo, sube quien cumple lo de $_nombre ${r.textoSubir.replaceFirst(' cumpliéndolo', '')}.'),
      ];
    });
    if (ok == true) await _guardar(const {}, regla: r);
  }

  Future<void> _bajar() async {
    final antes = _Regla.de(t);
    final r = antes.copia();
    final ok = await _hoja('Para bajar de $_nombre', (set) {
      return [
        SelectorPlazo(valor: r.gracia, unidad: r.graciaUnidad, min: 0, max: 52, alCambiar: (v, u) => set(() => (r.gracia = v, r.graciaUnidad = u))),
        const SizedBox(height: 12),
        _Nota(
          texto: r.gracia == 0
              ? 'Si deja de cumplir, baja a $_nombreDebajo en el siguiente cálculo.'
              : 'Si deja de cumplir, tiene ${textoPlazo(r.gracia, r.graciaUnidad)} para ponerse al día antes de bajar a $_nombreDebajo.',
        ),
      ];
    });
    if (ok == true) await _guardar(const {}, regla: r);
  }

  Future<void> _renombrar() async {
    final c = TextEditingController(text: _nombre);
    final n = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Nombre del equipo'),
        content: TextField(controller: c, autofocus: true, textCapitalization: TextCapitalization.words),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text.trim()), child: const Text('Guardar')),
        ],
      ),
    );
    if (n == null || n.isEmpty || n == _nombre) return;
    if (widget.tiers.any((x) => x['id'] != t['id'] && '${x['nombre']}'.toLowerCase() == n.toLowerCase())) {
      _aviso('Ya hay un equipo con ese nombre.');
      return;
    }
    await _guardar({'nombre': n}, ok: 'Ahora se llama $n. Quienes estaban en $_nombre siguen en el equipo.');
  }

  Future<void> _logo() async {
    try {
      final u = await elegirYSubirLogo(context, s, '${t['id']}');
      if (u != null && mounted) {
        setState(() => t['logo'] = u);
        _aviso('Logo actualizado');
      }
    } catch (e) {
      _aviso(e is ApiException ? e.message : 'No se pudo subir el logo.');
    }
  }

  Future<void> _requisitos() async {
    var patines = _req['patinesPropios'] == true;
    var prot = _req['proteccionesPropias'] == true;
    final ok = await _hoja('Entrar con el enlace', (set) {
      return [
        Text('Quien se inscribe con el enlace de $_nombre entra directo si cumple esto:', style: TextStyle(color: context.pivot.textoSecundario)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Patines propios'), value: patines, onChanged: (v) => set(() => patines = v)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Protecciones propias'), value: prot, onChanged: (v) => set(() => prot = v)),
        _Nota(texto: 'Si no lo cumple, entra a $_inicial.'),
      ];
    });
    if (ok == true) {
      await _guardar({
        'requisitos': {'patinesPropios': patines, 'proteccionesPropias': prot},
      });
    }
  }

  String get _textoRequisitos {
    final x = [if (_req['patinesPropios'] == true) 'patines propios', if (_req['proteccionesPropias'] == true) 'protecciones propias'].join(' y ');
    return x.isEmpty ? 'Sin requisitos: entra directo' : 'Pide $x';
  }

  String get _enlace => '${ApiConfig.webAppUrl}/inscripcion/?equipo=${t['codigo_invitacion'] ?? ''}';

  Future<void> _mover(int d) async {
    final otros = widget.tiers.where((x) => x['es_default'] != true).toList();
    final i = otros.indexWhere((x) => x['id'] == t['id']);
    final j = i + d;
    if (i < 0 || j < 0 || j >= otros.length) return;
    final otro = otros[j];
    final miOrden = t['orden'], suOrden = otro['orden'];
    setState(() => _ocupado = true);
    try {
      await _guardarTier(s, {..._Regla.de(otro).params(otro), 'orden': miOrden});
      final nuevo = await _guardarTier(s, {..._Regla.de(t).params(t), 'orden': suOrden});
      if (mounted) Navigator.of(context).pop();
      _aviso(d < 0 ? '${nuevo['nombre']} quedó más arriba' : '${nuevo['nombre']} quedó más abajo');
    } catch (e) {
      if (mounted) setState(() => _ocupado = false);
      _aviso(e is ApiException ? e.message : 'No se pudo cambiar el orden.');
    }
  }

  Future<void> _borrar() async {
    final n = widget.gente.where((x) => x.categoria == _nombre).length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Borrar $_nombre?'),
        content: Text(
          n == 0
              ? 'No hay nadie en este equipo.'
              : '${n == 1 ? 'La persona' : 'Las $n personas'} de $_nombre ${n == 1 ? 'pasa' : 'pasan'} a $_inicial. Sus puntos no cambian.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Borrar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final r = await s.api.post('deleteTier', {'adminToken': s.adminToken, 'id': t['id']});
    if (r['error'] != null) {
      _aviso('${r['error']}');
      return;
    }
    if (mounted) Navigator.of(context).pop();
    _aviso('$_nombre borrado');
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final r = _Regla.de(t);
    final miembros = _miembros;
    final cumplen = miembros.where(r.cumple).length;
    final otros = widget.tiers.where((x) => x['es_default'] != true).toList();
    final pos = otros.indexWhere((x) => x['id'] == t['id']);
    return Scaffold(
      appBar: AppBar(
        title: Text(_nombre, style: const TextStyle(fontWeight: FontWeight.w700)),
        bottom: _ocupado ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2)) : null,
      ),
      body: AbsorbPointer(
        absorbing: _ocupado,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            Center(
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _logo,
                child: Stack(
                  children: [
                    LogoEquipo(nombre: _nombre, url: t['logo'] as String?, tamano: 88),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: CircleAvatar(
                        radius: 15,
                        backgroundColor: p.marca,
                        child: Icon(Icons.edit_rounded, size: 16, color: p.sobreMarca),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                _piso
                    ? 'Equipo inicial: quien se une entra aquí.'
                    : (miembros.isEmpty ? 'Nadie entra hoy en el cálculo.' : 'Hoy lo cumplen $cumplen de ${miembros.length}.'),
                style: TextStyle(color: p.textoSecundario),
              ),
            ),
            const SizedBox(height: 16),
            _Fila(icono: Icons.badge_outlined, titulo: 'Nombre', texto: _nombre, alTocar: _renombrar),
            if (!_piso) ...[
              _Fila(icono: Icons.verified_outlined, titulo: 'Para mantenerse', texto: 'Pide ${r.texto}.', alTocar: _mantener),
              _Fila(icono: Icons.trending_up_rounded, titulo: 'Para subir', texto: 'Desde $_nombreDebajo: ${r.textoSubir}.', alTocar: _subir),
              _Fila(icono: Icons.trending_down_rounded, titulo: 'Para bajar', texto: '${r.textoBajar}.', alTocar: _bajar),
              if (otros.length > 1)
                _Fila(
                  icono: Icons.swap_vert_rounded,
                  titulo: 'Orden',
                  texto: 'Puesto ${pos + 1} de ${otros.length} (el de arriba es el más exigente)',
                  alTocar: null,
                  final_: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(tooltip: 'Más arriba', onPressed: pos > 0 ? () => _mover(-1) : null, icon: const Icon(Icons.arrow_upward_rounded)),
                      IconButton(
                        tooltip: 'Más abajo',
                        onPressed: pos < otros.length - 1 ? () => _mover(1) : null,
                        icon: const Icon(Icons.arrow_downward_rounded),
                      ),
                    ],
                  ),
                ),
            ],
            _Fila(
              icono: Icons.call_split_rounded,
              titulo: 'Puntos a la mitad',
              texto: 'Sus puntos cuentan la mitad para el ranking y los fondos.',
              alTocar: () => _guardar({'dividir_puntos_mitad': t['dividir_puntos_mitad'] == true ? '' : 'true'}),
              final_: Switch(value: t['dividir_puntos_mitad'] == true, onChanged: (v) => _guardar({'dividir_puntos_mitad': v ? 'true' : ''})),
            ),
            _Fila(
              icono: Icons.flight_takeoff_rounded,
              titulo: 'Fondos de viaje',
              texto: 'Quienes están aquí califican para fondos de viaje.',
              alTocar: () => _guardar({'califica_fondos_viaje': t['califica_fondos_viaje'] == true ? '' : 'true'}),
              final_: Switch(value: t['califica_fondos_viaje'] == true, onChanged: (v) => _guardar({'califica_fondos_viaje': v ? 'true' : ''})),
            ),
            _Fila(icono: Icons.rule_rounded, titulo: 'Entrar con el enlace', texto: _textoRequisitos, alTocar: _requisitos),
            _Fila(
              icono: Icons.link_rounded,
              titulo: 'Enlace de invitación',
              texto: _enlace,
              alTocar: () async {
                await Clipboard.setData(ClipboardData(text: _enlace));
                _aviso('Enlace copiado');
              },
              final_: const Icon(Icons.copy_rounded),
            ),
            if (!_piso) ...[
              const SizedBox(height: 16),
              Center(
                child: TextButton.icon(onPressed: _borrar, icon: const Icon(Icons.delete_outline_rounded), label: Text('Borrar $_nombre')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum _Paso { nombre, que, periodo, clases, puntos, subirBajar, resumen }

/// Asistente para crear un equipo nuevo (queda justo encima del inicial).
class _NuevoEquipoAsistente extends StatefulWidget {
  const _NuevoEquipoAsistente({required this.sesion, required this.inicial, required this.gente});
  final Sesion sesion;
  final Map<String, dynamic> inicial;
  final List<_Persona> gente;

  @override
  State<_NuevoEquipoAsistente> createState() => _NuevoEquipoAsistenteState();
}

class _NuevoEquipoAsistenteState extends State<_NuevoEquipoAsistente> {
  final _antes = _Regla(clases: 0, puntos: 0, logica: 'O', ventana: 1, unidad: 'mes', fuente: 'tareas', subir: 3, gracia: 1, graciaUnidad: 'mes');
  late final _Regla _r = _antes.copia()
    ..clases = 2
    ..logica = 'Y';
  final _nombreCtl = TextEditingController();
  _Paso _paso = _Paso.nombre;
  bool _adelante = true, _ocupado = false;

  String get _nombre => _nombreCtl.text.trim().isEmpty ? 'el equipo nuevo' : _nombreCtl.text.trim();
  String get _nombreDebajo => '${widget.inicial['nombre']}';
  List<_Persona> get _candidatos => widget.gente.where((x) => x.categoria == _nombreDebajo && x.evaluable).toList();

  List<_Paso> get _pasos => [
    _Paso.nombre,
    _Paso.que,
    _Paso.periodo,
    if (_r.modo != 'puntos') _Paso.clases,
    if (_r.modo != 'clases') _Paso.puntos,
    _Paso.subirBajar,
    _Paso.resumen,
  ];

  @override
  void dispose() {
    _nombreCtl.dispose();
    super.dispose();
  }

  void _ir(int d) {
    final l = _pasos;
    final i = l.indexOf(_paso) + d;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= l.length) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = d > 0;
      _paso = l[i];
    });
  }

  void _modo(String m) => setState(() {
    switch (m) {
      case 'clases':
        if (_r.clases == 0) _r.clases = 2;
        _r.puntos = 0;
        _r.logica = 'Y';
      case 'puntos':
        if (_r.puntos == 0) _r.puntos = 5;
        _r.clases = 0;
        _r.logica = 'Y';
      default:
        if (_r.clases == 0) _r.clases = 2;
        if (_r.puntos == 0) _r.puntos = 5;
        _r.logica = m == 'y' ? 'Y' : 'O';
    }
  });

  Future<void> _guardar() async {
    setState(() => _ocupado = true);
    final ini = widget.inicial;
    final orden = (ini['orden'] as num?)?.toInt() ?? 1;
    try {
      // Queda justo encima del inicial: el inicial baja un lugar.
      await _guardarTier(widget.sesion, {
        ..._r.params({'orden': orden, 'nombre': _nombreCtl.text.trim(), 'requisitos': const {}}),
      });
      await _guardarTier(widget.sesion, {..._Regla.de(ini).params(ini), 'orden': orden + 1});
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    }
  }

  Widget get _impacto => _Impacto(antes: _antes, ahora: _r, miembros: const [], candidatos: _candidatos, nombre: _nombre, debajo: _nombreDebajo);

  @override
  Widget build(BuildContext context) {
    final l = _pasos;
    final p = context.pivot;
    return Asistente(
      titulo: 'Nuevo equipo',
      indice: l.indexOf(_paso),
      total: l.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _Paso.nombre => '¿Cómo se llama?',
        _Paso.que => '¿Qué pide?',
        _Paso.periodo => '¿En cuánto tiempo?',
        _Paso.clases => '¿Cuántas clases?',
        _Paso.puntos => '¿Cuántos puntos?',
        _Paso.subirBajar => 'Subir y bajar',
        _Paso.resumen => 'Revisa',
      },
      ayuda: switch (_paso) {
        _Paso.nombre => 'Quedará justo encima de $_nombreDebajo.',
        _Paso.periodo => 'Con meses, se cuentan meses completos.',
        _ => null,
      },
      cuerpo: switch (_paso) {
        _Paso.nombre => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
              controller: _nombreCtl,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'Ej. Halcones'),
              onChanged: (_) => setState(() {}),
            ),
          ],
        ),
        _Paso.que => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final (m, icono, titulo, texto) in const [
              ('clases', Icons.event_available_rounded, 'Solo clases', 'Un mínimo de clases asistidas.'),
              ('puntos', Icons.star_outline_rounded, 'Solo puntos', 'Un mínimo de puntos.'),
              ('o', Icons.alt_route_rounded, 'Clases o puntos', 'Basta con uno de los dos.'),
              ('y', Icons.join_inner_rounded, 'Clases y puntos', 'Hay que cumplir los dos.'),
            ])
              OpcionAsistente(icono: icono, titulo: titulo, texto: texto, activa: _r.modo == m, alTocar: () => _modo(m)),
          ],
        ),
        _Paso.periodo => ListView(
          padding: const EdgeInsets.all(16),
          children: [SelectorPlazo(valor: _r.ventana, unidad: _r.unidad, max: 52, alCambiar: (v, u) => setState(() => (_r.ventana = v, _r.unidad = u)))],
        ),
        _Paso.clases => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SelectorNumero(
              valor: _r.clases,
              min: 1,
              max: 60,
              etiqueta: _r.clases == 1 ? 'clase' : 'clases',
              alCambiar: (v) => setState(() => _r.clases = v.toInt()),
            ),
            const SizedBox(height: 16),
            _impacto,
          ],
        ),
        _Paso.puntos => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SelectorNumero(valor: _r.puntos, min: 1, max: 500, etiqueta: 'puntos', alCambiar: (v) => setState(() => _r.puntos = v.toInt())),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              children: [
                ChoiceChip(label: const Text('Solo por tareas'), selected: _r.fuente == 'tareas', onSelected: (_) => setState(() => _r.fuente = 'tareas')),
                ChoiceChip(label: const Text('Todos los puntos'), selected: _r.fuente == 'todos', onSelected: (_) => setState(() => _r.fuente = 'todos')),
              ],
            ),
            const SizedBox(height: 16),
            _impacto,
          ],
        ),
        _Paso.subirBajar => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Para subir desde $_nombreDebajo',
              style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
            ),
            SelectorNumero(
              valor: _r.subir,
              min: 1,
              max: 12,
              etiqueta: _r.subir == 1 ? 'mes' : 'meses seguidos',
              alCambiar: (v) => setState(() => _r.subir = v.toInt()),
            ),
            const SizedBox(height: 16),
            Text(
              'Margen antes de bajar',
              style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
            ),
            SelectorPlazo(
              valor: _r.gracia,
              unidad: _r.graciaUnidad,
              min: 0,
              max: 52,
              alCambiar: (v, u) => setState(() => (_r.gracia = v, _r.graciaUnidad = u)),
            ),
          ],
        ),
        _Paso.resumen => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _Nota(texto: '$_nombre pide ${_r.texto}. Para subir: ${_r.textoSubir}. Para bajar: ${_r.textoBajar.toLowerCase()}.'),
            const SizedBox(height: 12),
            _impacto,
          ],
        ),
      },
      textoBoton: _paso == _Paso.resumen ? 'Crear equipo' : 'Siguiente',
      alContinuar: _paso == _Paso.nombre && _nombreCtl.text.trim().isEmpty ? null : (_paso == _Paso.resumen ? _guardar : () => _ir(1)),
      ocupado: _ocupado,
    );
  }
}

/// Efecto del cambio sobre el equipo de hoy, con nombres y un aviso amable
/// si la regla queda muy por encima de lo que el equipo está haciendo.
class _Impacto extends StatelessWidget {
  const _Impacto({required this.antes, required this.ahora, required this.miembros, required this.candidatos, required this.nombre, required this.debajo});
  final _Regla antes, ahora;
  final List<_Persona> miembros, candidatos;
  final String nombre, debajo;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final cumplenAntes = miembros.where(antes.cumple).length;
    final cumplen = miembros.where(ahora.cumple).length;
    final dejan = miembros.where((x) => antes.cumple(x) && !ahora.cumple(x)).toList();
    final empiezan = miembros.where((x) => !antes.cumple(x) && ahora.cumple(x)).toList();
    final suben = candidatos.where((x) => !x.usaEquipo && ahora.cumple(x)).toList();
    final subenAntes = candidatos.where((x) => !x.usaEquipo && antes.cumple(x)).length;
    final pct = miembros.isEmpty ? 100 : (cumplen * 100 / miembros.length).round();
    final masExigente = cumplen < cumplenAntes;
    final aviso = masExigente && pct < 60;
    final faciles = !masExigente && miembros.isNotEmpty && pct == 100 && suben.length > candidatos.length * 0.6 && candidatos.length >= 3;

    Widget nombres(List<_Persona> l) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final x in l.take(8))
            Chip(
              visualDensity: VisualDensity.compact,
              avatar: AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: 22),
              label: Text(x.nombreMostrar),
            ),
          if (l.length > 8) Chip(visualDensity: VisualDensity.compact, label: Text('+${l.length - 8}')),
        ],
      ),
    );

    return AnimatedSize(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Con esto, hoy',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: p.textoSecundario),
            ),
            const SizedBox(height: 6),
            if (miembros.isNotEmpty) ...[
              Text(
                'Lo cumplen $cumplen de ${miembros.length} personas de $nombre ($pct%).',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.texto),
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: TweenAnimationBuilder<double>(
                  tween: Tween(end: pct / 100),
                  duration: const Duration(milliseconds: 300),
                  builder: (_, v, _) => LinearProgressIndicator(value: v, minHeight: 8, backgroundColor: p.fondo, color: p.marca),
                ),
              ),
            ] else
              Text('Hoy no hay personas en $nombre que entren en el cálculo.', style: TextStyle(color: p.texto)),
            if (dejan.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Dejarían de cumplirlo (${dejan.length}):',
                style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
              ),
              nombres(dejan),
            ],
            if (empiezan.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Empezarían a cumplirlo (${empiezan.length}):',
                style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
              ),
              nombres(empiezan),
            ],
            if (candidatos.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                suben.isEmpty
                    ? 'Nadie de $debajo lo cumpliría para subir.'
                    : 'De $debajo, ${suben.length} lo ${suben.length == 1 ? 'cumpliría' : 'cumplirían'} para subir${suben.length != subenAntes ? ' (antes $subenAntes)' : ''}:',
                style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
              ),
              if (suben.isNotEmpty) nombres(suben),
            ],
            if (aviso || faciles) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.tarjeta - 4)),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.lightbulb_outline_rounded, size: 20, color: p.sobreSuave),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        aviso
                            ? 'Hoy solo $cumplen de ${miembros.length} lo cumplirían. Con la asistencia actual, hacerlo más exigente bajaría a varias personas; quizás convenga esperar a que la asistencia suba o dar más meses de margen.'
                            : 'Casi todo el equipo lo cumple, también en $debajo. Si quieres que $nombre signifique un compromiso mayor, puedes pedir un poco más.',
                        style: TextStyle(fontSize: 13.5, height: 1.35, color: p.sobreSuave),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
