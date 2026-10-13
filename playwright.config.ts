import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const baseURL = process.env.DAILOOP_TEST_URL ?? 'http://localhost:8793';
const requestedChannel = process.env.DAILOOP_BROWSER_CHANNEL;
const channel = requestedChannel === 'chromium'
  ? undefined
  : requestedChannel ?? (existsSync(chromium.executablePath()) ? undefined : 'msedge');
const serverCommand = process.env.DAILOOP_TEST_SERVER_COMMAND;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: './output/playwright/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: './output/playwright/results.json' }],
    ['html', { outputFolder: './output/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    channel,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    colorScheme: 'light',
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(serverCommand ? {
    webServer: {
      command: serverCommand,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  } : {}),
});
