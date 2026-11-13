# Hoja de ruta de Pivot (app Android)

Fuente de verdad del trabajo pendiente. La lee cada corrida de la tarea programada (cada 2 días, 3:00 Ecuador) junto con MANIFEST.md.
- Detalle de diseño de Calendario, Yo, audiencias, personalización y crear liga: `PENDIENTES_2026-11-12.md` (secciones A–H).
- Revisión y respuestas de Victor del 2026-11-12: https://claude.ai/artifact/MqCCxzsXEGrYZr3KBhGXfE
- Puntos del documento original que no estaban en las etapas: `PENDIENTES_2026-11-12.md` sección I.
- Pedidos nuevos de Victor: documento "Pivot — Bandeja" (claude.ai); lo hecho se pasa aquí y a MANIFEST.

Reglas de siempre:
- Texto: español neutro, sin voseo, sin pronombres femeninos.
- **"Pivot" reemplaza a "admin/administradorxs" en toda la app** (decidido 2026-11-12; plural "Pivots"). Se aplica en la etapa 4.
- Diseño: colores solo en `tema.dart`; transiciones suaves; degradados en los íconos donde sumen.
- Cierre: MANIFEST y CHANGELOG al día; commit, push y CI verde.
- Con Victor primero: borrar datos, dinero, permisos, textos legales o algo que contradiga una decisión. Las migraciones de Supabase necesitan su aprobación: en corridas sin Victor se dejan preparadas en la Bandeja.

## Etapas (orden aprobado 2026-11-12)

1. [x] Consultas de asistencia escalables + ronda de 11 cambios (2026-11-12).
2. [x] **Bugs reportados** (2026-11-12)
   - [x] Push de 1 h antes:
     - Los botones abren la app con confirmación.
     - "Cancelar entrenamiento" solo para Pivots y con menos de 5 personas; si no, "No asistiré".
     - Contar solo "Asistiré" y sin nombres: "X personas asistirán hoy".
   - [x] Timeline: la línea de "ahora" avanza cada minuto; "Tomar asistencia" se activa al llegar la hora con la app abierta.
   - [x] Eventos pasados:
     - La tarjeta muestra tu asistencia real (a horario, tarde, no asististe).
     - El detalle muestra quién fue y cómo llegó; sin botones de respuesta.
   - [x] Eventos cancelados: solo el aviso y, a lo sumo, quién había dicho que iba.
   - [x] Pivots pueden cambiar o quitar la respuesta de una persona desde el detalle del evento.
   - [x] Tomar lista: arriba quienes vinieron ese día de la semana en 3 de las últimas 4 semanas (sale de sugeridos si falta 2 semanas seguidas).
   - [x] Notificaciones en Ajustes abre al instante (configuración guardada).
   - [x] Eventos que se cruzan: permitidos en todo el calendario, con confirmación al crear ("Ya hay un evento a esa hora, ¿crear igual?").
