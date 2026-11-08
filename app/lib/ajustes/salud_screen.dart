import 'package:flutter/material.dart';

import '../core/paises.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'campos.dart';
import 'componentes.dart';

/// Salud y emergencia (antes "Contactos de emergencia" + "Ficha de salud",
/// Victor 2026-11-07). Arriba, tu ficha de emergencia de un vistazo, como la
/// ve admins si te pasa algo; debajo, los contactos como tarjetas y los datos
/// médicos. Todo se edita tocándolo y se guarda al momento.
class SaludEmergenciaScreen extends StatelessWidget {
  const SaludEmergenciaScreen({super.key, required this.sesion});
  final Sesion sesion;

  static const _relaciones = ['Madre', 'Padre', 'Pareja', 'Hermanx', 'Amistad', 'Familiar'];
  static const _atencion = ['MSP (Ministerio de Salud Pública)', 'IESS', 'Seguro Privado'];
  static const _seguros = ['Saludsa', 'Ecuasanitas', 'Humana', 'BMI del Ecuador', 'Confiamed', 'BUPA Ecuador', 'Pan American Life', 'CruzBlanca'];
  static const _enfermedades = [
    'Diabetes',
    'Hipertensión arterial',
    'Cardiopatía',
    'Epilepsia',
    'Asma',
    'Trastornos de coagulación',
    'Problemas osteomusculares crónicos',
  ];
  static const _antecedentes = ['Cirugías previas', 'Hospitalización en el último año', 'Lesiones deportivas previas'];
  static const _dietas = ['Vegetariano', 'Vegano', 'Pescetariano'];

