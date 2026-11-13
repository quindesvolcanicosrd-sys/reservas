import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/iconos_marca.dart';
import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/pagos.dart';
import '../core/tema.dart';
import '../eventos/anticipada.dart';
import '../eventos/eventos_repo.dart';
import 'reservas_repo.dart';
import '../core/cargando.dart';

enum _Paso { elegir, pago }

/// Reserva por clase o por mes desde el "+" (Fase 3), como el flujo de la
/// web (s4 → s-pago → s6) pero en el marco de asistente de la app:
/// 1) elegir clases o meses, con el total siempre a la vista;
/// 2) pagar: DeUna (enlace) o transferencia al banco; al elegir, la reserva
///    queda registrada como pendiente, igual que en la web;
/// después, pantalla de éxito con el botón para mandar el comprobante.
class ReservaScreen extends StatefulWidget {
  const ReservaScreen({super.key, required this.repo, required this.tipo, this.claseInicial, this.mesInicial, this.datosPrueba});
  final EventosRepo repo;
  final TipoReserva tipo;

  /// Desde el detalle de un evento: esa clase o ese mes ya elegidos.
  final String? claseInicial;
  final DateTime? mesInicial;

  /// Solo pruebas: precios, cuota, cupón y clases sin pasar por el servidor.
  @visibleForTesting
  final (Precios, Cuota, bool, List<FechaClase>)? datosPrueba;

  @override
  State<ReservaScreen> createState() => _ReservaScreenState();
}

class _ReservaScreenState extends State<ReservaScreen> {
  late final _r = ReservasRepo(widget.repo.sesion);
  _Paso _paso = _Paso.elegir;
  bool _adelante = true;
  bool _guardando = false;
  String? _error;

  Precios? _precios;
  Cuota? _cuota;
  bool _hayCupon = false;
  bool _usarCupon = false;
  List<FechaClase>? _clases;
  List<MesReserva>? _meses;
  final _clasesSel = <String>{};
  final _tallaPorFecha = <String, String>{};
  Set<DateTime> _mesesSel = {};
  bool _transferenciaAbierta = false;

