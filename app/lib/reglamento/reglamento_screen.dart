import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../ajustes/componentes.dart' show SubAjustes;
import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'reglamento_datos.dart';
import 'reglamento_texto.dart';

/// Reglamento de roller derby en Progreso (Victor, 2026-11-28): buscador,
/// accesos rápidos, las partes del documento, glosario, faltas con su señal,
/// libro de casos y un modo para ponerse a prueba. Solo en ligas de roller
/// derby. El texto del documento queda tal como lo escribió Victor.

/// Abre un enlace interno del reglamento.
void abrirEnlaceReglamento(BuildContext context, Sesion s, String enlace) {
  final r = ReglamentoRepo.datos.value;
  if (r == null) return;
  if (enlace.startsWith('pivot:s/')) {
    final id = enlace.substring(8);
    if (r.secciones.containsKey(id)) SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: s, id: id));
  } else if (enlace.startsWith('pivot:p/')) {
    final p = r.parte(enlace.substring(8));
    if (p != null) abrirParte(context, s, p);
  }
}

void abrirParte(BuildContext context, Sesion s, ParteReglamento p) {
  final pantalla = switch (p.id) {
    'glosario' => GlosarioScreen(sesion: s),
    'casos' => CasosIndiceScreen(sesion: s),
    _ => ParteReglamentoScreen(sesion: s, parte: p),
  };
  SubAjustes.abrir(context, pantalla);
}

const _iconos = <String, IconData>{
  'reglas': Icons.menu_book_rounded,
  'casos': Icons.lightbulb_rounded,
  'senales': Icons.front_hand_rounded,
  'procedimientos': Icons.rule_rounded,
  'riesgos': Icons.health_and_safety_rounded,
  'nso': Icons.school_rounded,
  'glosario': Icons.sort_by_alpha_rounded,
};

const _orden = ['reglas', 'casos', 'senales', 'glosario', 'procedimientos', 'nso', 'riesgos'];

String _nombreParte(ParteReglamento p) => switch (p.id) {
  'senales' => 'Faltas, señales y códigos',
  _ => p.titulo,
};

String? _paraQuien(String parte) => switch (parte) {
  'senales' || 'procedimientos' => 'Para oficiales',
  'nso' => 'Para NSO',
  'riesgos' => 'Para organizar',
  _ => null,
};

/// Tarjeta llamativa en Progreso.
class TarjetaReglamento extends StatelessWidget {
  const TarjetaReglamento({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    ReglamentoRepo.cargar(sesion);
    const blanco = PivotPaleta.sobreSeccion;
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 4),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: const BoxDecoration(gradient: PivotPaleta.degradadoNoche),
          child: InkWell(
            onTap: () => SubAjustes.abrir(context, ReglamentoScreen(sesion: sesion)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 12, 16),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(color: PivotPaleta.sobreNoche.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
                    child: const Icon(Icons.menu_book_rounded, color: PivotPaleta.estrella, size: 28),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Reglamento',
                          style: TextStyle(color: blanco, fontSize: 18, fontWeight: FontWeight.w800),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Reglas, faltas y señales, libro de casos y glosario. Busca una duda o ponte a prueba.',
                          style: TextStyle(color: PivotPaleta.sobreNocheSecundario, fontSize: 13.5, height: 1.3),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: PivotPaleta.sobreNoche),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Envoltorio: espera los datos y muestra un cargando sencillo.
class _ConDatos extends StatelessWidget {
  const _ConDatos({required this.builder});
  final Widget Function(BuildContext, Reglamento) builder;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Reglamento?>(
      valueListenable: ReglamentoRepo.datos,
      builder: (context, r, _) => AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: r == null ? const Center(child: CircularProgressIndicator()) : KeyedSubtree(key: ValueKey(r.version), child: builder(context, r)),
      ),
    );
  }
}

class ReglamentoScreen extends StatefulWidget {
  const ReglamentoScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<ReglamentoScreen> createState() => _ReglamentoScreenState();
}

class _ReglamentoScreenState extends State<ReglamentoScreen> {
  final _buscar = TextEditingController();
  Timer? _espera;
  String _consulta = '';

  @override
  void initState() {
    super.initState();
    ReglamentoRepo.cargar(widget.sesion);
    ReglamentoRepo.cargarLocal();
  }

