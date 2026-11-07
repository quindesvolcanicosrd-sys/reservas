import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import '../core/tema.dart';

/// "Ver video" dentro de Pivot (pedido 2026-11-07): los videos de YouTube
/// (también Shorts) se reproducen acá mismo; cualquier otro enlace se abre en
/// el navegador integrado de la app, sin salir de Pivot.
class VideoScreen extends StatefulWidget {
  const VideoScreen({super.key, required this.idYoutube, required this.vertical, required this.titulo});
  final String idYoutube;
  final bool vertical;
  final String titulo;

  /// Abre el video que corresponda según el enlace.
  static Future<void> abrir(BuildContext context, String url, {String titulo = 'Video'}) async {
    final id = idDeYoutube(url);
    if (id != null) {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => VideoScreen(idYoutube: id, vertical: url.contains('/shorts/'), titulo: titulo),
        ),
      );
      return;
    }
    final uri = Uri.tryParse(url);
    if (uri == null || !await launchUrl(uri, mode: LaunchMode.inAppBrowserView)) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir el video.')));
    }
  }

  /// youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/.
  static String? idDeYoutube(String url) {
    final m = RegExp(r'(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})').firstMatch(url);
    return m?.group(1);
  }

  @override
  State<VideoScreen> createState() => _VideoScreenState();
}

class _VideoScreenState extends State<VideoScreen> {
  late final YoutubePlayerController _ctrl = YoutubePlayerController.fromVideoId(
    videoId: widget.idYoutube,
    autoPlay: true,
    params: const YoutubePlayerParams(showFullscreenButton: true, strictRelatedVideos: true, playsInline: true),
  );

  @override
  void dispose() {
    _ctrl.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pivot;
    return Scaffold(
      backgroundColor: p.fondoVideo,
      appBar: AppBar(backgroundColor: p.fondoVideo, foregroundColor: p.textoSobreVideo, title: Text(widget.titulo)),
      body: SafeArea(
        child: Center(
          child: AspectRatio(
            aspectRatio: widget.vertical ? 9 / 16 : 16 / 9,
            child: YoutubePlayer(controller: _ctrl, aspectRatio: widget.vertical ? 9 / 16 : 16 / 9),
          ),
        ),
      ),
    );
  }
}
