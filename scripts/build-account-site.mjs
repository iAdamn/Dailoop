import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
const out='output/account-site';
await mkdir(`${out}/delete-account`,{recursive:true});await mkdir(`${out}/privacy`,{recursive:true});
await copyFile('site/style.css',`${out}/style.css`);await copyFile('site/delete-account.html',`${out}/delete-account/index.html`);await copyFile('site/privacy.html',`${out}/privacy/index.html`);
await writeFile(`${out}/index.html`,'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./privacy/"><title>Dailoop</title><a href="./privacy/">Dailoop privacy</a>');await writeFile(`${out}/.nojekyll`,'');
await build({entryPoints:['site/deletion.ts'],outfile:`${out}/delete-account/app.js`,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false});
console.log(`Account site: ${(await readFile(`${out}/delete-account/app.js`)).length} JS bytes; public Firebase client identifiers only.`);
