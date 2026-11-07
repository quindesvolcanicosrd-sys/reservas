import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'anticipada_screen.dart';
import 'calendario_panel.dart';
import 'crear_evento_screen.dart';
import 'detalle_screen.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'tomar_asistencia_screen.dart';
import 'widgets_comunes.dart';

/// Timeline de Eventos (maqueta aprobada + pedido 2026-11-06):
/// - Barra: "Noviembre ⌄" despliega el calendario del mes hacia abajo (como
///   Google Calendar; tocar un día lleva a ese punto del timeline), buscador
///   con filtros, "Hoy" y asistencia anticipada.
/// - Botón "+" (admins): nuevo evento.
/// - Fecha a la izquierda, línea con un punto por evento, marca de "ahora",
///   separadores por semana.
/// Aviso de "ir a hoy" que llega desde la barra inferior (volver a tocar
/// Eventos estando en Eventos, como el ícono con la fecha de Google Calendar).
class SenalHoy extends ChangeNotifier {
  void disparar() => notifyListeners();
}

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key, required this.repo, this.irAHoy});
  final EventosRepo repo;
  final SenalHoy? irAHoy;

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _Item {
  _Item.evento(this.evento) : cumple = null, temporada = null;
  _Item.cumple(this.cumple) : evento = null, temporada = null;
  _Item.temporada(this.temporada) : evento = null, cumple = null;
  final Temporada? temporada;
  final Evento? evento;
  final Cumple? cumple;
  DateTime get fecha => evento?.fecha ?? cumple?.fecha ?? temporada!.desde;
}

/// Una fila del timeline: fecha (solo en la primera del día), punto y contenido.
class _Fila {
  _Fila({required this.dia, this.mostrarFecha = false, this.item, this.ahora = false, this.semana, this.vacioHoy = false});
  final DateTime dia;
  final bool mostrarFecha;
  final _Item? item;
  final bool ahora;
  final DateTime? semana; // separador de semana (lunes)
  final bool vacioHoy;
}

class _TimelineScreenState extends State<TimelineScreen> with TickerProviderStateMixin {
  final _scroll = ItemScrollController();
  final _posiciones = ItemPositionsListener.create();
  final _textoBusqueda = TextEditingController();
  final _focoBusqueda = FocusNode();

