# Cuentas y sincronización — 0.5.0

Autorización: Firebase Spark, Google opcional, SQLite local siempre disponible. No facturación, Analytics, Gemini, publicación Git ni APK en este seguimiento. No subir la base personal durante pruebas. Se conserva 0.5.0/build 7; siguiente APK autorizado, code 8.

## Invariantes y fases

1. Investigar y probar fusión de histories: mismo UUID exige el mismo contenido; prefijos válidos avanzan; entradas independientes se combinan sólo si el candidato completo pasa validateState. Las ramas que requieren reescribir auditoría producen conflicto explícito. Se conservan versiones originales antes de cualquier resolución.
2. Firebase REST con identidad Google, credenciales de sesión protegidas y proyecto dedicado Spark. Reglas de acceso por UID. Contenido inmutable fragmentado y manifiesto validado; cabecera condicional evita sobrescritura concurrente. La falta de configuración no simula conexión real.
3. Preferencias de sincronización separadas del dataset y binding entre UID/databaseId. Ningún cambio de cuenta sube datos automáticamente. Modo demo, pestaña secundaria y recuperación de almacenamiento no sincronizan.
4. Aplicación local serializada con comparación del digest esperado; un registro creado durante la red obliga a recalcular. Las escrituras locales no esperan la red. Reintentos acotados, agrupación de cambios y comprobación al volver a primer plano, sin servicio permanente ni polling continuo.
5. Ajustes conserva estética, idiomas y selector de cuenta; distingue pausa, pendiente, offline, error y conflicto. Activar subida es una decisión explícita dentro del producto y explica que incluye datos privados.
6. Pruebas de dominio/protocolo, reglas con emulador aislado, identidad/renovación, cambio de cuenta, carrera local/red, caídas y regresiones existentes. Preview y compilación nativa sin APK. Prueba Google real depende de la configuración y aceptación de consola disponibles; no se confundirá con emulador.

El protocolo usa Firestore y Auth sin servidor propio ni Cloud Functions. Las cuotas gratuitas pertenecen al proyecto completo y no equivalen a capacidad ilimitada. No se habilita facturación para ampliar límites.

## Proyecto y uso

Proyecto Firebase **Dailoop / `dailoop`**, número público `923916837353`, creado en **Spark: USD 0 al mes**. Firestore Standard `(default)` en `nam5`; Google como único proveedor habilitado. No se vinculó facturación ni se activaron Analytics/Gemini/Cloud Functions. El proveedor OAuth está en producción para usuarios externos y solicita sólo identidad básica, nombre/foto y correo.

La aplicación Web `Dailoop Web` y Android `local.dailoop.personal` están registradas. Android usa el certificado existente SHA-1 `f03bd278c590fcd14c73a8af4e7ef8df0c2ccd5e`; Firebase generó su cliente OAuth Android. Los retornos Web locales autorizados son `http://localhost:8795/` y `http://localhost:8797/` (este último exclusivamente QA). Una futura URL pública necesita su propio origen/retorno autorizado; no hay hosting publicado.

En **Ajustes → Cuenta y sincronización**:

1. Conectar con Google identifica la cuenta y guarda la sesión; no sube el dataset.
2. Activar sincronización muestra el contenido que se compartirá y requiere confirmar. Incluye actividades privadas, notas, auditoría y planificación. La marca «privada» sigue siendo una regla de reportes, no cifrado de extremo a extremo.
3. Guardar/registrar siempre confirma SQLite primero. Los cambios se agrupan 15 segundos cuando la app está activa; también se comprueba al volver a primer plano, recuperar conexión o pulsar Sincronizar ahora. No se promete ejecución mientras Android cierra/suspende la app.
4. Pausar cancela el trabajo pendiente. Cerrar sesión borra credenciales locales y conserva los datos, la nube y el vínculo con la cuenta original. Otra cuenta no puede subir esta misma base.
5. Un dispositivo realmente vacío puede adoptar la base de su cuenta tras activar expresamente. Una base con datos propios diferentes exige revisión; nunca se sustituye silenciosamente.

Idioma, distribución, preferencias visuales y permisos del dispositivo permanecen locales. Actividades, registros, ajustes auditados y recordatorios conservan sus IDs y contenido original. Los avisos nativos se vuelven a programar en cada dispositivo con sus permisos; la nube no envía push remoto.

## Protocolo y recuperación

`src/sync/merge.ts` reconoce prefijos de auditoría y combina cambios independientes sólo si el candidato completo puede representarse en el modelo auditado existente y pasa `validateState`. No reescribe revisiones originales para ocultar conflictos. Dos altas concurrentes de actividades, modificaciones incompatibles del mismo objeto o datasets distintos pueden requerir elegir una versión.

`controller.ts` conserva ambas ramas antes de aplicar/resolver, limita reintentos CAS a tres y separa cuenta, dataset, generación y escrituras de metadatos. `DailoopStore.applySync` comprueba el hash local dentro de la cola serial, y revalida permiso/contexto durante preparación, activación y registro final. Una pausa/cambio de cuenta durante los awaits provoca rollback al original; ningún registro intercalado se reemplaza con un snapshot viejo.

Firestore REST almacena `users/{uid}/chunks/{sha}`, `versions/{sha}` y `sync/head`. Fragmentos Unicode de hasta 256 KiB UTF-8, snapshot máximo 50 MiB, hashes SHA-256 y manifiestos acotados. La cabecera usa precondición sobre `updateTime`, evitando sobreescrituras ciegas. Fragmentos/versiones son inmutables; las reglas rechazan escritura fuera del UID, contenido que no coincide con el hash, campos adicionales y operaciones no autorizadas.

