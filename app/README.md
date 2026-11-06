# Pivot — app Android

App nativa de Pivot para Android, hecha en Flutter. El iPhone sigue usando la web (`app.quindesvolcanicos.com`).

- Paquete: `com.pivotapp.coach`
- Arquitectura, decisiones y estado: ver la sección "App Android nativa" del `MANIFEST.md` en la raíz del repo.
- Compilación: GitHub Actions (`.github/workflows/app-android.yml`) genera el `.aab` para Google Play y un `.apk` de prueba en la release `app-android`.

Todos los textos de la app van en español neutro, y todos los colores y estilos salen de `lib/core/tema.dart`.