  bool get _esMes => widget.tipo == TipoReserva.mes;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    final prueba = widget.datosPrueba;
    try {
      final res = prueba != null
          ? <Object>[prueba.$1, prueba.$2, prueba.$3, if (!_esMes) prueba.$4]
          : await Future.wait([_r.precios(), widget.repo.anticipada.cuota(), _r.cuponDisponible(), if (!_esMes) _r.fechas()]);
      if (!mounted) return;
      setState(() {
        _precios = res[0] as Precios;
        _cuota = res[1] as Cuota;
        _hayCupon = res[2] as bool;
        if (_esMes) {
          _meses = _r.meses(_cuota!);
          _mesesSel = _r.preseleccion(_meses!);
          // Desde un evento: solo ese mes (web: `_evFabReservaParaEvento()`).
          final mi = widget.mesInicial;
          if (mi != null && _meses!.any((m) => m.mes == mi && !m.pagado)) _mesesSel = {mi};
        } else {
          _clases = res[3] as List<FechaClase>;
          final ci = widget.claseInicial;
          final c = _clases!.where((c) => c.id == ci).firstOrNull;
          if (c != null && c.disponible) _clasesSel.add(c.id);
          if (ci != null && c != null && !c.elegible) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(c.razon)));
            });
          }
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  int get _creditos => _cuota?.reservas.where((r) => r['estado'] == 'Reagendar').length ?? 0;

  int get _cantidad => _esMes ? _mesesSel.length : _clasesSel.length;

  Total get _total => _r.total(tipo: widget.tipo, cantidad: _cantidad, p: _precios ?? const Precios(0, 0), creditos: _creditos, cupon: _usarCupon);

  void _ir(int delta) {
    final i = _paso.index + delta;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    if (i >= _Paso.values.length) return;
    setState(() {
      _adelante = delta > 0;
      _paso = _Paso.values[i];
    });
  }

  @override
  Widget build(BuildContext context) {
    final total = _total;
    final listo = _precios != null && (_esMes ? _meses != null : _clases != null);
    return Asistente(
      titulo: _esMes ? 'Reserva por mes' : 'Reserva por clase',
      indice: _paso.index,
      total: _Paso.values.length,
      tituloPaso: switch (_paso) {
        _Paso.elegir => _esMes ? 'Elige los meses' : 'Elige tus clases',
        _Paso.pago => total.monto == 0 ? 'Confirma tu reserva' : 'Paga tu reserva',
      },
      ayuda: switch (_paso) {
        _Paso.elegir =>
          _esMes
              ? 'Puedes pagar varios meses de una vez.'
              : _r.resumenEquipo == null
              ? null
              : 'Usarás del equipo: ${_r.resumenEquipo!.toLowerCase()}.',
        _Paso.pago =>
          total.monto == 0 ? 'No tienes nada que pagar.' : 'Al elegir cómo pagar, tu reserva queda registrada y pendiente hasta que el equipo revise el pago.',
      },
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      cuerpo: _error != null
          ? _errorCarga(context)
          : !listo
          ? const Center(child: PivotCargando())
          : switch (_paso) {
              _Paso.elegir => _esMes ? _pasoMeses(context) : _pasoClases(context),
              _Paso.pago => _pasoPago(context, total),
            },
      textoBoton: switch (_paso) {
        _Paso.elegir => _cantidad == 0 ? 'Siguiente' : 'Siguiente · ${ReservasRepo.dinero(total.monto)}',
        _Paso.pago => total.monto == 0 ? 'Confirmar reserva' : null,
      },
      alContinuar: switch (_paso) {
        _Paso.elegir => _cantidad == 0 ? null : () => _ir(1),
        _Paso.pago => total.monto == 0 && !_guardando ? () => _confirmar(null) : null,
      },
      ocupado: _guardando,
    );
  }

  Widget _errorCarga(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(_error!),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
      ],
    ),
  );

  // ─── Paso 1: clases ───────────────────────────────────────────────────

  Widget _pasoClases(BuildContext context) {
    final p = context.pivot;
    final clases = _clases!;
    if (clases.isEmpty) {
      return Center(
        child: Text('No hay clases disponibles por ahora.', style: TextStyle(color: p.textoSecundario)),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        if (_creditos > 0)
          _aviso(
            context,
            Icons.autorenew_rounded,
            'Tienes $_creditos ${_creditos == 1 ? 'clase a favor' : 'clases a favor'} por entrenamientos cancelados. Se descuentan solas.',
          ),
        for (final c in clases) _tarjetaClase(context, c),
      ],
    );
  }

  Widget _tarjetaClase(BuildContext context, FechaClase c) {
    final p = context.pivot;
    final sel = _clasesSel.contains(c.id);
    final otraTalla = _tallaPorFecha[c.id];
    final f = c.fecha;
    final titulo = f == null ? c.id : '${Fechas.dia(f)[0].toUpperCase()}${Fechas.dia(f).substring(1)} ${Fechas.corta(f)}';
    final detalle = [if (c.hora.isNotEmpty) c.hora, if (c.lugar.isNotEmpty) c.lugar].join(' · ');
    final String? nota = !c.elegible
        ? c.razon
        : (c.tallaAgotada ? (otraTalla != null ? 'Con patines talla $otraTalla' : 'Sin patines de tu talla: toca para elegir otra') : null);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: c.elegible ? 1 : 0.5,
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
              onTap: !c.elegible ? null : () => _tocarClase(c),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            titulo,
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                          ),
                          if (detalle.isNotEmpty) ...[const SizedBox(height: 2), Text(detalle, style: TextStyle(fontSize: 13, color: p.textoSecundario))],
                          if (nota != null) ...[
                            const SizedBox(height: 6),
                            Text(
                              nota,
                              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c.elegible ? p.marcaTexto : p.textoSecundario),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    _circulo(p, sel),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _tocarClase(FechaClase c) async {
    if (_clasesSel.contains(c.id)) {
      setState(() {
        _clasesSel.remove(c.id);
        _tallaPorFecha.remove(c.id);
        _ajustarCupon();
      });
      return;
    }
    if (c.tallaAgotada) {
      final t = await _elegirTalla(c);
      if (t == null || !mounted) return;
      _tallaPorFecha[c.id] = t;
    }
    setState(() {
      _clasesSel.add(c.id);
      _ajustarCupon();
    });
  }

  void _ajustarCupon() {
    if (_cantidad <= _creditos) _usarCupon = false;
  }

  /// Sin patines de tu talla esa fecha: elegir otra talla libre (web:
  /// `abrirSheetTallaNuevaReserva()`).
  Future<String?> _elegirTalla(FechaClase c) {
    return showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => FutureBuilder<List<String>>(
        future: _r.tallasLibres(c.id),
        builder: (context, s) {
          final p = context.pivot;
          return Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('No quedan patines talla ${_r.talla}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text('Puedes reservar esta fecha con otra talla:', style: TextStyle(color: p.textoSecundario)),
                const SizedBox(height: 16),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: !s.hasData
                      ? const Padding(
                          padding: EdgeInsets.all(16),
                          child: Center(child: PivotCargando()),
                        )
                      : s.data!.isEmpty
                      ? Text('No quedan patines libres para esta fecha.', style: TextStyle(color: p.textoSecundario))
                      : Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [for (final t in s.data!) ActionChip(label: Text('Talla $t'), onPressed: () => Navigator.of(context).pop(t))],
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  // ─── Paso 1: meses ────────────────────────────────────────────────────

  Widget _pasoMeses(BuildContext context) {
    final p = context.pivot;
    final meses = _meses!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        if (meses.any((m) => m.pasado)) _aviso(context, Icons.info_outline_rounded, 'Tienes meses anteriores sin pagar; ya están marcados.'),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.35,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          children: [
            for (final m in meses)
              _celdaMes(
                p,
                m,
                sel: _mesesSel.contains(m.mes),
                alTocar: m.pagado ? null : () => setState(() => _mesesSel.contains(m.mes) ? _mesesSel.remove(m.mes) : _mesesSel.add(m.mes)),
              ),
          ],
        ),
      ],
    );
  }

  Widget _celdaMes(PivotPaleta p, MesReserva m, {required bool sel, VoidCallback? alTocar}) {
    final sub = m.pagado ? 'Pagado' : (m.pasado ? 'Adeudado' : '${m.mes.year}');
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: m.pagado ? 0.5 : 1,
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
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  Fechas.mesNombre(m.mes),
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: sel ? p.sobreSuave : p.texto),
                ),
                const SizedBox(height: 2),
                Text(
                  sub,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: m.pagado || m.pasado ? FontWeight.w600 : FontWeight.w400,
                    color: m.pasado ? p.marcaTexto : p.textoSecundario,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ─── Paso 2: pago ─────────────────────────────────────────────────────

  Widget _pasoPago(BuildContext context, Total t) {
    final p = context.pivot;
    final cuponPosible = !_esMes && _hayCupon && _cantidad > t.aFavor;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _cajaTotal(context, t),
        if (cuponPosible) ...[
          const SizedBox(height: 12),
          Material(
            color: p.tarjeta,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
            child: SwitchListTile(
              value: _usarCupon,
              onChanged: (v) => setState(() => _usarCupon = v),
              secondary: Icon(Icons.confirmation_number_outlined, color: p.marcaTexto),
              title: const Text('Usar mi cupón'),
              subtitle: const Text('1 clase gratis · personal e intransferible'),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
            ),
          ),
        ],
        if (t.monto > 0) ...[
          const SizedBox(height: 20),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
            onPressed: _guardando ? null : () => _confirmar(Pagos.deuna),
            icon: const Icon(Icons.qr_code_2_rounded),
            label: Text('Paga con DeUna · ${ReservasRepo.dinero(t.monto)}'),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
            child: Text(
              'Se abre DeUna: escribe el monto ${ReservasRepo.dinero(t.monto)} y paga. Después vuelve a Pivot.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, color: p.textoSecundario),
            ),
          ),
          const SizedBox(height: 16),
          _transferencia(context, t),
        ],
      ],
    );
  }

  Widget _cajaTotal(BuildContext context, Total t) {
    final p = context.pivot;
    final items = _esMes
        ? (_mesesSel.toList()..sort()).map((m) => ReglaAnticipada.nombreMes(m)).toList()
        : _clases!.where((c) => _clasesSel.contains(c.id)).map(ReservasRepo.etiquetaClase).toList();
    final partes = [
      if (t.cobradas > 0)
        '${t.cobradas} ${_esMes ? (t.cobradas == 1 ? 'mes' : 'meses') : (t.cobradas == 1 ? 'clase' : 'clases')} × ${ReservasRepo.dinero(t.precio)}',
      if (t.aFavor > 0) '${t.aFavor} a favor',
      if (t.cupon > 0) '1 con cupón',
    ];
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Total',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: p.sobreSuave),
          ),
          TweenAnimationBuilder<double>(
            tween: Tween(end: t.monto),
            duration: const Duration(milliseconds: 300),
            builder: (context, v, _) => Text(
              ReservasRepo.dinero(v),
              style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: p.sobreSuave),
            ),
          ),
          Text(partes.join(' + '), style: TextStyle(fontSize: 13, color: p.sobreSuave)),
          const SizedBox(height: 10),
          for (final i in items)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text('• $i', style: TextStyle(fontSize: 13, color: p.sobreSuave)),
            ),
        ],
      ),
    );
  }

  Widget _transferencia(BuildContext context, Total t) {
    final p = context.pivot;
    return Material(
      color: p.tarjeta,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          ListTile(
            leading: Icon(Icons.account_balance_outlined, color: p.marcaTexto),
            title: const Text('Transferencia bancaria'),
            subtitle: const Text(Pagos.banco),
            trailing: AnimatedRotation(
              turns: _transferenciaAbierta ? 0.5 : 0,
              duration: const Duration(milliseconds: 220),
              child: const Icon(Icons.expand_more_rounded),
            ),
            onTap: () => setState(() => _transferenciaAbierta = !_transferenciaAbierta),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: !_transferenciaAbierta
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 8, 16),
                    child: Column(
                      children: [
                        for (final (etiqueta, valor) in Pagos.cuenta)
                          Row(
                            children: [
                              SizedBox(
                                width: 104,
                                child: Text(etiqueta, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                              ),
                              Expanded(
                                child: Text(
                                  valor,
                                  style: TextStyle(fontWeight: FontWeight.w600, color: p.texto),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Copiar',
                                icon: const Icon(Icons.copy_rounded, size: 18),
                                onPressed: () {
                                  Clipboard.setData(ClipboardData(text: valor));
                                  ScaffoldMessenger.of(context)
                                    ..hideCurrentSnackBar()
                                    ..showSnackBar(SnackBar(content: Text('$etiqueta copiado')));
                                },
                              ),
                            ],
                          ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: _guardando ? null : () => _confirmar(null),
                            child: Text('Ya transferí ${ReservasRepo.dinero(t.monto)}'),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  // ─── Confirmar ────────────────────────────────────────────────────────

  Future<void> _confirmar(String? urlPago) async {
    if (_guardando) return;
    setState(() => _guardando = true);
    final total = _total;
    final resultado = await _r.confirmar(
      tipo: widget.tipo,
      clases: _clases?.where((c) => _clasesSel.contains(c.id)).toList() ?? const [],
      meses: _mesesSel.toList()..sort(),
      tallaPorFecha: _tallaPorFecha,
      total: total,
      // Dónde dice que pagó, para que el Pivot sepa dónde revisar.
      medio: total.monto == 0 ? null : (urlPago == Pagos.deuna ? 'deuna' : 'transferencia'),
    );
    if (!mounted) return;
    if (resultado.guardados.isEmpty) {
      setState(() => _guardando = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo guardar tu reserva. Intenta de nuevo.')));
      return;
    }
    // La reserva ya quedó registrada; recién ahí se abre DeUna (como la web).
    if (urlPago != null) await launchUrl(Uri.parse(urlPago), mode: LaunchMode.inAppBrowserView);
    widget.repo.cargar(forzar: true);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 320),
        pageBuilder: (_, _, _) => ReservaExitoScreen(resultado: resultado, total: total, esClase: !_esMes),
        transitionsBuilder: (_, a, _, child) => FadeTransition(
          opacity: a,
          child: ScaleTransition(
            scale: Tween(begin: 0.96, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
            child: child,
          ),
        ),
      ),
    );
  }

  Widget _aviso(BuildContext context, IconData icono, String texto) {
    final p = context.pivot;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Row(
        children: [
          Icon(icono, color: p.sobreSuave),
          const SizedBox(width: 12),
          Expanded(
            child: Text(texto, style: TextStyle(fontSize: 13, height: 1.35, color: p.sobreSuave)),
          ),
        ],
      ),
    );
  }

  Widget _circulo(PivotPaleta p, bool sel) => AnimatedContainer(
    duration: const Duration(milliseconds: 200),
    width: 26,
    height: 26,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: sel ? p.marca : null,
      border: Border.all(color: sel ? p.marca : p.borde, width: 2),
    ),
    child: AnimatedOpacity(
      duration: const Duration(milliseconds: 160),
      opacity: sel ? 1 : 0,
      child: Icon(Icons.check_rounded, size: 16, color: p.sobreMarca),
    ),
  );
}

/// "¡Reserva registrada!" (web: s6) con el botón para mandar el comprobante.
class ReservaExitoScreen extends StatelessWidget {
  const ReservaExitoScreen({super.key, required this.resultado, required this.total, required this.esClase});
  final ResultadoReserva resultado;
  final Total total;
  final bool esClase;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final t = Theme.of(context).textTheme;
    final gratis = total.monto == 0;
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        children: [
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.6, end: 1),
            duration: const Duration(milliseconds: 520),
            curve: Curves.elasticOut,
            builder: (context, s, child) => Transform.scale(scale: s, child: child),
            child: Icon(Icons.check_circle_rounded, size: 84, color: p.marca),
          ),
          const SizedBox(height: 16),
          Text(
            '¡Reserva registrada!',
            textAlign: TextAlign.center,
            style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          Text(
            gratis
                ? 'Queda pendiente hasta que el equipo la apruebe. Te llegará una notificación.'
                : 'Queda pendiente hasta que el equipo revise tu pago. Te llegará una notificación cuando esté aprobada.',
            textAlign: TextAlign.center,
            style: TextStyle(height: 1.4, color: p.textoSecundario),
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final g in resultado.guardados)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Icon(Icons.check_rounded, size: 18, color: p.marcaTexto),
                        const SizedBox(width: 8),
                        Expanded(child: Text(g)),
                      ],
                    ),
                  ),
                for (final f in resultado.fallidos)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Icon(Icons.error_outline_rounded, size: 18, color: p.textoSecundario),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text('$f (no se pudo guardar)', style: TextStyle(color: p.textoSecundario)),
                        ),
                      ],
                    ),
                  ),
                const Divider(height: 20),
                Text('Total: ${ReservasRepo.dinero(total.monto)}', style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          if (!gratis)
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: () => launchUrl(
                Uri.parse('https://wa.me/${Pagos.whatsapp}?text=${Uri.encodeComponent(resultado.mensajeWhatsapp)}'),
                mode: LaunchMode.externalApplication,
              ),
              icon: Icon(IconosMarca.whatsapp),
              label: const Text('Enviar comprobante por WhatsApp'),
            ),
          const SizedBox(height: 10),
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Listo')),
          if (esClase) ...[
            const SizedBox(height: 8),
            Text(
              'Si no puedes venir, cancela o reagenda lo antes posible para liberar tu cupo.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, color: p.textoSecundario),
            ),
          ],
        ],
      ),
    );
  }
}
