import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for E2E Testing
 *
 * Runs against real environments (staging/production) - no local servers needed.
 *
 * Environment variables:
 * - E2E_LANDING_URL: Landing page URL (default: https://prmanager.app)
 * - E2E_API_URL: Backend API URL (default: https://api.prmanager.app)
 * - E2E_USER_EMAIL: Test user email
 * - E2E_USER_PASSWORD: Test user password
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
    baseURL: process.env.E2E_LANDING_URL || 'https://prmanager.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
