import {Platform} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import {shareText,copyText} from '../src/infrastructure/files';
import {uuid} from '../src/infrastructure/crypto';

const mockFiles=new Map<string,string>();
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
