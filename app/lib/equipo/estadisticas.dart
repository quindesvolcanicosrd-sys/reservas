import 'package:flutter/material.dart';

import '../ajustes/componentes.dart';
import '../core/api.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'desglose_screen.dart';
import 'equipo_modelos.dart';
import 'equipo_repo.dart';

/// Un evento con asistencia tomada y cómo le fue a la persona.
class _Ev {
  _Ev(this.fecha, this.estado);
  final DateTime fecha;
  final String? estado; // 'A tiempo', 'Tarde' o null (no fue)
  bool get fue => estado != null;
}

/// Datos de un año (`getEstadisticasPersona`).
class _Anio {
  _Anio(Map<String, dynamic> r)
    : eventos = [
        for (final e in (r['eventos'] as List? ?? const []))
          if (e is Map && DateTime.tryParse('${e['fecha']}') != null) _Ev(DateTime.parse('${e['fecha']}'), e['estado'] == null ? null : '${e['estado']}'),
      ],
      puntos = {
        for (final x in (r['puntos'] as List? ?? const []))
          if (x is Map) (x['mes'] as num).toInt(): x.cast<String, dynamic>(),
      },
      anios = [for (final a in (r['anios'] as List? ?? const [])) (a as num).toInt()],
      progreso = r['progreso'] is Map ? (r['progreso'] as Map).cast<String, dynamic>() : null;
  final List<_Ev> eventos;
  final Map<int, Map<String, dynamic>> puntos;
  final List<int> anios;
  final Map<String, dynamic>? progreso;

  List<_Ev> delMes(int mes) => [
    for (final e in eventos)
      if (e.fecha.month == mes) e,
  ];
  num pts(int mes, String k) => (puntos[mes]?[k] as num?) ?? 0;
}

/// Estadísticas de una persona (Victor, 2026-11-13): pantalla propia, desde
/// Mi perfil ("Mis estadísticas") y desde la ficha de Equipo ("Ver
/// estadísticas"). Año y mes elegibles, porcentajes siempre en %, lecturas
/// concretas ("del 1 al 13 de noviembre fuiste a 5 clases…"), gráfico de
/// asistencia o puntos por mes y la tarjeta de Equipo con lo que
/// falta, sin regañar.
class EstadisticasScreen extends StatefulWidget {
  const EstadisticasScreen({super.key, required this.repo, required this.username, required this.nombre});
  final EquipoRepo repo;
  final String username;
  final String nombre;

  static Future<void> abrir(BuildContext context, EquipoRepo repo, Integrante p) =>
      SubAjustes.abrir(context, EstadisticasScreen(repo: repo, username: p.username, nombre: p.nombreMostrar));

  @override
  State<EstadisticasScreen> createState() => _EstadisticasScreenState();
}

class _EstadisticasScreenState extends State<EstadisticasScreen> {
  static DateTime get _hoy => Fechas.hoy();
  late int _anio = _hoy.year;
  late int _mes = _hoy.month;
  final Map<int, _Anio> _datos = {};
  String? _error;
  bool _verPuntos = false;

  EquipoRepo get repo => widget.repo;
  bool get _yo => widget.username.toLowerCase() == (repo.sesion.nombre ?? '').toLowerCase();

  @override
  void initState() {
    super.initState();
    repo.cargar();
    _cargar(_anio);
  }

