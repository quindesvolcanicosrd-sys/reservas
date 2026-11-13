import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/asistente.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../equipo/equipo_modelos.dart';
import '../eventos/widgets_comunes.dart';
import '../sesion/sesion.dart';

/// Persona activa con sus clases y puntos por período (0 a 12 meses),
/// contados igual que recalcular-categorias (`adminDatosCategorias`).
class _Persona {
  _Persona(Map<String, dynamic> m)
    : nombre = '${m['nombre']}',
      nombreMostrar = '${m['nombreMostrar'] ?? m['nombre']}',
      foto = '${m['foto'] ?? ''}',
      categoria = '${m['categoria'] ?? ''}',
      auto = (m['modo'] ?? 'auto') == 'auto',
      estado = '${m['estado'] ?? ''}',
      usaEquipo = m['usaEquipo'] == true,
      clases = [for (final x in (m['clases'] as List? ?? const [])) (x as num)],
      puntos = [for (final x in (m['puntos'] as List? ?? const [])) (x as num)];
  final String nombre, nombreMostrar, foto, categoria, estado;
  final bool auto, usaEquipo;
  final List<num> clases, puntos;

  /// Entra en el cálculo automático (no fijada a mano, no congelada).
  bool get evaluable => auto && !const ['Lesionadx', 'De viaje', 'Técnico'].contains(estado);
  num c(int v) => v < clases.length ? clases[v] : 0;
  num p(int v) => v < puntos.length ? puntos[v] : 0;
}

/// Lo que pide una Equipo.
class _Regla {
  _Regla({required this.clases, required this.puntos, required this.logica, required this.ventana, required this.subir, required this.gracia});
  factory _Regla.de(Map<String, dynamic> t) {
    int n(Object? v) => (v as num?)?.toInt() ?? int.tryParse('$v') ?? 0;
    return _Regla(
      clases: n(t['min_clases']),
      puntos: n(t['min_puntos']),
      logica: t['logica'] == 'Y' ? 'Y' : 'O',
      ventana: n(t['ventana_meses']).clamp(1, 12),
      subir: n(t['meses_consecutivos_ascenso']).clamp(1, 12),
      gracia: n(t['meses_gracia_demotion']).clamp(0, 12),
    );
  }
  int clases, puntos, ventana, subir, gracia;
  String logica;

  _Regla copia() => _Regla(clases: clases, puntos: puntos, logica: logica, ventana: ventana, subir: subir, gracia: gracia);

  /// 'clases', 'puntos', 'o' (cualquiera) o 'y' (los dos).
  String get modo => clases > 0 && puntos > 0 ? logica.toLowerCase() : (puntos > 0 ? 'puntos' : 'clases');

  /// Igual que el servidor: un mínimo en 0 siempre se cumple.
  bool cumple(_Persona x) {
    final c = x.c(ventana) >= clases, p = x.p(ventana) >= puntos;
    return logica == 'Y' ? c && p : c || p;
  }

  String get periodo => ventana == 1 ? 'en el último mes' : 'en los últimos $ventana meses';

  String get texto {
    final partes = [if (clases > 0) clases == 1 ? '1 clase' : '$clases clases', if (puntos > 0) '$puntos puntos'];
    if (partes.isEmpty) return 'No pide un mínimo';
    return '${partes.join(logica == 'Y' ? ' y ' : ' o ')} $periodo';
  }
}

/// Ajustes de la liga → Equipos y puntos (Victor, 2026-11-13):
/// cada una explicada en palabras y con cuántas personas la cumplen hoy.
/// Tocar una abre un asistente por pasos con ejemplos del equipo.
class CategoriasScreen extends StatefulWidget {
  const CategoriasScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<CategoriasScreen> createState() => _CategoriasScreenState();
}

