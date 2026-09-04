/* ══ Paleta de marca — motor de derivación ══════════════════════════════════
   Rebrand a "Pivot" (ver MANIFEST.md — "el color de la app ya no es
   personalizable"): la personalización de color por admin (Mi Liga →
   "Color", `adminGetColorEnfasis`/`adminSetColorEnfasis`/`config_app.color_
   enfasis`) se eliminó por completo — este archivo pasa de "aplicar el color
   que el admin haya guardado" a "aplicar SIEMPRE los 2 colores fijos de la
   marca Pivot" (`_CE_BRAND_LIGHT`/`_CE_BRAND_DARK` abajo), uno para modo
   claro y otro para oscuro — a propósito 2 hex DISTINTOS, no una misma marca
   con alpha/lightness distinta entre modos (criterio anterior de este mismo
   archivo, cuando --brand no cambiaba con el tema) — el rojo de marca en
   oscuro es más claro/saturado (#FF2020) que en claro (#E8000D) para
   mantener contraste sobre el fondo casi negro nuevo.

   Mirlxs no tiene toggle manual de tema — el modo claro/oscuro depende 100%
   de prefers-color-scheme del sistema, por eso este archivo escucha
   matchMedia('(prefers-color-scheme: dark)') y reaplica si el usuario
   cambia el tema del SO con la app abierta.

   MÉTODO — matiz por DESPLAZAMIENTO RELATIVO, no absoluto (sin cambios desde
   la versión anterior de este archivo, ver historial en CHANGELOG.md): cada
   variable derivada conserva su propio matiz "delta" respecto al matiz
   ORIGINAL de referencia (`_CE_BRAND_ORIGINAL`, el naranja `#F97316` que
   tenía toda la paleta vieja antes de este archivo existir) en vez de
   forzarle a todas el matiz exacto de la marca nueva — así el rojo nuevo se
   propaga a texto/bordes/superficies/sombras preservando la MISMA relación
   relativa de matices que ya tenía la paleta original entre sí, en vez de
   aplanarlas todas al mismo tono. Ese punto de referencia NO cambia con el
   rebrand — sigue siendo el ancla desde la que se miden los deltas, no un
   valor que deba coincidir con ningún brand real actual. */

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

// Ancla de referencia para los deltas de matiz -- NO es un color que se
// muestre en ningún lado, ver comentario de cabecera.
var _CE_BRAND_ORIGINAL = '#F97316';
var _CE_BRAND_ORIGINAL_HSL = hexToHsl(_CE_BRAND_ORIGINAL);

// Paleta fija de marca Pivot -- ya NO configurable (sin selector de color en
// Mi Liga, sin `config_app.color_enfasis`, sin acción de backend). Único
// lugar del código donde estos 2 hex viven escritos a mano.
var _CE_BRAND_LIGHT = '#E8000D';
var _CE_BRAND_DARK = '#FF2020';
// --bg fijo de la nueva paleta (css/colors.css) -- MISMO literal repetido acá
// a propósito, no `getComputedStyle`, porque hace falta ANTES del primer
// `root.style.setProperty()` de esta pasada (--dk-overlay-95/-97 se calculan
// mezclando esto con alpha, ver más abajo) -- son neutros puros en la nueva
// paleta (sin tinte de marca), a diferencia de la versión anterior de este
// archivo (que derivaba un negro con tinte naranja para estos overlays).
var _CE_BG_DARK = '#0D0D0D';

