# Dailoop 0.1.5 — verificación independiente

Fecha de inicio/cierre: 2026-10-13, America/Bogota. Responsable: subagente QA. **Verificación cerrada de C6 como candidata para prueba física**, con fuente y APK exactos. C3 permanece retirada. Web19/19 PASS; funcional nativo, conservación/restore/reportes y primer arranque offline C6 PASS dentro del entorno descrito. Los FAIL de automatización siguen preservados y separados de comprobaciones independientes. El objetivo completo de fluidez/latencia/120Hz físicos **no está acreditado**. Resumen mecánico: `output/verification/v0.1.5/qa/final-qa-summary.json`.

## Contrato y entorno

- Alcance: PF-01 fluidez, PF-02 teclado, PF-03 columnas, PF-04 movimiento, PF-05 peso; datos y compatibilidad como regresión transversal.
- Baseline: `output/releases/Dailoop-0.1.0.apk`, SHA-256 `d6ada37edd720ff1b5cf5198d6b3ed34e861835585e5e307fccdc10a8efac3c8`, versionCode 2.
- Destino inicial: `Dailoop_API_37`/`emulator-5580`, Android17/API37 x86_64, GPU host, 2 GiB/2cores; actualmente **intocable** por control externo. El cierre usa únicamente el AVD nuevo `Dailoop015_Final_API37`/`emulator-5590`, GPU software y datos ficticios; no se compara su rendimiento con GPU host.
- El AVD declara 60 Hz; sus resultados no certifican 120 Hz ni el S26 Ultra físico. No se instala ni se manipula un teléfono personal. No se toca `Dailoop-Flutter`.
- Evidencias nuevas bajo `output/verification/v0.1.5/qa/`. Se conservan originales y fallos históricos.
- El responsable no ejecuta builds/Metro de Dailoop en paralelo a mediciones de fluidez. No se controló toda la actividad de otros proyectos ni del usuario; las medidas conservan ese límite de host. Maestro incorpora esperas de estabilidad y transporte: la duración de un paso Maestro no equivale a latencia de producto.
- Las menciones históricas a host «sin builds/Metro» se refieren solo a procesos de Dailoop observados/coordinados. No afirman exclusividad global del ordenador. Las capturas software pueden preceder al XML y mostrar texto anterior; se documenta esa diferencia y no se usa para medir latencia.

## Matriz de aceptación

| ID | Riesgo o requisito | Evidencia observable | Estado |
| --- | --- | --- | --- |
| QA-01 | Teclado cubre input/cursor | Teclado real; campo bajo formulario y nota larga; vertical/horizontal y texto 200 % | PASS en casos observados: Categoría C6 vertical200/caret; nota/fecha/hora/búsqueda/zona C3 vertical100; Categoría/nota C4 horizontal200 vía editor Gboard. Matriz física/Samsung y combinaciones no ejecutadas PENDIENTES |
| QA-02 | Cambios Inicio ↔ Estadísticas | Primer acceso separado y 20 cambios calentados; trazas de cuadros y medidas con límites explícitos | Baseline GfxInfo capturado; latencia tap→contenido pendiente |
| QA-03 | Scroll a tirones | Recorrido controlado repetible, frecuencia efectiva y distribución de frames | Mejora Gfx C3 p95 133→44 ms; Home/material conservados en C6. C6 no tiene nueva pasada Gfx. Objetivo95 %/120Hz físico NO ACREDITADO |
| QA-04 | Distribución solicitada | Opciones 1/2/3/4, tarjetas identificables, control >=48 dp, adaptación por ancho/fontScale | Contrato/Web y nativo C3 PASS; adaptación200 %4→2 PASS. Preferencia4 conservada en C6 |
| QA-05 | Preferencia local | Reinicio conserva selección, valores inválidos recuperan default, error de escritura no anuncia éxito | Store controlado/Web PASS; SQLite nativa C3 reapertura y C6 upgrade PASS |
| QA-06 | Registrar en cuadrícula | Identidad correcta con emojis repetidos/nombres largos, un registro por intención, éxito tras commit | Web PASS; SAF nativo C3 un append exacto PASS y conservado C6 |
| QA-07 | Movimiento y accesibilidad | Activo/reducido dinámico, navegación interrumpible, sin bucles, sin duplicados | C3 modal200 % FAIL; **C6 funcional independiente PASS**. YAML07 FAIL búsqueda preservado. Activo/reducido dinámico C3/Web PASS |
| QA-08 | Peso | ABI ARM64 explícita, bytes/desglose, >=30 % reducción y meta 40 MB evaluada | PASS APK C6 ARM6435.751.234B,−46,798 % vs dualABIvc2; R8−19,834 % vs mismoABI/fuente sin optimizar. Inspección root63/63 por variante; peso instalado/RAM PENDIENTES |
| QA-09 | Actualización | vc2 → 0.1.5 misma firma sin desinstalar/borrar; payload auditado conservado | PASS cadena vc2→C2→C3 y nuevoAVD import102→upgradeC6, pretest/cancel-corrupt102exactos y restorehistórico101exacto; revisión independiente root5/5 |
| QA-10 | Backup/restore/reportes | Backup histórico importable, cancel/corrupto no cambia datos, export validado y privados excluidos | PASS C6 cancel/rechazo/checksum + SAF sin mutación102; restore101exacto; Markdown SAF2107B exactodominio,2privadas/notas excluidas; sharing chooser/cancel sin destinatarios |
| QA-11 | Identidad y release | Assets/fuentes/colores, offline, permisos, rutas privadas bloqueadas, firma y 16 KiB | PASS Web19/C6freshOffline y noexposiciónQA en ambosdeeplinks. FAIL histórico14 preservado: guardefectivo pero labely0 bajoáreadesistema. AspectodarkC6 PASSindependiente trasANRSystemUI recuperada |
| QA-12 | S26 Ultra / 120 Hz | Trazas y recorridos en teléfono físico autorizado | PENDIENTE físico |

## Preparación

Se leyó AGENTS.md, PLAN-0.1.5.md, PROGRESS-0.1.5.md y la evidencia nativa previa. El hash del APK baseline coincide. Primera orden de arranque no creó proceso porque faltaba la unidad S: de la sesión anterior; se restableció únicamente el alias documentado S: → `C:\!Codex\Dayloop` y se volvió a arrancar el AVD propio. Los parámetros y stdout/stderr se guardan en `baseline-emulator-*`.

