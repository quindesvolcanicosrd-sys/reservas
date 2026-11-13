import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/cargando.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';

/// Un enlace de la comunidad (grupo de WhatsApp, Instagram…).
class EnlaceComunidad {
  const EnlaceComunidad(this.red, this.nombre, this.url);
  final String red, nombre, url;
  Map<String, String> get json => {'red': red, 'nombre': nombre, 'url': url};

  static const redes = {
    'whatsapp': ('WhatsApp', Icons.chat_rounded),
    'instagram': ('Instagram', Icons.photo_camera_outlined),
    'facebook': ('Facebook', Icons.facebook),
    'messenger': ('Messenger', Icons.messenger_outline_rounded),
    'tiktok': ('TikTok', Icons.tiktok),
    'youtube': ('YouTube', Icons.smart_display_outlined),
    'web': ('Sitio web', Icons.public_rounded),
    'correo': ('Correo', Icons.mail_outline_rounded),
    'otro': ('Otro', Icons.link_rounded),
  };
  IconData get icono => (redes[red] ?? redes['otro']!).$2;
  String get nombreRed => (redes[red] ?? redes['otro']!).$1;
  String get accion => red == 'whatsapp' ? 'Unirse' : 'Abrir';

  /// Reconoce la red por el enlace pegado (Victor, 2026-11-12).
  static String detectar(String url) {
    final u = url.toLowerCase();
    if (u.contains('whatsapp.com') || u.contains('wa.me')) return 'whatsapp';
    if (u.contains('instagram.com')) return 'instagram';
    if (u.contains('m.me/') || u.contains('messenger.com')) return 'messenger';
    if (u.contains('facebook.com') || u.contains('fb.com') || u.contains('fb.me')) return 'facebook';
    if (u.contains('tiktok.com')) return 'tiktok';
    if (u.contains('youtube.com') || u.contains('youtu.be')) return 'youtube';
    if (u.contains('@') && !u.contains('/')) return 'correo';
    if (u.contains('.')) return 'web';
    return 'otro';
  }

  /// Nombre sugerido para la red reconocida.
  static String nombreSugerido(String red) => switch (red) {
    'whatsapp' => 'Grupo de WhatsApp',
    'correo' => 'Correo de la liga',
    'web' => 'Sitio web',
    _ => (redes[red] ?? redes['otro']!).$1,
  };
}

/// Redes y grupos de la liga (Victor, 2026-11-08; etapa 3). Toda persona
/// con sesión los ve; Pivots los editan.
class ComunidadRepo extends ChangeNotifier {
  ComunidadRepo._(this.sesion);
  final Sesion sesion;
  static ComunidadRepo? _instancia;
  static ComunidadRepo de(Sesion s) {
    if (_instancia == null || !identical(_instancia!.sesion, s)) _instancia = ComunidadRepo._(s);
    return _instancia!;
  }

  bool get esPivot => sesion.esAdmin && sesion.adminToken != null;
  List<EnlaceComunidad> enlaces = [];
  bool cargado = false;
  String? error;

  Future<void> cargar() async {
    try {
      final r = await sesion.api.get('getComunidad', {if (esPivot) 'adminToken': sesion.adminToken});
      enlaces = [
        for (final e in (r['enlaces'] as List? ?? const []))
          if (e is Map) EnlaceComunidad('${e['red']}', '${e['nombre']}', '${e['url']}'),
      ];
      cargado = true;
      error = null;
    } catch (e) {
      error = e is ApiException ? e.message : 'No se pudo cargar. Revisa tu conexión.';
    }
    notifyListeners();
  }

  Future<void> guardar(List<EnlaceComunidad> lista) async {
    final r = await sesion.api.post('adminGuardarComunidad', {
      'adminToken': sesion.adminToken,
      'enlaces': jsonEncode([for (final e in lista) e.json]),
    });
    if (r['exito'] == false) throw ApiException('${r['error'] ?? 'No se pudo guardar.'}');
    await cargar();
  }
}

Future<void> abrirEnlace(BuildContext context, String url) async {
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir el enlace.')));
  }
}

