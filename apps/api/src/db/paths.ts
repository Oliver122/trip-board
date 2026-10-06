import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

export const migrationsDir = fileURLToPath(
  new URL('../../drizzle/', import.meta.url),
)
