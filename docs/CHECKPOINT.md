# Checkpoint de preview — Dailoop 0.1.0

12 de octubre de 2026, America/Bogota (evidencias técnicas del 13 de octubre UTC). Proyecto exclusivo: `C:/!Codex/Dayloop/Dailoop`. Preview estable: **http://localhost:8795**. El navegador debe admitir SQLite Web/OPFS y Web Locks; se verificó Edge 155.0.4283.45 en Windows. El servidor local debe permanecer abierto.

**Nota posterior:** este documento conserva la validación funcional inicial. El cambio visual solicitado después tiene su evidencia específica en [UI-POLISH.md](UI-POLISH.md). El usuario abrió después el gate APK; la fase Android autorizada se documenta en [ANDROID-RELEASE.md](ANDROID-RELEASE.md). Los pendientes y la prohibición de compilar de este checkpoint son históricos.

## Resultado y alcance

Implementados Inicio, Historial, Estadísticas y Ajustes con pantallas compartidas React Native/Web: actividades arbitrarias, registros repetidos e históricos, corrección/anulación/restauración con versiones conservadas, estadísticas por zona/período, Markdown filtrado, backup completo por reemplazo, demo separada y temas claro/oscuro. La base personal abre vacía; la demostración se activa expresamente en Ajustes. No hay cuenta, backend, telemetría ni claves necesarias.

La preview está disponible para revisión humana. **Android no está certificado ni se ha generado APK/AAB/prebuild.** La aprobación de iniciar el proyecto y gestionar variables de entorno no sustituye el permiso específico de compilar. El handoff original permanece intacto; el otro proyecto no se inspeccionó ni modificó.

## Checkpoints realizados

| Fase | Resultado verificable |
|---|---|
| 0. Lectura y contratos | 29 archivos leídos: 21 Markdown, 4 JSON, SVG y 3 PNG inspeccionados; 28 hashes/tamaños y 29 entradas ZIP contrastados. Autorización explícita del chat registrada en `DECISIONS.md`. |
| 1. Base compartida y persistencia | Expo 57/RN 0.86.3/React 19.2.3 fijados en lockfile; Doctor 21/21; SQLite Web real con WASM/aislamiento, transacciones, rollback y reapertura. |
| 2. Actividades e historia | Dominio append-only, IDs y secuencias, reintento idempotente, UI integrada; originales conservados en corrección/anulación/restauración. |
| 3. Fechas y estadísticas | Bogotá, DST, fechas históricas, medianoche, bisiestos y reloj atrasado; conteos sobre estados efectivos, última vez por máximo instante. |
| 4. Archivos y privacidad | Un ReportModel filtrado para preview/copia/guardar/compartir; archivo real y restauración por candidato con estados duraderos; aislamiento demo/personal. |
| 5. Revisión integrada | Subagentes de datos, UX y QA; recorridos públicos, contratos SQLite, volumen, revisión visual y documentación. Advisor no disponible por `parent_runtime_unavailable`; no se presenta una consulta inexistente. |
| 6. Android | PENDIENTE de aprobación específica y ejecución del checklist en dispositivo. |

## Pruebas y evidencias

| Comando / evidencia | Resultado y límite |
|---|---|
| `npm run typecheck`, `npm run lint` | PASS. |
| `npm run test:domain` | 37/37 PASS; fechas, auditoría, privacidad negativa, Markdown y backup. |
| `npm run test:storage` | 16/16 PASS: 3 esquema + 13 store/sesión, incluyendo caché después de commit y barrera de recuperación. SQLite real de Node y adaptadores controlados; no SQLite Android. |
| `npm run test:unit -- --watch=false` | 8/8 PASS; componentes y archivos nativos simulados. |
| `npm run test:stress`, `npm run test:decoder` | 1/1 y 1/1 PASS. El benchmark de dominio no mide UI. |
| `npm run check:assets` | 3 PNG originales con hashes idénticos. |
| `npm run check:expo`, `npx expo-doctor` | PASS; Doctor 21/21 después del decoder corregido. |
| `npm run export:web` | PASS; recursos empaquetados localmente. |
| `npm run test:e2e` | **16/16 PASS en 6,4 minutos**, un worker, cero reintentos, cero omitidos/inestables y contextos nuevos. 8 recorridos públicos, decoder, sesión estática sin red, spike, 4 contratos/fallos de almacenamiento y volumen. |

