# Ajustes Flash de interfaz — 0.5.0

Entrega posterior autorizada: [Git y APK 0.5.0](RELEASE-0.5.0.md). Este documento conserva la evidencia y los límites de su checkpoint anterior.

2026-10-14. Se atienden conjuntamente los comentarios de navegador posteriores al bloque de recordatorios. Versión 0.5.0 conservada. Sin APK, commits ni publicación.

- Campana monocroma de línea, casa de Registro más grande y carpeta con la paleta de Dailoop. Cuatro contornos originales en `assets/icons/DailoopSymbols.ttf` (1.472 bytes); no se añade una biblioteca gráfica ni dependencia nativa. La receta de generación y su herramienta aislada están documentadas junto al asset.
- Racha con silueta minimalista lavanda, brillo sutil y número Outfit Bold centrado dentro. En dos columnas queda separada ocho puntos del borde; en tres/cuatro comparte la fila del emoji con tamaño compacto para evitar recortes y solapamientos. El cálculo y la descripción accesible no cambian.
- Activas/Archivadas se integran en la fila de herramientas cuando caben (ancho útil de 500 puntos, texto sin ampliar). En móvil estrecho o con texto ampliado se conservan dos filas utilizables. Menor separación vertical antes de las tarjetas.
- Volver de Historial a Estadísticas tiene la misma superficie glass de los demás botones.
- Crear una actividad desde el formulario de recordatorio, incluso con la base vacía. Se conserva el borrador mientras se abre la creación; cancelar vuelve sin perder fecha/hora/avisos. Guardar confirma la actividad y la selecciona; el recordatorio se guarda después. UUID y clave estables para reintentos.
- Calendario emergente común en Recordatorios, registros nuevos/corregidos y rangos de historial, estadísticas y reportes. Días, meses y años gráficos, confirmación/cancelación animadas y límites de cada flujo. Las horas conservan su campo y validación de hora inexistente/repetida. Las fechas son valores locales YYYY-MM-DD, no conversiones UTC. El cuerpo del calendario tiene soporte más opaco para evitar que el formulario de detrás dificulte leer los días.

## Verificación

TypeScript y ESLint PASS. **107 pruebas unitarias/integración PASS**, incluidos 8 casos de calendario y 5 de creación anidada. **29 E2E de navegador PASS**, incluyendo los recorridos previos de registro, backup, navegación, categorías y offline. Tras el ajuste de contraste se reejecutaron 13 pruebas focales y los 2 E2E nuevos. La revisión visual descubrió una celda táctil de sólo 5,7 px: una regresión Web lo reprodujo, se corrigió el tamaño en el wrapper animado y ahora ocupa 42,3 × 42,3 px en viewport de 390 px. Se reejecutaron sus 8 pruebas de calendario y la suite completa de 29 E2E sobre esa corrección.

Evidencia en `output/verification/v0.5.0/flash-polish/`: `unit.log`, `web-final.log`, `web-full-report.json`, `web-focused-final.log`, capturas de iconos/calendario/Historial y huella de fuente/exportación. Las capturas de racha en 2–4 columnas y herramientas a 963 px están en el resultado de `flash-polish.spec.ts`. Las pruebas usan datos sintéticos y contextos propios; nunca la base del navegador personal.

Esta tanda no modifica dominio, esquema, permisos, versiones de dependencias o código Kotlin. La preview está exportada en 8795. La carga de la fuente nueva, ventanas/teclado y tacto en el teléfono se comprobarán con el próximo APK expresamente solicitado; no se declara aceptación Android por estas pruebas Web. Siguen vigentes los pendientes físicos del checkpoint principal.
