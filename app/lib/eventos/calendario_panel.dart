import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';

/// Calendario del mes que se despliega hacia abajo desde la barra de Eventos
/// (como Google Calendar). Los meses son páginas que siguen al dedo al
/// deslizar; todas miden lo mismo (6 semanas, con los días de los meses
/// vecinos atenuados) para que la altura nunca salte. Los datos del mes
/// visible y sus vecinos se piden por adelantado, recién cuando el
/// deslizamiento termina, para no cortar la animación.
/// Como en Google Calendar: el panel sigue abierto al tocar un día, cambiar
/// de mes con el dedo lleva el timeline a ese mes y arrastrar hacia arriba
/// lo va cerrando con el dedo (el arrastre lo maneja quien lo contiene).
class PanelCalendario extends StatefulWidget {
  const PanelCalendario({
    super.key,
    required this.repo,
    required this.mesInicial,
    required this.alCambiarMes,
    required this.alElegirDia,
    required this.alMesElegido,
    required this.alArrastrar,
    required this.alSoltar,
    this.diaSeleccionado,
  });

  final EventosRepo repo;
  final DateTime mesInicial;
  final ValueChanged<DateTime> alCambiarMes;
  final ValueChanged<DateTime> alElegirDia;

  /// Mes al que la persona deslizó (no se llama cuando el cambio vino de
  /// `irAMes()`, para no rebotar con el timeline).
  final ValueChanged<DateTime> alMesElegido;
  final ValueChanged<double> alArrastrar;
  final ValueChanged<double> alSoltar;
  final DateTime? diaSeleccionado;

  static const altoCelda = 46.0;

  @override
  State<PanelCalendario> createState() => PanelCalendarioState();
}

class PanelCalendarioState extends State<PanelCalendario> {
  static final _base = DateTime(2000, 1);
  static int _indice(DateTime m) => (m.year - _base.year) * 12 + m.month - 1;
  static DateTime _mesDe(int i) => DateTime(_base.year, _base.month + i);

  late final PageController _paginas = PageController(initialPage: _indice(widget.mesInicial));
  late int _actual = _indice(widget.mesInicial);
  final _clavesPills = <int, GlobalKey>{};
  bool _arrastreDelUsuario = false;

