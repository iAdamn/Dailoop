# Plan de QA independiente

Fecha: 12 de octubre de 2026, America/Bogota. Alcance autorizado: pruebas Web/dominio/componentes y lectura de implementación dentro de Dailoop. No APK, prebuild, instalación Android ni publicación remota. El proyecto anterior queda fuera del alcance.

**Estado integrado:** el [checkpoint de entrega](CHECKPOINT.md) mantiene la matriz vigente y la evidencia de cierre. Las tablas de estado inicial y los intentos anteriores de este documento conservan la historia de diagnóstico; no representan fallos abiertos cuando una regresión posterior ejecutada los ha cerrado.

## Contrato de evidencia

Los resultados solo son PASS tras ejecutar el caso sobre la versión integrada. Un test escrito, una captura, un mock o una lectura de código no certifican por sí solos el criterio funcional completo. Clasificaciones: PASS, FAIL, PENDIENTE, BLOQUEADO o NO APLICA con motivo. Los defectos de privacidad, integridad, auditoría, backup/restauración y totales bloquean el gate APK.

QA puede modificar `tests/spike.spec.ts`, `tests/app.spec.ts`, `tests/components.test.tsx`, `playwright.config.ts` y este documento. El agente de datos conserva `tests/domain.test.ts`; producción, package y lockfile corresponden al coordinador/agentes asignados.

## Matriz de trazabilidad

| Criterios / riesgo | Comportamiento observable | Evidencia necesaria | Estado inicial |
|---|---|---|---|
| AC-01, AC-05: persistencia y red | Crear/registrar y recargar conserva datos; solicitudes de producto externas inexistentes | Browser real, bloqueo de red externa, recarga y reopen SQLite | PENDIENTE |
| AC-02–04: registro | Actividad arbitraria, dos intenciones producen dos eventos; reintento de comando no duplica | E2E público + dominio/repo | PENDIENTE |
| AC-06–08: auditoría y última vez | Corregir/anular/restaurar conserva originales y proyecta vigente; máximo instante efectivo | Dominio, repositorio y UI; reloj atrasado | PENDIENTE |
| AC-09–10: períodos | Bogotá, DST, medianoche, bisiesto, mes histórico; conteos independientes | Tests dominio con oráculos explícitos + E2E histórico | PENDIENTE |
| AC-11–12: privacidad | Excluidos no aparecen en Markdown, totales, notas, auditoría ni metadatos; texto es contenido | Casos negativos + descarga UTF-8 real inspeccionada | PENDIENTE |
| AC-13–16: backup | Export/import conserva IDs y cadenas; invalidez/cancelación dejan DB activa intacta | Archivo real, candidato validado, rollback/fallo inyectado y recarga | PENDIENTE |
| AC-17–18, AC-27: interfaz | Nombres accesibles, targets, foco, texto grande, identidad y ambos temas | RNTL + navegador 360/390/430 px y escritorio + revisión visual | PENDIENTE |
| AC-19: volumen | 50 actividades y 10.000 ocurrencias sin pérdida; latencia medida | Dataset y perfilado Web; p95 Android después del gate | PENDIENTE |
| AC-20: archivos | Descargar/importar/cancelar son acciones diferenciadas y no mutan datos por error | E2E selector real; hojas nativas posteriores | PENDIENTE |
| AC-24, AC-26 | Originales conservados, launcher/backup OS/offline inicial nativo | Inspección de derivados/manifiesto y Android físico | PENDIENTE NATIVO |
| AC-25 | Pantallas y dominio compartidos, solo adaptadores de plataforma distintos | Revisión de imports + contrato repositorio | PENDIENTE |

## Ejecución Web y aislamiento

`npm run test:e2e` usa `DAILOOP_TEST_URL` o `http://localhost:8793`. Por defecto el coordinador administra el servidor; no se crea, reutiliza ni termina otro proceso desde los tests. Si se configura `DAILOOP_TEST_SERVER_COMMAND`, Playwright administra un servidor dedicado con `reuseExistingServer: false`.

La configuración usa Chromium empaquetado si existe; en caso contrario el canal local `msedge`. `DAILOOP_BROWSER_CHANNEL=chromium` exige el empaquetado; otro valor permite seleccionar explícitamente el canal. No se instala un navegador automáticamente. Cada test recibe un contexto nuevo con almacenamiento aislado; las verificaciones de recarga y segunda pestaña permanecen en el mismo contexto. Reloj fijo y zona Bogotá se establecen antes de cargar la app.

