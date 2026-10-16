# Corrección y optimización de auditoría · 0.5.0

Autorizada el 15 de octubre de 2026. Cambios locales de fuente y preview, sin nuevo commit/push, APK, instalación personal ni limpieza destructiva. Se conservan versión visible 0.5.0, código Android entregado 6, identidad de firma, esquema SQLite físico 2 y compatibilidad de backups 1/2/3. Los cambios de repetición que ya estaban pendientes al iniciar esta corrección se han conservado.

## Hallazgos y resultado de implementación

| Hallazgo auditado | Corrección y evidencia |
| --- | --- |
| A01 · parches nativos ignorados por AAR precompilados | Audio, blur y notifications se compilan desde fuente. El módulo de backup y las clases semanales propias aparecen realmente en la compilación Kotlin/Java release. |
| A02 · escritura que excedía el límite admitido al reabrir | Guardas de entidades, revisiones y operaciones antes de asignar IDs. Los reintentos idempotentes siguen admitidos en el límite. Prueba SQLite conserva filas/snapshot y reabre después del rechazo; además se ejecutó el límite real de 200.000 entradas. |
| A03 / S02 · trabajo multiplicativo en recordatorios | Índices de candidatos por actividad, zona canónica, fecha y día semanal; consumo determinista sin rescans repetidos. Caché sólo para snapshots profundamente congelados, invalidada por medianoche, reloj atrás, entrada futura o vencimiento exacto. Las devoluciones son copias independientes. Recordatorios ocultos suspenden la derivación. El plan de avisos agrupa completados una vez. |
| A04 · elección DST ignorada al conservar HH:mm | Seleccionar el otro desfase cambia realmente el instante; una corrección sin cambio de hora conserva los segundos originales. |
| A05 · editar campos durante un guardado perdía cambios | Contexto compartido bloquea campos, selectores, chips, toggles, botones y cierre mientras se guarda. Ante fallo se conserva el borrador exacto para reintentar. |
| A06 · instante inicial variable del formulario | Fecha/hora inicial se fija al abrir; ticks del reloj no generan un falso borrador modificado. |
| A07 · desmontar ventanas ocultas perdía borradores | Los componentes de formulario permanecen montados al cambiar de ruta; el Modal nativo se oculta, el teclado se cierra y la animación vuelve al regresar. La prueba navega con texto realmente editado. |
| A08 · listas y búsquedas repetidas de auditoría | Historial, detalle, completados y auditoría virtualizan filas. Mapas por ID sustituyen búsquedas por fila. Se conservan agrupación, filtros, accesibilidad, carga de más registros y revelado de campos ante el teclado. |
| A09 · reconstruir todas las proyecciones en cada escritura | La transacción actualiza únicamente las proyecciones afectadas por su delta. La reparación de integridad mantiene una reconstrucción completa explícita. Rollback, restauración, reapertura y corrección/anulación/restauración siguen probados sobre SQLite real. |
| A10 · verificaciones fuera de la batería habitual | `verify` añade las seis pruebas UI de dominio/períodos, lector JVM y mitigaciones de tooling. El falso de notificaciones conserva/verifica el trigger DATE real. Las pruebas Web desplazan listas virtualizadas antes de contar filas y esperan geometría asentada de animaciones. |
| A11 · dependencias y avisos | Siete actualizaciones compatibles de SDK 57; uuid 11.1.1 corrige sus buffers. Mitigaciones de fuente exacta para braces, forge, sprintf y decoder, descritas abajo. `expo install --check` pasa; el inventario npm continúa mostrando avisos de versiones. |
| A12 · días civiles inexistentes | El final exclusivo salta un día ausente; la repetición busca la siguiente semana válida. Estadísticas también encuentra el día anterior existente después del salto de Apia. |
| A13 · elementos sin uso y documentación histórica | Retirados TabLens, DateField, surfaceShadow y cuatro estilos sin consumidores. Flujos YAML antiguos identificados como históricos y corregida su referencia obsoleta al emulador ajeno. El manifiesto distingue originales y derivados Android existentes. Se conservan evidencia, assets originales y todas las versiones/APK. |
| S01 · importar copiaba antes de limitar | Android pide el documento sin copia previa. DailoopBackup lee el stream concedido en IO, cuenta bytes reales hasta límite+1, decodifica UTF-8 estricto y cierra el stream. No usa size/seek/available del proveedor ni borra su original. Cap nativo fijo de 50 MiB. |

