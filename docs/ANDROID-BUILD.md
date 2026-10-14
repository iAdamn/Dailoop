# Compilar Dailoop para Android

Compilación local autorizada el 13 de octubre de 2026. No requiere Expo Go, EAS, cuenta de Expo, servidor de datos ni publicación en una tienda. Los resultados ejecutados y pendientes se registran en [ANDROID-RELEASE.md](ANDROID-RELEASE.md).

## Herramientas locales

Para compilar desde GitHub, clona el repositorio en una carpeta llamada `Dailoop` y ejecuta `npm ci`. El script de Windows conserva ese nombre en el alias de SDK. Instala las herramientas indicadas abajo en `output/tooling/android-sdk`; ni el SDK ni el JDK ni las cachés se distribuyen con el código. Usa JDK 17 en PATH. Las unidades S: y T: deben estar libres o apuntar a las rutas que el script verifica.

- Node 24.15.0, npm 11.12.1 y JDK Temurin 17.0.14.
- SDK en `output/tooling/android-sdk`: Android 36, Build Tools 36.0.0 (Gradle también resolvió 35.0.0), platform-tools, NDK 27.1.12297006 y CMake 3.22.1/3.30.5.
- Gradle 9.3.1 mediante wrapper generado por Expo SDK 57. Caché en `output/tooling/gradle-cache`.
- Herramientas y builds generados están ignorados por Git. El lockfile conserva las versiones de JavaScript; `npm ci` aplica el parche acotado de paleta a expo-blur.

En Windows, la ruta original contiene `!`. Las herramientas batch de Android expanden ese carácter, por lo que el script crea el alias de unidad `S:` para el directorio padre `C:/!Codex/Dayloop`. El SDK usa ese alias. La caché Gradle tiene el alias corto `T:` a `output/tooling/gradle-cache`, porque Ninja 1.10.2 falla al releer dependencias con rutas de más de 260 caracteres. Node y Gradle conservan la ruta canónica del proyecto para evitar raíces distintas en codegen. Si esas unidades pertenecen a otra ubicación, el script falla y no las reemplaza. No cambia PATH ni variables de entorno del sistema.

```powershell
# Desde C:/!Codex/Dayloop/Dailoop, con JDK 17 en PATH:
./scripts/build-android.ps1
# Recompilación conservando el proyecto nativo generado y su caché:
./scripts/build-android.ps1 -Incremental
```

El script aplica el parche de paleta, ejecuta Expo prebuild sin instalar paquetes y `:app:assembleRelease`. Expo SDK 57 recrea Android por defecto; `-Incremental` pasa `--no-clean` para aplicar la configuración sobre los archivos generados existentes. Incluye arm64-v8a para el teléfono objetivo y x86_64 para probar el mismo APK en emulador. La salida original es `android/app/build/outputs/apk/release/app-release.apk`. Que el archivo exista no equivale a aprobar sus pruebas: verificar firma, manifiesto, recursos y ejecución antes de entregarlo.

### Variantes desde 0.1.5

La entrega principal pasa a ARM64, con otra variante x86_64 si se requiere para emulador. El script tiene minificación R8 y eliminación de recursos activadas por defecto; `-NoOptimize` sirve para la comparación controlada, no como una afirmación de optimización. El párrafo anterior describe la entrega universal histórica 0.1.0.

```powershell
./scripts/build-android.ps1 -Architecture arm64-v8a -Incremental
./scripts/build-android.ps1 -Architecture x86_64 -Incremental
# Comparador ARM64 sin R8/resource shrinking:
./scripts/build-android.ps1 -Architecture arm64-v8a -Incremental -NoOptimize
# Inspector: contrato explícito de la variante, sin inferirlo del propio APK:
python scripts/inspect-apk.py RUTA_APK RUTA_SDK DIRECTORIO_EVIDENCIA --expected-abis arm64-v8a
```

Copiar cada APK a una ruta versionada antes de construir la siguiente variante; la ruta Gradle se reutiliza. Mantener fuente/bundle identificados y misma firma. No comparar GfxInfo mientras otra build carga el host. `npm run verify` guarda resultados bajo `output/verification/v<version>/automated`; para la huella final de 0.1.5 usar `node scripts/fingerprint.mjs output/verification/v0.1.5` y conservar las huellas anteriores.

## Firma privada y actualizaciones

La identidad de firma se conserva en `C:/Users/adame/.dailoop/signing`, fuera del proyecto y sus exportaciones. La carpeta contiene el keystore PKCS12 y su configuración privada, restringidos al usuario de Windows y SYSTEM. Guardar una copia privada segura de **la carpeta completa**: se necesita la misma clave para actualizar una instalación sin desinstalarla. No añadir estos archivos a Git, ZIP público ni paquete APK.

La primera ejecución crea una clave RSA de 4096 bits. Las siguientes la reutilizan. Si la configuración existe pero falta la clave, la compilación se detiene para recuperar el respaldo; no genera otra identidad. La contraseña se pasa mediante variables temporales de proceso y no se escribe en Gradle ni en logs. El certificado público y el SHA-256 del APK pueden publicarse; la clave privada y su contraseña no.

Para instalar, copiar únicamente el APK al teléfono y abrirlo. Android puede solicitar permitir instalaciones desde la aplicación con la que se abre el archivo. Para actualizar, instalar encima con la misma firma e incrementar versionCode en cada versión futura. Antes de desinstalar o borrar almacenamiento, crear y conservar un backup desde Ajustes: SQLite es local y esas acciones borran los datos.

## Emulador de esta fase

El destino de pruebas es un AVD propio `Dailoop_API_37` con imagen oficial Android 17 / API 37, sin cuenta personal. Sus datos están en `output/android-emulator`. Es distinto del Samsung S26 Ultra del usuario. El antiguo serial `emulator-5580` está bajo control externo y no debe operarse. Para QA de este proyecto se reservó `emulator-5590`; comprobar su identidad antes de usarlo y nunca elegir automáticamente un teléfono conectado.

Las pruebas de arranque, SQLite, documentos e interfaz deben registrar modo avión, versión, hash del APK, resultados y capturas. TalkBack, fluidez, gestos y comportamiento del fabricante en el S26 Ultra siguen requiriendo comprobación física si no hay un teléfono conectado.


## Audio breve desde 0.1.7

`npm ci` y el script de compilación aplican `scripts/patch-android-audio.mjs` a `expo-audio@57.0.5`. Media3 1.9 declara WAKE_LOCK y su builder activa un wake lock local por defecto; para los avisos breves en primer plano de Dailoop se fija explícitamente `C.WAKE_MODE_NONE`, antes de excluir el permiso. El parche comprueba versión/anchor y es idempotente. Referencia: [ExoPlayer.Builder.setWakeMode](https://developer.android.com/reference/androidx/media3/exoplayer/ExoPlayer.Builder#setWakeMode(int)). No se habilita reproducción/grabación de fondo ni micrófono. La inspección acepta únicamente MODIFY_AUDIO_SETTINGS para audio local y el permiso de receiver privado de firma, y comprueba los bytes originales de ambos WAV dentro del APK.
