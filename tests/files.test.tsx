import {Platform} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {shareText,copyText,pickBackup} from '../src/infrastructure/files';
import {uuid} from '../src/infrastructure/crypto';

const mockFiles=new Map<string,string>();
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-modules-core',()=>({...jest.requireActual('expo-modules-core'),requireOptionalNativeModule:jest.fn()}));
jest.mock('../src/infrastructure/crypto',()=>({uuid:jest.fn()}));
jest.mock('expo-file-system',()=>({
  Paths:{cache:{uri:'file:///cache/'}},
  Directory:class{uri:string;constructor(parent:{uri:string},name:string){this.uri=`${parent.uri}${name}/`;}create(){}},
  File:class{uri:string;constructor(parent:{uri:string},name:string){this.uri=parent.uri+name;}create(){if(mockFiles.has(this.uri))throw new Error('File already exists');mockFiles.set(this.uri,'');}write(text:string){mockFiles.set(this.uri,text);}},
}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn()}));

afterEach(()=>{jest.restoreAllMocks();mockFiles.clear();jest.clearAllMocks();});
test('sharing the same period twice preserves the bytes already offered to the first recipient',async()=>{
  jest.replaceProperty(Platform,'OS','android');
  jest.mocked(uuid).mockReturnValueOnce('transfer-one').mockReturnValueOnce('transfer-two');
  await shareText('Public report','dailoop-reporte-2026-10-12.md');
  await shareText('Private report','dailoop-reporte-2026-10-12.md');
  const calls=jest.mocked(Sharing.shareAsync).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][0]).not.toBe(calls[1][0]);
  expect(mockFiles.get(calls[0][0])).toBe('Public report');
  expect(mockFiles.get(calls[1][0])).toBe('Private report');
});
test('clipboard failure does not announce a successful copy',async()=>{
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(false);
  await expect(copyText('Markdown')).rejects.toThrow('No se pudo copiar');
});
test('localized transfer controls leave user-authored bytes unchanged',async()=>{
  jest.replaceProperty(Platform,'OS','android');
  jest.mocked(uuid).mockReturnValueOnce('localized-transfer');
  const content='Cancelar {activity} café <script> 🚀';
  await shareText(content,'report.md','pt');
  expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.any(String),{
    mimeType:'text/markdown',dialogTitle:'Compartilhar relatório Dailoop',
  });
  expect([...mockFiles.values()]).toEqual([content]);
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  await expect(copyText(content,'en')).resolves.toBe('Markdown copied.');
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(content);
});

function selected(uri='content://cloud.example/document/backup',size?:number) {
  return {canceled:false,assets:[{uri,name:'backup.json',mimeType:'application/json',size}]} as DocumentPicker.DocumentPickerSuccessResult;
}
test('Android import disables automatic copy and reads generic unknown-size provider through the bounded native reader',async()=>{
  jest.replaceProperty(Platform,'OS','android');
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(selected());
  const readBackup=jest.fn(async()=>'{"note":"café 📚"}');
  jest.mocked(requireOptionalNativeModule).mockReturnValue({readBackup});
  await expect(pickBackup()).resolves.toBe('{"note":"café 📚"}');
  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({copyToCacheDirectory:false,multiple:false}));
  expect(readBackup).toHaveBeenCalledWith('content://cloud.example/document/backup');
});
test('cancelling import never opens a native stream; declared oversize is rejected before reading',async()=>{
  jest.replaceProperty(Platform,'OS','android');
  const readBackup=jest.fn();jest.mocked(requireOptionalNativeModule).mockReturnValue({readBackup});
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({canceled:true,assets:null});
  await expect(pickBackup()).resolves.toBeNull();
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(selected(undefined,50*1024*1024+1));
  await expect(pickBackup()).rejects.toThrow('50 MiB');
  expect(readBackup).not.toHaveBeenCalled();
});
test('a dishonest size cannot bypass the native byte limit and read errors never report success',async()=>{
  jest.replaceProperty(Platform,'OS','android');
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(selected(undefined,1));
  jest.mocked(requireOptionalNativeModule).mockReturnValue({readBackup:jest.fn(async()=>{throw new Error('La copia supera el límite de 50 MiB.');})});
  await expect(pickBackup()).rejects.toThrow('50 MiB');
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  await expect(pickBackup()).rejects.toThrow('lector seguro');
});
