import 'package:animations/animations.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import '../reservas/gestionar_reserva.dart';
import '../reservas/reserva_screen.dart';
import '../reservas/reservas_repo.dart';
import '../equipo/emergencia_screen.dart';
import '../equipo/equipo_modelos.dart';
import '../equipo/equipo_repo.dart';
import '../equipo/persona_screen.dart';
import 'editar_evento_screen.dart';
import 'eventos_repo.dart';
import 'tomar_asistencia_screen.dart';
import 'video_screen.dart';
import 'modelos.dart';
import 'widgets_comunes.dart';

/// Grupos de asistencia del detalle (mismo orden que la web).
enum _Grupo { asisten, noAsisten, noJugador, sinRespuesta }

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
  bool _confirmacionPedida = false;
  _Grupo _grupo = _Grupo.asisten;
  List<Persona>? _sinRespuesta;
  bool _cargandoSinRespuesta = false;

  bool get _esAdmin => repo.sesion.esAdmin && repo.sesion.adminToken != null;

  @override
  void initState() {
    super.initState();
    if (repo.porId(widget.eventoId) == null) repo.cargar(forzar: true);
    _cargarSinRespuesta();
  }

  Future<void> _cargarSinRespuesta() async {
    final ev = repo.porId(widget.eventoId);
    if (!_esAdmin || ev == null || ev.yaEmpezo) return;
    setState(() => _cargandoSinRespuesta = true);
    try {
      final lista = await repo.sinRespuesta(ev);
      if (mounted) setState(() => _sinRespuesta = lista);
    } catch (_) {
      // Sin este grupo el resto del detalle funciona igual (como en la web).
    } finally {
      if (mounted) setState(() => _cargandoSinRespuesta = false);
    }
  }

  void _emergencia(Persona per) {
    final eq = EquipoRepo.de(repo.sesion);
    final x = eq.persona(per.username) ?? Integrante({'username': per.username, 'nombreDerby': per.nombreDerby});
    EmergenciaScreen.abrir(context, eq, x);
  }

  void _avisar(String texto) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));

  // ─── Acciones de admin ──────────────────────────────────────────────────

  Future<void> _menuAdmin(Evento ev) async {
    final accion = await showModalBottomSheet<String>(
      context: context,
      builder: (c) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!ev.finalizado && !ev.cancelado)
              ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('Editar evento'), onTap: () => Navigator.pop(c, 'editar')),
            if (!ev.cancelado)
              ListTile(leading: const Icon(Icons.event_busy_outlined), title: const Text('Cancelar evento'), onTap: () => Navigator.pop(c, 'cancelar')),
            ListTile(
              leading: Icon(Icons.delete_outline_rounded, color: c.pivot.marcaTexto),
              title: Text('Eliminar evento', style: TextStyle(color: c.pivot.marcaTexto)),
              onTap: () => Navigator.pop(c, 'eliminar'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (!mounted || accion == null) return;
    switch (accion) {
      case 'editar':
        final guardado = await Navigator.of(context).push<bool>(
          MaterialPageRoute(
            builder: (_) => EditarEventoScreen(repo: repo, evento: ev),
          ),
        );
        if (guardado == true) _avisar('Cambios guardados. Se avisó al equipo.');
      case 'cancelar':
        await _confirmarCancelar(ev);
      case 'eliminar':
        await _confirmarEliminar(ev);
    }
  }

  Future<bool> _confirmar({required String titulo, required String texto, required String si}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(titulo),
        content: Text(texto),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(si)),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _confirmarCancelar(Evento ev) async {
    final ok = await _confirmar(
      titulo: '¿Cancelar el ${ev.tipo.toLowerCase()}?',
      texto:
          '${Fechas.encabezado(ev.fecha)} · ${ev.rangoHorario}\n${ev.finalizado ? 'El evento ya pasó: no se avisará al equipo.' : 'Se avisará a todo el equipo.'}',
      si: 'Sí, cancelar',
    );
    if (!ok || !mounted) return;
    try {
      await repo.cancelar(ev);
      _avisar(ev.finalizado ? 'Evento cancelado.' : 'Evento cancelado. Se avisó al equipo.');
    } catch (e) {
      _avisar(e.toString());
    }
  }

  Future<void> _confirmarEliminar(Evento ev) async {
    final ok = await _confirmar(
      titulo: '¿Eliminar el evento?',
      texto: 'Se borrará definitivamente, junto con sus respuestas de asistencia. Esta acción no se puede deshacer.',
      si: 'Eliminar definitivamente',
    );
    if (!ok || !mounted) return;
    try {
      await repo.eliminar(ev);
      if (mounted) Navigator.of(context).pop();
      _avisar('Evento eliminado.');
    } catch (e) {
      _avisar(e.toString());
    }
  }

  // ─── Construcción ───────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final ev = repo.porId(widget.eventoId);
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
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!_esAdmin) {
              _avisar('Solo administradorxs pueden cancelar el evento.');
            } else if (ev.cancelado) {
              _avisar('Este evento ya está cancelado.');
            } else {
              _confirmarCancelar(ev);
            }
          });
        }
        return Scaffold(
          appBar: AppBar(
            toolbarHeight: 68,
            titleSpacing: 0,
            title: _titulo(context, ev),
            actions: [
              if (ev.cancelado)
                Padding(
                  padding: const EdgeInsets.only(right: 16),
                  child: Etiqueta(texto: textoEstadoEvento(ev), apagada: true),
                ),
            ],
          ),
          floatingActionButton: _esAdmin
              ? FloatingActionButton(tooltip: 'Opciones de administración', onPressed: () => _menuAdmin(ev), child: const Icon(Icons.edit_calendar_outlined))
              : null,
          body: ListView(
            padding: const EdgeInsets.only(top: 8, bottom: 96),
            children: [
              _resumen(context, ev),
              if (_esAdmin && ev.sePuedeTomarAsistencia)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => TomarAsistenciaScreen(repo: repo, eventoId: ev.id),
                      ),
                    ),
                    icon: const Icon(Icons.how_to_reg_rounded),
                    label: Text(
                      ev.asistentes.isEmpty
                          ? 'Tomar asistencia'
                          : 'Tomar asistencia · ${ev.asistentes.length} ${ev.asistentes.length == 1 ? 'presente' : 'presentes'}',
                    ),
                  ),
                ),
              _tuAsistencia(context, ev),
              _tuReserva(context, ev),
              _equipo(context, ev),
            ],
          ),
        );
      },
    );
  }

  /// Fecha y tipo del evento, fijos en la barra superior (pedido 2026-11-06).
  Widget _titulo(BuildContext context, Evento ev) {
    final p = context.pivot;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          Fechas.encabezado(ev.fecha),
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: p.marcaTexto),
        ),
        const SizedBox(height: 2),
        Text(
          ev.tipo,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
            decoration: ev.cancelado ? TextDecoration.lineThrough : null,
            color: ev.cancelado ? p.apagado : p.texto,
          ),
        ),
      ],
    );
  }

  /// Hora, lugar y accesos (Cómo llegar / Ver video) en una sola tarjeta.
  Widget _resumen(BuildContext context, Evento ev) {
    final p = context.pivot;
    final duracion = duracionEvento(ev);
    final botones = <Widget>[
      if (ev.mapsUrl.isNotEmpty) _BotonAcceso(icono: Icons.directions_outlined, texto: 'Cómo llegar', url: ev.mapsUrl),
      if (ev.videoInstructivo.isNotEmpty)
        _BotonAcceso(
          icono: Icons.play_circle_outline_rounded,
          texto: 'Ver video',
          url: ev.videoInstructivo,
          dentroDeLaApp: true,
          titulo: 'Cómo llegar a ${ev.lugar}',
        ),
    ];
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _dato(p, Icons.schedule_rounded, ev.rangoHorario, duracion)),
              Container(width: 1, height: 36, color: p.tarjetaBorde),
              const SizedBox(width: 12),
              Expanded(child: _dato(p, Icons.place_outlined, ev.lugar, null)),
            ],
          ),
          if (botones.isNotEmpty) ...[const SizedBox(height: 14), Wrap(spacing: 8, runSpacing: 8, children: botones)],
          if (ev.descripcion.trim().isNotEmpty) ...[
            const SizedBox(height: 14),
            Divider(height: 1, color: p.tarjetaBorde),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, size: 20, color: p.textoSecundario),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(ev.descripcion.trim(), style: TextStyle(fontSize: 14, height: 1.45, color: p.texto)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _dato(PivotPaleta p, IconData icono, String principal, String? secundario) {
    return Row(
      children: [
        Icon(icono, size: 22, color: p.textoSecundario),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                principal,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.texto),
              ),
              if (secundario != null && secundario.isNotEmpty) Text(secundario, style: TextStyle(fontSize: 12, color: p.textoSecundario)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tuAsistencia(BuildContext context, Evento ev) {
    final p = context.pivot;
    final motivo = repo.motivoSinRespuesta(ev);
    final bloqueado = motivo != null;
    final sinNo = repo.sinNoAsistire(ev);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tu asistencia',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<EstadoRsvp>(
              showSelectedIcon: true,
              emptySelectionAllowed: true,
              segments: [
                const ButtonSegment(value: EstadoRsvp.asistire, label: Text('Asistiré')),
                if (!sinNo) const ButtonSegment(value: EstadoRsvp.noAsistire, label: Text('No asistiré')),
                const ButtonSegment(value: EstadoRsvp.noJugador, label: Text('No jugador')),
              ],
              selected: {?ev.miEstado},
              onSelectionChanged: bloqueado
                  ? null
                  : (sel) async {
                      if (sel.isEmpty) return;
                      try {
                        await repo.marcar(ev, sel.first);
                      } catch (e) {
                        _avisar(e.toString());
                      }
                    },
            ),
          ),
          const SizedBox(height: 10),
          Text(motivo ?? 'Puedes cambiarla hasta 10 minutos antes de que empiece.', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
        ],
      ),
    );
  }

  /// Reserva de esta clase: su estado y "Cancelar o reagendar"; sin reserva,
  /// "Reservar esta clase" (Mirlxs) y "Reservar (mes)" si ese mes no está
  /// pagado y no usa equipamiento del club (web: `_evDetalleAccionesHtml()`).
  Widget _tuReserva(BuildContext context, Evento ev) {
    final p = context.pivot;
    final fila = repo.reservaDe(ev);
    final reserva = fila == null ? null : ReservaActiva.desde(fila);
    final Widget contenido;
    if (reserva != null) {
      contenido = Column(
        key: const ValueKey('reserva'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Tu reserva',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
              ),
              const Spacer(),
              EstadoReserva(estado: reserva.estado),
            ],
          ),
          if (reserva.estado != 'Confirmada' && reserva.estado != 'Reagendar') ...[
            const SizedBox(height: 8),
            Text('Queda pendiente hasta que el equipo revise tu pago.', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
          ],
          if (reserva.gestionable && !ev.yaEmpezo) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              onPressed: () => gestionarReserva(context, repo, reserva),
              icon: const Icon(Icons.edit_calendar_outlined),
              label: const Text('Cancelar o reagendar'),
            ),
          ],
        ],
      );
    } else {
      final hoy = Fechas.hoy();
      final futuro = ev.tipo == 'Entrenamiento' && !ev.cancelado && !ev.yaEmpezo && !ev.fecha.isBefore(hoy);
      final opciones = _esAdmin || !futuro ? const <TipoReserva>[] : ReservasRepo(repo.sesion).opciones;
      final cuota = repo.cuota;
      final mesLibre = opciones.contains(TipoReserva.mes) && cuota != null && !cuota.mesPagado(ev.fecha.month, ev.fecha.year);
      if (!opciones.contains(TipoReserva.clase) && !mesLibre) return const SizedBox.shrink(key: ValueKey('nada'));
      contenido = Column(
        key: const ValueKey('reservar'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (opciones.contains(TipoReserva.clase))
            FilledButton.tonalIcon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ReservaScreen(repo: repo, tipo: TipoReserva.clase, claseInicial: ev.id),
                ),
              ),
              icon: const Icon(Icons.confirmation_number_outlined),
              label: const Text('Reservar esta clase'),
            ),
          if (opciones.contains(TipoReserva.clase) && mesLibre) const SizedBox(height: 10),
          if (mesLibre)
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ReservaScreen(repo: repo, tipo: TipoReserva.mes, mesInicial: DateTime(ev.fecha.year, ev.fecha.month)),
                ),
              ),
              icon: const Icon(Icons.calendar_month_outlined),
              label: Text('Reservar ${Fechas.mes(ev.fecha)}'),
            ),
        ],
      );
    }
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 240),
      child: contenido is SizedBox
          ? contenido
          : Container(
              key: contenido.key,
              margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.grande)),
              child: contenido,
            ),
    );
  }

  Widget _equipo(BuildContext context, Evento ev) {
    final p = context.pivot;
    final grupos = <(_Grupo, String, List<Persona>?)>[
      (_Grupo.asisten, 'Asisten', ev.con(EstadoRsvp.asistire).map((r) => r.persona).toList()),
      (_Grupo.noAsisten, 'No asisten', ev.con(EstadoRsvp.noAsistire).map((r) => r.persona).toList()),
      (_Grupo.noJugador, 'No jugador', ev.con(EstadoRsvp.noJugador).map((r) => r.persona).toList()),
      if (_esAdmin && !ev.yaEmpezo) (_Grupo.sinRespuesta, 'Sin respuesta', _sinRespuesta),
    ];
    final elegido = grupos.firstWhere((g) => g.$1 == _grupo, orElse: () => grupos.first);
    final personas = elegido.$3;
    // Admins: Emergencia junto a quien fue marcadx A tiempo o Tarde en este evento.
    final marcadxs = {for (final a in ev.asistentes) a.persona.username.trim().toLowerCase()};
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              'Asistencia del equipo',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final (i, g) in grupos.indexed) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: _Contador(
                    cantidad: g.$3?.length,
                    etiqueta: g.$2,
                    elegido: g.$1 == elegido.$1,
                    cargando: g.$1 == _Grupo.sinRespuesta && _cargandoSinRespuesta,
                    alTocar: () => setState(() => _grupo = g.$1),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          // Cambio de grupo: "fundido cruzado" de Material (sale la lista
          // anterior, entra la nueva, sin encimarse) y la altura se acomoda
          // suave (antes las dos listas se superponían y saltaba el alto).
          AnimatedSize(
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: PageTransitionSwitcher(
              duration: const Duration(milliseconds: 300),
              transitionBuilder: (hijo, primaria, secundaria) =>
                  FadeThroughTransition(animation: primaria, secondaryAnimation: secundaria, fillColor: Colors.transparent, child: hijo),
              layoutBuilder: (hijos) => Stack(alignment: Alignment.topCenter, children: hijos),
              child: KeyedSubtree(
                key: ValueKey('${elegido.$1}-${personas?.length}'),
                child: personas == null
                    ? const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    : personas.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text('Vacío por el momento.', style: TextStyle(color: p.textoSecundario)),
                      )
                    : Column(
                        children: [
                          // Tocar a alguien abre su ficha en Equipo (Victor, 2026-11-07).
                          for (final per in personas)
                            InkWell(
                              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                              onTap: () => PersonaScreen.abrir(context, EquipoRepo.de(repo.sesion), per.username),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                child: Row(
                                  children: [
                                    HeroAvatar(
                                      tag: 'avatar-${per.username}',
                                      child: AvatarPersona(nombre: per.nombreMostrar, foto: per.fotoPerfil),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Text(
                                        per.nombreMostrar,
                                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.texto),
                                      ),
                                    ),
                                    if (_esAdmin &&
                                        marcadxs.contains(per.username.trim().toLowerCase()) &&
                                        per.username.toLowerCase() != (repo.sesion.nombre ?? '').toLowerCase())
                                      PildoraEmergencia(alTocar: () => _emergencia(per))
                                    else
                                      Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Contador extends StatelessWidget {
  const _Contador({required this.cantidad, required this.etiqueta, required this.elegido, required this.cargando, required this.alTocar});
  final int? cantidad;
  final String etiqueta;
  final bool elegido;
  final bool cargando;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final color = elegido ? p.sobreSuave : p.texto;
    return Material(
      color: elegido ? p.suave : p.apagadoFondo,
      borderRadius: BorderRadius.circular(PivotRadios.contador),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.contador),
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          child: Column(
            children: [
              SizedBox(
                height: 26,
                child: Center(
                  child: cargando || cantidad == null
                      ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: color))
                      : Text(
                          '$cantidad',
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color),
                        ),
                ),
              ),
              Text(
                etiqueta,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: elegido ? color : p.textoSecundario),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BotonAcceso extends StatelessWidget {
  const _BotonAcceso({required this.icono, required this.texto, required this.url, this.dentroDeLaApp = false, this.titulo = ''});
  final bool dentroDeLaApp;
  final String titulo;
  final IconData icono;
  final String texto;
  final String url;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 40),
        side: BorderSide(color: p.bordeSuave),
        foregroundColor: p.texto,
      ),
      onPressed: () async {
        if (dentroDeLaApp) {
          await VideoScreen.abrir(context, url, titulo: titulo);
          return;
        }
        final uri = Uri.tryParse(url);
        if (uri == null || !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir el enlace.')));
          }
        }
      },
      icon: Icon(icono, size: 20, color: p.marcaTexto),
      label: Text(texto),
    );
  }
}
