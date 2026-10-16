import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(project,process.env.DAILOOP_EXPORT_ROOT??'dist');
const port=Number(process.env.DAILOOP_EXPORT_PORT??8795);
if(root!==path.join(project,'dist')&&!root.startsWith(path.join(project,'output','verification')+path.sep))throw new Error('El export debe estar en dist o output/verification del proyecto propio.');
if(port!==8793&&port!==8795&&port!==8797)throw new Error('Usa exclusivamente los puertos propios 8793, 8795 o 8797.');
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
server.listen(port,'localhost',()=>console.log(`Dailoop · preview de exportación: http://localhost:${port}`));
process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
