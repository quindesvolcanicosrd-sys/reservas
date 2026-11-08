import 'package:flutter/material.dart';

import '../ajustes/componentes.dart';
import '../core/cargando.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import 'crear_tarea_screen.dart';
import 'recurrentes_screen.dart';
import 'tarea_screen.dart';
import 'tareas_modelos.dart';
import 'tareas_repo.dart';

/// Pestaña Tareas (nativa, 2026-11-08). Mismo lenguaje que Ajustes: grupos
/// en tarjeta, íconos con el degradado del área.
/// Orden: resumen del mes → Mis tareas (lo que vence antes arriba, lo vencido
/// en rojo) → Sugeridas para ti (si faltan puntos para la meta) →
/// Disponibles (con filtro por área) → Sin cupos → Baúl.
class TareasScreen extends StatefulWidget {
  const TareasScreen({super.key, required this.repo});
  final TareasRepo repo;

  @override
  State<TareasScreen> createState() => _TareasScreenState();
}

class _TareasScreenState extends State<TareasScreen> {
  TareasRepo get repo => widget.repo;
  String? _area; // filtro de Disponibles

  @override
  void initState() {
    super.initState();
    repo.cargar(forzar: repo.cargado);
  }

  void _abrir(Tarea t, {MiTarea? mia}) => SubAjustes.abrir(context, TareaScreen(repo: repo, tarea: t, mia: mia));

  Future<void> _nueva() async {
    await CrearTareaScreen.abrir(context, repo: repo, modo: repo.esAdmin ? ModoTarea.crear : ModoTarea.proponer);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: Text('Tareas', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        actions: [
          if (repo.esAdmin)
            IconButton(
              tooltip: 'Tareas recurrentes',
              icon: const Icon(Icons.event_repeat_rounded),
              onPressed: () => SubAjustes.abrir(context, RecurrentesScreen(repo: repo)),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _nueva,
        icon: const Icon(Icons.add_rounded),
        label: Text(repo.esAdmin ? 'Nueva tarea' : 'Proponer tarea'),
      ),
      body: ListenableBuilder(
        listenable: repo,
        builder: (context, _) {
          if (!repo.cargado) {
            return AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: repo.error == null ? const Center(child: PivotCargando()) : _Error(texto: repo.error!, alReintentar: () => repo.cargar(forzar: true)),
            );
          }
          return RefreshIndicator(
            onRefresh: () => repo.cargar(forzar: true),
            child: AnimatedSwitcher(duration: const Duration(milliseconds: 220), child: _lista(context)),
          );
        },
      ),
    );
  }

  Widget _lista(BuildContext context) {
    final p = context.pivot;
    final disponibles = repo.disponibles.where((x) => _area == null || x.area == _area).toList();
    final areas = {for (final x in repo.disponibles) x.area}.toList()
      ..sort((a, b) => AreaTarea.lista.indexOf(AreaTarea.de(a)).compareTo(AreaTarea.lista.indexOf(AreaTarea.de(b))));
    final sugeridas = repo.sugeridas;
    return ListView(
      key: ValueKey(repo.mias.length * 1000 + repo.tablero.length),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        _Resumen(repo: repo),
        GrupoAjustes(
          titulo: 'MIS TAREAS',
          filas: repo.mias.isEmpty
              ? [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Todavía no tienes tareas. Elige una de las disponibles.', style: TextStyle(color: p.textoSecundario)),
                  ),
                ]
              : [
                  for (final m in repo.mias)
                    FilaTarea(
                      tarea: m.tarea,
                      mia: m,
                      alTocar: () => _abrir(m.tarea, mia: m),
                    ),
                ],
        ),
        if (sugeridas.isNotEmpty)
          GrupoAjustes(
            titulo: 'SUGERIDAS PARA TI',
            pie: 'Te faltan ${textoPuntos(repo.faltan)} este mes para ${repo.meta!.nombre}.',
            filas: [for (final x in sugeridas) FilaTarea(tarea: x, hero: false, alTocar: () => _abrir(x))],
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
          child: Text(
            'DISPONIBLES',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: p.textoSecundario),
          ),
        ),
        if (areas.length > 1)
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(bottom: 8),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(label: const Text('Todas'), selected: _area == null, onSelected: (_) => setState(() => _area = null)),
                ),
                for (final a in areas)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      avatar: Icon(AreaTarea.de(a).icono, size: 18),
                      label: Text(a),
                      selected: _area == a,
                      onSelected: (si) => setState(() => _area = si ? a : null),
                    ),
                  ),
              ],
            ),
          ),
        GrupoAjustes(
          filas: disponibles.isEmpty
              ? [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      repo.esAdmin ? 'No hay tareas libres. Crea una con "Nueva tarea".' : 'No hay tareas libres por ahora. Puedes proponer una.',
                      style: TextStyle(color: p.textoSecundario),
                    ),
                  ),
                ]
              : [for (final x in disponibles) FilaTarea(tarea: x, alTocar: () => _abrir(x))],
        ),
        if (repo.completas.isNotEmpty)
          GrupoAjustes(
            titulo: 'SIN CUPOS',
            filas: [for (final x in repo.completas) FilaTarea(tarea: x, alTocar: () => _abrir(x))],
          ),
        if (repo.baul.isNotEmpty)
          GrupoAjustes(
            titulo: 'BAÚL',
            pie: 'Tareas que vencieron sin terminarse. Al rescatar una tienes el mismo plazo que tenía, contado desde hoy.',
            filas: [for (final x in repo.baul) FilaTarea(tarea: x, alTocar: () => _abrir(x))],
          ),
      ],
    );
  }
}

