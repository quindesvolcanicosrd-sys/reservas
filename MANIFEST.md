# MANIFEST — Mirlxs Reservas

Referencia del estado actual de la arquitectura. El historial de cambios vive en `CHANGELOG.md` — este archivo describe solo cómo es el proyecto hoy.

## Descripción general

App de gestión de un equipo de patinaje/derby (Mirlxs): reservas de clases/mensualidades, calendario de eventos con asistencia (RSVP + rollcall real), sección Equipo (roster con favoritos/grupos por rol, perfil de detalle con stats y termómetro Quindes/Mirlxs), perfil/equipamiento de cada miembro, tareas del club y panel admin ("Mi Liga"). SPA en `index.html` sobre Supabase (Postgres + Edge Function), con 2 mini-SPA hermanas standalone (`inscripcion/`, `registro-express/`) para altas nuevas. Backend legado en Google Apps Script (Code.gs, fuera de este repo) en migración progresiva a una Edge Function de Supabase — lo no migrado todavía cae por proxy a GAS.

## 1. Estructura de archivos

```
reservas/
├── index.html                  Shell de la SPA principal (home/reservas/eventos/tareas/perfil/Mi Liga), solo <link>/<script src>
├── OneSignalSDKWorker.js       Service worker de push notifications (OneSignal)
├── manifest.json               Web App Manifest (PWA)
├── CNAME                       Dominio custom de GitHub Pages
├── assets/                     Logos de terceros con derechos (DeUna, Banco Internacional) para botones de pago en s-pago
│
├── css/
│   ├── colors.css              Fuente única de verdad de colores (ver "CSS" abajo)
│   ├── global.css              Reset, toggles, modales info, bottom sheets (chrome compartido), avatar-pill
│   ├── estilos.css             Toasts, loaders/spinners, pull-to-refresh, keyframes globales, .cta-footer-fixed
│   ├── ui.css                  Componentes reutilizables: card, inputs, btn, opciones, badges
│   ├── nav.css                 Nav superior unificada (.app-nav y variantes fixed/sticky)
│   ├── login.css                Pantalla s1 (Google Sign-In + PIN)
│   ├── home.css                 Home y card de reserva (estados, badges)
│   ├── reservas.css             Flujo de reserva s2–s6
│   ├── perfil.css               Ajustes del perfil (aj-sub-*, date picker ddp-*)
│   ├── equipo.css               Sección Equipo: lista/acordeones por rol + INACTIVOS, perfil de detalle, termómetro
│   ├── admin.css                Overrides admin (dark mode del panel)
│   ├── eventos.css              Sección Eventos: timeline, panel de mes, cards, detalle
│   └── tareas.css               Sección Tareas — deliberadamente chico, reusa clases de eventos.css/reservas.css/perfil.css/admin.css/ui.css
│
├── js/
│   ├── config.js                BACKEND, GOOGLE_CLIENT_ID, SUPABASE_URL/ANON_KEY, sha256Hex
│   ├── api.js                   Capa HTTP: api() GET con token, apiPost() POST form-urlencoded
│   ├── ui.js                    ir()/volver(), nav inferior, overlay stack, toasts, meses
│   ├── eventos.js               Sección Eventos (timeline, RSVP, rollcall admin, asistencia anticipada, venues)
│   ├── tareas.js                Sección Tareas (mis tareas / disponibles / archivadas / gestión admin)
│   ├── home.js                  Home, historial, cancelar/reagendar
│   ├── reservas.js              Flujo de reserva (s2→s6)
│   ├── perfil.js                Editar datos, permisos Google, wizard de Salud, eliminar cuenta
│   ├── equipo.js                 Roster de Equipo (favoritos, grupos por rol + INACTIVOS colapsado), perfil de detalle
│   ├── admin.js                 Mi Liga: reservas, notificaciones, equipamiento, usuarios, admins, tiers/categorías
│   ├── pwa.js                   Install prompt, push (OneSignal)
│   ├── auth.js                  Google Sign-In, PIN, restaurar sesión, window.onload
│   ├── foto.js                  Cambio de foto de perfil (Cropper.js + subida) — compartido
│   └── color-enfasis.js         Deriva en runtime las variables de marca de colors.css desde un hex — compartido
│
├── shared/
│   ├── bsheet.js                 Listener delegado que cierra bottom sheets al tocar la manija
│   ├── axis-transicion.js        Transición "shared axis X" (axisTransicion())
│   └── date-picker.js             Date picker dp-* (usado en inscripcion/)
│
├── inscripcion/                  Mini-SPA de inscripción completa (Google Sign-In + todos los datos)
│   ├── index.html / inscripcion.css / inscripcion.js
│
├── registro-express/              Mini-SPA de alta rápida (nombre+PIN, sin Google), con reserva pre-seleccionada
│   ├── index.html / registro-express.js
│
└── supabase/
    ├── functions/api/index.ts     Edge Function (ver sección "Edge Function")
    └── migrations/                 SQL versionado (pg_cron, tablas nuevas, columnas nuevas)
```