  bool _buscando = false;
  String _consulta = '';
  String? _filtroLugar;
  String? _filtroTipo;
  DateTime _mesVisible = Fechas.hoy();
  // Título de la barra ("Noviembre"): se actualiza solo, sin reconstruir la
  // pantalla (antes cada cambio de mes al scrollear o deslizar redibujaba
  // todo el timeline y daba tirones).
  final _tituloMes = ValueNotifier<DateTime>(Fechas.hoy());
  bool _calAbierto = false;
  bool _calMontado = false;
  DateTime _mesPanel = Fechas.hoy();
  final _panel = GlobalKey<PanelCalendarioState>();
  late final AnimationController _calCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 320));
  DateTime? _diaSel;
  static const _altoPanelEstimado = 400.0;

  // Ancla del timeline: al llegar datos nuevos (por ejemplo, un mes anterior
  // pedido desde el calendario) se agregan filas ARRIBA y la lista saltaría.
  // Se guarda qué fila estaba arriba y se vuelve a ella sin animación.
  Object? _firmaDatos;
  bool _desplazandoProgramado = false;
  Timer? _reloj;
  List<_Fila> _filas = const [];
  int? _claveFilas;
  bool _saltoInicialHecho = false;

  static const _anchoFecha = 52.0;
  static const _anchoRiel = 28.0;

  EventosRepo get repo => widget.repo;

  @override
  void initState() {
    super.initState();
    repo.cargar();
    _posiciones.itemPositions.addListener(_alDesplazar);
    widget.irAHoy?.addListener(_irAHoy);
    _cargarFiltros();
    // Cada minuto: mueve la línea de "ahora" y el resaltado de "En curso".
    _reloj = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  // ─── Búsqueda y filtros guardados (pedido 2026-11-06: siempre) ─────────

  static const _kTexto = 'eventos.busqueda', _kLugar = 'eventos.filtroLugar', _kTipo = 'eventos.filtroTipo';

  Future<void> _cargarFiltros() async {
    try {
      final pr = await SharedPreferences.getInstance();
      if (!mounted) return;
      setState(() {
        _consulta = pr.getString(_kTexto) ?? '';
        _textoBusqueda.text = _consulta;
        _filtroLugar = pr.getString(_kLugar);
        _filtroTipo = pr.getString(_kTipo);
      });
    } catch (_) {}
  }

  Future<void> _guardarFiltros() async {
    try {
      final pr = await SharedPreferences.getInstance();
      _consulta.trim().isEmpty ? await pr.remove(_kTexto) : await pr.setString(_kTexto, _consulta);
      _filtroLugar == null ? await pr.remove(_kLugar) : await pr.setString(_kLugar, _filtroLugar!);
      _filtroTipo == null ? await pr.remove(_kTipo) : await pr.setString(_kTipo, _filtroTipo!);
    } catch (_) {}
  }

  void _cambiarFiltros(VoidCallback cambio) {
    setState(cambio);
    _guardarFiltros();
  }

  void _irAHoy() {
    final hoy = Fechas.hoy();
    if (_calMontado) {
      setState(() => _diaSel = hoy);
      _panel.currentState?.irAMes(hoy);
    }
    _irA(hoy);
  }

  @override
  void dispose() {
    _posiciones.itemPositions.removeListener(_alDesplazar);
    widget.irAHoy?.removeListener(_irAHoy);
    _reloj?.cancel();
    _calCtrl.dispose();
    _tituloMes.dispose();
    _textoBusqueda.dispose();
    _focoBusqueda.dispose();
    super.dispose();
  }

  // Solo un scroll hecho con el dedo mueve el mes del calendario (bug real:
  // al tocar "jul", el timeline llegaba al final de lo cargado, quedaba
  // mostrando junio y el panel "volvía" a junio un segundo después).
  bool _scrollDelUsuario = false;

  void _alDesplazar() {
    final pos = _posiciones.itemPositions.value.where((p) => p.itemTrailingEdge > 0).toList();
    if (pos.isEmpty || _filas.isEmpty) return;
    pos.sort((a, b) => a.index.compareTo(b.index));
    final i = pos.first.index.clamp(0, _filas.length - 1);
    final d = _filas[i].dia;
    if (d.month != _mesVisible.month || d.year != _mesVisible.year) {
      _mesVisible = d;
      if (!_calAbierto) _tituloMes.value = d;
      // Con el calendario abierto, el mes del panel acompaña al timeline.
      if (_calAbierto && _scrollDelUsuario && !_desplazandoProgramado && !_colapsandoPorScroll) _panel.currentState?.irAMes(d);
    }
  }

  // ─── Filtros ────────────────────────────────────────────────────────────

  bool _coincideTexto(_Item it) {
    final q = _consulta.trim().toLowerCase();
    if (q.isEmpty) return true;
    final ev = it.evento;
    final texto = ev != null
        ? '${ev.tipo} ${ev.lugar} ${ev.descripcion} ${textoEstadoEvento(ev)} ${Fechas.encabezado(ev.fecha)} ${Fechas.mes(ev.fecha)}'
        : it.cumple != null
        ? 'cumpleaños ${it.cumple!.nombre} ${Fechas.mes(it.cumple!.fecha)}'
        : 'descanso temporada ${it.temporada!.nombre} ${Fechas.mes(it.temporada!.desde)} ${Fechas.mes(it.temporada!.hasta)}';
    return q.split(RegExp(r'\s+')).every((palabra) => texto.toLowerCase().contains(palabra));
  }

  bool _pasaFiltros(_Item it) {
    if (!_coincideTexto(it)) return false;
    final ev = it.evento;
    if (_filtroLugar != null && ev?.lugar != _filtroLugar) return false;
    if (_filtroTipo != null) {
      if (_filtroTipo == 'Cumpleaños') return it.cumple != null;
      if (_filtroTipo == 'Descanso') return it.temporada != null;
      if (ev?.tipo != _filtroTipo) return false;
    }
    return true;
  }

  bool get _hayFiltros => _consulta.trim().isNotEmpty || _filtroLugar != null || _filtroTipo != null;

  List<_Item> _todos() => [
    for (final e in repo.eventos) _Item.evento(e),
    for (final c in repo.cumples) _Item.cumple(c),
    for (final t in repo.temporadas) _Item.temporada(t),
  ];

  /// Opciones de los filtros: solo las que existen en lo que ya coincide con
  /// el texto buscado (y con el otro filtro), igual que la web.
  List<String> _opcionesLugar() {
    final s = <String>{};
    for (final it in _todos()) {
      final ev = it.evento;
      if (ev == null || !_coincideTexto(it)) continue;
      if (_filtroTipo != null && _filtroTipo != ev.tipo) continue;
      if (ev.lugar.isNotEmpty) s.add(ev.lugar);
    }
    return s.toList()..sort();
  }

  List<String> _opcionesTipo() {
    final s = <String>{};
    var hayCumples = false, hayDescanso = false;
    for (final it in _todos()) {
      if (!_coincideTexto(it)) continue;
      final ev = it.evento;
      if (ev == null) {
        if (it.cumple != null) hayCumples = true;
        if (it.temporada != null) hayDescanso = true;
        continue;
      }
      if (_filtroLugar != null && _filtroLugar != ev.lugar) continue;
      s.add(ev.tipo);
    }
    return [...(s.toList()..sort()), if (hayCumples && _filtroLugar == null) 'Cumpleaños', if (hayDescanso && _filtroLugar == null) 'Descanso'];
  }

  // ─── Filas ──────────────────────────────────────────────────────────────

  List<_Fila> _armarFilas() {
    final hoy = Fechas.hoy();
    final porDia = <DateTime, List<_Item>>{};
    for (final it in _todos()) {
      if (!_pasaFiltros(it)) continue;
      porDia.putIfAbsent(Fechas.soloDia(it.fecha), () => []).add(it);
    }
    if (!_hayFiltros) porDia.putIfAbsent(hoy, () => []);
    final dias = porDia.keys.toList()..sort();
    final filas = <_Fila>[];
    DateTime? lunesPrevio;
    final ahora = Fechas.hora(Fechas.ahoraEcuador());
    for (final dia in dias) {
      final lunes = Fechas.lunesDe(dia);
      if (lunesPrevio != null && lunes != lunesPrevio) filas.add(_Fila(dia: dia, semana: lunes));
      lunesPrevio = lunes;
      final items = porDia[dia]!..sort((a, b) => (a.evento?.horaInicio ?? '00:00').compareTo(b.evento?.horaInicio ?? '00:00'));
      final esHoy = dia == hoy && !_hayFiltros;
      var primera = true;
      var ahoraPuesto = !esHoy;
      for (final it in items) {
        if (!ahoraPuesto && (it.evento?.horaInicio ?? '00:00').compareTo(ahora) > 0) {
          filas.add(_Fila(dia: dia, mostrarFecha: primera, ahora: true));
          primera = false;
          ahoraPuesto = true;
        }
        filas.add(_Fila(dia: dia, mostrarFecha: primera, item: it));
        primera = false;
      }
      if (!ahoraPuesto) {
        final sinMas = items.every((i) => i.evento == null || i.evento!.yaEmpezo);
        filas.add(_Fila(dia: dia, mostrarFecha: primera, ahora: true, vacioHoy: sinMas));
      }
    }
    return filas;
  }

  int _indiceDeDia(DateTime dia) {
    final d = Fechas.soloDia(dia);
    for (var i = 0; i < _filas.length; i++) {
      if (_filas[i].semana == null && !_filas[i].dia.isBefore(d)) return i;
    }
    return _filas.isEmpty ? 0 : _filas.length - 1;
  }

  void _irA(DateTime dia, {bool animado = true}) {
    if (!_scroll.isAttached || _filas.isEmpty) return;
    final i = _indiceDeDia(dia);
    if (animado) {
      _desplazandoProgramado = true;
      _scroll
          .scrollTo(index: i, duration: const Duration(milliseconds: 500), curve: Curves.easeInOutCubic, alignment: 0.02)
          .whenComplete(() => _desplazandoProgramado = false);
    } else {
      _scroll.jumpTo(index: i, alignment: 0.02);
    }
  }

  void _alternarCalendario() => _calAbierto ? _cerrarCalendario() : _abrirCalendario();

  // `_calAbierto` NO se cambia con setState: nada del build depende de él
  // (la flecha y el título siguen al controlador / al ValueNotifier), así el
  // arrastre nunca reconstruye la pantalla a mitad de camino.
  void _abrirCalendario() {
    _calAbierto = true;
    _mesPanel = _mesVisible;
    _tituloMes.value = _mesPanel;
    if (!_calMontado) setState(() => _calMontado = true);
    _remedirPanel();
    _calCtrl.animateTo(1, curve: Curves.easeOutCubic);
  }

  void _cerrarCalendario() {
    if (!_calMontado) return;
    _calAbierto = false;
    _tituloMes.value = _mesVisible;
    _calCtrl.animateBack(0, curve: Curves.easeOutCubic).whenComplete(() {
      if (mounted && !_calAbierto) setState(() => _calMontado = false);
    });
  }

  Widget _panelCalendario(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.pivot.fondo,
        border: Border(bottom: BorderSide(color: context.pivot.tarjetaBorde)),
      ),
      child: PanelCalendario(
        key: _panel,
        repo: repo,
        mesInicial: _mesPanel,
        alCambiarMes: (m) {
          _mesPanel = m;
          if (_calAbierto) _tituloMes.value = m;
        },
        alElegirDia: _elegirDia,
        alMesElegido: _mesElegido,
        alArrastrar: _arrastrar,
        alSoltar: _soltar,
        diaSeleccionado: _diaSel,
      ),
    );
  }

  /// Alto real del panel: se mide después de dibujarlo (no se puede leer en
  /// medio de un build); hasta entonces se usa uno estimado.
  double? _altoMedido;
  void _remedirPanel() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final h = _panel.currentContext?.size?.height;
      if (mounted && h != null && h > 100) _altoMedido = h;
    });
  }

  double get _altoPanel => _altoMedido ?? _altoPanelEstimado;

  /// Arrastre vertical (sobre el panel o sobre el nombre del mes): el
  /// calendario sigue al dedo, como en Google Calendar.
  void _arrastrar(double dy) {
    if (_buscando) return;
    if (!_calMontado) {
      if (dy <= 0) return;
      _mesPanel = _mesVisible;
      setState(() => _calMontado = true);
      _remedirPanel();
    }
    _calCtrl.value = (_calCtrl.value + dy / _altoPanel).clamp(0.0, 1.0);
  }

  void _soltar(double velocidad) {
    if (!_calMontado) return;
    final abrir = velocidad.abs() > 300 ? velocidad > 0 : _calCtrl.value > 0.5;
    if (abrir) {
      _abrirCalendario();
    } else {
      _cerrarCalendario();
    }
  }

  /// Tocar un día: el panel queda abierto y el timeline va a esa fecha.
  Future<void> _elegirDia(DateTime dia) async {
    setState(() => _diaSel = dia);
    await repo.asegurarMes(dia);
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _irA(dia));
  }

  /// Deslizar a otro mes en el panel lleva el timeline a ese mes (a hoy si
  /// es el mes actual, si no al día 1).
  Future<void> _mesElegido(DateTime mes) async {
    final hoy = Fechas.hoy();
    final destino = (mes.year == hoy.year && mes.month == hoy.month) ? hoy : DateTime(mes.year, mes.month, 1);
    await repo.asegurarMes(destino);
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _irA(destino));
  }

  /// Identidad estable de una fila entre cargas.
  String _claveFila(_Fila f) =>
      '${Fechas.iso(f.dia)}|${f.semana != null ? 's' : ''}|${f.ahora ? 'a' : ''}|${f.item?.evento?.id ?? f.item?.cumple?.nombre ?? f.item?.temporada?.id ?? ''}';

  void _mantenerAncla(List<_Fila> antes, List<_Fila> despues) {
    if (_desplazandoProgramado || !_scroll.isAttached || antes.isEmpty) return;
    final vis = _posiciones.itemPositions.value.where((p) => p.itemTrailingEdge > 0).toList()..sort((a, b) => a.index.compareTo(b.index));
    if (vis.isEmpty || vis.first.index >= antes.length) return;
    final clave = _claveFila(antes[vis.first.index]);
    final nuevo = despues.indexWhere((f) => _claveFila(f) == clave);
    if (nuevo < 0 || nuevo == vis.first.index) return;
    final borde = vis.first.itemLeadingEdge;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.isAttached) _scroll.jumpTo(index: nuevo, alignment: borde);
    });
  }

  void _limpiarFiltros() {
    _consulta = '';
    _textoBusqueda.clear();
    _filtroLugar = null;
    _filtroTipo = null;
  }

  // ─── Construcción ───────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final antes = _filas;
        // Las filas solo se recalculan si cambió algo que las afecta.
        final ahora = Fechas.ahoraEcuador();
        final claveFilas = Object.hash(
          identityHashCode(repo.eventos),
          identityHashCode(repo.cumples),
          repo.eventos.length,
          _consulta,
          _filtroLugar,
          _filtroTipo,
          ahora.day,
          ahora.hour,
          ahora.minute,
        );
        if (claveFilas != _claveFilas) {
          _filas = _armarFilas();
          _claveFilas = claveFilas;
        }
        final firma = Object.hash(identityHashCode(repo.eventos), identityHashCode(repo.cumples));
        if (_firmaDatos != null && firma != _firmaDatos && _saltoInicialHecho) _mantenerAncla(antes, _filas);
        _firmaDatos = firma;
        if (!_saltoInicialHecho && repo.eventos.isNotEmpty) {
          _saltoInicialHecho = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => _irA(Fechas.hoy(), animado: false));
        }
        final panel = _calMontado ? RepaintBoundary(child: _panelCalendario(context)) : null;
        return Scaffold(
          floatingActionButton: _acciones.isEmpty || _buscando
              ? null
              : FloatingActionButton(tooltip: 'Crear', onPressed: _abrirAcciones, child: const Icon(Icons.add_rounded)),
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  transitionBuilder: (c, a) => FadeTransition(
                    opacity: a,
                    child: SizeTransition(sizeFactor: a, alignment: Alignment.topCenter, child: c),
                  ),
                  child: _buscando ? _barraBusqueda(context) : _barraNormal(context),
                ),
                // Calendario sobre el timeline. Para que abrir/cerrar (también
                // con el dedo) sea fluido, nada cambia de tamaño mientras se
                // mueve: el panel baja desde la barra y el timeline se corre
                // hacia abajo con transformaciones (solo se repinta, no se
                // vuelve a medir cada fila en cada cuadro).
                Expanded(
                  child: ClipRect(
                    child: AnimatedBuilder(
                      // El panel se arma una sola vez por build: en cada cuadro
                      // solo cambian las transformaciones (instancia idéntica =
                      // Flutter no lo reconstruye).
                      animation: _calCtrl,
                      builder: (context, hijo) {
                        final alto = _altoPanel;
                        final v = _calCtrl.value;
                        return Stack(
                          children: [
                            Positioned.fill(
                              child: Transform.translate(offset: Offset(0, alto * v), child: hijo),
                            ),
                            if (panel != null)
                              Positioned(
                                left: 0,
                                right: 0,
                                top: 0,
                                child: Transform.translate(
                                  offset: Offset(0, -alto * (1 - v)),
                                  child: Opacity(opacity: (v / 0.5).clamp(0.0, 1.0), child: panel),
                                ),
                              ),
                          ],
                        );
                      },
                      child: RepaintBoundary(child: _cuerpo(context)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _barraNormal(BuildContext context) {
    final p = context.pivot;
    final t = Theme.of(context).textTheme;

    return Padding(
      key: const ValueKey('normal'),
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 4),
      child: Row(
        children: [
          GestureDetector(
            onVerticalDragUpdate: (d) => _arrastrar(d.delta.dy),
            onVerticalDragEnd: (d) => _soltar(d.primaryVelocity ?? 0),
            child: TextButton(
              style: TextButton.styleFrom(foregroundColor: p.texto, padding: const EdgeInsets.symmetric(horizontal: 12)),
              onPressed: _alternarCalendario,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ValueListenableBuilder<DateTime>(
                    valueListenable: _tituloMes,
                    builder: (context, mesTitulo, _) => AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      transitionBuilder: (c, a) => FadeTransition(
                        opacity: a,
                        child: SlideTransition(
                          position: Tween(begin: const Offset(0, 0.25), end: Offset.zero).animate(a),
                          child: c,
                        ),
                      ),
                      layoutBuilder: (actual, previos) => Stack(alignment: Alignment.centerLeft, children: [...previos, ?actual]),
                      child: Text(
                        mesTitulo.year == Fechas.hoy().year ? Fechas.mesNombre(mesTitulo) : Fechas.mesAnio(mesTitulo),
                        key: ValueKey('${mesTitulo.year}-${mesTitulo.month}'),
                        style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  // La flecha gira siguiendo al calendario (también con el dedo).
                  RotationTransition(turns: Tween(begin: 0.0, end: 0.5).animate(_calCtrl), child: const Icon(Icons.keyboard_arrow_down_rounded)),
                ],
              ),
            ),
          ),
          const Spacer(),
          IconButton(
            tooltip: _hayFiltros ? 'Buscar (hay filtros activos)' : 'Buscar',
            // Punto rojo: quedó una búsqueda o un filtro activo.
            icon: Badge(isLabelVisible: _hayFiltros, smallSize: 9, backgroundColor: p.marca, child: const Icon(Icons.search_rounded)),
            onPressed: () {
              _cerrarCalendario();
              setState(() => _buscando = true);
              WidgetsBinding.instance.addPostFrameCallback((_) => _focoBusqueda.requestFocus());
            },
          ),
          const SizedBox(width: 4),
        ],
      ),
    );
  }

  int get _cantidadFiltros => (_filtroLugar != null ? 1 : 0) + (_filtroTipo != null ? 1 : 0);

  void _cerrarBusqueda() {
    FocusScope.of(context).unfocus();
    setState(() => _buscando = false);
    WidgetsBinding.instance.addPostFrameCallback((_) => _irA(Fechas.hoy(), animado: false));
  }

  /// ← cierra (la búsqueda y los filtros quedan guardados), el campo al
  /// centro con × para borrar el texto, y el botón de filtros a la derecha.
  Widget _barraBusqueda(BuildContext context) {
    final p = context.pivot;
    return Padding(
      key: const ValueKey('busqueda'),
      padding: const EdgeInsets.fromLTRB(4, 8, 8, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(tooltip: 'Cerrar búsqueda', icon: const Icon(Icons.arrow_back_rounded), onPressed: _cerrarBusqueda),
              Expanded(
                child: TextField(
                  controller: _textoBusqueda,
                  focusNode: _focoBusqueda,
                  textInputAction: TextInputAction.search,
                  onChanged: (v) => _cambiarFiltros(() => _consulta = v),
                  decoration: InputDecoration(
                    hintText: 'Busca por lugar, tipo, mes o persona',
                    isDense: true,
                    suffixIcon: _consulta.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Borrar texto',
                            icon: const Icon(Icons.close_rounded),
                            onPressed: () => _cambiarFiltros(() {
                              _consulta = '';
                              _textoBusqueda.clear();
                            }),
                          ),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              IconButton(
                tooltip: 'Filtros',
                onPressed: _abrirFiltros,
                icon: Badge(
                  isLabelVisible: _cantidadFiltros > 0,
                  backgroundColor: p.marca,
                  label: Text('$_cantidadFiltros'),
                  child: const Icon(Icons.tune_rounded),
                ),
              ),
            ],
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _cantidadFiltros == 0
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 0, 0),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        if (_filtroLugar != null)
                          InputChip(
                            avatar: const Icon(Icons.place_outlined, size: 18),
                            label: Text(_filtroLugar!),
                            onDeleted: () => _cambiarFiltros(() => _filtroLugar = null),
                          ),
                        if (_filtroTipo != null)
                          InputChip(
                            avatar: const Icon(Icons.category_outlined, size: 18),
                            label: Text(_filtroTipo!),
                            onDeleted: () => _cambiarFiltros(() => _filtroTipo = null),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  /// Hoja de filtros: opciones que existen en lo que ya coincide con el
  /// texto buscado (y con el otro filtro), igual que la web. Se aplican al
  /// instante.
  Future<void> _abrirFiltros() async {
    FocusScope.of(context).unfocus();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (hoja) => StatefulBuilder(
        builder: (hoja, refrescar) {
          final p = hoja.pivot;
          void elegir(VoidCallback cambio) {
            _cambiarFiltros(cambio);
            refrescar(() {});
          }

          Widget grupo(String titulo, IconData icono, String? valor, List<String> opciones, void Function(String?) alElegir) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(icono, size: 20, color: p.textoSecundario),
                    const SizedBox(width: 8),
                    Text(
                      titulo,
                      style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ChoiceChip(label: const Text('Todos'), selected: valor == null, onSelected: (_) => elegir(() => alElegir(null))),
                    for (final o in opciones)
                      ChoiceChip(label: Text(o), selected: valor == o, onSelected: (_) => elegir(() => alElegir(valor == o ? null : o))),
                  ],
                ),
              ],
            );
          }

          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Filtros', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 16),
                  grupo('Lugar', Icons.place_outlined, _filtroLugar, _opcionesLugar(), (v) => _filtroLugar = v),
                  const SizedBox(height: 20),
                  grupo('Tipo', Icons.category_outlined, _filtroTipo, _opcionesTipo(), (v) => _filtroTipo = v),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      TextButton(
                        onPressed: _cantidadFiltros == 0
                            ? null
                            : () => elegir(() {
                                _filtroLugar = null;
                                _filtroTipo = null;
                              }),
                        child: const Text('Limpiar filtros'),
                      ),
                      const Spacer(),
                      FilledButton(onPressed: () => Navigator.of(hoja).pop(), child: const Text('Listo')),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _cuerpo(BuildContext context) {
    final p = context.pivot;
    if (repo.cargando && repo.eventos.isEmpty) return const Center(child: CircularProgressIndicator());
    if (repo.error != null && repo.eventos.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(repo.error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: () => repo.cargar(forzar: true), child: const Text('Reintentar')),
            ],
          ),
        ),
      );
    }
    if (_filas.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'No hay eventos que coincidan con la búsqueda.',
                textAlign: TextAlign.center,
                style: TextStyle(color: p.textoSecundario),
              ),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: () => _cambiarFiltros(_limpiarFiltros), child: const Text('Quitar búsqueda y filtros')),
            ],
          ),
        ),
      );
    }
    return NotificationListener<ScrollNotification>(
      onNotification: _alScrollearTimeline,
      child: RefreshIndicator(
        onRefresh: () => repo.cargar(forzar: true),
        child: ScrollablePositionedList.builder(
          itemScrollController: _scroll,
          itemPositionsListener: _posiciones,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(8, 4, 16, 96 + (_calMontado ? _altoPanel : 0)),
          itemCount: _filas.length,
          itemBuilder: (context, i) => _fila(context, _filas[i]),
        ),
      ),
    );
  }

  /// Con el calendario abierto, scrollear el timeline lo va cerrando junto
  /// con el dedo; al soltar termina de cerrarse o vuelve a abrirse.
  bool _colapsandoPorScroll = false;
  bool _alScrollearTimeline(ScrollNotification n) {
    if (n is ScrollStartNotification) _scrollDelUsuario = n.dragDetails != null;
    if (n is ScrollEndNotification) _scrollDelUsuario = false;
    if (!_calMontado) return false;
    if (n is ScrollUpdateNotification && n.dragDetails != null && (n.scrollDelta ?? 0) != 0) {
      _colapsandoPorScroll = true;
      _calCtrl.value = (_calCtrl.value - n.scrollDelta!.abs() / (_altoPanel * 0.7)).clamp(0.0, 1.0);
      if (_calCtrl.value == 0) {
        _colapsandoPorScroll = false;
        _cerrarCalendario();
      }
    } else if (n is ScrollEndNotification && _colapsandoPorScroll) {
      _colapsandoPorScroll = false;
      _soltar(0);
    }
    return false;
  }

  Widget _fila(BuildContext context, _Fila f) {
    final p = context.pivot;
    final esHoy = f.dia == Fechas.hoy();
    final Widget contenido;
    Widget? punto;
    if (f.semana != null) {
      contenido = Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(
          Fechas.rangoSemana(f.semana!),
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: p.textoSecundario),
        ),
      );
    } else if (f.ahora) {
      contenido = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _lineaAhora(p),
          if (f.vacioHoy)
            Padding(
              padding: const EdgeInsets.only(top: 10, bottom: 8),
              child: Text('Sin más eventos hoy', style: TextStyle(fontSize: 14, color: p.textoSecundario)),
            ),
        ],
      );
    } else {
      punto = _punto(p, f.item!);
      contenido = f.item!.temporada != null
          ? _TarjetaDescanso(temporada: f.item!.temporada!, repo: repo)
          : f.item!.cumple != null
          ? _TarjetaCumple(cumple: f.item!.cumple!)
          : _TarjetaEvento(evento: f.item!.evento!, repo: repo, alAbrir: () => _abrirDetalle(f.item!.evento!));
    }
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(width: _anchoFecha, child: f.mostrarFecha ? _columnaFecha(p, f.dia, esHoy) : null),
          SizedBox(
            width: _anchoRiel,
            child: Stack(
              children: [
                Positioned(left: 13, top: 0, bottom: 0, child: Container(width: 2, color: p.lineaTimeline)),
                if (punto != null) Positioned(left: 7, top: 18, child: punto),
              ],
            ),
          ),
          Expanded(
            child: Padding(padding: const EdgeInsets.only(top: 4, bottom: 14), child: contenido),
          ),
        ],
      ),
    );
  }

  bool get _esAdmin => repo.sesion.esAdmin && repo.sesion.adminToken != null;

  // ─── Botón "+": menú de acciones (pedido 2026-11-06, como la web) ───────

  List<_Accion> get _acciones => [
    if (_esAdmin) _Accion(Icons.edit_calendar_outlined, 'Nuevo evento', _nuevoEvento),
    if (repo.anticipada.disponible)
      _Accion(
        Symbols.event_upcoming_rounded,
        'Asistencia anticipada',
        () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AnticipadaScreen(repo: repo, abrirNueva: true))),
      ),
  ];

  /// Con una sola acción, el "+" la abre directo; con más, despliega el menú
  /// con un velo sobre la pantalla (el botón gira a ×).
  Future<void> _abrirAcciones() async {
    final acciones = _acciones;
    _cerrarCalendario();
    if (acciones.length == 1) {
      acciones.first.alTocar();
      return;
    }
    final elegida = await showGeneralDialog<_Accion>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Cerrar',
      barrierColor: context.pivot.velo,
      transitionDuration: const Duration(milliseconds: 260),
      pageBuilder: (c, _, _) => _MenuAcciones(acciones: acciones),
      transitionBuilder: (c, a, _, hijo) => FadeTransition(
        opacity: CurvedAnimation(parent: a, curve: Curves.easeOut),
        child: hijo,
      ),
    );
    elegida?.alTocar();
  }

  Future<void> _nuevoEvento() async {
    _cerrarCalendario();
    final r = await Navigator.of(context).push<Object>(MaterialPageRoute(builder: (_) => CrearEventoScreen(repo: repo)));
    if (r == null || !mounted) return;
    if (r is Map) {
      // Temporada de descanso: la pantalla ya avisó; se lleva al inicio del período.
      final d = r['descanso'];
      if (d is DateTime) WidgetsBinding.instance.addPostFrameCallback((_) => _irA(d));
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Evento creado. Se avisó al equipo.')));
    if (r is DateTime) {
      _cambiarFiltros(_limpiarFiltros);
      WidgetsBinding.instance.addPostFrameCallback((_) => _irA(r));
    }
  }

  void _abrirDetalle(Evento ev) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DetalleScreen(repo: repo, eventoId: ev.id),
      ),
    );
  }

  Widget _columnaFecha(PivotPaleta p, DateTime dia, bool esHoy) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        children: [
          Text(
            Fechas.diaCorto(dia),
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: esHoy ? p.marcaTexto : p.textoSecundario),
          ),
          const SizedBox(height: 2),
          esHoy
              ? Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(color: p.marca, shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: Text(
                    '${dia.day}',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.sobreMarca),
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '${dia.day}',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: p.texto),
                  ),
                ),
        ],
      ),
    );
  }

  Widget _lineaAhora(PivotPaleta p) {
    return Transform.translate(
      offset: const Offset(-22, 0),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(color: p.marca, shape: BoxShape.circle),
          ),
          Expanded(child: Container(height: 2, color: p.marca)),
          Padding(
            padding: const EdgeInsets.only(left: 6),
            child: Text(
              Fechas.hora(Fechas.ahoraEcuador()),
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: p.marcaTexto),
            ),
          ),
        ],
      ),
    );
  }

  Widget _punto(PivotPaleta p, _Item it) {
    BoxDecoration deco(Color relleno, Color borde, double ancho) => BoxDecoration(
      color: relleno,
      shape: BoxShape.circle,
      border: Border.all(color: borde, width: ancho),
    );
    final ev = it.evento;
    final Decoration d;
    if (ev == null) {
      d = deco(p.fondo, p.lineaTimeline, 2.5);
    } else if (ev.cancelado || ev.miEstado == EstadoRsvp.noAsistire) {
      d = deco(p.apagadoPunto, p.fondo, 2);
    } else if (ev.miEstado != null) {
      d = deco(p.marca, p.fondo, 2);
    } else {
      d = deco(p.fondo, p.marca, 2.5);
    }
    return Container(width: 14, height: 14, decoration: d);
  }
}

