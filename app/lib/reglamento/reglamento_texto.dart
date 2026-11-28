import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/tema.dart';
import 'reglamento_datos.dart';

/// Texto del reglamento (markdown sencillo del documento): párrafos, negrita,
/// cursiva, listas, tablas y enlaces. Los términos del glosario quedan
/// subrayados (la primera vez que aparecen) y se abren en una hoja abajo.
class TextoRegla extends StatefulWidget {
  const TextoRegla(this.md, {super.key, required this.alAbrir, this.glosario = true, this.tamano = 15.5});
  final String md;

  /// Enlace interno (`pivot:s/<id>`, `pivot:p/<parte>`).
  final void Function(String enlace) alAbrir;
  final bool glosario;
  final double tamano;

  @override
  State<TextoRegla> createState() => _TextoReglaState();
}

class _TextoReglaState extends State<TextoRegla> {
  final _toques = <TapGestureRecognizer>[];
  final _vistos = <Termino>{};

  @override
  void dispose() {
    for (final t in _toques) {
      t.dispose();
    }
    super.dispose();
  }

  TapGestureRecognizer _toque(VoidCallback f) {
    final t = TapGestureRecognizer()..onTap = f;
    _toques.add(t);
    return t;
  }

  @override
  Widget build(BuildContext context) {
    for (final t in _toques) {
      t.dispose();
    }
    _toques.clear();
    _vistos.clear();
    final p = context.pivot;
    final base = TextStyle(fontSize: widget.tamano, height: 1.5, color: p.texto);
    final bloques = <Widget>[];
    final parrafo = <String>[];

    void cerrarParrafo() {
      if (parrafo.isEmpty) return;
      final texto = parrafo.join('\n').trim();
      parrafo.clear();
      if (texto.replaceAll('*', '').trim().isEmpty) return;
      bloques.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text.rich(TextSpan(style: base, children: _enLinea(texto, p))),
        ),
      );
    }

    final lineas = widget.md.split('\n');
    for (var i = 0; i < lineas.length; i++) {
      final l = lineas[i];
      final t = l.trim();
      if (t.isEmpty) {
        cerrarParrafo();
        continue;
      }
      if (t.startsWith('#### ')) {
        cerrarParrafo();
        bloques.add(
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 6),
            child: Text(
              t.substring(5).replaceAll('*', ''),
              style: TextStyle(fontSize: widget.tamano + 1.5, fontWeight: FontWeight.w800, color: p.texto, height: 1.3),
            ),
          ),
        );
        continue;
      }
      if (t.startsWith('|')) {
        cerrarParrafo();
        final filas = <List<String>>[];
        while (i < lineas.length && lineas[i].trim().startsWith('|')) {
          final celdas = lineas[i].trim().split('|');
          final c = celdas.sublist(1, celdas.length - (lineas[i].trim().endsWith('|') ? 1 : 0)).map((x) => x.trim()).toList();
          if (!c.every((x) => x.isEmpty || RegExp(r'^:?-+:?$').hasMatch(x))) filas.add(c);
          i++;
        }
        i--;
        if (filas.isNotEmpty) bloques.add(_tabla(filas, base, p));
        continue;
      }
      final vineta = RegExp(r'^(\s*)([-*•]|\d+\.)\s+(.*)$').firstMatch(l);
      if (vineta != null) {
        cerrarParrafo();
        final sangria = (vineta.group(1)!.length / 2).floor().clamp(0, 3);
        final marca = vineta.group(2)!;
        bloques.add(
          Padding(
            padding: EdgeInsets.only(left: 4.0 + sangria * 16, bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: marca.length > 1 ? 26 : 16,
                  child: Text(
                    marca.length > 1 ? marca : '•',
                    style: base.copyWith(fontWeight: FontWeight.w700, color: p.marcaTexto),
                  ),
                ),
                Expanded(
                  child: Text.rich(TextSpan(style: base, children: _enLinea(vineta.group(3)!, p))),
                ),
              ],
            ),
          ),
        );
        continue;
      }
      parrafo.add(l);
    }
    cerrarParrafo();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: bloques);
  }

  Widget _tabla(List<List<String>> filas, TextStyle base, PivotPaleta p) {
    final columnas = filas.map((f) => f.length).reduce((a, b) => a > b ? a : b);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        border: Border.all(color: p.bordeSuave),
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < filas.length; i++)
            Container(
              color: i == 0 && filas.length > 1 ? p.suave : null,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var c = 0; c < columnas; c++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Text.rich(
                          TextSpan(
                            style: base.copyWith(fontSize: widget.tamano - 2),
                            children: _enLinea(c < filas[i].length ? filas[i][c] : '', p),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  static final _marcas = RegExp(r'\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*\n]+?)\*|⏎');

  List<InlineSpan> _enLinea(String texto, PivotPaleta p, {bool negrita = false, bool cursiva = false}) {
    final out = <InlineSpan>[];
    var desde = 0;
    for (final m in _marcas.allMatches(texto)) {
      if (m.start > desde) out.addAll(_plano(texto.substring(desde, m.start), p, negrita, cursiva));
      if (m.group(0) == '⏎') {
        out.add(const TextSpan(text: '\n'));
      } else if (m.group(1) != null) {
        final url = m.group(2)!;
        out.add(
          TextSpan(
            text: m.group(1)!.replaceAll('*', ''),
            style: TextStyle(color: p.marcaTexto, fontWeight: FontWeight.w700, decoration: TextDecoration.underline, decorationColor: p.marcaTexto),
            recognizer: _toque(() => _abrir(url)),
          ),
        );
      } else if (m.group(3) != null) {
        out.addAll(_enLinea(m.group(3)!, p, negrita: true, cursiva: cursiva));
      } else if (m.group(4) != null) {
        out.addAll(_enLinea(m.group(4)!, p, negrita: negrita, cursiva: true));
      }
      desde = m.end;
    }
    if (desde < texto.length) out.addAll(_plano(texto.substring(desde), p, negrita, cursiva));
    return out;
  }

  List<InlineSpan> _plano(String texto, PivotPaleta p, bool negrita, bool cursiva) {
    final estilo = TextStyle(fontWeight: negrita ? FontWeight.w700 : null, fontStyle: cursiva ? FontStyle.italic : null);
    final limpio = texto.replaceAll('*', '');
    final r = ReglamentoRepo.datos.value;
    if (!widget.glosario || r == null) return [TextSpan(text: limpio, style: estilo)];
    // Primer término del glosario que aparece y que todavía no se subrayó.
    (int, int, Termino)? mejor;
    for (final (re, g) in r.terminosEnTexto) {
      if (_vistos.contains(g)) continue;
      final m = re.firstMatch(limpio);
      if (m != null && (mejor == null || m.start < mejor.$1)) mejor = (m.start, m.end, g);
    }
    if (mejor == null) return [TextSpan(text: limpio, style: estilo)];
    final (a, b, g) = mejor;
    _vistos.add(g);
    return [
      TextSpan(text: limpio.substring(0, a), style: estilo),
      TextSpan(
        text: limpio.substring(a, b),
        style: estilo.copyWith(decoration: TextDecoration.underline, decorationStyle: TextDecorationStyle.dotted, decorationColor: p.marcaTexto),
        recognizer: _toque(() => verTermino(context, g, widget.alAbrir)),
      ),
      ..._plano(limpio.substring(b), p, negrita, cursiva),
    ];
  }

  void _abrir(String url) {
    if (url.startsWith('pivot:')) {
      widget.alAbrir(url);
      return;
    }
    final u = Uri.tryParse(url);
    if (u != null) launchUrl(u, mode: LaunchMode.externalApplication);
  }
}

/// Definición de un término del glosario en una hoja abajo.
Future<void> verTermino(BuildContext context, Termino g, void Function(String) alAbrir) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) {
      final p = ctx.pivot;
      return SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.7),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(g.t, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                if (g.en.isNotEmpty)
                  Text(
                    g.en,
                    style: TextStyle(color: p.textoSecundario, fontStyle: FontStyle.italic),
                  ),
                const SizedBox(height: 12),
                TextoRegla(
                  g.def,
                  glosario: false,
                  alAbrir: (e) {
                    Navigator.of(ctx).pop();
                    alAbrir(e);
                  },
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}
