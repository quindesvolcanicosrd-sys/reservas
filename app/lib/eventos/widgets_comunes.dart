import 'package:flutter/material.dart';

import '../core/tema.dart';
import 'modelos.dart';

/// Avatar circular: foto si la hay, si no la inicial sobre un color estable
/// derivado del nombre (paleta propia del tema).
class AvatarPersona extends StatelessWidget {
  const AvatarPersona({super.key, required this.nombre, this.foto = '', this.tamano = 40});
  final String nombre;
  final String foto;
  final double tamano;

  @override
  Widget build(BuildContext context) {
    final inicial = nombre.isEmpty ? '?' : String.fromCharCode(nombre.runes.first).toUpperCase();
    final color = PivotColores.avatares[nombre.hashCode.abs() % PivotColores.avatares.length];
    final circulo = Container(
      width: tamano,
      height: tamano,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Text(inicial, style: TextStyle(color: PivotColores.blanco, fontWeight: FontWeight.w700, fontSize: tamano * 0.42)),
    );
    if (foto.isEmpty) return circulo;
    return ClipOval(
      child: Image.network(
        foto,
        width: tamano,
        height: tamano,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => circulo,
        loadingBuilder: (_, child, progreso) => progreso == null ? child : circulo,
      ),
    );
  }
}

/// Etiqueta pequeña (estado propio, "Cancelado", etc.).
class Etiqueta extends StatelessWidget {
  const Etiqueta({super.key, required this.texto, this.icono, this.fondo, this.color});
  final String texto;
  final IconData? icono;
  final Color? fondo;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? PivotColores.sobreContenedorSuave;
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: fondo ?? PivotColores.contenedorSuave, borderRadius: BorderRadius.circular(PivotRadios.chip)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icono != null) ...[Icon(icono, size: 15, color: c), const SizedBox(width: 4)],
        Text(texto, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c)),
      ]),
    );
  }
}

String textoMiEstado(EstadoRsvp e) => switch (e) {
      EstadoRsvp.asistire => 'Asistirás',
      EstadoRsvp.noAsistire => 'No asistirás',
      EstadoRsvp.noJugador => 'No jugador',
    };

IconData iconoMiEstado(EstadoRsvp e) => switch (e) {
      EstadoRsvp.asistire => Icons.check_rounded,
      EstadoRsvp.noAsistire => Icons.close_rounded,
      EstadoRsvp.noJugador => Icons.visibility_outlined,
    };

String textoEstadoEvento(Evento ev) => ev.estado == EstadoEvento.sinEntrenamiento ? 'Sin entrenamiento' : 'Cancelado';

String textoCumple(Cumple c, DateTime hoy) {
  final dif = DateTime.utc(c.fecha.year, c.fecha.month, c.fecha.day).difference(DateTime.utc(hoy.year, hoy.month, hoy.day)).inDays;
  final e = c.edad;
  if (dif < 0) return e != null ? 'Cumplió $e años' : 'Celebró su cumpleaños';
  if (dif == 0) return e != null ? '¡Hoy cumple $e años!' : '¡Hoy es su cumpleaños!';
  return e != null ? 'Cumplirá $e años' : 'Próximo cumpleaños';
}
