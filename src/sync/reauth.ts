const key='dailoop.account-deletion.reauth.v1';
export function rememberDeletionReauth(uid:string):void {
  if(typeof sessionStorage!=='undefined')sessionStorage.setItem(key,JSON.stringify({uid,createdAt:Date.now()}));
}
export function takeDeletionReauth():{uid:string;createdAt:number}|null {
  if(typeof sessionStorage==='undefined')return null;
  const raw=sessionStorage.getItem(key);sessionStorage.removeItem(key);
  if(raw===null)return null;
  try{const v=JSON.parse(raw);if(v&&typeof v.uid==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v.uid)&&Number.isSafeInteger(v.createdAt)&&Date.now()-v.createdAt>=0&&Date.now()-v.createdAt<300000)return v;}catch{/* Invalid deletion intents cannot become normal sign-ins. */}
  throw new Error('Confirma de nuevo tu cuenta con Google.');
}
export function clearDeletionReauth():void{if(typeof sessionStorage!=='undefined')sessionStorage.removeItem(key);}
