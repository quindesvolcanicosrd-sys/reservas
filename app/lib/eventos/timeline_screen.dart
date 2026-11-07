import 'package:flutter/material.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'anticipada_screen.dart';
import 'calendario_panel.dart';
import 'crear_evento_screen.dart';
import 'detalle_screen.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'widgets_comunes.dart';

/// Timeline de Eventos (maqueta aprobada + pedido 2026-11-06):
/// - Barra: "Noviembre ⌄" despliega el calendario del mes hacia abajo (como
///   Google Calendar; tocar un día lleva a ese punto del timeline), buscador
///   con filtros, "Hoy" y asistencia anticipada.
/// - Botón "+" (admins): nuevo evento.
/// - Fecha a la izquierda, línea con un punto por evento, marca de "ahora",
///   separadores por semana.
class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key, required this.repo});
  final EventosRepo repo;

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _Item {
  _Item.evento(this.evento) : cumple = null;
  _Item.cumple(this.cumple) : evento = null;
  final Evento? evento;
  final Cumple? cumple;
  DateTime get fecha => evento?.fecha ?? cumple!.fecha;
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

class _TimelineScreenState extends State<TimelineScreen> with SingleTickerProviderStateMixin {
  final _scroll = ItemScrollController();
  final _posiciones = ItemPositionsListener.create();
  final _textoBusqueda = TextEditingController();
  final _focoBusqueda = FocusNode();

  bool _buscando = false;
  String _consulta = '';
  String? _filtroLugar;
  String? _filtroTipo;
  DateTime _mesVisible = Fechas.hoy();
  bool _calAbierto = false;
  bool _calMontado = false;
  DateTime _mesPanel = Fechas.hoy();
  final _panel = GlobalKey<PanelCalendarioState>();
  late final AnimationController _calCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 320));
  late final Animation<double> _calCurva = CurvedAnimation(parent: _calCtrl, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);

  // Ancla del timeline: al llegar datos nuevos (por ejemplo, un mes anterior
  // pedido desde el calendario) se agregan filas ARRIBA y la lista saltaría.
  // Se guarda qué fila estaba arriba y se vuelve a ella sin animación.
  Object? _firmaDatos;
  bool _desplazandoProgramado = false;
  List<_Fila> _filas = const [];
  bool _saltoInicialHecho = false;

  static const _anchoFecha = 52.0;
  static const _anchoRiel = 28.0;

  EventosRepo get repo => widget.repo;

  @override
  void initState() {
    super.initState();
    repo.cargar();
    _posiciones.itemPositions.addListener(_alDesplazar);
  }

  @override
  void dispose() {
    _posiciones.itemPositions.removeListener(_alDesplazar);
    _calCtrl.dispose();
    _textoBusqueda.dispose();
    _focoBusqueda.dispose();
    super.dispose();
  }

  void _alDesplazar() {
    final pos = _posiciones.itemPositions.value.where((p) => p.itemTrailingEdge > 0).toList();
    if (pos.isEmpty || _filas.isEmpty) return;
    pos.sort((a, b) => a.index.compareTo(b.index));
    final i = pos.first.index.clamp(0, _filas.length - 1);
    final d = _filas[i].dia;
    if (d.month != _mesVisible.month || d.year != _mesVisible.year) setState(() => _mesVisible = d);
  }

  // ─── Filtros ────────────────────────────────────────────────────────────

  bool _coincideTexto(_Item it) {
    final q = _consulta.trim().toLowerCase();
    if (q.isEmpty) return true;
    final ev = it.evento;
    final texto = ev != null
        ? '${ev.tipo} ${ev.lugar} ${ev.descripcion} ${textoEstadoEvento(ev)} ${Fechas.encabezado(ev.fecha)} ${Fechas.mes(ev.fecha)}'
        : 'cumpleaños ${it.cumple!.nombre} ${Fechas.mes(it.cumple!.fecha)}';
    return q.split(RegExp(r'\s+')).every((palabra) => texto.toLowerCase().contains(palabra));
  }

  bool _pasaFiltros(_Item it) {
    if (!_coincideTexto(it)) return false;
    final ev = it.evento;
    if (_filtroLugar != null && ev?.lugar != _filtroLugar) return false;
    if (_filtroTipo != null) {
      if (_filtroTipo == 'Cumpleaños') return it.cumple != null;
      if (ev?.tipo != _filtroTipo) return false;
    }
    return true;
  }

  bool get _hayFiltros => _consulta.trim().isNotEmpty || _filtroLugar != null || _filtroTipo != null;

  List<_Item> _todos() => [for (final e in repo.eventos) _Item.evento(e), for (final c in repo.cumples) _Item.cumple(c)];

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
    var hayCumples = false;
    for (final it in _todos()) {
      if (!_coincideTexto(it)) continue;
      final ev = it.evento;
      if (ev == null) {
        hayCumples = true;
        continue;
      }
      if (_filtroLugar != null && _filtroLugar != ev.lugar) continue;
      s.add(ev.tipo);
    }
    return [...(s.toList()..sort()), if (hayCumples && _filtroLugar == null) 'Cumpleaños'];
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

  void _abrirCalendario() {
    setState(() {
      _calAbierto = true;
      _calMontado = true;
      _mesPanel = _mesVisible;
    });
    _calCtrl.forward();
  }

  void _cerrarCalendario() {
    if (!_calAbierto) return;
    setState(() => _calAbierto = false);
    _calCtrl.reverse().whenComplete(() {
      if (mounted && !_calAbierto) setState(() => _calMontado = false);
    });
  }

  Future<void> _elegirDia(DateTime dia) async {
    _cerrarCalendario();
    if (_hayFiltros || _buscando) {
      setState(() {
        _buscando = false;
        _limpiarFiltros();
      });
    }
    // Normalmente el mes ya está precargado: el desplazamiento arranca junto
    // con el cierre del panel, sin esperas.
    await repo.asegurarMes(dia);
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _irA(dia));
  }

  /// Identidad estable de una fila entre cargas.
  String _claveFila(_Fila f) =>
      '${Fechas.iso(f.dia)}|${f.semana != null ? 's' : ''}|${f.ahora ? 'a' : ''}|${f.item?.evento?.id ?? f.item?.cumple?.nombre ?? ''}';

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
        _filas = _armarFilas();
        final firma = Object.hash(identityHashCode(repo.eventos), identityHashCode(repo.cumples));
        if (_firmaDatos != null && firma != _firmaDatos && _saltoInicialHecho) _mantenerAncla(antes, _filas);
        _firmaDatos = firma;
        if (!_saltoInicialHecho && repo.eventos.isNotEmpty && !_hayFiltros) {
          _saltoInicialHecho = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => _irA(Fechas.hoy(), animado: false));
        }
        return Scaffold(
          floatingActionButton: _esAdmin && !_buscando
              ? FloatingActionButton(tooltip: 'Nuevo evento', onPressed: _nuevoEvento, child: const Icon(Icons.add_rounded))
              : null,
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
                // Calendario: se despliega desde la barra (tamaño + fundido con
                // la misma curva) y sigue montado hasta terminar de cerrarse.
                if (_calMontado)
                  SizeTransition(
                    sizeFactor: _calCurva,
                    alignment: Alignment.topCenter,
                    child: FadeTransition(
                      opacity: _calCurva,
                      child: DecoratedBox(
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: context.pivot.tarjetaBorde))),
                        child: PanelCalendario(
                          key: _panel,
                          repo: repo,
                          mesInicial: _mesPanel,
                          alCambiarMes: (m) => setState(() => _mesPanel = m),
                          alElegirDia: _elegirDia,
                          alCerrar: _cerrarCalendario,
                        ),
                      ),
                    ),
                  ),
                Expanded(child: _cuerpo(context)),
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
    final mesTitulo = _calAbierto ? _mesPanel : _mesVisible;
    return Padding(
      key: const ValueKey('normal'),
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 4),
      child: Row(
        children: [
          TextButton(
            style: TextButton.styleFrom(foregroundColor: p.texto, padding: const EdgeInsets.symmetric(horizontal: 12)),
            onPressed: _alternarCalendario,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  transitionBuilder: (c, a) => FadeTransition(
                    opacity: a,
                    child: SlideTransition(position: Tween(begin: const Offset(0, 0.25), end: Offset.zero).animate(a), child: c),
                  ),
                  layoutBuilder: (actual, previos) => Stack(alignment: Alignment.centerLeft, children: [...previos, ?actual]),
                  child: Text(
                    mesTitulo.year == Fechas.hoy().year ? Fechas.mesNombre(mesTitulo) : Fechas.mesAnio(mesTitulo),
                    key: ValueKey('${mesTitulo.year}-${mesTitulo.month}'),
                    style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 4),
                AnimatedRotation(
                  turns: _calAbierto ? 0.5 : 0,
                  duration: const Duration(milliseconds: 320),
                  curve: Curves.easeOutCubic,
                  child: const Icon(Icons.keyboard_arrow_down_rounded),
                ),
              ],
            ),
          ),
          const Spacer(),
          IconButton(
            tooltip: 'Buscar',
            icon: const Icon(Icons.search_rounded),
            onPressed: () {
              _cerrarCalendario();
              setState(() => _buscando = true);
              WidgetsBinding.instance.addPostFrameCallback((_) => _focoBusqueda.requestFocus());
            },
          ),
          IconButton(
            tooltip: 'Ir a hoy',
            icon: const Icon(Icons.today_outlined),
            onPressed: () {
              if (_calAbierto) _panel.currentState?.irAMes(Fechas.hoy());
              _irA(Fechas.hoy());
            },
          ),
          if (repo.anticipada.disponible)
            IconButton(
              tooltip: 'Asistencia anticipada',
              icon: const Icon(Icons.event_repeat_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AnticipadaScreen(repo: repo))),
            ),
        ],
      ),
    );
  }

  Widget _barraBusqueda(BuildContext context) {
    final lugares = _opcionesLugar();
    final tipos = _opcionesTipo();
    return Padding(
      key: const ValueKey('busqueda'),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _textoBusqueda,
            focusNode: _focoBusqueda,
            textInputAction: TextInputAction.search,
            onChanged: (v) => setState(() => _consulta = v),
            decoration: InputDecoration(
              hintText: 'Busca por lugar, tipo, mes o persona',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: IconButton(
                tooltip: 'Cerrar búsqueda',
                icon: const Icon(Icons.close_rounded),
                onPressed: () {
                  FocusScope.of(context).unfocus();
                  setState(() {
                    _buscando = false;
                    _limpiarFiltros();
                  });
                  WidgetsBinding.instance.addPostFrameCallback((_) => _irA(Fechas.hoy(), animado: false));
                },
              ),
            ),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _chipFiltro(context, etiqueta: 'Lugar', valor: _filtroLugar, opciones: lugares, alElegir: (v) => setState(() => _filtroLugar = v)),
                const SizedBox(width: 8),
                _chipFiltro(context, etiqueta: 'Tipo', valor: _filtroTipo, opciones: tipos, alElegir: (v) => setState(() => _filtroTipo = v)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chipFiltro(
    BuildContext context, {
    required String etiqueta,
    required String? valor,
    required List<String> opciones,
    required ValueChanged<String?> alElegir,
  }) {
    return PopupMenuButton<String>(
      tooltip: etiqueta,
      onSelected: (v) => alElegir(v == '__todos' ? null : v),
      itemBuilder: (_) => [
        PopupMenuItem(value: '__todos', child: Text('Todos los ${etiqueta == 'Lugar' ? 'lugares' : 'tipos'}')),
        for (final o in opciones) PopupMenuItem(value: o, child: Text(o)),
      ],
      child: Chip(
        avatar: Icon(etiqueta == 'Lugar' ? Icons.place_outlined : Icons.category_outlined, size: 18),
        label: Row(mainAxisSize: MainAxisSize.min, children: [Text(valor ?? etiqueta), const Icon(Icons.arrow_drop_down_rounded, size: 20)]),
        backgroundColor: valor != null ? context.pivot.suave : null,
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
          child: Text(
            'No hay eventos que coincidan con la búsqueda.',
            textAlign: TextAlign.center,
            style: TextStyle(color: p.textoSecundario),
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => repo.cargar(forzar: true),
      child: ScrollablePositionedList.builder(
        itemScrollController: _scroll,
        itemPositionsListener: _posiciones,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(8, 4, 16, 96),
        itemCount: _filas.length,
        itemBuilder: (context, i) => _fila(context, _filas[i]),
      ),
    );
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
      contenido = f.item!.cumple != null
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

  Future<void> _nuevoEvento() async {
    _cerrarCalendario();
    final r = await Navigator.of(context).push<Object>(MaterialPageRoute(builder: (_) => CrearEventoScreen(repo: repo)));
    if (r == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Evento creado. Se avisó al equipo.')));
    if (r is DateTime) {
      setState(_limpiarFiltros);
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
    final asisten = ev.con(EstadoRsvp.asistire).map((r) => r.persona).toList();
    return Material(
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
                        Text(
                          ev.rangoHorario,
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: apagado ? p.apagado : p.marcaTexto),
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
                    Text('${asisten.length} ${asisten.length == 1 ? 'asistirá' : 'asistirán'}', style: TextStyle(fontSize: 12, color: p.textoSecundario)),
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
            ],
          ),
        ),
      ),
    );
  }
}

class _TarjetaCumple extends StatelessWidget {
  const _TarjetaCumple({required this.cumple});
  final Cumple cumple;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: p.fondo,
        border: Border.all(color: p.tarjetaBorde),
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: p.suave, shape: BoxShape.circle),
            child: Icon(Icons.cake_outlined, color: p.marcaTexto),
          ),
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
        ],
      ),
    );
  }
}
