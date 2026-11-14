import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/anticipada.dart';
import '../eventos/eventos_repo.dart';
import 'reservas_repo.dart';
import '../core/cargando.dart';
import '../core/vidrio.dart';

/// "Cancelar o reagendar" una reserva (web: `abrirGestionar()` y su hoja
/// `#sheet-gestionar`): primero las dos opciones; cancelar pide
/// confirmación con los mismos avisos que la web; cambiar de fecha abre la
/// lista de fechas o meses disponibles.
Future<void> gestionarReserva(BuildContext context, EventosRepo repo, ReservaActiva r) async {
  final accion = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _HojaGestionar(reserva: r, repo: repo),
  );
  if (accion == 'reagendar' && context.mounted) {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReagendarScreen(repo: repo, reserva: r),
      ),
    );
  }
}

class _HojaGestionar extends StatefulWidget {
  const _HojaGestionar({required this.reserva, required this.repo});
  final ReservaActiva reserva;
  final EventosRepo repo;

  @override
  State<_HojaGestionar> createState() => _HojaGestionarState();
}

class _HojaGestionarState extends State<_HojaGestionar> {
  bool _confirmando = false;
  bool _ocupado = false;

  Future<void> _cancelar() async {
    setState(() => _ocupado = true);
    final mensajero = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      final cupon = await ReservasRepo(widget.repo.sesion).cancelar(widget.reserva);
      await widget.repo.recargarCuota();
      widget.repo.cargar(forzar: true);
      nav.pop();
      mensajero.showSnackBar(SnackBar(content: Text(cupon ? 'Reserva cancelada. Tu cupón vuelve a estar disponible.' : 'Reserva cancelada')));
    } catch (e) {
      if (mounted) setState(() => _ocupado = false);
      mensajero.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final r = widget.reserva;
    return PopScope(
      canPop: !_ocupado,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              transitionBuilder: (c, a) => FadeTransition(
                opacity: a,
                child: SlideTransition(
                  position: Tween(begin: const Offset(0.06, 0), end: Offset.zero).animate(a),
                  child: c,
                ),
              ),
              child: !_confirmando
                  ? Column(
                      key: const ValueKey('opciones'),
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Gestionar reserva',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: p.textoSecundario),
                        ),
                        const SizedBox(height: 4),
                        Text(r.titulo, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        if (r.detalle.isNotEmpty) Text(r.detalle, style: TextStyle(color: p.textoSecundario)),
                        const SizedBox(height: 20),
                        FilledButton.tonalIcon(
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                          onPressed: () => Navigator.of(context).pop('reagendar'),
                          icon: const Icon(Icons.calendar_month_outlined),
                          label: Text(r.mensual ? 'Cambiar de mes' : 'Cambiar de fecha'),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), foregroundColor: p.marcaTexto),
                          onPressed: () => setState(() => _confirmando = true),
                          icon: const Icon(Icons.close_rounded),
                          label: const Text('Cancelar reserva'),
                        ),
                      ],
                    )
                  : Column(
                      key: const ValueKey('confirmar'),
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('¿Cancelar esta reserva?', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text(
                          'Al cancelar, el cupo queda libre para otras personas. Si cambias de idea, tendrás que reservar de nuevo y el cupo podría no estar disponible.',
                          style: TextStyle(height: 1.4, color: p.textoSecundario),
                        ),
                        const SizedBox(height: 14),
                        _aviso(
                          p,
                          Icons.confirmation_number_outlined,
                          'No se puede deshacer. Si usaste tu cupón, vuelve a quedar disponible si cancelas con al menos 1 hora de anticipación. Si cambias de fecha, el cupón se mantiene.',
                        ),
                        const SizedBox(height: 8),
                        _aviso(p, Icons.payments_outlined, 'Si ya pagaste, es posible que no se reembolse. Escríbele al equipo si necesitas más información.'),
                        const SizedBox(height: 20),
                        FilledButton(
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                          onPressed: _ocupado ? null : _cancelar,
                          child: _ocupado
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                              : const Text('Sí, cancelar mi reserva'),
                        ),
                        const SizedBox(height: 6),
                        TextButton(onPressed: _ocupado ? null : () => setState(() => _confirmando = false), child: const Text('Volver')),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _aviso(PivotPaleta p, IconData icono, String texto) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.chip)),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icono, size: 18, color: p.sobreSuave),
        const SizedBox(width: 10),
        Expanded(
          child: Text(texto, style: TextStyle(fontSize: 13, height: 1.35, color: p.sobreSuave)),
        ),
      ],
    ),
  );
}

