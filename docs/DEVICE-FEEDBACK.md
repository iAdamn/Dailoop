# Observaciones del usuario en el teléfono

Registro de pruebas manuales del usuario. Estos comentarios quedan pendientes para una revisión posterior; no autorizan iniciar correcciones ahora.

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

Solo se registra el feedback. No se han modificado el código, la configuración ni el APK a raíz de estas observaciones.
