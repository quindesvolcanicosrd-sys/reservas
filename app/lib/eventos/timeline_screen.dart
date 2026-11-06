import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'detalle_screen.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'widgets_comunes.dart';

/// Timeline vertical de Eventos (maqueta aprobada 2026-11-06): fecha a la
/// izquierda, línea continua con un punto por evento, marca de "ahora" y
/// separadores por semana.
class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key, required this.repo, required this.nombreParaAvatar, required this.fotoParaAvatar});
  final EventosRepo repo;
  final String nombreParaAvatar;
  final String fotoParaAvatar;

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

/// Un elemento del día: evento o cumpleaños.
class _Item {
  _Item.evento(this.evento) : cumple = null;
  _Item.cumple(this.cumple) : evento = null;
  final Evento? evento;
  final Cumple? cumple;
}

class _TimelineScreenState extends State<TimelineScreen> {
  bool _verAnteriores = false;

  static const _anchoFecha = 52.0;
  static const _anchoRiel = 28.0;

  @override
  void initState() {
    super.initState();
    widget.repo.cargar();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.repo,
      builder: (context, _) => Scaffold(
        body: SafeArea(
          bottom: false,
          child: RefreshIndicator(
            onRefresh: () => widget.repo.cargar(forzar: true),
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(child: _encabezado(context)),
                ..._cuerpo(context),
                const SliverToBoxAdapter(child: SizedBox(height: 96)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _encabezado(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 16, 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('Eventos', style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4))),
          AvatarPersona(nombre: widget.nombreParaAvatar, foto: widget.fotoParaAvatar, tamano: 36),
        ]),
        const SizedBox(height: 12),
        Wrap(spacing: 8, children: [
          FilterChip(
            label: Text(Fechas.mesAnio(Fechas.hoy())),
            selected: !_verAnteriores,
            showCheckmark: false,
            onSelected: (_) => setState(() => _verAnteriores = false),
          ),
          FilterChip(
            label: const Text('Anteriores'),
            selected: _verAnteriores,
            showCheckmark: false,
            onSelected: (_) => setState(() => _verAnteriores = !_verAnteriores),
          ),
        ]),
      ]),
    );
  }

  List<Widget> _cuerpo(BuildContext context) {
    final repo = widget.repo;
    if (repo.cargando && repo.eventos.isEmpty) {
      return [const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))];
    }
    if (repo.error != null && repo.eventos.isEmpty) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(repo.error!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                OutlinedButton(onPressed: () => repo.cargar(forzar: true), child: const Text('Reintentar')),
              ]),
            ),
          ),
        ),
      ];
    }

    final hoy = Fechas.hoy();
    final porDia = <DateTime, List<_Item>>{};
    for (final e in repo.eventos) {
      porDia.putIfAbsent(Fechas.soloDia(e.fecha), () => []).add(_Item.evento(e));
    }
    for (final c in repo.cumples) {
      porDia.putIfAbsent(Fechas.soloDia(c.fecha), () => []).add(_Item.cumple(c));
    }
    porDia.putIfAbsent(hoy, () => []);
    final dias = porDia.keys.where((d) => _verAnteriores ? d.isBefore(hoy) : !d.isBefore(hoy)).toList()..sort();
    if (_verAnteriores) dias.sort((a, b) => b.compareTo(a));

    final filas = <Widget>[];
    DateTime? lunesPrevio;
    for (final dia in dias) {
      final lunes = Fechas.lunesDe(dia);
      if (lunesPrevio != null && lunes != lunesPrevio) filas.add(_separadorSemana(lunes));
      lunesPrevio = lunes;
      filas.addAll(_filasDelDia(dia, porDia[dia]!, dia == hoy));
    }
    if (_verAnteriores && dias.isEmpty) {
      filas.add(const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No hay eventos en los últimos 30 días.'))));
    }

    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
        sliver: SliverList.list(children: filas),
      ),
    ];
  }

  List<Widget> _filasDelDia(DateTime dia, List<_Item> items, bool esHoy) {
    items.sort((a, b) {
      final ha = a.evento?.horaInicio ?? '00:00', hb = b.evento?.horaInicio ?? '00:00';
      return ha.compareTo(hb);
    });
    final filas = <Widget>[];
    var primera = true;
    var ahoraPuesto = !esHoy;
    final ahora = Fechas.hora(Fechas.ahoraEcuador());
    for (final it in items) {
      if (!ahoraPuesto && (it.evento?.horaInicio ?? '00:00').compareTo(ahora) > 0) {
        filas.add(_fila(dia: primera ? dia : null, esHoy: esHoy, punto: null, hijo: _lineaAhora(ahora)));
        primera = false;
        ahoraPuesto = true;
      }
      filas.add(_fila(dia: primera ? dia : null, esHoy: esHoy, punto: _punto(it), hijo: _tarjeta(it)));
      primera = false;
    }
    if (!ahoraPuesto) {
      filas.add(_fila(
        dia: primera ? dia : null,
        esHoy: esHoy,
        punto: null,
        hijo: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _lineaAhora(ahora),
          if (items.isEmpty || items.every((i) => i.evento == null || i.evento!.yaEmpezo))
            const Padding(
              padding: EdgeInsets.only(top: 10, bottom: 8),
              child: Text('Sin más eventos hoy', style: TextStyle(fontSize: 14, color: PivotColores.textoSecundario)),
            ),
        ]),
      ));
    }
    return filas;
  }

  Widget _fila({required DateTime? dia, required bool esHoy, required Widget? punto, required Widget hijo}) {
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(width: _anchoFecha, child: dia == null ? null : _columnaFecha(dia, esHoy)),
        SizedBox(
          width: _anchoRiel,
          child: Stack(children: [
            Positioned(left: 13, top: 0, bottom: 0, child: Container(width: 2, color: PivotColores.lineaTimeline)),
            if (punto != null) Positioned(left: 7, top: 18, child: punto),
          ]),
        ),
        Expanded(child: Padding(padding: const EdgeInsets.only(top: 4, bottom: 14), child: hijo)),
      ]),
    );
  }

  Widget _columnaFecha(DateTime dia, bool esHoy) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(children: [
        Text(Fechas.diaCorto(dia),
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: esHoy ? PivotColores.marcaOscura : PivotColores.textoSecundario)),
        const SizedBox(height: 2),
        esHoy
            ? Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(color: PivotColores.marca, shape: BoxShape.circle),
                alignment: Alignment.center,
                child: Text('${dia.day}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: PivotColores.blanco)),
              )
            : Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('${dia.day}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
              ),
      ]),
    );
  }

  Widget _separadorSemana(DateTime lunes) {
    return _fila(
      dia: null,
      esHoy: false,
      punto: null,
      hijo: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(Fechas.rangoSemana(lunes),
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: PivotColores.textoSecundario)),
      ),
    );
  }

  Widget _lineaAhora(String hora) {
    return Transform.translate(
      offset: const Offset(-22, 0),
      child: Row(children: [
        Container(width: 12, height: 12, decoration: const BoxDecoration(color: PivotColores.marca, shape: BoxShape.circle)),
        Expanded(child: Container(height: 2, color: PivotColores.marca)),
        Padding(
          padding: const EdgeInsets.only(left: 6),
          child: Text(hora, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: PivotColores.marcaOscura)),
        ),
      ]),
    );
  }

  Widget _punto(_Item it) {
    final ev = it.evento;
    if (ev == null) {
      return Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(color: PivotColores.fondo, shape: BoxShape.circle, border: Border.all(color: PivotColores.lineaTimeline, width: 2.5)),
      );
    }
    if (ev.cancelado || ev.miEstado == EstadoRsvp.noAsistire) {
      return Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(color: PivotColores.canceladoPunto, shape: BoxShape.circle, border: Border.all(color: PivotColores.fondo, width: 2)),
      );
    }
    if (ev.miEstado != null) {
      return Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(color: PivotColores.marca, shape: BoxShape.circle, border: Border.all(color: PivotColores.fondo, width: 2)),
      );
    }
    return Container(
      width: 14,
      height: 14,
      decoration: BoxDecoration(color: PivotColores.fondo, shape: BoxShape.circle, border: Border.all(color: PivotColores.marca, width: 2.5)),
    );
  }

  Widget _tarjeta(_Item it) {
    if (it.cumple != null) return _TarjetaCumple(cumple: it.cumple!);
    return _TarjetaEvento(
      evento: it.evento!,
      repo: widget.repo,
      alAbrir: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => DetalleScreen(repo: widget.repo, eventoId: it.evento!.id),
      )),
    );
  }
}