  Future<void> _cargar(int anio) async {
    if (_datos.containsKey(anio)) return;
    try {
      final r = await repo.sesion.api.get('getEstadisticasPersona', {
        'nombreUsuario': widget.username,
        'anio': anio,
        if (repo.esAdmin) 'adminToken': repo.sesion.adminToken,
      });
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
      if (mounted) setState(() => _datos[anio] = _Anio(r));
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  Future<void> _elegirAnio(int a) async {
    setState(() {
      _anio = a;
      _mes = a == _hoy.year ? _hoy.month : 12;
    });
    await _cargar(a);
    // Enero: la comparación con diciembre necesita el año anterior.
    if (_mes == 1) await _cargar(a - 1);
  }

  /// Meses elegibles del año (hasta el actual).
  List<int> get _meses => [for (var m = 1; m <= (_anio == _hoy.year ? _hoy.month : 12); m++) m];

  static int? _pct(List<_Ev> l) => l.isEmpty ? null : (l.where((e) => e.fue).length * 100 / l.length).round();

  String _mesTxt(int anio, int mes) => Fechas.mes(DateTime(anio, mes));

  /// El mes anterior (puede ser diciembre del año pasado).
  (int, int) _anterior(int anio, int mes) => mes == 1 ? (anio - 1, 12) : (anio, mes - 1);
  List<_Ev>? _eventosDe(int anio, int mes) => _datos[anio]?.delMes(mes);

  /// Lecturas concretas del mes elegido, sin tono de reproche.
  List<(IconData, String)> _lecturas() {
    final out = <(IconData, String)>[];
    final ahora = _eventosDe(_anio, _mes) ?? const [];
    final (aA, mA) = _anterior(_anio, _mes);
    final antes = _eventosDe(aA, mA);
    final mes = _mesTxt(_anio, _mes), mesAntes = _mesTxt(aA, mA);
    final esActual = _anio == _hoy.year && _mes == _hoy.month;
    final fue = ahora.where((e) => e.fue).length;
    final tu = _yo ? 'fuiste' : 'fue';

    if (antes != null && antes.isNotEmpty) {
      if (esActual) {
        // Mismo tramo del mes: del 1 al día de hoy.
        final d = _hoy.day;
        final antesTramo = antes.where((e) => e.fecha.day <= d && e.fue).length;
        final dif = fue - antesTramo;
        final tramo = d == 1 ? 'El 1 de $mes' : 'Del 1 al $d de $mes';
        final txt = dif == 0
            ? '$tramo $tu a $fue ${fue == 1 ? 'clase' : 'clases'}, igual que en esas fechas de $mesAntes.'
            : '$tramo $tu a $fue ${fue == 1 ? 'clase' : 'clases'}: ${dif.abs()} ${dif > 0 ? 'más' : 'menos'} que en esas mismas fechas de $mesAntes.';
        out.add((dif >= 0 ? Icons.trending_up_rounded : Icons.event_note_rounded, txt));
      } else {
        final fueAntes = antes.where((e) => e.fue).length;
        final dif = fue - fueAntes;
        if (dif != 0) {
          out.add((
            dif > 0 ? Icons.trending_up_rounded : Icons.event_note_rounded,
            'En $mes $tu a $fue ${fue == 1 ? 'clase' : 'clases'}, ${dif.abs()} ${dif > 0 ? 'más' : 'menos'} que en $mesAntes.',
          ));
        }
      }
      final p = _pct(ahora), pa = _pct(antes);
      if (p != null && pa != null && p != pa) {
        out.add((Icons.percent_rounded, 'La asistencia pasó de $pa% en $mesAntes a $p% en $mes.'));
      }
    }
    // Puntualidad.
    final tarde = ahora.where((e) => e.estado == 'Tarde').length;
    if (fue >= 2) {
      out.add((
        Icons.schedule_rounded,
        tarde == 0
            ? '${_yo ? 'Llegaste' : 'Llegó'} a horario a todas las clases de $mes.'
            : '${_yo ? 'Llegaste' : 'Llegó'} a horario a ${fue - tarde} de $fue clases.',
      ));
    }
    // Clases seguidas (las últimas, en el mes en curso).
    if (esActual) {
      final todas = [...?_eventosDe(aA, mA), ...ahora];
      var seguidas = 0;
      for (final e in todas.reversed) {
        if (!e.fue) break;
        seguidas++;
      }
      if (seguidas >= 3) out.add((Icons.local_fire_department_rounded, '${_yo ? 'Fuiste' : 'Fue'} a las últimas $seguidas clases seguidas.'));
    }
    // Promedio de su Equipo (solo el mes en curso, con la lista ya cargada).
    final p = _pct(ahora);
    final yo = repo.persona(widget.username);
    if (esActual && p != null && yo != null) {
      final pares = [
        for (final o in repo.personas ?? const <Integrante>[])
          if (o.categoria == yo.categoria && !o.inactivx && o.asistenciaPct != null) o.asistenciaPct!,
      ];
      if (pares.length >= 3) {
        final prom = (pares.reduce((a, b) => a + b) / pares.length).round();
        out.add((
          Icons.groups_rounded,
          p > prom + 5
              ? 'Por encima del promedio de ${yo.categoria} este mes ($prom%).'
              : p < prom - 5
              ? 'El promedio de ${yo.categoria} este mes es $prom%.'
              : 'En el promedio de ${yo.categoria} este mes ($prom%).',
        ));
      }
    }
    return out.take(4).toList();
  }

  Future<void> _elegirMes() async {
    final m = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('Ver datos de', style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            ),
            for (final x in _meses.reversed)
              ListTile(
                title: Text(Fechas.mesNombre(DateTime(_anio, x))),
                trailing: x == _mes ? Icon(Icons.check_rounded, color: c.pivot.marcaTexto) : null,
                onTap: () => Navigator.of(c).pop(x),
              ),
          ],
        ),
      ),
    );
    if (m == null || !mounted) return;
    setState(() => _mes = m);
    if (m == 1) _cargar(_anio - 1);
  }

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final d = _datos[_anio];
    final Widget cuerpo;
    if (d == null) {
      cuerpo = Center(key: const ValueKey('c'), child: _error != null ? Text(_error!) : const PivotCargando());
    } else {
      cuerpo = ListView(
        key: const ValueKey('l'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
        children: [
          if (d.anios.length > 1) ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final a in d.anios)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(label: Text('$a'), selected: a == _anio, onSelected: (_) => _elegirAnio(a)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          _mesCaja(d),
          const SizedBox(height: 12),
          _graficoCaja(d),
          const SizedBox(height: 12),
          if (_anio == _hoy.year && d.progreso != null) ...[
            _ProgresoCategoria(progreso: d.progreso!, yo: _yo, verPrivado: _yo || repo.esAdmin),
            const SizedBox(height: 12),
          ],
          _anioCaja(d),
        ],
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Estadísticas', style: TextStyle(fontWeight: FontWeight.w700)),
            Text(widget.nombre, style: TextStyle(fontSize: 13, color: pal.textoSecundario)),
          ],
        ),
      ),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: cuerpo),
    );
  }

  Widget _mesCaja(_Anio d) {
    final pal = context.pivot;
    final ev = d.delMes(_mes);
    final pct = _pct(ev);
    final lecturas = _lecturas();
    return _Caja(
      titulo: Row(
        children: [
          Material(
            color: pal.suave,
            shape: const StadiumBorder(),
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: _elegirMes,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: Text(
                        Fechas.mesNombre(DateTime(_anio, _mes)),
                        key: ValueKey('$_anio-$_mes'),
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: pal.sobreSuave),
                      ),
                    ),
                    Icon(Icons.expand_more_rounded, size: 20, color: pal.sobreSuave),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      hijo: AnimatedSize(
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
        alignment: Alignment.topCenter,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 240),
          layoutBuilder: (actual, previos) => Stack(alignment: Alignment.topLeft, children: [...previos, ?actual]),
          child: Column(
            key: ValueKey('mes$_anio-$_mes'),
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _fila([
                _Stat(valor: pct == null ? '—' : '$pct%', etiqueta: 'Asistencia'),
                _Stat(valor: ev.isEmpty ? '—' : '${ev.where((e) => e.fue).length}/${ev.length}', etiqueta: 'Clases'),
              ]),
              const SizedBox(height: 10),
              _fila([
                _Stat(
                  valor: numero(d.pts(_mes, 'asistencia')),
                  etiqueta: 'Puntos por asistencia',
                  alTocar: () => _desglose('asistencia', 'Puntos por asistencia'),
                ),
                _Stat(valor: numero(d.pts(_mes, 'tareas')), etiqueta: 'Puntos por tareas', alTocar: () => _desglose('tareas', 'Puntos por tareas')),
                _Stat(valor: numero(d.pts(_mes, 'racha')), etiqueta: 'Puntos por racha', alTocar: () => _desglose('racha', 'Puntos por racha')),
              ]),
              if (lecturas.isNotEmpty) ...[
                const SizedBox(height: 14),
                for (final (icono, texto) in lecturas)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(icono, size: 18, color: pal.marcaTexto),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(texto, style: TextStyle(fontSize: 14, height: 1.3, color: pal.texto)),
                        ),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _graficoCaja(_Anio d) {
    final pal = context.pivot;
    final meses = _meses;
    return _Caja(
      titulo: Row(
        children: [
          Expanded(
            child: Text(
              'Por mes en $_anio',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: pal.texto),
            ),
          ),
          SegmentedButton<bool>(
            showSelectedIcon: false,
            style: const ButtonStyle(visualDensity: VisualDensity.compact),
            segments: const [
              ButtonSegment(value: false, label: Text('Asistencia')),
              ButtonSegment(value: true, label: Text('Puntos')),
            ],
            selected: {_verPuntos},
            onSelectionChanged: (s) => setState(() => _verPuntos = s.first),
          ),
        ],
      ),
      hijo: Builder(
        builder: (context) {
          final valores = <num?>[for (final m in meses) _verPuntos ? (d.puntos[m] == null ? null : d.pts(m, 'total')) : _pct(d.delMes(m))];
          final maximo = _verPuntos ? valores.fold<num>(1, (a, b) => b != null && b > a ? b : a) : 100;
          return _Barras(
            meses: [for (final m in meses) DateTime(_anio, m)],
            valores: valores,
            maximo: maximo,
            sufijo: _verPuntos ? '' : '%',
            elegido: DateTime(_anio, _mes),
            alElegir: (m) => setState(() => _mes = m.month),
          );
        },
      ),
    );
  }

  Widget _anioCaja(_Anio d) {
    final pal = context.pivot;
    final fue = d.eventos.where((e) => e.fue).length;
    final pct = _pct(d.eventos);
    final p = repo.persona(widget.username);
    final total = d.puntos.values.fold<num>(0, (s, x) => s + ((x['total'] as num?) ?? 0));
    return _Caja(
      titulo: Text(
        'Todo $_anio',
        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: pal.texto),
      ),
      hijo: _fila([
        _Stat(valor: pct == null ? '—' : '$pct%', etiqueta: 'Asistencia'),
        _Stat(valor: '$fue', etiqueta: 'Clases'),
        if (_anio == _hoy.year && p != null)
          _Stat(valor: numero(p.horasAnio), etiqueta: 'Horas patinadas')
        else
          _Stat(valor: numero(total), etiqueta: 'Puntos'),
      ]),
    );
  }

  Widget _fila(List<Widget> tarjetas) => IntrinsicHeight(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, t) in tarjetas.indexed) ...[if (i > 0) const SizedBox(width: 10), Expanded(child: t)],
      ],
    ),
  );

  void _desglose(String concepto, String titulo) {
    final m = DateTime(_anio, _mes);
    DesgloseScreen.abrir(context, repo: repo, username: widget.username, concepto: concepto, titulo: titulo, mes: m, nombreMes: Fechas.mes(m));
  }
}

