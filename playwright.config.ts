import { defineConfig, devices } from '@playwright/test'

const webPort = Number(process.env.WEB_PORT || 5180)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${webPort}`,
    locale: 'en-US',
  },
  webServer: {
    command: 'pnpm dev:e2e',
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