Un worker y cero retries conservan atribución clara de fallos y evitan ocultar inestabilidad. Evidencias en `output/playwright/`: JSON, reporte HTML, trazas y capturas de fallos. Los screenshots complementan assertions de estado/archivos. La suite debe leer archivos descargados reales y usar el selector de archivos para importar, sin sustituir esos bordes por llamadas internas.

## Spike SQLite

La ruta de desarrollo `/__spike` expondrá el botón accesible `Ejecutar prueba SQLite` y `testID=spike-result`. La forma exacta de los resultados se acuerda con el coordinador antes de escribir assertions. Verificar COOP/COEP, `crossOriginIsolated`, commit, rollback, migración y persistencia tras recarga de una base real. La evidencia SQLite del spike no demuestra automáticamente que la app integrada use esa misma persistencia.

## Límites de esta etapa

La preview depende del servidor localhost para cargar recursos. Probar una sesión ya cargada sin red externa no equivale a demostrar recarga Web offline ni arranque Android offline desde primera instalación. No afirmar PWA ni sincronización de datos con Android. Maestro, permisos, native sharing, SQLite Android, Hermes, TalkBack y rendimiento físico quedan detrás del gate APK.

## Registro de ejecución

Ejecuciones del subagente QA el 12 de octubre de 2026, Windows, Node 24.15.0, Playwright 1.64.0, canal Edge 155.0.4283.45, contexto nuevo y zona Bogotá:

| Comando / caso | Resultado | Alcance real |
|---|---|---|
| `npm run test:e2e -- tests/spike.spec.ts` con URL por defecto 127.0.0.1 | BLOQUEADO entorno: ERR_CONNECTION_REFUSED | Servidor del coordinador estaba disponible en localhost; no prueba SQLite |
| Mismo comando con `DAILOOP_TEST_URL=http://localhost:8793`, intento con dos documentos concurrentes | FAIL en segunda pestaña | OPFS `NoModificationAllowedError` al abrir el mismo archivo; commit, rollback y reload anteriores sí funcionaron |
| Mismo comando tras separar cierre del documento y reapertura | PASS: 1/1, 2,8 s | Aislamiento/headers, commit, rollback, integrity, reapertura, reload y persistencia 0→1→2→3; cero recursos externos |
| `npm run test:unit -- --runTestsByPath tests/components.test.tsx` | PASS: 6/6, 2,588 s | Controles accesibles más selección privada/notas por defecto, igualdad preview/export y selección vacía sin fallback; sin certificar nativo |
| `npm ls react-native-web @types/react react-native-worklets react-native-reanimated --depth=0` | PASS | Instalados RN Web 0.21.2, types/react 19.2.4, Reanimated 4.5.1 y Worklets 0.10.1 |

El fallo concurrente queda preservado en `output/playwright/evidence/sqlite-concurrent-second-tab-failure.zip` y `.png`. La prueba de persistencia vigente cierra la primera página antes de abrir la siguiente. Esto no oculta ni resuelve el fallo: `Session` incorpora posteriormente Web Locks/BroadcastChannel para la segunda pestaña de la app y necesita un E2E separado. El spike llama directamente a SQLite y no usa esa protección.

El coordinador reportó `expo install --check` actualizado y `expo-doctor` **21/21 PASS** (sesión 78451), tras aplicar RN Web 0.21.2 y @types/react 19.2.4. Son evidencia recibida del coordinador, no comandos ejecutados por QA. La recomendación remota de Expo difiere de la tabla estática sdk-57/template consultada inicialmente; las versiones instaladas arriba se comprobaron directamente con `npm ls`. El lockfile y smoke tests gobiernan la combinación integrada.

Lectura de `store.ts`, `schema.ts` y `session.ts`: se observaron cola única, triggers contra UPDATE/DELETE de fuentes, candidato separado, comparación canónica y marcador prepared/activated antes de retirar la base anterior. Aún falta evidencia ejecutada de fallos en cada fase de restauración, disco lleno, migración desde formato anterior, integridad relacional dañada y concurrencia de la app. Lectura sin ejecución no concede PASS a estas capacidades.

### Hallazgos de integración antes de los recorridos públicos