/// Tarjeta de Equipo (Victor, 2026-11-13): qué pide la actual,
/// cuánto lleva, qué falta y cómo sumar, en tono amable.
class _ProgresoCategoria extends StatelessWidget {
  const _ProgresoCategoria({required this.progreso, required this.yo, required this.verPrivado});
  final Map<String, dynamic> progreso;
  final bool yo;
  final bool verPrivado;

  static String _unidad(Object? u, int n) => switch ('$u') {
    'dia' => n == 1 ? 'día' : 'días',
    'semana' => n == 1 ? 'semana' : 'semanas',
    'anio' => n == 1 ? 'año' : 'años',
    _ => n == 1 ? 'mes' : 'meses',
  };

  /// "un mínimo de 3 clases asistidas o 5 puntos por tareas al mes".
  static String regla(Map t) {
    final c = (t['minClases'] as num).toInt(), p = (t['minPuntos'] as num).toInt();
    final tareas = t['puntosFuente'] != 'todos';
    final partes = [if (c > 0) c == 1 ? '1 clase asistida' : '$c clases asistidas', if (p > 0) '$p puntos${tareas ? ' por tareas' : ''}'];
    final n = (t['ventana'] as num?)?.toInt() ?? 1;
    final u = t['unidad'] ?? 'mes';
    final cada = n == 1
        ? (u == 'mes'
              ? 'al mes'
              : u == 'semana'
              ? 'a la semana'
              : u == 'anio'
              ? 'al año'
              : 'al día')
        : 'cada $n ${_unidad(u, n)}';
    return 'un mínimo de ${partes.join(t['logica'] == 'Y' ? ' y ' : ' o ')} $cada';
  }

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final tiers = [
      for (final t in (progreso['tiers'] as List? ?? const []))
        if (t is Map) t,
    ];
    final cat = '${progreso['categoria'] ?? ''}';
    final i = tiers.indexWhere((t) => t['nombre'] == cat);
    final actual = i >= 0 ? tiers[i] : null;
    final superior = i > 0 ? tiers[i - 1] : null;
    final esPiso = actual?['esDefault'] == true;
    // En el equipo inicial se mira el de arriba; si no, el propio.
    final meta = esPiso ? superior : actual;
    final debajo = i >= 0 && i + 1 < tiers.length ? tiers[i + 1] : null;
    final lineas = <(IconData, String)>[];

