import {CloudAuth} from '../src/sync/auth';
import {purgeCloudAccount} from '../src/sync/deletion';
import {googleCredential,pendingGoogleCredential} from '../src/sync/credentials';
import config from './public-config.json';
const auth=new CloudAuth(config,{read:async()=>null,write:async()=>{},clear:async()=>{}});
const status=document.querySelector<HTMLElement>('#status')!;
const signIn=document.querySelector<HTMLButtonElement>('#sign-in')!;
const erase=document.querySelector<HTMLButtonElement>('#erase')!;
const confirm=document.querySelector<HTMLInputElement>('#confirm')!;
const account=document.querySelector<HTMLElement>('#account')!;
let busy=false;
function message(text:string){status.textContent=text;}
function controls(){signIn.disabled=busy;erase.disabled=busy||!auth.account||!confirm.checked;}
confirm.addEventListener('change',controls);
signIn.addEventListener('click',()=>{if(busy)return;busy=true;controls();void googleCredential(config.googleWebClientId).catch(()=>{message('No se pudo conectar. / Could not connect. / Não foi possível conectar.');busy=false;controls();});});
erase.addEventListener('click',()=>{if(busy||!confirm.checked||!auth.account)return;const uid=auth.account.uid;busy=true;controls();void(async()=>{
 try{
  await purgeCloudAccount(config,uid,()=>auth.token(),p=>message(p.phase==='blocking'?'Protegiendo el borrado… / Securing deletion… / Protegendo a exclusão…':p.phase==='verifying'?'Verificando… / Verifying… / Verificando…':`Borrando / Deleting / Excluindo: ${p.deleted}`));
  await auth.deleteAccount(uid);account.textContent='';confirm.checked=false;message('Cuenta y datos online borrados. / Account and online data deleted. / Conta e dados online excluídos.');
 }catch{message('No se completó el borrado. Confirma tu cuenta y reintenta. / Deletion was not completed. Verify your account and retry. / A exclusão não foi concluída. Confirme sua conta e tente novamente.');}
 finally{busy=false;controls();}
})();});
void(async()=>{try{const credential=await pendingGoogleCredential();if(credential){await auth.signIn(credential,undefined,true);account.textContent=auth.account?.email??'';message('Revisa la cuenta y confirma el borrado. / Review the account and confirm deletion. / Revise a conta e confirme a exclusão.');}}catch{message('Cuenta no disponible o acceso cancelado. No se creó ninguna cuenta. / Account unavailable or sign-in cancelled. No account was created. / Conta indisponível ou acesso cancelado. Nenhuma conta foi criada.');}finally{controls();}})();
