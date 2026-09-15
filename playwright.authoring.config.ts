import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  testMatch: 'authoring.spec.ts',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.MANIM_AUTHORING_TEST_URL ?? 'http://127.0.0.1:5182',
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
  ],
  webServer: process.env.MANIM_AUTHORING_TEST_URL
    ? undefined
    : {
        command:
          'npx vite --config tests/integration/vite.presentations.config.ts --host 127.0.0.1 --port 5182 --strictPort',
        url: 'http://127.0.0.1:5182/tests/integration/authoring.html',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
