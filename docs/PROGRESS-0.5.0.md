# Dailoop 0.5.0 — ajustes del teléfono y preview

Entrega posterior autorizada: [Git y APK 0.5.0](RELEASE-0.5.0.md). Este documento conserva la evidencia y los límites de su checkpoint anterior.

2026-10-14. Versión visible **0.5.0**, próxima compilación Android **6**. Mantener **0.5.0** en todas las correcciones de este lote hasta que sus requisitos sean funcionales y estables. Incrementar solamente `versionCode` al producir cada APK posterior para permitir actualizar la misma instalación y conservar su base. No se ha generado ni publicado un APK 0.5.0 en esta sesión.

## Segundo bloque integrado

Últimos comentarios Flash atendidos: [iconos, rachas, herramientas compactas, creación de actividad desde recordatorio y calendarios gráficos](FLASH-POLISH-0.5.0.md). Evidencia más reciente: 107 pruebas unitarias y 29 E2E, con preview actualizada. Los resultados del bloque principal de abajo se conservan como su checkpoint anterior.

La última solicitud activó recordatorios/rachas y pidió pop de entrada/salida y refracción de agua. Ya están implementados sobre todos los ajustes iniciales: **Registro, Recordatorios, Estadísticas y Ajustes**, Historial dentro de Estadísticas, avisos múltiples locales y rachas por días. [Reglas, migración, aceptación y evidencia](RECORDATORIOS-RACHAS-0.5.0.md). SQLite físico 2; backups v1/v2 compatibles hacia la nueva app. La entrega Android y su estabilidad siguen pendientes, sin APK ni Git en esta tanda.

## Alcance implementado

1. **Audio Android:** `playsInSilentMode:false` bloqueaba `AudioModule.play()` cuando el timbre estaba en vibración/silencio. Ahora Android usa la política de volumen multimedia; iOS conserva su política anterior. También corregido el guard `isLoaded`: Expo Audio 57 Android devuelve false tras `STATE_ENDED`, mientras `currentStatus.isLoaded` conserva true para rebobinar y repetir el sonido. Se invalidan seeks atrasados al cambiar de interacción, salir de la app o desmontar. WAV, volumen, identidad de firma y permisos previos se conservan.
2. **Sugerencias de categoría:** aparecen al enfocar/escribir, permiten reutilizar el nombre almacenado y buscar sin distinguir mayúsculas o acentos; entrada libre conservada. Una categoría por actividad. Hasta ocho opciones visibles, refinables buscando; colocadas encima del input para favorecer visibilidad con teclado.
3. **Aviso:** X disponible junto a Deshacer, cierre automático tras cinco segundos y reinicio del tiempo por cada acción confirmada, incluso con texto idéntico. Cerrar/expirar no modifica el registro. Un aviso nuevo no hereda el Deshacer de otro registro.
4. **Inicio compacto:** Nueva actividad junto a botones de búsqueda y actividades/carpetas; Activas/Archivadas debajo. Categorías fuera de las filas permanentes. El filtro existente se conserva dentro de búsqueda, mediante un diálogo. Búsqueda por nombre o categoría y limpiar filtros.
5. **Carpetas:** categorías con recuento, abrir/cerrar para ver sus actividades y grupo sin categoría; conserva columnas y filtros. El tipo de lista se guarda como preferencia del dispositivo, fuera del historial/backup. El grupo sin asignar tiene nombre accesible y subtítulo distintos de una categoría literal llamada «Sin categoría».
6. **Barra inferior:** el contenido de las pantallas retenidas acompaña proporcionalmente el arrastre. Destino confirmado al soltar; cancelación vuelve al origen. La lente refracta los iconos/letras reales con campo SVG en Web y shader AGSL en Android 13+, conservando legibilidad; sustituye el zoom uniforme inicial. Cada límite cruzado solicita su háptica/tic, incluso con eventos coalescidos, y soltar no lo duplica. Teclado, lector de pantalla, movimiento reducido y taps que interrumpen el ajuste final tienen tratamiento propio. Sólo la barra reconoce el gesto horizontal.
7. **Encabezado:** superficie glass más tenue para logo/nombre/estado local, sombra y transición inferior suaves; queda fijo al hacer scroll del cuerpo.
8. **Android y refresco:** aceleración por hardware explícita en aplicación y actividad. Preferencia de hasta 120 Hz según los modos disponibles de la resolución actual; APIs nuevas protegidas por versión. Se libera la preferencia al perder foco y se conserva la gestión adaptativa del sistema. Es una solicitud al sistema, **no una medición ni garantía de 120 FPS**.
9. **Registro en otra hora:** tres puntos integrados visualmente en Registrar abren el formulario existente de fecha/hora anterior, revisión y confirmación. Targets separados: abrir no registra la hora actual. En 3–4 columnas se apilan dentro del botón para conservar superficies táctiles de 48 px. Se mantiene la ruta desde el detalle.

## Evidencia

