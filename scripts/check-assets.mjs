import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('../assets/manifest.json',import.meta.url),'utf8'));
for(const asset of manifest.assets){
  const bytes=await readFile(new URL(`../assets/${asset.file}`,import.meta.url));
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==asset.sha256||bytes.length!==asset.bytes)throw new Error(`Original modificado: ${asset.file}`);
  console.log(`PASS ${asset.file} ${bytes.length} bytes SHA-256 ${hash}`);
}
