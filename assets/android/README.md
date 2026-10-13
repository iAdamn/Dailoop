# Derivados Android de Dailoop

Generar desde la raíz de Dailoop:

```powershell
node scripts/generate-android-assets.mjs
```

El script usa `jimp-compact 0.16.1`, ya instalado por `@expo/image-utils`, y `pngjs`. No descarga recursos ni requiere Sharp. Verifica los SHA-256 de los originales antes y después de generar. `manifest.json` registra dimensiones, hashes, receta, herramienta y límites alpha en cuatro umbrales.

| Archivo | Uso y adaptación |
| --- | --- |
| `icon.png` | Icono general, 1024 × 1024. PNG original completo, escalado uniforme bicúbico; conserva alpha. |
| `adaptive-foreground.png` | Foreground transparente, 1024 × 1024 = 108 dp. PNG original completo dentro de 625 × 625 px = 65,92 dp. Padding: izquierda/arriba 199 px; derecha/abajo 200 px. |
| `adaptive-background.png` | Background opaco, 1024 × 1024, token `surface.base` (`#F7F7FC`). |
| `splash.png` | Glifo original completo, escalado uniforme a 1024 × 1024. Alpha conservado. Configurar `contain`, fondo `surface.base` o `ink`; la evidencia muestra ancho de imagen de 200 px. |

No se recorta, limpia, recolorea, gira, redibuja o sustituye ningún original. Los halos de alpha muy baja pertenecen a las imágenes originales y se conservan. No se crea una variante monocromática porque supondría otra representación de la marca.

## Evidencia de máscaras

`evidence/mask-sheet.png`: columnas círculo, squircle de superelipse de exponente 4 y cuadrado; fila superior sobre `surface.base`, inferior sobre `ink`. También se guardan los tres PNG de máscara por separado. Se simula el viewport central de 72 dp del layer de 108 dp, con cobertura de borde 4 × 4. Las máscaras se aplican únicamente a la evidencia; no al foreground de producción.

Resultado: ninguna máscara recorta píxeles del foreground con alpha ≥16/255. El círculo cruza 725 píxeles de halos con alpha <16/255; el manifiesto conserva este dato sin presentar los bordes originales como perfectos. No se pierde ninguna parte visible del símbolo o su baldosa violeta. El resultado se inspeccionó visualmente.

`evidence/splash-sheet.png` muestra el glifo sobre los fondos claro y oscuro de la paleta. Los archivos `evidence/` son documentación, no recursos a configurar como launcher o splash.

Referencia geométrica: [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive). Estas simulaciones no certifican máscaras de todos los fabricantes ni efectos de parallax. Quedan pendientes launcher y splash en el APK release instalado.
