# Pulido visual de Dailoop

Cambio solicitado por el usuario el 12 de octubre de 2026, America/Bogota: superficies próximas al vidrio, sin Liquid Glass, una fuente más cuidada para títulos con reflejos y otra para los textos, con una línea visual común. Esta petición sustituye la decisión provisional de usar tipografía del sistema; no modifica el gate APK.

## Corrección solicitada: vidrio visible

El usuario rechazó el primer acabado por resultar demasiado mate: «Te pedi estetica similar a liquid glass». La dirección vigente sustituye el satinado descrito más abajo por superficies translúcidas con desenfoque real, un fondo de luz lavanda/celeste/violeta perceptible a través de las tarjetas, bordes ópticos y reflejos estáticos más visibles. Los textos se dibujan fuera de la capa desenfocada. La shell ya no tapa el fondo con un relleno opaco.

`src/ui/material.tsx` concentra el material compartido. Web usa `backdrop-filter` y su variante WebKit, con veladuras derivadas de la paleta. Esto evita los tintes blancos/grises fijos del adaptador Web de Expo Blur. Android/iOS utilizan `expo-blur@57.0.3`, fijado según la matriz instalada de Expo SDK 57; Android recibe un `BlurTargetView` estable que contiene sólo el fondo decorativo y `blurMethod="dimezisBlurView"`. Las sombras y el grado de blur nativo requieren prueba posterior en dispositivo: la preview no demuestra paridad de píxeles ni rendimiento de Android antiguo. No se abrió el gate APK.

API y límites: [Expo Blur SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/) e implementación empaquetada en `node_modules/expo-blur/src/`. La evidencia de esta corrección se guarda en `output/verification/glass-ui/` y sus capturas separadas del primer intento. La huella del satinado se conserva en `source-fingerprint-satin-baseline.json`.

### Evidencia de la corrección

| Comprobación | Resultado fresco |
|---|---|
| TypeScript / ESLint | PASS. |
| Componentes y adaptadores | 8/8 PASS. |
| Recorridos públicos y offline contra exportación estática 8795 | 9/9 PASS en 21,9 s; cero fallos, omitidos o retries. |
| Después de suavizar el fondo: reporte, visual claro/oscuro, texto 200 % y offline | 4/4 PASS en 8,9 s; regresiones repetidas, no escenarios adicionales. TypeScript, lint y exportación final PASS. |
| Fuentes, foco, temas, anchuras y texto 200 % | Incluidos en el pase anterior. |
| Exportación Web / `expo install --check` | PASS, dependencia de blur compatible. |
| Expo Doctor | 20/21; consulta de metadatos React Native Directory falló por respuesta del servidor, también en un reintento. No es una incompatibilidad demostrada. |

Las 17 capturas finales están en `output/playwright/glass-ui-screenshots/`. Root revisó el resultado en la preview personal y las capturas de Inicio claro/oscuro, Ajustes oscuro, reporte y texto ampliado con datos ficticios; QA aportó una revisión independiente. El fondo final usa una rampa estática más fina para suavizar sus contornos. Los campos quedan explícitamente por encima del material: la captura preliminar detectó el texto de la zona horaria desenfocado y se corrigió antes del pase público. Una aserción de foco que exigía violeta en ambos temas también se actualizó para aceptar exactamente lavanda en oscuro, donde mejora la visibilidad; no se relajaron los requisitos de foco sólido y grosor. La evidencia inicial fallida se conserva en `initial-focus-failure/`.

`npm audit --omit=dev` devuelve 64 nodos señalados (47 high, 17 moderate), frente a 62 del primer intento. Los cinco identificadores de avisos originales no cambiaron; los dos nodos añadidos son propagaciones hacia `react-native-screens` y `@testing-library/react-native`, no un aviso directo en Expo Blur. Se conserva el análisis de alcance en `dependency-audit.md`; no se fuerza un downgrade del SDK.

Limitaciones vigentes: el desenfoque nativo, modales y rendimiento en Android antiguo no se han ejecutado. La alternativa sin soporte de backdrop-filter conserva las veladuras y bordes, pero no el desenfoque Web. No se declara una certificación de contraste universal para cualquier compositor/dispositivo. No hay reflejos animados, solicitudes de recursos externos ni cambios de datos por esta revisión.

## Primer intento: satinado (histórico, rechazado por el usuario)

Superficies satinadas, luz en los bordes, veladuras diagonales y sombras moderadas. Reflejos estáticos discretos sobre títulos y tarjetas, sin animaciones continuas ni dependencias de blur. Se mantienen los seis colores del handoff y sus variaciones de transparencia, los tres PNG originales y los flujos existentes. Outfit aporta formas geométricas suaves a títulos y cifras; Manrope mantiene una lectura clara en textos, campos y controles.

