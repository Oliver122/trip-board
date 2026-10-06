import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vitest/config'

loadDotenv({ path: new URL('../../.env', import.meta.url) })

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: true,
  },
})
