import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const GOLAZO_ROOT = resolve(__dirname, 'tests/fixtures/golazo');
const GOLAZO_CHANNELS_PATH = resolve(GOLAZO_ROOT, 'channels.yaml');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      GOLAZO_ROOT,
      GOLAZO_CHANNELS_PATH,
      HOME: process.env.HOME ?? '',
      NODE_ENV: 'test',
    },
  },
});
