import 'package:flutter/material.dart';

import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'anticipada.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'selector_fechas.dart';

/// Asistencia anticipada: lista de reglas. Crear o editar abre el asistente
/// por pasos (mismo marco que el resto de la app, pedido 2026-11-06).
class AnticipadaScreen extends StatefulWidget {
  const AnticipadaScreen({super.key, required this.repo, this.abrirNueva = false});
  final EventosRepo repo;

  /// Desde el menú "+": si no hay reglas, abre directo el asistente.
  final bool abrirNueva;

  @override
  State<AnticipadaScreen> createState() => _AnticipadaScreenState();
}

class _AnticipadaScreenState extends State<AnticipadaScreen> {
  AnticipadaRepo get _ant => widget.repo.anticipada;

  List<ReglaAnticipada>? _reglas;
  Cuota? _cuota;
  String? _error;
  bool _ocupado = false;

  @override
  void initState() {
    super.initState();
    _cargar(abrirSiVacio: widget.abrirNueva);
  }

  Future<void> _cargar({bool abrirSiVacio = false}) async {
    setState(() => _error = null);
    try {
      final res = await Future.wait([_ant.reglas(), if (_cuota == null) _ant.cuota()]);
      if (!mounted) return;
      setState(() {
        _reglas = res[0] as List<ReglaAnticipada>;
        if (res.length > 1) _cuota = res[1] as Cuota;
      });
      if (abrirSiVacio && _reglas!.isEmpty) _abrirAsistente(null);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudieron cargar tus asistencias anticipadas.');
    }
  }

  void _avisar(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _abrirAsistente(ReglaAnticipada? r) async {
    final guardado = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AnticipadaAsistente(repo: widget.repo, cuota: _cuota, reglas: _reglas ?? const [], editando: r),
      ),
    );
    if (guardado == true && mounted) {
      _avisar(r == null ? 'Asistencia anticipada aplicada.' : 'Cambios guardados.');
      await _cargar();
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

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final Widget cuerpo;
    if (_error != null) {
      cuerpo = Center(
        key: const ValueKey('error'),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
          ],
        ),
      );
    } else if (_reglas == null) {
      cuerpo = const Center(key: ValueKey('cargando'), child: CircularProgressIndicator());
    } else if (_reglas!.isEmpty) {
      cuerpo = Center(
        key: const ValueKey('vacio'),
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.event_repeat_rounded, size: 56, color: p.marcaTexto),
              const SizedBox(height: 16),
              Text('Responde una sola vez', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(
                'Define si asistirás o no a tus entrenamientos de ciertos meses o fechas, y se marcan solos.',
                textAlign: TextAlign.center,
                style: TextStyle(color: p.textoSecundario, height: 1.4),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: () => _abrirAsistente(null), child: const Text('Crear asistencia anticipada')),
            ],
          ),
        ),
      );
    } else {
      cuerpo = ListView(
        key: const ValueKey('lista'),
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
                  IconButton(tooltip: 'Editar', icon: const Icon(Icons.edit_outlined), onPressed: _ocupado ? null : () => _abrirAsistente(r)),
                  IconButton(tooltip: 'Eliminar', icon: const Icon(Icons.delete_outline_rounded), onPressed: _ocupado ? null : () => _eliminar(r)),
                ],
              ),
            ),
        ],
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Asistencia anticipada')),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 260), child: cuerpo),
      floatingActionButton: (_reglas?.isNotEmpty ?? false)
          ? FloatingActionButton.extended(onPressed: () => _abrirAsistente(null), icon: const Icon(Icons.add_rounded), label: const Text('Nueva'))
          : null,
    );
  }
}

enum _Paso { estado, motivo, tipo, fechas }

/// Asistente por pasos: Estado → (Motivo, si no asistirás) → Frecuencia →
/// Meses o fechas. Misma lógica que la web (`_evAnt*`): motivo obligatorio
/// con "No asistiré", con "Asistiré" y cuota mensual solo meses pagados y
/// sin "Indefinido", una sola regla indefinida.
class AnticipadaAsistente extends StatefulWidget {
  const AnticipadaAsistente({super.key, required this.repo, required this.cuota, required this.reglas, this.editando});
  final EventosRepo repo;
  final Cuota? cuota;
  final List<ReglaAnticipada> reglas;
  final ReglaAnticipada? editando;

  @override
  State<AnticipadaAsistente> createState() => _AnticipadaAsistenteState();
}

