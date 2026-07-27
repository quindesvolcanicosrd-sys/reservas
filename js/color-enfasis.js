/* ══ COLOR DE ÉNFASIS — motor de derivación (Tanda 1/2) ═══════════════════
   Port de la lógica de Pivot (aplicarColorPrimario(hex), js/ajustes.js de
   Pivot) a las variables reales que Mirlxs ya tiene en css/colors.css —
   NO a los nombres de Pivot. Tanda 1: se aplica el naranja actual (#F97316)
   como valor fijo, para validar que el mecanismo no cambia nada visible
   antes de construir el selector real (Tanda 2).

   Mirlxs no tiene toggle manual de tema (a diferencia de Pivot) — el modo
   claro/oscuro depende 100% de prefers-color-scheme del sistema. Por eso
   este archivo escucha matchMedia('(prefers-color-scheme: dark)') y
   reaplica si el usuario cambia el tema del SO con la app abierta, en vez
   de asumir que ya existe un mecanismo de toggle como en Pivot.

   Alcance (inventario confirmado con Victor antes de escribir esto — ver
   MANIFEST.md, "Cambios recientes"): deriva TODA variable que hoy tenga
   algún tinte de marca en cualquiera de los 2 modos (claro u oscuro),
   incluida la familia de grises/cafés "ambiguos" que en un modo son
   neutros planos y en el otro ya son rgba(249,115,22,...) — con una única
   excepción real encontrada al hacer los números: `--border-slate` tiene
   un matiz AZUL genuino en claro (#cbd5e1, H≈213°, no emparentado con el
   naranja) — forzarle el matiz de marca ahí cambiaría un color que hoy no
   tiene nada que ver con la marca, así que su valor claro se deja fijo
   (colors.css) y solo el oscuro (que sí es rgba de marca) se deriva acá.
   Los estados (--success/--danger/--warning/--info), los acentos propios
   (--purple, --amber), y las excepciones de marca ajena ya documentadas
   (--deuna, --banco-internacional, --wa-brand) NUNCA se tocan acá.

   MÉTODO — matiz por DESPLAZAMIENTO RELATIVO, no absoluto (importante,
   corrige un bug real de la primera versión de este archivo): cada
   variable derivada de aquí conserva su propio matiz "delta" respecto al
   matiz original de la marca (#F97316), no se le fuerza el matiz exacto
   de la marca. Los ~70 valores hardcodeados que este archivo reemplaza
   nunca fueron generados por una fórmula — se eligieron a mano, cada uno
   con su propio matiz ligeramente distinto (todos "cálidos", 17°-30°,
   pero no idénticos entre sí ni idénticos al matiz exacto de --brand).
   Forzar el matiz exacto de la marca a todos (primera versión de este
   archivo) igual reproducía algo visualmente parecido, pero NO byte a
   byte — con el naranja de siempre como entrada, `--bg` daba `#fdf2eb`
   en vez de `#FDF3EB` (1 unidad de diferencia en verde), `--hint` daba
   hasta 7 unidades de diferencia — pequeño pero real, detectado
   comparando cada variable contra su valor pre-cambio con Playwright, no
   a simple vista. Con el desplazamiento relativo (`derivar()`/
   `derivarRgba()` abajo), cuando la entrada es el propio `#F97316` el
   delta de cada variable es exactamente el que ya tenía y el resultado
   reproduce el hex original bit a bit (verificado variable por variable);
   cuando la Tanda 2 cambie el color de entrada, cada variable rota su
   matiz la misma cantidad de grados que la marca, preservando la relación
   relativa que el paleta actual ya tiened entre sí en vez de aplanarlas
   todas al mismo matiz. */

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
  var num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hexToHsl(hex) { var c = hexToRgb(hex); return rgbToHsl(c.r, c.g, c.b); }
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var hue2rgb = function(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
function hslToHex(h, s, l) {
  var c = hslToRgb(h, s, l);
  return '#' + [c.r, c.g, c.b].map(function(x) { return x.toString(16).padStart(2, '0'); }).join('');
}

var _CE_BRAND_ORIGINAL = '#F97316';
var _CE_BRAND_ORIGINAL_HSL = hexToHsl(_CE_BRAND_ORIGINAL);
var _ceColorActual = null;

function aplicarColorEnfasis(hex) {
  _ceColorActual = hex;
  // Cachea el último color real aplicado (ver bottom de este archivo) -- sin
  // esto, cada carga de página arranca con el naranja default hasta que
  // js/auth.js resuelve su fetch async a adminGetColorEnfasis (Apps Script,
  // con cold starts de cientos de ms a varios segundos, ver MANIFEST.md) y
  // reaplica el color real -- visible como un recoloreo brusco de cualquier
  // UI de marca que ya esté en pantalla en ese momento (bug real encontrado
  // en la card de cumpleaños de Eventos, ver "Cambios recientes": al
  // derivar --cumple-bg/-border de --brand quedó expuesta a este salto
  // default→real que antes, con su tono fijo, no la afectaba).
  try { localStorage.setItem('ce_color_cache', hex); } catch (ex) {}
  var brand = hexToHsl(hex);
  var rgb = hexToRgb(hex);
  var oscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var root = document.documentElement;

  // rgba(entrada, alpha) directo — para la familia --brand* pura, ya
  // idéntica al matiz/saturación de la marca por definición, sin roundtrip
  // por HSL (innecesario y evita cualquier error de redondeo de más).
  function rgbaBrand(alpha) { return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')'; }

  // Deriva un color sólido a partir de su hex ORIGINAL (el que tenía
  // hardcodeado hoy en colors.css) conservando su desplazamiento de matiz
  // relativo a la marca — ver el comentario grande de cabecera.
  function derivar(hexOriginal) {
    var o = hexToHsl(hexOriginal);
    var deltaH = o.h - _CE_BRAND_ORIGINAL_HSL.h;
    return hslToHex(brand.h + deltaH, o.s, o.l);
  }
  // Igual que derivar(), pero para una variable rgba cuya base (color sin
  // alpha) es `hexBaseOriginal` — devuelve el string rgba completo.
  function derivarRgba(hexBaseOriginal, alpha) {
    var c = hexToRgb(derivar(hexBaseOriginal));
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }

  var vars = {};

  /* ── Familia --brand* (rgba directo, alpha fijo) ── */
  vars['--brand'] = hex;
  vars['--brand-dk'] = derivar('#ea6407');
  vars['--brand-secondary'] = derivar('#fb923c');
  vars['--brand-zero'] = rgbaBrand(0);
  vars['--brand-subtle'] = rgbaBrand(0.04);
  vars['--brand-lightest'] = rgbaBrand(0.06);
  vars['--brand-lighter'] = rgbaBrand(0.07);
  vars['--brand-08'] = rgbaBrand(0.08);
  vars['--brand-soft'] = rgbaBrand(0.1);
  vars['--brand-light'] = rgbaBrand(0.13);
  vars['--brand-mid'] = rgbaBrand(0.14);
  vars['--brand-focus'] = rgbaBrand(0.15);
  vars['--brand-hover'] = rgbaBrand(0.18);
  vars['--brand-20'] = rgbaBrand(0.2);
  vars['--brand-glow'] = rgbaBrand(0.25);
  vars['--brand-30'] = rgbaBrand(0.3);
  vars['--brand-pulse'] = rgbaBrand(0.35);
  vars['--brand-40'] = rgbaBrand(0.4);
  vars['--brand-55'] = rgbaBrand(0.55);
  vars['--brand-60'] = rgbaBrand(0.6);
  vars['--brand-strong'] = rgbaBrand(0.7);
  /* --border/--border-2 son rgba de marca en los 2 modos */
  vars['--border'] = rgbaBrand(oscuro ? 0.18 : 0.22);
  vars['--border-2'] = rgbaBrand(oscuro ? 0.1 : 0.08);

  var bgHex; // resuelto abajo según el modo — reusado por los overlays atados a --bg oscuro

  if (!oscuro) {
    vars['--brand-warm'] = derivar('#fff8f4');
    vars['--brand-warm-2'] = derivar('#fffcf9');
    vars['--brand-warm-3'] = derivar('#fff4ec');
    vars['--brand-warm-border'] = derivar('#fde8d4');
    bgHex = derivar('#FDF3EB');
    vars['--bg'] = bgHex;
    vars['--bg-2'] = derivar('#F7EAE0');
    vars['--surface'] = 'rgba(255,255,255,0.90)'; // S=0 (blanco puro) — no-op siempre, no depende del matiz
    vars['--surface-2'] = derivarRgba('#fff5eb', 0.95);
    vars['--surface-3'] = derivarRgba('#ffebdc', 0.45);
    vars['--surface-light'] = derivar('#fafafa'); // S=0 — no-op
    vars['--border-warm'] = derivarRgba('#a89587', 0.3);
    vars['--border-light'] = derivar('#e5e5e5'); // S=0 — no-op
    vars['--border-mid'] = derivar('#d4d4d4'); // S=0 — no-op
    vars['--border-softest'] = derivar('#eaeaea'); // S=0 — no-op
    // --border-slate: SIN derivar en claro a propósito — #cbd5e1 es azul
    // genuino (H≈213°), no emparentado con la marca (ver comentario de
    // cabecera). Queda con el valor fijo de colors.css, no se toca acá.
    vars['--text'] = derivar('#2C1A0E');
    vars['--text-2'] = derivar('#6B3E26');
    vars['--muted'] = derivar('#9A6A52');
    vars['--hint'] = derivar('#B89080');
    vars['--text-mid'] = derivar('#444444'); // S=0 — no-op
    vars['--text-faint'] = derivar('#aaaaaa'); // S=0 — no-op
    vars['--placeholder-color'] = derivar('#a89587');
    vars['--skeleton-base'] = derivar('#d1d1d1'); // S=0 — no-op
    vars['--skeleton-shine'] = derivar('#e8e8e8'); // S=0 — no-op
    // Shorthand completo, no solo el color — colors.css declara offset/blur
    // fijos junto al color (ej. "0 8px 32px rgba(...)"), perderlos acá
    // dejaría la sombra sin desplazamiento/difuminado.
    vars['--card-shadow'] = '0 8px 32px ' + rgbaBrand(0.08);
    vars['--shadow-sm'] = '0 4px 12px ' + rgbaBrand(0.08);
    vars['--shadow'] = '0 8px 32px ' + rgbaBrand(0.1);
    vars['--shadow-lg'] = '0 16px 48px ' + rgbaBrand(0.15);
    vars['--btn-secondary-hover-bg'] = derivar('#ebebeb'); // S=0 — no-op
    vars['--disabled-border'] = derivar('#eeeeee'); // S=0 — no-op
    vars['--modal-info-card-bg'] = '#ffffff'; // S=0 — no-op
  } else {
    vars['--brand-warm'] = rgbaBrand(0.08);
    vars['--brand-warm-2'] = rgbaBrand(0.05);
    vars['--brand-warm-3'] = rgbaBrand(0.1);
    vars['--brand-warm-border'] = rgbaBrand(0.2);
    bgHex = derivar('#170900');
    vars['--bg'] = bgHex;
    vars['--bg-2'] = derivar('#1f0d00');
    vars['--surface'] = rgbaBrand(0.07);
    vars['--surface-2'] = rgbaBrand(0.04);
    vars['--surface-3'] = rgbaBrand(0.02);
    vars['--surface-light'] = rgbaBrand(0.05);
    vars['--border-warm'] = rgbaBrand(0.15);
    vars['--border-light'] = rgbaBrand(0.12);
    vars['--border-mid'] = rgbaBrand(0.15);
    vars['--border-softest'] = rgbaBrand(0.1);
    vars['--border-slate'] = rgbaBrand(0.2); // en oscuro sí es rgba de marca — deriva normal
    vars['--text'] = derivar('#F0E0D0');
    vars['--text-2'] = derivar('#C9A090');
    vars['--muted'] = derivar('#9A7060');
    vars['--hint'] = derivar('#6A4030');
    vars['--text-mid'] = derivar('#b0a090');
    vars['--text-faint'] = derivar('#6a5a50');
    vars['--skeleton-base'] = derivar('#2a1a0e');
    vars['--skeleton-shine'] = derivar('#3a2a1e');
    // Fijo a propósito en oscuro (ver cabecera) — mismo shorthand completo
    // que colors.css, con negro puro en vez de la parte de color derivada.
    vars['--card-shadow'] = '0 8px 32px rgba(0,0,0,0.4)';
    vars['--shadow-sm'] = '0 4px 12px rgba(0,0,0,0.4)';
    vars['--shadow'] = '0 8px 32px rgba(0,0,0,0.5)';
    vars['--shadow-lg'] = '0 16px 48px rgba(0,0,0,0.6)';
    vars['--btn-secondary-bg'] = rgbaBrand(0.08);
    vars['--btn-secondary-hover-bg'] = rgbaBrand(0.1);
    vars['--disabled-border'] = rgbaBrand(0.12);
    vars['--card-bg'] = rgbaBrand(0.06);
    var bgRgb = hexToRgb(bgHex);
    var overlayBg = function(alpha) { return 'rgba(' + bgRgb.r + ',' + bgRgb.g + ',' + bgRgb.b + ',' + alpha + ')'; };
    vars['--dk-overlay-95'] = overlayBg(0.95);
    vars['--dk-overlay-97'] = overlayBg(0.97);
    vars['--modal-info-card-bg'] = overlayBg(0.97);
  }

  // --dk-skeleton-base/--dk-pin-press/--dk-modal-btn-bg/--dk-brand-burn: un
  // solo valor (no tienen rama clara propia, se definen una vez en :root y
  // solo se referencian desde contextos ya oscuros) — se recalculan siempre,
  // sin condicionar a `oscuro`.
  vars['--dk-skeleton-base'] = derivar('#2c1c11');
  vars['--dk-pin-press'] = derivar('#2a1a0e');
  vars['--dk-modal-btn-bg'] = derivar('#2c1c11');
  vars['--dk-brand-burn'] = derivar('#e55a00');

  for (var nombre in vars) root.style.setProperty(nombre, vars[nombre]);

  // meta[name="theme-color"] no soporta var() — se sincroniza a mano en
  // colors.css hoy (comentarios junto a --bg), pero eso alcanzaba porque
  // --bg era estático. Ahora que --bg se recalcula en runtime, el meta
  // tag también tiene que actualizarse en runtime para no quedar
  // desincronizado apenas cambie el color de énfasis (Tanda 2). No se
  // toca manifest.json — es un archivo estático que el SO lee al momento
  // de instalar la PWA, sin ningún mecanismo real de "recarga en vivo"
  // desde JS de la página; queda como limitación conocida, señalada para
  // revisar en la Tanda 2 si hace falta.
  var metaLight = document.querySelector('meta[name="theme-color"][media*="light"]');
  var metaDark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  if (!oscuro && metaLight) metaLight.setAttribute('content', bgHex);
  if (oscuro && metaDark) metaDark.setAttribute('content', bgHex);
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (_ceColorActual) aplicarColorEnfasis(_ceColorActual);
  });
}

// Arranca con el último color REAL conocido (cache de localStorage, ver
// comentario de cabecera de aplicarColorEnfasis) en vez del naranja
// hardcodeado siempre -- así, salvo la primerísima visita de un navegador
// (sin cache todavía, inevitable: nadie conoce el color real hasta que
// js/auth.js lo pida al backend por primera vez), el primer paint YA es el
// color correcto y auth.js reaplicar el mismo valor al resolver su fetch es
// un no-op visual, no un recoloreo. Cache inválido (no hex de 6 dígitos,
// ej. corrupción manual) cae de vuelta al default sin romper nada.
var _ceCache = null;
try { _ceCache = localStorage.getItem('ce_color_cache'); } catch (ex) {}
aplicarColorEnfasis(/^#[0-9a-fA-F]{6}$/.test(_ceCache || '') ? _ceCache : '#F97316');
