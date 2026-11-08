import 'package:flutter/material.dart';

import '../core/tema.dart';
import 'modelos.dart';

/// Avatar circular: foto si la hay, si no la inicial sobre un color estable
/// derivado del nombre (paleta del tema).
class AvatarPersona extends StatelessWidget {
  const AvatarPersona({super.key, required this.nombre, this.foto = '', this.tamano = 40, this.borde});
  final String nombre;
  final String foto;
  final double tamano;
  final Color? borde;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final inicial = nombre.isEmpty ? '?' : String.fromCharCode(nombre.runes.first).toUpperCase();
    final color = p.avatares[nombre.hashCode.abs() % p.avatares.length];
    final circulo = Container(
      width: tamano,
      height: tamano,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Text(
        inicial,
        style: TextStyle(color: p.sobreMarca, fontWeight: FontWeight.w700, fontSize: tamano * 0.42),
      ),
    );
    final contenido = foto.isEmpty
        ? circulo
        : ClipOval(
            child: Image.network(
              foto,
              width: tamano,
              height: tamano,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => circulo,
              loadingBuilder: (_, child, progreso) => progreso == null ? child : circulo,
            ),
          );
    if (borde == null) return contenido;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(color: borde, shape: BoxShape.circle),
      child: contenido,
    );
  }
}

/// Avatares superpuestos (máx. 3) + "+N".
class PilaAvatares extends StatelessWidget {
  const PilaAvatares({super.key, required this.personas, this.tamano = 26});
  final List<Persona> personas;
  final double tamano;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final visibles = personas.take(3).toList();
    final resto = personas.length - visibles.length;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (i, per) in visibles.indexed)
          Transform.translate(
            offset: Offset(-8.0 * i, 0),
            child: AvatarPersona(nombre: per.nombreMostrar, foto: per.fotoPerfil, tamano: tamano, borde: p.tarjeta),
          ),
        if (resto > 0)
          Transform.translate(
            offset: Offset(-8.0 * visibles.length + 4, 0),
            child: Text(
              '+$resto',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.textoSecundario),
            ),
          ),
      ],
    );
  }
}

/// Etiqueta pequeña (estado propio, "Cancelado", etc.).
class Etiqueta extends StatelessWidget {
  const Etiqueta({super.key, required this.texto, this.icono, this.apagada = false});
  final String texto;
  final IconData? icono;
  final bool apagada;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    final c = apagada ? p.texto : p.sobreSuave;
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: apagada ? p.apagadoEtiqueta : p.suave, borderRadius: BorderRadius.circular(PivotRadios.chip)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icono != null) ...[Icon(icono, size: 15, color: c), const SizedBox(width: 4)],
          Text(
            texto,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c),
          ),
        ],
      ),
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

/// "2 h", "1 h 30 min" a partir de 'HH:MM' de inicio y fin.
String duracionEvento(Evento ev) {
  int? minutos(String h) {
    final p = h.split(':');
    if (p.length < 2) return null;
    final a = int.tryParse(p[0]), b = int.tryParse(p[1]);
    return a == null || b == null ? null : a * 60 + b;
  }

  final i = minutos(ev.horaInicio), f = minutos(ev.horaFin);
  if (i == null || f == null || f <= i) return '';
  final d = f - i;
  final h = d ~/ 60, m = d % 60;
  if (h == 0) return '$m min';
  return m == 0 ? '$h h' : '$h h $m min';
}

/// Avatar que "vuela" entre pantallas (lista o evento → ficha). Sin el
/// Material de vuelo, el texto de la inicial se dibujaba con el subrayado
/// amarillo de depuración y la letra saltaba de tamaño; acá el vuelo escala
/// el avatar de destino entero con FittedBox, así letra y círculo crecen juntos.
class HeroAvatar extends StatelessWidget {
  const HeroAvatar({super.key, required this.tag, required this.child});
  final String tag;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Hero(
      tag: tag,
      flightShuttleBuilder: (_, _, _, _, destino) => Material(
        type: MaterialType.transparency,
        child: FittedBox(child: (destino.widget as Hero).child),
      ),
      child: Material(type: MaterialType.transparency, child: child),
    );
  }
}

/// Texto de una línea que, si no entra, se desliza de derecha a izquierda en
/// bucle con fundido en los bordes (nombres largos en Favoritos). Con
/// "reducir animaciones" queda cortado con "…".
class TextoDeslizante extends StatefulWidget {
  const TextoDeslizante({super.key, required this.texto, required this.estilo});
  final String texto;
  final TextStyle estilo;

  @override
  State<TextoDeslizante> createState() => _TextoDeslizanteState();
}

class _TextoDeslizanteState extends State<TextoDeslizante> with SingleTickerProviderStateMixin {
  static const _hueco = 24.0;
  late final _c = AnimationController(vsync: this);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, cons) {
        final tp = TextPainter(
          text: TextSpan(text: widget.texto, style: widget.estilo),
          maxLines: 1,
          textDirection: TextDirection.ltr,
          textScaler: MediaQuery.textScalerOf(context),
        )..layout();
        final ancho = tp.width;
        final cabe = ancho <= cons.maxWidth;
        if (cabe || MediaQuery.of(context).disableAnimations) {
          _c.stop();
          return Text(widget.texto, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: widget.estilo);
        }
        final recorrido = ancho + _hueco;
        // ~30 px/s, con una pausa al inicio de cada vuelta.
        final mov = Duration(milliseconds: (recorrido / 30 * 1000).round());
        final total = mov + const Duration(milliseconds: 1600);
        if (_c.duration != total) {
          _c.duration = total;
          _c.repeat();
        }
        final pausa = 1600 / total.inMilliseconds;
        return ShaderMask(
          blendMode: BlendMode.dstIn,
          shaderCallback: (r) => const LinearGradient(
            colors: [Color(0x00000000), Color(0xFF000000), Color(0xFF000000), Color(0x00000000)],
            stops: [0, 0.12, 0.88, 1],
          ).createShader(r),
          child: ClipRect(
            child: SizedBox(
              height: tp.height,
              child: AnimatedBuilder(
                animation: _c,
                builder: (context, _) {
                  final t = _c.value < pausa ? 0.0 : Curves.linear.transform((_c.value - pausa) / (1 - pausa));
                  return OverflowBox(
                    alignment: Alignment.centerLeft,
                    maxWidth: double.infinity,
                    child: Transform.translate(
                      offset: Offset(-recorrido * t, 0),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(widget.texto, maxLines: 1, softWrap: false, style: widget.estilo),
                          const SizedBox(width: _hueco),
                          Text(widget.texto, maxLines: 1, softWrap: false, style: widget.estilo),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }
}
