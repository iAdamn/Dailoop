import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as LegacyFS from 'expo-file-system/legacy';
import { File, Paths, Directory } from 'expo-file-system';
import { LIMITS } from '../domain';
import {uuid} from './crypto';

export async function saveText(text:string,filename:string,mime='text/plain'):Promise<string> {
  if(Platform.OS==='web') {
    const blob=new Blob([text],{type:`${mime};charset=utf-8`}); const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a'); anchor.href=url; anchor.download=filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30_000);
    return 'Archivo preparado para descargar. Revisa las descargas del navegador.';
  }
  if(Platform.OS==='android') {
    const permission=await LegacyFS.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if(!permission.granted) return 'Guardado cancelado.';
    const uri=await LegacyFS.StorageAccessFramework.createFileAsync(permission.directoryUri,filename,mime);
    await LegacyFS.writeAsStringAsync(uri,text,{encoding:LegacyFS.EncodingType.UTF8});
    return 'Archivo guardado en la carpeta elegida.';
  }
  throw new Error('El guardado local está disponible en Android y en la vista previa Web.');
}
export const copyText = async(text:string) => {
  if(!await Clipboard.setStringAsync(text)) throw new Error('No se pudo copiar el texto. Puedes guardarlo como archivo Markdown.');
  return 'Markdown copiado.';
};
export async function shareText(text:string,filename:string):Promise<string> {
  if(Platform.OS==='web') {
    if(navigator.share) {
      try {await navigator.share({title:'Reporte Dailoop',text});return 'Se abrió la opción de compartir. El destino controla el envío.';}
      catch(error){if(error instanceof Error && error.name==='AbortError')return 'Compartir cancelado.';throw error;}
    }
    return saveText(text,filename,'text/markdown');
  }
  if(!await Sharing.isAvailableAsync()) throw new Error('Compartir no está disponible. Usa Guardar Markdown.');
  const directory=new Directory(Paths.cache,'dailoop-exports'); directory.create({intermediates:true,idempotent:true});
  // A receiving app may read the shared URI later. Never replace its bytes with another report.
  const file=new File(directory,`${uuid()}-${filename}`); file.create(); file.write(text);
  await Sharing.shareAsync(file.uri,{mimeType:'text/markdown',dialogTitle:'Compartir reporte Dailoop'});
  return 'Archivo preparado. El diálogo del sistema controla el envío o la cancelación.';
}
export async function pickBackup():Promise<string|null> {
  if(Platform.OS==='web') return new Promise((resolve,reject)=>{
    const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json';
    input.style.display='none'; document.body.appendChild(input);
    const cleanup=()=>input.remove();
    input.oncancel=()=>{cleanup();resolve(null);};
    input.onchange=async()=>{
      try { const file=input.files?.[0]; if(!file){resolve(null);return;}
        if(file.size>LIMITS.backupBytes) throw new Error('La copia supera el límite de 50 MiB. No se importó ningún dato.');
        resolve(await file.text());
      } catch(error){reject(error);} finally {cleanup();}
    };
    input.click();
  });
  const picked=await DocumentPicker.getDocumentAsync({type:['application/json','text/plain','application/octet-stream'],copyToCacheDirectory:true,multiple:false});
  if(picked.canceled) return null;
  const asset=picked.assets[0];
  const file=new File(asset.uri);
  try { if(file.size>LIMITS.backupBytes) throw new Error('La copia supera el límite de 50 MiB.'); return await file.text(); }
  finally {try {if(file.uri.startsWith(Paths.cache.uri))file.delete();} catch {/* Never remove a provider-owned original. */}}
}
export function cleanExportCache() {
  if(Platform.OS==='web')return;
  const directory=new Directory(Paths.cache,'dailoop-exports');
  // Only our own temporary exports. Never remove a file still potentially in use this session.
  try {if(directory.exists) for(const item of directory.list()) if(item instanceof File && Date.now()-(item.modificationTime??Date.now())>24*60*60*1000) {try{item.delete();}catch{/* Cache cleanup cannot block opening user data. */}}}catch{/* Retry cleanup on the next launch. */}
}
