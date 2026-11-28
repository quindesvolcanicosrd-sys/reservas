import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../ajustes/componentes.dart' show SubAjustes;
import '../ajustes/herramientas_liga.dart' show FuncionesLiga;
import '../core/deporte.dart';
import '../core/encabezado_seccion.dart' show TarjetaCrear;
import '../core/fechas.dart';
import '../core/navegacion.dart';
import '../core/tour.dart';
import '../core/tema.dart';
import '../core/vidrio.dart';
import '../cursos/cursos_screen.dart';
import '../eventos/detalle_screen.dart' show DetalleScreen;
import '../eventos/eventos_repo.dart';
import '../eventos/modelos.dart' show Evento;
import '../reglamento/reglamento_screen.dart' show TarjetaReglamento;
import '../sesion/sesion.dart';
import 'coach_screen.dart';
import 'equipo_tecnico.dart';
import 'mi_progreso_hero.dart';
import 'niveles_coach.dart';

/// Entreno en la barra de abajo (Victor, 2026-11-26; rediseño del
/// 2026-11-27, mockups A y B): Mi progreso manda, arriba y grande; después
/// los cursos en un carrusel y el próximo entrenamiento. Para entrenadorxs,
/// Mi progreso más compacto, el próximo entrenamiento con su plan y lo que
/// falta evaluar, los cursos y los planes; sus herramientas son íconos en la
/// barra de arriba.
class EntrenamientoScreen extends StatefulWidget {
  const EntrenamientoScreen({super.key, required this.sesion, required this.eventos});
  final Sesion sesion;
  final EventosRepo eventos;

  @override
  State<EntrenamientoScreen> createState() => _EntrenamientoScreenState();
}

class _EntrenamientoScreenState extends State<EntrenamientoScreen> {
  Sesion get s => widget.sesion;
  EstadoCursos _cursos = const EstadoCursos([], false);
  Map<String, dynamic>? _ficha;
  final _herramienta = ValueNotifier<String?>(null);

  bool get _usaCoach => s.esCoach && FuncionesLiga.coach(s);

  @override
  void initState() {
    super.initState();
    s.addListener(_refrescar);
    Navegacion.entrenamiento.addListener(_irAVista);
    WidgetsBinding.instance.addPostFrameCallback((_) => _irAVista());
    Navegacion.pestanaActual.addListener(_tour);
    _cargar();
  }

  /// Tour de Progreso la primera vez que se ve la pestaña (Victor, 2026-11-28).
  void _tour() {
    if (Navegacion.pestanaActual.value != 'Progreso') return;
    Future.delayed(const Duration(milliseconds: 900), () async {
      if (!mounted || Navegacion.pestanaActual.value != 'Progreso' || !(ModalRoute.of(context)?.isCurrent ?? false)) return;
      final tecnico = _usaCoach;
      final yaVisto = (await SharedPreferences.getInstance()).getBool('tour_progreso_v1') == true;
      if (!mounted || !context.mounted) return;
      final reglamento = Deporte.esDerby
          ? [
              PasoTour(
                clave: ClavesTour.progresoReglamento,
                titulo: 'Reglamento',
                texto: 'Las reglas del roller derby, las faltas con su señal y el libro de casos. Busca una duda o ponte a prueba con escenarios reales.',
              ),
            ]
          : const <PasoTour>[];
      Tour.mostrarSiCorresponde(
        context,
        preferencia: 'tour_progreso_v1',
        pasos: [
          PasoTour(
            clave: ClavesTour.progresoHero,
            titulo: 'Tu progreso',
            texto: 'El nivel en el que estás trabajando y cuántas habilidades llevas. Tócalo para ver el detalle.',
          ),
          PasoTour(
            clave: ClavesTour.progresoTecnico,
            titulo: 'Equipo técnico',
            texto: 'Quiénes arman los entrenamientos y te evalúan. Toca a una persona para ver con qué equipos trabaja.',
          ),
          PasoTour(
            clave: ClavesTour.progresoProximos,
            titulo: 'Entrenamientos de la semana',
            texto: tecnico
                ? 'Los de los próximos 7 días. «Armar» crea el plan en pasos y «Ver plan» lo muestra aquí mismo.'
                : 'Los de los próximos 7 días. Si el equipo técnico comparte el plan, lo ves con «Ver plan».',
          ),
          PasoTour(
            clave: ClavesTour.progresoCursos,
            titulo: 'Cursos',
            texto: 'Clases en grupo con un objetivo, como aprender a patinar o subir de nivel. Toca uno para inscribirte.',
          ),
          if (tecnico)
            PasoTour(
              clave: ClavesTour.progresoHabilidades,
              titulo: 'Habilidades y pruebas',
              texto: 'La lista de habilidades de la liga y las pruebas para medir el progreso. «Agregar» suma una nueva.',
            ),
          ...reglamento,
        ],
      ).then((_) async {
        // Quien ya había visto el recorrido de Progreso ve solo el paso nuevo;
        // quien lo ve por primera vez ya lo tuvo dentro.
        if (reglamento.isEmpty) return;
        final pr = await SharedPreferences.getInstance();
        if (!yaVisto) return pr.setBool('tour_reglamento_v1', true).then((_) {});
        if (mounted) Tour.mostrarSiCorresponde(context, preferencia: 'tour_reglamento_v1', pasos: reglamento);
      });
    });
  }

