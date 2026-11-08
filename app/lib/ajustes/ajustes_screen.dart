import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/datos_pendientes.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../equipo/equipo_repo.dart';
import '../equipo/persona_screen.dart';
import '../eventos/eventos_repo.dart';
import '../eventos/widgets_comunes.dart';
import '../reservas/gestionar_reserva.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';
import 'cuenta.dart';
import 'excepcion_screen.dart';
import 'identidad_screen.dart';
import 'privacidad_screen.dart';
import 'salud_screen.dart';
import 'notificaciones_screen.dart';
import 'recorte_foto.dart';

/// Pestaña Ajustes (rediseño de Victor, 2026-11-07): como en la web, solo
/// ajustes de la app, de seguridad y de emergencia; lo que ve el resto del
/// equipo se edita en tu ficha de Equipo. Sin títulos de grupo: los bloques
/// bastan. Cada sección con su color, y un punto rojo en lo que falta.
class AjustesScreen extends StatelessWidget {
  const AjustesScreen({super.key, required this.sesion, required this.eventos});
  final Sesion sesion;
  final EventosRepo eventos;

  static const _datosPerfil = ['Foto de perfil', 'Teléfono', 'Nombre derby', 'Pronombres', 'Roles en el equipo'];

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: Text('Ajustes', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
      ),
      body: ListenableBuilder(
        listenable: sesion,
        builder: (context, _) {
          final d = sesion.datos;
          final conFicha = d.isNotEmpty; // admins "puros" no tienen fila en Equipo
          final faltan = DatosPendientes.calcular(d).map((x) => x.titulo).toSet();
          bool falta(String t) => conFicha && faltan.contains(t);
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
            children: [
              _Tarjeta(sesion: sesion, pendiente: _datosPerfil.any(falta)),
              const SizedBox(height: 18),
              GrupoAjustes(
                filas: [
                  FilaAjuste(
                    icono: Icons.confirmation_number_rounded,
                    color: PivotPaleta.seccionReservas,
                    titulo: 'Mis reservas',
                    valor: 'Clases y mensualidades, cancelar o reagendar',
                    alTocar: () => SubAjustes.abrir(context, MisReservasScreen(repo: eventos)),
                  ),
                  if (conFicha)
                    FilaAjuste(
                      icono: Icons.volunteer_activism_rounded,
                      color: PivotPaleta.seccionCuota,
                      titulo: 'Excepción de cuota',
                      valor: 'Por ausencias justificadas o dificultad económica',
                      alTocar: () => SubAjustes.abrir(context, ExcepcionScreen(sesion: sesion)),
                    ),
                ],
              ),
              if (conFicha)
                GrupoAjustes(
                  filas: [
                    FilaAjuste(
                      icono: Icons.emergency_rounded,
                      color: PivotPaleta.seccionSalud,
                      titulo: 'Salud y emergencia',
                      valor: 'Contactos, seguro y ficha médica',
                      pendiente: falta('Contacto de emergencia') || falta('Ficha de salud'),
                      alTocar: () => SubAjustes.abrir(context, SaludEmergenciaScreen(sesion: sesion)),
                    ),
                    FilaAjuste(
                      icono: Icons.badge_rounded,
                      color: PivotPaleta.seccionIdentidad,
                      titulo: 'Identidad y dirección',
                      valor: 'Documento y dónde vives',
                      pendiente: falta('Identidad legal') || falta('Dirección'),
                      alTocar: () => SubAjustes.abrir(context, IdentidadScreen(sesion: sesion)),
                    ),
                  ],
                ),
              GrupoAjustes(
                filas: [
                  if (conFicha)
                    FilaAjuste(
                      icono: Icons.lock_rounded,
                      color: PivotPaleta.seccionPrivacidad,
                      titulo: 'Privacidad',
                      valor: 'Qué ve el resto del equipo',
                      pendiente: falta('Opciones de privacidad') || falta('Fecha de nacimiento'),
                      alTocar: () => SubAjustes.abrir(context, PrivacidadScreen(sesion: sesion)),
                    ),
                  if (conFicha)
                    FilaAjuste(
                      icono: Icons.notifications_rounded,
                      color: PivotPaleta.seccionNotificaciones,
                      titulo: 'Notificaciones',
                      valor: 'Qué avisos recibes',
                      alTocar: () => SubAjustes.abrir(context, NotificacionesScreen(sesion: sesion)),
                    ),
                  FilaAjuste(
                    icono: Icons.manage_accounts_rounded,
                    color: PivotPaleta.seccionCuenta,
                    titulo: 'Cuenta y acceso',
                    valor: 'Usuario, contraseña, cerrar sesión',
                    pendiente: conFicha && d['tienePassword'] == false,
                    alTocar: () => SubAjustes.abrir(context, CuentaScreen(sesion: sesion)),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Tu tarjeta: avatar, nombre y @usuario; abre tu ficha de Equipo.
class _Tarjeta extends StatelessWidget {
  const _Tarjeta({required this.sesion, this.pendiente = false});
  final Sesion sesion;

  /// Faltan datos que ve el equipo (foto, teléfono…): se completan en tu ficha.
  final bool pendiente;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final numero = '${sesion.datos['numeroDerby'] ?? ''}'.trim();
    return Material(
      color: p.tarjeta,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: sesion.datos.isEmpty ? null : () => PersonaScreen.abrir(context, EquipoRepo.de(sesion), sesion.nombre ?? ''),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // Tocar la foto la cambia; el resto de la tarjeta abre tu ficha.
              GestureDetector(
                onTap: sesion.datos.isEmpty ? null : () => cambiarFoto(context, sesion),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    HeroAvatar(
                      tag: 'avatar-${sesion.nombre}',
                      child: AvatarPersona(nombre: sesion.nombreMostrar, foto: sesion.fotoPerfil, tamano: 56),
                    ),
                    if (sesion.datos.isNotEmpty)
                      Positioned(
                        right: -4,
                        bottom: -4,
                        child: Container(
                          padding: const EdgeInsets.all(5),
                          decoration: BoxDecoration(
                            color: p.marca,
                            shape: BoxShape.circle,
                            border: Border.all(color: p.tarjeta, width: 2),
                          ),
                          child: Icon(Icons.photo_camera_rounded, size: 13, color: p.sobreMarca),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      numero.isEmpty ? sesion.nombreMostrar : '${sesion.nombreMostrar}  #$numero',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: p.texto),
                    ),
                    const SizedBox(height: 2),
                    Text('@${sesion.nombre ?? ''}', style: TextStyle(fontSize: 13.5, color: p.textoSecundario)),
                    if (sesion.datos.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        pendiente ? 'Completa tu perfil' : 'Ver mi perfil',
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.marcaTexto),
                      ),
                    ],
                  ],
                ),
              ),
              if (pendiente)
                Container(
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.only(right: 6),
                  decoration: BoxDecoration(color: p.marca, shape: BoxShape.circle),
                ),
              if (sesion.datos.isNotEmpty) Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Patines del club (38) · Protecciones propias".
String textoEquipamiento(Map<String, dynamic> d) {
  final pat = '${d['necesitaPatines'] ?? ''}' == 'Sí';
  final talla = '${d['talla'] ?? ''}'.trim();
  final pro = '${d['necesitaProtecciones'] ?? ''}'.trim();
  final patTxt = pat ? 'Patines del club${talla.isEmpty ? '' : ' ($talla)'}' : 'Patines propios';
  final proTxt = pro.isEmpty || pro == 'No' ? 'protecciones propias' : (pro == 'Sí' ? 'protecciones del club' : 'del club: ${pro.toLowerCase()}');
  return '$patTxt · $proTxt';
}

/// Fecha "aaaa-mm-dd" → "14 de diciembre de 1995".
String fechaLarga(Object? iso) {
  final f = Fechas.desdeIso(iso);
  return f == null ? '' : '${f.day} de ${Fechas.mes(f)} de ${f.year}';
}

/// Galería, cámara o quitar. La imagen se reduce antes de subirla.
Future<void> cambiarFoto(BuildContext context, Sesion sesion) async {
  final tiene = sesion.fotoPerfil.isNotEmpty;
  final opcion = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Elegir de la galería'), onTap: () => Navigator.of(c).pop('galeria')),
          ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Tomar una foto'), onTap: () => Navigator.of(c).pop('camara')),
          if (tiene)
            ListTile(
              leading: Icon(Icons.delete_outline_rounded, color: c.pivot.marcaTexto),
              title: Text('Quitar foto', style: TextStyle(color: c.pivot.marcaTexto)),
              onTap: () => Navigator.of(c).pop('quitar'),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (opcion == null || !context.mounted) return;
  if (opcion == 'quitar') {
    await guardarConAviso(context, () => sesion.subirFoto(null), ok: 'Foto quitada');
  } else {
    final XFile? img;
    try {
      img = await ImagePicker().pickImage(
        source: opcion == 'camara' ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 90,
        preferredCameraDevice: CameraDevice.front,
      );
    } catch (_) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir la cámara o la galería.')));
      return;
    }
    if (img == null || !context.mounted) return;
    final original = await img.readAsBytes();
    if (!context.mounted) return;
    // Lienzo para encuadrar, como en la web.
    final bytes = await RecorteFotoScreen.abrir(context, original);
    if (bytes == null || !context.mounted) return;
    await guardarConAviso(context, () => sesion.subirFoto(bytes), ok: 'Foto actualizada');
  }
  EquipoRepo.de(sesion).cargar(forzar: true);
}

/// Desde el recordatorio "Completa tu perfil": abre la pantalla del dato.
/// Lo que ve el equipo (foto, teléfono, nombre…) se completa en tu ficha.
void abrirPendiente(BuildContext context, Sesion sesion, String clave) {
  final Widget? pantalla = switch (clave) {
    'contactos' || 'salud' => SaludEmergenciaScreen(sesion: sesion),
    'privacidad' => PrivacidadScreen(sesion: sesion),
    'identidad' => IdentidadScreen(sesion: sesion),
    _ => null,
  };
  if (clave == 'foto') {
    cambiarFoto(context, sesion);
  } else if (clave == 'datos') {
    PersonaScreen.abrir(context, EquipoRepo.de(sesion), sesion.nombre ?? '');
  } else if (pantalla != null) {
    SubAjustes.abrir(context, pantalla);
  }
}
