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
│   ├── ui.css                  Componentes reutilizables: card, inputs, btn, opciones, resumen, top-bar
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

### css/ui.css
| Clase / selector | Descripción |
|---|---|
| `.contenedor` | Wrapper centrado max-width 480px con padding |
| `.card` | Tarjeta blanca con border-radius; transparente en móvil |
| `.seccion-label` | Etiqueta naranja uppercase pequeña |
| `input, select, textarea` | Estilo base de campos de formulario |
| `.select-wrapper::after` | Flecha expand_more naranja en selects |
| `.btn / .btn-primary / .btn-secondary` | Botones base, primario naranja, secundario outline |
| `.opciones / .opcion / .opcion.sel` | Grupo de radios/checkboxes con borde; .sel = seleccionado |
| `.chk-opcion` | Checkbox con estilo de opción |
| `.resumen / .r-fila / .r-label / .r-valor` | Bloque de resumen de reserva |
| `.badge / .badge-*` | Chips de estado (confirmada, pendiente, etc.) |
| `.datos-campo` | Wrapper de campo en Editar datos |
| `.campo-condicional` | Sección que se expande con .visible |
| `.aviso-legal` | Bloque de aviso con fondo gris |
| `.privacy-row` | Fila de toggle de privacidad |
| `.btn-guardar-sec` | Botón guardar sección en datos |
| `.datos-hint` | Texto de ayuda gris bajo un campo |
| `.top-bar / .top-bar-back / .top-bar-titulo` | Barra de navegación superior con botón atrás |
| `.paso-indicator / .paso-dot` | Indicador de pasos (4 dots) del flujo de reserva |
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
| `.home-top-mobile` | Fila superior en móvil (emoji + logout) |
| `.home-emoji-mobile / .home-emoji-desktop` | Emoji 🛼 solo en móvil o solo en desktop |
| `.hmr / .hmr-texto / .hmr-titulo / .hmr-sub / .hmr-btn-round` | Filas de acciones móviles (notif, instalar, contacto) |
| `.btn-logout-mobile` | Botón de logout circular en móvil |

### css/reservas.css
| Clase / selector | Descripción |
|---|---|
| `.fecha-item` | Ítem de fecha seleccionable en s4 |
| `.pago-metodo / .pago-header / .pago-fila / .pago-label / .pago-valor / .pago-icon` | Bloque de método de pago (s-pago) |
| `.total-box / .total-detalle` | Caja de total con monto y detalle |
| `.tipo-pago-wrapper / .tipo-pago-titulo` | Selector clase vs mensual en s4 |
| `.nota-pago-wrapper / .nota-pago-label / .nota-pago-input / .nota-pago-hint` | Campo referencia de pago |
| `.chk-pago-label` | Checkbox "Ya realicé el pago" |
| `.reserva-card` | Tarjeta de reserva en historial |
| `.btn-cancelar` | Botón cancelar reserva |
| `.aviso-pendiente` | Aviso amarillo de pago pendiente |
| `.meses-grid / .mes-item` | Grid de checkboxes de meses (pago mensual) |
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

### css/admin.css
| Clase / selector | Descripción |
|---|---|
| `@media dark #modal-nav-inner` | Dark mode para el modal de navegador recomendado |