  @override
  Widget build(BuildContext context) {
    final s = sesion;
    return PantallaAjustes(
      sesion: s,
      titulo: 'Salud y emergencia',
      hijos: (context) {
        final privado = valorDe(s, 'atencionMedica') == 'Seguro Privado' || valorDe(s, 'seguro').isNotEmpty;
        return [
          const AvisoPrivado(),
          _FichaRapida(sesion: s, alEditar: (clave) => _editar(context, clave)),
          const SizedBox(height: 22),
          _titulo(context, 'A quién llamar'),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _TarjetaContacto(sesion: s, n: '1', alTocar: () => _editarContacto(context, '1')),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _TarjetaContacto(sesion: s, n: '2', alTocar: () => _editarContacto(context, '2')),
              ),
            ],
          ),
          const SizedBox(height: 22),
          _titulo(context, 'Atención médica'),
          GrupoAjustes(
            filas: [
              FilaAjuste(
                icono: Icons.local_hospital_outlined,
                titulo: 'Dónde te atiendes',
                valor: valorDe(s, 'atencionMedica'),
                alTocar: () => _editar(context, 'atencion'),
              ),
              if (privado) ...[
                FilaAjuste(
                  icono: Icons.health_and_safety_outlined,
                  titulo: 'Seguro privado',
                  valor: valorDe(s, 'seguro'),
                  alTocar: () => elegirCampo(context, s, 'seguro', 'Seguro privado', _seguros, otro: true),
                ),
                FilaAjuste(
                  icono: Icons.support_agent_outlined,
                  titulo: 'Contacto del seguro',
                  valor: valorDe(s, 'seguroContacto'),
                  alTocar: () => editarCampo(context, s, 'seguroContacto', 'Contacto del seguro', ayuda: 'Teléfono o correo para emergencias.'),
                ),
              ],
            ],
          ),
          _titulo(context, 'Tu salud'),
          GrupoAjustes(
            filas: [
              FilaAjuste(icono: Icons.coronavirus_outlined, titulo: 'Alergias', valor: _alergias(s), alTocar: () => _editar(context, 'alergias')),
              FilaAjuste(icono: Icons.medication_outlined, titulo: 'Medicamentos', valor: _medicamentos(s), alTocar: () => _editar(context, 'medicamentos')),
              FilaAjuste(
                icono: Icons.monitor_heart_outlined,
                titulo: 'Enfermedades',
                valor: vacioComo(s, 'enfermedad', 'Ninguna'),
                alTocar: () => _editar(context, 'enfermedad'),
              ),
              FilaAjuste(
                icono: Icons.history_rounded,
                titulo: 'Antecedentes',
                valor: vacioComo(s, 'antecedentes', 'Ninguno'),
                alTocar: () => elegirCampo(context, s, 'antecedentes', 'Antecedentes médicos', _antecedentes, multi: true, otro: true),
              ),
              FilaAjuste(
                icono: Icons.restaurant_outlined,
                titulo: 'Dieta',
                valor: vacioComo(s, 'dieta', 'Sin restricciones'),
                alTocar: () => elegirCampo(context, s, 'dieta', 'Dieta', _dietas, otro: true),
              ),
            ],
          ),
        ];
      },
    );
  }

  static String _alergias(Sesion s) {
    final a = valorDe(s, 'alergias');
    return a == 'No' || a.isEmpty ? a : [a, valorDe(s, 'alergiasDesc')].where((x) => x.isNotEmpty).join(' · ');
  }

  static String _medicamentos(Sesion s) => valorDe(s, 'medicamentos') == 'Sí' ? 'Sí · ${valorDe(s, 'medicamentosDesc')}' : valorDe(s, 'medicamentos');

  Widget _titulo(BuildContext context, String t) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
    child: Text(
      t,
      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: context.pivot.texto),
    ),
  );

  Future<void> _editar(BuildContext context, String clave) async {
    final s = sesion;
    switch (clave) {
      case 'atencion':
        await elegirCampo(context, s, 'atencionMedica', 'Dónde te atiendes', _atencion);
      case 'enfermedad':
        await elegirCampo(context, s, 'enfermedad', 'Enfermedades', _enfermedades, multi: true, otro: true, ayuda: 'Déjalo vacío si no tienes ninguna.');
      case 'alergias':
        final v = await elegirOpciones(context, titulo: 'Alergias', opciones: const ['Sí', 'No', 'Tal vez'], valor: valorDe(s, 'alergias'));
        if (v == null || !context.mounted) return;
        var desc = '';
        if (v != 'No') {
          final d = await editarTexto(
            context,
            titulo: '¿A qué?',
            valor: valorDe(s, 'alergiasDesc'),
            ayuda: 'Ej: penicilina, mariscos.',
            maxLength: 200,
            lineas: 3,
          );
          if (d == null || !context.mounted) return;
          desc = d;
        }
        await guardarCampos(context, s, {'alergias': v, 'alergiasDesc': desc});
      case 'medicamentos':
        final v = await elegirOpciones(context, titulo: '¿Tomas medicamentos?', opciones: const ['Sí', 'No'], valor: valorDe(s, 'medicamentos'));
        if (v == null || !context.mounted) return;
        var desc = '';
        if (v == 'Sí') {
          final d = await editarTexto(
            context,
            titulo: '¿Cuáles?',
            valor: valorDe(s, 'medicamentosDesc'),
            ayuda: 'Ej: loratadina 10 mg cada 12 horas.',
            maxLength: 200,
            lineas: 3,
          );
          if (d == null || !context.mounted) return;
          desc = d;
        }
        await guardarCampos(context, s, {'medicamentos': v, 'medicamentosDesc': desc});
    }
  }

  /// Nombre → relación → teléfono, en hojas seguidas.
  Future<void> _editarContacto(BuildContext context, String n) async {
    final s = sesion;
    final accion = valorDe(s, 'emerg${n}Nombre').isEmpty
        ? 'nombre'
        : await showModalBottomSheet<String>(
            context: context,
            showDragHandle: true,
            builder: (c) => SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ListTile(leading: const Icon(Icons.person_outline_rounded), title: const Text('Nombre'), onTap: () => Navigator.of(c).pop('nombre')),
                  ListTile(leading: const Icon(Icons.diversity_3_outlined), title: const Text('Relación'), onTap: () => Navigator.of(c).pop('relacion')),
                  ListTile(leading: const Icon(Icons.phone_outlined), title: const Text('Teléfono'), onTap: () => Navigator.of(c).pop('telefono')),
                  if (n == '2')
                    ListTile(
                      leading: Icon(Icons.delete_outline_rounded, color: c.pivot.marcaTexto),
                      title: Text('Quitar este contacto', style: TextStyle(color: c.pivot.marcaTexto)),
                      onTap: () => Navigator.of(c).pop('quitar'),
                    ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          );
    if (accion == null || !context.mounted) return;
    switch (accion) {
      case 'quitar':
        await guardarCampos(context, s, {'emerg2Nombre': '', 'emerg2Relacion': '', 'emerg2Prefijo': '', 'emerg2Telefono': ''});
      case 'relacion':
        await elegirCampo(context, s, 'emerg${n}Relacion', 'Relación', _relaciones, otro: true);
      case 'telefono':
        await editarTelefono(context, s, 'emerg${n}Prefijo', 'emerg${n}Telefono', 'Teléfono del contacto');
      case 'nombre':
        final nuevo = valorDe(s, 'emerg${n}Nombre').isEmpty;
        await editarCampo(context, s, 'emerg${n}Nombre', 'Nombre del contacto', maxLength: 60, obligatorio: n == '1');
        // Contacto nuevo: sigue con relación y teléfono.
        if (nuevo && context.mounted && valorDe(s, 'emerg${n}Nombre').isNotEmpty) {
          await elegirCampo(context, s, 'emerg${n}Relacion', 'Relación', _relaciones, otro: true);
          if (context.mounted) await editarTelefono(context, s, 'emerg${n}Prefijo', 'emerg${n}Telefono', 'Teléfono del contacto');
        }
    }
  }
}