    if (progreso['modo'] != 'auto') {
      lineas.add((Icons.push_pin_outlined, 'Un Pivot fijó ${yo ? 'tu' : 'su'} equipo en $cat; no cambia solo.'));
    } else if (progreso['estado'] == 'Lesionadx' || progreso['estado'] == 'De viaje') {
      lineas.add((
        Icons.pause_circle_outline_rounded,
        'Mientras esté como ${progreso['estado'] == 'Lesionadx' ? 'lesionadx' : 'de viaje'}, el equipo no cambia.',
      ));
    } else if (meta != null) {
      final minC = (meta['minClases'] as num).toInt(), minP = (meta['minPuntos'] as num).toInt();
      final cumpleAhora = meta['cumple'] == true;
      final cumpleAntes = meta['cumpleCerrado'] == true;
      final min = [
        if (minC > 0) '$minC clases',
        if (minP > 0) '$minP puntos${meta['puntosFuente'] != 'todos' ? ' por tareas' : ''}',
      ].join(meta['logica'] == 'Y' ? ' y ' : ' o ');
      if (esPiso) {
        final n = (progreso['mesesSeguidos'] as num?)?.toInt() ?? 0, m = (meta['mesesAscenso'] as num).toInt();
        lineas.add((
          Icons.trending_up_rounded,
          cumpleAntes
              ? '${yo ? 'Llevas' : 'Lleva'} $n de $m meses seguidos cumpliendo lo de ${meta['nombre']} para subir.'
              : 'Para subir a ${meta['nombre']} hacen falta $m meses seguidos cumpliendo $min.',
        ));
      } else if (!cumpleAntes) {
        // Lo que decide: el período cerrado.
        final g = (meta['gracia'] as num?)?.toInt() ?? 0;
        lineas.add((
          Icons.flag_outlined,
          '${yo ? 'No estás llegando' : 'No está llegando'} a los mínimos de $min. '
              '${g > 0 ? 'Si ${yo ? 'sigues' : 'sigue'} así $g ${_unidad(meta['graciaUnidad'], g)}, ${yo ? 'bajarás' : 'bajará'} a ${debajo?['nombre'] ?? 'otro equipo'}.' : 'Al cierre ${yo ? 'bajarás' : 'bajará'} a ${debajo?['nombre'] ?? 'otro equipo'}.'}',
        ));
      } else if (cumpleAhora) {
        lineas.add((Icons.verified_rounded, '${yo ? 'Ya cumples' : 'Ya cumple'} con $cat este mes. ¡Bien!'));
      }
    }
    if (verPrivado && progreso['usaEquipo'] == true && progreso['modo'] == 'auto') {
      lineas.add((Icons.inventory_2_outlined, 'Mientras use equipamiento del equipo, queda en el equipo inicial.'));
    }

