import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../equipo/equipo_repo.dart';
import '../sesion/sesion.dart';
import 'ajustes_screen.dart';
import 'componentes.dart';

/// Pantallas de datos propios de Ajustes. Cada fila abre una hoja y guarda
/// ese campo solo (`actualizarDatosPersona`); la fila se actualiza al toque.

String _v(Sesion s, String k) => '${s.datos[k] ?? ''}'.trim();

/// Opcionales de la ficha de salud: vacío con la ficha ya empezada = "ninguna".
String _vacioComo(Sesion s, String k, String ninguno) => _v(s, k).isEmpty && _v(s, 'atencionMedica').isNotEmpty ? ninguno : _v(s, k);

Future<void> _editarCampo(
  BuildContext context,
  Sesion s,
  String campo,
  String titulo, {
  String? ayuda,
  TextInputType teclado = TextInputType.text,
  int maxLength = 80,
  int lineas = 1,
  bool obligatorio = false,
}) async {
  final v = await editarTexto(
    context,
    titulo: titulo,
    valor: _v(s, campo),
    ayuda: ayuda,
    teclado: teclado,
    maxLength: maxLength,
    lineas: lineas,
    validar: obligatorio ? (x) => x.isEmpty ? 'Este dato es obligatorio.' : null : null,
  );
  if (v == null || v == _v(s, campo) || !context.mounted) return;
  await guardarConAviso(context, () => s.guardarDatos({campo: v}));
}

Future<void> _elegirCampo(
  BuildContext context,
  Sesion s,
  String campo,
  String titulo,
  List<String> opciones, {
  bool multi = false,
  bool otro = false,
  String? ayuda,
}) async {
  final v = await elegirOpciones(context, titulo: titulo, opciones: opciones, valor: _v(s, campo), multi: multi, otro: otro, ayuda: ayuda);
  if (v == null || v == _v(s, campo) || !context.mounted) return;
  await guardarConAviso(context, () => s.guardarDatos({campo: v}));
}

/// Teléfono con prefijo de país en una sola hoja; se guardan juntos.
Future<void> _editarTelefono(BuildContext context, Sesion s, String campoPrefijo, String campoTel, String titulo) async {
  final r = await showModalBottomSheet<(String, String)>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _HojaTelefono(titulo: titulo, prefijo: _v(s, campoPrefijo), numero: _v(s, campoTel)),
  );
  if (r == null || !context.mounted) return;
  await guardarConAviso(context, () => s.guardarDatos({campoPrefijo: r.$1, campoTel: r.$2}));
}

class _HojaTelefono extends StatefulWidget {
  const _HojaTelefono({required this.titulo, required this.prefijo, required this.numero});
  final String titulo;
  final String prefijo;
  final String numero;

  @override
  State<_HojaTelefono> createState() => _HojaTelefonoState();
}

class _HojaTelefonoState extends State<_HojaTelefono> {
  late final _pre = TextEditingController(
    text: widget.prefijo.replaceAll(RegExp(r'[^0-9]'), '').isEmpty ? '593' : widget.prefijo.replaceAll(RegExp(r'[^0-9]'), ''),
  );
  late final _num = TextEditingController(text: widget.numero);
  String? _error;

  @override
  void dispose() {
    _pre.dispose();
    _num.dispose();
    super.dispose();
  }

