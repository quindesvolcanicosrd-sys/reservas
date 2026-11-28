import 'package:flutter/material.dart';

import '../../core/fechas.dart';
import '../../core/tema.dart';
import '../widgets_comunes.dart';
import 'que_lleva_calculo.dart';
import 'social_repo.dart';
import 'social_widgets.dart';

// ─── Vista de una fiesta (Victor, 2026-11-21) ──────────────────────────────
// Cards con lo importante para ti; el detalle completo de cada cosa se abre en
// una subsección (y ahí se edita, desde su barra). Arriba de todo, un banner
// con lo que te falta completar.

/// Último estado cargado de cada fiesta (solo en memoria) y un aviso cuando
/// cambia, para que el detalle del evento y las subsecciones se refresquen.
final estadosSociales = <String, EstadoSocial>{};
final versionSocial = ValueNotifier<int>(0);

void guardarEstadoSocial(String idEvento, EstadoSocial e) {
  estadosSociales[idEvento] = e;
  versionSocial.value++;
}

/// Subsección de una pieza de la fiesta: se refresca sola al guardar y el
/// lápiz de la tarjeta queda en la barra.
Future<void> abrirSubseccionSocial(
  BuildContext context, {
  required String idEvento,
  required String titulo,
  required Widget Function(EstadoSocial e) contenido,
}) {
  final accion = ValueNotifier<Widget?>(null);
  return Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(
          title: Text(titulo),
          actions: [
            ValueListenableBuilder<Widget?>(
              valueListenable: accion,
              builder: (_, a, _) => AnimatedSwitcher(duration: const Duration(milliseconds: 200), child: a ?? const SizedBox.shrink()),
            ),
            const SizedBox(width: 4),
          ],
        ),
        body: SafeArea(
          child: ValueListenableBuilder<int>(
            valueListenable: versionSocial,
            builder: (context, _, _) {
              final e = estadosSociales[idEvento];
              if (e == null) return const Center(child: CircularProgressIndicator());
              return ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [SinMarcoSocial(accion: accion, child: contenido(e))],
              );
            },
          ),
        ),
      ),
    ),
  );
}

/// Card de una pieza: ícono, título, una línea de estado y se toca para abrir.
class _CardPieza extends StatelessWidget {
  const _CardPieza({
    required this.icono,
    required this.titulo,
    required this.texto,
    this.estado,
    this.estadoActivo = true,
    required this.alTocar,
    this.destacado,
    this.gradiente,
  });

  /// Fondo de regalo con degradado (amigo secreto y regalo robado, 2026-11-28).
  final LinearGradient? gradiente;
  final IconData icono;
  final String titulo, texto;

  /// Lo más importante, en negrita (ej. "Tope del regalo: $15").
  final String? destacado;
  final String? estado;
  final bool estadoActivo;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final g = gradiente;
    if (g != null) return _conGradiente(context, g);
    final p = context.pivot;
    return SizedBox(
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.grande),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: alTocar,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconoTarjetaSocial(icono: icono),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        titulo,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.texto),
                      ),
                    ),
                  ],
                ),
                // La pastilla debajo del título, para que nunca se corte (Victor, 2026-11-22).
                if (estado != null) ...[const SizedBox(height: 8), Etiqueta(texto: estado!, apagada: !estadoActivo)],
                const SizedBox(height: 8),
                if (destacado != null)
                  Text(
                    destacado!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.texto),
                  ),
                Text(
                  texto,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: p.textoSecundario),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

extension on _CardPieza {
  Widget _conGradiente(BuildContext context, LinearGradient g) {
    const t = PivotPaleta.sobreSeccion;
    return Container(
      decoration: BoxDecoration(gradient: g, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: alTocar,
          child: Stack(
            children: [
              // Moño de regalo de fondo.
              Positioned(right: -14, bottom: -18, child: Icon(icono, size: 96, color: t.withValues(alpha: 0.13))),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(color: t.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(PivotRadios.chip)),
                          child: Icon(icono, size: 18, color: t),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            titulo,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: t),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (estado != null) _pill(estado!, estadoActivo ? Icons.check_rounded : Icons.remove_rounded),
                        if (destacado != null) _pill(destacado!, Icons.sell_outlined),
                      ],
                    ),
                    const Spacer(),
                    Text(
                      texto,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, height: 1.3, color: t.withValues(alpha: 0.9)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pill(String texto, IconData i) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(color: PivotPaleta.sobreSeccion.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(PivotRadios.chip)),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(i, size: 14, color: PivotPaleta.sobreSeccion),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            texto,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: PivotPaleta.sobreSeccion),
          ),
        ),
      ],
    ),
  );
}

