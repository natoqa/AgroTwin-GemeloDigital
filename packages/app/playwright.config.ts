import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

/**
 * The end-to-end suite runs against the **production build**, never the dev
 * server: `vite-plugin-pwa` emits no service worker in dev, so an offline test
 * against `vite dev` would be testing nothing.
 *
 * The build happens in the `test:e2e` script, and the HTTP server is started
 * by the spec itself rather than by Playwright, because the offline test has
 * to stop it mid-run.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  // A low-end phone in portrait is the only shape that matters here.
  projects: [{ name: 'android-chrome', use: { ...devices['Pixel 7'] } }],
});
