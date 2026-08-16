# Decisiones de UX

Este archivo no existía en el repo antes de esta entrada — se crea porque se pidió explícitamente actualizarlo. Registra decisiones de comportamiento/interacción (no arquitectura de backend, eso vive en `MANIFEST.md`).

## Wizard "Crear evento" — paso "Detalles" (`#ev-crear-paso-config`)

- **Descripción (opcional):** campo de texto libre, siempre visible bajo las pills de "Tipo de evento", `<textarea>` con `maxlength="150"` + contador "n/150" (mismo componente ya usado en `#ev-editar-descripcion-input`/`#ev-crear-unico-descripcion-input`). Placeholder: "Agrega una descripción...". No es requerido para avanzar/guardar.
- **Pill "Otro" (Tipo de evento):** al seleccionarla, revela un `<input type="text">` debajo de las pills con placeholder "¿Qué tipo de evento es?", para que la persona escriba la categoría real en vez de quedarse con la etiqueta genérica "Otro". Si escribe algo, ese texto es el valor final que se usa como categoría del evento; si lo deja vacío, se usa "Otro" tal cual. El input se oculta y se limpia automáticamente al elegir cualquier otra pill (Entrenamiento/Partido/Evento) — no queda un valor "fantasma" de una elección anterior.

## Wizard "Crear evento" — paso "Tipo" → flujo "Descanso"

- **1 solo paso de fechas, calendario de rango "ida y vuelta" (antes eran 2 pasos con 2 calendarios de una sola fecha cada uno).** Al elegir "Descanso" en el paso "Tipo", se pasa directo a un único paso (`ev-crear-paso-descanso-rango`) con un solo calendario navegable. El primer toque en una fecha fija el **inicio** del rango; el segundo toque fija el **fin** (se resalta todo el rango entre ambas). Si se toca una fecha anterior al inicio ya elegido, el rango se reinicia desde esa fecha nueva — en la práctica logra que "la fecha más temprana de las 2 tocadas termina siendo el inicio", sin que la persona tenga que pensar en un orden. Botón "Restablecer" (ícono, aparece solo después de tocar alguna fecha) para volver a empezar el rango sin salir del paso. Mismo comportamiento visual que la sección "Por período" de Asistencia Anticipada — coherencia entre las 2 partes de la app que ya usan selección de rango de fechas.
