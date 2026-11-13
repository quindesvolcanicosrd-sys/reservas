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

  // Correo (preparado, Victor 2026-11-13): solo aparece si el servidor lo activa.
  bool _correoActivo = false;
  String _modoCorreo = ''; // '' | 'correo' | 'codigo' | 'nueva'
  String? _registroToken;
  final _correo = TextEditingController();
  final _codigo = TextEditingController();
  final _nombre = TextEditingController();
  final _telefono = TextEditingController();

  @override
  void initState() {
    super.initState();
    widget.sesion.loginCorreoActivo().then((v) {
      if (mounted && v) setState(() => _correoActivo = true);
    });
  }

  @override
  void dispose() {
    for (final c in [_identificador, _pin, _correo, _codigo, _nombre, _telefono]) {
      c.dispose();
    }
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
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    child: _modoCorreo.isNotEmpty ? _formCorreo() : (_modoPin ? _formPin(t) : _botonesInicio()),
                  ),
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
        if (_correoActivo) ...[
          const SizedBox(height: 4),
          OutlinedButton(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: _ocupado ? null : () => setState(() => _modoCorreo = 'correo'),
            child: const Text('Entrar o crear cuenta con correo'),
          ),
        ],
        TextButton(onPressed: _ocupado ? null : () => setState(() => _modoPin = true), child: const Text('Entrar con usuario y contraseña')),
      ],
    );
  }

  Widget _formCorreo() {
    final boton = _ocupado
        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: context.pivot.sobreMarca))
        : Text(switch (_modoCorreo) {
            'correo' => 'Enviarme un código',
            'codigo' => 'Entrar',
            _ => 'Crear cuenta',
          });
    return Column(
      key: ValueKey('correo-$_modoCorreo'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_modoCorreo == 'correo')
          TextField(
            controller: _correo,
            autofocus: true,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'Tu correo', border: OutlineInputBorder()),
            onSubmitted: (_) => _siguienteCorreo(),
          ),
        if (_modoCorreo == 'codigo') ...[
          Text('Te enviamos un código de 6 dígitos a ${_correo.text.trim()}.', textAlign: TextAlign.center),
          const SizedBox(height: 12),
          TextField(
            controller: _codigo,
            autofocus: true,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.w700),
            decoration: const InputDecoration(border: OutlineInputBorder(), counterText: ''),
            onSubmitted: (_) => _siguienteCorreo(),
          ),
        ],
        if (_modoCorreo == 'nueva') ...[
          const Text('Ese correo no tiene cuenta. Créala en un paso:', textAlign: TextAlign.center),
          const SizedBox(height: 12),
          TextField(
            controller: _nombre,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Tu nombre', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _telefono,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Tu teléfono', prefixText: '+593 ', border: OutlineInputBorder()),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _ocupado ? null : _siguienteCorreo,
          child: boton,
        ),
        TextButton(
          onPressed: _ocupado
              ? null
              : () => setState(() {
                  _modoCorreo = _modoCorreo == 'correo' ? '' : 'correo';
                  _error = null;
                }),
          child: const Text('Volver'),
        ),
      ],
    );
  }

  void _siguienteCorreo() {
    final s = widget.sesion;
    switch (_modoCorreo) {
      case 'correo':
        if (!_correo.text.contains('@')) {
          setState(() => _error = 'Escribe tu correo.');
          return;
        }
        _ejecutar(() async {
          await s.enviarCodigoCorreo(_correo.text);
          if (mounted) setState(() => _modoCorreo = 'codigo');
        });
      case 'codigo':
        _ejecutar(() async {
          final t = await s.verificarCodigoCorreo(_correo.text, _codigo.text);
          if (t != null && mounted) {
            setState(() {
              _registroToken = t;
              _modoCorreo = 'nueva';
            });
          }
        });
      default:
        if (_nombre.text.trim().isEmpty || _telefono.text.trim().isEmpty) {
          setState(() => _error = 'Escribe tu nombre y tu teléfono.');
          return;
        }
        _ejecutar(
          () => s.crearCuentaCorreo(email: _correo.text, registroToken: _registroToken ?? '', nombre: _nombre.text, prefijo: '593', telefono: _telefono.text),
        );
    }
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
