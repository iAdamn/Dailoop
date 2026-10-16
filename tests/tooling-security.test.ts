import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generateKeyPairSync, privateEncrypt, constants } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = process.cwd();
const requireModule = createRequire(path.join(root, 'package.json'));
let patchModule: {
  toolingPatchFiles: (name: string) => string[];
  patchToolingSources: (name: string, version: string, sources: Map<string, string>) => Map<string, string>;
};
before(async () => {
  patchModule = await import(pathToFileURL(path.join(root, 'scripts/patch-tooling-security.mjs')).href);
});

function packageDirectory(name: string) {
  // The fixed ESM alias restricts package.json access through its exports map.
  return path.dirname(requireModule.resolve(name === 'safe-uri-decoder' ? name : name + '/package.json'));
}

function stagedSources(name: string) {
  const directory = packageDirectory(name);
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const sources = new Map<string, string>();
  for (const relative of patchModule.toolingPatchFiles(name)) {
    sources.set(relative, readFileSync(path.join(directory, relative), 'utf8'));
  }
  const patched: Map<string, string> = patchModule.patchToolingSources(name, manifest.version, sources);
  return { directory, manifest, sources, patched };
}

// Load the actual package and real collaborators, replacing only reviewed source
// files in memory. An independent cache also keeps forge's mutable module graph isolated.
function loadPackage(name: string, patched: Map<string, string>, entry?: string, dependencies: Record<string, unknown> = {}) {
  const directory = packageDirectory(name);
  const cache = new Map<string, { exports: unknown }>();
  function load(filename: string): unknown {
    if (!filename.startsWith(directory + path.sep)) return requireModule(filename);
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const record = { exports: {} as unknown };
    cache.set(filename, record);
    if (filename.endsWith('.json')) {
      record.exports = JSON.parse(readFileSync(filename, 'utf8'));
    } else {
      const localRequire = createRequire(filename);
      const relative = path.relative(directory, filename).split(path.sep).join('/');
      let source = patched.get(relative) ?? readFileSync(filename, 'utf8');
      if (name === 'safe-uri-decoder' && relative === 'index.js') {
        // This ESM module has one export and no imports. Stage its real function
        // body through the equivalent CommonJS namespace for the legacy bridge.
        source = source.replace('export default function decodeUriComponent', 'module.exports.default = function decodeUriComponent');
      }
      new Function('require', 'module', 'exports', '__filename', '__dirname', source)(
        (specifier: string) => Object.hasOwn(dependencies, specifier) ? dependencies[specifier] : load(localRequire.resolve(specifier)), record, record.exports, filename, path.dirname(filename),
      );
    }
    return record.exports;
  }
  return load(entry ? path.join(directory, entry) : requireModule.resolve(name)) as ReturnType<NodeJS.Require>;
}

test('security patches are exact, version checked, idempotent and fail closed on source changes', () => {
  for (const name of ['braces', 'node-forge', 'sprintf-js', 'decode-uri-component', 'safe-uri-decoder']) {
    const { manifest, sources, patched } = stagedSources(name);
    assert.deepEqual(patchModule.patchToolingSources(name, manifest.version, patched), patched);
    assert.throws(() => patchModule.patchToolingSources(name, '999.0.0', sources), /Review security mitigation/);
    for (const relative of patched.keys()) {
      const altered = new Map(patched);
      altered.set(relative, patched.get(relative) + '\n// Unexpected upstream/local change.\n');
      assert.throws(() => patchModule.patchToolingSources(name, manifest.version, altered), /Security patch (?:source|anchor) changed/);
    }
  }
});

