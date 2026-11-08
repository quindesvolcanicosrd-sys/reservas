/// Países para prefijos de teléfono, documento y residencia (mismos que la
/// web, `_AJ_PREFIJOS` en js/perfil.js). El del equipo va primero y es el
/// que se propone por defecto (`config_app.pais_equipo`).
class Pais {
  const Pais(this.codigo, this.nombre, this.bandera, this.prefijo, this.minDigitos, this.maxDigitos);
  final String codigo; // ISO 3166-1 alfa-2
  final String nombre;
  final String bandera;
  final String prefijo; // sin "+"
  final int minDigitos; // número nacional, sin el 0 inicial
  final int maxDigitos;

  /// Formato guardado por la web: "🇪🇨 +593 (Ecuador)".
  String get valorPrefijo => '$bandera +$prefijo ($nombre)';
  String get etiqueta => '$bandera  $nombre';
}

class Paises {
  static const lista = [
    Pais('EC', 'Ecuador', '🇪🇨', '593', 10, 10),
    Pais('CO', 'Colombia', '🇨🇴', '57', 10, 10),
    Pais('PE', 'Perú', '🇵🇪', '51', 9, 9),
    Pais('VE', 'Venezuela', '🇻🇪', '58', 10, 10),
    Pais('AR', 'Argentina', '🇦🇷', '54', 10, 11),
    Pais('CL', 'Chile', '🇨🇱', '56', 9, 9),
    Pais('MX', 'México', '🇲🇽', '52', 10, 10),
    Pais('ES', 'España', '🇪🇸', '34', 9, 9),
    Pais('US', 'Estados Unidos', '🇺🇸', '1', 10, 10),
    Pais('UY', 'Uruguay', '🇺🇾', '598', 8, 9),
    Pais('PY', 'Paraguay', '🇵🇾', '595', 9, 9),
    Pais('BO', 'Bolivia', '🇧🇴', '591', 8, 8),
  ];

  static Pais porCodigo(String codigo) => lista.firstWhere((p) => p.codigo == codigo.toUpperCase(), orElse: () => lista.first);

  /// Lee lo guardado ("🇪🇨 +593 (Ecuador)", "+593", "593" o "Ecuador").
  static Pais? desdeValor(String valor) {
    final v = valor.trim();
    if (v.isEmpty) return null;
    for (final p in lista) {
      if (v.contains(p.nombre)) return p;
    }
    final digitos = v.replaceAll(RegExp(r'[^0-9]'), '');
    for (final p in lista) {
      if (digitos == p.prefijo) return p;
    }
    return null;
  }

  /// La lista con el país del equipo primero.
  static List<Pais> ordenados(String codigoEquipo) {
    final e = porCodigo(codigoEquipo);
    return [e, ...lista.where((p) => p != e)];
  }

  /// "+593 99 123 4567" a partir de lo guardado.
  static String telefono(String prefijoGuardado, String numero) {
    final n = numero.trim();
    if (n.isEmpty) return '';
    final p = desdeValor(prefijoGuardado);
    return p == null ? n : '+${p.prefijo} ${n.startsWith('0') ? n.substring(1) : n}';
  }
}
