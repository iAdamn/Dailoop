# Dailoop 0.1.5 — plan de desarrollo y handoff ejecutable

Fecha: 2026-10-13, America/Bogota. Plan preparado antes de la ejecución; activado posteriormente por «Ahora tú ejecuta tu parte». El resultado vigente y los criterios pendientes se registran en [PROGRESS-0.1.5.md](PROGRESS-0.1.5.md). Directorio exclusivo: `C:\!Codex\Dayloop\Dailoop`.

Actualización posterior del usuario: se prepara una implementación Flutter paralela para Gemini Argo en `../Dailoop-Flutter`. Es un proyecto independiente, no una migración ni una fase de este plan. Este documento mantiene el desarrollo React Native de los cinco cambios; no autoriza a su ejecutor a escribir en el proyecto Flutter.

## 1. Orden del usuario y activación

El usuario solicita reunir en la próxima versión los cinco cambios de experiencia y peso, mantener React Native y aplazar Flutter, sincronización y Google. Quiere cambiar de modelo y escribir solamente **«ejecutar»** para iniciar el trabajo.

Al recibir esa orden en este chat, leer este documento, [PROGRESS-0.1.5.md](PROGRESS-0.1.5.md) y `AGENTS.md`; después ejecutar las fases sin volver a proponer el plan ni pedir autorización para cada cambio reversible. Respetar cualquier instrucción posterior. No iniciar desarrollo en el turno que solo prepara este handoff.

La autorización explícita previa para construir APK locales firmados está registrada en el proyecto («Vamos con el APK»); la ejecución de esta iteración mantiene ese objetivo. Las compilaciones locales necesarias para medir tamaño y validar 0.1.5 se hacen después de los checkpoints de código/preview, sin pedir de nuevo esa misma autorización. No se autoriza instalar en un teléfono personal, publicar en una tienda, usar EAS ni crear servicios cloud. La publicación pública de una nueva release no forma parte de este plan: preparar los archivos y el changelog, sin reemplazar la release anterior.

## 2. Modelo y organización

**Recomendación principal: GPT-6.1 Sol, razonamiento High / Alto.** Usarlo para implementar, integrar y diagnosticar. No hace falta cambiar de modelo entre fases ni seleccionar Max/Ultra de forma general.

| Papel | Modelo recomendado | Uso |
| --- | --- | --- |
| Responsable de ejecución | GPT-6.1 Sol · High | UI, persistencia de preferencias, mediciones, Android e integración. |
| Subagente de QA independiente | El mismo modelo heredado | Revisar criterios y pruebas en archivos asignados, sin editar simultáneamente archivos del responsable. |
| Consulta excepcional, si se decide necesaria | GPT-6 Astra · High | Diagnóstico material que siga sin explicación tras trazas y experimentos acotados. No es necesario para arrancar ni debe activarse como requisito artificial. |

