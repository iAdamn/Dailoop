import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'node_modules/expo-audio');
const { version } = JSON.parse(await readFile(path.join(packagePath, 'package.json'), 'utf8'));
if (version !== '57.0.5') throw new Error('Review the foreground-only audio patch before changing expo-audio.');
// Media3 1.9 defaults to a local wake lock. Dailoop plays only brief foreground
// cues and pauses them on background; explicitly opt out before removing permission.
// https://developer.android.com/reference/androidx/media3/exoplayer/ExoPlayer.Builder#setWakeMode(int)
const file = path.join(packagePath, 'android/src/main/java/expo/modules/audio/AudioPlayer.kt');
let source = await readFile(file, 'utf8');
const before = '    .setLooper(context.mainLooper)\n    .setAudioAttributes';
const after = '    .setLooper(context.mainLooper)\n    .setWakeMode(C.WAKE_MODE_NONE)\n    .setAudioAttributes';
if (!source.includes(after)) {
  if (source.split(before).length !== 2) throw new Error('Expo Audio Android builder changed; inspect the patch.');
  source = source.replace(before, after);
  await writeFile(file, source);
}
console.log(`Foreground audio patch: expo-audio ${version}; SHA256 ${createHash('sha256').update(source).digest('hex')}`);
