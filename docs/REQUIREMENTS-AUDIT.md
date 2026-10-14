# Auditoría de requerimientos — siguiente iteración de Dailoop

**Actualización de alcance:** el usuario eligió implementar PF-01 a PF-05 juntos en **0.1.5** y aplazar PF-06/PF-07/PF-08 en esta rama. Este documento conserva la auditoría histórica anterior a la ejecución; el [PLAN-0.1.5.md](PLAN-0.1.5.md) y [PROGRESS-0.1.5.md](PROGRESS-0.1.5.md) recogen el encargo activado posteriormente y su resultado. La implementación Flutter de Gemini es independiente.

Fecha de consolidación: 2026-10-13, America/Bogota. Referencia de código: `f236b266b1ea625d324f52ae64972a1a35dacec5`, release pública `v1.0`. Referencia binaria: Dailoop 0.1.0, compilación 2, SHA-256 `d6ada37edd720ff1b5cf5198d6b3ed34e861835585e5e307fccdc10a8efac3c8`.

El encargo de esta sesión es listar y auditar los requerimientos anteriores y nuevos. Este documento propone criterios y orden de trabajo; no declara implementadas las mejoras ni decide una migración o un proveedor cloud. No se ha modificado código de producto, instalado dependencias, recompilado el APK, conectado servicios, creado cuentas ni publicado cambios durante la auditoría.

## 1. Lista consolidada y trazabilidad

P1: corregir problemas del uso actual. P2: mejoras de experiencia y distribución. P3: evolución de producto. Estas prioridades son una propuesta de la auditoría.

| ID | Origen y requerimiento | Estado actual | Prioridad / condición de cierre |
| --- | --- | --- | --- |
| PF-01 | Anterior: cambio de pestaña de aproximadamente un segundo o más y scroll a tirones; expectativa de fluidez a 120 FPS. | Reportado por el usuario en S26 Ultra / Android 17. Sin perfil de rendimiento físico. | P1. Medir latencia y fotogramas, corregir las causas demostradas y conservar el diseño aprobado. |
| PF-02 | Anterior: teclado tapa el campo y lo escrito. | Reportado en teléfono. El campo concreto todavía no está identificado. | P1. Campo, cursor y texto visibles durante edición en todos los formularios y búsquedas. |
| PF-03 | Anterior: elegir 1, 2, 3 o 4 columnas de actividades. | Una columna; no existe la preferencia de densidad. | P2. Selección persistente, tarjetas adaptadas y registro accesible; vista mínima con emoji, última vez y Registrar. |
| PF-04 | Nuevo: movimiento inspirado en Liquid Glass de iPhone. | Estética glass aprobada; no hay un sistema de movimiento equivalente. | P2, después de PF-01. Definir interacciones, interrupción y modo de movimiento reducido. |
| PF-05 | Nuevo: reducir el peso en megabytes. | APK universal de 67,2 MB para ARM64 y emulador x86_64. | P2. Comparar APK real antes/después, espacio instalado y regresión funcional. |
| PF-06 | Nuevo: base remota y sincronización manteniendo uso offline. | Solo SQLite local; sin red ni motor de sincronización. | P3. Uso local autónomo, cola persistente, sincronización idempotente, conflictos y aislamiento de usuarios. |
| PF-07 | Nuevo: posible login con Google. | Sin cuentas ni autenticación. Google es una opción planteada, no una decisión de proveedor. | P3, asociado a PF-06. Propuesta: acceso opcional para sincronizar, sin bloquear uso local. |
| PF-08 | Nuevo: evaluar pasar de React a Flutter. | React Native + Expo + TypeScript, con preview Web compartida. | Evaluación, no migración. Decidir con prototipos comparables si las mediciones justifican el coste. |

El [registro original](DEVICE-FEEDBACK.md) conserva el detalle de las observaciones. El usuario aprueba el diseño y confirma que crear actividades funciona bien. No ha cerrado todavía la comprobación de tiempos y registros: esas funciones no deben darse por certificadas en el teléfono a partir de esa frase.

