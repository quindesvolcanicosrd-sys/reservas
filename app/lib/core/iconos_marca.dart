import 'package:flutter/widgets.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

/// Logos de redes (Font Awesome), para usar en `Icon` como cualquier ícono.
/// Victor, 2026-11-13: siempre que algo abra WhatsApp, con su logo.
abstract final class IconosMarca {
  static final IconData whatsapp = FontAwesomeIcons.whatsapp.data;
  static final IconData instagram = FontAwesomeIcons.instagram.data;
  static final IconData facebook = FontAwesomeIcons.facebook.data;
  static final IconData messenger = FontAwesomeIcons.facebookMessenger.data;
  static final IconData tiktok = FontAwesomeIcons.tiktok.data;
  static final IconData youtube = FontAwesomeIcons.youtube.data;
  static final IconData telegram = FontAwesomeIcons.telegram.data;
  static final IconData signal = FontAwesomeIcons.signalMessenger.data;
  static final IconData discord = FontAwesomeIcons.discord.data;
}
