import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3107', channel: 'chrome', headless: true },
  webServer: {
    command: 'npm run start -- --port 3107',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
    env: { KSV_DATA_DIR: './.test-data/e2e' },
  },
});
