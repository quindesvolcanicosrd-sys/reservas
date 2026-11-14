import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';
import 'excepcion_screen.dart';
import '../core/vidrio.dart';

/// Panel "Excepción de cuota" (Victor, 2026-11-08): antes de pedir una, se ve
/// lo que ya hay. Arriba, cómo queda la cuota de este mes; después lo vigente
/// (aprobadas o puestas por administradorxs, con su mes), lo que está en
/// revisión y un acceso al historial. Sin nada, explica qué son y cómo se
/// aprueban. "Pedir una excepción" abre el asistente.
class ExcepcionesPanelScreen extends StatefulWidget {
  const ExcepcionesPanelScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<ExcepcionesPanelScreen> createState() => _ExcepcionesPanelScreenState();
}

class _Solicitud {
  _Solicitud(this.m);
  final Map<String, dynamic> m;
  String get tipo => '${m['tipo']}';
  String get estado => '${m['estado']}';
  String get mes => '${m['mes'] ?? ''}';
  String get nota => '${m['nota'] ?? ''}'.trim();
  List<String> get leen => [for (final x in (m['leen'] as List? ?? const [])) '$x'];
  bool get pendiente => estado == 'pendiente';
  bool get aprobada => estado == 'aprobada';
  String? get hasta => m['hasta'] == null ? null : '${m['hasta']}';
  bool get indefinida => m['indefinida'] == true;
  bool get cancelada => m['cancelada'] == true;

  /// Aprobada y todavía vigente este mes (indefinida o hasta un mes futuro).
  bool get vigente => aprobada && (indefinida || (hasta ?? mes).compareTo(_mesActual()) >= 0);

  String get vigencia => indefinida
      ? 'Desde ${_mesTexto(mes)}, hasta que un Pivot la cambie'
      : (hasta == null || hasta == mes)
      ? _mesTexto(mes)
      : 'De ${_mesTexto(mes)} a ${_mesTexto(hasta!)}${cancelada ? ' (cancelada)' : ''}';
}

class _Excepcion {
  _Excepcion(this.m);
  final Map<String, dynamic> m;
  String get mes => '${m['mes'] ?? ''}';
  String get tipo => '${m['tipo'] ?? ''}';
  double? get monto => (m['monto'] as num?)?.toDouble();
  String get notas => '${m['notas'] ?? ''}'.trim();
}

/// "2026-11" → "noviembre de 2026".
String _mesTexto(String mes) {
  final p = mes.split('-');
  if (p.length < 2) return mes;
  final d = DateTime.tryParse('${p[0]}-${p[1].padLeft(2, '0')}-01');
  return d == null ? mes : Fechas.mesAnio(d).toLowerCase();
}

String _mesActual() {
  final h = Fechas.hoy();
  return '${h.year}-${h.month.toString().padLeft(2, '0')}';
}