`js/config.js`, `shared/bsheet.js`, `shared/axis-transicion.js` y `js/foto.js`/`js/color-enfasis.js` se cargan tanto en `index.html` como en `inscripcion/index.html`. `registro-express/` reusa `../inscripcion/inscripcion.css` y `../css/perfil.css` directo, sin copiar clases.

## 2. CSS — principios

- **Colores:** `css/colors.css` es la única fuente de verdad. Ningún CSS/JS/HTML puede hardcodear un hex/rgb para el que ya exista variable. Excepción: valores pasados a librerías que no interpretan CSS (ej. array de confetti en `ui.js`). Grupos principales: brand, fondo/superficie, bordes, texto, estados (success/danger/warning/info), amber, purple, y 2 excepciones de marca de terceros (`--deuna`, `--banco-internacional`) sin variante dark. Dark mode automático vía `@media (prefers-color-scheme: dark)` al final del archivo.
- **Clases nuevas:** verificar primero si ya existe una equivalente en `global.css` o el CSS de la sección antes de crear una. Compartidas entre secciones → `global.css`; específicas de una sección → su propio CSS.
- **Estilos inline:** evitar en HTML y strings JS; si se repite, convertir en clase.
- **Bottom sheets:** un solo chrome visual compartido (`.bsheet-overlay/.bsheet/.bsheet-handle/.bsheet-title/.bsheet-body`, `css/global.css`) — nunca repetir el bloque a mano; solo `z-index`/`max-height` van inline por instancia.
- **Animación de entrada y salida obligatoria** en todo elemento transitorio (modal, sheet, overlay, toast, error inline) — nunca un `display` seco sin transición en ningún extremo. Patrón: doble `requestAnimationFrame` para la entrada (opacity 0→1 o transform), `setTimeout` con la misma duración del CSS antes de ocultar en la salida.
- **Acordeones animados con `max-height`:** medir `scrollHeight` con la pantalla todavía `display:none` da `0` (colapsa el acordeón sin que nada esté roto en el JS) — en el render inicial de un acordeón ya abierto, fijar `max-height:'none'` directo, nunca `scrollHeight + 'px'`. Al abrir/cerrar por click sí hace falta animar entre 2 valores numéricos (`none` no es interpolable): abrir fija `scrollHeight`px y recién post-transición lo suelta a `none`; cerrar "aterriza" primero en `scrollHeight`px y en el frame siguiente baja a `0px` (doble `requestAnimationFrame`). Mismo patrón reusado por `.eq-grupo` (Equipo, incluido el acordeón "INACTIVOS", colapsado por defecto) y Mi Liga.
- **z-index, jerarquía aproximada:** nav superior/inferior `900`; footers fijos de pantalla (`.cta-footer-fixed`) `100` por default, con overrides puntuales a `960` cuando conviven con un panel `.aj-sub` (`950`); modales informativos (`.modal-info`) `8000`; `#loading-overlay` `9999`. Bottom sheets apilables via `_overlayStack`, `z-index` inline por instancia.

## 3. Tablas de Supabase (columnas clave)

Fuente de verdad real: `supabase/functions/api/index.ts` (la Edge Function usa la service role key, bypasea RLS).