Las capas decorativas se implementan en componentes React Native compartidos con `expo-linear-gradient`, ya presente. No capturan pulsaciones ni incorporan etiquetas duplicadas al árbol accesible. Teclado, estados de selección y tamaño de texto ampliado forman parte de la regresión visual.

## Tipografías locales

- Outfit SemiBold (600) y Bold (700).
- Manrope Regular (400), Medium (500), SemiBold (600) y Bold (700).
- Seis TTF estáticos, 498.356 bytes en total, copiados sin modificar sus contornos. Licencias OFL y hashes en `assets/fonts/`.
- Se fija `expo-font@57.0.4`, antes transitivo, conforme a la matriz SDK 57. La carga usa recursos empaquetados antes de montar la interfaz; un error de fuente no debe bloquear el acceso a los datos.
- No se consulta Google Fonts ni otro CDN al utilizar la app. No se ejecutó prebuild ni compilación nativa.

Procedencia comprobada: [Outfit en Google Fonts](https://github.com/google/fonts/tree/main/ofl/outfit), [Manrope en Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope), distribuciones estáticas [Outfit 0.4.3](https://www.npmjs.com/package/@expo-google-fonts/outfit/v/0.4.3) y [Manrope 0.4.2](https://www.npmjs.com/package/@expo-google-fonts/manrope/v/0.4.2). Las licencias incluidas acompañan a esos archivos concretos. API compartida: [Expo Font SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/font/).

## Verificación del primer intento (histórica)

La evidencia de este cambio se guarda separadamente en `output/verification/ui-polish/`. El checkpoint funcional anterior conserva sus 79 tests históricos y su huella en `source-fingerprint-v0.1-baseline.json`; no se atribuyen esos resultados a una nueva ejecución.

La regresión seleccionada cubre TypeScript, lint, componentes, exportación Web, los ocho recorridos públicos y la sesión estática sin red. Se espera a que terminen de cargar las fuentes antes de medir texto y capturar. Se comprueban las seis FontFace cargadas, las familias realmente aplicadas y el origen local de los recursos, además de la legibilidad en ambos temas y a texto 200 %.

Resultados ejecutados después de integrar las fuentes y superficies:

| Comprobación | Resultado |
|---|---|
| TypeScript y ESLint | PASS, incluidos los dos cambios finales de indicador de scroll. |
| Componentes y adaptadores existentes | 8/8 PASS. |
| Recorridos públicos + exportación estática offline | 9/9 PASS en 2,1 min; cero fallos, omitidos o retries. |
| Después de ocultar el indicador blanco de scroll: reporte, ambos temas/resoluciones, texto 200 % y offline | 4/4 PASS en 45,4 s; son regresiones repetidas del conjunto anterior, no cuatro escenarios nuevos. |
| Expo compatibility / Doctor | PASS; 21/21 comprobaciones. |
| Exportación Web final | PASS, con los seis TTF incluidos. |
| Integridad de fuentes empaquetadas | Los seis hashes de `dist` coinciden con los archivos del manifest; 498.356 bytes. |

Los JSON y logs están en `output/verification/ui-polish/`; 17 capturas actualizadas en `output/playwright/ui-polish-screenshots/`. Se comprobaron las familias reales Outfit/Manrope en títulos, cuerpo, botones y campo de entrada, seis FontFace en estado loaded y ausencia de solicitudes externas. Las fuentes están cargadas antes de cortar la red en el recorrido offline.

Root y QA revisaron Inicio, Estadísticas, reportes y texto ampliado en claro/oscuro. No se observaron controles tapados, solapamientos ni pérdida de lectura. A texto 200 %, algunas etiquetas de navegación se dividen en dos líneas; permanecen completas y accesibles. El scroll sigue respondiendo a gestos, rueda y teclado aunque su indicador visual esté oculto. No hay reflejos animados ni una segunda copia accesible de los títulos.

La comparación con la huella anterior confirma que dominio y almacenamiento no cambiaron. Por ese motivo no se repitió el benchmark de 10.000 registros ni los tests de migración de la etapa anterior. La auditoría runtime sigue en 62 nodos afectados (45 high, 17 moderate), con los mismos cinco avisos ya analizados en `dependency-audit.md`; la incorporación directa de Expo Font no añadió avisos runtime diferentes.

Las pruebas de Android, las fuentes nativas y la representación de sombras en cada dispositivo permanecen pendientes de aprobación específica y ejecución. No se generó APK ni se ejecutó prebuild. La preview estable permanece en http://localhost:8795.

En desarrollo, RN Web informa avisos de deprecación para `pointerEvents` como prop y `textShadowColor/Offset/Radius`; los efectos se renderizan y las pruebas pasan. Los campos de sombra siguen siendo la API tipada de React Native instalada. No se interpretan esos avisos como errores de ejecución ni se afirma una consola libre de warnings; su futura adaptación Web queda identificada.
