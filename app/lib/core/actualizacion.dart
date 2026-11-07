import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:in_app_update/in_app_update.dart';
import 'package:ota_update/ota_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'tema.dart';

/// Actualización obligatoria (pedido explícito 2026-11-06): si hay una
/// versión más nueva, la app no se puede usar hasta actualizar.
/// - Variante "play": actualización inmediata oficial de Google Play.
/// - Variante "directa" (APK de GitHub): lee version.json de la release
///   `app-android` y, si el número de versión es mayor, muestra una pantalla
///   que descarga e instala el APK nuevo (ota_update).
class Actualizacion {
  static const _base = 'https://github.com/quindesvolcanicosrd-sys/reservas/releases/download/app-android';
  static const urlVersion = '$_base/version.json';
  static const urlApk = '$_base/pivot.apk';

  static bool get esPlay => appFlavor == 'play';
}

class VersionRemota {
  const VersionRemota({required this.codigo, required this.nombre, required this.novedades});
  final int codigo;
  final String nombre;
  final String novedades;
}

/// Envuelve la app y, si hace falta, tapa todo con la pantalla de actualizar.
/// Revisa al abrir y cada vez que la app vuelve a primer plano.
class ControlActualizacion extends StatefulWidget {
  const ControlActualizacion({super.key, required this.child});
  final Widget child;

  @override
  State<ControlActualizacion> createState() => _ControlActualizacionState();
}

class _ControlActualizacionState extends State<ControlActualizacion> with WidgetsBindingObserver {
  VersionRemota? _pendiente;
  bool _revisando = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _revisar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (estado == AppLifecycleState.resumed) _revisar();
  }

  Future<void> _revisar() async {
    if (_revisando) return;
    _revisando = true;
    try {
      if (Actualizacion.esPlay) {
        final info = await InAppUpdate.checkForUpdate();
        if (info.updateAvailability == UpdateAvailability.updateAvailable && info.immediateUpdateAllowed) {
          await InAppUpdate.performImmediateUpdate();
        }
        return;
      }
      final instalada = int.tryParse((await PackageInfo.fromPlatform()).buildNumber) ?? 0;
      final resp = await http.get(Uri.parse('${Actualizacion.urlVersion}?t=${DateTime.now().millisecondsSinceEpoch}')).timeout(const Duration(seconds: 15));
      if (resp.statusCode != 200) return;
      final j = jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
      final remota = VersionRemota(
        codigo: (j['versionCode'] as num?)?.toInt() ?? 0,
        nombre: (j['versionName'] ?? '').toString(),
        novedades: (j['novedades'] ?? '').toString(),
      );
      if (mounted) setState(() => _pendiente = remota.codigo > instalada ? remota : null);
    } catch (_) {
      // Sin conexión o sin release: se usa la versión instalada.
    } finally {
      _revisando = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _pendiente == null ? const SizedBox.shrink() : PantallaActualizar(version: _pendiente!),
        ),
      ],
    );
  }
}

class PantallaActualizar extends StatefulWidget {
  const PantallaActualizar({super.key, required this.version});
  final VersionRemota version;

  @override
  State<PantallaActualizar> createState() => _PantallaActualizarState();
}

class _PantallaActualizarState extends State<PantallaActualizar> {
  StreamSubscription<OtaEvent>? _sub;
  double? _progreso;
  bool _instalando = false;
  String? _error;

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _actualizar() {
    setState(() {
      _error = null;
      _progreso = 0;
      _instalando = false;
    });
    try {
      _sub?.cancel();
      _sub = OtaUpdate().execute(Actualizacion.urlApk, destinationFilename: 'pivot.apk').listen((e) {
        if (!mounted) return;
        switch (e.status) {
          case OtaStatus.DOWNLOADING:
            setState(() => _progreso = (double.tryParse(e.value ?? '') ?? 0) / 100);
          case OtaStatus.INSTALLING:
          case OtaStatus.INSTALLATION_DONE:
            setState(() {
              _progreso = 1;
              _instalando = true;
            });
          case OtaStatus.ALREADY_RUNNING_ERROR:
            break;
          case OtaStatus.PERMISSION_NOT_GRANTED_ERROR:
            _fallo('Android necesita tu permiso para instalar la actualización. Actívalo y vuelve a intentarlo.');
          default:
            _fallo('No se pudo descargar la actualización. Revisa tu conexión e inténtalo de nuevo.');
        }
      }, onError: (_) => _fallo('No se pudo descargar la actualización. Revisa tu conexión e inténtalo de nuevo.'));
    } catch (_) {
      _fallo('No se pudo iniciar la actualización.');
    }
  }

  void _fallo(String mensaje) {
    if (mounted) {
      setState(() {
        _error = mensaje;
        _progreso = null;
        _instalando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final t = Theme.of(context).textTheme;
    final descargando = _progreso != null && !_instalando;
    return PopScope(
      canPop: false,
      child: Material(
        color: p.fondo,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: ClipRRect(borderRadius: BorderRadius.circular(PivotRadios.grande), child: Image.asset('assets/logo.png', width: 88, height: 88)),
                ),
                const SizedBox(height: 24),
                Text(
                  'Hay una nueva versión de Pivot',
                  textAlign: TextAlign.center,
                  style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  'Para seguir usando la app, actualiza a la versión ${widget.version.nombre}.',
                  textAlign: TextAlign.center,
                  style: t.bodyMedium?.copyWith(color: p.textoSecundario),
                ),
                if (widget.version.novedades.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                    child: Text('Novedades: ${widget.version.novedades}', style: t.bodyMedium?.copyWith(color: p.texto)),
                  ),
                ],
                const SizedBox(height: 28),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: descargando
                      ? Column(
                          key: const ValueKey('progreso'),
                          children: [
                            LinearProgressIndicator(value: _progreso == 0 ? null : _progreso, minHeight: 8, borderRadius: BorderRadius.circular(8)),
                            const SizedBox(height: 10),
                            Text('Descargando… ${((_progreso ?? 0) * 100).round()} %', style: TextStyle(color: p.textoSecundario)),
                          ],
                        )
                      : FilledButton(
                          key: const ValueKey('boton'),
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                          onPressed: _actualizar,
                          child: Text(_instalando ? 'Abrir el instalador de nuevo' : 'Actualizar ahora'),
                        ),
                ),
                if (_instalando) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Confirma la instalación en la ventana de Android. Si te pide permitir instalar apps de Pivot, actívalo.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: p.textoSecundario),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: p.marcaTexto),
                  ),
                  TextButton(
                    onPressed: () => launchUrl(Uri.parse(Actualizacion.urlApk), mode: LaunchMode.externalApplication),
                    child: const Text('Descargarla desde el navegador'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