**Copias de recuperación** permite descargar las ramas conservadas con el mismo backup validado que usa «Tus datos». La cabecera conserva hasta 20 referencias para recuperarlas también después de reinstalar. La copia local muestra fecha y conteos; las referencias remotas pueden mostrar sólo el identificador hasta descargar. No hay limpieza automática de versiones/chunks antiguos, por lo que el almacenamiento crece y consume cuota. No se implementó borrado de cuenta/nube en este seguimiento; será necesario antes de publicar una app con cuentas en Google Play.

## Configuración reproducible

`.env.local` contiene únicamente identificadores públicos del cliente, está ignorado por Git y nunca contiene una cuenta de servicio. `.env.example` documenta las tres variables: `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Sin configuración válida, Ajustes muestra «Configuración pendiente»; no simula una conexión.

Auth REST renueva sesiones con exclusión mutua y persistencia serializada; cerrar sesión invalida respuestas antiguas. Android usa SecureStore y Credential Manager. Web guarda la sesión en IndexedDB y redirige la página completa para conservar COOP/COEP. El retorno se captura antes del primer render, valida estado aleatorio de un solo uso con caducidad de 10 minutos y retira el token del fragmento antes de procesarlo. Los errores del proveedor se reducen a mensajes canónicos sin credenciales.

Reglas publicadas desde `firebase/firestore.rules`, SHA-256 **`79bf10d818d81687236dc32603e8824e2483b863bca85b6ecd8b1510173b345d`**. Se reabrió la versión publicada y se comparó con la fuente, normalizando sólo finales de línea/espacio final. `firebase/deploy.json` prepara la misma fuente para una futura publicación autorizada con CLI; no contiene credenciales. La prueba de reglas usa `firebase/emulator.json`, proyecto ficticio `demo-dailoop-sync` y puertos separados. El lanzador exige CLI 14.26.0 y JDK 17 aislados bajo `output/tooling`; no reutiliza puertos ocupados ni credenciales cloud.

## Verificación y límites

Evidencia separada en `output/verification/v0.5.0/sync/`:

- `automated-sealed/checks.json`: 14/14 comprobaciones aprobadas y 405/405 pruebas de código. Incluyen 76 de fusión/controlador/identidad/protocolo/OAuth, 24 de panel/hook y 33 de almacenamiento. La ronda final no tiene avisos de lint.
- `rules/result.json`: 13/13 pruebas con Auth/Firestore Emulator reales; propiedad del UID, denegación cruzada/anónima, hashes/UTF-8, inmutabilidad, manifiestos y CAS. Sin acceso a producción; emuladores detenidos al finalizar.
- Playwright usa dos contextos Edge aislados con SQLite/OPFS e IndexedDB reales; intercepta exclusivamente Google/Identity Toolkit/Firestore con datos ficticios. Verifica consentimiento, mismos IDs/historial, trabajo offline, recuperación de pendientes, ausencia de duplicados y logout persistente. No confundir respuestas simuladas con prueba cloud real.
- `web-final/web-report.json`: 34/34 pruebas completas aprobadas, cero omitidas/fallos/flaky. `web-config-check/web-report.json` revalida sincronización y uso offline con el último export después de bloquear permisos Android heredados; 2/2 aprobadas.
- `google-live-read-only.jpg`: Google real, intercambio Auth REST y lectura privada Firestore real aprobados en origen QA 8797. La cuenta no tenía dataset online; GET devuelve ausencia permitida. Cero escrituras de actividades; sesión de prueba cerrada al terminar. La sesión Chrome controlada no tenía aislamiento COOP/COEP, por lo que se usó una página independiente para esta comprobación, sin alterar el requisito de SQLite de la aplicación.
- `storage-accepted.txt`: cancelar en `restore-prepared`, `restore-activated` y `registry-ready` conserva el snapshot original exacto; un registro local durante red rechaza activación obsoleta; una descarga válida persiste tras reabrir SQLite.
- `native-accepted.txt`: compilación Kotlin release, bundle Hermes y fusión del manifiesto aprobados, sin empaquetar/firmar/instalar APK. `native-manifest-check.json` confirma únicamente los permisos previstos, sin biometría/huella heredadas, sin tráfico HTTP claro ni backup del sistema. Google nativo, renovación real tras una hora y sincronización entre teléfonos físicos siguen pendientes de la próxima candidata autorizada.
- Revisión independiente del hook/store/identidad cerró carreras de retorno OAuth, receptor Web de fetch, callbacks tardíos, logout, cambio de cuenta y pausa durante preparación. No sustituye a una auditoría de seguridad exhaustiva ni a aceptación física.

Spark impone cuotas compartidas para el proyecto completo. Al agotarse se conserva el trabajo local y se informa el error; no se habilita facturación automáticamente. No equivale a nube ilimitada ni a un SLA. El inventario npm continúa con avisos transitivos documentados (57 nodos: 49 high, 8 moderate, 0 critical en esta revalidación); no se ejecutó `audit fix --force` ni se declara «sin vulnerabilidades».

Se mantiene **0.5.0/build 7** y los APK históricos intactos. No se ha generado APK nuevo ni publicado Git. La siguiente entrega Android, cuando el usuario la solicite, usará code 8 y deberá medir peso binario, permisos, firma y flujo Google en el S26 Ultra. El inspector de APK permite únicamente los dos permisos de red declarados expresamente por esta función, además del conjunto anterior.

## Peso

`bundle-and-deployment.json` compara con la versión local que ya incluía idiomas, usando el mismo gzip/deflate de Node: **17.725 bytes adicionales de JavaScript Web comprimido** y **99.369 bytes del bundle Hermes comprimido**. No son tamaños de APK; Credential Manager/SecureStore añaden código nativo que se medirá al empaquetar. Se evita añadir el SDK Firebase completo. Los APK entregados build 6/7 conservan hashes y tamaños exactos.
