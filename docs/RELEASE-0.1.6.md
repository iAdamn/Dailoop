# Dailoop 0.1.6 — parche de navegación

Estado: entrega local preparada para prueba física. Android versionCode 4, mismo paquete `local.dailoop.personal` y certificado que 0.1.5. Artefactos nuevos en `output/releases/v0.1.6/`; no sustituye publicaciones previas.

APK ARM64: **35.511.174 bytes** (35,5 MB), SHA-256 `e06249a78a79e5d6530807914340e396ca05e64d2ac251e2234b79b5c8b3934f`. Variante x86 de QA: 35.972.636 bytes, SHA `2388ed94fb77793e159a9c7a128d855c574c6df625835cb6ac0012f562329b3d`. Ambas pasan 62/62 inspecciones y comparten bundle Hermes `2287747a0e503c2257b23b6549b7ba6d39e0b9396863607c385e9f1ab97baf30`.

## Cambios

- Inicio, Historial, Estadísticas y Ajustes permanecen montados. Al volver se conservan búsqueda, filtros, período, selección y scroll.
- Cambiar de pestaña reutiliza las proyecciones de Estadísticas. Datos confirmados, zona y día local invalidan la caché; no se congela el reloj visible.
- Arrastrar **solo la barra inferior** mueve la cápsula y elige su destino al soltar. Se mantienen toque, teclado y acciones de accesibilidad. Deslizar el contenido sigue perteneciendo al scroll.
- Se preservan los materiales, tipografía, distribución de actividades, teclado y guardas de formularios de 0.1.5. SQLite, esquema, auditoría y backup v1 no cambian.

## Actualizar en Android

1. En la app instalada, guarda un backup completo desde Ajustes.
2. Abre `Dailoop-0.1.6-arm64.apk` en el S26 y acepta **Actualizar**. No desinstales la versión anterior: Android conserva su base local al actualizar con el mismo paquete y firma.
3. Alterna Inicio, Historial y Estadísticas varias veces. Prueba después arrastrar la cápsula hacia ambos extremos, soltar a mitad y volver a pulsar las pestañas.
4. Comprueba que una búsqueda, el período de Estadísticas y la posición de scroll siguen al regresar. Un registro intencionado debe aparecer una sola vez en Historial y Estadísticas.

No se instala automáticamente en el teléfono. La preview Web y Android tienen bases independientes; para trasladar datos se usa un backup completo.

## Verificación y límites

El [contrato de implementación](NAVIGATION-0.1.6.md) y la [auditoría de QA](NAVIGATION-0.1.6-QA.md) registran las pruebas, fallos conservados y artefactos exactos. La medición de latencia del AVD software fue inconclusa: estas pruebas no certifican 120 Hz ni una latencia concreta en el S26. La prueba física es la aceptación pendiente antes de pasar a otros ajustes visuales.

Web 19/19 y nueve controles automatizados PASS. Android x86 funcional PASS en actualización, navegación/arrastre/cancelación, filtros/scroll, borrador/teclado y movimiento reducido. Los backups reales conservan exactamente las 100 entradas anteriores y añaden una sola entrada intencionada: 101 registros/revisiones, 111 operaciones. ARM64 tiene inspección binaria y el mismo bundle, sin ejecución física todavía. Los timeouts y errores de los helpers se conservan; la validación del modal usa capturas directas y estado de ventana tras los fallos de uiautomator.

Sin sincronización, login, servicios externos, cambios en Flutter ni publicación nueva en GitHub/tienda.
