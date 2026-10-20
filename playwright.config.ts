import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the built app (vite preview), in two viewports:
 * a 360px-wide phone (NFR-UX-001) and a regular desktop.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Like a Norwegian user's browser: native date inputs then show dd.mm.åååå.
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobil-360',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -w @smartmat/web',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
