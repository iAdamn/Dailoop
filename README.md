# Dailoop

Código abierto de **Dailoop**, una app personal de registros cotidianos, sin cuenta ni servidor de datos. React Native/Expo, TypeScript y SQLite, con interfaz glass y preview en navegador.

**Dailoop 1.0** es la primera publicación del repositorio. El APK incluido conserva la versión interna **Dailoop 0.1.0, compilación 2**; publicar el código no modifica el binario ya probado.

[Descargar APK](https://github.com/iAdamn/Dailoop/releases/download/v1.0/Dailoop-0.1.0.apk) · [Primera versión](https://github.com/iAdamn/Dailoop/releases/tag/v1.0) · [Instalación Android](docs/INSTALL-ANDROID.md) · [Detalles pendientes reportados en teléfono](docs/DEVICE-FEEDBACK.md)

## Probar la preview

La preview estable se sirve en **http://localhost:8795**; la de desarrollo, en **http://localhost:8793**. Son orígenes distintos y mantienen bases distintas. Usar Edge o Chromium con Web Locks y aislamiento COOP/COEP.

1. Abre la preview. Puedes crear tu primera actividad o ir a **Ajustes → Explorar con datos de demostración**.
2. Pulsa **Registrar** varias veces. En Historial, abre un registro para corregirlo, anularlo y consultar sus versiones anteriores.
3. En Estadísticas, cambia día/semana/mes o elige fechas históricas. Genera un reporte y revisa la selección antes de guardar Markdown.
4. En Ajustes, exporta un backup. Puedes inspeccionarlo, cancelar o confirmar la restauración completa. Incluye datos privados y todas las revisiones; el archivo no está cifrado.
5. Prueba claro/oscuro y recarga. La demostración tiene su propia base; reiniciarla no afecta a tus datos personales.

Los datos son locales de ese navegador y origen. No se sincronizan con Android. Borrar datos del sitio puede eliminarlos: conserva backups manuales. Una segunda pestaña permite consultar y recibe actualizaciones; para escribir, usa la primera o ciérrala y recarga la segunda. El servidor local debe estar disponible para cargar la preview; no es una PWA con arranque Web offline.

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

No se necesitan variables de entorno, tokens, servicios de base de datos ni credenciales. `.env*`, claves de firma, dependencias, builds nativos y cachés están excluidos de Git.

## Verificar

```powershell
npm run typecheck
npm run lint
npm run test:domain
npm run test:storage
npm run test:unit -- --watch=false
npx tsx --test tests/stress.test.ts
npm run check:expo
npx expo-doctor
npm run test:e2e
```

Los E2E requieren ambas previews abiertas: desarrollo 8793 para contratos/rutas de QA y exportación 8795 para la sesión offline. Un worker y contextos aislados evitan mezclar bases de pruebas con las del usuario. Playwright usa el navegador Chromium disponible o Edge local. Los fixtures son ficticios. Las rutas `__spike` y `__storage-tests` sólo funcionan en desarrollo; no son funciones de la app personal.

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

APK firmado para instalar y probar: [Dailoop 0.1.0, compilación 2](https://github.com/iAdamn/Dailoop/releases/download/v1.0/Dailoop-0.1.0.apk), con [guía de instalación y traslado de datos](docs/INSTALL-ANDROID.md). Se probó en emulador Android 17. La prueba inicial del usuario en Samsung S26 Ultra señala lentitud de navegación y campos tapados por el teclado; esos detalles están documentados y pendientes de corrección.

Gate abierto por el usuario: «Vamos con el APK». La [guía de compilación local y firma](docs/ANDROID-BUILD.md) explica herramientas, clave privada y actualizaciones; [ANDROID-RELEASE.md](docs/ANDROID-RELEASE.md) registra el binario, pruebas ejecutadas y pendientes. El objetivo p95 de registro menor de 500 ms requiere medición en un dispositivo identificado. La compilación no publica recursos ni datos remotos.

Los documentos de QA conservan referencias a evidencias locales bajo `output/`. Esos logs, capturas, cachés y fixtures exportados no forman parte del repositorio público. La release incluye el APK firmado y su checksum; los recursos Android necesarios para construir la app sí están en `assets/android/`.

## Licencias

El contenido propio se publica bajo [MIT](LICENSE). Las fuentes Outfit y Manrope conservan sus licencias SIL Open Font License en [assets/fonts](assets/fonts). Consulta [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Las dependencias mantienen sus respectivas licencias.