No se cambia producción, configuración ni tests existentes desde QA. Los resultados se actualizarán solo tras inspeccionar la evidencia ejecutada.

## CP0 — resultados directos

Se generaron fixtures deterministas nuevos (`tests/fixtures/v015.ts`) de 10 actividades/100 registros, 10/10.000 y 100/10.000. Todos pasaron validación estricta, exportación y parseo de backup histórico 0.1.0. Hay privadas, notas ficticias, emojis repetidos y un nombre largo. Manifiesto/hash en `qa/fixture-manifest.json`.

El fixture pequeño se restauró por el picker SAF real. Durante el diagnóstico un tap ADB manual sobre una coordenada supuesta de Nueva actividad registró por error una intención en Actividad QA 009; se conserva el resultado ficticio y se declara: las medidas siguientes usan **10 actividades, 101 registros, 101 revisiones, 111 operaciones**. No es información personal ni un defecto de idempotencia. El backup real preactualización se exportó por SAF y pasó `parseBackup`: `native-pre-upgrade-vc2.json`, SHA-256 `9b7d597502fb67d0bef3b51292e9e1615862d592fc7c12a3b697450958f6628f`, digest de payload `9ba248e37bbbf6465c846fc57a05898cac7bbe81320610fca07c63ed59957362`.

**PF-02 reproducido:** con Categoría enfocada y texto escrito, `baseline-category-ime-r3.xml` expone el EditText enfocado en y=2379..2541; Gboard visible empieza aproximadamente en y=1984. La captura `baseline-keyboard-category-r3/**/02-category-keyboard-open.png` muestra el principio del formulario y teclado, con Categoría/cursor completamente ocultos. JUnit PASS aquí solo significa que el recorrido automatizado logró escribir y capturar: el requisito de visibilidad **falla**. El borrador se descartó sin guardar.

Los dos primeros intentos de teclado fallaron por automatización: `hideKeyboard` se disparó antes de asegurar IME y cerró el modal; se preservan `baseline-keyboard-category` y `-r2`. El tercer recorrido introduce enfoque/escritura y título explícitos antes de ocultar el teclado inicial. No se convierten las repeticiones fallidas en PASS retrospectivos.

Medición reproducible: `qa/measure-gfx.ps1 -Label baseline-vc2`; GPU host NVIDIA 3080 Ti, 1344×2992/480 dpi, Android 17 x86_64, 2 GiB/2 cores, 60,000004 Hz declarados, avión activado y datos/Wi-Fi apagados. Sin builds concurrentes de Dailoop observados; carga global ajena no controlada.

| Recorrido | Frames | Janky | p50 / p95 / p99 del histograma Android |
| --- | ---: | ---: | --- |
| Primer acceso a Estadísticas de un proceso recién abierto | 1 | 100 % | 150 / 150 / 150 ms |
| 20 cambios Inicio ↔ Estadísticas calentados | 20 | 100 % | 150 / 250 / 250 ms |
| 16 swipes controlados (8 hacia abajo, 8 arriba) | 171 | 96,49 % | 105 / 133 / 150 ms |

Estos son buckets descriptivos de **tiempo de dibujo de GfxInfo**, no latencia desde el tap a contenido útil, ni FPS físicos. Las cifras GPU del emulador incluyen el bucket 4950 ms y no se usan para inferir coste GPU real. Los CSV de `framestats` originales se conservan para comparativa en el mismo entorno. `baseline-vc2-lastanr.txt`: ningún ANR desde este boot. El S26/120 Hz sigue pendiente.

Al cerrar CP0 se exportó el payload exacto y se apagó únicamente `emulator-5580`, manteniendo sus datos para actualización sin desinstalar. Evidencia `baseline-emulator-stop.txt` y `baseline-devices-after-stop.txt`.

## Pruebas de contratos disponibles

- `tests/layout-v015.test.ts`: 3/3 PASS en `qa/layout-unit.txt`; cuatro densidades a ancho normal, adaptación 200 %/estrecha y etiquetas de última vez en límites de unidades.
- `tests/preferences-v015.test.tsx`: 4/4 PASS sin warnings en `qa/preferences-unit-r4.txt`; default/valores inválidos, publicación tras commit, lectura desde store nuevo, fallo conservando selección, cola no envenenada y orden de escrituras. La SQLite aquí se sustituye por un puerto controlado: persistencia nativa real todavía pendiente de candidata.
- Intento r3 de esos tests falló por `import()` no compatible con Jest sin módulos VM; se corrigió a aislamiento y `jest.requireActual`, sin cambiar flags ni ocultar warnings. Evidencias previas conservadas.

## Hallazgo de revisión resuelto pendiente de ejecución

Se detectó que animar cierre antes de la confirmación de formulario sucio podía dejar el descarte invisible. El responsable añadió `canClose` a ModalFrame/useModalMotion y lo conectó a ambos formularios. Se verificará el comportamiento real de cerrar → seguir editando → volver a cerrar → descartar, con movimiento activo y reducido.

## CP1–3 — controles automatizados Web y contratos

