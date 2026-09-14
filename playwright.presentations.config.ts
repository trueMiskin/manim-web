import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  testMatch: 'presentations.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.MANIM_PRESENTATION_TEST_URL ?? 'http://127.0.0.1:5181',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: process.env.MANIM_PRESENTATION_TEST_URL
    ? undefined
    : {
        command:
          'npx vite --config tests/integration/vite.presentations.config.ts --host 127.0.0.1 --port 5181 --strictPort',
        url: 'http://127.0.0.1:5181/examples/presentations/basic/',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