/// Comunidad en Equipo (rediseño, Victor 2026-11-12): cuadrícula de 2
/// columnas con ícono y nombre; tocar abre el enlace. Pivots: el lápiz
/// activa el modo edición (tocar edita, ✕ quita, "Agregar" al final) y,
/// sin enlaces, "Agregar" abre la hoja directo.
class ComunidadScreen extends StatefulWidget {
  const ComunidadScreen({super.key, required this.repo});
  final ComunidadRepo repo;

  @override
  State<ComunidadScreen> createState() => _ComunidadScreenState();
}

class _ComunidadScreenState extends State<ComunidadScreen> {
  ComunidadRepo get repo => widget.repo;
  bool _editando = false;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    repo.cargar();
  }

  Future<void> _guardar(List<EnlaceComunidad> nueva) async {
    setState(() => _guardando = true);
    try {
      await repo.guardar(nueva);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
      }
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _editar([int? i]) async {
    final r = await mostrarHojaEnlace(context, actual: i == null ? null : repo.enlaces[i]);
    if (r == null || !mounted) return;
    final nueva = [...repo.enlaces];
    i == null ? nueva.add(r) : nueva[i] = r;
    await _guardar(nueva);
  }

  Future<void> _quitar(int i) async {
    final e = repo.enlaces[i];
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Quitar "${e.nombre}"?'),
        content: const Text('Dejará de verse en Comunidad.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Quitar')),
        ],
      ),
    );
    if (ok == true) await _guardar([...repo.enlaces]..removeAt(i));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Comunidad', style: TextStyle(fontWeight: FontWeight.w700)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: AnimatedOpacity(opacity: _guardando ? 1 : 0, duration: const Duration(milliseconds: 200), child: const LinearProgressIndicator(minHeight: 3)),
        ),
        actions: [
          if (repo.esPivot && repo.enlaces.isNotEmpty)
            IconButton(
              tooltip: _editando ? 'Listo' : 'Editar',
              icon: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Icon(_editando ? Icons.check_rounded : Icons.edit_outlined, key: ValueKey(_editando)),
              ),
              onPressed: () => setState(() => _editando = !_editando),
            ),
        ],
      ),
      body: ListenableBuilder(
        listenable: repo,
        builder: (context, _) {
          final Widget cuerpo;
          if (!repo.cargado && repo.error == null) {
            cuerpo = const Center(key: ValueKey('c'), child: PivotCargando());
          } else if (!repo.cargado) {
            cuerpo = Center(key: const ValueKey('e'), child: Text(repo.error!));
          } else if (repo.enlaces.isEmpty) {
            cuerpo = Center(
              key: const ValueKey('vacio'),
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.groups_2_outlined, size: 56, color: p.textoSecundario),
                    const SizedBox(height: 12),
                    Text(
                      repo.esPivot
                          ? 'Agrega los grupos y redes de la liga para que todo el equipo los encuentre aquí.'
                          : 'La liga todavía no agregó sus grupos ni redes.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: p.textoSecundario),
                    ),
                    if (repo.esPivot) ...[
                      const SizedBox(height: 16),
                      FilledButton.icon(onPressed: _guardando ? null : () => _editar(), icon: const Icon(Icons.add_rounded), label: const Text('Agregar')),
                    ],
                  ],
                ),
              ),
            );
          } else {
            final n = repo.enlaces.length;
            cuerpo = GridView.builder(
              key: const ValueKey('lista'),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.25,
              ),
              itemCount: n + (_editando ? 1 : 0),
              itemBuilder: (context, i) {
                if (i == n) {
                  return _Mosaico(
                    icono: Icons.add_rounded,
                    titulo: 'Agregar',
                    sub: 'Grupo o red',
                    resaltado: true,
                    alTocar: _guardando ? null : () => _editar(),
                  );
                }
                final e = repo.enlaces[i];
                return _Mosaico(
                  red: e.red,
                  icono: e.icono,
                  titulo: e.nombre,
                  sub: e.nombreRed,
                  alTocar: _guardando ? null : (_editando ? () => _editar(i) : () => abrirEnlace(context, e.url)),
                  alQuitar: _editando && !_guardando ? () => _quitar(i) : null,
                );
              },
            );
          }
          return AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: cuerpo);
        },
      ),
    );
  }
}

