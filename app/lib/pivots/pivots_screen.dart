import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/asistente.dart';
import '../core/cargando.dart';
import '../core/tema.dart';
import '../equipo/equipo_modelos.dart';
import '../equipo/equipo_repo.dart';
import '../eventos/widgets_comunes.dart';
import '../sesion/sesion.dart';

/// Áreas que puede tener un Pivot (Victor, 2026-11-13). El servidor bloquea
/// cada acción según su área (`AREA_DE_ACCION`) y filtra la Bandeja y los avisos.
const areasPivot = {
  'finanzas': ('Finanzas', 'Pagos, cuotas, excepciones de cuota, reservas y Tesorería.', Icons.account_balance_wallet_outlined),
  'asistencia': ('Asistencia y eventos', 'Tomar lista, rectificaciones, cancelar eventos y lugares.', Icons.event_available_outlined),
  'equipo': ('Personas y equipos', 'Estados, equipos y puntos, roles, viajes y temporadas de descanso.', Icons.groups_outlined),
  'salud': ('Salud y emergencias', 'Ficha de emergencia y lesiones. Información confidencial.', Icons.health_and_safety_outlined),
  'inventario': ('Inventario', 'Listas, préstamos, botiquín y reglas de préstamo.', Icons.inventory_2_outlined),
  'tareas': ('Tareas', 'Crear, validar y repartir tareas.', Icons.task_alt_outlined),
  'liga': ('Liga y Pivots', 'Ajustes de la liga, comunidad, avisos a todo el equipo y quién es Pivot.', Icons.shield_outlined),
};

String textoAreas(List<String> a) {
  if (a.length >= areasPivot.length) return 'Todas las áreas';
  final n = [
    for (final k in areasPivot.keys)
      if (a.contains(k)) areasPivot[k]!.$1,
  ];
  return n.isEmpty ? 'Sin áreas' : n.join(', ');
}

class PivotInfo {
  PivotInfo(Map<String, dynamic> m)
    : username = '${m['username']}',
      nombre = '${m['nombre'] ?? m['username']}',
      foto = '${m['foto'] ?? ''}',
      principal = m['principal'] == true,
      yo = m['yo'] == true,
      areas = [for (final a in (m['areas'] as List? ?? const [])) '$a'];
  final String username, nombre, foto;
  final bool principal, yo;
  final List<String> areas;
}

class PivotsRepo {
  PivotsRepo(this.sesion);
  final Sesion sesion;
  Map<String, Object?> get _t => {'adminToken': sesion.adminToken};

  Future<(List<PivotInfo>, List<String>)> listar() async {
    final r = await sesion.api.get('adminPivots', {..._t, 'accion': 'listar'});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo cargar.'}');
    return (
      [
        for (final p in (r['pivots'] as List? ?? const []))
          if (p is Map<String, dynamic>) PivotInfo(p),
      ],
      [for (final a in (r['misAreas'] as List? ?? const [])) '$a'],
    );
  }

  Future<void> guardar(String username, List<String> areas) async {
    final r = await sesion.api.post('adminPivots', {..._t, 'accion': 'guardar', 'username': username, 'areas': jsonEncode(areas)});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
  }

  Future<void> quitar(String username) async {
    final r = await sesion.api.post('adminPivots', {..._t, 'accion': 'quitar', 'username': username});
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo quitar.'}');
  }
}

/// Mi Liga → Pivots y permisos. Con [persona], abre directo esa persona
/// (atajo desde la ficha): si ya es Pivot, sus áreas; si no, el asistente.
class PivotsScreen extends StatefulWidget {
  const PivotsScreen({super.key, required this.sesion, this.persona});
  final Sesion sesion;
  final Integrante? persona;

  @override
  State<PivotsScreen> createState() => _PivotsScreenState();
}

class _PivotsScreenState extends State<PivotsScreen> {
  late final repo = PivotsRepo(widget.sesion);
  List<PivotInfo>? _pivots;
  List<String> _misAreas = const [];
  String? _error;
  bool _atajoHecho = false;

