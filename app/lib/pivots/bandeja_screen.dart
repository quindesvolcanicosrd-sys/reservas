import 'package:flutter/material.dart';

import '../core/config_liga.dart';
import '../core/api.dart';
import '../core/cargando.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import '../ajustes/ajustes_screen.dart';
import '../ajustes/componentes.dart';
import '../ajustes/contacto_screen.dart';
import '../ajustes/datos_screens.dart';
import '../ajustes/identidad_screen.dart';
import '../ajustes/notificaciones_screen.dart';
import '../equipo/equipo_repo.dart';
import '../equipo/inventario_asistentes.dart' show elegirPlazoPrestamo;
import '../finanzas/tesoreria_repo.dart';
import '../equipo/persona_screen.dart';
import 'bandeja_repo.dart';
import '../core/vidrio.dart';

/// Bandeja de Pivots (etapa 3, Victor 2026-11-12): todo lo que espera una
/// decisión, agrupado. Aprobar o rechazar quita la tarjeta con una
/// animación; si falla, vuelve y se avisa. Nada de esto se guarda en el
/// teléfono.
class BandejaPivotsScreen extends StatefulWidget {
  const BandejaPivotsScreen({super.key, required this.repo});
  final BandejaRepo repo;

  @override
  State<BandejaPivotsScreen> createState() => _BandejaPivotsScreenState();
}

class _BandejaPivotsScreenState extends State<BandejaPivotsScreen> {
  BandejaRepo get repo => widget.repo;
  final _saliendo = <String>{};
  static String _clave(Pedido x) => '${x.tipo.name}-${x.id}';

  /// Excepciones de cuota aprobadas y vigentes (carrusel al final).
  List<ExcepcionVigente> _vigentes = const [];

  @override
  void initState() {
    super.initState();
    _recargar();
  }

  Future<void> _recargar() async {
    await Future.wait([repo.cargar(forzar: true), repo.cargarMia(), if (repo.esPivot) _cargarVigentes()]);
    // Al verla, lo de ahora queda visto: la campana vuelve a ser bandeja.
    await repo.marcarVista();
  }

  void _abrirRecomendacion(Recomendacion r) {
    final s = repo.sesion;
    switch (r.clave) {
      case 'foto':
        cambiarFoto(context, s);
      case 'contacto':
        SubAjustes.abrir(context, ContactoScreen(sesion: s, n: '1'));
      case 'identidad':
        SubAjustes.abrir(context, IdentidadScreen(sesion: s));
      case 'equipamiento':
        SubAjustes.abrir(context, EquipamientoScreen(sesion: s));
      case 'notificaciones':
        SubAjustes.abrir(context, NotificacionesScreen(sesion: s));
    }
  }

  Future<void> _cargarVigentes() async {
    try {
      final l = await repo.excepcionesVigentes();
      if (mounted) setState(() => _vigentes = l);
    } catch (_) {
      // El carrusel es secundario: si falla, la Bandeja sigue funcionando.
    }
  }

  Future<void> _editarExcepcion(ExcepcionVigente e) async {
    final cambios = await elegirDuracionExcepcion(context, Pedido(TipoPedido.excepcion, {...e.m, 'mesAplicacion': e.desde}), editar: true);
    if (cambios == null || !mounted) return;
    final m = ScaffoldMessenger.of(context);
    try {
      await repo.editarExcepcion(e, cambios);
      m.showSnackBar(SnackBar(content: Text('Guardado. Se le avisó a ${e.nombreMostrar}.')));
      await _cargarVigentes();
    } catch (x) {
      m.showSnackBar(SnackBar(content: Text(x is ApiException ? x.message : 'No se pudo guardar.')));
    }
  }