class _CategoriasScreenState extends State<CategoriasScreen> {
  List<Map<String, dynamic>>? _tiers;
  List<_Persona> _gente = const [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final api = widget.sesion.api;
      final token = {'adminToken': widget.sesion.adminToken};
      final r = await Future.wait([api.get('getTiers', token), api.get('adminDatosCategorias', token)]);
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
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  Map<String, dynamic>? _debajo(int i) => i + 1 < _tiers!.length ? _tiers![i + 1] : null;

  Future<void> _abrir(int i) async {
    final t = _tiers![i];
    if (t['es_default'] == true) return;
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _CategoriaAsistente(sesion: widget.sesion, tier: t, debajo: _debajo(i), gente: _gente),
      ),
    );
    if (ok == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${t['nombre']} actualizada. Se aplica en el próximo cálculo.')));
      await _cargar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final l = _tiers;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Equipos y puntos', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: l == null
            ? Center(key: const ValueKey('c'), child: _error == null ? const PivotCargando() : Text(_error!))
            : ListView(
                key: const ValueKey('l'),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                    child: Text(
                      'Lo que pide cada equipo para mantenerse o subir. Toca uno para cambiarlo: verás a quién del equipo afectaría antes de guardar.',
                      style: TextStyle(fontSize: 13.5, height: 1.35, color: p.textoSecundario),
                    ),
                  ),
                  for (final (i, t) in l.indexed) _tarjeta(context, i, t),
                ],
              ),
      ),
    );
  }

  Widget _tarjeta(BuildContext context, int i, Map<String, dynamic> t) {
    final p = context.pivot;
    final piso = t['es_default'] == true;
    final r = _Regla.de(t);
    final miembros = _gente.where((x) => x.categoria == t['nombre'] && x.evaluable && !x.usaEquipo).toList();
    final cumplen = miembros.where(r.cumple).length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: piso ? null : () => _abrir(i),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Row(
              children: [
                Icon(Icons.workspace_premium_outlined, color: p.marcaTexto),
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
                      Text(piso ? 'Es el equipo inicial: no pide un mínimo.' : 'Para mantenerse: ${r.texto}.', style: TextStyle(fontSize: 14, color: p.texto)),
                      if (!piso) ...[
                        const SizedBox(height: 2),
                        Text(
                          miembros.isEmpty
                              ? 'Para subir: ${r.subir} ${r.subir == 1 ? 'mes' : 'meses'} seguidos cumpliéndolo.'
                              : 'Hoy lo cumplen $cumplen de ${miembros.length}.',
                          style: TextStyle(fontSize: 13, color: p.textoSecundario),
                        ),
                      ],
                    ],
                  ),
                ),
                if (!piso) Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _Paso { que, periodo, clases, puntos, subirBajar, resumen }

/// Asistente para cambiar lo que pide una Equipo, con el efecto
/// sobre personas reales del equipo en cada paso.
class _CategoriaAsistente extends StatefulWidget {
  const _CategoriaAsistente({required this.sesion, required this.tier, required this.debajo, required this.gente});
  final Sesion sesion;
  final Map<String, dynamic> tier;
  final Map<String, dynamic>? debajo;
  final List<_Persona> gente;

  @override
  State<_CategoriaAsistente> createState() => _CategoriaAsistenteState();
}

class _CategoriaAsistenteState extends State<_CategoriaAsistente> {
  late final _Regla _antes = _Regla.de(widget.tier);
  late final _Regla _r = _antes.copia();
  _Paso _paso = _Paso.que;
  bool _adelante = true;
  bool _ocupado = false;

  String get _nombre => '${widget.tier['nombre']}';
  String get _nombreDebajo => '${widget.debajo?['nombre'] ?? 'la inicial'}';

  List<_Paso> get _pasos => [
    _Paso.que,
    _Paso.periodo,
    if (_r.modo != 'puntos') _Paso.clases,
    if (_r.modo != 'clases') _Paso.puntos,
    _Paso.subirBajar,
    _Paso.resumen,
  ];

  /// Quienes están en esta Equipo y entran en el cálculo.
  List<_Persona> get _miembros => widget.gente.where((x) => x.categoria == _nombre && x.evaluable && !x.usaEquipo).toList();

  /// Quienes podrían subir a esta (están en la de abajo).
  List<_Persona> get _candidatos => widget.debajo == null ? const [] : widget.gente.where((x) => x.categoria == _nombreDebajo && x.evaluable).toList();