Esta selección es una recomendación para este trabajo, no un benchmark específico de Dailoop. La documentación oficial presenta GPT-6.1 Sol como opción para programación compleja con equilibrio de capacidad y coste; el nivel High es compatible. [Modelo GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [selección de modelos](https://developers.openai.com/api/docs/guides/model-selection).

Conservar la elección del usuario y revalidar disponibilidad si cambia el catálogo. Si se escala a otro modelo, hacerlo de forma explícita. No crear otro chat para subtareas: usar las herramientas de subagentes disponibles. La autorización original y el master prompt piden subagentes; asignar como máximo dos trabajos independientes a la vez y un único operador de emulador. Empezar con responsable + QA; dividir más solo cuando existan fronteras claras. Si el entorno no los ofrece, ejecutar esos roles secuencialmente e indicarlo.

## 3. Alcance cerrado

| ID | Entrega en 0.1.5 | Fuera del alcance |
| --- | --- | --- |
| PF-01 | Navegación y desplazamiento más fluidos, con evidencia antes/después. | Prometer 120 FPS solo por una captura o un promedio. |
| PF-02 | Campo y cursor visibles con teclado abierto en formularios y búsquedas. | Añadir un editor o formulario paralelo innecesario. |
| PF-03 | Preferencia de una a cuatro columnas y tarjetas adaptadas. | Reordenación por arrastre, carpetas o categorías nuevas. |
| PF-04 | Movimiento breve y coherente con el glass aprobado. | Cambiar identidad, añadir efectos continuos costosos o imitar APIs exclusivas de iOS. |
| PF-05 | Entrega ARM64 y reducción segura de código/recursos medible. | Sacrificar datos, recursos de marca, capacidades offline o compatibilidad para alcanzar un número arbitrario. |

**Aplazados expresamente:** PF-06 sincronización, PF-07 Google/cuentas, PF-08 comparación o migración a Flutter. No crear spikes, dependencias, permisos de red ni infraestructura para ellos. Mantener React Native + Expo + TypeScript + SQLite y el SDK compatible fijado.

## 4. Baseline y límites que se preservan

- Último commit público conocido: `f236b266b1ea625d324f52ae64972a1a35dacec5`, repositorio `https://github.com/iAdamn/Dailoop`, tag `v1.0`. Ese tag es la primera publicación del repositorio; el APK tiene versión interna 0.1.0, versionCode 2.
- APK previo: `output/releases/Dailoop-0.1.0.apk`, 67.199.497 bytes, SHA-256 `d6ada37edd720ff1b5cf5198d6b3ed34e861835585e5e307fccdc10a8efac3c8`. Conservarlo; no sobreescribirlo.
- Certificado público SHA-256: `72c065f017d9d53ead5934316a732424c2ae639beafc3c2937c4b89932b61310`. Reutilizar la identidad privada existente, fuera del repositorio. Nunca regenerarla si falta; reportar el bloqueo concreto y seguir con trabajo independiente.
- Paquete: `local.dailoop.personal`. Android mínimo declarado API 24, target/compile 36. Objetivo de prueba del usuario: Samsung S26 Ultra / Android 17. No declarar validación en ese teléfono si no se ha ejecutado allí.
- Preservar paleta, tres PNG originales, fuentes Outfit/Manrope y contraste. Los assets originales se verifican con `npm run check:assets`.
- Mantener éxito solo después de commit, IDs/idempotencia, hora efectiva y de creación, revisiones append-only, registros retroactivos, privados en reportes y restauración transaccional.
- Mantener primer arranque sin conexión, sin cuenta, datos locales, permisos mínimos, OTA desactivada y exclusiones de backup del SO. SQLite y reportes actuales no se sustituyen.
- Baseline documental: [auditoría](REQUIREMENTS-AUDIT.md), [feedback](DEVICE-FEEDBACK.md), [Android anterior](ANDROID-RELEASE.md), [build local](ANDROID-BUILD.md), [UI aprobada](UI-POLISH.md).
- Hay documentos modificados/no registrados del trabajo de auditoría y planificación. Inspeccionar `git status` y conservarlos; no resetear ni limpiar el checkout. No ejecutar pruebas sobre las bases personales del navegador.

## 5. Decisiones de implementación para evitar ambigüedades

### Preferencias de presentación y backups

El backup v1 valida estrictamente `DomainState.settings` y reconstruye ajustes desde operaciones. Añadir columnas directamente a ese objeto sin una estrategia rompería exportación/restauración.

Para esta iteración, **guardar la distribución como preferencia local de presentación por dispositivo**, independiente del dataset y del backup v1. Reutilizar `expo-sqlite`; no incorporar otra librería de almacenamiento por conveniencia. Implementar un puerto pequeño y un adaptador con almacenamiento dedicado, versionado y serializado; puede ser una base separada de preferencias. No alterar `MIGRATION_1`: su checksum ya identifica las bases instaladas. Una preferencia ausente comienza en una columna; una preferencia inválida puede recuperarse al valor por defecto sin tocar la base de registros. Un error de escritura de preferencias debe comunicarse sin afirmar que se guardó.

Al restaurar un backup de datos o cambiar a demo en Web se conserva la preferencia del dispositivo. Documentarlo. Los backups previos de 0.1.0 siguen importándose y el nuevo backup de datos mantiene su formato y auditoría. La configuración de columnas no se exporta en v1; no es un ajuste de negocio ni una operación auditable de actividad.

### Distribución

- Selector 1 / 2 / 3 / 4 en Ajustes con estado seleccionado y etiquetas accesibles. Una columna debe conservar la composición aprobada.
- Dos columnas: tarjeta intermedia con nombre identificable, emoji, última vez y Registrar. Tres: tarjeta más compacta con nombre breve si cabe. Cuatro: emoji, última vez abreviada y Registrar; conservar nombre completo en accesibilidad y acceso a detalle.
- Pulsar el emoji/área de información abre detalle; Registrar solo registra. Opciones de actividad siguen disponibles desde detalle. Resolver el caso de emojis repetidos mediante accesibilidad y un acceso de identificación claro; no cambiar el nombre del registro ni su identidad por posición.
- Mantener preferencia solicitada y calcular columnas efectivas según ancho disponible y fontScale. En el S26 con texto normal, verificar las cuatro. Con texto al 200 % o ancho insuficiente, reducir las columnas efectivas para conservar campos legibles y controles de al menos 48 dp; indicar la adaptación sin sobrescribir la preferencia elegida.
- No desactivar escalado de fuente para hacer caber cuatro columnas. Scroll vertical; no introducir scroll horizontal por densidad.
- Usar lista virtualizada cuando la medición/volumen lo justifique. No anidar una lista virtualizada vertical dentro del ScrollView vertical actual. Resolver encabezado/pie con la lista y preservar foco/posición de manera explícita al cambiar densidad.

### Movimiento

Reutilizar Reanimated/Worklets ya fijados. Empezar con indicador de pestaña, feedback de pulsación, apertura/cierre de modales y cambio de densidad. Referencia de diseño: desplazamiento y elasticidad suaves, duraciones aproximadas 120–240 ms a ajustar visualmente. La pantalla debe responder antes de terminar el efecto; una transición larga no debe tapar latencia real.

Preferir transformaciones/opacidad; no animar blur, sombras complejas o 180 capas de fondo por fotograma. No animar todas las tarjetas al scrollear ni añadir bucles permanentes. Respetar la preferencia del sistema de movimiento reducido y cambios de esa preferencia durante la sesión. La animación es interrumpible y no mantiene toques bloqueados innecesariamente. No anunciar éxito de registro antes de persistir.

### Peso

El ZIP previo contiene 22.861.296 bytes en `lib/x86_64` y 22.364.144 en `lib/arm64-v8a`. La entrega principal será **ARM64**, con una build x86_64 separada solo para QA si el emulador la necesita. No comprimir manualmente el APK firmado ni quitar entradas a mano: toda variante debe venir del build, mantener alineación y verificarse.

Objetivo de ingeniería inicial: **APK ARM64 de 40 MB o menos**. Umbral mínimo de mejora: **al menos 30 % menos** que 67.199.497 bytes (máximo 47.039.647 bytes), además de revisar las optimizaciones seguras restantes. El objetivo de 40 MB es una meta, no un resultado prometido: si no se alcanza, publicar la cifra real, el desglose y el impedimento; no declarar la meta cumplida ni degradar funciones para ocultarlo. No inventar una referencia universal de cuántos MB «debe» pesar una app.

Evaluar R8/minificación y resource shrinking, actualmente desactivados por defecto en el nativo generado. Probar primero separar ABI y después activar optimización con reglas justificadas, conservando comparativas. No retirar locales/polyfills de fechas, zonas, Unicode, fuentes o librerías nativas sin comprobar sus usos y la regresión. No cambiar el SDK completo como parte de esta optimización.

## 6. Fases y checkpoints

### P0 — Preparación y reproducción

1. Leer contratos/estado, registrar HEAD, diff y versiones; no reabrir el proyecto anterior. Revalidar Node/npm/JDK/SDK y dependencias compatibles antes de instalar o cambiar nada. No actualizar paquetes a latest ni ejecutar audit fix de forma general.
2. Comprobar activos y la integridad del APK baseline. Preservar evidencias anteriores en sus rutas; crear las nuevas bajo `output/verification/v0.1.5/`.
3. Crear fixtures ficticios de 10/100 actividades y 10.000 registros reutilizando los existentes cuando sea posible. No ampliar límites del producto.
4. Reproducir navegación, scroll y teclado en el destino aislado disponible. Capturar el primer acceso y el acceso tras calentamiento, teclado, orientación, fontScale y temas.
5. Si el S26 no está conectado/autorizado para pruebas, continuar con emulador y preview; marcar la medida física pendiente. No detener toda la implementación esperando al usuario ni atribuir al S26 las medidas del emulador.

**CP0:** baseline verificable y plan de experimentos; distinguir reporte humano, reproducción propia e hipótesis.

### P1 — Teclado y fluidez

Superficie principal: `src/ui/components.tsx`, `forms.tsx`, `DailoopUI.tsx`, `reports.tsx`, `material.tsx`, `ambience.tsx` y `src/Application.tsx` solo donde las trazas lo justifiquen.

- Teclado: revisar ajuste de ventana Android/modal, espacio disponible y scroll al campo enfocado/cursor. Usar APIs compatibles con el SDK y evitar offsets de teclado codificados para un teléfono. Comprobar nota multilinea larga, campos al final y siguiente campo. Una alternativa que solo funciona tras cerrar el teclado no resuelve PF-02.
- Fluidez: perfilar y aislar montaje de tarjetas, capas decorativas, blur, recomposición de pantalla y cálculos de Estadísticas. Las 180 vistas de color son una oportunidad candidata, no una causa asumida. Reducir complejidad manteniendo el resultado aprobado.
- Evitar cálculos/proyecciones repetidos y renders por reloj cuando no cambian los datos de esa pantalla. Selectores/caché/memoización deben invalidarse al cambiar registros, período, zona y preferencias; no mostrar estadísticas antiguas por optimizar.
- Cambiar una causa por experimento y comparar. No reescribir el dominio ni sustituir SQLite para solucionar un problema visual.

**CP1:** pruebas de teclado y navegación documentadas, no pérdida de formularios y comparativa de rendimiento de cambios materiales.

### P2 — Preferencias y cuadrícula 1–4

Crear el contrato de preferencias y su adaptador antes de conectar el selector. Añadir valores por defecto, validación y prueba real de persistencia al reiniciar. Implementar las cuatro composiciones, adaptación accesible y navegación/registro independientes. Revisar lista vacía, una actividad, emojis repetidos, nombre largo, privada/archivada, cambio de tema, densidad y orientación.

**CP2:** cuatro opciones operativas y persistentes; backup v1 y registros intactos. Capturas de claro/oscuro, densidades y texto ampliado.

### P3 — Animaciones glass

Añadir cada interacción de movimiento sobre la base anterior. Revisión visual contra la UI aprobada y medición con/sin animaciones. Probar interrupción rápida, navegación atrás, pulsación repetida y movimiento reducido. Al tocar Registrar, la respuesta táctil puede ser inmediata, pero el estado confirmado sigue esperando el commit.

**CP3:** movimiento coherente, sin regresión de fluidez o accesibilidad ni duplicados por pulsación.

### P4 — Versionado, builds y optimización

- Actualizar `app.json`, `package.json` y la raíz del lockfile a **0.1.5**; `versionCode` será **3 o el siguiente entero libre**, tras revalidar el estado. Centralizar la versión usada en Acerca de y exportaciones: hoy hay literales 0.1.0 en UI, store y session. Conservar fixtures históricos con versión 0.1.0 para verificar importación real; no reemplazarlos todos mecánicamente.
- Revisar scripts/plugin para respetar la arquitectura solicitada: `build-android.ps1 -Architecture arm64-v8a` y el plugin de propiedades deben producir realmente una sola ABI. Mantener otra salida x86_64 identificada para QA.
- `scripts/inspect-apk.py` espera ambas ABIs de forma fija. Adaptarlo para recibir expectativas explícitas por variante y comprobarlas, sin relajar certificado, permisos, fuentes o alineación. No inferir la expectativa de ABI del mismo archivo que se evalúa.
- Generar las variantes desde una misma congelación de fuente y conservar bundle, hashes y parámetros. Separar ABI; luego probar R8/resource shrinking. Rechazar optimizaciones que rompan arranque, archivos, fuentes, backup o actualización.
- Comparar peso en bytes/MB, composición, tamaño instalado cuando se mida, arranque y RAM; no confundir estas métricas. Incluir resultado del umbral y del objetivo de 40 MB.

**CP4:** candidata ARM64 firmada, inspección completa y comparación de tamaño, más candidata x86_64 si se requiere para pruebas. No distribuir el APK de emulador como archivo principal para el teléfono.

### P5 — Regresión, actualización y entrega

- Ejecutar controles automatizados proporcionales y la regresión de datos. En el emulador propio, instalar 0.1.0 vc2, crear datos ficticios auditados y actualizar a 0.1.5 sin desinstalar ni borrar datos; probar después persistencia y backup. Si el emulador es x86_64, usar la candidata x86_64 y señalar que ARM64 aún necesita prueba física.
- Comprobar interfaz/teclado/movimiento/columnas con diálogos y teclado reales. Ejecutar arranque offline y rutas de QA bloqueadas en release. Comparar reportes, backup, restore/cancel/corrupto y datos privados.
- Generar preview Web fiel final en puertos propios disponibles. Conservar la base personal del navegador; usar contextos y fixtures aislados para las pruebas. Si el puerto está ocupado por otro proceso, no matarlo ni reutilizarlo sin identificarlo.
- Entregar `Dailoop-0.1.5-arm64.apk`, checksum, manifiesto de release, guía de actualización, changelog y resumen de pruebas. Salida versionada bajo `output/releases/v0.1.5/`; no sobreescribir los artefactos 0.1.0 ni sus huellas.
- Preparar commits por cambios coherentes únicamente sobre archivos propios y revisados si la ejecución incluye conservar avances en Git. No modificar el tag v1.0 ni publicar nuevos binarios en GitHub automáticamente como parte de una orden local de ejecución.

**CP5:** paquete verificable, estado de cada criterio, preview y lista precisa de pendientes físicos. Si falta el teléfono, no presentar 120 Hz como PASS. La implementación puede quedar entregada como candidata a prueba física, con esa limitación visible.

## 7. Matriz mínima de aceptación

| Criterio | Evidencia requerida |
| --- | --- |
| Teclado | Campo/cursor visibles durante escritura en creación, edición, nota, fecha/hora, búsqueda y ajustes editables; vertical/horizontal, teclado real y 200 %. |
| Navegación | Al menos 20 cambios Inicio ↔ Estadísticas en release, primer acceso separado del calentado, p50/p95 de respuesta/contenido útil. Objetivo inicial: feedback <100 ms y p95 útil ≤200 ms en el dispositivo medido. |
| Scroll / 120 Hz | Registrar frecuencia efectiva. A 120 Hz, presupuesto ~8,33 ms; objetivo de al menos 95 % de fotogramas dentro de presupuesto en recorrido controlado, p99 y pausas visibles registrados. Medición física pendiente si no hay teléfono. |
| Densidad | 1/2/3/4 en texto normal del S26 cuando sea posible medirlo; preferencia persistente; adaptación con texto ampliado; última vez y Registrar utilizables. |
| Registro | Una pulsación intencionada → un registro, feedback confirmado después de commit, reintento idempotente. |
| Movimiento | Activo/reducido, interrumpible, sin bloqueo de navegación ni peor resultado de scroll/latencia; sin bucles decorativos permanentes. |
| Peso | APK ARM64 con ABI verificada, bytes y desglose antes/después, reducción ≥30 %, meta ≤40 MB evaluada honestamente. |
| Datos | Actualización sin desinstalar, historial y cadenas intactos, backup 0.1.0 importable, exportación actual válida, restore cancelado/corrupto no altera base. |
| Identidad / paquete | PNG originales, paleta, seis fuentes, claro/oscuro y contraste preservados; misma firma/paquete, versión nueva, sin permisos/red/OTA añadidos, 16 KiB. |

Los umbrales son objetivos de ingeniería del plan, no métricas ya obtenidas. Si un criterio no se alcanza, registrar FAIL/PENDIENTE y explicar la causa; no rebajar silenciosamente el criterio. No hace falta un benchmark de Flutter para cerrar esta versión.

## 8. Pruebas, herramientas y evidencia

Usar las skills de código/verificación al ejecutar, siguiendo el alcance. No probar la implementación creando tests que simplemente repitan su lógica. Añadir regresiones útiles: campo enfocado con teclado, preferencia persistente/ inválida, selección de columnas con registro correcto, movimiento reducido, versión de backup y compatibilidad de datos.

Comandos existentes que deben revalidarse desde la raíz:

```powershell
npm run typecheck
npm run lint
npm run test:domain
npm run test:storage
npm run test:unit -- --watch=false
npm run test:stress
npm run test:decoder
npm run check:assets
npm run check:expo
npx expo-doctor
npm run export:web
npm run test:e2e
```

Los E2E existentes necesitan las previews indicadas en README; no fingir ejecución si faltan servidores. El estrés actual no sustituye la prueba de rendimiento Android. Maestro y herramientas del SDK ya se usaron: revisar rutas/seriales y usar un único operador del AVD propio. No iniciar compilación pesada en paralelo con mediciones de fluidez: hubo un ANR histórico y contención en las pruebas anteriores, con causalidad no exclusiva.

Guardar por checkpoint fecha, comandos, versiones, entorno, resultado, archivos/hash y conclusión. Conservar fallos originales y distinguir repetición corregida de primer intento. No actualizar el fingerprint histórico de la 0.1.0; crear uno nuevo para la entrega 0.1.5.

Los tests de volumen y capturas usan datos ficticios. No adjuntar bases ni notas personales a GitHub. Las claves de firma siguen fuera del checkout y de cualquier ZIP/exportación; no leer ni imprimir sus contenidos en logs.

## 9. Reanudación y definición de terminado

Actualizar [PROGRESS-0.1.5.md](PROGRESS-0.1.5.md) al cerrar cada checkpoint y antes de una interrupción: fase actual, archivos cambiados, evidencia, pendientes, procesos propios y siguiente acción concreta. No marcar PASS por una afirmación de un subagente sin inspeccionar su evidencia.

La entrega reúne los cinco cambios en una sola 0.1.5, con datos preservados, artefacto ARM64 firmado, guía y evidencia. La prueba física del S26 se informa por separado si no es accesible. Ningún punto de nube, Google o Flutter se añade por iniciativa del siguiente modelo.

Mensaje mínimo del usuario para arrancar en este mismo chat: **Ejecutar**.

Si se abre otro chat, usar: **«Lee AGENTS.md, docs/PLAN-0.1.5.md y docs/PROGRESS-0.1.5.md en C:\!Codex\Dayloop\Dailoop y ejecuta el plan de Dailoop 0.1.5.»**
