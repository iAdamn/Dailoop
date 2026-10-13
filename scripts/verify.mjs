import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.npm_execpath)throw new Error('Ejecuta npm run verify.');
const output=path.join(root,'output','verification');
await mkdir(output,{recursive:true});
const checks=[['typecheck'],['lint'],['test:domain'],['test:storage'],['test:unit','--','--watch=false'],['test:stress'],['test:decoder'],['check:assets'],['check:expo']];
const results=[];
for(const args of checks){
  const start=Date.now();
  const result=spawnSync(process.execPath,[process.env.npm_execpath,'run',...args],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
  const log=`UTC ${new Date(start).toISOString()}\nnode ${process.version}\ncommand npm run ${args.join(' ')}\nexit ${result.status}\n${result.stdout??''}\n${result.stderr??''}`;
  await writeFile(path.join(output,`${args[0].replaceAll(':','-')}.txt`),log);
  results.push({command:`npm run ${args.join(' ')}`,exitCode:result.status,durationMs:Date.now()-start});
  console.log(`${result.status===0?'PASS':'FAIL'} npm run ${args.join(' ')}`);
  if(result.status!==0)console.error(log);
}
await writeFile(path.join(output,'checks.json'),JSON.stringify({completedAt:new Date().toISOString(),runtime:process.version,results},null,2));
if(results.some(r=>r.exitCode!==0))process.exitCode=1;
