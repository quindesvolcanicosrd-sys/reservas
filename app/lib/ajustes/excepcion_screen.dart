import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/asistente.dart';
import '../core/fechas.dart';
import '../core/tema.dart';
import '../eventos/widgets_comunes.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';
import '../core/cargando.dart';

/// Excepción de cuota en pasos (`Asistente`, como Eventos). Textos y flujo de
/// Victor (2026-11-08):
/// - Ausencias: tipo → qué pasó (+ quién la lee) → revisar.
/// - Económica: tipo → ingresos → cuéntanos más (+ quién la lee) → cómo
///   aportar (tomar tareas libres o crear una propia con fecha) → revisar.
/// Quien la pide elige qué administradorxs la leen (por defecto, todxs). Las
/// tareas se toman o crean recién al enviar.
class ExcepcionScreen extends StatefulWidget {
  const ExcepcionScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<ExcepcionScreen> createState() => _ExcepcionScreenState();
}

enum _Paso { tipo, nivel, detalle, aportar, revisar }

/// Tarea nueva que la persona se asigna (se crea al enviar).
class _TareaNueva {
  _TareaNueva(this.titulo, this.area, this.fecha);
  final String titulo;
  final String area;
  final DateTime fecha;
}

class _ExcepcionScreenState extends State<ExcepcionScreen> {
  _Paso _paso = _Paso.tipo;
  bool _adelante = true;
  String? _tipo; // 'ausencias' | 'economica'
  String? _nivel;
  final _texto = TextEditingController();
  bool _enviando = false;

  List<Map<String, dynamic>>? _admins; // {username, nombre, foto}
  final Set<String> _elegidos = {};
  List<Map<String, dynamic>>? _libres; // tareas disponibles
  final Set<String> _tomadas = {};
  final List<_TareaNueva> _nuevas = [];

  Sesion get s => widget.sesion;

  static const _niveles = {
    'bajo': ('Bajos', 'No puedo cubrir necesidades básicas como alimentación, alquiler u otros gastos esenciales.'),
    'medio': ('Medios', 'Puedo cubrir lo básico, pero pagar la cuota supone un esfuerzo económico significativo.'),
    'alto': ('Altos', 'No tengo dificultades para pagar la cuota en las condiciones habituales.'),
  };
  static const _areas = ['Logística', 'Organización', 'Redes Sociales y Comunicación', 'Entrenamientos', 'Mantenimiento', 'Recaudación', 'Otro'];

  @override
  void initState() {
    super.initState();
    _cargarAdmins();
  }

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  Future<void> _cargarAdmins() async {
    try {
      final r = await s.api.get('getAdministradorxs');
      final yo = (s.nombre ?? '').toLowerCase();
      final l = [
        for (final a in (r['admins'] as List? ?? const []))
          if (a is Map<String, dynamic> && '${a['username']}'.toLowerCase() != yo) a,
      ];
      if (mounted) {
        setState(() {
          _admins = l;
          _elegidos
            ..clear()
            ..addAll(l.map((a) => '${a['username']}'));
        });
      }
    } catch (_) {
      if (mounted) setState(() => _admins = const []);
    }
  }

  Future<void> _cargarTareas() async {
    if (_libres != null) return;
    try {
      final r = await s.api.get('getTareasDisponibles');
      if (mounted) {
        setState(
          () => _libres = [
            for (final t in (r['disponibles'] as List? ?? const []))
              if (t is Map<String, dynamic>) t,
          ],
        );
      }
    } catch (_) {
      if (mounted) setState(() => _libres = const []);
    }
  }

