// Development-only importer. The application reads the generated local JSON offline.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const cldr = 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.0.0/';
const sources = [
  'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt',
  `${cldr}cldr-json/cldr-annotations-full/annotations/es/annotations.json`,
  `${cldr}cldr-json/cldr-annotations-derived-full/annotationsDerived/es/annotations.json`,
  `${cldr}LICENSE`,
];
const texts = await Promise.all(sources.map(async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.text();
}));
const normalize = text => text.replaceAll('\uFE0F', '');
const annotations = new Map();
for (const text of texts.slice(1, 3)) {
  const parsed = JSON.parse(text);
  for (const [emoji, value] of Object.entries((parsed.annotations || parsed.annotationsDerived).annotations)) annotations.set(normalize(emoji), value);
}
const groups = [], entries = [];
let group = -1;
for (const line of texts[0].split('\n')) {
  if (line.startsWith('# group: ')) { groups.push(line.slice(9).trim()); group = groups.length - 1; }
  const match = line.match(/^([0-9A-F ]+);\s*(?:fully-qualified|component)\s*#\s*\S+\s+E[\d.]+\s+(.+)$/u);
  if (!match) continue;
  const emoji = String.fromCodePoint(...match[1].trim().split(/\s+/).map(point => Number.parseInt(point, 16)));
  const words = annotations.get(normalize(emoji));
  const name = words?.tts?.[0] || match[2].trim();
  const keywords = [...new Set([match[2].trim(), ...(words?.default || [])])].join(' ');
  entries.push([emoji, name, keywords, group]);
}
if (entries.length < 3900 || new Set(entries.map(entry => entry[0])).size !== entries.length) throw new Error('Incomplete or duplicated Unicode catalog');
// Carry the Unicode notice in the bundled dataset as well as the source distribution.
const data = JSON.stringify({ version: '17.0', license: texts[3], groups, entries });
await mkdir(new URL('src/ui/data/', root), { recursive: true });
await mkdir(new URL('licenses/', root), { recursive: true });
await writeFile(new URL('src/ui/data/emojis.json', root), `${data}\n`, 'utf8');
await writeFile(new URL('licenses/UNICODE-LICENSE.txt', root), texts[3], 'utf8');
await writeFile(new URL('src/ui/data/README.md', root), `# Emoji catalog\n\nLocal Unicode Emoji 17.0 catalog with CLDR 48 Spanish annotations, including skin tones, gender sequences, families and flags. Rendered with the device's emoji glyphs; no image/font downloads or runtime network requests. New glyph availability depends on the device.\n\nGenerated with \`node scripts/build-emoji-catalog.mjs\`. Unicode data license: [UNICODE-LICENSE.txt](../../../licenses/UNICODE-LICENSE.txt). Sources and SHA-256:\n\n${sources.map((url, index) => `- ${url}\n  SHA-256: ${createHash('sha256').update(texts[index]).digest('hex')}`).join('\n')}\n`, 'utf8');
console.log(`${entries.length} emojis, ${groups.length} groups, ${Buffer.byteLength(data)} bytes; Spanish names: ${entries.filter(entry => annotations.has(normalize(entry[0]))).length}`);