- `tests/motion-v015.test.tsx`: 2/2 PASS en `motion-unit-r3.txt`; preferencia inicial, callback de cambio durante sesión, retirada de suscripción y fallback sin animación si el sistema no responde. Los mocks iniciales pasaban runtime pero no TypeScript por la sobrecarga de `AccessibilityInfo`/suscripción incompleta; se sustituyeron por spy sobre suscripción real del preset. Un intento de emitir evento nativo directamente falló porque el preset no enlaza ese emisor; se conserva `motion-unit-r2.txt`. La última prueba invoca el callback booleano realmente suscrito, no demuestra el puente Android por sí sola.
- `npx tsc --noEmit` y lint de los cinco archivos nuevos: PASS en `typecheck-new-tests-r2.txt`/`lint-new-tests.txt` (salida vacía, exit 0 observado).
- Export final servido en `http://localhost:8795`, contextos Edge aislados de la base del usuario. `tests/v015.spec.ts`: **3/3 PASS, 11,2 s**, `web-v015.txt`: cuatro columnas por coordenadas y tamaños de controles, nombres accesibles con emoji repetido, registro al ID correcto, reapertura conserva preferencia, restore 0.1.0 mantiene preferencia y payload original, backup nuevo declara 0.1.5 y no añade campos al dataset, adaptación al ancho, valor inválido y quota con selección previa conservada, descarte/reanudar/descarte en movimiento activo/reducido/cambio dinámico. No hubo errores JS sin capturar. Capturas `web-v015/**/density-1..4.png`; densidad 4 inspeccionada visualmente.
- Regresión existente `app.spec.ts` + `offline.spec.ts` en export: **9/9 PASS, 38,9 s**, `web-regression-report.json` y `web-regression.txt`. Cubre auditoría/corrección/anulación/restauración, identidad al editar/archivar, privacidad y Markdown exacto, cancelación/corrupción/restore, propiedad entre pestañas, demo separada, fuentes, claro/oscuro/360–1280 px, simulación de texto 200 % y flujo sin red. Estas pruebas Web no prueban el teclado nativo ni 120 Hz.

### Fallos dev y repetición pendiente

Lote dev 8793 (`decoder`, `spike`, `storage`) interrumpido tras tres timeouts, con artefactos conservados en `web-storage/` y `web-storage.txt`. El primer trace registra HTTP 200 de entry.bundle tras **58.020 ms** y el worker SQLite todavía pendiente cuando venció el test; en el siguiente entry.bundle aún no había respondido al corte. El responsable observó bundling frío de entry/worker en stdout, mientras compilaba Android. Se clasifica **INCONCLUSO/entorno**, no PASS ni fallo SQLite demostrado. Se repetirán los tests pertinentes tras terminar build y comprobar Metro estable. Los servidores no fueron reiniciados ni detenidos por QA.

La navegación animada añade cuadros respecto a vc2. Una reducción de porcentaje janky puede quedar diluida por esos cuadros nuevos; la comparativa final conservará p95/p99, scroll y pasada con movimiento reducido. El tiempo de dibujo no sustituye el criterio tap→contenido útil.

### Cierre durante operación y error — regresión que detectó el defecto

Un cuarto test nuevo de `v015.spec.ts` mantiene pendiente la generación de checksum del backup, pulsa X durante la operación y provoca un error controlado. La primera exportación 0.1.5 falló: el título/error permanecían con un ancestro de opacidad inferior a 0,9 y el contexto de diálogo se perdía. Evidencias `web-busy-modal/`, screenshot/trace e informe `web-busy-modal-report.json`. El defecto estaba en los tres ModalFrame de Settings que rechazaban onClose durante `busy` pero no indicaban `canClose={!busy}`.

El responsable añadió las tres guardas y regeneró la exportación. El mismo test, sin cambiar el criterio ni el fallo inyectado, pasó **1/1, 2,4 s** (`web-busy-modal-fixed-report.json`, export entry `entry-e283625989171412fae3fc23a099bd5a.js`). La confirmación global y los formularios ya tenían sus guardas. No se introdujo fallback genérico de cierre.

Tras reiniciar dev con exclusión de árboles generados, un lote iniciado antes del warmup explícito se cortó tras tres timeouts. El warmup separado (`dev-warmup.json`) consiguió READY sin errores JS en 49,6 s: entry 33.316 ms, worker 5.984 ms, WASM 2.744 ms. Sin embargo, el siguiente lote, durante export/build, volvió a tardar 48.151 ms solo en entry y cortó antes del worker. Se preserva `web-storage-warm2/` y se pospone otra repetición a host/fuente estables. La causa exclusiva no está establecida; no se cuenta como PASS ni se atribuye a los datos de SQLite.

## Candidata 2 — actualización y teclado nativo

Se arrancó el mismo AVD conservando datos. `native-package-before-upgrade.txt` confirma 0.1.0/vc2. `adb -s emulator-5580 install -r` instaló la candidata x86_64 optimizada2, SHA `c0a217f843aea6ff859aa7ad8a8d41ca70eed470abe87ae50bbdd362a97bd349`; `native-package-after-upgrade.txt` confirma 0.1.5/vc3, sin uninstall/clear. App offline.

Export SAF real posterior: `native-post-upgrade-vc3.json`; `native-upgrade-exact-comparison.json` **PASS** tras parseo estricto y deep equality de cada campo de DomainState. Se conservan las 10 actividades, 101 registros, 101 revisiones y 111 operaciones. AppVersion exportado cambia correctamente de 0.1.0 a 0.1.5; digest idéntico `9ba248e37bbbf6465c846fc57a05898cac7bbe81320610fca07c63ed59957362`.

Categoría con IME real: **PASS en candidata2**, `native-category-fixed-r2` y `native-category-focused.xml`. Campo enfocado y=1666..1828, teclado comienza en y=1984 (`native-category-window.txt`). Captura inspeccionada: texto y cursor se ven por completo. El primer intento post-SAF falló porque el flujo no relanzaba la app después de `stopApp`; test corregido y fallo original preservado. Borrador descartado sin cambio de datos.

Un warmup dev separado posterior también obtuvo READY sin errores, pero los tests decoder/spike siguieron con timeout aun sin build. El lote se interrumpió tras dos fallos; `web-storage-stable/` queda **INCONCLUSO**, sin adjudicar causa exclusiva. Root detuvo sus procesos dev antes de las medidas siguientes. No se repitió automáticamente otra vez la misma condición.

## Candidata 2 — rendimiento no aceptado y experimento siguiente

Se midió con host sin builds/Metro/testsuite, mismo AVD, fixture 10/101, una columna, texto 100 % y sistema claro. Normal: transición 1.0; reducido: únicamente transición 0; animator_duration_scale=null y window_animation_scale=1.0. Al acabar se restauró transición 1.0. Comparativa y hashes en `gfx-candidate2-comparison.json`; método y CSV originales preservados.

| Recorrido vc3 | Frames / janky | p50 / p95 / p99 (buckets ms) |
| --- | --- | --- |
| Primer Stats, activo | 37 / 5,41 % | 26 / 73 / 101 |
| 20 cambios, activo | 584 / 28,94 % | 28 / 85 / 117 |
| Scroll, activo | 201 / 97,01 % | 97 / 121 / 129 |
| Primer Stats, reducido | 2 / 100 % | 109 / 109 / 109 |
| 20 cambios, reducido | 40 / 87,50 % | 65 / 101 / 113 |
| Scroll, reducido | 169 / 100 % | 109 / 150 / 150 |