### css/colors.css (nuevo — fuente única de verdad)
| Variable | Descripción |
|---|---|
| `--brand / --brand-dk / --brand-light / --brand-lighter / --brand-glow` | Naranja principal y variantes |
| `--bg / --bg-2` | Colores de fondo de página |
| `--surface / --surface-2 / --surface-3 / --surface-blur` | Capas de superficie translúcidas (glassmorphism) |
| `--border / --border-2` | Bordes suaves naranjas translúcidos |
| `--text / --text-2 / --muted / --hint` | Escala de texto (oscuro → tenue) |
| `--success / --success-bg / --success-bdr` | Estado verde |
| `--warning / --warning-bg / --warning-bdr` | Estado amarillo |
| `--danger / --danger-bg / --danger-bdr` | Estado rojo |
| `--info / --info-bg / --info-bdr` | Estado azul |
| `--btn-primary-bg/color/hover / --btn-secondary-bg/color` | Tokens de botones |
| `--card-bg / --card-border / --card-shadow / --card-blur` | Tokens de cards |
| `--radius-sm / --radius / --radius-lg / --radius-full` | Radios de borde |
| `--shadow-sm / --shadow / --shadow-lg` | Sombras |
> Dark mode automático via `@media (prefers-color-scheme: dark)` en colors.css.
> global.css, ui.css, home.css, reservas.css, perfil.css e inscripcion/inscripcion.css consumen estas variables y ya no definen paletas propias.

### inscripcion/inscripcion.css
> ⚠️ Ya no tiene bloque `:root` propio ni `@media dark` de tokens — los provee `../css/colors.css` importado en `inscripcion/index.html`.
> Solo conserva variables locales: `--green / --purple / --dp-*`.

| Clase / selector | Descripción |
|---|---|
| `#loading-overlay / .loading-inner / .loading-logo / .loading-txt` | Overlay de carga con opacidad (no clase-toggle) |
| `.page-wrap` | Wrapper centrado max-width 480px |
| `.header / .header-logo / .header-title / .header-sub` | Encabezado con logo |
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
| `TOP_BAR_CONFIG` | Objeto de configuración de título y destino "volver" por pantalla |
| `ir(id, desdeHistorial)` | Navega a una pantalla: activa .pantalla, pushState, actualiza top-bar y paso-dots |
| `volver(id)` | Alias de ir(); lo llama top-bar-btn |
| `popstate listener` | Restaura pantalla correcta al usar el botón atrás del navegador |
| `NOMBRES_MESES` | Array ['Enero'…'Diciembre'] para labels de meses |
| `generarMeses()` | Genera los checkboxes de meses en s4 separados en pasados/futuros |
| `crearMesItem(nombre)` | Devuelve HTML de un checkbox mes-item |
| `toggleMesesPasados()` | Expande/colapsa la lista de meses pasados en s4 |
| `toggleMesesActuales()` | Expande/colapsa la lista de meses actuales/futuros en s4 |
| `lanzarConfetti()` | Animación canvas de confetti en s6; se llama con setTimeout(400ms) tras confirmarReserva() |

