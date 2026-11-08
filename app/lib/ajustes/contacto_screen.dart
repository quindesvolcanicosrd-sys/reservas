import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/asistente.dart';
import '../core/paises.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'campos.dart';
import 'componentes.dart';

/// Contacto de emergencia en pasos (Victor, 2026-11-08), con el marco de los
/// asistentes de la app. Nuevo: nombre → relación → teléfono → revisar.
/// Existente: primero "¿Qué quieres editar?" con botones claros y después
/// solo ese paso. Se guarda todo junto al final.
class ContactoScreen extends StatefulWidget {
  const ContactoScreen({super.key, required this.sesion, required this.n});
  final Sesion sesion;

  /// '1' (principal) o '2'.
  final String n;

  static Future<void> abrir(BuildContext context, Sesion sesion, String n) {
    return Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ContactoScreen(sesion: sesion, n: n),
      ),
    );
  }

  @override
  State<ContactoScreen> createState() => _ContactoScreenState();
}

enum _Paso { menu, nombre, relacion, telefono, revisar }

class _ContactoScreenState extends State<ContactoScreen> {
  static const _relaciones = ['Madre', 'Padre', 'Pareja', 'Hermanx', 'Amistad', 'Familiar'];

  Sesion get s => widget.sesion;
  String get n => widget.n;
  late final bool _existe = valorDe(s, 'emerg${n}Nombre').isNotEmpty;
  late _Paso _paso = _existe ? _Paso.menu : _Paso.nombre;
  bool _adelante = true;
  bool _guardando = false;

  late final _nombre = TextEditingController(text: valorDe(s, 'emerg${n}Nombre'));
  late String _relacion = valorDe(s, 'emerg${n}Relacion');
  late final _otraRelacion = TextEditingController(text: _relaciones.contains(_relacion) ? '' : _relacion);
  late Pais _pais = Paises.desdeValor(valorDe(s, 'emerg${n}Prefijo')) ?? Paises.porCodigo(s.paisEquipo);
  late final _tel = TextEditingController(text: valorDe(s, 'emerg${n}Telefono'));

  @override
  void initState() {
    super.initState();
    unawaited(s.cargarPaisEquipo());
  }

  @override
  void dispose() {
    _nombre.dispose();
    _otraRelacion.dispose();
    _tel.dispose();
    super.dispose();
  }

  /// Pasos del recorrido actual (al editar: menú → el elegido).
  List<_Paso> _recorrido = const [];
  List<_Paso> get _pasos =>
      _existe ? (_recorrido.isEmpty ? const [_Paso.menu] : [_Paso.menu, ..._recorrido]) : const [_Paso.nombre, _Paso.relacion, _Paso.telefono, _Paso.revisar];