class _TarjetaEvento extends StatelessWidget {
  const _TarjetaEvento({required this.evento, required this.repo, required this.alAbrir});
  final Evento evento;
  final EventosRepo repo;
  final VoidCallback alAbrir;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final ev = evento;
    final apagado = ev.cancelado;
    final pedirRespuesta = !apagado && ev.miEstado == null && !ev.yaEmpezo;
    // Después de empezar se muestran quienes asistieron de verdad (si ya se tomó asistencia).
    final reales = ev.yaEmpezo && ev.asistentes.isNotEmpty;
    final asisten = reales ? ev.asistentes.map((a) => a.persona).toList() : ev.con(EstadoRsvp.asistire).map((r) => r.persona).toList();
    final esAdmin = repo.sesion.esAdmin && repo.sesion.adminToken != null;
    final tomarAsistencia = esAdmin && ev.sePuedeTomarAsistencia;
    final tarjeta = Material(
      color: apagado ? p.apagadoFondo : p.tarjeta,
      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        onTap: alAbrir,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if (ev.enCurso) ...[const _PuntoEnVivo(), const SizedBox(width: 6)],
                            Text(
                              ev.enCurso ? 'En curso · ${ev.rangoHorario}' : ev.rangoHorario,
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: apagado ? p.apagado : p.marcaTexto),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          ev.tipo,
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: apagado ? p.apagado : p.texto,
                            decoration: apagado ? TextDecoration.lineThrough : null,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(ev.lugar, style: TextStyle(fontSize: 13, color: apagado ? p.apagado : p.textoSecundario)),
                      ],
                    ),
                  ),
                  if (apagado)
                    Etiqueta(texto: textoEstadoEvento(ev), apagada: true)
                  else if (ev.miEstado != null)
                    Etiqueta(texto: textoMiEstado(ev.miEstado!), icono: iconoMiEstado(ev.miEstado!)),
                ],
              ),
              if (!apagado && asisten.isNotEmpty) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    PilaAvatares(personas: asisten),
                    Text(
                      reales
                          ? '${asisten.length} ${asisten.length == 1 ? 'asistió' : 'asistieron'}'
                          : '${asisten.length} ${asisten.length == 1 ? 'asistirá' : 'asistirán'}',
                      style: TextStyle(fontSize: 12, color: p.textoSecundario),
                    ),
                  ],
                ),
              ],
              AnimatedSize(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOut,
                child: pedirRespuesta
                    ? Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: FilledButton.tonal(
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(40), backgroundColor: p.suave, foregroundColor: p.sobreSuave),
                          onPressed: alAbrir,
                          child: const Text('¿Vas a ir? Responde'),
                        ),
                      )
                    : const SizedBox(width: double.infinity),
              ),
              if (tomarAsistencia)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: ev.enCurso
                      ? FilledButton.icon(
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                          onPressed: () => _abrirTomarAsistencia(context),
                          icon: const Icon(Icons.how_to_reg_rounded, size: 20),
                          label: const Text('Tomar asistencia'),
                        )
                      : OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(40)),
                          onPressed: () => _abrirTomarAsistencia(context),
                          icon: const Icon(Icons.how_to_reg_outlined, size: 20),
                          label: Text(ev.asistentes.isEmpty ? 'Tomar asistencia' : 'Editar asistencia'),
                        ),
                ),
            ],
          ),
        ),
      ),
    );
    return ev.enCurso ? _BrilloEnCurso(child: tarjeta) : tarjeta;
  }

  void _abrirTomarAsistencia(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TomarAsistenciaScreen(repo: repo, eventoId: evento.id),
      ),
    );
  }
}

