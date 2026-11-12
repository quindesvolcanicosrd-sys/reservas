import 'package:flutter/material.dart';

import '../core/paises.dart';
import '../core/tema.dart';
import '../equipo/equipo_repo.dart';
import '../sesion/sesion.dart';
import 'ajustes_screen.dart';
import 'campos.dart';
import 'componentes.dart';

// ─── Mis datos ───────────────────────────────────────────────────────────

/// Lo que ve el resto del equipo, editable desde tu propia ficha en Equipo
/// (como en la web; Victor, 2026-11-07). Incluye Mi equipamiento.
class MiPerfilEditable extends StatelessWidget {
  const MiPerfilEditable({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final equipo = EquipoRepo.de(sesion);
    final s = sesion;
    return ListenableBuilder(
      listenable: s,
      builder: (context, _) {
        final tel = valorDe(s, 'telefono');
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GrupoAjustes(
              titulo: 'MI FICHA',
              filas: [
                FilaAjuste(
                  icono: Icons.add_a_photo_outlined,
                  seccion: 'foto',
                  titulo: 'Foto de perfil',
                  valor: s.fotoPerfil.isEmpty ? '' : 'Cambiar o quitar',
                  alTocar: () => cambiarFoto(context, s),
                ),

                FilaAjuste(
                  icono: Icons.sports_rounded,
                  seccion: 'nombre',
                  titulo: 'Nombre derby',
                  valor: valorDe(s, 'nombreDerby'),
                  alTocar: () => editarCampo(context, s, 'nombreDerby', 'Nombre derby', maxLength: 40),
                ),
                FilaAjuste(
                  icono: Icons.tag_rounded,
                  seccion: 'numero',
                  titulo: 'Número derby',
                  valor: valorDe(s, 'numeroDerby'),
                  alTocar: () => editarCampo(context, s, 'numeroDerby', 'Número derby', maxLength: 4),
                ),
                FilaAjuste(
                  icono: Icons.record_voice_over_outlined,
                  seccion: 'pronombres',
                  titulo: 'Pronombres',
                  valor: valorDe(s, 'pronombres'),
                  alTocar: () =>
                      elegirCampo(context, s, 'pronombres', 'Pronombres', const ['Ella', 'Él', 'Elle'], multi: true, ayuda: 'Elige todos los que apliquen.'),
                ),
                ListenableBuilder(
                  listenable: equipo,
                  builder: (context, _) {
                    final roles = equipo.persona(s.nombre ?? '')?.roles ?? const <String>[];
                    return FilaAjuste(
                      icono: Icons.shield_outlined,
                      seccion: 'roles',
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
                        final ok = await guardarCampos(context, s, {'roles': v});
                        if (ok) await equipo.cargar(forzar: true);
                      },
                    );
                  },
                ),
                FilaAjuste(
                  icono: Icons.phone_outlined,
                  seccion: 'telefono',
                  titulo: 'Teléfono',
                  valor: Paises.telefono(valorDe(s, 'prefijo'), tel),
                  alTocar: () => editarTelefono(context, s, 'prefijo', 'telefono', 'Teléfono'),
                ),
                FilaAjuste(
                  icono: Icons.event_outlined,
                  seccion: 'ingreso',
                  titulo: 'Entraste al equipo',
                  valor: fechaLarga(s.datos['fechaIngreso']),
                  alTocar: () => elegirFechaCampo(context, s, 'fechaIngreso', ayuda: 'Cuándo entraste al equipo', desde: DateTime(2010)),
                ),
              ],
            ),
          ],
        );
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
    _patinesClub = valorDe(s, 'necesitaPatines') == 'Sí';
    _talla = valorDe(s, 'talla');
    final pro = valorDe(s, 'necesitaProtecciones');
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
      (_patinesClub ? 'Sí' : 'No') != (valorDe(s, 'necesitaPatines') == 'Sí' ? 'Sí' : 'No') ||
      (_patinesClub && _talla != valorDe(s, 'talla')) ||
      _protecciones != (valorDe(s, 'necesitaProtecciones').isEmpty ? 'No' : valorDe(s, 'necesitaProtecciones'));

  Future<void> _guardar() async {
    if (_patinesClub && _talla.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Elige tu talla de patines.')));
      return;
    }
    if (_protModo == 'algunas' && _algunas.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Elige qué protecciones usas del club.')));
      return;
    }
    if (_usaClub && valorDe(s, 'categoria') == 'Quindes') {
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
