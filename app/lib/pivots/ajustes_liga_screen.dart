import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../ajustes/campos.dart';
import '../ajustes/componentes.dart';
import '../core/api.dart';
import '../core/config_liga.dart';
import '../core/paises.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';
import '../core/selector_plazo.dart';
import '../core/vidrio.dart';
import '../finanzas/tesoreria_screen.dart';
import 'buscador_liga.dart';
import 'categorias_screen.dart';
import 'formas_pago_screen.dart';
import 'pivots_screen.dart';

/// Mi perfil → Ajustes de la liga (solo Pivots, Victor 2026-11-13): un solo
/// lugar para lo que configura la liga. Los roles se editan desde la hoja de
/// "Roles en el equipo" (botón "Agregar o editar roles").
class AjustesLigaScreen extends StatefulWidget {
  const AjustesLigaScreen({super.key, required this.sesion, this.pestana = false});
  final Sesion sesion;

  /// Mi Liga como pestaña de la barra de abajo (Victor, 2026-11-13).
  final bool pestana;

  @override
  State<AjustesLigaScreen> createState() => _AjustesLigaScreenState();

  static const zonas = {
    'America/Guayaquil': 'Ecuador (UTC−5)',
    'America/Bogota': 'Colombia (UTC−5)',
    'America/Lima': 'Perú (UTC−5)',
    'America/Panama': 'Panamá (UTC−5)',
    'America/Mexico_City': 'México, centro (UTC−6)',
    'America/Caracas': 'Venezuela (UTC−4)',
    'America/La_Paz': 'Bolivia (UTC−4)',
    'America/Santiago': 'Chile',
    'America/Argentina/Buenos_Aires': 'Argentina (UTC−3)',
    'America/Montevideo': 'Uruguay (UTC−3)',
    'America/Asuncion': 'Paraguay',
    'America/Sao_Paulo': 'Brasil, São Paulo (UTC−3)',
    'America/New_York': 'Estados Unidos, este',
    'America/Los_Angeles': 'Estados Unidos, pacífico',
    'Europe/Madrid': 'España',
  };
}

class _AjustesLigaScreenState extends State<AjustesLigaScreen> {
  Sesion get sesion => widget.sesion;
  static const zonas = AjustesLigaScreen.zonas;

  /// Fila que el buscador pidió resaltar.
  final _resaltado = ValueNotifier<String?>(null);

  @override
  void dispose() {
    _resaltado.dispose();
    super.dispose();
  }

  static String _plata(num? v) => v == null ? 'Sin definir' : '\$${v % 1 == 0 ? v.toInt() : v.toStringAsFixed(2)}';

  Future<void> _guardar(BuildContext context, ConfigLiga c, Map<String, Object?> cambios) async {
    final m = ScaffoldMessenger.of(context);
    try {
      await c.guardar(cambios);
      m.showSnackBar(const SnackBar(content: Text('Guardado')));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    }
  }