**PF-01 no se acepta con esta candidata.** El p95 de scroll activo mejora solo aproximadamente 9 % frente a 133 ms de vc2; la pasada reducida no mejora. No se ha probado el presupuesto de 120 Hz físico. Los CSV recientes tienen 0 % de `FrameCompleted−IntendedVsync` dentro de 16,67 ms, con límite de 120 cuadros por ventana; esa resta incluye cola y planificación, por lo que no equivale a tiempo de trabajo ni a FPS presentados. `DisplayPresentTime=0` impide calcular FPS presentados en este emulador. Se conservan tanto jank moderno como legacy y deadlines Android. No se usa la menor proporción janky de navegación para ocultar los cuadros añadidos por la animación. Tap→contenido útil sigue PENDIENTE.

Se capturó `candidate2-regular-blur-home.png` como referencia visual. No hubo ANR desde boot. Datos 10/101 y preferencia 1 permanecen intactos. El AVD se apagó y `candidate2-devices-stopped.txt` confirma lista vacía. Root prepara un experimento de una variable: omitir BlurView vivo de las capas Android regulares sobre el fondo ya suavizado, conservando las demás capas y blur strong. No se entrega la candidata 2 como si hubiera resuelto la fluidez.

## Experimentos nativos 3 y 4 — mejora y comparación controlada

Candidata3 x86_64, SHA `cdab204f159636fbf0935d5f6ca24d770d124c1d7e34fac3f3e613275f4d4e95`, 36.229.165 B: el responsable sustituyó únicamente el blur vivo de vidrio regular Android por el fill/tint equivalente, preservando las demás capas y el blur strong. Instalada con `-r`, mismo fixture 10/101, columna 1, 100 % de texto, 60 Hz declarados y sin builds/Metro concurrentes.

| Candidata / recorrido | Frames / janky moderno | p50 / p95 / p99 (buckets ms) |
| --- | --- | --- |
| 3, primer Stats activo | 39 / 2,56 % | 30 / 42 / 85 |
| 3, 20 cambios activos | 785 / 4,71 % | 26 / 38 / 69 |
| 3, scroll activo | 499 / 20,24 % | 27 / 44 / 85 |
| 3, primer Stats reducido | 3 / 100 % | 38 / 73 / 73 |
| 3, 20 cambios reducidos | 42 / 85,71 % | 44 / 81 / 85 |
| 3, scroll reducido | 508 / 19,88 % | 27 / 34 / 40 |
| 4, primer Stats activo confirmado | 37 / 13,51 % | 32 / 48 / 65 |
| 4, 20 cambios activos confirmados | 758 / 9,37 % | 30 / 53 / 69 |
| 4, scroll activo confirmado | 414 / 26,81 % | 32 / 48 / 73 |
| 4, primer Stats reducido | 2 / 100 % | 61 / 61 / 61 |
| 4, 20 cambios reducidos | 40 / 75,00 % | 48 / 73 / 117 |
| 4, scroll reducido | 427 / 25,06 % | 30 / 42 / 53 |

Los valores originales y hashes están en `qa/gfx-comparison-through-candidate4.json`; prevalecen sobre esta tabla si se detecta una transcripción errónea. La candidata3 reduce p95 de scroll activo de 133 a 44 ms frente a vc2, aproximadamente 67 %, y reduce jank moderno de 96,49 % a 20,24 %. La mejora de este recorrido en el mismo emulador es real; no certifica 60/120 FPS, latencia tap→contenido, desempeño Samsung ni grandes volúmenes. El subconjunto reciente puede cumplir aproximadamente 95 % de deadlines mientras el histograma agregado conserva 20 % de jank: no se sustituye el agregado por ese subconjunto.

La candidata4 sustituyó además el blur strong por fill/tint65. SHA `0d3a81032663189bf4faae8b2dea13ffe275422f3fe0c1b6bf076e15252ffc3b`, 36.229.149 B. Su primera pasada con nombre `candidate4-vc3-active` quedó **AMBIGUA** porque no capturaba escalas al comienzo y sus 40 frames de navegación sugieren movimiento reducido heredado. Se conserva sin usarla como medición activa. Se repitió como `candidate4-vc3-active-confirmed`, capturando transición 1.0, font_scale 1 y user_rotation 0 antes de la medida. La repetición no demostró mejora frente a candidata3; el responsable decidió recuperar strong blur de 3 para el siguiente experimento. La variabilidad del AVD y una sola repetición no permiten atribuir causalidad exacta a cada diferencia pequeña.

Capturas Home de 2 y 3 inspeccionadas: mantienen paleta, brillos, degradados y volumen de tarjetas. Captura 4 preservada. Ningún ANR reportado en estas pasadas. Tras cada experimento se apagó el AVD para los builds siguientes, sin limpiar datos ni cambiar columna. Preferencia de movimiento reducido usa `Settings.Global.TRANSITION_ANIMATION_SCALE` observada por RN; se restauró a 1.0. Una restauración justo antes del cierre puede no persistir a tiempo en SettingsProvider: por eso la pasada confirmada captura el valor efectivo al inicio y todas las siguientes lo harán.

## Teclado horizontal con texto 200 % en candidata4

`native-candidate4-landscape200-category`: **1/1 flow PASS, 46 s**. Gboard usa su editor extraído de pantalla completa y muestra `Categoria visible QA` y caret al escribir. El campo original conserva bounds `[755,945][2237,1138]`, pero la edición visible se realiza en la interfaz del IME. Esto satisface poder ver lo escrito en este entorno; no demuestra que el formulario original permanezca encima del teclado ni valida otro IME. Evidencias `native-candidate4-landscape200-category-focused.png/xml`, `-window.txt` y `-ime.txt`.

