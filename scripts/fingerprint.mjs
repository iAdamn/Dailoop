import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function walk(relative){
  const entries=await readdir(path.join(root,relative),{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const name=path.posix.join(relative,entry.name);
    if(entry.isDirectory())files.push(...await walk(name));
    else if(entry.isFile())files.push(name);
  }
  return files;
}
async function fingerprints(paths){
  const files=[];
  for(const name of [...paths].sort()){
    const bytes=await readFile(path.join(root,name));
    files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});
  }
  return {treeSha256:hash(JSON.stringify(files)),files};
}
const roots=['app','src','tests','scripts','assets','docs','plugins','licenses'];
const sourceFiles=['.gitignore','AGENTS.md','README.md','LICENSE','THIRD-PARTY-NOTICES.md','app.json','package.json','package-lock.json','tsconfig.json','metro.config.js','eslint.config.js','jest.config.js','playwright.config.ts','playwright.release.config.ts'];
for(const directory of roots)sourceFiles.push(...await walk(directory));
const source=await fingerprints(sourceFiles);
const webExport=await fingerprints(await walk('dist'));
const output=path.resolve(root,process.argv[2] || 'output/verification');
if(output!==path.join(root,'output','verification')&&!output.startsWith(path.join(root,'output','verification')+path.sep))throw new Error('Fingerprint output must stay inside output/verification.');
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'source-fingerprint.json'),JSON.stringify({createdAt:new Date().toISOString(),algorithm:'sha256',scope:'Source, tests, configuration, original assets, documentation and final Web export. Excludes secrets, node_modules, native builds and test output.',source,webExport},null,2));
console.log(`Source: ${source.files.length} files, SHA-256 ${source.treeSha256}`);
console.log(`Web export: ${webExport.files.length} files, SHA-256 ${webExport.treeSha256}`);
