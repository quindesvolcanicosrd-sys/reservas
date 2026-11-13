import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/geocodificacion.dart';
import '../core/paises.dart';
import '../core/selector_ubicacion.dart';
import '../core/tema.dart';
import '../sesion/sesion.dart';
import 'campos.dart';
import 'componentes.dart';

/// Identidad y dirección (Victor, 2026-11-07): tu documento como una
/// credencial y tu dirección con mapa (OpenStreetMap). Ubicar el pin llena
/// calle, número, sector y cantón, que después se pueden corregir a mano,
/// como en la web.
class IdentidadScreen extends StatefulWidget {
  const IdentidadScreen({super.key, required this.sesion});
  final Sesion sesion;

  @override
  State<IdentidadScreen> createState() => _IdentidadScreenState();
}

class _IdentidadScreenState extends State<IdentidadScreen> {
  LatLng? _punto;
  bool _buscandoPunto = true;
  bool _pinManual = false;
  String _ultimaDireccion = '';

  Sesion get s => widget.sesion;

  @override
  void initState() {
    super.initState();
    unawaited(s.cargarPaisEquipo());
    _ubicar();
  }

  /// Solo las calles mueven el pin: cambiar el sector o la ciudad a mano no
  /// lo sobrescribe (Victor, 2026-11-13).
  String get _calles => [valorDe(s, 'callePrincipal'), valorDe(s, 'numeracion'), valorDe(s, 'calleSecundaria')].join('|');

  String get _direccion => [
    [valorDe(s, 'callePrincipal'), valorDe(s, 'numeracion')].where((x) => x.isNotEmpty).join(' '),
    valorDe(s, 'calleSecundaria'),
    valorDe(s, 'sector'),
    valorDe(s, 'canton'),
  ].where((x) => x.isNotEmpty).join(', ');

  /// Centra la vista previa en la dirección guardada (si se encuentra).
  /// Prueba de lo más preciso a lo más general (bug, Victor 2026-11-12: con
  /// la dirección completa a veces no aparecía el pin): calle principal y
  /// secundaria con el sector, luego la calle con el sector, luego el sector.
  Future<void> _ubicar() async {
    final d = _direccion;
    final primeraVez = _ultimaDireccion.isEmpty && _punto == null;
    _ultimaDireccion = _calles;
    // El pin guardado manda (migración 20261113080000): se muestra tal cual.
    final lat = double.tryParse(valorDe(s, 'direccionLat')), lng = double.tryParse(valorDe(s, 'direccionLng'));
    if (primeraVez && lat != null && lng != null) {
      if (mounted) {
        setState(() {
          _punto = LatLng(lat, lng);
          _buscandoPunto = false;
        });
      }
      return;
    }
    // Si cambiaron la dirección a mano, el pin guardado ya no corresponde.
    if (!primeraVez && lat != null) unawaited(s.guardarDatos({'direccionLat': '', 'direccionLng': ''}).catchError((_) {}));
    if (d.isEmpty) {
      if (mounted) setState(() => _buscandoPunto = false);
      return;
    }
    final principal = valorDe(s, 'callePrincipal'), secundaria = valorDe(s, 'calleSecundaria');
    final sector = valorDe(s, 'sector'), canton = valorDe(s, 'canton');
    String unir(List<String> l) => l.where((x) => x.isNotEmpty).join(', ');
    final intentos = <String>{
      d,
      unir([if (principal.isNotEmpty && secundaria.isNotEmpty) '$principal y $secundaria', sector, canton]),
      unir([principal, sector, canton]),
      unir([principal, canton]),
      unir([sector, canton]),
    }.where((x) => x.length >= 4);
    LatLng? p;
    for (final q in intentos) {
      p = await Geocodificacion.buscar(q, pais: s.paisEquipo);
      if (p != null || !mounted) break;
    }
    if (mounted) {
      setState(() {
        _punto = p;
        _buscandoPunto = false;
      });
    }
  }

