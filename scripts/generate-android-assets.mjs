import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Deterministic resize/padding only. No original is cropped, recolored or overwritten.
const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact'); // Already supplied by @expo/image-utils.
const { PNG } = require('pngjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'assets/android');
const evidence = path.join(output, 'evidence');
const palette = { base: '#F7F7FC', ink: '#23263A', violet: '#6F5BFF' };
const size = 1024;
const safeSize = Math.floor(size * 66 / 108);
const offset = Math.floor((size - safeSize) / 2);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rgba = hex => Number.parseInt(`${hex.slice(1)}ff`, 16);
const originalManifest = JSON.parse(await readFile(path.join(root, 'assets/manifest.json'), 'utf8'));
const sources = {};

function bounds(bitmap, threshold) {
  let left = bitmap.width, top = bitmap.height, right = -1, bottom = -1, pixels = 0;
  for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
    if (bitmap.data[(y * bitmap.width + x) * 4 + 3] >= threshold) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); pixels++;
    }
  }
  return pixels ? { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, pixels } : null;
}
function alphaBounds(bitmap) {
  return Object.fromEntries([1, 16, 128, 250].map(threshold => [threshold, bounds(bitmap, threshold)]));
}
async function source(name) {
  const bytes = await readFile(path.join(root, 'assets', name));
  const expected = originalManifest.assets.find(asset => asset.file === name);
  if (!expected || hash(bytes) !== expected.sha256 || bytes.length !== expected.bytes) throw new Error(`Original integrity failure: ${name}`);
  const image = await Jimp.read(bytes);
  sources[name] = { sha256: hash(bytes), bytes: bytes.length, width: image.bitmap.width, height: image.bitmap.height, alphaBounds: alphaBounds(image.bitmap) };
  return image;
}
await mkdir(evidence, { recursive: true });
const iconSource = await source('dailoop-app-icon.png');
const glyphSource = await source('dailoop-glyph.png');
const resize = (image, width) => image.clone().resize(width, width, Jimp.RESIZE_BICUBIC);
const icon = resize(iconSource, size);
const foreground = new Jimp(size, size, 0x00000000).blit(resize(iconSource, safeSize), offset, offset);
const background = new Jimp(size, size, rgba(palette.base));
const splash = resize(glyphSource, size);
const generated = [];

async function save(name, image, details) {
  const bytes = await image.getBufferAsync(Jimp.MIME_PNG);
  await writeFile(path.join(output, name), bytes);
  generated.push({ file: name, width: image.bitmap.width, height: image.bitmap.height, bytes: bytes.length, sha256: hash(bytes), alphaBounds: alphaBounds(PNG.sync.read(bytes)), ...details });
}
await save('icon.png', icon, { source: 'dailoop-app-icon.png', operation: 'Whole 1254x1254 original resized to 1024x1024, alpha retained.' });
await save('adaptive-foreground.png', foreground, { source: 'dailoop-app-icon.png', operation: 'Whole original contained in the central safe square of a transparent 108dp layer.', contentSize: safeSize, normalizedContentDp: safeSize / size * 108, padding: { left: offset, top: offset, right: size - safeSize - offset, bottom: size - safeSize - offset } });
await save('adaptive-background.png', background, { source: null, operation: 'Opaque approved surface.base token.', backgroundColor: palette.base });
await save('splash.png', splash, { source: 'dailoop-glyph.png', operation: 'Whole 1254x1254 glyph resized to 1024x1024, alpha retained. Use contain, with base/ink splash background.' });

// Review evidence only: the OS applies masks to the central 72dp viewport.
// These previews never alter or replace the production foreground.
const viewport = Math.round(size * 72 / 108);
const viewportOffset = Math.floor((size - viewport) / 2);
const fgViewport = foreground.clone().crop(viewportOffset, viewportOffset, viewport, viewport);
const assembled = background.clone().composite(foreground, 0, 0).crop(viewportOffset, viewportOffset, viewport, viewport);
const inside = (x, y, mask) => mask === 'square' || (mask === 'circle' ? x * x + y * y <= 1 : x ** 4 + y ** 4 <= 1);
const masks = [];
const sheet = new Jimp(1024, 640, rgba(palette.base));
sheet.blit(new Jimp(1024, 320, rgba(palette.ink)), 0, 320);
for (const [index, mask] of ['circle', 'squircle', 'square'].entries()) {
  const masked = assembled.clone();
  let clippedVisiblePixels = 0, clippedFaintPixels = 0;
  for (let y = 0; y < viewport; y++) for (let x = 0; x < viewport; x++) {
    let hits = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      if (inside((x + (sx + 0.5) / 4) / viewport * 2 - 1, (y + (sy + 0.5) / 4) / viewport * 2 - 1, mask)) hits++;
    }
    const i = (y * viewport + x) * 4 + 3;
    masked.bitmap.data[i] = Math.round(masked.bitmap.data[i] * hits / 16);
    if (hits < 16) {
      if (fgViewport.bitmap.data[i] >= 16) clippedVisiblePixels++;
      else if (fgViewport.bitmap.data[i] > 0) clippedFaintPixels++;
    }
  }
  if (clippedVisiblePixels !== 0) throw new Error(`Visible original pixels clipped by ${mask}: ${clippedVisiblePixels}`);
  await save(`evidence/mask-${mask}.png`, masked, { reviewOnly: true, mask, viewportDp: 72, clippedVisiblePixels, clippedFaintPixels });
  const cell = resize(masked, 256);
  sheet.composite(cell, 32 + index * 352, 32).composite(cell, 32 + index * 352, 352);
  masks.push({ mask, clippedVisiblePixels, clippedFaintPixels });
}
await save('evidence/mask-sheet.png', sheet, { reviewOnly: true, layout: 'Columns: circle, squircle, square. Rows: surface.base, ink.' });
const splashSheet = new Jimp(720, 360, rgba(palette.base));
splashSheet.blit(new Jimp(360, 360, rgba(palette.ink)), 360, 0);
const splashSample = resize(splash, 200);
splashSheet.composite(splashSample, 80, 80).composite(splashSample, 440, 80);
await save('evidence/splash-sheet.png', splashSheet, { reviewOnly: true, layout: 'Original violet glyph on surface.base and ink, 200px image width.' });

// Verify originals again after generation; source files must remain byte-identical.
for (const [name, sourceInfo] of Object.entries(sources)) {
  if (hash(await readFile(path.join(root, 'assets', name))) !== sourceInfo.sha256) throw new Error(`Original changed during generation: ${name}`);
}
const manifest = {
  schemaVersion: 1,
  command: 'node scripts/generate-android-assets.mjs',
  scriptSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  toolchain: { nodeMajor: Number(process.versions.node.split('.')[0]), imageUtils: require('@expo/image-utils/package.json').version, jimpCompact: require('jimp-compact/package.json').version, pngjs: require('pngjs/package.json').version, resizeKernel: 'bicubicInterpolation' },
  policy: 'Original hashes verified before and after. Whole-image uniform resizing and transparent padding only. No source crop, color replacement, drawing, cleanup, rotation, or added shadow. Source low-alpha halos are retained.',
  adaptiveGeometry: { layerDp: 108, safeSquareDp: 66, viewportDp: 72, layerPixels: size, contentPixels: safeSize, reviewMaskChecks: masks },
  sources,
  generated,
  pending: ['Physical Android launcher masks/parallax and splash must be checked on the release APK.', 'No monochrome layer: preserving the original colored mark without a new silhouette.'],
};
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${generated.length} deterministic PNG files; source hashes unchanged; 3/3 masks preserve pixels with alpha >=16.`);
