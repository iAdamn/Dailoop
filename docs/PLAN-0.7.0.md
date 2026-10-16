# Dailoop 0.7.0 — ejecución y aceptación

El usuario autoriza implementar los puntos 2–7 propuestos más calendario, publicar Git en commits coherentes y producir APK firmado 0.7.0/code 8. Las pruebas físicas se harán después por el usuario; no se publica Google Play ni se instala sobre su dispositivo.

## Bloques

1. Cuenta y privacidad: reautenticación, borrado verificable de los datos online y cuenta, cancelación/errores claros, elección explícita sobre datos locales, vía web pública. Proteger borrado frente a clientes antiguos y escrituras concurrentes sin añadir servicios de pago.
2. Recordatorios: Hecho, Posponer (10/30/60 min) y Omitir esta ocasión, incluyendo acciones desde notificaciones. Comandos idempotentes y auditados; posponer/omitir no crean registros. Mantener recurrencia y compatibilidad de backups anteriores.
3. Organización: orden manual y actividades fijadas; preferencias visuales separadas del historial, conservando IDs/filtros/carpetas/columnas.
4. Sonido/háptica: activación independiente, control separado de navegación/confirmación/avisos y persistencia; no retrasar registro ni reproducir al arrancar.
5. Estado de sincronización compacto en encabezado: local/sin cuenta, pendiente, sincronizando, sincronizado, pausa/conflicto/error, accesible y discreto.
6. Widget Android: seleccionar actividades, registrar desde el escritorio sin navegar por la app, persistencia confirmada e idempotencia, actualizar última vez/estado sin exponer credenciales. Sin SDK gráfico ni servicio permanente.
7. Calendario de actividad: mes, intensidad/recuento por fecha local, selección de día y registros, filtros de actividad, fechas vacías y correcciones/anulaciones; no confundirlo con el selector de fechas existente.
8. Integración y entrega: pruebas enfocadas y regresión completa, preview fiel, validación de reglas, compile/binary/signature/permissions/size gates, commits y push, release descargable y guía física.

## Invariantes y checkpoints

SQLite local sigue disponible sin cuenta/red; datos canónicos/identidades/auditoría se conservan. Ninguna acción de omitir/posponer/sensación/orden crea registros. Cuenta y subida siguen siendo opt-in. Web prueba flujos y SQLite real con fixtures aislados; Android se compila e inspecciona, con aceptación física expresamente pendiente. Cada bloque registra evidencia; errores/reintentos nunca se anuncian como éxito. No copiar secretos a Git, APK público, logs ni página web. Los identificadores públicos del cliente Firebase son extraíbles por diseño; acceso por reglas/UID.

La implementación usa subagentes con archivos exclusivos y revisión independiente final. Los puntos de integración compartidos pertenecen al root; no se pisan contratos en paralelo.
