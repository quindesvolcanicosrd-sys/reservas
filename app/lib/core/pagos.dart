/// Medios de pago del club: los mismos datos que muestra la web en la
/// pantalla de pago (`#s-pago`, index.html). Si cambian allá, cambiar acá.
class Pagos {
  /// Enlace personal de DeUna (no lleva monto: la persona lo escribe).
  /// Para que DeUna confirme solo hace falta DeUna Empresas (ver MANIFEST).
  static const deuna = 'https://pagar.deuna.app/H92p/person/payment?id=34699738dd140ab641e3993377662e6a210132d2';

  static const banco = 'Banco Internacional';
  static const cuenta = [
    ('Tipo', 'Cuenta de ahorros'),
    ('N° de cuenta', '398027628'),
    ('Titular', 'Victor Del Bono'),
    ('CI', '1759369331'),
    ('Cel', '0962773052'),
  ];

  /// WhatsApp al que se manda el comprobante.
  static const whatsapp = '593998690423';
}
