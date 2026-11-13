import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import 'emergencia_screen.dart';
import 'equipo_modelos.dart';
import 'estadisticas.dart';
import 'equipo_repo.dart';
import '../core/cargando.dart';

/// Ficha de una persona del equipo (web: `_eqRenderPerfil()`): encabezado,
/// acciones (WhatsApp, llamar, favorito y, para admins, Emergencia), stats
/// con desglose de puntos y, para admins, la sección de administración.
/// Se abre desde la lista de Equipo o tocando un avatar en un evento.
class PersonaScreen extends StatelessWidget {
  const PersonaScreen({super.key, required this.repo, required this.username});
  final EquipoRepo repo;
  final String username;

  static Future<void> abrir(BuildContext context, EquipoRepo repo, String username) {
    repo.cargar();
    return Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PersonaScreen(repo: repo, username: username),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final per = repo.persona(username);
        if (per == null) {
          return Scaffold(
            appBar: AppBar(),
            body: Center(child: repo.personas == null ? const PivotCargando() : const Text('No se encontró a esta persona.')),
          );
        }
        return _Ficha(repo: repo, p: per);
      },
    );
  }
}

class _Ficha extends StatelessWidget {
  const _Ficha({required this.repo, required this.p});
  final EquipoRepo repo;
  final Integrante p;

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final t = Theme.of(context).textTheme;
    final yo = repo.esYo(p);
    final fav = repo.favoritos.contains(p.username);
    final estado = datosRelevantes(p, Fechas.hoy()).where((d) => d.fijo).firstOrNull;
    return Scaffold(
      appBar: AppBar(
        actions: [
          if (!yo)
            IconButton(
              tooltip: fav ? 'Quitar de favoritos' : 'Agregar a favoritos',
              onPressed: () => repo.alternarFavorito(p.username),
              icon: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                // Estrella redondeada, como la del jammer (Victor, 2026-11-07).
                child: Icon(fav ? Icons.star_rounded : Icons.star_outline_rounded, key: ValueKey(fav), size: 28, color: fav ? pal.marca : null),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => repo.cargar(forzar: true),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            Center(
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  HeroAvatar(
                    tag: 'avatar-${p.username}',
                    child: AvatarPersona(nombre: p.nombreMostrar, foto: p.foto, tamano: 104),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: p.nombreMostrar),
                  if (p.numero.isNotEmpty)
                    TextSpan(
                      text: '  #${p.numero}',
                      style: TextStyle(color: pal.textoSecundario),
                    ),
                ],
              ),
              textAlign: TextAlign.center,
              style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            Text(
              ['@${p.username}', if (p.pronombres.isNotEmpty) p.pronombres].join(' · '),
              textAlign: TextAlign.center,
              style: TextStyle(color: pal.textoSecundario),
            ),
            const SizedBox(height: 10),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 6,
              runSpacing: 6,
              children: [
                Etiqueta(texto: p.categoria),
                for (final r in p.roles) Etiqueta(texto: r),
                if (estado != null) Etiqueta(texto: estado.texto),
              ],
            ),
            const SizedBox(height: 18),
            _acciones(context, pal, yo),
            const SizedBox(height: 18),
            EstadisticasPersona(repo: repo, p: p),
            if (p.fechaIngreso != null) ...[
              const SizedBox(height: 4),
              Text(
                'En el equipo desde el ${Fechas.corta(p.fechaIngreso!)}',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: pal.textoSecundario),
              ),
            ],
            // También en tu propia ficha: un Pivot puede registrar su pago.
            if (repo.esAdmin) ...[const SizedBox(height: 18), _Administracion(repo: repo, p: p)],
          ],
        ),
      ),
    );
  }

  Widget _acciones(BuildContext context, PivotPaleta pal, bool yo) {
    final tel = p.telefono;
    final completo = tel.isEmpty ? '' : '+${p.prefijo.isEmpty ? '593' : p.prefijo}${tel.startsWith('0') ? tel.substring(1) : tel}';
    final botones = <Widget>[
      if (!yo && tel.isNotEmpty)
        _Accion(
          icono: Icons.chat_rounded,
          texto: 'WhatsApp',
          alTocar: () => launchUrl(Uri.parse('https://wa.me/${completo.substring(1)}'), mode: LaunchMode.externalApplication),
        ),
      if (!yo && tel.isNotEmpty) _Accion(icono: Icons.call_rounded, texto: 'Llamar', alTocar: () => launchUrl(Uri.parse('tel:$completo'))),
      // En Equipo, Emergencia está siempre disponible para admins (Victor, 2026-11-07).
      if (repo.esAdmin && !yo)
        _Accion(icono: Icons.emergency_rounded, texto: 'Emergencia', roja: true, alTocar: () => EmergenciaScreen.abrir(context, repo, p)),
    ];
    if (botones.isEmpty) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [for (final b in botones) Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: b)],
    );
  }
}