  List<_Paso> get _pasos => _tipo == 'economica' ? _Paso.values : const [_Paso.tipo, _Paso.detalle, _Paso.revisar];

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
    if (_paso == _Paso.aportar) _cargarTareas();
  }

  void _irA(_Paso p) {
    FocusScope.of(context).unfocus();
    setState(() {
      _adelante = false;
      _paso = p;
    });
  }

  void _elegirYSeguir(VoidCallback cambio) {
    setState(cambio);
    Future.delayed(const Duration(milliseconds: 180), () {
      if (mounted) _ir(1);
    });
  }

  bool get _pasoListo => switch (_paso) {
    _Paso.tipo => _tipo != null,
    _Paso.nivel => _nivel != null,
    _Paso.detalle => _texto.text.trim().length >= 10 && ((_admins?.isEmpty ?? true) || _elegidos.isNotEmpty),
    _Paso.aportar => _tomadas.isNotEmpty || _nuevas.isNotEmpty,
    _Paso.revisar => true,
  };

  String get _compromiso => [
    for (final t in _libres ?? const <Map<String, dynamic>>[])
      if (_tomadas.contains('${t['idTarea']}')) 'Tarea tomada: ${t['titulo']}',
    for (final t in _nuevas) 'Tarea nueva: ${t.titulo} (${t.area}, hasta el ${Fechas.corta(t.fecha)})',
  ].join('\n');

  Future<void> _enviar() async {
    setState(() => _enviando = true);
    final hoy = Fechas.hoy();
    final datos = _tipo == 'ausencias'
        ? {'motivo': _texto.text.trim()}
        : {'nivelIngreso': _nivel, 'situacionEconomica': _texto.text.trim(), 'compromiso': _compromiso};
    final todos = (_admins ?? const []).length == _elegidos.length;
    final ok = await guardarConAviso(context, () async {
      final r = await s.api.post('solicitarExcepcion', {
        'tipo': _tipo,
        'datos': jsonEncode(datos),
        'mesAplicacion': '${hoy.year}-${hoy.month.toString().padLeft(2, '0')}',
        'adminsDestino': jsonEncode(todos ? const <String>[] : _elegidos.toList()),
      });
      if (r['exito'] != true) throw ApiException('${r['error'] ?? 'No se pudo enviar la solicitud.'}');
      // Compromiso: tomar las tareas elegidas y crear las nuevas.
      for (final id in _tomadas) {
        await s.api.post('tomarTarea', {'nombre': s.nombre, 'idTarea': id});
      }
      for (final t in _nuevas) {
        await s.api.post('crearTareaPropia', {'titulo': t.titulo, 'area': t.area, 'fechaVencimiento': Fechas.iso(t.fecha)});
      }
    }, ok: 'Solicitud enviada. Te avisaremos cuando la revisen.');
    if (!mounted) return;
    setState(() => _enviando = false);
    if (ok) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final pasos = _pasos;
    final economica = _tipo == 'economica';
    return Asistente(
      titulo: 'Excepción de cuota',
      indice: pasos.indexOf(_paso),
      total: pasos.length,
      clavePaso: _paso,
      adelante: _adelante,
      alAtras: () => _ir(-1),
      tituloPaso: switch (_paso) {
        _Paso.tipo => 'Tipo de solicitud',
        _Paso.nivel => '¿Cómo están tus ingresos?',
        _Paso.detalle => economica ? 'Cuéntanos más' : 'Cuéntanos qué pasó',
        _Paso.aportar => '¿Cómo puedes aportar?',
        _Paso.revisar => 'Revisa y envía',
      },
      ayuda: switch (_paso) {
        _Paso.tipo => 'Selecciona una opción. Luego será revisada y aprobada.',
        _Paso.nivel => 'Elige la opción que mejor te describe.',
        _Paso.detalle => economica ? 'Tu situación: tipo de ingreso, trabajo, personas a tu cargo.' : 'Describe detalladamente.',
        _Paso.aportar => 'Toma tareas libres del equipo o crea la tuya, con fecha límite. Quedan asignadas al enviar.',
        _Paso.revisar => null,
      },
      cuerpo: switch (_paso) {
        _Paso.tipo => _pasoTipo(),
        _Paso.nivel => _pasoNivel(),
        _Paso.detalle => _pasoDetalle(),
        _Paso.aportar => _pasoAportar(),
        _Paso.revisar => _pasoRevisar(),
      },
      textoBoton: switch (_paso) {
        _Paso.tipo || _Paso.nivel => _pasoListo ? 'Siguiente' : null,
        _Paso.revisar => 'Enviar solicitud',
        _ => 'Siguiente',
      },
      alContinuar: _paso == _Paso.revisar ? (_enviando ? null : _enviar) : (_pasoListo ? () => _ir(1) : null),
      ocupado: _enviando,
    );
  }

  Widget _pasoTipo() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      OpcionAsistente(
        icono: Icons.event_busy_outlined,
        titulo: 'Ausencias justificadas',
        texto: 'Al enviar esta solicitud aplicas al pago de media cuota.',
        activa: _tipo == 'ausencias',
        alTocar: () => _elegirYSeguir(() {
          if (_tipo != 'ausencias') _limpiar();
          _tipo = 'ausencias';
        }),
      ),
      OpcionAsistente(
        icono: Icons.volunteer_activism_outlined,
        titulo: 'Dificultades económicas',
        texto: 'Aplica a una subvención parcial o completa según tu situación económica.',
        activa: _tipo == 'economica',
        alTocar: () => _elegirYSeguir(() {
          if (_tipo != 'economica') _limpiar();
          _tipo = 'economica';
        }),
      ),
    ],
  );

  void _limpiar() {
    _texto.clear();
    _nivel = null;
    _tomadas.clear();
    _nuevas.clear();
  }

  Widget _pasoNivel() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      for (final e in _niveles.entries)
        OpcionAsistente(
          icono: switch (e.key) {
            'bajo' => Icons.trending_down_rounded,
            'medio' => Icons.trending_flat_rounded,
            _ => Icons.trending_up_rounded,
          },
          titulo: e.value.$1,
          texto: e.value.$2,
          activa: _nivel == e.key,
          alTocar: () => _elegirYSeguir(() => _nivel = e.key),
        ),
    ],
  );

  Widget _pasoDetalle() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      TextField(
        controller: _texto,
        minLines: 5,
        maxLines: 10,
        maxLength: 800,
        onChanged: (_) => setState(() {}),
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(
          hintText: _tipo == 'ausencias'
              ? 'Ej: estuve de viaje por trabajo del 3 al 20 de noviembre y no pude ir a los entrenamientos.'
              : 'Ej: me quedé sin trabajo en octubre y comparto los gastos de la casa con mi familia.',
          alignLabelWithHint: true,
        ),
      ),
      const SizedBox(height: 6),
      _SelectorAdmins(admins: _admins, elegidos: _elegidos, alCambiar: () => setState(() {})),
    ],
  );

  Widget _pasoAportar() {
    final p = context.pivot;
    final libres = _libres;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Tareas propias nuevas.
        for (final (i, t) in _nuevas.indexed)
          _TarjetaTarea(
            titulo: t.titulo,
            detalle: '${t.area} · hasta el ${Fechas.corta(t.fecha)}',
            elegida: true,
            nueva: true,
            alTocar: () => setState(() => _nuevas.removeAt(i)),
          ),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: _crearTarea,
          icon: const Icon(Icons.add_task_rounded),
          label: const Text('Crear una tarea nueva'),
        ),
        const SizedBox(height: 20),
        Text(
          'Tareas libres del equipo',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.texto),
        ),
        const SizedBox(height: 10),
        if (libres == null)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: PivotCargando()),
          ),
        if (libres != null && libres.isEmpty) Text('Ahora no hay tareas libres: crea la tuya.', style: TextStyle(color: p.textoSecundario)),
        for (final t in libres ?? const <Map<String, dynamic>>[])
          _TarjetaTarea(
            titulo: '${t['titulo'] ?? ''}',
            detalle: [
              '${t['area'] ?? ''}',
              if (t['fechaVencimiento'] != null) 'hasta el ${Fechas.corta(Fechas.desdeIso(t['fechaVencimiento']) ?? Fechas.hoy())}',
              if ((t['puntos'] as num? ?? 0) > 0) '${t['puntos']} pts',
            ].where((x) => x.isNotEmpty).join(' · '),
            elegida: _tomadas.contains('${t['idTarea']}'),
            alTocar: () => setState(() {
              final id = '${t['idTarea']}';
              _tomadas.contains(id) ? _tomadas.remove(id) : _tomadas.add(id);
            }),
          ),
        const SizedBox(height: 8),
        const AvisoPrivado(texto: 'Si no cumples el compromiso, la organización puede aplicar las sanciones que haya definido.'),
      ],
    );
  }

  Future<void> _crearTarea() async {
    final t = await showModalBottomSheet<_TareaNueva>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => const _HojaTareaNueva(areas: _areas),
    );
    if (t != null) setState(() => _nuevas.add(t));
  }

  Widget _pasoRevisar() {
    final p = context.pivot;
    final ausencias = _tipo == 'ausencias';
    final todos = (_admins ?? const []).length == _elegidos.length;
    final nombres = [
      for (final a in _admins ?? const <Map<String, dynamic>>[])
        if (_elegidos.contains('${a['username']}')) '${a['nombre']}',
    ];
    Widget fila(String etiqueta, String valor, {VoidCallback? cambiar}) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  etiqueta,
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: p.textoSecundario),
                ),
                const SizedBox(height: 3),
                Text(valor, style: TextStyle(fontSize: 15, color: p.texto)),
              ],
            ),
          ),
          if (cambiar != null) TextButton(onPressed: cambiar, child: const Text('Cambiar')),
        ],
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 16, 8, 2),
          decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              fila('Tipo', ausencias ? 'Ausencias justificadas (media cuota)' : 'Dificultades económicas (subvención)'),
              if (!ausencias) fila('Ingresos', _niveles[_nivel]?.$1 ?? ''),
              fila(ausencias ? 'Qué pasó' : 'Tu situación', _texto.text.trim()),
              if (!ausencias) fila('Tu aporte', _compromiso, cambiar: () => _irA(_Paso.aportar)),
              fila('Mes', Fechas.mesAnio(Fechas.hoy())),
              fila('La leen y aprueban', todos ? 'Todxs lxs administradorxs' : nombres.join(', '), cambiar: () => _irA(_Paso.detalle)),
            ],
          ),
        ),
        const SizedBox(height: 14),
        AvisoPrivado(
          texto: ausencias
              ? 'Solo lxs administradorxs que elegiste podrán leer y aprobar tu solicitud. Recibirás una notificación con la '
                    'respuesta. Si se aprueba, se aplica automáticamente un descuento del 50 % en la cuota de este mes. Si lo necesitas otro mes, '
                    'envía una nueva solicitud por cada mes.'
              : 'Solo lxs administradorxs que elegiste podrán leer y aprobar tu solicitud. Recibirás una notificación con la '
                    'respuesta. Si se aprueba, la subvención se aplica a la cuota de este mes. Si lo necesitas otro mes, envía una nueva solicitud '
                    'por cada mes.',
        ),
      ],
    );
  }
}

