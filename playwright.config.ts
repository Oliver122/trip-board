import { defineConfig, devices } from '@playwright/test'

const webPort = Number(process.env.WEB_PORT || 5180)

// Dev login signs in as Sven and flips his stored language, which every other
// spec that signs in as Sven reads. It runs alone, as a teardown after the
// browser's other specs, so the two never overlap.
const devLogin = /dev-login\.spec\.ts/

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate:
    '{testDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
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
      testIgnore: devLogin,
      teardown: 'dev-login-chromium',
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Headless Firefox gets no WebGL context without a GPU, so MapLibre
        // cannot load. Headed under Xvfb gets software GL (see run-e2e-tests).
        headless: !process.env.FIREFOX_HEADED,
        baseURL: `http://127.0.0.1:${webPort}`,
        locale: 'en-US',
      },
      testIgnore: devLogin,
      teardown: 'dev-login-firefox',
      grepInvert: /@chromium/,
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        baseURL: `http://127.0.0.1:${webPort}`,
        locale: 'en-US',
      },
      testIgnore: devLogin,
      teardown: 'dev-login-webkit',
      grepInvert: /@chromium/,
    },
    ...(
      [
        ['chromium', 'Desktop Chrome'],
        ['firefox', 'Desktop Firefox'],
        ['webkit', 'Desktop Safari'],
      ] as const
    ).map(([browser, device]) => ({
      name: `dev-login-${browser}`,
      testMatch: devLogin,
      use: {
        ...devices[device],
        baseURL: `http://127.0.0.1:${webPort}`,
        locale: 'en-US',
      },
    })),
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