/// Borde con un brillo suave que late: el evento está pasando ahora.
class _BrilloEnCurso extends StatefulWidget {
  const _BrilloEnCurso({required this.child});
  final Widget child;

  @override
  State<_BrilloEnCurso> createState() => _BrilloEnCursoState();
}

class _BrilloEnCursoState extends State<_BrilloEnCurso> with SingleTickerProviderStateMixin {
  late final AnimationController _latido = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat(reverse: true);

  @override
  void dispose() {
    _latido.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return AnimatedBuilder(
      animation: _latido,
      builder: (context, hijo) {
        final v = Curves.easeInOut.transform(_latido.value);
        return DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            border: Border.all(color: p.marca.withValues(alpha: 0.45 + 0.55 * v), width: 1.5),
            boxShadow: [
              BoxShadow(
                color: p.marca.withValues(alpha: 0.10 + 0.22 * v),
                blurRadius: 10 + 8 * v,
                spreadRadius: 0.5,
              ),
            ],
          ),
          child: hijo,
        );
      },
      child: widget.child,
    );
  }
}

/// Punto rojo "en vivo" que late junto a "En curso".
class _PuntoEnVivo extends StatefulWidget {
  const _PuntoEnVivo();

  @override
  State<_PuntoEnVivo> createState() => _PuntoEnVivoState();
}

