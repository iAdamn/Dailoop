// Temporary source mitigations for the three advisories without patched releases:
// GHSA-vfj7-8cjw-p6xm, GHSA-86w9-cpqp-85rv, GHSA-hp3w-g68c-fv3c.
// Legacy decode-uri-component 0.2.2 delegates to upstream 0.5.0 installed as
// safe-uri-decoder, preserving CommonJS. Its remaining replacement-map fallback
// is also hardened against repeated full-input rescans across distinct runs.
// Keep real package versions/audit findings visible. Re-review on upstream changes.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const depthGuard = `// Dailoop: bound actual recursive AST depth, including caller-supplied ASTs.
exports.MAX_AST_DEPTH = 1024;
exports.assertSafeAst = ast => {
  const ancestors = new Set();
  const pending = [{ node: ast, depth: 1, leave: false }];
  while (pending.length) {
    const { node, depth, leave } = pending.pop();
    if (!node || !node.nodes) continue;
    if (leave) { ancestors.delete(node); continue; }
    if (depth > exports.MAX_AST_DEPTH || ancestors.has(node)) {
      throw new RangeError('Brace AST exceeds safe nesting depth or contains a cycle');
    }
    ancestors.add(node);
    pending.push({ node, depth, leave: true });
    for (let index = node.nodes.length - 1; index >= 0; index--) {
      pending.push({ node: node.nodes[index], depth: depth + 1, leave: false });
    }
  }
};
`;

const sprintfGuard = `
    // Dailoop: resource limits before conversion, callbacks, padding or precision work.
    // Numeric precision matches JavaScript's native e/f/g limits. Generous text
    // bounds permit 1 MiB fields and 16 MiB aggregate literal/padding output.
    function dailoopValidatePlaceholder(width, precision, type) {
        function dimension(value, maximum, minimum) {
            if (value === undefined) return
            var number = Number(value)
            if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
                throw new RangeError('[sprintf] width or precision exceeds safe formatting limits')
            }
        }
        dimension(width, 1048576, 0)
        dimension(precision, /^[efg]$/.test(type) ? 100 : 1048576, type === 'g' ? 1 : 0)
    }
    function dailoopValidateTree(tree) {
        var minimumOutput = 0
        for (var index = 0; index < tree.length; index++) {
            var item = tree[index]
            if (typeof item === 'string') minimumOutput += item.length
            else if (item && typeof item === 'object') {
                dailoopValidatePlaceholder(item.width, item.precision, item.type)
                if (item.type !== 'j') minimumOutput += Number(item.width || 0)
            }
            if (minimumOutput > 16777216) {
                throw new RangeError('[sprintf] aggregate width exceeds safe formatting limits')
            }
        }
    }
