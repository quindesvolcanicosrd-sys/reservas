import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'anticipada.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'selector_fechas.dart';

/// Asistencia anticipada: lista de reglas + asistente para crear o editar.
/// Mismo comportamiento que la web (`eventosAbrirAnticipada()`): sin reglas,
/// abre directo el asistente.
class AnticipadaScreen extends StatefulWidget {
  const AnticipadaScreen({super.key, required this.repo});
  final EventosRepo repo;

  @override
  State<AnticipadaScreen> createState() => _AnticipadaScreenState();
}

class _AnticipadaScreenState extends State<AnticipadaScreen> {
  AnticipadaRepo get _ant => widget.repo.anticipada;

  List<ReglaAnticipada>? _reglas;
  Cuota? _cuota;
  String? _error;
  bool _ocupado = false;

  // Asistente (null = mostrando la lista).
  bool _enAsistente = false;
  ReglaAnticipada? _editando;
  EstadoRsvp? _estado;
  String? _motivo;
  TipoRango? _tipo;
  final Set<int> _meses = {};
  DateTime? _desde;
  DateTime? _hasta;
  bool _secEstado = true;

  @override
  void initState() {
    super.initState();
    _cargar(abrirSiVacio: true);
  }

  Future<void> _cargar({bool abrirSiVacio = false}) async {
    setState(() => _error = null);
    try {
      final res = await Future.wait([_ant.reglas(), if (_cuota == null) _ant.cuota()]);
      if (!mounted) return;
      setState(() {
        _reglas = res[0] as List<ReglaAnticipada>;
        if (res.length > 1) _cuota = res[1] as Cuota;
        if (abrirSiVacio && _reglas!.isEmpty) _abrirAsistente(null);
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudieron cargar tus asistencias anticipadas.');
    }
  }

  void _avisar(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  // ─── Asistente ──────────────────────────────────────────────────────────

  void _abrirAsistente(ReglaAnticipada? r) {
    _enAsistente = true;
    _editando = r;
    _estado = r?.estado;
    _motivo = r?.estado == EstadoRsvp.noAsistire ? r?.motivo : null;
    _tipo = r?.tipo;
    _meses
      ..clear()
      ..addAll(r?.meses ?? const []);
    _desde = r?.desde;
    _hasta = r?.hasta;
    _secEstado = r == null;
  }

  bool get _restringe => _cuota?.restringe(_estado) ?? false;

  bool _mesHabilitado(int mes) {
    final hoy = Fechas.hoy();
    return mes >= hoy.month && (_cuota?.mesPermitido(_estado, mes, hoy.year) ?? true);
  }

  bool _diaDeshabilitado(DateTime d) {
    if (d.isBefore(Fechas.hoy())) return true;
    if (_tipo == TipoRango.periodo) {
      final lim = _cuota?.limite(_estado);
      if (lim != null && d.isAfter(lim)) return true;
    }
    return false;
  }

  /// Si "Asistiré" limita a meses pagados, recorta lo elegido (`_evAntAjustarFrecuenciaACuota()`).
  void _ajustarACuota() {
    if (!_restringe || _tipo == null) return;
    var ajusto = false;
    if (_tipo == TipoRango.meses) {
      final antes = _meses.length;
      _meses.removeWhere((m) => !_mesHabilitado(m));
      ajusto = antes != _meses.length;
    } else if (_tipo == TipoRango.periodo) {
      final lim = _cuota?.limite(_estado);
      if (lim != null) {
        if (_desde != null && _desde!.isAfter(lim)) {
          _desde = null;
          _hasta = null;
          ajusto = true;
        } else if (_hasta != null && _hasta!.isAfter(lim)) {
          _hasta = lim;
          ajusto = true;
        }
      }
    } else if (_tipo == TipoRango.indefinido) {
      _tipo = null;
      _desde = null;
      _hasta = null;
      ajusto = true;
    }
    if (ajusto) _avisar('Ajustamos la frecuencia a los meses que tienes pagados.');
  }

  bool get _frecuenciaValida => switch (_tipo) {
    TipoRango.meses => _meses.isNotEmpty,
    TipoRango.periodo => _desde != null && _hasta != null && !_hasta!.isBefore(_desde!),
    TipoRango.indefinido => _desde != null,
    null => false,
  };

  bool get _completo => _estado != null && (_estado != EstadoRsvp.noAsistire || MotivoAusencia.de(_motivo) != null) && _frecuenciaValida;

  String get _resumenEstado => _estado == null ? '' : '${_estado!.valor}${_estado == EstadoRsvp.noAsistire && _motivo != null ? ' · $_motivo' : ''}';

  String get _resumenFrecuencia => switch (_tipo) {
    TipoRango.meses => ([..._meses]..sort()).map((m) => Fechas.mesNombre(DateTime(2000, m))).join(', '),
    TipoRango.periodo => _desde != null && _hasta != null ? '${Fechas.corta(_desde!)} – ${Fechas.corta(_hasta!)}' : '',
    TipoRango.indefinido => _desde != null ? 'Desde ${Fechas.corta(_desde!)}' : '',
    null => '',
  };

  void _elegirEstado(EstadoRsvp e) {
    setState(() {
      _estado = e;
      if (e != EstadoRsvp.noAsistire) _motivo = null;
      _ajustarACuota();
      if (e != EstadoRsvp.noAsistire || _motivo != null) _secEstado = false;
    });
  }

  Future<void> _aplicar() async {
    if (!_completo) return;
    if (_tipo == TipoRango.indefinido && (_reglas ?? const []).any((r) => r.tipo == TipoRango.indefinido && r.id != _editando?.id)) {
      _avisar('Ya tienes una regla indefinida activa. Elimínala antes de crear una nueva.');
      return;
    }
    final nueva = ReglaAnticipada(
      tipo: _tipo!,
      estado: _estado!,
      motivo: _estado == EstadoRsvp.noAsistire ? _motivo : null,
      meses: _meses.toList()..sort(),
      desde: _tipo == TipoRango.meses ? null : _desde,
      hasta: _tipo == TipoRango.periodo ? _hasta : null,
    );
    setState(() => _ocupado = true);
    try {
      final aviso = await _ant.guardar(nueva, vieja: _editando);
      if (aviso != null) _avisar(aviso);
      await _cargar();
      await widget.repo.cargar(forzar: true);
      if (mounted) setState(() => _enAsistente = false);
    } catch (e) {
      _avisar('No se pudo aplicar la asistencia anticipada. $e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _eliminar(ReglaAnticipada r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Eliminar asistencia anticipada'),
        content: const Text('¿Eliminar esta asistencia anticipada? Esta acción no se puede deshacer.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _ocupado = true);
    try {
      final aviso = await _ant.eliminar(r);
      if (aviso != null) _avisar(aviso);
      await _cargar();
    } catch (_) {
      _avisar('No se pudo eliminar la asistencia anticipada.');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  void _atras() {
    if (_enAsistente && (_reglas?.isNotEmpty ?? false)) {
      setState(() => _enAsistente = false);
    } else {
      Navigator.of(context).pop();
    }
  }

  // ─── Construcción ───────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return PopScope(
      canPop: !(_enAsistente && (_reglas?.isNotEmpty ?? false)),
      onPopInvokedWithResult: (hecho, _) {
        if (!hecho) _atras();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), tooltip: 'Atrás', onPressed: _atras),
          title: Text(_enAsistente ? (_editando == null ? 'Nueva asistencia anticipada' : 'Editar asistencia anticipada') : 'Asistencia anticipada'),
        ),
        body: AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          transitionBuilder: (c, a) => FadeTransition(
            opacity: a,
            child: SlideTransition(
              position: Tween(begin: const Offset(0, 0.04), end: Offset.zero).animate(a),
              child: c,
            ),
          ),
          child: _error != null
              ? Center(
                  key: const ValueKey('error'),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
                    ],
                  ),
                )
              : _reglas == null
              ? const Center(key: ValueKey('cargando'), child: CircularProgressIndicator())
              : _enAsistente
              ? KeyedSubtree(key: ValueKey('asistente-${_editando?.id}'), child: _asistente(context))
              : KeyedSubtree(key: const ValueKey('lista'), child: _lista(context)),
        ),
        bottomNavigationBar: _enAsistente
            ? SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    onPressed: _completo && !_ocupado ? _aplicar : null,
                    child: _ocupado
                        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: p.sobreMarca))
                        : Text(_editando == null ? 'Aplicar' : 'Guardar cambios'),
                  ),
                ),
              )
            : null,
        floatingActionButton: !_enAsistente && _reglas != null
            ? FloatingActionButton.extended(
                onPressed: () => setState(() => _abrirAsistente(null)),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Nueva'),
              )
            : null,
      ),
    );
  }

  Widget _lista(BuildContext context) {
    final p = context.pivot;
    if (_reglas!.isEmpty) {
      return Center(
        child: Text('No tienes asistencias anticipadas todavía.', style: TextStyle(color: p.textoSecundario)),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        for (final r in _reglas!)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
            decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
            child: Row(
              children: [
                Icon(MotivoAusencia.de(r.motivo)?.icono ?? Icons.event_available_outlined, color: p.marcaTexto),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        r.resumenRango,
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                      ),
                      const SizedBox(height: 2),
                      Text(r.resumenEstado, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                    ],
                  ),
                ),
                IconButton(tooltip: 'Editar', icon: const Icon(Icons.edit_outlined), onPressed: _ocupado ? null : () => setState(() => _abrirAsistente(r))),
                IconButton(tooltip: 'Eliminar', icon: const Icon(Icons.delete_outline_rounded), onPressed: _ocupado ? null : () => _eliminar(r)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _seccion(
    BuildContext context, {
    required String titulo,
    required String resumen,
    required bool abierta,
    required VoidCallback alTocar,
    required Widget hijo,
  }) {
    final p = context.pivot;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: alTocar,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(
                children: [
                  Text(
                    titulo,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      child: Text(
                        resumen,
                        key: ValueKey(resumen),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.end,
                        style: TextStyle(fontSize: 13, color: p.marcaTexto),
                      ),
                    ),
                  ),
                  AnimatedRotation(turns: abierta ? 0.5 : 0, duration: const Duration(milliseconds: 220), child: const Icon(Icons.expand_more_rounded)),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: abierta ? Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: hijo) : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }

  Widget _asistente(BuildContext context) {
    final p = context.pivot;
    final motivoDef = MotivoAusencia.de(_motivo);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _seccion(
          context,
          titulo: 'Estado a aplicar',
          resumen: _secEstado ? '' : _resumenEstado,
          abierta: _secEstado,
          alTocar: () => setState(() => _secEstado = !_secEstado),
          hijo: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Define un estado que se aplicará automáticamente a tus entrenamientos futuros, sin necesidad de marcarlo uno por uno.',
                style: TextStyle(fontSize: 13, color: p.textoSecundario),
              ),
              const SizedBox(height: 12),
              SegmentedButton<EstadoRsvp>(
                emptySelectionAllowed: true,
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: EstadoRsvp.asistire, label: Text('Asistiré'), icon: Icon(Icons.check_circle_outline_rounded)),
                  ButtonSegment(value: EstadoRsvp.noAsistire, label: Text('No asistiré'), icon: Icon(Icons.cancel_outlined)),
                  ButtonSegment(value: EstadoRsvp.noJugador, label: Text('No jugador'), icon: Icon(Icons.radio_button_checked_rounded)),
                ],
                selected: {?_estado},
                onSelectionChanged: (s) {
                  if (s.isNotEmpty) _elegirEstado(s.first);
                },
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 240),
                alignment: Alignment.topCenter,
                child: _estado == EstadoRsvp.noAsistire
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 16),
                          Text(
                            '¿Por qué no asistirás?',
                            style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final m in MotivoAusencia.todos)
                                ChoiceChip(
                                  avatar: Icon(m.icono, size: 18),
                                  label: Text(m.valor),
                                  selected: _motivo == m.valor,
                                  onSelected: (_) {
                                    final primeraVez = _motivo == null;
                                    setState(() => _motivo = m.valor);
                                    if (primeraVez && !_frecuenciaValida) {
                                      Future.delayed(const Duration(milliseconds: 900), () {
                                        if (mounted && _motivo == m.valor) setState(() => _secEstado = false);
                                      });
                                    }
                                  },
                                ),
                            ],
                          ),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 200),
                            child: motivoDef == null
                                ? const SizedBox(width: double.infinity)
                                : Padding(
                                    key: ValueKey(motivoDef.valor),
                                    padding: const EdgeInsets.only(top: 10),
                                    child: Text('${motivoDef.ayuda} ${MotivoAusencia.ayudaComun}', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                                  ),
                          ),
                        ],
                      )
                    : const SizedBox(width: double.infinity),
              ),
            ],
          ),
        ),
        _seccion(
          context,
          titulo: 'Frecuencia',
          resumen: _resumenFrecuencia,
          abierta: !_secEstado,
          alTocar: () => setState(() => _secEstado = !_secEstado),
          hijo: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final t in TipoRango.values)
                    if (t != TipoRango.indefinido || !_restringe)
                      ChoiceChip(
                        label: Text(t.etiqueta),
                        selected: _tipo == t,
                        onSelected: (_) => setState(() {
                          if (_tipo != t) {
                            _desde = t == TipoRango.indefinido ? Fechas.hoy() : null;
                            _hasta = null;
                          }
                          _tipo = t;
                        }),
                      ),
                ],
              ),
              const SizedBox(height: 14),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 240),
                child: KeyedSubtree(key: ValueKey(_tipo), child: _detalleFrecuencia(context)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _detalleFrecuencia(BuildContext context) {
    final p = context.pivot;
    switch (_tipo) {
      case null:
        return const SizedBox(width: double.infinity);
      case TipoRango.meses:
        return GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 2.4,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          children: [
            for (var m = 1; m <= 12; m++)
              FilterChip(
                showCheckmark: false,
                label: SizedBox(
                  width: double.infinity,
                  child: Text(Fechas.mesNombre(DateTime(2000, m)), textAlign: TextAlign.center),
                ),
                selected: _meses.contains(m),
                onSelected: _mesHabilitado(m) ? (v) => setState(() => v ? _meses.add(m) : _meses.remove(m)) : null,
              ),
          ],
        );
      case TipoRango.periodo:
      case TipoRango.indefinido:
        final rango = _tipo == TipoRango.periodo;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SelectorFechas(
              desde: _desde,
              hasta: _hasta,
              rango: rango,
              deshabilitado: _diaDeshabilitado,
              alCambiar: (d, h) => setState(() {
                _desde = d;
                _hasta = h;
              }),
            ),
            const SizedBox(height: 6),
            Text(
              rango
                  ? (_desde == null
                        ? 'Toca el primer día y luego el último.'
                        : (_hasta == null
                              ? 'Desde ${Fechas.corta(_desde!)}: ahora toca el último día.'
                              : 'Del ${Fechas.corta(_desde!)} al ${Fechas.corta(_hasta!)}'))
                  : (_desde == null ? '' : 'Desde ${Fechas.corta(_desde!)}. Sin fecha de fin.'),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: p.textoSecundario),
            ),
          ],
        );
    }
  }
}