`native-candidate4-landscape200-note`: **1/1 flow PASS, 1 min 13 s**. Nota larga con cinco etiquetas de línea, envuelta en varias líneas; captura final muestra `FIN VISIBLE DE QA` al final del editor extraído. La automatización de `inputText` no prueba saltos de línea explícitos del teclado, pendiente de la pasada final en vertical. El dump XML adicional no consiguió estado idle; se conserva el screenshot real y dumpsys IME/window, sin inventar bounds. Nota descartada; screenshot `native-candidate4-landscape200-discard-current.png` muestra 10 registros vigentes de QA002. El flujo de retorno falló únicamente al buscar Volver fuera del viewport; se añadió scroll al test, sin modificar producto ni repetirlo como PASS. Tras el descarte se restauraron font_scale=1.0, user_rotation=0 y transición=1.0, y se apagó el AVD. `candidate4-devices-stopped.txt` confirma adb vacío. Dataset 10/101 y columna 1 preservados.

## Experimento5 inconcluso y selección de fuente

El responsable preparó una quinta candidata con cache GPU temporal de tarjetas durante drag/momentum. El AVD no completó el boot **antes de instalar ese APK**: zygote64 quedó en preload/estado D, sin system_server ni servicio activity. Se conservan `candidate5-boot-logcat-full.txt` y `candidate5-boot-ps.txt`. Un intento de reboot ADB quedó bloqueado sin reiniciar (mismo uptime/PID); se canceló solo ese comando y se apagó el AVD con `emu kill`. `candidate5-stalled-boot-devices.txt` confirma adb vacío. No se limpió userdata ni se instaló C5.

Además, una muestra del host encontró carga concurrente del usuario: GenshinImpact acumuló aproximadamente 4,36 s de CPU en una ventana de 2 s, GPU global 43 % y 5840/12288 MiB (`candidate5-host-contention.json`, `candidate5-host-gpu-before.csv`). No se tocó ese programa. No se atribuye el bloqueo al APK, ni se pretende comparar diferencias pequeñas de rendimiento bajo esta carga.

El responsable **descarta el envío del cache experimental5 por evidencia insuficiente** y selecciona el material de candidata3 con strong blur, Home sin cache. C4 no demostró ventaja; no se presenta como shipping. La próxima compilación ARM64/export debe usar esa fuente. Las medidas C3 siguen describiendo únicamente su entorno observado; esta muestra posterior no establece cuánta carga ajena había en pasadas anteriores. Si fuera necesario usar GPU software para recuperar el AVD, solo se usaría para funcional, con entorno explícito y sin comparar FPS/Gfx con GPU host.

## Revalidación Web de la fuente final3

Fuente de 73 inputs SHA `0b660cc11b6ee1ec64efb8199022a9361711aef69a2eed34235de9bdeeb0c4da`, sin cache experimental; export de producción entry `entry-679f2581d061735cd745578115c6f8a6.js` en 8795. `app.spec.ts` + `offline.spec.ts` + los cuatro tests `v015.spec.ts`: **13/13 PASS, 56,4 s**. Artefactos `web-final-static/`, `web-final-static-report.json` y `.txt`. Incluye nuevamente el error de export tras cierre ocupado, descartes con movimiento, geometría/identidad/persistencia/restauración de columnas, auditabilidad, reportes privados, offline y adaptación Web. Los contextos son aislados de la base del usuario.

Para aislar los timeouts de HTTP/bundling Metro, el responsable generó con Expo la exportación **de desarrollo admitida por el CLI** (`--dev`), servida localmente en 8793. Probe independiente `dev-export-probe.json`: `/__spike` y `/__storage-tests` HTTP200, botones QA naturales, `globalThis.__DEV__=true`, `crossOriginIsolated=true`, COOP `same-origin` y COEP `require-corp`; sin errores JS. No se añadieron overrides de rutas ni mocks del almacenamiento.

`decoder.spec.ts` + `spike.spec.ts` + `storage.spec.ts` originales, sin cambiar timeout: **6/6 PASS, 12,4 s**, `web-final-dev-export-report.json`, `web-final-dev-export/` y `.txt`. SQLite/WASM real confirmó commit, rollback, reapertura, persistencia, idempotencia, revisión auditada, reparación de proyección, bloqueo tras doble fallo de escritura y recuperación de documento muerto durante restore prepared/activated. El nombre original del test decoder menciona Metro: esta pasada se ejecutó sobre la exportación `--dev`, no sobre el servidor HTTP Metro. Sus fallos previos se conservan **INCONCLUSOS** como problema de tooling/entorno no resuelto; no son PASS retrospectivos ni un defecto SQLite probado.

## Cierre funcional nativo de fuente3 — entorno y columnas

El mismo AVD/data se recuperó en unos 30 s con `-gpu software`; metadata `native-final-functional-emulator-launch.json`. Esta pasada sirve únicamente para funcional. No se comparan sus tiempos/Gfx/FPS con GPU host. Se instaló `-r` el binario x86_64 de candidata3 SHA `cdab204f159636fbf0935d5f6ca24d770d124c1d7e34fac3f3e613275f4d4e95`; Success y 0.1.5/vc3 en `native-final-install-r.txt`/`native-final-package.txt`. Fuente3 coincide con la seleccionada para ARM64, según freeze del responsable. Android17, fuente1, orientación0, transición1.0 y avión/Wi-Fi/datos desconectados.

Antes de modificar cuadrícula, nuevo SAF real `native-final-before-grid.json`, SHA `41866e4387a9cd1d6c1e7a2f263a8c3bcd5fa4b6fe41f11f69abd3ba39dcf34e`. `native-final-source3-exact-comparison.json`: **PASS**, parseo estricto/checksum más deepEqual de todo DomainState/digest/counts frente al backup vc2. Conservaron 10 actividades/101 registros/111 operaciones; appVersion es 0.1.5.

`native-final-columns`: **1/1 flow PASS, 1 min 51 s**. Capturó 1/2/3/4 columnas, registró QA002 una vez y comprobó 11 registros en su detalle; stop/reopen conservó cuatro. `native-final-settings-after-reopen.xml` confirma `4 columnas` checked=true, screenshot inspeccionado. Un screenshot intermedio tomó el indicador de pestaña en transición; tras estabilizar marca Ajustes correctamente, sin defecto persistente.