## 2. Hallazgos de esta revisión

### Evidencia nueva: composición del APK

Se leyó el ZIP del APK existente, sin modificarlo ni construir una variante. MB en esta tabla significa 1.000.000 de bytes.

| Componente | Bytes dentro del APK | MB aproximados |
| --- | ---: | ---: |
| APK completo, incluyendo estructura y firma | 67.199.497 | 67,20 |
| Bibliotecas ARM64 | 22.364.144 | 22,36 |
| Bibliotecas x86_64 | 22.861.296 | 22,86 |
| Cuatro archivos DEX, suma comprimida | 14.523.203 | 14,52 |
| `assets/`, suma comprimida | 1.784.209 | 1,78 |
| `res/`, suma comprimida | 3.321.786 | 3,32 |

La evidencia local se guarda en `output/verification/requirements-audit/apk-size-baseline.json`. Las categorías indicadas no incluyen todas las entradas del ZIP. Las bibliotecas nativas están almacenadas sin compresión en este binario.

**Conclusión verificable:** se transportan aproximadamente 22,9 MB de bibliotecas x86_64 que corresponden a otra arquitectura, junto con ARM64. Separar la entrega para móvil ARM64 de la de emulador es una primera optimización candidata. El tamaño exacto resultante depende del empaquetado y debe medirse tras un build firmado; no se promete que el APK pase a un tamaño concreto.

