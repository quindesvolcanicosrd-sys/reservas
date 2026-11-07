import 'dart:async';

import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import 'buscador_equipo.dart';
import 'emergencia_screen.dart';
import 'equipo_modelos.dart';
import 'equipo_repo.dart';
import 'persona_screen.dart';

/// Pestaña Equipo (Victor, 2026-11-07; plan en el Claude Doc "Pivot app —
/// Equipo, Tareas, Ajustes y Mi Liga"): favoritos en una fila de avatares,
/// Quindes, Mirlxs e Inactivxs como acordeón (siempre una sección abierta:
/// abrir otra cierra la anterior, Victor 2026-11-07) con tu fila primero, un
/// dato relevante por persona que rota con fundido, buscador inteligente y,
/// para admins, emergencia (marcadx hoy) y archivar (en Inactivxs).
class EquipoScreen extends StatefulWidget {
  const EquipoScreen({super.key, required this.repo});
  final EquipoRepo repo;

  @override
  State<EquipoScreen> createState() => _EquipoScreenState();
}

class _EquipoScreenState extends State<EquipoScreen> {
  EquipoRepo get repo => widget.repo;
  final _busqueda = TextEditingController();
  final _focoBusqueda = FocusNode();
  bool _buscando = false;

  /// Sección abierta del acordeón; null = la tuya (o la primera con gente).
  String? _abierto;

  /// Reloj común de las filas: todas cambian de dato a la vez.
  final _tick = ValueNotifier<int>(0);
  Timer? _reloj;
  bool _scrolleando = false;