  static const _cabecera = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  @override
  void initState() {
    super.initState();
    // Después del primer cuadro: pedir datos notifica al repo y no puede pasar en medio de un build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _precargar();
        _mostrarPill(animado: false);
      }
    });
  }

  @override
  void dispose() {
    _paginas.dispose();
    super.dispose();
  }

  void _precargar() {
    final m = _mesDe(_actual);
    widget.repo.asegurarRango(DateTime(m.year, m.month - 1, 1), DateTime(m.year, m.month + 2, 0));
  }

  /// Mantiene a la vista (centrada) la pill del mes actual del panel.
  void _mostrarPill({bool animado = true}) {
    final ctx = _clavesPills[_actual]?.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(ctx, alignment: 0.5, duration: animado ? const Duration(milliseconds: 300) : Duration.zero, curve: Curves.easeOutCubic);
  }

  /// Tocar una pill: el panel y el timeline van a ese mes.
  void _elegirPill(int i) {
    irAMes(_mesDe(i));
    widget.alMesElegido(_mesDe(i));
  }

  /// Lleva el panel a un mes con animación (botón "Hoy", desplazamiento del timeline).
  void irAMes(DateTime mes) {
    final i = _indice(mes);
    if (!_paginas.hasClients || i == _actual || _arrastreDelUsuario) return;
    if ((i - _actual).abs() > 3) {
      _paginas.jumpToPage(i);
    } else {
      _paginas.animateToPage(i, duration: const Duration(milliseconds: 380), curve: Curves.easeInOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return GestureDetector(
      // Arrastrar en vertical abre/cierra siguiendo al dedo.
      onVerticalDragUpdate: (d) => widget.alArrastrar(d.delta.dy),
      onVerticalDragEnd: (d) => widget.alSoltar(d.primaryVelocity ?? 0),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                for (final c in _cabecera)
                  Expanded(
                    child: Center(
                      child: Text(
                        c,
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.textoSecundario),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: PanelCalendario.altoCelda * 6,
              child: NotificationListener<ScrollNotification>(
                onNotification: (n) {
                  if (n is ScrollStartNotification && n.dragDetails != null) _arrastreDelUsuario = true;
                  if (n is ScrollEndNotification) {
                    _precargar();
                    if (_arrastreDelUsuario) {
                      _arrastreDelUsuario = false;
                      widget.alMesElegido(_mesDe(_actual));
                    }
                  }
                  return false;
                },
                child: PageView.builder(
                  controller: _paginas,
                  onPageChanged: (i) {
                    setState(() => _actual = i);
                    widget.alCambiarMes(_mesDe(i));
                    WidgetsBinding.instance.addPostFrameCallback((_) => _mostrarPill());
                  },
                  itemBuilder: (context, i) => ListenableBuilder(
                    listenable: widget.repo,
                    builder: (context, _) => _Mes(mes: _mesDe(i), repo: widget.repo, tocado: widget.diaSeleccionado, alTocar: widget.alElegirDia),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              alignment: WrapAlignment.center,
              children: [
                _leyenda(p, relleno: p.marca, borde: p.marca, texto: 'Asistirás'),
                _leyenda(p, relleno: p.fondo, borde: p.marca, texto: 'Sin responder'),
                _leyenda(p, relleno: p.apagadoPunto, borde: p.apagadoPunto, texto: 'Cancelado / no vas'),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🎈', style: TextStyle(fontSize: 11)),
                    const SizedBox(width: 4),
                    Text('Cumpleaños', style: TextStyle(fontSize: 12, color: p.textoSecundario)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            _filaPills(p),
          ],
        ),
      ),
    );
  }

  /// Pills de meses (como la web y Google Calendar): un año atrás y año y
  /// medio adelante, con el número de año antes de cada enero.
  Widget _filaPills(PivotPaleta p) {
    final hoy = Fechas.hoy();
    final desde = _indice(DateTime(hoy.year - 1, hoy.month));
    final hasta = _indice(DateTime(hoy.year + 1, hoy.month + 6));
    final hijos = <Widget>[];
    for (var i = desde; i <= hasta; i++) {
      final m = _mesDe(i);
      if (m.month == 1 || i == desde) {
        hijos.add(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Center(
              child: Text(
                '${m.year}',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.textoSecundario),
              ),
            ),
          ),
        );
      }
      final activo = i == _actual;
      hijos.add(
        Padding(
          key: _clavesPills.putIfAbsent(i, GlobalKey.new),
          padding: const EdgeInsets.symmetric(horizontal: 3),
          child: Material(
            color: activo ? p.marca : p.tarjeta,
            borderRadius: BorderRadius.circular(PivotRadios.boton),
            child: InkWell(
              borderRadius: BorderRadius.circular(PivotRadios.boton),
              onTap: () => _elegirPill(i),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Center(
                  child: Text(
                    Fechas.mes(m).substring(0, 3),
                    style: TextStyle(fontSize: 14, fontWeight: activo ? FontWeight.w700 : FontWeight.w500, color: activo ? p.sobreMarca : p.texto),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }
    return SizedBox(
      height: 36,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: hijos),
      ),
    );
  }

  Widget _leyenda(PivotPaleta p, {required Color relleno, required Color borde, required String texto}) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(
            color: relleno,
            shape: BoxShape.circle,
            border: Border.all(color: borde, width: 1.5),
          ),
        ),
        const SizedBox(width: 6),
        Text(texto, style: TextStyle(fontSize: 12, color: p.textoSecundario)),
      ],
    );
  }
}

/// Una página: 6 semanas fijas que empiezan el lunes de la semana del día 1.
class _Mes extends StatelessWidget {
  const _Mes({required this.mes, required this.repo, required this.tocado, required this.alTocar});
  final DateTime mes;
  final EventosRepo repo;
  final DateTime? tocado;
  final ValueChanged<DateTime> alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final hoy = Fechas.hoy();
    final inicio = Fechas.lunesDe(DateTime(mes.year, mes.month, 1));
    final fin = inicio.add(const Duration(days: 42));
    final porDia = <DateTime, List<Evento>>{};
    for (final e in repo.eventos) {
      if (!e.fecha.isBefore(inicio) && e.fecha.isBefore(fin)) porDia.putIfAbsent(Fechas.soloDia(e.fecha), () => []).add(e);
    }
    final cumples = {
      for (final c in repo.cumples)
        if (!c.fecha.isBefore(inicio) && c.fecha.isBefore(fin)) Fechas.soloDia(c.fecha),
    };
    return Column(
      children: [
        for (var s = 0; s < 6; s++)
          SizedBox(
            height: PanelCalendario.altoCelda,
            child: Row(
              children: [
                for (var d = 0; d < 7; d++) Expanded(child: _celda(p, DateTime(inicio.year, inicio.month, inicio.day + s * 7 + d), porDia, cumples, hoy)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _celda(PivotPaleta p, DateTime dia, Map<DateTime, List<Evento>> porDia, Set<DateTime> cumples, DateTime hoy) {
    final ajeno = dia.month != mes.month;
    final eventos = porDia[dia] ?? const <Evento>[];
    final cumple = cumples.contains(dia);
    final esHoy = dia == hoy;
    final marcado = tocado == dia;
    final tieneAlgo = eventos.isNotEmpty || cumple;

    Widget puntoDe(Evento e) {
      final Color relleno, borde;
      if (e.cancelado || e.miEstado == EstadoRsvp.noAsistire) {
        relleno = p.apagadoPunto;
        borde = p.apagadoPunto;
      } else if (e.miEstado != null) {
        relleno = p.marca;
        borde = p.marca;
      } else {
        relleno = p.fondo;
        borde = p.marca;
      }
      return Container(
        width: 6,
        height: 6,
        margin: const EdgeInsets.symmetric(horizontal: 1),
        decoration: BoxDecoration(
          color: relleno,
          shape: BoxShape.circle,
          border: Border.all(color: borde, width: 1.5),
        ),
      );
    }

    final firma = '${eventos.map((e) => '${e.id}${e.miEstado?.valor}${e.cancelado}').join()}$cumple';
    return Opacity(
      opacity: ajeno ? 0.38 : 1,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => alTocar(dia),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: esHoy ? p.marca : (marcado ? p.suave : null),
                    shape: BoxShape.circle,
                    border: marcado && esHoy ? Border.all(color: p.sobreSuave, width: 2) : null,
                  ),
                  child: Text(
                    '${dia.day}',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: tieneAlgo || esHoy ? FontWeight.w700 : FontWeight.w400,
                      color: esHoy ? p.sobreMarca : (marcado ? p.sobreSuave : (tieneAlgo ? p.texto : p.textoSecundario)),
                    ),
                  ),
                ),
                // Cumpleaños: globo a color en la esquina del número (un emoji
                // se reconoce mucho mejor que un ícono de una línea a este tamaño).
                if (cumple) const Positioned(right: -7, top: -6, child: Text('🎈', style: TextStyle(fontSize: 13, height: 1))),
              ],
            ),
            const SizedBox(height: 2),
            SizedBox(
              height: 7,
              // Los puntos aparecen con un fundido cuando llegan los datos.
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: Row(key: ValueKey(firma), mainAxisAlignment: MainAxisAlignment.center, children: [for (final e in eventos.take(3)) puntoDe(e)]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
