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

/// Comunidad en Equipo: tarjetas con el ícono de cada red y "Unirse" o "Abrir".
class ComunidadScreen extends StatefulWidget {
  const ComunidadScreen({super.key, required this.repo});
  final ComunidadRepo repo;

  @override
  State<ComunidadScreen> createState() => _ComunidadScreenState();
}

class _ComunidadScreenState extends State<ComunidadScreen> {
  ComunidadRepo get repo => widget.repo;

  @override
  void initState() {
    super.initState();
    repo.cargar();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Comunidad', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          if (repo.esPivot)
            IconButton(
              tooltip: 'Editar redes y grupos',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => EditarComunidadScreen(repo: repo))),
            ),
        ],
      ),
      body: ListenableBuilder(
        listenable: repo,
        builder: (context, _) {
          if (!repo.cargado && repo.error == null) return const Center(child: PivotCargando());
          if (!repo.cargado) return Center(child: Text(repo.error!));
          if (repo.enlaces.isEmpty) {
            return Center(
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
                      FilledButton.icon(
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => EditarComunidadScreen(repo: repo))),
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('Agregar'),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
            children: [
              for (final e in repo.enlaces)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Material(
                    color: p.tarjeta,
                    borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
                      onTap: () => abrirEnlace(context, e.url),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            _IconoRed(red: e.red, icono: e.icono),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    e.nombre,
                                    style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                                  ),
                                  Text(e.nombreRed, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                                ],
                              ),
                            ),
                            FilledButton.tonal(onPressed: () => abrirEnlace(context, e.url), child: Text(e.accion)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _IconoRed extends StatelessWidget {
  const _IconoRed({required this.red, required this.icono});
  final String red;
  final IconData icono;

  @override
  Widget build(BuildContext context) {
    final (degradado, sobre) = PivotPaleta.seccion(red == 'whatsapp' ? 'notificaciones' : 'privacidad', Theme.of(context).brightness);
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(12)),
      child: Icon(icono, color: sobre),
    );
  }
}

/// Pivots: agregar, editar, ordenar y quitar enlaces.
class EditarComunidadScreen extends StatefulWidget {
  const EditarComunidadScreen({super.key, required this.repo});
  final ComunidadRepo repo;

  @override
  State<EditarComunidadScreen> createState() => _EditarComunidadScreenState();
}

class _EditarComunidadScreenState extends State<EditarComunidadScreen> {
  late List<EnlaceComunidad> _lista = [...widget.repo.enlaces];
  bool _guardando = false;

  Future<void> _guardar(List<EnlaceComunidad> nueva) async {
    final antes = _lista;
    setState(() {
      _lista = nueva;
      _guardando = true;
    });
    try {
      await widget.repo.guardar(nueva);
      if (mounted) setState(() => _lista = [...widget.repo.enlaces]);
    } catch (e) {
      if (!mounted) return;
      setState(() => _lista = antes);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _editar([int? i]) async {
    final actual = i == null ? null : _lista[i];
    var red = actual?.red ?? 'whatsapp';
    final nombre = TextEditingController(text: actual?.nombre ?? '');
    final url = TextEditingController(text: actual?.url.replaceFirst('mailto:', '') ?? '');
    final r = await showModalBottomSheet<EnlaceComunidad>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (hoja) => StatefulBuilder(
        builder: (hoja, refrescar) => Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(hoja).bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(actual == null ? 'Nuevo enlace' : 'Editar enlace', style: Theme.of(hoja).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final e in EnlaceComunidad.redes.entries)
                    ChoiceChip(
                      avatar: Icon(e.value.$2, size: 18),
                      label: Text(e.value.$1),
                      selected: red == e.key,
                      onSelected: (_) => refrescar(() => red = e.key),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nombre,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Nombre', hintText: 'Ej. Grupo del equipo'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: url,
                keyboardType: red == 'correo' ? TextInputType.emailAddress : TextInputType.url,
                decoration: InputDecoration(labelText: red == 'correo' ? 'Correo' : 'Enlace', hintText: red == 'correo' ? 'liga@correo.com' : 'https://…'),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  if (nombre.text.trim().isEmpty || url.text.trim().isEmpty) return;
                  Navigator.of(hoja).pop(EnlaceComunidad(red, nombre.text.trim(), url.text.trim()));
                },
                child: const Text('Guardar'),
              ),
            ],
          ),
        ),
      ),
    );
    if (r == null || !mounted) return;
    final nueva = [..._lista];
    i == null ? nueva.add(r) : nueva[i] = r;
    await _guardar(nueva);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Redes y grupos', style: TextStyle(fontWeight: FontWeight.w700)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: AnimatedOpacity(opacity: _guardando ? 1 : 0, duration: const Duration(milliseconds: 200), child: const LinearProgressIndicator(minHeight: 3)),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _guardando ? null : () => _editar(),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Agregar'),
      ),
      body: ReorderableListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        header: Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
          child: Text(
            'Todo el equipo ve estos enlaces en Equipo → Comunidad. Mantén presionado para cambiar el orden.',
            style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
          ),
        ),
        itemCount: _lista.length,
        onReorderItem: (de, a) {
          final l = [..._lista];
          l.insert(a, l.removeAt(de));
          _guardar(l);
        },
        itemBuilder: (context, i) {
          final e = _lista[i];
          return Padding(
            key: ValueKey('${e.red}-${e.url}-$i'),
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: p.tarjeta,
              borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
              child: ListTile(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                leading: Icon(e.icono, color: p.marcaTexto),
                title: Text(e.nombre, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(e.url, maxLines: 1, overflow: TextOverflow.ellipsis),
                onTap: _guardando ? null : () => _editar(i),
                trailing: IconButton(
                  tooltip: 'Quitar',
                  icon: const Icon(Icons.delete_outline_rounded),
                  onPressed: _guardando
                      ? null
                      : () async {
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
                          if (ok == true) await _guardar([..._lista]..removeAt(i));
                        },
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