/// Lista de administradorxs para elegir quién lee la solicitud (por defecto,
/// todxs). Si nadie queda elegido, no se puede seguir.
class _SelectorAdmins extends StatelessWidget {
  const _SelectorAdmins({required this.admins, required this.elegidos, required this.alCambiar});
  final List<Map<String, dynamic>>? admins;
  final Set<String> elegidos;
  final VoidCallback alCambiar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final l = admins;
    if (l == null) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: Center(child: PivotCargando()),
      );
    }
    if (l.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '¿Quiénes pueden leerla y aprobarla?',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.texto),
        ),
        const SizedBox(height: 8),
        // Un solo recuadro (Victor, 2026-11-08): el aviso de confidencialidad
        // y la lista de administradorxs juntos.
        Material(
          color: p.tarjeta,
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              Container(
                color: p.suave,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.lock_rounded, size: 18, color: p.sobreSuave),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Esta información es confidencial. Solo lxs administradorxs que elijas podrán leer y aprobar tu solicitud.',
                        style: TextStyle(fontSize: 13.5, height: 1.35, color: p.sobreSuave),
                      ),
                    ),
                  ],
                ),
              ),

              for (final a in l)
                CheckboxListTile(
                  value: elegidos.contains('${a['username']}'),
                  onChanged: (v) {
                    v == true ? elegidos.add('${a['username']}') : elegidos.remove('${a['username']}');
                    alCambiar();
                  },
                  secondary: AvatarPersona(nombre: '${a['nombre']}', foto: '${a['foto'] ?? ''}', tamano: 36),
                  title: Text('${a['nombre']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
            ],
          ),
        ),
        if (elegidos.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Elige al menos una persona.',
              style: TextStyle(color: p.marcaTexto, fontWeight: FontWeight.w600),
            ),
          ),
      ],
    );
  }
}

