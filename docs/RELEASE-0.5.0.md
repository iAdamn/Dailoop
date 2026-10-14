# Dailoop 0.5.0

Entrega autorizada el 2026-10-14 con «Git y APK en FA»: código en varios commits y APK local firmado ARM64, Android versionCode **6**, paquete `local.dailoop.personal` y certificado de actualización conservados. No se publica en una tienda ni se instala en el teléfono personal. La versión visible permanece **0.5.0** hasta completar su aceptación física.

APK: **38.061.768 bytes (38,06 MB)**, `output/releases/v0.5.0/Dailoop-0.5.0-arm64.apk`.

SHA-256: `9138898719c36849e0c51b1eb759f7d72382ca3c0c16dda765c927e9a7744cb9`.

Certificado SHA-256: `72c065f017d9d53ead5934316a732424c2ae639beafc3c2937c4b89932b61310`.

## Contenido

- Corrección de sonidos Android repetidos, avisos con X/cierre a los cinco segundos, categorías sugeridas y vista de carpetas, búsqueda compacta y registro con fecha/hora anterior.
- Navegación Registro, Recordatorios, Estadísticas y Ajustes; Historial dentro de Estadísticas. Arrastre sólo en la barra con pantallas retenidas, seguimiento proporcional, refracción y respuesta al cruzar pestañas. Encabezado glass y preferencia de refresco/aceleración nativa.
- Recordatorios locales vinculados, múltiples anticipaciones opcionales, completar sin duplicar registros y rachas por fechas locales. No hay cuenta, sincronización, push remoto ni dependencia de internet.
- Animaciones de entrada/salida, iconos originales de línea, llama contenida y filtros compactos. Creación de actividad dentro del borrador de recordatorio y calendario gráfico en todos los campos de fecha.

Reglas detalladas: [progreso](PROGRESS-0.5.0.md), [recordatorios y rachas](RECORDATORIOS-RACHAS-0.5.0.md), [pulido Flash](FLASH-POLISH-0.5.0.md). Estos documentos conservan sus checkpoints previos a la autorización de Git/APK; esta entrega los sucede.

## Actualización y datos

Exporta primero un backup completo desde Ajustes. Abre el APK y elige **Actualizar**, conservando la instalación existente. La firma no cambia. SQLite migra de esquema físico 1 a 2 conservando las revisiones anteriores; los nuevos eventos de planificación tienen su propio log append-only y transacciones.

Se aceptan backups v1 y v2. Se exporta v1 si no existe planificación y v2 cuando existe, incluido su log vacío. Un cliente antiguo rechaza v2: no eliminar manualmente su planificación ni renombrarlo como v1. La distribución de tarjetas es una preferencia local de dispositivo.

Los avisos requieren permiso explícito de Android; denegarlo no bloquea el registro. Android puede retrasarlos por ahorro de energía; no se promete una alarma exacta ni recepción tras forzar detención. Ninguna notificación registra una actividad por sí sola.

## Verificación

- APK ARM64 optimizado final: **69/69 PASS** en firma, versión/paquete, permisos/receiver de arranque, aceleración, backup desactivado, bundle Hermes, fuentes (incluido DailoopSymbols), sonidos, ABI, integridad ZIP y alineación ELF/ZIP de 16 KiB. `apk-arm64-final/apk-inspection.json`. Mismo certificado; APK 0.1.7 anterior conservado por checksum.

- `npm run verify`: **9/9 PASS**, **201 pruebas** (63 dominio, 28 almacenamiento, 108 componentes/contratos, estrés y decoder), además de tipos, lint, originales y matriz Expo. `verify-final-gmt.log`.
- Producción Web: **29/29 PASS** en el checkpoint Flash; tras el ajuste de la frontera de zona nativa y reexportar, **7/7 PASS** en flujos de planificación, interfaz y uso sin red. La primera repetición falló por `ERR_CONNECTION_REFUSED` del servidor detenido; se conservó su log y se restableció la preview antes de repetir.
- Emulador exclusivo `Dailoop015_Final_API37`, puerto 5590, Android 17: actualización con `adb install -r`, sin borrar datos. Migración SQLite **1 → 2**: las filas de nueve tablas del core permanecen idénticas, incluidas **10 actividades, 101 registros y 111 operaciones**; integridad `ok`. Después, completar un recordatorio añade exactamente un registro y una operación, usando su ID reservado.
- Permiso de notificaciones mediante diálogo real de Android, creación de aviso, alarma registrada en el sistema, recuperación al relanzar y cancelación tras completar: PASS. Calendario gráfico nativo y conservación de la zona guardada America/Bogota con dispositivo GMT: PASS. Esto no acredita recepción con el teléfono apagado/ahorro de batería/reinicio.
- Durante QA se reprodujo el fallo previo `Invalid timeZoneName` con GMT. Se normaliza únicamente la zona inicial del dispositivo (GMT de offset cero → UTC; identificadores no admitidos → UTC), sin reescribir ajustes guardados. La regresión usa FormatJS real: el bootstrap anterior falla y el corregido pasa.
- La prueba nativa también detectó el literal AGSL no admitido `1.0h` y el tamaño incorrecto de los hijos del contenedor Expo. Se utiliza `half(1.0)` y una fila Yoga explícita con altura mínima de 66 dp. La compilación Kotlin por sí sola no comprueba la gramática AGSL.
- Reejecución final nativa con esa misma fuente: **PASS**, cuatro pestañas contenidas en la barra de 84 dp, navegación por pulsación/arrastre, arranque con GMT y sin avisos de fallo de RuntimeShader ni excepciones JS. `native-final-summary.json`, `native-final-runtime.log` y capturas. Variante x86_64 de QA sin R8 para la última comprobación geométrica, GPU software; el APK entregado es ARM64 con R8 y reducción de recursos. No se mide rendimiento físico con esta variante.

El cierre conserva logs, inspecciones y APK bajo `output/verification/v0.5.0/release/` y `output/releases/v0.5.0/`, excluidos de Git. Las claves privadas permanecen fuera del proyecto. La deuda de dependencias se mantiene documentada en [dependency-audit.md](dependency-audit.md); no equivale a una auditoría de seguridad aprobada.

## Publicación de código

Repositorio: [iAdamn/Dailoop](https://github.com/iAdamn/Dailoop). Commits coherentes: `b6ed733` audio/háptica, `9b5bed2` datos y planificación, `d0f6899` interfaz, `8b9ba38` arranque GMT y `2e49b70` contenedor/shader nativo, seguidos del commit de documentación de esta entrega. No se crea una release binaria remota; el APK local está enlazado en la respuesta de entrega. Próxima corrección entregable: visible 0.5.0, versionCode 7.

## Aceptación física pendiente

S26 Ultra / Android 17: reproducción y háptica reales, teclado Samsung, refracción/scroll y ritmo de cuadros, TalkBack, avisos con app cerrada/reinicio/ahorro de batería y cambio de zona. La compilación, el emulador y Web no certifican 120 FPS ni estas condiciones físicas. Las correcciones conservarán 0.5.0 y aumentarán únicamente versionCode por APK entregado.
