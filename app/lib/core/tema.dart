import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tema único de la app (equivalente a colors.css + estilos compartidos de la
/// web): TODOS los colores, radios y tipografía salen de acá. Ningún widget
/// define colores sueltos; usa `Theme.of(context).colorScheme` o `PivotColores`.
class PivotColores {
  static const marca = Color(0xFFE8000D);
  static const marcaOscura = Color(0xFFB8000A);
  static const fondo = Color(0xFFFFFBFA);
  static const superficieTarjeta = Color(0xFFFFF1EF);
  static const contenedorSuave = Color(0xFFFFDAD5);
  static const sobreContenedorSuave = Color(0xFF410002);
  static const navegacion = Color(0xFFFBE9E7);
  static const texto = Color(0xFF231918);
  static const textoSecundario = Color(0xFF534341);
  static const borde = Color(0xFF857371);
  static const bordeSuave = Color(0xFFD8C2BF);
  static const lineaTimeline = Color(0xFFEAD5D1);
  static const cancelado = Color(0xFF6E5A58);
  static const canceladoFondo = Color(0xFFF5EDEC);
  static const canceladoPunto = Color(0xFFB5A5A2);
  static const canceladoEtiqueta = Color(0xFFE9DEDC);
  static const blanco = Color(0xFFFFFFFF);
  /// Fondo de los avatares sin foto (color estable por nombre).
  static const avatares = [
    Color(0xFFE8000D), Color(0xFF775652), Color(0xFF3B6470),
    Color(0xFF6B5778), Color(0xFF5D6230), Color(0xFF8A4F2A),
  ];
}

class PivotRadios {
  static const tarjeta = 16.0;
  static const chip = 8.0;
  static const boton = 20.0;
  static const grande = 20.0;
}

ThemeData construirTema() {
  final base = ColorScheme.fromSeed(seedColor: PivotColores.marca, brightness: Brightness.light).copyWith(
    primary: PivotColores.marca,
    onPrimary: PivotColores.blanco,
    primaryContainer: PivotColores.contenedorSuave,
    onPrimaryContainer: PivotColores.sobreContenedorSuave,
    secondaryContainer: PivotColores.contenedorSuave,
    onSecondaryContainer: PivotColores.sobreContenedorSuave,
    surface: PivotColores.fondo,
    onSurface: PivotColores.texto,
    onSurfaceVariant: PivotColores.textoSecundario,
    surfaceContainerLow: PivotColores.superficieTarjeta,
    surfaceContainer: PivotColores.navegacion,
    outline: PivotColores.borde,
    outlineVariant: PivotColores.bordeSuave,
  );
  final textos = GoogleFonts.beVietnamProTextTheme().apply(
    bodyColor: PivotColores.texto,
    displayColor: PivotColores.texto,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: base,
    scaffoldBackgroundColor: PivotColores.fondo,
    textTheme: textos,
    appBarTheme: const AppBarTheme(
      backgroundColor: PivotColores.fondo,
      surfaceTintColor: PivotColores.fondo,
      foregroundColor: PivotColores.texto,
      elevation: 0,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: PivotColores.navegacion,
      indicatorColor: PivotColores.contenedorSuave,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => GoogleFonts.beVietnamPro(
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? PivotColores.texto : PivotColores.textoSecundario,
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 40),
        shape: const StadiumBorder(),
        textStyle: GoogleFonts.beVietnamPro(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 40),
        foregroundColor: PivotColores.texto,
        side: const BorderSide(color: PivotColores.borde),
        shape: const StadiumBorder(),
        textStyle: GoogleFonts.beVietnamPro(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: PivotColores.contenedorSuave,
        selectedForegroundColor: PivotColores.sobreContenedorSuave,
        side: const BorderSide(color: PivotColores.borde),
        textStyle: GoogleFonts.beVietnamPro(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
    }),
  );
}