class _PuntoEnVivoState extends State<_PuntoEnVivo> with SingleTickerProviderStateMixin {
  late final AnimationController _latido = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat(reverse: true);

  @override
  void dispose() {
    _latido.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0).animate(_latido),
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: context.pivot.marca, shape: BoxShape.circle),
      ),
    );
  }
}

/// Temporada de descanso (como la card `ev-card-offseason` de la web). Los
/// admins la editan o la eliminan tocándola.
class _TarjetaDescanso extends StatelessWidget {
  const _TarjetaDescanso({required this.temporada, required this.repo});
  final Temporada temporada;
  final EventosRepo repo;

  Future<void> _acciones(BuildContext context) async {
    final accion = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('Editar temporada'), onTap: () => Navigator.pop(c, 'editar')),
            ListTile(
              leading: Icon(Icons.delete_outline_rounded, color: c.pivot.marcaTexto),
              title: Text('Eliminar temporada', style: TextStyle(color: c.pivot.marcaTexto)),
              subtitle: const Text('Los entrenamientos de esas fechas vuelven a aparecer.'),
              onTap: () => Navigator.pop(c, 'eliminar'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (accion == null || !context.mounted) return;
    final mensajero = ScaffoldMessenger.of(context);
    if (accion == 'editar') {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => CrearEventoScreen(repo: repo, temporada: temporada),
        ),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('¿Eliminar la temporada?'),
        content: Text('${temporada.nombre}: los entrenamientos de esas fechas vuelven a aparecer.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await repo.eliminarDescanso(temporada);
      mensajero.showSnackBar(const SnackBar(content: Text('Temporada eliminada.')));
    } catch (e) {
      mensajero.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final esAdmin = repo.sesion.esAdmin && repo.sesion.adminToken != null;
    return Material(
      color: p.apagadoFondo,
      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        onTap: esAdmin ? () => _acciones(context) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: p.tarjeta, shape: BoxShape.circle),
                child: Icon(Icons.bedtime_outlined, color: p.textoSecundario),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      temporada.nombre,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.texto),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Sin entrenamientos del ${Fechas.corta(temporada.desde)} al ${Fechas.corta(temporada.hasta)}',
                      style: TextStyle(fontSize: 13, color: p.textoSecundario),
                    ),
                  ],
                ),
              ),
              if (esAdmin) Icon(Icons.more_vert_rounded, color: p.textoSecundario),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tarjeta de cumpleaños: avatar de la persona y, si cumple hoy, confeti