function _ceAplicarPaleta() {
  var oscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var hex = oscuro ? _CE_BRAND_DARK : _CE_BRAND_LIGHT;
  var brand = hexToHsl(hex);
  var rgb = hexToRgb(hex);
  var root = document.documentElement;

  // rgba(entrada, alpha) directo — para la familia --brand* pura, ya
  // idéntica al matiz/saturación de la marca por definición, sin roundtrip
  // por HSL (innecesario y evita cualquier error de redondeo de más).
  function rgbaBrand(alpha) { return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')'; }

  // Deriva un color sólido a partir de su hex ORIGINAL (el que tenía
  // hardcodeado la paleta vieja) conservando su desplazamiento de matiz
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
  // --brand-soft: tope MÁS BAJO en claro (0.04, no 0.1) -- pedido explícito
  // (ver MANIFEST.md, "fondo rosado en cards/items") -- un rojo saturado a
  // 0.1 de alpha ya se leía como tinte rosa visible sobre superficies
  // grandes (esta variable también se usa para `border-color`/`box-shadow`,
  // no solo fondos, pero el mismo alpha más bajo mejora los 2 casos). Sin
  // cambios en oscuro -- el pedido fue puntual a "modo claro".
  vars['--brand-soft'] = rgbaBrand(oscuro ? 0.1 : 0.04);
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
    // --bg-2/--surface/--surface-2/--surface-3/--surface-light/--border-warm/
    // --border-mid/--border-softest/--text-2/--hint: NEUTRALES FIJAS a
    // propósito, ya NO derivadas de `--brand` (re-ajuste, pedido explícito
    // tras el fix anterior de "fondo rosado en cards/items" -- ver
    // MANIFEST.md). El fix anterior solo neutralizó --surface-2/--surface-3
    // (la fuente puntual del bug); acá se extiende el mismo principio a TODA
    // la familia de "fondo/borde/texto ambiente" (--surface/--surface-light/
    // --border-warm/--border-mid/--border-softest/--bg-2/--text-2/--hint) --
    // ninguna de estas es un elemento interactivo, así que ninguna debe
    // llevar tinte de marca. Solo la familia --brand-*/--brand-warm* (arriba)
    // sigue derivando -- esa SÍ es la familia real de acento/interactivo.
    vars['--bg-2'] = '#FAFAFA';
    vars['--surface'] = '#F7F7F7';
    vars['--surface-2'] = '#F5F5F5';
    vars['--surface-3'] = '#F2F2F2';
    vars['--surface-light'] = '#FAFAFA';
    vars['--border-warm'] = '#EBEBEB';
    vars['--border-mid'] = '#D4D4D4';
    vars['--border-softest'] = '#EAEAEA';
    // --border-slate: SIN derivar en claro a propósito — #cbd5e1 es azul
    // genuino (H≈213°), no emparentado con la marca (ver comentario de
    // cabecera). Queda con el valor fijo de colors.css, no se toca acá.
    vars['--text-2'] = '#444444';
    vars['--hint'] = '#999999';
    vars['--text-mid'] = derivar('#444444'); // S=0 — no-op
    vars['--text-faint'] = derivar('#aaaaaa'); // S=0 — no-op
    vars['--placeholder-color'] = derivar('#a89587');
    vars['--skeleton-base'] = derivar('#d1d1d1'); // S=0 — no-op
    vars['--skeleton-shine'] = derivar('#e8e8e8'); // S=0 — no-op
    // Sombras: NEUTRAS (negro), ya NO tinte de marca -- mismo motivo que la
    // familia de arriba (re-ajuste, pedido explícito). Shorthand completo,
    // no solo el color — colors.css declara offset/blur fijos junto al
    // color, perderlos acá dejaría la sombra sin desplazamiento/difuminado.
    vars['--card-shadow'] = '0 8px 32px rgba(0,0,0,0.06)';
    vars['--shadow-sm'] = '0 4px 12px rgba(0,0,0,0.06)';
    vars['--shadow'] = '0 8px 32px rgba(0,0,0,0.08)';
    vars['--shadow-lg'] = '0 16px 48px rgba(0,0,0,0.12)';
    vars['--btn-secondary-hover-bg'] = derivar('#ebebeb'); // S=0 — no-op
    vars['--disabled-border'] = derivar('#eeeeee'); // S=0 — no-op
    vars['--modal-info-card-bg'] = '#ffffff'; // S=0 — no-op
  } else {
    vars['--brand-warm'] = rgbaBrand(0.08);
    vars['--brand-warm-2'] = rgbaBrand(0.05);
    vars['--brand-warm-3'] = rgbaBrand(0.1);
    vars['--brand-warm-border'] = rgbaBrand(0.2);
    bgHex = _CE_BG_DARK;
    // --bg-2/--surface*/--border*/--text-2/--hint: NEUTRALES en oscuro
    // también (mismo motivo/re-ajuste que en claro, ver comentario grande de
    // la rama `!oscuro` de arriba) -- overlay BLANCO translúcido (patrón
    // estándar de "elevación" en UI oscura) en vez de rojo translúcido sobre
    // el negro casi puro. `--surface-2` ya no coincide con el hex exacto de
    // `--card-bg` (antes `#1A1A1A` fijo) -- ahora es un overlay translúcido
    // como el resto de la familia, visualmente muy cercano pero reactivo a
    // `--bg` si ese valor cambiara algún día.
    vars['--bg-2'] = '#111111';
    vars['--surface'] = 'rgba(255,255,255,0.06)';
    vars['--surface-2'] = 'rgba(255,255,255,0.04)';
    vars['--surface-3'] = 'rgba(255,255,255,0.025)';
    vars['--surface-light'] = 'rgba(255,255,255,0.04)';
    vars['--border-warm'] = 'rgba(255,255,255,0.10)';
    vars['--border-mid'] = 'rgba(255,255,255,0.13)';
    vars['--border-softest'] = 'rgba(255,255,255,0.06)';
    vars['--border-slate'] = 'rgba(255,255,255,0.15)'; // ya no rgba de marca -- ver re-ajuste arriba
    vars['--text-2'] = '#AAAAAA';
    vars['--hint'] = '#555555';
    vars['--text-mid'] = derivar('#b0a090');
    vars['--text-faint'] = derivar('#6a5a50');
    vars['--skeleton-base'] = derivar('#2a1a0e');
    vars['--skeleton-shine'] = derivar('#3a2a1e');
    // Sombras -- alphas bajados (re-ajuste, pedido explícito), sombra más
    // sutil sobre el fondo casi negro nuevo. Ya eran neutras (negro puro)
    // desde antes del rebrand, sin cambios en ESE sentido.
    vars['--card-shadow'] = '0 8px 32px rgba(0,0,0,0.40)';
    vars['--shadow-sm'] = '0 4px 12px rgba(0,0,0,0.35)';
    vars['--shadow'] = '0 8px 32px rgba(0,0,0,0.45)';
    vars['--shadow-lg'] = '0 16px 48px rgba(0,0,0,0.55)';
    vars['--btn-secondary-bg'] = 'rgba(255,255,255,0.06)';
    vars['--btn-secondary-hover-bg'] = 'rgba(255,255,255,0.07)';
    vars['--disabled-border'] = 'rgba(255,255,255,0.08)';
    var bgRgb = hexToRgb(bgHex);
    var overlayBg = function(alpha) { return 'rgba(' + bgRgb.r + ',' + bgRgb.g + ',' + bgRgb.b + ',' + alpha + ')'; };
    vars['--dk-overlay-95'] = overlayBg(0.95);
    vars['--dk-overlay-97'] = overlayBg(0.97);
    vars['--modal-info-card-bg'] = overlayBg(0.97);
  }
  // --bg/--text/--muted/--border-light/--card-bg ya NO son "(runtime)" --
  // valores fijos de la nueva paleta Pivot (css/colors.css, claro/oscuro
  // cada uno con su propio literal) — este motor deja de tocarlos del todo,
  // a diferencia de la versión anterior de este archivo. `bgHex` sigue
  // resuelto arriba SOLO para los overlays atados a --bg oscuro
  // (`--dk-overlay-95/-97`) y el `theme-color` de abajo — no se escribe a
  // `--bg` en sí, y en oscuro ya NO lleva tinte de marca (`_CE_BG_DARK`,
  // literal neutro, ver más arriba) a diferencia de la versión anterior.

  // --dk-skeleton-base/--dk-pin-press/--dk-modal-btn-bg/--dk-brand-burn: un
  // solo valor (no tienen rama clara propia, se definen una vez en :root y
  // solo se referencian desde contextos ya oscuros) — se recalculan siempre
  // con el rojo de marca OSCURO (`_CE_BRAND_DARK`), sin condicionar a
  // `oscuro` real de esta pasada -- son consumidos desde UI que ya es oscura
  // por diseño (ej. modales) sin importar el tema del sistema en este
  // momento.
  (function() {
    var brandDk = hexToHsl(_CE_BRAND_DARK);
    function derivarDk(hexOriginal) {
      var o = hexToHsl(hexOriginal);
      var deltaH = o.h - _CE_BRAND_ORIGINAL_HSL.h;
      return hslToHex(brandDk.h + deltaH, o.s, o.l);
    }
    vars['--dk-skeleton-base'] = derivarDk('#2c1c11');
    vars['--dk-pin-press'] = derivarDk('#2a1a0e');
    vars['--dk-modal-btn-bg'] = derivarDk('#2c1c11');
    vars['--dk-brand-burn'] = derivarDk('#e55a00');
  })();

  for (var nombre in vars) root.style.setProperty(nombre, vars[nombre]);

  // meta[name="theme-color"] no soporta var(). Antes se leía --bg vía
  // getComputedStyle, pero esa lectura puede resolver en blanco si corre
  // antes de que el media query oscuro del sistema termine de aplicarse --
  // ahora valores fijos, uno por meta (cada uno ya tiene su propio media
  // attribute light/dark, así que el navegador elige el que corresponde).
  var metaLight = document.querySelector('meta[name="theme-color"][media*="light"]');
  var metaDark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  if (metaLight) metaLight.setAttribute('content', '#FFFFFF');
  if (metaDark) metaDark.setAttribute('content', '#0D0D0D');

  // Android, PWA instalada: ignora los 2 meta[theme-color] de arriba (con
  // media query) -- solo respeta un meta SIN atributo media, que manifest.json
  // tampoco puede cubrir (theme_color ahí es un string estático, sin
  // prefers-color-scheme). Se crea una sola vez si no existe (persiste entre
  // corridas de esta función, incluida la del listener de más abajo ante un
  // cambio de tema del sistema en runtime) y se actualiza siempre acá mismo.
  var metaSinMedia = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!metaSinMedia) {
    metaSinMedia = document.createElement('meta');
    metaSinMedia.setAttribute('name', 'theme-color');
    document.head.appendChild(metaSinMedia);
  }
  metaSinMedia.setAttribute('content', oscuro ? '#0D0D0D' : '#FFFFFF');
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', _ceAplicarPaleta);
}

_ceAplicarPaleta();
