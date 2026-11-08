import 'package:flutter/material.dart';

import '../eventos/eventos_repo.dart';
import 'tema.dart';

/// Franja sobre la barra de navegación cuando no hay señal o quedan cambios
/// guardados en el teléfono por subir. Aparece y se va deslizándose.
class AvisoSinConexion extends StatelessWidget {
  const AvisoSinConexion({super.key, required this.repo});
  final EventosRepo repo;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return ListenableBuilder(
      listenable: repo,
      builder: (context, _) {
        final n = repo.cola.pendientes;
        final sin = repo.sinConexion || repo.cola.sinConexion;
        final texto = n > 0
            ? (sin ? 'Sin conexión · $n ${n == 1 ? 'cambio guardado' : 'cambios guardados'} en el teléfono' : 'Subiendo $n ${n == 1 ? 'cambio' : 'cambios'}…')
            : (sin ? 'Sin conexión · viendo lo último guardado' : null);
        return AnimatedSize(
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
          alignment: Alignment.bottomCenter,
          child: texto == null
              ? const SizedBox(width: double.infinity)
              : Material(
                  color: p.suave,
                  child: InkWell(
                    onTap: repo.cola.sincronizar,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: Row(
                        children: [
                          Icon(sin ? Icons.cloud_off_rounded : Icons.cloud_upload_outlined, size: 18, color: p.sobreSuave),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              texto,
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: p.sobreSuave),
                            ),
                          ),
                          if (n > 0 && sin)
                            Text(
                              'Reintentar',
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: p.sobreSuave),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
        );
      },
    );
  }
}
