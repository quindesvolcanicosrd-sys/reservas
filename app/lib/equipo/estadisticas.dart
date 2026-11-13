import 'package:flutter/material.dart';

import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'desglose_screen.dart';
import 'equipo_modelos.dart';
import 'equipo_repo.dart';

/// Estadísticas de una persona (Victor, 2026-11-12): el mes elegido con
/// asistencia, clases, puntos y racha; lecturas cortas que comparan con el
/// mes anterior y con el promedio de su categoría (sin regañar); un gráfico
/// de los últimos 6 meses y lo del año. Se usa en la ficha de Equipo y en
/// Mi perfil → Mis estadísticas.
class EstadisticasPersona extends StatefulWidget {
  const EstadisticasPersona({super.key, required this.repo, required this.p});
  final EquipoRepo repo;
  final Integrante p;

  @override
  State<EstadisticasPersona> createState() => _EstadisticasPersonaState();
}

class _EstadisticasPersonaState extends State<EstadisticasPersona> {
  static DateTime get _hoyMes => DateTime(Fechas.hoy().year, Fechas.hoy().month);
  late DateTime _mes = _hoyMes;
  late final List<DateTime> _seis = [for (var i = 5; i >= 0; i--) DateTime(_hoyMes.year, _hoyMes.month - i)];
  final Map<DateTime, Integrante?> _datos = {};
  bool _cargando = true;

  EquipoRepo get repo => widget.repo;
  Integrante get p => widget.p;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void didUpdateWidget(EstadisticasPersona old) {
    super.didUpdateWidget(old);
    if (!identical(old.p, widget.p)) setState(() => _datos[_hoyMes] = widget.p);
  }

  Future<void> _cargar() async {
    final r = await Future.wait([for (final m in _seis) repo.enMes(p.username, m).catchError((_) => null)]);
    if (!mounted) return;
    setState(() {
      for (final (i, m) in _seis.indexed) {
        _datos[m] = r[i];
      }
      _datos[_hoyMes] = p;
      _cargando = false;
    });
  }

  Future<void> _mesFuera(DateTime m) async {
    setState(() => _mes = m);
    if (_datos.containsKey(m)) return;
    final x = await repo.enMes(p.username, m).catchError((_) => null);
    if (mounted) setState(() => _datos[m] = x);
  }

  String _nombre(DateTime m) => m.year == _hoyMes.year ? Fechas.mesNombre(m) : Fechas.mesAnio(m);