`native-final-grid4-geometry.json`: cuatro botones Registrar en primera fila y ocho completos visibles; mínimo 78,3×48 dp con densidad480dpi. Los dos ítems inferiores tienen bounds recortados fuera del viewport y no se usan para el tamaño de controles. PNG/XML de Home tras reapertura conservados; los dos 📖 tienen accesos/nombres accesibles diferentes y el tap fue a QA002, no al privado.

SAF posterior `native-final-after-grid.json`, SHA `b2b11bde4a8ce3541318549b38f458a213d6cf8cb8c9c8b0d0cfd614074d177d`. `native-final-one-record-comparison.json`: **PASS** tras validación estricta; exactamente un entry, revision y operación nuevos (102/102/112), activityId `15000000-0000-4000-9000-000000000005`, operación sequence112. Todas las filas anteriores, actividades, revisiones, settings y meta permanecen idénticos. No se añadieron preferencias de presentación al backup.

## Teclado y movimiento funcional nativos — fuente3

Nota: PNG/XML `native-final-note-marker-focused` muestran 21 líneas reales y `FIN VISIBLE DE QA`; campo y=1281..1821 y teclado empieza1984. Texto/caret visibles, con scroll interno al final. La inyección ADB intentó cadenas más largas y produjo líneas más cortas; se conservan el literal realmente observado y la limitación. No se declara integridad de esas cadenas rápidas ni causa exclusiva. El marcador final agregado con Maestro sí se observa completo. La nota no se guardó.

Cambio dinámico de transición1.0→0 con app viva y nota sucia: `native-final-motion-dynamic.json`; flow `native-final-note-discard-reduced` **PASS, 41 s**. Cerrar→seguir editando conserva el marcador, volver a cerrar→descartar conserva los 11 registros del detalle. Log acotado sin FATAL EXCEPTION/ReactNativeJS Error observado (`native-final-motion-logcat.txt`); no es una medida de FPS. Se restauró transición1.0 después.

Capturas independientes con Gboard real, texto100 % y vertical: fecha y723..885, hora y1029..1191, búsqueda y885..1047, zona de Ajustes y1774..1936; IME empieza1984 en todos. PNG/XML/JSON `native-final-date-focused`, `native-final-time-focused`, `native-final-history-focused`, `native-final-settings-focused`. Todos se ven por completo. Hora12:34, búsquedaQA002 y America/Bogota se observan completas. Fecha solicitada2026-10-10 quedó2026-10 bajo inputText; validación visible y borrador descartado. La causa de la cadena parcial queda **INCONCLUSA**, sin afirmarla como defecto de producto ni como automatización demostrada.

## Colisión de control externo y nuevo AVD exclusivo

La comprobación pausada de fecha mediante teclas visibles del IME en5580 quedó **INVALIDADA**: inmediatamente antes se capturó Dailoop/Gboard numérico (`native-final-real-ime-symbols.png`), pero durante la secuencia el foreground cambió a `com.nekonova.loopguardians/.MainActivity`. PNG final y dumpsys en `native-final-collision-*` confirman la aplicación ajena; su instalación17:16:09/update17:24:38 figura en el paquete. No se atribuyen estos taps a una prueba válida de Dailoop. Se detuvieron mutaciones al detectar la colisión; no se cerró ni se apagó5580 ni se manipuló esa app.

El responsable autorizó un AVD nuevo `Dailoop015_Final_API37`, serial `emulator-5590`, con puertos5590/5591 previamente libres y sin copiar userdata en uso. Se copió solo la configuración de hardware para usar la misma imagen existente; GPU software para funcional. Evidencias `new-avd-availability.json`, `new-avd-created.json`, `native-fresh-5590-emulator-*`. El wait inicial55s expiró, pero el primer boot completo terminó116,8s según el emulador y system_server quedó vivo; evidencia `native-fresh-5590-boot-ready.json`. No es un tiempo de arranque de Dailoop. Upgrade/Gfx anteriores no se repiten ni se invalidan automáticamente; la actividad ajena del host queda como límite de sus medidas. Los recorridos pendientes continúan exclusivamente en5590 y no comparan FPS.

## Nuevo AVD — fresco, fecha real, adaptación y defecto de modal

Arranque de instalación limpia de C3 con avión/Wi-Fi/datos desactivados: `native-fresh-5590-offline`, **1/1 PASS, 51 s**; app vacía y Ajustes sin demo. El flow existente14 de ruta privada **FAIL, 19 s** por visibilidad del guard; se conserva sin relajar. Comprobación independiente en `native-fresh-5590-private-route-assessment.json`: texto `Ruta no disponible.` en bounds `[0,0][1344,57]`, sin controles SQLite; PNG lo muestra en el borde superior bajo el área de sistema. No se observa exposición de QA, pero existe esa limitación visual del guard. Root confirmó que estos guards no cambiaron en esta iteración.

Se importó mediante SAF el checkpoint sintético102 y se seleccionó cuatro columnas sin registrar nada (`native-fresh-5590-import-102`, **PASS, 1 min38 s**). SHA de fixtures en el dispositivo preservado. Fecha por teclas visibles de Gboard numérico, pausas750 ms más check de foreground antes de cada tap: `native-fresh-5590-real-date-input.json`. El EditText XML posterior coincide exactamente con2026-10-10: `native-fresh-5590-real-date-assertion.json` **PASS**. El PNG inmediato aún muestra2026-10-1, mientras el XML posterior ya incluye0: se conserva la diferencia temporal, sin afirmar que esa captura muestre la cadena completa ni probar latencia de presentación. Borrador descartado, detalle11 registros **PASS, 27 s**. No demuestra integridad de inyecciones rápidas ni desempeño del IME físico.

Adaptación200 % en vertical: `native-fresh-5590-font200`, **PASS, 37 s**. PNG41 inspeccionado muestra aviso4→2, dos tarjetas y Registrar legibles; XML de Settings confirma `4 columnas` checked=true. Estadísticas se envuelve en dos líneas en el tabbar; no se observa recorte del control ni scroll horizontal.

