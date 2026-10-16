# Dailoop

Código abierto de **Dailoop**, una app personal de registros cotidianos que funciona sin cuenta y sin internet. React Native/Expo, TypeScript y SQLite, con interfaz glass y preview en navegador. Cuenta Google y sincronización Firebase Spark opcionales, activadas expresamente desde Ajustes.

**Versión actual: 0.7.0 / compilación Android 8**, ARM64, firmada con el mismo certificado para actualizar conservando datos.

[Descargar APK 0.7.0](https://github.com/iAdamn/Dailoop/releases/download/v0.7.0/Dailoop-0.7.0-build8-arm64.apk) · [Release](https://github.com/iAdamn/Dailoop/releases/tag/v0.7.0) · [Cambios y verificación](docs/RELEASE-0.7.0.md) · [Pruebas en teléfono](docs/PRUEBAS-0.7.0.md)

Incluye calendario de actividad, orden manual y fijados, controles separados de sonido/háptica, estado de sincronización en encabezado, acciones de recordatorio y widget Android. Cuenta Google y sincronización opcionales con Firebase Spark; el registro local funciona sin internet. Español, inglés y portugués completos, sin servicio remoto de traducción.

[Privacidad](https://iadamn.github.io/Dailoop/privacy/) · [Borrar cuenta y datos online sin app](https://iadamn.github.io/Dailoop/delete-account/). Se verifica la misma cuenta con Google y se confirma expresamente el borrado. Las copias locales y backups exportados no se borran remotamente. Un marcador técnico mínimo impide resubidas desde sesiones antiguas.

La primera publicación del repositorio fue Dailoop 1.0 con APK interno 0.1.0. Se conservan sus artefactos y los de 0.1.5, 0.1.6, 0.1.7 y 0.5.0; sus documentos describen entregas históricas, no el estado actual. [Compilación anterior 0.5.0/build7](docs/RELEASE-0.5.0-BUILD-7.md).

## Probar la preview

La preview incorpora [idioma completo en español, inglés y portugués de Brasil](docs/LANGUAGES-0.5.0.md), elegible en **Ajustes → Idioma**. Se guarda en el dispositivo y funciona sin red; tus nombres, categorías, notas y copias conservan su contenido original. Está incluido en la APK 0.7.0.

La preview estable se sirve en **http://localhost:8795**; la de desarrollo, en **http://localhost:8793**. Son orígenes distintos y mantienen bases distintas. Usar Edge o Chromium con Web Locks y aislamiento COOP/COEP.

1. Abre la preview. Puedes crear tu primera actividad o ir a **Ajustes → Explorar con datos de demostración**.
2. Pulsa **Registrar** varias veces. En **Estadísticas → Ver historial**, abre un registro para corregirlo, anularlo y consultar sus versiones anteriores.
3. En Estadísticas, cambia día/semana/mes o elige fechas históricas. Genera un reporte y revisa la selección antes de guardar Markdown.
4. En Ajustes, exporta un backup. Puedes inspeccionarlo, cancelar o confirmar la restauración completa. Incluye datos privados y todas las revisiones; el archivo no está cifrado.
5. Prueba claro/oscuro y recarga. La demostración tiene su propia base; reiniciarla no afecta a tus datos personales.

En Recordatorios puedes vincular una actividad, elegir fecha/hora y varios avisos, o completarla para guardar un único registro. Los avisos se reciben desde Android con permiso del sistema; la preview permite gestionar datos sin simular su entrega. Las rachas cuentan fechas locales consecutivas, no pulsaciones repetidas en un día.

Los datos son locales de ese navegador y origen. En **Ajustes → Cuenta y sincronización** puedes conectar Google y, por separado, activar la sincronización con otros dispositivos. Se guardan primero en SQLite; sin internet los cambios quedan pendientes. Los conflictos incompatibles requieren elegir una versión y conservan ambas como copias. [Configuración, límites y pruebas](docs/SYNC-0.5.0.md). Está incluido en la APK 0.7.0.

Borrar datos del sitio puede eliminarlos: conserva backups manuales. Una segunda pestaña permite consultar y recibe actualizaciones; para escribir, usa la primera o ciérrala y recarga la segunda. El servidor local debe estar disponible para cargar la preview; no es una PWA con arranque Web offline.

## Ejecutar desde el código

Requisitos verificados y fuentes: [compatibility.md](docs/compatibility.md). El lockfile fija la combinación. Node 24.15.0 y npm 11.12.1 se usaron para verificarla.

```powershell
npm ci
npm run web
```

La preview de desarrollo usa exclusivamente los puertos locales 8793 y 8794; si están ocupados, falla sin reutilizar ni detener otro proyecto. Para la preview estática, en otra terminal:

```powershell
npm run export:web
node scripts/serve-export.mjs
```

El uso offline no requiere variables ni credenciales. Para compilar con Google/sincronización, copia .env.example a .env.local y configura los tres identificadores públicos de tu propio proyecto Firebase. La APK publicada ya los incluye. Las reglas por UID protegen los datos; nunca incluyas claves administrativas. `.env*`, claves de firma, dependencias, builds nativos y cachés están excluidos de Git.

## Verificar

```powershell
npm run typecheck
npm run lint
npm run test:domain
npm run test:storage
npm run test:unit -- --watch=false
npm run test:ui-domain
npm run test:stress
npm run test:native-backup
npm run test:tooling-security
npm run check:expo
npx expo-doctor
npm run test:e2e
# Regresión de producción, con la preview exportada en 8795:
npx playwright test --config playwright.release.config.ts
```

Los E2E requieren ambas previews abiertas: desarrollo 8793 para contratos/rutas de QA y exportación 8795 para la sesión offline. Un worker y contextos aislados evitan mezclar bases de pruebas con las del usuario. Playwright usa el navegador Chromium disponible o Edge local. Los fixtures son ficticios. Las rutas `__spike` y `__storage-tests` sólo funcionan en desarrollo; no son funciones de la app personal.

Para ejecutar los contratos Web sin bundling HTTP durante cada prueba, Expo permite una exportación de desarrollo. Con 8793 libre, en otra terminal:

```powershell
$env:NODE_ENV='development'
npx expo export --platform web --dev --max-workers 2 --output-dir output/verification/v0.1.5/web-dev
$env:DAILOOP_EXPORT_ROOT='output/verification/v0.1.5/web-dev'
$env:DAILOOP_EXPORT_PORT='8793'
node scripts/serve-export.mjs
```

Esta exportación mantiene `__DEV__=true` y las rutas de QA; no es la preview personal ni el APK de release. La exportación habitual sin `--dev` sigue sirviéndose en 8795 con `npm run preview` desde una terminal sin esas dos variables. El servidor restringe sus archivos a `dist` o `output/verification` de este proyecto y falla si el puerto está ocupado.

El [checkpoint funcional](docs/CHECKPOINT.md) reúne resultados, matriz de aceptación y pendientes; el [pulido visual posterior](docs/UI-POLISH.md) documenta las superficies satinadas, Outfit/Manrope locales y su regresión específica. Consulta también [la evidencia de QA](docs/qa-plan.md), [las decisiones](docs/DECISIONS.md), [el contrato de dominio](docs/domain-contract.md), [almacenamiento y recuperación](docs/storage.md) y [avisos de dependencias](docs/dependency-audit.md). Los resultados Web no certifican SQLite Android, TalkBack ni diálogos nativos.

## Estructura y límites

- `src/domain`: entidades, revisiones inmutables, reloj/zona, períodos, estadísticas, reportes y backup.
- `src/infrastructure`: SQLite, migración, cola, restauración por candidato y adaptadores de archivos.
- `src/ui`: pantallas y componentes compartidos entre Web y Android.
- `src/Application.tsx`: integración y navegación; `app`: entradas de Expo Router.
- `tests`: dominio, SQL real, componentes, recorridos Web y volumen.
- `assets`: bytes originales del handoff, conservados sin regenerar.

El backup v1 restaura por reemplazo completo, sin merge. No se admite una versión futura ni se reinicia silenciosamente una base incompatible. La auditoría conserva trazabilidad local; no es una firma forense. El límite de importación es 50 MiB y los límites de entidades son medidas de validación, no una promesa de rendimiento.

## Android

APK público: [Dailoop 0.1.0, compilación 2](https://github.com/iAdamn/Dailoop/releases/download/v1.0/Dailoop-0.1.0.apk), con [guía de instalación y traslado de datos](docs/INSTALL-ANDROID.md). Se probó en emulador Android 17. La prueba inicial del usuario en Samsung S26 Ultra señaló lentitud de navegación y campos tapados por el teclado. La candidata local 0.1.5 incorpora correcciones y mejora medida en el emulador; la [guía 0.1.5](docs/RELEASE-0.1.5.md) identifica su APK ARM64 y los criterios de fluidez/prueba física que siguen pendientes.

Gate abierto por el usuario: «Vamos con el APK». La [guía de compilación local y firma](docs/ANDROID-BUILD.md) explica herramientas, clave privada y actualizaciones; [ANDROID-RELEASE.md](docs/ANDROID-RELEASE.md) registra el binario, pruebas ejecutadas y pendientes. El objetivo p95 de registro menor de 500 ms requiere medición en un dispositivo identificado. La compilación no publica recursos ni datos remotos.

Los documentos de QA conservan referencias a evidencias locales bajo `output/`. Esos logs, capturas, cachés y fixtures exportados no forman parte del repositorio público. La release incluye el APK firmado y su checksum; los recursos Android necesarios para construir la app sí están en `assets/android/`.

## Licencias

El contenido propio se publica bajo [MIT](LICENSE). Las fuentes Outfit y Manrope conservan sus licencias SIL Open Font License en [assets/fonts](assets/fonts). Consulta [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Las dependencias mantienen sus respectivas licencias.