### js/home.js
| Función / variable | Descripción |
|---|---|
| `_todasReservas` | Array con todas las reservas del usuario (cargadas al login) |
| `prepararHome()` | Inicializa la pantalla home: saludo, foto, banner cupón/notif, render reservas |
| `irNuevaReserva()` | Navega al flujo de reserva desde home (ir s2) |
| `irMisReservas()` | Navega al historial completo (ir s-misreservas) |
| `verTodasReservas()` | Alias de irMisReservas() |
| `iniciarReagendamiento()` | Activa E.reagendando y navega a s4 para reagendar |
| `irHomeDesdeExito()` | Vuelve a home desde s6 y refresca reservas |
| `renderHomeReservas()` | Renderiza las tarjetas de reserva activas en home (máx 3 si no expandido) |
| `verMasHomeReservas()` | Expande el listado de home para mostrar todas las reservas |
| `_renderCardHome(r, hoy)` | Genera HTML de una tarjeta de reserva para home con clase de estado |
| `_parseFechaSimple(str)` | Parsea "DD/MM/YYYY" → Date |
| `_parseFechaStr(fechaStr)` | Parsea fechas con formato "Sábado 12 de Enero (09:00)" → Date |
| `_clasificarReservas(todas, hoy)` | Separa reservas en activas e historial según fecha y estado |
| `_poblarSelectMesHistorial()` | Llena el select de filtro de mes en historial |
| `_getMesReserva(r)` | Extrae el número de mes (0-11) de una reserva |
| `renderHistorial()` | Renderiza el historial filtrado por mes con grupos colapsables |
| `_renderCardHistorial(r)` | Genera HTML de una tarjeta de reserva para historial |
| `toggleGrupoHistorial(id, header)` | Colapsa/expande un grupo de historial |
| `cancelarRes(fecha)` | Solicita confirmación y llama API para cancelar una reserva |

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
| `continuar_s3a()` | Guarda selección de patines en E y navega a s3b o s3c |
| `continuar_s3b()` | Guarda talla de patines en E y navega a s3c |
| `continuar_s3c()` | Guarda protecciones en E y navega a cargarFechas |
| `canPayMonthly()` | True si el usuario no necesita equipo prestado (habilita pago mensual) |
| `necesitaEquipo()` | Inverso de canPayMonthly() |
| `actualizarTextosPago()` | Actualiza textos de s4 y s-pago según tipo de pago y reagendamiento |
| `selTipoPago(tipo, label)` | Selecciona tipo mensual/clase y actualiza UI de s4 |
| `toggleCupon(cb)` | Activa/desactiva cupón en E y recalcula total |
| `actualizarTotalS4()` | Recalcula total según fechas/meses/cupón/créditos y actualiza la UI |
| `cargarFechas()` | Llama API getFechasDisponibles y renderiza los ítems en s4 |
| `toggleFecha(el, fecha)` | Agrega/quita una fecha de E.fechas y actualiza total |
| `continuar_s4()` | Valida selección de fechas/meses y navega a s-pago o s5 |
| `toggleBtnPago()` | Habilita/deshabilita btn-pago según checkbox chk-pago |
| `construirResumenS5(backTarget)` | Renderiza el resumen completo en s5 |
| `continuar_pago()` | Guarda la nota de pago y navega a s5 |
| `continuar_pago_y_wp()` | Valida nota, genera URL de WhatsApp y navega a s5 |
| `confirmarReserva()` | Envía la reserva al backend y navega a s6 |

