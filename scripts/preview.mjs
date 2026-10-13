import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const external=8793,internal=8794;
async function checkPort(port){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`Puerto propio ${port} ocupado. No se reutiliza ni se detiene otro proceso.`)));s.listen(port,'localhost',()=>s.close(resolve));});}
await checkPort(external);await checkPort(internal);
const child=spawn(process.execPath,[require.resolve('expo/bin/cli'),'start','--web','--localhost','--port',String(internal)],{stdio:'inherit',windowsHide:true,env:{...process.env,EXPO_NO_TELEMETRY:'1',BROWSER:'none'}});
const server=http.createServer((req,res)=>{
  const upstream=http.request({hostname:'localhost',port:internal,path:req.url,method:req.method,headers:req.headers},response=>{
    res.writeHead(response.statusCode??502,{...response.headers,'cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp','cache-control':'no-store'});response.pipe(res);
  });
  upstream.on('error',()=>{res.writeHead(503,{'content-type':'text/plain; charset=utf-8'});res.end('Dailoop está preparando la preview. Recarga en unos segundos.');});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
  const upstream=net.connect(internal,'localhost',()=>{upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);});
  upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
});
server.listen(external,'localhost',()=>console.log(`Dailoop preview con aislamiento: http://localhost:${external}`));
let closing=false;
function close(){if(closing)return;closing=true;server.close();if(child.pid){if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');}setTimeout(()=>process.exit(0),800).unref();}
process.on('SIGINT',close);process.on('SIGTERM',close);child.on('exit',()=>{if(!closing){closing=true;server.close();process.exitCode=1;}});
