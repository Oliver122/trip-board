import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import type { AppConfig } from '../config.js'

export type ObjectStorage = {
  put(key: string, body: Buffer): Promise<void>
  delete(key: string): Promise<void>
  get(key: string): Promise<Buffer>
  exists(key: string): Promise<boolean>
  list(): Promise<string[]>
}

/** R-44-05: connect 3 s, request 15 s (uploads of large blobs). */
export const s3Timeouts = {
  connectionTimeout: 3000,
  requestTimeout: 15000,
  // Without this the handler only logs a warning when the timeout passes.
  throwOnRequestTimeout: true,
}

export function s3ClientConfig(config: AppConfig): S3ClientConfig {
  return {
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    },
    requestHandler: { ...s3Timeouts },
  }
}

export function createS3Storage(config: AppConfig): ObjectStorage {
  const client = new S3Client(s3ClientConfig(config))
  const bucket = config.S3_BUCKET
  let ready = false

  async function ensureBucket(): Promise<void> {
    if (ready) return
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
    } catch (error) {
      if (!bucketExists(error)) throw error
    }
    ready = true
  }

  return {
    async put(key, body) {
      await ensureBucket()
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'image/webp',
        }),
      )
    },
    async delete(key) {
      await ensureBucket()
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )
    },
    async get(key) {
      await ensureBucket()
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      )
      if (!result.Body) throw new Error('empty object')
      return Buffer.from(await result.Body.transformToByteArray())
    },
    async exists(key) {
      await ensureBucket()
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch (error) {
        if (isMissing(error)) return false
        throw error
      }
    },
    async list() {
      await ensureBucket()
      const keys: string[] = []
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: token,
          }),
        )
        for (const item of page.Contents ?? []) {
          if (item.Key) keys.push(item.Key)
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return keys
    },
  }
}

function bucketExists(error: unknown): boolean {
  const name = errorName(error)
  return name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists'
}

function isMissing(error: unknown): boolean {
  const name = errorName(error)
  return name === 'NotFound' || name === 'NoSuchKey'
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return String(error.name)
  }
  return ''
}