`;

const legacyDecoderExport = `module.exports = function (encodedURI) {
\tif (typeof encodedURI !== 'string') {
\t\tthrow new TypeError('Expected \`encodedURI\` to be of type \`string\`, got \`' + typeof encodedURI + '\`');
\t}

\ttry {
\t\tencodedURI = encodedURI.replace(/\\+/g, ' ');

\t\t// Try the built in decoder first
\t\treturn decodeURIComponent(encodedURI);
\t} catch (err) {
\t\t// Fallback to a more advanced decoder
\t\treturn customDecodeURIComponent(encodedURI);
\t}
};`;
const safeDecoderExport = `// Dailoop: the recursive legacy fallback is unreachable through the public API.
// Use the pinned upstream fixed decoder; retain the legacy form-style + contract.
const safeDecodeUriComponent = require('safe-uri-decoder').default;
module.exports = function (encodedURI) {
\tif (typeof encodedURI !== 'string') {
\t\tthrow new TypeError('Expected \`encodedURI\` to be of type \`string\`, got \`' + typeof encodedURI + '\`');
\t}
\treturn safeDecodeUriComponent(encodedURI.replace(/\\+/g, ' '));
};`;

// Both UMD distributions embed their own RSA verifier. Keep their license and
// all unrelated bundle bytes intact; upstream source maps are not regenerated.
const strictForgeBundleCondition = node => `!s.validate(${node},d,o,c)||2!==${node}.value.length||
(1!==${node}.value[0].value.length&&2!==${node}.value[0].value.length)||
(2===${node}.value[0].value.length&&
(${node}.value[0].value[1].tagClass!==s.Class.UNIVERSAL||
${node}.value[0].value[1].type!==s.Type.NULL||
${node}.value[0].value[1].constructed!==false||
${node}.value[0].value[1].value!==""))`;

const decoderFallbackBefore = `function customDecodeURIComponent(input) {
\t// Keep track of all the replacements and prefill the map with the \`BOM\`
\tconst replaceMap = {
\t\t'%FE%FF': '\\uFFFD\\uFFFD',
\t\t'%FF%FE': '\\uFFFD\\uFFFD',
\t};

\t// Find percent-encoded runs separated by literal text or lone \`%\` characters.
\tlet match = multiMatcher.exec(input);

\twhile (match) {
\t\ttry {
\t\t\t// Decode as big chunks as possible
\t\t\treplaceMap[match[0]] = decodeURIComponent(match[0]);
\t\t} catch {
\t\t\tconst result = decode(match[0]);

\t\t\tif (result !== match[0]) {
\t\t\t\treplaceMap[match[0]] = result;
\t\t\t}
\t\t}

\t\tmatch = multiMatcher.exec(input);
\t}

\t// Add \`%C2\` at the end of the map to make sure it does not replace the combinator before everything else
\treplaceMap['%C2'] = '\\uFFFD';

\tconst entries = Object.keys(replaceMap);

\tfor (const key of entries) {
\t\t// Replace all decoded components
\t\tinput = input.replace(new RegExp(key, 'g'), replaceMap[key]);
\t}

\treturn input;
}`;
const decoderFallbackAfter = `function customDecodeURIComponent(input) {
\t// Dailoop: decode each original percent run once; never rescan the complete
\t// input per distinct replacement key or cascade substitutions across runs.
\treturn input.replace(multiMatcher, encodedRun => {
\t\t// Preserve the upstream uppercase BOM replacements and their ordering.
\t\tconst normalized = encodedRun.replace(/%FE%FF/g, '\\uFFFD\\uFFFD')
\t\t\t.replace(/%FF%FE/g, '\\uFFFD\\uFFFD');
\t\t// Keep the iterative decoder and the final uppercase lone-%C2 behavior.
\t\treturn decode(normalized).replace(/%C2/g, '\\uFFFD');
\t});
}`;

const specifications = {
  braces: {
    version: '3.0.3',
    files: {
      'lib/utils.js': ['b5a7596aa67730412b3c029ef09e84e6b67b8e445cffd35d1d295549c89066c7', [
        ["'use strict';\n", "'use strict';\n\n" + depthGuard],
      ]],
      'lib/parse.js': ['e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310', [
        ["const stringify = require('./stringify');", "const stringify = require('./stringify');\nconst { MAX_AST_DEPTH } = require('./utils');"],
        ['  const push = node => {', `  const push = node => {
    // Check the parser's real container stack; quoted/escaped/bracket text is literal.
    if (node.nodes && stack.length >= MAX_AST_DEPTH) {
      throw new RangeError('Brace AST exceeds safe nesting depth');
    }`],
      ]],
      'lib/compile.js': ['dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f', [
        ['const compile = (ast, options = {}) => {', 'const compile = (ast, options = {}) => {\n  utils.assertSafeAst(ast);'],
      ]],
      'lib/expand.js': ['41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7', [
        ['const expand = (ast, options = {}) => {', 'const expand = (ast, options = {}) => {\n  utils.assertSafeAst(ast);'],
      ]],
      'lib/stringify.js': ['379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a', [
        ['module.exports = (ast, options = {}) => {', 'module.exports = (ast, options = {}) => {\n  utils.assertSafeAst(ast);'],
      ]],
    },
  },
  'node-forge': {
    version: '1.4.0',
    files: {
      'lib/rsa.js': ['fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50', [
        ['            obj.value.length !== 2) {', `            obj.value.length !== 2 ||
            // Dailoop: ASN.1 schema validation permits trailing children.
            // DigestAlgorithm is exactly OID, optionally followed by empty NULL.
            (obj.value[0].value.length !== 1 && obj.value[0].value.length !== 2) ||
            (obj.value[0].value.length === 2 &&
              (obj.value[0].value[1].tagClass !== asn1.Class.UNIVERSAL ||
              obj.value[0].value[1].type !== asn1.Type.NULL ||
              obj.value[0].value[1].constructed !== false ||
              obj.value[0].value[1].value !== ''))) {`],
      ]],
      'dist/forge.min.js': ['d9b9074e6861200d676e25dcfe97889db5e8f4150bb766d29c491ad709a51b58', [
        ['!s.validate(n,d,o,c)||2!==n.value.length', strictForgeBundleCondition('n')],
      ]],
      'dist/forge.all.min.js': ['cb9ba4045a81825f8edb646c38d53a1ac30ce07665bf26042c8dea86d7208642', [
        ['!s.validate(a,d,o,c)||2!==a.value.length', strictForgeBundleCondition('a')],
      ]],
    },
  },
  'sprintf-js': {
    version: '1.1.3',
    files: {
      'src/sprintf.js': ['95add43f116385be221745307fae02d06751b01d4f939df1debb17dbe2ebf4eb', [
        ['    var re = {', sprintfGuard + '\n    var re = {'],
        ['    function sprintf_format(parse_tree, argv) {', '    function sprintf_format(parse_tree, argv) {\n        dailoopValidateTree(parse_tree)'],
        ["            else if ((match = re.placeholder.exec(_fmt)) !== null) {", "            else if ((match = re.placeholder.exec(_fmt)) !== null) {\n                dailoopValidatePlaceholder(match[6], match[7], match[8])"],
      ]],
      'dist/sprintf.min.js': ['bcb857eed98349cb9713aea1cdf05561eca5ec7ffed0aa04985ade0af1765980', [
        ['!function(){"use strict";', '!function(){"use strict";' + sprintfGuard],
        ['return function(e,t){var r,n,i,s,a,o,p,c,l,u=1,f=e.length,d="";', 'return function(e,t){dailoopValidateTree(e);var r,n,i,s,a,o,p,c,l,u=1,f=e.length,d="";'],
        ['if(t[2]){i|=1;', 'dailoopValidatePlaceholder(t[6],t[7],t[8]);if(t[2]){i|=1;'],
      ]],
    },
  },
  'decode-uri-component': {
    version: '0.2.2',
    files: {
      'index.js': ['3b8ba0a765e1089d11bba9a919d0d8789ecd9a6833ea078d8d9114e1db093863', [
        [legacyDecoderExport, safeDecoderExport],
      ]],
    },
  },
  // The alias has the same upstream package name. Pin its exact reviewed source
  // and harden its remaining replacement-map fallback without rewriting decode().
  'safe-uri-decoder': {
    version: '0.5.0',
    files: {
      'index.js': ['9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa', [
        [decoderFallbackBefore, decoderFallbackAfter],
      ]],
    },
  },
};

const hash = source => createHash('sha256').update(source).digest('hex');
function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error(`Security patch anchor changed: ${label}`);
  return source.replace(before, after);
}

export function toolingPatchFiles(name) {
  if (!specifications[name]) throw new Error(`Unknown tooling mitigation: ${name}`);
  return Object.keys(specifications[name].files);
}

// Pure transform used by regression tests to stage real dependency code in memory.
export function patchToolingSources(name, version, sources) {
  const specification = specifications[name];
  if (!specification || version !== specification.version) {
    throw new Error(`Review security mitigation before changing ${name}@${version}`);
  }
  const result = new Map();
  for (const [relative, [originalHash, replacements]] of Object.entries(specification.files)) {
    const source = sources.get(relative)?.replace(/\r\n/g, '\n');
    if (source === undefined) throw new Error(`Missing security patch source: ${name}/${relative}`);
    if (hash(source) === originalHash) {
      let patched = source;
      for (const [before, after] of replacements) patched = replaceOnce(patched, before, after, relative);
      result.set(relative, patched);
    } else {
      // An idempotent rerun must reconstruct the exact reviewed original source.
      let restored = source;
      for (const [before, after] of [...replacements].reverse()) {
        restored = replaceOnce(restored, after, before, relative);
      }
      if (hash(restored) !== originalHash) throw new Error(`Security patch source changed: ${name}/${relative}`);
      result.set(relative, source);
    }
  }
  return result;
}

export async function applyToolingSecurityPatches(root) {
  const packages = [];
  async function scanModules(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const folder = path.join(directory, entry.name);
      if (entry.name.startsWith('@')) { await scanScope(folder); continue; }
      await inspectPackage(folder);
    }
  }
  async function scanScope(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await inspectPackage(path.join(directory, entry.name));
    }
  }
  async function inspectPackage(folder) {
    let manifest;
    try { manifest = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (manifest) {
      const patchName = path.basename(folder) === 'safe-uri-decoder' && manifest.name === 'decode-uri-component'
        ? 'safe-uri-decoder' : manifest.name;
      if (specifications[patchName]) packages.push({ folder, ...manifest, patchName });
    }
    await scanModules(path.join(folder, 'node_modules'));
  }
  await scanModules(path.join(root, 'node_modules'));
  for (const name of Object.keys(specifications)) {
    if (!packages.some(pkg => pkg.patchName === name)) throw new Error(`Missing security dependency: ${name}`);
  }
  const pending = [];
  // Validate the complete installed tree before writing any package file.
  for (const pkg of packages) {
    const sources = new Map();
    for (const relative of toolingPatchFiles(pkg.patchName)) {
      sources.set(relative, await readFile(path.join(pkg.folder, relative), 'utf8'));
    }
    for (const [relative, source] of patchToolingSources(pkg.patchName, pkg.version, sources)) {
      if (source !== sources.get(relative)) pending.push([path.join(pkg.folder, relative), source]);
    }
  }
  for (const [file, source] of pending) await writeFile(file, source, 'utf8');
  console.log(`Tooling security mitigations verified for ${packages.length} installed packages (${pending.length} files updated). Upstream audit advisories remain visible.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await applyToolingSecurityPatches(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
