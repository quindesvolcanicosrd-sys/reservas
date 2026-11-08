import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/fechas.dart';
import '../core/paises.dart';
import '../core/tema.dart';
import '../equipo/equipo_repo.dart';
import '../sesion/sesion.dart';
import 'componentes.dart';

/// Pantallas de datos propios de Ajustes. Cada fila abre una hoja y guarda
/// ese campo solo (`actualizarDatosPersona`); la fila se actualiza al toque.

/// Guarda y recarga Equipo, para que la ficha muestre el cambio al toque.
Future<bool> guardarCampos(BuildContext context, Sesion s, Map<String, String> cambios) async {
  final ok = await guardarConAviso(context, () => s.guardarDatos(cambios));
  if (ok) unawaited(EquipoRepo.de(s).cargar(forzar: true));
  return ok;
}

String valorDe(Sesion s, String k) => '${s.datos[k] ?? ''}'.trim();

/// Opcionales de la ficha de salud: vacío con la ficha ya empezada = "ninguna".
String vacioComo(Sesion s, String k, String ninguno) => valorDe(s, k).isEmpty && valorDe(s, 'atencionMedica').isNotEmpty ? ninguno : valorDe(s, k);

Future<void> editarCampo(
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
    valor: valorDe(s, campo),
    ayuda: ayuda,
    teclado: teclado,
    maxLength: maxLength,
    lineas: lineas,
    validar: obligatorio ? (x) => x.isEmpty ? 'Este dato es obligatorio.' : null : null,
  );
  if (v == null || v == valorDe(s, campo) || !context.mounted) return;
  await guardarCampos(context, s, {campo: v});
}

Future<void> elegirCampo(
  BuildContext context,
  Sesion s,
  String campo,
  String titulo,
  List<String> opciones, {
  bool multi = false,
  bool otro = false,
  String? ayuda,
}) async {
  final v = await elegirOpciones(context, titulo: titulo, opciones: opciones, valor: valorDe(s, campo), multi: multi, otro: otro, ayuda: ayuda);
  if (v == null || v == valorDe(s, campo) || !context.mounted) return;
  await guardarCampos(context, s, {campo: v});
}

/// Teléfono con país (bandera + prefijo) en una sola hoja; se guardan
/// juntos. Por defecto, el país del equipo; valida los dígitos de cada país.
Future<void> editarTelefono(BuildContext context, Sesion s, String campoPrefijo, String campoTel, String titulo) async {
  unawaited(s.cargarPaisEquipo());
  final r = await showModalBottomSheet<(String, String)>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _HojaTelefono(
      titulo: titulo,
      pais: Paises.desdeValor(valorDe(s, campoPrefijo)) ?? Paises.porCodigo(s.paisEquipo),
      paisEquipo: s.paisEquipo,
      numero: valorDe(s, campoTel),
    ),
  );
  if (r == null || !context.mounted) return;
  await guardarCampos(context, s, {campoPrefijo: r.$1, campoTel: r.$2});
}

/// Lista de todos los países con buscador (nombre, siglas o prefijo); el
/// del equipo primero.
Future<Pais?> elegirPais(BuildContext context, {required String paisEquipo, Pais? actual, String titulo = 'País', bool conPrefijo = false}) {
  return showModalBottomSheet<Pais>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _HojaPais(paisEquipo: paisEquipo, actual: actual, titulo: titulo, conPrefijo: conPrefijo),
  );
}

class _HojaPais extends StatefulWidget {
  const _HojaPais({required this.paisEquipo, required this.actual, required this.titulo, required this.conPrefijo});
  final String paisEquipo;
  final Pais? actual;
  final String titulo;
  final bool conPrefijo;

  @override
  State<_HojaPais> createState() => _HojaPaisState();
}

class _HojaPaisState extends State<_HojaPais> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final lista = Paises.buscar(_q, widget.paisEquipo);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.75,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: Text(widget.titulo, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                autocorrect: false,
                onChanged: (v) => setState(() => _q = v),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: widget.conPrefijo ? 'Busca: Ecuador, EC, ECU o 593' : 'Busca: Ecuador, EC o ECU',
                ),
              ),
            ),
            Expanded(
              child: lista.isEmpty
                  ? Center(
                      child: Text('Ningún país coincide.', style: TextStyle(color: p.textoSecundario)),
                    )
                  : ListView.builder(
                      itemCount: lista.length,
                      itemBuilder: (c, i) {
                        final x = lista[i];
                        return ListTile(
                          leading: BanderaPais(pais: x, alto: 20),
                          title: Text(x.nombre),
                          subtitle: Text(widget.conPrefijo ? '+${x.prefijo} · ${x.codigo}' : x.codigo3),
                          trailing: x == widget.actual ? Icon(Icons.check_rounded, color: p.marcaTexto) : null,
                          onTap: () => Navigator.of(context).pop(x),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HojaTelefono extends StatefulWidget {
  const _HojaTelefono({required this.titulo, required this.pais, required this.paisEquipo, required this.numero});
  final String titulo;
  final Pais pais;
  final String paisEquipo;
  final String numero;

  @override
  State<_HojaTelefono> createState() => _HojaTelefonoState();
}

class _HojaTelefonoState extends State<_HojaTelefono> {
  late Pais _pais = widget.pais;
  late final _num = TextEditingController(text: widget.numero);
  String? _error;

  @override
  void dispose() {
    _num.dispose();
    super.dispose();
  }

  void _listo() {
    final n = _num.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.length < _pais.minDigitos || n.length > _pais.maxDigitos) {
      final rango = _pais.minDigitos == _pais.maxDigitos ? '${_pais.minDigitos}' : 'entre ${_pais.minDigitos} y ${_pais.maxDigitos}';
      setState(() => _error = 'En ${_pais.nombre} el número tiene $rango dígitos.');
      return;
    }
    Navigator.of(context).pop((_pais.valorPrefijo, n));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return HojaBase(
      titulo: widget.titulo,
      accion: ('Guardar', _listo),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: p.suave,
            borderRadius: BorderRadius.circular(PivotRadios.chip),
            child: InkWell(
              borderRadius: BorderRadius.circular(PivotRadios.chip),
              onTap: () async {
                final x = await elegirPais(context, paisEquipo: widget.paisEquipo, actual: _pais, titulo: 'Prefijo del país', conPrefijo: true);
                if (x != null) setState(() => _pais = x);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    BanderaPais(pais: _pais, alto: 16),
                    const SizedBox(width: 6),
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
              controller: _num,
              autofocus: true,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              maxLength: _pais.maxDigitos,
              onSubmitted: (_) => _listo(),
              decoration: InputDecoration(labelText: 'Número', errorText: _error, counterText: ''),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> elegirFechaCampo(BuildContext context, Sesion s, String campo, {required String ayuda, DateTime? desde, DateTime? hasta}) async {
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
  await guardarCampos(context, s, {campo: Fechas.iso(f)});
}

/// Base de las pantallas: se reconstruye con cada cambio de la sesión.
class PantallaAjustes extends StatelessWidget {
  const PantallaAjustes({super.key, required this.sesion, required this.titulo, required this.hijos});
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
