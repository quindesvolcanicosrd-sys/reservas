import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Paleta de Pivot (equivalente a colors.css de la web): TODOS los colores de
/// la app salen de acá, con una versión clara y una oscura. Ningún widget
/// define colores sueltos: usa `context.pivot.<color>` o el `colorScheme`.
@immutable
class PivotPaleta extends ThemeExtension<PivotPaleta> {
  const PivotPaleta({
    required this.marca,
    required this.marcaTexto,
    required this.fondo,
    required this.tarjeta,
    required this.tarjetaBorde,
    required this.suave,
    required this.sobreSuave,
    required this.navegacion,
    required this.texto,
    required this.textoSecundario,
    required this.borde,
    required this.bordeSuave,
    required this.lineaTimeline,
    required this.apagado,
    required this.apagadoFondo,
    required this.apagadoPunto,
    required this.apagadoEtiqueta,
    required this.sobreMarca,
    required this.velo,
    required this.veloTour,
    required this.fondoVideo,
    required this.textoSobreVideo,
    required this.avatares,
  });

  final Color marca; // fondos y elementos de marca (#E8000D)
  final Color marcaTexto; // texto rojo con contraste suficiente sobre el fondo
  final Color fondo;
  final Color tarjeta;
  final Color tarjetaBorde;
  final Color suave; // contenedor rosado (seleccionado, etiquetas)
  final Color sobreSuave;
  final Color navegacion;
  final Color texto;
  final Color textoSecundario;
  final Color borde;
  final Color bordeSuave;
  final Color lineaTimeline;
  final Color apagado; // texto de eventos cancelados
  final Color apagadoFondo;
  final Color apagadoPunto;
  final Color apagadoEtiqueta;
  final Color sobreMarca; // texto/íconos sobre el rojo de marca
  final Color velo; // sombras/velos
  final Color veloTour; // fondo oscuro del tour guiado
  final Color fondoVideo; // reproductor de video (negro en ambos temas)
  final Color textoSobreVideo;
  final List<Color> avatares;

  static const _avatares = [Color(0xFFE8000D), Color(0xFF775652), Color(0xFF3B6470), Color(0xFF6B5778), Color(0xFF5D6230), Color(0xFF8A4F2A)];

  /// Ajustes y Mi perfil: íconos en cuadros con degradados de la escala de
  /// la marca (rojo, coral, vino y rosa; captura de Victor, 2026-11-08). En
  /// oscuro, los tonos vino pasan a rosa para que no se pierdan en el fondo.
  static const _rojo = [Color(0xFFFF3B3B), Color(0xFFC8000F)];
  static const _coral = [Color(0xFFFF8080), Color(0xFFFF1F1F)];
  static const _rojoVino = [Color(0xFFE8001C), Color(0xFF5A0F14)];
  static const _vino = [Color(0xFF7A1A20), Color(0xFF2E0A0C)];
  static const _rosa = [Color(0xFFFFE0E0), Color(0xFFFFB0B0)];
  static const _rosaFuerte = [Color(0xFFFFC2C2), Color(0xFFFF8585)];
  static const _sobreRosa = Color(0xFFC8000F);
  static const _sobreRosaFuerte = Color(0xFF3A0D10);
  static const _sobreVino = Color(0xFFFFD9D9);

  /// Degradado y color del ícono para una sección ('reservas', 'cuota',
  /// 'salud', 'identidad', 'privacidad', 'notificaciones', 'cuenta', o los de
  /// Mi perfil: 'foto', 'nombre', 'numero', 'pronombres', 'roles', 'ingreso',
  /// 'telefono', 'equipamiento').
  static (LinearGradient, Color) seccion(String clave, Brightness b) {
    final oscuro = b == Brightness.dark;
    final (List<Color> c, Color icono) = switch (clave) {
      'reservas' || 'nombre' || 'telefono' => (_rojo, sobreSeccion),
      'cuota' || 'pronombres' => (_rosa, _sobreRosa),
      'salud' || 'foto' => (_rojo, sobreSeccion),
      'identidad' || 'numero' || 'ingreso' => oscuro ? (_rosaFuerte, _sobreRosaFuerte) : (_vino, _sobreVino),
      'privacidad' || 'roles' => (_rojoVino, sobreSeccion),
      'notificaciones' || 'equipamiento' => (_coral, sobreSeccion),
      _ => oscuro ? (_rosa, _sobreRosa) : (_vino, _sobreVino),
    };
    return (LinearGradient(colors: c, begin: Alignment.topLeft, end: Alignment.bottomRight), icono);
  }

