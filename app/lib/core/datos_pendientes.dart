import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../sesion/sesion.dart';
import 'api.dart';
import 'tema.dart';

/// Un grupo de datos del perfil que falta completar.
class DatoPendiente {
  const DatoPendiente(this.icono, this.titulo, this.porQue);
  final IconData icono;
  final String titulo;
  final String porQue;
}

/// Recordatorio al abrir la app (pedido 2026-11-07): si faltan datos del
/// perfil importantes para la seguridad en los entrenamientos, se muestran
/// una vez por sesión; "Recordarme en 30 días" lo pospone. Mismos campos que
/// la web (`getDatosCompletos()` en la Edge Function).
class DatosPendientes {
  static const _prefPosponer = 'datos.recordar_despues';
  static const posponerDias = 30;
  static bool _mostradoEnSesion = false;

  static bool _vacio(Object? v) => (v ?? '').toString().trim().isEmpty;

  static List<DatoPendiente> calcular(Map<String, dynamic> d) {
    bool algunoVacio(List<String> campos) => campos.any((c) => _vacio(d[c]));
    return [
      if (algunoVacio(['emerg1Nombre', 'emerg1Telefono']))
        const DatoPendiente(Icons.contact_phone_outlined, 'Contacto de emergencia', 'A quién avisar si te pasa algo en un entrenamiento.'),
      if (algunoVacio(['seguro', 'alergias', 'enfermedad', 'medicamentos', 'atencionMedica']))
        const DatoPendiente(
          Icons.medical_information_outlined,
          'Ficha de salud',
          'Tu seguro, alergias, enfermedades y medicamentos, por si necesitas atención.',
        ),
      if (_vacio(d['fechaNacimiento']))
        const DatoPendiente(Icons.cake_outlined, 'Fecha de nacimiento', 'Para tu ficha y, si quieres, para saludarte en tu cumpleaños.'),
      if (d['permisosConfigurados'] != true)
        const DatoPendiente(Icons.lock_outline_rounded, 'Opciones de privacidad', 'Qué datos tuyos ve el resto del equipo.'),
      if (algunoVacio(['nombreLegal', 'tipoDocumento', 'numeroDocumento']))
        const DatoPendiente(Icons.badge_outlined, 'Identidad legal', 'Nombre y documento, necesarios para un seguro o una emergencia.'),
      if (algunoVacio(['callePrincipal', 'sector', 'canton']))
        const DatoPendiente(Icons.home_outlined, 'Dirección', 'Dónde vives, por si hay que acompañarte o avisar.'),
    ];
  }

  /// Llamar al entrar a la app. Muestra la hoja si corresponde.
  static Future<void> recordarSiCorresponde(BuildContext context, Sesion sesion) async {
    if (_mostradoEnSesion || !sesion.activa) return;
    final faltan = calcular(sesion.datos);
    if (faltan.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final hasta = prefs.getInt(_prefPosponer) ?? 0;
    if (DateTime.now().millisecondsSinceEpoch < hasta || !context.mounted) return;
    _mostradoEnSesion = true;
    final posponer = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _HojaDatos(faltan: faltan),
    );
    if (posponer == true) {
      await prefs.setInt(_prefPosponer, DateTime.now().add(const Duration(days: posponerDias)).millisecondsSinceEpoch);
    }
  }
}

class _HojaDatos extends StatelessWidget {
  const _HojaDatos({required this.faltan});
  final List<DatoPendiente> faltan;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          children: [
            Icon(Icons.health_and_safety_outlined, size: 44, color: p.marcaTexto),
            const SizedBox(height: 10),
            Text(
              'Completa tu ficha',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              'Por tu seguridad en los entrenamientos: si sufres un accidente, el equipo necesita saber a quién avisar y qué seguro de salud usas.',
              textAlign: TextAlign.center,
              style: TextStyle(height: 1.4, color: p.textoSecundario),
            ),
            const SizedBox(height: 16),
            for (final f in faltan)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                  child: Row(
                    children: [
                      Icon(f.icono, color: p.marcaTexto),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              f.titulo,
                              style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                            ),
                            Text(f.porQue, style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () {
                Navigator.of(context).pop(false);
                // Por ahora se completa en la web (perfil en Equipo); en la app llega con Equipo.
                launchUrl(Uri.parse('${ApiConfig.webAppUrl}/'), mode: LaunchMode.externalApplication);
              },
              child: const Text('Completar ahora'),
            ),
            const SizedBox(height: 6),
            TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Recordarme en 30 días')),
          ],
        ),
      ),
    );
  }
}
