plugins {
    id("com.android.application")
    // Firebase (notificaciones nativas): lee app/google-services.json.
    id("com.google.gms.google-services")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.pivotapp.coach"
    // 37: flutter_local_notifications 23 lo exige (solo compilación; minSdk/targetSdk no cambian).
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications usa APIs de java.time: requiere desugaring.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Paquete definitivo en Google Play (permanente, decidido 2026-11-06).
        applicationId = "com.pivotapp.coach"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Firma de subida a Google Play: la llave vive SOLO en los secretos de
    // GitHub (FIRMA_JKS_B64 + FIRMA_CLAVE, ver .github/workflows/app-android.yml),
    // nunca en el repo. Sin esas variables (compilación local) firma con la
    // llave de depuración.
    val firmaArchivo = System.getenv("FIRMA_ARCHIVO")
    val firmaClave = System.getenv("FIRMA_CLAVE")
    val conFirma = !firmaArchivo.isNullOrBlank() && !firmaClave.isNullOrBlank()
    signingConfigs {
        if (conFirma) {
            create("subida") {
                storeFile = file(firmaArchivo!!)
                storePassword = firmaClave
                keyAlias = "pivot"
                keyPassword = firmaClave
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (conFirma) signingConfigs.getByName("subida") else signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
