# Observaciones del usuario en el teléfono

Registro histórico de pruebas manuales del usuario, inicialmente conservado sin iniciar correcciones. La ejecución 0.1.5 fue autorizada posteriormente; el [estado de ejecución](PROGRESS-0.1.5.md) y [QA](QA-0.1.5.md) registran resultados y pendientes. Las observaciones originales de abajo describen 0.1.0.

Decisión posterior del usuario: **0.1.5 con PF-01 a PF-05**, activada por «Ahora tú ejecuta tu parte». PF-06, PF-07 y PF-08 quedan aplazados en esta rama: no sincronización, Google ni evaluación/migración Flutter en esta versión. Gemini tiene una implementación Flutter independiente en la carpeta hermana. [Plan](PLAN-0.1.5.md).

## PF-01 — Lentitud al navegar y desplazamiento a tirones

- Fecha del reporte: 2026-10-13 (America/Bogota).
- Dispositivo indicado por el usuario: Samsung S26 Ultra, Android 17.
- APK de referencia entregado: Dailoop 0.1.0, compilación 2. La versión instalada no se ha verificado directamente en el teléfono.
- Estado: documentado, pendiente de tratar cuando el usuario lo indique.
- Observación: al pasar de Inicio a Estadísticas, el cambio de pestaña tarda aproximadamente un segundo o más. El usuario percibe lentitud general al moverse por la interfaz.
- Observación: el desplazamiento vertical se siente a tirones, sin la fluidez esperada.
- Expectativa expresada: una experiencia fluida a 120 FPS. No hay mediciones de FPS, tiempos de fotograma ni latencia en el dispositivo; el segundo de espera es una estimación del usuario.
- Causa: sin diagnosticar. Este reporte no establece una causa ni se atribuye al ANR histórico del emulador.
- Restricción: conservar el diseño visual, que el usuario aprueba expresamente.

### Otras observaciones de la misma sesión

- Crear actividades funciona bien según el usuario.
- El usuario continúa comprobando los tiempos y el registro de las actividades; todavía no hay una conclusión de esa comprobación.
- En Ajustes, el usuario indica que puede cambiar las opciones de fecha y hora y selecciona formato de 24 horas y America/Bogota. La exactitud de los registros con esa configuración sigue pendiente de su prueba.

## PF-02 — El teclado tapa el campo al escribir

- Fecha del reporte: 2026-10-13 (America/Bogota).
- Dispositivo: Samsung S26 Ultra, Android 17, en la misma sesión de prueba.
- Estado: documentado, pendiente de tratar cuando el usuario lo indique.
- Observación: al enfocar un campo situado en la zona que ocupa el teclado, este aparece y cubre el campo. El usuario no puede ver lo que está escribiendo.
- Observación: la pantalla no se desplaza para mostrar el campo enfocado ni ofrece una zona de edición visible sobre el teclado.
- Resultado esperado: mantener visibles el campo enfocado, el cursor y el texto durante la escritura, ajustando la pantalla o su desplazamiento al abrir el teclado.
- Alcance por confirmar: no se ha identificado un campo o formulario concreto; no se afirma que ocurra en todos los campos.
- Causa: sin diagnosticar. La prueba anterior del emulador con teclado visible no descarta este problema observado en el teléfono físico.

## PF-03 — Distribución personalizable de las actividades

- Fecha de la solicitud: 2026-10-13 (America/Bogota).
- Tipo: nueva función de personalización solicitada por el usuario.
- Estado: documentada, pendiente de tratar junto con los demás detalles.
- Solicitud: poder elegir una distribución de una, dos, tres o cuatro columnas para las actividades, según el gusto del usuario.
- Una columna: conservar la distribución actual.
- Dos, tres y cuatro columnas: reducir y adaptar las tarjetas para que quepan en una cuadrícula con desplazamiento vertical.
- Vista más compacta: mostrar solo el emoji de la actividad, la última vez y la acción Registrar, manteniendo esos elementos visibles y utilizables.
- Objetivo: permitir ver más actividades a la vez y escoger la densidad de la pantalla.
- Detalles por definir al abordar la función: ubicación del selector, contenido de los tamaños intermedios y adaptación a texto ampliado y distintos anchos de pantalla. La vista compacta también deberá permitir identificar y abrir cada actividad sin ambigüedad cuando compartan emoji.

## PF-04 — Animaciones inspiradas en Liquid Glass

- Solicitud de esta sesión: acompañar la estética aprobada con movimiento similar al de Liquid Glass en iPhone.
- Estado: incluida en la auditoría; interacciones y animaciones concretas por definir.
- Condición: preservar la identidad visual y resolver la fluidez antes de añadir efectos que puedan empeorarla.

## PF-05 — Reducir el peso de la aplicación

- Solicitud de esta sesión: optimizar los megabytes de la aplicación, además de la fluidez.
- Estado: incluida en la auditoría, sin recompilación.
- Medición del APK entregado: 67.199.497 bytes. Incluye ARM64 y x86_64; las bibliotecas de x86_64 ocupan 22.861.296 bytes dentro del ZIP. Esto identifica un posible ahorro de empaquetado, no el tamaño verificado de otro APK ni el espacio instalado.

## PF-06 — Sincronización que mantenga el uso offline

- Solicitud de esta sesión: evaluar una base remota para guardar y sincronizar los datos sin condicionar el uso a disponer de Internet.
- Estado: requisito para diseñar y auditar; proveedor, alcance y resolución de conflictos pendientes.
- La app entregada solo tiene SQLite local. No se ha creado ni conectado ningún backend en esta revisión.

## PF-07 — Posible acceso con Google

- Propuesta del usuario: login con Google como posible mecanismo de acceso a la sincronización.
- Estado: opción candidata; no se ha decidido que sea obligatorio ni que sea el único proveedor.
- La auditoría propone conservar el uso local sin cuenta y reservar la autenticación para la sincronización.

## PF-08 — Evaluar React Native frente a Flutter

- Solicitud de esta sesión: evaluar la sugerencia de pasar de React a Flutter.
- Aclaración del estado actual: el producto móvil usa React Native + Expo + TypeScript; React Native Web sirve la preview.
- Estado: evaluación pendiente de métricas comparables. No hay decisión de migrar ni reescritura autorizada por esta auditoría.

La consolidación de requisitos, evidencia, criterios de aceptación propuestos y decisiones abiertas está en [REQUIREMENTS-AUDIT.md](REQUIREMENTS-AUDIT.md).

El registro original solo documentaba el feedback. Las modificaciones y pruebas posteriores están en los documentos 0.1.5 enlazados al inicio; esta lista conserva el reporte del teléfono sin atribuirle resultados del emulador.
