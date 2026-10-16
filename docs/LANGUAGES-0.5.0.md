# Idiomas completos — seguimiento local de 0.5.0

Se incorpora únicamente la selección de idioma solicitada: Español, English y Português (Brasil). Español continúa siendo el idioma inicial cuando no existe una preferencia válida. En Ajustes → Idioma el cambio se aplica sin reiniciar y se conserva al cerrar/abrir. No hay selección automática que sustituya la elección del usuario.

## Alcance

- Registro, categorías/carpetas, historial, estadísticas, ajustes, formularios, confirmaciones, errores conocidos y accesibilidad.
- Calendarios, meses/días, selectores de hora/anticipación y repetición de recordatorios.
- Reportes Markdown, sus controles de guardado/compartir y textos de notificaciones locales/rachas. Cambiar idioma actualiza los avisos pendientes, conservando sus identificadores y horarios, sin volver a pedir permiso.
- Nombres y búsqueda de los 3.953 emojis en ambos idiomas añadidos. Datos Unicode CLDR 48.0.0 locales, con fuentes y hashes en `src/ui/data/emoji-locales-sources.json`; licencia Unicode conservada.

Las actividades, categorías, notas y motivos guardados son datos del usuario y permanecen literales, incluso si se llaman «Ajustes», «Todas» o «Cancelar». Los ejemplos de demostración ya almacenados tampoco se reescriben. Los diálogos/permisos propios de Android siguen el idioma del sistema. Los diagnósticos técnicos desconocidos se conservan para poder investigarlos.

## Integración y datos

Catálogos puros y un contexto React local; sin librerías, fuentes ni imágenes nuevas. Cada texto de aplicación se marca explícitamente: no se traducen indiscriminadamente hijos de componentes ni contenido del usuario. Los parámetros se interpolan una sola vez.

El idioma usa la preferencia de presentación existente (`dailoop.presentation.v1` Web; `dailoop-presentation-v1.db` Android), fuera del conjunto portátil auditado. Se publica después del guardado confirmado; un fallo conserva la selección anterior. No cambia el esquema de registros, formatos de backup, comandos, fechas ISO, instantes, límites de privacidad ni cálculos. Reportes y notificaciones reciben idioma explícito; español sigue siendo el comportamiento por defecto de sus APIs. Los formularios y selecciones conservan sus borradores al actualizar el contexto.

El arranque espera la lectura de preferencias antes de mostrar la interfaz, para evitar un destello del idioma inicial. Android añade únicamente los datos portugueses de Intl a los polyfills ya existentes. La preview cargada permite cambiar idioma sin red; el arranque Web offline sigue sin ser una PWA.

## Peso medido

No es posible añadir traducciones con literalmente cero bytes. Se evita todo paquete y recurso gráfico adicional. Comparación reproducible en `output/verification/v0.5.0/languages/bundle-before.json` y `bundle-after.json`:

- JavaScript Web comprimido: incremento **135.127 bytes**, aproximadamente **132 KiB** (gzip de Node, mismo runtime/método que la medición anterior).
- Bundle Hermes Android: incremento **282.454 bytes**, aproximadamente **276 KiB**, al comprimir ambos bundles con el mismo deflate nivel 6. Incluye catálogos y datos portugueses de Intl.
- Esta última cifra mide el bundle comprimido, **no el tamaño de un APK nuevo**. El tamaño final se verificará cuando el usuario autorice otra compilación. No se ha generado APK en este seguimiento.

El APK entregado build 7 conserva exactamente 38.088.136 bytes y SHA-256 `2f45990c2b88b0913b2ba43807b8f44ee74d5243ef1ddd99c3084542179aa00d`. El APK histórico build 6 también se conserva intacto. No se ha publicado Git ni modificado la versión: 0.5.0/build 7; siguiente APK autorizado, code 8.

## Verificación

Evidencia nueva y separada en `output/verification/v0.5.0/languages/`:

- `final-automated/checks.json`: **13/13 comprobaciones aprobadas y 305/305 pruebas de código**: tipos, lint, dominio, almacenamiento, UI/unitarias, estrés, decodificación, recurrencia/lector Android, mitigaciones de tooling, assets y matriz Expo.
- Pruebas de catálogos/variables, preferencias antiguas/invalidación/fallo de guardado, datos del usuario intactos, comandos de deshacer canónicos, borradores vivos, reportes/avisos e identidad/horarios de notificaciones.
- `languages.spec.ts`: recarga y persistencia, cambio sin conexión, backups con estado idéntico, búsqueda de emojis, selectores gráficos, recurrencia y exportación Markdown EN/PT en contextos de navegador aislados.
- Revisión independiente corrigió un texto técnico sin traducir, un error defensivo y la traducción accidental de un motivo de auditoría antes de completar la validación.
- `native-intl.txt`: Intl con formatter reemplazado confirma octubre/October/outubro y decimales ES/EN/PT, conservando America/Bogota.
- `native-bundle-final.txt`: creación del bundle Android/Hermes aprobada, sin empaquetar, firmar ni instalar APK. La prueba física del selector/avisos portugueses y el peso final Android esperan la siguiente compilación autorizada.

Las primeras iteraciones Web detectaron selectores de prueba ambiguos y la confirmación de descarte de borradores; se corrigió la interacción de las pruebas conservando esa protección del producto. Los resultados finales de aceptación y cualquier revalidación se documentan junto a sus informes, sin borrar intentos anteriores.

Una primera ronda completa Web pasó 32/33; la prueba de separación demo/personal pulsó después de descargar pero antes del cierre animado. La revalidación aislada aprobó. El helper espera ahora que desaparezca el diálogo, siguiendo el mismo contrato que la navegación; la ronda final se registra en `final-web/web-report.json`. No se alteró el mecanismo de cambio de base.

**Resultado final: 33/33 pruebas Web aprobadas**, incluidas las 31 regresiones existentes y los dos recorridos completos EN/PT; 305/305 pruebas de código y 13/13 comprobaciones generales aprobadas. Revisión visual de los formularios EN/PT a 390 px y escenarios existentes a 360/390/430/escritorio. No se probó en el teléfono físico ni se modificó la base personal del navegador.