Primer flow07 falló por dirección de recorrido: buscaba Editar actividad haciaUP aunque el botón está después de heading/panel/Registrar/otra fecha, por debajo. Se guardó screenshot/XML y se corrigió únicamente el test aDOWN. **R2 sí abrió el diálogo, pero descubrió un defecto material:** backdrop dim visible y todo el modal inaccesible por más de60 s; Nombre/Cerrar no aparecen, sin foco ni IME. `native-fresh-5590-edit200-r2-focused.{png,xml,json}` y window/logcat. El dumper reporta child invisible con bounds positivos `[57,191][1287,2873]`, aproximadamente410×894 dp. No se demuestra falta de espacio ni rect0. Las ventanas modal/base solicitan1344×2992, tienen surface mostrada/ready y son visibles (`native-fresh-5590-modal-window-geometry.txt`). Log del PID sin ReactNativeJS/FATAL/Exception observados.

Por instrucción del responsable se mantuvo la app/diálogo vivos y se cambió **solo** transición1.0→0. `native-fresh-5590-edit200-transition0` y `native-fresh-5590-modal-transition-comparison.json`: modal sigue invisible,0EditText/0Cerrar, IME ausente. Esto no prueba por sí solo la causa de layout/opacidad/registro de animación. CP3 se reabre; C3 no se entrega con este bloqueo. Estado preservado en5590 para diagnóstico, sin cerrar/reinstalar y sin nuevas rondas Gfx.

## C6 — visibilidad del modal y conservación antes de probar

Fuente73 SHA `9aa8e141613d47bb417cda237773129db984e8d67c4a3e9bbbd5d99379ec6861`; x86 C6 SHA `addf248f6b5dd592ca648627bd680b1689a6dbf1637d878c513091b1604816fd`,36.229.077B. El responsable separó opacidad de salida de progreso de entrada: opacidad inicial1; translate/scale se inician tras `Modal.onShow`. La causa exacta del estilo perdido en C3 sigue siendo hipótesis, no demostrada por el fix.

Se inició solo5590 con GPU software y se instaló C6 con `-r`, sin limpiar. Antes del primer launch se fijaron/verificaron font2.0 y transición/window/animator1.0 (`native-c6-prelaunch-environment.json`). Primer SAF real `native-c6-pretest.json`: `native-c6-pretest-exact-comparison.json` **PASS** payload/digest/counts102/102/112 idénticos a `native-final-after-grid.json`. Preferencia4 checked=true confirmada en `native-c6-preference-preservation.json` y PNG/XML. Se conserva la cadena anterior vc2→C2→C3; la importación102 al nuevo AVD y este upgradeC3→C6 no sustituyen aquella prueba.

YAML07 C6 **FAIL,386,613s**, `native-c6-edit200/junit.xml`: encontró Editar y Nombre, modificó el borrador, pero no encontró Categoría en su búsqueda por scroll. HideKeyboard tardó116s; el PNG intermedio ya mostraba IME cerrado. El log contiene IOException de heartbeat local compartido; forwards vacío y ningún Java/Maestro activo tras cerrar (`native-c6-maestro-*`). Root verificó que Maestro2.11 asigna puerto efímero por sesión; ese warning también existía en pruebas anteriores que pasaron. No se prueba colisión ni causa exclusiva. No se cambió el timeout ni se reetiqueta el YAML como PASS.

Comprobación independiente por ADB explícito5590 y foreground guardado antes de cada acción: el cuerpo sí se desplazó y mostró Categoría (`native-c6-edit200-adb-scroll2.xml`). Campo enfocado `[125,1660][1219,1850]`, IME comienza1984; PNG `native-c6-edit200-category-caret.png` inspeccionado muestra campo completo, texto y caret visibles. PNG inmediato muestra `Visible Q`, XML posterior `Visible QA`; se conserva diferencia temporal, igual que con fecha. Prompt `native-c6-edit200-dirty-close2.png/xml` visible al200%; Continuar vuelve al formulario con borrador y Descartar vuelve al detalle de11 registros (`native-c6-edit200-discarded.xml`). El resultado funcional independiente **PASS** queda en `native-c6-modal-regression.json`, separado del FAIL del script. No hay nueva medida Gfx ni validación de teléfono físico. Después se apagó únicamente5590 verificando nombre;5580 permanece presente e intocable.

## Revalidación Web de C6

Producción8795 con exportC6: app/offline/v015 **13/13 PASS,52,4s**; `qa/web-c6-static-report.json`, `.txt` y `web-c6-static/`. Desarrollo8793: probe natural **PASS** __DEV__true, rutas QA200/botones reales, COOPsame-origin/COEPrequire-corp, aislamiento y sin erroresJS (`qa/dev-export-c6-probe.json`); decoder/spike/storage originales **6/6 PASS,13,4s**, `output/verification/v0.1.5/web-c6-dev-report.json`, `web-c6-dev/`, stdout `qa/web-c6-dev.txt`. Workers1/retries0/timeouts originales60/15s; contextos aislados. Los timeouts anteriores de HTTP Metro siguen INCONCLUSOS y preservados; no se convierten retrospectivamente en PASS.

## Cierre funcional nativo C6

La versión final usa la fuente73 SHA `9aa8e141613d47bb417cda237773129db984e8d67c4a3e9bbbd5d99379ec6861`. Root inspeccionó63/63 propiedades de x86, ARM64 y comparador, y verificó el mismo Hermes `a774a652d473a3123666e5b1be83f2ff7a1aed273cf63f7b5da0ee7516d99778`. ARM64 final35.751.234B, SHA `94ffe4ff7c6a11376c84a2e5b01de8d01cc74e956af4ed9d0dd7a75938d92c29`; comparador ARM64 sin R8 de la misma fuente44.596.671B. Reducción frente al APK dualABI anterior46,79836%; ahorro aislado R8/recursos8.845.437B,19,8343%. Esto mide archivo APK, no almacenamiento instalado ni RAM.

Modo oscuro: YAML06 **FAIL22s** porque apareció `System UI isn't responding` en5590. Foreground real `com.android.systemui`, con Dailoop detrás; dumps `native-c6-systemui-*`. Se seleccionó únicamente Wait en ese diálogo del AVD propio y se recuperó. `native-c6-dark-regression.json` y PNG/XML `native-c6-dark-recovered`: **PASS visual independiente** de cuatro columnas oscuras y controles legibles. No se establece la causa del ANR ni se atribuye a Dailoop; no se repitió el YAML para borrar su fallo.