/// Tarjeta del mes: tareas activas contra el límite y puntos contra la meta.
class _Resumen extends StatelessWidget {
  const _Resumen({required this.repo});
  final TareasRepo repo;

  @override
  Widget build(BuildContext context) {
    final meta = repo.meta;
    final puntos = repo.puntosMes.round();
    final progreso = meta == null || meta.minPuntos == 0 ? null : (repo.puntosMes / meta.minPuntos).clamp(0.0, 1.0);
    const sobre = PivotPaleta.sobreSeccion;
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(gradient: PivotPaleta.degradadoMarca, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
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
                      'Este mes',
                      style: TextStyle(color: sobre.withValues(alpha: 0.85), fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      puntos == 1 ? '1 punto' : '$puntos puntos',
                      style: const TextStyle(color: sobre, fontSize: 26, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'Tareas activas',
                    style: TextStyle(color: sobre.withValues(alpha: 0.85), fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${repo.iniciadas} de ${repo.limite}',
                    style: const TextStyle(color: sobre, fontSize: 26, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ],
          ),
          if (progreso != null) ...[
            const SizedBox(height: 14),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: progreso),
              duration: const Duration(milliseconds: 700),
              curve: Curves.easeOutCubic,
              builder: (context, v, _) => ClipRRect(
                borderRadius: BorderRadius.circular(PivotRadios.chip),
                child: LinearProgressIndicator(value: v, minHeight: 8, color: sobre, backgroundColor: sobre.withValues(alpha: 0.25)),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              repo.faltan == 0
                  ? 'Ya llegaste a los ${meta!.minPuntos} puntos de ${meta.nombre}.'
                  : '${meta!.nombre} pide ${meta.minPuntos} puntos${meta.minClases > 0 ? ' o ${meta.minClases} clases' : ''} al mes.',
              style: TextStyle(color: sobre.withValues(alpha: 0.9), fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}

/// Fila de una tarea: ícono del área, título, vencimiento o cupos, puntos.
class FilaTarea extends StatelessWidget {
  const FilaTarea({super.key, required this.tarea, this.mia, this.alTocar, this.hero = true});
  final Tarea tarea;

  /// Vuela el ícono al detalle. Apagado donde la misma tarea puede repetirse (Sugeridas).
  final bool hero;
  final MiTarea? mia;
  final VoidCallback? alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final area = tarea.areaInfo;
    final (degradado, sobre) = PivotPaleta.seccion(area.seccion, Theme.of(context).brightness);
    final m = mia;
    final vencida = m != null && !m.enRevision && (m.dias ?? 0) < 0;
    final String detalle;
    if (m != null) {
      detalle = m.enRevision ? 'En revisión' : (m.notaRechazo.isNotEmpty ? 'Con cambios pedidos · ${textoVence(m.vence)}' : textoVence(m.vence));
    } else if (tarea.enBaul) {
      detalle = 'Venció · se puede rescatar';
    } else if (tarea.libres == 0) {
      detalle = 'Sin cupos · ${textoVence(tarea.vence)}';
    } else {
      detalle = '${tarea.libres == 1 ? '1 cupo libre' : '${tarea.libres} cupos libres'} · ${textoVence(tarea.vence)}';
    }
    final personas = tarea.personas;
    return InkWell(
      onTap: alTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            HeroOpcional(
              tag: hero ? 'tarea-${tarea.id}' : null,
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip + 2)),
                child: Icon(m?.enRevision == true ? Icons.hourglass_top_rounded : area.icono, size: 20, color: sobre),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tarea.titulo,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: p.texto),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      if (tarea.recurrente) ...[Icon(Icons.repeat_rounded, size: 14, color: p.textoSecundario), const SizedBox(width: 4)],
                      Flexible(
                        child: Text(
                          detalle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13.5,
                            color: vencida ? p.marcaTexto : p.textoSecundario,
                            fontWeight: vencida ? FontWeight.w700 : FontWeight.normal,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (m == null && personas.isNotEmpty) ...[const SizedBox(width: 8), PilaAvatares(personas: personas)],
            const SizedBox(width: 8),
            PillPuntos(puntos: tarea.puntos),
          ],
        ),
      ),
    );
  }
}

class HeroOpcional extends StatelessWidget {
  const HeroOpcional({super.key, required this.tag, required this.child});
  final String? tag;
  final Widget child;

  @override
  Widget build(BuildContext context) => tag == null ? child : Hero(tag: tag!, child: child);
}

class PillPuntos extends StatelessWidget {
  const PillPuntos({super.key, required this.puntos});
  final int puntos;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.boton)),
      child: Text(
        puntos == 0 ? 'Sin puntos' : '+$puntos',
        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: p.sobreSuave),
      ),
    );
  }
}

/// Hasta 3 avatares superpuestos de quienes tienen la tarea.
class PilaAvatares extends StatelessWidget {
  const PilaAvatares({super.key, required this.personas, this.tamano = 24});
  final List<PersonaTarea> personas;
  final double tamano;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final v = personas.take(3).toList();
    return SizedBox(
      width: tamano + (v.length - 1) * tamano * 0.6,
      height: tamano,
      child: Stack(
        children: [
          for (final (i, x) in v.indexed)
            Positioned(
              left: i * tamano * 0.6,
              child: AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: tamano, borde: p.tarjeta),
            ),
        ],
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error({required this.texto, required this.alReintentar});
  final String texto;
  final VoidCallback alReintentar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 40, color: p.textoSecundario),
            const SizedBox(height: 12),
            Text(
              texto,
              textAlign: TextAlign.center,
              style: TextStyle(color: p.textoSecundario),
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: alReintentar, child: const Text('Reintentar')),
          ],
        ),
      ),
    );
  }
}