1. La ruta principal `/` no recibía inicialmente los headers COOP/COEP aunque `/__spike` sí. La app rechazó abrir almacenamiento con su mensaje de aislamiento. El coordinador implementó un proxy localhost 8793 → Expo 8794 que agrega headers a HTML, workers y recursos; las assertions de headers y `crossOriginIsolated` de la suite pública pasaron después.
2. Con aislamiento correcto, la app personal aún fallaba en `sqlite3_open_v2`. QA reprodujo el fallo en un contexto nuevo sin reloj simulado ni bloqueo de red. La instrumentación de mensajes del worker mostró apertura y consulta del registro correctas y fallo exclusivamente al abrir `./dailoop-personal-<UUID>.db`. La implementación instalada `expo-sqlite/web/wa-sqlite/VFS.js` fija `mxPathname = 64`; la ruta personal de 57 caracteres más el sufijo journal de 8 excedía ese límite, mientras demo quedaba por debajo. El coordinador acortó ambos generadores de nombres (creación y restauración) a `dl-p-<UUID>.db`/`dl-d-<UUID>.db`, conservando la entropía. Los E2E públicos son la regresión funcional de este defecto.
3. El coordinador reportó `tests/storage.spec.ts` **3/3 PASS**: contrato SQLite con idempotencia, rollback por fallo antes de commit, restauración repetida, reapertura y recuperación después de cerrar el documento en los estados prepared/activated. Es ejecución del coordinador; no equivale a probar disco lleno ni cierre de proceso Android.
4. `accessibilityState.checked` en Pressable no producía `aria-checked` con RN Web 0.21.2: el tema Claro aparecía seleccionado visualmente, pero el lector de la semántica Web lo veía sin marcar. La assertion estricta de Playwright detectó el defecto que RNTL nativo no detectaba. El agente UI añadió las propiedades ARIA explícitas y soporte de Espacio a los controles no button. El stress de texto 200 % también encontró superposición de etiquetas de navegación; QA agregó comparación de límites entre etiquetas adyacentes, además del ancho total.
5. Al abrir la auditoría de registros sin nota o motivo, los condicionales `string && <Label>` dejaban una cadena vacía directamente dentro de View. RN Web emitía `Unexpected text node` y el aviso de desarrollo interceptaba la navegación inferior. La UI pasó a condiciones booleanas explícitas. La suite ahora también rechaza errores de página sin capturar y ese mensaje de consola, sin descartar el error ni cerrar artificialmente el aviso.

Se corrigieron dos defectos del propio test: `page.clock.setFixedTime` sustituía el constructor Date y alteraba TZDate/date-fns (el período fallaba únicamente bajo ese mock; la misma ruta sin mock funcionaba). La suite ahora fija solo `Date.now` antes de cargar, dejando intacto el constructor y las operaciones de calendario. La recarga de Ajustes conserva su hash de navegación; el test vuelve explícitamente a Inicio antes de comprobar el contador. No se cambiaron las reglas de producción para satisfacer estos errores de prueba.

Ejecución RNTL después del cambio de Toggle y de agregar verificación de activación: **6/6 PASS, 3,252 s**, comando `npm run test:unit -- --runTestsByPath tests/components.test.tsx`. La privacidad cambia una sola vez mediante pulsación y comunica su estado seleccionado.

La suite pública bloquea y registra cualquier solicitud HTTP(S) a un origen distinto del servidor local. Incluye archivos descargados reales y selector de archivos para restaurar. Las capturas abarcan Inicio a 360/390/430/1280 px en ambos temas, además de Historial, Estadísticas y Ajustes a 390 px. La prueba de texto 200 % duplica métricas tipográficas en DOM para detectar desbordamiento; es una simulación Web y no certifica el escalado de fuente de Android.

### Estado de la última ejecución independiente, antes de integración final

`npm run test:e2e -- tests/app.spec.ts`, sesión 96839: **6/7 PASS, 3,4 min**. Resultado JSON conservado en `output/playwright/evidence/app-public-6-of-7-before-final-integration.json`.

| Recorrido | Resultado observado |
|---|---|
| Dos registros, reload, corrección, anulación, restauración, cuatro versiones originales visibles y total vigente | PASS, 25,6 s |
| Mes histórico completo, privacidad por defecto, auditoría sin notas excluidas, Markdown descargado exactamente igual al preview y selección vacía bloqueada | PASS, 13,6 s |
| Backup real, cancelación, reemplazo repetido sin duplicados, checksum corrupto rechazado sin mutación y reload | PASS, 26,1 s |
| Segunda pestaña solo lectura, snapshot actualizado y adquisición de escritura tras cerrar la primera | PASS, 35,1 s |
| Base personal/demo, cambios separados, cancelación y reinicio de demo | PENDIENTE reejecución del último paso: el test navegó a Ajustes antes de que terminara el callback de cambio a personal, cuyo navigate(Home) desmontó Ajustes; se agregó espera del aviso final. Las aserciones anteriores al último export pasaron |
| Ambos temas, Espacio en selector, cuatro anchos, navegación adicional sin desbordamiento | PASS, 26,5 s |
| Texto Web 200 %, etiquetas sin superposición y botón Registrar utilizable | PASS, 12,8 s |

