import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/fechas.dart';
import '../core/reloj.dart';
import '../core/tema.dart';
import '../core/tour.dart';
import '../reservas/gestionar_reserva.dart';
import '../reservas/reserva_screen.dart';
import '../reservas/reservas_repo.dart';
import 'anticipada_screen.dart';
import 'calendario_panel.dart';
import 'crear_evento_screen.dart';
import 'detalle_screen.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'rectificacion.dart';
import 'tomar_asistencia_screen.dart';
import 'widgets_comunes.dart';
import '../core/cargando.dart';
import '../ajustes/componentes.dart';
import '../tareas/crear_tarea_screen.dart';
import '../tareas/tarea_screen.dart';
import '../tareas/tareas_modelos.dart';
import '../tareas/tareas_repo.dart';
import '../tareas/tareas_screen.dart' hide PilaAvatares;
import '../pivots/bandeja_repo.dart';
import '../pivots/bandeja_screen.dart';
import '../pivots/icono_bandeja.dart';

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
  _Item.evento(this.evento) : cumple = null, temporada = null, mia = null, grupo = null, diaGrupo = null;
  _Item.cumple(this.cumple) : evento = null, temporada = null, mia = null, grupo = null, diaGrupo = null;
  _Item.temporada(this.temporada) : evento = null, cumple = null, mia = null, grupo = null, diaGrupo = null;
  // Calendario + tareas (Victor, 2026-11-12): mis tareas en su fecha y las
  // tomadas por otras personas agrupadas por día.
  _Item.mia(this.mia) : evento = null, cumple = null, temporada = null, grupo = null, diaGrupo = null;
  _Item.grupo(this.grupo, this.diaGrupo) : evento = null, cumple = null, temporada = null, mia = null;
  final Temporada? temporada;
  final Evento? evento;
  final Cumple? cumple;
  final MiTarea? mia;
  final List<Tarea>? grupo;
  final DateTime? diaGrupo;
  bool get esTarea => mia != null || grupo != null;
  DateTime get fecha => evento?.fecha ?? cumple?.fecha ?? mia?.vence ?? diaGrupo ?? temporada!.desde;

  /// Hora para ordenar dentro del día: las tareas vencen al final del día.
  String get hora => evento?.horaInicio ?? (esTarea ? '23:59' : '00:00');
}

