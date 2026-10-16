import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url);
const decode: (text:string)=>string = require('../src/infrastructure/decode-uri.cjs');
test('fixed upstream URI decoder preserves valid Unicode and handles long malformed input',()=>{
  assert.equal(decode('caf%C3%A9+%F0%9F%93%9A'),'café 📚');
  assert.equal(decode('%ZZ'),'%ZZ');
  const malformed='%FF'.repeat(10000);
  assert.equal(decode(malformed),malformed);
});

test('runtime URI decoder handles many distinct malformed runs without cascading escaped literal percent',()=>{
  const encoded=Array.from({length:32_000},(_,index)=>'%FF'+[...index.toString(16).padStart(4,'0')].map(char=>'%'+char.charCodeAt(0).toString(16)).join('')).join('x');
  const expected=Array.from({length:32_000},(_,index)=>'%FF'+index.toString(16).padStart(4,'0')).join('x');
  assert.equal(decode(encoded),expected);
  assert.equal(decode('%25%34%31|%41|%FF'),'%41|A|%FF');
  assert.equal(decode('%FE%FF%41'),'\uFFFD\uFFFDA');
});