  bool get _puedeEditar => _misAreas.contains('liga');

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final (l, a) = await repo.listar();
      if (!mounted) return;
      setState(() {
        _pivots = l;
        _misAreas = a;
        _error = null;
      });
      if (!_atajoHecho && widget.persona != null) {
        _atajoHecho = true;
        final ya = l.where((x) => x.username == widget.persona!.username).firstOrNull;
        if (ya != null) {
          _editar(ya);
        } else if (_puedeEditar) {
          _nombrar(widget.persona);
        }
      }
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  void _aviso(String t) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(t)));

  Future<void> _nombrar([Integrante? persona]) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            NombrarPivotAsistente(sesion: widget.sesion, repo: repo, excluir: {for (final x in _pivots ?? const <PivotInfo>[]) x.username}, persona: persona),
      ),
    );
    if (ok == true && mounted) {
      _aviso('Listo. Se le avisó a la persona.');
      _cargar();
    }
  }

  Future<void> _editar(PivotInfo x) async {
    final sel = {...x.areas};
    final soloVer = !_puedeEditar || x.principal;
    final res = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) {
          final p = h.pivot;
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      AvatarPersona(nombre: x.nombre, foto: x.foto, tamano: 44),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(x.nombre, style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    x.principal
                        ? 'Pivot principal: siempre tiene todas las áreas.'
                        : (soloVer ? 'Para cambiar áreas necesitas "Liga y Pivots".' : 'Qué puede ver y hacer. Recibe avisos solo de estas áreas.'),
                    style: TextStyle(color: p.textoSecundario),
                  ),
                  const SizedBox(height: 8),
                  for (final a in areasPivot.entries)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: sel.contains(a.key),
                      secondary: Icon(a.value.$3, color: p.marcaTexto),
                      title: Text(a.value.$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(a.value.$2),
                      onChanged: soloVer ? null : (v) => set(() => v == true ? sel.add(a.key) : sel.remove(a.key)),
                    ),
                  if (!soloVer) ...[
                    const SizedBox(height: 12),
                    FilledButton(onPressed: sel.isEmpty ? null : () => Navigator.of(h).pop('guardar'), child: const Text('Guardar')),
                    if (!x.yo) TextButton(onPressed: () => Navigator.of(h).pop('quitar'), child: const Text('Quitar como Pivot')),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
    if (!mounted || res == null) return;
    try {
      if (res == 'guardar') {
        await repo.guardar(x.username, sel.toList());
        _aviso('Guardado');
      } else {
        if ((_pivots?.length ?? 0) <= 1) {
          _aviso('La liga no puede quedarse sin Pivots.');
          return;
        }
        final ok = await showDialog<bool>(
          context: context,
          builder: (d) => AlertDialog(
            title: Text('¿Quitar a ${x.nombre} como Pivot?'),
            content: const Text('Deja de ver Mi Liga, la Bandeja de Pivots y los avisos de Pivot. Sus datos no cambian.'),
            actions: [
              TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Volver')),
              FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Quitar')),
            ],
          ),
        );
        if (ok != true) return;
        await repo.quitar(x.username);
        _aviso('${x.nombre} ya no es Pivot');
      }
      if (x.yo) widget.sesion.cargarAreas();
      await _cargar();
    } catch (e) {
      _aviso(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final l = _pivots;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pivots y permisos', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: l == null
            ? (_error != null ? Center(child: Text(_error!)) : const PivotCargando(centrarEnPantalla: true))
            : RefreshIndicator(
                key: const ValueKey('l'),
                onRefresh: _cargar,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                      child: Text(
                        'Cada Pivot ve y gestiona solo sus áreas, y recibe avisos solo de ellas.',
                        style: TextStyle(fontSize: 13, color: p.textoSecundario),
                      ),
                    ),
                    for (final x in l)
                      Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          leading: AvatarPersona(nombre: x.nombre, foto: x.foto, tamano: 40),
                          title: Text(x.yo ? '${x.nombre} (tú)' : x.nombre, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(x.principal ? 'Pivot principal · todas las áreas' : textoAreas(x.areas)),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => _editar(x),
                        ),
                      ),
                  ],
                ),
              ),
      ),
      floatingActionButton: _puedeEditar && l != null
          ? FloatingActionButton(tooltip: 'Nombrar Pivot', onPressed: _nombrar, child: const Icon(Icons.add_rounded))
          : null,
    );
  }
}

enum _PasoPivot { persona, areas, confirmar }

/// Nombrar Pivot: persona → áreas (con explicación) → confirmar.
class NombrarPivotAsistente extends StatefulWidget {
  const NombrarPivotAsistente({super.key, required this.sesion, required this.repo, required this.excluir, this.persona});
  final Sesion sesion;
  final PivotsRepo repo;
  final Set<String> excluir;
  final Integrante? persona;

  @override
  State<NombrarPivotAsistente> createState() => _NombrarPivotAsistenteState();
}

class _NombrarPivotAsistenteState extends State<NombrarPivotAsistente> {
  late final equipo = EquipoRepo.de(widget.sesion);
  late _PasoPivot _paso = widget.persona != null ? _PasoPivot.areas : _PasoPivot.persona;
  bool _adelante = true, _ocupado = false;
  late Integrante? _persona = widget.persona;
  final _areas = <String>{};
  final _buscar = TextEditingController();

