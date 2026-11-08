import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';

/// Ajustes → Notificaciones: interruptor general y uno por tipo, generados
/// desde el catálogo del servidor (`getCatalogoNotificaciones`). Guardado
/// optimista: si falla, vuelve atrás y avisa.
class NotificacionesScreen extends StatefulWidget {
  const NotificacionesScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<NotificacionesScreen> createState() => _NotificacionesScreenState();
}

class _NotificacionesScreenState extends State<NotificacionesScreen> {
  List<Map<String, dynamic>>? _tipos;
  Map<String, bool> _prefs = {};
  bool _activas = true;
  String? _error;

  Api get _api => widget.sesion.api;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final c = await _api.get('getCatalogoNotificaciones');
      final p = await _api.get('getPreferenciasPush');
      if (p['exito'] == false) throw ApiException('${p['error']}');
      if (!mounted) return;
      setState(() {
        _tipos = [
          for (final t in (c['tipos'] as List? ?? const []))
            if (t is Map<String, dynamic> && (t['soloAdmin'] != true || widget.sesion.esAdmin)) t,
        ];
        _activas = p['activas'] != false;
        _prefs = {for (final e in ((p['preferencias'] as Map?) ?? const {}).entries) '${e.key}': e.value == true};
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudieron cargar tus preferencias. Revisa tu conexión.');
    }
  }

  Future<void> _guardar(Map<String, Object> params, VoidCallback aplicar, VoidCallback revertir) async {
    setState(aplicar);
    try {
      final r = await _api.post('guardarPreferenciasPush', params);
      if (r['exito'] != true) throw ApiException('${r['error'] ?? ''}');
    } catch (_) {
      if (!mounted) return;
      setState(revertir);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo guardar. Revisa tu conexión.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final tipos = _tipos;
    final categorias = <String, List<Map<String, dynamic>>>{};
    for (final t in tipos ?? const <Map<String, dynamic>>[]) {
      (categorias['${t['categoria'] ?? 'Otras'}'] ??= []).add(t);
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notificaciones', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 240),
        child: _error != null
            ? Center(
                key: const ValueKey('error'),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
                    ],
                  ),
                ),
              )
            : tipos == null
            ? const Center(key: ValueKey('cargando'), child: CircularProgressIndicator())
            : ListView(
                key: const ValueKey('lista'),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  GrupoAjustes(
                    filas: [
                      FilaAjuste(
                        icono: Icons.notifications_active_outlined,
                        titulo: 'Recibir notificaciones',
                        valor: _activas ? 'Activadas' : 'Apagadas: no te llega ninguna',
                        derecha: Switch(value: _activas, onChanged: (v) => _guardar({'activas': '$v'}, () => _activas = v, () => _activas = !v)),
                      ),
                    ],
                  ),
                  AnimatedOpacity(
                    duration: const Duration(milliseconds: 220),
                    opacity: _activas ? 1 : 0.4,
                    child: IgnorePointer(
                      ignoring: !_activas,
                      child: Column(
                        children: [
                          for (final c in categorias.entries)
                            GrupoAjustes(
                              titulo: c.key.toUpperCase(),
                              filas: [
                                for (final t in c.value)
                                  _FilaTipo(
                                    nombre: '${t['nombre'] ?? t['clave']}',
                                    descripcion: '${t['descripcion'] ?? ''}',
                                    valor: _prefs['${t['clave']}'] != false,
                                    alCambiar: (v) {
                                      final k = '${t['clave']}';
                                      final antes = _prefs[k];
                                      _guardar({'clave': k, 'valor': '$v'}, () => _prefs[k] = v, () => antes == null ? _prefs.remove(k) : _prefs[k] = antes);
                                    },
                                  ),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text(
                      'Si no te llegan, revisa también los permisos de notificaciones de Pivot en los ajustes del teléfono.',
                      style: TextStyle(fontSize: 12.5, color: p.textoSecundario),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _FilaTipo extends StatelessWidget {
  const _FilaTipo({required this.nombre, required this.descripcion, required this.valor, required this.alCambiar});
  final String nombre;
  final String descripcion;
  final bool valor;
  final ValueChanged<bool> alCambiar;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      value: valor,
      onChanged: alCambiar,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      title: Text(nombre, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: descripcion.isEmpty ? null : Text(descripcion),
    );
  }
}