  @override
  void initState() {
    super.initState();
    repo.cargar();
    _reloj = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!_scrolleando && mounted) _tick.value++;
    });
  }

  @override
  void dispose() {
    _reloj?.cancel();
    _tick.dispose();
    _busqueda.dispose();
    _focoBusqueda.dispose();
    super.dispose();
  }

  void _abrir(Integrante p) => PersonaScreen.abrir(context, repo, p.username);

  void _alternarBusqueda() {
    setState(() {
      _buscando = !_buscando;
      if (!_buscando) _busqueda.clear();
    });
    if (_buscando) _focoBusqueda.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final t = Theme.of(context).textTheme;
    return PopScope(
      canPop: !_buscando,
      onPopInvokedWithResult: (hizo, _) {
        if (!hizo && _buscando) _alternarBusqueda();
      },
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: _buscando ? 0 : null,
          title: AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: _buscando
                ? TextField(
                    key: const ValueKey('buscar'),
                    controller: _busqueda,
                    focusNode: _focoBusqueda,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(hintText: 'Buscar en el equipo', border: InputBorder.none),
                  )
                : Text(
                    'Equipo',
                    key: const ValueKey('titulo'),
                    style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
          ),
          actions: [
            if (!_buscando)
              ListenableBuilder(
                listenable: repo,
                builder: (context, _) => IconButton(
                  tooltip: 'Filtros',
                  onPressed: _abrirFiltros,
                  icon: Badge(isLabelVisible: repo.hayFiltros, smallSize: 8, child: const Icon(Icons.tune_rounded)),
                ),
              ),
            IconButton(
              tooltip: _buscando ? 'Cerrar búsqueda' : 'Buscar',
              onPressed: _alternarBusqueda,
              icon: Icon(_buscando ? Icons.close_rounded : Icons.search_rounded),
            ),
          ],
        ),
        body: ListenableBuilder(
          listenable: repo,
          builder: (context, _) {
            final personas = repo.personas;
            final Widget cuerpo;
            if (personas == null) {
              cuerpo = repo.error != null
                  ? Center(
                      key: const ValueKey('error'),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(repo.error!),
                          const SizedBox(height: 12),
                          OutlinedButton(onPressed: () => repo.cargar(forzar: true), child: const Text('Reintentar')),
                        ],
                      ),
                    )
                  : const Center(key: ValueKey('cargando'), child: CircularProgressIndicator());
            } else if (_buscando && _busqueda.text.trim().isNotEmpty) {
              cuerpo = _resultados(context, p, personas);
            } else {
              cuerpo = _lista(context, p, personas);
            }
            return Stack(
              children: [
                AnimatedSwitcher(duration: const Duration(milliseconds: 240), child: cuerpo),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: AnimatedOpacity(
                    opacity: repo.cargando && personas != null ? 1 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const LinearProgressIndicator(minHeight: 2),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _envolverScroll(Widget hijo) => NotificationListener<ScrollNotification>(
    onNotification: (n) {
      if (n is ScrollStartNotification) _scrolleando = true;
      if (n is ScrollEndNotification) _scrolleando = false;
      return false;
    },
    child: RefreshIndicator(onRefresh: () => repo.cargar(forzar: true), child: hijo),
  );

  Widget _lista(BuildContext context, PivotPaleta p, List<Integrante> personas) {
    final hoy = Fechas.hoy();
    List<Integrante> grupo(String g) {
      final l = personas.where((x) => x.grupo == g && repo.pasaRoles(x)).toList()
        ..sort((a, b) {
          // Tu fila primero; después por nombre.
          if (repo.esYo(a) != repo.esYo(b)) return repo.esYo(a) ? -1 : 1;
          return BuscadorEquipo.normalizar(a.nombreMostrar).compareTo(BuscadorEquipo.normalizar(b.nombreMostrar));
        });
      return l;
    }

    final favoritos = personas.where((x) => repo.favoritos.contains(x.username)).toList();
    const secciones = ['Quindes', 'Mirlxs', 'Inactivxs'];
    final grupos = {for (final g in secciones) g: grupo(g)};
    final conGente = [
      for (final g in secciones)
        if (grupos[g]!.isNotEmpty) g,
    ];
    final mio = personas.where(repo.esYo).map((x) => x.grupo).firstOrNull;
    final abierto = conGente.contains(_abierto) ? _abierto : (conGente.contains(mio) ? mio : conGente.firstOrNull);

    return _envolverScroll(
      CustomScrollView(
        key: const ValueKey('lista'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (repo.hayFiltros) SliverToBoxAdapter(child: _filtrosActivos(p)),
          if (favoritos.isNotEmpty && !repo.hayFiltros) ...[
            _encabezado(p, 'Favoritos', favoritos.length),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 96,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    for (final f in favoritos)
                      InkWell(
                        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                        onTap: () => _abrir(f),
                        child: SizedBox(
                          width: 76,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              _AvatarEstado(p: f, tamano: 52, hero: false),
                              const SizedBox(height: 6),
                              Text(
                                f.nombreMostrar,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, color: p.texto),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
          for (final g in conGente)
            SliverMainAxisGroup(
              slivers: [
                _seccion(p, g, grupos[g]!.length, abierta: g == abierto),
                SliverToBoxAdapter(
                  child: _Plegable(
                    abierto: g == abierto,
                    child: Column(children: [for (final x in grupos[g]!) _fila(context, x, hoy)]),
                  ),
                ),
              ],
            ),
          if (conGente.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'Nadie coincide con estos filtros.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.textoSecundario),
                ),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

  /// Encabezado del acordeón: tarjeta con nombre, cantidad y flecha.
  /// Tocar la abierta no hace nada (siempre queda una abierta).
  Widget _seccion(PivotPaleta p, String titulo, int n, {required bool abierta}) {
    const dur = Duration(milliseconds: 300);
    return SliverPersistentHeader(
      pinned: true,
      delegate: _Encabezado(
        Container(
          color: p.fondo,
          padding: const EdgeInsets.fromLTRB(12, 5, 12, 5),
          child: AnimatedContainer(
            duration: dur,
            curve: Curves.easeInOutCubic,
            decoration: BoxDecoration(
              color: abierta ? p.tarjeta : p.fondo,
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              border: Border.all(color: abierta ? p.tarjeta : p.suave),
            ),
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                onTap: () {
                  if (!abierta) setState(() => _abierto = titulo);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    children: [
                      AnimatedDefaultTextStyle(
                        duration: dur,
                        style: Theme.of(context).textTheme.titleMedium!
                            .copyWith(fontSize: 16, fontWeight: FontWeight.w800, color: abierta ? p.texto : p.textoSecundario),
                        child: Text(titulo),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
                        decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.chip)),
                        child: Text(
                          '$n',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.sobreSuave),
                        ),
                      ),
                      const Spacer(),
                      AnimatedRotation(
                        turns: abierta ? 0.5 : 0,
                        duration: dur,
                        curve: Curves.easeInOutCubic,
                        child: Icon(Icons.expand_more_rounded, color: p.textoSecundario),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        alto: 58,
      ),
    );
  }

  Widget _encabezado(PivotPaleta p, String titulo, int n) {
    final contenido = Container(
      color: p.fondo,
      padding: const EdgeInsets.fromLTRB(20, 14, 12, 6),
      child: Row(
        children: [
          Text(
            titulo,
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: p.textoSecundario),
          ),
          const SizedBox(width: 6),
          Text('$n', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
        ],
      ),
    );
    return SliverPersistentHeader(pinned: true, delegate: _Encabezado(contenido));
  }

  Widget _fila(BuildContext context, Integrante x, DateTime hoy, {List<String>? motivos}) {
    final datos = datosRelevantes(x, hoy, periodo: repo.periodoCorto);
    return _FilaIntegrante(
      key: ValueKey('fila-${x.username}'),
      p: x,
      yo: repo.esYo(x),
      datos: datos,
      motivos: motivos,
      tick: _tick,
      alTocar: () => _abrir(x),
      // Emergencia solo para quien fue marcadx hoy a tiempo o tarde (Victor, 2026-11-07).
      emergencia: repo.esAdmin && x.presenteHoy ? () => EmergenciaScreen.abrir(context, repo, x) : null,
      archivar: repo.esAdmin && x.inactivx && !repo.esYo(x) ? () => _archivar(x) : null,
    );
  }

  /// Fila de filtros activos, cada uno con su ✕ (web: badge del botón Filtros).
  Widget _filtrosActivos(PivotPaleta p) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          if (repo.periodoMes != null || repo.periodoHistorico)
            InputChip(label: Text(repo.periodoTitulo), onDeleted: () => repo.cambiarPeriodo(), onPressed: _abrirFiltros),
          for (final r in repo.filtroRoles) InputChip(label: Text(r), onDeleted: () => repo.alternarRol(r), onPressed: _abrirFiltros),
        ],
      ),
    );
  }

  void _abrirFiltros() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _HojaFiltros(repo: repo),
    );
  }

  /// Archivar desde la lista de Inactivxs (el servidor lo impide con reservas
  /// activas o cuotas pendientes y explica por qué).
  Future<void> _archivar(Integrante x) async {
    final m = ScaffoldMessenger.of(context);
    final si = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('¿Archivar a ${x.nombreMostrar}?'),
        content: const Text(
          'Deja de aparecer en Equipo y no puede iniciar sesión. Su historial se conserva. No se puede archivar si tiene reservas activas o cuotas pendientes.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('Archivar')),
        ],
      ),
    );
    if (si != true) return;
    try {
      await repo.archivar(x);
      m.showSnackBar(SnackBar(content: Text('${x.nombreMostrar} quedó archivadx')));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Widget _resultados(BuildContext context, PivotPaleta p, List<Integrante> personas) {
    final hoy = Fechas.hoy();
    final res = BuscadorEquipo.buscar(_busqueda.text, personas, favoritos: repo.favoritos, esAdmin: repo.esAdmin, hoy: hoy);
    if (res.isEmpty) {
      return ListView(
        key: const ValueKey('sin-resultados'),
        padding: const EdgeInsets.all(32),
        children: [
          Icon(Icons.search_off_rounded, size: 40, color: p.textoSecundario),
          const SizedBox(height: 12),
          Text(
            'Nadie coincide con "${_busqueda.text.trim()}".',
            textAlign: TextAlign.center,
            style: TextStyle(color: p.texto),
          ),
          const SizedBox(height: 8),
          Text(
            'Prueba con un nombre, un rol (jammer, blocker), un mes (diciembre), "cumple", "de viaje" o un número.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: p.textoSecundario),
          ),
        ],
      );
    }
    return _envolverScroll(
      ListView.builder(
        key: const ValueKey('resultados'),
        padding: const EdgeInsets.only(top: 4, bottom: 32),
        itemCount: res.length + 1,
        itemBuilder: (context, i) {
          if (i == 0) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 6),
              child: Text('${res.length} ${res.length == 1 ? 'persona' : 'personas'}', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
            );
          }
          final r = res[i - 1];
          return _fila(context, r.persona, hoy, motivos: r.motivos);
        },
      ),
    );
  }
}

class _Encabezado extends SliverPersistentHeaderDelegate {
  _Encabezado(this.hijo, {this.alto = 42});
  final Widget hijo;
  final double alto;

  @override
  double get minExtent => alto;
  @override
  double get maxExtent => alto;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => SizedBox.expand(child: hijo);

  @override
  bool shouldRebuild(_Encabezado old) => true;
}

/// Avatar con un anillo de estado (de viaje, lesionadx) y Hero hacia la ficha.
class _AvatarEstado extends StatelessWidget {
  const _AvatarEstado({required this.p, this.tamano = 48, this.hero = true});
  final Integrante p;
  final double tamano;
  final bool hero;

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final anillo = p.deViaje || p.lesionadx;
    final avatar = Container(
      padding: const EdgeInsets.all(2.5),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: anillo ? pal.marca : Colors.transparent, width: 2),
      ),
      child: AvatarPersona(nombre: p.nombreMostrar, foto: p.foto, tamano: tamano),
    );
    return hero ? HeroAvatar(tag: 'avatar-${p.username}', child: avatar) : avatar;
  }
}

class _FilaIntegrante extends StatelessWidget {
  const _FilaIntegrante({
    super.key,
    required this.p,
    required this.yo,
    required this.datos,
    required this.tick,
    required this.alTocar,
    this.motivos,
    this.emergencia,
    this.archivar,
  });
  final Integrante p;
  final bool yo;
  final List<DatoFila> datos;
  final List<String>? motivos;
  final ValueNotifier<int> tick;
  final VoidCallback alTocar;
  final VoidCallback? emergencia;
  final VoidCallback? archivar;

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    final reducir = MediaQuery.of(context).disableAnimations;
    return InkWell(
      onTap: alTocar,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: Row(
          children: [
            _AvatarEstado(p: p),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          p.nombreMostrar,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: pal.texto),
                        ),
                      ),
                      if (p.numero.isNotEmpty) Text('  #${p.numero}', style: TextStyle(fontSize: 13, color: pal.textoSecundario)),
                      if (yo) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                          decoration: BoxDecoration(color: pal.suave, borderRadius: BorderRadius.circular(PivotRadios.chip)),
                          child: Text(
                            'Tú',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: pal.sobreSuave),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  // En la búsqueda: por qué aparece. En la lista: el dato que rota.
                  if (motivos != null)
                    Text(
                      motivos!.isEmpty ? (p.roles.isEmpty ? '@${p.username}' : p.roles.join(' · ')) : motivos!.join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: pal.textoSecundario),
                    )
                  else
                    ValueListenableBuilder<int>(
                      valueListenable: tick,
                      builder: (context, n, _) {
                        final rota = datos.where((d) => !d.fijo).toList();
                        final DatoFila? dato = datos.isEmpty ? null : (datos.first.fijo || rota.length <= 1 || reducir ? datos.first : rota[n % rota.length]);
                        final linea = dato == null
                            ? Text(
                                p.roles.isEmpty ? '@${p.username}' : p.roles.join(' · '),
                                key: const ValueKey('base'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 13, color: pal.textoSecundario),
                              )
                            : Row(
                                key: ValueKey(dato.texto),
                                children: [
                                  Icon(dato.icono, size: 15, color: pal.marcaTexto),
                                  const SizedBox(width: 5),
                                  Flexible(
                                    child: Text(
                                      dato.texto,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: pal.marcaTexto),
                                    ),
                                  ),
                                ],
                              );
                        return AnimatedSwitcher(
                          duration: const Duration(milliseconds: 450),
                          switchInCurve: Curves.easeOut,
                          switchOutCurve: Curves.easeIn,
                          layoutBuilder: (actual, previos) => Stack(alignment: Alignment.centerLeft, children: [...previos, ?actual]),
                          child: linea,
                        );
                      },
                    ),
                ],
              ),
            ),
            if (emergencia != null)
              IconButton(
                tooltip: 'Emergencia',
                onPressed: emergencia,
                icon: Icon(Icons.emergency_outlined, color: pal.marcaTexto),
              ),
            if (archivar != null)
              IconButton(
                tooltip: 'Archivar',
                onPressed: archivar,
                icon: Icon(Icons.archive_outlined, color: pal.textoSecundario),
              ),
          ],
        ),
      ),
    );
  }
}

