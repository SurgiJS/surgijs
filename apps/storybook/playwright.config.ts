import { defineConfig, devices } from '@playwright/test';

const PORT = 6007;

/**
 * Runs inside mcr.microsoft.com/playwright (see e2e/docker.sh) so screenshots match on
 * every machine and in CI. Serves the static Storybook build; run `pnpm build` first.
 */
export default defineConfig({
  testDir: 'e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  webServer: {
    command: `node e2e/serve.mjs storybook-static ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.json`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Screenshots come from Chromium only; the other engines run behavior, a11y and SSR.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /visual\.spec/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /visual\.spec/ },
  ],
});