  Future<void> _abrirMapa() async {
    final elegido = await Navigator.of(context).push<LatLng>(
      MaterialPageRoute(
        builder: (_) => _MapaDireccion(inicial: _punto, pais: s.paisEquipo, consulta: _direccion),
      ),
    );
    if (elegido == null || !mounted) return;
    setState(() => _punto = elegido);
    final campos = await Geocodificacion.inversa(elegido);
    if (!mounted) return;
    if (campos.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No reconocimos la calle en ese punto. Escríbela abajo.')));
      return;
    }
    // El pin que pusiste manda: al guardar la calle no se vuelve a buscar
    // (antes el mapa se reiniciaba a otro punto o a Quito).
    _pinManual = true;
    await guardarCampos(context, s, {...campos, 'direccionLat': '${elegido.latitude}', 'direccionLng': '${elegido.longitude}'});
    if (mounted) {
      setState(() {
        _ultimaDireccion = _calles;
        _pinManual = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: s,
      builder: (context, _) {
        // Si cambiaron la dirección a mano, se vuelve a ubicar la vista previa.
        if (_calles != _ultimaDireccion && !_buscandoPunto && !_pinManual) {
          _buscandoPunto = true;
          scheduleMicrotask(_ubicar);
        }
        final pais = Paises.desdeValor(valorDe(s, 'paisExpedicion'));
        return SubAjustes(
          titulo: 'Identidad y dirección',
          hijos: [
            const AvisoPrivado(),
            _Credencial(sesion: s, pais: pais),
            const SizedBox(height: 12),
            GrupoAjustes(
              filas: [
                FilaAjuste(
                  icono: Icons.person_outline_rounded,
                  titulo: 'Nombre legal',
                  valor: valorDe(s, 'nombreLegal'),
                  alTocar: () => editarCampo(context, s, 'nombreLegal', 'Nombre legal', ayuda: 'Como aparece en tu documento.', maxLength: 100),
                ),
                FilaAjuste(
                  icono: Icons.badge_outlined,
                  titulo: 'Tipo de documento',
                  valor: valorDe(s, 'tipoDocumento'),
                  alTocar: () => elegirCampo(context, s, 'tipoDocumento', 'Tipo de documento', const ['Cédula', 'DNI', 'Pasaporte'], otro: true),
                ),
                FilaAjuste(
                  icono: Icons.numbers_rounded,
                  titulo: 'Número de documento',
                  valor: valorDe(s, 'numeroDocumento'),
                  alTocar: () => editarCampo(context, s, 'numeroDocumento', 'Número de documento', maxLength: 30),
                ),
                FilaAjuste(
                  icono: Icons.public_rounded,
                  titulo: 'País de emisión',
                  valor: pais == null ? valorDe(s, 'paisExpedicion') : pais.nombre,
                  alTocar: () async {
                    final x = await elegirPais(context, paisEquipo: s.paisEquipo, actual: pais, titulo: 'País de emisión');
                    if (x != null && context.mounted) await guardarCampos(context, s, {'paisExpedicion': x.nombre});
                  },
                ),
              ],
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
              child: Text(
                'Dirección',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: context.pivot.texto),
              ),
            ),
            // Mapa y campos en una sola tarjeta: es todo la misma dirección.
            // Al escribir la dirección a mano, el pin se vuelve a ubicar solo.
            GrupoAjustes(
              cabecera: _VistaMapa(punto: _punto, cargando: _buscandoPunto, alTocar: _abrirMapa),
              filas: [
                for (final (campo, icono, titulo, max) in const [
                  ('callePrincipal', Icons.signpost_outlined, 'Calle principal', 80),
                  ('numeracion', Icons.pin_outlined, 'Numeración', 20),
                  ('calleSecundaria', Icons.alt_route_rounded, 'Calle secundaria', 80),
                  ('sector', Icons.holiday_village_outlined, 'Sector o barrio', 80),
                  ('canton', Icons.location_city_outlined, 'Ciudad', 80),
                ])
                  FilaAjuste(
                    icono: icono,
                    titulo: titulo,
                    valor: valorDe(s, campo),
                    alTocar: () => editarCampo(context, s, campo, titulo, maxLength: max),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

/// Documento con aspecto de credencial.
class _Credencial extends StatelessWidget {
  const _Credencial({required this.sesion, required this.pais});
  final Sesion sesion;
  final Pais? pais;

  @override
  Widget build(BuildContext context) {
    const sobre = PivotPaleta.sobreSeccion;
    final tipo = valorDe(sesion, 'tipoDocumento');
    final numero = valorDe(sesion, 'numeroDocumento');
    final nombre = valorDe(sesion, 'nombreLegal');
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(gradient: PivotPaleta.degradadoIdentidad, borderRadius: BorderRadius.circular(PivotRadios.grande)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                (tipo.isEmpty ? 'Documento' : tipo).toUpperCase(),
                style: TextStyle(color: sobre.withValues(alpha: 0.9), fontSize: 12.5, fontWeight: FontWeight.w800, letterSpacing: 1.2),
              ),
              const Spacer(),
              if (pais != null) BanderaPais(pais: pais!, alto: 22, radio: 4),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            numero.isEmpty ? '— — — — — —' : numero,
            style: const TextStyle(color: sobre, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 1.5),
          ),
          const SizedBox(height: 6),
          Text(
            nombre.isEmpty ? 'Tu nombre legal' : nombre,
            style: TextStyle(
              color: sobre.withValues(alpha: nombre.isEmpty ? 0.7 : 1),
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (numero.isEmpty || nombre.isEmpty) ...[
            const SizedBox(height: 10),
            Text('Complétalo abajo.', style: TextStyle(color: sobre.withValues(alpha: 0.85), fontSize: 12.5)),
          ],
        ],
      ),
    );
  }
}

/// Vista previa del mapa (sin gestos); tocarla abre el mapa completo.
class _VistaMapa extends StatelessWidget {
  const _VistaMapa({required this.punto, required this.cargando, required this.alTocar});
  final LatLng? punto;
  final bool cargando;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return ClipRect(
      child: SizedBox(
        height: 170,
        child: Stack(
          fit: StackFit.expand,
          children: [
            AbsorbPointer(
              child: FlutterMap(
                key: ValueKey(punto),
                options: MapOptions(initialCenter: punto ?? SelectorUbicacion.quito, initialZoom: punto == null ? 11 : 16),
                children: [
                  TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.pivotapp.coach'),
                  if (punto != null)
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: punto!,
                          width: 40,
                          height: 40,
                          alignment: Alignment.topCenter,
                          child: Icon(Icons.location_on_rounded, size: 40, color: p.marca),
                        ),
                      ],
                    ),
                ],
              ),
            ),
            Material(
              color: Colors.transparent,
              child: InkWell(onTap: alTocar),
            ),
            Positioned(
              right: 10,
              bottom: 10,
              child: IgnorePointer(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: p.tarjeta, borderRadius: BorderRadius.circular(PivotRadios.boton)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.edit_location_alt_outlined, size: 18, color: p.marcaTexto),
                      const SizedBox(width: 6),
                      Text(
                        punto == null ? 'Ubicar en el mapa' : 'Mover el pin',
                        style: TextStyle(fontWeight: FontWeight.w700, color: p.texto),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (cargando) const Positioned(left: 10, top: 10, child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
          ],
        ),
      ),
    );
  }
}

/// Mapa completo con buscador y pin al centro; devuelve el punto elegido.
class _MapaDireccion extends StatefulWidget {
  const _MapaDireccion({required this.inicial, required this.pais, required this.consulta});
  final LatLng? inicial;
  final String pais;
  final String consulta;

  @override
  State<_MapaDireccion> createState() => _MapaDireccionState();
}

class _MapaDireccionState extends State<_MapaDireccion> {
  late LatLng _centro = widget.inicial ?? SelectorUbicacion.quito;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tu dirección', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: SelectorUbicacion(
          inicial: widget.inicial,
          pais: widget.pais,
          ayuda: 'Mueve el mapa para dejar el pin en tu casa.',
          alCambiar: (p) => _centro = p,
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: () => Navigator.of(context).pop(_centro),
            child: const Text('Usar esta ubicación'),
          ),
        ),
      ),
    );
  }
}