/// Mis pistas y lista de deseos a simple vista (Victor, 2026-11-28): tarjeta
/// de regalo con degradado, tus deseos y gustos en pastillas.
class MisPistasTarjeta extends StatelessWidget {
  const MisPistasTarjeta({super.key, required this.estado, required this.alTocar});
  final EstadoSocial estado;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    const t = PivotPaleta.sobreSeccion;
    final pf = estado.perfil;
    final deseos = [...pf.wishlist]..sort((a, b) => (b.favorito ? 1 : 0) - (a.favorito ? 1 : 0));
    final chips = [
      for (final d in deseos.take(4)) (d.favorito ? Icons.favorite_rounded : Icons.redeem_rounded, d.texto),
      for (final g in pf.gustos.take(3)) (Icons.auto_awesome_rounded, g),
    ];
    final (g, _, _, _) = PivotPaleta.festivo('');
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Container(
        decoration: BoxDecoration(gradient: g, borderRadius: BorderRadius.circular(PivotRadios.grande)),
        clipBehavior: Clip.antiAlias,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: alTocar,
            child: Stack(
              children: [
                Positioned(right: -10, top: -16, child: Icon(Icons.card_giftcard_rounded, size: 110, color: t.withValues(alpha: 0.12))),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.redeem_rounded, color: t),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Mis pistas y lista de deseos',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: t),
                            ),
                          ),
                          Icon(Icons.chevron_right_rounded, color: t),
                        ],
                      ),
                      const SizedBox(height: 10),
                      if (chips.isEmpty)
                        Text(
                          'Cuéntale a tu amigo secreto qué te gusta y qué te haría ilusión recibir.',
                          style: TextStyle(fontSize: 13.5, height: 1.35, color: t.withValues(alpha: 0.92)),
                        )
                      else
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final (i, x) in chips)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(color: t.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(PivotRadios.chip)),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(i, size: 14, color: t),
                                    const SizedBox(width: 5),
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(maxWidth: 200),
                                      child: Text(
                                        x,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: t),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      if (chips.isNotEmpty && pf.wishlist.length + pf.gustos.length > chips.length) ...[
                        const SizedBox(height: 8),
                        Text(
                          'y ${pf.wishlist.length + pf.gustos.length - chips.length} más',
                          style: TextStyle(fontSize: 12.5, color: t.withValues(alpha: 0.85)),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "Qué llevar" en la vista del evento (Victor, 2026-11-22): compacta. El
/// título con "Tu parte N %", lo que falta y, si no cubriste tu parte, las
/// secciones donde puedes anotarte para deslizar. Al 100 % no muestra más.
class QueLlevaResumen extends StatelessWidget {
  const QueLlevaResumen({super.key, required this.repo, required this.estado, required this.alCambiar, required this.alAbrir});
  final SocialRepo repo;
  final EstadoSocial estado;
  final VoidCallback alCambiar;
  final VoidCallback alAbrir;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final e = estado;
    final t = ComidaTarjeta(repo: repo, estado: e, alCambiar: alCambiar);
    final faltan = [
      for (final c in e.comida)
        if (!c.cerrada && (c.falta || (c.meta > 0 && c.aportado < c.meta))) c.nombre,
    ];
    final cuenta = e.asiste && e.seccionesParte.isNotEmpty;
    final parte = e.miParte.clamp(0, 1).toDouble();
    final paraAnotar = cuenta && parte < 1
        ? [
            for (final c in e.comida)
              if (!c.llena && !c.cerrada) c,
          ]
        : const <CategoriaComida>[];
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Material(
        color: p.tarjeta,
        borderRadius: BorderRadius.circular(PivotRadios.grande),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: alAbrir,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const IconoTarjetaSocial(icono: Icons.restaurant_rounded),
                    const SizedBox(width: 10),
                    // La pastilla va entera junto al título; si falta lugar se acorta el título (QA 2026-11-28).
                    Expanded(
                      child: Row(
                        children: [
                          Flexible(
                            child: Text(
                              'Qué llevar',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.texto),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (cuenta) Etiqueta(texto: 'Tu parte: ${(parte * 100).round()} %', apagada: parte >= 1),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                  ],
                ),
                if (faltan.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8, right: 6),
                    child: Text(
                      'Falta aún: ${faltan.join(', ')}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: p.marcaTexto),
                    ),
                  ),
                if (!e.asiste)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('Confirma tu asistencia para anotarte.', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                  ),
                if (paraAnotar.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 70,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: paraAnotar.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final c = paraAnotar[i];
                        final hace = c.falta || (c.meta > 0 && c.aportado < c.meta);
                        return Material(
                          color: hace ? p.suave : p.fondo,
                          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                            onTap: () => t.anotarEn(context, c),
                            child: Container(
                              width: 150,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          c.nombre,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontWeight: FontWeight.w700, color: hace ? p.sobreSuave : p.texto),
                                        ),
                                        Text(hace ? 'Hace falta' : 'Anótate', style: TextStyle(fontSize: 12, color: hace ? p.sobreSuave : p.textoSecundario)),
                                      ],
                                    ),
                                  ),
                                  Icon(Icons.add_circle_outline_rounded, size: 20, color: p.marcaTexto),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Subsección de Qué llevar con tres pestañas: Yo llevo, El resto lleva y Falta.
class QueLlevarVista extends StatefulWidget {
  const QueLlevarVista({super.key, required this.repo, required this.estado, required this.alCambiar, this.asisten = const []});
  final SocialRepo repo;
  final EstadoSocial estado;
  final VoidCallback alCambiar;
  final List<(String, String)> asisten;

  @override
  State<QueLlevarVista> createState() => _QueLlevarVistaState();
}

class _QueLlevarVistaState extends State<QueLlevarVista> {
  late var _vista = widget.estado.asiste && widget.estado.comida.any((c) => c.aportes.any((a) => a['mio'] == true)) ? 'mio' : 'falta';

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<String>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(value: 'mio', label: Text('Yo llevo')),
            ButtonSegment(value: 'resto', label: Text('El resto lleva')),
            ButtonSegment(value: 'falta', label: Text('Falta')),
          ],
          selected: {_vista},
          onSelectionChanged: (x) => setState(() => _vista = x.first),
        ),
        const SizedBox(height: 16),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(
            key: ValueKey(_vista),
            child: ComidaTarjeta(
              repo: widget.repo,
              estado: widget.estado,
              alCambiar: widget.alCambiar,
              vista: _vista,
              asisten: widget.asisten,
              alAgregar: () => setState(() => _vista = 'falta'),
            ),
          ),
        ),
      ],
    );
  }
}