### js/perfil.js
| Función / variable | Descripción |
|---|---|
| `irEditarDatos()` | Carga los datos del usuario en los inputs de s-datos y navega — incluye sec-emerg2 (segundo contacto de emergencia) |
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
| `mostrarBannerPWA()` | Muestra el banner de instalación si no está instalada ni descartada |
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
| `onGoogleCredentialUsuario(resp)` | Callback GIS usuario: login, detección admin, o muestra "no registrado" |
| `togglePinAcordeon()` | Abre/cierra el acordeón PIN en s1 |
| `continuar_pin_desde_s1()` | Resuelve nombre/email y llama continuar_pin() |
| `continuar_s1()` | (legacy) Toma nombre del select y navega a s1b |
| `_validandoPin` | Flag anti-doble-submit durante validación de PIN |
| `continuar_pin()` | Hashea el PIN, lo valida en backend, restaura sesión si es válido |
| `syncPinDots()` | Limpia el input PIN a solo dígitos y auto-envía al llegar a 4 |
| `resetPinPad()` | Limpia el input PIN y resetea el icono de visibilidad |
| `togglePinVisibility()` | Alterna type password/tel en el input PIN |
| `cerrarSesion()` | Borra sesión de localStorage y redirige a s1 |
| `cerrarMsgNoRegistrado()` | Anima y oculta el mensaje "email no registrado" |
| `irAlRegistro()` | Redirige a inscripcion/ con el token de Google como query param |
| `solicitarNombreUsuario()` | Abre mailto para solicitar el nombre de usuario al equipo |
| `solicitarNuevoPIN()` | Abre mailto para solicitar un nuevo PIN al equipo |
| `window.onload` | Punto de entrada: restaura sesión admin o usuario, o muestra s1; llama generarMeses(); lee params `?nuevx=1&nombre=&patines=&protec=&talla=` post-inscripción para pre-cargar fechas |
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
| `BACKEND / GOOGLE_CLIENT_ID / sha256Hex` | Copia local de config (inscripcion no carga js/config.js en producción, lo define aquí) |
| `G` | Estado del formulario: idToken, email, nombre, foto, fechaNac, permisos, mayorEdad |
| `PAISES / _paisSel` | Lista de países con código/bandera/longitud de teléfono y país seleccionado activo |
| `poblarPaises()` | Llena el datalist de países y establece Ecuador por defecto |
| `onPrefijoInput(inp)` | Detecta el país al escribir en el campo de prefijo y actualiza la bandera |
| `soloNumeros(inp)` | Elimina todo lo que no sea dígito en el input |
| `apiPost(params, ok, fail)` | POST local (sin token) al backend para inscripcion |
| `apiGet(params, ok, fail)` | GET local (sin token) al backend para inscripcion |
| `desbloquearForm()` | Anima y desbloquea el formulario tras Google Sign-In exitoso |
| `initGIS()` | Inicializa y renderiza el botón Google Sign-In de inscripcion |
| `onGoogleCred(resp)` | Callback GIS inscripcion: verifica email disponible y desbloquea el form |
| `actualizarPreviewPerfil()` | Muestra nombre, inicial y foto del usuario en el preview |
| `onTogFoto(cb) / onTogFecha(cb)` | Sincroniza G.guardarFoto / G.guardarFecha con el toggle |
| `MESES_ES` | Array de meses cortos en español (Ene…Dic) para los selects |
| `poblarSelectFechaNac()` | Llena los selects de día, mes y año de fecha de nacimiento |
| `obtenerFechaNacISO()` | Lee el hidden input fnac-iso y devuelve el valor ISO |
| `establecerFechaNacEnSelects(iso)` | Rellena el display de fecha a partir de un string ISO |
| `onFechaNacSelectChange()` | Sincroniza G.fechaNac y calcula mayoría de edad al cambiar los selects |
| `calcularMayorEdad(fechaStr)` | Calcula si la persona tiene ≥18 años y actualiza G.mayorEdad |
| `validarNombreLive(inp)` | Limpia caracteres inválidos y muestra/oculta hint de nombre válido |
| `toggleOtroPron(cb)` | Muestra/oculta el input libre de pronombres |
| `selPat(label, val)` | Selecciona opción de patines y muestra/oculta selector de talla |
| `selProtec(label, val)` | Selecciona opción de protecciones y muestra/oculta input libre |
| `cargarTallas()` | Carga tallas disponibles desde el backend y las pone en el select |
| `enviarForm()` | Valida todos los campos y envía la inscripción al backend; redirige a la app |
| `errMsg(id, msg)` | Muestra un error en el elemento id con auto-ocultado a los 6s |
| `mostrarCargando(msg) / ocultarCargando()` | Overlay de carga con fade de opacidad (diferente al de la app principal) |
| `abrirContacto() / cerrarContacto()` | Muestra/oculta el modal de contacto de inscripcion |
| `abrirPickerFecha()` | Llama a abrirDatePicker() (shared) con callback que actualiza fnac-iso y G.fechaNac |
| `togglePinVisibilityForm()` | Alterna visibilidad del PIN en el formulario de inscripcion |
| `window.onload` | Pobla países y tallas, inicializa date picker listeners, lanza GIS o procesa token de URL; muestra `#btn-back-inscripcion` si el referrer es el dominio principal o hay token |
| `#btn-back-inscripcion` | Flecha atrás en el header (inicialmente `display:none`); visible si vino de reservas.quindesvolcanicos.com o con ?token= |
| `#btn-wp-grupo-exito` | Botón "Únete al grupo de WhatsApp" en section-exito; aparece a los 1.6s tras registro exitoso |

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
| `s5` | Resumen y confirmación |
| `s-carga-conf` | Loading mientras guarda la reserva |
| `s6` | Éxito: reserva registrada |
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
| `sel-` | Selects nombrados | `sel-talla`, `sel-mes-historial` |
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