  Future<void> _cancelarExcepcion(ExcepcionVigente e) async {
    final h = Fechas.hoy();
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Cancelar la excepción de ${e.nombreMostrar}?'),
        content: Text('Sigue vigente hasta el fin de ${Fechas.mes(h)}. Desde el mes que viene paga la cuota normal. Se le avisará.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Cancelar excepción')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final m = ScaffoldMessenger.of(context);
    try {
      await repo.cancelarExcepcion(e);
      m.showSnackBar(SnackBar(content: Text('Cancelada. Termina el fin de ${Fechas.mes(h)}.')));
      await _cargarVigentes();
    } catch (x) {
      m.showSnackBar(SnackBar(content: Text(x is ApiException ? x.message : 'No se pudo cancelar.')));
    }
  }

  /// Cancelar un pedido propio pendiente. Para cambiarlo: cancelar y pedir de nuevo.
  Future<void> _cancelarMio(MiPedido x) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('¿Cancelar esta solicitud?'),
        content: Text('"${x.titulo}" deja de llegarles a los Pivots. Si querías cambiar algo, cancélala y vuelve a pedirla.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Cancelar solicitud')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final m = ScaffoldMessenger.of(context);
    try {
      await repo.cancelarMio(x);
      m.showSnackBar(const SnackBar(content: Text('Solicitud cancelada.')));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo cancelar. Revisa tu conexión.')));
    }
  }

  static const _grupos = [
    (TipoPedido.reserva, 'Pagos y reservas', Icons.receipt_long_rounded),
    (TipoPedido.rectificacion, 'Rectificaciones de asistencia', Icons.fact_check_outlined),
    (TipoPedido.excepcion, 'Excepciones de cuota', Icons.volunteer_activism_outlined),
    (TipoPedido.lesion, 'Lesiones', Icons.healing_outlined),
    (TipoPedido.tarea, 'Tareas por validar', Icons.task_alt_rounded),
    (TipoPedido.prestamo, 'Equipamiento', Icons.content_paste_rounded),
    (TipoPedido.equipo, 'Cambios de equipo', Icons.swap_vert_rounded),
  ];

  Future<void> _resolver(Pedido p, bool aprobar) async {
    var nota = '';
    // Al rechazar una tarea o una excepción se puede explicar por qué.
    if (!aprobar && (p.tipo == TipoPedido.tarea || p.tipo == TipoPedido.excepcion)) {
      final n = await _pedirNota(p);
      if (n == null || !mounted) return;
      nota = n;
    }
    // Al aprobar una excepción, el Pivot decide cuánto dura (y, si es por
    // dificultad económica, si paga media cuota o nada).
    var extra = const <String, Object?>{};
    // Rechazar un pago o reserva: motivo de una lista (o uno propio) y aviso
    // inmediato a la persona (Victor, 2026-11-13).
    if (!aprobar && p.tipo == TipoPedido.reserva) {
      final r = await _motivoRechazo(p);
      if (r == null || !mounted) return;
      extra = r;
    }
    if (aprobar && p.tipo == TipoPedido.excepcion) {
      final r = await elegirDuracionExcepcion(context, p);
      if (r == null || !mounted) return;
      extra = r;
    }
    // Pago: el Pivot confirma a qué cuenta entró de verdad (Tesorería).
    if (aprobar && p.tipo == TipoPedido.reserva && (p.m['monto'] as num? ?? 0) > 0 && p.m['usoCupon'] != true && repo.sesion.tieneArea('finanzas')) {
      final c = await _elegirCuenta(p);
      if (c == false || !mounted) return;
      if (c is String) extra = {'cuentaId': c};
    }
    // Pedido para usar equipamiento: cuánto tiempo y cómo se entrega.
    if (aprobar && p.tipo == TipoPedido.prestamo && p.m['tipo'] == 'uso') {
      final r = await elegirPlazoPrestamo(context, titulo: '¿Por cuánto tiempo?');
      if (r == null || !mounted) return;
      extra = r;
    }
    if (!mounted) return;
    final m = ScaffoldMessenger.of(context);
    // La tarjeta se cierra con una animación antes de salir de la lista.
    setState(() => _saliendo.add(_clave(p)));
    await Future<void>.delayed(const Duration(milliseconds: 260));
    try {
      await repo.resolver(p, aprobar: aprobar, nota: nota, extra: extra);
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(aprobar ? 'Aprobado' : (p.tipo == TipoPedido.equipo ? 'Se queda en su equipo este mes' : 'Rechazado'))));
    } catch (e) {
      m
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    } finally {
      if (mounted) setState(() => _saliendo.remove(_clave(p)));
    }
  }

  /// Cuentas de Tesorería: elegir a cuál entró el pago. Devuelve el id, null
  /// si no hay cuentas (sigue sin Tesorería) o false si se cancela.
  Future<Object?> _elegirCuenta(Pedido p) async {
    List<Map<String, dynamic>> cuentas;
    try {
      final r = await TesoreriaRepo(repo.sesion).accion('resumen');
      cuentas = [
        for (final c in (r['cuentas'] as List? ?? const []))
          if ((c as Map)['activa'] != false) c as Map<String, dynamic>,
      ];
    } catch (_) {
      return null;
    }
    if (cuentas.isEmpty || !mounted) return null;
    final medioId = '${p.m['medio'] ?? ''}';
    final medio = nombreMedio(p.m);
    // El medio puede decir a qué cuenta entra; si no, se busca por tipo.
    final m = ConfigLiga.de(repo.sesion).medios.where((x) => x.id == medioId).firstOrNull;
    final t = m?.tipo ?? medioId;
    final tipoMedio = t == 'deuna' || t == 'billetera' || t == 'enlace'
        ? 'deuna'
        : (t == 'transferencia' || t == 'banco' ? 'banco' : (t == 'efectivo' ? 'efectivo' : ''));
    String? elegida =
        (m?.cuentaId != null && cuentas.any((c) => c['id'] == m!.cuentaId) ? m!.cuentaId : null) ??
        cuentas.where((c) => c['tipo'] == tipoMedio).map((c) => c['id'] as String).firstOrNull ??
        cuentas.first['id'] as String;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('¿A qué cuenta entró?', style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  medio.isEmpty ? 'La persona no dijo dónde pagó.' : 'Dijo que pagó con $medio. Confírmalo.',
                  style: TextStyle(color: h.pivot.textoSecundario),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final c in cuentas)
                      ChoiceChip(label: Text('${c['nombre']}'), selected: elegida == c['id'], onSelected: (_) => set(() => elegida = c['id'] as String)),
                  ],
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.of(h).pop(true), child: const Text('Aprobar')),
              ],
            ),
          ),
        ),
      ),
    );
    return ok == true ? elegida : false;
  }

  static const _motivos = {
    'Falta el comprobante': 'No recibimos el comprobante de tu pago. Envíalo y vuelve a reservar.',
    'No encontramos el pago': 'No encontramos tu pago en nuestras cuentas. Revisa el comprobante y vuelve a reservar.',
    'La clase está llena o cancelada': 'La clase está llena o se canceló. Elige otra fecha para reservar.',
    'El monto no coincide': 'El monto que pagaste no coincide con el de la reserva. Escríbenos para resolverlo.',
  };

  /// Motivo del rechazo y mensaje que recibe la persona. null si se cancela.
  Future<Map<String, Object?>?> _motivoRechazo(Pedido p) async {
    String? motivo;
    final razon = TextEditingController(), mensaje = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) {
          final pal = h.pivot;
          final otro = motivo == 'otro';
          return SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(h).bottom),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('¿Por qué se rechaza?', style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('${p.nombreMostrar} recibe el aviso al momento y la reserva se cancela.', style: TextStyle(color: pal.textoSecundario)),
                  const SizedBox(height: 8),
                  for (final e in [..._motivos.keys, 'otro'])
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        motivo == e ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                        color: motivo == e ? pal.marcaTexto : pal.textoSecundario,
                      ),
                      title: Text(e == 'otro' ? 'Otro motivo' : e),
                      subtitle: e == 'otro' || motivo != e ? null : Text(_motivos[e]!),
                      onTap: () => set(() => motivo = e),
                    ),
                  if (otro) ...[
                    TextField(
                      controller: razon,
                      autofocus: true,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(labelText: 'Motivo'),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: mensaje,
                      minLines: 2,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(labelText: 'Mensaje para la persona'),
                    ),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(onPressed: motivo == null ? null : () => Navigator.of(h).pop(true), child: const Text('Rechazar y avisar')),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (ok != true || motivo == null) return null;
    if (motivo == 'otro') {
      final r = razon.text.trim();
      if (r.isEmpty) return null;
      return {'motivo': r, 'mensaje': mensaje.text.trim().isEmpty ? 'Motivo: $r' : mensaje.text.trim()};
    }
    return {'motivo': motivo, 'mensaje': _motivos[motivo]};
  }

  Future<String?> _pedirNota(Pedido p) {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('¿Por qué se rechaza?'),
        content: TextField(
          controller: c,
          autofocus: true,
          maxLines: 3,
          minLines: 1,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(hintText: p.tipo == TipoPedido.tarea ? 'Ej. Falta la foto del resultado' : 'Opcional'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text), child: const Text('Rechazar')),
        ],
      ),
    );
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
        title: const Text('Bandeja', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListenableBuilder(
        listenable: repo,
        builder: (context, _) {
          if (!repo.cargado && repo.cargando) return const Center(child: PivotCargando());
          if (!repo.cargado && repo.error != null) {
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
          final hijos = <Widget>[];
          for (final (tipo, titulo, icono) in _grupos) {
            final l = repo.pedidos.where((x) => x.tipo == tipo).toList();
            if (l.isEmpty) continue;
            hijos.add(_Encabezado(titulo: titulo, icono: icono, cantidad: l.length));
            // Cambios de equipo: cuenta regresiva hasta el corte (Victor, 2026-11-13).
            if (tipo == TipoPedido.equipo) hijos.add(_CuentaCorte(corte: DateTime.tryParse('${l.first.m['corte'] ?? ''}')));
            for (final x in l) {
              final c = _clave(x);
              hijos.add(
                AnimatedSize(
                  key: ValueKey(c),
                  duration: const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  child: AnimatedOpacity(
                    opacity: _saliendo.contains(c) ? 0 : 1,
                    duration: const Duration(milliseconds: 200),
                    child: _saliendo.contains(c)
                        ? const SizedBox(width: double.infinity)
                        : _TarjetaPedido(
                            pedido: x,
                            alResolver: _saliendo.isEmpty ? (a) => _resolver(x, a) : null,
                            alAbrirFicha: () => PersonaScreen.abrir(context, EquipoRepo.de(repo.sesion), x.nombre),
                          ),
                  ),
                ),
              );
            }
          }
          // Lo de cada persona: sus pedidos y lo que la app recomienda.
          if (repo.misPedidos.isNotEmpty) {
            hijos.add(_Encabezado(titulo: 'Tus pedidos', icono: Icons.send_rounded, cantidad: repo.misPedidos.length));
            for (final x in repo.misPedidos.take(20)) {
              hijos.add(_TarjetaMiPedido(x: x, alCancelar: () => _cancelarMio(x)));
            }
          }
          if (repo.recomendaciones.isNotEmpty) {
            hijos.add(_Encabezado(titulo: 'Te recomendamos', icono: Icons.lightbulb_outline_rounded, cantidad: repo.recomendaciones.length));
            for (final r in repo.recomendaciones) {
              hijos.add(_TarjetaRecomendacion(r: r, alTocar: () => _abrirRecomendacion(r)));
            }
          }
          final vacia = hijos.isEmpty;
          if (_vigentes.isNotEmpty) {
            hijos.add(_Encabezado(titulo: 'Excepciones vigentes', icono: Icons.event_repeat_rounded, cantidad: _vigentes.length));
            hijos.add(
              SizedBox(
                height: 150,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  clipBehavior: Clip.none,
                  itemCount: _vigentes.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (_, i) =>
                      _TarjetaExcepcion(e: _vigentes[i], alCancelar: () => _cancelarExcepcion(_vigentes[i]), alEditar: () => _editarExcepcion(_vigentes[i])),
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: _recargar,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              child: vacia
                  ? ListView(
                      key: const ValueKey('vacia'),
                      padding: EdgeInsets.fromLTRB(16, 0 + altoBarra(context), 16, 40),
                      children: [
                        const SizedBox(height: 120),
                        Icon(Icons.inbox_rounded, size: 56, color: p.textoSecundario),
                        const SizedBox(height: 12),
                        Text(
                          'No hay nada pendiente',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.texto),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          repo.esPivot
                              ? 'Aquí llegan pagos, rectificaciones, excepciones, lesiones, tareas por validar y equipamiento, y lo que tú pidas.'
                              : 'Aquí verás tus pedidos (pagos, excepciones, equipamiento, tareas) y si se aprobaron.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: p.textoSecundario),
                        ),
                        if (hijos.isNotEmpty) const SizedBox(height: 24),
                        ...hijos,
                      ],
                    )
                  : ListView(key: const ValueKey('lista'), padding: EdgeInsets.fromLTRB(16, 4 + altoBarra(context), 16, 40), children: hijos),
            ),
          );
        },
      ),
    );
  }
}

