import 'package:flutter/material.dart';

import '../core/tema.dart';
import 'sesion.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _ocupado = false;
  bool _modoPin = false;
  String? _error;
  final _identificador = TextEditingController();
  final _pin = TextEditingController();

  @override
  void dispose() {
    _identificador.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _ejecutar(Future<void> Function() accion) async {
    setState(() {
      _ocupado = true;
      _error = null;
    });
    try {
      await accion();
    } on LoginFallido catch (e) {
      if (mounted && e.mensaje.isNotEmpty) setState(() => _error = e.mensaje);
    } catch (_) {
      if (mounted) setState(() => _error = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: ClipRRect(borderRadius: BorderRadius.circular(PivotRadios.grande), child: Image.asset('assets/logo.png', width: 88, height: 88)),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Bienvenidx a Pivot',
                    textAlign: TextAlign.center,
                    style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Entrena, confirma tu asistencia y sigue al equipo.',
                    textAlign: TextAlign.center,
                    style: t.bodyMedium?.copyWith(color: context.pivot.textoSecundario),
                  ),
                  const SizedBox(height: 32),
                  AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: _modoPin ? _formPin(t) : _botonesInicio()),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 200),
                    child: _error == null
                        ? const SizedBox.shrink()
                        : Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: t.bodyMedium?.copyWith(color: context.pivot.marcaTexto),
                            ),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _botonesInicio() {
    return Column(
      key: const ValueKey('inicio'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _ocupado ? null : () => _ejecutar(widget.sesion.conGoogle),
          child: _ocupado
              ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: context.pivot.sobreMarca))
              : const Text('Entrar con Google'),
        ),
        const SizedBox(height: 12),
        TextButton(onPressed: _ocupado ? null : () => setState(() => _modoPin = true), child: const Text('Entrar con usuario y contraseña')),
      ],
    );
  }

  Widget _formPin(TextTheme t) {
    return Column(
      key: const ValueKey('pin'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _identificador,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'Tu nombre de usuario o correo', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _pin,
          obscureText: true,
          keyboardType: TextInputType.visiblePassword,
          autocorrect: false,
          decoration: const InputDecoration(labelText: 'Contraseña o PIN', border: OutlineInputBorder()),
          onSubmitted: (_) => _entrarConPin(),
        ),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _ocupado ? null : _entrarConPin,
          child: _ocupado
              ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: context.pivot.sobreMarca))
              : const Text('Entrar'),
        ),
        TextButton(onPressed: _ocupado ? null : () => setState(() => _modoPin = false), child: const Text('Volver')),
      ],
    );
  }

  void _entrarConPin() {
    if (_identificador.text.trim().isEmpty || _pin.text.isEmpty) {
      setState(() => _error = 'Escribe tu usuario y tu contraseña o PIN.');
      return;
    }
    _ejecutar(() => widget.sesion.conPin(_identificador.text, _pin.text));
  }
}
