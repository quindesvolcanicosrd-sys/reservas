import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:shared_preferences/shared_preferences.dart';

import '../sesion/sesion.dart';

/// Reglamento de roller derby (Victor, 2026-11-28). Sale del Google Doc de
/// Victor: el servidor lo lee cada día (`getReglamento`) y la app guarda la
/// última versión para usarla sin internet. Trae una copia dentro de la app
/// (assets/reglamento.json) para la primera vez.
class Regla {
  Regla(this.id, this.parte, this.num, this.titulo, this.nivel, this.md);
  final String id, parte, num, titulo, md;
  final int nivel;
  String get completo => num.isEmpty ? titulo : '$num. $titulo';
}

class Caso {
  Caso(this.id, this.seccion, this.texto, this.resultado, this.explicacion, this.extra);
  final String id, seccion, texto, resultado, explicacion, extra;

  /// ¿El resultado dice si hay o no penalización? Sirve para el modo aprender.
  bool? get hayFalta {
    final r = Reglamento.normalizar(resultado);
    if (RegExp(r'\b(no hay|no se (le |les )?(aplica|pita|debe)|sin) (penaliz|falta)').hasMatch(r) || r.startsWith('no hay penaliz')) return false;
    if (RegExp(r'no se (le |les )?(aplica|cobra|pita)').hasMatch(r) && r.contains('penaliz')) return false;
    if (r.contains('penaliz') || r.contains('falta') || r.contains('expuls')) return true;
    return null;
  }
}

class Termino {
  Termino(this.t, this.en, this.def, this.grupo);
  final String t, en, def, grupo;
}

class Falta {
  Falta(this.codigo, this.nombre, this.en, this.seccion, this.senal, this.nota);
  final String codigo, nombre, en, seccion, senal, nota;
}

class ParteReglamento {
  ParteReglamento(this.id, this.titulo, this.subtitulo, this.secciones);
  final String id, titulo, subtitulo;
  final List<String> secciones;
}

class Reglamento {
  Reglamento._(this.version, this.partes, this.secciones, this.casos, this.glosario, this.faltas, this.creditos) {
    for (final c in casos) {
      (casosPorSeccion[c.seccion] ??= []).add(c);
    }
  }

  final String version;
  final List<ParteReglamento> partes;
  final Map<String, Regla> secciones;
  final List<Caso> casos;
  final List<Termino> glosario;
  final List<Falta> faltas;
  final List<String> creditos;
  final Map<String, List<Caso>> casosPorSeccion = {};

  factory Reglamento.desdeJson(Map<String, dynamic> j) {
    String s(dynamic x) => (x ?? '').toString();
    final secs = <String, Regla>{};
    for (final x in (j['secciones'] as List? ?? const [])) {
      secs[s(x['id'])] = Regla(s(x['id']), s(x['parte']), s(x['num']), s(x['titulo']), (x['nivel'] as num?)?.toInt() ?? 2, s(x['md']));
    }
    return Reglamento._(
      s(j['version']),
      [
        for (final p in (j['partes'] as List? ?? const []))
          ParteReglamento(s(p['id']), s(p['titulo']), s(p['subtitulo']), [for (final id in (p['secciones'] as List? ?? const [])) s(id)]),
      ],
      secs,
      [
        for (final c in (j['casos'] as List? ?? const []))
          Caso(s(c['id']), s(c['seccion']), s(c['texto']), s(c['resultado']), s(c['explicacion']), s(c['extra'])),
      ],
      [for (final g in (j['glosario'] as List? ?? const [])) Termino(s(g['t']), s(g['en']), s(g['def']), s(g['grupo']))],
      [for (final f in (j['faltas'] as List? ?? const [])) Falta(s(f['codigo']), s(f['nombre']), s(f['en']), s(f['seccion']), s(f['senal']), s(f['nota']))],
      [for (final c in (j['creditos'] as List? ?? const [])) s(c)],
    );
  }

  ParteReglamento? parte(String id) {
    for (final p in partes) {
      if (p.id == id) return p;
    }
    return null;
  }

  /// Sección de las reglas por número («4.1.1»); si no está, la de arriba.
  Regla? reglaPorNumero(String num) {
    var n = num;
    while (n.isNotEmpty) {
      final r = secciones['reglas:$n'];
      if (r != null) return r;
      final i = n.lastIndexOf('.');
      n = i < 0 ? '' : n.substring(0, i);
    }
    return null;
  }

  /// Escenarios de una sección de las reglas y de sus subsecciones.
  List<Caso> casosDe(String num) {
    if (num.isEmpty) return const [];
    return [
      for (final e in casosPorSeccion.entries)
        if (e.key == num || e.key.startsWith('$num.')) ...e.value,
    ];
  }

