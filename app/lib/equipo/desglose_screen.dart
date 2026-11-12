import 'package:flutter/material.dart';

import '../ajustes/componentes.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'equipo_repo.dart';

/// Desglose de puntos de un mes (Victor, 2026-11-12: antes era una hoja
/// plana). Pantalla completa con: tarjeta en degradado con el total, cifras
/// clave del concepto, barras por semana del mes y la lista de cada punto
/// con su ícono.
class DesgloseScreen extends StatefulWidget {
  const DesgloseScreen({
    super.key,
    required this.repo,
    required this.username,
    required this.concepto,
    required this.titulo,
    required this.mes,
    required this.nombreMes,
  });
  final EquipoRepo repo;
  final String username;

  /// 'asistencia' | 'tareas' | 'racha'.
  final String concepto;
  final String titulo;
  final DateTime mes;
  final String nombreMes;

  static Future<void> abrir(
    BuildContext context, {
    required EquipoRepo repo,
    required String username,
    required String concepto,
    required String titulo,
    required DateTime mes,
    required String nombreMes,
  }) => SubAjustes.abrir(context, DesgloseScreen(repo: repo, username: username, concepto: concepto, titulo: titulo, mes: mes, nombreMes: nombreMes));

  @override
  State<DesgloseScreen> createState() => _DesgloseScreenState();
}

class _DesgloseScreenState extends State<DesgloseScreen> {
  late Future<List<Map<String, dynamic>>> _f = widget.repo.desglose(widget.username, widget.concepto, mes: widget.mes);

