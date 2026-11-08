import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'package:shared_preferences/shared_preferences.dart';

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
import 'datos_screens.dart';
import 'notificaciones_screen.dart';

/// Pestaña Ajustes (doc del taller, 2026-11-07): tu tarjeta arriba (abre tu
/// ficha de Equipo) y después los grupos. Un punto rojo marca lo que falta
/// completar (mismos datos que el recordatorio al abrir la app).
class AjustesScreen extends StatelessWidget {
  const AjustesScreen({super.key, required this.sesion, required this.eventos});
  final Sesion sesion;
  final EventosRepo eventos;

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
              _Tarjeta(sesion: sesion),
              const SizedBox(height: 18),
              GrupoAjustes(
                filas: [
                  FilaAjuste(
                    icono: Icons.confirmation_number_outlined,
                    titulo: 'Mis reservas',
                    valor: 'Clases y mensualidades, cancelar o reagendar',
                    alTocar: () => SubAjustes.abrir(context, MisReservasScreen(repo: eventos)),
                  ),
                ],
              ),
              if (conFicha) ...[
                GrupoAjustes(
                  titulo: 'MI PERFIL',
                  filas: [
                    FilaAjuste(
                      icono: Icons.person_outline_rounded,
                      titulo: 'Mis datos',
                      valor: 'Foto, nombre derby, número, pronombres, teléfono, roles',
                      pendiente: ['Foto de perfil', 'Teléfono', 'Nombre derby', 'Pronombres', 'Roles en el equipo'].any(falta),

                      alTocar: () => SubAjustes.abrir(context, MisDatosScreen(sesion: sesion)),
                    ),
                    FilaAjuste(
                      icono: Icons.roller_skating_outlined,
                      titulo: 'Mi equipamiento',
                      valor: textoEquipamiento(d),
                      alTocar: () => SubAjustes.abrir(context, EquipamientoScreen(sesion: sesion)),
                    ),
                  ],
                ),
                GrupoAjustes(
                  titulo: 'SEGURIDAD',
                  pie: 'Solo admins ven estos datos, y solo en una emergencia.',
                  filas: [
                    FilaAjuste(
                      icono: Icons.contact_phone_outlined,
                      titulo: 'Contactos de emergencia',
                      valor: '${d['emerg1Nombre'] ?? ''}'.trim(),
                      pendiente: falta('Contacto de emergencia'),
                      alTocar: () => SubAjustes.abrir(context, ContactosScreen(sesion: sesion)),
                    ),
                    FilaAjuste(
                      icono: Icons.medical_information_outlined,
                      titulo: 'Ficha de salud',
                      valor: '${d['atencionMedica'] ?? ''}'.trim(),
                      pendiente: falta('Ficha de salud'),
                      alTocar: () => SubAjustes.abrir(context, SaludScreen(sesion: sesion)),
                    ),
                    FilaAjuste(
                      icono: Icons.badge_outlined,
                      titulo: 'Identidad y dirección',
                      valor: '${d['nombreLegal'] ?? ''}'.trim(),
                      pendiente: falta('Identidad legal') || falta('Dirección'),
                      alTocar: () => SubAjustes.abrir(context, IdentidadScreen(sesion: sesion)),
                    ),
                  ],
                ),
                GrupoAjustes(
                  titulo: 'PREFERENCIAS',
                  filas: [
                    FilaAjuste(
                      icono: Icons.lock_outline_rounded,
                      titulo: 'Privacidad',
                      valor: 'Qué ve el resto del equipo',
                      pendiente: falta('Opciones de privacidad') || falta('Fecha de nacimiento'),
                      alTocar: () => SubAjustes.abrir(context, PrivacidadScreen(sesion: sesion)),
                    ),
                    FilaAjuste(
                      icono: Icons.notifications_none_rounded,
                      titulo: 'Notificaciones',
                      valor: 'Elige qué avisos recibes',
                      alTocar: () => SubAjustes.abrir(context, NotificacionesScreen(sesion: sesion)),
                    ),
                  ],
                ),
                GrupoAjustes(
                  titulo: 'CUOTA',
                  filas: [
                    FilaAjuste(
                      icono: Icons.volunteer_activism_outlined,
                      titulo: 'Pedir una excepción de cuota',
                      valor: 'Por ausencias justificadas o dificultad económica',
                      alTocar: () => SubAjustes.abrir(context, ExcepcionScreen(sesion: sesion)),
                    ),
                  ],
                ),
              ],
              GrupoAjustes(
                titulo: 'CUENTA',
                filas: [
                  if (conFicha) FilaAjuste(icono: Icons.pin_outlined, titulo: 'Cambiar PIN', alTocar: () => cambiarPin(context, sesion)),
                  FilaAjuste(
                    icono: Icons.tour_outlined,
                    titulo: 'Ver el tour de nuevo',
                    alTocar: () async {
                      final m = ScaffoldMessenger.of(context);
                      final prefs = await SharedPreferences.getInstance();
                      await prefs.remove('tour.eventos.visto');
                      m.showSnackBar(const SnackBar(content: Text('Listo: verás el tour al volver a Eventos.')));
                    },
                  ),
                  FilaAjuste(icono: Icons.logout_rounded, titulo: 'Cerrar sesión', peligro: true, alTocar: () => cerrarSesion(context, sesion)),
                  if (conFicha)
                    FilaAjuste(icono: Icons.delete_outline_rounded, titulo: 'Eliminar cuenta', peligro: true, alTocar: () => eliminarCuenta(context, sesion)),
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
  const _Tarjeta({required this.sesion});
  final Sesion sesion;

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
                        'Ver mi ficha',
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.marcaTexto),
                      ),
                    ],
                  ],
                ),
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
        maxWidth: 640,
        maxHeight: 640,
        imageQuality: 82,
        preferredCameraDevice: CameraDevice.front,
      );
    } catch (_) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir la cámara o la galería.')));
      return;
    }
    if (img == null || !context.mounted) return;
    final bytes = await img.readAsBytes();
    if (!context.mounted) return;
    await guardarConAviso(context, () => sesion.subirFoto(bytes), ok: 'Foto actualizada');
  }
  EquipoRepo.de(sesion).cargar(forzar: true);
}

/// Desde el recordatorio "Completa tu perfil": abre la pantalla del dato.
void abrirPendiente(BuildContext context, Sesion sesion, String clave) {
  final Widget? pantalla = switch (clave) {
    'contactos' => ContactosScreen(sesion: sesion),
    'salud' => SaludScreen(sesion: sesion),
    'privacidad' => PrivacidadScreen(sesion: sesion),
    'identidad' => IdentidadScreen(sesion: sesion),
    'datos' => MisDatosScreen(sesion: sesion),
    _ => null,
  };
  if (clave == 'foto') {
    cambiarFoto(context, sesion);
  } else if (pantalla != null) {
    SubAjustes.abrir(context, pantalla);
  }
}