  @override
  void dispose() {
    _espera?.cancel();
    _buscar.dispose();
    super.dispose();
  }

  void _alEscribir(String v) {
    _espera?.cancel();
    _espera = Timer(const Duration(milliseconds: 220), () {
      if (mounted) setState(() => _consulta = v.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reglamento', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _ConDatos(
        builder: (context, r) => ListView(
          padding: EdgeInsets.fromLTRB(16, 4, 16, 32 + MediaQuery.paddingOf(context).bottom),
          children: [
            TextField(
              controller: _buscar,
              onChanged: _alEscribir,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Busca o pregunta: «¿puedo bloquear con el codo?»',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _consulta.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Borrar',
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () {
                          _buscar.clear();
                          setState(() => _consulta = '');
                        },
                      ),
              ),
            ),
            const SizedBox(height: 12),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: _consulta.isEmpty
                  ? KeyedSubtree(key: const ValueKey('inicio'), child: _inicio(context, r, p))
                  : KeyedSubtree(
                      key: ValueKey('b$_consulta'),
                      child: ResultadosReglamento(sesion: widget.sesion, consulta: _consulta),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inicio(BuildContext context, Reglamento r, PivotPaleta p) {
    final s = widget.sesion;
    final rapidos = <(String, IconData, VoidCallback)>[
      if (r.secciones.containsKey('reglas:resumen'))
        ('Lo esencial', Icons.bolt_rounded, () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: s, id: 'reglas:resumen'))),
      ('Faltas y señales', Icons.front_hand_rounded, () => SubAjustes.abrir(context, FaltasScreen(sesion: s))),
      for (final (num, nombre, icono) in const [
        ('2.2.2', 'Jammer líder', Icons.star_rounded),
        ('2.3', 'El pack', Icons.groups_rounded),
        ('3', 'Puntuación', Icons.scoreboard_rounded),
        ('1.1', 'Tiempos', Icons.timer_rounded),
      ])
        if (r.secciones.containsKey('reglas:$num')) (nombre, icono, () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: s, id: 'reglas:$num'))),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ValueListenableBuilder<String?>(
          valueListenable: ReglamentoRepo.avisoWftda,
          builder: (context, fecha, _) => AnimatedSize(
            duration: const Duration(milliseconds: 250),
            child: fecha == null ? const SizedBox(width: double.infinity) : _avisoWftda(context, fecha, p),
          ),
        ),
        ValueListenableBuilder<String?>(
          valueListenable: ReglamentoRepo.ultima,
          builder: (context, id, _) {
            final sec = id == null ? null : r.secciones[id];
            if (sec == null) return const SizedBox.shrink();
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: Icon(Icons.bookmark_rounded, color: p.marcaTexto),
                title: const Text('Seguir leyendo', style: TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(sec.completo, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: s, id: sec.id)),
              ),
            );
          },
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (t, i, f) in rapidos)
              ActionChip(
                avatar: Icon(i, size: 18, color: p.marcaTexto),
                label: Text(t),
                onPressed: f,
              ),
          ],
        ),
        const SizedBox(height: 14),
        _tarjetaAprender(context, r),
        const SizedBox(height: 18),
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 8),
          child: Text(
            'TODO EL REGLAMENTO',
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
          ),
        ),
        for (final id in _orden)
          if (r.parte(id) case final parte?) _tarjetaParte(context, r, parte, p),
        ValueListenableBuilder<List<String>>(
          valueListenable: ReglamentoRepo.favoritos,
          builder: (context, favs, _) {
            final lista = [for (final id in favs) ?r.secciones[id]];
            if (lista.isEmpty) return const SizedBox.shrink();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 18, 2, 8),
                  child: Text(
                    'GUARDADAS',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
                  ),
                ),
                Card(
                  child: Column(
                    children: [
                      for (final sec in lista)
                        ListTile(
                          leading: Icon(Icons.bookmark_rounded, color: p.marcaTexto),
                          title: Text(sec.completo),
                          subtitle: Text(_nombreParte(r.parte(sec.parte)!)),
                          onTap: () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: s, id: sec.id)),
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 18),
        for (final c in r.creditos)
          Text(
            c,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: p.textoSecundario),
          ),
      ],
    );
  }

  Widget _avisoWftda(BuildContext context, String fecha, PivotPaleta p) {
    final s = widget.sesion;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: p.suave,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'WFTDA actualizó las reglas',
              style: TextStyle(fontWeight: FontWeight.w800, color: p.sobreSuave, fontSize: 16),
            ),
            const SizedBox(height: 4),
            Text(
              'Pivot notó un cambio en los PDF oficiales el $fecha. Revisa qué cambió y actualiza tu documento; la app lo toma sola al día siguiente.',
              style: TextStyle(color: p.sobreSuave),
            ),
            Wrap(
              alignment: WrapAlignment.end,
              children: [
                TextButton(onPressed: () => ReglamentoRepo.marcarVisto(s), child: const Text('Ya lo revisé')),
                TextButton(
                  onPressed: () async {
                    final m = ScaffoldMessenger.of(context);
                    final txt = await ReglamentoRepo.actualizarAhora(s);
                    m.showSnackBar(SnackBar(content: Text(txt)));
                  },
                  child: const Text('Leer el documento ahora'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _tarjetaAprender(BuildContext context, Reglamento r) {
    const blanco = PivotPaleta.sobreSeccion;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: Ink(
        decoration: const BoxDecoration(gradient: PivotPaleta.degradadoMarca),
        child: InkWell(
          onTap: () => SubAjustes.abrir(context, AprenderReglamentoScreen(sesion: widget.sesion)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.quiz_rounded, color: blanco, size: 30),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Ponte a prueba',
                        style: TextStyle(color: blanco, fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      Text(
                        '${r.casos.length} escenarios reales del libro de casos: ¿hay falta o no?',
                        style: TextStyle(color: blanco.withValues(alpha: 0.88), fontSize: 13.5),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: blanco),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _tarjetaParte(BuildContext context, Reglamento r, ParteReglamento parte, PivotPaleta p) {
    final detalle = switch (parte.id) {
      'casos' => '${r.casos.length} escenarios con su explicación',
      'glosario' => '${r.glosario.length} términos, en español y en inglés',
      'senales' => '${r.faltas.length} faltas con su código y su señal',
      _ => '${r.seccionesDe(parte.id).where((x) => x.nivel <= 2).length} secciones',
    };
    final quien = _paraQuien(parte.id);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(14, 6, 10, 6),
        leading: CircleAvatar(
          backgroundColor: p.suave,
          child: Icon(_iconos[parte.id] ?? Icons.article_rounded, color: p.marcaTexto),
        ),
        title: Text(_nombreParte(parte), style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(detalle),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (quien != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: p.suave, borderRadius: BorderRadius.circular(99)),
                child: Text(
                  quien,
                  style: TextStyle(fontSize: 11.5, color: p.sobreSuave, fontWeight: FontWeight.w600),
                ),
              ),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
        onTap: () => abrirParte(context, widget.sesion, parte),
      ),
    );
  }
}

/// Resultados del buscador, por tipo.
class ResultadosReglamento extends StatelessWidget {
  const ResultadosReglamento({super.key, required this.sesion, required this.consulta});
  final Sesion sesion;
  final String consulta;

  @override
  Widget build(BuildContext context) {
    final r = ReglamentoRepo.datos.value!;
    final p = context.pivot;
    final res = r.buscar(consulta);
    if (res.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Text(
          'No encontramos nada con «$consulta». Prueba con otras palabras, por ejemplo «codo», «jammer líder» o «corte».',
          textAlign: TextAlign.center,
          style: TextStyle(color: p.textoSecundario),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final x in res)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: switch (x) {
              Termino g => ListTile(
                leading: Icon(Icons.sort_by_alpha_rounded, color: p.marcaTexto),
                title: Text(g.t, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(g.en.isEmpty ? 'Glosario' : 'Glosario · ${g.en}'),
                onTap: () => verTermino(context, g, (e) => abrirEnlaceReglamento(context, sesion, e)),
              ),
              Falta f => ListTile(
                leading: _CodigoFalta(f.codigo),
                title: Text(_capital(f.nombre), style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('Falta · ${f.en}'),
                onTap: () => SubAjustes.abrir(context, FaltasScreen(sesion: sesion, enfocar: f.codigo)),
              ),
              Caso c => ListTile(
                leading: Icon(Icons.lightbulb_rounded, color: p.marcaTexto),
                title: Text('Escenario ${c.id}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(_sinMarcas(c.texto), maxLines: 2, overflow: TextOverflow.ellipsis),
                onTap: () => SubAjustes.abrir(context, CasosScreen(sesion: sesion, titulo: 'Escenario ${c.id}', casos: [c], abiertos: true)),
              ),
              Regla s => ListTile(
                leading: Icon(_iconos[s.parte] ?? Icons.article_rounded, color: p.marcaTexto),
                title: Text(s.completo, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(_extracto(s.md, consulta).ifEmpty(_nombreParte(r.parte(s.parte)!)), maxLines: 2, overflow: TextOverflow.ellipsis),
                onTap: () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: sesion, id: s.id)),
              ),
              _ => const SizedBox.shrink(),
            },
          ),
      ],
    );
  }
}

String _sinMarcas(String md) => md.replaceAll(RegExp(r'\[([^\]]*)\]\([^)]*\)'), r'$1').replaceAll(RegExp(r'[*#|⏎]'), '').replaceAll(RegExp(r'\s+'), ' ').trim();

String _capital(String s) => s.isEmpty ? s : s[0] + s.substring(1).toLowerCase();

/// La frase del texto donde aparece la primera palabra buscada.
String _extracto(String md, String consulta) {
  final plano = _sinMarcas(md.replaceAllMapped(RegExp(r'\[([^\]]*)\]\([^)]*\)'), (m) => m.group(1)!));
  final norm = Reglamento.normalizar(plano);
  for (final p in Reglamento.palabras(consulta)) {
    final i = norm.indexOf(p);
    if (i >= 0) {
      final a = max(0, i - 60);
      return '${a > 0 ? '…' : ''}${plano.substring(a, min(plano.length, i + 120))}…';
    }
  }
  return '';
}

extension on String {
  String ifEmpty(String otro) => isEmpty ? otro : this;
}

class _CodigoFalta extends StatelessWidget {
  const _CodigoFalta(this.codigo, {this.grande = false});
  final String codigo;
  final bool grande;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final lado = grande ? 52.0 : 40.0;
    return Container(
      width: lado,
      height: lado,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: p.marca, borderRadius: BorderRadius.circular(grande ? 16 : 12)),
      child: Text(
        codigo,
        style: TextStyle(color: p.sobreMarca, fontWeight: FontWeight.w900, fontSize: grande ? 24 : 18),
      ),
    );
  }
}

/// Índice de una parte: los títulos grandes agrupan a sus secciones.
class ParteReglamentoScreen extends StatelessWidget {
  const ParteReglamentoScreen({super.key, required this.sesion, required this.parte});
  final Sesion sesion;
  final ParteReglamento parte;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: Text(_nombreParte(parte), style: const TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _ConDatos(
        builder: (context, r) {
          final secs = r.seccionesDe(parte.id);
          final minimo = secs.isEmpty ? 1 : secs.map((x) => x.nivel).reduce(min);
          return ListView(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 32 + MediaQuery.paddingOf(context).bottom),
            children: [
              if (parte.id == 'senales')
                Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    leading: Icon(Icons.front_hand_rounded, color: p.marcaTexto),
                    title: const Text('Faltas: código y señal', style: TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${r.faltas.length} faltas, cada una con su regla'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => SubAjustes.abrir(context, FaltasScreen(sesion: sesion)),
                  ),
                ),
              for (final s in secs)
                if (s.nivel == minimo)
                  Padding(
                    padding: const EdgeInsets.only(top: 10, bottom: 2),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: sesion, id: s.id)),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                        child: Text(
                          s.completo,
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.texto),
                        ),
                      ),
                    ),
                  )
                else
                  ListTile(
                    dense: s.nivel > minimo + 1,
                    contentPadding: EdgeInsets.only(left: 4.0 + (s.nivel - minimo - 1) * 18, right: 4),
                    title: Text(s.completo, style: TextStyle(fontWeight: s.nivel == minimo + 1 ? FontWeight.w600 : FontWeight.w400)),
                    trailing: Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                    onTap: () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: sesion, id: s.id)),
                  ),
            ],
          );
        },
      ),
    );
  }
}