/// cayendo en loop dentro de la tarjeta.
class _TarjetaCumple extends StatelessWidget {
  const _TarjetaCumple({required this.cumple});
  final Cumple cumple;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final esHoy = Fechas.soloDia(cumple.fecha) == Fechas.hoy();
    final contenido = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          AvatarPersona(nombre: cumple.nombre, foto: cumple.fotoPerfil, tamano: 44, borde: esHoy ? p.marca : null),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Cumpleaños de ${cumple.nombre}',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.texto),
                ),
                const SizedBox(height: 2),
                Text(textoCumple(cumple, Fechas.hoy()), style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              ],
            ),
          ),
          const Text('🎈', style: TextStyle(fontSize: 20)),
        ],
      ),
    );
    return Container(
      decoration: BoxDecoration(
        color: esHoy ? p.suave : p.fondo,
        border: Border.all(color: esHoy ? p.marca : p.tarjetaBorde),
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      ),
      clipBehavior: Clip.antiAlias,
      child: esHoy
          ? Stack(
              children: [
                contenido,
                const Positioned.fill(child: IgnorePointer(child: _Confeti())),
              ],
            )
          : contenido,
    );
  }
}

/// Confeti que cae sin parar (papelitos que giran y se mecen).
class _Confeti extends StatefulWidget {
  const _Confeti();

