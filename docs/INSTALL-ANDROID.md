# Instalar Dailoop 0.7.0

[Descargar APK actual 0.7.0/build8](https://github.com/iAdamn/Dailoop/releases/download/v0.7.0/Dailoop-0.7.0-build8-arm64.apk) · [Integridad y entrega](RELEASE-0.7.0.md) · [Pruebas en teléfono](PRUEBAS-0.7.0.md). Guarda un backup fuera de la app e instala encima de la versión anterior; no desinstales. Se conserva el paquete y el certificado. APK ARM64 de 38,76 MB, con cuenta Google/sync opcionales y uso offline.

## Instrucciones históricas de la primera release

# Instalar Dailoop desde Dailoop 1.0

La primera release del repositorio contiene el APK personal firmado **Dailoop 0.1.0, compilación 2**. La app funciona sin cuenta, Expo Go ni servidor. Usa SQLite local.

1. Descarga [Dailoop-0.1.0.apk](https://github.com/iAdamn/Dailoop/releases/download/v1.0/Dailoop-0.1.0.apk) en tu teléfono Android.
2. Ábrelo desde Mis archivos o la aplicación desde la que lo descargaste.
3. Si Android lo solicita, permite a esa aplicación instalar el APK.
4. Abre Dailoop y crea tu primera actividad. La base comienza vacía.

Tamaño: 67.199.497 bytes, aproximadamente 67,2 MB. Incluye ARM64 y x86_64. Android mínimo declarado: 7.0 / API 24; el paquete se probó en emulador Android 17. El mínimo declarado no equivale a una prueba en cada versión de Android.

## Datos y actualizaciones

El navegador y Android mantienen bases locales independientes. Para trasladar datos, crea un backup completo desde Ajustes en el origen y restaura ese archivo en el destino. Restaurar reemplaza la base actual. Los backups incluyen datos privados y no están cifrados: guárdalos en un lugar adecuado.

Para actualizar, instala encima del APK anterior con la misma firma. Desinstalar o borrar almacenamiento elimina la base local; conserva antes un backup fuera de la app. La clave privada original no se publica. Una compilación firmada con una clave propia no puede actualizar directamente esta instalación.

## Integridad

SHA-256 del APK:

```text
d6ada37edd720ff1b5cf5198d6b3ed34e861835585e5e307fccdc10a8efac3c8
```

La release también incluye `Dailoop-0.1.0.apk.sha256`. En PowerShell puedes comprobar el archivo descargado con:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Dailoop-0.1.0.apk
```

## Estado de esta versión

Los registros, persistencia, backup, restauración y reportes se comprobaron en emulador Android 17. La prueba inicial del usuario en Samsung S26 Ultra / Android 17 ha detectado navegación lenta, desplazamiento a tirones y campos que quedan tapados por el teclado. Están pendientes de corrección. También está solicitada una distribución de actividades de una a cuatro columnas.

Consulta [el registro de feedback](DEVICE-FEEDBACK.md) y [las pruebas Android y sus límites](ANDROID-RELEASE.md).