  void _listo() {
    final n = _num.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.length < 7) {
      setState(() => _error = 'Revisa el número.');
      return;
    }
    Navigator.of(context).pop((_pre.text.trim(), n));
  }

  @override
  Widget build(BuildContext context) {
    final soloDigitos = [FilteringTextInputFormatter.digitsOnly];
    return HojaBase(
      titulo: widget.titulo,
      accion: ('Guardar', _listo),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: TextField(
              controller: _pre,
              keyboardType: TextInputType.number,
              inputFormatters: soloDigitos,
              maxLength: 4,
              decoration: const InputDecoration(labelText: 'País', prefixText: '+', counterText: ''),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: _num,
              autofocus: true,
              keyboardType: TextInputType.phone,
              inputFormatters: soloDigitos,
              maxLength: 12,
              decoration: InputDecoration(labelText: 'Número', errorText: _error, counterText: ''),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _elegirFecha(BuildContext context, Sesion s, String campo, {required String ayuda, DateTime? desde, DateTime? hasta}) async {
  final hoy = Fechas.hoy();
  final actual = Fechas.desdeIso(s.datos[campo]);
  final f = await showDatePicker(
    context: context,
    firstDate: desde ?? DateTime(1950),
    lastDate: hasta ?? hoy,
    initialDate: actual ?? hasta ?? hoy,
    helpText: ayuda,
    initialEntryMode: DatePickerEntryMode.calendarOnly,
  );
  if (f == null || !context.mounted) return;
  await guardarConAviso(context, () => s.guardarDatos({campo: Fechas.iso(f)}));
}

/// Base de las pantallas: se reconstruye con cada cambio de la sesión.
class _Pantalla extends StatelessWidget {
  const _Pantalla({required this.sesion, required this.titulo, required this.hijos});
  final Sesion sesion;
  final String titulo;
  final List<Widget> Function(BuildContext) hijos;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: sesion,
      builder: (context, _) => SubAjustes(titulo: titulo, hijos: hijos(context)),
    );
  }
}

// ─── Mis datos ───────────────────────────────────────────────────────────

class MisDatosScreen extends StatelessWidget {
  const MisDatosScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final equipo = EquipoRepo.de(sesion);
    equipo.cargar();
    final s = sesion;
    return _Pantalla(
      sesion: s,
      titulo: 'Mis datos',
      hijos: (context) {
        final tel = _v(s, 'telefono');
        return [
          GrupoAjustes(
            pie: 'Esto lo ve todo el equipo en tu ficha.',
            filas: [
              FilaAjuste(
                icono: Icons.add_a_photo_outlined,
                titulo: 'Foto de perfil',
                valor: s.fotoPerfil.isEmpty ? '' : 'Cambiar o quitar',
                alTocar: () => cambiarFoto(context, s),
              ),

              FilaAjuste(
                icono: Icons.sports_rounded,
                titulo: 'Nombre derby',
                valor: _v(s, 'nombreDerby'),
                alTocar: () => _editarCampo(context, s, 'nombreDerby', 'Nombre derby', maxLength: 40),
              ),
              FilaAjuste(
                icono: Icons.tag_rounded,
                titulo: 'Número derby',
                valor: _v(s, 'numeroDerby'),
                alTocar: () => _editarCampo(context, s, 'numeroDerby', 'Número derby', maxLength: 4),
              ),
              FilaAjuste(
                icono: Icons.record_voice_over_outlined,
                titulo: 'Pronombres',
                valor: _v(s, 'pronombres'),
                alTocar: () =>
                    _elegirCampo(context, s, 'pronombres', 'Pronombres', const ['Ella', 'Él', 'Elle'], multi: true, ayuda: 'Elige todos los que apliquen.'),
              ),
              ListenableBuilder(
                listenable: equipo,
                builder: (context, _) {
                  final roles = equipo.persona(s.nombre ?? '')?.roles ?? const <String>[];
                  return FilaAjuste(
                    icono: Icons.shield_outlined,
                    titulo: 'Roles en el equipo',
                    valor: roles.join(', '),
                    alTocar: () async {
                      final v = await elegirOpciones(
                        context,
                        titulo: 'Roles en el equipo',
                        opciones: EquipoRepo.rolesCatalogo,
                        valor: roles.join(', '),
                        multi: true,
                      );
                      if (v == null || !context.mounted) return;
                      final ok = await guardarConAviso(context, () => s.guardarDatos({'roles': v}));
                      if (ok) await equipo.cargar(forzar: true);
                    },
                  );
                },
              ),
              FilaAjuste(
                icono: Icons.event_outlined,
                titulo: 'Entraste al equipo',
                valor: fechaLarga(s.datos['fechaIngreso']),
                alTocar: () => _elegirFecha(context, s, 'fechaIngreso', ayuda: 'Cuándo entraste al equipo', desde: DateTime(2010)),
              ),
            ],
          ),
          GrupoAjustes(
            titulo: 'CONTACTO',
            filas: [
              FilaAjuste(
                icono: Icons.phone_outlined,
                titulo: 'Teléfono',
                valor: tel.isEmpty ? '' : '+${_v(s, 'prefijo').isEmpty ? '593' : _v(s, 'prefijo')} $tel',
                alTocar: () => _editarTelefono(context, s, 'prefijo', 'telefono', 'Teléfono'),
              ),
              FilaAjuste(
                icono: Icons.mail_outline_rounded,
                titulo: 'Email',
                valor: _v(s, 'email'),
                derecha: Icon(Icons.lock_outline_rounded, size: 18, color: context.pivot.textoSecundario),
                alTocar: () => ScaffoldMessenger.of(context)
                  ..hideCurrentSnackBar()
                  ..showSnackBar(const SnackBar(content: Text('El email es el de tu cuenta de Google y no se puede cambiar.'))),
              ),
            ],
          ),
        ];
      },
    );
  }
}