test('legacy CommonJS decoder delegates to verified upstream fix and preserves query-string behavior', () => {
  const { patched } = stagedSources('decode-uri-component');
  const fixed = stagedSources('safe-uri-decoder');
  assert.match(fixed.patched.get('index.js')!, /input\.replace\(multiMatcher, encodedRun =>/);
  const fixedModule = loadPackage('safe-uri-decoder', fixed.patched);
  const decode = loadPackage('decode-uri-component', patched, undefined, { 'safe-uri-decoder': fixedModule }) as (value: unknown) => string;
  for (const [encoded, expected] of [
    ['hello+world%2Bnext', 'hello world+next'],
    ['caf%C3%A9%20%F0%9F%8C%8D', 'café 🌍'],
    ['%E4%BD%A0%E5%A5%BD', '你好'],
    ['', ''], ['%00', '\0'], ['%FE%FF', '\uFFFD\uFFFD'], ['%FF%FE', '\uFFFD\uFFFD'], ['%C2', '\uFFFD'],
    ['%E0%A4%A', '%E0%A4%A'], ['literal%GG+text', 'literal%GG text'],
    ['%EF%BB%BF', '\uFEFF'], ['%FE%FF%41', '\uFFFD\uFFFDA'],
    ['%fe%ff', '%fe%ff'], ['%c2', '%c2'], ['%C2%A9|%C2|%c2', '©|\uFFFD|%c2'],
    ['%25FE%25FF|%FF', '%FE%FF|%FF'], ['literal%|%41%FF|%C3%A9', 'literal%|A%FF|é'],
    // Original map substitutions could decode another run's escaped percent a
    // second time. Each original run now decodes once even if other runs exist.
    ['%25%34%31|%41|%FF', '%41|A|%FF'],
  ]) assert.equal(decode(encoded), expected);
  for (const value of [undefined, null, 42, {}, [], true]) {
    assert.throws(() => decode(value), TypeError);
    assert.throws(() => decode(value), /Expected `encodedURI` to be of type `string`/);
  }
  const queryString = loadPackage('query-string', new Map(), undefined, { 'decode-uri-component': decode });
  assert.deepEqual({ ...queryString.parse('name=caf%C3%A9+%F0%9F%8C%8D&tag=a&tag=b&empty=&flag') }, {
    empty: '', flag: null, name: 'café 🌍', tag: ['a', 'b'],
  });
  assert.deepEqual({ ...queryString.parse('escaped%20key=%2B+%26&raw=%FF') }, { 'escaped key': '+ &', raw: '%FF' });
  assert.deepEqual({ ...queryString.parse('literal=a+b%20c', { decode: false }) }, { literal: 'a+b%20c' });
  assert.equal(queryString.stringify({ greeting: 'café 🌍', plus: '+' }), 'greeting=caf%C3%A9%20%F0%9F%8C%8D&plus=%2B');
  // The former recursive fallback overflowed or did superlinear work on runs of
  // invalid UTF-8. These real long malformed inputs must complete normally.
  const invalid = '%FF'.repeat(30_000);
  assert.equal(decode(invalid), invalid);
  const mixed = '%FF%41'.repeat(10_000);
  assert.equal(decode(mixed), '%FFA'.repeat(10_000));
  assert.equal(queryString.parse('value=' + invalid).value, invalid);
  // Count characters passed to replacement operations in an isolated realm.
  // This directly bounds repeated whole-input work without a timing threshold.
  const instrumented = { exports: {} as { default?: (input: string) => string } };
  const context = { module: instrumented, exports: instrumented.exports, replacementWork: 0 };
  const source = fixed.patched.get('index.js')!.replace('export default function decodeUriComponent', 'module.exports.default = function decodeUriComponent');
  runInNewContext(`const originalReplace = String.prototype.replace;
String.prototype.replace = function (...args) {
  globalThis.replacementWork += this.length;
  return originalReplace.apply(this, args);
};\n` + source, context);
  const texts = Array.from({ length: 32_000 }, (_, index) => index.toString(16).padStart(4, '0'));
  const distinctRuns = texts.map(text => [...text].map(character => '%' + character.charCodeAt(0).toString(16)).join('') + '%FF').join('|');
  assert.equal(instrumented.exports.default!(distinctRuns), texts.map(text => text + '%FF').join('|'));
  assert.ok(context.replacementWork <= distinctRuns.length * 8, 'Replacement work must stay linear across distinct malformed runs');
});

test('braces preserves valid expansion, ranges, malformed text and large literal patterns', () => {
  const { patched } = stagedSources('braces');
  const braces = loadPackage('braces', patched);
  assert.deepEqual(braces.expand('src/{domain,ui}/{a,b}.ts'), ['src/domain/a.ts', 'src/domain/b.ts', 'src/ui/a.ts', 'src/ui/b.ts']);
  assert.deepEqual(braces.expand('{01..03}'), ['01', '02', '03']);
  assert.equal(braces.compile('a/{b,c}/d'), 'a/(b|c)/d');
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
  assert.deepEqual(braces.expand('a{b'), ['a{b']);
  for (const literal of ['\\{'.repeat(4000), '"' + '{'.repeat(4000) + '"', '[' + '{'.repeat(4000) + ']']) {
    assert.doesNotThrow(() => braces.compile(literal));
    assert.doesNotThrow(() => braces.expand(literal));
  }
  const deepValid = '{'.repeat(1000) + 'a,b' + '}'.repeat(1000);
  assert.equal(braces.expand(deepValid).length, 2);
  assert.equal(typeof braces.compile(deepValid), 'string');
});

test('braces bounds real parser nesting and every recursive public/deep-import AST entry', () => {
  const { patched } = stagedSources('braces');
  const braces = loadPackage('braces', patched);
  const attack = '{'.repeat(4998) + 'a,b' + '}'.repeat(4998);
  assert.ok(attack.length < 10_000, 'Original character guard accepts the attack');
  for (const method of ['parse', 'compile', 'expand', 'stringify', 'create']) {
    assert.throws(() => braces[method](attack), /safe nesting depth/, method);
  }
  assert.throws(() => braces(attack), /safe nesting depth/);
  assert.throws(() => braces(['{a,b}', attack], { expand: true }), /safe nesting depth/);
  const mixed = '({'.repeat(1000) + 'a,b' + '})'.repeat(1000);
  assert.throws(() => braces.parse(mixed), /safe nesting depth/);
  type Ast = { type: string; nodes: Ast[] };
  let ast: Ast = { type: 'root', nodes: [] };
  for (let index = 0; index < 5000; index++) ast = { type: 'root', nodes: [ast] };
  const cycle: Ast = { type: 'root', nodes: [] };
  cycle.nodes.push(cycle);
  for (const method of ['compile', 'expand', 'stringify']) {
    for (const input of [ast, cycle]) {
      assert.throws(() => braces[method](input), /safe nesting depth|cycle/, method);
      const direct = loadPackage('braces', patched, 'lib/' + method + '.js');
      assert.throws(() => direct(input), /safe nesting depth|cycle/, 'deep import ' + method);
    }
  }
});

test('forge source and both UMD bundles accept legitimate signatures and reject malformed AlgorithmIdentifier values', () => {
  const { patched } = stagedSources('node-forge');
  const implementations = [loadPackage('node-forge', patched)];
  for (const relative of ['dist/forge.min.js', 'dist/forge.all.min.js']) {
    for (const mode of ['commonjs', 'browser', 'amd']) {
      const window: Record<string, unknown> = {};
      const module = { exports: {} as unknown };
      let amd: unknown;
      const define = Object.assign((_dependencies: string[], factory: () => unknown) => { amd = factory(); }, { amd: true });
      // forge.all additionally exposes jQuery-backed form/xhr helpers. They are
      // irrelevant to cryptography; an explicitly absent jQuery allows loading.
      const base = { window, jQuery: null, setTimeout, clearTimeout };
      const context = mode === 'commonjs' ? { ...base, module, exports: module.exports, require: requireModule, process, Buffer }
        : mode === 'amd' ? { ...base, define } : base;
      runInNewContext(patched.get(relative)!, context);
      const forge = mode === 'commonjs' ? module.exports : mode === 'amd' ? amd : window.forge;
      assert.ok(forge, relative + ' ' + mode);
      implementations.push(forge);
    }
  }
  const keys = generateKeyPairSync('rsa', { modulusLength: 1024 });
  for (const forge of implementations) {
    const publicKey = forge.pki.publicKeyFromPem(keys.publicKey.export({ type: 'spki', format: 'pem' }));
    const a = forge.asn1;
    const nullNode = () => a.create(a.Class.UNIVERSAL, a.Type.NULL, false, '');
    for (const algorithm of ['sha256', 'md5']) {
      const digest = forge.md[algorithm].create().update('legitimate signature control').digest().getBytes();
      function signature(parameters: unknown[], extraOuter = false) {
        const identifier = a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
          a.create(a.Class.UNIVERSAL, a.Type.OID, false, a.oidToDer(forge.oids[algorithm]).getBytes()), ...parameters,
        ]);
        const children = [identifier, a.create(a.Class.UNIVERSAL, a.Type.OCTETSTRING, false, digest)];
        if (extraOuter) children.push(nullNode());
        const der = a.toDer(a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, children)).getBytes();
        const padded = Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(128 - der.length - 3, 255), Buffer.from([0]), Buffer.from(der, 'binary')]);
        return privateEncrypt({ key: keys.privateKey, padding: constants.RSA_NO_PADDING }, padded).toString('binary');
      }
      assert.equal(publicKey.verify(digest, signature([nullNode()])), true, algorithm + ' + NULL');
      if (algorithm === 'sha256') assert.equal(publicKey.verify(digest, signature([])), true, 'SHA256 omitted NULL');
      else assert.throws(() => publicKey.verify(digest, signature([])), /Missing algorithm identifier NULL/);
      assert.equal(publicKey.verify('wrong digest', signature([nullNode()])), false);
      for (const parameters of [
        [nullNode(), nullNode()],
        [a.create(a.Class.UNIVERSAL, a.Type.OCTETSTRING, false, 'extra')],
        [a.create(a.Class.UNIVERSAL, a.Type.NULL, false, 'nonempty')],
        [a.create(a.Class.UNIVERSAL, a.Type.NULL, true, [nullNode()])],
        [nullNode(), a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [nullNode()])],
      ]) {
        assert.throws(() => publicKey.verify(digest, signature(parameters)), /valid RSASSA-PKCS1-v1_5/);
      }
      assert.throws(() => publicKey.verify(digest, signature([nullNode()], true)), /valid RSASSA-PKCS1-v1_5/);
    }
  }
});

