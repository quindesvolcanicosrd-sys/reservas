import 'package:flutter/material.dart';

import 'tema.dart';

/// Una opción del menú del "+".
class AccionMenu {
  const AccionMenu(this.icono, this.texto, this.alTocar);
  final IconData icono;
  final String texto;
  final VoidCallback alTocar;
}

/// Menú del "+" (el de Calendario, para toda la app): opciones con ícono y
/// texto que suben escalonadas desde el botón, que gira a ×.
class MenuAcciones extends StatefulWidget {
  const MenuAcciones({super.key, required this.acciones, this.abajo = 0});
  final List<AccionMenu> acciones;

  /// Alto de la barra inferior debajo del FAB (0 en pantallas sin barra).
  final double abajo;

  static Future<void> abrir(BuildContext context, List<AccionMenu> acciones, {double abajo = 0}) async {
    if (acciones.length == 1) {
      acciones.first.alTocar();
      return;
    }
    final elegida = await showGeneralDialog<AccionMenu>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Cerrar',
      barrierColor: context.pivot.velo,
      transitionDuration: const Duration(milliseconds: 320),
      pageBuilder: (c, _, _) => MenuAcciones(acciones: acciones, abajo: abajo),
      transitionBuilder: (c, a, _, hijo) => FadeTransition(
        opacity: CurvedAnimation(parent: a, curve: Curves.easeOut),
        child: hijo,
      ),
    );
    elegida?.alTocar();
  }

  @override
  State<MenuAcciones> createState() => _MenuAccionesState();
}

class _MenuAccionesState extends State<MenuAcciones> {
  @override
  Widget build(BuildContext context) {
    // La animación de la propia ruta: al abrir va hacia adelante y al cerrar
    // (tocar ×, el velo o atrás) se invierte sola, así el "+" también gira de vuelta.
    final Animation<double> ruta = ModalRoute.of(context)?.animation ?? kAlwaysCompleteAnimation;
    final p = context.pivot;
    final n = widget.acciones.length;
    return SafeArea(
      child: Padding(
        // Mismo lugar que el FAB del Scaffold (16 px del borde; `abajo` = barra inferior).
        padding: EdgeInsets.only(right: 16, bottom: 16 + widget.abajo),
        child: Align(
          alignment: Alignment.bottomRight,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < n; i++)
                Builder(
                  builder: (context) {
                    // La más cercana al botón aparece primero.
                    final inicio = (n - 1 - i) * 0.12;
                    final anim = CurvedAnimation(
                      parent: ruta,
                      curve: Interval(inicio, (inicio + 0.6).clamp(0, 1), curve: Curves.easeOutCubic),
                    );
                    final ac = widget.acciones[i];
                    return FadeTransition(
                      opacity: anim,
                      child: SlideTransition(
                        position: Tween(begin: const Offset(0, 0.4), end: Offset.zero).animate(anim),
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Material(
                            color: p.tarjeta,
                            elevation: 3,
                            shadowColor: p.velo,
                            borderRadius: BorderRadius.circular(PivotRadios.boton),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(PivotRadios.boton),
                              onTap: () => Navigator.of(context).pop(ac),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(ac.icono, color: p.marcaTexto),
                                    const SizedBox(width: 12),
                                    Text(
                                      ac.texto,
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.texto),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              FloatingActionButton(
                heroTag: null,
                tooltip: 'Cerrar',
                onPressed: () => Navigator.of(context).pop(),
                child: RotationTransition(
                  turns: Tween(begin: 0.0, end: 0.125).animate(CurvedAnimation(parent: ruta, curve: Curves.easeOutCubic)),
                  child: const Icon(Icons.add_rounded),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