class _Encabezado extends StatelessWidget {
  const _Encabezado({required this.titulo, required this.icono, required this.cantidad});
  final String titulo;
  final IconData icono;
  final int cantidad;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
      child: Row(
        children: [
          Icon(icono, size: 20, color: p.marcaTexto),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              titulo,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.texto),
            ),
          ),
          Text(
            '$cantidad',
            style: TextStyle(fontWeight: FontWeight.w700, color: p.textoSecundario),
          ),
        ],
      ),
    );
  }
}

/// "Se aplicarán automáticamente el 1 de diciembre · faltan 3 días".
class _CuentaCorte extends StatelessWidget {
  const _CuentaCorte({required this.corte});
  final DateTime? corte;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final c = corte;
    if (c == null) return const SizedBox.shrink();
    final dias = Fechas.diasEntre(Fechas.hoy(), c);
    final falta = dias <= 0 ? 'hoy' : (dias == 1 ? 'mañana' : 'en $dias días');
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
      child: Text(
        'Lo que no revises se aplicará automáticamente el ${Fechas.corta(c)} ($falta).',
        style: TextStyle(fontSize: 13, color: dias <= 1 ? p.marcaTexto : p.textoSecundario, fontWeight: dias <= 1 ? FontWeight.w700 : null),
      ),
    );
  }
}