// ─── Mi equipamiento ─────────────────────────────────────────────────────

/// Patines y protecciones del club. Si alguien de Quindes elige equipamiento
/// del club, primero ve el aviso (Victor, 2026-11-07).
class EquipamientoScreen extends StatefulWidget {
  const EquipamientoScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<EquipamientoScreen> createState() => _EquipamientoScreenState();
}

class _EquipamientoScreenState extends State<EquipamientoScreen> {
  static const _piezas = ['Casco', 'Muñequeras', 'Rodilleras', 'Coderas'];
  late bool _patinesClub;
  late String _talla;
  late String _protModo; // 'propias' | 'todas' | 'algunas'
  late Set<String> _algunas;
  List<String> _tallas = const [];
  bool _guardando = false;

  Sesion get s => widget.sesion;

  @override
  void initState() {
    super.initState();
    _desdeSesion();
    _cargarTallas();
  }

  void _desdeSesion() {
    _patinesClub = _v(s, 'necesitaPatines') == 'Sí';
    _talla = _v(s, 'talla');
    final pro = _v(s, 'necesitaProtecciones');
    _protModo = pro.isEmpty || pro == 'No' ? 'propias' : (pro == 'Sí' ? 'todas' : 'algunas');
    _algunas = _protModo == 'algunas' ? pro.split(',').map((x) => x.trim()).where(_piezas.contains).toSet() : {};
  }

  Future<void> _cargarTallas() async {
    try {
      final r = await s.api.getLista('getTallasDisponibles');
      final l = [for (final t in r) '$t']..sort((a, b) => (num.tryParse(a) ?? 0).compareTo(num.tryParse(b) ?? 0));
      if (mounted) setState(() => _tallas = l);
    } catch (_) {}
  }

  String get _protecciones => switch (_protModo) {
    'todas' => 'Sí',
    'algunas' => _piezas.where(_algunas.contains).join(', '),
    _ => 'No',
  };

  bool get _usaClub => _patinesClub || _protecciones != 'No' && _protecciones.isNotEmpty;

  bool get _cambio =>
      (_patinesClub ? 'Sí' : 'No') != (_v(s, 'necesitaPatines') == 'Sí' ? 'Sí' : 'No') ||
      (_patinesClub && _talla != _v(s, 'talla')) ||
      _protecciones != (_v(s, 'necesitaProtecciones').isEmpty ? 'No' : _v(s, 'necesitaProtecciones'));