/// Actividades del evento en cards que se deslizan (amigo secreto, regalo
/// robado, playlist, dress code, premios). Cada una abre su subsección.
class ActividadesSocial extends StatelessWidget {
  const ActividadesSocial({super.key, required this.estado, required this.alAbrir, this.simbolo, this.alPistas});

  /// Abre «Mis pistas»; si está, se muestra la tarjeta de deseos arriba.
  final VoidCallback? alPistas;
  final EstadoSocial estado;
  final String? simbolo;

  /// 'amigo' | 'robado' | 'playlist' | 'dress' | 'premios'
  final void Function(String) alAbrir;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final e = estado;
    final cierre = e.cierre;
    final cards = <Widget>[
      if (e.modulo('amigoSecreto'))
        _CardPieza(
          gradiente: PivotPaleta.degradadoMarca,
          icono: Icons.redeem_rounded,
          titulo: 'Amigo secreto',
          estado: e.asiste ? (e.participaAmigo ? 'Participas' : 'No participas') : null,
          estadoActivo: e.participaAmigo,
          destacado: e.topeAmigo != null ? 'Tope ${montoSocial(e.topeAmigo, simbolo)}' : null,
          texto: !e.asiste
              ? 'Marca Asistiré para participar.'
              : !e.participaAmigo
              ? (e.inscripcionAbierta ? 'Todavía puedes sumarte.' : 'Esta vez no participas.')
              : e.sorteado
              ? 'Ya puedes ver a quién le regalas.'
              : cierre != null
              ? 'Sorteo el ${Fechas.corta(cierre)}'
              : 'Sorteo cuando cierre la inscripción',
          alTocar: () => alAbrir('amigo'),
        ),
      if (e.modulo('regaloRobado'))
        _CardPieza(
          gradiente: PivotPaleta.festivo('navidad').$1,
          icono: Icons.card_giftcard_rounded,
          titulo: 'Regalo robado',
          estado: e.asiste ? (e.participaRobado ? 'Participas' : 'No participas') : null,
          estadoActivo: e.participaRobado,
          destacado: e.topeRobado != null ? 'Tope ${montoSocial(e.topeRobado, simbolo)}' : null,
          texto: e.juegoRobado['fase'] != null ? 'El juego ya empezó' : 'Trae un regalo envuelto',
          alTocar: () => alAbrir('robado'),
        ),
      if (e.playlist != null)
        _CardPieza(
          icono: Icons.queue_music_rounded,
          titulo: 'Playlist',
          texto: '${e.playlist!['link'] ?? ''}'.isEmpty ? 'Sin enlace todavía.' : 'Agrega tus canciones.',
          alTocar: () => alAbrir('playlist'),
        ),
      if (e.dress != null)
        _CardPieza(
          icono: Icons.checkroom_rounded,
          titulo: 'Dress code',
          texto: '${e.dress!['texto'] ?? ''}'.trim().isEmpty ? 'Ven como quieras.' : '${e.dress!['texto']}'.trim(),
          alTocar: () => alAbrir('dress'),
        ),
      if (e.premios != null)
        _CardPieza(
          icono: Icons.emoji_events_outlined,
          titulo: 'Premios',
          texto: e.premios!.isEmpty ? 'Por definir.' : '${e.premios!.length} ${e.premios!.length == 1 ? 'premio' : 'premios'}',
          alTocar: () => alAbrir('premios'),
        ),
    ];
    if (cards.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 8),
          child: Text(
            'Actividades del evento',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.textoSecundario),
          ),
        ),
        if (alPistas != null && e.modulo('amigoSecreto') && e.asiste && e.participaAmigo) MisPistasTarjeta(estado: e, alTocar: alPistas!),
        SizedBox(
          height: 176,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: cards.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, i) => SizedBox(width: cards.length == 1 ? MediaQuery.sizeOf(context).width - 32 : 220, child: cards[i]),
          ),
        ),
      ],
    );
  }
}