class _Accion extends StatelessWidget {
  const _Accion({required this.icono, required this.texto, required this.alTocar, this.roja = false});
  final bool roja;
  final IconData icono;
  final String texto;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Column(
      children: [
        Material(
          color: roja ? p.marca : p.suave,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: alTocar,
            child: SizedBox(width: 56, height: 56, child: Icon(icono, color: roja ? p.sobreMarca : p.sobreSuave)),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          texto,
          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: p.texto),
        ),
      ],
    );
  }
}

/// Sección de administración (solo admins; web `_eqAdminBloqueHtml()`).
class _Administracion extends StatefulWidget {
  const _Administracion({required this.repo, required this.p});
  final EquipoRepo repo;
  final Integrante p;

  @override
  State<_Administracion> createState() => _AdministracionState();
}

class _AdministracionState extends State<_Administracion> {
  bool _ocupado = false;

  Future<void> _hacer(Future<void> Function() f, String ok) async {
    setState(() => _ocupado = true);
    final m = ScaffoldMessenger.of(context);
    try {
      await f();
      m.showSnackBar(SnackBar(content: Text(ok)));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  String _textoViaje(Integrante p) {
    final d = p.viajeDesde, h = p.viajeHasta;
    if (d == null && h == null) return 'De viaje';
    if (d == null) return 'De viaje hasta el ${Fechas.corta(h!)}';
    if (h == null) return 'De viaje desde el ${Fechas.corta(d)}';
    return 'De viaje del ${Fechas.corta(d)} al ${Fechas.corta(h)}';
  }

  /// Mes anterior, este y el siguiente.
  static List<DateTime> _mesesCerca() {
    final h = Fechas.hoy();
    return [DateTime(h.year, h.month - 1), DateTime(h.year, h.month), DateTime(h.year, h.month + 1)];
  }

  Future<void> _registrarPago() async {
    final p = widget.p;
    final precio = await widget.repo.precioMensual().catchError((_) => 0.0);
    if (!mounted) return;
    var mes = _mesesCerca()[1];
    var forma = 'Efectivo';
    final monto = TextEditingController(text: precio > 0 ? precio.toStringAsFixed(2) : '');
    final notas = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (hoja) => StatefulBuilder(
        builder: (hoja, refrescar) {
          final pal = hoja.pivot;
          Text titulo(String t) => Text(
            t,
            style: TextStyle(fontWeight: FontWeight.w700, color: pal.texto),
          );
          final valor = double.tryParse(monto.text.replaceAll(',', '.')) ?? 0;
          return Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(hoja).bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Pago de ${p.nombreMostrar}', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                titulo('Mes'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final m in _mesesCerca()) ChoiceChip(label: Text(Fechas.mesAnio(m)), selected: m == mes, onSelected: (_) => refrescar(() => mes = m)),
                  ],
                ),
                const SizedBox(height: 16),
                titulo('Medio de pago'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final f in const ['Efectivo', 'De Una', 'Transferencia'])
                      ChoiceChip(label: Text(f), selected: f == forma, onSelected: (_) => refrescar(() => forma = f)),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: monto,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Monto', prefixText: '\$ '),
                  onChanged: (_) => refrescar(() {}),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notas,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(labelText: 'Notas (opcional)'),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: valor <= 0 ? null : () => Navigator.of(hoja).pop(true),
                  child: Text('Registrar \$${valor.toStringAsFixed(2)} de ${Fechas.mes(mes)}'),
                ),
              ],
            ),
          );
        },
      ),
    );
    if (ok != true || !mounted) return;
    final valor = double.tryParse(monto.text.replaceAll(',', '.')) ?? 0;
    await _hacer(() => widget.repo.registrarPago(p, mes: mes, monto: valor, forma: forma, notas: notas.text), 'Pago registrado');
  }

  Future<void> _noPagaMes() async {
    final p = widget.p;
    final mes = await showModalBottomSheet<DateTime>(
      context: context,
      showDragHandle: true,
      builder: (hoja) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('¿Qué mes no paga ${p.nombreMostrar}?', style: Theme.of(hoja).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            ),
            for (final m in _mesesCerca())
              ListTile(
                leading: const Icon(Icons.event_busy_outlined),
                title: Text('No paga ${Fechas.mes(m)} ${m.year}'),
                onTap: () => Navigator.of(hoja).pop(m),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (mes == null || !mounted) return;
    if (!await _confirmar(
      '¿No paga ${Fechas.mes(mes)} ${mes.year}?',
      '${p.nombreMostrar} no deberá la cuota de ese mes. Queda registrado en su historial.',
      'Confirmar',
    )) {
      return;
    }
    await _hacer(() => widget.repo.noPagaMes(p, mes), 'Listo: no paga ${Fechas.mes(mes)} ${mes.year}');
  }

  Future<void> _marcarViaje() async {
    final hoy = Fechas.hoy();
    final r = await showDateRangePicker(
      context: context,
      firstDate: hoy.subtract(const Duration(days: 60)),
      lastDate: hoy.add(const Duration(days: 365)),
      initialDateRange: DateTimeRange(start: hoy, end: hoy.add(const Duration(days: 7))),
      helpText: 'Fechas del viaje',
      saveText: 'Guardar',
    );
    if (r == null || !mounted) return;
    setState(() => _ocupado = true);
    final m = ScaffoldMessenger.of(context);
    try {
      final aviso = await widget.repo.marcarViaje(widget.p, r.start, r.end);
      m.showSnackBar(SnackBar(content: Text(aviso ?? 'Viaje guardado')));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _asistenciaExterna() async {
    final res = await showModalBottomSheet<(DateTime, String)>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => const _HojaAsistenciaExterna(),
    );
    if (res == null) return;
    await _hacer(() => widget.repo.registrarAsistenciaExterna(widget.p, res.$1, res.$2), 'Asistencia externa registrada');
  }

  static const _estados = {
    'Activx': (Icons.directions_run_rounded, 'Entrena con normalidad.'),
    'Ausente': (Icons.event_busy_rounded, 'Fuera por un tiempo, avisado.'),
    'Técnico': (Icons.sports_rounded, 'Acompaña desde el staff técnico.'),
    'Lesionadx': (Icons.healing_rounded, 'En recuperación de una lesión.'),
  };

  Future<void> _elegirEstado() async {
    final p = widget.p;
    final e = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) {
        final pal = c.pivot;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text('Estado de ${p.nombreMostrar}', style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              ),
              for (final x in _estados.entries)
                ListTile(
                  leading: Icon(x.value.$1, color: x.key == p.estado ? pal.marcaTexto : pal.textoSecundario),
                  title: Text(x.key, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(x.value.$2),
                  trailing: x.key == p.estado ? Icon(Icons.check_rounded, color: pal.marcaTexto) : null,
                  onTap: () => Navigator.of(c).pop(x.key),
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
    if (e == null || e == p.estado || !mounted) return;
    if (!await _confirmar('¿Cambiar el estado?', '${p.nombreMostrar} pasa de ${p.estado} a $e.', 'Cambiar')) return;
    await _hacer(() => widget.repo.cambiarEstado(p, e), 'Estado actualizado');
  }

  Future<bool> _confirmar(String titulo, String texto, String si) async {
    final r = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(titulo),
        content: Text(texto),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(c).pop(true), child: Text(si)),
        ],
      ),
    );
    return r == true;
  }

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final p = widget.p;
    final repo = widget.repo;
    return Material(
      color: pal.tarjeta,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      clipBehavior: Clip.antiAlias,
      // Siempre abierta y sin título (Victor, 2026-11-07): solo la ven admins.
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: _ocupado ? 0.5 : 1,
          child: IgnorePointer(
            ignoring: _ocupado,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Título para encontrarla (Victor, 2026-11-13: no la veía).
                Row(
                  children: [
                    Icon(Icons.admin_panel_settings_outlined, size: 20, color: pal.marcaTexto),
                    const SizedBox(width: 8),
                    Text(
                      'Funciones de Pivot',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: pal.texto),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text('Solo las ven los Pivots: pagos, categoría, permisos y más.', style: TextStyle(fontSize: 13, color: pal.textoSecundario)),
                const SizedBox(height: 14),
                Text('Categoría', style: TextStyle(fontSize: 13, color: pal.textoSecundario)),
                const SizedBox(height: 6),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'auto', label: Text('Auto')),
                    ButtonSegment(value: 'quinde', label: Text('Quindes')),
                    ButtonSegment(value: 'mirlxs', label: Text('Mirlxs')),
                  ],
                  selected: {p.tierModo},
                  onSelectionChanged: (s) => _hacer(() => repo.cambiarTier(p, s.first), 'Categoría actualizada'),
                ),
                const SizedBox(height: 12),
                // Selector tipo desplegable (más claro que las pills) y con
                // confirmación: no se cambia por accidente (Victor, 2026-11-07).
                // "De viaje" se marca abajo con fechas.
                Text('Estado', style: TextStyle(fontSize: 13, color: pal.textoSecundario)),
                const SizedBox(height: 6),
                Material(
                  color: pal.suave,
                  borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                    onTap: _ocupado ? null : _elegirEstado,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          Icon(_estados[p.estado]?.$1 ?? Icons.flight_takeoff_rounded, color: pal.sobreSuave),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              p.estado,
                              style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: pal.sobreSuave),
                            ),
                          ),
                          Icon(Icons.unfold_more_rounded, color: pal.sobreSuave),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Paga cuota'),
                  value: !p.exentaCuota,
                  onChanged: (v) => _hacer(() => repo.cambiarPagaCuota(p, v), v ? 'Ahora paga cuota' : 'Ya no paga cuota'),
                ),
                // En tu propia ficha no puedes quitarte el acceso.
                if (!repo.esYo(p))
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Acceso de administradorx'),
                    value: p.esAdminMiembro,
                    onChanged: p.email.isEmpty
                        ? null
                        : (v) async {
                            if (!await _confirmar(
                              v ? '¿Dar acceso de administradorx?' : '¿Quitar acceso de administradorx?',
                              v ? '${p.nombreMostrar} podrá ver y cambiar todo lo de Mi Liga.' : '${p.nombreMostrar} dejará de ver Mi Liga.',
                              v ? 'Dar acceso' : 'Quitar acceso',
                            )) {
                              return;
                            }
                            _hacer(() => repo.cambiarAdmin(p, v), v ? 'Acceso de administradorx otorgado' : 'Acceso de administradorx quitado');
                          },
                  ),

                // Viaje (web `_eqAbrirSheetViaje()`): "De viaje" solo se marca con fechas.
                if (p.deViaje)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.flight_takeoff_rounded, color: pal.marcaTexto),
                    title: Text(_textoViaje(p)),
                    trailing: TextButton(
                      onPressed: () async {
                        if (!await _confirmar('¿Cancelar el viaje?', '${p.nombreMostrar} vuelve a quedar Activx.', 'Cancelar viaje')) return;
                        await _hacer(() => repo.cancelarViaje(p), 'Viaje cancelado');
                      },
                      child: const Text('Cancelar'),
                    ),
                  )
                else
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.flight_takeoff_rounded, color: pal.marcaTexto),
                    title: const Text('Marcar viaje'),
                    subtitle: const Text('Mientras esté de viaje no cuenta como inactividad.'),
                    onTap: _marcarViaje,
                  ),
                // Pagos desde la ficha (etapa 3, Victor 2026-11-12).
                if (!p.exentaCuota) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.payments_outlined, color: pal.marcaTexto),
                    title: const Text('Registrar pago'),
                    subtitle: const Text('Cuota pagada en efectivo, De Una o transferencia.'),
                    onTap: _registrarPago,
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.event_busy_outlined, color: pal.marcaTexto),
                    title: const Text('No paga un mes'),
                    subtitle: const Text('Excepción de ese mes. Queda en su historial.'),
                    onTap: _noPagaMes,
                  ),
                ],
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.add_task_rounded, color: pal.marcaTexto),
                  title: const Text('Registrar asistencia externa'),
                  subtitle: const Text('Un entrenamiento fuera de la liga. Suma puntos de asistencia.'),
                  onTap: _asistenciaExterna,
                ),
                // Archivar solo con inactividad (Victor, 2026-11-07); el
                // servidor además lo impide con reservas o cuotas activas.
                if (p.inactivx && !repo.esYo(p))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.archive_outlined, color: pal.marcaTexto),
                    title: Text('Archivar a ${p.nombreMostrar}', style: TextStyle(color: pal.marcaTexto)),
                    subtitle: const Text('Deja de aparecer en Equipo. Su historial se conserva y, si vuelve a ingresar, sale de archivo y queda activx.'),
                    onTap: () async {
                      final nav = Navigator.of(context);
                      if (!await _confirmar('¿Archivar?', 'No se puede archivar si tiene reservas activas o cuotas pendientes.', 'Archivar')) return;
                      await _hacer(() => repo.archivar(p), 'Archivadx');
                      if (repo.persona(p.username) == null) nav.pop();
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Fecha (hasta hoy) y lugar (opcional, 60 caracteres) de una asistencia externa.
class _HojaAsistenciaExterna extends StatefulWidget {
  const _HojaAsistenciaExterna();

  @override
  State<_HojaAsistenciaExterna> createState() => _HojaAsistenciaExternaState();
}

class _HojaAsistenciaExternaState extends State<_HojaAsistenciaExterna> {
  DateTime? _fecha;
  final _lugar = TextEditingController();

  @override
  void dispose() {
    _lugar.dispose();
    super.dispose();
  }

  Future<void> _elegirFecha() async {
    final hoy = Fechas.hoy();
    final f = await showDatePicker(context: context, firstDate: DateTime(hoy.year - 1, hoy.month, hoy.day), lastDate: hoy, initialDate: _fecha ?? hoy);
    if (f != null) setState(() => _fecha = f);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Asistencia externa', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _elegirFecha,
            icon: const Icon(Icons.calendar_today_outlined, size: 18),
            label: Text(_fecha == null ? 'Elegir fecha' : Fechas.corta(_fecha!)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _lugar,
            maxLength: 60,
            decoration: const InputDecoration(labelText: 'Lugar (opcional)'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _fecha == null ? null : () => Navigator.of(context).pop((_fecha!, _lugar.text)),
            child: const Text('Registrar'),
          ),
        ],
      ),
    );
  }
}
