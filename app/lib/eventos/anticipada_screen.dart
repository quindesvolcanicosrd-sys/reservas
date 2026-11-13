import 'package:flutter/material.dart';

import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'anticipada.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'selector_fechas.dart';
import '../core/cargando.dart';

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
      if (abrirSiVacio && _reglas!.every((r) => _vigencia(r) == VigenciaRegla.termino)) _abrirAsistente(null);
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

  VigenciaRegla _vigencia(ReglaAnticipada r) {
    final hoy = Fechas.hoy();
    switch (r.tipo) {
      case TipoRango.periodo:
        if (r.hasta != null && r.hasta!.isBefore(hoy)) return VigenciaRegla.termino;
        if (r.desde != null && r.desde!.isAfter(hoy)) return VigenciaRegla.proxima;
        return VigenciaRegla.activa;
      case TipoRango.indefinido:
        return r.desde != null && r.desde!.isAfter(hoy) ? VigenciaRegla.proxima : VigenciaRegla.activa;
      case TipoRango.meses:
        final actual = DateTime(hoy.year, hoy.month);
        final ms = r.mesesOrdenados;
        if (ms.contains(actual)) return VigenciaRegla.activa;
        return ms.any((m) => m.isAfter(actual)) ? VigenciaRegla.proxima : VigenciaRegla.termino;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final Widget cuerpo;
    // Las reglas que ya terminaron (p. ej. de un mes pasado) no se muestran.
    final visibles = _reglas?.where((r) => _vigencia(r) != VigenciaRegla.termino).toList();
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
      cuerpo = const Center(key: ValueKey('cargando'), child: PivotCargando());
    } else if (visibles!.isEmpty) {
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
      // Activas primero, después las próximas.
      final orden = visibles..sort((x, y) => _vigencia(x).index.compareTo(_vigencia(y).index));
      cuerpo = ListView(
        key: const ValueKey('lista'),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 14),
            child: Text(
              'Se aplican solas a tus entrenamientos; nunca cambian una respuesta que marcaste a mano.',
              style: TextStyle(fontSize: 13, height: 1.4, color: p.textoSecundario),
            ),
          ),
          for (final r in orden)
            TarjetaRegla(regla: r, vigencia: _vigencia(r), ocupado: _ocupado, alEditar: () => _abrirAsistente(r), alEliminar: () => _eliminar(r)),
        ],
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Asistencia anticipada')),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 260), child: cuerpo),
      floatingActionButton: (visibles?.isNotEmpty ?? false)
          ? FloatingActionButton.extended(onPressed: () => _abrirAsistente(null), icon: const Icon(Icons.add_rounded), label: const Text('Nueva'))
          : null,
    );
  }
}