  Future<void> _guardar() async {
    if (_patinesClub && _talla.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Elige tu talla de patines.')));
      return;
    }
    if (_protModo == 'algunas' && _algunas.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Elige qué protecciones usas del club.')));
      return;
    }
    if (_usaClub && _v(s, 'categoria') == 'Quindes') {
      final si = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Pasas a Mirlxs'),
          content: const Text(
            'Con equipamiento del club pasas a Mirlxs: solo podrás reservar por clase (con su precio), no por mes, '
            'y no vuelves a Quindes hasta tener tu equipamiento completo propio.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Volver')),
            FilledButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('Entendido, guardar')),
          ],
        ),
      );
      if (si != true || !mounted) return;
    }
    setState(() => _guardando = true);
    var bajo = false;
    final ok = await guardarConAviso(context, () async {
      bajo = await s.guardarEquipamiento(patines: _patinesClub ? 'Sí' : 'No', talla: _patinesClub ? _talla : '', protecciones: _protecciones);
    }, ok: 'Equipamiento guardado');
    if (!mounted) return;
    setState(() => _guardando = false);
    if (ok && bajo) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Equipamiento guardado. Ahora estás en Mirlxs.')));
      EquipoRepo.de(s).cargar(forzar: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    Widget titulo(String t) => Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 10),
      child: Text(
        t,
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: p.textoSecundario),
      ),
    );
    final dur = const Duration(milliseconds: 260);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mi equipamiento', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          titulo('PATINES'),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Propios')),
              ButtonSegment(value: true, label: Text('Del club')),
            ],
            selected: {_patinesClub},
            onSelectionChanged: (x) => setState(() => _patinesClub = x.first),
          ),
          AnimatedSize(
            duration: dur,
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: !_patinesClub
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (_tallas.isEmpty) Text('Cargando tallas…', style: TextStyle(color: p.textoSecundario)),
                        for (final t in _tallas) ChoiceChip(label: Text('Talla $t'), selected: _talla == t, onSelected: (_) => setState(() => _talla = t)),
                      ],
                    ),
                  ),
          ),
          const SizedBox(height: 24),
          titulo('PROTECCIONES'),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'propias', label: Text('Propias')),
              ButtonSegment(value: 'todas', label: Text('Del club')),
              ButtonSegment(value: 'algunas', label: Text('Algunas')),
            ],
            selected: {_protModo},
            onSelectionChanged: (x) => setState(() => _protModo = x.first),
          ),
          AnimatedSize(
            duration: dur,
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _protModo != 'algunas'
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('¿Cuáles usas del club?', style: TextStyle(fontSize: 13.5, color: p.textoSecundario)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final x in _piezas)
                              FilterChip(
                                label: Text(x),
                                selected: _algunas.contains(x),
                                onSelected: (si) => setState(() => si ? _algunas.add(x) : _algunas.remove(x)),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
          ),
          const SizedBox(height: 20),
          AnimatedSwitcher(
            duration: dur,
            child: Text(
              key: ValueKey(_usaClub),
              _usaClub
                  ? 'Con equipamiento del club reservas por clase, y el club te lo tiene listo.'
                  : 'Con todo tu equipamiento propio puedes pagar la mensualidad.',
              style: TextStyle(fontSize: 13.5, color: p.textoSecundario),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: _cambio && !_guardando ? _guardar : null,
            child: Text(_guardando ? 'Guardando…' : 'Guardar'),
          ),
        ),
      ),
    );
  }
}

// ─── Contactos de emergencia ─────────────────────────────────────────────

class ContactosScreen extends StatelessWidget {
  const ContactosScreen({super.key, required this.sesion});
  final Sesion sesion;

  static const _relaciones = ['Madre', 'Padre', 'Pareja', 'Hermanx', 'Amistad', 'Familiar'];

  @override
  Widget build(BuildContext context) {
    final s = sesion;
    List<Widget> contacto(BuildContext context, String n) {
      final tel = _v(s, 'emerg${n}Telefono');
      final pre = _v(s, 'emerg${n}Prefijo');
      return [
        FilaAjuste(
          icono: Icons.person_outline_rounded,
          titulo: 'Nombre',
          valor: _v(s, 'emerg${n}Nombre'),
          alTocar: () => _editarCampo(context, s, 'emerg${n}Nombre', 'Nombre del contacto', maxLength: 60, obligatorio: n == '1'),
        ),
        FilaAjuste(
          icono: Icons.diversity_3_outlined,
          titulo: 'Relación',
          valor: _v(s, 'emerg${n}Relacion'),
          alTocar: () => _elegirCampo(context, s, 'emerg${n}Relacion', 'Relación', _relaciones, otro: true),
        ),
        FilaAjuste(
          icono: Icons.phone_outlined,
          titulo: 'Teléfono',
          valor: tel.isEmpty ? '' : '+${pre.isEmpty ? '593' : pre} $tel',
          alTocar: () => _editarTelefono(context, s, 'emerg${n}Prefijo', 'emerg${n}Telefono', 'Teléfono del contacto'),
        ),
      ];
    }

    return _Pantalla(
      sesion: s,
      titulo: 'Contactos de emergencia',
      hijos: (context) => [
        GrupoAjustes(titulo: 'CONTACTO PRINCIPAL', filas: contacto(context, '1')),
        GrupoAjustes(titulo: 'SEGUNDO CONTACTO (OPCIONAL)', filas: contacto(context, '2'), pie: 'Solo admins los ven, y solo en una emergencia.'),
      ],
    );
  }
}

