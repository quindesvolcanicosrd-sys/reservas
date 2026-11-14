import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/anticipada.dart';
import '../eventos/eventos_repo.dart';
import '../reservas/gestionar_reserva.dart';
import '../reservas/reserva_screen.dart';
import '../reservas/reservas_repo.dart';
import 'componentes.dart';
import '../core/cargando.dart';
import '../core/vidrio.dart';

/// "Mis pagos y reservas" (Victor, 2026-11-08): reemplaza a "Mis reservas".
/// Solo aparece en Ajustes si la persona tiene algo que mostrar (reservas,
/// pagos o la cuota pendiente; `PagosScreen.tieneAlgo`). Arriba el estado de
/// la cuota y lo que está en revisión; después las reservas activas (cancelar
/// o reagendar) y el historial como recibos por mes, con el detalle de cada
/// uno (tipo, talla, protecciones, cupón, monto y estado).
class PagosScreen extends StatefulWidget {
  const PagosScreen({super.key, required this.repo});
  final EventosRepo repo;

  /// ¿Mostrar la fila en Ajustes?
  static bool tieneAlgo(Cuota? c) => c != null && (c.reservas.isNotEmpty || (c.pagaCuotaMensual && !c.alDia));

  @override
  State<PagosScreen> createState() => _PagosScreenState();
}

class _PagosScreenState extends State<PagosScreen> {
  @override
  void initState() {
    super.initState();
    widget.repo.recargarCuota();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        flexibleSpace: const Vidrio(child: SizedBox.expand()),
        title: const Text('Mis pagos y reservas', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListenableBuilder(
        listenable: widget.repo,
        builder: (context, _) {
          final c = widget.repo.cuota;
          return AnimatedSwitcher(
            duration: const Duration(milliseconds: 240),
            child: c == null ? const Center(key: ValueKey('cargando'), child: PivotCargando()) : _contenido(context, c),
          );
        },
      ),
    );
  }

  Widget _contenido(BuildContext context, Cuota c) {
    final p = context.pivot;
    final activas = ReservasRepo.activas(c);
    final historial = [...c.reservas]..sort((a, b) => _fechaDe(b).compareTo(_fechaDe(a)));
    final pendientes = c.reservas.where((r) => r['estado'] == 'Pendiente');
    final enRevision = pendientes.fold<double>(0, (s, r) => s + ((r['monto'] as num?)?.toDouble() ?? 0));
    // Agrupado por mes del pago.
    final porMes = <String, List<Map<String, dynamic>>>{};
    for (final r in historial) {
      final f = _fechaDe(r);
      (porMes[Fechas.mesAnio(f)] ??= []).add(r);
    }
    return ListView(
      key: const ValueKey('lista'),
      padding: EdgeInsets.fromLTRB(16, 8 + altoBarra(context), 16, 40),
      children: [
        _Estado(cuota: c, enRevision: enRevision, cantidadRevision: pendientes.length, alPagar: () => _pagarCuota(context)),
        if (activas.isNotEmpty) ...[
          const SizedBox(height: 22),
          _titulo(p, 'Reservas activas'),
          for (final r in activas) _Activa(r: r, alGestionar: r.gestionable ? () => gestionarReserva(context, widget.repo, r) : null),
        ],
        const SizedBox(height: 22),
        _titulo(p, 'Historial'),
        if (historial.isEmpty) Text('Todavía no hay pagos registrados.', style: TextStyle(color: p.textoSecundario)),
        for (final e in porMes.entries) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
            child: Text(
              e.key,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.3, color: p.textoSecundario),
            ),
          ),
          GrupoAjustes(
            filas: [for (final r in e.value) _Recibo(r: r, alTocar: () => _detalle(context, r))],
          ),
        ],
      ],
    );
  }

  Widget _titulo(PivotPaleta p, String t) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
    child: Text(
      t,
      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.texto),
    ),
  );

  static DateTime _fechaDe(Map<String, dynamic> r) =>
      DateTime.tryParse('${r['fecha_pago'] ?? ''}') ?? DateTime.tryParse('${r['created_at'] ?? ''}')?.toLocal() ?? DateTime(2000);

  void _pagarCuota(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReservaScreen(repo: widget.repo, tipo: TipoReserva.mes),
      ),
    );
  }

  void _detalle(BuildContext context, Map<String, dynamic> r) {
    final p = context.pivot;
    final filas = <(String, String)>[
      ('Concepto', _Recibo.titulo(r)),
      ('Estado', _Recibo.estado(r)),
      ('Monto', _Recibo.monto(r)),
      ('Fecha de pago', Fechas.corta(_fechaDe(r))),
      if ('${r['talla'] ?? ''}'.trim().isNotEmpty) ('Patines', 'Talla ${r['talla']}'),
      if ('${r['protecciones'] ?? ''}'.trim().isNotEmpty && '${r['protecciones']}' != 'No')
        ('Protecciones', '${r['protecciones']}' == 'Sí' ? 'Todas del equipo' : '${r['protecciones']}'),
      if (r['uso_cupon'] == true) ('Descuento', 'Cupón aplicado'),
      if (r['tipo'] == 'mensual' && '${r['validezHasta'] ?? ''}'.isNotEmpty) ('Vigente hasta', '${r['validezHasta']}'),
    ];
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => HojaBase(
        titulo: 'Recibo',
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: Column(
            children: [
              for (final (i, f) in filas.indexed) ...[
                if (i > 0) Divider(height: 18, color: p.fondo),
                Row(
                  children: [
                    Expanded(
                      child: Text(f.$1, style: TextStyle(fontSize: 13.5, color: p.textoSecundario)),
                    ),
                    Flexible(
                      child: Text(
                        f.$2,
                        textAlign: TextAlign.right,
                        style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: p.texto),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Tarjeta de estado: cuota al día o pendiente, y pagos en revisión.
class _Estado extends StatelessWidget {
  const _Estado({required this.cuota, required this.enRevision, required this.cantidadRevision, required this.alPagar});
  final Cuota cuota;
  final double enRevision;
  final int cantidadRevision;
  final VoidCallback alPagar;

  @override
  Widget build(BuildContext context) {
    const sobre = PivotPaleta.sobreSeccion;
    final hoy = Fechas.hoy();
    final debe = cuota.pagaCuotaMensual && !cuota.alDia;
    final (String titulo, String texto) = !cuota.pagaCuotaMensual
        ? ('Pagas por clase', 'Aquí ves tus reservas y recibos.')
        : debe
        ? ('Debes la cuota de ${Fechas.mesNombre(hoy).toLowerCase()}', 'Págala para seguir marcando asistencia sin límites.')
        : ('Tu cuota está al día', 'Gracias por sostener al equipo.');
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(gradient: PivotPaleta.degradadoMarca, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(debe ? Icons.error_outline_rounded : Icons.verified_rounded, color: sobre),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  titulo,
                  style: TextStyle(color: sobre, fontSize: 17, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(texto, style: TextStyle(color: sobre.withValues(alpha: 0.88), fontSize: 13.5)),
          if (cantidadRevision > 0) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: sobre.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(PivotRadios.chip)),
              child: Text(
                '$cantidadRevision ${cantidadRevision == 1 ? 'pago' : 'pagos'} en revisión · \$${enRevision.toStringAsFixed(2)}',
                style: TextStyle(color: sobre, fontWeight: FontWeight.w700, fontSize: 13.5),
              ),
            ),
          ],
          if (debe) ...[
            const SizedBox(height: 14),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: sobre, foregroundColor: PivotPaleta.seccionSalud),
              onPressed: alPagar,
              child: const Text('Pagar la cuota'),
            ),
          ],
        ],
      ),
    );
  }
}

class _Activa extends StatelessWidget {
  const _Activa({required this.r, required this.alGestionar});
  final ReservaActiva r;
  final VoidCallback? alGestionar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: alGestionar,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Row(
              children: [
                Icon(r.mensual ? Icons.calendar_month_rounded : Icons.roller_skating_rounded, color: p.marcaTexto),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        r.titulo,
                        style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: p.texto),
                      ),
                      if (r.detalle.isNotEmpty) Text(r.detalle, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                      if (alGestionar != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            'Cancelar o reagendar',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: p.marcaTexto),
                          ),
                        ),
                    ],
                  ),
                ),
                EstadoReserva(estado: r.estado),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Un pago del historial como fila de recibo.
