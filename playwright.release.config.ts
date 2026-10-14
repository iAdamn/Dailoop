import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import config from './app.json';

export default defineConfig(base, {
  testMatch: ['navigation.spec.ts', 'app.spec.ts', 'v015.spec.ts', 'offline.spec.ts'],
  outputDir: `./output/verification/v${config.expo.version}/web-tests`,
  reporter: [['list'], ['json', { outputFile: `./output/verification/v${config.expo.version}/web-report.json` }]],
  use: { baseURL: 'http://localhost:8795' },
});