// ─── Ficha de salud ──────────────────────────────────────────────────────

class SaludScreen extends StatelessWidget {
  const SaludScreen({super.key, required this.sesion});
  final Sesion sesion;

  static const _atencion = ['MSP (Ministerio de Salud Pública)', 'IESS', 'Seguro Privado'];
  static const _seguros = ['Saludsa', 'Ecuasanitas', 'Humana', 'BMI del Ecuador', 'Confiamed', 'BUPA Ecuador', 'Pan American Life', 'CruzBlanca'];
  static const _enfermedades = [
    'Diabetes',
    'Hipertensión arterial',
    'Cardiopatía',
    'Epilepsia',
    'Asma',
    'Trastornos de coagulación',
    'Problemas osteomusculares crónicos',
  ];
  static const _antecedentes = ['Cirugías previas', 'Hospitalización en el último año', 'Lesiones deportivas previas'];
  static const _dietas = ['Vegetariano', 'Vegano', 'Pescetariano'];

  @override
  Widget build(BuildContext context) {
    final s = sesion;
    return _Pantalla(
      sesion: s,
      titulo: 'Ficha de salud',
      hijos: (context) {
        final privado = _v(s, 'atencionMedica') == 'Seguro Privado' || _v(s, 'seguro').isNotEmpty;
        final alergias = _v(s, 'alergias');
        return [
          GrupoAjustes(
            titulo: 'ATENCIÓN MÉDICA',
            filas: [
              FilaAjuste(
                icono: Icons.local_hospital_outlined,
                titulo: 'Dónde te atiendes',
                valor: _v(s, 'atencionMedica'),
                alTocar: () => _elegirCampo(context, s, 'atencionMedica', 'Atención médica', _atencion),
              ),
              if (privado) ...[
                FilaAjuste(
                  icono: Icons.health_and_safety_outlined,
                  titulo: 'Seguro privado',
                  valor: _v(s, 'seguro'),
                  alTocar: () => _elegirCampo(context, s, 'seguro', 'Seguro privado', _seguros, otro: true),
                ),
                FilaAjuste(
                  icono: Icons.support_agent_outlined,
                  titulo: 'Contacto del seguro',
                  valor: _v(s, 'seguroContacto'),
                  alTocar: () => _editarCampo(context, s, 'seguroContacto', 'Contacto del seguro', ayuda: 'Teléfono o correo para emergencias.', maxLength: 80),
                ),
              ],
            ],
          ),
          GrupoAjustes(
            titulo: 'SALUD',
            pie: 'Solo admins ven tu ficha, y solo en una emergencia. No se guarda en el teléfono.',
            filas: [
              FilaAjuste(
                icono: Icons.coronavirus_outlined,
                titulo: 'Alergias',
                valor: alergias == 'No' || alergias.isEmpty ? alergias : [alergias, _v(s, 'alergiasDesc')].where((x) => x.isNotEmpty).join(' · '),
                alTocar: () async {
                  final v = await elegirOpciones(context, titulo: 'Alergias', opciones: const ['Sí', 'No', 'Tal vez'], valor: alergias);
                  if (v == null || !context.mounted) return;
                  var desc = v == 'No' ? '' : _v(s, 'alergiasDesc');
                  if (v != 'No') {
                    final d = await editarTexto(context, titulo: '¿A qué?', valor: desc, ayuda: 'Ej: penicilina, mariscos.', maxLength: 200, lineas: 3);
                    if (d == null || !context.mounted) return;
                    desc = d;
                  }
                  await guardarConAviso(context, () => s.guardarDatos({'alergias': v, 'alergiasDesc': desc}));
                },
              ),
              FilaAjuste(
                icono: Icons.medication_outlined,
                titulo: 'Medicamentos',
                valor: _v(s, 'medicamentos') == 'Sí' ? 'Sí · ${_v(s, 'medicamentosDesc')}' : _v(s, 'medicamentos'),
                alTocar: () async {
                  final v = await elegirOpciones(context, titulo: '¿Tomas medicamentos?', opciones: const ['Sí', 'No'], valor: _v(s, 'medicamentos'));
                  if (v == null || !context.mounted) return;
                  var desc = '';
                  if (v == 'Sí') {
                    final d = await editarTexto(
                      context,
                      titulo: '¿Cuáles?',
                      valor: _v(s, 'medicamentosDesc'),
                      ayuda: 'Ej: loratadina 10 mg cada 12 horas.',
                      maxLength: 200,
                      lineas: 3,
                    );
                    if (d == null || !context.mounted) return;
                    desc = d;
                  }
                  await guardarConAviso(context, () => s.guardarDatos({'medicamentos': v, 'medicamentosDesc': desc}));
                },
              ),
              FilaAjuste(
                icono: Icons.monitor_heart_outlined,
                titulo: 'Enfermedades',
                valor: _vacioComo(s, 'enfermedad', 'Ninguna'),
                alTocar: () =>
                    _elegirCampo(context, s, 'enfermedad', 'Enfermedades', _enfermedades, multi: true, otro: true, ayuda: 'Déjalo vacío si no tienes ninguna.'),
              ),
              FilaAjuste(
                icono: Icons.history_rounded,
                titulo: 'Antecedentes',
                valor: _vacioComo(s, 'antecedentes', 'Ninguno'),
                alTocar: () => _elegirCampo(context, s, 'antecedentes', 'Antecedentes médicos', _antecedentes, multi: true, otro: true),
              ),
              FilaAjuste(
                icono: Icons.restaurant_outlined,
                titulo: 'Dieta',
                valor: _vacioComo(s, 'dieta', 'Sin restricciones'),
                alTocar: () => _elegirCampo(context, s, 'dieta', 'Dieta', _dietas, otro: true),
              ),
            ],
          ),
        ];
      },
    );
  }
}