/// Una sección: texto, faltas y escenarios de esa regla, sus subsecciones,
/// guardar y «Anterior / Siguiente».
class SeccionReglamentoScreen extends StatefulWidget {
  const SeccionReglamentoScreen({super.key, required this.sesion, required this.id});
  final Sesion sesion;
  final String id;

  @override
  State<SeccionReglamentoScreen> createState() => _SeccionReglamentoScreenState();
}

class _SeccionReglamentoScreenState extends State<SeccionReglamentoScreen> {
  late String _id = widget.id;
  bool _casos = false;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    ReglamentoRepo.leyendo(_id);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _ir(String id) {
    setState(() {
      _id = id;
      _casos = false;
    });
    ReglamentoRepo.leyendo(id);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final s = widget.sesion;
    return _ConDatos(
      builder: (context, r) {
        final sec = r.secciones[_id];
        if (sec == null) return const Scaffold(body: Center(child: Text('Esta sección ya no está en el reglamento.')));
        final parte = r.parte(sec.parte)!;
        final lista = r.seccionesDe(sec.parte);
        final i = lista.indexOf(sec);
        final anterior = i > 0 ? lista[i - 1] : null;
        final siguiente = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
        final num = sec.parte == 'reglas' || sec.parte == 'casos' ? sec.num : '';
        final casos = r.casosDe(num);
        final faltas = sec.parte == 'reglas' ? r.faltasDe(num) : const <Falta>[];
        final hijas = r.hijas(sec);
        return Scaffold(
          appBar: AppBar(
            title: Text(_nombreParte(parte), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
            actions: [
              ValueListenableBuilder<List<String>>(
                valueListenable: ReglamentoRepo.favoritos,
                builder: (context, favs, _) => IconButton(
                  tooltip: favs.contains(_id) ? 'Quitar de guardadas' : 'Guardar',
                  icon: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Icon(favs.contains(_id) ? Icons.bookmark_rounded : Icons.bookmark_border_rounded, key: ValueKey(favs.contains(_id))),
                  ),
                  onPressed: () => ReglamentoRepo.alternarFavorito(_id),
                ),
              ),
            ],
          ),
          body: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            child: ListView(
              key: ValueKey(_id),
              controller: _scroll,
              padding: EdgeInsets.fromLTRB(18, 6, 18, 32 + MediaQuery.paddingOf(context).bottom),
              children: [
                if (sec.num.isNotEmpty)
                  Text(
                    'Sección ${sec.num}',
                    style: TextStyle(color: p.marcaTexto, fontWeight: FontWeight.w700, fontSize: 13.5),
                  ),
                Text(sec.titulo, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, height: 1.2)),
                const SizedBox(height: 14),
                if (sec.md.isNotEmpty) TextoRegla(sec.md, alAbrir: (e) => _enlace(context, r, e)),
                if (faltas.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'FALTAS DE ESTA SECCIÓN',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: p.textoSecundario),
                  ),
                  const SizedBox(height: 8),
                  for (final f in faltas)
                    Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: _CodigoFalta(f.codigo),
                        title: Text(_capital(f.nombre), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(f.en),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => SubAjustes.abrir(context, FaltasScreen(sesion: s, enfocar: f.codigo)),
                      ),
                    ),
                ],
                if (hijas.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Card(
                    child: Column(
                      children: [
                        for (final h in hijas)
                          ListTile(
                            title: Text(h.completo, style: const TextStyle(fontWeight: FontWeight.w600)),
                            trailing: Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                            onTap: () => _ir(h.id),
                          ),
                      ],
                    ),
                  ),
                ],
                if (casos.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Card(
                    color: p.suave,
                    child: ListTile(
                      leading: Icon(Icons.lightbulb_rounded, color: p.sobreSuave),
                      title: Text(
                        casos.length == 1 ? 'Ver 1 ejemplo del libro de casos' : 'Ver ${casos.length} ejemplos del libro de casos',
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.sobreSuave),
                      ),
                      trailing: AnimatedRotation(
                        turns: _casos ? 0.5 : 0,
                        duration: const Duration(milliseconds: 220),
                        child: Icon(Icons.expand_more_rounded, color: p.sobreSuave),
                      ),
                      onTap: () => setState(() => _casos = !_casos),
                    ),
                  ),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 260),
                    curve: Curves.easeOutCubic,
                    alignment: Alignment.topCenter,
                    child: _casos
                        ? Column(
                            children: [for (final c in casos) TarjetaCaso(sesion: s, caso: c)],
                          )
                        : const SizedBox(width: double.infinity),
                  ),
                ],
                const SizedBox(height: 20),
                Row(
                  children: [
                    if (anterior != null)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _ir(anterior.id),
                          icon: const Icon(Icons.chevron_left_rounded),
                          label: Text(anterior.num.isEmpty ? 'Anterior' : anterior.num, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    if (anterior != null && siguiente != null) const SizedBox(width: 10),
                    if (siguiente != null)
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () => _ir(siguiente.id),
                          iconAlignment: IconAlignment.end,
                          icon: const Icon(Icons.chevron_right_rounded),
                          label: Text(siguiente.num.isEmpty ? 'Siguiente' : siguiente.num, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _enlace(BuildContext context, Reglamento r, String e) {
    // Dentro de la misma parte se cambia de sección sin apilar pantallas.
    if (e.startsWith('pivot:s/') && r.secciones[e.substring(8)]?.parte == r.secciones[_id]?.parte) {
      _ir(e.substring(8));
      return;
    }
    abrirEnlaceReglamento(context, widget.sesion, e);
  }
}

/// Escenario del libro de casos: primero la situación, «Ver resultado» muestra
/// el resultado y la explicación.
class TarjetaCaso extends StatefulWidget {
  const TarjetaCaso({super.key, required this.sesion, required this.caso, this.abierto = false, this.conSituacion = true});
  final Sesion sesion;
  final Caso caso;
  final bool abierto;

  /// En «Ponte a prueba» la situación ya está arriba.
  final bool conSituacion;

  @override
  State<TarjetaCaso> createState() => _TarjetaCasoState();
}

class _TarjetaCasoState extends State<TarjetaCaso> {
  late bool _abierto = widget.abierto;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final c = widget.caso;
    void enlace(String e) => abrirEnlaceReglamento(context, widget.sesion, e);
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Escenario ${c.id}',
              style: TextStyle(fontWeight: FontWeight.w800, color: p.marcaTexto),
            ),
            if (widget.conSituacion) ...[const SizedBox(height: 6), TextoRegla(c.texto, alAbrir: enlace, tamano: 15)],
            AnimatedSize(
              duration: const Duration(milliseconds: 240),
              curve: Curves.easeOutCubic,
              alignment: Alignment.topCenter,
              child: !_abierto
                  ? Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () => setState(() => _abierto = true),
                        icon: const Icon(Icons.visibility_rounded),
                        label: const Text('Ver resultado'),
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (c.resultado.isNotEmpty) _bloque('Resultado', c.resultado, enlace, p, fuerte: true),
                        if (c.explicacion.isNotEmpty) _bloque('Explicación', c.explicacion, enlace, p),
                        if (c.extra.isNotEmpty) TextoRegla(c.extra, alAbrir: enlace, tamano: 14.5),
                        if (r(c) case final regla?)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton.icon(
                              onPressed: () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: widget.sesion, id: regla.id)),
                              icon: const Icon(Icons.menu_book_rounded),
                              label: Text('Ir a la regla ${regla.num}'),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Regla? r(Caso c) => ReglamentoRepo.datos.value?.reglaPorNumero(c.seccion);

  Widget _bloque(String titulo, String md, void Function(String) enlace, PivotPaleta p, {bool fuerte = false}) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 2),
      decoration: BoxDecoration(
        color: fuerte ? p.suave : null,
        border: fuerte ? null : Border.all(color: p.bordeSuave),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            titulo.toUpperCase(),
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: fuerte ? p.sobreSuave : p.textoSecundario),
          ),
          const SizedBox(height: 4),
          TextoRegla(md, alAbrir: enlace, tamano: 15),
        ],
      ),
    );
  }
}