3. [ ] **Calendario + tareas + Mi perfil** (detalle en PENDIENTES sección A)
   - [x] Eventos → Calendario con tareas integradas (2026-11-12):
     - Mis tareas en su fecha, con punto cuadrado.
     - Atrasadas arriba en rojo.
     - Tareas de otras personas agrupadas por día.
     - "Para tomar" (línea en Todo, franja en Tareas).
     - Ícono de tareas con número junto a la lupa.
     - Filtros Todo · Eventos · Tareas.
     - Nueva tarea / Proponer tarea en el "+".
     - Tour actualizado (`tour.calendario.visto`).
   - [x] Ajustes → Mi perfil (pestaña con el avatar): cabecera con foto y "Ver mi ficha", Mi ficha editable, pagos y equipamiento, datos personales, aplicación. En Equipo, tu ficha tiene "Editar mi perfil" (lleva a la pestaña).
   - [x] Pestaña Tareas eliminada (el tablero se abre desde Calendario).
   - [x] Calendario: filtros en un solo botón junto a la lupa (qué mostrar, tipo, lugar, área); la lupa solo busca texto (2026-11-12).
   - [x] Roles del equipo editables por Pivots (catálogo por liga, renombrar cambia todas las fichas, borrar en uso pide confirmar) (2026-11-12). Falta sumarlo al asistente de crear liga (etapa 9).
   - [ ] Mi Liga se reparte (sigue en la web por ahora, pestaña solo para Pivots):
     - [x] Bandeja de Pivots en Calendario: pagos y reservas, rectificaciones, excepciones, lesiones y tareas por validar (2026-11-12).
     - [ ] Cambios de categoría en la Bandeja ("Pedir revisión" del cambio de categoría): todavía no existe el pedido; se hace junto con el modal de cambio de categoría.
     - [x] Funciones de personas en la ficha: registrar pago, "No paga (mes)" y acceso de Pivot (2026-11-12).
     - [x] Comunidad (grupos y redes) e Inventario (patines por talla, protecciones, lo reservado) en Equipo (2026-11-12).
     - [x] Inventario personalizable: listas propias (tallas, sets, unidades, insumos), quién lo tiene (temporal con aviso cada 7 días a Pivots y a la persona, o permanente) y pedidos de uso sin bajar de Categoría/Equipo (2026-11-13). Faltan fotos y etiqueta, y sumarlo al asistente de crear liga (etapa 9).
     - [x] Ajustes de la liga en Mi perfil: roles, comunidad, inventario (2026-11-12). El resto de Mi Liga (precios, categorías, tareas recurrentes, finanzas) se mueve en las etapas 4–6.
     - [x] Rectificaciones: "¿Es correcto?" en la tarjeta y el detalle, "Revisión pendiente" con días restantes, se descarta a los 7 días (2026-11-12).
     - [x] Qué llevar: pill con lo reservado junto a cada persona en el detalle del evento (Pivots) (2026-11-12).
   - [ ] Nav final: Calendario · Equipo · Finanzas (si la liga cobra y hay permiso) · Mi perfil.
4. [ ] **Pivots y permisos**
   - "Pivot" en vez de admin.
   - Permisos por área, cada uno con explicación de qué habilita.
   - En datos sensibles se indica qué Pivot puede verlos, para que en una emergencia se le pregunte.
   - Elegir qué Pivots reciben cada aviso operativo (qué llevar, equipamiento, pagos).
   - Roles por deporte (roller derby: jammer, blocker, bench, coach…; fútbol: delantero, arquero…) con "+" para roles propios.
5. [ ] **Tesorería** (Finanzas):
   - **Cuentas**: efectivo (caja, con quién la tiene), De Una y banco. Saldo inicial = fondos que la liga ya tenía antes de usar Pivot.
   - **Cada ingreso dice a qué cuenta entró.** Al aprobar un pago, el Pivot confirma el medio real (la persona pudo declarar banco y pagar con De Una) y se puede corregir después.
   - **Corregir es anular y volver a registrar.** Nada se borra.
   - **Conciliación**: el Pivot ingresa el saldo real del banco o De Una y la app muestra la diferencia, para encontrar centavos o pagos sin registrar.
   - **Filtros completos**: fechas libres, medio de pago, persona, categoría, tipo. Exportar a Excel o CSV.
   - **Préstamos o uso de fondos por una persona**: deuda aparte de la cuota, con abonos. No cambia la cuota.
   - **Saldo a favor o en contra de una persona** (Victor, 2026-11-13; propuesta en la Bandeja, falta su aprobación): "Saldo con el equipo" en Funciones de Pivot con cada movimiento; al pagar la cuota se avisa y se elige cómo aplicarlo (cubrir toda la cuota o un monto fijo por mes; pagar la deuda junto o en cuotas). El Pivot decide si se junta con la cuota.
   - **Fondos de viaje**:
     - Registrar el viaje, el monto y la ventana de asistencia (ej. últimos 2 años o desde una fecha).
     - Tramos por % de asistencia (ej. ≥90 % reparte 50 %, 35–89 % el otro 50 %, menos no recibe).
     - Vista previa de quién recibe cuánto.
   - **Historial de pagos**: los datos de pago se conservan con nombre y datos aunque la persona borre su cuenta o la eliminen (como un banco).
   - **Excepción manual**: dice el mes ("No paga noviembre 2026") y queda en el historial de la persona.
   - **Transparencia**: si se activa, el equipo ve totales y en qué se gasta. Nunca pagos, deudas ni mora de otras personas: eso solo lo ven Pivots con permiso de Finanzas.
   - **Cálculos**: con pruebas automáticas que comparan totales.
   - **Aviso legal** revisado por abogado (Pivot no administra fondos).