- `npm run verify`: **9/9 PASS**, **187 pruebas PASS**: dominio 63, almacenamiento 28, unitarias/integración 94, estrés 1 y decoder 1. Ver `output/verification/v0.5.0/automated/checks.json` y sus logs. Reejecutado después de integrar los cambios.
- `npx playwright test --config playwright.release.config.ts`: **27/27 PASS**, suites de registro/auditoría, backup/restauración, densidades, navegación, offline y 0.5.0, con contextos nuevos. Consultar `output/verification/v0.5.0/full-web-block2-final.log` ; la regresión focal posterior al ajuste final del cache tiene **10/10 PASS** en `focused-web-block2-final.log`/`web-report.json`. No se usa la base personal de la preview.
- `expo prebuild --platform android --no-install --no-clean` y Gradle **`:app:compileReleaseKotlin`**: **PASS**, integración nativa de refresco y manifiesto compilada. Log final `output/verification/v0.5.0/native-compile-block2-final.log`. No se ejecutó assemble/package ni se creó un nuevo APK.
- Audio: regresiones demuestran el bloqueo por política y la imposibilidad de repetir una fuente terminada en la frontera simulada. Mecanismo contrastado con Kotlin instalado de `expo-audio` 57.0.5, `AudioModule.kt` y `AudioPlayer.kt`. La preview no ejecuta ese reproductor Android.
- Conservado el APK 0.1.7: SHA256 `6591c445e26506b4c25914809dd3a24c86facb5f53d9c9f01d3b7c998777504b`.

Durante la comprobación se corrigieron esperas de pruebas que tocaban la barra antes de desaparecer un diálogo y medían un encabezado durante el cambio de densidad. Las medidas CSS redondean a milésimas para no confundir 47.99994 px con un target inferior a 48 px. Los logs iniciales con fallos se conservan junto a los finales; no son la evidencia final de aceptación.

La revisión final corrigió el caso Android ≤33 con modos 60/90/144 Hz: solicita 90 Hz, el mayor anunciado bajo el límite, en vez de descartar una solicitud de 120 no soportada. El plugin reemplaza únicamente su método generado en prebuild incremental; las regresiones comprueban actualización, idempotencia y rechazo de plantillas conflictivas. El prebuild final muestra esa corrección en Kotlin y la compilación final pasa.

Estado del lote: **implementado y verificado en código/preview; aceptación física pendiente**. No declarar 0.5.0 estable por estas pruebas solamente. La huella final está en `output/verification/v0.5.0/source-fingerprint.json`.

## Aceptación nativa pendiente

Tras la autorización expresa para un nuevo APK: compilar con la misma firma, inspeccionar binario y permisos, validar en el emulador asignado **5590** y aceptar en el **S26 Ultra Android 17**. No operar 5580.

- Sonidos de selección y acción repetidos, timbre normal/vibración/silencio con volumen multimedia audible, salida/regreso de la app; multimedia a cero debe seguir en silencio.
- Háptica al cruzar límites arrastrando, lupa y seguimiento de pantallas, cancelación/taps rápidos y lector de pantalla.
- Scroll y frame pacing real con datos representativos, frecuencia concedida por Android, temperatura/ahorro de energía y texto ampliado. No inferir FPS del teléfono a partir del navegador o del éxito de compilar Kotlin.
- Teclado y visibilidad de las sugerencias de categoría, carpetas y registro anterior en 1–4 columnas.

El segundo bloque añade migración física SQLite 1→2 y planificación append-only; conserva auditoría y backups v1, usa v2 cuando hay planificación. Avisos Android opcionales añaden POST_NOTIFICATIONS/RECEIVE_BOOT_COMPLETED; el manifiesto sigue sin INTERNET. `homeListMode` permanece en preferencias independientes. Sin cuenta, sync ni telemetría. Git y APK requieren una nueva instrucción explícita del usuario.

## Recordatorios y rachas

El documento de [ideas iniciales](IDEAS-RECORDATORIOS-RACHAS.md) se conserva como histórico. El usuario activó su ejecución; [este contrato](RECORDATORIOS-RACHAS-0.5.0.md) recoge el comportamiento implementado, pruebas y aceptación física de permisos, recepción/reinicio y rachas todavía pendiente. No asignar otra versión mientras 0.5.0 no esté aceptada como estable.

## Fuentes del ajuste Android

- [Aceleración por hardware](https://developer.android.com/topic/performance/hardware-accel): Android ya la habilita por defecto en este target; declararla no demuestra una mejora de FPS.
- [Preferencia de refresco de la ventana](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#preferredRefreshRate).
- [Refresco adaptativo](https://developer.android.com/develop/ui/views/animations/adaptive-refresh-rate): las preferencias son votos; se mantiene la política del sistema.
- [Audio Expo](https://docs.expo.dev/versions/latest/sdk/audio/): política de silencio y reinicio explícito para repetir sonidos. El diagnóstico específico usa la versión fijada localmente.