class _TarjetaTarea extends StatelessWidget {
  const _TarjetaTarea({required this.titulo, required this.detalle, required this.elegida, required this.alTocar, this.nueva = false});
  final String titulo;
  final String detalle;
  final bool elegida;
  final bool nueva;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        decoration: BoxDecoration(color: elegida ? p.suave : p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
        child: InkWell(
          borderRadius: BorderRadius.circular(PivotRadios.tarjeta),
          onTap: alTocar,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(
                  nueva ? Icons.edit_note_rounded : (elegida ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded),
                  color: elegida ? p.sobreSuave : p.textoSecundario,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titulo,
                        style: TextStyle(fontWeight: FontWeight.w700, color: elegida ? p.sobreSuave : p.texto),
                      ),
                      if (detalle.isNotEmpty) Text(detalle, style: TextStyle(fontSize: 12.5, color: elegida ? p.sobreSuave : p.textoSecundario)),
                    ],
                  ),
                ),
                if (nueva) Icon(Icons.close_rounded, size: 20, color: p.sobreSuave),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Tarea propia: título, área y fecha límite.
class _HojaTareaNueva extends StatefulWidget {
  const _HojaTareaNueva({required this.areas});
  final List<String> areas;

  @override
  State<_HojaTareaNueva> createState() => _HojaTareaNuevaState();
}

