import { S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { createS3Storage, s3ClientConfig } from './storage.js'

describe('s3 timeouts', () => {
  const config = loadConfig({
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://127.0.0.1:5180',
  })

  it('T-44-05 configures a 3 s connection and 15 s request timeout', async () => {
    const client = new S3Client(s3ClientConfig(config))
    // The plain object becomes a NodeHttpHandler; read what it resolved to.
    const handler = client.config.requestHandler as unknown as {
      configProvider: Promise<{
        connectionTimeout?: number
        requestTimeout?: number
        throwOnRequestTimeout?: boolean
      }>
    }
    expect(await handler.configProvider).toMatchObject({
      connectionTimeout: 3000,
      requestTimeout: 15000,
      throwOnRequestTimeout: true,
    })
    expect(() => createS3Storage(config)).not.toThrow()
  })
})