// ─── Identidad y dirección ───────────────────────────────────────────────

class IdentidadScreen extends StatelessWidget {
  const IdentidadScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final s = sesion;
    FilaAjuste fila(BuildContext context, IconData i, String campo, String titulo, {int max = 80, TextInputType teclado = TextInputType.text}) => FilaAjuste(
      icono: i,
      titulo: titulo,
      valor: _v(s, campo),
      alTocar: () => _editarCampo(context, s, campo, titulo, maxLength: max, teclado: teclado),
    );
    return _Pantalla(
      sesion: s,
      titulo: 'Identidad y dirección',
      hijos: (context) => [
        GrupoAjustes(
          titulo: 'IDENTIDAD LEGAL',
          filas: [
            fila(context, Icons.person_outline_rounded, 'nombreLegal', 'Nombre legal', max: 100),
            FilaAjuste(
              icono: Icons.badge_outlined,
              titulo: 'Tipo de documento',
              valor: _v(s, 'tipoDocumento'),
              alTocar: () => _elegirCampo(context, s, 'tipoDocumento', 'Tipo de documento', const ['Cédula', 'DNI', 'Pasaporte'], otro: true),
            ),
            fila(context, Icons.numbers_rounded, 'numeroDocumento', 'Número de documento', max: 30),
            fila(context, Icons.public_rounded, 'paisExpedicion', 'País de expedición', max: 60),
          ],
        ),
        GrupoAjustes(
          titulo: 'DIRECCIÓN',
          pie: 'Solo admins la ven, por si hay que acompañarte o avisar.',
          filas: [
            fila(context, Icons.signpost_outlined, 'callePrincipal', 'Calle principal'),
            fila(context, Icons.alt_route_rounded, 'calleSecundaria', 'Calle secundaria'),
            fila(context, Icons.pin_outlined, 'numeracion', 'Numeración', max: 20),
            fila(context, Icons.location_city_outlined, 'sector', 'Sector o barrio'),
            fila(context, Icons.map_outlined, 'canton', 'Cantón o ciudad'),
          ],
        ),
      ],
    );
  }
}

// ─── Privacidad ──────────────────────────────────────────────────────────