    return _Caja(
      titulo: Row(
        children: [
          Icon(Icons.workspace_premium_outlined, size: 20, color: pal.marcaTexto),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Equipo: $cat',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: pal.texto),
            ),
          ),
        ],
      ),
      hijo: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (meta != null) ...[
            Text('${meta['nombre']} pide ${regla(meta)}.', style: TextStyle(fontSize: 13.5, color: pal.textoSecundario)),
            const SizedBox(height: 10),
            if ((meta['minClases'] as num) > 0)
              _Avance(titulo: (meta['unidad'] ?? 'mes') == 'mes' ? 'Clases este mes' : 'Clases', valor: meta['clases'] as num, meta: meta['minClases'] as num),
            if ((meta['minPuntos'] as num) > 0)
              _Avance(titulo: meta['puntosFuente'] != 'todos' ? 'Puntos por tareas' : 'Puntos', valor: meta['puntos'] as num, meta: meta['minPuntos'] as num),
            const SizedBox(height: 4),
          ],
          for (final (icono, texto) in lineas)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icono, size: 18, color: pal.marcaTexto),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(texto, style: TextStyle(fontSize: 14, height: 1.3, color: pal.texto)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Avance extends StatelessWidget {
  const _Avance({required this.titulo, required this.valor, required this.meta});
  final String titulo;
  final num valor;
  final num meta;

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final v = meta <= 0 ? 1.0 : (valor / meta).clamp(0.0, 1.0).toDouble();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(titulo, style: TextStyle(fontSize: 13, color: pal.textoSecundario)),
              ),
              Text(
                '${numero(valor)} de ${numero(meta)}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: pal.texto),
              ),
            ],
          ),
          const SizedBox(height: 4),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: v),
            duration: const Duration(milliseconds: 500),
            curve: Curves.easeOutCubic,
            builder: (context, x, _) => ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(value: x, minHeight: 8, backgroundColor: pal.fondo, color: pal.marca),
            ),
          ),
        ],
      ),
    );
  }
}

