import 'package:flutter/material.dart';

import '../core/fechas.dart';
import '../sesion/sesion.dart';
import 'ajustes_screen.dart';
import 'campos.dart';
import 'componentes.dart';

// ─── Privacidad ──────────────────────────────────────────────────────────

class PrivacidadScreen extends StatelessWidget {
  const PrivacidadScreen({super.key, required this.sesion});
  final Sesion sesion;

  static const edadMinima = 16;

  @override
  Widget build(BuildContext context) {
    final s = sesion;
    return PantallaAjustes(
      sesion: s,
      titulo: 'Privacidad',
      hijos: (context) {
        final fecha = valorDe(s, 'fechaNacimiento');
        final cumple = valorDe(s, 'fechaPublica') == 'Sí';
        final edad = valorDe(s, 'edadPublica') == 'Sí';
        Future<void> guardar({String? f, bool? c, bool? e}) async {
          final nueva = f ?? fecha;
          if (nueva.isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Primero elige tu fecha de nacimiento.')));
            return;
          }
          await guardarConAviso(context, () => s.guardarPrivacidad(fechaNacimiento: nueva, fechaPublica: c ?? cumple, edadPublica: e ?? edad));
        }

        return [
          const AvisoPrivado(
            texto:
                'Tu cumpleaños y tu edad los decides tú. Los datos sensibles, como salud, dirección e identidad, '
                'solo los ven administradorxs de tu equipo, por motivos de emergencia, logística de viajes u operativos del equipo.',
          ),
          GrupoAjustes(
            filas: [
              FilaAjuste(
                icono: Icons.cake_outlined,
                titulo: 'Fecha de nacimiento',
                valor: fechaLarga(fecha),
                alTocar: () async {
                  final hoy = Fechas.hoy();
                  final limite = DateTime(hoy.year - edadMinima, hoy.month, hoy.day);
                  final f = await showDatePicker(
                    context: context,
                    firstDate: DateTime(1940),
                    lastDate: limite,
                    initialDate: Fechas.desdeIso(fecha) ?? DateTime(hoy.year - 25),
                    helpText: 'Tu fecha de nacimiento',
                    initialEntryMode: DatePickerEntryMode.calendarOnly,
                  );
                  if (f != null && context.mounted) await guardar(f: Fechas.iso(f));
                },
              ),
            ],
            pie: 'Debes tener al menos $edadMinima años para usar la app.',
          ),
          GrupoAjustes(
            filas: [
              FilaAjuste(
                icono: Icons.celebration_outlined,
                titulo: 'Mi cumpleaños',
                valor: 'Aparece en la línea de tiempo y en Equipo',
                derecha: Switch(
                  value: cumple,
                  onChanged: (v) => guardar(c: v),
                ),
              ),
              FilaAjuste(
                icono: Icons.hourglass_empty_rounded,
                titulo: 'Mi edad',
                valor: 'Se muestra junto a tu cumpleaños',
                derecha: Switch(
                  value: edad,
                  onChanged: (v) => guardar(e: v),
                ),
              ),
            ],
          ),
        ];
      },
    );
  }
}