  void _refrescar() {
    if (mounted) setState(() {});
  }

  Future<void> _cargar() async {
    estadoCursos(s).then((e) {
      if (!mounted) return;
      setState(() => _cursos = e);
      Navegacion.puntoEntrenamiento.value = e.nuevos;
    });
    if (!FuncionesLiga.coach(s)) return;
    try {
      final r = await s.api.get('getFichaDeportiva', const {});
      NivelesCoach.actualizar(r['niveles']);
      if (!mounted || r['exito'] == false) return;
      setState(() => _ficha = r);
    } catch (_) {}
  }

  /// Una notificación o Novedades pidió una vista.
  void _irAVista() {
    final v = Navegacion.entrenamiento.value;
    if (v == null || !mounted) return;
    Navegacion.entrenamiento.value = null;
    Navigator.of(context).popUntil((r) => r.isFirst);
    if (v == 'progreso') _abrirProgreso();
    if (v == 'cursos') _abrirCursos();
  }

  void _abrirProgreso() => SubAjustes.abrir<void>(context, FichaDeportivaScreen(sesion: s)).then((_) => _cargar());

  /// Curso nuevo o el detalle de uno, sin pasar por la lista de Cursos.
  void _directo(String que) {
    if (_cursos.nuevos) {
      marcarCursosVistos(_cursos.ids);
      setState(() => _cursos = EstadoCursos(_cursos.ids, false));
      Navegacion.puntoEntrenamiento.value = false;
    }
    SubAjustes.abrir<void>(context, CursosScreen(sesion: s, directo: que)).then((_) => _cargar());
  }

  void _abrirCursos() {
    if (_cursos.nuevos) {
      marcarCursosVistos(_cursos.ids);
      setState(() => _cursos = EstadoCursos(_cursos.ids, false));
      Navegacion.puntoEntrenamiento.value = false;
    }
    SubAjustes.abrir<void>(context, s.esAdmin ? CursosScreen(sesion: s) : CursosAbiertosScreen(sesion: s)).then((_) => _cargar());
  }

  @override
  void dispose() {
    s.removeListener(_refrescar);
    Navegacion.entrenamiento.removeListener(_irAVista);
    Navegacion.pestanaActual.removeListener(_tour);
    _herramienta.dispose();
    super.dispose();
  }

  bool get _puedeNombrar => s.esCoach || (s.esAdmin && s.adminToken != null && (s.tieneArea('coach') || s.tieneArea('equipo')));