/// Contenido de una sección del acordeón: se abre y cierra deslizando la
/// altura (desde arriba) con fundido; la que se cierra y la que se abre usan
/// la misma curva y duración, así el resto de la lista no da saltos.
class _Plegable extends StatefulWidget {
  const _Plegable({required this.abierto, required this.child});
  final bool abierto;
  final Widget child;

  @override
  State<_Plegable> createState() => _PlegableState();
}

class _PlegableState extends State<_Plegable> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 340), value: widget.abierto ? 1 : 0);
  late final _altura = CurvedAnimation(parent: _c, curve: Curves.easeInOutCubic);
  late final _opacidad = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.3, 1, curve: Curves.easeOut),
    reverseCurve: const Interval(0.5, 1, curve: Curves.easeIn),
  );

  @override
  void didUpdateWidget(_Plegable old) {
    super.didUpdateWidget(old);
    if (old.abierto == widget.abierto) return;
    if (MediaQuery.of(context).disableAnimations) {
      _c.value = widget.abierto ? 1 : 0;
    } else {
      widget.abierto ? _c.forward() : _c.reverse();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      // Cerrada del todo no se construye (ni rota su dato).
      builder: (context, hijo) => _c.isDismissed
          ? const SizedBox(width: double.infinity)
          : ClipRect(
              child: SizeTransition(
                sizeFactor: _altura,
                alignment: Alignment.topCenter,
                child: FadeTransition(opacity: _opacidad, child: hijo),
              ),
            ),
      child: widget.child,
    );
  }
}