  Future<void> _elegir(BuildContext context, ConfigLiga c, String titulo, Map<String, String> opciones, String actual, String clave, {String? ayuda}) async {
    final v = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (h) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
              child: Text(titulo, style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            ),
            if (ayuda != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(ayuda, style: TextStyle(fontSize: 13.5, color: h.pivot.textoSecundario)),
              ),
            for (final e in opciones.entries)
              ListTile(
                leading: clave == 'canal' ? Icon(ConfigLiga.iconoDe(e.key)) : null,
                title: Text(e.value),
                trailing: e.key == actual ? Icon(Icons.check_rounded, color: h.pivot.marcaTexto) : null,
                onTap: () => Navigator.of(h).pop(e.key),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (v != null && v != actual && context.mounted) await _guardar(context, c, {clave: v});
  }

  Future<void> _precio(BuildContext context, ConfigLiga c, String titulo, num? actual, String clave) async {
    final ctl = TextEditingController(text: actual == null ? '' : '$actual');
    final v = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(titulo),
        content: TextField(
          controller: ctl,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
          decoration: const InputDecoration(prefixText: '\$ '),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(d).pop(ctl.text.replaceAll(',', '.')), child: const Text('Guardar')),
        ],
      ),
    );
    final n = num.tryParse(v ?? '');
    if (n != null && context.mounted) await _guardar(context, c, {clave: n});
  }

  Future<void> _numero(BuildContext context, ConfigLiga c, String titulo, String clave, int actual, int min, int max, String etiqueta) async {
    var v = actual;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(titulo, style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 16),
                SelectorNumero(valor: v, min: min, max: max, paso: max > 100 ? 5 : 1, etiqueta: etiqueta, alCambiar: (n) => set(() => v = n.toInt())),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => Navigator.of(h).pop(true), child: const Text('Guardar')),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok != true || v == actual || !context.mounted) return;
    final m = ScaffoldMessenger.of(context);
    try {
      await c.guardarReglas({clave: v});
      m.showSnackBar(const SnackBar(content: Text('Guardado')));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    }
  }

  Future<void> _guardarRegla(BuildContext context, ConfigLiga c, Map<String, Object?> cambios) async {
    final m = ScaffoldMessenger.of(context);
    try {
      await c.guardarReglas(cambios);
      m.showSnackBar(const SnackBar(content: Text('Guardado')));
    } catch (e) {
      m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo guardar. Revisa tu conexión.')));
    }
  }

  static const _estadosCongelan = {'Lesionadx': 'Lesión', 'De viaje': 'Viaje', 'Técnico': 'Técnico'};

  String _textoCongelar(ConfigLiga c) {
    final con = [
      for (final e in _estadosCongelan.entries)
        if (c.congelarMax(e.key) > 0) '${e.value}: ${c.congelarMax(e.key)} ${c.congelarMax(e.key) == 1 ? 'mes' : 'meses'}',
    ];
    return con.isEmpty ? 'Sin límite: no cuentan para subir o bajar de equipo' : con.join(' · ');
  }

  Future<void> _congelar(BuildContext context, ConfigLiga c) async {
    final v = {for (final e in _estadosCongelan.keys) e: c.congelarMax(e)};
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Estados que congelan', style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(
                  'Mientras una persona tiene uno de estos estados, su asistencia no cuenta para subir o bajar de equipo. '
                  'Con un máximo, al cumplirse ese tiempo la asistencia vuelve a contar desde ese día y se avisa a la persona y a los Pivots. '
                  '0 = sin límite.',
                  style: TextStyle(color: h.pivot.textoSecundario),
                ),
                for (final e in _estadosCongelan.entries) ...[
                  const SizedBox(height: 16),
                  Text(e.value, style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  SelectorNumero(valor: v[e.key]!, min: 0, max: 36, etiqueta: 'meses', alCambiar: (n) => set(() => v[e.key] = n.toInt())),
                ],
                const SizedBox(height: 20),
                FilledButton(onPressed: () => Navigator.of(h).pop(true), child: const Text('Guardar')),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok == true && context.mounted) await _guardarRegla(context, c, {'congelarMaxMeses': v});
  }

  String _textoVencimiento(ConfigLiga c) {
    if (c.cuotaVenceDia == 0) return 'No vence';
    final g = c.cuotaGraciaDias > 0 ? ' + ${c.cuotaGraciaDias} ${c.cuotaGraciaDias == 1 ? 'día' : 'días'} de gracia' : '';
    final r = c.cuotaRecargo > 0 ? ' · recargo ${_plata(c.cuotaRecargo)}' : ' · sin recargo';
    return 'Vence el día ${c.cuotaVenceDia}$g$r';
  }

  Future<void> _vencimiento(BuildContext context, ConfigLiga c) async {
    var dia = c.cuotaVenceDia, gracia = c.cuotaGraciaDias;
    final ctl = TextEditingController(text: c.cuotaRecargo == 0 ? '' : '${c.cuotaRecargo}');
    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (h) => StatefulBuilder(
        builder: (h, set) => SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(h).bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Vencimiento de la cuota', style: Theme.of(h).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(
                  'Si alguien envía su pago después del día de vencimiento y los días de gracia, se le suma el recargo. '
                  'Cuenta el día en que envía la solicitud, no el día en que un Pivot la aprueba. Los pagos ya hechos no cambian.',
                  style: TextStyle(color: h.pivot.textoSecundario),
                ),
                const SizedBox(height: 16),
                const Text('Día de vencimiento', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                SelectorNumero(valor: dia, min: 0, max: 28, etiqueta: dia == 0 ? 'no vence' : 'de cada mes', alCambiar: (n) => set(() => dia = n.toInt())),
                AnimatedSize(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  child: dia == 0
                      ? const SizedBox(width: double.infinity)
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const SizedBox(height: 16),
                            const Text('Días de gracia', style: TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 6),
                            SelectorNumero(valor: gracia, min: 0, max: 27, etiqueta: 'días', alCambiar: (n) => set(() => gracia = n.toInt())),
                            const SizedBox(height: 16),
                            TextField(
                              controller: ctl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                              decoration: const InputDecoration(labelText: 'Recargo (monto fijo)', prefixText: '\$ ', helperText: 'Vacío o 0 = sin recargo'),
                            ),
                          ],
                        ),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: () => Navigator.of(h).pop(true), child: const Text('Guardar')),
              ],
            ),
          ),
        ),
      ),
    );
    if (ok != true || !context.mounted) return;
    final recargo = num.tryParse(ctl.text.replaceAll(',', '.')) ?? 0;
    await _guardarRegla(context, c, {'cuotaVenceDia': dia, 'cuotaGraciaDias': gracia, 'cuotaRecargo': dia == 0 ? 0 : recargo});
  }

  /// Buscador: lleva al ajuste (abriendo la subsección si hace falta) y lo
  /// hace parpadear.
  Future<void> _buscar() async {
    final e = await Navigator.of(context).push<EntradaAjuste>(MaterialPageRoute(builder: (_) => BuscadorLigaScreen(tesoreria: sesion.tieneArea('finanzas'))));
    if (e == null || !mounted) return;
    switch (e.dentro) {
      case 'equipos':
        SubAjustes.abrir(context, CategoriasScreen(sesion: sesion, resaltar: e.id));
      case 'tesoreria':
        SubAjustes.abrir(context, TesoreriaScreen(sesion: sesion, resaltar: e.id));
      default:
        _resaltado.value = null;
        _resaltado.value = e.id;
    }
  }

  @override
  @override
  Widget build(BuildContext context) {
    final c = ConfigLiga.de(sesion);
    final pestana = widget.pestana;
    final arriba = pestana ? MediaQuery.paddingOf(context).top + kToolbarHeight : 0.0;
    return Scaffold(
      // En la pestaña, barra de vidrio como Equipo y Mi perfil.
      extendBodyBehindAppBar: pestana,
      appBar: AppBar(
        backgroundColor: pestana ? Colors.transparent : null,
        surfaceTintColor: pestana ? Colors.transparent : null,
        scrolledUnderElevation: pestana ? 0 : null,
        flexibleSpace: pestana ? const Vidrio(child: SizedBox.expand()) : null,
        title: Row(
          children: [
            if (pestana && c.logo.isNotEmpty) ...[LogoEquipo(nombre: 'Liga', url: c.logo, tamano: 32), const SizedBox(width: 10)],
            Text(pestana ? 'Mi Liga' : 'Ajustes de la liga', style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [IconButton(tooltip: 'Buscar un ajuste', onPressed: _buscar, icon: const Icon(Icons.search_rounded))],
      ),
      body: ListenableBuilder(
        listenable: c,
        builder: (context, _) => SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(16, 8 + arriba, 16, 40 + MediaQuery.paddingOf(context).bottom),
          // Todo construido: el buscador puede llevar a cualquier fila.
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Tesorería vive en Mi Liga (Victor, 2026-11-13).
              if (sesion.tieneArea('finanzas'))
                GrupoAjustes(
                  filas: [
                    Resaltable(
                      id: 'tesoreria',
                      resaltado: _resaltado,
                      child: FilaAjuste(
                        icono: Icons.account_balance_wallet_outlined,
                        seccion: 'cuota',
                        titulo: 'Tesorería',
                        valor: 'Cuentas, movimientos, saldos y fondos de viaje',
                        alTocar: () => SubAjustes.abrir(context, TesoreriaScreen(sesion: sesion)),
                      ),
                    ),
                  ],
                ),
              GrupoAjustes(
                titulo: 'Equipo',
                filas: [
                  Resaltable(
                    id: 'equipos',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.workspace_premium_outlined,
                      seccion: 'cuota',
                      titulo: 'Equipos y puntos',
                      valor: 'Qué pide cada una para mantenerse o subir',
                      alTocar: () => SubAjustes.abrir(context, CategoriasScreen(sesion: sesion)),
                    ),
                  ),
                  Resaltable(
                    id: 'pivots',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.admin_panel_settings_outlined,
                      seccion: 'roles',
                      titulo: 'Pivots y permisos',
                      valor: 'Quién es Pivot y qué áreas gestiona',
                      alTocar: () => SubAjustes.abrir(context, PivotsScreen(sesion: sesion)),
                    ),
                  ),
                  Resaltable(
                    id: 'pedidos',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.verified_user_outlined,
                      seccion: 'roles',
                      titulo: 'Pedidos de Pivots',
                      valor: c.solicitudesPivots == 'auto' ? 'Se aprueban solos' : 'Los aprueba otro Pivot',
                      alTocar: () => _elegir(
                        context,
                        c,
                        'Pedidos de Pivots',
                        const {'otro': 'Los aprueba otro Pivot (más seguro)', 'auto': 'Se aprueban solos'},
                        c.solicitudesPivots,
                        'solicitudesPivots',
                        ayuda:
                            'Cuando un Pivot pide algo para sí (excepción de cuota, rectificación, equipamiento, lesión o una tarea), quién lo aprueba. '
                            'Si la liga tiene un solo Pivot, se aprueba solo. Los pagos siempre los confirma otro Pivot.',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              GrupoAjustes(
                titulo: 'Comunicación',
                filas: [
                  Resaltable(
                    id: 'canal',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: c.icono,
                      seccion: 'telefono',
                      titulo: 'Canal de comunicación',
                      valor: c.nombreCanal,
                      alTocar: () => _elegir(
                        context,
                        c,
                        'Canal de comunicación',
                        ConfigLiga.canales,
                        c.canal,
                        'canal',
                        ayuda: 'La app con la que se escribe a las personas del equipo desde su ficha.',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              GrupoAjustes(
                titulo: 'Cobros',
                pie: 'Los planes y cupones llegan en la siguiente etapa.',
                filas: [
                  Resaltable(
                    id: 'formas',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.credit_card_rounded,
                      seccion: 'cuota',
                      titulo: 'Formas de pago',
                      valor: c.mediosActivos.isEmpty ? 'Sin medios de pago' : c.mediosActivos.map((m) => m.nombre).join(' · '),
                      alTocar: () => SubAjustes.abrir(context, FormasPagoScreen(config: c)),
                    ),
                  ),
                  Resaltable(
                    id: 'mensualidad',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.calendar_month_outlined,
                      seccion: 'cuota',
                      titulo: 'Mensualidad',
                      valor: _plata(c.precioMensual),
                      alTocar: () => _precio(context, c, 'Mensualidad', c.precioMensual, 'precioMensual'),
                    ),
                  ),
                  Resaltable(
                    id: 'vencimiento',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.event_busy_outlined,
                      seccion: 'cuota',
                      titulo: 'Vencimiento de la cuota',
                      valor: _textoVencimiento(c),
                      alTocar: () => _vencimiento(context, c),
                    ),
                  ),
                  Resaltable(
                    id: 'clase',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.confirmation_number_outlined,
                      seccion: 'cuota',
                      titulo: 'Clase suelta',
                      valor: _plata(c.precioPorClase),
                      alTocar: () => _precio(context, c, 'Clase suelta', c.precioPorClase, 'precioPorClase'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              GrupoAjustes(
                titulo: 'Reglas',
                pie: 'Los cambios quedan en el historial de Equipos y puntos.',
                filas: [
                  Resaltable(
                    id: 'tolerancia',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.timer_outlined,
                      seccion: 'entrenamientos',
                      titulo: 'Tolerancia de llegada',
                      valor: '${c.toleranciaMin} minutos: después se sugiere marcar Tarde',
                      alTocar: () => _numero(context, c, 'Tolerancia de llegada', 'toleranciaMin', c.toleranciaMin, 0, 120, 'minutos'),
                    ),
                  ),
                  Resaltable(
                    id: 'rectificaciones',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.fact_check_outlined,
                      seccion: 'entrenamientos',
                      titulo: 'Rectificaciones',
                      valor: 'Los Pivots tienen ${c.rectificacionDias} días para revisarlas',
                      alTocar: () => _numero(context, c, 'Días para revisar una rectificación', 'rectificacionDias', c.rectificacionDias, 1, 60, 'días'),
                    ),
                  ),
                  Resaltable(
                    id: 'minimo',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.groups_2_outlined,
                      seccion: 'entrenamientos',
                      titulo: 'Pocas personas en un evento',
                      valor: c.eventosMinPersonas == 0 ? 'No se sugiere cancelar' : 'Con menos de ${c.eventosMinPersonas}, se sugiere cancelar',
                      alTocar: () => _numero(context, c, 'Sugerir cancelar con menos de', 'eventosMinPersonas', c.eventosMinPersonas, 0, 200, 'personas'),
                    ),
                  ),
                  Resaltable(
                    id: 'inactividad',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.hourglass_empty_rounded,
                      seccion: 'entrenamientos',
                      titulo: 'Inactividad',
                      valor: '${ConfigLiga.diasInactividad} días sin venir',
                      alTocar: () => _numero(context, c, 'Inactivx después de', 'inactividadDias', ConfigLiga.diasInactividad, 7, 365, 'días sin venir'),
                    ),
                  ),
                  Resaltable(
                    id: 'congelar',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.ac_unit_rounded,
                      seccion: 'entrenamientos',
                      titulo: 'Estados que congelan',
                      valor: _textoCongelar(c),
                      alTocar: () => _congelar(context, c),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              GrupoAjustes(
                titulo: 'Privacidad',
                pie: 'Los Pivots siempre ven todo. Cada persona siempre ve sus propios puntos.',
                filas: [
                  Resaltable(
                    id: 'ranking',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.leaderboard_outlined,
                      seccion: 'privacidad',
                      titulo: 'Puntos de otras personas',
                      valor: c.rankingVisible ? 'Todo el equipo ve los puntos de todas las personas' : 'Cada persona solo ve sus puntos',
                      derecha: Switch(value: c.rankingVisible, onChanged: (v) => _guardarRegla(context, c, {'rankingVisible': v})),
                      alTocar: () => _guardarRegla(context, c, {'rankingVisible': !c.rankingVisible}),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              GrupoAjustes(
                titulo: 'Datos de la liga',
                pie: 'El país define el prefijo de teléfono y los números de emergencia. La zona horaria se guarda y se aplicará a los horarios cuando la app admita varias ligas; por ahora todo usa la hora de Ecuador.',
                filas: [
                  Resaltable(
                    id: 'logo',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.shield_outlined,
                      seccion: 'identidad',
                      titulo: 'Logo de la liga',
                      valor: c.logo.isEmpty ? 'Sin logo' : 'Toca para cambiarlo',
                      alTocar: () async {
                        final m = ScaffoldMessenger.of(context);
                        try {
                          final u = await elegirYSubirLogo(context, sesion, 'liga');
                          if (u != null) {
                            await c.cargar();
                            m.showSnackBar(const SnackBar(content: Text('Logo actualizado')));
                          }
                        } catch (e) {
                          m.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'No se pudo subir el logo.')));
                        }
                      },
                    ),
                  ),
                  Resaltable(
                    id: 'pais',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.flag_outlined,
                      seccion: 'identidad',
                      titulo: 'País',
                      valor: Paises.porCodigo(c.pais).nombre,
                      alTocar: () async {
                        final p = await elegirPais(context, paisEquipo: c.pais, actual: Paises.porCodigo(c.pais), titulo: 'País de la liga');
                        if (p != null && p.codigo != c.pais && context.mounted) await _guardar(context, c, {'pais': p.codigo});
                      },
                    ),
                  ),
                  Resaltable(
                    id: 'zona',
                    resaltado: _resaltado,
                    child: FilaAjuste(
                      icono: Icons.schedule_rounded,
                      seccion: 'identidad',
                      titulo: 'Zona horaria',
                      valor: zonas[c.zonaHoraria] ?? c.zonaHoraria,
                      alTocar: () => _elegir(context, c, 'Zona horaria', zonas, c.zonaHoraria, 'zonaHoraria'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