6. [ ] **Planes de pago, cursos e inscripción rápida**:
   - **Planes**:
     - 1 a 12 meses o N clases.
     - Se asignan a categorías y, si hace falta, a personas.
   - **Cursos**:
     - Fechas de inicio rígidas o flexibles, clases a mano o por CSV.
     - Curso de principiantes (freshmeat) con **try out** al final para pasar a un equipo.
   - **Inscripción rápida**:
     - Con nombre y teléfono; un cupón por teléfono.
     - Botón de WhatsApp para contactar a quien se inscribió.
   - **Cupones manuales a una persona**: 10, 15, 25, 50 o 100 %, en la pantalla de precios y cupones.
7. [x] **Animaciones de inicio** (2026-11-12): logo como pantalla nativa, bucle Lottie mientras carga, intro con revelado y carga de datos en paralelo.
8. [ ] **Base para varias ligas** (`liga_id`, aislamiento por liga), inicio con Google, revisión legal.
9. [ ] **Crear tu liga** (asistente, PENDIENTES H):
   - Sin nombre de liga: solo equipos, y cada equipo es una categoría.
   - Una liga de un solo equipo puede agregar otro equipo (ej. principiantes) con reglas propias.
   - Enlace de invitación para copiar y pegar en el grupo. El QR queda como extra para mostrar en persona.
   - Con configuración rápida, aviso solo a Pivots cada tanto ofreciendo las funciones avanzadas ("Recordarme luego" / "No volver a mostrar").
10. [ ] **Versión web de Flutter** cuando Android esté completa:
    - La PWA vieja queda congelada.
    - Los datos sensibles (emergencia) no estarán en la web.
11. [ ] **Partidos entre dos ligas**. Después torneos, merch y cronogramas: no olvidar.

## Antes de publicar en Google Play
- Pasar Supabase, GitHub, OneSignal y Firebase a la cuenta de Google de Pivot.
- Política de privacidad revisada por abogado.

## Detalles acordados por pantalla (2026-11-12)
- **Rectificaciones**:
  - "¿Es correcto?" en la tarjeta y en el detalle.
  - Mientras espera respuesta, el botón pasa a "Revisión pendiente" con ícono de información; al tocarlo, una hoja explica el estado y cuántos días quedan.
  - Si se descarta a los 7 días, puede volver a pedirla.
- **Qué llevar**:
  - Pill junto al avatar de quien reservó, con lo que reservó.
  - Aviso a los Pivots elegidos: "Equipamiento a llevar hoy: 3 patines y 2 protecciones". Al tocarlo abre el detalle del evento, con tallas.
- **Inventario**:
  - Fotos, etiqueta y quién lo tiene.
  - Push a los Pivots a cargo a los 7 días con una persona.
- **Categorías y puntos**: pantalla con ejemplos usando personas reales del equipo, para ver cómo afectaría cada cambio. Hecho (2026-11-13): asistente por pasos con impacto y avisos.
- **Eliminar persona**: último recurso para casos serios. Conserva todos sus movimientos de dinero con nombre y datos.
