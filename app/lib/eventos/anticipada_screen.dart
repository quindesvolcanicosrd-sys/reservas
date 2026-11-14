import 'package:flutter/material.dart';

import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'anticipada.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'selector_fechas.dart';
import '../core/cargando.dart';
import '../core/vidrio.dart';

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
        padding: EdgeInsets.fromLTRB(16, 4 + altoBarra(context), 16, 96),
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
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        flexibleSpace: const Vidrio(child: SizedBox.expand()),
        title: const Text('Asistencia anticipada'),
      ),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 260), child: cuerpo),
      floatingActionButton: (visibles?.isNotEmpty ?? false)
          ? FloatingActionButton.extended(onPressed: () => _abrirAsistente(null), icon: const Icon(Icons.add_rounded), label: const Text('Nueva'))
          : null,
    );
  }
}

enum _Paso { estado, motivo, tipo, fechas, alcance, criterio, dias, lugares, horario }

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
  late String? _horaDesde = widget.editando?.horaDesde;
  late String? _horaHasta = widget.editando?.horaHasta;
  // "Solo algunos" se arma por pasos (Victor, 2026-11-13): primero por qué
  // (días, lugares u horario, se pueden combinar) y después cada uno.
  late bool _soloAlgunos = widget.editando != null && widget.editando!.especificidad > 0;
  late bool _porDias = _dias.isNotEmpty;
  late bool _porLugares = _lugares.isNotEmpty;
  late bool _porHorario = widget.editando?.conHorario ?? false;

  /// Entrenamientos futuros: de ahí salen los días y lugares que se ofrecen.
  List<Evento> get _futuros {
    final hoy = Fechas.hoy();
    return [
      for (final e in widget.repo.eventos)
        if (!e.cancelado && !e.fecha.isBefore(hoy) && e.tipo == 'Entrenamiento') e,
    ];
  }

  List<int> get _diasConEventos => ({for (final e in _futuros) e.fecha.weekday, ..._dias}.toList()..sort());

  /// Entrenamientos que tocan los días ya elegidos (Victor, 2026-11-14: los
  /// días definen los lugares; si los lunes solo hay CCI, no se ofrece otro).
  List<Evento> get _delosDias => [
    for (final e in _futuros)
      if (!_porDias || _dias.isEmpty || _dias.contains(e.fecha.weekday)) e,
  ];

  /// Entrenamientos que tocan días y lugares elegidos (para el horario).
  List<Evento> get _relevantes => [
    for (final e in _delosDias)
      if (!_porLugares || _lugares.isEmpty || _lugares.any((l) => l.toLowerCase() == e.lugar.trim().toLowerCase())) e,
  ];

  List<String> get _lugaresConEventos {
    final vistos = <String, String>{};
    for (final l in [..._delosDias.map((e) => e.lugar), ..._lugares]) {
      if (l.trim().isNotEmpty) vistos.putIfAbsent(l.trim().toLowerCase(), () => l.trim());
    }
    return vistos.values.toList()..sort();
  }

  Cuota? get _cuota => widget.cuota;
  bool get _restringe => _cuota?.restringe(_estado) ?? false;

  List<_Paso> get _pasos => [
    _Paso.estado,
    if (_estado == EstadoRsvp.noAsistire) _Paso.motivo,
    _Paso.tipo,
    _Paso.fechas,
    _Paso.alcance,
    if (_soloAlgunos) ...[_Paso.criterio, if (_porDias) _Paso.dias, if (_porLugares) _Paso.lugares, if (_porHorario) _Paso.horario],
  ];

  bool get _horarioValido => _horaDesde != null && _horaHasta != null && _horaDesde!.compareTo(_horaHasta!) <= 0;

  /// ¿Se puede seguir (o aplicar) desde el paso actual?
  bool get _pasoValido => switch (_paso) {
    _Paso.estado => _estado != null,
    _Paso.motivo => _motivo != null,
    _Paso.tipo => _tipo != null,
    _Paso.fechas => _fechasValidas,
    _Paso.alcance => true,
    _Paso.criterio => _porDias || _porLugares || _porHorario,
    _Paso.dias => _dias.isNotEmpty,
    _Paso.lugares => _lugares.isNotEmpty,
    _Paso.horario => _horarioValido,
  };

  void _ir(int delta) {
    final pasos = _pasos;
    // Al pasar de días a lugares: se quitan los lugares que no tienen
    // entrenamientos esos días y, si queda uno solo, se elige solo.
    if (delta > 0 && _paso == _Paso.dias && _porLugares) {
      final hay = _lugaresConEventosSinElegidos;
      _lugares.removeWhere((l) => !hay.any((x) => x.toLowerCase() == l.toLowerCase()));
      if (hay.length == 1 && _lugares.isEmpty) _lugares.add(hay.first);
    }
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
    // Lo que no se eligió en "Solo algunos" no se guarda.
    if (!_soloAlgunos || !_porDias) _dias.clear();
    if (!_soloAlgunos || !_porLugares) _lugares.clear();
    if (!_soloAlgunos || !_porHorario) {
      _horaDesde = null;
      _horaHasta = null;
    }
    if (_tipo == TipoRango.indefinido &&
        _dias.isEmpty &&
        _lugares.isEmpty &&
        _horaDesde == null &&
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
      horaDesde: _horaDesde,
      horaHasta: _horaHasta,
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
        _Paso.criterio => '¿Cuáles?',
        _Paso.dias => '¿Qué días?',
        _Paso.lugares => '¿En qué lugares?',
        _Paso.horario => '¿En qué horario?',
      },
      ayuda: switch (_paso) {
        _Paso.estado => 'Se aplica sola a tus entrenamientos futuros, sin marcarlos uno por uno.',
        _Paso.motivo => MotivoAusencia.ayudaComun,
        _Paso.tipo => _restringe ? 'Con "Asistiré" solo puedes elegir los meses que tienes pagados.' : null,
        _Paso.fechas => null,
        _Paso.alcance => null,
        _Paso.criterio => 'Elige una o más opciones. Si combinas, aplica solo cuando se cumplen todas.',
        _Paso.dias => 'Solo aparecen los días en que hay entrenamientos.',
        _Paso.lugares => 'Solo aparecen los lugares donde hay entrenamientos.',
        _Paso.horario => 'Aplica a los entrenamientos que empiezan dentro de este horario.',
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
        _Paso.criterio => _pasoCriterio(context),
        _Paso.dias => _pasoDias(context),
        _Paso.lugares => _pasoLugares(context),
        _Paso.horario => _pasoHorario(context),
      },
      textoBoton: _paso == pasos.last ? (widget.editando == null ? 'Aplicar' : 'Guardar cambios') : (_siguienteVisible ? 'Siguiente' : null),
      alContinuar: !_pasoValido ? null : (_paso == pasos.last ? _aplicar : () => _ir(1)),
      ocupado: _ocupado,
    );
  }

  // Al editar, los pasos ya respondidos muestran "Siguiente" para no obligar a tocar de nuevo.
  bool get _siguienteVisible => switch (_paso) {
    _Paso.estado => _estado != null,
    _Paso.motivo => _motivo != null,
    _Paso.tipo => _tipo != null,
    _Paso.fechas => _fechasValidas,
    _Paso.alcance => _soloAlgunos,
    _Paso.criterio || _Paso.dias || _Paso.lugares || _Paso.horario => true,
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
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OpcionAsistente(
          icono: Icons.event_available_rounded,
          titulo: 'Todos los entrenamientos',
          texto: 'Sin importar el día, el lugar ni la hora.',
          activa: !_soloAlgunos,
          alTocar: () => setState(() => _soloAlgunos = false),
        ),
        OpcionAsistente(
          icono: Icons.filter_alt_outlined,
          titulo: 'Solo algunos',
          texto: 'Ciertos días, lugares u horarios.',
          activa: _soloAlgunos,
          alTocar: () => _elegirYSeguir(() => _soloAlgunos = true),
        ),
      ],
    );
  }

  Widget _pasoCriterio(BuildContext context) {
    final p = context.pivot;
    Widget opcion(IconData icono, String titulo, String texto, bool activa, VoidCallback cambiar) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: activa ? p.suave : p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: () => setState(cambiar),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Row(
              children: [
                Icon(icono, color: activa ? p.sobreSuave : p.marcaTexto),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titulo,
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: activa ? p.sobreSuave : p.texto),
                      ),
                      Text(texto, style: TextStyle(fontSize: 13.5, color: activa ? p.sobreSuave : p.textoSecundario)),
                    ],
                  ),
                ),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: Icon(
                    activa ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                    key: ValueKey(activa),
                    color: activa ? p.sobreSuave : p.textoSecundario,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        opcion(Icons.calendar_view_week_rounded, 'Por días', 'Ej. solo los lunes', _porDias, () => _porDias = !_porDias),
        opcion(Icons.place_outlined, 'Por lugares', 'Ej. solo en un lugar', _porLugares, () => _porLugares = !_porLugares),
        opcion(Icons.schedule_rounded, 'Por horario', 'Ej. si empieza entre 10:00 y 19:00', _porHorario, () => _porHorario = !_porHorario),
      ],
    );
  }

  Widget _vistaPrevia(BuildContext context) {
    final r = ReglaAnticipada(
      tipo: TipoRango.indefinido,
      estado: EstadoRsvp.asistire,
      diasSemana: _porDias ? _dias.toList() : const [],
      lugares: _porLugares ? _lugares.toList() : const [],
      horaDesde: _porHorario && _horarioValido ? _horaDesde : null,
      horaHasta: _porHorario && _horarioValido ? _horaHasta : null,
    );
    final txt = r.resumenFiltros;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      child: Text(
        txt.isEmpty ? '' : 'Aplica: ${txt[0].toLowerCase()}${txt.substring(1)}.',
        key: ValueKey(txt),
        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: context.pivot.marcaTexto),
      ),
    );
  }

  Widget _pasoDias(BuildContext context) {
    final dias = _diasConEventos;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (dias.isEmpty)
          Text('No hay entrenamientos próximos en el calendario.', style: TextStyle(color: context.pivot.textoSecundario))
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final d in dias)
                FilterChip(
                  label: Text(ReglaAnticipada.nombresDias[d - 1][0].toUpperCase() + ReglaAnticipada.nombresDias[d - 1].substring(1)),
                  selected: _dias.contains(d),
                  onSelected: (_) => setState(() => _dias.contains(d) ? _dias.remove(d) : _dias.add(d)),
                ),
            ],
          ),
        const SizedBox(height: 16),
        _vistaPrevia(context),
      ],
    );
  }

  Widget _pasoLugares(BuildContext context) {
    final lugares = _lugaresConEventos;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (lugares.isEmpty)
          Text('No hay entrenamientos próximos en el calendario.', style: TextStyle(color: context.pivot.textoSecundario))
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final l in lugares)
                FilterChip(
                  label: Text(l),
                  selected: _lugares.any((x) => x.toLowerCase() == l.toLowerCase()),
                  onSelected: (_) => setState(() {
                    final ya = _lugares.where((x) => x.toLowerCase() == l.toLowerCase()).toList();
                    ya.isEmpty ? _lugares.add(l) : _lugares.removeAll(ya);
                  }),
                ),
            ],
          ),
        const SizedBox(height: 16),
        _vistaPrevia(context),
      ],
    );
  }

  List<String> get _lugaresConEventosSinElegidos {
    final vistos = <String, String>{};
    for (final e in _delosDias) {
      if (e.lugar.trim().isNotEmpty) vistos.putIfAbsent(e.lugar.trim().toLowerCase(), () => e.lugar.trim());
    }
    return vistos.values.toList()..sort();
  }

  static String _ampm(String hhmm) => horaAmPm(hhmm);

  /// Selector de hora con AM/PM y botones (Victor, 2026-11-14: la rueda era difícil).
  Future<void> _elegirHora(bool desde) async {
    final p = context.pivot;
    final actual = desde ? _horaDesde : _horaHasta;
    final partes = (actual ?? (desde ? '10:00' : '19:00')).split(':');
    var h24 = int.parse(partes[0]), min = int.parse(partes[1]);
    min = (min ~/ 15) * 15;
    final elegida = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) {
          final pm = h24 >= 12, h12 = h24 % 12 == 0 ? 12 : h24 % 12;
          void hora(int x) => set(() => h24 = (x % 12) + (pm ? 12 : 0));
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(desde ? 'Desde' : 'Hasta', style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(
                    _ampm('${h24.toString().padLeft(2, '0')}:${min.toString().padLeft(2, '0')}'),
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: p.marcaTexto),
                  ),
                  const SizedBox(height: 12),
                  SegmentedButton<bool>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(value: false, label: Text('a. m.')),
                      ButtonSegment(value: true, label: Text('p. m.')),
                    ],
                    selected: {pm},
                    onSelectionChanged: (s) => set(() => h24 = (h24 % 12) + (s.first ? 12 : 0)),
                  ),
                  const SizedBox(height: 14),
                  const Text('Hora', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (var x = 1; x <= 12; x++)
                        ChoiceChip(
                          showCheckmark: false,
                          label: SizedBox(width: 22, child: Text('$x', textAlign: TextAlign.center)),
                          selected: h12 == x,
                          onSelected: (_) => hora(x),
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Text('Minutos', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final x in const [0, 15, 30, 45])
                        ChoiceChip(
                          showCheckmark: false,
                          label: Text(':${x.toString().padLeft(2, '0')}'),
                          selected: min == x,
                          onSelected: (_) => set(() => min = x),
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () => Navigator.of(h).pop('${h24.toString().padLeft(2, '0')}:${min.toString().padLeft(2, '0')}'),
                    child: const Text('Listo'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (elegida == null || !mounted) return;
    setState(() => desde ? _horaDesde = elegida : _horaHasta = elegida);
  }

  Widget _pasoHorario(BuildContext context) {
    final p = context.pivot;
    // Entrenamientos de los días y lugares elegidos, como guía (Victor,
    // 2026-11-14: decir cuál afecta o que hoy no afecta ninguno).
    final relevantes = _relevantes;
    final guia = <String, String>{};
    for (final e in relevantes) {
      final dia = ReglaAnticipada.nombresDias[e.fecha.weekday - 1];
      guia.putIfAbsent(
        '${e.fecha.weekday}|${e.horaInicio}|${e.lugar.trim().toLowerCase()}',
        () => '${e.lugar.trim()} los ${dia}s a las ${_ampm(e.horaInicio)}',
      );
    }
    final afectados = <String>{
      if (_horarioValido)
        for (final e in relevantes)
          if (e.horaInicio.compareTo(_horaDesde!) >= 0 && e.horaInicio.compareTo(_horaHasta!) <= 0)
            '${e.lugar.trim()} los ${ReglaAnticipada.nombresDias[e.fecha.weekday - 1]}s a las ${_ampm(e.horaInicio)}',
    };
    Widget boton(String titulo, String? valor, bool desde) => Expanded(
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
        onPressed: () => _elegirHora(desde),
        child: Column(
          children: [
            Text(titulo, style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
            Text(
              valor == null ? 'Elegir' : _ampm(valor),
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: p.texto),
            ),
          ],
        ),
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(children: [boton('Desde', _horaDesde, true), const SizedBox(width: 12), boton('Hasta', _horaHasta, false)]),
        if (_horaDesde != null && _horaHasta != null && !_horarioValido) ...[
          const SizedBox(height: 10),
          Text('La hora de inicio tiene que ser antes que la de fin.', style: TextStyle(color: p.marcaTexto)),
        ],
        const SizedBox(height: 16),
        AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          child: SizedBox(
            width: double.infinity,
            child: !_horarioValido
                ? Text(
                    guia.isEmpty ? 'No hay entrenamientos próximos con lo que elegiste.' : 'Entrenamientos próximos: ${guia.values.join('; ')}.',
                    style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
                  )
                : afectados.isNotEmpty
                ? Text('Afecta a: ${afectados.join('; ')}.', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))
                : Text(
                    'Hoy no afecta ningún entrenamiento, pero se guarda igual por si se crea un evento en ese horario.',
                    style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
                  ),
          ),
        ),
        const SizedBox(height: 12),
        _vistaPrevia(context),
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