La revisión independiente de la candidata encontró y se corrigieron dos casos adicionales: nombres equivalentes de zonas generaban índices repetidos, y el período anterior de estadísticas fallaba después de un día civil eliminado. Los nombres guardados no se reescriben; la canonicalización es interna y en el límite del trigger nativo, que requiere nombres IANA con capitalización válida.

## Dependencias: mitigación verificable, inventario visible

`scripts/patch-tooling-security.mjs` verifica versión, hash original y anclas únicas, prepara todos los cambios antes de escribir y acepta únicamente la repetición exacta del parche revisado. Se ejecuta en postinstall y antes del build Android. Una actualización inesperada falla para exigir revisión; no se falsifican versiones ni se silencian avisos.

- **braces 3.0.3:** límite del stack real del parser y guardas iterativas de profundidad/ciclos en compile, expand y stringify, incluidos imports directos de AST. Literales escapados, comillas, rangos y casos normales continúan funcionando. [Aviso](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- **node-forge 1.4.0:** AlgorithmIdentifier exige OID solo u OID seguido de NULL primitivo vacío. Se corrige el módulo y ambas distribuciones UMD; firmas válidas SHA256/MD5 y controles de rechazo se prueban en siete vías. [Aviso](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
- **sprintf-js 1.1.3:** comprobación previa de precisión, ancho y presupuesto agregado, antes de callbacks/asignaciones. Límite de texto por campo 1 MiB y anchos/literales agregados 16 MiB; precisión numérica respeta límites nativos. Se cubren fuente, minificado, Node, browser y AMD. [Aviso](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
- **decoder:** la API CJS antigua delega a 0.5.0 conservando `+` y TypeError. Una revisión adicional halló rescans cuadráticos incluso en su fallback publicado: el parche del alias procesa cada run una vez, usando su decodificador iterativo. Se verifican 32.000 runs distintos con instrumentación de trabajo, Unicode, BOM, C2 y query-string real. El fallback ya no reinterpreta accidentalmente porcentajes escapados por la presencia de otro run malformado; las URLs válidas conservan su resultado. [Aviso original](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
- **uuid 11.1.1:** v3/v5/v6 rechazan buffers insuficientes; controles válidos v3/v4/v5/v6 ejecutados. [Aviso](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

Las tres primeras versiones no tienen release upstream corregida en los avisos consultados. Los mapas de fuente de las distribuciones minificadas parcheadas no se regeneran; pueden indicar ubicaciones anteriores en depuración de tooling. Se conservan licencias y código no afectado.

El inventario completo posterior registra **59 nodos: 51 high, 8 moderate, 0 critical**, propagación de cuatro familias de avisos. No son 59 exploits demostrados en Dailoop. npm evalúa versiones y no reconoce estas mitigaciones de fuente. Eliminar ese contador forzando SDK/Jest incompatibles no demuestra seguridad y no se hizo. Evidencia: `output/verification/audit-fixes-dependency-audit.json`.

## Verificación y límites

- `npm run verify`: **13 controles PASS**, con **278 pruebas**: dominio 88, SQLite 33, Jest 139, UI de dominio 6, stress 1, decoder 2, recurrencia JVM 2, lector JVM 1 y tooling 6. TypeScript, ESLint, assets y matriz Expo pasan.
- Exportación Web de producción PASS. **31/31 recorridos de navegador PASS**, incluyendo conservación exacta de backups/IDs/revisiones, aislamiento demo/personal, segunda pestaña, funcionamiento cargado sin red, formularios, animaciones y repetición semanal/diaria. El Modal de auditoría se desplazó hasta la cuarta revisión y se verificó dentro del viewport; capturas inspeccionadas visualmente. Tras retirar el último estilo sin uso se reexportó la preview y se repitieron los tres recorridos afectados de registro/historial: **3/3 PASS**.
- `:app:compileReleaseKotlin` release ARM64 **PASS**, incluyendo compilación real de audio, blur, notifications, DailoopBackup y BoundedBackupReader. No se ejecutó assemble/package/install. Los warnings de deprecación son de bibliotecas externas; no se presentan como errores corregidos por Dailoop.
- Caracterización de 3.700 filas mantiene SHA-256 `8c0db7cc0c0ecc7f535b02f33423d747c48635011038ebae3085feaf2e8e3250`. Tick estable medido ~0,8 ms y una conversión de fecha, frente a ~113 ms anteriores. Es medición Node, no FPS del teléfono.
- 10.000 recordatorios simples/10.000 entradas: 19.706 conversiones, ~198 ms en la pasada final. 10.000 series: 29.733 conversiones, ~392 ms. La primera derivación de 50 series midió ~181 ms: no se afirma que haya mejorado la carga fría.
- Prueba adicional de capacidad real: **200.000 entradas + 10.000 series**, 204.118 filas derivadas en ~2,2 s, ~901 MiB de heap total del proceso de prueba. El rechazo de la entrada siguiente ocurre antes de asignar IDs. Este extremo no promete fluidez móvil ni que un backup de ese tamaño quepa en 50 MiB; muchas zonas distintas y grandes historiales requieren trabajo real.
- Se compararon los 30 APK de la auditoría por SHA-256: **30 sin cambios**. La regeneración nativa reemplazó su directorio generado; su copia histórica `android/app/build/outputs/apk/release/app-release.apk` se repuso desde el APK entregado, verificando identidad exacta. Versionados y escaneo sellado intactos.

Evidencia nueva bajo `output/verification/v0.5.0/audit-fixes-20261015`, con logs auxiliares `output/verification/audit-fixes-*` y `native-audit-fixes-final.txt`. Se conservan primeros fallos y pruebas dirigidas posteriores; no se sustituyen evidencias históricas de releases.

Las pruebas JVM simulan proveedores no seekables, tamaños engañosos/desconocidos, lecturas cortas/cero, UTF-8 y fallos/cierre. La compilación no certifica un ContentResolver de nube real, una lectura de proveedor bloqueada indefinidamente ni cancelación física del proceso. En el próximo APK autorizado deben comprobarse recepción/boot de avisos, audio, teclado/scroll, shader/frame pacing, TalkBack y lector del proveedor Android en S26. No se accedió a la base personal, emulator-5580, firma privada ni Flutter.

## Superficies de código y pruebas

- Dominio: `src/domain/core.ts`, `planning.ts`, `time.ts`, `recurrence.ts`; pruebas de dominio, planificación, recurrencia y `tests/reminder-performance.test.ts`.
- Persistencia y avisos: `src/infrastructure/store.ts`, `notificationPlan.ts`; `tests/session.test.ts`, `notification-plan.test.tsx`, `notifications.test.tsx`.
- Importación: `src/infrastructure/files.ts`, registro `modules/dailoop-glass/expo-module.config.json`, `BoundedBackupReader.java` y `DailoopBackupModule.kt` bajo la biblioteca Android local; `tests/files.test.tsx` y `native-backup-reader.test.ts`.
- UI: `src/ui/{DailoopUI,components,forms,keyboard,motion,navigation,reminders,CalendarField}.tsx`, `tokens.ts`, nuevo `modalState.ts`; regresiones `audit-ui-regressions.test.tsx`, `keyboard-list.test.tsx`, navegación y recorridos Web afectados.
- Dependencias y reproducción: `package.json`, lockfile, `scripts/patch-tooling-security.mjs`, `patch-android-recurring-notifications.mjs`, `build-android.ps1`, `verify.mjs`, configuración Playwright y `tests/tooling-security.test.ts`/`decoder.test.ts`.
- Documentación y metadatos: este informe, AGENTS/README, compatibilidad, almacenamiento, dependencias, seguimiento de repetición, `tests/android/README.md`, comentario del flujo inicial y política descriptiva de `assets/manifest.json`. No se alteraron hashes ni bytes de los tres PNG originales.
