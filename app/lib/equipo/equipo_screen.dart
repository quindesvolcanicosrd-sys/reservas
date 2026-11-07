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
/// Quindes, Mirlxs e Inactivxs (plegado) con tu fila primero, un dato
/// relevante por persona que rota con fundido, buscador inteligente y, para
/// admins, el botón de emergencia en cada fila.
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
  bool _inactivosAbiertos = false;

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
            return AnimatedSwitcher(duration: const Duration(milliseconds: 240), child: cuerpo);
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
      final l = personas.where((x) => x.grupo == g).toList()
        ..sort((a, b) {
          // Tu fila primero; después por nombre.
          if (repo.esYo(a) != repo.esYo(b)) return repo.esYo(a) ? -1 : 1;
          return BuscadorEquipo.normalizar(a.nombreMostrar).compareTo(BuscadorEquipo.normalizar(b.nombreMostrar));
        });
      return l;
    }

    final favoritos = personas.where((x) => repo.favoritos.contains(x.username)).toList();
    final inactivos = grupo('Inactivxs');
    return _envolverScroll(
      CustomScrollView(
        key: const ValueKey('lista'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (favoritos.isNotEmpty) ...[
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
          for (final g in ['Quindes', 'Mirlxs'])
            if (grupo(g).isNotEmpty)
              SliverMainAxisGroup(
                slivers: [
                  _encabezado(p, g, grupo(g).length),
                  SliverList.builder(itemCount: grupo(g).length, itemBuilder: (context, i) => _fila(context, grupo(g)[i], hoy)),
                ],
              ),
          if (inactivos.isNotEmpty)
            SliverMainAxisGroup(
              slivers: [
                _encabezado(p, 'Inactivxs', inactivos.length, plegable: true),
                SliverToBoxAdapter(
                  child: AnimatedSize(
                    duration: const Duration(milliseconds: 260),
                    curve: Curves.easeOutCubic,
                    alignment: Alignment.topCenter,
                    child: !_inactivosAbiertos ? const SizedBox(width: double.infinity) : Column(children: [for (final x in inactivos) _fila(context, x, hoy)]),
                  ),
                ),
              ],
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

  Widget _encabezado(PivotPaleta p, String titulo, int n, {bool plegable = false}) {
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
          const Spacer(),
          if (plegable)
            AnimatedRotation(
              turns: _inactivosAbiertos ? 0.5 : 0,
              duration: const Duration(milliseconds: 220),
              child: Icon(Icons.expand_more_rounded, color: p.textoSecundario),
            ),
        ],
      ),
    );
    return SliverPersistentHeader(
      pinned: true,
      delegate: _Encabezado(plegable ? InkWell(onTap: () => setState(() => _inactivosAbiertos = !_inactivosAbiertos), child: contenido) : contenido),
    );
  }

  Widget _fila(BuildContext context, Integrante x, DateTime hoy, {List<String>? motivos}) {
    final datos = datosRelevantes(x, hoy);
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
    );
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
  _Encabezado(this.hijo);
  final Widget hijo;

  @override
  double get minExtent => 42;
  @override
  double get maxExtent => 42;

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
  });
  final Integrante p;
  final bool yo;
  final List<DatoFila> datos;
  final List<String>? motivos;
  final ValueNotifier<int> tick;
  final VoidCallback alTocar;
  final VoidCallback? emergencia;

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
          ],
        ),
      ),
    );
  }
}
