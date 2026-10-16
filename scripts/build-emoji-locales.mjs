// Development-only CLDR importer; no runtime network or new dependency.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const root = new URL('../', import.meta.url);
const normalize = text => text.replaceAll('\uFE0F', '');
const search = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const base = JSON.parse(await readFile(new URL('src/ui/data/emojis.json', root), 'utf8'));
const sources = [], data = {}, missing = {};
for (const language of ['en', 'pt']) {
  const annotations = new Map();
  for (const derived of [false, true]) {
    const url = `https://raw.githubusercontent.com/unicode-org/cldr-json/48.0.0/cldr-json/cldr-annotations${derived ? '-derived' : ''}-full/${derived ? 'annotationsDerived' : 'annotations'}/${language}/annotations.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    const text = await response.text();
    sources.push({ url, sha256: createHash('sha256').update(text).digest('hex') });
    const parsed = JSON.parse(text);
    for (const [emoji, value] of Object.entries((parsed.annotations || parsed.annotationsDerived).annotations)) annotations.set(normalize(emoji), value);
  }
  data[language] = {}; missing[language] = [];
  for (const [emoji] of base.entries) {
    const key = normalize(emoji), annotation = annotations.get(key);
    const name = annotation?.tts?.[0];
    if (!name) { missing[language].push(emoji); continue; }
    const nameTerms = new Set(search(name).split(/\s+/));
    const terms = [...new Set((annotation.default ?? []).flatMap(word => search(word).split(/\s+/)))].filter(word => !nameTerms.has(word));
    data[language][key] = [name, terms.join(' ')];
  }
}
if (Object.values(missing).some(items => items.length)) throw new Error(`Incomplete CLDR coverage: ${JSON.stringify(missing)}`);
const output = JSON.stringify(data) + '\n';
await writeFile(new URL('src/ui/data/emoji-locales.json', root), output, 'utf8');
await writeFile(new URL('src/ui/data/emoji-locales-sources.json', root), JSON.stringify({ cldr: '48.0.0', entries: base.entries.length, sources, license: '../../../licenses/UNICODE-LICENSE.txt' }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ entries: base.entries.length, bytes: Buffer.byteLength(output), gzipBytes: gzipSync(output).length, missing }));
