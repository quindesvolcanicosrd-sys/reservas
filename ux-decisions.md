# Decisiones de UX

Este archivo no existía en el repo antes de esta entrada — se crea porque se pidió explícitamente actualizarlo. Registra decisiones de comportamiento/interacción (no arquitectura de backend, eso vive en `MANIFEST.md`).

## Wizard "Crear evento" — paso "Detalles" (`#ev-crear-paso-config`)

- **Descripción (opcional):** campo de texto libre, siempre visible bajo las pills de "Tipo de evento", `<textarea>` con `maxlength="150"` + contador "n/150" (mismo componente ya usado en `#ev-editar-descripcion-input`/`#ev-crear-unico-descripcion-input`). Placeholder: "Agrega una descripción...". No es requerido para avanzar/guardar.
- **Pill "Otro" (Tipo de evento):** al seleccionarla, revela un `<input type="text">` debajo de las pills con placeholder "¿Qué tipo de evento es?", para que la persona escriba la categoría real en vez de quedarse con la etiqueta genérica "Otro". Si escribe algo, ese texto es el valor final que se usa como categoría del evento; si lo deja vacío, se usa "Otro" tal cual. El input se oculta y se limpia automáticamente al elegir cualquier otra pill (Entrenamiento/Partido/Evento) — no queda un valor "fantasma" de una elección anterior.
