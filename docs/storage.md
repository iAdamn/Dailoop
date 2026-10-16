# Persistencia, migración y recuperación

## Fuente de verdad

Cada base conserva identidades de actividades/ocurrencias, revisiones append-only y operaciones con secuencia local única. El contenido JSON preserva el contrato portable; claves y relaciones SQL mantienen integridad referencial. Triggers rechazan UPDATE/DELETE de las tablas fuente. Las proyecciones `activity_current` y `entry_current` son descartables: al abrir se comparan IDs, campos y JSON con la fuente validada y se reconstruyen si difieren.

Toda operación de una instancia pasa por una cola, incluidas lecturas, exportaciones y restauración. El comando se evalúa sobre el snapshot más reciente dentro de la transacción. La misma clave de operación y misma intención devuelve el resultado previo; otra intención necesita otra clave. Ambas plataformas usan `withTransactionAsync` sobre su conexión privada inicializada; la cola cubre todas sus operaciones. No se usa el helper exclusivo que abriría otra conexión sin nuestras PRAGMA. Pruebas reales de esta fase: SQLite Node y Web; Android sigue pendiente de aceptación física.

El snapshot validado se conserva como objetos y arrays inmutables. Cada escritura comprueba `MAX(sequence)` de ambos logs, operaciones y planificación, dentro de la transacción: si coinciden, reutiliza el snapshot; si alguno cambió, vuelve a leer y validar la fuente antes de ejecutar el comando. Sólo publica el estado nuevo después del commit; un rollback conserva el snapshot anterior. Restaurar sólo sustituye el snapshot cuando el puntero duradero queda confirmado. Reportes y backups leen la fuente SQL mediante la misma cola. Esto evita releer y deserializar toda la historia en cada pulsación. No pretende detectar una manipulación externa de SQL que conserve la secuencia mientras la app está abierta: el contrato requiere propiedad de escritura, fuentes append-only y validación al abrir.

La regresión ejecuta el módulo real con SQLite Node: inmutabilidad profunda, vistas anteriores intactas, rollback sin publicación, comandos encolados, restauración, cambio externo de secuencia y rechazo de historia inválida. Con 10.000 registros, el E2E Web pasó de p95 2.490,86 ms a 317,65 ms (diez muestras por ejecución, click → confirmación visible). El arranque valida toda la historia y sigue siendo más costoso; consultar los tiempos y límites en `CHECKPOINT.md`.

La preview mantiene un propietario por origen mediante Web Locks. BroadcastChannel entrega snapshots de sólo lectura a las demás pestañas; no abren el mismo archivo OPFS. Esto responde a un fallo real de bloqueo de archivos de SQLite Web. Al cerrar el propietario, recargar otra pestaña permite adquirir escritura.

## Versiones

Desde 0.5.0: esquema físico SQLite 2 y backups 1/2. La migración 1→2 añade planning_events append-only y su marcador de presencia, con recibo propio y rollback probado sobre bases v1 completas. No reescribe operaciones ni revisiones anteriores. El contrato core/meta sigue en versión lógica 1. Los backups v1 se importan y exportan sin cambiar su forma cuando no existe planificación; v2 incluye y valida el log de recordatorios y los avisos de racha, incluso si está vacío. Los clientes anteriores no leen v2. Véase RECORDATORIOS-RACHAS-0.5.0.md. La migración inicial 0→1 crea todo el esquema y su recibo SHA-256 en una transacción, seguida de `user_version=1`. Se verifica el recibo al reabrir. Una versión futura o un recibo distinto se rechazan conservando el almacenamiento. El upgrade se prueba con un dataset físico v1 sintético completo y con la actualización instalada en el emulador Android 17 de Dailoop: conserva todas las filas del core, 10 actividades y 101 registros. Véase RELEASE-0.5.0.md; la aceptación en el teléfono personal sigue pendiente. Backups v1 sin el campo opcional de precisión de segundos del offset continúan siendo admitidos y se conservan intactos; nuevas revisiones capturan esa precisión.

## Restauración

1. Leer y validar tamaño, forma estricta, checksum, IDs, referencias, secuencias, cadenas y correspondencia entre intención y efecto. Cancelar aquí no cambia la base activa.
2. Crear una base candidata independiente, migrarla e insertar el estado en una transacción. Verificar integridad SQLite, claves foráneas, contrato y equivalencia canónica.
3. Guardar marcador duradero `prepared` con la base anterior aún activa. Un cierre aquí conserva la anterior al reabrir.
4. Cerrar la conexión anterior, guardar `activated` con candidato activo y referencia de recuperación, y verificar el candidato otra vez.
5. Sólo tras validar se marca `ready` y se retira la base anterior. Un fallo recupera la anterior; un cierre en `activated` valida la nueva o vuelve a la anterior.

