# Auditoría de estilos y colores hardcodeados — Fase 1 (inventario)

> Documento temporal, no forma parte de MANIFEST.md todavía. Generado recorriendo todos los `.html`/`.js` de raíz + `inscripcion/` + `shared/`, y todos los `.css` excepto `colors.css`.
>
> **Nada fue modificado.** Este es solo el inventario para revisar antes de aplicar cambios.
>
> **Nota (2026-09-03, post-rebrand a Pivot):** este inventario es de ANTES del rebrand — varios de los hex/valores puntuales que documenta cambiaron desde entonces (theme-color, confetti, y en general cualquier tono derivado del naranja `#F97316` original). Filas #1/#2/#14 (abajo) ya se actualizaron para reflejar el estado actual; el resto del documento (radius/transition/font-size/selectores muertos/otros hex sin relación con la marca) NO se re-auditó — sigue siendo el snapshot original, puede tener divergencias puntuales si algo más cambió de paso durante el rebrand.

---

## 0. Resumen de volumen

| Categoría | Instancias encontradas | ¿Tratable como tabla por línea? |
|---|---|---|
| Colores hardcodeados (hex / rgb / rgba) | **~24** puntos de código (algunos repetidos) | Sí — tabla completa abajo (sección 1) |
| Colores CSS por nombre (`white`, `red`, etc.) | 0 (solo `transparent`/`currentColor`, que no son tokens de marca) | N/A, no se listan |
| Selectores CSS "muertos" con hex huérfano (hallazgo colateral) | 4 | Sí — sección 2 |
| `border-radius` hardcodeado (no usa `var()`) | **206** | No uno por uno — resumen agregado por valor (sección 3.1) |
| `box-shadow` hardcodeado no-`none` | 6 (todos son casos de color, ya cubiertos en sección 1) | Ya incluidos arriba |
| `transition`/duración hardcodeada | **125** | No uno por uno — resumen agregado (sección 3.2) |
| `font-size` hardcodeado | **468** | Fuera de alcance recomendado — no existe ningún token de tamaño de fuente en el proyecto hoy (ver sección 3.3) |

Los colores son el bloque chico y accionable (~24 puntos). `border-radius`, transiciones y tamaños de fuente son un orden de magnitud más grandes y **no tienen el mismo tipo de regla explícita** en MANIFEST — para esos armé un resumen agregado en vez de una tabla de cientos de filas, y al final hay preguntas puntuales sobre qué alcance querés darles antes de que arme la tabla línea por línea (si la querés).

---

## 1. Colores hardcodeados (hex / rgb / rgba)