/// Qué muestra la línea de tiempo.
enum _Vista { todo, eventos, tareas }

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

  late final TareasRepo _tareas = TareasRepo.de(repo.sesion);
  late final BandejaRepo _bandeja = BandejaRepo.de(repo.sesion);
  _Vista _vista = _Vista.todo;
  void _alCambiarTareas() {
    if (mounted) setState(() => _claveFilas = null);
  }

  bool _buscando = false;
  String _consulta = '';
  // Varios a la vez (Victor, 2026-11-12); vacío = todos.
  Set<String> _filtroLugar = {};
  Set<String> _filtroTipo = {};
  Set<String> _filtroArea = {}; // área de tarea
  DateTime? _diaArriba; // primer día visible: los filtros no mueven el timeline
  Object? _firmaFiltros;
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
  void _alPasarMinuto() {
    if (mounted) setState(() {});
  }

  List<_Fila> _filas = const [];
  int? _claveFilas;
  bool _saltoInicialHecho = false;

  static const _anchoFecha = 52.0;
  static const _anchoRiel = 28.0;

  // Tour guiado de primera vez (como el de la web, `_EV_TOUR_PASOS_*`).
  final _kMes = GlobalKey(debugLabel: 'tour-mes');
  final _kBuscar = GlobalKey(debugLabel: 'tour-buscar');
  final _kTareas = GlobalKey(debugLabel: 'tour-tareas');
  final _kMas = GlobalKey(debugLabel: 'tour-mas');
  final _kTarjeta = GlobalKey(debugLabel: 'tour-tarjeta');
  final _kLista = GlobalKey(debugLabel: 'tour-lista');
  String? _idTarjetaTour;

  EventosRepo get repo => widget.repo;

  @override
  void initState() {
    super.initState();
    repo.cargar();
    _posiciones.itemPositions.addListener(_alDesplazar);
    widget.irAHoy?.addListener(_irAHoy);
    _cargarFiltros();
    // Al cambiar cada minuto (y al volver a la app): mueve la línea de
    // "ahora", el resaltado de "En curso" y habilita "Tomar asistencia".
    RelojMinuto.instancia.addListener(_alPasarMinuto);
    _tareas.addListener(_alCambiarTareas);
    _tareas.cargar(forzar: _tareas.cargado);
    _bandeja.addListener(_alPasarMinuto);
    _bandeja.cargar(forzar: true);
    _bandeja.cargarMia();
  }

  // ─── Búsqueda y filtros guardados (pedido 2026-11-06: siempre) ─────────

  static const _kTexto = 'eventos.busqueda', _kLugar = 'eventos.filtroLugar', _kTipo = 'eventos.filtroTipo';
  static const _kVista = 'eventos.filtroVista', _kArea = 'eventos.filtroArea';

  Future<void> _cargarFiltros() async {
    try {
      final pr = await SharedPreferences.getInstance();
      if (!mounted) return;
      setState(() {
        _consulta = pr.getString(_kTexto) ?? '';
        _textoBusqueda.text = _consulta;
        Set<String> leer(String k) {
          try {
            return (pr.getStringList(k) ?? const []).toSet();
          } catch (_) {
            final v = pr.getString(k); // formato anterior: un solo valor
            return v == null ? {} : {v};
          }
        }

        _filtroLugar = leer(_kLugar);
        _filtroTipo = leer(_kTipo);
        _filtroArea = leer(_kArea);
        _vista = _Vista.values.firstWhere((v) => v.name == pr.getString(_kVista), orElse: () => _Vista.todo);
        _claveFilas = null;
      });
    } catch (_) {}
  }

  Future<void> _guardarFiltros() async {
    try {
      final pr = await SharedPreferences.getInstance();
      _consulta.trim().isEmpty ? await pr.remove(_kTexto) : await pr.setString(_kTexto, _consulta);
      Future<void> guardar(String k, Set<String> v) async => v.isEmpty ? await pr.remove(k) : await pr.setStringList(k, v.toList());
      await guardar(_kLugar, _filtroLugar);
      await guardar(_kTipo, _filtroTipo);
      await guardar(_kArea, _filtroArea);
      _vista == _Vista.todo ? await pr.remove(_kVista) : await pr.setString(_kVista, _vista.name);
    } catch (_) {}
  }

  void _cambiarFiltros(VoidCallback cambio) {
    setState(() {
      cambio();
      _claveFilas = null;
    });
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
    RelojMinuto.instancia.removeListener(_alPasarMinuto);
    _tareas.removeListener(_alCambiarTareas);
    _bandeja.removeListener(_alPasarMinuto);
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
    // La fila de arriba cuenta solo si se ve de verdad (no un borde de la
    // anterior que asoma): si no, al ir al día 1 el título quedaba en el mes previo.
    final pos = _posiciones.itemPositions.value.where((p) => p.itemTrailingEdge > 0.06).toList();
    if (pos.isEmpty || _filas.isEmpty) return;
    pos.sort((a, b) => a.index.compareTo(b.index));
    final i = pos.first.index.clamp(0, _filas.length - 1);
    final d = _filas[i].dia;
    if (_scrollDelUsuario || _diaArriba == null) _diaArriba = d;
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
    if (it.esTarea) {
      final t = it.mia?.tarea.titulo ?? it.grupo!.map((x) => x.titulo).join(' ');
      return q.split(RegExp(r'\s+')).every((palabra) => 'tarea $t'.toLowerCase().contains(palabra));
    }
    final texto = ev != null
        ? '${ev.tipo} ${ev.lugar} ${ev.descripcion} ${textoEstadoEvento(ev)} ${Fechas.encabezado(ev.fecha)} ${Fechas.mes(ev.fecha)}'
        : it.cumple != null
        ? (it.cumple!.esAniversario
              ? 'aniversario en el equipo ${Fechas.mes(it.cumple!.fecha)}'
              : 'cumpleaños ${it.cumple!.nombre} ${Fechas.mes(it.cumple!.fecha)}')
        : 'descanso temporada ${it.temporada!.nombre} ${Fechas.mes(it.temporada!.desde)} ${Fechas.mes(it.temporada!.hasta)}';
    return q.split(RegExp(r'\s+')).every((palabra) => texto.toLowerCase().contains(palabra));
  }

  bool _pasaFiltros(_Item it) {
    if (!_coincideTexto(it)) return false;
    // Con filtros solo de eventos se ocultan las tareas, y al revés (el
    // área ya se aplicó al armar las tareas).
    final deEventos = _filtroLugar.isNotEmpty || _filtroTipo.isNotEmpty;
    if (it.esTarea) return !deEventos || _filtroArea.isNotEmpty;
    if (_filtroArea.isNotEmpty && !deEventos) return false;
    final ev = it.evento;
    if (_filtroLugar.isNotEmpty && !_filtroLugar.contains(ev?.lugar)) return false;
    if (_filtroTipo.isNotEmpty) {
      if (it.cumple != null) return _filtroTipo.contains('Cumpleaños');
      if (it.temporada != null) return _filtroTipo.contains('Descanso');
      if (!_filtroTipo.contains(ev?.tipo)) return false;
    }
    return true;
  }

  bool get _hayFiltros => _consulta.trim().isNotEmpty || _cantidadFiltros > 0;

  /// Filtros del botón de filtros (la lupa es solo para el texto).
  int get _cantidadFiltros =>
      (_vista != _Vista.todo ? 1 : 0) + (_filtroLugar.isNotEmpty ? 1 : 0) + (_filtroTipo.isNotEmpty ? 1 : 0) + (_filtroArea.isNotEmpty ? 1 : 0);

  /// "Eventos · Pista" para el aviso de la búsqueda.
  String get _resumenFiltros =>
      [if (_vista == _Vista.eventos) 'Eventos', if (_vista == _Vista.tareas) 'Tareas', ..._filtroTipo, ..._filtroLugar, ..._filtroArea].join(' · ');

  void _quitarFiltros() {
    _vista = _Vista.todo;
    _filtroLugar = {};
    _filtroTipo = {};
    _filtroArea = {};
  }

  List<_Item> _todos() => [
    if (_vista != _Vista.tareas) ...[
      for (final e in repo.eventos) _Item.evento(e),
      for (final c in repo.cumples) _Item.cumple(c),
      for (final a in repo.aniversarios) _Item.cumple(a),
      for (final t in repo.temporadas) _Item.temporada(t),
    ],
    if (_vista != _Vista.eventos) ..._itemsTareas(),
  ];

  /// Mis tareas en su fecha (las atrasadas van arriba, fuera de la lista) y
  /// las tomadas por otras personas, agrupadas por día de vencimiento.
  List<_Item> _itemsTareas() {
    final items = <_Item>[];
    for (final m in _tareas.mias) {
      if (m.vence == null || _atrasada(m)) continue;
      if (_filtroArea.isNotEmpty && !_filtroArea.contains(m.tarea.area)) continue;
      items.add(_Item.mia(m));
    }
    final porDia = <DateTime, List<Tarea>>{};
    for (final t in _tareas.tablero) {
      final v = t.vence;
      if (v == null || t.personas.isEmpty || t.tiene(_tareas.yo)) continue;
      if (_filtroArea.isNotEmpty && !_filtroArea.contains(t.area)) continue;
      porDia.putIfAbsent(Fechas.soloDia(v), () => []).add(t);
    }
    porDia.forEach((d, l) => items.add(_Item.grupo(l, d)));
    return items;
  }

  static bool _atrasada(MiTarea m) => !m.enRevision && (m.dias ?? 0) < 0;

  /// Opciones de los filtros: solo las que existen en lo que ya coincide con
  /// el texto buscado (y con el otro filtro), igual que la web.
  List<String> _opcionesLugar() {
    final s = <String>{};
    for (final it in _todos()) {
      final ev = it.evento;
      if (ev == null || !_coincideTexto(it)) continue;
      if (_filtroTipo.isNotEmpty && !_filtroTipo.contains(ev.tipo)) continue;
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
      if (_filtroLugar.isNotEmpty && !_filtroLugar.contains(ev.lugar)) continue;
      s.add(ev.tipo);
    }
    return [...(s.toList()..sort()), if (hayCumples && _filtroLugar.isEmpty) 'Cumpleaños', if (hayDescanso && _filtroLugar.isEmpty) 'Descanso'];
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
      final items = porDia[dia]!..sort((a, b) => a.hora.compareTo(b.hora));
      final esHoy = dia == hoy && !_hayFiltros;
      var primera = true;
      var ahoraPuesto = !esHoy;
      for (final it in items) {
        if (!ahoraPuesto && it.hora.compareTo(ahora) > 0) {
          filas.add(_Fila(dia: dia, mostrarFecha: primera, ahora: true));
          primera = false;
          ahoraPuesto = true;
        }
        filas.add(_Fila(dia: dia, mostrarFecha: primera, item: it));
        primera = false;
      }
      if (!ahoraPuesto) {
        final sinMas = items.every((i) => i.esTarea || i.evento == null || i.evento!.yaEmpezo);
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
    _diaArriba = Fechas.soloDia(dia);
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
    // Al cerrar queda el mes que se estaba viendo en el calendario (como Google Calendar).
    _mesVisible = _mesPanel;
    _tituloMes.value = _mesPanel;
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
      '${Fechas.iso(f.dia)}|${f.semana != null ? 's' : ''}|${f.ahora ? 'a' : ''}|${f.item?.evento?.id ?? (f.item?.cumple == null ? null : '${f.item!.cumple!.nombre}${f.item!.cumple!.esAniversario ? '-aniv' : ''}') ?? f.item?.temporada?.id ?? ''}';

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
    _quitarFiltros();
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
          Object.hash(identityHashCode(_tareas.mias), identityHashCode(_tareas.tablero), _vista),
          _consulta,
          Object.hashAll(_filtroLugar),
          Object.hashAll(_filtroTipo),
          Object.hashAll(_filtroArea),
          ahora.day,
          ahora.hour,
          ahora.minute,
        );
        if (claveFilas != _claveFilas) {
          _filas = _armarFilas();
          _claveFilas = claveFilas;
          // La tarjeta que señala el tour: el primer evento de hoy en adelante.
          final hoy = Fechas.hoy();
          _idTarjetaTour = _filas.where((f) => f.item?.evento != null && !f.dia.isBefore(hoy)).map((f) => f.item!.evento!.id).firstOrNull;
        }
        // Filtrar o quitar filtros no mueve el timeline (bug, Victor
        // 2026-11-12: quitaba el filtro y aparecía en octubre).
        final firmaFiltros = Object.hash(_vista, Object.hashAll(_filtroLugar), Object.hashAll(_filtroTipo), Object.hashAll(_filtroArea));
        if (_firmaFiltros != null && firmaFiltros != _firmaFiltros && _saltoInicialHecho) {
          final dia = _diaArriba ?? Fechas.hoy();
          WidgetsBinding.instance.addPostFrameCallback((_) => _irA(dia, animado: false));
        }
        _firmaFiltros = firmaFiltros;
        final firma = Object.hash(identityHashCode(repo.eventos), identityHashCode(repo.cumples));
        if (_firmaDatos != null && firma != _firmaDatos && _saltoInicialHecho) _mantenerAncla(antes, _filas);
        _firmaDatos = firma;
        if (!_saltoInicialHecho && repo.eventos.isNotEmpty) {
          _saltoInicialHecho = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _irA(Fechas.hoy(), animado: false);
            Future.delayed(const Duration(milliseconds: 900), _tourSiCorresponde);
          });
        }
        final panel = _calMontado ? RepaintBoundary(child: _panelCalendario(context)) : null;
        return PopScope(
          // Atrás (botón o gesto) primero cierra el buscador o el calendario;
          // recién sin nada abierto sale de la app.
          canPop: !_buscando && !_calMontado,
          onPopInvokedWithResult: (hecho, _) {
            if (hecho) return;
            if (_buscando) {
              _cerrarBusqueda();
            } else {
              _cerrarCalendario();
            }
          },
          child: Scaffold(
            floatingActionButton: _acciones.isEmpty || _buscando
                ? null
                : FloatingActionButton(key: _kMas, tooltip: 'Crear', onPressed: _abrirAcciones, child: const Icon(Icons.add_rounded)),
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
                  if (!_buscando) _cabeceraTareas(context),
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
                                    // Sin fundido (como Google Calendar): solo se desliza bajo la barra.
                                    child: panel,
                                  ),
                                ),
                            ],
                          );
                        },
                        // Con el calendario abierto, arrastrar el timeline mueve
                        // todo junto (acordeón) en vez de desplazarlo por dentro.
                        // Una capa transparente encima del timeline se queda con los
                        // arrastres verticales (gana antes que la lista) y deja
                        // pasar los toques a las tarjetas. Así la lista nunca
                        // cambia de física (bug real 1.0.15: al cambiarla, después
                        // no se podía volver hacia arriba y saltaba el "tirar para
                        // actualizar").
                        child: Stack(
                          children: [
                            RepaintBoundary(child: _cuerpo(context)),
                            if (_calMontado)
                              Positioned.fill(
                                child: GestureDetector(
                                  behavior: HitTestBehavior.translucent,
                                  onVerticalDragUpdate: (d) => _arrastrar(d.delta.dy),
                                  onVerticalDragEnd: (d) => _soltar(d.primaryVelocity ?? 0),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
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
              key: _kMes,
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
          // Bandeja para todas las personas (2026-11-13): campana con novedades.
          IconButton(
            tooltip: _bandeja.hayNovedades ? 'Bandeja (hay novedades)' : (_bandeja.total > 0 ? 'Bandeja (${_bandeja.total} por revisar)' : 'Bandeja'),
            icon: IconoBandeja(novedades: _bandeja.hayNovedades, pendientes: _bandeja.esPivot ? _bandeja.total : 0),
            onPressed: () {
              _cerrarCalendario();
              SubAjustes.abrir(context, BandejaPivotsScreen(repo: _bandeja));
            },
          ),
          // Tablero de tareas, con el número de tareas para tomar.
          IconButton(
            key: _kTareas,
            tooltip: 'Tareas',
            icon: Badge(
              isLabelVisible: _tareas.disponibles.isNotEmpty,
              backgroundColor: p.marca,
              label: Text('${_tareas.disponibles.length}'),
              child: const Icon(Icons.checklist_rounded),
            ),
            onPressed: _abrirTablero,
          ),
          // Filtros en un solo lugar (Victor, 2026-11-12): qué mostrar, tipo
          // y lugar de evento, área de tarea. Con el número de activos.
          IconButton(
            tooltip: _cantidadFiltros > 0 ? 'Filtros ($_cantidadFiltros activos)' : 'Filtros',
            icon: Badge(
              isLabelVisible: _cantidadFiltros > 0,
              backgroundColor: p.marca,
              label: Text('$_cantidadFiltros'),
              child: const Icon(Icons.tune_rounded),
            ),
            onPressed: () {
              _cerrarCalendario();
              _abrirFiltros();
            },
          ),
          IconButton(
            key: _kBuscar,
            tooltip: _consulta.trim().isNotEmpty ? 'Buscar (hay una búsqueda activa)' : 'Buscar',
            // Punto rojo: quedó una búsqueda guardada.
            icon: Badge(isLabelVisible: _consulta.trim().isNotEmpty, smallSize: 9, backgroundColor: p.marca, child: const Icon(Icons.search_rounded)),
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

  void _cerrarBusqueda() {
    FocusScope.of(context).unfocus();
    setState(() => _buscando = false);
    WidgetsBinding.instance.addPostFrameCallback((_) => _irA(Fechas.hoy(), animado: false));
  }

  /// ← cierra (la búsqueda queda guardada) y el campo con × para borrar el
  /// texto. Si hay filtros activos se respetan, y debajo se avisa con
  /// "Con filtros: … · Quitar".
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
                    hintText: 'Buscar en la línea de tiempo',
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
            ],
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _cantidadFiltros == 0
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.fromLTRB(16, 2, 0, 0),
                    child: Row(
                      children: [
                        Icon(Icons.tune_rounded, size: 16, color: p.textoSecundario),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Con filtros: $_resumenFiltros',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
                          ),
                        ),
                        TextButton(onPressed: () => _cambiarFiltros(_quitarFiltros), child: const Text('Quitar')),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  /// Hoja de filtros (todo en un lugar, Victor 2026-11-12): qué mostrar,
  /// tipo y lugar de evento (solo opciones que existen en lo que coincide
  /// con la búsqueda y el otro filtro) y área de tarea. Se aplican al
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

          Widget titulo(String texto, IconData icono) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Icon(icono, size: 20, color: p.textoSecundario),
                const SizedBox(width: 8),
                Text(
                  texto,
                  style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                ),
              ],
            ),
          );

          // Una fila que se desliza de lado, con varios elegibles a la vez
          // (Victor, 2026-11-12): la hoja no crece con muchos tipos o lugares.
          Widget grupo(String texto, IconData icono, Set<String> valor, List<String> opciones) {
            final todas = {...opciones, ...valor}.toList();
            return Padding(
              padding: const EdgeInsets.only(top: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  titulo(texto, icono),
                  SizedBox(
                    height: 40,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      clipBehavior: Clip.none,
                      children: [
                        for (final (i, o) in [null, ...todas].indexed)
                          Padding(
                            padding: EdgeInsets.only(left: i == 0 ? 0 : 8),
                            child: FilterChip(
                              showCheckmark: false,
                              label: Text(o ?? 'Todos'),
                              selected: o == null ? valor.isEmpty : valor.contains(o),
                              onSelected: (_) => elegir(() {
                                if (o == null) {
                                  valor.clear();
                                } else if (!valor.remove(o)) {
                                  valor.add(o);
                                }
                              }),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }

          final areas = <String>{for (final m in _tareas.mias) m.tarea.area, for (final t in _tareas.tablero) t.area}.toList()..sort();
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(hoja).height * 0.85),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Filtros', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 16),
                    titulo('Mostrar', Icons.visibility_outlined),
                    SegmentedButton<_Vista>(
                      showSelectedIcon: false,
                      segments: const [
                        ButtonSegment(value: _Vista.todo, label: Text('Todo')),
                        ButtonSegment(value: _Vista.eventos, label: Text('Eventos')),
                        ButtonSegment(value: _Vista.tareas, label: Text('Tareas')),
                      ],
                      selected: {_vista},
                      onSelectionChanged: (s) => elegir(() {
                        _vista = s.first;
                        if (_vista == _Vista.tareas) {
                          _filtroLugar = {};
                          _filtroTipo = {};
                        }
                        if (_vista == _Vista.eventos) _filtroArea = {};
                      }),
                    ),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOutCubic,
                      alignment: Alignment.topCenter,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_vista != _Vista.tareas) ...[
                            grupo('Tipo de evento', Icons.category_outlined, _filtroTipo, _opcionesTipo()),
                            grupo('Lugar', Icons.place_outlined, _filtroLugar, _opcionesLugar()),
                          ],
                          if (_vista != _Vista.eventos && areas.isNotEmpty) grupo('Área de tarea', Icons.checklist_rounded, _filtroArea, areas),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        TextButton(onPressed: _cantidadFiltros == 0 ? null : () => elegir(_quitarFiltros), child: const Text('Quitar filtros')),
                        const Spacer(),
                        FilledButton(onPressed: () => Navigator.of(hoja).pop(), child: const Text('Listo')),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _cuerpo(BuildContext context) {
    final p = context.pivot;
    if (repo.cargando && repo.eventos.isEmpty) return const Center(child: PivotCargando());
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
                _consulta.trim().isNotEmpty && _cantidadFiltros > 0
                    ? 'No hay resultados con los filtros activos ($_resumenFiltros).'
                    : _cantidadFiltros == 1 && _vista == _Vista.tareas
                    ? 'No hay tareas disponibles.'
                    : _cantidadFiltros == 1 && _vista == _Vista.eventos
                    ? 'No hay eventos disponibles.'
                    : _cantidadFiltros > 0 && _vista == _Vista.tareas
                    ? 'No hay tareas con estos filtros.'
                    : _cantidadFiltros > 0 && _vista == _Vista.eventos
                    ? 'No hay eventos con estos filtros.'
                    : _cantidadFiltros > 0
                    ? 'No hay nada con estos filtros.'
                    : 'No hay nada que coincida con la búsqueda.',
                textAlign: TextAlign.center,
                style: TextStyle(color: p.textoSecundario),
              ),
              const SizedBox(height: 12),
              // Con texto y filtros: buscar lo mismo sin filtros.
              if (_consulta.trim().isNotEmpty && _cantidadFiltros > 0)
                FilledButton.tonal(onPressed: () => _cambiarFiltros(_quitarFiltros), child: const Text('Buscar en todo'))
              else if (_cantidadFiltros > 0)
                OutlinedButton(onPressed: () => _cambiarFiltros(_quitarFiltros), child: const Text('Quitar filtros'))
              else
                OutlinedButton(onPressed: () => _cambiarFiltros(_limpiarFiltros), child: const Text('Quitar búsqueda')),
            ],
          ),
        ),
      );
    }
    // Con el calendario abierto el timeline NO se desplaza por dentro: el
    // arrastre mueve todo junto (calendario + timeline pegado debajo), como
    // un acordeón, igual que Google Calendar. Cerrado, scrollea normal.
    final lista = NotificationListener<ScrollNotification>(
      onNotification: _alScrollearTimeline,
      child: RefreshIndicator(
        key: _kLista,
        onRefresh: () => Future.wait([repo.cargar(forzar: true), _bandeja.cargar(forzar: true), _bandeja.cargarMia()]),
        child: ScrollablePositionedList.builder(
          itemScrollController: _scroll,
          itemPositionsListener: _posiciones,
          // Al volver a aparecer (después de un filtro sin resultados) sigue en el mismo día.
          initialScrollIndex: _filas.isEmpty ? 0 : _indiceDeDia(_diaArriba ?? Fechas.hoy()),
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(8, 4, 16, 96 + MediaQuery.paddingOf(context).bottom + (_calMontado ? _altoPanel : 0)),
          itemCount: _filas.length,
          itemBuilder: (context, i) => _fila(context, _filas[i]),
        ),
      ),
    );
    return lista;
  }

  /// Con el calendario abierto, scrollear el timeline lo va cerrando junto
  /// con el dedo; al soltar termina de cerrarse o vuelve a abrirse.
  final bool _colapsandoPorScroll = false;
  bool _alScrollearTimeline(ScrollNotification n) {
    if (n is ScrollStartNotification) _scrollDelUsuario = n.dragDetails != null;
    if (n is ScrollEndNotification) _scrollDelUsuario = false;
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
      contenido = f.item!.mia != null
          ? _TarjetaMiTarea(
              mia: f.item!.mia!,
              alAbrir: () => _abrirTarea(f.item!.mia!.tarea, mia: f.item!.mia),
            )
          : f.item!.grupo != null
          ? _GrupoTareas(tareas: f.item!.grupo!, alAbrir: (t) => _abrirTarea(t))
          : f.item!.temporada != null
          ? _TarjetaDescanso(temporada: f.item!.temporada!, repo: repo)
          : f.item!.cumple != null
          ? _TarjetaCumple(cumple: f.item!.cumple!)
          : f.item!.evento!.id == _idTarjetaTour
          ? KeyedSubtree(
              key: _kTarjeta,
              child: _TarjetaEvento(evento: f.item!.evento!, repo: repo, alAbrir: () => _abrirDetalle(f.item!.evento!)),
            )
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

  void _abrirTarea(Tarea t, {MiTarea? mia}) => SubAjustes.abrir(context, TareaScreen(repo: _tareas, tarea: t, mia: mia));

  void _abrirTablero() {
    _cerrarCalendario();
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => TareasScreen(repo: _tareas)));
  }

  /// Bajo la barra: las tareas atrasadas (fijas, en rojo) y el acceso a las
  /// que están para tomar. Qué se muestra se elige en el botón de filtros.
  Widget _cabeceraTareas(BuildContext context) {
    final p = context.pivot;
    final atrasadas = _vista == _Vista.eventos ? const <MiTarea>[] : _tareas.mias.where(_atrasada).toList();
    final libres = _tareas.disponibles;
    final maxPts = libres.fold<int>(0, (a, t) => t.puntos > a ? t.puntos : a);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final m in atrasadas.take(2))
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                  child: Material(
                    color: p.suave,
                    borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                      onTap: () => _abrirTarea(m.tarea, mia: m),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Row(
                          children: [
                            Icon(Icons.warning_amber_rounded, size: 20, color: p.marcaTexto),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '${m.tarea.titulo} · ${textoVence(m.vence)}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.sobreSuave),
                              ),
                            ),
                            Icon(Icons.chevron_right_rounded, color: p.sobreSuave),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (atrasadas.length > 2)
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 4, 16, 0),
                  child: Text('y ${atrasadas.length - 2} atrasadas más', style: TextStyle(fontSize: 12.5, color: p.marcaTexto)),
                ),
              if (_vista != _Vista.eventos && libres.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 2),
                  child: _vista == _Vista.tareas
                      ? _FranjaParaTomar(tareas: libres, alAbrir: (t) => _abrirTarea(t), alVerTodas: _abrirTablero)
                      : Material(
                          color: p.tarjeta,
                          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                            onTap: _abrirTablero,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              child: Row(
                                children: [
                                  Icon(Icons.add_task_rounded, size: 20, color: p.marcaTexto),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      'Para tomar · ${libres.length == 1 ? '1 tarea' : '${libres.length} tareas'}${maxPts > 0 ? ' · hasta +$maxPts' : ''}',
                                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: p.texto),
                                    ),
                                  ),
                                  Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                                ],
                              ),
                            ),
                          ),
                        ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
      ],
    );
  }

  void _reservar(TipoReserva t) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReservaScreen(repo: repo, tipo: t),
      ),
    );
  }

  Future<void> _tourSiCorresponde() async {
    if (!mounted || _buscando || _calMontado || !(ModalRoute.of(context)?.isCurrent ?? false)) return;
    // El texto del "+" nombra lo que tiene el menú de esta persona.
    // Frase natural según el menú: "Toca aquí para reservar tus clases o crear eventos."
    const verbos = {
      'Reserva por clase': 'reservar tus clases',
      'Reserva por mes': 'pagar tu mensualidad',
      'Nuevo evento': 'crear eventos',
      'Nueva tarea': 'crear tareas',
      'Proponer tarea': 'proponer tareas',
      'Asistencia anticipada': 'marcar tu asistencia a varios entrenamientos de una vez',
    };
    final nombres = [for (final a in _acciones) verbos[a.texto] ?? a.texto.toLowerCase()];
    final lista = nombres.length <= 1 ? nombres.join() : '${nombres.sublist(0, nombres.length - 1).join(', ')} o ${nombres.last}';
    final reserva = ReservasRepo(repo.sesion).opciones.isNotEmpty;
    final tituloMas = reserva ? 'Reserva tu lugar' : (_esAdmin ? 'Crea eventos' : 'Asistencia anticipada');
    final textoMas = 'Toca aquí para $lista.';
    await Tour.mostrarSiCorresponde(
      context,
      preferencia: 'tour.calendario.visto',
      pasos: [
        PasoTour(clave: _kMas, titulo: tituloMas, texto: textoMas),
        PasoTour(clave: _kMes, titulo: 'Navega por mes', texto: 'Toca el mes o desliza hacia abajo para abrir el calendario y saltar a cualquier fecha.'),
        PasoTour(
          clave: _kTareas,
          titulo: 'Tareas del equipo',
          texto: 'Aquí ves las tareas para tomar. Las tuyas aparecen en el calendario el día que vencen, y las atrasadas, arriba en rojo.',
        ),
        PasoTour(
          clave: _kBuscar,
          titulo: 'Busca y filtra',
          texto: 'Con la lupa buscas eventos, tareas, cumpleaños o lugares. Con el botón de al lado eliges qué ver: eventos o tareas, tipo, lugar o área.',
        ),
        PasoTour(clave: _kTarjeta, titulo: 'Detalle del evento', texto: 'Toca un evento para ver quiénes van, cambiar tu respuesta y ver cómo llegar.'),
        PasoTour(
          clave: ClavesTour.navegacion,
          ajuste: ClavesTour.primeraPestana,
          titulo: 'Vuelve a hoy',
          texto: 'El ícono de Calendario muestra la fecha de hoy. Tócalo de nuevo estando aquí para volver a hoy.',
        ),
        // Se resalta la parte de arriba de la línea de tiempo (toda la lista
        // no dejaría lugar para la tarjeta y el recorte no se notaría).
        PasoTour(
          clave: _kLista,
          ajuste: (r) => Rect.fromLTWH(r.left + 10, r.top + 6, r.width - 20, r.height * 0.5),
          titulo: 'Explora la línea de tiempo',
          texto: 'Desliza para ver lo pasado y lo próximo: eventos, tus tareas, cumpleaños y temporadas de descanso. Arriba eliges ver todo, solo eventos o solo tareas.',
        ),
      ],
    );
  }

  // ─── Botón "+": menú de acciones (pedido 2026-11-06, como la web) ───────

  List<_Accion> get _acciones => [
    // Fase 3: reservas según el tipo de persona (`ReservasRepo.opciones`).
    for (final t in ReservasRepo(repo.sesion).opciones)
      t == TipoReserva.clase
          ? _Accion(Icons.event_available_outlined, 'Reserva por clase', () => _reservar(t))
          : _Accion(Icons.calendar_month_outlined, 'Reserva por mes', () => _reservar(t)),
    if (_esAdmin) _Accion(Icons.edit_calendar_outlined, 'Nuevo evento', _nuevoEvento),
    _esAdmin
        ? _Accion(Icons.add_task_rounded, 'Nueva tarea', () => CrearTareaScreen.abrir(context, repo: _tareas, modo: ModoTarea.crear))
        : _Accion(Icons.add_task_rounded, 'Proponer tarea', () => CrearTareaScreen.abrir(context, repo: _tareas, modo: ModoTarea.proponer)),
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
      transitionDuration: const Duration(milliseconds: 320),
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
    if (it.esTarea) {
      // Las tareas llevan un punto cuadrado: se distinguen de un vistazo.
      final mia = it.mia != null;
      return Container(
        width: 12,
        height: 12,
        margin: const EdgeInsets.all(1),
        decoration: BoxDecoration(
          color: mia ? p.marca : p.fondo,
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: mia ? p.fondo : p.lineaTimeline, width: 2),
        ),
      );
    }
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
    final pedirRespuesta = !apagado && ev.miEstado == null && repo.motivoSinRespuesta(ev) == null;
    // Después de empezar se muestran quienes asistieron de verdad (si ya se tomó asistencia).
    final reales = ev.yaEmpezo && ev.asistentes.isNotEmpty;
    // Mi asistencia real en eventos que ya terminaron y tienen la lista tomada.
    final yo = repo.sesion.nombre ?? '';
    final (String, IconData)? miReal = !apagado && ev.finalizado && ev.asistentes.isNotEmpty
        ? switch (ev.asistentes.where((a) => a.persona.username.toLowerCase() == yo.toLowerCase()).firstOrNull?.estado) {
            EstadoReal.aTiempo => ('Llegaste a horario', Icons.check_circle_rounded),
            EstadoReal.tarde => ('Llegaste tarde', Icons.schedule_rounded),
            null => ('No asististe', Icons.cancel_outlined),
          }
        : null;
    final asisten = reales ? ev.asistentes.map((a) => a.persona).toList() : ev.con(EstadoRsvp.asistire).map((r) => r.persona).toList();
    final esAdmin = repo.sesion.esAdmin && repo.sesion.adminToken != null;
    final tomarAsistencia = esAdmin && ev.sePuedeTomarAsistencia;
    // Reserva de esta clase (Mirlxs): estado y "Cancelar o reagendar", como la web.
    final filaReserva = repo.reservaDe(ev);
    final reserva = filaReserva == null ? null : ReservaActiva.desde(filaReserva);
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
                  else if (ev.miEstado != null && !ev.finalizado)
                    Etiqueta(texto: textoMiEstado(ev.miEstado!), icono: iconoMiEstado(ev.miEstado!)),
                ],
              ),
              // Evento pasado con asistencia tomada (Victor, 2026-11-12): lo que pasó de verdad.
              // Va en su propia línea para no aplastar el título (2026-11-13).
              if (!apagado && miReal != null) ...[
                const SizedBox(height: 10),
                PillAsistencia(repo: repo, ev: ev, texto: miReal.$1, icono: miReal.$2, completa: true),
              ],
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
              if (reserva != null && !apagado)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(
                    children: [
                      EstadoReserva(estado: reserva.estado),
                      const Spacer(),
                      if (reserva.gestionable && !ev.yaEmpezo)
                        TextButton(
                          style: TextButton.styleFrom(visualDensity: VisualDensity.compact, foregroundColor: p.marcaTexto),
                          onPressed: () => gestionarReserva(context, repo, reserva),
                          child: const Text('Cancelar o reagendar'),
                        ),
                    ],
                  ),
                ),
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
    // RepaintBoundary: el latido se repinta solo, sin arrastrar al resto de la lista.
    return ev.enCurso ? RepaintBoundary(child: _BrilloEnCurso(child: tarjeta)) : tarjeta;
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
    final anios = cumple.aniosEquipo;
    final titulo = anios != null ? 'Aniversario en el equipo' : 'Cumpleaños de ${cumple.nombre}';
    final detalle = anios == null
        ? textoCumple(cumple, Fechas.hoy())
        : '${esHoy ? 'Hoy cumples' : 'Cumples'} $anios ${anios == 1 ? 'año' : 'años'} en el equipo';
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
                  titulo,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.texto),
                ),
                const SizedBox(height: 2),
                Text(detalle, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              ],
            ),
          ),
          Text(anios != null ? '🎉' : '🎈', style: const TextStyle(fontSize: 20)),
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

