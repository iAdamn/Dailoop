# Dailoop 0.1.5 — entrega local

Estado: candidata local firmada para prueba física; verificación Web/Android emulado cerrada. No publicada en GitHub ni instalada en un teléfono personal. Paquete `local.dailoop.personal`, versionCode 3. React Native/Expo y las dependencias fijadas se conservan.

La fuente candidata C6 y sus tres variantes están compiladas y verificadas. Se corrigió un modal de edición invisible detectado durante QA: el formulario se muestra desde el primer render y su entrada comienza al aparecer el diálogo nativo. La regresión con texto al 200 %, campo Categoría y cursor sobre Gboard pasó por inspección independiente. Archivos, restauración, reportes, primer inicio offline y bloqueo de rutas internas se comprobaron en el APK C6 exacto para emulador.

## Cambios

- Inicio usa una lista virtualizada. El fondo Android usa tres texturas de la misma paleta en lugar de 180 vistas superpuestas; las tarjetas conservan el tinte y reflejos sobre ese fondo suavizado sin capturarlo de nuevo en cada fotograma. Se conserva el desenfoque de superficies fuertes y se reducen cálculos repetidos en Estadísticas.
- Los formularios ajustan su espacio al teclado y desplazan el campo enfocado a la zona visible. Se mantiene el borrador y la confirmación antes de descartarlo.
- Ajustes permite elegir una, dos, tres o cuatro columnas. Cuatro muestra emoji, última vez y Registrar; el nombre completo sigue accesible y abre el detalle. El ancho o texto ampliado pueden reducir las columnas efectivas sin cambiar la selección guardada.
- El indicador de pestaña, pulsaciones, modales y cambio de densidad tienen movimiento breve. Se respeta el movimiento reducido del sistema, también al cambiarlo durante la sesión. Ninguna animación confirma un registro antes de guardarlo.
- La entrega principal contiene solo ARM64 y usa R8/minificación y reducción de recursos. x86_64 es una variante separada para pruebas en emulador.

La distribución es una preferencia de este dispositivo. Se conserva al restaurar datos, no forma parte del backup v1 ni de la auditoría de actividades. SQLite, el historial, los backups anteriores y el uso offline continúan. Sincronización, login de Google y Flutter no se incorporan en esta versión.

## Actualizar en Android

1. En la versión instalada, guarda un backup desde Ajustes y conserva el JSON fuera de la app.
2. Descarga `Dailoop-0.1.5-arm64.apk` del directorio local `output/releases/v0.1.5/`. Es el archivo para el S26 Ultra; no uses la variante x86_64 del emulador.
3. Abre el APK y acepta **Actualizar**. No desinstales la versión anterior ni borres sus datos. Se conservan el paquete y la firma de 0.1.0.
4. Abre Dailoop, revisa tus actividades y registros, prueba un registro y vuelve a exportar un backup. En Ajustes puedes elegir la distribución.

La app no necesita servidor, cuenta ni conexión. El navegador y Android mantienen bases locales independientes. El backup incluye datos privados e historial y no está cifrado.

## Resultado y límites

El APK principal pesa **35.751.234 bytes (35,75 MB decimales / 34,10 MiB)**, frente a 67.199.497 bytes del anterior: **46,80 % menos**. Cumple tanto la reducción mínima del 30 % como la meta de 40 MB. ARM64 sin R8/reducción de recursos, con la misma fuente, pesa 44.596.671 bytes; estas optimizaciones ahorran otros 8.845.437 bytes (19,83 %). La reducción total también incluye separar las ABI y los cambios de esta versión.

SHA-256 del APK principal:

```text
94ffe4ff7c6a11376c84a2e5b01de8d01cc74e956af4ed9d0dd7a75938d92c29
```

ARM64 final, x86_64 para QA y ARM64 comparador pasan **63/63 inspecciones** cada una: firma, paquete, versiones, ABI explícita, ZIP/alineación, ELF para páginas de 16 KiB, seis fuentes, bundle, permisos, OTA y exclusiones de backup del sistema. El control negativo con expectativa x86_64 rechaza correctamente el APK ARM64 únicamente por ABI. El bundle Hermes coincide en las tres variantes: `a774a652d473a3123666e5b1be83f2ff7a1aed273cf63f7b5da0ee7516d99778`.

El componente mayor son las bibliotecas ARM64: 22.364.144 bytes, sin compresión. Se conserva `extractNativeLibs=false` y `expo.useLegacyPackaging=false`. Forzar el empaquetado legacy para comprimirlas requeriría evaluar otra vez extracción, espacio instalado y arranque; no se presenta como ahorro gratuito. Bundle Hermes y DEX ya se comprimen; R8 conserva las rutas nativas necesarias. Se mantienen locales/polyfills de fechas y Unicode, fuentes y recursos de marca. No se han eliminado funciones ni cambiado el SDK para llegar a la cifra.

La fuente C6 pasa los nueve controles de `npm run verify` y las **19 pruebas Web** finales, sin omisiones ni reintentos. Incluye 37 pruebas de dominio, 19 de almacenamiento, 15 de componentes/contratos, estrés de 10.000 registros, decoder, assets, compatibilidad Expo, tipos y lint. Expo Doctor pasó 21/21 con las mismas dependencias fijadas. Web se prueba en contextos aislados del navegador del usuario.

En Android se actualizó realmente de 0.1.0 vc2 a 0.1.5 sin desinstalar ni borrar datos; esa comprobación corresponde a C3. Sus 101 registros se conservaron exactamente y una intención en la cuadrícula añadió solo un registro. C6 conservó después los 102 registros, revisiones y operaciones completos. Tras descartar la edición, cancelar una restauración y rechazar archivos inválidos/corruptos, otro export SAF de C6 mantiene el mismo estado y digest. Root volvió a calcular hashes y validar los archivos completos, además de revisar el informe de QA.