/// Qué pide cada tarjeta, en una o dos líneas.
(String, String?) describirPedido(Pedido x) {
  final m = x.m;
  final f = x.fechaEvento;
  final cuando = f == null ? '' : Fechas.corta(f);
  String v(String k) => '${m[k] ?? ''}'.trim();
  String plata(Object? v) => '\$${((v as num?) ?? 0).toStringAsFixed(2)}';
  switch (x.tipo) {
    case TipoPedido.reserva:
      final equipo = [
        if (v('talla').isNotEmpty && v('talla') != 'No') 'Patines ${v('talla')}',
        if (v('protecciones').isNotEmpty && v('protecciones') != 'No')
          v('protecciones') == 'Sí' ? 'todas las protecciones' : 'protecciones: ${v('protecciones').toLowerCase()}',
      ].join(' · ');
      // Qué reservó y cuándo, y dónde dice que pagó (Victor, 2026-11-13).
      final ev = x.evento;
      final que = m['tipo'] == 'mensual'
          ? 'Mensualidad ${m['mesTexto'] ?? ''}'.trim()
          : [
              '${ev?['tipo'] ?? ''}'.isEmpty ? 'Clase' : '${ev!['tipo']}',
              if (f != null) 'del ${Fechas.corta(f)}',
              if ('${ev?['hora'] ?? ''}'.isNotEmpty) 'a las ${ev!['hora']}',
              if ('${ev?['lugar'] ?? ''}'.isNotEmpty) '· ${ev!['lugar']}',
            ].join(' ');
      final n = nombreMedio(m);
      final medio = n.isNotEmpty ? 'Pagó con $n' : (m['usoCupon'] == true || (m['monto'] as num? ?? 0) == 0 ? '' : 'No dijo dónde pagó');
      final saldo = (m['saldoAplicado'] as num? ?? 0).toDouble();
      final detalles = [
        if (medio.isNotEmpty) medio,
        if (saldo > 0) 'Usó ${plata(saldo)} de su saldo a favor (ya descontado)',
        if (saldo < 0) 'Incluye ${plata(-saldo)} que debía al equipo',
        if (equipo.isNotEmpty) 'Equipamiento del equipo: $equipo',
      ];
      return ('$que · ${m['usoCupon'] == true ? 'con cupón' : plata(m['monto'])}', detalles.isEmpty ? null : detalles.join('\n'));
    case TipoPedido.rectificacion:
      return ('Pide corregir su asistencia del $cuando', 'Debería decir: ${m['estadoSolicitado'] ?? ''}');
    case TipoPedido.excepcion:
      final mes = DateTime.tryParse('${m['mesAplicacion'] ?? ''}-01');
      final d = m['datos'];
      final datos = d is Map ? d : const {};
      if (m['tipo'] == 'ausencias') {
        return (
          'Media cuota por ausencias justificadas${mes == null ? '' : ' · ${Fechas.mesNombre(mes)}'}',
          '${datos['motivo'] ?? ''}'.trim().isEmpty ? null : 'Motivo: ${datos['motivo']}',
        );
      }
      final partes = [
        if ('${datos['nivelIngreso'] ?? ''}'.isNotEmpty) 'Ingresos: ${datos['nivelIngreso']}',
        if ('${datos['situacionEconomica'] ?? ''}'.trim().isNotEmpty) '${datos['situacionEconomica']}'.trim(),
        if ('${datos['compromiso'] ?? ''}'.isNotEmpty) 'Compromiso: ${datos['compromiso']}',
      ];
      return ('Subvención por dificultad económica${mes == null ? '' : ' · ${Fechas.mesNombre(mes)}'}', partes.isEmpty ? null : partes.join('\n'));
    case TipoPedido.prestamo:
      final que = v('detalle').isEmpty ? 'equipamiento del equipo' : v('detalle');
      if (m['tipo'] == 'uso') {
        return ('Pide usar $que', v('motivo').isEmpty ? 'Al aprobarlo eliges por cuánto tiempo y cómo lo usa.' : 'Motivo: ${v('motivo')}');
      }
      return (
        'Avisa que se llevó $que${m['permanente'] == true ? ' (permanente)' : ''}',
        v('motivo').isEmpty ? 'Al aprobarlo, se ve en Inventario.' : 'Motivo: ${v('motivo')}',
      );
    case TipoPedido.lesion:
      return ('Pidió pasar a Lesionadx', 'Mientras dure no cuenta para la asistencia ni paga cuota.');
    case TipoPedido.equipo:
      return (
        m['sube'] == true ? 'Sube de ${v('de')} a ${v('a')}' : 'Baja de ${v('de')} a ${v('a')}',
        'Aprobar lo aplica ahora. "Dejar como está" lo mantiene este mes.',
      );
    case TipoPedido.tarea:
      final t = x.tarea;
      return (
        t == null ? 'Envió una tarea para revisión' : '${t['titulo']}',
        t == null ? null : '${t['puntos']} puntos · ${t['area'] ?? ''}'.replaceAll(RegExp(r' · $'), ''),
      );
  }
}