  @override
  State<_Confeti> createState() => _ConfetiState();
}

class _ConfetiState extends State<_Confeti> with SingleTickerProviderStateMixin {
  late final AnimationController _reloj = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
  late final List<_Papelito> _papelitos = List.generate(26, _Papelito.new);

  @override
  void dispose() {
    _reloj.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(child: CustomPaint(painter: _PintorConfeti(_reloj, _papelitos)));
}

class _Papelito {
  _Papelito(int i)
    : x = _azar(i, 1),
      fase = _azar(i, 2),
      velocidad = (1 + (_azar(i, 3) * 2).floor()).toDouble(), // entero: el loop no salta
      giro = (_azar(i, 4) - 0.5) * 12,
      vaiven = 4 + _azar(i, 5) * 8,
      ancho = 4 + _azar(i, 6) * 3,
      color = PivotPaleta.confeti[i % PivotPaleta.confeti.length];
  final double x, fase, velocidad, giro, vaiven, ancho;
  final Color color;

  // Pseudoazar fijo: cada papelito siempre igual, sin saltos entre cuadros.
  static double _azar(int i, int k) {
    final v = ((i + 1) * 9301 + k * 49297) % 233280;
    return v / 233280;
  }
}

class _PintorConfeti extends CustomPainter {
  _PintorConfeti(this.reloj, this.papelitos) : super(repaint: reloj);
  final Animation<double> reloj;
  final List<_Papelito> papelitos;

