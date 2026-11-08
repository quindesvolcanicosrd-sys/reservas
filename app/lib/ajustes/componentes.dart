import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/tema.dart';

/// Piezas comunes de Ajustes: grupos en tarjeta, filas con valor y hojas
/// de edición (texto, opciones). Mismo lenguaje visual que Equipo.

/// Título de grupo + tarjeta con las filas separadas por una línea fina.
class GrupoAjustes extends StatelessWidget {
  const GrupoAjustes({super.key, this.titulo, required this.filas, this.pie});
  final String? titulo;
  final List<Widget> filas;
  final String? pie;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (titulo != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Text(
                titulo!,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: p.textoSecundario),
              ),
            ),
          Material(
            color: p.tarjeta,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (i, f) in filas.indexed) ...[if (i > 0) Divider(height: 1, indent: 56, color: p.fondo), f],
              ],
            ),
          ),
          if (pie != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: Text(pie!, style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
            ),
        ],
      ),
    );
  }
}

/// Fila: ícono, título, valor (o "Sin completar") y flecha.
class FilaAjuste extends StatelessWidget {
  const FilaAjuste({
    super.key,
    required this.icono,
    required this.titulo,
    this.valor,
    this.alTocar,
    this.pendiente = false,
    this.peligro = false,
    this.derecha,
    this.color,
  });

  /// Si llega, el ícono va en un cuadro de ese color (home de Ajustes).
  final Color? color;
  final IconData icono;
  final String titulo;
  final String? valor;
  final VoidCallback? alTocar;

  /// Punto de "falta completar".
  final bool pendiente;

  /// Rojo (cerrar sesión, eliminar cuenta).
  final bool peligro;
  final Widget? derecha;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final v = valor?.trim();
    return InkWell(
      onTap: alTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            if (color != null)
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(PivotRadios.chip + 2)),
                child: Icon(icono, size: 21, color: PivotPaleta.sobreSeccion),
              )
            else
              Icon(icono, size: 22, color: peligro ? p.marcaTexto : p.textoSecundario),
            SizedBox(width: color != null ? 14 : 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titulo,
                    style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: peligro ? p.marcaTexto : p.texto),
                  ),
                  if (v != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      v.isEmpty ? 'Sin completar' : v,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13.5, color: p.textoSecundario, fontStyle: v.isEmpty ? FontStyle.italic : FontStyle.normal),
                    ),
                  ],
                ],
              ),
            ),
            if (pendiente)
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(left: 8),
                decoration: BoxDecoration(color: p.marca, shape: BoxShape.circle),
              ),
            ?derecha,
            if (derecha == null && alTocar != null) ...[const SizedBox(width: 4), Icon(Icons.chevron_right_rounded, color: p.textoSecundario)],
          ],
        ),
      ),
    );
  }
}

/// Pantalla de un grupo de Ajustes (lista con margen y transición común).
class SubAjustes extends StatelessWidget {
  const SubAjustes({super.key, required this.titulo, required this.hijos});
  final String titulo;
  final List<Widget> hijos;

  static Future<T?> abrir<T>(BuildContext context, Widget pantalla) {
    return Navigator.of(context).push<T>(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 280),
        reverseTransitionDuration: const Duration(milliseconds: 220),
        pageBuilder: (_, _, _) => pantalla,
        transitionsBuilder: (_, a, _, child) {
          final c = CurvedAnimation(parent: a, curve: Curves.easeOutCubic);
          return FadeTransition(
            opacity: c,
            child: SlideTransition(
              position: Tween(begin: const Offset(0.06, 0), end: Offset.zero).animate(c),
              child: child,
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 40), children: hijos),
    );
  }
}

/// Ejecuta un guardado y avisa con un snackbar ("Guardado" o el error).
Future<bool> guardarConAviso(BuildContext context, Future<void> Function() accion, {String ok = 'Guardado'}) async {
  final m = ScaffoldMessenger.of(context);
  try {
    await accion();
    m
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(ok)));
    return true;
  } catch (e) {
    m
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(e is ApiException ? e.toString() : 'No se pudo guardar. Revisa tu conexión.')));
    return false;
  }
}

/// Hoja con un campo de texto. Devuelve el texto o null si se cancela.
Future<String?> editarTexto(
  BuildContext context, {
  required String titulo,
  String valor = '',
  String? ayuda,
  TextInputType teclado = TextInputType.text,
  int maxLength = 80,
  int lineas = 1,
  String? Function(String)? validar,
}) {
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _HojaTexto(titulo: titulo, valor: valor, ayuda: ayuda, teclado: teclado, maxLength: maxLength, lineas: lineas, validar: validar),
  );
}

class _HojaTexto extends StatefulWidget {
  const _HojaTexto({
    required this.titulo,
    required this.valor,
    required this.ayuda,
    required this.teclado,
    required this.maxLength,
    required this.lineas,
    required this.validar,
  });
  final String titulo;
  final String valor;
  final String? ayuda;
  final TextInputType teclado;
  final int maxLength;
  final int lineas;
  final String? Function(String)? validar;

