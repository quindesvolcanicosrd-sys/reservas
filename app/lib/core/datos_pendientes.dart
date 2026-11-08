import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../sesion/sesion.dart';
import 'tema.dart';

/// Un grupo de datos del perfil que falta completar.
class DatoPendiente {
  const DatoPendiente(this.clave, this.icono, this.titulo, this.porQue);

  /// Qué pantalla de Ajustes lo completa: 'contactos', 'salud', 'privacidad',
  /// 'identidad', 'foto' o 'datos'.
  final String clave;
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
        const DatoPendiente('contactos', Icons.contact_phone_outlined, 'Contacto de emergencia', 'A quién avisar si te pasa algo en un entrenamiento.'),
      if (algunoVacio(['atencionMedica', 'alergias', 'medicamentos']))
        const DatoPendiente(
          'salud',
          Icons.medical_information_outlined,
          'Ficha de salud',
          'Tu seguro, alergias, enfermedades y medicamentos, por si necesitas atención.',
        ),
      if (_vacio(d['fechaNacimiento']))
        const DatoPendiente('privacidad', Icons.cake_outlined, 'Fecha de nacimiento', 'Para tu ficha y, si quieres, para saludarte en tu cumpleaños.'),
      if (d['permisosConfigurados'] != true)
        const DatoPendiente('privacidad', Icons.lock_outline_rounded, 'Opciones de privacidad', 'Qué datos tuyos ve el resto del equipo.'),
      if (algunoVacio(['nombreLegal', 'tipoDocumento', 'numeroDocumento']))
        const DatoPendiente('identidad', Icons.badge_outlined, 'Identidad legal', 'Nombre y documento, necesarios para un seguro o una emergencia.'),
      if (algunoVacio(['callePrincipal', 'sector', 'canton']))
        const DatoPendiente('identidad', Icons.home_outlined, 'Dirección', 'Dónde vives, por si hay que acompañarte o avisar.'),
      // Datos básicos que ve el resto del equipo (Victor, 2026-11-07).
      if (_vacio(d['fotoPerfil']))
        const DatoPendiente('foto', Icons.add_a_photo_outlined, 'Foto de perfil', 'Para que el equipo te reconozca en la lista y en los eventos.'),
      if (_vacio(d['telefono'])) const DatoPendiente('datos', Icons.phone_outlined, 'Teléfono', 'Para que el equipo pueda escribirte o llamarte.'),
      if (_vacio(d['nombreDerby'])) const DatoPendiente('datos', Icons.sports_rounded, 'Nombre derby', 'Cómo te conoce el equipo.'),
      if (_vacio(d['pronombres']))
        const DatoPendiente('datos', Icons.record_voice_over_outlined, 'Pronombres', 'Para que el equipo se dirija a ti como prefieres.'),
      // Solo si el servidor mandó `roles` (versiones viejas no lo mandan).
      if (d.containsKey('roles') && _vacio(d['roles'] is List ? (d['roles'] as List).join(',') : d['roles']))
        const DatoPendiente('datos', Icons.shield_outlined, 'Roles en el equipo', 'Jammer, blocker, coach… para armar mejor los entrenamientos.'),
    ];
  }

  /// Llamar al entrar a la app. Muestra la hoja si corresponde.
  /// [abrir] lleva a la pantalla de Ajustes que completa el dato elegido.
  static Future<void> recordarSiCorresponde(BuildContext context, Sesion sesion, {required void Function(String clave) abrir}) async {
    if (_mostradoEnSesion || !sesion.activa || sesion.datos.isEmpty) return;
    final faltan = calcular(sesion.datos);
    if (faltan.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final hasta = prefs.getInt(_prefPosponer) ?? 0;
    if (DateTime.now().millisecondsSinceEpoch < hasta || !context.mounted) return;
    _mostradoEnSesion = true;
    final r = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _HojaDatos(faltan: faltan),
    );
    if (r != null && r != 'posponer') abrir(r);
    if (r == 'posponer') {
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
            Icon(Icons.person_pin_outlined, size: 44, color: p.marcaTexto),
            const SizedBox(height: 10),
            Text(
              'Completa tu perfil',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              'Para que el equipo te reconozca y, por tu seguridad en los entrenamientos, sepa a quién avisar y qué seguro usas si te pasa algo.',
              textAlign: TextAlign.center,
              style: TextStyle(height: 1.4, color: p.textoSecundario),
            ),
            const SizedBox(height: 16),
            for (final f in faltan)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: p.tarjeta,
                  borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                    onTap: () => Navigator.of(context).pop(f.clave),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
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
                          Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () => Navigator.of(context).pop(faltan.first.clave),
              child: const Text('Completar ahora'),
            ),
            const SizedBox(height: 6),
            TextButton(onPressed: () => Navigator.of(context).pop('posponer'), child: const Text('Recordarme en 30 días')),
          ],
        ),
      ),
    );
  }
}
