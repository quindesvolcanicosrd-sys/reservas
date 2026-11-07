import 'package:flutter/services.dart';

/// Números de emergencia por país (botón de emergencia, 2026-11-07). El país
/// es el del equipo (`config_app.pais_equipo`, se elegirá al crear el equipo;
/// por ahora 'EC'). Fuente: Wikipedia "List of emergency telephone numbers"
/// (revisar con fuentes oficiales al sumar países). 112 funciona como
/// respaldo en la mayoría de celulares.
class Emergencias {
  static const _numeros = {
    'EC': ('Ecuador', '911'),
    'CO': ('Colombia', '123'),
    'PE': ('Perú', '106'),
    'CL': ('Chile', '131'),
    'AR': ('Argentina', '107'),
    'MX': ('México', '911'),
    'US': ('Estados Unidos', '911'),
    'CA': ('Canadá', '911'),
    'ES': ('España', '112'),
    'BO': ('Bolivia', '118'),
    'UY': ('Uruguay', '911'),
    'PY': ('Paraguay', '911'),
    'BR': ('Brasil', '192'),
  };

  /// (país, número de salud pública / emergencias).
  static (String, String) de(String? pais) => _numeros[(pais ?? 'EC').toUpperCase()] ?? ('', '112');

  static const _canal = MethodChannel('pivot/seguridad');

  /// Bloquea capturas de pantalla mientras se ve información sensible.
  static Future<void> bloquearCapturas(bool si) async {
    try {
      await _canal.invokeMethod(si ? 'bloquearCapturas' : 'permitirCapturas');
    } catch (_) {
      // Sin el canal (pruebas, otra plataforma): se sigue igual.
    }
  }
}