El caso demo anterior sin reinicio ya había pasado completo en sesión 40091 (13,2 s). El último paso tras reiniciar **no** se declara aprobado hasta repetirlo sobre la integración. La suite final espera los avisos de fin de transición; no añade sleeps para esconder la carrera de la prueba.

Se conservaron 15 capturas en `output/playwright/screenshots`. QA y UI inspeccionaron claro/oscuro 390 y texto 200 %: la navegación ampliada ya no se superpone. Las capturas tempranas claras omitieron imágenes aún decodificando; la suite añade `HTMLImageElement.decode()` y dos frames antes de capturar, y agrega selección/preview del reporte. Estas capturas actualizadas están pendientes de la ejecución final coordinada.

El coordinador reportó una ejecución posterior **4/4 PASS, 41,8 s**: tres pruebas de almacenamiento (incluida reconstrucción de proyecciones con payload alterado y revision IDs iguales) más export Web estático cargado operando sin red. No demuestra recarga sin servidor, primera instalación Android sin red ni comportamiento de SQLite nativo. La prueba de volumen 50 actividades/10.000 registros y las correcciones posteriores de recuperación/concurrencia esperan la validación integrada coordinada.

QA pausa nuevas ejecuciones por coordinación, dejando preparados los tests para un único pase integrado tras los últimos cambios. Conservan estado pendiente: volumen, nueva recuperación restringida, fallo real por disco lleno, migración de una versión anterior real, Android físico, TalkBack, hojas nativas y p95 Android. No se genera APK ni se concede el gate nativo con estos resultados Web.

### Verificación integrada y cierre de los hallazgos anteriores

El coordinador ejecutó la integración completa con **15/15 E2E PASS**, sin casos inestables ni retries; el JSON anterior al último ajuste de foco se conserva en `output/playwright/evidence/integrated-15-pass-before-focus.json`. Se cerraron la transición demo/personal, el volumen y la barrera de recuperación tras doble fallo del registro. El test de almacenamiento real Web comprueba explícitamente que una restauración incierta bloquea escrituras hasta reabrir y recuperar el candidato duradero.

La verificación posterior `npm run verify`, completada a las **2026-10-13T02:49:23.224Z**, pasó los nueve comandos: typecheck, lint, dominio 37/37, esquema/sesión 16/16, componentes/adaptadores 8/8, volumen Node 1/1, decoder 1/1, hashes de los tres assets y compatibilidad Expo. `test-storage.txt` ya contiene los 16 casos, incluida la cola concurrente; reemplaza la evidencia anterior de 15. Doctor final pasó 21/21 y la exportación estática quedó regenerada con el ajuste visual. No se usó un reset de cuenta ni se ejecutó build nativo.

La revisión visual independiente detectó un outline automático negro/blanco en el switch de auditoría. Se reemplazó por un anillo Web explícito con tokens autorizados, conservando foco visible. Root inspeccionó la nueva captura del reporte; el recorrido visual verifica además el estilo calculado del contorno al activar el tema con Espacio. Las superficies pastel de las tarjetas emplean ink para mantener contraste. El test de texto 200 % conserva la comprobación de etiquetas sin superposición.

Se añadió y ejecutó un recorrido AC-07 por la interfaz pública: crear dos registros, descargar backup original, editar nombre/emoji/color, archivar, consultar historial y nombre original en auditoría, descargar backup archivado, restaurar actividad, descargar backup final y recargar. Pasó la comparación exacta de identidades, registros y revisiones originales; sólo se añaden las revisiones de actividad 2, 3 y 4 y sus operaciones correspondientes. La suite pública suma ocho recorridos. El resultado consolidado más reciente, incluidos tiempos de volumen, está en `CHECKPOINT.md`.

Permanecen pendientes disco físicamente lleno, muerte de proceso Android, upgrade comercial anterior, proveedores/compartir nativos, TalkBack, fuente del sistema, manifiesto final y p95 físico Android. Un pase Web no cierra ninguno de esos puntos.

**Resultado final:** `npm run test:e2e`, inicio 2026-10-13T02:49:34.870Z: **16/16 PASS**, duración 382.905 ms, 0 skipped, 0 unexpected, 0 flaky, 1 worker y 0 retries. Se ejecutó después de congelar las fuentes UI y el caso AC-07, sin verificaciones de CPU en paralelo durante el benchmark. Último p95 Web 327,64 ms (10 muestras); importación 25,84 s; reapertura 17,02 s. Todos los archivos de evidencia y las 18 capturas se actualizaron. Root revisó la captura corregida del foco; los tests comprobaron foco calculado y texto 200 % en esa misma ejecución. El pase previo de 15 casos y sus mediciones permanece preservado, no se sobrescribió como si fuera esta ejecución.
