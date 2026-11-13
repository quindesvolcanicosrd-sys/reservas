import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/datos_pendientes.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../equipo/estadisticas.dart';
import '../pivots/ajustes_liga_screen.dart';
import '../equipo/equipo_repo.dart';
import '../equipo/persona_screen.dart';
import '../eventos/eventos_repo.dart';
import '../eventos/widgets_comunes.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';
import 'excepciones_panel.dart';
import 'datos_screens.dart';
import 'cuenta.dart';
import 'identidad_screen.dart';
import 'privacidad_screen.dart';
import 'salud_screen.dart';
import 'notificaciones_screen.dart';
import 'pagos_screen.dart';
import 'recorte_foto.dart';

/// Pestaña Ajustes (rediseño de Victor, 2026-11-07/08): como en la web, solo
/// ajustes de la app, de seguridad y de emergencia; lo que ve el resto del
/// equipo se edita en tu ficha de Equipo. Sin títulos de grupo: los bloques
/// bastan. Íconos con degradados de la marca y un punto rojo en lo que falta.
/// "Mis pagos y reservas" solo aparece si hay algo que mostrar.
class AjustesScreen extends StatefulWidget {
  const AjustesScreen({super.key, required this.sesion, required this.eventos});
  final Sesion sesion;
  final EventosRepo eventos;

  @override
  State<AjustesScreen> createState() => _AjustesScreenState();
}

class _AjustesScreenState extends State<AjustesScreen> {
  Sesion get sesion => widget.sesion;
  EventosRepo get eventos => widget.eventos;