  @override
  State<_HojaTexto> createState() => _HojaTextoState();
}

class _HojaTextoState extends State<_HojaTexto> {
  late final _c = TextEditingController(text: widget.valor);
  String? _error;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _listo() {
    final v = _c.text.trim();
    final e = widget.validar?.call(v);
    if (e != null) {
      setState(() => _error = e);
      return;
    }
    Navigator.of(context).pop(v);
  }

  @override
  Widget build(BuildContext context) {
    return HojaBase(
      titulo: widget.titulo,
      ayuda: widget.ayuda,
      accion: ('Guardar', _listo),
      child: TextField(
        controller: _c,
        autofocus: true,
        keyboardType: widget.lineas > 1 ? TextInputType.multiline : widget.teclado,
        maxLength: widget.maxLength,
        minLines: 1,
        maxLines: widget.lineas,
        textCapitalization: widget.teclado == TextInputType.text ? TextCapitalization.sentences : TextCapitalization.none,
        onSubmitted: widget.lineas > 1 ? null : (_) => _listo(),
        decoration: InputDecoration(errorText: _error),
      ),
    );
  }
}

/// Hoja de opciones en pills. `multi`: varias (se guardan separadas por
/// coma). `otro`: agrega un campo libre ("Otro: ...").
Future<String?> elegirOpciones(
  BuildContext context, {
  required String titulo,
  required List<String> opciones,
  String valor = '',
  bool multi = false,
  bool otro = false,
  String? ayuda,
}) {
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _HojaOpciones(titulo: titulo, opciones: opciones, valor: valor, multi: multi, otro: otro, ayuda: ayuda),
  );
}

class _HojaOpciones extends StatefulWidget {
  const _HojaOpciones({required this.titulo, required this.opciones, required this.valor, required this.multi, required this.otro, required this.ayuda});
  final String titulo;
  final List<String> opciones;
  final String valor;
  final bool multi;
  final bool otro;
  final String? ayuda;

  @override
  State<_HojaOpciones> createState() => _HojaOpcionesState();
}

class _HojaOpcionesState extends State<_HojaOpciones> {
  late final Set<String> _sel;
  late final TextEditingController _libre;

  @override
  void initState() {
    super.initState();
    final actuales = widget.multi ? widget.valor.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList() : [widget.valor.trim()];
    _sel = {
      for (final a in actuales)
        if (widget.opciones.contains(a)) a,
    };
    _libre = TextEditingController(
      text: [
        for (final a in actuales)
          if (a.isNotEmpty && !widget.opciones.contains(a)) a,
      ].join(', '),
    );
  }

  @override
  void dispose() {
    _libre.dispose();
    super.dispose();
  }

  void _listo() {
    final libre = _libre.text.trim();
    final partes = [...widget.opciones.where(_sel.contains), if (libre.isNotEmpty) libre];
    Navigator.of(context).pop(widget.multi ? partes.join(', ') : (partes.isEmpty ? '' : partes.first));
  }

  @override
  Widget build(BuildContext context) {
    return HojaBase(
      titulo: widget.titulo,
      ayuda: widget.ayuda,
      accion: ('Guardar', _listo),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final o in widget.opciones)
                ChoiceChip(
                  label: Text(o),
                  selected: _sel.contains(o),
                  onSelected: (si) => setState(() {
                    if (!widget.multi) {
                      _sel.clear();
                      _libre.clear();
                    }
                    si ? _sel.add(o) : _sel.remove(o);
                  }),
                ),
            ],
          ),
          if (widget.otro) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _libre,
              maxLength: 120,
              onChanged: (v) {
                if (!widget.multi && v.trim().isNotEmpty && _sel.isNotEmpty) setState(_sel.clear);
              },
              decoration: const InputDecoration(labelText: 'Otro (opcional)'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Estructura común de las hojas: título, ayuda, contenido y botón.
class HojaBase extends StatelessWidget {
  const HojaBase({super.key, required this.titulo, this.ayuda, required this.child, this.accion});
  final String titulo;
  final String? ayuda;
  final Widget child;
  final (String, VoidCallback?)? accion;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(titulo, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              if (ayuda != null) ...[const SizedBox(height: 6), Text(ayuda!, style: TextStyle(fontSize: 13.5, color: p.textoSecundario))],
              const SizedBox(height: 16),
              child,
              if (accion != null) ...[
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: accion!.$2,
                  child: Text(accion!.$1),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Aviso de datos sensibles (salud, identidad, dirección): escudo + texto.
class AvisoPrivado extends StatelessWidget {
  const AvisoPrivado({super.key, this.texto = AvisoPrivado.textoSensible});
  final String texto;

  static const textoSensible =
      'Información visible y de uso de emergencia solo por administradores de tu equipo. '
      'Todos tus datos personales están cifrados y son seguros.';

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        border: Border.all(color: p.bordeSuave),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.verified_user_outlined, size: 20, color: p.textoSecundario),
          const SizedBox(width: 12),
          Expanded(
            child: Text(texto, style: TextStyle(fontSize: 13, height: 1.35, color: p.textoSecundario)),
          ),
        ],
      ),
    );
  }
}