- **`equipo`** — fila por persona, keyed por `username`. Columnas usadas activamente: `necesita_patines`, `talla`, `necesita_protecciones`, `categoria` (tier Quindes/Mirlxs), `tier_modo` (`'auto'` o fijado a mano por admin), `exenta_cuota`, `estado_miembro` (`Activx`/`Ausente`/`Satélite`/`Técnico`/`Lesionadx`, default `Activx`), `solicitud_lesion_pendiente`, `nombre_derby`, `numero_derby`, `pronombres`, `fecha_ingreso`, `email`, `prefijo`, `telefono`, `fecha_publica`, `edad_publica`, `fecha_nacimiento`, datos legales (`tipo_documento`/`pais_expedicion`/`numero_documento`/`nombre_legal`), dirección (`calle_principal`/`calle_secundaria`/`numeracion`/`sector`/`canton`), 2 contactos de emergencia (`emerg1_*`/`emerg2_*`), datos médicos (`enfermedad`/`alergias`/`dieta`/`antecedentes`/`medicamentos`/`atencion_medica`/`seguro*`), `cupon_disponible`, `foto_perfil`, `permisos_configurados`, stats anuales `horas_ano`/`asistencias_ano`/`total_eventos_ano` (pobladas por `recalcularStatsEquipo`/`recalcularStatsUsuario`, y corregibles a mano por username o para todo el equipo vía la acción `adminRecalcularStats`) y `termometro_pct` (poblada por `recalcular-categorias`). **RLS habilitado** (migración `20260830_equipo_rls.sql`) — única policy: `equipo_read_authenticated` (`SELECT` a rol `authenticated`, que esta app nunca usa vía anon key, en la práctica bloquea toda lectura directa por PostgREST). Sin policy de `INSERT`/`UPDATE` — toda escritura real pasa por el Edge Function (`service_role`, bypasea RLS). Ningún código del frontend debe intentar leer/escribir `equipo` con `fetch()` directo a PostgREST (patrón ya usado para `temporadas_descanso`/`asistencias`/etc.) — para esta tabla específica, siempre vía una acción del Edge Function.
- **`asistencias`** — una fila por evento/clase. `id_evento` (PK lógica), `fecha`, `donde` (lugar), `inicia`/`termina` (hora), `dura`, `estado`, `google_maps`, `info_adicional`, `tipo_evento`, `bloqueado`, `id_regla` (venue/regla de recurrencia que lo generó), `es_excepcion`. Columnas legado `a_horario`/`tarde` (texto CSV de nombres) — se siguen actualizando en paralelo a `log_asistencias` como fallback para eventos sin marca real de admin. `estado` real toma 5 valores: `'Próximo'` (recién insertado por `regenerar_ventana_asistencias()`), `'Evento Programado'`, `'Evento Cancelado'`, `'No se entrena'`, `'Evento Finalizado'`. La transición a `'Evento Finalizado'` vivía en una automatización de Apps Script/Sheets discontinuada al migrar la generación de eventos a pg_cron (quedó huérfana un tiempo — ver CHANGELOG, Bug 13) — repuesta por el cron `marcar-eventos-finalizados` (pg_cron, cada 30 min, migración `20260831_cron_eventos_finalizados.sql`): `UPDATE asistencias SET estado='Evento Finalizado' WHERE estado='Evento Programado' AND (fecha + termina)::timestamp < NOW() AT TIME ZONE 'America/Guayaquil'` (DB en UTC; `fecha`/`inicia`/`termina` se guardan en hora local de Ecuador sin componente de zona, sin DST). Aun así, **ningún código nuevo debe depender de `estado === 'Evento Finalizado'`** para filtrar "eventos ya sucedidos" — seguir usando `fecha < hoy` + excluir `'Evento Cancelado'`/`'No se entrena'` por nombre (ver `recalcularStatsEquipo`/`recalcularStatsUsuario`/`recalcular-categorias`): el cron corre cada 30 min, no al instante, así que el status puede quedar desactualizado por una ventana corta.
- **`log_asistencias`** — mezcla 2 conceptos por fila: RSVP pre-evento (`origen:'Usuario'`/`'AsistenciaAnticipada'`, `estado:'Asistiré'`/`'No asistiré'`/`'No jugador'`) y asistencia real post-evento tomada por un admin (`origen:'Admin'`, `estado:'A tiempo'`/`'Tarde'`/`'Ninguno'`). Columnas: `id_evento`, `nombre_usuario`, `origen`, `estado`, `marca_temporal`, `fecha_entrenamiento`. Al leer, filtrar por `origen==='Admin'` antes de asumir "ya hay asistencia real".
- **`rectificaciones_asistencia`** — solicitud de corrección de un usuario sobre su propia marca. `id` (uuid), `nombre`, `id_evento`, `fecha_evento`, `estado_solicitado` (`'A tiempo'`/`'Tarde'`/`'Sin registrar'`), `decision` (default `'Pendiente'`, luego `'Aprobada'`/`'Rechazada'`), `created_at`. Aprobar aplica el mismo mecanismo que `adminMarcarAsistencia`.
- **`reservas`** — `nombre_usuario`, `id_evento` (null si es mensual), `tipo` (`'clase'`/`'mensual'`), `mes_texto`, `talla`, `protecciones`, `estado` (`'Pendiente'`/`'Confirmada'`/`'Cancelada'`/`'Reagendar'`/`'Crédito usado'`), `monto`, `fecha_pago`, `email`.
- **`venues`** — `id`, `lugar`, `tipo_icono`, `requiere_reserva`, `inicia` (hora — **no** `hora`), `google_maps`, `tipo` (recurrencia — no `tipo_recurrencia`), `dias` (no `dias_semana`), `frecuencia`, `unidad`, `fecha_referencia`, `video_instructivo`. No tiene `lat`/`lng` (el mapa cae a un fallback fijo).
- **`equipamiento_tallas`** (`talla`, `cantidad`) y **`config_equipamiento`** (`total_protecciones`) — stock de patines/protecciones.
- **`tareas`** / **`asignaciones_tareas`** / **`config_tareas`** (`limite_tareas_activas`) — sistema de tareas del club.
- **`puntos_mensuales`** — `nombre_usuario`, `anio`, `mes`, `puntos_tareas`, `puntos_asistencias`, `puntos_bonificaciones`, `puntos_total`. Aún no expuesto en `getEquipo()` (falta decidir qué período mostrar).
- **`config_tiers`** — `id`, `orden`, `nombre`, `min_clases`, `min_puntos`, `ventana_meses`, `logica`, `es_default` (no se puede borrar el tier default).
- Otras tablas activas: `sessions`/`admin_sessions`/`pin_attempts`/`admins`/`config_app` (auth y config), `solicitudes_excepcion` (ausencias/dificultad económica), `pagos`/`ingresos`/`egresos`/`solicitudes_pago`/`nivel_actual` (finanzas), `temporadas_descanso` (leída vía `fetch()` directo a PostgREST desde el cliente con la anon key, no vía Edge Function).

