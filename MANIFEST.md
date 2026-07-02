# MANIFEST — Mirlxs Reservas

Referencia completa del proyecto. Suficiente para entender la arquitectura sin leer los HTMLs.

---

## 1. Estructura del proyecto

```
reservas/
├── index.html                  Shell principal de la SPA (solo <link> y <script src>)
├── sw.js                       Service Worker para PWA
├── manifest.json               Web App Manifest (íconos, nombre, tema)
│
├── css/
│   ├── colors.css              FUENTE ÚNICA DE VERDAD de colores — se importa primero en index.html e inscripcion/index.html
│   ├── global.css              Reset, body, keyframes, spinner, overlay, toggle-switch, pantalla
│   ├── ui.css                  Componentes reutilizables: card, inputs, btn, opciones, resumen
│   ├── nav.css                 Barra de navegación unificada: .app-nav y variantes (.app-nav-fixed, .app-nav-sticky)
│   ├── login.css               Pantalla s1: header-banner, gsignin skeleton, acordeón PIN
│   ├── home.css                Pantalla s-home: home-boton, res-card-home (estados), hmr rows, btn-logout
│   ├── reservas.css            Pantallas s2–s6: fecha-item, pago-metodo, total-box, meses-grid, btn-wp-*
│   ├── perfil.css              Pantalla s-datos: datos-seccion, ddp-modal (date picker Mis Datos)
│   └── admin.css               Overrides dark mode para modal-nav-inner del panel admin
│
├── js/
│   ├── config.js               Constantes globales BACKEND, GOOGLE_CLIENT_ID y sha256Hex
│   ├── api.js                  Capa HTTP: api() GET con token, apiPost() POST form-urlencoded
│   ├── ui.js                   UI genérica: loading, errores, navegación ir/volver, meses
│   ├── home.js                 Pantalla home y historial: render de reservas, clasificación, cancelar
│   ├── reservas.js             Flujo de reserva (s2→s6): estado E, steps, pago, confirmación
│   ├── perfil.js               Editar datos, permisos Google, eliminar cuenta, ddp-* date picker
│   ├── admin.js                Panel admin: reservas, notificaciones, equipamiento, usuarios, admins
│   ├── pwa.js                  PWA install prompt, notificaciones push, OneSignal
│   └── auth.js                 Google Sign-In usuario, PIN, restaurar sesión, window.onload
│
├── shared/
│   └── date-picker.js          Date picker dp-* reutilizable (usado solo en inscripcion)
│
└── inscripcion/
    ├── index.html              Shell del formulario de inscripción
    ├── inscripcion.css         Todos los estilos de inscripcion (tokens CSS, layout, form, dp-*)
    └── inscripcion.js          Lógica del formulario: Google Sign-In, validación, envío
```

---

## 2. CSS — Clases por archivo

### css/global.css
| Clase / selector | Descripción |
|---|---|
| `*, body, button/input/select/textarea` | Reset y herencia de fuente |
| `html, body` | `overscroll-behavior-y: contain` — bloquea el pull-to-refresh nativo (reload de página) sin eliminar el rebote/glow nativo del scroll en iOS/Android |
| `@keyframes spin/fadeIn/fadeOut/popBounce/skeletonShimmer/smoothSlideUp/fadeInBtn` | Animaciones compartidas |
| `.spinner` | Círculo giratorio de carga |
| `#loading-overlay` | Overlay de carga fijo, z-index 9999 |
| `.error-msg` | Mensaje de error rojo con fadeIn |
| `.btn-spinner` | Spinner inline dentro de botones |
| `::placeholder` | Estilo de placeholders (itálica, color muted) |
| `.toggle-switch / .toggle-slider` | Toggle on/off reutilizable |
| `.fnac-trigger-btn / .fnac-placeholder` | Botón disparador de date picker |
| `.pantalla / .pantalla.activa` | Control de visibilidad de pantallas (SPA) |
| `select, option, optgroup` | Fuerza Montserrat en dropdowns |
| `.btn-wp-grupo` | Botón verde de grupo de WhatsApp (movido desde reservas.css) |
| `.otro-texto` | Input de texto libre que hereda de input[type="text"] global; solo añade `width:100%` |
| `.modal-info / .modal-info-card / .modal-info-titulo / .modal-info-sub / .modal-info-item / .modal-info-icon / .modal-info-label / .modal-info-desc / .modal-info-hr / .modal-info-footer` | Modal informativo de primera vez (overlay fijo z-index 8000, card centrada) |
| `.mi-orange / .mi-green / .mi-blue / .mi-amber / .mi-purple` | Variantes de color para `.modal-info-icon` |

### css/nav.css
| Clase / selector | Descripción |
|---|---|
| `.app-nav` | Base compartida: flex, altura 56px, blur backdrop, borde brand inferior |
| `.app-nav-fixed` | Nav fija (home): position:fixed, top:0, z-index:900 |
| `.app-nav-sticky` | Nav sticky (pantallas internas): position:sticky, top:0, z-index:100, animación smoothSlideDown |
| `.app-nav-back` | Botón atrás: 40×40px, border-radius 12px, fondo brand-light |
| `.app-nav-title` | Título centrado con position:absolute y pointer-events:none |
| `.app-nav-actions` | Contenedor de acciones derechas (flex, gap 8px) |
| `.app-nav-icon-btn` | Botón icono cuadrado (40×40px) para acciones secundarias |
| `.app-nav-cta` | Botón CTA principal ("Nueva reserva"): brand, border-radius 12px, shadow |
| `.app-nav-cta-label` | Label de texto del CTA; se oculta en `.compacto` y ≤360px |
| `.app-nav-avatar` | Avatar circular 38×38px del usuario |
| `.app-nav-section` | Label de sección (ej: "MIS RESERVAS"); aparece al scrollear en estado compacto |
| `.app-nav-fixed.compacto` | Estado compacto al scrollear: oculta label CTA, muestra sección |
| `@keyframes smoothSlideDown` | Animación de entrada de la nav sticky (desde arriba) |

### css/ui.css
| Clase / selector | Descripción |
|---|---|
| `.contenedor` | Wrapper centrado max-width 480px con padding |
| `.card` | Tarjeta blanca con border-radius; transparente en móvil |
| `.seccion-label` | Etiqueta naranja uppercase pequeña |
| `input, select, textarea` | Estilo base de campos de formulario; estado `:focus` usa `var(--surface)` en lugar de colores hardcodeados |
| `.select-wrapper::after` | Flecha expand_more naranja en selects |
| `.btn / .btn-primary / .btn-secondary` | Botones base, primario naranja, secundario outline |
| `.opciones / .opcion / .opcion.sel` | Grupo de radios/checkboxes con borde; .sel = seleccionado; `:hover` usa `var(--brand-lightest)` en lugar de colores hardcodeados |
| `.chk-opcion` | Checkbox con estilo de opción |
| `.resumen / .r-fila / .r-label / .r-valor` | Bloque de resumen de reserva |
| `.badge / .badge-*` | Chips de estado (confirmada, pendiente, etc.) |
| `.datos-campo` | Wrapper de campo en Editar datos |
| `.campo-condicional` | Sección que se expande con .visible |
| `.aviso-legal` | Bloque de aviso con fondo gris |
| `.privacy-row` | Fila de toggle de privacidad |
| `.btn-guardar-sec` | Botón guardar sección en datos |
| `.datos-hint` | Texto de ayuda gris bajo un campo |
| `.paso-indicator / .paso-dot` | Indicador de pasos (3 dots) del flujo de reserva — el JS que lo actualiza (`js/ui.js`, dentro de `ir()`) sigue ahí, pero **no hay ningún `.paso-indicator` en `index.html`**, así que ese bloque nunca corre en la práctica (código muerto detectado al fusionar s5→s6, no se tocó por no ser parte del pedido) |
| `.loader` | Contenedor centrado spinner + texto |
| `.textarea-otro` | Textarea para opciones "Otro" |
| `.select-spinner` | Spinner dentro de un select mientras carga |

### css/login.css
| Clase / selector | Descripción |
|---|---|
| `.header / .header-banner` | Header con banner/logo en pantalla s1 |
| `#gsignin-usuario` | Botón Google Sign-In de usuario (animación fadeIn) |
| `.btn-forgot-pin` | Enlace "¿Olvidaste tu PIN?" |
| `.btn-pin-key` | Tecla del teclado numérico PIN |
| `#input-pin` | Input PIN centrado con letra grande; anula autofill |

### css/home.css
| Clase / selector | Descripción |
|---|---|
| `.home-boton / .home-boton.principal` | Botón de acción en home y admin-home |
| `@keyframes pulseBtn` | Pulso naranja para botón destacado |
| `.btn-accion-home / .btn-home-sub` | Botones secundarios en home |
| `.res-card-home` | Tarjeta de reserva en home |
| `.res-card-home.vigente/vencimiento/vencida/futura/pendiente-mens/confirmada-clase/pendiente-clase/reagendar-clase` | Variantes de estado de tarjeta |
| `.home-top-mobile` | Fila superior en móvil (emoji + logout) — legacy, puede quedar en CSS para retrocompat |
| `.home-emoji-mobile / .home-emoji-desktop` | Emoji 🛼 solo en móvil o solo en desktop — legacy |
| `.home-profile-row` | Fila de perfil — legacy, reemplazada por `#home-nav`; clase conservada en CSS para retrocompat |
| `.home-avatar` | Avatar circular 46×46px con inicial o foto del usuario |
| `.home-profile-name` | Columna de texto con saludo pequeño y nombre |
| `.home-saludo-small` | Texto "¡Hola," en pequeño sobre el nombre (usado dentro de `.home-nav-texto` del nav fijo) |
| `.home-nombre` | Nombre del usuario (0.95rem, 800 en nav; clase compartida) |
| `.home-icon-btns` | Fila de botones de icono — legacy |
| `.home-icon-btn` | Botón circular de icono 38×38px; ahora se usa en el nav fijo (logout) |
| `.home-subtitulo` | Subtítulo "¿Qué quieres hacer hoy?" — legacy |
| ~~`.home-nav-fixed`~~ | Eliminado — reemplazado por `.app-nav.app-nav-fixed` en `css/nav.css` |
| ~~`.home-nav-inner / .home-nav-left / .home-nav-texto / .home-nav-acciones`~~ | Eliminados — estructura simplificada con clases `.app-nav-*` |
| ~~`.home-avatar-nav`~~ | Eliminado — reemplazado por `.app-nav-avatar` en `css/nav.css` |
| ~~`.btn-nueva-reserva-nav / .btn-nueva-reserva-nav-label`~~ | Eliminados — reemplazados por `.app-nav-cta / .app-nav-cta-label` |
| ~~`.home-nav-fixed.compacto`~~ | Eliminado — el compacto ahora es `.app-nav-fixed.compacto` en `css/nav.css` |
| `.res-card-nueva` | Nueva tarjeta de reserva con header, pills, "Más info" colapsable y wrap de cancelar |
| `.rn-header / .rn-top / .rn-date / .rn-divider` | Partes del header de la card nueva |
| `.rn-mas-info / .rn-chevron / .rn-body / .rn-body-inner` | Panel colapsable "Más información" de la card |
| `.rn-cancel-wrap` | Zona inferior con el botón "Cancelar reserva" |
| `.btn-cancel-text` | Botón de texto subrayado para cancelar reserva |
| `.sg-toggle-row / .sg-toggle-opt` | Toggle de modo en s-gestionar (Cambiar fecha / Cancelar) |
| `.sg-fecha-item / .sfi-header / .sfi-title / .sfi-circle` | Card de fecha disponible en s-gestionar |
| `.sg-no-fechas` | Mensaje cuando no hay fechas disponibles en s-gestionar |
| `.hmr / .hmr-texto / .hmr-titulo / .hmr-sub / .hmr-btn-round` | Filas de acciones móviles (notif, instalar, contacto) |
| `.btn-logout-mobile` | Botón de logout circular en móvil — legacy |

### css/reservas.css
| Clase / selector | Descripción |
|---|---|
| `.fecha-item` | Card contenedor de fecha en s4 (position:relative, borde, radius 14px, overflow hidden); `.sel` = seleccionada (borde --brand, fondo --brand-warm); `.agotada` = sin cupo; `.open` = panel de info expandido |
| `.fi-conflicto-talla` | Línea de texto **dentro** de `.fecha-item`, entre `.fi-header` y `.fi-footer` (debajo de los pills de hora/ubicación, antes de "Más información"), oculta por default; aviso (`var(--warning)`) si la talla habitual no está disponible para esa fecha puntual, éxito (`var(--success-dark)`) una vez resuelta con `abrirSheetTallaNuevaReserva()`. Antes vivía como sibling de `.fecha-item` fuera del borde y coexistía con un badge `#fi-badge-<slug>` posicionado absoluto en la esquina superior derecha de la card — ese badge se eliminó porque su posicionamiento (`top:8px;right:8px`) quedaba pintado encima de `.fi-circle` (los elementos posicionados pintan sobre los de flujo normal en el mismo contexto de apilamiento), haciendo que el círculo de selección se viera reemplazado por un ícono amarillo `priority_high` en vez del círculo vacío normal. El texto de aviso es ahora el único indicador de conflicto |
| `.fi-header` | Fila principal clickeable de la card: flex, gap 12px, padding 14px 16px 12px |
| `.fi-content` | Columna de texto (flex:1, min-width:0) |
| `.fi-title` | Nombre de la fecha (0.92rem, font-weight 700) |
| `.fi-pills` | Fila de pills de hora/lugar (flex, gap 7px, flex-wrap) |
| `.fi-pill` | Pill base: inline-flex, padding 4px 10px, border-radius 99px, 0.72rem; el `.material-symbols-outlined` dentro usa 0.85rem |
| `.fi-pill-hora` | Pill hora: fondo --purple-bg, color --purple, borde --purple-border-soft |
| `.fi-pill-lugar` | Pill lugar: fondo --brand-warm, color --brand, borde --brand-warm-border |
| `.fi-pill-maps` | Pill "Cómo llegar" (`<a>`): mismo color que fi-pill-lugar, text-decoration none |
| `.fi-pill-fin` | Pill hora de fin: fondo --info-btn-bg, color --info, borde --info-btn-hover |
| `.fi-pill-dur` | Pill duración: fondo --success-bg, color --success, borde --success-bdr |
| `.fi-circle` | Círculo de selección 28×28px (borde --brand-30); en `.sel` → fondo --brand, icono --white |
| `.fi-footer` | Franja "Más información" (borde-top, padding 10px 16px, cursor pointer); hover → --brand-subtle |
| `.fi-footer-label` | Label del footer (0.72rem, --muted) |
| `.fi-footer-chevron` | Chevron del footer (1rem, --brand); en `.open` rota 180deg |
| `.fi-body` | Panel colapsable (max-height:0 → 400px en `.open`, transición cubic-bezier) |
| `.fi-body-inner` | Contenido del panel (padding 14px 16px 16px, borde-top --border-2) |
| `.fi-desc` | Descripción en el panel (0.8rem, --text-2, line-height 1.65) |
| `.fi-extra` | Fila de pills informativos dentro del panel (flex, gap 7px) |
| `.fecha-razon` | Razón de cupo agotado (0.8rem, --brand) |
| `.pago-metodo / .pago-header / .pago-fila / .pago-label / .pago-valor / .pago-icon` | Bloque de método de pago (s-pago) |
| `.total-box / .total-detalle` | Caja de total con monto y detalle |
| `.total-box .total-fechas-lista` | Lista de fechas/clases reservadas dentro de la caja de total en `s-pago` (`#s-pago-total-fechas`), una por línea con viñeta; `0.78rem`/`var(--success-bright)`, un escalón por debajo de `.total-detalle` (`0.85rem`); solo visible con pago "por clase" |
| `.tipo-pago-wrapper` | Contenedor del selector de tipo de pago en s4 (solo margen, sin fondo amber) |
| `.tp-seg` | Segmented control: inline-flex, fondo --brand-subtle, borde, border-radius 99px |
| `.tp-slider / .tp-slider.animado` | Pastilla deslizante (position absolute, fondo --brand); `.animado` habilita transición CSS |
| `.tp-opt / .tp-opt.active` | Opción del segmented control; `.active` pone color --white |
| `.tp-cupon-ico` | Ícono `confirmation_number` visible en "Por clase" solo si hay cupón |
| `.tp-hint / .tp-hint.visible` | Aviso de cupón bajo el control (`.visible` lo hace `display:flex`) |
| `.nota-pago-wrapper / .nota-pago-label / .nota-pago-input / .nota-pago-hint` | Campo referencia de pago |
| `.chk-pago-label` | Checkbox "Ya realicé el pago" |
| `.reserva-card` | Tarjeta de reserva en historial |
| `.btn-cancelar` | Botón cancelar reserva |
| `.aviso-pendiente` | Aviso amarillo de pago pendiente |
| `.meses-grid-pills / .meses-divider` | Grid de pills de meses (pago mensual): 3 columnas, divisor antes del mes actual |
| `.mes-item / .mes-past / .mes-confirmado / .mes-nombre / .mes-badge` | Pill de mes: pasado (opacidad 0.4), confirmado (verde/sin pointer-events), badge "Pagado" con ícono check_circle |
| `.btn-wp-inactivo / .btn-wp-activo / .btn-wp-grupo` | Botones de WhatsApp (comprobante / grupo) |
| `.exito-* / .exito-titulo / .exito-detalle / .exito-texto` | Pantalla de éxito s6 |

### css/perfil.css
| Clase / selector | Descripción |
|---|---|
| `.datos-seccion / .datos-seccion-titulo / .datos-seccion-body` | Acordeón de sección en Editar datos |
| `[id^="grp-res-"]` | Grupos de reservas en historial con transición |
| `#ddp-modal` | Overlay del date picker de Mis Datos (ddp-*) |
| `.ddp-card / .ddp-header / .ddp-selected-date / .ddp-header-label` | Card y header del ddp picker |
| `.ddp-nav / .ddp-nav-chips / .ddp-nav-label` | Navegación mes/año del ddp picker |
| `.ddp-grid / .ddp-day-label / .ddp-day / .ddp-day.ddp-selected / .ddp-day.ddp-today` | Grilla de días del ddp picker |
| `.ddp-footer / .ddp-btn / .ddp-btn-cancel / .ddp-btn-ok` | Botones Cancelar/OK del ddp picker |
| `.ddp-year-grid / .ddp-year-btn / .ddp-year-selected` | Grilla de selección de año |
| `.ddp-month-grid / .ddp-month-btn / .ddp-month-selected` | Grilla de selección de mes |
| `.aj-pills-row / .aj-pill / .aj-pill.activa / .aj-pill.activa-outline` | Fila/grid de pills seleccionables reutilizado en pronombres, protecciones parciales y tallas de reserva |
| `.aj-pill.no-disponible` | Variante tachada/deshabilitada de `.aj-pill` (talla ya reservada por otra persona para esa fecha) |
| `.aj-pill.talla-actual` | Variante de `.aj-pill` con borde de acento (`var(--brand)`), marca la talla actual de la reserva antes de seleccionar nada en el sheet de cambio de talla |

> **Nota:** `.aj-sub-bar` fue eliminado — las sub-pantallas usan `.app-nav` de `css/nav.css`.

### css/admin.css
| Clase / selector | Descripción |
|---|---|
| `@media dark #modal-nav-inner` | Dark mode para el modal de navegador recomendado |

