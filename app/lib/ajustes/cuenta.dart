import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../sesion/sesion.dart';
import 'componentes.dart';

/// PIN de 4 dígitos para entrar sin Google.
Future<void> cambiarPin(BuildContext context, Sesion sesion) async {
  final pin = await editarTexto(
    context,
    titulo: 'Cambiar PIN',
    ayuda: '4 dígitos para entrar con tu usuario cuando no uses Google.',
    teclado: TextInputType.number,
    maxLength: 4,
    validar: (v) => RegExp(r'^[0-9]{4}$').hasMatch(v) ? null : 'Ingresa 4 dígitos.',
  );
  if (pin == null || !context.mounted) return;
  await guardarConAviso(context, () => sesion.cambiarPin(pin), ok: 'PIN actualizado');
}

Future<void> cerrarSesion(BuildContext context, Sesion sesion) async {
  final si = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('¿Cerrar sesión?'),
      content: const Text('Para volver a entrar necesitas tu cuenta de Google o tu PIN.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Volver')),
        FilledButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('Cerrar sesión')),
      ],
    ),
  );
  if (si == true) await sesion.cerrar();
}

/// Pide escribir el nombre de usuario para confirmar (web `mecValidar()`).
Future<void> eliminarCuenta(BuildContext context, Sesion sesion) async {
  final usuario = sesion.nombre ?? '';
  final si = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _HojaEliminar(usuario: usuario),
  );
  if (si != true || !context.mounted) return;
  await guardarConAviso(context, sesion.eliminarCuenta, ok: 'Tu cuenta fue eliminada');
}

class _HojaEliminar extends StatefulWidget {
  const _HojaEliminar({required this.usuario});
  final String usuario;

  @override
  State<_HojaEliminar> createState() => _HojaEliminarState();
}

class _HojaEliminarState extends State<_HojaEliminar> {
  String _texto = '';

  @override
  Widget build(BuildContext context) {
    final ok = _texto.trim().toLowerCase() == widget.usuario.toLowerCase();
    return HojaBase(
      titulo: 'Eliminar cuenta',
      ayuda:
          'Es permanente: se borran tus datos personales y no podrás volver a iniciar sesión. '
          'Tu historial de pagos, asistencias y reservas se conserva por registro.\n\n'
          'Para confirmar, escribe tu usuario: ${widget.usuario}',
      accion: ('Eliminar mi cuenta', ok ? () => Navigator.of(context).pop(true) : null),
      child: TextField(
        autofocus: true,
        autocorrect: false,
        inputFormatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
        onChanged: (v) => setState(() => _texto = v),
        decoration: const InputDecoration(labelText: 'Tu usuario'),
      ),
    );
  }
}
