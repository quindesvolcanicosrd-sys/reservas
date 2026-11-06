import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import 'eventos_repo.dart';
import 'modelos.dart';
import 'widgets_comunes.dart';

class DetalleScreen extends StatefulWidget {
  const DetalleScreen({super.key, required this.repo, required this.eventoId, this.abrirCancelar = false});
  final EventosRepo repo;
  final String eventoId;

  /// Llega desde el botón "Cancelar entrenamiento" de una notificación:
  /// abre la confirmación apenas carga el evento (nunca cancela sola).
  final bool abrirCancelar;

  @override
  State<DetalleScreen> createState() => _DetalleScreenState();
}

class _DetalleScreenState extends State<DetalleScreen> {
  EventosRepo get repo => widget.repo;
  String get eventoId => widget.eventoId;
  bool _confirmacionPedida = false;

  @override
  void initState() {
    super.initState();
    if (repo.porId(eventoId) == null) repo.cargar(forzar: true);
  }

  bool _puedeCancelar(Evento ev) => repo.sesion.esAdmin && repo.sesion.adminToken != null && !ev.cancelado && !ev.yaEmpezo;

  Future<void> _confirmarCancelar(Evento ev) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('¿Cancelar el ${ev.tipo.toLowerCase()}?'),
        content: Text('${Fechas.encabezado(ev.fecha)} · ${ev.rangoHorario}\nSe avisará a todo el equipo.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('No, mantenerlo')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sí, cancelar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final mensajero = ScaffoldMessenger.of(context);
    try {
      await repo.cancelar(ev);
      mensajero.showSnackBar(const SnackBar(content: Text('Evento cancelado. Se avisó al equipo.')));
    } catch (e) {
      mensajero.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final ev = repo.porId(eventoId);
        if (ev == null) {
          return Scaffold(
            appBar: AppBar(),
            body: Center(
              child: repo.cargando
                  ? const CircularProgressIndicator()
                  : const Padding(padding: EdgeInsets.all(32), child: Text('No encontramos este evento. Puede que lo hayan eliminado.')),
            ),
          );
        }
        if (widget.abrirCancelar && !_confirmacionPedida) {
          _confirmacionPedida = true;
          if (_puedeCancelar(ev)) {
            WidgetsBinding.instance.addPostFrameCallback((_) => _confirmarCancelar(ev));
          } else if (ev.cancelado) {
            WidgetsBinding.instance.addPostFrameCallback((_) =>
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Este evento ya está cancelado.'))));
          }
        }
        return Scaffold(
          appBar: AppBar(actions: [
            if (_puedeCancelar(ev))
              PopupMenuButton<String>(
                tooltip: 'Más opciones',
                onSelected: (_) => _confirmarCancelar(ev),
                itemBuilder: (_) => const [PopupMenuItem(value: 'cancelar', child: Text('Cancelar evento'))],
              ),
          ]),
          body: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              _cabecera(context, ev),
              _info(context, ev),
              _tuAsistencia(context, ev),
              _equipo(context, ev),
            ],
          ),
        );
      },
    );
  }

  Widget _cabecera(BuildContext context, Evento ev) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(Fechas.encabezado(ev.fecha), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: PivotColores.marcaOscura)),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: Text(ev.tipo,
                style: t.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                  decoration: ev.cancelado ? TextDecoration.lineThrough : null,
                  color: ev.cancelado ? PivotColores.cancelado : null,
                )),
          ),
          if (ev.cancelado) Etiqueta(texto: textoEstadoEvento(ev), fondo: PivotColores.canceladoEtiqueta, color: PivotColores.texto),
        ]),
      ]),
    );
  }

  Widget _info(BuildContext context, Evento ev) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(children: [
        _filaInfo(Icons.schedule_rounded, ev.rangoHorario, null),
        _filaInfo(
          Icons.place_outlined,
          ev.lugar,
          ev.mapsUrl.isEmpty
              ? null
              : TextButton(onPressed: () => launchUrl(Uri.parse(ev.mapsUrl), mode: LaunchMode.externalApplication), child: const Text('Cómo llegar')),
        ),
        if (ev.descripcion.trim().isNotEmpty) _filaInfo(Icons.info_outline_rounded, ev.descripcion.trim(), null),
      ]),
    );
  }

  Widget _filaInfo(IconData icono, String texto, Widget? accion) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Icon(icono, color: PivotColores.textoSecundario),
        const SizedBox(width: 16),
        Expanded(child: Text(texto, style: const TextStyle(fontSize: 15, height: 1.4))),
        ?accion,
      ]),
    );
  }

  Widget _tuAsistencia(BuildContext context, Evento ev) {
    final bloqueado = ev.cancelado || ev.yaEmpezo;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: PivotColores.superficieTarjeta, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Tu asistencia', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: SegmentedButton<EstadoRsvp>(
            showSelectedIcon: true,
            emptySelectionAllowed: true,
            segments: const [
              ButtonSegment(value: EstadoRsvp.asistire, label: Text('Asistiré')),
              ButtonSegment(value: EstadoRsvp.noAsistire, label: Text('No asistiré')),
              ButtonSegment(value: EstadoRsvp.noJugador, label: Text('No jugador')),
            ],
            selected: {?ev.miEstado},
            onSelectionChanged: bloqueado
                ? null
                : (sel) async {
                    if (sel.isEmpty) return;
                    final mensajero = ScaffoldMessenger.of(context);
                    try {
                      await repo.marcar(ev, sel.first);
                    } catch (e) {
                      mensajero.showSnackBar(SnackBar(content: Text(e.toString())));
                    }
                  },
          ),
        ),
        const SizedBox(height: 10),
        Text(
          ev.cancelado
              ? 'Este evento fue cancelado.'
              : ev.yaEmpezo
                  ? 'El evento ya empezó; la asistencia la toma un admin.'
                  : 'Puedes cambiarla hasta que empiece el evento.',
          style: const TextStyle(fontSize: 13, color: PivotColores.textoSecundario),
        ),
      ]),
    );
  }

  Widget _equipo(BuildContext context, Evento ev) {
    final grupos = [
      (EstadoRsvp.asistire, 'Asistirán'),
      (EstadoRsvp.noJugador, 'No jugador'),
      (EstadoRsvp.noAsistire, 'No asistirán'),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Text('Asistencia del equipo', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 12),
        Row(children: [
          for (final (i, g) in grupos.indexed) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: _contador(ev.con(g.$1).length, g.$2, destacado: i == 0)),
          ],
        ]),
        for (final g in grupos)
          if (ev.con(g.$1).isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 20, 8, 4),
              child: Text(g.$2, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: PivotColores.textoSecundario)),
            ),
            for (final r in ev.con(g.$1))
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Row(children: [
                  AvatarPersona(nombre: r.persona.nombreMostrar, foto: r.persona.fotoPerfil),
                  const SizedBox(width: 14),
                  Expanded(child: Text(r.persona.nombreMostrar, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
                ]),
              ),
          ],
      ]),
    );
  }

  Widget _contador(int n, String etiqueta, {bool destacado = false}) {
    final color = destacado ? PivotColores.sobreContenedorSuave : PivotColores.texto;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      decoration: BoxDecoration(
        color: destacado ? PivotColores.contenedorSuave : PivotColores.canceladoFondo,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(children: [
        Text('$n', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color)),
        Text(etiqueta, style: TextStyle(fontSize: 11, color: destacado ? color : PivotColores.textoSecundario)),
      ]),
    );
  }
}
