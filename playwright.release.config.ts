import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import config from './app.json';
import path from 'node:path';

const evidenceRoot=process.env.DAILOOP_VERIFY_OUTPUT ?? `./output/verification/v${config.expo.version}`;
const relativeEvidence=path.relative(path.resolve('output/verification'),path.resolve(evidenceRoot));
if(!relativeEvidence || relativeEvidence.startsWith('..') || path.isAbsolute(relativeEvidence))throw new Error('Web evidence must stay inside output/verification.');

export default defineConfig(base, {
  testMatch: ['navigation.spec.ts', 'app.spec.ts', 'v015.spec.ts', 'v050.spec.ts', 'offline.spec.ts', 'planning.spec.ts', 'flash-polish.spec.ts', 'languages.spec.ts', 'sync.spec.ts', 'v070.spec.ts', 'v070-account-site.spec.ts'],
  outputDir: path.join(evidenceRoot,'web-tests'),
  reporter: [['list'], ['json', { outputFile: path.join(evidenceRoot,'web-report.json') }]],
  use: { baseURL: 'http://localhost:8795' },
});