  @override
  void paint(Canvas canvas, Size size) {
    final t = reloj.value;
    final pincel = Paint();
    for (final p in papelitos) {
      final avance = (t * p.velocidad + p.fase) % 1.0;
      final y = avance * (size.height + 20) - 10;
      final x = p.x * size.width + math.sin((avance + p.fase) * math.pi * 4) * p.vaiven;
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(avance * p.giro);
      pincel.color = p.color;
      canvas.drawRect(Rect.fromCenter(center: Offset.zero, width: p.ancho, height: p.ancho * 0.55), pincel);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_PintorConfeti viejo) => false;
}

class _Accion {
  const _Accion(this.icono, this.texto, this.alTocar);
  final IconData icono;
  final String texto;
  final VoidCallback alTocar;
}

/// Menú del "+": opciones con ícono y texto completo que suben escalonadas
/// desde el botón, que gira a ×.
class _MenuAcciones extends StatefulWidget {
  const _MenuAcciones({required this.acciones});
  final List<_Accion> acciones;

  @override
  State<_MenuAcciones> createState() => _MenuAccionesState();
}

class _MenuAccionesState extends State<_MenuAcciones> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 320))..forward();

  @override
  void dispose() {
    _a.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final n = widget.acciones.length;
    return SafeArea(
      child: Padding(
        // Mismo lugar que el FAB del Scaffold (16 px del borde, sobre la barra inferior).
        padding: const EdgeInsets.only(right: 16, bottom: 16 + 80),
        child: Align(
          alignment: Alignment.bottomRight,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < n; i++)
                Builder(
                  builder: (context) {
                    // La más cercana al botón aparece primero.
                    final inicio = (n - 1 - i) * 0.12;
                    final anim = CurvedAnimation(
                      parent: _a,
                      curve: Interval(inicio, (inicio + 0.6).clamp(0, 1), curve: Curves.easeOutCubic),
                    );
                    final ac = widget.acciones[i];
                    return FadeTransition(
                      opacity: anim,
                      child: SlideTransition(
                        position: Tween(begin: const Offset(0, 0.4), end: Offset.zero).animate(anim),
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Material(
                            color: p.tarjeta,
                            elevation: 3,
                            shadowColor: p.velo,
                            borderRadius: BorderRadius.circular(PivotRadios.boton),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(PivotRadios.boton),
                              onTap: () => Navigator.of(context).pop(ac),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(ac.icono, color: p.marcaTexto),
                                    const SizedBox(width: 12),
                                    Text(
                                      ac.texto,
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.texto),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              FloatingActionButton(
                heroTag: null,
                tooltip: 'Cerrar',
                onPressed: () => Navigator.of(context).pop(),
                child: RotationTransition(
                  turns: Tween(begin: 0.0, end: 0.125).animate(CurvedAnimation(parent: _a, curve: Curves.easeOutCubic)),
                  child: const Icon(Icons.add_rounded),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