  Future<void> _elegirMes() async {
    final meses = [for (var i = 0; i < 12; i++) DateTime(_hoyMes.year, _hoyMes.month - i)];
    final m = await showModalBottomSheet<DateTime>(
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
            for (final x in meses)
              ListTile(
                title: Text(_nombre(x)),
                trailing: x == _mes ? Icon(Icons.check_rounded, color: c.pivot.marcaTexto) : null,
                onTap: () => Navigator.of(c).pop(x),
              ),
          ],
        ),
      ),
    );
    if (m != null && m != _mes && mounted) _mesFuera(m);
  }

  /// Lecturas cortas del mes elegido, sin tono de reproche.
  List<(IconData, String)> _lecturas(Integrante? x, Integrante? antes) {
    final out = <(IconData, String)>[];
    final pct = x?.asistenciaPct, pctAntes = antes?.asistenciaPct;
    final mes = _nombre(_mes).toLowerCase();
    final anterior = _nombre(DateTime(_mes.year, _mes.month - 1)).toLowerCase();
    if (pct != null && pctAntes != null) {
      final d = pct - pctAntes;
      if (d >= 10) {
        out.add((Icons.trending_up_rounded, 'Tu asistencia en $mes subió $d puntos respecto a $anterior.'));
      } else if (d <= -10) {
        out.add((Icons.trending_down_rounded, 'Tu asistencia en $mes está más baja que en $anterior ($pct% frente a $pctAntes%).'));
      } else {
        out.add((Icons.trending_flat_rounded, 'Tu asistencia se mantiene parecida a la de $anterior.'));
      }
    }
    // Promedio de su categoría, solo para el mes en curso (lista ya cargada).
    if (_mes == _hoyMes && pct != null) {
      final pares = [
        for (final o in repo.personas ?? const <Integrante>[])
          if (o.categoria == p.categoria && !o.inactivx && o.asistenciaPct != null) o.asistenciaPct!,
      ];
      if (pares.length >= 3) {
        final prom = (pares.reduce((a, b) => a + b) / pares.length).round();
        final txt = pct > prom + 5
            ? 'Estás por encima del promedio de ${p.categoria} este mes ($prom%).'
            : pct < prom - 5
            ? 'El promedio de ${p.categoria} este mes es $prom%.'
            : 'Estás en el promedio de ${p.categoria} este mes ($prom%).';
        out.add((Icons.groups_rounded, txt));
      }
    }
    final pts = x?.puntos ?? 0, ptsAntes = antes?.puntos ?? 0;
    if (pts > 0 && ptsAntes > 0 && (pts - ptsAntes).abs() >= 5) {
      out.add((
        Icons.star_outline_rounded,
        pts > ptsAntes
            ? 'Sumaste ${numero(pts - ptsAntes)} puntos más que en $anterior.'
            : 'Llevas ${numero(pts)} puntos; en $anterior sumaste ${numero(ptsAntes)}.',
      ));
    }
    if (_mes == _hoyMes && p.racha >= 2) out.add((Icons.local_fire_department_rounded, 'Llevas ${p.racha} meses seguidos de racha.'));
    return out.take(3).toList();
  }

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final x = _datos[_mes];
    final antes = _datos[DateTime(_mes.year, _mes.month - 1)];
    final esperando = !_datos.containsKey(_mes);
    final pct = x?.asistenciaPct;
    final lecturas = esperando ? const <(IconData, String)>[] : _lecturas(x, antes);
    final anioPct = p.eventosAnio == 0 ? null : (p.asistenciasAnio * 100 / p.eventosAnio).round();

    Widget mes = esperando
        ? const Padding(
            key: ValueKey('cargando'),
            padding: EdgeInsets.all(8),
            child: Center(child: PivotCargando(tamano: 48)),
          )
        : Column(
            key: ValueKey('mes$_mes'),
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _fila([
                _Stat(valor: pct == null ? '—' : '$pct%', etiqueta: 'Asistencia'),
                _Stat(valor: x == null || x.eventosPeriodo == 0 ? '—' : '${x.asistenciasPeriodo}/${x.eventosPeriodo}', etiqueta: 'Clases'),
              ]),
              const SizedBox(height: 10),
              _fila([
                _Stat(
                  valor: numero(x?.puntosAsistencia ?? 0),
                  etiqueta: 'Puntos por asistencia',
                  alTocar: () => _desglose('asistencia', 'Puntos por asistencia'),
                ),
                _Stat(valor: numero(x?.puntosTareas ?? 0), etiqueta: 'Puntos por tareas', alTocar: () => _desglose('tareas', 'Puntos por tareas')),
                _Stat(valor: numero(x?.puntosRacha ?? 0), etiqueta: 'Puntos por racha', alTocar: () => _desglose('racha', 'Puntos por racha')),
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
          );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Caja(
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
                            _nombre(_mes),
                            key: ValueKey(_mes),
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
              child: mes,
            ),
          ),
        ),
        const SizedBox(height: 12),
        _Caja(
          titulo: Text(
            'Asistencia, últimos 6 meses',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: pal.texto),
          ),
          hijo: _cargando
              ? const SizedBox(height: 154, child: Center(child: PivotCargando(tamano: 48)))
              : _Barras(meses: _seis, valores: [for (final m in _seis) _datos[m]?.asistenciaPct], elegido: _mes, alElegir: _mesFuera),
        ),
        const SizedBox(height: 12),
        _Caja(
          titulo: Text(
            'Datos de ${_hoyMes.year}',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: pal.texto),
          ),
          hijo: _fila([
            _Stat(valor: anioPct == null ? '—' : '$anioPct%', etiqueta: 'Asistencia'),
            _Stat(valor: '${p.asistenciasAnio}', etiqueta: 'Clases'),
            _Stat(valor: numero(p.horasAnio), etiqueta: 'Horas patinadas'),
          ]),
        ),
      ],
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

  void _desglose(String concepto, String titulo) =>
      DesgloseScreen.abrir(context, repo: repo, username: p.username, concepto: concepto, titulo: titulo, mes: _mes, nombreMes: _nombre(_mes).toLowerCase());
}

/// Barras de asistencia por mes; tocar una elige ese mes arriba.
class _Barras extends StatelessWidget {
  const _Barras({required this.meses, required this.valores, required this.elegido, required this.alElegir});
  final List<DateTime> meses;
  final List<int?> valores;
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
                    Text(
                      valores[i] == null ? '' : '${valores[i]}%',
                      style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: m == elegido ? pal.marcaTexto : pal.textoSecundario),
                    ),
                    const SizedBox(height: 4),
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: ((valores[i] ?? 0) / 100).clamp(0.0, 1.0)),
                      duration: const Duration(milliseconds: 500),
                      curve: Curves.easeOutCubic,
                      builder: (context, v, _) => AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 22,
                        height: 4 + (alto - 4) * v,
                        decoration: BoxDecoration(color: m == elegido ? pal.marca : pal.suave, borderRadius: BorderRadius.circular(6)),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      Fechas.mes(m).substring(0, 3),
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

/// Mi perfil → Mis estadísticas: lo mismo que en Equipo, sin foto ni datos
/// personales.
class MisEstadisticasScreen extends StatelessWidget {
  const MisEstadisticasScreen({super.key, required this.repo});
  final EquipoRepo repo;

  @override
  Widget build(BuildContext context) {
    repo.cargar();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis estadísticas', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListenableBuilder(
        listenable: repo,
        builder: (context, _) {
          final yo = repo.persona(repo.sesion.nombre ?? '');
          if (yo == null) {
            return Center(
              child: repo.personas == null
                  ? const PivotCargando()
                  : Text('Todavía no hay estadísticas tuyas.', style: TextStyle(color: context.pivot.textoSecundario)),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
            children: [EstadisticasPersona(repo: repo, p: yo)],
          );
        },
      ),
    );
  }
}