  String get _seccion => switch (widget.concepto) {
    'tareas' => 'organizacion',
    'racha' => 'cuota',
    _ => 'reservas',
  };

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.titulo, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _f,
        builder: (context, s) {
          Widget cuerpo;
          if (s.hasError) {
            cuerpo = Center(
              key: const ValueKey('error'),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('No se pudo cargar el desglose.', style: TextStyle(color: p.textoSecundario)),
                  const SizedBox(height: 12),
                  FilledButton.tonal(
                    onPressed: () => setState(() => _f = widget.repo.desglose(widget.username, widget.concepto, mes: widget.mes)),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            );
          } else if (!s.hasData) {
            cuerpo = const Center(key: ValueKey('cargando'), child: PivotCargando());
          } else {
            cuerpo = _contenido(context, s.data!);
          }
          return AnimatedSwitcher(duration: const Duration(milliseconds: 240), child: cuerpo);
        },
      ),
    );
  }

  static double _pts(Map<String, dynamic> f) => (f['puntos'] as num?)?.toDouble() ?? 0;
  static String _num(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

  Widget _contenido(BuildContext context, List<Map<String, dynamic>> filas) {
    final p = context.pivot;
    final total = filas.fold<double>(0, (a, f) => a + _pts(f));
    final (degradado, sobre) = PivotPaleta.seccion(_seccion, Theme.of(context).brightness);

    // Cifras clave según el concepto.
    final cifras = <(String, String)>[];
    if (widget.concepto == 'asistencia') {
      final aTiempo = filas.where((f) => f['estado'] == 'A tiempo' && f['externa'] != true).length;
      final tarde = filas.where((f) => f['estado'] == 'Tarde' && f['externa'] != true).length;
      final externas = filas.where((f) => f['externa'] == true).length;
      cifras.addAll([('$aTiempo', 'A tiempo'), ('$tarde', 'Tarde'), if (externas > 0) ('$externas', 'Externas')]);
    } else if (widget.concepto == 'tareas') {
      cifras.add(('${filas.where((f) => f['reconciliacion'] != true).length}', 'Tareas aprobadas'));
    } else {
      cifras.add(('${filas.length}', filas.length == 1 ? 'Bono' : 'Bonos'));
    }

    // Puntos por semana del mes (1–7, 8–14, …).
    final semanas = List<double>.filled(5, 0);
    for (final f in filas) {
      final d = Fechas.desdeIso(f['fecha']);
      if (d == null || d.month != widget.mes.month) continue;
      semanas[((d.day - 1) ~/ 7).clamp(0, 4)] += _pts(f);
    }
    final maxSemana = semanas.fold<double>(0, (a, b) => b > a ? b : a);

    return ListView(
      key: const ValueKey('lista'),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
          decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'En ${widget.nombreMes}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sobre.withValues(alpha: 0.85)),
              ),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: total),
                duration: const Duration(milliseconds: 700),
                curve: Curves.easeOutCubic,
                builder: (context, v, _) => Text(
                  '${_num(v)} ${total == 1 ? 'punto' : 'puntos'}',
                  style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: sobre),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  for (final (i, (n, e)) in cifras.indexed) ...[
                    if (i > 0) const SizedBox(width: 8),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                        decoration: BoxDecoration(color: sobre.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(PivotRadios.chip + 4)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              n,
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: sobre),
                            ),
                            Text(e, style: TextStyle(fontSize: 12.5, color: sobre.withValues(alpha: 0.9))),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
        if (filas.isNotEmpty) ...[
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Por semana',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: p.textoSecundario),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 110,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final (i, v) in semanas.indexed)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                Text(
                                  v == 0 ? '' : _num(v),
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.texto),
                                ),
                                const SizedBox(height: 4),
                                TweenAnimationBuilder<double>(
                                  tween: Tween(begin: 0, end: maxSemana == 0 ? 0 : v / maxSemana),
                                  duration: Duration(milliseconds: 500 + i * 80),
                                  curve: Curves.easeOutCubic,
                                  builder: (context, k, _) => Container(
                                    height: 4 + 64 * k,
                                    decoration: BoxDecoration(
                                      gradient: v == 0 ? null : degradado,
                                      color: v == 0 ? p.bordeSuave : null,
                                      borderRadius: BorderRadius.circular(PivotRadios.chip),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text('S${i + 1}', style: TextStyle(fontSize: 12, color: p.textoSecundario)),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        GrupoAjustes(
          titulo: 'DETALLE',
          filas: filas.isEmpty
              ? [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Todavía no hay puntos por este concepto en ${widget.nombreMes}.', style: TextStyle(color: p.textoSecundario)),
                  ),
                ]
              : [for (final f in filas) _fila(context, f)],
        ),
      ],
    );
  }

  Widget _fila(BuildContext context, Map<String, dynamic> f) {
    final p = context.pivot;
    final fecha = Fechas.desdeIso(f['fecha']);
    final externa = f['externa'] == true;
    final (IconData icono, String seccion, String titulo) = switch (widget.concepto) {
      'asistencia' when externa => (Icons.place_rounded, 'identidad', 'Asistencia externa'),
      'asistencia' when f['estado'] == 'Tarde' => (Icons.schedule_rounded, 'notificaciones', 'Llegó tarde'),
      'asistencia' => (Icons.check_rounded, 'reservas', 'A tiempo'),
      'tareas' => (Icons.task_alt_rounded, 'organizacion', '${f['titulo'] ?? 'Tarea'}'),
      _ => (Icons.local_fire_department_rounded, 'cuota', '${f['titulo'] ?? f['nombre'] ?? 'Racha'}'),
    };
    final (degradado, sobre) = PivotPaleta.seccion(seccion, Theme.of(context).brightness);
    final sub = [
      if (fecha != null) '${Fechas.dia(fecha)} ${Fechas.corta(fecha)}',
      if (externa && '${f['lugar'] ?? ''}'.isNotEmpty) '${f['lugar']}',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip + 2)),
            child: Icon(icono, size: 20, color: sobre),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.texto),
                ),
                if (sub.isNotEmpty) Text(sub, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              ],
            ),
          ),
          Text(
            '+${_num(_pts(f))}',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.marcaTexto),
          ),
        ],
      ),
    );
  }
}
