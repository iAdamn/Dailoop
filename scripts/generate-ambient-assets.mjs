import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const directory = new URL('../assets/ambient/', import.meta.url);
await mkdir(directory, { recursive: true });
const recipes = [
  { name: 'violet', color: [111, 91, 255], width: 590, height: 690, inset: 153, light: 6, dark: 9, layers: 18 },
  { name: 'sky', color: [143, 216, 255], width: 530, height: 620, inset: 136, light: 14, dark: 9, layers: 18 },
  { name: 'lilac', color: [220, 207, 255], width: 610, height: 500, inset: 135, light: 10, dark: 7, layers: 16 },
];
const files = [];
for (const recipe of recipes) for (const theme of ['light', 'dark']) {
  const peak = 1 - Math.pow(1 - recipe[theme] / 255, recipe.layers);
  const perBand = 1 - Math.pow(1 - peak, 1 / 60);
  const png = new PNG({ width: recipe.width, height: recipe.height });
  for (let y = 0; y < recipe.height; y++) for (let x = 0; x < recipe.width; x++) {
    let transmission = 1;
    for (let i = 0; i < 60; i++) {
      const inset = i * recipe.inset / 59;
      const width = recipe.width - 2 * inset, height = recipe.height - 2 * inset;
      const radius = Math.min(400, width / 2, height / 2);
      const px = Math.abs(x + 0.5 - recipe.width / 2) - (width / 2 - radius);
      const py = Math.abs(y + 0.5 - recipe.height / 2) - (height / 2 - radius);
      const distance = Math.hypot(Math.max(0, px), Math.max(0, py)) + Math.min(Math.max(px, py), 0) - radius;
      const coverage = Math.max(0, Math.min(1, 0.5 - distance));
      transmission *= 1 - perBand * coverage;
    }
    const index = (y * recipe.width + x) * 4;
    png.data[index] = recipe.color[0]; png.data[index + 1] = recipe.color[1]; png.data[index + 2] = recipe.color[2];
    png.data[index + 3] = Math.round((1 - transmission) * 255);
  }
  const bytes = PNG.sync.write(png);
  const file = `${recipe.name}-${theme}.png`;
  await writeFile(new URL(file, directory), bytes);
  files.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(new URL('manifest.json', directory), JSON.stringify({
  recipe: 'Rasterized palette-only rounded GlowRamp: 60 concentric layers, original peak density and dimensions, final alpha rounded once. No original brand PNG is modified.',
  generator: 'scripts/generate-ambient-assets.mjs', files,
}, null, 2) + '\n');
console.log(`Generated ${files.length} native backdrop textures, ${files.reduce((n, f) => n + f.bytes, 0)} bytes.`);