### Cambios recientes
- **js/reservas.js + js/ui.js** — Fix del checkbox "ya pagué" (`#chk-pago`, `s-pago`) que quedaba visualmente marcado (círculo naranja `.sel-pago` + `.chk-pago-label.sel`) después de volver a `s4` para cambiar/agregar fechas y reingresar a `s-pago` — el checkbox real quedaba correctamente desmarcado (`continuar_s4()` ya reseteaba `.checked`/`disabled`), pero nada removía las clases visuales, que solo `toggleBtnPago()` toca y que no se disparan al asignar `.checked` por JS (no dispara el evento `change`). Diagnóstico confirmado en dos pasadas: la primera vez se identificó la causa pero el fix nunca llegó a implementarse antes de pasar a otra tarea — se reconfirmó con `git log`/el código actual que `continuar_s4()` seguía intacto. Fix: nueva `_resetChkPago()` (`js/reservas.js`) que resetea *todo* junto (estado real + clases visuales), reemplazando el reset manual en `continuar_s4()`, y **llamada también desde `ir()`** (`js/ui.js`, cuando `id==='s-pago'`, mismo patrón que ya usa para `#home-nav` en `s-home`) — esto cubre además el caso en que el usuario reingresa a `s-pago` con el gesto de "adelante" del navegador (`popstate` → `ir('s-pago', true)` directo), que no pasa por `continuar_s4()` en absoluto y antes no reseteaba nada.
- **js/reservas.js** — Eliminado el párrafo "Puedes revisar el estado desde Mis reservas. Si no puedes venir, cancela para liberar el cupo." de `s6` (pantalla de éxito) — quedaba redundante con `#s6-liberar-cupo` ("Si no puedes venir, avisa lo antes posible para liberar tu cupo..."), agregado en el cambio de fusión `s5`→`s6`. El texto vivía en `#s6-texto` (`.exito-texto`), un elemento **compartido por 3 mensajes distintos** armados en `confirmarReserva()` según el resultado (reagendada / con equipo / pago simple) — no se podía borrar el elemento entero sin perder los otros dos. Se dejó vacío y oculto (`display:none`) específicamente para la rama `necesitaEquipoLocal`; las otras dos ramas (reagendando, pago simple) ahora también fuerzan `display:block` explícito, para que `#s6-texto` no quede oculto de una reserva anterior si el usuario hace más de una reserva en la misma sesión (`s6` es una pantalla persistente, no se reconstruye).
- **index.html + css/reservas.css + js/reservas.js** — En el recuadro verde de total de `s-pago` (`#s-pago-total`, `.total-box`), agregada la lista de fechas/clases que se están reservando, debajo de la línea "N clase(s) × $X" — nuevo `<div class="total-fechas-lista" id="s-pago-total-fechas">` dentro de `#s-pago-total`, poblado en `continuar_s4()` con `E.fechas.map(f => '• ' + f).join('<br>')` (el string de cada fecha ya viene listo para mostrar tal cual, sin necesidad de reformatear — mismo compuesto "Fecha - Hora - Lugar" que arma el backend). Solo visible con pago "por clase" (`E.tipoPago==='clase'`); oculto en mensual, donde no aplica (`E.fechas` está vacío, se usa `E.meses`). Nueva clase `.total-fechas-lista` en `css/reservas.css` — `font-size:0.78rem` (mismo valor que ya usa `.aj-pill`, un escalón por debajo del `0.85rem` de `.total-detalle`) y `color:var(--success-bright)` (mismo verde que `.total-detalle`, para sentirse parte del mismo recuadro).
- **index.html** — 2 ajustes visuales en `#btn-wp-exito` ("Enviar comprobante por WhatsApp" en `s6`, pantalla de éxito): (1) texto alineado a la izquierda (`justify-content:flex-start` inline en el elemento) en vez de centrado, para consistencia con el resto de los párrafos de esa pantalla. (2) Ícono SVG cambiado de `fill="white"` a `fill="var(--success-dark)"` — mismo verde sólido que ya usa el botón `#btn-wp-pago` del paso de pago (como fondo, ahí). **Ninguno de los dos cambios toca la clase compartida `.btn-wp-inactivo`** (`css/reservas.css:92-98`) — se aplicaron puntuales sobre `#btn-wp-exito`, porque esa clase también la usa `#btn-wp-grupo-insc` en `inscripcion/index.html` (botón de unirse al grupo de WhatsApp), que no debía verse afectado.
- **index.html + js/reservas.js** — Simplificación adicional del flujo de pago, sobre lo hecho en el cambio anterior (fusión de `s5`→`s6`): (1) Eliminado el modal automático `#modal-wp-comprobante` (pedía enviar el comprobante por WhatsApp antes de poder seguir) y las funciones `continuar_pago_y_wp()`/`modalWpEnviado()`/`modalWpSaltear()` — `#btn-pago` ("Continuar" de `s-pago`) ahora llama directo a `continuar_pago()`. (2) Nuevo botón fijo `#btn-wp-pago` ("Enviar comprobante por WhatsApp", mismo estilo verde `var(--success-dark)` y SVG que tenía el modal) en `s-pago`, no obligatorio — reemplaza al `<div id="wp-wrapper">` que existía ahí: **ese wrapper estaba vacío y sin ningún JS que lo tocara** (se verificó con grep antes de tocar nada — era HTML muerto de un diseño anterior nunca completado, no "ya implementado" como se creía). El `href` se setea con `E.wpUrl` en `continuar_s4()`, mismo punto donde ya se computaba ese string. (3) Eliminado también el bottom sheet `#sheet-confirmar-reserva` ("¿Estás segurx?") agregado en el cambio anterior — ya no se usa ningún paso intermedio entre "Continuar" y la reserva real: `continuar_pago()` y la rama gratis de `continuar_s4()` llaman directo a `confirmarReserva()`. (4) `confirmarReserva()` pasó a aceptar el botón que la disparó como parámetro opcional (`confirmarReserva(btn)`) en vez de buscar un `#btn-confirmar` fijo (que vivía dentro del sheet eliminado) — hacen falta dos botones distintos porque se llama desde dos lugares físicos (`#btn-pago` en `s-pago`, `#btn-s4-continuar` en `s4`, id nuevo agregado ahí). (5) Eliminado el flag `E.wpEnviado` (confirmado con grep que ningún otro lugar del código lo leía — quedaba muerto desde que se seteaba). El checkbox "ya pagué" se sigue validando exactamente igual que antes, ahora dentro de `continuar_pago()` únicamente.
- **index.html + js/reservas.js + js/ui.js** — Simplificación del flujo de "Hacer una reserva": eliminado el paso 3 ("Resumen de tu reserva", pantalla `s5`) como pantalla dedicada, generaba confusión. (1) El botón "Continuar" de `s-pago` (`continuar_pago()`, tras el modal de comprobante de WhatsApp) y la rama de reserva 100% gratis de `continuar_s4()` (que antes saltaba directo de `s4` a `s5` sin pasar por `s-pago`) ahora abren un nuevo bottom sheet **`#sheet-confirmar-reserva`** ("¿Estás segurx?", mismo patrón `overlay`+`translateY`/`cubic-bezier` que el resto de los `*-sheet-*`) vía la nueva `abrirSheetConfirmarReserva()` — reemplaza a `construirResumenS5()`+`ir('s5')` en ambos puntos. El sheet muestra un resumen rápido (lista de fechas/meses + total) en `#sheet-confirmar-resumen`; "Cancelar" (`cerrarSheetConfirmarReserva()`) solo cierra el sheet sin navegar — el usuario queda en `s-pago`/`s4`, que ya es "volver" en la práctica (a propósito no hay un botón de volver-a-un-paso-anterior dentro del sheet, como si tenía `s5`). (2) El botón `#btn-confirmar` (mismo `id` de siempre) se trasladó adentro del nuevo sheet — `confirmarReserva()` no necesitó cambios para seguir manejándolo, solo se le agregó al inicio el cierre explícito del sheet (los sheets no se auto-ocultan al navegar como sí hacen las `.pantalla`, así que sin esto quedaría visualmente abierto encima de `s6`). (3) El detalle completo que mostraba `s5` (Nombre, Tipo de pago, Total, Fecha/s o Meses, Patines, Protecciones, Referencia pago) se fusionó dentro de **`s6`** (pantalla de éxito), reemplazando la vieja `.exito-detalle`/`#s6-detalle` (caja verde con texto plano) por un nuevo `#s6-resumen` (`class="resumen"`, reutilizando tal cual `fila()` y el estilo de `s5`). De paso se corrigió una inconsistencia: la fila "Fecha/s" de `#s6-resumen` ahora muestra la **talla real usada en cada fecha** (`E.tallasPorFecha[fecha] || E.datos.talla`, ej. "• miércoles 1 de julio — Talla 39"), en vez de una única talla de perfil que podía no reflejar las excepciones por fecha agregadas en la pasada anterior — la fila agregada "Patines" ahora dice solo `Sí`/`No` para no contradecir el detalle por fecha (no aplica al pago mensual, que nunca usa `E.tallasPorFecha`). (4) Los párrafos fijos de `s5` con los links "¿Qué significa esto?" (`abrirModalInfoEstado()`/`abrirModalInfoPolitica()`) se trasplantaron a `s6` como `#s6-aviso-pago`/`#s6-liberar-cupo`, con las mismas condiciones de visibilidad (`E.totalPago>0` / `necesitaEquipo()`) — `#s6-aviso-pago` **reemplaza** específicamente la rama `else` (pago pendiente de verificación) del banner corto `#s6-email-aviso`; las otras dos ramas de ese banner (reagendada 🔁, cupón aplicado 🎟️, ambas para `totalPago===0`) se mantuvieron intactas, y se sumó una tercera rama para el caso "gratis por créditos a favor" (antes no tenía ningún mensaje propio, quedaba con lo que hubiera del render anterior — otra inconsistencia menor corregida de paso). (5) Limpieza de referencias muertas a `s5`: entrada eliminada de `TOP_BAR_CONFIG` y del mapa `pasos`/`sinPasos` en `js/ui.js`. Se descubrió que **`.paso-indicator`/`#dot1-4` no existen en `index.html`** — ese bloque de `ir()` es código muerto desde antes de este cambio, no requirió ningún ajuste visual real. Etiquetas de texto sí actualizadas: "Paso 1 de 3" → "Paso 1 de 2" (`js/reservas.js`, label de `s4`) y "Paso 2 de 3" → "Paso 2 de 2" (`index.html`, label de `s-pago`). La inconsistencia preexistente y no relacionada de `s2` ("Paso 1 de 4") no se tocó.
- **css/reservas.css + js/reservas.js + js/home.js** — Segundo flujo de "Cambiar talla" (el primero fue "Mis Reservas", ver entrada de abajo): elegir una talla alternativa solo para una fecha puntual durante la selección de fechas al crear una reserva nueva ("Próximos entrenamientos", `cargarFechas()` en `js/reservas.js`). Reusa el mismo sheet `#sheet-talla` y sus funciones compartidas (`_renderGridSheetTalla`, `seleccionarTallaSheet`, `avisarTallaNoDisponible`, `_habilitarConfirmarTalla`, `cerrarSheetTalla`) sin duplicar nada — se le agregó un modo (`_tallaSheetModo`: `'existente'`/`'nueva-reserva'`) y se extrajo la lógica común de apertura a `_abrirSheetTallaBase()`. Por cada fecha disponible donde el usuario necesita patines, `cargarFechas()` dispara en paralelo (sin bloquear el render inicial de la lista) `_chequearTallaFecha()` contra `getTallasDisponiblesParaFecha`; si la talla habitual del usuario no está disponible puntualmente para esa fecha, revela con fade-in (`@keyframes fadeIn`) un badge (`.badge.badge-pendiente`, esquina superior derecha de la card, requirió agregar `position:relative` a `.fecha-item`) y una línea de texto debajo de la card (nueva clase `.fi-conflicto-talla`) en color de aviso (`var(--warning)`). Si `getTallasDisponiblesParaFecha` falla o tarda, la fecha se trata como "sin conflicto detectado" (comportamiento normal, sin bloquear la selección) — nunca deja la card en un estado intermedio. Tocar el círculo de una fecha con conflicto sin resolver (`manejarClickFecha()`, reemplaza la llamada directa a `toggleFecha()` en el onclick de `.fi-header`) abre el sheet en modo `'nueva-reserva'` (`abrirSheetTallaNuevaReserva()`, título "Elegir talla para el [fecha]", botón "Usar esta talla para este día") en vez de seleccionar la fecha. Al confirmar una talla ahí (`_confirmarTallaNuevaReserva()`, sin llamar a ningún endpoint — la excepción vive solo en memoria hasta que se confirma la reserva completa): se guarda en el nuevo `E.tallasPorFecha[fecha]`, el badge desaparece (fade-out) y el texto cambia a éxito ("Talla [X] asignada para este día", `var(--success-dark)`), y recién ahí se marca el círculo como seleccionado automáticamente (`toggleFecha`) — a partir de ese momento esa fecha vuelve a comportarse como cualquier otra (deseleccionar/reseleccionar sin reabrir el sheet; la excepción no se borra al deseleccionar, coherente con que vive por fecha, no por estado de selección). `E.tallasPorFecha`/`_conflictosTalla` se resetean en cada `cargarFechas()` (así una recarga siempre re-valida desde cero, sin arrastrar una talla vieja sin revalidar) y en `irNuevaReserva()`/`iniciarReagendamiento()`. En `confirmarReserva()`, el loop `guardarSiguiente()` (solo pago "por clase") manda `E.tallasPorFecha[fecha]` si existe, si no la talla de perfil de siempre — el loop mensual no se tocó (esta excepción no aplica a ese flujo).
- **css/perfil.css + index.html + js/home.js** — Nuevo flujo "Cambiar talla" en "Mis Reservas" (solo el flujo desde la card ya creada; el de selección de fechas al armar una reserva nueva queda para otra pasada): la pill de talla en `_renderCardHome()` (`fi-pill-patines`, dentro del panel "Más información") pasa de ser de solo lectura a un botón tappable con ícono `edit`, visible solo si `r.estado` es `Pendiente` o `Confirmada` (no en `Cancelada`/`Reagendar`/`Crédito usado`) — al tocarla abre el nuevo bottom sheet `#sheet-talla` (`index.html`, mismo patrón `overlay` + `translateY`/`cubic-bezier(0.16,1,0.3,1)` que `#bs-protec`/`#sheet-gestionar`). El sheet pide `getTallasDisponiblesParaFecha(fecha, nombreExcluir=E.nombre)` (acción de backend nueva, ya confirmada en producción — excluye del conteo la propia reserva del usuario) y renderiza un grid de 3 columnas (`display:grid` inline sobre el contenedor, ya que `.aj-pills-row` en sí es `flex-wrap` de ancho variable) reutilizando `.aj-pill`/`.aj-pills-row` de `css/perfil.css` sin crear un patrón nuevo — dos variantes CSS agregadas ahí: `.aj-pill.no-disponible` (tachada, `color:var(--text-faint)`, `cursor:not-allowed` — misma variable que ya usa `select:disabled` en `ui.css`) para tallas ya reservadas por otra persona, y `.aj-pill.talla-actual` (`border-color:var(--brand)`) para marcar con un borde sutil la talla actual de esa reserva antes de que el usuario toque nada. Tocar una talla no disponible muestra `'Talla [X] no disponible: ya fue reservada por otra persona para este entrenamiento.'` vía `err('err-sheet-talla', ...)` (mismo mecanismo de `.error-msg` que el resto de la app). El botón "Confirmar talla" arranca deshabilitado (`opacity:0.4`, mismo valor que `.btn-primary:disabled` en `ui.css`) y solo se habilita si la talla elegida es distinta a la actual; al confirmar llama a `actualizarTallaReserva(nombre, fecha, tallaNueva)` (acción de backend nueva, ya confirmada en producción — valida sesión vía el token que `api()` inyecta solo, estado Pendiente/Confirmada, y disponibilidad real antes de guardar), cierra el sheet con su transición y reusa `_recargarYRenderReservas()` (el mismo helper que ya usan `ejecutarReagendamiento()`/`ejecutarCancelacion()`) para refrescar la lista completa desde el backend + `mostrarToast('Talla actualizada','ok')`.
- **js/ui.js + js/auth.js** — Las pantallas raíz (`s1` login, `s-home` Mis Reservas, `s-admin-home` panel admin) dejaban que el gesto de "atrás" navegara a un estado interno o saliera de la app: en `s1` salía de la app correctamente, pero en `s-home`/`s-admin-home` hacían falta **dos** "atrás" para salir (el primero quedaba absorbido por la corrección `if (E.datos && id==='s1') id='s-home'` en el `popstate` de `js/ui.js:144`, sin que el usuario viera ningún cambio, y recién el segundo salía de la app) — ninguno de los dos comportamientos era el deseado: en pantallas raíz, "atrás" debe ser un no-op total (ni navegar ni salir; el único gesto que puede minimizar/cerrar la app es el swipe-up nativo de Android, ajeno a esto). Causa raíz: cada `ir('s-home')`/`ir('s-admin-home')` solo hacía un único `pushState` encima de la base `{pantalla:'s1'}` sembrada una sola vez con `replaceState` (`js/ui.js:150`) — nunca se "reemplazaba" esa base, así que la pantalla raíz vivía en la cima de una pila con un solo nivel real debajo. Fix: patrón de "atrapar" el historial (documentado como convención de plataforma en la sección de Navegación por gestos) — nueva `PANTALLAS_RAIZ = ['s1','s-home','s-admin-home']` (`js/ui.js`, junto a `TOP_BAR_CONFIG`); `ir(id, desdeHistorial, sinTrampa)` ahora empuja un `pushState` **duplicado** de sí misma cada vez que `id` está en `PANTALLAS_RAIZ` (salvo `sinTrampa=true`), sin importar si vino por navegación hacia adelante o por `popstate` — así siempre queda un duplicado debajo listo para "atrapar" el próximo atrás, indefinidamente. Sembrado un duplicado inicial de `s1` justo después del `replaceState` de arranque (`js/ui.js:150-151`) para que el primerísimo atrás (antes de cualquier interacción) ya quede atrapado. El listener de `popstate` no cambió su lógica de corrección. De paso, el resync de `pageshow`/bfcache (`js/auth.js:336-346`) ya no necesita apilar una raíz nueva en cada ciclo de background/foreground — como el "piso" ya lo mantiene `ir()` automáticamente desde antes de que la app pase a segundo plano, ahora llama `ir(id, true, true)` (con el nuevo tercer parámetro `sinTrampa`) para solo re-renderizar la pantalla sin tocar el historial en absoluto.
- **index.html + js/home.js** — ⚠️ Pendiente de confirmación en dispositivo real (ver nota abajo). Rediseño del pull-to-refresh de "Mis reservas" al estilo Chrome/Android (arco que se llena progresivamente con resistencia, se fija girando durante la carga real, colores de marca) + 2 bugs encontrados al re-diagnosticar por qué el fix anterior (`_ptrDistActual`) seguía sin sentirse funcional: (1) **Z-index tapado por el nav** — `#ptr-indicator` (`z-index:850`) viajaba entre `top:24px` y `84px` durante el arrastre, superpuesto con `#home-nav` (`.app-nav-fixed`, `z-index:900`, fondo con `backdrop-filter:blur`) que ocupa `0`–`56px` — el indicador quedaba semi-tapado detrás del nav borroso durante buena parte del gesto, aunque la lógica de refresco igual se disparaba. Corregido con `z-index:950` (por encima del nav) y reposicionado a `top:70px`. (2) **`_ptrRefrescando` podía quedar trabado en `true` para siempre** — `api()` (`js/api.js`) usa `fetch()` sin timeout/`AbortController`; si la petición de red se cuelga, ni `onSuccess` ni `onError` se llaman nunca, y como `touchstart` corta de entrada si `_ptrRefrescando` es `true`, un solo intento con mala conexión deshabilitaba silenciosamente todos los intentos futuros del gesto hasta recargar la página. Se agregó un backstop de 10s (mismo patrón que el backstop de 15s de `_nuevxCargandoFechas` documentado más abajo) que resetea el flag y oculta el indicador si `refrescarMisReservas()` nunca llama a su callback. Rediseño: `_ptrProgreso` (0–1, reemplaza a `_ptrDistActual`) mapea el arrastre real a un rango de 140px; el desplazamiento visual del indicador aplica una curva de resistencia (`1-(1-progreso)²`, tipo goma elástica); el `.spinner` dentro de `#ptr-indicator` (ahora con `id="ptr-spinner"`) se rota manualmente (`transform:rotate(progreso*360deg)`, con `animation:none`) para simular el arco llenándose — reutilizando el mismo componente `.spinner`/`@keyframes spin` ya existente, sin crear ninguno nuevo; al soltar con el círculo completo, se limpia el override y el spinner vuelve a girar con su animación infinita propia hasta que el refresh termina, momento en que se anima de vuelta a oculto. **Nota:** no fue posible verificar el comportamiento real en Android/Chrome desde este entorno (sin dispositivo ni herramienta de simulación de eventos touch disponible) — el fix se aplicó por revisión exhaustiva de código, pero queda pendiente de confirmación manual en un celular real antes de considerarse cerrado.
- **manifest.json + css/colors.css** — `theme_color` del Web App Manifest estaba en `#F97316` (naranja marca), sin relación con `--bg`, causando que la barra de navegación gestual de Android se viera naranja en la PWA instalada mientras el fondo real es crema/oscuro. Corregido a `#FDF3EB` (mismo valor que `background_color`, que ya estaba bien sincronizado) — el manifest no soporta variantes light/dark como el `<meta name="theme-color">` de HTML, así que usa el valor `--bg` light única y estáticamente. Agregado comentario en `colors.css` junto a `--bg` recordando esta dependencia manual adicional. Nota: el soporte de Android/Chrome para este comportamiento es inconsistente entre versiones — no hay garantía de que se aplique en todos los dispositivos.
- **index.html + inscripcion/index.html + css/colors.css + inscripcion/inscripcion.js** — Dos bugs de plataforma en inscripción, ahora estandarizados a nivel de toda la app (ver convenciones nuevas en la sección 6, "Reglas globales del proyecto"): (1) **theme-color** — `inscripcion/index.html` tenía un único `<meta name="theme-color" content="#F97316">` fijo en naranja, sin distinguir light/dark, por lo que la barra de estado nunca coincidía con el fondo real de la pantalla. Reemplazado por el mismo par de meta tags con `media="(prefers-color-scheme: ...)"` que ya usaba `index.html`, con los valores exactos de `--bg`/`--bg` dark de `colors.css` (`#FDF3EB` light / `#170900` dark). De paso se corrigió un mismatch preexistente en `index.html` mismo: su meta light tenía `#ffffff` hardcodeado en vez de `#FDF3EB` (`--bg` real en modo claro). Se agregaron comentarios junto a `--bg`/`--bg` dark en `colors.css` recordando que hay meta tags dependientes en ambos HTML que hay que actualizar a mano si esos valores cambian (`<meta>` no soporta `var()`). (2) **Navegación por gestos** — `inscMostrarPaso(idx)` en `inscripcion.js` solo togleaba clases `.activo` sin tocar `history`, así que el navegador solo tenía una entrada de historial para las 7 pasos de inscripción; el gesto de "atrás" (swipe/botón) saltaba directo a la pantalla anterior real (login), sin pasar por los pasos intermedios. Ahora `inscMostrarPaso(idx, desdeHistorial)` hace `history.pushState({pasoInsc:idx}, ...)` en cada avance (salvo cuando `desdeHistorial` es true), hay un `history.replaceState({pasoInsc:0}, ...)` inicial que seedea el paso 0 sin agregar una entrada extra, y un nuevo listener `popstate` propio de `inscripcion.js` que llama `inscMostrarPaso(idx, true)` en vez de dejar que el navegador salga de la página — mismo patrón que `ir(id, desdeHistorial)`/`popstate` en `js/ui.js:81-150`, que ya usa el resto de la app. Al estar en el paso 0 y volver a hacer "atrás", no queda ningún estado propio que consumir, así que el comportamiento nativo (salir de inscripción) sigue funcionando sin intervención.
- **js/home.js** — Dos fixes en "Mis reservas": (1) **Loader al volver desde una reserva exitosa** — `irHomeDesdeExito()` (botón "Volver a Mis Reservas" en s6, `index.html:419`) llamaba a `ir('s-home')` de inmediato, sin esperar `getReservasPersona`, y sin el overlay de pantalla completa que sí protege a los demás flujos de login (`js/auth.js`, que llaman `mostrarCargando()` antes de pedir las reservas). Durante esa ventana, `#home-reservas-lista` mostraba lo que hubiera quedado renderizado de la visita anterior — si era la primera reserva del usuario, literalmente el empty-state ("Todavía no tienes ninguna reserva"), confundible con un bug. Fix: antes de pedir los datos, `irHomeDesdeExito()` ahora hace fade a opacity 0 sobre `#home-reservas-lista` y, en el mismo `setTimeout(...,50)` que ya usa `prepararHome()` (`js/home.js:41`, mismo patrón/mismo elemento, se reusó tal cual por consistencia), inyecta un loader (`.loader` + `.spinner`, sin agregar CSS nuevo) y hace fade de vuelta a opacity 1; `_renderHomeReservas()` reemplaza ese placeholder con el contenido real (cards o empty-state legítimo) en cuanto el fetch resuelve — no hizo falta ningún flag nuevo porque `_renderHomeReservas()` ya solo corre con datos reales. `refrescarMisReservas()` (botón desktop / pull-to-refresh) no se tocó a propósito: ahí `_todasReservas` conserva los datos viejos mientras se refresca, así que la lista nunca queda vacía y ya tiene su propio feedback visual (ícono girando / `#ptr-indicator`). (2) **Pull-to-refresh no disparaba el refresco** — el listener `touchend` (`js/home.js`) recuperaba la distancia arrastrada parseando con regex el valor serializado de `ind.style.transform` (escrito en `touchmove` sin espacio tras la coma, ej. `translate(-50%,20px)`); al leerlo de vuelta, el navegador normaliza la serialización de CSSOM insertando un espacio después de la coma (`translate(-50%, 20px)`), que la regex no toleraba — el match siempre fallaba, `dist` caía en `0` y el umbral de 45px nunca se cumplía, sin ningún error en consola (el indicador se arrastraba bien visualmente porque `touchmove` no depende de esa lectura). Fix: nueva variable `_ptrDistActual`, actualizada directamente en cada `touchmove` con la distancia real y leída sin parseo en `touchend` — se eliminó por completo la dependencia de parsear CSS serializado. Se resetea a `0` en `touchstart` y al final de `touchend` (dispare o no el refresh) para no arrastrar un valor viejo al siguiente gesto.
- **css/global.css + css/ui.css + index.html + js/home.js** — Refrescar "Mis reservas" (`#s-home`) sin recargar la página: (1) Botón de refrescar en desktop — nuevo `#btn-refrescar-home` (ícono `refresh`) dentro de `#home-nav .app-nav-actions`, reutilizando la clase `.app-nav-icon-btn` de `css/nav.css` (ya existía definida pero sin ningún uso en el HTML hasta ahora). Oculto por defecto (`style="display:none"`) y mostrado solo en desktop vía `@media (min-width: 601px) { #btn-refrescar-home { display: flex !important; } }` en `css/ui.css`, mismo breakpoint 600/601px que ya usa el proyecto para `#btn-contacto-login`. (2) Pull-to-refresh nativo deshabilitado globalmente con `overscroll-behavior-y: contain` en `html, body` (`css/global.css`) — `contain` en vez de `none` porque alcanza para bloquear el gesto de reload encadenado al viewport (el que dispara el reload completo en Chrome/Android) sin eliminar el rebote/glow nativo de scroll en iOS/Android, que se quería conservar. (3) Gesto custom scopeado a "Mis reservas" — nuevos listeners `touchstart`/`touchmove`/`touchend` en `window` (`js/home.js`), activos solo cuando `#s-home` tiene la clase `.activa` (`_ptrEnMisReservas()`) y el scroll está en el tope (`window.scrollY <= 0` al iniciar el drag); sin `preventDefault` para no interferir con el rebote nativo de iOS que corre en paralelo. Mientras se arrastra, revela `#ptr-indicator` (nuevo elemento fijo en `index.html`, reutiliza `.spinner` de `global.css` sin agregar colores/tamaños nuevos fuera del `width`/`height`/`border-width` inline ya usados en el proyecto para variantes de spinner) con opacity/transform proporcional al arrastre (con resistencia); al soltar, si superó el umbral dispara el refresh y mantiene el spinner visible hasta que termina. (4) Nueva `refrescarMisReservas(callback, btn)` en `js/home.js` — pide `getReservasPersona` (a diferencia de `prepararHome()`, que no vuelve a pedir la lista de reservas, solo la enriquece con `getFechasDisponibles`), actualiza `_todasReservas` y re-renderiza vía `prepararHome()` sin navegar; es la única función reusada tanto por el botón desktop como por el gesto mobile.
- **js/pwa.js** — El banner `#pwa-banner` ("Instala la app de Mirlxs") aparecía a veces en desktop. `mostrarBannerPWA()` (único punto que lo abre, llamado desde `js/ui.js:95`) ahora corta temprano si `navigator.userAgent` no matchea `/iPhone|iPad|iPod|Android/`, mismo regex de detección de SO ya usado inline en `navegadorRecomendado()` y `activarPush()` (no había un helper `esMobile()` reutilizable en el proyecto, así que se siguió el mismo patrón de chequeo inline en vez de introducir una abstracción nueva). Comportamiento en mobile sin cambios.
- **js/auth.js + index.html** — Fix 2 bugs en el flujo de "Cerrar sesión" (bottom sheet `aj-sheet-logout` en "Ajustes del perfil"): (1) `cerrarSesion()` (`js/auth.js:197`) tenía su propio `confirm('¿Cerrar sesión?')` nativo del navegador, redundante porque el sheet ya pide esa misma confirmación ("¿Cerrar sesión?" / "Sí, cerrar sesión" / "Cancelar") — se quitó el `confirm()`, ya que su único caller (`index.html:1319`) es justamente el botón del sheet. (2) El sheet nunca se cerraba tras confirmar — `cerrarSesion()` no llamaba a `ajCerrarSheetLogout()` (el mecanismo normal de cierre animado, mismo patrón que `ajCerrarSheetPrefijo()`/`ajCerrarSheetPais()`), y como el sheet/overlay son elementos fijos independientes de `.pantalla` (fuera del control de `ir()`), quedaban visibles con `display:block`/`transform:translateY(0)` superpuestos sobre `s1` tras la navegación a login. Fix: nueva `confirmarCerrarSesion()` en `js/auth.js` como handler del botón "Sí, cerrar sesión" (`index.html:1319`, antes llamaba a `cerrarSesion()` directo) — llama primero a `ajCerrarSheetLogout()` para iniciar la animación de cierre, y recién dentro de un `setTimeout(cerrarSesion, 350)` (mismo timing que usa `ajCerrarSheetLogout()` para ocultar el sheet) ejecuta el logout real y navega a `s1`, así la transición de cierre se ve completa antes de que aparezca login. `cerrarSesion()` quedó intacta salvo por el `confirm()` removido — sigue siendo la única responsable de limpiar sesión/localStorage/`E` y llamar `ir('s1')`.
- **js/auth.js + js/home.js + js/reservas.js** — Fix bug de UX: tras crear la cuenta (redirect `?nuevx=1`), el `#loading-overlay` se ocultaba prematuramente (dejando un flash de pantalla en blanco con solo el logo del `<div class="header">` estático, antes de que apareciera "Próximos entrenamientos" con las fechas). Causa: dos llamadas a `getFechasDisponibles` corriendo en paralelo sin coordinación — la de `prepararHome()` (`js/home.js:30`, para enriquecer las cards de home) y la de `cargarFechas()` (`js/reservas.js:275`, la que realmente puebla la pantalla `s4` que el usuario está esperando) — cada una llamando `ocultarCargando()` en su propio callback (`home.js:42/46` y `reservas.js:359/368`). En el flujo `_pendingNuevx` (post-registro), `cargarFechas()` arranca recién 300ms después vía `setTimeout` (`auth.js:88`/`306`), así que el fetch de `prepararHome()` solía responder primero y cerraba el loader antes de que `cargarFechas()` tuviera contenido para mostrar; como en ese momento ningún `.pantalla` está `.activa` todavía (no se llama `ir('s-home')` en la rama `_pendingNuevx`), lo único visible era el logo estático del header. No se pudo usar `window._pendingNuevx` como condición porque se limpia sincrónicamente (`auth.js:82`/`305`) muchísimo antes de que cualquiera de los dos fetches responda — evaluarlo dentro de los callbacks async siempre da `null`. Fix: nuevo flag dedicado `window._nuevxCargandoFechas`, seteado `true` junto con `_pendingNuevx` en `auth.js:267-268` (con un `setTimeout` de 15s como backstop que lo limpia solo, por si el login nunca llega a `cargarFechas()` — ej. error de red en `getReservasPersona`, login manual con PIN vía `continuar_pin()`, o ramas tempranas de `onGoogleCredentialUsuario()` como admin/no-registrado/token inválido — ninguna de esas pasa por el bloque que consume `_pendingNuevx`, así que sin este backstop el flag quedaría en `true` para el resto de la sesión). `prepararHome()` (`home.js:42/46`) ahora chequea `if (!window._nuevxCargandoFechas) ocultarCargando();` en vez de ocultar incondicionalmente. `cargarFechas()` (`reservas.js:359` éxito y `:368` error) limpia el flag (`window._nuevxCargandoFechas = false;`) antes de su propio `ocultarCargando()`, quedando como única responsable de cerrar el loader en este flujo. Fuera del flujo `_pendingNuevx`, `prepararHome()` sigue ocultando el overlay exactamente igual que antes (el flag nunca se setea).
- **inscripcion/inscripcion.js + js/reservas.js** — Validación adicional en las pills multi-select de protecciones parciales: `inscConfirmarOtroProtec()` y `confirmarOtroProtec()` ahora bloquean confirmar si `vals.length === 4` (las 4 pills activas a la vez), mostrando `'Si necesitas las 4 protecciones, selecciona la opción "Sí, necesito protecciones completas".'` vía `errMsg('err-insc-protec-sheet', ...)` / `err('err-bs-protec', ...)` — mismo mecanismo inline que la validación de "al menos 1 seleccionada", agregada antes en el check `!vals.length`.
- **inscripcion/index.html + inscripcion/inscripcion.js + index.html + js/reservas.js + js/perfil.js + js/home.js** — Protecciones parciales ("Otro"/"Tengo algunas, me faltan otras"): el textarea de texto libre del bottom sheet se reemplazó por 4 pills de selección múltiple (Casco, Muñequeras, Coderas, Rodilleras), reutilizando el patrón `.aj-pill`/`.aj-pills-row`/`.activa` (`css/perfil.css`) ya usado para pronombres — sin agregar CSS nuevo. Lógica duplicada por archivo/pantalla, igual que ya ocurre con pronombres (`inscTogglePron` en inscripcion.js vs `ajTogglePill` en perfil.js), ya que inscripcion.js y js/reservas.js son bundles independientes sin módulo compartido (aparte de `shared/date-picker.js`): (1) **inscripcion/inscripcion.js** (paso 5C, sheet `#insc-sheet-protec`) — nueva `inscToggleProtecItem(el)` togglea `.activa` en `#insc-protec-otro-pills`; `inscConfirmarOtroProtec()` ahora junta los `data-val` de las pills `.activa` con `', '` (en vez de leer el textarea), valida al menos 1 seleccionada (`errMsg('err-insc-protec-sheet', 'Selecciona al menos una opción.')`, mismo patrón que `inscContinuar3()` para pronombres) y sigue guardando el resultado en `_inscProtecOtro`; `inscCancelarOtroProtec()` verifica pills `.activa` en vez del valor del textarea; se quitó el auto-focus al textarea (ya no existe) de `inscSelProtec()`. (2) **js/reservas.js** (pantalla s3c, sheet `#bs-protec`, usada tanto en una reserva nueva como al editar equipamiento desde "Ajustes del perfil" vía `irEditarEquipDesdeHome()`) — mismo patrón: nueva `toggleProtecItem(el)`, `confirmarOtroProtec()` junta pills `.activa` de `#bs-protec-pills` con `', '` y valida con `err('err-bs-protec', ...)`, `cancelarOtroProtec()` verifica `.activa` en vez del textarea, `abrirBsProtec()` ya no enfoca un input inexistente. (3) **js/perfil.js** no tiene su propio sheet de protecciones (la edición de equipo desde "Ajustes del perfil" reutiliza las pantallas s3a-s3c de reservas.js, no un panel `aj-sub-*`); solo se actualizó `irEditarEquipDesdeHome()` para resetear `#bs-protec-pills .aj-pill.activa` en vez del `#bs-protec-input` (textarea) que ya no existe. (4) **js/home.js** (`_renderCardHome()`) — cuando el valor de protecciones no matchea "completa"/"sí"/"si" ni es "No", ahora antepone `'Necesita: '` al texto (ej. "Necesita: Casco, Coderas") en vez de mostrar la lista pelada. No requirió cambios: `js/perfil.js` (`irEditarDatos()`, ya mostraba `'Protecciones: ' + valor` tal cual, funciona igual con una lista separada por comas) ni el flujo de payload/redirect/auth.js arreglado en el fix anterior (sigue tratando `necesitaProtecciones` como string opaco, sin asumir booleano).
- **inscripcion/inscripcion.js + js/auth.js** — Fix bug de datos: al elegir "Tengo algunas, me faltan otras" en protecciones (paso 5C de inscripción) y confirmar el detalle en el bottom sheet (`inscConfirmarOtroProtec()` guarda el texto libre en `_inscProtecOtro`, ej. "Me falta casco"), tanto la reserva creada justo después del registro como "Ajustes del perfil" mostraban "Protecciones completas"/"Protecciones: Sí" como si se hubiera elegido la opción 1. La causa no estaba en `inscConfirmarOtroProtec()`/`inscEnviar()` (que arman bien el payload `necesitaProtecciones` hacia `inscribirPersona`, con el string libre), sino en el redirect post-registro exitoso: `inscEnviar()` línea ~471 armaba la URL `?nuevx=1&...&protec=...` colapsando el string libre a un booleano (`protec==='No'?'no':'si'`), y luego `js/auth.js` (`onGoogleCredentialUsuario()` y el callback de `restaurarSesion`) al consumir `window._pendingNuevx` reexpandía ese booleano a un literal fijo `'Sí'`/`'No'`, pisando `E.datos.necesitaProtecciones` y perdiendo el detalle antes de que se creara la primera reserva (`irNuevaReserva(true)`) y de que se poblara "Ajustes del perfil" (`irEditarDatos()` en `js/perfil.js`, que lee `E.datos.necesitaProtecciones` tal cual sin normalizar). Fix: `inscEnviar()` ahora manda `'&protec=' + encodeURIComponent(protec || 'No')` (el string real, no un booleano); `js/auth.js` ahora asigna `E.datos.necesitaProtecciones = _pnx.protec ? _pnx.protec : 'No'` en ambos puntos (sin `decodeURIComponent` extra — `URLSearchParams.get()` ya decodifica el query string, así que decodificar de nuevo rompía con `URIError` si el texto libre contenía un `%` literal, ej. "50%"). `js/home.js` (`_renderCardHome()`, clasifica por `indexOf('completa')`/`'sí'`/`'si'` vs texto libre) y `js/perfil.js` (`irEditarDatos()`) no requirieron cambios: ya manejaban correctamente un string libre en `necesitaProtecciones`, solo recibían el valor ya dañado por auth.js.
- **inscripcion/inscripcion.js** — Título de nav de inscripción cambiado de "Crear perfil" a "Crear cuenta" en los 7 pasos (`_INSC_TITLES`).
- **inscripcion/inscripcion.js** — Eliminada la validación obligatoria de unirse al grupo de WhatsApp antes de completar la inscripción: `inscEnviar()` ya no chequea `_inscWpUnido` ni muestra el error "Por favor únete al grupo de WhatsApp antes de finalizar." — el botón "Únete al grupo de WhatsApp" y la sección siguen mostrándose igual (invitación informativa, `inscWpUnido()` sigue actualizando su estado visual a "¡Ya estás en el grupo!" al tocarlo), pero "Completar inscripción" ya no depende de haberlo tocado.
- **inscripcion/inscripcion.js** — Ecuador (+593) seteado como prefijo de país por defecto en el paso "Contacto": en el `DOMContentLoaded` init, `_inscPrefijoSel` se inicializa con `_AJ_PREFIJOS[0]` (Ecuador es el primer elemento del array) y `#insc-prefijo-display` se actualiza al mismo texto que pinta `inscSelPrefijo()`. Solo se setea una vez al cargar la página — si el usuario elige otro país, `inscSelPrefijo()` sobrescribe `_inscPrefijoSel` normalmente y no se vuelve a resetear a Ecuador al navegar entre pasos.
- **inscripcion/inscripcion.js** — Título de nav unificado a "Crear perfil" en los 7 pasos de inscripción (`_INSC_TITLES`, un valor por índice de `_INSC_STEPS`, inyectado en `#insc-nav-title` desde `_inscRenderProg()`) — antes cada paso mostraba un título distinto (`Tu perfil`, `Tu identidad`, `Contacto`, `Equipamiento` ×3, `Último paso`); ahora los 7 valores del array son `'Crear perfil'`.
- **inscripcion/inscripcion.css** — Agregadas reglas `.insc-scroll h2` y `.insc-scroll h2 + p` en inscripcion.css — los h2 de los pasos de inscripcion no heredaban margin-bottom de `.card h2` porque los pasos no usan la clase `.card`.
- **inscripcion/index.html + inscripcion/inscripcion.js** — Eliminada la opción "Otro..." de pronombres en el paso 3 ("Tu identidad") de inscripción: quitada la pill `aj-pill-otro` y `#insc-pron-otro-display` de `#insc-pron-pills`, y eliminado el bottom sheet `insc-sheet-pron`/`insc-sheet-pron-overlay` (ya inalcanzable sin la pill que lo abría). `inscAbrirOtroPron()`, `inscCancelarOtroPron()` e `inscConfirmarOtroPron()` quedaron comentadas en `inscripcion.js` por no tener ya ninguna referencia viva en el HTML. `_inscGetPronombres()` no requirió cambios — solo deja de encontrar pills con clase `aj-pill-otro`.
- **index.html + js/ui.js** — Agregados `modal-info-estado` (explica estados Confirmada/Pendiente/Cancelada) y `modal-info-politica` (explica responsabilidad del usuario al reservar). Links "¿Qué significa esto?" agregados en la pantalla de resumen s5 (uno junto a "cuando esté aprobada" que abre `modal-info-estado`, otro junto a "tus pertenencias" que abre `modal-info-politica`). Funciones: `abrirModalInfoEstado`, `cerrarModalInfoEstado`, `abrirModalInfoPolitica`, `cerrarModalInfoPolitica` en `js/ui.js`. Nota: `modal-info-estado` es independiente del `modal-estados-reserva` ya existente (con contenido casi idéntico, usado por el link "¿Qué significa esto?" del status bar de las cards de home vía `abrirModalEstados()` en `js/home.js`) — se mantuvo separado a propósito para no tocar esa funcionalidad existente; quedan dos modales con contenido solapado.
- **index.html + js/reservas.js** — Ícono de WhatsApp en los botones "Enviar comprobante" (`#btn-wp-exito` en s6 y `#modal-wp-btn` en `#modal-wp-comprobante`) cambiado del emoji 📲 al SVG oficial de WhatsApp (`fill="white"`, 20×20).
- **index.html + js/reservas.js** — Eliminado el campo "Referencia de pago" (`.nota-pago-wrapper` con `#nota-pago`/`#nota-pago-hint`) de `s-pago`. `actualizarTextosPago()` ya no escribe en `#nota-pago-hint`; `construirResumenS5()` ya no limpia `#nota-pago`; `continuar_pago()` ahora asigna `E.notaPago = E.nombre || ''` en vez de leer el input inexistente.
- **inscripcion/index.html + inscripcion/inscripcion.js** — Nuevo botón `#insc-btn-home` (icono `home`) junto a `#insc-back` en el nav de inscripción, visible solo en el paso 0 (`_inscCurIdx === 0`); redirige a `https://reservas.quindesvolcanicos.com/`. Controlado en `_inscRenderProg()`.
- **inscripcion/inscripcion.js** — Fix bug crítico de PIN: `inscEnviar()` generaba `pinHash` con `sha256Hex(pin)` (sin nombre), mientras que el login (`continuar_pin()` en `js/auth.js`) valida con `sha256Hex(pin + '|' + E.nombre)` — los hashes nunca coincidían y el login con PIN fallaba siempre para cuentas nuevas. Corregido a `sha256Hex(pin + '|' + G.nombre)` para igualar el formato del login.
- **js/home.js + js/auth.js** — `ocultarCargando()` movido de auth.js a dentro del callback de `getFechasDisponibles` en `prepararHome()` — el loader ahora permanece visible hasta que las cards tienen datos completos (`horaFin`, `duracion`, `descripcion`), eliminando el flash de home vacío al cargar.
- **js/home.js** — `prepararHome()` ahora oculta `#home-reservas-lista` (`opacity:0`) durante el primer render síncrono (datos sin enriquecer) y lo revela con fade-in solo después de que `getFechasDisponibles` responda con `horaFin`/`duracion`/`descripcion` completos — elimina el parpadeo de cards incompletas al cargar la home.
- **js/home.js** — `irHomeDesdeExito()` ahora llama a `prepararHome()` después de recibir las reservas frescas, para enriquecer las cards con `horaFin`, `duracion`, `descripcion` y `mapsUrl` — antes esos datos nunca se cargaban al volver desde una reserva exitosa.
- **js/home.js** — Detección de protecciones en cards de home más robusta: `necesitaProtec` ahora también excluye valores que empiezan con "no," (ej. "No, tengo las mías"), no solo el literal `'no'`; `protecTexto` se calcula vía `protecLower` y devuelve `''` para esos casos de "no" (en vez de mostrarlos como si fueran necesidad real), y sigue normalizando a "Protecciones completas" cuando el valor es genérico ("sí"/"completa...").
- **js/home.js** — Pills de equipamiento en cards de home ahora muestran solo el número de talla (sin texto "Te llevamos patines") y el texto real de protecciones (o "Protecciones completas" si el valor es genérico).
- **js/home.js** — `_renderCardHome()` ahora detecta equipamiento usando `r.talla` y `r.protecciones` (campos reales de `getReservasPersona`) en vez de `r.necesitaPatines` y `r.necesitaProtecciones` que no existen en esa respuesta del backend.
- **js/home.js** — `_renderCardHome()` ahora genera pills separados para patines y protecciones ("Te llevamos patines talla X" / "Te llevamos protecciones") en vez de un solo pill que ignoraba protecciones. "Llevas tu equipo" solo aparece si no necesita ninguno de los dos.
- **js/ui.js** — `ir()` ahora evalúa `_todasReservas` antes de mostrar `#home-nav` al navegar a `s-home` — antes usaba `display:''` que caía al default CSS flex, causando un parpadeo del nav en el empty state mientras el callback async de `prepararHome()` aún no había corrido.
- **css/home.css** — 2 fixes en el panel expandible "Más información" de las cards de home (`.res-card-nueva .rn-body`): (1) `.rn-body-inner` ganó `padding-top:12px` (antes `0px`) para separar la descripción del borde superior del panel. (2) `.rn-body` cambió `background:var(--surface-2)` a `background:transparent` — el fondo distinto al del card padre dejaba una franja de color visible al final del panel expandido; con `transparent` hereda el fondo del card.
- **index.html + js/reservas.js + css/reservas.css** — Checkbox "Ya realicé mi pago" (`.chk-pago-label`) rediseñado para usar el mismo círculo de selección `.fi-circle` que las fechas/cupón: `<input id="chk-pago">` ahora oculto (`display:none`), nuevo `<div class="fi-circle" id="chk-pago-circle">` visible, `<label for="chk-pago">`; `toggleBtnPago()` togglea `.sel-pago` en el círculo y `.sel` en `.chk-pago-label`; `.chk-pago-label` cambió `align-items:flex-start` a `center`; nuevas reglas `.chk-pago-label .fi-circle`/`.sel-pago`/`.chk-pago-label.sel` en reservas.css.
- **index.html + css/home.css + js/home.js** — Historial de reservas: selector de mes reemplazado de `<select>` por pills scrolleables horizontales (`#historial-pills-mes`) — solo muestra meses que tienen reservas reales. Nuevas funciones: `seleccionarPillMes()` y `_poblarSelectMesHistorial()` reescrita. Estado del mes seleccionado en `window._historialMesActual`.
- **index.html** — Overlay de `#modal-agotada-overlay`: `background` cambiado de `var(--overlay)` a `rgba(0,0,0,0.72)` + `backdrop-filter:blur(6px)` (y `-webkit-backdrop-filter`) para oscurecer y desenfocar el fondo; la card interior cambió `background:var(--surface)` a `var(--bg)` para contrastar mejor sobre el blur oscuro.
- **index.html** — Selector de cupón (`#s4-cupon-wrapper`): círculo de selección movido al lado derecho para ser consistente con los selectores de fecha; emoji 🎟️ reemplazado por ícono Material Symbols `confirmation_number`.
- **js/reservas.js + index.html** — 3 fixes sobre el flujo de fecha agotada: (1) Modal viejo `#modal-equip-aviso` ("Sin disponibilidad de equipamiento") deshabilitado — la llamada `mostrarModalEquip(agotadasEquip)` en `cargarFechas()` quedó comentada (ya no se dispara), porque quedó redundante con el nuevo modal por-card `#modal-agotada-overlay`; el HTML, las funciones (`mostrarModalEquip`/`cerrarModalEquip`/`irEditarEquipDesdeModal`) y el dark-mode override en `ui.css` quedan intactos sin invocarse. (2) Contraste de `<p id="modal-agotada-msg">` mejorado: `color:var(--muted)` → `color:var(--text)`. (3) Título del modal cambiado de "No disponible" a "No disponible para esta fecha".
- **js/home.js + css/home.css + index.html + js/reservas.js + css/reservas.css** — 4 fixes: (1) Banner "¡Tienes un cupón disponible!" en home (`#banner-cupon`) deshabilitado — `prepararHome()` y `cancelarRes()` ahora fuerzan `display:'none'` siempre, en vez de mostrarlo según `tieneCuponDisponible()`/`cuponRestaurado` (la función `toggleBannerCupon()` y el HTML quedan intactos por si se reactiva más adelante). (2) Botón "Re-agendar o cancelar reserva" cortado dentro del panel "Más información" de las cards de home: `.res-card-nueva .rn-body.open` tenía `max-height:200px` fijo que recortaba el contenido (descripción + pills + botón) cuando superaba esa altura — subido a `max-height:600px` con transición `cubic-bezier(0.16,1,0.3,1) 0.5s` (mismo timing que otras animaciones de la app). (3) Selector de cupón (`#chk-cupon` en s4) rediseñado para igualar el círculo de selección de `.fi-circle` usado en las fechas: el `<input type="checkbox">` ahora está oculto (`display:none`) y se agregó `<div class="fi-circle" id="cupon-circle">` visible antes del texto; `<label for="chk-cupon">` activa el input nativo al hacer click; `toggleCupon()` ahora togglea la clase `.sel-cupon` en `#cupon-circle` (además de actualizar `E.cuponAplicado`, `actualizarTotalS4()` y `actualizarTextosPago()`); nuevas reglas CSS `#s4-cupon-wrapper .fi-circle` / `.sel-cupon` en reservas.css. (4) Fechas "agotadas" en s4 ahora son clickeables hasta que el usuario confirma que entendió: nueva clase `.fecha-item.agotada-pendiente` (en vez de `.agotada` directamente) con `cursor:pointer` y el `.fi-circle` atenuado (`opacity:0.35`); el `.fi-header` tiene `onclick="inscFechaAgotadaClick(...)"` que abre `#modal-agotada-overlay` (nuevo modal en index.html, fuera de `.contenedor`) mostrando `f.razon`; al cerrar el modal (`cerrarModalAgotada()`), la card recién ahí pasa a `.agotada` definitiva (sin cursor, sin onclick) — nuevas funciones en reservas.js: `inscFechaAgotadaClick`, `abrirModalAgotada`, `cerrarModalAgotada`.
- **js/ui.js + js/reservas.js** — Fix bug nav atascada en "home" (la flecha de atrás no aparecía en ninguna pantalla tras visitar home): `ir()` había perdido el toggle de `#home-nav` en el commit "sa" (2142968), que sin querer eliminó las líneas que ocultaban `#home-nav` al navegar fuera de `s-home` (agregadas antes en 3a8aca5). Como `#home-nav` es `position:fixed` con `z-index:900` y `#top-bar` (sticky, con la flecha atrás) tiene `z-index:100`, `#home-nav` quedaba visible para siempre tapando el top-bar en cualquier pantalla. Restaurado en `ir()`: `var homeNav = document.getElementById('home-nav'); if (homeNav) homeNav.style.display = (id === 's-home') ? '' : 'none';` justo después del bloque de `#top-bar`/`TOP_BAR_CONFIG` — usa `''` (no `'flex'`) para `s-home` así `_renderHomeReservas()` sigue decidiendo si se muestra según si hay reservas activas. — Fix bug cupón no aparecía cuando el usuario no necesitaba equipamiento: en `cargarFechas()`, `#s4-cupon-wrapper` (el checkbox real para aplicar el cupón, distinto de `#tp-cupon-ico`/`#tp-cupon-hint`) se mostraba solo si `!puedeMensual` (es decir, solo si el usuario SÍ necesitaba equipo), por lo que un usuario sin equipo nunca lo veía aunque eligiera manualmente "Por clase" en el segmented control — y `selTipoPago()` tampoco reevaluaba su visibilidad al cambiar de tipo. Condición cambiada a `E.tipoPago === 'clase' && tieneCuponDisponible()` en `cargarFechas()`, y se agregó el mismo toggle al final de `selTipoPago()` para que el cupón aparezca/desaparezca al cambiar entre "Por clase"/"Mensual".
- **inscripcion/inscripcion.js** — `iniciarGoogleSignIn()` en inscripcion ahora oculta el botón real (`opacity:0`) hasta 250ms después de detectar el iframe de Google vía `MutationObserver`, momento en que hace crossfade con el skeleton (fade-in del botón + fade-out del skeleton) — esto enmascara el parpadeo de renderizado interno del iframe de Google que no se podía eliminar controlando solo el timing del `renderButton`.
- **inscripcion/inscripcion.js** — `iniciarGoogleSignIn()` en inscripcion reescrita para igualar el patrón del login principal (`iniciarGoogleSignInUsuario` en auth.js): se eliminó el `setTimeout(1000)` arbitrario que causaba un parpadeo visual del botón de Google — ahora `renderButton()` se llama de inmediato y el skeleton se oculta vía `MutationObserver` al detectar la aparición real del iframe de Google, no un tiempo fijo estimado.
- **js/reservas.js** — Corregido bug visual del slider de fondo en el toggle "Por clase/Mensual" (s4): cuando el usuario podía pagar mensual, `selTipoPago('mensual')` se ejecutaba mientras la pantalla s4 todavía tenía `display:none` (no se activa hasta el final de `cargarFechas`), por lo que `_updateTpSlider()` medía `offsetWidth`/`offsetLeft` sobre un elemento invisible y obtenía 0 — el texto cambiaba a blanco pero el fondo naranja del slider nunca se posicionaba. Fix: la lógica de selección se aplica inline (incluyendo `actualizarTotalS4()`, que `generarMeses()` no llama por sí sola) sin medir el slider, y la medición real (`_updateTpSlider`) se pospone hasta después de `ir('s4')`, cuando la pantalla ya es visible.
- **js/auth.js** — Corregido parpadeo de loader tras registro exitoso (flujo nuevx=1): `ocultarCargando()` ya no se ejecuta antes de procesar `window._pendingNuevx` en auth.js (ambos flujos: token fresco y sesión restaurada) — antes había un hueco de ~300ms donde el overlay se ocultaba y la pantalla de login (s1) quedaba visible sin transición antes de que `irNuevaReserva(true)` volviera a mostrar el loader. Ahora el overlay permanece visible de forma continua hasta que el contenido real (home o nueva reserva) está listo para pintarse.
- **inscripcion/index.html + inscripcion/inscripcion.js** — Campo de nombre en paso "Tu identidad": label cambiado de "Nombre o nombre derby" a "Nombre", placeholder más conversacional. El campo ahora se prellenada automáticamente con `res.nombre` de Google en `_inscPoblarPaso2` (mismo patrón ya usado para fecha de nacimiento) — el usuario puede editarlo libremente; el autocompletado solo ocurre si el campo está vacío, para no pisar texto ya escrito.
- **inscripcion/inscripcion.css** — Mensaje de error del date picker (`.dp-error`) ahora tiene separación vertical (`margin-top:10px`, `margin-bottom:14px`) — antes quedaba pegado directamente contra el footer de botones Cancelar/OK, sin aire
- **inscripcion/inscripcion.js + inscripcion/index.html** — `inscEnviar()` ahora tiene protección contra doble-submit vía flag `_inscEnviando` — el bug "Acción no válida" reportado por el usuario era en realidad un triple-submit (3 requests idénticos a `inscribirPersona` en Network), donde probablemente el primero creó la cuenta y los siguientes fallaron por backend (email ya registrado), mostrando un mensaje de error confuso. El flag se resetea en ambos callbacks de error (respuesta con error y fallo de red) para permitir reintentos legítimos. Espaciado entre barra de progreso y `#insc-form-fields` reducido de 24px a 12px tras el colapso de la card de Google, ya que el `padding-top` de `.insc-scroll` (16px) sumado al margin anterior generaba un gap de 44px, sentido como excesivo una vez que la card ya no ocupa espacio arriba
- **inscripcion/inscripcion.css + inscripcion/inscripcion.js** — Revertido color de `.insc-prog-dot` a `var(--border)` (naranja apagado, preferencia visual confirmada) — el gris `--neutral-gray` no se mantuvo. Barra de progreso (`#insc-prog`) ahora visible desde el paso 0 ("Tu perfil") en adelante — al fusionarse login+perfil en un único paso real de contenido, ya no aplica la lógica anterior de ocultarla solo en el paso de Google Sign-In aislado
- **inscripcion/inscripcion.js + inscripcion/index.html + inscripcion/inscripcion.css** — `iniciarGoogleSignIn()` ahora retrasa `renderButton()` 1000ms (antes inmediato) para que el skeleton no se solape con el botón real de Google — fade del skeleton ajustado a 1200ms en consecuencia. Bottom sheets `insc-sheet-pron` e `insc-sheet-protec` corregidos: les faltaba `flex-direction:column` en su inline style (a diferencia de `insc-sheet-prefijo` que sí lo tenía), causando que sus hijos se apilaran en fila en vez de columna al mostrarse. Contraste de `.insc-prog-dot` mejorado: inactivo de `--border-light` a `--border`, `.done` de `opacity:0.45` a `0.7`
- **css/reservas.css** — `.equip-psub` color cambiado de `var(--border-light)` (color de borde, contraste bajísimo) a `var(--muted)` — afecta el subtexto "Toca para especificar" en el pill "Tengo algunas, me faltan otras" de protecciones en inscripcion y en la pantalla de reservas
- **inscripcion/index.html + inscripcion/inscripcion.js** — Fix texto PIN ("Crea un PIN para ingresar como alternativa a tu cuenta de Google"), ícono WA en `inscWpUnido()` cambiado de emoji ✅ a `<span class="material-symbols-outlined">check_circle</span>`, validación de país en `inscContinuar4()`: `_inscPrefijoSel` arrancaba en `_AJ_PREFIJOS[0]` (nunca null) por lo que la selección nunca era obligatoria — ahora inicia en `null` y se exige elegir antes de continuar
- **inscripcion/index.html** — Restaurado `#insc-avatar` y su contenedor `.insc-profile-preview` en `insc-step-1` — se había perdido durante la fusión del paso Google + paso perfil (era referenciado por `_inscPoblarPaso2` pero el HTML quedó incompleto)
- **inscripcion/index.html + inscripcion/inscripcion.js** — Paso 1 y 2 de inscripcion fusionados en un solo paso (`insc-step-1`, "Tu perfil"): la card de Google y los campos de perfil (foto/fecha) coexisten en la misma pantalla — los campos están bloqueados visualmente (`.form-locked`) hasta que Google confirma, momento en que la card de Google se colapsa con transición (`_inscDesbloquearForm`) y los campos se desbloquean (`.form-unlocked`) sin cambiar de paso; `_INSC_STEPS` pasó de 8 a 7 pasos — `insc-step-2` ya no existe como paso independiente; `onGoogleCredentialInscripcion` aplica un delay mínimo de 650ms antes de continuar para evitar que la verificación se sienta instantánea/bugueada cuando llega con `?token=` desde el login principal
- **inscripcion/index.html** — Eliminado `style` inline conflictivo en `#date-picker-modal` — tenía `display:none` y `background` sólido que pisaban las reglas de `inscripcion.css` (`opacity`/`pointer-events` para mostrar, `backdrop-filter:blur`); el modal ahora depende exclusivamente del CSS, igual que el resto de los date pickers compartidos
- **inscripcion/inscripcion.js** — `_inscRenderProg()` ahora oculta `#insc-prog` (barra de progreso) en el paso 0 (Google Sign-In), ya que ese paso es previo al flujo de datos y no debe contarse como "paso 1"
- **inscripcion/index.html + inscripcion/inscripcion.js + inscripcion/inscripcion.css** — Nav de inscripcion migrado a clases compartidas de `css/nav.css` (`.app-nav`, `.app-nav-sticky`, `.app-nav-back`, `.app-nav-title`) — eliminadas las clases duplicadas `.insc-nav`/`.insc-nav-back`/`.insc-nav-title`/`.insc-nav-ph` de `inscripcion.css`; se mantienen `.insc-prog`/`.insc-prog-dot`/`.insc-step` por ser propias del flujo de pasos; `inscripcion/index.html` enlaza ahora `../css/nav.css`; nueva variable `_inscVinoConToken` indica si el usuario llegó desde el login principal con `?token=` — si es `true`, el botón atrás del paso 0 redirige al login principal en vez de quedarse en el mismo paso; `_inscRenderProg()` muestra el botón atrás también en paso 0 cuando `_inscVinoConToken` es `true`
- **inscripcion/inscripcion.js** — `DOMContentLoaded` ahora lee `?token=` de la URL (pasado desde `js/auth.js` al redirigir desde "Registrarme con este correo") y lo procesa automáticamente vía `onGoogleCredentialInscripcion`, saltando el botón de Google Sign-In si ya viene un token válido desde el login principal
- **inscripcion/index.html + inscripcion/inscripcion.js** — Fix date picker fecha de nacimiento: (1) `abrirPickerFecha()` pasaba el callback como primer arg (`valorActual`) en vez de segundo — corregido a `abrirDatePicker(G.fechaNac || '', callback)`; (2) seis IDs del HTML del modal `#date-picker-modal` estaban renombrados en español y no coincidían con los que usa `shared/date-picker.js` — renombrados de vuelta a los IDs canónicos: `dp-sel-label`→`dp-selected-label`, `dp-mes-label`→`dp-month-label`, `dp-anio-label`→`dp-year-label`, `dp-dias`→`dp-days`, `dp-anios`→`dp-year-grid`, `dp-meses`→`dp-month-grid`; (3) botón Google Sign-In cambiado de `theme:'outline'` a `theme:'filled_blue'` con `text:'continue_with', locale:'es'` para igualar la apariencia al login principal
- **inscripcion/inscripcion.js** — `onload()` renombrada a `_inscIniciarGoogleSignIn()` e integrada al flujo de DOMContentLoaded — antes dependía implícitamente de `window.onload` por coincidencia de nombre. Inicialización via DOMContentLoaded (scripts al final del body — window.onload puede no disparar); init protegido con `try/catch/finally` para que `ocultarCargando()` siempre se ejecute aunque cualquier paso del init lance una excepción.
- **inscripcion/index.html + inscripcion/inscripcion.js + inscripcion/inscripcion.css** — Rediseño completo del flujo de inscripción: formulario único → 8 pasos progresivos (Google → foto/fecha → nombre/pronombres → teléfono → patines → talla → protecciones → PIN/WA); nuevas clases CSS: `.insc-nav`, `.insc-nav-back`, `.insc-nav-title`, `.insc-nav-ph`, `.insc-prog`, `.insc-prog-dot`, `.insc-step`, `.insc-scroll`, `.insc-profile-preview`, `.insc-avatar`, `.insc-profile-name`, `.insc-profile-email`, `.insc-tog-row`, `.insc-tog-label`, `.insc-tog-hint`; reutiliza clases de `css/reservas.css`: `.equip-pills-bin`, `.equip-pill-bin`, `.equip-tallas-grid`, `.equip-talla-pill`, `.equip-pills-protec`, `.equip-pill-protec`; reutiliza clases de `css/perfil.css`: `.aj-pill`, `.aj-pill-otro`, `.aj-pills-row`, `.aj-selector-btn`; bottom sheets: `insc-sheet-prefijo`, `insc-sheet-pron`, `insc-sheet-protec`; fecha importada de Google cuando está disponible; date picker como fallback; `inscripcion/index.html` enlaza ahora `../css/reservas.css` y `../css/perfil.css` además de los estilos previos; `inscripcion.js` reescrito con `_INSC_STEPS`, `_INSC_TITLES`, navegación por pasos, API GET local (usa `BACKEND`/`GOOGLE_CLIENT_ID`/`sha256Hex` de `../js/config.js`); función `iniciarDatePicker()` como wrapper de `initDatePickerListeners()`
- **index.html + css/reservas.css + js/reservas.js** — Flujo equipamiento rediseñado con pills: s3a, s3b, s3c usan pills en vez de radio buttons y select; nuevo grid de tallas `.equip-tallas-grid` con `.equip-talla-pill`; bottom sheet `#bs-protec` / `#bs-protec-overlay` para la opción "Otro" en protecciones; nuevas clases CSS en reservas.css: `.equip-pills-bin`, `.equip-pill-bin`, `.equip-pill-ico`, `.equip-pill-label`, `.equip-tallas-grid`, `.equip-talla-pill`, `.equip-pills-protec`, `.equip-pill-protec`, `.equip-pico`, `.equip-ptxt`, `.equip-ptit`, `.equip-psub`, `.equip-pcheck`; funciones nuevas en reservas.js: `selPillBin`, `selPillProtec`, `selTallaEquip`, `abrirBsProtec`, `cerrarBsProtec`, `cancelarOtroProtec`, `confirmarOtroProtec`, `continuar_s3a` (reemplazada), `continuar_s3b` (reemplazada), `continuar_s3c_nuevo` (reemplaza `continuar_s3c`)
- **css/nav.css (nuevo) + index.html + css/ui.css + css/home.css + css/perfil.css + js/ui.js** — Nav unificada en nav.css: nuevo archivo `css/nav.css` con clases `.app-nav`, `.app-nav-fixed`, `.app-nav-sticky`, `.app-nav-back`, `.app-nav-title`, `.app-nav-actions`, `.app-nav-icon-btn`, `.app-nav-cta`, `.app-nav-avatar`, `.app-nav-section`; `#top-bar` migrado a `.app-nav.app-nav-sticky` con `display:flex/none` en lugar de clase `.visible`; `#home-nav` migrado a `.app-nav.app-nav-fixed` con avatar/section/cta unificados; las 6 `.aj-sub-bar` migradas a `.app-nav` inline en cada sub; eliminados: `.top-bar`, `.top-bar-back`, `.top-bar-titulo` (ui.css), `.home-nav-fixed` y relacionados (home.css), `.aj-sub-bar` (perfil.css); `@keyframes smoothSlideDown` movido a nav.css; `ir()` actualizado a `style.display='flex'/'none'` en lugar de classList
- **css/perfil.css + index.html + js/perfil.js + js/reservas.js + js/ui.js** — Fix ajustes perfil: `.aj-sub` usa `position:fixed` (z-index 500) en vez de `position:absolute`; bottom sheets (`aj-sheet-prefijo`, `aj-sheet-pais`, `aj-sheet-texto`) movidos fuera del `.card` a `<body>`; toggles de privacidad cambiados de `<select>` a `<input type="checkbox">`; `cerrarSesion()` ahora pasa por `ajAbrirSheetLogout()` con confirmación; nuevas funciones: `_ajFormatearFecha`, `ajAbrirSheetLogout`, `ajCerrarSheetLogout`; nuevo elemento: `aj-sheet-logout`, `aj-sheet-logout-overlay`; back de equipamiento (`s3a`) va a `s-datos` cuando `editandoDesdeHome`; back de `continuar_s3c` va a `s-datos` en lugar de `s-home`
- **index.html + css/perfil.css + js/perfil.js + js/ui.js** — Rediseño completo de s-datos → "Ajustes del perfil": nueva estructura con hero de perfil clickeable + sub-pantallas posicionadas absolutas (`.aj-sub`) para cada sección: `aj-sub-perfil`, `aj-sub-contacto`, `aj-sub-privacidad`, `aj-sub-legal`, `aj-sub-direccion`, `aj-sub-emerg`; bottom sheets: `aj-sheet-prefijo`, `aj-sheet-pais`, `aj-sheet-texto`; nuevo sistema de pills (`.aj-pill`, `.aj-pill-otro`, `.activa`, `.activa-outline`) en lugar de selects; `irEditarDatos()` reescrita para poblar resumen en la pantalla principal en lugar de llenar inputs; `irEditarPerfil()` abre sub via `irAjSub()`; funciones eliminadas: `guardarSeccion`, `toggleSeccion`, `toggleOtroSelect`, `toggleOtroCheckbox`, `cargarSelect`, `guardarEquipPerfil`; funciones nuevas: `irAjSub`, `cerrarAjSub`, `ajSinglePill`, `ajTogglePill`, `ajAbrirOtroPron`, `ajAbrirSheetTexto`, `ajCerrarSheetTexto`, `ajConfirmarSheetTexto`, `ajSetPillOtro`, `ajAbrirSheetPrefijo`, `ajAbrirSheetPrefijoTarget`, `ajCerrarSheetPrefijo`, `ajSelPrefijo`, `ajFiltrarPrefijos`, `ajAbrirSheetPais`, `ajCerrarSheetPais`, `ajSelPais`, `ajSelPaisOtro`, `ajValidarTel`, `ajGuardarPerfil`, `ajGuardarContacto`, `ajGuardarPrivacidad`, `ajGuardarLegal`, `ajGuardarDireccion`, `ajGuardarEmerg`, `_ajGuardar`, `_ajCargarSub`, `_ajActivarPill`, `_ajCargarPronombres`, `_ajGetPronombres`, `_ajGetSinglePill`, `_ajSetPrefijo`, `_ajRenderPrefijos`, `_getSessionToken`; variables nuevas: `_AJ_PREFIJOS`, `_AJ_PAISES`, `_ajPaisActual`, `_ajPrefijoTarget`, `_ajSheetTextoCallback`; nuevas clases CSS en perfil.css: `.aj-*` (hero, group, row, icon, pill, selector-btn, sub, app-row, btn-logout, btn-delete); prefijo `d-` de IDs de inputs reemplazado por `aj-` en s-datos
- **index.html + css/home.css + js/home.js + js/ui.js** — Nav fija en s-home: nuevo `#home-nav.home-nav-fixed` posicionado fuera de `.contenedor` (fixed, z-index 900, blur backdrop); contiene avatar clickeable (`#home-avatar-nav`, click → `irEditarDatos()`), nombre del usuario (`#home-saludo`), botón "Nueva reserva" (`.btn-nueva-reserva-nav`) y botón logout; `#home-nav-spacer` ocupa el espacio vertical en la card; `_initHomeNav()` calcula `top` según altura del `.header`, ajusta el `spacer` y registra listener de scroll para aplicar clase `.compacto` (oculta texto del nav, reduce avatar, colapsa label del botón) al pasar 40px; `prepararHome()` sincroniza `#home-avatar-nav` con foto/inicial; `ir()` en ui.js muestra/oculta `#home-nav` según pantalla activa; eliminados: `.home-profile-row` con avatar/saludo/botones icono de la card, botón `#btn-nueva-reserva-home` del interior de la card; botón logout ahora solo existe en el nav fijo
- **home.js + index.html** — Refactor cancel/reagendar via bottom sheet: `abrirGestionar` abre `#sheet-gestionar` (bottom-sheet animado con `translateY`) en lugar de navegar a `s-gestionar`; nuevas funciones: `cerrarSheetGestionar`, `sheetVolverOpciones`, `sheetIrCancelar`, `sheetIrReagendar`; `sheetIrReagendar` cierra el sheet y navega a `s-gestionar` (solo reagendar) con delay de 360ms; `ejecutarCancelacion` llama `api` directamente, filtra `_todasReservas` y vuelve a home; eliminadas: `setModoGestionar`, `abrirModalConfirmCancel`, `cerrarModalConfirmCancel`; `s-gestionar` simplificado: solo muestra lista de fechas para reagendar (sin toggle, sin panel cancelar); eliminado `#modal-confirm-cancel`; nuevo overlay `#sheet-gestionar-overlay` + sheet `#sheet-gestionar` con dos estados: opciones y confirmar cancelación
- **home.js + index.html + css/home.css + css/ui.css + ui.js** — Fix foto perfil, cancel/reagendar flow, más info en cards, acordeón pago: `prepararHome` reemplaza `getProximosEntrenamientos` con `getFechasDisponibles` para enriquecer `_todasReservas` con `mapsUrl/horaFin/duracion/descripcion`; `_renderCardHome` usa `hasInfo` para mostrar panel "Más información" con descripción + pills (maps/horaFin/duracion); foto de perfil busca `fotoUrl|foto|fotoPerfil|picture|photoUrl`; badges usan `font-weight:600` + icono `hourglass_empty` para Pendiente; `confirmarCambioFecha` abre modal `#modal-confirm-reagendar` (bottom-sheet); nuevas funciones: `ejecutarReagendamiento`, `cerrarModalReagendar`; `ejecutarCancelacion` usa `mostrarCargando` + filtra `_todasReservas` + vuelve a s-home; `cancelarRes(fecha, onSuccess)` acepta callback; pantalla `s-gestionar` muestra fecha directamente como header; `home-nombre` y `home-saludo-small` tienen `text-align:left`; `.badge` tiene `display:inline-flex;align-items:center;gap:4px`; nueva clase `.badge-reagendar`; `togglePagoMetodo` aplica padding antes de expandir para evitar corte de contenido
- **index.html + home.js + home.css + perfil.js + ui.js** — Rediseño home y flujo gestionar reserva: nueva `.home-profile-row` con avatar, saludo y botones icono reemplaza el bloque emoji/logout; nueva `_renderCardHome` genera `.res-card-nueva` con pills de hora/lugar/equip y botón "Cancelar reserva" que abre `s-gestionar`; nueva pantalla `s-gestionar` permite cambiar fecha o cancelar con toggle + confirmación modal (`#modal-confirm-cancel`); sección sec-equip en s-datos rediseñada con resumen y botón paso-a-paso; nuevas funciones en home.js: `abrirGestionar`, `setModoGestionar`, `cargarFechasGestionar`, `selFechaGestionar`, `confirmarCambioFecha`, `abrirModalConfirmCancel`, `cerrarModalConfirmCancel`, `ejecutarCancelacion`, `_toggleCardBody`; nuevas funciones en perfil.js: `_poblarResumenEquipPerfil`, `irEditarEquipDesdeHome`; nuevas clases CSS en home.css: `.home-profile-row`, `.home-avatar`, `.home-nombre`, `.home-icon-btn`, `.home-subtitulo`, `.res-card-nueva`, `.rn-*`, `.btn-cancel-text`, `.sg-*`
- **index.html + ui.js + reservas.css + reservas.js** — Nuevo selector de meses unificado en s4: `#s4-meses-wrapper` ahora contiene solo `#lista-meses-unificada.meses-grid-pills`; `generarMeses()` renderiza los 12 meses en un grid de 3 columnas con `.meses-divider` antes del mes actual y detecta meses con reservas `Confirmada` desde `_todasReservas` para mostrar badge "Pagado" (`.mes-confirmado`); `crearMesItem` tiene firma `(nombre, esPasado, confirmado)`; eliminadas `toggleMesesPasados()` y `toggleMesesActuales()`; nuevas clases CSS: `.meses-grid-pills`, `.meses-divider`, `.mes-past`, `.mes-confirmado`, `.mes-nombre`, `.mes-badge`; fix en `selTipoPago()`: controla visibilidad de `#lista-fechas` y `#s4-fechas-subtitulo` vs `#s4-meses-wrapper` y llama `generarMeses()` al seleccionar mensual
- **home.js** — `irNuevaReserva()` simplificada: siempre llama `cargarFechas()` directamente, elimina la bifurcación `canPayMonthly()`/`skipEquip`
- **index.html + reservas.js + ui.css** — Nuevo `#modal-equip-aviso`: se dispara en `cargarFechas()` si hay fechas agotadas por razón de equipamiento (regex `patines|talla|protec|equip`); lista items en `#modal-equip-lista`; funciones `mostrarModalEquip`, `cerrarModalEquip`, `irEditarEquipDesdeModal`; dark mode override en ui.css
- **index.html + reservas.css + reservas.js** — Selector de tipo de pago en s4 reemplazado por segmented control con slider animado (`.tp-seg`, `.tp-slider`, `.tp-opt`); `#pill-cupon` eliminado y reemplazado por `#tp-cupon-ico` (dentro del botón) y `#tp-cupon-hint` (aviso bajo el control); `selTipoPago` ya no recibe segundo arg; nueva función privada `_updateTpSlider(animate)`; `.tipo-pago-titulo` eliminado de reservas.css
- **reservas.css + reservas.js** — Nuevo diseño de cards de selección en s4: sistema `.fi-*` (`.fi-header`, `.fi-content`, `.fi-title`, `.fi-pills`, `.fi-pill-hora/lugar/maps/fin/dur`, `.fi-circle`, `.fi-footer`, `.fi-body`, `.fi-body-inner`, `.fi-desc`, `.fi-extra`); `cargarFechas()` parsea `f.fecha` por `" - "` para extraer hora y lugar; `toggleFecha()` recibe la `.fecha-item` directamente; nueva función `toggleFechaExpand()` para el panel colapsable de info; dark mode para `fi-pill-hora` y `fi-pill-fin` en bloque `@media dark` de reservas.css
- **reservas.js + home.js** — Layout de pills en fecha-items y cards de home reorganizado: "Más info ▾" ahora aparece a la izquierda como único pill en la fila; "Cómo llegar" se movió dentro del cuerpo expandido de "Más info" (ya no es un pill independiente en la card)
- **index.html** — `pago-metodo-body`: `padding-bottom` inicial cambiado de `16px` a `0`; el JS (`togglePagoMetodo` en ui.js) lo maneja al abrir/cerrar
- **reservas.css** — `.pago-header`: `margin-bottom` cambiado de `12px` a `0` para evitar filtración de espacio cuando el acordeón está cerrado
- **ui.js / togglePagoMetodo** — Añadido `body.style.paddingTop = abierto ? '0' : '12px'` para restaurar el espaciado superior al abrir el acordeón de pago
- **ui.css dark mode** — Añadido `#modal-wp-comprobante > div { background: var(--dk-overlay-97) !important; }` dentro de `@media (prefers-color-scheme: dark)`
- **ui.js / TOP_BAR_CONFIG** — Entrada `'s6'` eliminada; `ir()` ya tenía el `else { topBar.classList.remove('visible'); }` — s6 ahora oculta la top bar automáticamente; la pantalla usa su propio `exito-titulo` y `exito-icon`
- **colors.css** — Nueva variable `--modal-info-card-bg`: `#ffffff` en light, `rgba(23,9,0,0.97)` en dark; usada en `.modal-info-card` (global.css) y en los modales inline de index.html
- **colors.css** — Añadidos overrides dark mode para: `--surface-light`, `--disabled-bg`, `--disabled-bg-2`, `--disabled-border`, `--border-light`, `--btn-secondary-hover-bg`, `--brand-warm`, `--brand-warm-2`, `--brand-warm-3`, `--info-btn-bg`, `--info-btn-hover`, `--green-light`, `--error-bg`, `--amber-light`, `--amber-lighter`, `--neutral-dark`, `--text-mid`, `--text-faint`, `--border-slate`, `--border-mid`
- **colors.css** — Añadidos overrides dark mode para variables de colores claros: `--error-lightest`, `--error-light-border`, `--error-light`, `--purple-light`, `--purple-lightest`, `--purple-border-soft`, `--purple-bg`, `--amber-border`, `--success-lightest`, `--green-border`, `--info-bg-light`, `--info-light`, `--skeleton-base`, `--skeleton-shine`, `--border-softest`, `--border-warm`, `--brand-warm-border`, `--neutral-lighter`
- **ui.css** — Añadido `select option, select optgroup { background: var(--bg); color: var(--text); }` en bloque dark mode para mejorar aspecto de selects nativos
- **colors.css** — Nuevas variables light: `--neutral-lighter` (#ccc), `--overlay-dark` (rgba 0,0,0,0.7), `--danger-dark` (#991b1b), `--info-bg-light` (#f0f9ff), `--info-light` (#7dd3fc), `--amber-30` (rgba amber 0.4), `--instagram` (#E1306C), `--border-warm` (rgba 168,149,135,0.3), `--brand-warm-border` (#fde8d4)
- **ui.css** — Bordes 1px activados en: `.opcion`, `.chk-opcion`, `.privacy-row`, `.aviso-legal`
- **reservas.css** — Bordes 1px activados en: `.fecha-item`, `.pago-metodo`, `.mes-item`, `.reserva-card`, `.aviso-pendiente`, `.tipo-pago-wrapper`, `.nota-pago-wrapper`, `.chk-pago-label`, `.total-box`, `.btn-wp-inactivo`
- **home.css** — Bordes 1px activados en: `.res-card-home`, `.home-boton`, `.btn-accion-home`
- **perfil.css** — Bordes 1px activados en: `.datos-seccion`
- **inscripcion.css** — Bordes 1px activados en: `.perm-box`, `.opcion`, `.chk-opcion`, `.profile-preview`
- **index.html** — Todos los colores hardcodeados eliminados; reemplazados por variables CSS (`--danger`, `--white`, `--neutral-dark`, `--neutral-gray`, `--neutral-mid`, `--neutral-light`, `--neutral-lighter`, `--overlay`, `--overlay-dark`, `--border-light`, `--disabled-bg`, `--disabled-bg-2`, `--text-faint`, `--surface-light`, `--warning-bg`, `--amber-30`, `--info-bg-light`, `--info-btn-hover`, `--info-light`, `--wa-brand`, `--instagram`, `--brand-warm`, `--brand-warm-border`, `--border-warm`, `--dk-brand-burn`, `--danger-dark`, `--error-lightest`, `--error-light-border`, `--disabled-border`, `--placeholder-color`); skeleton usa `--skeleton-base` / `--skeleton-shine`
- **colors.css** — Nuevas variables: `--skeleton-base` (#d1d1d1), `--skeleton-shine` (#e8e8e8)
- **inscripcion/index.html** — Todos los colores hardcodeados eliminados: iconos del modal contacto usan `--wa-brand`, `--instagram`, `--brand`; skeleton usa `--skeleton-base`/`--skeleton-shine`; hint-nombre-ok usa `--success-dark`; btn-wp-grupo-exito usa `--wa-bg`/`--success-dark`. Excepción intencional: `<meta name="theme-color">` no soporta var() CSS. Ahora importa `../css/global.css` entre `colors.css` e `inscripcion.css`. El header usa `<span class="header-title">` en lugar del logo/enlace.

### css/colors.css — fuente única de verdad de colores
> **Regla:** ningún archivo CSS o JS debe hardcodear un color hex que tenga variable aquí.
> Importado primero en `index.html` e `inscripcion/index.html`.
> Dark mode automático via `@media (prefers-color-scheme: dark)` al final del archivo.
> Los archivos JS (`admin.js`, `home.js`, `reservas.js`, `perfil.js`, `auth.js`) usan `var(--nombre)` en sus strings de estilo inline. Excepción intencional: array de colores de confetti en `ui.js` L204 (valores pasados directamente a canvas, no son CSS).

| Grupo | Variables principales |
|---|---|
| **Brand core** | `--brand / --brand-dk / --brand-secondary` |
| **Brand variants** | `--brand-zero / --brand-subtle / --brand-lightest / --brand-06¹ / --brand-lighter / --brand-08 / --brand-soft / --brand-light / --brand-mid / --brand-focus / --brand-hover / --brand-20 / --brand-glow / --brand-30 / --brand-pulse / --brand-40 / --brand-55 / --brand-60 / --brand-strong / --brand-warm / --brand-warm-2 / --brand-warm-3` |
| **Fondo / Superficie** | `--bg / --bg-2 / --surface / --surface-2 / --surface-3 / --surface-blur` |
| **Bordes** | `--border / --border-2 / --border-light / --border-mid / --border-slate` |
| **Texto** | `--text / --text-2 / --muted / --hint / --text-faint / --text-mid` |
| **Neutros** | `--neutral-dark / --neutral-gray / --neutral-mid / --neutral-light / --text-faint / --text-mid / --disabled-bg-2 / --btn-secondary-hover-bg / --border-light / --border-slate / --border-mid / --border-softest / --surface-light / --disabled-bg / --disabled-border` |
| **Sombras** | `--shadow-sm / --shadow / --shadow-lg / --black-xxs / --black-03 / --black-xs / --black-05 / --black-sm / --black-md / --black-15` |
| **Estados** | `--success / --danger / --warning / --info` (+ `-bg / -bdr` para cada uno) |
| **Success/Green** | `--success-dark / --success-bright / --success-border-dark / --success-shadow / --success-glow / --success-shadow-hover / --success-lightest / --green-dark / --green-light / --green-border` |
| **Error** | `--error² / --error-light² / --error-border² / --error-bg / --error-light-border / --error-lightest` |
| **Amber** | `--amber / --amber-light / --amber-lighter / --amber-dark / --amber-darker / --amber-accent / --amber-border` |
| **Purple** | `--purple / --purple-light / --purple-bg / --purple-border / --purple-hover / --purple-bg-light / --purple-border-light / --purple-lightest / --purple-border-soft` |
| **WhatsApp** | `--wa-bg / --wa-bg-hover / --wa-brand` |
| **Botones / Cards / Radius** | `--btn-primary-* / --btn-secondary-* / --card-* / --radius-sm / --radius / --radius-lg / --radius-full` |
| **Divisores** | `--gray-divider` |
| **Especiales y utilidades** | `--placeholder-color / --text-ghost / --white / --white-40 / --info-btn-bg / --info-btn-hover / --info-shadow / --modal-info-card-bg` |
| **Dark mode tokens** | `--dk-skeleton-base / --dk-skeleton-shine / --dk-skeleton-shine-2 / --dk-info-bg / --dk-info-border / --dk-info-text / --dk-info-text-2 / --dk-error-bg / --dk-error-border / --dk-error-text / --dk-modal-overlay / --dk-modal-item-bg / --dk-modal-text / --dk-modal-btn-bg / --dk-modal-btn-text / --dk-datepicker-bg / --dk-surface-opaque / --dk-input-bg / --dk-pin-press / --dk-brand-burn / --dk-text-muted / --dk-text-ghost / --dk-text-muted-2 / --dk-border-dark / --dk-border-darker / --dk-purple-bg / --dk-purple-text / --dk-purple-mid / --dk-badge-bg / --dk-badge-text / --dk-overlay-95 / --dk-overlay-97` |

> ¹ `--brand-06` es alias de `--brand-lightest` (mismo valor `rgba(249,115,22,0.06)`).  
> ² `--error / --error-light / --error-border` son aliases de `--danger / --danger-bg / --danger-bdr`. El duplicado de `--info` en la sección "Colores extendidos" fue eliminado — solo existe en `/* ── Estados */`.

### inscripcion/inscripcion.css
> ⚠️ Ya no tiene bloque `:root` propio ni `@media dark` de tokens — los provee `../css/colors.css` importado en `inscripcion/index.html`.
> Solo conserva variables locales: `--green / --dp-*`. Ya no define `--purple` ni `--purple-bg`; `.btn-purple` usa `var(--purple-light)` de `colors.css`.

| Clase / selector | Descripción |
|---|---|
| `#loading-overlay / .loading-inner / .loading-logo / .loading-txt` | Overlay de carga con opacidad (no clase-toggle) |
| `.page-wrap` | Wrapper centrado max-width 480px |
| `.header / .header-logo / .header-title / .header-sub` | Encabezado sticky (position:sticky, top:0, z-index:100), layout flex con gap:12px, padding compacto 12px 16px; `.header-title` tiene `flex:1` y `text-align:center` para funcionar como flex item centrado |
| `.progress-wrap / .prog-dot / .prog-dot.done / .prog-dot.active` | Barra de progreso de pasos |
| `.pantalla / .pantalla.activa` | Control de pantallas (local, no compartido) |
| `.card / .sec-label` | Card y etiqueta de sección |
| `.gsignin-wrap / .gsignin-info` | Wrapper del botón de Google Sign-In |
| `.perm-box / .perm-row / .perm-label / .perm-sub` | Bloque de permisos con toggles |
| `.sub-permisos / .sub-perm-row` | Sub-opciones de privacidad (fecha/edad) |
| `.campo / .select-wrap / .dato-hint` | Campos del formulario |
| `.prefijo-wrap / .prefijo-flag` | Campo de prefijo telefónico con bandera |
| `.fecha-nac-grid` | Grid flex para los selects de fecha de nacimiento |
| `.opciones / .opcion / .opcion.sel / .chk-opcion` | Opciones radio/checkbox (igual que ui.css pero en vars CSS) |
| `.campo-cond / .campo-cond.visible` | Sección condicional con transición |
| `.btn / .btn-primary / .btn-secondary / .btn-green / .btn-purple / .btn-pulse / .btn-spinner` | Botones del formulario |
| `.error-msg / .aviso` | Mensaje de error y aviso informativo |
| `.exito-icon / .exito-title / .exito-sub / .exito-nombre` | Pantalla de éxito tras inscripción |
| `.profile-preview / .profile-avatar / .profile-avatar-placeholder / .profile-info-text` | Preview del perfil Google tras login |
| `.divider` | Separador horizontal |
| `.form-locked / .form-unlocked` | Estado bloqueado/desbloqueado del formulario (antes/después de GIS) |
| `#modal-contacto / #modal-ct-inner / .modal-ct-title / .modal-ct-link / .modal-ct-close` | Modal de contacto |
| `.fnac-trigger-btn / .fnac-placeholder` | Botón disparador de date picker |
| `#date-picker-modal / .dp-card / .dp-header / .dp-nav / .dp-grid / .dp-day / .dp-footer / .dp-btn / .dp-year-grid / .dp-month-grid` | Date picker dp-* completo |

### IDs relevantes de index.html
| ID | Descripción |
|---|---|
| `#home-nav` | Nav fija (`.app-nav.app-nav-fixed`) posicionada fuera de `.contenedor`; contiene avatar (`.app-nav-avatar`), section label y botón CTA; gestionada por `_initHomeNav()` y `_renderHomeReservas()` via `style.display` |
| `#home-avatar-nav` | Avatar circular 38×38 (`.app-nav-avatar`) en el nav fijo; sincronizado con foto/inicial por `prepararHome()` |
| `#home-nav-spacer` | Spacer en `s-home` que ocupa la altura del nav para evitar que el contenido quede tapado; altura ajustada dinámicamente por `_initHomeNav()` |
| `#home-saludo` | Elemento con el nombre del usuario; ahora vive dentro de `#home-nav` (antes en `.home-profile-row` de la card) |
| `#modal-equip-aviso` | Modal de aviso de disponibilidad de equipamiento: se muestra en `cargarFechas()` si hay fechas agotadas por equip; lista en `#modal-equip-lista`; botón "Actualizar mi equipamiento" llama `irEditarEquipDesdeModal()` |
| `#modal-info-reserva` | Modal info primera reserva; items condicionales `#mri-modalidad-clase` / `#mri-modalidad-mes` / `#mri-cupon`; estilos críticos inline en el HTML (mismo patrón que `#modal-contacto`) |
| `#modal-info-home` | Modal info primera visita a home; estilos críticos inline en el HTML |
| `#sheet-gestionar-overlay` | Overlay oscuro detrás del bottom sheet de gestión; `onclick` cierra el sheet |
| `#sheet-gestionar` | Bottom sheet de gestión de reserva (dos estados: opciones y cancelar); se abre animado desde abajo; `#sg-sheet-subtitulo` muestra fecha/hora/lugar |
| `#modal-confirm-reagendar` | Modal bottom-sheet de confirmación de reagendamiento; se abre desde `confirmarCambioFecha()`; muestra fecha, pills hora/lugar y equipo; botón confirmar llama `ejecutarReagendamiento()` |
| `#bs-protec-overlay` | Overlay oscuro del bottom sheet de protecciones personalizadas; `onclick` cancela |
| `#bs-protec` | Bottom sheet para especificar protecciones parciales ("Otro"); contiene `#bs-protec-pills` (4 pills multi-select: Casco/Muñequeras/Coderas/Rodilleras, `.aj-pill`/`.activa`), `#err-bs-protec`, Confirmar y Cancelar |
| `#sheet-talla-overlay` / `#sheet-talla` | Bottom sheet compartido para elegir talla, en dos modos (`_tallaSheetModo`): `'existente'` — cambiar la talla de una reserva ya creada desde "Mis reservas" (`abrirSheetTalla()`, `js/home.js`) — y `'nueva-reserva'` — elegir una talla alternativa solo para una fecha puntual al armar una reserva nueva (`abrirSheetTallaNuevaReserva()`, `js/reservas.js`), sin backend, guardada en memoria hasta confirmar. `#sheet-talla-titulo` y el texto de `#btn-confirmar-talla` cambian según el modo; `#sheet-talla-grid` (grid 3 columnas de `.aj-pill`, disponibles/`.no-disponible`/`.talla-actual`), `#err-sheet-talla`, botón deshabilitado hasta seleccionar una talla válida distinta a la actual |
| `#s3a-pills` | Contenedor de pills binarias (Sí/No patines) en s3a |
| `#tallas-grid` | Grid de `.equip-talla-pill` generado dinámicamente en s3b con tallas de la API |
| `#s3c-pills` | Contenedor de pills de protecciones en s3c |
| `#pill-protec-otro` | Pill "Tengo algunas, me faltan otras" en s3c; abre bs-protec al seleccionarse |
| `#protec-otro-sub` | Sub-label de la pill Otro; se actualiza con el texto confirmado tras cerrar bs-protec |

---

## 3. JS — Funciones por módulo

### js/config.js
| Función / variable | Descripción |
|---|---|
| `BACKEND` | URL del Google Apps Script backend |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth para usuarios |
| `sha256Hex(str)` | Hash SHA-256 en hex usando crypto.subtle (async, devuelve Promise) |

### js/api.js
| Función / variable | Descripción |
|---|---|
| `_token` | Token de sesión activo del usuario (mutable, leído por api()) |
| `api(params, onSuccess, onError)` | GET al backend con _token automático en params |
| `apiPost(params, onSuccess, onError)` | POST form-urlencoded al backend con _token |

### js/ui.js
| Función / variable | Descripción |
|---|---|
| `mostrarCargando(msg)` | Muestra el overlay de carga con mensaje opcional |
| `ocultarCargando()` | Oculta el overlay con fade-out |
| `err(id, msg)` | Muestra error en #id con auto-ocultado animado a los 4.4s |
| `selOp(label, name, val)` | Marca una opción radio/select y actualiza E.conf/editPat/editProtec |
| `abrirContacto()` | Muestra el modal #modal-contacto |
| `cerrarContacto()` | Oculta el modal #modal-contacto |
| `PANTALLAS_RAIZ` | `['s1','s-home','s-admin-home']` — pantallas donde "atrás" debe ser un no-op (ver convención "Pantallas raíz" en Reglas globales) |
| `TOP_BAR_CONFIG` | Objeto de configuración de título y destino "volver" por pantalla |
| `ir(id, desdeHistorial, sinTrampa)` | Navega a una pantalla: activa .pantalla, pushState, actualiza top-bar (`style.display='flex'/'none'` en lugar de clase `.visible`) y paso-dots; cuando id==='s-home' muestra `#modal-info-home` con delay 600ms si el usuario no lo ha visto; cuando id==='s-pago' llama `_resetChkPago()` (`js/reservas.js`) para que el checkbox "ya pagué" nunca quede con estado visual desincronizado, sin importar el camino de entrada. Si `id` está en `PANTALLAS_RAIZ`, empuja además un `pushState` duplicado de sí misma (salvo `sinTrampa=true`) para "atrapar" el gesto de atrás |
| `volver(id)` | Alias de ir(); lo llama top-bar-btn |
| `popstate listener` | Restaura pantalla correcta al usar el botón atrás del navegador (sin cambios de lógica al agregar `PANTALLAS_RAIZ` — el atrapamiento vive dentro de `ir()`) |
| `NOMBRES_MESES` | Array ['Enero'…'Diciembre'] para labels de meses |
| `generarMeses()` | Renderiza en #lista-meses-unificada; detecta meses confirmados desde _todasReservas; inserta .meses-divider antes del mes actual |
| `crearMesItem(nombre, esPasado, confirmado)` | Devuelve HTML de un label mes-item con badge "Pagado" si confirmado |
| `lanzarConfetti()` | Animación canvas de confetti en s6; se llama con setTimeout(400ms) tras confirmarReserva() |
| `_modalInfoKey(id)` | genera la clave de localStorage/sessionStorage por modal e usuario |
| `_yaVioModal(id)` | true si el modal fue marcado como visto (localStorage) o pospuesto (sessionStorage) |
| `modalInfoOk(id)` | marca como visto permanente y cierra; ejecuta callback si id=reserva |
| `modalInfoLater(id)` | marca como pospuesto (sessionStorage) y cierra; ejecuta callback si id=reserva |
| `mostrarModalInfoReserva(callback)` | muestra modal-info-reserva si no fue visto; adapta items condicionales (modalidad y cupón) según E.datos; ejecuta callback directamente si ya fue visto |
| `window._modalInfoReservaCallback` | callback guardado para ejecutar tras cerrar el modal de reserva |

### js/home.js
| Función / variable | Descripción |
|---|---|
| `_todasReservas` | Array con todas las reservas del usuario (cargadas al login) |
| `_proximosData` | Mapa de fecha → `{mapsUrl, descripcion, horaFin, duracion}` de próximos entrenamientos; cargado en `prepararHome()` via `getProximosEntrenamientos`; usada en `_renderCardHome()` |
| `_sgFechaActual` | Fecha de la reserva que se está gestionando en s-gestionar |
| `_sgFilaActual` | Fila (índice) de la reserva que se está gestionando |
| `_sgFechaSeleccionada` | Nueva fecha seleccionada en s-gestionar para reagendar |
| `prepararHome()` | Inicializa la pantalla home: avatar, saludo, banner cupón/notif, render reservas. Refresca `cuponDisponible` y `_proximosData` en cada visita. Sincroniza `#home-avatar-nav` con foto/inicial y llama `_initHomeNav()` |
| `irNuevaReserva(skipEquip)` | Navega al flujo de reserva: resetea estado E y siempre llama `cargarFechas()` directamente |
| `irMisReservas()` | Navega al historial completo (ir s-misreservas) |
| `verTodasReservas()` | Alias de irMisReservas() |
| `iniciarReagendamiento()` | Activa E.reagendando y navega a s4 para reagendar |
| `irHomeDesdeExito()` | Vuelve a home desde s6 y refresca reservas; muestra un loader (`.loader`/`.spinner`) en `#home-reservas-lista` mientras se espera `getReservasPersona`, para no mostrar el empty-state o contenido viejo por error mientras carga |
| `refrescarMisReservas(callback, btn)` | Vuelve a pedir `getReservasPersona`, actualiza `_todasReservas` y re-renderiza vía `prepararHome()` (sin navegar) — usada tanto por el botón desktop `#btn-refrescar-home` como por el gesto de pull-to-refresh; si recibe `btn`, anima su ícono con `spin` mientras carga; `callback` se invoca al terminar (éxito o error) |
| `_ptrEnMisReservas()` / `_ptrStartY` / `_ptrArrastrando` / `_ptrRefrescando` / `_ptrProgreso` / `_PTR_RANGO` / `_PTR_MAX_VISUAL` | Estado y guard del gesto de pull-to-refresh custom, estilo Chrome/Android (ver listeners `touchstart`/`touchmove`/`touchend` en `window`): solo activo si `#s-home` está `.activa` y el scroll está en el tope. `_ptrProgreso` (0–1) es el avance del arrastre relativo a `_PTR_RANGO` (140px de dedo = círculo completo), leído directamente en `touchend` sin parsear CSS (reemplaza a `_ptrDistActual`/parseo por regex, frágil — ver changelog). `_PTR_MAX_VISUAL` limita el desplazamiento visual del indicador, aplicado con una curva de resistencia (`1-(1-progreso)²`) tipo goma elástica. `#ptr-spinner` (el `.spinner` dentro de `#ptr-indicator`) se rota manualmente vía `transform:rotate(progreso*360deg)` durante el arrastre (con `animation:none`) simulando un arco que se llena; al soltar con `_ptrProgreso>=1` se limpia el override y vuelve a girar con su animación `spin` propia (infinita) hasta que `refrescarMisReservas()` resuelve. Backstop de 10s por si el `fetch` de `refrescarMisReservas` nunca resuelve (sin timeout propio en `api()`), para no dejar `_ptrRefrescando` trabado en `true` para siempre (lo que bloquearía todo intento futuro desde `touchstart`) |
| `_ptrOcultarIndicador()` | Anima `#ptr-indicator` de vuelta a oculto (opacity 0, translateY -40px) |
| `renderHomeReservas()` | Renderiza las tarjetas de reserva activas en home (máx 2 si no expandido) |
| `verMasHomeReservas()` | Expande el listado de home para mostrar todas las reservas |
| `_renderCardHome(r, hoy)` | Genera HTML de tarjeta nueva (`.res-card-nueva`) con pills de hora/lugar, badge de estado y botón "Cancelar reserva" que abre s-gestionar. La pill de talla (`fi-pill-patines`) es tappable (con ícono `edit`) solo si `r.estado` es `Pendiente` o `Confirmada`; abre `abrirSheetTalla()` |
| `_toggleCardBody(uid)` | Expande/colapsa el panel "Más información" de una card |
| `abrirSheetTalla(fecha, tallaActual)` | Setea `_tallaSheetModo='existente'`, título "Cambiar talla para el entrenamiento del [fecha]" y botón "Confirmar talla", y delega en `_abrirSheetTallaBase()` |
| `_abrirSheetTallaBase(fecha, tallaActual)` | Lógica compartida de apertura de `#sheet-talla` (mismo patrón de sheet que `#bs-protec`/`#sheet-gestionar`: overlay + `translateY` animado) entre los dos modos — pide `getTallasDisponiblesParaFecha` y renderiza el grid vía `_renderGridSheetTalla()`. Usada tanto por `abrirSheetTalla()` (`js/home.js`, reserva ya creada) como por `abrirSheetTallaNuevaReserva()` (`js/reservas.js`, selección de fechas al crear una reserva) |
| `_renderGridSheetTalla(tallas)` | Genera el grid 3 columnas de `.aj-pill` en `#sheet-talla-grid`: disponibles seleccionables, no disponibles con `.no-disponible` (tachada), la talla actual con `.talla-actual` (borde) hasta que el usuario elija otra |
| `seleccionarTallaSheet(el, talla)` | Marca `.activa` en la pill tocada; habilita el botón de confirmar solo si la talla elegida es distinta a la actual |
| `avisarTallaNoDisponible(talla)` | Muestra en `#err-sheet-talla` el mensaje de talla no disponible al tocar una pill tachada |
| `_habilitarConfirmarTalla(habilitar)` | Habilita/deshabilita `#btn-confirmar-talla` (disabled + opacity 0.4, mismo valor que usa `.btn-primary:disabled` en `ui.css`) |
| `cerrarSheetTalla()` | Cierra `#sheet-talla` con la misma transición `translateY`/`cubic-bezier` que el resto de los `*-sheet-*` |
| `confirmarTallaSheet()` | Si `_tallaSheetModo==='nueva-reserva'` delega en `_confirmarTallaNuevaReserva()` (`js/reservas.js`, sin backend); si no (modo `'existente'`), llama `actualizarTallaReserva(E.nombre, fecha, tallaNueva)` — si falla muestra el error en `#err-sheet-talla` (mensaje ya viene armado por el backend vía `api()`); si tiene éxito cierra el sheet y llama `_recargarYRenderReservas()` + `mostrarToast('Talla actualizada','ok')` |
| `abrirGestionar(fecha, fila)` | Abre s-gestionar con los datos de la reserva seleccionada |
| `setModoGestionar(modo)` | Alterna entre panel "reagendar" y "cancelar" en s-gestionar |
| `cargarFechasGestionar()` | Carga fechas disponibles para reagendar via API y las renderiza |
| `selFechaGestionar(el, fecha)` | Selecciona una fecha disponible en s-gestionar |
| `confirmarCambioFecha()` | Abre modal `#modal-confirm-reagendar` con resumen de la nueva fecha |
| `ejecutarReagendamiento()` | Llama API `reagendarReserva`, actualiza `_todasReservas` y vuelve a home |
| `cerrarModalReagendar()` | Cierra el modal `#modal-confirm-reagendar` |
| `cerrarSheetGestionar()` | Anima el sheet hacia abajo y lo oculta |
| `sheetVolverOpciones()` | Muestra el estado opciones del sheet (oculta el estado cancelar) |
| `sheetIrCancelar()` | Muestra el estado cancelar del sheet (oculta las opciones) |
| `sheetIrReagendar()` | Cierra el sheet y navega a `s-gestionar` (solo reagendar) con delay 360ms |
| `ejecutarCancelacion()` | Cierra sheet, muestra loading, llama API cancelar directamente, filtra reserva y vuelve a home |
| `_parseFechaSimple(str)` | Parsea "DD/MM/YYYY" → Date |
| `_parseFechaStr(fechaStr)` | Parsea fechas con formato "Sábado 12 de Enero (09:00)" → Date |
| `_clasificarReservas(todas, hoy)` | Separa reservas en activas e historial según fecha y estado |
| `_poblarSelectMesHistorial()` | Renderiza en `#historial-pills-mes` las pills de mes que tienen reservas reales en el historial (solo meses con datos); marca `.activa` el mes actual y guarda el mes a mostrar en `window._historialMesActual` |
| `seleccionarPillMes(pill, mes)` | Marca la pill clickeada como `.activa`, actualiza `window._historialMesActual` y llama `renderHistorial()` |
| `_getMesReserva(r)` | Extrae el número de mes (0-11) de una reserva |
| `renderHistorial()` | Renderiza el historial filtrado por mes con grupos colapsables |
| `_renderCardHistorial(r)` | Genera HTML de una tarjeta de reserva para historial |
| `toggleGrupoHistorial(id, header)` | Colapsa/expande un grupo de historial |
| `cancelarRes(fecha, onSuccess)` | Llama API para cancelar una reserva; si `onSuccess` es provisto lo llama al éxito, si no llama `renderHomeReservas()` |
| `_initHomeNav()` | Inicializa la nav fija: calcula `top` según altura del `.header`, ajusta altura del `#home-nav-spacer`, registra listener de scroll en `.contenedor` y `window` para aplicar/quitar clase `.compacto` cuando `scrollY > 40` |

> **Acciones de backend utilizadas:** `getCuponDisponible` (llamada en `prepararHome()` para refrescar el estado del cupón en cada visita a la home); `getProximosEntrenamientos` (llamada en `prepararHome()` para poblar `_proximosData` y mostrar pills de Maps/info en las cards de home); `getTallasDisponiblesParaFecha(fecha, nombreExcluir)` (llamada en `_abrirSheetTallaBase()` y en `_chequearTallaFecha()` de `cargarFechas()`, devuelve `[{talla, disponible}]` excluyendo del conteo la reserva de `nombreExcluir` en esa fecha); `actualizarTallaReserva(nombre, fecha, tallaNueva)` (llamada en `confirmarTallaSheet()` solo en modo `'existente'`; el backend valida sesión, que el estado de la reserva sea Pendiente/Confirmada, y disponibilidad real antes de guardar — el token se inyecta solo vía `api()`, no se pasa manualmente)

### js/reservas.js
| Función / variable | Descripción |
|---|---|
| `E` | Estado global del flujo de reserva: nombre, datos, conf, equipamiento, fechas, tipoPago, meses, precios, totales, reagendando |
| `tieneCuponDisponible()` | Comprueba si el usuario tiene un cupón de clase gratis sin usar |
| `marcarCuponUsadoLocal()` | Marca el cupón como usado en localStorage |
| `contarCreditos()` | Cuenta créditos (clases prepagadas) disponibles desde E.datos |
| `renderEquip()` | Renderiza el resumen de equipamiento en s2 |
| `fila(label, val)` | Helper que genera HTML de una fila de resumen |
| `continuar_s2()` | Valida confirmación de equipamiento y navega a s3a o s4 |
| `selPillBin(el, containerId, hiddenId)` | Selecciona una pill binaria (Sí/No) en flujo equipamiento; actualiza E.editPat y el hidden input |
| `selPillProtec(el)` | Selecciona una pill de protecciones; abre bottom sheet bs-protec si val==='Otro' |
| `selTallaEquip(el, talla)` | Selecciona una talla en el grid de s3b; actualiza E.editTalla y #sel-talla |
| `abrirBsProtec()` | Abre el bottom sheet de protecciones personalizadas con animación |
| `cerrarBsProtec()` | Cierra el bottom sheet con animación translateY(100%) |
| `toggleProtecItem(el)` | Togglea `.activa` en una pill de `#bs-protec-pills` (selección múltiple e independiente, patrón `ajTogglePill`) |
| `cancelarOtroProtec()` | Cancela el bottom sheet; si no hay ninguna pill `.activa` en `#bs-protec-pills`, deselecciona la pill "Otro" |
| `confirmarOtroProtec()` | Valida al menos 1 pill `.activa` en `#bs-protec-pills` y bloquea si están las 4 activas a la vez (ambos casos vía `err('err-bs-protec', ...)`); junta los `data-val` con `', '` y lo guarda como E.editProtec; actualiza el sub-label de la pill |
| `continuar_s3a()` | Valida E.editPat; si Sí carga tallas vía API y renderiza grid en s3b; si No salta a s3c |
| `continuar_s3b()` | Valida #sel-talla; guarda E.editTalla y navega a s3c |
| `continuar_s3c_nuevo()` | Valida E.editProtec; guarda equipamiento vía API y navega según editandoDesdeHome |
| `canPayMonthly()` | True si el usuario no necesita equipo prestado (habilita pago mensual) |
| `necesitaEquipo()` | Inverso de canPayMonthly() |
| `actualizarTextosPago()` | Actualiza textos de s4 y s-pago según tipo de pago y reagendamiento |
| `selTipoPago(tipo)` | Selecciona tipo mensual/clase: actualiza `E.tipoPago`, clases `.active` en tp-opts, llama `_updateTpSlider(true)`, `actualizarTextosPago()` y `actualizarTotalS4()` |
| `_updateTpSlider(animate)` | Posiciona el `.tp-slider` sobre la opción activa usando `offsetWidth`/`offsetLeft`; `animate=false` al inicializar (evita animación en primer render) |
| `toggleCupon(cb)` | Activa/desactiva cupón en E y recalcula total |
| `actualizarTotalS4()` | Recalcula total según fechas/meses/cupón/créditos y actualiza la UI |
| `cargarFechas()` | Llama API `getFechasDisponibles`; parsea `f.fecha` (split por `" - "` para extraer `fechaTexto`, `hora`, `lugar`; también soporta campos separados `f.hora`/`f.lugar`); renderiza nuevas cards `.fi-*` con pills de hora/lugar en header y panel expandible de info (si `hasInfo`); muestra `modal-info-reserva` con delay 400ms si es la primera visita a s4. Resetea `E.tallasPorFecha`/`_conflictosTalla`/`_fechasPosibleProtecRiesgo` en cada carga; por cada fecha disponible donde el usuario necesita patines, dispara en paralelo (sin bloquear el render) `_chequearTallaFecha()` para detectar si su talla habitual no está disponible puntualmente para esa fecha. **Reconducción de fechas agotadas por talla al Flujo B:** el backend (`getFechasDisponibles`, Apps Script) marca `disponible:false` con `razon:'Sin patines talla X disponibles'` apenas se agota esa talla puntual, aunque otras tallas sigan disponibles ese día — sin este fix, esas fechas caían en la rama vieja bloqueante (`inscFechaAgotadaClick`) en vez del Flujo B. `esTallaAgotada(f)` (función local a `cargarFechas()`) detecta este caso comparando `f.razon` por igualdad exacta (no por keywords) contra el string reconstruido con la `talla` del usuario — evita el falso positivo de un regex amplio tipo `/patines\|talla\|protec\|equip/i` (ver línea de `agotadasEquip` más abajo), que también matchearía una fecha agotada por *protecciones* y la reconduciría erróneamente al sheet de talla (que no resuelve protecciones). Las fechas que matchean se renderizan como card normal seleccionable (misma rama que `f.disponible`) y se marcan de inmediato — sin esperar el round-trip async de `_chequearTallaFecha()` — vía `fechasTallaAgotadaSync` (`_conflictosTalla[fecha]=true` + `_mostrarConflictoTalla()`), para que no quede una ventana donde la card se ve seleccionable normalmente antes de mostrar el aviso. También se suman a `disponibles` (evita el falso "No hay cupos disponibles actualmente"). **Riesgo conocido de doble-agotamiento:** el backend chequea talla antes que protecciones con `return` temprano, así que una fecha agotada en ambos ejes a la vez solo devuelve la razón de talla (protecciones queda enmascarada). Por eso, si el usuario también necesita protecciones, se marca `_fechasPosibleProtecRiesgo[fecha]=true` para que `abrirSheetTallaNuevaReserva()` muestre un aviso; no se re-valida en frontend (edge case raro, se confirma recién al guardar) |
| `toggleFecha(el, fecha)` | Recibe la `.fecha-item` (onclick en `.fi-header`); toglea el checkbox oculto, la clase `.sel` y actualiza `E.fechas` |
| `manejarClickFecha(el, fecha, slug)` | Wrapper del click en `.fi-header` (reemplaza la llamada directa a `toggleFecha`): si la fecha tiene un conflicto de talla sin resolver (`_conflictosTalla[fecha]` true y sin excepción en `E.tallasPorFecha`), abre `abrirSheetTallaNuevaReserva()` en vez de seleccionar; si no, comportamiento normal (`toggleFecha`) |
| `_chequearTallaFecha(fecha, slug)` | Pide `getTallasDisponiblesParaFecha(fecha, E.nombre)` y chequea si `E.datos.talla` viene `disponible:false`; si hay conflicto, marca `_conflictosTalla[fecha]` y llama `_mostrarConflictoTalla()`. Si la llamada falla (red), no hace nada — se trata como "sin conflicto detectado", nunca bloquea la card |
| `_mostrarConflictoTalla(slug, talla)` / `_resolverConflictoTalla(slug, talla)` | Actualizan (fade-in, `@keyframes fadeIn`) el texto `#fi-conflicto-<slug>` dentro de la card, entre `.fi-header` y `.fi-footer` — aviso (`var(--warning)`, "Talla X no disponible...") o resuelto (`var(--success-dark)`, "Talla X asignada para este día"). Ya no tocan ningún badge (`#fi-badge-<slug>` fue eliminado, ver `.fi-conflicto-talla` en la sección de CSS) |
| `abrirSheetTallaNuevaReserva(fecha, tallaActual, slug)` | Abre `#sheet-talla` en modo `'nueva-reserva'` (`_tallaSheetModo`, compartido con `abrirSheetTalla()` de `js/home.js` vía `_abrirSheetTallaBase()`): título "Elegir talla para el [fecha]", botón "Usar esta talla para este día". Si `_fechasPosibleProtecRiesgo[fecha]` está marcado (fecha reconducida desde `cargarFechas()` donde el chequeo de protecciones pudo quedar enmascarado por el `return` temprano del backend en talla), muestra `#sheet-talla-aviso-protec` ("Esta fecha también podría tener protecciones agotadas — lo confirmaremos al guardar la reserva.", `var(--warning)`); `_abrirSheetTallaBase()` lo oculta por defecto al abrir cualquier modo del sheet |
| `_confirmarTallaNuevaReserva()` | Handler de `confirmarTallaSheet()` (`js/home.js`) cuando `_tallaSheetModo==='nueva-reserva'`: guarda la excepción en `E.tallasPorFecha[fecha]`, limpia `_conflictosTalla[fecha]`, resuelve visualmente el texto de aviso, cierra el sheet y marca el círculo de esa fecha como seleccionado (`toggleFecha`) — no llama a ningún endpoint, la talla queda solo en memoria hasta `confirmarReserva()` |
| `toggleFechaExpand(footer, event)` | Expande/colapsa el panel de info de una card: hace `stopPropagation` y toglea `.open` en la `.fecha-item` |
| `mostrarModalEquip(fechasAfectadas)` | Muestra `#modal-equip-aviso` con la lista de fechas agotadas por falta de equipamiento (filtradas en `cargarFechas()` por regex sobre `f.razon`) |
| `cerrarModalEquip()` | Cierra `#modal-equip-aviso` |
| `irEditarEquipDesdeModal()` | Cierra el modal de equip y navega a `irEditarDatos()` |
| `continuar_s4()` | Valida selección de fechas/meses; setea el `href` de `#btn-wp-pago` con `E.wpUrl`; si la reserva es 100% gratis (créditos/cupón cubren el total) llama directo `confirmarReserva(document.getElementById('btn-s4-continuar'))` (salta `s-pago` por completo); si no, navega a `s-pago` |
| `toggleBtnPago()` | Habilita/deshabilita btn-pago según checkbox chk-pago |
| `_resetChkPago()` | Resetea el checkbox "ya pagué" completo: estado real (`#chk-pago.checked=false`, `#btn-pago.disabled=true`) **y** su representación visual (`classList.remove('sel-pago')` en `#chk-pago-circle`, `classList.remove('sel')` en `.chk-pago-label`) — llamado desde `continuar_s4()` y desde `ir()` (`js/ui.js`, cuando `id==='s-pago'`) para cubrir también el reingreso a `s-pago` vía gesto de "adelante" del navegador, que no pasa por `continuar_s4()` |
| `continuar_pago()` | Valida el checkbox "ya pagué", guarda la nota de pago y llama directo `confirmarReserva(document.getElementById('btn-pago'))` — sin ningún paso ni sheet intermedio |
| `confirmarReserva(btn)` | Acepta el botón que la disparó como parámetro opcional (lo deshabilita mientras guarda; `continuar_pago()` pasa `#btn-pago`, la rama gratis de `continuar_s4()` pasa `#btn-s4-continuar` — son dos botones físicos distintos, ya no hay un `#btn-confirmar` único). Envía la reserva al backend; en el loop `guardarSiguiente()` (solo pago "por clase", no aplica al loop mensual), usa `E.tallasPorFecha[fecha]` si existe una excepción para esa fecha puntual, si no la talla de perfil. Arma el resumen completo en `#s6-resumen` (`.resumen`/`fila()`, fusionado desde la vieja `s5`) mostrando la talla real usada en cada fecha, y controla la visibilidad de `#s6-aviso-pago`/`#s6-liberar-cupo`/`#s6-email-aviso` según el resultado (pago pendiente, cupón, créditos, reagendado) |

### js/perfil.js
| Función / variable | Descripción |
|---|---|
| `irEditarDatos()` | Carga los datos del usuario en los inputs de s-datos y navega — incluye sec-emerg2 (segundo contacto de emergencia); llama `_poblarResumenEquipPerfil()` tras los cargarSelect |
| `_poblarResumenEquipPerfil()` | Renderiza el resumen de equipamiento (patines, talla, protecciones) en `#equip-resumen-perfil` |
| `irEditarEquipDesdeHome()` | Navega al flujo de edición de equipamiento (s3a) limpiando el estado previo y seteando `E.editandoDesdeHome = true` |
| `cargarSelect(selectId, valor, otroInputId, campoOtroId)` | Rellena un select con valor, mostrando "Otro" si corresponde |
| `guardarSeccion(secId, btn)` | Lee los campos de una sección de datos y los guarda via API — secciones con teléfono: sec-contacto, sec-emerg1, sec-emerg2 |
| `toggleSeccion(id, titulo)` | Colapsa/expande una sección en Editar datos |
| `toggleOtroSelect(campo)` | Muestra/oculta el input libre cuando el select vale "Otro" |
| `toggleOtroCheckbox(grupo)` | Muestra/oculta el input libre cuando el checkbox "Otro" está marcado |
| `limpiarTelefono(input)` | Elimina caracteres no numéricos del input de teléfono |
| `_fotoGoogleUrl` | URL de la foto de Google del usuario (para modal de permisos) |
| `mostrarModalPermisos(nombre, fotoUrl)` | Muestra el modal de primer login para configurar fecha/foto/edad |
| `guardarPermisos()` | Guarda opciones del modal de permisos en el backend |
| `saltarPermisos()` | Cierra el modal sin guardar (se mostrará de nuevo al próximo login) |
| `actualizarFotoPerfil(url)` | Actualiza la foto de perfil en home si el usuario tiene foto guardada |
| `eliminarCuenta()` | Muestra el modal de confirmación de eliminación de cuenta |
| `mecValidar()` | Habilita el botón de confirmar eliminación cuando el nombre coincide |
| `mecCerrar()` | Cierra el modal de eliminación de cuenta |
| `mecConfirmar()` | Ejecuta la eliminación de cuenta via API |
| `_MESES_DDP` | Array de meses para el date picker ddp-* |
| `_ddpSt` | Estado del date picker ddp-*: viewYear/Month, selYear/Month/Day, modos |
| `abrirPickerMisDatos()` | Abre el ddp-modal con el valor actual de fechaNacimiento |
| `_ddpCerrar()` | Cierra el ddp-modal |
| `_ddpRender()` | Re-renderiza el ddp picker (label fecha, grilla activa) |
| `_ddpRenderDias()` | Renderiza la grilla de días del mes en ddp |
| `_ddpRenderAnios()` | Renderiza la grilla de años en ddp |
| `_ddpRenderMeses()` | Renderiza la grilla de meses en ddp |

### js/admin.js
| Función / variable | Descripción |
|---|---|
| `GOOGLE_CLIENT_ID_FRONT` | Client ID de Google OAuth (mismo valor que GOOGLE_CLIENT_ID, para el admin GIS) |
| `_adminToken / _adminEmail` | Token y email de la sesión admin activa |
| `_admTodasReservas / _admFiltro` | Caché de reservas admin y filtro activo (pendientes/todas) |
| `_gisInicializado` | Flag para evitar doble inicialización de Google Sign-In admin |
| `ADMIN_PANTALLAS` | Array con los IDs de todas las pantallas del panel admin |
| `adminApi(params, onSuccess, onError)` | GET al backend con adminToken automático |
| `irAdminLogin()` | Navega a s-admin-login e inicializa GIS admin |
| `iniciarGoogleSignIn()` | Inicializa y renderiza el botón Google Sign-In para admin |
| `onGoogleCredential(resp)` | Callback GIS admin: verifica credencial y entra al panel |
| `adminEntrar()` | Muestra el panel admin (s-admin-home) y carga destinatarios de notif |
| `adminCerrarSesionLocal(silencioso)` | Borra sesión admin de localStorage y redirige a s1 |
| `adminIrReservas()` | Carga y renderiza el listado de reservas admin |
| `adminFiltroReservas(filtro, label)` | Cambia el filtro activo (pendientes/todas) y re-renderiza |
| `adminRenderReservas()` | Renderiza las reservas agrupadas por fecha con el filtro activo |
| `toggleGrupoReserva(id, header)` | Colapsa/expande un grupo de reservas por fecha |
| `adminCambiarEstado(fila, estado, btn)` | Cambia el estado de una reserva via API y actualiza la UI |
| `adminIrNotif()` | Navega a s-admin-notif y carga la lista de destinatarios |
| `adminEnviarNotif()` | Envía una notificación push via API (inmediata o programada) |
| `adminRefreshQueLlevar()` | Recarga el listado de equipamiento a llevar |
| `adminIrQueLlevar()` | Navega a s-admin-quellevar y carga el listado |
| `adminRenderQueLlevar(res)` | Renderiza el equipamiento a llevar agrupado por fecha |
| `adminIrEquip()` | Carga tallas y protecciones disponibles en s-admin-equip |
| `adminFilaTallaHtml(talla, cantidad)` | Genera HTML de una fila de talla editable |
| `adminAgregarTalla()` | Agrega una nueva fila de talla vacía en el formulario |
| `adminGuardarEquip()` | Guarda tallas y cantidad de protecciones via API |
| `adminIrUsuarios()` | Carga y renderiza la lista de usuarios registrados |
| `adminEliminarUsuarioClick(nombre)` | Solicita confirmación y elimina un usuario via API |
| `adminIrAdmins()` | Carga y renderiza la lista de administradores |
| `adminInvitar()` | Invita un nuevo admin por email via API |
| `adminQuitarClick(email)` | Quita un admin existente via API con confirmación |

### js/pwa.js
| Función / variable | Descripción |
|---|---|
| `_deferredPrompt` | Evento beforeinstallprompt guardado para instalar la PWA |
| `esStandalone()` | True si la app corre en modo instalado (display-mode: standalone) |
| `detectarNavegador()` | Devuelve 'ios', 'chromium', 'firefox' u 'otro' según user-agent |
| `mostrarBannerPWA()` | Muestra el banner de instalación si no está instalada ni descartada; solo en mobile (user-agent iPhone/iPad/iPod/Android) — nunca en desktop |
| `navegadorRecomendado()` | Verifica si el navegador soporta instalación; si no, muestra modal |
| `mostrarModalNavegador(tipo)` | Muestra instrucciones para abrir en Safari/Chrome según plataforma |
| `cerrarModalNavegador()` | Cierra el modal de navegador recomendado |
| `pwaInstalar()` | Dispara el prompt de instalación o muestra instrucciones manuales |
| `pwaCerrar()` | Descarta el banner PWA y guarda en localStorage |
| `toggleNotifHome(cb)` | Activa push desde el toggle de home; oculta la fila al activarse |
| `activarPush()` | Solicita permiso de notificaciones y opt-in en OneSignal |
| `vincularPush(nombre)` | Asocia el usuario a OneSignal tras login para notificaciones personalizadas |
| `OneSignal.init` | Inicializa OneSignal con appId y serviceWorkerPath |

### js/auth.js
| Función / variable | Descripción |
|---|---|
| `_gisUsuarioInicializado` | Flag para evitar doble init de Google Sign-In usuario |
| `iniciarGoogleSignInUsuario()` | Inicializa y renderiza el botón GIS del usuario en s1 |
| `onGoogleCredentialUsuario(resp)` | Callback GIS usuario: login, detección admin, o muestra "no registrado"; tras cargar reservas, si `window._pendingNuevx` está presente aplica datos de equipamiento en E.datos y llama `irNuevaReserva(true)` saltando el modal de permisos |
| `togglePinAcordeon()` | Abre/cierra el acordeón PIN en s1 |
| `continuar_pin_desde_s1()` | Resuelve nombre/email y llama continuar_pin() |
| `continuar_s1()` | (legacy) Toma nombre del select y navega a s1b |
| `_validandoPin` | Flag anti-doble-submit durante validación de PIN |
| `continuar_pin()` | Hashea el PIN, lo valida en backend, restaura sesión si es válido |
| `syncPinDots()` | Limpia el input PIN a solo dígitos y auto-envía al llegar a 4 |
| `resetPinPad()` | Limpia el input PIN y resetea el icono de visibilidad |
| `togglePinVisibility()` | Alterna type password/tel en el input PIN |
| `cerrarSesion()` | Logout real: llama a la API, borra sesión de localStorage y redirige a s1 (sin `confirm()` propio — la confirmación la da el bottom sheet `aj-sheet-logout`) |
| `confirmarCerrarSesion()` | Handler de "Sí, cerrar sesión" en `aj-sheet-logout` (`index.html:1319`): inicia el cierre animado con `ajCerrarSheetLogout()` y, tras los mismos 350ms de la transición, ejecuta `cerrarSesion()` |
| `cerrarMsgNoRegistrado()` | Anima y oculta el mensaje "email no registrado" |
| `irAlRegistro()` | Redirige a inscripcion/ con el token de Google como query param |
| `solicitarNombreUsuario()` | Abre mailto para solicitar el nombre de usuario al equipo |
| `solicitarNuevoPIN()` | Abre mailto para solicitar un nuevo PIN al equipo |
| `window.onload` | Punto de entrada; lee URL params al inicio (antes de checks de sesión) y si `?nuevx=1` setea `window._pendingNuevx` y captura `_tokenNuevx`; restaura sesión admin o usuario; si `_restaurando=true`, el callback de `restaurarSesion` también consume `_pendingNuevx`; si `!_restaurando` y hay `_tokenNuevx`, llama `onGoogleCredentialUsuario` directamente sin mostrar s1; llama generarMeses() |
| `window._pendingNuevx` | Objeto temporal `{ patines, protec, talla }` seteado al inicio de `window.onload` (antes de cualquier check de sesión) al detectar `?nuevx=1`; consumido y limpiado tanto por `restaurarSesion` callback como por `onGoogleCredentialUsuario` para navegar a reserva directa post-inscripción |
| `pageshow listener` | Bfcache fix: restaura la pantalla correcta al volver con el botón atrás |

### shared/date-picker.js
| Función / variable | Descripción |
|---|---|
| `MESES` | Array ['Enero'…'Diciembre'] usado en el picker |
| `dpState` | Estado del picker dp-*: viewYear/Month, selYear/Month/Day, modos, onConfirm |
| `parseFecha(str)` | Parsea ISO (YYYY-MM-DD) o DD/MM/YYYY → {year, month, day} |
| `formatFecha(y, m, d)` | Formatea a "DD/MM/YYYY" |
| `abrirDatePicker(valorActual, onConfirm)` | Abre el modal dp-* con valor preseleccionado y callback |
| `cerrarDatePicker()` | Cierra el modal dp-* |
| `renderDatePicker()` | Re-renderiza etiquetas, grilla activa (días/años/meses) según dpState |
| `renderDaysGrid()` | Genera los botones de días del mes en #dp-days |
| `renderYearGrid()` | Genera la grilla de años en #dp-year-grid (año actual → 1920) |
| `renderMonthGrid()` | Genera la grilla de meses en #dp-month-grid |
| `animateDp()` | Aplica micro-animación fade+slide a los elementos del picker |
| `initDatePickerListeners()` | Registra eventos: prev/next, click en mes/año label, cancelar, ok |

### inscripcion/inscripcion.js
| Función / variable | Descripción |
|---|---|
| `G` | Estado del formulario: email, idToken, nombre, foto, guardarFoto, fechaNac, mayorEdad, fechaPublica, edadPublica |
| `_INSC_STEPS` | Array de IDs de los 8 pasos del flujo: `insc-step-1` … `insc-step-6` (incluyendo 5a/5b/5c) |
| `_INSC_TITLES` | Títulos del nav por paso; actualizados en `_inscRenderProg()` |
| `_inscCurIdx` | Índice del paso activo |
| `_inscNecesitaPatines` | Flag: true si el usuario seleccionó "Sí, necesito patines" en 5a |
| `_inscWpUnido` | Flag: true si el usuario tocó el enlace del grupo de WhatsApp en paso 6 |
| `_inscProtecOtro` | Protecciones parciales seleccionadas en el bottom sheet (`#insc-protec-otro-pills`), cadena separada por coma ej. `"Casco, Coderas"` |
| `_AJ_PREFIJOS` | Lista de 12 países con `{pais, bandera, cod, min, max}` |
| `_inscPrefijoSel` | Objeto del país seleccionado activo (por defecto Ecuador) |
| `ocultarCargando()` | Fade-out opacity del overlay de carga y `display:none` tras 400ms |
| `mostrarCargando(msg)` | Muestra el overlay de carga con mensaje; actualiza `#loading-msg` |
| `_inscRenderProg()` | Renderiza los dots de progreso, actualiza el título del nav y muestra/oculta el botón atrás |
| `inscMostrarPaso(idx)` | Activa el paso `idx` (clase `activo`), desactiva el resto, scrollea arriba |
| `inscPasoAnterior()` | Vuelve al paso anterior; si está en 5c sin patines, vuelve a 5a |
| `iniciarGoogleSignIn()` | Inicializa GIS con `GOOGLE_CLIENT_ID` y renderiza el botón en `#gsignin-btn` |
| `onGoogleCredentialInscripcion(response)` | Callback GIS: verifica email vía `verificarGoogle`, si libre avanza a paso 2 |
| `_inscPoblarPaso2(res)` | Rellena avatar, nombre y email del paso 2; muestra fecha importada si viene de Google o el date picker si no |
| `_inscFormatFecha(iso)` | Convierte `YYYY-MM-DD` a `"D de mes de YYYY"` en español |
| `inscToggleFoto(tog)` | Muestra foto de Google en `#insc-avatar` si el toggle está activo |
| `abrirPickerFecha()` | Abre el date picker compartido (`abrirDatePicker`) con callback que actualiza `#fnac-iso` y `G.fechaNac` |
| `inscContinuar2()` | Valida fecha, calcula mayoría de edad, guarda toggles de privacidad y avanza a paso 3 |
| `inscValidarNombre(inp)` | Limpia caracteres inválidos del input de nombre en tiempo real |
| `inscTogglePron(el)` | Toggle de clase `activa` en una pill de pronombre |
| `_inscGetPronombres()` | Recorre pills activas y devuelve una cadena separada por coma |
| `inscContinuar3()` | Valida nombre y pronombres; guarda `G.nombre` y avanza a paso 4 |
| `inscValidarTel(inp)` | Limpia no-dígitos y valida longitud según `_inscPrefijoSel` en tiempo real |
| `inscContinuar4()` | Valida teléfono y avanza a paso 5a |
| `inscAbrirSheetPrefijo()` | Reinicia el filtro y abre el bottom sheet de prefijo |
| `inscCerrarSheetPrefijo()` | Cierra el bottom sheet de prefijo |
| `_inscRenderPrefijos(lista)` | Genera los ítems de la lista de países en `#insc-prefijo-list` |
| `inscFiltrarPrefijos(q)` | Filtra `_AJ_PREFIJOS` por nombre o código y re-renderiza |
| `inscSelPrefijo(pais)` | Selecciona un país, actualiza `_inscPrefijoSel` y `#insc-prefijo-display`, cierra el sheet |
| `inscSelBin(el, containerId)` | Selecciona una pill binaria (Sí/No); añade clase `sel-si`/`sel-no`; actualiza `_inscNecesitaPatines` |
| `inscContinuar5a()` | Si hay selección: si necesita patines va a 5b, si no va a 5c |
| `_inscCargarTallas()` | Carga tallas via `getTallasDisponibles` y renderiza `.equip-talla-pill` en `#insc-tallas-grid` |
| `inscSelTalla(el, talla)` | Selecciona una pill de talla y actualiza `#f-talla` |
| `inscContinuar5b()` | Valida que haya talla seleccionada y avanza a 5c |
| `inscSelProtec(el)` | Selecciona una pill de protecciones; si val=`Otro` abre el bottom sheet de protecciones |
| `inscToggleProtecItem(el)` | Togglea `.activa` en una pill de `#insc-protec-otro-pills` (selección múltiple, patrón `inscTogglePron`) |
| `inscCancelarOtroProtec()` | Cierra el sheet; si no hay ninguna pill `.activa` en `#insc-protec-otro-pills`, deselecciona la pill "Otro" |
| `inscConfirmarOtroProtec()` | Valida al menos 1 pill `.activa` y bloquea si están las 4 activas a la vez (ambos casos vía `errMsg('err-insc-protec-sheet', ...)`); junta los `data-val` con `', '` en `_inscProtecOtro`, actualiza el sub-label de la pill y cierra el sheet |
| `inscContinuar5c()` | Valida que haya protección seleccionada y avanza a paso 6 |
| `inscWpUnido()` | Marca `_inscWpUnido=true` y cambia el botón de WA a estado `btn-wp-activo` |
| `inscTogglePinVis()` | Alterna type `password`/`text` en `#f-pin` y cambia el icono |
| `inscEnviarSinPin()` | Limpia el PIN y llama `inscEnviar()` |
| `inscEnviar()` | Valida que el usuario se haya unido a WA; recopila todos los datos de `G` y los pasos; llama `inscribirPersona` via `apiGet`; al éxito muestra `#section-exito` y redirige a la app con parámetros `nuevx=1` + `token` |
| `_inscAbrirSheet(ovId, shId)` | Muestra el overlay y anima el sheet de `translateY(100%)` a `translateY(0)` via doble `requestAnimationFrame` |
| `_inscCerrarSheet(ovId, shId)` | Regresa el sheet a `translateY(100%)` y oculta overlay y sheet tras 350ms |
| `errMsg(id, msg)` | Muestra error con auto-ocultado a los 6s |
| `abrirContacto() / cerrarContacto()` | Muestra/oculta `#modal-contacto-insc` |
| `iniciarDatePicker()` | Wrapper que llama `initDatePickerListeners()` si la función existe |
| `_inscIniciarGoogleSignIn()` | Inicializa GIS (verifica disponibilidad de `google.accounts`; si no está disponible carga el script dinámicamente); renombrada desde `onload()` — antes dependía implícitamente de `window.onload` por coincidencia de nombre; ahora se llama explícitamente desde el `DOMContentLoaded` |
| `apiGet(params, ok, fail)` | GET al backend usando `BACKEND` de `../js/config.js`; sin token de sesión |
| `DOMContentLoaded listener` | Inicialización via DOMContentLoaded (scripts al final del body — window.onload puede no disparar); renderiza prog, carga tallas, inicializa date picker, renderiza prefijos, muestra paso 0 (en `try`); `ocultarCargando()` siempre se ejecuta en `finally` aunque el init falle |

---

## 4. Variables globales compartidas entre módulos

| Variable | Definida en | Usada en | Descripción |
|---|---|---|---|
| `BACKEND` | config.js | api.js, auth.js, reservas.js, perfil.js, admin.js, home.js | URL del Apps Script backend |
| `GOOGLE_CLIENT_ID` | config.js | auth.js | Client ID OAuth para GIS usuario |
| `sha256Hex` | config.js | auth.js, reservas.js | Hash PIN antes de enviar al backend |
| `_token` | api.js | api.js (auto), auth.js (asigna) | Token de sesión del usuario; inyectado en cada request |
| `E` | reservas.js | ui.js, home.js, reservas.js, perfil.js, auth.js, admin.js | Estado completo del flujo de reserva y datos del usuario logueado |
| `E.nombre` | reservas.js | todos los módulos | Nombre del usuario activo |
| `E.datos` | reservas.js | home.js, perfil.js, auth.js | Objeto con todos los datos del usuario (equipamiento, teléfono, etc.) |
| `E.reagendando` | reservas.js | ui.js, home.js, reservas.js | Flag que cambia textos y navegación al reagendar en lugar de reservar |
| `E.tallasPorFecha` | reservas.js | reservas.js, home.js (resetea) | Excepciones de talla por fecha puntual al armar una reserva nueva (`{fecha: talla}`); se manda en `guardarReserva` en vez de la talla de perfil cuando existe una entrada; se resetea en `cargarFechas()`/`irNuevaReserva()`/`iniciarReagendamiento()` |
| `_conflictosTalla` | reservas.js | reservas.js | Fechas (de la carga actual de `cargarFechas()`) donde la talla habitual del usuario no está disponible y todavía no se resolvió con el sheet |
| `_fechasPosibleProtecRiesgo` | reservas.js | reservas.js | Fechas (de la carga actual de `cargarFechas()`) reconducidas al Flujo B por talla agotada donde el usuario también necesita protecciones — el chequeo de protecciones del backend pudo no haberse evaluado (return temprano en el chequeo de talla), así que `abrirSheetTallaNuevaReserva()` muestra un aviso no bloqueante en vez de re-validar contra el backend |
| `_tallaSheetModo` / `_tallaSheetSlug` | home.js | home.js, reservas.js (asigna) | Modo del sheet compartido `#sheet-talla` (`'existente'` / `'nueva-reserva'`) y, en modo `'nueva-reserva'`, el slug de la card para actualizar su texto/círculo al confirmar |
| `_todasReservas` | home.js | home.js, auth.js (asigna) | Array de reservas cargadas tras login |
| `ADMIN_PANTALLAS` | admin.js | ui.js (popstate), auth.js | Lista de IDs de pantallas admin para control de navegación |
| `_adminToken` | admin.js | admin.js, auth.js (asigna) | Token de sesión admin |
| `_adminEmail` | admin.js | admin.js, auth.js (asigna) | Email del admin logueado |
| `TOP_BAR_CONFIG` | ui.js | ui.js | Configuración de título y destino "volver" de cada pantalla |
| `NOMBRES_MESES` | ui.js | ui.js, home.js | Nombres de meses en español para labels |

---

## 5. Convenciones

### IDs de pantallas (SPA)
| Prefijo / ID | Pantalla |
|---|---|
| `s1` | Login (Google + PIN) |
| `s-home` | Home del usuario |
| `s2` → `s3a` → `s3b` → `s3c` | Flujo equipamiento (confirmar → patines → talla → protecciones) |
| `s-carga-fechas` | Loading mientras carga fechas disponibles |
| `s4` | Selección de fechas/tipo de pago |
| `s-pago` | Pantalla de pago (métodos, referencia, checkbox) |
| `s-carga-conf` | Loading mientras guarda la reserva |
| `s6` | Éxito: reserva registrada — incluye el resumen completo (`#s6-resumen`), fusionado desde la vieja pantalla `s5` (eliminada; "Continuar" en `s-pago`/`s4` llama directo a `confirmarReserva()`, sin ningún paso ni sheet intermedio) |
| `s-gestionar` | Gestionar reserva activa: cambiar fecha o cancelar |
| `s-misreservas` | Historial completo de reservas |
| `s-datos` | Editar mis datos |
| `s-carga` | Loading genérico (bfcache / restauración) |
| `s-admin-login` | Login admin (Google) |
| `s-admin-home` | Panel admin principal |
| `s-admin-reservas` | Gestión de reservas |
| `s-admin-notif` | Enviar notificaciones push |
| `s-admin-quellevar` | Equipamiento a llevar por entrenamiento |
| `s-admin-equip` | Editar tallas y protecciones disponibles |
| `s-admin-usuarios` | Lista y eliminación de usuarios |
| `s-admin-admins` | Gestión de administradores |

### Prefijos de IDs por tipo
| Prefijo | Tipo | Ejemplo |
|---|---|---|
| `err-` | Elemento de error por pantalla | `err-s1`, `err-pin`, `err-pago` |
| `d-` | Input de datos en s-datos | `d-nombre`, `d-email`, `d-telefono` |
| `adm-` | Inputs del panel admin | `adm-notif-titulo`, `adm-equip-protec` |
| `mp-` | Elementos del modal de permisos (primer login) | `mp-fecha`, `mp-tog-foto` |
| `ddp-` | Date picker de Mis Datos (perfil.js / perfil.css) | `ddp-modal`, `ddp-dias` |
| `dp-` | Date picker de Inscripción (shared/date-picker.js) | `dp-days`, `dp-month-label` |
| `s4-` | Elementos de la pantalla s4 | `s4-total-box`, `s4-meses-wrapper` |
| `btn-` | Botones nombrados | `btn-pago`, `btn-confirmar`, `btn-ver-mas-home` |
| `sel-` | Selects nombrados | `sel-talla` |
| `mec-` | Modal de eliminación de cuenta | `mec-input`, `mec-btn-confirmar` |

### Convenciones de nombrado JS
| Patrón | Significado |
|---|---|
| `camelCase` sin prefijo | Función pública global (llamada desde HTML o entre módulos) |
| `_camelCase` | Variable/función privada al módulo (solo uso interno) |
| `admin*` | Funciones del panel admin (todas en admin.js) |
| `ir*()`  | Funciones de navegación hacia una pantalla específica |
| `render*()` | Funciones que generan y pegan HTML en el DOM |
| `_render*()` | Helpers de render privados |
| `continuar_*()` | Avanza un paso del flujo de reserva |
| `toggle*()` | Alterna visibilidad o estado de un elemento |
| `_parseFecha*()`| Helpers privados de parseo de fechas en home.js |
| `E.datos` vs `E.datosCompletos` | Ambos apuntan al mismo objeto; legado de un refactor anterior |

### Carga de scripts (orden obligatorio)
```
config.js → api.js → ui.js → home.js → reservas.js → perfil.js → admin.js → pwa.js → auth.js
```
`auth.js` va último porque su `window.onload` llama funciones de todos los módulos anteriores.

### Inscripcion (orden obligatorio)
```
../js/config.js → ../shared/date-picker.js → inscripcion.js
```
`inscripcion.js` redefine sus propias versiones locales de `apiPost`/`apiGet`, `mostrarCargando`/`ocultarCargando` y `abrirContacto`/`cerrarContacto` — no usa las de la app principal.

---

## 6. Reglas globales del proyecto

### Colores
Todos los colores deben declararse como variables CSS en `css/colors.css`. Ningún archivo CSS, JS o HTML puede hardcodear un valor hex, rgb o rgba para el que exista variable equivalente disponible.  
**Excepción única:** valores pasados directamente a librerías JS que no interpretan CSS (ej: array de colores del confetti en `ui.js` L204).

### Clases CSS
Toda clase nueva debe definirse en el archivo CSS correspondiente a su sección:
- Antes de crear una clase nueva, verificar si ya existe una equivalente en `global.css` o en el CSS de la sección.
- Clases compartidas entre secciones → `global.css`.
- Clases específicas de una sección → CSS de esa sección (`login.css`, `home.css`, `reservas.css`, `perfil.css`, etc.).

### Estilos inline
Evitar estilos inline en HTML y en strings JS. Si un estilo se repite más de una vez, convertirlo en clase CSS.  
> Bug corregido: el patrón `color:color: var(...)` (prefijo duplicado en strings JS) fue detectado y corregido en `home.js` (L172, L173, L175) y `admin.js` (L372, L401).

### theme-color (barra de estado del sistema)
Todo HTML raíz nuevo (`index.html`, `inscripcion/index.html`, y cualquier sección futura con su propio HTML de nivel superior) debe declarar el par:
```html
<meta name="theme-color" content="{--bg dark}" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="{--bg light}" media="(prefers-color-scheme: light)">
```
con los valores exactos de `--bg` y `--bg` dark de `css/colors.css` (hoy `#FDF3EB` light / `#170900` dark), sincronizados **a mano** — `<meta>` no soporta `var()` CSS, así que no hay forma de que hereden el valor automáticamente. Si `--bg`/`--bg` dark cambian en `colors.css`, hay que actualizar el meta tag en cada HTML raíz manualmente (`colors.css` tiene comentarios junto a cada variable recordando esto).

**PWA instalada (barra de gestos de Android):** `manifest.json` (`background_color`/`theme_color`) controla el color de la barra de navegación gestual inferior del sistema cuando la app está instalada como PWA — es un mecanismo distinto al `<meta name="theme-color">` de arriba (que solo cubre la barra de estado superior). A diferencia del HTML, el spec de Web App Manifest **no soporta variantes por `prefers-color-scheme`**: `theme_color`/`background_color` son valores únicos y estáticos, así que se fijan al valor `--bg` **light** (`#FDF3EB`), igual que ya hacía `background_color`. Mismo criterio de sincronización manual con `colors.css` (comentario también agregado ahí). **Advertencia:** el soporte de Chrome/Android para que la barra de gestos respete `theme_color` en PWA instalada es inconsistente entre versiones — no está garantizado al 100% en todos los dispositivos; esto mejora la probabilidad, no la asegura.

### Navegación por gestos (pushState/popstate)
Todo flujo de pasos o pantallas nuevo (formularios multi-paso, wizards, secciones con "pantallas" internas) debe empujar su propio estado al historial del navegador, para que el gesto nativo de "atrás" (swipe back / botón atrás) retroceda un paso/pantalla a la vez en vez de saltar directo a la página anterior real. Patrón de referencia, `ir(id, desdeHistorial)` / `popstate` en `js/ui.js:81-150` (usado por toda la app principal) y replicado en `inscMostrarPaso(idx, desdeHistorial)` / `popstate` en `inscripcion/inscripcion.js`:
- La función que muestra el paso/pantalla acepta un segundo parámetro `desdeHistorial`; si es falsy, hace `history.pushState({...}, '', '#...')`.
- Un `history.replaceState(...)` inicial (fuera de esa función, a nivel de módulo) seedea el primer paso/pantalla como la entrada actual, sin agregar una entrada extra.
- Un listener `popstate` propio del flujo lee `ev.state` y vuelve a llamar a la función de mostrar-paso con `desdeHistorial=true` (para no re-empujar).
- Al estar en el primer paso/pantalla del flujo y volver a hacer "atrás", no hay más estados propios que consumir — el navegador sale de forma nativa a la página anterior real, sin intervención de JS.

**Pantallas raíz — el gesto de "atrás" debe ser un no-op, no un salto ni una salida:** a diferencia de lo anterior (donde "atrás" debe retroceder un paso), hay pantallas que son la raíz de su propio contexto y de las que no debería existir ningún "anterior" navegable dentro de la app — hoy `s1` (login, raíz sin sesión), `s-home` (Mis Reservas, raíz con sesión) y `s-admin-home` (raíz del panel admin), listadas en `PANTALLAS_RAIZ` (`js/ui.js`, junto a `TOP_BAR_CONFIG`). En estas pantallas, el gesto de "atrás" del sistema (swipe/botón) no debe navegar a ninguna otra pantalla **ni** salir de la app — el usuario se queda donde está (el único gesto que sí puede minimizar/cerrar la app es el swipe-up nativo de Android, que es un mecanismo del SO ajeno a esto). Mecanismo ("atrapar" el historial): cada vez que `ir(id, ...)` (`js/ui.js:81-...`) navega a una pantalla incluida en `PANTALLAS_RAIZ`, además del `pushState` normal empuja **un segundo `pushState` duplicado de sí misma** (salvo que se pase `sinTrampa=true` como tercer parámetro) — así, sea que se llegue por navegación hacia adelante (login exitoso) o por `popstate` (`ir(id, true)`), siempre queda un duplicado de la misma pantalla debajo en el historial real. El primer "atrás" hace que el navegador retroceda a ese duplicado (dispara `popstate`, nunca sale de la app sin pasar por JS), el listener de `popstate` (sin cambios de lógica) resuelve el mismo `id` raíz, lo re-renderiza (sin cambio visible) y `ir()` vuelve a empujar un duplicado fresco — el "piso" se auto-sostiene indefinidamente, cualquier cantidad de "atrás" queda atrapada. La siembra inicial de `s1` (`history.replaceState({pantalla:'s1'},...)`, fuera de `ir()`) tiene su propio duplicado sembrado a mano justo debajo, para que el primerísimo "atrás" (antes de cualquier interacción) ya quede atrapado. El tercer parámetro `sinTrampa` existe para el resync de `pageshow`/bfcache (`js/auth.js`, `window.addEventListener('pageshow', ...)`) — al restaurarse desde bfcache el historial real ya está intacto (el "piso" ya lo mantiene `ir()` desde antes de que la app pasara a segundo plano), así que ese resync solo necesita re-renderizar la pantalla activa sin tocar el historial en absoluto (ni el push normal ni el duplicado de trampa), evitando acumular entradas de más en cada ciclo de background/foreground. Efecto secundario esperado y aceptado: en sesiones muy largas se acumulan entradas de historial duplicadas para las pantallas raíz — inofensivo, sin impacto para el usuario, no requiere mitigación.

### Pull-to-refresh nativo
El pull-to-refresh nativo del navegador (reload completo de página al arrastrar hacia abajo estando arriba del todo) está deshabilitado globalmente vía `overscroll-behavior-y: contain` en `html, body` (`css/global.css`). Como `inscripcion/index.html` (y cualquier HTML raíz futuro que siga la convención de importar `colors.css` + `global.css`) hereda esta regla automáticamente, no hace falta repetirla por sección. Cualquier gesto de refresh custom (ej. el de "Mis reservas", ver `js/home.js`) se implementa scopeado a su sección específica — nunca reactivando el reload nativo del navegador.