/// Libro de casos: agrupado por la sección de las reglas.
class CasosIndiceScreen extends StatelessWidget {
  const CasosIndiceScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Libro de casos', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _ConDatos(
        builder: (context, r) {
          final grupos = r.casosPorSeccion.keys.toList();
          return ListView(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 32 + MediaQuery.paddingOf(context).bottom),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 10, left: 2, right: 2),
                child: Text(
                  'Situaciones reales con su resultado. Lee la situación, piensa qué cobrarías y después mira el resultado.',
                  style: TextStyle(color: p.textoSecundario),
                ),
              ),
              Card(
                child: Column(
                  children: [
                    for (final num in grupos)
                      ListTile(
                        title: Text(r.reglaPorNumero(num)?.completo ?? num, style: const TextStyle(fontWeight: FontWeight.w600)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${r.casosPorSeccion[num]!.length}',
                              style: TextStyle(color: p.textoSecundario, fontWeight: FontWeight.w700),
                            ),
                            Icon(Icons.chevron_right_rounded, color: p.textoSecundario),
                          ],
                        ),
                        onTap: () => SubAjustes.abrir(
                          context,
                          CasosScreen(sesion: sesion, titulo: r.reglaPorNumero(num)?.completo ?? num, casos: r.casosPorSeccion[num]!),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class CasosScreen extends StatelessWidget {
  const CasosScreen({super.key, required this.sesion, required this.titulo, required this.casos, this.abiertos = false});
  final Sesion sesion;
  final String titulo;
  final List<Caso> casos;
  final bool abiertos;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(titulo, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 32 + MediaQuery.paddingOf(context).bottom),
        children: [for (final c in casos) TarjetaCaso(sesion: sesion, caso: c, abierto: abiertos)],
      ),
    );
  }
}

