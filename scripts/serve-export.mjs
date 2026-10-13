import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
await stat(path.join(root,'index.html'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.css':'text/css','.ttf':'font/ttf','.otf':'font/otf','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  const headers={'cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp','cache-control':'no-store'};
  try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,headers);res.end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+pathname);
    if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403,headers);res.end();return;}
    let filename=target;
    try{if((await stat(filename)).isDirectory())filename=path.join(filename,'index.html');}
    catch{if(!path.extname(filename))filename=path.join(root,'index.html');}
    const data=await readFile(filename);
    res.writeHead(200,{...headers,'content-type':mime[path.extname(filename)]??'application/octet-stream'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404,headers);res.end('Archivo no encontrado.');}
});
server.on('error',error=>{console.error('No se inició el servidor propio de Dailoop:',error.message);process.exitCode=1;});
server.listen(8795,'localhost',()=>console.log('Dailoop · preview estable: http://localhost:8795'));
process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