También se comprobó que la plantilla nativa generada deja minificación y eliminación de recursos desactivadas por defecto y que las propiedades revisadas no las activan. Evaluar R8 y resource shrinking requiere probar los accesos por reflexión, recursos, SQLite, fuentes, archivos y arranque. Android documenta la reducción de código y recursos como mecanismos de optimización. [Guía oficial de tamaño Android](https://developer.android.com/topic/performance/reduce-apk-size).

No se atribuye el peso total al diseño glass ni se propone eliminar originales. Se deben distinguir tamaño de descarga, espacio instalado, RAM, tiempo de arranque y fluidez: son métricas diferentes.

### Evidencia estática: fluidez y teclado

- [ambience.tsx](../src/ui/ambience.tsx) construye tres campos decorativos con 60 capas cada uno: 180 vistas de color, además de sus contenedores.
- [material.tsx](../src/ui/material.tsx) añade blur, rellenos, bordes y varios degradados por superficie glass. [DailoopUI.tsx](../src/ui/DailoopUI.tsx) los usa en tarjetas, badges y navegación.
- Inicio renderiza las actividades mostradas mediante `map` dentro de un `ScrollView`. Historial limita inicialmente los registros a 40, pero no usa una lista virtualizada. No se afirma que todo el historial se monte de una vez.
- [reports.tsx](../src/ui/reports.tsx) calcula estadísticas, proyecciones y agrupaciones al renderizar Estadísticas; hay que medir su coste real con el volumen observado.
- [components.tsx](../src/ui/components.tsx) configura `KeyboardAvoidingView` con `padding` en iOS y comportamiento `undefined` en Android. Esto no garantiza que el campo enfocado quede visible: se debe comprobar también ajuste de ventana, modal, scroll y posición del cursor.
- `react-native-reanimated` y Worklets ya están instalados. La búsqueda en `src/` y `app/` no encontró un sistema propio basado en `useSharedValue`, `useAnimatedStyle`, `withSpring` o `withTiming`; no hace falta asumir otra dependencia de animación antes de evaluar las existentes.

Estos hechos identifican superficies para perfilar, **no prueban la causa de la lentitud ni del teclado**. La documentación de React Native distingue trabajo del hilo JS y rendimiento de UI; Reanimated recomienda limitar el número de componentes animados y preferir propiedades que no recalculen layout. [React Native: rendimiento](https://reactnative.dev/docs/performance), [Reanimated: rendimiento](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/).

## 3. Criterios de aceptación propuestos

Los valores numéricos siguientes son objetivos de trabajo propuestos; no son resultados medidos ni promesas ya aceptadas.

### PF-01 — Fluidez

- Medir sobre una build release en S26 Ultra / Android 17, anotando frecuencia real de pantalla, batería, temperatura, volumen y estado de arranque. Registrar por separado primer acceso y navegación tras calentamiento.
- Escenarios: al menos 20 cambios Inicio ↔ Estadísticas, scroll sostenido y apertura/cierre de formularios; comparar 10 y 100 actividades y una base sintética de 10.000 registros. No usar datos personales como fixture.
- Objetivo inicial: feedback al pulsar en menos de 100 ms y p95 de contenido útil de pestaña en 200 ms o menos. Separar esa latencia de la duración decorativa de una animación.
- Para pantalla efectivamente a 120 Hz, presupuesto por fotograma de aproximadamente 8,33 ms. Propuesta: al menos 95 % de fotogramas dentro del presupuesto durante el recorrido controlado y sin bloqueos superiores a 100 ms. Registrar también p99 y fotogramas perdidos; el promedio de FPS no basta.
- Conservar la confirmación de guardado solo después del commit local. Una animación de pulsación no debe simular un registro exitoso antes de persistirlo.

### PF-02 — Escritura visible

Comprobar creación/edición de actividad, nombre largo, categoría, emoji, nota multilinea, fecha/hora retroactiva, búsquedas y ajustes editables. Campo y cursor deben seguir visibles al abrir el teclado, pasar al siguiente campo y escribir varias líneas. No se debe perder texto al cerrar el teclado. Validar vertical/horizontal y texto al 200 %, con el teclado del teléfono; que un caso funcione con Gboard en emulador no cubre todos los casos.

### PF-03 — Columnas

Seleccionar 1/2/3/4, conservar la elección tras cerrar y abrir la app y mantener scroll vertical. En la vista más pequeña: emoji, última vez y Registrar. El registro continúa siendo una sola acción intencionada y no debe abrir detalle por accidente. Resolver cómo distinguir actividades con el mismo emoji; mantener etiquetas accesibles completas y áreas táctiles adecuadas. Antes de implementar, cerrar cómo se adaptan cuatro columnas cuando texto ampliado o pantalla estrecha no permiten mostrarlas de forma utilizable.

### PF-04 — Movimiento

Propuesta inicial: indicador de pestaña que se desplaza, respuesta elástica sutil al pulsar, apertura/cierre de diálogos y transición de distribución. Evitar animar todas las tarjetas o el blur continuamente. Las animaciones deben poder interrumpirse al volver a pulsar y respetar movimiento reducido. Conservar paleta, legibilidad y reflejos aprobados. Comparar trazas con movimiento activado/desactivado; no cerrar este punto si empeora PF-01. Inspiración visual no implica usar las APIs exclusivas de iOS en Android.

### PF-05 — Peso

Construir y comparar una variante ARM64 y, por separado, la variante para emulador. Medir tamaño real y espacio instalado con igual configuración. Evaluar optimización de DEX/recursos después, con una variable por comparación. Preservar originales y licencias de fuentes, firma de actualización, alineación de 16 KiB y capacidades offline. El objetivo de MB se fijará tras medir la primera variante; el ahorro estimado de arquitectura no certifica otro APK.

## 4. PF-06 / PF-07 — Sincronización y acceso

La solicitud cambia el alcance original, que excluía nube y cuentas. Para esta auditoría se acepta como **evolución a diseñar**. El contrato actual de la app y sus permisos no se han cambiado. `app.json` bloquea INTERNET y ACCESS_NETWORK_STATE: una futura implementación debe revisar esos permisos y los adaptadores, sin añadir dependencias de red al dominio.

### Contrato propuesto de producto

1. Primer arranque y uso local completos sin cuenta ni conexión.
2. Cada acción se confirma tras guardarse en SQLite; la nube queda fuera del camino crítico del botón Registrar.
3. Con sincronización activada, guardar el cambio y su intención de envío en una transacción local. La cola sobrevive a cierre, reinicio y falta de conexión.
4. Enviar/reintentar al recuperar conexión sin duplicar operaciones; descargar y validar cambios remotos antes de aplicarlos transaccionalmente.
5. Mostrar estado comprensible: solo local, cambios pendientes, al día o necesita reconectar. Una sesión expirada pausa la sincronización, sin borrar ni bloquear la base local.
6. Proponer Google como opción de identidad. El primer acceso y la descarga en un dispositivo nuevo necesitan red; el acceso al historial ya almacenado no debe depender de refrescar un token.

Google autentica a la persona; no sustituye la base ni el protocolo de sincronización. Expo documenta configuración propia de Android y de la huella del certificado para Google Sign-In. La ruta concreta debe revalidarse para las versiones fijadas y para el APK firmado localmente, sin asumir una obligación de usar EAS o una tienda. [Google authentication en Expo](https://docs.expo.dev/guides/google-authentication/).

### Decisiones que deben cerrarse antes del backend

- Alcance de sincronización: Android entre dispositivos, y si incluye además la preview Web; actividades, registros, auditoría y cuáles preferencias son por dispositivo.
- Datos privados: la marca actual controla reportes, no una política cloud. Decidir explícitamente qué se permite subir. No reutilizarla como consentimiento automático.
- Vinculación de datos locales con cuenta: revisión previa, backup y reglas para no reemplazar silenciosamente una base al iniciar sesión. Aislar datos al cambiar de usuario o cerrar sesión.
- Conflictos: dos dispositivos pueden crear la misma siguiente revisión. El esquema local actual tiene secuencia única y números de revisión únicos por entidad; concatenar bases o ordenar solo por reloj no resuelve concurrencia. Diseñar causalidad, IDs, ramas/conflictos y una proyección vigente determinista sin destruir auditoría.
- Restauración de backup: reemplaza la base en v1. Definir generación de dataset y comportamiento de la cola para impedir que envíos antiguos o réplicas remotas deshagan esa restauración.
- Borrado de cuenta, conservación local, recuperación de acceso, retención y eliminación remota. La auditoría append-only no resuelve por sí sola estas decisiones.
- Protección: autorización en servidor por propietario, tokens en almacenamiento seguro, ningún secreto administrativo dentro del APK o repositorio. Decidir si se requiere cifrado de extremo a extremo y recuperación de claves; autenticación o HTTPS no equivalen a ello.
- Coste operativo, límites de cuota, región y portabilidad. No se ha elegido plan ni creado un recurso de pago.

### Opciones a comparar

| Opción | Encaje a evaluar | Riesgo o trabajo pendiente |
| --- | --- | --- |
| SQLite + API propia + PostgreSQL/Supabase Auth | Mantener el modelo local y controlar reglas de reconciliación. | Diseñar cola, cursores, reintentos, permisos y conflictos; conectar Supabase no implementa automáticamente ese protocolo. |
| SQLite + Supabase + capa especializada como PowerSync | Su integración documenta sincronización Postgres/SQLite y cola de subida. | Verificar compatibilidad con Expo, esquema de revisiones, restore, autenticación, coste y dependencia de otro componente. [Integración oficial](https://supabase.com/partners/integrations/powersync). |
| Firebase Auth + Firestore | Alternativa con persistencia offline y sincronización documentadas en clientes compatibles. | Firestore documenta última escritura ganadora para cambios sobre el mismo documento; no basta para preservar la auditoría de Dailoop. Revisar modelo y SDK nativo/Web, integración con Expo y migración de SQLite. [Offline Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [Firebase en Expo](https://docs.expo.dev/guides/using-firebase/). |

No se declara ganadora. Se propone primero especificar el contrato y comprobarlo con dos dispositivos aislados: ambos offline crean y corrigen datos, reconectan en diferente orden, repiten envíos y reinician. El resultado debe converger, conservar operaciones y no duplicar registros. Incluir reloj atrasado, token expirado, fallo parcial, restauración, acceso cruzado entre cuentas y datos privados según la política elegida.

## 5. PF-08 — Evaluación de Flutter

Recomendación provisional: medir y optimizar primero React Native. Ya hay una base funcional, lógica de dominio y pruebas; la revisión ha identificado oportunidades concretas de empaquetado y composición visual. Eso no demuestra que baste para cumplir la fluidez deseada.

Flutter es una alternativa válida para comparar, no una garantía de menos MB o más FPS. Su documentación también exige medir el tamaño propio y perfilar sobre dispositivo físico. [Tamaño en Flutter](https://docs.flutter.dev/perf/app-size), [Rendimiento en Flutter](https://docs.flutter.dev/perf/ui-performance).

Una comparación útil requiere la misma pantalla glass, recursos, tipografía, volumen, dispositivo, escenarios y arquitectura ARM64; comparar una demo Flutter vacía con el APK universal actual sería engañoso. Medir latencias, fotogramas, memoria, arranque, batería y tamaño. Fijar previamente qué mejora justificaría reescribir.

Si las optimizaciones medidas no alcanzan los objetivos, proponer un prototipo aislado de Inicio y Estadísticas en Flutter. Migrar implicaría portar UI y dominio TypeScript a Dart, rehacer integración de datos/archivos y pruebas, mantener backup v1, historia y formatos de tiempo, y validar actualización con el mismo paquete y firma. No desinstalar ni hacer incompatible la base existente. La preview Web también debe entrar en la estimación. No hay decisión de reescritura en esta sesión.

## 6. Orden propuesto y resultado de la auditoría

1. **Baseline físico y correcciones:** reproducir teclado, medir pestañas/scroll y aislar coste de blur, capas, cálculos y montaje de listas. Preservar estética y persistencia.
2. **Empaquetado y densidad:** variante ARM64, optimización de recursos y diseño de 1–4 columnas, con regresión de datos y accesibilidad.
3. **Movimiento:** prototipo pequeño sobre la base ya fluida; cerrar cada interacción con métricas y movimiento reducido.
4. **Decisión de framework:** aceptar continuar o justificar un prototipo Flutter mediante el benchmark; cerrar antes de acoplar una implementación cloud a un framework nuevo.
5. **Sincronización y cuenta:** cerrar contrato, conflictos, privacidad y proveedor; realizar spike aislado antes de tocar datos personales.

Los criterios se revisan con el usuario antes de convertirlos en una fase de implementación. No hay fecha prometida de entrega ni una nueva versión compilada. El APK público y la release `v1.0` permanecen como baseline.

**Dictamen de especificación:** ocho puntos trazados; PF-01/PF-02 son defectos reportados, PF-03/PF-04/PF-05 mejoras solicitadas y PF-06/PF-07/PF-08 requieren decisiones de producto o arquitectura. El requisito de Google sigue siendo candidato; el de Flutter es evaluación.

**Dictamen técnico:** evidencia directa de composición del APK y evidencia estática de oportunidades/riesgos. La causa del problema físico, la mejora exacta de tamaño, el rendimiento a 120 Hz, un proveedor cloud y la conveniencia de migrar permanecen sin demostrar. Esta auditoría no es una aprobación de release ni una auditoría exhaustiva de seguridad.

Método: lectura del contrato y de los documentos de requisitos relevantes, revisión del código y configuración indicados, análisis ZIP del APK existente y consulta de fuentes primarias enlazadas. No se ejecutaron nuevas pruebas de rendimiento, compilaciones o suites funcionales. La consulta de arquitectura externa no estuvo disponible: la comprobación de su helper devolvió `parent_runtime_unavailable`; no hubo respuesta de asesor ni ejecución de consulta.
