import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import 'emergencia_screen.dart';
import 'equipo_modelos.dart';
import 'equipo_repo.dart';

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
            body: Center(child: repo.personas == null ? const CircularProgressIndicator() : const Text('No se encontró a esta persona.')),
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

  /// Puesto por puntos dentro de su grupo (web `_eqRankTexto()`).
  String? _ranking() {
    final grupo = [
      for (final x in repo.personas ?? const <Integrante>[])
        if (x.grupo == p.grupo) x,
    ]..sort((a, b) => b.puntos.compareTo(a.puntos));
    if (grupo.length < 2 || p.inactivx) return null;
    final i = grupo.indexWhere((x) => x.username == p.username);
    return i < 0 ? null : 'Puesto ${i + 1} de ${grupo.length} en ${p.grupo} ${repo.periodoCorto}';
  }

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final t = Theme.of(context).textTheme;
    final yo = repo.esYo(p);
    final fav = repo.favoritos.contains(p.username);
    final rank = _ranking();
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
                child: Icon(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded, key: ValueKey(fav), color: fav ? pal.marca : null),
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
              child: HeroAvatar(
                tag: 'avatar-${p.username}',
                child: AvatarPersona(nombre: p.nombreMostrar, foto: p.foto, tamano: 104),
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
                if (yo) const Etiqueta(texto: 'Tú'),
              ],
            ),
            const SizedBox(height: 18),
            _acciones(context, pal, yo),
            const SizedBox(height: 18),
            _stats(context, pal),
            if (rank != null) ...[
              const SizedBox(height: 10),
              Text(
                rank,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: pal.textoSecundario),
              ),
            ],
            if (p.fechaIngreso != null) ...[
              const SizedBox(height: 4),
              Text(
                'En el equipo desde el ${Fechas.corta(p.fechaIngreso!)}',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: pal.textoSecundario),
              ),
            ],
            if (repo.esAdmin && !yo) ...[const SizedBox(height: 18), _Administracion(repo: repo, p: p)],
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
      if (repo.esAdmin) _Accion(icono: Icons.emergency_rounded, texto: 'Emergencia', roja: true, alTocar: () => EmergenciaScreen.abrir(context, repo, p)),
    ];
    if (botones.isEmpty) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [for (final b in botones) Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: b)],
    );
  }

  Widget _stats(BuildContext context, PivotPaleta pal) {
    final pct = p.asistenciaPct;
    final anioPct = p.eventosAnio == 0 ? null : (p.asistenciasAnio * 100 / p.eventosAnio).round();
    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _Stat(valor: pct == null ? '—' : '$pct%', etiqueta: 'Asistencia ${repo.periodoCorto}'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(valor: anioPct == null ? '—' : '$anioPct%', etiqueta: 'Asistencia del año'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(valor: numero(p.horasAnio), etiqueta: 'Horas en el año'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _Stat(
                  valor: numero(p.puntosAsistencia),
                  etiqueta: 'Puntos por asistencia',
                  alTocar: () => _desglose(context, 'asistencia', 'Puntos por asistencia'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(valor: numero(p.puntosTareas), etiqueta: 'Puntos por tareas', alTocar: () => _desglose(context, 'tareas', 'Puntos por tareas')),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(valor: numero(p.puntosRacha), etiqueta: 'Puntos por racha', alTocar: () => _desglose(context, 'racha', 'Puntos por racha')),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Desglose línea por línea (`getDesglosePuntos`), como la web.
  void _desglose(BuildContext context, String concepto, String titulo) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.55,
        maxChildSize: 0.9,
        builder: (context, scroll) => FutureBuilder<List<Map<String, dynamic>>>(
          future: repo.desglose(p.username, concepto),
          builder: (context, s) {
            final pal = context.pivot;
            final filas = s.data;
            return ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              children: [
                Text(titulo, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                Text('Este mes', style: TextStyle(color: pal.textoSecundario)),
                const SizedBox(height: 12),
                if (s.hasError) Text('No se pudo cargar el desglose.', style: TextStyle(color: pal.textoSecundario)),
                if (!s.hasData && !s.hasError)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                if (filas != null && filas.isEmpty) Text('Todavía no hay puntos por este concepto.', style: TextStyle(color: pal.textoSecundario)),
                for (final f in filas ?? const <Map<String, dynamic>>[])
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(_tituloFila(f)),
                    subtitle: Text(_subFila(f)),
                    trailing: Text('+${numero((f['puntos'] as num?)?.toDouble() ?? 0)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  static String _tituloFila(Map<String, dynamic> f) {
    final fecha = Fechas.desdeIso(f['fecha']);
    final base = '${f['titulo'] ?? f['nombre'] ?? f['tarea'] ?? f['estado'] ?? ''}';
    return fecha == null ? base : '${Fechas.corta(fecha)}${base.isEmpty ? '' : ' · $base'}';
  }

  static String _subFila(Map<String, dynamic> f) => [
    if (f['externa'] == true) 'Externa',
    if ('${f['lugar'] ?? ''}'.isNotEmpty) '${f['lugar']}',
    if ('${f['mes'] ?? ''}'.isNotEmpty) '${f['mes']}',
  ].join(' · ');
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

class _Stat extends StatelessWidget {
  const _Stat({required this.valor, required this.etiqueta, this.alTocar});
  final String valor;
  final String etiqueta;
  final VoidCallback? alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Material(
      color: p.tarjeta,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          child: Column(
            children: [
              Text(
                valor,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: p.texto),
              ),
              const SizedBox(height: 2),
              Text(
                etiqueta,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11.5, height: 1.2, color: p.textoSecundario),
              ),
              if (alTocar != null) Icon(Icons.expand_more_rounded, size: 16, color: p.textoSecundario),
            ],
          ),
        ),
      ),
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
                // Pills en vez de desplegable (Victor, 2026-11-07). "De viaje" se
                // marca abajo con fechas.
                Text('Estado', style: TextStyle(fontSize: 13, color: pal.textoSecundario)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final e in const ['Activx', 'Ausente', 'Técnico', 'Lesionadx'])
                      ChoiceChip(
                        label: Text(e),
                        selected: p.estado == e,
                        onSelected: p.estado == e ? null : (_) => _hacer(() => repo.cambiarEstado(p, e), 'Estado actualizado'),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Paga cuota'),
                  value: !p.exentaCuota,
                  onChanged: (v) => _hacer(() => repo.cambiarPagaCuota(p, v), v ? 'Ahora paga cuota' : 'Ya no paga cuota'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Acceso admin'),
                  value: p.esAdminMiembro,
                  onChanged: p.email.isEmpty
                      ? null
                      : (v) async {
                          if (!await _confirmar(
                            v ? '¿Dar acceso admin?' : '¿Quitar acceso admin?',
                            v ? '${p.nombreMostrar} podrá ver y cambiar todo lo de Mi Liga.' : '${p.nombreMostrar} dejará de ver Mi Liga.',
                            v ? 'Dar acceso' : 'Quitar acceso',
                          )) {
                            return;
                          }
                          _hacer(() => repo.cambiarAdmin(p, v), v ? 'Acceso admin otorgado' : 'Acceso admin quitado');
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
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.add_task_rounded, color: pal.marcaTexto),
                  title: const Text('Registrar asistencia externa'),
                  subtitle: const Text('Un entrenamiento fuera de la liga. Suma puntos de asistencia.'),
                  onTap: _asistenciaExterna,
                ),
                // Archivar solo con inactividad (Victor, 2026-11-07); el
                // servidor además lo impide con reservas o cuotas activas.
                if (p.inactivx)
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