class PrivacidadScreen extends StatelessWidget {
  const PrivacidadScreen({super.key, required this.sesion});
  final Sesion sesion;

  static const edadMinima = 16;

  @override
  Widget build(BuildContext context) {
    final s = sesion;
    return _Pantalla(
      sesion: s,
      titulo: 'Privacidad',
      hijos: (context) {
        final fecha = _v(s, 'fechaNacimiento');
        final cumple = _v(s, 'fechaPublica') == 'Sí';
        final edad = _v(s, 'edadPublica') == 'Sí';
        Future<void> guardar({String? f, bool? c, bool? e}) async {
          final nueva = f ?? fecha;
          if (nueva.isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Primero elige tu fecha de nacimiento.')));
            return;
          }
          await guardarConAviso(context, () => s.guardarPrivacidad(fechaNacimiento: nueva, fechaPublica: c ?? cumple, edadPublica: e ?? edad));
        }

        return [
          GrupoAjustes(
            filas: [
              FilaAjuste(
                icono: Icons.cake_outlined,
                titulo: 'Fecha de nacimiento',
                valor: fechaLarga(fecha),
                alTocar: () async {
                  final hoy = Fechas.hoy();
                  final limite = DateTime(hoy.year - edadMinima, hoy.month, hoy.day);
                  final f = await showDatePicker(
                    context: context,
                    firstDate: DateTime(1940),
                    lastDate: limite,
                    initialDate: Fechas.desdeIso(fecha) ?? DateTime(hoy.year - 25),
                    helpText: 'Tu fecha de nacimiento',
                    initialEntryMode: DatePickerEntryMode.calendarOnly,
                  );
                  if (f != null && context.mounted) await guardar(f: Fechas.iso(f));
                },
              ),
            ],
            pie: 'Debes tener al menos $edadMinima años para usar la app.',
          ),
          GrupoAjustes(
            titulo: 'QUÉ VE EL RESTO DEL EQUIPO',
            filas: [
              FilaAjuste(
                icono: Icons.celebration_outlined,
                titulo: 'Mi cumpleaños',
                valor: 'Aparece en la línea de tiempo y en Equipo',
                derecha: Switch(
                  value: cumple,
                  onChanged: (v) => guardar(c: v),
                ),
              ),
              FilaAjuste(
                icono: Icons.hourglass_empty_rounded,
                titulo: 'Mi edad',
                valor: 'Se muestra junto a tu cumpleaños',
                derecha: Switch(
                  value: edad,
                  onChanged: (v) => guardar(e: v),
                ),
              ),
            ],
          ),
        ];
      },
    );
  }
}

// ─── Excepción de cuota ──────────────────────────────────────────────────

/// Solicitud a admins (web: asistente `wizExc*`): media cuota por ausencias
/// justificadas, o subvención por dificultad económica.
class ExcepcionScreen extends StatefulWidget {
  const ExcepcionScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<ExcepcionScreen> createState() => _ExcepcionScreenState();
}

class _ExcepcionScreenState extends State<ExcepcionScreen> {
  String? _tipo; // 'ausencias' | 'economica'
  final _a = TextEditingController(), _b = TextEditingController();
  String? _nivel;
  bool _acepta = false, _enviando = false;

  static const _niveles = {
    'bajo': ('Bajo', 'No puedo cubrir necesidades básicas como alimentación, alquiler u otros gastos esenciales.'),
    'medio': ('Medio', 'Puedo cubrir lo básico, pero el pago de la cuota supone un esfuerzo económico significativo.'),
    'alto': ('Alto', 'No tengo dificultades para pagar la cuota en las condiciones habituales.'),
  };

  @override
  void dispose() {
    _a.dispose();
    _b.dispose();
    super.dispose();
  }

  bool get _completo => _tipo == 'ausencias'
      ? _a.text.trim().isNotEmpty && _b.text.trim().isNotEmpty
      : _nivel != null && _a.text.trim().isNotEmpty && _b.text.trim().isNotEmpty && _acepta;

