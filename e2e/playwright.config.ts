import { defineConfig, devices } from '@playwright/test';

const iphone = { ...(devices['iPhone 14 Pro'] ?? devices['iPhone 13']), viewport: { width: 393, height: 852 } };

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...iphone,
    browserName: process.env.PW_BROWSER === 'chromium' ? 'chromium' : 'webkit',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    cwd: '..',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
