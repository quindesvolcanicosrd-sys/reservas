import 'package:animations/animations.dart';
import 'package:flutter/material.dart';

import 'tema.dart';

/// Marco único para todos los asistentes por pasos de la app (crear evento,
/// temporada de descanso, nuevo lugar, asistencia anticipada…), pedido
/// 2026-11-06: misma experiencia en todos.
/// - Barra de progreso arriba que se llena con suavidad.
/// - Entre pasos, la transición "eje compartido" de Material: el paso actual
///   sale hacia un lado y el nuevo entra desde el otro (hacia atrás, al revés).
/// - Título grande del paso + ayuda opcional, y un único botón fijo abajo.
/// - Atrás (flecha o gesto del sistema) vuelve un paso; en el primero, sale.
class Asistente extends StatelessWidget {
  const Asistente({
    super.key,
    required this.titulo,
    required this.indice,
    required this.total,
    required this.tituloPaso,
    this.ayuda,
    required this.clavePaso,
    required this.cuerpo,
    required this.adelante,
    required this.alAtras,
    this.textoBoton,
    this.alContinuar,
    this.ocupado = false,
  });

  final String titulo;
  final int indice;
  final int total;
  final String tituloPaso;
  final String? ayuda;
  final Object clavePaso;
  final Widget cuerpo;
  final bool adelante;
  final VoidCallback alAtras;

  /// Sin texto, el paso no muestra botón (por ejemplo, cuando tocar una
  /// opción ya avanza sola).
  final String? textoBoton;
  final VoidCallback? alContinuar;
  final bool ocupado;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final t = Theme.of(context).textTheme;
    return PopScope(
      canPop: indice == 0,
      onPopInvokedWithResult: (hecho, _) {
        if (!hecho) alAtras();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: indice == 0 ? 'Cerrar' : 'Atrás',
            icon: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Icon(indice == 0 ? Icons.close_rounded : Icons.arrow_back_rounded, key: ValueKey(indice == 0)),
            ),
            onPressed: indice == 0 ? () => Navigator.of(context).maybePop() : alAtras,
          ),
          title: Text(
            titulo,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: p.textoSecundario),
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: (indice + 1) / total),
              duration: const Duration(milliseconds: 380),
              curve: Curves.easeOutCubic,
              builder: (context, v, _) => LinearProgressIndicator(value: v, minHeight: 4, backgroundColor: p.tarjetaBorde, color: p.marca),
            ),
          ),
        ),
        body: PageTransitionSwitcher(
          duration: const Duration(milliseconds: 380),
          reverse: !adelante,
          transitionBuilder: (hijo, primaria, secundaria) => SharedAxisTransition(
            animation: primaria,
            secondaryAnimation: secundaria,
            transitionType: SharedAxisTransitionType.horizontal,
            fillColor: p.fondo,
            child: hijo,
          ),
          child: KeyedSubtree(
            key: ValueKey(clavePaso),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tituloPaso, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                      if (ayuda != null) ...[const SizedBox(height: 6), Text(ayuda!, style: TextStyle(fontSize: 14, height: 1.4, color: p.textoSecundario))],
                    ],
                  ),
                ),
                Expanded(child: cuerpo),
              ],
            ),
          ),
        ),
        bottomNavigationBar: AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          child: textoBoton == null
              ? const SizedBox(width: double.infinity)
              : SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      onPressed: ocupado ? null : alContinuar,
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        child: ocupado
                            ? SizedBox(
                                key: const ValueKey('ocupado'),
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2.5, color: p.sobreMarca),
                              )
                            : Text(textoBoton!, key: ValueKey(textoBoton)),
                      ),
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}

/// Tarjeta de opción grande (ícono + título + texto) para los asistentes.
class OpcionAsistente extends StatelessWidget {
  const OpcionAsistente({
    super.key,
    required this.icono,
    required this.titulo,
    required this.texto,
    required this.activa,
    required this.alTocar,
    this.habilitada = true,
  });
  final IconData icono;

  /// Deshabilitada se ve atenuada, pero el toque sigue llegando para explicar por qué.
  final bool habilitada;
  final String titulo;
  final String texto;
  final bool activa;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: habilitada ? 1 : 0.45,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color: activa ? p.suave : p.tarjeta,
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            border: Border.all(color: activa ? p.marca : p.tarjeta, width: 1.5),
          ),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              onTap: alTocar,
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Icon(icono, size: 28, color: p.marcaTexto),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            titulo,
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                          ),
                          const SizedBox(height: 2),
                          Text(texto, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
