# Dailoop 0.7.0 — build 8

Esta entrega reúne los puntos 2–7 y el calendario solicitados. Conserva `local.dailoop.personal`, el certificado original, SQLite offline y el historial auditado. La instalación física sobre S26 Ultra / Android 17 la realizará el usuario después de descargar la APK; no se publica en Google Play en esta fase.

## Funciones

- Cuenta Google y sincronización opcional Firebase Spark. Borrado de cuenta/datos online con reautenticación de la misma cuenta, confirmación explícita y conservación local por defecto. Vía pública: https://iadamn.github.io/Dailoop/delete-account/ . Privacidad: https://iadamn.github.io/Dailoop/privacy/ .
- Hecho, posponer 10/30/60 minutos y omitir una ocasión en Recordatorios. Notificación Android con tres acciones: Hecho, Posponer 30 min y Omitir. Solo Hecho registra; la fecha de entrega identifica la ocasión semanal, incluso si se toca más tarde.
- Organización por arrastre, controles accesibles y fijados; se aplica también en carpetas y búsquedas. Preferencia por dispositivo/base, separada del historial y de los backups.
- Háptica independiente; sonidos de interfaz, navegación y confirmación, y avisos independientes. Android usa canales distintos para avisos sonoros y silenciosos. El volumen y las restricciones del sistema siguen bajo control de Android.
- Estado de sincronización compacto en el encabezado; tocarlo abre Ajustes.
- Widget Android nativo configurable con 1–4 actividades, selección explícita de las privadas, última fecha y registro desde el escritorio. Cola persistente y guardado idempotente mediante SQLite; sin servicio permanente.
- Calendario mensual de actividad con intensidad, recuentos, filtros, selector gráfico de fecha y apertura del detalle existente. Usa revisiones vigentes, anulaciones y zona horaria de la base.
- Se incluyen los cambios previamente locales: auditoría, recurrencia, selectores gráficos, idiomas completos ES/EN/PT y sincronización. Los APK históricos se conservan.

## Privacidad y recuperación

El borrado online bloquea nuevas escrituras de las sesiones antiguas antes de purgar los datos. Elimina chunks, versiones, cabeza y perfil Firebase Auth, verificando las colecciones antes de borrar Auth. Mantiene únicamente un marcador técnico pseudónimo de seguridad (UID y fecha, sin perfil, actividad ni notas) para impedir resurrección; se declara en la app y la política pública. Errores/cortes de red nunca se anuncian como éxito parcial.

La elección de vaciar esta base local requiere desactivar expresamente «Conservar mis datos». Otros dispositivos y backups exportados permanecen allí. Cerrar sesión no borra datos; desvincular una copia requiere confirmación y mantiene sincronización pausada. Conectar otra cuenta y activar sync comparte esa copia con ella, como explica el diálogo.

SQLite físico sigue en esquema 2. Backups 1–3 conservan compatibilidad; solo usar posponer/omitir incorpora comandos del formato 4. No restaurar un backup 4 en un APK anterior. La sincronización valida el historial completo y conserva ramas incompatibles; no se usan credenciales administrativas, Analytics ni servicios de pago.

## Evidencia y límites

Evidencia reproducible en `output/verification/v0.7.0/`: checks automatizados, regresión Web, reglas reales de emulador, compilación, inspección de APK y fingerprints. Los primeros fallos se conservaron y clasificaron: carreras/cancelación de cuenta y prioridad Android Back corregidas; mocks adaptados a nuevas APIs; espacio del toolbar corregido; una aserción ARIA del test corregida para React Native Web. No se ocultaron mediante reintentos sin diagnóstico.

La validación nativa de compilación/binario no prueba recepción de avisos, reinicio/Doze, comportamiento One UI, permisos Google ni fluidez física. Ver [PRUEBAS-0.7.0.md](PRUEBAS-0.7.0.md). No se han borrado cuentas personales ni instalado sobre el teléfono. El inventario npm mantiene advisories upstream; no se presenta como limpio ni se forzaron actualizaciones incompatibles.

La APK firmada y sus datos de integridad se incorporan a la release pública v0.7.0 y al informe final de aceptación una vez terminadas las comprobaciones binarias.