test('sprintf source and bundled/browser/AMD entries preserve valid formatting and reject resource abuse before callbacks', () => {
  const { patched } = stagedSources('sprintf-js');
  type Sprintf = { sprintf: (...args: unknown[]) => string; vsprintf: (format: string, args: unknown[]) => string };
  const implementations: Sprintf[] = [loadPackage('sprintf-js', patched), loadPackage('sprintf-js', patched, 'dist/sprintf.min.js')];
  for (const relative of ['src/sprintf.js', 'dist/sprintf.min.js']) {
    const window = {} as Sprintf;
    let amd: Sprintf | undefined;
    const define = Object.assign((factory: () => Sprintf) => { amd = factory(); }, { amd: true });
    runInNewContext(patched.get(relative)!, { window, define });
    implementations.push(window, amd!);
  }
  for (const { sprintf, vsprintf } of implementations) {
    assert.equal(sprintf('Hello %s %04d %.2f', 'world', 7, 1.25), 'Hello world 0007 1.25');
    assert.equal(sprintf('%2$s/%1$s', 'a', 'b'), 'b/a');
    assert.equal(vsprintf('%(item)5s', [{ item: 'x' }]), '    x');
    assert.equal(sprintf('%+08.2f', 12.5), '+0012.50');
    assert.equal(sprintf('%.0f', 2), '2');
    assert.equal(sprintf('%.0e', 2), '2e+0');
    assert.equal(sprintf('%.0s', 'text'), '');
    assert.equal(sprintf('%.100f', 1).length, 102);
    assert.equal(sprintf('%1048576s', 'x').length, 1048576);
    assert.equal(sprintf('%.1048576s', 'text'), 'text');
    assert.equal(sprintf('%j', { item: 'x' }), '{"item":"x"}');
    assert.equal(sprintf('%t %T %v', true, [], 'value'), 'true array value');
    let calls = 0;
    const argument = () => { calls++; return 1; };
    for (const format of [
      '%999999999999s', '%1048577s', '%.999999999999f', '%.101f', '%.101e', '%.101g', '%.0g',
      '%.1048577s', '%.1048577t', '%.1048577T', '%.1048577v', '%999999999999j',
      '%999999999999b', '%999999999999d', '%999999999999x',
    ]) {
      assert.throws(() => sprintf(format, argument), /safe formatting limits/, format);
      assert.throws(() => vsprintf(format, [argument]), /safe formatting limits/, 'vsprintf ' + format);
    }
    assert.equal(calls, 0, 'Invalid dimensions rejected before an argument callback executes');
    // Repeated fields must not turn a per-field bound into an unbounded allocation.
    assert.throws(() => sprintf('%1048576s'.repeat(17), ...Array(17).fill(argument)), /aggregate width/);
    assert.equal(calls, 0);
    // Cached parse trees go through the same formatter validation on every call.
    assert.equal(sprintf('%12s', 'first'), '       first');
    assert.equal(sprintf('%12s', 'second'), '      second');
  }
});
