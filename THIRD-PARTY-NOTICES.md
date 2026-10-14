# Componentes de terceros

La licencia MIT del contenido propio no sustituye las licencias de componentes de terceros.

- **Outfit**: SIL Open Font License 1.1. Texto completo y atribución original en [Outfit-OFL.txt](assets/fonts/Outfit-OFL.txt).
- **Manrope**: SIL Open Font License 1.1. Texto completo y atribución original en [Manrope-OFL.txt](assets/fonts/Manrope-OFL.txt).
- Las versiones, procedencia y hashes de las fuentes están en [assets/fonts/manifest.json](assets/fonts/manifest.json). Los archivos TTF se incluyen sin modificar sus contornos.
- Las dependencias de npm y sus componentes nativos mantienen sus propias licencias. [package-lock.json](package-lock.json) fija las versiones; `npm ci` instala sus correspondientes avisos y archivos de licencia.

Los tres PNG originales del proyecto se conservan sin alteraciones. Sus hashes están en [assets/manifest.json](assets/manifest.json); los derivados Android y su receta están en [assets/android](assets/android).

El selector de emojis incluye datos de Unicode Emoji 17.0 y anotaciones en español de CLDR 48, bajo la [licencia Unicode](licenses/UNICODE-LICENSE.txt). Las fuentes y sus hashes están en [src/ui/data/README.md](src/ui/data/README.md). Los glifos los aporta el sistema operativo; no se distribuyen imágenes ni fuentes de emoji de terceros.
