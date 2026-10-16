# Dailoop 0.5.0 · compilación 7

El usuario autorizó este APK con «APK, Hago try ahi» después de la corrección de auditoría. Se prepara ARM64 optimizado para S26 Ultra / Android 17, conservando paquete `local.dailoop.personal`, firma y datos existentes. No se autoriza publicación Git/Google Play ni instalación en el teléfono desde Codex. La base de datos online y la publicación en Google Play quedan para un bloque posterior.

Estado: **compilación release e inspección binaria PASS**. APK listo para la prueba física del usuario.

APK: `output/releases/v0.5.0/build-7/Dailoop-0.5.0-build7-arm64.apk`, **38.088.136 bytes (38,09 MB)**.

SHA-256: `2f45990c2b88b0913b2ba43807b8f44ee74d5243ef1ddd99c3084542179aa00d`.

Certificado SHA-256 conservado: `72c065f017d9d53ead5934316a732424c2ae639beafc3c2937c4b89932b61310`.

## Cambios incluidos

Incluye los selectores gráficos de hora/anticipación, repetición por días de la semana y todos los ajustes descritos en [AUDIT-FIXES-0.5.0.md](AUDIT-FIXES-0.5.0.md). Audio, blur y notifications se compilan desde fuente. Android importa backups mediante un lector nativo con límite real de bytes.

SQLite conserva esquema físico 2 y el historial existente. Importa backups 1/2/3; la repetición usa v3. Un APK anterior puede rechazar las copias v3: no eliminar campos ni renombrar su versión para forzar una restauración.

## Instalación y prueba física

Exportar un backup completo desde Ajustes y abrir el APK nuevo eligiendo Actualizar, sin desinstalar la app. Mantener versión visible 0.5.0 durante las correcciones; el siguiente APK entregado deberá usar código 8.

Comprobar en el teléfono:

- Actualización conservando actividades, registros, preferencias y rachas.
- Audio al registrar/crear y tic suave al navegar; háptica y desplazamiento.
- Historial/auditoría desplazables, borradores retenidos y campos visibles con teclado.
- Hora/anticipación gráficas y recurrencia en los días elegidos, sin duplicar registros al completar.
- Avisos con permiso de Android, aplicación cerrada/reinicio y ahorro de batería.
- Exportar e importar una copia propia mediante el selector Android.

Los resultados de navegador y la compilación no certifican recepción de avisos, proveedores reales de documentos ni 120 FPS físicos.

## Evidencia

Evidencia de esta entrega: `output/verification/v0.5.0/build-7/`. APK anterior de código 6 conservado en `output/releases/v0.5.0/Dailoop-0.5.0-arm64.apk`, SHA-256 `9138898719c36849e0c51b1eb759f7d72382ca3c0c16dda765c927e9a7744cb9`.

Verificaciones previas de la auditoría: 278 pruebas de código, 31 recorridos Web y compilación Kotlin/Java PASS. En esta entrega se revalidaron tipos, matriz Expo y hashes de originales. Compilación ARM64 con R8/resource shrinking: **PASS**, 628 tareas, 4m 6s. Inspección final: **69/69 PASS** en firma, versión, permisos, bundle coincidente con el generado, sonidos/fuentes, ABI, integridad ZIP y alineación ELF/ZIP de 16 KiB. DEX contiene los identificadores de DailoopBackup/readBackup, DailoopGlass y DailoopZonedWeeklyTrigger. APK de código 6 conservado por checksum. La deuda upstream y sus mitigaciones siguen en [dependency-audit.md](dependency-audit.md).

Metadatos y checksum de entrega junto al APK; inspección completa en `output/verification/v0.5.0/build-7/apk/`, log en `build-arm64.log` y huella de fuente/exportación en `source-fingerprint.json`. No se instaló en un dispositivo ni se publicó en Git. La aceptación física sigue pendiente.
