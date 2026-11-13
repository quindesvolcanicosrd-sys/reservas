import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/cargando.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';

/// Inventario del equipamiento que presta la liga (etapa 3, Victor
/// 2026-11-12), solo Pivots: patines por talla y protecciones, con + y −,
/// y quién lo tiene reservado en los próximos entrenamientos.
/// Fotos, etiquetas y aviso a los 7 días quedan para la siguiente entrega.
class InventarioScreen extends StatefulWidget {
  const InventarioScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<InventarioScreen> createState() => _InventarioScreenState();
}

class _InventarioScreenState extends State<InventarioScreen> {
  Api get _api => widget.sesion.api;
  Map<String, Object?> get _admin => {'adminToken': widget.sesion.adminToken};

  List<({String talla, int cantidad})>? _tallas;
  int _protecciones = 0;
  List<Map<String, dynamic>> _enUso = const [];
  String? _error;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final res = await Future.wait([_api.get('adminGetEquipamiento', _admin), _api.getLista('adminGetQueLlevar', _admin).catchError((_) => <dynamic>[])]);
      final r = res[0] as Map<String, dynamic>;
      final l = [
        for (final t in (r['tallas'] as List? ?? const []))
          if (t is Map) (talla: '${t['talla']}', cantidad: (t['cantidad'] as num?)?.toInt() ?? 0),
      ]..sort((a, b) => (double.tryParse(a.talla) ?? 0).compareTo(double.tryParse(b.talla) ?? 0));
      if (!mounted) return;
      setState(() {
        _tallas = l;
        _protecciones = (r['protecciones'] as num?)?.toInt() ?? 0;
        _enUso = (res[1] as List).whereType<Map<String, dynamic>>().toList();
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.');
    }
  }

  Future<void> _guardar(List<({String talla, int cantidad})> tallas, int protecciones) async {
    final antes = (_tallas, _protecciones);
    setState(() {
      _tallas = tallas;
      _protecciones = protecciones;
      _guardando = true;
    });
    try {
      final r = await _api.post('adminGuardarEquipamiento', {
        ..._admin,
        'tallasJson': jsonEncode([
          for (final t in tallas) {'talla': t.talla, 'cantidad': t.cantidad},
        ]),
        'protecciones': protecciones,
      });
      if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _tallas = antes.$1;
        _protecciones = antes.$2;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  void _cambiarTalla(int i, int delta) {
    final l = [..._tallas!];
    final n = (l[i].cantidad + delta).clamp(0, 99);
    l[i] = (talla: l[i].talla, cantidad: n);
    _guardar(l, _protecciones);
  }

  Future<void> _nuevaTalla() async {
    final c = TextEditingController();
    final t = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Nueva talla de patines'),
        content: TextField(
          controller: c,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(hintText: 'Ej. 38'),
          onSubmitted: (v) => Navigator.of(d).pop(v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text.trim()), child: const Text('Agregar')),
        ],
      ),
    );
    if (t == null || t.isEmpty || !mounted) return;
    if (_tallas!.any((x) => x.talla == t)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Esa talla ya está. Usa + para sumar pares.')));
      return;
    }
    final l = [..._tallas!, (talla: t, cantidad: 1)]..sort((a, b) => (double.tryParse(a.talla) ?? 0).compareTo(double.tryParse(b.talla) ?? 0));
    await _guardar(l, _protecciones);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final tallas = _tallas;
    Widget cuerpo;
    if (tallas == null) {
      cuerpo = _error != null ? Center(key: const ValueKey('e'), child: Text(_error!)) : const Center(key: ValueKey('c'), child: PivotCargando());
    } else {
      final pares = tallas.fold<int>(0, (a, t) => a + t.cantidad);
      Widget contador(String titulo, String sub, int n, void Function(int) cambiar) => ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14),
        title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(sub),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              tooltip: 'Quitar uno',
              onPressed: _guardando || n == 0 ? null : () => cambiar(-1),
              icon: const Icon(Icons.remove_circle_outline_rounded),
            ),
            SizedBox(
              width: 28,
              child: Text(
                '$n',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.texto),
              ),
            ),
            IconButton(tooltip: 'Sumar uno', onPressed: _guardando ? null : () => cambiar(1), icon: const Icon(Icons.add_circle_outline_rounded)),
          ],
        ),
      );
      Widget tarjeta(List<Widget> hijos) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          clipBehavior: Clip.antiAlias,
          child: Column(children: hijos),
        ),
      );
      Text seccion(String t) => Text(
        t,
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
      );
      cuerpo = RefreshIndicator(
        key: const ValueKey('lista'),
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            seccion('PATINES · $pares PARES'),
            const SizedBox(height: 8),
            tarjeta([
              for (var i = 0; i < tallas.length; i++)
                contador(
                  'Talla ${tallas[i].talla}',
                  tallas[i].cantidad == 1 ? '1 par' : '${tallas[i].cantidad} pares',
                  tallas[i].cantidad,
                  (d) => _cambiarTalla(i, d),
                ),
              ListTile(
                leading: Icon(Icons.add_rounded, color: p.marcaTexto),
                title: Text(
                  'Agregar talla',
                  style: TextStyle(color: p.marcaTexto, fontWeight: FontWeight.w600),
                ),
                onTap: _guardando ? null : _nuevaTalla,
              ),
            ]),
            seccion('PROTECCIONES'),
            const SizedBox(height: 8),
            tarjeta([
              contador('Juegos completos', 'Casco, rodilleras, coderas y muñequeras', _protecciones, (d) => _guardar(tallas, (_protecciones + d).clamp(0, 99))),
            ]),
            seccion('RESERVADO PARA LOS PRÓXIMOS ENTRENAMIENTOS'),
            const SizedBox(height: 8),
            if (_enUso.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                child: Text('Nadie reservó equipamiento todavía.', style: TextStyle(color: p.textoSecundario)),
              )
            else
              tarjeta([
                for (final r in _enUso)
                  ListTile(
                    title: Text('${r['nombre']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      [
                        '${r['fecha']}',
                        if ('${r['patines']}'.isNotEmpty && r['patines'] != 'No') 'Patines ${r['patines']}',
                        if ('${r['protecciones']}'.isNotEmpty && r['protecciones'] != 'No') r['protecciones'] == 'Sí' ? 'Protecciones' : '${r['protecciones']}',
                      ].join(' · '),
                    ),
                    trailing: '${r['waLink'] ?? ''}'.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Escribir por WhatsApp',
                            icon: const Icon(Icons.chat_rounded),
                            onPressed: () => launchUrl(Uri.parse('${r['waLink']}'), mode: LaunchMode.externalApplication),
                          ),
                  ),
              ]),
          ],
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventario', style: TextStyle(fontWeight: FontWeight.w700)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: AnimatedOpacity(opacity: _guardando ? 1 : 0, duration: const Duration(milliseconds: 200), child: const LinearProgressIndicator(minHeight: 3)),
        ),
      ),
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: cuerpo),
    );
  }
}
