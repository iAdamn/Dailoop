# Siguiente bloque: recordatorios y rachas

Entrega posterior autorizada: [Git y APK 0.5.0](RELEASE-0.5.0.md). Este documento conserva la evidencia y los límites de su checkpoint anterior.

Solicitud del usuario, 2026-10-14. **Este documento conserva el planteamiento inicial.** La solicitud posterior «ve con el siguiente bloque… todo lo pendiente y lo nuevo» activó su ejecución en 0.5.0. Las decisiones implementadas, migración, pruebas y pendientes físicos están en [RECORDATORIOS-RACHAS-0.5.0.md](RECORDATORIOS-RACHAS-0.5.0.md). Las secciones «pendientes»/«futura» de abajo son históricas. No asignar otra versión mientras 0.5.0 no sea funcional y estable.

## Navegación solicitada

- Renombrar Inicio a **Registro**.
- Sustituir la pestaña Historial por **Recordatorios**.
- Mantener **Estadísticas** y dar acceso desde allí a la pantalla completa del Historial actual, conservando filtros, búsquedas y acceso a revisiones.
- Mantener Ajustes. Adaptar también el arrastre, la lupa, accesibilidad y las rutas antiguas para que sigan llegando a su pantalla.

## Recordatorios vinculados

Cada recordatorio elige una actividad existente por identidad, no por nombre. El usuario configura cuándo realizarla y qué avisos quiere: por ejemplo, un día antes, tres horas antes, una hora antes y treinta minutos antes, todos a la vez. Permitir anticipaciones personalizadas en horas o minutos y evitar avisos duplicados.

Notificaciones locales, con autorización del sistema y elección del usuario; el uso de Registro seguirá funcionando sin internet y sin permiso de notificaciones. Disparar un aviso **no crea ningún registro**. Completar explícitamente el recordatorio guarda un único registro confirmado y marca la ocurrencia como completada, con reintentos idempotentes. Registrar desde Registro debe reflejarse de forma coherente en el recordatorio correspondiente, sin duplicar la actividad realizada. Definir la regla de asociación cuando haya varias ocurrencias de la misma actividad.

Editar, completar, archivar, anular/restaurar un registro o cambiar zona horaria debe reconciliar los avisos pendientes. Decidir en la fase de diseño la repetición de recordatorios, comportamiento de ocurrencias vencidas, precisión de alarmas permitida por Android y recuperación tras reiniciar el teléfono. No añadir cuentas, sincronización ni servicios remotos.

## Rachas por días

- Un día con uno o más registros vigentes de una actividad cuenta **una sola vez**.
- Días consecutivos aumentan la racha; siete registros el mismo día nunca equivalen a siete días.
- Definir el día según la política de zona horaria de la app; contemplar medianoche y cambios de horario.
- Derivar el cómputo de registros vigentes, también tras corregir fechas, anular/restaurar e importar backups; no mantener un contador que pueda separarse del historial.
- Mostrar una llama pequeña en la esquina superior derecha de la tarjeta con el número legible dentro, accesibilidad descriptiva y adaptación a 1–4 columnas. Evitar que tape menús, emoji, nombre o Registrar.
- Aviso opcional antes de que termine el día si hay una racha vigente y todavía no se registró la actividad. Cancelarlo si se completa y evitar que duplique un recordatorio ya programado.

## Decisiones pendientes de ese bloque

Repetición, asociación entre registros y ocurrencias, actividades con racha activada, hora del aviso de racha y política al cambiar de zona deben resolverse antes de implementar. La continuidad offline, la auditoría append-only y el backup validado siguen siendo condiciones del proyecto. Cualquier cambio de esquema exige migración y recuperación probadas con las bases existentes.

## Aceptación mínima futura

1. Historial conserva sus funciones al abrirse desde Estadísticas; Registro/Recordatorios y gesto inferior tienen rutas correctas.
2. Varios avisos de una ocurrencia sobreviven al reinicio, con el comportamiento que permita la plataforma y sin conexión.
3. Denegar notificaciones no impide crear recordatorios ni registrar actividades.
4. Completar una ocurrencia una o varias veces por reintento produce un registro confirmado, nunca registros fantasma por mostrar notificaciones.
5. Dos días consecutivos producen racha 2; siete registros el mismo día mantienen racha 1; anulación/corrección/restauración recalculan la racha.
6. Registro y recordatorios se reconcilian, y los avisos de ocurrencia/racha se cancelan o actualizan correctamente al completar.
7. Llama y número son legibles en todas las columnas y tamaños de texto sin estropear la tarjeta.
8. Pruebas nativas reales de permisos, recepción, reinicio, zona y medianoche; la preview no demuestra la entrega de notificaciones Android.