/// Filtros de Equipo: período de los stats (mes o histórico) y roles.
class _HojaFiltros extends StatelessWidget {
  const _HojaFiltros({required this.repo});
  final EquipoRepo repo;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final hoy = Fechas.hoy();
    final meses = [for (var i = 0; i < 12; i++) DateTime(hoy.year, hoy.month - i)];
    Widget titulo(String t) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Text(
        t,
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: p.textoSecundario),
      ),
    );
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Text('Filtros', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  const Spacer(),
                  AnimatedOpacity(
                    opacity: repo.hayFiltros ? 1 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: TextButton(onPressed: repo.hayFiltros ? repo.limpiarFiltros : null, child: const Text('Limpiar')),
                  ),
                ],
              ),
            ),
            titulo('Período de las estadísticas'),
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final (i, m) in meses.indexed)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(i == 0 ? 'Este mes' : (m.year == hoy.year ? Fechas.mesNombre(m) : Fechas.mesAnio(m))),
                        selected: !repo.periodoHistorico && (i == 0 ? repo.periodoMes == null : repo.periodoMes == m),
                        onSelected: (_) => repo.cambiarPeriodo(mes: m),
                      ),
                    ),
                  ChoiceChip(label: const Text('Histórico'), selected: repo.periodoHistorico, onSelected: (_) => repo.cambiarPeriodo(historico: true)),
                ],
              ),
            ),
            titulo('Roles'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final r in EquipoRepo.rolesCatalogo)
                    FilterChip(label: Text(r), selected: repo.filtroRoles.contains(r), onSelected: (_) => repo.alternarRol(r)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
              child: FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Listo'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
