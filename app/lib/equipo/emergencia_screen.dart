import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/emergencias.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import 'equipo_modelos.dart';
import 'equipo_repo.dart';

/// Ficha de emergencia (solo admins, Victor 2026-11-07): de acceso rápido
/// desde la fila de Equipo o la ficha de la persona. Arriba, a quién llamar
/// (seguro privado o el número de emergencias del país del equipo); después
/// contactos, ficha médica e identidad. Se pide al servidor cada vez, no se
/// guarda en el teléfono y bloquea las capturas de pantalla.
class EmergenciaScreen extends StatefulWidget {
  const EmergenciaScreen({super.key, required this.repo, required this.persona});
  final EquipoRepo repo;
  final Integrante persona;

  static Future<void> abrir(BuildContext context, EquipoRepo repo, Integrante p) {
    return Navigator.of(context).push(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 260),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (_, _, _) => EmergenciaScreen(repo: repo, persona: p),
        transitionsBuilder: (_, a, _, child) => FadeTransition(
          opacity: a,
          child: SlideTransition(
            position: Tween(begin: const Offset(0, 0.04), end: Offset.zero).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
            child: child,
          ),
        ),
      ),
    );
  }

  @override
  State<EmergenciaScreen> createState() => _EmergenciaScreenState();
}

class _EmergenciaScreenState extends State<EmergenciaScreen> {
  Map<String, dynamic>? _f;
  String _pais = 'EC';
  String? _error;

  @override
  void initState() {
    super.initState();
    Emergencias.bloquearCapturas(true);
    _cargar();
  }

