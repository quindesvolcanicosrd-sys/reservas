import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import 'reservas_repo.dart';

/// Elige la captura del pago y la sube a esas reservas (Victor, 2026-11-14).
/// Devuelve true si se subió. La copia temporal que deja el selector se
/// borra enseguida: los comprobantes no se guardan en el teléfono.
Future<bool> subirComprobante(BuildContext context, ReservasRepo repo, List<String> ids) async {
  final m = ScaffoldMessenger.of(context);
  final XFile? x;
  try {
    x = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 72, maxWidth: 1600, maxHeight: 2400);
  } catch (_) {
    m.showSnackBar(const SnackBar(content: Text('No pudimos abrir tus fotos. Revisa los permisos de la app.')));
    return false;
  }
  if (x == null) return false;
  m.showSnackBar(const SnackBar(content: Text('Subiendo el comprobante…'), duration: Duration(seconds: 20)));
  try {
    final bytes = await x.readAsBytes();
    await repo.subirComprobante(ids, bytes);
    m.hideCurrentSnackBar();
    m.showSnackBar(const SnackBar(content: Text('¡Listo! Un Pivot revisará tu pago.')));
    return true;
  } catch (e) {
    m.hideCurrentSnackBar();
    m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo subir. Revisa tu conexión e intenta de nuevo.')));
    return false;
  } finally {
    try {
      await File(x.path).delete();
    } catch (_) {}
  }
}