class _MenuAccionesState extends State<_MenuAcciones> {
  @override
  Widget build(BuildContext context) {
    // La animación de la propia ruta: al abrir va hacia adelante y al cerrar
    // (tocar ×, el velo o atrás) se invierte sola, así el "+" también gira de vuelta.
    final Animation<double> ruta = ModalRoute.of(context)?.animation ?? kAlwaysCompleteAnimation;
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
                      parent: ruta,
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
                  turns: Tween(begin: 0.0, end: 0.125).animate(CurvedAnimation(parent: ruta, curve: Curves.easeOutCubic)),
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

/// Mi tarea en su fecha de vencimiento: más compacta que un evento, con el
/// ícono en degradado del área y los puntos.
class _TarjetaMiTarea extends StatelessWidget {
  const _TarjetaMiTarea({required this.mia, required this.alAbrir});
  final MiTarea mia;
  final VoidCallback alAbrir;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final t = mia.tarea;
    final (degradado, sobre) = PivotPaleta.seccion(t.areaInfo.seccion, Theme.of(context).brightness);
    return Material(
      color: p.tarjeta,
      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        onTap: alAbrir,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              HeroOpcional(
                tag: 'tarea-${t.id}',
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip + 2)),
                  child: Icon(mia.enRevision ? Icons.hourglass_top_rounded : t.areaInfo.icono, size: 18, color: sobre),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tu tarea',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.marcaTexto),
                    ),
                    Text(
                      t.titulo,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.texto),
                    ),
                    if (mia.enRevision || mia.notaRechazo.isNotEmpty)
                      Text(mia.enRevision ? 'En revisión' : 'Con cambios pedidos', style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              PillPuntos(puntos: t.puntos),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tareas que tomaron otras personas y vencen ese día: una línea que se
/// despliega (así se ve que el equipo trabaja sin tapar los eventos).
class _GrupoTareas extends StatefulWidget {
  const _GrupoTareas({required this.tareas, required this.alAbrir});
  final List<Tarea> tareas;
  final ValueChanged<Tarea> alAbrir;

  @override
  State<_GrupoTareas> createState() => _GrupoTareasState();
}

class _GrupoTareasState extends State<_GrupoTareas> {
  bool _abierto = false;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final n = widget.tareas.length;
    return Material(
      color: Colors.transparent,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(PivotRadios.chip),
            onTap: () => setState(() => _abierto = !_abierto),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      n == 1 ? '1 tarea del equipo vence este día' : '$n tareas del equipo vencen este día',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: p.textoSecundario),
                    ),
                  ),
                  AnimatedRotation(
                    turns: _abierto ? 0.25 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: Icon(Icons.chevron_right_rounded, size: 20, color: p.textoSecundario),
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: !_abierto
                ? const SizedBox(width: double.infinity)
                : Container(
                    margin: const EdgeInsets.only(top: 4),
                    decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                    child: Column(
                      children: [for (final t in widget.tareas) FilaTarea(tarea: t, hero: false, alTocar: () => widget.alAbrir(t))],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Franja deslizable con las tareas para tomar (vista Tareas). La última
/// tarjeta abre el tablero completo.
class _FranjaParaTomar extends StatelessWidget {
  const _FranjaParaTomar({required this.tareas, required this.alAbrir, required this.alVerTodas});
  final List<Tarea> tareas;
  final ValueChanged<Tarea> alAbrir;
  final VoidCallback alVerTodas;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final maxPts = tareas.fold<int>(0, (a, t) => t.puntos > a ? t.puntos : a);
    final orden = [...tareas]..sort((a, b) => b.puntos.compareTo(a.puntos));
    Widget tarjeta({required Widget child, required VoidCallback alTocar, Color? color}) => SizedBox(
      width: 150,
      child: Material(
        color: color ?? p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: alTocar,
          child: Padding(padding: const EdgeInsets.all(12), child: child),
        ),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(
            'Para tomar · ${tareas.length == 1 ? '1 tarea' : '${tareas.length} tareas'}${maxPts > 0 ? ' · hasta +$maxPts' : ''}',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: p.textoSecundario),
          ),
        ),
        SizedBox(
          height: 112,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final t in orden.take(8)) ...[
                tarjeta(
                  alTocar: () => alAbrir(t),
                  child: Builder(
                    builder: (context) {
                      final (degradado, sobre) = PivotPaleta.seccion(t.areaInfo.seccion, Theme.of(context).brightness);
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 28,
                                height: 28,
                                decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip)),
                                child: Icon(t.areaInfo.icono, size: 16, color: sobre),
                              ),
                              const Spacer(),
                              PillPuntos(puntos: t.puntos),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            t.titulo,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: p.texto),
                          ),
                        ],
                      );
                    },
                  ),
                ),
                const SizedBox(width: 8),
              ],
              tarjeta(
                alTocar: alVerTodas,
                color: p.suave,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.view_list_rounded, color: p.sobreSuave),
                    const SizedBox(height: 6),
                    Text(
                      'Ver todas',
                      style: TextStyle(fontWeight: FontWeight.w700, color: p.sobreSuave),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
