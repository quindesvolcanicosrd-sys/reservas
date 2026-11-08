import 'package:country_flags/country_flags.dart';
import 'package:flutter/material.dart';

import 'paises_datos.dart';

/// Países del mundo para prefijos de teléfono, documento y residencia
/// (Victor, 2026-11-08: todos, con buscador y banderas planas). Datos en
/// `paises_datos.dart` (generado); los dígitos de los 12 países de la web
/// (`_AJ_PREFIJOS`, js/perfil.js) mandan sobre los generados. El del equipo
/// va primero y es el que se propone por defecto (`config_app.pais_equipo`).
class Pais {
  const Pais(this.codigo, this.codigo3, this.nombre, this.prefijo, this.minDigitos, this.maxDigitos);
  final String codigo; // ISO 3166-1 alfa-2 ("EC")
  final String codigo3; // alfa-3 ("ECU")
  final String nombre;
  final String prefijo; // sin "+"
  final int minDigitos; // número como se marca en el país
  final int maxDigitos;

  /// Como se guarda el prefijo: "+593 (Ecuador)". La web también lo lee
  /// (busca el nombre del país), igual que el formato viejo con bandera.
  String get valorPrefijo => '+$prefijo ($nombre)';

  @override
  bool operator ==(Object other) => other is Pais && other.codigo == codigo;
  @override
  int get hashCode => codigo.hashCode;
}

class Paises {
  /// Dígitos de la web (min, max) para los países que ya usaba el equipo.
  static const _digitosWeb = {
    'EC': (10, 10),
    'CO': (10, 10),
    'PE': (9, 9),
    'VE': (10, 10),
    'AR': (10, 11),
    'CL': (9, 9),
    'MX': (10, 10),
    'ES': (9, 9),
    'US': (10, 10),
    'UY': (8, 9),
    'PY': (9, 9),
    'BO': (8, 8),
  };

  static final List<Pais> lista = [
    for (final (n, a2, a3, cc, l) in paisesMundo)
      Pais(a2, a3, n, cc, _digitosWeb[a2]?.$1 ?? (l == 0 ? 6 : (l - 2).clamp(5, 15)), _digitosWeb[a2]?.$2 ?? (l == 0 ? 15 : l + 1)),
  ];

  static Pais porCodigo(String codigo) => lista.firstWhere((p) => p.codigo == codigo.toUpperCase(), orElse: () => lista.firstWhere((p) => p.codigo == 'EC'));

  /// Lee lo guardado ("🇪🇨 +593 (Ecuador)", "+593 (Ecuador)", "+593", "593" o "Ecuador").
  static Pais? desdeValor(String valor) {
    final v = valor.trim();
    if (v.isEmpty) return null;
    final entre = RegExp(r'\(([^)]+)\)').firstMatch(v)?.group(1)?.trim();
    final nombre = normalizar(entre ?? v.replaceAll(RegExp(r'[^\p{L} ]', unicode: true), '').trim());
    for (final p in lista) {
      if (normalizar(p.nombre) == nombre) return p;
    }
    final digitos = v.replaceAll(RegExp(r'[^0-9]'), '');
    if (digitos.isNotEmpty) {
      // Varios países comparten prefijo (+1): se prefiere el más usado.
      const preferidos = {'1': 'US', '7': 'RU', '44': 'GB', '39': 'IT', '61': 'AU', '47': 'NO', '590': 'GP', '262': 'RE', '599': 'CW', '212': 'MA'};
      final pref = preferidos[digitos];
      if (pref != null) return porCodigo(pref);
      for (final p in lista) {
        if (p.prefijo == digitos) return p;
      }
    }
    for (final p in lista) {
      if (p.codigo == v.toUpperCase() || p.codigo3 == v.toUpperCase()) return p;
    }
    return null;
  }

  static String normalizar(String s) {
    const de = 'áàäâãéèëêíìïîóòöôõúùüûñç', a = 'aaaaaeeeeiiiiooooouuuunc';
    final b = StringBuffer();
    for (final c in s.toLowerCase().runes) {
      final ch = String.fromCharCode(c);
      final i = de.indexOf(ch);
      b.write(i < 0 ? ch : a[i]);
    }
    return b.toString().trim();
  }

  /// Búsqueda por nombre (sin tildes), siglas ("ec", "ecu") o prefijo ("593").
  static List<Pais> buscar(String q, String codigoEquipo) {
    final base = ordenados(codigoEquipo);
    final t = normalizar(q).replaceAll('+', '');
    if (t.isEmpty) return base;
    int puntaje(Pais p) {
      final n = normalizar(p.nombre);
      if (p.codigo.toLowerCase() == t || p.codigo3.toLowerCase() == t) return 0;
      if (n.startsWith(t)) return 1;
      if (p.prefijo == t) return 2;
      if (n.split(' ').any((w) => w.startsWith(t))) return 3;
      if (n.contains(t)) return 4;
      if (p.prefijo.startsWith(t) && RegExp(r'^\d+$').hasMatch(t)) return 5;
      return 99;
    }

    final r = [for (final p in base) (p, puntaje(p))].where((x) => x.$2 < 99).toList()..sort((a, b) => a.$2.compareTo(b.$2));
    return [for (final x in r) x.$1];
  }

  /// La lista con el país del equipo primero.
  static List<Pais> ordenados(String codigoEquipo) {
    final e = porCodigo(codigoEquipo);
    return [e, ...lista.where((p) => p != e)];
  }

  /// "+593 991234567" a partir de lo guardado.
  static String telefono(String prefijoGuardado, String numero) {
    final n = numero.trim();
    if (n.isEmpty) return '';
    final p = desdeValor(prefijoGuardado);
    return p == null ? n : '+${p.prefijo} ${n.startsWith('0') ? n.substring(1) : n}';
  }
}

/// Bandera plana (SVG de `country_flags`); si no hay, las siglas en un pill.
class BanderaPais extends StatelessWidget {
  const BanderaPais({super.key, required this.pais, this.alto = 18, this.radio = 3});
  final Pais pais;
  final double alto;
  final double radio;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: alto * 4 / 3,
      height: alto,
      child: CountryFlag.fromCountryCode(
        pais.codigo,
        theme: ImageTheme(width: alto * 4 / 3, height: alto, shape: RoundedRectangle(radio)),
      ),
    );
  }
}
