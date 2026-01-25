import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for E2E Testing
 * Simplified: Chromium only, minimal retries
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: [
    {
      command: 'npm run dev -w @pr-manager/landing',
      port: 3000,
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -w @pr-manager/backend',
      port: 3001,
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/prmanager',
        JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-for-e2e',
        DOWNLOAD_SECRET: process.env.DOWNLOAD_SECRET || 'test-download-secret-for-e2e',
      },
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
