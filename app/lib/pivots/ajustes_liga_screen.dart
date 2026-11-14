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
import 'categorias_screen.dart';
import 'formas_pago_screen.dart';
import 'pivots_screen.dart';

/// Mi perfil → Ajustes de la liga (solo Pivots, Victor 2026-11-13): un solo
/// lugar para lo que configura la liga. Los roles se editan desde la hoja de
/// "Roles en el equipo" (botón "Agregar o editar roles").
class AjustesLigaScreen extends StatelessWidget {
  const AjustesLigaScreen({super.key, required this.sesion});
  final Sesion sesion;

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

  @override
  Widget build(BuildContext context) {
    final c = ConfigLiga.de(sesion);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ajustes de la liga', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListenableBuilder(
        listenable: c,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            GrupoAjustes(
              titulo: 'Equipo',
              filas: [
                FilaAjuste(
                  icono: Icons.workspace_premium_outlined,
                  seccion: 'cuota',
                  titulo: 'Equipos y puntos',
                  valor: 'Qué pide cada una para mantenerse o subir',
                  alTocar: () => SubAjustes.abrir(context, CategoriasScreen(sesion: sesion)),
                ),
                FilaAjuste(
                  icono: Icons.admin_panel_settings_outlined,
                  seccion: 'roles',
                  titulo: 'Pivots y permisos',
                  valor: 'Quién es Pivot y qué áreas gestiona',
                  alTocar: () => SubAjustes.abrir(context, PivotsScreen(sesion: sesion)),
                ),
                FilaAjuste(
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
              ],
            ),
            const SizedBox(height: 16),
            GrupoAjustes(
              titulo: 'Comunicación',
              filas: [
                FilaAjuste(
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
              ],
            ),
            const SizedBox(height: 16),
            GrupoAjustes(
              titulo: 'Cobros',
              pie: 'Los planes y cupones llegan en la siguiente etapa.',
              filas: [
                FilaAjuste(
                  icono: Icons.credit_card_rounded,
                  seccion: 'cuota',
                  titulo: 'Formas de pago',
                  valor: c.mediosActivos.isEmpty ? 'Sin medios de pago' : c.mediosActivos.map((m) => m.nombre).join(' · '),
                  alTocar: () => SubAjustes.abrir(context, FormasPagoScreen(config: c)),
                ),
                FilaAjuste(
                  icono: Icons.calendar_month_outlined,
                  seccion: 'cuota',
                  titulo: 'Mensualidad',
                  valor: _plata(c.precioMensual),
                  alTocar: () => _precio(context, c, 'Mensualidad', c.precioMensual, 'precioMensual'),
                ),
                FilaAjuste(
                  icono: Icons.confirmation_number_outlined,
                  seccion: 'cuota',
                  titulo: 'Clase suelta',
                  valor: _plata(c.precioPorClase),
                  alTocar: () => _precio(context, c, 'Clase suelta', c.precioPorClase, 'precioPorClase'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            GrupoAjustes(
              titulo: 'Reglas',
              pie: 'Los cambios quedan en el historial de Equipos y puntos.',
              filas: [
                FilaAjuste(
                  icono: Icons.timer_outlined,
                  seccion: 'entrenamientos',
                  titulo: 'Tolerancia de llegada',
                  valor: '${c.toleranciaMin} minutos: después se sugiere marcar Tarde',
                  alTocar: () => _numero(context, c, 'Tolerancia de llegada', 'toleranciaMin', c.toleranciaMin, 0, 120, 'minutos'),
                ),
                FilaAjuste(
                  icono: Icons.fact_check_outlined,
                  seccion: 'entrenamientos',
                  titulo: 'Rectificaciones',
                  valor: 'Los Pivots tienen ${c.rectificacionDias} días para revisarlas',
                  alTocar: () => _numero(context, c, 'Días para revisar una rectificación', 'rectificacionDias', c.rectificacionDias, 1, 60, 'días'),
                ),
                FilaAjuste(
                  icono: Icons.groups_2_outlined,
                  seccion: 'entrenamientos',
                  titulo: 'Pocas personas en un evento',
                  valor: c.eventosMinPersonas == 0 ? 'No se sugiere cancelar' : 'Con menos de ${c.eventosMinPersonas}, se sugiere cancelar',
                  alTocar: () => _numero(context, c, 'Sugerir cancelar con menos de', 'eventosMinPersonas', c.eventosMinPersonas, 0, 200, 'personas'),
                ),
                FilaAjuste(
                  icono: Icons.hourglass_empty_rounded,
                  seccion: 'entrenamientos',
                  titulo: 'Inactividad',
                  valor: '${ConfigLiga.diasInactividad} días sin venir',
                  alTocar: () => _numero(context, c, 'Inactivx después de', 'inactividadDias', ConfigLiga.diasInactividad, 7, 365, 'días sin venir'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            GrupoAjustes(
              titulo: 'Datos de la liga',
              pie: 'El país define el prefijo de teléfono y los números de emergencia. La zona horaria se guarda y se aplicará a los horarios cuando la app admita varias ligas; por ahora todo usa la hora de Ecuador.',
              filas: [
                FilaAjuste(
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
                FilaAjuste(
                  icono: Icons.flag_outlined,
                  seccion: 'identidad',
                  titulo: 'País',
                  valor: Paises.porCodigo(c.pais).nombre,
                  alTocar: () async {
                    final p = await elegirPais(context, paisEquipo: c.pais, actual: Paises.porCodigo(c.pais), titulo: 'País de la liga');
                    if (p != null && p.codigo != c.pais && context.mounted) await _guardar(context, c, {'pais': p.codigo});
                  },
                ),
                FilaAjuste(
                  icono: Icons.schedule_rounded,
                  seccion: 'identidad',
                  titulo: 'Zona horaria',
                  valor: zonas[c.zonaHoraria] ?? c.zonaHoraria,
                  alTocar: () => _elegir(context, c, 'Zona horaria', zonas, c.zonaHoraria, 'zonaHoraria'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
