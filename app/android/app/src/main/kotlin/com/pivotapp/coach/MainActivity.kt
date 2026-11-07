package com.pivotapp.coach

import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    // Bloqueo de capturas de pantalla (ficha de emergencia, 2026-11-07):
    // FLAG_SECURE impide capturas, grabaciones y la vista previa en Recientes.
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "pivot/seguridad").setMethodCallHandler { call, result ->
            when (call.method) {
                "bloquearCapturas" -> { window.addFlags(WindowManager.LayoutParams.FLAG_SECURE); result.success(null) }
                "permitirCapturas" -> { window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE); result.success(null) }
                else -> result.notImplemented()
            }
        }
    }
}