class _ExcepcionesPanelScreenState extends State<ExcepcionesPanelScreen> {
  List<_Solicitud>? _sols;
  List<_Excepcion>? _excs;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final r = await widget.sesion.api.get('getMisExcepciones');
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
      if (!mounted) return;
      setState(() {
        _sols = [
          for (final x in (r['solicitudes'] as List? ?? const []))
            if (x is Map<String, dynamic>) _Solicitud(x),
        ];
        _excs = [
          for (final x in (r['excepciones'] as List? ?? const []))
            if (x is Map<String, dynamic>) _Excepcion(x),
        ];
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  Future<void> _pedir() async {
    await SubAjustes.abrir(context, ExcepcionScreen(sesion: widget.sesion));
    if (mounted) _cargar();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final listo = _sols != null && _excs != null;
    // Una solicitud a la vez: no se pide otra si hay una en revisión o una
    // aprobada que sigue vigente (el Pivot decide cuánto dura).
    final yaPidio = (_sols ?? const <_Solicitud>[]).any((s) => s.pendiente || s.vigente);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Excepción de cuota', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      floatingActionButton: !listo || yaPidio
          ? null
          : FloatingActionButton.extended(onPressed: _pedir, icon: const Icon(Icons.add_rounded), label: const Text('Pedir una excepción')),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 240),
        child: _error != null
            ? Center(
                key: const ValueKey('error'),
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: p.textoSecundario),
                      ),
                      const SizedBox(height: 12),
                      FilledButton.tonal(onPressed: _cargar, child: const Text('Reintentar')),
                    ],
                  ),
                ),
              )
            : !listo
            ? const Center(key: ValueKey('cargando'), child: PivotCargando())
            : _contenido(context, yaPidio),
      ),
    );
  }

  Widget _contenido(BuildContext context, bool yaPidio) {
    final p = context.pivot;
    final actual = _mesActual();
    final excs = _excs!, sols = _sols!;
    final vigentes = excs.where((e) => e.mes.compareTo(actual) >= 0).toList()..sort((a, b) => a.mes.compareTo(b.mes));
    final pendientes = sols.where((s) => s.pendiente).toList();
    final hayHistorial = excs.any((e) => e.mes.compareTo(actual) < 0) || sols.any((s) => !s.pendiente);
    final deEsteMes = excs.where((e) => e.mes == actual).firstOrNull;
    final vacio = vigentes.isEmpty && pendientes.isEmpty && !hayHistorial;
    return RefreshIndicator(
      key: const ValueKey('lista'),
      onRefresh: _cargar,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        children: [
          _Cabecera(excepcion: deEsteMes, pendiente: pendientes.any((s) => s.mes == actual)),
          if (vacio) const _Explicacion(),
          if (pendientes.isNotEmpty)
            GrupoAjustes(
              titulo: 'EN REVISIÓN',
              pie: 'Te llegará una notificación cuando la aprueben o la rechacen.',
              filas: [for (final s in pendientes) _filaSolicitud(s)],
            ),
          if (sols.any((s) => s.vigente))
            GrupoAjustes(
              titulo: 'SOLICITUDES VIGENTES',
              filas: [
                for (final s in sols.where((s) => s.vigente))
                  FilaAjuste(
                    icono: Icons.verified_rounded,
                    seccion: 'cuota',
                    titulo: s.tipo == 'ausencias' ? 'Ausencias justificadas' : 'Dificultades económicas',
                    valor: s.vigencia,
                  ),
              ],
            ),
          if (vigentes.isNotEmpty) GrupoAjustes(titulo: 'MESES CON EXCEPCIÓN', filas: [for (final e in vigentes) _filaExcepcion(e)]),
          if (hayHistorial)
            GrupoAjustes(
              filas: [
                FilaAjuste(
                  icono: Icons.history_rounded,
                  seccion: 'cuota',
                  titulo: 'Historial',
                  valor: 'Solicitudes y excepciones pasadas',
                  alTocar: () => SubAjustes.abrir(context, _HistorialScreen(solicitudes: sols, excepciones: excs)),
                ),
              ],
            ),
          if (yaPidio)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 0),
              child: Text(
                'Ya tienes una solicitud en revisión o una excepción vigente. Cuando termine podrás pedir otra.',
                style: TextStyle(fontSize: 13, color: p.textoSecundario),
              ),
            ),
        ],
      ),
    );
  }

  Widget _filaSolicitud(_Solicitud s) => FilaAjuste(
    icono: Icons.hourglass_top_rounded,
    seccion: 'cuota',
    titulo: s.tipo == 'ausencias' ? 'Ausencias justificadas' : 'Dificultades económicas',
    valor: '${_mesTexto(s.mes)} · ${s.leen.isEmpty ? 'la revisan todxs lxs administradorxs' : 'la revisa ${s.leen.join(', ')}'}',
  );

  Widget _filaExcepcion(_Excepcion e) => FilaAjuste(
    icono: Icons.verified_rounded,
    seccion: 'cuota',
    titulo: _textoExcepcion(e),
    valor: [_mesTexto(e.mes), if (e.notas.isNotEmpty) e.notas].join(' · '),
  );
}

String _textoExcepcion(_Excepcion e) {
  if (e.tipo == 'pago' && e.monto != null) return e.monto == 0 ? 'No pagas cuota' : 'Pagas \$${e.monto!.toStringAsFixed(2)}';
  return 'No pagas cuota';
}

class _Cabecera extends StatelessWidget {
  const _Cabecera({required this.excepcion, required this.pendiente});
  final _Excepcion? excepcion;
  final bool pendiente;