/// Elegir la nueva fecha (clases disponibles) o el nuevo mes (12 desde el
/// actual) y confirmar (web: `s-gestionar` + `modal-confirm-reagendar`).
class ReagendarScreen extends StatefulWidget {
  const ReagendarScreen({super.key, required this.repo, required this.reserva});
  final EventosRepo repo;
  final ReservaActiva reserva;

  @override
  State<ReagendarScreen> createState() => _ReagendarScreenState();
}

class _ReagendarScreenState extends State<ReagendarScreen> {
  late final _r = ReservasRepo(widget.repo.sesion);
  List<FechaClase>? _clases;
  String? _error;
  String? _eventoSel;
  DateTime? _mesSel;
  bool _guardando = false;

  ReservaActiva get _res => widget.reserva;

  @override
  void initState() {
    super.initState();
    if (!_res.mensual) _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final f = await _r.fechas();
      if (mounted) setState(() => _clases = f.where((c) => c.disponible && c.id != _res.clave).toList());
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudieron cargar las fechas.');
    }
  }

  bool get _hayEleccion => _res.mensual ? _mesSel != null : _eventoSel != null;

  String get _nuevaTexto {
    if (_res.mensual) return ReglaAnticipada.nombreMes(_mesSel!);
    final c = _clases!.firstWhere((c) => c.id == _eventoSel);
    return ReservasRepo.etiquetaClase(c);
  }

  Future<void> _confirmar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(_res.mensual ? '¿Cambiar de mes?' : '¿Cambiar de fecha?'),
        content: Text('${_res.titulo}\n→ $_nuevaTexto\n\nTu reserva vuelve a quedar pendiente hasta que el equipo la revise.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Confirmar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _guardando = true);
    final mensajero = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      await _r.reagendar(_res, evento: _eventoSel, mes: _mesSel);
      await widget.repo.recargarCuota();
      widget.repo.cargar(forzar: true);
      nav.pop();
      mensajero.showSnackBar(SnackBar(content: Text(_res.mensual ? 'Mes cambiado' : 'Fecha cambiada')));
    } catch (e) {
      if (mounted) setState(() => _guardando = false);
      mensajero.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final Widget cuerpo;
    if (_res.mensual) {
      final c = widget.repo.cuota;
      cuerpo = GridView.count(
        key: const ValueKey('meses'),
        padding: const EdgeInsets.all(16),
        crossAxisCount: 3,
        childAspectRatio: 1.35,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        children: [
          for (final m in ReglaAnticipada.ventana())
            _celda(
              p,
              titulo: Fechas.mesNombre(m),
              sub: c != null && c.mesPagado(m.month, m.year) ? (m == _res.mes ? 'Actual' : 'Pagado') : '${m.year}',
              sel: _mesSel == m,
              alTocar: c != null && c.mesPagado(m.month, m.year) ? null : () => setState(() => _mesSel = m),
            ),
        ],
      );
    } else if (_error != null) {
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
    } else if (_clases == null) {
      cuerpo = const Center(key: ValueKey('cargando'), child: PivotCargando());
    } else if (_clases!.isEmpty) {
      cuerpo = Center(
        key: const ValueKey('vacio'),
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            _r.necesitaEquipo
                ? 'No hay cupos con tu equipamiento en los próximos entrenamientos. Vuelve más tarde.'
                : 'No hay entrenamientos disponibles por ahora. Vuelve más tarde.',
            textAlign: TextAlign.center,
            style: TextStyle(color: p.textoSecundario),
          ),
        ),
      );
    } else {
      cuerpo = ListView(
        key: const ValueKey('lista'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          for (final c in _clases!)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _celda(
                p,
                titulo: ReservasRepo.etiquetaClase(c).split(' - ').first,
                sub: [if (c.hora.isNotEmpty) c.hora, if (c.lugar.isNotEmpty) c.lugar].join(' · '),
                sel: _eventoSel == c.id,
                fila: true,
                alTocar: () => setState(() => _eventoSel = c.id),
              ),
            ),
        ],
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(_res.mensual ? 'Cambiar de mes' : 'Cambiar de fecha')),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Text('Ahora: ${_res.titulo}', style: TextStyle(color: p.textoSecundario)),
          ),
          Expanded(
            child: AnimatedSwitcher(duration: const Duration(milliseconds: 240), child: cuerpo),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: !_hayEleccion || _guardando ? null : _confirmar,
            child: _guardando
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                : Text(_res.mensual ? 'Confirmar nuevo mes' : 'Confirmar nueva fecha'),
          ),
        ),
      ),
    );
  }

  Widget _celda(PivotPaleta p, {required String titulo, required String sub, required bool sel, VoidCallback? alTocar, bool fila = false}) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: alTocar == null ? 0.5 : 1,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: sel ? p.suave : p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          border: Border.all(color: sel ? p.marca : p.tarjeta, width: 1.5),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            onTap: alTocar,
            child: Padding(
              padding: fila ? const EdgeInsets.fromLTRB(16, 14, 16, 14) : EdgeInsets.zero,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: fila ? CrossAxisAlignment.start : CrossAxisAlignment.center,
                children: [
                  Text(
                    titulo,
                    style: TextStyle(fontSize: fila ? 16 : 15, fontWeight: FontWeight.w700, color: sel ? p.sobreSuave : p.texto),
                  ),
                  if (sub.isNotEmpty) ...[const SizedBox(height: 2), Text(sub, style: TextStyle(fontSize: 12.5, color: p.textoSecundario))],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Mis reservas": clases y cuotas activas con su estado; cada una se puede
/// cancelar o reagendar (web: lista de Inicio, `_clasificarReservas()`).
class MisReservasScreen extends StatefulWidget {
  const MisReservasScreen({super.key, required this.repo});
  final EventosRepo repo;

  @override
  State<MisReservasScreen> createState() => _MisReservasScreenState();
}

class _MisReservasScreenState extends State<MisReservasScreen> {
  @override
  void initState() {
    super.initState();
    widget.repo.recargarCuota();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        flexibleSpace: const Vidrio(child: SizedBox.expand()),
        title: const Text('Mis reservas'),
      ),
      body: ListenableBuilder(
        listenable: widget.repo,
        builder: (context, _) {
          final c = widget.repo.cuota;
          final Widget cuerpo;
          if (c == null) {
            cuerpo = const Center(key: ValueKey('cargando'), child: PivotCargando());
          } else {
            final lista = ReservasRepo.activas(c);
            cuerpo = lista.isEmpty
                ? Center(
                    key: const ValueKey('vacio'),
                    child: Text('No tienes reservas activas.', style: TextStyle(color: p.textoSecundario)),
                  )
                : ListView(
                    key: const ValueKey('lista'),
                    padding: EdgeInsets.fromLTRB(16, 8 + altoBarra(context), 16, 24),
                    children: [for (final r in lista) _tarjeta(context, r)],
                  );
          }
          return AnimatedSwitcher(duration: const Duration(milliseconds: 240), child: cuerpo);
        },
      ),
    );
  }

  Widget _tarjeta(BuildContext context, ReservaActiva r) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: p.tarjeta,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          r.titulo,
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                        ),
                        if (r.detalle.isNotEmpty) Text(r.detalle, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                      ],
                    ),
                  ),
                  EstadoReserva(estado: r.estado),
                  const SizedBox(width: 8),
                ],
              ),
              if (r.gestionable)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(onPressed: () => gestionarReserva(context, widget.repo, r), child: const Text('Cancelar o reagendar')),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Etiqueta del estado de una reserva (web: `ev-card-reserva-estado`).
class EstadoReserva extends StatelessWidget {
  const EstadoReserva({super.key, required this.estado});
  final String estado;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final (IconData icono, String texto) = switch (estado) {
      'Confirmada' => (Icons.check_circle_rounded, 'Reserva confirmada'),
      'Reagendar' => (Icons.swap_horiz_rounded, 'Clase a favor'),
      _ => (Icons.hourglass_empty_rounded, 'Reserva pendiente'),
    };
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.chip)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icono, size: 15, color: p.sobreSuave),
          const SizedBox(width: 4),
          Text(
            texto,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.sobreSuave),
          ),
        ],
      ),
    );
  }
}
