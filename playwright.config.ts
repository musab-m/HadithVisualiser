import { defineConfig, devices } from '@playwright/test';

/**
 * The suite runs against the built site, not the dev server: `dist/` is what
 * gets deployed, and a bundling or base-path mistake only shows up there.
 *
 * Timeouts are generous on purpose. The whole corpus is 49,823 chains through
 * 8,084 narrators, and the first layout is a real force relaxation; on a CI
 * runner without a GPU, WebGL falls back to software rasterisation and frames
 * take hundreds of milliseconds. A tight timeout here fails on machine speed
 * rather than on the site being broken.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: 'npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
