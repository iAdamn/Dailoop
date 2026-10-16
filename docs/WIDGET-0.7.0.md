# Widget Android y acciones nativas — 0.7.0

## Flujo implementado

El widget usa RemoteViews nativo, con la paleta de cristal de Dailoop y sin SDK gráfico adicional. Se añade desde Ajustes o desde el selector de widgets del lanzador Android. Una ventana nativa permite elegir 1–4 actividades; también pueden elegirse actividades privadas, con aviso explícito de que sus nombres se mostrarán en el escritorio. Las actividades archivadas desaparecen de la proyección. El control «Elegir actividades» permite reconfigurar cada widget de forma independiente.

Cada fila muestra emoji, nombre y última fecha/hora en la zona y formato elegidos. Al tocar una fila se registra la actividad directamente, sin abrir la navegación. El estado «Registrado» solo se muestra después del commit SQLite y de confirmar la nueva instantánea; un fallo conserva la acción pendiente con su mismo identificador para reintentar con seguridad.

El diseño nativo es estático y ligero. No reproduce un desenfoque de fondo real sobre otros lanzadores, ni ejecuta un servicio permanente. Se puede redimensionar; para cuatro filas conviene darle suficiente altura.

## Persistencia y seguridad

Kotlin guarda únicamente una proyección visual mínima en SharedPreferences privados: ID de base, ID/nombre/emoji/privacidad/última fecha por actividad y traducciones. No guarda notas, revisiones, credenciales ni tokens. El historial canónico se escribe exclusivamente en el store JavaScript existente, mediante su cola y transacción auditada. La cola nativa conserva hasta 64 acciones; los IDs y horas de pulsación se mantienen estables entre reintentos y reinicios del proceso.

El registro usa un ID de operación estable y un ID de entrada distinto derivado de forma determinista. La repetición de una misma pulsación no duplica entradas. Una acción para una base diferente, sesión de demostración, recuperación pendiente, solo lectura o actividad archivada se rechaza. La comprobación de identidad de base también debe ejecutarse dentro de la transacción del store para impedir una carrera con una restauración/sincronización.

El receptor de acciones y el servicio no están exportados. El proveedor y la configuración sí lo están porque el lanzador Android los necesita; se comprueba que el ID de widget pertenezca al proveedor. Los PendingIntent de registro son explícitos e inmutables. Solo la devolución de pin es mutable, para que Android inserte el ID recién asignado; tiene componente explícito y receptor privado. Cada fila tiene un token por instancia que se rota tras el éxito. Las acciones cuyo destino dejó de existir o pertenece a otra base se descartan como obsoletas y nunca muestran «Registrado»; los fallos de almacenamiento o de ciclo de vida siguen pendientes para un reintento con el mismo ID. Posponer u omitir limpia el estado de éxito sin fingir un registro de actividad.

El servicio foreground es de tipo `shortService`, con tarea Headless JS de 30 segundos y límite nativo de 35 segundos. Solo arranca por interacción del usuario; no hace polling ni sincronización de red. Reutiliza ReactHost y el singleton de sesión, incluidos los dispositivos con la nueva arquitectura de React Native. Los permisos adicionales de foreground/wake lock responden a esta ejecución acotada; no se solicita permiso de superposición ni una excepción de batería.

## Contratos de integración

- Entrada nativa antes de montar UI: `registerWidgetTasks(extraReminderHandler?, afterCommit?)`. El callback compartido reprograma/cancela avisos locales desde el estado confirmado, también cuando no hay interfaz montada.
- Al volver al primer plano: `runWidgetActions()`; no debe hacerse en Web.
- Al cambiar la instantánea personal o idioma: `publishWidgetSnapshot(state, language)`; nunca publicar la demostración.
- Selector de Ajustes: `requestWidgetPin()` (Android 26+ y lanzador compatible).
- Limpieza local explícita: `clearWidgets()`.
- Son `DailoopWidgetModule` en el catálogo Expo y el manifiesto del módulo los que registran los componentes.

El mismo receptor acepta acciones de notificaciones locales enviadas por el puente privado de Expo. El planificador conserva la interpretación de «Hecho», «Posponer» y «Omitir» en su handler inyectado; el widget no inventa entradas para las dos últimas. El payload incluye identidad de base/recordatorio/ocasión y metadatos de recurrencia para distinguir la notificación semanal realmente entregada.

## Verificación

`npx tsx --test tests/v070-widget-actions.test.ts`: 9 pruebas PASS, incluyendo idempotencia tras pérdida de ack, intención alterada, archivo posterior al commit, demo/solo lectura/recuperación/otra base, actividad ausente/archivada, separación de comandos de recordatorio, validación de metadatos, omisión de datos privados no necesarios y tres idiomas. Otras 8 pruebas Jest del runner cubren concurrencia de señales, arranque sin UI, idioma persistido, fallo de reconciliación después del commit, pérdida de ack sin duplicación y descarte de destinos obsoletos frente a errores temporales. Las pruebas del puente de recordatorios verifican ocasión exacta, entrega de una semana posterior, errores/guards, canales silencioso/sonoro y acciones de notificación en background. Lint enfocado y TypeScript PASS. La compilación Kotlin/Hermes y los controles del APK los registra el root en la evidencia de la entrega.

La aceptación física sigue pendiente: añadir/configurar/redimensionar widget en One UI, registrar con app abierta/cerrada y sin internet, repetir una pulsación rápida, verificar última hora e historial, archivar la actividad, reiniciar el teléfono y comprobar el reintento. Forzar detención de Android puede bloquear tareas hasta abrir Dailoop; no se promete evitar esa política del sistema. Las pruebas de navegador no prueban el widget nativo.
