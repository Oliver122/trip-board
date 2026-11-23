import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { createS3Storage } from './storage.js'
import { createTestStorage, testStoragePrefix } from './test-storage.js'

describe('test storage prefix', () => {
  const config = loadConfig({
    DATABASE_URL: 'postgres://unused',
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://127.0.0.1:5180',
    S3_BUCKET: 'tripboard-test',
  })
  const other = createS3Storage(config, {
    prefix: 'test/other-file.test/',
  })
  const mine = createTestStorage(config, import.meta.url)
  const stray = 'trips/stray/stray.webp'

  afterAll(async () => {
    await other.delete(stray)
    for (const key of await mine.list()) await mine.delete(key)
  })

  // R-48-01
  it('T-48-01 a stray key under another file prefix is invisible to this storage', async () => {
    expect(testStoragePrefix(import.meta.url)).toBe('test/test-storage.test/')
    await other.put(stray, Buffer.from('x'))
    expect(await other.list()).toContain(stray)
    // the cleanup assertion of images.test.ts (T-08-05)
    expect(await mine.list()).toEqual([])
    expect(await mine.exists(stray)).toBe(false)
    await mine.put('trips/a/b.webp', Buffer.from('y'))
    expect(await mine.list()).toEqual(['trips/a/b.webp'])
    expect(await other.list()).not.toContain('trips/a/b.webp')
  })
})