  void _ir(int d) {
    final l = _pasos;
    final i = l.indexOf(_paso) + d;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= l.length) return;
    setState(() {
      _adelante = d > 0;
      _paso = l[i];
    });
  }

  void _modo(String m) => setState(() {
    switch (m) {
      case 'clases':
        if (_r.clases == 0) _r.clases = _antes.clases > 0 ? _antes.clases : 3;
        _r.puntos = 0;
        _r.logica = 'Y';
      case 'puntos':
        if (_r.puntos == 0) _r.puntos = _antes.puntos > 0 ? _antes.puntos : 10;
        _r.clases = 0;
        _r.logica = 'Y';
      default:
        if (_r.clases == 0) _r.clases = _antes.clases > 0 ? _antes.clases : 3;
        if (_r.puntos == 0) _r.puntos = _antes.puntos > 0 ? _antes.puntos : 10;
        _r.logica = m == 'y' ? 'Y' : 'O';
    }
  });

  Future<void> _guardar() async {
    setState(() => _ocupado = true);
    final t = widget.tier;
    try {
      final r = await widget.sesion.api.post('upsertTier', {
        'adminToken': widget.sesion.adminToken,
        'id': t['id'],
        'orden': t['orden'],
        'nombre': t['nombre'],
        'min_clases': _r.clases,
        'min_puntos': _r.puntos,
        'ventana_meses': _r.ventana,
        'logica': _r.logica,
        'es_default': t['es_default'] == true ? 'true' : '',
        'meses_consecutivos_ascenso': _r.subir,
        'meses_gracia_demotion': _r.gracia,
        'dividir_puntos_mitad': t['dividir_puntos_mitad'] == true ? 'true' : '',
        'califica_fondos_viaje': t['califica_fondos_viaje'] == true ? 'true' : '',
      });
      if (r['error'] != null) throw ApiException('${r['error']}');
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _pasos;
    return Asistente(
      titulo: _nombre,
      indice: l.indexOf(_paso),
      total: l.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _Paso.que => '¿Qué cuenta para mantenerse en $_nombre?',
        _Paso.periodo => '¿En cuánto tiempo?',
        _Paso.clases => '¿Cuántas clases?',
        _Paso.puntos => '¿Cuántos puntos?',
        _Paso.subirBajar => 'Subir y bajar',
        _Paso.resumen => 'Revisa el cambio',
      },
      ayuda: switch (_paso) {
        _Paso.que => 'Hoy pide ${_antes.texto}.',
        _Paso.periodo => 'Las clases y puntos se cuentan hacia atrás desde hoy.',
        _Paso.clases => 'Cuenta cada clase a la que fue, a horario o tarde.',
        _Paso.puntos => 'Los puntos suman asistencia (1 por clase, 0,5 si llega tarde), tareas y rachas.',
        _Paso.subirBajar => 'Cuánto hay que cumplir para subir y cuánto margen hay antes de bajar.',
        _Paso.resumen => null,
      },
      cuerpo: switch (_paso) {
        _Paso.que => _pasoQue(context),
        _Paso.periodo => _pasoPeriodo(context),
        _Paso.clases => _pasoNumero(context, true),
        _Paso.puntos => _pasoNumero(context, false),
        _Paso.subirBajar => _pasoSubirBajar(context),
        _Paso.resumen => _pasoResumen(context),
      },
      textoBoton: _paso == _Paso.resumen ? 'Guardar' : 'Siguiente',
      alContinuar: _paso == _Paso.resumen ? _guardar : () => _ir(1),
      ocupado: _ocupado,
    );
  }

  Widget _pasoQue(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      for (final (m, icono, titulo, texto) in const [
        ('clases', Icons.event_available_rounded, 'Solo clases', 'Ir a un mínimo de clases.'),
        ('puntos', Icons.star_outline_rounded, 'Solo puntos', 'Sumar un mínimo de puntos (clases, tareas y rachas).'),
        ('o', Icons.alt_route_rounded, 'Clases o puntos', 'Alcanza con cumplir uno de los dos.'),
        ('y', Icons.join_inner_rounded, 'Clases y puntos', 'Hay que cumplir los dos.'),
      ])
        OpcionAsistente(icono: icono, titulo: titulo, texto: texto, activa: _r.modo == m, alTocar: () => _modo(m)),
      const SizedBox(height: 8),
      _Impacto(antes: _antes, ahora: _r, miembros: _miembros, candidatos: _candidatos, nombre: _nombre, debajo: _nombreDebajo),
    ],
  );

  Widget _pasoPeriodo(BuildContext context) {
    final p = context.pivot;
    final desde = DateTime(Fechas.hoy().year, Fechas.hoy().month - _r.ventana, Fechas.hoy().day);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final v in const [1, 2, 3, 6, 12])
              ChoiceChip(label: Text(v == 1 ? 'Último mes' : 'Últimos $v meses'), selected: _r.ventana == v, onSelected: (_) => setState(() => _r.ventana = v)),
          ],
        ),
        const SizedBox(height: 12),
        Text('Se cuenta desde el ${Fechas.corta(desde)}.', style: TextStyle(color: p.textoSecundario)),
        const SizedBox(height: 16),
        _Impacto(antes: _antes, ahora: _r, miembros: _miembros, candidatos: _candidatos, nombre: _nombre, debajo: _nombreDebajo),
      ],
    );
  }

  Widget _pasoNumero(BuildContext context, bool clases) {
    final p = context.pivot;
    final valor = clases ? _r.clases : _r.puntos;
    final paso = clases ? 1 : (valor >= 20 ? 5 : 1);
    void cambiar(int v) => setState(() => clases ? _r.clases = v : _r.puntos = v);
    // Referencia: lo que hace hoy el equipo en ese período.
    final ms = _miembros.isNotEmpty ? _miembros : widget.gente.where((x) => x.evaluable).toList();
    final valores = [for (final x in ms) clases ? x.c(_r.ventana) : x.p(_r.ventana)]..sort();
    final mediana = valores.isEmpty ? null : valores[valores.length ~/ 2];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton.filledTonal(iconSize: 28, onPressed: valor - paso >= 1 ? () => cambiar(valor - paso) : null, icon: const Icon(Icons.remove_rounded)),
            SizedBox(
              width: 120,
              child: Column(
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 150),
                    child: Text(
                      '$valor',
                      key: ValueKey(valor),
                      style: TextStyle(fontSize: 44, fontWeight: FontWeight.w900, color: p.texto),
                    ),
                  ),
                  Text(clases ? (valor == 1 ? 'clase' : 'clases') : 'puntos', style: TextStyle(color: p.textoSecundario)),
                ],
              ),
            ),
            IconButton.filledTonal(
              iconSize: 28,
              onPressed: valor + paso <= (clases ? 60 : 500) ? () => cambiar(valor + paso) : null,
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '${_r.periodo[0].toUpperCase()}${_r.periodo.substring(1)}.',
          textAlign: TextAlign.center,
          style: TextStyle(color: p.textoSecundario),
        ),
        if (mediana != null) ...[
          const SizedBox(height: 4),
          Text(
            'Como referencia: la mitad de ${_miembros.isNotEmpty ? _nombre : 'el equipo'} tiene ${numero(mediana)} ${clases ? 'clases' : 'puntos'} o más ${_r.periodo}.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
          ),
        ],
        const SizedBox(height: 16),
        _Impacto(antes: _antes, ahora: _r, miembros: _miembros, candidatos: _candidatos, nombre: _nombre, debajo: _nombreDebajo),
      ],
    );
  }

  Widget _pasoSubirBajar(BuildContext context) {
    final p = context.pivot;
    Widget fila(String titulo, String texto, int valor, int min, void Function(int) cambiar) => Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                ),
                Text(texto, style: TextStyle(fontSize: 13.5, color: p.textoSecundario)),
              ],
            ),
          ),
          IconButton(onPressed: valor > min ? () => setState(() => cambiar(valor - 1)) : null, icon: const Icon(Icons.remove_circle_outline_rounded)),
          SizedBox(
            width: 28,
            child: Text(
              '$valor',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: p.texto),
            ),
          ),
          IconButton(onPressed: valor < 12 ? () => setState(() => cambiar(valor + 1)) : null, icon: const Icon(Icons.add_circle_outline_rounded)),
        ],
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        fila(
          'Para subir',
          'Desde $_nombreDebajo, ${_r.subir} ${_r.subir == 1 ? 'mes' : 'meses seguidos'} cumpliendo lo de $_nombre.',
          _r.subir,
          1,
          (v) => _r.subir = v,
        ),
        fila(
          'Para bajar',
          _r.gracia == 0
              ? 'Si deja de cumplir, baja en el siguiente cálculo.'
              : 'Si deja de cumplir, tiene ${_r.gracia} ${_r.gracia == 1 ? 'mes' : 'meses'} para ponerse al día antes de bajar.',
          _r.gracia,
          0,
          (v) => _r.gracia = v,
        ),
      ],
    );
  }

  Widget _pasoResumen(BuildContext context) {
    final p = context.pivot;
    String linea(String t, String a, String b) => a == b ? '$t: $b' : '$t: $a → $b';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final t in [
                linea('Para mantenerse', _antes.texto, _r.texto),
                linea('Para subir', '${_antes.subir} meses', '${_r.subir} meses'),
                linea('Margen antes de bajar', '${_antes.gracia} meses', '${_r.gracia} meses'),
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(t, style: TextStyle(fontSize: 14.5, height: 1.3, color: p.texto)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _Impacto(antes: _antes, ahora: _r, miembros: _miembros, candidatos: _candidatos, nombre: _nombre, debajo: _nombreDebajo, completo: true),
        const SizedBox(height: 12),
        Text(
          'Nadie cambia de equipo al guardar: se aplica en el próximo cálculo, con los meses de margen que elegiste. Quien tiene el equipo fijado a mano, está de viaje o lesionadx no cambia.',
          style: TextStyle(fontSize: 13, height: 1.35, color: p.textoSecundario),
        ),
      ],
    );
  }
}

/// Efecto del cambio sobre el equipo de hoy, con nombres y un aviso amable
/// si la regla queda muy por encima de lo que el equipo está haciendo.
class _Impacto extends StatelessWidget {
  const _Impacto({
    required this.antes,
    required this.ahora,
    required this.miembros,
    required this.candidatos,
    required this.nombre,
    required this.debajo,
    this.completo = false,
  });
  final _Regla antes, ahora;
  final List<_Persona> miembros, candidatos;
  final String nombre, debajo;
  final bool completo;

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
          for (final x in l.take(completo ? 30 : 8))
            Chip(
              visualDensity: VisualDensity.compact,
              avatar: AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: 22),
              label: Text(x.nombreMostrar),
            ),
          if (l.length > (completo ? 30 : 8)) Chip(visualDensity: VisualDensity.compact, label: Text('+${l.length - (completo ? 30 : 8)}')),
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