class _TarjetaPedido extends StatelessWidget {
  const _TarjetaPedido({required this.pedido, required this.alResolver, this.alAbrirFicha});
  final Pedido pedido;
  final void Function(bool aprobar)? alResolver;
  final VoidCallback? alAbrirFicha;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final (linea, detalle) = describirPedido(pedido);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _Entrar(
        child: Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Tocar el avatar o el nombre abre su ficha (contacto y datos).
                    InkWell(
                      customBorder: const CircleBorder(),
                      onTap: alAbrirFicha,
                      child: AvatarPersona(nombre: pedido.nombreMostrar, foto: pedido.foto, tamano: 40),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onTap: alAbrirFicha,
                            child: Text(
                              pedido.nombreMostrar,
                              style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(linea, style: TextStyle(fontSize: 14, color: p.texto)),
                          if (detalle != null) ...[const SizedBox(height: 4), Text(detalle, style: TextStyle(fontSize: 13, color: p.textoSecundario))],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: alResolver == null ? null : () => alResolver!(false),
                      child: Text(pedido.tipo == TipoPedido.equipo ? 'Dejar como está' : 'Rechazar'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(onPressed: alResolver == null ? null : () => alResolver!(true), child: const Text('Aprobar')),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Entrada suave de cada tarjeta.
class _Entrar extends StatelessWidget {
  const _Entrar({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: const Duration(milliseconds: 260),
    curve: Curves.easeOutCubic,
    builder: (context, v, hijo) => Opacity(
      opacity: v,
      child: Transform.translate(offset: Offset(0, 8 * (1 - v)), child: hijo),
    ),
    child: child,
  );
}

/// Duración (y efecto) de una excepción al aprobarla.
Future<Map<String, Object?>?> elegirDuracionExcepcion(BuildContext context, Pedido p, {bool editar = false}) {
  final desde = DateTime.tryParse('${p.m['mesAplicacion'] ?? ''}-01') ?? DateTime(Fechas.hoy().year, Fechas.hoy().month);
  final meses = [for (var i = 1; i <= 12; i++) DateTime(desde.year, desde.month + i)];
  var duracion = 'mes';
  var hasta = meses[1];
  var efecto = 'media';
  final economica = p.m['tipo'] != 'ausencias';
  String clave(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';
  return showModalBottomSheet<Map<String, Object?>>(
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
        final resumen = duracion == 'mes'
            ? 'Solo ${Fechas.mes(desde)}.'
            : duracion == 'hasta'
            ? 'De ${Fechas.mes(desde)} a ${Fechas.mes(hasta)} de ${hasta.year}.'
            : 'Desde ${Fechas.mes(desde)}, hasta que la canceles.';
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  editar ? 'Excepción de ${p.nombreMostrar}' : 'Aprobar excepción de ${p.nombreMostrar}',
                  style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 16),
                if (economica) ...[
                  titulo('Cuánto paga'),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(value: 'media', label: Text('Media cuota')),
                      ButtonSegment(value: 'exenta', label: Text('No paga')),
                    ],
                    selected: {efecto},
                    onSelectionChanged: (s) => refrescar(() => efecto = s.first),
                  ),
                  const SizedBox(height: 16),
                ],
                titulo('Cuánto dura'),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: 'mes', label: Text('Este mes')),
                    ButtonSegment(value: 'hasta', label: Text('Hasta…')),
                    ButtonSegment(value: 'indefinida', label: Text('Indefinida')),
                  ],
                  selected: {duracion},
                  onSelectionChanged: (s) => refrescar(() => duracion = s.first),
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  child: duracion != 'hasta'
                      ? const SizedBox(width: double.infinity)
                      : Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: SizedBox(
                            height: 40,
                            child: ListView(
                              scrollDirection: Axis.horizontal,
                              children: [
                                for (final m in meses)
                                  Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: ChoiceChip(
                                      showCheckmark: false,
                                      label: Text(m.year == desde.year ? Fechas.mesNombre(m) : Fechas.mesAnio(m)),
                                      selected: m == hasta,
                                      onSelected: (_) => refrescar(() => hasta = m),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                ),
                const SizedBox(height: 12),
                Text(
                  '$resumen Puedes cancelarla cuando quieras desde Excepciones vigentes; si la cancelas, dura hasta el fin del mes en curso.',
                  style: TextStyle(fontSize: 13, color: pal.textoSecundario),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () =>
                      Navigator.of(hoja).pop({'duracion': duracion, if (duracion == 'hasta') 'hasta': clave(hasta), if (economica) 'efecto': efecto}),
                  child: Text(editar ? 'Guardar cambios' : 'Aprobar'),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

/// Excepción vigente como tarjeta del carrusel (Victor, 2026-11-13: dentro
/// de la Bandeja, deslizable de lado para no ocupar espacio vertical).
class _TarjetaExcepcion extends StatelessWidget {
  const _TarjetaExcepcion({required this.e, required this.alCancelar, required this.alEditar});
  final ExcepcionVigente e;
  final VoidCallback alCancelar;
  final VoidCallback alEditar;

  static String mes(String clave) {
    final d = DateTime.tryParse('$clave-01');
    return d == null ? clave : (d.year == Fechas.hoy().year ? Fechas.mes(d) : '${Fechas.mes(d)} de ${d.year}');
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return SizedBox(
      width: 270,
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AvatarPersona(nombre: e.nombreMostrar, foto: e.foto, tamano: 34),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      e.nombreMostrar,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${e.exenta ? 'No paga' : 'Media cuota'} · ${e.tipo == 'ausencias' ? 'ausencias' : 'dificultad económica'}',
                style: TextStyle(fontSize: 13.5, color: p.texto),
              ),
              Text(
                e.hasta == null ? 'Desde ${mes(e.desde)}, indefinida' : 'De ${mes(e.desde)} a ${mes(e.hasta!)}${e.cancelada ? ' (cancelada)' : ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: p.textoSecundario),
              ),
              const Spacer(),
              Align(
                alignment: Alignment.centerRight,
                child: e.cancelada
                    ? const SizedBox(height: 40)
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton(onPressed: alEditar, child: const Text('Editar')),
                          TextButton(onPressed: alCancelar, child: const Text('Cancelar')),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Un pedido propio y cómo quedó.
class _TarjetaMiPedido extends StatelessWidget {
  const _TarjetaMiPedido({required this.x, required this.alCancelar});
  final MiPedido x;
  final VoidCallback alCancelar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final (icono, texto) = switch (x.estado) {
      'aprobada' => (Icons.check_circle_rounded, 'Aprobado'),
      'rechazada' => (Icons.cancel_outlined, 'No aprobado'),
      'vencida' => (Icons.history_rounded, 'Venció'),
      'cancelada' => (Icons.block_rounded, 'Cancelado'),
      _ => (Icons.hourglass_top_rounded, 'Pendiente'),
    };
    final cancelable = x.estado == 'pendiente' && const {'reserva', 'rectificacion', 'excepcion', 'prestamo', 'lesion'}.contains(x.tipo);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _Entrar(
        child: Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        x.titulo,
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                      ),
                      if (x.detalle.isNotEmpty) ...[const SizedBox(height: 2), Text(x.detalle, style: TextStyle(fontSize: 13, color: p.textoSecundario))],
                      if (x.fecha != null) ...[
                        const SizedBox(height: 2),
                        Text(Fechas.corta(x.fecha!.toLocal()), style: TextStyle(fontSize: 12, color: p.textoSecundario)),
                      ],
                      if (cancelable)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                            onPressed: alCancelar,
                            icon: const Icon(Icons.close_rounded, size: 18),
                            label: const Text('Cancelar solicitud'),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Etiqueta(texto: texto, icono: icono),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Ajuste recomendado: toca y abre la pantalla para completarlo.
class _TarjetaRecomendacion extends StatelessWidget {
  const _TarjetaRecomendacion({required this.r, required this.alTocar});
  final Recomendacion r;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: p.suave,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: alTocar,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        r.titulo,
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.sobreSuave),
                      ),
                      const SizedBox(height: 2),
                      Text(r.texto, style: TextStyle(fontSize: 13, color: p.sobreSuave)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: p.sobreSuave),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Nombre del medio con que dice que pagó (el guardado en la reserva; los
/// pagos anteriores a los medios editables tienen solo la clave).
String nombreMedio(Map<String, dynamic> m) {
  final n = '${m['medioNombre'] ?? ''}'.trim();
  if (n.isNotEmpty) return n;
  return switch ('${m['medio'] ?? ''}') {
    'deuna' => 'billetera virtual',
    'transferencia' => 'transferencia bancaria',
    'efectivo' => 'efectivo',
    '' => '',
    final otro => otro,
  };
}