Son **79 pruebas ejecutadas y aprobadas** (63 fuera del navegador y 16 E2E), además de los diagnósticos y hashes. El pase E2E final empezó a las 2026-10-13T02:49:34.870Z y duró 382.905 ms. Logs: `output/verification/`; E2E estructurado: `output/playwright/evidence/integrated-16-pass-before-ui-polish.json`; 18 capturas conservadas: `output/playwright/screenshots/`. Los resultados anteriores fallidos permanecen identificados como anteriores en `qa-plan.md` y `output/playwright/evidence/`. Las capturas complementan los tests, no sustituyen sus assertions. La huella SHA-256 de los archivos se guarda en `output/verification/source-fingerprint-v0.1-baseline.json`.

La revisión final confirmó logos visibles, layout a 360/390/430/1280 px, navegación sin superposición al 200 %, reporte legible y foco Web con colores autorizados. La preview estática quedó abierta y comprobada en el navegador de Codex con su base personal vacía y escritura disponible. El servidor de desarrollo se cierra al entregar; permanece activo el servidor estable 8795. Los comandos del README permiten volver a iniciar ambos para repetir la suite.

La revisión encontró y corrigió defectos reales: headers ausentes en `/`, nombre de base que excedía el límite VFS, accesibilidad Web sin ARIA seleccionado, navegación superpuesta con texto grande, nodos de texto vacíos en auditoría, proyecciones desactualizadas, resultado tardío al cambiar de sesión, recuperación ambigua tras dos fallos de registro y reutilización de URI nativa para compartir. Los límites de cada regresión se detallan en los documentos de QA y almacenamiento.

## Volumen y rendimiento medido

Fixture ficticio: 50 actividades, 10.000 ocurrencias, 11.884 revisiones, 11.934 operaciones y 9.706 registros efectivos. Después de diez pulsaciones se verificaron 10.010 identidades y 11.894 revisiones en un backup descargado real; la recarga y el historial conservaron los datos.

| Medida Web, Edge/Windows/Metro de desarrollo | Resultado final |
|---|---|
| Importar y validar backup de 15.693.482 bytes | 25,84 s |
| Recargar, abrir y validar toda la base | 17,02 s |
| Registrar, commit y confirmación visible (10 muestras) | 204–328 ms; p95 327,64 ms |
| p95 antes de optimizar las lecturas | 2.490,86 ms |

Archivos: `output/verification/stress-web-final.json` y `stress-web-before-cache.json`; la primera ejecución posterior a la caché se conserva como `stress-web-after-cache-run1.json` (p95 317,65 ms, importación 24,84 s, reapertura 13,98 s). Se evitó releer toda la historia por pulsación mediante snapshots inmutables confirmados por SQLite; la integridad sigue validándose al abrir. Las mediciones incluyen Playwright y render y son sensibles a la carga del equipo. Diez muestras describen cada ejecución; **no certifican el objetivo p95 <500 ms en un dispositivo Android de referencia**. Importación y arranque con gran volumen todavía requieren espera.

## Matriz de aceptación

PASS siempre indica la capa citada; PARCIAL conserva la validación pendiente. La matriz no concede un cierre Android por evidencia Web.