  @override
  Widget build(BuildContext context) {
    final (degradado, sobre) = PivotPaleta.seccion('cuota', Theme.of(context).brightness);
    final e = excepcion;
    final titulo = e != null ? _textoExcepcion(e) : (pendiente ? 'Solicitud en revisión' : 'Cuota normal');
    final texto = e != null
        ? 'Excepción vigente para ${_mesTexto(e.mes)}.'
        : pendiente
        ? 'Tu solicitud de este mes está esperando respuesta.'
        : 'No tienes excepciones este mes.';
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Row(
        children: [
          Icon(e != null ? Icons.verified_rounded : (pendiente ? Icons.hourglass_top_rounded : Icons.volunteer_activism_rounded), size: 34, color: sobre),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Este mes',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sobre.withValues(alpha: 0.85)),
                ),
                Text(
                  titulo,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: sobre),
                ),
                Text(texto, style: TextStyle(fontSize: 13.5, color: sobre.withValues(alpha: 0.9))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Sin ninguna excepción todavía: qué son, para qué sirven y cómo se aprueban.
class _Explicacion extends StatelessWidget {
  const _Explicacion();

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    Widget punto(IconData i, String t, String d) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(i, size: 22, color: p.marcaTexto),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.texto),
                ),
                Text(d, style: TextStyle(fontSize: 13.5, height: 1.35, color: p.textoSecundario)),
              ],
            ),
          ),
        ],
      ),
    );
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Todavía no tienes excepciones',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.texto),
          ),
          const SizedBox(height: 6),
          Text(
            'Una excepción baja o quita tu cuota de un mes cuando no puedes pagarla completa.',
            style: TextStyle(fontSize: 14, height: 1.35, color: p.textoSecundario),
          ),
          const SizedBox(height: 16),
          punto(Icons.event_busy_rounded, 'Ausencias justificadas', 'Si no pudiste entrenar por viaje, trabajo o salud, pagas media cuota.'),
          punto(Icons.savings_rounded, 'Dificultades económicas', 'Subvención parcial o completa, a cambio de aportar con tareas del equipo.'),
          punto(Icons.lock_rounded, 'Confidencial', 'Eliges qué administradorxs la leen y aprueban. Nadie más la ve.'),
          punto(Icons.notifications_active_rounded, 'Respuesta', 'Te llega una notificación al aprobarla o rechazarla. Un Pivot decide cuánto dura.'),
        ],
      ),
    );
  }
}

class _HistorialScreen extends StatelessWidget {
  const _HistorialScreen({required this.solicitudes, required this.excepciones});
  final List<_Solicitud> solicitudes;
  final List<_Excepcion> excepciones;

  @override
  Widget build(BuildContext context) {
    final actual = _mesActual();
    final pasadas = excepciones.where((e) => e.mes.compareTo(actual) < 0).toList();
    final resueltas = solicitudes.where((s) => !s.pendiente).toList();
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        flexibleSpace: const Vidrio(child: SizedBox.expand()),
        title: const Text('Historial', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16, 8 + altoBarra(context), 16, 40),
        children: [
          if (resueltas.isNotEmpty)
            GrupoAjustes(
              titulo: 'SOLICITUDES',
              filas: [
                for (final s in resueltas)
                  FilaAjuste(
                    icono: s.aprobada ? Icons.check_circle_rounded : Icons.cancel_rounded,
                    seccion: 'cuota',
                    titulo:
                        '${s.tipo == 'ausencias' ? 'Ausencias justificadas' : 'Dificultades económicas'} · ${s.aprobada ? (s.vigente ? 'vigente' : 'terminada') : 'rechazada'}',
                    valor: [s.aprobada ? s.vigencia : _mesTexto(s.mes), if (s.nota.isNotEmpty) s.nota].join(' · '),
                  ),
              ],
            ),
          if (pasadas.isNotEmpty)
            GrupoAjustes(
              titulo: 'EXCEPCIONES PASADAS',
              filas: [
                for (final e in pasadas) FilaAjuste(icono: Icons.verified_rounded, seccion: 'cuota', titulo: _textoExcepcion(e), valor: _mesTexto(e.mes)),
              ],
            ),
        ],
      ),
    );
  }
}