| # | Archivo:línea | Valor hardcodeado | Contexto | Propuesta |
|---|---|---|---|---|
| 1 | `index.html:21-22` | `#FFFFFF` / `#0D0D0D` (**actualizado 2026-09-03**, era `#170900`/`#FDF3EB`) | `<meta name="theme-color">` | **(c) Excepción ya documentada en MANIFEST** — los `<meta>` no soportan `var()`. Sincronizado en runtime por `js/color-enfasis.js` (lee `--bg` de `colors.css`); este valor estático es el fallback de primer paint. Ya corregido, no tocar. |
| 2 | `inscripcion/index.html:12-13` / `registro-express/index.html:11-12` | `#FFFFFF` / `#0D0D0D` (**actualizado 2026-09-03**, era `#170900`/`#FDF3EB`) | ídem, con comentario propio explicando la excepción — ambos archivos también cargan `js/color-enfasis.js`, que sincroniza estos mismos tags en runtime igual que en `index.html` | Igual que #1, ya corregido, no tocar. |
| 3 | `index.html:851` | `rgba(0,0,0,0.25)` | `box-shadow` de `#pwa-banner` | (b) No existe variable exacta (`--black-15` es 0.15, el resto de `--black-*` no llega a 0.25). Crear `--black-25` en `colors.css` y usarla acá. |
| 4 | `index.html:885` | `background:rgba(0,0,0,0.82)` | `#modal-info-reserva`, que **ya tiene** `class="modal-info"` | El inline es un **duplicado redundante** del `background` que la clase `.modal-info` ya define en `global.css:136` (mismo valor exacto). Propuesta: eliminar el `background` inline (la clase ya lo cubre) y resolver el color en la clase (ver fila #6). |
| 5 | `index.html:947` | `background:rgba(0,0,0,0.82)` | `#modal-info-home`, mismo patrón que #4 | Igual que #4. |
| 6 | `css/global.css:136` | `background: rgba(0,0,0,0.82);` | Definición de `.modal-info` | (b) No coincide con ninguna var existente (`--overlay`=0.65, `--overlay-dark`=0.7). Crear variable nueva, ej. `--overlay-modal-info: rgba(0,0,0,0.82)`. |
| 7 | `index.html:1004` | `background:rgba(0,0,0,0.72)` | `#modal-agotada-overlay` | Ver nota de ambigüedad (sección 1.1) — **muy cerca** de `--overlay-dark` (0.7) pero no exacto. |
| 8 | `index.html:1013` | `background:rgba(0,0,0,0.72)` | `#modal-info-estado` | Mismo valor que #7, mismo caso. |
| 9 | `index.html:1035` | `background:rgba(0,0,0,0.72)` | `#modal-info-politica` | Mismo valor que #7, mismo caso (3ª repetición idéntica). |
| 10 | `js/reservas.js:855` | `border:1px solid #bbf7d0` | Aviso "cupón aplicado" | (a) `#bbf7d0` = exactamente `--green-border` (valor light). Reemplazar por `var(--green-border)` — **bonus:** hoy este hex fijo no cambia en dark mode, mientras que `--green-border` sí tiene variante dark (`rgba(34,197,94,0.2)`). Es decir, hay un bug de dark mode escondido acá, no solo un hardcode. |
| 11 | `js/reservas.js:855` | `box-shadow: 0 4px 12px rgba(34,197,94,0.1)` | mismo aviso | (a) `rgba(34,197,94,0.1)` = exactamente `--success-bg`. Reemplazar por `var(--success-bg)`. |
| 12 | `js/reservas.js:858` | `border:1px solid #bbf7d0` | Aviso "créditos usados" (bloque casi idéntico al de #10) | Mismo caso que #10. |
| 13 | `js/reservas.js:858` | `box-shadow: 0 4px 12px rgba(34,197,94,0.1)` | mismo aviso | Mismo caso que #11. |
| 14 | `js/ui.js:1085` | `['#E8000D','#FF2020','#FFFFFF','#000000','#666666','#CCCCCC']` (**actualizado 2026-09-03**, era `['#F97316','#fb923c','#fbbf24','#22c55e','#60a5fa','#c084fc','#f472b6']`) | Array de colores del confetti (canvas) | **(c) Excepción ya documentada explícitamente en MANIFEST** (colores pasados a canvas, no interpretados como CSS, así que no puede usar `var()`) — pero la EXCEPCIÓN era solo sobre el mecanismo (hex fijo vs. variable), no una decisión de mantener la paleta naranja vieja para siempre. Actualizado a rojo/blanco/negro/grises (paleta Pivot) — los 2 rojos son `--brand` claro/oscuro literales (`#E8000D`/`#FF2020`, `colors.css`), el resto neutros planos. |
| 15 | `css/home.css:146` | `var(--amber-dark,#b45309)` | `.rn-status-pendiente` | Fallback redundante pero **inocuo** — el valor del fallback coincide exactamente con `--amber-dark`. Propuesta: quitar el fallback (`var(--amber-dark)` a secas) por prolijidad, bajo impacto. |
| 16 | `css/home.css:149` | `var(--dk-purple-mid,#7c3aed)` | `.rn-status-reagendar` | Ver ambigüedad (sección 1.1) — el fallback **no** coincide con `--dk-purple-mid` (`#6d28d9`), coincide con `--purple` (`#7c3aed`). |
| 17 | `css/login.css:39` | `#fafafa7a` | `-webkit-box-shadow` del autofill de `#input-pin` | (b) No hay variable con canal alfa equivalente. La más cercana en valor base es `--surface-light` (`#fafafa`, sin alfa). Propuesta: crear variable propia (ej. `--autofill-bg: rgba(250,250,250,0.48)`) o usar `color-mix(in srgb, var(--surface-light) 48%, transparent)` — a definir con el usuario. |
| 18 | `css/login.css:56` | `rgba(249,115,22,0.15)` | `box-shadow` de focus de `#input-pin` en dark mode | (a) Coincide exactamente con `--brand-focus`. Reemplazar por `var(--brand-focus)`. |
| 19 | `css/login.css:68` | `#e5e5e5` | Selector `#s1 div[style*="border:2px solid #e5e5e5;border-radius:4px"]` | **Selector muerto**, ver sección 2. |
| 20 | `css/login.css:70` | `#aaa` | Selector `#s1 span[style*="color:#aaa"]` | **Selector muerto**, ver sección 2. |
| 21 | `css/nav.css:131` | `var(--brand-dk, #ea6c00)` | `.app-nav-cta:hover` | Ver ambigüedad (sección 1.1) — `--brand-dk` real es `#ea6407`, el fallback `#ea6c00` es **parecido pero no igual**. |
| 22 | `css/perfil.css:66` | `#fafafa` | Selector `#modal-permisos div[style*="background:#fafafa"]` | **Selector muerto**, ver sección 2. |
| 23 | `css/perfil.css:70` | `#777` | Selector `#modal-permisos ... div[style*="color:#777"]` | **Selector muerto**, ver sección 2. |
| 24 | `css/perfil.css:298` | `rgba(0,0,0,0.35)` | `filter: drop-shadow(...)` de `.aj-mapa-pin` | (b) No hay variable `--black-*` en 0.35 (existe `--black-15`=0.15). Crear `--black-35` o similar. |
| 25 | `inscripcion/index.html:340` | `var(--wa-bg,#e7f9f1)` | Botón de WhatsApp en modal de edad bloqueada | Ver ambigüedad (sección 1.1) — `--wa-bg` es `rgba(37,211,102,0.1)`, un verde translúcido; el fallback es un verde pálido sólido distinto. |
| 26 | `inscripcion/index.html:340` | `var(--success,#16a34a)` | mismo botón | Ver ambigüedad (sección 1.1) — `--success` es `#22c55e`; el fallback `#16a34a` coincide en cambio con `--success-dark`. |

### 1.1 Casos ambiguos — necesito tu decisión antes de tocarlos

Estos son los "casi iguales pero no exactos" que pediste revisar antes del batch:

1. **`rgba(0,0,0,0.72)` repetido 3 veces** (`index.html:1004,1013,1035`) — muy cerca de `--overlay-dark` (`rgba(0,0,0,0.7)`) pero no idéntico. ¿Fue intencional (un overlay ligeramente más oscuro para estos 3 modales específicos) o es simplemente un valor que debió ser `--overlay-dark` y divergió con el tiempo? Según tu respuesta: (a) unificar a `var(--overlay-dark)`, o (b) crear una variable nueva propia (ej. `--overlay-72`) que preserve el valor exacto actual.
2. **`css/nav.css:131`** — fallback `#ea6c00` de `var(--brand-dk, ...)` no coincide con el valor real de `--brand-dk` (`#ea6407`). Como el fallback de un `var()` con la variable siempre definida nunca llega a usarse en la práctica, es inofensivo hoy, pero es una fuente de confusión. ¿Lo corrijo para que coincida (`#ea6407`) o simplemente quito el fallback ya que la variable siempre está definida?
3. **`css/home.css:149`** — mismo problema: fallback `#7c3aed` de `var(--dk-purple-mid, ...)` en realidad coincide con `--purple`, no con `--dk-purple-mid` (`#6d28d9`). ¿Es un error de copy-paste (debería decir `--purple` en vez de `--dk-purple-mid`, ya que el fallback y el nombre de variable no coinciden en intención) o el nombre de variable es el correcto y el fallback es el que está mal? Necesito confirmar cuál de los dos "gana".
4. **`inscripcion/index.html:340`** — dos fallbacks (`--wa-bg` con `#e7f9f1`, `--success` con `#16a34a`) que no coinciden con sus variables. Mismo tipo de pregunta: ¿corrijo el fallback para que coincida con la variable real, o el valor "correcto" es el del fallback y hay que revisar qué variable deberían estar usando en su lugar?
5. **`css/login.css:17`** — `#fafafa7a` (fondo autofill con alfa). No hay ninguna variable con canal alfa parecida. ¿Preferís que cree una variable nueva con ese valor exacto, o que use `color-mix()` sobre `--surface-light` (quedaría *casi* igual visualmente pero no bit-a-bit idéntico, dependiendo del navegador)?

---

## 2. Hallazgo colateral: selectores CSS muertos con hex huérfano

Mientras rastreaba los hex de la tabla 1, encontré que **4 selectores de dark-mode** en `login.css` y `perfil.css` usan atributos `[style*="..."]` para pisar estilos inline que **ya no existen** en ningún HTML ni JS del proyecto (verifiqué con grep exhaustivo en `index.html`, `inscripcion/index.html` y todos los `.js`):

| Archivo:línea | Selector | Estado |
|---|---|---|
| `css/login.css:68` | `#s1 div[style*="border:2px solid #e5e5e5;border-radius:4px"]` | El inline real hoy es `border:2px solid var(--dk-brand-burn);border-radius:4px` (`index.html:105`) — el selector nunca matchea, regla muerta. |
| `css/login.css:70` | `#s1 span[style*="color:#aaa"]` | No encontré ningún `span` con ese inline en el proyecto — regla muerta. |
| `css/perfil.css:66` | `#modal-permisos div[style*="background:#fafafa"]` | No encontré ese inline en `#modal-permisos` — regla muerta. |
| `css/perfil.css:70` | `#modal-permisos p, #modal-permisos div[style*="color:#777"]` | La parte `div[style*="color:#777"]` no matchea nada (la parte `#modal-permisos p` sí es válida y se queda). |

No es exactamente "color hardcodeado a reemplazar por var()" (son strings dentro de un selector, no un valor de propiedad — no tiene sentido meterles `var()` ahí), sino **CSS muerto que quedó huérfano** después de que el HTML/JS que apuntaban ya migró a variables. Probablemente son overrides de dark mode que dejaron de aplicarse hace tiempo sin que nadie lo notara (mismo tipo de bug silencioso que documenta MANIFEST para el caso de `.modal-info-footer` con `flex:1`).

**Pregunta:** ¿los elimino directamente en el batch de colores (ya no cumplen ninguna función), o preferís que investigue primero si el look en dark mode de esos elementos específicos quedó roto por esto (para eventualmente re-implementar el override correcto en vez de solo borrar la regla muerta)?

---

## 3. Otros estilos hardcodeados repetidos (resumen agregado)

### 3.1 `border-radius` — 206 instancias sin `var()`

`colors.css` ya define una escala: `--radius-sm:10px` / `--radius:14px` / `--radius-lg:20px` / `--radius-full:9999px`. Distribución de los valores literales encontrados:

| Valor literal | Repeticiones | ¿Coincide con variable existente? |
|---|---|---|
| `12px` | 67 | **No** — cae entre `--radius-sm`(10) y `--radius`(14). Es el valor más repetido de todo el proyecto sin token. Candidato fuerte a un nuevo `--radius-md:12px`. |
| `50%` | 35 | No aplica — es el patrón estándar para hacer circular un elemento respecto de su propio tamaño (avatares, iconos), no es un "valor de diseño" comparable a un radio fijo. Propongo excluirlo del alcance. |
| `10px` | 28 | **Sí**, exacto — `--radius-sm`. Reemplazo directo. |
| `20px` | 22 | **Sí**, exacto — `--radius-lg`. Reemplazo directo. |
| `14px` | 19 | **Sí**, exacto — `--radius`. Reemplazo directo. |
| `99px` | 8 | Casi — visualmente idéntico a `--radius-full`(9999px) para cualquier elemento de altura razonable, pero no es el mismo número. Ambiguo, a confirmar. |
| `4px` | 7 | No — no hay ningún token tan chico. Candidato a `--radius-xs:4px` si se decide crear. |
| `28px` | 3 | No — a revisar caso por caso (parecen ser botones circulares grandes, radio = mitad de su alto). |
| `26px` | 3 | No — mismo caso que `28px`. |
| `16px` | 3 | No — sin token. |
| `9999px` (literal, no `var()`) | 2 | Sí, exacto — pero ya escrito como número en vez de usar `var(--radius-full)`. Reemplazo directo. |
| `8px`, `2px`, `0`, valores compuestos (`20px 20px 0 0`, `0 12px 12px 0`) | 1-2 c/u | Casos puntuales (esquinas específicas), a revisar individualmente si se decide incluir esta categoría. |

### 3.2 `transition` — 125 instancias

Las curvas de easing **ya están tokenizadas** y se usan de forma consistente (`var(--ease-sheet)` y `var(--ease-axis)`, definidas en `css/estilos.css`) — no encontré curvas hardcodeadas fuera de esas dos, salvo un puñado de `ease`/`cubic-bezier(...)` puntuales para efectos de rebote (ej. `cubic-bezier(0.34,1.56,0.64,1)`, 2 apariciones). Lo que queda 100% sin tokenizar es la **duración** (`0.15s`, `0.2s`, `0.3s`, `0.32s`, etc., docenas de combinaciones con distintas propiedades). No existe ningún `--duration-*` en `colors.css` hoy — así que, a diferencia de los colores, acá no hay ninguna variable existente que se esté "ignorando"; sería crear un sistema nuevo desde cero.

### 3.3 `font-size` — 468 instancias

No incluí esto en el inventario detallado: no existe ningún token de tamaño de fuente en el proyecto (no hay `--fs-*` ni similar en `colors.css`), y la gran mayoría de estos valores son puntuales por elemento (un `<p>` de ayuda a `0.85rem`, un ícono a `1.1rem`, etc.) — no es el mismo patrón de "mismo valor de marca repetido a mano" que sí aplica a colores o radios. Meterlos todos en una tabla sería mayormente ruido. Si te interesa, puedo hacer un segundo paso enfocado solo en font-size buscando specficamente **valores idénticos repetidos 5+ veces** (que sí serían candidatos reales a clase/variable compartida), en vez de las 468 líneas completas.

---

## 4. Preguntas para vos antes de la Fase 2

1. Los 5 casos ambiguos de la sección 1.1 — ¿cómo resuelvo cada uno?
2. Los 4 selectores muertos de la sección 2 — ¿los borro sin más, o investigo primero si rompieron algo visualmente en dark mode?
3. `border-radius` (sección 3.1) — ¿querés que lo incluya en la Fase 2 junto con los colores (creando `--radius-md:12px` y reemplazando los `10/14/20/9999` literales por sus vars ya existentes), o lo dejamos para un batch aparte más adelante?
4. `transition`/duración (sección 3.2) — ¿querés que arme un sistema de tokens (`--duration-fast/base/slow` o similar) como parte de este trabajo, o lo dejamos fuera de esta auditoría (es una decisión de arquitectura nueva, no una corrección de algo que ya debería usar una variable)?
5. `font-size` (sección 3.3) — ¿lo dejamos fuera del todo, o hago el segundo paso enfocado en valores repetidos 5+ veces que mencioné arriba?

En cuanto me confirmes esto, armo el plan de batches para la Fase 2 (colores primero, con Playwright en light/dark por batch, commit+push por batch, MANIFEST actualizado).