Cancelación de backup histórico: `native-c6-cancel-restore/junit.xml` **PASS49s**. Primer test10 **FAIL40s**: esperaba checksum pero el fixture anterior había reserializado `exportedAt` de `.040Z` a `.04Z` mediante PowerShell; la app rechazó correctamente la fecha inválida. Se conserva el archivo y fallo. Nuevo fixture `v015-corrupt-checksum.json`, generado con JavaScript preservando todas las cadenas y cambiando solo digest; SHA `347ff9e3839fb817fa4111651534758a3c7c0f7d83d843ae976951f49d1325dc`. `checksum-fixture-validation.json` demuestra `invalid_time` para el anterior y `checksum_mismatch` para el corregido. Test10b `native-c6-checksum-restore/junit.xml` **PASS18s**.

SAF posterior a edición descartada, cambios de apariencia OS, cancelación y ambos rechazos: `native-c6-after-cancel-corrupt.json`; comparación `native-c6-cancel-corrupt-exact-comparison.json` **PASS**, todo DomainState/digest/counts102/102/112 idéntico al pretest. No se declara ausencia de mutación solo por un contador visual.

Restauración histórica real: `native-c6-historical-restore/junit.xml` **PASS70s**, detalle vuelve a10 registros de QA002 y Ajustes conserva4 columnas checked=true (`native-c6-historical-preference.json`). Después de reportes/export/share, SAF final `native-c6-final-backup.json`, SHA `7391bf4a6805802f335068689fd8c29ad4c497a3cb3185f236e6cc50868c3625`. `native-c6-historical-exact-comparison.json` **PASS**: payload/digest/counts10 actividades,101 registros/revisiones,111 operaciones exactamente iguales al origen vc2. Root revalidó independientemente esta y las cuatro comparaciones previas (`root-native-data-validation.json`,5/5PASS). El archivo del proveedor se llamó `dailoop-backup-2026-10-14.json` por la fecha UTC, mientras Bogotá aún marcaba13/10 19:04; se usó el nombre observado. El primer pull de un sufijo supuesto falló sin modificar datos.

Reporte: YAML07 existente **FAIL72s** al no alcanzar Guardar Markdown dentro del scroll limitado del preview mensual largo. No hubo modal invisible: el texto real estaba renderizado. Tres swipes ADB en el margen, cada uno con foreground guardado, alcanzaron el footer (`native-c6-report-footer-ready`). Se guardó mediante SAF real y se descargó `native-c6-report.md`. `native-c6-report-exact-comparison.json` **PASS** byte por byte contra dominio reconstruido desde el backup final, período y segundo real de generación.2107B, SHA `dc318032df34831e08afa2c2d6b8859f42441ff83621b8f537c2f7e1ed3dda60`,3 registros en8 actividades públicas,2 privadas excluidas y notas no exportadas. `native-c6-share-regression.json` **PASS independiente**: chooser real de Android, Back para cancelar,0 destinatarios seleccionados y ninguna afirmación de envío.

El helper SAF que esperaba partir de la raíz se detuvo sin tocar nada cuando el último picker ya estaba en Documents. Se inspeccionó el XML y se ejecutó el segmento existente para carpeta actual: `native-c6-final-saf-current-documents/junit.xml` **PASS14s**. Se conserva la detención preventiva del helper; no fue un fallo de guardado del producto.

## Primer arranque y guardas del APK exacto C6

Antes de limpiar, se verificó de nuevo nombre del AVD, serial y SHA del `base.apk` instalado: coincide exactamente con x86 C6. El backup final externo estaba conservado, con hash y parseo estricto confirmados. Se limpió **solo** `local.dailoop.personal` en el AVD propio5590; nunca5580 ni otra app. `native-c6-fresh-preconditions.json` registra airplane1, Wi-Fi0, datos0, fuente1, transición1 y `pm clear` Success. Test13 existente `native-c6-fresh-offline/junit.xml`: **PASS34,709s**. PNG de primer arranque inspeccionado:0 actividades/registros y Crear mi primera actividad; Ajustes no ofrece demo. `native-c6-fresh-regression.json`. Esta prueba sí corresponde al binario C6; el fresco C3 permanece histórico.

Se abrieron por ADB ambos deep links reales `dailoop:///__spike` y `dailoop:///__storage-tests`, con paquete explícito y foreground Dailoop. `native-c6-private-routes-assessment.json`: **PASS ausencia de controles QA**, solo `Ruta no disponible.`,0 controles clickables y0 EditText en ambos. PNG/XML/intent/activity de cada ruta guardados e inspeccionados. El texto mantiene bounds `[0,0][1344,57]` junto al área del sistema; limitación visual y FAIL histórico14 preservados, sin declarar que su YAML haya pasado.

Estado final `native-c6-final-environment.json`: fuente1, vertical0, transición/window/animator1, modo claro del sistema. Se apagó solo5590 verificando nombre; `native-c6-final-devices-stopped.txt` conserva5580 presente e intocable. Root mantiene preview de producción8795 y cerró dev8793. No hubo publicación0.1.5 ni instalación en un teléfono personal desde QA.

## Límites pendientes y lectura del resultado

C6 es candidata para probar en el S26 Ultra; esta auditoría no acredita120Hz ni la latencia tap→contenido útil. La mejora Gfx de C3 corresponde al mismo Home/material conservado, pero no es una medición nueva de C6 ni rendimiento presentado real. Las pasadas software validan funcional, nunca FPS. Las pruebas observadas de teclado tienen versión/IME/orientación/fontScale explícitos; no equivalen a ejecutar cada combinación en C6 o Samsung Keyboard.

Quedan PENDIENTES: teléfono físico ARM64/SamsungIME/120Hz, latencia objetivo<100ms feedback/p95 útil≤200ms, TalkBack real, Android mínimoAPI24, rendimiento nativo con10.000 registros, falta de espacio/escritura fallida real en dispositivo, almacenamiento instalado y RAM. Los fixtures10k fueron generados/validados; no se ejecutó su prueba nativa. Los fallos de HTTP Metro siguen INCONCLUSOS aunque la exportación oficial dev haya pasado. Los FAIL de automatización, la colisión externa5580 y las diferencias temporales PNG/XML se conservan. No se resume todo esto como «todas las pruebas PASS».
