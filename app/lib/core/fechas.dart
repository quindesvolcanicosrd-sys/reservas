/// Fechas en español neutro, hora de pared de Ecuador (UTC-5 fijo, sin
/// horario de verano) — mismo criterio que el backend (`_hoyEcuadorISO()`).
class Fechas {
  static const _dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  static const _diasCortos = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
  static const _meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  /// "Ahora" en Ecuador como fecha/hora de pared.
  static DateTime ahoraEcuador() {
    final u = DateTime.now().toUtc().subtract(const Duration(hours: 5));
    return DateTime(u.year, u.month, u.day, u.hour, u.minute);
  }

  static DateTime hoy() {
    final a = ahoraEcuador();
    return DateTime(a.year, a.month, a.day);
  }

  static DateTime soloDia(DateTime d) => DateTime(d.year, d.month, d.day);
  static int diasEntre(DateTime a, DateTime b) =>
      DateTime.utc(b.year, b.month, b.day).difference(DateTime.utc(a.year, a.month, a.day)).inDays;
  static DateTime lunesDe(DateTime d) => soloDia(d).subtract(Duration(days: d.weekday - 1));

  static String diaCorto(DateTime d) => _diasCortos[d.weekday - 1];
  static String dia(DateTime d) => _dias[d.weekday - 1];
  static String mes(DateTime d) => _meses[d.month - 1];
  static String mesNombre(DateTime d) => _mayuscula(_meses[d.month - 1]);
  static String mesAnio(DateTime d) => '${_mayuscula(_meses[d.month - 1])} ${d.year}';

  /// "Mañana · sábado 7 de noviembre", "Hoy · viernes 6 de noviembre",
  /// "Lunes 9 de noviembre" (+ año si no es el actual).
  static String encabezado(DateTime d) {
    final dif = diasEntre(hoy(), d);
    final anio = d.year != hoy().year ? ' de ${d.year}' : '';
    final base = '${dia(d)} ${d.day} de ${mes(d)}$anio';
    if (dif == 0) return 'Hoy · $base';
    if (dif == 1) return 'Mañana · $base';
    if (dif == -1) return 'Ayer · $base';
    return _mayuscula(base);
  }

  /// "9 – 15 de noviembre" / "30 de noviembre – 6 de diciembre".
  static String rangoSemana(DateTime lunes) {
    final domingo = lunes.add(const Duration(days: 6));
    if (lunes.month == domingo.month) return '${lunes.day} – ${domingo.day} de ${mes(domingo)}';
    return '${lunes.day} de ${mes(lunes)} – ${domingo.day} de ${mes(domingo)}';
  }

  static String hora(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  static String iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String _mayuscula(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}