enum _Paso { estado, motivo, tipo, fechas, alcance }

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
  // aaaamm; una regla vieja (solo el mes) pasa a tener año al editarla.
  late final Set<int> _meses = {for (final v in widget.editando?.meses ?? const <int>[]) ReglaAnticipada.clave(ReglaAnticipada.mesDe(v))};
  late DateTime? _desde = widget.editando?.desde;
  late DateTime? _hasta = widget.editando?.hasta;
  // Solo ciertos días o lugares (Victor, 2026-11-12); vacío = todos.
  late final Set<int> _dias = {...?widget.editando?.diasSemana};
  late final Set<String> _lugares = {...?widget.editando?.lugares};
  List<String>? _lugaresDisponibles;
  bool _soloAlgunos = false;

  @override
  void initState() {
    super.initState();
    widget.repo
        .venues()
        .then((v) {
          if (mounted) setState(() => _lugaresDisponibles = [for (final x in v) '${x['lugar']}'.trim()]..removeWhere((x) => x.isEmpty));
        })
        .catchError((_) {
          if (mounted) setState(() => _lugaresDisponibles = const []);
        });
  }

  Cuota? get _cuota => widget.cuota;
  bool get _restringe => _cuota?.restringe(_estado) ?? false;

  List<_Paso> get _pasos => [_Paso.estado, if (_estado == EstadoRsvp.noAsistire) _Paso.motivo, _Paso.tipo, _Paso.fechas, _Paso.alcance];

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

  bool _mesHabilitado(int clave) {
    final d = ReglaAnticipada.mesDe(clave);
    return !d.isBefore(DateTime(Fechas.hoy().year, Fechas.hoy().month)) && (_cuota?.mesPermitido(_estado, d.month, d.year) ?? true);
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
    // Una sola indefinida para todos los eventos; con días o lugares pueden convivir varias.
    if (_tipo == TipoRango.indefinido &&
        _dias.isEmpty &&
        _lugares.isEmpty &&
        widget.reglas.any((r) => r.tipo == TipoRango.indefinido && r.id != widget.editando?.id && r.especificidad == 0)) {
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
      diasSemana: _dias.toList()..sort(),
      lugares: _lugares.toList(),
    );
    // Si se cruza con otra regla, se avisa y se pide aprobarla (Victor, 2026-11-12).
    final cruces = widget.reglas.where((r) => r.id != widget.editando?.id && nueva.seCruzaCon(r)).toList();
    if (cruces.isNotEmpty) {
      final gana = cruces.every((r) => _ganaNueva(nueva, r));
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: const Text('Esta regla se cruza con otra'),
          content: Text(
            [
              for (final r in cruces) '• ${r.estado.valor}${r.resumenFiltros.isEmpty ? '' : ' (${r.resumenFiltros.toLowerCase()})'} · ${r.resumenRango}',
              '',
              gana
                  ? 'En los eventos donde coinciden manda esta nueva, por ser más específica o más reciente.'
                  : 'En los eventos donde coinciden manda la otra, por ser de un tipo con más prioridad (período > meses > indefinido).',
              'Tus respuestas a mano nunca se cambian.',
            ].join('\n'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Revisar')),
            FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Guardar igual')),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
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
        _Paso.alcance => '¿A qué entrenamientos aplica?',
      },
      ayuda: switch (_paso) {
        _Paso.estado => 'Se aplica sola a tus entrenamientos futuros, sin marcarlos uno por uno.',
        _Paso.motivo => MotivoAusencia.ayudaComun,
        _Paso.tipo => _restringe ? 'Con "Asistiré" solo puedes elegir los meses que tienes pagados.' : null,
        _Paso.fechas => null,
        _Paso.alcance => 'Todos, o solo ciertos días de la semana o lugares. Puedes combinar ambos.',
      },
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      cuerpo: switch (_paso) {
        _Paso.estado => _pasoEstado(context),
        _Paso.motivo => _pasoMotivo(context),
        _Paso.tipo => _pasoTipo(context),
        _Paso.fechas => _pasoFechas(context),
        _Paso.alcance => _pasoAlcance(context),
      },
      textoBoton: _paso == _Paso.alcance ? (widget.editando == null ? 'Aplicar' : 'Guardar cambios') : (_siguienteVisible ? 'Siguiente' : null),
      alContinuar: _paso == _Paso.alcance
          ? (_soloAlgunos && _dias.isEmpty && _lugares.isEmpty ? null : _aplicar)
          : (_paso == _Paso.fechas ? (_fechasValidas ? () => _ir(1) : null) : () => _ir(1)),
      ocupado: _ocupado,
    );
  }

  // Al editar, los pasos ya respondidos muestran "Siguiente" para no obligar a tocar de nuevo.
  bool get _siguienteVisible => switch (_paso) {
    _Paso.estado => _estado != null,
    _Paso.motivo => _motivo != null,
    _Paso.tipo => _tipo != null,
    _Paso.fechas => _fechasValidas,
    _Paso.alcance => false,
  };

  /// La nueva gana si su tipo tiene más prioridad, o el mismo con más
  /// filtros, o empatan (la nueva es la más reciente).
  static bool _ganaNueva(ReglaAnticipada n, ReglaAnticipada o) {
    const orden = {TipoRango.indefinido: 0, TipoRango.meses: 1, TipoRango.periodo: 2};
    final t = orden[n.tipo]!.compareTo(orden[o.tipo]!);
    if (t != 0) return t > 0;
    return n.especificidad >= o.especificidad;
  }

  Widget _pasoAlcance(BuildContext context) {
    final p = context.pivot;
    final algunos = _soloAlgunos || _dias.isNotEmpty || _lugares.isNotEmpty;
    Text titulo(String t) => Text(
      t,
      style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
    );
    // Primero "¿todos o algunos?"; los días y lugares aparecen solo si eligen
    // "Solo algunos" (Victor, 2026-11-13: era mucho en un paso).
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OpcionAsistente(
          icono: Icons.event_available_rounded,
          titulo: 'Todos los entrenamientos',
          texto: 'Sin importar el día ni el lugar.',
          activa: !algunos,
          alTocar: () => setState(() {
            _soloAlgunos = false;
            _dias.clear();
            _lugares.clear();
          }),
        ),
        const SizedBox(height: 10),
        OpcionAsistente(
          icono: Icons.filter_alt_outlined,
          titulo: 'Solo algunos',
          texto: 'Ciertos días de la semana o ciertos lugares.',
          activa: algunos,
          alTocar: () => setState(() => _soloAlgunos = true),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: !algunos
              ? const SizedBox(width: double.infinity)
              : Padding(
                  padding: const EdgeInsets.only(top: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      titulo('Días'),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (var d = 1; d <= 7; d++)
                            FilterChip(
                              showCheckmark: false,
                              label: Text(ReglaAnticipada.nombresDias[d - 1].substring(0, 3)),
                              tooltip: ReglaAnticipada.nombresDias[d - 1],
                              selected: _dias.contains(d),
                              onSelected: (_) => setState(() => _dias.contains(d) ? _dias.remove(d) : _dias.add(d)),
                            ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      titulo('Lugares'),
                      const SizedBox(height: 8),
                      if (_lugaresDisponibles == null)
                        const Center(child: PivotCargando(tamano: 40))
                      else if (_lugaresDisponibles!.isEmpty)
                        Text('No hay lugares guardados.', style: TextStyle(color: p.textoSecundario))
                      else
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final l in {..._lugaresDisponibles!, ..._lugares})
                              FilterChip(
                                showCheckmark: false,
                                label: Text(l),
                                selected: _lugares.contains(l),
                                onSelected: (_) => setState(() => _lugares.contains(l) ? _lugares.remove(l) : _lugares.add(l)),
                              ),
                          ],
                        ),
                      const SizedBox(height: 14),
                      Text(
                        _dias.isEmpty && _lugares.isEmpty
                            ? 'Elige al menos un día o un lugar. Si eliges los dos, aplica cuando coinciden.'
                            : 'Aplica ${ReglaAnticipada(tipo: TipoRango.indefinido, estado: EstadoRsvp.asistire, diasSemana: _dias.toList(), lugares: _lugares.toList()).resumenFiltros.toLowerCase()}.',
                        style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
                      ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }

  Widget _pasoEstado(BuildContext context) {
    void elegir(EstadoRsvp e) => _elegirYSeguir(() {
      _estado = e;
      if (e != EstadoRsvp.noAsistire) _motivo = null;
      _ajustarACuota();
    });
    final puedeAsistir = _cuota?.asistireHabilitado ?? true;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OpcionAsistente(
          icono: Icons.check_circle_outline_rounded,
          titulo: 'Asistiré',
          texto: puedeAsistir ? 'Voy a ir a los entrenamientos' : 'Necesitas tu cuota al día o una clase reservada',
          activa: _estado == EstadoRsvp.asistire,
          habilitada: puedeAsistir,
          alTocar: () {
            if (puedeAsistir) return elegir(EstadoRsvp.asistire);
            ScaffoldMessenger.of(context)
              ..hideCurrentSnackBar()
              ..showSnackBar(
                const SnackBar(
                  content: Text('Para marcar Asistiré necesitas tener tu cuota al día o una clase reservada. No asistiré y No jugador siguen disponibles.'),
                ),
              );
          },
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
          texto: 'Uno o varios de los próximos 12 meses',
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
            childAspectRatio: 1.8,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            children: [
              // 12 meses desde el actual, cada uno con su año abajo.
              for (final d in ReglaAnticipada.ventana())
                FilterChip(
                  showCheckmark: false,
                  label: SizedBox(
                    width: double.infinity,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(Fechas.mesNombre(d), textAlign: TextAlign.center),
                        Text('${d.year}', style: TextStyle(fontSize: 11, color: p.textoSecundario)),
                      ],
                    ),
                  ),
                  selected: _meses.contains(ReglaAnticipada.clave(d)),
                  onSelected: _mesHabilitado(ReglaAnticipada.clave(d))
                      ? (v) => setState(() => v ? _meses.add(ReglaAnticipada.clave(d)) : _meses.remove(ReglaAnticipada.clave(d)))
                      : null,
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

enum VigenciaRegla { activa, proxima, termino }

/// Una regla: el estado grande y con color, el período en lenguaje simple y
/// si está activa. Editar/eliminar van en el menú ⋮ (tocar la tarjeta edita).
class TarjetaRegla extends StatelessWidget {
  const TarjetaRegla({super.key, required this.regla, required this.vigencia, required this.ocupado, required this.alEditar, required this.alEliminar});
  final ReglaAnticipada regla;
  final VigenciaRegla vigencia;
  final bool ocupado;
  final VoidCallback alEditar;
  final VoidCallback alEliminar;

  String get _periodo {
    final r = regla;
    switch (r.tipo) {
      case TipoRango.meses:
        // En orden de calendario, con el año cuando no es el actual.
        final ms = [for (final (i, d) in r.mesesOrdenados.indexed) ReglaAnticipada.nombreMes(d, corto: i > 0)];
        return ms.length == 1 ? ms.first : '${ms.sublist(0, ms.length - 1).join(', ')} y ${ms.last}';
      case TipoRango.periodo:
        return 'Del ${Fechas.corta(r.desde!)} al ${Fechas.corta(r.hasta!)}';
      case TipoRango.indefinido:
        return 'Desde el ${Fechas.corta(r.desde!)} · sin fecha de fin';
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final terminada = vigencia == VigenciaRegla.termino;
    final (IconData icono, Color fondo, Color frente) = switch (regla.estado) {
      EstadoRsvp.asistire => (Icons.check_circle_rounded, p.suave, p.sobreSuave),
      EstadoRsvp.noAsistire => (MotivoAusencia.de(regla.motivo)?.icono ?? Icons.cancel_rounded, p.apagadoFondo, p.texto),
      EstadoRsvp.noJugador => (Icons.radio_button_checked_rounded, p.apagadoFondo, p.texto),
    };
    final (String textoVig, Color colorVig) = switch (vigencia) {
      VigenciaRegla.activa => ('Activa', p.marcaTexto),
      VigenciaRegla.proxima => ('Próxima', p.textoSecundario),
      VigenciaRegla.termino => ('Terminó', p.apagado),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Opacity(
        opacity: terminada ? 0.6 : 1,
        child: Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          child: InkWell(
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            onTap: ocupado ? null : alEditar,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 4, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(color: fondo, borderRadius: BorderRadius.circular(PivotRadios.chip)),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(icono, size: 20, color: frente),
                            const SizedBox(width: 8),
                            Text(
                              regla.estado.valor,
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: frente),
                            ),
                          ],
                        ),
                      ),
                      if (regla.estado == EstadoRsvp.noAsistire && regla.motivo != null) ...[
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            regla.motivo!,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: p.textoSecundario),
                          ),
                        ),
                      ],
                      const Spacer(),
                      PopupMenuButton<String>(
                        tooltip: 'Opciones',
                        enabled: !ocupado,
                        icon: Icon(Icons.more_vert_rounded, color: p.textoSecundario),
                        onSelected: (v) => v == 'editar' ? alEditar() : alEliminar(),
                        itemBuilder: (c) => const [
                          PopupMenuItem(
                            value: 'editar',
                            child: ListTile(leading: Icon(Icons.edit_outlined), title: Text('Editar'), contentPadding: EdgeInsets.zero),
                          ),
                          PopupMenuItem(
                            value: 'eliminar',
                            child: ListTile(leading: Icon(Icons.delete_outline_rounded), title: Text('Eliminar'), contentPadding: EdgeInsets.zero),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _periodo,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.texto),
                  ),
                  if (regla.resumenFiltros.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      regla.resumenFiltros,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: p.marcaTexto),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(color: colorVig, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '$textoVig · ${regla.tiposEvento.isEmpty ? 'Todos los eventos' : regla.tiposEvento.join(', ')}',
                        style: TextStyle(fontSize: 13, color: p.textoSecundario),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
