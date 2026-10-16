import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output/verification/v0.5.0/sync/rules');
const cli = path.join(root, 'output/tooling/firebase-tools/node_modules/firebase-tools/lib/bin/firebase.js');
const config = path.join(root, 'firebase/emulator.json');
const javaHome = process.env.DAILOOP_RULES_JAVA_HOME ?? 'C:/Program Files/Eclipse Adoptium/jdk-17.0.14.7-hotspot';
if (!existsSync(cli) || !existsSync(path.join(javaHome, 'bin/java.exe'))) throw new Error('Install isolated Firebase CLI 14.26.0 and provide a compatible JDK first.');
const cliVersion = JSON.parse(readFileSync(path.join(root, 'output/tooling/firebase-tools/node_modules/firebase-tools/package.json'), 'utf8')).version;
if (cliVersion !== '14.26.0') throw new Error('The verified launcher requires pinned Firebase CLI 14.26.0.');
for (const port of [9099, 8088, 4408, 4508, 9158]) {
  await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', () => reject(new Error(`Refusing to reuse occupied emulator port ${port}`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
mkdirSync(output, { recursive: true });
const toolConfig = path.join(root, 'output/tooling/firebase-tools/config'); mkdirSync(toolConfig, { recursive: true });
const emulatorCache = path.join(root, 'output/tooling/firebase-tools/emulators'); mkdirSync(emulatorCache, { recursive: true });
const environment = { ...process.env, JAVA_HOME: javaHome, PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`, CI: '1', FIREBASE_CLI_DISABLE_AUTOUPDATE: 'true', FIREBASE_EMULATORS_PATH: emulatorCache, XDG_CONFIG_HOME: toolConfig, GCLOUD_PROJECT: 'demo-dailoop-sync', DAILOOP_RULES_EMULATOR: '1' };
// Do not pass unrelated cloud credentials to isolated demo processes.
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'GOOGLE_OAUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN']) delete environment[key];
const testCommand = `"${process.execPath}" "${path.join(root, 'node_modules/tsx/dist/cli.mjs')}" --test "${path.join(root, 'tests/sync-rules.test.ts')}" "${path.join(root, 'tests/v070-deletion-rules.test.ts')}"`;
const args = [cli, 'emulators:exec', '--only', 'auth,firestore', '--project', 'demo-dailoop-sync', '--config', config, '--non-interactive', testCommand];
const logFile = path.join(output, 'emulator-test.log'); const chunks = [];
const startedAt = new Date().toISOString();
const child = spawn(process.execPath, args, { cwd: output, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { const text = data.toString(); chunks.push(text); process.stdout.write(text); });
const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
writeFileSync(logFile, chunks.join(''));
writeFileSync(path.join(output, 'result.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), project: 'demo-dailoop-sync', endpoints: { firestore: '127.0.0.1:8088', auth: '127.0.0.1:9099' }, firebaseCli: cliVersion, rulesSha256: createHash('sha256').update(readFileSync(path.join(root, 'firebase/firestore.rules'))).digest('hex'), exitCode, productionAccess: false }, null, 2));
process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