## 4. Variables globales clave por módulo JS

| Variable | Definida en | Descripción |
|---|---|---|
| `BACKEND` | config.js | URL de la Edge Function de Supabase |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | config.js | Para fetch directo a PostgREST (bypasea la Edge Function) desde el cliente, ej. `temporadas_descanso` |
| `GOOGLE_CLIENT_ID`, `sha256Hex` | config.js | OAuth y hash de PIN |
| `_token` | api.js | Token de sesión de usuario, inyectado en cada request |
| `E` / `E.nombre` / `E.datos` | reservas.js | Estado del flujo de reserva y datos del usuario logueado, usado por casi todos los módulos |
| `E.reagendando`, `E.tallasPorFecha` | reservas.js | Flags/excepciones del flujo de reserva |
| `_todasReservas` | home.js | Reservas cargadas tras login |
| `ADMIN_PANTALLAS`, `_adminToken`, `_adminEmail` | admin.js | Navegación y sesión admin |
| `TOP_BAR_CONFIG`, `PANTALLAS_RAIZ`, `APP_BOTTOM_NAV_ITEMS`, `_BOTTOM_NAV_EXTRA`, `_overlayStack`, `_bottomNavUltimaPantalla` | ui.js | Config de título/volver por pantalla, pantallas sin "atrás" navegable, tabs de nav inferior + mapeo de sub-pantallas a tab, pila de cierres de overlay, última sub-pantalla por tab (preservación de estado) |
| `NOMBRES_MESES` | ui.js | Labels de meses en español |

## 5. Edge Function (Supabase)