class _Recibo extends StatelessWidget {
  const _Recibo({required this.r, required this.alTocar});
  final Map<String, dynamic> r;
  final VoidCallback alTocar;

  static String titulo(Map<String, dynamic> r) {
    if (r['tipo'] == 'mensual') return 'Cuota de ${'${r['mes_texto'] ?? r['fecha'] ?? ''}'.toLowerCase()}';
    final f = DateTime.tryParse('${r['fechaEvento'] ?? ''}');
    return f == null ? 'Clase' : 'Clase del ${Fechas.corta(f)}';
  }

  static String estado(Map<String, dynamic> r) => switch ('${r['estado'] ?? ''}') {
    'Confirmada' => 'Pagado',
    'Pendiente' => 'En revisión',
    'Cancelada' => 'Cancelado',
    'Reagendar' => 'Clase a favor',
    'Crédito usado' => 'Crédito usado',
    final x => x,
  };

  static String monto(Map<String, dynamic> r) {
    final m = (r['monto'] as num?)?.toDouble() ?? 0;
    return m == 0 ? 'Sin costo' : '\$${m.toStringAsFixed(2)}';
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final detalle = [
      if ('${r['talla'] ?? ''}'.trim().isNotEmpty) 'Patines ${r['talla']}',
      if ('${r['protecciones'] ?? ''}'.trim().isNotEmpty && '${r['protecciones']}' != 'No') 'Protecciones',
      if (r['uso_cupon'] == true) 'Cupón',
    ].join(' · ');
    final cancelado = r['estado'] == 'Cancelada';
    return InkWell(
      onTap: alTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(r['tipo'] == 'mensual' ? Icons.calendar_month_rounded : Icons.receipt_long_rounded, color: p.marcaTexto),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titulo(r),
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: cancelado ? p.textoSecundario : p.texto),
                  ),
                  Text([estado(r), if (detalle.isNotEmpty) detalle].join(' · '), style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
                ],
              ),
            ),
            Text(
              monto(r),
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: cancelado ? p.textoSecundario : p.texto,
                decoration: cancelado ? TextDecoration.lineThrough : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