El registro de punteros usa SQLite aparte. Los nombres `dl-p-UUID.db` y `dl-d-UUID.db` conservan la entropía y caben, junto al sufijo journal, en el límite de 64 bytes de la VFS Web instalada. Personal y demostración tienen punteros distintos. El reinicio explícito de demo usa el mismo mecanismo de candidato y sólo admite el modo demo.

## Manejo de errores

La app no confirma guardado antes del commit ni borra automáticamente una base desconocida. Los errores de apertura permiten recargar; las operaciones fallidas se pueden reintentar con la misma clave. Una migración fallida hace rollback. Una exportación Markdown es un snapshot filtrado y nunca reemplaza un backup.

Se probaron rollback de escritura inyectado antes del commit, corrupción de proyecciones y cierre del documento en `prepared`/`activated` con SQLite Web real. Llenado físico del disco, muerte del proceso Android y corrupción real del archivo del sistema operativo siguen pendientes. El checksum detecta alteraciones accidentales; no autentica al autor ni cifra el archivo.

La revisión independiente encontró y corrigió un caso adicional: si fallan tanto el marcador final como el de rollback, no se puede suponer cuál base quedó activa en disco. Ahora se conservan ambas, se cierran las conexiones y una barrera rechaza operaciones nuevas y ya encoladas hasta recargar. La interfaz ofrece recuperación y deshabilita modificaciones. Las pruebas del módulo real con SQLite de Node y fallos inyectados comprueban tanto este caso como el rollback confirmado que permite seguir trabajando; no representan un disco físicamente lleno. Las lecturas tardías de una sesión anterior también se descartan al cambiar de base.

Cada acción nativa de compartir recibe un archivo temporal con nombre único. Compartir otro reporte del mismo período no sobrescribe los bytes que una aplicación receptora anterior pudiera leer más tarde. La regresión del adaptador utiliza File/Sharing simulados; comprobar el comportamiento de los receptores reales forma parte del checklist Android.


Seguimiento local posterior a la entrega 0.5.0: las ocasiones recurrentes enlazan un entryId propio por reminderId/instante en la misma transacción del registro. Conservan el ID ante anulación/restauración y reintentos. SQLite sigue en 2; backup v3 valida los eventos de repetición/vínculo y rechaza el etiquetado falso como v1/v2. Los datos anteriores conservan v1/v2. Véase REMINDER-REPEAT-0.5.0.md.

Corrección de auditoría: Android selecciona documentos sin copiarlos primero. DailoopBackup abre el InputStream concedido por el proveedor en un hilo de IO y cuenta bytes reales antes de decodificar UTF-8, con límite nativo fijo de 50 MiB. No necesita size, seek ni available; admite lecturas cortas y cierra el stream al finalizar o fallar. No borra originales del proveedor. La ausencia del módulo nativo produce un error explícito, sin recurrir a una lectura sin límite. Las pruebas JVM cubren los límites y proveedores simulados; el proveedor Android real requiere la próxima candidata autorizada.

Las escrituras nuevas comprueban los mismos límites de entidades/revisiones que la apertura y la restauración antes de asignar IDs. Un rechazo conserva el último estado reabrible. Las proyecciones SQLite actualizan sólo entidades afectadas por la transacción; la reparación de integridad conserva la reconstrucción completa explícita. No cambia el esquema ni el log de auditoría.

## Sincronización opcional

SQLite sigue siendo la fuente inmediata de trabajo, con el mismo esquema 2 y backups 1/2/3. La sincronización compara SHA-256 del snapshot confirmado dentro de la misma cola serial de escritura antes de activar un candidato validado; cualquier registro intercalado obliga a recalcular. La restauración conserva sus pasos de candidato/rollback. No se introducen estados de dominio en memoria como persistencia alternativa.

El vínculo databaseId/UID, pausa, última sincronización y ramas de recuperación son metadatos independientes: SQLite `dailoop-cloud-v1.db` en Android e IndexedDB `dailoop-cloud-metadata-v1` en Web. Esta última evita abrir otra base OPFS en pestañas secundarias. No entran en backups auditados. Las credenciales se guardan aparte en SecureStore Android o IndexedDB Web, fuera de la copia portátil y de los logs.

Firestore guarda fragmentos inmutables verificados por SHA-256, manifiestos y una cabecera actualizada mediante precondición de versión. Las reglas permiten acceso únicamente al UID propietario. Nunca se borran automáticamente ramas incompatibles: se conserva la original localmente y en la nube, con exportación desde Ajustes. La cabecera publica hasta 20 referencias de recuperación; versiones/chunks antiguos no tienen limpieza automática y consumen cuota. Detalles y aceptación: `SYNC-0.5.0.md`.