- **Proyecto:** `uusbnreitoobqssizbfq` — URL base `https://uusbnreitoobqssizbfq.supabase.co`, función en `/functions/v1/api` (deploy: `supabase functions deploy api --project-ref uusbnreitoobqssizbfq`).
- **Runtime:** Deno + `@supabase/supabase-js`, usa `SUPABASE_SERVICE_ROLE_KEY` (bypasea RLS). Contrato `action`-based idéntico al backend GAS legado que reemplaza: query string en GET, body form-urlencoded o JSON en POST — mismo contrato que `js/api.js`/`js/eventos.js` esperan.
- **Cómo agregar un action nuevo:**
  1. Escribir la función `async function miAccion(params) { ... }` en `supabase/functions/api/index.ts`, reusando helpers existentes (`_validarToken`, `_validarAdminToken`, etc.) si aplica.
  2. Agregar una línea al `switch (action)` del `Deno.serve()` al final del archivo: `case 'miAccion': return json(await miAccion(params));` (agrupado junto a las acciones de su misma área — Auth/Perfil/Venues/Tareas/Eventos/Reservas/Pagos/Usuarios).
  3. Cualquier `action` no listada en el switch cae a `forwardToGAS(params)` (proxy al Apps Script legado, `GAS_URL`) — si el action nuevo reemplaza una de GAS, el switch debe capturarla antes de que llegue ahí.
  4. Deploy con el comando de arriba; no hace falta reiniciar nada del lado del cliente (mismo `BACKEND` de siempre).
- **Auth:** token de usuario contra tabla `sessions`, token admin contra `admin_sessions` (`_validarToken`/`_validarAdminToken`). `ADMIN_PRINCIPAL` fijo en el código (`victordbh@gmail.com`).

## 6. Principios UX

- **Español neutro** en todo texto de usuario (nunca "vos"/"tú" mezclado con "usted"; lenguaje inclusivo con "x" ya establecido en el dominio — Mirlxs, Activx, Lesionadx, administradorx).
- **Transiciones:** toda pantalla/wizard nuevo empuja su propio estado a `history` (patrón `ir(id, desdeHistorial)`/`popstate` de `js/ui.js`) para que "atrás" retroceda un paso a la vez. Pantallas raíz (`s1`, `s-home`) atrapan el historial para que "atrás" sea un no-op. Todo overlay/modal/sheet se cierra vía `_overlayStack` (gesto nativo de "atrás" lo cierra en vez de navegar la pantalla de fondo). Transición "shared axis X" (`axisTransicion()`, `shared/axis-transicion.js`) para paneles tipo `aj-sub-*` que se abren sobre una pantalla ya activa.
- **Nav inferior siempre visible** en toda sub-pantalla/overlay donde el usuario semánticamente sigue dentro de Reservas/Eventos/Tareas/Ajustes — no solo en la raíz de cada sección. Toda sección de la nav inferior preserva su última sub-pantalla/estado al volver desde otro tab; solo tocar el tab ya activo resetea a la raíz.
- **`mostrarToast()` es silencioso por default** para tipos que no son error (decisión intencional de Victor, no bug) — solo `tipo==='error'` o `forzar:true` explícito lo muestran.
- **Cache-busting:** todo JS/CSS que pueda cambiar y deba reflejarse de inmediato en producción (GitHub Pages detrás de Fastly, `max-age=600`) necesita `?v=<hash>` en su `<script src>`/`<link href>`, con el archivo sumado a `CACHEBUST_FILES` en `.githooks/pre-commit` (que recalcula el hash automáticamente en cada commit que lo toque).

## 7. Guidelines del proyecto

- No pegar código completo cuando un find/replace puntual alcanza — especialmente para cambios en Code.gs (Apps Script, fuera de este repo, sin acceso directo): entregar el snippet exacto a reemplazar, no el archivo entero.
- Antes de escribir CSS/JS nuevo, buscar explícitamente un componente/patrón ya existente que cubra lo mismo (bottom sheets, pills, modales info, wizards tipo `salud-paso`) y reusarlo en vez de duplicar.
- No hardcodear colores (ver sección 2); no dejar estilos inline repetidos sin convertir a clase.
- Todo elemento transitorio lleva animación de entrada y salida desde que se crea (no como parche posterior).
- Verificar con Playwright cuando el entorno lo permita; si no, dejar explícito que no se pudo probar y por qué, en vez de asumir que funciona.
