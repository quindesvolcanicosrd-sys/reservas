import 'package:flutter/foundation.dart';

/// Pestañas de la barra inferior que otras pantallas pueden abrir
/// (ej. "Editar mi perfil" desde tu ficha en Equipo).
enum Pestana { calendario, equipo, perfil }

class Navegacion {
  Navegacion._();

  /// La barra escucha y cambia de pestaña; vuelve a null al aplicarse.
  static final ir = ValueNotifier<Pestana?>(null);
}