C6 restauró la copia histórica a sus 101 registros exactos y mantuvo la preferencia de cuatro columnas. El Markdown guardado con el picker nativo coincide byte por byte con el reporte esperado; excluye las dos actividades privadas y las notas según la selección. Compartir abre el selector Android y cancelar vuelve a la app, sin elegir destinatarios. La última copia completa conserva el estado restaurado y su historial. Después de conservar ese backup ficticio se limpió únicamente la app del AVD propio: el primer inicio vacío y offline pasó, con el SHA del APK instalado comprobado. Ambas rutas internas de QA muestran su guarda y no exponen controles; el texto de esa guarda queda bajo el área del sistema, limitación visual conservada.

Se mantienen los FAIL originales de automatización, separados de estas comprobaciones independientes: búsqueda/scroll de Categoría y del reporte, bloqueo de System UI del AVD, fixture corrupto con una fecha también inválida y selector de la guarda interna. El fixture corregido, con solo checksum alterado, sí pasó. No se presentan todos los YAML como PASS ni sus esperas como tiempos de respuesta de la app. QA documenta también la evidencia histórica de teclado y sus límites por candidata, orientación y editor extraído de Gboard.

La inspección del APK no sustituye probar la interfaz en Android. El emulador propio es Android 17 x86_64 a 60 Hz; no certifica ARM64 físico, S26 Ultra ni fluidez de 120 Hz. TalkBack y prueba física quedan pendientes. El peso instalado, RAM y FPS son métricas distintas del tamaño de descarga.

## Rendimiento observado

Comparación de 0.1.0 con la candidata C3 en AVD Android 17, GPU host, 2 cores/2 GiB, 60 Hz declarados, mismos datos ficticios (10 actividades/101 registros) y una columna. C6 conserva el código de Inicio, Estadísticas y materiales medido en C3; solo cambia la entrada/visibilidad del modal. **No se volvió a medir GfxInfo del APK C6 exacto.** Son percentiles de la distribución de dibujo de GfxInfo, no latencia del toque a contenido ni frecuencia presentada en el teléfono. No hubo builds ni Metro de Dailoop concurrentes; la carga global de otros proyectos no estuvo controlada.

| Recorrido | 0.1.0 | C3, movimiento activo | C3, movimiento reducido |
| --- | --- | --- | --- |
| Navegación calentada, p50/p95/p99 | 150/250/250 ms, 20 frames | 26/38/69 ms, 785 frames | 44/81/85 ms, 42 frames |
| Scroll, p50/p95/p99 | 105/133/150 ms, 171 frames | 27/44/85 ms, 499 frames | 27/34/40 ms, 508 frames |

Tras el cambio de tarjetas se observó una mejora grande en este recorrido y el aspecto se revisó en capturas. Las animaciones añaden fotogramas: su porcentaje janky no se interpreta aisladamente. C3 conservó alrededor del 20 % de cuadros janky modernos en el scroll medido y **no acreditó el objetivo de 95 % dentro del presupuesto de 60/120 Hz**. Ese objetivo sigue abierto en esta entrega. La prueba de 120 Hz, el tiempo toque→contenido y el comportamiento físico en S26 Ultra siguen pendientes.

Quitar el desenfoque fuerte no dio otra mejora consistente, por lo que se conservó. Una caché GPU adicional no se envía: el AVD se atascó antes de instalarla y había carga concurrente real del host. Los recorridos funcionales finales usan renderizado software, claramente separado de estas mediciones. Se conservan todos los intentos y límites en QA.

## Validación física pendiente

En el S26 Ultra / Android 17 queda comprobar la actualización ARM64 y el teclado habitual del teléfono. Revisar creación/edición, nota larga, fecha/hora, búsqueda y zona horaria en vertical, horizontal y texto ampliado; la edición debe conservar el texto y mostrar el cursor.

Comprobar las cuatro distribuciones, su persistencia al reabrir y TalkBack con nombres/emoji repetidos. Registrar una intención, revisar su actividad y exportar un backup. La selección de cuatro puede adaptarse a menos columnas con texto grande sin cambiar la preferencia guardada.

Para aceptar la fluidez faltan medidas de toque→contenido (objetivo p95 ≤200 ms), frecuencia efectiva y cuadros presentados en el teléfono con y sin movimiento reducido, primer acceso separado de 20 cambios calentados y scroll. El objetivo de 120 Hz exige un presupuesto aproximado de 8,33 ms y al menos 95 % de cuadros dentro de él. Repetir con volumen de datos representativo: los 10.000 registros del estrés automatizado no equivalen a una medición nativa de scroll con ese volumen. Estos criterios permanecen abiertos; el APK se entrega como candidata para esa prueba.

## Evidencias

- [Plan](PLAN-0.1.5.md), [estado](PROGRESS-0.1.5.md) y [QA independiente](QA-0.1.5.md).
- `output/verification/v0.1.5/`: controles automatizados, inspecciones binarias, comparación de peso, huella de fuentes y pruebas con datos ficticios.
- `output/releases/v0.1.5/`: APK principal, SHA-256, manifiesto y guía de actualización.
- Preview final: `http://localhost:8795/`. Conserva la base existente de ese origen; las pruebas usan contextos aislados.

El tag público `v1.0` sigue correspondiendo a la primera publicación del código y al APK interno 0.1.0 vc2. Esta ejecución no publica otra release ni cambia ese tag.