class _HojaTareaNuevaState extends State<_HojaTareaNueva> {
  final _titulo = TextEditingController();
  String _area = 'Logística';
  DateTime? _fecha;

  @override
  void dispose() {
    _titulo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final listo = _titulo.text.trim().length >= 3 && _fecha != null;
    return HojaBase(
      titulo: 'Tarea nueva',
      ayuda: 'Queda asignada a ti al enviar la solicitud.',
      accion: ('Agregar', listo ? () => Navigator.of(context).pop(_TareaNueva(_titulo.text.trim(), _area, _fecha!)) : null),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _titulo,
            autofocus: true,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Qué vas a hacer', hintText: 'Ej: diseñar los posts del torneo'),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [for (final a in widget.areas) ChoiceChip(label: Text(a), selected: _area == a, onSelected: (_) => setState(() => _area = a))],
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: () async {
              final hoy = Fechas.hoy();
              final f = await showDatePicker(
                context: context,
                firstDate: hoy,
                lastDate: hoy.add(const Duration(days: 120)),
                initialDate: _fecha ?? hoy.add(const Duration(days: 14)),
                helpText: 'Fecha límite',
              );
              if (f != null) setState(() => _fecha = f);
            },
            icon: const Icon(Icons.event_outlined),
            label: Text(_fecha == null ? 'Elegir fecha límite' : 'Hasta el ${Fechas.corta(_fecha!)}'),
          ),
        ],
      ),
    );
  }
}