  Widget _hero({bool compacto = false}) => FuncionesLiga.coach(s)
      ? Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 14),
          child: MiProgresoHero(d: _ficha, compacto: compacto, alTocar: _abrirProgreso),
        )
      : const SizedBox.shrink();

  bool _verMas = false;
  final _planAbierto = <String>{};

  /// Si el entrenamiento tiene un plan que esta persona puede ver.
  bool _tienePlan(Evento e) => (PlanEnEvento.cache[e.id]?['planes'] as List? ?? const []).isNotEmpty;

  /// Cursos en un carrusel (mockup A).
  Widget _carrusel(BuildContext context) {
    final p = context.pivot;
    final l = _cursos.lista;
    final nuevos = {for (final x in _cursos.nuevosLista) x.$1};
    final (degradado, sobre) = PivotPaleta.seccion('organizacion', Theme.of(context).brightness);
    String detalle(Map<String, dynamic> c) {
      if (c['miInscripcion'] != null) return 'Ya te inscribiste';
      final f = (c['fechas'] as List? ?? const []).firstOrNull;
      final fecha = DateTime.tryParse('${f is Map ? f['fecha'] : f ?? ''}');
      return [
        if (fecha != null) 'Empieza el ${Fechas.corta(fecha)}',
        if (c['libres'] != null) c['libres'] == 1 ? '1 cupo' : '${c['libres']} cupos',
      ].join(' · ').ifEmpty('Inscripciones abiertas');
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 8, 2, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'CURSOS',
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
                ),
              ),
              // Cursos solo en la portada, sin subsección (QA 2026-11-28).
              if (s.esAdmin && l.isNotEmpty)
                TextButton.icon(onPressed: () => _directo('nuevo'), icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Crear')),
            ],
          ),
        ),
        QueEsUnCurso(persona: !s.esAdmin),
        const SizedBox(height: 8),
        if (l.isEmpty && s.esAdmin)
          TarjetaCrear(
            icono: Icons.school_rounded,
            seccion: 'entrenamientos',
            titulo: 'Todavía no hay cursos',
            texto: 'Arma el primero: sus clases quedan en el calendario.',
            boton: 'Crear un curso',
            alTocar: () => _directo('nuevo'),
          )
        else if (l.isEmpty)
          Material(
            color: p.tarjeta,
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            child: ListTile(
              leading: Icon(Icons.school_outlined, color: p.marcaTexto),
              title: const Text('No hay cursos abiertos ahora'),
              subtitle: const Text('Cuando abran uno para ti, aparece aquí.'),
            ),
          )
        else
          SizedBox(
            height: 156,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: l.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) {
                final c = l[i];
                return SizedBox(
                  width: 220,
                  child: Material(
                    color: p.tarjeta,
                    borderRadius: BorderRadius.circular(PivotRadios.tarjeta + 4),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      // Abre ese curso para inscribirse.
                      onTap: () => s.esAdmin
                          ? _directo('${c['id']}')
                          : SubAjustes.abrir<void>(context, CursosAbiertosScreen(sesion: s, destacado: '${c['id']}')).then((_) => _cargar()),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip)),
                                  child: Icon(Symbols.school_rounded, color: sobre, fill: 1, size: 22),
                                ),
                                const Spacer(),
                                if (nuevos.contains('${c['id']}'))
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(color: p.marca, borderRadius: BorderRadius.circular(PivotRadios.chip)),
                                    child: Text(
                                      'Nuevo',
                                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: p.sobreMarca),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Text(
                              '${c['nombre'] ?? 'Curso'}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontWeight: FontWeight.w800, color: p.texto),
                            ),
                            const Spacer(),
                            Text(
                              detalle(c),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 12.5, color: p.textoSecundario),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        const SizedBox(height: 6),
      ],
    );
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
        title: const Text('Progreso', style: TextStyle(fontWeight: FontWeight.w800)),
        // Habilidades y Pruebas están en la portada; las notificaciones, en Mi perfil (QA 2026-11-27).
      ),
      body: _usaCoach
          ? CoachScreen(
              sesion: s,
              eventos: widget.eventos,
              embebida: true,
              // Equipo técnico encima del próximo entrenamiento (QA 2026-11-27).
              encabezado: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  KeyedSubtree(key: ClavesTour.progresoHero, child: _hero(compacto: true)),
                  KeyedSubtree(
                    key: ClavesTour.progresoTecnico,
                    child: EquipoTecnicoSeccion(sesion: s),
                  ),
                  // Reglamento, solo en ligas de roller derby (Victor, 2026-11-28).
                  if (Deporte.esDerby)
                    KeyedSubtree(
                      key: ClavesTour.progresoReglamento,
                      child: TarjetaReglamento(sesion: s),
                    ),
                ],
              ),
              despuesDelProximo: KeyedSubtree(key: ClavesTour.progresoCursos, child: _carrusel(context)),
              herramienta: _herramienta,
            )
          : _paraTodxs(context),
    );
  }

  /// Para todxs (mockup A): Mi progreso, cursos y el próximo entrenamiento.
  Widget _paraTodxs(BuildContext context) {
    final p = context.pivot;
    return ListenableBuilder(
      listenable: widget.eventos,
      builder: (context, _) {
        final hoy = Fechas.hoy();
        final proximos = [
          for (final e in widget.eventos.eventos)
            if (e.tipo == 'Entrenamiento' && !e.cancelado && !e.finalizado && !e.fecha.isBefore(hoy)) e,
        ]..sort((a, b) => '${Fechas.iso(a.fecha)} ${a.horaInicio}'.compareTo('${Fechas.iso(b.fecha)} ${b.horaInicio}'));
        final limite = hoy.add(const Duration(days: 7));
        var semana = proximos.where((e) => !e.fecha.isAfter(limite)).toList();
        if (semana.isEmpty && proximos.isNotEmpty) semana = [proximos.first];
        final visibles = _verMas ? proximos.take(semana.length + 6).toList() : semana;
        for (final e in visibles) {
          if (!PlanEnEvento.cache.containsKey(e.id)) {
            PlanEnEvento.precargar(s, e.id).then((_) {
              if (mounted) setState(() {});
            }, onError: (_) {});
          }
        }
        return RefreshIndicator(
          onRefresh: _cargar,
          child: ListView(
            padding: EdgeInsets.fromLTRB(16, 8 + altoBarra(context), 16, 96 + MediaQuery.paddingOf(context).bottom),
            children: [
              KeyedSubtree(key: ClavesTour.progresoHero, child: _hero()),
              if (_puedeNombrar)
                KeyedSubtree(
                  key: ClavesTour.progresoTecnico,
                  child: EquipoTecnicoSeccion(sesion: s),
                ),
              if (Deporte.esDerby)
                KeyedSubtree(
                  key: ClavesTour.progresoReglamento,
                  child: TarjetaReglamento(sesion: s),
                ),
              // Próximos 7 días (si no hay, el que viene) y luego Cursos (QA 2026-11-27).
              if (proximos.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 10, 2, 8),
                  child: Text(
                    visibles.length == 1 ? 'PRÓXIMO ENTRENAMIENTO' : 'PRÓXIMOS ENTRENAMIENTOS',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
                  ),
                ),
              AnimatedSize(
                key: ClavesTour.progresoProximos,
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                alignment: Alignment.topCenter,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final e in visibles)
                      Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        clipBehavior: Clip.antiAlias,
                        child: Column(
                          children: [
                            ListTile(
                              leading: Icon(Icons.sports_rounded, color: p.marcaTexto),
                              title: Text(
                                '${Fechas.dia(e.fecha)} ${Fechas.corta(e.fecha)} · ${e.horaInicio}',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                              subtitle: Text(
                                [
                                  if (e.lugar.isNotEmpty) e.lugar,
                                  e.cantidadAsisten == 1 ? 'Viene 1 persona' : 'Vienen ${e.cantidadAsisten} personas',
                                ].join(' · '),
                              ),
                              // Plan compartido: «Ver plan» lo despliega aquí mismo.
                              trailing: _tienePlan(e)
                                  ? ActionChip(
                                      label: const Text('Ver plan'),
                                      onPressed: () => setState(() => _planAbierto.contains(e.id) ? _planAbierto.remove(e.id) : _planAbierto.add(e.id)),
                                    )
                                  : Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => DetalleScreen(repo: widget.eventos, eventoId: e.id),
                                ),
                              ),
                            ),
                            AnimatedSize(
                              duration: const Duration(milliseconds: 240),
                              curve: Curves.easeOutCubic,
                              alignment: Alignment.topCenter,
                              child: _planAbierto.contains(e.id) ? PlanEnEvento(sesion: s, evento: e) : const SizedBox(width: double.infinity),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              if (proximos.length > semana.length)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => setState(() => _verMas = !_verMas),
                    icon: Icon(_verMas ? Icons.expand_less_rounded : Icons.expand_more_rounded),
                    label: Text(_verMas ? 'Ver menos' : 'Ver más entrenamientos'),
                  ),
                ),
              KeyedSubtree(key: ClavesTour.progresoCursos, child: _carrusel(context)),
            ],
          ),
        );
      },
    );
  }
}

extension on String {
  String ifEmpty(String otro) => isEmpty ? otro : this;
}