  Future<void> _enviar() async {
    setState(() => _enviando = true);
    final datos = _tipo == 'ausencias'
        ? {'motivo': _a.text.trim(), 'justificacion': _b.text.trim()}
        : {'nivelIngreso': _nivel, 'situacionEconomica': _a.text.trim(), 'compromiso': _b.text.trim()};
    final hoy = Fechas.hoy();
    final ok = await guardarConAviso(context, () async {
      final r = await widget.sesion.api.post('solicitarExcepcion', {
        'tipo': _tipo,
        'datos': jsonEncode(datos),
        'mesAplicacion': '${hoy.year}-${hoy.month.toString().padLeft(2, '0')}',
      });
      if (r['exito'] != true) throw ApiException('${r['error'] ?? 'No se pudo enviar la solicitud.'}');
    }, ok: 'Solicitud enviada. Admins la revisarán pronto.');
    if (!mounted) return;
    setState(() => _enviando = false);
    if (ok) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final dur = const Duration(milliseconds: 280);
    Widget campo(TextEditingController c, String etiqueta, String ayuda) => Padding(
      padding: const EdgeInsets.only(top: 14),
      child: TextField(
        controller: c,
        minLines: 3,
        maxLines: 6,
        maxLength: 600,
        onChanged: (_) => setState(() {}),
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(labelText: etiqueta, hintText: ayuda, alignLabelWithHint: true),
      ),
    );
    Widget opcion(String tipo, IconData icono, String titulo, String texto) {
      final sel = _tipo == tipo;
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: AnimatedContainer(
          duration: dur,
          decoration: BoxDecoration(color: sel ? p.suave : p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: InkWell(
            borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
            onTap: () => setState(() {
              if (_tipo != tipo) {
                _a.clear();
                _b.clear();
              }
              _tipo = tipo;
            }),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(icono, color: sel ? p.sobreSuave : p.marcaTexto),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          titulo,
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, color: sel ? p.sobreSuave : p.texto),
                        ),
                        const SizedBox(height: 2),
                        Text(texto, style: TextStyle(fontSize: 13.5, color: sel ? p.sobreSuave : p.textoSecundario)),
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Excepción de cuota', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          opcion('ausencias', Icons.event_busy_outlined, 'Ausencias justificadas', 'Pagarás media cuota si se acepta tu solicitud.'),
          opcion('economica', Icons.volunteer_activism_outlined, 'Dificultad económica', 'Pide una subvención parcial o completa.'),
          AnimatedSize(
            duration: dur,
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: AnimatedSwitcher(
              duration: dur,
              child: switch (_tipo) {
                'ausencias' => Column(
                  key: const ValueKey('a'),
                  children: [
                    campo(_a, 'Motivo de las ausencias', 'Describe brevemente el motivo.'),
                    campo(_b, 'Justificación para media cuota', 'Explica por qué corresponde media cuota.'),
                  ],
                ),
                'economica' => Column(
                  key: const ValueKey('e'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 12),
                    Text(
                      'Nivel de ingreso',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: p.textoSecundario),
                    ),
                    const SizedBox(height: 6),
                    RadioGroup<String>(
                      groupValue: _nivel,
                      onChanged: (v) => setState(() => _nivel = v),
                      child: Column(
                        children: [
                          for (final e in _niveles.entries)
                            RadioListTile<String>(
                              value: e.key,
                              contentPadding: EdgeInsets.zero,
                              title: Text(e.value.$1, style: const TextStyle(fontWeight: FontWeight.w700)),
                              subtitle: Text(e.value.$2),
                            ),
                        ],
                      ),
                    ),
                    campo(_a, 'Tu situación económica', 'Tipo de ingreso, situación laboral, cargas. Es confidencial.'),
                    campo(_b, 'Cómo puedes aportar al equipo', 'Tareas concretas: redes, fotos, logística, coordinación…'),
                    CheckboxListTile(
                      value: _acepta,
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      onChanged: (v) => setState(() => _acepta = v ?? false),
                      title: const Text('Entiendo que no cumplir el compromiso puede tener las sanciones que defina la organización.'),
                    ),
                  ],
                ),
                _ => const SizedBox(width: double.infinity, key: ValueKey('nada')),
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: _tipo != null && _completo && !_enviando ? _enviar : null,
            child: Text(_enviando ? 'Enviando…' : 'Enviar solicitud'),
          ),
        ),
      ),
    );
  }
}