/// Lo que te falta completar en la fiesta, con atajos (arriba del todo).
class PendientesFiesta extends StatelessWidget {
  const PendientesFiesta({super.key, required this.estado, required this.alParticipar, required this.alDeseos, required this.alComida});
  final EstadoSocial estado;
  final VoidCallback alParticipar, alDeseos, alComida;

  static List<(IconData, String, String, String)> pendientes(EstadoSocial e) => [
    if (e.asiste && e.modulo('amigoSecreto') && !e.participaAmigo && e.inscripcionAbierta && !e.sorteado)
      (Icons.redeem_rounded, 'No participas del amigo secreto. ¿Quieres participar?', 'Participar', 'amigo'),
    if (e.asiste && e.modulo('amigoSecreto') && e.participaAmigo && e.perfil.vacio)
      (Icons.list_alt_rounded, 'No completaste tu lista de deseos. ¿La completas?', 'Completar', 'deseos'),
    if (e.asiste && e.modulo('comida') && e.seccionesParte.isNotEmpty && e.miParte < 1)
      (
        Icons.restaurant_rounded,
        e.miParte <= 0 ? 'Aún no pusiste qué llevarás al evento.' : 'Te falta completar lo que llevas.',
        e.miParte <= 0 ? 'Anotar' : 'Completar',
        'comida',
      ),
  ];

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final l = pendientes(estado);
    return AnimatedSize(
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: l.isEmpty
          ? const SizedBox(width: double.infinity)
          // Con el formato de las ayudas (como "¿Qué es un curso?"), pero
          // siempre abierto y con un botón por cosa (Victor, 2026-11-22).
          : Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.info_outline_rounded, size: 20, color: p.sobreSuave),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          l.length == 1 ? 'Te falta 1 cosa' : 'Te faltan ${l.length} cosas',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: p.sobreSuave),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  for (final (icono, texto, boton, que) in l)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        children: [
                          Icon(icono, size: 18, color: p.sobreSuave),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(texto, style: TextStyle(height: 1.35, color: p.sobreSuave)),
                          ),
                          const SizedBox(width: 8),
                          FilledButton.tonal(
                            onPressed: switch (que) {
                              'amigo' => alParticipar,
                              'deseos' => alDeseos,
                              _ => alComida,
                            },
                            child: Text(boton),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 6),
                ],
              ),
            ),
    );
  }
}