  void _ir(int d) {
    final i = _pasos.indexOf(_paso) + d;
    if (i < 0) {
      Navigator.of(context).pop();
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = d > 0;
      _paso = _pasos[i];
    });
  }

  String get _relacionFinal => _otraRelacion.text.trim().isNotEmpty ? _otraRelacion.text.trim() : _relacion;
  String get _numero => _tel.text.replaceAll(RegExp(r'[^0-9]'), '');
  bool get _telValido => _numero.length >= _pais.minDigitos && _numero.length <= _pais.maxDigitos;

  bool get _listo => switch (_paso) {
    _Paso.menu => false,
    _Paso.nombre => _nombre.text.trim().length >= 2,
    _Paso.relacion => _relacionFinal.isNotEmpty,
    _Paso.telefono => _telValido,
    _Paso.revisar => true,
  };

  /// Al editar, cada paso guarda al continuar; al crear, se guarda en "revisar".
  bool get _ultimo => _pasos.last == _paso;

  Future<void> _guardar(Map<String, String> campos, String ok) async {
    setState(() => _guardando = true);
    final bien = await guardarCampos(context, s, campos);
    if (!mounted) return;
    setState(() => _guardando = false);
    if (bien) Navigator.of(context).pop();
  }

  Map<String, String> get _todo => {
    'emerg${n}Nombre': _nombre.text.trim(),
    'emerg${n}Relacion': _relacionFinal,
    'emerg${n}Prefijo': _pais.valorPrefijo,
    'emerg${n}Telefono': _numero,
  };

  void _continuar() {
    if (!_existe) {
      _ultimo ? _guardar(_todo, 'Contacto guardado') : _ir(1);
      return;
    }
    // Editando: guarda solo lo elegido.
    switch (_paso) {
      case _Paso.nombre:
        _guardar({'emerg${n}Nombre': _nombre.text.trim()}, 'Nombre actualizado');
      case _Paso.relacion:
        _guardar({'emerg${n}Relacion': _relacionFinal}, 'Relación actualizada');
      case _Paso.telefono:
        _guardar({'emerg${n}Prefijo': _pais.valorPrefijo, 'emerg${n}Telefono': _numero}, 'Teléfono actualizado');
      default:
        break;
    }
  }

  void _editar(_Paso p) {
    setState(() => _recorrido = [p]);
    _ir(1);
  }

  Future<void> _quitar() async {
    final si = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('¿Quitar este contacto?'),
        content: Text('${_nombre.text.trim()} deja de ser tu contacto de emergencia.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('Quitar')),
        ],
      ),
    );
    if (si == true && mounted) {
      await _guardar({'emerg${n}Nombre': '', 'emerg${n}Relacion': '', 'emerg${n}Prefijo': '', 'emerg${n}Telefono': ''}, 'Contacto quitado');
    }
  }

  @override
  Widget build(BuildContext context) {
    final pasos = _pasos;
    final nombre = _nombre.text.trim();
    return Asistente(
      titulo: _existe ? 'Editar contacto' : (n == '1' ? 'Contacto principal' : 'Segundo contacto'),
      indice: pasos.indexOf(_paso),
      total: _existe ? 2 : pasos.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _Paso.menu => '¿Qué quieres editar?',
        _Paso.nombre => '¿Cómo se llama?',
        _Paso.relacion => nombre.isEmpty ? '¿Qué relación tienen?' : '¿Qué es $nombre para ti?',
        _Paso.telefono => nombre.isEmpty ? '¿A qué número llamar?' : '¿A qué número llamar a $nombre?',
        _Paso.revisar => 'Revisa y guarda',
      },
      ayuda: switch (_paso) {
        _Paso.menu => nombre,
        _Paso.nombre => 'Una persona que pueda responder si te pasa algo.',
        _Paso.telefono => 'Un número al que llamar o escribir por WhatsApp.',
        _ => null,
      },
      cuerpo: switch (_paso) {
        _Paso.menu => _menu(),
        _Paso.nombre => _pasoNombre(),
        _Paso.relacion => _pasoRelacion(),
        _Paso.telefono => _pasoTelefono(),
        _Paso.revisar => _pasoRevisar(),
      },
      textoBoton: _paso == _Paso.menu ? null : (_ultimo || _existe ? 'Guardar' : 'Siguiente'),
      alContinuar: _listo && !_guardando ? _continuar : null,
      ocupado: _guardando,
    );
  }

  Widget _menu() {
    final tel = Paises.telefono(valorDe(s, 'emerg${n}Prefijo'), valorDe(s, 'emerg${n}Telefono'));
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OpcionAsistente(
          icono: Icons.person_outline_rounded,
          titulo: 'Nombre',
          texto: valorDe(s, 'emerg${n}Nombre'),
          activa: false,
          alTocar: () => _editar(_Paso.nombre),
        ),
        OpcionAsistente(
          icono: Icons.diversity_3_outlined,
          titulo: 'Relación',
          texto: valorDe(s, 'emerg${n}Relacion').isEmpty ? 'Sin completar' : valorDe(s, 'emerg${n}Relacion'),
          activa: false,
          alTocar: () => _editar(_Paso.relacion),
        ),
        OpcionAsistente(
          icono: Icons.phone_outlined,
          titulo: 'Teléfono',
          texto: tel.isEmpty ? 'Sin completar' : tel,
          activa: false,
          alTocar: () => _editar(_Paso.telefono),
        ),
        if (n == '2')
          OpcionAsistente(
            icono: Icons.person_remove_outlined,
            titulo: 'Quitar contacto',
            texto: 'Deja de ser tu contacto de emergencia.',
            activa: false,
            alTocar: _quitar,
          ),
      ],
    );
  }

  Widget _pasoNombre() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      TextField(
        controller: _nombre,
        autofocus: true,
        maxLength: 60,
        textCapitalization: TextCapitalization.words,
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _listo ? _continuar() : null,
        decoration: const InputDecoration(labelText: 'Nombre y apellido'),
      ),
    ],
  );

  Widget _pasoRelacion() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final r in _relaciones)
            ChoiceChip(
              label: Text(r),
              selected: _relacion == r && _otraRelacion.text.trim().isEmpty,
              onSelected: (_) => setState(() {
                _relacion = r;
                _otraRelacion.clear();
              }),
            ),
        ],
      ),
      const SizedBox(height: 16),
      TextField(
        controller: _otraRelacion,
        maxLength: 40,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'Otra relación (opcional)'),
      ),
    ],
  );

  Widget _pasoTelefono() {
    final p = context.pivot;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Material(
              color: p.suave,
              borderRadius: BorderRadius.circular(PivotRadios.chip),
              child: InkWell(
                borderRadius: BorderRadius.circular(PivotRadios.chip),
                onTap: () async {
                  final x = await elegirPais(context, paisEquipo: s.paisEquipo, actual: _pais, titulo: 'Prefijo del país', conPrefijo: true);
                  if (x != null) setState(() => _pais = x);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      BanderaPais(pais: _pais, alto: 16),
                      const SizedBox(width: 8),
                      Text(
                        '+${_pais.prefijo}',
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.sobreSuave),
                      ),
                      Icon(Icons.arrow_drop_down_rounded, color: p.sobreSuave),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _tel,
                autofocus: true,
                keyboardType: TextInputType.phone,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                maxLength: _pais.maxDigitos,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Número',
                  counterText: '',
                  helperText: _pais.minDigitos == _pais.maxDigitos ? '${_pais.minDigitos} dígitos' : 'Entre ${_pais.minDigitos} y ${_pais.maxDigitos} dígitos',
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _pasoRevisar() {
    final p = context.pivot;
    final filas = [
      (Icons.person_outline_rounded, 'Nombre', _nombre.text.trim()),
      (Icons.diversity_3_outlined, 'Relación', _relacionFinal),
      (Icons.phone_outlined, 'Teléfono', '+${_pais.prefijo} $_numero'),
    ];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
          decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: Column(
            children: [
              for (final f in filas)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      Icon(f.$1, color: p.marcaTexto, size: 20),
                      const SizedBox(width: 12),
                      Text(f.$2, style: TextStyle(color: p.textoSecundario)),
                      const Spacer(),
                      Text(
                        f.$3,
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const AvisoPrivado(),
      ],
    );
  }
}
