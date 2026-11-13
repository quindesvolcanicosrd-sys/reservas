import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/iconos_marca.dart';
import '../core/emergencias.dart';
import '../core/fechas.dart';
import '../core/paises.dart';
import '../core/tema.dart';
import 'equipo_modelos.dart';
import 'equipo_repo.dart';
import '../core/cargando.dart';
import '../eventos/widgets_comunes.dart';

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
        title: const Text('Emergencia', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 240),
        child: _error != null
            ? Center(
                key: const ValueKey('error'),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Aunque falle la ficha, llamar a emergencias siempre se puede.
                      _botonEmergencias(p, numeroPublico, paisNombre),
                      const SizedBox(height: 20),
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: p.textoSecundario),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
                    ],
                  ),
                ),
              )
            : ListView(
                key: ValueKey(_f == null ? 'cargando' : 'ficha'),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  _cabecera(p),
                  const SizedBox(height: 16),
                  // Siempre arriba y siempre visible, aunque la ficha todavía cargue.
                  _botonEmergencias(p, numeroPublico, paisNombre),
                  if (_f == null)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: PivotCargando()),
                    ),
                  if (_f != null) ..._ficha(p),
                ],
              ),
      ),
    );
  }

  /// Solo lo que se sabe (Victor, 2026-11-12): sin filas "Sin dato"; si no
  /// hay nada, queda solo el botón de emergencias con una línea que lo dice.
  List<Widget> _ficha(PivotPaleta p) {
    final contactos = [
      for (final n in ['1', '2'])
        if (_v('emerg${n}_telefono').isNotEmpty) _contacto(p, n),
    ];
    final medica = <(String, String)>[
      (
        'Alergias',
        _hay('alergias')
            ? [_v('alergias'), _v('alergias_desc')].where((s) => s.isNotEmpty && s.toLowerCase() != 'sí' && s.toLowerCase() != 'si').join(' · ')
            : '',
      ),
      (
        'Medicamentos',
        _hay('medicamentos')
            ? [_v('medicamentos'), _v('medicamentos_desc')].where((s) => s.isNotEmpty && s.toLowerCase() != 'sí' && s.toLowerCase() != 'si').join(' · ')
            : '',
      ),
      ('Enfermedades', _hay('enfermedad') ? _v('enfermedad') : ''),
      ('Antecedentes', _hay('antecedentes') ? _v('antecedentes') : ''),
      ('Atención médica', _hay('atencion_medica') ? _v('atencion_medica') : ''),
      ('Dieta', _hay('dieta') ? _v('dieta') : ''),
    ].where((x) => x.$2.trim().isNotEmpty).toList();
    final direccion = [
      [_v('calle_principal'), _v('numeracion')].where((s) => s.isNotEmpty).join(' '),
      _v('calle_secundaria'),
      _v('sector'),
      _v('canton'),
    ].where((s) => s.isNotEmpty).join(', ');
    final identidad = <(String, String)>[
      ('Nombre legal', _v('nombre_legal')),
      ('Documento', [_v('tipo_documento'), _v('numero_documento')].where((s) => s.isNotEmpty).join(' ')),
      ('Edad', _edad()),
      ('Dirección', direccion),
    ].where((x) => x.$2.trim().isNotEmpty).toList();
    final seguro = _hay('seguro');
    if (!seguro && contactos.isEmpty && medica.isEmpty && identidad.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 20, 8, 0),
          child: Text(
            'No hay más datos de emergencia registrados.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: p.textoSecundario),
          ),
        ),
      ];
    }
    return [
      if (seguro) ...[
        const SizedBox(height: 12),
        _botonGrande(
          p,
          icono: Icons.health_and_safety_rounded,
          titulo: _v('seguro'),
          subtitulo: _hay('seguro_contacto') ? 'Seguro privado · ${_v('seguro_contacto')}' : 'Seguro privado',
          alTocar: _hay('seguro_contacto') ? () => _llamar(_v('seguro_contacto')) : null,
        ),
      ],
      if (contactos.isNotEmpty) ...[_subtitulo(p, 'Contactos de emergencia'), ...contactos],
      if (medica.isNotEmpty) ...[
        _subtitulo(p, 'Información médica'),
        _tarjeta(p, 'salud', Icons.medical_information_rounded, [for (final (e, v) in medica) _fila(p, e, v)]),
      ],
      if (identidad.isNotEmpty) ...[
        _subtitulo(p, 'Identidad'),
        _tarjeta(p, 'identidad', Icons.badge_rounded, [for (final (e, v) in identidad) _fila(p, e, v)]),
      ],
    ];
  }

  Widget _cabecera(PivotPaleta p) {
    final per = widget.persona;
    // Lo crítico para quien atiende, a la vista sin bajar.
    final alerta = _f == null
        ? ''
        : [if (_hay('alergias')) 'Alergias', if (_hay('medicamentos')) 'Toma medicamentos', if (_hay('enfermedad')) 'Enfermedades'].join(' · ');
    return Row(
      children: [
        AvatarPersona(nombre: per.nombreMostrar, foto: per.foto, tamano: 56),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                per.nombreMostrar,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: p.texto),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 220),
                child: alerta.isEmpty
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            Icon(Icons.warning_amber_rounded, size: 18, color: p.marcaTexto),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                alerta,
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.marcaTexto),
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _botonEmergencias(PivotPaleta p, String numero, String pais) {
    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(gradient: PivotPaleta.degradadoMarca, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: () => _llamar(numero),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: PivotPaleta.sobreSeccion.withValues(alpha: 0.18), shape: BoxShape.circle),
                  child: const Icon(Icons.call_rounded, size: 30, color: PivotPaleta.sobreSeccion),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Llamar al $numero',
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: PivotPaleta.sobreSeccion),
                      ),
                      Text(
                        pais.isEmpty ? 'Emergencias' : 'Emergencias · $pais',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: PivotPaleta.sobreSeccion.withValues(alpha: 0.85)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Fila grande tocable (seguro privado).
  Widget _botonGrande(PivotPaleta p, {required IconData icono, required String titulo, required String subtitulo, VoidCallback? alTocar}) {
    final (degradado, sobre) = PivotPaleta.seccion('salud', Theme.of(context).brightness);
    return Material(
      color: p.tarjeta,
      borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
      child: InkWell(
        borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip + 4)),
                child: Icon(icono, color: sobre),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      titulo,
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.texto),
                    ),
                    Text(subtitulo, style: TextStyle(fontSize: 13.5, color: p.textoSecundario)),
                  ],
                ),
              ),
              if (alTocar != null) Icon(Icons.call_rounded, color: p.marcaTexto),
            ],
          ),
        ),
      ),
    );
  }

  Widget _subtitulo(PivotPaleta p, String t) => Padding(
    padding: const EdgeInsets.fromLTRB(8, 22, 8, 8),
    child: Text(
      t.toUpperCase(),
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: p.textoSecundario),
    ),
  );

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
    // Guardado como "+593 (Ecuador)" (antes "🇪🇨 +593 (Ecuador)"): solo los dígitos del prefijo.
    final pre = Paises.desdeValor(_v('emerg${n}_prefijo'))?.prefijo ?? _v('emerg${n}_prefijo').replaceAll(RegExp(r'[^0-9]'), '');
    final nombre = _v('emerg${n}_nombre'), relacion = _v('emerg${n}_relacion');
    final numero = [pre.isEmpty ? '' : '+$pre', tel].where((s) => s.isNotEmpty).join(' ');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            nombre.isEmpty ? numero : nombre,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: p.texto),
          ),
          Text([relacion, if (nombre.isNotEmpty) numero].where((s) => s.isNotEmpty).join(' · '), style: TextStyle(fontSize: 14, color: p.textoSecundario)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  onPressed: () => _llamar(pre.isEmpty ? tel : '+$pre${tel.startsWith('0') ? tel.substring(1) : tel}'),
                  icon: const Icon(Icons.call_rounded),
                  label: const Text('Llamar'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  onPressed: () => _whatsapp(pre, tel),
                  icon: Icon(IconosMarca.whatsapp),
                  label: const Text('WhatsApp'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tarjeta(PivotPaleta p, String seccion, IconData icono, List<Widget> filas) {
    final (degradado, sobre) = PivotPaleta.seccion(seccion, Theme.of(context).brightness);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(gradient: degradado, borderRadius: BorderRadius.circular(PivotRadios.chip + 2)),
            child: Icon(icono, size: 20, color: sobre),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: filas),
          ),
        ],
      ),
    );
  }

  Widget _fila(PivotPaleta p, String etiqueta, String valor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(etiqueta, style: TextStyle(fontSize: 12.5, color: p.textoSecundario)),
          Text(
            valor,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: p.texto),
          ),
        ],
      ),
    );
  }
}

/// Pill roja horizontal "Emergencia" (solo admins). En el detalle de un
/// evento aparece junto a quien fue marcadx A tiempo o Tarde.
class PildoraEmergencia extends StatelessWidget {
  const PildoraEmergencia({super.key, required this.alTocar});
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final pal = context.pivot;
    return Material(
      color: pal.marca,
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.emergency_rounded, size: 16, color: pal.sobreMarca),
              const SizedBox(width: 5),
              Text(
                'Emergencia',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: pal.sobreMarca),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