  @override
  void initState() {
    super.initState();
    if (eventos.cuota == null) eventos.recargarCuota();
    NotificacionesScreen.precargar(sesion.api);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: Text('Mi perfil', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
      ),
      body: ListenableBuilder(
        listenable: Listenable.merge([sesion, eventos]),
        builder: (context, _) {
          final d = sesion.datos;
          final conFicha = d.isNotEmpty; // admins "puros" no tienen fila en Equipo
          final faltan = DatosPendientes.calcular(d).map((x) => x.titulo).toSet();
          bool falta(String t) => conFicha && faltan.contains(t);
          final c = eventos.cuota;
          final pagos = PagosScreen.tieneAlgo(c);
          final debe = c != null && c.pagaCuotaMensual && !c.alDia;
          // Excepción de cuota solo para quien paga cuota mensual (Victor, 2026-11-12).
          final pagaCuota = d['exenta_cuota'] != true && ('${d['categoria'] ?? ''}'.toLowerCase() == 'quindes' || (c?.pagaCuotaMensual ?? false));
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
            children: [
              // Mi perfil (Victor, 2026-11-12): arriba quién eres y tus datos
              // de la ficha; después pagos y datos personales; al final, la app.
              _CabeceraPerfil(sesion: sesion),
              if (conFicha) MiPerfilEditable(sesion: sesion),
              GrupoAjustes(
                filas: [
                  if (pagos)
                    FilaAjuste(
                      icono: Icons.receipt_long_rounded,
                      seccion: 'reservas',
                      titulo: 'Mis pagos y reservas',
                      valor: debe ? 'Tienes la cuota pendiente' : 'Recibos, reservas y cuota',
                      pendiente: debe,
                      alTocar: () => SubAjustes.abrir(context, PagosScreen(repo: eventos)),
                    ),
                  if (conFicha && pagaCuota)
                    FilaAjuste(
                      icono: Icons.volunteer_activism_rounded,
                      seccion: 'cuota',
                      titulo: 'Excepción de cuota',
                      valor: 'Tus excepciones y solicitudes',
                      alTocar: () => SubAjustes.abrir(context, ExcepcionesPanelScreen(sesion: sesion)),
                    ),
                  // Junto a la cuota (Victor, 2026-11-08): sale de Mi perfil en Equipo.
                  FilaAjuste(
                    icono: Icons.content_paste_rounded,
                    seccion: 'equipamiento',
                    titulo: 'Mi equipamiento',
                    valor: textoEquipamiento(sesion.datos),
                    alTocar: () => SubAjustes.abrir(context, EquipamientoScreen(sesion: sesion)),
                  ),
                ],
              ),
              if (conFicha)
                GrupoAjustes(
                  filas: [
                    FilaAjuste(
                      icono: Icons.emergency_rounded,
                      seccion: 'salud',
                      titulo: 'Salud y emergencia',
                      valor: 'Contactos, seguro y ficha médica',
                      pendiente: falta('Contacto de emergencia') || falta('Ficha de salud'),
                      alTocar: () => SubAjustes.abrir(context, SaludEmergenciaScreen(sesion: sesion)),
                    ),
                    FilaAjuste(
                      icono: Icons.badge_rounded,
                      seccion: 'identidad',
                      titulo: 'Identidad y dirección',
                      valor: 'Documento y dónde vives',
                      pendiente: falta('Identidad legal') || falta('Dirección'),
                      alTocar: () => SubAjustes.abrir(context, IdentidadScreen(sesion: sesion)),
                    ),
                  ],
                ),
              // Ajustes de la liga, solo Pivots (etapa 3, Victor 2026-11-12).
              if (sesion.esAdmin && sesion.adminToken != null)
                GrupoAjustes(
                  filas: [
                    FilaAjuste(
                      icono: Icons.admin_panel_settings_outlined,
                      seccion: 'roles',
                      titulo: 'Ajustes de la liga',
                      valor: 'Categorías/Equipos, cobros, canal y más',
                      alTocar: () => SubAjustes.abrir(context, AjustesLigaScreen(sesion: sesion)),
                    ),
                  ],
                ),
              GrupoAjustes(
                filas: [
                  if (conFicha)
                    FilaAjuste(
                      icono: Icons.lock_rounded,
                      seccion: 'privacidad',
                      titulo: 'Privacidad',
                      valor: 'Qué ve el resto del equipo',
                      pendiente: falta('Opciones de privacidad') || falta('Fecha de nacimiento'),
                      alTocar: () => SubAjustes.abrir(context, PrivacidadScreen(sesion: sesion)),
                    ),
                  if (conFicha)
                    FilaAjuste(
                      icono: Icons.notifications_rounded,
                      seccion: 'notificaciones',
                      titulo: 'Notificaciones',
                      valor: 'Qué avisos recibes',
                      alTocar: () => SubAjustes.abrir(context, NotificacionesScreen(sesion: sesion)),
                    ),
                  FilaAjuste(
                    icono: Icons.manage_accounts_rounded,
                    seccion: 'cuenta',
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

/// Foto, nombre y número, con acceso a tu ficha (estadísticas).
class _CabeceraPerfil extends StatelessWidget {
  const _CabeceraPerfil({required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final numero = '${sesion.datos['numeroDerby'] ?? ''}'.trim();
    final pron = '${sesion.datos['pronombres'] ?? ''}'.trim();
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 20),
      child: Row(
        children: [
          // Toda el área del avatar cambia la foto; la cámara lo indica
          // (Victor, 2026-11-12).
          Semantics(
            button: true,
            label: 'Cambiar foto de perfil',
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => cambiarFoto(context, sesion),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  HeroAvatar(
                    tag: 'avatar-${sesion.nombre}',
                    child: AvatarPersona(nombre: sesion.nombreMostrar, foto: sesion.fotoPerfil, tamano: 72),
                  ),
                  Positioned(
                    right: -4,
                    bottom: -4,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: p.marca,
                        shape: BoxShape.circle,
                        border: Border.all(color: p.fondo, width: 2.5),
                      ),
                      child: Icon(Icons.photo_camera_rounded, size: 14, color: p.sobreMarca),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  sesion.nombreMostrar,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: p.texto),
                ),
                if (numero.isNotEmpty || pron.isNotEmpty)
                  Text([if (numero.isNotEmpty) '#$numero', if (pron.isNotEmpty) pron].join(' · '), style: TextStyle(fontSize: 14, color: p.textoSecundario)),
                const SizedBox(height: 8),
                if (sesion.datos.isNotEmpty)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                    onPressed: () =>
                        SubAjustes.abrir(context, EstadisticasScreen(repo: EquipoRepo.de(sesion), username: sesion.nombre ?? '', nombre: sesion.nombreMostrar)),
                    icon: const Icon(Icons.insights_rounded, size: 18),
                    label: const Text('Mis estadísticas'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "Patines del club (38) · Protecciones propias".
String textoEquipamiento(Map<String, dynamic> d) {
  final pat = '${d['necesitaPatines'] ?? ''}' == 'Sí';
  final talla = '${d['talla'] ?? ''}'.trim();
  final pro = '${d['necesitaProtecciones'] ?? ''}'.trim();
  final patTxt = pat ? 'Patines del equipo${talla.isEmpty ? '' : ' ($talla)'}' : 'Patines propios';
  final proTxt = pro.isEmpty || pro == 'No' ? 'protecciones propias' : (pro == 'Sí' ? 'protecciones del equipo' : 'del equipo: ${pro.toLowerCase()}');
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
