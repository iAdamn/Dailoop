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