  @override
  void initState() {
    super.initState();
    equipo.addListener(_refrescar);
    equipo.cargar();
  }

  void _refrescar() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    equipo.removeListener(_refrescar);
    _buscar.dispose();
    super.dispose();
  }

  void _ir(int d) {
    final i = _paso.index + d;
    if (i < 0 || (widget.persona != null && i < 1)) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _adelante = d > 0;
      _paso = _PasoPivot.values[i];
    });
  }

  Future<void> _guardar() async {
    setState(() => _ocupado = true);
    try {
      await widget.repo.guardar(_persona!.username, _areas.toList());
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _ocupado = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final inicio = widget.persona != null ? 1 : 0;
    return Asistente(
      titulo: 'Nombrar Pivot',
      indice: _paso.index - inicio,
      total: _PasoPivot.values.length - inicio,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _PasoPivot.persona => '¿Quién?',
        _PasoPivot.areas => '¿Qué áreas gestiona?',
        _PasoPivot.confirmar => '¿Todo bien?',
      },
      ayuda: switch (_paso) {
        _PasoPivot.persona => 'Solo aparecen personas con correo: lo necesitan para entrar como Pivot.',
        _PasoPivot.areas => 'Solo verá y recibirá avisos de estas áreas. Puedes cambiarlas cuando quieras.',
        _PasoPivot.confirmar => null,
      },
      cuerpo: switch (_paso) {
        _PasoPivot.persona => _pasoPersona(context),
        _PasoPivot.areas => _pasoAreas(context),
        _PasoPivot.confirmar => _pasoConfirmar(context),
      },
      textoBoton: switch (_paso) {
        _PasoPivot.persona => null,
        _PasoPivot.areas => 'Siguiente',
        _PasoPivot.confirmar => 'Nombrar Pivot',
      },
      alContinuar: switch (_paso) {
        _PasoPivot.persona => null,
        _PasoPivot.areas => _areas.isEmpty ? null : () => _ir(1),
        _PasoPivot.confirmar => _guardar,
      },
      ocupado: _ocupado,
    );
  }

  Widget _pasoPersona(BuildContext context) {
    final p = context.pivot;
    final q = _buscar.text.trim().toLowerCase();
    final gente = [
      for (final x in equipo.personas ?? const <Integrante>[])
        if (!widget.excluir.contains(x.username) && x.email.isNotEmpty && (q.isEmpty || x.nombreMostrar.toLowerCase().contains(q))) x,
    ]..sort((a, b) => a.nombreMostrar.toLowerCase().compareTo(b.nombreMostrar.toLowerCase()));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: TextField(
            controller: _buscar,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(hintText: 'Buscar por nombre', prefixIcon: Icon(Icons.search_rounded), isDense: true),
          ),
        ),
        Expanded(
          child: equipo.personas == null
              ? const PivotCargando()
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                  itemCount: gente.length,
                  itemBuilder: (_, i) {
                    final x = gente[i];
                    return ListTile(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                      leading: AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: 40),
                      title: Text(
                        x.nombreMostrar,
                        style: TextStyle(fontWeight: FontWeight.w600, color: p.texto),
                      ),
                      onTap: () {
                        _persona = x;
                        _ir(1);
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _pasoAreas(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      for (final a in areasPivot.entries)
        OpcionAsistente(
          icono: a.value.$3,
          titulo: a.value.$1,
          texto: a.value.$2,
          activa: _areas.contains(a.key),
          alTocar: () => setState(() => _areas.contains(a.key) ? _areas.remove(a.key) : _areas.add(a.key)),
        ),
      TextButton(
        onPressed: () => setState(() => _areas.length == areasPivot.length ? _areas.clear() : _areas.addAll(areasPivot.keys)),
        child: Text(_areas.length == areasPivot.length ? 'Quitar todas' : 'Elegir todas'),
      ),
    ],
  );

  Widget _pasoConfirmar(BuildContext context) {
    final p = context.pivot;
    final x = _persona!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            AvatarPersona(nombre: x.nombreMostrar, foto: x.foto, tamano: 48),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                x.nombreMostrar,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: p.texto),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          'Podrá ver y gestionar:',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
        ),
        const SizedBox(height: 8),
        for (final k in areasPivot.keys)
          if (_areas.contains(k))
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(areasPivot[k]!.$3, color: p.marcaTexto),
              title: Text(areasPivot[k]!.$1),
              subtitle: Text(areasPivot[k]!.$2),
            ),
        const SizedBox(height: 8),
        Text('Se le avisará por notificación.', style: TextStyle(color: p.textoSecundario)),
      ],
    );
  }
}
