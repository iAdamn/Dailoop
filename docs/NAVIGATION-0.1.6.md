# Dailoop 0.1.6 — navegación móvil

Encargo: corregir la demora al cambiar de pestaña, especialmente hacia Estadísticas. Añadir arrastre únicamente en la barra inferior; el usuario descartó el gesto horizontal sobre el contenido. Las demás correcciones visuales se abordarán después, una por una.

## Contrato

- Cuatro pantallas montadas a la vez; mantener búsqueda, filtros, período, selección y scroll. El cambio de pestaña no debe reconstruir sus datos ni vistas.
- En Android, las pantallas inactivas conservan su layout con opacidad cero; no reciben toques ni foco accesible. En Web se ocultan con display, sin desmontarlas.
- Datos confirmados, cambios de zona y reloj actualizan las pantallas retenidas. Cambio/restauración de base conserva el remount por identidad/revisión y descarta filtros de otra base.
- La cápsula sigue el dedo; al soltar, selecciona la pestaña bajo él. Mantener toque, teclado, movimiento reducido, cancelación y navegación atrás. Ningún gesto registra actividades.
- Preservar SQLite, auditoría, backup v1, colores, fuentes y firma. No cambiar otras pantallas, Flutter, sincronización ni Google.

## Cambio y evidencia

Se comprobó que 0.1.5 desmontaba las pantallas al cambiar de pestaña. QA reprodujo pérdida de búsqueda, período/selección y borrador de zona. La corrección retiene las vistas y estabiliza callbacks/memoización para evitar que el cambio de ruta vuelva a calcular Estadísticas. Los cálculos por período se invalidan por datos, filtros, zona y día local; el aviso sobre registros futuros conserva el reloj actual.

Gesture Handler **2.32.0**, recomendado en `expo/bundledNativeModules.json` del SDK 57, implementa el arrastre de la barra con Reanimated. Reemplaza la resolución transitiva 3.3.0 anterior. Un único detector compone Pan y Tap con prioridad al arrastre; cada destino expone además activación accesible nativa y teclado Web. Esto evita que el click de origen revierta el destino al soltar. No se incorpora PagerView porque el usuario quiere únicamente la barra. [Documentación de gestos](https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/pan-gesture/).

Versión 0.1.6, versionCode 4, paquete/firma anteriores. Las evidencias y artefactos nuevos van en `output/verification/v0.1.6/` y `output/releases/v0.1.6/`; la entrega 0.1.5 permanece intacta.

Estado: cierre funcional local, preparado para prueba física. Root es dueño de producción/configuración; QA de tests nuevos, `NAVIGATION-0.1.6-QA.md` y emulador propio 5590. No manipular 5580: hay control externo observado. No ejecutar builds/exportaciones durante medición nativa. No publicar esta iteración automáticamente.

Checkpoint de código: `e60b614`. Inputs de producción: 75 archivos, SHA agregado `d68a3ee57a3949062623403277cb1de012ecd6380bf398c06483d8b127a5886e`; no cambian tras los builds congelados. Nueve controles automatizados PASS (incluyen 18 pruebas de componentes), tres pruebas puras de período retenido PASS y Expo Doctor 21/21. Web final C5: 19/19 PASS, sin reintentos, fallos ni saltos; `output/verification/v0.1.6/web-c5-final-report.json`, entry `04a3e134fa2faff1a348f656825d4042`. Incluye conservación de filtros, actualización tras registros, teclado, cancelación de gesto, arrastre vertical y ausencia de registros accidentales. QA conserva los fallos iniciales y distingue los tres oráculos antiguos corregidos de los defectos de producto.

ARM64 y x86: inspección 62/62 PASS, misma firma y mismo bundle Hermes; las identidades exactas están en [RELEASE-0.1.6.md](RELEASE-0.1.6.md). Frente a 0.1.5 hay una comprobación ELF menos porque Gesture Handler 2.32 integra su código generado en la librería combinada. Los demás controles permanecen.

Regresión Android x86 congelada: PASS funcional en taps, arrastre de barra en ambos sentidos, cancelación real, gesto vertical ignorado, contenido sin navegación, filtros/scroll, actualización de Historial/Estadísticas, borrador/guarda/teclado y movimiento reducido. Root comprobó 13 XML independientemente y validó los backups con el decoder real: el upgrade conserva exactamente el fixture de 10 actividades/100 registros/110 operaciones; al acabar hay 101 registros/revisiones y 111 operaciones, solo el nuevo registro de QA002, con todas las filas anteriores, meta y ajustes intactos. Evidencia: `root-native-upgrade-validation.json`, `root-native-view-validation.json` y `root-native-data-validation.json` en el directorio de verificación de esta versión. Los fallos de helpers (scroll/picker, dump de modal y descarga anterior a terminar la escritura) y el bloqueo recuperado de System UI permanecen separados en QA. No se usan sus esperas como latencia del producto.

Cierre: assessment nativo con 12 criterios funcionales PASS; typecheck y lint repetidos tras las correcciones de oráculos, ambos PASS. 5590 apagado, 5580 no operado. Preview de producción conservada en 8795. Código y verificación quedan en dos commits locales; no se hace otro push ni release. APK, checksum, guía y manifiesto local en el directorio de entrega 0.1.6.

La grabación baseline en el AVD software no tiene marcador de entrada identificable ni resolución temporal suficiente; la latencia tap→contenido queda INCONCLUSA. No convertir PTS variables, waits de Maestro o GfxInfo en latencia del producto ni prometer 120 Hz. La prueba física del S26 sigue siendo necesaria.