/// Glosario de la A a la Z con buscador (español o inglés).
class GlosarioScreen extends StatefulWidget {
  const GlosarioScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<GlosarioScreen> createState() => _GlosarioScreenState();
}

class _GlosarioScreenState extends State<GlosarioScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Glosario', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _ConDatos(
        builder: (context, r) {
          final q = Reglamento.normalizar(_q.trim());
          final lista = [
            for (final g in r.glosario)
              if (q.isEmpty || Reglamento.normalizar('${g.t} ${g.en}').contains(q)) g,
          ]..sort((a, b) => Reglamento.normalizar(a.t).compareTo(Reglamento.normalizar(b.t)));
          String? letra;
          return ListView(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 32 + MediaQuery.paddingOf(context).bottom),
            children: [
              TextField(
                onChanged: (v) => setState(() => _q = v),
                decoration: const InputDecoration(hintText: 'Buscar un término (también en inglés)', prefixIcon: Icon(Icons.search_rounded)),
              ),
              const SizedBox(height: 8),
              for (final g in lista) ...[
                if (letra != (letra = Reglamento.normalizar(g.t).substring(0, 1).toUpperCase()))
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 14, 4, 4),
                    child: Text(
                      letra,
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: p.marcaTexto),
                    ),
                  ),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  title: Text(g.t, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(g.en.isEmpty ? _sinMarcas(g.def) : g.en, maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () => verTermino(context, g, (e) => abrirEnlaceReglamento(context, widget.sesion, e)),
                ),
              ],
              if (lista.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 30),
                  child: Text(
                    'No hay términos con «$_q».',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: p.textoSecundario),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Faltas con su código, la señal del árbitro y la regla.