  /// Tarjetas grandes de color (ficha de emergencia, credencial, interruptor
  /// de notificaciones).
  static const degradadoSalud = LinearGradient(colors: [Color(0xFFFF2D2D), Color(0xFFB0000E)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const degradadoIdentidad = LinearGradient(colors: [Color(0xFF8A1A22), Color(0xFF2A0709)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const degradadoMarca = LinearGradient(colors: [Color(0xFFFF3B3B), Color(0xFF8A0F18)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const seccionSalud = Color(0xFFE5121B);

  /// Loader (`PivotCargando`): rojo y vino de la marca; en oscuro, rosa.
  static const cargandoRojo = Color(0xFFFF0000);
  static const cargandoVino = Color(0xFF260808);
  static const cargandoRosa = Color(0xFFFFD9D9);
  static const sobreSeccion = Color(0xFFFFFFFF);

  /// Confeti de la tarjeta de cumpleaños (mismo en claro y oscuro).
  static const confeti = [Color(0xFFE8000D), Color(0xFFFFB300), Color(0xFF43A047), Color(0xFF1E88E5), Color(0xFF8E24AA), Color(0xFFFF7043)];

  static const claro = PivotPaleta(
    marca: Color(0xFFE8000D),
    marcaTexto: Color(0xFFB8000A),
    fondo: Color(0xFFFFFBFA),
    tarjeta: Color(0xFFFFF1EF),
    tarjetaBorde: Color(0xFFEAD5D1),
    suave: Color(0xFFFFDAD5),
    sobreSuave: Color(0xFF410002),
    navegacion: Color(0xFFFBE9E7),
    texto: Color(0xFF231918),
    textoSecundario: Color(0xFF534341),
    borde: Color(0xFF857371),
    bordeSuave: Color(0xFFD8C2BF),
    lineaTimeline: Color(0xFFEAD5D1),
    apagado: Color(0xFF6E5A58),
    apagadoFondo: Color(0xFFF5EDEC),
    apagadoPunto: Color(0xFFB5A5A2),
    apagadoEtiqueta: Color(0xFFE9DEDC),
    sobreMarca: Color(0xFFFFFFFF),
    velo: Color(0x2E231918),
    veloTour: Color(0xB3000000),
    fondoVideo: Color(0xFF000000),
    textoSobreVideo: Color(0xFFFFFFFF),
    avatares: _avatares,
  );

  /// Oscuro: mismo criterio que el modo oscuro de la web (fondo casi negro,
  /// tarjetas grafito, rojo de marca para lo importante).
  static const oscuro = PivotPaleta(
    marca: Color(0xFFFF2020),
    marcaTexto: Color(0xFFFF6B5E),
    fondo: Color(0xFF0E0E0E),
    tarjeta: Color(0xFF1A1A1A),
    tarjetaBorde: Color(0xFF2E2E2E),
    suave: Color(0xFF3A1412),
    sobreSuave: Color(0xFFFFDAD5),
    navegacion: Color(0xFF161616),
    texto: Color(0xFFF2ECEB),
    textoSecundario: Color(0xFFBBAEAC),
    borde: Color(0xFF6B6260),
    bordeSuave: Color(0xFF3A3534),
    lineaTimeline: Color(0xFF3A3534),
    apagado: Color(0xFF8E8381),
    apagadoFondo: Color(0xFF151313),
    apagadoPunto: Color(0xFF5E5654),
    apagadoEtiqueta: Color(0xFF2A2625),
    sobreMarca: Color(0xFFFFFFFF),
    velo: Color(0x66000000),
    veloTour: Color(0xC7000000),
    fondoVideo: Color(0xFF000000),
    textoSobreVideo: Color(0xFFFFFFFF),
    avatares: _avatares,
  );

  @override
  PivotPaleta copyWith() => this;

  @override
  PivotPaleta lerp(ThemeExtension<PivotPaleta>? other, double t) => t < 0.5 || other is! PivotPaleta ? this : other;
}

extension PivotContexto on BuildContext {
  PivotPaleta get pivot => Theme.of(this).extension<PivotPaleta>() ?? PivotPaleta.claro;
}

/// Números dentro de íconos (el día en el ícono de Eventos): Nunito Black,
/// redondeada y muy gruesa para que se lea a 11-12 px.
class PivotTexto {
  static TextStyle numeroIcono(Color color, {double tam = 12}) =>
      GoogleFonts.nunito(fontSize: tam, height: 1, fontWeight: FontWeight.w900, color: color, letterSpacing: -0.4);
}

class PivotRadios {
  static const iconoDia = 7.0; // ícono de Eventos con el día
  static const tarjeta = 16.0;
  static const chip = 8.0;
  static const boton = 20.0;
  static const grande = 20.0;
  static const contador = 12.0;
}

ThemeData construirTema(Brightness brillo) {
  final p = brillo == Brightness.dark ? PivotPaleta.oscuro : PivotPaleta.claro;
  final esquema = ColorScheme.fromSeed(seedColor: p.marca, brightness: brillo).copyWith(
    primary: p.marca,
    onPrimary: p.sobreMarca,
    primaryContainer: p.suave,
    onPrimaryContainer: p.sobreSuave,
    secondaryContainer: p.suave,
    onSecondaryContainer: p.sobreSuave,
    surface: p.fondo,
    onSurface: p.texto,
    onSurfaceVariant: p.textoSecundario,
    surfaceContainerLowest: p.fondo,
    surfaceContainerLow: p.tarjeta,
    surfaceContainer: p.navegacion,
    surfaceContainerHigh: p.tarjeta,
    surfaceContainerHighest: p.tarjeta,
    outline: p.borde,
    outlineVariant: p.bordeSuave,
  );
  final base = brillo == Brightness.dark ? ThemeData.dark() : ThemeData.light();
  final textos = GoogleFonts.beVietnamProTextTheme(base.textTheme).apply(bodyColor: p.texto, displayColor: p.texto);
  TextStyle fuente(double tam, FontWeight peso, [Color? color]) => GoogleFonts.beVietnamPro(fontSize: tam, fontWeight: peso, color: color);
  return ThemeData(
    useMaterial3: true,
    brightness: brillo,
    colorScheme: esquema,
    extensions: [p],
    scaffoldBackgroundColor: p.fondo,
    textTheme: textos,
    appBarTheme: AppBarTheme(backgroundColor: p.fondo, surfaceTintColor: p.fondo, foregroundColor: p.texto, elevation: 0),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.navegacion,
      indicatorColor: p.suave,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? p.sobreSuave : p.textoSecundario)),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => fuente(12, s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500, s.contains(WidgetState.selected) ? p.texto : p.textoSecundario),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 40),
        backgroundColor: p.marca,
        foregroundColor: p.sobreMarca,
        shape: const StadiumBorder(),
        textStyle: fuente(13, FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 40),
        foregroundColor: p.texto,
        side: BorderSide(color: p.borde),
        shape: const StadiumBorder(),
        textStyle: fuente(13, FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: p.marcaTexto, textStyle: fuente(14, FontWeight.w600)),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: p.suave,
        selectedForegroundColor: p.sobreSuave,
        foregroundColor: p.texto,
        side: BorderSide(color: p.borde),
        textStyle: fuente(13, FontWeight.w600),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: p.fondo,
      selectedColor: p.suave,
      side: BorderSide(color: p.bordeSuave),
      labelStyle: fuente(14, FontWeight.w500, p.texto),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.chip)),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: p.suave,
      foregroundColor: p.sobreSuave,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PivotRadios.tarjeta)),
    ),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: p.fondo, surfaceTintColor: p.fondo, showDragHandle: true),
    dialogTheme: DialogThemeData(backgroundColor: p.fondo, surfaceTintColor: p.fondo),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.tarjeta,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(PivotRadios.boton), borderSide: BorderSide.none),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {TargetPlatform.android: PredictiveBackPageTransitionsBuilder()}),
  );
}