class _AnticipadaAsistenteState extends State<AnticipadaAsistente> {
  _Paso _paso = _Paso.estado;
  bool _adelante = true;
  bool _ocupado = false;

  late EstadoRsvp? _estado = widget.editando?.estado;
  late String? _motivo = widget.editando?.estado == EstadoRsvp.noAsistire ? widget.editando?.motivo : null;
  late TipoRango? _tipo = widget.editando?.tipo;
  late final Set<int> _meses = {...?widget.editando?.meses};
  late DateTime? _desde = widget.editando?.desde;
  late DateTime? _hasta = widget.editando?.hasta;

  Cuota? get _cuota => widget.cuota;
  bool get _restringe => _cuota?.restringe(_estado) ?? false;

  List<_Paso> get _pasos => [_Paso.estado, if (_estado == EstadoRsvp.noAsistire) _Paso.motivo, _Paso.tipo, _Paso.fechas];

  void _ir(int delta) {
    final pasos = _pasos;
    final i = pasos.indexOf(_paso) + delta;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= pasos.length) return;
    setState(() {
      _adelante = delta > 0;
      _paso = pasos[i];
    });
  }

  /// Avanza un instante después de elegir, para que se vea la selección.
  void _elegirYSeguir(VoidCallback cambio) {
    setState(cambio);
    Future.delayed(const Duration(milliseconds: 180), () {
      if (mounted) _ir(1);
    });
  }

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

  /// Con "Asistiré" y cuota mensual, recorta lo que quedó fuera de los meses pagados.
  void _ajustarACuota() {
    if (!_restringe || _tipo == null) return;
    var ajusto = false;
    if (_tipo == TipoRango.meses) {
      final antes = _meses.length;
      _meses.removeWhere((m) => !_mesHabilitado(m));
      ajusto = antes != _meses.length;
    } else if (_tipo == TipoRango.periodo) {
      final lim = _cuota?.limite(_estado);
      if (lim != null && _desde != null && _desde!.isAfter(lim)) {
        _desde = null;
        _hasta = null;
        ajusto = true;
      } else if (lim != null && _hasta != null && _hasta!.isAfter(lim)) {
        _hasta = lim;
        ajusto = true;
      }
    } else if (_tipo == TipoRango.indefinido) {
      _tipo = null;
      _desde = null;
      ajusto = true;
    }
    if (ajusto) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ajustamos la frecuencia a los meses que tienes pagados.')));
  }

  bool get _fechasValidas => switch (_tipo) {
    TipoRango.meses => _meses.isNotEmpty,
    TipoRango.periodo => _desde != null && _hasta != null && !_hasta!.isBefore(_desde!),
    TipoRango.indefinido => _desde != null,
    null => false,
  };

  Future<void> _aplicar() async {
    if (_tipo == TipoRango.indefinido && widget.reglas.any((r) => r.tipo == TipoRango.indefinido && r.id != widget.editando?.id)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ya tienes una regla indefinida activa. Elimínala antes de crear una nueva.')));
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
      final aviso = await widget.repo.anticipada.guardar(nueva, vieja: widget.editando);
      if (aviso != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(aviso)));
      await widget.repo.cargar(forzar: true);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _ocupado = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo aplicar la asistencia anticipada. $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pasos = _pasos;
    final idx = pasos.indexOf(_paso);
    return Asistente(
      titulo: widget.editando == null ? 'Nueva asistencia anticipada' : 'Editar asistencia anticipada',
      indice: idx,
      total: pasos.length,
      tituloPaso: switch (_paso) {
        _Paso.estado => '¿Qué quieres marcar?',
        _Paso.motivo => '¿Por qué no asistirás?',
        _Paso.tipo => '¿Para cuándo?',
        _Paso.fechas => _tipo == TipoRango.meses ? 'Elige los meses' : (_tipo == TipoRango.periodo ? 'Elige las fechas' : 'Desde cuándo'),
      },
      ayuda: switch (_paso) {
        _Paso.estado => 'Se aplica sola a tus entrenamientos futuros, sin marcarlos uno por uno.',
        _Paso.motivo => MotivoAusencia.ayudaComun,
        _Paso.tipo => _restringe ? 'Con "Asistiré" solo puedes elegir los meses que tienes pagados.' : null,
        _Paso.fechas => null,
      },
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      cuerpo: switch (_paso) {
        _Paso.estado => _pasoEstado(context),
        _Paso.motivo => _pasoMotivo(context),
        _Paso.tipo => _pasoTipo(context),
        _Paso.fechas => _pasoFechas(context),
      },
      textoBoton: _paso == _Paso.fechas ? (widget.editando == null ? 'Aplicar' : 'Guardar cambios') : (_siguienteVisible ? 'Siguiente' : null),
      alContinuar: _paso == _Paso.fechas ? (_fechasValidas ? _aplicar : null) : () => _ir(1),
      ocupado: _ocupado,
    );
  }

  // Al editar, los pasos ya respondidos muestran "Siguiente" para no obligar a tocar de nuevo.
  bool get _siguienteVisible => switch (_paso) {
    _Paso.estado => _estado != null,
    _Paso.motivo => _motivo != null,
    _Paso.tipo => _tipo != null,
    _Paso.fechas => false,
  };

  Widget _pasoEstado(BuildContext context) {
    void elegir(EstadoRsvp e) => _elegirYSeguir(() {
      _estado = e;
      if (e != EstadoRsvp.noAsistire) _motivo = null;
      _ajustarACuota();
    });
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OpcionAsistente(
          icono: Icons.check_circle_outline_rounded,
          titulo: 'Asistiré',
          texto: 'Voy a ir a los entrenamientos',
          activa: _estado == EstadoRsvp.asistire,
          alTocar: () => elegir(EstadoRsvp.asistire),
        ),
        OpcionAsistente(
          icono: Icons.cancel_outlined,
          titulo: 'No asistiré',
          texto: 'No voy a poder ir',
          activa: _estado == EstadoRsvp.noAsistire,
          alTocar: () => elegir(EstadoRsvp.noAsistire),
        ),
        OpcionAsistente(
          icono: Icons.radio_button_checked_rounded,
          titulo: 'No jugador',
          texto: 'Voy, pero sin jugar',
          activa: _estado == EstadoRsvp.noJugador,
          alTocar: () => elegir(EstadoRsvp.noJugador),
        ),
      ],
    );
  }

  Widget _pasoMotivo(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final m in MotivoAusencia.todos)
          OpcionAsistente(icono: m.icono, titulo: m.valor, texto: m.ayuda, activa: _motivo == m.valor, alTocar: () => _elegirYSeguir(() => _motivo = m.valor)),
      ],
    );
  }

  Widget _pasoTipo(BuildContext context) {
    void elegir(TipoRango t) => _elegirYSeguir(() {
      if (_tipo != t) {
        _desde = t == TipoRango.indefinido ? Fechas.hoy() : null;
        _hasta = null;
      }
      _tipo = t;
    });
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OpcionAsistente(
          icono: Icons.calendar_view_month_rounded,
          titulo: 'Por meses',
          texto: 'Uno o varios meses de este año',
          activa: _tipo == TipoRango.meses,
          alTocar: () => elegir(TipoRango.meses),
        ),
        OpcionAsistente(
          icono: Icons.date_range_rounded,
          titulo: 'Por período',
          texto: 'Entre dos fechas',
          activa: _tipo == TipoRango.periodo,
          alTocar: () => elegir(TipoRango.periodo),
        ),
        if (!_restringe)
          OpcionAsistente(
            icono: Icons.all_inclusive_rounded,
            titulo: 'Indefinido',
            texto: 'Desde una fecha, sin fin',
            activa: _tipo == TipoRango.indefinido,
            alTocar: () => elegir(TipoRango.indefinido),
          ),
      ],
    );
  }

  Widget _pasoFechas(BuildContext context) {
    final p = context.pivot;
    if (_tipo == TipoRango.meses) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GridView.count(
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
          ),
        ],
      );
    }
    final rango = _tipo == TipoRango.periodo;
    return ListView(
      padding: const EdgeInsets.all(16),
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
        const SizedBox(height: 8),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: Text(
            rango
                ? (_desde == null
                      ? 'Toca el primer día y luego el último.'
                      : (_hasta == null
                            ? 'Desde el ${Fechas.corta(_desde!)}: ahora toca el último día.'
                            : 'Del ${Fechas.corta(_desde!)} al ${Fechas.corta(_hasta!)}'))
                : (_desde == null ? '' : 'Desde el ${Fechas.corta(_desde!)}, sin fecha de fin.'),
            key: ValueKey('$_desde$_hasta'),
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w600, color: p.marcaTexto),
          ),
        ),
      ],
    );
  }
}