  List<Falta> faltasDe(String num) => [
    for (final f in faltas)
      if (num.isNotEmpty && (f.seccion == num || f.seccion.startsWith('$num.'))) f,
  ];

  /// Secciones de una parte, en orden, y sus vecinas para «Anterior/Siguiente».
  List<Regla> seccionesDe(String parte) => [for (final id in this.parte(parte)?.secciones ?? const <String>[]) ?secciones[id]];

  List<Regla> hijas(Regla r) {
    final lista = seccionesDe(r.parte);
    final i = lista.indexOf(r);
    final debajo = <Regla>[];
    for (var k = i + 1; k < lista.length && lista[k].nivel > r.nivel; k++) {
      debajo.add(lista[k]);
    }
    if (debajo.isEmpty) return const [];
    final minimo = debajo.map((x) => x.nivel).reduce((a, b) => a < b ? a : b);
    return [
      for (final x in debajo)
        if (x.nivel == minimo) x,
    ];
  }

  // ─── Búsqueda sin IA: palabras clave, raíces y sinónimos en inglés ───────

  static String normalizar(String s) {
    const de = 'áàäâéèëêíìïîóòöôúùüûñ';
    const a = 'aaaaeeeeiiiioooouuuun';
    final b = StringBuffer();
    for (final ch in s.toLowerCase().split('')) {
      final i = de.indexOf(ch);
      b.write(i >= 0 ? a[i] : ch);
    }
    return b.toString();
  }

  static const _vacias = {
    'que',
    'el',
    'la',
    'lo',
    'los',
    'las',
    'le',
    'les',
    'de',
    'del',
    'al',
    'a',
    'en',
    'y',
    'o',
    'u',
    'un',
    'una',
    'unos',
    'unas',
    'se',
    'es',
    'son',
    'si',
    'no',
    'por',
    'para',
    'con',
    'sin',
    'mi',
    'me',
    'te',
    'tu',
    'su',
    'sus',
    'como',
    'cuando',
    'donde',
    'puedo',
    'puede',
    'pueden',
    'hay',
    'esta',
    'estoy',
    'esto',
    'eso',
    'ese',
    'esa',
    'pasa',
    'pasaria',
    'pasar',
    'cual',
    'cuales',
    'qué',
    'hacer',
    'hago',
    'debo',
    'tengo',
    'otra',
    'otro',
    'persona',
    'the',
    'of',
    'to',
    'and',
    'is',
    'mas',
    'muy',
    'ya',
    'entonces',
    'pero',
    'porque',
  };

  static String _subtitulos(String md) => RegExp(r'^#### (.+)$', multiLine: true).allMatches(md).map((m) => m.group(1)).join(' ');

  static String _raiz(String p) => p.length >= 7 ? p.substring(0, p.length - 3) : (p.length >= 5 ? p.substring(0, p.length - 1) : p);

  static List<String> palabras(String consulta) => [
    for (final p in normalizar(consulta).split(RegExp(r'[^a-z0-9.]+')))
      if (p.length >= 2 && !_vacias.contains(p)) _raiz(p),
  ];

  late final List<(Object, String, String)> _indice = [
    for (final r in secciones.values)
      if (r.parte != 'casos') (r, normalizar('${r.num} ${r.titulo} ${_subtitulos(r.md)}'), normalizar(r.md)),
    for (final c in casos) (c, normalizar('${c.id} escenario'), normalizar('${c.texto} ${c.resultado} ${c.explicacion}')),
    for (final g in glosario) (g, normalizar('${g.t} ${g.en}'), normalizar(g.def)),
    for (final f in faltas) (f, normalizar('${f.codigo} ${f.nombre} ${f.en}'), normalizar('${f.senal} ${f.nota}')),
  ];

  /// Resultados ordenados: glosario y faltas por nombre primero, títulos
  /// después y al final el texto. Una consulta de una letra busca el código
  /// de falta («X» → Corte de pista).
  List<Object> buscar(String consulta) {
    final q = consulta.trim();
    if (q.length == 1) {
      return [
        for (final f in faltas)
          if (f.codigo.toLowerCase() == q.toLowerCase()) f,
      ];
    }
    final ps = palabras(q);
    if (ps.isEmpty) return const [];
    final puntos = <(Object, double)>[];
    for (final (obj, titulo, texto) in _indice) {
      var total = 0.0;
      var todas = true;
      for (final p in ps) {
        final enTitulo = titulo.contains(p);
        var veces = 0;
        if (!enTitulo) {
          var i = texto.indexOf(p);
          while (i >= 0 && veces < 6) {
            veces++;
            i = texto.indexOf(p, i + p.length);
          }
        }
        if (!enTitulo && veces == 0) todas = false;
        total += (enTitulo ? (obj is Termino || obj is Falta ? 14 : 9) : 0) + veces;
      }
      if (total == 0) continue;
      if (todas && ps.length > 1) total *= 2.2;
      if (obj is Caso) total *= 0.8;
      // Las reglas pesan más que el material de apoyo.
      if (obj is Regla) total *= obj.parte == 'reglas' ? 1.3 : (obj.parte == 'senales' ? 1.0 : 0.8);
      puntos.add((obj, total));
    }
    puntos.sort((a, b) => b.$2.compareTo(a.$2));
    return [for (final x in puntos.take(40)) x.$1];
  }