  @override
  void dispose() {
    Emergencias.bloquearCapturas(false);
    _f = null; // nada queda en memoria al salir
    super.dispose();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final (pais, ficha) = await widget.repo.fichaEmergencia(widget.persona.username);
      if (mounted) {
        setState(() {
          _pais = pais;
          _f = ficha;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  String _v(String k) => '${_f?[k] ?? ''}'.trim();
  bool _hay(String k) => _v(k).isNotEmpty && _v(k).toLowerCase() != 'no';

  static String _soloDigitos(String s) => s.replaceAll(RegExp(r'[^0-9+]'), '');

  void _llamar(String numero) => launchUrl(Uri.parse('tel:${_soloDigitos(numero)}'));
  void _whatsapp(String prefijo, String numero) {
    var n = numero.replaceAll(RegExp(r'[^0-9]'), '');
    final pre = prefijo.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.startsWith('0')) n = n.substring(1);
    launchUrl(Uri.parse('https://wa.me/${pre.isEmpty ? '593' : pre}$n'), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final (paisNombre, numeroPublico) = Emergencias.de(_pais);
    return Scaffold(
      backgroundColor: p.fondo,
      appBar: AppBar(
        backgroundColor: p.marca,
        foregroundColor: p.sobreMarca,
        title: Text('Emergencia · ${widget.persona.nombreMostrar}', style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 240),
        child: _error != null
            ? Center(
                key: const ValueKey('error'),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
                  ],
                ),
              )
            : ListView(
                key: ValueKey(_f == null ? 'cargando' : 'ficha'),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  // 1. A quién llamar: siempre visible, aunque la ficha todavía cargue.
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: p.marca,
                      foregroundColor: p.sobreMarca,
                      minimumSize: const Size.fromHeight(64),
                      textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                    onPressed: () => _llamar(numeroPublico),
                    icon: const Icon(Icons.call_rounded, size: 26),
                    label: Text('Llamar al $numeroPublico${paisNombre.isEmpty ? '' : ' · $paisNombre'}'),
                  ),
                  if (_f == null)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  if (_f != null) ...[
                    if (_hay('seguro')) ...[
                      const SizedBox(height: 10),
                      _tarjeta(p, Icons.health_and_safety_outlined, 'Seguro de salud', [
                        _fila(p, 'Seguro', _v('seguro')),
                        if (_hay('seguro_contacto')) _fila(p, 'Contacto', _v('seguro_contacto')),
                      ], accion: _hay('seguro_contacto') ? ('Llamar al seguro', () => _llamar(_v('seguro_contacto'))) : null),
                    ] else
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 10, 8, 0),
                        child: Text('Sin seguro privado registrado: se usa salud pública.', style: TextStyle(fontSize: 13, color: p.textoSecundario)),
                      ),
                    const SizedBox(height: 12),
                    for (final n in ['1', '2'])
                      if (_hay('emerg${n}_nombre') || _hay('emerg${n}_telefono'))
                        _contacto(p, n)
                      else if (n == '1')
                        _tarjeta(p, Icons.contact_phone_outlined, 'Contacto de emergencia', [_fila(p, '', 'Sin dato')]),
                    _tarjeta(p, Icons.medical_information_outlined, 'Ficha médica', [
                      _fila(p, 'Alergias', [_v('alergias'), _v('alergias_desc')].where((s) => s.isNotEmpty).join(' · ')),
                      _fila(p, 'Enfermedades', _v('enfermedad')),
                      _fila(p, 'Antecedentes', _v('antecedentes')),
                      _fila(p, 'Medicamentos', [_v('medicamentos'), _v('medicamentos_desc')].where((s) => s.isNotEmpty).join(' · ')),
                      _fila(p, 'Atención médica', _v('atencion_medica')),
                      _fila(p, 'Dieta', _v('dieta')),
                    ]),
                    _tarjeta(p, Icons.badge_outlined, 'Identidad', [
                      _fila(p, 'Nombre legal', _v('nombre_legal')),
                      _fila(p, 'Documento', [_v('tipo_documento'), _v('numero_documento')].where((s) => s.isNotEmpty).join(' ')),
                      _fila(p, 'Edad', _edad()),
                      _fila(
                        p,
                        'Dirección',
                        [
                          [_v('calle_principal'), _v('numeracion')].where((s) => s.isNotEmpty).join(' '),
                          _v('calle_secundaria'),
                          _v('sector'),
                          _v('canton'),
                        ].where((s) => s.isNotEmpty).join(', '),
                      ),
                    ]),
                  ],
                ],
              ),
      ),
    );
  }

  String _edad() {
    final n = Fechas.desdeIso(_f?['fecha_nacimiento']);
    if (n == null) return '';
    final h = Fechas.hoy();
    var e = h.year - n.year;
    if (h.month < n.month || (h.month == n.month && h.day < n.day)) e--;
    return '$e años';
  }

  Widget _contacto(PivotPaleta p, String n) {
    final tel = _v('emerg${n}_telefono');
    final pre = _v('emerg${n}_prefijo');
    return _tarjeta(
      p,
      Icons.contact_phone_outlined,
      'Contacto de emergencia${n == '2' ? ' 2' : ''}',
      [
        _fila(p, 'Nombre', _v('emerg${n}_nombre')),
        _fila(p, 'Relación', _v('emerg${n}_relacion')),
        _fila(p, 'Teléfono', [pre.isEmpty ? '' : '+$pre', tel].where((s) => s.isNotEmpty).join(' ')),
      ],
      accion: tel.isEmpty ? null : ('Llamar', () => _llamar(pre.isEmpty ? tel : '+$pre${tel.startsWith('0') ? tel.substring(1) : tel}')),
      accion2: tel.isEmpty ? null : ('WhatsApp', () => _whatsapp(pre, tel)),
    );
  }

  Widget _tarjeta(PivotPaleta p, IconData icono, String titulo, List<Widget> filas, {(String, VoidCallback)? accion, (String, VoidCallback)? accion2}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icono, size: 20, color: p.marcaTexto),
              const SizedBox(width: 8),
              Text(
                titulo,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.texto),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...filas,
          if (accion != null || accion2 != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                if (accion != null)
                  Expanded(
                    child: FilledButton.icon(onPressed: accion.$2, icon: const Icon(Icons.call_rounded, size: 18), label: Text(accion.$1)),
                  ),
                if (accion != null && accion2 != null) const SizedBox(width: 8),
                if (accion2 != null)
                  Expanded(
                    child: OutlinedButton.icon(onPressed: accion2.$2, icon: const Icon(Icons.chat_outlined, size: 18), label: Text(accion2.$1)),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// "Sin dato" en vez de esconder la fila: así se sabe que no existe.
  Widget _fila(PivotPaleta p, String etiqueta, String valor) {
    final vacio = valor.trim().isEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (etiqueta.isNotEmpty)
            SizedBox(
              width: 118,
              child: Text(etiqueta, style: TextStyle(fontSize: 13, color: p.textoSecundario)),
            ),
          Expanded(
            child: Text(
              vacio ? 'Sin dato' : valor,
              style: TextStyle(fontSize: 14.5, fontWeight: vacio ? FontWeight.w400 : FontWeight.w600, color: vacio ? p.textoSecundario : p.texto),
            ),
          ),
        ],
      ),
    );
  }
}