class _Mosaico extends StatelessWidget {
  const _Mosaico({required this.icono, required this.titulo, required this.sub, this.red, this.alTocar, this.alQuitar, this.resaltado = false});
  final IconData icono;
  final String titulo, sub;
  final String? red;
  final VoidCallback? alTocar, alQuitar;
  final bool resaltado;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final (degradado, sobre) = PivotPaleta.seccion(red == 'whatsapp' ? 'notificaciones' : (resaltado ? 'salud' : 'privacidad'), Theme.of(context).brightness);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned.fill(
          child: Material(
            color: p.tarjeta,
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            child: InkWell(
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              onTap: alTocar,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(12)),
                      child: Icon(icono, color: sobre),
                    ),
                    const Spacer(),
                    Text(
                      titulo,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w700, height: 1.2, color: p.texto),
                    ),
                    Text(sub, style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
                  ],
                ),
              ),
            ),
          ),
        ),
        Positioned(
          top: -6,
          right: -6,
          child: AnimatedScale(
            scale: alQuitar == null ? 0 : 1,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOutBack,
            child: Material(
              color: p.marca,
              shape: CircleBorder(side: BorderSide(color: p.fondo, width: 2)),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: alQuitar,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(Icons.close_rounded, size: 16, color: p.sobreMarca),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Hoja para agregar o editar un enlace: se pega el enlace y la red se
/// reconoce sola; la fila de íconos solo corrige si hace falta.
Future<EnlaceComunidad?> mostrarHojaEnlace(BuildContext context, {EnlaceComunidad? actual}) {
  final url = TextEditingController(text: actual?.url.replaceFirst('mailto:', '') ?? '');
  final nombre = TextEditingController(text: actual?.nombre ?? '');
  var red = actual?.red ?? 'otro';
  var nombreTocado = actual != null;
  return showModalBottomSheet<EnlaceComunidad>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (hoja) => StatefulBuilder(
      builder: (hoja, refrescar) {
        final p = hoja.pivot;
        void alCambiarEnlace(String v) {
          final r = EnlaceComunidad.detectar(v.trim());
          refrescar(() {
            red = v.trim().isEmpty ? 'otro' : r;
            if (!nombreTocado) nombre.text = v.trim().isEmpty ? '' : EnlaceComunidad.nombreSugerido(red);
          });
        }

        return Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(hoja).bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(actual == null ? 'Agregar a Comunidad' : 'Editar enlace', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('Pega el enlace del grupo o la red; la reconocemos sola.', style: TextStyle(color: p.textoSecundario)),
              const SizedBox(height: 16),
              TextField(
                controller: url,
                autofocus: actual == null,
                keyboardType: TextInputType.url,
                onChanged: alCambiarEnlace,
                decoration: InputDecoration(
                  labelText: 'Enlace o correo',
                  hintText: 'https://chat.whatsapp.com/…',
                  prefixIcon: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Icon((EnlaceComunidad.redes[red] ?? EnlaceComunidad.redes['otro']!).$2, key: ValueKey(red)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nombre,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => nombreTocado = true,
                decoration: const InputDecoration(labelText: 'Nombre', hintText: 'Ej. Grupo del equipo'),
              ),
              const SizedBox(height: 14),
              Text('Red', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
              const SizedBox(height: 6),
              SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final e in EnlaceComunidad.redes.entries)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Tooltip(
                          message: e.value.$1,
                          child: Material(
                            color: red == e.key ? p.marca : p.suave,
                            shape: const CircleBorder(),
                            child: InkWell(
                              customBorder: const CircleBorder(),
                              onTap: () => refrescar(() => red = e.key),
                              child: SizedBox(width: 44, height: 44, child: Icon(e.value.$2, size: 20, color: red == e.key ? p.sobreMarca : p.sobreSuave)),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  if (url.text.trim().isEmpty) return;
                  final n = nombre.text.trim().isEmpty ? EnlaceComunidad.nombreSugerido(red) : nombre.text.trim();
                  Navigator.of(hoja).pop(EnlaceComunidad(red, n, url.text.trim()));
                },
                child: Text(actual == null ? 'Agregar' : 'Guardar'),
              ),
            ],
          ),
        );
      },
    ),
  );
}