| ID | Estado en este checkpoint | Evidencia / trabajo restante |
|---|---|---|
| AC-01 | PARCIAL | Web crea/persiste sin recursos externos; sesión estática cargada funciona con red cortada. Primer arranque Android offline pendiente. |
| AC-02 | PASS Web/dominio | Actividad propia, validaciones, emoji y colores autorizados en componentes/recorridos. |
| AC-03 | PASS Web/dominio/SQLite | Dos intenciones producen dos registros; total, historial y reload coinciden. |
| AC-04 | PASS Web/dominio/SQLite | Reintento con misma clave no duplica; nueva intención sí. Cola y rollback probados. |
| AC-05 | PARCIAL | Persistencia/reapertura Web y preferencias verificadas. Muerte/reinicio de proceso Android pendiente. |
| AC-06 | PASS Web/dominio/SQLite | Corrección, anulación y restauración mantienen cuatro versiones y cambian el estado efectivo. |
| AC-07 | PASS dominio/Web | Recorrido público edita nombre/emoji/color, archiva y restaura; backups reales conservan identidades, registros, revisiones y operaciones originales; la cadena de actividad crece 1→2→3→4. |
| AC-08 | PARCIAL | Máximo efectivo, reloj atrasado y actualización UI cubiertos. Foreground/lifecycle Android pendiente. |
| AC-09 | PASS dominio/Web | Límites y totales con zona; E2E histórico complementa oráculos de dominio. |
| AC-10 | PASS dominio/Web | Mes/rango histórico, cronología, totales y archivo Markdown real. |
| AC-11 | PASS dominio/Web | Excluidos no aparecen en resumen, totales, cronología, notas ni auditoría; selección vacía bloqueada. |
| AC-12 | PASS dominio/Web | Escape/Unicode y descarga UTF-8 idéntica al preview de texto sin HTML ejecutable. |
| AC-13 | PARCIAL | Roundtrip completo, reemplazo repetido y recovery Web/Node. Proveedores/SQLite Android pendientes. |
| AC-14 | PARCIAL | Checksum inválido y cancelación no mutan; fallos de escritura/restore inyectados. Disco lleno y selector Android reales pendientes. |
| AC-15 | PARCIAL | SQL 0→1, recibo repetible, rollback y rechazo futuro; backup v1 previo al campo opcional de offset compatible. No existe una versión comercial anterior cuyo upgrade probar. |
| AC-16 | PASS dominio/SQLite/Web | Restauración repetida reemplaza sin merge ni duplicados. |
| AC-17 | PARCIAL | Nombres, estados, teclado y texto Web 200 % verificados. TalkBack/fuente Android pendientes. |
| AC-18 | PASS preview | Tokens/PNG originales, ambos temas y capturas; derivados Android pendientes. |
| AC-19 | PARCIAL | 50/10.000 Web sin pérdidas, p95 medido; objetivo físico Android pendiente. |
| AC-20 | PARCIAL | Archivos Web y adaptadores unitarios; hojas de compartir, cancelaciones y SAF Android pendientes. |
| AC-21 | PASS proceso | Inventario completo y hashes contrastados antes de implementar. |
| AC-22 | PASS proceso | Usuario autorizó expresamente y aclaró que el proyecto previo quedaba en checkpoint sano. |
| AC-23 | PASS proceso, gate pendiente | Ningún APK/AAB/prebuild. Se requiere aprobación específica posterior a esta preview. |
| AC-24 | PARCIAL | Originales intactos y manifest local; launcher/splash/máscaras derivados pendientes. |
| AC-25 | PARCIAL | UI/dominio compartidos; adaptadores de plataforma aislados. Paridad ejecutada en Android pendiente. |
| AC-26 | PENDIENTE Android | OTA y configuración inicial de permisos/backup definidas; manifiesto final, cloud/D2D y arranque offline se comprobarán tras aprobación. |
| AC-27 | PARCIAL | Capturas de claro/oscuro a 360/390/430/1280 y texto 200 %; accesibilidad visual Android pendiente. |

## Riesgos residuales y próximo paso

`npm audit` mantiene avisos transitivos de herramientas y el decoder antiguo declarado por Router. El runtime Metro usa el decoder oficial corregido 0.5.0, con regresión de URL malformada; esto no vuelve limpio el inventario npm. Ver [dependency-audit.md](dependency-audit.md); revalidar antes de firma/build. SQLite Web conserva su condición alpha en la documentación Expo y requiere el servidor con headers específicos. Los backups manuales incluyen datos privados y no están cifrados. No hay sincronización entre los orígenes de desarrollo/preview ni hacia Android.

Al aprobar específicamente la fase APK: completar derivados trazables, manifiesto final sin backup cloud/D2D, permisos mínimos, firma local conservada, paquete autónomo y checklist `14_ANDROID_RELEASE_CHECKLIST.md` del handoff. Verificar SQLite/Hermes, Intl, modo avión desde instalación, persistencia/lifecycle, archivos/compartir, TalkBack/fuentes, disco lleno y rendimiento en un dispositivo identificado. Hasta entonces no se ejecuta ninguna compilación nativa.