  /// Términos del glosario que se subrayan en el texto (el primero de cada uno).
  late final List<(RegExp, Termino)> terminosEnTexto = () {
    final out = <(String, Termino)>[];
    for (final g in glosario) {
      for (final nombre in g.t.split(',')) {
        final n = nombre.replaceAll(RegExp(r'«|»'), '').trim();
        if (n.length >= 4) out.add((n, g));
      }
    }
    out.sort((a, b) => b.$1.length.compareTo(a.$1.length));
    return [for (final (n, g) in out) (RegExp('(?<![\\wáéíóúñÁÉÍÓÚÑ])${RegExp.escape(n)}(?![\\wáéíóúñÁÉÍÓÚÑ])', caseSensitive: false), g)];
  }();
}

class ReglamentoRepo {
  ReglamentoRepo._();

  static final datos = ValueNotifier<Reglamento?>(null);

  /// Fecha del aviso «WFTDA actualizó las reglas» (solo para el equipo de Pivot).
  static final avisoWftda = ValueNotifier<String?>(null);
  static Future<void>? _cargando;
  static const _clave = 'reglamento.json';

  static Future<void> cargar(Sesion s) => _cargando ??= _cargar(s).whenComplete(() => _cargando = null);

  static Future<void> _cargar(Sesion s) async {
    final pr = await SharedPreferences.getInstance();
    if (datos.value == null) {
      final guardado = pr.getString(_clave);
      try {
        final texto = guardado ?? await rootBundle.loadString('assets/reglamento.json');
        datos.value = await compute(_leer, texto);
      } catch (_) {
        datos.value = await compute(_leer, await rootBundle.loadString('assets/reglamento.json'));
      }
    }
    // Versión nueva del servidor, si hay internet.
    try {
      final r = await s.api.get('getReglamento', {'version': datos.value?.version, if (s.adminToken != null) 'adminToken': s.adminToken});
      avisoWftda.value = (r['wftda'] as Map?)?['fecha']?.toString();
      final nuevo = r['reglamento'];
      if (nuevo is Map<String, dynamic>) {
        final texto = jsonEncode(nuevo);
        datos.value = await compute(_leer, texto);
        await pr.setString(_clave, texto);
      }
    } catch (_) {}
  }

  static Reglamento _leer(String texto) => Reglamento.desdeJson(jsonDecode(texto) as Map<String, dynamic>);

  /// Equipo de Pivot: leer ya el documento o dar por visto el aviso de WFTDA.
  static Future<String> actualizarAhora(Sesion s) async {
    final r = await s.api.post('superReglamento', {'adminToken': s.adminToken});
    if (r['exito'] != true) return (r['error'] ?? 'No se pudo leer el documento.').toString();
    await _cargar(s);
    return r['cambio'] == true ? 'Listo: el reglamento se actualizó.' : 'El documento no tenía cambios.';
  }

  static Future<void> marcarVisto(Sesion s) async {
    avisoWftda.value = null;
    try {
      await s.api.post('superReglamento', {'adminToken': s.adminToken, 'accion': 'visto'});
    } catch (_) {}
  }

  // Favoritos y «Seguir leyendo», en el teléfono.
  static final favoritos = ValueNotifier<List<String>>(const []);
  static final ultima = ValueNotifier<String?>(null);

  static Future<void> cargarLocal() async {
    final pr = await SharedPreferences.getInstance();
    favoritos.value = pr.getStringList('reglamento.favoritos') ?? const [];
    ultima.value = pr.getString('reglamento.ultima');
  }

  static Future<void> alternarFavorito(String id) async {
    final l = [...favoritos.value];
    l.contains(id) ? l.remove(id) : l.insert(0, id);
    favoritos.value = l;
    (await SharedPreferences.getInstance()).setStringList('reglamento.favoritos', l);
  }

  static Future<void> leyendo(String id) async {
    ultima.value = id;
    (await SharedPreferences.getInstance()).setString('reglamento.ultima', id);
  }
}