class FaltasScreen extends StatelessWidget {
  const FaltasScreen({super.key, required this.sesion, this.enfocar});
  final Sesion sesion;
  final String? enfocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Faltas y señales', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _ConDatos(
        builder: (context, r) {
          final lista = [
            for (final f in r.faltas)
              if (f.codigo == enfocar) f,
            for (final f in r.faltas)
              if (f.codigo != enfocar) f,
          ];
          return ListView(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 32 + MediaQuery.paddingOf(context).bottom),
            children: [
              for (final f in lista)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  shape: f.codigo == enfocar
                      ? RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: BorderSide(color: p.marca, width: 2),
                        )
                      : null,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _CodigoFalta(f.codigo, grande: true),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_capital(f.nombre), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                                  if (f.en.isNotEmpty)
                                    Text(
                                      f.en,
                                      style: TextStyle(color: p.textoSecundario, fontStyle: FontStyle.italic),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (f.senal.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Text(
                            'SEÑAL',
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: p.textoSecundario),
                          ),
                          const SizedBox(height: 4),
                          TextoRegla(f.senal, glosario: false, alAbrir: (_) {}, tamano: 15),
                        ],
                        if (f.nota.isNotEmpty) TextoRegla(f.nota, alAbrir: (e) => abrirEnlaceReglamento(context, sesion, e), tamano: 14),
                        if (r.reglaPorNumero(f.seccion) case final regla?)
                          TextButton.icon(
                            onPressed: () => SubAjustes.abrir(context, SeccionReglamentoScreen(sesion: sesion, id: regla.id)),
                            icon: const Icon(Icons.menu_book_rounded),
                            label: Text('Regla ${regla.num}', overflow: TextOverflow.ellipsis),
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Ponte a prueba: escenarios al azar del libro de casos. Si el resultado dice
/// si hay falta, se elige «Hay falta / No hay falta»; si no, se piensa y se
/// mira la respuesta.
class AprenderReglamentoScreen extends StatefulWidget {
  const AprenderReglamentoScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<AprenderReglamentoScreen> createState() => _AprenderReglamentoScreenState();
}

class _AprenderReglamentoScreenState extends State<AprenderReglamentoScreen> {
  final _azar = Random();
  final _hechos = <String>{};
  Caso? _caso;
  bool? _eleccion;
  bool _visto = false;
  int _bien = 0, _total = 0;

  void _siguiente(Reglamento r) {
    final quedan = [
      for (final c in r.casos)
        if (!_hechos.contains(c.id) && c.resultado.isNotEmpty) c,
    ];
    if (quedan.isEmpty) _hechos.clear();
    final lista = quedan.isEmpty ? r.casos : quedan;
    setState(() {
      _caso = lista[_azar.nextInt(lista.length)];
      _hechos.add(_caso!.id);
      _eleccion = null;
      _visto = false;
    });
  }

  void _elegir(bool hayFalta) {
    final c = _caso!;
    setState(() {
      _eleccion = hayFalta;
      _visto = true;
      _total++;
      if (c.hayFalta == hayFalta) _bien++;
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ponte a prueba', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          if (_total > 0)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Text('$_bien de $_total', style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
        ],
      ),
      body: _ConDatos(
        builder: (context, r) {
          if (_caso == null) WidgetsBinding.instance.addPostFrameCallback((_) => mounted && _caso == null ? _siguiente(r) : null);
          final c = _caso;
          if (c == null) return const SizedBox.shrink();
          final tipo = c.hayFalta;
          void enlace(String e) => abrirEnlaceReglamento(context, widget.sesion, e);
          return AnimatedSwitcher(
            duration: const Duration(milliseconds: 260),
            transitionBuilder: (child, a) => FadeTransition(
              opacity: a,
              child: SlideTransition(
                position: Tween(begin: const Offset(0.05, 0), end: Offset.zero).animate(a),
                child: child,
              ),
            ),
            child: ListView(
              key: ValueKey(c.id),
              padding: EdgeInsets.fromLTRB(16, 4, 16, 32 + MediaQuery.paddingOf(context).bottom),
              children: [
                Text(
                  r.reglaPorNumero(c.seccion)?.completo ?? 'Escenario ${c.id}',
                  style: TextStyle(color: p.marcaTexto, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                    child: TextoRegla(c.texto, alAbrir: enlace),
                  ),
                ),
                const SizedBox(height: 12),
                if (!_visto && tipo != null)
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.tonal(onPressed: () => _elegir(false), child: const Text('No hay falta')),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(onPressed: () => _elegir(true), child: const Text('Hay falta')),
                      ),
                    ],
                  )
                else if (!_visto)
                  FilledButton.icon(
                    onPressed: () => setState(() => _visto = true),
                    icon: const Icon(Icons.visibility_rounded),
                    label: const Text('¿Qué pasa? Ver la respuesta'),
                  ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: !_visto
                      ? const SizedBox(width: double.infinity)
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_eleccion != null)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  children: [
                                    Icon(
                                      _eleccion == tipo ? Icons.check_circle_rounded : Icons.cancel_rounded,
                                      color: _eleccion == tipo ? p.marcaTexto : p.textoSecundario,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(_eleccion == tipo ? '¡Bien!' : 'Esta vez no', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                  ],
                                ),
                              ),
                            TarjetaCaso(sesion: widget.sesion, caso: c, abierto: true, conSituacion: false),
                            const SizedBox(height: 14),
                            FilledButton.icon(
                              onPressed: () => _siguiente(r),
                              iconAlignment: IconAlignment.end,
                              icon: const Icon(Icons.arrow_forward_rounded),
                              label: const Text('Otro escenario'),
                            ),
                          ],
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
