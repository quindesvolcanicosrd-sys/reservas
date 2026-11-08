import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';

/// Cuenta y acceso (Victor, 2026-11-07): con qué entras (usuario y correo o
/// Google, que no se cambian), la contraseña (crear o cambiar; reemplaza al
/// PIN), el tour y, al final, cerrar sesión y eliminar la cuenta.
class CuentaScreen extends StatelessWidget {
  const CuentaScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: sesion,
      builder: (context, _) {
        final p = context.pivot;
        final d = sesion.datos;
        final conFicha = d.isNotEmpty;
        final tienePassword = d['tienePassword'] == true;
        final tienePin = d['tienePin'] == true;
        final email = '${d['email'] ?? ''}'.trim();
        void fijo(String t) => ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(t)));
        final candado = Icon(Icons.lock_outline_rounded, size: 18, color: p.textoSecundario);
        return SubAjustes(
          titulo: 'Cuenta y acceso',
          hijos: [
            if (conFicha && !tienePassword)
              Container(
                margin: const EdgeInsets.only(bottom: 18),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.key_rounded, color: p.sobreSuave),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        tienePin
                            ? 'Crea una contraseña segura: pronto el PIN dejará de usarse para entrar.'
                            : 'Crea una contraseña para entrar también sin tu cuenta de Google.',
                        style: TextStyle(fontSize: 13.5, height: 1.35, color: p.sobreSuave),
                      ),
                    ),
                  ],
                ),
              ),
            GrupoAjustes(
              filas: [
                FilaAjuste(
                  icono: Icons.alternate_email_rounded,
                  titulo: 'Usuario',
                  valor: '@${sesion.nombre ?? ''}',
                  derecha: candado,
                  alTocar: () => fijo('Tu nombre de usuario no se puede cambiar.'),
                ),
                if (email.isNotEmpty)
                  FilaAjuste(
                    icono: Icons.mail_outline_rounded,
                    titulo: 'Correo',
                    valor: email,
                    derecha: candado,
                    alTocar: () => fijo('El correo de tu cuenta no se puede cambiar.'),
                  ),
                if (conFicha)
                  FilaAjuste(
                    icono: Icons.key_rounded,
                    titulo: tienePassword ? 'Cambiar contraseña' : 'Crear contraseña',
                    valor: tienePassword ? 'Contraseña creada' : null,
                    pendiente: !tienePassword,
                    alTocar: () => _contrasena(context, tienePassword),
                  ),
              ],
            ),
            GrupoAjustes(
              filas: [
                FilaAjuste(
                  icono: Icons.restart_alt_rounded,
                  titulo: 'Reestablecer el tour de la app',
                  valor: 'Vuelve a ver la guía al abrir Eventos',
                  alTocar: () async {
                    final m = ScaffoldMessenger.of(context);
                    final prefs = await SharedPreferences.getInstance();
                    await prefs.remove('tour.eventos.visto');
                    m.showSnackBar(const SnackBar(content: Text('Listo: verás el tour al volver a Eventos.')));
                  },
                ),
              ],
            ),
            GrupoAjustes(
              filas: [
                FilaAjuste(icono: Icons.logout_rounded, titulo: 'Cerrar sesión', peligro: true, alTocar: () => _cerrarSesion(context)),
                if (conFicha)
                  FilaAjuste(icono: Icons.delete_outline_rounded, titulo: 'Eliminar cuenta', peligro: true, alTocar: () => _eliminarCuenta(context)),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _contrasena(BuildContext context, bool tiene) async {
    final r = await showModalBottomSheet<(String, String)>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _HojaContrasena(tieneActual: tiene),
    );
    if (r == null || !context.mounted) return;
    await guardarConAviso(
      context,
      () => sesion.cambiarPassword(actual: r.$1, nueva: r.$2),
      ok: tiene ? 'Contraseña actualizada' : 'Contraseña creada',
    );
  }

  Future<void> _cerrarSesion(BuildContext context) async {
    final si = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('¿Cerrar sesión?'),
        content: const Text('Para volver a entrar necesitas tu cuenta de Google o tu contraseña.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('Cerrar sesión')),
        ],
      ),
    );
    if (si == true) {
      if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
      await sesion.cerrar();
    }
  }

  /// Pide escribir el nombre de usuario para confirmar (web `mecValidar()`).
  Future<void> _eliminarCuenta(BuildContext context) async {
    final si = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _HojaEliminar(usuario: sesion.nombre ?? ''),
    );
    if (si != true || !context.mounted) return;
    final nav = Navigator.of(context);
    final ok = await guardarConAviso(context, sesion.eliminarCuenta, ok: 'Tu cuenta fue eliminada');
    if (ok) nav.popUntil((r) => r.isFirst);
  }
}

/// Actual (si ya hay una), nueva y repetir; con requisitos a la vista.
class _HojaContrasena extends StatefulWidget {
  const _HojaContrasena({required this.tieneActual});
  final bool tieneActual;

  @override
  State<_HojaContrasena> createState() => _HojaContrasenaState();
}

class _HojaContrasenaState extends State<_HojaContrasena> {
  final _actual = TextEditingController(), _nueva = TextEditingController(), _repetir = TextEditingController();
  bool _ver = false;

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    _repetir.dispose();
    super.dispose();
  }

  bool get _largo => _nueva.text.length >= 8;
  bool get _mezcla => RegExp(r'[A-Za-zÁÉÍÓÚÑáéíóúñ]').hasMatch(_nueva.text) && RegExp(r'[0-9]').hasMatch(_nueva.text);
  bool get _iguales => _nueva.text.isNotEmpty && _nueva.text == _repetir.text;
  bool get _lista => _largo && _mezcla && _iguales && (!widget.tieneActual || _actual.text.isNotEmpty);

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    Widget campo(TextEditingController c, String etiqueta, {bool foco = false}) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        autofocus: foco,
        obscureText: !_ver,
        autocorrect: false,
        enableSuggestions: false,
        keyboardType: TextInputType.visiblePassword,
        inputFormatters: [LengthLimitingTextInputFormatter(128)],
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          labelText: etiqueta,
          suffixIcon: IconButton(
            tooltip: _ver ? 'Ocultar' : 'Mostrar',
            icon: Icon(_ver ? Icons.visibility_off_outlined : Icons.visibility_outlined),
            onPressed: () => setState(() => _ver = !_ver),
          ),
        ),
      ),
    );
    Widget requisito(bool ok, String t) => Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: Icon(
              ok ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              key: ValueKey(ok),
              size: 18,
              color: ok ? p.marcaTexto : p.textoSecundario,
            ),
          ),
          const SizedBox(width: 8),
          Text(t, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
        ],
      ),
    );
    return HojaBase(
      titulo: widget.tieneActual ? 'Cambiar contraseña' : 'Crear contraseña',
      ayuda: 'Te servirá para entrar con tu usuario o correo, sin Google.',
      accion: ('Guardar', _lista ? () => Navigator.of(context).pop((_actual.text, _nueva.text)) : null),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.tieneActual) campo(_actual, 'Contraseña actual', foco: true),
          campo(_nueva, 'Nueva contraseña', foco: !widget.tieneActual),
          campo(_repetir, 'Repite la nueva contraseña'),
          requisito(_largo, 'Al menos 8 caracteres'),
          requisito(_mezcla, 'Letras y números'),
          requisito(_iguales, 'Las dos coinciden'),
        ],
      ),
    );
  }
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