/// Barras por mes; tocar una elige ese mes arriba.
class _Barras extends StatelessWidget {
  const _Barras({required this.meses, required this.valores, required this.maximo, required this.sufijo, required this.elegido, required this.alElegir});
  final List<DateTime> meses;
  final List<num?> valores;
  final num maximo;
  final String sufijo;
  final DateTime elegido;
  final void Function(DateTime) alElegir;

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    const alto = 110.0;
    return SizedBox(
      height: alto + 44,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final (i, m) in meses.indexed)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => alElegir(m),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    FittedBox(
                      child: Text(
                        valores[i] == null ? '' : '${numero(valores[i]!)}$sufijo',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: m == elegido ? pal.marcaTexto : pal.textoSecundario),
                      ),
                    ),
                    const SizedBox(height: 4),
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: maximo <= 0 ? 0 : ((valores[i] ?? 0) / maximo).clamp(0.0, 1.0).toDouble()),
                      duration: const Duration(milliseconds: 500),
                      curve: Curves.easeOutCubic,
                      builder: (context, v, _) => AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: meses.length > 6 ? 14 : 22,
                        height: 4 + (alto - 4) * v,
                        decoration: BoxDecoration(color: m == elegido ? pal.marca : pal.suave, borderRadius: BorderRadius.circular(6)),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      Fechas.mes(m).substring(0, meses.length > 6 ? 1 : 3).toUpperCase(),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: m == elegido ? FontWeight.w800 : FontWeight.w500,
                        color: m == elegido ? pal.texto : pal.textoSecundario,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.valor, required this.etiqueta, this.alTocar});
  final String valor;
  final String etiqueta;
  final VoidCallback? alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Material(
      color: p.fondo,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta - 4)),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta - 4),
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
          child: Column(
            children: [
              Text(
                valor,
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: p.texto),
              ),
              const SizedBox(height: 2),
              Text(
                etiqueta,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11.5, height: 1.2, color: p.textoSecundario),
              ),
              if (alTocar != null) Icon(Icons.expand_more_rounded, size: 16, color: p.textoSecundario),
            ],
          ),
        ),
      ),
    );
  }
}

class _Caja extends StatelessWidget {
  const _Caja({required this.titulo, required this.hijo});
  final Widget titulo;
  final Widget hijo;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [titulo, const SizedBox(height: 12), hijo]),
    );
  }
}
