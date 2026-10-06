import { defineConfig, devices } from '@playwright/test'

const webPort = Number(process.env.WEB_PORT || 5180)

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate:
    '{testDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['blob'], ['github']] : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${webPort}`,
        locale: 'en-US',
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: `http://127.0.0.1:${webPort}`,
        locale: 'en-US',
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'webgl.disabled': false,
            'layers.acceleration.force-enabled': true,
          },
        },
      },
      grepInvert: /@chromium/,
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        baseURL: `http://127.0.0.1:${webPort}`,
        locale: 'en-US',
      },
      grepInvert: /@chromium/,
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
        baseURL: `http://127.0.0.1:${webPort}`,
        locale: 'en-US',
      },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: 'pnpm dev:e2e',
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
