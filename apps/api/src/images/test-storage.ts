import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig } from '../config.js'
import { createS3Storage, type ObjectStorage } from './storage.js'

/** R-48-01: key prefix of one test file, e.g. `test/images.test/`. */
export function testStoragePrefix(fileUrl: string): string {
  return `test/${basename(fileURLToPath(fileUrl)).replace(/\.ts$/, '')}/`
}

/** Storage that only sees its own file's prefix in the shared bucket. */
export function createTestStorage(
  config: AppConfig,
  fileUrl: string,
): ObjectStorage {
  return createS3Storage(config, { prefix: testStoragePrefix(fileUrl) })
}
