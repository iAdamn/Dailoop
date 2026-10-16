# Selectores gráficos y recordatorios por días — 0.5.0

2026-10-14. Cambio Flash solicitado después de entregar 0.5.0 / compilación 6. El usuario confirmó que tanto la hora principal como la anticipación marcada deben elegirse gráficamente. **Sin nuevos commits, push ni APK**. La preview se actualiza en localhost:8795; estos cambios aún no están en el APK entregado. Próxima compilación entregable: visible 0.5.0, versionCode 7, cuando se solicite expresamente.

## Interfaz

- Se elimina el campo de anticipación del formulario. **Personalizado**, junto a los otros avisos, abre una ventana dedicada con días/horas/minutos, controles de incremento y opciones rápidas. Conserva hasta 16 anticipaciones diferentes entre cero y 365 días; detecta duplicados. Cancelar no altera el borrador.
- **Hora del recordatorio** abre una ventana con las 24 horas y los 60 minutos, sin teclado. Precisión de un minuto, confirmación/cancelación, animación de entrada/salida y movimiento reducido. Ambos selectores tienen base legible y reflejos glass; sus textos no se superponen a los de la ventana anterior.
- **Una vez**, **Todos los días** y **Elegir días**. Los días elegidos se muestran de lunes a domingo. La fecha funciona como inicio de la serie; la primera ocasión se ajusta al siguiente día/hora válido. Una selección vacía no se puede guardar. Los recordatorios existentes siguen siendo de una sola ocasión.

## Calendario y registros

La repetición guarda días ISO 1–7, hora, minuto y zona IANA. La zona pertenece a la serie; cambiar la zona general de visualización no desplaza silenciosamente su horario. Al editar, se muestra la zona guardada de esa serie.

Cada serie muestra una próxima ocasión pendiente y sus ocasiones completadas. Hoy puede aparecer vencido; los días perdidos anteriores no llenan la pantalla con pendientes. Completar una ocasión añade un único registro y prepara la siguiente. El argumento de ocasión viaja desde la UI hasta la transacción, por lo que un doble toque no completa accidentalmente el día siguiente.

El vínculo entre ocasión y registro se guarda append-only junto al registro en una sola transacción SQLite. Reintentos, relanzamiento y restauración conservan el ID; anular reabre y restaurar reutiliza ese registro. Registrar normalmente la actividad en un día elegido también puede completar una sola ocasión. Un registro nunca completa varias ocasiones a la vez. Se conserva el historial core y las rachas por días.

Las repeticiones se calculan por calendario local, no sumando 24 horas. En cambios DST se utiliza el primer minuto real después de un hueco (hasta 180 minutos); se omite una fecha civil inexistente. En una hora repetida se usa el primer instante, conservando la elección explícita del segundo instante en el ancla inicial.

## Avisos Android

Cada combinación de día/anticipación usa un trigger semanal persistente de Expo, extendido con zona, inicio de serie y fechas completadas que deben omitirse. Calcula `instante previsto − minutos de anticipación`, también al cruzar medianoche o DST. Reprograma nativamente después de dispararse y utiliza el receptor de arranque existente: no depende de un horizonte de unas semanas ni de ejecutar JS para cada repetición. No registra la actividad al notificar.

La extensión reproducible está en `scripts/patch-android-recurring-notifications.mjs` y `scripts/native/DailoopZonedWeekly.java`, fijada a expo-notifications 57.0.23 tras la corrección de auditoría, aplicada en postinstall y antes del build. El trigger original permanece intacto; una clase serializable independiente conserva compatibilidad de las solicitudes anteriores. El calculador utiliza Calendar/TimeZone compatibles con API 24. Sin dependencias ni permisos nuevos.

**Importante para construir:** `expo.autolinking.android.buildFromSource` incluye expo-notifications. SDK 57 utiliza AAR precompilados por defecto; compilar únicamente contra ese AAR omitiría la extensión. Se verificó la generación real de `DailoopZonedWeekly.class` y `DailoopZonedWeeklyTrigger.class`.

El permiso sigue siendo opcional. Android puede retrasar avisos por ahorro de batería o limitar alarmas; forzar detención también puede impedir la recepción. Compilación/JVM/Web no prueban la entrega real tras cerrar/reiniciar el teléfono. El próximo APK debe comprobar serialización, reinicio, cancelación y recepción con esta clase empaquetada.

## Compatibilidad y evidencia

SQLite permanece en esquema físico **2**, sin reescribir migraciones ni revisiones anteriores. Backups **v1/v2** conservan su forma cuando no hay eventos nuevos; **v3** conserva reglas y vínculos de repetición, incluso si después se vuelve a «Una vez». Se importan 1/2/3 y se rechazan versiones o estructuras incoherentes. El APK de compilación 6 no acepta v3; no eliminar manualmente sus campos.

- Pruebas de código: **238 PASS**: dominio 77, SQLite 32, componentes/contratos 125, estrés 1, decoder 1 y dos pruebas de puente/JVM con 12 escenarios de calendario nativo.
- Producción Web: **31/31 PASS**, contextos nuevos en Edge; incluye lunes/martes, diario, cancelación, persistencia, backup v3 y completar sólo una ocasión. Targets gráficos de hora/minuto ≥40×40 px a 390×844. Después del ajuste visual de base opaca: 10/10 pruebas de selectores y 8/8 flujos Web afectados PASS, con capturas finales inspeccionadas.
- Android: `:expo-notifications:compileReleaseKotlin`, `:expo-notifications:compileReleaseJavaWithJavac` y `:app:compileReleaseKotlin` **PASS**, compilando la extensión desde fuente. No assemble/package/install. Primer intento falló por alias T: ausente; el segundo identificó que se estaba enlazando el AAR; ambos se conservan, seguidos de la compilación desde fuente correcta.
- `npm run verify`: **9/10 controles PASS**. La consulta online de Expo recomienda siete actualizaciones de parche, por lo que su control permanece **FAIL de inventario**. Las versiones instaladas coinciden con el mapa incluido en SDK 57.0.28; el check offline pasa con su advertencia de validación limitada. No se actualizaron paquetes ni se presenta ese resultado offline como aprobación del inventario online.
- APK 0.5.0 / compilación 6 intacto por SHA-256 `9138898719c36849e0c51b1eb759f7d72382ca3c0c16dda765c927e9a7744cb9`.

Evidencia local bajo `output/verification/v0.5.0/repetition/`, excluida de Git. La aceptación nativa queda pendiente del siguiente APK expresamente solicitado.
