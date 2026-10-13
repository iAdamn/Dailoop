import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'node_modules/expo-blur');
const { version } = JSON.parse(await readFile(path.join(packagePath, 'package.json'), 'utf8'));
if (version !== '57.0.3') throw new Error('Review the palette patch before changing expo-blur.');
const file = path.join(packagePath, 'android/src/main/java/expo/modules/blur/enums/TintStyle.kt');
let source = await readFile(file, 'utf8');
const replacements = [
  ['LIGHT -> ((255 * intensity * 0.78).toInt() shl 24) + (249 shl 16) + (249 shl 8) + 249', 'LIGHT -> ((255 * intensity * 0.78).toInt() shl 24) + (247 shl 16) + (247 shl 8) + 252'],
  ['SYSTEM_ULTRA_THIN_MATERIAL_DARK -> ((255 * intensity * 0.55).toInt() shl 24) + (37 shl 16) + (37 shl 8) + 37', 'SYSTEM_ULTRA_THIN_MATERIAL_DARK -> ((255 * intensity * 0.55).toInt() shl 24) + (35 shl 16) + (38 shl 8) + 58'],
];
for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error('Expo Blur Android source changed; inspect the patch.');
  source = source.replace(before, after);
}
await writeFile(file, source);
console.log(`Android Blur palette patch: expo-blur ${version}; SHA256 ${createHash('sha256').update(source).digest('hex')}`);