/// Resumen tipo "ficha médica" en la tarjeta roja de la sección.
class _FichaRapida extends StatelessWidget {
  const _FichaRapida({required this.sesion, required this.alEditar});
  final Sesion sesion;
  final void Function(String clave) alEditar;

  @override
  Widget build(BuildContext context) {
    final s = sesion;
    const sobre = PivotPaleta.sobreSeccion;
    String corto(String v, String vacio) => v.isEmpty ? vacio : v;
    final atencion = valorDe(s, 'atencionMedica');
    final seguro = valorDe(s, 'seguro');
    final datos = [
      ('alergias', Icons.coronavirus_outlined, 'Alergias', corto(SaludEmergenciaScreen._alergias(s), 'Sin completar')),
      ('medicamentos', Icons.medication_outlined, 'Medicamentos', corto(SaludEmergenciaScreen._medicamentos(s), 'Sin completar')),
      ('enfermedad', Icons.monitor_heart_outlined, 'Enfermedades', corto(vacioComo(s, 'enfermedad', 'Ninguna'), 'Sin completar')),
      ('atencion', Icons.local_hospital_outlined, 'Atención', corto(seguro.isNotEmpty ? seguro : atencion.split(' (').first, 'Sin completar')),
    ];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: PivotPaleta.seccionSalud, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.emergency_rounded, color: sobre, size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Tu ficha de emergencia',
                  style: TextStyle(color: sobre, fontSize: 16, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text('Lo que admins ven si te pasa algo en un entrenamiento.', style: TextStyle(color: sobre.withValues(alpha: 0.85), fontSize: 12.5)),
          const SizedBox(height: 14),
          for (var i = 0; i < datos.length; i += 2)
            Padding(
              padding: EdgeInsets.only(bottom: i + 2 < datos.length ? 10 : 0),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final (j, d) in datos.skip(i).take(2).indexed) ...[
                      if (j > 0) const SizedBox(width: 10),
                      Expanded(
                        child: Material(
                          color: sobre.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(PivotRadios.tarjeta - 4),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(PivotRadios.tarjeta - 4),
                            onTap: () => alEditar(d.$1),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Icon(d.$2, color: sobre, size: 16),
                                      const SizedBox(width: 6),
                                      Text(
                                        d.$3,
                                        style: TextStyle(color: sobre.withValues(alpha: 0.85), fontSize: 12, fontWeight: FontWeight.w700),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    d.$4,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: sobre, fontSize: 14.5, fontWeight: FontWeight.w700),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Contacto de emergencia como tarjeta; vacía, invita a agregarlo.
class _TarjetaContacto extends StatelessWidget {
  const _TarjetaContacto({required this.sesion, required this.n, required this.alTocar});
  final Sesion sesion;
  final String n;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final nombre = valorDe(sesion, 'emerg${n}Nombre');
    final relacion = valorDe(sesion, 'emerg${n}Relacion');
    final tel = Paises.telefono(valorDe(sesion, 'emerg${n}Prefijo'), valorDe(sesion, 'emerg${n}Telefono'));
    final vacio = nombre.isEmpty;
    return Material(
      color: vacio ? p.fondo : p.tarjeta,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        side: vacio ? BorderSide(color: p.bordeSuave, width: 1.5) : BorderSide.none,
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        onTap: alTocar,
        child: SizedBox(
          height: 132,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: vacio
                ? Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.person_add_alt_1_outlined, color: p.textoSecundario),
                      const SizedBox(height: 8),
                      Text(
                        n == '1' ? 'Agrega tu contacto principal' : 'Agrega un segundo contacto',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: p.textoSecundario),
                      ),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: PivotPaleta.seccionSalud,
                        child: Text(
                          nombre.characters.first.toUpperCase(),
                          style: const TextStyle(color: PivotPaleta.sobreSeccion, fontWeight: FontWeight.w800),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        nombre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.texto),
                      ),
                      Text(
                        [relacion, tel].where((x) => x.isNotEmpty).join(' · ').ifEmpty('Falta el teléfono'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: p.textoSecundario),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

extension on String {
  String ifEmpty(String otro) => isEmpty ? otro : this;
}
