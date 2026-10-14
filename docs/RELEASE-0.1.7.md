# Dailoop 0.1.7

Entrega local ARM64 firmada para actualizar la instalación existente. Android versionCode **5**, paquete `local.dailoop.personal`, mismo certificado que 0.1.6. El código está publicado en [GitHub](https://github.com/iAdamn/Dailoop); este cierre no crea una nueva publicación binaria en GitHub ni en una tienda.

APK: **37,382,326 bytes** (37.38 MB).

SHA-256: `6591c445e26506b4c25914809dd3a24c86facb5f53d9c9f01d3b7c998777504b`.

## Cambios aprobados

- Respuesta háptica ligera al seleccionar y más marcada en acciones principales. Sonido de copas suave al crear/registrar/guardar y tic de vidrio más corto al navegar o abrir controles. Efectos locales sin red ni micrófono; no bloquean los comandos de datos.
- Emoji junto al nombre. Selector emergente sin conexión con 3.953 emojis, categorías, búsqueda en español y entrada por teclado. Grilla virtualizada y datos cargados al abrir; representación de glifos según el sistema.
- Doce tonos claros de la rueda de color, más los seis originales, con reflejos vidriosos. Los colores previos y sus historiales siguen siendo válidos.
- Pop de botones al contacto/soltar, entrada de ventanas de 230 ms y salida de 110 ms; aparición de pestañas de 160 ms. Respeta movimiento reducido. La cápsula/gestos de la barra inferior permanecen iguales.
- Conserva pantallas, búsquedas, filtros, scroll, columnas, SQLite, auditoría y formato de backup v1. Sin Flutter, sincronización ni login.

## Instalar como actualización

1. Guarda un backup completo desde Ajustes de la app instalada.
2. Copia `Dailoop-0.1.7-arm64.apk` al S26 Ultra y ábrelo. Acepta **Actualizar**, conservando la app instalada y sus datos.
3. Prueba crear/editar, elegir emoji y color, registrar, alternar/arrastrar pestañas y escribir con teclado abierto. Comprueba haptics y sonido con la configuración/volumen del teléfono.

Los backups anteriores se admiten. Un backup que contenga colores nuevos requiere 0.1.7 o posterior; los builds antiguos no conocen esos valores. El esquema SQLite no cambia.

## Evidencia ejecutada

- Nueve controles de `npm run verify`: PASS; 88 pruebas en total (38 dominio, 19 almacenamiento, 29 componentes/contratos, 1 volumen y 1 decoder), además de tipos, lint, recursos originales y compatibilidad Expo.
- Expo Doctor: **21/21 PASS** al reintentar la respuesta inicialmente fallida del servidor de metadatos externo.
- Producción Web: **19/19 PASS**, sin reintentos/saltos/fallos; incluye SQLite real, backup/restauración, auditoría, navegación retenida, arrastre, borradores, movimiento reducido y funcionamiento tras desconectar la red.
- APK ARM64: **64/64 PASS** en firma, paquete/versión, permisos mínimos, backup desactivado, bundle Hermes, fuentes, sonidos, ABI, ELF/ZIP y alineación de 16 KiB. Audio añade únicamente el permiso normal MODIFY_AUDIO_SETTINGS; no hay Internet, micrófono, almacenamiento, VIBRATE ni WAKE_LOCK.
- 87 entradas de producción congeladas: `bee1f2c8da08eec441bede85663939c6bacec8945fc3dbb784ce1c88cd162ade`. El prebuild y la compilación no alteraron estos inputs.

Logs/manifiesto/checksum quedan bajo `output/verification/v0.1.7/` y `output/releases/v0.1.7/`, excluidos de Git. Los tres PNG originales y los APK anteriores se conservan. La candidata inicial falló el control de permiso WAKE_LOCK (63/64); su APK e inspección quedan conservados. La candidata final desactiva explícitamente los wake locks del reproductor y excluye el permiso del manifiesto.

## Pendiente de validar en el teléfono

No se instaló esta APK en el dispositivo personal ni se ejecutó una variante nueva en emulador. La inspección binaria y Web no certifican reproducción/háptica nativa, teclado Samsung, TalkBack ni 120 FPS. La aceptación física en S26 Ultra/Android 17 sigue pendiente.
