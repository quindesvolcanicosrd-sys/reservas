import '../core/fechas.dart';
import 'equipo_modelos.dart';

/// Un resultado del buscador: la persona y por qué aparece.
class ResultadoBusqueda {
  ResultadoBusqueda(this.persona, this.motivos, this.orden);
  final Integrante persona;
  final List<String> motivos;

  /// Para ordenar (p. ej. días hasta el cumpleaños); menor = primero.
  final int orden;
}

/// Buscador "inteligente" de Equipo (Victor, 2026-11-07): entiende roles,
/// meses, cumpleaños, aniversarios, categoría, estado, número, favoritos y
/// admins, además de nombre, usuario y email (tolera tildes, mayúsculas,
/// plurales y un error de tipeo). Las palabras se combinan con "y":
/// "jammer quindes", "blocker diciembre". Nunca busca datos sensibles.
class BuscadorEquipo {
  static const _vacias = {'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'que', 'con', 'a', 'mes'};
  static const _meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  static const _roles = {
    'jammer': 'Jammer',
    'blocker': 'Blocker',
    'bloqueador': 'Blocker',
    'coach': 'Coach',
    'entrenador': 'Coach',
    'bench': 'Bench',
    'so': 'SO',
    'nso': 'NSO',
  };

  static String normalizar(String s) {
    const de = 'áàäâéèëêíìïîóòöôúùüûñ';
    const a = 'aaaaeeeeiiiioooouuuun';
    final b = StringBuffer();
    for (final ch in s.toLowerCase().split('')) {
      final i = de.indexOf(ch);
      b.write(i >= 0 ? a[i] : ch);
    }
    return b.toString().trim();
  }

  /// Quita plurales simples ("jammers", "coaches", "blockers").
  static String _singular(String t) {
    if (t.length > 4 && t.endsWith('es') && !t.endsWith('ses')) return t.substring(0, t.length - 2);
    if (t.length > 3 && t.endsWith('s')) return t.substring(0, t.length - 1);
    return t;
  }

  static bool _casi(String a, String b) {
    if (a == b) return true;
    if ((a.length - b.length).abs() > 1 || a.length < 4) return false;
    // Distancia de edición <= 1.
    var i = 0, j = 0, dif = 0;
    while (i < a.length && j < b.length) {
      if (a[i] == b[j]) {
        i++;
        j++;
        continue;
      }
      if (++dif > 1) return false;
      if (a.length > b.length) {
        i++;
      } else if (b.length > a.length) {
        j++;
      } else {
        i++;
        j++;
      }
    }
    return dif + (a.length - i) + (b.length - j) <= 1;
  }

  /// [favoritos] son usernames; [esAdmin] habilita "admins".
  static List<ResultadoBusqueda> buscar(String consulta, List<Integrante> personas, {required Set<String> favoritos, required bool esAdmin, DateTime? hoy}) {
    final h = hoy ?? Fechas.hoy();
    final tokens = normalizar(consulta).split(RegExp(r'\s+')).where((t) => t.isNotEmpty && !_vacias.contains(t)).toList();
    if (tokens.isEmpty) return const [];
    final res = <ResultadoBusqueda>[];
    for (final p in personas) {
      final motivos = <String>[];
      var orden = 1 << 20;
      var ok = true;
      for (final t in tokens) {
        final r = _token(t, p, h, favoritos, esAdmin);
        if (r == null) {
          ok = false;
          break;
        }
        if (r.$1 != null && !motivos.contains(r.$1)) motivos.add(r.$1!);
        if (r.$2 < orden) orden = r.$2;
      }
      if (ok) res.add(ResultadoBusqueda(p, motivos, orden));
    }
    res.sort((a, b) => a.orden != b.orden ? a.orden.compareTo(b.orden) : normalizar(a.persona.nombreMostrar).compareTo(normalizar(b.persona.nombreMostrar)));
    return res;
  }

  /// null = no coincide; si coincide: (motivo opcional, orden).
  static (String?, int)? _token(String t, Integrante p, DateTime hoy, Set<String> favs, bool esAdmin) {
    final s = _singular(t);
    const sinOrden = 1 << 20;

    // Rol.
    final rol = _roles[s] ?? _roles[t];
    if (rol != null) return p.roles.contains(rol) ? (p.roles.join(' · '), sinOrden) : null;
    if (s == 'rol') return p.roles.isEmpty ? null : (p.roles.join(' · '), sinOrden);

    // Mes: cumpleaños (público) o aniversario en ese mes.
    final mes = _meses.indexOf(t);
    if (mes >= 0) {
      final c = p.proximoCumple(hoy);
      final a = p.proximoAniversario(hoy);
      if (c != null && c.month == mes + 1) return ('Cumple el ${c.day} de ${_meses[mes]}', c.day);
      if (a != null && a.month == mes + 1) return ('${p.aniosEnEquipo(a)} años en el equipo el ${a.day} de ${_meses[mes]}', 40 + a.day);
      return null;
    }

    // Cumpleaños y aniversarios, del más cercano al más lejano.
    if (s.startsWith('cumple')) {
      final c = p.proximoCumple(hoy);
      if (c == null) return null;
      final d = Fechas.diasEntre(hoy, c);
      return (d == 0 ? '¡Cumple hoy!' : 'Cumple el ${c.day} de ${_meses[c.month - 1]} (en $d ${d == 1 ? 'día' : 'días'})', d);
    }
    if (s.startsWith('aniversario')) {
      final a = p.proximoAniversario(hoy);
      if (a == null) return null;
      return ('${p.aniosEnEquipo(a)} años en el equipo el ${a.day} de ${_meses[a.month - 1]}', Fechas.diasEntre(hoy, a));
    }

    // Categoría y estado.
    if (s == 'quinde' || s == 'quind') return p.categoria == 'Quindes' && !p.inactivx ? ('Quindes', sinOrden) : null;
    if (s.startsWith('mirlx') || s.startsWith('mirlo')) return p.categoria != 'Quindes' && !p.inactivx ? ('Mirlxs', sinOrden) : null;
    if (s == 'viaje' || s == 'viajando') return p.deViaje ? (datosRelevantes(p, hoy).first.texto, sinOrden) : null;
    if (s.startsWith('lesion')) return p.lesionadx ? ('Lesionadx', sinOrden) : null;
    if (s.startsWith('inactiv')) return p.inactivx ? ('Inactivx', sinOrden) : null;
    if (s == 'nuevo' || s == 'nueva' || s == 'nuevx') {
      final f = p.fechaIngreso;
      return f != null && !f.isAfter(hoy) && Fechas.diasEntre(f, hoy) < 60 ? ('Se unió el ${f.day} de ${_meses[f.month - 1]}', sinOrden) : null;
    }
    if (s.startsWith('favorit')) return favs.contains(p.username) ? ('Favorito', sinOrden) : null;
    if (s == 'admin' && esAdmin) return p.esAdminMiembro ? ('Admin', sinOrden) : null;

    // Número: "#12" o "12".
    final n = t.startsWith('#') ? t.substring(1) : t;
    if (RegExp(r'^\d+$').hasMatch(n)) return p.numero == n ? ('Número $n', sinOrden) : null;

    // Nombre, usuario o email (sin tildes; tolera un error en palabras de 4+ letras).
    final nombre = normalizar(p.nombreMostrar);
    final usuario = normalizar(p.username);
    if (nombre.contains(t) || usuario.contains(t)) return (null, sinOrden);
    if (t.contains('@') && normalizar(p.email).contains(t.replaceAll('@', ''))) return (p.email, sinOrden);
    if (t.length >= 4) {
      for (final palabra in [...nombre.split(RegExp(r'\s+')), usuario]) {
        if (_casi(t, palabra) || (palabra.length > t.length && _casi(t, palabra.substring(0, t.length)))) return (null, sinOrden + 1);
      }
    }
    return null;
  }
}
