import 'package:flutter/material.dart';

import '../ajustes/componentes.dart';
import '../core/api.dart';
import '../core/cargando.dart';
import '../core/tema.dart';
import '../equipo/equipo_repo.dart';
import '../equipo/roles_screen.dart';
import '../sesion/sesion.dart';

/// Mi perfil → Ajustes de la liga (solo Pivots, Victor 2026-11-13): un solo
/// lugar fácil de encontrar para lo que configura la liga.
class AjustesLigaScreen extends StatelessWidget {
  const AjustesLigaScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Ajustes de la liga', style: TextStyle(fontWeight: FontWeight.w700)),
    ),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
      children: [
        GrupoAjustes(
          filas: [
            FilaAjuste(
              icono: Icons.workspace_premium_outlined,
              seccion: 'cuota',
              titulo: 'Categorías y puntos',
              valor: 'Qué pide cada categoría al mes',
              alTocar: () => SubAjustes.abrir(context, CategoriasScreen(sesion: sesion)),
            ),
            FilaAjuste(
              icono: Icons.shield_outlined,
              seccion: 'roles',
              titulo: 'Roles del equipo',
              valor: 'Crear, renombrar o borrar roles',
              alTocar: () => SubAjustes.abrir(context, RolesScreen(repo: EquipoRepo.de(sesion))),
            ),
          ],
        ),
      ],
    ),
  );
}

/// Categorías (config_tiers): qué pide cada una para mantenerse o subir.
class CategoriasScreen extends StatefulWidget {
  const CategoriasScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<CategoriasScreen> createState() => _CategoriasScreenState();
}

class _CategoriasScreenState extends State<CategoriasScreen> {
  List<Map<String, dynamic>>? _tiers;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await widget.sesion.api.get('getTiers', {'adminToken': widget.sesion.adminToken});
      final l = [
        for (final t in (r['tiers'] as List? ?? const []))
          if (t is Map<String, dynamic>) t,
      ];
      l.sort((a, b) => ((a['orden'] as num?) ?? 0).compareTo((b['orden'] as num?) ?? 0));
      if (mounted) setState(() => _tiers = l);
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  static int _n(Object? v) => (v as num?)?.toInt() ?? int.tryParse('$v') ?? 0;

  /// "3 clases o 50 puntos en el mes".
  static String regla(Map<String, dynamic> t) {
    final c = _n(t['min_clases']), pts = _n(t['min_puntos']), v = _n(t['ventana_meses']);
    final partes = [if (c > 0) c == 1 ? '1 clase' : '$c clases', if (pts > 0) '$pts puntos'];
    if (partes.isEmpty) return 'No pide un mínimo';
    final periodo = v <= 1 ? 'en el mes' : 'en $v meses';
    return '${partes.join(t['logica'] == 'Y' ? ' y ' : ' o ')} $periodo';
  }

  Future<void> _editar(Map<String, dynamic> t) async {
    var clases = _n(t['min_clases']), puntos = _n(t['min_puntos']), ventana = _n(t['ventana_meses']).clamp(1, 12);
    var logica = t['logica'] == 'Y' ? 'Y' : 'O';
    var subir = _n(t['meses_consecutivos_ascenso']).clamp(1, 12), gracia = _n(t['meses_gracia_demotion']).clamp(0, 12);
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (hoja) => StatefulBuilder(
        builder: (hoja, refrescar) {
          final p = hoja.pivot;
          Widget contador(String titulo, String ayuda, int valor, int min, int max, int paso, void Function(int) cambiar) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titulo,
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                      ),
                      Text(ayuda, style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: valor - paso >= min ? () => refrescar(() => cambiar(valor - paso)) : null,
                  icon: const Icon(Icons.remove_circle_outline_rounded),
                ),
                SizedBox(
                  width: 34,
                  child: Text(
                    '$valor',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.texto),
                  ),
                ),
                IconButton(
                  onPressed: valor + paso <= max ? () => refrescar(() => cambiar(valor + paso)) : null,
                  icon: const Icon(Icons.add_circle_outline_rounded),
                ),
              ],
            ),
          );
          final vista = regla({'min_clases': clases, 'min_puntos': puntos, 'ventana_meses': ventana, 'logica': logica});
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('${t['nombre']}', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Text(
                      'Pide $vista.',
                      key: ValueKey(vista),
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.marcaTexto),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text('Los puntos suman asistencia, tareas y rachas.', style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
                  const SizedBox(height: 16),
                  contador('Clases', 'Mínimo de clases', clases, 0, 30, 1, (v) => clases = v),
                  contador('Puntos', 'Mínimo de puntos', puntos, 0, 500, 5, (v) => puntos = v),
                  if (clases > 0 && puntos > 0) ...[
                    SegmentedButton<String>(
                      showSelectedIcon: false,
                      segments: const [
                        ButtonSegment(value: 'O', label: Text('Clases o puntos')),
                        ButtonSegment(value: 'Y', label: Text('Clases y puntos')),
                      ],
                      selected: {logica},
                      onSelectionChanged: (s) => refrescar(() => logica = s.first),
                    ),
                    const SizedBox(height: 14),
                  ],
                  contador('Período', 'Meses que se cuentan', ventana, 1, 12, 1, (v) => ventana = v),
                  contador('Para subir', 'Meses seguidos cumpliendo', subir, 1, 12, 1, (v) => subir = v),
                  contador('Para bajar', 'Meses de gracia sin cumplir', gracia, 0, 12, 1, (v) => gracia = v),
                  const SizedBox(height: 8),
                  Text('El cambio se aplica en el próximo cálculo de categorías.', style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: () => Navigator.of(hoja).pop(true), child: const Text('Guardar')),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (ok != true || !mounted) return;
    final m = ScaffoldMessenger.of(context);
    try {
      final r = await widget.sesion.api.post('upsertTier', {
        'adminToken': widget.sesion.adminToken,
        'id': t['id'],
        'orden': t['orden'],
        'nombre': t['nombre'],
        'min_clases': clases,
        'min_puntos': puntos,
        'ventana_meses': ventana,
        'logica': logica,
        'es_default': t['es_default'] == true ? 'true' : '',
        'meses_consecutivos_ascenso': subir,
        'meses_gracia_demotion': gracia,
        'dividir_puntos_mitad': t['dividir_puntos_mitad'] == true ? 'true' : '',
        'califica_fondos_viaje': t['califica_fondos_viaje'] == true ? 'true' : '',
      });
      if (r['error'] != null) throw ApiException('${r['error']}');
      m.showSnackBar(SnackBar(content: Text('${t['nombre']} actualizada')));
      await _cargar();
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final l = _tiers;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Categorías y puntos', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: l == null
            ? Center(key: const ValueKey('c'), child: _error == null ? const PivotCargando() : Text(_error!))
            : ListView(
                key: const ValueKey('l'),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                    child: Text(
                      'Lo que pide cada categoría para mantenerse. Toca una para cambiarlo.',
                      style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
                    ),
                  ),
                  for (final t in l)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: p.tarjeta,
                        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                        child: ListTile(
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                          leading: Icon(Icons.workspace_premium_outlined, color: p.marcaTexto),
                          title: Text('${t['nombre']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text(t['es_default'] == true ? '${regla(t)} · categoría inicial' : regla(t)),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => _editar(t),
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}