class _TarjetaEvento extends StatelessWidget {
  const _TarjetaEvento({required this.evento, required this.repo, required this.alAbrir});
  final Evento evento;
  final EventosRepo repo;
  final VoidCallback alAbrir;

  @override
  Widget build(BuildContext context) {
    final ev = evento;
    final apagado = ev.cancelado;
    final colorSecundario = apagado ? PivotColores.cancelado : PivotColores.textoSecundario;
    final pedirRespuesta = !apagado && ev.miEstado == null && !ev.yaEmpezo;
    return Material(
      color: apagado ? PivotColores.canceladoFondo : PivotColores.superficieTarjeta,
      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        onTap: alAbrir,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(ev.rangoHorario,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: apagado ? PivotColores.cancelado : PivotColores.marcaOscura)),
                  const SizedBox(height: 3),
                  Text(ev.tipo,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: apagado ? PivotColores.cancelado : PivotColores.texto,
                        decoration: apagado ? TextDecoration.lineThrough : null,
                      )),
                  const SizedBox(height: 3),
                  Text(
                    apagado || ev.cantidadAsisten == 0
                        ? ev.lugar
                        : '${ev.lugar} · ${ev.cantidadAsisten} ${ev.cantidadAsisten == 1 ? 'asistirá' : 'asistirán'}',
                    style: TextStyle(fontSize: 13, color: colorSecundario),
                  ),
                ]),
              ),
              if (apagado)
                Etiqueta(texto: textoEstadoEvento(ev), fondo: PivotColores.canceladoEtiqueta, color: PivotColores.texto)
              else if (ev.miEstado != null)
                Etiqueta(texto: textoMiEstado(ev.miEstado!), icono: iconoMiEstado(ev.miEstado!)),
            ]),
            AnimatedSize(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              child: pedirRespuesta
                  ? Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Row(children: [
                        Expanded(child: FilledButton(onPressed: () => _marcar(context, EstadoRsvp.asistire), child: const Text('Asistiré'))),
                        const SizedBox(width: 8),
                        Expanded(child: OutlinedButton(onPressed: () => _marcar(context, EstadoRsvp.noAsistire), child: const Text('No asistiré'))),
                      ]),
                    )
                  : const SizedBox(width: double.infinity),
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _marcar(BuildContext context, EstadoRsvp estado) async {
    final mensajero = ScaffoldMessenger.of(context);
    try {
      await repo.marcar(evento, estado);
    } catch (e) {
      mensajero.showSnackBar(SnackBar(content: Text(e.toString().isEmpty ? 'No se pudo guardar tu asistencia.' : e.toString())));
    }
  }
}

class _TarjetaCumple extends StatelessWidget {
  const _TarjetaCumple({required this.cumple});
  final Cumple cumple;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: PivotColores.blanco,
        border: Border.all(color: PivotColores.lineaTimeline),
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      ),
      child: Row(children: [
        Container(
          width: 44,
          height: 44,
          decoration: const BoxDecoration(color: PivotColores.contenedorSuave, shape: BoxShape.circle),
          child: const Icon(Icons.cake_outlined, color: PivotColores.marcaOscura),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Cumpleaños de ${cumple.nombre}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(textoCumple(cumple, Fechas.hoy()), style: const TextStyle(fontSize: 13, color: PivotColores.textoSecundario)),
          ]),
        ),
      ]),
    );
  }
}
