import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { buildApp } from './app.js'
import { startHousekeeping } from './housekeeping/jobs.js'
import { createS3Storage } from './images/storage.js'

const rootEnv = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../.env',
)
loadDotenv({ path: rootEnv })

export async function start() {
  const config = loadConfig(process.env)
  const pool = createPool(config.DATABASE_URL)
  const storage = createS3Storage(config)
  const app = await buildApp(pool, { config, storage })
  const stopHousekeeping = startHousekeeping(pool, storage, () => new Date(), {
    url: config.ADMIN_DISCORD_WEBHOOK_URL,
  })

  app.addHook('onClose', async () => {
    stopHousekeeping()
    await pool.end()
  })

  await app.listen({ port: config.API_PORT, host: '127.0.0.1' })
  console.log(`API listening on http://127.0.0.1:${config.API_PORT}`)
  return app
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === resolve(entry)) {
  start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}
